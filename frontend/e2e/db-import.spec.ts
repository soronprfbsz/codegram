import { test, expect, type Page } from '@playwright/test'

// Point this spec at the Docker frontend (port 4001) whose Vite proxy
// correctly forwards /api to the backend container. The global config's
// webServer (localhost:5173) lacks a live backend to proxy to.
test.use({ baseURL: 'http://localhost:4001' })

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

test('connect to database creates a new project with ERD canvas', async ({
  page,
}) => {
  const email = `dbimport-${Date.now()}@example.com`
  const password = 'password123'
  await registerAndLogin(page, email, password)

  // Open the DB connect dialog.
  await page.getByRole('button', { name: 'Connect to Database' }).click()

  // Fill in connection details pointing at the stack's own Postgres.
  await page.getByTestId('db-connect-dialect').selectOption('postgresql')
  await page.getByTestId('db-connect-host').fill('postgres')
  await page.getByTestId('db-connect-port').fill('5432')
  await page.getByTestId('db-connect-username').fill('erddbml_user')
  await page.getByTestId('db-connect-password').fill('postgres_dev')
  await page.getByTestId('db-connect-database').fill('erddbml_dev')
  await page.getByTestId('db-connect-schema').fill('public')

  // Arm the response waiter before clicking to avoid a race condition.
  const introspectResponse = page.waitForResponse(
    (resp) =>
      resp.url().includes('/api/introspect') && resp.status() === 200,
  )
  await page.getByRole('button', { name: 'Connect' }).click()
  await introspectResponse

  // The dialog creates a project and navigates to the editor.
  await expect(page).toHaveURL(/\/editor\//, { timeout: 15000 })
  await expect(page.getByTestId('erd-canvas')).toBeVisible({ timeout: 15000 })
})
