#!/usr/bin/env python3
"""PostToolUse hook — lint a just-edited file against Codegram rules.

Fires after Edit/Write/MultiEdit. Surfaces likely rule violations (Feature-Sliced
import boundaries for the frontend; thin-route discipline for the backend) back to
the model as context so it fixes them. Non-blocking and heuristic: it informs, it
does not hard-fail (a flagged line may be intentional/pre-existing — judge it).
On any error it stays silent.
"""
import sys, json, os, re

LAYER = {"shared": 0, "entities": 1, "features": 2, "widgets": 3, "pages": 4, "app": 5}


def lint_frontend(rel, src):
    v = []
    m = re.match(r"frontend/src/(shared|entities|features|widgets|pages|app)(?:/([^/]+))?/", rel)
    if not m or not rel.endswith((".ts", ".tsx")):
        return v
    layer, slice_ = m.group(1), m.group(2)
    cur = LAYER[layer]
    # `import ... from '@/<layer>/<slice>'` and `export ... from '@/<layer>/<slice>'`
    for ilayer, islice in re.findall(r"""(?:import|export)\b[^'"]*from\s*['"]@/([a-z]+)(?:/([^'"/]+))?""", src):
        if ilayer not in LAYER:
            continue
        if LAYER[ilayer] > cur:
            v.append(f"FSD 위반: `{layer}` 파일이 상위 계층 `{ilayer}`를 import (하위 계층만 허용: shared←entities←features←widgets←pages←app).")
        elif ilayer == "widgets" and layer == "widgets" and islice and slice_ and islice != slice_:
            v.append(f"FSD 위반: widget `{slice_}`가 다른 widget `{islice}`를 import (widget→widget 금지 — 공유는 shared/entities로 내린다).")
    return sorted(set(v))


def lint_backend(rel, src):
    v = []
    if rel.startswith("backend/app/api/routes/") and rel.endswith(".py"):
        if re.search(r"^\s*from\s+app\.models", src, re.M) or re.search(r"\.query\(|(?<![\w.])select\(", src):
            v.append("B1 점검: 라우트에서 ORM/모델 직접 사용 흔적 — 로직은 services, DB 접근은 repositories로 옮기고 응답은 Pydantic schemas로.")
    if rel.startswith("backend/app/models/") and rel.endswith(".py"):
        v.append("B2 확인: 모델 변경이면 대응 Alembic 마이그레이션(`backend/alembic/versions/`, up/down)을 함께 추가했는지 확인.")
    return v


_PALETTE = ("red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|"
            "indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone")


def lint_frontend_style(rel, src):
    # F5/F2: 색·폰트는 디자인 토큰으로만. raw 하드코딩을 flag(advisory).
    # .tsx(UI)만 대상 — .ts(lib/data)는 글리프·Monaco 테마 등 정당한 hex가 많아 제외.
    if not (rel.startswith("frontend/src/") and rel.endswith(".tsx")):
        return []
    v = []
    pal = re.findall(r"\b(?:text|bg|border|ring|from|to|via|fill|stroke)-(?:" + _PALETTE + r")-\d{2,3}\b", src)
    if pal:
        v.append(f"F5 위반: raw 팔레트 색 클래스 {sorted(set(pal))[:3]} — 시맨틱 토큰(text-muted-foreground/-destructive/-success/-warning)·--erd-*로 회수.")
    if re.search(r"""['"]#[0-9a-fA-F]{3,6}['"]""", src) or re.search(r"\b(?:text|bg|border|ring|fill|stroke)-\[#", src):
        v.append("F5 점검: 인라인 hex/`[#..]` 색 — 토큰(var(--erd-*)/시맨틱 클래스)으로. 도메인 데이터(글리프·프리셋)면 무시.")
    if re.search(r"fontSize:\s*[0-9]", src):
        v.append("F5 위반: 인라인 fontSize 숫자 — `var(--erd-fs-*)`(ERD) 또는 text-* named 토큰으로.")
    if re.search(r"text-\[[0-9.]+px\]", src):
        v.append("F5 위반: `text-[NNpx]` — text-* named step 또는 `text-[length:var(--erd-fs-*)]`로.")
    return v


def lint_adr(rel, src):
    # High-signal architectural paths — advisory design-first backstop (§G6).
    # Never asserts an ADR is required; asks to confirm one exists or is
    # intentionally not needed. The judgement stays with the model.
    if rel in ("backend/pyproject.toml", "frontend/package.json"):
        return ["G6 점검: 의존성 매니페스트 편집 — 라이브러리/외부 시스템 추가는 아키텍처 결정일 수 있다. "
                "`docs/adr/README.md`에서 관련 도메인 ADR을 확인하고, 결정이면 ADR을 amend/신규로 남겼는지 보라(단순 버전 범프면 무시)."]
    if rel.startswith("backend/app/models/") and rel.endswith(".py"):
        return ["G6 점검: 모델 편집이 구조 결정(진실원천·계약)을 바꾸면 `docs/adr/`에 ADR을 남겼는지 확인(단순 컬럼 추가면 무시 — 마이그레이션은 B2)."]
    return []


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        return
    ti = data.get("tool_input") or {}
    fp = ti.get("file_path") or ""
    if not fp or not os.path.isfile(fp):
        return
    proj = data.get("cwd") or os.getcwd()
    rel = (os.path.relpath(fp, proj) if os.path.isabs(fp) else fp).replace(os.sep, "/")
    try:
        with open(fp, encoding="utf-8") as f:
            src = f.read()
    except Exception:
        return

    violations = lint_frontend(rel, src) + lint_frontend_style(rel, src) + lint_backend(rel, src) + lint_adr(rel, src)
    if not violations:
        return

    ctx = (f"[Codegram rule lint — {rel}]\n"
           + "\n".join("- " + x for x in violations)
           + "\n→ `.claude/rules/` 규칙 위반 가능성. 확인 후 위반이면 수정할 것(의도/사전 존재면 그 사실을 밝힐 것).")
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PostToolUse",
            "additionalContext": ctx,
        }
    }))


main()
