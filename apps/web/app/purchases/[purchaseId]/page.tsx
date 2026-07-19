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

const STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  review: "Revisión",
  sent: "Enviado al proveedor",
  priced: "Precios recibidos",
  paid: "Pagado",
  preparing: "Preparando",
  checklist: "Lista completa",
  tracking_received: "Tracking recibido",
  in_transit: "En tránsito",
  received: "Recibido",
  verified: "Verificado",
  closed: "Completado",
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

type PurchaseFlowMeta = {
  listCompletedAt?: string;
  reviewRequestedAt?: string;
  reviewApprovedAt?: string;
  supplierSentDate?: string;
  supplierReplyDate?: string;
  supplierFilesReady?: string[];
  supplierQuoteCurrency?: string;
  settlementCurrency?: string;
  paymentMethod?: string;
  supplierNotes?: string;
  supplierMissingItems?: string;
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

function purchaseStatusDescription(status: string, flowMeta?: PurchaseFlowMeta) {
  switch (String(status || "").toLowerCase()) {
    case "draft":
      return "El pedido sigue en construcción.";
    case "checklist":
      return "La lista quedó cerrada y ya puede pasar a revisión.";
    case "review":
      return flowMeta?.reviewApprovedAt ? "Aprobado internamente, listo para proveedor." : "Pendiente de validación interna.";
    case "sent":
      return "El pedido ya salió al proveedor.";
    case "priced":
      return "Ya llegaron los precios y toca validarlos.";
    case "paid":
      return "La compra quedó pagada y esperamos salida.";
    case "tracking_received":
      return "El proveedor ya compartió tracking.";
    case "in_transit":
      return "La mercancía está en tránsito.";
    case "received":
      return "La compra ya llegó al almacén.";
    case "closed":
      return "La compra quedó completada.";
    default:
      return "El pedido ya avanzó en el flujo.";
  }
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

function sanitizePurchaseFlowMeta(meta: PurchaseFlowMeta) {
  const nextMeta: PurchaseFlowMeta = { ...meta };
  for (const [key, value] of Object.entries(nextMeta)) {
    if (value == null) {
      delete nextMeta[key as keyof PurchaseFlowMeta];
      continue;
    }
    if (typeof value === "string" && !value.trim()) {
      delete nextMeta[key as keyof PurchaseFlowMeta];
      continue;
    }
    if (Array.isArray(value) && value.length === 0) {
      delete nextMeta[key as keyof PurchaseFlowMeta];
    }
  }
  return nextMeta;
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
  const [sendSupplierModalOpen, setSendSupplierModalOpen] = useState(false);
  const [supplierSentDate, setSupplierSentDate] = useState(new Date().toISOString().slice(0, 10));
  const [supplierPdfReady, setSupplierPdfReady] = useState(false);
  const [supplierExcelReady, setSupplierExcelReady] = useState(false);
  const [supplierOrderConfirmed, setSupplierOrderConfirmed] = useState(false);
  const [supplierReplyModalOpen, setSupplierReplyModalOpen] = useState(false);
  const [supplierReplyDate, setSupplierReplyDate] = useState(new Date().toISOString().slice(0, 10));
  const [supplierQuoteCurrency, setSupplierQuoteCurrency] = useState("CNY");
  const [settlementCurrency, setSettlementCurrency] = useState("EUR");
  const [plannedPaymentMethod, setPlannedPaymentMethod] = useState("Transferencia");
  const [supplierNotes, setSupplierNotes] = useState("");
  const [supplierMissingItems, setSupplierMissingItems] = useState("");
  const [purchaseFlowMeta, setPurchaseFlowMeta] = useState<PurchaseFlowMeta>({});
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

  const purchaseFlowStorageKey = useMemo(
    () => (storeId && purchaseId ? `purchase-flow:${storeId}:${purchaseId}` : ""),
    [storeId, purchaseId],
  );

  const savePurchaseFlowMeta = useCallback(
    (nextMeta: PurchaseFlowMeta) => {
      const sanitizedMeta = sanitizePurchaseFlowMeta(nextMeta);
      setPurchaseFlowMeta(sanitizedMeta);
      if (!purchaseFlowStorageKey || typeof window === "undefined") return;
      window.localStorage.setItem(purchaseFlowStorageKey, JSON.stringify(sanitizedMeta));
    },
    [purchaseFlowStorageKey],
  );

  useEffect(() => {
    if (!purchaseFlowStorageKey || typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(purchaseFlowStorageKey);
      if (!stored) return;
      const parsed = JSON.parse(stored) as PurchaseFlowMeta;
      setPurchaseFlowMeta(parsed || {});
      setSupplierQuoteCurrency(parsed?.supplierQuoteCurrency || "CNY");
      setSettlementCurrency(parsed?.settlementCurrency || "EUR");
      setPlannedPaymentMethod(parsed?.paymentMethod || "Transferencia");
      setSupplierNotes(parsed?.supplierNotes || "");
      setSupplierMissingItems(parsed?.supplierMissingItems || "");
    } catch {
      setPurchaseFlowMeta({});
    }
  }, [purchaseFlowStorageKey]);

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
      savePurchaseFlowMeta({
        ...purchaseFlowMeta,
        listCompletedAt: purchaseFlowMeta.listCompletedAt || new Date().toISOString().slice(0, 10),
        reviewRequestedAt: new Date().toISOString().slice(0, 10),
        reviewApprovedAt: undefined,
        supplierSentDate: undefined,
        supplierReplyDate: undefined,
        supplierFilesReady: undefined,
      });
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

      if (!permissions.tasksWrite) {
        setInfo("Pedido enviado a Revisión de compras");
        await loadAll(storeId, String(purchaseId));
        setStatus("review");
        setPurchase((prev) => (prev ? { ...prev, status: "review" } : prev));
        return;
      }

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
      await loadAll(storeId, String(purchaseId));
      setStatus("review");
      setPurchase((prev) => (prev ? { ...prev, status: "review" } : prev));
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
      savePurchaseFlowMeta({
        ...purchaseFlowMeta,
        listCompletedAt: new Date().toISOString().slice(0, 10),
        reviewRequestedAt: undefined,
        reviewApprovedAt: undefined,
        supplierSentDate: undefined,
        supplierReplyDate: undefined,
        supplierFilesReady: undefined,
      });
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
      await loadAll(storeId, String(purchaseId));
      setStatus("checklist");
      setPurchase((prev) => (prev ? { ...prev, status: "checklist" } : prev));
    } catch {
      setError("Connection error");
    } finally {
      setBusyAction("");
    }
  }

  async function updatePurchaseStatus(nextStatus: string, successMessage: string, busyKey: string) {
    const token = requireTokenOrRedirect();
    if (!token || !storeId || !purchaseId) return;
    setBusyAction(busyKey);
    setError("");
    setInfo("");
    try {
      const res = await fetch(`${API_BASE}/purchases/${purchaseId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ storeId, status: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo actualizar el estado del pedido");
        return;
      }
      setStatus(nextStatus);
      setPurchase((prev) => (prev ? { ...prev, status: nextStatus } : prev));
      setInfo(successMessage);
      await loadAll(storeId, String(purchaseId));
    } catch {
      setError("Connection error");
    } finally {
      setBusyAction("");
    }
  }

  function approvePurchaseReview() {
    setBusyAction("approve_review");
    setError("");
    setInfo("");
    try {
      savePurchaseFlowMeta({
        ...purchaseFlowMeta,
        listCompletedAt: purchaseFlowMeta.listCompletedAt || new Date().toISOString().slice(0, 10),
        reviewRequestedAt: purchaseFlowMeta.reviewRequestedAt || new Date().toISOString().slice(0, 10),
        reviewApprovedAt: new Date().toISOString().slice(0, 10),
      });
      setStatus("review");
      setPurchase((prev) => (prev ? { ...prev, status: "review" } : prev));
      setInfo("Revisión aprobada para proveedor");
    } catch {
      setError("No se pudo guardar la aprobación interna");
    } finally {
      setBusyAction("");
    }
  }

  function openSendSupplierModal() {
    if (!purchaseFlowMeta.reviewApprovedAt) {
      setError("Primero aprueba el pedido en Revisión antes de enviarlo al proveedor.");
      return;
    }
    setSupplierSentDate(purchaseFlowMeta.supplierSentDate || new Date().toISOString().slice(0, 10));
    setSupplierPdfReady(Boolean(purchaseFlowMeta.supplierFilesReady?.includes("pdf")));
    setSupplierExcelReady(Boolean(purchaseFlowMeta.supplierFilesReady?.includes("excel")));
    setSupplierOrderConfirmed(false);
    setSendSupplierModalOpen(true);
    setError("");
    setInfo("");
  }

  function closeSendSupplierModal() {
    if (busyAction === "send_supplier") return;
    setSendSupplierModalOpen(false);
  }

  async function sendPurchaseToSupplier() {
    const preparedFiles = [
      ...(supplierPdfReady ? ["pdf"] : []),
      ...(supplierExcelReady ? ["excel"] : []),
    ];
    savePurchaseFlowMeta({
      ...purchaseFlowMeta,
      listCompletedAt: purchaseFlowMeta.listCompletedAt || new Date().toISOString().slice(0, 10),
      reviewRequestedAt: purchaseFlowMeta.reviewRequestedAt || new Date().toISOString().slice(0, 10),
      reviewApprovedAt: purchaseFlowMeta.reviewApprovedAt || new Date().toISOString().slice(0, 10),
      supplierSentDate,
      supplierFilesReady: preparedFiles,
    });
    await updatePurchaseStatus(
      "sent",
      `Pedido marcado como enviado al proveedor el ${formatDate(supplierSentDate)}${supplierPdfReady || supplierExcelReady ? " con archivos preparados" : ""}`,
      "send_supplier"
    );
    setSendSupplierModalOpen(false);
  }

  function openSupplierReplyModal() {
    setSupplierReplyDate(purchaseFlowMeta.supplierReplyDate || new Date().toISOString().slice(0, 10));
    setSupplierReplyModalOpen(true);
    setError("");
    setInfo("");
  }

  function closeSupplierReplyModal() {
    if (busyAction === "priced") return;
    setSupplierReplyModalOpen(false);
  }

  async function markSupplierPricesReceived() {
    savePurchaseFlowMeta({
      ...purchaseFlowMeta,
      listCompletedAt: purchaseFlowMeta.listCompletedAt || new Date().toISOString().slice(0, 10),
      reviewRequestedAt: purchaseFlowMeta.reviewRequestedAt || new Date().toISOString().slice(0, 10),
      reviewApprovedAt: purchaseFlowMeta.reviewApprovedAt,
      supplierReplyDate,
    });
    await updatePurchaseStatus("priced", "El proveedor ya respondió y ahora toca revisar precios.", "priced");
    setSupplierReplyModalOpen(false);
  }

  function saveSupplierPricingReview() {
    savePurchaseFlowMeta({
      ...purchaseFlowMeta,
      listCompletedAt: purchaseFlowMeta.listCompletedAt,
      reviewRequestedAt: purchaseFlowMeta.reviewRequestedAt,
      reviewApprovedAt: purchaseFlowMeta.reviewApprovedAt,
      supplierSentDate: purchaseFlowMeta.supplierSentDate,
      supplierReplyDate: purchaseFlowMeta.supplierReplyDate,
      supplierFilesReady: purchaseFlowMeta.supplierFilesReady,
      supplierQuoteCurrency,
      settlementCurrency,
      paymentMethod: plannedPaymentMethod,
      supplierNotes,
      supplierMissingItems,
    });
    setInfo("Revisión de precios guardada");
    setError("");
  }

  async function markPurchasePaid() {
    await updatePurchaseStatus("paid", "La compra quedó marcada como pagada.", "paid");
  }

  async function markTrackingReceived() {
    await updatePurchaseStatus("tracking_received", "Tracking recibido. Ahora seguimos la llegada del pedido.", "tracking");
  }

  async function markPurchaseInTransit() {
    await updatePurchaseStatus("in_transit", "La compra quedó marcada en tránsito.", "in_transit");
  }

  async function markPurchaseArrived() {
    await updatePurchaseStatus("received", "La compra ya llegó y está lista para recepción en almacén.", "arrived");
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
      savePurchaseFlowMeta({});
      setStatus("draft");
      setPurchase((prev) => (prev ? { ...prev, status: "draft" } : prev));
      setInfo("Pedido devuelto a Compras para ajustes");
      await loadAll(storeId, String(purchaseId));
      setStatus("draft");
      setPurchase((prev) => (prev ? { ...prev, status: "draft" } : prev));
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
  const isReviewApproved = Boolean(purchaseFlowMeta.reviewApprovedAt);
  const rawEffectiveStatus = String(status || purchase?.status || "").toLowerCase();
  const hasChecklistEvidence = Boolean(purchaseFlowMeta.listCompletedAt) || rawEffectiveStatus === "checklist";
  const hasReviewEvidence = Boolean(purchaseFlowMeta.reviewRequestedAt) || rawEffectiveStatus === "review";
  const hasSupplierSentEvidence = Boolean(purchaseFlowMeta.supplierSentDate) || rawEffectiveStatus === "sent";
  const hasSupplierReplyEvidence = Boolean(purchaseFlowMeta.supplierReplyDate) || rawEffectiveStatus === "priced";
  const hasSupplierTrail = Boolean(purchaseFlowMeta.supplierSentDate || purchaseFlowMeta.supplierReplyDate);
  const hasTrackingEvidence = Boolean(purchase?.trackingCode || (purchase?.shipments3pl?.length || 0) > 0);
  const hasArrivalEvidence = Boolean((purchase?.items || []).some((item) => Number(item.quantityReceived || 0) > 0));
  const isRawArrivalStatus = ["received", "verified", "closed", "incident"].includes(rawEffectiveStatus);
  const isRawTrackingStatus = ["tracking_received", "in_transit"].includes(rawEffectiveStatus);
  const flowStageFromMeta = purchaseFlowMeta.supplierReplyDate
    ? "priced"
    : purchaseFlowMeta.supplierSentDate
      ? "sent"
      : purchaseFlowMeta.reviewRequestedAt
        ? "review"
        : purchaseFlowMeta.listCompletedAt
          ? "checklist"
          : "";
  const rawStatusNeedsSupplierTrail =
    (rawEffectiveStatus === "sent" && Boolean(purchaseFlowMeta.supplierSentDate)) ||
    (rawEffectiveStatus === "priced" && Boolean(purchaseFlowMeta.supplierReplyDate)) ||
    (rawEffectiveStatus === "paid" && Boolean(purchaseFlowMeta.supplierReplyDate || purchaseFlowMeta.supplierSentDate)) ||
    (isRawTrackingStatus && hasSupplierTrail) ||
    (isRawArrivalStatus && hasSupplierTrail);
  const effectiveStatus = (() => {
    if (purchaseFlowMeta.reviewRequestedAt && !purchaseFlowMeta.supplierSentDate && !purchaseFlowMeta.supplierReplyDate) {
      return "review";
    }

    if (purchaseFlowMeta.listCompletedAt && !purchaseFlowMeta.reviewRequestedAt && !purchaseFlowMeta.supplierSentDate && !purchaseFlowMeta.supplierReplyDate) {
      return "checklist";
    }

    if (purchaseFlowMeta.supplierReplyDate) {
      return rawEffectiveStatus === "paid" ? "paid" : "priced";
    }

    if (purchaseFlowMeta.supplierSentDate) {
      if (["closed", "verified", "incident", "received", "tracking_received", "in_transit"].includes(rawEffectiveStatus)) {
        return rawEffectiveStatus;
      }
      return "sent";
    }

    if (["closed", "verified", "incident"].includes(rawEffectiveStatus) && hasSupplierTrail) {
      return rawEffectiveStatus;
    }

    if (!hasSupplierTrail && hasReviewEvidence) {
      return "review";
    }

    if (!hasSupplierTrail && hasChecklistEvidence) {
      return "checklist";
    }

    if (flowStageFromMeta && !rawStatusNeedsSupplierTrail) {
      return flowStageFromMeta;
    }

    if (["sent", "priced", "paid"].includes(rawEffectiveStatus) && hasSupplierTrail) {
      return rawEffectiveStatus;
    }

    if (isRawTrackingStatus && hasSupplierTrail) {
      return rawEffectiveStatus;
    }

    if (rawEffectiveStatus === "received" && hasSupplierTrail) {
      return "received";
    }

    if (hasSupplierReplyEvidence) {
      return "priced";
    }

    if (hasSupplierSentEvidence) {
      return "sent";
    }

    if (hasReviewEvidence) {
      return "review";
    }

    if (hasChecklistEvidence) {
      return "checklist";
    }

    if (hasArrivalEvidence && hasSupplierTrail) {
      return "received";
    }

    if (hasTrackingEvidence && hasSupplierTrail) {
      return "tracking_received";
    }

    return "draft";
  })();
  const isDraftStage = effectiveStatus === "draft";
  const isChecklistStage = effectiveStatus === "checklist";
  const isBuildStage = isDraftStage || isChecklistStage;
  const isReviewStage = effectiveStatus === "review";
  const isSupplierStage = ["sent", "priced", "paid", "preparing", "tracking_received", "in_transit"].includes(effectiveStatus);
  const isArrivalStage = ["received", "verified", "closed", "incident"].includes(effectiveStatus);
  const isSupplierPricingStage = ["priced", "paid", "preparing", "tracking_received", "in_transit", "received", "verified", "closed", "incident"].includes(
    effectiveStatus,
  );
  const canEditSupplierReplyList = ["sent", "priced"].includes(effectiveStatus);
  const canEditPurchaseList = isBuildStage || canEditSupplierReplyList;
  const supplierResponseDays =
    purchaseFlowMeta.supplierSentDate && purchaseFlowMeta.supplierReplyDate
      ? Math.max(
          0,
          Math.round(
            (new Date(purchaseFlowMeta.supplierReplyDate).getTime() - new Date(purchaseFlowMeta.supplierSentDate).getTime()) / 86400000,
          ),
        )
      : null;
  const heroTrackingLabel =
    effectiveStatus === "draft"
      ? "Construyendo pedido"
      : effectiveStatus === "checklist"
        ? "Lista completa"
      : effectiveStatus === "review"
        ? "Pedido en revisión"
        : effectiveStatus === "sent"
          ? "Pedido enviado"
          : effectiveStatus === "priced"
            ? "Precios recibidos"
            : effectiveStatus === "paid"
              ? "Compra pagada"
              : effectiveStatus === "tracking_received"
                ? "Tracking recibido"
                : effectiveStatus === "in_transit"
                  ? "Pedido en tránsito"
                  : effectiveStatus === "received"
                    ? "Pedido recibido"
                    : "Pedido en seguimiento";
  const canMarkListComplete = isDraftStage;
  const canSendToReview = Boolean(
    (effectiveStatus === "checklist" ||
      (Boolean(purchaseFlowMeta.listCompletedAt) &&
        !purchaseFlowMeta.reviewRequestedAt &&
        !purchaseFlowMeta.supplierSentDate &&
        !purchaseFlowMeta.supplierReplyDate)) &&
      !busyAction,
  );
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
  const supplierPreparedFilesLabel =
    purchaseFlowMeta.supplierFilesReady && purchaseFlowMeta.supplierFilesReady.length > 0
      ? purchaseFlowMeta.supplierFilesReady.map((file) => file.toUpperCase()).join(" + ")
      : "Pendiente";

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

  useEffect(() => {
    if (!canEditPurchaseList && listEditMode) {
      setListEditMode(false);
    }
  }, [canEditPurchaseList, listEditMode]);

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
                    {heroTrackingLabel}
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
                        {purchaseStatusDescription(effectiveStatus, purchaseFlowMeta)}
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

        {canEditPurchaseList ? (
          <div className="rounded-2xl bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="relative">
                <div className="flex items-center gap-2">
                  <h3 className="text-[20px] text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>
                    {canEditSupplierReplyList ? "Ajustar lista según proveedor" : "Agregar línea al PO"}
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
                  {canEditSupplierReplyList
                    ? "Aquí ajustas faltantes, cambios de cantidad o sustituciones después de la respuesta del proveedor."
                    : "Busca una referencia existente o escribe una nueva para ir construyendo este pedido."}
                </p>
                {lineInfoOpen ? (
                  <div className="absolute left-0 top-[calc(100%+10px)] z-20 w-[340px] rounded-2xl border border-[#D4D9E4] bg-white p-4 text-[13px] text-[#4F5568] shadow-[0_14px_32px_rgba(0,0,0,0.12)]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                    <div>Si existe en el catálogo, lo enlazamos aquí.</div>
                    <div className="mt-2">La cantidad inicial la puedes cambiar luego en la lista de compra.</div>
                    <div className="mt-2">Si pones 0 en cantidad, la línea se elimina del pedido.</div>
                    {canEditSupplierReplyList ? <div className="mt-2">Si el proveedor responde con faltantes o cambios, ajusta aquí la lista antes de cerrar precios.</div> : null}
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
                    placeholder={canEditSupplierReplyList ? "Buscar producto para sumar, sustituir o corregir la respuesta del proveedor..." : "Buscar o escribir producto: AR1925, AR2434, Reloj Maserati..."}
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
        ) : (
          <div className="rounded-2xl border border-[#DDE4F0] bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.06)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-[20px] text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>
                  Construcción cerrada
                </h3>
                <p className="mt-1 max-w-[760px] text-[13px] text-[#616984]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                  Esta fase ya no edita líneas ni cantidades. La lista quedó cerrada para revisión interna y desde aquí solo decidimos si se aprueba, se devuelve a Compras o se prepara el envío al proveedor.
                </p>
              </div>
              <span className="inline-flex items-center rounded-full border border-[#D4D9E4] bg-[#F7F9FC] px-4 py-2 text-[12px] text-[#4F5568]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                {isReviewStage ? "Modo revisión" : "Construcción finalizada"}
              </span>
            </div>
          </div>
        )}

        <div className="rounded-2xl bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-[20px] text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>
                Lista de compra
              </h3>
              <p className="mt-1 text-[13px] text-[#616984]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                {effectiveStatus === "sent"
                  ? "Aquí ajustas la lista según la respuesta inicial del proveedor: faltantes, sustituciones o cantidades corregidas."
                  : effectiveStatus === "priced"
                    ? "Aquí dejas cerrada la lista final con la respuesta del proveedor antes de pasar al pago."
                    : "Aquí revisas el pedido, ajustas cantidades y dejas lista la base para exportarla al proveedor."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="rounded-full border border-[#D4D9E4] px-4 py-2 text-[12px] text-[#4F5568]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                {totalUnits} ítems
              </div>
              {canEditPurchaseList ? (
                <>
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
                </>
              ) : (
                <span className="inline-flex items-center rounded-full border border-[#D4D9E4] bg-[#F7F9FC] px-4 py-2 text-[12px] text-[#4F5568]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                  Lista bloqueada para revisión
                </span>
              )}
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
              {isReviewStage ? "Estado: En revisión" : isListComplete ? "Estado: Lista completa" : "Paso previo a revisión"}
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
                {isReviewStage
                  ? "Salida al proveedor"
                  : isSupplierStage
                    ? "Seguimiento con proveedor"
                    : isArrivalStage
                      ? "Recepción de la compra"
                      : "Recepción prevista"}
              </h3>
              <p className="mt-1 max-w-[720px] text-[13px] text-[#616984]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                {isReviewStage
                  ? "Este es el punto donde confirmamos que el pedido ya puede salir al proveedor. Aquí revisamos el archivo, la fecha de salida y dejamos claro el siguiente paso."
                  : isSupplierStage
                    ? "El pedido ya salió de la revisión interna. Ahora seguimos la respuesta del proveedor, la validación de precios, el pago y luego el tracking hasta que llegue la mercancía."
                    : isArrivalStage
                      ? "Aquí dejamos preparado el almacén que recibirá el pedido y el siguiente paso operativo. Según esta recepción, el flujo cambia de revisión a entrada real de stock."
                      : "Mientras cierras la lista, aquí solo dejamos preparado el almacén de entrada. Todavía no estamos recibiendo ni moviendo stock: solo ordenamos el siguiente paso."}
              </p>
            </div>
            <div className="inline-flex rounded-full border border-[#D4D9E4] bg-[#F7F8FB] px-4 py-2 text-[12px] text-[#4F5568]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
              {isReviewStage
                ? "Pendiente de salida"
                : isSupplierStage
                  ? "Proveedor en curso"
                  : isBuildStage
                    ? receiveWarehouseId
                      ? "Paso siguiente preparado"
                      : "Pendiente de definir"
                    : receiveWarehouseId
                      ? "Recepción preparada"
                      : "Pendiente de definir"}
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            {isReviewStage ? (
              <>
                <div className="rounded-[24px] border border-[#E3E7F0] bg-[#FBFCFE] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-[12px] uppercase tracking-[0.16em] text-[#8A91A8]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                        Próximo envío
                      </div>
                      <div className="mt-1 text-[18px] text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>
                        {purchase?.supplier?.name || "Proveedor sin definir"}
                      </div>
                    </div>
                    <div className="inline-flex rounded-full bg-[#FFF4E5] px-3 py-1 text-[12px] text-[#B54708]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                      {isReviewApproved ? "Listo para enviar" : "Pendiente de aprobar"}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="rounded-2xl border border-[#E3E7F0] bg-white p-4">
                      <div className="text-[12px] uppercase tracking-[0.16em] text-[#8A91A8]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                        Archivo sugerido
                      </div>
                      <div className="mt-2 text-[16px] text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>
                        PDF o Excel del pedido
                      </div>
                      <p className="mt-2 text-[13px] leading-6 text-[#616984]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                        Antes de enviarlo, conviene descargar al menos uno de los dos formatos para compartirlo con el proveedor.
                      </p>
                    </div>
                    <div className="rounded-2xl border border-[#E3E7F0] bg-white p-4">
                      <div className="text-[12px] uppercase tracking-[0.16em] text-[#8A91A8]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                        Fecha sugerida
                      </div>
                      <div className="mt-2 text-[16px] text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>
                        {isReviewApproved
                          ? formatDate(purchaseFlowMeta.reviewApprovedAt)
                          : "Aún sin aprobación"}
                      </div>
                      <p className="mt-2 text-[13px] leading-6 text-[#616984]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                        {isReviewApproved
                          ? "La aprobación interna ya quedó hecha. El siguiente paso es registrar la salida real al proveedor."
                          : "Primero aprobamos internamente el pedido. Después ya registramos la fecha real de salida al proveedor."}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-3">
                    {isReviewApproved ? (
                      <span className="inline-flex items-center rounded-full bg-[#E9F8EE] px-4 py-2 text-[12px] text-[#1F7A3E]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                        Aprobado el {formatDate(purchaseFlowMeta.reviewApprovedAt)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-[#FFF4E8] px-4 py-2 text-[12px] text-[#B45C00]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                        Pendiente de aprobación interna
                      </span>
                    )}
                    <span className="inline-flex items-center rounded-full bg-[#EEF2FF] px-4 py-2 text-[12px] text-[#3147D4]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                      {isReviewApproved
                        ? "El envío al proveedor ya puede hacerse desde Acciones de revisión"
                        : "El envío al proveedor se habilita justo después de aprobar la revisión"}
                    </span>
                  </div>
                </div>

                <div className="rounded-[24px] border border-[#E3E7F0] bg-white p-4">
                  <div className="text-[12px] uppercase tracking-[0.16em] text-[#8A91A8]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                    Qué cambia después
                  </div>
                  <div className="mt-3 space-y-3 text-[13px] text-[#4F5568]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#E9F8EE] text-[12px] text-[#1F7A3E]">1</span>
                      <span>Primero validamos la lista y dejamos constancia de que ya quedó aprobada internamente.</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#FFF4E5] text-[12px] text-[#B54708]">2</span>
                      <span>Después registramos la salida real al proveedor con fecha y con el PDF o Excel ya descargado.</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#EEF4FF] text-[12px] text-[#3147D4]">3</span>
                      <span>Más adelante, este mismo pedido seguirá con respuesta del proveedor, precios, pago, tracking y recepción real en almacén.</span>
                    </div>
                  </div>
                </div>
              </>
            ) : isSupplierStage ? (
              <>
                <div className="rounded-[24px] border border-[#E3E7F0] bg-[#FBFCFE] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-[12px] uppercase tracking-[0.16em] text-[#8A91A8]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                        Fase con proveedor
                      </div>
                      <div className="mt-1 text-[18px] text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>
                        {STATUS_LABELS[effectiveStatus] || effectiveStatus || "Seguimiento activo"}
                      </div>
                    </div>
                    <div className="inline-flex rounded-full bg-[#EEF2FF] px-3 py-1 text-[12px] text-[#3147D4]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                      Flujo comercial
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className={`rounded-2xl border px-4 py-4 ${effectiveStatus === "sent" ? "border-[#3147D4] bg-[#EEF2FF]" : "border-[#E3E7F0] bg-white"}`}>
                      <div className="text-[12px] uppercase tracking-[0.16em] text-[#8A91A8]">1. Envío hecho</div>
                      <div className="mt-2 text-[16px] text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>
                        {effectiveStatus === "sent" ? "Esperando respuesta" : "Completado"}
                      </div>
                      <p className="mt-2 text-[13px] leading-6 text-[#616984]">El pedido ya salió y ahora esperamos confirmación del proveedor.</p>
                      <div className="mt-3 text-[12px] text-[#4F5568]">
                        Fecha: {formatDate(purchaseFlowMeta.supplierSentDate)}
                      </div>
                    </div>
                    <div className={`rounded-2xl border px-4 py-4 ${effectiveStatus === "priced" ? "border-[#3147D4] bg-[#EEF2FF]" : "border-[#E3E7F0] bg-white"}`}>
                      <div className="text-[12px] uppercase tracking-[0.16em] text-[#8A91A8]">2. Precios</div>
                      <div className="mt-2 text-[16px] text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>
                        {effectiveStatus === "priced" ? "Pendiente de validar" : "Siguiente paso"}
                      </div>
                      <p className="mt-2 text-[13px] leading-6 text-[#616984]">Aquí registraremos la respuesta del proveedor con precios, faltantes o cambios.</p>
                      <div className="mt-3 text-[12px] text-[#4F5568]">
                        Respuesta: {formatDate(purchaseFlowMeta.supplierReplyDate)}
                      </div>
                    </div>
                    <div className={`rounded-2xl border px-4 py-4 ${effectiveStatus === "paid" ? "border-[#3147D4] bg-[#EEF2FF]" : "border-[#E3E7F0] bg-white"}`}>
                      <div className="text-[12px] uppercase tracking-[0.16em] text-[#8A91A8]">3. Pago</div>
                      <div className="mt-2 text-[16px] text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>
                        {effectiveStatus === "paid" ? "Pago confirmado" : "Pendiente"}
                      </div>
                      <p className="mt-2 text-[13px] leading-6 text-[#616984]">Una vez aprobados los precios, este pedido pasa al momento real de compra.</p>
                    </div>
                    <div className={`rounded-2xl border px-4 py-4 ${["tracking_received", "in_transit"].includes(effectiveStatus) ? "border-[#3147D4] bg-[#EEF2FF]" : "border-[#E3E7F0] bg-white"}`}>
                      <div className="text-[12px] uppercase tracking-[0.16em] text-[#8A91A8]">4. Tracking</div>
                      <div className="mt-2 text-[16px] text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>
                        {effectiveStatus === "tracking_received" ? "Tracking recibido" : effectiveStatus === "in_transit" ? "En tránsito" : "Pendiente"}
                      </div>
                      <p className="mt-2 text-[13px] leading-6 text-[#616984]">Después del pago, aquí seguimos el código de envío hasta la llegada al almacén.</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-[24px] border border-[#E3E7F0] bg-white p-4">
                  <div className="text-[12px] uppercase tracking-[0.16em] text-[#8A91A8]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                    Próxima acción sugerida
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className="rounded-2xl border border-[#E3E7F0] bg-[#FBFCFE] px-4 py-3">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-[#8A91A8]">Archivos preparados</div>
                      <div className="mt-1 text-[15px] text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>
                        {supplierPreparedFilesLabel}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-[#E3E7F0] bg-[#FBFCFE] px-4 py-3">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-[#8A91A8]">Tiempo de respuesta</div>
                      <div className="mt-1 text-[15px] text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>
                        {purchaseFlowMeta.supplierSentDate && purchaseFlowMeta.supplierReplyDate
                          ? `${Math.max(
                              0,
                              Math.round(
                                (new Date(purchaseFlowMeta.supplierReplyDate).getTime() - new Date(purchaseFlowMeta.supplierSentDate).getTime()) / 86400000,
                              ),
                            )} días`
                          : "Aún sin medir"}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 space-y-3 text-[13px] text-[#4F5568]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                    {effectiveStatus === "sent" ? (
                      <>
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#FFF4E5] text-[12px] text-[#B54708]">1</span>
                          <span>Esperar la respuesta del proveedor con disponibilidad y precios.</span>
                        </div>
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#EEF4FF] text-[12px] text-[#3147D4]">2</span>
                          <span>Cuando llegue esa respuesta, este pedido pasa a “Precios recibidos”.</span>
                        </div>
                      </>
                    ) : effectiveStatus === "priced" ? (
                      <>
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#E9F8EE] text-[12px] text-[#1F7A3E]">1</span>
                          <span>Revisar si los precios son correctos y si falta algún producto del pedido.</span>
                        </div>
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#FFF4E5] text-[12px] text-[#B54708]">2</span>
                          <span>Después de validar, el pedido ya puede marcarse como pagado.</span>
                        </div>
                      </>
                    ) : effectiveStatus === "paid" ? (
                      <>
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#E9F8EE] text-[12px] text-[#1F7A3E]">1</span>
                          <span>La compra ya quedó pagada. El siguiente paso es pedir o registrar el tracking.</span>
                        </div>
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#EEF4FF] text-[12px] text-[#3147D4]">2</span>
                          <span>Con el tracking empezamos la fase real de espera del paquete.</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#EEF4FF] text-[12px] text-[#3147D4]">1</span>
                          <span>Ya tenemos tracking. Ahora toca seguir el trayecto hasta que el pedido llegue físicamente.</span>
                        </div>
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#E9F8EE] text-[12px] text-[#1F7A3E]">2</span>
                          <span>Cuando llegue, lo pasaremos a recepción en almacén para revisar producto por producto.</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <>
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
              </>
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
          <div className="mb-3">
            <h3 className="text-[20px] text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>
              {isReviewStage ? "Acciones de revisión" : "Acciones del pedido"}
            </h3>
            <p className="mt-1 text-[13px] text-[#616984]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
              {isReviewStage
                ? "En esta fase el pedido ya no se construye. Aquí se valida, se puede devolver a Compras, aprobar o dejar listo para enviar al proveedor."
                : canSendToReview
                  ? "La lista ya quedó cerrada. Aquí termina la fase de creación del PO y ya puedes moverlo a Revisión de compras."
                  : isSupplierStage
                    ? "Aquí seguimos el avance real con el proveedor: respuesta, precios, pago, tracking y llegada al almacén."
                  : isArrivalStage
                      ? "El pedido ya entró en la fase de llegada y cierre. Aquí ya no hace falta volver a la revisión inicial."
                      : "Todavía estamos construyendo el PO. Primero cierra cantidades, confirma Lista completa y recién después se habilita Revisión."}
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
                  className={`rounded-full px-4 py-2 text-[13px] disabled:opacity-50 ${
                    isReviewApproved
                      ? "border border-[#BEE5CB] bg-[#E9F8EE] text-[#1F7A3E]"
                      : "border border-[#D4D9E4] bg-white text-[#25304F] hover:bg-[#F7F9FC]"
                  }`}
                  onClick={approvePurchaseReview}
                  disabled={busyAction === "approve_review"}
                >
                  {busyAction === "approve_review" ? "..." : isReviewApproved ? "Revisión aprobada" : "Aprobar revisión"}
                </button>
                <button
                  type="button"
                  className="rounded-full bg-[#0B1230] px-4 py-2 text-[13px] text-white disabled:opacity-50"
                  onClick={openSendSupplierModal}
                  disabled={busyAction === "send_supplier" || !isReviewApproved}
                >
                  {busyAction === "send_supplier" ? "..." : "Enviar al proveedor"}
                </button>
              </>
            ) : isSupplierStage ? (
              <>
                {effectiveStatus === "sent" ? (
                  <button
                    type="button"
                    className="rounded-full bg-[#0B1230] px-4 py-2 text-[13px] text-white disabled:opacity-50"
                    onClick={openSupplierReplyModal}
                    disabled={busyAction === "priced"}
                  >
                    {busyAction === "priced" ? "..." : "Registrar respuesta del proveedor"}
                  </button>
                ) : null}
                {effectiveStatus === "priced" ? (
                  <button
                    type="button"
                    className="rounded-full bg-[#0B1230] px-4 py-2 text-[13px] text-white disabled:opacity-50"
                    onClick={markPurchasePaid}
                    disabled={busyAction === "paid"}
                  >
                    {busyAction === "paid" ? "..." : "Marcar como pagado"}
                  </button>
                ) : null}
                {effectiveStatus === "paid" ? (
                  <button
                    type="button"
                    className="rounded-full bg-[#0B1230] px-4 py-2 text-[13px] text-white disabled:opacity-50"
                    onClick={markTrackingReceived}
                    disabled={busyAction === "tracking"}
                  >
                    {busyAction === "tracking" ? "..." : "Registrar tracking"}
                  </button>
                ) : null}
                {effectiveStatus === "tracking_received" ? (
                  <button
                    type="button"
                    className="rounded-full bg-[#0B1230] px-4 py-2 text-[13px] text-white disabled:opacity-50"
                    onClick={markPurchaseInTransit}
                    disabled={busyAction === "in_transit"}
                  >
                    {busyAction === "in_transit" ? "..." : "Marcar en tránsito"}
                  </button>
                ) : null}
                {effectiveStatus === "in_transit" ? (
                  <button
                    type="button"
                    className="rounded-full bg-[#0B1230] px-4 py-2 text-[13px] text-white disabled:opacity-50"
                    onClick={markPurchaseArrived}
                    disabled={busyAction === "arrived"}
                  >
                    {busyAction === "arrived" ? "..." : "Marcar llegada al almacén"}
                  </button>
                ) : null}
                <span className="inline-flex items-center rounded-full bg-[#EEF2FF] px-4 py-2 text-[12px] text-[#3147D4]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                  Estado actual: {STATUS_LABELS[effectiveStatus || ""] || effectiveStatus || "-"}
                </span>
              </>
            ) : (
              <button
                type="button"
                className="rounded-full bg-[#0B1230] px-4 py-2 text-[13px] text-white disabled:opacity-50"
                onClick={sendPurchaseReviewTask}
                disabled={busyAction === "review_task" || !canSendToReview}
              >
                {busyAction === "review_task"
                  ? "..."
                  : canSendToReview
                    ? "Enviar a Revisión de compras"
                    : effectiveStatus === "draft"
                      ? "Primero: Lista completa"
                      : effectiveStatus === "review"
                        ? "Ya está en Revisión"
                        : `Estado: ${STATUS_LABELS[effectiveStatus || ""] || effectiveStatus || "-"}`}
              </button>
            )}
          </div>
        </div>

        {isSupplierStage || isArrivalStage ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <div className="rounded-2xl bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-[20px] text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>
                    Respuesta y revisión de precios
                  </h3>
                  <p className="mt-1 max-w-[720px] text-[13px] text-[#616984]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                    Aquí dejamos trazado cuándo salió el pedido, cuándo respondió el proveedor y en qué moneda vamos a revisar y cerrar la compra antes del pago.
                  </p>
                </div>
                <span
                  className={`inline-flex rounded-full px-4 py-2 text-[12px] ${
                    isSupplierPricingStage ? "bg-[#EEF2FF] text-[#3147D4]" : "bg-[#FFF4E5] text-[#B54708]"
                  }`}
                  style={{ fontFamily: "var(--font-purchase-detail-body)" }}
                >
                  {isSupplierPricingStage ? "Precios en revisión" : "Esperando respuesta"}
                </span>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-[#E3E7F0] bg-[#FBFCFE] p-4">
                  <div className="text-[12px] uppercase tracking-[0.16em] text-[#8A91A8]">Enviado</div>
                  <div className="mt-2 text-[18px] text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>
                    {formatDate(purchaseFlowMeta.supplierSentDate)}
                  </div>
                  <p className="mt-2 text-[12px] leading-5 text-[#616984]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                    Fecha real en la que el pedido salió del equipo al proveedor.
                  </p>
                </div>
                <div className="rounded-2xl border border-[#E3E7F0] bg-[#FBFCFE] p-4">
                  <div className="text-[12px] uppercase tracking-[0.16em] text-[#8A91A8]">Respuesta</div>
                  <div className="mt-2 text-[18px] text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>
                    {formatDate(purchaseFlowMeta.supplierReplyDate)}
                  </div>
                  <p className="mt-2 text-[12px] leading-5 text-[#616984]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                    La usamos para medir tiempos y saber cuándo arrancó la revisión de precios.
                  </p>
                </div>
                <div className="rounded-2xl border border-[#E3E7F0] bg-[#FBFCFE] p-4">
                  <div className="text-[12px] uppercase tracking-[0.16em] text-[#8A91A8]">Moneda proveedor</div>
                  <div className="mt-2 text-[18px] text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>
                    {supplierQuoteCurrency || "-"}
                  </div>
                  <p className="mt-2 text-[12px] leading-5 text-[#616984]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                    La moneda en la que realmente nos pasan la cotización.
                  </p>
                </div>
                <div className="rounded-2xl border border-[#E3E7F0] bg-[#FBFCFE] p-4">
                  <div className="text-[12px] uppercase tracking-[0.16em] text-[#8A91A8]">Tiempo de respuesta</div>
                  <div className="mt-2 text-[18px] text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>
                    {supplierResponseDays != null ? `${supplierResponseDays} días` : "Pendiente"}
                  </div>
                  <p className="mt-2 text-[12px] leading-5 text-[#616984]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                    Este dato nos ayuda a entender cuánto tarda cada proveedor en responder.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
              <div className="mb-3">
                <h3 className="text-[20px] text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>
                  Base para pago y validación
                </h3>
                <p className="mt-1 text-[13px] text-[#616984]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                  Guardamos aquí la moneda recibida, la moneda final de pago y cualquier faltante o nota del proveedor antes de seguir.
                </p>
              </div>

              <div className="grid gap-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-[13px] text-[#616984]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                      Moneda de la cotización
                    </span>
                    <input
                      value={supplierQuoteCurrency}
                      onChange={(e) => setSupplierQuoteCurrency(e.target.value.toUpperCase())}
                      placeholder="CNY / USD / EUR"
                      className="h-11 w-full rounded-xl border border-[#D4D9E4] bg-white px-4 text-[14px] text-[#141A39] outline-none focus:border-[#3147D4]"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-[13px] text-[#616984]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                      Moneda final de pago
                    </span>
                    <input
                      value={settlementCurrency}
                      onChange={(e) => setSettlementCurrency(e.target.value.toUpperCase())}
                      placeholder="EUR / USD"
                      className="h-11 w-full rounded-xl border border-[#D4D9E4] bg-white px-4 text-[14px] text-[#141A39] outline-none focus:border-[#3147D4]"
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="mb-2 block text-[13px] text-[#616984]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                    Tipo de pago previsto
                  </span>
                  <select
                    value={plannedPaymentMethod}
                    onChange={(e) => setPlannedPaymentMethod(e.target.value)}
                    className="h-11 w-full rounded-xl border border-[#D4D9E4] bg-white px-4 text-[14px] text-[#141A39] outline-none focus:border-[#3147D4]"
                  >
                    <option value="Transferencia">Transferencia</option>
                    <option value="Tarjeta">Tarjeta</option>
                    <option value="PayPal">PayPal</option>
                    <option value="Wise">Wise</option>
                    <option value="Otro">Otro</option>
                  </select>
                </label>

                <label className="block">
                  <span className="mb-2 block text-[13px] text-[#616984]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                    Productos faltantes o cambios del proveedor
                  </span>
                  <textarea
                    value={supplierMissingItems}
                    onChange={(e) => setSupplierMissingItems(e.target.value)}
                    rows={3}
                    placeholder="Ejemplo: AR2460 sin stock / AR11360 cambia de color / box no disponible..."
                    className="w-full rounded-2xl border border-[#D4D9E4] bg-white px-4 py-3 text-[14px] text-[#141A39] outline-none focus:border-[#3147D4]"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-[13px] text-[#616984]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                    Notas de revisión
                  </span>
                  <textarea
                    value={supplierNotes}
                    onChange={(e) => setSupplierNotes(e.target.value)}
                    rows={4}
                    placeholder="Aquí puedes guardar observaciones sobre precio, respuesta, tiempos o condiciones del proveedor."
                    className="w-full rounded-2xl border border-[#D4D9E4] bg-white px-4 py-3 text-[14px] text-[#141A39] outline-none focus:border-[#3147D4]"
                  />
                </label>

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E3E7F0] bg-[#FBFCFE] px-4 py-3">
                  <div className="text-[13px] text-[#616984]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                    Guarda aquí la base antes de pasar a pago. Así no perdemos moneda, método ni faltantes.
                  </div>
                  <button
                    type="button"
                    className="rounded-full bg-[#0B1230] px-4 py-2 text-[13px] text-white"
                    onClick={saveSupplierPricingReview}
                  >
                    Guardar revisión
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

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

        {isArrivalStage ? (
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
        ) : null}

        {isSupplierStage || isArrivalStage ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-2xl bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
              <h3 className="mb-1 text-[20px] text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>Pago de la compra</h3>
              <p className="mb-4 text-[13px] text-[#616984]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                Aquí registramos cómo se pagó el pedido, en qué moneda y qué tipo de cambio usamos para llevarlo a EUR.
              </p>
              <form className="grid grid-cols-1 gap-2 md:grid-cols-5 mb-4" onSubmit={createPayment}>
                <input className="h-11 rounded-full border border-[#D5DAE5] px-4 text-[14px] text-[#25304F] outline-none" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
                <input className="h-11 rounded-full border border-[#D5DAE5] px-4 text-[14px] text-[#25304F] outline-none" placeholder="Moneda: EUR, USD, CNY..." value={paymentCurrency} onChange={(e) => setPaymentCurrency(e.target.value)} />
                <input className="h-11 rounded-full border border-[#D5DAE5] px-4 text-[14px] text-[#25304F] outline-none" placeholder="Importe original" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} />
                <input className="h-11 rounded-full border border-[#D5DAE5] px-4 text-[14px] text-[#25304F] outline-none" placeholder="FX a EUR" value={paymentFx} onChange={(e) => setPaymentFx(e.target.value)} />
                <button className="h-11 rounded-full bg-[#0B1230] px-4 text-[13px] text-white disabled:opacity-50" style={{ fontFamily: "var(--font-purchase-detail-heading)" }} type="submit" disabled={busyAction === "payment"}>
                  {busyAction === "payment" ? "..." : "Agregar pago"}
                </button>
              </form>
              <div className="space-y-2 text-[14px]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                {(purchase?.payments || []).length === 0 ? (
                  <div className="rounded-2xl bg-[#F7F8FB] p-4 text-[#6E768E]">Aún no hay pagos registrados para esta compra.</div>
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
              <h3 className="mb-1 text-[20px] text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>Tracking y logística</h3>
              <p className="mb-4 text-[13px] text-[#616984]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                Este bloque nos sirve para guardar el embarque, el proveedor logístico y los tramos hasta que la compra llegue al almacén.
              </p>
              <form className="grid grid-cols-1 gap-2 md:grid-cols-3 mb-3" onSubmit={createShipment}>
                <input className="h-11 rounded-full border border-[#D5DAE5] px-4 text-[14px] text-[#25304F] outline-none" placeholder="Referencia 3PL / tracking base" value={shipmentRef} onChange={(e) => setShipmentRef(e.target.value)} />
                <input className="h-11 rounded-full border border-[#D5DAE5] px-4 text-[14px] text-[#25304F] outline-none" placeholder="Proveedor logístico" value={shipmentProvider} onChange={(e) => setShipmentProvider(e.target.value)} />
                <button className="h-11 rounded-full bg-[#0B1230] px-4 text-[13px] text-white disabled:opacity-50" style={{ fontFamily: "var(--font-purchase-detail-heading)" }} type="submit" disabled={busyAction === "shipment"}>
                  {busyAction === "shipment" ? "..." : "Crear embarque"}
                </button>
              </form>
              <form className="grid grid-cols-1 gap-2 md:grid-cols-4 xl:grid-cols-8 mb-3" onSubmit={createLeg}>
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
                  <div className="rounded-2xl bg-[#F7F8FB] p-4 text-[#6E768E]">Aún no hay tracking ni embarques logísticos registrados.</div>
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
        ) : null}
      </div>

      {sendSupplierModalOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[rgba(11,18,48,0.45)] px-4">
          <div className="w-full max-w-[560px] rounded-[28px] bg-white p-6 shadow-[0_24px_60px_rgba(11,18,48,0.28)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-[26px] text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>
                  Enviar al proveedor
                </h3>
                <p className="mt-2 text-[14px] leading-6 text-[#616984]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                  Antes de cerrar este paso, deja registrada la fecha de envío y confirma que ya preparaste el archivo que le mandarás al proveedor.
                </p>
              </div>
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#D4D9E4] text-[18px] text-[#616984] hover:bg-[#F7F9FC]"
                onClick={closeSendSupplierModal}
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>

            <div className="mt-5 rounded-2xl border border-[#E3E7F0] bg-[#F8FAFD] p-4">
              <div className="text-[12px] uppercase tracking-[0.16em] text-[#8A91A8]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                Recordatorio
              </div>
              <p className="mt-2 text-[14px] text-[#25304F]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                No te olvides de descargar el pedido en PDF o Excel antes de enviarlo. Este paso mueve el pedido desde <strong>Revisión</strong> a <strong>Enviado al proveedor</strong>.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  className="rounded-full border border-[#D4D9E4] bg-white px-4 py-2 text-[13px] text-[#25304F] hover:bg-[#F2F5FB]"
                  onClick={() => {
                    downloadPurchasePdf();
                    setSupplierPdfReady(true);
                  }}
                >
                  Descargar PDF ahora
                </button>
                <button
                  type="button"
                  className="rounded-full border border-[#D4D9E4] bg-white px-4 py-2 text-[13px] text-[#25304F] hover:bg-[#F2F5FB]"
                  onClick={() => {
                    downloadPurchaseCsv();
                    setSupplierExcelReady(true);
                  }}
                >
                  Descargar Excel ahora
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-[13px] text-[#616984]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                  Fecha de envío
                </span>
                <input
                  type="date"
                  value={supplierSentDate}
                  onChange={(e) => setSupplierSentDate(e.target.value)}
                  className="h-12 w-full rounded-xl border border-[#D4D9E4] bg-white px-4 text-[15px] text-[#141A39] outline-none focus:border-[#3147D4]"
                />
                <span className="mt-2 block text-[12px] leading-5 text-[#7A8196]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                  Esta fecha quedará guardada como salida al proveedor y marcará desde cuándo esperamos su respuesta.
                </span>
              </label>
              <div className="rounded-2xl border border-[#E3E7F0] bg-white px-4 py-3">
                <div className="text-[12px] uppercase tracking-[0.16em] text-[#8A91A8]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                  Resumen
                </div>
                <div className="mt-2 text-[15px] text-[#25304F]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                  {purchase?.poNumber || "-"}
                </div>
                <div className="mt-1 text-[13px] text-[#616984]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                  Proveedor: {purchase?.supplier?.name || "-"}
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-3 rounded-2xl border border-[#E3E7F0] bg-white p-4">
              <label className="flex items-center gap-3 text-[14px] text-[#25304F]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                <input
                  type="checkbox"
                  checked={supplierPdfReady}
                  onChange={(e) => setSupplierPdfReady(e.target.checked)}
                  className="h-4 w-4 rounded border-[#C8CEDD]"
                />
                PDF descargado o preparado para enviar
              </label>
              <label className="flex items-center gap-3 text-[14px] text-[#25304F]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                <input
                  type="checkbox"
                  checked={supplierExcelReady}
                  onChange={(e) => setSupplierExcelReady(e.target.checked)}
                  className="h-4 w-4 rounded border-[#C8CEDD]"
                />
                Excel descargado o preparado para enviar
              </label>
              <label className="flex items-center gap-3 text-[14px] text-[#25304F]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                <input
                  type="checkbox"
                  checked={supplierOrderConfirmed}
                  onChange={(e) => setSupplierOrderConfirmed(e.target.checked)}
                  className="h-4 w-4 rounded border-[#C8CEDD]"
                />
                Confirmo que el pedido ya está listo para salir al proveedor
              </label>
              <p className="pt-1 text-[12px] leading-5 text-[#7A8196]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                Puedes dejar marcado PDF, Excel o ambos, según el archivo que realmente vayas a compartir con el proveedor.
              </p>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                className="rounded-full border border-[#D4D9E4] bg-white px-5 py-2.5 text-[14px] text-[#25304F] hover:bg-[#F7F9FC]"
                onClick={closeSendSupplierModal}
                disabled={busyAction === "send_supplier"}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="rounded-full bg-[#0B1230] px-5 py-2.5 text-[14px] text-white disabled:opacity-50"
                onClick={sendPurchaseToSupplier}
                disabled={busyAction === "send_supplier" || !supplierSentDate || !supplierOrderConfirmed || (!supplierPdfReady && !supplierExcelReady)}
              >
                {busyAction === "send_supplier" ? "Enviando..." : "Confirmar envío"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {supplierReplyModalOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[rgba(11,18,48,0.45)] px-4">
          <div className="w-full max-w-[560px] rounded-[28px] bg-white p-6 shadow-[0_24px_60px_rgba(11,18,48,0.28)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-[26px] text-[#141A39]" style={{ fontFamily: "var(--font-purchase-detail-heading)" }}>
                  Respuesta del proveedor
                </h3>
                <p className="mt-2 text-[14px] leading-6 text-[#616984]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                  Registra la fecha en la que el proveedor respondió. Después de este paso, el pedido pasará a <strong>Precios recibidos</strong>.
                </p>
              </div>
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#D4D9E4] text-[18px] text-[#616984] hover:bg-[#F7F9FC]"
                onClick={closeSupplierReplyModal}
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-[13px] text-[#616984]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                  Fecha de respuesta
                </span>
                <input
                  type="date"
                  value={supplierReplyDate}
                  onChange={(e) => setSupplierReplyDate(e.target.value)}
                  className="h-12 w-full rounded-xl border border-[#D4D9E4] bg-white px-4 text-[15px] text-[#141A39] outline-none focus:border-[#3147D4]"
                />
              </label>
              <div className="rounded-2xl border border-[#E3E7F0] bg-white px-4 py-3">
                <div className="text-[12px] uppercase tracking-[0.16em] text-[#8A91A8]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                  Referencia
                </div>
                <div className="mt-2 text-[15px] text-[#25304F]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                  {purchase?.poNumber || "-"}
                </div>
                <div className="mt-1 text-[13px] text-[#616984]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                  Enviado: {formatDate(purchaseFlowMeta.supplierSentDate)}
                </div>
                <div className="mt-1 text-[13px] text-[#616984]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                  Tiempo estimado: {purchaseFlowMeta.supplierSentDate && supplierReplyDate
                    ? `${Math.max(
                        0,
                        Math.round(
                          (new Date(supplierReplyDate).getTime() - new Date(purchaseFlowMeta.supplierSentDate).getTime()) / 86400000,
                        ),
                      )} días`
                    : "Pendiente"}
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-[#E3E7F0] bg-[#F8FAFD] p-4">
              <div className="text-[12px] uppercase tracking-[0.16em] text-[#8A91A8]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                Siguiente tramo
              </div>
              <p className="mt-2 text-[14px] text-[#25304F]" style={{ fontFamily: "var(--font-purchase-detail-body)" }}>
                Después de confirmar esta fecha, seguiremos con la revisión de precios, faltantes y moneda de compra antes de pasar al pago.
              </p>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                className="rounded-full border border-[#D4D9E4] bg-white px-5 py-2.5 text-[14px] text-[#25304F] hover:bg-[#F7F9FC]"
                onClick={closeSupplierReplyModal}
                disabled={busyAction === "priced"}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="rounded-full bg-[#0B1230] px-5 py-2.5 text-[14px] text-white disabled:opacity-50"
                onClick={markSupplierPricesReceived}
                disabled={busyAction === "priced" || !supplierReplyDate}
              >
                {busyAction === "priced" ? "Guardando..." : "Pasar a precios recibidos"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
