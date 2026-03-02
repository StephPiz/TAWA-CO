"use client";

import { useEffect, useState } from "react";
import Topbar from "../components/topbar";
import { requireTokenOrRedirect } from "../lib/auth";
import { useStorePermissions } from "../lib/access";

const API_BASE = "http://localhost:3001";

type Invoice = {
  id: string;
  invoiceNumber: string;
  issuedAt: string;
  totalEur: number;
  status: string;
  order: { id: string; orderNumber: string };
};

type Order = { id: string; orderNumber: string };

export default function InvoicesPage() {
  const { loading, storeId, storeName, permissions, error: permissionsError } = useStorePermissions();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState("");
  const [orderId, setOrderId] = useState("");

  async function loadAll(currentStoreId: string) {
    const token = requireTokenOrRedirect();
    if (!token) return;
    setError("");
    try {
      const [iRes, oRes] = await Promise.all([
        fetch(`${API_BASE}/invoices?storeId=${encodeURIComponent(currentStoreId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/orders?storeId=${encodeURIComponent(currentStoreId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      const iData = await iRes.json();
      const oData = await oRes.json();
      if (iRes.ok) setInvoices(iData.invoices || []);
      else setError(iData.error || "Error loading invoices");
      if (oRes.ok) setOrders(oData.orders || []);
    } catch {
      setError("Connection error");
    }
  }

  useEffect(() => {
    if (loading) return;
    if (!storeId || !permissions.financeRead) return;
    queueMicrotask(() => {
      void loadAll(storeId);
    });
  }, [loading, storeId, permissions.financeRead]);

  async function createInvoice(e: React.FormEvent) {
    e.preventDefault();
    const token = requireTokenOrRedirect();
    if (!token || !storeId || !orderId) return;
    const res = await fetch(`${API_BASE}/invoices`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ storeId, orderId, taxEur: "0" }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error || "Cannot create invoice");
    await loadAll(storeId);
  }

  function openDoc(invoiceId: string) {
    const token = requireTokenOrRedirect();
    if (!token || !storeId) return;
    const url = `${API_BASE}/invoices/${invoiceId}/document?storeId=${encodeURIComponent(
      storeId
    )}&format=pdf`;
    window.open(url, "_blank");
  }

  if (loading) {
    return <div className="min-h-screen bg-gray-100 p-6">Cargando permisos...</div>;
  }

  if (permissionsError) {
    return <div className="min-h-screen bg-gray-100 p-6 text-red-700">{permissionsError}</div>;
  }

  if (!permissions.financeRead) {
    return (
      <div className="min-h-screen bg-gray-100 p-6">
        <div className="max-w-3xl mx-auto bg-white p-4 rounded-2xl shadow-md">No autorizado para Facturas.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <Topbar title="Facturas" storeName={storeName} />
        {error ? <div className="bg-red-100 text-red-700 p-3 rounded">{error}</div> : null}

        <div className="bg-white p-4 rounded-2xl shadow-md">
          <h2 className="font-semibold mb-3">Crear factura</h2>
          <form className="flex gap-2" onSubmit={createInvoice}>
            <select className="border rounded px-3 py-2" value={orderId} onChange={(e) => setOrderId(e.target.value)}>
              <option value="">Order</option>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.orderNumber}
                </option>
              ))}
            </select>
            <button className="rounded bg-black text-white px-3 py-2" type="submit">
              Crear
            </button>
          </form>
        </div>

        <div className="bg-white rounded-2xl shadow-md overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-3 py-2">Invoice</th>
                <th className="text-left px-3 py-2">Order</th>
                <th className="text-left px-3 py-2">Issued</th>
                <th className="text-left px-3 py-2">Total EUR</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Doc</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-gray-500">
                    Sin facturas
                  </td>
                </tr>
              ) : (
                invoices.map((i) => (
                  <tr key={i.id} className="border-b">
                    <td className="px-3 py-2">{i.invoiceNumber}</td>
                    <td className="px-3 py-2">{i.order?.orderNumber || "-"}</td>
                    <td className="px-3 py-2">{new Date(i.issuedAt).toISOString().slice(0, 10)}</td>
                    <td className="px-3 py-2">{i.totalEur}</td>
                    <td className="px-3 py-2">{i.status}</td>
                    <td className="px-3 py-2">
                      <button className="underline" onClick={() => openDoc(i.id)}>
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
