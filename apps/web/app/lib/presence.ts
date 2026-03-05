"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { handleUnauthorized, requireTokenOrRedirect } from "./auth";
import { getSelectedStoreId } from "./access";

const API_BASE = "http://localhost:3001";

type PresenceStatus = "online" | "away" | "offline";

export type PresenceRow = {
  id: string;
  userId: string;
  status: PresenceStatus;
  lastSeenAt: string;
  lastEvent: string | null;
  lastPath: string | null;
  user: { id: string; fullName: string; email: string };
};

export function usePresence(lastEventLabel: string) {
  const [presences, setPresences] = useState<PresenceRow[]>([]);
  const [error, setError] = useState("");

  const storeId = useMemo(() => getSelectedStoreId() || "", []);

  const loadPresence = useCallback(async () => {
    const token = requireTokenOrRedirect();
    if (!token || !storeId) return;
    try {
      const qs = new URLSearchParams({ storeId }).toString();
      const res = await fetch(`${API_BASE}/presence?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (handleUnauthorized(res.status)) return;
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Presence error");
        return;
      }
      setPresences(data.presences || []);
    } catch {
      setError("Presence connection error");
    }
  }, [storeId]);

  const heartbeat = useCallback(async () => {
    const token = requireTokenOrRedirect();
    if (!token || !storeId) return;
    try {
      const res = await fetch(`${API_BASE}/presence/heartbeat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          storeId,
          status: "online",
          lastEvent: lastEventLabel,
          lastPath: typeof window !== "undefined" ? window.location.pathname : null,
        }),
      });
      if (handleUnauthorized(res.status)) return;
    } catch {
      // Presence heartbeat is best effort.
    }
  }, [storeId, lastEventLabel]);

  useEffect(() => {
    if (!storeId) return;
    queueMicrotask(() => {
      void heartbeat();
      void loadPresence();
    });

    const heartbeatTimer = setInterval(() => {
      void heartbeat();
    }, 20000);

    const pollTimer = setInterval(() => {
      void loadPresence();
    }, 30000);

    return () => {
      clearInterval(heartbeatTimer);
      clearInterval(pollTimer);
    };
  }, [storeId, heartbeat, loadPresence]);

  const onlineCount = useMemo(() => presences.filter((p) => p.status === "online").length, [presences]);

  return { presences, onlineCount, error, reload: loadPresence };
}
