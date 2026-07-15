# RBAC 계정 관리 + 비밀번호 초기화/변경 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Codegram 자체 계정에 전역 RBAC(시스템 역할 admin/user + 권한 user:read/user:manage)와 이메일 없는 비밀번호 초기화(관리자 발급 일회성 비번 + 강제 변경)·자발적 비번 변경을 추가한다.

**Architecture:** 정규화 RBAC 테이블(`roles`/`permissions`/`role_permissions`) + `user.role_id`/`user.must_change_password`. 백엔드는 `require_permission(code)`와 `require_password_ok` 의존성으로 인가, 프론트는 `/accounts` 페이지·계정설정 비번변경·강제변경 가드·로그인 관리자목록으로 소비. 프로젝트 역할(ADR-0015)과 직교.

**Tech Stack:** FastAPI + SQLAlchemy(async) + Alembic + fastapi-users, React + Vite + TS + react-query + react-router, 테스트 pytest/vitest/playwright.

## Global Constraints

- 관련 결정: ADR-0016. 설계: `docs/superpowers/specs/2026-07-15-rbac-account-management-design.md`.
- 계층(ADR-0007): route(얇게) → service → repository → model. 라우트에서 ORM 직접 금지.
- 모델 변경 시 Alembic 마이그레이션 필수(up/down), 테스트 DB는 `Base.metadata.create_all`(모델만으로 반영).
- 사용자 노출 문자열은 react-i18next `t()` + `ko.json`/`en.json` 양쪽(F4). UI는 공용 토큰/컴포넌트(F1).
- 시스템 역할 값 `admin`,`user`; 권한 코드 `user:read`,`user:manage`(고정 카탈로그, 신규 생성 없음).
- admin 부트스트랩 `admin@tscorp.ai`/`admin!1`는 **커밋 마이그레이션 금지 → dev 전용 시드**, `must_change_password=true`.
- 자기잠금 가드: admin 역할의 `user:manage` 제거 금지, 마지막 admin 계정 강등 금지.
- 임시 비번: `secrets`로 혼동문자 제외 대소문자+숫자 12자. 새 비번 최소 8자.
- 테스트 실행(도커, 리포 루트에서):
  - 백엔드: `docker compose --project-directory . -f deploy/docker-compose.yml -f deploy/docker-compose.override.yml --env-file .env exec -T backend pytest -q`
  - 마이그레이션: `… exec -T backend alembic upgrade head` / `alembic downgrade -1`
  - 프론트(호스트, `frontend/`): `npm run type-check`, `npm run test:run`
- 커밋은 각 Task 끝에서. 무관한 사전존재 파일(table-groups.spec.ts, GroupSection.tsx) 건드리지 않음.

---

## Phase 1 — RBAC 기반 (데이터모델·시드·인가·/me)

### Task 1: RBAC 모델 + 마이그레이션 + 시드

**Files:**
- Create: `backend/app/models/role.py`, `backend/app/models/permission.py`, `backend/app/models/role_permission.py`
- Modify: `backend/app/models/user.py` (role_id, must_change_password), `backend/app/db/base.py`(신규 모델 import 등록 — 기존 패턴 확인)
- Create: `backend/alembic/versions/<rev>_add_rbac.py`
- Test: `backend/tests/test_rbac_model.py`, `backend/tests/test_rbac_migration_seed.py`

**Interfaces:**
- Produces: `Role(id, name)`, `Permission(id, code, description)`, `role_permissions` assoc; `User.role_id: UUID|None`, `User.must_change_password: bool`. 시드 역할 `admin`/`user`, 권한 `user:read`/`user:manage`.

- [ ] **Step 1: 모델 컬럼 테스트(실패)** — `test_rbac_model.py`: `Role.__table__.columns` == {id,name,created_at}; `Permission` == {id,code,description,created_at}; `User` 컬럼에 `role_id`,`must_change_password` 포함; `role_permissions` 테이블 존재 + UNIQUE(role_id,permission_id).
- [ ] **Step 2: 실패 확인** — `pytest tests/test_rbac_model.py -q` → 모듈/컬럼 없음으로 FAIL.
- [ ] **Step 3: 모델 구현** — `models/project.py`의 `Mapped`/`mapped_column`·GUID 패턴을 그대로 따른다.

