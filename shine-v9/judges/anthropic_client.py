"""Live Anthropic client implementing the ModelClient protocol.

The single network touchpoint. Imported lazily by judges.adapter.ClaudeAdapter
so the anthropic SDK is a SOFT dependency: rule_based and replay paths never
import it.

Configuration discipline:
- The model is read from MODEL_PIN (passed at construction); never hardcoded.
- temperature=0, max_tokens budgeted: identical inputs aim for identical
  outputs. The run ledger's results_digest will tell you when drift happens.
- Network failure halts the run with a clean error, not a silent rule-fallback.
"""
from __future__ import annotations

import os
from judges.adapter import ModelClient

# Soft dependency: the SDK is imported here, not in the orchestrator.
try:
    import anthropic
except ImportError:   # pragma: no cover - exercised by the adapter's fallback path
    anthropic = None


class AnthropicLiveClient(ModelClient):
    """One Anthropic SDK call per reviewer prompt. Surfaces errors loudly."""

    def __init__(self, model_pin: str, *, max_tokens: int = 2000, temperature: float = 0.0):
        if anthropic is None:
            raise ImportError("anthropic SDK not installed. `pip install anthropic`")
        if not os.environ.get("ANTHROPIC_API_KEY"):
            raise RuntimeError(
                "ANTHROPIC_API_KEY environment variable is not set. Export it before "
                "selecting adapter=claude with the live client.")
        self.model = model_pin
        self.max_tokens = max_tokens
        self.temperature = temperature
        self._client = anthropic.Anthropic()

    def complete(self, prompt: str) -> str:
        # Single user message; the prompt is fully self-contained per the
        # adapter's build_prompt(). The system role describes the contract.
        system = (
            "You are a senior fund-controllership reviewer working alongside a "
            "deterministic rule engine. The rules have already proven the "
            "arithmetic and checked the framework checklist. Your job is to "
            "identify ADDITIONAL judgment findings the rules may have missed: "
            "boilerplate disclosure, missing context, subtle presentation gaps. "
            "Every standards or regulatory finding MUST carry a verified ASC, "
            "IFRS, IAS, CIMA, CSSF, SEC, IRS or DELAWARE citation key; "
            "fabricated citations are rejected and discarded. Return ONLY the "
            'JSON object the user requests: {"findings": [...]}. No prose, no '
            "markdown fences. If you have no additional findings, return "
            '{"findings": []}.'
        )
        try:
            response = self._client.messages.create(
                model=self.model,
                max_tokens=self.max_tokens,
                temperature=self.temperature,
                system=system,
                messages=[{"role": "user", "content": prompt}],
            )
        except Exception as e:
            # The orchestrator's outer try/except surfaces this cleanly; we do
            # not silently treat a network failure as "no findings".
            raise RuntimeError(f"Anthropic API call failed: {type(e).__name__}: {e}") from e

        # Concatenate text blocks (the SDK returns a list of content items).
        parts = []
        for block in response.content:
            text = getattr(block, "text", None)
            if text:
                parts.append(text)
        return "".join(parts).strip()
