# 프로젝트 글리프 배지 (Per-Project Glyph Badge) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 각 프로젝트에 이모지/짧은 텍스트 글리프 + 배경 색상 배지를 설정하고, 대시보드 목록과 사이드바에 표시한다.

**Architecture:** 백엔드 `project` 테이블에 nullable `glyph`/`color` 컬럼을 추가하고 기존 PATCH 엔드포인트(None-skip 부분 업데이트)로 저장한다. 프론트는 글리프 문자열을 그대로 렌더하는 순수 표시 컴포넌트(`ProjectGlyph`)와, 배지 클릭 시 열리는 팝오버 편집기(`ProjectGlyphPicker`)로 구성한다. 표시는 대시보드 + 사이드바 양쪽, 편집은 대시보드에서만.

**Tech Stack:** FastAPI + SQLAlchemy(async) + Alembic + Pydantic v2 (backend), React + TanStack Query + radix-ui + Tailwind v4 + vitest (frontend).

## Global Constraints

- FSD 레이어 규칙 준수: widgets → features → entities → shared (상위로 import 금지). `ProjectGlyph`는 entities에 두어 features/widgets 양쪽에서 재사용.
- 새 npm/pip 의존성 추가 금지. 팝오버는 이미 설치된 `radix-ui ^1.4.3` 사용.
- `glyph` 최대 길이 **8** (글자 수 아님 — ZWJ/플래그 이모지가 여러 코드포인트). `color` 최대 길이 **16**.
- 백엔드 부분 업데이트는 `if x is not None: project.x = x` (None-skip) 패턴 유지. "글리프 지우기(null로 되돌림)"는 비범위.
- 기존 데이터 백필 없음: 미설정 프로젝트는 `glyph=null, color=null` → Lucide `Database` 폴백 배지로 렌더.
- 색상 팔레트 6종(키→값): `blue` #1570EF, `purple` #6938EF, `teal` #0E9384, `orange` #DC6803, `red` #B42318, `slate` #475467.
- 테스트 실행: 백엔드 `docker compose exec -T backend pytest`, 프론트 `docker compose exec -T frontend npm run test:run`.

## File Structure

- `backend/app/models/project.py` (수정) — `glyph`, `color` 컬럼.
- `backend/app/schemas/project.py` (수정) — `ProjectUpdate`/`ProjectRead`에 필드 추가.
- `backend/app/services/project.py` (수정) — `update_project`에 파라미터 추가.
- `backend/app/repositories/project.py` (수정) — `update`에 파라미터 추가.
- `backend/app/api/routes/projects.py` (수정) — PATCH에서 전달.
- `backend/tests/test_projects.py` (수정) — e2e PATCH 테스트.
- `backend/alembic/versions/<new>_add_project_glyph_color.py` (생성) — 마이그레이션.
- `frontend/src/entities/project/model/types.ts` (수정) — 타입.
- `frontend/src/entities/project/model/glyph.ts` (생성) — 팔레트 상수 + resolver.
- `frontend/src/entities/project/model/glyph.test.ts` (생성) — resolver 단위 테스트.
- `frontend/src/entities/project/ui/ProjectGlyph.tsx` (생성) — 표시 배지.
- `frontend/src/entities/project/ui/ProjectGlyph.test.tsx` (생성) — 표시 테스트.
- `frontend/src/entities/project/index.ts` (수정) — `ProjectGlyph` export.
- `frontend/src/shared/ui/popover.tsx` (생성) — radix Popover 래퍼.
- `frontend/src/shared/ui/popover.test.tsx` (생성) — 팝오버 테스트.
- `frontend/src/features/project-list/ui/ProjectGlyphPicker.tsx` (생성) — 팝오버 편집기.
- `frontend/src/features/project-list/ui/ProjectGlyphPicker.test.tsx` (생성) — 편집기 테스트.
- `frontend/src/features/project-list/ui/ProjectList.tsx` (수정) — 배지 → 편집기.
- `frontend/src/widgets/app-sidebar/ui/AppSidebar.tsx` (수정) — 아이콘 → 표시 배지.

---

