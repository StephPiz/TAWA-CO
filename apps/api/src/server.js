const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");

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
    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

app.get("/health", (req, res) => {
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
      { sub: user.id, email: user.email },
      process.env.JWT_SECRET || "dev-secret",
      { expiresIn: "2h" }
    );

    return res.json({
      accessToken: token,
      user: { id: user.id, email: user.email, fullName: user.fullName },
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
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/me", requireAuth, async (req, res) => {
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
});

app.get("/holdings", requireAuth, async (req, res) => {
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
});

app.get("/stores", requireAuth, async (req, res) => {
  const userId = req.user.sub;
  const holdingId = req.query.holdingId;

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
});

// Inventario (por tienda)
// GET /inventory?storeId=...&q=...&withImages=0|1
app.get("/inventory", requireAuth, async (req, res) => {
  const userId = req.user.sub;
  const storeId = String(req.query.storeId || "");
  const q = String(req.query.q || "").trim();
  const withImages = String(req.query.withImages || "1") !== "0";

  if (!storeId) return res.status(400).json({ error: "Missing storeId" });

  // Seguridad: validar que el usuario pertenece a esa tienda
  const membership = await prisma.userStoreMembership.findFirst({
    where: { userId, storeId },
  });
  if (!membership) return res.status(403).json({ error: "No access to store" });

  // Buscar productos de esa tienda (si tu schema no tiene product.storeId, ajustamos)
  // Asumimos que Product tiene storeId o que existe tabla de relación.
  // Por ahora: devolvemos todo lo que existe y filtramos por texto si hay q.
  const products = await prisma.product.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { brand: { contains: q, mode: "insensitive" } },
            { model: { contains: q, mode: "insensitive" } },
            { ean: { contains: q, mode: "insensitive" } },
          ],
        }
      : {},
    take: 200,
    orderBy: { createdAt: "desc" },
  });

  // Lots de inventario de la tienda seleccionada
  const lots = await prisma.inventoryLot.findMany({
    where: { storeId },
    select: {
      id: true,
      productId: true,
      warehouseId: true,
      quantityAvailable: true,
      status: true,
      warehouse: { select: { id: true, code: true, name: true } },
    },
  });

  // Agrupar stock por producto y por warehouse
  const stockByProduct = new Map();
  for (const lot of lots) {
    const key = lot.productId;
    if (!stockByProduct.has(key)) stockByProduct.set(key, { total: 0, byWarehouse: {} });

    const entry = stockByProduct.get(key);
    const qty = Number(lot.quantityAvailable || 0);
    entry.total += qty;

    const whKey = lot.warehouseId;
    entry.byWarehouse[whKey] = (entry.byWarehouse[whKey] || 0) + qty;
    entry.warehouses = entry.warehouses || {};
    entry.warehouses[whKey] = lot.warehouse;
  }

  // Para "Disponible en ..." -> buscar stock en otras tiendas (mismo producto)
  const productIds = products.map((p) => p.id);
  const otherLots = await prisma.inventoryLot.findMany({
    where: {
      productId: { in: productIds },
      storeId: { not: storeId },
      quantityAvailable: { gt: 0 },
    },
    select: {
      productId: true,
      quantityAvailable: true,
      store: { select: { id: true, code: true, name: true } },
    },
  });

  const availableElsewhere = new Map(); // productId -> [{storeCode, storeName, qty}]
  for (const l of otherLots) {
    if (!availableElsewhere.has(l.productId)) availableElsewhere.set(l.productId, []);
    availableElsewhere.get(l.productId).push({
      storeId: l.store.id,
      storeCode: l.store.code,
      storeName: l.store.name,
      qty: Number(l.quantityAvailable || 0),
    });
  }

  res.json({
    items: products.map((p) => {
      const stock = stockByProduct.get(p.id) || { total: 0, byWarehouse: {}, warehouses: {} };

      return {
        id: p.id,
        name: p.name,
        brand: p.brand,
        model: p.model,
        ean: p.ean,
        imageUrl: withImages ? p.imageUrl || null : null,

        stockTotal: stock.total,
        stockByWarehouse: Object.entries(stock.byWarehouse).map(([warehouseId, qty]) => ({
          warehouseId,
          warehouseCode: stock.warehouses?.[warehouseId]?.code,
          warehouseName: stock.warehouses?.[warehouseId]?.name,
          qty,
        })),

        availableInOtherStores: availableElsewhere.get(p.id) || [],
      };
    }),
  });
});


// Inventory list (MVP)
app.get("/inventory", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const storeId = String(req.query.storeId || "");
    const withImages = String(req.query.withImages || "0") === "1";
    const q = String(req.query.q || "").trim();

    if (!storeId) {
      return res.status(400).json({ error: "Missing storeId" });
    }

    // Security: user must be member of store
    const membership = await prisma.userStoreMembership.findFirst({
      where: { userId, storeId },
      select: { id: true, roleKey: true },
    });

    if (!membership) {
      return res.status(403).json({ error: "No access to this store" });
    }

    // Fetch products (simple)
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
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    // MVP response: stock=0 (después lo calculamos con lots/movements)
    const items = products.map((p) => ({
      id: p.id,
      name: p.name ?? "",
      brand: p.brand ?? null,
      model: p.model ?? null,
      ean: p.ean ?? null,
      // si tu campo se llama distinto (imageUrl/image), luego lo alineamos
      imageUrl: withImages ? (p.imageUrl ?? p.image ?? null) : null,
      stock: 0,
      note: stockNote(0),
    }));

    return res.json({
      storeId,
      q: q || null,
      withImages,
      items,
    });
  } catch (err) {
    console.error("GET /inventory error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

function stockNote(stock) {
  if (stock > 0) return null;
  return "Sin stock (MVP). Luego mostraremos: Disponible en ...";
}













const PORT = 3001;
app.listen(PORT, () => {
  console.log(`🚀 API running on http://localhost:${PORT}`);
});