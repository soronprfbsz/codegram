import { useMutation } from '@tanstack/react-query'
import { apiFetch } from '@/shared/api/client'
import type {
  IntrospectRequest,
  IntrospectResponse,
  SchemaListResponse,
} from '../model/types'

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

/** POST /api/introspect/schemas — list selectable schemas for the target DB. */
function listSchemas(req: IntrospectRequest): Promise<SchemaListResponse> {
  return apiFetch<SchemaListResponse>('/introspect/schemas', {
    method: 'POST',
    body: JSON.stringify(req),
  })
}

/** Mutation wrapper; no cache invalidation (transient, read-only call). */
export function useListSchemas() {
  return useMutation({ mutationFn: listSchemas })
}
