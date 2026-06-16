# 2단계 코리도 엣지 라우팅 설계 (공장라인)

- 날짜: 2026-06-16
- 상태: 설계 승인 (구현 대기)
- 관련 선행 작업: `2026-06-16-edge-overlap-spreading-design.md`, `2026-06-12-source-lane-edge-spreading.md`, ADR-0010(그룹 레이아웃), ADR-0012(수동 엣지 경로)

## 1. 배경 / 문제

ERD 캔버스의 관계선이 두 가지 문제를 보인다.

1. **테이블 가로지름.** 선이 테이블 카드 내부를 지나간다. `routeOrthogonal`(per-edge A*)은 이론상 카드 내부를 피하지만, 후처리 패스(`mergeBundleRoutes`의 trunk, `spreadEdgeRoutes`의 차선 이동)가 세그먼트를 옮길 때 **장애물을 재검사하지 않아** 카드를 스치거나 가로지른다(기존 알려진 한계). 사용자 확인: 가로지름 현상 실재.
2. **선이 코리도 없이 흩어짐.** "공통으로 지나갈 공장라인 같은 공간"이 없어 선들이 간극을 제멋대로 통과한다. 특히 먼 그룹으로 향하는 선이 **중간 그룹 내부의 테이블 사이를 뚫고** 지나간다.

## 2. 목표 (요구사항)

1. 선은 **테이블 엔티티를 절대 가로지르지 않는다** (하드 제약).
2. **2단계 코리도**:
   - 1단계 = 그룹과 그룹 사이의 넓은 채널 (먼 거리 이동은 여기로).
   - 2단계 = 그룹 진입 시에만, 그 그룹 내부 테이블과 테이블 사이로.
3. **같은 PK** 를 참조하는 엣지들 → 하나의 버스 trunk로 합쳐져 코리도를 달리다가 목표 테이블 근처에서만 fork. **다른 PK** → 코리도 안에 PK 종류 수만큼 별도의 평행선이 나란히 흐른다 (버스는 same-PK 한정).
4. 코리도 폭은 **고정 넉넉한 간격**으로 확보 (적응형 아님 — 단순·예측 가능 우선).
5. 그룹이 **없는** 다이어그램에서는 2단계가 사라지고 "테이블 사이 코리도" 1단계만 적용.

비목표(이번 범위 밖): 명시적 채널 그래프 재작성, 적응형 간격, 선의 채널 정중앙 완벽 정렬(스프레더의 평행 정렬로 충분), 수동 경로/enum 링크 동작 변경.

## 3. 접근법

검토한 3가지 — (1) 점진적 확장, (2) 명시적 채널 그래프 라우팅(재작성), (3) 하이브리드 — 중 **(1) 점진적 확장**을 채택. 이미 검증된 same-PK 버스(`mergeBundleRoutes`)·평행 차선(`spreadEdgeRoutes`)·A* 거터 라우팅(`routeOrthogonal`)을 버리지 않고, 가로지름의 알려진 원인(후처리 grazing + 중간 그룹 관통)을 정확히 겨냥한다. (2)/(3)은 효과 대비 리스크 과다.

신규 파일 없음. 기존 파일 수정 + 테스트 추가.

## 4. 설계

### 4.1 레이아웃 간격 확대 (고정)

코리도가 평행선을 담을 만큼 넓어지도록 고정 상수를 키운다. 아래는 **시작값**이며 실제 스키마(reporter의 account/customer/service/publishing/service_component 등)로 눈으로 튜닝한다.

| 위치 | 파일 | 현재 → 제안 | 의미 |
|---|---|---|---|
| 테이블 사이 (그룹 내부 패킹 포함) | `entities/erd/lib/gridLayout.ts` `GAP_X` / `GAP_Y` | 80 → **120 / 100** | 2단계 코리도 폭 |
| 그룹 사이 (rank 간, 가로) | `entities/erd/lib/groupedLayout.ts` dagre `ranksep` | 140 → **220** | 1단계 채널 |
| 그룹 사이 (같은 rank, 세로) | `entities/erd/lib/groupedLayout.ts` dagre `nodesep` | 80 → **160** | 1단계 채널 |

