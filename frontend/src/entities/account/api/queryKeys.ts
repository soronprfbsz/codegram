/** Centralized TanStack Query keys for the account entity. */
export const accountQueryKeys = {
  all: ['accounts'] as const,
  list: () => [...accountQueryKeys.all, 'list'] as const,
}

/** Query key for the caller's own account (GET /account/me). */
export const meQueryKey = ['account', 'me'] as const

/** Query key for the public admin-contact list (GET /admins). */
export const adminContactsQueryKey = ['admins'] as const
