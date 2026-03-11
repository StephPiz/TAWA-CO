"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Topbar from "../../components/topbar";
import { requireTokenOrRedirect } from "../../lib/auth";
import { useStorePermissions } from "../../lib/access";

const API_BASE = "http://localhost:3001";

type CustomerDetail = {
  id: string;
  email: string | null;
  fullName: string | null;
  country: string | null;
  city: string | null;
  createdAt: string;
};

type Summary = {
  totalOrders: number;
  totalRevenueEur: number | null;
  totalProfitEur: number | null;
  totalReturns: number;
  openTickets: number;
};

type OrderRow = {
  id: string;
  orderNumber: string;
  status: string;
  orderedAt: string;
  grossAmountEurFrozen: number | null;
  netProfitEur: number | null;
};

type TicketRow = {
  id: string;
  title: string;
  status: string;
  priority: string;
  createdAt: string;
};

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("es-ES", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function formatMoney(value: number | null) {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(value);
}

function ticketPriorityLabel(priority: string) {
  switch (String(priority || "").toLowerCase()) {
    case "urgent":
      return "Urgente";
    case "high":
      return "Alta";
    case "medium":
      return "Media";
    case "low":
      return "Baja";
    default:
      return priority || "-";
  }
}

export default function CustomerDetailPage() {
  const router = useRouter();
  const params = useParams<{ customerId: string }>();
  const customerId = String(params?.customerId || "");

  const { loading, storeId, storeName, permissions, error: permissionsError } = useStorePermissions();
  const [error, setError] = useState("");
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [tickets, setTickets] = useState<TicketRow[]>([]);

  useEffect(() => {
    if (loading) return;
    if (!storeId || !customerId || !permissions.customersRead) return;
    const token = requireTokenOrRedirect();
    if (!token) return;

    (async () => {
      setError("");
      try {
        const qs = new URLSearchParams({ storeId }).toString();
        const res = await fetch(`${API_BASE}/customers/${encodeURIComponent(customerId)}?${qs}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Error loading customer detail");
          return;
        }
        setCustomer(data.customer || null);
        setSummary(data.summary || null);
        setOrders(data.orders || []);
        setTickets(data.tickets || []);
      } catch {
        setError("Connection error");
      }
    })();
  }, [loading, storeId, customerId, permissions.customersRead]);

  if (loading) return <div className="min-h-screen bg-[#E8EAEC] p-6">Cargando permisos...</div>;
  if (permissionsError) return <div className="min-h-screen bg-[#E8EAEC] p-6 text-red-700">{permissionsError}</div>;
  if (!permissions.customersRead) return <div className="min-h-screen bg-[#E8EAEC] p-6">No autorizado para Clientes.</div>;

  return (
    <div className="min-h-screen bg-[#E8EAEC] p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <Topbar title="Cliente" storeName={storeName} />
        {error ? <div className="rounded-xl bg-[#FDECEC] p-3 text-[14px] text-[#B42318]">{error}</div> : null}

        <div className="rounded-2xl bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <button
                className="mb-4 rounded-full border border-[#D8DDEA] bg-white px-4 py-2 text-[14px] text-[#1D2647] hover:bg-[#F8F9FC]"
                onClick={() => router.push("/store/customers")}
              >
                ← Volver a clientes
              </button>
              <h2 className="text-[32px] font-black text-[#151B43]">{customer?.fullName || customer?.email || customerId}</h2>
              <p className="mt-2 text-[17px] text-[#667085]">
                {[customer?.country, customer?.city].filter(Boolean).join(" / ") || "Sin ubicación registrada"}
              </p>
              <p className="mt-1 text-[15px] text-[#7B839C]">Email: {customer?.email || "-"}</p>
            </div>
            <div className="grid min-w-[520px] grid-cols-5 gap-3">
              <div className="rounded-2xl bg-[#F7F8FB] p-4">
                <div className="text-[12px] uppercase tracking-wide text-[#7B839C]">Pedidos</div>
                <div className="mt-2 text-[28px] font-black text-[#151B43]">{summary?.totalOrders ?? 0}</div>
              </div>
              <div className="rounded-2xl bg-[#F7F8FB] p-4">
                <div className="text-[12px] uppercase tracking-wide text-[#7B839C]">Revenue</div>
                <div className="mt-2 text-[20px] font-black text-[#151B43]">{formatMoney(summary?.totalRevenueEur ?? null)}</div>
              </div>
              <div className="rounded-2xl bg-[#F7F8FB] p-4">
                <div className="text-[12px] uppercase tracking-wide text-[#7B839C]">Profit</div>
                <div className="mt-2 text-[20px] font-black text-[#151B43]">{formatMoney(summary?.totalProfitEur ?? null)}</div>
              </div>
              <div className="rounded-2xl bg-[#F7F8FB] p-4">
                <div className="text-[12px] uppercase tracking-wide text-[#7B839C]">Devoluciones</div>
                <div className="mt-2 text-[28px] font-black text-[#151B43]">{summary?.totalReturns ?? 0}</div>
              </div>
              <div className="rounded-2xl bg-[#F7F8FB] p-4">
                <div className="text-[12px] uppercase tracking-wide text-[#7B839C]">Tickets</div>
                <div className="mt-2 text-[28px] font-black text-[#151B43]">{summary?.openTickets ?? 0}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-[28px] font-black text-[#151B43]">Historial de pedidos</h3>
              <p className="mt-1 text-[15px] text-[#667085]">Pedidos recientes del cliente y rentabilidad asociada.</p>
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-[#E5E7EB]">
            <table className="min-w-full text-left text-[15px]">
              <thead className="border-b border-[#D0D5DD] bg-[#F8F9FC] text-[#151B43]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Pedido</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 font-semibold">Fecha</th>
                  <th className="px-4 py-3 font-semibold">Revenue EUR</th>
                  <th className="px-4 py-3 font-semibold">Profit EUR</th>
                  <th className="px-4 py-3 font-semibold">Acción</th>
                </tr>
              </thead>
              <tbody className="bg-white text-[#3B4256]">
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-[16px] text-[#7B839C]">
                      Sin pedidos.
                    </td>
                  </tr>
                ) : (
                  orders.map((order) => (
                    <tr key={order.id} className="border-b border-[#EEF1F6] last:border-b-0">
                      <td className="px-4 py-4 font-medium text-[#151B43]">{order.orderNumber}</td>
                      <td className="px-4 py-4">{order.status}</td>
                      <td className="px-4 py-4">{formatDate(order.orderedAt)}</td>
                      <td className="px-4 py-4">{formatMoney(order.grossAmountEurFrozen)}</td>
                      <td className="px-4 py-4">{formatMoney(order.netProfitEur)}</td>
                      <td className="px-4 py-4">
                        <button
                          className="rounded-full border border-[#D8DDEA] bg-white px-4 py-2 text-[14px] text-[#1D2647] hover:bg-[#F8F9FC]"
                          onClick={() => router.push(`/store/orders?q=${encodeURIComponent(order.id)}`)}
                        >
                          Abrir pedido
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-[28px] font-black text-[#151B43]">Tickets de soporte</h3>
              <p className="mt-1 text-[15px] text-[#667085]">Incidencias y consultas abiertas o resueltas de este cliente.</p>
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-[#E5E7EB]">
            <table className="min-w-full text-left text-[15px]">
              <thead className="border-b border-[#D0D5DD] bg-[#F8F9FC] text-[#151B43]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Título</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 font-semibold">Prioridad</th>
                  <th className="px-4 py-3 font-semibold">Fecha</th>
                  <th className="px-4 py-3 font-semibold">Acción</th>
                </tr>
              </thead>
              <tbody className="bg-white text-[#3B4256]">
                {tickets.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-[16px] text-[#7B839C]">
                      Sin tickets.
                    </td>
                  </tr>
                ) : (
                  tickets.map((ticket) => (
                    <tr key={ticket.id} className="border-b border-[#EEF1F6] last:border-b-0">
                      <td className="px-4 py-4 font-medium text-[#151B43]">{ticket.title}</td>
                      <td className="px-4 py-4">{ticket.status}</td>
                      <td className="px-4 py-4">{ticketPriorityLabel(ticket.priority)}</td>
                      <td className="px-4 py-4">{formatDate(ticket.createdAt)}</td>
                      <td className="px-4 py-4">
                        <button
                          className="rounded-full border border-[#D8DDEA] bg-white px-4 py-2 text-[14px] text-[#1D2647] hover:bg-[#F8F9FC]"
                          onClick={() => router.push(`/store/support/${ticket.id}`)}
                        >
                          Abrir ticket
                        </button>
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
