"use client";

export default function DashboardPage() {
  const user = typeof window !== "undefined"
    ? JSON.parse(localStorage.getItem("user") || "{}")
    : {};

  const stores = typeof window !== "undefined"
    ? JSON.parse(localStorage.getItem("stores") || "[]")
    : [];

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">
        Welcome {user.fullName}
      </h1>

      <h2 className="text-lg font-semibold mb-2">Available Stores:</h2>

      <ul className="space-y-2">
        {stores.map((s: any) => (
          <li key={s.storeId} className="border p-3 rounded">
            {s.holdingName} → {s.storeName} ({s.roleKey})
          </li>
        ))}
      </ul>
    </div>
  );
}