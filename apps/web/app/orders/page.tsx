"use client";

import { useEffect, useMemo, useState } from "react";
import { requireTokenOrRedirect } from "../lib/auth";

const API_BASE = "http://localhost:3001";

type Product = { id: string; ean: string; brand: string; model: string; name: string };
type Channel = { id: string; code: string; name: string };
type Warehouse = { id: string; code: string; name: string };
type IntegrationConfig = {
  id: string;
  provider: string;
  isActive: boolean;
  hasWebhookSecret: boolean;
  hasApiKey: boolean;
  hasOauthAccessToken?: boolean;
  configJson: Record<string, unknown> | null;
  lastWebhookAt: string | null;
  lastWebhookStatus: string | null;
  updatedAt: string;
};
type Order = {
  id: string;
  orderNumber: string;
  platform: string;
  sourceLabel: string | null;
  status: string;
  paymentStatus: string;
  grossAmountEurFrozen: number;
  netProfitEur: number;
  orderedAt: string;
  backorders?: { id: string; productId: string; missingQty: number; status: string }[];
};
type Backorder = {
  id: string;
  status: string;
  missingQty: number;
  fulfilledQty: number;
  order: { orderNumber: string };
  product: { brand: string; model: string };
};
type StockAlert = {
  productId: string;
  brand: string;
  model: string;
  currentStock: number;
  threshold: number;
  severity: string;
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("es-ES", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(value);
}

function orderStatusLabel(value: string) {
  switch (String(value || "").toLowerCase()) {
    case "pending":
      return "Pendiente";
    case "paid":
      return "Pagado";
    case "processing":
      return "En proceso";
    case "packed":
      return "Empaquetado";
    case "shipped":
      return "Enviado";
    case "backorder":
      return "Backorder";
    case "cancelled":
      return "Cancelado";
    default:
      return value || "-";
  }
}

function paymentStatusLabel(value: string) {
  switch (String(value || "").toLowerCase()) {
    case "paid":
      return "Pagado";
    case "unpaid":
      return "Pendiente";
    case "refunded":
      return "Reembolsado";
    default:
      return value || "-";
  }
}

export default function OrdersPage() {
  const [storeId, setStoreId] = useState("");
  const [storeName, setStoreName] = useState("");
  const [storeCode, setStoreCode] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [backorders, setBackorders] = useState<Backorder[]>([]);
  const [stockAlerts, setStockAlerts] = useState<StockAlert[]>([]);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const [orderNumber, setOrderNumber] = useState("");
  const [platform, setPlatform] = useState("Shopify");
  const [sourceChannelId, setSourceChannelId] = useState("");
  const [country, setCountry] = useState("DE");
  const [amount, setAmount] = useState("209");
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("1");
  const [allowBackorder, setAllowBackorder] = useState(false);
  const [fulfillQtyByBackorder, setFulfillQtyByBackorder] = useState<Record<string, string>>({});
  const [fulfillingBackorderId, setFulfillingBackorderId] = useState("");
  const [fulfillWarehouseId, setFulfillWarehouseId] = useState("");
  const [integrationConfig, setIntegrationConfig] = useState<IntegrationConfig | null>(null);
  const [shopDomain, setShopDomain] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [publicBaseUrl, setPublicBaseUrl] = useState("https://lustreless-shelia-arborous.ngrok-free.dev");
  const [defaultAcquisitionSource, setDefaultAcquisitionSource] = useState("Orgánico");
  const [integrationSaving, setIntegrationSaving] = useState(false);
  const [integrationLoading, setIntegrationLoading] = useState(false);
  const [simulationRunning, setSimulationRunning] = useState(false);
  const [oauthConnecting, setOauthConnecting] = useState(false);

  const webhookUrl = useMemo(() => {
    if (!publicBaseUrl.trim() || !storeCode.trim()) return "";
    return `${publicBaseUrl.replace(/\/$/, "")}/webhooks/shopify/${storeCode.trim().toUpperCase()}`;
  }, [publicBaseUrl, storeCode]);

  async function loadIntegration(currentStoreId: string) {
    const token = requireTokenOrRedirect();
    if (!token) return;
    setIntegrationLoading(true);
    try {
      const res = await fetch(`${API_BASE}/integrations/config?storeId=${encodeURIComponent(currentStoreId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo cargar la configuración Shopify");
        return;
      }
      const config = (data.configs || []).find((row: IntegrationConfig) => row.provider === "shopify") || null;
      setIntegrationConfig(config);
      const cfg = config?.configJson && typeof config.configJson === "object" ? config.configJson : null;
      setShopDomain(typeof cfg?.shopDomain === "string" ? cfg.shopDomain : "");
      setClientId(typeof cfg?.clientId === "string" ? cfg.clientId : "");
      setPublicBaseUrl(typeof cfg?.publicBaseUrl === "string" ? cfg.publicBaseUrl : "https://lustreless-shelia-arborous.ngrok-free.dev");
      setDefaultAcquisitionSource(typeof cfg?.defaultAcquisitionSource === "string" ? cfg.defaultAcquisitionSource : "Orgánico");
      setClientSecret("");
      setWebhookSecret("");
    } catch {
      setError("Connection error");
    } finally {
      setIntegrationLoading(false);
    }
  }

  async function loadAll(currentStoreId: string, query = "") {
    const token = requireTokenOrRedirect();
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const [ordersRes, productsRes, bootstrapRes, backordersRes, alertsRes] = await Promise.all([
        fetch(`${API_BASE}/orders?storeId=${encodeURIComponent(currentStoreId)}&q=${encodeURIComponent(query)}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/products?storeId=${encodeURIComponent(currentStoreId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/stores/${currentStoreId}/bootstrap`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/backorders?storeId=${encodeURIComponent(currentStoreId)}&status=open`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/inventory/alerts/low-stock?storeId=${encodeURIComponent(currentStoreId)}&threshold=2`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      const ordersData = await ordersRes.json();
      const productsData = await productsRes.json();
      const bootstrapData = await bootstrapRes.json();
      const backordersData = await backordersRes.json();
      const alertsData = await alertsRes.json();

      if (ordersRes.ok) setOrders(ordersData.orders || []);
      if (productsRes.ok) setProducts(productsData.products || []);
      if (bootstrapRes.ok) {
        setChannels(bootstrapData.channels || []);
        setWarehouses(bootstrapData.warehouses || []);
      }
      if (backordersRes.ok) setBackorders(backordersData.backorders || []);
      if (alertsRes.ok) setStockAlerts(alertsData.alerts || []);

      if (!ordersRes.ok) setError(ordersData.error || "Error loading orders");
    } catch {
      setError("Connection error");
    } finally {
      setLoading(false);
    }
  }

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
        const selectedStore = stores.find((s) => s.storeId === selectedStoreId) as ({ storeId: string; storeName: string; storeCode?: string } | undefined);
        setStoreName(selectedStore?.storeName || "");
        setStoreCode(String(selectedStore?.storeCode || selectedStore?.storeName || "DEMARCA").trim().toUpperCase().replace(/\s+/g, "-"));
      }
    } catch {}

    void loadAll(selectedStoreId);
    void loadIntegration(selectedStoreId);

    const search = new URLSearchParams(window.location.search);
    if (search.get("shopify") === "connected") {
      setInfo("Shopify autorizado correctamente. Ya puedes pasar al sync real de pedidos.");
      search.delete("shopify");
      const next = `${window.location.pathname}${search.toString() ? `?${search.toString()}` : ""}`;
      window.history.replaceState({}, "", next);
    }
  }, []);

  const totalRevenue = useMemo(() => orders.reduce((sum, order) => sum + Number(order.grossAmountEurFrozen || 0), 0), [orders]);
  const totalProfit = useMemo(() => orders.reduce((sum, order) => sum + Number(order.netProfitEur || 0), 0), [orders]);
  const backorderCount = useMemo(() => backorders.length, [backorders]);
  const activeAlerts = useMemo(() => stockAlerts.length, [stockAlerts]);

  async function createOrder(e: React.FormEvent) {
    e.preventDefault();
    const token = requireTokenOrRedirect();
    if (!token || !storeId || !orderNumber || !amount || !productId) return;
    const selectedProduct = products.find((p) => p.id === productId);
    const res = await fetch(`${API_BASE}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        storeId,
        orderNumber,
        platform,
        sourceChannelId: sourceChannelId || null,
        sourceLabel: channels.find((c) => c.id === sourceChannelId)?.name || null,
        customerCountryCode: country,
        currencyCode: "EUR",
        grossAmountOriginal: amount,
        grossFxToEur: "1",
        feesEur: "8.5",
        cpaEur: "4.2",
        shippingCostEur: "5.9",
        packagingCostEur: "1.2",
        returnCostEur: "0",
        status: "paid",
        paymentStatus: "paid",
        allowBackorder,
        items: [
          {
            productId,
            productEan: selectedProduct?.ean || null,
            title: selectedProduct?.name || "Item",
            quantity: Number(qty || "1"),
            unitPriceOriginal: amount,
            fxToEur: "1",
          },
        ],
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Cannot create order");
      return;
    }
    if (data.order?.status === "backorder") {
      setInfo("Pedido creado con backorder abierto por falta de stock.");
    } else {
      setInfo("Pedido creado correctamente.");
    }
    setOrderNumber("");
    setAmount("209");
    setProductId("");
    setQty("1");
    setAllowBackorder(false);
    await loadAll(storeId, searchQuery);
  }

  async function fulfillBackorder(backorder: Backorder) {
    const token = requireTokenOrRedirect();
    if (!token || !storeId) return;

    const openQty = Math.max(Number(backorder.missingQty || 0) - Number(backorder.fulfilledQty || 0), 0);
    const rawQty = fulfillQtyByBackorder[backorder.id];
    const fulfillQty = Number(rawQty || openQty || 0);
    if (!Number.isInteger(fulfillQty) || fulfillQty <= 0) {
      setError("Cantidad de cumplimiento inválida");
      return;
    }

    setFulfillingBackorderId(backorder.id);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/backorders/${backorder.id}/fulfill`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          storeId,
          fulfillQty,
          warehouseId: fulfillWarehouseId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo cumplir backorder");
        return;
      }
      setInfo(`Backorder ${backorder.order.orderNumber} actualizado.`);
      await loadAll(storeId, searchQuery);
    } catch {
      setError("Connection error");
    } finally {
      setFulfillingBackorderId("");
    }
  }

  async function saveShopifyConfig(e: React.FormEvent) {
    e.preventDefault();
    const token = requireTokenOrRedirect();
    if (!token || !storeId) return;
    setIntegrationSaving(true);
    setError("");
    setInfo("");
    try {
      const res = await fetch(`${API_BASE}/integrations/config/upsert`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          storeId,
          provider: "shopify",
          apiKey: clientSecret.trim() || undefined,
          webhookSecret: webhookSecret.trim() || undefined,
          isActive: true,
          configJson: {
            shopDomain: shopDomain.trim(),
            clientId: clientId.trim(),
            publicBaseUrl: publicBaseUrl.trim(),
            defaultAcquisitionSource: defaultAcquisitionSource.trim() || "Orgánico",
            appReturnUrl: typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}` : "http://localhost:3004/orders",
            oauthScopes: ["read_orders", "read_customers", "read_products"],
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo guardar la conexión Shopify");
        return;
      }
      setInfo("Conexión Shopify guardada.");
      setClientSecret("");
      setWebhookSecret("");
      await loadIntegration(storeId);
    } catch {
      setError("Connection error");
    } finally {
      setIntegrationSaving(false);
    }
  }

async function startShopifyOauth() {
    const token = requireTokenOrRedirect();
    if (!token || !storeId) return;
    setOauthConnecting(true);
    setError("");
    setInfo("");
    try {
      const res = await fetch(`${API_BASE}/integrations/shopify/oauth/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ storeId }),
      });
      const raw = await res.text();
      let data: { authorizeUrl?: string; error?: string } = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = { error: raw || "Respuesta no válida del servidor" };
      }
      if (!res.ok) {
        setError(data.error || "No se pudo iniciar OAuth de Shopify");
        return;
      }
      if (!data.authorizeUrl) {
        setError("Shopify no devolvió una URL de autorización válida");
        return;
      }
      setInfo("Se abrió la autorización de Shopify. Termínala y DEMARCA volverá con el estado actualizado.");
      if (typeof window !== "undefined") {
        try {
          if (window.top && window.top !== window) {
            window.top.location.href = data.authorizeUrl;
          } else {
            window.location.assign(data.authorizeUrl);
          }
        } catch {
          window.open(data.authorizeUrl, "_top");
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Connection error";
      setError(message || "Connection error");
    } finally {
      setOauthConnecting(false);
    }
  }

  async function simulateShopifyOrder() {
    const token = requireTokenOrRedirect();
    if (!token || !storeId) return;
    setSimulationRunning(true);
    setError("");
    setInfo("");
    try {
      const res = await fetch(`${API_BASE}/integrations/webhooks/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          storeId,
          provider: "shopify",
          topic: "order.created",
          payload: {
            orderNumber: `SHOP-${Date.now()}`,
            currency: "EUR",
            totalPrice: 199.99,
            status: "paid",
            paymentStatus: "paid",
            customerEmail: `shopify+${Date.now()}@demarca.local`,
            customerName: "Cliente Shopify DEMARCA",
            customerCountryCode: "ES",
            createdAt: new Date().toISOString(),
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo simular el pedido Shopify");
        return;
      }
      setInfo("Pedido Shopify simulado correctamente dentro de DEMARCA.");
      await loadAll(storeId, searchQuery);
      await loadIntegration(storeId);
    } catch {
      setError("Connection error");
    } finally {
      setSimulationRunning(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#E8EAEC] p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="mb-2">
          <h1 className="text-[32px] font-black text-[#151B43]">Shopify DEMARCA</h1>
          <p className="mt-1 text-[13px] text-[#616984]">{storeName ? `Tienda: ${storeName}` : "Canal Shopify de ventas y operacion"}</p>
        </div>
        {error ? <div className="rounded-xl bg-[#FDECEC] px-4 py-3 text-[14px] text-[#B42318]">{error}</div> : null}
        {info ? <div className="rounded-xl bg-[#ECFDF3] px-4 py-3 text-[14px] text-[#067647]">{info}</div> : null}

        <div className="rounded-2xl bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[24px] font-black text-[#151B43]">Conectar Shopify</h2>
              <p className="mt-2 text-[15px] text-[#667085]">Aquí prepararás la conexión de la tienda Shopify, el webhook y la prueba de importación de pedidos.</p>
            </div>
            <div className="rounded-2xl bg-[#F7F8FB] px-4 py-3 text-right">
              <div className="text-[12px] uppercase tracking-wide text-[#7B839C]">Estado</div>
              <div className="mt-2 text-[16px] font-semibold text-[#151B43]">
                {integrationLoading ? "Cargando..." : integrationConfig?.hasOauthAccessToken ? "OAuth activo" : integrationConfig?.isActive ? "Conectado" : "Pendiente"}
              </div>
              <div className="mt-1 text-[12px] text-[#7B839C]">
                {integrationConfig?.updatedAt ? `Actualizado ${formatDate(integrationConfig.updatedAt)}` : "Sin guardar"}
              </div>
            </div>
          </div>

          <form className="grid gap-4 md:grid-cols-2" onSubmit={saveShopifyConfig}>
            <div>
              <div className="mb-2 text-[14px] text-[#3B4256]">Dominio Shopify</div>
              <input
                className="h-[48px] w-full rounded-full border border-[#D8DDEA] px-4 text-[14px] outline-none"
                placeholder="demarcaofficial.myshopify.com"
                value={shopDomain}
                onChange={(e) => setShopDomain(e.target.value)}
              />
            </div>
            <div>
              <div className="mb-2 text-[14px] text-[#3B4256]">Client ID</div>
              <input
                className="h-[48px] w-full rounded-full border border-[#D8DDEA] px-4 text-[14px] outline-none"
                placeholder="ID de cliente de Shopify"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              />
            </div>
            <div>
              <div className="mb-2 text-[14px] text-[#3B4256]">Client secret</div>
              <input
                className="h-[48px] w-full rounded-full border border-[#D8DDEA] px-4 text-[14px] outline-none"
                placeholder={integrationConfig?.hasApiKey ? "Secret guardado. Escribe uno nuevo solo si vas a reemplazarlo." : "Secreto de Shopify"}
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
              />
            </div>
            <div>
              <div className="mb-2 text-[14px] text-[#3B4256]">Origen por defecto</div>
              <select
                className="h-[48px] w-full rounded-full border border-[#D8DDEA] px-4 text-[14px] outline-none"
                value={defaultAcquisitionSource}
                onChange={(e) => setDefaultAcquisitionSource(e.target.value)}
              >
                <option>Orgánico</option>
                <option>Idealo ES</option>
                <option>Idealo DE</option>
                <option>Google Ads</option>
                <option>Meta Ads</option>
                <option>Email</option>
                <option>Directo</option>
                <option>Otro</option>
              </select>
            </div>
            <div>
              <div className="mb-2 text-[14px] text-[#3B4256]">Webhook secret</div>
              <input
                className="h-[48px] w-full rounded-full border border-[#D8DDEA] px-4 text-[14px] outline-none"
                placeholder={integrationConfig?.hasWebhookSecret ? "Secret guardado. Escribe uno nuevo solo si vas a reemplazarlo." : "whsec_..."}
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
              />
            </div>
            <div>
              <div className="mb-2 text-[14px] text-[#3B4256]">URL pública backend</div>
              <input
                className="h-[48px] w-full rounded-full border border-[#D8DDEA] px-4 text-[14px] outline-none"
                value={publicBaseUrl}
                onChange={(e) => setPublicBaseUrl(e.target.value)}
              />
            </div>
            <div>
              <div className="mb-2 text-[14px] text-[#3B4256]">Webhook pedidos Shopify</div>
              <div className="flex h-[48px] items-center rounded-full border border-[#D8DDEA] bg-[#F8F9FC] px-4 text-[13px] text-[#52607A]">
                {webhookUrl || "Necesitas storeCode y URL pública"}
              </div>
            </div>
            <div className="rounded-2xl bg-[#F7F8FB] p-4 text-[14px] text-[#52607A] md:col-span-2">
              Aquí guardas exactamente lo que Shopify Dev Dashboard sí te da hoy: dominio, Client ID, Client Secret y webhook de pedidos. El intercambio OAuth/token real vendrá después.
            </div>
            <div className="flex items-center gap-3 md:col-span-2">
              <button
                className="h-[48px] rounded-full bg-[#0B1230] px-6 text-[15px] text-white disabled:opacity-50"
                type="submit"
                disabled={integrationSaving}
              >
                {integrationSaving ? "Guardando..." : "Guardar conexión"}
              </button>
              <button
                className="h-[48px] rounded-full border border-[#D8DDEA] bg-white px-6 text-[15px] text-[#1D2647] disabled:opacity-50"
                type="button"
                onClick={startShopifyOauth}
                disabled={oauthConnecting || !integrationConfig?.isActive || !shopDomain.trim() || !clientId.trim()}
              >
                {oauthConnecting ? "Conectando..." : integrationConfig?.hasOauthAccessToken ? "Reconectar Shopify" : "Conectar con Shopify"}
              </button>
              <button
                className="h-[48px] rounded-full border border-[#D8DDEA] bg-white px-6 text-[15px] text-[#1D2647] disabled:opacity-50"
                type="button"
                onClick={simulateShopifyOrder}
                disabled={simulationRunning || !integrationConfig?.isActive}
              >
                {simulationRunning ? "Probando..." : "Probar pedido Shopify"}
              </button>
            </div>
          </form>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[24px] font-black text-[#151B43]">Pedidos del canal</h2>
              <p className="mt-2 text-[15px] text-[#667085]">Gestiona pedidos, backorders y alertas operativas del canal Shopify de DEMARCA.</p>
            </div>
            <div className="grid min-w-[520px] grid-cols-4 gap-3">
              <div className="rounded-2xl bg-[#F7F8FB] p-4">
                <div className="text-[12px] uppercase tracking-wide text-[#7B839C]">Pedidos</div>
                <div className="mt-2 text-[28px] font-black text-[#151B43]">{orders.length}</div>
              </div>
              <div className="rounded-2xl bg-[#F7F8FB] p-4">
                <div className="text-[12px] uppercase tracking-wide text-[#7B839C]">Revenue</div>
                <div className="mt-2 text-[20px] font-black text-[#151B43]">{formatMoney(totalRevenue)}</div>
              </div>
              <div className="rounded-2xl bg-[#F7F8FB] p-4">
                <div className="text-[12px] uppercase tracking-wide text-[#7B839C]">Profit</div>
                <div className="mt-2 text-[20px] font-black text-[#151B43]">{formatMoney(totalProfit)}</div>
              </div>
              <div className="rounded-2xl bg-[#F7F8FB] p-4">
                <div className="text-[12px] uppercase tracking-wide text-[#7B839C]">Backorders / alertas</div>
                <div className="mt-2 text-[20px] font-black text-[#151B43]">{backorderCount} / {activeAlerts}</div>
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <input
              className="h-[54px] rounded-full border border-[#D8DDEA] bg-white px-5 text-[18px] text-[#1D2340] outline-none"
              placeholder="Buscar por número de pedido, plataforma o canal"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button
              className="h-[54px] rounded-full border border-[#CFD5E3] bg-white px-8 text-[18px] text-[#1D2647] hover:bg-[#F8F9FC]"
              onClick={() => storeId && loadAll(storeId, searchQuery)}
            >
              Buscar
            </button>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h3 className="text-[24px] font-black text-[#151B43]">Nuevo pedido</h3>
            <label className="flex h-[42px] items-center gap-2 whitespace-nowrap rounded-full border border-[#D8DDEA] px-4 text-[13px] text-[#3B4256]">
              <input type="checkbox" checked={allowBackorder} onChange={(e) => setAllowBackorder(e.target.checked)} />
              Permitir backorder
            </label>
          </div>
          <form className="grid gap-3 md:grid-cols-[150px_150px_190px_80px_90px_minmax(220px,1fr)_130px_170px]" onSubmit={createOrder}>
            <input className="h-[46px] rounded-full border border-[#D8DDEA] px-4 text-[14px] outline-none" placeholder="SO-1169" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} required />
            <input className="h-[46px] rounded-full border border-[#D8DDEA] px-4 text-[14px] outline-none" value={platform} onChange={(e) => setPlatform(e.target.value)} />
            <select className="h-[46px] rounded-full border border-[#D8DDEA] px-4 text-[14px] outline-none" value={sourceChannelId} onChange={(e) => setSourceChannelId(e.target.value)}>
              <option value="">Canal origen</option>
              {channels.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.name}
                </option>
              ))}
            </select>
            <input className="h-[46px] rounded-full border border-[#D8DDEA] px-4 text-[13px] outline-none" placeholder="País" value={country} onChange={(e) => setCountry(e.target.value)} />
            <input className="h-[46px] rounded-full border border-[#D8DDEA] px-4 text-[13px] outline-none" placeholder="EUR" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <select className="h-[46px] rounded-full border border-[#D8DDEA] px-4 text-[14px] outline-none" value={productId} onChange={(e) => setProductId(e.target.value)} required>
              <option value="">Producto</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.brand} {product.model}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <input className="h-[46px] w-[54px] rounded-full border border-[#D8DDEA] px-3 text-[13px] outline-none" value={qty} onChange={(e) => setQty(e.target.value)} />
              <button className="h-[46px] flex-1 rounded-full bg-[#0B1230] px-4 text-[15px] text-white" type="submit">
                Crear
              </button>
            </div>
          </form>
        </div>

        <div className="overflow-hidden rounded-2xl bg-white shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
          <table className="min-w-full text-left text-[15px]">
            <thead className="border-b border-[#D0D5DD] bg-[#F8F9FC] text-[#151B43]">
              <tr>
                <th className="px-4 py-3 font-semibold">Pedido</th>
                <th className="px-4 py-3 font-semibold">Plataforma</th>
                <th className="px-4 py-3 font-semibold">Canal</th>
                <th className="px-4 py-3 font-semibold">Gross EUR</th>
                <th className="px-4 py-3 font-semibold">Profit EUR</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 font-semibold">Pago</th>
                <th className="px-4 py-3 font-semibold">Fecha</th>
              </tr>
            </thead>
            <tbody className="bg-white text-[#3B4256]">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-[16px] text-[#7B839C]">
                    Cargando pedidos...
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-[16px] text-[#7B839C]">
                    Sin pedidos.
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr key={order.id} className="border-b border-[#EEF1F6] last:border-b-0">
                    <td className="px-4 py-4 font-medium text-[#151B43]">{order.orderNumber}</td>
                    <td className="px-4 py-4">{order.platform}</td>
                    <td className="px-4 py-4">{order.sourceLabel || "-"}</td>
                    <td className="px-4 py-4">{formatMoney(order.grossAmountEurFrozen)}</td>
                    <td className="px-4 py-4">{formatMoney(order.netProfitEur)}</td>
                    <td className="px-4 py-4">{orderStatusLabel(order.status)}</td>
                    <td className="px-4 py-4">{paymentStatusLabel(order.paymentStatus)}</td>
                    <td className="px-4 py-4">{formatDate(order.orderedAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-[24px] font-black text-[#151B43]">Backorders abiertos</h3>
                <p className="mt-1 text-[15px] text-[#667085]">Cumple faltantes con FIFO global o por almacén.</p>
              </div>
              <select className="h-[46px] rounded-full border border-[#D8DDEA] px-4 text-[14px] outline-none" value={fulfillWarehouseId} onChange={(e) => setFulfillWarehouseId(e.target.value)}>
                <option value="">FIFO global</option>
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.code} - {warehouse.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-3">
              {backorders.length === 0 ? (
                <div className="rounded-2xl border border-[#E4E7EC] bg-[#F7F8FB] p-4 text-[15px] text-[#667085]">Sin backorders abiertos.</div>
              ) : (
                backorders.map((backorder) => (
                  <div key={backorder.id} className="rounded-2xl border border-[#E4E7EC] bg-[#FBFCFE] p-4">
                    <div className="mb-3 text-[15px] text-[#151B43]">
                      <span className="font-semibold">{backorder.order.orderNumber}</span> · {backorder.product.brand} {backorder.product.model}
                    </div>
                    <div className="mb-3 text-[14px] text-[#667085]">
                      Faltan {Math.max(Number(backorder.missingQty || 0) - Number(backorder.fulfilledQty || 0), 0)} unidad(es)
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        className="h-[44px] w-[100px] rounded-full border border-[#D8DDEA] px-4 text-[14px] outline-none"
                        value={fulfillQtyByBackorder[backorder.id] ?? ""}
                        placeholder="qty"
                        onChange={(e) =>
                          setFulfillQtyByBackorder((prev) => ({
                            ...prev,
                            [backorder.id]: e.target.value,
                          }))
                        }
                      />
                      <button
                        className="h-[44px] rounded-full bg-[#0B1230] px-5 text-[15px] text-white disabled:opacity-50"
                        onClick={() => fulfillBackorder(backorder)}
                        disabled={fulfillingBackorderId === backorder.id}
                      >
                        {fulfillingBackorderId === backorder.id ? "..." : "Cumplir"}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
            <div className="mb-4">
              <h3 className="text-[24px] font-black text-[#151B43]">Alertas de stock bajo</h3>
              <p className="mt-1 text-[15px] text-[#667085]">Productos con riesgo de generar backorder en Shopify DEMARCA.</p>
            </div>
            <div className="space-y-3">
              {stockAlerts.length === 0 ? (
                <div className="rounded-2xl border border-[#E4E7EC] bg-[#F7F8FB] p-4 text-[15px] text-[#667085]">Sin alertas de stock bajo.</div>
              ) : (
                stockAlerts.map((alert) => (
                  <div key={alert.productId} className="rounded-2xl border border-[#E4E7EC] bg-[#FBFCFE] p-4">
                    <div className="font-medium text-[#151B43]">
                      {alert.brand} {alert.model}
                    </div>
                    <div className="mt-1 text-[14px] text-[#667085]">
                      Stock actual: {alert.currentStock} · umbral: {alert.threshold}
                    </div>
                    <div className="mt-2 inline-flex rounded-full bg-[#FEF3F2] px-3 py-1 text-[12px] text-[#B42318]">{alert.severity}</div>
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
