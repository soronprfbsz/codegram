// frontend/e2e/sql.spec.ts
import { test, expect, type Page } from '@playwright/test'

const PASSWORD = 'password123'

/** Register a fresh user; lands authenticated on the home route. */
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

/** Create a project from the home page and navigate into its editor. */
async function createProjectAndOpen(
  page: Page,
  name: string,
): Promise<string> {
  const createResponse = page.waitForResponse(
    (resp) =>
      resp.url().includes('/api/projects') &&
      resp.request().method() === 'POST' &&
      resp.status() === 201,
  )
  await page.getByPlaceholder('Project name').fill(name)
  await page.getByRole('button', { name: 'Create' }).click()
  const created = await (await createResponse).json()
  const projectId = created.id as string
  await page.waitForURL((url) => url.pathname === `/editor/${projectId}`)
  return projectId
}

/** Type DBML into the CodeMirror editor (replaces any existing content). */
async function typeDbml(page: Page, dbml: string) {
  const editor = page.getByTestId('dbml-editor')
  await editor.locator('.cm-content').click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('Delete')
  await page.keyboard.type(dbml)
}

/** Open the Export dropdown in the editor header. */
async function openExportMenu(page: Page) {
  await page.getByRole('button', { name: /export/i }).click()
}

/** Wait for the canvas to render both nodes. */
async function waitForTwoNodes(page: Page) {
  await expect(page.locator('.react-flow')).toBeVisible()
  await expect
    .poll(async () => page.locator('.react-flow__node').count(), {
      timeout: 5000,
    })
    .toBeGreaterThanOrEqual(2)
}

const SAMPLE_SQL = [
  'CREATE TABLE users (',
  '  id SERIAL PRIMARY KEY,',
  '  email VARCHAR(255) NOT NULL',
  ');',
  'CREATE TABLE posts (',
  '  id SERIAL PRIMARY KEY,',
  '  user_id INT REFERENCES users(id)',
  ');',
].join('\n')

test.describe('SQL import/export', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies()
  })

  test('imports a PostgreSQL schema and renders it as an ERD', async ({
    page,
  }) => {
    await registerAndLogin(page, `sql-import-${Date.now()}@example.com`)
    await createProjectAndOpen(page, 'SQL Import')

    // Open the import modal from the editor header.
    await page.getByRole('button', { name: 'Import SQL' }).click()

    // Paste the SQL into the modal textarea (dialect defaults to PostgreSQL).
    await page.getByTestId('sql-import-textarea').fill(SAMPLE_SQL)

    // Click Import. The project starts empty, so no overwrite confirm appears.
    await page.getByRole('button', { name: 'Import', exact: true }).click()

    // The converted DBML replaces the editor text -> the ERD renders both
    // imported tables.
    await waitForTwoNodes(page)
    await expect(page.getByText('users').first()).toBeVisible()
    await expect(page.getByText('posts').first()).toBeVisible()
  })

  test('imports a PostgreSQL schema from an uploaded .sql file', async ({
    page,
  }) => {
    await registerAndLogin(page, `sql-import-file-${Date.now()}@example.com`)
    await createProjectAndOpen(page, 'SQL Import File')

    await page.getByRole('button', { name: 'Import SQL' }).click()

    // Upload a .sql file via the hidden file input (bypasses the OS picker).
    await page.getByTestId('sql-file-input').setInputFiles({
      name: 'schema.sql',
      mimeType: 'text/plain',
      buffer: Buffer.from(SAMPLE_SQL),
    })

    await page.getByRole('button', { name: 'Import', exact: true }).click()

    await waitForTwoNodes(page)
    await expect(page.getByText('users').first()).toBeVisible()
  })

  test('exports the current DBML to a PostgreSQL .sql file', async ({
    page,
  }) => {
    await registerAndLogin(page, `sql-export-${Date.now()}@example.com`)
    await createProjectAndOpen(page, 'SQL Export')
    await typeDbml(
      page,
      ['Table users {', '  id int [pk]', '  email varchar', '}'].join('\n'),
    )
    // Wait for the node so the Export trigger is enabled (gated on a parsed,
    // non-empty schema).
    await expect
      .poll(async () => page.locator('.react-flow__node').count(), {
        timeout: 5000,
      })
      .toBeGreaterThanOrEqual(1)

    // Open the Export menu, then ARM the download listener BEFORE the click.
    await openExportMenu(page)
    const sqlDownload = page.waitForEvent('download')
    await page.getByRole('menuitem', { name: 'SQL · PostgreSQL' }).click()
    expect((await sqlDownload).suggestedFilename()).toBe('schema.postgres.sql')
  })
})
