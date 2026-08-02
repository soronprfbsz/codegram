# 수동 저장(Ctrl+S) + 체크포인트 + 종료 flush — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 편집 모드를 나갈 때 마지막 편집이 사라지는 결함을 고치고, Ctrl+S로 "되돌아올 지점"(`checkpoint` 스냅샷)을 명시적으로 남길 수 있게 한다.

**Architecture:** 저장 경로는 `useProjectAutosave` 하나로 유지하고, 거기에 명령형 `flush()`만 추가한다. 편집 종료는 리스를 놓기 **전에** flush를 await한다(백엔드 `take_or_conflict`가 free 리스를 획득하므로 순서가 뒤집히면 반납한 락이 되살아난다). Ctrl+S는 `flush()` 후 새 스냅샷 종류 `checkpoint`를 만든다(스냅샷은 서버의 `project.dbml_text`를 복사하므로 PATCH가 먼저 끝나야 한다).

**Tech Stack:** FastAPI + SQLAlchemy + Alembic(이번엔 마이그레이션 없음) / React 19 + Vite + TypeScript, TanStack Query, radix-ui, react-i18next / pytest, vitest, Playwright

**참고 문서:** `docs/adr/0027-manual-save-is-a-checkpoint.md`(결정), `docs/superpowers/specs/2026-07-31-manual-save-checkpoint-design.md`(설계)

## Global Constraints

- **규칙 파일을 먼저 읽는다**: `.claude/rules/general.md` + 작업 영역의 `.claude/rules/frontend.md` 또는 `backend.md`.
- **외과적 변경**(G2): 요청에 직접 연결되는 라인만 바꾼다. 인접 코드·포맷·주석을 "개선"하지 않는다. 기존 dead code는 언급만 하고 지우지 않는다.
- **단일 출처**(G1/F1): 같은 모양·로직을 호출부마다 재구현하지 않는다. 탑바 컨트롤은 `src/shared/ui/topbar-control.tsx`의 `TopbarIconButton`/`TOPBAR_ICON_SIZE`/`TOPBAR_ICON_STROKE`만 쓴다.
- **디자인 토큰만**(F2/F5): 색·크기는 `--erd-*` CSS 변수 또는 Tailwind named step. raw hex/rgb/px 숫자 금지. 이 계획에서 쓰는 토큰은 전부 `src/index.css`에 이미 있다: `--erd-surface`, `--erd-border`, `--erd-text`, `--erd-text-3`, `--erd-success`, `--erd-error`, `--erd-shadow`, `--erd-fs-sm`.
- **i18n**(F4): 사용자 노출 문자열은 전부 `t('key')`. 새 키는 **`src/shared/i18n/locales/ko.json`과 `en.json` 양쪽에 먼저 추가**한 뒤 사용한다. `data-testid`는 번역에서 분리해 고정한다.
- **FSD 계층**(F3): import는 `shared ← entities ← features ← widgets ← pages ← app`. widget이 widget을 import하지 않는다. **feature가 feature를 import하지 않는다** — 이 계획에서 `useManualSave`가 `flush`를 prop으로 받는 이유.
- **새 의존성 없음**: 토스트는 이미 설치된 `radix-ui@1.4.3`의 `Toast`(`@radix-ui/react-toast`)를 쓴다. 새 패키지를 추가하지 않는다(추가는 ADR 대상).
- **마이그레이션 없음**: `project_snapshot.kind`는 평문 `String(16)`이고 DB enum도 CHECK 제약도 없다. 새 kind 값 추가에 Alembic revision을 만들지 않는다(모델 변경이 없다).
- **검증 명령은 도커 스택이 떠 있어야 한다**: `deploy/scripts/start.sh`. 호스트 포트 백엔드 4000 · 프론트 4001 · postgres 35432.
  - 백엔드 테스트: `docker compose -p codegram exec -T backend pytest -q`
  - 프론트 단위: `cd frontend && npm run test:run`
  - 프론트 타입: `cd frontend && npx tsc -p tsconfig.app.json --noEmit`
    (루트 `npm run type-check`는 `files: []`라 no-op이다. tsbuildinfo 캐시로 재실행 시 에러가 억제되므로 clean 실행할 것.)
  - E2E: `cd frontend && VITE_PROXY_TARGET=http://localhost:4000 npx playwright test <spec> --project=chromium --reporter=line`
- **작업 브랜치**: `feat/manual-save-checkpoint` (ADR/스펙 커밋 `9758792`가 이미 올라가 있다).

---

### Task 1: 백엔드 — `checkpoint` 스냅샷 생성

**Files:**
- Modify: `backend/app/services/project_snapshot.py` (상수 블록 35-40행, `_kinds_for_group` 55-62행, `create_manual` 뒤에 `create_checkpoint` 추가)
- Modify: `backend/app/schemas/project_snapshot.py:14-21` (`ProjectSnapshotCreate`)
- Modify: `backend/app/api/routes/snapshots.py:59-98` (`create_snapshot`)
- Modify: `backend/app/models/project_snapshot.py:1-16` (docstring만)
- Test: `backend/tests/test_snapshots.py`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces:
  - `app.services.project_snapshot.KIND_CHECKPOINT: str = "checkpoint"`
  - `ProjectSnapshotService.create_checkpoint(project_id: uuid.UUID, user_id: uuid.UUID) -> ProjectSnapshot`
  - `ProjectSnapshotCreate.kind: Literal["manual", "checkpoint"] = "manual"`
  - `POST /api/projects/{id}/snapshots` 가 `{"kind": "checkpoint"}` 를 받는다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`backend/tests/test_snapshots.py` 상단 import에 `KIND_CHECKPOINT`를 추가한다:

```python
from app.services.project_snapshot import (
    KIND_CHECKPOINT,
    KIND_COARSE,
    KIND_FINE,
    KIND_MANUAL,
    ProjectSnapshotNotFoundError,
    ProjectSnapshotService,
    SnapshotLimitError,
    SnapshotNotDeletableError,
    compute_content_hash,
)
```

파일 끝에 다음 테스트를 추가한다:

```python
# --- checkpoint (ADR-0027) -------------------------------------------------
async def test_create_checkpoint_returns_201_without_label(
    authenticated_client: AsyncClient,
) -> None:
    project_id = await _create_project(authenticated_client)
    resp = await authenticated_client.post(
        f"/api/projects/{project_id}/snapshots", json={"kind": "checkpoint"}
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["kind"] == KIND_CHECKPOINT
    assert body["label"] is None
    assert body["dbml_text"] == "table a {}"


async def test_checkpoint_ignores_label_from_the_client(
    authenticated_client: AsyncClient,
) -> None:
    """A checkpoint is identified by its time, never by a name (ADR-0027)."""
    project_id = await _create_project(authenticated_client)
    resp = await authenticated_client.post(
        f"/api/projects/{project_id}/snapshots",
        json={"kind": "checkpoint", "label": "ignored"},
    )
    assert resp.status_code == 201
    assert resp.json()["label"] is None


async def test_unchanged_checkpoint_does_not_add_a_row(
    authenticated_client: AsyncClient,
) -> None:
    project_id = await _create_project(authenticated_client)
    first = await authenticated_client.post(
        f"/api/projects/{project_id}/snapshots", json={"kind": "checkpoint"}
    )
    second = await authenticated_client.post(
        f"/api/projects/{project_id}/snapshots", json={"kind": "checkpoint"}
    )
    assert first.status_code == 201 and second.status_code == 201
    # Same content -> the same row comes back, not a new one.
    assert second.json()["id"] == first.json()["id"]

    listed = await authenticated_client.get(
        f"/api/projects/{project_id}/snapshots?group=auto"
    )
    assert listed.status_code == 200
    checkpoints = [s for s in listed.json() if s["kind"] == KIND_CHECKPOINT]
    assert len(checkpoints) == 1


async def test_changed_content_adds_a_new_checkpoint(
    authenticated_client: AsyncClient,
) -> None:
    project_id = await _create_project(authenticated_client)
    first = await authenticated_client.post(
        f"/api/projects/{project_id}/snapshots", json={"kind": "checkpoint"}
    )
    patched = await authenticated_client.patch(
        f"/api/projects/{project_id}", json={"dbml_text": "table b {}"}
    )
    assert patched.status_code == 200
    second = await authenticated_client.post(
        f"/api/projects/{project_id}/snapshots", json={"kind": "checkpoint"}
    )
    assert second.json()["id"] != first.json()["id"]
    assert second.json()["dbml_text"] == "table b {}"


async def test_checkpoints_are_not_capped_like_manual_snapshots(
    test_session: AsyncSession,
) -> None:
    """`snapshot_manual_max` bounds named manual snapshots only (ADR-0027)."""
    original = config_module.settings.snapshot_manual_max
    config_module.settings.snapshot_manual_max = 2
    try:
        user_id = await _make_user(test_session, "cap-checkpoint@example.com")
        project = await ProjectService(test_session).create_project(
            user_id=user_id, name="P", dbml_text="table a {}"
        )
        service = ProjectSnapshotService(test_session)
        for i in range(5):
            await ProjectService(test_session).update_project(
                project.id, user_id, dbml_text=f"table t{i} {{}}"
            )
            await service.create_checkpoint(project.id, user_id)
        listed = await service.list_snapshots(project.id, user_id, group="auto")
        assert len([s for s, _ in listed if s.kind == KIND_CHECKPOINT]) == 5
    finally:
        config_module.settings.snapshot_manual_max = original


async def test_checkpoint_is_not_user_deletable(
    authenticated_client: AsyncClient,
) -> None:
    """Checkpoints expire on their own; only named manual snapshots are deleted."""
    project_id = await _create_project(authenticated_client)
    created = await authenticated_client.post(
        f"/api/projects/{project_id}/snapshots", json={"kind": "checkpoint"}
    )
    resp = await authenticated_client.delete(
        f"/api/projects/{project_id}/snapshots/{created.json()['id']}"
    )
    assert resp.status_code == 409


async def test_manual_snapshot_is_the_default_kind(
    authenticated_client: AsyncClient,
) -> None:
    """Existing clients send no `kind` and must keep getting a manual snapshot."""
    project_id = await _create_project(authenticated_client)
    resp = await authenticated_client.post(
        f"/api/projects/{project_id}/snapshots", json={"label": "v1"}
    )
    assert resp.status_code == 201
    assert resp.json()["kind"] == KIND_MANUAL
```

