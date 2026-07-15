import { useMutation } from '@tanstack/react-query'
import { apiFetch } from '@/shared/api/client'
import type { PasswordResetResult } from '../model/types'

function resetPassword(accountId: string): Promise<PasswordResetResult> {
  return apiFetch<PasswordResetResult>(
    `/accounts/${accountId}/reset-password`,
    { method: 'POST' },
  )
}

/**
 * Reset an account's password to a random one-time temp value (requires
 * user:manage). The plaintext temp password is only ever returned here.
 */
export function useResetPassword() {
  return useMutation({
    mutationFn: resetPassword,
  })
}
