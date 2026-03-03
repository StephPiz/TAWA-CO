"use client";

import { useCallback, useEffect, useState } from "react";
import Topbar from "../components/topbar";
import { requireTokenOrRedirect } from "../lib/auth";
import { useStorePermissions } from "../lib/access";

const API_BASE = "http://localhost:3001";

type AuditLog = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  message: string | null;
  payload: unknown;
  createdAt: string;
  user: { id: string; fullName: string; email: string } | null;
};

type AuditMetrics = {
  range: { since: string; hours: number };
  totals: {
    totalEvents: number;
    deniedAccess: number;
    sensitiveReads: number;
    updatesWithDiff: number;
    alertNotifications: number;
  };
  byAction: { action: string; count: number }[];
  byEntity: { entityType: string; count: number }[];
  byUser: { user: string; count: number }[];
  deniedByUser: { user: string; count: number }[];
  anomalies: { type: string; severity: "warning" | "critical"; title: string; detail: string }[];
  recommendations: string[];
};

type AuditAlert = {
  id: string;
  title: string;
  body: string | null;
  createdAt: string;
  isRead: boolean;
};

type TeamMember = {
  userId: string;
  fullName: string;
  email: string;
};

type RetentionPreview = {
  policy: { securityDays: number; operationalDays: number; readDays: number; defaultDays: number };
  preview: {
    scanned: number;
    candidateDelete: number;
    byBucket: { security: number; operational: number; read: number; default: number };
  };
  generatedAt: string;
};

type IntegrityResult = {
  ok: boolean;
  scanned: number;
  verifiedRows: number;
  legacyRows: number;
  mismatches: number;
  sampleMismatches: Array<{
    id: string;
    createdAt: string;
    action: string;
    entityType: string;
    prevHashOk: boolean;
    hashOk: boolean;
  }>;
};

type AuditAnchorItem = {
  id: string;
  anchorDay: string;
  eventCount: number;
  anchorHash: string;
  signature: string;
  createdAt: string;
};

type AnchorVerifyResult = {
  ok: boolean;
  scanned: number;
  mismatches: number;
  sampleMismatches: Array<{ id: string; anchorDay: string; prevOk: boolean; hashOk: boolean; sigOk: boolean }>;
};

type AuditJobStatus = {
  enabled: boolean;
  running: boolean;
  lastRunAt: string | null;
  lastRunStatus: string;
  lastError: string | null;
  lastTargetDay: string | null;
  serverTime: string;
};

