/**
 * 이 캔버스가 읽기 전용인지 — React Flow 렌더러 **안**의 커스텀 노드/엣지
 * (RelationEdge·GroupNode)가 편집 어포던스를 감출 때 본다. 렌더러 내부 컴포넌트는
 * props를 직접 못 받으므로 edgePathContext/groupActionContext와 같은 통로를 쓴다.
 *
 * 편집 게이트의 단일 출처(G1): 캔버스 읽기 전용 여부는 ErdCanvas가 한 번 제공하고
 * 내부 컴포넌트는 소비만 한다. 읽기 모드에서는 캔버스의 어떤 것도 편집할 수 없다
 * (ADR-0025 — 편집은 들어가는 모드다).
 * features layer (FSD): erd-canvas 로컬.
 */
import { createContext, useContext } from 'react'

/** 기본 false: provider 없이 렌더되는 격리 테스트는 편집 가능 캔버스로 본다. */
export const CanvasReadOnlyContext = createContext(false)

export function useCanvasReadOnly(): boolean {
  return useContext(CanvasReadOnlyContext)
}
