"""Model adapter boundary for the judgment layer.

Three implementations:

RuleBasedAdapter   deterministic Python rule execution. The CI and acceptance
                   baseline; what the golden library measures.

ClaudeAdapter      the production judgment path carrying MODEL_PIN. It always
                   runs the rule floor first (the deterministic findings are
                   the floor), then asks the model for ADDITIONAL judgment
                   findings, parses them into v9 shape, dedups against the
                   floor by merge_key, and returns floor + additions. The model
                   only ever ADDS; it cannot remove or weaken a rule finding,
                   and every model finding still passes citation verification,
                   schema validation, and the skeptic downstream. A model
                   finding that cites unverifiable authority is rejected before
                   any controller sees it: the architecture already contains
                   the model's principal failure mode.

                   The single network touchpoint is the injected ModelClient.
                   With no client and no replay source, selecting claude HALTS
                   loudly: the engine never silently downgrades to rules.

ReplayClient       a deterministic, offline ModelClient backed by a recorded
                   cassette. It lets the full claude-adapter code path run in
                   CI and the harness with no network, so the integration is
                   tested end to end before live credentials are ever attached.

No adapter, in any mode, performs arithmetic. The deterministic core has
already run before any judge executes.
"""
from __future__ import annotations

import json
import os

from judges.common import make_finding, SOURCE_TO_LAYER

# Source mapping for parsed model findings. A model reviewer's name is the v9
# source; the layer follows the same map the compat projection uses.
_VALID_SOURCES = {"presentation", "disclosure", "standards", "comparative", "regulatory"}


class AdapterNotConfigured(Exception):
    pass


class ModelClient:
    """Protocol: one method, the only network touchpoint."""

    def complete(self, prompt: str) -> str:
        raise NotImplementedError


class ReplayClient(ModelClient):
    """Offline ModelClient. cassette maps a reviewer name to a raw JSON
    response string (what the model would have returned). Unknown reviewers
    return an empty findings response, so a partial cassette is safe."""

    EMPTY = json.dumps({"findings": []})

    def __init__(self, cassette: dict):
        self._cassette = cassette or {}
        self.calls: list[str] = []

    def complete(self, prompt: str) -> str:
        self.calls.append(prompt)
        # The prompt carries the reviewer name on its first line: "REVIEWER: x".
        first = prompt.splitlines()[0] if prompt else ""
        name = first.split("REVIEWER:", 1)[1].strip() if "REVIEWER:" in first else ""
        return self._cassette.get(name, self.EMPTY)


class ModelAdapter:
    name = "base"

    def run_reviewer(self, reviewer_name: str, rule_callable, context: dict):
        raise NotImplementedError


class RuleBasedAdapter(ModelAdapter):
    name = "rule_based"

    def run_reviewer(self, reviewer_name: str, rule_callable, context: dict):
        return rule_callable(context)


class ClaudeAdapter(ModelAdapter):
    name = "claude"

    def __init__(self, model_pin: str, client: ModelClient | None = None):
        self.model_pin = model_pin
        self.client = client
        if client is None and not os.environ.get("ANTHROPIC_API_KEY"):
            raise AdapterNotConfigured(
                "adapter=claude requires either an injected ModelClient (or a "
                "replay cassette in config) or ANTHROPIC_API_KEY for a live "
                "client. The engine does not silently fall back to rule_based.")
        if client is None:
            raise AdapterNotConfigured(
                "ANTHROPIC_API_KEY is set but no live ModelClient is wired into "
                "this build. Implement a client whose complete(prompt) calls the "
                "pinned model and inject it (see SCALING.md section 5), or run "
                "with a replay cassette.")

    def run_reviewer(self, reviewer_name: str, rule_callable, context: dict):
        # 1. The deterministic floor always runs.
        floor_findings, coverage = rule_callable(context)
        if reviewer_name not in _VALID_SOURCES:
            return floor_findings, coverage   # core-adjacent reviewers: floor only
        # 2. Ask the model for additional judgment findings.
        prompt = build_prompt(reviewer_name, context)
        raw = self.client.complete(prompt)
        model_findings = parse_model_findings(raw, reviewer_name, context)
        # 3. Protect the deterministic floor from model double-counting. The
        #    model cannot know a rule's check_id (which keys floor merge_keys),
        #    so dedup on the (statement, section, category) the rules already
        #    flagged. The bias is deliberate: where the rules already spoke,
        #    the model does not add a second voice. A genuinely additive model
        #    finding lives in a section or category the rules did not touch.
        floor_slots = {(f["statement"], f["section"], f["category"]) for f in floor_findings}
        additions = [f for f in model_findings
                     if (f["statement"], f["section"], f["category"]) not in floor_slots]
        return floor_findings + additions, coverage


def build_prompt(reviewer_name: str, context: dict) -> str:
    """Construct the reviewer prompt. Deterministic given the context, so the
    ReplayClient can key on the reviewer name. A live client sends this to the
    pinned model; the structure (checklist + figures summary + notes) is the
    integration contract."""
    framework = context["framework"]
    notes = context.get("notes", {}).get("notes", [])
    note_titles = ", ".join(n.get("title", "") for n in notes)
    return (
        f"REVIEWER: {reviewer_name}\n"
        f"FRAMEWORK: {framework.code}\n"
        f"TASK: Identify ADDITIONAL {reviewer_name} findings the deterministic "
        f"rules may have missed. Every standards or regulatory finding MUST "
        f"carry a citation_key that resolves to the authority corpus; an "
        f"unverifiable citation will be rejected. Return JSON: "
        f'{{"findings": [{{"statement","section","message","fix","severity",'
        f'"confidence_label","category","citation_key"}}]}}.\n'
        f"NOTE TITLES PRESENT: {note_titles}\n"
    )


def parse_model_findings(raw: str, reviewer_name: str, context: dict) -> list[dict]:
    """Parse a model response into v9 findings. Malformed entries are dropped
    (the model cannot crash the run); survivors still face citation
    verification, schema validation, and the skeptic downstream."""
    framework = context["framework"]
    versions = context["versions"]
    try:
        payload = json.loads(raw)
        entries = payload.get("findings", [])
    except (json.JSONDecodeError, AttributeError):
        return []
    out = []
    for e in entries:
        if not isinstance(e, dict):
            continue
        message = e.get("message")
        fix = e.get("fix")
        statement = e.get("statement")
        section = e.get("section")
        severity = e.get("severity")
        confidence = e.get("confidence_label", "PROBABLE")
        category = e.get("category")
        if not all([message, fix, statement, section, severity, category]):
            continue
        if severity not in ("CRITICAL", "HIGH", "MEDIUM", "LOW"):
            continue
        if confidence not in ("CERTAIN", "PROBABLE", "POSSIBLE"):
            confidence = "PROBABLE"
        finding = make_finding(
            source=reviewer_name, category=category, severity=severity,
            confidence_label=confidence, statement=statement, section=section,
            sort_order=65, message=message, fix=fix,
            framework_code=framework.code, versions=versions,
            citation_key=e.get("citation_key"),
            legacy_layer=SOURCE_TO_LAYER.get(reviewer_name),
        )
        finding["model_generated"] = True
        out.append(finding)
    return out


def make_adapter(config: dict) -> ModelAdapter:
    name = config.get("adapter", "rule_based")
    if name == "rule_based":
        return RuleBasedAdapter()
    if name == "claude":
        cassette = config.get("replay_cassette")
        client = ReplayClient(cassette) if cassette is not None else None
        return ClaudeAdapter(config.get("model_pin", ""), client=client)
    raise AdapterNotConfigured(f"unknown adapter {name!r}")
