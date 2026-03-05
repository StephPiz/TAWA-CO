"use client";

import Image from "next/image";
import localFont from "next/font/local";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { logout, requireTokenOrRedirect } from "../../lib/auth";

const headingFont = localFont({
  src: "../../fonts/HFHySans_Black.ttf",
  variable: "--font-dashboarddemarca-heading",
});

const bodyFont = localFont({
  src: "../../fonts/HFHySans_Regular.ttf",
  variable: "--font-dashboarddemarca-body",
});

type MenuItem = {
  key: string;
  label: string;
  path?: string;
  emptyText?: string;
  indent?: number;
  isMain?: boolean;
  isGroup?: boolean;
  action?: "logout";
};

type ProfileTabKey = "general" | "paises" | "monedas" | "almacenes" | "marketplaces" | "facturacion";

type StoreProfile = {
  name: string;
  description: string;
  logoUrl: string | null;
  baseCurrencyCode: string;
  salesCountryCodes: string[];
  marketplaces: string[];
  warehouses: string[];
};

type ToggleItem = {
  id: string;
  label: string;
  active: boolean;
};

const COUNTRY_OPTIONS: Array<{ id: string; label: string; tax: string }> = [
  { id: "ES", label: "España 🇪🇸", tax: "IVA 21%" },
  { id: "IT", label: "Italia 🇮🇹", tax: "IVA 22%" },
  { id: "PT", label: "Portugal 🇵🇹", tax: "IVA 23%" },
  { id: "DE", label: "Alemania 🇩🇪", tax: "MwSt 19%" },
  { id: "PL", label: "Polonia 🇵🇱", tax: "VAT 23%" },
  { id: "FR", label: "Francia 🇫🇷", tax: "TVA 20%" },
  { id: "PE", label: "Perú 🇵🇪", tax: "IGV 18%" },
];

function flagFromCountryCode(code: string) {
  if (!/^[A-Z]{2}$/.test(code)) return "";
  return String.fromCodePoint(...[...code].map((c) => 127397 + c.charCodeAt(0)));
}

const FALLBACK_REGION_CODES = [
  "AD","AE","AF","AG","AI","AL","AM","AO","AQ","AR","AS","AT","AU","AW","AX","AZ","BA","BB","BD","BE","BF","BG","BH","BI","BJ","BL","BM","BN","BO","BQ","BR","BS","BT","BV","BW","BY","BZ","CA","CC","CD","CF","CG","CH","CI","CK","CL","CM","CN","CO","CR","CU","CV","CW","CX","CY","CZ","DE","DJ","DK","DM","DO","DZ","EC","EE","EG","EH","ER","ES","ET","FI","FJ","FK","FM","FO","FR","GA","GB","GD","GE","GF","GG","GH","GI","GL","GM","GN","GP","GQ","GR","GS","GT","GU","GW","GY","HK","HM","HN","HR","HT","HU","ID","IE","IL","IM","IN","IO","IQ","IR","IS","IT","JE","JM","JO","JP","KE","KG","KH","KI","KM","KN","KP","KR","KW","KY","KZ","LA","LB","LC","LI","LK","LR","LS","LT","LU","LV","LY","MA","MC","MD","ME","MF","MG","MH","MK","ML","MM","MN","MO","MP","MQ","MR","MS","MT","MU","MV","MW","MX","MY","MZ","NA","NC","NE","NF","NG","NI","NL","NO","NP","NR","NU","NZ","OM","PA","PE","PF","PG","PH","PK","PL","PM","PN","PR","PS","PT","PW","PY","QA","RE","RO","RS","RU","RW","SA","SB","SC","SD","SE","SG","SH","SI","SJ","SK","SL","SM","SN","SO","SR","SS","ST","SV","SX","SY","SZ","TC","TD","TF","TG","TH","TJ","TK","TL","TM","TN","TO","TR","TT","TV","TW","TZ","UA","UG","UM","US","UY","UZ","VA","VC","VE","VG","VI","VN","VU","WF","WS","YE","YT","ZA","ZM","ZW",
] as const;

const menu: MenuItem[] = [
  { key: "dashboard", label: "Dashboard", path: "/store/dashboard", isMain: true },
  { key: "inventario", label: "Inventario", path: "/store/inventory", isMain: true },
  { key: "escaner", label: "Escaner", path: "/store/scanner", indent: 1 },
  { key: "productos", label: "Productos", path: "/store/products", indent: 1 },
  { key: "proveedores", label: "Proveedores", path: "/store/suppliers", isMain: true },
  { key: "compras", label: "Compras", path: "/store/purchases", indent: 1 },
  { key: "tracking", label: "Tracking", emptyText: "Tracking aun esta vacio.", indent: 1 },
  { key: "marketplaces", label: "Marketplaces", isMain: true, isGroup: true },
  { key: "shopify-demarca", label: "Shopify Demarca", path: "/store/orders", indent: 1 },
  { key: "pedidos", label: "Pedidos", path: "/store/orders", indent: 2 },
  { key: "clientes", label: "Clientes", path: "/store/customers", indent: 2 },
  { key: "soporte-tickets", label: "Soporte (Tickets/quejas)", path: "/store/support", indent: 2 },
  { key: "devoluciones", label: "Devoluciones", path: "/store/returns", indent: 2 },
  { key: "payouts", label: "Payouts", path: "/store/payouts", indent: 2 },
  { key: "facturas", label: "Facturas", path: "/store/invoices", indent: 2 },
  { key: "almacenes", label: "Almacenes", path: "/store/inventory", isMain: true },
  { key: "es-seg", label: "ES-SEG", emptyText: "ES-SEG aun esta vacio.", indent: 1 },
  { key: "3pl", label: "3PL", path: "/store/3pl", isMain: true },
  { key: "finanzas", label: "Finanzas", path: "/store/payouts", isMain: true },
  { key: "tareas", label: "Tareas", path: "/store/tasks", isMain: true },
  { key: "chat", label: "Chat", path: "/store/chat", isMain: true },
  { key: "configuracion", label: "Configuracion", path: "/store/settings", isMain: true },
  { key: "analytics", label: "Analytics", path: "/store/analytics", isMain: true },
  { key: "soporte", label: "Soporte", path: "/store/support", isMain: true },
  { key: "audit", label: "Audit", path: "/store/audit", isMain: true },
  { key: "logout", label: "Logout", action: "logout", isMain: true },
];

function menuIcon(key: string) {
  const base = "h-5 w-5";
  switch (key) {
    case "dashboard":
      return <svg viewBox="0 0 24 24" className={base} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z" /></svg>;
    case "inventario":
      return <svg viewBox="0 0 24 24" className={base} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 7l9-4 9 4-9 4-9-4z" /><path d="M3 7v10l9 4 9-4V7" /></svg>;
    case "proveedores":
      return <svg viewBox="0 0 24 24" className={base} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 21h18M5 21V8l7-4 7 4v13M9 12h6M9 16h6" /></svg>;
    case "marketplaces":
      return <svg viewBox="0 0 24 24" className={base} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 7h16l-1.5 12h-13zM9 7V5a3 3 0 0 1 6 0v2" /></svg>;
    case "almacenes":
      return <svg viewBox="0 0 24 24" className={base} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 11l9-7 9 7v9H3z" /><path d="M9 21v-6h6v6" /></svg>;
    case "3pl":
      return <svg viewBox="0 0 24 24" className={base} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 12h12M8 5l5 7-5 7" /><path d="M16 7h6M16 17h6" /></svg>;
    case "finanzas":
      return <svg viewBox="0 0 24 24" className={base} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 6h18M3 12h18M3 18h18" /><circle cx="8" cy="12" r="3" /></svg>;
    case "tareas":
      return <svg viewBox="0 0 24 24" className={base} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 11l2 2 4-4" /><rect x="3" y="4" width="18" height="16" rx="2" /></svg>;
    case "chat":
      return <svg viewBox="0 0 24 24" className={base} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" /></svg>;
    case "configuracion":
      return <svg viewBox="0 0 24 24" className={base} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" /><path d="M4 12h2M18 12h2M12 4v2M12 18v2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M17.7 6.3l-1.4 1.4M7.7 16.3l-1.4 1.4" /></svg>;
    case "analytics":
      return <svg viewBox="0 0 24 24" className={base} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-7" /></svg>;
    case "soporte":
      return <svg viewBox="0 0 24 24" className={base} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3a9 9 0 0 0-9 9v2a3 3 0 0 0 3 3h2v-6H4" /><path d="M20 17a3 3 0 0 0 1-2v-3a9 9 0 0 0-9-9" /><path d="M16 17a4 4 0 0 1-4 4h-1" /></svg>;
    case "audit":
      return <svg viewBox="0 0 24 24" className={base} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3l8 4v6c0 5-3.5 8-8 8s-8-3-8-8V7z" /><path d="M9 12l2 2 4-4" /></svg>;
    case "logout":
      return <svg viewBox="0 0 24 24" className={base} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /><path d="M21 21V3" /></svg>;
    default:
      return <svg viewBox="0 0 24 24" className={base} fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="5" y="5" width="14" height="14" rx="2" /></svg>;
  }
}

