"""Model adapter boundary for the judgment layer.

Two implementations:

RuleBasedAdapter: deterministic Python rule execution. This is the CI and
acceptance-harness baseline; what the golden library measures is this path.

ClaudeAdapter: the production judgment path carrying MODEL_PIN. It is a stub
in this build: selecting it without credentials raises immediately and loudly.
A run never silently downgrades from model to rules; the adapter is chosen in
config and recorded in every finding's version stamp and in the run ledger.

No adapter, under any mode, participates in arithmetic. The deterministic
core has already run before any judge executes.
"""
from __future__ import annotations

import os


class AdapterNotConfigured(Exception):
    pass


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

    def __init__(self, model_pin: str):
        self.model_pin = model_pin
        if not os.environ.get("ANTHROPIC_API_KEY"):
            raise AdapterNotConfigured(
                "adapter=claude requires ANTHROPIC_API_KEY. The engine does not "
                "silently fall back to rule_based; set adapter explicitly in config.")

    def run_reviewer(self, reviewer_name: str, rule_callable, context: dict):
        raise AdapterNotConfigured(
            "ClaudeAdapter dispatch is a production integration point not exercised "
            "in this build environment. Run with adapter=rule_based, or integrate "
            "the pinned model call here and extend the harness before use.")


def make_adapter(config: dict) -> ModelAdapter:
    name = config.get("adapter", "rule_based")
    if name == "rule_based":
        return RuleBasedAdapter()
    if name == "claude":
        return ClaudeAdapter(config.get("model_pin", ""))
    raise AdapterNotConfigured(f"unknown adapter {name!r}")
