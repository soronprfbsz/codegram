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

test('connect to database creates a new project with ERD canvas', async ({
  page,
}) => {
  const email = `dbimport-${Date.now()}@example.com`
  const password = 'password123'
  await registerAndLogin(page, email, password)

  // Open the DB connect dialog.
  await page.getByRole('button', { name: '데이터베이스 연결' }).click()

  // Fill in connection details pointing at the stack's own Postgres.
  await page.getByTestId('db-connect-dialect').selectOption('postgresql')
  await page.getByTestId('db-connect-host').fill('postgres')
  await page.getByTestId('db-connect-port').fill('5432')
  await page.getByTestId('db-connect-username').fill('codegram_user')
  await page.getByTestId('db-connect-password').fill('postgres_dev')
  await page.getByTestId('db-connect-database').fill('codegram_dev')
  await page.getByTestId('db-connect-schema').fill('public')

  // Arm the response waiter before clicking to avoid a race condition.
  const introspectResponse = page.waitForResponse(
    (resp) =>
      resp.url().includes('/api/introspect') && resp.status() === 200,
  )
  await page.getByRole('button', { name: '연결' }).click()
  await introspectResponse

  // The dialog creates a project and navigates to the editor.
  await expect(page).toHaveURL(/\/editor\//, { timeout: 15000 })
  await expect(page.getByTestId('erd-canvas')).toBeVisible({ timeout: 15000 })
})
