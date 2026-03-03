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
  linesCount?: number;
};

type Order = { id: string; orderNumber: string };

export default function InvoicesPage() {
  const { loading, storeId, storeName, permissions, error: permissionsError } = useStorePermissions();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState("");
  const [orderId, setOrderId] = useState("");
  const [orderNumberManual, setOrderNumberManual] = useState("");
  const [taxPercent, setTaxPercent] = useState("21");
  const [billingName, setBillingName] = useState("");
  const [billingAddress, setBillingAddress] = useState("");
  const [billingCountry, setBillingCountry] = useState("ES");
  const [notes, setNotes] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [lines, setLines] = useState<{ description: string; quantity: string; unitPriceEur: string; taxPercent: string }[]>([
    { description: "Producto", quantity: "1", unitPriceEur: "100", taxPercent: "21" },
  ]);
  const [discrepancies, setDiscrepancies] = useState<any[]>([]);
  const [loadingDiscrepancies, setLoadingDiscrepancies] = useState(false);

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

  async function loadDiscrepancies(currentStoreId: string, fmt: "json" | "csv" = "json") {
    const token = requireTokenOrRedirect();
    if (!token) return;
    if (fmt === "csv") {
      const url = `${API_BASE}/invoices/discrepancies?storeId=${encodeURIComponent(currentStoreId)}&format=csv`;
      window.open(url + `&t=${Date.now()}`, "_blank", "noopener,noreferrer");
      return;
    }
    setLoadingDiscrepancies(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/invoices/discrepancies?storeId=${encodeURIComponent(currentStoreId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error || "No se pudieron obtener las discrepancias");
      setDiscrepancies(data.discrepancies || []);
    } catch {
      setError("Connection error");
    } finally {
      setLoadingDiscrepancies(false);
    }
  }

  useEffect(() => {
    if (loading) return;
    if (!storeId || !permissions.financeRead) return;
    queueMicrotask(() => {
      void loadAll(storeId);
      void loadDiscrepancies(storeId, "json");
    });
  }, [loading, storeId, permissions.financeRead]);

  useEffect(() => {
    if (!orderNumberManual.trim()) return;
    const found = orders.find((o) => o.orderNumber === orderNumberManual.trim());
    if (found) setOrderId(found.id);
  }, [orderNumberManual, orders]);

  async function createInvoice(e: React.FormEvent) {
    e.preventDefault();
    const token = requireTokenOrRedirect();
    if (!token || !storeId) return;
    let finalOrderId = orderId;
    const trimmedManual = orderNumberManual.trim();
    if (!finalOrderId && trimmedManual) {
      const found = orders.find((o) => o.orderNumber === trimmedManual);
      if (found) finalOrderId = found.id;
    }
    if (!finalOrderId) {
      setError("Selecciona o escribe un pedido válido");
      return;
    }
    const toNumber = (v: string) => Number(String(v || "0").replace(",", "."));

    const res = await fetch(`${API_BASE}/invoices`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        storeId,
        orderId: finalOrderId,
        taxPercent,
        billingName: billingName || undefined,
        billingAddress: billingAddress || undefined,
        billingCountry: billingCountry || undefined,
        notes: notes || undefined,
        dueAt: dueAt || undefined,
        lines: lines
          .map((l) => ({
            description: l.description.trim(),
            quantity: toNumber(l.quantity),
            unitPriceEur: toNumber(l.unitPriceEur),
            taxPercent: toNumber(l.taxPercent),
          }))
          .filter((l) => l.description && l.quantity > 0),
      }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error || "No se pudo crear la factura");
    setError("");
    await loadAll(storeId);
  }

  function updateLine(index: number, field: keyof (typeof lines)[number], value: string) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, [field]: value } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, { description: "", quantity: "1", unitPriceEur: "0", taxPercent: taxPercent || "0" }]);
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  const toNumber = (v: string) => Number(String(v || "0").replace(",", "."));

  function previewTotals() {
    return lines.reduce(
      (acc, l) => {
        const qty = toNumber(l.quantity || "0");
        const price = toNumber(l.unitPriceEur || "0");
        const pct = toNumber(l.taxPercent || "0");
        const lineSub = qty * price;
        const lineTax = lineSub * (pct / 100);
        return {
          subtotal: acc.subtotal + lineSub,
          tax: acc.tax + lineTax,
          total: acc.total + lineSub + lineTax,
        };
      },
      { subtotal: 0, tax: 0, total: 0 }
    );
  }

  const preview = previewTotals();

  async function openDoc(invoiceId: string) {
    const token = requireTokenOrRedirect();
    if (!token || !storeId) return;
    setError("");
    try {
      const res = await fetch(
        `${API_BASE}/invoices/${invoiceId}/document?storeId=${encodeURIComponent(storeId)}&format=pdf`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "No se pudo descargar el PDF");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      setError("Connection error");
    }
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
          <form className="grid md:grid-cols-3 gap-3" onSubmit={createInvoice}>
            <select className="border rounded px-3 py-2" value={orderId} onChange={(e) => setOrderId(e.target.value)}>
              <option value="">Order</option>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.orderNumber}
                </option>
              ))}
            </select>
            <input
              className="border rounded px-3 py-2"
              placeholder="O escribe el número de pedido"
              value={orderNumberManual}
              onChange={(e) => {
                setOrderNumberManual(e.target.value);
                setError("");
              }}
            />
            <input
              className="border rounded px-3 py-2"
              placeholder="Billing name"
              value={billingName}
              onChange={(e) => setBillingName(e.target.value)}
            />
            <input
              className="border rounded px-3 py-2"
              placeholder="Billing country"
              value={billingCountry}
              onChange={(e) => setBillingCountry(e.target.value)}
            />
            <input
              className="border rounded px-3 py-2 md:col-span-2"
              placeholder="Address / notas de facturación"
              value={billingAddress}
              onChange={(e) => setBillingAddress(e.target.value)}
            />
            <input
              className="border rounded px-3 py-2"
              placeholder="Notas"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <input className="border rounded px-3 py-2" type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
            <input
              className="border rounded px-3 py-2"
              type="number"
              step="0.1"
              value={taxPercent}
              onChange={(e) => setTaxPercent(e.target.value)}
              placeholder="% IVA"
            />
            <button className="rounded bg-black text-white px-3 py-2" type="submit">
              Crear
            </button>
          </form>

          <div className="mt-4 space-y-2">
            <div className="font-semibold">Líneas de factura</div>
            <div className="text-xs text-gray-600">Descripción, cantidad, precio unitario, % IVA</div>
            <div className="space-y-2">
              {lines.map((l, idx) => (
                <div key={idx} className="grid md:grid-cols-5 gap-2 items-center">
                  <input
                    className="border rounded px-3 py-2 md:col-span-2"
                    placeholder="Descripción"
                    value={l.description}
                    onChange={(e) => updateLine(idx, "description", e.target.value)}
                  />
                  <input
                    className="border rounded px-3 py-2"
                    type="number"
                    step="0.01"
                    value={l.quantity}
                    onChange={(e) => updateLine(idx, "quantity", e.target.value)}
                  />
                  <input
                    className="border rounded px-3 py-2"
                    type="number"
                    step="0.01"
                    value={l.unitPriceEur}
                    onChange={(e) => updateLine(idx, "unitPriceEur", e.target.value)}
                  />
                  <div className="flex gap-2 items-center">
                    <input
                      className="border rounded px-3 py-2 w-full"
                      type="number"
                      step="0.1"
                      value={l.taxPercent}
                      onChange={(e) => updateLine(idx, "taxPercent", e.target.value)}
                    />
                    <button
                      type="button"
                      className="text-red-600 text-sm px-2"
                      onClick={() => removeLine(idx)}
                      disabled={lines.length === 1}
                    >
                      X
                    </button>
                  </div>
                </div>
              ))}
              <button type="button" className="rounded border px-3 py-2 text-sm" onClick={addLine}>
                + Añadir línea
              </button>
            </div>
            <div className="text-sm text-gray-700">
              Previsualización: Subtotal {preview.subtotal.toFixed(2)} | IVA {preview.tax.toFixed(2)} | Total{" "}
              {preview.total.toFixed(2)}
            </div>
          </div>
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
                <th className="text-left px-3 py-2">Líneas</th>
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
                    <td className="px-3 py-2">{i.linesCount ?? "-"}</td>
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

        <div className="bg-white p-4 rounded-2xl shadow-md">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Discrepancias (totales vs líneas)</h3>
            <div className="flex gap-2">
              <button
                className="rounded border px-3 py-2 text-sm"
                type="button"
                onClick={() => storeId && loadDiscrepancies(storeId, "json")}
                disabled={loadingDiscrepancies}
              >
                {loadingDiscrepancies ? "Cargando..." : "Refrescar"}
              </button>
              <button
                className="rounded border px-3 py-2 text-sm"
                type="button"
                onClick={() => storeId && loadDiscrepancies(storeId, "csv")}
              >
                Descargar CSV
              </button>
            </div>
          </div>
          {discrepancies.length === 0 ? (
            <div className="text-sm text-gray-600">Sin discrepancias.</div>
          ) : (
            <div className="overflow-auto">
              <table className="min-w-full text-xs border">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-2 py-1 text-left">Invoice</th>
                    <th className="px-2 py-1 text-left">Order</th>
                    <th className="px-2 py-1 text-left">Issued</th>
                    <th className="px-2 py-1 text-left">Diff Sub</th>
                    <th className="px-2 py-1 text-left">Diff Tax</th>
                    <th className="px-2 py-1 text-left">Diff Total</th>
                  </tr>
                </thead>
                <tbody>
                  {discrepancies.map((d, idx) => (
                    <tr key={idx} className="border-b">
                      <td className="px-2 py-1">{d.invoiceNumber}</td>
                      <td className="px-2 py-1">{d.orderNumber}</td>
                      <td className="px-2 py-1">{d.issuedAt?.slice?.(0, 10) || "-"}</td>
                      <td className="px-2 py-1">{d.diffSubtotal}</td>
                      <td className="px-2 py-1">{d.diffTax}</td>
                      <td className="px-2 py-1">{d.diffTotal}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
