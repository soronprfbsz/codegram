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
})
