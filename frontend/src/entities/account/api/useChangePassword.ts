import { useMutation } from '@tanstack/react-query'
import { apiFetch } from '@/shared/api/client'

export interface ChangePasswordParams {
  /** null in the forced must-change-password flow; required (and verified
   * server-side) for a voluntary change. */
  current_password: string | null
  new_password: string
}

function changePassword(params: ChangePasswordParams): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>('/account/change-password', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

/** Change the caller's own password (ADR-0016: forced or voluntary). */
export function useChangePassword() {
  return useMutation({
    mutationFn: changePassword,
  })
}
