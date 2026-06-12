"""Box input adapter: the BASE plugin-mode IO contract, implemented behind an
injectable client.

The BASE skill names the Box MCP tools the orchestrator uses:
  search_folders_by_name, list_folder_content_by_folder_id, get_file_content
This adapter consumes any client object exposing those three methods, which is
exactly the MCP surface in Cowork / Claude Code. In CI a FakeBoxClient backed
by an in-memory tree exercises the full discovery path; in production the MCP
client is injected at the integration point. Selecting Box mode without a
client HALTS loudly (the same never-silently-degrade discipline as the model
adapter): the orchestrator then asks the controller per the BASE contract,
"Box unreachable: switch to local fallback at [path]? (Yes / Retry Box)".

Box wins over local when both are reachable, unless the controller says
"use local" (BASE rule). That arbitration lives in the caller; this module
only resolves a Box path into ReviewInputs.
"""
from __future__ import annotations

import json

from ingest.discovery import ReviewInputs, HaltError

REQUIRED_FILE = "figures.json"
KNOWN_FILES = [
    "_REVIEW-MANIFEST.json", "_FUND-METADATA.json", "figures.json",
    "notes.json", "prior_figures.json", "sibling_figures.json",
    "prior_findings.json",
]


class BoxUnreachable(Exception):
    """Raised when the Box client is missing or a call fails. The caller
    surfaces the BASE fallback prompt; nothing proceeds silently."""


def load_review_from_box(client, box_folder_path: str) -> ReviewInputs:
    if client is None:
        raise BoxUnreachable(
            "Box mode selected but no Box client is configured. Inject the MCP "
            "client (search_folders_by_name / list_folder_content_by_folder_id / "
            "get_file_content) or re-run in local mode.")
    try:
        folder_name = box_folder_path.rstrip("/").rsplit("/", 1)[-1]
        matches = client.search_folders_by_name(folder_name)
        folder_id = _resolve_folder_id(matches, box_folder_path)
        entries = client.list_folder_content_by_folder_id(folder_id)
    except BoxUnreachable:
        raise
    except Exception as e:   # network, auth, API shape: all surface, none pass silently
        raise BoxUnreachable(f"Box discovery failed for {box_folder_path!r}: {e}") from e

    inputs_entry = next((e for e in entries if e.get("type") == "folder"
                         and e.get("name") == "inputs"), None)
    if inputs_entry is None:
        raise HaltError(f"no inputs/ folder under Box path {box_folder_path!r}")
    files = {e["name"]: e["id"] for e in
             client.list_folder_content_by_folder_id(inputs_entry["id"])
             if e.get("type") == "file"}

    raw: dict = {}
    chips: list = []

    def read(name: str, halt: bool):
        if name not in files:
            if halt:
                raise HaltError(f"halt-required input missing from Box folder: {name}")
            chips.append({"chip": "red", "input": name, "reason": "missing from Box folder, review degraded"})
            return None
        content = client.get_file_content(files[name])
        data = content.encode("utf-8") if isinstance(content, str) else content
        raw[name] = data
        try:
            return json.loads(data.decode("utf-8"))
        except json.JSONDecodeError as e:
            if halt:
                raise HaltError(f"halt-required Box input unparseable: {name}: {e}")
            chips.append({"chip": "red", "input": name, "reason": f"unparseable: {e}"})
            return None

    manifest = read("_REVIEW-MANIFEST.json", halt=False) or {}
    metadata = read("_FUND-METADATA.json", halt=False) or {}
    figures = read(REQUIRED_FILE, halt=True)
    notes = read("notes.json", halt=False) or {"notes": []}
    prior = read("prior_figures.json", halt=False) if "prior_figures.json" in files else None
    sibling = read("sibling_figures.json", halt=False) if "sibling_figures.json" in files else None
    prior_findings = read("prior_findings.json", halt=False) if "prior_findings.json" in files else None

    from pathlib import Path
    return ReviewInputs(
        folder=Path(box_folder_path), manifest=manifest, metadata=metadata,
        figures=figures, notes=notes, prior_figures=prior,
        sibling_figures=sibling, prior_findings=prior_findings,
        degradation_chips=chips, raw_files=raw,
    )


def _resolve_folder_id(matches, box_folder_path: str):
    if not matches:
        raise BoxUnreachable(f"Box search returned no folder matching {box_folder_path!r}")
    # Prefer an exact path match when the client returns paths; else first hit.
    for m in matches:
        if m.get("path") and m["path"].rstrip("/") == box_folder_path.rstrip("/"):
            return m["id"]
    return matches[0]["id"]
