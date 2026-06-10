# ERD 관리 화면 리디자인 (Backstage 시안 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** 에디터 화면(`pages/editor`)을 핸드오프 `frontend/design_handoff_erd_manager/`의 Backstage 시안 1 사양(다크 기본 + 라이트, 고정 3분할, teal accent, 선택↔에디터 동기화)으로 픽셀 정밀 리스킨한다.

**Source of truth:** `frontend/design_handoff_erd_manager/README.md`(토큰·간격·인터랙션 픽셀 스펙) + `reference/`(실행 프로토타입: erd.css·erd-canvas.jsx·erd-parts.jsx·erd-screen.jsx). 레퍼런스는 **그대로 복사 금지** — 이 레포 스택(React 19·Tailwind v4·shadcn·React Flow·CodeMirror·lucide)으로 재구현.

**확정 결정:**
- 테마: **앱 전역 다크 기본**. 레포의 `.dark` 클래스 메커니즘 사용(Tailwind/shadcn 통합) + localStorage `erd-theme`(기본 dark). 토글은 **에디터 상단바**에 둠(스펙). 홈/로그인은 기존 shadcn `.dark` 토큰으로 렌더(별도 작업 없음).
- 레이아웃: **고정 3분할** `340px / 1fr / 316px` + 56px 상단바. 기존 react-resizable-panels split + 플로팅 Info 패널을 대체.
- 관계선: **crow-foot 유지**(스펙이 "acceptable upgrade"로 허용) + orthogonal 라우팅 + 선택 시 accent·굵기 2.
- 강조색: teal `#0E9384` → `--erd-accent` (ERD 화면 한정, 앱 전역 `--primary`는 미변경).
- 폰트: `@fontsource-variable/pretendard` 추가(기존 inter 패턴과 동일), Inter fallback.

**보존(기존 핸들러에 연결):** autosave→Save pill, Export 드롭다운, Import SQL, 레이아웃 영속화(드래그), 풀스크린, Auto-arrange, 테이블 정의서 뷰, Back. 홈의 **DB 가져오기**는 영향 없음.

---

## Design Tokens (index.css에 추가)

핸드오프 README "Design Tokens" 표의 `--erd-*` 값을 그대로 추가한다. `:root`(light) + `.dark`(dark) 두 벌. accent: `--erd-accent: #0E9384`; `--erd-accent-soft: color-mix(in srgb, #0E9384 15%, transparent)`; `--erd-accent-text`(light=teal, dark=`color-mix(#0E9384 55%, white)`). 그룹색 5종(common `#6938EF`{ }, account `#1570EF`◍, customer `#0E9384`▦, release `#DC6803`</>, resource `#B42318`🗄)은 `entities/erd` 또는 색상 유틸에 상수로.

**그룹색 도출:** 현재 스키마엔 명시적 group→color 매핑이 없다. DBML `TableGroup [color: #hex]`가 있으면 그 색을, 없으면 그룹 인덱스로 5색 팔레트를 순환 배정(결정적). glyph는 색과 동일 규칙으로 배정하거나 기본 `▦`. (그룹이 없는 테이블은 중립색.)

---

## Phase 1 — 토큰 · 폰트 · 테마 토글

**Files:** `frontend/src/index.css`(수정: `--erd-*` 토큰 + Pretendard import + dark 기본), `frontend/package.json`(+`@fontsource-variable/pretendard`), `frontend/src/shared/lib/theme/useTheme.ts`(신규), `frontend/src/shared/ui/ThemeToggle.tsx`(신규) + 각 `.test.tsx`.

- [ ] `@fontsource-variable/pretendard` 설치(컨테이너 재빌드 필요: `docker compose -p codegram up -d --build --renew-anon-volumes frontend`), `index.css`에서 `--font-sans`를 Pretendard 우선으로.
- [ ] `index.css`에 핸드오프 `--erd-*` 토큰 2벌 추가(`:root`/`.dark`), accent/그룹색 포함.
- [ ] `useTheme()` 훅: `'dark'|'light'` 상태, `<html>`에 `.dark` 클래스 토글, localStorage `erd-theme` 영속, 기본 dark. 앱 부팅 시 적용(`app/` 진입점 또는 index.html 인라인 스크립트로 FOUC 방지). **TDD:** 저장/복원/토글 테스트.
- [ ] `ThemeToggle`: lucide Sun/Moon 아이콘 버튼, `aria-label="테마 전환"`, dark일 때 Sun(→light), light일 때 Moon(→dark). **TDD:** 클릭 시 테마 전환 + 아이콘 스왑.
- [ ] **Verify:** `npm run test:run` green; 앱 부팅 시 다크 기본.

