"use client";

import { useEffect, useState } from "react";
import { requireTokenOrRedirect } from "../lib/auth";
import Topbar from "../components/topbar";
import { useStorePermissions } from "../lib/access";
import Link from "next/link";

const API_BASE = "http://localhost:3001";

type Warehouse = {
  id: string;
  code: string;
  name: string;
  country: string | null;
  locations: { id: string; code: string; name: string | null }[];
};

type Channel = {
  id: string;
  code: string;
  name: string;
  type: string;
  status: string;
};

type IntegrationConfig = {
  id: string;
  provider: string;
  isActive: boolean;
  hasWebhookSecret: boolean;
  hasApiKey: boolean;
  configJson?: unknown;
  lastWebhookAt: string | null;
  lastWebhookStatus: string | null;
  updatedAt: string;
};

type IntegrationEvent = {
  id: string;
  provider: string;
  topic: string;
  externalEventId: string;
  status: string;
  errorMessage: string | null;
  receivedAt: string;
  processedAt: string | null;
  salesOrderId: string | null;
};

type IntegrationOutboxItem = {
  id: string;
  provider: string;
  topic: string;
  entityType: string;
  entityId: string | null;
  status: string;
  attemptCount: number;
  nextAttemptAt: string;
  lastError: string | null;
  createdAt: string;
};

type OutboxJobState = {
  enabled: boolean;
  running: boolean;
  lastRunAt: string | null;
  lastRunStatus: string;
};

type IntegrationHealth = {
  range: { hours: number; since: string };
  health: { level: string; issues: string[] };
  webhookTotals: {
    total: number;
    processed: number;
    failed: number;
    ignored: number;
    duplicate: number;
    received: number;
    deniedSignature: number;
    avgProcessingMs: number;
    p95ProcessingMs: number;
  };
  outboxTotals: {
    total: number;
    pending: number;
    processing: number;
    sent: number;
    failed: number;
    dead: number;
    avgAttemptsFailed: number;
  };
  byProvider: { provider: string; webhooks: number; webhookFailed: number; outbox: number; outboxFailed: number }[];
  recentErrors: { source: string; provider: string; topic: string; status: string; error: string; at: string }[];
  sla: { webhookMinutes: number; outboxMinutes: number; overdueWebhooks: number; overdueOutbox: number };
};

type IntegrationAlert = {
  id: string;
  title: string;
  body: string | null;
  severity: string;
  isRead: boolean;
  createdAt: string;
};

type IntegrationTimelineItem = {
  type: string;
  provider: string | null;
  topic: string;
  status: string;
  message: string | null;
  at: string;
};

type MappingPreview = {
  parsed: {
    orderNumber: string | null;
    currencyCode: string;
    total: number;
    orderedAt: string;
    customerEmail: string | null;
    customerName: string | null;
    countryCode: string | null;
    status: string;
    paymentStatus: string;
  };
  resolved: Record<string, { value: unknown; path: string | null }>;
  warnings: string[];
};

