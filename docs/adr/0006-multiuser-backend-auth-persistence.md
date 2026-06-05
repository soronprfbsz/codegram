# 다중 사용자 백엔드: 사용자별 격리 · fastapi-users JWT 인증 · PostgreSQL/JSONB · 공유 없음

각 사용자는 자신의 Project만 소유·조회한다(사용자간 데이터 격리). 인증은 fastapi-users로 이메일+비밀번호 가입·로그인, 비밀번호 해싱(argon2/bcrypt), JWT 발급(httpOnly 쿠키 권장)을 처리한다. 영속화는 PostgreSQL + SQLAlchemy/SQLModel + Alembic 마이그레이션을 쓰고, Layout은 JSONB 컬럼에 저장한다. 프로젝트 공유·협업·실시간 동시편집은 범위에서 명시적으로 제외한다.

## 데이터 모델(개요)

- `users` — fastapi-users 스키마.
- `projects` — `id, owner_id(FK users), name, dbml_text(TEXT), layout(JSONB), created_at, updated_at`.
- 테이블그룹·색상은 DBML 텍스트 안에 있으므로 별도 테이블 없음(ADR-0001/그룹 결정과 일관). Layout JSONB = 테이블 위치 + 엣지 웨이포인트/연결면.

## Considered Options

- **이메일+비밀번호 / fastapi-users (채택)**: 자급자족, 외부 의존 없음, 보안 보일러플레이트를 검증된 라이브러리에 위임.
- **소셜 OAuth (기각, 향후 가능)**: 가입 마찰↓이나 provider 설정·의존 추가.
- **매니지드 auth (기각)**: 외부 서비스 의존·비용·데이터 외부화 → 자체 호스트 목표와 상충.
- **PostgreSQL (채택) vs SQLite/Mongo (기각)**: 다중 사용자·JSONB·관계형 적합. SQLAlchemy로 DB 교체 여지 확보.

## Consequences

- "공유 없음"은 의도적 경계다. 나중에 공유를 넣으려면 권한 모델·접근제어를 추가해야 한다(되돌리기 비용 있음).
- 백엔드는 CRUD+인증 중심의 얇은 계층으로 유지된다(ADR-0002/0005와 일관).
