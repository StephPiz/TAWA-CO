"use client";

import { useEffect, useMemo, useState } from "react";
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

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("es-ES", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function formatMoney(value: number | null) {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(value);
}

export default function CustomersPage() {
  const router = useRouter();
  const { loading, storeId, storeName, permissions, error: permissionsError } = useStorePermissions();
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);

  async function loadCustomers(currentStoreId: string, query = "") {
    const token = requireTokenOrRedirect();
    if (!token) return;
    setError("");
    setLoadingCustomers(true);
    try {
      const qs = new URLSearchParams({ storeId: currentStoreId, ...(query.trim() ? { q: query.trim() } : {}) }).toString();
      const res = await fetch(`${API_BASE}/customers?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error loading customers");
        return;
      }
      setCustomers(data.customers || []);
    } catch {
      setError("Connection error");
    } finally {
      setLoadingCustomers(false);
    }
  }

  useEffect(() => {
    if (loading) return;
    if (!storeId || !permissions.customersRead) return;
    queueMicrotask(() => {
      void loadCustomers(storeId);
    });
  }, [loading, storeId, permissions.customersRead]);

  const withOrders = useMemo(() => customers.filter((customer) => customer.totalOrders > 0).length, [customers]);
  const withProfit = useMemo(() => customers.filter((customer) => (customer.totalProfitEur || 0) > 0).length, [customers]);
  const totalRevenue = useMemo(() => customers.reduce((sum, customer) => sum + (customer.totalRevenueEur || 0), 0), [customers]);

  if (loading) return <div className="min-h-screen bg-[#E8EAEC] p-6">Cargando permisos...</div>;
  if (permissionsError) return <div className="min-h-screen bg-[#E8EAEC] p-6 text-red-700">{permissionsError}</div>;
  if (!permissions.customersRead) {
    return (
      <div className="min-h-screen bg-[#E8EAEC] p-6">
        <div className="mx-auto max-w-3xl rounded-2xl bg-white p-4 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">No autorizado para Clientes.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#E8EAEC] p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <Topbar title="Clientes" storeName={storeName} />
        {error ? <div className="rounded-xl bg-[#FDECEC] p-3 text-[14px] text-[#B42318]">{error}</div> : null}

        <div className="rounded-2xl bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[32px] font-black text-[#151B43]">Base de clientes</h2>
              <p className="mt-2 text-[17px] text-[#667085]">Consulta pedidos, rentabilidad, país y tickets de soporte por cliente.</p>
            </div>
            <div className="grid min-w-[420px] grid-cols-3 gap-3">
              <div className="rounded-2xl bg-[#F7F8FB] p-4">
                <div className="text-[13px] uppercase tracking-wide text-[#7B839C]">Clientes</div>
                <div className="mt-2 text-[30px] font-black text-[#151B43]">{customers.length}</div>
              </div>
              <div className="rounded-2xl bg-[#F7F8FB] p-4">
                <div className="text-[13px] uppercase tracking-wide text-[#7B839C]">Con pedidos</div>
                <div className="mt-2 text-[30px] font-black text-[#151B43]">{withOrders}</div>
              </div>
              <div className="rounded-2xl bg-[#F7F8FB] p-4">
                <div className="text-[13px] uppercase tracking-wide text-[#7B839C]">Revenue</div>
                <div className="mt-2 text-[24px] font-black text-[#151B43]">{formatMoney(totalRevenue)}</div>
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <input
              className="h-[54px] rounded-full border border-[#D8DDEA] bg-white px-5 text-[18px] text-[#1D2340] outline-none"
              placeholder="Buscar cliente por nombre, email, país o ciudad"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button
              className="h-[54px] rounded-full border border-[#CFD5E3] bg-white px-8 text-[18px] text-[#1D2340] hover:bg-[#F8F9FC]"
              onClick={() => storeId && loadCustomers(storeId, q)}
            >
              Buscar
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl bg-white shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
          <table className="min-w-full text-left text-[15px]">
            <thead className="border-b border-[#D0D5DD] bg-[#F8F9FC] text-[#151B43]">
              <tr>
                <th className="px-4 py-3 font-semibold">Cliente</th>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">País / Ciudad</th>
                <th className="px-4 py-3 font-semibold">Pedidos</th>
                <th className="px-4 py-3 font-semibold">Revenue EUR</th>
                <th className="px-4 py-3 font-semibold">Profit EUR</th>
                <th className="px-4 py-3 font-semibold">Último pedido</th>
                <th className="px-4 py-3 font-semibold">Acción</th>
              </tr>
            </thead>
            <tbody className="bg-white text-[#3B4256]">
              {loadingCustomers ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-[16px] text-[#7B839C]">
                    Cargando clientes...
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-[16px] text-[#7B839C]">
                    Sin clientes.
                  </td>
                </tr>
              ) : (
                customers.map((customer) => (
                  <tr key={customer.id} className="border-b border-[#EEF1F6] last:border-b-0">
                    <td className="px-4 py-4">
                      <div className="font-medium text-[#151B43]">{customer.fullName || "-"}</div>
                      <div className="mt-1 text-[13px] text-[#7B839C]">{withProfit && (customer.totalProfitEur || 0) > 0 ? "Rentable" : "Sin profit registrado"}</div>
                    </td>
                    <td className="px-4 py-4">{customer.email || "-"}</td>
                    <td className="px-4 py-4">{[customer.country, customer.city].filter(Boolean).join(" / ") || "-"}</td>
                    <td className="px-4 py-4">{customer.totalOrders}</td>
                    <td className="px-4 py-4">{formatMoney(customer.totalRevenueEur)}</td>
                    <td className="px-4 py-4">{formatMoney(customer.totalProfitEur)}</td>
                    <td className="px-4 py-4">{formatDate(customer.lastOrderAt)}</td>
                    <td className="px-4 py-4">
                      <button
                        className="rounded-full border border-[#D8DDEA] bg-white px-4 py-2 text-[14px] text-[#1D2647] hover:bg-[#F8F9FC]"
                        onClick={() => router.push(`/store/customers/${customer.id}`)}
                      >
                        Ver cliente
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
