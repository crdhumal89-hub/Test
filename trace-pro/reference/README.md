# Read-only reference

Extracted from the uploaded `TRACE_Platform__PATCHED.html` (1,381,209 bytes). The two modules are
embedded there as JS string literals assigned to `iframe.srcdoc`:

| File | Source | Bytes | Lines |
|---|---|---|---|
| `TRACE-Pro-original.html` | `window.MOD_TRACEPRO`, shell line 171 | 934,142 | 2,520 |
| `TRACE-sibling-original.html` | `window.MOD_TRACE`, shell line 168 | 324,189 | 4,916 |
| `TRACE_Platform-shell-original.html` | the upload, verbatim | 1,381,209 | 258 |

Extraction evaluated each string literal in a `node:vm` context, so the bytes are exactly what the
browser assigns to `srcdoc`. **These three files are read-only for the rest of the run.**
Only `TRACE-Pro-original.html` is in scope; the sibling and the shell are here for context.
