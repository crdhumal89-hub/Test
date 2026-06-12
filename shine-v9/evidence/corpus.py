"""Authority corpus loader and index.

Indexes citation keys from the v8 reference tree (ASC matrices, regulatory
corpus) and the v9 corpus additions (IFRS, US GAAP supplement, CSSF).

Key normalization makes 'ASC 820-10-50-2(c)' and '820-10-50-2C' resolve to the
same entry. Snippets are sanitized at load time (em dashes replaced) so corpus
typography can never leak into generated artifacts.
"""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

# Bold ASC entry: **946-205-45-1** or **820-10-50-2(c)** optionally prefixed ASC.
# Subtopic segment is 2 or 3 digits (820-10 vs 946-205).
_ASC_BOLD = re.compile(r"\*\*(?:ASC\s+)?(\d{3}-\d{2,3}-\d{2}-\d+[A-Za-z]?(?:\([a-z]\))?)\*\*")
# Bold IFRS/IAS entry: **IFRS 13.93(e)** or **IAS 1.10**
_IFRS_BOLD = re.compile(r"\*\*((?:IFRS|IAS)\s+\d+(?:\.\d+)*(?:\([a-z]\))?)\*\*")
# Regulatory heading: ## CIMA:PFA or ## CSSF:SUPERVISION or ## LUX:RCS-FILING
_REG_HEADING = re.compile(r"^#{2,3}\s+([A-Z]{2,6}:[A-Z0-9][A-Z0-9-]*)\b", re.MULTILINE)


def normalize_key(key: str) -> str:
    k = key.strip().upper()
    k = re.sub(r"^ASC\s+", "", k)
    k = k.replace(" ", "").replace("(", "").replace(")", "")
    return k


def _sanitize(text: str) -> str:
    return text.replace("—", ":").replace("–", "-").strip()


def _line_snippet(content: str, match_end: int, limit: int = 400) -> str:
    line_end = content.find("\n", match_end)
    if line_end == -1:
        line_end = len(content)
    snippet = content[match_end:line_end].lstrip(" :-—–*")
    return _sanitize(snippet)[:limit]


def _heading_snippet(content: str, match_end: int, limit: int = 400) -> str:
    rest = content[match_end:]
    next_heading = re.search(r"^#{1,3}\s", rest, re.MULTILINE)
    block = rest[: next_heading.start()] if next_heading else rest
    return _sanitize(" ".join(block.split()))[:limit]


class CorpusIndex:
    def __init__(self):
        self.entries: dict[str, dict] = {}   # normalized key -> {key, source, snippet}
        self.file_hashes: dict[str, str] = {}

    def add(self, key: str, source: str, snippet: str):
        norm = normalize_key(key)
        if norm not in self.entries:   # first definition wins; corpus order is config order
            self.entries[norm] = {"key": key, "source": source, "snippet": snippet}

    def lookup(self, key: str) -> dict | None:
        return self.entries.get(normalize_key(key))

    def search(self, terms: list[str], limit: int = 5) -> list[dict]:
        """Deterministic keyword retrieval: score by term hits, tie-break by key."""
        scored = []
        for norm, entry in self.entries.items():
            haystack = (entry["key"] + " " + entry["snippet"]).lower()
            score = sum(haystack.count(t.lower()) for t in terms)
            if score > 0:
                scored.append((score, norm, entry))
        scored.sort(key=lambda x: (-x[0], x[1]))
        return [e for _, _, e in scored[:limit]]


def load_corpus(base_dir: str | Path, corpus_paths: list[str]) -> CorpusIndex:
    base = Path(base_dir)
    index = CorpusIndex()
    for rel in corpus_paths:
        root = (base / rel).resolve()
        if not root.exists():
            continue
        for path in sorted(root.rglob("*")):
            if not path.is_file():
                continue
            rel_name = str(path.relative_to(root.parent))
            if path.suffix == ".md":
                content = path.read_text(encoding="utf-8")
                index.file_hashes[rel_name] = hashlib.sha256(content.encode()).hexdigest()[:16]
                for m in _ASC_BOLD.finditer(content):
                    index.add("ASC " + m.group(1), rel_name, _line_snippet(content, m.end()))
                for m in _IFRS_BOLD.finditer(content):
                    index.add(m.group(1), rel_name, _line_snippet(content, m.end()))
                for m in _REG_HEADING.finditer(content):
                    index.add(m.group(1), rel_name, _heading_snippet(content, m.end()))
            elif path.name == "_index.json":
                data = json.loads(path.read_text(encoding="utf-8"))
                index.file_hashes[rel_name] = hashlib.sha256(
                    path.read_bytes()).hexdigest()[:16]
                for juris in (data.get("jurisdictions") or {}).values():
                    for entry in juris.get("keys", []):
                        index.add(entry["key"], rel_name, _sanitize(entry.get("title", "")))
    return index
