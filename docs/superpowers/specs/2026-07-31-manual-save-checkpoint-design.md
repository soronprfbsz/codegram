# 수동 저장(Ctrl+S) + 체크포인트 + 종료 flush — 설계

> 결정 근거는 **ADR-0027**. 이 문서는 그 결정을 어떻게 구현하는지만 적는다.
> 관련: ADR-0014(스냅샷), ADR-0023(수동 스냅샷 라벨), ADR-0024(리스 반납), ADR-0025(편집 모드)

## 무엇을 만드나

1. **편집 모드 종료 시 강제 저장** — 대기 중인 자동저장이 취소되어 마지막 편집이 사라지는 버그를 고친다.
2. **Ctrl+S 수동 저장** — 즉시 저장 + `checkpoint` 스냅샷 기록 + 토스트. 탑바에 같은 동작의 버튼.
3. **토스트 공용 컴포넌트** — `shared/ui/toast.tsx`.

자동저장(600ms 디바운스)은 그대로 둔다.

## 현재 상태와 결함

| 파일 | 사실 |
|---|---|
| `frontend/src/pages/editor/index.tsx:174` | `suspended: previewing \|\| readOnly` |
| `frontend/src/features/edit-lock/api/useEditLease.ts:120` | `readOnly = !canEdit \|\| !editMode \|\| bumped \|\| lockedByOther` |
| `frontend/src/features/project-autosave/api/useProjectAutosave.ts:135-138` | `if (suspended) { debouncedSave.cancel(); return }` |
| `frontend/src/features/edit-lock/api/useEditLease.ts:258-269` | `exitEditMode()`가 동기적으로 `setEditMode(false)` → `releaseLock` |
| `backend/app/models/project_snapshot.py:43` | `kind: Mapped[str] = mapped_column(String(16))` — enum/CHECK 없음 |
| `backend/app/services/project_snapshot.py:180` | `create_manual`은 **서버의** `project.dbml_text`를 복사한다 |

**결함**: `exitEditMode()` → `editMode=false` → `readOnly=true` → `suspended=true` → 대기 중인 디바운스 `cancel()`. 마지막 편집 후 600ms 안에 편집 종료를 누르면 그 편집은 서버에 도달하지 않는다.

**파생 제약**: `create_manual`이 서버 상태를 복사하므로, 스냅샷은 **PATCH가 끝난 뒤에** 만들어야 한다. 순서가 뒤집히면 체크포인트가 방금 한 편집을 담지 않는다.

## 1. 저장 경로 — 명령형 진입점 하나 (G1)

### 1-1. `shared/hooks/useDebounce.ts` — `flush()` 추가

`cancel()`과 대칭. 대기 중인 타이머가 있으면 즉시 실행하고 타이머를 비운다. 대기분이 없으면 아무 일도 하지 않는다.

```ts
export interface DebouncedCallback<Args extends unknown[]> {
  (...args: Args): void
  cancel: () => void
  /** 대기 중인 호출을 지금 실행한다. 대기분이 없으면 아무 일도 하지 않는다. */
  flush: () => void
}
```

### 1-2. `features/project-autosave` — `flush(): Promise<void>` 노출

```ts
interface UseProjectAutosaveResult {
  status: AutosaveStatus
  /**
   * 대기 중인 저장을 즉시 실행하고 PATCH 완료까지 기다린다.
   * 보낼 변경이 없으면 아무것도 보내지 않고 즉시 resolve한다.
   * 실패하면 reject한다 — 호출부가 "저장 못 했다"를 알아야 하기 때문.
   */
  flush: () => Promise<void>
}
```

구현:
- `updateMutation.mutate` → `mutateAsync`. 디바운스 콜백은 결과 Promise를 ref에 담아두고, `flush()`가 그것을 await한다. 자동 경로의 동작(상태 전이·`onConflict`)은 불변.
- `flush()`는 `suspended` 여부와 무관하게 동작한다 — 호출부가 "지금 저장해야 한다"를 이미 판단했다. (종료 flush는 `suspended`가 켜지기 전에 불리므로 실제로는 문제되지 않지만, 계약을 명확히 한다.)
- 대기분이 없어도 **베이스라인과 다르면 보낸다.** 디바운스가 이미 발사돼 in-flight인 경우와, 아직 타이머가 걸리지 않은 경우를 모두 덮어야 한다.

