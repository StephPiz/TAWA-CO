"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Topbar from "../components/topbar";
import { requireTokenOrRedirect } from "../lib/auth";
import { useStorePermissions } from "../lib/access";

const API_BASE = "http://localhost:3001";

type ChatChannel = {
  id: string;
  code: string;
  name: string;
};

type ChatMessage = {
  id: string;
  body: string;
  linkedEntityType: string | null;
  linkedEntityId: string | null;
  createdAt: string;
  user: { id: string; fullName: string; email: string };
};

type TeamMember = {
  userId: string;
  roleKey: string;
  fullName: string;
  email: string;
  isActive: boolean;
};

export default function ChatPage() {
  const router = useRouter();
  const { loading, storeId, storeName, error: permissionsError } = useStorePermissions();
  const [error, setError] = useState("");
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [channelId, setChannelId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([]);
  const [messageBody, setMessageBody] = useState("");
  const [linkedEntityType, setLinkedEntityType] = useState("");
  const [linkedEntityId, setLinkedEntityId] = useState("");

  const selectedChannel = useMemo(() => channels.find((c) => c.id === channelId) || null, [channels, channelId]);

  const loadChannels = useCallback(async () => {
    const token = requireTokenOrRedirect();
    if (!token || !storeId) return;
    try {
      const qs = new URLSearchParams({ storeId }).toString();
      const res = await fetch(`${API_BASE}/chat/channels?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error || "Error loading channels");
      const nextChannels = data.channels || [];
      setChannels(nextChannels);
      if (!channelId && nextChannels.length > 0) setChannelId(nextChannels[0].id);
    } catch {
      setError("Connection error");
    }
  }, [storeId, channelId]);

  const loadMembers = useCallback(async () => {
    const token = requireTokenOrRedirect();
    if (!token || !storeId) return;
    try {
      const res = await fetch(`${API_BASE}/stores/${encodeURIComponent(storeId)}/team`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error || "Error loading team");
      setMembers((data.members || []).filter((m: TeamMember) => m.isActive));
    } catch {
      setError("Connection error");
    }
  }, [storeId]);

  const loadMessages = useCallback(async () => {
    const token = requireTokenOrRedirect();
    if (!token || !storeId || !channelId) return;
    try {
      const qs = new URLSearchParams({ storeId, channelId, limit: "120" }).toString();
      const res = await fetch(`${API_BASE}/chat/messages?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error || "Error loading messages");
      setMessages(data.messages || []);
    } catch {
      setError("Connection error");
    }
  }, [storeId, channelId]);

  useEffect(() => {
    if (loading) return;
    if (!storeId) return;
    queueMicrotask(() => {
      void loadChannels();
      void loadMembers();
    });
  }, [loading, storeId, loadChannels, loadMembers]);

  function getEntityHref(linkedEntityType: string | null, linkedEntityId: string | null) {
    if (!linkedEntityType || !linkedEntityId) return null;
    if (linkedEntityType === "sales_order") return `/store/orders?q=${encodeURIComponent(linkedEntityId)}`;
    if (linkedEntityType === "purchase_order") return `/store/purchases?q=${encodeURIComponent(linkedEntityId)}`;
    if (linkedEntityType === "return_case") return `/store/returns?q=${encodeURIComponent(linkedEntityId)}`;
    if (linkedEntityType === "product") return `/store/products?q=${encodeURIComponent(linkedEntityId)}`;
    if (linkedEntityType === "team_task") return "/store/tasks";
    return null;
  }

  useEffect(() => {
    if (!storeId || !channelId) return;
    queueMicrotask(() => {
      void loadMessages();
    });
    const timer = setInterval(() => {
      void loadMessages();
    }, 10000);
    return () => clearInterval(timer);
  }, [storeId, channelId, loadMessages]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    const token = requireTokenOrRedirect();
    if (!token || !storeId || !channelId || !messageBody.trim()) return;

    setError("");
    const res = await fetch(`${API_BASE}/chat/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        storeId,
        channelId,
        body: messageBody.trim(),
        linkedEntityType: linkedEntityType || null,
        linkedEntityId: linkedEntityId || null,
        mentionedUserIds,
      }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error || "Cannot send message");

    setMessageBody("");
    setLinkedEntityType("");
    setLinkedEntityId("");
    setMentionedUserIds([]);
    await loadMessages();
  }

  if (loading) return <div className="min-h-screen bg-gray-100 p-6">Cargando...</div>;
  if (permissionsError) return <div className="min-h-screen bg-gray-100 p-6 text-red-700">{permissionsError}</div>;

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <Topbar title="Chat interno" storeName={storeName} />
        {error ? <div className="bg-red-100 text-red-700 p-3 rounded">{error}</div> : null}

        <div className="bg-white p-4 rounded-2xl shadow-md">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Canal</span>
            <select className="border rounded px-3 py-2" value={channelId} onChange={(e) => setChannelId(e.target.value)}>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <span className="text-sm text-gray-500">{selectedChannel?.code ? `#${selectedChannel.code}` : ""}</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-md p-4">
          <div className="h-[380px] overflow-y-auto border rounded p-3 space-y-2 bg-gray-50">
            {messages.length === 0 ? (
              <div className="text-sm text-gray-500">Sin mensajes</div>
            ) : (
              messages.map((m) => (
                <div key={m.id} className="bg-white border rounded p-2">
                  <div className="text-xs text-gray-500">
                    <b>{m.user.fullName}</b> | {new Date(m.createdAt).toISOString().slice(0, 16).replace("T", " ")}
                  </div>
                  <div className="text-sm mt-1 whitespace-pre-wrap">{m.body}</div>
                  {m.linkedEntityType && m.linkedEntityId ? (
                    <div className="text-xs text-blue-700 mt-1">
                      Link: {m.linkedEntityType} #{m.linkedEntityId}
                      {getEntityHref(m.linkedEntityType, m.linkedEntityId) ? (
                        <button
                          className="ml-2 rounded border px-2 py-0.5"
                          onClick={() => router.push(getEntityHref(m.linkedEntityType, m.linkedEntityId) || "/store/chat")}
                        >
                          Abrir
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>

          <form className="mt-3 grid md:grid-cols-6 gap-2" onSubmit={sendMessage}>
            <input
              className="border rounded px-3 py-2 md:col-span-3"
              placeholder="Escribe un mensaje... (puedes mencionar usuarios)"
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
              required
            />
            <select
              multiple
              className="border rounded px-2 py-2 text-sm h-[96px]"
              value={mentionedUserIds}
              onChange={(e) => setMentionedUserIds(Array.from(e.target.selectedOptions).map((o) => o.value))}
              title="Menciones"
            >
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  @{m.fullName} ({m.roleKey})
                </option>
              ))}
            </select>
            <input
              className="border rounded px-3 py-2"
              placeholder="Entity type (order/product)"
              value={linkedEntityType}
              onChange={(e) => setLinkedEntityType(e.target.value)}
            />
            <input
              className="border rounded px-3 py-2"
              placeholder="Entity id"
              value={linkedEntityId}
              onChange={(e) => setLinkedEntityId(e.target.value)}
            />
            <button className="rounded bg-black text-white px-3 py-2" type="submit">Enviar</button>
          </form>
        </div>
      </div>
    </div>
  );
}