export default function AuditPage() {
  const { loading, storeId, storeName, permissions, error: permissionsError } = useStorePermissions();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [metrics, setMetrics] = useState<AuditMetrics | null>(null);
  const [alerts, setAlerts] = useState<AuditAlert[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [filterUserId, setFilterUserId] = useState("");
  const [q, setQ] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [error, setError] = useState("");
  const [retention, setRetention] = useState<RetentionPreview | null>(null);
  const [retentionBusy, setRetentionBusy] = useState(false);
  const [retentionMessage, setRetentionMessage] = useState("");
  const [integrityBusy, setIntegrityBusy] = useState(false);
  const [integrity, setIntegrity] = useState<IntegrityResult | null>(null);
  const [anchorDay, setAnchorDay] = useState("");
  const [anchors, setAnchors] = useState<AuditAnchorItem[]>([]);
  const [anchorsBusy, setAnchorsBusy] = useState(false);
  const [anchorsMessage, setAnchorsMessage] = useState("");
  const [anchorVerify, setAnchorVerify] = useState<AnchorVerifyResult | null>(null);
  const [jobStatus, setJobStatus] = useState<AuditJobStatus | null>(null);
  const [jobBusy, setJobBusy] = useState(false);

  const loadLogs = useCallback(async () => {
    const token = requireTokenOrRedirect();
    if (!token || !storeId) return;
    setError("");
    try {
      const qs = new URLSearchParams({
        storeId,
        limit: "200",
        ...(action.trim() ? { action: action.trim() } : {}),
        ...(entityType.trim() ? { entityType: entityType.trim() } : {}),
        ...(filterUserId ? { userId: filterUserId } : {}),
        ...(q.trim() ? { q: q.trim() } : {}),
        ...(dateFrom ? { dateFrom } : {}),
        ...(dateTo ? { dateTo } : {}),
      }).toString();
      const res = await fetch(`${API_BASE}/audit/logs?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const raw = await res.text();
      let data: Record<string, unknown> = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = { error: raw || `HTTP ${res.status}` };
      }
      if (!res.ok) return setError(String(data.error || `Error loading audit logs (${res.status})`));
      setLogs(Array.isArray(data.logs) ? (data.logs as AuditLog[]) : []);

      const metricsRes = await fetch(`${API_BASE}/audit/metrics?storeId=${encodeURIComponent(storeId)}&hours=24`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const metricsRaw = await metricsRes.text();
      let metricsData: Record<string, unknown> = {};
      try {
        metricsData = metricsRaw ? JSON.parse(metricsRaw) : {};
      } catch {
        metricsData = {};
      }
      if (metricsRes.ok) {
        setMetrics(metricsData as AuditMetrics);
      }

      const teamRes = await fetch(`${API_BASE}/stores/${encodeURIComponent(storeId)}/team`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const teamRaw = await teamRes.text();
      let teamData: Record<string, unknown> = {};
      try {
        teamData = teamRaw ? JSON.parse(teamRaw) : {};
      } catch {
        teamData = {};
      }
      if (teamRes.ok) {
        setMembers(Array.isArray(teamData.members) ? (teamData.members as TeamMember[]) : []);
      }

      const alertsRes = await fetch(`${API_BASE}/audit/alerts?storeId=${encodeURIComponent(storeId)}&onlyOpen=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const alertsRaw = await alertsRes.text();
      let alertsData: Record<string, unknown> = {};
      try {
        alertsData = alertsRaw ? JSON.parse(alertsRaw) : {};
      } catch {
        alertsData = {};
      }
      if (alertsRes.ok) {
        setAlerts(Array.isArray(alertsData.alerts) ? (alertsData.alerts as AuditAlert[]) : []);
      }
    } catch (e) {
      setError(`Connection error: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }, [action, entityType, filterUserId, q, dateFrom, dateTo, storeId]);

  const exportCsv = useCallback(async () => {
    const token = requireTokenOrRedirect();
    if (!token || !storeId) return;
    setError("");
    try {
      const qs = new URLSearchParams({
        storeId,
        limit: "5000",
        ...(action.trim() ? { action: action.trim() } : {}),
        ...(entityType.trim() ? { entityType: entityType.trim() } : {}),
        ...(filterUserId ? { userId: filterUserId } : {}),
        ...(q.trim() ? { q: q.trim() } : {}),
        ...(dateFrom ? { dateFrom } : {}),
        ...(dateTo ? { dateTo } : {}),
      }).toString();
      const res = await fetch(`${API_BASE}/audit/logs/export?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const raw = await res.text();
        return setError(raw || `Error export CSV (${res.status})`);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit_logs_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setError(`Connection error: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }, [action, entityType, filterUserId, q, dateFrom, dateTo, storeId]);

  const exportEvidenceJson = useCallback(async () => {
    const token = requireTokenOrRedirect();
    if (!token || !storeId) return;
    setError("");
    try {
      const qs = new URLSearchParams({
        storeId,
        limit: "2000",
        hours: "24",
        ...(action.trim() ? { action: action.trim() } : {}),
        ...(entityType.trim() ? { entityType: entityType.trim() } : {}),
        ...(filterUserId ? { userId: filterUserId } : {}),
        ...(q.trim() ? { q: q.trim() } : {}),
        ...(dateFrom ? { dateFrom } : {}),
        ...(dateTo ? { dateTo } : {}),
      }).toString();
      const res = await fetch(`${API_BASE}/audit/evidence?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const raw = await res.text();
        return setError(raw || `Error export evidencia (${res.status})`);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit_evidence_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setError(`Connection error: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }, [action, entityType, filterUserId, q, dateFrom, dateTo, storeId]);

  const ackAlert = useCallback(
    async (notificationId: string) => {
      const token = requireTokenOrRedirect();
      if (!token || !storeId) return;
      const res = await fetch(`${API_BASE}/audit/alerts/${encodeURIComponent(notificationId)}/ack`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ storeId }),
      });
      if (!res.ok) {
        const raw = await res.text();
        return setError(raw || `Error ack alert (${res.status})`);
      }
      await loadLogs();
    },
    [storeId, loadLogs]
  );

  const ackAllAlerts = useCallback(async () => {
    const token = requireTokenOrRedirect();
    if (!token || !storeId) return;
    const res = await fetch(`${API_BASE}/audit/alerts/ack-all`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ storeId }),
    });
    if (!res.ok) {
      const raw = await res.text();
      return setError(raw || `Error ack all alerts (${res.status})`);
    }
    await loadLogs();
  }, [storeId, loadLogs]);

  const loadRetentionPreview = useCallback(async () => {
    const token = requireTokenOrRedirect();
    if (!token || !storeId) return;
    setRetentionBusy(true);
    setRetentionMessage("");
    try {
      const res = await fetch(`${API_BASE}/audit/retention/policy?storeId=${encodeURIComponent(storeId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const raw = await res.text();
      let data: Record<string, unknown> = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = { error: raw || `HTTP ${res.status}` };
      }
      if (!res.ok) return setError(String(data.error || `Error retention preview (${res.status})`));
      setRetention(data as RetentionPreview);
      setRetentionMessage("Preview actualizado.");
    } catch (e) {
      setError(`Connection error: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setRetentionBusy(false);
    }
  }, [storeId]);

  const runRetention = useCallback(
    async (dryRun: boolean) => {
      const token = requireTokenOrRedirect();
      if (!token || !storeId) return;
      setRetentionBusy(true);
      setRetentionMessage("");
      try {
        const res = await fetch(`${API_BASE}/audit/retention/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ storeId, dryRun, maxDelete: 5000 }),
        });
        const raw = await res.text();
        let data: Record<string, unknown> = {};
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch {
          data = { error: raw || `HTTP ${res.status}` };
        }
        if (!res.ok) return setError(String(data.error || `Error retention run (${res.status})`));
        const deleted = Number(data.deleted || 0);
        const candidateDelete = Number(data.candidateDelete || 0);
        setRetentionMessage(
          dryRun
            ? `Dry-run completado. Candidatos: ${candidateDelete}.`
            : `Limpieza ejecutada. Eliminados: ${deleted}.`
        );
        await loadRetentionPreview();
        await loadLogs();
      } catch (e) {
        setError(`Connection error: ${e instanceof Error ? e.message : "unknown"}`);
      } finally {
        setRetentionBusy(false);
      }
    },
    [storeId, loadLogs, loadRetentionPreview]
  );

  const runIntegrityCheck = useCallback(async () => {
    const token = requireTokenOrRedirect();
    if (!token || !storeId) return;
    setIntegrityBusy(true);
    try {
      const qs = new URLSearchParams({
        storeId,
        limit: "2000",
        ...(dateFrom ? { dateFrom } : {}),
        ...(dateTo ? { dateTo } : {}),
      }).toString();
      const res = await fetch(`${API_BASE}/audit/integrity/verify?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const raw = await res.text();
      let data: Record<string, unknown> = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = { error: raw || `HTTP ${res.status}` };
      }
      if (!res.ok) return setError(String(data.error || `Error integrity verify (${res.status})`));
      setIntegrity(data as IntegrityResult);
    } catch (e) {
      setError(`Connection error: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setIntegrityBusy(false);
    }
  }, [storeId, dateFrom, dateTo]);

  const loadAnchors = useCallback(async () => {
    const token = requireTokenOrRedirect();
    if (!token || !storeId) return;
    setAnchorsBusy(true);
    setAnchorsMessage("");
    try {
      const res = await fetch(`${API_BASE}/audit/integrity/anchors?storeId=${encodeURIComponent(storeId)}&limit=60`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const raw = await res.text();
      let data: Record<string, unknown> = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = { error: raw || `HTTP ${res.status}` };
      }
      if (!res.ok) return setError(String(data.error || `Error loading anchors (${res.status})`));
      setAnchors(Array.isArray(data.anchors) ? (data.anchors as AuditAnchorItem[]) : []);
    } catch (e) {
      setError(`Connection error: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setAnchorsBusy(false);
    }
  }, [storeId]);

  const sealAnchor = useCallback(async () => {
    const token = requireTokenOrRedirect();
    if (!token || !storeId) return;
    setAnchorsBusy(true);
    setAnchorsMessage("");
    try {
      const res = await fetch(`${API_BASE}/audit/integrity/anchor-seal`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ storeId, ...(anchorDay ? { anchorDay } : {}) }),
      });
      const raw = await res.text();
      let data: Record<string, unknown> = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = { error: raw || `HTTP ${res.status}` };
      }
      if (!res.ok) return setError(String(data.error || `Error sealing anchor (${res.status})`));
      const reused = Boolean(data.reused);
      const anchor = (data.anchor as Record<string, unknown>) || {};
      setAnchorsMessage(
        reused
          ? `Anchor ya existia para ${String(anchor.anchorDay || "")}.`
          : `Anchor creado para ${String(anchor.anchorDay || "")}.`
      );
      await loadAnchors();
      await loadLogs();
    } catch (e) {
      setError(`Connection error: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setAnchorsBusy(false);
    }
  }, [storeId, anchorDay, loadAnchors, loadLogs]);

  const verifyAnchors = useCallback(async () => {
    const token = requireTokenOrRedirect();
    if (!token || !storeId) return;
    setAnchorsBusy(true);
    try {
      const res = await fetch(`${API_BASE}/audit/integrity/anchors/verify?storeId=${encodeURIComponent(storeId)}&limit=365`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const raw = await res.text();
      let data: Record<string, unknown> = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = { error: raw || `HTTP ${res.status}` };
      }
      if (!res.ok) return setError(String(data.error || `Error verify anchors (${res.status})`));
      setAnchorVerify(data as AnchorVerifyResult);
    } catch (e) {
      setError(`Connection error: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setAnchorsBusy(false);
    }
  }, [storeId]);

  const loadJobStatus = useCallback(async () => {
    const token = requireTokenOrRedirect();
    if (!token || !storeId) return;
    setJobBusy(true);
    try {
      const res = await fetch(`${API_BASE}/audit/job/status?storeId=${encodeURIComponent(storeId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const raw = await res.text();
      let data: Record<string, unknown> = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = { error: raw || `HTTP ${res.status}` };
      }
      if (!res.ok) return setError(String(data.error || `Error job status (${res.status})`));
      setJobStatus(data as AuditJobStatus);
    } catch (e) {
      setError(`Connection error: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setJobBusy(false);
    }
  }, [storeId]);

  const runJobManual = useCallback(async () => {
    const token = requireTokenOrRedirect();
    if (!token || !storeId) return;
    setJobBusy(true);
    try {
      const res = await fetch(`${API_BASE}/audit/job/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ storeId }),
      });
      const raw = await res.text();
      let data: Record<string, unknown> = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = { error: raw || `HTTP ${res.status}` };
      }
      if (!res.ok) return setError(String(data.error || `Error run job (${res.status})`));
      await Promise.all([loadJobStatus(), loadAnchors(), loadLogs()]);
    } catch (e) {
      setError(`Connection error: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setJobBusy(false);
    }
  }, [storeId, loadJobStatus, loadAnchors, loadLogs]);

  useEffect(() => {
    if (!storeId) return;
    queueMicrotask(() => {
      void loadLogs();
    });
  }, [storeId, loadLogs]);

  if (loading) return <div className="min-h-screen bg-gray-100 p-6">Cargando permisos...</div>;
  if (permissionsError) return <div className="min-h-screen bg-gray-100 p-6 text-red-700">{permissionsError}</div>;
  if (!permissions.financeRead) {
    return <div className="min-h-screen bg-gray-100 p-6 text-red-700">No autorizado para ver auditoria.</div>;
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <Topbar title="Audit Log" storeName={storeName} />
        {error ? <div className="bg-red-100 text-red-700 p-3 rounded">{error}</div> : null}

        <div className="bg-white p-4 rounded-2xl shadow space-y-3">
          <div className="text-xl font-semibold">Filtros</div>
          <div className="grid md:grid-cols-7 gap-3">
            <input
              className="border rounded px-3 py-2"
              placeholder="action (ej: order.created)"
              value={action}
              onChange={(e) => setAction(e.target.value)}
            />
            <input
              className="border rounded px-3 py-2"
              placeholder="entityType (ej: sales_order)"
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
            />
            <select className="border rounded px-3 py-2" value={filterUserId} onChange={(e) => setFilterUserId(e.target.value)}>
              <option value="">Todos los usuarios</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.fullName || m.email}
                </option>
              ))}
            </select>
            <input className="border rounded px-3 py-2" placeholder="buscar..." value={q} onChange={(e) => setQ(e.target.value)} />
            <input className="border rounded px-3 py-2" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            <input className="border rounded px-3 py-2" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            <button className="rounded bg-black text-white px-4 py-2" onClick={() => void loadLogs()}>
              Refrescar
            </button>
            <button className="rounded border px-4 py-2" onClick={() => void exportCsv()}>
              Export CSV
            </button>
            <button className="rounded border px-4 py-2" onClick={() => void exportEvidenceJson()}>
              Export Evidencia (JSON)
            </button>
          </div>
        </div>

        {metrics ? (
          <div className="bg-white p-4 rounded-2xl shadow space-y-3">
            <div className="text-xl font-semibold">Resumen 24h</div>
            <div className="grid md:grid-cols-5 gap-3">
              <div className="border rounded p-3">
                <div className="text-xs text-gray-500">Eventos</div>
                <div className="text-2xl font-semibold">{metrics.totals.totalEvents}</div>
              </div>
              <div className="border rounded p-3">
                <div className="text-xs text-gray-500">Denied</div>
                <div className="text-2xl font-semibold text-red-700">{metrics.totals.deniedAccess}</div>
              </div>
              <div className="border rounded p-3">
                <div className="text-xs text-gray-500">Sensitive Reads</div>
                <div className="text-2xl font-semibold">{metrics.totals.sensitiveReads}</div>
              </div>
              <div className="border rounded p-3">
                <div className="text-xs text-gray-500">Updates</div>
                <div className="text-2xl font-semibold">{metrics.totals.updatesWithDiff}</div>
              </div>
              <div className="border rounded p-3">
                <div className="text-xs text-gray-500">Alertas seguridad</div>
                <div className="text-2xl font-semibold text-red-700">{metrics.totals.alertNotifications}</div>
              </div>
            </div>
            <div className="grid md:grid-cols-3 gap-3">
              <div className="border rounded p-3">
                <div className="font-medium mb-1">Top acciones</div>
                <div className="text-sm text-gray-700">
                  {(metrics.byAction || []).map((row) => `${row.action} (${row.count})`).join(" | ") || "-"}
                </div>
              </div>
              <div className="border rounded p-3">
                <div className="font-medium mb-1">Top entidades</div>
                <div className="text-sm text-gray-700">
                  {(metrics.byEntity || []).map((row) => `${row.entityType} (${row.count})`).join(" | ") || "-"}
                </div>
              </div>
              <div className="border rounded p-3">
                <div className="font-medium mb-1">Denied por usuario</div>
                <div className="text-sm text-gray-700">
                  {(metrics.deniedByUser || []).map((row) => `${row.user} (${row.count})`).join(" | ") || "-"}
                </div>
              </div>
              <div className="border rounded p-3">
                <div className="font-medium mb-1">Top usuarios</div>
                <div className="text-sm text-gray-700">
                  {(metrics.byUser || []).map((row) => `${row.user} (${row.count})`).join(" | ") || "-"}
                </div>
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <div className="border rounded p-3">
                <div className="font-medium mb-1">Anomalias</div>
                <div className="text-sm space-y-1">
                  {(metrics.anomalies || []).length === 0 ? (
                    <div className="text-gray-600">Sin anomalias detectadas</div>
                  ) : (
                    (metrics.anomalies || []).map((a, i) => (
                      <div key={`${a.type}-${i}`} className={a.severity === "critical" ? "text-red-700" : "text-amber-700"}>
                        [{a.severity}] {a.title}: {a.detail}
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="border rounded p-3">
                <div className="font-medium mb-1">Recomendaciones</div>
                <div className="text-sm space-y-1 text-gray-700">
                  {(metrics.recommendations || []).length === 0 ? (
                    <div>Sin recomendaciones por ahora</div>
                  ) : (
                    (metrics.recommendations || []).map((r, i) => <div key={`rec-${i}`}>{i + 1}. {r}</div>)
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <div className="bg-white p-4 rounded-2xl shadow space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xl font-semibold">Alertas abiertas ({alerts.length})</div>
            <button className="rounded border px-3 py-2 text-sm" onClick={() => void ackAllAlerts()}>
              Atender todas
            </button>
          </div>
          <div className="space-y-2">
            {alerts.length === 0 ? <div className="text-sm text-gray-600">Sin alertas abiertas.</div> : null}
            {alerts.map((a) => (
              <div key={a.id} className="border rounded p-3 flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-red-700">{a.title}</div>
                  <div className="text-sm text-gray-700">{a.body || "-"}</div>
                  <div className="text-xs text-gray-500 mt-1">{new Date(a.createdAt).toLocaleString("es-ES")}</div>
                </div>
                <button className="rounded bg-black text-white px-3 py-2 text-sm" onClick={() => void ackAlert(a.id)}>
                  Atender
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl shadow space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xl font-semibold">Retencion audit</div>
            <div className="flex gap-2">
              <button className="rounded border px-3 py-2 text-sm" onClick={() => void loadRetentionPreview()} disabled={retentionBusy}>
                Preview
              </button>
              <button className="rounded border px-3 py-2 text-sm" onClick={() => void runRetention(true)} disabled={retentionBusy}>
                Dry-run
              </button>
              <button className="rounded bg-black text-white px-3 py-2 text-sm" onClick={() => void runRetention(false)} disabled={retentionBusy}>
                Ejecutar limpieza
              </button>
            </div>
          </div>
          {retentionMessage ? <div className="text-sm text-green-700">{retentionMessage}</div> : null}
          {retention ? (
            <div className="grid md:grid-cols-2 gap-3 text-sm">
              <div className="border rounded p-3">
                <div className="font-medium mb-1">Politica (dias)</div>
                <div>Security: {retention.policy.securityDays}</div>
                <div>Operational: {retention.policy.operationalDays}</div>
                <div>Read: {retention.policy.readDays}</div>
                <div>Default: {retention.policy.defaultDays}</div>
              </div>
              <div className="border rounded p-3">
                <div className="font-medium mb-1">Preview</div>
                <div>Scanned: {retention.preview.scanned}</div>
                <div>Candidates: {retention.preview.candidateDelete}</div>
                <div>Security: {retention.preview.byBucket.security}</div>
                <div>Operational: {retention.preview.byBucket.operational}</div>
                <div>Read: {retention.preview.byBucket.read}</div>
                <div>Default: {retention.preview.byBucket.default}</div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-600">Sin preview cargado.</div>
          )}
        </div>

        <div className="bg-white p-4 rounded-2xl shadow space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xl font-semibold">Integridad audit (hash chain)</div>
            <button className="rounded bg-black text-white px-3 py-2 text-sm" onClick={() => void runIntegrityCheck()} disabled={integrityBusy}>
              Verificar
            </button>
          </div>
          {!integrity ? <div className="text-sm text-gray-600">Sin verificacion ejecutada.</div> : null}
          {integrity ? (
            <div className="space-y-2 text-sm">
              <div className={integrity.ok ? "text-green-700" : "text-red-700"}>
                Estado: {integrity.ok ? "OK" : "MISMATCH DETECTADO"}
              </div>
              <div>Scanned: {integrity.scanned}</div>
              <div>Verified rows: {integrity.verifiedRows}</div>
              <div>Legacy rows (sin hash): {integrity.legacyRows}</div>
              <div>Mismatches: {integrity.mismatches}</div>
              {integrity.sampleMismatches?.length ? (
                <pre className="text-xs bg-gray-50 border rounded p-2 whitespace-pre-wrap">
                  {JSON.stringify(integrity.sampleMismatches, null, 2)}
                </pre>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="bg-white p-4 rounded-2xl shadow space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xl font-semibold">Anchors diarios</div>
            <div className="flex gap-2 items-center">
              <input className="border rounded px-3 py-2 text-sm" type="date" value={anchorDay} onChange={(e) => setAnchorDay(e.target.value)} />
              <button className="rounded border px-3 py-2 text-sm" onClick={() => void loadAnchors()} disabled={anchorsBusy}>
                Cargar
              </button>
              <button className="rounded border px-3 py-2 text-sm" onClick={() => void verifyAnchors()} disabled={anchorsBusy}>
                Verificar
              </button>
              <button className="rounded bg-black text-white px-3 py-2 text-sm" onClick={() => void sealAnchor()} disabled={anchorsBusy}>
                Sellar dia
              </button>
            </div>
          </div>
          {anchorsMessage ? <div className="text-sm text-green-700">{anchorsMessage}</div> : null}
          {anchorVerify ? (
            <div className={anchorVerify.ok ? "text-sm text-green-700" : "text-sm text-red-700"}>
              Verify anchors: {anchorVerify.ok ? "OK" : "MISMATCH"} | scanned {anchorVerify.scanned} | mismatches {anchorVerify.mismatches}
            </div>
          ) : null}
          <div className="text-sm text-gray-700">Anchors: {anchors.length}</div>
          <div className="border rounded overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 px-2">Dia</th>
                  <th className="py-2 px-2">Eventos</th>
                  <th className="py-2 px-2">Hash</th>
                  <th className="py-2 px-2">Firma</th>
                </tr>
              </thead>
              <tbody>
                {anchors.map((a) => (
                  <tr key={a.id} className="border-b">
                    <td className="py-2 px-2 whitespace-nowrap">{a.anchorDay}</td>
                    <td className="py-2 px-2 whitespace-nowrap">{a.eventCount}</td>
                    <td className="py-2 px-2 font-mono text-xs">{a.anchorHash.slice(0, 20)}...</td>
                    <td className="py-2 px-2 font-mono text-xs">{a.signature.slice(0, 20)}...</td>
                  </tr>
                ))}
                {anchors.length === 0 ? (
                  <tr>
                    <td className="py-2 px-2 text-gray-500" colSpan={4}>
                      Sin anchors
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl shadow space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xl font-semibold">Job automatico audit</div>
            <div className="flex gap-2">
              <button className="rounded border px-3 py-2 text-sm" onClick={() => void loadJobStatus()} disabled={jobBusy}>
                Estado
              </button>
              <button className="rounded bg-black text-white px-3 py-2 text-sm" onClick={() => void runJobManual()} disabled={jobBusy}>
                Ejecutar ahora
              </button>
            </div>
          </div>
          {!jobStatus ? <div className="text-sm text-gray-600">Sin estado cargado.</div> : null}
          {jobStatus ? (
            <div className="text-sm space-y-1">
              <div>Enabled: {jobStatus.enabled ? "yes" : "no"}</div>
              <div>Running: {jobStatus.running ? "yes" : "no"}</div>
              <div>Last target day: {jobStatus.lastTargetDay || "-"}</div>
              <div>Last run: {jobStatus.lastRunAt ? new Date(jobStatus.lastRunAt).toLocaleString("es-ES") : "-"}</div>
              <div>Status: {jobStatus.lastRunStatus}</div>
              <div className="text-red-700">{jobStatus.lastError || ""}</div>
            </div>
          ) : null}
        </div>

        <div className="bg-white p-4 rounded-2xl shadow overflow-auto">
          <div className="text-xl font-semibold mb-3">Eventos ({logs.length})</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 pr-2">Fecha</th>
                <th className="py-2 pr-2">Accion</th>
                <th className="py-2 pr-2">Entidad</th>
                <th className="py-2 pr-2">Usuario</th>
                <th className="py-2 pr-2">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b align-top">
                  <td className="py-2 pr-2 whitespace-nowrap">{new Date(log.createdAt).toLocaleString("es-ES")}</td>
                  <td className="py-2 pr-2">{log.action}</td>
                  <td className="py-2 pr-2">
                    {log.entityType}
                    {log.entityId ? <div className="text-xs text-gray-500">{log.entityId}</div> : null}
                  </td>
                  <td className="py-2 pr-2">{log.user?.fullName || log.user?.email || "-"}</td>
                  <td className="py-2 pr-2">
                    <div>{log.message || "-"}</div>
                    {log.payload ? (
                      <pre className="text-xs bg-gray-50 border rounded p-2 mt-1 whitespace-pre-wrap">
                        {JSON.stringify(log.payload, null, 2)}
                      </pre>
                    ) : null}
                  </td>
                </tr>
              ))}
              {logs.length === 0 ? (
                <tr>
                  <td className="py-3 text-gray-500" colSpan={5}>
                    Sin eventos
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
