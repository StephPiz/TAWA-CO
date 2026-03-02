"use client";

import { useRouter } from "next/navigation";
import { logout } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { useStorePermissions } from "../lib/access";

type Props = {
  title: string;
  storeName?: string;
};

export default function Topbar({ title, storeName }: Props) {
  const router = useRouter();
  const { locale, changeLocale, t, supportedLocales } = useI18n();
  const { permissions } = useStorePermissions();

  return (
    <div className="bg-white p-4 rounded-2xl shadow-md">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="text-sm text-gray-600">
            {t("store")}: <b>{storeName || "-"}</b>
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
          <button className="px-3 py-2 rounded border hover:bg-gray-50" onClick={() => router.push("/store/settings")}>
            {t("settings")}
          </button>
          <button className="px-3 py-2 rounded bg-black text-white" onClick={logout}>
            {t("logout")}
          </button>
        </div>
      </div>
    </div>
  );
}
