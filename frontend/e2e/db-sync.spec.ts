// frontend/e2e/db-sync.spec.ts
// Task 4 E2E: DB Sync — introspect MERGES into the current schema (live DB drives
// structure), preserves positions for surviving tables, removes tables dropped
// from the DB, and places new DB tables in the empty band below.
// Task 8 E2E: multi-schema select + partial re-sync preserves non-synced schemas.
//
// Default baseURL (5173 via playwright.config.ts) — same as sibling specs.
// The test won't reach the DB locally without the docker stack at 4001, which
// is the same pre-existing constraint for all specs in this project.
import { test, expect, type Page } from '@playwright/test'

const PASSWORD = 'password123'

async function registerAndLogin(page: Page, email: string) {
  await page.goto('/register')
  await page.locator('#register-email').fill(email)
  await page.locator('#register-password').fill(PASSWORD)
  await page.locator('#register-confirm-password').fill(PASSWORD)

  const loginResponse = page.waitForResponse(
    (resp) =>
      resp.url().includes('/api/auth/jwt/login') && resp.status() === 204,
  )
  await page.getByRole('button', { name: '회원가입' }).click()
  await loginResponse
  await page.waitForURL((url) => url.pathname === '/')
}

// Initial DBML: one table that ALSO exists in the target DB (project), plus
// a throwaway that does NOT (will_be_removed).  Positions use the
// schema-qualified keys that LayoutPositions / computeSyncedPositions expect.
const INITIAL_DBML = `Table project {
  id uuid [pk]
}

Table will_be_removed {
  id int [pk]
}`

const INITIAL_LAYOUT = {
  version: 1,
  positions: {
    'public.project': { x: 40, y: 40 },
    'public.will_be_removed': { x: 400, y: 400 },
  },
}

test('db-sync: introspect merges schema, preserves positions, removes dropped tables', async ({
  page,
}) => {
  const email = `dbsync-${Date.now()}@example.com`
  await registerAndLogin(page, email)

  // Create a project via authenticated API (avoids CodeMirror typing overhead)
  const createResp = await page.request.post('/api/projects', {
    data: {
      name: 'DB Sync E2E Test',
      dbml_text: INITIAL_DBML,
      layout: INITIAL_LAYOUT,
    },
  })
  expect(createResp.status()).toBe(201)
  const { id } = await createResp.json()

  // Open the editor and wait for the canvas
  await page.goto(`/editor/${id}`)
  await page.waitForSelector('[data-testid="erd-canvas"]', { timeout: 15000 })

  // Wait for react-flow to render the initial nodes
  await expect
    .poll(async () => page.locator('.react-flow__node').count(), {
      timeout: 10000,
    })
    .toBeGreaterThanOrEqual(2)

  // ── Step 1: open the Sync dialog (topbar → Import → DB 동기화) ──
  await page.getByTestId('import-menu-button').click()
  await page.getByRole('menuitem', { name: 'DB에서 동기화' }).click()

  // ── Step 2: fill the connection form ─────────────────────────────────────
  await page.getByTestId('db-connect-dialect').selectOption('postgresql')
  await page.getByTestId('db-connect-host').fill('postgres')
  await page.getByTestId('db-connect-port').fill('5432')
  await page.getByTestId('db-connect-username').fill('codegram_user')
  await page.getByTestId('db-connect-password').fill('postgres_dev')
  await page.getByTestId('db-connect-database').fill('codegram_dev')
  await page.getByTestId('db-connect-load-schemas').click()
  await page.getByTestId('db-connect-schema-option-public').waitFor({ state: 'visible', timeout: 10000 })
  await page.getByTestId('db-connect-schema-option-public').check()

  // ── Step 3: Connect — wait for introspect response ────────────────────────
  const introspectResponse = page.waitForResponse(
    (resp) =>
      resp.url().includes('/api/introspect') && resp.status() === 200,
  )
  await page.getByRole('button', { name: '연결' }).click()
  await introspectResponse

  // ── Step 4: sync confirm dialog — click Sync ─────────────────────────────
  const syncBtn = page.getByRole('button', { name: '동기화', exact: true })
  await expect(syncBtn).toBeVisible({ timeout: 10000 })
  await syncBtn.click()

  // Wait for the canvas to re-render after the merge
  await expect
    .poll(async () => page.locator('.react-flow__node').count(), {
      timeout: 10000,
    })
    .toBeGreaterThanOrEqual(1)

  // ── Assertions ────────────────────────────────────────────────────────────
  //
  // tablelist rows live in the info panel, which is now hidden by default —
  // open it via the topbar 정보 button before asserting on its rows.
  await page.getByTestId('info-panel-button').click()
  // Groups are collapsed by default; introspected tables land in 미분류 —
  // expand it so the table rows below are visible.
  await page.getByTestId('group-toggle-__ungrouped').click()
  //
  // Selectors note:
  //   • tablelist-row-{table.name}  — uses the UNQUALIFIED table name (ErdInfoPanel
  //     renders `data-testid=\`tablelist-row-${table.name}\`\`).
  //   • react-flow node data-id     — uses `${schema}.${name}` (schemaToFlow uses
  //     DbmlTable.id which is `${schema}.${name}`).
  //
  // 1. The `project` table survives (it IS in the DB schema)
  await expect(page.getByTestId('tablelist-row-project')).toBeVisible({
    timeout: 10000,
  })

  // 2. `will_be_removed` is gone (it is NOT in the DB schema)
  await expect(
    page.getByTestId('tablelist-row-will_be_removed'),
  ).not.toBeVisible()

  // 3. At least one new DB-only table (`user`) appears
  await expect(page.getByTestId('tablelist-row-user')).toBeVisible({
    timeout: 10000,
  })

  // 4. Canvas nodes reflect the same result (react-flow data-id selector)
  await expect(
    page.locator('.react-flow__node[data-id="public.project"]'),
  ).toBeVisible()
  await expect(
    page.locator('.react-flow__node[data-id="public.will_be_removed"]'),
  ).not.toBeVisible()
  await expect(
    page.locator('.react-flow__node[data-id="public.user"]'),
  ).toBeVisible()
})

