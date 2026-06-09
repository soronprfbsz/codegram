import { describe, it, expect } from 'vitest'
import { tableLineRange } from './tableLineRange'

const PLAIN = `Table users {
  id integer [pk]
  name varchar
}`

const WITH_SETTINGS = `Table orders [headercolor: #fff] {
  id integer [pk]
}`

const QUOTED = `Table "user accounts" {
  id integer [pk]
}`

const MULTI = `Table users {
  id integer [pk]
}

Table posts {
  id integer [pk]
  user_id integer
}`

describe('tableLineRange', () => {
  it('plain block — returns 1-based from/to lines', () => {
    const result = tableLineRange(PLAIN, 'users')
    expect(result).toEqual({ fromLine: 1, toLine: 4 })
  })

  it('block with [headercolor: ...] settings before { — still matches', () => {
    const result = tableLineRange(WITH_SETTINGS, 'orders')
    expect(result).toEqual({ fromLine: 1, toLine: 3 })
  })

  it('quoted name `Table "user accounts" {` — matches the quoted form', () => {
    const result = tableLineRange(QUOTED, 'user accounts')
    expect(result).toEqual({ fromLine: 1, toLine: 3 })
  })

  it('absent table — returns null', () => {
    expect(tableLineRange(PLAIN, 'nonexistent')).toBeNull()
  })

  it('multiple tables — picks the correct one by name', () => {
    const users = tableLineRange(MULTI, 'users')
    const posts = tableLineRange(MULTI, 'posts')
    expect(users).toEqual({ fromLine: 1, toLine: 3 })
    expect(posts).toEqual({ fromLine: 5, toLine: 8 })
  })

  it('case-insensitive Table keyword', () => {
    const doc = 'table users {\n  id int\n}'
    expect(tableLineRange(doc, 'users')).toEqual({ fromLine: 1, toLine: 3 })
  })
})