### Task 1: 백엔드 영속화 (모델·스키마·서비스·리포지토리·라우트 + e2e 테스트)

sqlite 테스트 DB는 모델에서 직접 스키마를 만들므로 마이그레이션(Task 2) 없이 이 태스크의 테스트가 통과한다.

**Files:**
- Modify: `backend/app/models/project.py`
- Modify: `backend/app/schemas/project.py`
- Modify: `backend/app/services/project.py`
- Modify: `backend/app/repositories/project.py`
- Modify: `backend/app/api/routes/projects.py`
- Test: `backend/tests/test_projects.py`

**Interfaces:**
- Produces:
  - ORM `Project.glyph: str | None`, `Project.color: str | None`.
  - `ProjectUpdate.glyph: str | None`, `ProjectUpdate.color: str | None`.
  - `ProjectRead.glyph: str | None`, `ProjectRead.color: str | None`.
  - `ProjectService.update_project(..., glyph: str | None = None, color: str | None = None)`.
  - `ProjectRepository.update(..., glyph: str | None = None, color: str | None = None)`.

- [ ] **Step 1: e2e 실패 테스트 작성**

`backend/tests/test_projects.py` 의 `# --- patch / autosave ---` 섹션 끝에 추가:

```python
async def test_create_defaults_glyph_and_color_null(
    authenticated_client: AsyncClient,
) -> None:
    response = await authenticated_client.post(
        "/api/projects", json={"name": "P"}
    )
    body = response.json()
    assert body["glyph"] is None
    assert body["color"] is None


async def test_patch_persists_glyph_and_color(
    authenticated_client: AsyncClient,
) -> None:
    created = await authenticated_client.post(
        "/api/projects", json={"name": "P1"}
    )
    pid = created.json()["id"]
    patched = await authenticated_client.patch(
        f"/api/projects/{pid}", json={"glyph": "🗄️", "color": "blue"}
    )
    assert patched.status_code == 200
    assert patched.json()["glyph"] == "🗄️"
    assert patched.json()["color"] == "blue"


async def test_patch_glyph_only_preserves_color(
    authenticated_client: AsyncClient,
) -> None:
    created = await authenticated_client.post(
        "/api/projects", json={"name": "P1"}
    )
    pid = created.json()["id"]
    await authenticated_client.patch(
        f"/api/projects/{pid}", json={"color": "teal"}
    )
    patched = await authenticated_client.patch(
        f"/api/projects/{pid}", json={"glyph": "📊"}
    )
    assert patched.json()["glyph"] == "📊"
    assert patched.json()["color"] == "teal"  # preserved


async def test_patch_rejects_too_long_glyph(
    authenticated_client: AsyncClient,
) -> None:
    created = await authenticated_client.post(
        "/api/projects", json={"name": "P1"}
    )
    pid = created.json()["id"]
    patched = await authenticated_client.patch(
        f"/api/projects/{pid}", json={"glyph": "123456789"}
    )
    assert patched.status_code == 422
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `docker compose exec -T backend pytest tests/test_projects.py -k "glyph or color" -v`
Expected: FAIL (`KeyError: 'glyph'` 또는 422가 아닌 200 — 아직 필드 없음).

- [ ] **Step 3: ORM 컬럼 추가**

`backend/app/models/project.py`: import 에 `String` 추가하고(`from sqlalchemy import DateTime, ForeignKey, String, func`), `dbml_text` 컬럼 정의 바로 아래에 추가:

```python
    glyph: Mapped[str | None] = mapped_column(
        String(8), nullable=True, default=None
    )
    color: Mapped[str | None] = mapped_column(
        String(16), nullable=True, default=None
    )
```

- [ ] **Step 4: 스키마 추가**

`backend/app/schemas/project.py` 의 `ProjectUpdate` 에 추가:

```python
    glyph: str | None = Field(default=None, max_length=8)
    color: str | None = Field(default=None, max_length=16)
```

`ProjectRead` 에 추가 (예: `dbml_text` 아래):

```python
    glyph: str | None
    color: str | None
