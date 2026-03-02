"use client";

import { useEffect, useState } from "react";
import { logout, requireTokenOrRedirect } from "../lib/auth";

type StoreRow = {
  storeId: string;
  storeName: string;
  storeCode: string;
  holdingId: string;
  roleKey: string;
  status: string;
};

export default function SelectStorePage() {
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = requireTokenOrRedirect();
    const holdingId = localStorage.getItem("selectedHoldingId");

    if (!holdingId) {
      window.location.href = "/select-holding";
      return;
    }

    fetch(`http://localhost:3001/stores?holdingId=${holdingId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => setStores(d.stores || []))
      .catch(() => setError("No se pudo cargar stores"));
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">Selecciona Tienda (Store)</h1>
          <button onClick={logout} className="text-sm underline text-gray-600">
            Logout
          </button>
        </div>

        {error && (
          <div className="bg-red-100 text-red-600 p-2 rounded mb-4 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-2">
          {stores.map((s) => (
            <button
              key={s.storeId}
              className="w-full text-left border rounded-xl p-4 hover:bg-gray-50"
              onClick={() => {
                localStorage.setItem("selectedStoreId", s.storeId);
                window.location.href = "/dashboard";
              }}
            >
              <div className="font-semibold">
                {s.storeName} ({s.storeCode})
              </div>
              <div className="text-sm text-gray-500">
                Role: {s.roleKey} • Status: {s.status}
              </div>
            </button>
          ))}
        </div>

        <button
          className="mt-4 text-sm underline"
          onClick={() => (window.location.href = "/select-holding")}
        >
          ← Cambiar holding
        </button>
      </div>
    </div>
  );
}