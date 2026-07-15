#!/usr/bin/env python3
"""UserPromptSubmit hook — design-first ADR gate (Codegram).

Fires when the user submits a prompt. Once per session, injects a compact
reminder to triage whether the request creates/changes an architecture decision
and, if so, to settle an ADR (amend-by-supersession or new) BEFORE implementing.
The judgement itself is the model's — this only ensures the question is asked.
Never blocks; on any error it stays silent so prompting is never interrupted.

Enforcement companions: `.claude/rules/general.md` §G6 (heuristics + procedure),
`docs/adr/README.md` (domain index), `lint_rules.py` (edit-time backstop).
"""
import sys, json, os, tempfile

GATE = (
    "[Codegram design-first — ADR 게이트]\n"
    "코드 편집 전 판단하라: 이 요청이 아키텍처 결정을 신설/변경하나? "
    "(기준·절차: `.claude/rules/general.md` §G6)\n"
    "- 유의미하면 → `docs/adr/README.md` 인덱스로 해당 도메인 기존 ADR을 통독해 "
    "amend(supersede)/신규 결정 → `grill-with-docs`로 도메인 모델에 대질하며 ADR 초안 "
    "→ **사용자 승인 후 구현**(design-first).\n"
    "- 아니면 → 그대로 진행. 경계선상이면 \"ADR 불요\" 한 줄로 판단을 남긴다.\n"
    "버그픽스·스타일·카피·i18n·계층 내부 리팩터·테스트·설정 변경은 대개 ADR 불요."
)


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        return

    # Inject once per session so the gate stays in context without repeating on
    # every prompt (mirrors inject_rules.py). Delete the marker dir to re-arm.
    try:
        sid = str(data.get("session_id") or "nosid")
        mdir = os.path.join(tempfile.gettempdir(), "codegram-adr-gate")
        os.makedirs(mdir, exist_ok=True)
        marker = os.path.join(mdir, sid)
        if os.path.exists(marker):
            return
        open(marker, "w").close()
    except Exception:
        pass  # if marker bookkeeping fails, just inject

    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": GATE,
        }
    }))


main()
