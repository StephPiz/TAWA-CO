"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import localFont from "next/font/local";
import { requireTokenOrRedirect } from "../../lib/auth";
import { useStorePermissions } from "../../lib/access";

const API_BASE = "http://localhost:3001";
const headingFont = localFont({
  src: "../../fonts/HFHySans_Black.ttf",
  variable: "--font-purchase-detail-heading",
});
const bodyFont = localFont({
  src: "../../fonts/HFHySans_Regular.ttf",
  variable: "--font-purchase-detail-body",
});

const STATUS_FLOW = [
  "draft",
  "sent",
  "priced",
  "paid",
  "preparing",
  "checklist",
  "tracking_received",
  "in_transit",
  "received",
  "verified",
  "closed",
  "incident",
];

type Warehouse = { id: string; code: string; name: string };

type PurchaseDetail = {
  id: string;
  poNumber: string;
  status: string;
  orderedAt: string;
  expectedAt: string | null;
  trackingCode: string | null;
  trackingUrl: string | null;
  totalAmountEur: number;
  supplier: { id: string; code: string; name: string };
  items: {
    id: string;
    productId: string | null;
    title: string;
    ean: string | null;
    quantityOrdered: number;
    quantityReceived: number;
    totalCostEur: number;
  }[];
  payments: {
    id: string;
    paidAt: string;
    currencyCode: string;
    amountOriginal: number;
    amountEurFrozen: number;
  }[];
  shipments3pl: {
    id: string;
    referenceCode: string;
    providerName: string;
    legs: {
      id: string;
      legOrder: number;
      originLabel: string;
      destinationLabel: string;
      status: string;
      costEurFrozen: number | null;
    }[];
  }[];
  summary?: {
    poCostEur: number;
    logistics3plEur: number;
    landedCostEur: number;
    estimatedRevenueEur: number;
    estimatedGrossProfitEur: number;
    estimatedMarginPct: number | null;
  };
};

