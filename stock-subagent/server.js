const express = require("express");
const Anthropic = require("@anthropic-ai/sdk");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function analyzeCompany(name) {
  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 600,
    messages: [
      {
        role: "user",
        content: `You are an equity research analyst. Analyze the company: "${name}".
Return a concise JSON object with these exact keys:
{
  "company": "<name>",
  "sector": "<sector>",
  "summary": "<2 sentence business description>",
  "bull_case": "<1 sentence>",
  "bear_case": "<1 sentence>",
  "verdict": "BUY" | "HOLD" | "AVOID"
}
Respond with raw JSON only. No markdown, no extra text.`,
      },
    ],
  });

  const raw = msg.content.find((b) => b.type === "text")?.text || "{}";
  try {
    return JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    return { company: name, error: "Parse failed", raw };
  }
}

// SSE endpoint: streams one result per company as it completes
app.post("/analyze", async (req, res) => {
  const { companies } = req.body;
  if (!Array.isArray(companies) || companies.length === 0) {
    return res.status(400).json({ error: "No companies provided" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  for (const name of companies) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    try {
      const result = await analyzeCompany(trimmed);
      res.write(`data: ${JSON.stringify({ status: "ok", result })}\n\n`);
    } catch (err) {
      res.write(`data: ${JSON.stringify({ status: "error", company: trimmed, message: err.message })}\n\n`);
    }
  }

  res.write(`data: ${JSON.stringify({ status: "done" })}\n\n`);
  res.end();
});

app.listen(3000, () => console.log("Running at http://localhost:3000"));