- [ ] **Step 2: 실패를 확인한다**

Run: `docker compose -p codegram exec -T backend pytest tests/test_snapshots.py -q`
Expected: FAIL — `ImportError: cannot import name 'KIND_CHECKPOINT'`

- [ ] **Step 3: 서비스에 `checkpoint`를 추가한다**

`backend/app/services/project_snapshot.py` — 상수 블록(35-40행)을 이렇게 바꾼다:

```python
KIND_FINE = "auto_fine"
KIND_COARSE = "auto_coarse"
KIND_MANUAL = "manual"
# A save point the user asked for (ADR-0027): unlabelled, deduped by content,
# pruned on the fine retain window. Distinct from KIND_FINE so the history
# panel can say who chose to record this moment.
KIND_CHECKPOINT = "checkpoint"
AUTO_KINDS = (KIND_FINE, KIND_COARSE)
# The kinds behind the history panel's time-ordered tab. Not AUTO_KINDS: that
# name means "captured by the scheduler" and the prune job depends on it.
TIMELINE_KINDS = (KIND_FINE, KIND_COARSE, KIND_CHECKPOINT)
```

`_kinds_for_group`(55-62행)에서 `"auto"` 분기를 `TIMELINE_KINDS`로 바꾼다:

```python
def _kinds_for_group(group: SnapshotGroup | None) -> Sequence[str] | None:
    """Map a UI group ('auto'/'manual') to the concrete kinds it spans."""
    if group == "auto":
        return TIMELINE_KINDS
    if group == "manual":
        return (KIND_MANUAL,)
    return None
```

`create_manual` 바로 뒤(208행 다음)에 추가한다:

```python
    async def create_checkpoint(
        self, project_id: uuid.UUID, user_id: uuid.UUID
    ) -> ProjectSnapshot:
        """Record the current project state as a user-chosen save point.

        A checkpoint has no label — its time identifies it (ADR-0027). Saving
        again with nothing changed returns the existing row instead of adding a
        duplicate, and the manual-snapshot cap does not apply: checkpoints are
        pruned on the fine retain window like auto snapshots.
        """
        project, _role = await self.projects.get_authorized(
            project_id, user_id, Capability.CREATE_SNAPSHOT
        )
        content_hash = compute_content_hash(project.dbml_text, project.layout)
        latest = await self.repo.latest_of_kind(project_id, KIND_CHECKPOINT)
        if latest is not None and latest.content_hash == content_hash:
            return latest
        return await self.repo.create(
            project_id=project_id,
            kind=KIND_CHECKPOINT,
            label=None,
            dbml_text=project.dbml_text,
            layout=project.layout,
            content_hash=content_hash,
            created_by=user_id,
        )
```

- [ ] **Step 4: repository에 `latest_of_kind`를 추가한다**

`backend/app/repositories/project_snapshot.py` — `latest_hash`(167-181행) 바로 앞에 추가한다:

```python
    async def latest_of_kind(
        self, project_id: uuid.UUID, kind: str
    ) -> ProjectSnapshot | None:
        """Return the newest snapshot of a kind for a project, or None."""
        stmt = (
            select(ProjectSnapshot)
            .where(
                ProjectSnapshot.project_id == project_id,
                ProjectSnapshot.kind == kind,
            )
            .order_by(ProjectSnapshot.created_at.desc())
            .limit(1)
        )
        result = await self.session.execute(stmt)
        return result.scalars().first()
```

- [ ] **Step 5: 스키마에 `kind`를 추가한다**

`backend/app/schemas/project_snapshot.py` — import에 `Literal`을 더하고 `ProjectSnapshotCreate`를 바꾼다:

```python
from typing import Any, Literal
```

```python
class ProjectSnapshotCreate(BaseModel):
    """Body for POST .../snapshots (manual snapshot or checkpoint)."""

    # "manual" = a named snapshot the user keeps (ADR-0023). "checkpoint" = a
    # save point Ctrl+S records (ADR-0027); label/overwrite are ignored for it.
    kind: Literal["manual", "checkpoint"] = "manual"
    label: str | None = Field(default=None, max_length=255)
    # A label identifies a manual snapshot within its project (ADR-0023): saving
    # under an existing label conflicts (409) unless the caller confirms the
    # overwrite. Ignored when label is empty — unlabelled saves always add a row.
    overwrite: bool = False
```

- [ ] **Step 6: 라우트를 얇게 분기한다**

`backend/app/api/routes/snapshots.py` — `create_snapshot`의 docstring과 `try` 블록 첫 부분(70-77행)만 바꾼다:

```python
    """Create a manual snapshot or a checkpoint of the project's current state."""
    try:
        if payload.kind == "checkpoint":
            snapshot = await service.create_checkpoint(project_id, user.id)
        else:
            snapshot = await service.create_manual(
                project_id,
                user.id,
                label=payload.label,
                overwrite=payload.overwrite,
            )
```

나머지 `except` 절과 반환문은 그대로 둔다.

- [ ] **Step 7: 모델 docstring을 갱신한다**

`backend/app/models/project_snapshot.py:4-9` — 종류 목록을 넷으로 고친다:

```python
A snapshot copies a project's dbml_text + layout at a point in time so the
project can be fully restored to it later. Four kinds:
- "auto_fine":   periodic snapshot of a changed project; pruned after a short
                 retain window.
- "auto_coarse": monthly snapshot of a changed project; kept far longer.
- "checkpoint":  a save point the user asked for (Ctrl+S, ADR-0027); no label,
                 deduped by content, pruned on the fine retain window.
- "manual":      user-created with an optional label; never auto-pruned.
```

- [ ] **Step 8: 테스트를 돌려 통과를 확인한다**

Run: `docker compose -p codegram exec -T backend pytest tests/test_snapshots.py tests/test_snapshot_access.py -q`
Expected: PASS (신규 7건 포함, 기존 실패 0)

- [ ] **Step 9: 커밋**

```bash
git add backend/app/services/project_snapshot.py backend/app/repositories/project_snapshot.py \
        backend/app/schemas/project_snapshot.py backend/app/api/routes/snapshots.py \
        backend/app/models/project_snapshot.py backend/tests/test_snapshots.py
git commit -m "feat(snapshot): 사용자 저장 시점을 checkpoint 종류로 기록한다"
```

---

### Task 2: 백엔드 — `checkpoint` 보관 정책(prune)

**Files:**
- Modify: `backend/app/jobs/snapshot.py:26-30`(import), `60-83`(`prune_snapshots`), `1-16`(docstring)
- Test: `backend/tests/test_snapshot_jobs.py`

**Interfaces:**
- Consumes: `KIND_CHECKPOINT` (Task 1)
- Produces: `prune_snapshots`가 `checkpoint`를 `fine_retain_days`로 지운다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`backend/tests/test_snapshot_jobs.py` import에 `KIND_CHECKPOINT`를 추가하고, 파일 끝에 다음을 붙인다:

```python
async def test_prune_expires_checkpoints_on_the_fine_window(
    test_session: AsyncSession,
) -> None:
    """A checkpoint is a save point, not an archive: it ages out like a fine one."""
    user_id = await _make_user(test_session, "prune-cp@example.com")
    project = await ProjectService(test_session).create_project(
        user_id=user_id, name="P", dbml_text="table a {}"
    )
    now = datetime(2026, 7, 31, tzinfo=timezone.utc)
    for age_days, kind in (
        (100, KIND_CHECKPOINT),  # past the 90-day window -> pruned
        (10, KIND_CHECKPOINT),   # inside the window -> kept
        (100, KIND_MANUAL),      # manual is never pruned
    ):
        snap = ProjectSnapshot(
            project_id=project.id,
            kind=kind,
            label="keep" if kind == KIND_MANUAL else None,
            dbml_text="table a {}",
            layout={},
            content_hash=compute_content_hash("table a {}", {}),
            created_at=now - timedelta(days=age_days),
        )
        test_session.add(snap)
    await test_session.flush()

    removed = await prune_snapshots(
        test_session, now=now, fine_retain_days=90, coarse_retain_days=730
    )

    assert removed == 1
    assert await _count(test_session, project.id, KIND_CHECKPOINT) == 1
    assert await _count(test_session, project.id, KIND_MANUAL) == 1
```

- [ ] **Step 2: 실패를 확인한다**

Run: `docker compose -p codegram exec -T backend pytest tests/test_snapshot_jobs.py -q`
Expected: FAIL — `assert 0 == 1` (checkpoint가 prune 대상이 아니라 아무것도 지워지지 않는다)

- [ ] **Step 3: prune에 checkpoint를 추가한다**

`backend/app/jobs/snapshot.py` — import(26-30행):

```python
from app.services.project_snapshot import (
    KIND_CHECKPOINT,
    KIND_COARSE,
    KIND_FINE,
    compute_content_hash,
)
```

`prune_snapshots`의 docstring과 삭제 블록(67-83행):

