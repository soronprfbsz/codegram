// frontend/e2e/export.spec.ts
// All exports live in the editor TopBar's single "내보내기" dropdown (ExportMenu).
// Table-Doc Excel/PDF now build in a Web Worker with a progress overlay so a
// large export never freezes the UI; this exercises the worker path in a REAL
// browser (jsdom can't run Workers) and asserts the files are non-empty. Setup
// mirrors db-sync.spec.ts (register → API-create project → open editor). Needs
// the docker stack (backend :4000 via the dev-server proxy).
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
  await page.getByRole('button', { name: '회원가입' }).click()
  await loginResponse
  await page.waitForURL((url) => url.pathname === '/')
}

const DBML = `Table users {
  id uuid [pk]
  email varchar [not null, unique]
}

Table posts {
  id uuid [pk]
  user_id uuid [not null]
  title varchar
}

Ref: posts.user_id > users.id`

async function openEditorWithProject(page: Page): Promise<void> {
  const createResp = await page.request.post('/api/projects', {
    data: { name: 'Export E2E', dbml_text: DBML, layout: { version: 1, positions: {} } },
  })
  expect(createResp.status()).toBe(201)
  const { id } = await createResp.json()
  await page.goto(`/editor/${id}`)
  await page.waitForSelector('[data-testid="erd-canvas"]', { timeout: 15000 })
  await expect
    .poll(async () => page.locator('.react-flow__node').count(), { timeout: 10000 })
    .toBeGreaterThanOrEqual(2)
}

/** Open the TopBar "내보내기" menu and click one item; returns the download. */
async function downloadFromMenu(page: Page, itemName: string) {
  await page.getByRole('button', { name: '내보내기', exact: true }).click()
  const downloadPromise = page.waitForEvent('download', { timeout: 30000 })
  await page.getByRole('menuitem', { name: itemName }).click()
  return downloadPromise
}

async function streamSize(stream: NodeJS.ReadableStream | null): Promise<number> {
  if (!stream) return 0
  let n = 0
  for await (const chunk of stream) n += Buffer.from(chunk).length
  return n
}

test('exports the diagram to PNG, SVG and PDF from the Export menu', async ({ page }) => {
  await registerAndLogin(page, `export-diagram-${Date.now()}@example.com`)
  await openEditorWithProject(page)

  expect((await downloadFromMenu(page, '다이어그램 PNG')).suggestedFilename()).toBe('diagram.png')
  expect((await downloadFromMenu(page, '다이어그램 SVG')).suggestedFilename()).toBe('diagram.svg')
  expect((await downloadFromMenu(page, '다이어그램 PDF')).suggestedFilename()).toBe('diagram.pdf')
})

test('Table Doc Excel/PDF download non-empty files via the worker', async ({ page }) => {
  await registerAndLogin(page, `export-tabledoc-${Date.now()}@example.com`)
  await openEditorWithProject(page)

  const xlsx = await downloadFromMenu(page, '테이블 정의서 Excel')
  expect(xlsx.suggestedFilename()).toBe('table-definition.xlsx')
  expect(await streamSize(await xlsx.createReadStream())).toBeGreaterThan(0)

  const pdf = await downloadFromMenu(page, '테이블 정의서 PDF')
  expect(pdf.suggestedFilename()).toBe('table-definition.pdf')
  expect(await streamSize(await pdf.createReadStream())).toBeGreaterThan(0)
})

test('Table Doc Word downloads a non-empty .docx via the worker', async ({ page }) => {
  await registerAndLogin(page, `export-word-${Date.now()}@example.com`)
  await openEditorWithProject(page)

  const docx = await downloadFromMenu(page, '테이블 정의서 Word')
  expect(docx.suggestedFilename()).toBe('table-definition.docx')
  expect(await streamSize(await docx.createReadStream())).toBeGreaterThan(0)
})

test('opens the HTML table-definition preview from the Export menu', async ({ page }) => {
  await registerAndLogin(page, `export-preview-${Date.now()}@example.com`)
  await openEditorWithProject(page)

  await page.getByRole('button', { name: '내보내기', exact: true }).click()
  await page.getByRole('menuitem', { name: '테이블 정의서 미리보기' }).click()

  const view = page.getByTestId('table-doc-view')
  await expect(view).toBeVisible()
  await expect(view.getByRole('cell', { name: 'email' }).first()).toBeVisible()
})
