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
 * 드래그 가능한 INTERIOR 세그먼트 핸들 하나를 화면 좌표 + 방향과 함께 고른다.
 * 두 가지를 피해야 한다:
 *   (1) 노드 카드(HTML 레이어)에 가린 핸들 — pointerdown이 핸들로 안 들어간다.
 *   (2) **양 끝의 step-out stub 세그먼트**(첫/마지막 세그먼트). 끝점에 앵커된
 *       stub을 드래그하면 dragSegment가 stub 모서리를 삽입하며 세그먼트를
 *       재번호화 → 캡처된 핸들 요소가 사라져 pointer capture가 끊기고 커밋이
 *       안 된다(실측: 중간 세그먼트는 정상 커밋, stub은 커밋 실패 — 제품의
 *       기존 한계). 그래서 첫/마지막을 제외한 가운데 세그먼트를 고른다.
 * orientation은 핸들의 data-orient(h/v) 속성으로 판정하고(커서는 이제 모든
 * 핸들이 pointer라 정보가 없다), 드래그는 세그먼트에 **수직**으로 줘야 경로가
 * 실제로 휜다.
 */
async function pickDraggableHandle(
  page: Page,
): Promise<{ x: number; y: number; horizontal: boolean }> {
  const found = await page
    .locator('[data-testid^="edge-seg-"]')
    .evaluateAll((els) => {
      // 세그먼트 인덱스로 정렬해 첫/마지막(끝점 stub)을 식별한다.
      const indexOf = (el: Element) =>
        parseInt((el.getAttribute('data-testid') ?? '').replace('edge-seg-', ''), 10)
      const sorted = [...els].sort((a, b) => indexOf(a) - indexOf(b))
      const firstIdx = sorted.length ? indexOf(sorted[0]) : -1
      const lastIdx = sorted.length ? indexOf(sorted[sorted.length - 1]) : -1
      const screenOf = (el: SVGCircleElement) => {
        const ctm = el.getScreenCTM()
        if (!ctm) return null
        const ucx = parseFloat(el.getAttribute('cx') ?? 'NaN')
        const ucy = parseFloat(el.getAttribute('cy') ?? 'NaN')
        return { x: ctm.a * ucx + ctm.c * ucy + ctm.e, y: ctm.b * ucx + ctm.d * ucy + ctm.f }
      }
      const unoccluded = (el: SVGCircleElement, s: { x: number; y: number }) => {
        const hit = document.elementFromPoint(s.x, s.y)
        return hit?.getAttribute('data-testid') === el.getAttribute('data-testid')
      }
      // 1순위: 가린 적 없는 INTERIOR(첫/마지막 제외) 세그먼트.
      // 2순위(폴백): 가린 적 없는 아무 세그먼트(경로가 2-세그먼트뿐일 때).
      for (const onlyInterior of [true, false]) {
        for (const raw of sorted) {
          const el = raw as SVGCircleElement
          const idx = indexOf(el)
          if (onlyInterior && (idx === firstIdx || idx === lastIdx)) continue
          const s = screenOf(el)
          if (!s || !unoccluded(el, s)) continue
          return { x: s.x, y: s.y, horizontal: el.getAttribute('data-orient') === 'h' }
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

  test('swap a target endpoint to the other side, persist across reload', async ({ page }) => {
    const email = `edgeswap-${Date.now()}@example.com`
    await registerAndLogin(page, email, 'password123')
    const projectId = await createProjectWithRef(page)

    // 엣지 선택 → 선택 강조(흐르는 dash 오버레이) + 스왑 버튼 표시
    await clickEdgeMidpoint(page)
    await expect(page.getByTestId('edge-flow')).toBeVisible()
    await expect(page.getByTestId('edge-swap-target')).toBeVisible()

    const dBefore = await page
      .locator('.react-flow__edge-path')
      .first()
      .getAttribute('d')

    // PATCH payload 검사: targetSide=right가 실린 저장만 통과 (디바운스 600ms)
    const swapPatch = page.waitForResponse((resp) => {
      if (!resp.url().includes(`/api/projects/${projectId}`)) return false
      if (resp.request().method() !== 'PATCH' || !resp.ok()) return false
      const body = resp.request().postDataJSON() as
        | { layout?: { edges?: Record<string, { targetSide?: string }> } }
        | null
      return Object.values(body?.layout?.edges ?? {}).some(
        (e) => e.targetSide === 'right',
      )
    })
    await page.getByTestId('edge-swap-target').click()
    await swapPatch

    // 엔드포인트가 반대편으로 옮겨가 경로가 달라진다
    const dAfter = await page
      .locator('.react-flow__edge-path')
      .first()
      .getAttribute('d')
    expect(dAfter).not.toBe(dBefore)

    // 새로고침 후에도 스왑된 앵커로 렌더 (d 동일)
    await page.reload()
    await expect
      .poll(async () => page.locator('.react-flow__edge').count(), { timeout: 5000 })
      .toBeGreaterThanOrEqual(1)
    await expect
      .poll(async () =>
        page.locator('.react-flow__edge-path').first().getAttribute('d'),
      )
      .toBe(dAfter)
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
