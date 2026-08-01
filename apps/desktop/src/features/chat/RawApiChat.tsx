import { FormEvent, useEffect, useRef, useState } from "react";
import { desktopBootstrap } from "../../main.js";

type RawEvent = { occurredAt: string; type: string; payload: unknown };
const badgeClass = (type: string) => type.includes("output_text.delta") ? "text" : type.includes("function_call_arguments") ? "arguments" : type === "tool_call" ? "tool-call" : type === "tool_result" ? "tool-result" : type.includes("error") ? "error" : "lifecycle";

export function RawApiChat() {
  const [message, setMessage] = useState("");
  const [answer, setAnswer] = useState("");
  const [events, setEvents] = useState<RawEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const logEnd = useRef<HTMLDivElement>(null);
  useEffect(() => { logEnd.current?.scrollIntoView({ block: "end" }); }, [events]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const prompt = message.trim();
    if (!prompt || busy) return;
    setBusy(true); setAnswer(""); setMessage("");
    try {
      const response = await fetch(`${desktopBootstrap.apiBaseUrl}/chat/stream`, { method: "POST", headers: { "content-type": "application/json", accept: "text/event-stream" }, body: JSON.stringify({ message: prompt }) });
      if (!response.ok || !response.body) throw new Error(`Chat request failed (${response.status})`);
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
      for (;;) {
        const chunk = await reader.read(); if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const frames = buffer.split("\n\n"); buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const data = frame.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
          if (!data) continue;
          const raw = JSON.parse(data) as RawEvent;
          setEvents((current) => [...current, raw]);
          if (raw.type === "response.output_text.delta" && typeof (raw.payload as { delta?: unknown }).delta === "string") setAnswer((current) => current + (raw.payload as { delta: string }).delta);
        }
      }
    } catch (cause) {
      setEvents((current) => [...current, { occurredAt: new Date().toISOString(), type: "error", payload: { message: cause instanceof Error ? cause.message : String(cause) } }]);
    } finally { setBusy(false); }
  }

  return <section className="chat-layout">
    <div className="chat-main card"><p className="eyebrow">RESPONSES API</p><h2>Ask the agent</h2><div className="chat-answer">{answer || (busy ? "Thinking…" : "Ask about the weather to see function calling in the raw stream.")}</div><form onSubmit={send} className="chat-form"><textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Weather in Seoul?" rows={3} /><button className="button primary" disabled={busy || !message.trim()}>{busy ? "Streaming…" : "Send"}</button></form></div>
    <aside className="raw-stream card" aria-label="Raw API Stream"><div className="raw-stream-heading"><div><p className="eyebrow">LIVE DEBUG</p><h2>Raw API Stream</h2></div><button className="button secondary" onClick={() => setEvents([])}>로그 지우기</button></div><div className="raw-events">{events.map((item, index) => <article className="raw-event" key={`${item.occurredAt}-${index}`}><div><time>{new Date(item.occurredAt).toLocaleTimeString()}</time><span className={`raw-badge ${badgeClass(item.type)}`}>{item.type}</span></div><details><summary>JSON payload</summary><pre>{JSON.stringify(item.payload, null, 2)}</pre></details></article>)}<div ref={logEnd} /></div></aside>
  </section>;
}
