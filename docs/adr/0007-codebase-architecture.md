# 코드베이스 구조: 프론트 FSD + shadcn, 백엔드 계층형 클린 아키텍처(SQLAlchemy)

프론트엔드는 **Feature-Sliced Design(FSD)** 레이어(app · pages · widgets · features · entities · shared)로 구성하고 UI는 **shadcn**(프리셋 `b1FlFygMM`)을 사용한다. 백엔드는 **클린 아키텍처**로 `router`(API 진입점) / `service`(비즈니스 로직) / `schema`(Pydantic DTO) 계층을 분리하고, ORM은 **SQLAlchemy 2.0**을 사용한다(SQLModel 대신).

## 배치 가이드(개요)

- **프론트(FSD)**: ERD 캔버스·DBML 에디터·출력은 `features`/`widgets`로, Project·테이블 모델은 `entities`로, React Flow 래퍼·`@dbml/core` 어댑터·shadcn UI·API 클라이언트는 `shared`로.
- **백엔드(계층)**: `router`(FastAPI 라우트·인증 의존성) → `service`(프로젝트 CRUD·소유권 검사) → `schema`(요청/응답 DTO). SQLAlchemy `models`와 데이터 접근(`repository`)을 service 아래에 두어 service가 ORM 세부에 직접 의존하지 않도록 한다.

## Considered Options

- **FSD + 클린 아키텍처 (채택)**: 기능 경계가 명확하고 AI·신규 인원 탐색성↑, 계층 간 의존 방향이 단방향으로 통제됨.
- **플랫/관습적 구조 (기각)**: 초기엔 빠르나 기능 증가 시 결합도↑·경계 모호.

## Consequences

- 보일러플레이트·레이어 규칙 학습 비용이 있으나 일관된 구조로 상쇄.
- shadcn 프리셋 `b1FlFygMM`은 init 시 `--preset`으로 주입한다(아래 검증 결과에 따라 적용 방식 확정).
- SQLAlchemy 채택으로 ADR-0006의 "SQLModel(또는)" 문구는 SQLAlchemy로 확정된다.
