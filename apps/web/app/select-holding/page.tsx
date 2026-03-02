"use client";

import { useEffect, useState } from "react";
import { logout, requireTokenOrRedirect } from "../../lib/auth";

export default function SelectHoldingPage() {
  const [holdings, setHoldings] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = requireTokenOrRedirect();
    if (!token) return;

    (async () => {
      try {
        const res = await fetch("http://localhost:3001/holdings", {
          headers: { Authorization: `Bearer ${token}` },
        });

        const data = await res.json();
        if (!res.ok) return setError(data.error || "Error loading holdings");

        setHoldings(data.holdings || []);
      } catch {
        setError("Connection error (API on :3001?)");
      }
    })();
  }, []);

  function chooseHolding(id: string) {
    localStorage.setItem("selectedHoldingId", id);
    window.location.href = "/select-store";
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-6">
      <div className="bg-white p-8 rounded-2xl shadow-md w-full max-w-xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold">Selecciona Empresa (Holding)</h1>
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
          {holdings.map((h) => (
            <button
              key={h.id}
              onClick={() => chooseHolding(h.id)}
              className="w-full text-left border p-4 rounded-xl hover:bg-gray-50"
            >
              <div className="font-semibold">{h.name}</div>
              <div className="text-xs text-gray-500">ID: {h.id}</div>
            </button>
          ))}

          {holdings.length === 0 && !error && (
            <div className="text-sm text-gray-500">No hay holdings visibles.</div>
          )}
        </div>
      </div>
    </div>
  );
}