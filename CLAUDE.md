# CLAUDE.md — Codegram (index)

매 세션 자동 로드되는 **인덱스**다. 규칙 본문은 여기 적지 않고 `.claude/rules/`에 두며, 이 파일은 어디를 봐야 하는지만 가리킨다.

## 참고 위치
- **규칙(지금 무엇을 지킬지)**: `.claude/rules/` — 코드 작업 전 해당 파일을 읽고 따른다.
- **도메인 언어/유비쿼터스 용어**: `CONTEXT.md`
- **아키텍처 결정(왜 그렇게 정했나)**: `docs/adr/`
- **실행·검증 환경(스택 기동/포트)**: `README.md` Quickstart — `deploy/scripts/start.sh`로 스택 기동(호스트 포트: 백엔드 4000·프론트 4001·postgres 35432, 컨테이너 내부 8000/5173/5432). 규칙의 검증 명령은 스택이 떠 있어야 동작한다.

## 규칙 인덱스 (`.claude/rules/`)
| 파일 | 적용 범위 |
|---|---|
| `general.md` | 모든 코드 작업 공통 — 단일 출처·외과적 변경·검증·사전이슈 구분 |
| `frontend.md` | `frontend/` (React/Vite/UI). 핵심: UI는 공용 토큰·최소 컴포넌트로만, 호출부 개별 스타일 금지(§F1) |
| `backend.md` | `backend/` (FastAPI/DB). 핵심: 얇은 라우트+계층 분리, 모델 변경 시 Alembic 마이그레이션 필수 |

> 코드 작업 시 항상 `general.md` + 해당 영역 규칙 파일을 함께 읽고, **메인 스레드에서** 그에 맞춰 작업한다(아래 훅이 규칙을 주입·검사한다). 새 영역은 `.claude/rules/<area>.md`를 추가하고 위 표에 한 줄 적는다.
>
> 대규모·격리·병렬 작업으로 컨텍스트 격리가 필요하면 그때 `general-purpose` 서브에이전트를 띄우되, **반드시 해당 `.claude/rules/*.md`를 먼저 읽고 따르라고 지시**한다. (전용 전문가 에이전트는 두지 않는다 — 규칙은 rules/+훅으로 강제되고, 대화형 작업엔 서브에이전트가 부적합하므로.)

## 강제 (훅, `.claude/settings.json`)
- **UserPromptSubmit** (`adr_gate.py`): 세션 첫 요청에 **design-first ADR 게이트**(general.md §G6) 판단을 상기 — 이 요청이 아키텍처 결정을 신설/변경하면 구현 전에 ADR을 확정하라고 주입(세션당 1회). ADR 관리·도메인 인덱스는 `docs/adr/README.md`.
- **PreToolUse** (`inject_rules.py`): `frontend/`·`backend/` 편집 직전 해당 영역의 절대 규칙을 컨텍스트에 **강제 주입**(세션·영역당 1회).
- **PostToolUse** (`lint_rules.py`): 편집 직후 규칙 위반을 **lint**해 피드백 — 프론트 FSD import 경계(상위 계층 import·widget→widget), 백엔드 얇은 라우트(라우트 내 ORM 직접 사용)·모델 변경 시 마이그레이션 확인, **고신호 경로(의존성 매니페스트·`models/`) ADR 확인(§G6)**. 비차단(정보 제공)이라 위반이면 수정, 의도/사전존재면 그 사실을 밝힌다.
