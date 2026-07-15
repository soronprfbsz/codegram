# 계정 관리는 전역 시스템 역할(admin/user) 기반 RBAC로 하고, 비밀번호 초기화는 관리자 발급 일회성 비번 + 강제 변경으로 한다

Codegram 자체 계정에 **전역(앱 단위) 접근 제어**를 도입한다. 지금까지 Codegram의 인증은 fastapi-users 기본(누구나 가입, 모두 동등)이었고, 유일한 권한 개념은 **프로젝트 단위 역할**(owner/editor/viewer, ADR-0015)뿐이었다. 이제 계정 자체를 관리(목록 조회·역할 변경·비밀번호 초기화)하는 기능이 필요하며, 이를 위해 **시스템 역할(admin/user) + 권한(permission)** 기반 RBAC를 정규화 테이블로 둔다.

또한 **이메일 발송 인프라 없이** 비밀번호 분실을 복구하기 위해, 관리자가 대상 계정의 비밀번호를 **일회성 임시 비번**으로 초기화하고 사용자가 **강제 변경**으로 새 비번을 설정하는 흐름을 채택한다.

이는 `CONTEXT.md`가 "역할=프로젝트 스코프", _Avoid_에 "관리자·퍼미션"으로 명시했던 유비쿼터스 언어를 확장하는 결정이라 기록한다(ADR-0015가 "공유는 범위 밖" 전제를 바꾼 것과 같은 성격).

## Considered Options

### RBAC 데이터 모델

- **정규화 테이블 `roles`/`permissions`/`role_permissions` + `user.role_id` (채택)**: 표준 RBAC 형태. 권한을 데이터로 두어 "역할↔권한 매트릭스 편집" 메뉴를 실제 데이터 기반으로 구현할 수 있고, 향후 역할·권한 확장 시 스키마 변경 없이 흡수한다. 초기 카탈로그는 역할 2개(`admin`,`user`)·권한 2개(`user:read`,`user:manage`)로 시드한다.
- **정적 role enum 컬럼 + 코드 상수 매핑 (기각)**: 2역할·2권한 고정엔 가장 단순하나, 사용자가 요구한 "퍼미션 수정 메뉴"(런타임 편집)를 만족하지 못한다. 권한이 코드 상수라 편집 불가.
- **`is_superuser` 재사용 (기각)**: 이미 있는 boolean이라 테이블 0개지만, role/permission 개념을 명시적으로 표현하지 못해 계정관리·권한관리 화면의 의미를 담을 수 없다.

### 계정당 역할 수

- **정확히 1개 (`user.role_id` FK) (채택)**: UX가 "계정의 역할 수정"(단수)이고 역할이 2종 고정이라 `user_roles` 조인 없이 단일 FK로 충분·단순. `roles`/`permissions`/`role_permissions`는 여전히 정규화 유지.
- **다대다 `user_roles` (기각)**: NIST RBAC 표준엔 가깝지만 고정 2역할엔 권한 합산 로직·조인만 늘 뿐 실익이 없다.

### 비밀번호 초기화 전달 방식

- **관리자 발급 일회성 임시 비번(평문 1회 노출) + `must_change_password` 강제 (채택)**: 관리자가 계정관리에서 대상 유저를 초기화하면 12자 랜덤 임시 비번이 생성되어 해시로 저장되고 `must_change_password=true`가 된다. 평문 임시 비번은 응답으로 **1회만** 관리자 화면에 노출되고, 관리자가 오프라인으로 사용자에게 전달한다. 사용자는 임시 비번으로 로그인 후 강제 변경 화면에서 새 비번을 설정한다. 이메일 인프라가 없다는 제약을 그대로 수용하는 흐름.
- **이메일 리셋 링크(fastapi-users 기본) (기각)**: 표준이지만 발송 인프라(SMTP 등)가 없어 동작 불가 — 사용자 요구가 "이메일 없이".

### `must_change_password` 강제 위치

- **백엔드 강제 (채택)**: 임시 비번 상태 사용자는 로그인은 되지만 **비밀번호 변경·로그아웃·본인 조회(`/me`)를 제외한 모든 인증 API가 403**(reason: `must_change_password`)으로 거부된다. 프론트는 이 403을 가로채 강제 변경 화면으로 유도한다. 임시 비번은 "반쪽 인증"이므로 프론트 우회를 원천 차단한다.
- **프론트 게이팅만 (기각)**: 로그인 후 리다이렉트만으론 임시 비번으로 발급된 토큰이 모든 API를 호출할 수 있어 우회 가능.

### 로그인 화면 관리자 안내

