"use client";

import Image from "next/image";
import localFont from "next/font/local";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
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
  warehouseCode?: string;
  warehouseView?: WarehouseTabKey;
};

type ProfileTabKey = "general" | "paises" | "monedas" | "almacenes" | "marketplaces" | "facturacion";
type WarehouseMapBlock = {
  key: string;
  label: string;
  itemCount: number;
  rows: number[];
  x: number;
  y: number;
  w: number;
  h: number;
};

type WarehouseBoxSelection = {
  code: string;
  items: number;
  category: string;
};

type WarehouseTabKey = "info" | "distribution";

type WarehouseLayoutEntry = {
  code: string;
  block: string;
  floor: number;
  box: number;
  items: number;
  category: string;
  name: string;
};

type StoreProfile = {
  name: string;
  description: string;
  logoUrl: string | null;
  themeColor?: string | null;
  baseCurrencyCode: string;
  salesCountryCodes: string[];
  marketplaces: string[];
  warehouses: string[];
};

type WarehouseProfile = {
  name: string;
  code: string;
  type: "OWN" | "THIRD_PARTY_3PL" | "RETURNS" | "TEMPORARY";
  status: "ACTIVE" | "INACTIVE";
  countryCode: string;
  city: string;
  address: string;
  reference: string;
  managerName: string;
  phone: string;
  email: string;
  openingHour: string;
  closingHour: string;
  capacityUnits: string;
  color: string;
  description: string;
};

type ToggleItem = {
  id: string;
  label: string;
  active: boolean;
  name?: string;
  type?: WarehouseProfile["type"];
  status?: WarehouseProfile["status"];
  countryCode?: string;
  city?: string;
  color?: string;
  description?: string;
};

const COUNTRY_OPTIONS: Array<{ id: string; label: string; tax: string }> = [
  { id: "ES", label: "España 🇪🇸", tax: "IVA 21%" },
  { id: "IT", label: "Italia 🇮🇹", tax: "IVA 22%" },
  { id: "PT", label: "Portugal 🇵🇹", tax: "IVA 23%" },
  { id: "DE", label: "Alemania 🇩🇪", tax: "MwSt 19%" },
  { id: "PL", label: "Polonia 🇵🇱", tax: "VAT 23%" },
  { id: "FR", label: "Francia 🇫🇷", tax: "TVA 20%" },
  { id: "PE", label: "Perú 🇵🇪", tax: "IGV 18%" },
  { id: "AR", label: "Argentina 🇦🇷", tax: "IVA 21%" },
  { id: "MX", label: "México 🇲🇽", tax: "IVA 16%" },
  { id: "BR", label: "Brasil 🇧🇷", tax: "ICMS/ISS (según estado/municipio)" },
  { id: "CL", label: "Chile 🇨🇱", tax: "IVA 19%" },
  { id: "CO", label: "Colombia 🇨🇴", tax: "IVA 19%" },
  { id: "EC", label: "Ecuador 🇪🇨", tax: "IVA 15%" },
  { id: "US", label: "Estados Unidos 🇺🇸", tax: "Sales Tax (según estado)" },
  { id: "GB", label: "Reino Unido 🇬🇧", tax: "VAT 20%" },
  { id: "IE", label: "Irlanda 🇮🇪", tax: "VAT 23%" },
  { id: "NL", label: "Países Bajos 🇳🇱", tax: "BTW 21%" },
  { id: "BE", label: "Bélgica 🇧🇪", tax: "VAT 21%" },
  { id: "AT", label: "Austria 🇦🇹", tax: "USt 20%" },
  { id: "CH", label: "Suiza 🇨🇭", tax: "MWST 8.1%" },
  { id: "SE", label: "Suecia 🇸🇪", tax: "Moms 25%" },
  { id: "NO", label: "Noruega 🇳🇴", tax: "MVA 25%" },
  { id: "DK", label: "Dinamarca 🇩🇰", tax: "MOMS 25%" },
  { id: "FI", label: "Finlandia 🇫🇮", tax: "VAT 25.5%" },
  { id: "TR", label: "Turquía 🇹🇷", tax: "KDV 20%" },
  { id: "CN", label: "China 🇨🇳", tax: "VAT 13%" },
  { id: "JP", label: "Japón 🇯🇵", tax: "JCT 10%" },
];

const MAX_EXTRA_BRAND_COLORS = 3;

const MARKETPLACE_SEARCH_OPTIONS = [
  "Shopify",
  "Idealo ES",
  "Idealo DE",
  "Amazon",
  "eBay",
  "Worten",
  "KuantoKusta",
];

const CURRENCY_OPTIONS = [
  { code: "EUR", label: "EURO €" },
  { code: "USD", label: "DÓLAR $" },
  { code: "PEN", label: "SOLES S/" },
  { code: "CNY", label: "YUANES ¥" },
  { code: "TRY", label: "LIRA TURCA ₺" },
  { code: "PLN", label: "ZLOTY zł" },
];

const HIDDEN_WAREHOUSE_LABELS = new Set(["ES-MAD", "IT-MIL"]);

function normalizeWarehouseLabel(raw: string) {
  return String(raw || "").trim().toUpperCase();
}

function isVisibleWarehouseLabel(raw: string) {
  const label = normalizeWarehouseLabel(raw);
  if (!label) return false;
  return !HIDDEN_WAREHOUSE_LABELS.has(label);
}

function sanitizeWarehouseRows(rows: Array<{ id?: string; label?: string; active?: boolean }>): ToggleItem[] {
  const byLabel = new Map<string, ToggleItem>();
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const label = normalizeWarehouseLabel(String(row.label || ""));
    if (!isVisibleWarehouseLabel(label)) continue;
    const id = String(row.id || label.toLowerCase().replace(/\s+/g, "-"));
    const current = byLabel.get(label);
    if (current) {
      byLabel.set(label, {
        ...current,
        active: current.active || Boolean(row.active),
        name: String((row as ToggleItem).name || current.name || ""),
        type: ((row as ToggleItem).type || current.type) as ToggleItem["type"],
        status: ((row as ToggleItem).status || current.status) as ToggleItem["status"],
        countryCode: String((row as ToggleItem).countryCode || current.countryCode || ""),
        city: String((row as ToggleItem).city || current.city || ""),
        color: String((row as ToggleItem).color || current.color || ""),
        description: String((row as ToggleItem).description || current.description || ""),
      });
    } else {
      byLabel.set(label, {
        id,
        label,
        active: Boolean(row.active),
        name: String((row as ToggleItem).name || ""),
        type: ((row as ToggleItem).type || "OWN") as ToggleItem["type"],
        status: ((row as ToggleItem).status || "ACTIVE") as ToggleItem["status"],
        countryCode: String((row as ToggleItem).countryCode || ""),
        city: String((row as ToggleItem).city || ""),
        color: String((row as ToggleItem).color || ""),
        description: String((row as ToggleItem).description || ""),
      });
    }
  }
  return Array.from(byLabel.values());
}

function sanitizeMarketplaceRows(rows: Array<{ id?: string; label?: string; active?: boolean }>): ToggleItem[] {
  const byLabel = new Map<string, ToggleItem>();
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const label = String(row.label || "").trim();
    if (!label) continue;
    const key = label.toLowerCase();
    const id = String(row.id || key.replace(/\s+/g, "-"));
    const current = byLabel.get(key);
    if (current) {
      byLabel.set(key, { ...current, active: current.active || Boolean(row.active) });
    } else {
      byLabel.set(key, { id, label, active: Boolean(row.active) });
    }
  }
  return Array.from(byLabel.values());
}

const BILLING_CITIES_BY_COUNTRY: Record<string, string[]> = {
  IE: ["Dublín", "Cork", "Galway", "Limerick", "Waterford"],
  ES: ["Madrid", "Barcelona", "Valencia", "Sevilla", "Bilbao"],
  IT: ["Roma", "Milán", "Nápoles", "Turín", "Florencia"],
  PT: ["Lisboa", "Oporto", "Braga", "Coímbra", "Faro"],
  DE: ["Berlín", "Múnich", "Hamburgo", "Colonia", "Fráncfort"],
  FR: ["París", "Lyon", "Marsella", "Toulouse", "Niza"],
  PE: ["Lima", "Arequipa", "Trujillo", "Cusco", "Piura"],
};

function flagFromCountryCode(code: string) {
  if (!/^[A-Z]{2}$/.test(code)) return "";
  return String.fromCodePoint(...[...code].map((c) => 127397 + c.charCodeAt(0)));
}

function fallbackTaxLabelByCountry(code: string) {
  const c = String(code || "").toUpperCase();
  if (!c) return "Impuesto local";
  if (c === "US") return "Sales Tax (según estado)";
  if (c === "CA") return "GST/HST (según provincia)";
  if (c === "AU" || c === "NZ") return "GST 10%";
  if (c === "JP") return "JCT 10%";
  if (c === "CN") return "VAT 13%";
  if (c === "IN") return "GST 18% (promedio)";
  if (c === "BR") return "ICMS/ISS (según estado/municipio)";
  if (c === "AR") return "IVA 21%";
  if (c === "CL") return "IVA 19%";
  if (c === "CO") return "IVA 19%";
  if (c === "EC") return "IVA 15%";
  if (c === "PE") return "IGV 18%";
  if (c === "MX") return "IVA 16%";
  if (c === "UY") return "IVA 22%";
  if (c === "PY") return "IVA 10%";
  if (c === "BO") return "IVA 13%";
  if (c === "VE") return "IVA 16%";
  if (c === "GB") return "VAT 20%";
  if (c === "IE") return "VAT 23%";
  if (c === "NL") return "BTW 21%";
  if (c === "BE") return "VAT 21%";
  if (c === "AT") return "USt 20%";
  if (c === "CH") return "MWST 8.1%";
  if (c === "SE") return "Moms 25%";
  if (c === "NO") return "MVA 25%";
  if (c === "DK") return "MOMS 25%";
  if (c === "FI") return "VAT 25.5%";
  if (c === "TR") return "KDV 20%";
  if (c === "AE" || c === "SA") return "VAT 15%";
  return "VAT/GST local";
}

function countryLabelWithFlag(
  id: string,
  fallbackLabel: string,
  options: Array<{ id: string; label: string }>
) {
  const byId = options.find((item) => item.id === id)?.label;
  if (byId) return byId;
  const flag = flagFromCountryCode(id);
  if (!flag) return fallbackLabel;
  return fallbackLabel.includes(flag) ? fallbackLabel : `${fallbackLabel} ${flag}`;
}

const FALLBACK_REGION_CODES = [
  "AD","AE","AF","AG","AI","AL","AM","AO","AQ","AR","AS","AT","AU","AW","AX","AZ","BA","BB","BD","BE","BF","BG","BH","BI","BJ","BL","BM","BN","BO","BQ","BR","BS","BT","BV","BW","BY","BZ","CA","CC","CD","CF","CG","CH","CI","CK","CL","CM","CN","CO","CR","CU","CV","CW","CX","CY","CZ","DE","DJ","DK","DM","DO","DZ","EC","EE","EG","EH","ER","ES","ET","FI","FJ","FK","FM","FO","FR","GA","GB","GD","GE","GF","GG","GH","GI","GL","GM","GN","GP","GQ","GR","GS","GT","GU","GW","GY","HK","HM","HN","HR","HT","HU","ID","IE","IL","IM","IN","IO","IQ","IR","IS","IT","JE","JM","JO","JP","KE","KG","KH","KI","KM","KN","KP","KR","KW","KY","KZ","LA","LB","LC","LI","LK","LR","LS","LT","LU","LV","LY","MA","MC","MD","ME","MF","MG","MH","MK","ML","MM","MN","MO","MP","MQ","MR","MS","MT","MU","MV","MW","MX","MY","MZ","NA","NC","NE","NF","NG","NI","NL","NO","NP","NR","NU","NZ","OM","PA","PE","PF","PG","PH","PK","PL","PM","PN","PR","PS","PT","PW","PY","QA","RE","RO","RS","RU","RW","SA","SB","SC","SD","SE","SG","SH","SI","SJ","SK","SL","SM","SN","SO","SR","SS","ST","SV","SX","SY","SZ","TC","TD","TF","TG","TH","TJ","TK","TL","TM","TN","TO","TR","TT","TV","TW","TZ","UA","UG","UM","US","UY","UZ","VA","VC","VE","VG","VI","VN","VU","WF","WS","YE","YT","ZA","ZM","ZW",
] as const;
const API_BASE = "http://localhost:3001";

function toAbsoluteLogoUrl(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/")) return `${API_BASE}${raw}`;
  return `${API_BASE}/${raw}`;
}

function toApiLogoPath(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw.startsWith(API_BASE)) return raw.slice(API_BASE.length) || null;
  return raw;
}

