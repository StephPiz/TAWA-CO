"use client";

import { useEffect, useState } from "react";
import Topbar from "../components/topbar";
import { requireTokenOrRedirect } from "../lib/auth";
import { useStorePermissions } from "../lib/access";

const API_BASE = "http://localhost:3001";

type Purchase = { id: string; poNumber: string };
type ThreePlLeg = {
  id: string;
  legOrder: number;
  originLabel: string;
  destinationLabel: string;
  status: string;
  costEurFrozen: number | null;
};
type Shipment = {
  id: string;
  referenceCode: string;
  providerName: string;
  purchaseOrder: Purchase | null;
  legs: ThreePlLeg[];
};

export default function ThreePlPage() {
  const { loading, storeId, storeName, permissions, error: permissionsError } = useStorePermissions();
  const [error, setError] = useState("");
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);

  const [referenceCode, setReferenceCode] = useState("");
  const [providerName, setProviderName] = useState("GlobalTransit 3PL");
  const [purchaseOrderId, setPurchaseOrderId] = useState("");

  async function loadAll(currentStoreId: string) {
    const token = requireTokenOrRedirect();
    if (!token) return;
    setError("");
    try {
      const [sRes, pRes] = await Promise.all([
        fetch(`${API_BASE}/three-pl?storeId=${encodeURIComponent(currentStoreId)}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE}/purchases?storeId=${encodeURIComponent(currentStoreId)}`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const sData = await sRes.json();
      const pData = await pRes.json();

      if (sRes.ok) setShipments(sData.shipments || []);
      else setError(sData.error || "Error loading 3PL");
      if (pRes.ok) setPurchases((pData.purchases || []).map((p: { id: string; poNumber: string }) => ({ id: p.id, poNumber: p.poNumber })));
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

  async function createShipment(e: React.FormEvent) {
    e.preventDefault();
    const token = requireTokenOrRedirect();
    if (!token || !storeId || !referenceCode || !providerName) return;

    const res = await fetch(`${API_BASE}/three-pl`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        storeId,
        purchaseOrderId: purchaseOrderId || null,
        providerName,
        referenceCode,
      }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error || "Cannot create shipment");

    setReferenceCode("");
    await loadAll(storeId);
  }

  if (loading) return <div className="min-h-screen bg-gray-100 p-6">Cargando permisos...</div>;
  if (permissionsError) return <div className="min-h-screen bg-gray-100 p-6 text-red-700">{permissionsError}</div>;
  if (!permissions.financeRead) {
    return (
      <div className="min-h-screen bg-gray-100 p-6">
        <div className="max-w-3xl mx-auto bg-white p-4 rounded-2xl shadow-md">No autorizado para 3PL.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <Topbar title="3PL / Importacion" storeName={storeName} />
        {error ? <div className="bg-red-100 text-red-700 p-3 rounded">{error}</div> : null}

        <div className="bg-white p-4 rounded-2xl shadow-md">
          <h2 className="font-semibold mb-3">Nuevo embarque 3PL</h2>
          <form className="grid md:grid-cols-4 gap-2" onSubmit={createShipment}>
            <input className="border rounded px-3 py-2" placeholder="3PL-2026-0002" value={referenceCode} onChange={(e) => setReferenceCode(e.target.value)} required />
            <input className="border rounded px-3 py-2" value={providerName} onChange={(e) => setProviderName(e.target.value)} required />
            <select className="border rounded px-3 py-2" value={purchaseOrderId} onChange={(e) => setPurchaseOrderId(e.target.value)}>
              <option value="">PO opcional</option>
              {purchases.map((p) => (
                <option key={p.id} value={p.id}>{p.poNumber}</option>
              ))}
            </select>
            <button className="rounded bg-black text-white px-3 py-2" type="submit">Crear</button>
          </form>
        </div>

        <div className="bg-white rounded-2xl shadow-md overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-3 py-2">Referencia</th>
                <th className="text-left px-3 py-2">Proveedor 3PL</th>
                <th className="text-left px-3 py-2">PO</th>
                <th className="text-left px-3 py-2">Legs</th>
              </tr>
            </thead>
            <tbody>
              {shipments.length === 0 ? (
                <tr><td colSpan={4} className="px-3 py-4 text-gray-500">Sin embarques 3PL</td></tr>
              ) : (
                shipments.map((s) => (
                  <tr key={s.id} className="border-b">
                    <td className="px-3 py-2">{s.referenceCode}</td>
                    <td className="px-3 py-2">{s.providerName}</td>
                    <td className="px-3 py-2">{s.purchaseOrder?.poNumber || "-"}</td>
                    <td className="px-3 py-2">{s.legs.length}</td>
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
