"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import localFont from "next/font/local";
import { useEffect, useRef, useState } from "react";
import { logout, requireTokenOrRedirect } from "../lib/auth";

const headingFont = localFont({
  src: "../fonts/HFHySans_Black.ttf",
  variable: "--font-add-store-heading",
});

const bodyFont = localFont({
  src: "../fonts/HFHySans_Regular.ttf",
  variable: "--font-add-store-body",
});

const swinstonRegularFont = localFont({
  src: "../fonts/SwinstonSansDemo-Regular.ttf",
  variable: "--font-add-store-swinston-regular",
});

const countryOptions = [
  { code: "DE", name: "Alemania" },
  { code: "SA", name: "Arabia Saudita" },
  { code: "AR", name: "Argentina" },
  { code: "AU", name: "Australia" },
  { code: "AT", name: "Austria" },
  { code: "BE", name: "Belgica" },
  { code: "BO", name: "Bolivia" },
  { code: "BR", name: "Brasil" },
  { code: "BG", name: "Bulgaria" },
  { code: "CA", name: "Canada" },
  { code: "CL", name: "Chile" },
  { code: "CN", name: "China" },
  { code: "CO", name: "Colombia" },
  { code: "KR", name: "Corea del Sur" },
  { code: "CR", name: "Costa Rica" },
  { code: "HR", name: "Croacia" },
  { code: "DK", name: "Dinamarca" },
  { code: "EC", name: "Ecuador" },
  { code: "SV", name: "El Salvador" },
  { code: "AE", name: "Emiratos Arabes Unidos" },
  { code: "SK", name: "Eslovaquia" },
  { code: "SI", name: "Eslovenia" },
  { code: "ES", name: "España" },
  { code: "US", name: "Estados Unidos" },
  { code: "EE", name: "Estonia" },
  { code: "PH", name: "Filipinas" },
  { code: "FI", name: "Finlandia" },
  { code: "FR", name: "Francia" },
  { code: "GR", name: "Grecia" },
  { code: "GT", name: "Guatemala" },
  { code: "NL", name: "Holanda" },
  { code: "HN", name: "Honduras" },
  { code: "HU", name: "Hungria" },
  { code: "IN", name: "India" },
  { code: "ID", name: "Indonesia" },
  { code: "IE", name: "Irlanda" },
  { code: "IS", name: "Islandia" },
  { code: "IL", name: "Israel" },
  { code: "IT", name: "Italia" },
  { code: "JP", name: "Japon" },
  { code: "LV", name: "Letonia" },
  { code: "LT", name: "Lituania" },
  { code: "LU", name: "Luxemburgo" },
  { code: "MY", name: "Malasia" },
  { code: "MT", name: "Malta" },
  { code: "MX", name: "Mexico" },
  { code: "NO", name: "Noruega" },
  { code: "NZ", name: "Nueva Zelanda" },
  { code: "PA", name: "Panama" },
  { code: "PY", name: "Paraguay" },
  { code: "PE", name: "Perú" },
  { code: "PL", name: "Polonia" },
  { code: "PT", name: "Portugal" },
  { code: "GB", name: "Reino Unido" },
  { code: "CZ", name: "Republica Checa" },
  { code: "DO", name: "Republica Dominicana" },
  { code: "RO", name: "Rumania" },
  { code: "SE", name: "Suecia" },
  { code: "CH", name: "Suiza" },
  { code: "TH", name: "Tailandia" },
  { code: "TW", name: "Taiwan" },
  { code: "TR", name: "Turquia" },
  { code: "UA", name: "Ucrania" },
  { code: "UY", name: "Uruguay" },
  { code: "VE", name: "Venezuela" },
  { code: "VN", name: "Vietnam" },
];

const getFlagEmoji = (countryCode: string) =>
  countryCode
    .toUpperCase()
    .split("")
    .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join("");

const defaultSalesCountryCodes = ["ES", "IT", "PT", "DE", "PL", "FR", "PE"];
const fixedBrandColorsCount = 3;
const maxExtraBrandColors = 3;
const API_BASE = "http://localhost:3001";
const currencyOptions = [
  { code: "EUR", label: "EURO €" },
  { code: "USD", label: "DOLARES $" },
  { code: "PEN", label: "SOLES S/" },
  { code: "CNY", label: "YUANES ¥" },
  { code: "TRY", label: "LIRA TURCA ₺" },
  { code: "PLN", label: "ZLOTY zł" },
];

type SuccessState = {
  storeName: string;
  fiscalCountryName: string;
  baseCurrencyLabel: string;
  warehousesCount: number;
  marketplacesCount: number;
};

