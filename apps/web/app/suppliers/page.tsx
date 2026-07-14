"use client";

import { useEffect, useMemo, useState } from "react";
import localFont from "next/font/local";
import { requireTokenOrRedirect } from "../lib/auth";
import { useStorePermissions } from "../lib/access";

const API_BASE = "http://localhost:3001";
const headingFont = localFont({
  src: "../fonts/HFHySans_Black.ttf",
  variable: "--font-suppliers-heading",
});
const bodyFont = localFont({
  src: "../fonts/HFHySans_Regular.ttf",
  variable: "--font-suppliers-body",
});

const COUNTRY_OPTIONS = [
  "España",
  "Italia",
  "Portugal",
  "Alemania",
  "Francia",
  "Irlanda",
  "Perú",
  "Turquía",
  "China",
  "Estados Unidos",
];

const CURRENCY_OPTIONS = ["EUR", "USD", "PEN", "TRY", "CNY", "PLN"];
const PAYMENT_METHOD_OPTIONS = ["Transferencia", "Tarjeta", "PayPal", "Efectivo", "Otro"];

type Supplier = {
  id: string;
  code: string;
  name: string;
  contactName: string | null;
  contactEmail: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  defaultCurrencyCode: string | null;
  paymentMethod: string | null;
  catalogUrl: string | null;
  accessCode: string | null;
  vacationNote: string | null;
  isActive: boolean;
};

type SupplierFormState = {
  code: string;
  name: string;
  contactName: string;
  contactEmail: string;
  contactPhonePrefix: string;
  contactPhoneNumber: string;
  city: string;
  country: string;
  defaultCurrencyCode: string;
  paymentMethod: string;
  catalogUrl: string;
  accessCode: string;
  vacationNote: string;
  isActive: boolean;
};

const EMPTY_FORM: SupplierFormState = {
  code: "",
  name: "",
  contactName: "",
  contactEmail: "",
  contactPhonePrefix: "+86",
  contactPhoneNumber: "",
  city: "",
  country: "Turquía",
  defaultCurrencyCode: "TRY",
  paymentMethod: "Transferencia",
  catalogUrl: "",
  accessCode: "",
  vacationNote: "",
  isActive: true,
};

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-1.5 text-[13px] text-[#4F5568]">{children}</div>;
}

function splitPhoneParts(phone: string | null) {
  const raw = String(phone || "").trim();
  if (!raw) return { prefix: "+86", number: "" };
  const match = raw.match(/^(\+\S+)(?:\s+(.+))?$/);
  if (match) {
    return {
      prefix: match[1] || "+86",
      number: match[2] || "",
    };
  }
  return { prefix: "+86", number: raw };
}

