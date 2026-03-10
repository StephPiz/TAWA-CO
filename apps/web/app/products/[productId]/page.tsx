"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import localFont from "next/font/local";
import { requireTokenOrRedirect } from "../../lib/auth";

const API_BASE = "http://localhost:3001";
const headingFont = localFont({
  src: "../../fonts/HFHySans_Black.ttf",
  variable: "--font-product-detail-heading",
});
const bodyFont = localFont({
  src: "../../fonts/HFHySans_Regular.ttf",
  variable: "--font-product-detail-body",
});

type ProductPayload = {
  id: string;
  ean: string;
  sku: string | null;
  type: string;
  brand: string;
  model: string;
  name: string;
  status: string;
  internalDescription: string | null;
  modelRef?: string | null;
  category?: string | null;
  attributes?: Record<string, unknown> | null;
  mainImageUrl: string | null;
  images: { id: string; imageUrl: string; isPrimary: boolean; sortOrder: number }[];
  eanAliases: { id: string; ean: string; source: string }[];
  listings: {
    id: string;
    listingStatus: string;
    publicName: string | null;
    listingUrl: string | null;
    priceOriginal: string | null;
    priceCurrencyCode: string | null;
    priceEurFrozen?: string | null;
    channelEan?: string | null;
    channel: { id: string; name: string; code: string };
  }[];
  texts: { id: string; locale: string; publicName: string; description: string | null; channelId: string | null }[];
  channelLinks: {
    id: string;
    productUrl: string | null;
    externalProductId: string | null;
    status: string;
    salesChannel: { id: string; name: string; code: string };
  }[];
  channelPrices: {
    id: string;
    priceAmount: string;
    currencyCode: string;
    effectiveFrom: string | null;
    salesChannel: { id: string; name: string; code: string };
  }[];
  lots: {
    id: string;
    lotCode: string;
    sourceType?: string | null;
    purchasedAt?: string | null;
    receivedAt?: string | null;
    quantityAvailable: number;
    quantityReceived: number;
    status: string;
    unitCostEurFrozen?: number;
    warehouse: { code: string; name: string };
    location?: { id: string; code: string; name: string | null } | null;
  }[];
  movements: {
    id: string;
    movementType: string;
    quantity: number;
    createdAt: string;
    reason?: string | null;
    referenceType?: string | null;
    warehouse: { code: string };
    location?: { id: string; code: string; name: string | null } | null;
    createdBy: { fullName: string } | null;
  }[];
};

type Channel = { id: string; name: string; code: string };

type ProductEditState = {
  ean: string;
  sku: string;
  category: string;
  subcategory: string;
  type: string;
  name: string;
  model: string;
  modelNumber: string;
  size: string;
  brand: string;
  description: string;
  gender: string;
  dimensions: string;
  color: string;
  colorSecondary: string;
  material: string;
  status: string;
  priceMin: string;
  priceMax: string;
  priceApprox: string;
  priceWeb: string;
  shopifyPercent: string;
  percentageResult: string;
  realPrice: string;
  valueAmount: string;
  vatPercent: string;
  vatValue: string;
  finalPrice: string;
  shippingWeb: string;
  approxAmount: string;
  shopifyLink: string;
  imageUrl: string;
  webRef: string;
  mainImageUrl: string;
  gallery: string[];
};

function attrString(attrs: Record<string, unknown>, key: string) {
  return String(attrs[key] || "");
}

function statusClass(status: string) {
  const normalized = String(status || "").toLowerCase();
  if (normalized.includes("active") || normalized.includes("activo")) return "bg-[#E9F8EE] text-[#1F7A3E]";
  if (normalized.includes("archiv")) return "bg-[#F3F4F6] text-[#4B5563]";
  if (normalized.includes("inactivo") || normalized.includes("inactive")) return "bg-[#FCEBEC] text-[#B42318]";
  return "bg-[#EEF2FF] text-[#3730A3]";
}

function productTypeLabel(type: string) {
  switch (String(type || "").toLowerCase()) {
    case "watch":
      return "Reloj";
    case "bag":
      return "Bolso";
    case "perfume":
      return "Perfume";
    case "accessory":
      return "Accesorio";
    case "vintage":
      return "Vintage";
    case "refurbished":
      return "Reacondicionado";
    case "other":
      return "Otro";
    default:
      return type || "-";
  }
}

function displayCategory(category?: string | null) {
  if (!category) return "-";
  return productTypeLabel(category);
}

function buildEditState(nextProduct: ProductPayload): ProductEditState {
  const attrs = (nextProduct.attributes || {}) as Record<string, unknown>;
  const images = nextProduct.images || [];
  const shopifyLink =
    nextProduct.channelLinks.find((item) => item.salesChannel.code.toLowerCase().includes("shopify"))?.productUrl ||
    attrString(attrs, "shopifyLink");
  const imageUrl = attrString(attrs, "imageUrl") || nextProduct.mainImageUrl || images.find((img) => img.isPrimary)?.imageUrl || "";
  const webRef =
    nextProduct.channelLinks.find((item) => item.productUrl && !item.salesChannel.code.toLowerCase().includes("shopify"))?.productUrl ||
    attrString(attrs, "webRef");
  return {
    ean: nextProduct.ean || "",
    sku: nextProduct.sku || "",
    category: nextProduct.category || "",
    subcategory: String(attrs.subcategory || ""),
    type: nextProduct.type || "",
    name: nextProduct.name || "",
    model: nextProduct.model || "",
    modelNumber: nextProduct.modelRef || "",
    size: String(attrs.size || ""),
    brand: nextProduct.brand || "",
    description: nextProduct.internalDescription || "",
    gender: String(attrs.gender || ""),
    dimensions: String(attrs.dimensions || ""),
    color: String(attrs.color || ""),
    colorSecondary: String(attrs.colorSecondary || ""),
    material: String(attrs.material || ""),
    status: nextProduct.status || "",
    priceMin: attrString(attrs, "priceMin"),
    priceMax: attrString(attrs, "priceMax"),
    priceApprox: attrString(attrs, "priceApprox"),
    priceWeb: attrString(attrs, "priceWeb"),
    shopifyPercent: attrString(attrs, "shopifyPercent"),
    percentageResult: attrString(attrs, "percentageResult"),
    realPrice: attrString(attrs, "realPrice"),
    valueAmount: attrString(attrs, "valueAmount"),
    vatPercent: attrString(attrs, "vatPercent"),
    vatValue: attrString(attrs, "vatValue"),
    finalPrice: attrString(attrs, "finalPrice"),
    shippingWeb: attrString(attrs, "shippingWeb"),
    approxAmount: attrString(attrs, "approxAmount"),
    shopifyLink,
    imageUrl,
    webRef,
    mainImageUrl: nextProduct.mainImageUrl || images.find((img) => img.isPrimary)?.imageUrl || "",
    gallery: images.map((img) => img.imageUrl),
  };
}

