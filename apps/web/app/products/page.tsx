"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import localFont from "next/font/local";
import { requireTokenOrRedirect } from "../lib/auth";
import { useI18n } from "../lib/i18n";

const API_BASE = "http://localhost:3001";
const headingFont = localFont({
  src: "../fonts/HFHySans_Black.ttf",
  variable: "--font-products-heading",
});
const bodyFont = localFont({
  src: "../fonts/HFHySans_Regular.ttf",
  variable: "--font-products-body",
});

type ProductRow = {
  id: string;
  ean: string;
  brand: string;
  sku?: string;
  modelRef?: string | null;
  model: string;
  name: string;
  type: string;
  category?: string | null;
  status: string;
  mainImageUrl?: string | null;
};

type SortMode =
  | "recent"
  | "oldest"
  | "brand-asc"
  | "brand-desc"
  | "model-asc"
  | "model-desc"
  | "modelref-asc"
  | "modelref-desc"
  | "ean-asc"
  | "ean-desc"
  | "status";

function categoryLabel(category: string) {
  switch (String(category || "").toLowerCase()) {
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
      return category || "-";
  }
}

function slugSkuPart(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();
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

export default function ProductsPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [storeId, setStoreId] = useState("");
  const [storeName, setStoreName] = useState("");
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [withImages, setWithImages] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("recent");

  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [modelRef, setModelRef] = useState("");
  const [productName, setProductName] = useState("");
  const [ean, setEan] = useState("");
  const [type, setType] = useState("watch");
  const [category, setCategory] = useState("watch");
  const [internalDescription, setInternalDescription] = useState("");
  const [useInternalEan, setUseInternalEan] = useState(false);
  const [createSuccess, setCreateSuccess] = useState("");

  const skuPreview = [slugSkuPart(brand), slugSkuPart(modelRef || model)].filter(Boolean).join("-");
  const visibleProducts = useMemo(() => {
    const rows = [...products];
    switch (sortMode) {
      case "oldest":
        return rows.reverse();
      case "brand-asc":
        return rows.sort((a, b) => String(a.brand || "").localeCompare(String(b.brand || ""), "es", { sensitivity: "base" }));
      case "brand-desc":
        return rows.sort((a, b) => String(b.brand || "").localeCompare(String(a.brand || ""), "es", { sensitivity: "base" }));
      case "model-asc":
        return rows.sort((a, b) => String(a.model || "").localeCompare(String(b.model || ""), "es", { sensitivity: "base" }));
      case "model-desc":
        return rows.sort((a, b) => String(b.model || "").localeCompare(String(a.model || ""), "es", { sensitivity: "base" }));
      case "modelref-asc":
        return rows.sort((a, b) => String(a.modelRef || "").localeCompare(String(b.modelRef || ""), "es", { sensitivity: "base" }));
      case "modelref-desc":
        return rows.sort((a, b) => String(b.modelRef || "").localeCompare(String(a.modelRef || ""), "es", { sensitivity: "base" }));
      case "ean-asc":
        return rows.sort((a, b) => String(a.ean || "").localeCompare(String(b.ean || ""), "es", { sensitivity: "base" }));
      case "ean-desc":
        return rows.sort((a, b) => String(b.ean || "").localeCompare(String(a.ean || ""), "es", { sensitivity: "base" }));
      case "status":
        return rows.sort((a, b) => String(a.status || "").localeCompare(String(b.status || ""), "es", { sensitivity: "base" }));
      case "recent":
      default:
        return rows;
    }
  }, [products, sortMode]);

  async function loadProducts(currentStoreId: string, q: string) {
    const token = requireTokenOrRedirect();
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ storeId: currentStoreId, q });
      const res = await fetch(`${API_BASE}/products?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error loading products");
        setProducts([]);
      } else {
        setProducts(Array.isArray(data.products) ? data.products : []);
      }
    } catch {
      setError("Connection error");
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const token = requireTokenOrRedirect();
    if (!token) return;
    const selectedStoreId = localStorage.getItem("selectedStoreId");
    if (!selectedStoreId) {
      router.push("/select-store");
      return;
    }
    setStoreId(selectedStoreId);

    try {
      const storesRaw = localStorage.getItem("stores");
      if (storesRaw) {
        const stores = JSON.parse(storesRaw) as { storeId: string; storeName: string }[];
        const found = stores.find((s) => s.storeId === selectedStoreId);
        setStoreName(found?.storeName || "");
      }
    } catch {}

    loadProducts(selectedStoreId, "");
  }, [router]);

  async function createProduct(e: React.FormEvent) {
    e.preventDefault();
    const token = requireTokenOrRedirect();
    if (!token || !storeId) return;
    setError("");
    setCreateSuccess("");
    try {
      const res = await fetch(`${API_BASE}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          storeId,
          brand: brand.trim(),
          model: model.trim(),
          ean: useInternalEan ? undefined : ean.trim() || undefined,
          type,
          modelRef: modelRef.trim() || undefined,
          category,
          name: productName.trim() || `${brand.trim()} ${model.trim()}`.trim(),
          internalDescription: internalDescription.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Cannot create product");
        return;
      }

      setBrand("");
      setModel("");
      setModelRef("");
      setProductName("");
      setEan("");
      setType("watch");
      setCategory("watch");
      setInternalDescription("");
      setUseInternalEan(false);
      setCreateSuccess(`Producto creado con SKU ${data.product?.sku || skuPreview || "-"}`);
      await loadProducts(storeId, query);
      router.push(`/store/products/${data.product.id}`);
    } catch {
      setError("Connection error");
    }
  }

  return (
    <div className={`${headingFont.variable} ${bodyFont.variable} min-h-screen bg-[#E8EAEC] p-6`}>
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="mb-2">
          <h1 className="text-[29px] leading-none text-[#141A39]" style={{ fontFamily: "var(--font-products-heading)" }}>
            {t("products")}
          </h1>
          <p className="mt-1 text-[13px] text-[#616984]" style={{ fontFamily: "var(--font-products-body)" }}>
            {storeName ? `Tienda: ${storeName}` : "Catalogo maestro de productos"}
          </p>
        </div>

        <div className="rounded-2xl bg-white p-4 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
          <form
            className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_160px_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              if (!storeId) return;
              loadProducts(storeId, query);
            }}
          >
            <input
              className="h-11 rounded-xl border border-[#D4D9E4] px-3 text-[14px] text-[#25304F] outline-none"
              placeholder="EAN / Marca / Modelo"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="self-center text-sm text-[#6E768E] md:col-span-3">{products.length} items</div>
            <button className="h-11 rounded-xl border border-[#D4D9E4] px-4 text-[14px] text-[#1D2647] hover:bg-[#F7F9FC]" type="submit">
              {t("search")}
            </button>
          </form>
        </div>

        <div className="rounded-2xl bg-white p-4 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
          <h2 className="mb-3 text-[20px] text-[#141A39]" style={{ fontFamily: "var(--font-products-heading)" }}>
            Crear producto
          </h2>
          <form className="grid gap-2 md:grid-cols-6" onSubmit={createProduct}>
            <input
              className="h-11 rounded-xl border border-[#D4D9E4] px-3 text-[14px] text-[#25304F] outline-none"
              placeholder="Marca"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              required
            />
            <input
              className="h-11 rounded-xl border border-[#D4D9E4] px-3 text-[14px] text-[#25304F] outline-none"
              placeholder="Modelo"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              required
            />
            <input
              className="h-11 rounded-xl border border-[#D4D9E4] px-3 text-[14px] text-[#25304F] outline-none"
              placeholder="Modelo #"
              value={modelRef}
              onChange={(e) => setModelRef(e.target.value)}
            />
            <input
              className="h-11 rounded-xl border border-[#D4D9E4] px-3 text-[14px] text-[#25304F] outline-none"
              placeholder={useInternalEan ? "EAN interno automatico" : "EAN (opcional)"}
              value={ean}
              onChange={(e) => setEan(e.target.value)}
              disabled={useInternalEan}
            />
            <select className="h-11 rounded-xl border border-[#D4D9E4] px-3 text-[14px] text-[#25304F] outline-none" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="watch">Reloj</option>
              <option value="bag">Bolso</option>
              <option value="perfume">Perfume</option>
              <option value="accessory">Accesorio</option>
              <option value="vintage">Vintage</option>
              <option value="refurbished">Reacondicionado</option>
              <option value="other">Otro</option>
            </select>
            <button className="h-11 rounded-xl bg-[#0B1230] px-3 text-[14px] text-white" type="submit">
              {t("create")}
            </button>
            <input
              className="h-11 rounded-xl border border-[#D4D9E4] px-3 text-[14px] text-[#25304F] outline-none md:col-span-2"
              placeholder="Nombre del producto"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
            />
            <select className="h-11 rounded-xl border border-[#D4D9E4] px-3 text-[14px] text-[#25304F] outline-none" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="watch">Categoria: Reloj</option>
              <option value="bag">Categoria: Bolso</option>
              <option value="perfume">Categoria: Perfume</option>
              <option value="accessory">Categoria: Accesorio</option>
              <option value="vintage">Categoria: Vintage</option>
              <option value="refurbished">Categoria: Reacondicionado</option>
              <option value="other">Categoria: Otro</option>
            </select>
            <input
              className="h-11 rounded-xl border border-[#D4D9E4] px-3 text-[14px] text-[#25304F] outline-none md:col-span-2"
              placeholder="Descripcion interna"
              value={internalDescription}
              onChange={(e) => setInternalDescription(e.target.value)}
            />
            <div className="flex h-11 items-center rounded-xl border border-[#D4D9E4] px-3 text-[13px] text-[#616984]">
              SKU automatico: <span className="ml-2 font-semibold text-[#25304F]">{skuPreview || "Se generara al crear"}</span>
            </div>
            <label className="flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-[#D4D9E4] px-3 text-[13px] text-[#25304F]">
              <input type="checkbox" checked={useInternalEan} onChange={(e) => setUseInternalEan(e.target.checked)} />
              Generar EAN interno
            </label>
          </form>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[13px] text-[#6E768E]">
            <span>Tipo: {productTypeLabel(type)}</span>
            <span>Categoria: {categoryLabel(category)}</span>
          </div>
          {createSuccess ? <div className="mt-2 rounded-xl bg-[#ECFDF3] p-3 text-sm text-[#067647]">{createSuccess}</div> : null}
          {error ? <div className="mt-2 rounded-xl bg-[#FDECEC] p-3 text-sm text-[#B42318]">{error}</div> : null}
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[20px] font-semibold text-[#131936]">Filtros de visualización</div>
              <div className="text-[13px] text-[#5B637D]">Organiza la lista por marca, modelo, modelo #, EAN o estado.</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className={`h-10 rounded-full border px-4 text-[13px] ${
                  withImages ? "border-[#0B1230] bg-[#0B1230] text-white" : "border-[#D4D9E4] bg-white text-[#1D2647] hover:bg-[#F7F9FC]"
                }`}
                type="button"
                onClick={() => setWithImages((value) => !value)}
              >
                {withImages ? "👁 Ocultar imagen" : "👁 Mostrar imagen"}
              </button>
              <select
                className="h-10 rounded-full border border-[#D4D9E4] bg-white px-4 text-[13px] text-[#1D2647] outline-none"
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
              >
                <option value="recent">Cómo filtrar y ordenar: Últimos creados</option>
                <option value="oldest">Cómo filtrar y ordenar: Primeros creados</option>
                <option value="brand-asc">Marca A - Z</option>
                <option value="brand-desc">Marca Z - A</option>
                <option value="model-asc">Modelo A - Z</option>
                <option value="model-desc">Modelo Z - A</option>
                <option value="modelref-asc">Modelo # A - Z</option>
                <option value="modelref-desc">Modelo # Z - A</option>
                <option value="ean-asc">EAN menor a mayor</option>
                <option value="ean-desc">EAN mayor a menor</option>
                <option value="status">Estado</option>
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl bg-white shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
          <table className="min-w-full text-sm">
            <thead className="border-b bg-[#F5F7FB]">
              <tr>
                {withImages ? <th className="text-left px-3 py-2">Imagen</th> : null}
                <th className="text-left px-3 py-2">EAN</th>
                <th className="text-left px-3 py-2">Marca</th>
                <th className="text-left px-3 py-2">Modelo #</th>
                <th className="text-left px-3 py-2">Modelo</th>
                <th className="text-left px-3 py-2">Tipo</th>
                <th className="text-left px-3 py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={withImages ? 7 : 6} className="px-3 py-4 text-[#6E768E]">
                    Cargando...
                  </td>
                </tr>
              ) : visibleProducts.length === 0 ? (
                <tr>
                  <td colSpan={withImages ? 7 : 6} className="px-3 py-4 text-[#6E768E]">
                    Sin productos
                  </td>
                </tr>
              ) : (
                visibleProducts.map((p) => (
                  <tr
                    key={p.id}
                    className="cursor-pointer border-b border-[#EEF1F6] hover:bg-[#F9FAFD]"
                    onClick={() => router.push(`/store/products/${p.id}`)}
                  >
                    {withImages ? (
                      <td className="px-3 py-2">
                        {p.mainImageUrl ? (
                          <img src={p.mainImageUrl} alt={p.name} className="h-14 w-14 rounded-xl border border-[#E4E8F1] object-cover" />
                        ) : (
                          <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-[#E4E8F1] bg-[#F7F8FB] text-[11px] text-[#7B839C]">
                            Sin foto
                          </div>
                        )}
                      </td>
                    ) : null}
                    <td className="px-3 py-2 font-mono text-[12px] text-[#3C4562]">{p.ean}</td>
                    <td className="px-3 py-2 text-[#212A45]">{p.brand}</td>
                    <td className="px-3 py-2 font-medium text-[#212A45]">{p.modelRef || "-"}</td>
                    <td className="px-3 py-2 font-medium text-[#131936]">{p.model}</td>
                    <td className="px-3 py-2 text-[#212A45]">{productTypeLabel(p.type)}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex rounded-full bg-[#EEF2FF] px-2.5 py-1 text-[12px] font-medium text-[#3730A3]">{p.status}</span>
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
