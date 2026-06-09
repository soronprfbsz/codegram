# DB 동기화 (Phase 2) 설계

기존 Project의 ERD를 연결한 DB의 현재 구조로 갱신한다. 결정: [ADR-0009](../../adr/0009-db-sync-replace-and-place.md), 관련 [ADR-0008](../../adr/0008-db-introspection-backend-reflection.md)·[ADR-0004](../../adr/0004-layout-reconciliation-by-name.md), CONTEXT.md "DB 동기화".

## 확정 결정 (grill 결과)
- **전체 교체**: `dbml_text`를 introspect 결과 DBML로 통째로 교체. 구조는 DB가 진실(단방향). 사용자 주석/수동 그룹/색은 보존 안 됨(확인 다이얼로그로 경고).
- **이름 기반 Layout 보존**(ADR-0004): 살아남은 테이블은 위치 유지, 삭제된 테이블은 제거.
- **신규 테이블 빈공간 배치**: 기존(위치 보존) 테이블 bounding box **아래** 빈 영역에 compact dagre로 배치하고, 그 위치를 Layout에 **명시 저장**(reconcile이 그대로 honor → dagre 겹침 회피).
- **진입점**: 에디터 TopBar "Sync from DB" 버튼 → DbConnectDialog 재사용 → 덮어쓰기 확인.
- **백엔드 변경 없음**: 기존 `/api/introspect` 재사용.

## 핵심 흐름
```
[에디터 TopBar] "Sync from DB"
  → DbConnectDialog(재사용, @/features/db-import) — 접속정보 입력
  → introspect → importSqlToDbml → DBML (dialog가 onIntrospected(dbml)로 전달)
  → [덮어쓰기 확인 다이얼로그] "현재 DBML을 DB 스키마로 교체합니다. DB에 없는 수동 노트·그룹·색은 사라집니다. 테이블 위치는 보존됩니다."
  → 확인 시:
      const schema = parseDbml(dbml).schema
      const positions = computeSyncedPositions(currentPositions, schema)
      setDbmlText(dbml); setPositions(positions)
  → 에디터 재파싱 → reconcile: 살아남은 위치 유지 / 삭제 제거 / 신규는 저장된 빈공간 좌표 사용
```

## 신규 유닛: `computeSyncedPositions` (PURE)
`frontend/src/entities/layout/lib/placeNewTables.ts`
```
computeSyncedPositions(current: LayoutPositions, schema: DbmlSchema): LayoutPositions
```
- `schemaToFlow(schema)`로 nodes/edges 생성. 테이블 노드만 대상(전체 교체 후 그룹/enum 없음 — 그래도 방어적으로 table 타입만).
- surviving = 새 schema 테이블 노드 중 id가 `current`에 있는 것 → `current[id]` 유지. new = `current`에 없는 것.
- new 없으면 → surviving만(삭제분 pruned) 반환.
- surviving 없으면(보존할 게 없음) → `{}` 반환(전체가 신규 → reconcile dagre가 알아서 배치).
- 그 외: existingBbox = surviving 노드들의 `current[id]` + `nodeSize(node)`로 (minX, maxY) 계산. new 노드들 sub-layout = `autoLayout(newNodes, edgesAmongNewNodes)` → subBbox(minX,minY). 오프셋: 각 new 노드 `{ x: sub.x - subMinX + existingMinX, y: sub.y - subMinY + existingMaxY + GAP }` (GAP=80). surviving(pruned) + new(placed) 병합 반환.
- id 키 = `${schema}.${name}`(LayoutPositions 키 규약). 좌표는 절대(parentId 없음).
- 의존: `@/entities/erd`(schemaToFlow·autoLayout·nodeSize), `@/entities/dbml`(DbmlSchema type), `@/entities/layout`(LayoutPositions type). entities/layout→entities/erd는 reconcile에서 이미 쓰는 패턴.

## UI 배선
- **ErdTopBar**(`widgets/erd-topbar`): `onSync: () => void` prop 추가 + Import SQL 옆에 "Sync from DB" secondary 버튼(lucide `RefreshCw` 또는 `DatabaseZap` 아이콘, 2px stroke). 기존 prop/슬롯 보존.
- **에디터 페이지**(`pages/editor/index.tsx`): 페이지가 sync 오케스트레이션 소유(페이지=합성 루트, feature→feature 회피).
  - state: `syncOpen`, `pendingSyncDbml`.
  - `onSync={() => setSyncOpen(true)}` → TopBar에 전달.
  - `<DbConnectDialog open={syncOpen} onOpenChange={setSyncOpen} onIntrospected={(dbml) => { setSyncOpen(false); setPendingSyncDbml(dbml) }} />` (`@/features/db-import`에서 import — 페이지 합성).
  - 확인 다이얼로그(`shared/ui/dialog`): pendingSyncDbml !== null일 때 표시. 확인 → `applySync(pendingSyncDbml)`; 취소 → `setPendingSyncDbml(null)`.
  - `applySync(dbml)`: `parseDbml(dbml)` → schema; `computeSyncedPositions(positions, schema)`; `setDbmlText(dbml)` + `setPositions(positions)`; `setPendingSyncDbml(null)`. (둘 다 같은 핸들러 → React 배치 → 다음 렌더에 함께 반영. autosave가 dbml_text·layout 영속화.)

## 보존/무영향
autosave(dbml_text+layout PATCH), 가져오기(홈 DbImportButton — 무관), Export/Import SQL/테이블정의서/선택 동기화/캔버스 — 모두 그대로. 백엔드 무변경.

## 엣지케이스 (v1 동작)
- 리네임 = 삭제+신규(옛 위치 잃음, 빈공간 배치). 리네임 감지 범위 밖.
- 전체 교체 → 살아남은 테이블도 그룹/색/노트 잃음(경고).
- 레이아웃 없던 프로젝트 → 전부 신규 → reconcile dagre 폴백(`{}` 반환).
- 접속정보 transient(매번 재입력). introspect 실패는 DbConnectDialog 내 표시.

## 테스트
- `placeNewTables.test.ts`(핵심): 신규 추가→bbox 아래 배치·기존 불변; 삭제→pruned; 빈 current→{}; 필드만 변경→위치 불변; 신규 y > 기존 maxY.
- ErdTopBar: Sync 버튼 렌더 + onSync 호출.
- 에디터 페이지: 확인 후 setDbmlText + setPositions(신규 위치 포함) 적용; 취소 시 미적용.
- E2E(선택, portable): 스택 자체 Postgres로 sync → ERD 갱신.

## 범위 밖 (YAGNI)
구조 머지/주석 보존, 리네임 감지, 컬럼 단위 위치, 양방향, 접속정보 저장, 내부 gap-packing.
