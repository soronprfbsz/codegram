/**
 * 노트 표시 배율의 단일 출처(ADR-0026). 렌더(features/erd-canvas)와 배치 계산
 * (nodeSize → dagre)이 같은 범위·정규화를 봐야 하므로 entities/erd에 둔다.
 * PURE, no side effects (FSD).
 */

/** 하한 = 기존 기본 크기. 축소는 제공하지 않는다(읽을 수 없는 노트는 노트가 아니다). */
export const NOTE_SCALE_MIN = 1
/** 상한. 그 이상은 노트가 도면을 잡아먹는다. */
export const NOTE_SCALE_MAX = 3

/** 저장값·입력값을 [MIN, MAX]로 정규화한다. 없음/비수 → MIN. */
export function clampNoteScale(scale: number | undefined): number {
  if (typeof scale !== 'number' || Number.isNaN(scale)) return NOTE_SCALE_MIN
  return Math.min(NOTE_SCALE_MAX, Math.max(NOTE_SCALE_MIN, scale))
}