## Phase 2 — 3분할 레이아웃 + TopBar

**Files:** `frontend/src/pages/editor/index.tsx`(수정), `frontend/src/widgets/erd-topbar/`(신규: TopBar) + test.

- [ ] `EditorPage`의 `<header>` + PanelGroup split을 **TopBar(56px) + 3분할 CSS grid(340/1fr/316)**로 교체. 좌=DbmlEditor, 중=ErdCanvas, 우=(Phase 3) 패널.
- [ ] TopBar: 로고(26×26, `design_handoff_erd_manager/reference/assets/logomark.svg`를 `frontend/src/shared/assets/`로 복사해 사용 — 제품 로고 placeholder), 타이틀=`project.name`, 서브타이틀=파싱된 DBML `Project` 블록명·`public`(없으면 생략), `DBML` 배지, Save pill(autosave status→"저장됨"+녹점/Saving…/Save failed), **ThemeToggle**, Info/Import SQL/Export/Back 버튼(기존 핸들러 연결). secondary/ghost 버튼 스타일은 README Buttons 스펙.
- [ ] `--erd-*` 토큰으로 상단바·패널 배경/보더 스타일.
- [ ] **Verify:** 타입체크/빌드 통과; 기존 Export/Import/Back/Info 동작 유지; 화면이 3분할로 렌더.

## Phase 3 — 우측 정보 패널 (Schema summary + Table names)

**Files:** `frontend/src/features/dbml-editor/ui/SchemaSummary.tsx`(재작성: stat 그리드) 또는 신규 `widgets/schema-summary`, `frontend/src/widgets/table-list/`(신규) + tests.

- [ ] Schema summary: 2열 stat 그리드(Tables/Refs/Table groups/Enums/Notes/Dialect). 값은 파싱된 `DbmlSchema`에서 도출(tables.length, refs.length, tableGroups.length, enums.length, notes.length, Project.database_type). 스타일 README §Info panel.
- [ ] Table names: 그룹별 묶음 리스트(섹션 라벨=그룹 glyph+라벨, 행=glyph+테이블명(mono)+필드수). hover/selected(`--erd-accent-soft`) 상태. 클릭 시 `onSelect(tableName)`(Phase 5에서 배선). **TDD:** 스키마→그룹별 렌더, 클릭 콜백.
- [ ] 기존 플로팅 Info 패널(ParseErrorPanel+옛 SchemaSummary) 제거(파싱 에러 표시는 TopBar의 Valid/Invalid 배지로 대체 — DBML 에디터 헤더의 Valid 배지).
- [ ] **Verify:** 테스트 green; 우측 패널이 스키마 통계+테이블 인덱스를 표시.

## Phase 4 — 캔버스 restyle (node · edge · group)

**Files:** `frontend/src/features/erd-canvas/ui/TableNode.tsx`, `RelationEdge.tsx`, `GroupNode.tsx`(수정), `frontend/src/features/erd-canvas/ui/ErdCanvas.tsx`(줌 컨트롤/배경/Auto-arrange 위치 스타일), `entities/erd` 색상/glyph 유틸(신규) + tests 갱신.