```

- [ ] **Step 5: 리포지토리·서비스·라우트 전달**

`backend/app/repositories/project.py` `update` 시그니처에 파라미터 추가하고 본문에 None-skip 적용:

```python
    async def update(
        self,
        project: Project,
        name: str | None = None,
        dbml_text: str | None = None,
        layout: dict[str, Any] | None = None,
        glyph: str | None = None,
        color: str | None = None,
    ) -> Project:
        """Apply a partial update; only non-None fields are changed."""
        if name is not None:
            project.name = name
        if dbml_text is not None:
            project.dbml_text = dbml_text
        if layout is not None:
            project.layout = layout
        if glyph is not None:
            project.glyph = glyph
        if color is not None:
            project.color = color
        await self.session.flush()
        return project
```

`backend/app/services/project.py` `update_project` 시그니처에 `glyph`/`color` 추가하고 `repo.update(...)` 호출에 전달:

```python
    async def update_project(
        self,
        project_id: uuid.UUID,
        user_id: uuid.UUID,
        name: str | None = None,
        dbml_text: str | None = None,
        layout: dict[str, Any] | None = None,
        glyph: str | None = None,
        color: str | None = None,
    ) -> Project:
        """Partially update an owned project; raise NotFound otherwise."""
        project = await self.get_project(project_id, user_id)
        return await self.repo.update(
            project,
            name=name,
            dbml_text=dbml_text,
            layout=layout,
            glyph=glyph,
            color=color,
        )
```

`backend/app/api/routes/projects.py` `update_project` 의 `service.update_project(...)` 호출에 추가:

```python
        project = await service.update_project(
            project_id,
            user.id,
            name=payload.name,
            dbml_text=payload.dbml_text,
            layout=payload.layout,
            glyph=payload.glyph,
            color=payload.color,
        )
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `docker compose exec -T backend pytest tests/test_projects.py -v`
Expected: PASS (신규 4개 포함 전부).

- [ ] **Step 7: 커밋**

```bash
git add backend/app/models/project.py backend/app/schemas/project.py \
  backend/app/services/project.py backend/app/repositories/project.py \
  backend/app/api/routes/projects.py backend/tests/test_projects.py
git commit -m "feat(projects): persist glyph and color on project"
```

---

### Task 2: Alembic 마이그레이션

**Files:**
- Create: `backend/alembic/versions/<rev>_add_project_glyph_color.py` (autogenerate 가 파일명/리비전 생성)

**Interfaces:**
- Consumes: Task 1 의 ORM 컬럼.

- [ ] **Step 1: 마이그레이션 자동 생성**

Run:
```bash
docker compose exec -T backend alembic revision --autogenerate -m "add project glyph color"
```
Expected: `backend/alembic/versions/` 에 새 파일 생성. `down_revision = '4b3ea60ab673'` 인지 확인.

- [ ] **Step 2: 생성된 upgrade/downgrade 확인·정리**

생성 파일의 `upgrade()`/`downgrade()` 가 아래와 동등한지 확인하고, 무관한 변경(다른 테이블 diff)이 섞였으면 제거:

```python
def upgrade() -> None:
    op.add_column('project', sa.Column('glyph', sa.String(length=8), nullable=True))
    op.add_column('project', sa.Column('color', sa.String(length=16), nullable=True))


def downgrade() -> None:
    op.drop_column('project', 'color')
    op.drop_column('project', 'glyph')
```

- [ ] **Step 3: 마이그레이션 적용**

Run: `docker compose exec -T backend alembic upgrade head`
Expected: 에러 없이 완료.

- [ ] **Step 4: 라운드트립 확인**

Run: `docker compose exec -T backend alembic downgrade -1 && docker compose exec -T backend alembic upgrade head`
Expected: 양방향 모두 에러 없음.

- [ ] **Step 5: 커밋**

```bash
git add backend/alembic/versions/
git commit -m "feat(projects): migration for glyph and color columns"
```

---

### Task 3: 프론트 타입 + 글리프 상수 + resolver 테스트

**Files:**
- Modify: `frontend/src/entities/project/model/types.ts`
- Create: `frontend/src/entities/project/model/glyph.ts`
- Test: `frontend/src/entities/project/model/glyph.test.ts`

