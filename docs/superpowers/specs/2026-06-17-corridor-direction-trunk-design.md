# 모델 1 — 목적지 그룹별 obstacle-aware 진입 trunk (코리도 엣지 라우팅)

> 작성일 2026-06-17. 작업 위치 `frontend/src/features/erd-canvas/`. 선행 문서:
> `docs/superpowers/specs/2026-06-16-corridor-edge-routing-design.md`,
> 메모리 `corridor-edge-routing.md`·`same-pk-edge-bundling.md`.

## 1. 배경 / 문제

ERD 관계선을 "공장라인" 코리도로 정리하는 장기 작업의 마지막 난제. 같은-PK FK들을
하나의 trunk로 묶어 카드를 가로지르지 않게 라우팅하는 기능은 이미 main에 있다(2단계
intra-group spine 버스, HEAD `9459f5c`).

남은 문제: **한 PK가 사방 그룹으로 가는 소스 fan.** 사용자 실제 스키마(40+ 테이블,
6 그룹)에서 `account`가 RBAC 그룹 안에 있고, `account_id`를 참조하는 FK 28개가 5개
그룹(version·service·BOARD·operation·common)으로 사방 흩어진다.

현재 grouped spine 버스의 **진입 구간**은 직선 하강이다:

```
src → (descentX, src.y) → (descentX, spineY) → (gx, spineY) → (gx, t.y) → (t.x, t.y)
       └────── 진입(직선 하강) ──────┘   └────────── spine + 포크 ──────────┘
```

- version(account 오른쪽, 비슷한 y)·service(더 오른쪽) 타깃 → 진입 가로선이 그룹 위쪽
  패딩을 지나가 카드를 안 건드림 → spine 버스 정상.
- **BOARD(아래 y≈2547)·operation(위 y≈39)** 타깃 → `descentX`에서의 **수직 하강선이
  중간 version 그룹(x1344–3168, y933–2387)의 내부 카드를 관통** → per-member
  `lineCrosses` true → 멤버별 raw A* 폴백 → raw A*의 소스 fan(`sourceLaneIndex *
  LANE_GAP`, 14px 간격 부채꼴)이 화면에 드러남. 28개 중 ~8개가 이 폴백 fan.

"소스에서 완전히 한 선"은 타깃이 상·하·우 모든 방향이라 기하학적으로 불가. 그래서
**그룹당 1개 trunk(≈5개)** 로 정리하는 모델 1로 합의(이전 세션 brainstorming).

## 2. 목표 / 성공 기준

- account→BOARD, account→operation 멤버가 **폴백 없이 목적지 그룹별 공유 trunk에
  합류**한다(소스 first-turn x가 14px 부채꼴이 아니라 그룹당 1개 trunk x로 수렴).
- 어떤 멤버 경로도 카드 내부를 가로지르지 않는다(0 crossing 유지 — 기존 보장).
- version·service 등 이미 정상인 케이스, 기존 503 단위 테스트, edge-path E2E 10개,
  `tsc --noEmit`는 **무변경 통과**한다.

## 3. 접근법 (확정된 설계 결정)

이전 세션 brainstorming에서 확정:

1. **코리도 찾기 알고리즘 = A* 재사용 + spine 버스.** 목적지 그룹 클러스터마다
   `routeOrthogonal` A*를 1번 돌려 `source → 그룹 진입점`까지의 **공유 진입 trunk**를
   구하고, 진입 후엔 기존 spine 버스가 그룹 내부 포크를 이어받는다. (검증된 A*+spine
   재사용, 신규 코드 최소, 리스크 최저.)
2. **trunk↔spine 연결점 = `(descentX, spineY)`.** A* 진입 trunk는 이 free waypoint
   까지 담당하고, 거기서부터 기존 spine(`(descentX,spineY) → (gx,spineY) → (gx,t.y)
   → (t.x,t.y)`)이 이어받는다.
