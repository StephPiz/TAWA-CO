"use client";

import { useEffect, useState } from "react";
import { requireTokenOrRedirect } from "../lib/auth";
import Topbar from "../components/topbar";
import { useStorePermissions } from "../lib/access";

const API_BASE = "http://localhost:3001";

type Payout = {
  id: string;
  payoutRef: string;
  payoutDate: string;
  amountEurFrozen: number;
  feesEur: number;
  adjustmentsEur: number;
  reconciledEur: number;
  netExpectedEur: number;
  discrepancyEur: number;
  channel: { name: string } | null;
};

type Order = { id: string; orderNumber: string; grossAmountEurFrozen: number };
type Channel = { id: string; name: string };

export default function PayoutsPage() {
  const { loading, storeId, storeName, permissions, error: permissionsError } = useStorePermissions();
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<{ netExpectedEur: number; reconciledEur: number; discrepancyEur: number } | null>(null);
  const [alerts, setAlerts] = useState<string[]>([]);
  const [summary, setSummary] = useState<{ netExpectedEur: number; reconciledEur: number; discrepancyEur: number } | null>(null);

  const [payoutRef, setPayoutRef] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("198");
  const [channelId, setChannelId] = useState("");
  const [matchOrderId, setMatchOrderId] = useState("");
  const [matchAmount, setMatchAmount] = useState("198");
  const [csvText, setCsvText] = useState("payoutRef,payoutDate,amount,fees,adjustments,channelCode\nPAY-2026-03-01,2026-03-01,198,8.5,-2.5,SHOPIFY");
  const [importResult, setImportResult] = useState("\u00a0");
  const [bulkPayoutId, setBulkPayoutId] = useState("");
  const [bulkMatches, setBulkMatches] = useState("ORDER-1001;120\nORDER-1002;78.5");
  const [bulkResult, setBulkResult] = useState("\u00a0");
  const [uploadName, setUploadName] = useState("");

  async function loadAll(currentStoreId: string) {
    const token = requireTokenOrRedirect();
    if (!token) return;
    setError("");
    try {
      const [pRes, oRes, bRes] = await Promise.all([
        fetch(`${API_BASE}/payouts?storeId=${encodeURIComponent(currentStoreId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/orders?storeId=${encodeURIComponent(currentStoreId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/stores/${currentStoreId}/bootstrap`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const pData = await pRes.json();
      const oData = await oRes.json();
      const bData = await bRes.json();

      if (pRes.ok) {
        setPayouts(pData.payouts || []);
        setSummary(pData.summary || null);
        setAlerts(pData.alerts || []);
      } else setError(pData.error || "Error loading payouts");
      if (oRes.ok) setOrders(oData.orders || []);
      if (bRes.ok) setChannels(bData.channels || []);
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

  if (loading) {
    return <div className="min-h-screen bg-gray-100 p-6">Cargando permisos...</div>;
  }

  if (permissionsError) {
    return <div className="min-h-screen bg-gray-100 p-6 text-red-700">{permissionsError}</div>;
  }

  if (!permissions.financeRead) {
    return (
      <div className="min-h-screen bg-gray-100 p-6">
        <div className="max-w-3xl mx-auto bg-white p-4 rounded-2xl shadow-md">No autorizado para Payouts.</div>
      </div>
    );
  }

  async function createPayout(e: React.FormEvent) {
    e.preventDefault();
    const token = requireTokenOrRedirect();
    if (!token || !storeId || !payoutRef) return;
    const res = await fetch(`${API_BASE}/payouts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        storeId,
        channelId: channelId || null,
        payoutRef,
        payoutDate: date,
        currencyCode: "EUR",
        amountOriginal: amount,
        fxToEur: "1",
        feesEur: "8.5",
        adjustmentsEur: "-2.5",
        orderMatches: matchOrderId ? [{ orderId: matchOrderId, amountEur: matchAmount }] : [],
      }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error || "Cannot create payout");
    setPayoutRef("");
    await loadAll(storeId);
  }

  async function importCsv(e: React.FormEvent) {
    e.preventDefault();
    const token = requireTokenOrRedirect();
    if (!token || !storeId) return;
    setImportResult("Importando...");
    const res = await fetch(`${API_BASE}/payouts/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ storeId, csvText }),
    });
    const data = await res.json();
    if (!res.ok) {
      setImportResult(data.error || "Error al importar");
      return;
    }
    setImportResult(`Creados ${data.created}, omitidos ${data.skipped}`);
    await loadAll(storeId);
  }

  function onFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCsvText(String(ev.target?.result || ""));
      setImportResult(`Archivo cargado: ${file.name}`);
      setUploadName(file.name);
    };
    reader.readAsText(file);
  }

  function parseBulkLines(): { orderNumber: string; amountEur: number }[] {
    return bulkMatches
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(/[;,]/);
        return { orderNumber: parts[0]?.trim() || "", amountEur: Number(parts[1] || 0) };
      })
      .filter((r) => r.orderNumber && Number.isFinite(r.amountEur) && r.amountEur > 0);
  }

  async function autoMatch(e: React.FormEvent) {
    e.preventDefault();
    const token = requireTokenOrRedirect();
    if (!token || !storeId || !bulkPayoutId) return;
    const rows = parseBulkLines();
    if (!rows.length) {
      setBulkResult("Sin filas válidas");
      return;
    }
    setBulkResult("Conciliando...");
    const res = await fetch(`${API_BASE}/payouts/${bulkPayoutId}/auto-match`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ storeId, matches: rows }),
    });
    const data = await res.json();
    if (!res.ok) {
      setBulkResult(data.error || "Error al conciliar");
      return;
    }
    setBulkResult(`Agregados ${data.added}, total conciliado EUR ${data.totalMatchedEur}`);
    await loadAll(storeId);
  }

  function downloadDiscrepanciesCsv() {
    const header = "payoutRef,netExpected,reconciled,discrepancy\n";
    const rows = payouts
      .filter((p) => Math.abs(p.discrepancyEur) > 0.01)
      .map((p) => `${p.payoutRef},${p.netExpectedEur},${p.reconciledEur},${p.discrepancyEur}`)
      .join("\n");
    const csv = header + rows;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "payout_discrepancies.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <Topbar title="Payouts / Conciliacion" storeName={storeName} />
        {error ? <div className="bg-red-100 text-red-700 p-3 rounded">{error}</div> : null}
        {summary ? (
          <div className="bg-white p-3 rounded-2xl shadow-md text-sm flex flex-wrap gap-4">
            <div>Esperado neto: {summary.netExpectedEur?.toFixed(2)} EUR</div>
            <div>Conciliado: {summary.reconciledEur?.toFixed(2)} EUR</div>
            <div className={Math.abs(summary.discrepancyEur) > 0.5 ? "text-red-700" : "text-green-700"}>
              Diferencia: {summary.discrepancyEur?.toFixed(2)} EUR
            </div>
          </div>
        ) : null}
        {alerts.length ? (
          <div className="bg-amber-100 text-amber-800 p-3 rounded-2xl shadow-md text-sm space-y-1">
            <div className="font-semibold">Alertas de discrepancia</div>
            {alerts.map((a, i) => (
              <div key={i}>{a}</div>
            ))}
          </div>
        ) : null}

        <div className="bg-white p-4 rounded-2xl shadow-md">
          <h2 className="font-semibold mb-3">Registrar payout</h2>
          <form className="grid md:grid-cols-7 gap-2" onSubmit={createPayout}>
            <input
              className="border rounded px-3 py-2"
              placeholder="PAY-2026-03-01"
              value={payoutRef}
              onChange={(e) => setPayoutRef(e.target.value)}
              required
            />
            <input className="border rounded px-3 py-2" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <input className="border rounded px-3 py-2" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <select className="border rounded px-3 py-2" value={channelId} onChange={(e) => setChannelId(e.target.value)}>
              <option value="">Canal</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select className="border rounded px-3 py-2" value={matchOrderId} onChange={(e) => setMatchOrderId(e.target.value)}>
              <option value="">Order match</option>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.orderNumber}
                </option>
              ))}
            </select>
            <input className="border rounded px-3 py-2" value={matchAmount} onChange={(e) => setMatchAmount(e.target.value)} />
            <button className="rounded bg-black text-white px-3 py-2" type="submit">
              Crear
            </button>
          </form>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-white p-4 rounded-2xl shadow-md space-y-2">
            <div className="font-semibold">Importar CSV pegado</div>
            <p className="text-xs text-gray-600">Cabeceras: payoutRef,payoutDate,amount,fees,adjustments,channelCode,fx</p>
            <form className="space-y-2" onSubmit={importCsv}>
              <input type="file" accept=".csv,text/csv" onChange={onFileUpload} className="text-sm" />
              {uploadName ? <div className="text-xs text-gray-600">Seleccionado: {uploadName}</div> : null}
              <textarea
                className="w-full border rounded px-3 py-2 font-mono text-xs min-h-[140px]"
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
              />
              <div className="flex gap-2 items-center">
                <button className="rounded bg-black text-white px-3 py-2" type="submit">
                  Importar
                </button>
                <span className="text-sm text-gray-700">{importResult}</span>
              </div>
            </form>
          </div>

          <div className="bg-white p-4 rounded-2xl shadow-md space-y-2">
            <div className="font-semibold">Conciliar en bloque (orderNumber;amount)</div>
            <form className="space-y-2" onSubmit={autoMatch}>
              <select className="border rounded px-3 py-2 w-full" value={bulkPayoutId} onChange={(e) => setBulkPayoutId(e.target.value)}>
                <option value="">Payout</option>
                {payouts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.payoutRef}
                  </option>
                ))}
              </select>
              <textarea
                className="w-full border rounded px-3 py-2 font-mono text-xs min-h-[140px]"
                value={bulkMatches}
                onChange={(e) => setBulkMatches(e.target.value)}
              />
              <div className="flex gap-2 items-center">
                <button className="rounded bg-black text-white px-3 py-2" type="submit">
                  Conciliar
                </button>
                <span className="text-sm text-gray-700">{bulkResult}</span>
              </div>
            </form>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-md overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b text-sm">
            <div>Payouts</div>
            <button className="rounded border px-3 py-1 text-sm" onClick={downloadDiscrepanciesCsv}>
              Descargar discrepancias
            </button>
          </div>
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-3 py-2">Ref</th>
                <th className="text-left px-3 py-2">Date</th>
                <th className="text-left px-3 py-2">Channel</th>
                <th className="text-left px-3 py-2">Amount EUR</th>
                <th className="text-left px-3 py-2">Fees</th>
                <th className="text-left px-3 py-2">Adjust</th>
                <th className="text-left px-3 py-2">Reconciled</th>
                <th className="text-left px-3 py-2">Dif.</th>
              </tr>
            </thead>
            <tbody>
              {payouts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-4 text-gray-500">
                    Sin payouts
                  </td>
                </tr>
              ) : (
                payouts.map((p) => (
                  <tr key={p.id} className="border-b">
                    <td className="px-3 py-2">{p.payoutRef}</td>
                    <td className="px-3 py-2">{new Date(p.payoutDate).toISOString().slice(0, 10)}</td>
                    <td className="px-3 py-2">{p.channel?.name || "-"}</td>
                    <td className="px-3 py-2">{p.amountEurFrozen}</td>
                    <td className="px-3 py-2">{p.feesEur}</td>
                    <td className="px-3 py-2">{p.adjustmentsEur}</td>
                    <td className="px-3 py-2">{p.reconciledEur}</td>
                    <td className={`px-3 py-2 ${Math.abs(p.discrepancyEur) > 0.5 ? "text-red-700" : "text-green-700"}`}>
                      {p.discrepancyEur.toFixed(2)}
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
