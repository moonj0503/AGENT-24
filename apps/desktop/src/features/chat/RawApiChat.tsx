import { FormEvent, useEffect, useRef, useState } from "react";
import { desktopBootstrap } from "../../main.js";
import { openRawApiStreamWindow } from "../../lib/tauri.js";
import {
  publishRawStreamMessage,
  subscribeToRawStream,
  type RawStreamEvent,
} from "./raw-stream-channel.js";

export function RawApiChat() {
  const [message, setMessage] = useState("");
  const [answer, setAnswer] = useState("");
  const [events, setEvents] = useState<RawStreamEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [windowError, setWindowError] = useState<string>();
  const eventsRef = useRef<RawStreamEvent[]>([]);
  eventsRef.current = events;

  useEffect(() => subscribeToRawStream((channelMessage) => {
    if (channelMessage.kind === "request_snapshot") {
      publishRawStreamMessage({ kind: "snapshot", events: eventsRef.current });
    }
    if (channelMessage.kind === "clear") setEvents([]);
  }), []);

  function appendEvent(raw: RawStreamEvent): void {
    setEvents((current) => [...current, raw]);
    publishRawStreamMessage({ kind: "event", event: raw });
  }

  async function openRawWindow() {
    setWindowError(undefined);
    try { await openRawApiStreamWindow(); }
    catch (cause) { setWindowError(cause instanceof Error ? cause.message : "Unable to open Raw API Stream window."); }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const prompt = message.trim();
    if (!prompt || busy) return;
    setBusy(true); setAnswer(""); setMessage("");
    try {
      const response = await fetch(`${desktopBootstrap.apiBaseUrl}/chat/stream`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "text/event-stream", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ message: prompt }),
      });
      if (!response.ok || !response.body) throw new Error(`Chat request failed (${response.status})`);
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
      for (;;) {
        const chunk = await reader.read(); if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const frames = buffer.split("\n\n"); buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const data = frame.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
          if (!data) continue;
          const raw = JSON.parse(data) as RawStreamEvent;
          appendEvent(raw);
          if (raw.type === "response.output_text.delta" && typeof (raw.payload as { delta?: unknown }).delta === "string") {
            setAnswer((current) => current + (raw.payload as { delta: string }).delta);
          }
        }
      }
    } catch (cause) {
      appendEvent({ occurredAt: new Date().toISOString(), type: "error", payload: { message: cause instanceof Error ? cause.message : String(cause) } });
    } finally { setBusy(false); }
  }

  return <section className="chat-layout">
    <div className="chat-main card">
      <div className="raw-stream-heading"><div><p className="eyebrow">RESPONSES API</p><h2>Ask the agent</h2></div><button className="button secondary" onClick={() => void openRawWindow()}>Open Raw API Stream</button></div>
      {windowError && <p className="chat-window-error" role="alert">{windowError}</p>}
      <div className="chat-answer">{answer || (busy ? "Thinking…" : "Ask about the weather to see function calling in the Raw API Stream window.")}</div>
      <form onSubmit={send} className="chat-form"><textarea value={message} onChange={(input) => setMessage(input.target.value)} placeholder="Weather in Seoul?" rows={3} /><button className="button primary" disabled={busy || !message.trim()}>{busy ? "Streaming…" : "Send"}</button></form>
    </div>
  </section>;
}
