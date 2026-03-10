"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import localFont from "next/font/local";
import Topbar from "../components/topbar";
import { requireTokenOrRedirect } from "../lib/auth";
import { useStorePermissions } from "../lib/access";

const API_BASE = "http://localhost:3001";
const headingFont = localFont({
  src: "../fonts/HFHySans_Black.ttf",
  variable: "--font-support-heading",
});
const bodyFont = localFont({
  src: "../fonts/HFHySans_Regular.ttf",
  variable: "--font-support-body",
});

type TicketStatus = "open" | "in_progress" | "waiting_customer" | "resolved" | "closed";
type TicketPriority = "low" | "medium" | "high" | "urgent";

type Ticket = {
  id: string;
  title: string;
  description: string | null;
  channel: string | null;
  reason: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  dueAt: string | null;
  slaFirstResponseDueAt: string | null;
  slaResolutionDueAt: string | null;
  slaBreached: boolean;
  slaBreachedAt: string | null;
  customer: { id: string; fullName: string | null; email: string | null } | null;
  order: { id: string; orderNumber: string } | null;
  assignedTo: { id: string; fullName: string; email: string } | null;
  createdBy: { id: string; fullName: string; email: string } | null;
  createdAt: string;
};

type SupportMetrics = {
  total: number;
  openCount: number;
  breachedOpenCount: number;
  resolvedCount: number;
  avgFirstResponseHours: number;
  avgResolutionHours: number;
};

type TeamMember = {
  userId: string;
  roleKey: string;
  fullName: string;
  email: string;
  isActive: boolean;
};

type CustomerOption = {
  id: string;
  fullName: string | null;
  email: string | null;
};

type OrderOption = {
  id: string;
  orderNumber: string;
};

const STATUSES: TicketStatus[] = ["open", "in_progress", "waiting_customer", "resolved", "closed"];
const PRIORITIES: TicketPriority[] = ["low", "medium", "high", "urgent"];
const TICKET_TEMPLATES = [
  "Cliente reporta retraso. Verificar tracking y confirmar ETA.",
  "Cliente indica producto dañado. Solicitar evidencia y validar devolución.",
  "Incidencia de facturación. Revisar invoice y método de pago.",
];

const STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Abierto",
  in_progress: "En curso",
  waiting_customer: "Esperando cliente",
  resolved: "Resuelto",
  closed: "Cerrado",
};

const PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
  urgent: "Urgente",
};

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function statusBadge(status: TicketStatus) {
  switch (status) {
    case "open":
      return "bg-[#EEF2FF] text-[#3730A3]";
    case "in_progress":
      return "bg-[#FFF3E8] text-[#B54708]";
    case "waiting_customer":
      return "bg-[#F4F3FF] text-[#6941C6]";
    case "resolved":
      return "bg-[#ECFDF3] text-[#027A48]";
    case "closed":
      return "bg-[#F2F4F7] text-[#475467]";
  }
}

function priorityBadge(priority: TicketPriority) {
  switch (priority) {
    case "low":
      return "bg-[#F2F4F7] text-[#475467]";
    case "medium":
      return "bg-[#EEF2FF] text-[#3730A3]";
    case "high":
      return "bg-[#FFF6ED] text-[#C4320A]";
    case "urgent":
      return "bg-[#FEF3F2] text-[#B42318]";
  }
}

