"use client";

import { useMemo, useState } from "react";

export type Locale = "es" | "it" | "pt" | "en" | "de";

const SUPPORTED: Locale[] = ["es", "it", "pt", "en", "de"];
const LOCALE_KEY = "uiLocale";

const DICT: Record<Locale, Record<string, string>> = {
  es: {
    dashboard: "Dashboard",
    inventory: "Inventario",
    products: "Productos",
    settings: "Configuracion",
    orders: "Pedidos",
    payouts: "Payouts",
    invoices: "Facturas",
    analytics: "Analytics",
    returns: "Devoluciones",
    tasks: "Tareas",
    chat: "Chat",
    purchases: "Compras",
    suppliers: "Proveedores",
    customers: "Clientes",
    support: "Soporte",
    three_pl: "3PL",
    logout: "Logout",
    store: "Tienda",
    holding: "Holding",
    user: "Usuario",
    search: "Buscar",
    save: "Guardar",
    create: "Crear",
    channel: "Canal",
    warehouse: "Almacen",
    locale: "Idioma",
    back: "Volver",
  },
  it: {
    dashboard: "Dashboard",
    inventory: "Inventario",
    products: "Prodotti",
    settings: "Impostazioni",
    orders: "Ordini",
    payouts: "Payouts",
    invoices: "Fatture",
    analytics: "Analytics",
    returns: "Resi",
    tasks: "Attivita",
    chat: "Chat",
    purchases: "Acquisti",
    suppliers: "Fornitori",
    customers: "Clienti",
    support: "Supporto",
    three_pl: "3PL",
    logout: "Logout",
    store: "Negozio",
    holding: "Holding",
    user: "Utente",
    search: "Cerca",
    save: "Salva",
    create: "Crea",
    channel: "Canale",
    warehouse: "Magazzino",
    locale: "Lingua",
    back: "Indietro",
  },
  pt: {
    dashboard: "Dashboard",
    inventory: "Inventario",
    products: "Produtos",
    settings: "Configuracoes",
    orders: "Pedidos",
    payouts: "Payouts",
    invoices: "Faturas",
    analytics: "Analytics",
    returns: "Devolucoes",
    tasks: "Tarefas",
    chat: "Chat",
    purchases: "Compras",
    suppliers: "Fornecedores",
    customers: "Clientes",
    support: "Suporte",
    three_pl: "3PL",
    logout: "Logout",
    store: "Loja",
    holding: "Holding",
    user: "Usuario",
    search: "Buscar",
    save: "Guardar",
    create: "Criar",
    channel: "Canal",
    warehouse: "Armazem",
    locale: "Idioma",
    back: "Voltar",
  },
  en: {
    dashboard: "Dashboard",
    inventory: "Inventory",
    products: "Products",
    settings: "Settings",
    orders: "Orders",
    payouts: "Payouts",
    invoices: "Invoices",
    analytics: "Analytics",
    returns: "Returns",
    tasks: "Tasks",
    chat: "Chat",
    purchases: "Purchases",
    suppliers: "Suppliers",
    customers: "Customers",
    support: "Support",
    three_pl: "3PL",
    logout: "Logout",
    store: "Store",
    holding: "Holding",
    user: "User",
    search: "Search",
    save: "Save",
    create: "Create",
    channel: "Channel",
    warehouse: "Warehouse",
    locale: "Language",
    back: "Back",
  },
  de: {
    dashboard: "Dashboard",
    inventory: "Inventar",
    products: "Produkte",
    settings: "Einstellungen",
    orders: "Bestellungen",
    payouts: "Payouts",
    invoices: "Rechnungen",
    analytics: "Analytics",
    returns: "Retouren",
    tasks: "Aufgaben",
    chat: "Chat",
    purchases: "Einkauf",
    suppliers: "Lieferanten",
    customers: "Kunden",
    support: "Support",
    three_pl: "3PL",
    logout: "Logout",
    store: "Store",
    holding: "Holding",
    user: "Benutzer",
    search: "Suchen",
    save: "Speichern",
    create: "Erstellen",
    channel: "Kanal",
    warehouse: "Lager",
    locale: "Sprache",
    back: "Zuruck",
  },
};

function normalizeLocale(input: string | null | undefined): Locale {
  const raw = String(input || "es").toLowerCase();
  if (SUPPORTED.includes(raw as Locale)) return raw as Locale;
  return "es";
}

export function getInitialLocale(): Locale {
  if (typeof window === "undefined") return "es";
  const stored = localStorage.getItem(LOCALE_KEY);
  if (stored) return normalizeLocale(stored);

  try {
    const userRaw = localStorage.getItem("user");
    if (!userRaw) return "es";
    const parsed = JSON.parse(userRaw) as { preferredLocale?: string };
    return normalizeLocale(parsed.preferredLocale);
  } catch {
    return "es";
  }
}

export function useI18n() {
  const [locale, setLocale] = useState<Locale>(() => getInitialLocale());

  const t = useMemo(() => {
    return (key: string, fallback?: string) => {
      return DICT[locale]?.[key] || fallback || key;
    };
  }, [locale]);

  function changeLocale(next: string) {
    const normalized = normalizeLocale(next);
    setLocale(normalized);
    if (typeof window !== "undefined") {
      localStorage.setItem(LOCALE_KEY, normalized);
    }
  }

  return { locale, changeLocale, t, supportedLocales: SUPPORTED };
}
