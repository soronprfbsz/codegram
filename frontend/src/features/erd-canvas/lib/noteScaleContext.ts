/**
 * 노트 노드 → 캔버스 액션 통로. StickyNote는 React Flow 렌더러 안에 있어 콜백을
 * context(provider의 useMemo로 안정 identity)로 받는다. groupActionContext와 동일 패턴.
 * features layer (FSD): erd-canvas 로컬.
 */
import { createContext, useContext } from 'react'

export interface NoteScaleContextValue {
  /**
   * 노트의 표시 배율을 바꾼다(ADR-0026).
   * commit=false → 드래그 중 미리보기(노드 data만), true → layout 저장까지.
   */
  onNoteScale: (nodeId: string, scale: number, commit: boolean) => void
}

const noop = () => {}
export const NoteScaleContext = createContext<NoteScaleContextValue>({
  onNoteScale: noop,
})
export function useNoteScaleContext(): NoteScaleContextValue {
  return useContext(NoteScaleContext)
}
