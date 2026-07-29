import { test, type Page } from '@playwright/test'
import { registerAndLogin, enterEditMode } from './helpers'

async function setup(browser: import('@playwright/test').Browser) {
  const stamp = Date.now()
  const mateEmail = `s3M-${stamp}@example.com`
  const mateCtx = await browser.newContext()
  const mate = await mateCtx.newPage()
  await registerAndLogin(mate, mateEmail, 'password123')
  const ownerCtx = await browser.newContext()
  const owner = await ownerCtx.newPage()
  await registerAndLogin(owner, `s3O-${stamp}@example.com`, 'password123')
  const created = await ownerCtx.request.post('/api/projects', {
    data: { name: 'Scen3', dbml_text: 'Table users {\n  id integer [pk]\n}', layout: { version: 1, positions: {} } },
  })
  const pid = (await created.json()).id as string
  await ownerCtx.request.post(`/api/projects/${pid}/members`, { data: { email: mateEmail, role: 'editor' } })
  return { owner, ownerCtx, mate, mateCtx, pid }
}
async function topbar(page: Page) {
  for (const id of ['lock-readonly-editor', 'lock-editing-mode', 'lock-editing-by', 'lock-lost']) {
    if (await page.getByTestId(id).isVisible().catch(() => false))
      return `${id}: ${(await page.getByTestId(id).innerText()).replace(/\n+/g, ' / ')}`
  }
  return '(none)'
}

test('1b: refused entry says the right thing', async ({ browser }) => {
  test.setTimeout(180_000)
  const { owner, mateCtx, pid } = await setup(browser)
  await owner.goto(`/editor/${pid}`)
  await owner.waitForSelector('[data-testid="erd-canvas"]', { timeout: 20000 })
  await owner.waitForTimeout(800)
  await mateCtx.request.post(`/api/projects/${pid}/edit-lock`)

  await owner.getByTestId('lock-enter-edit').click()
  await owner.waitForTimeout(1500)
  const blocked = owner.getByTestId('edit-mode-blocked')
  console.log(`[1b] blocked dialog = ${await blocked.isVisible().catch(() => false)}`)
  if (await blocked.isVisible().catch(() => false))
    console.log(`[1b] TEXT: ${(await blocked.innerText()).replace(/\n+/g, ' / ')}`)
  console.log(`[1b] bumped dialog (should be false) = ${await owner.getByTestId('edit-lock-bumped').isVisible().catch(() => false)}`)
  await blocked.getByTestId('edit-mode-blocked-ok').click().catch(() => {})
  await owner.waitForTimeout(500)
  console.log(`[1b] topbar corrected immediately: ${await topbar(owner)}`)
})

test('2: entering resyncs the document', async ({ browser }) => {
  test.setTimeout(180_000)
  const { owner, mateCtx, pid } = await setup(browser)
  await owner.goto(`/editor/${pid}`)
  await owner.waitForSelector('[data-testid="erd-canvas"]', { timeout: 20000 })

  await mateCtx.request.post(`/api/projects/${pid}/edit-lock`)
  const proj = await (await mateCtx.request.get(`/api/projects/${pid}`)).json()
  await mateCtx.request.patch(`/api/projects/${pid}`, {
    data: { dbml_text: 'Table users {\n  id integer [pk]\n}\n\nTable added_by_mate {\n  id integer [pk]\n}', version: proj.version },
  })
  await mateCtx.request.delete(`/api/projects/${pid}/edit-lock`)
  await owner.waitForTimeout(1200)
  console.log(`[2] before entering, owner sees mate's table = ${(await owner.locator('[data-testid="dbml-editor"]').innerText()).includes('added_by_mate')}`)

  await enterEditMode(owner)
  await owner.waitForTimeout(1500)
  const txt = await owner.locator('[data-testid="dbml-editor"]').innerText()
  console.log(`[2] after entering, owner sees mate's table = ${txt.includes('added_by_mate')} (nodes=${await owner.locator('.react-flow__node').count()})`)
  await owner.getByTitle('Fit to screen').click()
  await owner.waitForTimeout(800)
  console.log(`[2] nodes after fit = ${await owner.locator('.react-flow__node').count()}`)

  // and a real edit now saves without a stale-version complaint
  await owner.locator('[data-testid="dbml-editor"] .cm-content').click()
  await owner.keyboard.press('Control+End')
  await owner.keyboard.type('\n\nTable added_by_owner {\n  id integer [pk]\n')
  await owner.waitForTimeout(2500)
  console.log(`[2] stale dialog after typing = ${await owner.getByTestId('edit-lock-bumped').isVisible().catch(() => false)}`)
  const after = await (await mateCtx.request.get(`/api/projects/${pid}`)).json()
  console.log(`[2] server kept BOTH tables = ${after.dbml_text.includes('added_by_mate') && after.dbml_text.includes('added_by_owner')}`)
})
