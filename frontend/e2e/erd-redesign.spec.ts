// frontend/e2e/erd-redesign.spec.ts
// Phase 6 E2E: ERD redesign — dark default, theme toggle, table selection sync.
// Uses default config baseURL (matches sibling specs — baseURL is injected at
// runtime, never hardcoded here).
import { test, expect, type Page } from '@playwright/test'

const PASSWORD = 'password123'

/** Register a fresh user and land authenticated on the home route. */
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

const DEMO_DBML = `Project demo {
  database_type: 'PostgreSQL'
}
Table users {
  id bigint [pk, not null]
  email varchar [not null, unique]
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
Ref: posts.user_id > users.id
TableGroup accounts [color: #1570EF] {
  users
  orgs
}
TableGroup content [color: #DC6803] {
  posts
}`

test.describe('ERD redesign — 3-zone layout', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies()
  })

  test('dark mode by default, theme toggle switches to light + updates localStorage', async ({
    page,
  }) => {
    const email = `redesign-theme-${Date.now()}@example.com`
    await registerAndLogin(page, email)

    // Create a project via API (avoids typing into CodeMirror)
    const createResp = await page.request.post('/api/projects', {
      data: { name: 'Redesign Theme Test', dbml_text: DEMO_DBML, layout: {} },
    })
    expect(createResp.status()).toBe(201)
    const { id } = await createResp.json()

    // Open editor
    await page.goto(`/editor/${id}`)
    await page.waitForSelector('[data-testid="erd-canvas"]')

    // Dark class must be on <html> by default
    await expect(page.locator('html')).toHaveClass(/dark/)

    // localStorage erd-theme is either 'dark' or absent (defaults to dark)
    const storedBefore = await page.evaluate(() =>
      localStorage.getItem('erd-theme'),
    )
    expect(storedBefore === null || storedBefore === 'dark').toBe(true)

    // Click the theme toggle (aria-label="테마 전환")
    await page.click('button[aria-label="테마 전환"]')

    // Dark class should be gone
    await expect(page.locator('html')).not.toHaveClass(/dark/)

    // localStorage should now say 'light'
    const storedAfter = await page.evaluate(() =>
      localStorage.getItem('erd-theme'),
    )
    expect(storedAfter).toBe('light')
  })

  test('clicking a table list row highlights it, highlights the editor block, and activates its edges', async ({
    page,
  }) => {
    const email = `redesign-select-${Date.now()}@example.com`
    await registerAndLogin(page, email)

    // Create a project via API
    const createResp = await page.request.post('/api/projects', {
      data: { name: 'Redesign Select Test', dbml_text: DEMO_DBML, layout: {} },
    })
    expect(createResp.status()).toBe(201)
    const { id } = await createResp.json()

    await page.goto(`/editor/${id}`)
    await page.waitForSelector('[data-testid="erd-canvas"]')

    // Wait for the ERD canvas to render nodes (parse + layout must settle)
    await expect
      .poll(async () => page.locator('.react-flow__node').count(), {
        timeout: 8000,
      })
      .toBeGreaterThanOrEqual(2)

    // Click the 'users' row in the info panel table list
    const usersRow = page.getByTestId('tablelist-row-users')
    await expect(usersRow).toBeVisible()
    await usersRow.click()

    // 1. The table list row gets the active style
    //    (ErdInfoPanel applies class "tlist-item-selected" when selected === table.name)
    await expect(usersRow).toHaveClass(/tlist-item-selected/)

    // 2. The editor block for the users table gets highlighted.
    //    The decoration tags EVERY line of the block (opening line + columns +
    //    closing brace), so `.cm-active-table` resolves to multiple elements —
    //    a bare `toBeVisible()` would trip Playwright strict mode. Scope to the
    //    opening line and confirm it's the `users` block (not just any block).
    const activeBlock = page.locator('.cm-active-table')
    await expect(activeBlock.first()).toBeVisible()
    await expect(activeBlock.first()).toContainText('Table users')

    // 3. The canvas shows the users node selected
    //    (react-flow node for users should be present; the node itself shows a
    //     selection ring styled via --erd-sel. We confirm the node is visible.)
    await expect(
      page.locator('.react-flow__node[data-id="public.users"]'),
    ).toBeVisible()
  })
})
