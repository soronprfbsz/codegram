# Frontend rules — Codegram

이 문서는 Codegram 프론트엔드 작업의 **단일 규칙 출처**다. 프론트엔드 코드를 만질 때(서브에이전트로 위임하는 경우 포함) 이 파일을 읽고 따른다. **공통 규칙은 `.claude/rules/general.md`와 함께 적용**한다(외과적 변경·검증·사전이슈 구분·단일 출처). 도메인 언어는 `CONTEXT.md`, 아키텍처 결정은 `docs/adr/`.

위치: `frontend/` (React + Vite + TypeScript). 레이어드 = **Feature-Sliced**: `shared → entities → features → widgets → pages → app`.

---

## 절대 규칙 (반드시 지킬 것)

### F1. UI는 공용 디자인 토큰·최소 단위 컴포넌트로만 표현한다 (호출부 개별 스타일 금지)
같은 역할의 UI(버튼·입력·배지·토글·드롭다운 트리거·패널 헤더 등)는 **하나의 공용 토큰 또는 하나의 최소 단위 컴포넌트**에서만 모양(높이·테두리·radius·표면색·글자색·폰트 크기·아이콘 크기·간격)을 받는다.
- 같은 모양을 **호출부마다 인라인 스타일/매직 넘버로 재구현하지 않는다.** 디자인은 한 곳에서 정의하고 사용처는 소비만 한다.
- 같은 부류의 공용 단위가 있으면 그것을 쓰고, 없으면 **먼저 `shared/ui`(또는 해당 계층의 적절한 공용 위치)에 최소 단위를 만든 뒤** 사용한다.
- 색·간격·radius 등 토큰 값은 CSS 변수(`--erd-*`)와 공용 스타일 상수로 표현한다. 매직 넘버를 호출부에 흩지 않는다.
- 리뷰/리팩터에서 "호출부가 같은 모양을 다시 구현"한 코드는 결함으로 보고 공용 단위로 회수한다.
- 왜: 호출부 인라인 스타일은 같은 요소가 화면마다 미묘하게 표류하고(폰트·아이콘·색·radius), 수정 시 누락이 생긴다. 실제로 탑바 컨트롤이 제각각(아이콘 13/14/15/16px, 폰트 12/12.5/13px, 색 `--erd-text`/`--erd-text-2`, radius 6/8px)이 되어 이 규칙을 세웠다.
- 예: 탑바 → `src/shared/ui/topbar-control.tsx`(`topbarFrameStyle`/`TopbarIconButton`/`TopbarButton`/`TOPBAR_ICON_SIZE`).

### F2. 디자인 토큰 출처
- ERD 화면 표면은 `--erd-*` CSS 변수(라이트/다크 모두 `index.css`에 정의)를 쓴다. 임의 hex/색을 박지 않는다.
- 범용 컨트롤은 shadcn `Button`(`src/shared/ui/button.tsx`, Tailwind/cva), ERD 특화 표면은 `--erd-*` 인라인 토큰 + `.erd-*` 클래스를 쓴다. 둘을 섞어 새 변형을 호출부에서 만들지 않는다.

### F3. Feature-Sliced 레이어 경계
- import 방향은 아래에서 위로만: `shared ← entities ← features ← widgets ← pages ← app`. 위 계층을 아래에서 import 금지.
- **widget은 다른 widget을 import하지 않는다.** 공유가 필요하면 `shared`(또는 `entities`)로 내린다. (예: 탑바 컨트롤·테이블 검색이 `shared/ui`로 내려간 이유.)
- 페이지(`pages`)가 위젯·피처를 조립한다. 슬롯(ReactNode prop) 패턴으로 표현 위젯에 주입한다(예: `ErdTopBar`의 `searchBox`/`infoButton`/`importMenu`).

### F4. 사용자 노출 문자열은 i18n으로만 (하드코딩 금지)
화면에 보이는 모든 텍스트(라벨·버튼·플레이스홀더·`title`/`aria-label`·다이얼로그 제목/설명·토스트·검증/에러 메시지·툴팁 등)는 **react-i18next의 `t('key')`로만** 출력한다. JSX/속성에 한글·영문 문자열을 직접 박지 않는다.
- 키와 번역은 `src/shared/i18n/locales/{ko,en}.json` **단일 출처**에 영역별로 둔다(F1·G1과 같은 정신). 컴포넌트는 `useTranslation()`의 `t`로 소비만 한다. 새 문자열은 **먼저 ko/en 양쪽에 키를 추가한 뒤** 사용한다(둘 중 하나라도 누락 금지).
- 변수는 보간(`t('k', { name })`), 복수는 `_one`/`_other`, 목록(요일 등)은 `returnObjects`로 표현한다. `data-testid`처럼 언어와 무관해야 하는 식별자는 번역에서 분리해 고정한다(라벨로 testid를 파생하지 않는다).
- 예외(번역 대상 아님): 코드 식별자·`data-testid`·CSS 클래스·로그/주석·DBML 등 도메인 텍스트.
- 리뷰/리팩터에서 "호출부에 하드코딩된 사용자 문자열"은 결함으로 보고 키로 회수한다.
- 왜: 한/영(이상) 지원과 문구 일괄 수정을 위해 문자열을 한곳에서 관리한다. 하드코딩이 섞이면 언어 전환 시 누락·표류가 생긴다.

