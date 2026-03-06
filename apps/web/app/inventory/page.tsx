"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import localFont from "next/font/local";
import { handleUnauthorized, requireTokenOrRedirect } from "../lib/auth";

type Warehouse = {
  id: string;
  code: string;
  name: string;
  isDefault: boolean;
  locations?: { id: string; code: string; name?: string | null }[];
};

type InventoryItem = {
  id: string;
  type: string;
  category?: string | null;
  brand: string;
  model: string;
  name: string;
  ean: string;
  status: string;
  imageUrl: string | null;
  stockSelectedWarehouse: number;
  stockTotalStore: number;
  inTransitQty?: number;
  stockByWarehouse: {
    warehouseId: string;
    warehouseCode: string;
    warehouseName: string;
    qty: number;
    locations?: { locationId: string; code: string; name: string | null; qty: number }[];
  }[];
  availableElsewhere: {
    warehouseId: string;
    warehouseCode: string;
    warehouseName: string;
    qty: number;
  }[];
};

type InventoryMovement = {
  id: string;
  movementType: string;
  quantity: number;
  reason: string | null;
  createdAt: string;
  product: { id: string; ean: string; brand: string; model: string; name: string };
  warehouse: { id: string; code: string; name: string };
  location: { id: string; code: string; name: string | null } | null;
  createdBy: { id: string; fullName: string | null; email: string | null } | null;
};

type TransferRow = {
  id: string;
  productId: string;
  product: { id: string; ean: string; brand: string; model: string; name: string };
  fromWarehouseId: string | null;
  fromWarehouseCode: string | null;
  toWarehouseId: string | null;
  toWarehouseCode: string | null;
  qtyOut: number;
  qtyIn: number;
  pendingQty: number;
  transferCostEur: number;
  status: "in_transit" | "confirmed";
  createdAt: string;
  updatedAt: string;
};

const API_BASE = "http://localhost:3001";
const headingFont = localFont({
  src: "../fonts/HFHySans_Black.ttf",
  variable: "--font-inventory-heading",
});
const bodyFont = localFont({
  src: "../fonts/HFHySans_Regular.ttf",
  variable: "--font-inventory-body",
});

