const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");
const {
  ORDER_STATUS_FLOW,
  PAYMENT_STATUS_FLOW,
  isPositiveNumber,
  isNonNegativeNumber,
  parseDateInput,
  parseCurrencyCode,
  isAllowedTransition,
  buildInvoicePdfBuffer,
} = require("./finance-utils");

const prisma = new PrismaClient();
const app = express();

app.use(cors());
app.use(express.json());

function requireAuth(req, res, next) {
  const auth = req.headers.authorization || "";
  const [type, token] = auth.split(" ");

  if (type !== "Bearer" || !token) {
    return res.status(401).json({ error: "Missing Bearer token" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || "dev-secret");
    req.user = payload;
    return next();
  } catch (_e) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

async function getStoreMembership(userId, storeId) {
  return prisma.userStoreMembership.findFirst({
    where: { userId, storeId },
    select: { id: true, roleKey: true },
  });
}

async function canReadSensitive(userId, storeId, roleKey) {
  if (["admin", "admin_ste", "owner"].includes(String(roleKey || "").toLowerCase())) {
    return true;
  }

  const financePermission = await prisma.userPermission.findFirst({
    where: {
      userId,
      storeId,
      granted: true,
      permission: { key: "finance.read" },
    },
    select: { id: true },
  });

  return Boolean(financePermission);
}

async function hasPermission(userId, storeId, permissionKey) {
  const permission = await prisma.userPermission.findFirst({
    where: {
      userId,
      storeId,
      granted: true,
      permission: { key: permissionKey },
    },
    select: { id: true },
  });

  return Boolean(permission);
}

async function canManageCatalog(userId, storeId, roleKey) {
  if (["admin", "admin_ste", "owner"].includes(String(roleKey || "").toLowerCase())) return true;
  return hasPermission(userId, storeId, "products.write");
}

async function canManageOrders(userId, storeId, roleKey) {
  if (["admin", "admin_ste", "owner", "ops"].includes(String(roleKey || "").toLowerCase())) return true;
  return hasPermission(userId, storeId, "orders.write");
}

async function canManagePayouts(userId, storeId, roleKey) {
  if (["admin", "admin_ste", "owner"].includes(String(roleKey || "").toLowerCase())) return true;
  return hasPermission(userId, storeId, "payouts.write");
}

async function canManageInvoices(userId, storeId, roleKey) {
  if (["admin", "admin_ste", "owner"].includes(String(roleKey || "").toLowerCase())) return true;
  return hasPermission(userId, storeId, "invoices.write");
}

async function canManageReturns(userId, storeId, roleKey) {
  if (["admin", "admin_ste", "owner", "warehouse", "ops"].includes(String(roleKey || "").toLowerCase())) return true;
  return hasPermission(userId, storeId, "inventory.write");
}

async function canManagePurchases(userId, storeId, roleKey) {
  if (["admin", "admin_ste", "owner", "ops"].includes(String(roleKey || "").toLowerCase())) return true;
  return hasPermission(userId, storeId, "purchases.write");
}

async function canManageTasks(userId, storeId, roleKey) {
  if (["admin", "admin_ste", "owner", "ops", "warehouse"].includes(String(roleKey || "").toLowerCase())) return true;
  return hasPermission(userId, storeId, "tasks.write");
}

async function canUseChat(userId, storeId, roleKey) {
  if (["admin", "admin_ste", "owner", "ops", "warehouse"].includes(String(roleKey || "").toLowerCase())) return true;
  return hasPermission(userId, storeId, "tasks.write");
}

async function canReadNotifications(userId, storeId, roleKey) {
  if (["admin", "admin_ste", "owner", "ops", "warehouse"].includes(String(roleKey || "").toLowerCase())) return true;
  return hasPermission(userId, storeId, "tasks.write");
}

async function createNotificationSafe(payload) {
  try {
    return await prisma.notification.create({
      data: {
        storeId: payload.storeId,
        userId: payload.userId || null,
        type: payload.type || "system",
        severity: payload.severity || "info",
        title: String(payload.title || "").trim(),
        body: payload.body || null,
        linkedEntityType: payload.linkedEntityType || null,
        linkedEntityId: payload.linkedEntityId || null,
        createdByUserId: payload.createdByUserId || null,
      },
    });
  } catch (err) {
    console.error("Notification create error:", err);
    return null;
  }
}

function normalizeMoney(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function numberOrZero(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function roundMoney(value) {
  return Number((Number(value || 0)).toFixed(2));
}

function parseDateRange(query) {
  const from = query?.dateFrom ? parseDateInput(query.dateFrom) : null;
  const to = query?.dateTo ? parseDateInput(query.dateTo) : null;
  const toEnd = to ? new Date(to.getTime() + 24 * 60 * 60 * 1000 - 1) : null;
  return {
    from,
    to: toEnd,
  };
}

const ORDER_STATUSES = new Set(Object.keys(ORDER_STATUS_FLOW));
const PAYMENT_STATUSES = new Set(Object.keys(PAYMENT_STATUS_FLOW));
const PURCHASE_ORDER_STATUSES = new Set([
  "draft",
  "sent",
  "priced",
  "paid",
  "preparing",
  "checklist",
  "tracking_received",
  "in_transit",
  "received",
  "verified",
  "closed",
  "incident",
]);
const THREE_PL_LEG_STATUSES = new Set(["planned", "in_transit", "delivered", "delayed"]);
const PRESENCE_STATUSES = new Set(["online", "away", "offline"]);

async function nextInvoiceNumber(tx, storeId) {
  const store = await tx.store.findUnique({
    where: { id: storeId },
    select: { id: true, invoicePrefix: true, invoiceSequenceNext: true },
  });
  if (!store) throw new Error("Store not found");

  const sequence = Number(store.invoiceSequenceNext || 1);
  const prefix = store.invoicePrefix || "INV";
  const number = `${prefix}-${String(sequence).padStart(6, "0")}`;

  await tx.store.update({
    where: { id: storeId },
    data: { invoiceSequenceNext: sequence + 1 },
  });

  return number;
}

async function generateInternalEan(storeId) {
  const count = await prisma.product.count({ where: { storeId, isInternalEan: true } });
  const next = String(count + 1).padStart(6, "0");
  return `INT-${next}`;
}

async function findProductByScan(storeId, scanCode) {
  const trimmed = String(scanCode || "").trim();
  if (!trimmed) return null;

  const byEan = await prisma.product.findFirst({
    where: { storeId, ean: trimmed },
    select: { id: true, ean: true, brand: true, model: true, name: true, status: true },
  });

  if (byEan) return { product: byEan, via: "ean" };

  const alias = await prisma.eanAlias.findFirst({
    where: { storeId, ean: trimmed },
    include: {
      product: {
        select: { id: true, ean: true, brand: true, model: true, name: true, status: true },
      },
    },
  });

  if (!alias) return null;
  return { product: alias.product, via: "alias", alias: alias.ean };
}

async function consumeProductFifo(tx, params) {
  const {
    storeId,
    productId,
    quantity,
    userId,
    referenceType,
    referenceId,
    reason,
    warehouseId = null,
    allowPartial = false,
  } = params;

  const lots = await tx.inventoryLot.findMany({
    where: {
      storeId,
      productId,
      quantityAvailable: { gt: 0 },
      status: "available",
      ...(warehouseId ? { warehouseId } : {}),
    },
    orderBy: [{ receivedAt: "asc" }, { createdAt: "asc" }],
  });

  const requestedQty = Number(quantity);
  const totalAvailable = lots.reduce((sum, lot) => sum + Number(lot.quantityAvailable), 0);
  if (!allowPartial && totalAvailable < requestedQty) {
    return {
      ok: false,
      available: totalAvailable,
      requested: requestedQty,
      consumedQty: 0,
      remaining: requestedQty,
      cogs: 0,
      consumedLots: [],
    };
  }

  let remaining = requestedQty;
  let cogs = 0;
  const consumedLots = [];

  for (const lot of lots) {
    if (remaining <= 0) break;
    const current = Number(lot.quantityAvailable);
    if (current <= 0) continue;

    const used = Math.min(current, remaining);
    remaining -= used;

    const updated = await tx.inventoryLot.update({
      where: { id: lot.id },
      data: { quantityAvailable: current - used },
    });

    const movement = await tx.inventoryMovement.create({
      data: {
        storeId,
        productId,
        lotId: lot.id,
        warehouseId: lot.warehouseId,
        movementType: "sale_out",
        quantity: -used,
        unitCostEurFrozen: lot.unitCostEurFrozen,
        referenceType: referenceType || "order",
        referenceId: referenceId || null,
        reason: reason || "Stock out",
        createdByUserId: userId,
      },
    });

    const lineCost = roundMoney(numberOrZero(lot.unitCostEurFrozen) * used);
    cogs += lineCost;
    consumedLots.push({
      lotId: lot.id,
      lotCode: lot.lotCode,
      consumed: used,
      before: current,
      after: Number(updated.quantityAvailable),
      unitCostEurFrozen: normalizeMoney(lot.unitCostEurFrozen),
      movementId: movement.id,
    });
  }

  return {
    ok: remaining === 0,
    available: totalAvailable,
    requested: requestedQty,
    consumedQty: requestedQty - remaining,
    remaining,
    cogs: roundMoney(cogs),
    consumedLots,
  };
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "Missing email or password" });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const memberships = await prisma.userStoreMembership.findMany({
      where: { userId: user.id },
      include: { store: { include: { holding: true } } },
    });

    const token = jwt.sign(
      { sub: user.id, email: user.email, locale: user.preferredLocale },
      process.env.JWT_SECRET || "dev-secret",
      { expiresIn: "2h" }
    );

    return res.json({
      accessToken: token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        preferredLocale: user.preferredLocale,
      },
      stores: memberships.map((m) => ({
        roleKey: m.roleKey,
        storeId: m.storeId,
        storeCode: m.store.code,
        storeName: m.store.name,
        holdingId: m.store.holdingId,
        holdingName: m.store.holding.name,
      })),
    });
  } catch (err) {
    console.error("POST /auth/login error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/me", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, fullName: true, preferredLocale: true, isActive: true },
    });

    const memberships = await prisma.userStoreMembership.findMany({
      where: { userId },
      include: { store: { include: { holding: true } } },
    });

    return res.json({
      user,
      stores: memberships.map((m) => ({
        roleKey: m.roleKey,
        storeId: m.storeId,
        storeCode: m.store.code,
        storeName: m.store.name,
        holdingId: m.store.holdingId,
        holdingName: m.store.holding.name,
      })),
    });
  } catch (err) {
    console.error("GET /me error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/holdings", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const memberships = await prisma.userStoreMembership.findMany({
      where: { userId },
      include: { store: { include: { holding: true } } },
    });

    const byId = new Map();
    for (const m of memberships) {
      byId.set(m.store.holding.id, { id: m.store.holding.id, name: m.store.holding.name });
    }

    return res.json({ holdings: Array.from(byId.values()) });
  } catch (err) {
    console.error("GET /holdings error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/stores", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const holdingId = String(req.query.holdingId || "").trim();

    const memberships = await prisma.userStoreMembership.findMany({
      where: { userId },
      include: { store: true },
    });

    const stores = memberships
      .map((m) => ({
        roleKey: m.roleKey,
        storeId: m.storeId,
        holdingId: m.store.holdingId,
        storeCode: m.store.code,
        storeName: m.store.name,
        status: m.store.status,
      }))
      .filter((s) => (!holdingId ? true : s.holdingId === holdingId));

    return res.json({ stores });
  } catch (err) {
    console.error("GET /stores error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/stores/:storeId/bootstrap", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { storeId } = req.params;

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });

    const [store, warehouses, channels] = await Promise.all([
      prisma.store.findUnique({
        where: { id: storeId },
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
          description: true,
          logoUrl: true,
          baseCurrencyCode: true,
          invoicePrefix: true,
        },
      }),
      prisma.warehouse.findMany({
        where: { storeId, status: "active" },
        orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      }),
      prisma.salesChannel.findMany({
        where: { storeId },
        orderBy: { name: "asc" },
      }),
    ]);

    return res.json({ store, roleKey: membership.roleKey, warehouses, channels });
  } catch (err) {
    console.error("GET /stores/:storeId/bootstrap error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/stores/:storeId/permissions", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { storeId } = req.params;

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });

    const [canSensitive, canCatalogWrite, canOrdersWrite, canPayoutsWrite, canInvoicesWrite, canTasksWrite] = await Promise.all([
      canReadSensitive(userId, storeId, membership.roleKey),
      canManageCatalog(userId, storeId, membership.roleKey),
      canManageOrders(userId, storeId, membership.roleKey),
      canManagePayouts(userId, storeId, membership.roleKey),
      canManageInvoices(userId, storeId, membership.roleKey),
      canManageTasks(userId, storeId, membership.roleKey),
    ]);

    return res.json({
      roleKey: membership.roleKey,
      permissions: {
        inventoryRead: true,
        inventoryWrite: ["admin", "admin_ste", "owner", "warehouse", "ops"].includes(
          String(membership.roleKey).toLowerCase()
        ),
        catalogWrite: canCatalogWrite,
        ordersWrite: canOrdersWrite,
        payoutsWrite: canPayoutsWrite,
        invoicesWrite: canInvoicesWrite,
        returnsWrite: ["admin", "admin_ste", "owner", "warehouse", "ops"].includes(
          String(membership.roleKey).toLowerCase()
        ),
        analyticsRead: canSensitive,
        financeRead: canSensitive,
        suppliersRead: canSensitive,
        tasksWrite: canTasksWrite,
      },
    });
  } catch (err) {
    console.error("GET /stores/:storeId/permissions error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/stores/:storeId/warehouses", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { storeId } = req.params;

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });

    const warehouses = await prisma.warehouse.findMany({
      where: { storeId },
      include: { locations: { where: { isActive: true }, orderBy: { code: "asc" } } },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });

    return res.json({ warehouses });
  } catch (err) {
    console.error("GET /stores/:storeId/warehouses error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.post("/stores/:storeId/warehouses", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { storeId } = req.params;
    const { code, name, country, type, status, isDefault } = req.body || {};

    if (!code || !name) return res.status(400).json({ error: "Missing code or name" });
    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });

    const canWrite = await canManageCatalog(userId, storeId, membership.roleKey);
    if (!canWrite) return res.status(403).json({ error: "No permission to manage warehouses" });

    const warehouse = await prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.warehouse.updateMany({ where: { storeId, isDefault: true }, data: { isDefault: false } });
      }

      return tx.warehouse.create({
        data: {
          storeId,
          code: String(code).trim().toUpperCase(),
          name: String(name).trim(),
          country: country ? String(country).trim().toUpperCase() : null,
          type: type || "own",
          status: status || "active",
          isDefault: Boolean(isDefault),
        },
      });
    });

    return res.status(201).json({ warehouse });
  } catch (err) {
    if (err?.code === "P2002") return res.status(409).json({ error: "Warehouse code already exists" });
    console.error("POST /stores/:storeId/warehouses error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.post("/stores/:storeId/warehouses/:warehouseId/locations", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { storeId, warehouseId } = req.params;
    const { code, name } = req.body || {};

    if (!code) return res.status(400).json({ error: "Missing code" });
    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });

    const canWrite = await canManageCatalog(userId, storeId, membership.roleKey);
    if (!canWrite) return res.status(403).json({ error: "No permission to manage locations" });

    const warehouse = await prisma.warehouse.findFirst({ where: { id: warehouseId, storeId }, select: { id: true } });
    if (!warehouse) return res.status(404).json({ error: "Warehouse not found" });

    const location = await prisma.warehouseLocation.create({
      data: {
        warehouseId,
        code: String(code).trim().toUpperCase(),
        name: name ? String(name).trim() : null,
      },
    });

    return res.status(201).json({ location });
  } catch (err) {
    if (err?.code === "P2002") return res.status(409).json({ error: "Location code already exists" });
    console.error("POST /stores/:storeId/warehouses/:warehouseId/locations error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/stores/:storeId/channels", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { storeId } = req.params;

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });

    const channels = await prisma.salesChannel.findMany({
      where: { storeId },
      orderBy: { name: "asc" },
    });
    return res.json({ channels });
  } catch (err) {
    console.error("GET /stores/:storeId/channels error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.post("/stores/:storeId/channels", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { storeId } = req.params;
    const { code, name, type, status, feePercent, cpaFixed, payoutTerms, countryCode, currencyCode } = req.body || {};

    if (!code || !name || !type) return res.status(400).json({ error: "Missing code, name or type" });
    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });

    const canWrite = await canManageCatalog(userId, storeId, membership.roleKey);
    if (!canWrite) return res.status(403).json({ error: "No permission to manage channels" });

    const parsedCurrency = currencyCode ? parseCurrencyCode(currencyCode) : null;
    if (currencyCode && !parsedCurrency) {
      return res.status(400).json({ error: "Invalid currencyCode format (expected ISO-4217 like EUR)" });
    }

    const channel = await prisma.salesChannel.create({
      data: {
        storeId,
        code: String(code).trim().toUpperCase(),
        name: String(name).trim(),
        type,
        status: status || "active",
        feePercent: feePercent ?? null,
        cpaFixed: cpaFixed ?? null,
        payoutTerms: payoutTerms || null,
        countryCode: countryCode ? String(countryCode).trim().toUpperCase() : null,
        currencyCode: parsedCurrency,
      },
    });

    return res.status(201).json({ channel });
  } catch (err) {
    if (err?.code === "P2002") return res.status(409).json({ error: "Channel code already exists" });
    console.error("POST /stores/:storeId/channels error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/suppliers", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const storeId = String(req.query.storeId || "").trim();
    const q = String(req.query.q || "").trim();
    if (!storeId) return res.status(400).json({ error: "Missing storeId" });

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const canSensitive = await canReadSensitive(userId, storeId, membership.roleKey);
    if (!canSensitive) return res.status(403).json({ error: "No permission to read suppliers" });

    const suppliers = await prisma.supplier.findMany({
      where: {
        storeId,
        ...(q
          ? {
              OR: [
                { code: { contains: q, mode: "insensitive" } },
                { name: { contains: q, mode: "insensitive" } },
                { country: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      take: 300,
    });

    return res.json({ suppliers });
  } catch (err) {
    console.error("GET /suppliers error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.post("/suppliers", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const {
      storeId,
      code,
      name,
      contactName,
      contactEmail,
      city,
      country,
      defaultCurrencyCode,
      paymentMethod,
      catalogUrl,
      vacationNote,
      isActive,
    } = req.body || {};

    if (!storeId || !code || !name) return res.status(400).json({ error: "Missing storeId/code/name" });

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const canWrite = await canManagePurchases(userId, storeId, membership.roleKey);
    if (!canWrite) return res.status(403).json({ error: "No permission to manage suppliers" });

    const parsedCurrency = defaultCurrencyCode ? parseCurrencyCode(defaultCurrencyCode) : null;
    if (defaultCurrencyCode && !parsedCurrency) {
      return res.status(400).json({ error: "Invalid defaultCurrencyCode format" });
    }

    const supplier = await prisma.supplier.create({
      data: {
        storeId,
        code: String(code).trim(),
        name: String(name).trim(),
        contactName: contactName || null,
        contactEmail: contactEmail || null,
        city: city || null,
        country: country || null,
        defaultCurrencyCode: parsedCurrency || null,
        paymentMethod: paymentMethod || null,
        catalogUrl: catalogUrl || null,
        vacationNote: vacationNote || null,
        isActive: isActive !== undefined ? Boolean(isActive) : true,
      },
    });

    return res.status(201).json({ supplier });
  } catch (err) {
    if (err?.code === "P2002") return res.status(409).json({ error: "Supplier code already exists" });
    console.error("POST /suppliers error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/purchases", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const storeId = String(req.query.storeId || "").trim();
    const status = String(req.query.status || "").trim();
    if (!storeId) return res.status(400).json({ error: "Missing storeId" });

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const canSensitive = await canReadSensitive(userId, storeId, membership.roleKey);
    if (!canSensitive) return res.status(403).json({ error: "No permission to read purchases" });

    const purchases = await prisma.purchaseOrder.findMany({
      where: { storeId, ...(status ? { status } : {}) },
      include: {
        supplier: { select: { id: true, code: true, name: true } },
        items: { select: { id: true, title: true, quantityOrdered: true, totalCostEur: true } },
      },
      orderBy: { orderedAt: "desc" },
      take: 200,
    });

    return res.json({
      purchases: purchases.map((po) => ({
        ...po,
        totalAmountEur: normalizeMoney(po.totalAmountEur),
        items: po.items.map((it) => ({ ...it, totalCostEur: normalizeMoney(it.totalCostEur) })),
      })),
    });
  } catch (err) {
    console.error("GET /purchases error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.post("/purchases", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { storeId, supplierId, poNumber, orderedAt, expectedAt, note, items } = req.body || {};
    if (!storeId || !supplierId || !poNumber) {
      return res.status(400).json({ error: "Missing storeId/supplierId/poNumber" });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Purchase must include items" });
    }

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const canWrite = await canManagePurchases(userId, storeId, membership.roleKey);
    if (!canWrite) return res.status(403).json({ error: "No permission to manage purchases" });

    const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, storeId }, select: { id: true } });
    if (!supplier) return res.status(400).json({ error: "Invalid supplierId for store" });

    const parsedOrderedAt = orderedAt ? parseDateInput(orderedAt) : new Date();
    const parsedExpectedAt = expectedAt ? parseDateInput(expectedAt) : null;
    if (!parsedOrderedAt || (expectedAt && !parsedExpectedAt)) return res.status(400).json({ error: "Invalid date values" });

    for (const item of items) {
      if (!item.title || !Number.isInteger(Number(item.quantityOrdered)) || Number(item.quantityOrdered) <= 0) {
        return res.status(400).json({ error: "Each item must include title and positive integer quantityOrdered" });
      }
      if (!isPositiveNumber(item.unitCostOriginal) || !isPositiveNumber(item.fxToEur)) {
        return res.status(400).json({ error: "Each item needs positive unitCostOriginal and fxToEur" });
      }
      if (!parseCurrencyCode(item.currencyCode || "")) {
        return res.status(400).json({ error: "Each item needs valid currencyCode" });
      }
    }

    const purchase = await prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.create({
        data: {
          storeId,
          supplierId,
          poNumber: String(poNumber).trim(),
          status: "draft",
          orderedAt: parsedOrderedAt,
          expectedAt: parsedExpectedAt,
          note: note || null,
          createdByUserId: userId,
        },
      });

      let totalEur = 0;
      for (const item of items) {
        const qty = Number(item.quantityOrdered);
        const unitOriginal = Number(item.unitCostOriginal);
        const fx = Number(item.fxToEur);
        const unitEur = Number((unitOriginal * fx).toFixed(4));
        const totalCostEur = Number((unitEur * qty).toFixed(2));
        totalEur += totalCostEur;

        await tx.purchaseOrderItem.create({
          data: {
            storeId,
            purchaseOrderId: po.id,
            productId: item.productId || null,
            title: String(item.title).trim(),
            ean: item.ean || null,
            quantityOrdered: qty,
            quantityReceived: 0,
            unitCostOriginal: String(unitOriginal),
            currencyCode: parseCurrencyCode(item.currencyCode),
            fxToEur: String(fx),
            unitCostEurFrozen: String(unitEur),
            totalCostEur: String(totalCostEur),
          },
        });
      }

      return tx.purchaseOrder.update({
        where: { id: po.id },
        data: { totalAmountEur: String(Number(totalEur.toFixed(2))) },
        include: {
          supplier: { select: { id: true, code: true, name: true } },
          items: true,
        },
      });
    });

    return res.status(201).json({
      purchase: {
        ...purchase,
        totalAmountEur: normalizeMoney(purchase.totalAmountEur),
        items: purchase.items.map((it) => ({
          ...it,
          unitCostOriginal: normalizeMoney(it.unitCostOriginal),
          fxToEur: normalizeMoney(it.fxToEur),
          unitCostEurFrozen: normalizeMoney(it.unitCostEurFrozen),
          totalCostEur: normalizeMoney(it.totalCostEur),
        })),
      },
    });
  } catch (err) {
    if (err?.code === "P2002") return res.status(409).json({ error: "PO number already exists" });
    console.error("POST /purchases error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/purchases/:purchaseId", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { purchaseId } = req.params;
    const storeId = String(req.query.storeId || "").trim();
    if (!storeId) return res.status(400).json({ error: "Missing storeId" });

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const canSensitive = await canReadSensitive(userId, storeId, membership.roleKey);
    if (!canSensitive) return res.status(403).json({ error: "No permission to read purchases" });

    const purchase = await prisma.purchaseOrder.findFirst({
      where: { id: purchaseId, storeId },
      include: {
        supplier: true,
        items: true,
        payments: true,
        shipments3pl: { include: { legs: { orderBy: { legOrder: "asc" } } } },
      },
    });
    if (!purchase) return res.status(404).json({ error: "Purchase not found" });

    const productIds = purchase.items.map((it) => it.productId).filter(Boolean);
    const listings =
      productIds.length > 0
        ? await prisma.productChannel.findMany({
            where: {
              productId: { in: productIds },
              listingStatus: "active",
              priceEurFrozen: { not: null },
            },
            select: { productId: true, priceEurFrozen: true },
          })
        : [];

    const listingPriceByProduct = new Map();
    for (const row of listings) {
      const price = normalizeMoney(row.priceEurFrozen) || 0;
      const current = listingPriceByProduct.get(row.productId) || 0;
      if (price > current) listingPriceByProduct.set(row.productId, price);
    }

    const poCostEur = normalizeMoney(purchase.totalAmountEur) || 0;
    const logistics3plEur = purchase.shipments3pl.reduce((sumShip, shipment) => {
      const legCost = shipment.legs.reduce((sumLeg, leg) => sumLeg + (normalizeMoney(leg.costEurFrozen) || 0), 0);
      return sumShip + legCost;
    }, 0);
    const landedCostEur = roundMoney(poCostEur + logistics3plEur);
    const estimatedRevenueEur = roundMoney(
      purchase.items.reduce((sum, item) => {
        const estimatedPrice = item.productId ? listingPriceByProduct.get(item.productId) || 0 : 0;
        return sum + estimatedPrice * Number(item.quantityOrdered || 0);
      }, 0)
    );
    const estimatedGrossProfitEur = roundMoney(estimatedRevenueEur - landedCostEur);
    const estimatedMarginPct = estimatedRevenueEur > 0 ? roundMoney((estimatedGrossProfitEur / estimatedRevenueEur) * 100) : null;

    return res.json({
      purchase: {
        ...purchase,
        totalAmountEur: normalizeMoney(purchase.totalAmountEur),
        items: purchase.items.map((it) => ({
          ...it,
          unitCostOriginal: normalizeMoney(it.unitCostOriginal),
          fxToEur: normalizeMoney(it.fxToEur),
          unitCostEurFrozen: normalizeMoney(it.unitCostEurFrozen),
          totalCostEur: normalizeMoney(it.totalCostEur),
        })),
        payments: purchase.payments.map((p) => ({
          ...p,
          amountOriginal: normalizeMoney(p.amountOriginal),
          fxToEur: normalizeMoney(p.fxToEur),
          amountEurFrozen: normalizeMoney(p.amountEurFrozen),
        })),
        shipments3pl: purchase.shipments3pl.map((shipment) => ({
          ...shipment,
          legs: shipment.legs.map((leg) => ({
            ...leg,
            costOriginal: normalizeMoney(leg.costOriginal),
            fxToEur: normalizeMoney(leg.fxToEur),
            costEurFrozen: normalizeMoney(leg.costEurFrozen),
          })),
        })),
        summary: {
          poCostEur,
          logistics3plEur: roundMoney(logistics3plEur),
          landedCostEur,
          estimatedRevenueEur,
          estimatedGrossProfitEur,
          estimatedMarginPct,
        },
      },
    });
  } catch (err) {
    console.error("GET /purchases/:purchaseId error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.patch("/purchases/:purchaseId/status", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { purchaseId } = req.params;
    const { storeId, status } = req.body || {};
    if (!storeId || !status) return res.status(400).json({ error: "Missing storeId/status" });
    if (!PURCHASE_ORDER_STATUSES.has(String(status))) return res.status(400).json({ error: "Invalid purchase status" });

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const canWrite = await canManagePurchases(userId, storeId, membership.roleKey);
    if (!canWrite) return res.status(403).json({ error: "No permission to manage purchases" });

    const updated = await prisma.purchaseOrder.updateMany({
      where: { id: purchaseId, storeId },
      data: { status },
    });
    if (updated.count === 0) return res.status(404).json({ error: "Purchase not found" });

    const purchase = await prisma.purchaseOrder.findUnique({ where: { id: purchaseId } });
    return res.json({ purchase: { ...purchase, totalAmountEur: normalizeMoney(purchase.totalAmountEur) } });
  } catch (err) {
    console.error("PATCH /purchases/:purchaseId/status error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.post("/purchases/:purchaseId/payments", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { purchaseId } = req.params;
    const { storeId, paidAt, currencyCode, amountOriginal, fxToEur, note } = req.body || {};
    if (!storeId || !currencyCode || !amountOriginal || !fxToEur) {
      return res.status(400).json({ error: "Missing payment fields" });
    }
    if (!isPositiveNumber(amountOriginal) || !isPositiveNumber(fxToEur)) {
      return res.status(400).json({ error: "amountOriginal/fxToEur must be positive" });
    }
    const parsedCurrency = parseCurrencyCode(currencyCode);
    if (!parsedCurrency) return res.status(400).json({ error: "Invalid currencyCode" });
    const parsedPaidAt = paidAt ? parseDateInput(paidAt) : new Date();
    if (!parsedPaidAt) return res.status(400).json({ error: "Invalid paidAt" });

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const canWrite = await canManagePurchases(userId, storeId, membership.roleKey);
    if (!canWrite) return res.status(403).json({ error: "No permission to manage purchases" });

    const purchase = await prisma.purchaseOrder.findFirst({ where: { id: purchaseId, storeId }, select: { id: true } });
    if (!purchase) return res.status(404).json({ error: "Purchase not found" });

    const amountEurFrozen = Number((Number(amountOriginal) * Number(fxToEur)).toFixed(2));
    const payment = await prisma.purchaseOrderPayment.create({
      data: {
        storeId,
        purchaseOrderId: purchaseId,
        paidAt: parsedPaidAt,
        currencyCode: parsedCurrency,
        amountOriginal: String(amountOriginal),
        fxToEur: String(fxToEur),
        amountEurFrozen: String(amountEurFrozen),
        note: note || null,
        createdByUserId: userId,
      },
    });

    return res.status(201).json({
      payment: {
        ...payment,
        amountOriginal: normalizeMoney(payment.amountOriginal),
        fxToEur: normalizeMoney(payment.fxToEur),
        amountEurFrozen: normalizeMoney(payment.amountEurFrozen),
      },
    });
  } catch (err) {
    console.error("POST /purchases/:purchaseId/payments error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.post("/purchases/:purchaseId/receive", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { purchaseId } = req.params;
    const { storeId, warehouseId, locationId, note, lines } = req.body || {};

    if (!storeId || !warehouseId) return res.status(400).json({ error: "Missing storeId/warehouseId" });
    if (lines !== undefined && !Array.isArray(lines)) {
      return res.status(400).json({ error: "lines must be an array when provided" });
    }

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const canWrite = await canManagePurchases(userId, storeId, membership.roleKey);
    if (!canWrite) return res.status(403).json({ error: "No permission to receive purchase orders" });

    const warehouse = await prisma.warehouse.findFirst({
      where: { id: warehouseId, storeId },
      select: { id: true },
    });
    if (!warehouse) return res.status(400).json({ error: "Invalid warehouseId for this store" });

    if (locationId) {
      const location = await prisma.warehouseLocation.findFirst({
        where: { id: locationId, warehouseId },
        select: { id: true },
      });
      if (!location) return res.status(400).json({ error: "Invalid locationId for selected warehouse" });
    }

    const result = await prisma.$transaction(async (tx) => {
      const purchase = await tx.purchaseOrder.findFirst({
        where: { id: purchaseId, storeId },
        include: {
          supplier: { select: { id: true, name: true } },
          items: true,
          shipments3pl: { include: { legs: true } },
        },
      });
      if (!purchase) return { error: { code: "NOT_FOUND" } };
      if (purchase.status === "closed") return { error: { code: "PO_CLOSED" } };

      const lineMap = new Map();
      for (const it of purchase.items) {
        lineMap.set(it.id, it);
      }

      const selectedLines =
        Array.isArray(lines) && lines.length > 0
          ? lines.map((l) => ({
              purchaseOrderItemId: String(l.purchaseOrderItemId || "").trim(),
              quantity: Number(l.quantity || 0),
            }))
          : purchase.items.map((it) => ({
              purchaseOrderItemId: it.id,
              quantity: Number(it.quantityOrdered) - Number(it.quantityReceived),
            }));

      if (selectedLines.length === 0) return { error: { code: "NO_LINES_TO_RECEIVE" } };

      const totalPoBaseCostEur = purchase.items.reduce(
        (sum, it) => sum + numberOrZero(it.unitCostEurFrozen) * Number(it.quantityOrdered || 0),
        0
      );
      const total3plCostEur = purchase.shipments3pl.reduce((sumShip, shipment) => {
        const legsCost = shipment.legs.reduce((sumLeg, leg) => sumLeg + numberOrZero(leg.costEurFrozen), 0);
        return sumShip + legsCost;
      }, 0);

      for (const line of selectedLines) {
        if (!line.purchaseOrderItemId || !Number.isInteger(line.quantity) || line.quantity <= 0) {
          return { error: { code: "INVALID_RECEIVE_LINE" } };
        }
        const item = lineMap.get(line.purchaseOrderItemId);
        if (!item) return { error: { code: "ITEM_NOT_FOUND" } };
        const pendingQty = Number(item.quantityOrdered) - Number(item.quantityReceived);
        if (line.quantity > pendingQty) {
          return {
            error: {
              code: "QTY_EXCEEDS_PENDING",
              purchaseOrderItemId: item.id,
              pendingQty,
              requestedQty: line.quantity,
            },
          };
        }
      }

      const receivedLots = [];
      const movementIds = [];

      for (const line of selectedLines) {
        const item = lineMap.get(line.purchaseOrderItemId);
        const receiveQty = Number(line.quantity);
        if (!item.productId) return { error: { code: "ITEM_WITHOUT_PRODUCT", purchaseOrderItemId: item.id } };
        const lotCode = `${purchase.poNumber}-${item.id.slice(-6)}-${Date.now()}`;

        const baseUnitEur = numberOrZero(item.unitCostEurFrozen);
        const baseLineCostEur = roundMoney(baseUnitEur * receiveQty);
        const allocationShare = totalPoBaseCostEur > 0 ? baseLineCostEur / totalPoBaseCostEur : 0;
        const allocated3plLineCostEur = roundMoney(total3plCostEur * allocationShare);
        const allocated3plUnitEur = receiveQty > 0 ? roundMoney(allocated3plLineCostEur / receiveQty) : 0;
        const landedUnitEur = roundMoney(baseUnitEur + allocated3plUnitEur);

        const lot = await tx.inventoryLot.create({
          data: {
            storeId,
            productId: item.productId,
            warehouseId,
            locationId: locationId || null,
            lotCode,
            sourceType: "purchase_order",
            supplierName: purchase.supplier.name,
            purchasedAt: purchase.orderedAt,
            quantityReceived: receiveQty,
            quantityAvailable: receiveQty,
            unitCostOriginal: item.unitCostOriginal,
            costCurrencyCode: item.currencyCode,
            fxToEur: item.fxToEur,
            unitCostEurFrozen: String(landedUnitEur.toFixed(4)),
            note:
              note ||
              `Received from PO ${purchase.poNumber} (base ${baseUnitEur.toFixed(4)} + 3PL ${allocated3plUnitEur.toFixed(
                4
              )} EUR/unit)`,
          },
        });

        const movement = await tx.inventoryMovement.create({
          data: {
            storeId,
            productId: item.productId,
            lotId: lot.id,
            warehouseId,
            movementType: "receive_in",
            quantity: receiveQty,
            unitCostEurFrozen: String(landedUnitEur.toFixed(4)),
            referenceType: "purchase_order",
            referenceId: purchase.id,
            reason: note || `PO receive ${purchase.poNumber}`,
            createdByUserId: userId,
          },
        });

        await tx.purchaseOrderItem.update({
          where: { id: item.id },
          data: { quantityReceived: Number(item.quantityReceived) + receiveQty },
        });

        receivedLots.push(lot);
        movementIds.push(movement.id);
      }

      const itemsAfter = await tx.purchaseOrderItem.findMany({
        where: { purchaseOrderId: purchase.id },
        select: { quantityOrdered: true, quantityReceived: true },
      });
      const allReceived = itemsAfter.every((it) => Number(it.quantityReceived) >= Number(it.quantityOrdered));

      const updatedPurchase = await tx.purchaseOrder.update({
        where: { id: purchase.id },
        data: {
          status: allReceived ? "received" : "in_transit",
          receivedAt: allReceived ? new Date() : purchase.receivedAt,
        },
      });

      return { receivedLots, movementIds, purchase: updatedPurchase };
    });

    if (result.error) {
      const code = result.error.code;
      if (code === "NOT_FOUND") return res.status(404).json({ error: "Purchase not found" });
      if (code === "PO_CLOSED") return res.status(409).json({ error: "Purchase order is closed" });
      if (code === "NO_LINES_TO_RECEIVE") return res.status(400).json({ error: "No lines to receive" });
      if (code === "INVALID_RECEIVE_LINE") return res.status(400).json({ error: "Invalid receive line payload" });
      if (code === "ITEM_NOT_FOUND") return res.status(400).json({ error: "Purchase item not found in this PO" });
      if (code === "ITEM_WITHOUT_PRODUCT") return res.status(409).json({ error: "PO item has no linked product, cannot receive to inventory", ...result.error });
      if (code === "QTY_EXCEEDS_PENDING") return res.status(409).json({ error: "Received quantity exceeds pending", ...result.error });
    }

    const totalReceivedUnits = result.receivedLots.reduce((sum, lot) => sum + Number(lot.quantityReceived || 0), 0);
    await createNotificationSafe({
      storeId,
      type: "purchase_received",
      severity: "info",
      title: `Recepcion PO ${result.purchase.poNumber} completada`,
      body: `${result.receivedLots.length} lotes, ${totalReceivedUnits} unidades ingresadas`,
      linkedEntityType: "purchase_order",
      linkedEntityId: result.purchase.id,
      createdByUserId: userId,
    });

    return res.json({
      ok: true,
      purchase: { ...result.purchase, totalAmountEur: normalizeMoney(result.purchase.totalAmountEur) },
      receivedLots: result.receivedLots.map((lot) => ({
        ...lot,
        unitCostOriginal: normalizeMoney(lot.unitCostOriginal),
        fxToEur: normalizeMoney(lot.fxToEur),
        unitCostEurFrozen: normalizeMoney(lot.unitCostEurFrozen),
      })),
      movementIds: result.movementIds,
    });
  } catch (err) {
    console.error("POST /purchases/:purchaseId/receive error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/three-pl", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const storeId = String(req.query.storeId || "").trim();
    if (!storeId) return res.status(400).json({ error: "Missing storeId" });

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const canSensitive = await canReadSensitive(userId, storeId, membership.roleKey);
    if (!canSensitive) return res.status(403).json({ error: "No permission to read 3PL" });

    const shipments = await prisma.threePlShipment.findMany({
      where: { storeId },
      include: {
        purchaseOrder: { select: { id: true, poNumber: true } },
        legs: { orderBy: { legOrder: "asc" } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return res.json({
      shipments: shipments.map((s) => ({
        ...s,
        legs: s.legs.map((l) => ({
          ...l,
          costOriginal: normalizeMoney(l.costOriginal),
          fxToEur: normalizeMoney(l.fxToEur),
          costEurFrozen: normalizeMoney(l.costEurFrozen),
        })),
      })),
    });
  } catch (err) {
    console.error("GET /three-pl error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.post("/three-pl", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { storeId, purchaseOrderId, providerName, referenceCode, note } = req.body || {};
    if (!storeId || !providerName || !referenceCode) {
      return res.status(400).json({ error: "Missing storeId/providerName/referenceCode" });
    }

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const canWrite = await canManagePurchases(userId, storeId, membership.roleKey);
    if (!canWrite) return res.status(403).json({ error: "No permission to manage 3PL" });

    if (purchaseOrderId) {
      const po = await prisma.purchaseOrder.findFirst({ where: { id: purchaseOrderId, storeId }, select: { id: true } });
      if (!po) return res.status(400).json({ error: "Invalid purchaseOrderId for store" });
    }

    const shipment = await prisma.threePlShipment.create({
      data: {
        storeId,
        purchaseOrderId: purchaseOrderId || null,
        providerName: String(providerName).trim(),
        referenceCode: String(referenceCode).trim(),
        note: note || null,
        createdByUserId: userId,
      },
    });

    return res.status(201).json({ shipment });
  } catch (err) {
    if (err?.code === "P2002") return res.status(409).json({ error: "3PL reference already exists" });
    console.error("POST /three-pl error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.post("/three-pl/:shipmentId/legs", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { shipmentId } = req.params;
    const {
      storeId,
      legOrder,
      originLabel,
      destinationLabel,
      trackingCode,
      trackingUrl,
      costCurrencyCode,
      costOriginal,
      fxToEur,
      status,
      departedAt,
      deliveredAt,
    } = req.body || {};

    if (!storeId || !legOrder || !originLabel || !destinationLabel) {
      return res.status(400).json({ error: "Missing leg fields" });
    }

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const canWrite = await canManagePurchases(userId, storeId, membership.roleKey);
    if (!canWrite) return res.status(403).json({ error: "No permission to manage 3PL" });

    const shipment = await prisma.threePlShipment.findFirst({ where: { id: shipmentId, storeId }, select: { id: true } });
    if (!shipment) return res.status(404).json({ error: "Shipment not found" });
    if (status && !THREE_PL_LEG_STATUSES.has(String(status))) return res.status(400).json({ error: "Invalid 3PL leg status" });

    const parsedCurrency = costCurrencyCode ? parseCurrencyCode(costCurrencyCode) : null;
    if (costCurrencyCode && !parsedCurrency) return res.status(400).json({ error: "Invalid costCurrencyCode" });
    if ((costOriginal !== undefined || fxToEur !== undefined) && (!isPositiveNumber(costOriginal) || !isPositiveNumber(fxToEur))) {
      return res.status(400).json({ error: "costOriginal and fxToEur must be positive when provided" });
    }
    const costEurFrozen =
      costOriginal !== undefined && fxToEur !== undefined ? Number((Number(costOriginal) * Number(fxToEur)).toFixed(2)) : null;

    const leg = await prisma.threePlLeg.create({
      data: {
        shipmentId,
        legOrder: Number(legOrder),
        originLabel: String(originLabel).trim(),
        destinationLabel: String(destinationLabel).trim(),
        trackingCode: trackingCode || null,
        trackingUrl: trackingUrl || null,
        costCurrencyCode: parsedCurrency || null,
        costOriginal: costOriginal !== undefined ? String(costOriginal) : null,
        fxToEur: fxToEur !== undefined ? String(fxToEur) : null,
        costEurFrozen: costEurFrozen !== null ? String(costEurFrozen) : null,
        status: status || "planned",
        departedAt: departedAt ? parseDateInput(departedAt) : null,
        deliveredAt: deliveredAt ? parseDateInput(deliveredAt) : null,
      },
    });

    return res.status(201).json({
      leg: {
        ...leg,
        costOriginal: normalizeMoney(leg.costOriginal),
        fxToEur: normalizeMoney(leg.fxToEur),
        costEurFrozen: normalizeMoney(leg.costEurFrozen),
      },
    });
  } catch (err) {
    if (err?.code === "P2002") return res.status(409).json({ error: "Leg order already exists for shipment" });
    console.error("POST /three-pl/:shipmentId/legs error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/stores/:storeId/team", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { storeId } = req.params;
    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });

    const members = await prisma.userStoreMembership.findMany({
      where: { storeId },
      include: {
        user: {
          select: { id: true, fullName: true, email: true, preferredLocale: true, isActive: true },
        },
      },
      orderBy: [{ roleKey: "asc" }, { createdAt: "asc" }],
      take: 300,
    });

    return res.json({
      members: members.map((m) => ({
        userId: m.userId,
        roleKey: m.roleKey,
        fullName: m.user.fullName,
        email: m.user.email,
        preferredLocale: m.user.preferredLocale,
        isActive: m.user.isActive,
      })),
    });
  } catch (err) {
    console.error("GET /stores/:storeId/team error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.post("/presence/heartbeat", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { storeId, status, lastEvent, lastPath } = req.body || {};
    if (!storeId) return res.status(400).json({ error: "Missing storeId" });

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    if (status && !PRESENCE_STATUSES.has(String(status))) {
      return res.status(400).json({ error: "Invalid presence status" });
    }

    const now = new Date();
    const presence = await prisma.userPresence.upsert({
      where: { storeId_userId: { storeId, userId } },
      update: {
        status: status || "online",
        lastSeenAt: now,
        lastEvent: lastEvent || null,
        lastPath: lastPath || null,
      },
      create: {
        storeId,
        userId,
        status: status || "online",
        lastSeenAt: now,
        sessionStarted: now,
        lastEvent: lastEvent || null,
        lastPath: lastPath || null,
      },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
      },
    });

    return res.json({
      presence: {
        ...presence,
        user: presence.user,
      },
    });
  } catch (err) {
    console.error("POST /presence/heartbeat error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/presence", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const storeId = String(req.query.storeId || "").trim();
    if (!storeId) return res.status(400).json({ error: "Missing storeId" });

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });

    const now = Date.now();
    const onlineCutoff = new Date(now - 2 * 60 * 1000);
    const awayCutoff = new Date(now - 10 * 60 * 1000);

    const presences = await prisma.userPresence.findMany({
      where: { storeId, lastSeenAt: { gte: awayCutoff } },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: [{ lastSeenAt: "desc" }],
      take: 200,
    });

    const normalized = presences.map((p) => {
      let computedStatus = p.status;
      if (p.lastSeenAt < awayCutoff) computedStatus = "offline";
      else if (p.lastSeenAt < onlineCutoff) computedStatus = "away";
      else computedStatus = "online";
      return {
        id: p.id,
        storeId: p.storeId,
        userId: p.userId,
        status: computedStatus,
        lastSeenAt: p.lastSeenAt,
        lastEvent: p.lastEvent,
        lastPath: p.lastPath,
        sessionStarted: p.sessionStarted,
        user: p.user,
      };
    });

    return res.json({ presences: normalized });
  } catch (err) {
    console.error("GET /presence error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/tasks", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const storeId = String(req.query.storeId || "").trim();
    const status = String(req.query.status || "").trim();
    const assignedToMe = String(req.query.assignedToMe || "").trim() === "1";
    if (!storeId) return res.status(400).json({ error: "Missing storeId" });

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });

    const tasks = await prisma.teamTask.findMany({
      where: {
        storeId,
        ...(status ? { status } : {}),
        ...(assignedToMe ? { assignedToUserId: userId } : {}),
      },
      include: {
        assignedTo: { select: { id: true, fullName: true, email: true } },
        createdBy: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: [{ status: "asc" }, { priority: "desc" }, { dueAt: "asc" }, { createdAt: "desc" }],
      take: 400,
    });

    return res.json({ tasks });
  } catch (err) {
    console.error("GET /tasks error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.post("/tasks", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const {
      storeId,
      title,
      description,
      priority,
      dueAt,
      assignedToUserId,
      linkedEntityType,
      linkedEntityId,
    } = req.body || {};

    if (!storeId || !title) return res.status(400).json({ error: "Missing storeId/title" });

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const canWrite = await canManageTasks(userId, storeId, membership.roleKey);
    if (!canWrite) return res.status(403).json({ error: "No permission to manage tasks" });

    let assignee = null;
    if (assignedToUserId) {
      assignee = await prisma.userStoreMembership.findFirst({
        where: { storeId, userId: assignedToUserId },
        select: { userId: true },
      });
      if (!assignee) return res.status(400).json({ error: "assignedToUserId is not a member of this store" });
    }

    const parsedDueAt = dueAt ? parseDateInput(dueAt) : null;
    if (dueAt && !parsedDueAt) return res.status(400).json({ error: "Invalid dueAt" });

    const task = await prisma.teamTask.create({
      data: {
        storeId,
        title: String(title).trim(),
        description: description || null,
        priority: priority || "medium",
        dueAt: parsedDueAt,
        assignedToUserId: assignee?.userId || null,
        linkedEntityType: linkedEntityType || null,
        linkedEntityId: linkedEntityId || null,
        createdByUserId: userId,
      },
      include: {
        assignedTo: { select: { id: true, fullName: true, email: true } },
        createdBy: { select: { id: true, fullName: true, email: true } },
      },
    });

    if (task.assignedTo?.id && task.assignedTo.id !== userId) {
      await createNotificationSafe({
        storeId,
        userId: task.assignedTo.id,
        type: "task_assigned",
        severity: task.priority === "high" ? "warning" : "info",
        title: `Nueva tarea asignada: ${task.title}`,
        body: task.description || null,
        linkedEntityType: "team_task",
        linkedEntityId: task.id,
        createdByUserId: userId,
      });
    }

    return res.status(201).json({ task });
  } catch (err) {
    console.error("POST /tasks error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.patch("/tasks/:taskId", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { taskId } = req.params;
    const { storeId, title, description, status, priority, dueAt, assignedToUserId } = req.body || {};

    if (!storeId) return res.status(400).json({ error: "Missing storeId" });
    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const canWrite = await canManageTasks(userId, storeId, membership.roleKey);
    if (!canWrite) return res.status(403).json({ error: "No permission to manage tasks" });

    const existing = await prisma.teamTask.findFirst({
      where: { id: taskId, storeId },
      select: { id: true, status: true },
    });
    if (!existing) return res.status(404).json({ error: "Task not found" });

    let assigneeId = undefined;
    if (assignedToUserId !== undefined) {
      if (!assignedToUserId) {
        assigneeId = null;
      } else {
        const assignee = await prisma.userStoreMembership.findFirst({
          where: { storeId, userId: assignedToUserId },
          select: { userId: true },
        });
        if (!assignee) return res.status(400).json({ error: "assignedToUserId is not a member of this store" });
        assigneeId = assignee.userId;
      }
    }

    const parsedDueAt = dueAt === undefined ? undefined : dueAt ? parseDateInput(dueAt) : null;
    if (dueAt && !parsedDueAt) return res.status(400).json({ error: "Invalid dueAt" });

    const nextStatus = status || existing.status;
    const task = await prisma.teamTask.update({
      where: { id: taskId },
      data: {
        ...(title !== undefined ? { title: title ? String(title).trim() : existing.title } : {}),
        ...(description !== undefined ? { description: description || null } : {}),
        ...(status ? { status } : {}),
        ...(priority ? { priority } : {}),
        ...(parsedDueAt !== undefined ? { dueAt: parsedDueAt } : {}),
        ...(assignedToUserId !== undefined ? { assignedToUserId: assigneeId } : {}),
        ...(nextStatus === "done" ? { closedAt: new Date() } : {}),
      },
      include: {
        assignedTo: { select: { id: true, fullName: true, email: true } },
        createdBy: { select: { id: true, fullName: true, email: true } },
      },
    });

    return res.json({ task });
  } catch (err) {
    console.error("PATCH /tasks/:taskId error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/notifications", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const storeId = String(req.query.storeId || "").trim();
    const onlyUnread = String(req.query.onlyUnread || "").trim() === "1";
    const type = String(req.query.type || "").trim();
    const severity = String(req.query.severity || "").trim();
    const q = String(req.query.q || "").trim();
    const limitRaw = Number(req.query.limit || 80);
    const limit = Math.max(1, Math.min(200, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 80));
    if (!storeId) return res.status(400).json({ error: "Missing storeId" });

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const canRead = await canReadNotifications(userId, storeId, membership.roleKey);
    if (!canRead) return res.status(403).json({ error: "No permission to read notifications" });

    const notifications = await prisma.notification.findMany({
      where: {
        storeId,
        AND: [
          { OR: [{ userId: null }, { userId }] },
          ...(onlyUnread ? [{ isRead: false }] : []),
          ...(type ? [{ type }] : []),
          ...(severity ? [{ severity }] : []),
          ...(q
            ? [
                {
                  OR: [
                    { title: { contains: q, mode: "insensitive" } },
                    { body: { contains: q, mode: "insensitive" } },
                  ],
                },
              ]
            : []),
        ],
      },
      include: {
        createdBy: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return res.json({ notifications });
  } catch (err) {
    console.error("GET /notifications error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.patch("/notifications/:notificationId/read", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { notificationId } = req.params;
    const { storeId, isRead } = req.body || {};
    if (!storeId) return res.status(400).json({ error: "Missing storeId" });

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const canRead = await canReadNotifications(userId, storeId, membership.roleKey);
    if (!canRead) return res.status(403).json({ error: "No permission to update notifications" });

    const data = Boolean(isRead)
      ? { isRead: true, readAt: new Date() }
      : { isRead: false, readAt: null };

    const updated = await prisma.notification.updateMany({
      where: {
        id: notificationId,
        storeId,
        OR: [{ userId: null }, { userId }],
      },
      data,
    });

    if (updated.count === 0) return res.status(404).json({ error: "Notification not found" });
    return res.json({ ok: true });
  } catch (err) {
    console.error("PATCH /notifications/:notificationId/read error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.post("/notifications/read-all", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { storeId } = req.body || {};
    if (!storeId) return res.status(400).json({ error: "Missing storeId" });

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const canRead = await canReadNotifications(userId, storeId, membership.roleKey);
    if (!canRead) return res.status(403).json({ error: "No permission to update notifications" });

    const result = await prisma.notification.updateMany({
      where: {
        storeId,
        OR: [{ userId: null }, { userId }],
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return res.json({ ok: true, updated: result.count });
  } catch (err) {
    console.error("POST /notifications/read-all error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/chat/channels", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const storeId = String(req.query.storeId || "").trim();
    if (!storeId) return res.status(400).json({ error: "Missing storeId" });

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const canChat = await canUseChat(userId, storeId, membership.roleKey);
    if (!canChat) return res.status(403).json({ error: "No permission to use chat" });

    const defaults = [
      { code: "almacen", name: "#almacen" },
      { code: "compras", name: "#compras" },
      { code: "devoluciones", name: "#devoluciones" },
    ];
    await Promise.all(
      defaults.map((ch) =>
        prisma.chatChannel.upsert({
          where: { storeId_code: { storeId, code: ch.code } },
          update: { isActive: true },
          create: {
            storeId,
            code: ch.code,
            name: ch.name,
            type: "public",
            isActive: true,
            createdByUserId: userId,
          },
        })
      )
    );

    const channels = await prisma.chatChannel.findMany({
      where: { storeId, isActive: true },
      orderBy: { code: "asc" },
      take: 100,
    });
    return res.json({ channels });
  } catch (err) {
    console.error("GET /chat/channels error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.post("/chat/channels", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { storeId, code, name, type } = req.body || {};
    if (!storeId || !code || !name) return res.status(400).json({ error: "Missing storeId/code/name" });

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const canChat = await canUseChat(userId, storeId, membership.roleKey);
    if (!canChat) return res.status(403).json({ error: "No permission to use chat" });

    const channel = await prisma.chatChannel.create({
      data: {
        storeId,
        code: String(code).trim().toLowerCase(),
        name: String(name).trim(),
        type: type || "public",
        isActive: true,
        createdByUserId: userId,
      },
    });
    return res.status(201).json({ channel });
  } catch (err) {
    if (err?.code === "P2002") return res.status(409).json({ error: "Channel code already exists" });
    console.error("POST /chat/channels error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/chat/messages", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const storeId = String(req.query.storeId || "").trim();
    const channelId = String(req.query.channelId || "").trim();
    const limitRaw = Number(req.query.limit || 80);
    const limit = Math.max(1, Math.min(200, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 80));
    if (!storeId || !channelId) return res.status(400).json({ error: "Missing storeId/channelId" });

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const canChat = await canUseChat(userId, storeId, membership.roleKey);
    if (!canChat) return res.status(403).json({ error: "No permission to use chat" });

    const channel = await prisma.chatChannel.findFirst({
      where: { id: channelId, storeId, isActive: true },
      select: { id: true },
    });
    if (!channel) return res.status(404).json({ error: "Channel not found" });

    const messages = await prisma.chatMessage.findMany({
      where: { storeId, channelId },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return res.json({ messages: messages.reverse() });
  } catch (err) {
    console.error("GET /chat/messages error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.post("/chat/messages", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { storeId, channelId, body, linkedEntityType, linkedEntityId, mentionedUserIds } = req.body || {};
    if (!storeId || !channelId || !body) return res.status(400).json({ error: "Missing storeId/channelId/body" });
    if (String(body).trim().length < 1) return res.status(400).json({ error: "Body is empty" });

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const canChat = await canUseChat(userId, storeId, membership.roleKey);
    if (!canChat) return res.status(403).json({ error: "No permission to use chat" });

    const channel = await prisma.chatChannel.findFirst({
      where: { id: channelId, storeId, isActive: true },
      select: { id: true, code: true, name: true },
    });
    if (!channel) return res.status(404).json({ error: "Channel not found" });

    const mentionIdsInput = Array.isArray(mentionedUserIds) ? mentionedUserIds.map((id) => String(id).trim()).filter(Boolean) : [];
    const uniqueMentionIds = [...new Set(mentionIdsInput)].filter((id) => id !== userId);
    const mentionableMembers =
      uniqueMentionIds.length > 0
        ? await prisma.userStoreMembership.findMany({
            where: {
              storeId,
              userId: { in: uniqueMentionIds },
            },
            select: { userId: true },
          })
        : [];
    const validMentionIds = mentionableMembers.map((m) => m.userId);

    const message = await prisma.chatMessage.create({
      data: {
        storeId,
        channelId,
        userId,
        body: String(body).trim(),
        linkedEntityType: linkedEntityType || null,
        linkedEntityId: linkedEntityId || null,
      },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
      },
    });

    if (validMentionIds.length > 0) {
      await Promise.all(
        validMentionIds.map((mentionedUserId) =>
          createNotificationSafe({
            storeId,
            userId: mentionedUserId,
            type: "system",
            severity: "info",
            title: `Mencion en ${channel.name}`,
            body: `${message.user.fullName}: ${message.body.slice(0, 180)}`,
            linkedEntityType: "chat_message",
            linkedEntityId: message.id,
            createdByUserId: userId,
          })
        )
      );
    }

    await prisma.userPresence.upsert({
      where: { storeId_userId: { storeId, userId } },
      update: {
        status: "online",
        lastSeenAt: new Date(),
        lastEvent: `Chat ${channelId}`,
        lastPath: "/store/chat",
      },
      create: {
        storeId,
        userId,
        status: "online",
        lastSeenAt: new Date(),
        lastEvent: `Chat ${channelId}`,
        lastPath: "/store/chat",
      },
    });

    return res.status(201).json({ message });
  } catch (err) {
    console.error("POST /chat/messages error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/inventory", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const storeId = String(req.query.storeId || "").trim();
    const warehouseId = String(req.query.warehouseId || "").trim() || null;
    const q = String(req.query.q || "").trim();
    const withImages = String(req.query.withImages || "0") === "1";

    if (!storeId) return res.status(400).json({ error: "Missing storeId" });

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });

    const products = await prisma.product.findMany({
      where: {
        storeId,
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { brand: { contains: q, mode: "insensitive" } },
                { model: { contains: q, mode: "insensitive" } },
                { ean: { contains: q, mode: "insensitive" } },
                { sku: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: [{ brand: "asc" }, { model: "asc" }],
      take: 200,
      select: {
        id: true,
        type: true,
        brand: true,
        model: true,
        name: true,
        ean: true,
        status: true,
        mainImageUrl: true,
      },
    });

    const productIds = products.map((p) => p.id);
    if (productIds.length === 0) {
      return res.json({ items: [] });
    }

    const lots = await prisma.inventoryLot.findMany({
      where: {
        storeId,
        productId: { in: productIds },
        quantityAvailable: { gt: 0 },
      },
      select: {
        productId: true,
        warehouseId: true,
        quantityAvailable: true,
        warehouse: { select: { id: true, code: true, name: true } },
      },
    });

    const stockByProduct = new Map();
    for (const lot of lots) {
      const key = lot.productId;
      if (!stockByProduct.has(key)) {
        stockByProduct.set(key, { total: 0, selected: 0, warehouses: new Map() });
      }

      const row = stockByProduct.get(key);
      row.total += Number(lot.quantityAvailable);

      const wh = row.warehouses;
      const currentWh = wh.get(lot.warehouseId) || {
        warehouseId: lot.warehouse.id,
        warehouseCode: lot.warehouse.code,
        warehouseName: lot.warehouse.name,
        qty: 0,
      };
      currentWh.qty += Number(lot.quantityAvailable);
      wh.set(lot.warehouseId, currentWh);

      if (!warehouseId || lot.warehouseId === warehouseId) {
        row.selected += Number(lot.quantityAvailable);
      }
    }

    return res.json({
      items: products.map((p) => {
        const stock = stockByProduct.get(p.id) || { total: 0, selected: 0, warehouses: new Map() };
        const byWarehouse = Array.from(stock.warehouses.values());

        const availableElsewhere = byWarehouse.filter((w) => {
          if (!warehouseId) return false;
          return w.warehouseId !== warehouseId && w.qty > 0;
        });

        return {
          id: p.id,
          type: p.type,
          brand: p.brand,
          model: p.model,
          name: p.name,
          ean: p.ean,
          status: p.status,
          imageUrl: withImages ? p.mainImageUrl : null,
          stockSelectedWarehouse: warehouseId ? stock.selected : stock.total,
          stockTotalStore: stock.total,
          stockByWarehouse: byWarehouse,
          availableElsewhere,
        };
      }),
    });
  } catch (err) {
    console.error("GET /inventory error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/products", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const storeId = String(req.query.storeId || "").trim();
    const q = String(req.query.q || "").trim();

    if (!storeId) return res.status(400).json({ error: "Missing storeId" });
    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });

    const products = await prisma.product.findMany({
      where: {
        storeId,
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { brand: { contains: q, mode: "insensitive" } },
                { model: { contains: q, mode: "insensitive" } },
                { ean: { contains: q, mode: "insensitive" } },
                { sku: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        ean: true,
        sku: true,
        type: true,
        brand: true,
        model: true,
        modelRef: true,
        category: true,
        name: true,
        status: true,
        mainImageUrl: true,
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 200,
    });

    return res.json({ products });
  } catch (err) {
    console.error("GET /products error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.post("/scan/lookup", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { storeId, code } = req.body || {};

    if (!storeId || !code) {
      return res.status(400).json({ error: "Missing storeId or code" });
    }

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });

    const found = await findProductByScan(storeId, code);
    if (!found) {
      const suggestedInternalEan = await generateInternalEan(storeId);
      return res.status(404).json({
        found: false,
        code,
        suggestedActions: ["create_product", "generate_internal_ean"],
        suggestedInternalEan,
      });
    }

    return res.json({ found: true, via: found.via, product: found.product, alias: found.alias || null });
  } catch (err) {
    console.error("POST /scan/lookup error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.post("/products", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const {
      storeId,
      ean,
      sku,
      type,
      brand,
      model,
      modelRef,
      category,
      name,
      status,
      internalDescription,
      attributes,
      mainImageUrl,
      images,
    } = req.body || {};

    if (!storeId || !brand || !model) {
      return res.status(400).json({ error: "Missing storeId, brand or model" });
    }

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });

    const finalEan = ean ? String(ean).trim() : await generateInternalEan(storeId);
    const finalName = name ? String(name).trim() : `${brand} ${model}`;
    const isInternalEan = !ean;

    const canWrite = await canManageCatalog(userId, storeId, membership.roleKey);
    if (!canWrite) return res.status(403).json({ error: "No permission to manage products" });

    const product = await prisma.product.create({
      data: {
        storeId,
        ean: finalEan,
        sku: sku || null,
        type: type || "other",
        brand,
        model,
        modelRef: modelRef || null,
        category: category || null,
        name: finalName,
        status: status || "active",
        isInternalEan,
        internalDescription: internalDescription || null,
        attributes: attributes || null,
        mainImageUrl: mainImageUrl || null,
      },
    });

    if (Array.isArray(images) && images.length > 0) {
      await prisma.productImage.createMany({
        data: images
          .filter((img) => img?.imageUrl)
          .map((img, idx) => ({
            productId: product.id,
            imageUrl: String(img.imageUrl).trim(),
            isPrimary: Boolean(img.isPrimary) || idx === 0,
            sortOrder: Number.isInteger(Number(img.sortOrder)) ? Number(img.sortOrder) : idx,
          })),
      });
    }

    return res.status(201).json({ product });
  } catch (err) {
    if (err?.code === "P2002") {
      return res.status(409).json({ error: "EAN already exists in store" });
    }
    console.error("POST /products error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.put("/products/:productId", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { productId } = req.params;
    const {
      storeId,
      ean,
      sku,
      type,
      brand,
      model,
      modelRef,
      category,
      name,
      status,
      internalDescription,
      attributes,
      mainImageUrl,
      images,
    } =
      req.body || {};

    if (!storeId) return res.status(400).json({ error: "Missing storeId" });

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const canWrite = await canManageCatalog(userId, storeId, membership.roleKey);
    if (!canWrite) return res.status(403).json({ error: "No permission to manage products" });

    const existing = await prisma.product.findFirst({ where: { id: productId, storeId } });
    if (!existing) return res.status(404).json({ error: "Product not found" });

    const product = await prisma.product.update({
      where: { id: productId },
      data: {
        ean: ean ? String(ean).trim() : existing.ean,
        sku: sku || null,
        type: type || existing.type,
        brand: brand || existing.brand,
        model: model || existing.model,
        modelRef: modelRef ?? null,
        category: category ?? null,
        name: name || `${brand || existing.brand} ${model || existing.model}`,
        status: status || existing.status,
        internalDescription: internalDescription ?? null,
        attributes: attributes ?? null,
        mainImageUrl: mainImageUrl ?? null,
      },
    });

    if (Array.isArray(images)) {
      await prisma.$transaction(async (tx) => {
        await tx.productImage.deleteMany({ where: { productId } });
        const rows = images
          .filter((img) => img?.imageUrl)
          .map((img, idx) => ({
            productId,
            imageUrl: String(img.imageUrl).trim(),
            isPrimary: Boolean(img.isPrimary) || idx === 0,
            sortOrder: Number.isInteger(Number(img.sortOrder)) ? Number(img.sortOrder) : idx,
          }));
        if (rows.length > 0) await tx.productImage.createMany({ data: rows });
      });
    }

    return res.json({ product });
  } catch (err) {
    if (err?.code === "P2002") return res.status(409).json({ error: "EAN already exists in store" });
    console.error("PUT /products/:productId error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.post("/products/:productId/ean-aliases", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { productId } = req.params;
    const { storeId, ean, source, note } = req.body || {};

    if (!storeId || !ean) return res.status(400).json({ error: "Missing storeId or ean" });
    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });

    const canWrite = await canManageCatalog(userId, storeId, membership.roleKey);
    if (!canWrite) return res.status(403).json({ error: "No permission to manage products" });

    const product = await prisma.product.findFirst({ where: { id: productId, storeId }, select: { id: true } });
    if (!product) return res.status(404).json({ error: "Product not found" });

    const alias = await prisma.eanAlias.create({
      data: {
        storeId,
        productId,
        ean: String(ean).trim(),
        source: source || "manual",
        note: note || null,
      },
    });
    return res.status(201).json({ alias });
  } catch (err) {
    if (err?.code === "P2002") return res.status(409).json({ error: "EAN alias already exists in store" });
    console.error("POST /products/:productId/ean-aliases error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.delete("/products/:productId/ean-aliases/:aliasId", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { productId, aliasId } = req.params;
    const storeId = String(req.query.storeId || "").trim();

    if (!storeId) return res.status(400).json({ error: "Missing storeId" });
    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });

    const canWrite = await canManageCatalog(userId, storeId, membership.roleKey);
    if (!canWrite) return res.status(403).json({ error: "No permission to manage products" });

    const alias = await prisma.eanAlias.findFirst({ where: { id: aliasId, productId, storeId }, select: { id: true } });
    if (!alias) return res.status(404).json({ error: "EAN alias not found" });

    await prisma.eanAlias.delete({ where: { id: aliasId } });
    return res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /products/:productId/ean-aliases/:aliasId error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.put("/products/:productId/channel/:channelId", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { productId, channelId } = req.params;
    const { storeId, listingStatus, publicName, channelEan, listingUrl, priceOriginal, priceCurrencyCode, priceFxToEur } =
      req.body || {};

    if (!storeId) return res.status(400).json({ error: "Missing storeId" });
    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });

    const canWrite = await canManageCatalog(userId, storeId, membership.roleKey);
    if (!canWrite) return res.status(403).json({ error: "No permission to manage products" });

    const [product, channel] = await Promise.all([
      prisma.product.findFirst({ where: { id: productId, storeId }, select: { id: true } }),
      prisma.salesChannel.findFirst({
        where: { id: channelId, storeId },
        select: { id: true, currencyCode: true },
      }),
    ]);
    if (!product || !channel) return res.status(404).json({ error: "Product or channel not found" });

    const fx = priceFxToEur ? Number(priceFxToEur) : null;
    const price = priceOriginal ? Number(priceOriginal) : null;
    const frozen = price !== null && fx !== null ? Number((price * fx).toFixed(2)) : null;
    const parsedPriceCurrency =
      priceCurrencyCode ? parseCurrencyCode(priceCurrencyCode) : parseCurrencyCode(channel.currencyCode || "EUR");
    if (priceOriginal !== undefined && !isPositiveNumber(priceOriginal)) {
      return res.status(400).json({ error: "priceOriginal must be positive when provided" });
    }
    if (priceFxToEur !== undefined && !isPositiveNumber(priceFxToEur)) {
      return res.status(400).json({ error: "priceFxToEur must be positive when provided" });
    }

    const listing = await prisma.$transaction(async (tx) => {
      const baseListing = await tx.productChannel.upsert({
        where: { productId_channelId: { productId, channelId } },
        update: {
          listingStatus: listingStatus || "active",
          publicName: publicName || null,
          channelEan: channelEan || null,
          listingUrl: listingUrl || null,
          priceOriginal: price !== null ? String(price) : null,
          priceCurrencyCode: parsedPriceCurrency || null,
          priceFxToEur: fx !== null ? String(fx) : null,
          priceEurFrozen: frozen !== null ? String(frozen) : null,
        },
        create: {
          productId,
          channelId,
          listingStatus: listingStatus || "active",
          publicName: publicName || null,
          channelEan: channelEan || null,
          listingUrl: listingUrl || null,
          priceOriginal: price !== null ? String(price) : null,
          priceCurrencyCode: parsedPriceCurrency || null,
          priceFxToEur: fx !== null ? String(fx) : null,
          priceEurFrozen: frozen !== null ? String(frozen) : null,
        },
      });

      await tx.channelProductLink.upsert({
        where: { productId_salesChannelId: { productId, salesChannelId: channelId } },
        update: {
          productUrl: listingUrl || null,
          externalProductId: channelEan || null,
          status: listingStatus || "active",
        },
        create: {
          productId,
          salesChannelId: channelId,
          productUrl: listingUrl || null,
          externalProductId: channelEan || null,
          status: listingStatus || "active",
        },
      });

      if (price !== null) {
        await tx.productChannelPrice.create({
          data: {
            productId,
            salesChannelId: channelId,
            priceAmount: String(price),
            currencyCode: parsedPriceCurrency || "EUR",
            isActive: true,
            effectiveFrom: new Date(),
            effectiveTo: null,
          },
        });
      }

      if (publicName) {
        await tx.channelProductText.upsert({
          where: {
            productId_salesChannelId_locale: {
              productId,
              salesChannelId: channelId,
              locale: "es",
            },
          },
          update: { title: publicName, description: null },
          create: {
            productId,
            salesChannelId: channelId,
            locale: "es",
            title: publicName,
            description: null,
          },
        });
      }

      return baseListing;
    });

    return res.json({ listing });
  } catch (err) {
    console.error("PUT /products/:productId/channel/:channelId error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.put("/products/:productId/texts", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { productId } = req.params;
    const { storeId, locale, channelId, publicName, description } = req.body || {};

    if (!storeId || !locale || !publicName) {
      return res.status(400).json({ error: "Missing storeId, locale or publicName" });
    }

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });

    const canWrite = await canManageCatalog(userId, storeId, membership.roleKey);
    if (!canWrite) return res.status(403).json({ error: "No permission to manage products" });

    const product = await prisma.product.findFirst({ where: { id: productId, storeId }, select: { id: true } });
    if (!product) return res.status(404).json({ error: "Product not found" });

    const normalizedLocale = String(locale).trim().toLowerCase();
    const normalizedChannelId = channelId || null;
    let text;

    if (normalizedChannelId) {
      text = await prisma.productText.upsert({
        where: {
          productId_locale_channelId: {
            productId,
            locale: normalizedLocale,
            channelId: normalizedChannelId,
          },
        },
        update: {
          publicName: String(publicName).trim(),
          description: description || null,
        },
        create: {
          storeId,
          productId,
          locale: normalizedLocale,
          channelId: normalizedChannelId,
          publicName: String(publicName).trim(),
          description: description || null,
        },
      });
    } else {
      const existingBaseText = await prisma.productText.findFirst({
        where: { productId, locale: normalizedLocale, channelId: null },
        select: { id: true },
      });
      if (existingBaseText) {
        text = await prisma.productText.update({
          where: { id: existingBaseText.id },
          data: {
            publicName: String(publicName).trim(),
            description: description || null,
          },
        });
      } else {
        text = await prisma.productText.create({
          data: {
            storeId,
            productId,
            locale: normalizedLocale,
            channelId: null,
            publicName: String(publicName).trim(),
            description: description || null,
          },
        });
      }
    }

    if (normalizedChannelId) {
      await prisma.channelProductText.upsert({
        where: {
          productId_salesChannelId_locale: {
            productId,
            salesChannelId: normalizedChannelId,
            locale: normalizedLocale,
          },
        },
        update: {
          title: String(publicName).trim(),
          description: description || null,
        },
        create: {
          productId,
          salesChannelId: normalizedChannelId,
          locale: normalizedLocale,
          title: String(publicName).trim(),
          description: description || null,
        },
      });
    }

    return res.json({ text });
  } catch (err) {
    console.error("PUT /products/:productId/texts error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.post("/inventory/receive", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const {
      storeId,
      productId,
      warehouseId,
      locationId,
      lotCode,
      sourceType,
      supplierName,
      purchasedAt,
      quantity,
      unitCostOriginal,
      costCurrencyCode,
      fxToEur,
      note,
    } = req.body || {};

    if (!storeId || !productId || !warehouseId || !quantity || !unitCostOriginal || !costCurrencyCode || !fxToEur) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (Number(quantity) <= 0) return res.status(400).json({ error: "quantity must be > 0" });

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });

    const computedEur = Number(unitCostOriginal) * Number(fxToEur);
    const finalLotCode = lotCode || `LOT-${new Date().toISOString().slice(0, 10)}-${Date.now()}`;

    const result = await prisma.$transaction(async (tx) => {
      const lot = await tx.inventoryLot.create({
        data: {
          storeId,
          productId,
          warehouseId,
          locationId: locationId || null,
          lotCode: finalLotCode,
          sourceType: sourceType || "manual_receipt",
          supplierName: supplierName || null,
          purchasedAt: purchasedAt ? new Date(purchasedAt) : null,
          quantityReceived: Number(quantity),
          quantityAvailable: Number(quantity),
          unitCostOriginal: String(unitCostOriginal),
          costCurrencyCode,
          fxToEur: String(fxToEur),
          unitCostEurFrozen: String(computedEur.toFixed(4)),
          note: note || null,
        },
      });

      const movement = await tx.inventoryMovement.create({
        data: {
          storeId,
          productId,
          lotId: lot.id,
          warehouseId,
          movementType: "receive_in",
          quantity: Number(quantity),
          unitCostEurFrozen: lot.unitCostEurFrozen,
          referenceType: "manual_receipt",
          referenceId: lot.id,
          reason: note || "Manual receive",
          createdByUserId: userId,
        },
      });

      return { lot, movement };
    });

    return res.status(201).json({
      lot: {
        ...result.lot,
        unitCostOriginal: normalizeMoney(result.lot.unitCostOriginal),
        fxToEur: normalizeMoney(result.lot.fxToEur),
        unitCostEurFrozen: normalizeMoney(result.lot.unitCostEurFrozen),
      },
      movement: result.movement,
    });
  } catch (err) {
    console.error("POST /inventory/receive error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.post("/inventory/out", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { storeId, productId, warehouseId, quantity, referenceType, referenceId, reason } = req.body || {};

    if (!storeId || !productId || !warehouseId || !quantity) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const qtyNeeded = Number(quantity);
    if (!Number.isInteger(qtyNeeded) || qtyNeeded <= 0) {
      return res.status(400).json({ error: "quantity must be a positive integer" });
    }

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });

    const result = await prisma.$transaction(async (tx) =>
      consumeProductFifo(tx, {
        storeId,
        productId,
        quantity: qtyNeeded,
        userId,
        warehouseId,
        referenceType: referenceType || "order",
        referenceId: referenceId || null,
        reason: reason || "Sale / picking",
      })
    );

    if (!result.ok) {
      return res.status(409).json({ error: "INSUFFICIENT_STOCK", available: result.available, requested: result.requested });
    }

    return res.json({ ok: true, consumedLots: result.consumedLots });
  } catch (err) {
    console.error("POST /inventory/out error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/orders", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const storeId = String(req.query.storeId || "").trim();
    const q = String(req.query.q || "").trim();

    if (!storeId) return res.status(400).json({ error: "Missing storeId" });
    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const canSensitive = await canReadSensitive(userId, storeId, membership.roleKey);

    const orders = await prisma.salesOrder.findMany({
      where: {
        storeId,
        ...(q
          ? {
              OR: [
                { orderNumber: { contains: q, mode: "insensitive" } },
                { platform: { contains: q, mode: "insensitive" } },
                { sourceLabel: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: {
        sourceChannel: { select: { id: true, code: true, name: true } },
        customer: { select: { id: true, fullName: true, email: true, country: true } },
        items: { select: { id: true, quantity: true, title: true, revenueEurFrozen: true } },
        invoice: { select: { id: true, invoiceNumber: true } },
        backorders: {
          where: { status: "open" },
          select: { id: true, productId: true, missingQty: true, status: true },
        },
      },
      orderBy: { orderedAt: "desc" },
      take: 200,
    });

    return res.json({
      orders: orders.map((o) => ({
        ...o,
        grossAmountOriginal: canSensitive ? normalizeMoney(o.grossAmountOriginal) : null,
        grossFxToEur: canSensitive ? normalizeMoney(o.grossFxToEur) : null,
        grossAmountEurFrozen: canSensitive ? normalizeMoney(o.grossAmountEurFrozen) : null,
        feesEur: canSensitive ? normalizeMoney(o.feesEur) : null,
        cpaEur: canSensitive ? normalizeMoney(o.cpaEur) : null,
        shippingCostEur: canSensitive ? normalizeMoney(o.shippingCostEur) : null,
        packagingCostEur: canSensitive ? normalizeMoney(o.packagingCostEur) : null,
        returnCostEur: canSensitive ? normalizeMoney(o.returnCostEur) : null,
        cogsEur: canSensitive ? normalizeMoney(o.cogsEur) : null,
        netProfitEur: canSensitive ? normalizeMoney(o.netProfitEur) : null,
        items: o.items.map((it) => ({
          ...it,
          revenueEurFrozen: canSensitive ? normalizeMoney(it.revenueEurFrozen) : null,
        })),
        backorders: o.backorders,
      })),
    });
  } catch (err) {
    console.error("GET /orders error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

  app.post("/orders", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const {
      storeId,
      orderNumber,
      platform,
      sourceChannelId,
      sourceLabel,
      customer,
      customerCountryCode,
      currencyCode,
      grossAmountOriginal,
      grossFxToEur,
      feesEur,
      cpaEur,
      shippingCostEur,
      packagingCostEur,
      returnCostEur,
      status,
      paymentStatus,
      orderedAt,
      items,
      allowBackorder,
    } = req.body || {};

    if (!storeId || !orderNumber || !platform || !currencyCode || !grossAmountOriginal || !grossFxToEur) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Order must include at least one item" });
    }
    if (!isPositiveNumber(grossAmountOriginal) || !isPositiveNumber(grossFxToEur)) {
      return res.status(400).json({ error: "grossAmountOriginal and grossFxToEur must be positive numbers" });
    }
    if (![feesEur, cpaEur, shippingCostEur, packagingCostEur, returnCostEur].every((v) => v === undefined || isNonNegativeNumber(v))) {
      return res.status(400).json({ error: "Cost fields must be non-negative numbers" });
    }
    if (status && !ORDER_STATUSES.has(String(status))) {
      return res.status(400).json({ error: "Invalid order status" });
    }
    if (paymentStatus && !PAYMENT_STATUSES.has(String(paymentStatus))) {
      return res.status(400).json({ error: "Invalid payment status" });
    }
    const parsedOrderDate = orderedAt ? parseDateInput(orderedAt) : new Date();
    if (!parsedOrderDate) {
      return res.status(400).json({ error: "Invalid orderedAt date" });
    }
    const parsedCurrency = parseCurrencyCode(currencyCode);
    if (!parsedCurrency) {
      return res.status(400).json({ error: "Invalid currencyCode format (expected ISO-4217 like EUR)" });
    }

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });

    const canWrite = await canManageOrders(userId, storeId, membership.roleKey);
    if (!canWrite) return res.status(403).json({ error: "No permission to manage orders" });

    if (sourceChannelId) {
      const channel = await prisma.salesChannel.findFirst({
        where: { id: sourceChannelId, storeId },
        select: { id: true },
      });
      if (!channel) return res.status(400).json({ error: "Invalid sourceChannelId for this store" });
    }

    const duplicateItemIds = new Set();
    for (const it of items) {
      if (!Number.isInteger(Number(it.quantity)) || Number(it.quantity) <= 0) {
        return res.status(400).json({ error: "Each item quantity must be a positive integer" });
      }
      if (!isPositiveNumber(it.unitPriceOriginal || 0)) {
        return res.status(400).json({ error: "Each item unitPriceOriginal must be positive" });
      }
      if (it.fxToEur !== undefined && !isPositiveNumber(it.fxToEur)) {
        return res.status(400).json({ error: "Each item fxToEur must be positive when provided" });
      }
      if (it.productId) {
        if (duplicateItemIds.has(it.productId)) {
          return res.status(400).json({ error: "Duplicate productId in order items is not allowed" });
        }
        duplicateItemIds.add(it.productId);
      }
    }

    const grossEurFrozen = roundMoney(numberOrZero(grossAmountOriginal) * numberOrZero(grossFxToEur));
    const fees = numberOrZero(feesEur);
    const cpa = numberOrZero(cpaEur);
    const shipping = numberOrZero(shippingCostEur);
    const packaging = numberOrZero(packagingCostEur);
    const returns = numberOrZero(returnCostEur);

    const order = await prisma.$transaction(async (tx) => {
      let customerId = null;
      if (customer && (customer.email || customer.fullName)) {
        const found = customer.email
          ? await tx.customer.findFirst({ where: { storeId, email: String(customer.email).trim() }, select: { id: true } })
          : null;

        if (found) {
          customerId = found.id;
          await tx.customer.update({
            where: { id: found.id },
            data: {
              fullName: customer.fullName || null,
              country: customer.country || null,
              city: customer.city || null,
            },
          });
        } else {
          const created = await tx.customer.create({
            data: {
              storeId,
              email: customer.email || null,
              fullName: customer.fullName || null,
              country: customer.country || null,
              city: customer.city || null,
            },
          });
          customerId = created.id;
        }
      }

      const createdOrder = await tx.salesOrder.create({
        data: {
          storeId,
          orderNumber: String(orderNumber).trim(),
          platform: String(platform).trim(),
          sourceChannelId: sourceChannelId || null,
          sourceLabel: sourceLabel || null,
          customerId,
          customerCountryCode: customerCountryCode || null,
          currencyCode: parsedCurrency,
          grossAmountOriginal: String(grossAmountOriginal),
          grossFxToEur: String(grossFxToEur),
          grossAmountEurFrozen: String(grossEurFrozen),
          feesEur: String(fees),
          cpaEur: String(cpa),
          shippingCostEur: String(shipping),
          packagingCostEur: String(packaging),
          returnCostEur: String(returns),
          status: status || "pending",
          paymentStatus: paymentStatus || "unpaid",
          orderedAt: parsedOrderDate,
          cogsEur: "0",
          netProfitEur: "0",
        },
      });

      let totalCogs = 0;
      let totalRevenue = 0;
      let hasBackorder = false;

      for (const rawItem of items) {
        const quantity = Number(rawItem.quantity || 1);
        const unitOriginal = numberOrZero(rawItem.unitPriceOriginal);
        const fx = numberOrZero(rawItem.fxToEur || grossFxToEur);
        const unitEur = roundMoney(unitOriginal * fx);
        const revenueEur = roundMoney(unitEur * quantity);

        let productId = rawItem.productId || null;
        let cogsLine = 0;
        let backorderMissing = 0;

        if (!productId && rawItem.productEan) {
          const byScan = await findProductByScan(storeId, rawItem.productEan);
          if (byScan?.product?.id) productId = byScan.product.id;
        }

        if (productId) {
          const productExists = await tx.product.findFirst({
            where: { id: productId, storeId },
            select: { id: true },
          });
          if (!productExists) throw new Error("INVALID_PRODUCT_FOR_STORE");
        }

        if (productId) {
          const stockResult = await consumeProductFifo(tx, {
            storeId,
            productId,
            quantity,
            userId,
            referenceType: "sales_order",
            referenceId: createdOrder.id,
            reason: `Order ${createdOrder.orderNumber}`,
            allowPartial: Boolean(allowBackorder),
          });

          if (!Boolean(allowBackorder) && !stockResult.ok) {
            throw new Error("INSUFFICIENT_STOCK_FOR_ORDER_ITEM");
          }

          cogsLine = roundMoney(stockResult.cogs);
          backorderMissing = Number(stockResult.remaining || 0);
        }

        totalRevenue += revenueEur;
        totalCogs += cogsLine;

        const createdItem = await tx.salesOrderItem.create({
          data: {
            storeId,
            orderId: createdOrder.id,
            productId,
            productEan: rawItem.productEan || null,
            title: rawItem.title || null,
            quantity,
            unitPriceOriginal: String(unitOriginal),
            fxToEur: String(fx),
            unitPriceEurFrozen: String(unitEur),
            revenueEurFrozen: String(revenueEur),
            cogsEurFrozen: String(cogsLine),
          },
        });

        if (productId && backorderMissing > 0) {
          hasBackorder = true;
          await tx.backorderLine.create({
            data: {
              storeId,
              orderId: createdOrder.id,
              orderItemId: createdItem.id,
              productId,
              requestedQty: quantity,
              fulfilledQty: quantity - backorderMissing,
              missingQty: backorderMissing,
              status: "open",
              note: `Auto backorder from order ${createdOrder.orderNumber}`,
            },
          });
        }
      }

      const netProfit = roundMoney(grossEurFrozen - fees - cpa - shipping - packaging - returns - totalCogs);
      const revenueDiff = Math.abs(roundMoney(totalRevenue - grossEurFrozen));
      if (revenueDiff > 0.05) {
        throw new Error("ORDER_REVENUE_MISMATCH");
      }

      return tx.salesOrder.update({
        where: { id: createdOrder.id },
        data: {
          cogsEur: String(totalCogs),
          netProfitEur: String(netProfit),
          status: hasBackorder ? "backorder" : status || "pending",
        },
        include: {
          items: true,
          backorders: true,
          sourceChannel: { select: { id: true, code: true, name: true } },
          customer: { select: { id: true, fullName: true, email: true, country: true } },
        },
      });
    });

    if (Array.isArray(order.backorders) && order.backorders.length > 0) {
      const missingQty = order.backorders.reduce((sum, b) => sum + Number(b.missingQty || 0), 0);
      await createNotificationSafe({
        storeId,
        type: "backorder_created",
        severity: "warning",
        title: `Backorder en pedido ${order.orderNumber}`,
        body: `${order.backorders.length} linea(s) pendientes, ${missingQty} unidad(es) faltantes`,
        linkedEntityType: "sales_order",
        linkedEntityId: order.id,
        createdByUserId: userId,
      });
    }

    return res.status(201).json({ order });
  } catch (err) {
    if (String(err?.message || "") === "INVALID_PRODUCT_FOR_STORE") {
      return res.status(400).json({ error: "Order item references product outside current store" });
    }
    if (String(err?.message || "") === "INSUFFICIENT_STOCK_FOR_ORDER_ITEM") {
      return res.status(409).json({ error: "Insufficient stock for one or more order items" });
    }
    if (String(err?.message || "") === "ORDER_REVENUE_MISMATCH") {
      return res.status(400).json({ error: "Order gross amount does not match sum of item revenues" });
    }
    if (err?.code === "P2002") return res.status(409).json({ error: "Order number already exists" });
    console.error("POST /orders error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.patch("/orders/:orderId/status", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { orderId } = req.params;
    const { storeId, status, paymentStatus } = req.body || {};

    if (!storeId || (!status && !paymentStatus)) {
      return res.status(400).json({ error: "Missing storeId or status updates" });
    }
    if (status && !ORDER_STATUSES.has(String(status))) {
      return res.status(400).json({ error: "Invalid order status" });
    }
    if (paymentStatus && !PAYMENT_STATUSES.has(String(paymentStatus))) {
      return res.status(400).json({ error: "Invalid payment status" });
    }

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const canWrite = await canManageOrders(userId, storeId, membership.roleKey);
    if (!canWrite) return res.status(403).json({ error: "No permission to manage orders" });

    const order = await prisma.salesOrder.findFirst({
      where: { id: orderId, storeId },
      select: { id: true, status: true, paymentStatus: true },
    });
    if (!order) return res.status(404).json({ error: "Order not found" });

    if (status && status !== order.status) {
      if (!isAllowedTransition(order.status, status, ORDER_STATUS_FLOW)) {
        return res.status(409).json({
          error: "Invalid order status transition",
          from: order.status,
          to: status,
        });
      }
    }

    if (paymentStatus && paymentStatus !== order.paymentStatus) {
      if (!isAllowedTransition(order.paymentStatus, paymentStatus, PAYMENT_STATUS_FLOW)) {
        return res.status(409).json({
          error: "Invalid payment status transition",
          from: order.paymentStatus,
          to: paymentStatus,
        });
      }
    }

    const updated = await prisma.salesOrder.update({
      where: { id: orderId },
      data: {
        ...(status ? { status } : {}),
        ...(paymentStatus ? { paymentStatus } : {}),
      },
    });

    return res.json({ order: updated });
  } catch (err) {
    console.error("PATCH /orders/:orderId/status error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/backorders", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const storeId = String(req.query.storeId || "").trim();
    const status = String(req.query.status || "open").trim();
    if (!storeId) return res.status(400).json({ error: "Missing storeId" });

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const canWriteOrders = await canManageOrders(userId, storeId, membership.roleKey);
    if (!canWriteOrders) return res.status(403).json({ error: "No permission to manage orders" });

    const backorders = await prisma.backorderLine.findMany({
      where: { storeId, ...(status ? { status } : {}) },
      include: {
        order: { select: { id: true, orderNumber: true, status: true } },
        product: { select: { id: true, ean: true, brand: true, model: true } },
      },
      orderBy: [{ createdAt: "desc" }],
      take: 300,
    });

    return res.json({ backorders });
  } catch (err) {
    console.error("GET /backorders error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.patch("/backorders/:backorderId/fulfill", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { backorderId } = req.params;
    const { storeId, fulfillQty, warehouseId } = req.body || {};

    if (!storeId || !Number.isInteger(Number(fulfillQty)) || Number(fulfillQty) <= 0) {
      return res.status(400).json({ error: "Missing storeId or invalid fulfillQty" });
    }

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const canWriteOrders = await canManageOrders(userId, storeId, membership.roleKey);
    if (!canWriteOrders) return res.status(403).json({ error: "No permission to manage orders" });

    const result = await prisma.$transaction(async (tx) => {
      const line = await tx.backorderLine.findFirst({
        where: { id: backorderId, storeId },
        include: { order: { select: { id: true, orderNumber: true, status: true } } },
      });
      if (!line) return { error: { code: "NOT_FOUND" } };
      if (line.status !== "open") return { error: { code: "BACKORDER_NOT_OPEN" } };

      const openQty = Number(line.missingQty) - Number(line.fulfilledQty);
      const qty = Number(fulfillQty);
      if (qty > openQty) {
        return { error: { code: "FULFILL_QTY_EXCEEDS_OPEN", openQty, requested: qty } };
      }

      const stockResult = await consumeProductFifo(tx, {
        storeId,
        productId: line.productId,
        quantity: qty,
        userId,
        warehouseId: warehouseId || null,
        referenceType: "backorder_fulfillment",
        referenceId: line.id,
        reason: `Backorder ${line.id} fulfillment`,
      });

      if (!stockResult.ok) {
        return {
          error: {
            code: "INSUFFICIENT_STOCK",
            available: stockResult.available,
            requested: stockResult.requested,
          },
        };
      }

      const nextFulfilled = Number(line.fulfilledQty) + qty;
      const nextStatus = nextFulfilled >= Number(line.missingQty) ? "fulfilled" : "open";

      const updatedLine = await tx.backorderLine.update({
        where: { id: line.id },
        data: {
          fulfilledQty: nextFulfilled,
          status: nextStatus,
        },
      });

      if (nextStatus === "fulfilled") {
        const openCount = await tx.backorderLine.count({
          where: { orderId: line.orderId, status: "open" },
        });
        if (openCount === 0 && line.order.status === "backorder") {
          await tx.salesOrder.update({
            where: { id: line.orderId },
            data: { status: "paid" },
          });
        }
      }

      return { line: updatedLine, consumedLots: stockResult.consumedLots };
    });

    if (result.error) {
      if (result.error.code === "NOT_FOUND") return res.status(404).json({ error: "Backorder not found" });
      if (result.error.code === "BACKORDER_NOT_OPEN") return res.status(409).json({ error: "Backorder is not open" });
      if (result.error.code === "FULFILL_QTY_EXCEEDS_OPEN") return res.status(409).json({ error: "fulfillQty exceeds open qty", ...result.error });
      if (result.error.code === "INSUFFICIENT_STOCK") return res.status(409).json({ error: "INSUFFICIENT_STOCK", ...result.error });
    }

    return res.json({ backorder: result.line, consumedLots: result.consumedLots });
  } catch (err) {
    console.error("PATCH /backorders/:backorderId/fulfill error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/inventory/alerts/low-stock", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const storeId = String(req.query.storeId || "").trim();
    const warehouseId = String(req.query.warehouseId || "").trim();
    const thresholdRaw = Number(req.query.threshold || 2);
    const threshold = Number.isFinite(thresholdRaw) ? Math.max(0, Math.floor(thresholdRaw)) : 2;

    if (!storeId) return res.status(400).json({ error: "Missing storeId" });
    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });

    const products = await prisma.product.findMany({
      where: { storeId, status: "active" },
      select: { id: true, ean: true, brand: true, model: true, name: true },
      orderBy: [{ brand: "asc" }, { model: "asc" }],
      take: 500,
    });

    const lots = await prisma.inventoryLot.groupBy({
      by: ["productId"],
      where: {
        storeId,
        quantityAvailable: { gt: 0 },
        status: "available",
        ...(warehouseId ? { warehouseId } : {}),
      },
      _sum: { quantityAvailable: true },
    });

    const stockByProduct = new Map(lots.map((l) => [l.productId, Number(l._sum.quantityAvailable || 0)]));
    const alerts = products
      .map((p) => {
        const stock = stockByProduct.get(p.id) || 0;
        return {
          productId: p.id,
          ean: p.ean,
          brand: p.brand,
          model: p.model,
          name: p.name,
          currentStock: stock,
          threshold,
          severity: stock === 0 ? "critical" : "low",
        };
      })
      .filter((a) => a.currentStock <= threshold)
      .slice(0, 200);

    return res.json({ alerts });
  } catch (err) {
    console.error("GET /inventory/alerts/low-stock error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/analytics/summary", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const storeId = String(req.query.storeId || "").trim();
    if (!storeId) return res.status(400).json({ error: "Missing storeId" });

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const canSensitive = await canReadSensitive(userId, storeId, membership.roleKey);
    if (!canSensitive) return res.status(403).json({ error: "No permission to read analytics" });

    const range = parseDateRange(req.query);
    const orderWhere = {
      storeId,
      ...(range.from || range.to
        ? {
            orderedAt: {
              ...(range.from ? { gte: range.from } : {}),
              ...(range.to ? { lte: range.to } : {}),
            },
          }
        : {}),
    };

    const payoutWhere = {
      storeId,
      ...(range.from || range.to
        ? {
            payoutDate: {
              ...(range.from ? { gte: range.from } : {}),
              ...(range.to ? { lte: range.to } : {}),
            },
          }
        : {}),
    };

    const returnWhere = {
      storeId,
      ...(range.from || range.to
        ? {
            createdAt: {
              ...(range.from ? { gte: range.from } : {}),
              ...(range.to ? { lte: range.to } : {}),
            },
          }
        : {}),
    };

    const [orders, payouts, returns, lots] = await Promise.all([
      prisma.salesOrder.findMany({
        where: orderWhere,
        select: { grossAmountEurFrozen: true, netProfitEur: true, cogsEur: true },
      }),
      prisma.payout.findMany({
        where: payoutWhere,
        include: { matches: { select: { amountEur: true } } },
      }),
      prisma.returnCase.findMany({
        where: returnWhere,
        select: { returnCostEur: true, status: true },
      }),
      prisma.inventoryLot.findMany({
        where: { storeId, quantityAvailable: { gt: 0 } },
        select: { quantityAvailable: true, unitCostEurFrozen: true },
      }),
    ]);

    const salesRevenueEur = roundMoney(orders.reduce((s, o) => s + numberOrZero(o.grossAmountEurFrozen), 0));
    const salesProfitEur = roundMoney(orders.reduce((s, o) => s + numberOrZero(o.netProfitEur), 0));
    const salesCogsEur = roundMoney(orders.reduce((s, o) => s + numberOrZero(o.cogsEur), 0));

    const payoutGrossEur = roundMoney(payouts.reduce((s, p) => s + numberOrZero(p.amountEurFrozen), 0));
    const payoutNetExpectedEur = roundMoney(
      payouts.reduce((s, p) => s + numberOrZero(p.amountEurFrozen) - numberOrZero(p.feesEur) + numberOrZero(p.adjustmentsEur), 0)
    );
    const payoutReconciledEur = roundMoney(
      payouts.reduce((s, p) => s + p.matches.reduce((m, row) => m + numberOrZero(row.amountEur), 0), 0)
    );

    const returnCostEur = roundMoney(returns.reduce((s, r) => s + numberOrZero(r.returnCostEur), 0));
    const inventoryValueEur = roundMoney(
      lots.reduce((s, l) => s + numberOrZero(l.unitCostEurFrozen) * Number(l.quantityAvailable || 0), 0)
    );

    return res.json({
      range: { dateFrom: range.from, dateTo: range.to },
      sales: {
        ordersCount: orders.length,
        revenueEur: salesRevenueEur,
        cogsEur: salesCogsEur,
        profitEur: salesProfitEur,
      },
      payouts: {
        payoutsCount: payouts.length,
        grossEur: payoutGrossEur,
        netExpectedEur: payoutNetExpectedEur,
        reconciledEur: payoutReconciledEur,
        discrepancyEur: roundMoney(payoutNetExpectedEur - payoutReconciledEur),
      },
      returns: {
        casesCount: returns.length,
        totalCostEur: returnCostEur,
      },
      inventory: {
        stockLots: lots.length,
        valueEur: inventoryValueEur,
      },
    });
  } catch (err) {
    console.error("GET /analytics/summary error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/analytics/channels", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const storeId = String(req.query.storeId || "").trim();
    if (!storeId) return res.status(400).json({ error: "Missing storeId" });

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const canSensitive = await canReadSensitive(userId, storeId, membership.roleKey);
    if (!canSensitive) return res.status(403).json({ error: "No permission to read analytics" });

    const range = parseDateRange(req.query);
    const orders = await prisma.salesOrder.findMany({
      where: {
        storeId,
        ...(range.from || range.to
          ? {
              orderedAt: {
                ...(range.from ? { gte: range.from } : {}),
                ...(range.to ? { lte: range.to } : {}),
              },
            }
          : {}),
      },
      include: { sourceChannel: { select: { id: true, code: true, name: true } } },
    });

    const byChannel = new Map();
    for (const o of orders) {
      const key = o.sourceChannelId || "manual";
      const entry = byChannel.get(key) || {
        channelId: o.sourceChannelId || null,
        channelCode: o.sourceChannel?.code || "MANUAL",
        channelName: o.sourceChannel?.name || o.sourceLabel || "Manual/Unknown",
        orders: 0,
        revenueEur: 0,
        profitEur: 0,
        returns: 0,
      };
      entry.orders += 1;
      entry.revenueEur += numberOrZero(o.grossAmountEurFrozen);
      entry.profitEur += numberOrZero(o.netProfitEur);
      if (o.status === "returned") entry.returns += 1;
      byChannel.set(key, entry);
    }

    return res.json({
      channels: Array.from(byChannel.values())
        .map((r) => ({
          ...r,
          revenueEur: roundMoney(r.revenueEur),
          profitEur: roundMoney(r.profitEur),
          returnRatePct: r.orders ? roundMoney((r.returns / r.orders) * 100) : 0,
        }))
        .sort((a, b) => b.revenueEur - a.revenueEur),
    });
  } catch (err) {
    console.error("GET /analytics/channels error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/analytics/countries", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const storeId = String(req.query.storeId || "").trim();
    if (!storeId) return res.status(400).json({ error: "Missing storeId" });

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const canSensitive = await canReadSensitive(userId, storeId, membership.roleKey);
    if (!canSensitive) return res.status(403).json({ error: "No permission to read analytics" });

    const range = parseDateRange(req.query);
    const orders = await prisma.salesOrder.findMany({
      where: {
        storeId,
        ...(range.from || range.to
          ? {
              orderedAt: {
                ...(range.from ? { gte: range.from } : {}),
                ...(range.to ? { lte: range.to } : {}),
              },
            }
          : {}),
      },
      select: { customerCountryCode: true, grossAmountEurFrozen: true, netProfitEur: true, status: true },
    });

    const byCountry = new Map();
    for (const o of orders) {
      const code = (o.customerCountryCode || "UN").toUpperCase();
      const entry = byCountry.get(code) || { countryCode: code, orders: 0, revenueEur: 0, profitEur: 0, returns: 0 };
      entry.orders += 1;
      entry.revenueEur += numberOrZero(o.grossAmountEurFrozen);
      entry.profitEur += numberOrZero(o.netProfitEur);
      if (o.status === "returned") entry.returns += 1;
      byCountry.set(code, entry);
    }

    return res.json({
      countries: Array.from(byCountry.values())
        .map((r) => ({
          ...r,
          revenueEur: roundMoney(r.revenueEur),
          profitEur: roundMoney(r.profitEur),
          returnRatePct: r.orders ? roundMoney((r.returns / r.orders) * 100) : 0,
        }))
        .sort((a, b) => b.revenueEur - a.revenueEur),
    });
  } catch (err) {
    console.error("GET /analytics/countries error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/returns", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const storeId = String(req.query.storeId || "").trim();
    const status = String(req.query.status || "").trim();
    if (!storeId) return res.status(400).json({ error: "Missing storeId" });

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });

    const canSensitive = await canReadSensitive(userId, storeId, membership.roleKey);
    const returns = await prisma.returnCase.findMany({
      where: { storeId, ...(status ? { status } : {}) },
      include: {
        order: { select: { id: true, orderNumber: true } },
        product: { select: { id: true, ean: true, brand: true, model: true } },
        warehouse: { select: { id: true, code: true, name: true } },
        processedBy: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return res.json({
      returns: returns.map((r) => ({
        ...r,
        returnCostEur: canSensitive ? normalizeMoney(r.returnCostEur) : null,
      })),
    });
  } catch (err) {
    console.error("GET /returns error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.post("/returns", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const {
      storeId,
      orderId,
      productId,
      trackingCode,
      reason,
      labelPayer,
      conditionState,
      packagingRecovered,
      decision,
      quantity,
      returnCostEur,
      warehouseId,
    } = req.body || {};

    if (!storeId || !decision || !quantity) {
      return res.status(400).json({ error: "Missing storeId, decision or quantity" });
    }
    if (!Number.isInteger(Number(quantity)) || Number(quantity) <= 0) {
      return res.status(400).json({ error: "quantity must be a positive integer" });
    }
    if (!["restock", "discount", "repair", "scrap"].includes(String(decision))) {
      return res.status(400).json({ error: "Invalid decision" });
    }
    if (returnCostEur !== undefined && !isNonNegativeNumber(returnCostEur)) {
      return res.status(400).json({ error: "returnCostEur must be non-negative" });
    }

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const canWrite = await canManageReturns(userId, storeId, membership.roleKey);
    if (!canWrite) return res.status(403).json({ error: "No permission to manage returns" });

    if (decision === "restock" && !warehouseId) {
      return res.status(400).json({ error: "warehouseId is required for restock returns" });
    }

    const result = await prisma.$transaction(async (tx) => {
      const order = orderId
        ? await tx.salesOrder.findFirst({ where: { id: orderId, storeId }, select: { id: true, returnCostEur: true, netProfitEur: true, status: true } })
        : null;
      if (orderId && !order) throw new Error("ORDER_NOT_FOUND");

      const product = productId
        ? await tx.product.findFirst({ where: { id: productId, storeId }, select: { id: true, ean: true } })
        : null;
      if (productId && !product) throw new Error("PRODUCT_NOT_FOUND");

      const warehouse = warehouseId
        ? await tx.warehouse.findFirst({ where: { id: warehouseId, storeId }, select: { id: true, code: true } })
        : null;
      if (warehouseId && !warehouse) throw new Error("WAREHOUSE_NOT_FOUND");

      const returnCase = await tx.returnCase.create({
        data: {
          storeId,
          orderId: orderId || null,
          productId: productId || null,
          trackingCode: trackingCode || null,
          reason: reason || null,
          labelPayer: labelPayer || null,
          conditionState: conditionState || null,
          packagingRecovered: Boolean(packagingRecovered),
          decision,
          status: "processed",
          quantity: Number(quantity),
          returnCostEur: String(numberOrZero(returnCostEur)),
          warehouseId: warehouseId || null,
          processedByUserId: userId,
          processedAt: new Date(),
        },
      });

      if (order) {
        const extra = numberOrZero(returnCostEur);
        const currentReturn = numberOrZero(order.returnCostEur);
        const currentProfit = numberOrZero(order.netProfitEur);
        await tx.salesOrder.update({
          where: { id: order.id },
          data: {
            returnCostEur: String(roundMoney(currentReturn + extra)),
            netProfitEur: String(roundMoney(currentProfit - extra)),
            status: decision === "restock" || decision === "discount" || decision === "repair" || decision === "scrap" ? "returned" : order.status,
          },
        });
      }

      if (decision === "restock" && product && warehouse) {
        const lot = await tx.inventoryLot.create({
          data: {
            storeId,
            productId: product.id,
            warehouseId: warehouse.id,
            lotCode: `RET-${new Date().toISOString().slice(0, 10)}-${Date.now()}`,
            sourceType: "return_restock",
            status: "available",
            supplierName: "Return",
            purchasedAt: null,
            receivedAt: new Date(),
            quantityReceived: Number(quantity),
            quantityAvailable: Number(quantity),
            unitCostOriginal: "0",
            costCurrencyCode: "EUR",
            fxToEur: "1",
            unitCostEurFrozen: "0",
            note: `Restock from return ${returnCase.id}`,
          },
        });

        await tx.inventoryMovement.create({
          data: {
            storeId,
            productId: product.id,
            lotId: lot.id,
            warehouseId: warehouse.id,
            movementType: "return_in",
            quantity: Number(quantity),
            unitCostEurFrozen: "0",
            referenceType: "return_case",
            referenceId: returnCase.id,
            reason: "Return restock",
            createdByUserId: userId,
          },
        });
      }

      return returnCase;
    });

    await createNotificationSafe({
      storeId,
      type: "return_processed",
      severity: "info",
      title: `Devolucion procesada (${result.decision})`,
      body: `Cantidad: ${result.quantity}${result.trackingCode ? ` | Tracking: ${result.trackingCode}` : ""}`,
      linkedEntityType: "return_case",
      linkedEntityId: result.id,
      createdByUserId: userId,
    });

    return res.status(201).json({ returnCase: result });
  } catch (err) {
    const msg = String(err?.message || "");
    if (msg === "ORDER_NOT_FOUND") return res.status(404).json({ error: "Order not found for this store" });
    if (msg === "PRODUCT_NOT_FOUND") return res.status(404).json({ error: "Product not found for this store" });
    if (msg === "WAREHOUSE_NOT_FOUND") return res.status(404).json({ error: "Warehouse not found for this store" });
    console.error("POST /returns error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/payouts", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const storeId = String(req.query.storeId || "").trim();
    if (!storeId) return res.status(400).json({ error: "Missing storeId" });

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const canSensitive = await canReadSensitive(userId, storeId, membership.roleKey);
    if (!canSensitive) return res.status(403).json({ error: "No permission to read payouts" });

    const payouts = await prisma.payout.findMany({
      where: { storeId },
      include: {
        channel: { select: { id: true, code: true, name: true } },
        matches: {
          include: {
            order: { select: { id: true, orderNumber: true, grossAmountEurFrozen: true, netProfitEur: true } },
          },
        },
      },
      orderBy: { payoutDate: "desc" },
      take: 200,
    });

    return res.json({
      payouts: payouts.map((p) => ({
        ...(() => {
          const gross = normalizeMoney(p.amountEurFrozen);
          const fees = normalizeMoney(p.feesEur);
          const adjustments = normalizeMoney(p.adjustmentsEur);
          const reconciled = roundMoney(p.matches.reduce((sum, m) => sum + numberOrZero(m.amountEur), 0));
          const netExpected = roundMoney(numberOrZero(gross) - numberOrZero(fees) + numberOrZero(adjustments));
          return {
            netExpectedEur: netExpected,
            reconciledEur: reconciled,
            discrepancyEur: roundMoney(netExpected - reconciled),
          };
        })(),
        ...p,
        amountOriginal: normalizeMoney(p.amountOriginal),
        fxToEur: normalizeMoney(p.fxToEur),
        amountEurFrozen: normalizeMoney(p.amountEurFrozen),
        feesEur: normalizeMoney(p.feesEur),
        adjustmentsEur: normalizeMoney(p.adjustmentsEur),
      })),
    });
  } catch (err) {
    console.error("GET /payouts error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.post("/payouts", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const {
      storeId,
      channelId,
      payoutRef,
      payoutDate,
      currencyCode,
      amountOriginal,
      fxToEur,
      feesEur,
      adjustmentsEur,
      note,
      orderMatches,
    } = req.body || {};

    if (!storeId || !payoutRef || !payoutDate || !currencyCode || !amountOriginal || !fxToEur) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    if (!isPositiveNumber(amountOriginal) || !isPositiveNumber(fxToEur)) {
      return res.status(400).json({ error: "amountOriginal and fxToEur must be positive numbers" });
    }
    if (![feesEur, adjustmentsEur].every((v) => v === undefined || Number.isFinite(Number(v)))) {
      return res.status(400).json({ error: "feesEur and adjustmentsEur must be numeric values" });
    }
    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const canWrite = await canManagePayouts(userId, storeId, membership.roleKey);
    if (!canWrite) return res.status(403).json({ error: "No permission to manage payouts" });

    if (channelId) {
      const channel = await prisma.salesChannel.findFirst({
        where: { id: channelId, storeId },
        select: { id: true },
      });
      if (!channel) return res.status(400).json({ error: "Invalid channelId for this store" });
    }
    const parsedPayoutDate = parseDateInput(payoutDate);
    if (!parsedPayoutDate) return res.status(400).json({ error: "Invalid payoutDate" });
    const parsedCurrency = parseCurrencyCode(currencyCode);
    if (!parsedCurrency) return res.status(400).json({ error: "Invalid currencyCode format (expected ISO-4217 like EUR)" });

    const amountEurFrozen = roundMoney(numberOrZero(amountOriginal) * numberOrZero(fxToEur));
    const feesValue = numberOrZero(feesEur);
    const adjustmentsValue = numberOrZero(adjustmentsEur);
    const netPayoutEur = roundMoney(amountEurFrozen - feesValue + adjustmentsValue);
    if (netPayoutEur < 0) {
      return res.status(400).json({ error: "Net payout cannot be negative after fees/adjustments" });
    }
    const payout = await prisma.$transaction(async (tx) => {
      let matchedTotal = 0;
      const matchIds = new Set();
      const created = await tx.payout.create({
        data: {
          storeId,
          channelId: channelId || null,
          payoutRef: String(payoutRef).trim(),
          payoutDate: parsedPayoutDate,
          currencyCode: parsedCurrency,
          amountOriginal: String(amountOriginal),
          fxToEur: String(fxToEur),
          amountEurFrozen: String(amountEurFrozen),
          feesEur: String(feesValue),
          adjustmentsEur: String(adjustmentsValue),
          note: note || null,
        },
      });

      if (Array.isArray(orderMatches)) {
        for (const m of orderMatches) {
          if (!m?.orderId || !m?.amountEur) continue;
          if (!isPositiveNumber(m.amountEur)) throw new Error("INVALID_MATCH_AMOUNT");
          if (matchIds.has(m.orderId)) throw new Error("DUPLICATE_ORDER_MATCH");
          matchIds.add(m.orderId);
          const order = await tx.salesOrder.findFirst({
            where: { id: m.orderId, storeId },
            select: { id: true, sourceChannelId: true },
          });
          if (!order) throw new Error("INVALID_ORDER_MATCH");
          if (channelId && order.sourceChannelId && order.sourceChannelId !== channelId) {
            throw new Error("ORDER_CHANNEL_MISMATCH");
          }
          matchedTotal += numberOrZero(m.amountEur);
          await tx.payoutOrderMatch.create({
            data: {
              storeId,
              payoutId: created.id,
              orderId: m.orderId,
              amountEur: String(numberOrZero(m.amountEur)),
            },
          });
        }
      }

      if (roundMoney(matchedTotal) > roundMoney(netPayoutEur) + 0.01) {
        throw new Error("MATCHES_EXCEED_PAYOUT");
      }

      return tx.payout.findUnique({
        where: { id: created.id },
        include: {
          matches: {
            include: { order: { select: { id: true, orderNumber: true, grossAmountEurFrozen: true } } },
          },
          channel: { select: { id: true, code: true, name: true } },
        },
      });
    });

    return res.status(201).json({ payout });
  } catch (err) {
    const message = String(err?.message || "");
    if (message === "INVALID_MATCH_AMOUNT") return res.status(400).json({ error: "Each order match amount must be positive" });
    if (message === "DUPLICATE_ORDER_MATCH") return res.status(400).json({ error: "Duplicate order in payout matches" });
    if (message === "INVALID_ORDER_MATCH") return res.status(400).json({ error: "One or more matched orders are invalid for this store" });
    if (message === "ORDER_CHANNEL_MISMATCH") return res.status(400).json({ error: "Matched order channel does not match payout channel" });
    if (message === "MATCHES_EXCEED_PAYOUT") return res.status(409).json({ error: "Matched total exceeds payout amount" });
    if (err?.code === "P2002") return res.status(409).json({ error: "Payout reference already exists" });
    console.error("POST /payouts error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.post("/payouts/:payoutId/match", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { payoutId } = req.params;
    const { storeId, orderId, amountEur } = req.body || {};
    if (!storeId || !orderId || !amountEur) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    if (!isPositiveNumber(amountEur)) {
      return res.status(400).json({ error: "amountEur must be a positive number" });
    }

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const canWrite = await canManagePayouts(userId, storeId, membership.roleKey);
    if (!canWrite) return res.status(403).json({ error: "No permission to manage payouts" });

    const [payout, order, existingMatchTotal] = await Promise.all([
      prisma.payout.findFirst({
        where: { id: payoutId, storeId },
        select: { id: true, amountEurFrozen: true, feesEur: true, adjustmentsEur: true, channelId: true },
      }),
      prisma.salesOrder.findFirst({
        where: { id: orderId, storeId },
        select: { id: true, sourceChannelId: true },
      }),
      prisma.payoutOrderMatch.aggregate({
        where: { payoutId, storeId, NOT: { orderId } },
        _sum: { amountEur: true },
      }),
    ]);
    if (!payout || !order) return res.status(404).json({ error: "Payout or order not found" });
    if (payout.channelId && order.sourceChannelId && payout.channelId !== order.sourceChannelId) {
      return res.status(400).json({ error: "Order channel does not match payout channel" });
    }

    const used = numberOrZero(existingMatchTotal?._sum?.amountEur);
    const candidate = used + numberOrZero(amountEur);
    const netAvailable = roundMoney(
      numberOrZero(payout.amountEurFrozen) - numberOrZero(payout.feesEur) + numberOrZero(payout.adjustmentsEur)
    );
    if (roundMoney(candidate) > netAvailable + 0.01) {
      return res.status(409).json({ error: "Match exceeds available payout amount" });
    }

    const match = await prisma.payoutOrderMatch.upsert({
      where: { payoutId_orderId: { payoutId, orderId } },
      update: { amountEur: String(numberOrZero(amountEur)) },
      create: { storeId, payoutId, orderId, amountEur: String(numberOrZero(amountEur)) },
    });

    return res.json({ match });
  } catch (err) {
    console.error("POST /payouts/:payoutId/match error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/invoices", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const storeId = String(req.query.storeId || "").trim();
    if (!storeId) return res.status(400).json({ error: "Missing storeId" });

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const canSensitive = await canReadSensitive(userId, storeId, membership.roleKey);
    if (!canSensitive) return res.status(403).json({ error: "No permission to read invoices" });

    const invoices = await prisma.invoice.findMany({
      where: { storeId },
      include: { order: { select: { id: true, orderNumber: true, customerCountryCode: true } } },
      orderBy: { issuedAt: "desc" },
      take: 200,
    });

    return res.json({
      invoices: invoices.map((i) => ({
        ...i,
        subtotalEur: normalizeMoney(i.subtotalEur),
        taxEur: normalizeMoney(i.taxEur),
        totalEur: normalizeMoney(i.totalEur),
      })),
    });
  } catch (err) {
    console.error("GET /invoices error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

  app.post("/invoices", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { storeId, orderId, dueAt, billingName, billingAddress, billingCountry, notes, taxEur } = req.body || {};
    if (!storeId || !orderId) return res.status(400).json({ error: "Missing storeId or orderId" });
    if (taxEur !== undefined && !isNonNegativeNumber(taxEur)) {
      return res.status(400).json({ error: "taxEur must be a non-negative number" });
    }

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const canWrite = await canManageInvoices(userId, storeId, membership.roleKey);
    if (!canWrite) return res.status(403).json({ error: "No permission to manage invoices" });

    const parsedDueAt = dueAt ? parseDateInput(dueAt) : null;
    if (dueAt && !parsedDueAt) {
      return res.status(400).json({ error: "Invalid dueAt date" });
    }

    const invoice = await prisma.$transaction(async (tx) => {
      const order = await tx.salesOrder.findFirst({
        where: { id: orderId, storeId },
        select: { id: true, currencyCode: true, grossAmountEurFrozen: true, status: true, paymentStatus: true },
      });
      if (!order) throw new Error("ORDER_NOT_FOUND");
      if (order.status === "cancelled") throw new Error("ORDER_CANCELLED");
      if (order.paymentStatus === "unpaid") throw new Error("ORDER_UNPAID");

      const existing = await tx.invoice.findUnique({ where: { orderId }, select: { id: true } });
      if (existing) {
        return tx.invoice.findUnique({ where: { id: existing.id }, include: { order: true } });
      }

      const subtotal = numberOrZero(order.grossAmountEurFrozen);
      const tax = numberOrZero(taxEur);
      const total = roundMoney(subtotal + tax);
      const invoiceNumber = await nextInvoiceNumber(tx, storeId);

      return tx.invoice.create({
        data: {
          storeId,
          orderId,
          invoiceNumber,
          status: "issued",
          issuedAt: new Date(),
          dueAt: parsedDueAt,
          currencyCode: order.currencyCode || "EUR",
          subtotalEur: String(subtotal),
          taxEur: String(tax),
          totalEur: String(total),
          billingName: billingName || null,
          billingAddress: billingAddress || null,
          billingCountry: billingCountry || null,
          notes: notes || null,
        },
        include: { order: true },
      });
    });

    return res.status(201).json({ invoice });
  } catch (err) {
    if (String(err?.message || "") === "ORDER_NOT_FOUND") {
      return res.status(404).json({ error: "Order not found" });
    }
    if (String(err?.message || "") === "ORDER_CANCELLED") {
      return res.status(409).json({ error: "Cannot invoice a cancelled order" });
    }
    if (String(err?.message || "") === "ORDER_UNPAID") {
      return res.status(409).json({ error: "Cannot invoice an unpaid order" });
    }
    console.error("POST /invoices error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/invoices/:invoiceId/document", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { invoiceId } = req.params;
    const storeId = String(req.query.storeId || "").trim();
    const format = String(req.query.format || "html").trim().toLowerCase();
    if (!storeId) return res.status(400).json({ error: "Missing storeId" });

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const canSensitive = await canReadSensitive(userId, storeId, membership.roleKey);
    if (!canSensitive) return res.status(403).json({ error: "No permission to read invoice documents" });

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, storeId },
      include: { order: true, store: true },
    });
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });

    if (format === "pdf") {
      const pdfBuffer = buildInvoicePdfBuffer({
        invoice,
        storeName: invoice.store.name,
        orderNumber: invoice.order.orderNumber,
      });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${invoice.invoiceNumber}.pdf"`);
      return res.send(pdfBuffer);
    }

    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Invoice ${invoice.invoiceNumber}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
      .row { display: flex; justify-content: space-between; margin-bottom: 6px; }
      .box { border: 1px solid #ddd; border-radius: 8px; padding: 12px; margin-top: 12px; }
      h1 { margin: 0 0 10px 0; }
    </style>
  </head>
  <body>
    <h1>Invoice ${invoice.invoiceNumber}</h1>
    <div class="row"><span>Store</span><span>${invoice.store.name}</span></div>
    <div class="row"><span>Order</span><span>${invoice.order.orderNumber}</span></div>
    <div class="row"><span>Issued</span><span>${invoice.issuedAt.toISOString().slice(0, 10)}</span></div>
    <div class="row"><span>Billing Name</span><span>${invoice.billingName || "-"}</span></div>
    <div class="row"><span>Billing Country</span><span>${invoice.billingCountry || "-"}</span></div>
    <div class="box">
      <div class="row"><span>Subtotal (EUR)</span><span>${normalizeMoney(invoice.subtotalEur)?.toFixed(2)}</span></div>
      <div class="row"><span>Tax (EUR)</span><span>${normalizeMoney(invoice.taxEur)?.toFixed(2)}</span></div>
      <div class="row"><strong>Total (EUR)</strong><strong>${normalizeMoney(invoice.totalEur)?.toFixed(2)}</strong></div>
    </div>
  </body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  } catch (err) {
    console.error("GET /invoices/:invoiceId/document error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/products/:productId", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { productId } = req.params;
    const storeId = String(req.query.storeId || "").trim();

    if (!storeId) return res.status(400).json({ error: "Missing storeId" });

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });

    const sensitive = await canReadSensitive(userId, storeId, membership.roleKey);

    const product = await prisma.product.findFirst({
      where: { id: productId, storeId },
      include: {
        eanAliases: true,
        images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }] },
        listings: { include: { channel: true } },
        texts: true,
        channelLinks: { include: { salesChannel: true } },
        channelPrices: {
          where: { isActive: true },
          include: { salesChannel: true },
          orderBy: { createdAt: "desc" },
        },
        channelTexts: { include: { salesChannel: true }, orderBy: [{ locale: "asc" }] },
        lots: {
          include: {
            warehouse: { select: { id: true, code: true, name: true } },
            location: { select: { id: true, code: true, name: true } },
          },
          orderBy: [{ receivedAt: "asc" }, { createdAt: "asc" }],
        },
        movements: {
          take: 100,
          orderBy: { createdAt: "desc" },
          include: {
            warehouse: { select: { id: true, code: true, name: true } },
            createdBy: { select: { id: true, fullName: true, email: true } },
          },
        },
      },
    });

    if (!product) return res.status(404).json({ error: "Product not found" });

    const lots = product.lots.map((lot) => {
      if (!sensitive) {
        return {
          id: lot.id,
          lotCode: lot.lotCode,
          sourceType: lot.sourceType,
          status: lot.status,
          supplierName: null,
          purchasedAt: lot.purchasedAt,
          receivedAt: lot.receivedAt,
          quantityReceived: lot.quantityReceived,
          quantityAvailable: lot.quantityAvailable,
          warehouse: lot.warehouse,
          location: lot.location,
          note: lot.note,
        };
      }

      return {
        ...lot,
        unitCostOriginal: normalizeMoney(lot.unitCostOriginal),
        fxToEur: normalizeMoney(lot.fxToEur),
        unitCostEurFrozen: normalizeMoney(lot.unitCostEurFrozen),
      };
    });

    return res.json({
      product: {
        ...product,
        lots,
      },
      access: { roleKey: membership.roleKey, canReadSensitive: sensitive },
    });
  } catch (err) {
    console.error("GET /products/:productId error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

const PORT = Number(process.env.PORT || 3001);
app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
