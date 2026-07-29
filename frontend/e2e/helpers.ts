import { expect, type Page } from '@playwright/test'

export async function registerAndLogin(page: Page, email: string, password: string) {
  await page.goto('/register')
  await page.locator('#register-email').fill(email)
  await page.locator('#register-password').fill(password)
  await page.locator('#register-confirm-password').fill(password)
  const loginResponse = page.waitForResponse(
    (resp) => resp.url().includes('/api/auth/jwt/login') && resp.status() === 204,
  )
  await page.getByRole('button', { name: '회원가입' }).click()
  await loginResponse
  await page.waitForURL((url) => url.pathname === '/')
}

/**
 * Take the edit lease. Opening a project reads it — editing is a mode you step
 * into (ADR-0025) — so any test that changes a project must do this first,
 * exactly as a user does. Waits on the switch rather than the canvas: an empty
 * project renders no canvas but still offers the way in.
 */
export async function enterEditMode(page: Page) {
  const edit = page.getByTestId('mode-switch-edit')
  await expect(edit).toBeEnabled({ timeout: 20000 })
  await edit.click()
  await expect(edit).toHaveAttribute('aria-checked', 'true')
}
