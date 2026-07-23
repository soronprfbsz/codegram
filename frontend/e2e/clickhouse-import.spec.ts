import { test, expect, type Page } from '@playwright/test'

async function registerAndLogin(page: Page, email: string, password: string) {
  await page.goto('/register')
  await page.locator('#register-email').fill(email)
  await page.locator('#register-password').fill(password)
  await page.locator('#register-confirm-password').fill(password)

  const loginResponse = page.waitForResponse(
    (resp) =>
      resp.url().includes('/api/auth/jwt/login') && resp.status() === 204,
  )
  await page.getByRole('button', { name: '회원가입' }).click()
  await loginResponse
  await page.waitForURL((url) => url.pathname === '/')
}

// Introspects a live ClickHouse (structured tables -> DBML, ADR-0021) and
// renders tables+columns on the ERD. ClickHouse has no schema-selection step
// (like MariaDB): the connected database is the scope.
//
// Unlike db-import.spec.ts (which targets the stack's own Postgres), this hits
// a specific external ClickHouse instance, so it is NOT reproducible in CI.
// It is skipped by default. Connection details come from env vars (no real
// credentials committed); run it against a live host like:
//   CH_LIVE=1 CH_HOST=<host> CH_PORT=8123 CH_USER=<user> \
//     CH_PASSWORD=<pw> CH_DATABASE=<db> CH_TABLE=<known-table> \
//     VITE_PROXY_TARGET=http://localhost:4000 \
//     npx playwright test clickhouse-import --project=chromium --reporter=line
test('connect to ClickHouse creates a project and renders tables', async ({
  page,
}) => {
  test.skip(
    !process.env.CH_LIVE,
    'requires a live ClickHouse (set CH_LIVE=1 and CH_HOST/CH_PORT/CH_USER/CH_PASSWORD/CH_DATABASE/CH_TABLE)',
  )
  const ch = {
    host: process.env.CH_HOST ?? '',
    port: process.env.CH_PORT ?? '8123',
    user: process.env.CH_USER ?? '',
    password: process.env.CH_PASSWORD ?? '',
    database: process.env.CH_DATABASE ?? '',
    table: process.env.CH_TABLE ?? 'events',
  }
  const email = `chimport-${Date.now()}@example.com`
  const password = 'password123'
  await registerAndLogin(page, email, password)

  await page.getByRole('button', { name: '데이터베이스 연결' }).click()

  await page.getByTestId('db-connect-dialect').selectOption('clickhouse')
  await page.getByTestId('db-connect-host').fill(ch.host)
  await page.getByTestId('db-connect-port').fill(ch.port)
  await page.getByTestId('db-connect-username').fill(ch.user)
  await page.getByTestId('db-connect-password').fill(ch.password)
  await page.getByTestId('db-connect-database').fill(ch.database)

  // ClickHouse hides the schema-selection UI (postgresql-only).
  await expect(page.getByTestId('db-connect-load-schemas')).toHaveCount(0)

  const introspectResponse = page.waitForResponse(
    (resp) => resp.url().includes('/api/introspect') && resp.status() === 200,
    { timeout: 30000 },
  )
  await page.getByRole('button', { name: '연결' }).click()
  await introspectResponse

  await expect(page).toHaveURL(/\/editor\//, { timeout: 15000 })
  await expect(page.getByTestId('erd-canvas')).toBeVisible({ timeout: 15000 })
  // A known table from the connected database renders as a node.
  await expect(page.getByText(ch.table, { exact: true }).first()).toBeVisible({
    timeout: 15000,
  })
})
