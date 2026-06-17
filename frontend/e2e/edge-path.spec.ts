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

test('edges leaving the same PK share ONE trunk, forking near the targets', async ({ page }) => {
  const email = `bus-${Date.now()}@example.com`
  await registerAndLogin(page, email, 'password123')
  // customer.id is referenced by a/b/c (DIFFERENT tables) stacked in a column to
  // the right. Per the reporter, these must read as ONE bus: a single vertical
  // trunk just before the column, forking a short stub into each table — NOT a
  // fan of parallel lines near the source.
  const dbml = [
    'Table customer { id BIGINT [pk] }',
    'Table a { id BIGINT [pk]\n  customer_id BIGINT [ref: > customer.id] }',
    'Table b { id BIGINT [pk]\n  customer_id BIGINT [ref: > customer.id] }',
    'Table c { id BIGINT [pk]\n  customer_id BIGINT [ref: > customer.id] }',
  ].join('\n')
  const layout = {
    version: 1,
    positions: {
      'public.customer': { x: 0, y: 0 },
      'public.a': { x: 700, y: 0 },
      'public.b': { x: 700, y: 200 },
      'public.c': { x: 700, y: 400 },
    },
  }
  const resp = await page.request.post('/api/projects', { data: { name: 'Bus', dbml_text: dbml, layout } })
  const { id } = await resp.json()
  await page.goto(`/editor/${id}`)
  await expect
    .poll(async () => page.locator('.react-flow__edge-path').count(), { timeout: 8000 })
    .toBeGreaterThanOrEqual(3)
  await page.waitForTimeout(1000) // allow the merge + spread passes (rAF) to settle

  // Longest vertical segment X (the approach trunk) for each customer.id edge.
  const trunkXs = await page.evaluate(() => {
    const edges = Array.from(document.querySelectorAll('.react-flow__edge'))
      .filter((g) => (g.getAttribute('data-id') ?? '').includes('public.customer.(id)'))
    return edges.map((g) => {
      const d = g.querySelector('.react-flow__edge-path')?.getAttribute('d') ?? ''
      const nums = d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? []
      const pts: { x: number; y: number }[] = []
      for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: nums[i], y: nums[i + 1] })
      let best = { x: NaN, len: -1 }
      for (let i = 0; i + 1 < pts.length; i++) {
        if (pts[i].x === pts[i + 1].x) {
          const len = Math.abs(pts[i + 1].y - pts[i].y)
          if (len > best.len) best = { x: pts[i].x, len }
        }
      }
      return best.x
    })
  })
  expect(trunkXs.length).toBe(3)
  // All three co-source edges run down the SAME vertical trunk (one bus)…
  expect(new Set(trunkXs).size).toBe(1)
  // …and that trunk hugs the target column (≈ x 700), not the source (x 0).
  expect(trunkXs[0]).toBeGreaterThan(500)
})

test('edges leaving the same source handle fan onto distinct vertical trunks', async ({ page }) => {
  const email = `trunk-${Date.now()}@example.com`
  await registerAndLogin(page, email, 'password123')
  const dbml = [
    'Table account {',
    '  account_id BIGINT [pk]',
    '}',
    'Table a {',
    '  id BIGINT [pk]',
    '  created_by BIGINT [ref: > account.account_id]',
    '}',
    'Table b {',
    '  id BIGINT [pk]',
    '  created_by BIGINT [ref: > account.account_id]',
    '}',
    'Table c {',
    '  id BIGINT [pk]',
    '  created_by BIGINT [ref: > account.account_id]',
    '}',
  ].join('\n')
  // account on top; a/b/c stacked directly BELOW it so every account edge runs
  // down a vertical trunk to reach its target.
  const layout = {
    version: 1,
    positions: {
      'public.account': { x: 0, y: 0 },
      'public.a': { x: 0, y: 240 },
      'public.b': { x: 0, y: 440 },
      'public.c': { x: 0, y: 640 },
    },
  }
  const resp = await page.request.post('/api/projects', {
    data: { name: 'Trunk', dbml_text: dbml, layout },
  })
  const { id } = await resp.json()
  await page.goto(`/editor/${id}`)
  await expect
    .poll(async () => page.locator('.react-flow__edge-path').count(), { timeout: 8000 })
    .toBeGreaterThanOrEqual(3)
  await page.waitForTimeout(800)

  // For each edge leaving account.account_id, find the X of its longest VERTICAL
  // segment (the trunk it runs down). With the fix these must be distinct.
  const trunkXs = await page.evaluate(() => {
    const edges = Array.from(document.querySelectorAll('.react-flow__edge'))
      .filter((g) => (g.getAttribute('data-id') ?? '').includes('public.account.(account_id)'))
    return edges.map((g) => {
      const d = g.querySelector('.react-flow__edge-path')?.getAttribute('d') ?? ''
      const nums = d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? []
      const pts: { x: number; y: number }[] = []
      for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: nums[i], y: nums[i + 1] })
      let best = { x: NaN, len: -1 }
      for (let i = 0; i + 1 < pts.length; i++) {
        if (pts[i].x === pts[i + 1].x) {
          const len = Math.abs(pts[i + 1].y - pts[i].y)
          if (len > best.len) best = { x: pts[i].x, len }
        }
      }
      return best.x
    })
  })
  expect(trunkXs.length).toBeGreaterThanOrEqual(3)
  // No two co-source edges share the same trunk X (all distinct).
  expect(new Set(trunkXs).size).toBe(trunkXs.length)
})

