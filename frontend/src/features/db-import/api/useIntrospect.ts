import { useMutation } from '@tanstack/react-query'
import { apiFetch } from '@/shared/api/client'
import type { IntrospectRequest, IntrospectResponse } from '../model/types'

/** POST /api/introspect — connect to an external DB and return DDL. */
function introspect(req: IntrospectRequest): Promise<IntrospectResponse> {
  return apiFetch<IntrospectResponse>('/introspect', {
    method: 'POST',
    body: JSON.stringify(req),
  })
}

/** Mutation wrapper; no cache invalidation (transient, read-only call). */
export function useIntrospect() {
  return useMutation({ mutationFn: introspect })
}
