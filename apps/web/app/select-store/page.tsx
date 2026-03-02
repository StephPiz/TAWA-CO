"use client";

import { useEffect, useState } from "react";
import { logout, requireTokenOrRedirect } from "../../lib/auth";

type StoreRow = {
  storeId: string;
  holdingId: string;
  storeCode: string;
  storeName: string;
  status: string;
  roleKey: string;
};

export default function SelectStorePage() {
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = requireTokenOrRedirect();
    if (!token) return;

    const holdingId = localStorage.getItem("selectedHoldingId");
    if (!holdingId) {
      window.location.href = "/select-holding";
      return;
    }

    (async () => {
      try {
        const res = await fetch(
          `http://localhost:3001/stores?holdingId=${encodeURIComponent(holdingId)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        const data = await res.json();
        if (!res.ok) return setError(data.error || "Error loading stores");

        setStores(data.stores || []);
      } catch {
        setError("Connection error (API on :3001?)");
      }
    })();
  }, []);

  function chooseStore(storeId: string) {
    localStorage.setItem("selectedStoreId", storeId);
    window.location.href = "/dashboard";
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-6">
      <div className="bg-white p-8 rounded-2xl shadow-md w-full max-w-xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold">Selecciona Tienda (Store)</h1>
          <button className="text-sm underline" onClick={logout}>
            Logout
          </button>
        </div>

        {error && (
          <div className="bg-red-100 text-red-600 p-2 rounded mb-4 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-3">
          {stores.map((s) => (
            <button
              key={s.storeId}
              onClick={() => chooseStore(s.storeId)}
              className="w-full text-left border p-4 rounded-xl hover:bg-gray-50"
            >
              <div className="font-semibold">
                {s.storeName} ({s.storeCode})
              </div>
              <div className="text-xs text-gray-500">
                Rol: {s.roleKey} · Status: {s.status}
              </div>
            </button>
          ))}

          {stores.length === 0 && !error && (
            <div className="text-sm text-gray-500">No hay stores visibles.</div>
          )}
        </div>

        <div className="mt-6">
          <button
            className="text-sm underline"
            onClick={() => (window.location.href = "/select-holding")}
          >
            ← Volver a holdings
          </button>
        </div>
      </div>
    </div>
  );
}