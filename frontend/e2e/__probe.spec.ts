import { test, expect } from '@playwright/test'
test('separate icon/text color and background color', async ({ page }) => {
  const email = `probe-${Date.now()}@example.com`
  await page.goto('/register')
  await page.locator('#register-email').fill(email)
  await page.locator('#register-password').fill('password123')
  await page.locator('#register-confirm-password').fill('password123')
  const lr = page.waitForResponse((r: any) => r.url().includes('/api/auth/jwt/login') && r.status() === 204)
  await page.getByRole('button', { name: '회원가입' }).click(); await lr
  await page.waitForURL((u: any) => u.pathname === '/')
  await page.request.post('/api/projects', { data: { name: 'Colors', dbml_text: 'Table t { id int [pk] }' } })
  await page.goto('/'); await page.waitForTimeout(400)

  // open glyph picker
  await page.getByRole('button', { name: '프로젝트 아이콘 변경' }).first().click()
  // pick an IT icon, icon/text color = red, background = blue
  await page.getByTestId('glyph-option-db').click()
  await page.getByLabel('아이콘·글씨색 red').click()
  const patch = page.waitForResponse((r: any) => r.url().includes('/api/projects/') && r.request().method() === 'PATCH' && r.status() === 200)
  await page.getByLabel('배경색 blue').click()
  await patch
  await page.waitForTimeout(300)
  await page.keyboard.press('Escape')
  // reload to confirm persistence
  await page.reload(); await page.waitForTimeout(500)
  // the badge svg should be red on a blue background
  const info = await page.locator('main [class*="rounded-md"] svg').first().evaluate((el: any) => {
    const span = el.closest('span')
    return { stroke: el.getAttribute('stroke'), bg: getComputedStyle(span).backgroundColor }
  })
  console.log('BADGE', JSON.stringify(info))
  await page.screenshot({ path: '/home/soron/.claude/jobs/17216774/tmp/two-color.png' })
  await page.getByRole('button', { name: '프로젝트 아이콘 변경' }).first().click()
  await page.screenshot({ path: '/home/soron/.claude/jobs/17216774/tmp/two-color-picker.png' })
})
