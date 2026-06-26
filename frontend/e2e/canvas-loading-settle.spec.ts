import { test, expect, type Page } from '@playwright/test'

async function registerAndLogin(page: Page, email: string, password: string) {
  await page.goto('/register')
  await page.locator('#register-email').fill(email)
  await page.locator('#register-password').fill(password)
  await page.locator('#register-confirm-password').fill(password)
  const loginResponse = page.waitForResponse(
    (resp) => resp.url().includes('/api/auth/jwt/login') && resp.status() === 204,
  )
  await page.getByRole('button', { name: '회원가입' }).click()
  await loginResponse
  await page.waitForURL((url) => url.pathname === '/')
}

test.describe('Canvas loading overlay settle', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies()
  })

  test('로딩 오버레이는 캔버스 라우팅이 settle된 뒤에 사라진다(재그림 없음)', async ({ page }) => {
    const email = `settle-${Date.now()}@example.com`
    await registerAndLogin(page, email, 'password123')

    // FK가 있는 프로젝트를 API로 생성 — edge-path.spec.ts의 API 시드 패턴과 동일.
    const dbml = [
      'Table users {',
      '  id integer [pk]',
      '}',
      'Table posts {',
      '  id integer [pk]',
      '  user_id integer [ref: > users.id]',
      '}',
    ].join('\n')
    const layout = {
      version: 1,
      positions: {
        'public.users': { x: 0, y: 0 },
        'public.posts': { x: 500, y: 0 },
      },
    }
    const resp = await page.request.post('/api/projects', {
      data: { name: 'Settle E2E', dbml_text: dbml, layout },
    })
    expect(resp.status()).toBe(201)
    const { id } = await resp.json()

    await page.goto(`/editor/${id}`)

    // 캔버스가 완전히 렌더링될 때까지 대기 — 기존 edge-path.spec.ts의 패턴과 동일.
    // 오버레이(canvas-loading-overlay)는 onCanvasReady(=모든 카드 measured + rAF×2 +
    // fitView) 이후에야 닫히므로, 엣지가 보인다는 것은 오버레이가 이미 닫혔음을 뜻한다.
    await expect
      .poll(async () => page.locator('.react-flow__edge path').count(), { timeout: 15_000 })
      .toBeGreaterThan(0)

    // 오버레이가 실제로 닫혔는지 명시적으로 확인 (이미 detached이므로 즉시 통과).
    // settle 전에 닫힌 구현이었다면 이 시점에도 오버레이가 남아 있을 수 있다.
    const overlay = page.getByTestId('canvas-loading-overlay')
    await overlay.waitFor({ state: 'detached', timeout: 5_000 })

    // 오버레이가 사라진 직후의 엣지 경로 스냅샷.
    const edgePaths = () =>
      page.$$eval('.react-flow__edge path', (ps) => ps.map((p) => p.getAttribute('d') ?? ''))

    const before = await edgePaths()
    expect(before.length).toBeGreaterThan(0) // 엣지가 그려져 있어야 의미가 있다

    // 두 애니메이션 프레임을 흘려보낸다 — settle이 끝났다면 경로는 그대로여야 한다.
    await page.evaluate(
      () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
    )

    const after = await edgePaths()

    expect(after).toEqual(before) // 오버레이 제거 후 재라우팅(재그림)이 없어야 한다
  })
})