```python
# models/role.py
import uuid
from datetime import datetime, timezone
from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base

class Role(Base):
    __tablename__ = "roles"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
        server_default=func.now(), nullable=False)
```

```python
# models/permission.py — same shape: code String(64) unique, description String(255) nullable
```

```python
# models/role_permission.py
import uuid
from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base

class RolePermission(Base):
    __tablename__ = "role_permissions"
    __table_args__ = (UniqueConstraint("role_id", "permission_id", name="uq_role_permission"),)
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    role_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("roles.id", ondelete="CASCADE"), nullable=False, index=True)
    permission_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("permissions.id", ondelete="CASCADE"), nullable=False, index=True)
```

```python
# models/user.py — add on the User class body
    role_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("roles.id", ondelete="SET NULL"), nullable=True, default=None)
    must_change_password: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false"))
```
(User는 fastapi-users base라 `Mapped`/`mapped_column` import + `ForeignKey`,`Boolean`,`text` import 추가; base가 `__tablename__="user"`.)
`db/base.py`(또는 모델 등록 모듈)에서 신규 모델을 import해 metadata에 등록(기존 project_snapshot 등록 방식 확인).

- [ ] **Step 4: 통과 확인** — `pytest tests/test_rbac_model.py -q` → PASS.
- [ ] **Step 5: 마이그레이션 작성** — `alembic revision`은 offline로 파일 직접 작성(기존 `d1e2f3a4b5c6` 스타일). down_revision = 현재 head(`ee01192` 시점 head는 `d1e2f3a4b5c6`; 실제 `alembic heads`로 확인). upgrade: create_table roles/permissions/role_permissions(+FK,인덱스,UNIQUE), add_column user.role_id/must_change_password. **시드**: `op.bulk_insert` 또는 `op.execute`로 roles(admin,user)/permissions(user:read,user:manage) 삽입 후 `SELECT`로 id 조회해 role_permissions(admin→2, user→read) 삽입, 그리고 `UPDATE "user" SET role_id=(user 역할 id) WHERE role_id IS NULL`. (마이그레이션 내 조회는 `op.get_bind()` + `sa.text`.) downgrade: 컬럼/테이블 역순 삭제.
- [ ] **Step 6: 시드 검증 테스트(실패→통과)** — `test_rbac_migration_seed.py`는 create_all 기반이라 시드가 없다 → 대신 **시드 헬퍼를 서비스/리포에 두고**(Task 2의 `ensure_rbac_seed`) 그걸 호출해 검증. 여기서는 마이그레이션 up/down은 도커에서 수동 검증(아래 명령)으로 대체하고, 단위 시드 검증은 Task 2로 넘긴다.
- [ ] **Step 7: 마이그레이션 up/down 검증(도커)** — `… exec -T backend alembic upgrade head` 성공 로그 확인 → `alembic downgrade -1` → `alembic upgrade head`. psql로 roles 2행·permissions 2행·기존 user role_id 채워짐 확인.
- [ ] **Step 8: 커밋** — `git add backend/app/models backend/app/db/base.py backend/alembic/versions/<rev>_add_rbac.py backend/tests/test_rbac_model.py && git commit -m "feat(rbac): roles/permissions/role_permissions 테이블 + user.role_id/must_change_password (+마이그레이션·시드)"`

### Task 2: RBAC 리포지토리 + 시드 헬퍼 + permissions_for_user

**Files:**
- Create: `backend/app/repositories/rbac.py`
- Modify: `backend/app/repositories/user.py` (set_role, set_password, list_all)
- Test: `backend/tests/test_rbac_repo.py`