- [ ] TableNode: width 240, header 40px(그룹색 3px 좌측바 + glyph + 테이블명 mono 13px + 필드수 "Nf"), 행 28px, PK/FK 배지(README 색), 타입(괄호 제거), 플래그(`•`=NN, `U`=UQ), hover/selected 링(`0 0 0 3px --erd-accent-soft`), 선택 시 연결 필드 행 배경 `--erd-accent-soft`. `--erd-node*` 토큰 사용. 기존 data-testid(`column-*`,`marker-*`) 유지.
- [ ] RelationEdge: `--erd-edge` 스트로크 1.5, **active(선택 테이블 연결)** 시 `--erd-accent`·2. crow-foot 유지하되 색을 토큰화. (orthogonal=기존 smoothstep 유지.)
- [ ] GroupNode: dashed 보더(`color-mix(group 50%)`), fill `color-mix(group 7%)`, radius 16, 상단 그룹 태그(glyph+라벨, 그룹색).
- [ ] ErdCanvas: 배경 dot/line 그리드(24/120px 토큰색), 줌 컨트롤 바(좌하단, +/−/NN%/fit) README §Zoom control 스타일, Auto-arrange 버튼(우상단) 스타일. 기존 fitView/풀스크린/캡처 핸들 보존.
- [ ] **Verify:** 기존 ErdCanvas/TableNode/RelationEdge 테스트 갱신 후 green; 다이어그램이 스펙대로 렌더(스크린샷 비교).

## Phase 5 — 선택 동기화 (노드/리스트 ↔ 에디터)

**Files:** `frontend/src/pages/editor/index.tsx`(selected 상태 lift), `ErdCanvas.tsx`(onSelectNode), `widgets/table-list`(onSelect), `frontend/src/features/dbml-editor/`(활성 블록 데코레이션+스크롤), `tableLineRange` 유틸(신규, `entities/dbml` 또는 editor lib).

- [ ] `EditorPage`에 `selected: string | null` 상태. ErdCanvas 노드 클릭 → `onSelectNode(tableName)`; 배경 클릭 → 해제. Table names 행 클릭 → 동일.
- [ ] selected → 해당 노드 selected 스타일, 연결 엣지 active, 연결 필드 하이라이트(Phase 4 스타일을 selected로 구동).
- [ ] DbmlEditor: `selected`가 가리키는 `Table <name> {`~`}` 줄 범위를 CodeMirror **line decoration**(`--erd-accent-soft` 배경 + 3px inset 좌측 accent 바)으로 표시하고, 그 블록 첫 줄이 상단 ~10px에 오도록 `view.dispatch({effects: EditorView.scrollIntoView(pos, {y:'start', yMargin:10})})`. `tableLineRange(docText, name)`로 범위 계산. **TDD:** tableLineRange 단위테스트(블록 시작/끝 인덱스), 데코레이션 적용 테스트(가능 범위).
- [ ] **Verify:** 노드 클릭/리스트 클릭 시 에디터가 해당 블록으로 스크롤+하이라이트; 배경 클릭 해제. E2E(아래) 통과.

## Phase 6 — 폴리시 + 검증

- [ ] 트랜지션 80ms(색/배경/보더/그림자), 포커스 링 `0 0 0 3px --erd-accent-soft`, 아이콘 lucide 2px stroke 매핑(Info/Upload/Download/ArrowLeft/Sun/Moon/Grid/Plus/Minus/Maximize 등).
- [ ] 라이트 테마 검증(토큰 라이트 값), 다크 검증 — 양 테마 스크린샷을 핸드오프 `screenshots/01-dark.png`·`02-light.png`와 대조.
- [ ] **E2E** `frontend/e2e/erd-redesign.spec.ts`: 다크 기본 확인 → 테마 토글 → 노드/리스트 선택 시 에디터 스크롤·하이라이트 → 기존 export/back 동작. (기존 editor E2E가 셀렉터 변경으로 깨지면 갱신.)
- [ ] **Verify:** 전체 `npm run test:run` + 백엔드 회귀 + 시각 대조 통과.

---

## 주의
- 기존 테스트(특히 `pages/editor`, `erd-canvas`, `dbml-editor` 관련 *.test.tsx와 e2e/editor-*.spec.ts)는 레이아웃/셀렉터 변경으로 깨질 수 있다 — 각 Phase에서 해당 테스트를 함께 갱신(삭제가 아니라 새 구조에 맞게 수정)할 것.
- 단계마다 `docker compose -p codegram exec -T frontend npm run test:run` green + 타입체크 통과 확인.
- 픽셀 값/색/간격은 추측하지 말고 README 표와 `reference/erd.css`에서 확인해 사용.
