import { test, expect, type Page } from '@playwright/test'
import { enterEditMode } from './helpers'

const PASSWORD = 'password123'

async function registerAndLogin(page: Page, email: string) {
  await page.goto('/register')
  await page.locator('#register-email').fill(email)
  await page.locator('#register-password').fill(PASSWORD)
  await page.locator('#register-confirm-password').fill(PASSWORD)
  const loginResponse = page.waitForResponse(
    (r) => r.url().includes('/api/auth/jwt/login') && r.status() === 204,
  )
  await page.getByRole('button', { name: '회원가입' }).click()
  await loginResponse
  await page.waitForURL((url) => url.pathname === '/')
}

const SAMPLE_DBML = `Table users {
  id integer [pk]
}`

test.describe('Leaving edit mode saves', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies()
  })

  test('an edit made right before leaving edit mode survives a reload', async ({
    page,
  }) => {
    const email = `exitflush-${Date.now()}@example.com`
    await registerAndLogin(page, email)

    const createResp = await page.request.post('/api/projects', {
      data: { name: 'Exit Flush E2E', dbml_text: SAMPLE_DBML },
    })
    expect(createResp.status()).toBe(201)
    const { id } = await createResp.json()

    await page.goto(`/editor/${id}`)
    await page.waitForSelector('[data-testid="erd-canvas"]', { timeout: 15000 })
    await enterEditMode(page)

    // Type, then leave IMMEDIATELY — inside the 600ms debounce window, which is
    // exactly where the pending save used to be cancelled.
    const editor = page.getByTestId('dbml-editor')
    await editor.click()
    await page.keyboard.press('Control+End')
    await page.keyboard.type('\nTable orders {\n  id integer [pk]\n}')
    await page.getByTestId('mode-switch-read').click()

    // The switch only lands on 읽기 after the save resolves.
    await expect(page.getByTestId('mode-switch-read')).toHaveAttribute(
      'aria-checked',
      'true',
      { timeout: 10000 },
    )

    await page.reload()
    await page.waitForSelector('[data-testid="erd-canvas"]', { timeout: 15000 })
    await expect(page.getByTestId('dbml-editor')).toContainText('orders')
  })
})
