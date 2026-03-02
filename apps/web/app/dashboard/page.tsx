"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { requireTokenOrRedirect } from "../lib/auth";
import Topbar from "../components/topbar";

type UserRow = {
  fullName?: string;
};

type StoreRow = {
  storeId: string;
  storeName: string;
  holdingName: string;
};

export default function DashboardPage() {
  const router = useRouter();
  const [userName, setUserName] = useState<string>("");
  const [storeName, setStoreName] = useState<string>("");
  const [holdingName, setHoldingName] = useState<string>("");

  useEffect(() => {
    const token = requireTokenOrRedirect();
    if (!token) return;

    const selectedStoreId = localStorage.getItem("selectedStoreId");
    if (!selectedStoreId) {
      router.push("/select-store");
      return;
    }

    (async () => {
      let nextUserName = "";
      let nextStoreName = "";
      let nextHoldingName = "";

      const userRaw = localStorage.getItem("user");
      try {
        if (userRaw) {
          const user = JSON.parse(userRaw) as UserRow;
          nextUserName = user.fullName || "";
        }
      } catch {}

      const storesRaw = localStorage.getItem("stores");
      try {
        if (storesRaw) {
          const stores = JSON.parse(storesRaw) as StoreRow[];
          const found = stores.find((s) => s.storeId === selectedStoreId);
          if (found) {
            nextStoreName = found.storeName || "";
            nextHoldingName = found.holdingName || "";
          }
        }
      } catch {}

      setUserName(nextUserName);
      setStoreName(nextStoreName);
      setHoldingName(nextHoldingName);
    })();
  }, [router]);

  function goTo(path: string) {
    router.push(path);
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-5xl mx-auto space-y-4">
        <Topbar title="Dashboard" storeName={storeName} />

        <div className="mt-6 bg-white p-6 rounded-2xl shadow-md">
          <h2 className="text-lg font-semibold mb-2">Resumen</h2>
          <p className="text-sm text-gray-700">Holding: {holdingName || "-"}</p>
          <p className="text-sm text-gray-700 mb-3">Usuario: {userName || "-"}</p>
          <p className="text-sm text-gray-700 mb-4">
            Fase 5 activa: clientes y soporte (tickets/quejas), junto al flujo operativo, financiero y coordinación interna de fases previas.
          </p>
          <div className="flex gap-2 flex-wrap">
            <button className="px-4 py-2 rounded bg-black text-white" onClick={() => goTo("/store/inventory")}>
              Ir a Inventario
            </button>
            <button className="px-4 py-2 rounded border" onClick={() => goTo("/store/products")}>
              Ir a Productos
            </button>
            <button className="px-4 py-2 rounded border" onClick={() => goTo("/store/orders")}>
              Ir a Pedidos
            </button>
            <button className="px-4 py-2 rounded border" onClick={() => goTo("/store/suppliers")}>
              Ir a Proveedores
            </button>
            <button className="px-4 py-2 rounded border" onClick={() => goTo("/store/purchases")}>
              Ir a Compras
            </button>
            <button className="px-4 py-2 rounded border" onClick={() => goTo("/store/3pl")}>
              Ir a 3PL
            </button>
            <button className="px-4 py-2 rounded border" onClick={() => goTo("/store/payouts")}>
              Ir a Payouts
            </button>
            <button className="px-4 py-2 rounded border" onClick={() => goTo("/store/invoices")}>
              Ir a Facturas
            </button>
            <button className="px-4 py-2 rounded border" onClick={() => goTo("/store/analytics")}>
              Ir a Analytics
            </button>
            <button className="px-4 py-2 rounded border" onClick={() => goTo("/store/returns")}>
              Ir a Devoluciones
            </button>
            <button className="px-4 py-2 rounded border" onClick={() => goTo("/store/customers")}>
              Ir a Clientes
            </button>
            <button className="px-4 py-2 rounded border" onClick={() => goTo("/store/tasks")}>
              Ir a Tareas
            </button>
            <button className="px-4 py-2 rounded border" onClick={() => goTo("/store/chat")}>
              Ir a Chat
            </button>
            <button className="px-4 py-2 rounded border" onClick={() => goTo("/store/support")}>
              Ir a Soporte
            </button>
            <button className="px-4 py-2 rounded border" onClick={() => goTo("/store/settings")}>
              Ir a Configuración
            </button>
            <button className="px-4 py-2 rounded border" onClick={() => goTo("/select-store")}>
              Cambiar tienda
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
