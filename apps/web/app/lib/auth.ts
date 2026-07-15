function clearSessionStorage() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("accessToken");
  localStorage.removeItem("user");
  localStorage.removeItem("stores");
  localStorage.removeItem("selectedHoldingId");
  localStorage.removeItem("selectedStoreId");
}

function parseJwtPayload(token: string): { exp?: number } | null {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    const decoded = atob(padded);
    return JSON.parse(decoded) as { exp?: number };
  } catch {
    return null;
  }
}

function isTokenExpired(token: string): boolean {
  const payload = parseJwtPayload(token);
  if (!payload || typeof payload.exp !== "number") return true;
  const nowInSeconds = Math.floor(Date.now() / 1000);
  return payload.exp <= nowInSeconds;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  const token = localStorage.getItem("accessToken");
  if (!token) return null;
  if (isTokenExpired(token)) {
    clearSessionStorage();
    return null;
  }
  return token;
}

export function requireTokenOrRedirect(): string | null {
  const token = getToken();
  if (!token) {
    if (typeof window !== "undefined") window.location.href = "/";
    return null;
  }
  return token;
}

export function handleUnauthorized(status: number): boolean {
  if (status !== 401) return false;
  logout();
  return true;
}

export function logout() {
  if (typeof window === "undefined") return;
  clearSessionStorage();
  window.location.href = "/";
}
