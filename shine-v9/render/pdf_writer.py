"""Dependency-free minimal PDF writer (PDF 1.4, Helvetica, multi-page).

Produces a valid text PDF: header, body lines with bold support, running
footer with attribution and page numbers. Deliberately small: the v9 exports
are structured text reports; layout sophistication lives in the dashboard.
"""
from __future__ import annotations

PAGE_W, PAGE_H = 612, 792
MARGIN_X, TOP_Y, BOTTOM_Y = 54, 752, 60
LINE_H = 13
MAX_CHARS = 96


# Transliterate the common non-latin-1 characters that appear in finding text
# and corpus snippets to ASCII equivalents, so PDF content is never silently
# replaced with "?" (audit 2-2). Anything still outside latin-1 after this map
# falls back to the encoder's replace, but the map covers the real cases:
# curly quotes, dashes, ellipsis, non-breaking space, bullet.
_LATIN1_MAP = {
    "‘": "'", "’": "'", "‚": "'", "‛": "'",
    "“": '"', "”": '"', "„": '"', "‟": '"',
    "–": "-", "—": ":", "―": ":", "−": "-",
    "…": "...", "•": "-", " ": " ", " ": " ",
    "·": "·",  # middle dot is in latin-1; keep it
    "﻿": "",
}
_LATIN1_TABLE = str.maketrans(_LATIN1_MAP)


def latinize(text: str) -> str:
    return text.translate(_LATIN1_TABLE)


def _esc(text: str) -> str:
    text = latinize(text)
    return text.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")


def _wrap(text: str, width: int = MAX_CHARS) -> list[str]:
    words, lines, cur = text.split(), [], ""
    for w in words:
        if len(cur) + len(w) + 1 > width:
            lines.append(cur)
            cur = w
        else:
            cur = f"{cur} {w}".strip()
    if cur:
        lines.append(cur)
    return lines or [""]


class PdfBuilder:
    """Line-oriented builder. add(text, bold, size, indent); page breaks are
    automatic; footer drawn on every page at save time."""

    def __init__(self, footer_left: str, footer_right_prefix: str = "Page"):
        self.footer_left = footer_left
        self.footer_right_prefix = footer_right_prefix
        self.pages: list[list[tuple]] = [[]]
        self.y = TOP_Y

    def _ensure(self, needed: int = LINE_H):
        if self.y - needed < BOTTOM_Y:
            self.pages.append([])
            self.y = TOP_Y

    def add(self, text: str = "", *, bold: bool = False, size: int = 9, indent: int = 0):
        for line in _wrap(text) if text else [""]:
            self._ensure(size + 4)
            self.pages[-1].append((MARGIN_X + indent, self.y, line, bold, size))
            self.y -= max(LINE_H, size + 4)

    def add_rule(self):
        self.add("-" * 80, size=7)

    def build(self) -> bytes:
        objects: list[bytes] = []

        def obj(body: bytes) -> int:
            objects.append(body)
            return len(objects)

        font_regular = obj(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
        font_bold = obj(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>")

        page_obj_ids, content_obj_ids = [], []
        total = len(self.pages)
        for number, lines in enumerate(self.pages, start=1):
            stream_parts = []
            for x, y, text, bold, size in lines:
                font = "/F2" if bold else "/F1"
                stream_parts.append(
                    f"BT {font} {size} Tf {x} {y} Td ({_esc(text)}) Tj ET")
            footer_y = 36
            stream_parts.append(
                f"BT /F1 7 Tf {MARGIN_X} {footer_y} Td ({_esc(self.footer_left)}) Tj ET")
            right_text = f"{self.footer_right_prefix} {number} of {total}"
            stream_parts.append(
                f"BT /F1 7 Tf {PAGE_W - MARGIN_X - len(right_text) * 4} {footer_y} Td ({_esc(right_text)}) Tj ET")
            stream = "\n".join(stream_parts).encode("latin-1", errors="replace")
            content_id = obj(b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n"
                             + stream + b"\nendstream")
            content_obj_ids.append(content_id)
            page_obj_ids.append(None)  # placeholder, assigned below

        pages_id = len(objects) + len(self.pages) + 1
        for i, content_id in enumerate(content_obj_ids):
            page_obj_ids[i] = obj(
                b"<< /Type /Page /Parent " + str(pages_id).encode()
                + b" 0 R /MediaBox [0 0 612 792] /Contents " + str(content_id).encode()
                + b" 0 R /Resources << /Font << /F1 " + str(font_regular).encode()
                + b" 0 R /F2 " + str(font_bold).encode() + b" 0 R >> >> >>")

        kids = b"[" + b" ".join(str(i).encode() + b" 0 R" for i in page_obj_ids) + b"]"
        actual_pages_id = obj(b"<< /Type /Pages /Kids " + kids + b" /Count "
                              + str(len(page_obj_ids)).encode() + b" >>")
        assert actual_pages_id == pages_id, "pages object id misprediction"
        catalog_id = obj(b"<< /Type /Catalog /Pages " + str(pages_id).encode() + b" 0 R >>")

        out = bytearray(b"%PDF-1.4\n")
        offsets = [0]
        for i, body in enumerate(objects, start=1):
            offsets.append(len(out))
            out += str(i).encode() + b" 0 obj\n" + body + b"\nendobj\n"
        xref_at = len(out)
        out += b"xref\n0 " + str(len(objects) + 1).encode() + b"\n"
        out += b"0000000000 65535 f \n"
        for off in offsets[1:]:
            out += f"{off:010d} 00000 n \n".encode()
        out += (b"trailer\n<< /Size " + str(len(objects) + 1).encode()
                + b" /Root " + str(catalog_id).encode() + b" 0 R >>\n"
                + b"startxref\n" + str(xref_at).encode() + b"\n%%EOF\n")
        return bytes(out)
