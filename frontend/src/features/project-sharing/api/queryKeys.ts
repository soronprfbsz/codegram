/** TanStack Query keys for a project's membership roster. */
export const memberQueryKeys = {
  all: ['project-members'] as const,
  list: (projectId: string) =>
    [...memberQueryKeys.all, projectId] as const,
}
