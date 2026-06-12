"""Voice annotation: the BASE Stage 5g, annotation mode, carried into v9.

The original message is immutable. When a CERTAIN finding carries hedged
language, a polished alternative is produced into voice_normalized; the
compat projection surfaces it as voiceNormalized alongside subagentRaw.
PROBABLE and POSSIBLE findings are never polished: their hedging is faithful
to the confidence label (BASE council finding 4.1: stripping it launders
confidence).

The substitutions are deterministic text surgery, not paraphrase. If no rule
fires, voice_normalized stays null: the no-op case is the common case for a
well-tuned reviewer, and a reviewer that consistently needs polish should be
re-prompted, not laundered (escalation per OWNERSHIP).
"""
from __future__ import annotations

import re

# (pattern, replacement) applied only to CERTAIN findings, in order.
_SUBSTITUTIONS = [
    (re.compile(r"^It appears that\s+", re.IGNORECASE), ""),
    (re.compile(r"^It seems that\s+", re.IGNORECASE), ""),
    (re.compile(r"^There appears to be\s+", re.IGNORECASE), "There is "),
    (re.compile(r"\bmay be\b"), "is"),
    (re.compile(r"\bmight be\b"), "is"),
    (re.compile(r"\bappears to be\b"), "is"),
    (re.compile(r"\bseems to be\b"), "is"),
    (re.compile(r"\bcould be\b"), "is"),
    (re.compile(r"\bpossibly\s+"), ""),
]


def polish(text: str) -> str | None:
    """Return the polished alternative, or None when the text is already clean."""
    out = text
    for pattern, replacement in _SUBSTITUTIONS:
        out = pattern.sub(replacement, out)
    if out == text:
        return None
    return out[:1].upper() + out[1:] if out else None


def annotate(findings: list[dict]) -> tuple[list[dict], int]:
    """Populate voice_normalized on CERTAIN findings with hedged language.
    Returns (findings, polish_count) so a high polish rate can be surfaced
    as a reviewer-quality signal."""
    count = 0
    for f in findings:
        f.setdefault("voice_normalized", None)
        if f.get("confidence_label") != "CERTAIN":
            continue
        polished = polish(f.get("message", ""))
        if polished is not None:
            f["voice_normalized"] = polished
            count += 1
    return findings, count
