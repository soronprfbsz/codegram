// frontend/e2e/editor-layout.spec.ts
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
async function createProjectAndOpen(page: Page, name: string): Promise<string> {
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
  // Select-all + delete replaces whatever is there (CodeMirror is contenteditable).
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('Delete')
  await page.keyboard.type(dbml)
}

/** Wait for the next autosave PATCH for this project and return its parsed body. */
async function waitForAutosavePatch(
  page: Page,
  projectId: string,
): Promise<{
  dbml_text?: string
  layout?: {
    version: number
    positions: Record<string, { x: number; y: number; parentId?: string }>
  }
}> {
  const resp = await page.waitForResponse(
    (r) =>
      r.url().includes(`/api/projects/${projectId}`) &&
      r.request().method() === 'PATCH' &&
      r.status() === 200,
  )
  return resp.request().postDataJSON()
}

/** Parse the inline React Flow transform of a node into {x, y} screen coords.
 *  React Flow writes `transform: translate(<x>px, <y>px)` on .react-flow__node.
 *  This is screen space (node.position composed with the viewport transform),
 *  so compare transforms WITHIN one viewport state, not across a re-fit. */
async function transformOf(
  page: Page,
  nodeId: string,
): Promise<{ x: number; y: number }> {
  const handle = page.locator(`.react-flow__node[data-id="${nodeId}"]`)
  await expect(handle).toBeVisible()
  const transform = await handle.evaluate(
    (el) => (el as HTMLElement).style.transform,
  )
  const match = /translate\(\s*([-\d.]+)px,\s*([-\d.]+)px/.exec(transform)
  if (!match) throw new Error(`no translate in transform "${transform}" for ${nodeId}`)
  return { x: parseFloat(match[1]), y: parseFloat(match[2]) }
}

/** Drag a node by a screen-space delta using the React Flow-friendly
 *  mouse.down → move(steps) → up sequence (a single jump won't register a drag). */
async function dragNode(page: Page, nodeId: string, dx: number, dy: number) {
  const handle = page.locator(`.react-flow__node[data-id="${nodeId}"]`)
  await expect(handle).toBeVisible()
  const box = await handle.boundingBox()
  if (!box) throw new Error(`no bounding box for ${nodeId}`)
  const startX = box.x + box.width / 2
  const startY = box.y + box.height / 2
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + dx, startY + dy, { steps: 10 })
  await page.mouse.up()
}

const TWO_TABLE_DBML = [
  'Table users {',
  '  id integer [pk]',
  '}',
  'Table posts {',
  '  id integer [pk]',
  '  user_id integer [ref: > users.id]',
  '}',
].join('\n')

