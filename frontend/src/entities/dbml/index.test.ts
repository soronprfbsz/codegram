import { describe, it, expect } from 'vitest'
import { parseDbml } from '@/entities/dbml'

describe('entities/dbml barrel', () => {
  it('re-exports parseDbml as the public entry point', () => {
    expect(typeof parseDbml).toBe('function')
    const result = parseDbml('Table users {\n  id integer [pk]\n}')
    expect(result.ok).toBe(true)
  })
})
