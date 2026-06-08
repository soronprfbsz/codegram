import { describe, it, expect } from 'vitest'
import { reconcileLayout } from './reconcile'
import type { ErdFlowNode, ErdFlowEdge } from '@/entities/erd'
import type { LayoutPositions } from '@/entities/layout/model/types'

/** Empty-column table node (matches autoLayout's nodeSize estimate of 240x40). */
function tableNode(id: string, parentId?: string): ErdFlowNode {
  const node: ErdFlowNode = {
    id,
    type: 'table',
    position: { x: 0, y: 0 },
    data: { tableName: id, tableId: id, columns: [] },
  }
  if (parentId) node.parentId = parentId
  return node
}

function groupNode(id: string): ErdFlowNode {
  return {
    id,
    type: 'group',
    position: { x: 0, y: 0 },
    data: { groupName: id },
  }
}

function relEdge(source: string, target: string): ErdFlowEdge {
  return {
    id: `${source}->${target}`,
    type: 'relation',
    source,
    target,
    data: { relation: '1-n', sourceMarker: 'one', targetMarker: 'many' },
  }
}

describe('reconcileLayout (ungrouped)', () => {
  it('keeps a stored position for a node whose id matches', () => {
    const nodes = [tableNode('public.users'), tableNode('public.posts')]
    const edges = [relEdge('public.users', 'public.posts')]
    const stored: LayoutPositions = {
      'public.users': { x: 320, y: 80 },
    }
    const out = reconcileLayout(nodes, edges, stored)
    const users = out.find((n) => n.id === 'public.users')!
    expect(users.position).toEqual({ x: 320, y: 80 })
  })

  it('lays out a node with no stored entry via dagre (some position assigned)', () => {
    const nodes = [tableNode('public.users'), tableNode('public.posts')]
    const edges = [relEdge('public.users', 'public.posts')]
    const stored: LayoutPositions = {
      'public.users': { x: 320, y: 80 },
    }
    const out = reconcileLayout(nodes, edges, stored)
    const posts = out.find((n) => n.id === 'public.posts')!
    // posts has no stored entry -> dagre placed it; and dagre separates it from
    // the (overridden) users node, so it is NOT at the stored coords.
    expect(typeof posts.position.x).toBe('number')
    expect(typeof posts.position.y).toBe('number')
    expect(posts.position).not.toEqual({ x: 320, y: 80 })
  })

  it('returns one node per input node, preserving ids and data', () => {
    const nodes = [tableNode('a'), tableNode('b')]
    const edges = [relEdge('a', 'b')]
    const out = reconcileLayout(nodes, edges, {})
    expect(out.map((n) => n.id).sort()).toEqual(['a', 'b'])
    expect(out.find((n) => n.id === 'a')!.data).toBe(
      nodes.find((n) => n.id === 'a')!.data,
    )
  })

  it('returns [] for an empty graph', () => {
    expect(reconcileLayout([], [], {})).toEqual([])
  })

  it('falls back to full dagre when stored is empty', () => {
    const nodes = [tableNode('a'), tableNode('b')]
    const edges = [relEdge('a', 'b')]
    const out = reconcileLayout(nodes, edges, {})
    // No overrides: distinct dagre positions.
    expect(out.find((n) => n.id === 'a')!.position).not.toEqual(
      out.find((n) => n.id === 'b')!.position,
    )
  })
})