test.describe('Editor manual layout persistence', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies()
  })

  test('dragging a table persists its position and survives reload', async ({
    page,
  }) => {
    await registerAndLogin(page, `layout-drag-${Date.now()}@example.com`)
    const projectId = await createProjectAndOpen(page, 'Layout Drag')

    // Type a two-table schema and wait for the canvas to render both nodes.
    await typeDbml(page, TWO_TABLE_DBML)
    await expect(page.locator('.react-flow')).toBeVisible()
    await expect
      .poll(async () => page.locator('.react-flow__node').count(), {
        timeout: 5000,
      })
      .toBeGreaterThanOrEqual(2)
    await expect(
      page.locator('.react-flow__node[data-id="public.users"]'),
    ).toBeVisible()

    // The initial DBML edit triggers an autosave; consume it so the next
    // PATCH we wait for is the layout-only one caused by the drag.
    await waitForAutosavePatch(page, projectId)

    // Record the node's screen position before dragging.
    const before = await transformOf(page, 'public.users')

    // Drag the users node down-right; this is a layout-only change
    // (dbml_text unchanged) and must trigger an autosave PATCH.
    await dragNode(page, 'public.users', 160, 120)

    // Drag-stop lifts the full StoredLayout; autosave PATCHes within 600ms.
    const dragBody = await waitForAutosavePatch(page, projectId)
    expect(dragBody.layout).toBeTruthy()
    expect(dragBody.layout?.version).toBe(1)
    const savedPositions = dragBody.layout?.positions ?? {}
    expect(Object.keys(savedPositions).length).toBeGreaterThanOrEqual(1)
    expect(savedPositions['public.users']).toBeTruthy()

    // The node visibly moved on screen (drag applied to controlled state).
    const after = await transformOf(page, 'public.users')
    expect(
      Math.abs(after.x - before.x) + Math.abs(after.y - before.y),
    ).toBeGreaterThan(50)

    // The persisted coordinate for users (node.position, pre-viewport).
    const persistedX = savedPositions['public.users'].x
    const persistedY = savedPositions['public.users'].y

    // Reload: positions must be re-seeded from project.layout.positions and
    // reconciled back onto the parsed nodes (NOT reset to dagre).
    await page.reload()
    await expect(page.locator('.react-flow')).toBeVisible()
    await expect(
      page.locator('.react-flow__node[data-id="public.users"]'),
    ).toBeVisible()
    // Let the post-reload parse settle so reconcile runs on real nodes.
    await expect
      .poll(async () => page.locator('.react-flow__node').count(), {
        timeout: 5000,
      })
      .toBeGreaterThanOrEqual(2)

    // Robust, viewport-independent check: nudge users by a TINY amount and
    // confirm the PATCH base position is the previously-persisted coord
    // (reconcile restored it), not dagre's.
    const beforeNudge = await transformOf(page, 'public.users')
    await dragNode(page, 'public.users', 1, 1)
    const reloadBody = await waitForAutosavePatch(page, projectId)
    const restored = reloadBody.layout?.positions?.['public.users']
    expect(restored).toBeTruthy()
    // The restored base position is within a small delta of what we saved
    // before reload (a ~1px drag plus measurement rounding). If reconcile had
    // reset to dagre, this would differ by hundreds of px.
    expect(Math.abs((restored?.x ?? 0) - persistedX)).toBeLessThan(20)
    expect(Math.abs((restored?.y ?? 0) - persistedY)).toBeLessThan(20)
    // Sanity: the node was actually present and measured before the nudge.
    expect(beforeNudge.x).not.toBeNaN()
  })

  test('adding a table gives it an auto position without moving placed tables', async ({
    page,
  }) => {
    await registerAndLogin(page, `layout-add-${Date.now()}@example.com`)
    const projectId = await createProjectAndOpen(page, 'Layout Add')

    // Start with two tables.
    await typeDbml(page, TWO_TABLE_DBML)
    await expect(page.locator('.react-flow')).toBeVisible()
    await expect
      .poll(async () => page.locator('.react-flow__node').count(), {
        timeout: 5000,
      })
      .toBeGreaterThanOrEqual(2)
    await waitForAutosavePatch(page, projectId) // consume the initial-text save.

    // Manually position `users` so it has a persisted coordinate.
    await dragNode(page, 'public.users', 200, 40)
    const placedBody = await waitForAutosavePatch(page, projectId)
    const placedUsers = placedBody.layout?.positions?.['public.users']
    expect(placedUsers).toBeTruthy()
    const placedX = placedUsers!.x
    const placedY = placedUsers!.y

    // Add a THIRD, unrelated table by appending to the DBML.
    const threeTableDbml = [
      TWO_TABLE_DBML,
      '',
      'Table tags {',
      '  id integer [pk]',
      '  label varchar',
      '}',
    ].join('\n')
    await typeDbml(page, threeTableDbml)

    // Parse settles; three nodes now render.
    await expect
      .poll(async () => page.locator('.react-flow__node').count(), {
        timeout: 5000,
      })
      .toBeGreaterThanOrEqual(3)
    await expect(
      page.locator('.react-flow__node[data-id="public.tags"]'),
    ).toBeVisible()

    // The DBML change triggers a save; read back the reconciled layout.
    const addBody = await waitForAutosavePatch(page, projectId)
    const positions = addBody.layout?.positions ?? {}

    // The new table got a dagre position (NOT stacked at origin {0,0}).
    const tags = await transformOf(page, 'public.tags')
    expect(Math.abs(tags.x) + Math.abs(tags.y)).toBeGreaterThan(1)

    // The previously-placed `users` table KEPT its manual position
    // (reconcile preserved it; only `tags` was newly laid out by dagre).
    const usersAfter = positions['public.users']
    expect(usersAfter).toBeTruthy()
    expect(Math.abs(usersAfter!.x - placedX)).toBeLessThan(20)
    expect(Math.abs(usersAfter!.y - placedY)).toBeLessThan(20)
  })

  test('renaming a table loses its manual position (ADR-0004)', async ({
    page,
  }) => {
    await registerAndLogin(page, `layout-rename-${Date.now()}@example.com`)
    const projectId = await createProjectAndOpen(page, 'Layout Rename')

    await typeDbml(page, TWO_TABLE_DBML)
    await expect(page.locator('.react-flow')).toBeVisible()
    await expect
      .poll(async () => page.locator('.react-flow__node').count(), {
        timeout: 5000,
      })
      .toBeGreaterThanOrEqual(2)
    await waitForAutosavePatch(page, projectId) // consume the initial-text save.

    // Place `posts` at a distinctive manual position far from any dagre slot.
    await dragNode(page, 'public.posts', 260, 220)
    await waitForAutosavePatch(page, projectId)
    // Capture the on-screen position of the manually-placed `posts` node. The
    // renamed node must NOT end up here. (We read the rendered transform, not
    // the PATCH body, because a dbml-only rename never calls onLayoutChange and
    // so never pushes the new node into the persisted positions — mirrors the
    // add-table test's invariant.)
    const draggedPostsPos = await transformOf(page, 'public.posts')

    // Rename `posts` -> `articles` in the DBML (keep the ref valid).
    const renamedDbml = [
      'Table users {',
      '  id integer [pk]',
      '}',
      'Table articles {',
      '  id integer [pk]',
      '  user_id integer [ref: > users.id]',
      '}',
    ].join('\n')
    await typeDbml(page, renamedDbml)

    // The renamed node now exists under a NEW id; the old id is gone.
    await expect(
      page.locator('.react-flow__node[data-id="public.articles"]'),
    ).toBeVisible()
    await expect(
      page.locator('.react-flow__node[data-id="public.posts"]'),
    ).toHaveCount(0)

    // The rename is a dbml change -> autosave fires; wait for it as a settle
    // point. Its body carries the orphan `public.posts` entry (the new node is
    // never pushed into positions state), so we do NOT read the new node's
    // coord from the PATCH body.
    await waitForAutosavePatch(page, projectId)

    // ADR-0004 on-screen: `articles` is treated as a brand-new node (no stored
    // entry under the new id), so reconcile dagre-places it. Prove it LOST the
    // old manual position by comparing rendered transforms within this one
    // viewport state — `articles` must be far from where the dragged `posts`
    // sat, and not stacked at origin.
    const articlesScreen = await transformOf(page, 'public.articles')
    expect(
      Math.abs(articlesScreen.x) + Math.abs(articlesScreen.y),
    ).toBeGreaterThan(1)
    const movedFarFromOldManual =
      Math.abs(articlesScreen.x - draggedPostsPos.x) +
      Math.abs(articlesScreen.y - draggedPostsPos.y)
    expect(movedFarFromOldManual).toBeGreaterThan(50)
  })

  test('Auto-arrange discards manual positions and re-runs dagre', async ({
    page,
  }) => {
    await registerAndLogin(page, `layout-auto-${Date.now()}@example.com`)
    const projectId = await createProjectAndOpen(page, 'Layout Auto')

    await typeDbml(page, TWO_TABLE_DBML)
    await expect(page.locator('.react-flow')).toBeVisible()
    await expect
      .poll(async () => page.locator('.react-flow__node').count(), {
        timeout: 5000,
      })
      .toBeGreaterThanOrEqual(2)
    await waitForAutosavePatch(page, projectId) // initial-text save.

    // Manually move `users` so we have a non-dagre position to discard.
    await dragNode(page, 'public.users', 220, 160)
    const placedBody = await waitForAutosavePatch(page, projectId)
    const placedUsers = placedBody.layout?.positions?.['public.users']
    expect(placedUsers).toBeTruthy()
    const placedX = placedUsers!.x
    const placedY = placedUsers!.y

    // Click Auto-arrange (one-shot dagre over all nodes, discards saved coords).
    await page.getByRole('button', { name: 'Auto-arrange' }).click()

    // Auto-arrange lifts a fresh StoredLayout -> autosave PATCHes.
    const autoBody = await waitForAutosavePatch(page, projectId)
    const positions = autoBody.layout?.positions ?? {}
    expect(positions['public.users']).toBeTruthy()
    expect(positions['public.posts']).toBeTruthy()

    // The re-derived dagre position for `users` differs from the manual one.
    const autoUsers = positions['public.users']!
    const movedFromManual =
      Math.abs(autoUsers.x - placedX) + Math.abs(autoUsers.y - placedY)
    expect(movedFromManual).toBeGreaterThan(50)

    // Edge still present after re-layout (auto-routing reset, Decision A).
    await expect(page.locator('.react-flow__edge-path').first()).toBeVisible()
  })
})
