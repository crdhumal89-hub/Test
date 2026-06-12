"""Judgment-layer dispatch.

Reviewers run in a fixed order for output determinism. (The v8 skill runs its
Phase 1 in parallel for latency; in rule_based mode latency is microseconds
and determinism wins. A model-backed adapter can parallelize inside
run_reviewer without changing this contract.)
"""
from __future__ import annotations

from judges.adapter import ModelAdapter
from judges.reviewers import REVIEWERS


def run_judges(ctx: dict, adapter: ModelAdapter) -> tuple[list[dict], dict]:
    findings: list[dict] = []
    coverage: dict = {}
    for name, rule in REVIEWERS:
        judge_findings, judge_coverage = adapter.run_reviewer(name, rule, ctx)
        findings.extend(judge_findings)
        coverage[name] = judge_coverage
    return findings, coverage