test('independent edges do not share an identical vertical corridor', async ({ page }) => {
  const email = `spread-${Date.now()}@example.com`
  await registerAndLogin(page, email, 'password123')
  const dbml = [
    'Table account { account_id BIGINT [pk] }',
    'Table service {',
    '  service_id BIGINT [pk]',
    '  created_by BIGINT [ref: > account.account_id]',
    '}',
    'Table publishing { publishing_id BIGINT [pk] }',
    'Table publishing_file {',
    '  publishing_file_id BIGINT [pk]',
    '  publishing_id BIGINT [ref: > publishing.publishing_id]',
    '}',
  ].join('\n')
  // Stack all four tables in the same x column so the two INDEPENDENT edges
  // (account→service.created_by and publishing→publishing_file.publishing_id)
  // exit their PK right-handles at the same stub x and route down the same
  // vertical corridor. Pre-fix their interior verticals land on an IDENTICAL x
  // (269) over an overlapping y-range — a real shared corridor the spread pass
  // must separate. (publishing sits between account/service so its edge's
  // corridor y-range overlaps account→service's.)
  const layout = {
    version: 1,
    positions: {
      'public.account': { x: 0, y: 0 },
      'public.service': { x: 0, y: 300 },
      'public.publishing': { x: 0, y: 150 },
      'public.publishing_file': { x: 0, y: 600 },
    },
  }
  const resp = await page.request.post('/api/projects', { data: { name: 'Spread', dbml_text: dbml, layout } })
  const { id } = await resp.json()
  await page.goto(`/editor/${id}`)
  await expect.poll(async () => page.locator('.react-flow__edge-path').count(), { timeout: 8000 }).toBeGreaterThanOrEqual(2)
  await page.waitForTimeout(1000) // allow the spread pass (rAF) to settle

  const segs = await page.evaluate(() => {
    const out: { id: string; x: number; lo: number; hi: number }[] = []
    for (const g of Array.from(document.querySelectorAll('.react-flow__edge'))) {
      const eid = g.getAttribute('data-id') ?? ''
      const d = g.querySelector('.react-flow__edge-path')?.getAttribute('d') ?? ''
      const nums = d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? []
      const pts: { x: number; y: number }[] = []
      for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: nums[i], y: nums[i + 1] })
      for (let i = 1; i < pts.length - 2; i++) {
        if (pts[i].x === pts[i + 1].x) {
          out.push({ id: eid, x: pts[i].x, lo: Math.min(pts[i].y, pts[i + 1].y), hi: Math.max(pts[i].y, pts[i + 1].y) })
        }
      }
    }
    return out
  })
  const overlap = (a: typeof segs[number], b: typeof segs[number]) =>
    a.id !== b.id && a.x === b.x && a.lo < b.hi && b.lo < a.hi
  const clash = segs.some((a, i) => segs.slice(i + 1).some((b) => overlap(a, b)))
  expect(clash).toBe(false)
})