export default function PurchaseDetailPage() {
  const { purchaseId } = useParams<{ purchaseId: string }>();
  const { loading, storeId, storeName, permissions, error: permissionsError } = useStorePermissions();

  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [purchase, setPurchase] = useState<PurchaseDetail | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [status, setStatus] = useState("draft");
  const [receiveWarehouseId, setReceiveWarehouseId] = useState("");
  const [qtyByItem, setQtyByItem] = useState<Record<string, string>>({});
  const [busyAction, setBusyAction] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentCurrency, setPaymentCurrency] = useState("EUR");
  const [paymentAmount, setPaymentAmount] = useState("0");
  const [paymentFx, setPaymentFx] = useState("1");
  const [shipmentRef, setShipmentRef] = useState("");
  const [shipmentProvider, setShipmentProvider] = useState("GlobalTransit 3PL");
  const [selectedShipmentId, setSelectedShipmentId] = useState("");
  const [legOrigin, setLegOrigin] = useState("Origen");
  const [legDestination, setLegDestination] = useState("Destino");
  const [legCost, setLegCost] = useState("0");
  const [legCurrency, setLegCurrency] = useState("EUR");
  const [legFx, setLegFx] = useState("1");
  const [legStatus, setLegStatus] = useState("planned");

  const loadAll = useCallback(async (sid: string, poId: string) => {
    const token = requireTokenOrRedirect();
    if (!token) return;
    setError("");

    try {
      const [poRes, bootRes] = await Promise.all([
        fetch(`${API_BASE}/purchases/${poId}?storeId=${encodeURIComponent(sid)}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/stores/${sid}/bootstrap`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const poData = await poRes.json();
      const bootData = await bootRes.json();

      if (!poRes.ok) {
        setError(poData.error || "Error loading purchase detail");
        return;
      }

      const nextPurchase = poData.purchase as PurchaseDetail;
      setPurchase(nextPurchase);
      setStatus(nextPurchase.status);
      setSelectedShipmentId((current) =>
        current || (nextPurchase.shipments3pl && nextPurchase.shipments3pl.length > 0 ? nextPurchase.shipments3pl[0].id : "")
      );

      if (bootRes.ok) {
        const nextWarehouses = (bootData.warehouses || []) as Warehouse[];
        setWarehouses(nextWarehouses);
        if (!receiveWarehouseId && nextWarehouses.length > 0) {
          setReceiveWarehouseId(nextWarehouses[0].id);
        }
      }
    } catch {
      setError("Connection error");
    }
  }, [receiveWarehouseId]);

  useEffect(() => {
    if (loading) return;
    if (!storeId || !purchaseId || !permissions.financeRead) return;
    queueMicrotask(() => {
      void loadAll(storeId, purchaseId);
    });
  }, [loading, storeId, purchaseId, permissions.financeRead, loadAll]);

  const pendingByItem = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of purchase?.items || []) {
      map[item.id] = Math.max(Number(item.quantityOrdered || 0) - Number(item.quantityReceived || 0), 0);
    }
    return map;
  }, [purchase]);

  async function updateStatus() {
    const token = requireTokenOrRedirect();
    if (!token || !storeId || !purchaseId) return;
    setBusyAction("status");
    setError("");
    try {
      const res = await fetch(`${API_BASE}/purchases/${purchaseId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ storeId, status }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error || "Cannot update status");
      setInfo("Estado actualizado");
      await loadAll(storeId, purchaseId);
    } catch {
      setError("Connection error");
    } finally {
      setBusyAction("");
    }
  }

  async function receiveAllPending() {
    const token = requireTokenOrRedirect();
    if (!token || !storeId || !purchaseId || !receiveWarehouseId) return;
    setBusyAction("receive_all");
    setError("");
    try {
      const res = await fetch(`${API_BASE}/purchases/${purchaseId}/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ storeId, warehouseId: receiveWarehouseId }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error || "Cannot receive purchase");
      setInfo("Recepción aplicada");
      await loadAll(storeId, purchaseId);
    } catch {
      setError("Connection error");
    } finally {
      setBusyAction("");
    }
  }

  async function receiveLine(itemId: string) {
    const token = requireTokenOrRedirect();
    if (!token || !storeId || !purchaseId || !receiveWarehouseId) return;

    const pending = pendingByItem[itemId] || 0;
    const typed = Number(qtyByItem[itemId] || pending);
    if (!Number.isInteger(typed) || typed <= 0) {
      setError("Cantidad inválida");
      return;
    }

    setBusyAction(`line_${itemId}`);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/purchases/${purchaseId}/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          storeId,
          warehouseId: receiveWarehouseId,
          lines: [{ purchaseOrderItemId: itemId, quantity: typed }],
        }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error || "Cannot receive line");
      setInfo("Línea recibida");
      await loadAll(storeId, purchaseId);
    } catch {
      setError("Connection error");
    } finally {
      setBusyAction("");
    }
  }

  async function createPayment(e: React.FormEvent) {
    e.preventDefault();
    const token = requireTokenOrRedirect();
    if (!token || !storeId || !purchaseId) return;

    setBusyAction("payment");
    setError("");
    try {
      const res = await fetch(`${API_BASE}/purchases/${purchaseId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          storeId,
          paidAt: paymentDate,
          currencyCode: paymentCurrency,
          amountOriginal: Number(paymentAmount),
          fxToEur: Number(paymentFx),
        }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error || "Cannot create payment");
      setInfo("Pago registrado");
      await loadAll(storeId, purchaseId);
    } catch {
      setError("Connection error");
    } finally {
      setBusyAction("");
    }
  }

  async function createShipment(e: React.FormEvent) {
    e.preventDefault();
    const token = requireTokenOrRedirect();
    if (!token || !storeId || !purchaseId || !shipmentRef || !shipmentProvider) return;

    setBusyAction("shipment");
    setError("");
    try {
      const res = await fetch(`${API_BASE}/three-pl`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          storeId,
          purchaseOrderId: purchaseId,
          providerName: shipmentProvider,
          referenceCode: shipmentRef,
        }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error || "Cannot create 3PL shipment");
      setShipmentRef("");
      setInfo("Embarque 3PL creado");
      await loadAll(storeId, purchaseId);
    } catch {
      setError("Connection error");
    } finally {
      setBusyAction("");
    }
  }

  async function createLeg(e: React.FormEvent) {
    e.preventDefault();
    const token = requireTokenOrRedirect();
    if (!token || !storeId || !selectedShipmentId || !legOrigin || !legDestination) return;

    const shipment = (purchase?.shipments3pl || []).find((s) => s.id === selectedShipmentId);
    const nextOrder = (shipment?.legs?.length || 0) + 1;

    setBusyAction("leg");
    setError("");
    try {
      const res = await fetch(`${API_BASE}/three-pl/${selectedShipmentId}/legs`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          storeId,
          legOrder: nextOrder,
          originLabel: legOrigin,
          destinationLabel: legDestination,
          costCurrencyCode: legCurrency,
          costOriginal: Number(legCost),
          fxToEur: Number(legFx),
          status: legStatus,
        }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error || "Cannot create 3PL leg");
      setInfo("Tramo 3PL agregado");
      await loadAll(storeId, purchaseId);
    } catch {
      setError("Connection error");
    } finally {
      setBusyAction("");
    }
  }

  if (loading) return <div className="min-h-screen bg-[#E8EAEC] p-6">Cargando permisos...</div>;
  if (permissionsError) return <div className="min-h-screen bg-[#E8EAEC] p-6 text-red-700">{permissionsError}</div>;
  if (!permissions.financeRead) {
    return (
      <div className="min-h-screen bg-[#E8EAEC] p-6">
        <div className="max-w-3xl mx-auto bg-white p-4 rounded-2xl shadow-md">No autorizado para Compras.</div>
      </div>
    );
  }

  return (
    <div className={`${headingFont.variable} ${bodyFont.variable} min-h-screen bg-[#E8EAEC] p-6`}>
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="mb-2">
          <h1 className="text-[29px] leading-none text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>
            Detalle PO
          </h1>
          <p className="mt-1 text-[13px] text-[#616984]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
            {storeName ? `Tienda: ${storeName}` : "Seguimiento de orden de compra"}
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
          <Link href="/store/purchases" className="text-sm underline text-[#25304F]">
            Volver a Compras
          </Link>
          <h2 className="mt-2 text-[22px] text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>
            {purchase?.poNumber || "-"}
          </h2>
          <div className="text-sm text-[#4F5568]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
            Proveedor: {purchase?.supplier?.name || "-"} | Total EUR: {purchase?.totalAmountEur ?? "-"} | Estado: {purchase?.status || "-"}
          </div>
          {purchase?.trackingCode ? <div className="text-sm text-[#4F5568]">Tracking: {purchase.trackingCode}</div> : null}
          {purchase?.trackingUrl ? (
            <a className="text-sm underline text-[#25304F]" href={purchase.trackingUrl} target="_blank" rel="noreferrer">
              Abrir tracking
            </a>
          ) : null}
        </div>

        <div className="bg-white p-4 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
          <h3 className="font-semibold mb-2">Resumen financiero estimado</h3>
          <div className="grid md:grid-cols-3 gap-3 text-sm">
            <div className="border rounded p-3">
              <div className="text-gray-500">Costo PO (EUR)</div>
              <div className="text-lg font-semibold">{purchase?.summary?.poCostEur ?? 0}</div>
            </div>
            <div className="border rounded p-3">
              <div className="text-gray-500">Logística 3PL (EUR)</div>
              <div className="text-lg font-semibold">{purchase?.summary?.logistics3plEur ?? 0}</div>
            </div>
            <div className="border rounded p-3">
              <div className="text-gray-500">Landed Cost (EUR)</div>
              <div className="text-lg font-semibold">{purchase?.summary?.landedCostEur ?? 0}</div>
            </div>
            <div className="border rounded p-3">
              <div className="text-gray-500">Ingreso estimado (EUR)</div>
              <div className="text-lg font-semibold">{purchase?.summary?.estimatedRevenueEur ?? 0}</div>
            </div>
            <div className="border rounded p-3">
              <div className="text-gray-500">Profit estimado (EUR)</div>
              <div className="text-lg font-semibold">{purchase?.summary?.estimatedGrossProfitEur ?? 0}</div>
            </div>
            <div className="border rounded p-3">
              <div className="text-gray-500">Margen estimado (%)</div>
              <div className="text-lg font-semibold">{purchase?.summary?.estimatedMarginPct ?? "-"}</div>
            </div>
          </div>
        </div>

        {error ? <div className="bg-red-100 text-red-700 p-3 rounded">{error}</div> : null}
        {info ? <div className="bg-emerald-100 text-emerald-700 p-3 rounded">{info}</div> : null}

        <div className="bg-white p-4 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
          <h3 className="font-semibold mb-2">Timeline estado</h3>
          <div className="flex flex-wrap gap-2 mb-3">
            {STATUS_FLOW.map((step) => (
              <span
                key={step}
                className={`px-2 py-1 rounded text-xs border ${purchase?.status === step ? "bg-black text-white" : "bg-gray-50"}`}
              >
                {step}
              </span>
            ))}
          </div>
          <div className="flex gap-2 items-center">
            <select className="border rounded px-3 py-2" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS_FLOW.map((step) => (
                <option key={step} value={step}>
                  {step}
                </option>
              ))}
            </select>
            <button className="rounded border px-3 py-2 disabled:opacity-50" onClick={updateStatus} disabled={busyAction === "status"}>
              {busyAction === "status" ? "..." : "Actualizar estado"}
            </button>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
          <h3 className="font-semibold mb-2">Recepción</h3>
          <div className="flex gap-2 items-center mb-3">
            <select className="border rounded px-3 py-2" value={receiveWarehouseId} onChange={(e) => setReceiveWarehouseId(e.target.value)}>
              <option value="">Selecciona almacén</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} - {w.name}
                </option>
              ))}
            </select>
            <button
              className="rounded border px-3 py-2 disabled:opacity-50"
              onClick={receiveAllPending}
              disabled={!receiveWarehouseId || busyAction === "receive_all"}
            >
              {busyAction === "receive_all" ? "..." : "Recibir pendientes"}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-3 py-2">Item</th>
                  <th className="text-left px-3 py-2">EAN</th>
                  <th className="text-left px-3 py-2">Ordered</th>
                  <th className="text-left px-3 py-2">Received</th>
                  <th className="text-left px-3 py-2">Pending</th>
                  <th className="text-left px-3 py-2">Acción</th>
                </tr>
              </thead>
              <tbody>
                {(purchase?.items || []).map((item) => {
                  const pending = pendingByItem[item.id] || 0;
                  return (
                    <tr key={item.id} className="border-b">
                      <td className="px-3 py-2">{item.title}</td>
                      <td className="px-3 py-2">{item.ean || "-"}</td>
                      <td className="px-3 py-2">{item.quantityOrdered}</td>
                      <td className="px-3 py-2">{item.quantityReceived}</td>
                      <td className="px-3 py-2">{pending}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <input
                            className="border rounded px-2 py-1 w-20"
                            value={qtyByItem[item.id] ?? ""}
                            placeholder={String(pending)}
                            onChange={(e) =>
                              setQtyByItem((prev) => ({
                                ...prev,
                                [item.id]: e.target.value,
                              }))
                            }
                          />
                          <button
                            className="rounded border px-2 py-1 disabled:opacity-50"
                            disabled={!receiveWarehouseId || pending <= 0 || busyAction === `line_${item.id}` || !item.productId}
                            onClick={() => receiveLine(item.id)}
                          >
                            {busyAction === `line_${item.id}` ? "..." : "Recibir línea"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-white p-4 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
            <h3 className="font-semibold mb-2">Pagos PO</h3>
            <form className="grid grid-cols-5 gap-2 mb-3" onSubmit={createPayment}>
              <input className="border rounded px-2 py-1" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
              <input className="border rounded px-2 py-1" value={paymentCurrency} onChange={(e) => setPaymentCurrency(e.target.value)} />
              <input className="border rounded px-2 py-1" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} />
              <input className="border rounded px-2 py-1" value={paymentFx} onChange={(e) => setPaymentFx(e.target.value)} />
              <button className="rounded border px-2 py-1 disabled:opacity-50" type="submit" disabled={busyAction === "payment"}>
                {busyAction === "payment" ? "..." : "Agregar pago"}
              </button>
            </form>
            <div className="text-sm space-y-1">
              {(purchase?.payments || []).length === 0 ? (
                <div className="text-gray-500">Sin pagos</div>
              ) : (
                purchase?.payments.map((p) => (
                  <div key={p.id}>
                    {new Date(p.paidAt).toISOString().slice(0, 10)} | {p.currencyCode} {p.amountOriginal} | EUR {p.amountEurFrozen}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
            <h3 className="font-semibold mb-2">3PL tramos</h3>
            <form className="grid grid-cols-3 gap-2 mb-2" onSubmit={createShipment}>
              <input className="border rounded px-2 py-1" placeholder="Referencia 3PL" value={shipmentRef} onChange={(e) => setShipmentRef(e.target.value)} />
              <input className="border rounded px-2 py-1" placeholder="Proveedor 3PL" value={shipmentProvider} onChange={(e) => setShipmentProvider(e.target.value)} />
              <button className="rounded border px-2 py-1 disabled:opacity-50" type="submit" disabled={busyAction === "shipment"}>
                {busyAction === "shipment" ? "..." : "Crear embarque"}
              </button>
            </form>
            <form className="grid grid-cols-8 gap-2 mb-3" onSubmit={createLeg}>
              <select className="border rounded px-2 py-1" value={selectedShipmentId} onChange={(e) => setSelectedShipmentId(e.target.value)}>
                <option value="">Embarque</option>
                {(purchase?.shipments3pl || []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.referenceCode}
                  </option>
                ))}
              </select>
              <input className="border rounded px-2 py-1" placeholder="Origen" value={legOrigin} onChange={(e) => setLegOrigin(e.target.value)} />
              <input className="border rounded px-2 py-1" placeholder="Destino" value={legDestination} onChange={(e) => setLegDestination(e.target.value)} />
              <input className="border rounded px-2 py-1" placeholder="Coste" value={legCost} onChange={(e) => setLegCost(e.target.value)} />
              <input className="border rounded px-2 py-1" placeholder="Moneda" value={legCurrency} onChange={(e) => setLegCurrency(e.target.value)} />
              <input className="border rounded px-2 py-1" placeholder="FX" value={legFx} onChange={(e) => setLegFx(e.target.value)} />
              <select className="border rounded px-2 py-1" value={legStatus} onChange={(e) => setLegStatus(e.target.value)}>
                <option value="planned">planned</option>
                <option value="in_transit">in_transit</option>
                <option value="delivered">delivered</option>
                <option value="delayed">delayed</option>
              </select>
              <button className="rounded border px-2 py-1 disabled:opacity-50" type="submit" disabled={busyAction === "leg" || !selectedShipmentId}>
                {busyAction === "leg" ? "..." : "Agregar tramo"}
              </button>
            </form>
            <div className="text-sm space-y-2">
              {(purchase?.shipments3pl || []).length === 0 ? (
                <div className="text-gray-500">Sin embarques 3PL</div>
              ) : (
                purchase?.shipments3pl.map((s) => (
                  <div key={s.id} className="border rounded p-2">
                    <div className="font-medium">{s.referenceCode} ({s.providerName})</div>
                    {s.legs.map((leg) => (
                      <div key={leg.id}>
                        Leg {leg.legOrder}: {leg.originLabel} → {leg.destinationLabel} ({leg.status}) {leg.costEurFrozen ?? "-"} EUR
                      </div>
                    ))}
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
