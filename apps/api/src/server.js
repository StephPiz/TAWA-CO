const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
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

function normalizeRoleKey(roleKey) {
  return String(roleKey || "").trim().toLowerCase();
}

function roleIn(roleKey, allowed) {
  return allowed.includes(normalizeRoleKey(roleKey));
}

function getRoleCapabilities(roleKey) {
  const role = normalizeRoleKey(roleKey);
  const adminFull = ["admin", "admin_ste", "admin_ale", "owner"].includes(role);
  const adminOps = adminFull || ["admin_kat", "warehouse", "ops"].includes(role);

  return {
    inventoryRead: true,
    inventoryWrite: adminOps,
    catalogWrite: adminFull || ["admin_kat", "ops"].includes(role),
    ordersWrite: adminOps,
    purchasesWrite: adminFull,
    payoutsWrite: adminFull,
    invoicesWrite: adminFull,
    returnsWrite: adminOps,
    analyticsRead: adminFull,
    financeRead: adminFull,
    suppliersRead: adminFull,
    tasksWrite: adminOps,
    customersRead: adminFull || ["ops", "marketing"].includes(role),
    supportWrite: adminOps,
    chatWrite: adminOps,
    settingsWrite: adminFull,
  };
}

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
  const state = await getSensitiveAccessState(userId, storeId, roleKey, { logOnBlock: false });
  return state.allowed;
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
  if (getRoleCapabilities(roleKey).catalogWrite) return true;
  return hasPermission(userId, storeId, "products.write");
}

async function canManageOrders(userId, storeId, roleKey) {
  if (getRoleCapabilities(roleKey).ordersWrite) return true;
  return hasPermission(userId, storeId, "orders.write");
}

async function canManagePayouts(userId, storeId, roleKey) {
  if (getRoleCapabilities(roleKey).payoutsWrite) return true;
  return hasPermission(userId, storeId, "payouts.write");
}

async function canManageInvoices(userId, storeId, roleKey) {
  if (getRoleCapabilities(roleKey).invoicesWrite) return true;
  return hasPermission(userId, storeId, "invoices.write");
}

async function canManageReturns(userId, storeId, roleKey) {
  if (getRoleCapabilities(roleKey).returnsWrite) return true;
  return hasPermission(userId, storeId, "inventory.write");
}

async function canManagePurchases(userId, storeId, roleKey) {
  if (getRoleCapabilities(roleKey).purchasesWrite) return true;
  return hasPermission(userId, storeId, "purchases.write");
}

async function canManageTasks(userId, storeId, roleKey) {
  if (getRoleCapabilities(roleKey).tasksWrite) return true;
  return hasPermission(userId, storeId, "tasks.write");
}

async function canReadCustomers(userId, storeId, roleKey) {
  if (getRoleCapabilities(roleKey).customersRead) return true;
  const [ordersWrite, tasksWrite] = await Promise.all([
    hasPermission(userId, storeId, "orders.write"),
    hasPermission(userId, storeId, "tasks.write"),
  ]);
  return Boolean(ordersWrite || tasksWrite);
}

async function canManageSupport(userId, storeId, roleKey) {
  if (getRoleCapabilities(roleKey).supportWrite) return true;
  return hasPermission(userId, storeId, "tasks.write");
}

async function canReadAnalytics(userId, storeId, roleKey) {
  if (getRoleCapabilities(roleKey).analyticsRead) return true;
  return hasPermission(userId, storeId, "analytics.read");
}

async function canUseChat(userId, storeId, roleKey) {
  if (getRoleCapabilities(roleKey).chatWrite) return true;
  return hasPermission(userId, storeId, "tasks.write");
}

