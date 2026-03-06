"use client";

import { useEffect, useState } from "react";
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
  model: string;
  name: string;
  type: string;
  status: string;
};

export default function ProductsPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [storeId, setStoreId] = useState("");
  const [storeName, setStoreName] = useState("");
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [ean, setEan] = useState("");
  const [type, setType] = useState("watch");

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
    try {
      const res = await fetch(`${API_BASE}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          storeId,
          brand: brand.trim(),
          model: model.trim(),
          ean: ean.trim() || undefined,
          type,
          name: `${brand.trim()} ${model.trim()}`.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Cannot create product");
        return;
      }

      setBrand("");
      setModel("");
      setEan("");
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
          <form className="grid gap-2 md:grid-cols-5" onSubmit={createProduct}>
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
              placeholder="EAN (opcional)"
              value={ean}
              onChange={(e) => setEan(e.target.value)}
            />
            <select className="h-11 rounded-xl border border-[#D4D9E4] px-3 text-[14px] text-[#25304F] outline-none" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="watch">watch</option>
              <option value="bag">bag</option>
              <option value="perfume">perfume</option>
              <option value="accessory">accessory</option>
              <option value="vintage">vintage</option>
              <option value="refurbished">refurbished</option>
              <option value="other">other</option>
            </select>
            <button className="h-11 rounded-xl bg-[#0B1230] px-3 text-[14px] text-white" type="submit">
              {t("create")}
            </button>
          </form>
          {error ? <div className="mt-2 rounded-xl bg-[#FDECEC] p-3 text-sm text-[#B42318]">{error}</div> : null}
        </div>

        <div className="overflow-hidden rounded-2xl bg-white shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
          <table className="min-w-full text-sm">
            <thead className="border-b bg-[#F5F7FB]">
              <tr>
                <th className="text-left px-3 py-2">EAN</th>
                <th className="text-left px-3 py-2">Marca</th>
                <th className="text-left px-3 py-2">Modelo</th>
                <th className="text-left px-3 py-2">Tipo</th>
                <th className="text-left px-3 py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-[#6E768E]">
                    Cargando...
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-[#6E768E]">
                    Sin productos
                  </td>
                </tr>
              ) : (
                products.map((p) => (
                  <tr
                    key={p.id}
                    className="cursor-pointer border-b border-[#EEF1F6] hover:bg-[#F9FAFD]"
                    onClick={() => router.push(`/store/products/${p.id}`)}
                  >
                    <td className="px-3 py-2 font-mono text-[12px] text-[#3C4562]">{p.ean}</td>
                    <td className="px-3 py-2 text-[#212A45]">{p.brand}</td>
                    <td className="px-3 py-2 font-medium text-[#131936]">{p.model}</td>
                    <td className="px-3 py-2 text-[#212A45]">{p.type}</td>
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