**Interfaces:**
- Produces: `RbacRepository.ensure_seed()`(멱등 시드; 테스트 create_all용), `.permissions_for_user(user_id)->set[str]`, `.role_by_name(name)`, `.list_roles_with_permissions()->list[(Role, list[str])]`, `.set_role_permissions(role_id, codes)`, `.list_admin_emails()->list[str]`, `.count_admins()`. `UserRepository.set_role(user, role_id)`, `.set_password_hash(user, hash, must_change)`, `.list_all()->list[User]`.

- [ ] **Step 1: 실패 테스트** — `ensure_seed()` 후 `permissions_for_user`(admin→{read,manage}, user→{read}), `list_admin_emails`, `count_admins`, `set_role_permissions`가 매핑을 바꾸는지.
- [ ] **Step 2: 실패 확인** — `pytest tests/test_rbac_repo.py -q`.
- [ ] **Step 3: 구현** — `repositories/project_snapshot.py`의 async 세션·`select`·`flush` 패턴을 따른다. `ensure_seed`는 존재하면 skip. `permissions_for_user`는 user.role_id → role_permissions join permissions.code.
- [ ] **Step 4: 통과 확인.**
- [ ] **Step 5: 커밋** — `git commit -m "feat(rbac): RbacRepository(시드·권한조회·매트릭스) + UserRepository 확장"`

### Task 3: 인가 의존성 (require_permission, require_password_ok) + /me 확장

**Files:**
- Create: `backend/app/core/permissions.py`
- Modify: `backend/app/schemas/user.py` (UserRead에 role_name, permissions, must_change_password), `backend/app/core/users.py`(on_after_register에서 user 역할 배정)
- Test: `backend/tests/test_authz.py`

**Interfaces:**
- Produces: `require_permission(code: str) -> Depends`(403 if 미보유), `require_password_ok = Depends`(must_change면 403 `{reason:"must_change_password"}`), `UserRead`+role/permissions/must_change_password.

- [ ] **Step 1: 실패 테스트** — 더미 라우트 2개(하나 `require_permission("user:manage")`, 하나 `require_password_ok`)에 대해: user 역할이 manage 없어 403, admin은 200; must_change=true면 password_ok 라우트 403(reason).
- [ ] **Step 2: 실패 확인.**
- [ ] **Step 3: 구현.**

```python
# core/permissions.py
from fastapi import Depends, HTTPException, status
from app.core.users import current_active_user
from app.models.user import User
from app.repositories.rbac import RbacRepository
from app.db.session import get_session

def require_permission(code: str):
    async def dep(user: User = Depends(current_active_user), session = Depends(get_session)) -> User:
        perms = await RbacRepository(session).permissions_for_user(user.id)
        if code not in perms:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Forbidden")
        return user
    return dep

async def require_password_ok(user: User = Depends(current_active_user)) -> User:
    if user.must_change_password:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail={"reason": "must_change_password"})
    return user
```

`on_after_register`(core/users.py)에서 신규 유저에 `user` 역할 배정: `await RbacRepository(session).role_by_name("user")` → `user.role_id=...`. (UserManager가 세션 접근 가능한지 확인; 안 되면 register 라우트 래핑 또는 이벤트에서 세션 주입.)
`UserRead`에 `role_name: str|None`, `permissions: list[str]`, `must_change_password: bool` 추가; `/me`(users_router의 GET /users/me) 응답이 이를 포함하도록 커스텀 `GET /account/me` 라우트를 두거나 UserRead 확장(fastapi-users users_router가 UserRead를 쓰므로 확장만으로 반영되나, role/permissions는 계산 필드라 라우트에서 조립 필요 → 전용 `GET /account/me` 권장).

- [ ] **Step 4: 통과 확인.**
- [ ] **Step 5: 기존 인증 라우트 게이트 적용** — projects/snapshots/introspect/edit_lock의 `current_active_user`를 콘텐츠/일반 경로에서 `require_password_ok`로 교체(로그아웃/`/account/me`/비번변경 제외). 기존 테스트가 must_change=false 기본이라 그대로 통과해야 함 → 전체 pytest 재실행.
- [ ] **Step 6: 커밋** — `git commit -m "feat(rbac): require_permission/require_password_ok 인가 의존성 + /account/me 권한 노출 + 기존 라우트 게이트"`

