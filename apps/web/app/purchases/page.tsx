"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  note?: string | null;
  supplier: Supplier;
};

const PURCHASE_STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  review: "Revisión de compras",
  sent: "Enviado al proveedor",
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
};

function buildPurchaseNumber(dateValue: string, supplier?: Supplier | null) {
  const raw = String(dateValue || "").trim();
  const compactDate = raw
    ? raw.replaceAll("-", "").slice(2)
    : new Date().toISOString().slice(0, 10).replaceAll("-", "").slice(2);
  const supplierBase = (supplier?.name || supplier?.code || "PO")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const shortSupplier = supplierBase.replaceAll("-", "").slice(0, 3) || "PO";
  return `PO-${compactDate}-${shortSupplier}`;
}

export default function PurchasesPage() {
  const { loading, storeId, storeName, permissions, error: permissionsError } = useStorePermissions();
  const [error, setError] = useState("");
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  const [poNumber, setPoNumber] = useState("");
  const [orderedAt, setOrderedAt] = useState(new Date().toISOString().slice(0, 10));
  const [supplierId, setSupplierId] = useState("");
  const [conceptName, setConceptName] = useState("");
  const [receiveWarehouseId, setReceiveWarehouseId] = useState("");
  const [receivingPurchaseId, setReceivingPurchaseId] = useState("");
  const [creatingPo, setCreatingPo] = useState(false);
  const [loadingRows, setLoadingRows] = useState(false);
  const [activeView, setActiveView] = useState<"build" | "review">("build");

  useEffect(() => {
    const syncViewFromHash = () => {
      if (typeof window === "undefined") return;
      const nextView = window.location.hash === "#revision-compras" ? "review" : "build";
      setActiveView(nextView);
    };
    syncViewFromHash();
    window.addEventListener("hashchange", syncViewFromHash);
    return () => window.removeEventListener("hashchange", syncViewFromHash);
  }, []);

  useEffect(() => {
    const selectedSupplier = suppliers.find((supplier) => supplier.id === supplierId) || null;
    setPoNumber(buildPurchaseNumber(orderedAt, selectedSupplier));
  }, [orderedAt, supplierId, suppliers]);

  const loadAll = useCallback(async (currentStoreId: string) => {
    const token = requireTokenOrRedirect();
    if (!token) return;
    setError("");
    setLoadingRows(true);
    try {
      const [pRes, sRes, bRes] = await Promise.all([
        fetch(`${API_BASE}/purchases?storeId=${encodeURIComponent(currentStoreId)}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE}/suppliers?storeId=${encodeURIComponent(currentStoreId)}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE}/stores/${currentStoreId}/bootstrap`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const pData = await pRes.json();
      const sData = await sRes.json();
      const bData = await bRes.json();

      if (pRes.ok) setPurchases(pData.purchases || []);
      else setError(pData.error || "Error loading purchases");
      if (sRes.ok) setSuppliers(sData.suppliers || []);
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
    if (v.includes("review")) return "bg-[#FFF4E8] text-[#B45C00]";
    return "bg-[#EEF2FF] text-[#3730A3]";
  }

  function statusLabel(status: string) {
    return PURCHASE_STATUS_LABELS[String(status || "").toLowerCase()] || status || "-";
  }

  const reviewPurchases = useMemo(
    () => purchases.filter((purchase) => String(purchase.status || "").toLowerCase() === "review"),
    [purchases],
  );
  const buildPurchases = useMemo(
    () => purchases.filter((purchase) => String(purchase.status || "").toLowerCase() !== "review"),
    [purchases],
  );
  const reviewSupplierCount = useMemo(
    () => new Set(reviewPurchases.map((purchase) => purchase.supplier?.id || purchase.supplier?.name || purchase.id)).size,
    [reviewPurchases],
  );
  const reviewTotalAmount = useMemo(
    () => reviewPurchases.reduce((sum, purchase) => sum + Number(purchase.totalAmountEur || 0), 0),
    [reviewPurchases],
  );
  const latestReviewDate = useMemo(() => {
    if (reviewPurchases.length === 0) return "-";
    const latest = [...reviewPurchases]
      .map((purchase) => purchase.orderedAt)
      .filter(Boolean)
      .sort()
      .at(-1);
    if (!latest) return "-";
    return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(latest));
  }, [reviewPurchases]);

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
    if (!token || !storeId || !poNumber || !supplierId) return;

    setCreatingPo(true);
    const res = await fetch(`${API_BASE}/purchases`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        storeId,
        supplierId,
        poNumber,
        orderedAt,
        note: conceptName.trim() || null,
        items: [],
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setCreatingPo(false);
      return setError(data.error || "Cannot create purchase");
    }

    setPoNumber("");
    setSupplierId("");
    setOrderedAt(new Date().toISOString().slice(0, 10));
    setConceptName("");
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
            {activeView === "review" ? "Revisión de compras" : "Compras (PO)"}
          </h1>
          <p className="mt-1 text-[13px] text-[#616984]" style={{ fontFamily: "var(--font-purchases-body)" }}>
            {activeView === "review"
              ? storeName
                ? `Tienda: ${storeName} · Validación interna antes de enviar al proveedor`
                : "Validación interna antes de enviar al proveedor"
              : storeName
                ? `Tienda: ${storeName}`
                : "Gestión de órdenes de compra"}
          </p>
        </div>
        {error ? <div className="rounded-xl bg-[#FDECEC] p-3 text-[#B42318]">{error}</div> : null}

        {activeView === "build" ? (
          <>
            <div className="rounded-2xl bg-white p-4 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
              <h2 className="mb-3 text-[20px] text-[#141A39]" style={{ fontFamily: "var(--font-purchases-heading)" }}>Nuevo PO</h2>
              <form className="grid gap-3 md:grid-cols-5" onSubmit={createPurchase}>
                <input
                  className="h-11 rounded-xl border border-[#D4D9E4] bg-[#F7F9FC] px-3 text-[14px] text-[#25304F] outline-none"
                  placeholder="PO automático"
                  value={poNumber}
                  readOnly
                  required
                />
                <input className="h-11 rounded-xl border border-[#D4D9E4] px-3 text-[14px] text-[#25304F] outline-none" type="date" value={orderedAt} onChange={(e) => setOrderedAt(e.target.value)} required />
                <select className="h-11 rounded-xl border border-[#D4D9E4] px-3 text-[14px] text-[#25304F] outline-none" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required>
                  <option value="">Proveedor</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <input
                  className="h-11 rounded-xl border border-[#D4D9E4] px-3 text-[14px] text-[#25304F] outline-none"
                  placeholder="Concepto del pedido: Relojes, Box, Pedido verano..."
                  value={conceptName}
                  onChange={(e) => setConceptName(e.target.value)}
                />
                <button className="h-11 rounded-xl bg-[#0B1230] px-3 text-[14px] text-white disabled:opacity-60" type="submit" disabled={creatingPo}>
                  {creatingPo ? "Creando..." : "Crear"}
                </button>
              </form>
              <div className="mt-2 text-[12px] text-[#6E768E]" style={{ fontFamily: "var(--font-purchases-body)" }}>
                El nombre del PO se genera automáticamente con la fecha y el proveedor. Primero creas la cabecera y luego, dentro de Detalle, agregas las líneas del pedido.
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
          </>
        ) : (
          <>
            <div className="grid gap-4 xl:grid-cols-[1.45fr_0.95fr]">
              <section className="overflow-hidden rounded-[28px] bg-[linear-gradient(135deg,#101935_0%,#182451_52%,#23347B_100%)] p-6 text-white shadow-[0_16px_40px_rgba(11,18,48,0.22)]">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="max-w-[620px]">
                    <span className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[12px] tracking-[0.08em] text-white/85">
                      Fase de validación
                    </span>
                    <h2 className="mt-4 text-[30px] leading-none" style={{ fontFamily: "var(--font-purchases-heading)" }}>
                      Bandeja de revisión
                    </h2>
                    <p className="mt-3 max-w-[560px] text-[14px] leading-6 text-white/78" style={{ fontFamily: "var(--font-purchases-body)" }}>
                      Aquí ya no construimos el pedido. En esta etapa revisamos, validamos y dejamos la salida al proveedor lista y coherente antes de pasar a precios o envío.
                    </p>
                  </div>
                  <Link
                    href="/store/purchases"
                    className="inline-flex h-11 items-center rounded-xl border border-white/15 bg-white/10 px-4 text-[13px] text-white transition hover:bg-white/16"
                  >
                    Volver a Compras
                  </Link>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/12 bg-white/8 p-4 backdrop-blur-sm">
                    <div className="text-[12px] uppercase tracking-[0.08em] text-white/60">Pedidos en revisión</div>
                    <div className="mt-2 text-[30px] leading-none" style={{ fontFamily: "var(--font-purchases-heading)" }}>
                      {reviewPurchases.length}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/12 bg-white/8 p-4 backdrop-blur-sm">
                    <div className="text-[12px] uppercase tracking-[0.08em] text-white/60">Total a validar</div>
                    <div className="mt-2 text-[30px] leading-none" style={{ fontFamily: "var(--font-purchases-heading)" }}>
                      {reviewTotalAmount.toFixed(2)}
                    </div>
                    <div className="mt-1 text-[12px] text-white/60">EUR acumulado</div>
                  </div>
                  <div className="rounded-2xl border border-white/12 bg-white/8 p-4 backdrop-blur-sm">
                    <div className="text-[12px] uppercase tracking-[0.08em] text-white/60">Última entrada</div>
                    <div className="mt-2 text-[24px] leading-none" style={{ fontFamily: "var(--font-purchases-heading)" }}>
                      {latestReviewDate}
                    </div>
                    <div className="mt-1 text-[12px] text-white/60">{reviewSupplierCount} proveedor{reviewSupplierCount === 1 ? "" : "es"}</div>
                  </div>
                </div>
              </section>

              <section className="rounded-[28px] bg-white p-5 shadow-[0_12px_32px_rgba(0,0,0,0.08)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-[20px] text-[#141A39]" style={{ fontFamily: "var(--font-purchases-heading)" }}>
                      Qué revisamos aquí
                    </h3>
                    <p className="mt-1 text-[13px] text-[#616984]" style={{ fontFamily: "var(--font-purchases-body)" }}>
                      Este bloque deja claro si el pedido sale a proveedor o vuelve a Compras.
                    </p>
                  </div>
                  <span className="inline-flex rounded-full bg-[#EEF2FF] px-3 py-1 text-[12px] text-[#3147D4]">Checklist</span>
                </div>

                <div className="mt-5 space-y-3">
                  {[
                    "La lista de productos ya está cerrada y ordenada.",
                    "Las cantidades están confirmadas y el concepto del pedido tiene sentido.",
                    "El PDF o Excel ya puede compartirse si el pedido queda aprobado.",
                    "Si algo no cuadra, el pedido debe volver a Compras con criterio claro.",
                  ].map((line) => (
                    <div key={line} className="flex items-start gap-3 rounded-2xl bg-[#F7F9FC] px-4 py-3">
                      <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#E9F8EE] text-[12px] text-[#1F7A3E]">
                        ✓
                      </span>
                      <span className="text-[13px] leading-6 text-[#2F3855]" style={{ fontFamily: "var(--font-purchases-body)" }}>
                        {line}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-5 rounded-2xl border border-dashed border-[#D6DCE8] bg-[#FBFCFE] p-4">
                  <div className="text-[12px] uppercase tracking-[0.08em] text-[#7A8196]">Resultado esperado</div>
                  <div className="mt-2 text-[16px] text-[#141A39]" style={{ fontFamily: "var(--font-purchases-heading)" }}>
                    Aprobar, devolver a Compras o preparar el envío al proveedor.
                  </div>
                </div>
              </section>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl bg-white p-4 shadow-[0_10px_24px_rgba(0,0,0,0.06)]">
                <div className="text-[12px] uppercase tracking-[0.08em] text-[#7A8196]">Paso 1</div>
                <div className="mt-2 text-[18px] text-[#141A39]" style={{ fontFamily: "var(--font-purchases-heading)" }}>
                  Validar pedido
                </div>
                <p className="mt-2 text-[13px] leading-6 text-[#616984]" style={{ fontFamily: "var(--font-purchases-body)" }}>
                  Confirmamos proveedor, fecha, concepto y consistencia general del pedido.
                </p>
              </div>
              <div className="rounded-2xl bg-white p-4 shadow-[0_10px_24px_rgba(0,0,0,0.06)]">
                <div className="text-[12px] uppercase tracking-[0.08em] text-[#7A8196]">Paso 2</div>
                <div className="mt-2 text-[18px] text-[#141A39]" style={{ fontFamily: "var(--font-purchases-heading)" }}>
                  Corregir o aprobar
                </div>
                <p className="mt-2 text-[13px] leading-6 text-[#616984]" style={{ fontFamily: "var(--font-purchases-body)" }}>
                  Si algo falla, vuelve a Compras. Si todo está bien, se aprueba para proveedor.
                </p>
              </div>
              <div className="rounded-2xl bg-white p-4 shadow-[0_10px_24px_rgba(0,0,0,0.06)]">
                <div className="text-[12px] uppercase tracking-[0.08em] text-[#7A8196]">Paso 3</div>
                <div className="mt-2 text-[18px] text-[#141A39]" style={{ fontFamily: "var(--font-purchases-heading)" }}>
                  Esperar precios
                </div>
                <p className="mt-2 text-[13px] leading-6 text-[#616984]" style={{ fontFamily: "var(--font-purchases-body)" }}>
                  Después ya entra la fase donde el proveedor responde con precios y seguimos el flujo.
                </p>
              </div>
            </div>
          </>
        )}

        {activeView !== "review" ? (
          <div className="overflow-hidden rounded-2xl bg-white shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
            <div className="border-b border-[#EEF1F6] px-4 py-4">
              <h2 className="text-[20px] text-[#141A39]" style={{ fontFamily: "var(--font-purchases-heading)" }}>
                Compras activas
              </h2>
              <p className="mt-1 text-[13px] text-[#616984]" style={{ fontFamily: "var(--font-purchases-body)" }}>
                Aquí creas, completas y recibes los pedidos que todavía están en trabajo o ya siguieron otras fases.
              </p>
            </div>
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
                ) : buildPurchases.length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-4 text-[#6E768E]">Sin POs</td></tr>
                ) : (
                  buildPurchases.map((p) => (
                    <tr key={p.id} className="border-b border-[#EEF1F6]">
                      <td className="px-3 py-2 font-medium text-[#131936]">{p.poNumber}</td>
                      <td className="px-3 py-2 text-[#212A45]">{p.supplier?.name || "-"}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-[12px] font-medium ${statusChip(p.status)}`}>
                          {statusLabel(p.status)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-[#212A45]">
                        {new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(p.orderedAt))}
                        {p.note ? <div className="mt-1 text-[12px] text-[#6E768E]">{p.note}</div> : null}
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
        ) : null}

        <div id="revision-compras" className="overflow-hidden rounded-2xl bg-white shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
          <div className="border-b border-[#EEF1F6] px-4 py-4">
            <h2 className="text-[20px] text-[#141A39]" style={{ fontFamily: "var(--font-purchases-heading)" }}>
              Revisión de compras
            </h2>
            <p className="mt-1 text-[13px] text-[#616984]" style={{ fontFamily: "var(--font-purchases-body)" }}>
              Aquí quedan los pedidos que ya salieron de Compras y deben aprobarse, devolverse para cambios o enviarse al proveedor.
            </p>
          </div>
          <table className="min-w-full text-sm">
            <thead className="border-b bg-[#F5F7FB]">
              <tr>
                <th className="text-left px-3 py-2">PO</th>
                <th className="text-left px-3 py-2">Proveedor</th>
                <th className="text-left px-3 py-2">Concepto</th>
                <th className="text-left px-3 py-2">Estado</th>
                <th className="text-left px-3 py-2">Fecha</th>
                <th className="text-left px-3 py-2">Total EUR</th>
                <th className="text-left px-3 py-2">Acción</th>
              </tr>
            </thead>
            <tbody>
              {loadingRows ? (
                <tr><td colSpan={7} className="px-3 py-4 text-[#6E768E]">Cargando revisión...</td></tr>
              ) : reviewPurchases.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-4 text-[#6E768E]">Aún no hay pedidos en revisión.</td></tr>
              ) : (
                reviewPurchases.map((p) => (
                  <tr key={`review-${p.id}`} className="border-b border-[#EEF1F6]">
                    <td className="px-3 py-2 font-medium text-[#131936]">{p.poNumber}</td>
                    <td className="px-3 py-2 text-[#212A45]">{p.supplier?.name || "-"}</td>
                    <td className="px-3 py-2 text-[#5F6780]">{p.note || "Sin concepto"}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[12px] font-medium ${statusChip(p.status)}`}>
                        {statusLabel(p.status)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[#212A45]">
                      {new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(p.orderedAt))}
                      {p.note ? <div className="mt-1 text-[12px] text-[#6E768E]">{p.note}</div> : null}
                    </td>
                    <td className="px-3 py-2 font-semibold text-[#131936]">{Number(p.totalAmountEur || 0).toFixed(2)}</td>
                    <td className="px-3 py-2">
                      <Link className="rounded-xl border border-[#D4D9E4] px-2.5 py-1.5 text-[12px] text-[#1D2647] hover:bg-[#F7F9FC]" href={`/store/purchases/${p.id}`}>
                        Abrir revisión
                      </Link>
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