const menu: MenuItem[] = [
  { key: "dashboard", label: "Dashboard", path: "/store/dashboard", isMain: true },
  { key: "inventario", label: "Inventario", path: "/store/inventory", isMain: true },
  { key: "escaner-operativo", label: "Escáner Operativo", indent: 1, isGroup: true },
  { key: "scanner-recepcion", label: "Recepción", indent: 2 },
  { key: "scanner-picking", label: "Picking", indent: 2 },
  { key: "scanner-packing", label: "Packing", indent: 2 },
  { key: "scanner-devoluciones", label: "Devoluciones", indent: 2 },
  { key: "scanner-busqueda", label: "Búsqueda", indent: 2 },
  { key: "scanner-ajuste", label: "Ajuste", indent: 2 },
  { key: "scanner-transferencias", label: "Transferencias", indent: 2 },
  { key: "productos", label: "Productos", path: "/store/products", indent: 1 },
  { key: "almacenes", label: "Almacenes", path: "/store/inventory", isMain: true },
  { key: "almacenes-lista", label: "Lista de Almacenes", path: "/store/inventory", indent: 1 },
  { key: "es-seg", label: "ES-SEG", emptyText: "ES-SEG aun esta vacio.", indent: 2 },
  { key: "es-seg-info", label: "Información del almacén", emptyText: "Información del almacén aun esta vacía.", indent: 3 },
  { key: "es-seg-distribution", label: "Distribución de almacén", emptyText: "Distribución de almacén aun esta vacía.", indent: 3 },
  { key: "almacenes-mapa", label: "Mapa de Almacén", emptyText: "Mapa de Almacén aun esta vacio.", indent: 3 },
  { key: "almacenes-agregar", label: "Agregar Almacén", path: "/add-store", indent: 1 },
  { key: "almacenes-inventario", label: "Inventario por Almacén", path: "/store/inventory", indent: 1 },
  { key: "almacenes-movimientos", label: "Movimiento de Stock", path: "/store/inventory", indent: 1 },
  { key: "proveedores", label: "Proveedores", path: "/store/suppliers", isMain: true },
  { key: "compras", label: "Compras", path: "/store/purchases", indent: 1 },
  { key: "tracking", label: "Tracking", emptyText: "Tracking aun esta vacio.", indent: 1 },
  { key: "marketplaces", label: "Canales", isMain: true, isGroup: true },
  { key: "shopify-demarca", label: "Shopify Demarca", path: "/store/orders", indent: 1 },
  { key: "pedidos", label: "Pedidos", path: "/store/orders", indent: 2 },
  { key: "clientes", label: "Clientes", path: "/store/customers", indent: 2 },
  { key: "soporte-tickets", label: "Soporte (Tickets/quejas)", path: "/store/support", indent: 2 },
  { key: "devoluciones", label: "Devoluciones", path: "/store/returns", indent: 2 },
  { key: "payouts", label: "Payouts", path: "/store/payouts", indent: 2 },
  { key: "facturas", label: "Facturas", path: "/store/invoices", indent: 2 },
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

const WAREHOUSE_MAP_BLOCKS: WarehouseMapBlock[] = [
  { key: "A", label: "BLOQUE A", itemCount: 24, rows: [1], x: 19, y: 24, w: 11, h: 9 },
  { key: "B", label: "BLOQUE B", itemCount: 19, rows: [1], x: 19, y: 34, w: 11, h: 9 },
  { key: "C", label: "BLOQUE C", itemCount: 21, rows: [1], x: 19, y: 44, w: 11, h: 9 },
  { key: "D", label: "BLOQUE D", itemCount: 58, rows: [14, 12, 1, 1], x: 6, y: 24, w: 11, h: 43 },
  { key: "E", label: "BLOQUE E", itemCount: 16, rows: [5, 1, 4, 1, 1, 1], x: 31, y: 9, w: 40, h: 13 },
  { key: "F", label: "BLOQUE F", itemCount: 11, rows: [1], x: 73, y: 9, w: 17, h: 13 },
  { key: "G", label: "BLOQUE G", itemCount: 8, rows: [1], x: 79, y: 33, w: 11, h: 9 },
  { key: "H", label: "BLOQUE H", itemCount: 6, rows: [1], x: 79, y: 43.5, w: 11, h: 9 },
  { key: "I", label: "BLOQUE I", itemCount: 7, rows: [1], x: 79, y: 54, w: 11, h: 9 },
  { key: "J", label: "BLOQUE J", itemCount: 5, rows: [1], x: 79, y: 64.5, w: 11, h: 9 },
  { key: "K", label: "BLOQUE K", itemCount: 2, rows: [1, 1], x: 63, y: 76, w: 27, h: 11 },
];

const SCANNER_FLOW_CONTENT: Record<
  string,
  {
    title: string;
    intro: string;
    primaryAction: string;
    badge: string;
    summary: string;
  }
> = {
  "scanner-recepcion": {
    title: "Recepción",
    intro: "Escaneo de entrada para recepcionar mercancía, crear lotes y actualizar stock sin editar cantidades manualmente.",
    primaryAction: "Todo OK",
    badge: "Entrada",
    summary: "Crea lote, movement IN y stock disponible en ubicación destino.",
  },
  "scanner-picking": {
    title: "Picking",
    intro: "Validación de producto contra el pedido en preparación. El operario escanea y el sistema confirma si cogió el producto correcto.",
    primaryAction: "Pick completo",
    badge: "Validación",
    summary: "No descuenta stock final. Solo valida el item esperado y el progreso del pedido.",
  },
  "scanner-packing": {
    title: "Packing",
    intro: "Confirmación final de salida con packaging y descuento FIFO del lote más antiguo.",
    primaryAction: "Confirmar salida",
    badge: "Salida",
    summary: "Descuenta FIFO, crea sale_out y deja el pedido listo para enviar.",
  },
  "scanner-devoluciones": {
    title: "Devoluciones",
    intro: "Escaneo doble de tracking y producto para decidir restock, reparación o scrap.",
    primaryAction: "Registrar devolución",
    badge: "Retorno",
    summary: "Clasifica la devolución y crea return_in o movimiento no vendible.",
  },
  "scanner-busqueda": {
    title: "Búsqueda rápida",
    intro: "Modo de consulta. Escanear abre la ficha del producto usando EAN principal o alias.",
    primaryAction: "Abrir ficha",
    badge: "Lookup",
    summary: "Busca en products.ean, ean_aliases y propone crear producto si no existe.",
  },
  "scanner-ajuste": {
    title: "Ajuste",
    intro: "Corrección controlada de stock con motivo y auditoría. Nunca se edita el número directo.",
    primaryAction: "Aplicar ajuste",
    badge: "Corrección",
    summary: "Genera movement adjustment con cantidad, ubicación y motivo.",
  },
  "scanner-transferencias": {
    title: "Transferencias",
    intro: "Movimiento de stock entre almacenes con salida en origen y entrada en destino.",
    primaryAction: "Crear transferencia",
    badge: "Traslado",
    summary: "Genera transfer_out y transfer_in entre almacenes y ubicaciones.",
  },
};

function buildWarehouseCode(block: string, floor: number, box: number) {
  return `${block}-${String(floor).padStart(2, "0")}-${String(box).padStart(2, "0")}`;
}

function buildDefaultWarehouseLayout(): WarehouseLayoutEntry[] {
  const rows: WarehouseLayoutEntry[] = [];
  const pushEntry = (block: string, floor: number, box: number, items: number, category: string) => {
    const code = buildWarehouseCode(block, floor, box);
    rows.push({
      code,
      block,
      floor,
      box,
      items,
      category,
      name: `Caja ${code}`,
    });
  };

  pushEntry("A", 1, 1, 24, "Bolsos");
  pushEntry("B", 1, 1, 19, "Accesorios");
  pushEntry("C", 1, 1, 21, "Perfumes");

  for (let box = 1; box <= 14; box += 1) pushEntry("D", 1, box, box === 14 ? 8 : 4, "Bolsos");
  for (let box = 1; box <= 12; box += 1) pushEntry("D", 2, box, box <= 3 ? 6 : 3, "Relojes");
  pushEntry("D", 3, 1, 7, "Vintage");
  pushEntry("D", 4, 1, 5, "Accesorios");

  for (let box = 1; box <= 5; box += 1) pushEntry("E", 1, box, 2, "Bolsos");
  pushEntry("E", 2, 1, 1, "Accesorios");
  for (let box = 1; box <= 4; box += 1) pushEntry("E", 3, box, 2, "Perfumes");
  pushEntry("E", 4, 1, 2, "Accesorios");
  pushEntry("E", 5, 1, 4, "Vintage");
  pushEntry("E", 6, 1, 5, "Relojes");

  pushEntry("F", 1, 1, 11, "Bolsos");
  pushEntry("G", 1, 1, 8, "Accesorios");
  pushEntry("H", 1, 1, 6, "Perfumes");
  pushEntry("I", 1, 1, 7, "Relojes");
  pushEntry("J", 1, 1, 5, "Vintage");
  pushEntry("K", 1, 1, 1, "Accesorios");
  pushEntry("K", 2, 1, 1, "Accesorios");

  return rows;
}

function buildDefaultWarehouseProfile(code: string, name?: string): WarehouseProfile {
  const normalizedCode = normalizeWarehouseLabel(code || "WH-01") || "WH-01";
  const safeName = String(name || `Warehouse ${normalizedCode}`).trim() || `Warehouse ${normalizedCode}`;
  const countryCode = normalizedCode.startsWith("IT-") ? "IT" : normalizedCode.startsWith("PT-") ? "PT" : "ES";
  const city = countryCode === "IT" ? "Milán" : countryCode === "PT" ? "Lisboa" : "Segovia";
  return {
    name: normalizedCode === "ES-SEG" ? "Segovia Warehouse" : safeName,
    code: normalizedCode,
    type: "OWN",
    status: "ACTIVE",
    countryCode,
    city,
    address: normalizedCode === "ES-SEG" ? "Polígono Industrial, Nave 8" : "",
    reference: normalizedCode === "ES-SEG" ? "Zona logística norte" : "",
    managerName: "",
    phone: "",
    email: "",
    openingHour: "08:00",
    closingHour: "18:00",
    capacityUnits: "1200",
    color: "#6456DF",
    description:
      normalizedCode === "ES-SEG"
        ? "Almacén principal para preparación de pedidos y stock operativo."
        : "Ficha operativa del almacén para configuración y control.",
  };
}

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
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [storeSectionCollapsed, setStoreSectionCollapsed] = useState(false);
  const [menuSectionCollapsed, setMenuSectionCollapsed] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchError, setSearchError] = useState("");
  const [showStoreProfile, setShowStoreProfile] = useState(false);
  const [profileTab, setProfileTab] = useState<ProfileTabKey>("general");
  const [profileEditable, setProfileEditable] = useState(false);
  const [brandColors, setBrandColors] = useState<string[]>(["#6456DF"]);
  const [selectedBrandColor, setSelectedBrandColor] = useState("#6456DF");
  const [editingColorIndex, setEditingColorIndex] = useState<number | null>(null);
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
  const [showMarketplacesAddForm, setShowMarketplacesAddForm] = useState(false);
  const [showAlmacenesAddForm, setShowAlmacenesAddForm] = useState(false);
  const [selectedBaseCurrency, setSelectedBaseCurrency] = useState("");
  const [usesMultipleCurrencies, setUsesMultipleCurrencies] = useState<boolean | null>(null);
  const [exchangeMode, setExchangeMode] = useState<"api" | "manual">("manual");
  const [notifyFxChange, setNotifyFxChange] = useState(false);
  const [selectedAdditionalCurrency, setSelectedAdditionalCurrency] = useState("");
  const [fxManualRate, setFxManualRate] = useState("");
  const [fxApiRate, setFxApiRate] = useState<number | null>(null);
  const [fxLoading, setFxLoading] = useState(false);
  const [fxError, setFxError] = useState("");
  const [fxAmountOriginal, setFxAmountOriginal] = useState("100");
  const [fxThresholdPercent, setFxThresholdPercent] = useState("");
  const [monedasSaveError, setMonedasSaveError] = useState("");
  const [monedasSaveOk, setMonedasSaveOk] = useState("");
  const [monedasSaving, setMonedasSaving] = useState(false);
  const [warehouseRows, setWarehouseRows] = useState<ToggleItem[]>([
    {
      id: "es-seg",
      label: "ES-SEG",
      active: true,
      name: "Segovia Warehouse",
      type: "OWN",
      status: "ACTIVE",
      countryCode: "ES",
      city: "Segovia",
      color: "#6456DF",
      description: "Almacén principal para preparación de pedidos y stock operativo.",
    },
  ]);
  const [newMarketplaceLabel, setNewMarketplaceLabel] = useState("");
  const [selectedMarketplaceOption, setSelectedMarketplaceOption] = useState("");
  const [newWarehouseLabel, setNewWarehouseLabel] = useState("");
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoUploadError, setLogoUploadError] = useState("");
  const [generalSaveError, setGeneralSaveError] = useState("");
  const [generalSaveOk, setGeneralSaveOk] = useState("");
  const [generalSaving, setGeneralSaving] = useState(false);
  const [countriesSaveError, setCountriesSaveError] = useState("");
  const [countriesSaveOk, setCountriesSaveOk] = useState("");
  const [countriesSaving, setCountriesSaving] = useState(false);
  const [factSaveError, setFactSaveError] = useState("");
  const [factSaveOk, setFactSaveOk] = useState("");
  const [factSaving, setFactSaving] = useState(false);
  const [almacenesSaveError, setAlmacenesSaveError] = useState("");
  const [almacenesSaveOk, setAlmacenesSaveOk] = useState("");
  const [almacenesSaving, setAlmacenesSaving] = useState(false);
  const [canalesSaveError, setCanalesSaveError] = useState("");
  const [canalesSaveOk, setCanalesSaveOk] = useState("");
  const [canalesSaving, setCanalesSaving] = useState(false);
  const [billingCompany, setBillingCompany] = useState("");
  const [billingAddress, setBillingAddress] = useState("");
  const [billingCountry, setBillingCountry] = useState("");
  const [billingCity, setBillingCity] = useState("");
  const [billingPostalCode, setBillingPostalCode] = useState("");
  const [billingPhone, setBillingPhone] = useState("");
  const [billingTaxId, setBillingTaxId] = useState("");
  const [billingEmail, setBillingEmail] = useState("");
  const [billingPrefix, setBillingPrefix] = useState("DEM - 2026 -");
  const [billingFiscalCountry, setBillingFiscalCountry] = useState("");
  const [showInvoiceTemplatePreview, setShowInvoiceTemplatePreview] = useState(false);
  const [selectedMapBlock, setSelectedMapBlock] = useState("F");
  const [selectedMapBox, setSelectedMapBox] = useState<WarehouseBoxSelection | null>(null);
  const [warehouseTab, setWarehouseTab] = useState<WarehouseTabKey>("info");
  const [warehouseEditable, setWarehouseEditable] = useState(false);
  const [warehouseSaving, setWarehouseSaving] = useState(false);
  const [warehouseSaveError, setWarehouseSaveError] = useState("");
  const [warehouseSaveOk, setWarehouseSaveOk] = useState("");
  const [warehouseProfile, setWarehouseProfile] = useState<WarehouseProfile>(() => ({
    ...buildDefaultWarehouseProfile("ES-SEG", "Segovia Warehouse"),
    address: "Polígono Industrial, Nave 8",
    reference: "Zona logística norte",
    managerName: "Responsable almacén",
    phone: "+34 900 000 000",
    email: "warehouse.seg@demarca.local",
  }));
  const [newWarehouseProfile, setNewWarehouseProfile] = useState<WarehouseProfile>(() =>
    buildDefaultWarehouseProfile("ES-NEW", "Nuevo almacén")
  );
  const [warehouseCreateError, setWarehouseCreateError] = useState("");
  const [warehouseCreateOk, setWarehouseCreateOk] = useState("");
  const [warehouseLayout, setWarehouseLayout] = useState<WarehouseLayoutEntry[]>(() => buildDefaultWarehouseLayout());
  const [distributionDraft, setDistributionDraft] = useState({
    block: "A",
    floor: "1",
    box: "1",
    items: "0",
    category: "Bolsos",
  });
  const [scannerWarehouseCode, setScannerWarehouseCode] = useState("ES-SEG");
  const [scannerLocationCode, setScannerLocationCode] = useState("A-01-01");
  const [scannerInput, setScannerInput] = useState("");
  const [scannerTracking, setScannerTracking] = useState("");
  const [scannerOrderRef, setScannerOrderRef] = useState("SO-1168");
  const [scannerIncidentNote, setScannerIncidentNote] = useState("");
  const [scannerDecision, setScannerDecision] = useState("restock");
  const [scannerAdjustmentQty, setScannerAdjustmentQty] = useState("1");
  const [scannerAdjustmentReason, setScannerAdjustmentReason] = useState("Ajuste manual");
  const [scannerPackaging, setScannerPackaging] = useState({
    box: "Caja M",
    bubble: true,
    paper: true,
    tape: true,
  });
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const colorPickerRef = useRef<HTMLInputElement | null>(null);
  const hasSavedWarehousesRef = useRef(false);
  const hasSavedCanalesRef = useRef(false);
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
  const warehouseLayoutByCode = useMemo(
    () => new Map(warehouseLayout.map((entry) => [entry.code, entry])),
    [warehouseLayout]
  );
  const warehouseMapBlocks = useMemo(() => {
    return WAREHOUSE_MAP_BLOCKS.map((block) => {
      const rowsByFloor = new Map<number, number>();
      let itemCount = 0;
      for (const entry of warehouseLayout) {
        if (entry.block !== block.key) continue;
        itemCount += Number(entry.items || 0);
        rowsByFloor.set(entry.floor, (rowsByFloor.get(entry.floor) || 0) + 1);
      }
      return {
        ...block,
        itemCount,
        rows: Array.from(rowsByFloor.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([, count]) => count),
      };
    });
  }, [warehouseLayout]);
  const warehouseMapTotalItems = useMemo(
    () => warehouseLayout.reduce((sum, entry) => sum + Number(entry.items || 0), 0),
    [warehouseLayout]
  );
  const selectedWarehouseMapBlock = useMemo(
    () => warehouseMapBlocks.find((block) => block.key === selectedMapBlock) || warehouseMapBlocks[0],
    [selectedMapBlock, warehouseMapBlocks]
  );
  const warehouseDistributionSummary = useMemo(() => {
    const byBlock = new Map<string, { boxes: number; floors: Set<number>; items: number }>();
    for (const entry of warehouseLayout) {
      const current = byBlock.get(entry.block) || { boxes: 0, floors: new Set<number>(), items: 0 };
      current.boxes += 1;
      current.floors.add(entry.floor);
      current.items += Number(entry.items || 0);
      byBlock.set(entry.block, current);
    }
    return Array.from(byBlock.entries())
      .sort((a, b) => a[0].localeCompare(b[0], "es"))
      .map(([block, stats]) => ({
        block,
        boxes: stats.boxes,
        floors: stats.floors.size,
        items: stats.items,
      }));
  }, [warehouseLayout]);
  const warehouseCategories = ["Bolsos", "Relojes", "Perfumes", "Accesorios", "Vintage"];
  const scannerLocationOptions = useMemo(
    () => warehouseLayout
      .map((entry) => entry.code)
      .sort((a, b) => a.localeCompare(b, "es")),
    [warehouseLayout]
  );
  const scannerSelectedLocation = useMemo(
    () => warehouseLayout.find((entry) => entry.code === scannerLocationCode) || null,
    [warehouseLayout, scannerLocationCode]
  );
  const scannerFlow = SCANNER_FLOW_CONTENT[activeKey] || null;

  function selectWarehouseBox(code: string) {
    const found = warehouseLayoutByCode.get(code);
    if (found) {
      setSelectedMapBox({ code, items: found.items, category: found.category });
      return;
    }
    const seed = [...code].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
    const items = (seed % 24) + 1;
    const category = warehouseCategories[seed % warehouseCategories.length];
    setSelectedMapBox({ code, items, category });
  }

  function warehouseBoxButtonClass(code: string, size: "normal" | "large" = "normal") {
    const selected = selectedMapBox?.code === code;
    const height = size === "large" ? "h-[71px]" : "h-[34px]";
    return `${height} w-full rounded-lg border px-1.5 text-[12px] font-semibold tracking-[0.01em] transition ${
      selected
        ? "border-[#121633] bg-white text-[#1B2140] shadow-[0_6px_14px_rgba(18,22,51,0.18)]"
        : "border-[#E3E7EE] bg-[#EEF1F6] text-[#6A738B] hover:border-[#CBD2DF] hover:bg-white"
    }`;
  }

  useEffect(() => {
    setSelectedMapBox(null);
  }, [selectedMapBlock]);

  async function saveWarehouseProfile() {
    if (!warehouseEditable || warehouseSaving) return;
    const selectedStoreId = localStorage.getItem("selectedStoreId");
    if (!selectedStoreId || !activeWarehouseCode) return;
    try {
      setWarehouseSaveError("");
      setWarehouseSaveOk("");
      setWarehouseSaving(true);
      localStorage.setItem(
        `warehouse-profile:${selectedStoreId}:${activeWarehouseCode}`,
        JSON.stringify({
          ...warehouseProfile,
          savedAt: new Date().toISOString(),
        })
      );
      setWarehouseRows((prev) =>
        sanitizeWarehouseRows(
          prev.map((row) =>
            row.label === activeWarehouseCode
              ? {
                  ...row,
                  label: normalizeWarehouseLabel(warehouseProfile.code),
                  name: warehouseProfile.name,
                  type: warehouseProfile.type,
                  status: warehouseProfile.status,
                  countryCode: warehouseProfile.countryCode,
                  city: warehouseProfile.city,
                  color: warehouseProfile.color,
                  description: warehouseProfile.description,
                }
              : row
          )
        )
      );
      setWarehouseEditable(false);
      setWarehouseSaveOk("Ficha de almacén guardada.");
    } catch (err) {
      setWarehouseSaveError(err instanceof Error ? err.message : "No se pudo guardar almacén.");
    } finally {
      setWarehouseSaving(false);
    }
  }

  async function saveWarehouseLayout() {
    if (!warehouseEditable || warehouseSaving) return;
    const selectedStoreId = localStorage.getItem("selectedStoreId");
    if (!selectedStoreId || !activeWarehouseCode) return;
    try {
      setWarehouseSaveError("");
      setWarehouseSaveOk("");
      setWarehouseSaving(true);
      localStorage.setItem(`warehouse-layout:${selectedStoreId}:${activeWarehouseCode}`, JSON.stringify(warehouseLayout));
      setWarehouseSaveOk("Distribución de almacén guardada.");
    } catch (err) {
      setWarehouseSaveError(err instanceof Error ? err.message : "No se pudo guardar la distribución.");
    } finally {
      setWarehouseSaving(false);
    }
  }
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
            tax: taxById.get(id) || fallbackTaxLabelByCountry(id),
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

  const fiscalCountryLabel = useMemo(() => {
    const fromPaisesTab = facturacionCountryOptions.find((item) => item.id === fiscalCountry)?.label;
    if (fromPaisesTab) return fromPaisesTab;
    const fromGeneralFallback = allCountryOptions.find((item) => item.id === fiscalCountry)?.label;
    if (fromGeneralFallback) return fromGeneralFallback;
    return fiscalCountry || "España 🇪🇸";
  }, [facturacionCountryOptions, allCountryOptions, fiscalCountry]);
  const fiscalCountryTax = useMemo(
    () => allCountryOptions.find((item) => item.id === fiscalCountry)?.tax ?? "IVA 21%",
    [allCountryOptions, fiscalCountry]
  );
  const billingCityOptions = useMemo(() => {
    const code = String(billingCountry || "").toUpperCase();
    return BILLING_CITIES_BY_COUNTRY[code] || [];
  }, [billingCountry]);
  const fxAmountNumber = Number(fxAmountOriginal);
  const fxManualRateNumber = Number(fxManualRate);
  const activeFxRate =
    exchangeMode === "api" ? fxApiRate : Number.isFinite(fxManualRateNumber) && fxManualRateNumber > 0 ? fxManualRateNumber : null;
  const fxConvertedAmount =
    Number.isFinite(fxAmountNumber) && fxAmountNumber > 0 && activeFxRate
      ? Number((fxAmountNumber * activeFxRate).toFixed(2))
      : null;

  useEffect(() => {
    const token = requireTokenOrRedirect();
    if (!token) return;

    const selectedStoreId = localStorage.getItem("selectedStoreId");
    if (!selectedStoreId) {
      router.push("/select-store");
      return;
    }

    try {
      const savedMonedasRaw = localStorage.getItem(`store-monedas-config:${selectedStoreId}`);
      if (savedMonedasRaw) {
        const savedMonedas = JSON.parse(savedMonedasRaw) as {
          baseCurrencyCode?: string;
          additionalCurrencyCode?: string | null;
          usesMultipleCurrencies?: boolean | null;
          exchangeMode?: "api" | "manual";
          notifyFxChange?: boolean;
          notifyThresholdPercent?: string;
          manualRate?: string | null;
        };
        if (savedMonedas.baseCurrencyCode) {
          const base = String(savedMonedas.baseCurrencyCode).toUpperCase();
          setSelectedBaseCurrency(base);
          setProfile((prev) => ({ ...prev, baseCurrencyCode: base }));
        }
        if (savedMonedas.additionalCurrencyCode) setSelectedAdditionalCurrency(String(savedMonedas.additionalCurrencyCode).toUpperCase());
        if (savedMonedas.usesMultipleCurrencies !== undefined) setUsesMultipleCurrencies(savedMonedas.usesMultipleCurrencies ?? null);
        if (savedMonedas.exchangeMode === "api" || savedMonedas.exchangeMode === "manual") setExchangeMode(savedMonedas.exchangeMode);
        if (typeof savedMonedas.notifyFxChange === "boolean") setNotifyFxChange(savedMonedas.notifyFxChange);
        if (savedMonedas.notifyThresholdPercent) setFxThresholdPercent(String(savedMonedas.notifyThresholdPercent));
        if (savedMonedas.manualRate) setFxManualRate(String(savedMonedas.manualRate));
      }
    } catch {}
    try {
      const savedCanalesRaw = localStorage.getItem(`store-marketplaces-config:${selectedStoreId}`);
      if (savedCanalesRaw) {
        const savedRows = JSON.parse(savedCanalesRaw) as Array<{ id?: string; label?: string; active?: boolean }>;
        if (Array.isArray(savedRows) && savedRows.length) {
          const normalized = sanitizeMarketplaceRows(savedRows);
          if (normalized.length) {
            hasSavedCanalesRef.current = true;
            setMarketplaceRows(normalized);
            setProfile((prev) => ({
              ...prev,
              marketplaces: normalized.filter((m) => m.active).map((m) => m.label),
            }));
          }
        }
      }
    } catch {}
    try {
      const savedWarehousesRaw = localStorage.getItem(`store-warehouses-config:${selectedStoreId}`);
      if (savedWarehousesRaw) {
        const savedRows = JSON.parse(savedWarehousesRaw) as Array<{ id?: string; label?: string; active?: boolean }>;
        if (Array.isArray(savedRows) && savedRows.length) {
          const normalized = sanitizeWarehouseRows(savedRows);
          if (normalized.length) {
            hasSavedWarehousesRef.current = true;
            setWarehouseRows(normalized);
            setProfile((prev) => ({
              ...prev,
              warehouses: normalized.filter((w) => w.active).map((w) => w.label),
            }));
          }
        }
      }
    } catch {}
    try {
      const savedFactRaw = localStorage.getItem(`store-facturacion-config:${selectedStoreId}`);
      if (savedFactRaw) {
        const savedFact = JSON.parse(savedFactRaw) as {
          company?: string;
          address?: string;
          country?: string;
          city?: string;
          postalCode?: string;
          phone?: string;
          taxId?: string;
          email?: string;
          prefix?: string;
          fiscalCountry?: string;
        };
        setBillingCompany(String(savedFact.company || ""));
        setBillingAddress(String(savedFact.address || ""));
        setBillingCountry(String(savedFact.country || ""));
        setBillingCity(String(savedFact.city || ""));
        setBillingPostalCode(String(savedFact.postalCode || ""));
        setBillingPhone(String(savedFact.phone || ""));
        setBillingTaxId(String(savedFact.taxId || ""));
        setBillingEmail(String(savedFact.email || ""));
        setBillingPrefix(String(savedFact.prefix || "DEM - 2026 -"));
        setBillingFiscalCountry(String(savedFact.fiscalCountry || ""));
      }
    } catch {}

    (async () => {
      try {
        const [bootstrapRes, billingRes] = await Promise.all([
          fetch(`http://localhost:3001/stores/${selectedStoreId}/bootstrap`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`http://localhost:3001/stores/${selectedStoreId}/billing-profile`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);
        const data = await bootstrapRes.json();
        const billingData = await billingRes.json().catch(() => ({}));
        if (!bootstrapRes.ok) return;
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
          logoUrl: toAbsoluteLogoUrl(store?.logoUrl) || prev.logoUrl,
          themeColor: store?.themeColor ? String(store.themeColor) : prev.themeColor,
          baseCurrencyCode: String(store?.baseCurrencyCode || prev.baseCurrencyCode),
          salesCountryCodes: countryCodes,
          marketplaces: channels.map((c: { name?: string }) => String(c.name || "")).filter(Boolean),
          warehouses: warehouses
            .map((w: { code?: string; name?: string }) => normalizeWarehouseLabel(String(w.code || w.name || "")))
            .filter(isVisibleWarehouseLabel),
        }));
        const baseCurrencyBoot = String(store?.baseCurrencyCode || "").trim().toUpperCase();
        if (baseCurrencyBoot) setSelectedBaseCurrency(baseCurrencyBoot);
        const billingProfile = billingData?.profile || null;
        if (billingProfile) {
          setBillingCompany(String(billingProfile.companyName || ""));
          setBillingAddress(String(billingProfile.fiscalAddress || ""));
          setBillingCountry(String(billingProfile.countryCode || ""));
          setBillingCity(String(billingProfile.city || ""));
          setBillingPostalCode(String(billingProfile.postalCode || ""));
          setBillingPhone(String(billingProfile.phone || ""));
          setBillingTaxId(String(billingProfile.taxId || ""));
          setBillingEmail(String(billingProfile.billingEmail || ""));
          setBillingPrefix(String(billingProfile.invoicePrefix || "DEM - 2026 -"));
          setBillingFiscalCountry(String(billingProfile.fiscalCountry || ""));
        } else if (store?.invoicePrefix) {
          setBillingPrefix(String(store.invoicePrefix));
        }
        const incomingThemeColor = String(store?.themeColor || "").trim();
        if (/^#[0-9A-Fa-f]{6}$/.test(incomingThemeColor)) {
          const normalizedColor = incomingThemeColor.toUpperCase();
          setBrandColors([normalizedColor]);
          setSelectedBrandColor(normalizedColor);
        }
        const bootFiscal = String(store?.fiscalCountryCode || "").trim().toUpperCase();
        if (bootFiscal) {
          setFiscalCountry(bootFiscal);
        } else if (countryCodes[0]) {
          setFiscalCountry(countryCodes[0]);
        }
        if (countryCodes.length) {
          setCountryRows((prev) =>
            prev.map((row) => ({ ...row, active: countryCodes.includes(row.id) }))
          );
        }
        if (channels.length && !hasSavedCanalesRef.current) {
          setMarketplaceRows(
            sanitizeMarketplaceRows(channels.map((c: { name?: string }, idx: number) => ({
              id: `${idx}-${String(c.name || "").toLowerCase()}`,
              label: String(c.name || "Canal"),
              active: true,
            })))
          );
        }
        if (warehouses.length && !hasSavedWarehousesRef.current) {
          const incomingWarehouses = sanitizeWarehouseRows(
            warehouses.map((w: { code?: string; name?: string }, idx: number) => ({
              id: `${idx}-${normalizeWarehouseLabel(String(w.code || w.name || "WH")).toLowerCase()}`,
              label: normalizeWarehouseLabel(String(w.code || w.name || "WH")),
              active: true,
            }))
          );
          const hasEsSeg = incomingWarehouses.some((w) => String(w.label).trim().toUpperCase() === "ES-SEG");
          setWarehouseRows(hasEsSeg ? incomingWarehouses : [{ id: "es-seg", label: "ES-SEG", active: true }, ...incomingWarehouses]);
        }
      } catch {}
    })();
  }, [router, storeName]);

  useEffect(() => {
    const from = String(selectedAdditionalCurrency || "").toUpperCase();
    const to = String(selectedBaseCurrency || "").toUpperCase();

    if (exchangeMode !== "api" || !from || !to) {
      setFxApiRate(null);
      setFxError("");
      return;
    }
    if (from === to) {
      setFxApiRate(1);
      setFxError("");
      return;
    }

    const token = requireTokenOrRedirect();
    if (!token) return;
    const selectedStoreId = localStorage.getItem("selectedStoreId");
    if (!selectedStoreId) return;

    let cancelled = false;
    (async () => {
      try {
        setFxLoading(true);
        setFxError("");
        const res = await fetch(
          `http://localhost:3001/stores/${selectedStoreId}/fx-rate?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(String(data?.error || `status ${res.status}`));
        if (cancelled) return;
        const rate = Number(data?.rate);
        setFxApiRate(Number.isFinite(rate) && rate > 0 ? rate : null);
      } catch (err: unknown) {
        if (cancelled) return;
        setFxApiRate(null);
        setFxError(err instanceof Error ? err.message : "No se pudo obtener tipo de cambio");
      } finally {
        if (!cancelled) setFxLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [exchangeMode, selectedAdditionalCurrency, selectedBaseCurrency]);

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
  const invoiceDateShort = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(now);
  const invoiceNumberPreview = `${billingPrefix || "DEM-2026-"}000001`;
  const invoiceCurrency = selectedBaseCurrency || profile.baseCurrencyCode || "EUR";
  const currencySymbolByCode: Record<string, string> = {
    EUR: "€",
    USD: "$",
    PEN: "S/",
    CNY: "¥",
    TRY: "₺",
    PLN: "zł",
  };
  const invoiceSymbol = currencySymbolByCode[invoiceCurrency] || invoiceCurrency;
  const sampleInvoiceItems = [
    { description: "Item 1", price: 30, qty: 1 },
    { description: "Item 2", price: 40, qty: 1 },
    { description: "Item 3", price: 20, qty: 1 },
    { description: "Item 4", price: 60, qty: 1 },
  ];
  const previewSubtotal = sampleInvoiceItems.reduce((sum, item) => sum + item.price * item.qty, 0);
  const taxMatch = String(fiscalCountryTax || "").match(/(\d+(?:[.,]\d+)?)/);
  const previewTaxPercent = taxMatch ? Number(String(taxMatch[1]).replace(",", ".")) : 21;
  const previewTaxAmount = Number((previewSubtotal * (previewTaxPercent / 100)).toFixed(2));
  const previewTotal = Number((previewSubtotal + previewTaxAmount).toFixed(2));

  const activeItem = useMemo(
    () => {
      if (activeKey.startsWith("warehouse-")) {
        const distribution = activeKey.endsWith("-distribution");
        const warehouseId = activeKey.replace(/^warehouse-/, "").replace(/-distribution$/, "");
        const row = warehouseRows.find((item) => item.id === warehouseId);
        if (row) {
          return {
            key: activeKey,
            label: row.label,
            warehouseCode: row.label,
            warehouseView: distribution ? "distribution" : "info",
          } as MenuItem;
        }
      }
      return menu.find((item) => item.key === activeKey) || menu[0];
    },
    [activeKey, warehouseRows]
  );
  const activeWarehouseCode = useMemo(() => {
    if (activeItem.warehouseCode) return activeItem.warehouseCode;
    if (activeKey === "es-seg" || activeKey === "es-seg-info" || activeKey === "es-seg-distribution" || activeKey === "almacenes-mapa") {
      return "ES-SEG";
    }
    return "";
  }, [activeItem, activeKey]);
  const activeWarehouseRow = useMemo(
    () => warehouseRows.find((row) => row.label === activeWarehouseCode) || null,
    [warehouseRows, activeWarehouseCode]
  );
  const activeWarehouseMenuKey = activeWarehouseRow ? `warehouse-${activeWarehouseRow.id}` : "es-seg";

  useEffect(() => {
    if (typeof window === "undefined" || !activeWarehouseCode) return;
    const selectedStoreId = localStorage.getItem("selectedStoreId");
    if (!selectedStoreId) return;
    const baseProfile = buildDefaultWarehouseProfile(activeWarehouseCode, activeWarehouseRow?.name || activeWarehouseCode);
    setWarehouseProfile((prev) => ({
      ...baseProfile,
      address: activeWarehouseCode === "ES-SEG" ? "Polígono Industrial, Nave 8" : baseProfile.address,
      reference: activeWarehouseCode === "ES-SEG" ? "Zona logística norte" : baseProfile.reference,
      managerName: activeWarehouseCode === "ES-SEG" ? "Responsable almacén" : baseProfile.managerName,
      phone: activeWarehouseCode === "ES-SEG" ? "+34 900 000 000" : baseProfile.phone,
      email: activeWarehouseCode === "ES-SEG" ? "warehouse.seg@demarca.local" : baseProfile.email,
      ...prev,
      code: activeWarehouseCode,
      name: activeWarehouseRow?.name || prev.name || baseProfile.name,
      countryCode: activeWarehouseRow?.countryCode || prev.countryCode || baseProfile.countryCode,
      city: activeWarehouseRow?.city || prev.city || baseProfile.city,
      color: activeWarehouseRow?.color || prev.color || baseProfile.color,
      description: activeWarehouseRow?.description || prev.description || baseProfile.description,
      type: (activeWarehouseRow?.type as WarehouseProfile["type"]) || prev.type || baseProfile.type,
      status: (activeWarehouseRow?.status as WarehouseProfile["status"]) || prev.status || baseProfile.status,
    }));
    try {
      const raw = localStorage.getItem(`warehouse-profile:${selectedStoreId}:${activeWarehouseCode}`);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<WarehouseProfile>;
        setWarehouseProfile((prev) => ({
          ...prev,
          ...parsed,
          code: activeWarehouseCode,
        }));
      }
    } catch {}
    try {
      const rawLayout = localStorage.getItem(`warehouse-layout:${selectedStoreId}:${activeWarehouseCode}`);
      if (rawLayout) {
        const parsedLayout = JSON.parse(rawLayout) as WarehouseLayoutEntry[];
        if (Array.isArray(parsedLayout) && parsedLayout.length) {
          setWarehouseLayout(parsedLayout);
          return;
        }
      }
      setWarehouseLayout(buildDefaultWarehouseLayout());
    } catch {
      setWarehouseLayout(buildDefaultWarehouseLayout());
    }
  }, [activeWarehouseCode, activeWarehouseRow]);

  function toggleCountry(id: string) {
    if (!profileEditable) return;
    setCountryRows((prev) => {
      const next = prev.map((item) => (item.id === id ? { ...item, active: !item.active } : item));
      const activeCodes = next.filter((item) => item.active).map((item) => item.id);
      setProfile((profilePrev) => ({ ...profilePrev, salesCountryCodes: activeCodes }));
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

  function addMarketplaceByValue(rawValue: string, force = false) {
    if (!profileEditable && !force) return false;
    const value = rawValue.trim();
    if (!value) return;
    const id = value.toLowerCase().replace(/\s+/g, "-");
    setMarketplaceRows((prev) => {
      const existingIdx = prev.findIndex((item) => item.id === id || item.label.toLowerCase() === value.toLowerCase());
      let next: ToggleItem[];
      if (existingIdx >= 0) {
        next = prev.map((item, idx) => (idx === existingIdx ? { ...item, active: true } : item));
      } else {
        next = [...prev, { id, label: value, active: true }];
      }
      setProfile((profilePrev) => ({
        ...profilePrev,
        marketplaces: next.filter((item) => item.active).map((item) => item.label),
      }));
      return next;
    });
    return true;
  }

  function addMarketplace() {
    const added = addMarketplaceByValue(newMarketplaceLabel);
    if (!added) return;
    setNewMarketplaceLabel("");
  }

  function addWarehouse() {
    if (!profileEditable) return;
    const value = normalizeWarehouseLabel(newWarehouseLabel);
    if (!value) return;
    if (!isVisibleWarehouseLabel(value)) return;
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

  function createWarehouseFromForm() {
    const selectedStoreId = typeof window !== "undefined" ? localStorage.getItem("selectedStoreId") : null;
    const code = normalizeWarehouseLabel(newWarehouseProfile.code);
    const name = String(newWarehouseProfile.name || "").trim();
    if (!selectedStoreId) return;
    if (!code || !name) {
      setWarehouseCreateError("Completa código y nombre del almacén.");
      setWarehouseCreateOk("");
      return;
    }
    const id = code.toLowerCase().replace(/\s+/g, "-");
    if (warehouseRows.some((row) => row.id === id || row.label === code)) {
      setWarehouseCreateError("Ese almacén ya existe.");
      setWarehouseCreateOk("");
      return;
    }
    const nextProfile: WarehouseProfile = {
      ...buildDefaultWarehouseProfile(code, name),
      ...newWarehouseProfile,
      code,
      name,
    };
    const nextRow: ToggleItem = {
      id,
      label: code,
      active: true,
      name: nextProfile.name,
      type: nextProfile.type,
      status: nextProfile.status,
      countryCode: nextProfile.countryCode,
      city: nextProfile.city,
      color: nextProfile.color,
      description: nextProfile.description,
    };
    const nextRows = sanitizeWarehouseRows([...warehouseRows, nextRow]);
    setWarehouseRows(nextRows);
    setProfile((prev) => ({
      ...prev,
      warehouses: nextRows.filter((row) => row.active).map((row) => row.label),
    }));
    localStorage.setItem(`store-warehouses-config:${selectedStoreId}`, JSON.stringify(nextRows));
    localStorage.setItem(
      `warehouse-profile:${selectedStoreId}:${code}`,
      JSON.stringify({ ...nextProfile, savedAt: new Date().toISOString() })
    );
    localStorage.setItem(`warehouse-layout:${selectedStoreId}:${code}`, JSON.stringify(buildDefaultWarehouseLayout()));
    setWarehouseCreateError("");
    setWarehouseCreateOk(`Almacén ${code} creado correctamente.`);
    setWarehouseProfile(nextProfile);
    setWarehouseLayout(buildDefaultWarehouseLayout());
    setWarehouseTab("info");
    setWarehouseEditable(false);
    setNewWarehouseProfile(buildDefaultWarehouseProfile("ES-NEW", "Nuevo almacén"));
    activateDashboardMenu(`warehouse-${id}`);
  }

  async function saveGeneralProfile() {
    if (!profileEditable || generalSaving) return;
    const token = requireTokenOrRedirect();
    if (!token) return;
    const selectedStoreId = localStorage.getItem("selectedStoreId");
    if (!selectedStoreId) return;

    try {
      setGeneralSaveError("");
      setGeneralSaveOk("");
      setGeneralSaving(true);

      const res = await fetch(`${API_BASE}/stores/${selectedStoreId}/profile`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: profile.name?.trim(),
          description: profile.description?.trim(),
          logoUrl: toApiLogoPath(profile.logoUrl),
          themeColor: selectedBrandColor || brandColors[0] || null,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        store?: { name?: string; description?: string | null; logoUrl?: string | null; themeColor?: string | null };
      };
      if (!res.ok) {
        if (res.status === 401) {
          logout();
          return;
        }
        throw new Error(payload.error || "No se pudo guardar la información general.");
      }

      const updatedName = String(payload.store?.name || profile.name).trim();
      const updatedDescription = String(payload.store?.description || profile.description).trim();
      const updatedLogo = toAbsoluteLogoUrl(payload.store?.logoUrl) || profile.logoUrl;
      const updatedTheme = String(payload.store?.themeColor || selectedBrandColor || "").trim().toUpperCase();

      setProfile((prev) => ({
        ...prev,
        name: updatedName,
        description: updatedDescription,
        logoUrl: updatedLogo,
        themeColor: updatedTheme || prev.themeColor,
      }));
      if (updatedTheme) {
        setBrandColors([updatedTheme]);
        setSelectedBrandColor(updatedTheme);
      }

      try {
        const storesRaw = localStorage.getItem("stores");
        const currentStoreId = localStorage.getItem("selectedStoreId");
        if (storesRaw && currentStoreId) {
          const rows = JSON.parse(storesRaw) as Array<{ storeId: string; storeName: string }>;
          const nextRows = rows.map((row) => (row.storeId === currentStoreId ? { ...row, storeName: updatedName } : row));
          localStorage.setItem("stores", JSON.stringify(nextRows));
        }
      } catch {}

      setProfileEditable(false);
      setGeneralSaveOk("Información general guardada.");
    } catch (err) {
      setGeneralSaveError(err instanceof Error ? err.message : "Error al guardar.");
    } finally {
      setGeneralSaving(false);
    }
  }

  async function handleProfileLogoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setLogoUploadError("");
    if (!file.type.startsWith("image/")) {
      setLogoUploadError("Solo se permiten imágenes.");
      event.target.value = "";
      return;
    }

    const token = requireTokenOrRedirect();
    if (!token) return;

    try {
      setLogoUploading(true);
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
        reader.readAsDataURL(file);
      });

      const res = await fetch(`${API_BASE}/uploads/store-logo`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ dataUrl }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string; path?: string };
      if (!res.ok) {
        if (res.status === 401) {
          logout();
          return;
        }
        throw new Error(payload.error || "No se pudo subir el logo.");
      }
      const nextUrl = payload.path ? toAbsoluteLogoUrl(payload.path) : "";
      if (!nextUrl) throw new Error("No se recibió ruta de logo.");
      setProfile((prev) => ({ ...prev, logoUrl: nextUrl }));
    } catch (err) {
      setLogoUploadError(err instanceof Error ? err.message : "Error al subir logo.");
    } finally {
      setLogoUploading(false);
      event.target.value = "";
    }
  }

  async function saveCountriesProfile() {
    if (!profileEditable || countriesSaving) return;
    const token = requireTokenOrRedirect();
    if (!token) return;
    const selectedStoreId = localStorage.getItem("selectedStoreId");
    if (!selectedStoreId) return;

    try {
      setCountriesSaveError("");
      setCountriesSaveOk("");
      setCountriesSaving(true);

      const res = await fetch(`${API_BASE}/stores/${selectedStoreId}/profile`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fiscalCountryCode: fiscalCountry,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string; store?: { fiscalCountryCode?: string | null } };
      if (!res.ok) {
        if (res.status === 401) {
          logout();
          return;
        }
        throw new Error(payload.error || "No se pudo guardar países.");
      }
      const nextFiscal = String(payload.store?.fiscalCountryCode || "").trim().toUpperCase();
      if (nextFiscal) setFiscalCountry(nextFiscal);

      setProfileEditable(false);
      setCountriesSaveOk("País base fiscal guardado.");
    } catch (err) {
      setCountriesSaveError(err instanceof Error ? err.message : "Error al guardar.");
    } finally {
      setCountriesSaving(false);
    }
  }

  async function saveMonedasProfile() {
    if (!profileEditable || monedasSaving) return;
    const selectedStoreId = localStorage.getItem("selectedStoreId");
    if (!selectedStoreId) return;

    try {
      setMonedasSaveError("");
      setMonedasSaveOk("");
      setMonedasSaving(true);

      if (!selectedBaseCurrency) {
        throw new Error("Selecciona la moneda base de la tienda.");
      }

      if (usesMultipleCurrencies && !selectedAdditionalCurrency) {
        throw new Error("Selecciona una moneda adicional.");
      }

      let rateToSave: number | null = null;
      if (selectedAdditionalCurrency) {
        if (exchangeMode === "api") {
          if (!fxApiRate || !Number.isFinite(fxApiRate) || fxApiRate <= 0) {
            throw new Error("No hay tipo de cambio automático disponible para guardar.");
          }
          rateToSave = fxApiRate;
        } else {
          const parsedManualRate = Number(fxManualRate);
          if (!Number.isFinite(parsedManualRate) || parsedManualRate <= 0) {
            throw new Error("Ingresa una tasa manual válida mayor a 0.");
          }
          rateToSave = parsedManualRate;
        }
      }

      const profileKey = `store-monedas-config:${selectedStoreId}`;
      const pairKey = `store-fx-last-rate:${selectedStoreId}:${selectedAdditionalCurrency || "NA"}:${selectedBaseCurrency}`;
      const prevRateRaw = localStorage.getItem(pairKey);
      const prevRate = prevRateRaw ? Number(prevRateRaw) : null;

      if (notifyFxChange && rateToSave && prevRate && Number.isFinite(prevRate) && prevRate > 0) {
        const threshold = Number(fxThresholdPercent);
        if (!Number.isFinite(threshold) || threshold <= 0) {
          throw new Error("Ingresa un porcentaje válido para la alerta de variación.");
        }
        const deltaPercent = Math.abs(((rateToSave - prevRate) / prevRate) * 100);
        if (deltaPercent > threshold) {
          setMonedasSaveOk(
            `Guardado con alerta: variación ${deltaPercent.toFixed(2)}% (umbral ${threshold.toFixed(2)}%).`
          );
        } else {
          setMonedasSaveOk("Configuración de monedas guardada.");
        }
      } else {
        setMonedasSaveOk("Configuración de monedas guardada.");
      }

      localStorage.setItem(
        profileKey,
        JSON.stringify({
          baseCurrencyCode: selectedBaseCurrency,
          additionalCurrencyCode: selectedAdditionalCurrency || null,
          usesMultipleCurrencies,
          exchangeMode,
          notifyFxChange,
          notifyThresholdPercent: fxThresholdPercent,
          manualRate: fxManualRate || null,
          savedAt: new Date().toISOString(),
        })
      );
      if (rateToSave) localStorage.setItem(pairKey, String(rateToSave));

      setProfile((prev) => ({
        ...prev,
        baseCurrencyCode: selectedBaseCurrency,
      }));
      setProfileEditable(false);
    } catch (err) {
      setMonedasSaveError(err instanceof Error ? err.message : "Error al guardar.");
    } finally {
      setMonedasSaving(false);
    }
  }

  async function saveFacturacionProfile() {
    if (!profileEditable || factSaving) return;
    const token = requireTokenOrRedirect();
    if (!token) return;
    const selectedStoreId = localStorage.getItem("selectedStoreId");
    if (!selectedStoreId) return;
    try {
      setFactSaveError("");
      setFactSaveOk("");
      setFactSaving(true);

      const res = await fetch(`${API_BASE}/stores/${selectedStoreId}/billing-profile`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          companyName: billingCompany,
          fiscalAddress: billingAddress,
          countryCode: billingCountry || null,
          city: billingCity,
          postalCode: billingPostalCode,
          phone: billingPhone,
          taxId: billingTaxId,
          billingEmail: billingEmail,
          invoicePrefix: billingPrefix,
          fiscalCountry: billingFiscalCountry || null,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        if (res.status === 401) {
          logout();
          return;
        }
        if (res.status === 404) {
          throw new Error("No se encontró endpoint de facturación (404). Reinicia API y aplica migraciones.");
        }
        if (res.status === 403) {
          throw new Error(payload.error || "No tienes permisos para guardar facturación (403).");
        }
        throw new Error(payload.error || `No se pudo guardar facturación (status ${res.status}).`);
      }

      localStorage.setItem(
        `store-facturacion-config:${selectedStoreId}`,
        JSON.stringify({
          company: billingCompany,
          address: billingAddress,
          country: billingCountry,
          city: billingCity,
          postalCode: billingPostalCode,
          phone: billingPhone,
          taxId: billingTaxId,
          email: billingEmail,
          prefix: billingPrefix,
          fiscalCountry: billingFiscalCountry,
          savedAt: new Date().toISOString(),
        })
      );

      setProfileEditable(false);
      setFactSaveOk("Datos de facturación guardados.");
    } catch (err) {
      setFactSaveError(err instanceof Error ? err.message : "Error al guardar.");
    } finally {
      setFactSaving(false);
    }
  }

  async function saveAlmacenesProfile() {
    if (!profileEditable || almacenesSaving) return;
    const selectedStoreId = localStorage.getItem("selectedStoreId");
    if (!selectedStoreId) return;
    try {
      setAlmacenesSaveError("");
      setAlmacenesSaveOk("");
      setAlmacenesSaving(true);

      const rowsToSave = sanitizeWarehouseRows(warehouseRows);
      localStorage.setItem(`store-warehouses-config:${selectedStoreId}`, JSON.stringify(rowsToSave));

      setProfile((prev) => ({
        ...prev,
        warehouses: rowsToSave.filter((row) => row.active).map((row) => row.label),
      }));
      setProfileEditable(false);
      setAlmacenesSaveOk("Almacenes guardados.");
    } catch (err) {
      setAlmacenesSaveError(err instanceof Error ? err.message : "Error al guardar.");
    } finally {
      setAlmacenesSaving(false);
    }
  }

  async function saveCanalesProfile() {
    if (!profileEditable || canalesSaving) return;
    const selectedStoreId = localStorage.getItem("selectedStoreId");
    if (!selectedStoreId) return;
    try {
      setCanalesSaveError("");
      setCanalesSaveOk("");
      setCanalesSaving(true);

      const rowsToSave = sanitizeMarketplaceRows(marketplaceRows);
      localStorage.setItem(`store-marketplaces-config:${selectedStoreId}`, JSON.stringify(rowsToSave));

      setProfile((prev) => ({
        ...prev,
        marketplaces: rowsToSave.filter((row) => row.active).map((row) => row.label),
      }));
      setProfileEditable(false);
      setCanalesSaveOk("Canales guardados.");
    } catch (err) {
      setCanalesSaveError(err instanceof Error ? err.message : "Error al guardar.");
    } finally {
      setCanalesSaving(false);
    }
  }

  const frameSrc = activeItem.path ? `${activeItem.path}?embed=demarca` : "";
  const currentLogoSrc = profile.logoUrl || "/branding/logo_demarca02.png";
  const isRemoteLogo = /^https?:\/\//.test(currentLogoSrc);
  const canAddBrandColor = brandColors.length < MAX_EXTRA_BRAND_COLORS;
  const menuIndentAt = (index: number) => Number(menu[index]?.indent || 0);
  const menuHasChildren = (index: number) => menuIndentAt(index + 1) > menuIndentAt(index);
  const menuHiddenByCollapsedAncestor = (index: number) => {
    const currentIndent = menuIndentAt(index);
    if (currentIndent <= 0) return false;
    let ancestorIndent = currentIndent;
    for (let i = index - 1; i >= 0; i -= 1) {
      const candidateIndent = menuIndentAt(i);
      if (candidateIndent < ancestorIndent) {
        if (collapsedSections[menu[i].key]) return true;
        ancestorIndent = candidateIndent;
        if (ancestorIndent === 0) break;
      }
    }
    return false;
  };

  function activateDashboardMenu(nextKey: string) {
    if (nextKey.startsWith("warehouse-")) {
      const isDistribution = nextKey.endsWith("-distribution");
      setWarehouseTab(isDistribution ? "distribution" : "info");
      setActiveKey(nextKey);
      setShowStoreProfile(false);
      return;
    }
    if (nextKey === "es-seg" || nextKey === "es-seg-info") {
      setWarehouseTab("info");
      setActiveKey(nextKey);
      setShowStoreProfile(false);
      return;
    }
    if (nextKey === "es-seg-distribution") {
      setWarehouseTab("distribution");
      setActiveKey(nextKey);
      setShowStoreProfile(false);
      return;
    }
    setActiveKey(nextKey);
    setShowStoreProfile(false);
  }

  return (
    <main suppressHydrationWarning className={`${headingFont.variable} ${bodyFont.variable} h-screen overflow-hidden bg-[#DADCE0] p-6`}>
      <div suppressHydrationWarning className="mx-auto flex h-full max-w-[1520px] gap-4">
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
                <button
                  type="button"
                  className={`flex items-center gap-1.5 text-[12px] uppercase tracking-wide ${
                    showStoreProfile ? "text-[#7075FF]" : "text-[#6D748A]"
                  }`}
                  style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}
                  onClick={() => setStoreSectionCollapsed((prev) => !prev)}
                >
                  <span>TIENDA</span>
                  <svg
                    viewBox="0 0 20 20"
                    className={`h-3 w-3 fill-current transition-transform ${storeSectionCollapsed ? "-rotate-90" : ""}`}
                  >
                    <path d="M5 7l5 6 5-6H5z" />
                  </svg>
                </button>
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
              {!storeSectionCollapsed ? (
                <div className="mt-2">
                  {isRemoteLogo ? (
                    <img
                      src={currentLogoSrc}
                      alt={profile.name || storeName.replace(/\.$/, "") || "demarca"}
                      className="h-auto w-[176px] object-contain"
                    />
                  ) : (
                    <Image
                      src={currentLogoSrc}
                      alt={profile.name || storeName.replace(/\.$/, "") || "demarca"}
                      width={176}
                      height={46}
                      className="h-auto w-[176px] object-contain"
                      priority
                    />
                  )}
                </div>
              ) : null}

              <button
                type="button"
                className="mt-5 flex items-center gap-1.5 text-[12px] uppercase tracking-wide text-[#6D748A]"
                style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}
                onClick={() => setMenuSectionCollapsed((prev) => !prev)}
              >
                <span>Menu</span>
                <svg
                  viewBox="0 0 20 20"
                  className={`h-3 w-3 fill-current transition-transform ${menuSectionCollapsed ? "-rotate-90" : ""}`}
                >
                  <path d="M5 7l5 6 5-6H5z" />
                </svg>
              </button>

              {!menuSectionCollapsed ? (
              <div className="mt-3 space-y-1.5">
                {menu.map((item, index) => {
                  if (menuHiddenByCollapsedAncestor(index)) return null;
                  const active = activeKey === item.key;
                  const indent = item.indent ? item.indent * 16 : 0;
                  const hasChildren = menuHasChildren(index);
                  const isCollapsed = !!collapsedSections[item.key];
                  return (
                    <Fragment key={item.key}>
                      <button
                        type="button"
                        onClick={() => {
                        if (item.action === "logout") {
                          logout();
                          return;
                        }
                        if (!item.path && !item.emptyText && item.isGroup) return;
                        activateDashboardMenu(item.key);
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
                        <span className="flex items-center justify-between gap-2">
                          <span>{item.label}</span>
                          {hasChildren ? (
                            <span
                              role="button"
                              aria-label={isCollapsed ? "Expandir" : "Contraer"}
                              className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
                                active ? "text-white/90 hover:bg-white/20" : "text-[#6A7288] hover:bg-[#E5E9F1]"
                              }`}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setCollapsedSections((prev) => ({ ...prev, [item.key]: !prev[item.key] }));
                              }}
                            >
                              {isCollapsed ? (
                                <svg viewBox="0 0 20 20" className="h-3 w-3 fill-current">
                                  <path d="M7 5l6 5-6 5V5z" />
                                </svg>
                              ) : (
                                <svg viewBox="0 0 20 20" className="h-3 w-3 fill-current">
                                  <path d="M5 7l5 6 5-6H5z" />
                                </svg>
                              )}
                            </span>
                          ) : null}
                        </span>
                      </button>
                      {item.key === "almacenes-lista" && !isCollapsed
                        ? warehouseRows
                            .filter((row) => isVisibleWarehouseLabel(row.label))
                            .map((row) => {
                              const rowActive = activeKey === `warehouse-${row.id}`;
                              const distributionActive = activeKey === `warehouse-${row.id}-distribution`;
                              return (
                                <Fragment key={`warehouse-menu-${row.id}`}>
                                  <button
                                    type="button"
                                    onClick={() => activateDashboardMenu(`warehouse-${row.id}`)}
                                    className={`w-full rounded-full px-4 py-2 text-left text-[13px] transition ${
                                      rowActive ? "bg-[#0B1230] text-white" : "text-[#3A425A] hover:bg-[#EFF1F5]"
                                    }`}
                                    style={{
                                      fontFamily: "var(--font-dashboarddemarca-body)",
                                      paddingLeft: "48px",
                                    }}
                                  >
                                    {row.label}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => activateDashboardMenu(`warehouse-${row.id}-distribution`)}
                                    className={`w-full rounded-full px-4 py-2 text-left text-[13px] transition ${
                                      distributionActive ? "bg-[#0B1230] text-white" : "text-[#3A425A] hover:bg-[#EFF1F5]"
                                    }`}
                                    style={{
                                      fontFamily: "var(--font-dashboarddemarca-body)",
                                      paddingLeft: "64px",
                                    }}
                                  >
                                    Distribución de almacén
                                  </button>
                                </Fragment>
                              );
                            })
                        : null}
                    </Fragment>
                  );
                })}
              </div>
              ) : null}
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
                        activateDashboardMenu(item.key);
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
                        { key: "marketplaces", label: "5. Canales" },
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
                          <button
                            type="button"
                            disabled={!profileEditable || logoUploading}
                            onClick={() => logoInputRef.current?.click()}
                            className="mt-2 flex h-[130px] w-full items-center justify-center rounded-2xl border border-dashed border-[#9AA1B2] bg-[#ECEEF1] disabled:cursor-not-allowed disabled:opacity-85"
                          >
                            {isRemoteLogo ? (
                              <img src={currentLogoSrc} alt="Logo tienda" className="h-auto w-[180px] object-contain opacity-80" />
                            ) : (
                              <Image src={currentLogoSrc} alt="Logo tienda" width={180} height={56} className="h-auto w-[180px] object-contain opacity-80" />
                            )}
                          </button>
                          <input
                            ref={logoInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleProfileLogoChange}
                          />
                          <div className="mt-2 text-[14px] text-[#7D8498]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                            {logoUploading ? "Subiendo logo..." : "Click para reemplazar logo"}
                          </div>
                          {logoUploadError ? (
                            <div className="mt-1 text-[13px] text-[#C0392B]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                              {logoUploadError}
                            </div>
                          ) : null}

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
                              <div key={`${color}-${idx}`} className="relative">
                                <button
                                  type="button"
                                  disabled={!profileEditable}
                                  className={`h-11 w-11 rounded-full disabled:cursor-not-allowed disabled:opacity-75 ${selectedBrandColor === color ? "ring-2 ring-[#1B2140] ring-offset-2 ring-offset-[#E6E8EA]" : ""}`}
                                  style={{ backgroundColor: color }}
                                  onClick={() => {
                                    if (!profileEditable) return;
                                    setSelectedBrandColor(color);
                                    setEditingColorIndex(idx);
                                    if (colorPickerRef.current) {
                                      colorPickerRef.current.value = color;
                                      colorPickerRef.current.click();
                                    }
                                  }}
                                />
                                {profileEditable ? (
                                  <span
                                    className="absolute -right-1 -top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#E3E5EA] text-[12px] font-semibold text-[#5D6477] hover:bg-[#D3D7E2]"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setBrandColors((prev) => {
                                        const next = prev.filter((_, i) => i !== idx);
                                        if (!next.includes(selectedBrandColor)) {
                                          setSelectedBrandColor(next[0] || "#6456DF");
                                        }
                                        return next;
                                      });
                                    }}
                                  >
                                    x
                                  </span>
                                ) : null}
                              </div>
                            ))}
                            <button
                              type="button"
                              disabled={!profileEditable}
                              className={`flex h-11 w-11 items-center justify-center rounded-full border border-dashed text-[32px] disabled:opacity-55 ${canAddBrandColor ? "border-[#7B818F] text-[#2A3146]" : "border-[#B4BAC8] text-[#9CA3B4]"}`}
                              onClick={() => {
                                if (!profileEditable) return;
                                if (!canAddBrandColor) return;
                                setEditingColorIndex(null);
                                colorPickerRef.current?.click();
                              }}
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
                                    return prev.map((item, i) => (i === editingColorIndex ? color : item));
                                  }
                                  if (prev.length >= MAX_EXTRA_BRAND_COLORS) return prev;
                                  return prev.includes(color) ? prev : [...prev, color];
                                });
                                setSelectedBrandColor(color);
                                setEditingColorIndex(null);
                              }}
                            />
                          </div>
                        </div>

                        <div>
                          <div className="text-[16px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>País base fiscal</div>
                          <input
                            readOnly
                            value={fiscalCountryLabel}
                            className="mt-2 h-[52px] w-full cursor-not-allowed rounded-full border-none bg-[#F3F4F6] px-5 text-[16px] text-[#8B90A0] outline-none"
                          />

                          <div className="mt-6 text-[16px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Moneda base de la tienda</div>
                          <input
                            readOnly
                            value={selectedBaseCurrency || profile.baseCurrencyCode || "EUR"}
                            className="mt-2 h-[52px] w-full cursor-not-allowed rounded-full border-none bg-[#F3F4F6] px-5 text-[16px] text-[#8B90A0] outline-none"
                          />

                          <div className="mt-6 text-[16px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Países donde vende esta tienda</div>
                          <div className="mt-4 grid grid-cols-2 gap-2.5">
                            {countryRows
                              .filter((row) => row.active)
                              .map((row) => (
                                <div
                                  key={row.id}
                                  className="flex h-[40px] cursor-not-allowed items-center justify-between rounded-full bg-[#F3F4F6] px-4 text-[14px] text-[#8B90A0]"
                                  style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}
                                >
                                  <span>{countryLabelWithFlag(row.id, row.label, facturacionCountryOptions)}</span>
                                  <span className="h-5 w-5 rounded-full bg-[#D7D9DE]" />
                                </div>
                              ))}
                          </div>
                        </div>

                        <div>
                          <div className="text-[16px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Canales activos</div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            {marketplaceRows.map((mk) => (
                              <div
                                key={mk.id}
                                className="flex h-[40px] cursor-not-allowed items-center justify-between rounded-full bg-[#F3F4F6] px-4 text-[14px] text-[#8B90A0]"
                                style={{ minWidth: "120px", fontFamily: "var(--font-dashboarddemarca-body)" }}
                              >
                                <span>{mk.label}</span>
                                <span className="ml-3 flex items-center">
                                  <span className="h-5 w-5 rounded-full bg-[#D7D9DE]" />
                                </span>
                              </div>
                            ))}
                          </div>

                          <div className="mt-6 text-[16px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Almacenes activos</div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            {Array.from(
                              new Set(
                                (profile.warehouses || [])
                                  .map((label) => normalizeWarehouseLabel(String(label || "")))
                                  .filter(isVisibleWarehouseLabel)
                              )
                            ).map((label) => (
                              <div
                                key={`general-wh-${label}`}
                                className="flex h-[40px] cursor-not-allowed items-center justify-between rounded-full bg-[#F3F4F6] px-4 text-[14px] text-[#8B90A0]"
                                style={{ minWidth: "120px", fontFamily: "var(--font-dashboarddemarca-body)" }}
                              >
                                <span>{label}</span>
                                <span className="ml-3 flex items-center">
                                  <span className="h-5 w-5 rounded-full bg-[#D7D9DE]" />
                                </span>
                              </div>
                            ))}
                          </div>

                        </div>
                        </div>
                        <div className="mt-8 flex items-center justify-end">
                          {generalSaveError ? (
                            <div className="mr-3 text-[13px] text-[#C0392B]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                              {generalSaveError}
                            </div>
                          ) : null}
                          {generalSaveOk ? (
                            <div className="mr-3 text-[13px] text-[#2B7A3D]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                              {generalSaveOk}
                            </div>
                          ) : null}
                          <button
                            type="button"
                            disabled={!profileEditable || generalSaving}
                            className="h-[50px] rounded-full bg-[#0B1230] px-8 text-[16px] text-white disabled:opacity-60"
                            style={{ fontFamily: "var(--font-dashboarddemarca-heading)" }}
                            onClick={saveGeneralProfile}
                          >
                            {generalSaving ? "Guardando..." : "Confirmar"}
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
                                  className={`flex h-[40px] items-center justify-between rounded-full px-4 text-[14px] disabled:cursor-not-allowed ${
                                    profileEditable ? "bg-white text-[#4B5369]" : "bg-[#F3F4F6] text-[#8B90A0]"
                                  }`}
                                  style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}
                                >
                                  <span>{countryLabelWithFlag(row.id, row.label, facturacionCountryOptions)}</span>
                                  <span
                                    className={`h-5 w-5 rounded-full ${
                                      profileEditable
                                        ? row.active
                                          ? "bg-[#8A76E6]"
                                          : "bg-[#D7D9DE]"
                                        : "bg-[#D7D9DE]"
                                    }`}
                                  />
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="mt-8 flex items-center justify-end">
                          {countriesSaveError ? (
                            <div className="mr-3 text-[13px] text-[#C0392B]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                              {countriesSaveError}
                            </div>
                          ) : null}
                          {countriesSaveOk ? (
                            <div className="mr-3 text-[13px] text-[#2B7A3D]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                              {countriesSaveOk}
                            </div>
                          ) : null}
                          <button
                            type="button"
                            disabled={!profileEditable || countriesSaving}
                            className="h-[50px] rounded-full bg-[#0B1230] px-8 text-[16px] text-white disabled:opacity-60"
                            style={{ fontFamily: "var(--font-dashboarddemarca-heading)" }}
                            onClick={saveCountriesProfile}
                          >
                            {countriesSaving ? "Guardando..." : "Confirmar"}
                          </button>
                        </div>
                      </>
                    ) : profileTab === "monedas" ? (
                      <>
                        <div className="pt-6 text-[15px] text-[#2F3650]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                          Define la monedas de la tienda :
                        </div>
                        <div className="mt-10 grid max-w-[560px] grid-cols-1 gap-8 text-[#2B334B]">
                          <div>
                            <div className="text-[16px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                              Moneda base de la tienda
                            </div>
                            <div className="relative mt-2">
                              <select
                                disabled={!profileEditable}
                                value={selectedBaseCurrency}
                                onChange={(e) => {
                                  const next = e.target.value;
                                  setSelectedBaseCurrency(next);
                                  setProfile((prev) => ({ ...prev, baseCurrencyCode: next }));
                                }}
                                className="h-[54px] w-full appearance-none rounded-full border-none bg-white px-5 pr-12 text-[16px] text-[#8B90A0] outline-none disabled:bg-[#F3F4F6]"
                              >
                                <option value="">Buscar moneda</option>
                                {CURRENCY_OPTIONS.map((item) => (
                                  <option key={`base-${item.code}`} value={item.code}>
                                    {item.label}
                                  </option>
                                ))}
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

                            {usesMultipleCurrencies === true ? (
                              <>
                                <div className="mt-8 text-[16px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                                  Moneda adicional
                                </div>
                                <div className="relative mt-2">
                                  <select
                                    disabled={!profileEditable}
                                    value={selectedAdditionalCurrency}
                                    onChange={(e) => setSelectedAdditionalCurrency(e.target.value)}
                                    className="h-[48px] w-full appearance-none rounded-full border-none bg-white px-5 pr-12 text-[16px] text-[#8B90A0] outline-none disabled:bg-[#F3F4F6]"
                                  >
                                    <option value="">Buscar Moneda</option>
                                    {CURRENCY_OPTIONS.map((item) => (
                                      <option key={`add-${item.code}`} value={item.code}>
                                        {item.label}
                                      </option>
                                    ))}
                                  </select>
                                  <span className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-[20px] text-[#3b4256]">▾</span>
                                </div>

                                <div className="mt-8 text-[16px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                                  ¿En qué canal usarás esta moneda adicional?
                                </div>

                                <button
                                  type="button"
                                  disabled={!profileEditable}
                                  className="mt-2 h-[46px] w-full rounded-full border-none bg-[#4449CC26] text-[16px] text-[#6142C4] disabled:opacity-70"
                                  style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}
                                  onClick={() => setShowMonedasMarketplaceForm((prev) => !prev)}
                                >
                                  + añadir canal
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
                                            className="flex h-[40px] items-center justify-between rounded-full bg-white px-4 text-[14px] text-[#4B5369] disabled:cursor-not-allowed"
                                            style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}
                                          >
                                            <span>{mk.label}</span>
                                            <span className="ml-3 flex items-center gap-2">
                                              <span className={`h-5 w-5 rounded-full ${mk.active ? "bg-[#8A76E6]" : "bg-[#D7D9DE]"}`} />
                                              {profileEditable ? (
                                                <span
                                                  className={`inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#E3E5EA] text-[12px] font-semibold text-[#5D6477] ${
                                                    profileEditable ? "hover:bg-[#D3D7E2]" : "opacity-60"
                                                  }`}
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (!profileEditable) return;
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
                                  </>
                                ) : null}
                              </>
                            ) : null}

                          </div>

                          {usesMultipleCurrencies === true ? (
                            <div>
                            <div className="text-[16px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
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
                                <div className="relative">
                                  <input
                                    disabled={!profileEditable || !notifyFxChange}
                                    value={fxThresholdPercent}
                                    onChange={(e) => {
                                      const cleaned = e.target.value.replace(/[^\d.,]/g, "").replace(",", ".");
                                      setFxThresholdPercent(cleaned);
                                    }}
                                    className="h-[44px] w-[110px] rounded-full border-none bg-white px-3 pr-8 text-center text-[14px] text-[#2B334B] outline-none disabled:bg-[#F3F4F6]"
                                    placeholder="0"
                                  />
                                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[14px] text-[#6D748A]">%</span>
                                </div>
                              </div>
                              <div className="mt-3 rounded-2xl bg-white/70 p-3 text-[14px] text-[#2B334B]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                                <div className="relative mb-2 flex items-center gap-2">
                                  <span className="text-[16px] text-[#2B334B]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                                    Simulación rápida
                                  </span>
                                  <span className="group relative inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full bg-[#E3E5EA] text-[12px] font-bold text-[#4B5369]">
                                    i
                                    <span className="pointer-events-none absolute left-1/2 top-6 z-20 hidden w-[540px] -translate-x-1/2 rounded-xl bg-[#1C233F] p-4 text-left text-[12px] font-normal leading-[1.55] text-white shadow-[0_12px_30px_rgba(0,0,0,0.25)] group-hover:block">
                                      <span className="block text-[13px] font-semibold">Simulación rápida de tipo de cambio</span>
                                      <span className="mt-2 block">Este bloque te ayuda a probar conversiones antes de guardar.</span>
                                      <span className="mt-3 block">1. Monto 100: valor de ejemplo que quieres convertir.</span>
                                      <span className="mt-1 block">2. Moneda adicional: moneda origen (por ejemplo USD).</span>
                                      <span className="mt-1 block">3. Moneda base: moneda principal de tienda (por ejemplo EUR).</span>
                                      <span className="mt-1 block">4. Resultado: cálculo en moneda base usando tasa API o tasa manual.</span>
                                      <span className="mt-3 block text-[13px] font-semibold">Ejemplo</span>
                                      <span className="mt-1 block">Moneda adicional = USD</span>
                                      <span className="block">Moneda base = EUR</span>
                                      <span className="block">Monto = 100</span>
                                      <span className="block">Tasa = 0.92</span>
                                      <span className="block">Resultado = 92 EUR</span>
                                    </span>
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span>Monto</span>
                                  <input
                                    disabled={!profileEditable}
                                    value={fxAmountOriginal}
                                    onChange={(e) => setFxAmountOriginal(e.target.value)}
                                    className="h-[34px] w-[120px] rounded-full border-none bg-white px-3 text-center text-[14px] outline-none disabled:bg-[#F3F4F6]"
                                  />
                                  <span>{selectedAdditionalCurrency || "MONEDA ADICIONAL"}</span>
                                </div>
                                <div className="mt-2">
                                  {exchangeMode === "api" ? (
                                    fxLoading ? (
                                      <span>Cargando tipo de cambio automático...</span>
                                    ) : fxError ? (
                                      <span className="text-[#C9382A]">{fxError}</span>
                                    ) : activeFxRate ? (
                                      <span>
                                        Tipo aplicado: 1 {selectedAdditionalCurrency || "MONEDA"} = {activeFxRate.toFixed(6)}{" "}
                                        {selectedBaseCurrency || "BASE"}
                                      </span>
                                    ) : (
                                      <span>Selecciona moneda base y moneda adicional.</span>
                                    )
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <span>Tasa manual</span>
                                      <input
                                        disabled={!profileEditable}
                                        value={fxManualRate}
                                        onChange={(e) => setFxManualRate(e.target.value)}
                                        placeholder="Ej: 0.92"
                                        className="h-[34px] w-[110px] rounded-full border-none bg-white px-3 text-center text-[14px] outline-none disabled:bg-[#F3F4F6]"
                                      />
                                      <span>(1 {selectedAdditionalCurrency || "MONEDA"} en {selectedBaseCurrency || "BASE"})</span>
                                    </div>
                                  )}
                                </div>
                                {fxConvertedAmount !== null ? (
                                  <div className="mt-2 font-semibold">
                                    Resultado: {fxAmountOriginal} {selectedAdditionalCurrency || "MONEDA"} = {fxConvertedAmount}{" "}
                                    {selectedBaseCurrency || "BASE"}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                            </div>
                          ) : null}
                        </div>
                        <div className="mt-8 flex items-center justify-end">
                          {monedasSaveError ? (
                            <div className="mr-3 text-[13px] text-[#C0392B]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                              {monedasSaveError}
                            </div>
                          ) : null}
                          {monedasSaveOk ? (
                            <div className="mr-3 text-[13px] text-[#2B7A3D]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                              {monedasSaveOk}
                            </div>
                          ) : null}
                          <button
                            type="button"
                            disabled={!profileEditable || monedasSaving}
                            onClick={saveMonedasProfile}
                            className="h-[50px] rounded-full bg-[#0B1230] px-8 text-[16px] text-white disabled:opacity-60"
                          >
                            {monedasSaving ? "Guardando..." : "Confirmar"}
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
                                {warehouseRows.map((row) => (
                                  <option key={`buscar-almacen-${row.id}`} value={row.id}>
                                    {row.label}
                                  </option>
                                ))}
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
                              .filter((wh) => isVisibleWarehouseLabel(wh.label))
                              .map((wh) => (
                              <button
                                key={`almacenes-${wh.id}`}
                                type="button"
                                disabled={!profileEditable}
                                onClick={() => toggleWarehouse(wh.id)}
                                className="flex h-[40px] items-center justify-between rounded-full bg-white px-4 text-[14px] text-[#4B5369] disabled:cursor-not-allowed"
                              >
                                <span>{wh.label}</span>
                                <span className="ml-3 flex items-center gap-2">
                                  <span
                                    className={`h-5 w-5 rounded-full ${
                                      profileEditable
                                        ? wh.active
                                          ? "bg-[#8A76E6]"
                                          : "bg-[#D7D9DE]"
                                        : "bg-[#D7D9DE]"
                                    }`}
                                  />
                                  {profileEditable && wh.id !== "es-seg" ? (
                                    <span
                                      className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#E3E5EA] text-[12px] font-semibold text-[#5D6477] hover:bg-[#D3D7E2]"
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
                        <div className="mt-8 flex items-center justify-end">
                          {almacenesSaveError ? (
                            <div className="mr-3 text-[13px] text-[#C0392B]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                              {almacenesSaveError}
                            </div>
                          ) : null}
                          {almacenesSaveOk ? (
                            <div className="mr-3 text-[13px] text-[#2B7A3D]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                              {almacenesSaveOk}
                            </div>
                          ) : null}
                          <button
                            type="button"
                            disabled={!profileEditable || almacenesSaving}
                            onClick={saveAlmacenesProfile}
                            className="h-[50px] rounded-full bg-[#0B1230] px-8 text-[16px] text-white disabled:opacity-60"
                          >
                            {almacenesSaving ? "Guardando..." : "Confirmar"}
                          </button>
                        </div>
                      </>
                    ) : profileTab === "marketplaces" ? (
                      <>
                        <div className="pt-6 text-[15px] text-[#2F3650]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                          Configura canales activos de la tienda.
                        </div>
                        <div className="mt-8 grid grid-cols-2 gap-8">
                          <button
                            type="button"
                            disabled={!profileEditable}
                            onClick={() => setShowMarketplacesAddForm((prev) => !prev)}
                            className="h-[46px] rounded-full bg-[#4449CC26] px-5 text-[16px] text-[#6142C4] disabled:opacity-70"
                          >
                            + añadir canales
                          </button>
                          <div className="relative">
                            <select
                              disabled={!profileEditable}
                              value={selectedMarketplaceOption}
                              onChange={(e) => {
                                const value = e.target.value;
                                setSelectedMarketplaceOption(value);
                                if (!value) return;
                                addMarketplaceByValue(value);
                                setSelectedMarketplaceOption("");
                              }}
                              className="h-[46px] w-full appearance-none rounded-full border-none bg-white px-5 pr-12 text-[16px] text-[#8B90A0] outline-none disabled:cursor-not-allowed disabled:bg-[#F3F4F6]"
                            >
                              <option value="">Buscar marketplace</option>
                              {MARKETPLACE_SEARCH_OPTIONS.map((name) => (
                                <option key={name} value={name}>
                                  {name}
                                </option>
                              ))}
                            </select>
                            <span className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-[18px] text-[#3b4256]">▾</span>
                          </div>
                          {showMarketplacesAddForm ? (
                            <div className="col-start-1 -mt-6">
                              <div className="mt-0 flex max-w-[560px] gap-2">
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
                            </div>
                          ) : null}
                          <div className="col-start-1 mt-3 flex max-w-[560px] flex-wrap gap-2">
                            {marketplaceRows.map((mk) => (
                              <button
                                key={`marketplaces-tab-${mk.id}`}
                                type="button"
                                disabled={!profileEditable}
                                onClick={() => toggleMarketplace(mk.id)}
                                className="flex h-[40px] items-center justify-between rounded-full bg-white px-4 text-[14px] text-[#4B5369] disabled:cursor-not-allowed"
                              >
                                <span>{mk.label}</span>
                                <span className="ml-3 flex items-center gap-2">
                                  <span
                                    className={`h-4 w-4 rounded-full ${
                                      profileEditable
                                        ? mk.active
                                          ? "bg-[#8A76E6]"
                                          : "bg-[#D7D9DE]"
                                        : "bg-[#D7D9DE]"
                                    }`}
                                  />
                                  {profileEditable ? (
                                    <span
                                      className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#E3E5EA] text-[12px] font-semibold text-[#5D6477] hover:bg-[#D3D7E2]"
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
                        </div>
                        <div className="mt-8 flex items-center justify-end">
                          {canalesSaveError ? (
                            <div className="mr-3 text-[13px] text-[#C0392B]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                              {canalesSaveError}
                            </div>
                          ) : null}
                          {canalesSaveOk ? (
                            <div className="mr-3 text-[13px] text-[#2B7A3D]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                              {canalesSaveOk}
                            </div>
                          ) : null}
                          <button
                            type="button"
                            disabled={!profileEditable || canalesSaving}
                            onClick={saveCanalesProfile}
                            className="h-[50px] rounded-full bg-[#0B1230] px-8 text-[16px] text-white disabled:opacity-60"
                          >
                            {canalesSaving ? "Guardando..." : "Confirmar"}
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
                                  <input
                                    disabled={!profileEditable}
                                  value={billingCompany ?? ""}
                                  onChange={(e) => setBillingCompany(e.target.value)}
                                  className="mt-2 h-[48px] w-full rounded-full border-none bg-white px-5 text-[15px] text-[#6E7486] outline-none placeholder:text-[#9AA1B2] disabled:bg-[#F3F4F6]"
                                />
                              </div>
                              <div>
                                <div className="text-[15px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Dirección fiscal</div>
                                  <input
                                    disabled={!profileEditable}
                                  value={billingAddress ?? ""}
                                  onChange={(e) => setBillingAddress(e.target.value)}
                                  className="mt-2 h-[48px] w-full rounded-full border-none bg-white px-5 text-[15px] text-[#6E7486] outline-none placeholder:text-[#9AA1B2] disabled:bg-[#F3F4F6]"
                                />
                              </div>
                            </div>
                          </div>

                          <div className="rounded-2xl bg-[#F1F3F7] p-4">
                            <div className="mb-3 text-[18px] text-[#1B2140]" style={{ fontFamily: "var(--font-dashboarddemarca-heading)" }}>Ubicación y contacto</div>
                            <div className="grid grid-cols-4 gap-4">
                              <div>
                                <div className="text-[15px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>País</div>
                                <div className="relative mt-2">
                                  <select
                                    disabled={!profileEditable}
                                    value={billingCountry ?? ""}
                                    onChange={(e) => {
                                      const next = e.target.value;
                                      setBillingCountry(next);
                                      setBillingCity("");
                                    }}
                                    className="h-[46px] w-full appearance-none rounded-full border-none bg-white px-5 pr-10 text-[15px] text-[#8B90A0] outline-none disabled:bg-[#F3F4F6]"
                                  >
                                    <option value="">Buscar país</option>
                                    {facturacionCountryOptions.map((item) => (
                                      <option key={`fact-pais-${item.id}`} value={item.id}>{item.label}</option>
                                    ))}
                                  </select>
                                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[16px] text-[#3b4256]">▾</span>
                                </div>
                              </div>
                              <div>
                                <div className="text-[15px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Ciudad</div>
                                <div className="relative mt-2">
                                  <select
                                    disabled={!profileEditable || !billingCountry}
                                    value={billingCity ?? ""}
                                    onChange={(e) => setBillingCity(e.target.value)}
                                    className="h-[46px] w-full appearance-none rounded-full border-none bg-white px-5 pr-10 text-[15px] text-[#8B90A0] outline-none disabled:bg-[#F3F4F6]"
                                  >
                                    <option value="">
                                      {billingCountry ? "Selecciona ciudad" : "Primero elige país"}
                                    </option>
                                    {billingCityOptions.map((city) => (
                                      <option key={`fact-city-${billingCountry}-${city}`} value={city}>
                                        {city}
                                      </option>
                                    ))}
                                  </select>
                                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[16px] text-[#3b4256]">▾</span>
                                </div>
                              </div>
                              <div>
                                <div className="text-[15px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Código postal</div>
                                  <input
                                    disabled={!profileEditable}
                                  value={billingPostalCode ?? ""}
                                  onChange={(e) => setBillingPostalCode(e.target.value)}
                                  className="mt-2 h-[46px] w-full rounded-full border-none bg-white px-5 text-[15px] text-[#6E7486] outline-none placeholder:text-[#9AA1B2] disabled:bg-[#F3F4F6]"
                                />
                              </div>
                              <div>
                                <div className="text-[15px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Teléfono (interno)</div>
                                  <input
                                    disabled={!profileEditable}
                                  value={billingPhone ?? ""}
                                  onChange={(e) => setBillingPhone(e.target.value)}
                                  className="mt-2 h-[46px] w-full rounded-full border-none bg-white px-5 text-[15px] text-[#6E7486] outline-none placeholder:text-[#9AA1B2] disabled:bg-[#F3F4F6]"
                                />
                              </div>
                            </div>
                          </div>

                          <div className="rounded-2xl bg-[#F1F3F7] p-4">
                            <div className="mb-3 text-[18px] text-[#1B2140]" style={{ fontFamily: "var(--font-dashboarddemarca-heading)" }}>Datos fiscales opcionales</div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <div className="text-[15px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Número de identificación fiscal (CIF / NIF / VAT)</div>
                                  <input
                                    disabled={!profileEditable}
                                  value={billingTaxId ?? ""}
                                  onChange={(e) => setBillingTaxId(e.target.value)}
                                  className="mt-2 h-[46px] w-full rounded-full border-none bg-white px-5 text-[15px] text-[#6E7486] outline-none placeholder:text-[#9AA1B2] disabled:bg-[#F3F4F6]"
                                />
                              </div>
                              <div>
                                <div className="text-[15px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Correo electrónico para facturación (interno)</div>
                                  <input
                                    disabled={!profileEditable}
                                  value={billingEmail ?? ""}
                                  onChange={(e) => setBillingEmail(e.target.value)}
                                  className="mt-2 h-[46px] w-full rounded-full border-none bg-white px-5 text-[15px] text-[#6E7486] outline-none placeholder:text-[#9AA1B2] disabled:bg-[#F3F4F6]"
                                />
                              </div>
                            </div>
                          </div>

                          <div className="rounded-2xl bg-[#F1F3F7] p-4">
                            <div className="grid grid-cols-3 gap-4">
                              <div>
                                <div className="text-[15px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Prefijo</div>
                                  <input
                                    disabled={!profileEditable}
                                  value={billingPrefix ?? ""}
                                  onChange={(e) => setBillingPrefix(e.target.value)}
                                  className="mt-2 h-[46px] w-full rounded-full border-none bg-white px-5 text-[15px] text-[#8B90A0] outline-none placeholder:text-[#9AA1B2] disabled:bg-[#F3F4F6]"
                                />
                              </div>
                              <div>
                                <div className="text-[15px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>País fiscal</div>
                                <div className="relative mt-2">
                                  <select
                                    disabled={!profileEditable}
                                    value={billingFiscalCountry ?? ""}
                                    onChange={(e) => setBillingFiscalCountry(e.target.value)}
                                    className="h-[46px] w-full appearance-none rounded-full border-none bg-white px-5 pr-10 text-[15px] text-[#8B90A0] outline-none disabled:bg-[#F3F4F6]"
                                  >
                                    <option value="">Buscar país</option>
                                    {facturacionCountryOptions.map((item) => (
                                      <option key={`fact-pais-fiscal-${item.id}`} value={item.id}>{item.label}</option>
                                    ))}
                                  </select>
                                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[16px] text-[#3b4256]">▾</span>
                                </div>
                              </div>
                              <div className="flex items-end">
                                <button
                                  type="button"
                                  className="h-[46px] w-full rounded-full border-none bg-[#4449CC26] px-5 text-[15px] text-[#6142C4] hover:bg-[#4449CC33]"
                                  style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}
                                  onClick={() => setShowInvoiceTemplatePreview(true)}
                                >
                                  Ver plantilla
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="mt-8 flex items-center justify-end">
                          {factSaveError ? (
                            <div className="mr-3 text-[13px] text-[#C0392B]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                              {factSaveError}
                            </div>
                          ) : null}
                          {factSaveOk ? (
                            <div className="mr-3 text-[13px] text-[#2B7A3D]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                              {factSaveOk}
                            </div>
                          ) : null}
                          <button
                            type="button"
                            disabled={!profileEditable || factSaving}
                            onClick={saveFacturacionProfile}
                            className="h-[50px] rounded-full bg-[#0B1230] px-8 text-[16px] text-white disabled:opacity-60"
                          >
                            {factSaving ? "Guardando..." : "Confirmar"}
                          </button>
                        </div>
                        {showInvoiceTemplatePreview ? (
                          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6">
                            <div className="w-full max-w-[760px] rounded-2xl bg-white p-5 shadow-[0_20px_55px_rgba(0,0,0,0.2)]">
                              <div className="mb-4 flex items-center justify-between">
                                <h3 className="text-[24px] text-[#1B2140]" style={{ fontFamily: "var(--font-dashboarddemarca-heading)" }}>
                                  Plantilla de factura (vista previa)
                                </h3>
                                <button
                                  type="button"
                                  className="h-9 rounded-full bg-[#0B1230] px-4 text-[13px] text-white"
                                  onClick={() => setShowInvoiceTemplatePreview(false)}
                                >
                                  Cerrar
                                </button>
                              </div>
                              <div
                                className="max-h-[78vh] overflow-auto rounded-xl border border-[#D8DCE4] bg-white p-4 text-[#101426]"
                                style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}
                              >
                                <div className="flex items-start justify-between gap-4">
                                  <div>
                                    {isRemoteLogo ? (
                                      <img src={currentLogoSrc} alt="Logo" className="h-[38px] w-auto object-contain" />
                                    ) : (
                                      <Image src={currentLogoSrc} alt="Logo" width={96} height={38} className="h-[38px] w-auto object-contain" />
                                    )}
                                  </div>
                                  <div className="text-right">
                                    <div className="text-[11px] uppercase tracking-[0.18em] text-[#7A8297]">Invoice</div>
                                    <div className="text-[16px] font-semibold text-[#1B2140]">{invoiceNumberPreview}</div>
                                  </div>
                                </div>
                                <div className="mt-3 border-b border-[#C5CBDA]" />

                                <div className="mt-4 grid grid-cols-[1fr_auto] gap-5 text-[12px]">
                                  <div className="rounded-xl border border-[#DDE2EE] bg-[#F8FAFF] px-3 py-2">
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#7A8297]">Invoice to</div>
                                    <div className="mt-1 text-[14px] font-semibold text-[#1B2140]">John Doe</div>
                                    <div className="text-[#444C66]">123 Main Street</div>
                                    <div className="text-[#444C66]">Dublin, D02 XY47</div>
                                    <div className="text-[#444C66]">+353 000 000 000</div>
                                    <div className="mt-1 text-[#444C66]">Client VAT ID: IE1234567A</div>
                                  </div>
                                  <div className="rounded-xl border border-[#DDE2EE] bg-[#F8FAFF] px-3 py-2 text-right">
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#7A8297]">Date</div>
                                    <div className="text-[14px] font-semibold text-[#1B2140]">{invoiceDateShort}</div>
                                    <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-[#7A8297]">Currency</div>
                                    <div className="text-[14px] font-semibold text-[#1B2140]">{invoiceCurrency}</div>
                                  </div>
                                </div>

                                <div className="mt-5 overflow-hidden rounded-xl border border-[#D8DCE4]">
                                  <div className="grid grid-cols-[1fr_96px_64px_96px] bg-[#F2F5FC] text-[12px] font-semibold uppercase tracking-[0.08em] text-[#4C556E]">
                                    <div className="px-3 py-2">Description</div>
                                    <div className="border-l border-[#D8DCE4] px-3 py-2 text-center">Price</div>
                                    <div className="border-l border-[#D8DCE4] px-3 py-2 text-center">Qty</div>
                                    <div className="border-l border-[#D8DCE4] px-3 py-2 text-center">Total</div>
                                  </div>
                                  <div className="divide-y divide-[#E7EBF3] text-[13px]">
                                    {sampleInvoiceItems.map((item) => (
                                      <div key={`preview-row-${item.description}`} className="grid grid-cols-[1fr_96px_64px_96px]">
                                        <div className="px-3 py-2.5">{item.description}</div>
                                        <div className="border-l border-[#E7EBF3] px-3 py-2.5 text-center">
                                          {invoiceSymbol}
                                          {item.price.toFixed(2)}
                                        </div>
                                        <div className="border-l border-[#E7EBF3] px-3 py-2.5 text-center">{item.qty}</div>
                                        <div className="border-l border-[#E7EBF3] px-3 py-2.5 text-center">
                                          {invoiceSymbol}
                                          {(item.price * item.qty).toFixed(2)}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                <div className="mt-8 flex items-end justify-between gap-5">
                                  <div className="max-w-[390px] text-[11px] leading-[1.5] text-[#48506A]">
                                    <div className="border-t border-[#C5CBDA] pt-2 font-semibold uppercase tracking-[0.05em] text-[#1B2140]">
                                      {(billingCompany || "BIMSOFT LIMITED LTD") + " - Registered Office"}
                                    </div>
                                    <div>{billingAddress || "18/19 College Green, Dublin 2, Dublin"}</div>
                                    <div>
                                      {(billingFiscalCountry || billingCountry || fiscalCountryLabel || "IRLANDA") +
                                        " " +
                                        (billingPostalCode || "D02EY47") +
                                        " - VAT " +
                                        (billingTaxId || "IE3375540IH")}
                                    </div>
                                  </div>
                                  <div className="w-[220px] space-y-1.5 text-[12px]">
                                    <div className="grid grid-cols-[1fr_120px] items-center gap-3">
                                      <div className="text-right text-[#4C556E]">Subtotal:</div>
                                      <div className="rounded-md border border-[#C5CBDA] bg-[#FBFCFF] px-3 py-1.5 text-right font-medium">
                                        {previewSubtotal.toFixed(2)} {invoiceSymbol}
                                      </div>
                                    </div>
                                    <div className="grid grid-cols-[1fr_120px] items-center gap-3">
                                      <div className="text-right text-[#4C556E]">{`IVA ${previewTaxPercent}%:`}</div>
                                      <div className="rounded-md border border-[#C5CBDA] bg-[#FBFCFF] px-3 py-1.5 text-right font-medium">
                                        {previewTaxAmount.toFixed(2)} {invoiceSymbol}
                                      </div>
                                    </div>
                                    <div className="grid grid-cols-[1fr_120px] items-center gap-3">
                                      <div className="text-right text-[13px] font-semibold text-[#1B2140]">TOTAL:</div>
                                      <div className="rounded-md border border-[#1B2140] bg-[#F1F4FF] px-3 py-1.5 text-right text-[13px] font-semibold text-[#1B2140]">
                                        {previewTotal.toFixed(2)} {invoiceSymbol}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                <div className="mt-4 rounded-lg border border-[#D8DCE4] bg-[#F8F9FB] p-3 text-[11px] leading-[1.55] text-[#525A70]">
                                  <div className="font-semibold text-[#1B2140]">Nota</div>
                                  <div className="mt-1">
                                    Esta es una vista previa de plantilla. Los datos salen de la ficha de facturación y el detalle de líneas se completará con pedidos reales, así como el impuesto correcto de cada país correspondiente donde se realiza la compra.
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <div className="rounded-2xl bg-white p-6 text-[16px] text-[#70778E]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                        Sección vacía por ahora.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : scannerFlow ? (
              <div className="h-full">
                <div className="flex h-full flex-col overflow-hidden rounded-2xl bg-white">
                  <div className="flex items-start justify-between px-10 pt-7">
                    <div>
                      <h2 className="text-[32px] leading-none text-[#121633]" style={{ fontFamily: "var(--font-dashboarddemarca-heading)" }}>
                        Escáner Operativo
                      </h2>
                      <p className="mt-2 text-[14px] text-[#4A5268]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                        {scannerFlow.title}. El escáner Eyoyo trabaja como teclado y el cursor debe quedar listo para escanear.
                      </p>
                    </div>
                    <div className="rounded-full bg-[#EEF2FF] px-4 py-2 text-[13px] text-[#3147D4]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                      {scannerFlow.badge}
                    </div>
                  </div>

                  <div className="mt-6 border-b border-[#666666] px-2">
                    <div className="grid grid-cols-7 gap-2">
                      {[
                        { key: "scanner-recepcion", label: "1. Recepción" },
                        { key: "scanner-picking", label: "2. Picking" },
                        { key: "scanner-packing", label: "3. Packing" },
                        { key: "scanner-devoluciones", label: "4. Devoluciones" },
                        { key: "scanner-busqueda", label: "5. Búsqueda" },
                        { key: "scanner-ajuste", label: "6. Ajuste" },
                        { key: "scanner-transferencias", label: "7. Transferencias" },
                      ].map((tab) => (
                        <button
                          key={`scanner-tab-${tab.key}`}
                          type="button"
                          onClick={() => setActiveKey(tab.key)}
                          className={`rounded-t-2xl px-3 py-3 text-left text-[13px] ${
                            activeKey === tab.key ? "bg-[#BFBFBF] text-[#1A213D]" : "bg-[#E6E8EA] text-[#545C73]"
                          }`}
                          style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="relative min-h-0 flex-1 w-full overflow-y-auto rounded-b-2xl bg-[#E6E8EA] px-10 pb-24 pt-6">
                    <div className="grid grid-cols-[minmax(0,1.15fr)_380px] gap-6">
                      <div className="space-y-5">
                        <div className="rounded-2xl bg-white p-5">
                          <div className="text-[20px] text-[#121633]" style={{ fontFamily: "var(--font-dashboarddemarca-heading)" }}>
                            {scannerFlow.title}
                          </div>
                          <div className="mt-2 text-[14px] leading-[1.55] text-[#4A5268]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                            {scannerFlow.intro}
                          </div>
                          <div className="mt-5 grid grid-cols-3 gap-4">
                            <div>
                              <div className="text-[14px] text-[#2B334B]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Almacén</div>
                              <select
                                value={scannerWarehouseCode}
                                onChange={(e) => setScannerWarehouseCode(e.target.value)}
                                className="mt-2 h-[48px] w-full rounded-full border-none bg-[#F7F8FB] px-5 text-[14px] text-[#2B334B] outline-none"
                              >
                                <option value="ES-SEG">ES-SEG</option>
                              </select>
                            </div>
                            <div>
                              <div className="text-[14px] text-[#2B334B]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Ubicación</div>
                              <select
                                value={scannerLocationCode}
                                onChange={(e) => setScannerLocationCode(e.target.value)}
                                className="mt-2 h-[48px] w-full rounded-full border-none bg-[#F7F8FB] px-5 text-[14px] text-[#2B334B] outline-none"
                              >
                                {scannerLocationOptions.map((code) => (
                                  <option key={`scanner-location-${code}`} value={code}>
                                    {code}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <div className="text-[14px] text-[#2B334B]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Escanear aquí</div>
                              <input
                                autoFocus
                                value={scannerInput}
                                onChange={(e) => setScannerInput(e.target.value)}
                                placeholder="EAN / QR / tracking"
                                className="mt-2 h-[48px] w-full rounded-full border-none bg-[#F7F8FB] px-5 text-[14px] text-[#2B334B] outline-none placeholder:text-[#9AA1B2]"
                              />
                            </div>
                          </div>
                        </div>

                        {activeKey === "scanner-recepcion" ? (
                          <div className="rounded-2xl bg-white p-5">
                            <div className="grid grid-cols-[minmax(0,1fr)_220px] gap-5">
                              <div>
                                <div className="text-[18px] text-[#121633]" style={{ fontFamily: "var(--font-dashboarddemarca-heading)" }}>Recepción de entrada</div>
                                <div className="mt-3 rounded-2xl bg-[#F7F8FB] p-4">
                                  <div className="text-[13px] text-[#6A7186]">Producto detectado</div>
                                  <div className="mt-1 text-[18px] text-[#121633]" style={{ fontFamily: "var(--font-dashboarddemarca-heading)" }}>
                                    {scannerSelectedLocation?.category || "Bolsos"} · {scannerInput.trim() || "Esperando escaneo"}
                                  </div>
                                  <div className="mt-2 text-[14px] text-[#4A5268]">Ubicación destino: {scannerLocationCode}</div>
                                  <div className="mt-1 text-[14px] text-[#4A5268]">Contador actual: {scannerSelectedLocation?.items || 0} unidades</div>
                                </div>
                                <textarea
                                  value={scannerIncidentNote}
                                  onChange={(e) => setScannerIncidentNote(e.target.value)}
                                  placeholder="Incidencia: faltante, roto o dañado"
                                  className="mt-4 h-[94px] w-full rounded-2xl border-none bg-[#F7F8FB] px-5 py-4 text-[14px] text-[#2B334B] outline-none placeholder:text-[#9AA1B2]"
                                />
                              </div>
                              <div className="flex flex-col gap-3">
                                <button type="button" className="h-[48px] rounded-full bg-[#0B1230] text-[15px] text-white" style={{ fontFamily: "var(--font-dashboarddemarca-heading)" }}>
                                  Todo OK
                                </button>
                                <button type="button" className="h-[48px] rounded-full border border-[#D4D9E4] bg-white text-[15px] text-[#1A213D]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                                  Incidencia
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : null}

                        {activeKey === "scanner-picking" ? (
                          <div className="rounded-2xl bg-white p-5">
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <div className="text-[14px] text-[#2B334B]">Pedido</div>
                                <input value={scannerOrderRef} onChange={(e) => setScannerOrderRef(e.target.value)} className="mt-2 h-[48px] w-full rounded-full border-none bg-[#F7F8FB] px-5 text-[14px] outline-none" />
                              </div>
                              <div className="rounded-2xl bg-[#F7F8FB] p-4">
                                <div className="text-[13px] text-[#6A7186]">Ubicación esperada</div>
                                <div className="mt-1 text-[18px] text-[#121633]" style={{ fontFamily: "var(--font-dashboarddemarca-heading)" }}>{scannerLocationCode}</div>
                                <div className="mt-2 text-[14px] text-[#4A5268]">Escanea el producto para validar que cogiste el item correcto.</div>
                              </div>
                            </div>
                            <div className="mt-4 flex items-center justify-between rounded-2xl bg-[#F7F8FB] px-5 py-4">
                              <div>
                                <div className="text-[13px] text-[#6A7186]">Resultado de validación</div>
                                <div className="mt-1 text-[16px] text-[#121633]">{scannerInput.trim() ? "Producto validado correctamente" : "Esperando lectura"}</div>
                              </div>
                              <button type="button" className="h-[48px] rounded-full bg-[#0B1230] px-6 text-[15px] text-white" style={{ fontFamily: "var(--font-dashboarddemarca-heading)" }}>
                                Pick completo
                              </button>
                            </div>
                          </div>
                        ) : null}

                        {activeKey === "scanner-packing" ? (
                          <div className="rounded-2xl bg-white p-5">
                            <div className="text-[18px] text-[#121633]" style={{ fontFamily: "var(--font-dashboarddemarca-heading)" }}>Confirmación de salida</div>
                            <div className="mt-4 grid grid-cols-2 gap-4">
                              <div className="rounded-2xl bg-[#F7F8FB] p-4">
                                <div className="text-[13px] text-[#6A7186]">Packaging</div>
                                <div className="mt-3 space-y-2 text-[14px] text-[#2B334B]">
                                  <label className="flex items-center gap-2"><input type="checkbox" checked={scannerPackaging.bubble} onChange={(e) => setScannerPackaging((prev) => ({ ...prev, bubble: e.target.checked }))} /> Burbuja</label>
                                  <label className="flex items-center gap-2"><input type="checkbox" checked={scannerPackaging.paper} onChange={(e) => setScannerPackaging((prev) => ({ ...prev, paper: e.target.checked }))} /> Papel</label>
                                  <label className="flex items-center gap-2"><input type="checkbox" checked={scannerPackaging.tape} onChange={(e) => setScannerPackaging((prev) => ({ ...prev, tape: e.target.checked }))} /> Cinta</label>
                                </div>
                              </div>
                              <div>
                                <div className="text-[14px] text-[#2B334B]">Caja usada</div>
                                <select value={scannerPackaging.box} onChange={(e) => setScannerPackaging((prev) => ({ ...prev, box: e.target.value }))} className="mt-2 h-[48px] w-full rounded-full border-none bg-[#F7F8FB] px-5 text-[14px] outline-none">
                                  <option>Caja S</option>
                                  <option>Caja M</option>
                                  <option>Caja L</option>
                                  <option>Sobre</option>
                                </select>
                                <button type="button" className="mt-6 h-[48px] w-full rounded-full bg-[#0B1230] text-[15px] text-white" style={{ fontFamily: "var(--font-dashboarddemarca-heading)" }}>
                                  Confirmar salida
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : null}

                        {activeKey === "scanner-devoluciones" ? (
                          <div className="rounded-2xl bg-white p-5">
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <div className="text-[14px] text-[#2B334B]">Tracking devolución</div>
                                <input value={scannerTracking} onChange={(e) => setScannerTracking(e.target.value)} placeholder="Escanea tracking" className="mt-2 h-[48px] w-full rounded-full border-none bg-[#F7F8FB] px-5 text-[14px] outline-none" />
                              </div>
                              <div>
                                <div className="text-[14px] text-[#2B334B]">Decisión</div>
                                <select value={scannerDecision} onChange={(e) => setScannerDecision(e.target.value)} className="mt-2 h-[48px] w-full rounded-full border-none bg-[#F7F8FB] px-5 text-[14px] outline-none">
                                  <option value="restock">Restock</option>
                                  <option value="repair">Reparación</option>
                                  <option value="scrap">Scrap</option>
                                  <option value="non_sellable">No vendible</option>
                                </select>
                              </div>
                            </div>
                            <textarea
                              value={scannerIncidentNote}
                              onChange={(e) => setScannerIncidentNote(e.target.value)}
                              placeholder="Motivo devolución / estado del producto"
                              className="mt-4 h-[94px] w-full rounded-2xl border-none bg-[#F7F8FB] px-5 py-4 text-[14px] outline-none"
                            />
                            <button type="button" className="mt-4 h-[48px] rounded-full bg-[#0B1230] px-6 text-[15px] text-white" style={{ fontFamily: "var(--font-dashboarddemarca-heading)" }}>
                              Registrar devolución
                            </button>
                          </div>
                        ) : null}

                        {activeKey === "scanner-busqueda" ? (
                          <div className="rounded-2xl bg-white p-5">
                            <div className="rounded-2xl bg-[#F7F8FB] p-4">
                              <div className="text-[13px] text-[#6A7186]">Lookup actual</div>
                              <div className="mt-1 text-[18px] text-[#121633]" style={{ fontFamily: "var(--font-dashboarddemarca-heading)" }}>
                                {scannerInput.trim() || "Esperando EAN / alias"}
                              </div>
                              <div className="mt-2 text-[14px] text-[#4A5268]">
                                La búsqueda revisa primero products.ean, después ean_aliases y si no existe propondrá crear producto.
                              </div>
                            </div>
                            <div className="mt-4 flex gap-3">
                              <button type="button" className="h-[48px] rounded-full bg-[#0B1230] px-6 text-[15px] text-white" style={{ fontFamily: "var(--font-dashboarddemarca-heading)" }}>
                                Abrir ficha
                              </button>
                              <button type="button" className="h-[48px] rounded-full border border-[#D4D9E4] bg-white px-6 text-[15px] text-[#1A213D]">
                                Crear producto nuevo
                              </button>
                            </div>
                          </div>
                        ) : null}

                        {activeKey === "scanner-ajuste" ? (
                          <div className="rounded-2xl bg-white p-5">
                            <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-4">
                              <div>
                                <div className="text-[14px] text-[#2B334B]">Cantidad</div>
                                <input value={scannerAdjustmentQty} onChange={(e) => setScannerAdjustmentQty(e.target.value.replace(/[^\d-]/g, ""))} className="mt-2 h-[48px] w-full rounded-full border-none bg-[#F7F8FB] px-5 text-[14px] outline-none" />
                              </div>
                              <div>
                                <div className="text-[14px] text-[#2B334B]">Motivo</div>
                                <input value={scannerAdjustmentReason} onChange={(e) => setScannerAdjustmentReason(e.target.value)} className="mt-2 h-[48px] w-full rounded-full border-none bg-[#F7F8FB] px-5 text-[14px] outline-none" />
                              </div>
                            </div>
                            <button type="button" className="mt-4 h-[48px] rounded-full bg-[#0B1230] px-6 text-[15px] text-white" style={{ fontFamily: "var(--font-dashboarddemarca-heading)" }}>
                              Aplicar ajuste
                            </button>
                          </div>
                        ) : null}

                        {activeKey === "scanner-transferencias" ? (
                          <div className="rounded-2xl bg-white p-5">
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <div className="text-[14px] text-[#2B334B]">Almacén origen</div>
                                <select value={scannerWarehouseCode} onChange={(e) => setScannerWarehouseCode(e.target.value)} className="mt-2 h-[48px] w-full rounded-full border-none bg-[#F7F8FB] px-5 text-[14px] outline-none">
                                  <option value="ES-SEG">ES-SEG</option>
                                </select>
                              </div>
                              <div>
                                <div className="text-[14px] text-[#2B334B]">Almacén destino</div>
                                <select className="mt-2 h-[48px] w-full rounded-full border-none bg-[#F7F8FB] px-5 text-[14px] outline-none">
                                  <option>IT-MIL</option>
                                  <option>PE-LIM</option>
                                </select>
                              </div>
                            </div>
                            <div className="mt-4 text-[14px] text-[#4A5268]">Ubicación origen: {scannerLocationCode}</div>
                            <button type="button" className="mt-4 h-[48px] rounded-full bg-[#0B1230] px-6 text-[15px] text-white" style={{ fontFamily: "var(--font-dashboarddemarca-heading)" }}>
                              Crear transferencia
                            </button>
                          </div>
                        ) : null}
                      </div>

                      <div className="space-y-4">
                        <div className="rounded-2xl bg-white p-5">
                          <div className="text-[18px] text-[#121633]" style={{ fontFamily: "var(--font-dashboarddemarca-heading)" }}>
                            Contexto operativo
                          </div>
                          <div className="mt-4 grid gap-3 text-[14px] text-[#2B334B]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                            <div className="rounded-2xl bg-[#F7F8FB] p-4">
                              <div className="text-[12px] text-[#6A7186]">Almacén activo</div>
                              <div className="mt-1 text-[16px] text-[#121633]">{scannerWarehouseCode}</div>
                            </div>
                            <div className="rounded-2xl bg-[#F7F8FB] p-4">
                              <div className="text-[12px] text-[#6A7186]">Ubicación activa</div>
                              <div className="mt-1 text-[16px] text-[#121633]">{scannerLocationCode}</div>
                              <div className="mt-1 text-[13px] text-[#4A5268]">
                                {scannerSelectedLocation ? `${scannerSelectedLocation.items} ítems · ${scannerSelectedLocation.category}` : "Sin detalle cargado"}
                              </div>
                            </div>
                            <div className="rounded-2xl bg-[#F7F8FB] p-4">
                              <div className="text-[12px] text-[#6A7186]">Última lectura</div>
                              <div className="mt-1 text-[16px] text-[#121633]">{scannerInput.trim() || "Esperando escaneo"}</div>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-2xl bg-white p-5">
                          <div className="text-[18px] text-[#121633]" style={{ fontFamily: "var(--font-dashboarddemarca-heading)" }}>
                            Resultado esperado
                          </div>
                          <div className="mt-3 text-[14px] leading-[1.6] text-[#4A5268]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                            {scannerFlow.summary}
                          </div>
                        </div>

                        <div className="rounded-2xl bg-white p-5">
                          <div className="text-[18px] text-[#121633]" style={{ fontFamily: "var(--font-dashboarddemarca-heading)" }}>
                            Reglas de uso
                          </div>
                          <ul className="mt-3 space-y-2 text-[14px] text-[#4A5268]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                            <li>1. El cursor debe quedar listo para escanear.</li>
                            <li>2. El Eyoyo actúa como teclado y termina con Enter.</li>
                            <li>3. No se edita stock manualmente; siempre se crea movimiento.</li>
                            <li>4. La acción depende del contexto: entrada, validación, salida o devolución.</li>
                          </ul>
                          <button type="button" className="mt-5 h-[48px] w-full rounded-full bg-[#0B1230] text-[15px] text-white" style={{ fontFamily: "var(--font-dashboarddemarca-heading)" }}>
                            {scannerFlow.primaryAction}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : activeKey === "es-seg" || activeKey === "es-seg-info" || activeKey === "es-seg-distribution" || activeKey.startsWith("warehouse-") ? (
              <div className="h-full">
                <div className="flex h-full flex-col overflow-hidden rounded-2xl bg-white">
                  <div className="flex items-start justify-between px-10 pt-7">
                    <div>
                      <h2 className="text-[32px] leading-none text-[#121633]" style={{ fontFamily: "var(--font-dashboarddemarca-heading)" }}>
                        Almacén {activeWarehouseCode || "ES-SEG"}
                      </h2>
                      <p className="mt-2 text-[14px] text-[#4A5268]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                        Ficha operativa del almacén para configuración y control.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="text-[14px] text-[#3E455C] hover:text-[#121633]"
                      style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}
                      onClick={() => setWarehouseEditable((prev) => !prev)}
                    >
                      {warehouseEditable ? "Bloquear ficha" : "Editar ficha"}
                    </button>
                  </div>

                  <div className="mt-6 border-b border-[#666666] px-2">
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { key: "info" as WarehouseTabKey, label: "1. Información del almacén" },
                        { key: "distribution" as WarehouseTabKey, label: "2. Distribución de almacén" },
                      ].map((tab) => (
                        <button
                          key={`warehouse-tab-${tab.key}`}
                          type="button"
                          onClick={() => {
                            setWarehouseTab(tab.key);
                            setActiveKey(tab.key === "info" ? activeWarehouseMenuKey : `${activeWarehouseMenuKey}-distribution`);
                          }}
                          className={`rounded-t-2xl px-4 py-3 text-left text-[14px] ${
                            warehouseTab === tab.key ? "bg-[#BFBFBF] text-[#1A213D]" : "bg-[#E6E8EA] text-[#545C73]"
                          }`}
                          style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="relative min-h-0 flex-1 w-full overflow-y-auto rounded-b-2xl bg-[#E6E8EA] px-10 pb-24 pt-6">
                    {warehouseTab === "info" ? (
                      <>
                        <div className="grid grid-cols-3 gap-8 text-[#2B334B]">
                          <div>
                            <div className="text-[14px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Nombre de almacén</div>
                            <input
                              disabled={!warehouseEditable}
                              value={warehouseProfile.name}
                              onChange={(e) => setWarehouseProfile((p) => ({ ...p, name: e.target.value }))}
                              className="mt-2 h-[48px] w-full rounded-full border-none bg-white px-5 text-[14px] text-[#8B90A0] outline-none disabled:bg-[#F3F4F6]"
                            />

                            <div className="mt-6 text-[14px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Código interno</div>
                            <input
                              disabled={!warehouseEditable}
                              value={warehouseProfile.code}
                              onChange={(e) => setWarehouseProfile((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
                              className="mt-2 h-[48px] w-full rounded-full border-none bg-white px-5 text-[14px] text-[#8B90A0] outline-none disabled:bg-[#F3F4F6]"
                            />

                            <div className="mt-6 text-[14px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Color identificativo</div>
                            <div className="mt-2 flex items-center gap-3">
                              <span className="h-11 w-11 rounded-full" style={{ backgroundColor: warehouseProfile.color }} />
                              <input
                                disabled={!warehouseEditable}
                                type="color"
                                value={warehouseProfile.color}
                                onChange={(e) => setWarehouseProfile((p) => ({ ...p, color: e.target.value.toUpperCase() }))}
                                className="h-[44px] w-[76px] cursor-pointer rounded-xl border-none bg-white px-2 disabled:cursor-not-allowed"
                              />
                            </div>

                            <div className="mt-6 text-[14px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Descripción</div>
                            <input
                              disabled={!warehouseEditable}
                              value={warehouseProfile.description}
                              onChange={(e) => setWarehouseProfile((p) => ({ ...p, description: e.target.value }))}
                              className="mt-2 h-[48px] w-full rounded-full border-none bg-white px-5 text-[14px] text-[#8B90A0] outline-none disabled:bg-[#F3F4F6]"
                            />
                          </div>

                          <div>
                            <div className="text-[14px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Tipo de almacén</div>
                            <select
                              disabled={!warehouseEditable}
                              value={warehouseProfile.type}
                              onChange={(e) => setWarehouseProfile((p) => ({ ...p, type: e.target.value as WarehouseProfile["type"] }))}
                              className="mt-2 h-[48px] w-full rounded-full border-none bg-white px-5 text-[14px] text-[#8B90A0] outline-none disabled:bg-[#F3F4F6]"
                            >
                              <option value="OWN">Propio</option>
                              <option value="THIRD_PARTY_3PL">3PL</option>
                              <option value="RETURNS">Devoluciones</option>
                              <option value="TEMPORARY">Temporal</option>
                            </select>

                            <div className="mt-6 text-[14px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Estado</div>
                            <select
                              disabled={!warehouseEditable}
                              value={warehouseProfile.status}
                              onChange={(e) => setWarehouseProfile((p) => ({ ...p, status: e.target.value as WarehouseProfile["status"] }))}
                              className="mt-2 h-[48px] w-full rounded-full border-none bg-white px-5 text-[14px] text-[#8B90A0] outline-none disabled:bg-[#F3F4F6]"
                            >
                              <option value="ACTIVE">Activo</option>
                              <option value="INACTIVE">Inactivo</option>
                            </select>

                            <div className="mt-6 text-[14px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>País</div>
                            <select
                              disabled={!warehouseEditable}
                              value={warehouseProfile.countryCode}
                              onChange={(e) => setWarehouseProfile((p) => ({ ...p, countryCode: e.target.value }))}
                              className="mt-2 h-[48px] w-full rounded-full border-none bg-white px-5 text-[14px] text-[#8B90A0] outline-none disabled:bg-[#F3F4F6]"
                            >
                              {facturacionCountryOptions.map((item) => (
                                <option key={`wh-country-${item.id}`} value={item.id}>
                                  {item.label}
                                </option>
                              ))}
                            </select>

                            <div className="mt-6 text-[14px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Ciudad</div>
                            <input
                              disabled={!warehouseEditable}
                              value={warehouseProfile.city}
                              onChange={(e) => setWarehouseProfile((p) => ({ ...p, city: e.target.value }))}
                              className="mt-2 h-[48px] w-full rounded-full border-none bg-white px-5 text-[14px] text-[#8B90A0] outline-none disabled:bg-[#F3F4F6]"
                            />
                          </div>

                          <div>
                            <div className="text-[14px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Dirección</div>
                            <input
                              disabled={!warehouseEditable}
                              value={warehouseProfile.address}
                              onChange={(e) => setWarehouseProfile((p) => ({ ...p, address: e.target.value }))}
                              className="mt-2 h-[48px] w-full rounded-full border-none bg-white px-5 text-[14px] text-[#8B90A0] outline-none disabled:bg-[#F3F4F6]"
                            />

                            <div className="mt-6 text-[14px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Referencia interna</div>
                            <input
                              disabled={!warehouseEditable}
                              value={warehouseProfile.reference}
                              onChange={(e) => setWarehouseProfile((p) => ({ ...p, reference: e.target.value }))}
                              className="mt-2 h-[48px] w-full rounded-full border-none bg-white px-5 text-[14px] text-[#8B90A0] outline-none disabled:bg-[#F3F4F6]"
                            />

                            <div className="mt-6 grid grid-cols-2 gap-3">
                              <div>
                                <div className="text-[14px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Apertura</div>
                                <input
                                  disabled={!warehouseEditable}
                                  type="time"
                                  value={warehouseProfile.openingHour}
                                  onChange={(e) => setWarehouseProfile((p) => ({ ...p, openingHour: e.target.value }))}
                                  className="mt-2 h-[48px] w-full rounded-full border-none bg-white px-5 text-[14px] text-[#8B90A0] outline-none disabled:bg-[#F3F4F6]"
                                />
                              </div>
                              <div>
                                <div className="text-[14px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Cierre</div>
                                <input
                                  disabled={!warehouseEditable}
                                  type="time"
                                  value={warehouseProfile.closingHour}
                                  onChange={(e) => setWarehouseProfile((p) => ({ ...p, closingHour: e.target.value }))}
                                  className="mt-2 h-[48px] w-full rounded-full border-none bg-white px-5 text-[14px] text-[#8B90A0] outline-none disabled:bg-[#F3F4F6]"
                                />
                              </div>
                            </div>

                            <div className="mt-6 text-[14px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Capacidad máxima (unidades)</div>
                            <input
                              disabled={!warehouseEditable}
                              value={warehouseProfile.capacityUnits}
                              onChange={(e) => setWarehouseProfile((p) => ({ ...p, capacityUnits: e.target.value.replace(/[^\d]/g, "") }))}
                              className="mt-2 h-[48px] w-full rounded-full border-none bg-white px-5 text-[14px] text-[#8B90A0] outline-none disabled:bg-[#F3F4F6]"
                            />
                          </div>
                        </div>

                        <div className="mt-8 grid grid-cols-3 gap-8 text-[#2B334B]">
                          <div>
                            <div className="text-[14px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Responsable</div>
                            <input
                              disabled={!warehouseEditable}
                              value={warehouseProfile.managerName}
                              onChange={(e) => setWarehouseProfile((p) => ({ ...p, managerName: e.target.value }))}
                              className="mt-2 h-[48px] w-full rounded-full border-none bg-white px-5 text-[14px] text-[#8B90A0] outline-none disabled:bg-[#F3F4F6]"
                            />
                          </div>
                          <div>
                            <div className="text-[14px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Teléfono</div>
                            <input
                              disabled={!warehouseEditable}
                              value={warehouseProfile.phone}
                              onChange={(e) => setWarehouseProfile((p) => ({ ...p, phone: e.target.value }))}
                              className="mt-2 h-[48px] w-full rounded-full border-none bg-white px-5 text-[14px] text-[#8B90A0] outline-none disabled:bg-[#F3F4F6]"
                            />
                          </div>
                          <div>
                            <div className="text-[14px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Email</div>
                            <input
                              disabled={!warehouseEditable}
                              value={warehouseProfile.email}
                              onChange={(e) => setWarehouseProfile((p) => ({ ...p, email: e.target.value }))}
                              className="mt-2 h-[48px] w-full rounded-full border-none bg-white px-5 text-[14px] text-[#8B90A0] outline-none disabled:bg-[#F3F4F6]"
                            />
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="space-y-6 text-[#2B334B]">
                        <div className="grid grid-cols-[360px_minmax(0,1fr)] gap-6">
                          <div className="rounded-2xl bg-white p-4">
                            <div className="text-[18px] text-[#121633]" style={{ fontFamily: "var(--font-dashboarddemarca-heading)" }}>
                              Agregar ubicación
                            </div>
                            <div className="mt-4 grid gap-3">
                              <div>
                                <div className="text-[14px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Bloque</div>
                                <input
                                  disabled={!warehouseEditable}
                                  value={distributionDraft.block}
                                  onChange={(e) => setDistributionDraft((prev) => ({ ...prev, block: e.target.value.toUpperCase().slice(0, 1) || "A" }))}
                                  className="mt-2 h-[48px] w-full rounded-full border-none bg-[#F7F8FB] px-5 text-[14px] text-[#2B334B] outline-none disabled:bg-[#F3F4F6]"
                                />
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <div className="text-[14px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Piso</div>
                                  <input
                                    disabled={!warehouseEditable}
                                    value={distributionDraft.floor}
                                    onChange={(e) => setDistributionDraft((prev) => ({ ...prev, floor: e.target.value.replace(/[^\d]/g, "") || "1" }))}
                                    className="mt-2 h-[48px] w-full rounded-full border-none bg-[#F7F8FB] px-5 text-[14px] text-[#2B334B] outline-none disabled:bg-[#F3F4F6]"
                                  />
                                </div>
                                <div>
                                  <div className="text-[14px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Caja</div>
                                  <input
                                    disabled={!warehouseEditable}
                                    value={distributionDraft.box}
                                    onChange={(e) => setDistributionDraft((prev) => ({ ...prev, box: e.target.value.replace(/[^\d]/g, "") || "1" }))}
                                    className="mt-2 h-[48px] w-full rounded-full border-none bg-[#F7F8FB] px-5 text-[14px] text-[#2B334B] outline-none disabled:bg-[#F3F4F6]"
                                  />
                                </div>
                              </div>
                              <div>
                                <div className="text-[14px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Categoría</div>
                                <select
                                  disabled={!warehouseEditable}
                                  value={distributionDraft.category}
                                  onChange={(e) => setDistributionDraft((prev) => ({ ...prev, category: e.target.value }))}
                                  className="mt-2 h-[48px] w-full rounded-full border-none bg-[#F7F8FB] px-5 text-[14px] text-[#2B334B] outline-none disabled:bg-[#F3F4F6]"
                                >
                                  {warehouseCategories.map((category) => (
                                    <option key={`draft-cat-${category}`} value={category}>
                                      {category}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <div className="text-[14px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Ítems</div>
                                <input
                                  disabled={!warehouseEditable}
                                  value={distributionDraft.items}
                                  onChange={(e) => setDistributionDraft((prev) => ({ ...prev, items: e.target.value.replace(/[^\d]/g, "") || "0" }))}
                                  className="mt-2 h-[48px] w-full rounded-full border-none bg-[#F7F8FB] px-5 text-[14px] text-[#2B334B] outline-none disabled:bg-[#F3F4F6]"
                                />
                              </div>
                              <button
                                type="button"
                                disabled={!warehouseEditable}
                                className="mt-2 h-[50px] rounded-full bg-[#0B1230] px-6 text-[15px] text-white disabled:opacity-60"
                                style={{ fontFamily: "var(--font-dashboarddemarca-heading)" }}
                                onClick={() => {
                                  const block = distributionDraft.block.trim().toUpperCase();
                                  const floor = Math.max(1, Number(distributionDraft.floor || "1"));
                                  const box = Math.max(1, Number(distributionDraft.box || "1"));
                                  const items = Math.max(0, Number(distributionDraft.items || "0"));
                                  if (!block) return;
                                  const code = buildWarehouseCode(block, floor, box);
                                  const nextEntry: WarehouseLayoutEntry = {
                                    code,
                                    block,
                                    floor,
                                    box,
                                    items,
                                    category: distributionDraft.category,
                                    name: `Caja ${code}`,
                                  };
                                  setWarehouseLayout((prev) => {
                                    const exists = prev.findIndex((entry) => entry.code === code);
                                    if (exists === -1) return [...prev, nextEntry].sort((a, b) => a.code.localeCompare(b.code, "es"));
                                    return prev.map((entry, idx) => (idx === exists ? nextEntry : entry));
                                  });
                                  setDistributionDraft({
                                    block,
                                    floor: String(floor),
                                    box: String(box),
                                    category: distributionDraft.category,
                                    items: String(items),
                                  });
                                  setSelectedMapBlock(block);
                                  setSelectedMapBox({ code, items, category: distributionDraft.category });
                                  setWarehouseSaveOk(`Ubicación ${code} actualizada.`);
                                }}
                              >
                                Guardar ubicación
                              </button>
                            </div>
                          </div>

                          <div className="space-y-4">
                            <div className="grid grid-cols-4 gap-3">
                              <div className="rounded-2xl bg-white p-4">
                                <div className="text-[12px] text-[#6A7186]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Bloques</div>
                                <div className="mt-1 text-[26px] text-[#121633]" style={{ fontFamily: "var(--font-dashboarddemarca-heading)" }}>
                                  {warehouseDistributionSummary.length}
                                </div>
                              </div>
                              <div className="rounded-2xl bg-white p-4">
                                <div className="text-[12px] text-[#6A7186]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Pisos</div>
                                <div className="mt-1 text-[26px] text-[#121633]" style={{ fontFamily: "var(--font-dashboarddemarca-heading)" }}>
                                  {Array.from(new Set(warehouseLayout.map((entry) => `${entry.block}-${entry.floor}`))).length}
                                </div>
                              </div>
                              <div className="rounded-2xl bg-white p-4">
                                <div className="text-[12px] text-[#6A7186]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Cajas</div>
                                <div className="mt-1 text-[26px] text-[#121633]" style={{ fontFamily: "var(--font-dashboarddemarca-heading)" }}>
                                  {warehouseLayout.length}
                                </div>
                              </div>
                              <div className="rounded-2xl bg-white p-4">
                                <div className="text-[12px] text-[#6A7186]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Ítems</div>
                                <div className="mt-1 text-[26px] text-[#121633]" style={{ fontFamily: "var(--font-dashboarddemarca-heading)" }}>
                                  {warehouseMapTotalItems}
                                </div>
                              </div>
                            </div>

                            <div className="rounded-2xl bg-white p-4">
                              <div className="mb-3 text-[18px] text-[#121633]" style={{ fontFamily: "var(--font-dashboarddemarca-heading)" }}>
                                Distribución actual
                              </div>
                              <div className="max-h-[420px] overflow-y-auto">
                                <div className="grid grid-cols-[110px_90px_90px_90px_1fr_48px] gap-y-2 text-[13px] text-[#2B334B]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                                  <div className="font-semibold text-[#6A7186]">Código</div>
                                  <div className="font-semibold text-[#6A7186]">Bloque</div>
                                  <div className="font-semibold text-[#6A7186]">Piso</div>
                                  <div className="font-semibold text-[#6A7186]">Ítems</div>
                                  <div className="font-semibold text-[#6A7186]">Categoría</div>
                                  <div />
                                  {warehouseLayout.map((entry) => (
                                    <Fragment key={`layout-entry-${entry.code}`}>
                                      <button
                                        type="button"
                                        className="text-left text-[#3147D4] hover:underline"
                                        onClick={() => {
                                          setDistributionDraft({
                                            block: entry.block,
                                            floor: String(entry.floor),
                                            box: String(entry.box),
                                            category: entry.category,
                                            items: String(entry.items),
                                          });
                                          setSelectedMapBlock(entry.block);
                                          setSelectedMapBox({ code: entry.code, items: entry.items, category: entry.category });
                                          setWarehouseSaveOk(`Ubicación ${entry.code} cargada para edición.`);
                                        }}
                                      >
                                        {entry.code}
                                      </button>
                                      <div>{entry.block}</div>
                                      <div>{String(entry.floor).padStart(2, "0")}</div>
                                      <div>{entry.items}</div>
                                      <div>{entry.category}</div>
                                      <button
                                        type="button"
                                        disabled={!warehouseEditable}
                                        className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#E3E5EA] text-[14px] text-[#5D6477] disabled:opacity-40"
                                        onClick={() => setWarehouseLayout((prev) => prev.filter((item) => item.code !== entry.code))}
                                      >
                                        ×
                                      </button>
                                    </Fragment>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="mt-8 flex items-center justify-end">
                      {warehouseSaveError ? (
                        <div className="mr-3 text-[13px] text-[#C0392B]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                          {warehouseSaveError}
                        </div>
                      ) : null}
                      {warehouseSaveOk ? (
                        <div className="mr-3 text-[13px] text-[#2B7A3D]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                          {warehouseSaveOk}
                        </div>
                      ) : null}
                      <button
                        type="button"
                        disabled={!warehouseEditable || warehouseSaving}
                        className="h-[50px] rounded-full bg-[#0B1230] px-8 text-[16px] text-white disabled:opacity-60"
                        style={{ fontFamily: "var(--font-dashboarddemarca-heading)" }}
                        onClick={warehouseTab === "info" ? saveWarehouseProfile : saveWarehouseLayout}
                      >
                        {warehouseSaving ? "Guardando..." : "Confirmar"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : activeKey === "almacenes-agregar" ? (
              <div className="h-full">
                <div className="flex h-full flex-col overflow-hidden rounded-2xl bg-white">
                  <div className="flex items-start justify-between px-10 pt-7">
                    <div>
                      <h2 className="text-[32px] leading-none text-[#121633]" style={{ fontFamily: "var(--font-dashboarddemarca-heading)" }}>
                        Agregar Almacén
                      </h2>
                      <p className="mt-2 text-[14px] text-[#4A5268]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                        Crea una nueva unidad operativa para stock, picking y control logístico.
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 border-b border-[#666666] px-2">
                    <div className="grid grid-cols-1 gap-2">
                      <div
                        className="rounded-t-2xl bg-[#BFBFBF] px-4 py-3 text-left text-[14px] text-[#1A213D]"
                        style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}
                      >
                        Ficha de almacén
                      </div>
                    </div>
                  </div>

                  <div className="relative min-h-0 flex-1 w-full overflow-y-auto rounded-b-2xl bg-[#E6E8EA] px-10 pb-24 pt-6">
                    <div className="grid grid-cols-3 gap-8 text-[#2B334B]">
                      <div>
                        <div className="text-[14px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Nombre de almacén</div>
                        <input
                          value={newWarehouseProfile.name}
                          onChange={(e) => setNewWarehouseProfile((p) => ({ ...p, name: e.target.value }))}
                          className="mt-2 h-[48px] w-full rounded-full border-none bg-white px-5 text-[14px] text-[#8B90A0] outline-none"
                        />

                        <div className="mt-6 text-[14px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Código interno</div>
                        <input
                          value={newWarehouseProfile.code}
                          onChange={(e) =>
                            setNewWarehouseProfile((p) => ({
                              ...p,
                              code: normalizeWarehouseLabel(e.target.value),
                            }))
                          }
                          className="mt-2 h-[48px] w-full rounded-full border-none bg-white px-5 text-[14px] text-[#8B90A0] outline-none"
                        />

                        <div className="mt-6 text-[14px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Color identificativo</div>
                        <div className="mt-2 flex items-center gap-3">
                          <span className="h-11 w-11 rounded-full" style={{ backgroundColor: newWarehouseProfile.color }} />
                          <input
                            type="color"
                            value={newWarehouseProfile.color}
                            onChange={(e) => setNewWarehouseProfile((p) => ({ ...p, color: e.target.value.toUpperCase() }))}
                            className="h-[44px] w-[76px] cursor-pointer rounded-xl border-none bg-white px-2"
                          />
                        </div>

                        <div className="mt-6 text-[14px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Descripción</div>
                        <input
                          value={newWarehouseProfile.description}
                          onChange={(e) => setNewWarehouseProfile((p) => ({ ...p, description: e.target.value }))}
                          className="mt-2 h-[48px] w-full rounded-full border-none bg-white px-5 text-[14px] text-[#8B90A0] outline-none"
                        />
                      </div>

                      <div>
                        <div className="text-[14px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Tipo de almacén</div>
                        <select
                          value={newWarehouseProfile.type}
                          onChange={(e) => setNewWarehouseProfile((p) => ({ ...p, type: e.target.value as WarehouseProfile["type"] }))}
                          className="mt-2 h-[48px] w-full rounded-full border-none bg-white px-5 text-[14px] text-[#8B90A0] outline-none"
                        >
                          <option value="OWN">Propio</option>
                          <option value="THIRD_PARTY_3PL">3PL</option>
                          <option value="RETURNS">Devoluciones</option>
                          <option value="TEMPORARY">Temporal</option>
                        </select>

                        <div className="mt-6 text-[14px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Estado</div>
                        <select
                          value={newWarehouseProfile.status}
                          onChange={(e) => setNewWarehouseProfile((p) => ({ ...p, status: e.target.value as WarehouseProfile["status"] }))}
                          className="mt-2 h-[48px] w-full rounded-full border-none bg-white px-5 text-[14px] text-[#8B90A0] outline-none"
                        >
                          <option value="ACTIVE">Activo</option>
                          <option value="INACTIVE">Inactivo</option>
                        </select>

                        <div className="mt-6 text-[14px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>País</div>
                        <select
                          value={newWarehouseProfile.countryCode}
                          onChange={(e) => setNewWarehouseProfile((p) => ({ ...p, countryCode: e.target.value }))}
                          className="mt-2 h-[48px] w-full rounded-full border-none bg-white px-5 text-[14px] text-[#8B90A0] outline-none"
                        >
                          {facturacionCountryOptions.map((item) => (
                            <option key={`new-wh-country-${item.id}`} value={item.id}>
                              {item.label}
                            </option>
                          ))}
                        </select>

                        <div className="mt-6 text-[14px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Ciudad</div>
                        <input
                          value={newWarehouseProfile.city}
                          onChange={(e) => setNewWarehouseProfile((p) => ({ ...p, city: e.target.value }))}
                          className="mt-2 h-[48px] w-full rounded-full border-none bg-white px-5 text-[14px] text-[#8B90A0] outline-none"
                        />
                      </div>

                      <div>
                        <div className="text-[14px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Dirección</div>
                        <input
                          value={newWarehouseProfile.address}
                          onChange={(e) => setNewWarehouseProfile((p) => ({ ...p, address: e.target.value }))}
                          className="mt-2 h-[48px] w-full rounded-full border-none bg-white px-5 text-[14px] text-[#8B90A0] outline-none"
                        />

                        <div className="mt-6 text-[14px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Referencia interna</div>
                        <input
                          value={newWarehouseProfile.reference}
                          onChange={(e) => setNewWarehouseProfile((p) => ({ ...p, reference: e.target.value }))}
                          className="mt-2 h-[48px] w-full rounded-full border-none bg-white px-5 text-[14px] text-[#8B90A0] outline-none"
                        />

                        <div className="mt-6 grid grid-cols-2 gap-3">
                          <div>
                            <div className="text-[14px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Apertura</div>
                            <input
                              type="time"
                              value={newWarehouseProfile.openingHour}
                              onChange={(e) => setNewWarehouseProfile((p) => ({ ...p, openingHour: e.target.value }))}
                              className="mt-2 h-[48px] w-full rounded-full border-none bg-white px-5 text-[14px] text-[#8B90A0] outline-none"
                            />
                          </div>
                          <div>
                            <div className="text-[14px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Cierre</div>
                            <input
                              type="time"
                              value={newWarehouseProfile.closingHour}
                              onChange={(e) => setNewWarehouseProfile((p) => ({ ...p, closingHour: e.target.value }))}
                              className="mt-2 h-[48px] w-full rounded-full border-none bg-white px-5 text-[14px] text-[#8B90A0] outline-none"
                            />
                          </div>
                        </div>

                        <div className="mt-6 text-[14px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Capacidad máxima (unidades)</div>
                        <input
                          value={newWarehouseProfile.capacityUnits}
                          onChange={(e) => setNewWarehouseProfile((p) => ({ ...p, capacityUnits: e.target.value.replace(/[^\d]/g, "") }))}
                          className="mt-2 h-[48px] w-full rounded-full border-none bg-white px-5 text-[14px] text-[#8B90A0] outline-none"
                        />
                      </div>
                    </div>

                    <div className="mt-8 grid grid-cols-3 gap-8 text-[#2B334B]">
                      <div>
                        <div className="text-[14px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Responsable</div>
                        <input
                          value={newWarehouseProfile.managerName}
                          onChange={(e) => setNewWarehouseProfile((p) => ({ ...p, managerName: e.target.value }))}
                          className="mt-2 h-[48px] w-full rounded-full border-none bg-white px-5 text-[14px] text-[#8B90A0] outline-none"
                        />
                      </div>
                      <div>
                        <div className="text-[14px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Teléfono</div>
                        <input
                          value={newWarehouseProfile.phone}
                          onChange={(e) => setNewWarehouseProfile((p) => ({ ...p, phone: e.target.value }))}
                          className="mt-2 h-[48px] w-full rounded-full border-none bg-white px-5 text-[14px] text-[#8B90A0] outline-none"
                        />
                      </div>
                      <div>
                        <div className="text-[14px]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>Email</div>
                        <input
                          value={newWarehouseProfile.email}
                          onChange={(e) => setNewWarehouseProfile((p) => ({ ...p, email: e.target.value }))}
                          className="mt-2 h-[48px] w-full rounded-full border-none bg-white px-5 text-[14px] text-[#8B90A0] outline-none"
                        />
                      </div>
                    </div>

                    <div className="mt-8 flex items-center justify-end">
                      {warehouseCreateError ? (
                        <div className="mr-3 text-[13px] text-[#C0392B]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                          {warehouseCreateError}
                        </div>
                      ) : null}
                      {warehouseCreateOk ? (
                        <div className="mr-3 text-[13px] text-[#2B7A3D]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                          {warehouseCreateOk}
                        </div>
                      ) : null}
                      <button
                        type="button"
                        className="h-[50px] rounded-full bg-[#0B1230] px-8 text-[16px] text-white"
                        style={{ fontFamily: "var(--font-dashboarddemarca-heading)" }}
                        onClick={createWarehouseFromForm}
                      >
                        Crear almacén
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : activeKey === "almacenes-mapa" ? (
              <div className="h-full px-5 pb-5 pt-1">
                <div className="h-full rounded-2xl bg-white p-4">
                  <div className="grid h-full grid-cols-[minmax(0,1fr)_420px] gap-5">
                    <div className="rounded-2xl bg-[#E8EAEC] p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <div className="text-[16px] text-[#1B2140]" style={{ fontFamily: "var(--font-dashboarddemarca-heading)" }}>
                          Plano visual • ES-SEG
                        </div>
                        <div className="text-[12px] text-[#6B7286]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                          Click en un bloque para abrir detalle
                        </div>
                      </div>
                      <div className="relative h-[585px] rounded-2xl border border-[#CBD1DC] bg-white">
                        {WAREHOUSE_MAP_BLOCKS.map((block) => {
                          const active = block.key === selectedWarehouseMapBlock.key;
                          return (
                            <button
                              key={`warehouse-map-${block.key}`}
                              type="button"
                              onClick={() => setSelectedMapBlock(block.key)}
                              title={`${block.label} · ${block.itemCount} ítems`}
                              className={`absolute rounded-xl border text-center transition ${
                                active
                                  ? "border-[#121633] bg-white text-[#121633] shadow-[0_8px_24px_rgba(18,22,51,0.2)]"
                                  : "border-[#D2D6DF] bg-[#F6F7F9] text-[#9BA2B4] hover:border-[#ADB4C5] hover:bg-white"
                              }`}
                              style={{
                                left: `${block.x}%`,
                                top: `${block.y}%`,
                                width: `${block.w}%`,
                                height: `${block.h}%`,
                              }}
                            >
                              <div className="flex h-full flex-col items-center justify-center">
                                <div
                                  className={`text-[22px] leading-none ${active ? "text-[#121633]" : "text-[#BBC0CD]"}`}
                                  style={{ fontFamily: "var(--font-dashboarddemarca-heading)" }}
                                >
                                  {block.key}
                                </div>
                                <div className={`mt-1 text-[11px] ${active ? "text-[#58607A]" : "text-[#A5ABBA]"}`} style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                                  {block.itemCount} ítems
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      <div className="mt-3 flex items-center justify-between px-1">
                        <div className="text-[24px] text-[#1B2140]" style={{ fontFamily: "var(--font-dashboarddemarca-heading)" }}>
                          TOTAL : {warehouseMapTotalItems} ítems
                        </div>
                        <div className="text-[13px] text-[#6A7186]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                          Formato: Bloque - Piso - Caja (D-01-01)
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-rows-[auto_1fr] gap-3">
                        <div className="rounded-2xl bg-white p-5">
                          <div className="text-center text-[34px] leading-[38px] text-[#121633]" style={{ fontFamily: "var(--font-dashboarddemarca-heading)" }}>
                            {selectedWarehouseMapBlock.label}
                          </div>
                          <div className="mt-3 text-center text-[13px] text-[#6A7186]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                            {selectedWarehouseMapBlock.itemCount} ítems
                          </div>
                          <div className="mt-4 rounded-xl bg-[#F4F6FA] px-3 py-2 text-center">
                            {selectedMapBox ? (
                              <>
                                <div className="text-[12px] text-[#4F5B78]" style={{ fontFamily: "var(--font-dashboarddemarca-heading)" }}>
                                  {selectedMapBox.code}
                                </div>
                                <div className="mt-0.5 text-[12px] text-[#6A7186]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                                  {selectedMapBox.items} ítems - {selectedMapBox.category}
                                </div>
                              </>
                            ) : (
                              <div className="text-[12px] text-[#8B91A3]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                                Haz click en una caja para ver detalle
                              </div>
                            )}
                          </div>
                        </div>
                      <div className="rounded-2xl bg-white p-5">
                        <div className="sticky top-0 z-10 -mx-1 mb-3 rounded-xl bg-[#F4F6FA] px-3 py-2">
                          <div className="text-[13px] text-[#43506E]" style={{ fontFamily: "var(--font-dashboarddemarca-heading)" }}>
                            Detalle por pisos y cajas
                          </div>
                          <div className="mt-1 text-[11px] text-[#6A7186]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                            {selectedWarehouseMapBlock.rows.length} pisos · {selectedWarehouseMapBlock.rows.reduce((a, b) => a + b, 0)} cajas
                          </div>
                        </div>
                        <div className="max-h-[445px] space-y-2 overflow-y-auto pr-0.5">
                          {selectedWarehouseMapBlock.rows.map((slotCount, rowIdx) => (
                            <div key={`row-${selectedWarehouseMapBlock.key}-${rowIdx}`} className="rounded-xl border border-[#E2E6ED] bg-[#F8F9FC] p-2">
                              <div className="mb-2 flex items-center justify-between rounded-lg bg-white px-2 py-1">
                                <div className="text-[11px] text-[#4F5B78]" style={{ fontFamily: "var(--font-dashboarddemarca-heading)" }}>
                                  Piso {String(rowIdx + 1).padStart(2, "0")}
                                </div>
                                <div className="text-[10px] text-[#8A92A6]" style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}>
                                  {slotCount} caja{slotCount === 1 ? "" : "s"}
                                </div>
                              </div>
                              {selectedWarehouseMapBlock.key === "D" && rowIdx === 0 ? (
                                <div className="grid grid-cols-5 gap-1.5">
                                  {[0, 1, 2, 3].map((groupIdx) => (
                                    <div key={`d-row1-group-${groupIdx}`} className="space-y-1.5">
                                      {[0, 1, 2].map((cellIdx) => {
                                        const boxNumber = groupIdx * 3 + cellIdx + 1;
                                        const code = `D-01-${String(boxNumber).padStart(2, "0")}`;
                                        return (
                                          <button
                                            key={`slot-${code}`}
                                            type="button"
                                            title={`${code} · caja`}
                                            onClick={() => selectWarehouseBox(code)}
                                            className={warehouseBoxButtonClass(code)}
                                            style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}
                                          >
                                            {code}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  ))}
                                  <div className="space-y-1.5">
                                    <button
                                      type="button"
                                      title="D-01-13 · caja"
                                      onClick={() => selectWarehouseBox("D-01-13")}
                                      className={warehouseBoxButtonClass("D-01-13")}
                                      style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}
                                    >
                                      D-01-13
                                    </button>
                                    <button
                                      type="button"
                                      title="D-01-14 · caja grande"
                                      onClick={() => selectWarehouseBox("D-01-14")}
                                      className={warehouseBoxButtonClass("D-01-14", "large")}
                                      style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}
                                    >
                                      D-01-14
                                    </button>
                                  </div>
                                </div>
                              ) : selectedWarehouseMapBlock.key === "D" && rowIdx === 1 ? (
                                <div className="grid grid-cols-5 gap-1.5">
                                  <div className="space-y-1.5">
                                    {[1, 2, 3].map((n) => {
                                      const code = `D-02-${String(n).padStart(2, "0")}`;
                                      return (
                                        <button
                                          key={`slot-${code}`}
                                          type="button"
                                          title={`${code} · caja grande`}
                                          onClick={() => selectWarehouseBox(code)}
                                          className={warehouseBoxButtonClass(code, "large")}
                                          style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}
                                        >
                                          {code}
                                        </button>
                                      );
                                    })}
                                  </div>
                                  <div className="mt-[108px] space-y-1.5">
                                    {[4, 5, 6].map((n) => {
                                      const code = `D-02-${String(n).padStart(2, "0")}`;
                                      return (
                                        <button
                                          key={`slot-${code}`}
                                          type="button"
                                          title={`${code} · caja`}
                                          onClick={() => selectWarehouseBox(code)}
                                          className={warehouseBoxButtonClass(code)}
                                          style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}
                                        >
                                          {code}
                                        </button>
                                      );
                                    })}
                                  </div>
                                  <div className="mt-[68px] space-y-1.5">
                                    {[7, 8, 9, 10].map((n) => {
                                      const code = `D-02-${String(n).padStart(2, "0")}`;
                                      return (
                                        <button
                                          key={`slot-${code}`}
                                          type="button"
                                          title={`${code} · caja`}
                                          onClick={() => selectWarehouseBox(code)}
                                          className={warehouseBoxButtonClass(code)}
                                          style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}
                                        >
                                          {code}
                                        </button>
                                      );
                                    })}
                                  </div>
                                  <div className="mt-20 space-y-1.5">
                                    <button
                                      type="button"
                                      title="D-02-11 · caja grande"
                                      onClick={() => selectWarehouseBox("D-02-11")}
                                      className={warehouseBoxButtonClass("D-02-11", "large")}
                                      style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}
                                    >
                                      D-02-11
                                    </button>
                                  </div>
                                  <div className="mt-20 space-y-1.5">
                                    <button
                                      type="button"
                                      title="D-02-12 · caja grande"
                                      onClick={() => selectWarehouseBox("D-02-12")}
                                      className={warehouseBoxButtonClass("D-02-12", "large")}
                                      style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}
                                    >
                                      D-02-12
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className={`grid gap-1.5 ${slotCount >= 5 ? "grid-cols-5" : slotCount === 4 ? "grid-cols-4" : slotCount === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
                                  {Array.from({ length: Math.max(slotCount, 1) }).map((_, colIdx) => {
                                    const code = `${selectedWarehouseMapBlock.key}-${String(rowIdx + 1).padStart(2, "0")}-${String(colIdx + 1).padStart(2, "0")}`;
                                    const estimatedItems = Math.max(
                                      0,
                                      Math.floor(selectedWarehouseMapBlock.itemCount / Math.max(selectedWarehouseMapBlock.rows.reduce((a, b) => a + b, 0), 1))
                                    );
                                    return (
                                      <button
                                        key={`slot-${code}`}
                                        type="button"
                                        title={`${code} · ${estimatedItems} ítems aprox.`}
                                        onClick={() => selectWarehouseBox(code)}
                                        className={warehouseBoxButtonClass(code)}
                                        style={{ fontFamily: "var(--font-dashboarddemarca-body)" }}
                                      >
                                        {code}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
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
