"use client";

import { useEffect, useState } from "react";
import Topbar from "../components/topbar";
import { requireTokenOrRedirect } from "../lib/auth";
import { useStorePermissions } from "../lib/access";

const API_BASE = "http://localhost:3001";

type Order = { id: string; orderNumber: string };
type Product = { id: string; brand: string; model: string };
type Warehouse = { id: string; code: string; name: string };
type ReturnCaseRow = {
  id: string;
  createdAt: string;
  decision: string;
  quantity: number;
  returnCostEur: number | null;
  status: string;
  order?: { orderNumber: string } | null;
  product?: { brand: string; model: string } | null;
};

export default function ReturnsPage() {
  const { loading, storeId, storeName, permissions, error: permissionsError } = useStorePermissions();
  const [error, setError] = useState("");
  const [returns, setReturns] = useState<ReturnCaseRow[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  const [orderId, setOrderId] = useState("");
  const [productId, setProductId] = useState("");
  const [decision, setDecision] = useState("restock");
  const [qty, setQty] = useState("1");
  const [returnCost, setReturnCost] = useState("0");
  const [warehouseId, setWarehouseId] = useState("");
  const [reason, setReason] = useState("");

  async function loadAll(currentStoreId: string) {
    const token = requireTokenOrRedirect();
    if (!token) return;
    setError("");
    try {
      const [rRes, oRes, pRes, bRes] = await Promise.all([
        fetch(`${API_BASE}/returns?storeId=${encodeURIComponent(currentStoreId)}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE}/orders?storeId=${encodeURIComponent(currentStoreId)}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE}/products?storeId=${encodeURIComponent(currentStoreId)}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE}/stores/${currentStoreId}/bootstrap`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const rData = await rRes.json();
      const oData = await oRes.json();
      const pData = await pRes.json();
      const bData = await bRes.json();

      if (rRes.ok) setReturns(rData.returns || []);
      else setError(rData.error || "Error loading returns");
      if (oRes.ok) setOrders(oData.orders || []);
      if (pRes.ok) setProducts(pData.products || []);
      if (bRes.ok) setWarehouses(bData.warehouses || []);
    } catch {
      setError("Connection error");
    }
  }

  useEffect(() => {
    if (loading) return;
    if (!storeId || !permissions.returnsWrite) return;
    queueMicrotask(() => {
      void loadAll(storeId);
    });
  }, [loading, storeId, permissions.returnsWrite]);

  async function createReturn(e: React.FormEvent) {
    e.preventDefault();
    const token = requireTokenOrRedirect();
    if (!token || !storeId) return;
    const res = await fetch(`${API_BASE}/returns`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        storeId,
        orderId: orderId || null,
        productId: productId || null,
        decision,
        quantity: Number(qty),
        returnCostEur: Number(returnCost),
        warehouseId: decision === "restock" ? warehouseId || null : null,
        reason: reason || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error || "Cannot create return");
    setReason("");
    await loadAll(storeId);
  }

  if (loading) {
    return <div className="min-h-screen bg-gray-100 p-6">Cargando permisos...</div>;
  }

  if (permissionsError) {
    return <div className="min-h-screen bg-gray-100 p-6 text-red-700">{permissionsError}</div>;
  }

  if (!permissions.returnsWrite) {
    return (
      <div className="min-h-screen bg-gray-100 p-6">
        <div className="max-w-3xl mx-auto bg-white p-4 rounded-2xl shadow-md">No autorizado para Devoluciones.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <Topbar title="Devoluciones" storeName={storeName} />
        {error ? <div className="bg-red-100 text-red-700 p-3 rounded">{error}</div> : null}

        <div className="bg-white p-4 rounded-2xl shadow-md">
          <h2 className="font-semibold mb-3">Nuevo caso devolución</h2>
          <form className="grid md:grid-cols-7 gap-2" onSubmit={createReturn}>
            <select className="border rounded px-3 py-2" value={orderId} onChange={(e) => setOrderId(e.target.value)}>
              <option value="">Pedido</option>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.orderNumber}
                </option>
              ))}
            </select>
            <select className="border rounded px-3 py-2" value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">Producto</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.brand} {p.model}
                </option>
              ))}
            </select>
            <select className="border rounded px-3 py-2" value={decision} onChange={(e) => setDecision(e.target.value)}>
              <option value="restock">restock</option>
              <option value="discount">discount</option>
              <option value="repair">repair</option>
              <option value="scrap">scrap</option>
            </select>
            <input className="border rounded px-3 py-2" value={qty} onChange={(e) => setQty(e.target.value)} />
            <input className="border rounded px-3 py-2" value={returnCost} onChange={(e) => setReturnCost(e.target.value)} />
            <select className="border rounded px-3 py-2" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              <option value="">Almacen</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code}
                </option>
              ))}
            </select>
            <button className="rounded bg-black text-white px-3 py-2">Crear</button>
          </form>
          <input
            className="border rounded px-3 py-2 mt-2 w-full"
            placeholder="Motivo"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        <div className="bg-white rounded-2xl shadow-md overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-3 py-2">Fecha</th>
                <th className="text-left px-3 py-2">Pedido</th>
                <th className="text-left px-3 py-2">Producto</th>
                <th className="text-left px-3 py-2">Decision</th>
                <th className="text-left px-3 py-2">Qty</th>
                <th className="text-left px-3 py-2">Coste</th>
                <th className="text-left px-3 py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {returns.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-gray-500">
                    Sin devoluciones
                  </td>
                </tr>
              ) : (
                returns.map((r) => (
                  <tr key={r.id} className="border-b">
                    <td className="px-3 py-2">{new Date(r.createdAt).toISOString().slice(0, 10)}</td>
                    <td className="px-3 py-2">{r.order?.orderNumber || "-"}</td>
                    <td className="px-3 py-2">{r.product ? `${r.product.brand} ${r.product.model}` : "-"}</td>
                    <td className="px-3 py-2">{r.decision}</td>
                    <td className="px-3 py-2">{r.quantity}</td>
                    <td className="px-3 py-2">{r.returnCostEur ?? "-"}</td>
                    <td className="px-3 py-2">{r.status}</td>
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
