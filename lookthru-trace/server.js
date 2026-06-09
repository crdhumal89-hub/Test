const express = require("express");
const Anthropic = require("@anthropic-ai/sdk");

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.static(__dirname));

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function analyzeTrace(label, traceText) {
  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 800,
    system:
      "You are an expert SRE and distributed systems debugger. Analyze traces, stack traces, and logs with precision.",
    messages: [
      {
        role: "user",
        content: `Analyze the following trace or log snippet labeled "${label}":

---
${traceText}
---

Return a JSON object with exactly these keys:
{
  "label": "${label}",
  "severity": "CRITICAL" | "WARNING" | "INFO",
  "root_cause": "<1-2 sentence diagnosis of what went wrong or what this trace represents>",
  "services": ["<service or component name>", ...],
  "hotspot": "<the single most important line, function, or span to investigate>",
  "recommendation": "<1 concrete actionable fix or next step>",
  "latency_ms": <integer if a duration is detectable, otherwise null>
}
Respond with raw JSON only. No markdown, no extra text.`,
      },
    ],
  });

  const raw = msg.content.find((b) => b.type === "text")?.text || "{}";
  try {
    return JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    return { label, error: "Parse failed", raw };
  }
}

// SSE endpoint — streams one result card per trace as it completes
app.post("/analyze", async (req, res) => {
  const { traces } = req.body;
  if (!Array.isArray(traces) || traces.length === 0) {
    return res.status(400).json({ error: "No traces provided" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // Fan-out: analyze all traces concurrently, emit each result as it arrives
  const promises = traces.map(async ({ label, text }) => {
    const trimmedLabel = (label || "Trace").trim();
    const trimmedText = (text || "").trim();
    if (!trimmedText) return;
    try {
      const result = await analyzeTrace(trimmedLabel, trimmedText);
      res.write(`data: ${JSON.stringify({ status: "ok", result })}\n\n`);
    } catch (err) {
      res.write(
        `data: ${JSON.stringify({ status: "error", label: trimmedLabel, message: err.message })}\n\n`
      );
    }
  });

  await Promise.all(promises);
  res.write(`data: ${JSON.stringify({ status: "done" })}\n\n`);
  res.end();
});

app.listen(3000, () => console.log("LookThru Trace running at http://localhost:3000"));
