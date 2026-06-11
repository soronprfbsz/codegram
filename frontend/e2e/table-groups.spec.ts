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
  await page.getByRole('button', { name: 'Sign up' }).click()
  await loginResponse
  await page.waitForURL((url) => url.pathname === '/')
}

test('table groups: full CRUD scenario', async ({ page }) => {
  const email = `tg-${Date.now()}@example.com`
  const password = 'password123'
  await registerAndLogin(page, email, password)

  // Create a project and land in the editor.
  const createResponse = page.waitForResponse(
    (resp) =>
      resp.url().includes('/api/projects') &&
      resp.request().method() === 'POST' &&
      resp.status() === 201,
  )
  await page.getByPlaceholder('Project name').fill('TG Test')
  await page.getByRole('button', { name: 'Create' }).click()
  const created = await (await createResponse).json()
  const projectId = created.id as string
  await page.waitForURL((url) => url.pathname === `/editor/${projectId}`)

  // Type a two-table DBML schema.
  const dbml = [
    'Table users {',
    '  id integer [pk]',
    '}',
    'Table posts {',
    '  id integer [pk]',
    '}',
  ].join('\n')

  const editor = page.getByTestId('dbml-editor')
  await editor.locator('.cm-content').click()
  await page.keyboard.type(dbml)

  // Wait for Valid badge (parse settles after 600ms debounce).
  await expect(page.getByText('Valid')).toBeVisible({ timeout: 10_000 })

  // ── Step 1: Create group 'auth' ───────────────────────────────────────
  await page.getByTestId('group-create-button').click()
  await page.getByTestId('group-create-input').fill('auth')
  await page.keyboard.press('Enter')

  // Wait for TableGroup auth to appear in editor.
  await expect
    .poll(
      async () =>
        page.getByTestId('dbml-editor').locator('.cm-content').textContent(),
      { timeout: 10_000 },
    )
    .toContain('TableGroup auth {')

  // ── Step 2: Move users into 'auth' ────────────────────────────────────
  await expect(page.getByText('Valid')).toBeVisible({ timeout: 10_000 })

  await page.getByTestId('table-move-users').click()
  await page.getByRole('menuitem', { name: 'auth' }).click()

  await expect
    .poll(
      async () =>
        page.getByTestId('dbml-editor').locator('.cm-content').textContent(),
      { timeout: 10_000 },
    )
    .toMatch(/TableGroup auth \{[\s\S]*users[\s\S]*\}/)

  // ── Step 3: Set color #EA4A8B on 'auth' ───────────────────────────────
  await expect(page.getByText('Valid')).toBeVisible({ timeout: 10_000 })

  await page.getByTestId('group-menu-auth').click()
  await page.getByTestId('swatch-#EA4A8B').click()
  // Swatch is a plain button (not DropdownMenuItem), so Radix won't auto-close
  // the menu. Dismiss it with Escape.
  await page.keyboard.press('Escape')

  await expect
    .poll(
      async () =>
        page.getByTestId('dbml-editor').locator('.cm-content').textContent(),
      { timeout: 10_000 },
    )
    .toContain('[color: #EA4A8B]')

  // Wait for any Radix dropdown portal to close before clicking toggle.
  await expect(page.locator('[role="menu"]')).toHaveCount(0, { timeout: 5_000 })

  // ── Step 4: Collapse/expand 'auth' ────────────────────────────────────
  await page.getByTestId('group-toggle-auth').click()
  await expect(page.getByTestId('tablelist-row-users')).toBeHidden()

  await page.getByTestId('group-toggle-auth').click()
  await expect(page.getByTestId('tablelist-row-users')).toBeVisible()

  // ── Step 5: Rename 'auth' → 'core' ────────────────────────────────────
  await expect(page.getByText('Valid')).toBeVisible({ timeout: 10_000 })

  await page.getByTestId('group-menu-auth').click()
  await page.getByRole('menuitem', { name: 'Rename' }).click()
  await page.getByTestId('group-rename-input').fill('core')
  await page.keyboard.press('Enter')

  await expect
    .poll(
      async () =>
        page.getByTestId('dbml-editor').locator('.cm-content').textContent(),
      { timeout: 10_000 },
    )
    .toContain('TableGroup core')

  // ── Step 6: Delete 'core' ─────────────────────────────────────────────
  await expect(page.getByText('Valid')).toBeVisible({ timeout: 10_000 })

  await page.getByTestId('group-menu-core').click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()

  await expect
    .poll(
      async () =>
        page.getByTestId('dbml-editor').locator('.cm-content').textContent(),
      { timeout: 10_000 },
    )
    .not.toContain('TableGroup')

  // users should still be listed (now Ungrouped).
  await expect(page.getByTestId('tablelist-row-users')).toBeVisible()

  // ── Step 7: Off-canvas toggle ─────────────────────────────────────────
  // Panel is open by default — schema-summary-grid is visible.
  await expect(page.getByTestId('schema-summary-grid')).toBeInViewport()

  // Click Info to close the panel (grid column collapses to 0px, overflow hidden).
  await page.getByRole('button', { name: /^info$/i }).click()

  // Poll the info-panel-column width until it reaches 0 (CSS transition 200ms).
  await expect
    .poll(
      async () => {
        const col = page.getByTestId('info-panel-column')
        const box = await col.boundingBox()
        return box?.width ?? -1
      },
      { timeout: 5_000 },
    )
    .toBe(0)

  // Click Info again to re-open.
  await page.getByRole('button', { name: /^info$/i }).click()
  await expect(page.getByTestId('schema-summary-grid')).toBeInViewport({ timeout: 5_000 })
})