```python
    """Delete snapshots past their retain window. Manual is never pruned.

    Checkpoints (ADR-0027) share the fine window: they are save points, not an
    archive, and the named manual snapshot is what a user keeps for good.

    Returns the number of snapshots removed.
    """
    now = now or datetime.now(timezone.utc)
    if fine_retain_days is None:
        fine_retain_days = settings.snapshot_fine_retain_days
    if coarse_retain_days is None:
        coarse_retain_days = settings.snapshot_coarse_retain_days
    repo = ProjectSnapshotRepository(session)
    fine_cutoff = now - timedelta(days=fine_retain_days)
    removed = await repo.delete_older_than(KIND_FINE, fine_cutoff)
    removed += await repo.delete_older_than(KIND_CHECKPOINT, fine_cutoff)
    removed += await repo.delete_older_than(
        KIND_COARSE, now - timedelta(days=coarse_retain_days)
    )
    return removed
```

모듈 docstring(1-16행)에는 한 줄만 덧붙인다:

```
Checkpoints (ADR-0027) are created by the user, not by these jobs, but they are
pruned here on the fine retain window.
```

- [ ] **Step 4: 테스트 통과를 확인한다**

Run: `docker compose -p codegram exec -T backend pytest tests/test_snapshot_jobs.py -q`
Expected: PASS

- [ ] **Step 5: 백엔드 전체를 돌린다**

Run: `docker compose -p codegram exec -T backend pytest -q`
Expected: PASS. 실패가 있으면 `git stash`로 main 상태와 대조해 **사전 존재인지 내 회귀인지 구분**하고, 사전 존재면 그렇게 보고한다(G4).

- [ ] **Step 6: 커밋**

```bash
git add backend/app/jobs/snapshot.py backend/tests/test_snapshot_jobs.py
git commit -m "feat(snapshot): checkpoint를 fine 보관 창(90일)으로 prune한다"
```

---

### Task 3: `useDebouncedCallback`에 `flush()` 추가

**Files:**
- Modify: `frontend/src/shared/hooks/useDebounce.ts:3-8`(타입), `46-66`(구현), `10-22`(docstring)
- Test: `frontend/src/shared/hooks/useDebounce.test.ts` (없으면 생성)

**Interfaces:**
- Consumes: 없음
- Produces: `DebouncedCallback<Args>`에 `flush: () => void`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`frontend/src/shared/hooks/useDebounce.test.ts`가 이미 있으면 아래 `describe` 블록만 덧붙이고, 없으면 파일을 만든다:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useDebouncedCallback } from './useDebounce'

