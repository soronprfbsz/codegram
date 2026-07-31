// frontend/e2e/note-scale.spec.ts
import { test, expect, type Page } from '@playwright/test'
import { enterEditMode } from './helpers'

const PASSWORD = 'password123'
const NOTE_ID = 'note:history'

/** closeBrackets:false 이므로 따옴표를 그대로 타이핑해도 안전하다(DbmlEditor.tsx:59). */
const DBML = `Table users {
  id int [pk]
}

Note history {
  'memo line'
}
`

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

async function createProjectAndOpen(page: Page, name: string): Promise<string> {
  const createResponse = page.waitForResponse(
    (resp) =>
      resp.url().includes('/api/projects') &&
      resp.request().method() === 'POST' &&
      resp.status() === 201,
  )
  await page.getByPlaceholder('프로젝트 이름').fill(name)
  await page.getByRole('button', { name: '만들기' }).click()
  const created = await (await createResponse).json()
  const projectId = created.id as string
  await page.waitForURL((url) => url.pathname === `/editor/${projectId}`)
  await enterEditMode(page)
  return projectId
}

async function typeDbml(page: Page, dbml: string) {
  const editor = page.getByTestId('dbml-editor')
  await editor.locator('.cm-content').click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('Delete')
  await page.keyboard.type(dbml)
}

/** Drag the note's corner handle horizontally by dx screen px. */
async function dragHandle(page: Page, dx: number) {
  const handle = page.getByTestId(`note-resize-${NOTE_ID}`)
  const box = (await handle.boundingBox())!
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx + dx, cy, { steps: 10 })
  await page.mouse.up()
}

async function noteWidth(page: Page): Promise<number> {
  const box = (await page.getByTestId(`sticky-note-${NOTE_ID}`).boundingBox())!
  return box.width
}

/** Zoom-independent size read: the card's own --note-scale custom property.
 *  Screen-px width depends on React Flow's fit-to-view zoom, which can change
 *  across a reload once the note grows — the CSS variable is the actual state
 *  under test and is unaffected by zoom. */
async function noteScaleVar(page: Page): Promise<number> {
  const value = await page
    .getByTestId(`sticky-note-${NOTE_ID}`)
    .evaluate((el) => getComputedStyle(el).getPropertyValue('--note-scale'))
  return parseFloat(value)
}

