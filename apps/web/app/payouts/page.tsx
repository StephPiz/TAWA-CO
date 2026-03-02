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

  const [payoutRef, setPayoutRef] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("198");
  const [channelId, setChannelId] = useState("");
  const [matchOrderId, setMatchOrderId] = useState("");
  const [matchAmount, setMatchAmount] = useState("198");

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

      if (pRes.ok) setPayouts(pData.payouts || []);
      else setError(pData.error || "Error loading payouts");
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

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <Topbar title="Payouts / Conciliacion" storeName={storeName} />
        {error ? <div className="bg-red-100 text-red-700 p-3 rounded">{error}</div> : null}

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

        <div className="bg-white rounded-2xl shadow-md overflow-hidden">
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
              </tr>
            </thead>
            <tbody>
              {payouts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-gray-500">
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
