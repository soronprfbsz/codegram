# 프로젝트 글리프 배지 (Per-Project Glyph Badge) — 설계

날짜: 2026-06-19
상태: 승인됨 (구현 대기)

## 목표

각 프로젝트에 고유한 **글리프 배지**(이모지 또는 1~2자 텍스트 + 배경 색상)를
설정할 수 있게 한다. 대시보드 프로젝트 목록과 사이드바에서 프로젝트를 한눈에
구분하기 위함이다.

핵심 결정(브레인스토밍 결과):

1. 글리프는 고정 아이콘 세트가 아니라 **이모지 또는 짧은 텍스트 문자열**.
   (아이콘 세트는 표현이 제한적이라 폐기)
2. 편집 UI는 **배지 클릭 → 팝오버**.
3. 저장은 Project 모델의 **전용 컬럼**(`glyph`, `color`) + Alembic 마이그레이션 1개.
4. 표시는 대시보드 `ProjectList` + 사이드바 `AppSidebar` 양쪽, **편집은 대시보드에서만**.
5. 팝오버 내용: 색상 스와치 + 빠른 이모지 팔레트 + 직접 입력.

## 데이터 모델

`glyph`/`color`를 **의미 키/문자열 그대로** 저장한다. 렌더링 로직과 분리되어
나중에 스타일을 바꿔도 DB는 그대로다.

- `Project.glyph: str | None` — 이모지 또는 1~2자 텍스트를 문자열 그대로 저장.
  예: `"🗄️"`, `"📊"`, `"v2"`, `"DB"`.
  - 백엔드 `max_length = 8`. (글자 수가 아니라 길이로 제한 — ZWJ·플래그 이모지가
    여러 코드포인트로 구성되기 때문. 예: `"🗄️"` 는 2 코드포인트.)
- `Project.color: str | None` — 팔레트 키. 예: `"blue"`, `"teal"`.
- 두 컬럼 모두 **nullable, default NULL**.
  - 기존 프로젝트와 미설정 신규 프로젝트는 `glyph=null, color=null` → **현재와
    동일한 기본 모양**(Lucide `Database` 아이콘 + `secondary` 배경)으로 렌더.
  - 따라서 기존 데이터 백필 마이그레이션은 **불필요**.
- "글리프 지우기(=다시 null로)"는 요구사항이 아니므로 **지원하지 않는다**.
  팝오버는 항상 구체적인 값을 설정한다. → 백엔드 PATCH의 `None = 변경 안 함`
  (skip) 패턴과 충돌하지 않는다.

## 팔레트 상수 (프론트엔드)

`frontend/src/entities/project/model/glyph.ts` 한 곳에서 정의:

- **색상 6종** — 기존 `--erd-group-*` CSS 토큰을 재사용한다:
  | key      | 토큰/값                         |
  | -------- | ------------------------------- |
  | `blue`   | `--erd-group-account`  #1570EF  |
  | `purple` | `--erd-group-common`   #6938EF  |
  | `teal`   | `--erd-group-customer` #0E9384  |
  | `orange` | `--erd-group-release`  #DC6803  |
  | `red`    | `--erd-group-resource` #B42318  |
  | `slate`  | 중립 회색 (기본값)              |

  - `PROJECT_COLORS: Record<ColorKey, string>` (key → CSS 색상값) 맵.
  - 알 수 없는 키/`null` → `slate` 폴백.
- **빠른 이모지 팔레트 ~24개** — DB/프로젝트 친화 이모지 문자열 배열.
  예: 🗄️ 📊 📈 🛒 👥 🔑 ☁️ 📦 🏷️ 🧩 🌐 ⚙️ 🚀 📝 🧮 🗂️ 🔒 💾 🧱 🪣 🎯 📁 🧪 🔧
  (최종 목록은 구현 시 확정; 단순 `string[]`)
- 글리프는 문자열이므로 **아이콘 컴포넌트 맵/리졸버는 없다.**

## 컴포넌트 구조 (FSD: widgets → features → entities → shared)

1. **`entities/project/ui/ProjectGlyph.tsx`** — 순수 표시 배지.
   - props: `{ glyph?: string | null; color?: string | null; size?: number; className? }`
   - 색상 칩(배경 = 색상 키 → 값 폴백) 안에 글리프 문자열을 중앙 정렬해 렌더.
   - `glyph`가 비어 있으면 Lucide `Database` 아이콘 폴백(= 현재 기본 모양).
   - 내부 상태/뮤테이션 없음. ProjectList(feature)와 AppSidebar(widget) 양쪽에서
     재사용 (widget → entity import 는 FSD상 합법).
2. **`shared/ui/popover.tsx`** — radix-ui `Popover` 프리미티브 신규 추가.
   - 기존 `shared/ui/dialog.tsx`, `shared/ui/dropdown-menu.tsx` 와 동일한 래핑 패턴.
   - 의존성: 이미 설치된 `radix-ui ^1.4.3` (새 패키지 추가 없음).