## 2. 편집 종료 flush

`useEditLease`에 `onExiting`을 추가한다 — 기존 `onEntered`와 대칭.

```ts
useEditLease(id, {
  canEdit, isOwner,
  onEntered: async () => { /* 기존 */ },
  /** 리스를 놓기 전에 await된다. 던지면 종료를 중단한다. */
  onExiting: async () => { await autosave.flush() },
})
```

`exitEditMode`는 async가 된다:

```ts
const exitEditMode = useCallback(async () => {
  try {
    await onExitingRef.current?.()   // 아직 editMode=true, 락도 내 것
  } catch {
    return                            // 저장 실패 → 편집 모드 유지
  }
  setEditMode(false)
  setLostLease(false)
  heldRef.current = false
  releaseLock(projectId)
  writeStatus(FREE_LOCK)
}, [projectId, writeStatus])
```

- **순서가 계약이다**: 백엔드 `take_or_conflict`는 free 리스를 획득하므로, 반납 후 PATCH는 방금 놓은 락을 되살린다.
- **flush 실패 시 편집 모드 유지** + 에러 토스트. 단 409는 `useProjectAutosave`의 `onConflict` → `reportConflict`가 이미 처리해 충돌 다이얼로그로 간다(ADR-0024). 이 경우 `bumped`로 편집 모드가 어차피 해제된다.
- 종료 flush는 **체크포인트를 남기지 않는다**(ADR-0027).
- `lostLease`로 인한 자동 `setEditMode(false)`(`useEditLease.ts:220-222`)는 flush하지 않는다 — 리스가 없으니 서버가 어차피 거부한다.

**호출부**: `features/edit-lock/ui/LockStatusControl.tsx:83`이 세그먼티드 컨트롤 `onChange`에서 부른다. 표시값은 `lease.editMode`에서 오므로 flush 중에는 "편집 중"으로 남는다(정직하다). 다만 무반응 구간이 생기므로 `EditLease`에 `exiting: boolean`을 추가해 그동안 컨트롤을 disabled로 둔다. flush가 실패하면 `editMode`가 그대로라 스위치가 되돌아가지 않고 에러 토스트만 뜬다.

## 3. 백엔드 — `checkpoint` kind

**마이그레이션 없음** (`kind`가 평문 `String(16)`, 제약 없음). 모델 docstring만 갱신.

### `services/project_snapshot.py`
```python
KIND_CHECKPOINT = "checkpoint"
```
- `_kinds_for_group("auto")` → `(KIND_FINE, KIND_COARSE, KIND_CHECKPOINT)` — 시간순 탭에 함께 나온다. **`AUTO_KINDS` 상수 자체는 바꾸지 않는다**(이름 그대로 "자동으로 찍히는 것"을 뜻하고 prune 로직이 쓴다). 그룹 매핑용 튜플을 따로 둔다.
- `create_checkpoint(project_id, user_id)`:
  - `get_authorized(..., Capability.CREATE_SNAPSHOT)` (owner/editor — `create_manual`과 동일)
  - 최신 `checkpoint`의 `content_hash`와 같으면 **그 행을 그대로 반환**(새 행 없음)
  - 라벨 없음, `overwrite` 없음, `snapshot_manual_max` 미적용
  - `created_by = user_id`
- `create_manual`은 손대지 않는다.

### `schemas/project_snapshot.py`
`ProjectSnapshotCreate`에 `kind: Literal["manual", "checkpoint"] = "manual"`. 기본값이라 기존 호출부는 무영향.

### `api/routes/snapshots.py`
얇게 분기: `kind == "checkpoint"`면 `create_checkpoint`, 아니면 `create_manual`(B1 — 라우트에 로직 없음).

