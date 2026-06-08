// frontend/e2e/export.spec.ts
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

/** Create a project from the home page and navigate into its editor.
 *  Returns the new project id. */
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

/** Wait for the canvas to render both nodes (capture needs a measured
 *  viewport with nodes present). */
async function waitForTwoNodes(page: Page) {
  await expect(page.locator('.react-flow')).toBeVisible()
  await expect
    .poll(async () => page.locator('.react-flow__node').count(), {
      timeout: 5000,
    })
    .toBeGreaterThanOrEqual(2)
}

const SAMPLE_DBML = [
  'Table users {',
  '  id integer [pk]',
  '  email varchar [unique, not null, note: "login id"]',
  '}',
  'Table posts {',
  '  id integer [pk]',
  '  user_id integer [ref: > users.id]',
  '}',
].join('\n')

test.describe('Editor export', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies()
  })

  test('exports the diagram to PNG, SVG and PDF', async ({ page }) => {
    await registerAndLogin(page, `export-diagram-${Date.now()}@example.com`)
    await createProjectAndOpen(page, 'Export Diagram')
    await typeDbml(page, SAMPLE_DBML)
    await waitForTwoNodes(page)

    // Diagram PNG → a download fires. ARM the listener BEFORE the click.
    await openExportMenu(page)
    const pngDownload = page.waitForEvent('download')
    await page.getByRole('menuitem', { name: 'Diagram PNG' }).click()
    expect((await pngDownload).suggestedFilename()).toBe('diagram.png')

    // Diagram SVG → a download fires.
    await openExportMenu(page)
    const svgDownload = page.waitForEvent('download')
    await page.getByRole('menuitem', { name: 'Diagram SVG' }).click()
    expect((await svgDownload).suggestedFilename()).toBe('diagram.svg')

    // Diagram PDF → a download fires.
    await openExportMenu(page)
    const pdfDownload = page.waitForEvent('download')
    await page.getByRole('menuitem', { name: 'Diagram PDF' }).click()
    expect((await pdfDownload).suggestedFilename()).toBe('diagram.pdf')
  })

  test('exports the table-definition document to Excel and PDF', async ({
    page,
  }) => {
    await registerAndLogin(page, `export-tabledoc-${Date.now()}@example.com`)
    await createProjectAndOpen(page, 'Export TableDoc')
    await typeDbml(page, SAMPLE_DBML)
    await waitForTwoNodes(page)

    // Table Doc Excel → a download fires. ARM before the click.
    await openExportMenu(page)
    const xlsxDownload = page.waitForEvent('download')
    await page.getByRole('menuitem', { name: 'Table Doc Excel' }).click()
    expect((await xlsxDownload).suggestedFilename()).toBe(
      'table-definition.xlsx',
    )

    // Table Doc PDF → a download fires.
    await openExportMenu(page)
    const pdfDownload = page.waitForEvent('download')
    await page.getByRole('menuitem', { name: 'Table Doc PDF' }).click()
    expect((await pdfDownload).suggestedFilename()).toBe(
      'table-definition.pdf',
    )
  })

  test('opens the HTML table-definition view with a unique column cell', async ({
    page,
  }) => {
    await registerAndLogin(page, `export-htmlview-${Date.now()}@example.com`)
    await createProjectAndOpen(page, 'Export HTML View')
    await typeDbml(page, SAMPLE_DBML)
    await waitForTwoNodes(page)

    // Table Doc HTML → the in-app view renders (asset produced, no download).
    await openExportMenu(page)
    await page.getByRole('menuitem', { name: 'Table Doc HTML' }).click()

    const view = page.getByTestId('table-doc-view')
    await expect(view).toBeVisible()
    // `email` is unique to the users table (strict-mode-safe, unlike a table
    // name which also renders as an FK-target). Use a cell role to scope.
    await expect(
      view.getByRole('cell', { name: 'email' }).first(),
    ).toBeVisible()
  })
})
