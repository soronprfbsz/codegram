import { describe, it, expect, beforeEach } from 'vitest'
import i18n from '@/shared/i18n'
import { tableDocLabels } from './labels'

describe('tableDocLabels', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('builds English labels for export when the UI language is English', () => {
    const labels = tableDocLabels(i18n.t)
    expect(labels.columnHeaders).toEqual([
      'Column',
      'Type',
      'PK',
      'FK',
      'NN',
      'UNIQUE',
      'Default',
      'Description',
    ])
    expect(labels.fkColumn).toBe('Column')
    expect(labels.enumColValue).toBe('Value')
  })

  it('follows the active language (Korean)', async () => {
    await i18n.changeLanguage('ko')
    const labels = tableDocLabels(i18n.t)
    expect(labels.columnHeaders[0]).toBe('컬럼명')
    expect(labels.columnHeaders[1]).toBe('데이터타입')
    expect(labels.columnHeaders[7]).toBe('설명')
    expect(labels.enumColValue).toBe('값')
    await i18n.changeLanguage('en')
  })
})