describe('useDebouncedCallback.flush', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('runs a pending call immediately', () => {
    const fn = vi.fn()
    const { result } = renderHook(() => useDebouncedCallback(fn, 600))

    act(() => result.current('a'))
    expect(fn).not.toHaveBeenCalled()

    act(() => result.current.flush())
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('a')
  })

  it('does nothing when nothing is pending', () => {
    const fn = vi.fn()
    const { result } = renderHook(() => useDebouncedCallback(fn, 600))

    act(() => result.current.flush())
    expect(fn).not.toHaveBeenCalled()
  })

  it('does not fire again when the timer elapses after a flush', () => {
    const fn = vi.fn()
    const { result } = renderHook(() => useDebouncedCallback(fn, 600))

    act(() => result.current('a'))
    act(() => result.current.flush())
    act(() => vi.advanceTimersByTime(1000))

    expect(fn).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd frontend && npx vitest run src/shared/hooks/useDebounce.test.ts`
Expected: FAIL — `result.current.flush is not a function`

- [ ] **Step 3: `flush()`를 구현한다**

`frontend/src/shared/hooks/useDebounce.ts` — 타입(3-8행):

```ts
/** A debounced function that can also cancel or flush its pending invocation. */
export interface DebouncedCallback<Args extends unknown[]> {
  (...args: Args): void
  /** Cancel a pending (not-yet-fired) invocation, if any. */
  cancel: () => void
  /** Run a pending invocation NOW with its latest args; no-op if none. */
  flush: () => void
}
```

`timerRef` 선언 옆에 마지막 인자 ref를 더한다(29행 다음):

```ts
  const lastArgsRef = useRef<Args | null>(null)
```

`debounced`(46-66행)를 바꾼다:

```ts
  const debounced = useRef<DebouncedCallback<Args>>(
    Object.assign(
      (...args: Args) => {
        lastArgsRef.current = args
        if (timerRef.current !== null) {
          clearTimeout(timerRef.current)
        }
        timerRef.current = setTimeout(() => {
          timerRef.current = null
          callbackRef.current(...args)
        }, delayRef.current)
      },
      {
        cancel: () => {
          if (timerRef.current !== null) {
            clearTimeout(timerRef.current)
            timerRef.current = null
          }
        },
        flush: () => {
          // Only a PENDING call flushes. Without the timer guard this would
          // re-run the last call every time, turning an idle flush into a save.
          if (timerRef.current === null) return
          clearTimeout(timerRef.current)
          timerRef.current = null
          callbackRef.current(...(lastArgsRef.current as Args))
        },
      },
    ),
  )
```

docstring(10-22행)의 마지막 불릿 뒤에 한 줄 더한다:

```
 * - Exposes `.flush()` so callers can force a pending call to run NOW (e.g.
 *   before handing back the edit lease).
```

- [ ] **Step 4: 테스트 통과를 확인한다**

Run: `cd frontend && npx vitest run src/shared/hooks/useDebounce.test.ts`
Expected: PASS (3건)

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/shared/hooks/useDebounce.ts frontend/src/shared/hooks/useDebounce.test.ts
git commit -m "feat(shared): 디바운스 콜백에 flush()를 추가한다"
```

---

### Task 4: `useProjectAutosave.flush()`

**Files:**
- Modify: `frontend/src/features/project-autosave/api/useProjectAutosave.ts:47-49`(결과 타입), `97-122`(저장 함수)
- Test: `frontend/src/features/project-autosave/api/useProjectAutosave.test.tsx`

**Interfaces:**
- Consumes: `DebouncedCallback.flush()` (Task 3)
- Produces: `useProjectAutosave(...)` 반환값 `{ status: AutosaveStatus; flush: () => Promise<void> }`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

기존 테스트는 `useUpdateProject`를 `{ mutate: mutateMock }`으로만 모킹한다. `mutateAsync`를 추가한다 — 파일 상단(5-15행)을 이렇게 바꾼다:

```ts
const mutateMock = vi.fn()
const mutateAsyncMock = vi.fn(() => Promise.resolve({}))

vi.mock('@/entities/project', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/entities/project')>()
  return {
    ...actual,
    useUpdateProject: () => ({
      mutate: mutateMock,
      mutateAsync: mutateAsyncMock,
    }),
  }
})
```

`beforeEach`에 `mutateAsyncMock.mockReset(); mutateAsyncMock.mockResolvedValue({})`를 더한다.

**기존 테스트는 `mutateMock`을 단언한다.** 구현이 `mutateAsync`로 옮겨가므로 기존 단언 대상을 `mutateAsyncMock`으로 바꾸고, 콜백 스타일(`opts.onSuccess()`)을 쓰던 테스트는 resolve/reject로 바꾼다. 예:

```ts
  it('reports saving then saved across the mutation lifecycle', async () => {
    mutateAsyncMock.mockResolvedValue({})

    const { result, rerender } = renderHook(
      ({ text }: { text: string }) =>
        useProjectAutosave({ projectId: 'p-1', dbmlText: text }),
      { initialProps: { text: 'initial' } },
    )

    expect(result.current.status).toBe('idle')

    rerender({ text: 'edited' })
    await act(async () => {
      vi.advanceTimersByTime(600)
    })

    await waitFor(() => expect(result.current.status).toBe('saved'))
  })
```

파일 끝에 flush 테스트를 추가한다:

```ts
describe('useProjectAutosave.flush', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mutateAsyncMock.mockReset()
    mutateAsyncMock.mockResolvedValue({})
  })
  afterEach(() => vi.useRealTimers())

  it('sends a pending save immediately instead of waiting out the debounce', async () => {
    const { result, rerender } = renderHook(
      ({ text }: { text: string }) =>
        useProjectAutosave({ projectId: 'p-1', dbmlText: text, baseline: 'initial' }),
      { initialProps: { text: 'initial' } },
    )

    rerender({ text: 'edited' })
    expect(mutateAsyncMock).not.toHaveBeenCalled()

    await act(async () => {
      await result.current.flush()
    })

    expect(mutateAsyncMock).toHaveBeenCalledTimes(1)
    expect(mutateAsyncMock.mock.calls[0][0]).toMatchObject({ dbml_text: 'edited' })
  })

  it('resolves without sending anything when there is nothing pending', async () => {
    const { result } = renderHook(() =>
      useProjectAutosave({ projectId: 'p-1', dbmlText: 'initial', baseline: 'initial' }),
    )

    await act(async () => {
      await result.current.flush()
    })

    expect(mutateAsyncMock).not.toHaveBeenCalled()
  })

  it('rejects when the save fails, so the caller can refuse to leave edit mode', async () => {
    mutateAsyncMock.mockRejectedValue(new Error('network down'))

    const { result, rerender } = renderHook(
      ({ text }: { text: string }) =>
        useProjectAutosave({ projectId: 'p-1', dbmlText: text, baseline: 'initial' }),
      { initialProps: { text: 'initial' } },
    )

    rerender({ text: 'edited' })

    await expect(
      act(async () => {
        await result.current.flush()
      }),
    ).rejects.toThrow('network down')
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd frontend && npx vitest run src/features/project-autosave`
Expected: FAIL — `result.current.flush is not a function`

- [ ] **Step 3: 구현한다**

`frontend/src/features/project-autosave/api/useProjectAutosave.ts` — 결과 타입(47-49행):

```ts
interface UseProjectAutosaveResult {
  status: AutosaveStatus
  /**
   * Send a pending save NOW and wait for the PATCH to land. Resolves at once
   * when nothing is pending. REJECTS when the save fails — the caller decides
   * what that means (the exit path refuses to hand back the lease).
   */
  flush: () => Promise<void>
}
```

`useCallback`을 import에 추가하고(`import { useCallback, useEffect, useMemo, useRef, useState } from 'react'`), 저장 로직(97-122행)을 바꾼다:

```ts
  // The save currently in flight, so flush() can await a PATCH the debounce
  // already fired instead of sending a second one.
  const inFlightRef = useRef<Promise<unknown> | null>(null)

  const runSave = useCallback((): Promise<unknown> => {
    setStatus('saving')
    const promise = updateMutation
      .mutateAsync({
        dbml_text: dbmlText,
        layout: layout as Record<string, unknown> | undefined,
        version: versionRef.current,
      })
      .then(
        (result) => {
          if (aliveRef.current) setStatus('saved')
          return result
        },
        (error: unknown) => {
          if (aliveRef.current) setStatus('error')
          // 409 = edit lock taken over or stale version → let the editor react.
          if (error instanceof ApiError && error.status === 409) {
            onConflictRef.current?.(error.reason)
          }
          throw error
        },
      )
    inFlightRef.current = promise
    return promise
  }, [updateMutation, dbmlText, layout])

  const debouncedSave = useDebouncedCallback(() => {
    // The automatic path reports failure through `status` / onConflict; swallow
    // the rejection here so it never surfaces as an unhandled promise.
    void runSave().catch(() => {})
  }, delayMs)

  const flush = useCallback(async () => {
    // Fires the pending call synchronously, which sets inFlightRef.
    debouncedSave.flush()
    if (inFlightRef.current) await inFlightRef.current
  }, [debouncedSave])
```

반환문(158행)을 바꾼다:

```ts
  return { status, flush }
```

훅 docstring(51-60행)의 끝에 한 줄 더한다:

```
 * `flush()` is the imperative escape hatch: it sends a pending save now and
 * waits for it, so leaving edit mode cannot drop the last edit (ADR-0027).
```

- [ ] **Step 4: 테스트 통과를 확인한다**

Run: `cd frontend && npx vitest run src/features/project-autosave`
Expected: PASS (기존 테스트 포함 전부)

- [ ] **Step 5: 타입 검사**

Run: `cd frontend && npx tsc -p tsconfig.app.json --noEmit`
Expected: 사전 존재 에러 3건 외에 신규 에러 없음. 신규가 있으면 고친다.

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/features/project-autosave
git commit -m "feat(autosave): 대기 중인 저장을 즉시 밀어넣는 flush()를 노출한다"
```

---

### Task 5: `useEditLease` — 리스를 놓기 전에 저장한다

**Files:**
- Modify: `frontend/src/features/edit-lock/api/useEditLease.ts:26-68`(`EditLease` 타입), `82-99`(옵션), `231-269`(`exitEditMode`)
- Modify: `frontend/src/features/edit-lock/ui/LockStatusControl.tsx:82-97`
- Test: `frontend/src/features/edit-lock/api/useEditLease.test.tsx`

**Interfaces:**
- Consumes: 없음 (테스트에서 flush는 목으로 주입)
- Produces:
  - `useEditLease(projectId, { canEdit, isOwner, onEntered?, onExiting? })` — `onExiting?: () => Promise<void> | void`
  - `EditLease.exitEditMode: () => Promise<void>`
  - `EditLease.exiting: boolean`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`frontend/src/features/edit-lock/api/useEditLease.test.tsx`에 추가한다. 기존 파일이 `releaseLock`을 어떻게 모킹하는지 먼저 읽고 같은 방식을 쓴다(`./editLock` 모듈 모킹).

```ts
  it('saves BEFORE handing the lease back', async () => {
    // The backend takes a free lease on any content write, so a PATCH that
    // lands after the release would revive the lock we just gave up.
    const calls: string[] = []
    releaseLockMock.mockImplementation(() => {
      calls.push('release')
    })
    const onExiting = vi.fn(async () => {
      calls.push('flush')
    })

    const { result } = renderHook(() =>
      useEditLease('p-1', { canEdit: true, isOwner: true, onExiting }),
    )
    await act(async () => result.current.enterEditMode())
    await act(async () => {
      await result.current.exitEditMode()
    })

    expect(calls).toEqual(['flush', 'release'])
    expect(result.current.editMode).toBe(false)
  })

  it('stays in edit mode when the save fails', async () => {
    releaseLockMock.mockClear()
    const onExiting = vi.fn(async () => {
      throw new Error('save failed')
    })

    const { result } = renderHook(() =>
      useEditLease('p-1', { canEdit: true, isOwner: true, onExiting }),
    )
    await act(async () => result.current.enterEditMode())
    await act(async () => {
      await result.current.exitEditMode()
    })

    expect(result.current.editMode).toBe(true)
    expect(releaseLockMock).not.toHaveBeenCalled()
  })
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd frontend && npx vitest run src/features/edit-lock`
Expected: FAIL — `onExiting`이 호출되지 않아 `calls`가 `['release']`

- [ ] **Step 3: `onExiting`과 `exiting`을 구현한다**

`frontend/src/features/edit-lock/api/useEditLease.ts` — `EditLease` 인터페이스에서 `exitEditMode` 선언을 바꾸고 `exiting`을 추가한다:

```ts
  /**
   * Save, then hand the lease back and return to reading. Saving happens FIRST
   * and is awaited: the backend takes a free lease on any content write, so a
   * PATCH landing after the release would revive the lock (ADR-0027). If the
   * save fails, edit mode is kept — leaving with unsaved work loses it.
   */
  exitEditMode: () => Promise<void>
  /** An exit is in flight (the pre-exit save is running). */
  exiting: boolean
```

옵션에 `onExiting`을 더한다(82-99행의 구조분해와 타입):

```ts
    onEntered,
    onExiting,
  }: {
    canEdit: boolean
    isOwner: boolean
    onEntered?: () => Promise<void> | void
    /**
     * Awaited BEFORE the lease goes back — the caller flushes pending saves
     * here. Throwing cancels the exit and keeps the caller in edit mode.
     */
    onExiting?: () => Promise<void> | void
  },
```

상태를 하나 더 둔다(`enterBlocked` 선언 옆, 106행 근처):

```ts
  const [exiting, setExiting] = useState(false)
```

ref와 `exitEditMode`를 바꾼다(231-269행):

```ts
  const onEnteredRef = useRef(onEntered)
  onEnteredRef.current = onEntered
  const onExitingRef = useRef(onExiting)
  onExitingRef.current = onExiting
```

```ts
  const exitEditMode = useCallback(async () => {
    setExiting(true)
    try {
      // Still editMode=true here, so autosave is not suspended and the lease is
      // still ours — the save can actually land.
      await onExitingRef.current?.()
    } catch {
      // Could not save. Staying in edit mode is the only way the user can retry;
      // the caller surfaces the failure (409 goes to the conflict dialog).
      return
    } finally {
      setExiting(false)
    }
    setEditMode(false)
    setLostLease(false)
    // Giving it up on purpose is not losing it: clear the "was holding" mark so
    // the next poll doesn't read the vanishing lease as a takeover.
    heldRef.current = false
    releaseLock(projectId)
    // releaseLock is fire-and-forget (keepalive), so a refetch here would race
    // the DELETE and read back the lease we just gave up. We know the outcome —
    // write it, and let the poll confirm (or correct it if someone else got in).
    writeStatus(FREE_LOCK)
  }, [projectId, writeStatus])
```

반환 객체에 `exiting`을 더한다(277-306행의 객체 안):

```ts
    exiting,
```

- [ ] **Step 4: 스위치가 저장 중에 흔들리지 않게 한다**

`frontend/src/features/edit-lock/ui/LockStatusControl.tsx` — `onChange`가 Promise를 반환하지 않도록 감싸고, 저장 중에는 양쪽을 잠근다(82-97행):

```ts
        onChange={(next) => {
          if (next === 'edit') lease.enterEditMode()
          else void lease.exitEditMode()
        }}
        options={[
          {
            value: 'read',
            label: t('editLock.modeRead'),
            icon: <Eye size={TOPBAR_ICON_SIZE} strokeWidth={TOPBAR_ICON_STROKE} />,
            disabled: lease.exiting,
          },
          {
            value: 'edit',
            label: t('editLock.modeEdit'),
            icon: <Pencil size={TOPBAR_ICON_SIZE} strokeWidth={TOPBAR_ICON_STROKE} />,
            disabled: Boolean(blockedReason) || lease.entering || lease.exiting,
            title: blockedTitle ?? undefined,
          },
        ]}
```

`LockStatusControl.test.tsx`의 `lease()` 팩토리(17행 근처)에 `exiting: false`를 더한다 — 없으면 타입 에러가 난다.

- [ ] **Step 5: 테스트 통과를 확인한다**

Run: `cd frontend && npx vitest run src/features/edit-lock`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/features/edit-lock
git commit -m "fix(edit-lock): 리스를 반납하기 전에 저장을 끝낸다"
```

---

### Task 6: 편집 종료 flush 배선 + E2E 회귀 테스트 ← **버그가 실제로 고쳐지는 지점**

**Files:**
- Modify: `frontend/src/pages/editor/index.tsx:137-177`
- Test: `frontend/e2e/edit-mode-save.spec.ts` (신규)

**Interfaces:**
- Consumes: `useProjectAutosave().flush` (Task 4), `useEditLease({ onExiting })` (Task 5)
- Produces: 없음 (배선)

- [ ] **Step 1: 실패하는 E2E를 쓴다**

`frontend/e2e/edit-mode-save.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test'
import { enterEditMode } from './helpers'

const PASSWORD = 'password123'

async function registerAndLogin(page: Page, email: string) {
  await page.goto('/register')
  await page.locator('#register-email').fill(email)
  await page.locator('#register-password').fill(PASSWORD)
  await page.locator('#register-confirm-password').fill(PASSWORD)
  const loginResponse = page.waitForResponse(
    (r) => r.url().includes('/api/auth/jwt/login') && r.status() === 204,
  )
  await page.getByRole('button', { name: '회원가입' }).click()
  await loginResponse
  await page.waitForURL((url) => url.pathname === '/')
}

const SAMPLE_DBML = `Table users {
  id integer [pk]
}`

test.describe('Leaving edit mode saves', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies()
  })

  test('an edit made right before leaving edit mode survives a reload', async ({
    page,
  }) => {
    const email = `exitflush-${Date.now()}@example.com`
    await registerAndLogin(page, email)

    const createResp = await page.request.post('/api/projects', {
      data: { name: 'Exit Flush E2E', dbml_text: SAMPLE_DBML },
    })
    expect(createResp.status()).toBe(201)
    const { id } = await createResp.json()

    await page.goto(`/editor/${id}`)
    await page.waitForSelector('[data-testid="erd-canvas"]', { timeout: 15000 })
    await enterEditMode(page)

    // Type, then leave IMMEDIATELY — inside the 600ms debounce window, which is
    // exactly where the pending save used to be cancelled.
    const editor = page.getByTestId('dbml-editor')
    await editor.click()
    await page.keyboard.press('Control+End')
    await page.keyboard.type('\nTable orders {\n  id integer [pk]\n')
    await page.getByTestId('mode-switch-read').click()

    // The switch only lands on 읽기 after the save resolves.
    await expect(page.getByTestId('mode-switch-read')).toHaveAttribute(
      'aria-checked',
      'true',
      { timeout: 10000 },
    )

    await page.reload()
    await page.waitForSelector('[data-testid="erd-canvas"]', { timeout: 15000 })
    await expect(page.getByTestId('dbml-editor')).toContainText('orders')
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

먼저 스택이 떠 있는지 확인한다: `docker compose -p codegram ps`

Run: `cd frontend && VITE_PROXY_TARGET=http://localhost:4000 npx playwright test e2e/edit-mode-save.spec.ts --project=chromium --reporter=line`
Expected: FAIL — 새로고침 후 에디터에 `orders`가 없다(대기 중이던 저장이 취소됐다)

**이 실패를 실제로 확인하지 못하면 멈추고 보고한다.** 실패하지 않는다면 테스트가 결함을 재현하지 못하는 것이고, 그대로 통과시키면 아무것도 검증하지 않는 테스트가 남는다.

- [ ] **Step 3: 페이지에서 배선한다**

`frontend/src/pages/editor/index.tsx` — `useEditLease` 호출(137-152행)과 `useProjectAutosave` 호출(166-177행) 사이에는 순환 참조가 있다: lease가 `readOnly`를 만들고 autosave가 그것을 쓰는데, lease의 `onExiting`은 autosave의 `flush`를 써야 한다. ref로 끊는다.

`useEditLease` 호출 **앞에** 다음을 넣는다:

```ts
  // useEditLease는 flush를 필요로 하고 useProjectAutosave는 lease의 readOnly를
  // 필요로 한다. ref로 한 방향을 늦게 연결해 순환을 끊는다.
  const flushRef = useRef<() => Promise<void>>(() => Promise.resolve())
```

`useEditLease`의 옵션에 `onExiting`을 더한다:

```ts
    // 리스를 놓기 전에 대기 중인 저장을 끝낸다. 여기서 실패하면 exitEditMode가
    // 편집 모드를 유지하므로 사용자가 다시 시도할 수 있다(ADR-0027).
    onExiting: async () => {
      await flushRef.current()
    },
```

`useProjectAutosave` 호출을 바꾸고 바로 뒤에서 ref를 채운다:

```ts
  const { status, flush } = useProjectAutosave({
    projectId: id,
    dbmlText,
    baseline,
    layout,
    layoutBaseline,
    // Pause autosave while previewing a snapshot, or when read-only (viewer /
    // not holding the edit lock), so nothing it shows is persisted.
    suspended: previewing || readOnly,
    version: project?.version,
    onConflict: lease.reportConflict,
  })
  flushRef.current = flush
```

`useRef`는 이미 import되어 있다(263행에서 쓴다).

- [ ] **Step 4: E2E 통과를 확인한다**

Run: `cd frontend && VITE_PROXY_TARGET=http://localhost:4000 npx playwright test e2e/edit-mode-save.spec.ts --project=chromium --reporter=line`
Expected: PASS

- [ ] **Step 5: 인접 E2E가 깨지지 않았는지 본다**

Run: `cd frontend && VITE_PROXY_TARGET=http://localhost:4000 npx playwright test e2e/collab.spec.ts e2e/snapshot.spec.ts --project=chromium --reporter=line`
Expected: PASS. 실패하면 사전 존재인지 확인하고(G4) 내 회귀면 고친다.

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/pages/editor/index.tsx frontend/e2e/edit-mode-save.spec.ts
git commit -m "fix(editor): 편집 모드를 나갈 때 대기 중인 저장을 잃지 않는다"
```

---

### Task 7: 토스트 공용 컴포넌트

**Files:**
- Create: `frontend/src/shared/ui/toast.tsx`
- Create: `frontend/src/shared/ui/toast.test.tsx`
- Modify: `frontend/src/app/index.tsx`
- Modify: `frontend/src/shared/i18n/locales/ko.json`, `frontend/src/shared/i18n/locales/en.json`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `ToastProvider({ children }: { children: ReactNode })`
  - `useToast(): { success(m: string): void; error(m: string): void; info(m: string): void }`

- [ ] **Step 1: i18n 키를 ko/en 양쪽에 추가한다**

`ko.json` — 최상위에 `toast` 섹션을 추가한다(`topbar` 뒤가 자연스럽다):

```json
  "toast": {
    "saved": "저장되었습니다",
    "saveFailed": "저장하지 못했습니다",
    "editModeRequired": "편집 모드에서만 저장할 수 있습니다"
  },
```

`en.json` — 같은 자리에:

```json
  "toast": {
    "saved": "Saved",
    "saveFailed": "Couldn't save",
    "editModeRequired": "Enter edit mode to save"
  },
```

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`frontend/src/shared/ui/toast.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { ToastProvider, useToast } from './toast'

function Trigger() {
  const toast = useToast()
  return (
    <>
      <button onClick={() => toast.success('저장되었습니다')}>ok</button>
      <button onClick={() => toast.error('저장하지 못했습니다')}>bad</button>
    </>
  )
}

describe('toast', () => {
  it('shows a success message', async () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    )
    await act(async () => {
      screen.getByText('ok').click()
    })
    const toast = await screen.findByTestId('toast')
    expect(toast).toHaveTextContent('저장되었습니다')
    expect(toast).toHaveAttribute('data-kind', 'success')
  })

  it('shows an error message', async () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    )
    await act(async () => {
      screen.getByText('bad').click()
    })
    const toast = await screen.findByTestId('toast')
    expect(toast).toHaveAttribute('data-kind', 'error')
  })

  it('throws when useToast is used outside the provider', () => {
    function Bare() {
      useToast()
      return null
    }
    expect(() => render(<Bare />)).toThrow(/ToastProvider/)
  })
})
```

- [ ] **Step 3: 실패를 확인한다**

Run: `cd frontend && npx vitest run src/shared/ui/toast.test.tsx`
Expected: FAIL — `Failed to resolve import "./toast"`

- [ ] **Step 4: 컴포넌트를 만든다**

`frontend/src/shared/ui/toast.tsx`:

```tsx
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Toast } from 'radix-ui'
import { CheckCircle2, Info, X, XCircle } from 'lucide-react'