- `gridLayout`은 그룹 미사용 다이어그램의 전체 배치 + `packGroupedLayout`의 그룹 내부 패킹 양쪽에 쓰이므로, `GAP_*` 상향은 두 경우의 테이블-사이 코리도를 동시에 넓힌다.
- 그룹 내부 패딩 `GROUP_PAD_*`(`nodeSize.ts`)는 유지. `separateGroups`가 그룹 박스 겹침을 이미 방지하므로 그대로 활용.

### 4.2 그룹 박스를 "통과용 장애물"로 추가 (핵심 신규 메커니즘)

`features/erd-canvas/ui/RelationEdge.tsx`의 `orthoPoints` `useMemo`에서 장애물 집합을 확장한다.

- **기존 장애물**: 모든 `table`/`enum`/`sticky` 카드 (양 끝 카드 포함; 포트가 경계를 스치는 것은 `crossesObstacle`의 strict-interior 테스트로 허용됨).
- **추가 장애물**: 각 `group` 노드의 박스 중, **이 엣지의 source 그룹도 target 그룹도 아닌** 그룹만.
  - `sourceGroupId = nodeLookup.get(source)?.parentId` (그 부모가 group 타입일 때만)
  - `targetGroupId = nodeLookup.get(target)?.parentId`
  - 끝점이 속한 그룹은 장애물에서 **제외** → 엣지가 진입 가능. 단 그 그룹 내부 테이블은 여전히 장애물 → 2단계 위빙.
  - 무관한 그룹은 박스 통째로 장애물 → A*가 돌아간다 = 1단계 채널 강제.
- 그룹 박스 rect = `internals.positionAbsolute` + `measured`(또는 `style`) width/height. `routeOrthogonal`의 `margin`(16)으로 동일하게 inflate.

엣지 케이스 처리:
- 같은 그룹 내 두 테이블 → 그 그룹은 source==target 그룹이라 장애물 아님(1단계 없음, 2단계만). ✓
- 그룹 밖 테이블 ↔ 그룹 B 테이블 → source 그룹 없음, target 그룹 B → B만 제외, 나머지 그룹 장애물. ✓
- 그룹 없는 다이어그램 → `group` 노드 자체가 없어 추가 장애물 0 → 기존 테이블-only 라우팅(=1단계만). ✓

이는 이미 검증된 "양 끝 카드를 장애물로 넣되 포트는 경계를 스침" 패턴의 그룹 버전이다.

### 4.3 후처리 장애물 인식 (가로지름 제거)

순수함수 두 개에 `obstacles: Rect[]` 파라미터를 추가하고, `crossesObstacle`를 `routeOrthogonal.ts`에서 export하여 재사용한다.

- **`mergeBundleRoutes(routes, bundleKeyOf, obstacles?)`**: 클러스터의 trunk + per-member fork 세그먼트(`[src, (trunkX,src.y), (trunkX,t.y), (t.x,t.y)]`)를 만든 뒤, 그 폴리라인의 어떤 세그먼트라도 카드 내부를 가로지르면 그 **클러스터 전체를 원래 A* 경로로 폴백**(기존 `trunkOk` 거부 분기와 동일한 "never make worse" 패턴 확장). `obstacles` 미전달 시 기존 동작과 동일(하위호환).
- **`spreadEdgeRoutes(routes, gap, bundleKeyOf?, obstacles?)`**: 세그먼트를 평행 트랙으로 옮길 때, 옮긴 좌표에서 그 세그먼트가 카드를 가로지르면 **그 멤버는 이동을 취소**(원좌표 유지). 결과적으로 두 선이 가깝게 남을 수 있으나(허용 — 가독성 손해 < 가로지름) 가로지름은 발생하지 않는다. `obstacles` 미전달 시 기존 동작과 동일.

