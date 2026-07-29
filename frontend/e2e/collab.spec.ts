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

/** Take the edit lease: the editor opens read-only now (ADR-0025). */
async function enterEditMode(page: Page) {
  // Wait on the switch itself, not the canvas — an empty project renders no
  // canvas but still opens read-only with a way in.
  const enter = page.getByTestId('lock-enter-edit')
  await expect(enter).toBeVisible({ timeout: 20000 })
  await enter.click()
  await expect(page.getByTestId('lock-editing-mode')).toBeVisible()
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

    // Member refreshes → the shared project shows the "공유" badge. The badge
    // is role-agnostic (the role lives in the row's context menu); it is the
    // editor that shows what the viewer may do.
    await member.goto('/')
    await expect(
      member.getByTestId(`sidebar-project-shared-${projectId}`),
    ).toHaveText('공유')

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

    // The owner has to say they are editing before they hold the lease.
    const projectId = await createProject(owner, 'Locked')
    await owner.waitForURL((u) => u.pathname === `/editor/${projectId}`)
    await enterEditMode(owner)

    await inviteViaApi(ownerCtx, projectId, memberEmail, 'editor')

    // The editor member opens the same project → read-only, owner is shown.
    await member.goto(`/editor/${projectId}`)
    await expect(member.getByTestId('lock-editing-by')).toContainText(ownerEmail)

    await memberCtx.close()
    await ownerCtx.close()
  })

  test('a member without the edit lock can still read and scroll the DBML', async ({
    browser,
  }) => {
    const stamp = Date.now()
    const password = 'password123'
    const ownerEmail = `owner-ro-${stamp}@example.com`
    const memberEmail = `editor-ro-${stamp}@example.com`
    // Long enough that the editor surface overflows and can be scrolled.
    const longDbml = Array.from(
      { length: 60 },
      (_, i) => `Table t${i} {\n  id integer [pk]\n  name varchar\n}`,
    ).join('\n\n')

    const memberCtx = await browser.newContext()
    const member = await memberCtx.newPage()
    await registerAndLogin(member, memberEmail, password)

    const ownerCtx = await browser.newContext()
    const owner = await ownerCtx.newPage()
    await registerAndLogin(owner, ownerEmail, password)
    const created = await ownerCtx.request.post('/api/projects', {
      data: { name: 'ReadOnly Scroll', dbml_text: longDbml },
    })
    const projectId = (await created.json()).id as string

    // Owner holds the lock.
    await owner.goto(`/editor/${projectId}`)
    await enterEditMode(owner)

    await inviteViaApi(ownerCtx, projectId, memberEmail, 'editor')

    await member.goto(`/editor/${projectId}`)
    await expect(member.getByTestId('lock-editing-by')).toContainText(ownerEmail)

    // Read-only must not mean unreadable: the editor still takes the wheel.
    const scroller = member.locator('[data-testid="dbml-editor"] .cm-scroller')
    await expect(scroller).toBeVisible()
    // The surface must actually receive pointer events (a pointer-events:none
    // wrapper used to swallow them, killing scrolling entirely).
    const hitsEditor = await scroller.evaluate((el) => {
      const r = el.getBoundingClientRect()
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + 20)
      return el.contains(hit) || el === hit
    })
    expect(hitsEditor).toBe(true)

    await scroller.hover()
    await member.mouse.wheel(0, 600)
    await expect
      .poll(() => scroller.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0)

    // ...but edits are still blocked.
    const firstLine = member.locator('[data-testid="dbml-editor"] .cm-line').first()
    await firstLine.click()
    await member.keyboard.type('ZZZ')
    await expect(
      member.locator('[data-testid="dbml-editor"]'),
    ).not.toContainText('ZZZ')

    await memberCtx.close()
    await ownerCtx.close()
  })

  test('closing the editor tab hands the edit lease back at once', async ({
    browser,
  }) => {
    const stamp = Date.now()
    const password = 'password123'
    const ownerEmail = `owner-rel-${stamp}@example.com`
    const memberEmail = `editor-rel-${stamp}@example.com`

    const memberCtx = await browser.newContext()
    const member = await memberCtx.newPage()
    await registerAndLogin(member, memberEmail, password)

    const ownerCtx = await browser.newContext()
    const owner = await ownerCtx.newPage()
    await registerAndLogin(owner, ownerEmail, password)
    const created = await ownerCtx.request.post('/api/projects', {
      data: { name: 'Release On Close', dbml_text: 'Table t { id integer [pk] }' },
    })
    const projectId = (await created.json()).id as string
    await inviteViaApi(ownerCtx, projectId, memberEmail, 'editor')

    // The member must really be a participant: a non-participant gets 404 from
    // the status endpoint, whose body has no `locked` — which would read as
    // "free" and make this test pass without the release ever happening.
    const lockStatus = async () => {
      const r = await memberCtx.request.get(
        `/api/projects/${projectId}/edit-lock`,
      )
      expect(r.status()).toBe(200)
      return (await r.json()).locked as boolean
    }

    const editorTab = await ownerCtx.newPage()
    await editorTab.goto(`/editor/${projectId}`)
    await enterEditMode(editorTab)
    await expect.poll(lockStatus, { timeout: 5000 }).toBe(true)

    // Closing the tab used to leave the lease held for the full 60s TTL: only
    // React unmount released it, and that never runs on a close (ADR-0024).
    await editorTab.close()
    await expect.poll(lockStatus, { timeout: 10_000 }).toBe(false)

    await memberCtx.close()
    await ownerCtx.close()
  })

  test('a viewer can read everything but change nothing', async ({ browser }) => {
    const stamp = Date.now()
    const password = 'password123'
    const viewerEmail = `viewer-ro-${stamp}@example.com`
    // Just enough tables to overflow the editor surface; a bigger fixture only
    // adds canvas work and slows the whole suite down.
    const longDbml = Array.from(
      { length: 20 },
      (_, i) => `Table t${i} {\n  id integer [pk]\n  name varchar\n}`,
    ).join('\n\n')

    const viewerCtx = await browser.newContext()
    const viewer = await viewerCtx.newPage()
    await registerAndLogin(viewer, viewerEmail, password)

    const ownerCtx = await browser.newContext()
    const owner = await ownerCtx.newPage()
    await registerAndLogin(owner, `owner-ro2-${stamp}@example.com`, password)
    const created = await ownerCtx.request.post('/api/projects', {
      data: { name: 'Viewer Read Only', dbml_text: longDbml },
    })
    const projectId = (await created.json()).id as string
    await inviteViaApi(ownerCtx, projectId, viewerEmail, 'viewer')
    const snap = await ownerCtx.request.post(
      `/api/projects/${projectId}/snapshots`,
      { data: { label: 'v1' } },
    )
    expect(snap.status()).toBe(201)

    await viewer.goto(`/editor/${projectId}`)
    await viewer.waitForSelector('[data-testid="erd-canvas"]', { timeout: 20000 })

    // Reading is not restricted: the DBML still scrolls.
    const scroller = viewer.locator('[data-testid="dbml-editor"] .cm-scroller')
    await scroller.hover()
    await viewer.mouse.wheel(0, 600)
    await expect
      .poll(() => scroller.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0)

    // Writing is: dragging a table used to move it on screen and then quietly
    // fail to save, because readOnly never reached the live canvas.
    const node = viewer.locator('.react-flow__node').first()
    const before = await node.boundingBox()
    if (before) {
      await viewer.mouse.move(before.x + before.width / 2, before.y + 10)
      await viewer.mouse.down()
      await viewer.mouse.move(
        before.x + before.width / 2 + 160,
        before.y + 130,
        { steps: 12 },
      )
      await viewer.mouse.up()
    }
    await viewer.waitForTimeout(1000)
    const after = await node.boundingBox()
    expect(Math.abs((after?.x ?? 0) - (before?.x ?? 0))).toBeLessThan(20)

    // Entry points that rewrite content are gone rather than dead.
    await expect(viewer.getByTestId('auto-arrange-button')).toBeHidden()
    await expect(viewer.getByTestId('import-menu-button')).toBeHidden()

    // And a refused restore says why instead of failing silently.
    await viewer.getByTestId('snapshot-history-button').click()
    await viewer.locator('[data-testid^="snapshot-row-"]').first().click()
    await expect(viewer.getByTestId('snapshot-preview-overlay')).toBeVisible()
    await viewer.getByTestId('snapshot-preview-restore').click()
    await expect(viewer.getByTestId('snapshot-restore-error')).toContainText(
      '편집 권한이 없어 원복할 수 없습니다',
    )

    await viewerCtx.close()
    await ownerCtx.close()
  })

  test('opening a project reads it; editing is a mode you enter', async ({
    browser,
  }) => {
    const stamp = Date.now()
    const password = 'password123'
    const ownerCtx = await browser.newContext()
    const owner = await ownerCtx.newPage()
    await registerAndLogin(owner, `owner-mode-${stamp}@example.com`, password)
    const created = await ownerCtx.request.post('/api/projects', {
      data: {
        name: 'Edit Mode',
        dbml_text: 'Table users {\n  id integer [pk]\n  name varchar\n}',
        layout: { version: 1, positions: {} },
      },
    })
    const projectId = (await created.json()).id as string
    const leaseTaken = async () => {
      const r = await ownerCtx.request.get(
        `/api/projects/${projectId}/edit-lock`,
      )
      return (await r.json()).locked as boolean
    }

    await owner.goto(`/editor/${projectId}`)
    await owner.waitForSelector('[data-testid="erd-canvas"]', { timeout: 20000 })

    // Even the OWNER opens read-only: coming to look must not block whoever
    // came to edit (ADR-0025).
    await expect(owner.getByTestId('lock-readonly-editor')).toBeVisible()
    await expect(owner.getByTestId('import-menu-button')).toBeHidden()
    expect(await leaseTaken()).toBe(false)

    const node = owner.locator('.react-flow__node').first()
    const before = (await node.boundingBox())!
    const drag = async () => {
      const b = (await node.boundingBox())!
      await owner.mouse.move(b.x + b.width / 2, b.y + 10)
      await owner.mouse.down()
      await owner.mouse.move(b.x + 200, b.y + 120, { steps: 10 })
      await owner.mouse.up()
      await owner.waitForTimeout(600)
      return (await node.boundingBox())!
    }
    expect(Math.abs((await drag()).x - before.x)).toBeLessThan(20)

    // Entering takes the lease and unlocks the write surfaces.
    await owner.getByTestId('lock-enter-edit').click()
    await expect(owner.getByTestId('lock-editing-mode')).toBeVisible()
    await expect.poll(leaseTaken, { timeout: 5000 }).toBe(true)
    await expect(owner.getByTestId('import-menu-button')).toBeVisible()
    const moved = (await drag()).x
    expect(Math.abs(moved - before.x)).toBeGreaterThan(20)

    // Leaving hands it straight back, with no "you were bumped" alarm.
    await owner.getByTestId('lock-exit-edit').click()
    await expect(owner.getByTestId('lock-readonly-editor')).toBeVisible()
    await expect.poll(leaseTaken, { timeout: 5000 }).toBe(false)
    await expect(owner.getByTestId('lock-lost')).toHaveCount(0)

    // The mode is never remembered — a reload comes back reading.
    await owner.reload()
    await owner.waitForSelector('[data-testid="erd-canvas"]', { timeout: 20000 })
    await expect(owner.getByTestId('lock-readonly-editor')).toBeVisible()
    expect(await leaseTaken()).toBe(false)

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
