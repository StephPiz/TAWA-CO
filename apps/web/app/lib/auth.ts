export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("accessToken");
}

export function requireTokenOrRedirect(): string | null {
  const token = getToken();
  if (!token) {
    if (typeof window !== "undefined") window.location.href = "/";
    return null;
  }
  return token;
}

export function logout() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("accessToken");
  localStorage.removeItem("user");
  localStorage.removeItem("stores");
  localStorage.removeItem("selectedHoldingId");
  localStorage.removeItem("selectedStoreId");
  window.location.href = "/";
}