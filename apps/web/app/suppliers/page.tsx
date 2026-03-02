"use client";

import { useEffect, useState } from "react";
import Topbar from "../components/topbar";
import { requireTokenOrRedirect } from "../lib/auth";
import { useStorePermissions } from "../lib/access";

const API_BASE = "http://localhost:3001";

type Supplier = {
  id: string;
  code: string;
  name: string;
  country: string | null;
  defaultCurrencyCode: string | null;
  isActive: boolean;
};

export default function SuppliersPage() {
  const { loading, storeId, storeName, permissions, error: permissionsError } = useStorePermissions();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [error, setError] = useState("");

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [country, setCountry] = useState("TR");
  const [currency, setCurrency] = useState("TRY");

  async function loadAll(currentStoreId: string) {
    const token = requireTokenOrRedirect();
    if (!token) return;
    setError("");
    try {
      const res = await fetch(`${API_BASE}/suppliers?storeId=${encodeURIComponent(currentStoreId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error || "Error loading suppliers");
      setSuppliers(data.suppliers || []);
    } catch {
      setError("Connection error");
    }
  }

  useEffect(() => {
    if (loading) return;
    if (!storeId || !permissions.financeRead) return;
    queueMicrotask(() => {
      void loadAll(storeId);
    });
  }, [loading, storeId, permissions.financeRead]);

  async function createSupplier(e: React.FormEvent) {
    e.preventDefault();
    const token = requireTokenOrRedirect();
    if (!token || !storeId || !code || !name) return;

    const res = await fetch(`${API_BASE}/suppliers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        storeId,
        code,
        name,
        country,
        defaultCurrencyCode: currency,
      }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error || "Cannot create supplier");

    setCode("");
    setName("");
    await loadAll(storeId);
  }

  if (loading) return <div className="min-h-screen bg-gray-100 p-6">Cargando permisos...</div>;
  if (permissionsError) return <div className="min-h-screen bg-gray-100 p-6 text-red-700">{permissionsError}</div>;
  if (!permissions.financeRead) {
    return (
      <div className="min-h-screen bg-gray-100 p-6">
        <div className="max-w-3xl mx-auto bg-white p-4 rounded-2xl shadow-md">No autorizado para Proveedores.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <Topbar title="Proveedores" storeName={storeName} />
        {error ? <div className="bg-red-100 text-red-700 p-3 rounded">{error}</div> : null}

        <div className="bg-white p-4 rounded-2xl shadow-md">
          <h2 className="font-semibold mb-3">Nuevo proveedor</h2>
          <form className="grid md:grid-cols-5 gap-2" onSubmit={createSupplier}>
            <input className="border rounded px-3 py-2" placeholder="SUP-TR-002" value={code} onChange={(e) => setCode(e.target.value)} required />
            <input className="border rounded px-3 py-2" placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} required />
            <input className="border rounded px-3 py-2" placeholder="País" value={country} onChange={(e) => setCountry(e.target.value)} />
            <input className="border rounded px-3 py-2" placeholder="Moneda" value={currency} onChange={(e) => setCurrency(e.target.value)} />
            <button className="rounded bg-black text-white px-3 py-2" type="submit">Crear</button>
          </form>
        </div>

        <div className="bg-white rounded-2xl shadow-md overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-3 py-2">Código</th>
                <th className="text-left px-3 py-2">Nombre</th>
                <th className="text-left px-3 py-2">País</th>
                <th className="text-left px-3 py-2">Moneda</th>
                <th className="text-left px-3 py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-gray-500">Sin proveedores</td>
                </tr>
              ) : (
                suppliers.map((s) => (
                  <tr key={s.id} className="border-b">
                    <td className="px-3 py-2">{s.code}</td>
                    <td className="px-3 py-2">{s.name}</td>
                    <td className="px-3 py-2">{s.country || "-"}</td>
                    <td className="px-3 py-2">{s.defaultCurrencyCode || "-"}</td>
                    <td className="px-3 py-2">{s.isActive ? "active" : "inactive"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
