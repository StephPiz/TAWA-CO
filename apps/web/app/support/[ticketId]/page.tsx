"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Topbar from "../../components/topbar";
import { requireTokenOrRedirect } from "../../lib/auth";
import { useStorePermissions } from "../../lib/access";

const API_BASE = "http://localhost:3001";
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

  if (loading) return <div className="min-h-screen bg-gray-100 p-6">Cargando permisos...</div>;
  if (permissionsError) return <div className="min-h-screen bg-gray-100 p-6 text-red-700">{permissionsError}</div>;
  if (!permissions.supportWrite) return <div className="min-h-screen bg-gray-100 p-6">No autorizado para Soporte.</div>;

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <Topbar title="Ticket - Detalle" storeName={storeName} />
        {error ? <div className="bg-red-100 text-red-700 p-3 rounded">{error}</div> : null}
        {info ? <div className="bg-emerald-100 text-emerald-700 p-3 rounded">{info}</div> : null}

        <div className="bg-white p-4 rounded-2xl shadow-md">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{ticket?.title || ticketId}</h2>
            <button className="rounded border px-3 py-2" onClick={() => router.push("/store/support")}>Volver a soporte</button>
          </div>
          <p className="text-sm text-gray-700 mt-1">Estado: {ticket?.status || "-"} | Prioridad: {ticket?.priority || "-"}</p>
          <p className="text-sm text-gray-700">Canal/Motivo: {[ticket?.channel, ticket?.reason].filter(Boolean).join(" / ") || "-"}</p>
          <p className="text-sm text-gray-700">Cliente: {ticket?.customer?.fullName || ticket?.customer?.email || "-"}</p>
          <p className="text-sm text-gray-700">Pedido: {ticket?.order?.orderNumber || "-"}</p>
          <p className="text-sm text-gray-700">Asignado: {ticket?.assignedTo?.fullName || "-"}</p>
          <p className="text-sm text-gray-700">Descripción: {ticket?.description || "-"}</p>
          <p className="text-sm text-gray-700">Resolución: {ticket?.resolutionNote || "-"}</p>
          <p className="text-sm text-gray-700">
            SLA 1ª respuesta: {ticket?.slaFirstResponseDueAt ? new Date(ticket.slaFirstResponseDueAt).toLocaleString() : "-"}
          </p>
          <p className="text-sm text-gray-700">
            SLA resolución: {ticket?.slaResolutionDueAt ? new Date(ticket.slaResolutionDueAt).toLocaleString() : "-"}
          </p>
          <p className="text-sm text-gray-700">
            SLA estado: {ticket?.slaBreached ? "breached" : "ok"}
            {ticket?.slaBreachedAt ? ` (${new Date(ticket.slaBreachedAt).toLocaleString()})` : ""}
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl shadow-md">
          <h3 className="font-semibold mb-2">Timeline</h3>
          {timeline.length === 0 ? (
            <div className="text-sm text-gray-500">Sin eventos</div>
          ) : (
            <ul className="space-y-2">
              {timeline.map((ev, idx) => (
                <li key={`${ev.type}-${ev.at}-${idx}`} className="border rounded p-2 text-sm">
                  <div className="font-medium">{ev.label}</div>
                  <div className="text-xs text-gray-500">{new Date(ev.at).toLocaleString()}</div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white p-4 rounded-2xl shadow-md">
          <h3 className="font-semibold mb-2">Notas internas</h3>
          <form className="flex gap-2 mb-3" onSubmit={addNote}>
            <input
              className="border rounded px-3 py-2 w-full"
              placeholder="Escribe una nota interna..."
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
            />
            <button className="rounded bg-black text-white px-4 py-2" type="submit">Agregar</button>
          </form>
          <div className="flex flex-wrap gap-2 mb-3">
            {NOTE_TEMPLATES.map((tpl) => (
              <button key={tpl} type="button" className="rounded border px-2 py-1 text-xs" onClick={() => setNoteBody(tpl)}>
                Plantilla
              </button>
            ))}
          </div>

          {ticket?.notes?.length ? (
            <div className="space-y-2">
              {ticket.notes.map((n) => (
                <div key={n.id} className="border rounded p-2">
                  <div className="text-xs text-gray-500">{n.user?.fullName || "usuario"} | {new Date(n.createdAt).toLocaleString()}</div>
                  <div className="text-sm mt-1 whitespace-pre-wrap">{n.body}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-500">Sin notas internas</div>
          )}
        </div>
      </div>
    </div>
  );
}