### F5. 색·크기·간격은 디자인 토큰으로만 (raw 하드코딩 금지)
색상·폰트 크기 등 시각 스타일은 **디자인 토큰(정의된 클래스/CSS 변수)으로만** 표현한다. raw 값(팔레트 클래스·hex·rgb·px 숫자)을 호출부에 박지 않는다. **기존 토큰으로 표현 불가하면 먼저 토큰을 신규 추가한 뒤** 그 토큰으로 구현한다 — 절대 raw로 우회하지 않는다(ADR-0020).
- **색**: 범용은 shadcn 시맨틱 토큰 클래스(`text-muted-foreground`·`text-destructive`·`text-success`·`text-warning`·`bg-primary` 등), ERD 표면은 `--erd-*` 변수. **금지**: `text-red-600`·`bg-gray-100` 같은 Tailwind 팔레트 클래스, 인라인 `#hex`/`rgb()`, `text-[#...]`.
- **폰트 크기**: 일반 UI는 Tailwind named step(`text-2xs`~`text-3xl` — 전부 토큰), ERD 캔버스 인라인은 `var(--erd-fs-*)`. **금지**: 인라인 `fontSize: 13`(숫자), `text-[13px]`. 필요하면 `text-[length:var(--erd-fs-*)]` 또는 `style={{ fontSize: 'var(--erd-fs-*)' }}`.
- **예외(토큰화 대상 아님)**: 도메인 데이터 색(프로젝트 글리프 팔레트·그룹 색 프리셋), 코드/설정(Monaco 신택스 테마), 캔버스 export 배경, DBML `headercolor` 예시. 이는 스타일 표류가 아니라 값 자체가 데이터/설정이다.
- 리뷰/리팩터에서 "호출부 raw 색·크기"는 결함으로 보고 토큰으로 회수한다. 신규 토큰은 `src/index.css`(라이트/다크 양쪽) 단일 출처에 정의한다.
- 왜: 페이지마다 raw 값을 박으면 같은 역할의 UI가 화면마다 미묘하게 표류하고, 테마/브랜드 일괄 변경이 불가능해진다(F1·F2와 같은 정신).

---

## 검증 (작업 종료 전 필수) — 공통 절차는 general.md G3/G4
- 타입: `cd frontend && npm run type-check` (= `tsc --noEmit`) — 통과해야 함.
- 단위: `cd frontend && npm run test:run` (vitest). 변경한 컴포넌트/페이지의 테스트를 갱신·추가한다.
- E2E(Playwright, 실 브라우저): 도커 스택이 떠 있을 때 **호스트에서** `cd frontend && VITE_PROXY_TARGET=http://localhost:4000 npx playwright test <spec> --project=chromium --reporter=line`. (커밋된 config의 baseURL은 :5173이고 dev proxy는 :8000 기본이라 `VITE_PROXY_TARGET`로 도커 백엔드 :4000을 가리켜야 한다.)
- 추측하지 말고 **실 브라우저로 확인**한다: 시각/포인터/z-index/커서 같은 문제는 Playwright 프로브(`getBoundingClientRect`/`elementFromPoint`/스크린샷)로 측정해 원인을 확정한 뒤 고친다.

## 알아둘 함정 (이 프로젝트 특유)
- 우측 정보/버전 기록 패널은 **기본 hidden**(`activePanel: 'info'|'history'|null`, 기본 `null`). 탑바 정보/버전기록 버튼 토글, 상호배타. E2E에서 패널 내부(`tablelist-row-*`, `selection-section` 등)를 검증하려면 **먼저 정보 버튼(`info-panel-button`)으로 패널을 연다**.
- 캔버스(React Flow): 노드 HTML은 SVG 엣지·EdgeLabelRenderer보다 위에 그려진다. 선택 엣지의 버튼이 카드에 가리면 `.react-flow__edgelabel-renderer { z-index: 1 }`로 올린다(단 1000+는 RF 내부 드래그/커넥션 레이어와 충돌 → 세그먼트 드래그 깨짐). 좌클릭 패닝은 끔(`panOnDrag={[1]}`), pane/그룹 본체 커서는 `default`.
- 테이블 그룹 박스 본체 클릭은 캔버스 클릭처럼 선택 해제(`onNodeClick`의 group 분기 → `onSelect(null)`).
