# 배포 CI를 GitHub Actions + 배포 호스트 전용 self-hosted runner로 옮긴다

> **Status**: Accepted · **Tags**: `deployment` · **Date**: 2026-09-28 · **Supersedes**: ADR-0019 (CI/CD 부분) · **Related**: ADR-0019

사내 GitLab(10.110.1.103)과 그 옆 Harbor를 걷어내기로 하면서, codegram의 CI/CD를 **GitHub Actions**(`tscorp-dev2/codegram`)로 옮긴다. 실행은 운영 배포 호스트 **10.140.1.40**에 설치한 **codegram 전용 self-hosted runner**(repo 단위 등록, label `codegram-140`)가 맡고, 호스트의 docker로 이미지를 직접 빌드·교체한다. ADR-0019의 compose 3-파일 구성·경로 선택 재배포·nginx 런타임 DNS 결정은 그대로 유효하고, **CI 플랫폼·배포 호스트·이미지 전달 방식만** 이 ADR이 대체한다.

전환 시점의 사실: GitLab CI는 10.110.1.106(포트 28080/28000)에 배포하고 있었지만 실제 운영은 10.140.1.40(포트 4001/4002, postgres 45432)에서 Harbor `:latest`를 수동으로 받아 돌리고 있었다. 106 쪽은 CI 변수 미설정으로 `SECRET_KEY`·`POSTGRES_PASSWORD`가 공개된 dev 기본값인 채였다. 이 ADR부터 CI가 곧 운영(10.140.1.40)을 배포한다.

## Considered Options

### CI 플랫폼·실행 위치

- **GitHub Actions + 배포 호스트의 self-hosted runner (채택)**: 저장소가 GitHub로 옮겨가므로 CI도 같은 곳에 둔다. 배포 호스트가 사내망에 있어 runner가 호스트 안에서 직접 docker를 다루는 편이 가장 단순하다(인바운드 포트·SSH 키 불필요, 아웃바운드 HTTPS만 필요).
- **GitHub-hosted runner + SSH 배포 (기각)**: 사내망 호스트로 들어올 인바운드 경로와 배포용 SSH 키 관리가 새로 생긴다.
- **GitLab CI 유지 (기각)**: 걷어내려는 시스템에 배포를 묶어 두게 된다.

### runner 격리 — 같은 호스트의 hawkeye-renewal runner와의 관계

- **codegram repo 단위 전용 runner (채택)**: 같은 호스트에 hawkeye-renewal 전용 runner(`tf-hawkeye/hawkeye-renewal`)가 이미 있다. repo 단위로 등록하면 서로의 job을 원천적으로 받을 수 없고, 설치 디렉토리(`~/actions-runner-codegram`)·systemd 서비스·작업 폴더·툴 캐시가 분리돼 한쪽의 장애·대기열·업데이트가 다른 쪽에 번지지 않는다. OS 사용자(`hawkeye`)와 docker 데몬은 공유한다 — docker 그룹이 사실상 root 동등이라 사용자 분리로 얻는 격리가 명목뿐이기 때문이다.
- **기존 hawkeye runner 공용 사용 (기각)**: 두 프로젝트의 배포가 한 대기열·한 설치본에 묶인다.
- **tscorp-dev2 조직 단위 runner (기각)**: 조직의 다른 저장소 job도 label만 맞으면 받을 수 있고, Free 플랜이라 runner group으로 저장소를 제한할 수 없다.

### 경로 선택 재배포의 표현

- **워크플로 2개 + 네이티브 `on.push.paths` (채택)**: `deploy-frontend.yml`·`deploy-backend.yml`이 각자 경로 필터를 갖는다. 서드파티 액션 없이 ADR-0019의 `rules: changes`와 같은 의미를 낸다. 두 워크플로가 공유하는 `.env` 생성은 `deploy/scripts/write-prod-env.sh` 한 곳에 둔다.
- **단일 워크플로 + `dorny/paths-filter` (기각)**: 외부 액션 의존(공급망)이 늘어난다.

### 이미지 전달

- **배포 호스트에서 직접 빌드, 레지스트리 없음 (채택)**: 빌드와 실행이 같은 호스트라 레지스트리 왕복이 필요 없다. `ts/codegram-{frontend,backend}:latest`에 `git-sha` 라벨을 붙여 배포 커밋을 추적한다. 이전 이미지로 즉시 롤백할 보관본이 없다는 대가는 받아들인다(롤백 = 이전 커밋 재배포).
- **Harbor 유지 (기각)**: 걷어내는 GitLab 호스트(103)에 함께 있다.
- **GHCR (기각)**: 단일 호스트 배포엔 이득 없이 인증·보관 관리만 는다.

### 운영 비밀값

- **GitHub Actions Repository secrets + 누락 시 실패 (채택)**: `POSTGRES_PASSWORD`·`SECRET_KEY`만 secret으로 두고 나머지는 워크플로 `env:`에 둔다. `write-prod-env.sh`는 값이 없거나 비면 **배포를 실패**시킨다 — dev 기본값으로 조용히 대체하던 GitLab CI가 106을 공개 기본값으로 띄운 전례를 막는다.
- **호스트 파일(`.env`)을 진실로 유지 (기각)**: 값의 출처가 저장소 밖 수작업 파일로 흩어진다.

### 공개 미러

- 저장소는 PUBLIC 미러(`soronprfbsz/codegram`)에도 push되므로 모든 job에 `if: github.repository_owner == 'tscorp-dev2'`를 두어 미러에서는 실행하지 않는다(미러에는 runner·secret도 없다).