**Interfaces:**
- Produces:
  - `Project.glyph: string | null`, `Project.color: string | null`.
  - `ProjectUpdatePayload.glyph?: string`, `ProjectUpdatePayload.color?: string`.
  - `type ProjectColorKey`, `PROJECT_COLORS: Record<ProjectColorKey, string>`, `PROJECT_COLOR_KEYS: ProjectColorKey[]`, `PROJECT_GLYPH_PALETTE: string[]`, `GLYPH_MAX_LENGTH: number`, `resolveProjectColor(color: string | null | undefined): string`.

- [ ] **Step 1: 타입 수정**

`frontend/src/entities/project/model/types.ts` 의 `Project` 인터페이스에 추가 (`layout` 아래):

```typescript
  glyph: string | null
  color: string | null
```

`ProjectUpdatePayload` 에 추가:

```typescript
  glyph?: string
  color?: string
```

- [ ] **Step 2: resolver 실패 테스트 작성**

`frontend/src/entities/project/model/glyph.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { resolveProjectColor, PROJECT_COLORS } from './glyph'

describe('resolveProjectColor', () => {
  it('returns the mapped color for a known key', () => {
    expect(resolveProjectColor('blue')).toBe(PROJECT_COLORS.blue)
  })

  it('falls back to slate for null or unknown key', () => {
    expect(resolveProjectColor(null)).toBe(PROJECT_COLORS.slate)
    expect(resolveProjectColor('bogus')).toBe(PROJECT_COLORS.slate)
  })
})
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `docker compose exec -T frontend npm run test:run -- glyph.test.ts`
Expected: FAIL (`glyph.ts` 모듈 없음).

- [ ] **Step 4: 상수 모듈 작성**

`frontend/src/entities/project/model/glyph.ts`:

```typescript
/** Project glyph/color palette constants (entities layer: no upward imports). */

export type ProjectColorKey =
  | 'blue'
  | 'purple'
  | 'teal'
  | 'orange'
  | 'red'
  | 'slate'

/** Color key -> CSS color value (reuses the ERD categorical palette hexes). */
export const PROJECT_COLORS: Record<ProjectColorKey, string> = {
  blue: '#1570EF',
  purple: '#6938EF',
  teal: '#0E9384',
  orange: '#DC6803',
  red: '#B42318',
  slate: '#475467',
}

export const PROJECT_COLOR_KEYS = Object.keys(
  PROJECT_COLORS,
) as ProjectColorKey[]

export const DEFAULT_PROJECT_COLOR: ProjectColorKey = 'slate'

/** Resolve a stored color (key or null) to a CSS color, with slate fallback. */
export function resolveProjectColor(
  color: string | null | undefined,
): string {
  if (color && color in PROJECT_COLORS) {
    return PROJECT_COLORS[color as ProjectColorKey]
  }
  return PROJECT_COLORS[DEFAULT_PROJECT_COLOR]
}

/** Quick-pick emoji palette shown in the glyph picker. */
export const PROJECT_GLYPH_PALETTE: string[] = [
  '🗄️', '📊', '📈', '🛒', '👥', '🔑', '☁️', '📦',
  '🏷️', '🧩', '🌐', '⚙️', '🚀', '📝', '🧮', '🗂️',
  '🔒', '💾', '🧱', '🪣', '🎯', '📁', '🧪', '🔧',
]

/** Max stored glyph length (length, not grapheme count). Matches backend. */
export const GLYPH_MAX_LENGTH = 8
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `docker compose exec -T frontend npm run test:run -- glyph.test.ts`
Expected: PASS.

- [ ] **Step 6: 타입 체크**

Run: `docker compose exec -T frontend npx tsc -b --noEmit`
Expected: 에러 없음 (기존 코드가 `Project` 를 만드는 테스트가 있으면 다음 태스크들에서 같이 갱신됨 — 이 시점 에러가 나면 해당 테스트 목 객체에 `glyph: null, color: null` 추가).

