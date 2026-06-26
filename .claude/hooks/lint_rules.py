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

    violations = lint_frontend(rel, src) + lint_backend(rel, src)
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