export default function ProductDetailPage() {
  const { productId } = useParams<{ productId: string }>();
  const [storeId, setStoreId] = useState("");
  const [storeName, setStoreName] = useState("");
  const [product, setProduct] = useState<ProductPayload | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [aliasValue, setAliasValue] = useState("");
  const [textLocale, setTextLocale] = useState("es");
  const [textName, setTextName] = useState("");
  const [textDescription, setTextDescription] = useState("");
  const [channelId, setChannelId] = useState("");
  const [channelPrice, setChannelPrice] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [editingMainImage, setEditingMainImage] = useState(false);
  const [editingGallery, setEditingGallery] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);
  const [eanValidationError, setEanValidationError] = useState("");
  const [editState, setEditState] = useState<ProductEditState>({
    ean: "",
    sku: "",
    category: "",
    subcategory: "",
    type: "",
    name: "",
    model: "",
    modelNumber: "",
    size: "",
    brand: "",
    description: "",
    gender: "",
    dimensions: "",
    color: "",
    colorSecondary: "",
    material: "",
    status: "",
    priceMin: "",
    priceMax: "",
    priceApprox: "",
    priceWeb: "",
    shopifyPercent: "",
    percentageResult: "",
    realPrice: "",
    valueAmount: "",
    vatPercent: "",
    vatValue: "",
    finalPrice: "",
    shippingWeb: "",
    approxAmount: "",
    shopifyLink: "",
    imageUrl: "",
    webRef: "",
    mainImageUrl: "",
    gallery: [],
  });

  const primaryImage =
    (editMode ? editState.mainImageUrl : null) ||
    product?.images?.find((img) => img.isPrimary)?.imageUrl ||
    product?.mainImageUrl ||
    null;
  const totalStock = product?.lots?.reduce((sum, lot) => sum + Number(lot.quantityAvailable || 0), 0) || 0;
  const stockByWarehouse = useMemo(() => {
    if (!product) return [];
    const byWarehouse = new Map<string, { code: string; name: string; qty: number; locations: string[] }>();
    for (const lot of product.lots || []) {
      const key = lot.warehouse.code;
      const current = byWarehouse.get(key) || { code: lot.warehouse.code, name: lot.warehouse.name, qty: 0, locations: [] };
      current.qty += Number(lot.quantityAvailable || 0);
      if ((lot as unknown as { location?: { code?: string; name?: string | null } | null }).location?.code) {
        const loc = (lot as unknown as { location?: { code?: string; name?: string | null } | null }).location;
        current.locations.push(`${loc?.code}${loc?.name ? ` - ${loc.name}` : ""}`);
      }
      byWarehouse.set(key, current);
    }
    return Array.from(byWarehouse.values());
  }, [product]);
  const fifoLot = useMemo(() => {
    if (!product?.lots?.length) return null;
    return [...product.lots]
      .filter((lot) => Number(lot.quantityAvailable || 0) > 0)
      .sort((a, b) => new Date(a.receivedAt || 0).getTime() - new Date(b.receivedAt || 0).getTime())[0] || null;
  }, [product]);
  const lastPurchaseLot = useMemo(() => {
    if (!product?.lots?.length) return null;
    return [...product.lots].sort(
      (a, b) => new Date(b.receivedAt || b.purchasedAt || 0).getTime() - new Date(a.receivedAt || a.purchasedAt || 0).getTime()
    )[0] || null;
  }, [product]);
  const productAlerts = useMemo(() => {
    if (!product) return [];
    const alerts: { tone: "red" | "amber" | "blue"; text: string }[] = [];
    if (!primaryImage) alerts.push({ tone: "red", text: "Falta imagen principal." });
    if (!product.channelPrices.length && !product.listings.length) alerts.push({ tone: "amber", text: "No hay precios ni publicaciones activas." });
    if (!totalStock) alerts.push({ tone: "amber", text: "Producto sin stock disponible." });
    if (!product.internalDescription) alerts.push({ tone: "blue", text: "Falta descripción interna para atención al cliente." });
    return alerts;
  }, [product, primaryImage, totalStock]);

  const loadAll = useCallback(
    async (currentStoreId: string) => {
      const token = requireTokenOrRedirect();
      if (!token) return;
      setLoading(true);
      setError("");
      try {
        const [productRes, channelRes] = await Promise.all([
          fetch(`${API_BASE}/products/${productId}?storeId=${encodeURIComponent(currentStoreId)}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_BASE}/stores/${currentStoreId}/channels`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);
        const productData = await productRes.json();
        const channelData = await channelRes.json();

        if (!productRes.ok) {
          setError(productData.error || "Error loading product");
          setProduct(null);
        } else {
          setProduct(productData.product);
          setEditState(buildEditState(productData.product));
          setEditMode(false);
          setEditingMainImage(false);
          setEditingGallery(false);
        }

        if (channelRes.ok) setChannels(channelData.channels || []);
      } catch {
        setError("Connection error");
      } finally {
        setLoading(false);
      }
    },
    [productId]
  );

  useEffect(() => {
    const token = requireTokenOrRedirect();
    if (!token) return;
    const selectedStoreId = localStorage.getItem("selectedStoreId");
    if (!selectedStoreId) return;
    setStoreId(selectedStoreId);

    try {
      const storesRaw = localStorage.getItem("stores");
      if (storesRaw) {
        const stores = JSON.parse(storesRaw) as { storeId: string; storeName: string }[];
        setStoreName(stores.find((s) => s.storeId === selectedStoreId)?.storeName || "");
      }
    } catch {}

    void loadAll(selectedStoreId);
  }, [loadAll]);

  function updateEditField<K extends keyof ProductEditState>(key: K, value: ProductEditState[K]) {
    setEditState((prev) => ({ ...prev, [key]: value }));
  }

  function updateGalleryImage(index: number, value: string) {
    setEditState((prev) => {
      const next = [...prev.gallery];
      next[index] = value;
      return { ...prev, gallery: next };
    });
  }

  function addGallerySlot() {
    setEditState((prev) => ({ ...prev, gallery: [...prev.gallery, ""] }));
  }

  function removeGallerySlot(index: number) {
    setEditState((prev) => ({ ...prev, gallery: prev.gallery.filter((_, i) => i !== index) }));
  }

  function cancelEdit() {
    if (!product) return;
    setEditState(buildEditState(product));
    setEditMode(false);
    setEditingMainImage(false);
    setEditingGallery(false);
    setError("");
  }

  async function saveProductChanges() {
    const token = requireTokenOrRedirect();
    if (!token || !storeId || !product) return;
    try {
      setSavingProduct(true);
      setError("");
      setEanValidationError("");
      const trimmedEan = editState.ean.trim();
      if (!trimmedEan) throw new Error("El EAN es obligatorio.");
      if (trimmedEan !== product.ean) {
        const checkRes = await fetch(`${API_BASE}/products?storeId=${encodeURIComponent(storeId)}&q=${encodeURIComponent(trimmedEan)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const checkData = await checkRes.json();
        if (checkRes.ok) {
          const duplicated = (checkData.products || []).find((item: { id: string; ean: string }) => item.id !== product.id && item.ean === trimmedEan);
          if (duplicated) {
            setEanValidationError("Ese EAN ya existe en esta tienda.");
            throw new Error("Ese EAN ya existe en esta tienda.");
          }
        }
      }
      const cleanGallery = editState.gallery.map((img) => img.trim()).filter(Boolean);
      const mainImage = editState.mainImageUrl.trim();
      const images = [
        ...(mainImage ? [{ imageUrl: mainImage, isPrimary: true, sortOrder: 0 }] : []),
        ...cleanGallery
          .filter((img) => img !== mainImage)
          .map((imageUrl, idx) => ({
            imageUrl,
            isPrimary: false,
            sortOrder: idx + 1,
          })),
      ];
      const res = await fetch(`${API_BASE}/products/${product.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          storeId,
          ean: trimmedEan,
          sku: editState.sku.trim() || null,
          category: editState.category.trim() || null,
          type: editState.type.trim() || null,
          name: editState.name.trim(),
          brand: editState.brand.trim(),
          model: editState.model.trim(),
          modelRef: editState.modelNumber.trim() || null,
          status: editState.status.trim() || product.status,
          internalDescription: editState.description.trim() || null,
          mainImageUrl: mainImage || null,
          images,
          attributes: {
            subcategory: editState.subcategory.trim() || null,
            size: editState.size.trim() || null,
            gender: editState.gender.trim() || null,
            dimensions: editState.dimensions.trim() || null,
            color: editState.color.trim() || null,
            colorSecondary: editState.colorSecondary.trim() || null,
            material: editState.material.trim() || null,
            priceMin: editState.priceMin.trim() || null,
            priceMax: editState.priceMax.trim() || null,
            priceApprox: editState.priceApprox.trim() || null,
            priceWeb: editState.priceWeb.trim() || null,
            shopifyPercent: editState.shopifyPercent.trim() || null,
            percentageResult: editState.percentageResult.trim() || null,
            realPrice: editState.realPrice.trim() || null,
            valueAmount: editState.valueAmount.trim() || null,
            vatPercent: editState.vatPercent.trim() || null,
            vatValue: editState.vatValue.trim() || null,
            finalPrice: editState.finalPrice.trim() || null,
            shippingWeb: editState.shippingWeb.trim() || null,
            approxAmount: editState.approxAmount.trim() || null,
            shopifyLink: editState.shopifyLink.trim() || null,
            imageUrl: editState.imageUrl.trim() || null,
            webRef: editState.webRef.trim() || null,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo guardar el producto.");
      await loadAll(storeId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar producto.");
    } finally {
      setSavingProduct(false);
    }
  }

  async function addAlias(e: React.FormEvent) {
    e.preventDefault();
    const token = requireTokenOrRedirect();
    if (!token || !storeId || !aliasValue.trim()) return;
    const res = await fetch(`${API_BASE}/products/${productId}/ean-aliases`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ storeId, ean: aliasValue.trim(), source: "manual" }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error || "Cannot add alias");
    setAliasValue("");
    void loadAll(storeId);
  }

  async function deleteAlias(aliasId: string) {
    const token = requireTokenOrRedirect();
    if (!token || !storeId) return;
    const res = await fetch(`${API_BASE}/products/${productId}/ean-aliases/${aliasId}?storeId=${encodeURIComponent(storeId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error || "No se pudo eliminar el alias EAN.");
    void loadAll(storeId);
  }

  async function saveText(e: React.FormEvent) {
    e.preventDefault();
    const token = requireTokenOrRedirect();
    if (!token || !storeId || !textName.trim()) return;
    const res = await fetch(`${API_BASE}/products/${productId}/texts`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        storeId,
        locale: textLocale,
        publicName: textName.trim(),
        description: textDescription.trim() || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error || "Cannot save text");
    setTextName("");
    setTextDescription("");
    void loadAll(storeId);
  }

  async function saveChannelListing(e: React.FormEvent) {
    e.preventDefault();
    const token = requireTokenOrRedirect();
    if (!token || !storeId || !channelId) return;
    const res = await fetch(`${API_BASE}/products/${productId}/channel/${channelId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        storeId,
        listingStatus: "active",
        publicName: product?.name || "",
        priceOriginal: channelPrice || null,
        priceCurrencyCode: "EUR",
        priceFxToEur: "1",
      }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error || "Cannot save listing");
    setChannelPrice("");
    void loadAll(storeId);
  }

  return (
    <div className={`${headingFont.variable} ${bodyFont.variable} min-h-screen bg-[#E8EAEC] p-6`}>
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="flex items-center justify-start">
          <Link
            href="/products"
            className="inline-flex items-center gap-2 rounded-full border border-[#D4D9E4] bg-white px-4 py-2 text-[13px] text-[#25304F] shadow-[0_8px_20px_rgba(0,0,0,0.05)]"
            style={{ fontFamily: "var(--font-product-detail-body)" }}
          >
            <span aria-hidden="true">←</span>
            <span>Volver a productos</span>
          </Link>
        </div>

        <div className="mb-2">
          <h1 className="text-[29px] leading-none text-[#141A39]" style={{ fontFamily: "var(--font-product-detail-heading)" }}>
            Ficha de Producto
          </h1>
          <p className="mt-1 text-[13px] text-[#616984]" style={{ fontFamily: "var(--font-product-detail-body)" }}>
            {storeName ? `Tienda: ${storeName}` : "Detalle de producto"}
          </p>
          <p className="mt-1 text-[13px] text-[#616984]" style={{ fontFamily: "var(--font-product-detail-body)" }}>
            {product?.name || "-"}
          </p>
        </div>

        {error ? <div className="rounded-xl bg-[#FDECEC] p-3 text-[#B42318]">{error}</div> : null}
        {productAlerts.length ? (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {productAlerts.map((alert, idx) => (
              <div
                key={`${alert.text}-${idx}`}
                className={`rounded-2xl border px-4 py-3 text-[13px] ${
                  alert.tone === "red"
                    ? "border-[#F4C7C7] bg-[#FDECEC] text-[#B42318]"
                    : alert.tone === "amber"
                    ? "border-[#F2D6A2] bg-[#FFF6E7] text-[#9A6700]"
                    : "border-[#C8D3F6] bg-[#EEF4FF] text-[#3147D4]"
                }`}
                style={{ fontFamily: "var(--font-product-detail-body)" }}
              >
                {alert.text}
              </div>
            ))}
          </div>
        ) : null}

        {loading || !product ? (
          <div className="rounded-2xl bg-white p-4 text-sm text-[#6E768E] shadow-[0_10px_30px_rgba(0,0,0,0.08)]">Cargando...</div>
        ) : (
          <>
            <div className="grid gap-4 rounded-2xl bg-white p-4 shadow-[0_10px_30px_rgba(0,0,0,0.08)] md:grid-cols-[320px_minmax(0,1fr)]">
              <div className="overflow-hidden rounded-2xl border border-[#E2E6EF] bg-[#F7F9FC] p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="text-[20px] text-[#141A39]" style={{ fontFamily: "var(--font-product-detail-heading)" }}>
                    Imagen
                  </div>
                  {editMode ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded-full border border-[#D4D9E4] bg-white px-3 py-1.5 text-[12px] text-[#25304F]"
                        onClick={() => setEditingMainImage((prev) => !prev)}
                      >
                        Editar foto principal
                      </button>
                      <button
                        type="button"
                        className="rounded-full border border-[#D4D9E4] bg-white px-3 py-1.5 text-[12px] text-[#25304F]"
                        onClick={() => setEditingGallery((prev) => !prev)}
                      >
                        Agregar más fotos
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className="flex h-[280px] items-center justify-center overflow-hidden rounded-2xl bg-white">
                  {primaryImage ? (
                    <div className="relative h-full w-full">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={primaryImage} alt={product.name} className="h-full w-full object-contain" />
                      {editMode ? (
                        <button
                          type="button"
                          aria-label="Eliminar foto principal"
                          className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#E3E5EA] text-[18px] font-semibold text-[#5D6477] shadow-[0_4px_10px_rgba(0,0,0,0.12)] transition hover:bg-[#D3D7E2]"
                          onClick={() => updateEditField("mainImageUrl", "")}
                        >
                          ×
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <div className="text-sm text-[#6E768E]">Sin imagen</div>
                  )}
                </div>
                {editMode && editingMainImage ? (
                  <div className="mt-3 flex gap-2">
                    <input
                      className="h-11 w-full rounded-xl border border-[#D4D9E4] px-3 text-[14px] text-[#25304F] outline-none"
                      placeholder="URL foto principal"
                      value={editState.mainImageUrl}
                      onChange={(e) => updateEditField("mainImageUrl", e.target.value)}
                    />
                    <button
                      type="button"
                      className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[#D4D9E4] bg-white text-[18px] font-semibold text-[#5D6477] hover:bg-[#F7F9FC]"
                      aria-label="Eliminar foto principal"
                      onClick={() => updateEditField("mainImageUrl", "")}
                    >
                      ×
                    </button>
                  </div>
                ) : null}
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {(editMode
                    ? editState.gallery.filter(Boolean).slice(0, 4).map((imageUrl, idx) => ({ id: `${idx}`, imageUrl }))
                    : (product.images || []).slice(0, 4)
                  ).map((img) => {
                    const isSelectedMain = editMode
                      ? img.imageUrl === editState.mainImageUrl
                      : img.imageUrl === primaryImage;
                    return (
                      <button
                        key={img.id}
                        type="button"
                        disabled={!editMode}
                        onClick={() => {
                          if (!editMode) return;
                          updateEditField("mainImageUrl", img.imageUrl);
                          setEditingMainImage(true);
                        }}
                        className={`relative overflow-hidden rounded-xl border bg-white text-left ${
                          isSelectedMain ? "border-[#3147D4] ring-2 ring-[#3147D4]/20" : "border-[#E2E6EF]"
                        } ${editMode ? "cursor-pointer" : "cursor-default"}`}
                        title={editMode ? "Usar como foto principal" : product.name}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.imageUrl} alt={product.name} className="h-[64px] w-full object-cover" />
                        {editMode ? (
                          <>
                            <span className="absolute bottom-1 left-1 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium text-[#25304F]">
                              {isSelectedMain ? "Principal" : "Elegir"}
                            </span>
                            <button
                              type="button"
                              aria-label={`Eliminar foto ${img.id}`}
                              className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#E3E5EA] text-[14px] font-semibold text-[#5D6477] shadow-[0_4px_10px_rgba(0,0,0,0.12)] hover:bg-[#D3D7E2]"
                              onClick={(e) => {
                                e.stopPropagation();
                                const galleryIndex = editState.gallery.findIndex((imageUrl) => imageUrl === img.imageUrl);
                                if (galleryIndex === -1) return;
                                const nextGallery = editState.gallery.filter((_, idx) => idx !== galleryIndex);
                                setEditState((prev) => ({
                                  ...prev,
                                  gallery: nextGallery,
                                  mainImageUrl: prev.mainImageUrl === img.imageUrl ? nextGallery[0] || "" : prev.mainImageUrl,
                                }));
                              }}
                            >
                              ×
                            </button>
                          </>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
                {editMode && editingGallery ? (
                  <div className="mt-3 space-y-2">
                    {editState.gallery.map((img, idx) => (
                      <div key={`gallery-${idx}`} className="flex gap-2">
                        <input
                          className="h-11 w-full rounded-xl border border-[#D4D9E4] px-3 text-[14px] text-[#25304F] outline-none"
                          placeholder={`URL foto ${idx + 1}`}
                          value={img}
                          onChange={(e) => updateGalleryImage(idx, e.target.value)}
                        />
                        <button
                          type="button"
                          className="h-11 rounded-xl border border-[#D4D9E4] px-3 text-[13px] text-[#25304F]"
                          onClick={() => removeGallerySlot(idx)}
                        >
                          Quitar
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="rounded-xl bg-[#0B1230] px-4 py-2 text-[13px] text-white"
                      onClick={addGallerySlot}
                    >
                      Agregar más fotos
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="space-y-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-[20px] text-[#141A39]" style={{ fontFamily: "var(--font-product-detail-heading)" }}>
                    Datos del producto
                  </h2>
                  {!editMode ? (
                    <button
                      type="button"
                      className="rounded-full bg-[#0B1230] px-4 py-2 text-[13px] text-white"
                      onClick={() => setEditMode(true)}
                    >
                      Editar producto
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="rounded-full border border-[#D4D9E4] bg-white px-4 py-2 text-[13px] text-[#25304F]"
                        onClick={cancelEdit}
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        disabled={savingProduct}
                        className="rounded-full bg-[#0B1230] px-4 py-2 text-[13px] text-white disabled:opacity-60"
                        onClick={saveProductChanges}
                      >
                        Guardar cambios
                      </button>
                    </div>
                  )}
                </div>

                {editMode ? (
                  <div className="grid gap-3 md:grid-cols-2" style={{ fontFamily: "var(--font-product-detail-body)" }}>
                    {[
                      ["EAN", "ean"],
                      ["SKU", "sku"],
                      ["Categoría", "category"],
                      ["Subcategoría", "subcategory"],
                      ["Nombre del producto", "name"],
                      ["Modelo", "model"],
                      ["Número de modelo", "modelNumber"],
                      ["Talla", "size"],
                      ["Marca", "brand"],
                      ["Género", "gender"],
                      ["Dimensiones", "dimensions"],
                      ["Color", "color"],
                      ["Color secundario", "colorSecondary"],
                      ["Material", "material"],
                    ].map(([label, key]) => (
                      <div key={key}>
                        <div className="mb-1 text-[13px] text-[#4F5568]">{label}</div>
                        <input
                          className="h-11 w-full rounded-xl border border-[#D4D9E4] px-3 text-[14px] text-[#25304F] outline-none"
                          value={String(editState[key as keyof ProductEditState] || "")}
                          onChange={(e) => updateEditField(key as keyof ProductEditState, e.target.value as never)}
                        />
                        {key === "ean" && eanValidationError ? <div className="mt-1 text-[12px] text-[#B42318]">{eanValidationError}</div> : null}
                      </div>
                    ))}
                    <div>
                      <div className="mb-1 text-[13px] text-[#4F5568]">Tipo</div>
                      <select
                        className="h-11 w-full rounded-xl border border-[#D4D9E4] px-3 text-[14px] text-[#25304F] outline-none"
                        value={editState.type}
                        onChange={(e) => updateEditField("type", e.target.value)}
                      >
                        <option value="watch">Reloj</option>
                        <option value="bag">Bolso</option>
                        <option value="perfume">Perfume</option>
                        <option value="accessory">Accesorio</option>
                        <option value="vintage">Vintage</option>
                        <option value="refurbished">Reacondicionado</option>
                        <option value="other">Otro</option>
                      </select>
                    </div>
                    <div>
                      <div className="mb-1 text-[13px] text-[#4F5568]">Estado</div>
                      <select
                        className="h-11 w-full rounded-xl border border-[#D4D9E4] px-3 text-[14px] text-[#25304F] outline-none"
                        value={editState.status}
                        onChange={(e) => updateEditField("status", e.target.value)}
                      >
                        <option value="active">active</option>
                        <option value="inactive">inactive</option>
                        <option value="archived">archived</option>
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <div className="mb-1 text-[13px] text-[#4F5568]">Descripción</div>
                      <textarea
                        className="min-h-[110px] w-full rounded-xl border border-[#D4D9E4] px-3 py-3 text-[14px] text-[#25304F] outline-none"
                        value={editState.description}
                        onChange={(e) => updateEditField("description", e.target.value)}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-3 text-[14px] text-[#25304F] md:grid-cols-2" style={{ fontFamily: "var(--font-product-detail-body)" }}>
                    <div><b>EAN:</b> {product.ean}</div>
                    <div><b>SKU:</b> {product.sku || "-"}</div>
                    <div><b>Categoría:</b> {displayCategory(product.category)}</div>
                    <div><b>Subcategoría:</b> {String(product.attributes?.subcategory || "-")}</div>
                    <div><b>Tipo:</b> {productTypeLabel(product.type)}</div>
                    <div><b>Nombre del producto:</b> {product.name}</div>
                    <div><b>Modelo:</b> {product.model}</div>
                    <div><b>Número de modelo:</b> {product.modelRef || "-"}</div>
                    <div><b>Talla:</b> {String(product.attributes?.size || "-")}</div>
                    <div><b>Marca:</b> {product.brand}</div>
                    <div><b>Género:</b> {String(product.attributes?.gender || "-")}</div>
                    <div><b>Dimensiones:</b> {String(product.attributes?.dimensions || "-")}</div>
                    <div><b>Color:</b> {String(product.attributes?.color || "-")}</div>
                    <div><b>Color secundario:</b> {String(product.attributes?.colorSecondary || "-")}</div>
                    <div><b>Material:</b> {String(product.attributes?.material || "-")}</div>
                    <div>
                      <b>Estado:</b>{" "}
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[12px] font-medium ${statusClass(product.status)}`}>
                        {product.status}
                      </span>
                    </div>
                    <div className="md:col-span-2">
                      <b>Descripción:</b> {product.internalDescription || "-"}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-[360px_minmax(0,1fr)]">
              <div className="rounded-2xl bg-white p-4 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
                <h2 className="mb-3 text-[20px] text-[#141A39]" style={{ fontFamily: "var(--font-product-detail-heading)" }}>
                  Inventario y ubicación
                </h2>
                <div className="space-y-3 text-[14px] text-[#25304F]" style={{ fontFamily: "var(--font-product-detail-body)" }}>
                  <div className="rounded-xl bg-[#F7F9FC] p-3">
                    <div className="text-[12px] text-[#6E768E]">Stock total</div>
                    <div className="mt-1 text-[24px] text-[#141A39]" style={{ fontFamily: "var(--font-product-detail-heading)" }}>
                      {totalStock}
                    </div>
                  </div>
                  {stockByWarehouse.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[#D4D9E4] bg-[#F7F9FC] p-3 text-[#6E768E]">
                      Sin stock ni ubicaciones registradas.
                    </div>
                  ) : (
                    stockByWarehouse.map((warehouse) => (
                      <div key={warehouse.code} className="rounded-xl border border-[#E2E6EF] bg-[#F7F9FC] p-3">
                        <div className="flex items-center justify-between">
                          <div className="text-[15px] text-[#141A39]" style={{ fontFamily: "var(--font-product-detail-heading)" }}>
                            {warehouse.code}
                          </div>
                          <div className="text-[13px] text-[#4F5568]">{warehouse.qty} uds.</div>
                        </div>
                        <div className="mt-2 text-[12px] text-[#6E768E]">{warehouse.name}</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {warehouse.locations.length ? (
                            Array.from(new Set(warehouse.locations)).map((location) => (
                              <span key={`${warehouse.code}-${location}`} className="rounded-full bg-white px-2.5 py-1 text-[12px] text-[#4F5568]">
                                {location}
                              </span>
                            ))
                          ) : (
                            <span className="rounded-full bg-white px-2.5 py-1 text-[12px] text-[#8A92A6]">Sin ubicación específica</span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl bg-white p-4 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
                    <h2 className="mb-3 text-[20px] text-[#141A39]" style={{ fontFamily: "var(--font-product-detail-heading)" }}>
                      Resumen FIFO
                    </h2>
                    <div className="space-y-3 text-[14px] text-[#25304F]" style={{ fontFamily: "var(--font-product-detail-body)" }}>
                      <div className="rounded-xl bg-[#F7F9FC] p-3">
                        <div className="text-[12px] text-[#6E768E]">Lote que sale primero</div>
                        <div className="mt-1 text-[16px] text-[#141A39]" style={{ fontFamily: "var(--font-product-detail-heading)" }}>
                          {fifoLot?.lotCode || "-"}
                        </div>
                        <div className="mt-2 text-[13px] text-[#4F5568]">
                          {fifoLot ? `${fifoLot.quantityAvailable}/${fifoLot.quantityReceived} uds. · ${fifoLot.warehouse.code}` : "Sin lotes disponibles"}
                        </div>
                        <div className="mt-1 text-[13px] text-[#4F5568]">
                          Coste FIFO: {fifoLot?.unitCostEurFrozen !== undefined && fifoLot?.unitCostEurFrozen !== null ? `EUR ${fifoLot.unitCostEurFrozen}` : "No visible"}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-2xl bg-white p-4 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
                    <h2 className="mb-3 text-[20px] text-[#141A39]" style={{ fontFamily: "var(--font-product-detail-heading)" }}>
                      Última compra
                    </h2>
                    <div className="space-y-3 text-[14px] text-[#25304F]" style={{ fontFamily: "var(--font-product-detail-body)" }}>
                      <div className="rounded-xl bg-[#F7F9FC] p-3">
                        <div className="text-[12px] text-[#6E768E]">Último lote recibido</div>
                        <div className="mt-1 text-[16px] text-[#141A39]" style={{ fontFamily: "var(--font-product-detail-heading)" }}>
                          {lastPurchaseLot?.lotCode || "-"}
                        </div>
                        <div className="mt-2 text-[13px] text-[#4F5568]">
                          {lastPurchaseLot?.receivedAt
                            ? new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(lastPurchaseLot.receivedAt))
                            : "Sin fecha"}
                        </div>
                        <div className="mt-1 text-[13px] text-[#4F5568]">
                          Coste: {lastPurchaseLot?.unitCostEurFrozen !== undefined && lastPurchaseLot?.unitCostEurFrozen !== null ? `EUR ${lastPurchaseLot.unitCostEurFrozen}` : "No visible"}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl bg-white p-4 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
                  <h2 className="mb-3 text-[20px] text-[#141A39]" style={{ fontFamily: "var(--font-product-detail-heading)" }}>
                    Pricing y cálculo comercial
                  </h2>
                  {editMode ? (
                    <div className="grid gap-3 md:grid-cols-3" style={{ fontFamily: "var(--font-product-detail-body)" }}>
                      {[
                        ["Price min", "priceMin"],
                        ["Price max", "priceMax"],
                        ["Price aprox", "priceApprox"],
                        ["Precio web", "priceWeb"],
                        ["Porcentaje Shopify", "shopifyPercent"],
                        ["Resultado del porcentaje", "percentageResult"],
                        ["Precio real", "realPrice"],
                        ["Valor", "valueAmount"],
                        ["Porcentaje de IVA", "vatPercent"],
                        ["Valor de IVA", "vatValue"],
                        ["Precio final", "finalPrice"],
                        ["Shipping web", "shippingWeb"],
                        ["Aprox", "approxAmount"],
                      ].map(([label, key]) => (
                        <div key={key}>
                          <div className="mb-1 text-[13px] text-[#4F5568]">{label}</div>
                          <input
                            className="h-11 w-full rounded-xl border border-[#D4D9E4] px-3 text-[14px] text-[#25304F] outline-none"
                            value={String(editState[key as keyof ProductEditState] || "")}
                            onChange={(e) => updateEditField(key as keyof ProductEditState, e.target.value as never)}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="grid gap-3 text-[14px] text-[#25304F] md:grid-cols-3" style={{ fontFamily: "var(--font-product-detail-body)" }}>
                      <div><b>Price min:</b> {String(product.attributes?.priceMin || "-")}</div>
                      <div><b>Price max:</b> {String(product.attributes?.priceMax || "-")}</div>
                      <div><b>Price aprox:</b> {String(product.attributes?.priceApprox || "-")}</div>
                      <div><b>Precio web:</b> {String(product.attributes?.priceWeb || "-")}</div>
                      <div><b>Porcentaje Shopify:</b> {String(product.attributes?.shopifyPercent || "-")}</div>
                      <div><b>Resultado del porcentaje:</b> {String(product.attributes?.percentageResult || "-")}</div>
                      <div><b>Precio real:</b> {String(product.attributes?.realPrice || "-")}</div>
                      <div><b>Valor:</b> {String(product.attributes?.valueAmount || "-")}</div>
                      <div><b>Porcentaje de IVA:</b> {String(product.attributes?.vatPercent || "-")}</div>
                      <div><b>Valor de IVA:</b> {String(product.attributes?.vatValue || "-")}</div>
                      <div><b>Precio final:</b> {String(product.attributes?.finalPrice || "-")}</div>
                      <div><b>Shipping web:</b> {String(product.attributes?.shippingWeb || "-")}</div>
                      <div><b>Aprox:</b> {String(product.attributes?.approxAmount || "-")}</div>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl bg-white p-4 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
                  <h2 className="mb-3 text-[20px] text-[#141A39]" style={{ fontFamily: "var(--font-product-detail-heading)" }}>
                    Referencias y links
                  </h2>
                  {editMode ? (
                    <div className="grid gap-3 md:grid-cols-3" style={{ fontFamily: "var(--font-product-detail-body)" }}>
                      {[
                        ["Shopify link", "shopifyLink"],
                        ["Imagen URL", "imageUrl"],
                        ["Web ref", "webRef"],
                      ].map(([label, key]) => (
                        <div key={key}>
                          <div className="mb-1 text-[13px] text-[#4F5568]">{label}</div>
                          <input
                            className="h-11 w-full rounded-xl border border-[#D4D9E4] px-3 text-[14px] text-[#25304F] outline-none"
                            value={String(editState[key as keyof ProductEditState] || "")}
                            onChange={(e) => updateEditField(key as keyof ProductEditState, e.target.value as never)}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="grid gap-3 text-[14px] text-[#25304F] md:grid-cols-3" style={{ fontFamily: "var(--font-product-detail-body)" }}>
                      <div className="break-all">
                        <b>Shopify link:</b> {String(product.attributes?.shopifyLink || "-")}
                      </div>
                      <div className="break-all">
                        <b>Imagen URL:</b> {String(product.attributes?.imageUrl || "-")}
                      </div>
                      <div className="break-all">
                        <b>Web ref:</b> {String(product.attributes?.webRef || "-")}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-4 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
              <h2 className="mb-3 text-[20px] text-[#141A39]" style={{ fontFamily: "var(--font-product-detail-heading)" }}>
                Alias EAN
              </h2>
              <form className="mb-2 flex gap-2" onSubmit={addAlias}>
                <input
                  className="h-11 w-full rounded-xl border border-[#D4D9E4] px-3 text-[14px] text-[#25304F] outline-none"
                  placeholder="Nuevo alias EAN"
                  value={aliasValue}
                  onChange={(e) => setAliasValue(e.target.value)}
                />
                <button className="h-11 rounded-xl bg-[#0B1230] px-4 text-[14px] text-white" type="submit">
                  Agregar
                </button>
              </form>
              <div className="text-sm text-[#4F5568]">
                {product.eanAliases.length === 0 ? (
                  "Sin alias"
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {product.eanAliases.map((a) => (
                      <div key={a.id} className="inline-flex items-center gap-2 rounded-full border border-[#D4D9E4] bg-[#F7F9FC] px-2.5 py-1 text-[12px]">
                        <span>{a.ean}</span>
                        <button
                          type="button"
                          className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#E3E5EA] text-[12px] font-semibold text-[#5D6477] hover:bg-[#D3D7E2]"
                          aria-label={`Eliminar alias ${a.ean}`}
                          onClick={() => void deleteAlias(a.id)}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl bg-white p-4 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-[20px] text-[#141A39]" style={{ fontFamily: "var(--font-product-detail-heading)" }}>
                    Precios y canales
                  </h2>
                  <p className="mt-1 text-[13px] text-[#616984]" style={{ fontFamily: "var(--font-product-detail-body)" }}>
                    Precio real por canal, moneda y links publicados.
                  </p>
                </div>
              </div>

              {product.listings.length === 0 && product.channelPrices.length === 0 && product.channelLinks.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#D4D9E4] bg-[#F7F9FC] p-4 text-sm text-[#6E768E]">
                  Aún no hay precios ni publicaciones guardadas para este producto.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {channels.map((channel) => {
                    const listing = product.listings.find((ls) => ls.channel.id === channel.id);
                    const link = product.channelLinks.find((ln) => ln.salesChannel.id === channel.id);
                    const price = product.channelPrices.find((pr) => pr.salesChannel.id === channel.id);
                    if (!listing && !link && !price) return null;
                    return (
                      <div key={channel.id} className="rounded-2xl border border-[#E2E6EF] bg-[#F7F9FC] p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-[17px] text-[#141A39]" style={{ fontFamily: "var(--font-product-detail-heading)" }}>
                              {channel.name}
                            </div>
                            <div className="mt-1 text-[12px] uppercase tracking-wide text-[#6E768E]">{channel.code}</div>
                          </div>
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[12px] font-medium ${statusClass(listing?.listingStatus || link?.status || "active")}`}>
                            {listing?.listingStatus || link?.status || "active"}
                          </span>
                        </div>

                        <div className="mt-4 space-y-2 text-[14px] text-[#25304F]" style={{ fontFamily: "var(--font-product-detail-body)" }}>
                          <div>
                            <b>Precio canal:</b>{" "}
                            {listing?.priceOriginal || price?.priceAmount || "-"}{" "}
                            {listing?.priceCurrencyCode || price?.currencyCode || ""}
                          </div>
                          <div>
                            <b>Precio EUR:</b> {listing?.priceEurFrozen || "-"}
                          </div>
                          <div>
                            <b>Nombre público:</b> {listing?.publicName || product.name}
                          </div>
                          <div>
                            <b>EAN canal:</b> {listing?.channelEan || link?.externalProductId || "-"}
                          </div>
                          <div className="break-all">
                            <b>Link:</b>{" "}
                            {listing?.listingUrl || link?.productUrl ? (
                              <a
                                href={listing?.listingUrl || link?.productUrl || "#"}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[#3147D4] underline"
                              >
                                {listing?.listingUrl || link?.productUrl}
                              </a>
                            ) : (
                              "-"
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-white p-4 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
              <h2 className="mb-3 text-[20px] text-[#141A39]" style={{ fontFamily: "var(--font-product-detail-heading)" }}>
                Textos por idioma
              </h2>
              <form className="mb-3 grid gap-2 md:grid-cols-4" onSubmit={saveText}>
                <select className="h-11 rounded-xl border border-[#D4D9E4] px-3 text-[14px] text-[#25304F] outline-none" value={textLocale} onChange={(e) => setTextLocale(e.target.value)}>
                  <option value="es">es</option>
                  <option value="it">it</option>
                  <option value="pt">pt</option>
                  <option value="en">en</option>
                  <option value="de">de</option>
                </select>
                <input
                  className="h-11 rounded-xl border border-[#D4D9E4] px-3 text-[14px] text-[#25304F] outline-none"
                  placeholder="Nombre público"
                  value={textName}
                  onChange={(e) => setTextName(e.target.value)}
                />
                <input
                  className="h-11 rounded-xl border border-[#D4D9E4] px-3 text-[14px] text-[#25304F] outline-none"
                  placeholder="Descripción"
                  value={textDescription}
                  onChange={(e) => setTextDescription(e.target.value)}
                />
                <button className="h-11 rounded-xl bg-[#0B1230] px-4 text-[14px] text-white" type="submit">
                  Guardar
                </button>
              </form>
              <div className="space-y-1 text-sm text-[#4F5568]">
                {product.texts.length === 0 ? (
                  <div>Sin textos guardados</div>
                ) : (
                  product.texts.map((tx) => (
                    <div key={tx.id}>
                      [{tx.locale}] {tx.publicName}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl bg-white p-4 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
              <h2 className="mb-3 text-[20px] text-[#141A39]" style={{ fontFamily: "var(--font-product-detail-heading)" }}>
                Publicaciones por canal
              </h2>
              <form className="mb-3 grid gap-2 md:grid-cols-3" onSubmit={saveChannelListing}>
                <select className="h-11 rounded-xl border border-[#D4D9E4] px-3 text-[14px] text-[#25304F] outline-none" value={channelId} onChange={(e) => setChannelId(e.target.value)}>
                  <option value="">Seleccionar canal</option>
                  {channels.map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      {ch.name}
                    </option>
                  ))}
                </select>
                <input
                  className="h-11 rounded-xl border border-[#D4D9E4] px-3 text-[14px] text-[#25304F] outline-none"
                  placeholder="Precio EUR"
                  value={channelPrice}
                  onChange={(e) => setChannelPrice(e.target.value)}
                />
                <button className="h-11 rounded-xl bg-[#0B1230] px-4 text-[14px] text-white" type="submit">
                  Guardar publicación
                </button>
              </form>
              <div className="space-y-1 text-sm text-[#4F5568]">
                {product.listings.length === 0 ? (
                  <div>Sin publicaciones guardadas</div>
                ) : (
                  product.listings.map((ls) => (
                    <div key={ls.id}>
                      {ls.channel.name}: {ls.priceOriginal || "-"} {ls.priceCurrencyCode || ""}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="overflow-hidden rounded-2xl bg-white shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
                <div className="border-b bg-[#F5F7FB] px-4 py-3 text-[20px] text-[#141A39]" style={{ fontFamily: "var(--font-product-detail-heading)" }}>
                  Lotes FIFO
                </div>
                <div className="p-4">
                  <table className="min-w-full text-sm">
                    <thead className="border-b">
                      <tr className="text-left text-[#4F5568]">
                        <th className="px-2 py-2">Lote</th>
                        <th className="px-2 py-2">Almacén</th>
                        <th className="px-2 py-2">Ubicación</th>
                        <th className="px-2 py-2">Recibido</th>
                        <th className="px-2 py-2">Costo FIFO</th>
                        <th className="px-2 py-2">Stock</th>
                      </tr>
                    </thead>
                    <tbody>
                      {product.lots.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-2 py-3 text-[#6E768E]">Sin lotes</td>
                        </tr>
                      ) : (
                        product.lots.map((lot) => (
                          <tr key={lot.id} className="border-b border-[#EEF1F6]">
                            <td className="px-2 py-2 text-[#1D2647]">{lot.lotCode}</td>
                            <td className="px-2 py-2 text-[#1D2647]">{lot.warehouse.code}</td>
                            <td className="px-2 py-2 text-[#1D2647]">{lot.location?.code || "-"}</td>
                            <td className="px-2 py-2 text-[#1D2647]">
                              {lot.receivedAt
                                ? new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(lot.receivedAt))
                                : "-"}
                            </td>
                            <td className="px-2 py-2 text-[#1D2647]">{lot.unitCostEurFrozen !== undefined && lot.unitCostEurFrozen !== null ? `EUR ${lot.unitCostEurFrozen}` : "-"}</td>
                            <td className="px-2 py-2 text-[#1D2647]">{lot.quantityAvailable}/{lot.quantityReceived}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl bg-white shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
                <div className="border-b bg-[#F5F7FB] px-4 py-3 text-[20px] text-[#141A39]" style={{ fontFamily: "var(--font-product-detail-heading)" }}>
                  Historial
                </div>
                <div className="p-4">
                  <table className="min-w-full text-sm">
                    <thead className="border-b">
                      <tr className="text-left text-[#4F5568]">
                        <th className="px-2 py-2">Fecha</th>
                        <th className="px-2 py-2">Tipo</th>
                        <th className="px-2 py-2">Almacén</th>
                        <th className="px-2 py-2">Ubicación</th>
                        <th className="px-2 py-2">Cantidad</th>
                        <th className="px-2 py-2">Usuario</th>
                        <th className="px-2 py-2">Motivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {product.movements.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-2 py-3 text-[#6E768E]">Sin movimientos</td>
                        </tr>
                      ) : (
                        product.movements.map((mv) => (
                          <tr key={mv.id} className="border-b border-[#EEF1F6]">
                            <td className="px-2 py-2 text-[#1D2647]">
                              {new Intl.DateTimeFormat("es-ES", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              }).format(new Date(mv.createdAt))}
                            </td>
                            <td className="px-2 py-2 text-[#1D2647]">{mv.movementType}</td>
                            <td className="px-2 py-2 text-[#1D2647]">{mv.warehouse.code}</td>
                            <td className="px-2 py-2 text-[#1D2647]">{mv.location?.code || "-"}</td>
                            <td className="px-2 py-2 text-[#1D2647]">{mv.quantity}</td>
                            <td className="px-2 py-2 text-[#1D2647]">{mv.createdBy?.fullName || "-"}</td>
                            <td className="px-2 py-2 text-[#1D2647]">{mv.reason || mv.referenceType || "-"}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
