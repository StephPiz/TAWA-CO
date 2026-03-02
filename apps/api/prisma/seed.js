const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const holding = await prisma.holdingCompany.upsert({
    where: { name: "TAWA Co" },
    update: {},
    create: { name: "TAWA Co" },
  });

  const store = await prisma.store.upsert({
    where: { holdingId_code: { holdingId: holding.id, code: "DEMARCA" } },
    update: { name: "DEMARCA", status: "active" },
    create: {
      holdingId: holding.id,
      code: "DEMARCA",
      name: "DEMARCA",
      status: "active",
    },
  });

  const passwordHash = await bcrypt.hash("Admin123!", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@demarca.local" },
    update: {
      passwordHash,
      fullName: "Admin DEMARCA",
      preferredLocale: "es",
      isActive: true,
    },
    create: {
      email: "admin@demarca.local",
      passwordHash,
      fullName: "Admin DEMARCA",
      preferredLocale: "es",
      isActive: true,
    },
  });

  await prisma.userStoreMembership.upsert({
    where: { userId_storeId: { userId: admin.id, storeId: store.id } },
    update: { roleKey: "admin" },
    create: { userId: admin.id, storeId: store.id, roleKey: "admin" },
  });

  console.log("✅ Seed OK");
  console.log("Holding:", holding.name);
  console.log("Store:", store.name);
  console.log("Admin:", admin.email, "password: Admin123!");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });