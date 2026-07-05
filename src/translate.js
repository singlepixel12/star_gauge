// src/translate.js — OpenAI Chat Completions integration.
// SCAFFOLDED BUT DISABLED: translatePoem() is not called anywhere in v1 and
// must consume zero credits. Enabling later: supply an API key, set
// LLM_ENABLED = true in app.js, and wire the Translate button (see app.js note).
// SECURITY NOTE: calling OpenAI directly from a browser exposes the key to that
// browser — fine for personal/local use; use a proxy for anything public.
export const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
export const DEFAULT_MODEL = 'gpt-4o-mini'; // swap freely for a newer model id

export function buildOpenAIRequest(promptText, { model = DEFAULT_MODEL, apiKey = '' } = {}) {
  return {
    url: OPENAI_URL,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'You are a literary translator of classical Chinese poetry.' },
        { role: 'user', content: promptText },
      ],
    }),
  };
}

// NOTE: not invoked in v1. Present so enabling the live call later is trivial.
export async function translatePoem(promptText, apiKey, { model = DEFAULT_MODEL } = {}) {
  const req = buildOpenAIRequest(promptText, { model, apiKey });
  const res = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`OpenAI request failed: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}
