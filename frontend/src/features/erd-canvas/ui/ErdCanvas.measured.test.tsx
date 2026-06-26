import { describe, expect, it } from 'vitest'
import { allCardsMeasured } from './ErdCanvas'

describe('allCardsMeasured', () => {
  it('카드가 0개면 false (아직 그릴 게 없음/시드 전)', () => {
    expect(allCardsMeasured([])).toBe(false)
    expect(allCardsMeasured([{ type: 'group', measured: { width: 100, height: 80 } }])).toBe(false)
  })

  it('table/enum이 전부 measured면 true', () => {
    expect(
      allCardsMeasured([
        { type: 'table', measured: { width: 240, height: 120 } },
        { type: 'enum', measured: { width: 160, height: 60 } },
        { type: 'group', measured: null }, // group은 판정 제외
      ]),
    ).toBe(true)
  })

  it('table/enum 중 하나라도 미측정이면 false', () => {
    expect(
      allCardsMeasured([
        { type: 'table', measured: { width: 240, height: 120 } },
        { type: 'table', measured: null },
      ]),
    ).toBe(false)
    expect(
      allCardsMeasured([{ type: 'table', measured: { width: 240 } }]),
    ).toBe(false)
  })
})
