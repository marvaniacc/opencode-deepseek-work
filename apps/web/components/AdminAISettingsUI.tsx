"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Icon, cn } from "@wishubest/ui";
import { client } from "@/lib/clientApi";

interface Setting {
  id: string;
  provider: string;
  apiKeyMasked: string;
  hasApiKey: boolean;
  modelName: string;
  systemPrompt: string;
  active: boolean;
  updatedAt: string;
}

const PROVIDERS = [
  { value: "mock", label: "Mock (no API key, for dev/test)" },
  { value: "openai", label: "OpenAI (GPT-4o)" },
  { value: "anthropic", label: "Anthropic (Claude)" },
];

export function AdminAISettingsUI({ locale }: { locale: "fa" | "en" }) {
  const t = (fa: string, en: string) => (locale === "fa" ? fa : en);
  const [settings, setSettings] = useState<Setting[]>([]);
  const [provider, setProvider] = useState("mock");
  const [modelName, setModelName] = useState("mock-translator");
  const [systemPrompt, setSystemPrompt] = useState("You are a medical interpreter. Translate the message faithfully.");
  const [apiKey, setApiKey] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await client.get<{ settings: Setting[] }>("/admin/ai-settings");
      setSettings(res.settings);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setTestResult(null);
    try {
      await client.post("/admin/ai-settings", {
        provider,
        modelName,
        systemPrompt,
        active,
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
      });
      setApiKey("");
      await load();
    } catch (err: any) {
      setError(err.message ?? "save_failed");
    } finally {
      setSaving(false);
    }
  };

  const activate = async (id: string) => {
    setError(null);
    try {
      await client.post(`/admin/ai-settings/${id}/activate`);
      await load();
    } catch (err: any) {
      setError(err.message ?? "activate_failed");
    }
  };

  const test = async (id: string) => {
    setTestingId(id);
    setError(null);
    try {
      const res = await client.post<{ result: { translatedText: string; modelUsed: string } }>(
        `/admin/ai-settings/${id}/test`
      );
      setTestResult(`${res.result.translatedText} (via ${res.result.modelUsed})`);
    } catch (err: any) {
      setError(err.message ?? "test_failed");
    } finally {
      setTestingId(null);
    }
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(locale === "fa" ? "fa-IR" : "en-US", { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card>
        <h3 className="mb-4 text-sm font-semibold text-[var(--fg)]">
          {t("پیکربندی ترجمه هوشمند", "AI translation settings")}
        </h3>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-[var(--fg-subtle)]">{t("ارائه‌دهنده", "Provider")}</label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="h-9 w-full rounded-[var(--radius-sm)] border border-[var(--border)] px-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            >
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--fg-subtle)]">{t("مدل", "Model")}</label>
            <input
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              placeholder="e.g. gpt-4o-mini / claude-3-5-sonnet / mock-translator"
              className="h-9 w-full rounded-[var(--radius-sm)] border border-[var(--border)] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--fg-subtle)]">{t("دستور سیستم", "System prompt")}</label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={3}
              className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] p-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--fg-subtle)]">
              {t("کلید API (فقط هنگام تغییر)", "API key (only needed when changing)")}
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-…"
              className="h-9 w-full rounded-[var(--radius-sm)] border border-[var(--border)] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
            <p className="mt-1 text-[10px] text-[var(--fg-subtle)]">
              {t("کلید به صورت رمزنگاری‌شده ذخیره می‌شود و هرگز به رابط کاربری ارسال نمی‌شود.", "The key is stored encrypted and never sent to the UI.")}
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm text-[var(--fg)]">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            {t("فعال (استفاده در ترجمه چت)", "Active (used for chat translation)")}
          </label>
          <Button onClick={save} loading={saving} className="w-full">
            {t("ذخیره تنظیمات", "Save settings")}
          </Button>
          {error && <p className="rounded-[var(--radius-sm)] bg-[var(--danger-muted)] px-3 py-2 text-xs text-[var(--danger)]">{error}</p>}
          {testResult && (
            <p className="rounded-[var(--radius-sm)] bg-green-50 px-3 py-2 text-xs text-green-700">
              {t("نتیجه تست:", "Test result:")} {testResult}
            </p>
          )}
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-semibold text-[var(--fg)]">{t("تنظیمات ذخیره‌شده", "Saved settings")}</h3>
        {settings.length === 0 ? (
          <p className="text-xs text-[var(--fg-subtle)]">{t("تنظیمی ثبت نشده.", "No settings saved yet.")}</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {settings.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-[var(--fg)]">
                      {s.provider} · {s.modelName}
                    </p>
                    {s.active && (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] text-green-700">
                        {t("فعال", "Active")}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-[var(--fg-subtle)]">{s.systemPrompt}</p>
                  <p className="text-[10px] text-[var(--fg-subtle)]">
                    {s.apiKeyMasked} · {fmt(s.updatedAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {!s.active && (
                    <Button size="sm" variant="secondary" onClick={() => activate(s.id)}>
                      {t("فعال‌سازی", "Activate")}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" loading={testingId === s.id} onClick={() => test(s.id)}>
                    {t("تست", "Test")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}