async function canReadNotifications(userId, storeId, roleKey) {
  if (getRoleCapabilities(roleKey).tasksWrite) return true;
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

async function createAuditLogSafe(payload) {
  try {
    const eventAt = new Date();
    const previous = await prisma.auditLog.findFirst({
      where: { storeId: payload.storeId },
      select: { id: true, hashChain: true, createdAt: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    const prevHash = previous?.hashChain || null;
    const action = String(payload.action || "").trim().toLowerCase();
    const entityType = String(payload.entityType || "").trim().toLowerCase();
    const hashChain = computeAuditHash({
      prevHash,
      storeId: payload.storeId,
      userId: payload.userId || null,
      action,
      entityType,
      entityId: payload.entityId || null,
      message: payload.message || null,
      payload: payload.payload || null,
      createdAt: eventAt,
    });

    const created = await prisma.auditLog.create({
      data: {
        storeId: payload.storeId,
        userId: payload.userId || null,
        action,
        entityType,
        entityId: payload.entityId || null,
        message: payload.message || null,
        payload: payload.payload || null,
        prevHash,
        hashAlgo: "sha256",
        hashChain,
        createdAt: eventAt,
      },
    });

    // Security guardrail: alert when a user accumulates many denied accesses in 1 hour.
    if (created.action === "access.denied" && created.storeId) {
      const now = new Date();
      const since = new Date(now.getTime() - 60 * 60 * 1000);
      const deniedCount = await prisma.auditLog.count({
        where: {
          storeId: created.storeId,
          userId: created.userId || null,
          action: "access.denied",
          createdAt: { gte: since },
        },
      });

      const threshold = 5;
      if (deniedCount >= threshold) {
        const hourBucket = new Date(now);
        hourBucket.setMinutes(0, 0, 0);
        const dedupeKey = `${created.userId || "unknown"}:${hourBucket.toISOString()}`;
        const existingAlert = await prisma.notification.findFirst({
          where: {
            storeId: created.storeId,
            type: "system",
            severity: "critical",
            linkedEntityType: "audit_alert",
            linkedEntityId: dedupeKey,
            createdAt: { gte: since },
          },
          select: { id: true },
        });

        if (!existingAlert) {
          await createNotificationSafe({
            storeId: created.storeId,
            userId: null,
            type: "system",
            severity: "critical",
            title: "Alerta de seguridad: accesos denegados",
            body: `Usuario ${created.userId || "unknown"} acumulo ${deniedCount} denegaciones en 1 hora.`,
            linkedEntityType: "audit_alert",
            linkedEntityId: dedupeKey,
            createdByUserId: null,
          });
        }
      }
    }

    return created;
  } catch (err) {
    console.error("Audit create error:", err);
    return null;
  }
}

async function createSensitiveReadAuditSafe({ storeId, userId, entityType, message, payload }) {
  return createAuditLogSafe({
    storeId,
    userId: userId || null,
    action: "sensitive.read",
    entityType: entityType || "unknown",
    entityId: null,
    message: message || null,
    payload: payload || null,
  });
}

async function getSensitiveAccessState(userId, storeId, roleKey, options = {}) {
  const { logOnBlock = true } = options;
  const roleAllows = getRoleCapabilities(roleKey).financeRead;
  const permissionAllows = roleAllows
    ? true
    : Boolean(
        await prisma.userPermission.findFirst({
          where: {
            userId,
            storeId,
            granted: true,
            permission: { key: "finance.read" },
          },
          select: { id: true },
        })
      );

  if (!permissionAllows) {
    return { allowed: false, blocked: false, blockedUntil: null, reason: "permission" };
  }

  const now = new Date();
  const deniedWindowStart = new Date(now.getTime() - 60 * 60 * 1000);
  const deniedEvents = await prisma.auditLog.findMany({
    where: {
      storeId,
      userId,
      action: "access.denied",
      createdAt: { gte: deniedWindowStart },
    },
    select: { createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const threshold = 8;
  if (deniedEvents.length < threshold) {
    return { allowed: true, blocked: false, blockedUntil: null, reason: null };
  }

  const lastDeniedAt = deniedEvents[0]?.createdAt || now;
  const blockedUntil = new Date(lastDeniedAt.getTime() + 30 * 60 * 1000);
  if (blockedUntil <= now) {
    return { allowed: true, blocked: false, blockedUntil: null, reason: null };
  }

  if (logOnBlock) {
    await createAuditLogSafe({
      storeId,
      userId,
      action: "access.blocked",
      entityType: "security_policy",
      message: "Sensitive access temporarily blocked after repeated denied attempts",
      payload: {
        deniedLastHour: deniedEvents.length,
        threshold,
        blockedUntil: blockedUntil.toISOString(),
      },
    });

    const hourBucket = new Date(now);
    hourBucket.setMinutes(0, 0, 0);
    const dedupeKey = `blocked:${userId}:${hourBucket.toISOString()}`;
    const existingAlert = await prisma.notification.findFirst({
      where: {
        storeId,
        type: "system",
        severity: "critical",
        linkedEntityType: "audit_alert",
        linkedEntityId: dedupeKey,
        createdAt: { gte: deniedWindowStart },
      },
      select: { id: true },
    });

    if (!existingAlert) {
      await createNotificationSafe({
        storeId,
        userId: null,
        type: "system",
        severity: "critical",
        title: "Bloqueo temporal de acceso sensible",
        body: `Usuario ${userId} bloqueado hasta ${blockedUntil.toISOString()} por denegaciones repetidas.`,
        linkedEntityType: "audit_alert",
        linkedEntityId: dedupeKey,
        createdByUserId: null,
      });
    }
  }

  return { allowed: false, blocked: true, blockedUntil, reason: "cooldown" };
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

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = sortJson(value[key]);
    }
    return out;
  }
  return value;
}

function canonicalJsonString(value) {
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(sortJson(value));
  } catch (_e) {
    return "";
  }
}

function computeAuditHash({ prevHash, storeId, userId, action, entityType, entityId, message, payload, createdAt }) {
  const parts = [
    String(prevHash || "GENESIS"),
    String(storeId || ""),
    String(userId || ""),
    String(action || ""),
    String(entityType || ""),
    String(entityId || ""),
    String(message || ""),
    canonicalJsonString(payload),
    createdAt instanceof Date ? createdAt.toISOString() : "",
  ];
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex");
}

function toUtcDayString(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseAnchorDay(dayStr) {
  const s = String(dayStr || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const start = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(`${s}T23:59:59.999Z`);
  return { day: s, start, end };
}

function getAnchorSigningSecret() {
  return process.env.AUDIT_ANCHOR_SECRET || process.env.JWT_SECRET || "dev-secret";
}

function computeAnchorHash({ storeId, anchorDay, periodStart, periodEnd, eventCount, lastHash, prevAnchorHash }) {
  const parts = [
    String(storeId || ""),
    String(anchorDay || ""),
    periodStart instanceof Date ? periodStart.toISOString() : "",
    periodEnd instanceof Date ? periodEnd.toISOString() : "",
    String(eventCount || 0),
    String(lastHash || ""),
    String(prevAnchorHash || "GENESIS"),
  ];
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex");
}

function signAnchorHash(anchorHash) {
  return crypto.createHmac("sha256", getAnchorSigningSecret()).update(String(anchorHash || "")).digest("hex");
}

async function sealAuditAnchorForDay(storeId, actorUserId, anchorDay) {
  const dayInfo = parseAnchorDay(anchorDay);
  if (!dayInfo) throw new Error("INVALID_ANCHOR_DAY");

  const existing = await prisma.auditAnchor.findUnique({
    where: { storeId_anchorDay: { storeId, anchorDay: dayInfo.day } },
  });
  if (existing) return { reused: true, anchor: existing };

  const [logs, previousAnchor] = await Promise.all([
    prisma.auditLog.findMany({
      where: { storeId, createdAt: { gte: dayInfo.start, lte: dayInfo.end } },
      select: { id: true, hashChain: true, createdAt: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 50000,
    }),
    prisma.auditAnchor.findFirst({
      where: { storeId, anchorDay: { lt: dayInfo.day } },
      orderBy: [{ anchorDay: "desc" }, { createdAt: "desc" }],
    }),
  ]);

  const last = logs.length > 0 ? logs[logs.length - 1] : null;
  const created = await prisma.auditAnchor.create({
    data: {
      storeId,
      anchorDay: dayInfo.day,
      periodStart: dayInfo.start,
      periodEnd: dayInfo.end,
      eventCount: logs.length,
      lastAuditLogId: last?.id || null,
      lastHash: last?.hashChain || null,
      hashAlgo: "sha256",
      prevAnchorHash: previousAnchor?.anchorHash || null,
      anchorHash: computeAnchorHash({
        storeId,
        anchorDay: dayInfo.day,
        periodStart: dayInfo.start,
        periodEnd: dayInfo.end,
        eventCount: logs.length,
        lastHash: last?.hashChain || null,
        prevAnchorHash: previousAnchor?.anchorHash || null,
      }),
      signature: signAnchorHash(
        computeAnchorHash({
          storeId,
          anchorDay: dayInfo.day,
          periodStart: dayInfo.start,
          periodEnd: dayInfo.end,
          eventCount: logs.length,
          lastHash: last?.hashChain || null,
          prevAnchorHash: previousAnchor?.anchorHash || null,
        })
      ),
      createdByUserId: actorUserId || null,
    },
  });

  await createAuditLogSafe({
    storeId,
    userId: actorUserId || null,
    action: "audit.anchor.sealed",
    entityType: "audit_anchor",
    entityId: created.id,
    message: `Audit anchor sealed for ${dayInfo.day}`,
    payload: { anchorDay: dayInfo.day, eventCount: created.eventCount, auto: !actorUserId },
  });

  return { reused: false, anchor: created };
}

async function verifyAuditLogsIntegrityInternal(storeId, options = {}) {
  const { dateFrom = null, dateTo = null, limit = 3000 } = options;
  const parsedFrom = dateFrom ? parseDateInput(dateFrom) : null;
  const parsedTo = dateTo ? parseDateInput(dateTo) : null;
  const parsedToEnd = parsedTo ? new Date(parsedTo.getTime() + 24 * 60 * 60 * 1000 - 1) : null;

  const rows = await prisma.auditLog.findMany({
    where: {
      storeId,
      ...(parsedFrom || parsedToEnd
        ? { createdAt: { ...(parsedFrom ? { gte: parsedFrom } : {}), ...(parsedToEnd ? { lte: parsedToEnd } : {}) } }
        : {}),
    },
    select: {
      id: true,
      storeId: true,
      userId: true,
      action: true,
      entityType: true,
      entityId: true,
      message: true,
      payload: true,
      prevHash: true,
      hashAlgo: true,
      hashChain: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit,
  });

  let anchorPrevHash = null;
  if (rows.length > 0) {
    const first = rows[0];
    const previous = await prisma.auditLog.findFirst({
      where: {
        storeId,
        OR: [{ createdAt: { lt: first.createdAt } }, { createdAt: first.createdAt, id: { lt: first.id } }],
      },
      select: { hashChain: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    anchorPrevHash = previous?.hashChain || null;
  }

  const mismatches = [];
  let expectedPrevHash = anchorPrevHash;
  let legacyRows = 0;
  let verifiedRows = 0;
  for (const row of rows) {
    if (!row.hashChain || !row.hashAlgo || row.hashAlgo !== "sha256") {
      legacyRows += 1;
      expectedPrevHash = row.hashChain || expectedPrevHash;
      continue;
    }
    const expectedHash = computeAuditHash({
      prevHash: expectedPrevHash,
      storeId: row.storeId,
      userId: row.userId,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      message: row.message,
      payload: row.payload,
      createdAt: row.createdAt,
    });
    verifiedRows += 1;
    const prevOk = (row.prevHash || null) === (expectedPrevHash || null);
    const hashOk = row.hashChain === expectedHash;
    if (!prevOk || !hashOk) {
      mismatches.push({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        action: row.action,
        entityType: row.entityType,
        prevHashOk: prevOk,
        hashOk,
      });
    }
    expectedPrevHash = row.hashChain;
  }

  return {
    ok: mismatches.length === 0,
    scanned: rows.length,
    verifiedRows,
    legacyRows,
    mismatches,
    anchorPrevHash,
  };
}

async function verifyAuditAnchorsInternal(storeId, limit = 365) {
  const anchors = await prisma.auditAnchor.findMany({
    where: { storeId },
    orderBy: [{ anchorDay: "asc" }, { createdAt: "asc" }],
    take: limit,
  });

  const mismatches = [];
  let expectedPrev = null;
  for (const a of anchors) {
    const expectedHash = computeAnchorHash({
      storeId,
      anchorDay: a.anchorDay,
      periodStart: a.periodStart,
      periodEnd: a.periodEnd,
      eventCount: a.eventCount,
      lastHash: a.lastHash,
      prevAnchorHash: expectedPrev,
    });
    const expectedSig = signAnchorHash(expectedHash);
    const prevOk = (a.prevAnchorHash || null) === (expectedPrev || null);
    const hashOk = a.anchorHash === expectedHash;
    const sigOk = a.signature === expectedSig;
    if (!prevOk || !hashOk || !sigOk) {
      mismatches.push({ id: a.id, anchorDay: a.anchorDay, prevOk, hashOk, sigOk });
    }
    expectedPrev = a.anchorHash;
  }

  return {
    ok: mismatches.length === 0,
    scanned: anchors.length,
    mismatches,
  };
}

const auditJobState = {
  enabled: String(process.env.AUDIT_AUTO_JOB_ENABLED || "true").toLowerCase() !== "false",
  running: false,
  lastRunAt: null,
  lastRunStatus: "never",
  lastError: null,
  lastSummary: null,
  lastTargetDay: null,
};

function getYesterdayUtcDayString() {
  const now = new Date();
  const y = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1, 0, 0, 0, 0));
  return toUtcDayString(y);
}

async function runAuditAutoJob({ actorUserId = null, source = "auto" } = {}) {
  if (auditJobState.running) {
    return { ok: false, skipped: true, reason: "already_running" };
  }
  auditJobState.running = true;
  const targetDay = getYesterdayUtcDayString();
  try {
    const stores = await prisma.store.findMany({
      where: { status: "active" },
      select: { id: true, name: true },
      take: 200,
    });

    const summary = {
      source,
      targetDay,
      stores: stores.length,
      sealed: 0,
      reused: 0,
      alerts: 0,
      issues: 0,
      perStore: [],
    };

    for (const s of stores) {
      const storeResult = { storeId: s.id, storeName: s.name, seal: "ok", logsOk: true, anchorsOk: true, issues: [] };
      try {
        const sealResult = await sealAuditAnchorForDay(s.id, actorUserId, targetDay);
        if (sealResult.reused) summary.reused += 1;
        else summary.sealed += 1;

        const [logsVerify, anchorsVerify] = await Promise.all([
          verifyAuditLogsIntegrityInternal(s.id, { limit: 3000 }),
          verifyAuditAnchorsInternal(s.id, 400),
        ]);
        if (!logsVerify.ok) {
          storeResult.logsOk = false;
          storeResult.issues.push(`logs_mismatch:${logsVerify.mismatches.length}`);
        }
        if (!anchorsVerify.ok) {
          storeResult.anchorsOk = false;
          storeResult.issues.push(`anchors_mismatch:${anchorsVerify.mismatches.length}`);
        }

        if (!logsVerify.ok || !anchorsVerify.ok) {
          summary.issues += 1;
          const alertKey = `audit_job:${targetDay}:${s.id}`;
          const exists = await prisma.notification.findFirst({
            where: {
              storeId: s.id,
              type: "system",
              severity: "critical",
              linkedEntityType: "audit_alert",
              linkedEntityId: alertKey,
            },
            select: { id: true },
          });
          if (!exists) {
            await createNotificationSafe({
              storeId: s.id,
              userId: null,
              type: "system",
              severity: "critical",
              title: "Alerta integridad auditoria",
              body: `Fallo verificacion automatica ${targetDay}. logsOk=${logsVerify.ok} anchorsOk=${anchorsVerify.ok}`,
              linkedEntityType: "audit_alert",
              linkedEntityId: alertKey,
              createdByUserId: actorUserId || null,
            });
            summary.alerts += 1;
          }
        }

        await createAuditLogSafe({
          storeId: s.id,
          userId: actorUserId || null,
          action: "audit.job.run",
          entityType: "audit_job",
          message: "Audit auto job executed",
          payload: {
            source,
            targetDay,
            sealReused: sealResult.reused,
            logsOk: logsVerify.ok,
            logsMismatches: logsVerify.mismatches.length,
            anchorsOk: anchorsVerify.ok,
            anchorsMismatches: anchorsVerify.mismatches.length,
          },
        });
      } catch (storeErr) {
        summary.issues += 1;
        storeResult.seal = "error";
        storeResult.issues.push(String(storeErr?.message || "unknown_error"));
      }
      summary.perStore.push(storeResult);
    }

    auditJobState.lastRunAt = new Date().toISOString();
    auditJobState.lastRunStatus = summary.issues > 0 ? "warning" : "ok";
    auditJobState.lastError = null;
    auditJobState.lastSummary = summary;
    auditJobState.lastTargetDay = targetDay;
    return { ok: true, summary };
  } catch (err) {
    auditJobState.lastRunAt = new Date().toISOString();
    auditJobState.lastRunStatus = "error";
    auditJobState.lastError = String(err?.message || err || "unknown_error");
    return { ok: false, error: auditJobState.lastError };
  } finally {
    auditJobState.running = false;
  }
}

function toComparableValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (value === undefined) return null;
  return value;
}

function buildFieldChanges(before, after, fields) {
  const changes = [];
  for (const key of fields) {
    const beforeVal = toComparableValue(before?.[key]);
    const afterVal = toComparableValue(after?.[key]);
    if (beforeVal !== afterVal) {
      changes.push({ field: key, before: beforeVal, after: afterVal });
    }
  }
  return changes;
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

const AUDIT_RETENTION_POLICY = Object.freeze({
  securityDays: 365,
  operationalDays: 180,
  readDays: 90,
  defaultDays: 180,
});

function subtractDays(date, days) {
  return new Date(date.getTime() - days * 24 * 60 * 60 * 1000);
}

function getAuditRetentionDays(action, entityType) {
  const a = String(action || "").toLowerCase();
  const e = String(entityType || "").toLowerCase();

  if (a.startsWith("access.") || a.startsWith("auth.") || e === "security_policy") {
    return AUDIT_RETENTION_POLICY.securityDays;
  }
  if (a === "sensitive.read" || a.endsWith(".read")) {
    return AUDIT_RETENTION_POLICY.readDays;
  }
  if (a.endsWith(".created") || a.endsWith(".updated") || a.endsWith(".deleted")) {
    return AUDIT_RETENTION_POLICY.operationalDays;
  }
  return AUDIT_RETENTION_POLICY.defaultDays;
}

function evaluateAuditRetention(log, now = new Date()) {
  const retentionDays = getAuditRetentionDays(log.action, log.entityType);
  const cutoff = subtractDays(now, retentionDays);
  const shouldDelete = log.createdAt < cutoff;
  let bucket = "default";
  const a = String(log.action || "").toLowerCase();
  const e = String(log.entityType || "").toLowerCase();
  if (a.startsWith("access.") || a.startsWith("auth.") || e === "security_policy") bucket = "security";
  else if (a === "sensitive.read" || a.endsWith(".read")) bucket = "read";
  else if (a.endsWith(".created") || a.endsWith(".updated") || a.endsWith(".deleted")) bucket = "operational";
  return { shouldDelete, retentionDays, cutoff, bucket };
}

async function canManageSettings(userId, storeId, roleKey) {
  if (getRoleCapabilities(roleKey).settingsWrite) return true;
  return hasPermission(userId, storeId, "settings.write");
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
const SUPPORT_TICKET_STATUSES = new Set(["open", "in_progress", "waiting_customer", "resolved", "closed"]);
const SUPPORT_TICKET_PRIORITIES = new Set(["low", "medium", "high", "urgent"]);
const SUPPORT_OPEN_STATUSES = new Set(["open", "in_progress", "waiting_customer"]);

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function getSupportSlaHours(priority) {
  const p = String(priority || "medium");
  if (p === "urgent") return { firstResponse: 1, resolution: 24 };
  if (p === "high") return { firstResponse: 4, resolution: 48 };
  if (p === "low") return { firstResponse: 24, resolution: 168 };
  return { firstResponse: 12, resolution: 96 };
}

function computeSupportSlaDates(priority, baseDate) {
  const start = baseDate instanceof Date ? baseDate : new Date();
  const hours = getSupportSlaHours(priority);
  return {
    slaFirstResponseDueAt: addHours(start, hours.firstResponse),
    slaResolutionDueAt: addHours(start, hours.resolution),
  };
}

function isSupportTerminalStatus(status) {
  return ["resolved", "closed"].includes(String(status || ""));
}

async function syncSupportSlaBreaches(storeId, actorUserId = null) {
  const now = new Date();
  const breachedTickets = await prisma.supportTicket.findMany({
    where: {
      storeId,
      status: { in: Array.from(SUPPORT_OPEN_STATUSES) },
      slaResolutionDueAt: { not: null, lt: now },
      slaBreached: false,
    },
    select: {
      id: true,
      title: true,
      assignedToUserId: true,
    },
    take: 300,
  });

  for (const t of breachedTickets) {
    const updated = await prisma.supportTicket.update({
      where: { id: t.id },
      data: { slaBreached: true, slaBreachedAt: now },
      select: { id: true, slaBreachNotifiedAt: true, assignedToUserId: true, title: true },
    });

    if (!updated.slaBreachNotifiedAt) {
      await createNotificationSafe({
        storeId,
        userId: updated.assignedToUserId || null,
        type: "system",
        severity: "critical",
        title: `SLA vencido: ${updated.title}`,
        body: "El ticket superó el tiempo objetivo de resolución.",
        linkedEntityType: "support_ticket",
        linkedEntityId: updated.id,
      });

      await prisma.supportTicket.update({
        where: { id: updated.id },
        data: { slaBreachNotifiedAt: now },
      });
    }

    const existingEscalationTask = await prisma.teamTask.findFirst({
      where: {
        storeId,
        linkedEntityType: "support_ticket",
        linkedEntityId: updated.id,
        status: { in: ["open", "in_progress", "blocked"] },
      },
      select: { id: true },
    });

    if (!existingEscalationTask) {
      await prisma.teamTask.create({
        data: {
          storeId,
          title: `[SLA] Escalar ticket: ${updated.title}`,
          description: "Ticket con SLA vencido. Revisar prioridad, respuesta y resolución inmediata.",
          status: "open",
          priority: "high",
          dueAt: addHours(now, 4),
          linkedEntityType: "support_ticket",
          linkedEntityId: updated.id,
          assignedToUserId: updated.assignedToUserId || null,
          createdByUserId: actorUserId || null,
        },
      });
    }
  }
}

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

app.get("/health/deep", async (_req, res) => {
  const startedAt = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const [users, stores, orders, tasks, tickets] = await Promise.all([
      prisma.user.count(),
      prisma.store.count(),
      prisma.salesOrder.count(),
      prisma.teamTask.count(),
      prisma.supportTicket.count(),
    ]);
    const latencyMs = Date.now() - startedAt;
    return res.json({
      ok: true,
      database: "up",
      latencyMs,
      counts: { users, stores, orders, tasks, tickets },
      now: new Date().toISOString(),
    });
  } catch (err) {
    console.error("GET /health/deep error:", err);
    return res.status(500).json({
      ok: false,
      database: "down",
      latencyMs: Date.now() - startedAt,
      error: "Database check failed",
      now: new Date().toISOString(),
    });
  }
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
    const roleCaps = getRoleCapabilities(membership.roleKey);

    const [canSensitive, canAnalyticsRead, canCatalogWrite, canOrdersWrite, canPayoutsWrite, canInvoicesWrite, canTasksWrite, canCustomersRead, canSupportWrite] = await Promise.all([
      canReadSensitive(userId, storeId, membership.roleKey),
      canReadAnalytics(userId, storeId, membership.roleKey),
      canManageCatalog(userId, storeId, membership.roleKey),
      canManageOrders(userId, storeId, membership.roleKey),
      canManagePayouts(userId, storeId, membership.roleKey),
      canManageInvoices(userId, storeId, membership.roleKey),
      canManageTasks(userId, storeId, membership.roleKey),
      canReadCustomers(userId, storeId, membership.roleKey),
      canManageSupport(userId, storeId, membership.roleKey),
    ]);

    return res.json({
      roleKey: membership.roleKey,
      permissions: {
        inventoryRead: roleCaps.inventoryRead,
        inventoryWrite: roleCaps.inventoryWrite,
        catalogWrite: canCatalogWrite,
        ordersWrite: canOrdersWrite,
        payoutsWrite: canPayoutsWrite,
        invoicesWrite: canInvoicesWrite,
        returnsWrite: roleCaps.returnsWrite,
        analyticsRead: canAnalyticsRead,
        financeRead: canSensitive,
        suppliersRead: canSensitive,
        tasksWrite: canTasksWrite,
        customersRead: canCustomersRead,
        supportWrite: canSupportWrite,
        settingsWrite: roleCaps.settingsWrite,
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

app.get("/audit/logs", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const storeId = String(req.query.storeId || "").trim();
    const filterUserId = String(req.query.userId || "").trim();
    const action = String(req.query.action || "").trim().toLowerCase();
    const entityType = String(req.query.entityType || "").trim().toLowerCase();
    const q = String(req.query.q || "").trim();
    const dateFrom = String(req.query.dateFrom || "").trim();
    const dateTo = String(req.query.dateTo || "").trim();
    const limitRaw = Number(req.query.limit || 120);
    const limit = Math.max(1, Math.min(500, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 120));

    if (!storeId) return res.status(400).json({ error: "Missing storeId" });
    const parsedFrom = dateFrom ? parseDateInput(dateFrom) : null;
    const parsedTo = dateTo ? parseDateInput(dateTo) : null;
    if (dateFrom && !parsedFrom) return res.status(400).json({ error: "Invalid dateFrom" });
    if (dateTo && !parsedTo) return res.status(400).json({ error: "Invalid dateTo" });
    const parsedToEnd = parsedTo ? new Date(parsedTo.getTime() + 24 * 60 * 60 * 1000 - 1) : null;

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const sensitiveState = await getSensitiveAccessState(userId, storeId, membership.roleKey);
    if (!sensitiveState.allowed) {
      await createAuditLogSafe({
        storeId,
        userId,
        action: sensitiveState.blocked ? "access.blocked" : "access.denied",
        entityType: "audit_log",
        message: "Denied audit logs read",
        payload: sensitiveState.blocked
          ? { blockedUntil: sensitiveState.blockedUntil ? sensitiveState.blockedUntil.toISOString() : null }
          : null,
      });
      return res.status(403).json({
        error: sensitiveState.blocked
          ? "Sensitive access temporarily blocked. Try again later."
          : "No permission to read audit logs",
      });
    }
    await createSensitiveReadAuditSafe({
      storeId,
      userId,
      entityType: "audit_log",
      message: "Read audit logs",
      payload: {
        action: action || null,
        entityType: entityType || null,
        q: q || null,
        userId: filterUserId || null,
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
        limit,
      },
    });

    const logs = await prisma.auditLog.findMany({
      where: {
        storeId,
        ...(filterUserId ? { userId: filterUserId } : {}),
        ...(parsedFrom || parsedToEnd
          ? {
              createdAt: {
                ...(parsedFrom ? { gte: parsedFrom } : {}),
                ...(parsedToEnd ? { lte: parsedToEnd } : {}),
              },
            }
          : {}),
        ...(action ? { action } : {}),
        ...(entityType ? { entityType } : {}),
        ...(q
          ? {
              OR: [
                { message: { contains: q, mode: "insensitive" } },
                { entityId: { contains: q, mode: "insensitive" } },
                { user: { fullName: { contains: q, mode: "insensitive" } } },
                { user: { email: { contains: q, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return res.json({ logs });
  } catch (err) {
    console.error("GET /audit/logs error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/audit/logs/export", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const storeId = String(req.query.storeId || "").trim();
    const filterUserId = String(req.query.userId || "").trim();
    const action = String(req.query.action || "").trim().toLowerCase();
    const entityType = String(req.query.entityType || "").trim().toLowerCase();
    const q = String(req.query.q || "").trim();
    const dateFrom = String(req.query.dateFrom || "").trim();
    const dateTo = String(req.query.dateTo || "").trim();
    const limitRaw = Number(req.query.limit || 2000);
    const limit = Math.max(1, Math.min(5000, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 2000));

    if (!storeId) return res.status(400).json({ error: "Missing storeId" });
    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const sensitiveState = await getSensitiveAccessState(userId, storeId, membership.roleKey);
    if (!sensitiveState.allowed) {
      return res.status(403).json({
        error: sensitiveState.blocked
          ? "Sensitive access temporarily blocked. Try again later."
          : "No permission to export audit logs",
      });
    }

    const parsedFrom = dateFrom ? parseDateInput(dateFrom) : null;
    const parsedTo = dateTo ? parseDateInput(dateTo) : null;
    if (dateFrom && !parsedFrom) return res.status(400).json({ error: "Invalid dateFrom" });
    if (dateTo && !parsedTo) return res.status(400).json({ error: "Invalid dateTo" });
    const parsedToEnd = parsedTo ? new Date(parsedTo.getTime() + 24 * 60 * 60 * 1000 - 1) : null;

    const logs = await prisma.auditLog.findMany({
      where: {
        storeId,
        ...(filterUserId ? { userId: filterUserId } : {}),
        ...(parsedFrom || parsedToEnd
          ? {
              createdAt: {
                ...(parsedFrom ? { gte: parsedFrom } : {}),
                ...(parsedToEnd ? { lte: parsedToEnd } : {}),
              },
            }
          : {}),
        ...(action ? { action } : {}),
        ...(entityType ? { entityType } : {}),
        ...(q
          ? {
              OR: [
                { message: { contains: q, mode: "insensitive" } },
                { entityId: { contains: q, mode: "insensitive" } },
                { user: { fullName: { contains: q, mode: "insensitive" } } },
                { user: { email: { contains: q, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      include: {
        user: { select: { fullName: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    await createSensitiveReadAuditSafe({
      storeId,
      userId,
      entityType: "audit_log",
      message: "Export audit logs CSV",
      payload: {
        action: action || null,
        entityType: entityType || null,
        q: q || null,
        userId: filterUserId || null,
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
        limit,
        exportedRows: logs.length,
      },
    });

    const escapeCsv = (v) => {
      const s = String(v ?? "");
      if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
        return `"${s.replace(/"/g, "\"\"")}"`;
      }
      return s;
    };

    const rows = [
      ["id", "created_at", "action", "entity_type", "entity_id", "user_name", "user_email", "message", "payload_json"].join(","),
      ...logs.map((l) =>
        [
          l.id,
          l.createdAt.toISOString(),
          l.action,
          l.entityType,
          l.entityId || "",
          l.user?.fullName || "",
          l.user?.email || "",
          l.message || "",
          l.payload ? JSON.stringify(l.payload) : "",
        ]
          .map(escapeCsv)
          .join(",")
      ),
    ];

    const filename = `audit_logs_${storeId}_${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.status(200).send(rows.join("\n"));
  } catch (err) {
    console.error("GET /audit/logs/export error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/audit/evidence", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const storeId = String(req.query.storeId || "").trim();
    const filterUserId = String(req.query.userId || "").trim();
    const action = String(req.query.action || "").trim().toLowerCase();
    const entityType = String(req.query.entityType || "").trim().toLowerCase();
    const q = String(req.query.q || "").trim();
    const dateFrom = String(req.query.dateFrom || "").trim();
    const dateTo = String(req.query.dateTo || "").trim();
    const limitRaw = Number(req.query.limit || 1000);
    const limit = Math.max(1, Math.min(5000, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 1000));
    const hoursRaw = Number(req.query.hours || 24);
    const hours = Math.max(1, Math.min(24 * 30, Number.isFinite(hoursRaw) ? Math.floor(hoursRaw) : 24));

    if (!storeId) return res.status(400).json({ error: "Missing storeId" });
    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const sensitiveState = await getSensitiveAccessState(userId, storeId, membership.roleKey);
    if (!sensitiveState.allowed) {
      return res.status(403).json({
        error: sensitiveState.blocked
          ? "Sensitive access temporarily blocked. Try again later."
          : "No permission to export audit evidence",
      });
    }

    const parsedFrom = dateFrom ? parseDateInput(dateFrom) : null;
    const parsedTo = dateTo ? parseDateInput(dateTo) : null;
    if (dateFrom && !parsedFrom) return res.status(400).json({ error: "Invalid dateFrom" });
    if (dateTo && !parsedTo) return res.status(400).json({ error: "Invalid dateTo" });
    const parsedToEnd = parsedTo ? new Date(parsedTo.getTime() + 24 * 60 * 60 * 1000 - 1) : null;

    const where = {
      storeId,
      ...(filterUserId ? { userId: filterUserId } : {}),
      ...(parsedFrom || parsedToEnd
        ? {
            createdAt: {
              ...(parsedFrom ? { gte: parsedFrom } : {}),
              ...(parsedToEnd ? { lte: parsedToEnd } : {}),
            },
          }
        : {}),
      ...(action ? { action } : {}),
      ...(entityType ? { entityType } : {}),
      ...(q
        ? {
            OR: [
              { message: { contains: q, mode: "insensitive" } },
              { entityId: { contains: q, mode: "insensitive" } },
              { user: { fullName: { contains: q, mode: "insensitive" } } },
              { user: { email: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    const [logs, alerts, metricRows] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, fullName: true, email: true } } },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      prisma.notification.findMany({
        where: {
          storeId,
          linkedEntityType: "audit_alert",
          ...(filterUserId ? { userId: filterUserId } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 300,
      }),
      prisma.auditLog.findMany({
        where: {
          storeId,
          ...(filterUserId ? { userId: filterUserId } : {}),
          createdAt: { gte: new Date(Date.now() - hours * 60 * 60 * 1000) },
        },
        select: { action: true, entityType: true },
        orderBy: { createdAt: "desc" },
        take: 5000,
      }),
    ]);

    const actionCounts = new Map();
    const entityCounts = new Map();
    let deniedAccess = 0;
    let sensitiveReads = 0;
    for (const row of metricRows) {
      actionCounts.set(row.action, (actionCounts.get(row.action) || 0) + 1);
      entityCounts.set(row.entityType, (entityCounts.get(row.entityType) || 0) + 1);
      if (row.action === "access.denied") deniedAccess += 1;
      if (row.action === "sensitive.read") sensitiveReads += 1;
    }

    await createSensitiveReadAuditSafe({
      storeId,
      userId,
      entityType: "audit_log",
      message: "Export audit evidence JSON",
      payload: {
        action: action || null,
        entityType: entityType || null,
        q: q || null,
        userId: filterUserId || null,
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
        limit,
        hours,
        exportedLogs: logs.length,
        exportedAlerts: alerts.length,
      },
    });

    const payload = {
      meta: {
        generatedAt: new Date().toISOString(),
        exportedByUserId: userId,
        storeId,
      },
      filters: {
        action: action || null,
        entityType: entityType || null,
        q: q || null,
        userId: filterUserId || null,
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
        limit,
        metricsHours: hours,
      },
      summary: {
        logs: logs.length,
        alerts: alerts.length,
        deniedAccess,
        sensitiveReads,
        topActions: Array.from(actionCounts.entries())
          .map(([name, count]) => ({ action: name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10),
        topEntities: Array.from(entityCounts.entries())
          .map(([name, count]) => ({ entityType: name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10),
      },
      logs: logs.map((log) => ({
        id: log.id,
        createdAt: log.createdAt.toISOString(),
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        message: log.message,
        payload: log.payload,
        user: log.user
          ? { id: log.user.id, fullName: log.user.fullName, email: log.user.email }
          : null,
      })),
      alerts: alerts.map((a) => ({
        id: a.id,
        title: a.title,
        body: a.body,
        severity: a.severity,
        isRead: a.isRead,
        linkedEntityType: a.linkedEntityType,
        linkedEntityId: a.linkedEntityId,
        userId: a.userId,
        createdAt: a.createdAt.toISOString(),
      })),
    };

    const filename = `audit_evidence_${storeId}_${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.status(200).send(JSON.stringify(payload, null, 2));
  } catch (err) {
    console.error("GET /audit/evidence error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/audit/metrics", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const storeId = String(req.query.storeId || "").trim();
    const filterUserId = String(req.query.userId || "").trim();
    const hoursRaw = Number(req.query.hours || 24);
    const hours = Math.max(1, Math.min(24 * 30, Number.isFinite(hoursRaw) ? Math.floor(hoursRaw) : 24));
    if (!storeId) return res.status(400).json({ error: "Missing storeId" });

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const sensitiveState = await getSensitiveAccessState(userId, storeId, membership.roleKey);
    if (!sensitiveState.allowed) {
      return res.status(403).json({
        error: sensitiveState.blocked
          ? "Sensitive access temporarily blocked. Try again later."
          : "No permission to read audit metrics",
      });
    }

    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const rows = await prisma.auditLog.findMany({
      where: { storeId, ...(filterUserId ? { userId: filterUserId } : {}), createdAt: { gte: since } },
      select: {
        action: true,
        entityType: true,
        createdAt: true,
        userId: true,
        user: { select: { fullName: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const [lastHourRows, prevHourRows] = await Promise.all([
      prisma.auditLog.findMany({
        where: { storeId, ...(filterUserId ? { userId: filterUserId } : {}), createdAt: { gte: oneHourAgo } },
        select: { action: true, entityType: true, userId: true },
      }),
      prisma.auditLog.findMany({
        where: {
          storeId,
          ...(filterUserId ? { userId: filterUserId } : {}),
          createdAt: { gte: twoHoursAgo, lt: oneHourAgo },
        },
        select: { action: true, entityType: true, userId: true },
      }),
    ]);

    const alertNotificationsCount = await prisma.notification.count({
      where: {
        storeId,
        linkedEntityType: "audit_alert",
        severity: "critical",
        ...(filterUserId ? { userId: filterUserId } : {}),
        createdAt: { gte: since },
      },
    });

    const totals = {
      totalEvents: rows.length,
      deniedAccess: 0,
      sensitiveReads: 0,
      updatesWithDiff: 0,
    };
    const byActionMap = new Map();
    const byEntityMap = new Map();
    const deniedByUserMap = new Map();
    for (const row of rows) {
      if (row.action === "access.denied") totals.deniedAccess += 1;
      if (row.action === "sensitive.read") totals.sensitiveReads += 1;
      if (row.action.endsWith(".updated")) totals.updatesWithDiff += 1;

      byActionMap.set(row.action, (byActionMap.get(row.action) || 0) + 1);
      byEntityMap.set(row.entityType, (byEntityMap.get(row.entityType) || 0) + 1);
      if (row.action === "access.denied") {
        const label = row.user?.fullName || row.user?.email || row.userId || "unknown";
        deniedByUserMap.set(label, (deniedByUserMap.get(label) || 0) + 1);
      }
    }

    const byAction = Array.from(byActionMap.entries())
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    const byEntity = Array.from(byEntityMap.entries())
      .map(([entityType, count]) => ({ entityType, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    const deniedByUser = Array.from(deniedByUserMap.entries())
      .map(([user, count]) => ({ user, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    const byUserMap = new Map();
    for (const row of rows) {
      const label = row.user?.fullName || row.user?.email || row.userId || "unknown";
      byUserMap.set(label, (byUserMap.get(label) || 0) + 1);
    }
    const byUser = Array.from(byUserMap.entries())
      .map(([user, count]) => ({ user, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    const countByAction = (list) => {
      const m = new Map();
      for (const row of list) m.set(row.action, (m.get(row.action) || 0) + 1);
      return m;
    };
    const lastHourByAction = countByAction(lastHourRows);
    const prevHourByAction = countByAction(prevHourRows);

    const anomalies = [];
    const recommendations = [];

    const deniedLastHour = Number(lastHourByAction.get("access.denied") || 0);
    const deniedPrevHour = Number(prevHourByAction.get("access.denied") || 0);
    if (deniedLastHour >= 5) {
      anomalies.push({
        type: "denied_spike",
        severity: deniedLastHour >= 10 ? "critical" : "warning",
        title: "Pico de accesos denegados (1h)",
        detail: `${deniedLastHour} denegaciones en la ultima hora`,
      });
      recommendations.push("Revisar roles/permisos de usuarios con mas denegaciones (Denied por usuario).");
    }
    if (deniedLastHour >= Math.max(3, deniedPrevHour * 2) && deniedPrevHour > 0) {
      anomalies.push({
        type: "denied_growth",
        severity: "warning",
        title: "Crecimiento brusco de denegaciones",
        detail: `Ultima hora ${deniedLastHour} vs hora previa ${deniedPrevHour}`,
      });
      recommendations.push("Validar si hubo cambios recientes de permisos o rutas de frontend.");
    }

    const sensitiveLastHour = Number(lastHourByAction.get("sensitive.read") || 0);
    const sensitivePrevHour = Number(prevHourByAction.get("sensitive.read") || 0);
    if (sensitiveLastHour >= Math.max(20, sensitivePrevHour * 2) && sensitiveLastHour > 0) {
      anomalies.push({
        type: "sensitive_read_spike",
        severity: "warning",
        title: "Pico de lecturas sensibles",
        detail: `Ultima hora ${sensitiveLastHour} vs hora previa ${sensitivePrevHour}`,
      });
      recommendations.push("Auditar consultas de finanzas/proveedores y confirmar necesidad operativa.");
    }

    const topDeniedUser = deniedByUser.length > 0 ? deniedByUser[0] : null;
    if (topDeniedUser && topDeniedUser.count >= 3) {
      recommendations.push(`Revisar cuenta ${topDeniedUser.user}: ${topDeniedUser.count} denegaciones en ventana actual.`);
    }

    return res.json({
      range: { since: since.toISOString(), hours },
      totals: {
        ...totals,
        alertNotifications: alertNotificationsCount,
      },
      byAction,
      byEntity,
      byUser,
      deniedByUser,
      anomalies,
      recommendations: Array.from(new Set(recommendations)).slice(0, 6),
    });
  } catch (err) {
    console.error("GET /audit/metrics error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/audit/alerts", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const storeId = String(req.query.storeId || "").trim();
    const onlyOpen = String(req.query.onlyOpen || "1").trim() === "1";
    if (!storeId) return res.status(400).json({ error: "Missing storeId" });

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const sensitiveState = await getSensitiveAccessState(userId, storeId, membership.roleKey);
    if (!sensitiveState.allowed) {
      return res.status(403).json({
        error: sensitiveState.blocked
          ? "Sensitive access temporarily blocked. Try again later."
          : "No permission to read audit alerts",
      });
    }

    const alerts = await prisma.notification.findMany({
      where: {
        storeId,
        linkedEntityType: "audit_alert",
        severity: "critical",
        ...(onlyOpen ? { isRead: false } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return res.json({ alerts });
  } catch (err) {
    console.error("GET /audit/alerts error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.patch("/audit/alerts/:notificationId/ack", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { notificationId } = req.params;
    const { storeId } = req.body || {};
    if (!storeId) return res.status(400).json({ error: "Missing storeId" });

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const sensitiveState = await getSensitiveAccessState(userId, storeId, membership.roleKey);
    if (!sensitiveState.allowed) {
      return res.status(403).json({
        error: sensitiveState.blocked
          ? "Sensitive access temporarily blocked. Try again later."
          : "No permission to ack audit alerts",
      });
    }

    const updated = await prisma.notification.updateMany({
      where: {
        id: notificationId,
        storeId,
        linkedEntityType: "audit_alert",
        severity: "critical",
      },
      data: { isRead: true, readAt: new Date() },
    });
    if (updated.count === 0) return res.status(404).json({ error: "Audit alert not found" });

    await createAuditLogSafe({
      storeId,
      userId,
      action: "audit.alert.ack",
      entityType: "audit_alert",
      entityId: notificationId,
      message: "Audit alert acknowledged",
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error("PATCH /audit/alerts/:notificationId/ack error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.post("/audit/alerts/ack-all", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { storeId } = req.body || {};
    if (!storeId) return res.status(400).json({ error: "Missing storeId" });

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const sensitiveState = await getSensitiveAccessState(userId, storeId, membership.roleKey);
    if (!sensitiveState.allowed) {
      return res.status(403).json({
        error: sensitiveState.blocked
          ? "Sensitive access temporarily blocked. Try again later."
          : "No permission to ack audit alerts",
      });
    }

    const result = await prisma.notification.updateMany({
      where: {
        storeId,
        linkedEntityType: "audit_alert",
        severity: "critical",
        isRead: false,
      },
      data: { isRead: true, readAt: new Date() },
    });

    await createAuditLogSafe({
      storeId,
      userId,
      action: "audit.alert.ack_all",
      entityType: "audit_alert",
      message: "All audit alerts acknowledged",
      payload: { updated: result.count },
    });

    return res.json({ ok: true, updated: result.count });
  } catch (err) {
    console.error("POST /audit/alerts/ack-all error:", err);
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
    if (!canSensitive) {
      await createAuditLogSafe({
        storeId,
        userId,
        action: "access.denied",
        entityType: "supplier",
        message: "Denied suppliers read",
      });
      return res.status(403).json({ error: "No permission to read suppliers" });
    }
    await createSensitiveReadAuditSafe({
      storeId,
      userId,
      entityType: "supplier",
      message: "Read suppliers list",
      payload: { q: q || null },
    });

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
    if (!canSensitive) {
      await createAuditLogSafe({
        storeId,
        userId,
        action: "access.denied",
        entityType: "purchase_order",
        message: "Denied purchases read",
      });
      return res.status(403).json({ error: "No permission to read purchases" });
    }
    await createSensitiveReadAuditSafe({
      storeId,
      userId,
      entityType: "purchase_order",
      message: "Read purchases list",
      payload: { status: status || null },
    });

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
    if (!canSensitive) {
      await createAuditLogSafe({
        storeId,
        userId,
        action: "access.denied",
        entityType: "purchase_order",
        message: "Denied purchase detail read",
        payload: { purchaseId },
      });
      return res.status(403).json({ error: "No permission to read purchases" });
    }
    await createSensitiveReadAuditSafe({
      storeId,
      userId,
      entityType: "purchase_order",
      message: "Read purchase detail",
      payload: { purchaseId },
    });

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

    await createAuditLogSafe({
      storeId,
      userId,
      action: "purchase.received",
      entityType: "purchase_order",
      entityId: result.purchase.id,
      message: `Purchase received: ${result.purchase.poNumber}`,
      payload: {
        lotCount: result.receivedLots.length,
        totalReceivedUnits,
        movementCount: result.movementIds.length,
      },
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

app.get("/customers", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const storeId = String(req.query.storeId || "").trim();
    const q = String(req.query.q || "").trim();
    if (!storeId) return res.status(400).json({ error: "Missing storeId" });

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const canRead = await canReadCustomers(userId, storeId, membership.roleKey);
    if (!canRead) return res.status(403).json({ error: "No permission to read customers" });

    const canSensitive = await canReadSensitive(userId, storeId, membership.roleKey);
    const customers = await prisma.customer.findMany({
      where: {
        storeId,
        ...(q
          ? {
              OR: [
                { email: { contains: q, mode: "insensitive" } },
                { fullName: { contains: q, mode: "insensitive" } },
                { country: { contains: q, mode: "insensitive" } },
                { city: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: {
        orders: {
          select: {
            id: true,
            orderNumber: true,
            orderedAt: true,
            grossAmountEurFrozen: true,
            netProfitEur: true,
          },
          orderBy: { orderedAt: "desc" },
          take: 30,
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    });

    return res.json({
      customers: customers.map((c) => {
        const totalOrders = c.orders.length;
        const totalRevenueEur = roundMoney(c.orders.reduce((sum, o) => sum + numberOrZero(o.grossAmountEurFrozen), 0));
        const totalProfitEur = roundMoney(c.orders.reduce((sum, o) => sum + numberOrZero(o.netProfitEur), 0));
        return {
          id: c.id,
          email: c.email,
          fullName: c.fullName,
          country: c.country,
          city: c.city,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          totalOrders,
          totalRevenueEur: canSensitive ? totalRevenueEur : null,
          totalProfitEur: canSensitive ? totalProfitEur : null,
          lastOrderAt: c.orders[0]?.orderedAt || null,
        };
      }),
    });
  } catch (err) {
    console.error("GET /customers error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/customers/:customerId", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { customerId } = req.params;
    const storeId = String(req.query.storeId || "").trim();
    if (!storeId) return res.status(400).json({ error: "Missing storeId" });

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const canRead = await canReadCustomers(userId, storeId, membership.roleKey);
    if (!canRead) return res.status(403).json({ error: "No permission to read customers" });

    const canSensitive = await canReadSensitive(userId, storeId, membership.roleKey);
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, storeId },
      include: {
        orders: {
          include: {
            items: {
              select: {
                id: true,
                title: true,
                quantity: true,
                revenueEurFrozen: true,
                cogsEurFrozen: true,
                product: { select: { id: true, ean: true, brand: true, model: true } },
              },
            },
            returns: {
              select: {
                id: true,
                decision: true,
                status: true,
                quantity: true,
                returnCostEur: true,
                createdAt: true,
              },
            },
          },
          orderBy: { orderedAt: "desc" },
          take: 200,
        },
        tickets: {
          include: {
            assignedTo: { select: { id: true, fullName: true, email: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 100,
        },
      },
    });
    if (!customer) return res.status(404).json({ error: "Customer not found" });

    const summary = {
      totalOrders: customer.orders.length,
      totalRevenueEur: canSensitive
        ? roundMoney(customer.orders.reduce((sum, o) => sum + numberOrZero(o.grossAmountEurFrozen), 0))
        : null,
      totalProfitEur: canSensitive
        ? roundMoney(customer.orders.reduce((sum, o) => sum + numberOrZero(o.netProfitEur), 0))
        : null,
      totalReturns: customer.orders.reduce((sum, o) => sum + o.returns.length, 0),
      openTickets: customer.tickets.filter((t) => !["resolved", "closed"].includes(t.status)).length,
    };

    return res.json({
      customer: {
        id: customer.id,
        email: customer.email,
        fullName: customer.fullName,
        country: customer.country,
        city: customer.city,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt,
      },
      summary,
      orders: customer.orders.map((o) => ({
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
          cogsEurFrozen: canSensitive ? normalizeMoney(it.cogsEurFrozen) : null,
        })),
        returns: o.returns.map((r) => ({
          ...r,
          returnCostEur: canSensitive ? normalizeMoney(r.returnCostEur) : null,
        })),
      })),
      tickets: customer.tickets,
    });
  } catch (err) {
    console.error("GET /customers/:customerId error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/support/tickets", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const storeId = String(req.query.storeId || "").trim();
    const status = String(req.query.status || "").trim();
    const priority = String(req.query.priority || "").trim();
    const q = String(req.query.q || "").trim();
    const assignedToMe = String(req.query.assignedToMe || "").trim() === "1";
    if (!storeId) return res.status(400).json({ error: "Missing storeId" });

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const canWrite = await canManageSupport(userId, storeId, membership.roleKey);
    if (!canWrite) return res.status(403).json({ error: "No permission to read support tickets" });

    await syncSupportSlaBreaches(storeId, userId);

    if (status && !SUPPORT_TICKET_STATUSES.has(status)) return res.status(400).json({ error: "Invalid status" });
    if (priority && !SUPPORT_TICKET_PRIORITIES.has(priority)) return res.status(400).json({ error: "Invalid priority" });

    const tickets = await prisma.supportTicket.findMany({
      where: {
        storeId,
        ...(status ? { status } : {}),
        ...(priority ? { priority } : {}),
        ...(assignedToMe ? { assignedToUserId: userId } : {}),
        ...(q
          ? {
              OR: [
                { title: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
                { reason: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: {
        customer: { select: { id: true, fullName: true, email: true } },
        order: { select: { id: true, orderNumber: true } },
        assignedTo: { select: { id: true, fullName: true, email: true } },
        createdBy: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: [{ status: "asc" }, { priority: "desc" }, { createdAt: "desc" }],
      take: 300,
    });

    return res.json({ tickets });
  } catch (err) {
    console.error("GET /support/tickets error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/support/metrics", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const storeId = String(req.query.storeId || "").trim();
    if (!storeId) return res.status(400).json({ error: "Missing storeId" });

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const canWrite = await canManageSupport(userId, storeId, membership.roleKey);
    if (!canWrite) return res.status(403).json({ error: "No permission to read support metrics" });

    await syncSupportSlaBreaches(storeId, userId);

    const tickets = await prisma.supportTicket.findMany({
      where: { storeId },
      select: {
        id: true,
        status: true,
        priority: true,
        createdAt: true,
        firstResponseAt: true,
        resolvedAt: true,
        closedAt: true,
        slaBreached: true,
      },
      take: 1000,
      orderBy: { createdAt: "desc" },
    });

    const openCount = tickets.filter((t) => SUPPORT_OPEN_STATUSES.has(t.status)).length;
    const breachedOpenCount = tickets.filter((t) => SUPPORT_OPEN_STATUSES.has(t.status) && t.slaBreached).length;
    const resolvedCount = tickets.filter((t) => ["resolved", "closed"].includes(t.status)).length;

    const firstResponseHours = tickets
      .filter((t) => t.firstResponseAt)
      .map((t) => (new Date(t.firstResponseAt).getTime() - new Date(t.createdAt).getTime()) / (1000 * 60 * 60))
      .filter((h) => Number.isFinite(h) && h >= 0);
    const resolutionHours = tickets
      .map((t) => {
        const end = t.resolvedAt || t.closedAt;
        if (!end) return null;
        return (new Date(end).getTime() - new Date(t.createdAt).getTime()) / (1000 * 60 * 60);
      })
      .filter((h) => h !== null && Number.isFinite(h) && h >= 0);

    const avgFirstResponseHours = firstResponseHours.length
      ? roundMoney(firstResponseHours.reduce((a, b) => a + b, 0) / firstResponseHours.length)
      : 0;
    const avgResolutionHours = resolutionHours.length
      ? roundMoney(resolutionHours.reduce((a, b) => a + b, 0) / resolutionHours.length)
      : 0;

    const byStatus = {};
    const byPriority = {};
    for (const t of tickets) {
      byStatus[t.status] = (byStatus[t.status] || 0) + 1;
      byPriority[t.priority] = (byPriority[t.priority] || 0) + 1;
    }

    return res.json({
      metrics: {
        total: tickets.length,
        openCount,
        breachedOpenCount,
        resolvedCount,
        avgFirstResponseHours,
        avgResolutionHours,
        byStatus,
        byPriority,
      },
    });
  } catch (err) {
    console.error("GET /support/metrics error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/support/tickets/export", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const storeId = String(req.query.storeId || "").trim();
    const status = String(req.query.status || "").trim();
    const priority = String(req.query.priority || "").trim();
    const q = String(req.query.q || "").trim();
    const assignedToMe = String(req.query.assignedToMe || "").trim() === "1";
    if (!storeId) return res.status(400).json({ error: "Missing storeId" });

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const canWrite = await canManageSupport(userId, storeId, membership.roleKey);
    if (!canWrite) return res.status(403).json({ error: "No permission to export support tickets" });

    if (status && !SUPPORT_TICKET_STATUSES.has(status)) return res.status(400).json({ error: "Invalid status" });
    if (priority && !SUPPORT_TICKET_PRIORITIES.has(priority)) return res.status(400).json({ error: "Invalid priority" });

    const rows = await prisma.supportTicket.findMany({
      where: {
        storeId,
        ...(status ? { status } : {}),
        ...(priority ? { priority } : {}),
        ...(assignedToMe ? { assignedToUserId: userId } : {}),
        ...(q
          ? {
              OR: [
                { title: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
                { reason: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: {
        customer: { select: { fullName: true, email: true } },
        order: { select: { orderNumber: true } },
        assignedTo: { select: { fullName: true, email: true } },
      },
      orderBy: [{ createdAt: "desc" }],
      take: 2000,
    });

    const escapeCsv = (v) => {
      const s = String(v ?? "");
      if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
        return `"${s.replace(/\"/g, "\"\"")}"`;
      }
      return s;
    };

    const header = [
      "id",
      "title",
      "status",
      "priority",
      "channel",
      "reason",
      "sla_breached",
      "sla_resolution_due_at",
      "customer",
      "order_number",
      "assigned_to",
      "created_at",
    ];
    const lines = [header.join(",")];
    for (const t of rows) {
      lines.push(
        [
          t.id,
          t.title,
          t.status,
          t.priority,
          t.channel || "",
          t.reason || "",
          t.slaBreached ? "1" : "0",
          t.slaResolutionDueAt ? t.slaResolutionDueAt.toISOString() : "",
          t.customer?.fullName || t.customer?.email || "",
          t.order?.orderNumber || "",
          t.assignedTo?.fullName || t.assignedTo?.email || "",
          t.createdAt.toISOString(),
        ]
          .map(escapeCsv)
          .join(",")
      );
    }

    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=\"support_tickets_${stamp}.csv\"`);
    return res.send(lines.join("\n"));
  } catch (err) {
    console.error("GET /support/tickets/export error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/support/tickets/:ticketId", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { ticketId } = req.params;
    const storeId = String(req.query.storeId || "").trim();
    if (!storeId) return res.status(400).json({ error: "Missing storeId" });

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const canWrite = await canManageSupport(userId, storeId, membership.roleKey);
    if (!canWrite) return res.status(403).json({ error: "No permission to read support tickets" });

    await syncSupportSlaBreaches(storeId, userId);

    const ticket = await prisma.supportTicket.findFirst({
      where: { id: ticketId, storeId },
      include: {
        customer: { select: { id: true, fullName: true, email: true, country: true, city: true } },
        order: { select: { id: true, orderNumber: true, status: true, paymentStatus: true, orderedAt: true } },
        assignedTo: { select: { id: true, fullName: true, email: true } },
        createdBy: { select: { id: true, fullName: true, email: true } },
        notes: {
          include: {
            user: { select: { id: true, fullName: true, email: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    const timeline = [
      { type: "created", at: ticket.createdAt, label: "Ticket creado" },
      ...(ticket.firstResponseAt ? [{ type: "first_response", at: ticket.firstResponseAt, label: "Primera respuesta registrada" }] : []),
      ...(ticket.slaBreachedAt ? [{ type: "sla_breached", at: ticket.slaBreachedAt, label: "SLA vencido" }] : []),
      ...(ticket.resolvedAt ? [{ type: "resolved", at: ticket.resolvedAt, label: "Ticket resuelto" }] : []),
      ...(ticket.closedAt ? [{ type: "closed", at: ticket.closedAt, label: "Ticket cerrado" }] : []),
      ...ticket.notes.map((n) => ({
        type: "note",
        at: n.createdAt,
        label: `Nota interna por ${n.user?.fullName || "usuario"}`,
        noteId: n.id,
      })),
    ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

    return res.json({ ticket, timeline });
  } catch (err) {
    console.error("GET /support/tickets/:ticketId error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.post("/support/tickets", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { storeId, customerId, orderId, title, description, channel, reason, priority, assignedToUserId, dueAt } = req.body || {};
    if (!storeId || !title) return res.status(400).json({ error: "Missing storeId/title" });

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const canWrite = await canManageSupport(userId, storeId, membership.roleKey);
    if (!canWrite) return res.status(403).json({ error: "No permission to create support tickets" });

    const normalizedPriority = priority || "medium";
    if (!SUPPORT_TICKET_PRIORITIES.has(normalizedPriority)) return res.status(400).json({ error: "Invalid priority" });

    if (customerId) {
      const customer = await prisma.customer.findFirst({ where: { id: customerId, storeId }, select: { id: true } });
      if (!customer) return res.status(400).json({ error: "Invalid customerId for store" });
    }
    if (orderId) {
      const order = await prisma.salesOrder.findFirst({ where: { id: orderId, storeId }, select: { id: true } });
      if (!order) return res.status(400).json({ error: "Invalid orderId for store" });
    }
    if (assignedToUserId) {
      const assignee = await prisma.userStoreMembership.findFirst({ where: { storeId, userId: assignedToUserId }, select: { userId: true } });
      if (!assignee) return res.status(400).json({ error: "Invalid assignedToUserId for store" });
    }

    const parsedDueAt = dueAt ? parseDateInput(dueAt) : null;
    if (dueAt && !parsedDueAt) return res.status(400).json({ error: "Invalid dueAt" });
    const slaDates = computeSupportSlaDates(normalizedPriority, new Date());

    const ticket = await prisma.supportTicket.create({
      data: {
        storeId,
        customerId: customerId || null,
        orderId: orderId || null,
        title: String(title).trim(),
        description: description || null,
        channel: channel || null,
        reason: reason || null,
        priority: normalizedPriority,
        dueAt: parsedDueAt,
        slaFirstResponseDueAt: slaDates.slaFirstResponseDueAt,
        slaResolutionDueAt: slaDates.slaResolutionDueAt,
        slaBreached: false,
        slaBreachedAt: null,
        slaBreachNotifiedAt: null,
        assignedToUserId: assignedToUserId || null,
        createdByUserId: userId,
      },
      include: {
        customer: { select: { id: true, fullName: true, email: true } },
        order: { select: { id: true, orderNumber: true } },
        assignedTo: { select: { id: true, fullName: true, email: true } },
        createdBy: { select: { id: true, fullName: true, email: true } },
      },
    });

    if (ticket.assignedTo?.id && ticket.assignedTo.id !== userId) {
      await createNotificationSafe({
        storeId,
        userId: ticket.assignedTo.id,
        type: "system",
        severity: ticket.priority === "urgent" || ticket.priority === "high" ? "warning" : "info",
        title: `Nuevo ticket asignado: ${ticket.title}`,
        body: ticket.description || null,
        linkedEntityType: "support_ticket",
        linkedEntityId: ticket.id,
        createdByUserId: userId,
      });
    }

    await createAuditLogSafe({
      storeId,
      userId,
      action: "support.ticket.created",
      entityType: "support_ticket",
      entityId: ticket.id,
      message: `Support ticket created: ${ticket.title}`,
      payload: {
        priority: ticket.priority,
        status: ticket.status,
        assignedToUserId: ticket.assignedTo?.id || null,
      },
    });

    return res.status(201).json({ ticket });
  } catch (err) {
    console.error("POST /support/tickets error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.patch("/support/tickets/:ticketId", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { ticketId } = req.params;
    const { storeId, status, priority, assignedToUserId, dueAt, resolutionNote, firstResponseAt } = req.body || {};
    if (!storeId) return res.status(400).json({ error: "Missing storeId" });

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const canWrite = await canManageSupport(userId, storeId, membership.roleKey);
    if (!canWrite) return res.status(403).json({ error: "No permission to update support tickets" });

    const existing = await prisma.supportTicket.findFirst({
      where: { id: ticketId, storeId },
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        dueAt: true,
        resolutionNote: true,
        firstResponseAt: true,
        createdAt: true,
        resolvedAt: true,
        closedAt: true,
        slaResolutionDueAt: true,
        assignedToUserId: true,
        slaBreached: true,
      },
    });
    if (!existing) return res.status(404).json({ error: "Ticket not found" });

    if (status && !SUPPORT_TICKET_STATUSES.has(String(status))) return res.status(400).json({ error: "Invalid status" });
    if (priority && !SUPPORT_TICKET_PRIORITIES.has(String(priority))) return res.status(400).json({ error: "Invalid priority" });

    let assigneeId = undefined;
    if (assignedToUserId !== undefined) {
      if (!assignedToUserId) {
        assigneeId = null;
      } else {
        const assignee = await prisma.userStoreMembership.findFirst({
          where: { storeId, userId: assignedToUserId },
          select: { userId: true },
        });
        if (!assignee) return res.status(400).json({ error: "Invalid assignedToUserId for store" });
        assigneeId = assignee.userId;
      }
    }

    const parsedDueAt = dueAt === undefined ? undefined : dueAt ? parseDateInput(dueAt) : null;
    if (dueAt && !parsedDueAt) return res.status(400).json({ error: "Invalid dueAt" });
    const parsedFirstResponseAt =
      firstResponseAt === undefined ? undefined : firstResponseAt ? parseDateInput(firstResponseAt) : null;
    if (firstResponseAt && !parsedFirstResponseAt) return res.status(400).json({ error: "Invalid firstResponseAt" });

    const nextStatus = status || existing.status;
    const nextPriority = priority || undefined;
    const nextFirstResponseAt =
      parsedFirstResponseAt !== undefined
        ? parsedFirstResponseAt
        : existing.firstResponseAt || (nextStatus !== "open" ? new Date() : undefined);

    const priorityForSla = nextPriority || undefined;
    const recomputedSla = priorityForSla ? computeSupportSlaDates(priorityForSla, existing.createdAt) : null;
    const resolutionDueAt = recomputedSla ? recomputedSla.slaResolutionDueAt : existing.slaResolutionDueAt;
    const now = new Date();
    const shouldBeBreached = Boolean(
      !isSupportTerminalStatus(nextStatus) && resolutionDueAt && new Date(resolutionDueAt).getTime() < now.getTime()
    );
    const ticket = await prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        ...(status ? { status } : {}),
        ...(priority ? { priority } : {}),
        ...(assignedToUserId !== undefined ? { assignedToUserId: assigneeId } : {}),
        ...(parsedDueAt !== undefined ? { dueAt: parsedDueAt } : {}),
        ...(resolutionNote !== undefined ? { resolutionNote: resolutionNote || null } : {}),
        ...(nextFirstResponseAt !== undefined ? { firstResponseAt: nextFirstResponseAt } : {}),
        ...(recomputedSla ? { slaFirstResponseDueAt: recomputedSla.slaFirstResponseDueAt, slaResolutionDueAt: recomputedSla.slaResolutionDueAt } : {}),
        ...(shouldBeBreached ? { slaBreached: true, slaBreachedAt: now } : {}),
        ...(isSupportTerminalStatus(nextStatus) ? { slaBreached: existing.slaBreached || shouldBeBreached } : {}),
        ...(nextStatus === "resolved" ? { resolvedAt: new Date() } : {}),
        ...(nextStatus === "closed" ? { closedAt: new Date() } : {}),
      },
      include: {
        customer: { select: { id: true, fullName: true, email: true } },
        order: { select: { id: true, orderNumber: true } },
        assignedTo: { select: { id: true, fullName: true, email: true } },
        createdBy: { select: { id: true, fullName: true, email: true } },
      },
    });

    const beforeTicket = {
      status: existing.status,
      priority: existing.priority,
      dueAt: existing.dueAt,
      assignedToUserId: existing.assignedToUserId,
      resolutionNote: existing.resolutionNote,
      firstResponseAt: existing.firstResponseAt,
      slaBreached: existing.slaBreached,
      resolvedAt: existing.resolvedAt,
      closedAt: existing.closedAt,
    };
    const afterTicket = {
      status: ticket.status,
      priority: ticket.priority,
      dueAt: ticket.dueAt,
      assignedToUserId: ticket.assignedToUserId,
      resolutionNote: ticket.resolutionNote,
      firstResponseAt: ticket.firstResponseAt,
      slaBreached: ticket.slaBreached,
      resolvedAt: ticket.resolvedAt,
      closedAt: ticket.closedAt,
    };
    const changes = buildFieldChanges(beforeTicket, afterTicket, [
      "status",
      "priority",
      "dueAt",
      "assignedToUserId",
      "resolutionNote",
      "firstResponseAt",
      "slaBreached",
      "resolvedAt",
      "closedAt",
    ]);

    if (shouldBeBreached && !existing.assignedToUserId) {
      await createNotificationSafe({
        storeId,
        type: "system",
        severity: "critical",
        title: `SLA vencido: ${existing.title}`,
        body: "El ticket superó el tiempo objetivo de resolución.",
        linkedEntityType: "support_ticket",
        linkedEntityId: existing.id,
        createdByUserId: userId,
      });
    }

    await createAuditLogSafe({
      storeId,
      userId,
      action: "support.ticket.updated",
      entityType: "support_ticket",
      entityId: ticket.id,
      message: `Support ticket updated: ${ticket.title}`,
      payload: {
        before: beforeTicket,
        after: afterTicket,
        changes,
      },
    });

    return res.json({ ticket });
  } catch (err) {
    console.error("PATCH /support/tickets/:ticketId error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.post("/support/tickets/:ticketId/notes", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { ticketId } = req.params;
    const { storeId, body } = req.body || {};
    if (!storeId || !body || String(body).trim().length < 2) {
      return res.status(400).json({ error: "Missing storeId/body" });
    }

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const canWrite = await canManageSupport(userId, storeId, membership.roleKey);
    if (!canWrite) return res.status(403).json({ error: "No permission to write support notes" });

    const ticket = await prisma.supportTicket.findFirst({
      where: { id: ticketId, storeId },
      select: { id: true, title: true, assignedToUserId: true },
    });
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    const note = await prisma.supportTicketNote.create({
      data: {
        ticketId: ticket.id,
        userId,
        body: String(body).trim(),
      },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
      },
    });

    if (ticket.assignedToUserId && ticket.assignedToUserId !== userId) {
      await createNotificationSafe({
        storeId,
        userId: ticket.assignedToUserId,
        type: "system",
        severity: "info",
        title: `Nueva nota en ticket: ${ticket.title}`,
        body: String(body).trim().slice(0, 180),
        linkedEntityType: "support_ticket",
        linkedEntityId: ticket.id,
        createdByUserId: userId,
      });
    }

    await createAuditLogSafe({
      storeId,
      userId,
      action: "support.note.created",
      entityType: "support_ticket",
      entityId: ticket.id,
      message: `Support note added to ticket: ${ticket.title}`,
      payload: { noteId: note.id, bodyPreview: String(body).trim().slice(0, 120) },
    });

    return res.status(201).json({ note });
  } catch (err) {
    console.error("POST /support/tickets/:ticketId/notes error:", err);
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

    await createAuditLogSafe({
      storeId,
      userId,
      action: "task.created",
      entityType: "team_task",
      entityId: task.id,
      message: `Task created: ${task.title}`,
      payload: {
        priority: task.priority,
        status: task.status,
        assignedToUserId: task.assignedTo?.id || null,
      },
    });

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
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        dueAt: true,
        assignedToUserId: true,
        closedAt: true,
      },
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

    const beforeTask = {
      title: existing.title,
      description: existing.description,
      status: existing.status,
      priority: existing.priority,
      dueAt: existing.dueAt,
      assignedToUserId: existing.assignedToUserId,
      closedAt: existing.closedAt,
    };
    const afterTask = {
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      dueAt: task.dueAt,
      assignedToUserId: task.assignedToUserId,
      closedAt: task.closedAt,
    };
    const changes = buildFieldChanges(beforeTask, afterTask, [
      "title",
      "description",
      "status",
      "priority",
      "dueAt",
      "assignedToUserId",
      "closedAt",
    ]);

    await createAuditLogSafe({
      storeId,
      userId,
      action: "task.updated",
      entityType: "team_task",
      entityId: task.id,
      message: `Task updated: ${task.title}`,
      payload: {
        before: beforeTask,
        after: afterTask,
        changes,
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

    await createAuditLogSafe({
      storeId,
      userId,
      action: "order.created",
      entityType: "sales_order",
      entityId: order.id,
      message: `Order created: ${order.orderNumber}`,
      payload: {
        status: order.status,
        paymentStatus: order.paymentStatus,
        itemCount: Array.isArray(order.items) ? order.items.length : 0,
        backorderCount: Array.isArray(order.backorders) ? order.backorders.length : 0,
      },
    });

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

    const beforeOrder = {
      status: order.status,
      paymentStatus: order.paymentStatus,
    };
    const afterOrder = {
      status: updated.status,
      paymentStatus: updated.paymentStatus,
    };
    const changes = buildFieldChanges(beforeOrder, afterOrder, ["status", "paymentStatus"]);

    await createAuditLogSafe({
      storeId,
      userId,
      action: "order.status.updated",
      entityType: "sales_order",
      entityId: updated.id,
      message: "Order status/payment updated",
      payload: {
        before: beforeOrder,
        after: afterOrder,
        changes,
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
    const canAnalytics = await canReadAnalytics(userId, storeId, membership.roleKey);
    const canSensitive = await canReadSensitive(userId, storeId, membership.roleKey);
    if (!canAnalytics) {
      await createAuditLogSafe({
        storeId,
        userId,
        action: "access.denied",
        entityType: "analytics",
        message: "Denied analytics summary read",
      });
      return res.status(403).json({ error: "No permission to read analytics" });
    }
    if (canSensitive) {
      await createSensitiveReadAuditSafe({
        storeId,
        userId,
        entityType: "analytics",
        message: "Read analytics summary (financial)",
        payload: { dateFrom: req.query.dateFrom || null, dateTo: req.query.dateTo || null },
      });
    } else {
      await createAuditLogSafe({
        storeId,
        userId,
        action: "analytics.read",
        entityType: "analytics",
        message: "Read analytics summary (non-financial)",
      });
    }

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
        revenueEur: canSensitive ? salesRevenueEur : null,
        cogsEur: canSensitive ? salesCogsEur : null,
        profitEur: canSensitive ? salesProfitEur : null,
      },
      payouts: {
        payoutsCount: canSensitive ? payouts.length : null,
        grossEur: canSensitive ? payoutGrossEur : null,
        netExpectedEur: canSensitive ? payoutNetExpectedEur : null,
        reconciledEur: canSensitive ? payoutReconciledEur : null,
        discrepancyEur: canSensitive ? roundMoney(payoutNetExpectedEur - payoutReconciledEur) : null,
      },
      returns: {
        casesCount: returns.length,
        totalCostEur: canSensitive ? returnCostEur : null,
      },
      inventory: {
        stockLots: lots.length,
        valueEur: canSensitive ? inventoryValueEur : null,
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
    const canAnalytics = await canReadAnalytics(userId, storeId, membership.roleKey);
    const canSensitive = await canReadSensitive(userId, storeId, membership.roleKey);
    if (!canAnalytics) {
      await createAuditLogSafe({
        storeId,
        userId,
        action: "access.denied",
        entityType: "analytics",
        message: "Denied analytics channels read",
      });
      return res.status(403).json({ error: "No permission to read analytics" });
    }
    if (canSensitive) {
      await createSensitiveReadAuditSafe({
        storeId,
        userId,
        entityType: "analytics",
        message: "Read analytics channels (financial)",
        payload: { dateFrom: req.query.dateFrom || null, dateTo: req.query.dateTo || null },
      });
    } else {
      await createAuditLogSafe({
        storeId,
        userId,
        action: "analytics.read",
        entityType: "analytics",
        message: "Read analytics channels (non-financial)",
      });
    }

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
          revenueEur: canSensitive ? roundMoney(r.revenueEur) : null,
          profitEur: canSensitive ? roundMoney(r.profitEur) : null,
          returnRatePct: r.orders ? roundMoney((r.returns / r.orders) * 100) : 0,
        }))
        .sort((a, b) => b.orders - a.orders),
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
    const canAnalytics = await canReadAnalytics(userId, storeId, membership.roleKey);
    const canSensitive = await canReadSensitive(userId, storeId, membership.roleKey);
    if (!canAnalytics) {
      await createAuditLogSafe({
        storeId,
        userId,
        action: "access.denied",
        entityType: "analytics",
        message: "Denied analytics countries read",
      });
      return res.status(403).json({ error: "No permission to read analytics" });
    }
    if (canSensitive) {
      await createSensitiveReadAuditSafe({
        storeId,
        userId,
        entityType: "analytics",
        message: "Read analytics countries (financial)",
        payload: { dateFrom: req.query.dateFrom || null, dateTo: req.query.dateTo || null },
      });
    } else {
      await createAuditLogSafe({
        storeId,
        userId,
        action: "analytics.read",
        entityType: "analytics",
        message: "Read analytics countries (non-financial)",
      });
    }

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
          revenueEur: canSensitive ? roundMoney(r.revenueEur) : null,
          profitEur: canSensitive ? roundMoney(r.profitEur) : null,
          returnRatePct: r.orders ? roundMoney((r.returns / r.orders) * 100) : 0,
        }))
        .sort((a, b) => b.orders - a.orders),
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

    await createAuditLogSafe({
      storeId,
      userId,
      action: "return.processed",
      entityType: "return_case",
      entityId: result.id,
      message: `Return processed (${result.decision})`,
      payload: {
        decision: result.decision,
        quantity: result.quantity,
        trackingCode: result.trackingCode || null,
      },
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

app.get("/audit/retention/policy", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const storeId = String(req.query.storeId || "").trim();
    if (!storeId) return res.status(400).json({ error: "Missing storeId" });

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });

    const [canSensitive, canSettings] = await Promise.all([
      canReadSensitive(userId, storeId, membership.roleKey),
      canManageSettings(userId, storeId, membership.roleKey),
    ]);
    if (!canSensitive || !canSettings) {
      await createAuditLogSafe({
        storeId,
        userId,
        action: "access.denied",
        entityType: "audit_policy",
        message: "Denied audit retention policy read",
      });
      return res.status(403).json({ error: "No permission to read audit retention policy" });
    }

    const now = new Date();
    const minRetentionDays = Math.min(
      AUDIT_RETENTION_POLICY.securityDays,
      AUDIT_RETENTION_POLICY.operationalDays,
      AUDIT_RETENTION_POLICY.readDays,
      AUDIT_RETENTION_POLICY.defaultDays
    );
    const fetchSince = subtractDays(now, minRetentionDays);
    const rows = await prisma.auditLog.findMany({
      where: { storeId, createdAt: { lt: fetchSince } },
      select: { id: true, action: true, entityType: true, createdAt: true },
      orderBy: { createdAt: "asc" },
      take: 50000,
    });

    const counts = {
      scanned: rows.length,
      candidateDelete: 0,
      byBucket: { security: 0, operational: 0, read: 0, default: 0 },
    };

    for (const row of rows) {
      const r = evaluateAuditRetention(row, now);
      if (r.shouldDelete) {
        counts.candidateDelete += 1;
        counts.byBucket[r.bucket] = (counts.byBucket[r.bucket] || 0) + 1;
      }
    }

    await createSensitiveReadAuditSafe({
      storeId,
      userId,
      entityType: "audit_policy",
      message: "Read audit retention policy preview",
      payload: counts,
    });

    return res.json({
      policy: AUDIT_RETENTION_POLICY,
      limits: { maxScanned: 50000 },
      preview: counts,
      generatedAt: now.toISOString(),
    });
  } catch (err) {
    console.error("GET /audit/retention/policy error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.post("/audit/retention/run", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const storeId = String(req.body.storeId || "").trim();
    const dryRun = req.body.dryRun !== false;
    const maxDeleteRaw = Number(req.body.maxDelete || 5000);
    const maxDelete = Math.max(1, Math.min(50000, Number.isFinite(maxDeleteRaw) ? Math.floor(maxDeleteRaw) : 5000));
    if (!storeId) return res.status(400).json({ error: "Missing storeId" });

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });

    const [canSensitive, canSettings] = await Promise.all([
      canReadSensitive(userId, storeId, membership.roleKey),
      canManageSettings(userId, storeId, membership.roleKey),
    ]);
    if (!canSensitive || !canSettings) {
      await createAuditLogSafe({
        storeId,
        userId,
        action: "access.denied",
        entityType: "audit_policy",
        message: "Denied audit retention run",
      });
      return res.status(403).json({ error: "No permission to run audit retention" });
    }

    const now = new Date();
    const minRetentionDays = Math.min(
      AUDIT_RETENTION_POLICY.securityDays,
      AUDIT_RETENTION_POLICY.operationalDays,
      AUDIT_RETENTION_POLICY.readDays,
      AUDIT_RETENTION_POLICY.defaultDays
    );
    const fetchSince = subtractDays(now, minRetentionDays);
    const rows = await prisma.auditLog.findMany({
      where: { storeId, createdAt: { lt: fetchSince } },
      select: { id: true, action: true, entityType: true, createdAt: true },
      orderBy: { createdAt: "asc" },
      take: 50000,
    });

    const candidateIds = [];
    const byBucket = { security: 0, operational: 0, read: 0, default: 0 };
    for (const row of rows) {
      const r = evaluateAuditRetention(row, now);
      if (r.shouldDelete) {
        candidateIds.push(row.id);
        byBucket[r.bucket] = (byBucket[r.bucket] || 0) + 1;
      }
    }

    const idsToDelete = candidateIds.slice(0, maxDelete);
    let deleted = 0;
    if (!dryRun && idsToDelete.length > 0) {
      const result = await prisma.auditLog.deleteMany({
        where: { id: { in: idsToDelete } },
      });
      deleted = result.count;
    }

    await createAuditLogSafe({
      storeId,
      userId,
      action: "audit.retention.run",
      entityType: "audit_log",
      message: dryRun ? "Audit retention dry-run executed" : "Audit retention deletion executed",
      payload: {
        dryRun,
        scanned: rows.length,
        candidateDelete: candidateIds.length,
        requestedDelete: idsToDelete.length,
        deleted,
        maxDelete,
        byBucket,
      },
    });

    return res.json({
      ok: true,
      dryRun,
      policy: AUDIT_RETENTION_POLICY,
      scanned: rows.length,
      candidateDelete: candidateIds.length,
      requestedDelete: idsToDelete.length,
      deleted,
      maxDelete,
      byBucket,
      generatedAt: now.toISOString(),
    });
  } catch (err) {
    console.error("POST /audit/retention/run error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/audit/integrity/verify", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const storeId = String(req.query.storeId || "").trim();
    const dateFrom = String(req.query.dateFrom || "").trim();
    const dateTo = String(req.query.dateTo || "").trim();
    const limitRaw = Number(req.query.limit || 2000);
    const limit = Math.max(1, Math.min(5000, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 2000));
    if (!storeId) return res.status(400).json({ error: "Missing storeId" });

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const [canSensitive, canSettings] = await Promise.all([
      canReadSensitive(userId, storeId, membership.roleKey),
      canManageSettings(userId, storeId, membership.roleKey),
    ]);
    if (!canSensitive || !canSettings) {
      await createAuditLogSafe({
        storeId,
        userId,
        action: "access.denied",
        entityType: "audit_integrity",
        message: "Denied audit integrity verify",
      });
      return res.status(403).json({ error: "No permission to verify audit integrity" });
    }

    const parsedFrom = dateFrom ? parseDateInput(dateFrom) : null;
    const parsedTo = dateTo ? parseDateInput(dateTo) : null;
    if (dateFrom && !parsedFrom) return res.status(400).json({ error: "Invalid dateFrom" });
    if (dateTo && !parsedTo) return res.status(400).json({ error: "Invalid dateTo" });
    const verify = await verifyAuditLogsIntegrityInternal(storeId, {
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
      limit,
    });

    await createSensitiveReadAuditSafe({
      storeId,
      userId,
      entityType: "audit_integrity",
      message: "Verify audit hash chain",
      payload: {
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
        limit,
        scanned: verify.scanned,
        verifiedRows: verify.verifiedRows,
        legacyRows: verify.legacyRows,
        mismatches: verify.mismatches.length,
      },
    });

    return res.json({
      ok: verify.ok,
      scanned: verify.scanned,
      verifiedRows: verify.verifiedRows,
      legacyRows: verify.legacyRows,
      mismatches: verify.mismatches.length,
      sampleMismatches: verify.mismatches.slice(0, 30),
      anchor: { previousHash: verify.anchorPrevHash },
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("GET /audit/integrity/verify error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/audit/integrity/anchors", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const storeId = String(req.query.storeId || "").trim();
    const limitRaw = Number(req.query.limit || 90);
    const limit = Math.max(1, Math.min(365, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 90));
    if (!storeId) return res.status(400).json({ error: "Missing storeId" });

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const [canSensitive, canSettings] = await Promise.all([
      canReadSensitive(userId, storeId, membership.roleKey),
      canManageSettings(userId, storeId, membership.roleKey),
    ]);
    if (!canSensitive || !canSettings) {
      return res.status(403).json({ error: "No permission to read audit anchors" });
    }

    const anchors = await prisma.auditAnchor.findMany({
      where: { storeId },
      include: { createdBy: { select: { id: true, fullName: true, email: true } } },
      orderBy: [{ anchorDay: "desc" }, { createdAt: "desc" }],
      take: limit,
    });

    return res.json({
      anchors: anchors.map((a) => ({
        id: a.id,
        anchorDay: a.anchorDay,
        periodStart: a.periodStart.toISOString(),
        periodEnd: a.periodEnd.toISOString(),
        eventCount: a.eventCount,
        lastAuditLogId: a.lastAuditLogId,
        lastHash: a.lastHash,
        hashAlgo: a.hashAlgo,
        prevAnchorHash: a.prevAnchorHash,
        anchorHash: a.anchorHash,
        signature: a.signature,
        createdAt: a.createdAt.toISOString(),
        createdBy: a.createdBy ? { id: a.createdBy.id, fullName: a.createdBy.fullName, email: a.createdBy.email } : null,
      })),
    });
  } catch (err) {
    console.error("GET /audit/integrity/anchors error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.post("/audit/integrity/anchor-seal", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const storeId = String(req.body.storeId || "").trim();
    const requestedDay = String(req.body.anchorDay || "").trim();
    if (!storeId) return res.status(400).json({ error: "Missing storeId" });

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const [canSensitive, canSettings] = await Promise.all([
      canReadSensitive(userId, storeId, membership.roleKey),
      canManageSettings(userId, storeId, membership.roleKey),
    ]);
    if (!canSensitive || !canSettings) {
      await createAuditLogSafe({
        storeId,
        userId,
        action: "access.denied",
        entityType: "audit_anchor",
        message: "Denied audit anchor seal",
      });
      return res.status(403).json({ error: "No permission to seal audit anchor" });
    }

    const targetDay = requestedDay || toUtcDayString(new Date());
    if (!parseAnchorDay(targetDay)) return res.status(400).json({ error: "Invalid anchorDay (expected YYYY-MM-DD)" });
    const { reused, anchor } = await sealAuditAnchorForDay(storeId, userId, targetDay);

    return res.json({
      ok: true,
      reused,
      anchor: {
        id: anchor.id,
        anchorDay: anchor.anchorDay,
        eventCount: anchor.eventCount,
        anchorHash: anchor.anchorHash,
        signature: anchor.signature,
        createdAt: anchor.createdAt.toISOString(),
      },
    });
  } catch (err) {
    console.error("POST /audit/integrity/anchor-seal error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/audit/integrity/anchors/verify", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const storeId = String(req.query.storeId || "").trim();
    const limitRaw = Number(req.query.limit || 365);
    const limit = Math.max(1, Math.min(1000, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 365));
    if (!storeId) return res.status(400).json({ error: "Missing storeId" });

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const [canSensitive, canSettings] = await Promise.all([
      canReadSensitive(userId, storeId, membership.roleKey),
      canManageSettings(userId, storeId, membership.roleKey),
    ]);
    if (!canSensitive || !canSettings) {
      return res.status(403).json({ error: "No permission to verify audit anchors" });
    }

    const verify = await verifyAuditAnchorsInternal(storeId, limit);

    await createSensitiveReadAuditSafe({
      storeId,
      userId,
      entityType: "audit_anchor",
      message: "Verify audit anchors chain",
      payload: {
        scanned: verify.scanned,
        mismatches: verify.mismatches.length,
      },
    });

    return res.json({
      ok: verify.ok,
      scanned: verify.scanned,
      mismatches: verify.mismatches.length,
      sampleMismatches: verify.mismatches.slice(0, 30),
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("GET /audit/integrity/anchors/verify error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/audit/job/status", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const storeId = String(req.query.storeId || "").trim();
    if (!storeId) return res.status(400).json({ error: "Missing storeId" });

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const [canSensitive, canSettings] = await Promise.all([
      canReadSensitive(userId, storeId, membership.roleKey),
      canManageSettings(userId, storeId, membership.roleKey),
    ]);
    if (!canSensitive || !canSettings) return res.status(403).json({ error: "No permission to read audit job status" });

    return res.json({
      ...auditJobState,
      serverTime: new Date().toISOString(),
    });
  } catch (err) {
    console.error("GET /audit/job/status error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.post("/audit/job/run", requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const storeId = String(req.body.storeId || "").trim();
    if (!storeId) return res.status(400).json({ error: "Missing storeId" });

    const membership = await getStoreMembership(userId, storeId);
    if (!membership) return res.status(403).json({ error: "No access to store" });
    const [canSensitive, canSettings] = await Promise.all([
      canReadSensitive(userId, storeId, membership.roleKey),
      canManageSettings(userId, storeId, membership.roleKey),
    ]);
    if (!canSensitive || !canSettings) return res.status(403).json({ error: "No permission to run audit job" });

    const result = await runAuditAutoJob({ actorUserId: userId, source: "manual" });
    if (!result.ok && result.reason === "already_running") {
      return res.status(409).json({ error: "Audit job already running" });
    }
    if (!result.ok) {
      return res.status(500).json({ error: result.error || "Audit job failed" });
    }

    return res.json({ ok: true, summary: result.summary });
  } catch (err) {
    console.error("POST /audit/job/run error:", err);
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
    if (!canSensitive) {
      await createAuditLogSafe({
        storeId,
        userId,
        action: "access.denied",
        entityType: "payout",
        message: "Denied payouts read",
      });
      return res.status(403).json({ error: "No permission to read payouts" });
    }
    await createSensitiveReadAuditSafe({
      storeId,
      userId,
      entityType: "payout",
      message: "Read payouts list",
      payload: null,
    });

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
    if (!canSensitive) {
      await createAuditLogSafe({
        storeId,
        userId,
        action: "access.denied",
        entityType: "invoice",
        message: "Denied invoices read",
      });
      return res.status(403).json({ error: "No permission to read invoices" });
    }
    await createSensitiveReadAuditSafe({
      storeId,
      userId,
      entityType: "invoice",
      message: "Read invoices list",
      payload: null,
    });

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
    if (!canSensitive) {
      await createAuditLogSafe({
        storeId,
        userId,
        action: "access.denied",
        entityType: "invoice",
        message: "Denied invoice document read",
        payload: { invoiceId },
      });
      return res.status(403).json({ error: "No permission to read invoice documents" });
    }
    await createSensitiveReadAuditSafe({
      storeId,
      userId,
      entityType: "invoice",
      message: "Read invoice document",
      payload: { invoiceId },
    });

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
    if (sensitive) {
      await createSensitiveReadAuditSafe({
        storeId,
        userId,
        entityType: "product",
        message: "Read product sensitive detail",
        payload: { productId },
      });
    }

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

    const movements = product.movements.map((mv) => ({
      id: mv.id,
      storeId: mv.storeId,
      productId: mv.productId,
      lotId: mv.lotId,
      warehouseId: mv.warehouseId,
      movementType: mv.movementType,
      quantity: mv.quantity,
      unitCostEurFrozen: sensitive ? normalizeMoney(mv.unitCostEurFrozen) : null,
      referenceType: mv.referenceType,
      referenceId: mv.referenceId,
      reason: mv.reason,
      createdByUserId: mv.createdByUserId,
      createdAt: mv.createdAt,
      warehouse: mv.warehouse,
      createdBy: mv.createdBy,
    }));

    return res.json({
      product: {
        ...product,
        lots,
        movements,
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
  if (auditJobState.enabled) {
    setTimeout(() => {
      runAuditAutoJob({ source: "startup" }).catch((err) => {
        console.error("Audit auto job startup error:", err);
      });
    }, 10 * 1000);

    setInterval(() => {
      runAuditAutoJob({ source: "auto" }).catch((err) => {
        console.error("Audit auto job interval error:", err);
      });
    }, 15 * 60 * 1000);
  }
});