> 참고: 기존 `useUpdateProject.test.tsx`, `useProjectList.test.tsx`, `useCreateProject.test.tsx` 의 목 `Project`/응답 객체에 `glyph`/`color` 가 없어 `tsc` 가 실패할 수 있다. 실패 시 각 목 객체에 `glyph: null, color: null` 을 추가한다.

- [ ] **Step 7: 커밋**

```bash
git add frontend/src/entities/project/model/types.ts \
  frontend/src/entities/project/model/glyph.ts \
  frontend/src/entities/project/model/glyph.test.ts
# tsc 에러로 목 객체를 고쳤다면 해당 테스트 파일도 add
git commit -m "feat(projects): add glyph/color types and palette constants"
```

---

### Task 4: ProjectGlyph 표시 컴포넌트

**Files:**
- Create: `frontend/src/entities/project/ui/ProjectGlyph.tsx`
- Test: `frontend/src/entities/project/ui/ProjectGlyph.test.tsx`
- Modify: `frontend/src/entities/project/index.ts`

**Interfaces:**
- Consumes: `resolveProjectColor` (Task 3).
- Produces: `ProjectGlyph` (props `{ glyph?: string | null; color?: string | null; size?: number; className?: string }`), entity barrel export.

- [ ] **Step 1: 실패 테스트 작성**

`frontend/src/entities/project/ui/ProjectGlyph.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProjectGlyph } from './ProjectGlyph'
import { PROJECT_COLORS } from '../model/glyph'

describe('ProjectGlyph', () => {
  it('renders the glyph string on a colored chip', () => {
    render(<ProjectGlyph glyph="🗄️" color="blue" />)
    const chip = screen.getByText('🗄️')
    expect(chip).toBeInTheDocument()
    expect(chip).toHaveStyle({ backgroundColor: PROJECT_COLORS.blue })
  })

  it('falls back to a Database icon when glyph is empty', () => {
    const { container } = render(<ProjectGlyph glyph={null} color={null} />)
    // lucide renders an <svg>; the fallback chip has no glyph text
    expect(container.querySelector('svg')).not.toBeNull()
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `docker compose exec -T frontend npm run test:run -- ProjectGlyph.test.tsx`
Expected: FAIL (모듈 없음).

- [ ] **Step 3: 컴포넌트 작성**

`frontend/src/entities/project/ui/ProjectGlyph.tsx`:

```tsx
import { Database } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { resolveProjectColor } from '../model/glyph'

/**
 * Pure display badge for a project's glyph. Renders the stored glyph string
 * (emoji or short text) centered on a colored chip; falls back to a neutral
 * Database chip when no glyph is set. No state, no mutations — safe to reuse
 * in both the dashboard (feature) and the sidebar (widget).
 */
export function ProjectGlyph({
  glyph,
  color,
  size = 32,
  className,
}: {
  glyph?: string | null
  color?: string | null
  size?: number
  className?: string
}) {
  const hasGlyph = !!glyph && glyph.trim().length > 0
  const inner = Math.round(size * 0.5)

  if (!hasGlyph) {
    return (
      <span
        className={cn(
          'grid shrink-0 place-items-center rounded-md bg-secondary text-muted-foreground',
          className,
        )}
        style={{ width: size, height: size }}
      >
        <Database size={inner} />
      </span>
    )
  }

  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center rounded-md leading-none text-white',
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: inner,
        backgroundColor: resolveProjectColor(color),
      }}
    >
      {glyph}
    </span>
  )
}
```

- [ ] **Step 4: barrel export 추가**

`frontend/src/entities/project/index.ts` 에 추가:

```typescript
export { ProjectGlyph } from './ui/ProjectGlyph'
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `docker compose exec -T frontend npm run test:run -- ProjectGlyph.test.tsx`
Expected: PASS.

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/entities/project/ui/ProjectGlyph.tsx \
  frontend/src/entities/project/ui/ProjectGlyph.test.tsx \
  frontend/src/entities/project/index.ts
