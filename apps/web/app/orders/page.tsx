"use client";

import { useEffect, useState } from "react";
import { requireTokenOrRedirect } from "../lib/auth";
import Topbar from "../components/topbar";

const API_BASE = "http://localhost:3001";

type Product = { id: string; ean: string; brand: string; model: string; name: string };
type Channel = { id: string; code: string; name: string };
type Warehouse = { id: string; code: string; name: string };
type Order = {
  id: string;
  orderNumber: string;
  platform: string;
  sourceLabel: string | null;
  status: string;
  paymentStatus: string;
  grossAmountEurFrozen: number;
  netProfitEur: number;
  orderedAt: string;
  backorders?: { id: string; productId: string; missingQty: number; status: string }[];
};
type Backorder = {
  id: string;
  status: string;
  missingQty: number;
  fulfilledQty: number;
  order: { orderNumber: string };
  product: { brand: string; model: string };
};
type StockAlert = {
  productId: string;
  brand: string;
  model: string;
  currentStock: number;
  threshold: number;
  severity: string;
};

export default function OrdersPage() {
  const [storeId, setStoreId] = useState("");
  const [storeName, setStoreName] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [backorders, setBackorders] = useState<Backorder[]>([]);
  const [stockAlerts, setStockAlerts] = useState<StockAlert[]>([]);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(true);

  const [orderNumber, setOrderNumber] = useState("");
  const [platform, setPlatform] = useState("Shopify");
  const [sourceChannelId, setSourceChannelId] = useState("");
  const [country, setCountry] = useState("DE");
  const [amount, setAmount] = useState("209");
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("1");
  const [allowBackorder, setAllowBackorder] = useState(false);
  const [fulfillQtyByBackorder, setFulfillQtyByBackorder] = useState<Record<string, string>>({});
  const [fulfillingBackorderId, setFulfillingBackorderId] = useState("");
  const [fulfillWarehouseId, setFulfillWarehouseId] = useState("");

  async function loadAll(currentStoreId: string) {
    const token = requireTokenOrRedirect();
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const [ordersRes, productsRes, bootstrapRes, backordersRes, alertsRes] = await Promise.all([
        fetch(`${API_BASE}/orders?storeId=${encodeURIComponent(currentStoreId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/products?storeId=${encodeURIComponent(currentStoreId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/stores/${currentStoreId}/bootstrap`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/backorders?storeId=${encodeURIComponent(currentStoreId)}&status=open`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/inventory/alerts/low-stock?storeId=${encodeURIComponent(currentStoreId)}&threshold=2`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      const ordersData = await ordersRes.json();
      const productsData = await productsRes.json();
      const bootstrapData = await bootstrapRes.json();
      const backordersData = await backordersRes.json();
      const alertsData = await alertsRes.json();

      if (ordersRes.ok) setOrders(ordersData.orders || []);
      if (productsRes.ok) setProducts(productsData.products || []);
      if (bootstrapRes.ok) {
        setChannels(bootstrapData.channels || []);
        setWarehouses(bootstrapData.warehouses || []);
      }
      if (backordersRes.ok) setBackorders(backordersData.backorders || []);
      if (alertsRes.ok) setStockAlerts(alertsData.alerts || []);

      if (!ordersRes.ok) setError(ordersData.error || "Error loading orders");
    } catch {
      setError("Connection error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const token = requireTokenOrRedirect();
    if (!token) return;
    const selectedStoreId = localStorage.getItem("selectedStoreId");
    if (!selectedStoreId) return;
    setStoreId(selectedStoreId);

    try {
      const storesRaw = localStorage.getItem("stores");
      if (storesRaw) {
        const stores = JSON.parse(storesRaw) as { storeId: string; storeName: string }[];
        setStoreName(stores.find((s) => s.storeId === selectedStoreId)?.storeName || "");
      }
    } catch {}

    loadAll(selectedStoreId);
  }, []);

  async function createOrder(e: React.FormEvent) {
    e.preventDefault();
    const token = requireTokenOrRedirect();
    if (!token || !storeId || !orderNumber || !amount || !productId) return;
    const selectedProduct = products.find((p) => p.id === productId);
    const res = await fetch(`${API_BASE}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        storeId,
        orderNumber,
        platform,
        sourceChannelId: sourceChannelId || null,
        sourceLabel: channels.find((c) => c.id === sourceChannelId)?.name || null,
        customerCountryCode: country,
        currencyCode: "EUR",
        grossAmountOriginal: amount,
        grossFxToEur: "1",
        feesEur: "8.5",
        cpaEur: "4.2",
        shippingCostEur: "5.9",
        packagingCostEur: "1.2",
        returnCostEur: "0",
        status: "paid",
        paymentStatus: "paid",
        allowBackorder,
        items: [
          {
            productId,
            productEan: selectedProduct?.ean || null,
            title: selectedProduct?.name || "Item",
            quantity: Number(qty || "1"),
            unitPriceOriginal: amount,
            fxToEur: "1",
          },
        ],
      }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error || "Cannot create order");
    if (data.order?.status === "backorder") {
      setInfo("Pedido creado con backorder abierto por falta de stock.");
    } else {
      setInfo("");
    }
    setOrderNumber("");
    await loadAll(storeId);
  }

  async function fulfillBackorder(backorder: Backorder) {
    const token = requireTokenOrRedirect();
    if (!token || !storeId) return;

    const openQty = Math.max(Number(backorder.missingQty || 0) - Number(backorder.fulfilledQty || 0), 0);
    const rawQty = fulfillQtyByBackorder[backorder.id];
    const fulfillQty = Number(rawQty || openQty || 0);
    if (!Number.isInteger(fulfillQty) || fulfillQty <= 0) {
      setError("Cantidad de cumplimiento invalida");
      return;
    }

    setFulfillingBackorderId(backorder.id);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/backorders/${backorder.id}/fulfill`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          storeId,
          fulfillQty,
          warehouseId: fulfillWarehouseId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo cumplir backorder");
        return;
      }
      setInfo(`Backorder ${backorder.order.orderNumber} actualizado.`);
      await loadAll(storeId);
    } catch {
      setError("Connection error");
    } finally {
      setFulfillingBackorderId("");
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <Topbar title="Pedidos / Ventas" storeName={storeName} />
        {error ? <div className="bg-red-100 text-red-700 p-3 rounded">{error}</div> : null}
        {info ? <div className="bg-amber-100 text-amber-800 p-3 rounded">{info}</div> : null}

        <div className="bg-white p-4 rounded-2xl shadow-md">
          <h2 className="font-semibold mb-3">Nuevo pedido</h2>
          <form className="grid md:grid-cols-7 gap-2" onSubmit={createOrder}>
            <input
              className="border rounded px-3 py-2"
              placeholder="SO-1169"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              required
            />
            <input className="border rounded px-3 py-2" value={platform} onChange={(e) => setPlatform(e.target.value)} />
            <select className="border rounded px-3 py-2" value={sourceChannelId} onChange={(e) => setSourceChannelId(e.target.value)}>
              <option value="">Canal origen</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input className="border rounded px-3 py-2" value={country} onChange={(e) => setCountry(e.target.value)} />
            <input className="border rounded px-3 py-2" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <select className="border rounded px-3 py-2" value={productId} onChange={(e) => setProductId(e.target.value)} required>
              <option value="">Producto</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.brand} {p.model}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <input className="border rounded px-3 py-2 w-20" value={qty} onChange={(e) => setQty(e.target.value)} />
              <button className="rounded bg-black text-white px-3 py-2" type="submit">
                Crear
              </button>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={allowBackorder} onChange={(e) => setAllowBackorder(e.target.checked)} />
              Permitir backorder
            </label>
          </form>
        </div>

        <div className="bg-white rounded-2xl shadow-md overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-3 py-2">Order</th>
                <th className="text-left px-3 py-2">Platform</th>
                <th className="text-left px-3 py-2">Source</th>
                <th className="text-left px-3 py-2">Gross EUR</th>
                <th className="text-left px-3 py-2">Profit EUR</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Payment</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-gray-500">
                    Cargando...
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-gray-500">
                    Sin pedidos
                  </td>
                </tr>
              ) : (
                orders.map((o) => (
                  <tr key={o.id} className="border-b">
                    <td className="px-3 py-2">{o.orderNumber}</td>
                    <td className="px-3 py-2">{o.platform}</td>
                    <td className="px-3 py-2">{o.sourceLabel || "-"}</td>
                    <td className="px-3 py-2">{o.grossAmountEurFrozen?.toFixed?.(2) || o.grossAmountEurFrozen}</td>
                    <td className="px-3 py-2">{o.netProfitEur?.toFixed?.(2) || o.netProfitEur}</td>
                    <td className="px-3 py-2">{o.status}</td>
                    <td className="px-3 py-2">{o.paymentStatus}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-white p-4 rounded-2xl shadow-md">
            <h2 className="font-semibold mb-2">Backorders abiertos</h2>
            <div className="mb-2">
              <select
                className="border rounded px-3 py-2 text-sm"
                value={fulfillWarehouseId}
                onChange={(e) => setFulfillWarehouseId(e.target.value)}
              >
                <option value="">FIFO global (sin filtrar almacén)</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} - {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="text-sm space-y-1">
              {backorders.length === 0 ? (
                <div className="text-gray-500">Sin backorders abiertos</div>
              ) : (
                backorders.map((b) => (
                  <div key={b.id} className="border rounded p-2 flex items-center gap-2">
                    <div className="flex-1">
                      {b.order.orderNumber} | {b.product.brand} {b.product.model} | faltan{" "}
                      {Math.max(Number(b.missingQty || 0) - Number(b.fulfilledQty || 0), 0)}
                    </div>
                    <input
                      className="border rounded px-2 py-1 w-20"
                      value={fulfillQtyByBackorder[b.id] ?? ""}
                      placeholder="qty"
                      onChange={(e) =>
                        setFulfillQtyByBackorder((prev) => ({
                          ...prev,
                          [b.id]: e.target.value,
                        }))
                      }
                    />
                    <button
                      className="rounded bg-black text-white px-2 py-1 disabled:opacity-50"
                      onClick={() => fulfillBackorder(b)}
                      disabled={fulfillingBackorderId === b.id}
                    >
                      {fulfillingBackorderId === b.id ? "..." : "Cumplir"}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="bg-white p-4 rounded-2xl shadow-md">
            <h2 className="font-semibold mb-2">Alertas stock bajo</h2>
            <div className="text-sm space-y-1">
              {stockAlerts.length === 0 ? (
                <div className="text-gray-500">Sin alertas</div>
              ) : (
                stockAlerts.map((a) => (
                  <div key={a.productId}>
                    {a.brand} {a.model}: {a.currentStock} (umbral {a.threshold})
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
