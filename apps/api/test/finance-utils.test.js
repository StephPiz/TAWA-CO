const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ORDER_STATUS_FLOW,
  PAYMENT_STATUS_FLOW,
  isPositiveNumber,
  isNonNegativeNumber,
  parseDateInput,
  parseCurrencyCode,
  isAllowedTransition,
  buildInvoicePdfBuffer,
} = require("../src/finance-utils");

test("isPositiveNumber works for valid and invalid values", () => {
  assert.equal(isPositiveNumber(1), true);
  assert.equal(isPositiveNumber("10.5"), true);
  assert.equal(isPositiveNumber(0), false);
  assert.equal(isPositiveNumber(-5), false);
  assert.equal(isPositiveNumber("abc"), false);
});

test("isNonNegativeNumber accepts zero and positives", () => {
  assert.equal(isNonNegativeNumber(0), true);
  assert.equal(isNonNegativeNumber("2.3"), true);
  assert.equal(isNonNegativeNumber(-1), false);
  assert.equal(isNonNegativeNumber("x"), false);
});

test("parseDateInput validates date format", () => {
  assert.ok(parseDateInput("2026-03-02"));
  assert.equal(parseDateInput("not-a-date"), null);
});

test("parseCurrencyCode validates ISO format", () => {
  assert.equal(parseCurrencyCode("eur"), "EUR");
  assert.equal(parseCurrencyCode("USD"), "USD");
  assert.equal(parseCurrencyCode("EURO"), null);
  assert.equal(parseCurrencyCode("12"), null);
});

test("isAllowedTransition enforces order flow", () => {
  assert.equal(isAllowedTransition("pending", "paid", ORDER_STATUS_FLOW), true);
  assert.equal(isAllowedTransition("pending", "backorder", ORDER_STATUS_FLOW), true);
  assert.equal(isAllowedTransition("backorder", "packed", ORDER_STATUS_FLOW), true);
  assert.equal(isAllowedTransition("paid", "pending", ORDER_STATUS_FLOW), false);
  assert.equal(isAllowedTransition("delivered", "returned", ORDER_STATUS_FLOW), true);
  assert.equal(isAllowedTransition("cancelled", "paid", ORDER_STATUS_FLOW), false);
});

test("isAllowedTransition enforces payment flow", () => {
  assert.equal(isAllowedTransition("unpaid", "partially_paid", PAYMENT_STATUS_FLOW), true);
  assert.equal(isAllowedTransition("partially_paid", "paid", PAYMENT_STATUS_FLOW), true);
  assert.equal(isAllowedTransition("paid", "unpaid", PAYMENT_STATUS_FLOW), false);
});

test("buildInvoicePdfBuffer returns a PDF buffer", () => {
  const buffer = buildInvoicePdfBuffer({
    invoice: {
      invoiceNumber: "DEM-2026-000001",
      issuedAt: new Date("2026-03-02T00:00:00.000Z"),
      billingName: "Cliente Demo",
      billingCountry: "DE",
      subtotalEur: "100.00",
      taxEur: "21.00",
      totalEur: "121.00",
    },
    storeName: "DEMARCA",
    orderNumber: "SO-1001",
  });

  const asText = buffer.toString("utf8");
  assert.ok(asText.startsWith("%PDF-1.4"));
  assert.ok(asText.includes("Invoice DEM-2026-000001"));
  assert.ok(asText.includes("%%EOF"));
});