/**
 * App-wide transient notification — the single source of "something just
 * happened" feedback (F1). Surfaces, colours and spacing come from the
 * `--erd-*` tokens only; call sites pass a message and nothing else.
 *
 * shared layer: depends on nothing upward (FSD rule). Built on the radix Toast
 * primitive that ships inside the already-installed `radix-ui` package, so this
 * adds no dependency.
 */

type ToastKind = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  kind: ToastKind
  message: string
}

interface ToastApi {
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

/** Post a transient message. Throws outside <ToastProvider>. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (!api) throw new Error('useToast must be used inside a <ToastProvider>')
  return api
}

/** How long a message stays up before it dismisses itself. */
const DURATION_MS = 3000
const ICON_SIZE = 16

// Module-scoped so ids stay unique across providers without a random source.
let nextId = 0

const accent: Record<ToastKind, string> = {
  success: 'var(--erd-success)',
  error: 'var(--erd-error)',
  info: 'var(--erd-text-3)',
}

const Icon: Record<ToastKind, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
}

const viewportStyle: CSSProperties = {
  position: 'fixed',
  bottom: 16,
  right: 16,
  zIndex: 60,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  width: 320,
  maxWidth: 'calc(100vw - 32px)',
  margin: 0,
  padding: 0,
  listStyle: 'none',
  outline: 'none',
}

function rootStyle(kind: ToastKind): CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr auto',
    alignItems: 'center',
    gap: 10,
    padding: '10px 12px',
    borderRadius: 8,
    background: 'var(--erd-surface)',
    border: '1px solid var(--erd-border)',
    borderLeft: `3px solid ${accent[kind]}`,
    boxShadow: 'var(--erd-shadow)',
    color: 'var(--erd-text)',
    fontSize: 'var(--erd-fs-sm)',
  }
}

