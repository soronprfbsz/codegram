import { test, expect, type Page } from '@playwright/test'

/**
 * 엣지의 '경로 위' 한 점을 클릭한다. `.react-flow__edge` bbox 중심 클릭은 ㄱ자
 * 경로에서 빈 공간일 수 있으므로, 경로를 따라 촘촘히 샘플링하며
 * elementFromPoint가 `.react-flow__edge`로 해석되는 첫 점을 골라 클릭한다.
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
      for (let d = 0; d <= 0.45; d += 0.02) {
        for (const f of d === 0 ? [0.5] : [0.5 + d, 0.5 - d]) {
          const s = toScreen(p.getPointAtLength(total * f))
          const hit = document.elementFromPoint(s.x, s.y)
          if (hit && hit.closest('.react-flow__edge')) return s
        }
      }
      // 폴백: 기하학적 중점
      const m = toScreen(p.getPointAtLength(total / 2))
      return m
    })
  await page.mouse.click(pt.x, pt.y)
}

async function registerAndLogin(page: Page, email: string, password: string) {
  await page.goto('/register')
  await page.locator('#register-email').fill(email)
  await page.locator('#register-password').fill(password)
  await page.locator('#register-confirm-password').fill(password)

  const loginResponse = page.waitForResponse(
    (resp) =>
      resp.url().includes('/api/auth/jwt/login') && resp.status() === 204,
  )
  await page.getByRole('button', { name: 'Sign up' }).click()
  await loginResponse
  await page.waitForURL((url) => url.pathname === '/')
}

test('table groups: full CRUD scenario', async ({ page }) => {
  const email = `tg-${Date.now()}@example.com`
  const password = 'password123'
  await registerAndLogin(page, email, password)

  // Create a project and land in the editor.
  const createResponse = page.waitForResponse(
    (resp) =>
      resp.url().includes('/api/projects') &&
      resp.request().method() === 'POST' &&
      resp.status() === 201,
  )
  await page.getByPlaceholder('Project name').fill('TG Test')
  await page.getByRole('button', { name: 'Create' }).click()
  const created = await (await createResponse).json()
  const projectId = created.id as string
  await page.waitForURL((url) => url.pathname === `/editor/${projectId}`)

  // Type a two-table DBML schema.
  const dbml = [
    'Table users {',
    '  id integer [pk]',
    '}',
    'Table posts {',
    '  id integer [pk]',
    '}',
  ].join('\n')

  const editor = page.getByTestId('dbml-editor')
  await editor.locator('.cm-content').click()
  await page.keyboard.type(dbml)

  // Wait for Valid badge (parse settles after 600ms debounce).
  await expect(page.getByText('Valid')).toBeVisible({ timeout: 10_000 })

  // ── Step 1: Create group 'auth' ───────────────────────────────────────
  await page.getByTestId('group-create-button').click()
  await page.getByTestId('group-create-input').fill('auth')
  await page.keyboard.press('Enter')

  // Wait for TableGroup auth to appear in editor.
  await expect
    .poll(
      async () =>
        page.getByTestId('dbml-editor').locator('.cm-content').textContent(),
      { timeout: 10_000 },
    )
    .toContain('TableGroup auth {')

  // ── Step 2: Move users into 'auth' ────────────────────────────────────
  await expect(page.getByText('Valid')).toBeVisible({ timeout: 10_000 })

  await page.getByTestId('table-move-users').click()
  await page.getByRole('menuitem', { name: 'auth' }).click()

  await expect
    .poll(
      async () =>
        page.getByTestId('dbml-editor').locator('.cm-content').textContent(),
      { timeout: 10_000 },
    )
    .toMatch(/TableGroup auth \{[\s\S]*users[\s\S]*\}/)

  // ── Step 3: Set color #EC4899 on 'auth' ───────────────────────────────
  await expect(page.getByText('Valid')).toBeVisible({ timeout: 10_000 })

  await page.getByTestId('group-menu-auth').click()
  await page.getByTestId('swatch-#EC4899').click()
  // Swatch is a plain button (not DropdownMenuItem), so Radix won't auto-close
  // the menu. Dismiss it with Escape.
  await page.keyboard.press('Escape')

  await expect
    .poll(
      async () =>
        page.getByTestId('dbml-editor').locator('.cm-content').textContent(),
      { timeout: 10_000 },
    )
    .toContain('[color: #EC4899]')

  // Wait for any Radix dropdown portal to close before clicking toggle.
  await expect(page.locator('[role="menu"]')).toHaveCount(0, { timeout: 5_000 })

  // ── Step 4: Collapse/expand 'auth' ────────────────────────────────────
  await page.getByTestId('group-toggle-auth').click()
  await expect(page.getByTestId('tablelist-row-users')).toBeHidden()

  await page.getByTestId('group-toggle-auth').click()
  await expect(page.getByTestId('tablelist-row-users')).toBeVisible()

  // ── Step 5: Rename 'auth' → 'core' ────────────────────────────────────
  await expect(page.getByText('Valid')).toBeVisible({ timeout: 10_000 })

  await page.getByTestId('group-menu-auth').click()
  await page.getByRole('menuitem', { name: 'Rename' }).click()
  await page.getByTestId('group-rename-input').fill('core')
  await page.keyboard.press('Enter')

  await expect
    .poll(
      async () =>
        page.getByTestId('dbml-editor').locator('.cm-content').textContent(),
      { timeout: 10_000 },
    )
    .toContain('TableGroup core')

  // ── Step 6: Delete 'core' ─────────────────────────────────────────────
  await expect(page.getByText('Valid')).toBeVisible({ timeout: 10_000 })

  await page.getByTestId('group-menu-core').click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()

  await expect
    .poll(
      async () =>
        page.getByTestId('dbml-editor').locator('.cm-content').textContent(),
      { timeout: 10_000 },
    )
    .not.toContain('TableGroup')

  // users should still be listed (now Ungrouped).
  await expect(page.getByTestId('tablelist-row-users')).toBeVisible()

  // ── Step 7: Off-canvas toggle ─────────────────────────────────────────
  // Panel is open by default — schema-summary-grid is visible.
  await expect(page.getByTestId('schema-summary-grid')).toBeInViewport()

  // Collapse the panel via its own header toggle (grid column → 40px rail).
  await page.getByRole('button', { name: 'Collapse info panel' }).click()

  // Poll the info-panel-column width until it reaches the 40px rail (CSS 200ms).
  await expect
    .poll(
      async () => {
        const col = page.getByTestId('info-panel-column')
        const box = await col.boundingBox()
        return box?.width ?? -1
      },
      { timeout: 5_000 },
    )
    .toBe(40)

  // Expand again from the rail.
  await page.getByRole('button', { name: 'Expand info panel' }).click()
  await expect(page.getByTestId('schema-summary-grid')).toBeInViewport({ timeout: 5_000 })
})

test('그룹 라벨 드래그로 멤버 이동, 내부 엣지는 그룹을 통과해 클릭 가능', async ({ page }) => {
  const email = `tg-drag-${Date.now()}@example.com`
  const password = 'password123'
  await registerAndLogin(page, email, password)

  // API로 프로젝트 직접 생성 (FK가 있어 캔버스에 엣지가 그려지는 DBML).
  const dbml_text = [
    'Table users {',
    '  id integer [pk]',
    '  org_id integer [ref: > orgs.id]',
    '}',
    'Table orgs {',
    '  id integer [pk]',
    '  name varchar',
    '}',
    'TableGroup acct {',
    '  users',
    '  orgs',
    '}',
  ].join('\n')

  const createResp = await page.request.post('/api/projects', {
    data: { name: `TG-Drag-${Date.now()}`, dbml_text, layout: {} },
  })
  const created = await createResp.json()
  const projectId = created.id as string
  await page.goto(`/editor/${projectId}`)

  // 그룹 리전과 엣지가 모두 렌더될 때까지 대기.
  await page.waitForSelector('[data-testid^="group-region-"]')
  await expect
    .poll(async () => page.locator('.react-flow__edge').count(), { timeout: 8000 })
    .toBeGreaterThanOrEqual(1)

  // (1) 내부 엣지 클릭 → 선택되어 세그먼트 핸들 표시 (그룹이 클릭을 가로채지 않음).
  await clickEdgeMidpoint(page)
  await expect(page.locator('[data-testid^="edge-seg-"]').first()).toBeVisible()

  // (2) 그룹 라벨(.erd-group-handle) 드래그 → 멤버 테이블 transform 이동.
  const before = await page.locator('.react-flow__node-table').first().getAttribute('style')
  const handle = page.locator('.erd-group-handle').first()
  const box = await handle.boundingBox()
  if (!box) throw new Error('group handle has no bounding box')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + 140, box.y + 90, { steps: 6 })
  await page.mouse.up()
  await expect
    .poll(async () => page.locator('.react-flow__node-table').first().getAttribute('style'))
    .not.toBe(before)
})

test('그룹 라벨 hover → 정렬 버튼으로 그룹 내부 콤팩트 정렬 + 저장', async ({ page }) => {
  const email = `tg-arrange-${Date.now()}@example.com`
  const password = 'password123'
  await registerAndLogin(page, email, password)

  // 5개 테이블을 세로로 촘촘히 쌓아 그룹 박스가 키가 크게 되도록 layout 시드.
  // arrange 클릭 후 콤팩트 그리드(2-3열)로 재배치되면 박스 높이가 줄어든다.
  const dbml_text = [
    'Table t0 { id integer [pk] }',
    'Table t1 { id integer [pk] }',
    'Table t2 { id integer [pk] }',
    'Table t3 { id integer [pk] }',
    'Table t4 { id integer [pk] }',
    'TableGroup g {',
    '  t0',
    '  t1',
    '  t2',
    '  t3',
    '  t4',
    '}',
  ].join('\n')

  const layout = {
    version: 1,
    positions: {
      'public.t0': { x: 0, y: 0, parentId: 'group:g' },
      'public.t1': { x: 0, y: 350, parentId: 'group:g' },
      'public.t2': { x: 0, y: 700, parentId: 'group:g' },
      'public.t3': { x: 0, y: 1050, parentId: 'group:g' },
      'public.t4': { x: 0, y: 1400, parentId: 'group:g' },
    },
  }

  const createResp = await page.request.post('/api/projects', {
    data: { name: `TG-Arrange-${Date.now()}`, dbml_text, layout },
  })
  const created = await createResp.json()
  const projectId = created.id as string
  await page.goto(`/editor/${projectId}`)

  await page.waitForSelector('[data-testid^="group-region-"]')
  await expect
    .poll(async () => page.locator('.react-flow__node-table').count(), { timeout: 8000 })
    .toBeGreaterThanOrEqual(5)

  const region = page.locator('[data-testid^="group-region-"]').first()
  // 시드된 세로 레이아웃이 적용될 때까지 잠시 대기한 뒤 높이 측정.
  await page.waitForTimeout(500)
  const hBefore = (await region.boundingBox())!.height

  // hover the label → arrange button appears
  const handle = page.locator('.erd-group-handle').first()
  await handle.hover()
  const arrange = page.locator('[data-testid^="group-arrange-"]').first()
  await expect(arrange).toBeVisible()

  // autosave PATCH 대기자를 클릭 전에 arm (layout.positions가 실린 PATCH만 통과).
  const savePatch = page.waitForResponse((resp) => {
    if (!/\/api\/projects\//.test(resp.url())) return false
    if (resp.request().method() !== 'PATCH' || !resp.ok()) return false
    const body = resp.request().postDataJSON() as { layout?: { positions?: unknown } } | null
    return !!body?.layout?.positions
  })
  await arrange.click()
  await savePatch

  // 콤팩트 재배치 후 그룹 박스 높이가 줄었는지 확인.
  await expect.poll(async () => (await region.boundingBox())!.height, { timeout: 5000 }).toBeLessThan(hBefore)
})