### Task 4: CONTEXT.md 용어 갱신

**Files:** Modify `CONTEXT.md`
- [ ] **Step 1:** 프로젝트 "역할" 정의 유지. "시스템 역할(System Role: admin/user)"·"권한(Permission: user:read/user:manage)" 항목 추가. 기존 _Avoid_(관리자·퍼미션)를 "프로젝트 역할 문맥 한정"으로 명시 수정. ADR-0016 링크.
- [ ] **Step 2: 커밋** — `git commit -m "docs(context): 시스템 역할·권한 용어 추가(ADR-0016)"`

---

## Phase 2 — 계정 관리 API + 페이지

### Task 5: 계정 서비스 + 라우트 (목록·역할변경·초기화)

**Files:**
- Create: `backend/app/services/account.py`, `backend/app/api/routes/accounts.py`, `backend/app/schemas/account.py`
- Modify: `backend/app/main.py`(라우터 등록)
- Test: `backend/tests/test_accounts.py`

**Interfaces:**
- Produces: `GET /accounts`(user:read)→`list[AccountRead{id,email,role_name}]`; `PATCH /accounts/{id}/role`(user:manage, body `{role_name}`)→AccountRead, 마지막 admin 강등 시 409 `{reason:"last_admin"}`; `POST /accounts/{id}/reset-password`(user:manage)→`{temp_password}`. `AccountService.change_role`, `.reset_password`(secrets 12자→해시(fastapi-users password helper)→set_password_hash(must_change=true)).

- [ ] **Step 1: 실패 테스트(서비스+라우트)** — admin이 목록 조회 200/유저는 목록 200(user:read)·역할변경 403; admin이 user→admin 변경; 마지막 admin을 user로 강등 시 409; reset-password가 12자 반환 + 대상 user.must_change_password=true + 새 해시로 로그인 가능.
- [ ] **Step 2: 실패 확인.**
- [ ] **Step 3: 구현** — 라우트는 `Depends(require_permission("..."))`. 비번 해시는 fastapi-users의 `PasswordHelper().hash(pw)` 사용(core/users.py에서 헬퍼 확인). `change_role`은 `count_admins`로 마지막 admin 강등 방지.
- [ ] **Step 4: 통과 확인 + 전체 pytest.**
- [ ] **Step 5: 커밋** — `git commit -m "feat(accounts): 계정 목록·역할변경·비밀번호 초기화 API"`

### Task 6: 프론트 계정 관리 페이지 + 사이드바 진입점

**Files:**
- Create: `frontend/src/entities/account/*`(types, api 훅), `frontend/src/pages/accounts/index.tsx`
- Modify: `frontend/src/app/providers/router.tsx`(/accounts), `frontend/src/widgets/app-sidebar/ui/AppSidebar.tsx`(진입점), `frontend/src/shared/i18n/locales/{ko,en}.json`
- Test: `frontend/src/pages/accounts/index.test.tsx`(vitest + MSW)

**Interfaces:**
- Consumes: `GET/PATCH /accounts*`. Produces: `/accounts` 라우트, `useAccounts`,`useUpdateAccountRole`,`useResetPassword` 훅.

- [ ] **Step 1: 실패 테스트** — MSW로 /accounts 목킹; 목록 렌더, user:manage 있으면 역할 select+초기화 버튼 노출·없으면 미노출, 초기화 클릭 시 임시비번 모달 표시.
- [ ] **Step 2: 실패 확인** — `npm run test:run`.
- [ ] **Step 3: 구현** — 훅은 `entities/snapshot/api/*` 패턴. 페이지 UI는 공용 컴포넌트(Button 등, F1). 임시비번은 복사 가능한 1회 모달. 사이드바 진입점은 기존 nav row 패턴(F3: widget→shared만).
- [ ] **Step 4: 통과 확인 + `npm run type-check`.**
- [ ] **Step 5: 커밋** — `git commit -m "feat(accounts): 계정 관리 페이지(목록·역할수정·초기화) + 사이드바 진입점"`

