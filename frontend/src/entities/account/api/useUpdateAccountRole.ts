import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/shared/api/client'
import type { Account } from '../model/types'
import { accountQueryKeys } from './queryKeys'

interface UpdateAccountRoleParams {
  accountId: string
  roleName: string
}

function updateAccountRole({
  accountId,
  roleName,
}: UpdateAccountRoleParams): Promise<Account> {
  return apiFetch<Account>(`/accounts/${accountId}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ role_name: roleName }),
  })
}

/** Change an account's role (requires user:manage), then refresh the list. */
export function useUpdateAccountRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: updateAccountRole,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: accountQueryKeys.all }),
  })
}
