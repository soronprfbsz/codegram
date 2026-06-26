// frontend/e2e/enum-edge-edit.spec.ts
// Enum-link edges are now editable like relation edges: selectable, with segment
// drag handles. This project's ONLY edge is the synthesized column→enum link, so
// clicking the lone edge must select it and reveal edit handles.
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

// One table whose `failure_reason` TEXT column is constrained by an enum-style
// CHECK → schemaToFlow synthesizes one enum node + one dashed column→enum link.
// No FK refs, so that enum link is the ONLY edge on the canvas.
const DBML = `Table failed_auth {
  id int [pk]
  failure_reason text
  Checks {
    \`failure_reason = ANY (ARRAY['bad_password'::text, 'locked'::text, 'mfa_failed'::text])\`
  }
}`

async function clickFirstEdge(page: Page) {
  const pt = await page
    .locator('.react-flow__edge-path')
    .first()
    .evaluate((el) => {
      const p = el as SVGPathElement
      const total = p.getTotalLength()
      const c = p.getScreenCTM()!
      const toScreen = (m: DOMPoint) => ({ x: c.a * m.x + c.c * m.y + c.e, y: c.b * m.x + c.d * m.y + c.f })
      for (let d = 0; d <= 0.45; d += 0.02) {
        for (const f of d === 0 ? [0.5] : [0.5 + d, 0.5 - d]) {
          const s = toScreen(p.getPointAtLength(total * f))
          const hit = document.elementFromPoint(s.x, s.y)
          if (hit && hit.closest('.react-flow__edge')) return s
        }
      }
      return toScreen(p.getPointAtLength(total / 2))
    })
  await page.mouse.click(pt.x, pt.y)
}

test('enum-link edge is selectable and shows segment drag handles', async ({ page }) => {
  await registerAndLogin(page, `enumedge-${Date.now()}@example.com`)

  const createResp = await page.request.post('/api/projects', {
    data: { name: 'Enum Edge Edit', dbml_text: DBML, layout: { version: 1, positions: {} } },
  })
  expect(createResp.status()).toBe(201)
  const { id } = await createResp.json()

  await page.goto(`/editor/${id}`)
  await page.waitForSelector('[data-testid="erd-canvas"]', { timeout: 15000 })

  // The enum node renders, and exactly one edge (the column→enum link) exists.
  await expect
    .poll(async () => page.locator('.react-flow__edge').count(), { timeout: 10000 })
    .toBeGreaterThanOrEqual(1)

  // No edit handles before selection.
  await expect(page.locator('[data-testid^="edge-seg-"]')).toHaveCount(0)

  // Clicking the enum link selects it → segment drag handles appear (editable).
  await clickFirstEdge(page)
  await expect(page.locator('[data-testid^="edge-seg-"]').first()).toBeVisible({ timeout: 5000 })

  // Flip the enum-side anchor by DRAGGING the target endpoint across the enum
  // node's center → it re-anchors to the other side and the path changes.
  const dBefore = await page.locator('.react-flow__edge-path').first().getAttribute('d')
  const endpoint = page.getByTestId('edge-endpoint-target')
  await expect(endpoint).toBeVisible()
  const box = (await endpoint.boundingBox())!
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx + 320, cy, { steps: 8 })
  await page.mouse.up()
  await expect
    .poll(async () => page.locator('.react-flow__edge-path').first().getAttribute('d'))
    .not.toBe(dBefore)
})
