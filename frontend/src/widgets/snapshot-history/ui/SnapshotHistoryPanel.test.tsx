import { describe, it, expect } from 'vitest'
import i18n from '@/shared/i18n'
import { kindBadge } from './SnapshotHistoryPanel'

describe('kindBadge', () => {
  const t = i18n.getFixedT('ko')

  it('names a user-chosen save point apart from the 30-minute snapshot', () => {
    expect(kindBadge('checkpoint', t)).toBe('저장')
    expect(kindBadge('auto_fine', t)).toBe('30분')
    expect(kindBadge('auto_coarse', t)).toBe('월')
    expect(kindBadge('manual', t)).toBe('수동')
  })
})
