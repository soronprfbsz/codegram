import { test, expect, type Page } from '@playwright/test'

const PASSWORD = 'password123'

/** Register a fresh user; lands authenticated on the home route. */
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
  name varchar
}`

test.describe('Snapshot history', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies()
  })

  test('create, preview, and restore a manual snapshot', async ({ page }) => {
    await registerAndLogin(page, `snapshot-${Date.now()}@example.com`)

    // Seed a project via the authenticated API (cookie reused by page.request).
    const createResp = await page.request.post('/api/projects', {
      data: { name: 'Snapshot E2E', dbml_text: SAMPLE_DBML },
    })
    expect(createResp.status()).toBe(201)
    const { id } = await createResp.json()

    await page.goto(`/editor/${id}`)
    await page.waitForSelector('[data-testid="erd-canvas"]', { timeout: 15000 })

    // Open the history panel.
    await page.getByTestId('snapshot-history-button').click()
    await expect(page.getByTestId('snapshot-panel')).toBeVisible()

    // Manual tab is the default — create a snapshot.
    await page.getByTestId('snapshot-name-input').fill('first version')
    const postSnap = page.waitForResponse(
      (r) =>
        /\/api\/projects\/.+\/snapshots(\?|$)/.test(r.url()) &&
        r.request().method() === 'POST' &&
        r.status() === 201,
    )
    await page.getByTestId('snapshot-create-button').click()
    await postSnap

    // The row appears.
    const row = page.locator('[data-testid^="snapshot-row-"]')
    await expect(row).toHaveCount(1)
    await expect(row).toContainText('first version')

    // Click the row -> preview overlay opens with restore controls.
    await row.click()
    await expect(page.getByTestId('snapshot-preview-overlay')).toBeVisible()
    await expect(page.getByTestId('snapshot-preview-restore')).toBeVisible()

    // Restore -> overlay closes.
    const restoreResp = page.waitForResponse(
      (r) =>
        /\/restore$/.test(r.url()) &&
        r.request().method() === 'POST' &&
        r.status() === 200,
    )
    await page.getByTestId('snapshot-preview-restore').click()
    await restoreResp
    await expect(page.getByTestId('snapshot-preview-overlay')).toBeHidden()
  })

  test('switch to the auto tab and see the calendar', async ({ page }) => {
    await registerAndLogin(page, `snapshot-auto-${Date.now()}@example.com`)
    const createResp = await page.request.post('/api/projects', {
      data: { name: 'Snapshot Auto E2E', dbml_text: SAMPLE_DBML },
    })
    const { id } = await createResp.json()
    await page.goto(`/editor/${id}`)
    await page.waitForSelector('[data-testid="erd-canvas"]', { timeout: 15000 })

    await page.getByTestId('snapshot-history-button').click()
    await page.getByTestId('snapshot-tab-auto').click()
    // The month grid renders weekday headers.
    await expect(page.getByTestId('snapshot-panel')).toContainText('일')
  })
})
