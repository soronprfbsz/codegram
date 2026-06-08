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
