import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/shared/api/client'
import type { Role } from '../model/types'
import { rolesQueryKey } from './queryKeys'

interface UpdateRolePermissionsParams {
  roleId: string
  permissionCodes: string[]
}

function updateRolePermissions({
  roleId,
  permissionCodes,
}: UpdateRolePermissionsParams): Promise<Role> {
  return apiFetch<Role>(`/roles/${roleId}/permissions`, {
    method: 'PATCH',
    body: JSON.stringify({ permission_codes: permissionCodes }),
  })
}

/** Replace a role's permission set (requires user:manage), then refresh the matrix. */
export function useUpdateRolePermissions() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: updateRolePermissions,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: rolesQueryKey }),
  })
}