test('no edge path crosses any table card interior (corridor routing)', async ({ page }) => {
  const email = `corridor-${Date.now()}@example.com`
  await registerAndLogin(page, email, 'password123')

  // Two TableGroups with a cross-group FK. The inter-group edge must route
  // AROUND table cards, not through them. Layout places the groups far apart
  // so the edge has to travel past intermediate tables in the other group.
  //   GroupA: orders (0,0) → order_items (0,250)
  //   GroupB: products (700,0) → categories (700,250)
  // Cross-group FK: order_items.product_id → products.product_id
  // Same-PK FK: order_items.order_id → orders.id  (stays inside GroupA)
  // The cross-group edge must cross the gap between x≈0 and x≈700 without
  // passing through any card's interior.
  const dbml = [
    'Table orders {',
    '  id BIGINT [pk]',
    '}',
    'Table order_items {',
    '  id BIGINT [pk]',
    '  order_id BIGINT [ref: > orders.id]',
    '  product_id BIGINT [ref: > products.product_id]',
    '}',
    'Table products {',
    '  product_id BIGINT [pk]',
    '}',
    'Table categories {',
    '  category_id BIGINT [pk]',
    '  product_id BIGINT [ref: > products.product_id]',
    '}',
    'TableGroup GroupA {',
    '  orders',
    '  order_items',
    '}',
    'TableGroup GroupB {',
    '  products',
    '  categories',
    '}',
  ].join('\n')

  const layout = {
    version: 1,
    positions: {
      'public.orders':      { x: 0,   y: 0   },
      'public.order_items': { x: 0,   y: 280  },
      'public.products':    { x: 700, y: 0   },
      'public.categories':  { x: 700, y: 280  },
    },
  }

  const resp = await page.request.post('/api/projects', {
    data: { name: 'Corridor', dbml_text: dbml, layout },
  })
  const { id } = await resp.json()
  await page.goto(`/editor/${id}`)

  // Wait for at least 3 edges (order_items.order_id, order_items.product_id,
  // categories.product_id) plus routing settle (rAF merge + spread passes).
  await expect
    .poll(async () => page.locator('.react-flow__edge-path').count(), { timeout: 8000 })
    .toBeGreaterThanOrEqual(3)
  await page.waitForTimeout(1200) // allow merge + spread + corridor rAF passes to settle

  // Approach A: in-page evaluate — sample every ~4px along each edge path,
  // convert to screen coords via getScreenCTM(), test against each
  // .react-flow__node-table getBoundingClientRect() with a 2px inset.
  const result = await page.evaluate(() => {
    const INSET = 2
    const STEP = 4

    const tableNodes = Array.from(document.querySelectorAll('.react-flow__node-table'))
    const tableRects = tableNodes.map((n) => {
      const r = n.getBoundingClientRect()
      return { left: r.left + INSET, right: r.right - INSET, top: r.top + INSET, bottom: r.bottom - INSET }
    })

    const hits: { edgeId: string; sx: number; sy: number; rect: typeof tableRects[0] }[] = []

    for (const path of Array.from(document.querySelectorAll('.react-flow__edge-path'))) {
      const p = path as SVGPathElement
      const edgeGroup = p.closest('[data-id]')
      const edgeId = edgeGroup?.getAttribute('data-id') ?? '?'
      const ctm = p.getScreenCTM()
      if (!ctm) continue

      const total = p.getTotalLength()
      for (let dist = 0; dist <= total; dist += STEP) {
        const pt = p.getPointAtLength(dist)
        const sx = ctm.a * pt.x + ctm.c * pt.y + ctm.e
        const sy = ctm.b * pt.x + ctm.d * pt.y + ctm.f
        for (const rect of tableRects) {
          if (sx > rect.left && sx < rect.right && sy > rect.top && sy < rect.bottom) {
            hits.push({ edgeId, sx, sy, rect })
          }
        }
      }
    }
    return { hitCount: hits.length, hits: hits.slice(0, 5) }
  })

  if (result.hitCount > 0) {
    console.error('Interior crossings found:', JSON.stringify(result.hits, null, 2))
  }
  expect(result.hitCount).toBe(0)
})

