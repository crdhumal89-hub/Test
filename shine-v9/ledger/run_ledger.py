"""Reproducibility ledger.

The ledger is the identity record of a run: content hash of every input, the
config hash, every pinned version, and a digest of the results. It contains
NO timestamps by design: two runs on identical inputs with identical versions
produce byte-identical ledgers, which is the reproducibility gate. Wall-clock
and latency live in telemetry.json, which is execution metadata, not identity.
"""
from __future__ import annotations

import hashlib
import json

LEDGER_VERSION = "9.0"


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_json(obj) -> str:
    return sha256_bytes(json.dumps(obj, sort_keys=True, separators=(",", ":")).encode("utf-8"))


def build_ledger(raw_files: dict, config: dict, versions: dict) -> dict:
    input_hashes = {name: sha256_bytes(data) for name, data in sorted(raw_files.items())}
    config_hash = sha256_json(config)
    identity = {
        "input_hashes": input_hashes,
        "config_hash": config_hash,
        "versions": versions,
    }
    return {
        "ledger_version": LEDGER_VERSION,
        "run_id": sha256_json(identity)[:16],
        "input_hashes": input_hashes,
        "config_hash": config_hash,
        "versions": versions,
        "results_digest": None,   # filled by finalize_ledger after the run
        "counts": None,
    }


def finalize_ledger(ledger: dict, findings: list[dict], coverage: dict) -> dict:
    ledger["results_digest"] = sha256_json(findings)
    by_severity: dict = {}
    for f in findings:
        by_severity[f["severity"]] = by_severity.get(f["severity"], 0) + 1
    ledger["counts"] = {
        "findings": len(findings),
        "by_severity": dict(sorted(by_severity.items())),
        "coverage_checked": len(coverage.get("checked", [])),
        "coverage_skipped": len(coverage.get("skipped", [])),
    }
    return ledger


def serialize_ledger(ledger: dict) -> str:
    """Deterministic serialization: sorted keys, fixed separators, no timestamps."""
    return json.dumps(ledger, sort_keys=True, indent=2, separators=(",", ": ")) + "\n"
