"use client";

import { useEffect, useState } from "react";
import { Button, Icon, Card, EmptyState } from "@wishubest/ui";
import { client } from "@/lib/clientApi";
import { API_URL } from "@/lib/env";

interface PatientEntry {
  patientId: string;
  firstName: string;
  lastName: string;
  email: string;
  grantedAt: string | null;
  bookingCount: number;
  documents: Array<{
    id: string;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    title: string | null;
    uploadedAt: string;
  }>;
}

export function ProviderDocumentsUI({ locale }: { locale: "fa" | "en" }) {
  const t = (fa: string, en: string) => (locale === "fa" ? fa : en);
  const [patients, setPatients] = useState<PatientEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await client.get<{ patients: PatientEntry[] }>("/provider/documents/patients");
      setPatients(res.patients);
    } catch (err: any) {
      setError(err.message ?? "load_failed");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const download = async (docId: string) => {
    setDownloading(docId);
    setError(null);
    try {
      const res = await client.post<{ downloadUrl: string }>(`/documents/${docId}/download`);
      const blob = await fetch(`${API_URL}${res.downloadUrl}`, { credentials: "include" }).then((r) => {
        if (!r.ok) throw new Error("download_failed");
        return r.blob();
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "document";
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
    <div className="space-y-4">
      {error && (
        <p className="rounded-[var(--radius-sm)] bg-[var(--danger-muted)] px-3 py-2 text-xs text-[var(--danger)]">
          {error}
        </p>
      )}
      {patients.length === 0 ? (
        <EmptyState
          icon="document"
          title={t("دسترسی فعالی وجود ندارد", "No active document access")}
          description={t("بیماران باید سند بارگذاری و به شما دسترسی بدهند.", "Patients need to upload documents and grant you access.")}
        />
      ) : (
        patients.map((p) => (
          <Card key={p.patientId}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--bg-subtle)] text-sm font-semibold text-[var(--fg-muted)]">
                  {`${p.firstName[0] ?? ""}${p.lastName[0] ?? ""}`.toUpperCase()}
                </span>
                <div>
                  <p className="text-sm font-medium text-[var(--fg)]">
                    {p.firstName} {p.lastName}
                  </p>
                  <p className="text-xs text-[var(--fg-subtle)]">
                    {p.email} · {p.bookingCount} {t("رزرو", "booking(s)")}
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-[var(--bg-subtle)] px-2 py-1 text-[10px] text-[var(--fg-muted)]">
                {t("دسترسی فعال", "Access granted")}
              </span>
            </div>
            {p.documents.length === 0 ? (
              <p className="text-xs text-[var(--fg-subtle)]">{t("اسنادی ثبت نشده.", "No documents uploaded.")}</p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {p.documents.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 py-2.5">
                    <Icon name="file" className="h-5 w-5 shrink-0 text-[var(--fg-muted)]" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-[var(--fg)]">{d.title || d.originalFilename}</p>
                      <p className="truncate text-xs text-[var(--fg-subtle)]">
                        {d.originalFilename} · {fmtSize(d.sizeBytes)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={downloading === d.id}
                      onClick={() => download(d.id)}
                    >
                      <Icon name="download" className="h-4 w-4" />
                      {t("دریافت", "Download")}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))
      )}
    </div>
  );
}