"""Input discovery and review loading.

Local folder discovery is primary. Box is an adapter stub behind config
(box.enabled=false in this build): when enabled it must implement the same
ReviewInputs contract; it never silently substitutes for local inputs.

Halt-vs-degrade discipline (carried from v8 invariant 15): figures.json is the
only halt-required input. Everything else degrades with a recorded chip.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path


class HaltError(Exception):
    """Raised when a halt-required input is missing or unreadable."""


@dataclass
class ReviewInputs:
    folder: Path
    manifest: dict
    metadata: dict
    figures: dict
    notes: dict
    prior_figures: dict | None = None
    sibling_figures: dict | None = None
    degradation_chips: list = field(default_factory=list)
    raw_files: dict = field(default_factory=dict)  # filename -> bytes, for hashing


def _read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def load_review(folder: str | Path) -> ReviewInputs:
    folder = Path(folder)
    inputs_dir = folder / "inputs"
    if not inputs_dir.is_dir():
        raise HaltError(f"no inputs/ directory under {folder}")

    chips: list = []
    raw: dict = {}

    def read_required(name: str, halt: bool):
        path = inputs_dir / name
        if not path.is_file():
            if halt:
                raise HaltError(f"halt-required input missing: {name}")
            chips.append({"chip": "red", "input": name, "reason": "missing, review degraded"})
            return None
        data = path.read_bytes()
        raw[name] = data
        try:
            return json.loads(data.decode("utf-8"))
        except json.JSONDecodeError as e:
            if halt:
                raise HaltError(f"halt-required input unparseable: {name}: {e}")
            chips.append({"chip": "red", "input": name, "reason": f"unparseable: {e}"})
            return None

    manifest = read_required("_REVIEW-MANIFEST.json", halt=False) or {}
    metadata = read_required("_FUND-METADATA.json", halt=False) or {}
    if not metadata:
        chips.append({"chip": "red", "input": "_FUND-METADATA.json",
                      "reason": "fund metadata absent; framework defaults are NOT applied, framework selection will halt"})
    figures = read_required("figures.json", halt=True)
    notes = read_required("notes.json", halt=False) or {"notes": []}
    prior = read_required("prior_figures.json", halt=False) if (inputs_dir / "prior_figures.json").exists() else None
    sibling = read_required("sibling_figures.json", halt=False) if (inputs_dir / "sibling_figures.json").exists() else None

    return ReviewInputs(
        folder=folder, manifest=manifest, metadata=metadata, figures=figures,
        notes=notes, prior_figures=prior, sibling_figures=sibling,
        degradation_chips=chips, raw_files=raw,
    )
