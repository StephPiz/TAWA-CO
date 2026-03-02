"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Topbar from "../components/topbar";
import { requireTokenOrRedirect } from "../lib/auth";
import { useStorePermissions } from "../lib/access";

const API_BASE = "http://localhost:3001";

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

  if (loading) return <div className="min-h-screen bg-gray-100 p-6">Cargando permisos...</div>;
  if (permissionsError) return <div className="min-h-screen bg-gray-100 p-6 text-red-700">{permissionsError}</div>;
  if (!permissions.supportWrite) {
    return (
      <div className="min-h-screen bg-gray-100 p-6">
        <div className="max-w-3xl mx-auto bg-white p-4 rounded-2xl shadow-md">No autorizado para Soporte.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <Topbar title="Tickets / Quejas" storeName={storeName} />
        {error ? <div className="bg-red-100 text-red-700 p-3 rounded">{error}</div> : null}
        {info ? <div className="bg-emerald-100 text-emerald-700 p-3 rounded">{info}</div> : null}

        {metrics ? (
          <div className="bg-white p-4 rounded-2xl shadow-md grid md:grid-cols-6 gap-2 text-sm">
            <div className="border rounded p-2">Total: {metrics.total}</div>
            <div className="border rounded p-2">Abiertos: {metrics.openCount}</div>
            <div className="border rounded p-2">SLA vencidos: {metrics.breachedOpenCount}</div>
            <div className="border rounded p-2">Resueltos/cerrados: {metrics.resolvedCount}</div>
            <div className="border rounded p-2">1ª respuesta (h): {metrics.avgFirstResponseHours}</div>
            <div className="border rounded p-2">Resolución (h): {metrics.avgResolutionHours}</div>
          </div>
        ) : null}

        <div className="bg-white p-4 rounded-2xl shadow-md">
          <h2 className="font-semibold mb-2">Nuevo ticket</h2>
          <form className="grid md:grid-cols-7 gap-2" onSubmit={createTicket}>
            <input className="border rounded px-3 py-2 md:col-span-2" placeholder="Título" value={title} onChange={(e) => setTitle(e.target.value)} required />
            <input className="border rounded px-3 py-2 md:col-span-2" placeholder="Descripción" value={description} onChange={(e) => setDescription(e.target.value)} />
            <div className="md:col-span-2 flex flex-wrap gap-1">
              {TICKET_TEMPLATES.map((tpl) => (
                <button
                  key={tpl}
                  type="button"
                  className="rounded border px-2 py-1 text-xs"
                  onClick={() => setDescription(tpl)}
                >
                  Plantilla
                </button>
              ))}
            </div>
            <select className="border rounded px-3 py-2" value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="email">email</option>
              <option value="chat">chat</option>
              <option value="marketplace">marketplace</option>
              <option value="phone">phone</option>
            </select>
            <select className="border rounded px-3 py-2" value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="late_delivery">late_delivery</option>
              <option value="damaged">damaged</option>
              <option value="wrong_item">wrong_item</option>
              <option value="billing_issue">billing_issue</option>
              <option value="other">other</option>
            </select>
            <select className="border rounded px-3 py-2" value={priority} onChange={(e) => setPriority(e.target.value as TicketPriority)}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <input className="border rounded px-3 py-2" type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />

            <select className="border rounded px-3 py-2 md:col-span-2" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Cliente (opcional)</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.fullName || c.email || c.id}</option>
              ))}
            </select>

            <select className="border rounded px-3 py-2 md:col-span-2" value={orderId} onChange={(e) => setOrderId(e.target.value)}>
              <option value="">Pedido (opcional)</option>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>{o.orderNumber}</option>
              ))}
            </select>

            <select className="border rounded px-3 py-2 md:col-span-2" value={assignedToUserId} onChange={(e) => setAssignedToUserId(e.target.value)}>
              <option value="">Asignar a</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>{m.fullName} ({m.roleKey})</option>
              ))}
            </select>

            <button className="rounded bg-black text-white px-3 py-2 md:col-span-2" type="submit">Crear</button>
          </form>
        </div>

        <div className="bg-white p-4 rounded-2xl shadow-md">
          <div className="grid md:grid-cols-6 gap-2 mb-3">
            <input className="border rounded px-3 py-2" placeholder="Buscar ticket..." value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="border rounded px-3 py-2" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">Todos estados</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select className="border rounded px-3 py-2" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
              <option value="">Todas prioridades</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <label className="inline-flex items-center gap-2 text-sm px-2">
              <input type="checkbox" checked={assignedToMeOnly} onChange={(e) => setAssignedToMeOnly(e.target.checked)} />
              Asignados a mí
            </label>
            <button className="rounded border px-3 py-2" onClick={() => storeId && loadAll(storeId, q, statusFilter, priorityFilter, assignedToMeOnly)}>
              Aplicar filtros
            </button>
            <button className="rounded border px-3 py-2" onClick={exportCsv}>Export CSV</button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-3 py-2">Título</th>
                  <th className="text-left px-3 py-2">Estado</th>
                  <th className="text-left px-3 py-2">Prioridad</th>
                  <th className="text-left px-3 py-2">Cliente</th>
                  <th className="text-left px-3 py-2">Pedido</th>
                  <th className="text-left px-3 py-2">Asignado</th>
                  <th className="text-left px-3 py-2">Due</th>
                  <th className="text-left px-3 py-2">SLA</th>
                  <th className="text-left px-3 py-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {tickets.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-4 text-gray-500">Sin tickets</td>
                  </tr>
                ) : (
                  tickets.map((t) => (
                    <tr key={t.id} className="border-b align-top">
                      <td className="px-3 py-2">
                        <div className="font-medium">{t.title}</div>
                        <div className="text-xs text-gray-500">{t.description || "-"}</div>
                      </td>
                      <td className="px-3 py-2">{t.status}</td>
                      <td className="px-3 py-2">{t.priority}</td>
                      <td className="px-3 py-2">{t.customer?.fullName || t.customer?.email || "-"}</td>
                      <td className="px-3 py-2">{t.order?.orderNumber || "-"}</td>
                      <td className="px-3 py-2">{t.assignedTo?.fullName || "-"}</td>
                      <td className="px-3 py-2">{t.dueAt ? new Date(t.dueAt).toISOString().slice(0, 10) : "-"}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded px-2 py-1 text-xs ${t.slaBreached ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                          {t.slaBreached ? "breached" : "ok"}
                        </span>
                        <div className="text-xs text-gray-500 mt-1">
                          res due: {t.slaResolutionDueAt ? new Date(t.slaResolutionDueAt).toISOString().slice(0, 10) : "-"}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2 flex-wrap">
                          <button className="rounded border px-2 py-1" onClick={() => router.push(`/store/support/${t.id}`)}>
                            Ver
                          </button>
                          {STATUSES.map((s) => (
                            <button key={s} className="rounded border px-2 py-1" onClick={() => updateTicket(t.id, { status: s })}>
                              {s}
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
