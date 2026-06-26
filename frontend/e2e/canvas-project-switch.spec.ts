import { test, expect } from '@playwright/test'
import { registerAndLogin } from './helpers'

// A: enum + 2 tables (1 FK edge + 1 enum-link). B: enum + 3 tables (2 FK + enum-link).
// B has MORE tables than A so a stale A render is detectable by table count.
const A_DBML = `enum a_status {
  pending
  active
}
Table a_users {
  id integer [pk]
  name varchar
}
Table a_orders {
  id integer [pk]
  uid integer [ref: > a_users.id]
  st a_status
}`

const B_DBML = `enum b_kind {
  x
  y
  z
}
Table b_a {
  id integer [pk]
}
Table b_b {
  id integer [pk]
  aid integer [ref: > b_a.id]
}
Table b_c {
  id integer [pk]
  bid integer [ref: > b_b.id]
  k b_kind
}`

test('enum node is selectable like a table (ring + selection card)', async ({ page }) => {
  await registerAndLogin(page, `enumsel${Date.now()}@e.com`, 'password123')
  const ra = await page.request.post('/api/projects', { data: { name: 'AAA', dbml_text: A_DBML } })
  const aId = (await ra.json()).id as string

  await page.goto(`/editor/${aId}`)
  await page.getByTestId('canvas-loading-overlay').waitFor({ state: 'detached', timeout: 15_000 })

  const enumNode = page.locator('.react-flow__node-enum').first()
  await expect(enumNode).toHaveCount(1)
  await enumNode.click()

  // 1) The floating Selection card opens for the enum (like a table).
  await expect(page.getByTestId('selection-section')).toBeVisible()
  // 2) The enum card shows the selected ring — primary border, same token as TableNode.
  const enumCard = enumNode.locator('[class*="min-w-"]').first()
  await expect(enumCard).toHaveCSS('border-color', /.+/)
  const borderColor = await enumCard.evaluate((el) => getComputedStyle(el).borderColor)
  // --primary resolves to a non-amber color; assert it's not the default amber border.
  // (amber-300 ≈ rgb(252, 211, 77)). The selected ring must differ.
  expect(borderColor).not.toBe('rgb(252, 211, 77)')
})

test('switching projects keeps the overlay up until the NEW diagram is settled (no stale reflow)', async ({ page }) => {
  await registerAndLogin(page, `switch${Date.now()}@e.com`, 'password123')
  const ra = await page.request.post('/api/projects', { data: { name: 'AAA', dbml_text: A_DBML } })
  const aId = (await ra.json()).id as string
  const rb = await page.request.post('/api/projects', { data: { name: 'BBB', dbml_text: B_DBML } })
  const bId = (await rb.json()).id as string

  // Open A and let it settle.
  await page.goto(`/editor/${aId}`)
  await page.getByTestId('canvas-loading-overlay').waitFor({ state: 'detached', timeout: 15_000 })
  await expect(page.locator('.react-flow__node-table')).toHaveCount(2) // A has 2 tables

  // Switch to B via the sidebar (SPA navigation, not a full reload).
  await page.getByTestId(`sidebar-project-${bId}`).click()

  // The loading overlay must come back up for the switch...
  const overlay = page.getByTestId('canvas-loading-overlay')
  await overlay.waitFor({ state: 'visible', timeout: 10_000 })
  // ...and stay up until B's diagram is measured + route-settled, then detach.
  await overlay.waitFor({ state: 'detached', timeout: 15_000 })

  // The instant the overlay is gone, B (3 tables) must be drawn — NOT the stale
  // A (2 tables). This is the regression: before the fix the overlay closed on
  // A's diagram and the user saw it re-build into B.
  await expect(page.locator('.react-flow__node-table')).toHaveCount(3)

  // And the edge paths must not change in the following frames (no visible reflow).
  const edgePaths = () =>
    page.$$eval('.react-flow__edge path', (ps) => ps.map((p) => p.getAttribute('d') ?? ''))
  const before = await edgePaths()
  expect(before.length).toBeGreaterThan(0)
  await page.evaluate(
    () =>
      new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
      ),
  )
  const after = await edgePaths()
  expect(after).toEqual(before)
})
