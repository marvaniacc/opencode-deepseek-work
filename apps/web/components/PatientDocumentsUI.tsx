"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Icon, Card, EmptyState, cn } from "@wishubest/ui";
import { client, uploadFile } from "@/lib/clientApi";
import { API_URL } from "@/lib/env";

interface Doc {
  id: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  title: string | null;
  description: string | null;
  status: string;
  uploadedAt: string;
}

interface Grant {
  id: string;
  providerId: string;
  providerName: string;
  grantedAt: string;
  revokedAt: string | null;
  active: boolean;
}

interface DoctorOption {
  id: string;
  title: string;
  specialty: string;
}

export function PatientDocumentsUI({ locale }: { locale: "fa" | "en" }) {
  const t = (fa: string, en: string) => (locale === "fa" ? fa : en);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [granting, setGranting] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const [d, g] = await Promise.all([
        client.get<{ documents: Doc[] }>("/documents"),
        client.get<{ grants: Grant[] }>("/documents/grants"),
      ]);
      setDocs(d.documents);
      setGrants(g.grants);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    (async () => {
      try {
        const res = await client.get<{ doctors: DoctorOption[] }>("/doctors?limit=50");
        setDoctors(res.doctors);
      } catch {
        // ignore
      }
    })();
  }, []);

  const upload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await uploadFile("/documents/upload", file, {
        ...(title ? { title } : {}),
      });
      setFile(null);
      setTitle("");
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch (err: any) {
      setError(err.message ?? "upload_failed");
    } finally {
      setUploading(false);
    }
  };

  const grant = async () => {
    if (!selectedProvider) return;
    setGranting(true);
    setError(null);
    try {
      await client.post("/documents/grants", { providerId: selectedProvider });
      setSelectedProvider("");
      await load();
    } catch (err: any) {
      setError(err.message ?? "grant_failed");
    } finally {
      setGranting(false);
    }
  };

  const revoke = async (providerId: string) => {
    setError(null);
    try {
      await client.post(`/documents/grants/${providerId}/revoke`);
      await load();
    } catch (err: any) {
      setError(err.message ?? "revoke_failed");
    }
  };

  const archive = async (id: string) => {
    setError(null);
    try {
      await client.post(`/documents/${id}/archive`);
      await load();
    } catch (err: any) {
      setError(err.message ?? "archive_failed");
    }
  };

  const download = async (id: string) => {
    setDownloading(id);
    setError(null);
    try {
      const res = await client.post<{ downloadUrl: string }>(`/documents/${id}/download`);
      const blob = await fetch(`${API_URL}${res.downloadUrl}`, { credentials: "include" }).then((r) => {
        if (!r.ok) throw new Error("download_failed");
        return r.blob();
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = docs.find((d) => d.id === id)?.originalFilename ?? "download";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message ?? "download_failed");
    } finally {
      setDownloading(null);
    }
  };

  const fmtSize = (bytes: number) =>
    bytes > 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <Icon name="document" className="h-4 w-4 text-[var(--fg-muted)]" />
            <h3 className="text-sm font-semibold text-[var(--fg)]">
              {t("اسناد پزشکی من", "My medical documents")}
            </h3>
          </div>
          {docs.length === 0 ? (
            <EmptyState
              icon="document"
              title={t("اسنادی ثبت نشده", "No documents yet")}
              description={t("گزارش آزمایش، نسخه یا مدارک دیگر را برای پزشک خود بارگذاری کنید.", "Upload lab reports, prescriptions or other records to share with your doctor.")}
            />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {docs.map((d) => (
                <li key={d.id} className="flex items-center gap-3 py-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--bg-subtle)]">
                    <Icon name="file" className="h-5 w-5 text-[var(--fg-muted)]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--fg)]">
                      {d.title || d.originalFilename}
                    </p>
                    <p className="truncate text-xs text-[var(--fg-subtle)]">
                      {d.originalFilename} · {fmtSize(d.sizeBytes)} · {d.status === "active" ? t("فعال", "Active") : t("بایگانی", "Archived")}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button size="sm" variant="secondary" loading={downloading === d.id} onClick={() => download(d.id)}>
                      <Icon name="download" className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => archive(d.id)}>
                      {t("حذف", "Delete")}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <h3 className="mb-3 text-sm font-semibold text-[var(--fg)]">{t("بارگذاری سند", "Upload document")}</h3>
          <div className="space-y-3">
            <input
              type="file"
              ref={fileRef}
              accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-xs text-[var(--fg-muted)] file:mr-3 file:rounded-[var(--radius-sm)] file:border-0 file:bg-[var(--bg-subtle)] file:px-3 file:py-2 file:text-xs file:text-[var(--fg)]"
            />
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("عنوان (اختیاری)", "Title (optional)")}
              className="h-9 w-full rounded-[var(--radius-sm)] border border-[var(--border)] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
            <Button onClick={upload} loading={uploading} disabled={!file} className="w-full">
              {t("بارگذاری", "Upload")}
            </Button>
            <p className="text-[10px] leading-relaxed text-[var(--fg-subtle)]">
              {t("PDF، تصویر یا سند Word تا ۱۰ مگابایت.", "PDF, image or Word doc up to 10MB.")}
            </p>
          </div>
        </Card>

        <Card>
          <h3 className="mb-3 text-sm font-semibold text-[var(--fg)]">{t("دسترسی پزشکان", "Doctor access")}</h3>
          <div className="space-y-3">
            <div className="flex gap-2">
              <select
                value={selectedProvider}
                onChange={(e) => setSelectedProvider(e.target.value)}
                className="h-9 flex-1 rounded-[var(--radius-sm)] border border-[var(--border)] px-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              >
                <option value="">{t("انتخاب پزشک...", "Select doctor...")}</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title} - {d.specialty}
                  </option>
                ))}
              </select>
              <Button size="sm" onClick={grant} loading={granting} disabled={!selectedProvider}>
                {t("افزودن", "Grant")}
              </Button>
            </div>
            {grants.length === 0 ? (
              <p className="text-xs text-[var(--fg-subtle)]">{t("هنوز دسترسی داده نشده.", "No access granted yet.")}</p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {grants.map((g) => (
                  <li key={g.id} className="flex items-center justify-between gap-2 py-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "h-2 w-2 rounded-full",
                          g.active ? "bg-green-500" : "bg-[var(--fg-subtle)]"
                        )}
                      />
                      <span className="text-sm text-[var(--fg)]">{g.providerName}</span>
                    </div>
                    {g.active && (
                      <Button size="sm" variant="ghost" onClick={() => revoke(g.providerId)}>
                        {t("قطع دسترسی", "Revoke")}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        {error && (
          <p className="rounded-[var(--radius-sm)] bg-[var(--danger-muted)] px-3 py-2 text-xs text-[var(--danger)]">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}