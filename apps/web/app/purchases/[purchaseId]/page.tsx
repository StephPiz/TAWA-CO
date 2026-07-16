"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  "checklist",
  "review",
  "sent",
  "priced",
  "paid",
  "preparing",
  "tracking_received",
  "in_transit",
  "received",
  "verified",
  "closed",
  "incident",
];

const STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  review: "Revisión de compras",
  sent: "Enviado",
  priced: "Precios recibidos",
  paid: "Pagado",
  preparing: "Preparando",
  checklist: "Lista completa",
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
  note?: string | null;
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
    unitCostOriginal: number;
    currencyCode: string;
    fxToEur: number;
    unitCostEurFrozen: number;
    totalCostEur: number;
    product?: {
      id: string;
      brand: string;
      model: string;
      modelRef: string | null;
      name: string;
      mainImageUrl: string | null;
    } | null;
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

type ProductSuggestion = {
  id: string;
  ean: string;
  brand: string;
  modelRef?: string | null;
  model: string;
  name: string;
};

function purchaseSuggestionLabel(product: ProductSuggestion) {
  const normalizedName = String(product.name || "").toLowerCase();
  if (normalizedName.startsWith("box ")) {
    return ["Box", product.brand, product.model, product.modelRef].filter(Boolean).join(" · ");
  }
  if (normalizedName.startsWith("shopping bag ") || normalizedName.startsWith("shopping-bag ")) {
    return ["Shopping Bag", product.brand, product.model, product.modelRef].filter(Boolean).join(" · ");
  }
  return [product.model || product.name || "Producto", product.modelRef].filter(Boolean).join(" · ");
}

function isPurchaseBoxItem(item: PurchaseDetail["items"][number]) {
  const source = [item.title, item.product?.name, item.product?.brand, item.product?.model, item.product?.modelRef]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return source.includes("box") || source.includes("shopping bag") || source.includes("shopping-bag");
}

