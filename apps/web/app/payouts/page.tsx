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

function inputClass() {
  return "h-11 w-full rounded-full border-none bg-white px-4 text-[14px] text-[#25304F] outline-none shadow-[inset_0_0_0_1px_rgba(18,22,48,0.08)] placeholder:text-[#8B90A0]";
}

function cardClass() {
  return "rounded-2xl bg-white p-4 shadow-[0_10px_30px_rgba(0,0,0,0.08)]";
}

export default function PayoutsPage() {
  const { loading, storeId, storeName, permissions, error: permissionsError } = useStorePermissions();
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<{ netExpectedEur: number; reconciledEur: number; discrepancyEur: number } | null>(null);
  const [alerts, setAlerts] = useState<string[]>([]);

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
    if (loading || !storeId || !permissions.financeRead) return;
    queueMicrotask(() => {
      void loadAll(storeId);
    });
  }, [loading, storeId, permissions.financeRead]);

  if (loading) return <div className="min-h-screen bg-[#E8EAEC] p-6">Cargando permisos...</div>;
  if (permissionsError) return <div className="min-h-screen bg-[#E8EAEC] p-6 text-red-700">{permissionsError}</div>;

  if (!permissions.financeRead) {
    return (
      <div className="min-h-screen bg-[#E8EAEC] p-6">
        <div className="mx-auto max-w-3xl rounded-2xl bg-white p-4 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">No autorizado para Payouts.</div>
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
    <div className="min-h-screen bg-[#E8EAEC] p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <Topbar title="Payouts / Conciliación" storeName={storeName} />
        {error ? <div className="rounded-2xl bg-[#FDECEC] p-3 text-[#B42318]">{error}</div> : null}

        {summary ? (
          <div className="grid gap-4 md:grid-cols-3">
            <div className={cardClass()}>
              <div className="text-[12px] text-[#6E768E]">Esperado neto</div>
              <div className="mt-1 text-[28px] text-[#141A39]">{summary.netExpectedEur?.toFixed(2)} EUR</div>
            </div>
            <div className={cardClass()}>
              <div className="text-[12px] text-[#6E768E]">Conciliado</div>
              <div className="mt-1 text-[28px] text-[#141A39]">{summary.reconciledEur?.toFixed(2)} EUR</div>
            </div>
            <div className={cardClass()}>
              <div className="text-[12px] text-[#6E768E]">Diferencia</div>
              <div className={`mt-1 text-[28px] ${Math.abs(summary.discrepancyEur) > 0.5 ? "text-[#B42318]" : "text-[#1F7A3E]"}`}>
                {summary.discrepancyEur?.toFixed(2)} EUR
              </div>
            </div>
          </div>
        ) : null}

        {alerts.length ? (
          <div className="rounded-2xl bg-[#FFF6E7] p-4 text-[#9A6700] shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
            <div className="font-semibold">Alertas de discrepancia</div>
            <div className="mt-2 space-y-1 text-sm">
              {alerts.map((a, i) => (
                <div key={i}>{a}</div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className={cardClass()}>
            <h2 className="mb-3 text-[20px] text-[#141A39]">Registrar payout</h2>
            <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" onSubmit={createPayout}>
              <input className={inputClass()} placeholder="PAY-2026-03-01" value={payoutRef} onChange={(e) => setPayoutRef(e.target.value)} required />
              <input className={inputClass()} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              <input className={inputClass()} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Monto" />
              <select className={inputClass()} value={channelId} onChange={(e) => setChannelId(e.target.value)}>
                <option value="">Canal</option>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select className={inputClass()} value={matchOrderId} onChange={(e) => setMatchOrderId(e.target.value)}>
                <option value="">Pedido a conciliar</option>
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.orderNumber}
                  </option>
                ))}
              </select>
              <input className={inputClass()} value={matchAmount} onChange={(e) => setMatchAmount(e.target.value)} placeholder="Monto conciliado" />
              <div className="xl:col-span-2 flex justify-end">
                <button className="h-11 rounded-full bg-[#0B1230] px-6 text-[14px] text-white hover:bg-[#1A2348]" type="submit">
                  Crear
                </button>
              </div>
            </form>
          </div>

          <div className={cardClass()}>
            <h2 className="mb-3 text-[20px] text-[#141A39]">Conciliación en bloque</h2>
            <form className="space-y-3" onSubmit={autoMatch}>
              <select className={inputClass()} value={bulkPayoutId} onChange={(e) => setBulkPayoutId(e.target.value)}>
                <option value="">Selecciona payout</option>
                {payouts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.payoutRef}
                  </option>
                ))}
              </select>
              <textarea
                className="min-h-[140px] w-full rounded-2xl border-none bg-[#F7F9FC] px-4 py-3 font-mono text-xs text-[#25304F] outline-none shadow-[inset_0_0_0_1px_rgba(18,22,48,0.08)]"
                value={bulkMatches}
                onChange={(e) => setBulkMatches(e.target.value)}
              />
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-[#6E768E]">{bulkResult}</div>
                <button className="h-11 rounded-full bg-[#0B1230] px-6 text-[14px] text-white hover:bg-[#1A2348]" type="submit">
                  Conciliar
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className={cardClass()}>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-[20px] text-[#141A39]">Importar CSV</h2>
                <p className="mt-1 text-[13px] text-[#616984]">Cabeceras: payoutRef, payoutDate, amount, fees, adjustments, channelCode</p>
              </div>
            </div>
            <form className="space-y-3" onSubmit={importCsv}>
              <input type="file" accept=".csv,text/csv" onChange={onFileUpload} className="text-sm" />
              {uploadName ? <div className="text-xs text-[#6E768E]">Seleccionado: {uploadName}</div> : null}
              <textarea
                className="min-h-[160px] w-full rounded-2xl border-none bg-[#F7F9FC] px-4 py-3 font-mono text-xs text-[#25304F] outline-none shadow-[inset_0_0_0_1px_rgba(18,22,48,0.08)]"
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
              />
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-[#6E768E]">{importResult}</div>
                <button className="h-11 rounded-full bg-[#0B1230] px-6 text-[14px] text-white hover:bg-[#1A2348]" type="submit">
                  Importar
                </button>
              </div>
            </form>
          </div>

          <div className={cardClass()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[20px] text-[#141A39]">Payouts</h2>
              <button className="rounded-full border border-[#D4D9E4] bg-white px-4 py-2 text-sm text-[#25304F] hover:bg-[#F7F9FC]" onClick={downloadDiscrepanciesCsv}>
                Descargar discrepancias
              </button>
            </div>
            <div className="overflow-hidden rounded-2xl border border-[#E2E6EF]">
              <table className="min-w-full text-sm">
                <thead className="border-b bg-[#F7F9FC]">
                  <tr className="text-left text-[#4F5568]">
                    <th className="px-3 py-3">Ref</th>
                    <th className="px-3 py-3">Fecha</th>
                    <th className="px-3 py-3">Canal</th>
                    <th className="px-3 py-3">Monto EUR</th>
                    <th className="px-3 py-3">Fees</th>
                    <th className="px-3 py-3">Ajustes</th>
                    <th className="px-3 py-3">Conciliado</th>
                    <th className="px-3 py-3">Dif.</th>
                  </tr>
                </thead>
                <tbody>
                  {payouts.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-4 text-[#6E768E]">
                        Sin payouts
                      </td>
                    </tr>
                  ) : (
                    payouts.map((p) => (
                      <tr key={p.id} className="border-b border-[#EEF1F6] last:border-b-0">
                        <td className="px-3 py-3 text-[#25304F]">{p.payoutRef}</td>
                        <td className="px-3 py-3 text-[#25304F]">{new Date(p.payoutDate).toISOString().slice(0, 10)}</td>
                        <td className="px-3 py-3 text-[#25304F]">{p.channel?.name || "-"}</td>
                        <td className="px-3 py-3 text-[#25304F]">{p.amountEurFrozen}</td>
                        <td className="px-3 py-3 text-[#25304F]">{p.feesEur}</td>
                        <td className="px-3 py-3 text-[#25304F]">{p.adjustmentsEur}</td>
                        <td className="px-3 py-3 text-[#25304F]">{p.reconciledEur}</td>
                        <td className={`px-3 py-3 ${Math.abs(p.discrepancyEur) > 0.5 ? "text-[#B42318]" : "text-[#1F7A3E]"}`}>
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
      </div>
    </div>
  );
}
