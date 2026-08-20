"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChatBubble,
  Button,
  Icon,
  EmptyState,
  relativeTime,
  cn,
} from "@wishubest/ui";
import { client } from "@/lib/clientApi";

interface Thread {
  id: string;
  status: string;
  bookingId: string | null;
  lastMessage: { text: string; senderId: string; createdAt: string } | null;
  otherParty: { id: string; name: string };
}

interface Message {
  id: string;
  senderId: string;
  senderLocale: string;
  originalText: string;
  createdAt: string;
}

export function ChatUI({ locale, myUserId }: { locale: "fa" | "en"; myUserId: string }) {
  const t = (fa: string, en: string) => (locale === "fa" ? fa : en);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastCreatedAt = useRef<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadThreads = useCallback(async () => {
    try {
      const res = await client.get<{ threads: Thread[] }>("/chat/threads");
      setThreads(res.threads);
    } catch {
      // ignore
    }
  }, []);

  const startThread = async (providerId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await client.post<{ thread: Thread }>("/chat/threads", { providerId });
      setActiveThread(res.thread.id);
      await loadThreads();
    } catch (err: any) {
      setError(err.message ?? "failed");
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = useCallback(async (threadId: string, after?: string) => {
    try {
      const res = await client.get<{ messages: Message[] }>(
        `/chat/threads/${threadId}/messages${after ? `?after=${encodeURIComponent(after)}` : ""}`
      );
      if (res.messages.length) {
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const fresh = res.messages.filter((m) => !seen.has(m.id));
          return [...prev, ...fresh].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
        });
        lastCreatedAt.current = res.messages[res.messages.length - 1]!.createdAt;
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    if (!activeThread) return;
    setMessages([]);
    lastCreatedAt.current = null;
    loadMessages(activeThread);
    pollRef.current = setInterval(() => loadMessages(activeThread, lastCreatedAt.current ?? undefined), 4000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [activeThread, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || !activeThread) return;
    setError(null);
    try {
      await client.post(`/chat/threads/${activeThread}/messages`, { text });
      setInput("");
      await loadMessages(activeThread, lastCreatedAt.current ?? undefined);
      await loadThreads();
    } catch (err: any) {
      setError(err.message ?? "send_failed");
    }
  };

  const translate = async (messageId: string) => {
    if (translations[messageId]) return;
    try {
      const res = await client.post<{ translation: { translatedText: string } }>(
        `/chat/messages/${messageId}/translate`,
        { targetLocale: locale }
      );
      setTranslations((prev) => ({ ...prev, [messageId]: res.translation.translatedText }));
    } catch (err: any) {
      setError(err.message ?? "translation_failed");
    }
  };

  const activeThreadData = threads.find((th) => th.id === activeThread);

  return (
    <div className="grid gap-4 md:grid-cols-[280px_1fr]">
      {/* Threads list */}
      <div className="flex flex-col gap-2">
        {threads.length === 0 ? (
          <EmptyState icon="chat" title={t("چتی وجود ندارد", "No conversations")} />
        ) : (
          threads.map((th) => (
            <button
              key={th.id}
              onClick={() => setActiveThread(th.id)}
              className={cn(
                "flex items-center gap-3 rounded-[var(--radius)] border px-3 py-3 text-left transition-colors",
                activeThread === th.id
                  ? "border-[var(--accent)] bg-[var(--accent-muted)]"
                  : "border-[var(--border)] hover:bg-[var(--bg-muted)]"
              )}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--bg-subtle)] text-sm font-semibold text-[var(--fg-muted)]">
                {th.otherParty.name.slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--fg)]">{th.otherParty.name}</p>
                <p className="truncate text-xs text-[var(--fg-subtle)]">
                  {th.lastMessage?.text ?? t("گفتگو را شروع کنید", "Start the conversation")}
                </p>
              </div>
              {th.lastMessage && (
                <span className="shrink-0 text-[10px] text-[var(--fg-subtle)]">
                  {relativeTime(th.lastMessage.createdAt, locale)}
                </span>
              )}
            </button>
          ))
        )}
      </div>

      {/* Chat window */}
      <div className="flex min-h-[60vh] flex-col rounded-[var(--radius)] border border-[var(--border)]">
        {activeThreadData ? (
          <>
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <p className="text-sm font-medium text-[var(--fg)]">{activeThreadData.otherParty.name}</p>
              <span className="text-xs text-[var(--fg-subtle)]">{t("به‌روزرسانی خودکار", "Auto-refreshing")}</span>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              {messages.map((m) => {
                const mine = m.senderId === myUserId;
                return (
                  <div key={m.id} className="space-y-1">
                    <ChatBubble mine={mine} footer={`${m.senderLocale} · ${relativeTime(m.createdAt, locale)}`}>
                      {translations[m.id] ? (
                        <span>{translations[m.id]}</span>
                      ) : (
                        <span>{m.originalText}</span>
                      )}
                    </ChatBubble>
                    {!mine && (
                      <button
                        onClick={() => translate(m.id)}
                        disabled={!!translations[m.id]}
                        className={cn(
                          "inline-flex items-center gap-1 text-xs text-[var(--fg-subtle)] transition-colors hover:text-[var(--accent)]",
                          translations[m.id] ? "pointer-events-none opacity-0" : ""
                        )}
                      >
                        <Icon name="translate" className="h-3.5 w-3.5" />
                        {t("ترجمه", "Translate")}
                      </button>
                    )}
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {error && (
              <p className="mx-4 mb-2 rounded-[var(--radius-sm)] bg-[var(--danger-muted)] px-3 py-2 text-xs text-[var(--danger)]">
                {error}
              </p>
            )}

            <div className="flex items-center gap-2 border-t border-[var(--border)] p-3">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder={t("پیام خود را بنویسید...", "Type a message...")}
                className="h-10 flex-1 rounded-[var(--radius-sm)] border border-[var(--border)] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
              <Button size="sm" onClick={send} disabled={!input.trim()}>
                {t("ارسال", "Send")}
              </Button>
            </div>
          </>
        ) : (
          <EmptyState
            icon="chat"
            title={t("یک گفتگو انتخاب کنید", "Select a conversation")}
            description={t("برای شروع چت با پزشک، یک گفتگو را انتخاب کنید.", "Pick a thread or start a new one.")}
          />
        )}
      </div>
    </div>
  );
}