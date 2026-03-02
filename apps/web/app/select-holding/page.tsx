"use client";

import { useEffect, useMemo, useState } from "react";
import { logout, requireTokenOrRedirect } from "../lib/auth";

export default function SelectHoldingPage() {
  const [holdings, setHoldings] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = requireTokenOrRedirect();

    fetch("http://localhost:3001/holdings", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => setHoldings(d.holdings || []))
      .catch(() => setError("No se pudo cargar holdings"));
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">Selecciona Empresa (Holding)</h1>
          <button
            onClick={logout}
            className="text-sm underline text-gray-600"
          >
            Logout
          </button>
        </div>

        {error && (
          <div className="bg-red-100 text-red-600 p-2 rounded mb-4 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-2">
          {holdings.map((h) => (
            <button
              key={h.id}
              className="w-full text-left border rounded-xl p-4 hover:bg-gray-50"
              onClick={() => {
                localStorage.setItem("selectedHoldingId", h.id);
                window.location.href = "/select-store";
              }}
            >
              <div className="font-semibold">{h.name}</div>
              <div className="text-sm text-gray-500">ID: {h.id}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}