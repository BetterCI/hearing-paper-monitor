const MODEL = "MiniMax-M2.7";
const API_BASE = "https://api.minimaxi.com/v1";
const REQUIRED_FIELDS = ["scientific_question", "key_highlight", "main_limitation", "methodology_steps", "research_implication"];

async function handleRequest(request, env) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { paper, language = "en" } = body;
  if (!paper || !paper.abstract) {
    return json({ error: "Missing paper abstract" }, 400);
  }

  if (!env.MINIMAX_API_KEY) {
    return json({ error: "API key not configured" }, 500);
  }

  const cacheKey = `analysis:${hashPaper(paper)}`;
  const cached = await env.KV.get(cacheKey);
  if (cached) {
    return json(JSON.parse(cached));
  }

  try {
    const result = await callMiniMax(paper, language, env.MINIMAX_API_KEY);
    await env.KV.put(cacheKey, JSON.stringify(result), { expirationTtl: 86400 });
    return json(result);
  } catch (err) {
    return json({ error: err.message || "Analysis failed" }, 500);
  }
}

function hashPaper(paper) {
  const text = (paper.title || "") + (paper.abstract || "");
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + ch;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

async function callMiniMax(paper, language, apiKey) {
  const target = language.startsWith("zh") ? "Chinese" : "English";
  const abstract = (paper.abstract || "").split(/\s+/).slice(0, 300).join(" ");
  const prompt = buildPrompt(paper, abstract, target);

  const response = await fetch(`${API_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "hearing-paper-monitor-cf-worker/1.0",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: "You are a cautious hearing-science and psychoacoustics research assistant. Analyze only what is supported by the title and abstract. Return strict JSON only.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 800,
    }),
  });

  if (!response.ok) {
    throw new Error(`MiniMax API error: ${response.status}`);
  }

  const data = await response.json();
  const content = extractContent(data);
  const parsed = parseJson(content);
  validateResult(parsed);
  return parsed;
}

function buildPrompt(paper, abstract, target) {
  const keywords = (paper.keywords || []).join(", ");
  const tags = (paper.tags || []).join(", ");
  return `Analyze this paper abstract for a literature-monitoring dashboard.

Return a compact JSON object with exactly these keys:
{
  "scientific_question": "one sentence describing the central scientific question",
  "key_highlight": "one sentence describing the strongest finding or methodological highlight",
  "main_limitation": "one sentence describing the main limitation or uncertainty inferred from the study design, sample, or methodology; if nothing substantial can be inferred, write 'Limited generalizability due to small or specific sample' or 'Potential confounding factors not fully controlled' based on typical study weaknesses",
  "methodology_steps": "semicolon-separated ordered workflow with 3-6 concrete experimental or analytical steps; each step should be 4-10 words and use methods actually stated in the abstract",
  "research_implication": "one sentence describing what this study implies for hearing aid, cochlear implant, or speech perception research; if the study is not directly related to these topics, write 'General research findings' or focus on broader hearing science implications"
}

For methodology_steps, reconstruct the study pipeline in temporal order when supported: participants/samples/data source; stimulus/intervention/device/task; recording or measurement; preprocessing/modeling/statistical comparison; validation or outcome assessment. Prefer specific method names from the abstract. Avoid vague steps such as "data collection", "analysis", or "result evaluation" unless the abstract gives no more detail. If the paper is a review, commentary, or modeling-only paper, still provide an abstract-supported workflow such as literature selection, evidence synthesis, model construction, simulation, or validation. Do not number the steps.

Write the values in ${target}. Avoid hype. Do not mention PDFs. Do not invent sample sizes, methods, or conclusions. Infer limitations only from what is present in the abstract or commonly implied by the study design.

Title: ${paper.title || ""}
Journal: ${paper.journal || ""}
Section: ${paper.section || ""}
Tags: ${tags}
Keywords: ${keywords}
Abstract: ${abstract}`.trim();
}

function extractContent(data) {
  const choices = data.choices || [];
  if (!choices.length) throw new Error("No choices in response");
  let content = choices[0].message?.content || choices[0].text || "";
  content = content.replace(/<[^>]+>/g, "");
  return content.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "").trim();
}

function parseJson(content) {
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("No JSON object found");
  }
}

function validateResult(value) {
  for (const field of REQUIRED_FIELDS) {
    if (!value[field]) throw new Error(`Missing field: ${field}`);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export default { fetch: handleRequest };
