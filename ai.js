// ai.js — AI provider definitions and API calls (shared by background.js and options.js)

const AI_PROVIDERS = {
  gemini: {
    label: "Google Gemini",
    defaultModel: "gemini-2.5-flash",
    models: ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro"],
    keyUrl: "https://aistudio.google.com/apikey",
  },
  openai: {
    label: "OpenAI (ChatGPT)",
    defaultModel: "gpt-4o-mini",
    models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini"],
    keyUrl: "https://platform.openai.com/api-keys",
  },
  anthropic: {
    label: "Anthropic Claude",
    defaultModel: "claude-haiku-4-5-20251001",
    models: ["claude-haiku-4-5-20251001", "claude-sonnet-5-5", "claude-opus-5-5"],
    keyUrl: "https://console.anthropic.com/settings/keys",
  },
  // Any service exposing an OpenAI-style /chat/completions endpoint
  // (OpenRouter, Groq, DeepSeek, Mistral, a local Ollama server, …)
  custom: {
    label: "Other (OpenAI-compatible)",
    defaultModel: "",
    models: [],
    keyUrl: "",
  },
};

const DEFAULT_AI_SETTINGS = {
  provider: "gemini",
  keys: {},          // provider id → API key
  models: {},        // provider id → model id
  customBaseUrl: "", // e.g. https://openrouter.ai/api/v1
  instructions: "",  // extra prompt instructions for the bullet points
};

async function loadAiSettings() {
  const { aiSettings = {} } = await chrome.storage.local.get("aiSettings");
  return {
    ...DEFAULT_AI_SETTINGS,
    ...aiSettings,
    keys: { ...aiSettings.keys },
    models: { ...aiSettings.models },
  };
}

async function postJson(url, headers, body) {
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });
  } catch (error) {
    throw new Error(error.name === "TimeoutError" ? "The AI service timed out" : `Network error: ${error.message}`);
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = data?.error?.message || (typeof data?.error === "string" ? data.error : null) || res.statusText;
    throw new Error(`${res.status} — ${detail}`);
  }
  return data;
}

async function callGemini(key, model, system, user) {
  const data = await postJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    { "x-goog-api-key": key },
    {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
    }
  );
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.filter(p => !p.thought).map(p => p.text || "").join("");
}

async function callOpenAiCompatible(baseUrl, key, model, system, user) {
  const data = await postJson(
    `${baseUrl.replace(/\/+$/, "")}/chat/completions`,
    key ? { Authorization: `Bearer ${key}` } : {},
    {
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }
  );
  return data?.choices?.[0]?.message?.content || "";
}

async function callAnthropic(key, model, system, user) {
  const data = await postJson(
    "https://api.anthropic.com/v1/messages",
    {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    {
      model,
      max_tokens: 1024,
      system,
      messages: [{ role: "user", content: user }],
    }
  );
  return (data?.content || []).filter(b => b.type === "text").map(b => b.text).join("");
}

// Sends one system + user prompt to the configured provider and returns the reply text.
async function callAi(settings, system, user) {
  const provider = settings.provider;
  const info = AI_PROVIDERS[provider];
  if (!info) throw new Error("No AI provider selected — open Settings");

  const key = (settings.keys[provider] || "").trim();
  const model = (settings.models[provider] || info.defaultModel).trim();

  // A custom endpoint may be a local server that needs no key
  if (!key && provider !== "custom") throw new Error(`No API key saved for ${info.label} — open Settings`);
  if (!model) throw new Error(`No model set for ${info.label} — open Settings`);

  let text;
  if (provider === "gemini") {
    text = await callGemini(key, model, system, user);
  } else if (provider === "anthropic") {
    text = await callAnthropic(key, model, system, user);
  } else if (provider === "openai") {
    text = await callOpenAiCompatible("https://api.openai.com/v1", key, model, system, user);
  } else {
    if (!settings.customBaseUrl) throw new Error("No base URL set for the custom provider — open Settings");
    text = await callOpenAiCompatible(settings.customBaseUrl, key, model, system, user);
  }

  if (!text.trim()) throw new Error(`${info.label} returned an empty response`);
  return text;
}
