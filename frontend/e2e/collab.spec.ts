import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import { registerAndLogin } from './helpers'

/** Create a project from the dashboard; returns its id (lands in the editor). */
async function createProject(page: Page, name: string): Promise<string> {
  const created = page.waitForResponse(
    (r) =>
      r.url().includes('/api/projects') &&
      r.request().method() === 'POST' &&
      r.status() === 201,
  )
  await page.getByPlaceholder('프로젝트 이름').fill(name)
  await page.getByRole('button', { name: '만들기' }).click()
  return (await (await created).json()).id as string
}

/** Invite an existing user via the API (the ShareDialog UI is unit-tested);
 *  uses the owner context's cookies. Keeps the owner page where it is. */
async function inviteViaApi(
  ctx: BrowserContext,
  projectId: string,
  email: string,
  role: 'editor' | 'viewer',
) {
  const res = await ctx.request.post(`/api/projects/${projectId}/members`, {
    data: { email, role },
  })
  expect(res.status()).toBe(201)
}

test.describe('Project collaboration', () => {
  test('owner shares a project; the viewer sees it read-only', async ({
    browser,
  }) => {
    const stamp = Date.now()
    const password = 'password123'
    const ownerEmail = `owner-${stamp}@example.com`
    const memberEmail = `viewer-${stamp}@example.com`

    // The member must exist before the invite (existing-users-only).
    const memberCtx = await browser.newContext()
    const member = await memberCtx.newPage()
    await registerAndLogin(member, memberEmail, password)

    const ownerCtx = await browser.newContext()
    const owner = await ownerCtx.newPage()
    await registerAndLogin(owner, ownerEmail, password)
    const projectId = await createProject(owner, 'Collab')

    await inviteViaApi(ownerCtx, projectId, memberEmail, 'viewer')

    // Member refreshes → the shared project shows a "뷰어" badge.
    await member.goto('/')
    await expect(
      member.getByTestId(`sidebar-project-shared-${projectId}`),
    ).toHaveText('뷰어')

    // Opening it lands the member in a read-only editor.
    await member.getByTestId(`sidebar-project-${projectId}`).click()
    await member.waitForURL((u) => u.pathname === `/editor/${projectId}`)
    await expect(member.getByTestId('lock-readonly-viewer')).toBeVisible()

    await memberCtx.close()
    await ownerCtx.close()
  })

  test('a second editor sees the owner is editing (edit lock)', async ({
    browser,
  }) => {
    const stamp = Date.now()
    const password = 'password123'
    const ownerEmail = `owner2-${stamp}@example.com`
    const memberEmail = `editor2-${stamp}@example.com`

    const memberCtx = await browser.newContext()
    const member = await memberCtx.newPage()
    await registerAndLogin(member, memberEmail, password)

    const ownerCtx = await browser.newContext()
    const owner = await ownerCtx.newPage()
    await registerAndLogin(owner, ownerEmail, password)

    // Owner enters the editor and acquires the lock on mount.
    const acquired = owner.waitForResponse(
      (r) =>
        r.url().includes('/edit-lock') &&
        r.request().method() === 'POST' &&
        r.status() === 200,
    )
    const projectId = await createProject(owner, 'Locked')
    await owner.waitForURL((u) => u.pathname === `/editor/${projectId}`)
    await acquired

    await inviteViaApi(ownerCtx, projectId, memberEmail, 'editor')

    // The editor member opens the same project → read-only, owner is shown.
    await member.goto(`/editor/${projectId}`)
    await expect(member.getByTestId('lock-editing-by')).toContainText(ownerEmail)

    await memberCtx.close()
    await ownerCtx.close()
  })

  test('owner transfers ownership; the former owner becomes an editor', async ({
    browser,
  }) => {
    const stamp = Date.now()
    const password = 'password123'
    const ownerEmail = `owner3-${stamp}@example.com`
    const memberEmail = `editor3-${stamp}@example.com`

    const memberCtx = await browser.newContext()
    const member = await memberCtx.newPage()
    await registerAndLogin(member, memberEmail, password)

    const ownerCtx = await browser.newContext()
    const owner = await ownerCtx.newPage()
    await registerAndLogin(owner, ownerEmail, password)
    const projectId = await createProject(owner, 'Transfer')

    await inviteViaApi(ownerCtx, projectId, memberEmail, 'editor')

    // From the sidebar, open the project's ⋯ menu → 공유 (owner-only).
    await owner.goto('/')
    await owner.getByTestId(`sidebar-project-menu-${projectId}`).click()
    await owner.getByTestId(`sidebar-project-share-${projectId}`).click()

    // Hand ownership to the member, then confirm in the dialog.
    const transferred = owner.waitForResponse(
      (r) =>
        r.url().includes('/transfer-ownership') &&
        r.request().method() === 'POST' &&
        r.status() === 200,
    )
    await owner.getByTestId(`share-transfer-${memberEmail}`).click()
    await owner.getByTestId('share-transfer-confirm-ok').click()
    await transferred

    // The former owner now sees the project as shared, owned by the member.
    const badge = owner.getByTestId(`sidebar-project-shared-${projectId}`)
    await expect(badge).toBeVisible()
    await expect(badge).toHaveAttribute('title', new RegExp(memberEmail))

    await memberCtx.close()
    await ownerCtx.close()
  })
})
