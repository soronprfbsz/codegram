import { test, expect, type Page } from '@playwright/test'

async function registerAndLogin(page: Page, email: string, password: string) {
  await page.goto('/register')
  await page.locator('#register-email').fill(email)
  await page.locator('#register-password').fill(password)
  await page.locator('#register-confirm-password').fill(password)
  const loginResponse = page.waitForResponse(
    (resp) => resp.url().includes('/api/auth/jwt/login') && resp.status() === 204,
  )
  await page.getByRole('button', { name: 'Sign up' }).click()
  await loginResponse
  await page.waitForURL((url) => url.pathname === '/')
}

/**
 * 엣지의 '경로 위' 한 점을 클릭한다. `.react-flow__edge` bbox 중심 클릭은 ㄱ자
 * 경로에서 빈 공간(→ onPaneClick → 선택 해제)일 수 있고, 단순 getPointAtLength(½)
 * 중점도 이 레이아웃에선 source 카드 위에 겹쳐 노드가 대신 선택된다(실측). 그래서
 * 경로를 따라 촘촘히 샘플링하며 elementFromPoint가 `.react-flow__edge`(20px
 * 인터랙션 스트로크)로 해석되는 — 즉 노드에 가리지 않은 — 첫 점을 골라 클릭한다.
 */
async function clickEdgeMidpoint(page: Page) {
  const pt = await page
    .locator('.react-flow__edge-path')
    .first()
    .evaluate((el) => {
      const p = el as SVGPathElement
      const total = p.getTotalLength()
      const c = p.getScreenCTM()!
      const toScreen = (m: DOMPoint) => ({
        x: c.a * m.x + c.c * m.y + c.e,
        y: c.b * m.x + c.d * m.y + c.f,
      })
      // 중앙부부터 바깥으로 샘플링: 가능하면 가운데 세그먼트를 잡되, 노드에
      // 가린 점은 건너뛴다.
      for (let d = 0; d <= 0.45; d += 0.02) {
        for (const f of d === 0 ? [0.5] : [0.5 + d, 0.5 - d]) {
          const s = toScreen(p.getPointAtLength(total * f))
          const hit = document.elementFromPoint(s.x, s.y)
          if (hit && hit.closest('.react-flow__edge')) return s
        }
      }
      // 폴백: 노드에 가려 깨끗한 점이 없으면 기하학적 중점.
      const m = toScreen(p.getPointAtLength(total / 2))
      return m
    })
  await page.mouse.click(pt.x, pt.y)
}

/**
 * 드래그 가능한 세그먼트 핸들 하나를 화면 좌표 + 방향과 함께 고른다. 첫 번째
 * `edge-seg-0`는 이 레이아웃에서 source 카드(HTML 노드 레이어)에 가려 핸들
 * circle 대신 노드의 span이 잡힌다 — pointerdown이 핸들로 안 들어가 수동 경로가
 * 만들어지지 않는다(실측). 그래서 circle 중심에서 elementFromPoint가 자기 자신
 * (data-testid 일치)으로 해석되는 — 노드에 가리지 않은 — 핸들을 고른다.
 * orientation은 cursor(ns/ew-resize) 대신 인접 두 점 좌표로 직접 판정해 수직/
 * 수평을 가리고, 드래그는 세그먼트에 **수직**으로 줘야 경로가 실제로 휜다.
 */
