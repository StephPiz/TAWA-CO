"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import localFont from "next/font/local";
import { requireTokenOrRedirect } from "../lib/auth";
import { useRouter } from "next/navigation";

type Product = {
  id: string;
  ean: string;
  brand: string;
  model: string;
  name?: string;
  status?: string;
  mainImageUrl?: string | null;
};

type WarehouseLocation = { id: string; code: string; name?: string | null };
type Warehouse = { id: string; code: string; name: string; isDefault?: boolean; locations?: WarehouseLocation[] };

type ScanLookupResponse = {
  found: boolean;
  via?: "ean" | "alias";
  alias?: string | null;
  product?: Product;
  suggestedInternalEan?: string;
};

type PurchaseReceiveLookupItem = {
  id: string;
  title?: string | null;
  ean?: string | null;
  quantityOrdered: number;
  quantityReceived: number;
  pendingQty: number;
  productId?: string | null;
  product?: {
    id: string;
    brand: string;
    model: string;
    modelRef?: string | null;
    name?: string | null;
    ean?: string | null;
    mainImageUrl?: string | null;
  } | null;
};

type PurchaseReceiveLookup = {
  matchedBy: string;
  purchase: {
    id: string;
    poNumber: string;
    status: string;
    orderedAt?: string | null;
    expectedAt?: string | null;
    receivedAt?: string | null;
    trackingCode?: string | null;
    trackingUrl?: string | null;
    supplier?: { id: string; name: string } | null;
    shipments3pl?: Array<{
      id: string;
      providerName: string;
      referenceCode: string;
      legs?: Array<{
        id: string;
        trackingCode?: string | null;
        trackingUrl?: string | null;
        departedAt?: string | null;
        deliveredAt?: string | null;
        status?: string;
      }>;
    }>;
    items: PurchaseReceiveLookupItem[];
    summary: {
      totalOrderedUnits: number;
      totalReceivedUnits: number;
      totalPendingUnits: number;
      lineCount: number;
    };
  };
};

const API_BASE = "http://localhost:3001";
const headingFont = localFont({
  src: "../fonts/HFHySans_Black.ttf",
  variable: "--font-scanner-heading",
});
const bodyFont = localFont({
  src: "../fonts/HFHySans_Regular.ttf",
  variable: "--font-scanner-body",
});