---

## Phase 3 — 강제 변경 + 비밀번호 변경

### Task 7: 비밀번호 변경 API (자발적/강제)

**Files:** Create `backend/app/api/routes/account.py`, add to `services/account.py`; Test `backend/tests/test_change_password.py`
**Interfaces:** `POST /account/change-password`(인증, must_change 게이트 **제외**) body `{current_password?, new_password}`. 자발적(must_change=false)=현재 검증 필수; 강제(true)=현재 생략, 성공 시 must_change=false. 최소 8자 → 400.

- [ ] **Step 1: 실패 테스트** — 자발적: 잘못된 current→400/401, 올바르면 200+새 비번 로그인; 강제 상태: current 없이 new만으로 200 + must_change=false + 이후 다른 API 200. 8자 미만 400.
- [ ] **Step 2: 실패 확인.**
- [ ] **Step 3: 구현** — 현재 비번 검증은 PasswordHelper.verify. 라우트는 `Depends(current_active_user)`(password_ok 게이트 미적용).
- [ ] **Step 4: 통과 확인 + 전체 pytest.**
- [ ] **Step 5: 커밋** — `git commit -m "feat(account): 비밀번호 변경 API(자발적=현재검증, 강제=새만)"`

### Task 8: 프론트 강제변경 가드 + 계정설정 비번변경

**Files:** Modify `router.tsx`(force-change 가드), Create `pages/force-password-change`, Modify `features/account-settings/ui/AccountSettingsDialog.tsx`, `shared/api/client`(403 reason 인터셉트), i18n. Test: vitest for the change-password form + guard.
**Interfaces:** Consumes `POST /account/change-password`, `/account/me`(must_change_password). Produces `/force-password-change` 라우트 + 전역 403-reason 리다이렉트.

- [ ] **Step 1: 실패 테스트** — must_change_password=true인 세션이면 어떤 보호 라우트로 가도 force-change로 리다이렉트; 폼 제출 성공 시 원래 흐름 복귀. 계정설정 비번변경 폼(현재+새+확인, 8자, 불일치 검증).
- [ ] **Step 2: 실패 확인.**
- [ ] **Step 3: 구현** — API client에서 403 & detail.reason==="must_change_password" 감지 시 force-change로 유도(기존 editLock bumped 처리 패턴 참고). 계정설정은 기존 다이얼로그에 섹션 추가(F1 공용 입력).
- [ ] **Step 4: 통과 + type-check.**
- [ ] **Step 5: 커밋** — `git commit -m "feat(account): 강제 비번변경 가드 + 계정설정 비밀번호 변경 섹션"`

---

## Phase 4 — 권한 매트릭스 + 로그인 관리자 목록

### Task 9: 역할·권한 매트릭스 API

**Files:** Create `backend/app/api/routes/roles.py`, `schemas` 확장; add to `services/account.py` or new `services/rbac.py`. Test `backend/tests/test_roles.py`.
**Interfaces:** `GET /roles`(user:read)→`list[RoleRead{name, permissions:[code]}]`; `PATCH /roles/{id}/permissions`(user:manage) body `{permission_codes}` → admin의 user:manage 제거 시 409 `{reason:"admin_manage_required"}`.

- [ ] **Step 1: 실패 테스트** — 조회(user:read) 200/매트릭스 정확; user 역할에 user:manage 추가 후 그 user가 관리 가능; admin에서 user:manage 제거 시 409.
- [ ] **Step 2~4:** 실패확인→구현(set_role_permissions + admin manage 가드)→통과+전체 pytest.
- [ ] **Step 5: 커밋** — `git commit -m "feat(rbac): 역할·권한 매트릭스 조회/편집 API(자기잠금 가드)"`

### Task 10: 관리자 목록 공개 API + 로그인 화면 버튼