- **미인증 공개 엔드포인트가 admin 이메일 전체 반환 (채택)**: 로그인 화면 "비밀번호 초기화" 버튼이 현재 `admin` 역할 계정의 이메일 목록 + "담당자에게 문의" 문구를 보여준다. 사내 전용 도구라 노출 위험이 제한적이고, "누구에게 문의할지"를 알려주는 UX상 실이메일이 필요하다. 응답은 이메일만으로 최소화한다.
- **고정 안내 문구/이메일 마스킹 (기각)**: 노출은 줄지만 "관리자 목록·문의 대상" 요구를 만족하지 못하거나 UX가 약해진다.

### admin 부트스트랩 계정

- **개발 전용 시드 + `must_change_password=true` (채택)**: `admin@tscorp.ai`/`admin!1`(role=admin)은 **커밋 마이그레이션이 아니라 개발 전용 시드**(ENVIRONMENT 게이트/수동 실행)로 만든다. 알려진 약한 비번은 `must_change_password=true`로 최초 1회 부트스트랩용에 그친다.
- **커밋 마이그레이션에 포함 (기각)**: 마이그레이션은 prod에서도 실행되므로 알려진 관리자 계정이 운영 환경에 자동 생성되고 비번이 git 이력에 영구 잔존 — 심각한 취약점.

### 초기화·역할변경 시 기존 세션

- **별도 토큰 폐기 없이 `must_change_password` 게이트로 차단 (채택)**: Codegram 자체 인증은 JWT 쿠키(무상태)라 강제 폐기 수단이 없다. 초기화된 대상 유저가 기존 유효 토큰을 갖고 있어도, 백엔드 강제 게이트가 변경 전까지 모든 API를 막으므로 사실상 즉시 차단된다.

### 용어(유비쿼터스 언어)

- **프로젝트 "역할"과 구분되는 "시스템 역할·권한" 신설 (채택)**: 기존 "역할(Role)"=프로젝트 멤버십(owner/editor/viewer)은 유지하고, 전역 개념은 **시스템 역할(System Role, admin/user)**·**권한(Permission, user:read/user:manage)**으로 명명한다. `CONTEXT.md`의 _Avoid_(관리자·퍼미션 금지)는 "프로젝트 역할 문맥 한정"으로 범위를 축소한다. 테이블명은 표준 복수형 `roles`/`permissions`/`role_permissions`.

## Consequences

- 새 테이블 `roles`(id, name uniq), `permissions`(id, code uniq), `role_permissions`(role_id FK, permission_id FK, UNIQUE)와 `user.role_id`(FK→roles, SET NULL/기본 user), `user.must_change_password`(bool, 기본 false) 컬럼, 대응 Alembic 마이그레이션이 추가된다. 마이그레이션은 역할·권한·매핑을 시드하고 **기존 dev 계정 전부를 `user`로 매핑**한다.
- `admin@tscorp.ai` 부트스트랩은 **커밋 마이그레이션에 넣지 않고** 개발 전용 시드로만 생성한다(`must_change_password=true`).
- 인가는 "인증됨"에서 "권한 검사"로 확장된다. `require_permission("user:manage")` 류 의존성이 user→role→permissions를 로드해 판정한다. `must_change_password=true`면 변경/로그아웃/`/me` 외 전 인증 경로가 403.
- 신규 API: `GET /admins`(미인증 공개), `GET /accounts`(user:read), `PATCH /accounts/{id}/role`(user:manage, 마지막 admin 강등 금지), `POST /accounts/{id}/reset-password`(user:manage), `GET /roles`·`PATCH /roles/{id}/permissions`(조회 user:read/편집 user:manage, admin의 user:manage 제거 금지), `POST /account/change-password`(인증; 자발적=현재+새, 강제=새만, 최소 8자).
- 회원가입은 **공개 유지**하되 신규 계정 기본 역할=`user`.
- 자기잠금(self-lockout) 가드: admin 역할에서 `user:manage`를 제거하지 못하고, 마지막 admin 계정의 역할을 강등하지 못한다.
- 프론트: 사이드바 "계정 관리" 진입점(전원 노출), `/accounts` 페이지(계정 목록 + Admin 전용 "권한 관리" 매트릭스 탭), 계정 설정 다이얼로그의 비밀번호 변경 섹션, `must_change_password` 강제 변경 라우트 가드, 로그인 화면 "비밀번호 초기화"→관리자 목록. i18n ko/en.
- `CONTEXT.md`의 도메인 언어에 "시스템 역할·권한"을 추가하고 _Avoid_를 프로젝트 역할 문맥으로 한정한다.
- 프로젝트 역할(ADR-0015)과 시스템 역할은 **직교**한다: 프로젝트 접근은 여전히 owner/editor/viewer로, 계정 관리는 시스템 역할로 판정한다. 서로 참조하지 않는다.
