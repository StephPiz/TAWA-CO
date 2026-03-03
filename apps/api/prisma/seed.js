const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function upsertPermission(key, description) {
  return prisma.permission.upsert({
    where: { key },
    update: { description },
    create: { key, description },
  });
}

async function main() {
  const holding = await prisma.holdingCompany.upsert({
    where: { name: "TAWA Co" },
    update: {},
    create: { name: "TAWA Co" },
  });

  const store = await prisma.store.upsert({
    where: { holdingId_code: { holdingId: holding.id, code: "DEMARCA" } },
    update: {
      name: "DEMARCA",
      status: "active",
      description: "Store DEMARCA",
      baseCurrencyCode: "EUR",
      invoicePrefix: "DEM-2026",
    },
    create: {
      holdingId: holding.id,
      code: "DEMARCA",
      name: "DEMARCA",
      status: "active",
      description: "Store DEMARCA",
      baseCurrencyCode: "EUR",
      invoicePrefix: "DEM-2026",
    },
  });

  const currencies = [
    { code: "EUR", name: "Euro", symbol: "EUR" },
    { code: "USD", name: "US Dollar", symbol: "USD" },
    { code: "CNY", name: "Chinese Yuan", symbol: "CNY" },
    { code: "PEN", name: "Peruvian Sol", symbol: "PEN" },
    { code: "TRY", name: "Turkish Lira", symbol: "TRY" },
  ];

  for (const c of currencies) {
    await prisma.currency.upsert({
      where: { code: c.code },
      update: { name: c.name, symbol: c.symbol },
      create: c,
    });

    await prisma.storeCurrency.upsert({
      where: { storeId_currencyCode: { storeId: store.id, currencyCode: c.code } },
      update: { enabled: true },
      create: { storeId: store.id, currencyCode: c.code, enabled: true },
    });
  }

  await prisma.fxRate.upsert({
    where: {
      storeId_baseCurrencyCode_quoteCurrencyCode_rateDate: {
        storeId: store.id,
        baseCurrencyCode: "USD",
        quoteCurrencyCode: "EUR",
        rateDate: new Date("2026-01-01T00:00:00.000Z"),
      },
    },
    update: { rate: "0.92000000", source: "seed" },
    create: {
      storeId: store.id,
      baseCurrencyCode: "USD",
      quoteCurrencyCode: "EUR",
      rate: "0.92000000",
      rateDate: new Date("2026-01-01T00:00:00.000Z"),
      source: "seed",
    },
  });

  const warehouseES = await prisma.warehouse.upsert({
    where: { storeId_code: { storeId: store.id, code: "ES-MAD" } },
    update: {
      name: "Madrid Warehouse",
      country: "ES",
      status: "active",
      type: "own",
      isDefault: true,
    },
    create: {
      storeId: store.id,
      code: "ES-MAD",
      name: "Madrid Warehouse",
      country: "ES",
      status: "active",
      type: "own",
      isDefault: true,
    },
  });

  const warehouseIT = await prisma.warehouse.upsert({
    where: { storeId_code: { storeId: store.id, code: "IT-MIL" } },
    update: {
      name: "Milan Warehouse",
      country: "IT",
      status: "active",
      type: "external",
      isDefault: false,
    },
    create: {
      storeId: store.id,
      code: "IT-MIL",
      name: "Milan Warehouse",
      country: "IT",
      status: "active",
      type: "external",
      isDefault: false,
    },
  });

  const locationA1 = await prisma.warehouseLocation.upsert({
    where: { warehouseId_code: { warehouseId: warehouseES.id, code: "A1" } },
    update: { name: "Estanteria A1", isActive: true },
    create: { warehouseId: warehouseES.id, code: "A1", name: "Estanteria A1", isActive: true },
  });

  await prisma.warehouseLocation.upsert({
    where: { warehouseId_code: { warehouseId: warehouseIT.id, code: "R1" } },
    update: { name: "Rack R1", isActive: true },
    create: { warehouseId: warehouseIT.id, code: "R1", name: "Rack R1", isActive: true },
  });

  const channelShopify = await prisma.salesChannel.upsert({
    where: { storeId_code: { storeId: store.id, code: "SHOPIFY-ES" } },
    update: {
      name: "Shopify ES",
      type: "shopify",
      status: "active",
      feePercent: "2.9000",
      countryCode: "ES",
      currencyCode: "EUR",
    },
    create: {
      storeId: store.id,
      code: "SHOPIFY-ES",
      name: "Shopify ES",
      type: "shopify",
      status: "active",
      feePercent: "2.9000",
      payoutTerms: "15 days post-delivery",
      countryCode: "ES",
      currencyCode: "EUR",
    },
  });

  const channelIdealoDE = await prisma.salesChannel.upsert({
    where: { storeId_code: { storeId: store.id, code: "IDEALO-DE" } },
    update: {
      name: "Idealo DE",
      type: "idealo",
      status: "active",
      feePercent: "7.5000",
      countryCode: "DE",
      currencyCode: "EUR",
    },
    create: {
      storeId: store.id,
      code: "IDEALO-DE",
      name: "Idealo DE",
      type: "idealo",
      status: "active",
      feePercent: "7.5000",
      payoutTerms: "20 business days",
      countryCode: "DE",
      currencyCode: "EUR",
    },
  });

  await prisma.storeIntegration.upsert({
    where: { storeId_provider: { storeId: store.id, provider: "shopify" } },
    update: {
      isActive: true,
      webhookSecret: "shopify-dev-secret",
      configJson: { note: "Dev webhook config for phase 7" },
    },
    create: {
      storeId: store.id,
      provider: "shopify",
      isActive: true,
      webhookSecret: "shopify-dev-secret",
      configJson: { note: "Dev webhook config for phase 7" },
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

  const warehouseUser = await prisma.user.upsert({
    where: { email: "warehouse@demarca.local" },
    update: {
      passwordHash,
      fullName: "Warehouse DEMARCA",
      preferredLocale: "es",
      isActive: true,
    },
    create: {
      email: "warehouse@demarca.local",
      passwordHash,
      fullName: "Warehouse DEMARCA",
      preferredLocale: "es",
      isActive: true,
    },
  });

  await prisma.userStoreMembership.upsert({
    where: { userId_storeId: { userId: warehouseUser.id, storeId: store.id } },
    update: { roleKey: "warehouse" },
    create: { userId: warehouseUser.id, storeId: store.id, roleKey: "warehouse" },
  });

  const adminKat = await prisma.user.upsert({
    where: { email: "admin_kat@demarca.local" },
    update: {
      passwordHash,
      fullName: "Admin KAT",
      preferredLocale: "es",
      isActive: true,
    },
    create: {
      email: "admin_kat@demarca.local",
      passwordHash,
      fullName: "Admin KAT",
      preferredLocale: "es",
      isActive: true,
    },
  });

  await prisma.userStoreMembership.upsert({
    where: { userId_storeId: { userId: adminKat.id, storeId: store.id } },
    update: { roleKey: "admin_kat" },
    create: { userId: adminKat.id, storeId: store.id, roleKey: "admin_kat" },
  });

  const perms = [
    ["inventory.read", "Read inventory"],
    ["inventory.write", "Move stock"],
    ["finance.read", "Read financial data"],
    ["analytics.read", "Read analytics data (non-financial allowed)"],
    ["suppliers.read", "Read supplier data"],
    ["products.write", "Create/update products"],
    ["orders.write", "Create/update orders"],
    ["purchases.write", "Create/update purchases and suppliers"],
    ["tasks.write", "Create/update team tasks"],
    ["payouts.write", "Create payouts and reconciliation"],
    ["invoices.write", "Create invoices"],
  ];

  const permissionByKey = {};
  for (const [key, description] of perms) {
    const p = await upsertPermission(key, description);
    permissionByKey[key] = p;
  }

  await prisma.userPermission.upsert({
    where: {
      userId_storeId_permissionId: {
        userId: admin.id,
        storeId: store.id,
        permissionId: permissionByKey["finance.read"].id,
      },
    },
    update: { granted: true },
    create: {
      userId: admin.id,
      storeId: store.id,
      permissionId: permissionByKey["finance.read"].id,
      granted: true,
    },
  });

  await prisma.userPermission.upsert({
    where: {
      userId_storeId_permissionId: {
        userId: adminKat.id,
        storeId: store.id,
        permissionId: permissionByKey["analytics.read"].id,
      },
    },
    update: { granted: true },
    create: {
      userId: adminKat.id,
      storeId: store.id,
      permissionId: permissionByKey["analytics.read"].id,
      granted: true,
    },
  });

  await prisma.userPermission.upsert({
    where: {
      userId_storeId_permissionId: {
        userId: admin.id,
        storeId: store.id,
        permissionId: permissionByKey["analytics.read"].id,
      },
    },
    update: { granted: true },
    create: {
      userId: admin.id,
      storeId: store.id,
      permissionId: permissionByKey["analytics.read"].id,
      granted: true,
    },
  });

  const supplier = await prisma.supplier.upsert({
    where: { storeId_code: { storeId: store.id, code: "SUP-TR-001" } },
    update: {
      name: "Turkiye Watches Hub",
      contactName: "Mert A.",
      contactEmail: "ops@turkiyehub.example",
      city: "Istanbul",
      country: "TR",
      defaultCurrencyCode: "TRY",
      paymentMethod: "Wire",
      catalogUrl: "https://suppliers.example/turkiye-hub",
      isActive: true,
    },
    create: {
      storeId: store.id,
      code: "SUP-TR-001",
      name: "Turkiye Watches Hub",
      contactName: "Mert A.",
      contactEmail: "ops@turkiyehub.example",
      city: "Istanbul",
      country: "TR",
      defaultCurrencyCode: "TRY",
      paymentMethod: "Wire",
      catalogUrl: "https://suppliers.example/turkiye-hub",
      isActive: true,
    },
  });

  const product = await prisma.product.upsert({
    where: { storeId_ean: { storeId: store.id, ean: "8435601200001" } },
    update: {
      type: "watch",
      brand: "Armani",
      model: "AR2434",
      modelRef: "AR2434",
      category: "watch",
      name: "Armani AR2434",
      status: "active",
      isInternalEan: false,
    },
    create: {
      storeId: store.id,
      ean: "8435601200001",
      sku: "ARM-AR2434",
      type: "watch",
      brand: "Armani",
      model: "AR2434",
      modelRef: "AR2434",
      category: "watch",
      name: "Armani AR2434",
      status: "active",
      isInternalEan: false,
      internalDescription: "Reloj para canal premium",
    },
  });

  await prisma.productImage.upsert({
    where: { id: "seed-image-armani-main" },
    update: {
      productId: product.id,
      imageUrl: "https://picsum.photos/seed/armani2434/600/600",
      isPrimary: true,
      sortOrder: 0,
    },
    create: {
      id: "seed-image-armani-main",
      productId: product.id,
      imageUrl: "https://picsum.photos/seed/armani2434/600/600",
      isPrimary: true,
      sortOrder: 0,
    },
  });

  await prisma.channelProductLink.upsert({
    where: { productId_salesChannelId: { productId: product.id, salesChannelId: channelShopify.id } },
    update: {
      productUrl: "https://shopify.example/products/ar2434",
      externalProductId: "shopify-ar2434",
      status: "active",
    },
    create: {
      productId: product.id,
      salesChannelId: channelShopify.id,
      productUrl: "https://shopify.example/products/ar2434",
      externalProductId: "shopify-ar2434",
      status: "active",
    },
  });

  await prisma.productChannelPrice.create({
    data: {
      productId: product.id,
      salesChannelId: channelShopify.id,
      priceAmount: "199.00",
      currencyCode: "EUR",
      isActive: true,
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      effectiveTo: null,
    },
  }).catch(() => {});

  await prisma.channelProductText.upsert({
    where: {
      productId_salesChannelId_locale: {
        productId: product.id,
        salesChannelId: channelShopify.id,
        locale: "es",
      },
    },
    update: { title: "Armani AR2434 - Shopify", description: "Texto canal ES" },
    create: {
      productId: product.id,
      salesChannelId: channelShopify.id,
      locale: "es",
      title: "Armani AR2434 - Shopify",
      description: "Texto canal ES",
    },
  });

  await prisma.eanAlias.upsert({
    where: { storeId_ean: { storeId: store.id, ean: "INT-DEM-000001" } },
    update: { productId: product.id, source: "manual" },
    create: {
      storeId: store.id,
      productId: product.id,
      ean: "INT-DEM-000001",
      source: "manual",
      note: "Internal scanning alias",
    },
  });

  await prisma.productChannel.upsert({
    where: { productId_channelId: { productId: product.id, channelId: channelShopify.id } },
    update: {
      listingStatus: "active",
      publicName: "Armani AR2434 - Shopify",
      listingUrl: "https://shopify.example/products/ar2434",
      priceOriginal: "199.00",
      priceCurrencyCode: "EUR",
      priceFxToEur: "1.000000",
      priceEurFrozen: "199.00",
    },
    create: {
      productId: product.id,
      channelId: channelShopify.id,
      listingStatus: "active",
      publicName: "Armani AR2434 - Shopify",
      listingUrl: "https://shopify.example/products/ar2434",
      priceOriginal: "199.00",
      priceCurrencyCode: "EUR",
      priceFxToEur: "1.000000",
      priceEurFrozen: "199.00",
    },
  });

  await prisma.productChannel.upsert({
    where: { productId_channelId: { productId: product.id, channelId: channelIdealoDE.id } },
    update: {
      listingStatus: "active",
      publicName: "Armani AR2434 - Idealo DE",
      listingUrl: "https://idealo.example/de/ar2434",
      priceOriginal: "209.00",
      priceCurrencyCode: "EUR",
      priceFxToEur: "1.000000",
      priceEurFrozen: "209.00",
    },
    create: {
      productId: product.id,
      channelId: channelIdealoDE.id,
      listingStatus: "active",
      publicName: "Armani AR2434 - Idealo DE",
      listingUrl: "https://idealo.example/de/ar2434",
      priceOriginal: "209.00",
      priceCurrencyCode: "EUR",
      priceFxToEur: "1.000000",
      priceEurFrozen: "209.00",
    },
  });

  const existingBaseText = await prisma.productText.findFirst({
    where: {
      productId: product.id,
      locale: "es",
      channelId: null,
    },
    select: { id: true },
  });
  if (existingBaseText) {
    await prisma.productText.update({
      where: { id: existingBaseText.id },
      data: {
        publicName: "Reloj Armani AR2434",
        description: "Descripcion interna base en espanol",
      },
    });
  } else {
    await prisma.productText.create({
      data: {
        storeId: store.id,
        productId: product.id,
        locale: "es",
        channelId: null,
        publicName: "Reloj Armani AR2434",
        description: "Descripcion interna base en espanol",
      },
    });
  }

  const lot = await prisma.inventoryLot.upsert({
    where: { id: "seed-lot-armani-es-001" },
    update: {
      quantityReceived: 10,
      quantityAvailable: 10,
      unitCostOriginal: "120.0000",
      costCurrencyCode: "USD",
      fxToEur: "0.920000",
      unitCostEurFrozen: "110.4000",
      status: "available",
    },
    create: {
      id: "seed-lot-armani-es-001",
      storeId: store.id,
      productId: product.id,
      warehouseId: warehouseES.id,
      locationId: locationA1.id,
      lotCode: "LOT-2026-ES-0001",
      sourceType: "manual_init",
      status: "available",
      supplierName: "Supplier Demo",
      purchasedAt: new Date("2026-01-10T00:00:00.000Z"),
      receivedAt: new Date("2026-01-18T00:00:00.000Z"),
      quantityReceived: 10,
      quantityAvailable: 10,
      unitCostOriginal: "120.0000",
      costCurrencyCode: "USD",
      fxToEur: "0.920000",
      unitCostEurFrozen: "110.4000",
      note: "Seed initial lot",
    },
  });

  await prisma.inventoryMovement.create({
    data: {
      storeId: store.id,
      productId: product.id,
      lotId: lot.id,
      warehouseId: warehouseES.id,
      movementType: "lot_create",
      quantity: 10,
      unitCostEurFrozen: "110.4000",
      referenceType: "seed",
      referenceId: "seed-lot-armani-es-001",
      reason: "Initial inventory seed",
      createdByUserId: admin.id,
    },
  });

  const customer = await prisma.customer.upsert({
    where: { id: "seed-customer-de-001" },
    update: {
      storeId: store.id,
      email: "cliente.demo@example.com",
      fullName: "Cliente Demo DE",
      country: "DE",
      city: "Berlin",
    },
    create: {
      id: "seed-customer-de-001",
      storeId: store.id,
      email: "cliente.demo@example.com",
      fullName: "Cliente Demo DE",
      country: "DE",
      city: "Berlin",
    },
  });

  const order = await prisma.salesOrder.upsert({
    where: { storeId_orderNumber: { storeId: store.id, orderNumber: "SO-1168" } },
    update: {
      platform: "Shopify",
      sourceChannelId: channelIdealoDE.id,
      sourceLabel: "Idealo DE",
      customerId: customer.id,
      customerCountryCode: "DE",
      currencyCode: "EUR",
      grossAmountOriginal: "209.00",
      grossFxToEur: "1.000000",
      grossAmountEurFrozen: "209.00",
      feesEur: "8.50",
      cpaEur: "4.20",
      shippingCostEur: "5.90",
      packagingCostEur: "1.20",
      returnCostEur: "0.00",
      cogsEur: "110.40",
      netProfitEur: "78.80",
      status: "delivered",
      paymentStatus: "paid",
      orderedAt: new Date("2026-02-15T12:00:00.000Z"),
    },
    create: {
      storeId: store.id,
      orderNumber: "SO-1168",
      platform: "Shopify",
      sourceChannelId: channelIdealoDE.id,
      sourceLabel: "Idealo DE",
      customerId: customer.id,
      customerCountryCode: "DE",
      currencyCode: "EUR",
      grossAmountOriginal: "209.00",
      grossFxToEur: "1.000000",
      grossAmountEurFrozen: "209.00",
      feesEur: "8.50",
      cpaEur: "4.20",
      shippingCostEur: "5.90",
      packagingCostEur: "1.20",
      returnCostEur: "0.00",
      cogsEur: "110.40",
      netProfitEur: "78.80",
      status: "delivered",
      paymentStatus: "paid",
      orderedAt: new Date("2026-02-15T12:00:00.000Z"),
    },
  });

  const orderItem = await prisma.salesOrderItem.upsert({
    where: { id: "seed-order-item-1168-1" },
    update: {
      storeId: store.id,
      orderId: order.id,
      productId: product.id,
      productEan: product.ean,
      title: "Armani AR2434",
      quantity: 1,
      unitPriceOriginal: "209.00",
      fxToEur: "1.000000",
      unitPriceEurFrozen: "209.00",
      revenueEurFrozen: "209.00",
      cogsEurFrozen: "110.40",
    },
    create: {
      id: "seed-order-item-1168-1",
      storeId: store.id,
      orderId: order.id,
      productId: product.id,
      productEan: product.ean,
      title: "Armani AR2434",
      quantity: 1,
      unitPriceOriginal: "209.00",
      fxToEur: "1.000000",
      unitPriceEurFrozen: "209.00",
      revenueEurFrozen: "209.00",
      cogsEurFrozen: "110.40",
    },
  });

  await prisma.backorderLine.upsert({
    where: { id: "seed-backorder-1168-1" },
    update: {
      storeId: store.id,
      orderId: order.id,
      orderItemId: orderItem.id,
      productId: product.id,
      requestedQty: 2,
      fulfilledQty: 1,
      missingQty: 1,
      status: "open",
      note: "Seed backorder sample",
    },
    create: {
      id: "seed-backorder-1168-1",
      storeId: store.id,
      orderId: order.id,
      orderItemId: orderItem.id,
      productId: product.id,
      requestedQty: 2,
      fulfilledQty: 1,
      missingQty: 1,
      status: "open",
      note: "Seed backorder sample",
    },
  });

  const payout = await prisma.payout.upsert({
    where: { storeId_payoutRef: { storeId: store.id, payoutRef: "PAY-2026-02-IDEALO-01" } },
    update: {
      channelId: channelIdealoDE.id,
      payoutDate: new Date("2026-03-01T00:00:00.000Z"),
      currencyCode: "EUR",
      amountOriginal: "198.00",
      fxToEur: "1.000000",
      amountEurFrozen: "198.00",
      feesEur: "8.50",
      adjustmentsEur: "-2.50",
      note: "Payout monthly Idealo DE",
    },
    create: {
      storeId: store.id,
      channelId: channelIdealoDE.id,
      payoutRef: "PAY-2026-02-IDEALO-01",
      payoutDate: new Date("2026-03-01T00:00:00.000Z"),
      currencyCode: "EUR",
      amountOriginal: "198.00",
      fxToEur: "1.000000",
      amountEurFrozen: "198.00",
      feesEur: "8.50",
      adjustmentsEur: "-2.50",
      note: "Payout monthly Idealo DE",
    },
  });

  await prisma.payoutOrderMatch.upsert({
    where: { payoutId_orderId: { payoutId: payout.id, orderId: order.id } },
    update: { storeId: store.id, amountEur: "198.00" },
    create: {
      storeId: store.id,
      payoutId: payout.id,
      orderId: order.id,
      amountEur: "198.00",
    },
  });

  await prisma.invoice.upsert({
    where: { orderId: order.id },
    update: {
      storeId: store.id,
      invoiceNumber: "DEM-2026-000001",
      status: "issued",
      issuedAt: new Date("2026-02-16T00:00:00.000Z"),
      dueAt: null,
      currencyCode: "EUR",
      subtotalEur: "209.00",
      taxEur: "0.00",
      totalEur: "209.00",
      billingName: customer.fullName,
      billingAddress: "Berlin",
      billingCountry: "DE",
      notes: "Seed invoice",
    },
    create: {
      storeId: store.id,
      orderId: order.id,
      invoiceNumber: "DEM-2026-000001",
      status: "issued",
      issuedAt: new Date("2026-02-16T00:00:00.000Z"),
      dueAt: null,
      currencyCode: "EUR",
      subtotalEur: "209.00",
      taxEur: "0.00",
      totalEur: "209.00",
      billingName: customer.fullName,
      billingAddress: "Berlin",
      billingCountry: "DE",
      notes: "Seed invoice",
    },
  });

  await prisma.returnCase.upsert({
    where: { id: "seed-return-1168-1" },
    update: {
      storeId: store.id,
      orderId: order.id,
      productId: product.id,
      trackingCode: "RET-TRACK-1168",
      reason: "Cliente cambio de opinion",
      labelPayer: "store",
      conditionState: "opened",
      packagingRecovered: true,
      decision: "restock",
      status: "processed",
      quantity: 1,
      returnCostEur: "4.50",
      warehouseId: warehouseES.id,
      processedByUserId: admin.id,
      processedAt: new Date("2026-03-02T00:00:00.000Z"),
    },
    create: {
      id: "seed-return-1168-1",
      storeId: store.id,
      orderId: order.id,
      productId: product.id,
      trackingCode: "RET-TRACK-1168",
      reason: "Cliente cambio de opinion",
      labelPayer: "store",
      conditionState: "opened",
      packagingRecovered: true,
      decision: "restock",
      status: "processed",
      quantity: 1,
      returnCostEur: "4.50",
      warehouseId: warehouseES.id,
      processedByUserId: admin.id,
      processedAt: new Date("2026-03-02T00:00:00.000Z"),
    },
  });

  const purchase = await prisma.purchaseOrder.upsert({
    where: { storeId_poNumber: { storeId: store.id, poNumber: "PO-2026-0001" } },
    update: {
      supplierId: supplier.id,
      status: "tracking_received",
      orderedAt: new Date("2026-03-01T10:00:00.000Z"),
      expectedAt: new Date("2026-03-12T10:00:00.000Z"),
      trackingCode: "TRK-PO-2026-0001",
      trackingUrl: "https://track.example/PO-2026-0001",
      totalAmountEur: "110.40",
      note: "Seed PO for Fase 3",
      createdByUserId: admin.id,
    },
    create: {
      storeId: store.id,
      supplierId: supplier.id,
      poNumber: "PO-2026-0001",
      status: "tracking_received",
      orderedAt: new Date("2026-03-01T10:00:00.000Z"),
      expectedAt: new Date("2026-03-12T10:00:00.000Z"),
      trackingCode: "TRK-PO-2026-0001",
      trackingUrl: "https://track.example/PO-2026-0001",
      totalAmountEur: "110.40",
      note: "Seed PO for Fase 3",
      createdByUserId: admin.id,
    },
  });

  await prisma.purchaseOrderItem.upsert({
    where: { id: "seed-po-item-0001-1" },
    update: {
      storeId: store.id,
      purchaseOrderId: purchase.id,
      productId: product.id,
      title: "Armani AR2434",
      ean: product.ean,
      quantityOrdered: 1,
      quantityReceived: 0,
      unitCostOriginal: "1200.00",
      currencyCode: "TRY",
      fxToEur: "0.092000",
      unitCostEurFrozen: "110.4000",
      totalCostEur: "110.40",
    },
    create: {
      id: "seed-po-item-0001-1",
      storeId: store.id,
      purchaseOrderId: purchase.id,
      productId: product.id,
      title: "Armani AR2434",
      ean: product.ean,
      quantityOrdered: 1,
      quantityReceived: 0,
      unitCostOriginal: "1200.00",
      currencyCode: "TRY",
      fxToEur: "0.092000",
      unitCostEurFrozen: "110.4000",
      totalCostEur: "110.40",
    },
  });

  await prisma.purchaseOrderPayment.upsert({
    where: { id: "seed-po-payment-0001-1" },
    update: {
      storeId: store.id,
      purchaseOrderId: purchase.id,
      paidAt: new Date("2026-03-02T08:00:00.000Z"),
      currencyCode: "USD",
      amountOriginal: "118.00",
      fxToEur: "0.935000",
      amountEurFrozen: "110.33",
      note: "Advance payment",
      createdByUserId: admin.id,
    },
    create: {
      id: "seed-po-payment-0001-1",
      storeId: store.id,
      purchaseOrderId: purchase.id,
      paidAt: new Date("2026-03-02T08:00:00.000Z"),
      currencyCode: "USD",
      amountOriginal: "118.00",
      fxToEur: "0.935000",
      amountEurFrozen: "110.33",
      note: "Advance payment",
      createdByUserId: admin.id,
    },
  });

  const shipment3pl = await prisma.threePlShipment.upsert({
    where: { storeId_referenceCode: { storeId: store.id, referenceCode: "3PL-2026-0001" } },
    update: {
      purchaseOrderId: purchase.id,
      providerName: "GlobalTransit 3PL",
      note: "TR -> ES route",
      createdByUserId: admin.id,
    },
    create: {
      storeId: store.id,
      purchaseOrderId: purchase.id,
      providerName: "GlobalTransit 3PL",
      referenceCode: "3PL-2026-0001",
      note: "TR -> ES route",
      createdByUserId: admin.id,
    },
  });

  await prisma.threePlLeg.upsert({
    where: { shipmentId_legOrder: { shipmentId: shipment3pl.id, legOrder: 1 } },
    update: {
      originLabel: "Istanbul Supplier",
      destinationLabel: "3PL Madrid",
      trackingCode: "LEG1-TR-ES-0001",
      trackingUrl: "https://track.example/LEG1-TR-ES-0001",
      costCurrencyCode: "EUR",
      costOriginal: "26.00",
      fxToEur: "1.000000",
      costEurFrozen: "26.00",
      status: "in_transit",
    },
    create: {
      shipmentId: shipment3pl.id,
      legOrder: 1,
      originLabel: "Istanbul Supplier",
      destinationLabel: "3PL Madrid",
      trackingCode: "LEG1-TR-ES-0001",
      trackingUrl: "https://track.example/LEG1-TR-ES-0001",
      costCurrencyCode: "EUR",
      costOriginal: "26.00",
      fxToEur: "1.000000",
      costEurFrozen: "26.00",
      status: "in_transit",
    },
  });

  await prisma.teamTask.upsert({
    where: { id: "seed-task-warehouse-001" },
    update: {
      storeId: store.id,
      title: "Recibir PO-2026-0001 en almacén ES",
      description: "Verificar cantidades y confirmar lotes por línea",
      status: "in_progress",
      priority: "high",
      dueAt: new Date("2026-03-05T12:00:00.000Z"),
      linkedEntityType: "purchase_order",
      linkedEntityId: purchase.id,
      assignedToUserId: warehouseUser.id,
      createdByUserId: admin.id,
      closedAt: null,
    },
    create: {
      id: "seed-task-warehouse-001",
      storeId: store.id,
      title: "Recibir PO-2026-0001 en almacén ES",
      description: "Verificar cantidades y confirmar lotes por línea",
      status: "in_progress",
      priority: "high",
      dueAt: new Date("2026-03-05T12:00:00.000Z"),
      linkedEntityType: "purchase_order",
      linkedEntityId: purchase.id,
      assignedToUserId: warehouseUser.id,
      createdByUserId: admin.id,
    },
  });

  await prisma.supportTicket.upsert({
    where: { id: "seed-support-ticket-001" },
    update: {
      storeId: store.id,
      customerId: customer.id,
      orderId: order.id,
      title: "Retraso en entrega pedido SO-1168",
      description: "Cliente reporta retraso y solicita estado del envio.",
      channel: "email",
      reason: "late_delivery",
      status: "open",
      priority: "high",
      dueAt: new Date("2026-03-04T12:00:00.000Z"),
      slaFirstResponseDueAt: new Date("2026-03-02T14:00:00.000Z"),
      slaResolutionDueAt: new Date("2026-03-04T10:00:00.000Z"),
      slaBreached: false,
      slaBreachedAt: null,
      slaBreachNotifiedAt: null,
      assignedToUserId: admin.id,
      createdByUserId: admin.id,
      resolutionNote: null,
      firstResponseAt: null,
      resolvedAt: null,
      closedAt: null,
    },
    create: {
      id: "seed-support-ticket-001",
      storeId: store.id,
      customerId: customer.id,
      orderId: order.id,
      title: "Retraso en entrega pedido SO-1168",
      description: "Cliente reporta retraso y solicita estado del envio.",
      channel: "email",
      reason: "late_delivery",
      status: "open",
      priority: "high",
      dueAt: new Date("2026-03-04T12:00:00.000Z"),
      slaFirstResponseDueAt: new Date("2026-03-02T14:00:00.000Z"),
      slaResolutionDueAt: new Date("2026-03-04T10:00:00.000Z"),
      slaBreached: false,
      slaBreachedAt: null,
      slaBreachNotifiedAt: null,
      assignedToUserId: admin.id,
      createdByUserId: admin.id,
    },
  });

  const chatWarehouse = await prisma.chatChannel.upsert({
    where: { storeId_code: { storeId: store.id, code: "almacen" } },
    update: { name: "#almacen", isActive: true },
    create: {
      storeId: store.id,
      code: "almacen",
      name: "#almacen",
      type: "public",
      isActive: true,
      createdByUserId: admin.id,
    },
  });

  await prisma.chatChannel.upsert({
    where: { storeId_code: { storeId: store.id, code: "compras" } },
    update: { name: "#compras", isActive: true },
    create: {
      storeId: store.id,
      code: "compras",
      name: "#compras",
      type: "public",
      isActive: true,
      createdByUserId: admin.id,
    },
  });

  await prisma.chatChannel.upsert({
    where: { storeId_code: { storeId: store.id, code: "devoluciones" } },
    update: { name: "#devoluciones", isActive: true },
    create: {
      storeId: store.id,
      code: "devoluciones",
      name: "#devoluciones",
      type: "public",
      isActive: true,
      createdByUserId: admin.id,
    },
  });

  await prisma.chatMessage.upsert({
    where: { id: "seed-chat-msg-001" },
    update: {
      storeId: store.id,
      channelId: chatWarehouse.id,
      userId: warehouseUser.id,
      body: "Recibi PO-2026-0001, pendiente validacion de calidad.",
      linkedEntityType: "purchase_order",
      linkedEntityId: purchase.id,
    },
    create: {
      id: "seed-chat-msg-001",
      storeId: store.id,
      channelId: chatWarehouse.id,
      userId: warehouseUser.id,
      body: "Recibi PO-2026-0001, pendiente validacion de calidad.",
      linkedEntityType: "purchase_order",
      linkedEntityId: purchase.id,
    },
  });

  await prisma.teamTask.upsert({
    where: { id: "seed-task-finance-001" },
    update: {
      storeId: store.id,
      title: "Registrar pago final proveedor",
      description: "Cerrar conciliación PO y validar landed cost",
      status: "open",
      priority: "medium",
      dueAt: new Date("2026-03-07T12:00:00.000Z"),
      linkedEntityType: "purchase_order",
      linkedEntityId: purchase.id,
      assignedToUserId: admin.id,
      createdByUserId: admin.id,
      closedAt: null,
    },
    create: {
      id: "seed-task-finance-001",
      storeId: store.id,
      title: "Registrar pago final proveedor",
      description: "Cerrar conciliación PO y validar landed cost",
      status: "open",
      priority: "medium",
      dueAt: new Date("2026-03-07T12:00:00.000Z"),
      linkedEntityType: "purchase_order",
      linkedEntityId: purchase.id,
      assignedToUserId: admin.id,
      createdByUserId: admin.id,
    },
  });

  await prisma.notification.upsert({
    where: { id: "seed-notification-001" },
    update: {
      storeId: store.id,
      userId: null,
      type: "purchase_received",
      severity: "info",
      title: "Recepcion PO-2026-0001 completada",
      body: "1 lote recibido en ES-MAD",
      linkedEntityType: "purchase_order",
      linkedEntityId: purchase.id,
      createdByUserId: warehouseUser.id,
      isRead: false,
      readAt: null,
    },
    create: {
      id: "seed-notification-001",
      storeId: store.id,
      userId: null,
      type: "purchase_received",
      severity: "info",
      title: "Recepcion PO-2026-0001 completada",
      body: "1 lote recibido en ES-MAD",
      linkedEntityType: "purchase_order",
      linkedEntityId: purchase.id,
      createdByUserId: warehouseUser.id,
      isRead: false,
      readAt: null,
    },
  });

  await prisma.supportTicketNote.upsert({
    where: { id: "seed-support-note-001" },
    update: {
      ticketId: "seed-support-ticket-001",
      userId: admin.id,
      body: "Contactado cliente por email. Esperando confirmación del transportista.",
    },
    create: {
      id: "seed-support-note-001",
      ticketId: "seed-support-ticket-001",
      userId: admin.id,
      body: "Contactado cliente por email. Esperando confirmación del transportista.",
    },
  });

  await prisma.notification.upsert({
    where: { id: "seed-notification-003" },
    update: {
      storeId: store.id,
      userId: admin.id,
      type: "system",
      severity: "warning",
      title: "Nuevo ticket de soporte abierto",
      body: "Ticket por retraso en entrega de SO-1168",
      linkedEntityType: "support_ticket",
      linkedEntityId: "seed-support-ticket-001",
      createdByUserId: admin.id,
      isRead: false,
      readAt: null,
    },
    create: {
      id: "seed-notification-003",
      storeId: store.id,
      userId: admin.id,
      type: "system",
      severity: "warning",
      title: "Nuevo ticket de soporte abierto",
      body: "Ticket por retraso en entrega de SO-1168",
      linkedEntityType: "support_ticket",
      linkedEntityId: "seed-support-ticket-001",
      createdByUserId: admin.id,
      isRead: false,
      readAt: null,
    },
  });

  await prisma.notification.upsert({
    where: { id: "seed-notification-002" },
    update: {
      storeId: store.id,
      userId: admin.id,
      type: "task_assigned",
      severity: "warning",
      title: "Nueva tarea asignada: Registrar pago final proveedor",
      body: "Cerrar conciliacion PO y validar landed cost",
      linkedEntityType: "team_task",
      linkedEntityId: "seed-task-finance-001",
      createdByUserId: admin.id,
      isRead: false,
      readAt: null,
    },
    create: {
      id: "seed-notification-002",
      storeId: store.id,
      userId: admin.id,
      type: "task_assigned",
      severity: "warning",
      title: "Nueva tarea asignada: Registrar pago final proveedor",
      body: "Cerrar conciliacion PO y validar landed cost",
      linkedEntityType: "team_task",
      linkedEntityId: "seed-task-finance-001",
      createdByUserId: admin.id,
      isRead: false,
      readAt: null,
    },
  });

  console.log("Seed OK");
  console.log("Holding:", holding.name);
  console.log("Store:", store.name);
  console.log("Admin:", admin.email, "password: Admin123!");
  console.log("Admin KAT:", adminKat.email, "password: Admin123!");
  console.log("Warehouse user:", warehouseUser.email, "password: Admin123!");
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