test('dense grouped schema: a same-PK bus never tunnels through an intervening card', async ({ page }) => {
  // Regression for the real-app bug: account.account_id is referenced by
  // created_by/updated_by across MANY tables packed into a group grid. A naive
  // same-PK bus would run a horizontal "leave" at the account_id row straight
  // through nearer member cards (e.g. customer_note) to reach a far member. The
  // post-passes must (a) actually receive the measured card obstacles and (b)
  // detect the per-segment crossing and fall back so the route goes AROUND.
  const email = `dense-${Date.now()}@example.com`
  await registerAndLogin(page, email, 'password123')
  const dbml = [
    'Table department { id BIGINT [pk] }',
    'Table account {',
    '  account_id BIGINT [pk]',
    '  department_id BIGINT [ref: > department.id]',
    '}',
    'Table customer {',
    '  customer_id BIGINT [pk]',
    '  created_by BIGINT [ref: > account.account_id]',
    '  updated_by BIGINT [ref: > account.account_id]',
    '}',
    'Table project {',
    '  project_id VARCHAR [pk]',
    '  created_by BIGINT [ref: > account.account_id]',
    '}',
    'Table customer_note {',
    '  note_id BIGINT [pk]',
    '  created_by BIGINT [ref: > account.account_id]',
    '  updated_by BIGINT [ref: > account.account_id]',
    '}',
    'Table patch_file {',
    '  patch_id BIGINT [pk]',
    '  created_by BIGINT [ref: > account.account_id]',
    '}',
    'Table patch_history {',
    '  history_id BIGINT [pk]',
    '  created_by BIGINT [ref: > account.account_id]',
    '}',
    'Table release_version {',
    '  release_id BIGINT [pk]',
    '  created_by BIGINT [ref: > account.account_id]',
    '  updated_by BIGINT [ref: > account.account_id]',
    '}',
    'TableGroup VERSION {',
    '  customer',
    '  project',
    '  customer_note',
    '  patch_file',
    '  patch_history',
    '  release_version',
    '}',
  ].join('\n')

  const resp = await page.request.post('/api/projects', { data: { name: 'Dense', dbml_text: dbml } })
  const { id } = await resp.json()
  await page.goto(`/editor/${id}`)
  await expect
    .poll(async () => page.locator('.react-flow__edge-path').count(), { timeout: 8000 })
    .toBeGreaterThanOrEqual(6)
  await page.waitForTimeout(1500)

  const result = await page.evaluate(() => {
    const INSET = 2
    const STEP = 4
    const tableRects = Array.from(document.querySelectorAll('.react-flow__node-table')).map((n) => {
      const r = n.getBoundingClientRect()
      return { left: r.left + INSET, right: r.right - INSET, top: r.top + INSET, bottom: r.bottom - INSET }
    })
    const hits: { edgeId: string; sx: number; sy: number }[] = []
    for (const path of Array.from(document.querySelectorAll('.react-flow__edge-path'))) {
      const p = path as SVGPathElement
      const edgeId = p.closest('[data-id]')?.getAttribute('data-id') ?? '?'
      const ctm = p.getScreenCTM()
      if (!ctm) continue
      const total = p.getTotalLength()
      for (let dist = 0; dist <= total; dist += STEP) {
        const pt = p.getPointAtLength(dist)
        const sx = ctm.a * pt.x + ctm.c * pt.y + ctm.e
        const sy = ctm.b * pt.x + ctm.d * pt.y + ctm.f
        for (const rect of tableRects) {
          if (sx > rect.left && sx < rect.right && sy > rect.top && sy < rect.bottom) {
            hits.push({ edgeId, sx, sy })
          }
        }
      }
    }
    return { hitCount: hits.length, hits: hits.slice(0, 8) }
  })

  if (result.hitCount > 0) {
    console.error('Dense-schema interior crossings:', JSON.stringify(result.hits, null, 2))
  }
  expect(result.hitCount).toBe(0)
})

