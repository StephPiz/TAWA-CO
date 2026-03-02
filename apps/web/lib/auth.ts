export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("accessToken");
}

export function requireTokenOrRedirect() {
  const token = getToken();
  if (!token) window.location.href = "/";
  return token;
}

export function logout() {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("user");
  localStorage.removeItem("stores");
  localStorage.removeItem("selectedHoldingId");
  localStorage.removeItem("selectedStoreId");
  window.location.href = "/";
}