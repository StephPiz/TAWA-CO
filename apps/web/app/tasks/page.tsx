"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Topbar from "../components/topbar";
import { requireTokenOrRedirect } from "../lib/auth";
import { useStorePermissions } from "../lib/access";

const API_BASE = "http://localhost:3001";

type TeamMember = {
  userId: string;
  roleKey: string;
  fullName: string;
  email: string;
  isActive: boolean;
};

type Task = {
  id: string;
  title: string;
  description: string | null;
  status: "open" | "in_progress" | "blocked" | "done";
  priority: "low" | "medium" | "high";
  dueAt: string | null;
  linkedEntityType: string | null;
  linkedEntityId: string | null;
  assignedTo: { id: string; fullName: string; email: string } | null;
  createdBy: { id: string; fullName: string; email: string } | null;
  createdAt: string;
};

type NotificationRow = {
  id: string;
  type: "task_assigned" | "purchase_received" | "backorder_created" | "return_processed" | "system";
  severity: "info" | "warning" | "critical";
  title: string;
  body: string | null;
  linkedEntityType: string | null;
  linkedEntityId: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
};

const STATUSES = ["open", "in_progress", "blocked", "done"] as const;
const PRIORITIES = ["low", "medium", "high"] as const;
const NOTIFICATION_TYPES = ["", "task_assigned", "purchase_received", "backorder_created", "return_processed", "system"] as const;
const NOTIFICATION_SEVERITIES = ["", "info", "warning", "critical"] as const;

