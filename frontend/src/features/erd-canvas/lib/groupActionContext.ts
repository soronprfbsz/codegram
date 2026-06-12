// frontend/src/features/erd-canvas/lib/groupActionContext.ts
/**
 * 그룹 노드 → 캔버스 액션 통로. GroupNode는 React Flow 렌더러 안에 있어 콜백을
 * context(provider의 ref로 안정 identity)로 받는다. edgePathContext와 동일 패턴.
 * features layer (FSD): erd-canvas 로컬.
 */
import { createContext, useContext } from 'react'

export interface GroupActionContextValue {
  /** 그룹 1개를 제자리에서 콤팩트 정렬(라벨 옆 버튼). */
  onArrangeGroup: (groupId: string) => void
}

const noop = () => {}
export const GroupActionContext = createContext<GroupActionContextValue>({
  onArrangeGroup: noop,
})
export function useGroupActionContext(): GroupActionContextValue {
  return useContext(GroupActionContext)
}