export default function SettingsPage() {
  const { loading: permissionsLoading, permissions, error: permissionsError } = useStorePermissions();
  const [storeId, setStoreId] = useState("");
  const [storeName, setStoreName] = useState("");
  const [error, setError] = useState("");
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationConfig[]>([]);
  const [integrationEvents, setIntegrationEvents] = useState<IntegrationEvent[]>([]);
  const [outboxEvents, setOutboxEvents] = useState<IntegrationOutboxItem[]>([]);
  const [outboxJob, setOutboxJob] = useState<OutboxJobState | null>(null);
  const [integrationHealth, setIntegrationHealth] = useState<IntegrationHealth | null>(null);
  const [integrationAlerts, setIntegrationAlerts] = useState<IntegrationAlert[]>([]);
  const [integrationTimeline, setIntegrationTimeline] = useState<IntegrationTimelineItem[]>([]);

  const [whCode, setWhCode] = useState("");
  const [whName, setWhName] = useState("");
  const [whCountry, setWhCountry] = useState("ES");

  const [chCode, setChCode] = useState("");
  const [chName, setChName] = useState("");
  const [chType, setChType] = useState("shopify");
  const [locWarehouseId, setLocWarehouseId] = useState("");
  const [locCode, setLocCode] = useState("");
  const [locName, setLocName] = useState("");
  const [intProvider, setIntProvider] = useState("shopify");
  const [intWebhookSecret, setIntWebhookSecret] = useState("");
  const [intApiKey, setIntApiKey] = useState("");
  const [intActive, setIntActive] = useState(true);
  const [intMappingJson, setIntMappingJson] = useState("");
  const [outboxProvider, setOutboxProvider] = useState("shopify");
  const [outboxTopic, setOutboxTopic] = useState("order.sync");
  const [simTopic, setSimTopic] = useState("order.created");
  const [simOrderNumber, setSimOrderNumber] = useState("");
  const [samplePayloadJson, setSamplePayloadJson] = useState(
    JSON.stringify(
      {
        orderNumber: "SIM-001",
        currency: "EUR",
        totalPrice: 99.9,
        status: "paid",
        paymentStatus: "paid",
        customerEmail: "sample@demarca.local",
        customerName: "Sample User",
        customerCountryCode: "ES",
      },
      null,
      2
    )
  );
  const [mappingPreview, setMappingPreview] = useState<MappingPreview | null>(null);
  const [eventReplayStatus, setEventReplayStatus] = useState("failed");
  const [eventDetail, setEventDetail] = useState<unknown>(null);
  const [slaWebhookMinutes, setSlaWebhookMinutes] = useState(15);
  const [slaOutboxMinutes, setSlaOutboxMinutes] = useState(20);
  const [slaWebhookP95Ms, setSlaWebhookP95Ms] = useState(30000);
  const [slaWebhookFailed, setSlaWebhookFailed] = useState(5);
  const [slaOutboxFailed, setSlaOutboxFailed] = useState(10);
  const [slaDeniedSig, setSlaDeniedSig] = useState(3);
  const [slaAutoPause, setSlaAutoPause] = useState(false);

  function mappingTextFromConfig(provider: string, list: IntegrationConfig[]) {
    const cfg = list.find((i) => i.provider === provider);
    const raw = cfg?.configJson;
    const mapping = raw && typeof raw === "object" && (raw as { mapping?: unknown }).mapping ? (raw as { mapping: unknown }).mapping : null;
    if (!mapping) return "";
    try {
      return JSON.stringify(mapping, null, 2);
    } catch {
      return "";
    }
  }

  async function loadAll(currentStoreId: string) {
    const token = requireTokenOrRedirect();
    if (!token) return;
    setError("");
    try {
      const [wRes, cRes, iRes, hRes, aRes, tRes] = await Promise.all([
        fetch(`${API_BASE}/stores/${currentStoreId}/warehouses`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/stores/${currentStoreId}/channels`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/integrations/config?storeId=${encodeURIComponent(currentStoreId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/integrations/health?storeId=${encodeURIComponent(currentStoreId)}&hours=24`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/integrations/alerts?storeId=${encodeURIComponent(currentStoreId)}&onlyOpen=1`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/integrations/timeline?storeId=${encodeURIComponent(currentStoreId)}&limit=80`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      const wData = await wRes.json();
      const cData = await cRes.json();
      const iData = await iRes.json();
      const hData = await hRes.json();
      const aData = await aRes.json();
      const tData = await tRes.json();

      if (wRes.ok) setWarehouses(wData.warehouses || []);
      if (cRes.ok) setChannels(cData.channels || []);
      if (iRes.ok) {
        const nextIntegrations = (iData.configs || []) as IntegrationConfig[];
        setIntegrations(nextIntegrations);
        setIntegrationEvents(iData.events || []);
        setOutboxEvents(iData.outbox || []);
        setOutboxJob((iData.outboxJob as OutboxJobState) || null);
        setIntMappingJson(mappingTextFromConfig(intProvider, nextIntegrations));
      }
      if (hRes.ok) {
        setIntegrationHealth(hData as IntegrationHealth);
      }
      if (aRes.ok) {
        setIntegrationAlerts((aData.alerts || []) as IntegrationAlert[]);
      }
      if (tRes.ok) {
        setIntegrationTimeline((tData.items || []) as IntegrationTimelineItem[]);
      }
      if (!wRes.ok) setError(wData.error || "Error loading warehouses");
      if (!cRes.ok) setError(cData.error || "Error loading channels");
      if (!iRes.ok) setError(iData.error || "Error loading integrations");
      if (!hRes.ok) setError(hData.error || "Error loading integrations health");
      if (!aRes.ok) setError(aData.error || "Error loading integrations alerts");
      if (!tRes.ok) setError(tData.error || "Error loading timeline");
    } catch {
      setError("Connection error");
    }
  }

  useEffect(() => {
    const token = requireTokenOrRedirect();
    if (!token) return;

    (async () => {
      const selectedStoreId = localStorage.getItem("selectedStoreId");
      if (!selectedStoreId) return;

      let nextStoreName = "";
      try {
        const storesRaw = localStorage.getItem("stores");
        if (storesRaw) {
          const stores = JSON.parse(storesRaw) as { storeId: string; storeName: string }[];
          nextStoreName = stores.find((s) => s.storeId === selectedStoreId)?.storeName || "";
        }
      } catch {}

      setStoreId(selectedStoreId);
      setStoreName(nextStoreName);
      await loadAll(selectedStoreId);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (permissionsLoading) return <div className="min-h-screen bg-gray-100 p-6">Cargando permisos...</div>;
  if (permissionsError) return <div className="min-h-screen bg-gray-100 p-6 text-red-700">{permissionsError}</div>;
  if (!permissions.settingsWrite) {
    return <div className="min-h-screen bg-gray-100 p-6 text-red-700">No autorizado para Configuracion.</div>;
  }

  async function createWarehouse(e: React.FormEvent) {
    e.preventDefault();
    const token = requireTokenOrRedirect();
    if (!token || !storeId) return;
    const res = await fetch(`${API_BASE}/stores/${storeId}/warehouses`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ code: whCode, name: whName, country: whCountry, type: "own", status: "active" }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error || "Cannot create warehouse");
    setWhCode("");
    setWhName("");
    loadAll(storeId);
  }

  async function createChannel(e: React.FormEvent) {
    e.preventDefault();
    const token = requireTokenOrRedirect();
    if (!token || !storeId) return;
    const res = await fetch(`${API_BASE}/stores/${storeId}/channels`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ code: chCode, name: chName, type: chType, status: "active" }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error || "Cannot create channel");
    setChCode("");
    setChName("");
    loadAll(storeId);
  }

  async function createLocation(e: React.FormEvent) {
    e.preventDefault();
    const token = requireTokenOrRedirect();
    if (!token || !storeId || !locWarehouseId || !locCode) return;
    const res = await fetch(`${API_BASE}/stores/${storeId}/warehouses/${locWarehouseId}/locations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ code: locCode, name: locName || null }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error || "Cannot create location");
    setLocCode("");
    setLocName("");
    await loadAll(storeId);
  }

  async function upsertIntegration(e: React.FormEvent) {
    e.preventDefault();
    const token = requireTokenOrRedirect();
    if (!token || !storeId || !intProvider) return;
    let configJson: Record<string, unknown> | null = null;
    if (intMappingJson.trim()) {
      try {
        const parsed = JSON.parse(intMappingJson);
        if (!parsed || typeof parsed !== "object") {
          return setError("Mapping JSON invalido");
        }
        configJson = { mapping: parsed as Record<string, unknown> };
      } catch {
        return setError("Mapping JSON invalido");
      }
    }

    const res = await fetch(`${API_BASE}/integrations/config/upsert`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        storeId,
        provider: intProvider,
        isActive: intActive,
        webhookSecret: intWebhookSecret,
        apiKey: intApiKey,
        configJson: {
          ...(configJson || {}),
          sla: {
            webhookMinutes: slaWebhookMinutes,
            outboxMinutes: slaOutboxMinutes,
            webhookP95Ms: slaWebhookP95Ms,
            webhookFailed: slaWebhookFailed,
            outboxFailed: slaOutboxFailed,
            deniedSig: slaDeniedSig,
            autoPauseOutbox: slaAutoPause,
          },
        },
      }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error || "Cannot save integration");
    setIntWebhookSecret("");
    setIntApiKey("");
    await loadAll(storeId);
  }

  async function processIntegrationEvent(eventId: string) {
    const token = requireTokenOrRedirect();
    if (!token || !storeId) return;
    const res = await fetch(`${API_BASE}/integrations/events/${encodeURIComponent(eventId)}/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ storeId }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error || "Cannot process event");
    await loadAll(storeId);
  }

  async function replayIntegrationEvents() {
    const token = requireTokenOrRedirect();
    if (!token || !storeId) return;
    const res = await fetch(`${API_BASE}/integrations/events/replay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        storeId,
        provider: intProvider,
        status: eventReplayStatus,
        limit: 60,
      }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error || "Cannot replay events");
    await loadAll(storeId);
  }

  async function viewIntegrationEventDetail(eventId: string) {
    const token = requireTokenOrRedirect();
    if (!token || !storeId) return;
    const res = await fetch(
      `${API_BASE}/integrations/events/${encodeURIComponent(eventId)}?storeId=${encodeURIComponent(storeId)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await res.json();
    if (!res.ok) return setError(data.error || "Cannot load event detail");
    setEventDetail(data.event || null);
  }

  async function enqueueOutboxTest() {
    const token = requireTokenOrRedirect();
    if (!token || !storeId) return;
    const res = await fetch(`${API_BASE}/integrations/outbox/enqueue`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        storeId,
        provider: outboxProvider,
        topic: outboxTopic,
        entityType: "manual_test",
        entityId: null,
        dedupeKey: `manual:${outboxProvider}:${outboxTopic}:${Date.now()}`,
        payload: { source: "settings_ui_test", at: new Date().toISOString() },
      }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error || "Cannot enqueue outbox");
    await loadAll(storeId);
  }

  async function runOutboxNow() {
    const token = requireTokenOrRedirect();
    if (!token || !storeId) return;
    const res = await fetch(`${API_BASE}/integrations/outbox/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ storeId, limit: 120 }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error || "Cannot run outbox");
    await loadAll(storeId);
  }

  async function retryDeadOutbox() {
    const token = requireTokenOrRedirect();
    if (!token || !storeId) return;
    const res = await fetch(`${API_BASE}/integrations/outbox/retry-dead`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ storeId, provider: outboxProvider, limit: 80 }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error || "Cannot retry dead outbox");
    await loadAll(storeId);
  }

  async function simulateWebhook() {
    const token = requireTokenOrRedirect();
    if (!token || !storeId) return;
    const res = await fetch(`${API_BASE}/integrations/webhooks/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        storeId,
        provider: intProvider,
        topic: simTopic,
        ...(simOrderNumber ? { orderNumber: simOrderNumber } : {}),
      }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error || "Cannot simulate webhook");
    setSimOrderNumber("");
    await loadAll(storeId);
  }

  async function refreshIntegrationHealth() {
    const token = requireTokenOrRedirect();
    if (!token || !storeId) return;
    const res = await fetch(`${API_BASE}/integrations/health?storeId=${encodeURIComponent(storeId)}&hours=24`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error || "Cannot load integrations health");
    setIntegrationHealth(data as IntegrationHealth);
  }

  async function refreshTimeline() {
    const token = requireTokenOrRedirect();
    if (!token || !storeId) return;
    const res = await fetch(`${API_BASE}/integrations/timeline?storeId=${encodeURIComponent(storeId)}&limit=80`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error || "Cannot load timeline");
    setIntegrationTimeline((data.items || []) as IntegrationTimelineItem[]);
  }

  async function evaluateIntegrationAlerts() {
    const token = requireTokenOrRedirect();
    if (!token || !storeId) return;
    const res = await fetch(`${API_BASE}/integrations/alerts/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ storeId, windowMinutes: 15 }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error || "Cannot evaluate integration alerts");
    await loadAll(storeId);
  }

  async function previewMapping() {
    const token = requireTokenOrRedirect();
    if (!token || !storeId || !intProvider) return;
    let payload: Record<string, unknown>;
    let mapping: Record<string, unknown> | null = null;
    try {
      payload = JSON.parse(samplePayloadJson);
    } catch {
      return setError("Payload JSON invalido");
    }
    if (intMappingJson.trim()) {
      try {
        mapping = JSON.parse(intMappingJson);
      } catch {
        return setError("Mapping JSON invalido");
      }
    }
    const res = await fetch(`${API_BASE}/integrations/mapping/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ storeId, provider: intProvider, payload, mapping }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error || "Cannot preview mapping");
    setMappingPreview(data as MappingPreview);
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <Topbar title="Configuracion" storeName={storeName} />
        <div className="bg-white p-4 rounded-2xl shadow-md flex items-center justify-between">
          <div>
            <div className="font-semibold">Manual del sistema</div>
            <div className="text-sm text-gray-600">Ver el manual funcional completo y la guia de Fase 1.</div>
          </div>
          <Link href="/manual" className="rounded border px-4 py-2 hover:bg-gray-50">
            Manual
          </Link>
        </div>
        {error ? <div className="bg-red-100 text-red-700 p-3 rounded">{error}</div> : null}

        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-white p-4 rounded-2xl shadow-md">
            <h2 className="font-semibold mb-3">Almacenes</h2>
            <form className="grid grid-cols-4 gap-2 mb-3" onSubmit={createWarehouse}>
              <input
                className="border rounded px-3 py-2"
                placeholder="Code"
                value={whCode}
                onChange={(e) => setWhCode(e.target.value)}
                required
              />
              <input
                className="border rounded px-3 py-2"
                placeholder="Name"
                value={whName}
                onChange={(e) => setWhName(e.target.value)}
                required
              />
              <input
                className="border rounded px-3 py-2"
                placeholder="Country"
                value={whCountry}
                onChange={(e) => setWhCountry(e.target.value)}
              />
              <button className="rounded bg-black text-white px-3 py-2" type="submit">
                Crear
              </button>
            </form>
            <div className="text-sm space-y-2">
              {warehouses.map((w) => (
                <div key={w.id} className="border rounded p-2">
                  <div>
                    <b>{w.code}</b> - {w.name} ({w.country || "-"})
                  </div>
                  <div className="text-xs text-gray-600">
                    Ubicaciones: {w.locations.length ? w.locations.map((l) => l.code).join(", ") : "sin ubicaciones"}
                  </div>
                </div>
              ))}
            </div>
            <form className="grid grid-cols-3 gap-2 mt-3" onSubmit={createLocation}>
              <select
                className="border rounded px-3 py-2"
                value={locWarehouseId}
                onChange={(e) => setLocWarehouseId(e.target.value)}
              >
                <option value="">Warehouse</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code}
                  </option>
                ))}
              </select>
              <input
                className="border rounded px-3 py-2"
                placeholder="Location code"
                value={locCode}
                onChange={(e) => setLocCode(e.target.value)}
              />
              <div className="flex gap-2">
                <input
                  className="border rounded px-3 py-2 w-full"
                  placeholder="Location name"
                  value={locName}
                  onChange={(e) => setLocName(e.target.value)}
                />
                <button className="rounded bg-black text-white px-3 py-2" type="submit">
                  +
                </button>
              </div>
            </form>
          </div>

          <div className="bg-white p-4 rounded-2xl shadow-md">
            <h2 className="font-semibold mb-3">Canales</h2>
            <form className="grid grid-cols-4 gap-2 mb-3" onSubmit={createChannel}>
              <input
                className="border rounded px-3 py-2"
                placeholder="Code"
                value={chCode}
                onChange={(e) => setChCode(e.target.value)}
                required
              />
              <input
                className="border rounded px-3 py-2"
                placeholder="Name"
                value={chName}
                onChange={(e) => setChName(e.target.value)}
                required
              />
              <select className="border rounded px-3 py-2" value={chType} onChange={(e) => setChType(e.target.value)}>
                <option value="shopify">shopify</option>
                <option value="idealo">idealo</option>
                <option value="marketplace">marketplace</option>
                <option value="manual">manual</option>
                <option value="other">other</option>
              </select>
              <button className="rounded bg-black text-white px-3 py-2" type="submit">
                Crear
              </button>
            </form>
            <div className="text-sm space-y-2">
              {channels.map((c) => (
                <div key={c.id} className="border rounded p-2">
                  <b>{c.code}</b> - {c.name} ({c.type}) [{c.status}]
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl shadow-md space-y-3">
          <h2 className="font-semibold">Integraciones / Webhooks (Fase 7)</h2>
          <form className="grid md:grid-cols-6 gap-2" onSubmit={upsertIntegration}>
            <select
              className="border rounded px-3 py-2"
              value={intProvider}
              onChange={(e) => {
                const provider = e.target.value;
                setIntProvider(provider);
                setIntMappingJson(mappingTextFromConfig(provider, integrations));
                const cfg = integrations.find((i) => i.provider === provider)?.configJson as
                  | { sla?: Record<string, unknown> }
                  | undefined;
                const sla = cfg?.sla && typeof cfg.sla === "object" ? cfg.sla : {};
                setSlaWebhookMinutes(Number.isFinite(sla.webhookMinutes) ? Number(sla.webhookMinutes) : 15);
                setSlaOutboxMinutes(Number.isFinite(sla.outboxMinutes) ? Number(sla.outboxMinutes) : 20);
                setSlaWebhookP95Ms(Number.isFinite(sla.webhookP95Ms) ? Number(sla.webhookP95Ms) : 30000);
                setSlaWebhookFailed(Number.isFinite(sla.webhookFailed) ? Number(sla.webhookFailed) : 5);
                setSlaOutboxFailed(Number.isFinite(sla.outboxFailed) ? Number(sla.outboxFailed) : 10);
                setSlaDeniedSig(Number.isFinite(sla.deniedSig) ? Number(sla.deniedSig) : 3);
                setSlaAutoPause(Boolean(sla.autoPauseOutbox));
              }}
            >
              <option value="shopify">shopify</option>
              <option value="idealo">idealo</option>
              <option value="marketplace">marketplace</option>
              <option value="manual">manual</option>
              <option value="other">other</option>
            </select>
            <input
              className="border rounded px-3 py-2"
              placeholder="Webhook secret"
              value={intWebhookSecret}
              onChange={(e) => setIntWebhookSecret(e.target.value)}
            />
            <input
              className="border rounded px-3 py-2"
              placeholder="API key"
              value={intApiKey}
              onChange={(e) => setIntApiKey(e.target.value)}
            />
            <label className="border rounded px-3 py-2 flex items-center gap-2">
              <input type="checkbox" checked={intActive} onChange={(e) => setIntActive(e.target.checked)} />
              Activo
            </label>
            <button className="rounded bg-black text-white px-3 py-2" type="submit">
              Guardar config
            </button>
            <button className="rounded border px-3 py-2" type="button" onClick={() => void loadAll(storeId)}>
              Refrescar
            </button>
          </form>
          <div className="grid md:grid-cols-3 gap-2">
            <div className="border rounded p-2">
              <div className="font-medium text-sm mb-1">SLA / Umbrales</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <label className="flex flex-col">
                  <span>Webhook min</span>
                  <input className="border rounded px-2 py-1" type="number" value={slaWebhookMinutes} onChange={(e) => setSlaWebhookMinutes(Number(e.target.value))} />
                </label>
                <label className="flex flex-col">
                  <span>Outbox min</span>
                  <input className="border rounded px-2 py-1" type="number" value={slaOutboxMinutes} onChange={(e) => setSlaOutboxMinutes(Number(e.target.value))} />
                </label>
                <label className="flex flex-col">
                  <span>Webhook p95 ms</span>
                  <input className="border rounded px-2 py-1" type="number" value={slaWebhookP95Ms} onChange={(e) => setSlaWebhookP95Ms(Number(e.target.value))} />
                </label>
                <label className="flex flex-col">
                  <span>Webhook failed</span>
                  <input className="border rounded px-2 py-1" type="number" value={slaWebhookFailed} onChange={(e) => setSlaWebhookFailed(Number(e.target.value))} />
                </label>
                <label className="flex flex-col">
                  <span>Outbox failed</span>
                  <input className="border rounded px-2 py-1" type="number" value={slaOutboxFailed} onChange={(e) => setSlaOutboxFailed(Number(e.target.value))} />
                </label>
                <label className="flex flex-col">
                  <span>Denied sig</span>
                  <input className="border rounded px-2 py-1" type="number" value={slaDeniedSig} onChange={(e) => setSlaDeniedSig(Number(e.target.value))} />
                </label>
                <label className="flex items-center gap-2 col-span-2">
                  <input type="checkbox" checked={slaAutoPause} onChange={(e) => setSlaAutoPause(e.target.checked)} />
                  Auto-pausar outbox si falla
                </label>
              </div>
            </div>
          </div>
          <textarea
            className="border rounded px-3 py-2 w-full min-h-[120px] font-mono text-xs"
            placeholder='Mapping JSON opcional, ej: { "orderNumber":"data.order_id", "total":"data.amount" }'
            value={intMappingJson}
            onChange={(e) => setIntMappingJson(e.target.value)}
          />
          <div className="grid md:grid-cols-2 gap-2">
            <textarea
              className="border rounded px-3 py-2 w-full min-h-[140px] font-mono text-xs"
              placeholder="Payload JSON para preview"
              value={samplePayloadJson}
              onChange={(e) => setSamplePayloadJson(e.target.value)}
            />
            <div className="border rounded p-2 text-xs space-y-2">
              <button className="rounded border px-3 py-2 text-sm" onClick={() => void previewMapping()}>
                Preview mapping
              </button>
              {mappingPreview ? (
                <>
                  <div>
                    <b>Parsed</b>
                  </div>
                  <pre className="bg-gray-50 p-2 rounded overflow-auto">{JSON.stringify(mappingPreview.parsed, null, 2)}</pre>
                  <div>
                    <b>Resolved</b>
                  </div>
                  <pre className="bg-gray-50 p-2 rounded overflow-auto">{JSON.stringify(mappingPreview.resolved, null, 2)}</pre>
                  <div className="text-amber-700">{(mappingPreview.warnings || []).join(" | ")}</div>
                </>
              ) : (
                <div className="text-gray-500">Sin preview</div>
              )}
            </div>
          </div>
          <div className="grid md:grid-cols-6 gap-2">
            <select className="border rounded px-3 py-2" value={simTopic} onChange={(e) => setSimTopic(e.target.value)}>
              <option value="order.created">order.created</option>
              <option value="order.updated">order.updated</option>
              <option value="order.paid">order.paid</option>
              <option value="order.cancelled">order.cancelled</option>
            </select>
            <input
              className="border rounded px-3 py-2"
              placeholder="Order number opcional"
              value={simOrderNumber}
              onChange={(e) => setSimOrderNumber(e.target.value)}
            />
            <button className="rounded border px-3 py-2" onClick={() => void simulateWebhook()}>
              Simular webhook
            </button>
          </div>

          <div className="border rounded p-3">
            <div className="font-medium mb-2">Configuraciones</div>
            <div className="text-sm space-y-2">
              {integrations.map((i) => (
                <div key={i.id} className="border rounded p-2">
                  <b>{i.provider}</b> | active: {i.isActive ? "yes" : "no"} | secret: {i.hasWebhookSecret ? "yes" : "no"} | apiKey:{" "}
                  {i.hasApiKey ? "yes" : "no"} | last: {i.lastWebhookStatus || "-"}
                </div>
              ))}
              {integrations.length === 0 ? <div className="text-gray-500">Sin configuraciones</div> : null}
            </div>
          </div>

          <div className="border rounded p-3 overflow-auto">
            <div className="flex items-center justify-between mb-2">
              <div className="font-medium">Eventos recientes</div>
              <div className="flex gap-2 items-center">
                <select className="border rounded px-2 py-1" value={eventReplayStatus} onChange={(e) => setEventReplayStatus(e.target.value)}>
                  <option value="failed">failed</option>
                  <option value="ignored">ignored</option>
                  <option value="received">received</option>
                </select>
                <button className="rounded border px-2 py-1" onClick={() => void replayIntegrationEvents()}>
                  Replay bulk
                </button>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 pr-2">Fecha</th>
                  <th className="py-2 pr-2">Provider</th>
                  <th className="py-2 pr-2">Topic</th>
                  <th className="py-2 pr-2">Status</th>
                  <th className="py-2 pr-2">Order</th>
                  <th className="py-2 pr-2">Accion</th>
                </tr>
              </thead>
              <tbody>
                {integrationEvents.map((ev) => (
                  <tr key={ev.id} className="border-b">
                    <td className="py-2 pr-2 whitespace-nowrap">{new Date(ev.receivedAt).toLocaleString("es-ES")}</td>
                    <td className="py-2 pr-2">{ev.provider}</td>
                    <td className="py-2 pr-2">{ev.topic}</td>
                    <td className="py-2 pr-2">{ev.status}</td>
                    <td className="py-2 pr-2">{ev.salesOrderId || "-"}</td>
                    <td className="py-2 pr-2">
                      <div className="flex gap-2">
                        <button className="rounded border px-2 py-1" onClick={() => void processIntegrationEvent(ev.id)}>
                          Reprocesar
                        </button>
                        <button className="rounded border px-2 py-1" onClick={() => void viewIntegrationEventDetail(ev.id)}>
                          Ver JSON
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {integrationEvents.length === 0 ? (
                  <tr>
                    <td className="py-2 text-gray-500" colSpan={6}>
                      Sin eventos
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            {eventDetail ? (
              <pre className="mt-2 text-xs bg-gray-50 border rounded p-2 overflow-auto">{JSON.stringify(eventDetail, null, 2)}</pre>
            ) : null}
          </div>

          <div className="border rounded p-3 space-y-2 overflow-auto">
            <div className="flex items-center justify-between">
              <div className="font-medium">Salud Integraciones (24h)</div>
              <div className="flex gap-2">
                <button className="rounded border px-3 py-2" onClick={() => void refreshIntegrationHealth()}>
                  Refrescar salud
                </button>
                <button className="rounded border px-3 py-2" onClick={() => void evaluateIntegrationAlerts()}>
                  Evaluar alertas
                </button>
                <button className="rounded border px-3 py-2" onClick={() => void refreshTimeline()}>
                  Timeline
                </button>
              </div>
            </div>
            {integrationHealth ? (
              <div className="space-y-2 text-sm">
                <div className={integrationHealth.health.level === "critical" ? "text-red-700" : integrationHealth.health.level === "warning" ? "text-amber-700" : "text-green-700"}>
                  Nivel: {integrationHealth.health.level.toUpperCase()}
                </div>
                <div className="grid md:grid-cols-2 gap-2">
                  <div className="border rounded p-2">
                    <div className="font-medium">Webhook</div>
                    <div>Total: {integrationHealth.webhookTotals.total}</div>
                    <div>Processed: {integrationHealth.webhookTotals.processed}</div>
                    <div>Failed: {integrationHealth.webhookTotals.failed}</div>
                    <div>Duplicate: {integrationHealth.webhookTotals.duplicate}</div>
                    <div>Denied signature: {integrationHealth.webhookTotals.deniedSignature}</div>
                    <div>Latency avg: {integrationHealth.webhookTotals.avgProcessingMs}ms</div>
                    <div>Latency p95: {integrationHealth.webhookTotals.p95ProcessingMs}ms</div>
                    <div>
                      SLA ({integrationHealth.sla.webhookMinutes}m) overdue: {integrationHealth.sla.overdueWebhooks}
                    </div>
                  </div>
                  <div className="border rounded p-2">
                    <div className="font-medium">Outbox</div>
                    <div>Total: {integrationHealth.outboxTotals.total}</div>
                    <div>Pending: {integrationHealth.outboxTotals.pending}</div>
                    <div>Sent: {integrationHealth.outboxTotals.sent}</div>
                    <div>Failed: {integrationHealth.outboxTotals.failed}</div>
                    <div>Dead: {integrationHealth.outboxTotals.dead}</div>
                    <div>Avg attempts (failed): {integrationHealth.outboxTotals.avgAttemptsFailed}</div>
                    <div>
                      SLA ({integrationHealth.sla.outboxMinutes}m) overdue: {integrationHealth.sla.overdueOutbox}
                    </div>
                  </div>
                </div>
                <div>
                  <div className="font-medium mb-1">Issues</div>
                  {integrationHealth.health.issues.length ? (
                    integrationHealth.health.issues.map((issue, i) => (
                      <div key={`issue-${i}`} className="text-amber-700">
                        {i + 1}. {issue}
                      </div>
                    ))
                  ) : (
                    <div className="text-green-700">Sin issues</div>
                  )}
                </div>
                <div>
                  <div className="font-medium mb-1">Por proveedor</div>
                  <div className="text-xs">
                    {integrationHealth.byProvider.map((p) => (
                      <div key={p.provider}>
                        {p.provider}: webhooks {p.webhooks} (failed {p.webhookFailed}) | outbox {p.outbox} (failed {p.outboxFailed})
                      </div>
                    ))}
                    {integrationHealth.byProvider.length === 0 ? <div>Sin datos</div> : null}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-500">Sin datos de salud.</div>
            )}
            <div className="border rounded p-2">
              <div className="font-medium mb-1">Alertas abiertas ({integrationAlerts.length})</div>
              <div className="text-xs space-y-1">
                {integrationAlerts.map((a) => (
                  <div key={a.id}>
                    [{a.severity}] {new Date(a.createdAt).toLocaleString("es-ES")} - {a.title}
                  </div>
                ))}
                {integrationAlerts.length === 0 ? <div className="text-gray-500">Sin alertas abiertas</div> : null}
              </div>
            </div>
            <div className="border rounded p-2">
              <div className="font-medium mb-1">Timeline (webhooks/outbox/alert)</div>
              <div className="text-xs space-y-1 max-h-64 overflow-auto">
                {integrationTimeline.map((i, idx) => (
                  <div key={`${i.type}-${idx}`}>
                    {new Date(i.at).toLocaleString("es-ES")} | {i.type} | {i.provider || "-"} | {i.topic} | {i.status} |{" "}
                    {i.message || "-"}
                  </div>
                ))}
                {integrationTimeline.length === 0 ? <div className="text-gray-500">Sin eventos</div> : null}
              </div>
            </div>
          </div>

          <div className="border rounded p-3 space-y-2 overflow-auto">
            <div className="font-medium">Outbox (salida a canales)</div>
            <div className="flex flex-wrap gap-2">
              <select className="border rounded px-3 py-2" value={outboxProvider} onChange={(e) => setOutboxProvider(e.target.value)}>
                <option value="shopify">shopify</option>
                <option value="idealo">idealo</option>
                <option value="marketplace">marketplace</option>
                <option value="manual">manual</option>
                <option value="other">other</option>
              </select>
              <input className="border rounded px-3 py-2" value={outboxTopic} onChange={(e) => setOutboxTopic(e.target.value)} />
              <button className="rounded border px-3 py-2" onClick={() => void enqueueOutboxTest()}>
                Enqueue test
              </button>
              <button className="rounded bg-black text-white px-3 py-2" onClick={() => void runOutboxNow()}>
                Run outbox
              </button>
              <button className="rounded border px-3 py-2" onClick={() => void retryDeadOutbox()}>
                Retry dead/failed
              </button>
            </div>
            <div className="text-xs text-gray-600">
              Job: {outboxJob?.enabled ? "enabled" : "disabled"} | running: {outboxJob?.running ? "yes" : "no"} | status:{" "}
              {outboxJob?.lastRunStatus || "-"} | last: {outboxJob?.lastRunAt ? new Date(outboxJob.lastRunAt).toLocaleString("es-ES") : "-"}
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 pr-2">Fecha</th>
                  <th className="py-2 pr-2">Provider</th>
                  <th className="py-2 pr-2">Topic</th>
                  <th className="py-2 pr-2">Status</th>
                  <th className="py-2 pr-2">Attempts</th>
                  <th className="py-2 pr-2">Error</th>
                </tr>
              </thead>
              <tbody>
                {outboxEvents.map((ev) => (
                  <tr key={ev.id} className="border-b">
                    <td className="py-2 pr-2 whitespace-nowrap">{new Date(ev.createdAt).toLocaleString("es-ES")}</td>
                    <td className="py-2 pr-2">{ev.provider}</td>
                    <td className="py-2 pr-2">{ev.topic}</td>
                    <td className="py-2 pr-2">{ev.status}</td>
                    <td className="py-2 pr-2">{ev.attemptCount}</td>
                    <td className="py-2 pr-2">{ev.lastError || "-"}</td>
                  </tr>
                ))}
                {outboxEvents.length === 0 ? (
                  <tr>
                    <td className="py-2 text-gray-500" colSpan={6}>
                      Sin outbox events
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
