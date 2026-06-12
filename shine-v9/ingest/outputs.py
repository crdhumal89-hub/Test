"""Outputs writer: the parallel _outputs/ directory.

Every artifact a run produces lands here. JSON artifacts are serialized
deterministically (sorted keys) so reproducibility extends to the files on
disk, not just the in-memory results.
"""
from __future__ import annotations

import json
from pathlib import Path


def outputs_dir(review_folder: str | Path) -> Path:
    out = Path(review_folder) / "_outputs"
    out.mkdir(parents=True, exist_ok=True)
    return out


def write_json(out_dir: Path, name: str, obj) -> Path:
    path = out_dir / name
    path.write_text(json.dumps(obj, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    return path


def write_text(out_dir: Path, name: str, text: str) -> Path:
    path = out_dir / name
    path.write_text(text, encoding="utf-8")
    return path


def write_bytes(out_dir: Path, name: str, data: bytes) -> Path:
    path = out_dir / name
    path.write_bytes(data)
    return path
