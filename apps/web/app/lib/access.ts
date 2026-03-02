"use client";

import { useEffect, useState } from "react";
import { requireTokenOrRedirect } from "./auth";

const API_BASE = "http://localhost:3001";

export type StorePermissions = {
  inventoryRead: boolean;
  inventoryWrite: boolean;
  catalogWrite: boolean;
  ordersWrite: boolean;
  payoutsWrite: boolean;
  invoicesWrite: boolean;
  returnsWrite: boolean;
  analyticsRead: boolean;
  financeRead: boolean;
  suppliersRead: boolean;
};

const DEFAULT_PERMS: StorePermissions = {
  inventoryRead: false,
  inventoryWrite: false,
  catalogWrite: false,
  ordersWrite: false,
  payoutsWrite: false,
  invoicesWrite: false,
  returnsWrite: false,
  analyticsRead: false,
  financeRead: false,
  suppliersRead: false,
};

export function getSelectedStoreId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("selectedStoreId");
}

export function getSelectedStoreName(): string {
  if (typeof window === "undefined") return "";
  const selectedStoreId = localStorage.getItem("selectedStoreId");
  if (!selectedStoreId) return "";

  try {
    const storesRaw = localStorage.getItem("stores");
    if (!storesRaw) return "";
    const stores = JSON.parse(storesRaw) as { storeId: string; storeName: string }[];
    return stores.find((s) => s.storeId === selectedStoreId)?.storeName || "";
  } catch {
    return "";
  }
}

export function useStorePermissions() {
  const [loading, setLoading] = useState(true);
  const [storeId, setStoreId] = useState<string>("");
  const [storeName, setStoreName] = useState<string>("");
  const [permissions, setPermissions] = useState<StorePermissions>(DEFAULT_PERMS);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const token = requireTokenOrRedirect();
    if (!token) {
      setLoading(false);
      return;
    }

    (async () => {
      const sid = getSelectedStoreId();
      if (!sid) {
        setError("Missing selected store");
        setLoading(false);
        return;
      }

      setStoreId(sid);
      setStoreName(getSelectedStoreName());

      try {
        const res = await fetch(`${API_BASE}/stores/${sid}/permissions`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed loading permissions");
          setLoading(false);
          return;
        }
        setPermissions({ ...DEFAULT_PERMS, ...(data.permissions || {}) });
      } catch {
        setError("Connection error");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return { loading, storeId, storeName, permissions, error };
}
