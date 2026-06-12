"""Outputs writer: the parallel _outputs/ directory.

Every artifact a run produces lands here. JSON artifacts are serialized
deterministically (sorted keys) so reproducibility extends to the files on
disk, not just the in-memory results.
"""
from __future__ import annotations

import json
from pathlib import Path


def outputs_dir(review_folder: str | Path, config: dict | None = None,
                reviewer: str | None = None, stamp: str | None = None) -> Path:
    """Resolve the output directory.

    simple mode (default, deterministic, used by the harness):
        <review_folder>/_outputs/
    audit_tree mode (the BASE convention for production):
        <review_folder>/../_outputs/<review_folder.name>/<reviewer>-<stamp>/
        where reviewer is the controller's email local-part and stamp is
        YYYYMMDD-HHMM captured at run start. The BASE commitment holds:
        input folders are never touched; runs never collide.
    """
    folder = Path(review_folder)
    mode = ((config or {}).get("output", {}) or {}).get("mode", "simple")
    if mode == "audit_tree":
        if not reviewer or not stamp:
            raise ValueError("audit_tree output mode requires reviewer and stamp")
        out = folder.parent / "_outputs" / folder.name / f"{reviewer}-{stamp}"
    else:
        out = folder / "_outputs"
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
