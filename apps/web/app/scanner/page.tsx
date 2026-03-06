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

  const [incidenceReason, setIncidenceReason] = useState("");

  const selectedWarehouse = useMemo(
    () => warehouses.find((w) => w.id === warehouseId) || null,
    [warehouses, warehouseId]
  );

  const selectedProduct = scanResult?.found ? scanResult.product || null : null;
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
              7.2 Entradas (Recepcion)
            </h2>
            <p className="mt-1 text-sm text-[#616984]" style={{ fontFamily: "var(--font-scanner-body)" }}>
              Selecciona almacen/ubicacion, confirma y crea lote + movimiento.
            </p>

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
