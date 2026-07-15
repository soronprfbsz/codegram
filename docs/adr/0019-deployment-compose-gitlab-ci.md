# 배포는 docker compose(base/override/prod) 3-파일 + GitLab CI로 경로 선택 재배포한다

> **Status**: Accepted · **Tags**: `deployment`, `architecture` · **Date**: 2026-07-15 · **Supersedes**: — · **Related**: ADR-0006, ADR-0007

Codegram 스택(postgres + backend + frontend)은 `deploy/`의 **docker compose 3-파일**(`docker-compose.yml` base · `.override.yml` 로컬 · `.prod.yml` 운영)로 구성하고, **GitLab CI/CD**가 main push 시 **모노레포 경로 선택 재배포**(프론트 변경→프론트만, 백엔드 변경→백엔드만, postgres는 상주)한다. 컨테이너·포트·환경 결합의 결정을 기록한다.

사후 기록이다 — `deploy/docker-compose.yml`(`name: codegram`), `.gitlab-ci.yml`(build→docker-build→deploy 스테이지, 경로 규칙), `deploy/scripts/start.sh`, 프론트 `nginx.conf`가 이미 존재한다. 로컬 기동은 `deploy/scripts/start.sh`, 호스트 포트는 백엔드 4000·프론트 4001·postgres 35432(컨테이너 8000/5173/5432).

## Considered Options

### 오케스트레이션

- **docker compose 3-파일 오버레이 (채택)**: base에 서비스·네트워크·볼륨을 정의하고, 로컬은 `.override.yml`(호스트 포트 노출·핫리로드 볼륨), 운영은 `.prod.yml`로 분리. 단일 노드 스택엔 compose가 가장 단순하고, override 오버레이로 로컬/운영 차이를 파일 경계로 표현한다.
- **Kubernetes/Helm (기각)**: 단일 노드·소규모엔 과설계. 운영 부담만 늘고 실익 없음.
- **호스트 직접 실행(systemd 등) (기각)**: postgres/backend/frontend 격리·재현성을 잃는다.

### 로컬 기동을 스크립트로 감싼 이유

- **`deploy/scripts/start.sh` (채택)**: ① compose 파일은 `deploy/`에 있지만 빌드 컨텍스트(`./backend`·`./frontend`)와 루트 `.env`는 **리포 루트에서** 해석돼야 해 `--project-directory <root> -f ...`로 돌린다. ② `node_modules`/`.venv`가 **익명 볼륨**이라 평범한 `--build`는 stale 볼륨을 재사용해 새 의존성이 컨테이너에 안 닿는다 → `package-lock.json`/`pyproject.toml` 변화를 감지해 해당 볼륨을 갱신(`--fresh`로 강제). ③ 마이그레이션(멱등) 실행 + 헬스 대기.
- **bare `docker compose up -d --build` (기각)**: 위 3가지 함정(경로 해석·stale 의존성 볼륨·마이그레이션)을 매번 수동 처리해야 함.

### CI 재배포 단위

- **경로 선택(path-selective) 재배포 (채택)**: 모노레포라 프론트/백 변경을 `rules`로 분기해 바뀐 서비스만 재빌드·재기동한다. postgres는 최초 1회 생성 후 상주(데이터 볼륨 보존).
- **매 push 전체 스택 재배포 (기각)**: 무관한 서비스까지 내렸다 올려 다운타임·DB 위험만 커진다.

### 프론트→백엔드 프록시의 업스트림 해석

- **nginx 런타임 DNS resolver (채택)**: `resolver 127.0.0.11`(도커 내장 DNS) + 변수 업스트림(`proxy_pass http://$api_upstream...`)으로 백엔드 주소를 **요청 시점에** 해석한다. 백엔드가 프론트보다 늦게 떠도 nginx가 기동 실패하지 않는다.
- **정적 upstream 블록 (기각)**: nginx 시작 시 백엔드 호스트를 즉시 해석해야 해, 백엔드 미기동이면 프론트 컨테이너가 죽는 기동 순서 결합이 생긴다(실제 CI에서 이 문제로 런타임 DNS로 전환).
