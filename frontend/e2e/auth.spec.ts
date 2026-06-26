import { test, expect } from '@playwright/test'

test.describe('Authentication flow', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies()
  })

  test('unauthenticated visitor is redirected to /login', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForURL('**/login')
    await expect(
      page.getByRole('heading', { name: '로그인' }),
    ).toBeVisible()
  })

  test('register, land on authenticated home, then log out', async ({
    page,
    context,
  }) => {
    const email = `user-${Date.now()}@example.com`
    const password = 'password123'

    // Register
    await page.goto('/register')
    await expect(
      page.getByRole('heading', { name: '회원가입' }),
    ).toBeVisible()

    await page.locator('#register-email').fill(email)
    await page.locator('#register-password').fill(password)
    await page.locator('#register-confirm-password').fill(password)

    const loginResponse = page.waitForResponse(
      (resp) =>
        resp.url().includes('/api/auth/jwt/login') && resp.status() === 204,
    )
    await page.getByRole('button', { name: '회원가입' }).click()
    await loginResponse

    // Authenticated home shows the user email + logout button
    await page.waitForURL((url) => url.pathname === '/')
    await expect(page.getByText(email)).toBeVisible()
    await expect(
      page.getByRole('button', { name: /로그아웃/ }),
    ).toBeVisible()

    // The httpOnly JWT cookie is set
    const cookies = await context.cookies()
    const authCookie = cookies.find((c) => c.name === 'fastapiusersauth')
    expect(authCookie).toBeDefined()
    expect(authCookie?.httpOnly).toBe(true)

    // Log out → redirected to /login
    await page.getByRole('button', { name: /로그아웃/ }).click()
    await page.waitForURL('**/login')
    await expect(
      page.getByRole('heading', { name: '로그인' }),
    ).toBeVisible()

    // The auth cookie is cleared
    const cookiesAfter = await context.cookies()
    const authCookieAfter = cookiesAfter.find(
      (c) => c.name === 'fastapiusersauth',
    )
    expect(authCookieAfter?.value ?? '').toBe('')
  })

  test('log in as a freshly registered user', async ({ page }) => {
    const email = `login-${Date.now()}@example.com`
    const password = 'password123'

    // Seed a user via register (then it auto-logs-in and we log back out)
    await page.goto('/register')
    await page.locator('#register-email').fill(email)
    await page.locator('#register-password').fill(password)
    await page.locator('#register-confirm-password').fill(password)
    await page.getByRole('button', { name: '회원가입' }).click()
    await page.waitForURL((url) => url.pathname === '/')
    await page.getByRole('button', { name: /로그아웃/ }).click()
    await page.waitForURL('**/login')

    // Now log in explicitly
    await page.locator('#login-email').fill(email)
    await page.locator('#login-password').fill(password)
    const loginResponse = page.waitForResponse(
      (resp) =>
        resp.url().includes('/api/auth/jwt/login') && resp.status() === 204,
    )
    await page.getByRole('button', { name: '로그인' }).click()
    await loginResponse

    await page.waitForURL((url) => url.pathname === '/')
    await expect(page.getByText(email)).toBeVisible()
  })
})
