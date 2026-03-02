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
        const [tasksRes, membersRes, notificationsRes] = await Promise.all([
          fetch(`${API_BASE}/tasks?${qs}`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API_BASE}/stores/${sid}/team`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API_BASE}/notifications?${notificationQs}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);
        const tasksData = await tasksRes.json();
        const membersData = await membersRes.json();
        const notificationsData = await notificationsRes.json();

        if (!tasksRes.ok) return setError(tasksData.error || "Error loading tasks");
        if (!membersRes.ok) return setError(membersData.error || "Error loading team");
        if (!notificationsRes.ok) return setError(notificationsData.error || "Error loading notifications");

        setTasks(tasksData.tasks || []);
        setMembers((membersData.members || []).filter((m: TeamMember) => m.isActive));
        setNotifications(notificationsData.notifications || []);
      } catch {
        setError("Connection error");
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

  if (loading) return <div className="min-h-screen bg-gray-100 p-6">Cargando permisos...</div>;
  if (permissionsError) return <div className="min-h-screen bg-gray-100 p-6 text-red-700">{permissionsError}</div>;

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <Topbar title="Tareas / Notificaciones" storeName={storeName} />
        {error ? <div className="bg-red-100 text-red-700 p-3 rounded">{error}</div> : null}
        {info ? <div className="bg-emerald-100 text-emerald-700 p-3 rounded">{info}</div> : null}

        <div className="bg-white p-4 rounded-2xl shadow-md">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold">Notificaciones ({unreadNotifications} sin leer)</h2>
            <div className="flex items-center gap-2">
              <button className="rounded border px-3 py-1 text-xs" onClick={() => storeId && loadAll(storeId, statusFilter)}>
                Refrescar
              </button>
              <button className="rounded border px-3 py-1 text-xs" onClick={markAllNotificationsRead}>
                Marcar todas leidas
              </button>
            </div>
          </div>
          <div className="grid md:grid-cols-4 gap-2 mb-3">
            <select
              className="border rounded px-3 py-2 text-sm"
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
              className="border rounded px-3 py-2 text-sm"
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
              className="border rounded px-3 py-2 text-sm"
              placeholder="Buscar notificacion..."
              value={notificationQuery}
              onChange={(e) => setNotificationQuery(e.target.value)}
            />
            <label className="inline-flex items-center gap-2 text-sm px-2">
              <input
                type="checkbox"
                checked={notificationOnlyUnread}
                onChange={(e) => setNotificationOnlyUnread(e.target.checked)}
              />
              Solo no leidas
            </label>
          </div>
          {notifications.length === 0 ? (
            <div className="text-sm text-gray-500">Sin notificaciones por ahora</div>
          ) : (
            <div className="space-y-2 mb-3">
              {notifications.slice(0, 8).map((n) => (
                <div key={n.id} className={`rounded border p-2 ${n.isRead ? "bg-gray-50" : "bg-yellow-50"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium">{n.title}</div>
                    <div className="flex items-center gap-2">
                      {getEntityHref(n.linkedEntityType, n.linkedEntityId) ? (
                        <button
                          className="rounded border px-2 py-1 text-xs"
                          onClick={() => router.push(getEntityHref(n.linkedEntityType, n.linkedEntityId) || "/store/tasks")}
                        >
                          Abrir
                        </button>
                      ) : null}
                      <button
                        className="rounded border px-2 py-1 text-xs"
                        onClick={() => markNotification(n.id, !n.isRead)}
                      >
                        {n.isRead ? "No leida" : "Leida"}
                      </button>
                    </div>
                  </div>
                  <div className="text-xs text-gray-600 mt-1">
                    [{n.type}] {n.body || "-"} | {new Date(n.createdAt).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white p-4 rounded-2xl shadow-md">
          <h2 className="font-semibold mb-2">Nueva tarea</h2>
          <form className="grid md:grid-cols-6 gap-2" onSubmit={createTask}>
            <input className="border rounded px-3 py-2 md:col-span-2" placeholder="Título" value={title} onChange={(e) => setTitle(e.target.value)} required />
            <input className="border rounded px-3 py-2 md:col-span-2" placeholder="Descripción" value={description} onChange={(e) => setDescription(e.target.value)} />
            <select className="border rounded px-3 py-2" value={priority} onChange={(e) => setPriority(e.target.value as (typeof PRIORITIES)[number])}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <input className="border rounded px-3 py-2" type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
            <select className="border rounded px-3 py-2 md:col-span-2" value={assignedToUserId} onChange={(e) => setAssignedToUserId(e.target.value)}>
              <option value="">Asignar a</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>{m.fullName} ({m.roleKey})</option>
              ))}
            </select>
            <button className="rounded bg-black text-white px-3 py-2" type="submit">Crear</button>
          </form>
        </div>

        <div className="bg-white p-4 rounded-2xl shadow-md">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold">Lista de tareas</h2>
            <div className="text-xs text-gray-600">
              open {openCounts.open} | in_progress {openCounts.in_progress} | blocked {openCounts.blocked} | done {openCounts.done}
            </div>
          </div>

          <div className="mb-3">
            <select className="border rounded px-3 py-2" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">Todos</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-3 py-2">Título</th>
                  <th className="text-left px-3 py-2">Estado</th>
                  <th className="text-left px-3 py-2">Prioridad</th>
                  <th className="text-left px-3 py-2">Asignado</th>
                  <th className="text-left px-3 py-2">Due</th>
                  <th className="text-left px-3 py-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {tasks.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-4 text-gray-500">Sin tareas</td>
                  </tr>
                ) : (
                  tasks.map((t) => (
                    <tr key={t.id} className="border-b align-top">
                      <td className="px-3 py-2">
                        <div className="font-medium">{t.title}</div>
                        <div className="text-xs text-gray-500">{t.description || "-"}</div>
                      </td>
                      <td className="px-3 py-2">{t.status}</td>
                      <td className="px-3 py-2">{t.priority}</td>
                      <td className="px-3 py-2">{t.assignedTo?.fullName || "-"}</td>
                      <td className="px-3 py-2">{t.dueAt ? new Date(t.dueAt).toISOString().slice(0, 10) : "-"}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2 flex-wrap">
                          {STATUSES.map((s) => (
                            <button
                              key={s}
                              className="rounded border px-2 py-1 disabled:opacity-50"
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