export default function SuppliersPage() {
  const { loading, storeId, storeName, permissions, error: permissionsError } = useStorePermissions();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<SupplierFormState>(EMPTY_FORM);
  const [editingSupplierId, setEditingSupplierId] = useState("");

  const activeSuppliers = useMemo(() => suppliers.filter((item) => item.isActive).length, [suppliers]);

  async function loadAll(currentStoreId: string, nextQuery = "") {
    const token = requireTokenOrRedirect();
    if (!token) return;
    setError("");
    try {
      const url = new URL(`${API_BASE}/suppliers`);
      url.searchParams.set("storeId", currentStoreId);
      if (nextQuery.trim()) url.searchParams.set("q", nextQuery.trim());
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error loading suppliers");
        return;
      }
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

  function updateForm<K extends keyof SupplierFormState>(key: K, value: SupplierFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function saveSupplier(e: React.FormEvent) {
    e.preventDefault();
    const token = requireTokenOrRedirect();
    if (!token || !storeId || !form.code.trim() || !form.name.trim()) return;

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const phonePrefix = form.contactPhonePrefix.trim();
      const phoneNumber = form.contactPhoneNumber.trim();
      const fullPhone =
        phonePrefix || phoneNumber
          ? `${phonePrefix}${phonePrefix && phoneNumber ? " " : ""}${phoneNumber}`.trim()
          : null;
      const res = await fetch(`${API_BASE}/suppliers${editingSupplierId ? `/${editingSupplierId}` : ""}`, {
        method: editingSupplierId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          storeId,
          code: form.code.trim(),
          name: form.name.trim(),
          contactName: form.contactName.trim() || null,
          contactEmail: form.contactEmail.trim() || null,
          phone: fullPhone,
          city: form.city.trim() || null,
          country: form.country.trim() || null,
          defaultCurrencyCode: form.defaultCurrencyCode.trim() || null,
          paymentMethod: form.paymentMethod.trim() || null,
          catalogUrl: form.catalogUrl.trim() || null,
          accessCode: form.accessCode.trim() || null,
          vacationNote: form.vacationNote.trim() || null,
          isActive: form.isActive,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || (editingSupplierId ? "No se pudo actualizar el proveedor" : "No se pudo crear el proveedor"));
        return;
      }

      setForm(EMPTY_FORM);
      setEditingSupplierId("");
      setSuccess(
        editingSupplierId
          ? `Proveedor ${data.supplier?.name || "actualizado"} actualizado correctamente.`
          : `Proveedor ${data.supplier?.name || "creado"} agregado correctamente.`
      );
      await loadAll(storeId, query);
    } catch {
      setError("Connection error");
    } finally {
      setSaving(false);
    }
  }

  function startEditingSupplier(supplier: Supplier) {
    const phoneParts = splitPhoneParts(supplier.phone);
    setEditingSupplierId(supplier.id);
    setForm({
      code: supplier.code || "",
      name: supplier.name || "",
      contactName: supplier.contactName || "",
      contactEmail: supplier.contactEmail || "",
      contactPhonePrefix: phoneParts.prefix,
      contactPhoneNumber: phoneParts.number,
      city: supplier.city || "",
      country: supplier.country || "Turquía",
      defaultCurrencyCode: supplier.defaultCurrencyCode || "TRY",
      paymentMethod: supplier.paymentMethod || "Transferencia",
      catalogUrl: supplier.catalogUrl || "",
      accessCode: supplier.accessCode || "",
      vacationNote: supplier.vacationNote || "",
      isActive: supplier.isActive,
    });
    setError("");
    setSuccess("");
  }

  function cancelEditingSupplier() {
    setEditingSupplierId("");
    setForm(EMPTY_FORM);
    setError("");
    setSuccess("");
  }

  if (loading) return <div className="min-h-screen bg-[#E8EAEC] p-6">Cargando permisos...</div>;
  if (permissionsError) return <div className="min-h-screen bg-[#E8EAEC] p-6 text-red-700">{permissionsError}</div>;
  if (!permissions.financeRead) {
    return (
      <div className="min-h-screen bg-[#E8EAEC] p-6">
        <div className="mx-auto max-w-3xl rounded-2xl bg-white p-4 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">No autorizado para Proveedores.</div>
      </div>
    );
  }

  return (
    <div className={`${headingFont.variable} ${bodyFont.variable} min-h-screen bg-[#E8EAEC] p-6`}>
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="mb-2">
          <h1 className="text-[29px] leading-none text-[#141A39]" style={{ fontFamily: "var(--font-suppliers-heading)" }}>
            Proveedores
          </h1>
          <p className="mt-1 text-[13px] text-[#616984]" style={{ fontFamily: "var(--font-suppliers-body)" }}>
            {storeName ? `Tienda: ${storeName}` : "Base de proveedores para compras, seguimiento y catálogo"}
          </p>
        </div>

        {error ? <div className="rounded-xl bg-[#FDECEC] px-4 py-3 text-base text-[#B42318]">{error}</div> : null}
        {success ? <div className="rounded-xl bg-[#ECFDF3] px-4 py-3 text-base text-[#027A48]">{success}</div> : null}

        <div className="rounded-2xl bg-white p-4 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
          <div className="grid gap-3 md:grid-cols-[1fr_140px_140px_auto]">
            <div>
              <div className="text-[20px] font-semibold text-[#131936]">Base de proveedores</div>
              <div className="mt-1 text-[13px] text-[#5B637D]">Consulta rápida por nombre, país o código interno.</div>
            </div>
            <div className="rounded-2xl bg-[#F7F8FB] p-4">
              <div className="text-[12px] uppercase tracking-wide text-[#7B839C]">Total</div>
              <div className="mt-1 text-[24px] font-semibold text-[#131936]">{suppliers.length}</div>
            </div>
            <div className="rounded-2xl bg-[#F7F8FB] p-4">
              <div className="text-[12px] uppercase tracking-wide text-[#7B839C]">Activos</div>
              <div className="mt-1 text-[24px] font-semibold text-[#131936]">{activeSuppliers}</div>
            </div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!storeId) return;
                void loadAll(storeId, query);
              }}
            >
              <input
                className="h-11 w-full rounded-xl border border-[#D4D9E4] px-3 text-[14px] text-[#25304F] placeholder:text-[#8A91A8]"
                placeholder="Buscar proveedor"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button className="h-11 rounded-xl border border-[#D4D9E4] px-4 text-[14px] text-[#1D2647] hover:bg-[#F7F9FC]" type="submit">
                Buscar
              </button>
            </form>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[20px] font-semibold text-[#131936]">{editingSupplierId ? "Editar proveedor" : "Agregar proveedor"}</h2>
              <p className="mt-1 text-[13px] text-[#5B637D]">Crea o actualiza la ficha base del proveedor para compras, seguimiento y catálogo.</p>
            </div>
            <div className="rounded-full border border-[#D4D9E4] bg-[#F7F9FC] px-4 py-2 text-[13px] text-[#4F5568]">
              {editingSupplierId ? "Modo edición activo" : "Nuevo proveedor DEMARCA"}
            </div>
          </div>

          <form className="grid gap-3 md:grid-cols-12" onSubmit={saveSupplier}>
            <div className="col-span-4">
              <FieldLabel>Código interno</FieldLabel>
              <input
                className="h-11 w-full rounded-xl border border-[#D4D9E4] bg-white px-3 text-[14px] text-[#25304F] outline-none"
                placeholder="SUP-TR-002"
                value={form.code}
                onChange={(e) => updateForm("code", e.target.value)}
                required
              />
            </div>
            <div className="col-span-4">
              <FieldLabel>Nombre comercial</FieldLabel>
              <input
                className="h-11 w-full rounded-xl border border-[#D4D9E4] bg-white px-3 text-[14px] text-[#25304F] outline-none"
                placeholder="Proveedor Anatolia"
                value={form.name}
                onChange={(e) => updateForm("name", e.target.value)}
                required
              />
            </div>
            <div className="col-span-4">
              <FieldLabel>Contacto principal</FieldLabel>
              <input
                className="h-11 w-full rounded-xl border border-[#D4D9E4] bg-white px-3 text-[14px] text-[#25304F] outline-none"
                placeholder="Samantha Kaya"
                value={form.contactName}
                onChange={(e) => updateForm("contactName", e.target.value)}
              />
            </div>

            <div className="col-span-4">
              <FieldLabel>Email de contacto</FieldLabel>
              <input
                className="h-11 w-full rounded-xl border border-[#D4D9E4] bg-white px-3 text-[14px] text-[#25304F] outline-none"
                placeholder="compras@proveedor.com"
                value={form.contactEmail}
                onChange={(e) => updateForm("contactEmail", e.target.value)}
              />
            </div>
            <div className="col-span-4">
              <FieldLabel>Número de contacto</FieldLabel>
              <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3">
                <input
                  className="h-11 w-full rounded-xl border border-[#D4D9E4] bg-white px-3 text-[14px] text-[#25304F] outline-none"
                  placeholder="+86"
                  value={form.contactPhonePrefix}
                  onChange={(e) => updateForm("contactPhonePrefix", e.target.value)}
                />
                <input
                  className="h-11 w-full rounded-xl border border-[#D4D9E4] bg-white px-3 text-[14px] text-[#25304F] outline-none"
                  placeholder="611 19 13 24"
                  value={form.contactPhoneNumber}
                  onChange={(e) => updateForm("contactPhoneNumber", e.target.value)}
                />
              </div>
            </div>
            <div className="col-span-4">
              <FieldLabel>Ciudad</FieldLabel>
              <input
                className="h-11 w-full rounded-xl border border-[#D4D9E4] bg-white px-3 text-[14px] text-[#25304F] outline-none"
                placeholder="Estambul"
                value={form.city}
                onChange={(e) => updateForm("city", e.target.value)}
              />
            </div>
            <div className="col-span-4">
              <FieldLabel>País</FieldLabel>
              <select
                className="h-11 w-full rounded-xl border border-[#D4D9E4] bg-white px-3 text-[14px] text-[#25304F] outline-none"
                value={form.country}
                onChange={(e) => updateForm("country", e.target.value)}
              >
                {COUNTRY_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-4">
              <FieldLabel>Moneda habitual</FieldLabel>
              <select
                className="h-11 w-full rounded-xl border border-[#D4D9E4] bg-white px-3 text-[14px] text-[#25304F] outline-none"
                value={form.defaultCurrencyCode}
                onChange={(e) => updateForm("defaultCurrencyCode", e.target.value)}
              >
                {CURRENCY_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-4">
              <FieldLabel>Método de pago</FieldLabel>
              <select
                className="h-11 w-full rounded-xl border border-[#D4D9E4] bg-white px-3 text-[14px] text-[#25304F] outline-none"
                value={form.paymentMethod}
                onChange={(e) => updateForm("paymentMethod", e.target.value)}
              >
                {PAYMENT_METHOD_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-4">
              <FieldLabel>Estado</FieldLabel>
              <button
                type="button"
                className={`flex h-11 w-full items-center justify-between rounded-xl border px-3 text-[14px] ${
                  form.isActive ? "border-[#B9E6C8] bg-[#ECFDF3] text-[#027A48]" : "border-[#E5E7EB] bg-[#F7F8FB] text-[#667085]"
                }`}
                onClick={() => updateForm("isActive", !form.isActive)}
              >
                <span>{form.isActive ? "Activo" : "Inactivo"}</span>
                <span className={`h-4 w-4 rounded-full ${form.isActive ? "bg-[#12B76A]" : "bg-[#D0D5DD]"}`} />
              </button>
            </div>

            <div className="col-span-4">
              <FieldLabel>Link tienda / catálogo</FieldLabel>
              <input
                className="h-11 w-full rounded-xl border border-[#D4D9E4] bg-white px-3 text-[14px] text-[#25304F] outline-none"
                placeholder="https://proveedor.com/catalogo"
                value={form.catalogUrl}
                onChange={(e) => updateForm("catalogUrl", e.target.value)}
              />
            </div>
            <div className="col-span-2">
              <FieldLabel>Código</FieldLabel>
              <input
                className="h-11 w-full rounded-xl border border-[#D4D9E4] bg-white px-3 text-[14px] text-[#25304F] outline-none"
                placeholder="ABCD1234"
                value={form.accessCode}
                onChange={(e) => updateForm("accessCode", e.target.value)}
              />
            </div>
            <div className="col-span-6">
              <FieldLabel>Vacaciones / nota operativa</FieldLabel>
              <input
                className="h-11 w-full rounded-xl border border-[#D4D9E4] bg-white px-3 text-[14px] text-[#25304F] outline-none"
                placeholder="Cerrado del 10 al 20 de agosto"
                value={form.vacationNote}
                onChange={(e) => updateForm("vacationNote", e.target.value)}
              />
            </div>

            <div className="col-span-12 flex justify-end pt-1">
              {editingSupplierId ? (
                <button
                  className="mr-3 h-11 rounded-xl border border-[#D4D9E4] bg-white px-5 text-[14px] text-[#1D2647]"
                  type="button"
                  onClick={cancelEditingSupplier}
                >
                  Cancelar
                </button>
              ) : null}
              <button
                className="h-11 rounded-xl bg-[#0B1230] px-5 text-[14px] text-white disabled:opacity-60"
                type="submit"
                disabled={saving}
              >
                {saving ? "Guardando..." : editingSupplierId ? "Guardar cambios" : "Agregar proveedor"}
              </button>
            </div>
          </form>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[20px] font-semibold text-[#131936]">Lista de proveedores</div>
              <div className="text-[13px] text-[#5B637D]">Consulta rápida de estado, moneda, contacto y ciudad.</div>
            </div>
            <div className="rounded-full border border-[#D4D9E4] bg-white px-4 py-2 text-[13px] text-[#4F5568]">
              {suppliers.length} proveedores cargados
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-[#E5E7EB]">
            <table className="min-w-full text-left text-[15px]">
              <thead className="border-b border-[#D0D5DD] bg-[#F8F9FC] text-[#151B43]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Código</th>
                  <th className="px-4 py-3 font-semibold">Proveedor</th>
                  <th className="px-4 py-3 font-semibold">Contacto</th>
                  <th className="px-4 py-3 font-semibold">Ciudad</th>
                  <th className="px-4 py-3 font-semibold">País</th>
                  <th className="px-4 py-3 font-semibold">Moneda</th>
                  <th className="px-4 py-3 font-semibold">Pago</th>
                  <th className="px-4 py-3 font-semibold">Código</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white text-[#3B4256]">
                {suppliers.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-[16px] text-[#7B839C]">
                      Sin proveedores registrados.
                    </td>
                  </tr>
                ) : (
                  suppliers.map((supplier) => (
                    <tr key={supplier.id} className="border-b border-[#EEF1F6] last:border-b-0">
                      <td className="px-4 py-4 font-medium text-[#151B43]">{supplier.code}</td>
                      <td className="px-4 py-4">
                        <div className="font-medium text-[#151B43]">{supplier.name}</div>
                        {supplier.catalogUrl ? (
                          <a className="mt-1 block text-[13px] text-[#5967D8]" href={supplier.catalogUrl} target="_blank" rel="noreferrer">
                            Ver catálogo
                          </a>
                        ) : null}
                      </td>
                      <td className="px-4 py-4">
                        <div>{supplier.contactName || "-"}</div>
                        <div className="mt-1 text-[13px] text-[#7B839C]">{supplier.contactEmail || "-"}</div>
                        <div className="mt-1 text-[13px] text-[#7B839C]">{supplier.phone || "-"}</div>
                      </td>
                      <td className="px-4 py-4">{supplier.city || "-"}</td>
                      <td className="px-4 py-4">{supplier.country || "-"}</td>
                      <td className="px-4 py-4">{supplier.defaultCurrencyCode || "-"}</td>
                      <td className="px-4 py-4">{supplier.paymentMethod || "-"}</td>
                      <td className="px-4 py-4">{supplier.accessCode || "-"}</td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-[13px] ${
                            supplier.isActive ? "bg-[#ECFDF3] text-[#027A48]" : "bg-[#F2F4F7] text-[#667085]"
                          }`}
                        >
                          {supplier.isActive ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <button
                          type="button"
                          className="rounded-full border border-[#CFD5E3] bg-white px-4 py-2 text-[13px] text-[#1D2340] hover:bg-[#F7F8FB]"
                          onClick={() => startEditingSupplier(supplier)}
                        >
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
