"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import localFont from "next/font/local";
import Topbar from "../../components/topbar";
import { requireTokenOrRedirect } from "../../lib/auth";
import { useStorePermissions } from "../../lib/access";

const API_BASE = "http://localhost:3001";
const headingFont = localFont({
  src: "../../fonts/HFHySans_Black.ttf",
  variable: "--font-support-detail-heading",
});
const bodyFont = localFont({
  src: "../../fonts/HFHySans_Regular.ttf",
  variable: "--font-support-detail-body",
});
const NOTE_TEMPLATES = [
  "Se contactó al cliente y se informó estado actual.",
  "Escalado a logística para validación de tracking.",
  "Pendiente respuesta del marketplace/proveedor.",
];

type Ticket = {
  id: string;
  title: string;
  description: string | null;
  channel: string | null;
  reason: string | null;
  status: string;
  priority: string;
  dueAt: string | null;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  slaFirstResponseDueAt: string | null;
  slaResolutionDueAt: string | null;
  slaBreached: boolean;
  slaBreachedAt: string | null;
  resolutionNote: string | null;
  createdAt: string;
  customer: { id: string; fullName: string | null; email: string | null } | null;
  order: { id: string; orderNumber: string; status: string; paymentStatus: string; orderedAt: string } | null;
  assignedTo: { id: string; fullName: string; email: string } | null;
  createdBy: { id: string; fullName: string; email: string } | null;
  notes: Array<{ id: string; body: string; createdAt: string; user: { id: string; fullName: string; email: string } | null }>;
};

type TimelineEvent = {
  type: string;
  at: string;
  label: string;
  noteId?: string;
};

const STATUS_LABELS: Record<string, string> = {
  open: "Abierto",
  in_progress: "En curso",
  waiting_customer: "Esperando cliente",
  resolved: "Resuelto",
  closed: "Cerrado",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
  urgent: "Urgente",
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("es-ES");
}

