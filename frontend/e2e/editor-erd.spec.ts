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

test.describe('Editor ERD canvas', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies()
  })

  test('typing DBML renders table nodes and a relationship edge', async ({
    page,
  }) => {
    const email = `erd-${Date.now()}@example.com`
    const password = 'password123'
    await registerAndLogin(page, email, password)

    // Create a project; capture its id and land in the editor.
    const createResponse = page.waitForResponse(
      (resp) =>
        resp.url().includes('/api/projects') &&
        resp.request().method() === 'POST' &&
        resp.status() === 201,
    )
    await page.getByPlaceholder('Project name').fill('ERD Project')
    await page.getByRole('button', { name: 'Create' }).click()
    const created = await (await createResponse).json()
    const projectId = created.id as string
    await page.waitForURL((url) => url.pathname === `/editor/${projectId}`)

    // Type a two-table schema with a foreign-key relationship.
    const dbml = [
      'Table users {',
      '  id integer [pk]',
      '}',
      'Table posts {',
      '  id integer [pk]',
      '  user_id integer [ref: > users.id]',
      '}',
    ].join('\n')
    const editor = page.getByTestId('dbml-editor')
    await editor.locator('.cm-content').click()
    await page.keyboard.type(dbml)

    // The ERD canvas mounts once the debounced parse settles.
    await expect(page.locator('.react-flow')).toBeVisible()

    // At least two table nodes render (users + posts).
    await expect
      .poll(async () => page.locator('.react-flow__node').count(), {
        timeout: 5000,
      })
      .toBeGreaterThanOrEqual(2)

    // The table names appear in the rendered nodes.
    await expect(page.locator('.react-flow__node')).toContainText(['users'])
    await expect(page.locator('.react-flow__node')).toContainText(['posts'])

    // At least one relationship edge path renders.
    await expect
      .poll(async () => page.locator('.react-flow__edge').count(), {
        timeout: 5000,
      })
      .toBeGreaterThanOrEqual(1)
    await expect(
      page.locator('.react-flow__edge-path').first(),
    ).toBeVisible()
  })
})
