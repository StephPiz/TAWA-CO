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

const STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  sent: "Enviado",
  priced: "Precios recibidos",
  paid: "Pagado",
  preparing: "Preparando",
  checklist: "Checklist",
  tracking_received: "Tracking recibido",
  in_transit: "En tránsito",
  received: "Recibido",
  verified: "Verificado",
  closed: "Cerrado",
  incident: "Incidencia",
  planned: "Planificado",
  delivered: "Entregado",
  delayed: "Retrasado",
};

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

function formatDate(date: string | null | undefined) {
  if (!date) return "-";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("es-ES", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function formatMoney(value: number | null | undefined) {
  if (value == null || Number.isNaN(Number(value))) return "-";
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(Number(value));
}

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

        <div className="rounded-2xl bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-3">
              <Link href="/store/purchases" className="inline-flex h-11 items-center rounded-full border border-[#D4D9E4] px-4 text-[14px] text-[#25304F]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                ← Volver a Compras
              </Link>
              <div>
                <h2 className="text-[28px] leading-none text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>
                  {purchase?.poNumber || "-"}
                </h2>
                <p className="mt-2 text-[15px] text-[#4F5568]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                  Proveedor: {purchase?.supplier?.name || "-"}
                </p>
              </div>
            </div>

            <div className="grid min-w-[420px] grid-cols-2 gap-3 text-[14px]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
              <div className="rounded-2xl bg-[#F6F7FA] p-4">
                <div className="text-[#7A8196]">Estado actual</div>
                <div className="mt-1 text-[18px] text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>
                  {STATUS_LABELS[purchase?.status || ""] || purchase?.status || "-"}
                </div>
              </div>
              <div className="rounded-2xl bg-[#F6F7FA] p-4">
                <div className="text-[#7A8196]">Total PO</div>
                <div className="mt-1 text-[18px] text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>
                  {formatMoney(purchase?.totalAmountEur)}
                </div>
              </div>
              <div className="rounded-2xl bg-[#F6F7FA] p-4">
                <div className="text-[#7A8196]">Fecha pedido</div>
                <div className="mt-1 text-[#141A39]">{formatDate(purchase?.orderedAt)}</div>
              </div>
              <div className="rounded-2xl bg-[#F6F7FA] p-4">
                <div className="text-[#7A8196]">Fecha esperada</div>
                <div className="mt-1 text-[#141A39]">{formatDate(purchase?.expectedAt)}</div>
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-[minmax(0,1fr)_260px] gap-4">
            <div className="rounded-2xl bg-[#F6F7FA] p-4 text-[14px] text-[#4F5568]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <div className="text-[#7A8196]">Tracking</div>
                  <div className="mt-1 text-[#141A39]">{purchase?.trackingCode || "-"}</div>
                </div>
                <div>
                  <div className="text-[#7A8196]">Items</div>
                  <div className="mt-1 text-[#141A39]">{purchase?.items?.length || 0}</div>
                </div>
                <div>
                  <div className="text-[#7A8196]">Pagos registrados</div>
                  <div className="mt-1 text-[#141A39]">{purchase?.payments?.length || 0}</div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end">
              {purchase?.trackingUrl ? (
                <a
                  className="inline-flex h-11 items-center justify-center rounded-full bg-[#0B1230] px-5 text-[14px] text-white"
                  style={{ fontFamily: "var(--font-purchase-detail-heading)" }}
                  href={purchase.trackingUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir tracking
                </a>
              ) : (
                <div className="inline-flex h-11 items-center justify-center rounded-full border border-[#D4D9E4] px-5 text-[14px] text-[#7A8196]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                  Sin tracking
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <div className="rounded-2xl bg-white p-4 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
            <div className="text-[13px] text-[#7A8196]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>Costo PO (EUR)</div>
            <div className="mt-2 text-[24px] text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>
              {formatMoney(purchase?.summary?.poCostEur)}
            </div>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
            <div className="text-[13px] text-[#7A8196]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>Logística 3PL</div>
            <div className="mt-2 text-[24px] text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>
              {formatMoney(purchase?.summary?.logistics3plEur)}
            </div>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
            <div className="text-[13px] text-[#7A8196]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>Landed cost</div>
            <div className="mt-2 text-[24px] text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>
              {formatMoney(purchase?.summary?.landedCostEur)}
            </div>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
            <div className="text-[13px] text-[#7A8196]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>Ingreso estimado</div>
            <div className="mt-2 text-[24px] text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>
              {formatMoney(purchase?.summary?.estimatedRevenueEur)}
            </div>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
            <div className="text-[13px] text-[#7A8196]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>Profit estimado</div>
            <div className="mt-2 text-[24px] text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>
              {formatMoney(purchase?.summary?.estimatedGrossProfitEur)}
            </div>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
            <div className="text-[13px] text-[#7A8196]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>Margen estimado</div>
            <div className="mt-2 text-[24px] text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>
              {purchase?.summary?.estimatedMarginPct != null ? `${purchase.summary.estimatedMarginPct}%` : "-"}
            </div>
          </div>
        </div>

        {error ? <div className="bg-red-100 text-red-700 p-3 rounded">{error}</div> : null}
        {info ? <div className="bg-emerald-100 text-emerald-700 p-3 rounded">{info}</div> : null}

        <div className="rounded-2xl bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
          <h3 className="mb-3 text-[20px] text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>Timeline de estado</h3>
          <div className="flex flex-wrap gap-2 mb-3">
            {STATUS_FLOW.map((step) => (
              <span
                key={step}
                className={`rounded-full px-3 py-2 text-[12px] border ${purchase?.status === step ? "border-[#0B1230] bg-[#0B1230] text-white" : "border-[#D5DAE5] bg-[#F7F8FB] text-[#626A82]"}`}
                style={{ fontFamily: "var(--font-purchase-detail-body)" }}
              >
                {STATUS_LABELS[step] || step}
              </span>
            ))}
          </div>
          <div className="flex gap-2 items-center">
            <select className="h-11 rounded-full border border-[#D5DAE5] bg-white px-4 text-[14px] text-[#25304F] outline-none" style={{ fontFamily: "var(--font-purchase-detail-body)" }} value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS_FLOW.map((step) => (
                <option key={step} value={step}>
                  {STATUS_LABELS[step] || step}
                </option>
              ))}
            </select>
            <button className="h-11 rounded-full bg-[#0B1230] px-5 text-[14px] text-white disabled:opacity-50" style={{ fontFamily: "var(--font-purchase-detail-heading)" }} onClick={updateStatus} disabled={busyAction === "status"}>
              {busyAction === "status" ? "..." : "Guardar estado"}
            </button>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
          <h3 className="mb-3 text-[20px] text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>Recepción</h3>
          <div className="flex gap-2 items-center mb-3">
            <select className="h-11 rounded-full border border-[#D5DAE5] bg-white px-4 text-[14px] text-[#25304F] outline-none" style={{ fontFamily: "var(--font-purchase-detail-body)" }} value={receiveWarehouseId} onChange={(e) => setReceiveWarehouseId(e.target.value)}>
              <option value="">Selecciona almacén</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} - {w.name}
                </option>
              ))}
            </select>
            <button
              className="h-11 rounded-full bg-[#0B1230] px-5 text-[14px] text-white disabled:opacity-50"
              style={{ fontFamily: "var(--font-purchase-detail-heading)" }}
              onClick={receiveAllPending}
              disabled={!receiveWarehouseId || busyAction === "receive_all"}
            >
              {busyAction === "receive_all" ? "..." : "Recibir pendientes"}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-[#D9DDE7] bg-[#F7F8FB]">
                <tr>
                  <th className="text-left px-3 py-3 text-[13px] text-[#5F6780]">Item</th>
                  <th className="text-left px-3 py-3 text-[13px] text-[#5F6780]">EAN</th>
                  <th className="text-left px-3 py-3 text-[13px] text-[#5F6780]">Pedido</th>
                  <th className="text-left px-3 py-3 text-[13px] text-[#5F6780]">Recibido</th>
                  <th className="text-left px-3 py-3 text-[13px] text-[#5F6780]">Pendiente</th>
                  <th className="text-left px-3 py-3 text-[13px] text-[#5F6780]">Acción</th>
                </tr>
              </thead>
              <tbody>
                {(purchase?.items || []).map((item) => {
                  const pending = pendingByItem[item.id] || 0;
                  return (
                    <tr key={item.id} className="border-b border-[#EEF1F6] last:border-b-0">
                      <td className="px-3 py-3 text-[#25304F]">{item.title}</td>
                      <td className="px-3 py-3 text-[#626A82]">{item.ean || "-"}</td>
                      <td className="px-3 py-3 text-[#25304F]">{item.quantityOrdered}</td>
                      <td className="px-3 py-3 text-[#25304F]">{item.quantityReceived}</td>
                      <td className="px-3 py-3">
                        <span className="inline-flex rounded-full bg-[#F4EFFF] px-3 py-1 text-[12px] text-[#5F42D7]">
                          {pending}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <input
                            className="h-10 w-20 rounded-full border border-[#D5DAE5] px-3 text-[14px] text-[#25304F] outline-none"
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
                            className="h-10 rounded-full bg-[#0B1230] px-4 text-[13px] text-white disabled:opacity-50"
                            style={{ fontFamily: "var(--font-purchase-detail-heading)" }}
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

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-2xl bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
            <h3 className="mb-3 text-[20px] text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>Pagos PO</h3>
            <form className="grid grid-cols-5 gap-2 mb-4" onSubmit={createPayment}>
              <input className="h-11 rounded-full border border-[#D5DAE5] px-4 text-[14px] text-[#25304F] outline-none" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
              <input className="h-11 rounded-full border border-[#D5DAE5] px-4 text-[14px] text-[#25304F] outline-none" value={paymentCurrency} onChange={(e) => setPaymentCurrency(e.target.value)} />
              <input className="h-11 rounded-full border border-[#D5DAE5] px-4 text-[14px] text-[#25304F] outline-none" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} />
              <input className="h-11 rounded-full border border-[#D5DAE5] px-4 text-[14px] text-[#25304F] outline-none" value={paymentFx} onChange={(e) => setPaymentFx(e.target.value)} />
              <button className="h-11 rounded-full bg-[#0B1230] px-4 text-[13px] text-white disabled:opacity-50" style={{ fontFamily: "var(--font-purchase-detail-heading)" }} type="submit" disabled={busyAction === "payment"}>
                {busyAction === "payment" ? "..." : "Agregar pago"}
              </button>
            </form>
            <div className="space-y-2 text-[14px]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
              {(purchase?.payments || []).length === 0 ? (
                <div className="rounded-2xl bg-[#F7F8FB] p-4 text-[#6E768E]">Sin pagos</div>
              ) : (
                purchase?.payments.map((p) => (
                  <div key={p.id} className="rounded-2xl bg-[#F7F8FB] p-4 text-[#25304F]">
                    {formatDate(p.paidAt)} | {p.currencyCode} {p.amountOriginal} | EUR {p.amountEurFrozen}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
            <h3 className="mb-3 text-[20px] text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>3PL y tramos</h3>
            <form className="grid grid-cols-3 gap-2 mb-3" onSubmit={createShipment}>
              <input className="h-11 rounded-full border border-[#D5DAE5] px-4 text-[14px] text-[#25304F] outline-none" placeholder="Referencia 3PL" value={shipmentRef} onChange={(e) => setShipmentRef(e.target.value)} />
              <input className="h-11 rounded-full border border-[#D5DAE5] px-4 text-[14px] text-[#25304F] outline-none" placeholder="Proveedor 3PL" value={shipmentProvider} onChange={(e) => setShipmentProvider(e.target.value)} />
              <button className="h-11 rounded-full bg-[#0B1230] px-4 text-[13px] text-white disabled:opacity-50" style={{ fontFamily: "var(--font-purchase-detail-heading)" }} type="submit" disabled={busyAction === "shipment"}>
                {busyAction === "shipment" ? "..." : "Crear embarque"}
              </button>
            </form>
            <form className="grid grid-cols-8 gap-2 mb-3" onSubmit={createLeg}>
              <select className="h-11 rounded-full border border-[#D5DAE5] px-4 text-[14px] text-[#25304F] outline-none" value={selectedShipmentId} onChange={(e) => setSelectedShipmentId(e.target.value)}>
                <option value="">Embarque</option>
                {(purchase?.shipments3pl || []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.referenceCode}
                  </option>
                ))}
              </select>
              <input className="h-11 rounded-full border border-[#D5DAE5] px-4 text-[14px] text-[#25304F] outline-none" placeholder="Origen" value={legOrigin} onChange={(e) => setLegOrigin(e.target.value)} />
              <input className="h-11 rounded-full border border-[#D5DAE5] px-4 text-[14px] text-[#25304F] outline-none" placeholder="Destino" value={legDestination} onChange={(e) => setLegDestination(e.target.value)} />
              <input className="h-11 rounded-full border border-[#D5DAE5] px-4 text-[14px] text-[#25304F] outline-none" placeholder="Coste" value={legCost} onChange={(e) => setLegCost(e.target.value)} />
              <input className="h-11 rounded-full border border-[#D5DAE5] px-4 text-[14px] text-[#25304F] outline-none" placeholder="Moneda" value={legCurrency} onChange={(e) => setLegCurrency(e.target.value)} />
              <input className="h-11 rounded-full border border-[#D5DAE5] px-4 text-[14px] text-[#25304F] outline-none" placeholder="FX" value={legFx} onChange={(e) => setLegFx(e.target.value)} />
              <select className="h-11 rounded-full border border-[#D5DAE5] px-4 text-[14px] text-[#25304F] outline-none" value={legStatus} onChange={(e) => setLegStatus(e.target.value)}>
                <option value="planned">planned</option>
                <option value="in_transit">in_transit</option>
                <option value="delivered">delivered</option>
                <option value="delayed">delayed</option>
              </select>
              <button className="h-11 rounded-full bg-[#0B1230] px-4 text-[13px] text-white disabled:opacity-50" style={{ fontFamily: "var(--font-purchase-detail-heading)" }} type="submit" disabled={busyAction === "leg" || !selectedShipmentId}>
                {busyAction === "leg" ? "..." : "Agregar tramo"}
              </button>
            </form>
            <div className="space-y-2 text-[14px]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
              {(purchase?.shipments3pl || []).length === 0 ? (
                <div className="rounded-2xl bg-[#F7F8FB] p-4 text-[#6E768E]">Sin embarques 3PL</div>
              ) : (
                purchase?.shipments3pl.map((s) => (
                  <div key={s.id} className="rounded-2xl bg-[#F7F8FB] p-4">
                    <div className="font-medium text-[#141A39]">{s.referenceCode} ({s.providerName})</div>
                    {s.legs.map((leg) => (
                      <div key={leg.id} className="mt-2 text-[#4F5568]">
                        Tramo {leg.legOrder}: {leg.originLabel} → {leg.destinationLabel} ({STATUS_LABELS[leg.status] || leg.status}) {leg.costEurFrozen ?? "-"} EUR
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
