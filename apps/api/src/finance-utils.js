const ORDER_STATUS_FLOW = {
  pending: new Set(["paid", "backorder", "cancelled"]),
  paid: new Set(["backorder", "packed", "cancelled", "returned"]),
  backorder: new Set(["paid", "packed", "cancelled"]),
  packed: new Set(["shipped", "cancelled", "returned"]),
  shipped: new Set(["delivered", "returned"]),
  delivered: new Set(["returned"]),
  returned: new Set([]),
  cancelled: new Set([]),
};

const PAYMENT_STATUS_FLOW = {
  unpaid: new Set(["partially_paid", "paid"]),
  partially_paid: new Set(["paid"]),
  paid: new Set([]),
};

function isPositiveNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

function isNonNegativeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0;
}

function parseDateInput(value) {
  if (!value) return null;
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) return d;
  const m = String(value).trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    const d2 = new Date(iso);
    if (!Number.isNaN(d2.getTime())) return d2;
  }
  return null;
}

function parseCurrencyCode(value) {
  const code = String(value || "")
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) return null;
  return code;
}

function isAllowedTransition(currentStatus, nextStatus, flowMap) {
  if (!currentStatus || !nextStatus) return false;
  if (currentStatus === nextStatus) return true;
  const allowedNext = flowMap[String(currentStatus)] || new Set();
  return allowedNext.has(String(nextStatus));
}

function pdfEscape(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function buildInvoicePdfBuffer({ invoice, storeName, orderNumber, lines, storeBrand, taxByCountry }) {
  const header = [
    `${storeBrand?.legalName || storeName || "Store"}`,
    `${storeBrand?.address || ""}`,
    `${storeBrand?.country || ""}`,
    `Invoice: ${invoice.invoiceNumber}`,
    `Issued : ${new Date(invoice.issuedAt).toISOString().slice(0, 10)}`,
    `Order  : ${orderNumber || "-"}`,
    `Bill to: ${invoice.billingName || "-"}`,
    `Billing Country: ${invoice.billingCountry || "-"}`,
    "",
    "Lines:",
    "Desc                           Qty    Unit      Tax%   LineTotal",
    "---------------------------------------------------------------",
  ];

  const lineRows =
    lines && lines.length
      ? lines.map((l) => {
          const desc = String(l.description || "").slice(0, 30).padEnd(30, " ");
          const qty = Number(l.quantity || 1).toFixed(2).padStart(6, " ");
          const unit = Number(l.unitPriceEur || 0).toFixed(2).padStart(8, " ");
          const tax = Number(l.taxPercent || 0).toFixed(2).padStart(6, " ");
          const total = Number(l.lineTotalEur || 0).toFixed(2).padStart(10, " ");
          return `${desc} ${qty} ${unit} ${tax} ${total}`;
        })
      : ["(no lines)"];

  const taxLines =
    taxByCountry && Object.keys(taxByCountry).length
      ? [
          "",
          "Tax by country:",
          ...Object.entries(taxByCountry).map(
            ([country, totals]) =>
              `${country.padEnd(6, " ")}: base ${Number(totals.base || 0).toFixed(2)} | tax ${Number(totals.tax || 0).toFixed(2)}`
          ),
        ]
      : [];

  const footer = [
    "",
    `Subtotal (EUR): ${Number(invoice.subtotalEur || 0).toFixed(2)}`,
    `Tax (EUR): ${Number(invoice.taxEur || 0).toFixed(2)}`,
    `Total (EUR): ${Number(invoice.totalEur || 0).toFixed(2)}`,
  ];

  const allLines = [...header, ...lineRows, ...taxLines, ...footer];

  const textOps = ["BT", "/F1 12 Tf", "50 790 Td"];
  for (let i = 0; i < allLines.length; i += 1) {
    if (i === 0) textOps.push(`(${pdfEscape(allLines[i])}) Tj`);
    else textOps.push(`T* (${pdfEscape(allLines[i])}) Tj`);
  }
  textOps.push("ET");
  const streamContent = textOps.join("\n");
  const streamLength = Buffer.byteLength(streamContent, "utf8");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 5 0 R /Resources << /Font << /F1 4 0 R >> >> >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${streamLength} >>\nstream\n${streamContent}\nendstream`,
  ];

  let out = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(Buffer.byteLength(out, "utf8"));
    out += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(out, "utf8");
  out += `xref\n0 ${objects.length + 1}\n`;
  out += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i += 1) {
    out += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  out += `startxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(out, "utf8");
}

module.exports = {
  ORDER_STATUS_FLOW,
  PAYMENT_STATUS_FLOW,
  isPositiveNumber,
  isNonNegativeNumber,
  parseDateInput,
  parseCurrencyCode,
  isAllowedTransition,
  buildInvoicePdfBuffer,
};