git commit -m "feat(projects): add ProjectGlyph display badge"
```

---

### Task 5: shared/ui Popover 프리미티브

**Files:**
- Create: `frontend/src/shared/ui/popover.tsx`
- Test: `frontend/src/shared/ui/popover.test.tsx`

**Interfaces:**
- Produces: `Popover`, `PopoverTrigger`, `PopoverContent`.

- [ ] **Step 1: 실패 테스트 작성**

`frontend/src/shared/ui/popover.test.tsx` (radix 포털 + JSDOM 포인터 체크 회피 패턴은 기존 `dropdown-menu.test.tsx` 와 동일):

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event'
import { Popover, PopoverTrigger, PopoverContent } from './popover'

function Harness() {
  return (
    <Popover>
      <PopoverTrigger>Open</PopoverTrigger>
      <PopoverContent>
        <span>Panel</span>
      </PopoverContent>
    </Popover>
  )
}

const setup = () =>
  userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never })

describe('popover', () => {
  it('is closed by default', () => {
    render(<Harness />)
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument()
    expect(screen.queryByText('Panel')).toBeNull()
  })

  it('opens on trigger click', async () => {
    const user = setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Open' }))
    expect(screen.getByText('Panel')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `docker compose exec -T frontend npm run test:run -- popover.test.tsx`
Expected: FAIL (모듈 없음).

- [ ] **Step 3: 프리미티브 작성**

`frontend/src/shared/ui/popover.tsx` (기존 `dropdown-menu.tsx` 래핑 패턴 따름):

```tsx
import { Popover as PopoverPrimitive } from "radix-ui"
import * as React from "react"

import { cn } from "@/shared/lib/utils"

