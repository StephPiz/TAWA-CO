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

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`🚀 API running on http://localhost:${PORT}`);
});