export default function AddStorePage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const colorPickerRef = useRef<HTMLInputElement | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const [storeNameInput, setStoreNameInput] = useState("");
  const [internalDescription, setInternalDescription] = useState("");
  const [baseCurrency, setBaseCurrency] = useState("");
  const [fiscalCountry, setFiscalCountry] = useState("");
  const [salesCountry, setSalesCountry] = useState("");
  const [logoPath, setLogoPath] = useState("");
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoUploadError, setLogoUploadError] = useState("");
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [successState, setSuccessState] = useState<SuccessState | null>(null);
  const [showSuccessCard, setShowSuccessCard] = useState(false);
  const [brandColors, setBrandColors] = useState(["#B7D1CE", "#8D79E5", "#D4A7F0"]);
  const [editingColorIndex, setEditingColorIndex] = useState<number | null>(null);
  const maxBrandColors = fixedBrandColorsCount + maxExtraBrandColors;
  const canAddBrandColor = brandColors.length < maxBrandColors;
  const logoPreviewUrl = logoPath ? `${API_BASE}${logoPath}` : "";

  async function handleLogoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setLogoUploadError("");
    if (!file.type.startsWith("image/")) {
      setLogoUploadError("Solo se permiten imagenes");
      return;
    }

    const token = requireTokenOrRedirect();
    if (!token) return;

    try {
      setLogoUploading(true);
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("No se pudo leer la imagen"));
        reader.readAsDataURL(file);
      });

      const uploadUrl = `${API_BASE}/uploads/store-logo`;
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ dataUrl }),
      });
      const raw = await res.text();
      let payload: { error?: string; path?: string } = {};
      try {
        payload = raw ? JSON.parse(raw) : {};
      } catch {
        payload = {};
      }
      if (!res.ok) {
        if (res.status === 401) {
          setLogoUploadError("Sesion expirada. Vuelve a iniciar sesion.");
          setTimeout(() => logout(), 600);
          return;
        }
        throw new Error(payload?.error || "No se pudo subir la imagen (verifica que API este activa en :3001)");
      }
      setLogoPath(payload.path || "");
    } catch (err) {
      setLogoUploadError(err instanceof Error ? err.message : "Error al subir imagen");
    } finally {
      setLogoUploading(false);
      if (event.target) event.target.value = "";
    }
  }
  const [salesCountries, setSalesCountries] = useState([
    { code: "ES", active: true },
    { code: "IT", active: false },
    { code: "PT", active: false },
    { code: "DE", active: false },
    { code: "PL", active: false },
    { code: "FR", active: false },
    { code: "PE", active: false },
  ]);
  const [showMarketplaceInput, setShowMarketplaceInput] = useState(false);
  const [marketplaceInput, setMarketplaceInput] = useState("");
  const [marketplaces, setMarketplaces] = useState([
    { name: "Shopify", active: true, isDefault: true },
  ]);
  const [showWarehouseInput, setShowWarehouseInput] = useState(false);
  const [warehouseInput, setWarehouseInput] = useState("");
  const [mobileStep, setMobileStep] = useState(1);
  const [activeWarehouses, setActiveWarehouses] = useState([
    { name: "ES-SEG", active: true, isDefault: true },
  ]);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const todayLabel = now
    ? (() => {
        const raw = new Intl.DateTimeFormat("es-ES", {
          weekday: "long",
          day: "2-digit",
          month: "long",
          year: "numeric",
        })
          .format(now)
          .replace(",", "");
        return raw.charAt(0).toUpperCase() + raw.slice(1);
      })()
    : "";
  const timeLabel = now
    ? new Intl.DateTimeFormat("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(now)
    : "";

  useEffect(() => {
    if (!successState) {
      setShowSuccessCard(false);
      return;
    }
    const timer = setTimeout(() => setShowSuccessCard(true), 550);
    return () => clearTimeout(timer);
  }, [successState]);

  const activeSalesCountries = salesCountries.filter((c) => c.active);
  const activeMarketplaces = marketplaces.filter((m) => m.active);
  const activeWarehouseList = activeWarehouses.filter((w) => w.active);
  const isFormValid =
    storeNameInput.trim().length > 0 &&
    internalDescription.trim().length > 0 &&
    baseCurrency.length > 0 &&
    fiscalCountry.length > 0 &&
    activeSalesCountries.length > 0 &&
    activeMarketplaces.length > 0;

  async function handleConfirmStore() {
    const token = requireTokenOrRedirect();
    if (!token) return;

    if (!isFormValid) {
      setSubmitError("Completa todos los campos requeridos para confirmar.");
      return;
    }

    const holdingId = localStorage.getItem("selectedHoldingId") || "";
    if (!holdingId) {
      setSubmitError("No se encontro holding seleccionado. Vuelve a elegir espacio.");
      return;
    }

    setSubmitError("");
    setSubmitLoading(true);

    try {
      const res = await fetch(`${API_BASE}/stores`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          holdingId,
          name: storeNameInput.trim(),
          description: internalDescription.trim(),
          logoUrl: logoPath || null,
          themeColor: brandColors[0] || null,
          baseCurrencyCode: baseCurrency,
          fiscalCountryCode: fiscalCountry,
          salesCountryCodes: activeSalesCountries.map((c) => c.code),
          marketplaces: activeMarketplaces.map((m) => m.name),
          warehouses: activeWarehouseList.map((w) => w.name),
        }),
      });

      const raw = await res.text();
      let data: { error?: string; store?: { id?: string } } = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = {};
      }
      if (res.status === 401) {
        logout();
        return;
      }
      if (!res.ok) {
        setSubmitError(data?.error ? `${data.error} (status ${res.status})` : `No se pudo crear la tienda (status ${res.status}).`);
        return;
      }

      const fiscalCountryName = countryOptions.find((c) => c.code === fiscalCountry)?.name || fiscalCountry;
      const baseCurrencyLabel = currencyOptions.find((c) => c.code === baseCurrency)?.label || baseCurrency;
      const createdStoreId = data?.store?.id ? String(data.store.id) : "";
      if (createdStoreId) localStorage.setItem("selectedStoreId", createdStoreId);

      setSuccessState({
        storeName: storeNameInput.trim(),
        fiscalCountryName,
        baseCurrencyLabel,
        warehousesCount: activeWarehouseList.length,
        marketplacesCount: activeMarketplaces.length,
      });
    } catch {
      setSubmitError("Error de conexion con API.");
    } finally {
      setSubmitLoading(false);
    }
  }

  if (!mounted) {
    return (
      <main className={`${headingFont.variable} ${bodyFont.variable} ${swinstonRegularFont.variable} h-[100dvh] overflow-hidden bg-[#E8EAEC] p-4 md:h-screen md:bg-[#DADCE0] md:p-6`} />
    );
  }

  if (successState) {
    return (
      <main className={`${headingFont.variable} ${bodyFont.variable} h-[100dvh] overflow-hidden bg-[#4449CD] md:min-h-screen md:p-6`}>
        <div className="mx-auto flex h-full w-full max-w-[1280px] flex-col text-center">
          <div className="flex h-full flex-col items-center px-6 pt-16 md:hidden">
            <Image
              src="/branding/releases-illustration.png"
              alt="Tienda agregada"
              width={140}
              height={140}
              className="h-auto w-[128px]"
              priority
            />
            <h1 className="mt-6 text-[50px] leading-[1.06] text-[#11152F]" style={{ fontFamily: "var(--font-add-store-heading)" }}>
              Tienda agregada
              <br />
              correctamente
            </h1>

            <div
              className={`mt-auto w-[calc(100%+3rem)] rounded-t-[30px] bg-[#E8EAEC] px-8 pb-10 pt-12 text-left text-[#11152F] transition-all duration-700 ${
                showSuccessCard ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-16 opacity-0"
              }`}
            >
              <h2 className="text-center text-[32px] leading-none" style={{ fontFamily: "var(--font-add-store-heading)" }}>
                Bienvenido {successState.storeName}
              </h2>

              <div className="mx-auto mt-10 max-w-[280px] space-y-3 text-[18px]" style={{ fontFamily: "var(--font-add-store-body)" }}>
                <div className="grid grid-cols-[22px_1fr_auto_1fr] items-center gap-3">
                  <span>🇪🇸</span>
                  <span>Base fiscal</span>
                  <span>:</span>
                  <span>{successState.fiscalCountryName}</span>
                </div>
                <div className="grid grid-cols-[22px_1fr_auto_1fr] items-center gap-3">
                  <span>💰</span>
                  <span>Moneda base</span>
                  <span>:</span>
                  <span>{successState.baseCurrencyLabel}</span>
                </div>
                <div className="grid grid-cols-[22px_1fr_auto_1fr] items-center gap-3">
                  <span>🗄️</span>
                  <span>Almacenes</span>
                  <span>:</span>
                  <span>{successState.warehousesCount}</span>
                </div>
                <div className="grid grid-cols-[22px_1fr_auto_1fr] items-center gap-3">
                  <span>🛒</span>
                  <span>Marketplaces</span>
                  <span>:</span>
                  <span>{successState.marketplacesCount}</span>
                </div>
              </div>

              <div className="mt-10 flex justify-center">
                <button
                  type="button"
                  className="h-[52px] rounded-full bg-[#0B1230] px-10 text-[18px] text-white"
                  style={{ fontFamily: "var(--font-add-store-heading)" }}
                  onClick={() => router.push("/select-store")}
                >
                  Ver tienda
                </button>
              </div>
            </div>
          </div>

          <div className="hidden w-full md:block">
            <Image
              src="/branding/releases-illustration.png"
              alt="Tienda agregada"
              width={160}
              height={160}
              className="mx-auto h-auto w-[150px]"
              priority
            />
            <h1 className="mt-6 text-[38px] leading-none text-[#11152F]" style={{ fontFamily: "var(--font-add-store-heading)" }}>
              Tienda agregada correctamente
            </h1>

            <div
              className={`mx-auto mt-10 min-h-[520px] rounded-[38px] bg-[#E8EAEC] px-12 py-12 text-left text-[#11152F] shadow-[0_22px_55px_rgba(0,0,0,0.2)] transition-all duration-700 ${
                showSuccessCard ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-12 opacity-0"
              }`}
            >
              <div className="mt-10">
                <h2 className="text-center text-[30px] leading-none" style={{ fontFamily: "var(--font-add-store-heading)" }}>
                  Bienvenido {successState.storeName}
                </h2>

                <div className="mx-auto mt-10 max-w-[620px] space-y-3 text-[18px]" style={{ fontFamily: "var(--font-add-store-body)" }}>
                  <div className="flex items-center gap-4">
                    <span className="relative left-[145px]">🇪🇸</span>
                    <span className="w-[270px] text-right">Base fiscal</span>
                    <span>:</span>
                    <span>{successState.fiscalCountryName}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="relative left-[145px]">💰</span>
                    <span className="w-[270px] text-right">Moneda base</span>
                    <span>:</span>
                    <span>{successState.baseCurrencyLabel}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="relative left-[145px]">🗄️</span>
                    <span className="w-[270px] text-right">Almacenes</span>
                    <span>:</span>
                    <span>{successState.warehousesCount}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="relative left-[145px]">🛒</span>
                    <span className="w-[270px] text-right">Marketplaces</span>
                    <span>:</span>
                    <span>{successState.marketplacesCount}</span>
                  </div>
                </div>

                <div className="mt-12 flex justify-center">
                  <button
                    type="button"
                    className="h-[52px] rounded-full bg-[#0B1230] px-10 text-[18px] text-white"
                    style={{ fontFamily: "var(--font-add-store-heading)" }}
                    onClick={() => router.push("/select-store")}
                  >
                    Ver tienda
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main suppressHydrationWarning className={`${headingFont.variable} ${bodyFont.variable} ${swinstonRegularFont.variable} h-[100dvh] overflow-hidden bg-[#E8EAEC] p-4 md:h-screen md:bg-[#DADCE0] md:p-6`}>
      <section className="mx-auto h-[calc(100dvh-2rem)] max-w-[380px] md:hidden">
        <div className="flex h-full flex-col px-2 pb-3 pt-2 text-[#121633]">
          <div className="mb-4 flex items-center justify-between text-[15px] leading-none text-[#555b70]" style={{ fontFamily: "var(--font-add-store-swinston-regular)" }}>
            <span>&gt; Paso {mobileStep} de 3</span>
            <button
              type="button"
              className="text-[15px] text-[#666] hover:text-[#121633]"
              style={{ fontFamily: "var(--font-add-store-swinston-regular)" }}
              onClick={() => {
                if (mobileStep > 1) {
                  setMobileStep((prev) => Math.max(1, prev - 1));
                } else {
                  router.back();
                }
              }}
            >
              Volver
            </button>
          </div>

          {mobileStep === 1 ? (
            <div className="mt-8">
              <h1 className="text-[32px] leading-none text-[#141A39]" style={{ fontFamily: "var(--font-add-store-heading)" }}>
                Agregar Tienda
              </h1>
              <p className="mt-2 text-[14px] leading-[1.25] text-[#2c3248]" style={{ fontFamily: "var(--font-add-store-body)" }}>
                Crea una nueva tienda dentro de TAWA
              </p>

              <input
                className="mt-10 h-[52px] w-full rounded-full border-none bg-white px-5 text-[16px] text-[#727780] outline-none"
                placeholder="Ingresar el nombre de la tienda"
                style={{ fontFamily: "var(--font-add-store-body)" }}
                value={storeNameInput}
                onChange={(e) => setStoreNameInput(e.target.value)}
              />

              <div className="mt-4 text-[16px] text-[#1f253c]" style={{ fontFamily: "var(--font-add-store-body)" }}>
                Logo
              </div>
              <button
                type="button"
                className="mt-2 flex h-[120px] w-full items-center justify-center rounded-[16px] border-2 border-dashed border-[#7e8598] bg-[#ECEEF1]"
                onClick={() => logoInputRef.current?.click()}
              >
                {logoPreviewUrl ? (
                  <div className="flex h-full w-full items-center gap-3 px-4">
                    <img src={logoPreviewUrl} alt="Logo de tienda" className="h-16 w-16 rounded-xl object-contain bg-white p-1" />
                    <div className="text-left text-[12px] leading-[1.2] text-[#4f5568]" style={{ fontFamily: "var(--font-add-store-body)" }}>
                      Logo subido correctamente
                      <br />
                      Click para reemplazar
                    </div>
                  </div>
                ) : (
                  <div className="text-center">
                    <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[#CFC7F5] text-[34px] text-[#6142C4]">
                      {logoUploading ? "…" : "+"}
                    </div>
                    <div className="mt-2 text-[12px] leading-[1.2] text-[#4f5568]" style={{ fontFamily: "var(--font-add-store-body)" }}>
                      {logoUploading ? "Subiendo imagen..." : "Subir imagen (512x512 PNG / SVG)"}
                      <br />
                      Fondo transparente recomendado
                    </div>
                  </div>
                )}
              </button>
              <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" onChange={handleLogoChange} />
              {logoUploadError ? (
                <div className="mt-2 text-[22px] text-[#C0392B]" style={{ fontFamily: "var(--font-add-store-body)" }}>
                  {logoUploadError}
                </div>
              ) : null}

              <div className="mt-4 text-[16px] text-[#1f253c]" style={{ fontFamily: "var(--font-add-store-body)" }}>
                Descripcion interna
              </div>
              <input
                className="mt-2 h-[52px] w-full rounded-full border-none bg-white px-5 text-[16px] text-[#727780] outline-none"
                placeholder="Ejm Tienda de accesorio lujo"
                style={{ fontFamily: "var(--font-add-store-body)" }}
                value={internalDescription}
                onChange={(e) => setInternalDescription(e.target.value)}
              />

              <div className="mt-4 text-[16px] text-[#1f253c]" style={{ fontFamily: "var(--font-add-store-body)" }}>
                Color identificativo
              </div>
              <div className="mt-2 flex items-center gap-3">
                {brandColors.map((color, index) => (
                  <div key={`${color}-${index}`} className="relative">
                    <button
                      type="button"
                      className="h-14 w-14 rounded-full"
                      style={{ backgroundColor: color }}
                      onClick={() => {
                        setEditingColorIndex(index);
                        if (colorPickerRef.current) {
                          colorPickerRef.current.value = color;
                          colorPickerRef.current.click();
                        }
                      }}
                      aria-label="Editar color"
                    />
                    {index >= fixedBrandColorsCount && (
                      <button
                        type="button"
                        className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#1B2140] text-[10px] leading-none text-white"
                        aria-label="Eliminar color"
                        onClick={(e) => {
                          e.stopPropagation();
                          setBrandColors((prev) => prev.filter((_, idx) => idx !== index));
                        }}
                      >
                        x
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  className={`flex h-14 w-14 items-center justify-center rounded-full border border-dashed text-[40px] ${
                    canAddBrandColor ? "border-[#7B818F] text-[#2A3146]" : "border-[#B4BAC8] text-[#9CA3B4]"
                  }`}
                  onClick={() => {
                    if (!canAddBrandColor) return;
                    setEditingColorIndex(null);
                    colorPickerRef.current?.click();
                  }}
                  disabled={!canAddBrandColor}
                >
                  +
                </button>
                <input
                  ref={colorPickerRef}
                  type="color"
                  className="sr-only"
                  onChange={(e) => {
                    const color = e.target.value.toUpperCase();
                    setBrandColors((prev) => {
                      if (editingColorIndex !== null) {
                        return prev.map((item, idx) => (idx === editingColorIndex ? color : item));
                      }
                      if (prev.length >= maxBrandColors) {
                        return prev;
                      }
                      return prev.includes(color) ? prev : [...prev, color];
                    });
                    setEditingColorIndex(null);
                  }}
                />
              </div>
            </div>
          ) : mobileStep === 2 ? (
            <div className="mt-2">
              <p className="mt-4 max-w-[320px] text-[16px] leading-[1.3] text-[#1a213d]" style={{ fontFamily: "var(--font-add-store-body)" }}>
                Define el país base y los países donde esta tienda vende
              </p>

              <div className="mt-10 text-[16px] text-[#1f253c]" style={{ fontFamily: "var(--font-add-store-body)" }}>
                País base fiscal
              </div>
              <div className="relative mt-2">
                <select
                  className={`h-[52px] w-full appearance-none rounded-full border-none bg-white px-6 pr-12 text-[16px] outline-none ${
                    fiscalCountry ? "text-[#3b4256]" : "text-[#A3A6AE]"
                  }`}
                  style={{ fontFamily: "var(--font-add-store-body)" }}
                  value={fiscalCountry}
                  onChange={(e) => setFiscalCountry(e.target.value)}
                >
                  <option value="" disabled>
                    Buscar país
                  </option>
                  {countryOptions.map((country) => (
                    <option key={country.code} value={country.code}>
                      {country.name} {getFlagEmoji(country.code)}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-6 top-1/2 -translate-y-1/2 text-[16px] text-[#3b4256]">
                  ▾
                </span>
              </div>

              <div className="mt-8 text-[16px] text-[#1f253c]" style={{ fontFamily: "var(--font-add-store-body)" }}>
                Países donde vende esta tienda
              </div>
              <div className="relative mt-2">
                <select
                  className={`h-[52px] w-full appearance-none rounded-full border-none bg-white px-6 pr-12 text-[16px] outline-none ${
                    salesCountry ? "text-[#3b4256]" : "text-[#A3A6AE]"
                  }`}
                  style={{ fontFamily: "var(--font-add-store-body)" }}
                  value={salesCountry}
                  onChange={(e) => {
                    const nextCountry = e.target.value;
                    setSalesCountry("");
                    setSalesCountries((prev) =>
                      prev.some((country) => country.code === nextCountry)
                        ? prev
                        : [...prev, { code: nextCountry, active: true }]
                    );
                  }}
                >
                  <option value="" disabled>
                    Buscar país
                  </option>
                  {countryOptions.map((country) => (
                    <option key={country.code} value={country.code}>
                      {country.name} {getFlagEmoji(country.code)}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-6 top-1/2 -translate-y-1/2 text-[16px] text-[#3b4256]">
                  ▾
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2.5">
                {salesCountries.map((country) => {
                  const countryData = countryOptions.find((option) => option.code === country.code);
                  if (!countryData) return null;

                  return (
                    <button
                      key={country.code}
                      type="button"
                      className={`flex h-[48px] items-center justify-between rounded-full px-5 text-[14px] ${
                        country.active ? "bg-[#FFFFFF]" : "bg-[#F3F4F6]"
                      }`}
                      style={{ fontFamily: "var(--font-add-store-body)" }}
                      onClick={() =>
                        setSalesCountries((prev) =>
                          prev.map((item) =>
                            item.code === country.code ? { ...item, active: !item.active } : item
                          )
                        )
                      }
                    >
                      <span>
                        {countryData.name} {getFlagEmoji(country.code)}
                      </span>
                      <span className={`h-7 w-7 rounded-full ${country.active ? "bg-[#8A76E6]" : "bg-[#D7D9DE]"}`} />
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="mt-2">
              <div className="mt-4 text-[16px] text-[#1f253c]" style={{ fontFamily: "var(--font-add-store-body)" }}>
                Moneda Base de la Tienda
              </div>
              <div className="relative mt-2">
                <select
                  className={`h-[52px] w-full appearance-none rounded-full border-none bg-white px-6 pr-12 text-[16px] outline-none ${
                    baseCurrency ? "text-[#3b4256]" : "text-[#A3A6AE]"
                  }`}
                  style={{ fontFamily: "var(--font-add-store-body)" }}
                  value={baseCurrency}
                  onChange={(e) => setBaseCurrency(e.target.value)}
                >
                  <option value="" disabled>
                    Buscar Moneda
                  </option>
                  {currencyOptions.map((currency) => (
                    <option key={currency.code} value={currency.code}>
                      {currency.label}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-6 top-1/2 -translate-y-1/2 text-[16px] text-[#3b4256]">
                  ▾
                </span>
              </div>

              <div className="mt-8 text-[16px] text-[#1f253c]" style={{ fontFamily: "var(--font-add-store-body)" }}>
                Configura canales activos
              </div>
              <button
                type="button"
                className="mt-2 h-[48px] w-full rounded-full border-none bg-[#4449CC26] text-[16px] text-[#6142C4]"
                style={{ fontFamily: "var(--font-add-store-body)" }}
                onClick={() => setShowMarketplaceInput((prev) => !prev)}
              >
                + añadir canales
              </button>
              {showMarketplaceInput && (
                <div className="mt-3 flex gap-2">
                  <input
                    className="h-[42px] flex-1 rounded-full border-none bg-white px-4 text-[14px] text-[#3b4256] outline-none"
                    style={{ fontFamily: "var(--font-add-store-body)" }}
                    placeholder="Escribe marketplace"
                    value={marketplaceInput}
                    onChange={(e) => setMarketplaceInput(e.target.value)}
                  />
                  <button
                    type="button"
                    className="h-[42px] rounded-full bg-[#0B1230] px-4 text-[14px] text-white"
                    style={{ fontFamily: "var(--font-add-store-heading)" }}
                    onClick={() => {
                      const normalizedName = marketplaceInput.trim();
                      if (!normalizedName) return;
                      setMarketplaces((prev) =>
                        prev.some((item) => item.name.toLowerCase() === normalizedName.toLowerCase())
                          ? prev
                          : [...prev, { name: normalizedName, active: true, isDefault: false }]
                      );
                      setMarketplaceInput("");
                    }}
                  >
                    Agregar
                  </button>
                </div>
              )}
              <div className="mt-3 flex flex-col gap-2.5">
                {marketplaces.map((marketplace) => (
                  <button
                    key={marketplace.name}
                    type="button"
                    className="flex h-[42px] w-[48%] items-center justify-between rounded-full bg-white px-4 text-[14px] text-[#3B4256]"
                    style={{ fontFamily: "var(--font-add-store-body)" }}
                    onClick={() =>
                      setMarketplaces((prev) =>
                        prev.map((item) =>
                          item.name === marketplace.name ? { ...item, active: !item.active } : item
                        )
                      )
                    }
                  >
                    <span>{marketplace.name}</span>
                    <span className={`h-5 w-5 rounded-full ${marketplace.active ? "bg-[#8A76E6]" : "bg-[#D7D9DE]"}`} />
                  </button>
                ))}
              </div>

              <div className="mt-6 text-[16px] text-[#1f253c]" style={{ fontFamily: "var(--font-add-store-body)" }}>
                Agregar almacén activo
              </div>
              <button
                type="button"
                className="mt-2 h-[48px] w-full rounded-full border-none bg-[#4449CC26] text-[16px] text-[#6142C4]"
                style={{ fontFamily: "var(--font-add-store-body)" }}
                onClick={() => setShowWarehouseInput((prev) => !prev)}
              >
                + añadir almacén
              </button>
              {showWarehouseInput && (
                <div className="mt-3 flex gap-2">
                  <input
                    className="h-[42px] flex-1 rounded-full border-none bg-white px-4 text-[14px] text-[#3b4256] outline-none"
                    style={{ fontFamily: "var(--font-add-store-body)" }}
                    placeholder="Escribe almacén"
                    value={warehouseInput}
                    onChange={(e) => setWarehouseInput(e.target.value)}
                  />
                  <button
                    type="button"
                    className="h-[42px] rounded-full bg-[#0B1230] px-4 text-[14px] text-white"
                    style={{ fontFamily: "var(--font-add-store-heading)" }}
                    onClick={() => {
                      const normalizedName = warehouseInput.trim();
                      if (!normalizedName) return;
                      setActiveWarehouses((prev) =>
                        prev.some((item) => item.name.toLowerCase() === normalizedName.toLowerCase())
                          ? prev
                          : [...prev, { name: normalizedName, active: true, isDefault: false }]
                      );
                      setWarehouseInput("");
                    }}
                  >
                    Agregar
                  </button>
                </div>
              )}
              <div className="mt-3 flex flex-col gap-2.5">
                {activeWarehouses.map((warehouse) => (
                  <button
                    key={warehouse.name}
                    type="button"
                    className="flex h-[42px] w-[48%] items-center justify-between rounded-full bg-white px-4 text-[14px] text-[#3B4256]"
                    style={{ fontFamily: "var(--font-add-store-body)" }}
                    onClick={() =>
                      setActiveWarehouses((prev) =>
                        prev.map((item) =>
                          item.name === warehouse.name ? { ...item, active: !item.active } : item
                        )
                      )
                    }
                  >
                    <span>{warehouse.name}</span>
                    <span className={`h-5 w-5 rounded-full ${warehouse.active ? "bg-[#8A76E6]" : "bg-[#D7D9DE]"}`} />
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-auto flex items-center justify-between pt-5">
            <div className="flex items-center gap-2">
              {[1, 2, 3].map((step) => (
                <span
                  key={step}
                  className={`h-3.5 w-3.5 rounded-full ${
                    step <= mobileStep ? "bg-[#1A2140]" : "bg-[#BFC3CD]"
                  }`}
                />
              ))}
            </div>
            <button
              type="button"
              className="h-[42px] rounded-full bg-[#0B1230] px-7 text-[12px] text-white"
              style={{ fontFamily: "var(--font-add-store-heading)" }}
              onClick={() => {
                if (mobileStep === 1) {
                  setMobileStep(2);
                  return;
                }
                if (mobileStep === 2) {
                  setMobileStep(3);
                  return;
                }
                handleConfirmStore();
              }}
            >
              {mobileStep === 3 ? "Guardar" : "Siguiente"}
            </button>
          </div>
        </div>
      </section>

      <div className="mx-auto hidden h-full max-w-[1520px] gap-4 md:flex md:gap-5">
        <aside className="hidden w-[300px] rounded-2xl bg-[#FFFFFF] p-4 shadow-[0_10px_30px_rgba(0,0,0,0.08)] md:block">
          <div className="flex items-center gap-3 border-b pb-4">
            <Image src="/branding/logo_tawa02.png" alt="TAWA Co" width={114} height={36} className="h-auto w-[114px]" priority />
          </div>
          <button
            type="button"
            className="mt-4 text-[16px] text-[#53596b] hover:text-[#1B2140]"
            style={{ fontFamily: "var(--font-add-store-body)" }}
            onClick={() => router.push("/select-holding")}
          >
            Volver
          </button>

          <button
            type="button"
            className="mt-5 h-[42px] w-full rounded-full bg-[#0B1230] text-[14px] text-white"
            style={{ fontFamily: "var(--font-add-store-body)" }}
          >
            Agregar tienda
          </button>
        </aside>

        <section className="flex h-full flex-1 flex-col">
          <header className="mb-3 flex items-center justify-between rounded-2xl bg-[#FFFFFF] px-4 py-3 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
            <div className="flex items-center gap-3">
              <Image src="/branding/steph01.png" alt="Usuario" width={56} height={56} className="h-14 w-14 rounded-full object-cover" priority />
              <div>
                <div className="text-[18px] leading-none text-[#1B2140]" style={{ fontFamily: "var(--font-add-store-heading)" }}>
                  Nombre de usuario
                </div>
                <div className="mt-1 text-[14px] text-[#4f5568]" style={{ fontFamily: "var(--font-add-store-body)" }}>
                  <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-[#18C26E]" />
                  Online
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 text-[14px] text-[#1B2140]" style={{ fontFamily: "var(--font-add-store-body)" }}>
              <span>{todayLabel}</span>
              <span className="h-4 w-px bg-[#B5BBC8]" />
              <span>{timeLabel}</span>
            </div>
            <button type="button" className="text-[24px] text-[#1B2140]" onClick={logout}>
              ↪
            </button>
          </header>

          <div className="relative flex-1 overflow-hidden rounded-2xl bg-[#E8EAEC] p-5 shadow-[0_10px_30px_rgba(0,0,0,0.08)] md:p-6">
            <div className="mt-8 pb-20">
            <h1 className="text-[29px] leading-none text-[#141A39]" style={{ fontFamily: "var(--font-add-store-heading)" }}>
              Agregar Tienda
            </h1>
            <p className="mt-2 text-[14px] text-[#4f5568]" style={{ fontFamily: "var(--font-add-store-body)" }}>
              Crea una nueva tienda dentro de TAWA
            </p>

            <div className="mt-4 grid grid-cols-12 gap-10">
              <div className="col-span-4">
                <input
                  className="h-[48px] w-full rounded-full border-none bg-white px-5 text-[16px] text-[#727780] outline-none"
                  placeholder="Ingresar el nombre de la tienda"
                  style={{ fontFamily: "var(--font-add-store-body)" }}
                  value={storeNameInput}
                  onChange={(e) => setStoreNameInput(e.target.value)}
                />

                <div className="mt-7 text-[16px] text-[#3b4256]" style={{ fontFamily: "var(--font-add-store-body)" }}>
                  Logo
                </div>
                <button
                  type="button"
                  className="mt-2 flex h-[116px] w-full items-center justify-center rounded-2xl border-2 border-dashed border-[#A8AFC0] bg-[#ECEEF1]"
                  onClick={() => logoInputRef.current?.click()}
                >
                  {logoPreviewUrl ? (
                    <div className="flex h-full w-full items-center gap-3 px-4">
                      <img src={logoPreviewUrl} alt="Logo de tienda" className="h-16 w-16 rounded-xl object-contain bg-white p-1" />
                      <div className="text-left text-[12px] leading-[1.2] text-[#4f5568]" style={{ fontFamily: "var(--font-add-store-body)" }}>
                        Logo subido correctamente
                        <br />
                        Click para reemplazar
                      </div>
                    </div>
                  ) : (
                    <div className="text-center">
                      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[#CFC7F5] text-[34px] text-[#6142C4]">
                        {logoUploading ? "…" : "+"}
                      </div>
                      <div className="mt-2 text-[12px] leading-[1.2] text-[#4f5568]" style={{ fontFamily: "var(--font-add-store-body)" }}>
                        {logoUploading ? "Subiendo imagen..." : "Subir imagen (512x512 PNG / SVG)"}
                        <br />
                        Fondo transparente recomendado
                      </div>
                    </div>
                  )}
                </button>
                <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" onChange={handleLogoChange} />
                {logoUploadError ? (
                  <div className="mt-2 text-[12px] text-[#C0392B]" style={{ fontFamily: "var(--font-add-store-body)" }}>
                    {logoUploadError}
                  </div>
                ) : null}

                <div className="mt-7 text-[16px] text-[#3b4256]" style={{ fontFamily: "var(--font-add-store-body)" }}>
                  Descripcion interna
                </div>
                <input
                  className="mt-2 h-[48px] w-full rounded-full border-none bg-white px-5 text-[16px] text-[#727780] outline-none"
                  placeholder="Ejm Tienda de accesorio lujo"
                  style={{ fontFamily: "var(--font-add-store-body)" }}
                  value={internalDescription}
                  onChange={(e) => setInternalDescription(e.target.value)}
                />

                <div className="mt-7 text-[16px] text-[#3b4256]" style={{ fontFamily: "var(--font-add-store-body)" }}>
                  Color identificativo
                </div>
                <div className="mt-2 flex items-center gap-3">
                  {brandColors.map((color, index) => (
                    <div key={`${color}-${index}`} className="relative">
                      <button
                        type="button"
                        className="h-10 w-10 rounded-full"
                        style={{ backgroundColor: color }}
                        onClick={() => {
                          setEditingColorIndex(index);
                          if (colorPickerRef.current) {
                            colorPickerRef.current.value = color;
                            colorPickerRef.current.click();
                          }
                        }}
                        aria-label="Editar color"
                      />
                      {index >= fixedBrandColorsCount && (
                        <button
                          type="button"
                          className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#1B2140] text-[10px] leading-none text-white"
                          aria-label="Eliminar color"
                          onClick={(e) => {
                            e.stopPropagation();
                            setBrandColors((prev) => prev.filter((_, idx) => idx !== index));
                          }}
                        >
                          x
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    className={`flex h-10 w-10 items-center justify-center rounded-full border border-dashed text-[26px] ${
                      canAddBrandColor ? "border-[#7B818F] text-[#2A3146]" : "border-[#B4BAC8] text-[#9CA3B4]"
                    }`}
                    onClick={() => {
                      if (!canAddBrandColor) return;
                      setEditingColorIndex(null);
                      colorPickerRef.current?.click();
                    }}
                    disabled={!canAddBrandColor}
                  >
                    +
                  </button>
                  <input
                    ref={colorPickerRef}
                    type="color"
                    className="sr-only"
                    onChange={(e) => {
                      const color = e.target.value.toUpperCase();
                      setBrandColors((prev) => {
                        if (editingColorIndex !== null) {
                          return prev.map((item, idx) => (idx === editingColorIndex ? color : item));
                        }
                        if (prev.length >= maxBrandColors) {
                          return prev;
                        }
                        return prev.includes(color) ? prev : [...prev, color];
                      });
                      setEditingColorIndex(null);
                    }}
                  />
                </div>

                <div className="mt-7 text-[16px] text-[#3b4256]" style={{ fontFamily: "var(--font-add-store-body)" }}>
                  País base fiscal
                </div>
                <div className="relative mt-2">
                  <select
                    className={`h-[48px] w-full appearance-none rounded-full border-none bg-white px-5 pr-12 text-[16px] outline-none ${
                      fiscalCountry ? "text-[#3b4256]" : "text-[#727780]"
                    }`}
                    style={{ fontFamily: "var(--font-add-store-body)" }}
                    value={fiscalCountry}
                    onChange={(e) => setFiscalCountry(e.target.value)}
                  >
                    <option value="" disabled>
                      Buscar país
                    </option>
                    {countryOptions.map((country) => (
                      <option key={country.code} value={country.code}>
                        {country.name} {getFlagEmoji(country.code)}
                      </option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute right-6 top-1/2 -translate-y-1/2 text-[18px] text-[#3b4256]">
                    ▾
                  </span>
                </div>
              </div>

              <div className="col-span-4">
                <div className="text-[16px] text-[#3b4256]" style={{ fontFamily: "var(--font-add-store-body)" }}>
                  Moneda base de la tienda
                </div>
                <div className="relative mt-2">
                  <select
                    className={`h-[48px] w-full appearance-none rounded-full border-none bg-white px-5 pr-12 text-[16px] outline-none ${
                      baseCurrency ? "text-[#3b4256]" : "text-[#727780]"
                    }`}
                    style={{ fontFamily: "var(--font-add-store-body)" }}
                    value={baseCurrency}
                    onChange={(e) => setBaseCurrency(e.target.value)}
                  >
                    <option value="" disabled>
                      Buscar Moneda
                    </option>
                    {currencyOptions.map((currency) => (
                      <option key={currency.code} value={currency.code}>
                        {currency.label}
                      </option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute right-6 top-1/2 -translate-y-1/2 text-[18px] text-[#3b4256]">
                    ▾
                  </span>
                </div>

                <div className="mt-10 text-[16px] text-[#3b4256]" style={{ fontFamily: "var(--font-add-store-body)" }}>
                  Países donde vende esta tienda
                </div>
                <div className="relative mt-2">
                  <select
                    className={`h-[48px] w-full appearance-none rounded-full border-none bg-white px-5 pr-12 text-[16px] outline-none ${
                      salesCountry ? "text-[#3b4256]" : "text-[#727780]"
                    }`}
                    style={{ fontFamily: "var(--font-add-store-body)" }}
                    value={salesCountry}
                    onChange={(e) => {
                      const nextCountry = e.target.value;
                      setSalesCountry("");
                      setSalesCountries((prev) =>
                        prev.some((country) => country.code === nextCountry)
                          ? prev
                          : [...prev, { code: nextCountry, active: true }]
                      );
                    }}
                  >
                    <option value="" disabled>
                      Buscar país
                    </option>
                    {countryOptions.map((country) => (
                      <option key={country.code} value={country.code}>
                        {country.name} {getFlagEmoji(country.code)}
                      </option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute right-6 top-1/2 -translate-y-1/2 text-[18px] text-[#3b4256]">
                    ▾
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2.5">
                  {salesCountries.map((country) => {
                    const countryData = countryOptions.find((option) => option.code === country.code);
                    if (!countryData) return null;

                    return (
                      <button
                        key={country.code}
                        type="button"
                        className={`flex h-[42px] items-center justify-between rounded-full px-4 text-[14px] ${
                          country.active ? "bg-[#FFFFFF]" : "bg-[#F3F4F6]"
                        }`}
                        style={{ fontFamily: "var(--font-add-store-body)" }}
                        onClick={() =>
                          setSalesCountries((prev) =>
                            prev.map((item) =>
                              item.code === country.code ? { ...item, active: !item.active } : item
                            )
                          )
                        }
                      >
                        <span>
                          {countryData.name} {getFlagEmoji(country.code)}
                        </span>
                        <span className="flex items-center gap-2">
                          <span className={`h-5 w-5 rounded-full ${country.active ? "bg-[#8A76E6]" : "bg-[#D7D9DE]"}`} />
                          {!defaultSalesCountryCodes.includes(country.code) && (
                            <span
                              role="button"
                              aria-label={`Eliminar ${countryData.name}`}
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#E3E5EA] text-[12px] font-semibold text-[#5D6477] hover:bg-[#D3D7E2]"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSalesCountries((prev) => prev.filter((item) => item.code !== country.code));
                              }}
                            >
                              x
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="col-span-4">
                <div className="text-[16px] text-[#3b4256]" style={{ fontFamily: "var(--font-add-store-body)" }}>
                  Configura canales activos
                </div>
                <button
                  type="button"
                  className="mt-2 h-[48px] w-full rounded-full border-none bg-[#4449CC26] text-[16px] text-[#6142C4]"
                  style={{ fontFamily: "var(--font-add-store-body)" }}
                  onClick={() => setShowMarketplaceInput((prev) => !prev)}
                >
                  + añadir canales
                </button>

                {showMarketplaceInput && (
                  <div className="mt-3 flex gap-2">
                    <input
                      className="h-[42px] flex-1 rounded-full border-none bg-white px-4 text-[14px] text-[#3b4256] outline-none"
                      style={{ fontFamily: "var(--font-add-store-body)" }}
                      placeholder="Escribe marketplace"
                      value={marketplaceInput}
                      onChange={(e) => setMarketplaceInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        const normalizedName = marketplaceInput.trim();
                        if (!normalizedName) return;
                        setMarketplaces((prev) =>
                          prev.some((item) => item.name.toLowerCase() === normalizedName.toLowerCase())
                            ? prev
                            : [...prev, { name: normalizedName, active: true, isDefault: false }]
                        );
                        setMarketplaceInput("");
                      }}
                    />
                    <button
                      type="button"
                      className="h-[42px] rounded-full bg-[#0B1230] px-4 text-[13px] text-white"
                      style={{ fontFamily: "var(--font-add-store-body)" }}
                      onClick={() => {
                        const normalizedName = marketplaceInput.trim();
                        if (!normalizedName) return;
                        setMarketplaces((prev) =>
                          prev.some((item) => item.name.toLowerCase() === normalizedName.toLowerCase())
                            ? prev
                            : [...prev, { name: normalizedName, active: true, isDefault: false }]
                        );
                        setMarketplaceInput("");
                      }}
                    >
                      Agregar
                    </button>
                  </div>
                )}

                <div className="mt-4 flex flex-col gap-2.5">
                  {marketplaces.map((marketplace) => (
                    <button
                      key={marketplace.name}
                      type="button"
                      className={`flex h-[42px] w-[180px] items-center justify-between rounded-full px-4 text-[14px] text-[#3b4256] ${
                        marketplace.active ? "bg-[#FFFFFF]" : "bg-[#F3F4F6]"
                      }`}
                      style={{ fontFamily: "var(--font-add-store-body)" }}
                      onClick={() =>
                        setMarketplaces((prev) =>
                          prev.map((item) =>
                            item.name === marketplace.name ? { ...item, active: !item.active } : item
                          )
                        )
                      }
                    >
                      <span className="truncate pr-2">{marketplace.name}</span>
                      <span className="flex items-center gap-2">
                        <span
                          className={`h-5 w-5 rounded-full ${
                            marketplace.active ? "bg-[#8A76E6]" : "bg-[#D7D9DE]"
                          }`}
                        />
                        {!marketplace.isDefault && (
                          <span
                            role="button"
                            aria-label={`Eliminar ${marketplace.name}`}
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#E3E5EA] text-[12px] font-semibold text-[#5D6477] hover:bg-[#D3D7E2]"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMarketplaces((prev) =>
                                prev.filter((item) => item.name !== marketplace.name)
                              );
                            }}
                          >
                            x
                          </span>
                        )}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="mt-8 text-[16px] text-[#3b4256]" style={{ fontFamily: "var(--font-add-store-body)" }}>
                  Agregar almacén activo
                </div>
                <button
                  type="button"
                  className="mt-2 h-[48px] w-full rounded-full border-none bg-[#4449CC26] text-[16px] text-[#6142C4]"
                  style={{ fontFamily: "var(--font-add-store-body)" }}
                  onClick={() => setShowWarehouseInput((prev) => !prev)}
                >
                  + añadir almacén
                </button>

                {showWarehouseInput && (
                  <div className="mt-3 flex gap-2">
                    <input
                      className="h-[42px] flex-1 rounded-full border-none bg-white px-4 text-[14px] text-[#3b4256] outline-none"
                      style={{ fontFamily: "var(--font-add-store-body)" }}
                      placeholder="Escribe almacén"
                      value={warehouseInput}
                      onChange={(e) => setWarehouseInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        const normalizedName = warehouseInput.trim();
                        if (!normalizedName) return;
                        setActiveWarehouses((prev) =>
                          prev.some((item) => item.name.toLowerCase() === normalizedName.toLowerCase())
                            ? prev
                            : [...prev, { name: normalizedName, active: true, isDefault: false }]
                        );
                        setWarehouseInput("");
                      }}
                    />
                    <button
                      type="button"
                      className="h-[42px] rounded-full bg-[#0B1230] px-4 text-[13px] text-white"
                      style={{ fontFamily: "var(--font-add-store-body)" }}
                      onClick={() => {
                        const normalizedName = warehouseInput.trim();
                        if (!normalizedName) return;
                        setActiveWarehouses((prev) =>
                          prev.some((item) => item.name.toLowerCase() === normalizedName.toLowerCase())
                            ? prev
                            : [...prev, { name: normalizedName, active: true, isDefault: false }]
                        );
                        setWarehouseInput("");
                      }}
                    >
                      Agregar
                    </button>
                  </div>
                )}

                <div className="mt-4 flex flex-col gap-2.5">
                  {activeWarehouses.map((warehouse) => (
                    <button
                      key={warehouse.name}
                      type="button"
                      className={`flex h-[42px] w-[180px] items-center justify-between rounded-full px-4 text-[14px] text-[#3b4256] ${
                        warehouse.active ? "bg-[#FFFFFF]" : "bg-[#F3F4F6]"
                      }`}
                      style={{ fontFamily: "var(--font-add-store-body)" }}
                      onClick={() =>
                        setActiveWarehouses((prev) =>
                          prev.map((item) =>
                            item.name === warehouse.name ? { ...item, active: !item.active } : item
                          )
                        )
                      }
                    >
                      <span className="truncate pr-2">{warehouse.name}</span>
                      <span className="flex items-center gap-2">
                        <span
                          className={`h-5 w-5 rounded-full ${
                            warehouse.active ? "bg-[#8A76E6]" : "bg-[#D7D9DE]"
                          }`}
                        />
                        {!warehouse.isDefault && (
                          <span
                            role="button"
                            aria-label={`Eliminar ${warehouse.name}`}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#8A76E6] text-[13px] font-semibold text-white hover:bg-[#7B67DF]"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveWarehouses((prev) =>
                                prev.filter((item) => item.name !== warehouse.name)
                              );
                            }}
                          >
                            x
                          </span>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="absolute bottom-6 right-6 flex flex-col items-end gap-2">
              {submitError ? (
                <p className="max-w-[420px] text-right text-[13px] text-[#C0392B]" style={{ fontFamily: "var(--font-add-store-body)" }}>
                  {submitError}
                </p>
              ) : null}
              <button
                type="button"
                className={`h-[52px] rounded-full px-10 text-[18px] text-white ${
                  isFormValid ? "bg-[#0B1230]" : "cursor-not-allowed bg-[#8087A1]"
                }`}
                style={{ fontFamily: "var(--font-add-store-heading)" }}
                onClick={() => void handleConfirmStore()}
                disabled={!isFormValid || submitLoading}
              >
                {submitLoading ? "Guardando..." : "Confirmar"}
              </button>
            </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
