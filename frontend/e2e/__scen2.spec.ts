import { test, type Page } from '@playwright/test'
import { registerAndLogin, enterEditMode } from './helpers'

async function setup(browser: import('@playwright/test').Browser) {
  const stamp = Date.now()
  const mateEmail = `s2M-${stamp}@example.com`
  const mateCtx = await browser.newContext()
  const mate = await mateCtx.newPage()
  await registerAndLogin(mate, mateEmail, 'password123')
  const ownerCtx = await browser.newContext()
  const owner = await ownerCtx.newPage()
  await registerAndLogin(owner, `s2O-${stamp}@example.com`, 'password123')
  const created = await ownerCtx.request.post('/api/projects', {
    data: { name: 'Scen2', dbml_text: 'Table users {\n  id integer [pk]\n}', layout: { version: 1, positions: {} } },
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

test('scenario 1b: the poll-lag race on entering', async ({ browser }) => {
  test.setTimeout(180_000)
  const { owner, mate, mateCtx, pid } = await setup(browser)
  await owner.goto(`/editor/${pid}`)
  await owner.waitForSelector('[data-testid="erd-canvas"]', { timeout: 20000 })
  await owner.waitForTimeout(800)
  console.log(`[1b] before: ${await topbar(owner)}`)

  // mate grabs it via the API — owner's 15s poll has not noticed yet
  const r = await mateCtx.request.post(`/api/projects/${pid}/edit-lock`)
  console.log(`[1b] mate acquired via API = ${r.status()}`)

  await owner.getByTestId('lock-enter-edit').click()
  await owner.waitForTimeout(1500)
  console.log(`[1b] owner topbar after failed enter: ${await topbar(owner)}`)
  const dlg = owner.getByTestId('edit-lock-bumped')
  console.log(`[1b] bumped dialog shown = ${await dlg.isVisible().catch(() => false)}`)
  if (await dlg.isVisible().catch(() => false))
    console.log(`[1b] DIALOG TEXT: ${(await dlg.innerText()).replace(/\n+/g, ' / ')}`)
  void mate
})

test('scenario 3: long elapsed while in edit mode', async ({ browser }) => {
  test.setTimeout(240_000)
  const { owner, ownerCtx, pid } = await setup(browser)
  await owner.goto(`/editor/${pid}`)
  await owner.waitForSelector('[data-testid="erd-canvas"]', { timeout: 20000 })
  await enterEditMode(owner)
  const held = async () => {
    const r = await ownerCtx.request.get(`/api/projects/${pid}/edit-lock`)
    const b = await r.json()
    return `${b.locked}/${b.is_me}`
  }
  console.log(`[3] just entered: locked/is_me = ${await held()}`)
  await owner.waitForTimeout(75_000)
  console.log(`[3] idle 75s (visible): ${await held()} · ${await topbar(owner)}`)

  await owner.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await owner.waitForTimeout(75_000)
  console.log(`[3] hidden 75s: ${await held()} · ${await topbar(owner)}`)
})
