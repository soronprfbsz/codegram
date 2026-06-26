# Backend rules — Codegram

Codegram 백엔드 작업의 **단일 규칙 출처**다. 백엔드 코드를 만질 때(서브에이전트로 위임하는 경우 포함) 이 파일을 읽고 따른다. **공통 규칙은 `.claude/rules/general.md`와 함께 적용**한다(외과적 변경·검증·사전이슈 구분·단일 출처). 도메인 언어는 `CONTEXT.md`, 아키텍처 결정은 `docs/adr/`.

위치: `backend/` (FastAPI + SQLAlchemy + Alembic, Python). 계층: `api/routes`(HTTP) → `services`(유스케이스) → `repositories`(영속성) → `models`(ORM) / `schemas`(Pydantic I/O). 주기 작업은 `jobs/`(FastAPI lifespan의 APScheduler, ADR-0014).

---

## 절대 규칙

### B1. 계층 책임 분리
- 라우트(`api/routes`)는 얇게: 검증·인증·DI만. 비즈니스 로직은 `services`, DB 접근은 `repositories`에 둔다. 라우트에서 ORM 쿼리를 직접 쓰지 않는다.
- 외부 입출력은 항상 `schemas`(Pydantic)로 표현한다. ORM 모델을 그대로 응답으로 노출하지 않는다.
- 같은 종류의 로직(쿼리·직렬화·검증)을 호출부마다 복붙하지 않는다 — 공용 repository/service/util로 모은다(프론트 F1과 같은 정신: 단일 출처).

### B2. 스키마 변경은 Alembic 마이그레이션으로만
- 모델(`models/`) 변경 시 반드시 대응 Alembic revision을 `backend/alembic/versions/`에 추가한다. 수동 DDL·모델만 바꾸고 마이그레이션 누락 금지.
- 마이그레이션은 up/down 모두 작성하고 적용 검증한다.

### B3. DBML 단일 진실
- 구조(테이블·컬럼·관계)의 진실은 DBML 텍스트다(ADR-0001). 백엔드는 이를 저장/스냅샷/내보내기 할 뿐, 그림에서 구조를 역생성하지 않는다.

---

## 검증 (작업 종료 전 필수) — 공통 절차는 general.md G3/G4
- 테스트: 도커 스택에서 `docker compose -p codegram exec -T backend pytest -q`. 변경에 대응하는 테스트를 `backend/tests/`에 추가·갱신한다.
- 마이그레이션 적용: `docker compose -p codegram exec -T backend alembic upgrade head`.
- 호스트 포트: 백엔드 4000, postgres 35432(컨테이너 내부는 8000/5432). OpenAPI는 `/api` 프리픽스 아래.