### `jobs/snapshot.py`
prune에 `KIND_CHECKPOINT`를 `snapshot_fine_retain_days`(90일)로 추가. `capture_auto_snapshots`는 손대지 않는다 — 30분 job의 dedup 비교 대상은 `auto_fine`으로 유지(ADR-0027 Consequences).

### `services/project_snapshot.py` — 삭제
`delete_manual`은 `kind != KIND_MANUAL`이면 거부한다. **체크포인트는 사용자가 삭제하지 않는다**(자동 prune 대상이므로). 현행 코드 그대로 두면 이 동작이 나온다 — 변경 없음.

## 4. 프론트 — 수동 저장

### 새 슬라이스 `features/manual-save/`

`flush`를 **주입받는다** — feature가 feature를 import하지 않기 위해(F3의 정신). 페이지가 조립한다.

```ts
useManualSave({
  projectId: string,
  /** 편집 권한자인가 — false면 리스너 자체를 달지 않는다(뷰어). */
  canEdit: boolean,
  /** 지금 저장할 수 있는가 — !readOnly && !previewing */
  editable: boolean,
  flush: () => Promise<void>,
}): { save: () => void; saving: boolean }
```

동작:
1. `canEdit`면 `window` keydown 리스너 등록(Monaco 안에서도 잡으려면 window 레벨이어야 한다 — `widgets/table-search/ui/TableSearch.tsx:54-69`가 같은 패턴).
2. `(e.ctrlKey || e.metaKey) && e.key === 's'` → `e.preventDefault()`(브라우저 "페이지 저장" 차단).
3. `!editable`이면 `toast.info(t('toast.editModeRequired'))` 후 종료.
4. `await flush()` → `createSnapshot({ kind: 'checkpoint' })` → `toast.success(t('toast.saved'))`.
   - **순서 필수**: 스냅샷은 서버 상태를 복사하므로 PATCH가 먼저 끝나야 한다.
5. 실패하면 `toast.error(t('toast.saveFailed'))`. 409는 자동저장의 `onConflict`가 충돌 다이얼로그로 처리하므로 토스트를 중복해서 띄우지 않는다.
6. `saving` 중 재입력은 무시(중복 스냅샷 방지). 내용이 안 바뀐 재저장은 백엔드 dedup이 흡수하며, 토스트는 동일하게 성공으로 보인다 — "이미 저장된 상태다"가 사용자에게 참이기 때문.

`entities/snapshot/api/useCreateSnapshot.ts`의 `CreateSnapshotInput`에 `kind?: 'manual' | 'checkpoint'` 추가.

### 탑바 저장 버튼

`widgets/erd-topbar`에 `saveButton?: ReactNode` 슬롯을 추가하고 페이지가 주입한다(기존 `searchBox`/`infoButton`/`importMenu`와 동일한 슬롯 패턴, F3).
- `shared/ui/topbar-control.tsx`의 `TopbarIconButton` 재사용 — 새 스타일을 만들지 않는다(F1).
- 아이콘 `Save`(lucide), `aria-label`/`title`은 `t('topbar.save')` + 단축키 표기.
- **편집 모드일 때만 렌더**한다 — 읽기 전용에서 눌러도 안내 토스트만 나오는 버튼은 소음이다.
- `saving` 중 disabled.

## 5. 토스트 공용 컴포넌트 — `shared/ui/toast.tsx`

**새 의존성 없음**: `radix-ui@1.4.3`에 Toast 프리미티브가 들어있다(`import { Toast } from 'radix-ui'`).

```tsx
<ToastProvider>   // app/ 에 마운트
useToast() → { success(msg), error(msg), info(msg) }
```