export default function DashboardDemarcaPage() {
  const router = useRouter();
  const [activeKey, setActiveKey] = useState("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchError, setSearchError] = useState("");
  const [showStoreProfile, setShowStoreProfile] = useState(false);
  const [profileTab, setProfileTab] = useState<ProfileTabKey>("general");
  const [profileEditable, setProfileEditable] = useState(false);
  const [brandColors, setBrandColors] = useState(["#B7D1CE", "#8D79E5", "#D4A7F0"]);
  const [fiscalCountry, setFiscalCountry] = useState("ES");
  const [countryRows, setCountryRows] = useState<ToggleItem[]>([
    { id: "ES", label: "España 🇪🇸", active: true },
    { id: "IT", label: "Italia", active: false },
    { id: "PT", label: "Portugal", active: false },
    { id: "DE", label: "Alemania", active: true },
    { id: "PL", label: "Polonia", active: false },
    { id: "FR", label: "Francia", active: false },
    { id: "PE", label: "Perú", active: false },
  ]);
  const [marketplaceRows, setMarketplaceRows] = useState<ToggleItem[]>([
    { id: "shopify", label: "Shopify", active: true },
    { id: "idealo-es", label: "Idealo ES", active: true },
    { id: "idealo-de", label: "Idealo DE", active: true },
  ]);
  const [showMonedasMarketplaceForm, setShowMonedasMarketplaceForm] = useState(false);
  const [showAlmacenesAddForm, setShowAlmacenesAddForm] = useState(false);
  const [selectedBaseCurrency, setSelectedBaseCurrency] = useState("");
  const [usesMultipleCurrencies, setUsesMultipleCurrencies] = useState<boolean | null>(null);
  const [exchangeMode, setExchangeMode] = useState<"api" | "manual">("manual");
  const [notifyFxChange, setNotifyFxChange] = useState(false);
  const [warehouseRows, setWarehouseRows] = useState<ToggleItem[]>([
    { id: "es-seg", label: "ES-SEG", active: true },
  ]);
  const [newMarketplaceLabel, setNewMarketplaceLabel] = useState("");
  const [newWarehouseLabel, setNewWarehouseLabel] = useState("");
  const [profile, setProfile] = useState<StoreProfile>({
    name: "demarca",
    description: "Tienda de accesorios de marca",
    logoUrl: "/branding/logo_demarca02.png",
    baseCurrencyCode: "EUR",
    salesCountryCodes: ["ES", "IT", "PT", "DE", "PL", "FR", "PE"],
    marketplaces: ["Shopify"],
    warehouses: ["ES-SEG"],
  });
  const [userName] = useState(() => {
    if (typeof window === "undefined") return "Nombre de usuario";
    try {
      const userRaw = localStorage.getItem("user");
      if (!userRaw) return "Nombre de usuario";
      const parsed = JSON.parse(userRaw) as { fullName?: string };
      return parsed.fullName?.trim() || "Nombre de usuario";
    } catch {
      return "Nombre de usuario";
    }
  });
  const [storeName] = useState(() => {
    if (typeof window === "undefined") return "demarca.";
    try {
      const selectedStoreId = localStorage.getItem("selectedStoreId");
      const storesRaw = localStorage.getItem("stores");
      if (!selectedStoreId || !storesRaw) return "demarca.";
      const stores = JSON.parse(storesRaw) as Array<{ storeId: string; storeName: string }>;
      const found = stores.find((s) => s.storeId === selectedStoreId);
      return found?.storeName ? `${found.storeName.toLowerCase()}.` : "demarca.";
    } catch {
      return "demarca.";
    }
  });
  const [now, setNow] = useState<Date>(() => new Date());
  const allCountryOptions = useMemo(() => {
    if (typeof Intl === "undefined") return COUNTRY_OPTIONS;
    const intlWithSupportedValues = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] };
    try {
      const regions =
        typeof intlWithSupportedValues.supportedValuesOf === "function"
          ? intlWithSupportedValues.supportedValuesOf("region")
          : [...FALLBACK_REGION_CODES];
      const displayNames = new Intl.DisplayNames(["es-ES"], { type: "region" });
      const taxById = new Map(COUNTRY_OPTIONS.map((item) => [item.id, item.tax]));
      const built = regions
        .filter((id) => /^[A-Z]{2}$/.test(id))
        .map((id) => {
          const name = displayNames.of(id) || id;
          const flag = flagFromCountryCode(id);
          return {
            id,
            label: flag ? `${name} ${flag}` : name,
            tax: taxById.get(id) || "Normativa local",
          };
        })
        .sort((a, b) => a.label.localeCompare(b.label, "es"));
      return built.length ? built : COUNTRY_OPTIONS;
    } catch {
      return COUNTRY_OPTIONS;
    }
  }, []);

  const facturacionCountryOptions = useMemo(() => {
    const codes = [...FALLBACK_REGION_CODES];
    const uniqueCodes = Array.from(new Set(codes)).filter((id) => /^[A-Z]{2}$/.test(id));
    let displayNames: Intl.DisplayNames | null = null;
    try {
      displayNames = new Intl.DisplayNames(["es-ES"], { type: "region" });
    } catch {
      displayNames = null;
    }
    return uniqueCodes
      .map((id) => {
        const fallbackName = id;
        const localizedName = displayNames?.of(id) || fallbackName;
        const flag = flagFromCountryCode(id);
        return {
          id,
          label: flag ? `${localizedName} ${flag}` : localizedName,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label, "es"));
  }, []);

  const fiscalCountryLabel = useMemo(
    () => allCountryOptions.find((item) => item.id === fiscalCountry)?.label ?? "España 🇪🇸",
    [allCountryOptions, fiscalCountry]
  );
  const fiscalCountryTax = useMemo(
    () => allCountryOptions.find((item) => item.id === fiscalCountry)?.tax ?? "IVA 21%",
    [allCountryOptions, fiscalCountry]
  );

  useEffect(() => {
    const token = requireTokenOrRedirect();
    if (!token) return;

    const selectedStoreId = localStorage.getItem("selectedStoreId");
    if (!selectedStoreId) {
      router.push("/select-store");
      return;
    }

    (async () => {
      try {
        const res = await fetch(`http://localhost:3001/stores/${selectedStoreId}/bootstrap`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) return;
        const store = data?.store || {};
        const channels = Array.isArray(data?.channels) ? data.channels : [];
        const warehouses = Array.isArray(data?.warehouses) ? data.warehouses : [];
        const countryCodes = Array.from(
          new Set(
            channels
              .map((c: { countryCode?: string | null }) => String(c.countryCode || "").trim().toUpperCase())
              .filter(Boolean)
          )
        );
        setProfile((prev) => ({
          ...prev,
          name: String(store?.name || prev.name).toLowerCase(),
          description: String(store?.description || prev.description),
          logoUrl: store?.logoUrl ? `http://localhost:3001${String(store.logoUrl)}` : prev.logoUrl,
          baseCurrencyCode: String(store?.baseCurrencyCode || prev.baseCurrencyCode),
          salesCountryCodes: countryCodes,
          marketplaces: channels.map((c: { name?: string }) => String(c.name || "")).filter(Boolean),
          warehouses: warehouses.map((w: { code?: string; name?: string }) => String(w.code || w.name || "")).filter(Boolean),
        }));
        if (countryCodes[0]) setFiscalCountry(countryCodes[0]);
        if (countryCodes.length) {
          setCountryRows((prev) =>
            prev.map((row) => ({ ...row, active: countryCodes.includes(row.id) }))
          );
        }
        if (channels.length) {
          setMarketplaceRows(
            channels.map((c: { name?: string }, idx: number) => ({
              id: `${idx}-${String(c.name || "").toLowerCase()}`,
              label: String(c.name || "Canal"),
              active: true,
            }))
          );
        }
        if (warehouses.length) {
          setWarehouseRows(
            warehouses.map((w: { code?: string; name?: string }, idx: number) => ({
              id: `${idx}-${String(w.code || w.name || "").toLowerCase()}`,
              label: String(w.code || w.name || "WH"),
              active: true,
            }))
          );
        }
      } catch {}
    })();
  }, [router, storeName]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const todayLabel = (() => {
    const raw = new Intl.DateTimeFormat("es-ES", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    })
      .format(now)
      .replace(",", "");
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  })();

  const timeLabel = new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(now);

  const activeItem = useMemo(
    () => menu.find((item) => item.key === activeKey) || menu[0],
    [activeKey]
  );

  function toggleCountry(id: string) {
    if (!profileEditable) return;
    setCountryRows((prev) => {
      const next = prev.map((item) => (item.id === id ? { ...item, active: !item.active } : item));
      const activeCodes = next.filter((item) => item.active).map((item) => item.id);
      setProfile((profilePrev) => ({ ...profilePrev, salesCountryCodes: activeCodes }));
      if (activeCodes.length && !activeCodes.includes(fiscalCountry)) {
        setFiscalCountry(activeCodes[0]);
      }
      return next;
    });
  }

  function toggleMarketplace(id: string) {
    if (!profileEditable) return;
    setMarketplaceRows((prev) => {
      const next = prev.map((item) => (item.id === id ? { ...item, active: !item.active } : item));
      setProfile((profilePrev) => ({
        ...profilePrev,
        marketplaces: next.filter((item) => item.active).map((item) => item.label),
      }));
      return next;
    });
  }

  function toggleWarehouse(id: string) {
    if (!profileEditable) return;
    setWarehouseRows((prev) => {
      const next = prev.map((item) => (item.id === id ? { ...item, active: !item.active } : item));
      setProfile((profilePrev) => ({
        ...profilePrev,
        warehouses: next.filter((item) => item.active).map((item) => item.label),
      }));
      return next;
    });
  }

  function runSearch() {
    const normalized = searchTerm.trim().toLowerCase();
    if (!normalized) {
      setSearchError("");
      return;
    }

    const found =
      menu.find((item) => item.label.toLowerCase() === normalized) ||
      menu.find((item) => item.label.toLowerCase().startsWith(normalized)) ||
      menu.find((item) => item.label.toLowerCase().includes(normalized));

    if (!found) {
      setSearchError("No se encontró esa sección.");
      return;
    }

    if (found.action === "logout") {
      logout();
      return;
    }

    setSearchError("");
    setActiveKey(found.key);
    setShowStoreProfile(false);
  }

  function addMarketplace() {
    if (!profileEditable) return;
    const value = newMarketplaceLabel.trim();
    if (!value) return;
    const id = value.toLowerCase().replace(/\s+/g, "-");
    setMarketplaceRows((prev) => {
      if (prev.some((item) => item.id === id || item.label.toLowerCase() === value.toLowerCase())) return prev;
      const next = [...prev, { id, label: value, active: true }];
      setProfile((profilePrev) => ({
        ...profilePrev,
        marketplaces: next.filter((item) => item.active).map((item) => item.label),
      }));
      return next;
    });
    setNewMarketplaceLabel("");
  }

  function addWarehouse() {
    if (!profileEditable) return;
    const value = newWarehouseLabel.trim().toUpperCase();
    if (!value) return;
    const id = value.toLowerCase().replace(/\s+/g, "-");
    setWarehouseRows((prev) => {
      if (prev.some((item) => item.id === id || item.label.toLowerCase() === value.toLowerCase())) return prev;
      const next = [...prev, { id, label: value, active: true }];
      setProfile((profilePrev) => ({
        ...profilePrev,
        warehouses: next.filter((item) => item.active).map((item) => item.label),
      }));
      return next;
    });
    setNewWarehouseLabel("");
  }

  const frameSrc = activeItem.path ? `${activeItem.path}?embed=demarca` : "";

  return (
    <main className={`${headingFont.variable} ${bodyFont.variable} h-screen overflow-hidden bg-[#DADCE0] p-6`}>
      <div className="mx-auto flex h-full max-w-[1520px] gap-4">
        <aside className={`overflow-hidden rounded-2xl bg-white shadow-[0_10px_30px_rgba(0,0,0,0.08)] transition-all duration-300 ${sidebarCollapsed ? "w-[96px]" : "w-[320px]"}`}>
          <div className={`flex items-center border-b border-[#DADCE0] px-3 py-5 ${sidebarCollapsed ? "justify-center" : "justify-between gap-3 px-5"}`}>
            <Image
              src={sidebarCollapsed ? "/branding/icon_tawa01.png" : "/branding/logo_tawa02.png"}
              alt="TAWA Co"
              width={sidebarCollapsed ? 54 : 138}
              height={sidebarCollapsed ? 26 : 44}
              className={`h-auto object-contain ${sidebarCollapsed ? "w-[54px]" : "w-[138px]"}`}
              priority
            />
            <button
              type="button"
              aria-label={sidebarCollapsed ? "Expandir menu" : "Ocultar menu"}
              className="flex h-8 w-8 items-center justify-center rounded-md text-[18px] text-[#1B2140] hover:bg-[#EFF1F5]"
              onClick={() => setSidebarCollapsed((prev) => !prev)}
            >
              {sidebarCollapsed ? "›" : "‹"}
            </button>
          </div>

          {!sidebarCollapsed ? (
            <div className="h-[calc(100%-77px)] overflow-y-auto px-5 pb-6 pt-3">
              <div className="flex items-center justify-between">
                <div className={`text-[12px] uppercase tracking-wide ${showStoreProfile ? "text-[#7075FF]" : "text-[#6D748A]"}`} style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                  TIENDA
                </div>
                <button
                  type="button"
                  className="text-[12px] text-[#1C233F] hover:underline"
                  style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}
                  onClick={() => {
                    setShowStoreProfile(true);
                    setProfileTab("general");
                  }}
                >
                  ver mas
                </button>
              </div>
              <div className="mt-2">
                <Image
                  src="/branding/logo_demarca02.png"
                  alt={storeName.replace(/\.$/, "") || "demarca"}
                  width={176}
                  height={46}
                  className="h-auto w-[176px] object-contain"
                  priority
                />
              </div>

              <div className="mt-5 text-[12px] uppercase tracking-wide text-[#6D748A]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                Menu
              </div>

              <div className="mt-3 space-y-1.5">
                {menu.map((item) => {
                  const active = activeKey === item.key;
                  const indent = item.indent ? item.indent * 16 : 0;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                      if (item.action === "logout") {
                        logout();
                        return;
                      }
                      if (!item.path && !item.emptyText && item.isGroup) return;
                      setActiveKey(item.key);
                      setShowStoreProfile(false);
                    }}
                      className={`w-full rounded-full px-4 py-2 text-left transition ${
                        item.isMain ? "text-[18px]" : "text-[13px]"
                      } ${
                        active
                          ? "bg-[#0B1230] text-white"
                          : item.isGroup
                          ? "text-[#1C233F] hover:bg-[#EFF1F5]"
                          : "text-[#3A425A] hover:bg-[#EFF1F5]"
                      }`}
                      style={{
                        fontFamily: item.isMain ? "var(--font-dashboarddemarca-heading)" : "var(--font-dashboarddemarca-body)",
                        paddingLeft: `${16 + indent}px`,
                      }}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex h-[calc(100%-77px)] flex-col items-center gap-2 overflow-y-auto px-2 py-4">
              {menu
                .filter((item) => item.isMain)
                .map((item) => {
                  const active = activeKey === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      title={item.label}
                      onClick={() => {
                        if (item.action === "logout") {
                          logout();
                          return;
                        }
                        setActiveKey(item.key);
                        setShowStoreProfile(false);
                      }}
                      className={`flex h-10 w-10 items-center justify-center rounded-full text-[13px] ${
                        active ? "bg-[#0B1230] text-white" : "bg-[#EFF1F5] text-[#1B2140] hover:bg-[#DDE2EC]"
                      }`}
                      style={{ fontFamily: "var(--font-dashboarddemarca-heading)" }}
                    >
                      {menuIcon(item.key)}
                    </button>
                  );
                })}
            </div>
          )}
        </aside>

        <section className="flex min-w-0 flex-1 flex-col gap-4">
          <header className="flex h-[84px] items-center justify-between rounded-2xl bg-white px-4 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
            <div className="flex items-center gap-3">
              <Image src="/branding/steph01.png" alt="Usuario" width={56} height={56} className="h-14 w-14 rounded-full object-cover" priority />
              <div>
                <div suppressHydrationWarning className="text-[18px] leading-none text-[#1B2140]" style={{ fontFamily: "var(--font-dashboarddemarca-heading)" }}>
                  {userName}
                </div>
                <div className="mt-1 text-[14px] text-[#4f5568]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                  <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-[#18C26E]" />
                  Online
                </div>
              </div>
            </div>

            <div className="mx-6 flex max-w-[460px] flex-1 flex-col">
              <form
                className="flex h-[44px] w-full items-center rounded-full border border-[#CFD3DE] px-3 text-[#7A8091]"
                onSubmit={(e) => {
                  e.preventDefault();
                  runSearch();
                }}
              >
                <span className="ml-1 mr-2 text-[22px]">⌕</span>
                <input
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    if (searchError) setSearchError("");
                  }}
                  placeholder="Buscar"
                  className="h-full flex-1 bg-transparent text-[14px] text-[#2E3550] outline-none placeholder:text-[#9AA1B2]"
                  style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}
                />
                <button
                  type="submit"
                  className="rounded-full bg-[#0B1230] px-4 py-1 text-[12px] text-white hover:bg-[#1A2348]"
                  style={{ fontFamily: "var(--font-dashboarddemarca-heading)" }}
                >
                  Buscar
                </button>
              </form>
              {searchError ? (
                <div className="mt-1 pl-4 text-[12px] text-[#C0392B]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                  {searchError}
                </div>
              ) : null}
            </div>

            <div suppressHydrationWarning className="flex items-center gap-3 text-[14px] text-[#1B2140]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
              <span suppressHydrationWarning>{todayLabel}</span>
              <span className="h-4 w-px bg-[#B5BBC8]" />
              <span suppressHydrationWarning>{timeLabel}</span>
            </div>

            <div className="ml-6 flex items-center gap-5">
              <button
                type="button"
                aria-label="Tareas"
                className="flex h-11 w-11 items-center justify-center rounded-md hover:bg-[#EFF1F5]"
                onClick={() => {
                  setActiveKey("tareas");
                  setShowStoreProfile(false);
                }}
              >
                <Image src="/branding/tarea01.png" alt="Tareas" width={34} height={34} className="h-[34px] w-[34px] object-contain" />
              </button>
              <button
                type="button"
                aria-label="Chat"
                className="flex h-11 w-11 items-center justify-center rounded-md hover:bg-[#EFF1F5]"
                onClick={() => {
                  setActiveKey("chat");
                  setShowStoreProfile(false);
                }}
              >
                <Image src="/branding/chat01.png" alt="Chat" width={34} height={34} className="h-[34px] w-[34px] object-contain" />
              </button>
              <button
                type="button"
                aria-label="Logout"
                className="flex h-11 w-11 items-center justify-center rounded-md hover:bg-[#EFF1F5]"
                onClick={logout}
              >
                <Image src="/branding/exit01.png" alt="Logout" width={34} height={34} className="h-[34px] w-[34px] object-contain" />
              </button>
            </div>
          </header>

          <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl bg-white shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
            {showStoreProfile ? (
              <div className="h-full">
                <div className="flex h-full flex-col rounded-2xl bg-white">
                  <div className="flex items-start justify-between px-10 pt-7">
                    <div>
                      <h2 className="text-[32px] leading-none text-[#121633]" style={{ fontFamily: "var(--font-dashboarddemarca-heading)" }}>
                        Hola {profile.name}
                      </h2>
                      <p className="mt-2 text-[16px] text-[#4A5268]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                        {profile.description}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="text-[16px] text-[#3E455C] hover:text-[#121633]"
                      style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}
                      onClick={() => setProfileEditable((prev) => !prev)}
                    >
                      {profileEditable ? "Bloquear ficha" : "Editar ficha"}
                    </button>
                  </div>

                  <div className="mt-6 border-b border-[#666666] px-2">
                    <div className="grid grid-cols-6 gap-2">
                      {[
                        { key: "general", label: "1. Información General" },
                        { key: "paises", label: "2. Países" },
                        { key: "monedas", label: "3. Monedas" },
                        { key: "almacenes", label: "4. Almacenes" },
                        { key: "marketplaces", label: "5. Marketplaces" },
                        { key: "facturacion", label: "6. Facturación" },
                      ].map((tab) => (
                        <button
                          key={tab.key}
                          type="button"
                          className={`rounded-t-2xl px-4 py-3 text-left text-[14px] ${
                            profileTab === tab.key ? "bg-[#BFBFBF] text-[#1A213D]" : "bg-[#E6E8EA] text-[#545C73]"
                          }`}
                          style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}
                          onClick={() => setProfileTab(tab.key as ProfileTabKey)}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="relative min-h-0 flex-1 w-full overflow-y-auto rounded-b-2xl bg-[#E6E8EA] px-10 pb-24 pt-6">
                    {profileTab === "general" ? (
                      <>
                        <div className="grid grid-cols-3 gap-8 text-[#2B334B]">
                        <div>
                          <div className="text-[16px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Nombre de la tienda</div>
                          <input
                            disabled={!profileEditable}
                            value={profile.name}
                            onChange={(e) => setProfile((prev) => ({ ...prev, name: e.target.value }))}
                            className="mt-2 h-[52px] w-full rounded-full border-none bg-white px-5 text-[16px] text-[#8B90A0] outline-none disabled:bg-[#F3F4F6]"
                          />

                          <div className="mt-6 text-[16px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Logo</div>
                          <div className="mt-2 flex h-[130px] w-full items-center justify-center rounded-2xl border border-dashed border-[#9AA1B2] bg-[#ECEEF1]">
                            <Image src={profile.logoUrl || "/branding/logo_demarca02.png"} alt="Logo tienda" width={180} height={56} className="h-auto w-[180px] object-contain opacity-80" />
                          </div>
                          <div className="mt-2 text-[14px] text-[#7D8498]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                            logo_demarca02 png
                          </div>

                          <div className="mt-6 text-[16px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Descripción interna</div>
                          <input
                            disabled={!profileEditable}
                            value={profile.description}
                            onChange={(e) => setProfile((prev) => ({ ...prev, description: e.target.value }))}
                            className="mt-2 h-[52px] w-full rounded-full border-none bg-white px-5 text-[16px] text-[#8B90A0] outline-none disabled:bg-[#F3F4F6]"
                          />

                          <div className="mt-6 text-[16px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Color identificativo</div>
                          <div className="mt-2 flex items-center gap-3">
                            {brandColors.map((color, idx) => (
                              <button
                                key={`${color}-${idx}`}
                                type="button"
                                disabled={!profileEditable}
                                className="h-11 w-11 rounded-full disabled:cursor-not-allowed disabled:opacity-75"
                                style={{ backgroundColor: color }}
                                onClick={() => {
                                  if (!profileEditable || idx < 3) return;
                                  setBrandColors((prev) => prev.filter((_, i) => i !== idx));
                                }}
                              />
                            ))}
                            <button
                              type="button"
                              disabled={!profileEditable}
                              className="flex h-11 w-11 items-center justify-center rounded-full border border-dashed border-[#7B818F] text-[32px] text-[#2A3146] disabled:opacity-55"
                              onClick={() => {
                                if (!profileEditable) return;
                                const palette = ["#A4D8F0", "#F4B1CC", "#7ED8C6", "#F7C15B"];
                                const next = palette.find((p) => !brandColors.includes(p));
                                if (next) setBrandColors((prev) => [...prev, next].slice(0, 6));
                              }}
                            >
                              +
                            </button>
                          </div>
                        </div>

                        <div>
                          <div className="text-[16px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>País base fiscal</div>
                          <div className="relative mt-2">
                            <select
                              disabled={!profileEditable}
                              value={fiscalCountry}
                              onChange={(e) => setFiscalCountry(e.target.value)}
                              className="h-[52px] w-full appearance-none rounded-full border-none bg-white px-5 pr-12 text-[16px] text-[#8B90A0] outline-none disabled:bg-[#F3F4F6]"
                            >
                              {allCountryOptions.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.label}
                                </option>
                              ))}
                            </select>
                            <span className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-[20px] text-[#3b4256]">▾</span>
                          </div>

                          <div className="mt-6 text-[16px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Moneda base de la tienda</div>
                          <div className="relative mt-2">
                            <select
                              disabled={!profileEditable}
                              value={profile.baseCurrencyCode}
                              onChange={(e) => setProfile((prev) => ({ ...prev, baseCurrencyCode: e.target.value }))}
                              className="h-[52px] w-full appearance-none rounded-full border-none bg-white px-5 pr-12 text-[16px] text-[#8B90A0] outline-none disabled:bg-[#F3F4F6]"
                            >
                              <option value="EUR">EUR</option>
                              <option value="USD">USD</option>
                              <option value="PEN">PEN</option>
                              <option value="CNY">CNY</option>
                              <option value="TRY">TRY</option>
                              <option value="PLN">PLN</option>
                            </select>
                            <span className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-[20px] text-[#3b4256]">▾</span>
                          </div>

                          <div className="mt-6 text-[16px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Países donde vende esta tienda</div>
                          <div className="relative mt-2">
                            <input disabled value="Buscar país" readOnly className="h-[48px] w-full rounded-full border-none bg-white px-5 pr-12 text-[16px] text-[#8B90A0] outline-none" />
                            <span className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-[20px] text-[#3b4256]">▾</span>
                          </div>
                          <div className="mt-4 grid grid-cols-2 gap-2.5">
                            {countryRows.map((row) => (
                              <button
                                key={row.id}
                                type="button"
                                disabled={!profileEditable}
                                onClick={() => toggleCountry(row.id)}
                                className="flex h-[40px] items-center justify-between rounded-full bg-white px-4 text-[14px] text-[#4B5369] disabled:cursor-not-allowed"
                                style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}
                              >
                                <span>{row.label}</span>
                                <span className={`h-5 w-5 rounded-full ${row.active ? "bg-[#8A76E6]" : "bg-[#D7D9DE]"}`} />
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <div className="text-[16px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Configura marketplaces activos</div>
                          <button type="button" disabled={!profileEditable} className="mt-2 h-[46px] w-full rounded-full border-none bg-[#4449CC26] text-[16px] text-[#6142C4] disabled:opacity-70" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }} onClick={addMarketplace}>
                            + añadir marketplace
                          </button>
                          <div className="mt-2 flex gap-2">
                            <input
                              disabled={!profileEditable}
                              value={newMarketplaceLabel}
                              onChange={(e) => setNewMarketplaceLabel(e.target.value)}
                              placeholder="Escribe marketplace"
                              className="h-[40px] flex-1 rounded-full border-none bg-white px-4 text-[14px] text-[#4B5369] outline-none placeholder:text-[#9AA1B2] disabled:bg-[#F3F4F6]"
                            />
                            <button
                              type="button"
                              disabled={!profileEditable}
                              className="h-[40px] rounded-full bg-[#0B1230] px-4 text-[14px] text-white disabled:opacity-60"
                              onClick={addMarketplace}
                              style={{ fontFamily: "var(--font-dashboarddemarca-heading)" }}
                            >
                              Agregar
                            </button>
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            {marketplaceRows.map((mk) => (
                              <button
                                key={mk.id}
                                type="button"
                                disabled={!profileEditable}
                                onClick={() => toggleMarketplace(mk.id)}
                                className="flex h-[40px] items-center justify-between rounded-full bg-white px-4 text-[14px] text-[#4B5369] disabled:cursor-not-allowed"
                                style={{ minWidth: "120px", fontFamily: "var(--font-dashboarddemarca-body)" }}
                              >
                                <span>{mk.label}</span>
                                <span className="ml-3 flex items-center gap-2">
                                  <span className={`h-5 w-5 rounded-full ${mk.active ? "bg-[#8A76E6]" : "bg-[#D7D9DE]"}`} />
                                  {profileEditable && mk.id !== "shopify" ? (
                                    <span
                                      className="grid h-4 w-4 place-items-center rounded-full bg-[#DDE1E8] text-[11px] text-[#596078]"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setMarketplaceRows((prev) => {
                                          const next = prev.filter((item) => item.id !== mk.id);
                                          setProfile((profilePrev) => ({
                                            ...profilePrev,
                                            marketplaces: next.filter((item) => item.active).map((item) => item.label),
                                          }));
                                          return next;
                                        });
                                      }}
                                    >
                                      x
                                    </span>
                                  ) : null}
                                </span>
                              </button>
                            ))}
                          </div>

                          <div className="mt-6 text-[16px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Agregar almacén activo</div>
                          <button type="button" disabled={!profileEditable} className="mt-2 h-[46px] w-full rounded-full border-none bg-[#4449CC26] text-[16px] text-[#6142C4] disabled:opacity-70" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }} onClick={addWarehouse}>
                            + añadir almacén
                          </button>
                          <div className="mt-2 flex gap-2">
                            <input
                              disabled={!profileEditable}
                              value={newWarehouseLabel}
                              onChange={(e) => setNewWarehouseLabel(e.target.value)}
                              placeholder="Escribe almacén"
                              className="h-[40px] flex-1 rounded-full border-none bg-white px-4 text-[14px] text-[#4B5369] outline-none placeholder:text-[#9AA1B2] disabled:bg-[#F3F4F6]"
                            />
                            <button
                              type="button"
                              disabled={!profileEditable}
                              className="h-[40px] rounded-full bg-[#0B1230] px-4 text-[14px] text-white disabled:opacity-60"
                              onClick={addWarehouse}
                              style={{ fontFamily: "var(--font-dashboarddemarca-heading)" }}
                            >
                              Agregar
                            </button>
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            {warehouseRows.map((wh) => (
                              <button
                                key={wh.id}
                                type="button"
                                disabled={!profileEditable}
                                onClick={() => toggleWarehouse(wh.id)}
                                className="flex h-[40px] items-center justify-between rounded-full bg-white px-4 text-[14px] text-[#4B5369] disabled:cursor-not-allowed"
                                style={{ minWidth: "120px", fontFamily: "var(--font-dashboarddemarca-body)" }}
                              >
                                <span>{wh.label}</span>
                                <span className="ml-3 flex items-center gap-2">
                                  <span className={`h-5 w-5 rounded-full ${wh.active ? "bg-[#8A76E6]" : "bg-[#D7D9DE]"}`} />
                                  {profileEditable && wh.id !== "es-seg" ? (
                                    <span
                                      className="grid h-4 w-4 place-items-center rounded-full bg-[#DDE1E8] text-[11px] text-[#596078]"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setWarehouseRows((prev) => {
                                          const next = prev.filter((item) => item.id !== wh.id);
                                          setProfile((profilePrev) => ({
                                            ...profilePrev,
                                            warehouses: next.filter((item) => item.active).map((item) => item.label),
                                          }));
                                          return next;
                                        });
                                      }}
                                    >
                                      x
                                    </span>
                                  ) : null}
                                </span>
                              </button>
                            ))}
                          </div>

                        </div>
                        </div>
                        <div className="mt-8 flex justify-end">
                          <button
                            type="button"
                            disabled={!profileEditable}
                            className="h-[50px] rounded-full bg-[#0B1230] px-8 text-[16px] text-white disabled:opacity-60"
                            style={{ fontFamily: "var(--font-dashboarddemarca-heading)" }}
                            onClick={() => setProfileEditable(false)}
                          >
                            Confirmar
                          </button>
                        </div>
                      </>
                    ) : profileTab === "paises" ? (
                      <>
                        <div className="pt-6 text-[15px] text-[#2F3650]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                          Define el país base y los países donde esta tienda vende :
                        </div>
                        <div className="mt-10 grid grid-cols-2 gap-14">
                          <div>
                            <div className="text-[16px] text-[#2F3650]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                              País base fiscal
                            </div>
                            <div className="relative mt-2">
                              <select
                                disabled={!profileEditable}
                                value={fiscalCountry}
                                onChange={(e) => setFiscalCountry(e.target.value)}
                                className="h-[54px] w-full appearance-none rounded-full border-none bg-white px-5 pr-12 text-[16px] text-[#8B90A0] outline-none disabled:bg-[#F3F4F6]"
                              >
                                {facturacionCountryOptions.map((item) => (
                                  <option key={item.id} value={item.id}>
                                    {item.label}
                                  </option>
                                ))}
                              </select>
                              <span className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-[20px] text-[#3b4256]">▾</span>
                            </div>
                            <div className="mt-3 flex gap-10 text-[14px] text-[#8C92A4]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                              <span>{fiscalCountryLabel.split(" ")[0]} : {fiscalCountryTax}</span>
                              <span>Normativa fiscal</span>
                            </div>
                          </div>

                          <div>
                            <div className="text-[16px] text-[#2F3650]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                              Países donde vende esta tienda
                            </div>
                            <div className="relative mt-2">
                              <select
                                disabled={!profileEditable}
                                className="h-[48px] w-full appearance-none rounded-full border-none bg-white px-5 pr-12 text-[16px] text-[#8B90A0] outline-none disabled:bg-[#F3F4F6]"
                              >
                                <option>Buscar país</option>
                                {facturacionCountryOptions.map((item) => (
                                  <option key={`paises-buscar-${item.id}`} value={item.id}>
                                    {item.label}
                                  </option>
                                ))}
                              </select>
                              <span className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-[20px] text-[#3b4256]">▾</span>
                            </div>
                            <div className="mt-4 grid grid-cols-2 gap-2.5">
                              {countryRows.map((row) => (
                                <button
                                  key={row.id}
                                  type="button"
                                  disabled={!profileEditable}
                                  onClick={() => toggleCountry(row.id)}
                                  className="flex h-[40px] items-center justify-between rounded-full bg-white px-4 text-[14px] text-[#4B5369] disabled:cursor-not-allowed"
                                  style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}
                                >
                                  <span>{row.label}</span>
                                  <span className={`h-5 w-5 rounded-full ${row.active ? "bg-[#8A76E6]" : "bg-[#D7D9DE]"}`} />
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="mt-8 flex justify-end">
                          <button
                            type="button"
                            disabled={!profileEditable}
                            className="h-[50px] rounded-full bg-[#0B1230] px-8 text-[16px] text-white disabled:opacity-60"
                            style={{ fontFamily: "var(--font-dashboarddemarca-heading)" }}
                            onClick={() => setProfileEditable(false)}
                          >
                            Confirmar
                          </button>
                        </div>
                      </>
                    ) : profileTab === "monedas" ? (
                      <>
                        <div className="pt-6 text-[15px] text-[#2F3650]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                          Define la monedas de la tienda :
                        </div>
                        <div className="mt-10 grid grid-cols-2 gap-14 text-[#2B334B]">
                          <div>
                            <div className="text-[16px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                              Moneda base de la tienda
                            </div>
                            <div className="relative mt-2">
                              <select
                                disabled={!profileEditable}
                                value={selectedBaseCurrency}
                                onChange={(e) => setSelectedBaseCurrency(e.target.value)}
                                className="h-[54px] w-full appearance-none rounded-full border-none bg-white px-5 pr-12 text-[16px] text-[#8B90A0] outline-none disabled:bg-[#F3F4F6]"
                              >
                                <option value="">Buscar moneda</option>
                                <option value="EUR">EURO €</option>
                                <option value="USD">DÓLAR $</option>
                                <option value="PEN">SOLES S/</option>
                                <option value="CNY">YUANES ¥</option>
                                <option value="TRY">LIRA TURCA ₺</option>
                                <option value="PLN">ZLOTY zł</option>
                              </select>
                              <span className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-[20px] text-[#3b4256]">▾</span>
                            </div>
                            {selectedBaseCurrency ? (
                              <div className="mt-3 flex gap-10 text-[14px] text-[#8C92A4]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                                <span>{fiscalCountryLabel.split(" ")[0]} : {fiscalCountryTax}</span>
                                <span>Normativa fiscal</span>
                              </div>
                            ) : null}

                            <div className="mt-8 text-[16px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                              ¿Usas múltiples monedas?
                            </div>
                            <div className="mt-3 flex items-center gap-20 text-[16px] text-[#2B334B]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                              <button
                                type="button"
                                disabled={!profileEditable}
                                onClick={() => setUsesMultipleCurrencies(true)}
                                className="flex items-center gap-2 disabled:opacity-60"
                              >
                                <span className={`h-6 w-6 rounded-full ${usesMultipleCurrencies === true ? "bg-[#8A76E6]" : "bg-[#D7D9DE]"}`} />
                                <span>SI</span>
                              </button>
                              <button
                                type="button"
                                disabled={!profileEditable}
                                onClick={() => setUsesMultipleCurrencies(false)}
                                className="flex items-center gap-2 disabled:opacity-60"
                              >
                                <span className={`h-6 w-6 rounded-full ${usesMultipleCurrencies === false ? "bg-[#8A76E6]" : "bg-[#D7D9DE]"}`} />
                                <span>NO</span>
                              </button>
                            </div>

                            <button
                              type="button"
                              disabled={!profileEditable}
                              className="mt-8 h-[46px] w-full rounded-full border-none bg-[#4449CC26] text-[16px] text-[#6142C4] disabled:opacity-70"
                              style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}
                              onClick={() => setShowMonedasMarketplaceForm((prev) => !prev)}
                            >
                              + añadir marketplace
                            </button>
                            {showMonedasMarketplaceForm ? (
                              <>
                                <div className="mt-2 flex gap-2">
                                  <input
                                    disabled={!profileEditable}
                                    value={newMarketplaceLabel}
                                    onChange={(e) => setNewMarketplaceLabel(e.target.value)}
                                    placeholder="Escribe marketplace"
                                    className="h-[40px] flex-1 rounded-full border-none bg-white px-4 text-[14px] text-[#4B5369] outline-none placeholder:text-[#9AA1B2] disabled:bg-[#F3F4F6]"
                                  />
                                  <button
                                    type="button"
                                    disabled={!profileEditable}
                                    className="h-[40px] rounded-full bg-[#0B1230] px-4 text-[14px] text-white disabled:opacity-60"
                                    onClick={addMarketplace}
                                    style={{ fontFamily: "var(--font-dashboarddemarca-heading)" }}
                                  >
                                    Agregar
                                  </button>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {marketplaceRows
                                    .filter((mk) => {
                                      const label = mk.label.trim().toLowerCase();
                                      return label !== "idealo de" && label !== "shopify es";
                                    })
                                    .map((mk) => (
                                      <button
                                        key={`monedas-${mk.id}`}
                                        type="button"
                                        disabled={!profileEditable}
                                        onClick={() => toggleMarketplace(mk.id)}
                                        className="flex h-[36px] items-center justify-between rounded-full bg-white px-4 text-[14px] text-[#4B5369] disabled:cursor-not-allowed"
                                        style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}
                                      >
                                        <span>{mk.label}</span>
                                        <span className={`ml-3 h-4 w-4 rounded-full ${mk.active ? "bg-[#8A76E6]" : "bg-[#D7D9DE]"}`} />
                                      </button>
                                    ))}
                                </div>
                              </>
                            ) : null}

                            <div className="mt-8 text-[16px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                              Moneda adicional
                            </div>
                            <div className="relative mt-2">
                              <select disabled={!profileEditable} className="h-[48px] w-full appearance-none rounded-full border-none bg-white px-5 pr-12 text-[16px] text-[#8B90A0] outline-none disabled:bg-[#F3F4F6]">
                                <option>Buscar Moneda</option>
                                <option>EURO €</option>
                                <option>DÓLAR $</option>
                                <option>SOLES S/</option>
                                <option>YUANES ¥</option>
                                <option>LIRA TURCA ₺</option>
                                <option>ZLOTY zł</option>
                              </select>
                              <span className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-[20px] text-[#3b4256]">▾</span>
                            </div>
                          </div>

                          <div>
                            <div className="mt-8 text-[16px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                              Tipo de cambio
                            </div>
                            <div className="mt-4 space-y-3 text-[16px] text-[#2B334B]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                              <button
                                type="button"
                                disabled={!profileEditable}
                                onClick={() => setExchangeMode("api")}
                                className="flex items-center gap-2 disabled:opacity-60"
                              >
                                <span className={`h-6 w-6 rounded-full ${exchangeMode === "api" ? "bg-[#8A76E6]" : "bg-[#D7D9DE]"}`} />
                                <span>Automático (API)</span>
                              </button>
                              <button
                                type="button"
                                disabled={!profileEditable}
                                onClick={() => setExchangeMode("manual")}
                                className="flex items-center gap-2 disabled:opacity-60"
                              >
                                <span className={`h-6 w-6 rounded-full ${exchangeMode === "manual" ? "bg-[#8A76E6]" : "bg-[#D7D9DE]"}`} />
                                <span>Manual editable</span>
                              </button>
                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  disabled={!profileEditable}
                                  onClick={() => setNotifyFxChange((prev) => !prev)}
                                  className="flex items-center gap-2 disabled:opacity-60"
                                >
                                  <span className={`h-6 w-6 rounded-full ${notifyFxChange ? "bg-[#8A76E6]" : "bg-[#D7D9DE]"}`} />
                                  <span>Notificar si varía más de</span>
                                </button>
                                <input
                                  disabled={!profileEditable || !notifyFxChange}
                                  className="h-[44px] w-[110px] rounded-full border-none bg-white px-3 text-center text-[14px] text-[#2B334B] outline-none disabled:bg-[#F3F4F6]"
                                  defaultValue="%"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="mt-8 flex justify-end">
                          <button type="button" disabled={!profileEditable} className="h-[50px] rounded-full bg-[#0B1230] px-8 text-[16px] text-white disabled:opacity-60">
                            Confirmar
                          </button>
                        </div>
                      </>
                    ) : profileTab === "almacenes" ? (
                      <>
                        <div className="pt-6 text-[15px] text-[#2F3650]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                          Configura almacenes y estado operativo.
                        </div>
                        <div className="mt-8 grid grid-cols-2 gap-8">
                          <button
                            type="button"
                            disabled={!profileEditable}
                            onClick={() => setShowAlmacenesAddForm((prev) => !prev)}
                            className="h-[46px] rounded-full bg-[#4449CC26] px-5 text-[16px] text-[#6142C4] disabled:opacity-70"
                          >
                            + añadir almacén
                          </button>
                          <div>
                            <div className="relative">
                              <select
                                disabled={!profileEditable}
                                className="h-[46px] w-full appearance-none rounded-full border-none bg-white px-5 pr-12 text-[16px] text-[#8B90A0] outline-none disabled:bg-[#F3F4F6]"
                              >
                                <option>Buscar almacén</option>
                              </select>
                              <span className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-[18px] text-[#3b4256]">▾</span>
                            </div>
                          </div>
                          {showAlmacenesAddForm ? (
                            <div className="col-start-1">
                              <div className="-mt-6 flex gap-2">
                                <input
                                  disabled={!profileEditable}
                                  value={newWarehouseLabel}
                                  onChange={(e) => setNewWarehouseLabel(e.target.value)}
                                  placeholder="Escribe almacén"
                                  className="h-[40px] flex-1 rounded-full border-none bg-white px-4 text-[14px] text-[#4B5369] outline-none placeholder:text-[#9AA1B2] disabled:bg-[#F3F4F6]"
                                />
                                <button
                                  type="button"
                                  disabled={!profileEditable}
                                  className="h-[40px] rounded-full bg-[#0B1230] px-4 text-[14px] text-white disabled:opacity-60"
                                  onClick={addWarehouse}
                                  style={{ fontFamily: "var(--font-dashboarddemarca-heading)" }}
                                >
                                  Agregar
                                </button>
                              </div>
                            </div>
                          ) : null}
                          <div className="col-span-2 mt-1 flex flex-wrap gap-2">
                            {warehouseRows
                              .filter((wh) => {
                                const label = wh.label.trim().toUpperCase();
                                return label !== "ES-MAD" && label !== "IT-MIL";
                              })
                              .map((wh) => (
                              <button
                                key={`almacenes-${wh.id}`}
                                type="button"
                                disabled={!profileEditable}
                                onClick={() => toggleWarehouse(wh.id)}
                                className="flex h-[40px] items-center justify-between rounded-full bg-white px-4 text-[14px] text-[#4B5369] disabled:cursor-not-allowed"
                              >
                                <span>{wh.label}</span>
                                <span className={`ml-3 h-5 w-5 rounded-full ${wh.active ? "bg-[#8A76E6]" : "bg-[#D7D9DE]"}`} />
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="mt-8 flex justify-end">
                          <button type="button" className="h-[50px] rounded-full bg-[#0B1230] px-8 text-[16px] text-white">
                            Confirmar
                          </button>
                        </div>
                      </>
                    ) : profileTab === "marketplaces" ? (
                      <>
                        <div className="pt-6 text-[15px] text-[#2F3650]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                          Configura marketplaces activos de la tienda.
                        </div>
                        <div className="mt-8 grid grid-cols-2 gap-8">
                          <button type="button" className="h-[46px] rounded-full bg-[#4449CC26] px-5 text-[16px] text-[#6142C4]">
                            + añadir marketplace
                          </button>
                          <button type="button" className="h-[46px] rounded-full bg-white px-5 text-left text-[16px] text-[#3E465C]">
                            Buscar marketplace
                          </button>
                          <button type="button" className="flex h-[40px] items-center justify-between rounded-full bg-white px-4 text-[14px] text-[#4B5369]">
                            <span>Shopify</span>
                            <span className="h-5 w-5 rounded-full bg-[#8A76E6]" />
                          </button>
                          <button type="button" className="flex h-[40px] items-center justify-between rounded-full bg-white px-4 text-[14px] text-[#4B5369]">
                            <span>Idealo ES</span>
                            <span className="h-5 w-5 rounded-full bg-[#8A76E6]" />
                          </button>
                        </div>
                        <div className="mt-8 flex justify-end">
                          <button type="button" className="h-[50px] rounded-full bg-[#0B1230] px-8 text-[16px] text-white">
                            Confirmar
                          </button>
                        </div>
                      </>
                    ) : profileTab === "facturacion" ? (
                      <>
                        <div className="pt-6 text-[15px] text-[#2F3650]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                          Configura los datos de facturación de la tienda:
                        </div>
                        <div className="mt-5 space-y-5 text-[#2B334B]">
                          <div className="rounded-2xl bg-[#F1F3F7] p-4">
                            <div className="mb-3 text-[18px] text-[#1B2140]" style={{ fontFamily: "var(--font-dashboarddemarca-heading)" }}>Información principal</div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <div className="text-[15px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Razón social / Empresa</div>
                                <input disabled={!profileEditable} className="mt-2 h-[48px] w-full rounded-full border-none bg-white px-5 text-[15px] text-[#6E7486] outline-none placeholder:text-[#9AA1B2] disabled:bg-[#F3F4F6]" />
                              </div>
                              <div>
                                <div className="text-[15px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Dirección fiscal</div>
                                <input disabled={!profileEditable} className="mt-2 h-[48px] w-full rounded-full border-none bg-white px-5 text-[15px] text-[#6E7486] outline-none placeholder:text-[#9AA1B2] disabled:bg-[#F3F4F6]" />
                              </div>
                            </div>
                          </div>

                          <div className="rounded-2xl bg-[#F1F3F7] p-4">
                            <div className="mb-3 text-[18px] text-[#1B2140]" style={{ fontFamily: "var(--font-dashboarddemarca-heading)" }}>Ubicación y contacto</div>
                            <div className="grid grid-cols-4 gap-4">
                              <div>
                                <div className="text-[15px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>País</div>
                                <div className="relative mt-2">
                                  <select disabled={!profileEditable} className="h-[46px] w-full appearance-none rounded-full border-none bg-white px-5 pr-10 text-[15px] text-[#8B90A0] outline-none disabled:bg-[#F3F4F6]">
                                    <option>Buscar país</option>
                                    {facturacionCountryOptions.map((item) => (
                                      <option key={`fact-pais-${item.id}`} value={item.id}>{item.label}</option>
                                    ))}
                                  </select>
                                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[16px] text-[#3b4256]">▾</span>
                                </div>
                              </div>
                              <div>
                                <div className="text-[15px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Ciudad</div>
                                <input disabled={!profileEditable} className="mt-2 h-[46px] w-full rounded-full border-none bg-white px-5 text-[15px] text-[#6E7486] outline-none placeholder:text-[#9AA1B2] disabled:bg-[#F3F4F6]" />
                              </div>
                              <div>
                                <div className="text-[15px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Código postal</div>
                                <input disabled={!profileEditable} className="mt-2 h-[46px] w-full rounded-full border-none bg-white px-5 text-[15px] text-[#6E7486] outline-none placeholder:text-[#9AA1B2] disabled:bg-[#F3F4F6]" />
                              </div>
                              <div>
                                <div className="text-[15px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Teléfono (interno)</div>
                                <input disabled={!profileEditable} className="mt-2 h-[46px] w-full rounded-full border-none bg-white px-5 text-[15px] text-[#6E7486] outline-none placeholder:text-[#9AA1B2] disabled:bg-[#F3F4F6]" />
                              </div>
                            </div>
                          </div>

                          <div className="rounded-2xl bg-[#F1F3F7] p-4">
                            <div className="mb-3 text-[18px] text-[#1B2140]" style={{ fontFamily: "var(--font-dashboarddemarca-heading)" }}>Datos fiscales opcionales</div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <div className="text-[15px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Número de identificación fiscal (CIF / NIF / VAT)</div>
                                <input disabled={!profileEditable} className="mt-2 h-[46px] w-full rounded-full border-none bg-white px-5 text-[15px] text-[#6E7486] outline-none placeholder:text-[#9AA1B2] disabled:bg-[#F3F4F6]" />
                              </div>
                              <div>
                                <div className="text-[15px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Correo electrónico para facturación (interno)</div>
                                <input disabled={!profileEditable} className="mt-2 h-[46px] w-full rounded-full border-none bg-white px-5 text-[15px] text-[#6E7486] outline-none placeholder:text-[#9AA1B2] disabled:bg-[#F3F4F6]" />
                              </div>
                            </div>
                          </div>

                          <div className="rounded-2xl bg-[#F1F3F7] p-4">
                            <div className="grid grid-cols-3 gap-4">
                              <div>
                                <div className="text-[15px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Prefijo</div>
                                <input disabled={!profileEditable} defaultValue="DEM - 2026 -" className="mt-2 h-[46px] w-full rounded-full border-none bg-white px-5 text-[15px] text-[#8B90A0] outline-none placeholder:text-[#9AA1B2] disabled:bg-[#F3F4F6]" />
                              </div>
                              <div>
                                <div className="text-[15px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>País fiscal</div>
                                <div className="relative mt-2">
                                  <select disabled={!profileEditable} className="h-[46px] w-full appearance-none rounded-full border-none bg-white px-5 pr-10 text-[15px] text-[#8B90A0] outline-none disabled:bg-[#F3F4F6]">
                                    <option>Buscar país</option>
                                    {facturacionCountryOptions.map((item) => (
                                      <option key={`fact-pais-fiscal-${item.id}`} value={item.id}>{item.label}</option>
                                    ))}
                                  </select>
                                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[16px] text-[#3b4256]">▾</span>
                                </div>
                              </div>
                              <div className="flex items-end">
                                <button type="button" disabled={!profileEditable} className="h-[46px] w-full rounded-full border-none bg-[#4449CC26] px-5 text-[15px] text-[#6142C4] disabled:opacity-70" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                                  + plantilla factura
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="mt-8 flex justify-end">
                          <button type="button" disabled={!profileEditable} className="h-[50px] rounded-full bg-[#0B1230] px-8 text-[16px] text-white disabled:opacity-60">
                            Confirmar
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="rounded-2xl bg-white p-6 text-[16px] text-[#70778E]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                        Sección vacía por ahora.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : activeItem.path ? (
              <iframe
                key={activeKey}
                title={activeItem.label}
                src={frameSrc}
                className="h-full w-full border-0"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-[#58607A]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                {activeItem.emptyText || `${activeItem.label} aun esta vacio.`}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
