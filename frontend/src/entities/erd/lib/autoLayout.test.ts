import { describe, it, expect } from 'vitest'
import { autoLayout } from './autoLayout'
import type { ErdFlowNode, ErdFlowEdge } from '@/entities/erd/model/types'

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

describe('autoLayout', () => {
  it('assigns non-overlapping positions to connected nodes', () => {
    const nodes = [tableNode('public.users'), tableNode('public.posts')]
    const edges = [relEdge('public.users', 'public.posts')]
    const out = autoLayout(nodes, edges)
    const users = out.find((n) => n.id === 'public.users')!
    const posts = out.find((n) => n.id === 'public.posts')!
    // Distinct positions (gridLayout packs them into separate cells).
    expect(users.position).not.toEqual(posts.position)
  })

  it('returns one output node per input node, preserving ids and data', () => {
    const nodes = [tableNode('a'), tableNode('b'), tableNode('c')]
    const edges = [relEdge('a', 'b'), relEdge('b', 'c')]
    const out = autoLayout(nodes, edges)
    expect(out.map((n) => n.id).sort()).toEqual(['a', 'b', 'c'])
    expect(out.find((n) => n.id === 'a')!.data).toBe(
      nodes.find((n) => n.id === 'a')!.data,
    )
  })

  it('is deterministic: identical input yields identical positions', () => {
    const make = () => ({
      nodes: [tableNode('a'), tableNode('b')],
      edges: [relEdge('a', 'b')],
    })
    const first = autoLayout(make().nodes, make().edges)
    const second = autoLayout(make().nodes, make().edges)
    expect(first.map((n) => n.position)).toEqual(
      second.map((n) => n.position),
    )
  })

  it('keeps group members clustered and sizes the group node to its members', () => {
    const nodes = [
      groupNode('group:core'),
      tableNode('public.users', 'group:core'),
      tableNode('public.posts', 'group:core'),
      tableNode('public.audit'), // ungrouped, far in the graph
    ]
    const edges = [
      relEdge('public.users', 'public.posts'),
      relEdge('public.posts', 'public.audit'),
    ]
    const out = autoLayout(nodes, edges)
    const group = out.find((n) => n.id === 'group:core')!
    // Group node received a measurable bounding box.
    expect(Number(group.style?.width)).toBeGreaterThan(0)
    expect(Number(group.style?.height)).toBeGreaterThan(0)
    // Both members still reference the group as parent.
    expect(out.find((n) => n.id === 'public.users')!.parentId).toBe('group:core')
    expect(out.find((n) => n.id === 'public.posts')!.parentId).toBe('group:core')
  })

  it('re-bases member positions RELATIVE to the parent group so members sit INSIDE the group box', () => {
    // Upstream ungrouped chain pushes the group away from the origin, so a
    // bug that leaves member coords ABSOLUTE (parent offset double-counted)
    // lands them outside the parent-relative [0, groupSize] box.
    const nodes = [
      tableNode('public.a'),
      tableNode('public.b'),
      groupNode('group:core'),
      tableNode('public.users', 'group:core'),
      tableNode('public.posts', 'group:core'),
    ]
    const edges = [
      relEdge('public.a', 'public.b'),
      relEdge('public.b', 'public.users'),
      relEdge('public.users', 'public.posts'),
    ]
    const out = autoLayout(nodes, edges)
    const group = out.find((n) => n.id === 'group:core')!
    const groupW = Number(group.style?.width)
    const groupH = Number(group.style?.height)
    expect(groupW).toBeGreaterThan(0)
    expect(groupH).toBeGreaterThan(0)
    // Member size matches autoLayout's estimate for an empty-column table node:
    // TABLE_WIDTH (240) x HEADER_HEIGHT (40, no rows).
    const MEMBER_W = 240
    const MEMBER_H = 40
    for (const id of ['public.users', 'public.posts']) {
      const m = out.find((n) => n.id === id)!
      // Parent-relative coords (not absolute): inside [0, groupSize].
      expect(m.position.x).toBeGreaterThanOrEqual(0)
      expect(m.position.y).toBeGreaterThanOrEqual(0)
      expect(m.position.x + MEMBER_W).toBeLessThanOrEqual(groupW)
      expect(m.position.y + MEMBER_H).toBeLessThanOrEqual(groupH)
    }
  })

  it('does not crash on an empty graph', () => {
    expect(autoLayout([], [])).toEqual([])
  })

  it('positions an isolated node (no edges) without throwing', () => {
    const out = autoLayout([tableNode('solo')], [])
    expect(out).toHaveLength(1)
    expect(typeof out[0].position.x).toBe('number')
    expect(typeof out[0].position.y).toBe('number')
  })

  it('uses balanced grid (not dagre LR column) when there are no groups', () => {
    const nodes = Array.from({ length: 8 }, (_, i) => tableNode(`public.t${i}`)) // ungrouped
    const out = autoLayout(nodes, [])
    const xs = new Set(out.map((n) => Math.round(n.position.x)))
    expect(xs.size).toBeGreaterThan(1) // more than one column (not a single vertical stack)
  })

  it('clusters group members and sizes the group node when groups are present', () => {
    const nodes = [groupNode('group:core'), tableNode('public.a', 'group:core'), tableNode('public.b', 'group:core')]
    const out = autoLayout(nodes, [])
    expect(out.find((n) => n.id === 'group:core')!.style?.width).toBeTruthy()
    expect(out.find((n) => n.id === 'public.a')!.parentId).toBe('group:core')
  })
})
