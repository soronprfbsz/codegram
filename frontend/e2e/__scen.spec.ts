import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import { registerAndLogin, enterEditMode } from './helpers'

async function setup(browser: import('@playwright/test').Browser) {
  const stamp = Date.now()
  const ownerEmail = `sO-${stamp}@example.com`
  const mateEmail = `sM-${stamp}@example.com`
  const mateCtx = await browser.newContext()
  const mate = await mateCtx.newPage()
  await registerAndLogin(mate, mateEmail, 'password123')
  const ownerCtx = await browser.newContext()
  const owner = await ownerCtx.newPage()
  await registerAndLogin(owner, ownerEmail, 'password123')
  const created = await ownerCtx.request.post('/api/projects', {
    data: { name: 'Scen', dbml_text: 'Table users {\n  id integer [pk]\n}', layout: { version: 1, positions: {} } },
  })
  const pid = (await created.json()).id as string
  await ownerCtx.request.post(`/api/projects/${pid}/members`, { data: { email: mateEmail, role: 'editor' } })
  return { owner, ownerCtx, mate, mateCtx, pid, ownerEmail, mateEmail }
}

async function openEditor(page: Page, pid: string) {
  await page.goto(`/editor/${pid}`)
  await page.waitForSelector('[data-testid="erd-canvas"]', { timeout: 20000 })
}
async function topbarText(page: Page) {
  for (const id of ['lock-readonly-editor', 'lock-editing-mode', 'lock-editing-by', 'lock-lost']) {
    if (await page.getByTestId(id).isVisible().catch(() => false))
      return `${id}: ${(await page.getByTestId(id).innerText()).replace(/\n+/g, ' / ')}`
  }
  return '(none)'
}

test('scenario 1: someone else already holds the lease', async ({ browser }) => {
  test.setTimeout(180_000)
  const { owner, mate, pid } = await setup(browser)
  await openEditor(mate, pid)
  await enterEditMode(mate)              // mate takes it

  await openEditor(owner, pid)
  await owner.waitForTimeout(1000)
  console.log(`[1] owner topbar on open: ${await topbarText(owner)}`)
  console.log(`[1] enter button present = ${await owner.getByTestId('lock-enter-edit').count()}`)

  // now simulate the poll-lag race: owner's UI still shows the button
  await owner.reload()
  await owner.waitForSelector('[data-testid="erd-canvas"]', { timeout: 20000 })
  const btn = owner.getByTestId('lock-enter-edit')
  if (await btn.count()) {
    await btn.click()
    await owner.waitForTimeout(1500)
    console.log(`[1] after clicking enter during the race: ${await topbarText(owner)}`)
    const dlg = owner.getByTestId('edit-lock-bumped')
    if (await dlg.isVisible().catch(() => false))
      console.log(`[1] DIALOG: ${(await dlg.innerText()).replace(/\n+/g, ' / ')}`)
  }
})

test('scenario 2: content freshness on entering', async ({ browser }) => {
  test.setTimeout(180_000)
  const { owner, mate, mateCtx, pid } = await setup(browser)
  await openEditor(owner, pid)           // owner reads
  // mate edits the project behind owner's back
  await mateCtx.request.post(`/api/projects/${pid}/edit-lock`)
  const proj = await (await mateCtx.request.get(`/api/projects/${pid}`)).json()
  await mateCtx.request.patch(`/api/projects/${pid}`, {
    data: { dbml_text: 'Table users {\n  id integer [pk]\n}\n\nTable added_by_mate {\n  id integer [pk]\n}', version: proj.version },
  })
  await mateCtx.request.delete(`/api/projects/${pid}/edit-lock`)
  await owner.waitForTimeout(1000)

  await enterEditMode(owner)
  await owner.waitForTimeout(1500)
  const text = await owner.locator('[data-testid="dbml-editor"]').innerText()
  console.log(`[2] owner sees mate's table after entering = ${text.includes('added_by_mate')}`)
  console.log(`[2] node count = ${await owner.locator('.react-flow__node').count()}`)
})

test('scenario 4: owner force-takes the lease from a member', async ({ browser }) => {
  test.setTimeout(180_000)
  const { owner, ownerCtx, mate, pid, ownerEmail } = await setup(browser)
  await openEditor(mate, pid)
  await enterEditMode(mate)
  await openEditor(owner, pid)
  await owner.waitForTimeout(1200)
  console.log(`[4] owner topbar (mate editing): ${await topbarText(owner)}`)
  const force = owner.getByTestId('lock-force')
  console.log(`[4] force button present = ${await force.count()}`)
  if (await force.count()) {
    await force.click()
    await owner.waitForTimeout(1200)
    console.log(`[4] owner after force: ${await topbarText(owner)}`)
  }
  await mate.waitForTimeout(16000)
  console.log(`[4] mate after being forced out: ${await topbarText(mate)}`)
  const dlg = mate.getByTestId('edit-lock-bumped')
  console.log(`[4] mate bumped dialog visible = ${await dlg.isVisible().catch(() => false)}`)
})
