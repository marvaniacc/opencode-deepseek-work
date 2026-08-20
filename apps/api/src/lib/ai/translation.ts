import { prisma } from "@wishubest/db";
import { decryptSecret } from "../crypto";
import { loadConfig } from "../../config";

export interface TranslationResult {
  translatedText: string;
  modelUsed: string;
}

/**
 * Server-side AI translation. Only the active AiTranslationSetting is used.
 * The api_key is decrypted here (server-only) and NEVER exposed to clients
 * or logs. Retries once with backoff on transient failures.
 */
export async function translateWithActiveSetting(
  text: string,
  targetLocale: string
): Promise<TranslationResult> {
  const config = loadConfig();
  const setting = await prisma.aiTranslationSetting.findFirst({
    where: { active: true },
    orderBy: { updatedAt: "desc" },
  });
  if (!setting) {
    throw new Error("ai_translation_not_configured");
  }

  const apiKey = decryptSecret(setting.apiKeyEncrypted, config.dbEncryptionKey);
  const result = await callProvider({
    provider: setting.provider,
    apiKey,
    model: setting.modelName,
    systemPrompt: setting.systemPrompt,
    text,
    targetLocale,
  });
  return { translatedText: result, modelUsed: setting.modelName };
}

async function callProvider(opts: {
  provider: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  text: string;
  targetLocale: string;
}): Promise<string> {
  const { provider, apiKey, model, systemPrompt, text, targetLocale } = opts;

  if (provider === "mock") {
    return `[${targetLocale}] ${text}`;
  }

  const userContent = systemPrompt.replace(/\{target_locale\}/g, targetLocale);

  if (provider === "openai") {
    const body = {
      model,
      messages: [
        { role: "system", content: userContent },
        { role: "user", content: text },
      ],
      temperature: 0,
    };
    const res = await fetchWithRetry("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as any;
    return data.choices?.[0]?.message?.content ?? "";
  }

  if (provider === "anthropic") {
    const body = {
      model,
      max_tokens: 1024,
      system: userContent,
      messages: [{ role: "user", content: text }],
    };
    const res = await fetchWithRetry("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as any;
    return data.content?.[0]?.text ?? "";
  }

  throw new Error(`unsupported_translation_provider: ${provider}`);
}

async function fetchWithRetry(url: string, init: RequestInit, attempts = 2): Promise<Response> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, init);
      if (res.ok) return res;
      lastError = new Error(`AI provider HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, 300 * (i + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("ai_provider_unreachable");
}