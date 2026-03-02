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
  return Number.isNaN(d.getTime()) ? null : d;
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

function buildInvoicePdfBuffer({ invoice, storeName, orderNumber }) {
  const lines = [
    `Invoice ${invoice.invoiceNumber}`,
    `Store: ${storeName || "-"}`,
    `Order: ${orderNumber || "-"}`,
    `Issued: ${new Date(invoice.issuedAt).toISOString().slice(0, 10)}`,
    `Billing Name: ${invoice.billingName || "-"}`,
    `Billing Country: ${invoice.billingCountry || "-"}`,
    `Subtotal (EUR): ${Number(invoice.subtotalEur || 0).toFixed(2)}`,
    `Tax (EUR): ${Number(invoice.taxEur || 0).toFixed(2)}`,
    `Total (EUR): ${Number(invoice.totalEur || 0).toFixed(2)}`,
  ];

  const textOps = ["BT", "/F1 12 Tf", "50 790 Td"];
  for (let i = 0; i < lines.length; i += 1) {
    if (i === 0) textOps.push(`(${pdfEscape(lines[i])}) Tj`);
    else textOps.push(`T* (${pdfEscape(lines[i])}) Tj`);
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
