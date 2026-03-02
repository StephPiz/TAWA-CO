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
        if (!res.ok) return setError(data.error || "Error loading customer detail");
        setCustomer(data.customer || null);
        setSummary(data.summary || null);
        setOrders(data.orders || []);
        setTickets(data.tickets || []);
      } catch {
        setError("Connection error");
      }
    })();
  }, [loading, storeId, customerId, permissions.customersRead]);

  if (loading) return <div className="min-h-screen bg-gray-100 p-6">Cargando permisos...</div>;
  if (permissionsError) return <div className="min-h-screen bg-gray-100 p-6 text-red-700">{permissionsError}</div>;
  if (!permissions.customersRead) return <div className="min-h-screen bg-gray-100 p-6">No autorizado para Clientes.</div>;

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <Topbar title="Cliente - Detalle" storeName={storeName} />
        {error ? <div className="bg-red-100 text-red-700 p-3 rounded">{error}</div> : null}

        <div className="bg-white p-4 rounded-2xl shadow-md">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{customer?.fullName || customer?.email || customerId}</h2>
            <button className="rounded border px-3 py-2" onClick={() => router.push("/store/customers")}>Volver a clientes</button>
          </div>
          <p className="text-sm text-gray-700 mt-1">Email: {customer?.email || "-"}</p>
          <p className="text-sm text-gray-700">País/Ciudad: {[customer?.country, customer?.city].filter(Boolean).join(" / ") || "-"}</p>

          <div className="grid md:grid-cols-5 gap-2 mt-3 text-sm">
            <div className="border rounded p-2">Pedidos: {summary?.totalOrders ?? 0}</div>
            <div className="border rounded p-2">Revenue EUR: {summary?.totalRevenueEur ?? "-"}</div>
            <div className="border rounded p-2">Profit EUR: {summary?.totalProfitEur ?? "-"}</div>
            <div className="border rounded p-2">Devoluciones: {summary?.totalReturns ?? 0}</div>
            <div className="border rounded p-2">Tickets abiertos: {summary?.openTickets ?? 0}</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl shadow-md">
          <h3 className="font-semibold mb-2">Historial pedidos</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-3 py-2">Pedido</th>
                  <th className="text-left px-3 py-2">Estado</th>
                  <th className="text-left px-3 py-2">Fecha</th>
                  <th className="text-left px-3 py-2">Revenue EUR</th>
                  <th className="text-left px-3 py-2">Profit EUR</th>
                  <th className="text-left px-3 py-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-4 text-gray-500">Sin pedidos</td></tr>
                ) : (
                  orders.map((o) => (
                    <tr key={o.id} className="border-b">
                      <td className="px-3 py-2">{o.orderNumber}</td>
                      <td className="px-3 py-2">{o.status}</td>
                      <td className="px-3 py-2">{new Date(o.orderedAt).toISOString().slice(0, 10)}</td>
                      <td className="px-3 py-2">{o.grossAmountEurFrozen ?? "-"}</td>
                      <td className="px-3 py-2">{o.netProfitEur ?? "-"}</td>
                      <td className="px-3 py-2">
                        <button className="rounded border px-2 py-1" onClick={() => router.push(`/store/orders?q=${encodeURIComponent(o.id)}`)}>Abrir pedido</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl shadow-md">
          <h3 className="font-semibold mb-2">Tickets de soporte</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-3 py-2">Título</th>
                  <th className="text-left px-3 py-2">Estado</th>
                  <th className="text-left px-3 py-2">Prioridad</th>
                  <th className="text-left px-3 py-2">Fecha</th>
                  <th className="text-left px-3 py-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {tickets.length === 0 ? (
                  <tr><td colSpan={5} className="px-3 py-4 text-gray-500">Sin tickets</td></tr>
                ) : (
                  tickets.map((t) => (
                    <tr key={t.id} className="border-b">
                      <td className="px-3 py-2">{t.title}</td>
                      <td className="px-3 py-2">{t.status}</td>
                      <td className="px-3 py-2">{t.priority}</td>
                      <td className="px-3 py-2">{new Date(t.createdAt).toISOString().slice(0, 10)}</td>
                      <td className="px-3 py-2">
                        <button className="rounded border px-2 py-1" onClick={() => router.push(`/store/support/${t.id}`)}>Abrir ticket</button>
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