export default function SupportTicketDetailPage() {
  const router = useRouter();
  const params = useParams<{ ticketId: string }>();
  const ticketId = String(params?.ticketId || "");

  const { loading, storeId, storeName, permissions, error: permissionsError } = useStorePermissions();
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [noteBody, setNoteBody] = useState("");

  const loadTicket = useCallback(async (currentStoreId: string) => {
    const token = requireTokenOrRedirect();
    if (!token) return;
    setError("");
    try {
      const qs = new URLSearchParams({ storeId: currentStoreId }).toString();
      const res = await fetch(`${API_BASE}/support/tickets/${encodeURIComponent(ticketId)}?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error || "Error loading ticket detail");
      setTicket(data.ticket || null);
      setTimeline(data.timeline || []);
    } catch {
      setError("Connection error");
    }
  }, [ticketId]);

  useEffect(() => {
    if (loading) return;
    if (!storeId || !ticketId || !permissions.supportWrite) return;
    queueMicrotask(() => {
      void loadTicket(storeId);
    });
  }, [loading, storeId, ticketId, permissions.supportWrite, loadTicket]);

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    const token = requireTokenOrRedirect();
    if (!token || !storeId || !ticketId || noteBody.trim().length < 2) return;

    const res = await fetch(`${API_BASE}/support/tickets/${encodeURIComponent(ticketId)}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ storeId, body: noteBody.trim() }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error || "Cannot add note");

    setNoteBody("");
    setInfo("Nota agregada");
    await loadTicket(storeId);
  }

  if (loading) return <div className={`${headingFont.variable} ${bodyFont.variable} min-h-screen bg-[#E8EAEC] p-6`}>Cargando permisos...</div>;
  if (permissionsError) return <div className={`${headingFont.variable} ${bodyFont.variable} min-h-screen bg-[#E8EAEC] p-6 text-red-700`}>{permissionsError}</div>;
  if (!permissions.supportWrite) return <div className={`${headingFont.variable} ${bodyFont.variable} min-h-screen bg-[#E8EAEC] p-6`}>No autorizado para Soporte.</div>;

  return (
    <div className={`${headingFont.variable} ${bodyFont.variable} min-h-screen bg-[#E8EAEC] p-6`}>
      <div className="max-w-7xl mx-auto space-y-4">
        <Topbar title="Ticket - Detalle" storeName={storeName} />
        {error ? <div className="rounded-xl bg-[#FDECEC] p-3 text-[#B42318]">{error}</div> : null}
        {info ? <div className="rounded-xl bg-[#ECFDF3] p-3 text-[#027A48]">{info}</div> : null}

        <div className="rounded-2xl bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
          <div className="flex items-center justify-between">
            <h2 className="text-[26px] text-[#141A39]" style={{ fontFamily: "var(--font-support-detail-heading)" }}>{ticket?.title || ticketId}</h2>
            <button className="rounded-full border border-[#D4D9E4] px-4 py-2 text-[14px] text-[#25304F]" onClick={() => router.push("/store/support")}>Volver a soporte</button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl bg-[#F7F8FB] p-4 text-[14px] text-[#25304F]">
              <div className="text-[#6E768E]">Estado</div>
              <div className="mt-1 text-[18px] text-[#141A39]" style={{ fontFamily: "var(--font-support-detail-heading)" }}>{STATUS_LABELS[ticket?.status || ""] || ticket?.status || "-"}</div>
            </div>
            <div className="rounded-2xl bg-[#F7F8FB] p-4 text-[14px] text-[#25304F]">
              <div className="text-[#6E768E]">Prioridad</div>
              <div className="mt-1 text-[18px] text-[#141A39]" style={{ fontFamily: "var(--font-support-detail-heading)" }}>{PRIORITY_LABELS[ticket?.priority || ""] || ticket?.priority || "-"}</div>
            </div>
            <div className="rounded-2xl bg-[#F7F8FB] p-4 text-[14px] text-[#25304F]">
              <div className="text-[#6E768E]">SLA</div>
              <div className="mt-1 text-[18px] text-[#141A39]" style={{ fontFamily: "var(--font-support-detail-heading)" }}>{ticket?.slaBreached ? "Vencido" : "OK"}</div>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3 text-[14px] text-[#25304F]">
            <div><span className="text-[#6E768E]">Canal / Motivo:</span> {[ticket?.channel, ticket?.reason].filter(Boolean).join(" / ") || "-"}</div>
            <div><span className="text-[#6E768E]">Cliente:</span> {ticket?.customer?.fullName || ticket?.customer?.email || "-"}</div>
            <div><span className="text-[#6E768E]">Pedido:</span> {ticket?.order?.orderNumber || "-"}</div>
            <div><span className="text-[#6E768E]">Asignado:</span> {ticket?.assignedTo?.fullName || "-"}</div>
            <div><span className="text-[#6E768E]">SLA 1ª respuesta:</span> {formatDateTime(ticket?.slaFirstResponseDueAt)}</div>
            <div><span className="text-[#6E768E]">SLA resolución:</span> {formatDateTime(ticket?.slaResolutionDueAt)}</div>
          </div>
          <div className="mt-4 rounded-2xl bg-[#F7F8FB] p-4 text-[14px] text-[#25304F]">
            <div className="text-[#6E768E]">Descripción</div>
            <div className="mt-1 whitespace-pre-wrap">{ticket?.description || "-"}</div>
          </div>
          <div className="mt-3 rounded-2xl bg-[#F7F8FB] p-4 text-[14px] text-[#25304F]">
            <div className="text-[#6E768E]">Resolución</div>
            <div className="mt-1 whitespace-pre-wrap">{ticket?.resolutionNote || "-"}</div>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
          <h3 className="mb-3 text-[20px] text-[#141A39]" style={{ fontFamily: "var(--font-support-detail-heading)" }}>Timeline</h3>
          {timeline.length === 0 ? (
            <div className="text-sm text-[#6E768E]">Sin eventos</div>
          ) : (
            <ul className="space-y-2">
              {timeline.map((ev, idx) => (
                <li key={`${ev.type}-${ev.at}-${idx}`} className="rounded-2xl bg-[#F7F8FB] p-3 text-sm">
                  <div className="font-medium text-[#141A39]">{ev.label}</div>
                  <div className="text-xs text-[#6E768E]">{formatDateTime(ev.at)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
          <h3 className="mb-3 text-[20px] text-[#141A39]" style={{ fontFamily: "var(--font-support-detail-heading)" }}>Notas internas</h3>
          <form className="mb-3 flex gap-2" onSubmit={addNote}>
            <input
              className="h-11 w-full rounded-xl border border-[#D4D9E4] px-3 text-[14px] text-[#25304F] outline-none"
              placeholder="Escribe una nota interna..."
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
            />
            <button className="rounded-xl bg-[#0B1230] px-4 py-2 text-[14px] text-white" style={{ fontFamily: "var(--font-support-detail-heading)" }} type="submit">Agregar</button>
          </form>
          <div className="flex flex-wrap gap-2 mb-3">
            {NOTE_TEMPLATES.map((tpl) => (
              <button key={tpl} type="button" className="rounded-full border border-[#D4D9E4] px-3 py-2 text-[12px] text-[#3D4662]" onClick={() => setNoteBody(tpl)}>
                Plantilla
              </button>
            ))}
          </div>

          {ticket?.notes?.length ? (
            <div className="space-y-2">
              {ticket.notes.map((n) => (
                <div key={n.id} className="rounded-2xl bg-[#F7F8FB] p-3">
                  <div className="text-xs text-[#6E768E]">{n.user?.fullName || "usuario"} | {formatDateTime(n.createdAt)}</div>
                  <div className="mt-1 text-sm whitespace-pre-wrap text-[#25304F]">{n.body}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-[#6E768E]">Sin notas internas</div>
          )}
        </div>
      </div>
    </div>
  );
}
