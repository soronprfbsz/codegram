import { test, expect } from '@playwright/test'
import { registerAndLogin } from './helpers'

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

    // 오버레이 제거 순간을 브라우저 내부에서 포착하는 MutationObserver를 주입한다.
    // Playwright의 폴링(~100ms 간격)으로는 오버레이의 출현·소멸 창이 너무 좁아 놓치기 때문에
    // addInitScript(다음 페이지 로드 전 실행)로 동기적 옵저버를 삽입한다.
    //
    // 주의: init script 실행 시점에는 document.documentElement가 아직 null이므로
    // document 노드 자체를 관찰 대상으로 써야 한다.
    //
    // 판별 원리:
    //   - 수정 전: 오버레이는 DBML 파싱 settle 시점에 닫힌다 → 카드 측정·라우팅 전이므로
    //     __overlayDetachPaths = [] (엣지 아직 없음).
    //   - 수정 후: 오버레이는 onCanvasReady(카드 measured + rAF×2 + fitView) 뒤에 닫힌다 →
    //     __overlayDetachPaths = 이미 안정된 경로 배열.
    await page.addInitScript(function () {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__overlayDetachPaths = undefined
      var obs = new MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i++) {
          var removed = mutations[i].removedNodes
          for (var j = 0; j < removed.length; j++) {
            var node = removed[j]
            if (
              node instanceof Element &&
              node.getAttribute('data-testid') === 'canvas-loading-overlay'
            ) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ;(window as any).__overlayDetachPaths = Array.from(
                document.querySelectorAll('.react-flow__edge path'),
              ).map(function (p) {
                return p.getAttribute('d') || ''
              })
            }
          }
        }
      })
      // document 노드 관찰 (init script 실행 시점에 documentElement가 아직 null)
      obs.observe(document, { childList: true, subtree: true })
    })

    await page.goto(`/editor/${id}`)

    // 오버레이가 실제로 DOM에서 제거될 때까지 대기 (옵저버가 값을 셋팅할 때까지).
    // timeout은 카드 측정+라우팅 최대 완료 시간을 포함한다.
    await page.waitForFunction(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      function () { return (window as any).__overlayDetachPaths !== undefined },
      { timeout: 30_000 },
    )

    // 오버레이가 사라진 바로 그 순간 브라우저가 기록한 엣지 경로.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const before = await page.evaluate(function () { return (window as any).__overlayDetachPaths as string[] })

    // 엣지가 나타날 때까지 기다린다.
    // 수정 전: 오버레이가 닫힐 때 엣지가 없으므로 여기서 비로소 나타남.
    // 수정 후: 이미 있으므로 즉시 통과.
    await expect
      .poll(async () => page.locator('.react-flow__edge path').count(), { timeout: 10_000 })
      .toBeGreaterThan(0)

    // 추가 프레임을 흘려 재라우팅이 있었다면 완료되도록 한다.
    await page.evaluate(function () {
      return new Promise<void>(function (r) {
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            requestAnimationFrame(function () { r() })
          })
        })
      })
    })

    const after = await page.$$eval('.react-flow__edge path', function (ps) {
      return ps.map(function (p) { return p.getAttribute('d') || '' })
    })

    // 수정 전: before=[] 혹은 불안정 경로, after=안정된 경로 → 불일치 → FAIL
    // 수정 후: before=안정된 경로, after=동일 → PASS
    expect(after).toEqual(before)
  })
})
