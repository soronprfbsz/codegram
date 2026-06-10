// frontend/e2e/db-sync.spec.ts
// Task 4 E2E: DB Sync — introspect replaces schema, preserves positions for
// surviving tables, removes tables dropped from the DB, and places new DB
// tables in the empty band below.
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
  await page.getByRole('button', { name: 'Sign up' }).click()
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

test('db-sync: introspect replaces schema, preserves positions, removes dropped tables', async ({
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

  // ── Step 1: open the Sync dialog ──────────────────────────────────────────
  await page.getByRole('button', { name: 'Sync from DB' }).click()

  // ── Step 2: fill the connection form ─────────────────────────────────────
  await page.getByTestId('db-connect-dialect').selectOption('postgresql')
  await page.getByTestId('db-connect-host').fill('postgres')
  await page.getByTestId('db-connect-port').fill('5432')
  await page.getByTestId('db-connect-username').fill('codegram_user')
  await page.getByTestId('db-connect-password').fill('postgres_dev')
  await page.getByTestId('db-connect-database').fill('codegram_dev')
  await page.getByTestId('db-connect-schema').fill('public')

  // ── Step 3: Connect — wait for introspect response ────────────────────────
  const introspectResponse = page.waitForResponse(
    (resp) =>
      resp.url().includes('/api/introspect') && resp.status() === 200,
  )
  await page.getByRole('button', { name: 'Connect' }).click()
  await introspectResponse

  // ── Step 4: overwrite confirm dialog — click Replace ─────────────────────
  const replaceBtn = page.getByRole('button', { name: 'Replace' })
  await expect(replaceBtn).toBeVisible({ timeout: 10000 })
  await replaceBtn.click()

  // Wait for the canvas to re-render after the schema swap
  await expect
    .poll(async () => page.locator('.react-flow__node').count(), {
      timeout: 10000,
    })
    .toBeGreaterThanOrEqual(1)

  // ── Assertions ────────────────────────────────────────────────────────────
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