export default function InventoryPage() {
  const router = useRouter();
  const [storeName, setStoreName] = useState("");
  const [storeId, setStoreId] = useState("");
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("");
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [query, setQuery] = useState("");
  const [withImages, setWithImages] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [filterBrand, setFilterBrand] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterStock, setFilterStock] = useState<"all" | "zero" | "low" | "in_transit" | "elsewhere">("all");

  const [showAdjustPanel, setShowAdjustPanel] = useState(false);
  const [adjustProductId, setAdjustProductId] = useState("");
  const [adjustWarehouseId, setAdjustWarehouseId] = useState("");
  const [adjustDelta, setAdjustDelta] = useState("");
  const [adjustReason, setAdjustReason] = useState("Ajuste manual");
  const [adjustLoading, setAdjustLoading] = useState(false);
  const [adjustMessage, setAdjustMessage] = useState("");

  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [movementsLoading, setMovementsLoading] = useState(false);

  const [transferProductId, setTransferProductId] = useState("");
  const [transferFromWarehouseId, setTransferFromWarehouseId] = useState("");
  const [transferToWarehouseId, setTransferToWarehouseId] = useState("");
  const [transferQty, setTransferQty] = useState("1");
  const [transferNote, setTransferNote] = useState("Transferencia entre almacenes");
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferMessage, setTransferMessage] = useState("");
  const [transferConfirmLoadingId, setTransferConfirmLoadingId] = useState("");
  const [transferCostConfirm, setTransferCostConfirm] = useState<Record<string, string>>({});
  const [transferConfirmQty, setTransferConfirmQty] = useState<Record<string, string>>({});
  const [transfers, setTransfers] = useState<TransferRow[]>([]);

  const selectedWarehouse = useMemo(
    () => warehouses.find((w) => w.id === selectedWarehouseId) || null,
    [warehouses, selectedWarehouseId]
  );

  const brandOptions = useMemo(() => {
    return ["all", ...Array.from(new Set(items.map((it) => String(it.brand || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b))];
  }, [items]);

  const typeOptions = useMemo(() => {
    return ["all", ...Array.from(new Set(items.map((it) => String(it.type || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b))];
  }, [items]);

  const categoryOptions = useMemo(() => {
    return ["all", ...Array.from(new Set(items.map((it) => String(it.category || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b))];
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (filterBrand !== "all" && item.brand !== filterBrand) return false;
      if (filterType !== "all" && item.type !== filterType) return false;
      if (filterCategory !== "all" && String(item.category || "") !== filterCategory) return false;

      if (filterStock === "zero" && item.stockSelectedWarehouse !== 0) return false;
      if (filterStock === "low" && !(item.stockSelectedWarehouse > 0 && item.stockSelectedWarehouse <= 2)) return false;
      if (filterStock === "in_transit" && Number(item.inTransitQty || 0) <= 0) return false;
      if (filterStock === "elsewhere" && item.availableElsewhere.length === 0) return false;

      return true;
    });
  }, [items, filterBrand, filterType, filterCategory, filterStock]);

  const summary = useMemo(() => {
    const totalProducts = filteredItems.length;
    const totalStockSelected = filteredItems.reduce((acc, item) => acc + Number(item.stockSelectedWarehouse || 0), 0);
    const withExternalStock = filteredItems.filter((item) => item.stockSelectedWarehouse === 0 && item.availableElsewhere.length > 0).length;
    const lowStock = filteredItems.filter((item) => item.stockSelectedWarehouse > 0 && item.stockSelectedWarehouse <= 2).length;
    const inTransit = filteredItems.reduce((acc, it) => acc + Number(it.inTransitQty || 0), 0);
    return { totalProducts, totalStockSelected, withExternalStock, lowStock, inTransit };
  }, [filteredItems]);

  function statusClass(status: string) {
    const normalized = String(status || "").toLowerCase();
    if (normalized.includes("active") || normalized.includes("activo")) return "bg-[#E9F8EE] text-[#1F7A3E]";
    if (normalized.includes("archiv")) return "bg-[#F3F4F6] text-[#4B5563]";
    if (normalized.includes("inactivo") || normalized.includes("inactive")) return "bg-[#FCEBEC] text-[#B42318]";
    return "bg-[#EEF2FF] text-[#3730A3]";
  }

  const loadInventory = useCallback(
    async (token: string, currentStoreId: string, warehouseId: string, q: string, showImages: boolean) => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          storeId: currentStoreId,
          warehouseId,
          q,
          withImages: showImages ? "1" : "0",
        });
        const res = await fetch(`${API_BASE}/inventory?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (handleUnauthorized(res.status)) return;
        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "Error cargando inventario");
          setItems([]);
          return;
        }

        setItems(Array.isArray(data.items) ? data.items : []);
      } catch {
        setError("Error de conexion con API");
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const loadMovements = useCallback(async (token: string, currentStoreId: string, warehouseId: string) => {
    setMovementsLoading(true);
    try {
      const params = new URLSearchParams({ storeId: currentStoreId, limit: "120", ...(warehouseId ? { warehouseId } : {}) });
      const res = await fetch(`${API_BASE}/inventory/movements?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (handleUnauthorized(res.status)) return;
      const data = await res.json();
      if (!res.ok) return;
      setMovements(Array.isArray(data.movements) ? data.movements : []);
    } finally {
      setMovementsLoading(false);
    }
  }, []);

  const loadTransfers = useCallback(async (token: string, currentStoreId: string) => {
    try {
      const params = new URLSearchParams({ storeId: currentStoreId });
      const res = await fetch(`${API_BASE}/inventory/transfers?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (handleUnauthorized(res.status)) return;
      const data = await res.json();
      if (!res.ok) return;
      setTransfers(Array.isArray(data.transfers) ? data.transfers : []);
    } catch {
      // no-op
    }
  }, []);

  const refreshAll = useCallback(
    async (token: string, currentStoreId: string, warehouseId: string, q: string, showImages: boolean) => {
      await Promise.all([
        loadInventory(token, currentStoreId, warehouseId, q, showImages),
        loadMovements(token, currentStoreId, warehouseId),
        loadTransfers(token, currentStoreId),
      ]);
    },
    [loadInventory, loadMovements, loadTransfers]
  );

  useEffect(() => {
    const token = requireTokenOrRedirect();
    if (!token) return;

    const selectedStoreId = localStorage.getItem("selectedStoreId");
    if (!selectedStoreId) {
      router.push("/select-store");
      return;
    }
    setStoreId(selectedStoreId);

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/stores/${selectedStoreId}/bootstrap`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (handleUnauthorized(res.status)) return;
        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "No se pudo cargar tienda");
          setLoading(false);
          return;
        }

        setStoreName(data?.store?.name || "");
        const warehouseRows = Array.isArray(data.warehouses) ? (data.warehouses as Warehouse[]) : [];
        setWarehouses(warehouseRows);

        const defaultWh = warehouseRows.find((w) => w.isDefault) || warehouseRows[0];
        if (!defaultWh) {
          setError("No hay almacenes activos configurados");
          setLoading(false);
          return;
        }

        setSelectedWarehouseId(defaultWh.id);
        setAdjustWarehouseId(defaultWh.id);
        setTransferFromWarehouseId(defaultWh.id);

        const nextTo = (warehouseRows.find((w) => w.id !== defaultWh.id) || defaultWh).id;
        setTransferToWarehouseId(nextTo);

        await refreshAll(token, selectedStoreId, defaultWh.id, "", false);
      } catch {
        setError("Error de conexion con API");
        setLoading(false);
      }
    })();
  }, [refreshAll, router]);

  async function runSearch(nextQuery: string = query) {
    const token = requireTokenOrRedirect();
    if (!token) return;
    if (!storeId || !selectedWarehouseId) return;
    await refreshAll(token, storeId, selectedWarehouseId, nextQuery, withImages);
  }

  async function onWarehouseChange(nextWarehouseId: string) {
    setSelectedWarehouseId(nextWarehouseId);
    const token = requireTokenOrRedirect();
    if (!token || !storeId) return;
    await refreshAll(token, storeId, nextWarehouseId, query, withImages);
  }

  async function onToggleImages() {
    const next = !withImages;
    setWithImages(next);
    const token = requireTokenOrRedirect();
    if (!token || !storeId || !selectedWarehouseId) return;
    await refreshAll(token, storeId, selectedWarehouseId, query, next);
  }

  async function submitAdjustment(e: React.FormEvent) {
    e.preventDefault();
    const token = requireTokenOrRedirect();
    if (!token || !storeId || !adjustProductId || !adjustWarehouseId || !adjustDelta.trim()) return;

    const delta = Number(adjustDelta);
    if (!Number.isInteger(delta) || delta === 0) {
      setError("El ajuste debe ser entero y distinto de 0");
      return;
    }

    setAdjustLoading(true);
    setAdjustMessage("");
    try {
      const res = await fetch(`${API_BASE}/inventory/adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          storeId,
          productId: adjustProductId,
          warehouseId: adjustWarehouseId,
          quantityDelta: delta,
          reason: adjustReason || "Ajuste manual",
        }),
      });
      if (handleUnauthorized(res.status)) return;
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo aplicar ajuste");
        return;
      }
      setAdjustMessage("Ajuste aplicado correctamente");
      setAdjustDelta("");
      await refreshAll(token, storeId, selectedWarehouseId, query, withImages);
    } finally {
      setAdjustLoading(false);
    }
  }

  async function createTransfer(e: React.FormEvent) {
    e.preventDefault();
    const token = requireTokenOrRedirect();
    if (!token || !storeId) return;

    const qty = Number(transferQty);
    if (!transferProductId || !transferFromWarehouseId || !transferToWarehouseId || !Number.isInteger(qty) || qty <= 0) {
      setError("Completa producto, almacenes y cantidad para transferir");
      return;
    }

    setTransferLoading(true);
    setTransferMessage("");
    try {
      const res = await fetch(`${API_BASE}/inventory/transfers`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          storeId,
          productId: transferProductId,
          fromWarehouseId: transferFromWarehouseId,
          toWarehouseId: transferToWarehouseId,
          quantity: qty,
          note: transferNote || "Transferencia entre almacenes",
        }),
      });
      if (handleUnauthorized(res.status)) return;
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo crear transferencia");
        return;
      }
      setTransferMessage(`Transferencia creada: ${data.transfer?.id || "OK"}`);
      await refreshAll(token, storeId, selectedWarehouseId, query, withImages);
    } finally {
      setTransferLoading(false);
    }
  }

  async function confirmTransfer(transfer: TransferRow) {
    const token = requireTokenOrRedirect();
    if (!token || !storeId) return;

    const requestedQty = Number(transferConfirmQty[transfer.id] || transfer.pendingQty);
    if (!Number.isInteger(requestedQty) || requestedQty <= 0) {
      setError("Cantidad de confirmacion invalida");
      return;
    }

    setTransferConfirmLoadingId(transfer.id);
    setTransferMessage("");
    try {
      const res = await fetch(`${API_BASE}/inventory/transfers/${transfer.id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          storeId,
          toWarehouseId: transfer.toWarehouseId,
          quantity: requestedQty,
          transferCostEur: Number(transferCostConfirm[transfer.id] || 0),
          note: "Confirmación recepción transferencia",
        }),
      });
      if (handleUnauthorized(res.status)) return;
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo confirmar recepción");
        return;
      }
      setTransferMessage(`Recepción confirmada (${requestedQty})`);
      await refreshAll(token, storeId, selectedWarehouseId, query, withImages);
    } finally {
      setTransferConfirmLoadingId("");
    }
  }

  return (
    <div className={`${headingFont.variable} ${bodyFont.variable} min-h-screen bg-[#E8EAEC] p-6`}>
      <div className="mx-auto max-w-7xl">
        <div className="mb-2">
          <h1 className="text-[29px] leading-none text-[#141A39]" style={{ fontFamily: "var(--font-inventory-heading)" }}>
            Inventario Operativo
          </h1>
          <p className="mt-1 text-[13px] text-[#616984]" style={{ fontFamily: "var(--font-inventory-body)" }}>
            {storeName ? `Tienda: ${storeName}` : "Control de stock, movimientos y transferencias"}
          </p>
        </div>

        {error ? <div className="mt-3 rounded-xl bg-[#FDECEC] p-3 text-[13px] text-[#B42318]">{error}</div> : null}
        {adjustMessage ? <div className="mt-3 rounded-xl bg-[#ECFDF3] p-3 text-[13px] text-[#067647]">{adjustMessage}</div> : null}
        {transferMessage ? <div className="mt-3 rounded-xl bg-[#ECFDF3] p-3 text-[13px] text-[#067647]">{transferMessage}</div> : null}

        <div className="mt-4 rounded-2xl bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[20px] font-semibold text-[#131936]">2.1 Vista General</div>
              <div className="text-[13px] text-[#5B637D]">
                {selectedWarehouse ? `Almacén seleccionado: ${selectedWarehouse.name} (${selectedWarehouse.code})` : "Selecciona un almacén"}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className={`h-10 rounded-full border px-4 text-[13px] ${
                  withImages ? "border-[#0B1230] bg-[#0B1230] text-white" : "border-[#D4D9E4] bg-white text-[#1D2647] hover:bg-[#F7F9FC]"
                }`}
                onClick={onToggleImages}
              >
                {withImages ? "👁 Ocultar imagen" : "👁 Mostrar imagen"}
              </button>
              <button
                className="h-10 rounded-full border border-[#D4D9E4] bg-white px-4 text-[13px] text-[#1D2647] hover:bg-[#F7F9FC]"
                onClick={() => router.push("/store/products")}
              >
                Añadir producto
              </button>
              <button
                className={`h-10 rounded-full border px-4 text-[13px] ${showAdjustPanel ? "border-[#0B1230] bg-[#0B1230] text-white" : "border-[#D4D9E4] bg-white text-[#1D2647] hover:bg-[#F7F9FC]"}`}
                onClick={() => setShowAdjustPanel((v) => !v)}
              >
                Ajuste de inventario
              </button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[220px_1fr_auto]">
            <select
              className="h-11 rounded-xl border border-[#D4D9E4] bg-white px-3 text-[14px] text-[#25304F]"
              value={selectedWarehouseId}
              onChange={(e) => onWarehouseChange(e.target.value)}
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.code})
                </option>
              ))}
            </select>

            <form
              className="flex gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                await runSearch();
              }}
            >
              <input
                className="h-11 w-full rounded-xl border border-[#D4D9E4] px-3 text-[14px] text-[#25304F] placeholder:text-[#8A91A8]"
                placeholder="Buscar por EAN / Modelo / Marca"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button className="h-11 rounded-xl border border-[#D4D9E4] px-4 text-[14px] text-[#1D2647] hover:bg-[#F7F9FC]" type="submit">
                Buscar
              </button>
            </form>

            <button
              className="h-11 rounded-xl border border-[#D4D9E4] px-4 text-[14px] text-[#1D2647] hover:bg-[#F7F9FC]"
              onClick={() => router.push("/store/products")}
            >
              Productos
            </button>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <select className="h-10 rounded-xl border border-[#D4D9E4] px-3 text-[13px] text-[#25304F]" value={filterBrand} onChange={(e) => setFilterBrand(e.target.value)}>
              {brandOptions.map((b) => <option key={b} value={b}>{b === "all" ? "Marca: todas" : b}</option>)}
            </select>
            <select className="h-10 rounded-xl border border-[#D4D9E4] px-3 text-[13px] text-[#25304F]" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              {typeOptions.map((t) => <option key={t} value={t}>{t === "all" ? "Tipo: todos" : t}</option>)}
            </select>
            <select className="h-10 rounded-xl border border-[#D4D9E4] px-3 text-[13px] text-[#25304F]" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
              {categoryOptions.map((c) => <option key={c} value={c}>{c === "all" ? "Categoría: todas" : c}</option>)}
            </select>
            <select className="h-10 rounded-xl border border-[#D4D9E4] px-3 text-[13px] text-[#25304F]" value={filterStock} onChange={(e) => setFilterStock(e.target.value as typeof filterStock)}>
              <option value="all">Stock: todos</option>
              <option value="zero">Stock 0</option>
              <option value="low">Bajo stock</option>
              <option value="in_transit">En tránsito</option>
              <option value="elsewhere">Disponible en otro almacén</option>
            </select>
          </div>

          {showAdjustPanel ? (
            <form className="mt-4 rounded-xl border border-[#D6DDED] bg-[#F8FAFF] p-4" onSubmit={submitAdjustment}>
              <div className="mb-2 text-[14px] font-semibold text-[#1D2647]">Ajuste manual de inventario</div>
              <div className="grid gap-2 md:grid-cols-4">
                <select className="h-10 rounded-xl border border-[#D4D9E4] px-3 text-[13px] text-[#25304F]" value={adjustProductId} onChange={(e) => setAdjustProductId(e.target.value)} required>
                  <option value="">Producto</option>
                  {items.map((it) => (
                    <option key={it.id} value={it.id}>{it.brand} {it.model} · {it.ean}</option>
                  ))}
                </select>
                <select className="h-10 rounded-xl border border-[#D4D9E4] px-3 text-[13px] text-[#25304F]" value={adjustWarehouseId} onChange={(e) => setAdjustWarehouseId(e.target.value)} required>
                  <option value="">Almacén</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>{w.code}</option>
                  ))}
                </select>
                <input
                  className="h-10 rounded-xl border border-[#D4D9E4] px-3 text-[13px] text-[#25304F]"
                  placeholder="Cantidad (+/-)"
                  value={adjustDelta}
                  onChange={(e) => setAdjustDelta(e.target.value)}
                  required
                />
                <button className="h-10 rounded-xl bg-[#0B1230] px-4 text-[13px] text-white disabled:opacity-60" disabled={adjustLoading} type="submit">
                  {adjustLoading ? "Aplicando..." : "Aplicar ajuste"}
                </button>
              </div>
              <input className="mt-2 h-10 w-full rounded-xl border border-[#D4D9E4] px-3 text-[13px] text-[#25304F]" value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} placeholder="Motivo" />
            </form>
          ) : null}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-5">
          <div className="rounded-2xl bg-white p-4 shadow-[0_8px_20px_rgba(0,0,0,0.06)]"><div className="text-[12px] uppercase text-[#7B839C]">Productos</div><div className="mt-1 text-[24px] font-semibold text-[#131936]">{summary.totalProducts}</div></div>
          <div className="rounded-2xl bg-white p-4 shadow-[0_8px_20px_rgba(0,0,0,0.06)]"><div className="text-[12px] uppercase text-[#7B839C]">Stock almacén</div><div className="mt-1 text-[24px] font-semibold text-[#131936]">{summary.totalStockSelected}</div></div>
          <div className="rounded-2xl bg-white p-4 shadow-[0_8px_20px_rgba(0,0,0,0.06)]"><div className="text-[12px] uppercase text-[#7B839C]">Bajo stock</div><div className="mt-1 text-[24px] font-semibold text-[#131936]">{summary.lowStock}</div></div>
          <div className="rounded-2xl bg-white p-4 shadow-[0_8px_20px_rgba(0,0,0,0.06)]"><div className="text-[12px] uppercase text-[#7B839C]">Otro almacén</div><div className="mt-1 text-[24px] font-semibold text-[#131936]">{summary.withExternalStock}</div></div>
          <div className="rounded-2xl bg-white p-4 shadow-[0_8px_20px_rgba(0,0,0,0.06)]"><div className="text-[12px] uppercase text-[#7B839C]">En tránsito</div><div className="mt-1 text-[24px] font-semibold text-[#131936]">{summary.inTransit}</div></div>
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl bg-white shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b bg-[#F5F7FB] text-[#2E3754]">
                <tr>
                  {withImages ? <th className="px-3 py-3 text-left">Foto</th> : null}
                  <th className="px-3 py-3 text-left">Tipo</th>
                  <th className="px-3 py-3 text-left">Marca</th>
                  <th className="px-3 py-3 text-left">Modelo</th>
                  <th className="px-3 py-3 text-left">Categoría</th>
                  <th className="px-3 py-3 text-left">EAN</th>
                  <th className="px-3 py-3 text-left">Stock</th>
                  <th className="px-3 py-3 text-left">Ubicación física</th>
                  <th className="px-3 py-3 text-left">Indicadores</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td className="px-3 py-5 text-[#6E768E]" colSpan={withImages ? 9 : 8}>Cargando inventario...</td></tr>
                ) : filteredItems.length === 0 ? (
                  <tr><td className="px-3 py-5 text-[#6E768E]" colSpan={withImages ? 9 : 8}>Sin resultados para este almacén.</td></tr>
                ) : (
                  filteredItems.map((item) => {
                    const whRow = item.stockByWarehouse.find((w) => w.warehouseId === selectedWarehouseId);
                    return (
                      <tr key={item.id} className="border-b border-[#EEF1F6] last:border-b-0">
                        {withImages ? (
                          <td className="px-3 py-2">
                            {item.imageUrl ? (
                              <Image src={item.imageUrl} alt={item.name} width={56} height={56} className="h-14 w-14 rounded-xl border border-[#E4E8F1] object-cover" />
                            ) : (
                              <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-[#E4E8F1] bg-[#F7F8FB] text-xs text-[#7B839C]">Sin foto</div>
                            )}
                          </td>
                        ) : null}
                        <td className="px-3 py-2 text-[#212A45]">{item.type || "-"}</td>
                        <td className="px-3 py-2 text-[#212A45]">{item.brand || "-"}</td>
                        <td className="px-3 py-2 font-medium text-[#131936]">{item.model || "-"}</td>
                        <td className="px-3 py-2 text-[#212A45]">{item.category || "-"}</td>
                        <td className="px-3 py-2 font-mono text-[12px] text-[#3C4562]">{item.ean || "-"}</td>
                        <td className="px-3 py-2"><span className="inline-flex min-w-[34px] items-center justify-center rounded-full bg-[#EEF2FF] px-2 py-1 text-[12px] font-semibold text-[#3730A3]">{item.stockSelectedWarehouse}</span></td>
                        <td className="px-3 py-2 text-xs text-[#5E6680]">
                          {whRow?.locations && whRow.locations.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {whRow.locations.map((loc) => (
                                <span key={loc.locationId} className="rounded-full bg-[#F2F4F8] px-2 py-1 text-[11px]">{selectedWarehouse?.code} &gt; {loc.code} ({loc.qty})</span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[#8A91A8]">Sin ubicación detallada</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-[#5E6680]">
                          <div className="flex flex-wrap gap-1.5">
                            <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-medium ${statusClass(item.status)}`}>{item.status}</span>
                            {item.stockSelectedWarehouse === 0 ? <span className="rounded-full bg-[#FDECEC] px-2 py-1 text-[11px] text-[#B42318]">Stock 0</span> : null}
                            {item.availableElsewhere.length > 0 ? <span className="rounded-full bg-[#F2F4F8] px-2 py-1 text-[11px]">Disponible en otro almacén</span> : null}
                            {item.stockSelectedWarehouse > 0 && item.stockSelectedWarehouse <= 2 ? <span className="rounded-full bg-[#FFF3E8] px-2 py-1 text-[11px] text-[#A15C07]">Bajo stock</span> : null}
                            {Number(item.inTransitQty || 0) > 0 ? <span className="rounded-full bg-[#EEF2FF] px-2 py-1 text-[11px] text-[#3730A3]">En tránsito ({item.inTransitQty})</span> : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <section className="rounded-2xl bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
            <h2 className="text-[22px] text-[#141a39]" style={{ fontFamily: "var(--font-inventory-heading)" }}>2.3 Movimientos</h2>
            <p className="mt-1 text-sm text-[#616984]" style={{ fontFamily: "var(--font-inventory-body)" }}>Entradas, salidas y ajustes con usuario, fecha y hora.</p>
            <div className="mt-3 max-h-[340px] overflow-auto rounded-xl border border-[#E4E8F1]">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-[#F5F7FB] border-b text-[#2E3754]">
                  <tr>
                    <th className="px-3 py-2 text-left">Fecha</th>
                    <th className="px-3 py-2 text-left">Producto</th>
                    <th className="px-3 py-2 text-left">Tipo</th>
                    <th className="px-3 py-2 text-left">Cantidad</th>
                    <th className="px-3 py-2 text-left">Usuario</th>
                  </tr>
                </thead>
                <tbody>
                  {movementsLoading ? (
                    <tr><td className="px-3 py-3 text-[#6E768E]" colSpan={5}>Cargando movimientos...</td></tr>
                  ) : movements.length === 0 ? (
                    <tr><td className="px-3 py-3 text-[#6E768E]" colSpan={5}>Sin movimientos.</td></tr>
                  ) : (
                    movements.map((mv) => (
                      <tr key={mv.id} className="border-b border-[#EEF1F6]">
                        <td className="px-3 py-2 text-[#4F5568]">{new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(mv.createdAt))}</td>
                        <td className="px-3 py-2 text-[#1D2647]">{mv.product.brand} {mv.product.model}</td>
                        <td className="px-3 py-2 text-[#1D2647]">{mv.movementType}</td>
                        <td className="px-3 py-2 text-[#1D2647]">{mv.quantity}</td>
                        <td className="px-3 py-2 text-[#4F5568]">{mv.createdBy?.fullName || mv.createdBy?.email || "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
            <h2 className="text-[22px] text-[#141a39]" style={{ fontFamily: "var(--font-inventory-heading)" }}>2.4 Transferencias entre almacenes</h2>
            <p className="mt-1 text-sm text-[#616984]" style={{ fontFamily: "var(--font-inventory-body)" }}>Enviar stock IT → ES, registrar coste y confirmar recepción.</p>

            <form className="mt-3 grid gap-2 md:grid-cols-2" onSubmit={createTransfer}>
              <select className="h-10 rounded-xl border border-[#D4D9E4] px-3 text-[13px] text-[#25304F]" value={transferProductId} onChange={(e) => setTransferProductId(e.target.value)} required>
                <option value="">Producto</option>
                {items.map((it) => (
                  <option key={it.id} value={it.id}>{it.brand} {it.model} · {it.ean}</option>
                ))}
              </select>
              <input className="h-10 rounded-xl border border-[#D4D9E4] px-3 text-[13px] text-[#25304F]" value={transferQty} onChange={(e) => setTransferQty(e.target.value)} placeholder="Cantidad" required />
              <select className="h-10 rounded-xl border border-[#D4D9E4] px-3 text-[13px] text-[#25304F]" value={transferFromWarehouseId} onChange={(e) => setTransferFromWarehouseId(e.target.value)} required>
                <option value="">Desde almacén</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.code}</option>)}
              </select>
              <select className="h-10 rounded-xl border border-[#D4D9E4] px-3 text-[13px] text-[#25304F]" value={transferToWarehouseId} onChange={(e) => setTransferToWarehouseId(e.target.value)} required>
                <option value="">Hacia almacén</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.code}</option>)}
              </select>
              <input className="h-10 rounded-xl border border-[#D4D9E4] px-3 text-[13px] text-[#25304F] md:col-span-2" value={transferNote} onChange={(e) => setTransferNote(e.target.value)} placeholder="Nota transferencia" />
              <button className="h-10 rounded-xl bg-[#0B1230] px-4 text-[13px] text-white disabled:opacity-60 md:col-span-2" disabled={transferLoading} type="submit">
                {transferLoading ? "Creando transferencia..." : "Crear transferencia"}
              </button>
            </form>

            <div className="mt-4 max-h-[320px] overflow-auto rounded-xl border border-[#E4E8F1]">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-[#F5F7FB] border-b text-[#2E3754]">
                  <tr>
                    <th className="px-3 py-2 text-left">Transferencia</th>
                    <th className="px-3 py-2 text-left">Ruta</th>
                    <th className="px-3 py-2 text-left">Pendiente</th>
                    <th className="px-3 py-2 text-left">Confirmación recepción</th>
                  </tr>
                </thead>
                <tbody>
                  {transfers.length === 0 ? (
                    <tr><td className="px-3 py-3 text-[#6E768E]" colSpan={4}>Sin transferencias.</td></tr>
                  ) : (
                    transfers.map((t) => (
                      <tr key={t.id} className="border-b border-[#EEF1F6]">
                        <td className="px-3 py-2 text-[#1D2647]">
                          <div className="font-medium">{t.id}</div>
                          <div className="text-[12px] text-[#66708B]">{t.product?.brand} {t.product?.model}</div>
                        </td>
                        <td className="px-3 py-2 text-[#1D2647]">{t.fromWarehouseCode || "-"} → {t.toWarehouseCode || "-"}</td>
                        <td className="px-3 py-2 text-[#1D2647]">{t.pendingQty}</td>
                        <td className="px-3 py-2">
                          {t.status === "confirmed" ? (
                            <span className="rounded-full bg-[#E9F8EE] px-2 py-1 text-[11px] text-[#1F7A3E]">Confirmado</span>
                          ) : (
                            <div className="flex flex-wrap items-center gap-2">
                              <input
                                className="h-8 w-[80px] rounded-lg border border-[#D4D9E4] px-2 text-[12px]"
                                value={transferConfirmQty[t.id] ?? String(t.pendingQty)}
                                onChange={(e) => setTransferConfirmQty((prev) => ({ ...prev, [t.id]: e.target.value }))}
                                placeholder="Qty"
                              />
                              <input
                                className="h-8 w-[92px] rounded-lg border border-[#D4D9E4] px-2 text-[12px]"
                                value={transferCostConfirm[t.id] ?? "0"}
                                onChange={(e) => setTransferCostConfirm((prev) => ({ ...prev, [t.id]: e.target.value }))}
                                placeholder="Coste EUR"
                              />
                              <button
                                className="h-8 rounded-lg bg-[#0B1230] px-3 text-[12px] text-white disabled:opacity-60"
                                type="button"
                                disabled={transferConfirmLoadingId === t.id}
                                onClick={() => void confirmTransfer(t)}
                              >
                                {transferConfirmLoadingId === t.id ? "..." : "Confirmar recepción"}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
