"use client";

import { useEffect, useState } from "react";
import { requireTokenOrRedirect } from "../lib/auth";
import Topbar from "../components/topbar";
import { useStorePermissions } from "../lib/access";

const API_BASE = "http://localhost:3001";

type AnalyticsSummary = {
  sales?: { revenueEur?: number; profitEur?: number };
  payouts?: { discrepancyEur?: number };
  returns?: { totalCostEur?: number };
};

type ChannelAnalytics = {
  channelCode: string;
  channelName: string;
  revenueEur: number;
  profitEur: number;
};

type CountryAnalytics = {
  countryCode: string;
  revenueEur: number;
  profitEur: number;
};

export default function AnalyticsPage() {
  const { loading, storeId, storeName, permissions, error: permissionsError } = useStorePermissions();
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [channels, setChannels] = useState<ChannelAnalytics[]>([]);
  const [countries, setCountries] = useState<CountryAnalytics[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  async function loadAll(currentStoreId: string, from = "", to = "") {
    const token = requireTokenOrRedirect();
    if (!token) return;
    setError("");
    try {
      const qs = new URLSearchParams({
        storeId: currentStoreId,
        ...(from ? { dateFrom: from } : {}),
        ...(to ? { dateTo: to } : {}),
      }).toString();

      const [sRes, chRes, coRes] = await Promise.all([
        fetch(`${API_BASE}/analytics/summary?${qs}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE}/analytics/channels?${qs}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE}/analytics/countries?${qs}`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const sData = await sRes.json();
      const chData = await chRes.json();
      const coData = await coRes.json();

      if (sRes.ok) setSummary(sData);
      else setError(sData.error || "Error loading summary");
      if (chRes.ok) setChannels(chData.channels || []);
      if (coRes.ok) setCountries(coData.countries || []);
    } catch {
      setError("Connection error");
    }
  }

  useEffect(() => {
    if (loading) return;
    if (!storeId || !permissions.analyticsRead) return;
    queueMicrotask(() => {
      void loadAll(storeId);
    });
  }, [loading, storeId, permissions.analyticsRead]);

  if (loading) {
    return <div className="min-h-screen bg-gray-100 p-6">Cargando permisos...</div>;
  }

  if (permissionsError) {
    return <div className="min-h-screen bg-gray-100 p-6 text-red-700">{permissionsError}</div>;
  }

  if (!permissions.analyticsRead) {
    return (
      <div className="min-h-screen bg-gray-100 p-6">
        <div className="max-w-3xl mx-auto bg-white p-4 rounded-2xl shadow-md">No autorizado para Analytics.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <Topbar title="Analytics" storeName={storeName} />
        {error ? <div className="bg-red-100 text-red-700 p-3 rounded">{error}</div> : null}

        <div className="bg-white p-4 rounded-2xl shadow-md">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!storeId) return;
              loadAll(storeId, dateFrom, dateTo);
            }}
          >
            <input className="border rounded px-3 py-2" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            <input className="border rounded px-3 py-2" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            <button className="border rounded px-3 py-2">Filtrar</button>
          </form>
        </div>

        <div className="grid md:grid-cols-4 gap-3">
          <div className="bg-white p-4 rounded-2xl shadow-md">
            <div className="text-xs text-gray-500">Ventas EUR</div>
            <div className="text-2xl font-semibold">{summary?.sales?.revenueEur ?? "-"}</div>
          </div>
          <div className="bg-white p-4 rounded-2xl shadow-md">
            <div className="text-xs text-gray-500">Profit EUR</div>
            <div className="text-2xl font-semibold">{summary?.sales?.profitEur ?? "-"}</div>
          </div>
          <div className="bg-white p-4 rounded-2xl shadow-md">
            <div className="text-xs text-gray-500">Payout Discrepancy</div>
            <div className="text-2xl font-semibold">{summary?.payouts?.discrepancyEur ?? "-"}</div>
          </div>
          <div className="bg-white p-4 rounded-2xl shadow-md">
            <div className="text-xs text-gray-500">Coste Devoluciones</div>
            <div className="text-2xl font-semibold">{summary?.returns?.totalCostEur ?? "-"}</div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-white p-4 rounded-2xl shadow-md">
            <h2 className="font-semibold mb-2">Canales</h2>
            <div className="text-sm space-y-1">
              {channels.map((c) => (
                <div key={c.channelCode}>
                  {c.channelName}: {c.revenueEur} EUR | margin {c.profitEur}
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white p-4 rounded-2xl shadow-md">
            <h2 className="font-semibold mb-2">Países</h2>
            <div className="text-sm space-y-1">
              {countries.map((c) => (
                <div key={c.countryCode}>
                  {c.countryCode}: {c.revenueEur} EUR | margin {c.profitEur}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