- 표면·색·간격·radius는 전부 `--erd-*` 토큰(F2/F5). 기존 `shared/ui/dialog.tsx`·`popover.tsx`와 같은 규격.
- 성공은 `--erd-success`, 실패는 `--erd-error`를 좌측 액센트/아이콘 색으로만 쓴다.
- 우하단 고정, 3초 자동 닫힘, 스택, 스와이프/닫기 버튼.
- `data-testid="toast"`. radix가 `role`/live region을 처리한다.
- 기존 인라인 에러 표시(`restoreError`, `groupOpError` 등)는 **이번에 옮기지 않는다**(G2 — 범위 밖).

## 6. i18n (F4) — ko/en 동시 추가

| 키 | ko | en |
|---|---|---|
| `toast.saved` | 저장되었습니다 | Saved |
| `toast.saveFailed` | 저장하지 못했습니다 | Couldn't save |
| `toast.editModeRequired` | 편집 모드에서만 저장할 수 있습니다 | Enter edit mode to save |
| `topbar.save` | 저장 | Save |
| `snapshot.kindCheckpoint` | 저장 | Saved point |
| `snapshot.tabAuto` (수정) | 기록 | Timeline |

`snapshot.tabAuto`는 값만 고친다 — 그 탭이 더 이상 자동 스냅샷만 담지 않으므로 "자동"은 거짓이 된다.

`widgets/snapshot-history/ui/SnapshotHistoryPanel.tsx:52-55`의 `kindBadge`에 `checkpoint` 분기 추가.

## 7. 검증

**백엔드** (`docker compose -p codegram exec -T backend pytest -q`)
- `checkpoint` 생성 / 같은 내용 재저장 시 새 행 없음 / 50개 상한 미적용 / `auto` 그룹 목록에 포함 / 뷰어는 403
- prune이 90일 지난 `checkpoint`를 지우고 `manual`은 안 지움
- `kind` 기본값이 `manual`이라 기존 호출부 동작 불변

**프론트 단위** (`cd frontend && npm run test:run`)
- `useDebouncedCallback.flush()` — 대기분 실행 / 대기분 없으면 무동작
- `useProjectAutosave.flush()` — 변경분 PATCH, 변경 없으면 미발사, 실패 시 reject
- `exitEditMode` — flush가 `releaseLock`보다 **먼저** 완료된다(호출 순서 단언), flush 실패 시 `editMode`가 유지된다
- `useManualSave` — Ctrl+S가 `preventDefault` + flush→스냅샷 순서, `!editable`이면 안내 토스트, 뷰어면 리스너 없음
- `toast` — 성공/실패 렌더, 자동 닫힘

**타입**: `cd frontend && npx tsc -p tsconfig.app.json --noEmit`
(루트 `npm run type-check`는 `files: []`라 no-op이다. tsbuildinfo 캐시 때문에 재실행 시 에러가 억제되므로 clean 실행할 것.)

**E2E** (`cd frontend && VITE_PROXY_TARGET=http://localhost:4000 npx playwright test <spec> --project=chromium --reporter=line`)
1. **회귀 테스트(지금은 실패해야 한다)**: 편집 모드 진입 → DBML 타이핑 → 600ms 안에 "편집 종료" → 새로고침 → 타이핑한 내용이 남아있다.
2. Ctrl+S → 토스트가 뜬다 → 버전 기록 패널의 기록 탭에 "저장" 배지 행이 추가된다.
3. 읽기 모드에서 Ctrl+S → 안내 토스트, 저장 없음.
4. Monaco 에디터에 포커스가 있을 때 Ctrl+S가 동작한다(브라우저 저장 다이얼로그가 뜨지 않는다).

## 범위 밖 (명시)

- **탭 종료·새로고침 순간의 미저장분.** `pagehide`에서 keepalive PATCH를 보내면 같은 keepalive인 `releaseLock`과 도착 순서가 보장되지 않아 반납한 락이 되살아난다. 회피하려면 ADR-0024("닫으면 즉시 반납")의 예외를 만들어야 하므로 별도 결정으로 남긴다. 노출 창은 600ms.
- 기존 인라인 에러 표시의 토스트 이관.
- 30분 job의 dedup 비교 대상 확장.
