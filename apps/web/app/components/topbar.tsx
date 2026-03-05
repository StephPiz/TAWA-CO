"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { handleUnauthorized, logout, requireTokenOrRedirect } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { useStorePermissions } from "../lib/access";
import { usePresence } from "../lib/presence";

const API_BASE = "http://localhost:3001";

type Props = {
  title: string;
  storeName?: string;
};

type NotificationToast = {
  id: string;
  title: string;
  body: string | null;
  linkedEntityType: string | null;
  linkedEntityId: string | null;
};

export default function Topbar({ title, storeName }: Props) {
  const router = useRouter();
  const { locale, changeLocale, t, supportedLocales } = useI18n();
  const { permissions, storeId } = useStorePermissions();
  const { presences, onlineCount } = usePresence(title);
  const [unreadCount, setUnreadCount] = useState(0);
  const [toasts, setToasts] = useState<NotificationToast[]>([]);
  const isFirstLoad = useRef(true);
  const seenIdsRef = useRef(new Set<string>());

  function getEntityHref(linkedEntityType: string | null, linkedEntityId: string | null) {
    if (!linkedEntityType || !linkedEntityId) return "/store/tasks";
    if (linkedEntityType === "sales_order") return `/store/orders?q=${encodeURIComponent(linkedEntityId)}`;
    if (linkedEntityType === "purchase_order") return `/store/purchases?q=${encodeURIComponent(linkedEntityId)}`;
    if (linkedEntityType === "return_case") return `/store/returns?q=${encodeURIComponent(linkedEntityId)}`;
    if (linkedEntityType === "product") return `/store/products?q=${encodeURIComponent(linkedEntityId)}`;
    if (linkedEntityType === "chat_message" || linkedEntityType === "chat_channel") return "/store/chat";
    if (linkedEntityType === "support_ticket") return `/store/support/${encodeURIComponent(linkedEntityId)}`;
    if (linkedEntityType === "team_task") return "/store/tasks";
    return "/store/tasks";
  }

  useEffect(() => {
    if (!storeId) return;
    let active = true;

    const loadNotifications = async () => {
      const token = requireTokenOrRedirect();
      if (!token) return;
      try {
        const qs = new URLSearchParams({
          storeId,
          onlyUnread: "1",
          limit: "20",
        }).toString();
        const res = await fetch(`${API_BASE}/notifications?${qs}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (handleUnauthorized(res.status)) return;
        const data = await res.json();
        if (!res.ok || !active) return;

        const rows = Array.isArray(data.notifications) ? data.notifications : [];
        setUnreadCount(rows.length);

        const nextToasts: NotificationToast[] = [];
        for (const n of rows) {
          if (!seenIdsRef.current.has(n.id)) {
            seenIdsRef.current.add(n.id);
            if (!isFirstLoad.current && nextToasts.length < 3) {
              nextToasts.push({
                id: n.id,
                title: n.title,
                body: n.body || null,
                linkedEntityType: n.linkedEntityType || null,
                linkedEntityId: n.linkedEntityId || null,
              });
            }
          }
        }
        if (nextToasts.length > 0) {
          setToasts((prev) => [...nextToasts, ...prev].slice(0, 4));
        }
        if (isFirstLoad.current) isFirstLoad.current = false;
      } catch {
        // Notification polling is best effort.
      }
    };

    void loadNotifications();
    const timer = setInterval(() => {
      void loadNotifications();
    }, 8000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [storeId]);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setTimeout(() => {
      setToasts((prev) => prev.slice(1));
    }, 5000);
    return () => clearTimeout(timer);
  }, [toasts]);

  return (
    <>
      <div className="fixed top-3 right-3 z-50 space-y-2 w-[320px] max-w-[calc(100vw-24px)]">
        {toasts.map((toast) => (
          <div key={toast.id} className="rounded-lg border bg-white shadow p-3">
            <div className="text-sm font-semibold">{toast.title}</div>
            <div className="text-xs text-gray-600 mt-1 line-clamp-2">{toast.body || "-"}</div>
            <div className="mt-2">
              <button
                className="rounded border px-2 py-1 text-xs"
                onClick={() => {
                  setToasts((prev) => prev.filter((t) => t.id !== toast.id));
                  router.push(getEntityHref(toast.linkedEntityType, toast.linkedEntityId));
                }}
              >
                Abrir
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white p-4 rounded-2xl shadow-md">
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{title}</h1>
            <p className="text-sm text-gray-600">
              {t("store")}: <b>{storeName || "-"}</b>
            </p>
            <p className="text-xs text-gray-500">
              Online: {onlineCount}
              {presences.length > 0
                ? ` | ${presences
                    .filter((p) => p.status === "online")
                    .slice(0, 3)
                    .map((p) => `${p.user.fullName}${p.lastEvent ? ` (${p.lastEvent})` : ""}`)
                    .join(", ")}`
                : ""}
            </p>
          </div>

          <div className="flex gap-2 items-center">
            <select
              value={locale}
              onChange={(e) => changeLocale(e.target.value)}
              className="border rounded px-2 py-2 text-sm"
            >
              {supportedLocales.map((l) => (
                <option value={l} key={l}>
                  {l.toUpperCase()}
                </option>
              ))}
            </select>
            <button className="px-3 py-2 rounded border hover:bg-gray-50" onClick={() => router.push("/store/dashboard")}>
              {t("dashboard")}
            </button>
            <button className="px-3 py-2 rounded border hover:bg-gray-50" onClick={() => router.push("/store/inventory")}>
              {t("inventory")}
            </button>
            {permissions.inventoryWrite ? (
              <button className="px-3 py-2 rounded border hover:bg-gray-50" onClick={() => router.push("/store/scanner")}>
                Escaner
              </button>
            ) : null}
            <button className="px-3 py-2 rounded border hover:bg-gray-50" onClick={() => router.push("/store/products")}>
              {t("products")}
            </button>
            {permissions.ordersWrite ? (
              <button className="px-3 py-2 rounded border hover:bg-gray-50" onClick={() => router.push("/store/orders")}>
                {t("orders")}
              </button>
            ) : null}
            {permissions.financeRead ? (
              <button className="px-3 py-2 rounded border hover:bg-gray-50" onClick={() => router.push("/store/suppliers")}>
                {t("suppliers")}
              </button>
            ) : null}
            {permissions.customersRead ? (
              <button className="px-3 py-2 rounded border hover:bg-gray-50" onClick={() => router.push("/store/customers")}>
                {t("customers")}
              </button>
            ) : null}
            {permissions.financeRead ? (
              <button className="px-3 py-2 rounded border hover:bg-gray-50" onClick={() => router.push("/store/purchases")}>
                {t("purchases")}
              </button>
            ) : null}
            {permissions.financeRead ? (
              <button className="px-3 py-2 rounded border hover:bg-gray-50" onClick={() => router.push("/store/3pl")}>
                {t("three_pl")}
              </button>
            ) : null}
            {permissions.financeRead ? (
              <button className="px-3 py-2 rounded border hover:bg-gray-50" onClick={() => router.push("/store/payouts")}>
                {t("payouts")}
              </button>
            ) : null}
            {permissions.financeRead ? (
              <button className="px-3 py-2 rounded border hover:bg-gray-50" onClick={() => router.push("/store/invoices")}>
                {t("invoices")}
              </button>
            ) : null}
            {permissions.analyticsRead ? (
              <button className="px-3 py-2 rounded border hover:bg-gray-50" onClick={() => router.push("/store/analytics")}>
                {t("analytics")}
              </button>
            ) : null}
            {permissions.returnsWrite ? (
              <button className="px-3 py-2 rounded border hover:bg-gray-50" onClick={() => router.push("/store/returns")}>
                {t("returns")}
              </button>
            ) : null}
            <button className="px-3 py-2 rounded border hover:bg-gray-50 relative" onClick={() => router.push("/store/tasks")}>
              {t("tasks")}
              {unreadCount > 0 ? (
                <span className="ml-2 inline-flex min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-[10px] items-center justify-center align-middle">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              ) : null}
            </button>
            <button className="px-3 py-2 rounded border hover:bg-gray-50" onClick={() => router.push("/store/chat")}>
              {t("chat")}
            </button>
            {permissions.supportWrite ? (
              <button className="px-3 py-2 rounded border hover:bg-gray-50" onClick={() => router.push("/store/support")}>
                {t("support")}
              </button>
            ) : null}
            {permissions.financeRead ? (
              <button className="px-3 py-2 rounded border hover:bg-gray-50" onClick={() => router.push("/store/audit")}>
                Audit
              </button>
            ) : null}
            {permissions.settingsWrite ? (
              <button className="px-3 py-2 rounded border hover:bg-gray-50" onClick={() => router.push("/store/settings")}>
                {t("settings")}
              </button>
            ) : null}
            <button className="px-3 py-2 rounded bg-black text-white" onClick={logout}>
              {t("logout")}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