async function pickDraggableHandle(
  page: Page,
): Promise<{ x: number; y: number; horizontal: boolean }> {
  const found = await page
    .locator('[data-testid^="edge-seg-"]')
    .evaluateAll((els) => {
      for (const raw of els) {
        const el = raw as SVGCircleElement
        const ctm = el.getScreenCTM()
        if (!ctm) continue
        const ucx = parseFloat(el.getAttribute('cx') ?? 'NaN')
        const ucy = parseFloat(el.getAttribute('cy') ?? 'NaN')
        const sx = ctm.a * ucx + ctm.c * ucy + ctm.e
        const sy = ctm.b * ucx + ctm.d * ucy + ctm.f
        const hit = document.elementFromPoint(sx, sy)
        if (
          hit &&
          hit.getAttribute('data-testid') === el.getAttribute('data-testid')
        ) {
          // 세그먼트 방향: cursor 스타일 ns-resize=수평 세그먼트, ew-resize=수직.
          const cursor = (el as unknown as SVGElement).style.cursor
          return { x: sx, y: sy, horizontal: cursor === 'ns-resize' }
        }
      }
      return null
    })
  if (!found)
    throw new Error('no unoccluded segment handle found to drag')
  return found
}

async function createProjectWithRef(page: Page): Promise<string> {
  const createResponse = page.waitForResponse(
    (resp) =>
      resp.url().includes('/api/projects') &&
      resp.request().method() === 'POST' &&
      resp.status() === 201,
  )
  await page.getByPlaceholder('Project name').fill('Edge Path Project')
  await page.getByRole('button', { name: 'Create' }).click()
  const created = await (await createResponse).json()
  const projectId = created.id as string
  await page.waitForURL((url) => url.pathname === `/editor/${projectId}`)

  // 초기 DBML 입력이 600ms 디바운스 PATCH를 하나 만든다. 여기서 arm해서
  // 소진해 두지 않으면 이후 테스트가 기다리는 PATCH가 이 저장에 먼저 낚여
  // 수동 경로가 저장되기 전에 reload하는 플레이크가 생긴다
  // (editor-layout.spec.ts의 initPatch 패턴과 동일).
  const initPatch = page.waitForResponse(
    (resp) =>
      resp.url().includes(`/api/projects/${projectId}`) &&
      resp.request().method() === 'PATCH' &&
      resp.ok(),
  )

  const dbml = [
    'Table users {',
    '  id integer [pk]',
    '}',
    'Table posts {',
    '  id integer [pk]',
    '  user_id integer [ref: > users.id]',
    '}',
  ].join('\n')
  const editor = page.getByTestId('dbml-editor')
  await editor.locator('.cm-content').click()
  await page.keyboard.type(dbml)

  await expect
    .poll(async () => page.locator('.react-flow__edge').count(), { timeout: 5000 })
    .toBeGreaterThanOrEqual(1)
  await initPatch // dbml autosave 소진 — 이후 PATCH 대기는 깨끗한 상태에서
  return projectId
}

