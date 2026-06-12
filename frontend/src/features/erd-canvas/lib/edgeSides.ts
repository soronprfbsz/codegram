/**
 * PURE 앵커 면(left/right) 결정 (요청: auto-arrange 시 FK 선이 겹쳐 보이는 문제).
 *
 * 테이블 카드의 핸들은 고정이다 — FK(target) 컬럼은 왼쪽, PK(source) 컬럼은
 * 오른쪽. auto-layout이 FK 테이블을 그 PK 테이블보다 왼쪽에 놓으면, 선이 카드를
 * 빙 둘러 왼쪽 핸들로 들어가야 하고(둘러가기), 같은 타깃으로 둘러 들어가는 여러
 * 선이 같은 통로를 공유해 한 줄로 겹쳐 보인다. 이를 없애기 위해 두 테이블의 X
 * 위치를 비교해, 선이 항상 서로를 "마주보는" 짧은 경로로 붙도록 각 끝점의 면을
 * 정한다(스왑 기능의 @left/@right 보조 핸들 재사용).
 *
 * 기본(겹치지 않는 정상 배치): source는 오른쪽으로 나가고 target은 왼쪽으로
 * 들어온다. target이 source보다 **왼쪽**에 있으면 둘 다 뒤집어 마주보게 한다.
 * 사용자가 수동으로 좌/우 스왑한 값(stored)이 있으면 그것이 기하보다 우선한다.
 *
 * features layer (FSD): entities/layout 타입만 의존. 순수.
 */
import type { EdgeSide } from '@/entities/layout'

export function resolveEdgeSides(
  sourceX: number,
  targetX: number,
  stored?: { sourceSide?: EdgeSide; targetSide?: EdgeSide },
): { sourceSide: EdgeSide; targetSide: EdgeSide } {
  // target이 source보다 확실히 왼쪽일 때만 뒤집는다(동일 X는 기본 유지).
  const targetIsLeft = targetX < sourceX
  const geomSource: EdgeSide = targetIsLeft ? 'left' : 'right'
  const geomTarget: EdgeSide = targetIsLeft ? 'right' : 'left'
  return {
    sourceSide: stored?.sourceSide ?? geomSource,
    targetSide: stored?.targetSide ?? geomTarget,
  }
}
