import { test, expect } from '@playwright/test'

test('home page renders the app heading', async ({ page }) => {
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'ERD-DBML' }),
  ).toBeVisible()
})