**장애물 공급 경로**: `EdgeRoutesProvider`(`edgeRoutesContext.tsx`)는 `ReactFlowProvider` 안에 있으므로 `useStore((s) => s.nodeLookup)`로 테이블/enum/sticky rect를 파생할 수 있다. 파생한 `Rect[]`를 ref에 저장하고, 기존 `version`(rAF bump) recompute 시점에 `mergeBundleRoutes`/`spreadEdgeRoutes`로 전달한다. 엣지가 재라우팅될 때(노드 이동 등) register→bump가 이미 발생하므로 obstacle ref는 recompute 시점에 최신이다. (group 박스는 후처리 대상이 아니다 — 후처리는 same-PK 버스/평행 차선 정렬만 하며, 1단계 채널 보장은 4.2의 A*가 담당. 후처리의 역할은 "이미 올바른 A* 경로를 옮기다가 카드를 침범하지 않게" 하는 것이므로 테이블 rect만으로 충분.)

## 5. 변경 파일 요약

신규 파일 없음.

- `entities/erd/lib/gridLayout.ts` — `GAP_X`/`GAP_Y` 상향.
- `entities/erd/lib/groupedLayout.ts` — dagre `nodesep`/`ranksep` 상향.
- `features/erd-canvas/lib/routeOrthogonal.ts` — `crossesObstacle` export.
- `features/erd-canvas/lib/mergeBundleRoutes.ts` — `obstacles?` 파라미터 + 클러스터 폴백.
- `features/erd-canvas/lib/spreadEdgeRoutes.ts` — `obstacles?` 파라미터 + 이동 취소.
- `features/erd-canvas/lib/edgeRoutesContext.tsx` — `useStore`로 obstacle rect 파생 → 두 순수함수에 전달.
- `features/erd-canvas/ui/RelationEdge.tsx` — `orthoPoints` 장애물에 비-끝점 그룹 박스 추가.

## 6. 검증 전략 (TDD)

- **순수함수 단위 테스트 (vitest)**
  - `mergeBundleRoutes.test.ts`: 클러스터 trunk가 카드를 가로지르는 입력 → 원래 경로로 폴백함을 단언. obstacles 미전달 시 기존 동작 불변.
  - `spreadEdgeRoutes.test.ts`: 이동 후 카드를 침범하는 멤버 → 이동 취소(원좌표 유지). 침범 없으면 기존대로 벌어짐.
  - `routeOrthogonal.test.ts`: source/target이 아닌 그룹 박스가 장애물일 때 경로가 그 박스 내부를 통과하지 않음(=돌아감)을 단언.
- **E2E (`frontend/e2e/edge-path.spec.ts`)**
  - reporter 스키마에 그룹을 포함시켜 로드 → 렌더된 모든 `.react-flow__edge-path`가 어떤 테이블 카드 bbox 내부도 통과하지 않음을 단언(**가로지름 0**). 경로를 `getPointAtLength`로 샘플링해 각 점이 카드 rect 밖인지 검사.
  - 기존 same-PK 버스 / 다른-PK 평행선 / 그룹 통과 회피 테스트 유지.
- **시각 확인**: docker 스택(:4001) + Playwright로 before/after 캡처(메모리의 throwaway overlay config 레시피 사용).

## 7. 리스크 / 트레이드오프

- 간격 확대로 다이어그램이 전반적으로 커진다(사용자 수용함 — F 선택).
- "이동 취소"는 가로지름을 막되 두 선이 가깝게 남을 수 있다(가독성 < 정확성 우선, 수용함).
- 그룹 박스 장애물 추가로 A* 그리드가 그룹당 x/y 라인 2개씩 커진다 — 일반 스키마 규모에서 성능 영향 미미.
- 간격 상수는 튜닝 대상. 시작값으로 reporter 스키마에서 검증 후 조정.