3. **소스 fan 처리 = 현상 유지.** 모델 1이 폴백 수를 크게 줄이는 게 핵심. 소스 fan
   로직(`sourceLaneIndex`)은 건드리지 않고, 여전히 trunk에 합류 못 하는 잔여 폴백
   멤버만 fan으로 남긴다. (전역 fan 억제는 E2E `edge-path.spec.ts:372` "source 바로
   위 컬럼" 케이스를 깨므로 범위 밖.)
4. **방향별 추가 합치기 = 범위 밖(YAGNI).** 그룹당 1 trunk만. 같은 방향 trunk 추가
   병합, "완전히 한 선" 분기, loose(그룹 밖) trunk의 A*화는 모두 제외.

## 4. 변경 위치 (surgical)

`lib/mergeBundleRoutes.ts`의 **grouped 멤버 처리 루프(현재 209–245행)만** 수정한다.

- **무변경**: loose(그룹 밖) 멤버의 cross-canvas 세로 trunk 경로, `RelationEdge.tsx`,
  `edgeRoutesContext.tsx`, `spreadEdgeRoutes.ts`, 레이아웃 상수.
- **import 추가**: `routeOrthogonal`을 `./routeOrthogonal`에서 추가 import(이미 같은
  모듈에서 `crossesObstacle`, `Rect`, `Point`를 import 중).
- 새 파일 없음.

## 5. 알고리즘 상세

grouped 클러스터 루프(`for (const cluster of groupedMembers.values())`)에서, 기존
`descentX`/`spineY`/`gx`/`geomOk` 계산은 **그대로 유지**하고 진입 구간만 교체한다.

### 5.1 진입 장애물 집합

```
srcGroupIdx  = groupBoxes.findIndex((g) => contains(g, src))   // 음수면 src가 그룹 밖
destGroupIdx = gi                                              // 현재 클러스터의 그룹 인덱스(map 키)
approachObstacles = [
  ...obstacles,                                                // 모든 테이블/enum/sticky 카드(항상)
  ...groupBoxes.filter((_, i) => i !== srcGroupIdx && i !== destGroupIdx),  // 비-끝점 그룹 박스만
]
```

`buildObstacles`(RelationEdge)의 1단계 채널 의미와 동일: 중간 그룹은 통째로 우회,
끝점 그룹은 박스를 제외해 진입 허용(내부 카드는 `obstacles`로 여전히 장애물).

### 5.2 공유 진입 trunk (클러스터당 1회)

```
entry = { x: descentX, y: spineY }
leaveSide = side          // 번들이 추론한 접근 방향('left'|'right')
entrySide = side          // free waypoint이므로 동일 side 전달(스텁이 spine과 정렬)
approachPath = routeOrthogonal(src, entry, leaveSide, entrySide, approachObstacles)
```

`approachPath`는 클러스터 전 멤버가 **공유**한다. A*는 version 옆/아래의 빈 통로를
자동으로 찾아 BOARD·operation 진입점까지 우회한다.

### 5.3 멤버별 최종 경로

```
for (const m of cluster) {
  t  = targetOf(m)
  gx = side === 'left' ? t.x - APPROACH_STUB : t.x + APPROACH_STUB
  line = simplify([
    ...approachPath,        // src → … 우회 … → (descentX, spineY)
    { x: gx, y: spineY },   // spine: 행 위를 달려 이 컬럼 거터로
    { x: gx, y: t.y },      // 포크: 컬럼 거터로 하강해 FK 행으로
    { x: t.x, y: t.y },     // 타깃 스텁
  ])
  if (!lineCrosses(line)) copies.set(m.id, line)   // 폴백: raw A* 유지(현상 유지)
}
```

`approachPath`의 마지막 점이 `(descentX, spineY)`와 같으므로 `simplify`가 중복/공선
점을 병합한다. spine·포크·`lineCrosses`·`APPROACH_STUB`·`SPINE_RISE` 등은 무변경.

### 5.4 안전 폴백

- A*가 경로를 못 찾으면(`approachPath`가 비었거나 2점 미만 degenerate) 그 클러스터는
  **기존 직선 진입으로 폴백**(`src → (descentX,src.y) → (descentX,spineY) …`) — 즉
  현행 동작으로 안전 하강. (직선이 카드를 가로지르면 다시 per-member `lineCrosses`
  폴백.)
- 기존 `geomOk` 가드(back-doubling 거부) 유지.

## 6. 엣지 케이스 / 함정

- **entry free-waypoint 스텁**: `routeOrthogonal`은 양 끝에 `STEP_OUT(30)` 스텁을
  붙인다. entry가 노드 앵커가 아니라 빈 점이므로 작은 꺾임이 생길 수 있다 →
  `simplify`로 흡수되는지, 그 꺾임이 카드를 안 건드리는지 라이브 재현 + E2E로 검증.
  필요 시 entry 호출에 `margin` 인자 조정으로 스텁 억제 검토(구현 중 판단).
- **groupBoxes 미전달 시 무변경**: 기존 단위 테스트는 `groupBoxes`를 안 넘기므로
  `groupedMembers`가 비어 grouped 루프 자체가 안 돈다 → byte-identical. A* 호출은
  grouped 클러스터 안에서만 일어나므로 기존 테스트 영향 없음.
- **src가 그룹 밖(srcGroupIdx 음수)**: `filter((_, i) => i !== -1 …)`은 모든 그룹을
  장애물로 포함 → 의도대로(끝점 그룹만 목적지 그룹). 문제 없음.
- **그룹 치수**: `groupBoxes` rect는 `edgeRoutesContext`가 `style.width/height`로
  파생(measured 비어있을 수 있음) — 이미 처리됨.

## 7. 테스트 (TDD)

### 7.1 단위 (먼저 — red→green)

`lib/mergeBundleRoutes.test.ts`에 추가:

- **"중간 그룹을 낀 같은-PK 번들이 진입 trunk로 우회한다"**: src와 목적지 그룹 사이에
  카드를 낀 중간 그룹을 둔 픽스처(직선 하강이 그 카드를 관통하는 좌표). 모델 1 적용
  결과 멤버들이 **공유 진입 trunk로 합류**하고 어떤 세그먼트도 카드를 가로지르지
  않음을 단언(`crossesObstacle` 0).
- 기존 "intra-group spine bus" 등 모든 단위 테스트 무변경 통과 확인.

### 7.2 E2E

`frontend/e2e/`의 `edge-path.spec.ts`(throwaway 검증은 `__*.spec.ts`):

- 실제 스키마 축약본(`/tmp/codegram-real-schema.dbml`)으로 account→BOARD/operation
  멤버의 first-turn x가 **14px 부채꼴이 아니라 그룹당 1개 trunk x로 수렴**하고, 모든
  경로 샘플점이 어떤 `.react-flow__node-table` 내부에도 없음을 단언(getScreenCTM +
  getPointAtLength, 2px inset).
- bg-overlay config(baseURL :4001, webServer undefined) 사용. flow/screen 좌표 혼동
  주의(엣지 `d`는 flow, getBoundingClientRect는 screen).

### 7.3 회귀

- 기존 503 단위 + edge-path E2E 10개 + `tsc --noEmit` green 유지.
- 특히 `edge-path.spec.ts:372`(source 바로 위 컬럼 fan)는 소스 fan 미변경이라 그대로
  통과.

## 8. 범위 밖 (YAGNI)

- 같은 방향 trunk 추가 병합(모델 2 요소), "완전히 한 선" 분기.
- loose(그룹 밖) cross-canvas trunk의 A*화.
- 소스 fan 전역 억제.
- 대안 모델 B(FK 친화도 기반 그룹 재배치) — 구현 중 막히면 보조 제안 가능하나 이번
  spec 범위 밖.
