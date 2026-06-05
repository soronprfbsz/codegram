/**
 * Centralized TanStack Query keys for the project entity.
 * Mutations invalidate `list()` and sync `detail(id)`.
 */
export const projectQueryKeys = {
  all: ['projects'] as const,
  list: () => [...projectQueryKeys.all, 'list'] as const,
  detail: (id: string) => [...projectQueryKeys.all, 'detail', id] as const,
}
