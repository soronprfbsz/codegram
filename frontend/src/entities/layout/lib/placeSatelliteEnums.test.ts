import { describe, it, expect } from 'vitest'
import type { ErdFlowNode } from '@/entities/erd'
import { nodeSize } from '@/entities/erd'
import { placeSatelliteEnums } from './placeSatelliteEnums'

function table(id: string, x: number, y: number, cols = 3, parentId?: string): ErdFlowNode {
  return {
    id,
    type: 'table',
    position: { x, y },
    data: { tableName: id, tableId: id, columns: Array.from({ length: cols }, (_, i) => ({ id: `${id}.c${i}`, name: `c${i}`, type: 'int', pk: false, fk: false, nn: false, unique: false })) },
    ...(parentId ? { parentId } : {}),
  }
}

function satEnum(id: string, owner: string, x: number, y: number, parentId?: string): ErdFlowNode {
  return {
    id,
    type: 'enum',
    position: { x, y },
    data: { enumName: 'reason', values: ['a', 'b', 'c'], ownerTableId: owner },
    ...(parentId ? { parentId } : {}),
  }
}

describe('placeSatelliteEnums', () => {
  it('parks a new satellite enum (no stored position) to the right of its owner', () => {
    const owner = table('public.t', 100, 200)
    const en = satEnum('enum:check:public.t.reason', 'public.t', 0, 0)
    const out = placeSatelliteEnums([owner, en], {})
    const placed = out.find((n) => n.id === en.id)!
    // x = owner.x + owner width + GAP(40); y = owner.y (nothing to collide with).
    expect(placed.position.x).toBe(100 + nodeSize(owner).width + 40)
    expect(placed.position.y).toBe(200)
  })

  it('respects a stored (user-moved) enum position — does not re-park it', () => {
    const owner = table('public.t', 100, 200)
    const en = satEnum('enum:check:public.t.reason', 'public.t', 555, 666)
    const out = placeSatelliteEnums([owner, en], {
      'enum:check:public.t.reason': { x: 555, y: 666 },
    })
    expect(out.find((n) => n.id === en.id)!.position).toEqual({ x: 555, y: 666 })
  })

  it('nudges the enum down to avoid overlapping a sibling already to the right', () => {
    const owner = table('public.t', 0, 0)
    const rightX = nodeSize(owner).width + 40
    // A blocker sits exactly where the enum would land.
    const blocker = table('public.blocker', rightX, 0, 3)
    const en = satEnum('enum:check:public.t.reason', 'public.t', 0, 0)
    const out = placeSatelliteEnums([owner, blocker, en], {})
    const placed = out.find((n) => n.id === en.id)!
    expect(placed.position.x).toBe(rightX)
    // Pushed below the blocker (blocker bottom = its height).
    expect(placed.position.y).toBeGreaterThanOrEqual(nodeSize(blocker).height)
  })

  it('does nothing when there are no satellite enums', () => {
    const owner = table('public.t', 0, 0)
    const out = placeSatelliteEnums([owner], {})
    expect(out).toEqual([owner])
  })

  it('places the satellite using its owner ABSOLUTE position when the owner is grouped', () => {
    const group: ErdFlowNode = {
      id: 'group:g',
      type: 'group',
      position: { x: 1000, y: 500 },
      data: { groupName: 'g' },
    }
    // Owner is a group member: its coords are relative to the group origin.
    const owner = table('public.t', 10, 20, 3, 'group:g')
    const en = satEnum('enum:check:public.t.reason', 'public.t', 0, 0) // top-level
    const out = placeSatelliteEnums([group, owner, en], {})
    const placed = out.find((n) => n.id === en.id)!
    // owner absolute = group(1000,500) + (10,20) = (1010,520); enum to its right.
    expect(placed.position.x).toBe(1010 + nodeSize(owner).width + 40)
    expect(placed.position.y).toBe(520)
    expect(placed.parentId).toBeUndefined()
  })
})
