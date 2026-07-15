# RBAC 계정 관리 + 비밀번호 초기화/변경 — 설계

- 날짜: 2026-07-15
- 관련 결정: [ADR-0016](../../adr/0016-rbac-account-management-and-password-reset.md)
- 상태: 승인됨(grill 완료), 구현 대기

## 목표

Codegram 자체 계정에 전역 RBAC(시스템 역할 admin/user + 권한 user:read/user:manage)를 도입하고, 이메일 없이 동작하는 비밀번호 초기화(관리자 발급 일회성 비번 + 강제 변경) 및 자발적 비밀번호 변경을 제공한다.

## 비목표(YAGNI)

- 역할/권한의 런타임 **생성·삭제**(역할 2개·권한 2개 고정 카탈로그, 배정만 편집).
- 이메일 발송, 리셋 링크, 실시간 세션 강제 폐기.
- 프로젝트 역할(owner/editor/viewer, ADR-0015)과의 연동/통합 — 직교 유지.
- 관리자에 의한 신규 계정 **생성** UI(회원가입은 공개 유지).

## 데이터 모델

새 테이블(정규화, 복수형):

- `roles`: `id UUID PK`, `name String uniq`(`admin`|`user`), `created_at`.
- `permissions`: `id UUID PK`, `code String uniq`(`user:read`|`user:manage`), `description String?`, `created_at`.
- `role_permissions`: `role_id FK→roles CASCADE`, `permission_id FK→permissions CASCADE`, `UNIQUE(role_id, permission_id)`.

`user` 테이블 컬럼 추가:

- `role_id UUID FK→roles ON DELETE SET NULL`(기본 = `user` 역할). 신규 가입 시 `user` 역할로 채운다(UserManager.on_after_register 또는 서비스에서).
- `must_change_password Boolean NOT NULL DEFAULT false`.

Alembic 마이그레이션(커밋):

1. 위 테이블/컬럼 생성.
2. `roles` 시드(`admin`,`user`), `permissions` 시드(`user:read`,`user:manage`), `role_permissions` 시드(admin→{read,manage}, user→{read}).
3. 기존 `user` 전부 `role_id`=`user` 역할로 백필.
4. down: 역방향 삭제.

**시드 값의 안정적 참조**: 마이그레이션 내에서 `name`/`code`로 조회해 id를 얻어 매핑(하드코딩 UUID 금지, 멱등).

## 백엔드

계층: `models` → `repositories` → `services` → `api/routes`(ADR-0007, 얇은 라우트).

### 모델/스키마
- `models/role.py`(Role), `models/permission.py`(Permission), `models/role_permission.py` 또는 association table. `models/user.py`에 `role_id`,`must_change_password` 추가.
- `schemas/`: `RoleRead`(name, permissions[]), `PermissionRead`(code), `AccountRead`(id, email, role_name), `AccountRoleUpdate`(role_name), `PasswordResetResult`(temp_password), `AdminContact`(email), `ChangePasswordRequest`(current_password?, new_password), `RolePermissionsUpdate`(permission_codes[]).

### 리포지토리
- `repositories/rbac.py`: roles/permissions/role_permissions 조회·편집, `permissions_for_user(user_id)`(role→permissions), `set_role_permissions(role_id, codes)`, `list_admin_emails()`.
- `repositories/user.py`: `set_role`, `set_password_hash + must_change_password`, `list_all`(id,email,role) 추가.

### 서비스
- `services/rbac.py`(또는 account): `list_accounts`, `change_account_role`(마지막 admin 강등 금지), `reset_account_password`(12자 랜덤 생성→해시 저장→must_change=true→평문 반환), `list_roles_with_permissions`, `update_role_permissions`(admin의 user:manage 제거 금지), `admin_contacts`, `change_own_password`(자발적=현재검증+새, 강제=새만).
- 임시 비번 생성: 혼동 문자 제외 대소문자+숫자 12자(`secrets` 사용).

### 인가
- `core/permissions.py`: `require_permission(code)` FastAPI 의존성 팩토리 — `current_active_user`로 유저를 얻고 `permissions_for_user`에 code 포함 여부 검사, 없으면 403.
- **must_change_password 게이트**: `current_active_user`를 감싼 `require_password_ok` 의존성 — `user.must_change_password`면 403(detail `{reason: "must_change_password"}`). 비밀번호 변경/로그아웃/`/me` 라우트는 이 게이트를 **적용하지 않음**. 그 외 모든 인증 라우트(projects/snapshots/introspect/edit_lock/accounts/roles…)는 `current_active_user`를 `require_password_ok`로 교체.

