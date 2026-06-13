"""Framework selection from fund metadata. No defaults, no silent fallback."""
from __future__ import annotations

from frameworks.base import FrameworkError
from frameworks.asc946 import ASC946
from frameworks.ifrs import IFRS
from frameworks.usgaap import USGAAP

_ENGINES = {"ASC946": ASC946, "IFRS": IFRS, "USGAAP": USGAAP}


def select_framework(metadata: dict):
    presentation = metadata.get("presentation") or {}
    code = presentation.get("framework")
    if not code:
        raise FrameworkError(
            "fund metadata does not declare presentation.framework; "
            "v9 never assumes a framework. Set ASC946, IFRS, or USGAAP in _FUND-METADATA.json.")
    engine = _ENGINES.get(code)
    if engine is None:
        raise FrameworkError(f"unknown framework {code!r}; supported: {sorted(_ENGINES)}")
    return engine()