test.describe('Manual edge paths', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies()
  })

  test('drag a segment, persist across reload, then reset', async ({ page }) => {
    const email = `edgepath-${Date.now()}@example.com`
    await registerAndLogin(page, email, 'password123')
    const projectId = await createProjectWithRef(page)

    // 1) 엣지 선택 → 세그먼트 핸들 표시
    await clickEdgeMidpoint(page)
    await expect(page.locator('[data-testid^="edge-seg-"]').first()).toBeVisible()

    // 2) 경로 d 캡처 후 노드에 가리지 않은 핸들을 세그먼트에 **수직**으로 60px
    //    끈다. PATCH 대기는 **payload 검사** — layout.edges가 실제로 실린 저장만
    //    통과시켜 엉뚱한 PATCH에 낚이지 않는다.
    const dBefore = await page
      .locator('.react-flow__edge-path')
      .first()
      .getAttribute('d')
    const edgeSavePatch = page.waitForResponse((resp) => {
      if (!resp.url().includes(`/api/projects/${projectId}`)) return false
      if (resp.request().method() !== 'PATCH' || !resp.ok()) return false
      const body = resp.request().postDataJSON() as
        | { layout?: { edges?: Record<string, unknown> } }
        | null
      return Object.keys(body?.layout?.edges ?? {}).length > 0
    })
    const handle = await pickDraggableHandle(page)
    // 세그먼트에 **수직**으로 끌어야 경로가 휜다. 방향은 카드에서 **멀어지는**
    // 쪽(수직 세그먼트=왼쪽, 수평 세그먼트=위)으로 잡는다 — 그래야 수동 경로의
    // 중간 꼭짓점에 떠 있는 플로팅 Reset 버튼이 노드 카드(HTML 레이어가 SVG
    // 엣지 라벨 위에 옴)에 가리지 않고 클릭 가능해진다(실측: 카드 쪽으로 끌면
    // 버튼이 카드 div에 가려 클릭이 노드로 샌다).
    const dx = handle.horizontal ? 0 : -60
    const dy = handle.horizontal ? -60 : 0
    await page.mouse.move(handle.x, handle.y)
    await page.mouse.down()
    await page.mouse.move(handle.x + dx, handle.y + dy, { steps: 5 })
    await page.mouse.up()

    // 3) 수동 경로 전환: 경로가 바뀌고 Reset line 버튼이 나타난다
    await expect(page.getByTestId('edge-reset')).toBeVisible()
    const dAfter = await page
      .locator('.react-flow__edge-path')
      .first()
      .getAttribute('d')
    expect(dAfter).not.toBe(dBefore)
    await edgeSavePatch // 수동 경로가 실린 PATCH 완료 대기 (디바운스 600ms)

    // 4) 새로고침 후에도 수동 경로 유지 (다시 선택하면 Reset 버튼이 있다)
    await page.reload()
    await expect
      .poll(async () => page.locator('.react-flow__edge').count(), { timeout: 5000 })
      .toBeGreaterThanOrEqual(1)
    await clickEdgeMidpoint(page)
    await expect(page.getByTestId('edge-reset')).toBeVisible()

    // 5) Reset line → 자동 라우팅 복귀 (버튼이 사라짐) + 저장.
    //    payload 검사: layout이 실려 있고 edges가 비워진 PATCH만 통과.
    const resetPatch = page.waitForResponse((resp) => {
      if (!resp.url().includes(`/api/projects/${projectId}`)) return false
      if (resp.request().method() !== 'PATCH' || !resp.ok()) return false
      const body = resp.request().postDataJSON() as
        | { layout?: { edges?: Record<string, unknown> } }
        | null
      return body?.layout != null && Object.keys(body.layout.edges ?? {}).length === 0
    })
    await page.getByTestId('edge-reset').click()
    await expect(page.getByTestId('edge-reset')).toBeHidden()
    await resetPatch
  })

  test('Info panel shows and edits node coordinates', async ({ page }) => {
    const email = `selinfo-${Date.now()}@example.com`
    await registerAndLogin(page, email, 'password123')
    await createProjectWithRef(page)

    // 테이블 노드 클릭 → Selection 섹션에 x/y 표시
    await page
      .locator('.react-flow__node')
      .filter({ hasText: 'users' })
      .first()
      .click()
    await expect(page.getByTestId('selection-section')).toBeVisible()
    const xInput = page.getByTestId('sel-x')
    await expect(xInput).toBeVisible()

    // x를 600으로 수정 → 노드 transform이 600px로 이동
    await xInput.fill('600')
    await xInput.press('Enter')
    await expect
      .poll(async () =>
        page
          .locator('.react-flow__node')
          .filter({ hasText: 'users' })
          .first()
          .getAttribute('style'),
      )
      .toContain('600px')
  })

  test('Info panel shows edge waypoints when an edge is selected', async ({ page }) => {
    const email = `edgeinfo-${Date.now()}@example.com`
    await registerAndLogin(page, email, 'password123')
    await createProjectWithRef(page)

    await clickEdgeMidpoint(page)
    await expect(page.getByTestId('selection-section')).toBeVisible()
    // 'Auto'를 전역으로 찾으면 캔버스의 'Auto-arrange' 버튼과 substring 매칭되어
    // strict-mode 위반(2+ 요소)으로 죽는다 — 섹션으로 스코프 + exact 매칭.
    await expect(
      page.getByTestId('selection-section').getByText('Auto', { exact: true }),
    ).toBeVisible()
  })
})
