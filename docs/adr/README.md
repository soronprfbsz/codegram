# ADR 인덱스 — Codegram

이 폴더는 Codegram의 **아키텍처 결정 기록(ADR)**이다. 결정의 *왜*를 시점별로 남기는 **불변 로그**이며, 여기 표는 그 로그를 **도메인으로 탐색**하기 위한 파생 인덱스다(진실은 각 ADR 파일 본문).

## 관리 원칙 (design-first)
- **불변 + 대체(supersession)**: 결정이 바뀌면 옛 ADR을 고치지 않고 **새 ADR로 supersede**한다(옛 것에 `Superseded-by`, 새 것에 `Supersedes` 표기). 연장이면 `Related`로 링크. 파일을 도메인 mega-file로 합치거나 번호에 계층을 넣지 않는다 — 번호는 불투명한 단조 ID다.
- **도메인은 파일 구조가 아니라 태그·이 인덱스로 묶는다.** 한 결정이 여러 도메인에 걸치면 태그를 복수로 단다(주 도메인에 배치 + 부 도메인 태그).
- **새 ADR 절차**: ① 아래 도메인 표에서 해당 도메인 기존 ADR을 통독 → amend(supersede)/extend/none 판단 → ② 신규면 다음 순번 `NNNN-kebab-title.md` 생성(헤더 컨벤션 아래) → ③ 이 인덱스에 행 추가. 초안은 `grill-with-docs` 스킬로 도메인 모델·`CONTEXT.md`에 대질하며 다듬는다.
- **판단 기준(무엇이 ADR 대상인가)**: `.claude/rules/general.md` §G6.

### 헤더 컨벤션 (신규 ADR부터)
제목 바로 아래 한 줄:
```
> **Status**: Accepted · **Tags**: `auth`, `rbac` · **Date**: 2026-07-15 · **Supersedes**: — · **Related**: ADR-0015
```
`Status` ∈ Proposed · Accepted · Superseded · Deprecated. (기존 0001~0016은 소급 적용하지 않으며, 도메인·상태는 이 인덱스가 대신한다.)

## 도메인별 (탐색·재사용 표면)

| 도메인 태그 | 라벨 | ADR |
|---|---|---|
| `data-model` | 데이터 모델·진실원천(DBML) | 0001, 0011, 0018 |
| `db-integration` | DB 연동·인트로스펙션·동기화 | 0008, 0009 |
| `rendering` | 렌더링·레이아웃·시각화 | 0003, 0004, 0010, 0012, 0018 |
| `parsing` | 파싱·변환 | 0002 |
| `export` | 내보내기·상호운용 | 0005, 0013 |
| `auth` | 인증·접근제어 | 0006, 0016 |
| `collaboration` | 협업·버전관리 | 0014, 0015 |
| `architecture` | 코드베이스 구조 | 0007, 0017, 0019 |
| `frontend` | 프론트엔드 횡단(국제화·디자인토큰 등) | 0017, 0020 |
| `deployment` | 배포·CI/CD·인프라 | 0019 |

## 시간순 (전체 로그)

| # | 제목 | 태그 | 상태·관계 |
|---|---|---|---|
| [0001](0001-dbml-text-as-source-of-truth.md) | DBML 텍스트를 구조의 단일 진실 공급원으로 삼는다 | `data-model` | Accepted |
| [0002](0002-frontend-dbml-parsing.md) | DBML 파싱은 프론트엔드에서 공식 @dbml/core로 수행 | `parsing` | Accepted |
| [0003](0003-react-flow-rendering-engine.md) | ERD 캔버스 렌더링 엔진 = React Flow v12 | `rendering` | Accepted |
| [0004](0004-layout-reconciliation-by-name.md) | Layout은 이름 기반 키로 보존(이름 변경 시 위치 손실 허용) | `rendering`, `data-model` | Accepted |
| [0005](0005-client-side-export.md) | 모든 출력은 클라이언트 사이드에서 생성 | `export` | Accepted |
| [0006](0006-multiuser-backend-auth-persistence.md) | 다중 사용자 백엔드 · JWT · PostgreSQL/JSONB · 공유 없음 | `auth`, `architecture` | Accepted · 전제 일부 대체: 0015(공유), 0016(권한) |
| [0007](0007-codebase-architecture.md) | 프론트 FSD + 백엔드 계층형 클린 아키텍처 | `architecture` | Accepted |
| [0008](0008-db-introspection-backend-reflection.md) | DB 인트로스펙션: 백엔드 reflection→DDL, 접속정보 1회용 | `db-integration` | Accepted |
| [0009](0009-db-sync-replace-and-place.md) | DB 동기화: 전체 교체 + 이름 기반 Layout 보존 + 신규 빈공간 배치 | `db-integration`, `rendering` | Accepted |
| [0010](0010-grid-packing-auto-layout.md) | 자동 배치: 균형 그리드 패킹(그룹별 내부 그리드 + 메타배치) | `rendering` | Accepted · 2026-06-12 개정 |
| [0011](0011-panel-edits-rewrite-dbml-text-surgically.md) | 패널 구조 편집은 DBML 텍스트를 국소 수술로 고침 | `data-model` | Accepted |
| [0012](0012-manual-edge-paths-in-layout.md) | 관계선 수동 경로를 Layout에 절대좌표 꺾임점으로 저장 | `rendering` | Accepted |
| [0013](0013-export-split-by-data-dependency.md) | Export를 데이터 의존성으로 분리(Diagram=에디터, Doc·SQL=프로젝트) | `export` | Accepted |
| [0014](0014-project-snapshot-history.md) | 프로젝트 스냅샷 히스토리 = 전체 복사본 2단 인프로세스 스케줄러 | `collaboration` | Accepted |
| [0015](0015-collaboration-async-shared-editing.md) | 협업 = 비동기 공유접근 + 비관적 편집 락(실시간 동시편집 보류) | `collaboration`, `auth` | Accepted · Related: 0006 |
| [0016](0016-rbac-account-management-and-password-reset.md) | 전역 RBAC(admin/user) + 관리자 발급 일회성 비번 + 강제 변경 | `auth` | Accepted · Related: 0015, 0006 |
| [0017](0017-i18n-react-i18next.md) | 사용자 문자열은 react-i18next ko/en 단일 출처로 국제화 | `architecture`, `frontend` | Accepted · Related: 0007 |
| [0018](0018-table-groups-in-dbml.md) | 테이블 그룹은 DBML TableGroup에 진실, 편집은 텍스트 국소 수술 | `data-model`, `rendering` | Accepted · Related: 0001, 0010, 0011 |
| [0019](0019-deployment-compose-gitlab-ci.md) | 배포 = docker compose 3-파일 + GitLab CI 경로선택 재배포 | `deployment`, `architecture` | Accepted · Related: 0006, 0007 |
| [0020](0020-design-token-only-styling.md) | 시각 스타일은 디자인 토큰으로만 + raw 하드코딩 금지(타이포 스케일 토큰화) | `frontend`, `architecture` | Accepted · Related: 0007, 0017 |