**Files:** Create `backend/app/api/routes/admins.py`(미인증); Test `backend/tests/test_admins_public.py`. 프론트: `features/auth`(비번초기화 버튼+관리자목록), i18n.
**Interfaces:** `GET /admins`(미인증 공개)→`list[{email}]`.

- [ ] **Step 1: 실패 테스트(백엔드)** — 인증 없이 200 + admin 이메일만 포함(비-admin 제외); admin 0명이면 빈 목록.
- [ ] **Step 2~4:** 실패확인→구현(라우터에 인증 의존성 없음)→통과.
- [ ] **Step 5(프론트):** 로그인/비번초기화 화면에 버튼→관리자 목록+문의 문구(useAdminContacts, 미인증 fetch), vitest.
- [ ] **Step 6: 커밋** — `git commit -m "feat(auth): 미인증 관리자 목록 API + 로그인 화면 비밀번호 초기화 안내"`

### Task 11: 프론트 권한 매트릭스 탭

**Files:** Modify `pages/accounts/index.tsx`(Admin 전용 탭), Create `entities/account` 매트릭스 훅(useRoles,useUpdateRolePermissions), i18n. Test vitest.
- [ ] **Step 1: 실패 테스트** — user:manage면 매트릭스 탭 노출·체크박스 토글·저장; 아니면 탭 미노출.
- [ ] **Step 2~4:** 실패확인→구현→통과+type-check.
- [ ] **Step 5: 커밋** — `git commit -m "feat(accounts): 권한 관리 매트릭스 탭(Admin 전용)"`

---

## Phase 5 — dev 전용 admin 시드

### Task 12: admin 부트스트랩 시드(개발 전용)

**Files:** Create `backend/app/scripts/seed_admin.py` (또는 `jobs`/CLI). Test `backend/tests/test_seed_admin.py`.
**Interfaces:** `seed_admin(session)` — `ENVIRONMENT=="development"`일 때만 `admin@tscorp.ai`/`admin!1`(role=admin, must_change_password=true) upsert; 존재 시 skip. **커밋 마이그레이션 아님.**

- [ ] **Step 1: 실패 테스트** — dev에서 실행 시 admin 계정 생성(role=admin, must_change=true, 비번 검증 통과); 재실행 멱등(중복 없음); production 환경이면 no-op.
- [ ] **Step 2~4:** 실패확인→구현(settings.environment 게이트)→통과.
- [ ] **Step 5: dev 실행** — 도커 dev에서 `… exec -T backend python -m app.scripts.seed_admin` 실행 후 admin@tscorp.ai / admin!1 로그인→강제변경 화면 확인.
- [ ] **Step 6: 커밋** — `git commit -m "chore(rbac): 개발 전용 admin 부트스트랩 시드(강제변경)"`

---

## Self-Review 결과
- **스펙 커버리지**: 데이터모델(T1) / 인가·게이트(T3) / 계정목록·역할·초기화(T5,T6) / 강제·자발 비번변경(T7,T8) / 매트릭스(T9,T11) / 관리자목록·로그인(T10) / dev 시드(T12) / 용어(T4) — 스펙 각 절 대응.
- **플레이스홀더**: 코드가 필요한 novel 지점(모델·인가 의존성)은 코드 제시. CRUD/훅은 기존 파일 패턴을 템플릿으로 지시(경로 명시) — 실행자가 참조할 파일을 정확히 가리킴.
- **타입 일관성**: `permissions_for_user→set[str]`, `require_permission(code)`, `require_password_ok`, `must_change_password`, 라우트/스키마 명칭을 전 Task에서 통일.

## Execution Handoff
구현은 단계 순서(Phase 1→5)대로. 각 Task는 TDD + 종료 전 검증 통과 + 커밋. 백엔드는 도커 pytest, 프론트는 호스트 vitest/type-check. E2E는 계정관리 흐름에 추가하되 도커 프론트 headless flake(생성 후 목록 리페치) 유의 — 데이터 흐름은 pytest+ASGI로 병행 증명.
