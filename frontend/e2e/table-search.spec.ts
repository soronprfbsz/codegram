// frontend/e2e/table-search.spec.ts
// E2E for the Info-panel table search: filter, navigate (select + DBML scroll +
// canvas center), match hint, and the "/" focus shortcut. Verifies the pieces
// jsdom unit tests can't (real React Flow viewport geometry, CodeMirror scroll).
import { test, expect, type Page } from '@playwright/test'

const PASSWORD = 'password123'

async function registerAndLogin(page: Page, email: string) {
  await page.goto('/register')
  await page.locator('#register-email').fill(email)
  await page.locator('#register-password').fill(PASSWORD)
  await page.locator('#register-confirm-password').fill(PASSWORD)
  const loginResponse = page.waitForResponse(
    (resp) => resp.url().includes('/api/auth/jwt/login') && resp.status() === 204,
  )
  await page.getByRole('button', { name: 'Sign up' }).click()
  await loginResponse
  await page.waitForURL((url) => url.pathname === '/')
}

const DEMO_DBML = `Project demo {
  database_type: 'PostgreSQL'
}
Table users {
  id bigint [pk, not null]
  email varchar [not null, unique, note: '로그인 식별자']
  org_id bigint [not null]
}
Table orgs {
  id bigint [pk, not null]
  name varchar [not null]
}
Table posts {
  id bigint [pk, not null]
  user_id bigint [not null]
  title varchar
}
Ref: users.org_id > orgs.id
Ref: posts.user_id > users.id`

async function openEditor(page: Page, name: string) {
  const resp = await page.request.post('/api/projects', {
    data: { name, dbml_text: DEMO_DBML, layout: {} },
  })
  expect(resp.status()).toBe(201)
  const { id } = await resp.json()
  await page.goto(`/editor/${id}`)
  await page.waitForSelector('[data-testid="erd-canvas"]')
  await expect
    .poll(async () => page.locator('.react-flow__node').count(), { timeout: 8000 })
    .toBeGreaterThanOrEqual(3)
}

test.describe('Info panel table search', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies()
  })

  test('filters by name and navigates: selects node + scrolls DBML + centers canvas', async ({
    page,
  }) => {
    await registerAndLogin(page, `search-nav-${Date.now()}@example.com`)
    await openEditor(page, 'Search Nav Test')

    const viewport = page.locator('.react-flow__viewport')
    const before = await viewport.getAttribute('style')

    const input = page.getByTestId('table-search-input')
    await input.fill('posts')

    // Only the matching table remains in the list.
    await expect(page.getByTestId('tablelist-row-posts')).toBeVisible()
    await expect(page.getByTestId('tablelist-row-users')).toHaveCount(0)

    // Enter navigates to the top match.
    await input.press('Enter')

    // Node selected.
    await expect(page.locator('.react-flow__node[data-id="public.posts"]')).toBeVisible()
    // DBML editor scrolled to / highlighted the posts block.
    await expect(page.locator('.cm-active-table').first()).toContainText('Table posts')
    // Canvas viewport actually moved (centerOnNode ran → transform changed).
    await expect.poll(async () => viewport.getAttribute('style')).not.toBe(before)
  })

  test('column / note matches show a hint and the match-column is highlighted on the node', async ({
    page,
  }) => {
    await registerAndLogin(page, `search-hint-${Date.now()}@example.com`)
    await openEditor(page, 'Search Hint Test')

    const input = page.getByTestId('table-search-input')

    // Column-name match → hint names the column.
    await input.fill('title')
    await expect(page.getByTestId('tablelist-row-posts')).toBeVisible()
    await expect(page.getByTestId('tablelist-hint-posts')).toHaveText('컬럼: title')

    // Column-note match (Korean) → users matches via the email note.
    await input.fill('로그인')
    await expect(page.getByTestId('tablelist-row-users')).toBeVisible()
    await expect(page.getByTestId('tablelist-hint-users')).toHaveText('컬럼 주석 일치')

    await page.getByTestId('tablelist-row-users').click()
    // The matched column row (email) is highlighted on the users node — this is
    // the search-driven highlight (email is not an FK, so selection alone would
    // leave it transparent).
    const emailCol = page.getByTestId('column-public.users.email')
    await expect(emailCol).toBeVisible()
    await expect
      .poll(async () => emailCol.evaluate((el) => (el as HTMLElement).style.background))
      .toContain('--erd-accent-soft')
  })

  test('"/" focuses the search box when not typing in the editor', async ({ page }) => {
    await registerAndLogin(page, `search-slash-${Date.now()}@example.com`)
    await openEditor(page, 'Search Slash Test')

    // Click empty canvas area so focus is not in an input/editor.
    await page.locator('[data-testid="erd-canvas"]').click({ position: { x: 5, y: 5 } })
    await page.keyboard.press('/')

    const input = page.getByTestId('table-search-input')
    await expect(input).toBeFocused()
    // The "/" must not have been typed into the box.
    await expect(input).toHaveValue('')
  })
})
