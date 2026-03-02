const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  // 1) Holding
  const holding = await prisma.holdingCompany.upsert({
    where: { name: "TAWA Co" },
    update: {},
    create: { name: "TAWA Co" },
  });

  // 2) Store DEMARCA
  const store = await prisma.store.upsert({
    where: { holdingId_code: { holdingId: holding.id, code: "DEMARCA" } },
    update: { name: "DEMARCA" },
    create: {
      holdingId: holding.id,
      code: "DEMARCA",
      name: "DEMARCA",
      status: "active",
    },
  });

  // 3) Admin user
  const passwordHash = await bcrypt.hash("Admin123!", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@demarca.local" },
    update: { passwordHash, fullName: "Admin DEMARCA", isActive: true },
    create: {
      email: "admin@demarca.local",
      passwordHash,
      fullName: "Admin DEMARCA",
      preferredLocale: "es",
      isActive: true,
    },
  });

  // 4) Membership (admin en DEMARCA)
  await prisma.userStoreMembership.upsert({
    where: { userId_storeId: { userId: admin.id, storeId: store.id } },
    update: { roleKey: "admin" },
    create: { userId: admin.id, storeId: store.id, roleKey: "admin" },
  });

  // 5) Warehouse ES
  const wh = await prisma.warehouse.upsert({
    where: { storeId_code: { storeId: store.id, code: "ES" } },
    update: { name: "Almacén España" },
    create: {
      storeId: store.id,
      code: "ES",
      name: "Almacén España",
      country: "ES",
      type: "own",
      status: "active",
    },
  });

  // 6) Location A1
  await prisma.warehouseLocation.upsert({
    where: { warehouseId_code: { warehouseId: wh.id, code: "A1" } },
    update: {},
    create: { warehouseId: wh.id, code: "A1", description: "Pasillo A - Estante 1" },
  });

  // 7) Sales Channel Shopify ES
  await prisma.salesChannel.upsert({
    where: { storeId_code: { storeId: store.id, code: "shopify_es" } },
    update: { name: "Shopify ES", status: "active" },
    create: {
      storeId: store.id,
      code: "shopify_es",
      name: "Shopify ES",
      type: "shopify",
      status: "active",
    },
  });

  console.log("✅ Seed completo:");
  console.log("Holding:", holding.name);
  console.log("Store:", store.name);
  console.log("Admin:", admin.email, "password: Admin123!");
  console.log("Warehouse:", wh.code, wh.name);
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
  