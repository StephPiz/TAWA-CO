"use client";

import { useEffect, useState } from "react";
import { requireTokenOrRedirect } from "../lib/auth";
import Topbar from "../components/topbar";
import { useStorePermissions } from "../lib/access";

const API_BASE = "http://localhost:3001";

type Warehouse = {
  id: string;
  code: string;
  name: string;
  country: string | null;
  locations: { id: string; code: string; name: string | null }[];
};

type Channel = {
  id: string;
  code: string;
  name: string;
  type: string;
  status: string;
};

export default function SettingsPage() {
  const { loading: permissionsLoading, permissions, error: permissionsError } = useStorePermissions();
  const [storeId, setStoreId] = useState("");
  const [storeName, setStoreName] = useState("");
  const [error, setError] = useState("");
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);

  const [whCode, setWhCode] = useState("");
  const [whName, setWhName] = useState("");
  const [whCountry, setWhCountry] = useState("ES");

  const [chCode, setChCode] = useState("");
  const [chName, setChName] = useState("");
  const [chType, setChType] = useState("shopify");
  const [locWarehouseId, setLocWarehouseId] = useState("");
  const [locCode, setLocCode] = useState("");
  const [locName, setLocName] = useState("");

  async function loadAll(currentStoreId: string) {
    const token = requireTokenOrRedirect();
    if (!token) return;
    setError("");
    try {
      const [wRes, cRes] = await Promise.all([
        fetch(`${API_BASE}/stores/${currentStoreId}/warehouses`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/stores/${currentStoreId}/channels`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      const wData = await wRes.json();
      const cData = await cRes.json();

      if (wRes.ok) setWarehouses(wData.warehouses || []);
      if (cRes.ok) setChannels(cData.channels || []);
      if (!wRes.ok) setError(wData.error || "Error loading warehouses");
      if (!cRes.ok) setError(cData.error || "Error loading channels");
    } catch {
      setError("Connection error");
    }
  }

  useEffect(() => {
    const token = requireTokenOrRedirect();
    if (!token) return;

    (async () => {
      const selectedStoreId = localStorage.getItem("selectedStoreId");
      if (!selectedStoreId) return;

      let nextStoreName = "";
      try {
        const storesRaw = localStorage.getItem("stores");
        if (storesRaw) {
          const stores = JSON.parse(storesRaw) as { storeId: string; storeName: string }[];
          nextStoreName = stores.find((s) => s.storeId === selectedStoreId)?.storeName || "";
        }
      } catch {}

      setStoreId(selectedStoreId);
      setStoreName(nextStoreName);
      await loadAll(selectedStoreId);
    })();
  }, []);

  if (permissionsLoading) return <div className="min-h-screen bg-gray-100 p-6">Cargando permisos...</div>;
  if (permissionsError) return <div className="min-h-screen bg-gray-100 p-6 text-red-700">{permissionsError}</div>;
  if (!permissions.settingsWrite) {
    return <div className="min-h-screen bg-gray-100 p-6 text-red-700">No autorizado para Configuracion.</div>;
  }

  async function createWarehouse(e: React.FormEvent) {
    e.preventDefault();
    const token = requireTokenOrRedirect();
    if (!token || !storeId) return;
    const res = await fetch(`${API_BASE}/stores/${storeId}/warehouses`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ code: whCode, name: whName, country: whCountry, type: "own", status: "active" }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error || "Cannot create warehouse");
    setWhCode("");
    setWhName("");
    loadAll(storeId);
  }

  async function createChannel(e: React.FormEvent) {
    e.preventDefault();
    const token = requireTokenOrRedirect();
    if (!token || !storeId) return;
    const res = await fetch(`${API_BASE}/stores/${storeId}/channels`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ code: chCode, name: chName, type: chType, status: "active" }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error || "Cannot create channel");
    setChCode("");
    setChName("");
    loadAll(storeId);
  }

  async function createLocation(e: React.FormEvent) {
    e.preventDefault();
    const token = requireTokenOrRedirect();
    if (!token || !storeId || !locWarehouseId || !locCode) return;
    const res = await fetch(`${API_BASE}/stores/${storeId}/warehouses/${locWarehouseId}/locations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ code: locCode, name: locName || null }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error || "Cannot create location");
    setLocCode("");
    setLocName("");
    await loadAll(storeId);
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <Topbar title="Configuracion" storeName={storeName} />
        {error ? <div className="bg-red-100 text-red-700 p-3 rounded">{error}</div> : null}

        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-white p-4 rounded-2xl shadow-md">
            <h2 className="font-semibold mb-3">Almacenes</h2>
            <form className="grid grid-cols-4 gap-2 mb-3" onSubmit={createWarehouse}>
              <input
                className="border rounded px-3 py-2"
                placeholder="Code"
                value={whCode}
                onChange={(e) => setWhCode(e.target.value)}
                required
              />
              <input
                className="border rounded px-3 py-2"
                placeholder="Name"
                value={whName}
                onChange={(e) => setWhName(e.target.value)}
                required
              />
              <input
                className="border rounded px-3 py-2"
                placeholder="Country"
                value={whCountry}
                onChange={(e) => setWhCountry(e.target.value)}
              />
              <button className="rounded bg-black text-white px-3 py-2" type="submit">
                Crear
              </button>
            </form>
            <div className="text-sm space-y-2">
              {warehouses.map((w) => (
                <div key={w.id} className="border rounded p-2">
                  <div>
                    <b>{w.code}</b> - {w.name} ({w.country || "-"})
                  </div>
                  <div className="text-xs text-gray-600">
                    Ubicaciones: {w.locations.length ? w.locations.map((l) => l.code).join(", ") : "sin ubicaciones"}
                  </div>
                </div>
              ))}
            </div>
            <form className="grid grid-cols-3 gap-2 mt-3" onSubmit={createLocation}>
              <select
                className="border rounded px-3 py-2"
                value={locWarehouseId}
                onChange={(e) => setLocWarehouseId(e.target.value)}
              >
                <option value="">Warehouse</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code}
                  </option>
                ))}
              </select>
              <input
                className="border rounded px-3 py-2"
                placeholder="Location code"
                value={locCode}
                onChange={(e) => setLocCode(e.target.value)}
              />
              <div className="flex gap-2">
                <input
                  className="border rounded px-3 py-2 w-full"
                  placeholder="Location name"
                  value={locName}
                  onChange={(e) => setLocName(e.target.value)}
                />
                <button className="rounded bg-black text-white px-3 py-2" type="submit">
                  +
                </button>
              </div>
            </form>
          </div>

          <div className="bg-white p-4 rounded-2xl shadow-md">
            <h2 className="font-semibold mb-3">Canales</h2>
            <form className="grid grid-cols-4 gap-2 mb-3" onSubmit={createChannel}>
              <input
                className="border rounded px-3 py-2"
                placeholder="Code"
                value={chCode}
                onChange={(e) => setChCode(e.target.value)}
                required
              />
              <input
                className="border rounded px-3 py-2"
                placeholder="Name"
                value={chName}
                onChange={(e) => setChName(e.target.value)}
                required
              />
              <select className="border rounded px-3 py-2" value={chType} onChange={(e) => setChType(e.target.value)}>
                <option value="shopify">shopify</option>
                <option value="idealo">idealo</option>
                <option value="marketplace">marketplace</option>
                <option value="manual">manual</option>
                <option value="other">other</option>
              </select>
              <button className="rounded bg-black text-white px-3 py-2" type="submit">
                Crear
              </button>
            </form>
            <div className="text-sm space-y-2">
              {channels.map((c) => (
                <div key={c.id} className="border rounded p-2">
                  <b>{c.code}</b> - {c.name} ({c.type}) [{c.status}]
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
