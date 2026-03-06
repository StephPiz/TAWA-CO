"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import localFont from "next/font/local";
import { requireTokenOrRedirect } from "../lib/auth";
import { useStorePermissions } from "../lib/access";

const API_BASE = "http://localhost:3001";
const headingFont = localFont({
  src: "../fonts/HFHySans_Black.ttf",
  variable: "--font-purchases-heading",
});
const bodyFont = localFont({
  src: "../fonts/HFHySans_Regular.ttf",
  variable: "--font-purchases-body",
});

type Supplier = { id: string; code: string; name: string };
type Warehouse = { id: string; code: string; name: string };
type Purchase = {
  id: string;
  poNumber: string;
  status: string;
  orderedAt: string;
  totalAmountEur: number;
  supplier: Supplier;
};

type Product = { id: string; ean: string; brand: string; model: string; name: string };

export default function PurchasesPage() {
  const { loading, storeId, storeName, permissions, error: permissionsError } = useStorePermissions();
  const [error, setError] = useState("");
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  const [poNumber, setPoNumber] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("1");
  const [unitCost, setUnitCost] = useState("0");
  const [currency, setCurrency] = useState("EUR");
  const [fx, setFx] = useState("1");
  const [receiveWarehouseId, setReceiveWarehouseId] = useState("");
  const [receivingPurchaseId, setReceivingPurchaseId] = useState("");
  const [creatingPo, setCreatingPo] = useState(false);
  const [loadingRows, setLoadingRows] = useState(false);

  const loadAll = useCallback(async (currentStoreId: string) => {
    const token = requireTokenOrRedirect();
    if (!token) return;
    setError("");
    setLoadingRows(true);
    try {
      const [pRes, sRes, prRes, bRes] = await Promise.all([
        fetch(`${API_BASE}/purchases?storeId=${encodeURIComponent(currentStoreId)}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE}/suppliers?storeId=${encodeURIComponent(currentStoreId)}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE}/products?storeId=${encodeURIComponent(currentStoreId)}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE}/stores/${currentStoreId}/bootstrap`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const pData = await pRes.json();
      const sData = await sRes.json();
      const prData = await prRes.json();
      const bData = await bRes.json();

      if (pRes.ok) setPurchases(pData.purchases || []);
      else setError(pData.error || "Error loading purchases");
      if (sRes.ok) setSuppliers(sData.suppliers || []);
      if (prRes.ok) setProducts(prData.products || []);
      if (bRes.ok) {
        const nextWarehouses = bData.warehouses || [];
        setWarehouses(nextWarehouses);
        if (!receiveWarehouseId && nextWarehouses.length > 0) {
          setReceiveWarehouseId(nextWarehouses[0].id);
        }
      }
    } catch {
      setError("Connection error");
    } finally {
      setLoadingRows(false);
    }
  }, [receiveWarehouseId]);

  function statusChip(status: string) {
    const v = String(status || "").toLowerCase();
    if (v.includes("received") || v.includes("closed")) return "bg-[#E9F8EE] text-[#1F7A3E]";
    if (v.includes("cancel")) return "bg-[#FDECEC] text-[#B42318]";
    if (v.includes("draft")) return "bg-[#F3F4F6] text-[#4B5563]";
    return "bg-[#EEF2FF] text-[#3730A3]";
  }

  useEffect(() => {
    if (loading) return;
    if (!storeId || !permissions.financeRead) return;
    queueMicrotask(() => {
      void loadAll(storeId);
    });
  }, [loading, storeId, permissions.financeRead, loadAll]);

  async function createPurchase(e: React.FormEvent) {
    e.preventDefault();
    const token = requireTokenOrRedirect();
    if (!token || !storeId || !poNumber || !supplierId || !productId) return;
    const parsedQty = Number(qty);
    const parsedUnitCost = Number(unitCost);
    const parsedFx = Number(fx);
    if (!Number.isFinite(parsedQty) || parsedQty <= 0) {
      setError("Cantidad invalida");
      return;
    }
    if (!Number.isFinite(parsedUnitCost) || parsedUnitCost <= 0) {
      setError("Costo unitario invalido");
      return;
    }
    if (!Number.isFinite(parsedFx) || parsedFx <= 0) {
      setError("FX invalido");
      return;
    }

    setCreatingPo(true);
    const p = products.find((x) => x.id === productId);
    const res = await fetch(`${API_BASE}/purchases`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        storeId,
        supplierId,
        poNumber,
        items: [
          {
            productId,
            title: p?.name || `${p?.brand || ""} ${p?.model || ""}`.trim(),
            ean: p?.ean || null,
            quantityOrdered: parsedQty,
            unitCostOriginal: parsedUnitCost,
            currencyCode: currency,
            fxToEur: parsedFx,
          },
        ],
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setCreatingPo(false);
      return setError(data.error || "Cannot create purchase");
    }

    setPoNumber("");
    setProductId("");
    setSupplierId("");
    setQty("1");
    setUnitCost("1200");
    setCurrency("TRY");
    setFx("0.092");
    await loadAll(storeId);
    setCreatingPo(false);
  }

  async function receivePurchase(purchaseId: string) {
    const token = requireTokenOrRedirect();
    if (!token || !storeId || !receiveWarehouseId) return;
    setReceivingPurchaseId(purchaseId);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/purchases/${purchaseId}/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ storeId, warehouseId: receiveWarehouseId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo recibir PO");
        return;
      }
      await loadAll(storeId);
    } catch {
      setError("Connection error");
    } finally {
      setReceivingPurchaseId("");
    }
  }

  if (loading) return <div className="min-h-screen bg-[#E8EAEC] p-6">Cargando permisos...</div>;
  if (permissionsError) return <div className="min-h-screen bg-[#E8EAEC] p-6 text-red-700">{permissionsError}</div>;
  if (!permissions.financeRead) {
    return (
      <div className="min-h-screen bg-[#E8EAEC] p-6">
        <div className="mx-auto max-w-3xl rounded-2xl bg-white p-4 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">No autorizado para Compras.</div>
      </div>
    );
  }

  return (
    <div className={`${headingFont.variable} ${bodyFont.variable} min-h-screen bg-[#E8EAEC] p-6`}>
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="mb-2">
          <h1 className="text-[29px] leading-none text-[#141A39]" style={{ fontFamily: "var(--font-purchases-heading)" }}>
            Compras (PO)
          </h1>
          <p className="mt-1 text-[13px] text-[#616984]" style={{ fontFamily: "var(--font-purchases-body)" }}>
            {storeName ? `Tienda: ${storeName}` : "Gestión de órdenes de compra"}
          </p>
        </div>
        {error ? <div className="rounded-xl bg-[#FDECEC] p-3 text-[#B42318]">{error}</div> : null}

        <div className="rounded-2xl bg-white p-4 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
          <h2 className="mb-3 text-[20px] text-[#141A39]" style={{ fontFamily: "var(--font-purchases-heading)" }}>Nuevo PO</h2>
          <form className="grid gap-2 md:grid-cols-8" onSubmit={createPurchase}>
            <input className="h-11 rounded-xl border border-[#D4D9E4] px-3 text-[14px] text-[#25304F] outline-none" placeholder="PO-2026-0002" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} required />
            <select className="h-11 rounded-xl border border-[#D4D9E4] px-3 text-[14px] text-[#25304F] outline-none" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required>
              <option value="">Proveedor</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <select className="h-11 rounded-xl border border-[#D4D9E4] px-3 text-[14px] text-[#25304F] outline-none" value={productId} onChange={(e) => setProductId(e.target.value)} required>
              <option value="">Producto</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.brand} {p.model}</option>
              ))}
            </select>
            <input className="h-11 rounded-xl border border-[#D4D9E4] px-3 text-[14px] text-[#25304F] outline-none" type="number" min="1" placeholder="Cantidad" value={qty} onChange={(e) => setQty(e.target.value)} />
            <input className="h-11 rounded-xl border border-[#D4D9E4] px-3 text-[14px] text-[#25304F] outline-none" type="number" min="0" step="0.0001" placeholder="Costo unitario" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
            <input className="h-11 rounded-xl border border-[#D4D9E4] px-3 text-[14px] text-[#25304F] outline-none uppercase" placeholder="Moneda (EUR)" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
            <input className="h-11 rounded-xl border border-[#D4D9E4] px-3 text-[14px] text-[#25304F] outline-none" type="number" min="0" step="0.000001" placeholder="FX a EUR" value={fx} onChange={(e) => setFx(e.target.value)} />
            <button className="h-11 rounded-xl bg-[#0B1230] px-3 text-[14px] text-white disabled:opacity-60" type="submit" disabled={creatingPo}>
              {creatingPo ? "Creando..." : "Crear"}
            </button>
          </form>
          <div className="mt-2 text-[12px] text-[#6E768E]" style={{ fontFamily: "var(--font-purchases-body)" }}>
            Completa proveedor, producto, cantidad, costo y FX. El PO se crea en estado inicial y luego puedes recibirlo por almacén.
          </div>
        </div>

        <div className="rounded-2xl bg-white p-4 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
          <h2 className="mb-2 text-[20px] text-[#141A39]" style={{ fontFamily: "var(--font-purchases-heading)" }}>Recepción de PO</h2>
          <select className="h-11 rounded-xl border border-[#D4D9E4] px-3 text-[14px] text-[#25304F] outline-none" value={receiveWarehouseId} onChange={(e) => setReceiveWarehouseId(e.target.value)}>
            <option value="">Selecciona almacén</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code} - {w.name}
              </option>
            ))}
          </select>
          {warehouses.length === 0 ? (
            <div className="mt-2 text-[12px] text-[#B42318]">No hay almacenes activos para recepción.</div>
          ) : null}
        </div>

        <div className="overflow-hidden rounded-2xl bg-white shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
          <table className="min-w-full text-sm">
            <thead className="border-b bg-[#F5F7FB]">
              <tr>
                <th className="text-left px-3 py-2">PO</th>
                <th className="text-left px-3 py-2">Proveedor</th>
                <th className="text-left px-3 py-2">Estado</th>
                <th className="text-left px-3 py-2">Fecha</th>
                <th className="text-left px-3 py-2">Total EUR</th>
                <th className="text-left px-3 py-2">Acción</th>
              </tr>
            </thead>
            <tbody>
              {loadingRows ? (
                <tr><td colSpan={6} className="px-3 py-4 text-[#6E768E]">Cargando POs...</td></tr>
              ) : purchases.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-4 text-[#6E768E]">Sin POs</td></tr>
              ) : (
                purchases.map((p) => (
                  <tr key={p.id} className="border-b border-[#EEF1F6]">
                    <td className="px-3 py-2 font-medium text-[#131936]">{p.poNumber}</td>
                    <td className="px-3 py-2 text-[#212A45]">{p.supplier?.name || "-"}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[12px] font-medium ${statusChip(p.status)}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[#212A45]">
                      {new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(p.orderedAt))}
                    </td>
                    <td className="px-3 py-2 font-semibold text-[#131936]">{Number(p.totalAmountEur || 0).toFixed(2)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <button
                          className="rounded-xl border border-[#D4D9E4] px-2.5 py-1.5 text-[12px] text-[#1D2647] disabled:opacity-50"
                          disabled={
                            !receiveWarehouseId ||
                            receivingPurchaseId === p.id ||
                            String(p.status || "").toLowerCase().includes("received") ||
                            String(p.status || "").toLowerCase().includes("closed")
                          }
                          onClick={() => receivePurchase(p.id)}
                        >
                          {receivingPurchaseId === p.id ? "..." : "Recibir"}
                        </button>
                        <Link className="rounded-xl border border-[#D4D9E4] px-2.5 py-1.5 text-[12px] text-[#1D2647] hover:bg-[#F7F9FC]" href={`/store/purchases/${p.id}`}>
                          Detalle
                        </Link>
                      </div>
                    </td>
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
