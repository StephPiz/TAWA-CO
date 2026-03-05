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
};

type InventoryItem = {
  id: string;
  type: string;
  brand: string;
  model: string;
  name: string;
  ean: string;
  status: string;
  imageUrl: string | null;
  stockSelectedWarehouse: number;
  stockTotalStore: number;
  stockByWarehouse: {
    warehouseId: string;
    warehouseCode: string;
    warehouseName: string;
    qty: number;
  }[];
  availableElsewhere: {
    warehouseId: string;
    warehouseCode: string;
    warehouseName: string;
    qty: number;
  }[];
};

const API_BASE = "http://localhost:3001";

const headingFont = localFont({
  src: "../fonts/HFHySans_Black.ttf",
  variable: "--font-add-store-heading",
});

export default function InventoryPage() {
  const router = useRouter();
  const [storeName, setStoreName] = useState("");
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("");
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [query, setQuery] = useState("");
  const [withImages, setWithImages] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const selectedWarehouse = useMemo(
    () => warehouses.find((w) => w.id === selectedWarehouseId) || null,
    [warehouses, selectedWarehouseId]
  );
  const summary = useMemo(() => {
    const totalProducts = items.length;
    const totalStockSelected = items.reduce((acc, item) => acc + Number(item.stockSelectedWarehouse || 0), 0);
    const withExternalStock = items.filter((item) => item.stockSelectedWarehouse === 0 && item.availableElsewhere.length > 0).length;
    const lowStock = items.filter((item) => item.stockSelectedWarehouse > 0 && item.stockSelectedWarehouse <= 2).length;
    return { totalProducts, totalStockSelected, withExternalStock, lowStock };
  }, [items]);

  function statusClass(status: string) {
    const normalized = String(status || "").toLowerCase();
    if (normalized.includes("active") || normalized.includes("activo")) return "bg-[#E9F8EE] text-[#1F7A3E]";
    if (normalized.includes("archiv")) return "bg-[#F3F4F6] text-[#4B5563]";
    if (normalized.includes("inactivo") || normalized.includes("inactive")) return "bg-[#FCEBEC] text-[#B42318]";
    return "bg-[#EEF2FF] text-[#3730A3]";
  }

  const loadInventory = useCallback(
    async (token: string, storeId: string, warehouseId: string, q: string, showImages: boolean) => {
      setLoading(true);
      setError("");

      try {
        const params = new URLSearchParams({
          storeId,
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

  useEffect(() => {
    const token = requireTokenOrRedirect();
    if (!token) return;

    const selectedStoreId = localStorage.getItem("selectedStoreId");
    if (!selectedStoreId) {
      router.push("/select-store");
      return;
    }

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
        await loadInventory(token, selectedStoreId, defaultWh.id, "", false);
      } catch {
        setError("Error de conexion con API");
        setLoading(false);
      }
    })();
  }, [loadInventory, router]);

  async function runSearch(nextQuery: string = query) {
    const token = requireTokenOrRedirect();
    if (!token) return;
    const selectedStoreId = localStorage.getItem("selectedStoreId");
    if (!selectedStoreId || !selectedWarehouseId) return;
    await loadInventory(token, selectedStoreId, selectedWarehouseId, nextQuery, withImages);
  }

  async function onWarehouseChange(nextWarehouseId: string) {
    setSelectedWarehouseId(nextWarehouseId);
    const token = requireTokenOrRedirect();
    if (!token) return;
    const selectedStoreId = localStorage.getItem("selectedStoreId");
    if (!selectedStoreId) return;
    await loadInventory(token, selectedStoreId, nextWarehouseId, query, withImages);
  }

  async function onToggleImages() {
    const next = !withImages;
    setWithImages(next);
    const token = requireTokenOrRedirect();
    if (!token) return;
    const selectedStoreId = localStorage.getItem("selectedStoreId");
    if (!selectedStoreId || !selectedWarehouseId) return;
    await loadInventory(token, selectedStoreId, selectedWarehouseId, query, next);
  }

  return (
    <div className={`${headingFont.variable} min-h-screen bg-[#E8EAEC] p-6`}>
      <div className="mx-auto max-w-7xl">
        <div className="mb-2">
          <h1 className="text-[29px] leading-none text-[#141A39]" style={{ fontFamily: "var(--font-add-store-heading)" }}>
            Inventario Operativo
          </h1>
        </div>

        <div className="mt-4 rounded-2xl bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[20px] font-semibold text-[#131936]">Stock Por Almacen</div>
              <div className="text-[13px] text-[#5B637D]">
                {selectedWarehouse ? `Almacen seleccionado: ${selectedWarehouse.name} (${selectedWarehouse.code})` : "Selecciona un almacen"}
              </div>
            </div>
            <button
              className={`h-10 rounded-full border px-4 text-[13px] ${
                withImages ? "border-[#0B1230] bg-[#0B1230] text-white" : "border-[#D4D9E4] bg-white text-[#1D2647] hover:bg-[#F7F9FC]"
              }`}
              onClick={onToggleImages}
            >
              {withImages ? "Ocultar imagenes" : "Mostrar imagenes"}
            </button>
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
              Ver Productos
            </button>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl bg-[#FDECEC] p-3 text-[13px] text-[#B42318]">{error}</div>
        ) : null}

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl bg-white p-4 shadow-[0_8px_20px_rgba(0,0,0,0.06)]">
            <div className="text-[12px] uppercase tracking-wide text-[#7B839C]">Productos</div>
            <div className="mt-1 text-[24px] font-semibold text-[#131936]">{summary.totalProducts}</div>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-[0_8px_20px_rgba(0,0,0,0.06)]">
            <div className="text-[12px] uppercase tracking-wide text-[#7B839C]">Stock Almacen</div>
            <div className="mt-1 text-[24px] font-semibold text-[#131936]">{summary.totalStockSelected}</div>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-[0_8px_20px_rgba(0,0,0,0.06)]">
            <div className="text-[12px] uppercase tracking-wide text-[#7B839C]">Bajo Stock</div>
            <div className="mt-1 text-[24px] font-semibold text-[#131936]">{summary.lowStock}</div>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-[0_8px_20px_rgba(0,0,0,0.06)]">
            <div className="text-[12px] uppercase tracking-wide text-[#7B839C]">Stock En Otro Almacen</div>
            <div className="mt-1 text-[24px] font-semibold text-[#131936]">{summary.withExternalStock}</div>
          </div>
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
                  <th className="px-3 py-3 text-left">EAN</th>
                  <th className="px-3 py-3 text-left">Stock Almacen</th>
                  <th className="px-3 py-3 text-left">Estado</th>
                  <th className="px-3 py-3 text-left">Disponible en</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className="px-3 py-5 text-[#6E768E]" colSpan={withImages ? 8 : 7}>
                      Cargando inventario...
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td className="px-3 py-5 text-[#6E768E]" colSpan={withImages ? 8 : 7}>
                      Sin resultados para este almacen.
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.id} className="border-b border-[#EEF1F6] last:border-b-0">
                      {withImages ? (
                        <td className="px-3 py-2">
                          {item.imageUrl ? (
                            <Image
                              src={item.imageUrl}
                              alt={item.name}
                              width={56}
                              height={56}
                              className="h-14 w-14 rounded-xl border border-[#E4E8F1] object-cover"
                            />
                          ) : (
                            <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-[#E4E8F1] bg-[#F7F8FB] text-xs text-[#7B839C]">
                              Sin foto
                            </div>
                          )}
                        </td>
                      ) : null}
                      <td className="px-3 py-2 text-[#212A45]">{item.type || "-"}</td>
                      <td className="px-3 py-2 text-[#212A45]">{item.brand || "-"}</td>
                      <td className="px-3 py-2 font-medium text-[#131936]">{item.model || "-"}</td>
                      <td className="px-3 py-2 font-mono text-[12px] text-[#3C4562]">{item.ean || "-"}</td>
                      <td className="px-3 py-2">
                        <span className="inline-flex min-w-[34px] items-center justify-center rounded-full bg-[#EEF2FF] px-2 py-1 text-[12px] font-semibold text-[#3730A3]">
                          {item.stockSelectedWarehouse}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-[12px] font-medium ${statusClass(item.status)}`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-[#5E6680]">
                        {item.availableElsewhere.length === 0 ? (
                          "-"
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {item.availableElsewhere.map((w) => (
                              <span
                                key={`${item.id}-${w.warehouseId}`}
                                className="inline-flex items-center rounded-full bg-[#F2F4F8] px-2 py-1 text-[11px] text-[#414963]"
                              >
                                {w.warehouseCode} ({w.qty})
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
