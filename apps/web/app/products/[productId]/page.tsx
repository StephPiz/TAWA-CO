"use client";

import { useCallback, useEffect, useState } from "react";
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
  eanAliases: { id: string; ean: string; source: string }[];
  listings: {
    id: string;
    listingStatus: string;
    publicName: string | null;
    listingUrl: string | null;
    priceOriginal: string | null;
    priceCurrencyCode: string | null;
    channel: { id: string; name: string; code: string };
  }[];
  texts: { id: string; locale: string; publicName: string; description: string | null; channelId: string | null }[];
  lots: {
    id: string;
    lotCode: string;
    quantityAvailable: number;
    quantityReceived: number;
    status: string;
    unitCostEurFrozen?: number;
    warehouse: { code: string; name: string };
  }[];
  movements: {
    id: string;
    movementType: string;
    quantity: number;
    createdAt: string;
    warehouse: { code: string };
    createdBy: { fullName: string } | null;
  }[];
};

type Channel = { id: string; name: string; code: string };

function statusClass(status: string) {
  const normalized = String(status || "").toLowerCase();
  if (normalized.includes("active") || normalized.includes("activo")) return "bg-[#E9F8EE] text-[#1F7A3E]";
  if (normalized.includes("archiv")) return "bg-[#F3F4F6] text-[#4B5563]";
  if (normalized.includes("inactivo") || normalized.includes("inactive")) return "bg-[#FCEBEC] text-[#B42318]";
  return "bg-[#EEF2FF] text-[#3730A3]";
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

  const loadAll = useCallback(async (currentStoreId: string) => {
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
      }

      if (channelRes.ok) setChannels(channelData.channels || []);
    } catch {
      setError("Connection error");
    } finally {
      setLoading(false);
    }
  }, [productId]);

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

    loadAll(selectedStoreId);
  }, [loadAll]);

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
    loadAll(storeId);
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
    loadAll(storeId);
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
    loadAll(storeId);
  }

  return (
    <div className={`${headingFont.variable} ${bodyFont.variable} min-h-screen bg-[#E8EAEC] p-6`}>
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="mb-2">
          <h1 className="text-[29px] leading-none text-[#141A39]" style={{ fontFamily: "var(--font-product-detail-heading)" }}>
            Ficha de Producto
          </h1>
          <p className="mt-1 text-[13px] text-[#616984]" style={{ fontFamily: "var(--font-product-detail-body)" }}>
            {storeName ? `Tienda: ${storeName}` : "Detalle de producto"}
          </p>
        </div>

        {error ? <div className="rounded-xl bg-[#FDECEC] p-3 text-[#B42318]">{error}</div> : null}

        {loading || !product ? (
          <div className="rounded-2xl bg-white p-4 text-sm text-[#6E768E] shadow-[0_10px_30px_rgba(0,0,0,0.08)]">Cargando...</div>
        ) : (
          <>
            <div className="grid gap-4 rounded-2xl bg-white p-4 shadow-[0_10px_30px_rgba(0,0,0,0.08)] md:grid-cols-2">
              <div>
                <h2 className="mb-3 text-[20px] text-[#141A39]" style={{ fontFamily: "var(--font-product-detail-heading)" }}>
                  Datos del producto
                </h2>
                <div className="space-y-2 text-[14px] text-[#25304F]" style={{ fontFamily: "var(--font-product-detail-body)" }}>
                  <div>
                    <b>EAN:</b> {product.ean}
                  </div>
                  <div>
                    <b>Marca:</b> {product.brand}
                  </div>
                  <div>
                    <b>Modelo:</b> {product.model}
                  </div>
                  <div>
                    <b>Tipo:</b> {product.type}
                  </div>
                  <div>
                    <b>Estado:</b>{" "}
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[12px] font-medium ${statusClass(product.status)}`}>
                      {product.status}
                    </span>
                  </div>
                  <div>
                    <b>SKU:</b> {product.sku || "-"}
                  </div>
                  <div>
                    <b>Descripción interna:</b> {product.internalDescription || "-"}
                  </div>
                </div>
              </div>

              <div>
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
                        <span key={a.id} className="rounded-full border border-[#D4D9E4] bg-[#F7F9FC] px-2.5 py-1 text-[12px]">
                          {a.ean}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
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
                        <th className="px-2 py-2">Stock</th>
                      </tr>
                    </thead>
                    <tbody>
                      {product.lots.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-2 py-3 text-[#6E768E]">Sin lotes</td>
                        </tr>
                      ) : (
                        product.lots.map((lot) => (
                          <tr key={lot.id} className="border-b border-[#EEF1F6]">
                            <td className="px-2 py-2 text-[#1D2647]">{lot.lotCode}</td>
                            <td className="px-2 py-2 text-[#1D2647]">{lot.warehouse.code}</td>
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
                        <th className="px-2 py-2">Cantidad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {product.movements.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-2 py-3 text-[#6E768E]">Sin movimientos</td>
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
                            <td className="px-2 py-2 text-[#1D2647]">{mv.quantity}</td>
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