3. **`features/project-list/ui/ProjectGlyphPicker.tsx`** — 편집 가능한 배지.
   - 트리거: `ProjectGlyph` 배지를 감싼 버튼.
   - 팝오버 내용(위→아래):
     1. 색상 스와치 행 (6색, 현재 선택 표시).
     2. 빠른 이모지 팔레트 그리드.
     3. 직접 입력 필드 (이모지/1~2자, `maxLength` 적용).
   - 색상 클릭 / 이모지 클릭 / 입력 확정 시 `useUpdateProject(project.id)` 의
     `mutateAsync({ glyph?, color? })` 호출. 색상과 글리프는 독립적으로 변경 가능.

## 렌더 지점 연결

- **`features/project-list/ui/ProjectList.tsx`** (현재 ~60행)
  - 하드코딩된 `<span class="...grid size-8..."><Database size={16}/></span>`
    → `<ProjectGlyphPicker project={project} />` 로 교체 (클릭 시 팝오버, 편집 가능).
  - 빈 상태(empty state)의 큰 `Database` 아이콘은 프로젝트별 글리프가 아니므로 그대로 둔다.
- **`widgets/app-sidebar/ui/AppSidebar.tsx`** (현재 ~119행)
  - `<Database size={16} className="shrink-0 opacity-70" />`
    → `<ProjectGlyph glyph={p.glyph} color={p.color} size={16} />` 로 교체 (표시만).
  - 사이드바 행은 네비게이션 링크이므로 **편집 트리거를 넣지 않는다.**

## 백엔드 변경 (route → service → repository → model + 스키마 + 마이그레이션)

기존 4계층 + Pydantic 스키마 구조를 그대로 따른다. PATCH 엔드포인트는 이미
부분 업데이트(`None = skip`)를 지원하므로 라우트 시그니처 변화는 최소.

1. **`models/project.py`** — 컬럼 2개 추가:
   - `glyph: Mapped[str | None] = mapped_column(String(8), nullable=True, default=None)`
   - `color: Mapped[str | None] = mapped_column(String(16), nullable=True, default=None)`
2. **`schemas/project.py`**:
   - `ProjectUpdate`: `glyph: str | None = Field(default=None, max_length=8)`,
     `color: str | None = Field(default=None, max_length=16)` 추가.
   - `ProjectRead`: `glyph: str | None`, `color: str | None` 추가.
   - `ProjectCreate`: **변경하지 않음** (생성 시점엔 글리프 미설정 — 범위 외).
3. **`services/project.py`** `update_project` + **`repositories/project.py`** `update`:
   - `glyph`/`color` 파라미터 추가, 기존 `if x is not None: project.x = x` (None-skip) 패턴 동일.
4. **`app/api/routes/projects.py`** `update_project`:
   - `service.update_project(..., glyph=payload.glyph, color=payload.color)` 로 전달.
5. **Alembic 마이그레이션 1개**:
   - `project` 테이블에 nullable `glyph`(String 8), `color`(String 16) 컬럼 추가.
   - 데이터 백필 없음 (기존 행은 NULL → 기본 모양으로 렌더).

> 참고: 이전 "고정 아이콘 세트" 안에서 고려했던 별도 테이블 변경은 발생하지
> 않는다. 본 설계의 유일한 스키마 변경은 위 마이그레이션 1개다.

## 프론트엔드 타입

`frontend/src/entities/project/model/types.ts`:

- `Project`: `glyph: string | null`, `color: string | null` 추가.
- `ProjectUpdatePayload`: `glyph?: string`, `color?: string` 추가.
- `ProjectCreatePayload`: 변경 없음.

## 테스트

- **백엔드** (기존 route/service 테스트 패턴 확장):
  - PATCH `/projects/{id}` 에 `glyph`/`color` 전송 → 저장되고 `ProjectRead` 에 반영.
  - 글리프만 / 색상만 부분 업데이트 시 다른 필드 보존(None-skip).
  - 다른 유저의 프로젝트 접근 시 기존 404 격리 유지.
  - `max_length` 초과 글리프 → 422.
- **프론트엔드 (vitest)**:
  - `ProjectGlyph`: glyph/color 지정 시 해당 글리프·색상 렌더; 빈 값이면 Database 폴백.
  - `ProjectGlyphPicker`: 색상 클릭 → `mutateAsync({ color })`,
    이모지 클릭 → `mutateAsync({ glyph })`, 직접 입력 확정 → `mutateAsync({ glyph })`.

## 비범위 (Out of Scope)

- 글리프 NULL 로 되돌리기(지우기) 기능.
- 사이드바에서의 글리프 편집.
- 생성 시점의 글리프 선택(나중에 대시보드에서 설정).
- 커스텀 색상(자유 hex) — 6색 팔레트로 한정.
- 전체 이모지 피커 라이브러리.
