#!/usr/bin/env python3
"""PreToolUse hook — force-inject the relevant Codegram rules before a code edit.

Fires on Edit/Write/MultiEdit. If the target file is under frontend/ or backend/,
adds the area's absolute rules to the model's context (once per area per session,
to keep the rules present without bloating context on every edit). Never blocks;
on any error it stays silent so editing is never interrupted.
"""
import sys, json, os, tempfile

FRONTEND = (
    "[Codegram rules — frontend edit]\n"
    "frontend/ 편집이다. `.claude/rules/general.md` + `.claude/rules/frontend.md`를 절대 규칙으로 따른다.\n"
    "- F1: 같은 역할 UI는 공용 토큰/최소 컴포넌트(`shared/ui`)에서만 모양을 받는다. 호출부 인라인 스타일/매직넘버로 재구현 금지 — 없으면 공용 단위를 먼저 만든다.\n"
    "- F2: ERD 표면은 `--erd-*` CSS 변수, 범용은 shadcn Button. 임의 hex/변형 금지.\n"
    "- F3(FSD): import는 하위 계층만(shared←entities←features←widgets←pages←app). widget은 다른 widget을 import하지 않는다.\n"
    "- F5: 색·폰트는 디자인 토큰으로만. raw 팔레트 클래스(`text-red-600`)·인라인 `#hex`·`fontSize:숫자`·`text-[NNpx]` 금지. 없으면 `index.css`에 토큰 신규 추가 후 사용(ADR-0020).\n"
    "- 공통(general): 외과적 변경, 종료 전 `npm run type-check`+`test:run` 증거, 사전이슈/회귀 구분.\n"
    "전체: `.claude/rules/frontend.md`, `.claude/rules/general.md`"
)

BACKEND = (
    "[Codegram rules — backend edit]\n"
    "backend/ 편집이다. `.claude/rules/general.md` + `.claude/rules/backend.md`를 절대 규칙으로 따른다.\n"
    "- B1: 라우트는 얇게(검증/인증/DI). 로직=services, DB=repositories. 라우트에서 ORM 직접 쿼리 금지. 외부 I/O는 Pydantic schemas.\n"
    "- B2: 모델 변경 시 Alembic 마이그레이션(up/down) 필수.\n"
    "- B3: 구조의 진실은 DBML(ADR-0001) — 그림에서 구조 역생성 금지.\n"
    "- 공통(general): 외과적 변경, 종료 전 `pytest` 증거, 사전이슈/회귀 구분.\n"
    "전체: `.claude/rules/backend.md`, `.claude/rules/general.md`"
)


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        return
    ti = data.get("tool_input") or {}
    fp = ti.get("file_path") or ti.get("path") or ""
    if not fp:
        return
    proj = data.get("cwd") or os.getcwd()
    rel = (os.path.relpath(fp, proj) if os.path.isabs(fp) else fp).replace(os.sep, "/")

    if rel.startswith("frontend/"):
        area, ctx = "frontend", FRONTEND
    elif rel.startswith("backend/"):
        area, ctx = "backend", BACKEND
    else:
        return

    # Inject once per (session, area) so the rules stay in context without
    # repeating on every single edit. Delete the marker dir to re-arm.
    try:
        sid = str(data.get("session_id") or "nosid")
        mdir = os.path.join(tempfile.gettempdir(), "codegram-rule-hook")
        os.makedirs(mdir, exist_ok=True)
        marker = os.path.join(mdir, f"{sid}.{area}")
        if os.path.exists(marker):
            return
        open(marker, "w").close()
    except Exception:
        pass  # if marker bookkeeping fails, just inject

    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "additionalContext": ctx,
        }
    }))


main()