async function requestJson(url: string, token: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function normalizeLookupText(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function scoreReceiveLookupItem(item: PurchaseReceiveLookupItem, query: string) {
  const normalizedQuery = normalizeLookupText(query);
  if (!normalizedQuery) return 0;

  const candidates = [
    item.ean,
    item.product?.ean,
    item.product?.modelRef,
    item.product?.model,
    item.title,
    [item.product?.brand, item.product?.modelRef || item.product?.model || item.title].filter(Boolean).join(" "),
  ]
    .map(normalizeLookupText)
    .filter(Boolean);

  let best = 0;
  for (const candidate of candidates) {
    if (candidate === normalizedQuery) best = Math.max(best, 120);
    else if (candidate.startsWith(normalizedQuery)) best = Math.max(best, 80);
    else if (candidate.includes(normalizedQuery)) best = Math.max(best, 40);
  }
  return best;
}

function formatCompactDate(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("es-ES");
}

export default function ScannerPage() {
  const router = useRouter();
  const [storeName, setStoreName] = useState("");
  const [storeId] = useState(() => (typeof window !== "undefined" ? localStorage.getItem("selectedStoreId") || "" : ""));

  const [scanCode, setScanCode] = useState("");
  const [scanResult, setScanResult] = useState<ScanLookupResponse | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState("");

  const [quickBrand, setQuickBrand] = useState("");
  const [quickModel, setQuickModel] = useState("");
  const [quickName, setQuickName] = useState("");
  const [quickCreateLoading, setQuickCreateLoading] = useState(false);

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [receiveQty, setReceiveQty] = useState(1);
  const [unitCostOriginal, setUnitCostOriginal] = useState(10);
  const [currencyCode, setCurrencyCode] = useState("EUR");
  const [fxToEur, setFxToEur] = useState(1);
  const [receiveNote, setReceiveNote] = useState("Recepcion por escaner");
  const [receiveLoading, setReceiveLoading] = useState(false);
  const [receiveMessage, setReceiveMessage] = useState("");
  const [receiveError, setReceiveError] = useState("");
  const [receiveOrderCode, setReceiveOrderCode] = useState("");
  const [receiveOrderLookup, setReceiveOrderLookup] = useState<PurchaseReceiveLookup | null>(null);
  const [receiveOrderLoading, setReceiveOrderLoading] = useState(false);
  const [receiveOrderError, setReceiveOrderError] = useState("");
  const [receiveOrderMessage, setReceiveOrderMessage] = useState("");
  const [receiveOrderQtyByItem, setReceiveOrderQtyByItem] = useState<Record<string, string>>({});
  const [receiveOrderScanCode, setReceiveOrderScanCode] = useState("");
  const [receiveOrderAction, setReceiveOrderAction] = useState("");
  const [receiveLookupPrefilled, setReceiveLookupPrefilled] = useState(false);

  const [incidenceReason, setIncidenceReason] = useState("");

  const selectedWarehouse = useMemo(
    () => warehouses.find((w) => w.id === warehouseId) || null,
    [warehouses, warehouseId]
  );

  const selectedProduct = scanResult?.found ? scanResult.product || null : null;
  const receiveOrderItems = receiveOrderLookup?.purchase.items || [];
  const receiveOrderSelectedUnits = useMemo(
    () =>
      Object.values(receiveOrderQtyByItem).reduce((sum, value) => {
        const next = Number(value || 0);
        return sum + (Number.isFinite(next) ? next : 0);
      }, 0),
    [receiveOrderQtyByItem]
  );
  const fieldClass =
    "h-11 w-full rounded-xl border border-[#D4D9E4] bg-white px-3 text-[14px] text-[#25304F] outline-none focus:border-[#4449CD]";

  const pickWarehouse = useCallback(
    (nextWarehouseId: string, rows?: Warehouse[]) => {
      const source = rows || warehouses;
      const wh = source.find((w) => w.id === nextWarehouseId) || null;
      setWarehouseId(nextWarehouseId);
      const firstLoc = wh && Array.isArray(wh.locations) && wh.locations.length ? wh.locations[0] : null;
      setLocationId(firstLoc?.id || "");
    },
    [warehouses]
  );

  useEffect(() => {
    const token = requireTokenOrRedirect();
    if (!token) return;

    if (!storeId) {
      router.push("/select-store");
      return;
    }

    (async () => {
      const boot = await requestJson(`${API_BASE}/stores/${storeId}/bootstrap`, token, { method: "GET" });
      if (boot.ok) {
        setStoreName(boot.data?.store?.name || "");
      }

      const wh = await requestJson(`${API_BASE}/stores/${storeId}/warehouses`, token, { method: "GET" });
      if (wh.ok) {
        const rows = Array.isArray(wh.data?.warehouses) ? wh.data.warehouses : [];
        setWarehouses(rows);
        if (rows.length > 0) {
          const defaultWh = rows.find((w: Warehouse) => w.isDefault) || rows[0];
          pickWarehouse(defaultWh.id, rows);
        }
      }
    })();
  }, [router, storeId, pickWarehouse]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const prefilledCode = new URLSearchParams(window.location.search).get("receiveCode") || "";
    if (!prefilledCode || receiveLookupPrefilled) return;
    setReceiveOrderCode(prefilledCode);
    setReceiveLookupPrefilled(true);
  }, [receiveLookupPrefilled]);

  async function loadReceiveOrderLookup(codeValue?: string) {
    const token = requireTokenOrRedirect();
    const lookupValue = String(codeValue ?? receiveOrderCode).trim();
    if (!token || !storeId) return null;
    if (!lookupValue) {
      setReceiveOrderError("Escribe tracking, referencia 3PL o PO");
      return null;
    }

    setReceiveOrderLoading(true);
    setReceiveOrderError("");
    setReceiveOrderMessage("");

    const response = await requestJson(`${API_BASE}/purchases/receiving-lookup`, token, {
      method: "POST",
      body: JSON.stringify({ storeId, code: lookupValue }),
    });

    setReceiveOrderLoading(false);

    if (!response.ok) {
      setReceiveOrderLookup(null);
      setReceiveOrderQtyByItem({});
      setReceiveOrderError(response.data?.error || "No se pudo identificar el pedido");
      return null;
    }

    const nextLookup = response.data as PurchaseReceiveLookup;
    setReceiveOrderLookup(nextLookup);
    setReceiveOrderQtyByItem({});
    setReceiveOrderMessage(
      `Pedido identificado por ${
        nextLookup.matchedBy === "tracking"
          ? "tracking"
          : nextLookup.matchedBy === "shipment_reference"
            ? "referencia 3PL"
            : nextLookup.matchedBy === "leg_tracking"
              ? "tracking de tramo"
              : nextLookup.matchedBy === "po"
                ? "PO"
                : "referencia"
      }.`
    );
    return nextLookup;
  }

  async function handleLookup() {
    const token = requireTokenOrRedirect();
    if (!token || !storeId) return;
    if (!scanCode.trim()) {
      setScanError("Ingresa o escanea un codigo");
      return;
    }

    setScanLoading(true);
    setScanError("");
    setScanResult(null);
    setReceiveMessage("");

    const response = await requestJson(`${API_BASE}/scan/lookup`, token, {
      method: "POST",
      body: JSON.stringify({ storeId, code: scanCode.trim() }),
    });

    setScanLoading(false);

    if (response.ok) {
      setScanResult(response.data);
      return;
    }

    if (response.status === 404) {
      setScanResult(response.data);
      return;
    }

    setScanError(response.data?.error || "No se pudo buscar el producto");
  }

  async function handleCreateProduct() {
    const token = requireTokenOrRedirect();
    if (!token || !storeId || !scanResult?.suggestedInternalEan) return;
    if (!quickBrand.trim() || !quickModel.trim()) {
      setScanError("Para crear producto: marca y modelo son obligatorios");
      return;
    }

    setQuickCreateLoading(true);
    setScanError("");

    const response = await requestJson(`${API_BASE}/products`, token, {
      method: "POST",
      body: JSON.stringify({
        storeId,
        ean: scanResult.suggestedInternalEan,
        brand: quickBrand.trim(),
        model: quickModel.trim(),
        name: quickName.trim() || `${quickBrand.trim()} ${quickModel.trim()}`,
        status: "active",
      }),
    });

    setQuickCreateLoading(false);

    if (!response.ok) {
      setScanError(response.data?.error || "No se pudo crear el producto");
      return;
    }

    const created = response.data?.product;
    if (created?.id) {
      setScanResult({ found: true, via: "ean", product: created });
      setScanCode(created.ean || scanCode);
      setReceiveMessage("Producto creado correctamente. Ya puedes recibirlo.");
    }
  }

  async function handleReceive() {
    const token = requireTokenOrRedirect();
    if (!token || !storeId) return;
    if (!selectedProduct?.id) {
      setReceiveError("Primero escanea un producto valido");
      return;
    }
    if (!warehouseId) {
      setReceiveError("Selecciona almacen");
      return;
    }
    if (receiveQty <= 0 || unitCostOriginal <= 0 || fxToEur <= 0) {
      setReceiveError("Cantidad, costo unitario y FX deben ser mayores a 0");
      return;
    }

    setReceiveLoading(true);
    setReceiveError("");
    setReceiveMessage("");

    const response = await requestJson(`${API_BASE}/inventory/receive`, token, {
      method: "POST",
      body: JSON.stringify({
        storeId,
        productId: selectedProduct.id,
        warehouseId,
        locationId: locationId || null,
        quantity: receiveQty,
        unitCostOriginal,
        costCurrencyCode: currencyCode,
        fxToEur,
        note: receiveNote || "Recepcion por escaner",
      }),
    });

    setReceiveLoading(false);

    if (!response.ok) {
      setReceiveError(response.data?.error || "No se pudo confirmar la recepcion");
      return;
    }

    const lotCode = response.data?.lot?.lotCode || "-";
    const movementId = response.data?.movement?.id || "-";
    setReceiveMessage(`Todo OK. Lote ${lotCode} creado, movimiento ${movementId}.`);
  }

  function updateReceiveOrderQty(itemId: string, rawValue: string) {
    const item = receiveOrderItems.find((entry) => entry.id === itemId);
    if (!item) return;

    if (rawValue === "") {
      setReceiveOrderQtyByItem((prev) => ({ ...prev, [itemId]: "" }));
      return;
    }

    const numeric = Math.max(0, Math.min(item.pendingQty, Math.floor(Number(rawValue) || 0)));
    setReceiveOrderQtyByItem((prev) => ({ ...prev, [itemId]: String(numeric) }));
  }

  function changeReceiveOrderQty(itemId: string, delta: number) {
    const item = receiveOrderItems.find((entry) => entry.id === itemId);
    if (!item) return;

    const current = Number(receiveOrderQtyByItem[itemId] || 0);
    const next = Math.max(0, Math.min(item.pendingQty, current + delta));
    setReceiveOrderQtyByItem((prev) => ({ ...prev, [itemId]: String(next) }));
  }

  function assignScannedReceiveLine() {
    const query = normalizeLookupText(receiveOrderScanCode);
    if (!query || !receiveOrderItems.length) {
      setReceiveOrderError("Escanea o escribe un EAN, modelo o referencia");
      return;
    }

    const ranked = receiveOrderItems
      .filter((item) => item.pendingQty > 0)
      .map((item) => ({ item, score: scoreReceiveLookupItem(item, query) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);

    if (ranked.length === 0) {
      setReceiveOrderError("No encontré esa referencia dentro del pedido esperado");
      return;
    }

    const target = ranked[0].item;
    const current = Number(receiveOrderQtyByItem[target.id] || 0);
    const next = Math.max(0, Math.min(target.pendingQty, current + 1));

    setReceiveOrderQtyByItem((prev) => ({ ...prev, [target.id]: String(next) }));
    setReceiveOrderError("");
    setReceiveOrderMessage(
      `Añadido +1 a ${target.product?.brand || ""} ${target.product?.modelRef || target.product?.model || target.title || "línea"}`
        .replace(/\s+/g, " ")
        .trim()
    );
    setReceiveOrderScanCode("");
  }

  async function submitReceiveOrder(receiveAll = false) {
    const token = requireTokenOrRedirect();
    if (!token || !storeId || !receiveOrderLookup?.purchase.id) return;
    if (!warehouseId) {
      setReceiveOrderError("Selecciona primero el almacén de entrada");
      return;
    }

    const lines = receiveAll
      ? receiveOrderItems
          .filter((item) => item.pendingQty > 0)
          .map((item) => ({ purchaseOrderItemId: item.id, quantity: item.pendingQty }))
      : receiveOrderItems
          .map((item) => ({
            purchaseOrderItemId: item.id,
            quantity: Number(receiveOrderQtyByItem[item.id] || 0),
          }))
          .filter((item) => item.quantity > 0);

    if (lines.length === 0) {
      setReceiveOrderError("Marca al menos una línea para enviar a inventario");
      return;
    }

    setReceiveOrderAction(receiveAll ? "receive_all_lookup" : "receive_selected_lookup");
    setReceiveOrderError("");
    setReceiveOrderMessage("");

    const response = await requestJson(`${API_BASE}/purchases/${receiveOrderLookup.purchase.id}/receive`, token, {
      method: "POST",
      body: JSON.stringify({
        storeId,
        warehouseId,
        locationId: locationId || null,
        note: receiveNote || `Recepción en almacén PO ${receiveOrderLookup.purchase.poNumber}`,
        lines,
      }),
    });

    setReceiveOrderAction("");

    if (!response.ok) {
      setReceiveOrderError(response.data?.error || "No se pudo mandar la recepción a inventario");
      return;
    }

    const refreshed = await loadReceiveOrderLookup(receiveOrderCode);
    const lotsCount = Array.isArray(response.data?.receivedLots) ? response.data.receivedLots.length : 0;
    const movedUnits = lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
    setReceiveOrderMessage(
      refreshed?.purchase.summary.totalPendingUnits === 0
        ? `Recepción completa. ${movedUnits} unidades ya entraron a inventario.`
        : `Recepción aplicada. ${movedUnits} unidades enviadas a inventario en ${lotsCount} lotes.`
    );
  }

  return (
    <div className={`${headingFont.variable} ${bodyFont.variable} min-h-screen bg-[#E8EAEC] p-4 md:p-6`}>
      <div className="mx-auto max-w-7xl">
        <div className="mb-2">
          <h1 className="text-[29px] leading-none text-[#141A39]" style={{ fontFamily: "var(--font-scanner-heading)" }}>
            Escaner Operativo
          </h1>
          <p className="mt-1 text-[13px] text-[#616984]" style={{ fontFamily: "var(--font-scanner-body)" }}>
            {storeName ? `Tienda: ${storeName}` : "Flujo de recepcion por escaneo"}
          </p>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
          <section className="rounded-2xl bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
            <div className="mb-4 rounded-xl border border-[#E3E7F2] bg-[#F8FAFF] p-3">
              <div className="text-[12px] uppercase tracking-wide text-[#5D6786]">Flujo de escaneo</div>
              <div className="mt-2 flex flex-wrap gap-2 text-[12px] text-[#334062]">
                <span className="rounded-full bg-white px-3 py-1 border border-[#D6DDED]">1. Buscar EAN</span>
                <span className="rounded-full bg-white px-3 py-1 border border-[#D6DDED]">2. Revisar alias</span>
                <span className="rounded-full bg-white px-3 py-1 border border-[#D6DDED]">3. Crear o recibir</span>
              </div>
            </div>

            <h2 className="text-[22px] text-[#141a39]" style={{ fontFamily: "var(--font-scanner-heading)" }}>
              7.1 Escaneo Universal
            </h2>
            <p className="mt-1 text-sm text-[#616984]" style={{ fontFamily: "var(--font-scanner-body)" }}>
              Busca por EAN real y si no existe revisa alias.
            </p>

            <div className="mt-4 flex gap-2">
              <input
                value={scanCode}
                onChange={(e) => setScanCode(e.target.value)}
                placeholder="Escanea o escribe codigo EAN"
                className={fieldClass}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleLookup();
                }}
              />
              <button
                onClick={() => void handleLookup()}
                disabled={scanLoading}
                className="h-11 rounded-xl bg-[#0B1230] px-4 text-white disabled:opacity-60"
              >
                {scanLoading ? "Buscando..." : "Escanear"}
              </button>
            </div>

            {scanError ? <p className="mt-3 rounded-lg bg-[#FDECEC] px-3 py-2 text-sm text-[#B42318]">{scanError}</p> : null}

            {scanResult?.found && selectedProduct ? (
              <div className="mt-4 rounded-xl border border-[#DDE3F4] bg-[#F7F9FF] p-4">
                <div className="flex items-center gap-3">
                  <div className="h-16 w-16 overflow-hidden rounded-lg bg-white">
                    {selectedProduct.mainImageUrl ? (
                      <img src={selectedProduct.mainImageUrl} alt={selectedProduct.name || selectedProduct.model} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">Sin foto</div>
                    )}
                  </div>
                  <div>
                    <p className="text-base font-semibold text-[#1A2140]">{selectedProduct.brand} {selectedProduct.model}</p>
                    <p className="text-sm text-gray-600">EAN: {selectedProduct.ean}</p>
                    <p className="text-sm text-gray-600">Via: {scanResult.via === "alias" ? `alias (${scanResult.alias})` : "ean"}</p>
                    <button
                      type="button"
                      className="mt-2 h-8 rounded-full border border-[#CFD5E4] px-3 text-xs text-[#263052] hover:bg-white"
                      onClick={() => router.push(`/store/products/${selectedProduct.id}`)}
                    >
                      Ver ficha producto
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {scanResult && !scanResult.found ? (
              <div className="mt-4 rounded-xl border border-[#F0D5D5] bg-[#FFF7F7] p-4">
                <p className="text-sm text-[#7D1D1D]">No existe el codigo. Puedes crear producto rapido.</p>
                <p className="mt-1 text-sm text-gray-700">EAN interno sugerido: <b>{scanResult.suggestedInternalEan}</b></p>

                <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
                  <input
                    value={quickBrand}
                    onChange={(e) => setQuickBrand(e.target.value)}
                    placeholder="Marca"
                    className={fieldClass}
                  />
                  <input
                    value={quickModel}
                    onChange={(e) => setQuickModel(e.target.value)}
                    placeholder="Modelo"
                    className={fieldClass}
                  />
                  <input
                    value={quickName}
                    onChange={(e) => setQuickName(e.target.value)}
                    placeholder="Nombre (opcional)"
                    className={fieldClass}
                  />
                </div>

                <button
                  onClick={() => void handleCreateProduct()}
                  disabled={quickCreateLoading}
                  className="mt-3 h-10 rounded-xl bg-[#4449CD] px-4 text-white disabled:opacity-60"
                >
                  {quickCreateLoading ? "Creando..." : "Crear producto"}
                </button>
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
            <h2 className="text-[22px] text-[#141a39]" style={{ fontFamily: "var(--font-scanner-heading)" }}>
              8. Recepción en almacén
            </h2>
            <p className="mt-1 text-sm text-[#616984]" style={{ fontFamily: "var(--font-scanner-body)" }}>
              Cuando llega el paquete, primero identificamos el pedido por tracking o referencia. Después revisamos la lista esperada y mandamos lo correcto a inventario.
            </p>

            <div className="mt-4 rounded-xl border border-[#E3E7F2] bg-[#F8FAFF] p-4">
              <div className="text-[12px] uppercase tracking-wide text-[#5D6786]">8.1 Identificar pedido</div>
              <div className="mt-2 flex flex-wrap gap-2 text-[12px] text-[#334062]">
                <span className="rounded-full border border-[#D6DDED] bg-white px-3 py-1">Tracking</span>
                <span className="rounded-full border border-[#D6DDED] bg-white px-3 py-1">Referencia 3PL</span>
                <span className="rounded-full border border-[#D6DDED] bg-white px-3 py-1">PO</span>
              </div>
              <div className="mt-3 flex gap-2">
                <input
                  value={receiveOrderCode}
                  onChange={(e) => setReceiveOrderCode(e.target.value)}
                  placeholder="Ejemplo: tracking, referencia del embarque o PO-260629-SAM"
                  className={fieldClass}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void loadReceiveOrderLookup();
                  }}
                />
                <button
                  onClick={() => void loadReceiveOrderLookup()}
                  disabled={receiveOrderLoading}
                  className="h-11 rounded-xl bg-[#0B1230] px-4 text-white disabled:opacity-60"
                >
                  {receiveOrderLoading ? "Buscando..." : "Identificar"}
                </button>
              </div>

              {receiveOrderError ? <p className="mt-3 rounded-lg bg-[#FDECEC] px-3 py-2 text-sm text-[#B42318]">{receiveOrderError}</p> : null}
              {receiveOrderMessage ? <p className="mt-3 rounded-lg bg-[#ECFDF3] px-3 py-2 text-sm text-[#067647]">{receiveOrderMessage}</p> : null}

              {receiveOrderLookup ? (
                <div className="mt-4 rounded-xl border border-[#DDE3F4] bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[20px] text-[#141A39]" style={{ fontFamily: "var(--font-scanner-heading)" }}>
                        {receiveOrderLookup.purchase.poNumber}
                      </p>
                      <p className="mt-1 text-sm text-[#616984]">
                        Proveedor: <b className="text-[#25304F]">{receiveOrderLookup.purchase.supplier?.name || "-"}</b>
                      </p>
                      <p className="mt-1 text-sm text-[#616984]">
                        Estado actual: <b className="text-[#25304F]">{receiveOrderLookup.purchase.status}</b> · Fecha pedido:{" "}
                        <b className="text-[#25304F]">{formatCompactDate(receiveOrderLookup.purchase.orderedAt)}</b>
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-[12px]">
                      <span className="rounded-full bg-[#EEF4FF] px-3 py-1 text-[#3147D4]">
                        Esperado: {receiveOrderLookup.purchase.summary.totalOrderedUnits}
                      </span>
                      <span className="rounded-full bg-[#FFF7E8] px-3 py-1 text-[#B54708]">
                        Pendiente: {receiveOrderLookup.purchase.summary.totalPendingUnits}
                      </span>
                      <span className="rounded-full bg-[#E9F8EE] px-3 py-1 text-[#1F7A3E]">
                        Recibido: {receiveOrderLookup.purchase.summary.totalReceivedUnits}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-[#E3E7F2] bg-[#F8FAFF] p-3">
                      <div className="text-[12px] uppercase tracking-wide text-[#5D6786]">8.2 Lista esperada</div>
                      <div className="mt-1 text-sm text-[#616984]">
                        Aquí ves exactamente qué debería venir dentro del paquete antes de tocar inventario.
                      </div>
                    </div>
                    <div className="rounded-xl border border-[#E3E7F2] bg-[#F8FAFF] p-3">
                      <div className="text-[12px] uppercase tracking-wide text-[#5D6786]">8.3 Escanear o revisar línea</div>
                      <div className="mt-1 flex gap-2">
                        <input
                          value={receiveOrderScanCode}
                          onChange={(e) => setReceiveOrderScanCode(e.target.value)}
                          placeholder="Escanea EAN o escribe modelo"
                          className={fieldClass}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              assignScannedReceiveLine();
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={assignScannedReceiveLine}
                          className="h-11 rounded-xl border border-[#D4D9E4] bg-white px-4 text-[#25304F] hover:bg-[#F7F9FC]"
                        >
                          Asignar +1
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 overflow-x-auto rounded-xl border border-[#E3E7F2]">
                    <table className="min-w-full border-collapse text-left text-sm">
                      <thead className="bg-[#F7F9FC]">
                        <tr>
                          <th className="px-3 py-3 text-[#5F6780]">Foto</th>
                          <th className="px-3 py-3 text-[#5F6780]">Modelo #</th>
                          <th className="px-3 py-3 text-[#5F6780]">Marca</th>
                          <th className="px-3 py-3 text-[#5F6780]">EAN</th>
                          <th className="px-3 py-3 text-[#5F6780]">Esperado</th>
                          <th className="px-3 py-3 text-[#5F6780]">Recibido</th>
                          <th className="px-3 py-3 text-[#5F6780]">Pendiente</th>
                          <th className="px-3 py-3 text-[#5F6780]">Revisar</th>
                        </tr>
                      </thead>
                      <tbody>
                        {receiveOrderItems.map((item) => {
                          const imageUrl = item.product?.mainImageUrl || null;
                          const modelLabel = item.product?.modelRef || item.product?.model || item.title || "-";
                          const brandLabel = item.product?.brand || "-";
                          const pendingQty = item.pendingQty || 0;
                          return (
                            <tr key={item.id} className="border-t border-[#EEF1F6] bg-white">
                              <td className="px-3 py-3">
                                <div className="h-14 w-14 overflow-hidden rounded-lg border border-[#E5E8F0] bg-[#F7F9FC]">
                                  {imageUrl ? (
                                    <img src={imageUrl} alt={modelLabel} className="h-full w-full object-cover" />
                                  ) : (
                                    <div className="flex h-full w-full items-center justify-center text-[11px] text-[#8A91A8]">Sin foto</div>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-3 font-medium text-[#25304F]">{modelLabel}</td>
                              <td className="px-3 py-3 text-[#25304F]">{brandLabel}</td>
                              <td className="px-3 py-3 text-[#5F6780]">{item.ean || "-"}</td>
                              <td className="px-3 py-3 text-[#25304F]">{item.quantityOrdered}</td>
                              <td className="px-3 py-3 text-[#25304F]">{item.quantityReceived}</td>
                              <td className="px-3 py-3">
                                <span className="inline-flex rounded-full bg-[#FFF7E8] px-3 py-1 text-[12px] text-[#B54708]">
                                  {pendingQty}
                                </span>
                              </td>
                              <td className="px-3 py-3">
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    className="h-9 w-9 rounded-full border border-[#D5DAE5] bg-white text-[#25304F] disabled:opacity-40"
                                    onClick={() => changeReceiveOrderQty(item.id, -1)}
                                    disabled={Number(receiveOrderQtyByItem[item.id] || 0) <= 0}
                                  >
                                    -
                                  </button>
                                  <input
                                    value={receiveOrderQtyByItem[item.id] ?? ""}
                                    placeholder="0"
                                    className="h-10 w-20 rounded-full border border-[#D5DAE5] px-3 text-center text-[14px] text-[#25304F] outline-none"
                                    onChange={(e) => updateReceiveOrderQty(item.id, e.target.value)}
                                  />
                                  <button
                                    type="button"
                                    className="h-9 w-9 rounded-full border border-[#D5DAE5] bg-white text-[#25304F] disabled:opacity-40"
                                    onClick={() => changeReceiveOrderQty(item.id, 1)}
                                    disabled={Number(receiveOrderQtyByItem[item.id] || 0) >= pendingQty}
                                  >
                                    +
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E3E7F2] bg-[#F8FAFF] p-3">
                    <div className="text-sm text-[#616984]">
                      Preparado para inventario:{" "}
                      <b className="text-[#25304F]">{receiveOrderSelectedUnits}</b> · Pendiente real:{" "}
                      <b className="text-[#25304F]">{receiveOrderLookup.purchase.summary.totalPendingUnits}</b>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="h-10 rounded-xl border border-[#D4D9E4] bg-white px-4 text-[#25304F] hover:bg-[#F7F9FC] disabled:opacity-50"
                        onClick={() => void submitReceiveOrder(false)}
                        disabled={receiveOrderAction === "receive_selected_lookup" || receiveOrderSelectedUnits <= 0}
                      >
                        {receiveOrderAction === "receive_selected_lookup" ? "Enviando..." : "Mandar lo correcto a inventario"}
                      </button>
                      <button
                        type="button"
                        className="h-10 rounded-xl bg-[#0B1230] px-4 text-white disabled:opacity-50"
                        onClick={() => void submitReceiveOrder(true)}
                        disabled={receiveOrderAction === "receive_all_lookup" || receiveOrderLookup.purchase.summary.totalPendingUnits <= 0}
                      >
                        {receiveOrderAction === "receive_all_lookup" ? "..." : "Recibir todo pendiente"}
                      </button>
                      <button
                        type="button"
                        className="h-10 rounded-xl border border-[#D4D9E4] bg-white px-4 text-[#25304F] hover:bg-[#F7F9FC]"
                        onClick={() => router.push(`/store/purchases/${receiveOrderLookup.purchase.id}`)}
                      >
                        Ver pedido completo
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-5 rounded-xl border border-dashed border-[#DDE3F4] bg-[#FAFBFE] p-4">
              <div className="text-[12px] uppercase tracking-wide text-[#5D6786]">Entrada rápida sin PO</div>
              <p className="mt-1 text-sm text-[#616984]">
                Este bloque sigue disponible para recepciones rápidas que no dependen de un pedido identificado.
              </p>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <select
                className={fieldClass}
                value={warehouseId}
                onChange={(e) => pickWarehouse(e.target.value)}
              >
                <option value="">Seleccionar almacen</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.code} - {w.name}</option>
                ))}
              </select>

              <select
                className={fieldClass}
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
              >
                <option value="">Sin ubicacion</option>
                {(selectedWarehouse?.locations || []).map((loc) => (
                  <option key={loc.id} value={loc.id}>{loc.code}{loc.name ? ` - ${loc.name}` : ""}</option>
                ))}
              </select>

              <input
                type="number"
                min={1}
                value={receiveQty}
                onChange={(e) => setReceiveQty(Number(e.target.value) || 1)}
                className={fieldClass}
                placeholder="Cantidad"
              />

              <input
                type="number"
                min={0.0001}
                step="0.0001"
                value={unitCostOriginal}
                onChange={(e) => setUnitCostOriginal(Number(e.target.value) || 0)}
                className={fieldClass}
                placeholder="Costo unitario"
              />

              <input
                value={currencyCode}
                onChange={(e) => setCurrencyCode(e.target.value.toUpperCase())}
                className={fieldClass}
                placeholder="Moneda (EUR, USD...)"
              />

              <input
                type="number"
                min={0.000001}
                step="0.000001"
                value={fxToEur}
                onChange={(e) => setFxToEur(Number(e.target.value) || 1)}
                className={fieldClass}
                placeholder="FX a EUR"
              />
            </div>

            <input
              value={receiveNote}
              onChange={(e) => setReceiveNote(e.target.value)}
              className={`mt-3 ${fieldClass}`}
              placeholder="Nota"
            />

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setIncidenceReason("faltante");
                  setReceiveMessage("Incidencia marcada: faltante");
                }}
                className="h-10 rounded-lg border border-[#E7B4B4] bg-[#FFF4F4] px-3 text-sm text-[#8A2A2A]"
              >
                Incidencia: faltante
              </button>
              <button
                type="button"
                onClick={() => {
                  setIncidenceReason("roto");
                  setReceiveMessage("Incidencia marcada: roto");
                }}
                className="h-10 rounded-lg border border-[#E7B4B4] bg-[#FFF4F4] px-3 text-sm text-[#8A2A2A]"
              >
                Incidencia: roto
              </button>
              <button
                type="button"
                onClick={() => {
                  setIncidenceReason("dañado");
                  setReceiveMessage("Incidencia marcada: dañado");
                }}
                className="h-10 rounded-lg border border-[#E7B4B4] bg-[#FFF4F4] px-3 text-sm text-[#8A2A2A]"
              >
                Incidencia: dañado
              </button>
            </div>

            {incidenceReason ? <p className="mt-2 text-sm text-[#8A2A2A]">Ultima incidencia: {incidenceReason}</p> : null}

            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="text-[12px] text-[#5F6782]">
                {selectedWarehouse ? `Almacen: ${selectedWarehouse.code}` : "Selecciona almacen para confirmar"}
              </div>
              <button
                onClick={() => void handleReceive()}
                disabled={receiveLoading}
                className="h-11 rounded-xl bg-[#0B1230] px-4 text-white disabled:opacity-60"
              >
                {receiveLoading ? "Confirmando..." : "Confirmar Todo OK"}
              </button>
            </div>

            {receiveError ? <p className="mt-3 rounded-lg bg-[#FDECEC] px-3 py-2 text-sm text-[#B42318]">{receiveError}</p> : null}
            {receiveMessage ? <p className="mt-3 rounded-lg bg-[#ECFDF3] px-3 py-2 text-sm text-[#067647]">{receiveMessage}</p> : null}
          </section>
        </div>
      </div>
    </div>
  );
}