describe('reconcileLayout (ADR-0004 id semantics)', () => {
  it('treats a renamed table (new id) as new -> dagre, not the old stored coords', () => {
    // Stored layout was for the OLD name; the parse now emits the NEW name.
    const stored: LayoutPositions = {
      'public.users': { x: 999, y: 999 },
    }
    const nodes = [tableNode('public.members'), tableNode('public.posts')]
    const edges = [relEdge('public.members', 'public.posts')]
    const out = reconcileLayout(nodes, edges, stored)
    const renamed = out.find((n) => n.id === 'public.members')!
    // No stored entry for the new id -> dagre position, NOT the orphaned (999,999).
    expect(renamed.position).not.toEqual({ x: 999, y: 999 })
    expect(typeof renamed.position.x).toBe('number')
  })

  it('silently ignores a stored id that is absent from the parse (orphan)', () => {
    const stored: LayoutPositions = {
      'public.users': { x: 320, y: 80 },
      'public.deleted_table': { x: 10, y: 10 }, // no longer in the schema
    }
    const nodes = [tableNode('public.users')]
    const edges: ErdFlowEdge[] = []
    const out = reconcileLayout(nodes, edges, stored)
    // Orphan produces no node; only the present node is returned.
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('public.users')
    expect(out.find((n) => n.id === 'public.deleted_table')).toBeUndefined()
    // Present node still honored its stored entry.
    expect(out[0].position).toEqual({ x: 320, y: 80 })
  })
})

describe('reconcileLayout (grouped-member frame guard)', () => {
  it('keeps a stored RELATIVE position when parentId matches', () => {
    const nodes = [
      groupNode('group:core'),
      tableNode('public.users', 'group:core'),
      tableNode('public.posts', 'group:core'),
    ]
    const edges = [relEdge('public.users', 'public.posts')]
    const stored: LayoutPositions = {
      'public.users': { x: 24, y: 12, parentId: 'group:core' },
      'public.posts': { x: 24, y: 200, parentId: 'group:core' },
    }
    const out = reconcileLayout(nodes, edges, stored)
    const group = out.find((n) => n.id === 'group:core')!
    const groupW = Number(group.style?.width)
    const groupH = Number(group.style?.height)
    const users = out.find((n) => n.id === 'public.users')!
    // Frame matched -> stored coords honored; refit re-bases members to be
    // relative to the new group origin, so they sit INSIDE the group box
    // (empty-column table node = 240x40, matching autoLayout's nodeSize).
    const MEMBER_W = 240
    const MEMBER_H = 40
    expect(users.position.x).toBeGreaterThanOrEqual(0)
    expect(users.position.y).toBeGreaterThanOrEqual(0)
    expect(users.position.x + MEMBER_W).toBeLessThanOrEqual(groupW)
    expect(users.position.y + MEMBER_H).toBeLessThanOrEqual(groupH)
  })

  it('drops a stored position when the node moved to a DIFFERENT group', () => {
    const nodes = [
      groupNode('group:core'),
      groupNode('group:billing'),
      tableNode('public.users', 'group:billing'), // now under a different group
    ]
    const edges: ErdFlowEdge[] = []
    const stored: LayoutPositions = {
      'public.users': { x: 24, y: 12, parentId: 'group:core' }, // saved under the OLD group
    }
    const out = reconcileLayout(nodes, edges, stored)
    const users = out.find((n) => n.id === 'public.users')!
    // parentId mismatch -> stale frame -> dagre, NOT the stored (24,12).
    expect(users.position).not.toEqual({ x: 24, y: 12 })
  })

  it('drops a stored UNGROUPED position when the node became grouped', () => {
    const nodes = [
      groupNode('group:core'),
      tableNode('public.users', 'group:core'), // now grouped
    ]
    const edges: ErdFlowEdge[] = []
    const stored: LayoutPositions = {
      'public.users': { x: 320, y: 80 }, // saved while ungrouped (no parentId)
    }
    const out = reconcileLayout(nodes, edges, stored)
    const users = out.find((n) => n.id === 'public.users')!
    // stored.parentId undefined but node.parentId='group:core' -> mismatch -> dagre.
    expect(users.position).not.toEqual({ x: 320, y: 80 })
  })

  it('drops a stored GROUPED position when the node became ungrouped', () => {
    const nodes = [tableNode('public.users')] // no parentId now
    const edges: ErdFlowEdge[] = []
    const stored: LayoutPositions = {
      'public.users': { x: 24, y: 12, parentId: 'group:core' }, // saved while grouped
    }
    const out = reconcileLayout(nodes, edges, stored)
    const users = out.find((n) => n.id === 'public.users')!
    // node.parentId undefined but stored.parentId set -> mismatch -> dagre.
    expect(users.position).not.toEqual({ x: 24, y: 12 })
  })
})