export default function SupportPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const qFromUrl = useMemo(() => (searchParams.get("q") || "").trim(), [searchParams]);

  const { loading, storeId, storeName, permissions, error: permissionsError } = useStorePermissions();
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [metrics, setMetrics] = useState<SupportMetrics | null>(null);

  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [q, setQ] = useState(() => qFromUrl);
  const [assignedToMeOnly, setAssignedToMeOnly] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [channel, setChannel] = useState("email");
  const [reason, setReason] = useState("late_delivery");
  const [priority, setPriority] = useState<TicketPriority>("medium");
  const [assignedToUserId, setAssignedToUserId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [orderId, setOrderId] = useState("");
  const [dueAt, setDueAt] = useState("");

  const loadAll = useCallback(async (currentStoreId: string, nextQ = q, nextStatus = statusFilter, nextPriority = priorityFilter, nextAssignedToMeOnly = assignedToMeOnly) => {
    const token = requireTokenOrRedirect();
    if (!token) return;
    setError("");

    try {
      const ticketQs = new URLSearchParams({
        storeId: currentStoreId,
        ...(nextQ.trim() ? { q: nextQ.trim() } : {}),
        ...(nextStatus ? { status: nextStatus } : {}),
        ...(nextPriority ? { priority: nextPriority } : {}),
        ...(nextAssignedToMeOnly ? { assignedToMe: "1" } : {}),
      }).toString();

      const [ticketsRes, membersRes, customersRes, ordersRes, metricsRes] = await Promise.all([
        fetch(`${API_BASE}/support/tickets?${ticketQs}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE}/stores/${currentStoreId}/team`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE}/customers?storeId=${encodeURIComponent(currentStoreId)}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE}/orders?storeId=${encodeURIComponent(currentStoreId)}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE}/support/metrics?storeId=${encodeURIComponent(currentStoreId)}`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      const ticketsData = await ticketsRes.json();
      const membersData = await membersRes.json();
      const customersData = await customersRes.json();
      const ordersData = await ordersRes.json();
      const metricsData = await metricsRes.json();

      if (!ticketsRes.ok) return setError(ticketsData.error || "Error loading support tickets");
      if (!membersRes.ok) return setError(membersData.error || "Error loading team");

      setTickets(ticketsData.tickets || []);
      setMembers((membersData.members || []).filter((m: TeamMember) => m.isActive));
      setCustomers(customersRes.ok ? customersData.customers || [] : []);
      setOrders(
        ordersRes.ok
          ? (ordersData.orders || []).map((o: { id: string; orderNumber: string }) => ({ id: o.id, orderNumber: o.orderNumber }))
          : []
      );
      setMetrics(metricsRes.ok ? metricsData.metrics || null : null);
    } catch {
      setError("Connection error");
    }
  }, [assignedToMeOnly, priorityFilter, q, statusFilter]);

  useEffect(() => {
    if (loading) return;
    if (!storeId || !permissions.supportWrite) return;
    queueMicrotask(() => {
      void loadAll(storeId, qFromUrl || "", statusFilter, priorityFilter, assignedToMeOnly);
    });
  }, [loading, storeId, permissions.supportWrite, qFromUrl, loadAll, statusFilter, priorityFilter, assignedToMeOnly]);

  async function exportCsv() {
    const token = requireTokenOrRedirect();
    if (!token || !storeId) return;
    const qs = new URLSearchParams({
      storeId,
      ...(q.trim() ? { q: q.trim() } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(priorityFilter ? { priority: priorityFilter } : {}),
      ...(assignedToMeOnly ? { assignedToMe: "1" } : {}),
    }).toString();
    const res = await fetch(`${API_BASE}/support/tickets/export?${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return setError((data as { error?: string }).error || "Cannot export CSV");
    }
    const csv = await res.text();
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `support_tickets_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function createTicket(e: React.FormEvent) {
    e.preventDefault();
    const token = requireTokenOrRedirect();
    if (!token || !storeId || !title.trim()) return;

    const res = await fetch(`${API_BASE}/support/tickets`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        storeId,
        title: title.trim(),
        description: description.trim() || null,
        channel,
        reason,
        priority,
        assignedToUserId: assignedToUserId || null,
        customerId: customerId || null,
        orderId: orderId || null,
        dueAt: dueAt || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error || "Cannot create support ticket");

    setTitle("");
    setDescription("");
    setAssignedToUserId("");
    setCustomerId("");
    setOrderId("");
    setDueAt("");
    setInfo("Ticket creado");
    await loadAll(storeId);
  }

  async function updateTicket(ticketId: string, patch: Record<string, unknown>) {
    const token = requireTokenOrRedirect();
    if (!token || !storeId) return;

    const res = await fetch(`${API_BASE}/support/tickets/${ticketId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ storeId, ...patch }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error || "Cannot update support ticket");

    await loadAll(storeId);
  }

  if (loading) return <div className={`${headingFont.variable} ${bodyFont.variable} min-h-screen bg-[#E8EAEC] p-6`}>Cargando permisos...</div>;
  if (permissionsError) return <div className={`${headingFont.variable} ${bodyFont.variable} min-h-screen bg-[#E8EAEC] p-6 text-red-700`}>{permissionsError}</div>;
  if (!permissions.supportWrite) {
    return (
      <div className={`${headingFont.variable} ${bodyFont.variable} min-h-screen bg-[#E8EAEC] p-6`}>
        <div className="mx-auto max-w-3xl rounded-2xl bg-white p-4 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">No autorizado para Soporte.</div>
      </div>
    );
  }

  return (
    <div className={`${headingFont.variable} ${bodyFont.variable} min-h-screen bg-[#E8EAEC] p-6`}>
      <div className="max-w-7xl mx-auto space-y-4">
        <Topbar title="Tickets / Quejas" storeName={storeName} />
        {error ? <div className="rounded-xl bg-[#FDECEC] p-3 text-[#B42318]">{error}</div> : null}
        {info ? <div className="rounded-xl bg-[#ECFDF3] p-3 text-[#027A48]">{info}</div> : null}

        {metrics ? (
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <div className="rounded-2xl bg-white p-4 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
              <div className="text-[13px] text-[#7A8196]" style={{ fontFamily: "var(--font-support-body)" }}>Total</div>
              <div className="mt-2 text-[26px] text-[#141A39]" style={{ fontFamily: "var(--font-support-heading)" }}>{metrics.total}</div>
            </div>
            <div className="rounded-2xl bg-white p-4 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
              <div className="text-[13px] text-[#7A8196]" style={{ fontFamily: "var(--font-support-body)" }}>Abiertos</div>
              <div className="mt-2 text-[26px] text-[#141A39]" style={{ fontFamily: "var(--font-support-heading)" }}>{metrics.openCount}</div>
            </div>
            <div className="rounded-2xl bg-white p-4 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
              <div className="text-[13px] text-[#7A8196]" style={{ fontFamily: "var(--font-support-body)" }}>SLA vencidos</div>
              <div className="mt-2 text-[26px] text-[#141A39]" style={{ fontFamily: "var(--font-support-heading)" }}>{metrics.breachedOpenCount}</div>
            </div>
            <div className="rounded-2xl bg-white p-4 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
              <div className="text-[13px] text-[#7A8196]" style={{ fontFamily: "var(--font-support-body)" }}>Resueltos</div>
              <div className="mt-2 text-[26px] text-[#141A39]" style={{ fontFamily: "var(--font-support-heading)" }}>{metrics.resolvedCount}</div>
            </div>
            <div className="rounded-2xl bg-white p-4 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
              <div className="text-[13px] text-[#7A8196]" style={{ fontFamily: "var(--font-support-body)" }}>1ª respuesta (h)</div>
              <div className="mt-2 text-[26px] text-[#141A39]" style={{ fontFamily: "var(--font-support-heading)" }}>{metrics.avgFirstResponseHours}</div>
            </div>
            <div className="rounded-2xl bg-white p-4 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
              <div className="text-[13px] text-[#7A8196]" style={{ fontFamily: "var(--font-support-body)" }}>Resolución (h)</div>
              <div className="mt-2 text-[26px] text-[#141A39]" style={{ fontFamily: "var(--font-support-heading)" }}>{metrics.avgResolutionHours}</div>
            </div>
          </div>
        ) : null}

        <div className="rounded-2xl bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
          <h2 className="mb-3 text-[20px] text-[#141A39]" style={{ fontFamily: "var(--font-support-heading)" }}>Nuevo ticket</h2>
          <form className="grid gap-2 md:grid-cols-7" onSubmit={createTicket}>
            <input className="h-11 rounded-xl border border-[#D4D9E4] px-3 text-[14px] text-[#25304F] outline-none md:col-span-2" placeholder="Título" value={title} onChange={(e) => setTitle(e.target.value)} required />
            <input className="h-11 rounded-xl border border-[#D4D9E4] px-3 text-[14px] text-[#25304F] outline-none md:col-span-2" placeholder="Descripción" value={description} onChange={(e) => setDescription(e.target.value)} />
            <div className="md:col-span-2 flex flex-wrap gap-1">
              {TICKET_TEMPLATES.map((tpl) => (
                <button
                  key={tpl}
                  type="button"
                  className="rounded-full border border-[#D4D9E4] px-3 py-2 text-[12px] text-[#3D4662]"
                  onClick={() => setDescription(tpl)}
                >
                  Plantilla
                </button>
              ))}
            </div>
            <select className="h-11 rounded-xl border border-[#D4D9E4] px-3 text-[14px] text-[#25304F] outline-none" value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="email">Email</option>
              <option value="chat">Chat</option>
              <option value="marketplace">Canal</option>
              <option value="phone">Teléfono</option>
            </select>
            <select className="h-11 rounded-xl border border-[#D4D9E4] px-3 text-[14px] text-[#25304F] outline-none" value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="late_delivery">Retraso de entrega</option>
              <option value="damaged">Producto dañado</option>
              <option value="wrong_item">Producto incorrecto</option>
              <option value="billing_issue">Incidencia de facturación</option>
              <option value="other">Otro</option>
            </select>
            <select className="h-11 rounded-xl border border-[#D4D9E4] px-3 text-[14px] text-[#25304F] outline-none" value={priority} onChange={(e) => setPriority(e.target.value as TicketPriority)}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
              ))}
            </select>
            <input className="h-11 rounded-xl border border-[#D4D9E4] px-3 text-[14px] text-[#25304F] outline-none" type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />

            <select className="h-11 rounded-xl border border-[#D4D9E4] px-3 text-[14px] text-[#25304F] outline-none md:col-span-2" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Cliente (opcional)</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.fullName || c.email || c.id}</option>
              ))}
            </select>

            <select className="h-11 rounded-xl border border-[#D4D9E4] px-3 text-[14px] text-[#25304F] outline-none md:col-span-2" value={orderId} onChange={(e) => setOrderId(e.target.value)}>
              <option value="">Pedido (opcional)</option>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>{o.orderNumber}</option>
              ))}
            </select>

            <select className="h-11 rounded-xl border border-[#D4D9E4] px-3 text-[14px] text-[#25304F] outline-none md:col-span-2" value={assignedToUserId} onChange={(e) => setAssignedToUserId(e.target.value)}>
              <option value="">Asignar a</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>{m.fullName} ({m.roleKey})</option>
              ))}
            </select>

            <button className="h-11 rounded-xl bg-[#0B1230] px-3 text-[14px] text-white md:col-span-2" type="submit" style={{ fontFamily: "var(--font-support-heading)" }}>Crear</button>
          </form>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
          <div className="mb-4 grid gap-2 md:grid-cols-6">
            <input className="h-11 rounded-xl border border-[#D4D9E4] px-3 text-[14px] text-[#25304F] outline-none" placeholder="Buscar ticket..." value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="h-11 rounded-xl border border-[#D4D9E4] px-3 text-[14px] text-[#25304F] outline-none" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">Todos estados</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
            <select className="h-11 rounded-xl border border-[#D4D9E4] px-3 text-[14px] text-[#25304F] outline-none" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
              <option value="">Todas prioridades</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
              ))}
            </select>
            <label className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#D4D9E4] px-3 text-[14px] text-[#25304F]">
              <input type="checkbox" checked={assignedToMeOnly} onChange={(e) => setAssignedToMeOnly(e.target.checked)} />
              Asignados a mí
            </label>
            <button className="h-11 rounded-xl border border-[#D4D9E4] px-3 text-[14px] text-[#25304F]" onClick={() => storeId && loadAll(storeId, q, statusFilter, priorityFilter, assignedToMeOnly)}>
              Aplicar filtros
            </button>
            <button className="h-11 rounded-xl border border-[#D4D9E4] px-3 text-[14px] text-[#25304F]" onClick={exportCsv}>Export CSV</button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-[#D9DDE7] bg-[#F7F8FB]">
                <tr>
                  <th className="text-left px-3 py-3 text-[13px] text-[#5F6780]">Título</th>
                  <th className="text-left px-3 py-3 text-[13px] text-[#5F6780]">Estado</th>
                  <th className="text-left px-3 py-3 text-[13px] text-[#5F6780]">Prioridad</th>
                  <th className="text-left px-3 py-3 text-[13px] text-[#5F6780]">Cliente</th>
                  <th className="text-left px-3 py-3 text-[13px] text-[#5F6780]">Pedido</th>
                  <th className="text-left px-3 py-3 text-[13px] text-[#5F6780]">Asignado</th>
                  <th className="text-left px-3 py-3 text-[13px] text-[#5F6780]">Due</th>
                  <th className="text-left px-3 py-3 text-[13px] text-[#5F6780]">SLA</th>
                  <th className="text-left px-3 py-3 text-[13px] text-[#5F6780]">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {tickets.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-4 text-[#6E768E]">Sin tickets</td>
                  </tr>
                ) : (
                  tickets.map((t) => (
                    <tr key={t.id} className="border-b border-[#EEF1F6] align-top last:border-b-0">
                      <td className="px-3 py-2">
                        <div className="font-medium text-[#141A39]">{t.title}</div>
                        <div className="mt-1 text-xs text-[#6E768E]">{t.description || "-"}</div>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex rounded-full px-3 py-1 text-[12px] ${statusBadge(t.status)}`}>{STATUS_LABELS[t.status]}</span>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex rounded-full px-3 py-1 text-[12px] ${priorityBadge(t.priority)}`}>{PRIORITY_LABELS[t.priority]}</span>
                      </td>
                      <td className="px-3 py-2 text-[#25304F]">{t.customer?.fullName || t.customer?.email || "-"}</td>
                      <td className="px-3 py-2 text-[#25304F]">{t.order?.orderNumber || "-"}</td>
                      <td className="px-3 py-2 text-[#25304F]">{t.assignedTo?.fullName || "-"}</td>
                      <td className="px-3 py-2 text-[#25304F]">{formatDate(t.dueAt)}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-3 py-1 text-xs ${t.slaBreached ? "bg-[#FEF3F2] text-[#B42318]" : "bg-[#ECFDF3] text-[#027A48]"}`}>
                          {t.slaBreached ? "Vencido" : "OK"}
                        </span>
                        <div className="mt-1 text-xs text-[#6E768E]">
                          res due: {formatDate(t.slaResolutionDueAt)}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2 flex-wrap">
                          <button className="rounded-full border border-[#D4D9E4] px-3 py-2 text-[12px] text-[#25304F]" onClick={() => router.push(`/store/support/${t.id}`)}>
                            Ver
                          </button>
                          {STATUSES.map((s) => (
                            <button key={s} className="rounded-full border border-[#D4D9E4] px-3 py-2 text-[12px] text-[#25304F]" onClick={() => updateTicket(t.id, { status: s })}>
                              {STATUS_LABELS[s]}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
