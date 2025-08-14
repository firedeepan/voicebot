"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type AgentListItem = {
  agent_id: string;
  name: string;
};

type PhoneNumber = {
  phone_number_id: string;
  phone_number: string;
  label?: string;
};

type AgentDetails = {
  agent_id: string;
  name: string;
  conversation_config?: {
    agent?: {
      first_message?: string;
      prompt?: { prompt?: string };
      dynamic_variables?: {
        dynamic_variable_placeholders?: Record<string, string>;
      };
    };
    tts?: {
      voice_id?: string;
    };
  };
  phone_numbers?: PhoneNumber[];
};

type Conversation = {
  conversation_id: string;
  status: string;
  transcript?: Array<{ role: string; message: string | null }>;
  analysis?: { transcript_summary?: string; call_summary_title?: string };
};

export default function Home() {
  const [agents, setAgents] = useState<AgentListItem[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [agentDetails, setAgentDetails] = useState<AgentDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const [firstMessage, setFirstMessage] = useState("");
  const [prompt, setPrompt] = useState("");
  const [dynamicVars, setDynamicVars] = useState<Record<string, string>>({});
  const [voices, setVoices] = useState<Array<{ voice_id: string; name: string; preview_url?: string }>>([]);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>("");
  const [isPreviewing, setIsPreviewing] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [toNumber, setToNumber] = useState("");
  const [agentPhoneNumberId, setAgentPhoneNumberId] = useState("");

  const [conversationId, setConversationId] = useState<string>("");
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [polling, setPolling] = useState(false);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    const loadAgents = async () => {
      setAgentsLoading(true);
      setError("");
      try {
        const res = await fetch("/api/elevenlabs/agents", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Failed to load agents");
        setAgents(data?.agents || []);
      } catch (e: unknown) {
        setError(String(e));
      } finally {
        setAgentsLoading(false);
      }
    };
    loadAgents();
    const loadVoices = async () => {
      setVoicesLoading(true);
      try {
        const res = await fetch("/api/elevenlabs/voices?page_size=100", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Failed to load voices");
        const list = data?.voices || [];
        setVoices(list);
      } catch (e: unknown) {
        // do not block; surface in error area
        setError(String(e));
      } finally {
        setVoicesLoading(false);
      }
    };
    loadVoices();
  }, []);

  useEffect(() => {
    if (!selectedAgentId) return;
    const loadDetails = async () => {
      setDetailsLoading(true);
      setError("");
    try {
        const res = await fetch(`/api/elevenlabs/agents/${selectedAgentId}`, { cache: "no-store" });
        const raw = await res.json();
        if (!res.ok) {
          const msg = typeof raw?.error === "string" ? raw.error : "Failed to load agent details";
          throw new Error(msg);
        }
        const data = raw as AgentDetails;
        setAgentDetails(data);

        const fm = data.conversation_config?.agent?.first_message || "";
        const pr = data.conversation_config?.agent?.prompt?.prompt || "";
        setFirstMessage(fm);
        setPrompt(pr);
        // Prefill variable KEYS from placeholders but leave VALUES empty
        const rawPlaceholders = data.conversation_config?.agent?.dynamic_variables?.dynamic_variable_placeholders || {};
        const emptyVars = Object.fromEntries(
          Object.keys(rawPlaceholders).map((k) => [k, ""])
        );
        setDynamicVars(emptyVars);
        const phoneId = data.phone_numbers && data.phone_numbers[0]?.phone_number_id;
        setAgentPhoneNumberId(phoneId || "");
        const vId = data.conversation_config?.tts?.voice_id || "";
        setSelectedVoiceId(vId);
        // If voice isn't part of shared-voices list, inject a placeholder so it's selectable
        // If voice is not part of the fetched list, fetch its info to get the real name
        if (vId) {
          setSelectedVoiceId(vId);
          try {
            const r = await fetch(`/api/elevenlabs/voices?voice_id=${encodeURIComponent(vId)}`, { cache: "no-store" });
            const j = await r.json();
            const one = (j?.voices || [])[0];
            if (one && one.voice_id) {
              setVoices((prev) => (prev.find((v) => v.voice_id === one.voice_id) ? prev : [one, ...prev]));
            } else {
              setVoices((prev) => (prev.find((v) => v.voice_id === vId) ? prev : [{ voice_id: vId, name: "Unknown voice" }, ...prev]));
            }
          } catch {
            setVoices((prev) => (prev.find((v) => v.voice_id === vId) ? prev : [{ voice_id: vId, name: "Unknown voice" }, ...prev]));
          }
        }
      } catch (e: unknown) {
        setError(String(e));
      } finally {
        setDetailsLoading(false);
      }
    };
    loadDetails();
  }, [selectedAgentId]);

  const handleSave = async () => {
    if (!agentDetails) return;
    setSaveLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/elevenlabs/agents/${agentDetails.agent_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_config: {
            agent: {
              prompt: { prompt },
              first_message: firstMessage,
            },
            tts: selectedVoiceId ? { voice_id: selectedVoiceId } : undefined,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to save agent");
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setSaveLoading(false);
    }
  };

  const handlePreview = () => {
    if (!selectedVoiceId) return;
    const v = voices.find((x) => x.voice_id === selectedVoiceId);
    const url = v?.preview_url;
    if (!url) {
      // try to look up single voice, then play
      (async () => {
        try {
          const r = await fetch(`/api/elevenlabs/voices?voice_id=${encodeURIComponent(selectedVoiceId)}`, { cache: "no-store" });
          const j = await r.json();
          const one = (j?.voices || [])[0];
          if (one?.preview_url) {
            if (audioRef.current) audioRef.current.pause();
            const audio = new Audio(one.preview_url);
            audioRef.current = audio;
            setIsPreviewing(true);
            audio.play().catch(() => setIsPreviewing(false));
            audio.onended = () => setIsPreviewing(false);
            audio.onerror = () => setIsPreviewing(false);
          }
        } catch {
          // ignore
        }
      })();
      return;
    }
    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      const audio = new Audio(url);
      audioRef.current = audio;
      setIsPreviewing(true);
      audio.play().catch(() => setIsPreviewing(false));
      audio.onended = () => setIsPreviewing(false);
      audio.onerror = () => setIsPreviewing(false);
    } catch {
      setIsPreviewing(false);
    }
  };

  const dynamicVarKeys = useMemo(() => Object.keys(dynamicVars), [dynamicVars]);

  const startCall = async () => {
    if (!agentDetails) return;
    setError("");
    try {
      const payload = {
        agent_id: agentDetails.agent_id,
        agent_phone_number_id: agentPhoneNumberId || undefined,
        to_number: toNumber,
        conversation_initiation_client_data: {
          dynamic_variables: dynamicVars,
        },
      };

      const res = await fetch("/api/elevenlabs/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to start call");
      setConversationId(data.conversation_id);
      setConversation(null);
      setPolling(true);
    } catch (e: unknown) {
      setError(String(e));
    }
  };

  useEffect(() => {
    if (!polling || !conversationId) return;
    const poll = async () => {
      try {
        const res = await fetch(`/api/elevenlabs/conversations/${conversationId}`, { cache: "no-store" });
        const data: Conversation = await res.json();
        setConversation(data);
        if (data.status === "done" || data.status === "failed" || data.status === "error") {
          setPolling(false);
        }
      } catch {
        // stop polling on error
        setPolling(false);
      }
    };
    poll();
    pollRef.current = window.setInterval(poll, 3000);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [polling, conversationId]);

  const phoneNumbers = agentDetails?.phone_numbers || [];

  return (
    <div className="min-h-screen pt-8 pb-16 px-6 sm:px-10 max-w-7xl mx-auto text-gray-900">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Voice Agent Console</h1>
        <p className="text-gray-600 mt-1">Manage agents, edit prompts, and run outbound calls.</p>
      </div>

      {error ? (
        <div className="mb-6 rounded-lg bg-red-50 text-red-700 border border-red-200 px-4 py-3">
          {String(error)}
        </div>
      ) : null}

      <div className="mb-8 rounded-2xl border border-gray-200 bg-white shadow-md">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="text-sm font-medium">Select Agent</div>
          <div className="text-xs text-gray-600 mt-1">Pick an agent to view and edit details.</div>
        </div>
        <div className="p-6">
          <div className="flex gap-3 items-center">
            <select
              className="min-w-[320px] rounded-xl border border-gray-300 bg-white text-gray-900 px-3 py-2 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              disabled={agentsLoading}
            >
              <option value="">{agentsLoading ? "Loading..." : "-- Choose an agent --"}</option>
              {agents.map((a) => (
                <option key={a.agent_id} value={a.agent_id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {detailsLoading && (
        <div className="text-sm text-slate-600">Loading agent details...</div>
      )}

      {agentDetails && !detailsLoading && (
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="rounded-2xl border border-gray-200 bg-white shadow-md">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="text-sm font-medium">Agent Details</div>
              <div className="text-xs text-gray-600 mt-1">Update the greeting and prompt.</div>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-[13px] font-medium text-gray-800 mb-1">First Message</label>
                <input
                  className="w-full rounded-xl border border-gray-300 bg-white text-gray-900 px-3 py-2 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-900 placeholder:text-gray-400"
                  value={firstMessage}
                  onChange={(e) => setFirstMessage(e.target.value)}
                  placeholder="Hi {{customer_name}}..., I’m {{agent_name}} from {{company_name}}..."
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-gray-800 mb-1">Prompt</label>
                <textarea
                  className="w-full h-56 rounded-xl border border-gray-300 bg-white text-gray-900 px-3 py-2 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-900 placeholder:text-gray-400"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Write clear speaking instructions, tone, and guardrails..."
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-gray-800 mb-1">Voice</label>
                <div className="flex gap-3 items-center">
                  <select
                    className="min-w-[280px] rounded-xl border border-gray-300 bg-white text-gray-900 px-3 py-2 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    value={selectedVoiceId}
                    onChange={(e) => setSelectedVoiceId(e.target.value)}
                    disabled={voicesLoading}
                  >
                    <option value="">{voicesLoading ? "Loading voices..." : "-- Select a voice --"}</option>
                    {voices.map((v) => (
                      <option key={v.voice_id} value={v.voice_id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handlePreview}
                    disabled={!selectedVoiceId}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-300 bg-white hover:bg-gray-50 text-gray-800 px-4 text-sm font-medium disabled:opacity-60"
                  >
                    {isPreviewing ? "Playing..." : "Preview"}
                  </button>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={saveLoading}
                  className="inline-flex h-10 items-center justify-center rounded-xl bg-black hover:bg-gray-900 text-white px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
                >
                  {saveLoading ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white shadow-md">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="text-sm font-medium">Start Call</div>
              <div className="text-xs text-gray-600 mt-1">Provide a destination number and variables.</div>
            </div>
            <div className="p-6 space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-[13px] font-medium text-gray-800 mb-1">To Number</label>
                  <input
                    className="w-full rounded-xl border border-gray-300 bg-white text-gray-900 px-3 py-2 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-900 placeholder:text-gray-400"
                    placeholder="+1..."
                    value={toNumber}
                    onChange={(e) => setToNumber(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-gray-800 mb-1">Agent Phone Number</label>
                  <select
                    className="w-full rounded-xl border border-gray-300 bg-white text-gray-900 px-3 py-2 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    value={agentPhoneNumberId}
                    onChange={(e) => setAgentPhoneNumberId(e.target.value)}
                  >
                    <option value="">-- Select --</option>
                    {phoneNumbers.map((p) => (
                      <option key={p.phone_number_id} value={p.phone_number_id}>
                        {p.phone_number} {p.label ? `(${p.label})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium mb-2">Dynamic Variables</h3>
                {dynamicVarKeys.length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {dynamicVarKeys.map((k) => (
                      <div key={k} className="flex flex-col">
                        <label className="text-[12px] text-gray-700 mb-1">{k}</label>
                        <input
                          className="rounded-xl border border-gray-300 bg-white text-gray-900 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-900 placeholder:text-gray-400"
                          value={dynamicVars[k] || ""}
                          onChange={(e) => setDynamicVars((prev) => ({ ...prev, [k]: e.target.value }))}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">No dynamic variables configured for this agent.</div>
                )}
              </div>

              <div className="pt-1">
                <button
                  onClick={startCall}
                  className="inline-flex h-10 items-center justify-center rounded-xl bg-black hover:bg-gray-900 text-white px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
                  disabled={!toNumber || !agentPhoneNumberId}
                >
                  Start Call
                </button>
              </div>

              {conversationId && (
                <div className="mt-2 text-sm text-slate-700">Conversation ID: {conversationId}</div>
              )}

              {conversation && (
                <div className="mt-6">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-sm">Status:</span>
                    {(() => {
                      const s = (conversation.status || "").toLowerCase();
                      const styles =
                        s === "done"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : s === "failed" || s === "error"
                          ? "bg-rose-50 text-rose-700 border-rose-200"
                          : "bg-blue-50 text-blue-700 border-blue-200";
                      return (
                        <span className={`inline-block text-xs px-2 py-1 rounded-full border ${styles}`}>
                          {conversation.status}
                        </span>
                      );
                    })()}
                  </div>
                  {conversation.analysis?.call_summary_title && (
                    <div className="text-lg font-medium mb-1">
                      {conversation.analysis.call_summary_title}
                    </div>
                  )}
                  {conversation.analysis?.transcript_summary && (
                    <div className="text-sm text-gray-700 whitespace-pre-wrap">
                      {conversation.analysis.transcript_summary}
                    </div>
                  )}

                  {conversation.transcript && conversation.transcript.length > 0 && (
                    <div className="mt-4 rounded-2xl border border-gray-200">
                      <div className="px-4 py-2 border-b border-gray-200 font-medium">Transcript</div>
                      <div className="p-4 space-y-3 max-h-[460px] overflow-auto">
                        {conversation.transcript.map((t, idx) => {
                          const isAgent = (t.role || "").toLowerCase() === "agent";
                          const bubble = isAgent
                            ? "bg-gray-900 text-white border border-gray-900"
                            : "bg-gray-50 text-gray-900 border border-gray-200";
                          return (
                            <div key={idx}>
                              <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">{t.role}</div>
                              {t.message ? (
                                <div className={`rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${bubble}`}>
                                  {t.message}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