// DBML that spans two schemas: public (will be synced) + sales (will NOT be synced).
// The sales.orders node must survive after a public-only sync — proving schema-scoped merge.
const MULTI_SCHEMA_DBML = `Table "public"."project" {
  id uuid [pk]
}

Table "sales"."orders" {
  id integer [pk]
}`

const MULTI_SCHEMA_LAYOUT = {
  version: 1,
  positions: {
    'public.project': { x: 40, y: 40 },
    'sales.orders': { x: 400, y: 40 },
  },
}

test('db-sync: partial re-sync (public only) preserves non-synced sales schema tables', async ({
  page,
}) => {
  const email = `dbsync-multi-${Date.now()}@example.com`
  await registerAndLogin(page, email)

  // Create a project that contains BOTH public and sales tables in its DBML
  const createResp = await page.request.post('/api/projects', {
    data: {
      name: 'Multi-Schema Partial Sync E2E',
      dbml_text: MULTI_SCHEMA_DBML,
      layout: MULTI_SCHEMA_LAYOUT,
    },
  })
  expect(createResp.status()).toBe(201)
  const { id } = await createResp.json()

  // Open the editor and wait for the canvas
  await page.goto(`/editor/${id}`)
  await page.waitForSelector('[data-testid="erd-canvas"]', { timeout: 15000 })

  // Wait for both nodes to render
  await expect
    .poll(async () => page.locator('.react-flow__node').count(), {
      timeout: 10000,
    })
    .toBeGreaterThanOrEqual(2)

  // Confirm sales.orders is visible before sync
  await expect(
    page.locator('.react-flow__node[data-id="sales.orders"]'),
  ).toBeVisible()

  // ── Open Sync dialog ──────────────────────────────────────────────────────
  await page.getByTestId('import-menu-button').click()
  await page.getByRole('menuitem', { name: 'DB에서 동기화' }).click()

  // ── Fill connection form ──────────────────────────────────────────────────
  await page.getByTestId('db-connect-dialect').selectOption('postgresql')
  await page.getByTestId('db-connect-host').fill('postgres')
  await page.getByTestId('db-connect-port').fill('5432')
  await page.getByTestId('db-connect-username').fill('codegram_user')
  await page.getByTestId('db-connect-password').fill('postgres_dev')
  await page.getByTestId('db-connect-database').fill('codegram_dev')

  // Load schemas then select ONLY public — leave sales unchecked
  await page.getByTestId('db-connect-load-schemas').click()
  await page.getByTestId('db-connect-schema-option-public').waitFor({ state: 'visible', timeout: 10000 })
  await page.getByTestId('db-connect-schema-option-public').check()
  // Precondition: sales schema must be seeded so we can verify it's genuinely
  // excluded from the sync. If it's missing the test skips (visibly) rather than
  // passing silently without actually exercising the preservation guarantee.
  const salesOption = page.getByTestId('db-connect-schema-option-sales')
  const salesVisible = await salesOption.isVisible().catch(() => false)
  test.skip(!salesVisible, 'sales schema not seeded in target DB — preservation precondition unmet')
  await salesOption.uncheck() // ensure public-only selection (sales explicitly excluded)

  // ── Connect (introspect public only) ──────────────────────────────────────
  const introspectResponse = page.waitForResponse(
    (resp) =>
      resp.url().includes('/api/introspect') && resp.status() === 200,
  )
  await page.getByRole('button', { name: '연결' }).click()
  await introspectResponse

  // ── Confirm sync ──────────────────────────────────────────────────────────
  const syncBtn = page.getByRole('button', { name: '동기화', exact: true })
  await expect(syncBtn).toBeVisible({ timeout: 10000 })
  await syncBtn.click()

  // Wait for canvas re-render
  await expect
    .poll(async () => page.locator('.react-flow__node').count(), {
      timeout: 10000,
    })
    .toBeGreaterThanOrEqual(1)

  // ── Key assertion: sales.orders survived the public-only sync ─────────────
  // Schema-scoped merge must not touch tables outside the synced schemas.
  await expect(
    page.locator('.react-flow__node[data-id="sales.orders"]'),
  ).toBeVisible()

  // Sanity: public.project is also present (was in DB, so it was kept/merged)
  await expect(
    page.locator('.react-flow__node[data-id="public.project"]'),
  ).toBeVisible()
})