const closeStyle: CSSProperties = {
  display: 'grid',
  placeItems: 'center',
  background: 'transparent',
  border: 'none',
  padding: 2,
  cursor: 'pointer',
  color: 'var(--erd-text-3)',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [items, setItems] = useState<ToastItem[]>([])

  const push = useCallback((kind: ToastKind, message: string) => {
    setItems((prev) => [...prev, { id: (nextId += 1), kind, message }])
  }, [])

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push('success', message),
      error: (message) => push('error', message),
      info: (message) => push('info', message),
    }),
    [push],
  )

  return (
    <ToastContext.Provider value={api}>
      <Toast.Provider swipeDirection="right" duration={DURATION_MS}>
        {children}
        {items.map((item) => {
          const Glyph = Icon[item.kind]
          return (
            <Toast.Root
              key={item.id}
              data-testid="toast"
              data-kind={item.kind}
              style={rootStyle(item.kind)}
              onOpenChange={(open) => {
                if (!open) {
                  setItems((prev) => prev.filter((i) => i.id !== item.id))
                }
              }}
            >
              <Glyph size={ICON_SIZE} color={accent[item.kind]} aria-hidden />
              <Toast.Title>{item.message}</Toast.Title>
              <Toast.Close aria-label={t('common.close')} style={closeStyle}>
                <X size={14} aria-hidden />
              </Toast.Close>
            </Toast.Root>
          )
        })}
        <Toast.Viewport style={viewportStyle} />
      </Toast.Provider>
    </ToastContext.Provider>
  )
}
```

`t('common.close')`가 ko/en 양쪽에 이미 있는지 확인한다(`SnapshotHistoryPanel.tsx:85`가 쓰고 있으므로 있다).

- [ ] **Step 5: 테스트 통과를 확인한다**

Run: `cd frontend && npx vitest run src/shared/ui/toast.test.tsx`
Expected: PASS (3건)

- [ ] **Step 6: 앱에 마운트한다**

`frontend/src/app/index.tsx`:

```tsx
import { QueryProvider } from '@/app/providers/query'
import { AppRouter } from '@/app/providers/router'
import { ToastProvider } from '@/shared/ui/toast'

export function App() {
  return (
    <QueryProvider>
      <ToastProvider>
        <AppRouter />
      </ToastProvider>
    </QueryProvider>
  )
}
```

- [ ] **Step 7: 타입 검사 + 커밋**

Run: `cd frontend && npx tsc -p tsconfig.app.json --noEmit`
Expected: 신규 에러 없음

```bash
git add frontend/src/shared/ui/toast.tsx frontend/src/shared/ui/toast.test.tsx \
        frontend/src/app/index.tsx frontend/src/shared/i18n/locales/ko.json \
        frontend/src/shared/i18n/locales/en.json
git commit -m "feat(shared): 공용 토스트 컴포넌트를 추가한다"
```

---

### Task 8: 프론트 스냅샷 종류에 `checkpoint` 반영

**Files:**
- Modify: `frontend/src/entities/snapshot/model/types.ts:7`
- Modify: `frontend/src/entities/snapshot/api/useCreateSnapshot.ts:6-23`
- Modify: `frontend/src/widgets/snapshot-history/ui/SnapshotHistoryPanel.tsx:52-56`
- Modify: `frontend/src/shared/i18n/locales/ko.json`, `en.json`
- Test: `frontend/src/widgets/snapshot-history/ui/SnapshotHistoryPanel.test.tsx` (없으면 kindBadge 테스트만 신규 생성)

**Interfaces:**
- Consumes: Task 1의 백엔드 계약
- Produces:
  - `SnapshotKind = 'auto_fine' | 'auto_coarse' | 'checkpoint' | 'manual'`
  - `CreateSnapshotInput.kind?: 'manual' | 'checkpoint'`

- [ ] **Step 1: i18n 키를 ko/en 양쪽에 추가/수정한다**

`ko.json`의 `snapshot` 섹션:
- `"kindCheckpoint": "저장"` 추가
- `"tabAuto"`를 `"자동"` → `"기록"`으로 수정 (그 탭에 사용자 체크포인트가 섞이므로 "자동"은 거짓이 된다)

`en.json`의 `snapshot` 섹션:
- `"kindCheckpoint": "Saved point"` 추가
- `"tabAuto"`를 `"Timeline"`으로 수정

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`SnapshotHistoryPanel.test.tsx`가 있으면 거기에, 없으면 새로 만든다. `kindBadge`가 모듈 내부 함수이므로 **export해서 직접 테스트한다**(패널 전체를 렌더하면 쿼리·달력까지 끌고 온다):

```tsx
import { describe, it, expect } from 'vitest'
import i18n from '@/shared/i18n'
import { kindBadge } from './SnapshotHistoryPanel'

describe('kindBadge', () => {
  const t = i18n.getFixedT('ko')

  it('names a user-chosen save point apart from the 30-minute snapshot', () => {
    expect(kindBadge('checkpoint', t)).toBe('저장')
    expect(kindBadge('auto_fine', t)).toBe('30분')
    expect(kindBadge('auto_coarse', t)).toBe('월')
    expect(kindBadge('manual', t)).toBe('수동')
  })
})
```

`@/shared/i18n`의 기본 export가 i18n 인스턴스인지 먼저 확인하고, 다르면 그 파일의 실제 export에 맞춘다.

- [ ] **Step 3: 실패를 확인한다**

Run: `cd frontend && npx vitest run src/widgets/snapshot-history`
Expected: FAIL — `kindBadge` is not exported / `'checkpoint'` 인자가 타입에 없다

- [ ] **Step 4: 타입과 배지를 고친다**

`frontend/src/entities/snapshot/model/types.ts:6-7`:

```ts
/** Concrete snapshot kind stored on the row. */
export type SnapshotKind = 'auto_fine' | 'auto_coarse' | 'checkpoint' | 'manual'
```

`frontend/src/entities/snapshot/api/useCreateSnapshot.ts`:

```ts
export interface CreateSnapshotInput {
  /**
   * 'manual' = a named snapshot the user keeps (ADR-0023).
   * 'checkpoint' = the save point Ctrl+S records (ADR-0027) — no label, no
   * overwrite, deduped by content on the server.
   */
  kind?: 'manual' | 'checkpoint'
  label?: string | null
  /**
   * Confirm replacing the manual snapshot that already carries this label
   * (ADR-0023). Without it the API answers 409 with reason 'label_exists'.
   */
  overwrite?: boolean
}

function createSnapshot(
  projectId: string,
  { kind = 'manual', label = null, overwrite = false }: CreateSnapshotInput,
): Promise<SnapshotFull> {
  return apiFetch<SnapshotFull>(`/projects/${projectId}/snapshots`, {
    method: 'POST',
    body: JSON.stringify({ kind, label, overwrite }),
  })
}
```

`label`이 필수에서 선택으로 바뀌므로, 기존 호출부(`SnapshotHistoryPanel`의 `save({ label: ... })`)는 그대로 동작한다.

`frontend/src/widgets/snapshot-history/ui/SnapshotHistoryPanel.tsx:52-56` — export하고 분기를 더한다:

```tsx
export function kindBadge(kind: SnapshotMeta['kind'], t: TFunction): string {
  if (kind === 'auto_coarse') return t('snapshot.kindMonth')
  if (kind === 'auto_fine') return t('snapshot.kindHalfHour')
  // A save point the user chose — not one the scheduler took (ADR-0027).
  if (kind === 'checkpoint') return t('snapshot.kindCheckpoint')
  return t('snapshot.kindManual')
}
```

- [ ] **Step 5: 테스트 + 타입 검사**

Run: `cd frontend && npx vitest run src/widgets/snapshot-history src/entities/snapshot`
Expected: PASS

Run: `cd frontend && npx tsc -p tsconfig.app.json --noEmit`
Expected: 신규 에러 없음

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/entities/snapshot frontend/src/widgets/snapshot-history \
        frontend/src/shared/i18n/locales/ko.json frontend/src/shared/i18n/locales/en.json
git commit -m "feat(snapshot): 버전 기록에서 체크포인트를 자동 스냅샷과 구분한다"
```

---

### Task 9: `features/manual-save` — Ctrl+S

**Files:**
- Create: `frontend/src/features/manual-save/api/useManualSave.ts`
- Create: `frontend/src/features/manual-save/index.ts`
- Create: `frontend/src/features/manual-save/api/useManualSave.test.tsx`