test('same-PK FKs of one table share a trunk; a different-PK FK stays separate', async ({ page }) => {
  const email = `bundle-${Date.now()}@example.com`
  await registerAndLogin(page, email, 'password123')
  // service has THREE FKs: created_by + updated_by reference the SAME PK
  // (account.account_id) → must bundle onto ONE trunk; publishing_id references a
  // DIFFERENT PK → must keep its own trunk. (Reporter's rule: same PK = one line.)
  const dbml = [
    'Table account { account_id BIGINT [pk] }',
    'Table publishing { publishing_id BIGINT [pk] }',
    'Table service {',
    '  service_id BIGINT [pk]',
    '  created_by BIGINT [ref: > account.account_id]',
    '  updated_by BIGINT [ref: > account.account_id]',
    '  publishing_id BIGINT [ref: > publishing.publishing_id]',
    '}',
  ].join('\n')
  // account + publishing on the LEFT, service on the RIGHT — all FK edges enter
  // service's left handles, so each has a vertical approach trunk.
  const layout = {
    version: 1,
    positions: {
      'public.account': { x: 0, y: 0 },
      'public.publishing': { x: 0, y: 200 },
      'public.service': { x: 500, y: 0 },
    },
  }
  const resp = await page.request.post('/api/projects', { data: { name: 'Bundle', dbml_text: dbml, layout } })
  const { id } = await resp.json()
  await page.goto(`/editor/${id}`)
  await expect.poll(async () => page.locator('.react-flow__edge-path').count(), { timeout: 8000 }).toBeGreaterThanOrEqual(3)
  await page.waitForTimeout(1000) // allow the merge + spread passes (rAF) to settle

  // Longest vertical segment X (the approach trunk) per FK edge, keyed by target col.
  const trunkByCol = await page.evaluate(() => {
    const byCol: Record<string, number> = {}
    for (const g of Array.from(document.querySelectorAll('.react-flow__edge'))) {
      const eid = g.getAttribute('data-id') ?? ''
      const m = eid.match(/public\.service\.\(([a-z_]+)\)/)
      if (!m) continue
      const d = g.querySelector('.react-flow__edge-path')?.getAttribute('d') ?? ''
      const nums = d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? []
      const pts: { x: number; y: number }[] = []
      for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: nums[i], y: nums[i + 1] })
      let best = { x: NaN, len: -1 }
      for (let i = 0; i + 1 < pts.length; i++) {
        if (pts[i].x === pts[i + 1].x) {
          const len = Math.abs(pts[i + 1].y - pts[i].y)
          if (len > best.len) best = { x: pts[i].x, len }
        }
      }
      byCol[m[1]] = best.x
    }
    return byCol
  })
  // created_by + updated_by (same PK) → IDENTICAL trunk X (one forked line).
  expect(trunkByCol.created_by).toBeCloseTo(trunkByCol.updated_by, 1)
  // publishing_id (different PK) → a DIFFERENT trunk X (its own line).
  expect(trunkByCol.publishing_id).not.toBeCloseTo(trunkByCol.created_by, 1)
})

