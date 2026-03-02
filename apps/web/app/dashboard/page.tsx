"use client";

import { useEffect, useState } from "react";
import { logout, requireTokenOrRedirect } from "../../lib/auth";

export default function DashboardPage() {
  const [userName, setUserName] = useState<string>("");
  const [storeName, setStoreName] = useState<string>("");
  const [holdingName, setHoldingName] = useState<string>("");

  useEffect(() => {
    const token = requireTokenOrRedirect();
    if (!token) return;

    const selectedStoreId = localStorage.getItem("selectedStoreId");
    if (!selectedStoreId) {
      window.location.href = "/select-store";
      return;
    }

    const userRaw = localStorage.getItem("user");
    if (userRaw) {
      try {
        setUserName(JSON.parse(userRaw).fullName || "");
      } catch {}
    }

    const storesRaw = localStorage.getItem("stores");
    if (storesRaw) {
      try {
        const stores = JSON.parse(storesRaw) as any[];
        const found = stores.find((s) => s.storeId === selectedStoreId);
        if (found) {
          setStoreName(found.storeName || "");
          setHoldingName(found.holdingName || "");
        }
      } catch {}
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="bg-white p-6 rounded-2xl shadow-md flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-sm text-gray-600">
              Holding: <b>{holdingName || "-"}</b> · Store: <b>{storeName || "-"}</b>
            </p>
            <p className="text-sm text-gray-600">
              Usuario: <b>{userName || "-"}</b>
            </p>
          </div>

          <div className="flex gap-3">
            <button
              className="px-3 py-2 rounded border hover:bg-gray-50"
              onClick={() => (window.location.href = "/select-store")}
            >
              Cambiar tienda
            </button>
            <button className="px-3 py-2 rounded bg-black text-white" onClick={logout}>
              Logout
            </button>
          </div>
        </div>

        <div className="mt-6 bg-white p-6 rounded-2xl shadow-md">
          <h2 className="text-lg font-semibold mb-2">Siguiente paso</h2>
          <p className="text-sm text-gray-700">
            Aquí vamos a construir el módulo de Inventario (almacenes, lista por tienda,
            toggle “ojo” para ver/ocultar imagen, stock 0 con “Disponible en…”).
          </p>
        </div>
      </div>
    </div>
  );
}