**Interfaces:**
- Consumes: `useCreateSnapshot` + `CreateSnapshotInput.kind` (Task 8), `useToast` (Task 7), `flush` (Task 4, 주입)
- Produces: `useManualSave(opts): { save: () => Promise<void>; saving: boolean }`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`frontend/src/features/manual-save/api/useManualSave.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

const mutateAsyncMock = vi.fn(() => Promise.resolve({}))
const successMock = vi.fn()
const errorMock = vi.fn()
const infoMock = vi.fn()

vi.mock('@/entities/snapshot', () => ({
  useCreateSnapshot: () => ({ mutateAsync: mutateAsyncMock }),
}))
vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ success: successMock, error: errorMock, info: infoMock }),
}))

import { useManualSave } from './useManualSave'

function press(key = 's', init: KeyboardEventInit = {}) {
  window.dispatchEvent(
    new KeyboardEvent('keydown', { key, ctrlKey: true, cancelable: true, ...init }),
  )
}

describe('useManualSave', () => {
  beforeEach(() => {
    mutateAsyncMock.mockReset()
    mutateAsyncMock.mockResolvedValue({})
    successMock.mockReset()
    errorMock.mockReset()
    infoMock.mockReset()
  })

  it('saves BEFORE snapshotting — the snapshot copies server state', async () => {
    const order: string[] = []
    const flush = vi.fn(async () => {
      order.push('flush')
    })
    mutateAsyncMock.mockImplementation(async () => {
      order.push('snapshot')
      return {}
    })

    const { result } = renderHook(() =>
      useManualSave({ projectId: 'p-1', canEdit: true, editable: true, flush }),
    )
    await act(async () => {
      await result.current.save()
    })

    expect(order).toEqual(['flush', 'snapshot'])
    expect(mutateAsyncMock).toHaveBeenCalledWith({ kind: 'checkpoint' })
    expect(successMock).toHaveBeenCalled()
  })

  it('records nothing and explains why when not in edit mode', async () => {
    const flush = vi.fn(async () => {})
    const { result } = renderHook(() =>
      useManualSave({ projectId: 'p-1', canEdit: true, editable: false, flush }),
    )
    await act(async () => {
      await result.current.save()
    })

    expect(flush).not.toHaveBeenCalled()
    expect(mutateAsyncMock).not.toHaveBeenCalled()
    expect(infoMock).toHaveBeenCalled()
  })

  it('reports a failed save', async () => {
    const flush = vi.fn(async () => {
      throw new Error('network down')
    })
    const { result } = renderHook(() =>
      useManualSave({ projectId: 'p-1', canEdit: true, editable: true, flush }),
    )
    await act(async () => {
      await result.current.save()
    })

    expect(errorMock).toHaveBeenCalled()
    expect(successMock).not.toHaveBeenCalled()
  })

  it('Ctrl+S saves and blocks the browser save dialog', async () => {
    const flush = vi.fn(async () => {})
    renderHook(() =>
      useManualSave({ projectId: 'p-1', canEdit: true, editable: true, flush }),
    )

    let prevented = false
    const spy = (e: Event) => {
      prevented = e.defaultPrevented
    }
    window.addEventListener('keydown', spy)
    await act(async () => {
      press()
      await Promise.resolve()
    })
    window.removeEventListener('keydown', spy)

    expect(prevented).toBe(true)
    expect(flush).toHaveBeenCalled()
  })

  it('does not listen for a viewer', async () => {
    const flush = vi.fn(async () => {})
    renderHook(() =>
      useManualSave({ projectId: 'p-1', canEdit: false, editable: false, flush }),
    )

    await act(async () => {
      press()
      await Promise.resolve()
    })

    expect(flush).not.toHaveBeenCalled()
    expect(infoMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd frontend && npx vitest run src/features/manual-save`
Expected: FAIL — `Failed to resolve import "./useManualSave"`

- [ ] **Step 3: 훅을 구현한다**

`frontend/src/features/manual-save/api/useManualSave.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCreateSnapshot } from '@/entities/snapshot'
import { useToast } from '@/shared/ui/toast'
import { ApiError } from '@/shared/api/client'

interface UseManualSaveOptions {
  projectId: string
  /** Owner/editor. False for viewers — no shortcut is registered at all. */
  canEdit: boolean
  /** Saving is possible right now: !readOnly && !previewing. */
  editable: boolean
  /**
   * Push any pending autosave to the server and wait for it. Injected by the
   * page: this feature must not import another feature (FSD).
   */
  flush: () => Promise<void>
}

interface UseManualSaveResult {
  /** Save now and record a checkpoint. Safe to call while one is running. */
  save: () => Promise<void>
  saving: boolean
}

/**
 * Explicit save (Ctrl+S): flush the pending autosave, then record the moment as
 * a `checkpoint` snapshot (ADR-0027). Autosave already keeps the server current
 * — what this adds is a point in the version history the user chose.
 *
 * The listener is on `window` so it also fires with focus inside the Monaco
 * DBML editor, and it preventDefaults so the browser's "save page" never opens.
 */
export function useManualSave({
  projectId,
  canEdit,
  editable,
  flush,
}: UseManualSaveOptions): UseManualSaveResult {
  const { t } = useTranslation()
  const toast = useToast()
  const createSnapshot = useCreateSnapshot(projectId)
  const [saving, setSaving] = useState(false)
  // A ref as well as state: the keydown handler must see the current value
  // synchronously to drop a repeat press before a re-render lands.
  const savingRef = useRef(false)

  const save = useCallback(async () => {
    if (savingRef.current) return
    if (!editable) {
      toast.info(t('toast.editModeRequired'))
      return
    }
    savingRef.current = true
    setSaving(true)
    try {
      // Order matters: the snapshot copies the project row on the SERVER, so
      // the PATCH has to land first or the checkpoint misses the last edit.
      await flush()
      await createSnapshot.mutateAsync({ kind: 'checkpoint' })
      toast.success(t('toast.saved'))
    } catch (error) {
      // A 409 means the lease was taken or the version moved on — autosave's
      // onConflict already raises the conflict dialog for that, so a toast here
      // would say the same thing twice.
      if (!(error instanceof ApiError && error.status === 409)) {
        toast.error(t('toast.saveFailed'))
      }
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }, [editable, flush, createSnapshot, toast, t])

  // Keep the listener stable while always calling the freshest save().
  const saveRef = useRef(save)
  saveRef.current = save

  useEffect(() => {
    if (!canEdit) return
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      if (e.key.toLowerCase() !== 's') return
      e.preventDefault()
      void saveRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canEdit])

  return { save, saving }
}
```

`frontend/src/features/manual-save/index.ts`:

```ts
export { useManualSave } from './api/useManualSave'
```

- [ ] **Step 4: 테스트 통과를 확인한다**

Run: `cd frontend && npx vitest run src/features/manual-save`
Expected: PASS (5건)

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/features/manual-save
git commit -m "feat(manual-save): Ctrl+S로 저장하고 체크포인트를 남긴다"
```

---

### Task 10: 탑바 저장 버튼 + 페이지 배선 + E2E

**Files:**
- Modify: `frontend/src/widgets/erd-topbar/ui/ErdTopBar.tsx:6-38`(props), `160-173`(구조분해), `240-245`(렌더)
- Modify: `frontend/src/pages/editor/index.tsx` (`useManualSave` 호출 + `saveButton` 주입)
- Modify: `frontend/src/shared/i18n/locales/ko.json`, `en.json` (`topbar.save`)
- Test: `frontend/e2e/manual-save.spec.ts` (신규)
- Test: `frontend/src/widgets/erd-topbar/ui/ErdTopBar.test.tsx` (기존 — 새 prop이 선택이므로 수정 불필요, 렌더 단언만 1건 추가)

**Interfaces:**
- Consumes: `useManualSave` (Task 9), `flush` (Task 4), `TopbarIconButton` (기존)
- Produces: `ErdTopBarProps.saveButton?: ReactNode`

- [ ] **Step 1: i18n 키를 ko/en 양쪽에 추가한다**

`ko.json`의 `topbar` 섹션에 `"save": "저장"`, `en.json`에 `"save": "Save"`.

- [ ] **Step 2: 실패하는 E2E를 쓴다**

`frontend/e2e/manual-save.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test'
import { enterEditMode } from './helpers'

const PASSWORD = 'password123'

async function registerAndLogin(page: Page, email: string) {
  await page.goto('/register')
  await page.locator('#register-email').fill(email)
  await page.locator('#register-password').fill(PASSWORD)
  await page.locator('#register-confirm-password').fill(PASSWORD)
  const loginResponse = page.waitForResponse(
    (r) => r.url().includes('/api/auth/jwt/login') && r.status() === 204,
  )
  await page.getByRole('button', { name: '회원가입' }).click()
  await loginResponse
  await page.waitForURL((url) => url.pathname === '/')
}

const SAMPLE_DBML = `Table users {
  id integer [pk]
}`

test.describe('Manual save', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies()
  })

  test('Ctrl+S saves and records a checkpoint in the history', async ({ page }) => {
    const email = `manualsave-${Date.now()}@example.com`
    await registerAndLogin(page, email)

    const createResp = await page.request.post('/api/projects', {
      data: { name: 'Manual Save E2E', dbml_text: SAMPLE_DBML },
    })
    const { id } = await createResp.json()

    await page.goto(`/editor/${id}`)
    await page.waitForSelector('[data-testid="erd-canvas"]', { timeout: 15000 })
    await enterEditMode(page)

    const editor = page.getByTestId('dbml-editor')
    await editor.click()
    await page.keyboard.press('Control+End')
    await page.keyboard.type('\nTable orders {\n  id integer [pk]\n')

    const snapshotPost = page.waitForResponse(
      (r) => r.url().includes('/snapshots') && r.request().method() === 'POST',
    )
    await page.keyboard.press('Control+s')
    const resp = await snapshotPost
    expect(resp.status()).toBe(201)
    expect((await resp.json()).kind).toBe('checkpoint')

    await expect(page.getByTestId('toast')).toContainText('저장되었습니다')

    // The checkpoint shows up in the time-ordered tab, badged apart from the
    // 30-minute auto snapshots.
    await page.getByTestId('snapshot-history-button').click()
    await page.getByTestId('snapshot-tab-auto').click()
    await expect(page.getByTestId('snapshot-panel')).toContainText('저장')
  })

  test('Ctrl+S in read mode explains itself and records nothing', async ({ page }) => {
    const email = `manualsave-ro-${Date.now()}@example.com`
    await registerAndLogin(page, email)

    const createResp = await page.request.post('/api/projects', {
      data: { name: 'Manual Save RO E2E', dbml_text: SAMPLE_DBML },
    })
    const { id } = await createResp.json()

    await page.goto(`/editor/${id}`)
    await page.waitForSelector('[data-testid="erd-canvas"]', { timeout: 15000 })

    await page.keyboard.press('Control+s')
    await expect(page.getByTestId('toast')).toContainText('편집 모드')
  })
})
```

`snapshot-tab-auto` testid는 `SegmentedControl`의 `testId="snapshot-tab"`에서 파생된다 — `mode-switch-edit`/`mode-switch-read`와 같은 규칙인지 `segmented-control.tsx`에서 확인하고, 다르면 실제 testid로 맞춘다.

- [ ] **Step 3: 실패를 확인한다**

Run: `cd frontend && VITE_PROXY_TARGET=http://localhost:4000 npx playwright test e2e/manual-save.spec.ts --project=chromium --reporter=line`
Expected: FAIL — Ctrl+S에 아무 반응이 없다(POST /snapshots 타임아웃)