export default function TasksPage() {
  const router = useRouter();
  const { loading, storeId, storeName, error: permissionsError } = useStorePermissions();
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [busyTaskId, setBusyTaskId] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>("medium");
  const [dueAt, setDueAt] = useState("");
  const [assignedToUserId, setAssignedToUserId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [notificationTypeFilter, setNotificationTypeFilter] = useState<(typeof NOTIFICATION_TYPES)[number]>("");
  const [notificationSeverityFilter, setNotificationSeverityFilter] = useState<(typeof NOTIFICATION_SEVERITIES)[number]>("");
  const [notificationOnlyUnread, setNotificationOnlyUnread] = useState(true);
  const [notificationQuery, setNotificationQuery] = useState("");

  const openCounts = useMemo(() => {
    const counts: Record<string, number> = { open: 0, in_progress: 0, blocked: 0, done: 0 };
    for (const task of tasks) counts[task.status] += 1;
    return counts;
  }, [tasks]);

  const unreadNotifications = useMemo(() => notifications.filter((n) => !n.isRead).length, [notifications]);

  function getEntityHref(linkedEntityType: string | null, linkedEntityId: string | null) {
    if (!linkedEntityType || !linkedEntityId) return null;
    if (linkedEntityType === "sales_order") return `/store/orders?q=${encodeURIComponent(linkedEntityId)}`;
    if (linkedEntityType === "purchase_order") return `/store/purchases?q=${encodeURIComponent(linkedEntityId)}`;
    if (linkedEntityType === "return_case") return `/store/returns?q=${encodeURIComponent(linkedEntityId)}`;
    if (linkedEntityType === "product") return `/store/products?q=${encodeURIComponent(linkedEntityId)}`;
    if (linkedEntityType === "team_task") return "/store/tasks";
    if (linkedEntityType === "chat_message" || linkedEntityType === "chat_channel") return "/store/chat";
    if (linkedEntityType === "support_ticket") return `/store/support/${encodeURIComponent(linkedEntityId)}`;
    return null;
  }

  const loadAll = useCallback(
    async (sid: string, nextStatus = statusFilter) => {
      const token = requireTokenOrRedirect();
      if (!token) return;
      setError("");
      try {
        const qs = new URLSearchParams({ storeId: sid, ...(nextStatus ? { status: nextStatus } : {}) }).toString();
        const notificationQs = new URLSearchParams({
          storeId: sid,
          limit: "40",
          ...(notificationOnlyUnread ? { onlyUnread: "1" } : {}),
          ...(notificationTypeFilter ? { type: notificationTypeFilter } : {}),
          ...(notificationSeverityFilter ? { severity: notificationSeverityFilter } : {}),
          ...(notificationQuery.trim() ? { q: notificationQuery.trim() } : {}),
        }).toString();
        const requestJson = async (url: string) => {
          const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
          const raw = await res.text();
          let data: Record<string, unknown> = {};
          try {
            data = raw ? JSON.parse(raw) : {};
          } catch {
            data = { error: raw || `HTTP ${res.status}` };
          }
          return { ok: res.ok, status: res.status, data };
        };

        const [tasksR, membersR, notificationsR] = await Promise.allSettled([
          requestJson(`${API_BASE}/tasks?${qs}`),
          requestJson(`${API_BASE}/stores/${sid}/team`),
          requestJson(`${API_BASE}/notifications?${notificationQs}`),
        ]);

        if (tasksR.status === "rejected") return setError("API tasks no responde en localhost:3001");
        if (!tasksR.value.ok) return setError(String(tasksR.value.data.error || "Error loading tasks"));

        if (membersR.status === "rejected") return setError("API team no responde en localhost:3001");
        if (!membersR.value.ok) return setError(String(membersR.value.data.error || "Error loading team"));

        setTasks((tasksR.value.data.tasks as Task[]) || []);
        setMembers(((membersR.value.data.members as TeamMember[]) || []).filter((m: TeamMember) => m.isActive));

        if (notificationsR.status === "fulfilled" && notificationsR.value.ok) {
          setNotifications((notificationsR.value.data.notifications as NotificationRow[]) || []);
        } else if (notificationsR.status === "fulfilled" && !notificationsR.value.ok) {
          setInfo(String(notificationsR.value.data.error || "Notificaciones no disponibles"));
        } else {
          setInfo("Notificaciones no disponibles");
        }
      } catch (e) {
        setError(`Connection error: ${e instanceof Error ? e.message : "unknown"}`);
      }
    },
    [notificationOnlyUnread, notificationQuery, notificationSeverityFilter, notificationTypeFilter, statusFilter]
  );

  useEffect(() => {
    if (loading) return;
    if (!storeId) return;
    queueMicrotask(() => {
      void loadAll(storeId, statusFilter);
    });
  }, [
    loading,
    storeId,
    statusFilter,
    notificationOnlyUnread,
    notificationTypeFilter,
    notificationSeverityFilter,
    notificationQuery,
    loadAll,
  ]);

  useEffect(() => {
    if (!storeId) return;
    const timer = setInterval(() => {
      void loadAll(storeId, statusFilter);
    }, 8000);
    return () => clearInterval(timer);
  }, [storeId, statusFilter, loadAll]);

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    const token = requireTokenOrRedirect();
    if (!token || !storeId || !title.trim()) return;

    setError("");
    const res = await fetch(`${API_BASE}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        storeId,
        title: title.trim(),
        description: description.trim() || null,
        priority,
        dueAt: dueAt || null,
        assignedToUserId: assignedToUserId || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error || "Cannot create task");

    setTitle("");
    setDescription("");
    setPriority("medium");
    setDueAt("");
    setAssignedToUserId("");
    setInfo("Tarea creada");
    await loadAll(storeId, statusFilter);
  }

  async function updateTask(taskId: string, patch: Record<string, unknown>) {
    const token = requireTokenOrRedirect();
    if (!token || !storeId) return;

    setBusyTaskId(taskId);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ storeId, ...patch }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error || "Cannot update task");
      await loadAll(storeId, statusFilter);
    } catch {
      setError("Connection error");
    } finally {
      setBusyTaskId("");
    }
  }

  async function markNotification(notificationId: string, isRead: boolean) {
    const token = requireTokenOrRedirect();
    if (!token || !storeId) return;
    const res = await fetch(`${API_BASE}/notifications/${notificationId}/read`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ storeId, isRead }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error || "Cannot update notification");
    await loadAll(storeId, statusFilter);
  }

  async function markAllNotificationsRead() {
    const token = requireTokenOrRedirect();
    if (!token || !storeId) return;
    const res = await fetch(`${API_BASE}/notifications/read-all`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ storeId }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error || "Cannot mark notifications as read");
    setInfo(`Notificaciones actualizadas: ${data.updated ?? 0}`);
    await loadAll(storeId, statusFilter);
  }

  if (loading) return <div className="min-h-screen bg-[#E8EAEC] p-6">Cargando permisos...</div>;
  if (permissionsError) return <div className="min-h-screen bg-[#E8EAEC] p-6 text-red-700">{permissionsError}</div>;

  return (
    <div className="min-h-screen bg-[#E8EAEC] p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <Topbar title="Tareas / Notificaciones" storeName={storeName} />
        {error ? <div className="rounded-2xl bg-red-100 px-4 py-3 text-red-700 shadow-[0_10px_30px_rgba(0,0,0,0.05)]">{error}</div> : null}
        {info ? <div className="rounded-2xl bg-emerald-100 px-4 py-3 text-emerald-700 shadow-[0_10px_30px_rgba(0,0,0,0.05)]">{info}</div> : null}

        <div className="rounded-[28px] bg-white p-5 shadow-[0_12px_30px_rgba(0,0,0,0.08)]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[28px] font-semibold text-[#1B2140]">Notificaciones</h2>
              <p className="mt-1 text-sm text-[#6D748A]">{unreadNotifications} sin leer</p>
            </div>
            <div className="flex items-center gap-2">
              <button className="rounded-full border border-[#D8DCE5] bg-white px-4 py-2 text-xs text-[#1B2140] hover:bg-[#F4F6FA]" onClick={() => storeId && loadAll(storeId, statusFilter)}>
                Refrescar
              </button>
              <button className="rounded-full bg-[#0B1230] px-4 py-2 text-xs text-white hover:bg-[#16204D]" onClick={markAllNotificationsRead}>
                Marcar todas leídas
              </button>
            </div>
          </div>
          <div className="mb-4 grid gap-3 md:grid-cols-4">
            <select
              className="rounded-full border border-[#E1E5EC] bg-[#F8F9FC] px-4 py-3 text-sm text-[#1B2140] outline-none"
              value={notificationTypeFilter}
              onChange={(e) => setNotificationTypeFilter(e.target.value as (typeof NOTIFICATION_TYPES)[number])}
            >
              {NOTIFICATION_TYPES.map((t) => (
                <option key={t || "all"} value={t}>
                  {t || "Todos los tipos"}
                </option>
              ))}
            </select>
            <select
              className="rounded-full border border-[#E1E5EC] bg-[#F8F9FC] px-4 py-3 text-sm text-[#1B2140] outline-none"
              value={notificationSeverityFilter}
              onChange={(e) => setNotificationSeverityFilter(e.target.value as (typeof NOTIFICATION_SEVERITIES)[number])}
            >
              {NOTIFICATION_SEVERITIES.map((s) => (
                <option key={s || "all"} value={s}>
                  {s || "Todas las severidades"}
                </option>
              ))}
            </select>
            <input
              className="rounded-full border border-[#E1E5EC] bg-[#F8F9FC] px-4 py-3 text-sm text-[#1B2140] outline-none placeholder:text-[#8B90A0]"
              placeholder="Buscar notificación..."
              value={notificationQuery}
              onChange={(e) => setNotificationQuery(e.target.value)}
            />
            <label className="inline-flex items-center gap-2 rounded-full border border-[#E1E5EC] bg-[#F8F9FC] px-4 py-3 text-sm text-[#1B2140]">
              <input
                type="checkbox"
                checked={notificationOnlyUnread}
                onChange={(e) => setNotificationOnlyUnread(e.target.checked)}
              />
              Solo no leídas
            </label>
          </div>
          {notifications.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#D8DCE5] bg-[#F8F9FC] px-4 py-6 text-sm text-[#6D748A]">Sin notificaciones por ahora</div>
          ) : (
            <div className="mb-3 space-y-3">
              {notifications.slice(0, 8).map((n) => (
                <div key={n.id} className={`rounded-2xl border px-4 py-3 shadow-sm ${n.isRead ? "border-[#E1E5EC] bg-[#F8F9FC]" : "border-[#F1E1A6] bg-[#FFF7DD]"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-[#1B2140]">{n.title}</div>
                    <div className="flex items-center gap-2">
                      {getEntityHref(n.linkedEntityType, n.linkedEntityId) ? (
                        <button
                          className="rounded-full border border-[#D8DCE5] bg-white px-3 py-1.5 text-xs text-[#1B2140] hover:bg-[#F4F6FA]"
                          onClick={() => router.push(getEntityHref(n.linkedEntityType, n.linkedEntityId) || "/store/tasks")}
                        >
                          Abrir
                        </button>
                      ) : null}
                      <button
                        className="rounded-full bg-[#0B1230] px-3 py-1.5 text-xs text-white hover:bg-[#16204D]"
                        onClick={() => markNotification(n.id, !n.isRead)}
                      >
                        {n.isRead ? "No leída" : "Leída"}
                      </button>
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-[#6D748A]">
                    [{n.type}] {n.body || "-"} | {new Date(n.createdAt).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-[28px] bg-white p-5 shadow-[0_12px_30px_rgba(0,0,0,0.08)]">
          <div className="mb-4">
            <h2 className="text-[28px] font-semibold text-[#1B2140]">Nueva tarea</h2>
            <p className="mt-1 text-sm text-[#6D748A]">Crea y asigna tareas del equipo.</p>
          </div>
          <form className="grid gap-3 md:grid-cols-6" onSubmit={createTask}>
            <input className="rounded-full border border-[#E1E5EC] bg-[#F8F9FC] px-4 py-3 md:col-span-2 outline-none placeholder:text-[#8B90A0]" placeholder="Título" value={title} onChange={(e) => setTitle(e.target.value)} required />
            <input className="rounded-full border border-[#E1E5EC] bg-[#F8F9FC] px-4 py-3 md:col-span-2 outline-none placeholder:text-[#8B90A0]" placeholder="Descripción" value={description} onChange={(e) => setDescription(e.target.value)} />
            <select className="rounded-full border border-[#E1E5EC] bg-[#F8F9FC] px-4 py-3 outline-none" value={priority} onChange={(e) => setPriority(e.target.value as (typeof PRIORITIES)[number])}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <input className="rounded-full border border-[#E1E5EC] bg-[#F8F9FC] px-4 py-3 outline-none" type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
            <select className="rounded-full border border-[#E1E5EC] bg-[#F8F9FC] px-4 py-3 md:col-span-2 outline-none" value={assignedToUserId} onChange={(e) => setAssignedToUserId(e.target.value)}>
              <option value="">Asignar a</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>{m.fullName} ({m.roleKey})</option>
              ))}
            </select>
            <button className="rounded-full bg-[#0B1230] px-4 py-3 text-white hover:bg-[#16204D]" type="submit">Crear</button>
          </form>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          {STATUSES.map((status) => (
            <div key={status} className="rounded-[24px] bg-white p-5 shadow-[0_12px_30px_rgba(0,0,0,0.08)]">
              <div className="text-sm capitalize text-[#6D748A]">{status.replace("_", " ")}</div>
              <div className="mt-2 text-[34px] font-semibold leading-none text-[#1B2140]">{openCounts[status]}</div>
            </div>
          ))}
        </div>

        <div className="rounded-[28px] bg-white p-5 shadow-[0_12px_30px_rgba(0,0,0,0.08)]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[28px] font-semibold text-[#1B2140]">Lista de tareas</h2>
              <p className="mt-1 text-sm text-[#6D748A]">Seguimiento operativo del equipo.</p>
            </div>
            <div className="text-sm text-[#6D748A]">
              open {openCounts.open} | in_progress {openCounts.in_progress} | blocked {openCounts.blocked} | done {openCounts.done}
            </div>
          </div>

          <div className="mb-3">
            <select className="rounded-full border border-[#E1E5EC] bg-[#F8F9FC] px-4 py-3 text-sm text-[#1B2140] outline-none" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">Todos</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-[#E1E5EC]">
            <table className="min-w-full text-sm">
              <thead className="border-b bg-[#F8F9FC]">
                <tr>
                  <th className="px-4 py-3 text-left text-[#1B2140]">Título</th>
                  <th className="px-4 py-3 text-left text-[#1B2140]">Estado</th>
                  <th className="px-4 py-3 text-left text-[#1B2140]">Prioridad</th>
                  <th className="px-4 py-3 text-left text-[#1B2140]">Asignado</th>
                  <th className="px-4 py-3 text-left text-[#1B2140]">Due</th>
                  <th className="px-4 py-3 text-left text-[#1B2140]">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {tasks.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-[#6D748A]">Sin tareas</td>
                  </tr>
                ) : (
                  tasks.map((t) => (
                    <tr key={t.id} className="border-b border-[#EEF1F5] align-top last:border-b-0">
                      <td className="px-4 py-3">
                        <div className="font-medium text-[#1B2140]">{t.title}</div>
                        <div className="text-xs text-[#6D748A]">{t.description || "-"}</div>
                      </td>
                      <td className="px-4 py-3 capitalize text-[#1B2140]">{t.status.replace("_", " ")}</td>
                      <td className="px-4 py-3 capitalize text-[#1B2140]">{t.priority}</td>
                      <td className="px-4 py-3 text-[#1B2140]">{t.assignedTo?.fullName || "-"}</td>
                      <td className="px-4 py-3 text-[#1B2140]">{t.dueAt ? new Date(t.dueAt).toISOString().slice(0, 10) : "-"}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {STATUSES.map((s) => (
                            <button
                              key={s}
                              className="rounded-full border border-[#D8DCE5] bg-white px-3 py-1.5 text-xs text-[#1B2140] disabled:opacity-50 hover:bg-[#F4F6FA]"
                              disabled={busyTaskId === t.id || t.status === s}
                              onClick={() => updateTask(t.id, { status: s })}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