function normalizeCatalogText(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function scoreProductSuggestion(product: ProductSuggestion, query: string) {
  const normalizedQuery = normalizeCatalogText(query);
  const modelRef = normalizeCatalogText(product.modelRef);
  const model = normalizeCatalogText(product.model);
  const name = normalizeCatalogText(product.name);
  const brand = normalizeCatalogText(product.brand);
  const ean = normalizeCatalogText(product.ean);

  if (modelRef && modelRef === normalizedQuery) return 100;
  if (model && model === normalizedQuery) return 95;
  if (name && name === normalizedQuery) return 90;
  if (ean && ean === normalizedQuery) return 85;
  if (modelRef && modelRef.startsWith(normalizedQuery)) return 80;
  if (model && model.startsWith(normalizedQuery)) return 70;
  if (name && name.startsWith(normalizedQuery)) return 60;
  if (brand && brand.startsWith(normalizedQuery)) return 50;
  if (modelRef && modelRef.includes(normalizedQuery)) return 40;
  if (model && model.includes(normalizedQuery)) return 35;
  if (name && name.includes(normalizedQuery)) return 30;
  if (brand && brand.includes(normalizedQuery)) return 20;
  if (ean && ean.includes(normalizedQuery)) return 10;
  return 0;
}

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

function purchaseItemModel(item: PurchaseDetail["items"][number]) {
  return item.product?.modelRef || item.product?.model || item.title || item.ean || "-";
}

function purchaseItemBrand(item: PurchaseDetail["items"][number]) {
  return item.product?.brand || "-";
}

function purchaseItemPhoto(item: PurchaseDetail["items"][number]) {
  return item.product?.mainImageUrl || null;
}

function buildCreateProductHref(purchaseId: string, item: PurchaseDetail["items"][number]) {
  const params = new URLSearchParams({
    returnTo: `/store/purchases/${purchaseId}#lista-compra`,
    linkPurchaseId: purchaseId,
    linkPurchaseItemId: item.id,
    prefillBrand: item.product?.brand || "",
    prefillModel: item.product?.model || "",
    prefillModelRef: item.product?.modelRef || item.title || item.ean || "",
    prefillEan: item.ean || "",
    prefillName: item.product?.name || item.title || "",
  });
  return `/store/products?${params.toString()}`;
}

export default function PurchaseDetailPage() {
  const { purchaseId } = useParams<{ purchaseId: string }>();
  const { loading, storeId, storeName, permissions, error: permissionsError } = useStorePermissions();

  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [purchase, setPurchase] = useState<PurchaseDetail | null>(null);
  const [products, setProducts] = useState<ProductSuggestion[]>([]);
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
  const [lineSearch, setLineSearch] = useState("");
  const [lineProductId, setLineProductId] = useState("");
  const [lineTitle, setLineTitle] = useState("");
  const [lineEan, setLineEan] = useState("");
  const [lineQty, setLineQty] = useState("1");
  const [qtyDraftByItem, setQtyDraftByItem] = useState<Record<string, string>>({});
  const [lineInfoOpen, setLineInfoOpen] = useState(false);
  const [listEditMode, setListEditMode] = useState(false);
  const [addBoxChoice, setAddBoxChoice] = useState<"yes" | "no">("no");
  const lineSearchInputRef = useRef<HTMLInputElement | null>(null);

  const boxChoiceStorageKey = useMemo(() => {
    if (!purchaseId) return "";
    return `purchase-add-box:${purchaseId}`;
  }, [purchaseId]);

  const loadAll = useCallback(async (sid: string, poId: string) => {
    const token = requireTokenOrRedirect();
    if (!token) return;
    setError("");

    try {
      const [poRes, bootRes, productRes] = await Promise.all([
        fetch(`${API_BASE}/purchases/${poId}?storeId=${encodeURIComponent(sid)}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/stores/${sid}/bootstrap`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/products?storeId=${encodeURIComponent(sid)}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const poData = await poRes.json();
      const bootData = await bootRes.json();
      const productData = await productRes.json();

      if (!poRes.ok) {
        setError(poData.error || "Error loading purchase detail");
        return;
      }

      if (bootRes.ok) {
        const nextWarehouses = (bootData.warehouses || []) as Warehouse[];
        setWarehouses(nextWarehouses);
        if (!receiveWarehouseId && nextWarehouses.length > 0) {
          setReceiveWarehouseId(nextWarehouses[0].id);
        }
      }

      const catalogProducts = productRes.ok ? ((productData.products || []) as ProductSuggestion[]) : [];
      if (productRes.ok) {
        setProducts(catalogProducts);
      }

      let nextPurchase = poData.purchase as PurchaseDetail;
      const unresolvedItems = (nextPurchase.items || []).filter((item) => !item.productId);
      const relinkTargets = unresolvedItems
        .map((item) => {
          const itemTitle = normalizeCatalogText(item.title);
          const itemEan = normalizeCatalogText(item.ean);
          const match = catalogProducts.find((product) => {
            const productModelRef = normalizeCatalogText(product.modelRef);
            const productEan = normalizeCatalogText(product.ean);
            const productName = normalizeCatalogText(product.name);
            return (
              (itemEan && productEan && itemEan === productEan) ||
              (itemTitle && productModelRef && itemTitle === productModelRef) ||
              (itemTitle && productName && itemTitle === productName)
            );
          });
          return match ? { itemId: item.id, productId: match.id } : null;
        })
        .filter(Boolean) as { itemId: string; productId: string }[];

      if (relinkTargets.length > 0) {
        await Promise.all(
          relinkTargets.map(({ itemId, productId }) =>
            fetch(`${API_BASE}/purchases/${poId}/items/${itemId}/link-product`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ storeId: sid, productId }),
            })
          )
        );

        const refreshedPoRes = await fetch(`${API_BASE}/purchases/${poId}?storeId=${encodeURIComponent(sid)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const refreshedPoData = await refreshedPoRes.json();
        if (refreshedPoRes.ok) {
          nextPurchase = refreshedPoData.purchase as PurchaseDetail;
        }
      }

      setPurchase(nextPurchase);
      setStatus(nextPurchase.status);
      setSelectedShipmentId((current) =>
        current || (nextPurchase.shipments3pl && nextPurchase.shipments3pl.length > 0 ? nextPurchase.shipments3pl[0].id : "")
      );
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

  useEffect(() => {
    if (loading || !storeId || !purchaseId || !permissions.financeRead) return;

    const reloadPurchase = () => {
      void loadAll(storeId, purchaseId);
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        reloadPurchase();
      }
    };

    window.addEventListener("focus", reloadPurchase);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("focus", reloadPurchase);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [loading, storeId, purchaseId, permissions.financeRead, loadAll]);

  const pendingByItem = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of purchase?.items || []) {
      map[item.id] = Math.max(Number(item.quantityOrdered || 0) - Number(item.quantityReceived || 0), 0);
    }
    return map;
  }, [purchase]);

  const purchaseItems = purchase?.items || [];
  const mainPurchaseItems = useMemo(() => purchaseItems.filter((item) => !isPurchaseBoxItem(item)), [purchaseItems]);
  const boxPurchaseItems = useMemo(() => purchaseItems.filter((item) => isPurchaseBoxItem(item)), [purchaseItems]);

  useEffect(() => {
    const nextDrafts: Record<string, string> = {};
    for (const item of purchase?.items || []) {
      nextDrafts[item.id] = String(item.quantityOrdered || 1);
    }
    setQtyDraftByItem(nextDrafts);
  }, [purchase]);

  const productSuggestions = useMemo(() => {
    const query = lineSearch.trim().toLowerCase();
    if (!query) return [];
    return products
      .map((product) => ({ product, score: scoreProductSuggestion(product, query) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ product }) => product)
      .slice(0, 6);
  }, [products, lineSearch]);

  function selectSuggestion(product: ProductSuggestion) {
    const label = purchaseSuggestionLabel(product) || product.name;
    setLineProductId(product.id);
    setLineSearch(label);
    setLineTitle(product.name || label);
    setLineEan(product.ean || "");
  }

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

  async function addPurchaseLine(e: React.FormEvent) {
    e.preventDefault();
    const token = requireTokenOrRedirect();
    if (!token || !storeId || !purchaseId || !lineTitle.trim()) return;

    setBusyAction("add_line");
    setError("");
    try {
      const res = await fetch(`${API_BASE}/purchases/${purchaseId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          storeId,
          productId: lineProductId || null,
          title: lineTitle.trim(),
          ean: lineEan.trim() || null,
          quantityOrdered: Number(lineQty),
          unitCostOriginal: 0.0001,
          currencyCode: "EUR",
          fxToEur: 1,
        }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error || "No se pudo agregar la línea");
      setInfo("Línea agregada al PO");
      setLineSearch("");
      setLineProductId("");
      setLineTitle("");
      setLineEan("");
      setLineQty("1");
      await loadAll(storeId, purchaseId);
    } catch {
      setError("Connection error");
    } finally {
      setBusyAction("");
    }
  }

  async function updatePurchaseLineQty(itemId: string, nextQty: number) {
    const token = requireTokenOrRedirect();
    if (!token || !storeId || !purchaseId) return;
    if (!Number.isInteger(nextQty) || nextQty < 0) return;

    setBusyAction(`qty_${itemId}`);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/purchases/${purchaseId}/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          storeId,
          quantityOrdered: nextQty,
        }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error || "No se pudo actualizar la cantidad");
      if (nextQty === 0) {
        setPurchase((prev) => {
          if (!prev) return prev;
          const nextItems = (prev.items || []).filter((item) => item.id !== itemId);
          return {
            ...prev,
            items: nextItems,
            totalAmountEur: nextItems.reduce((sum, item) => sum + Number(item.totalCostEur || 0), 0),
          };
        });
        setQtyDraftByItem((prev) => {
          const next = { ...prev };
          delete next[itemId];
          return next;
        });
        setInfo("Línea eliminada del pedido");
      } else {
        setInfo("Cantidad actualizada");
        await loadAll(storeId, purchaseId);
      }
    } catch {
      setError("Connection error");
    } finally {
      setBusyAction("");
    }
  }

  async function sendPurchaseReviewTask() {
    const token = requireTokenOrRedirect();
    if (!token || !storeId || !purchaseId || !purchase) return;

    setBusyAction("review_task");
    setError("");
    try {
      const statusRes = await fetch(`${API_BASE}/purchases/${purchaseId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          storeId,
          status: "review",
        }),
      });
      const statusData = await statusRes.json();
      if (!statusRes.ok) return setError(statusData.error || "No se pudo mover el pedido a revisión");
      setStatus("review");
      setPurchase((prev) => (prev ? { ...prev, status: "review" } : prev));

      const res = await fetch(`${API_BASE}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          storeId,
          title: `Revisión de compras ${purchase.poNumber}`,
          description: `Proveedor: ${purchase.supplier?.name || "-"}\nLíneas: ${purchase.items?.length || 0}\nConcepto: ${purchase.note || "-"}\nSiguiente paso: validar internamente antes de enviar al proveedor.`,
          priority: "medium",
          linkedEntityType: "purchase_order",
          linkedEntityId: purchaseId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInfo("El pedido pasó a Revisión de compras, pero la tarea no se pudo crear.");
        return setError(data.error || "No se pudo crear la tarea de revisión");
      }
      setInfo("Pedido enviado a Revisión de compras y tarea creada correctamente");
    } catch {
      setError("Connection error");
    } finally {
      setBusyAction("");
    }
  }

  async function markPurchaseListComplete() {
    const token = requireTokenOrRedirect();
    if (!token || !storeId || !purchaseId) return;
    setBusyAction("list_complete");
    setError("");
    setInfo("");
    try {
      const res = await fetch(`${API_BASE}/purchases/${purchaseId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ storeId, status: "checklist" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo marcar la lista como completa");
        return;
      }
      setStatus("checklist");
      setPurchase((prev) => (prev ? { ...prev, status: "checklist" } : prev));
      setInfo("Pedido marcado como Lista completa");
    } catch {
      setError("Connection error");
    } finally {
      setBusyAction("");
    }
  }

  async function sendPurchaseToSupplier() {
    const token = requireTokenOrRedirect();
    if (!token || !storeId || !purchaseId) return;
    setBusyAction("send_supplier");
    setError("");
    setInfo("");
    try {
      const res = await fetch(`${API_BASE}/purchases/${purchaseId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ storeId, status: "sent" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo enviar el pedido al proveedor");
        return;
      }
      setInfo("Pedido marcado como enviado al proveedor");
      await loadAll(storeId, String(purchaseId));
    } catch {
      setError("Connection error");
    } finally {
      setBusyAction("");
    }
  }

  async function returnPurchaseToDraft() {
    const token = requireTokenOrRedirect();
    if (!token || !storeId || !purchaseId) return;
    setBusyAction("return_draft");
    setError("");
    setInfo("");
    try {
      const res = await fetch(`${API_BASE}/purchases/${purchaseId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ storeId, status: "draft" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo devolver el pedido a Compras");
        return;
      }
      setInfo("Pedido devuelto a Compras para ajustes");
      await loadAll(storeId, String(purchaseId));
    } catch {
      setError("Connection error");
    } finally {
      setBusyAction("");
    }
  }

  function downloadPurchaseCsv() {
    if (!purchase) return;
    const watchUnits = mainPurchaseItems.reduce((sum, item) => sum + Number(item.quantityOrdered || 0), 0);
    const boxUnits = boxPurchaseItems.reduce((sum, item) => sum + Number(item.quantityOrdered || 0), 0);
    const formattedDate = purchase.orderedAt
      ? new Date(purchase.orderedAt).toLocaleDateString("es-ES", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }).replaceAll("/", " / ")
      : "-";

    const csvValue = (value: string | number | null | undefined) => {
      const normalized = String(value ?? "");
      return `"${normalized.replaceAll('"', '""')}"`;
    };

    const csvTextEan = (value: string | null | undefined) => {
      const normalized = String(value ?? "").trim();
      if (!normalized || normalized === "-") return csvValue("-");
      return csvValue(`="${normalized}"`);
    };

    const makeRow = (cells: Array<string | number | null | undefined>) => cells.map((cell) => csvValue(cell)).join(";");

    const rows: string[] = [];

    rows.push(makeRow([purchase.poNumber || "-"]));
    rows.push(makeRow(["Date", formattedDate]));
    rows.push(makeRow(["Total Items", watchUnits]));
    if (boxUnits > 0) rows.push(makeRow(["Total Box", boxUnits]));
    rows.push("");

    if (mainPurchaseItems.length > 0) {
      rows.push(makeRow(["Products"]));
      rows.push(makeRow(["Photo", "Model", "Brand", "EAN", "Quantity"]));
      mainPurchaseItems.forEach((item) => {
        rows.push(
          [
            purchaseItemPhoto(item) ? "Photo available" : "No photo",
            purchaseItemModel(item),
            purchaseItemBrand(item),
            csvTextEan(item.ean || "-"),
            csvValue(item.quantityOrdered || 0),
          ].join(";")
        );
      });
      rows.push(["", "", "", csvValue("Total items quantity"), csvValue(watchUnits)].join(";"));
      rows.push("");
    }

    if (boxPurchaseItems.length > 0) {
      rows.push(makeRow(["Box"]));
      rows.push(makeRow(["Photo", "Model", "Brand", "EAN", "Quantity"]));
      boxPurchaseItems.forEach((item) => {
        rows.push(
          [
            purchaseItemPhoto(item) ? "Photo available" : "No photo",
            purchaseItemModel(item),
            purchaseItemBrand(item),
            csvTextEan(item.ean || "-"),
            csvValue(item.quantityOrdered || 0),
          ].join(";")
        );
      });
      rows.push(["", "", "", csvValue("Total box quantity"), csvValue(boxUnits)].join(";"));
      rows.push("");
    }

    rows.push(makeRow(["Summary"]));
    rows.push(makeRow(["Type", "Quantity"]));
    rows.push(makeRow(["Watch total quantity", watchUnits]));
    if (boxUnits > 0) rows.push(makeRow(["Box total quantity", boxUnits]));

    const csvContent = rows.join("\r\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${purchase.poNumber || "lista-compra"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function downloadPurchasePdf() {
    if (!purchase) return;
    const printWindow = window.open("", "_blank", "width=980,height=760");
    if (!printWindow) return;
    const watchUnits = mainPurchaseItems.reduce((sum, item) => sum + Number(item.quantityOrdered || 0), 0);
    const boxUnits = boxPurchaseItems.reduce((sum, item) => sum + Number(item.quantityOrdered || 0), 0);
    const formattedDate = purchase.orderedAt
      ? new Date(purchase.orderedAt).toLocaleDateString("es-ES", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }).replaceAll("/", " / ")
      : "-";

    const buildRow = (item: PurchaseDetail["items"][number]) => `
          <tr>
            <td class="photo-cell">
              ${
                purchaseItemPhoto(item)
                  ? `<img src="${purchaseItemPhoto(item)}" alt="${purchaseItemModel(item)}" class="item-photo" />`
                  : `<div class="photo-placeholder">No photo</div>`
              }
            </td>
            <td>${purchaseItemModel(item)}</td>
            <td>${purchaseItemBrand(item)}</td>
            <td>${item.ean || "-"}</td>
            <td class="qty-cell">${item.quantityOrdered || 0}</td>
          </tr>
        `;

    const watchRows = mainPurchaseItems
      .map(
        (item) => `
          ${buildRow(item)}
        `
      )
      .join("");

    const boxRows = boxPurchaseItems
      .map(
        (item) => `
          ${buildRow(item)}
        `
      )
      .join("");

    printWindow.document.write(`
      <html>
        <head>
          <title>${purchase.poNumber}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #141A39; }
            h1 { margin: 0; font-size: 28px; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; margin-bottom: 24px; }
            .meta-wrap { display: flex; gap: 14px; flex-wrap: nowrap; align-items: stretch; }
            .meta-card { width: 220px; border: 1px solid #D9DDE7; border-radius: 16px; padding: 14px 16px; background: #F7F8FB; box-sizing: border-box; }
            .meta-card--compact { width: 170px; }
            .meta-label { font-size: 12px; color: #616984; text-transform: uppercase; letter-spacing: 0.04em; }
            .meta-value { margin-top: 6px; font-size: 24px; font-weight: 700; color: #141A39; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; }
            th, td { border: 1px solid #D9DDE7; padding: 10px; text-align: left; }
            th { background: #F7F8FB; }
            .photo-cell { width: 110px; }
            .item-photo { width: 82px; height: 82px; object-fit: contain; display: block; margin: 0 auto; }
            .photo-placeholder { width: 82px; height: 82px; display: flex; align-items: center; justify-content: center; margin: 0 auto; border: 1px dashed #D4D9E4; border-radius: 14px; color: #8A91A8; font-size: 11px; }
            .qty-cell { font-weight: 700; text-align: center; }
            .total-row td { font-weight: 700; background: #F7F8FB; }
            .table-title { margin-top: 22px; margin-bottom: 8px; font-size: 16px; font-weight: 700; color: #141A39; text-transform: uppercase; letter-spacing: 0.04em; }
            .summary-table { width: 420px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${purchase.poNumber}</h1>
            <div class="meta-wrap">
              <div class="meta-card">
                <div class="meta-label">Date</div>
                <div class="meta-value">${formattedDate}</div>
              </div>
              <div class="meta-card meta-card--compact">
                <div class="meta-label">Total Items</div>
                <div class="meta-value">${watchUnits}</div>
              </div>
              ${
                boxUnits > 0
                  ? `
              <div class="meta-card meta-card--compact">
                <div class="meta-label">Total Box</div>
                <div class="meta-value">${boxUnits}</div>
              </div>
              `
                  : ""
              }
            </div>
          </div>
          ${
            watchRows
              ? `
          <div class="table-title">Products</div>
          <table>
            <thead>
              <tr>
                <th>Photo</th>
                <th>Model</th>
                <th>Brand</th>
                <th>EAN</th>
                <th>Quantity</th>
              </tr>
            </thead>
            <tbody>
              ${watchRows}
              <tr class="total-row">
                <td colspan="4">Total items quantity</td>
                <td class="qty-cell">${watchUnits}</td>
              </tr>
            </tbody>
          </table>
          `
              : ""
          }
          ${
            boxRows
              ? `
          <div class="table-title">Box</div>
          <table>
            <thead>
              <tr>
                <th>Photo</th>
                <th>Model</th>
                <th>Brand</th>
                <th>EAN</th>
                <th>Quantity</th>
              </tr>
            </thead>
            <tbody>
              ${boxRows}
              <tr class="total-row">
                <td colspan="4">Total box quantity</td>
                <td class="qty-cell">${boxUnits}</td>
              </tr>
            </tbody>
          </table>
          `
              : ""
          }
          <div class="table-title">Summary</div>
          <table class="summary-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Quantity</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Watch total quantity</td>
                <td class="qty-cell">${watchUnits}</td>
              </tr>
              ${
                boxUnits > 0
                  ? `
              <tr>
                <td>Box total quantity</td>
                <td class="qty-cell">${boxUnits}</td>
              </tr>
              `
                  : ""
              }
            </tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  const totalUnits = mainPurchaseItems.reduce((sum, item) => sum + Number(item.quantityOrdered || 0), 0);
  const totalBoxUnits = boxPurchaseItems.reduce((sum, item) => sum + Number(item.quantityOrdered || 0), 0);
  const effectiveStatus = status || purchase?.status || "";
  const isReviewStage = effectiveStatus === "review";
  const canMarkListComplete = effectiveStatus === "draft";
  const canSendToReview = effectiveStatus === "checklist";
  const isListComplete = [
    "checklist",
    "review",
    "sent",
    "priced",
    "paid",
    "preparing",
    "tracking_received",
    "in_transit",
    "received",
    "verified",
    "closed",
    "incident",
  ].includes(effectiveStatus);

  useEffect(() => {
    if (!boxChoiceStorageKey || typeof window === "undefined") return;
    const stored = window.localStorage.getItem(boxChoiceStorageKey);
    if (stored === "yes" || stored === "no") {
      setAddBoxChoice(stored);
    }
  }, [boxChoiceStorageKey]);

  useEffect(() => {
    if (!boxChoiceStorageKey || typeof window === "undefined") return;
    window.localStorage.setItem(boxChoiceStorageKey, addBoxChoice);
  }, [boxChoiceStorageKey, addBoxChoice]);

  useEffect(() => {
    if (addBoxChoice !== "yes") return;
    setLineSearch((current) => (current.trim() ? current : "box"));
    setLineTitle((current) => (current.trim() ? current : "box"));
    queueMicrotask(() => {
      lineSearchInputRef.current?.focus();
      lineSearchInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [addBoxChoice]);

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
        <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-[29px] leading-none text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>
              Detalle PO
            </h1>
            <p className="mt-1 text-[13px] text-[#616984]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
              {storeName ? `Tienda: ${storeName}` : "Seguimiento de orden de compra"}
            </p>
          </div>
          <Link
            href={effectiveStatus === "review" ? "/store/purchases#revision-compras" : "/store/purchases"}
            className="inline-flex h-11 items-center rounded-full border border-[#D4D9E4] bg-white px-4 text-[14px] text-[#25304F] shadow-[0_8px_20px_rgba(0,0,0,0.04)]"
            style={{ fontFamily: "var(--font-purchase-detail-body)" }}
          >
            ← Volver a {effectiveStatus === "review" ? "Revisión" : "Compras"}
          </Link>
        </div>

        <div id="lista-compra" className="overflow-hidden rounded-[32px] bg-white shadow-[0_16px_38px_rgba(0,0,0,0.08)]">
          <div className="grid gap-0 xl:grid-cols-[1.35fr_0.95fr]">
            <section className="bg-[linear-gradient(135deg,#101935_0%,#182451_52%,#22347A_100%)] px-8 py-8 text-white">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-[620px]">
                  <span className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[12px] tracking-[0.08em] text-white/85">
                    Pedido en seguimiento
                  </span>
                  <h2 className="mt-4 text-[46px] leading-[0.95] text-white" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>
                    {purchase?.poNumber || "-"}
                  </h2>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/12 bg-white/8 px-4 py-3 backdrop-blur-sm">
                      <div className="text-[12px] uppercase tracking-[0.08em] text-white/58">Proveedor</div>
                      <div className="mt-2 text-[24px] leading-none text-white" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>
                        {purchase?.supplier?.name || "-"}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/12 bg-white/8 px-4 py-3 backdrop-blur-sm">
                      <div className="text-[12px] uppercase tracking-[0.08em] text-white/58">Concepto</div>
                      <div className="mt-2 text-[18px] leading-snug text-white/92" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                        {purchase?.note || "Sin concepto definido"}
                      </div>
                    </div>
                  </div>
                  <p className="mt-5 max-w-[580px] text-[14px] leading-6 text-white/74" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                    Esta ficha resume el estado actual del PO, su contexto y las señales rápidas que necesitamos para seguir con compras, revisión, precios o envío.
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-white/12 bg-white/8 p-4 backdrop-blur-sm">
                  <div className="text-[12px] uppercase tracking-[0.08em] text-white/58">Items</div>
                  <div className="mt-2 text-[32px] leading-none text-white" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>
                    {totalUnits}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/12 bg-white/8 p-4 backdrop-blur-sm">
                  <div className="text-[12px] uppercase tracking-[0.08em] text-white/58">Box asociados</div>
                  <div className="mt-2 text-[32px] leading-none text-white" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>
                    {totalBoxUnits}
                  </div>
                </div>
              </div>
            </section>

            <section className="bg-[#FBFCFE] px-7 py-7">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.9fr)]">
                <div className="rounded-2xl border border-[#E7EBF3] bg-white p-5 shadow-[0_8px_24px_rgba(12,20,52,0.04)]">
                  <div className="text-[12px] uppercase tracking-[0.08em] text-[#8B92A8]">Estado actual</div>
                  <div className="mt-2 flex flex-wrap items-end gap-3">
                    <div className="text-[26px] leading-none text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>
                      {STATUS_LABELS[effectiveStatus || ""] || effectiveStatus || "-"}
                    </div>
                    <div className="pb-1 text-[13px] text-[#6B738C]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                      {effectiveStatus === "draft"
                        ? "El pedido sigue en construcción."
                        : effectiveStatus === "review"
                          ? "Pendiente de validación interna."
                          : "El pedido ya avanzó en el flujo."}
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-[#E7EBF3] bg-white p-5 shadow-[0_8px_24px_rgba(12,20,52,0.04)]">
                  <div className="text-[12px] uppercase tracking-[0.08em] text-[#8B92A8]">Fecha pedido</div>
                  <div className="mt-2 text-[18px] text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>
                    {formatDate(purchase?.orderedAt)}
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>

        {error ? <div className="bg-red-100 text-red-700 p-3 rounded">{error}</div> : null}
        {info ? <div className="bg-emerald-100 text-emerald-700 p-3 rounded">{info}</div> : null}

        <div className="rounded-2xl bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="relative">
              <div className="flex items-center gap-2">
                <h3 className="text-[20px] text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>
                  Agregar línea al PO
                </h3>
                <button
                  type="button"
                  aria-label="Información de agregar línea al PO"
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-[#D4D9E4] bg-white text-[14px] font-semibold text-[#616984] hover:bg-[#F7F9FC]"
                  onClick={() => setLineInfoOpen((value) => !value)}
                >
                  i
                </button>
              </div>
              <p className="mt-1 text-[13px] text-[#616984]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                Busca una referencia existente o escribe una nueva para ir construyendo este pedido.
              </p>
              {lineInfoOpen ? (
                <div className="absolute left-0 top-[calc(100%+10px)] z-20 w-[340px] rounded-2xl border border-[#D4D9E4] bg-white p-4 text-[13px] text-[#4F5568] shadow-[0_14px_32px_rgba(0,0,0,0.12)]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                  <div>Si existe en el catálogo, lo enlazamos aquí.</div>
                  <div className="mt-2">La cantidad inicial la puedes cambiar luego en la lista de compra.</div>
                  <div className="mt-2">Si pones 0 en cantidad, la línea se elimina del pedido.</div>
                </div>
              ) : null}
            </div>
          </div>

          <form className="rounded-2xl border border-[#E3E7F0] bg-[#F7F8FB] p-4" onSubmit={addPurchaseLine}>
            <div className="grid gap-3 md:grid-cols-[minmax(0,2.8fr)_0.9fr_auto]">
              <div className="relative">
                <input
                  ref={lineSearchInputRef}
                  className="h-11 w-full rounded-xl border border-[#D4D9E4] bg-white px-3 text-[14px] text-[#25304F] outline-none"
                  placeholder="Buscar o escribir producto: AR1925, AR2434, Reloj Maserati..."
                  value={lineSearch}
                  onChange={(e) => {
                    setLineSearch(e.target.value);
                    setLineProductId("");
                    setLineTitle(e.target.value);
                  }}
                />
                {productSuggestions.length > 0 ? (
                  <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 overflow-hidden rounded-2xl border border-[#D4D9E4] bg-white shadow-[0_12px_28px_rgba(0,0,0,0.12)]">
                    {productSuggestions.map((product) => (
                      <button
                        key={product.id}
                        type="button"
                        className="flex w-full items-start justify-between gap-3 border-b border-[#EEF1F6] px-3 py-2 text-left last:border-b-0 hover:bg-[#F7F9FC]"
                        onClick={() => selectSuggestion(product)}
                      >
                        <span>
                          <span className="block text-[14px] text-[#141A39]">
                            {purchaseSuggestionLabel(product)}
                          </span>
                          <span className="mt-0.5 block text-[12px] text-[#6E768E]">
                            {[product.brand, product.ean].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        <span className="rounded-full bg-[#E9F8EE] px-2 py-1 text-[11px] text-[#1F7A3E]">
                          Existe
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <input
                className="h-11 rounded-xl border border-[#D4D9E4] bg-white px-3 text-[14px] text-[#25304F] outline-none"
                type="number"
                min="1"
                placeholder="Cantidad"
                value={lineQty}
                onChange={(e) => setLineQty(e.target.value)}
              />

              <button className="h-11 rounded-xl bg-[#0B1230] px-5 text-[14px] text-white disabled:opacity-50" type="submit" disabled={busyAction === "add_line"}>
                {busyAction === "add_line" ? "..." : "Agregar"}
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-[#6E768E]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
              {lineSearch.trim() && !lineProductId && productSuggestions.length === 0 ? (
                <span className="rounded-full border border-[#FFD8A8] bg-[#FFF8EC] px-3 py-1 text-[#B54708]">
                  Nuevo: esta referencia no existe todavía en catálogo.
                </span>
              ) : null}
            </div>
          </form>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-[20px] text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>
                Lista de compra
              </h3>
              <p className="mt-1 text-[13px] text-[#616984]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                Aquí revisas el pedido, ajustas cantidades y dejas lista la base para exportarla al proveedor.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="rounded-full border border-[#D4D9E4] px-4 py-2 text-[12px] text-[#4F5568]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                {totalUnits} ítems
              </div>
              <button
                type="button"
                className={`rounded-full px-4 py-2 text-[12px] ${listEditMode ? "border border-[#0B1230] bg-[#0B1230] text-white" : "border border-[#D4D9E4] bg-white text-[#25304F]"}`}
                onClick={() => setListEditMode(true)}
              >
                Editar
              </button>
              <button
                type="button"
                className={`rounded-full px-4 py-2 text-[12px] ${!listEditMode ? "border border-[#0B1230] bg-[#0B1230] text-white" : "border border-[#D4D9E4] bg-white text-[#25304F]"}`}
                onClick={() => setListEditMode(false)}
              >
                Guardar
              </button>
            </div>
          </div>

          {mainPurchaseItems.length === 0 ? (
            <div className="rounded-2xl bg-[#F7F8FB] p-4 text-[14px] text-[#6E768E]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
              Aún no hay líneas en este pedido. Usa el bloque de arriba para empezar a construir la compra.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-[#E3E7F0]">
              <table className="min-w-full text-sm">
                <colgroup>
                  <col style={{ width: "140px" }} />
                  <col style={{ width: "220px" }} />
                  <col style={{ width: "180px" }} />
                  <col style={{ width: "190px" }} />
                  <col style={{ width: "170px" }} />
                  <col style={{ width: "130px" }} />
                  <col style={{ width: "170px" }} />
                </colgroup>
                <thead className="border-b border-[#D9DDE7] bg-[#F7F8FB]">
                  <tr>
                    <th className="px-3 py-3 text-left text-[13px] text-[#5F6780]">Foto</th>
                    <th className="px-3 py-3 text-left text-[13px] text-[#5F6780]">Modelo #</th>
                    <th className="px-3 py-3 text-left text-[13px] text-[#5F6780]">Marca</th>
                    <th className="px-3 py-3 text-left text-[13px] text-[#5F6780]">EAN</th>
                    <th className="px-3 py-3 text-left text-[13px] text-[#5F6780]">Cantidad</th>
                    <th className="px-3 py-3 text-left text-[13px] text-[#5F6780]">Catálogo</th>
                    <th className="px-3 py-3 text-left text-[13px] text-[#5F6780]">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {mainPurchaseItems.map((item) => {
                    const currentQty = Number(qtyDraftByItem[item.id] ?? item.quantityOrdered ?? 0);
                    const showDeleteAction = listEditMode && currentQty === 0;
                    return (
                    <tr key={`supplier-list-${item.id}`} className="border-b border-[#EEF1F6] last:border-b-0">
                      <td className="px-3 py-3">
                        {purchaseItemPhoto(item) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={purchaseItemPhoto(item) || ""}
                            alt={item.title}
                            className="h-20 w-20 rounded-2xl border border-[#E3E7F0] object-contain bg-white p-1"
                          />
                        ) : (
                          <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-dashed border-[#D4D9E4] bg-[#F9FAFC] text-[11px] text-[#8A91A8]">
                            Sin foto
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-[22px] font-semibold text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>
                        {purchaseItemModel(item)}
                      </td>
                      <td className="px-3 py-3 text-[14px] text-[#25304F]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                        {purchaseItemBrand(item)}
                      </td>
                      <td className="px-3 py-3 text-[14px] text-[#25304F]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                        {item.ean || "-"}
                      </td>
                      <td className="px-3 py-3">
                        {listEditMode ? (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="flex h-9 w-9 items-center justify-center rounded-full border border-[#D4D9E4] text-[#25304F] disabled:opacity-40"
                              disabled={busyAction === `qty_${item.id}`}
                              onClick={() => {
                                const current = Number(qtyDraftByItem[item.id] || item.quantityOrdered || 1);
                                const next = Math.max(0, current - 1);
                                setQtyDraftByItem((prev) => ({ ...prev, [item.id]: String(next) }));
                                void updatePurchaseLineQty(item.id, next);
                              }}
                            >
                              -
                            </button>
                            <input
                              className="h-10 w-16 rounded-xl border border-[#D4D9E4] px-2 text-center text-[16px] font-semibold text-[#141A39] outline-none"
                              value={qtyDraftByItem[item.id] ?? String(item.quantityOrdered)}
                              onChange={(e) =>
                                setQtyDraftByItem((prev) => ({
                                  ...prev,
                                  [item.id]: e.target.value.replace(/[^\d]/g, ""),
                                }))
                              }
                              onBlur={() => {
                                const rawValue = qtyDraftByItem[item.id];
                                const next = rawValue === "" ? item.quantityOrdered : Number(rawValue);
                                if (next >= 0 && next !== item.quantityOrdered) {
                                  void updatePurchaseLineQty(item.id, next);
                                }
                              }}
                            />
                            <button
                              type="button"
                              className="flex h-9 w-9 items-center justify-center rounded-full border border-[#D4D9E4] text-[#25304F] disabled:opacity-40"
                              disabled={busyAction === `qty_${item.id}`}
                              onClick={() => {
                                const current = Number(qtyDraftByItem[item.id] || item.quantityOrdered || 1);
                                const next = current + 1;
                                setQtyDraftByItem((prev) => ({ ...prev, [item.id]: String(next) }));
                                void updatePurchaseLineQty(item.id, next);
                              }}
                            >
                              +
                            </button>
                          </div>
                        ) : (
                          <div className="text-[24px] font-semibold text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>
                            {item.quantityOrdered}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {item.productId ? (
                          <span className="inline-flex rounded-full bg-[#E9F8EE] px-3 py-1 text-[12px] text-[#1F7A3E]">Existe</span>
                        ) : (
                          <span className="inline-flex rounded-full bg-[#FFF4E5] px-3 py-1 text-[12px] text-[#B54708]">Nuevo</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {showDeleteAction ? (
                          <button
                            type="button"
                            className="inline-flex rounded-full bg-[#B42318] px-3 py-2 text-[12px] text-white disabled:opacity-50"
                            disabled={busyAction === `qty_${item.id}`}
                            onClick={() => {
                              void updatePurchaseLineQty(item.id, 0);
                            }}
                          >
                            Eliminar
                          </button>
                        ) : item.productId ? (
                          <Link
                            href={`/store/products/${item.productId}`}
                            className="inline-flex rounded-full border border-[#D4D9E4] px-3 py-2 text-[12px] text-[#1D2647] hover:bg-[#F7F9FC]"
                          >
                            Ver producto
                          </Link>
                        ) : (
                          <Link
                            href={buildCreateProductHref(purchaseId, item)}
                            className="inline-flex rounded-full bg-[#0B1230] px-3 py-2 text-[12px] text-white"
                          >
                            Crear producto
                          </Link>
                        )}
                      </td>
                    </tr>
                  )})}
                  <tr className="bg-[#FBFCFE]">
                    <td colSpan={4} className="border-t border-[#D9DDE7] px-3 py-4 text-right text-[13px] text-[#5F6780]">
                      Total cantidad
                    </td>
                    <td className="border-t border-[#D9DDE7] px-3 py-4">
                      <div className="text-[24px] font-semibold text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>
                        {totalUnits}
                      </div>
                    </td>
                    <td colSpan={2} className="border-t border-[#D9DDE7] px-3 py-4">
                      <div className="flex flex-wrap items-center justify-end gap-3">
                        <span className="text-[13px] text-[#5F6780]">Agregar box?</span>
                        <div className="inline-flex rounded-full border border-[#D4D9E4] bg-white p-1">
                          <button
                            type="button"
                            className={`rounded-full px-3 py-1.5 text-[12px] transition ${
                              addBoxChoice === "yes" ? "bg-[#0B1230] text-white" : "text-[#25304F] hover:bg-[#F5F7FB]"
                            }`}
                            onClick={() => setAddBoxChoice("yes")}
                          >
                            Sí
                          </button>
                          <button
                            type="button"
                            className={`rounded-full px-3 py-1.5 text-[12px] transition ${
                              addBoxChoice === "no" ? "bg-[#0B1230] text-white" : "text-[#25304F] hover:bg-[#F5F7FB]"
                            }`}
                            onClick={() => setAddBoxChoice("no")}
                          >
                            No
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {addBoxChoice === "yes" || boxPurchaseItems.length > 0 ? (
            <div className="mt-5 overflow-x-auto rounded-2xl border border-[#E3E7F0]">
              <div className="border-b border-[#D9DDE7] bg-[#F7F8FB] px-4 py-3">
                <h4 className="text-[18px] text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>
                  Lista de box
                </h4>
              </div>
              {boxPurchaseItems.length === 0 ? (
                <div className="p-4 text-[14px] text-[#6E768E]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                  Aún no has agregado box a este pedido.
                </div>
              ) : (
                <table className="min-w-full text-sm">
                  <colgroup>
                    <col style={{ width: "140px" }} />
                    <col style={{ width: "220px" }} />
                    <col style={{ width: "180px" }} />
                    <col style={{ width: "190px" }} />
                    <col style={{ width: "170px" }} />
                    <col style={{ width: "130px" }} />
                    <col style={{ width: "170px" }} />
                  </colgroup>
                  <thead className="border-b border-[#D9DDE7] bg-[#F7F8FB]">
                    <tr>
                      <th className="px-3 py-3 text-left text-[13px] text-[#5F6780]">Foto</th>
                      <th className="px-3 py-3 text-left text-[13px] text-[#5F6780]">Modelo #</th>
                      <th className="px-3 py-3 text-left text-[13px] text-[#5F6780]">Marca</th>
                      <th className="px-3 py-3 text-left text-[13px] text-[#5F6780]">EAN</th>
                      <th className="px-3 py-3 text-left text-[13px] text-[#5F6780]">Cantidad</th>
                      <th className="px-3 py-3 text-left text-[13px] text-[#5F6780]">Catálogo</th>
                      <th className="px-3 py-3 text-left text-[13px] text-[#5F6780]">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {boxPurchaseItems.map((item) => {
                      const currentQty = Number(qtyDraftByItem[item.id] ?? item.quantityOrdered ?? 0);
                      const showDeleteAction = listEditMode && currentQty === 0;
                      return (
                        <tr key={`box-list-${item.id}`} className="border-b border-[#EEF1F6] last:border-b-0">
                          <td className="px-3 py-3">
                            {purchaseItemPhoto(item) ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={purchaseItemPhoto(item) || ""}
                                alt={item.title}
                                className="h-20 w-20 rounded-2xl border border-[#E3E7F0] object-contain bg-white p-1"
                              />
                            ) : (
                              <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-dashed border-[#D4D9E4] bg-[#F9FAFC] text-[11px] text-[#8A91A8]">
                                Sin foto
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-3 text-[22px] font-semibold text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>
                            {purchaseItemModel(item)}
                          </td>
                          <td className="px-3 py-3 text-[14px] text-[#25304F]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                            {purchaseItemBrand(item)}
                          </td>
                          <td className="px-3 py-3 text-[14px] text-[#25304F]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                            {item.ean || "-"}
                          </td>
                          <td className="px-3 py-3">
                            {listEditMode ? (
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  className="flex h-9 w-9 items-center justify-center rounded-full border border-[#D4D9E4] text-[#25304F] disabled:opacity-40"
                                  disabled={busyAction === `qty_${item.id}`}
                                  onClick={() => {
                                    const current = Number(qtyDraftByItem[item.id] || item.quantityOrdered || 1);
                                    const next = Math.max(0, current - 1);
                                    setQtyDraftByItem((prev) => ({ ...prev, [item.id]: String(next) }));
                                    void updatePurchaseLineQty(item.id, next);
                                  }}
                                >
                                  -
                                </button>
                                <input
                                  className="h-10 w-16 rounded-xl border border-[#D4D9E4] px-2 text-center text-[16px] font-semibold text-[#141A39] outline-none"
                                  value={qtyDraftByItem[item.id] ?? String(item.quantityOrdered)}
                                  onChange={(e) =>
                                    setQtyDraftByItem((prev) => ({
                                      ...prev,
                                      [item.id]: e.target.value.replace(/[^\d]/g, ""),
                                    }))
                                  }
                                  onBlur={() => {
                                    const rawValue = qtyDraftByItem[item.id];
                                    const next = rawValue === "" ? item.quantityOrdered : Number(rawValue);
                                    if (next >= 0 && next !== item.quantityOrdered) {
                                      void updatePurchaseLineQty(item.id, next);
                                    }
                                  }}
                                />
                                <button
                                  type="button"
                                  className="flex h-9 w-9 items-center justify-center rounded-full border border-[#D4D9E4] text-[#25304F] disabled:opacity-40"
                                  disabled={busyAction === `qty_${item.id}`}
                                  onClick={() => {
                                    const current = Number(qtyDraftByItem[item.id] || item.quantityOrdered || 1);
                                    const next = current + 1;
                                    setQtyDraftByItem((prev) => ({ ...prev, [item.id]: String(next) }));
                                    void updatePurchaseLineQty(item.id, next);
                                  }}
                                >
                                  +
                                </button>
                              </div>
                            ) : (
                              <div className="text-[24px] font-semibold text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>
                                {item.quantityOrdered}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            {item.productId ? (
                              <span className="inline-flex rounded-full bg-[#E9F8EE] px-3 py-1 text-[12px] text-[#1F7A3E]">Existe</span>
                            ) : (
                              <span className="inline-flex rounded-full bg-[#FFF4E5] px-3 py-1 text-[12px] text-[#B54708]">Nuevo</span>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            {showDeleteAction ? (
                              <button
                                type="button"
                                className="inline-flex rounded-full bg-[#B42318] px-3 py-2 text-[12px] text-white disabled:opacity-50"
                                disabled={busyAction === `qty_${item.id}`}
                                onClick={() => {
                                  void updatePurchaseLineQty(item.id, 0);
                                }}
                              >
                                Eliminar
                              </button>
                            ) : item.productId ? (
                              <Link
                                href={`/store/products/${item.productId}`}
                                className="inline-flex rounded-full border border-[#D4D9E4] px-3 py-2 text-[12px] text-[#1D2647] hover:bg-[#F7F9FC]"
                              >
                                Ver producto
                              </Link>
                            ) : (
                              <Link
                                href={buildCreateProductHref(purchaseId, item)}
                                className="inline-flex rounded-full bg-[#0B1230] px-3 py-2 text-[12px] text-white"
                              >
                                Crear producto
                              </Link>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="bg-[#FBFCFE]">
                      <td colSpan={4} className="border-t border-[#D9DDE7] px-3 py-4 text-right text-[13px] text-[#5F6780]">
                        Total box
                      </td>
                      <td className="border-t border-[#D9DDE7] px-3 py-4">
                        <div className="text-[24px] font-semibold text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>
                          {totalBoxUnits}
                        </div>
                      </td>
                      <td colSpan={2} className="border-t border-[#D9DDE7] px-3 py-4" />
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="text-[20px] text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>
                Lista completa
              </h3>
              <p className="mt-1 max-w-[720px] text-[13px] text-[#616984]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                Este es el paso intermedio entre construir la lista y mandarla a revisión. Cuando ya no quieras seguir agregando o corrigiendo líneas, marcas el pedido como Lista completa y recién después pasa a revisión.
              </p>
            </div>
            <div className="inline-flex rounded-full border border-[#D4D9E4] bg-[#F7F8FB] px-4 py-2 text-[12px] text-[#4F5568]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
              {isListComplete ? "Estado: Lista completa" : "Paso previo a revisión"}
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-[#E3E7F0] bg-[#FBFCFE] p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="grid gap-2 text-[13px] text-[#4F5568]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                <div className="inline-flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#E9EEFF] text-[#3147D4]">1</span>
                  <span>Termina la lista de compra y deja cantidades cerradas.</span>
                </div>
                <div className="inline-flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#E9EEFF] text-[#3147D4]">2</span>
                  <span>Marca el pedido como Lista completa.</span>
                </div>
                <div className="inline-flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#E9EEFF] text-[#3147D4]">3</span>
                  <span>Desde acciones del pedido ya podrás pasarlo a Revisión.</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {canMarkListComplete ? (
                  <button
                    type="button"
                    className="rounded-full bg-[#0B1230] px-4 py-2 text-[13px] text-white disabled:opacity-50"
                    onClick={markPurchaseListComplete}
                    disabled={busyAction === "list_complete"}
                  >
                    {busyAction === "list_complete" ? "..." : "Marcar como Lista completa"}
                  </button>
                ) : isReviewStage ? (
                  <span className="inline-flex rounded-full bg-[#EEF4FF] px-4 py-2 text-[12px] text-[#3147D4]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                    Ya pasó a revisión
                  </span>
                ) : isListComplete ? (
                  <span className="inline-flex rounded-full bg-[#E9F8EE] px-4 py-2 text-[12px] text-[#1F7A3E]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                    Lista completa confirmada
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="text-[20px] text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>
                Recepción de la compra
              </h3>
              <p className="mt-1 max-w-[720px] text-[13px] text-[#616984]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                Aquí dejamos preparado el almacén que recibirá el pedido y el siguiente paso operativo. Según esta recepción, el flujo cambia de revisión a entrada real de stock.
              </p>
            </div>
            <div className="inline-flex rounded-full border border-[#D4D9E4] bg-[#F7F8FB] px-4 py-2 text-[12px] text-[#4F5568]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
              {receiveWarehouseId ? "Recepción preparada" : "Pendiente de definir"}
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <div className="rounded-[24px] border border-[#E3E7F0] bg-[#FBFCFE] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[12px] uppercase tracking-[0.16em] text-[#8A91A8]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                    Almacén de entrada
                  </div>
                  <div className="mt-1 text-[18px] text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>
                    {receiveWarehouseId
                      ? warehouses.find((warehouse) => warehouse.id === receiveWarehouseId)
                        ? `${warehouses.find((warehouse) => warehouse.id === receiveWarehouseId)?.code} - ${warehouses.find((warehouse) => warehouse.id === receiveWarehouseId)?.name}`
                        : "Recepción preparada"
                      : "Selecciona dónde se recibirá la compra"}
                  </div>
                </div>
                <div className="inline-flex rounded-full bg-[#E9EEFF] px-3 py-1 text-[12px] text-[#3147D4]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                  Paso logístico
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <select
                  className="h-11 min-w-[280px] flex-1 rounded-full border border-[#D5DAE5] bg-white px-4 text-[14px] text-[#25304F] outline-none"
                  style={{ fontFamily: "var(--font-purchase-detail-body)" }}
                  value={receiveWarehouseId}
                  onChange={(e) => setReceiveWarehouseId(e.target.value)}
                >
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
            </div>

            <div className="rounded-[24px] border border-[#E3E7F0] bg-white p-4">
              <div className="text-[12px] uppercase tracking-[0.16em] text-[#8A91A8]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                Qué cambia después
              </div>
              <div className="mt-3 space-y-3 text-[13px] text-[#4F5568]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#E9F8EE] text-[12px] text-[#1F7A3E]">1</span>
                  <span>En revisión definimos si el pedido sigue adelante o vuelve a compras.</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#FFF4E5] text-[12px] text-[#B54708]">2</span>
                  <span>Al enviar al proveedor, este almacén queda como destino operativo para la recepción.</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#EEF4FF] text-[12px] text-[#3147D4]">3</span>
                  <span>Cuando llegue la compra, desde aquí ya podrás registrar las entradas reales al stock.</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
          <div className="mb-3">
            <h3 className="text-[20px] text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>
              {isReviewStage ? "Acciones de revisión" : "Acciones del pedido"}
            </h3>
            <p className="mt-1 text-[13px] text-[#616984]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
              {isReviewStage
                ? "En esta fase el pedido ya no se está construyendo. Aquí decidimos si vuelve a Compras para corregirse o si ya puede salir al proveedor."
                : canSendToReview
                  ? "La lista ya quedó completa. Ahora sí puedes descargarla y mandarla a revisión interna."
                  : "Primero deja cerrada la lista y márcala como Lista completa. Después se habilita el paso a Revisión."}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="rounded-full border border-[#D4D9E4] bg-white px-4 py-2 text-[13px] text-[#25304F] hover:bg-[#F7F9FC]"
              onClick={downloadPurchasePdf}
            >
              Descargar en PDF
            </button>
            <button
              type="button"
              className="rounded-full border border-[#D4D9E4] bg-white px-4 py-2 text-[13px] text-[#25304F] hover:bg-[#F7F9FC]"
              onClick={downloadPurchaseCsv}
            >
              Descargar Excel
            </button>
            {isReviewStage ? (
              <>
                <button
                  type="button"
                  className="rounded-full border border-[#D4D9E4] bg-white px-4 py-2 text-[13px] text-[#25304F] hover:bg-[#F7F9FC] disabled:opacity-50"
                  onClick={returnPurchaseToDraft}
                  disabled={busyAction === "return_draft"}
                >
                  {busyAction === "return_draft" ? "..." : "Devolver a Compras"}
                </button>
                <button
                  type="button"
                  className="rounded-full bg-[#0B1230] px-4 py-2 text-[13px] text-white disabled:opacity-50"
                  onClick={sendPurchaseToSupplier}
                  disabled={busyAction === "send_supplier"}
                >
                  {busyAction === "send_supplier" ? "..." : "Enviar al proveedor"}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="rounded-full bg-[#0B1230] px-4 py-2 text-[13px] text-white disabled:opacity-50"
                onClick={sendPurchaseReviewTask}
                disabled={busyAction === "review_task" || !permissions.tasksWrite || !canSendToReview}
              >
                {busyAction === "review_task" ? "..." : canSendToReview ? "Enviar a revisión" : "Primero: Lista completa"}
              </button>
            )}
          </div>
          {!permissions.tasksWrite && !isReviewStage ? (
            <div className="mt-3 text-[12px] text-[#8A91A8]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
              Tu usuario no tiene permiso para crear tareas de revisión.
            </div>
          ) : null}
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

        <div className="rounded-2xl bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
          <h3 className="mb-3 text-[20px] text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>Timeline de estado</h3>
          <div className="flex flex-wrap gap-2 mb-3">
            {STATUS_FLOW.map((step) => (
              <span
                key={step}
                className={`rounded-full px-3 py-2 text-[12px] border ${effectiveStatus === step ? "border-[#0B1230] bg-[#0B1230] text-white" : "border-[#D5DAE5] bg-[#F7F8FB] text-[#626A82]"}`}
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
          <h3 className="mb-3 text-[20px] text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>Detalle de recepción</h3>
          <p className="mb-4 text-[13px] text-[#616984]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
            Aquí ves cada línea pendiente y registras la entrada real cuando el pedido ya llegó al almacén elegido.
          </p>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-[#D9DDE7] bg-[#F7F8FB]">
                <tr>
                  <th className="text-left px-3 py-3 text-[13px] text-[#5F6780]">Item</th>
                  <th className="text-left px-3 py-3 text-[13px] text-[#5F6780]">EAN</th>
                  <th className="text-left px-3 py-3 text-[13px] text-[#5F6780]">Moneda</th>
                  <th className="text-left px-3 py-3 text-[13px] text-[#5F6780]">Costo unit.</th>
                  <th className="text-left px-3 py-3 text-[13px] text-[#5F6780]">Total EUR</th>
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
                      <td className="px-3 py-3 text-[#25304F]">{item.currencyCode}</td>
                      <td className="px-3 py-3 text-[#25304F]">{item.unitCostOriginal}</td>
                      <td className="px-3 py-3 text-[#25304F]">{formatMoney(item.totalCostEur)}</td>
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