test.describe('note display scale (ADR-0026)', () => {
  test('drag grows the note, and the scale survives a reload', async ({ page }) => {
    await registerAndLogin(page, `note-scale-${Date.now()}@example.com`)
    const projectId = await createProjectAndOpen(page, 'note scale')
    await typeDbml(page, DBML)

    const card = page.getByTestId(`sticky-note-${NOTE_ID}`)
    await expect(card).toBeVisible({ timeout: 20000 })
    const before = await noteWidth(page)
    const cardBefore = (await card.boundingBox())!

    const patch = page.waitForResponse(
      (r) =>
        r.url().includes(`/api/projects/${projectId}`) &&
        r.request().method() === 'PATCH' &&
        r.status() === 200,
    )
    await dragHandle(page, 120)

    // 카드가 실제로 커졌다 (transform이 아니라 레이아웃이 커진 것 — border-box 기준).
    const after = await noteWidth(page)
    expect(after).toBeGreaterThan(before + 20)

    // 핸들 드래그가 카드를 이동시키지 않았다 (RF 노드 드래그와 분리됨).
    const cardAfter = (await card.boundingBox())!
    expect(Math.abs(cardAfter.x - cardBefore.x)).toBeLessThan(2)
    expect(Math.abs(cardAfter.y - cardBefore.y)).toBeLessThan(2)

    // layout에 배율이 실려 저장됐다.
    const body = (await patch).request().postDataJSON() as {
      layout?: { positions: Record<string, { scale?: number }> }
    }
    const savedScale = body.layout?.positions[NOTE_ID]?.scale
    expect(savedScale).toBeGreaterThan(1)

    // 새로고침 후에도 큰 상태다 — 화면 px가 아니라 --note-scale로 잰다(zoom-invariant).
    // 새로고침은 fit-to-view를 다시 돌리므로, 커진 노트가 화면 폭을 오히려 줄일 수
    // 있다(캔버스 px는 커졌는데 화면 px는 줌이 작아져 줄어드는 위장 실패를 막는다).
    await page.reload()
    await expect(card).toBeVisible({ timeout: 20000 })
    expect(await noteScaleVar(page)).toBeCloseTo(savedScale!, 2)
  })

  test('double-clicking the handle restores the default size', async ({ page }) => {
    await registerAndLogin(page, `note-reset-${Date.now()}@example.com`)
    await createProjectAndOpen(page, 'note reset')
    await typeDbml(page, DBML)

    await expect(page.getByTestId(`sticky-note-${NOTE_ID}`)).toBeVisible({ timeout: 20000 })
    const before = await noteWidth(page)

    await dragHandle(page, 120)
    expect(await noteWidth(page)).toBeGreaterThan(before + 20)

    await page.getByTestId(`note-resize-${NOTE_ID}`).dblclick()
    expect(await noteWidth(page)).toBeCloseTo(before, 0)
  })

  test('the maximum scale caps growth', async ({ page }) => {
    await registerAndLogin(page, `note-cap-${Date.now()}@example.com`)
    await createProjectAndOpen(page, 'note cap')
    await typeDbml(page, DBML)

    await expect(page.getByTestId(`sticky-note-${NOTE_ID}`)).toBeVisible({ timeout: 20000 })
    const before = await noteWidth(page)

    await dragHandle(page, 3000)
    const capped = await noteWidth(page)
    // 핸들이 뷰포트 밖으로 나가 두 번째 드래그가 아무것도 잡지 못해도 폭 비교는
    // 우연히 통과할 수 있다 — --note-scale이 실제로 상한(3)에 고정됐는지로
    // "클램프됨"과 "제스처가 아예 안 먹힘"을 구별한다.
    expect(await noteScaleVar(page)).toBeCloseTo(3, 2)
    await dragHandle(page, 3000)
    expect(await noteScaleVar(page)).toBeCloseTo(3, 2)
    // 상한에 걸렸다는 것이 "아무 일도 없었다"와 구별되어야 한다 — 실제로 3배 근처까지 컸다.
    expect(capped).toBeGreaterThan(before * 2.5)
    // 상한 3배 — 캔버스 줌이 1이면 폭도 약 3배다.
    expect(capped).toBeLessThan(before * 3.2)
  })

  test('auto-arrange preserves the note scale (and re-persists it)', async ({ page }) => {
    // Finding 1 (final review): handleAutoArrange reconciles a fresh,
    // schema-derived node set (no data.scale) against an EMPTY stored set, so
    // without seeding the scale back in, one auto-arrange silently resets the
    // note to 1.0 on screen AND persists that scale-less layout — erasing it.
    await registerAndLogin(page, `note-arrange-${Date.now()}@example.com`)
    const projectId = await createProjectAndOpen(page, 'note arrange')
    await typeDbml(page, DBML)

    await expect(page.getByTestId(`sticky-note-${NOTE_ID}`)).toBeVisible({ timeout: 20000 })

    const growPatch = page.waitForResponse(
      (r) =>
        r.url().includes(`/api/projects/${projectId}`) &&
        r.request().method() === 'PATCH' &&
        r.status() === 200,
    )
    await dragHandle(page, 120)
    await growPatch
    const grownScale = await noteScaleVar(page)
    expect(grownScale).toBeGreaterThan(1)

    const arrangePatch = page.waitForResponse(
      (r) =>
        r.url().includes(`/api/projects/${projectId}`) &&
        r.request().method() === 'PATCH' &&
        r.status() === 200,
    )
    await page.getByTestId('auto-arrange-button').click()
    await page.getByTestId('auto-arrange-confirm-ok').click()

    await expect(page.getByTestId(`sticky-note-${NOTE_ID}`)).toBeVisible({ timeout: 20000 })
    // Still enlarged on screen after auto-arrange recomputed every position.
    expect(await noteScaleVar(page)).toBeCloseTo(grownScale, 2)

    // ...and the autosave PATCH that follows auto-arrange still carries it.
    const body = (await arrangePatch).request().postDataJSON() as {
      layout?: { positions: Record<string, { scale?: number }> }
    }
    expect(body.layout?.positions[NOTE_ID]?.scale).toBeCloseTo(grownScale, 2)
  })

  test('read-only canvas offers no resize handle', async ({ page }) => {
    await registerAndLogin(page, `note-ro-${Date.now()}@example.com`)
    const projectId = await createProjectAndOpen(page, 'note read-only')
    await typeDbml(page, DBML)
    await expect(page.getByTestId(`sticky-note-${NOTE_ID}`)).toBeVisible({ timeout: 20000 })

    // 편집 모드에서 나가 읽기 전용으로 되돌린다 (ADR-0025).
    await page.getByTestId('mode-switch-read').click()
    await page.goto(`/editor/${projectId}`)
    await expect(page.getByTestId(`sticky-note-${NOTE_ID}`)).toBeVisible({ timeout: 20000 })
    await expect(page.getByTestId(`note-resize-${NOTE_ID}`)).toHaveCount(0)
  })
})
