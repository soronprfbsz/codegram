import { describe, it, expect } from 'vitest'
import { parseDbml } from '@/entities/dbml/lib/parse'
import { searchTables } from '@/entities/dbml/lib/searchTables'
import type { DbmlSchema } from '@/entities/dbml/model/types'

function parseOk(text: string): DbmlSchema {
  const result = parseDbml(text)
  if (!result.ok) throw new Error(result.errors.map((e) => e.message).join('; '))
  return result.schema
}

const schema = parseOk(`
  Table users {
    id integer [pk]
    email varchar [note: '로그인 이메일']
    role varchar
  }
  Table orders {
    id integer [pk]
    user_id integer
    note: '주문 테이블'
  }
`)

describe('searchTables', () => {
  it('returns an empty map for a blank query', () => {
    expect(searchTables(schema, '').size).toBe(0)
    expect(searchTables(schema, '   ').size).toBe(0)
  })

  it('matches by table name with no hint (name is already shown)', () => {
    const m = searchTables(schema, 'user')
    expect(m.has('public.users')).toBe(true)
    expect(m.get('public.users')?.hint).toBeNull()
    expect(m.get('public.users')?.matchedColumnIds).toEqual([])
  })

  it('matches by column name and reports the matched column in the hint + ids', () => {
    const m = searchTables(schema, 'email')
    expect(m.has('public.users')).toBe(true)
    expect(m.get('public.users')?.hint).toBe('컬럼: email')
    expect(m.get('public.users')?.matchedColumnIds).toEqual(['public.users.email'])
  })

  it('matches by table note', () => {
    const m = searchTables(schema, '주문')
    expect(m.has('public.orders')).toBe(true)
    expect(m.get('public.orders')?.hint).toBe('주석 일치')
    expect(m.get('public.orders')?.matchedColumnIds).toEqual([])
  })

  it('matches by column note and highlights that column', () => {
    const m = searchTables(schema, '로그인')
    expect(m.has('public.users')).toBe(true)
    expect(m.get('public.users')?.hint).toBe('컬럼 주석 일치')
    expect(m.get('public.users')?.matchedColumnIds).toEqual(['public.users.email'])
  })

  it('is case-insensitive', () => {
    expect(searchTables(schema, 'USER').has('public.users')).toBe(true)
    expect(searchTables(schema, 'Email').get('public.users')?.hint).toBe('컬럼: email')
  })

  it('prefers a table-name match (no hint) over a column match', () => {
    // "user" matches the `users` table name AND the `user_id` column of orders.
    const m = searchTables(schema, 'user')
    expect(m.get('public.users')?.hint).toBeNull()
    expect(m.get('public.orders')?.hint).toBe('컬럼: user_id')
  })

  it('summarizes multiple column-name matches with a +N suffix', () => {
    const wide = parseOk(`
      Table t {
        ax integer
        ay integer
        az integer
      }
    `)
    expect(searchTables(wide, 'a').get('public.t')?.hint).toBe('컬럼: ax +2')
  })
})