### 라우트
- `api/routes/admins.py`: `GET /admins` — **미인증 공개**, admin 이메일 목록.
- `api/routes/accounts.py`:
  - `GET /accounts` (require_permission user:read) — 전 계정.
  - `PATCH /accounts/{id}/role` (user:manage) — 역할 변경, 마지막 admin 강등 시 409.
  - `POST /accounts/{id}/reset-password` (user:manage) — 임시 비번 1회 반환.
- `api/routes/roles.py`:
  - `GET /roles` (user:read) — 역할+권한 매트릭스.
  - `PATCH /roles/{id}/permissions` (user:manage) — 권한 토글, admin의 user:manage 제거 시 409.
- `api/routes/account.py`: `POST /account/change-password` (인증; must_change 게이트 **제외**) — 자발적/강제 분기.

### 개발 전용 시드(비커밋 마이그레이션)
- `scripts/seed_admin.py` 또는 lifespan/CLI: `ENVIRONMENT=development`에서만 `admin@tscorp.ai`/`admin!1`(role=admin, must_change_password=true) upsert. 존재 시 skip(멱등).

## 프론트엔드 (FSD)

- `entities/account`(또는 rbac): 타입(Role, Permission, Account) + API 훅(useAccounts, useUpdateAccountRole, useResetPassword, useRoles, useUpdateRolePermissions, useAdminContacts, useChangePassword).
- `entities/session`/user: 현재 유저에 `role`,`permissions`,`must_change_password` 노출(`/me` 확장) — 프론트 권한 게이팅용.
- `pages/accounts`: `/accounts` 라우트. 계정 목록(이메일·역할; user:manage면 역할 select + 초기화 버튼 + 임시비번 표시 모달). Admin(user:manage)면 "권한 관리" 탭(역할×권한 체크박스 매트릭스, 저장). 진입은 user:read 전원.
- `widgets/app-sidebar`: "계정 관리" 진입점 추가(로그인 유저 전원; user:read 전제).
- `features/account-settings`(기존 다이얼로그): "비밀번호 변경" 섹션 추가(현재+새+확인, 최소 8자).
- `features/auth`: 로그인 화면 "비밀번호 초기화" 버튼 → 관리자 목록 + 문의 문구(useAdminContacts, 미인증 호출).
- **강제 변경 라우트 가드**: `must_change_password`면 `/force-password-change` 전용 화면으로 리다이렉트, 그 외 라우트 접근 차단. 백엔드 403(reason)도 전역 인터셉트해 이 화면으로 유도.
- i18n: `account.*`/`rbac.*` 키 ko/en 양쪽 추가.

## 엣지 케이스
- 마지막 admin 강등/비활성 → 409(가드). admin의 user:manage 제거 → 409.
- `role_id`가 NULL인 계정(유저 삭제로 역할 SET NULL은 발생 안 하나 방어): 권한 없음으로 취급.
- 초기화된 유저의 기존 세션: must_change 게이트로 차단(별도 폐기 없음).
- 미인증 `/admins`가 admin 0명일 때: 빈 목록 + 문구.

## 검증
- 백엔드 pytest: 마이그레이션 up/down + 시드, `require_permission`/`must_change` 게이트(403 매트릭스), 역할변경·초기화·강제변경·자발적변경, 자기잠금 가드(마지막 admin·admin manage), `/admins` 공개.
- 프론트 vitest + `tsc --noEmit`: 권한별 UI 노출, 강제변경 가드, 비번변경 폼.
- E2E: 계정관리 흐름(도커 프론트 headless flake 유의 — 데이터 흐름은 pytest+ASGI로 병행 증명).

## 단계 분할(구현 순서)
1. **RBAC 기반**: 테이블/컬럼/마이그레이션+시드, permissions_for_user, `require_permission`, `must_change` 게이트, `/me` 확장, CONTEXT.md 용어 갱신.
2. **계정 관리 API+페이지**: `GET /accounts`, `PATCH role`, `POST reset-password` + `/accounts` 목록/역할수정/초기화 UI + 사이드바 진입점.
3. **강제 변경 + 비번 변경**: `must_change` 강제 화면/가드, `POST /account/change-password`, 계정설정 비번변경 섹션.
4. **권한 매트릭스 + 로그인 관리자 목록**: `GET/PATCH /roles`, 매트릭스 탭, `GET /admins` + 로그인 화면 버튼.
5. **dev 시드**: admin@tscorp.ai 부트스트랩 스크립트.

각 단계는 종료 전 검증(pytest/vitest/type-check)을 통과시키고, 백엔드 모델 변경 시 마이그레이션을 포함한다(B2).
