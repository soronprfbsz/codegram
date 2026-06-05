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

test.describe('Project CRUD & autosave', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies()
  })

  test('create a project, edit, autosave, reload, and persist', async ({
    page,
  }) => {
    const email = `proj-${Date.now()}@example.com`
    const password = 'password123'
    await registerAndLogin(page, email, password)

    // Create a project; capture its id from the POST response.
    const createResponse = page.waitForResponse(
      (resp) =>
        resp.url().includes('/api/projects') &&
        resp.request().method() === 'POST' &&
        resp.status() === 201,
    )
    await page.getByPlaceholder('Project name').fill('E2E Project')
    await page.getByRole('button', { name: 'Create' }).click()
    const created = await (await createResponse).json()
    const projectId = created.id as string

    // Creating navigates straight into the editor.
    await page.waitForURL((url) => url.pathname === `/editor/${projectId}`)
    await expect(
      page.getByRole('heading', { name: 'E2E Project' }),
    ).toBeVisible()

    // Type DBML and wait for the debounced autosave PATCH to land.
    const dbml = 'table users {\n  id int [pk]\n}'
    const patchResponse = page.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/projects/${projectId}`) &&
        resp.request().method() === 'PATCH' &&
        resp.status() === 200,
    )
    const editor = page.getByTestId('dbml-editor')
    await editor.locator('.cm-content').click()
    await page.keyboard.type(dbml)
    const saved = await (await patchResponse).json()
    expect(saved.dbml_text).toContain('table users')

    // Reload and confirm the editor still holds the saved DBML.
    await page.reload()
    await page.waitForURL((url) => url.pathname === `/editor/${projectId}`)
    await expect(
      page.getByTestId('dbml-editor').locator('.cm-content'),
    ).toContainText('table users')
  })

  test('rename a project from the dashboard and persist the new name', async ({
    page,
  }) => {
    const email = `rename-${Date.now()}@example.com`
    const password = 'password123'
    await registerAndLogin(page, email, password)

    // Create a project; it navigates into the editor.
    const createResponse = page.waitForResponse(
      (resp) =>
        resp.url().includes('/api/projects') &&
        resp.request().method() === 'POST' &&
        resp.status() === 201,
    )
    await page.getByPlaceholder('Project name').fill('Before Rename')
    await page.getByRole('button', { name: 'Create' }).click()
    const created = await (await createResponse).json()
    const projectId = created.id as string
    await page.waitForURL((url) => url.pathname === `/editor/${projectId}`)

    // Back to the dashboard and rename the project inline.
    await page.getByRole('button', { name: 'Back' }).click()
    await page.waitForURL((url) => url.pathname === '/')

    const renameResponse = page.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/projects/${projectId}`) &&
        resp.request().method() === 'PATCH' &&
        resp.status() === 200,
    )
    await page.getByRole('button', { name: 'Rename' }).click()
    const renameInput = page.getByRole('listitem').getByRole('textbox')
    await expect(renameInput).toHaveValue('Before Rename')
    await renameInput.fill('After Rename')
    await page.getByRole('button', { name: 'Save' }).click()
    await renameResponse

    // The new name shows in the list and survives a reload.
    await expect(page.getByText('After Rename')).toBeVisible()
    await page.reload()
    await expect(page.getByText('After Rename')).toBeVisible()
  })

  test("cannot open another user's project (404 -> not found)", async ({
    page,
    context,
  }) => {
    const password = 'password123'

    // User A creates a project.
    const emailA = `usera-${Date.now()}@example.com`
    await registerAndLogin(page, emailA, password)

    const createResponse = page.waitForResponse(
      (resp) =>
        resp.url().includes('/api/projects') &&
        resp.request().method() === 'POST' &&
        resp.status() === 201,
    )
    await page.getByPlaceholder('Project name').fill('Secret')
    await page.getByRole('button', { name: 'Create' }).click()
    const created = await (await createResponse).json()
    const projectId = created.id as string

    // Log out user A.
    await page.goto('/')
    await page.getByRole('button', { name: /log out/i }).click()
    await page.waitForURL('**/login')
    await context.clearCookies()

    // User B logs in and tries to open user A's project by URL.
    const emailB = `userb-${Date.now()}@example.com`
    await registerAndLogin(page, emailB, password)

    await page.goto(`/editor/${projectId}`)
    await expect(page.getByText(/project not found/i)).toBeVisible()
  })
})
