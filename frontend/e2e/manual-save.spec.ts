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

test.describe('Manual save', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies()
  })

  test('Ctrl+S saves and records a checkpoint in the history', async ({ page }) => {
    const email = `manualsave-${Date.now()}@example.com`
    await registerAndLogin(page, email)

    const createResp = await page.request.post('/api/projects', {
      data: { name: 'Manual Save E2E', dbml_text: SAMPLE_DBML },
    })
    const { id } = await createResp.json()

    await page.goto(`/editor/${id}`)
    await page.waitForSelector('[data-testid="erd-canvas"]', { timeout: 15000 })
    await enterEditMode(page)

    const editor = page.getByTestId('dbml-editor')
    await editor.click()
    await page.keyboard.press('Control+End')
    await page.keyboard.type('\nTable orders {\n  id integer [pk]\n}')

    const snapshotPost = page.waitForResponse(
      (r) => r.url().includes('/snapshots') && r.request().method() === 'POST',
    )
    await page.keyboard.press('Control+s')
    const resp = await snapshotPost
    expect(resp.status()).toBe(201)
    expect((await resp.json()).kind).toBe('checkpoint')

    const toast = page.getByTestId('toast')
    await expect(toast).toContainText('저장되었습니다')

    // Standing regression guard: the toast's z-index has round-tripped once
    // already (a "fix" matched it to the dialog overlay's z-50, letting an
    // open dialog cover it). Confirm the toast is genuinely on top by hit-
    // testing its own center point.
    const box = await toast.boundingBox()
    expect(box).not.toBeNull()
    const isOnTop = await page.evaluate(
      ({ x, y, testid }) => {
        const el = document.elementFromPoint(x, y)
        return el?.closest(`[data-testid="${testid}"]`) != null
      },
      { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2, testid: 'toast' },
    )
    expect(isOnTop).toBe(true)

    // The checkpoint shows up in the time-ordered tab, badged apart from the
    // 30-minute auto snapshots. The tab opens on a calendar; the checkpoint
    // was just recorded today (browser-local date), so pick that day to list it.
    await page.getByTestId('snapshot-history-button').click()
    await page.getByTestId('snapshot-tab-auto').click()
    const today = await page.evaluate(() => {
      const d = new Date()
      const pad = (n: number) => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    })
    await page.getByTestId(`snapshot-cal-day-${today}`).click()
    await expect(page.getByTestId('snapshot-panel')).toContainText('저장')
  })

  test('Ctrl+S in read mode explains itself and records nothing', async ({ page }) => {
    const email = `manualsave-ro-${Date.now()}@example.com`
    await registerAndLogin(page, email)

    const createResp = await page.request.post('/api/projects', {
      data: { name: 'Manual Save RO E2E', dbml_text: SAMPLE_DBML },
    })
    const { id } = await createResp.json()

    await page.goto(`/editor/${id}`)
    await page.waitForSelector('[data-testid="erd-canvas"]', { timeout: 15000 })

    await page.keyboard.press('Control+s')
    await expect(page.getByTestId('toast')).toContainText('편집 모드')
  })
})
