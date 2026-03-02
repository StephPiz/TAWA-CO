"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Topbar from "../components/topbar";
import { requireTokenOrRedirect } from "../lib/auth";
import { useStorePermissions } from "../lib/access";

const API_BASE = "http://localhost:3001";

type CustomerRow = {
  id: string;
  email: string | null;
  fullName: string | null;
  country: string | null;
  city: string | null;
  totalOrders: number;
  totalRevenueEur: number | null;
  totalProfitEur: number | null;
  lastOrderAt: string | null;
};

export default function CustomersPage() {
  const router = useRouter();
  const { loading, storeId, storeName, permissions, error: permissionsError } = useStorePermissions();
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [customers, setCustomers] = useState<CustomerRow[]>([]);

  async function loadCustomers(currentStoreId: string, query = "") {
    const token = requireTokenOrRedirect();
    if (!token) return;
    setError("");
    try {
      const qs = new URLSearchParams({ storeId: currentStoreId, ...(query.trim() ? { q: query.trim() } : {}) }).toString();
      const res = await fetch(`${API_BASE}/customers?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error || "Error loading customers");
      setCustomers(data.customers || []);
    } catch {
      setError("Connection error");
    }
  }

  useEffect(() => {
    if (loading) return;
    if (!storeId || !permissions.customersRead) return;
    queueMicrotask(() => {
      void loadCustomers(storeId);
    });
  }, [loading, storeId, permissions.customersRead]);

  if (loading) return <div className="min-h-screen bg-gray-100 p-6">Cargando permisos...</div>;
  if (permissionsError) return <div className="min-h-screen bg-gray-100 p-6 text-red-700">{permissionsError}</div>;
  if (!permissions.customersRead) {
    return (
      <div className="min-h-screen bg-gray-100 p-6">
        <div className="max-w-3xl mx-auto bg-white p-4 rounded-2xl shadow-md">No autorizado para Clientes.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <Topbar title="Clientes" storeName={storeName} />
        {error ? <div className="bg-red-100 text-red-700 p-3 rounded">{error}</div> : null}

        <div className="bg-white p-4 rounded-2xl shadow-md">
          <div className="flex gap-2">
            <input
              className="border rounded px-3 py-2 w-full"
              placeholder="Buscar cliente por nombre/email/país..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button className="rounded border px-4 py-2" onClick={() => storeId && loadCustomers(storeId, q)}>
              Buscar
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-md overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-3 py-2">Cliente</th>
                <th className="text-left px-3 py-2">Email</th>
                <th className="text-left px-3 py-2">País/Ciudad</th>
                <th className="text-left px-3 py-2">Pedidos</th>
                <th className="text-left px-3 py-2">Revenue EUR</th>
                <th className="text-left px-3 py-2">Profit EUR</th>
                <th className="text-left px-3 py-2">Último pedido</th>
                <th className="text-left px-3 py-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-4 text-gray-500">Sin clientes</td>
                </tr>
              ) : (
                customers.map((c) => (
                  <tr key={c.id} className="border-b">
                    <td className="px-3 py-2">{c.fullName || "-"}</td>
                    <td className="px-3 py-2">{c.email || "-"}</td>
                    <td className="px-3 py-2">{[c.country, c.city].filter(Boolean).join(" / ") || "-"}</td>
                    <td className="px-3 py-2">{c.totalOrders}</td>
                    <td className="px-3 py-2">{c.totalRevenueEur ?? "-"}</td>
                    <td className="px-3 py-2">{c.totalProfitEur ?? "-"}</td>
                    <td className="px-3 py-2">{c.lastOrderAt ? new Date(c.lastOrderAt).toISOString().slice(0, 10) : "-"}</td>
                    <td className="px-3 py-2">
                      <button className="rounded border px-2 py-1" onClick={() => router.push(`/store/customers/${c.id}`)}>
                        Ver
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
  );
}