test('cross-group same-PK members converge on one approach trunk per destination group', async ({ page }) => {
  // Regression guard for the "account fan" bug: account.account_id is referenced
  // by multiple tables in a REMOTE group (TARGET) that lies below/above an
  // INTERVENING group. Before Task 1's A* approach-trunk fix the routing would
  // produce a source fan — each member got its own vertical trunk — instead of a
  // single shared approach trunk that forks near the destination group.
  //
  // Layout (3 TableGroups stacked vertically, explicit positions):
  //   RBAC group  (account) — source, top-left
  //   MID  group  (mid_a, mid_b) — intervening, placed between RBAC and TARGET
  //   TARGET group (tgt_a, tgt_b) — destination, far right
  //
  // account.account_id is referenced by tgt_a.created_by AND tgt_b.created_by
  // (same PK → same-PK bundle). The approach trunk from RBAC into TARGET must
  // cross (or pass alongside) the MID group, so the A* path-finding fires.
  //
  // Assertions:
  //   (a) Both same-PK FK edges share ONE approach-trunk entry x (firstTurnX)
  //       — the fan width must be ≤ LANE_GAP*2 (≈ 28px).
  //   (b) No .react-flow__edge-path sample point lies inside any table card
  //       interior (2px inset) — copied from the "corridor routing" reference test.

  const email = `crossgrp-${Date.now()}@example.com`
  await registerAndLogin(page, email, 'password123')

  const dbml = [
    'Table account {',
    '  account_id BIGINT [pk]',
    '}',
    'Table mid_a {',
    '  mid_a_id BIGINT [pk]',
    '}',
    'Table mid_b {',
    '  mid_b_id BIGINT [pk]',
    '}',
    'Table tgt_a {',
    '  tgt_a_id BIGINT [pk]',
    '  created_by BIGINT [ref: > account.account_id]',
    '}',
    'Table tgt_b {',
    '  tgt_b_id BIGINT [pk]',
    '  created_by BIGINT [ref: > account.account_id]',
    '}',
    'TableGroup RBAC {',
    '  account',
    '}',
    'TableGroup MID {',
    '  mid_a',
    '  mid_b',
    '}',
    'TableGroup TARGET {',
    '  tgt_a',
    '  tgt_b',
    '}',
  ].join('\n')

  // Place RBAC on the left, MID in the middle column at the same row,
  // TARGET on the far right — so edges from RBAC to TARGET pass alongside MID.
  // account goes right→ past MID → into TARGET.
  const layout = {
    version: 1,
    positions: {
      'public.account': { x: 0,    y: 0   },
      'public.mid_a':   { x: 400,  y: 0   },
      'public.mid_b':   { x: 400,  y: 200 },
      'public.tgt_a':   { x: 900,  y: 0   },
      'public.tgt_b':   { x: 900,  y: 200 },
    },
  }

  const resp = await page.request.post('/api/projects', {
    data: { name: 'CrossGroup', dbml_text: dbml, layout },
  })
  const { id } = await resp.json()
  await page.goto(`/editor/${id}`)

  await expect
    .poll(async () => page.locator('.react-flow__edge-path').count(), { timeout: 8000 })
    .toBeGreaterThanOrEqual(2)
  await page.waitForTimeout(1500) // allow merge + spread + corridor rAF passes to settle

  // (a) firstTurnX convergence: both edges going from account → TARGET group
  //     must share the same approach-trunk entry x (i.e., fan width ≤ LANE_GAP*2 ≈ 28px).
  const trunkData = await page.evaluate(() => {
    const edges = Array.from(document.querySelectorAll('.react-flow__edge'))
      .filter((g) => (g.getAttribute('data-id') ?? '').startsWith('public.account.(account_id)'))
    return edges.map((g) => {
      const eid = g.getAttribute('data-id') ?? ''
      const d = g.querySelector('.react-flow__edge-path')?.getAttribute('d') ?? ''
      const nums = d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? []
      const pts: { x: number; y: number }[] = []
      for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: nums[i], y: nums[i + 1] })

      // firstTurnX: first point where x departs from the starting x by >1px
      const startX = pts[0]?.x ?? NaN
      let firstTurnX = NaN
      for (let i = 1; i < pts.length; i++) {
        if (Math.abs(pts[i].x - startX) > 1) { firstTurnX = pts[i].x; break }
      }

      return { eid, firstTurnX }
    })
  })

  // Must have found both FK edges
  expect(trunkData.length).toBe(2)

  const firstTurnXs = trunkData.map((e) => e.firstTurnX).filter((x) => !isNaN(x))
  expect(firstTurnXs.length).toBe(2)

  const LANE_GAP_2 = 28 // LANE_GAP * 2 — fan threshold
  const fanWidth = Math.abs(firstTurnXs[1] - firstTurnXs[0])
  // Assert convergence: both edges enter the same approach trunk (fan width ≤ 28px)
  expect(fanWidth).toBeLessThanOrEqual(LANE_GAP_2)

  // (b)가 회귀에 민감한 핵심 단언이다: 두 same-PK 멤버가 같은 그룹을 목적지로 하므로
  // (a) 수렴 단언만으로는 원래 팬 회귀를 잡을 수 없고, 유닛 테스트가 true red-green guard다.
  // (b) No edge path crosses any table card interior (2px inset).
  // Reference: "no edge path crosses any table card interior (corridor routing)" test.
  const result = await page.evaluate(() => {
    const INSET = 2
    const STEP = 4
    const tableRects = Array.from(document.querySelectorAll('.react-flow__node-table')).map((n) => {
      const r = n.getBoundingClientRect()
      return { left: r.left + INSET, right: r.right - INSET, top: r.top + INSET, bottom: r.bottom - INSET }
    })
    const hits: { edgeId: string; sx: number; sy: number }[] = []
    for (const path of Array.from(document.querySelectorAll('.react-flow__edge-path'))) {
      const p = path as SVGPathElement
      const edgeId = p.closest('[data-id]')?.getAttribute('data-id') ?? '?'
      const ctm = p.getScreenCTM()
      if (!ctm) continue
      const total = p.getTotalLength()
      for (let dist = 0; dist <= total; dist += STEP) {
        const pt = p.getPointAtLength(dist)
        const sx = ctm.a * pt.x + ctm.c * pt.y + ctm.e
        const sy = ctm.b * pt.x + ctm.d * pt.y + ctm.f
        for (const rect of tableRects) {
          if (sx > rect.left && sx < rect.right && sy > rect.top && sy < rect.bottom) {
            hits.push({ edgeId, sx, sy })
          }
        }
      }
    }
    return { hitCount: hits.length, hits: hits.slice(0, 5) }
  })

  if (result.hitCount > 0) {
    console.error('Cross-group interior crossings found:', JSON.stringify(result.hits, null, 2))
  }
  expect(result.hitCount).toBe(0)
})
