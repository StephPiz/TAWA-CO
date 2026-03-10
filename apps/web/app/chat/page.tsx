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

function inputClass() {
  return "h-11 w-full rounded-full border-none bg-white px-4 text-[14px] text-[#25304F] outline-none shadow-[inset_0_0_0_1px_rgba(18,22,48,0.08)] placeholder:text-[#8B90A0]";
}

function cardClass() {
  return "rounded-2xl bg-white p-4 shadow-[0_10px_30px_rgba(0,0,0,0.08)]";
}

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
      if (!res.ok) return setError(data.error || 'Error loading channels');
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
    if (loading || !storeId) return;
    queueMicrotask(() => {
      void loadChannels();
      void loadMembers();
    });
  }, [loading, storeId, loadChannels, loadMembers]);

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

  function getEntityHref(linkedEntityType: string | null, linkedEntityId: string | null) {
    if (!linkedEntityType || !linkedEntityId) return null;
    if (linkedEntityType === "sales_order") return `/store/orders?q=${encodeURIComponent(linkedEntityId)}`;
    if (linkedEntityType === "purchase_order") return `/store/purchases?q=${encodeURIComponent(linkedEntityId)}`;
    if (linkedEntityType === "return_case") return `/store/returns?q=${encodeURIComponent(linkedEntityId)}`;
    if (linkedEntityType === "product") return `/store/products?q=${encodeURIComponent(linkedEntityId)}`;
    if (linkedEntityType === "support_ticket") return `/store/support/${encodeURIComponent(linkedEntityId)}`;
    if (linkedEntityType === "team_task") return "/store/tasks";
    return null;
  }

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

  if (loading) return <div className="min-h-screen bg-[#E8EAEC] p-6">Cargando...</div>;
  if (permissionsError) return <div className="min-h-screen bg-[#E8EAEC] p-6 text-red-700">{permissionsError}</div>;

  return (
    <div className="min-h-screen bg-[#E8EAEC] p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <Topbar title="Chat interno" storeName={storeName} />
        {error ? <div className="rounded-2xl bg-[#FDECEC] p-3 text-[#B42318]">{error}</div> : null}

        <div className={`${cardClass()} flex flex-wrap items-center gap-3`}>
          <div className="text-[13px] text-[#6E768E]">Canal</div>
          <select className={`${inputClass()} max-w-[280px]`} value={channelId} onChange={(e) => setChannelId(e.target.value)}>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <span className="rounded-full bg-[#F3F5F9] px-3 py-2 text-[12px] text-[#616984]">
            {selectedChannel?.code ? `#${selectedChannel.code}` : "Sin canal"}
          </span>
          <span className="rounded-full bg-[#EEF4FF] px-3 py-2 text-[12px] text-[#3147D4]">
            {messages.length} mensajes
          </span>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className={cardClass()}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-[20px] text-[#141A39]">Conversación</h2>
                <p className="mt-1 text-[13px] text-[#616984]">Mensajes del equipo y enlaces a entidades operativas.</p>
              </div>
            </div>

            <div className="h-[420px] space-y-3 overflow-y-auto rounded-2xl bg-[#F7F9FC] p-4">
              {messages.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#D4D9E4] bg-white p-4 text-sm text-[#6E768E]">Sin mensajes</div>
              ) : (
                messages.map((m) => (
                  <div key={m.id} className="rounded-2xl border border-[#E2E6EF] bg-white p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[13px] text-[#141A39]">
                        <b>{m.user.fullName}</b>
                      </div>
                      <div className="text-[12px] text-[#6E768E]">
                        {new Intl.DateTimeFormat("es-ES", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        }).format(new Date(m.createdAt))}
                      </div>
                    </div>
                    <div className="mt-2 whitespace-pre-wrap text-[14px] text-[#25304F]">{m.body}</div>
                    {m.linkedEntityType && m.linkedEntityId ? (
                      <div className="mt-3 flex items-center gap-2 text-[12px] text-[#3147D4]">
                        <span className="rounded-full bg-[#EEF4FF] px-2.5 py-1">
                          {m.linkedEntityType} #{m.linkedEntityId}
                        </span>
                        {getEntityHref(m.linkedEntityType, m.linkedEntityId) ? (
                          <button
                            className="rounded-full border border-[#D4D9E4] bg-white px-3 py-1 text-[#25304F] hover:bg-[#F7F9FC]"
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

            <form className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5" onSubmit={sendMessage}>
              <input
                className="xl:col-span-2 h-11 rounded-full border-none bg-[#F7F9FC] px-4 text-[14px] text-[#25304F] outline-none shadow-[inset_0_0_0_1px_rgba(18,22,48,0.08)] placeholder:text-[#8B90A0]"
                placeholder="Escribe un mensaje..."
                value={messageBody}
                onChange={(e) => setMessageBody(e.target.value)}
                required
              />
              <input
                className={inputClass()}
                placeholder="Entidad (sales_order, product...)"
                value={linkedEntityType}
                onChange={(e) => setLinkedEntityType(e.target.value)}
              />
              <input
                className={inputClass()}
                placeholder="ID de entidad"
                value={linkedEntityId}
                onChange={(e) => setLinkedEntityId(e.target.value)}
              />
              <button className="h-11 rounded-full bg-[#0B1230] px-4 text-[14px] text-white hover:bg-[#1A2348]" type="submit">
                Enviar
              </button>
              <select
                multiple
                className="md:col-span-2 xl:col-span-5 min-h-[112px] rounded-2xl border-none bg-[#F7F9FC] px-4 py-3 text-[13px] text-[#25304F] outline-none shadow-[inset_0_0_0_1px_rgba(18,22,48,0.08)]"
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
            </form>
          </div>

          <div className="space-y-4">
            <div className={cardClass()}>
              <h2 className="text-[20px] text-[#141A39]">Equipo online</h2>
              <div className="mt-3 space-y-2">
                {members.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[#D4D9E4] bg-[#F7F9FC] p-3 text-[13px] text-[#6E768E]">
                    Sin miembros cargados.
                  </div>
                ) : (
                  members.map((member) => (
                    <div key={member.userId} className="rounded-2xl bg-[#F7F9FC] p-3">
                      <div className="text-[14px] text-[#141A39]">{member.fullName}</div>
                      <div className="mt-1 text-[12px] text-[#6E768E]">{member.roleKey}</div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className={cardClass()}>
              <h2 className="text-[20px] text-[#141A39]">Canales</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {channels.map((channel) => (
                  <button
                    key={`side-channel-${channel.id}`}
                    type="button"
                    onClick={() => setChannelId(channel.id)}
                    className={`rounded-full px-3 py-2 text-[12px] ${
                      channel.id === channelId ? "bg-[#0B1230] text-white" : "bg-[#F3F5F9] text-[#4F5568]"
                    }`}
                  >
                    #{channel.code}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