function Popover({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverContent({
  className,
  align = "start",
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 w-64 rounded-md border border-border bg-background p-3 text-foreground shadow-md outline-none",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

export { Popover, PopoverTrigger, PopoverContent }
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `docker compose exec -T frontend npm run test:run -- popover.test.tsx`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/shared/ui/popover.tsx frontend/src/shared/ui/popover.test.tsx
git commit -m "feat(ui): add Popover primitive"
```

---

### Task 6: ProjectGlyphPicker 팝오버 편집기

**Files:**
- Create: `frontend/src/features/project-list/ui/ProjectGlyphPicker.tsx`
- Test: `frontend/src/features/project-list/ui/ProjectGlyphPicker.test.tsx`

**Interfaces:**
- Consumes: `Popover/PopoverTrigger/PopoverContent` (Task 5), `ProjectGlyph` (Task 4), `useUpdateProject`/`Project` (entities), `PROJECT_COLOR_KEYS`/`PROJECT_COLORS`/`PROJECT_GLYPH_PALETTE`/`GLYPH_MAX_LENGTH` (Task 3), `Input`/`Button` (shared/ui).
- Produces: `ProjectGlyphPicker` (props `{ project: Project }`). 트리거 버튼 aria-label = `프로젝트 아이콘 변경`. 색상 버튼 aria-label = `색상 {key}`.

- [ ] **Step 1: 실패 테스트 작성**

`frontend/src/features/project-list/ui/ProjectGlyphPicker.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as client from '@/shared/api/client'
import { ProjectGlyphPicker } from './ProjectGlyphPicker'
import type { Project } from '@/entities/project'

const project: Project = {
  id: 'p-1',
  user_id: 'u-1',
  name: 'P',
  dbml_text: '',
  layout: {},
  glyph: null,
  color: null,
  created_at: '2026-06-19T00:00:00Z',
  updated_at: '2026-06-19T00:00:00Z',
}

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

const setup = () =>
  userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never })

describe('ProjectGlyphPicker', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('PATCHes color when a swatch is clicked', async () => {
    const spy = vi
      .spyOn(client, 'apiFetch')
      .mockResolvedValue({ ...project, color: 'blue' })
    const user = setup()
    render(<ProjectGlyphPicker project={project} />, { wrapper })

    await user.click(screen.getByLabelText('프로젝트 아이콘 변경'))
    await user.click(screen.getByLabelText('색상 blue'))

    expect(spy).toHaveBeenCalledWith(
      '/projects/p-1',
      expect.objectContaining({ method: 'PATCH' }),
    )
    expect(JSON.parse(spy.mock.calls[0][1]!.body as string)).toEqual({
      color: 'blue',
    })
  })

  it('PATCHes glyph when an emoji is clicked', async () => {
    const spy = vi
      .spyOn(client, 'apiFetch')
      .mockResolvedValue({ ...project, glyph: '🗄️' })
    const user = setup()
    render(<ProjectGlyphPicker project={project} />, { wrapper })

    await user.click(screen.getByLabelText('프로젝트 아이콘 변경'))
    await user.click(screen.getByRole('button', { name: '🗄️' }))

    expect(JSON.parse(spy.mock.calls[0][1]!.body as string)).toEqual({
      glyph: '🗄️',
    })
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `docker compose exec -T frontend npm run test:run -- ProjectGlyphPicker.test.tsx`
Expected: FAIL (모듈 없음).

- [ ] **Step 3: 편집기 작성**

`frontend/src/features/project-list/ui/ProjectGlyphPicker.tsx`:

```tsx
import { useState } from 'react'
import { Popover, PopoverTrigger, PopoverContent } from '@/shared/ui/popover'
import { Input } from '@/shared/ui/input'
import { Button } from '@/shared/ui/button'
import { ProjectGlyph, useUpdateProject, type Project } from '@/entities/project'
import {
  PROJECT_COLOR_KEYS,
  PROJECT_COLORS,
  PROJECT_GLYPH_PALETTE,
  GLYPH_MAX_LENGTH,
} from '@/entities/project/model/glyph'

/**
 * Editable glyph badge: the project's ProjectGlyph as a popover trigger. The
 * popover offers color swatches, a quick emoji palette, and a free-text input
 * (emoji or 1-2 chars). Each choice issues an independent PATCH.
 */
export function ProjectGlyphPicker({ project }: { project: Project }) {
  const update = useUpdateProject(project.id)
  const [text, setText] = useState('')

  return (
    <Popover>
      <PopoverTrigger
        aria-label="프로젝트 아이콘 변경"
        className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ProjectGlyph glyph={project.glyph} color={project.color} size={32} />
      </PopoverTrigger>
      <PopoverContent>
        <div className="flex flex-wrap gap-1.5">
          {PROJECT_COLOR_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              aria-label={`색상 ${key}`}
              onClick={() => update.mutate({ color: key })}
              className="size-6 rounded-full border border-border"
              style={{ backgroundColor: PROJECT_COLORS[key] }}
            />
          ))}
        </div>

        <div className="mt-3 grid grid-cols-8 gap-1">
          {PROJECT_GLYPH_PALETTE.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => update.mutate({ glyph: g })}
              className="grid size-7 place-items-center rounded text-base hover:bg-muted"
            >
              {g}
            </button>
          ))}
        </div>

        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const v = text.trim()
            if (v) update.mutate({ glyph: v })
            setText('')
          }}
        >
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={GLYPH_MAX_LENGTH}
            placeholder="직접 입력"
            className="h-8"
          />
          <Button type="submit" size="sm" variant="outline">
            설정
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `docker compose exec -T frontend npm run test:run -- ProjectGlyphPicker.test.tsx`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/features/project-list/ui/ProjectGlyphPicker.tsx \
  frontend/src/features/project-list/ui/ProjectGlyphPicker.test.tsx
git commit -m "feat(projects): add ProjectGlyphPicker popover editor"
```

---

### Task 7: 렌더 지점 연결 (ProjectList + AppSidebar)

**Files:**
- Modify: `frontend/src/features/project-list/ui/ProjectList.tsx`
- Modify: `frontend/src/widgets/app-sidebar/ui/AppSidebar.tsx`

**Interfaces:**
- Consumes: `ProjectGlyphPicker` (Task 6), `ProjectGlyph` (Task 4).

- [ ] **Step 1: ProjectList 배지 교체**

`frontend/src/features/project-list/ui/ProjectList.tsx` 상단 import 에 추가:

```tsx
import { ProjectGlyphPicker } from './ProjectGlyphPicker'
```

`ProjectCard` 내부의 다음 블록 (현재 ~60행):

```tsx
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-secondary text-muted-foreground">
          <Database size={16} />
        </span>
```

을 다음으로 교체:

```tsx
        <div className="mt-0.5">
          <ProjectGlyphPicker project={project} />
        </div>
```

> `Database` import 는 빈 상태(현재 ~187행 `<Database size={20} />`)에서 계속 쓰이므로 **제거하지 않는다.**

- [ ] **Step 2: AppSidebar 아이콘 교체**

`frontend/src/widgets/app-sidebar/ui/AppSidebar.tsx`:

import 에 추가:

```tsx
import { ProjectGlyph } from '@/entities/project'
```

다음 줄 (현재 ~119행):

```tsx
                  <Database size={16} className="shrink-0 opacity-70" />
```

을 다음으로 교체:

```tsx
                  <ProjectGlyph
                    glyph={p.glyph}
                    color={p.color}
                    size={20}
                    className="opacity-90"
                  />
```

`Database` 는 AppSidebar 의 다른 곳에서 쓰이지 않으므로 (확인됨: 119행이 유일 사용) import 목록에서 제거:

```tsx
import { PanelLeft, Plus, LogOut } from 'lucide-react'
```

> 단, 이 시점에 `AppSidebar` 가 받는 프로젝트 객체 `p` 가 `Project` 타입(= `glyph`/`color` 포함)인지 확인. 다른 타입이면 `p.glyph`/`p.color` 접근에서 tsc 가 에러를 낸다 — 그 경우 해당 소스의 프로젝트 타입을 `Project` 로 맞춘다.

- [ ] **Step 3: 타입 체크 + 전체 프론트 테스트**

Run:
```bash
docker compose exec -T frontend npx tsc -b --noEmit
docker compose exec -T frontend npm run test:run
```
Expected: tsc 에러 없음, 전체 테스트 PASS. (기존 `ProjectList`/`AppSidebar` 테스트가 글리프 변경으로 깨지면, 목 프로젝트 객체에 `glyph: null, color: null` 추가 또는 셀렉터를 새 구조에 맞게 수정.)

- [ ] **Step 4: 커밋**

```bash
git add frontend/src/features/project-list/ui/ProjectList.tsx \
  frontend/src/widgets/app-sidebar/ui/AppSidebar.tsx
git commit -m "feat(projects): wire glyph badge into project list and sidebar"
```

- [ ] **Step 5: 수동 확인 (선택)**

`docker compose up -d` 후 http://localhost:4001 에서: 대시보드 프로젝트 배지 클릭 → 팝오버에서 색상/이모지 선택 → 배지 즉시 갱신, 사이드바에도 동일 글리프 표시, 새로고침 후 유지.

---

## Self-Review

**1. Spec coverage**
- 데이터 모델(glyph/color nullable, max_length 8/16, null 폴백) → Task 1.
- 마이그레이션 1개 → Task 2.
- 팔레트 6색 + 이모지 ~24 + resolver → Task 3.
- ProjectGlyph 표시(폴백 포함) → Task 4.
- Popover 프리미티브 → Task 5.
- ProjectGlyphPicker(색상/팔레트/직접입력) → Task 6.
- ProjectList + AppSidebar 연결, 사이드바 편집 없음 → Task 7.
- 백엔드/프론트 테스트 → 각 태스크 내.
- 비범위(지우기, 사이드바 편집, 생성 시 선택, 커스텀 hex, 풀 이모지 피커) → 미구현 확인.

**2. Placeholder scan** — 모든 코드 스텝에 실제 코드 포함, TODO/TBD 없음.

**3. Type consistency** — `glyph: string|null`/`color: string|null`(Project), `glyph?/color?`(UpdatePayload), `resolveProjectColor`, `PROJECT_COLOR_KEYS`/`PROJECT_COLORS`/`PROJECT_GLYPH_PALETTE`/`GLYPH_MAX_LENGTH` 명칭이 Task 3 정의와 Task 4·6 사용에서 일치. 백엔드 `update(...glyph, color)` 시그니처가 service→repo 간 일치. 색상 키는 백엔드에서 자유 문자열(max_length 16)로 저장하고 검증은 프론트 팔레트로 한정(스펙과 일치).
