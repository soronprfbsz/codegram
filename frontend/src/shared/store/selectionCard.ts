import { create } from 'zustand'

const KEY = 'codegram-selcard-pos'

export interface CardPos {
  x: number
  y: number
}

/**
 * Floating Selection 카드의 위치(캔버스 래퍼 기준 absolute top/left).
 * 테마·언어와 같은 정신으로 localStorage에만 저장한다(DB 불필요). null이면
 * 기본 위치(좌상단). 드래그로 옮긴 위치는 다음 선택에서도 유지된다.
 */
interface SelectionCardState {
  pos: CardPos | null
  setPos: (pos: CardPos) => void
}

function readStored(): CardPos | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as Partial<CardPos>
    if (typeof v.x === 'number' && typeof v.y === 'number') {
      return { x: v.x, y: v.y }
    }
  } catch {
    // ignore
  }
  return null
}

function persist(pos: CardPos) {
  try {
    localStorage.setItem(KEY, JSON.stringify(pos))
  } catch {
    // ignore
  }
}

export const useSelectionCardStore = create<SelectionCardState>((set) => ({
  pos: readStored(),
  setPos: (pos) =>
    set(() => {
      persist(pos)
      return { pos }
    }),
}))