- [ ] **Step 4: 탑바에 슬롯을 추가한다**

`frontend/src/widgets/erd-topbar/ui/ErdTopBar.tsx` — props에 추가(`lockStatus` 옆, 36-37행):

```ts
  /** Explicit save control (Ctrl+S's twin), rendered with the action group. */
  saveButton?: ReactNode
```

구조분해(160-173행)에 `saveButton,`을 더하고, 액션 그룹(240-245행)에서 맨 앞에 놓는다:

```tsx
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {saveButton}
          {infoButton}
          {historyButton}
          {importMenu}
          {exportMenu}
        </div>
```

- [ ] **Step 5: 페이지에서 배선한다**

`frontend/src/pages/editor/index.tsx` — `flushRef.current = flush` 다음 줄에:

```ts
  const manualSave = useManualSave({
    projectId: id,
    canEdit,
    editable: !readOnly && !previewing,
    flush,
  })
```

import를 더한다:

```ts
import { useManualSave } from '@/features/manual-save'
import { Save } from 'lucide-react'
```

(`Save`는 기존 lucide import 블록에 합친다. `Settings`/`History`/`Download`가 이미 거기 있다.)

`ErdTopBar`에 슬롯을 넘긴다 — `lockStatus` 다음 줄:

```tsx
        saveButton={
          readOnly ? null : (
            <TopbarIconButton
              data-testid="manual-save-button"
              aria-label={t('topbar.save')}
              title={`${t('topbar.save')} (Ctrl+S)`}
              disabled={manualSave.saving}
              onClick={() => void manualSave.save()}
            >
              <Save size={TOPBAR_ICON_SIZE} strokeWidth={TOPBAR_ICON_STROKE} />
            </TopbarIconButton>
          )
        }
```

- [ ] **Step 6: 탑바 렌더 단언을 하나 더한다**

`frontend/src/widgets/erd-topbar/ui/ErdTopBar.test.tsx`에:

```tsx
  it('renders the save slot when the page supplies one', () => {
    render(
      <ErdTopBar
        projectName="P"
        autosaveStatus="idle"
        saveButton={<button data-testid="manual-save-button">save</button>}
      />,
    )
    expect(screen.getByTestId('manual-save-button')).toBeInTheDocument()
  })
```

기존 파일의 렌더 헬퍼(i18n provider 등)를 그대로 따른다.

- [ ] **Step 7: E2E 통과를 확인한다**

Run: `cd frontend && VITE_PROXY_TARGET=http://localhost:4000 npx playwright test e2e/manual-save.spec.ts --project=chromium --reporter=line`
Expected: PASS (2건)

**Monaco 안에서 Ctrl+S가 안 잡히면**: 추측하지 말고 프로브로 확인한다 —
```ts
await page.evaluate(() => {
  window.addEventListener('keydown', (e) => console.log('win', e.key, e.defaultPrevented), true)
})
```
로 이벤트가 window까지 오는지 먼저 측정하고, 오지 않으면 리스너를 capture phase(`{ capture: true }`)로 올린다.

- [ ] **Step 8: 커밋**

```bash
git add frontend/src/widgets/erd-topbar frontend/src/pages/editor/index.tsx \
        frontend/src/shared/i18n/locales/ko.json frontend/src/shared/i18n/locales/en.json \
        frontend/e2e/manual-save.spec.ts
git commit -m "feat(editor): 탑바 저장 버튼과 Ctrl+S를 배선한다"
```

---

### Task 11: 전체 검증 + ADR 승격

**Files:**
- Modify: `docs/adr/0027-manual-save-is-a-checkpoint.md`(헤더 Status), `docs/adr/README.md`(인덱스 행)

**Interfaces:**
- Consumes: Task 1-10 전부
- Produces: 없음

- [ ] **Step 1: 백엔드 전체 테스트**

Run: `docker compose -p codegram exec -T backend pytest -q`
Expected: PASS

- [ ] **Step 2: 프론트 단위 테스트 전체**

Run: `cd frontend && npm run test:run`
Expected: PASS

- [ ] **Step 3: 타입 검사 (clean)**

Run: `cd frontend && rm -f node_modules/.tmp/tsconfig.app.tsbuildinfo tsconfig.app.tsbuildinfo 2>/dev/null; npx tsc -p tsconfig.app.json --noEmit`
Expected: 사전 존재 에러 3건만. 신규 에러는 0.

- [ ] **Step 4: E2E 회귀 스윕**

Run:
```bash
cd frontend && VITE_PROXY_TARGET=http://localhost:4000 npx playwright test \
  e2e/edit-mode-save.spec.ts e2e/manual-save.spec.ts e2e/snapshot.spec.ts \
  e2e/collab.spec.ts e2e/editor-erd.spec.ts --project=chromium --reporter=line
```
Expected: PASS. 실패는 `git stash`로 main과 대조해 사전 존재인지 회귀인지 판정하고(G4), 사전 존재면 그대로 보고한다.

- [ ] **Step 5: ADR을 Accepted로 올린다**

`docs/adr/0027-manual-save-is-a-checkpoint.md`의 헤더에서 `**Status**: Proposed` → `**Status**: Accepted`.
`docs/adr/README.md`의 0027 행에서 `Proposed` → `Accepted`.

- [ ] **Step 6: 커밋**

```bash
git add docs/adr/0027-manual-save-is-a-checkpoint.md docs/adr/README.md
git commit -m "docs(adr-0027): 구현 완료로 Accepted로 올린다"
```

- [ ] **Step 7: 결과를 보고한다**

실행한 검증 명령과 **실제 출력**으로 보고한다(G3). 생략·실패·미실행이 있으면 그대로 적는다. 특히:
- Task 6 Step 2에서 회귀 테스트가 **실제로 실패했는지** — 실패를 못 봤다면 그 사실을 밝힌다.
- 사전 존재 실패와 내 회귀를 구분해 적는다.

---

## Self-Review

**스펙 커버리지**

| 스펙 절 | 태스크 |
|---|---|
| 1-1 `useDebouncedCallback.flush()` | Task 3 |
| 1-2 `useProjectAutosave.flush()` | Task 4 |
| 2 편집 종료 flush + 순서 + 실패 처리 + `exiting` | Task 5, 6 |
| 3 백엔드 `checkpoint`(service/schema/route/그룹) | Task 1 |
| 3 prune | Task 2 |
| 4 `features/manual-save` Ctrl+S | Task 9 |
| 4 탑바 저장 버튼 | Task 10 |
| 5 토스트 공용 컴포넌트 | Task 7 |
| 6 i18n ko/en | Task 7(toast.*), 8(snapshot.*), 10(topbar.save) |
| 7 검증(pytest/vitest/tsc/E2E) | 각 태스크 + Task 11 |
| 범위 밖(pagehide, 인라인 에러 이관, dedup 확장) | 구현하지 않음 — ADR-0027에 명시됨 |

**타입 일관성**

- `flush: () => Promise<void>` — Task 4가 정의, Task 6·9가 소비. 동일 시그니처.
- `onExiting?: () => Promise<void> | void` — Task 5가 정의, Task 6이 주입.
- `exitEditMode: () => Promise<void>` — Task 5가 변경, Task 5 Step 4(LockStatusControl)·Task 6이 소비.
- `exiting: boolean` — Task 5가 정의, 같은 태스크에서 `LockStatusControl`과 그 테스트 팩토리가 소비.
- `KIND_CHECKPOINT = "checkpoint"` (백엔드) ↔ `SnapshotKind`의 `'checkpoint'` (Task 8) ↔ `CreateSnapshotInput.kind` (Task 8) ↔ `mutateAsync({ kind: 'checkpoint' })` (Task 9). 문자열 일치.
- `TIMELINE_KINDS` — Task 1이 정의하고 같은 태스크의 `_kinds_for_group`만 쓴다. `AUTO_KINDS`는 Task 2의 prune이 쓰던 대로 유지.
- `latest_of_kind` — Task 1이 repository에 추가, 같은 태스크의 `create_checkpoint`가 소비.
- `useToast(): { success, error, info }` — Task 7이 정의, Task 9가 세 개 모두 소비.
- `saveButton?: ReactNode` — Task 10이 정의·소비.

**확인이 필요한 가정** (구현 중 실제 파일을 열어 맞출 것)

1. `useEditLease.test.tsx`가 `./editLock`을 어떻게 모킹하는지 — Task 5 Step 1의 `releaseLockMock` 이름은 그 파일의 실제 목 이름에 맞춘다.
2. `@/shared/i18n`의 export 형태 — Task 8 Step 2의 `i18n.getFixedT('ko')`가 맞는지.
3. `SegmentedControl`의 testid 파생 규칙 — Task 10 Step 2의 `snapshot-tab-auto`.
4. `ErdTopBar.test.tsx`의 렌더 헬퍼(i18n provider 유무) — Task 10 Step 6.

넷 다 "읽어보고 맞춘다"로 해결되는 사항이지 설계 공백이 아니다.
