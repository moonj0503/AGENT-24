import { useEffect, useRef, useState } from "react";
import {
  publishRawStreamMessage,
  subscribeToRawStream,
  type RawStreamEvent,
} from "./raw-stream-channel.js";
import { applyRawStreamMessage } from "./raw-stream-state.js";

function badgeClass(type: string): string {
  if (type.includes("output_text.delta")) return "text";
  if (type.includes("function_call_arguments")) return "arguments";
  if (type === "tool_call") return "tool-call";
  if (type === "tool_result") return "tool-result";
  if (type.includes("error")) return "error";
  return "lifecycle";
}

export function RawApiStreamWindow() {
  const [events, setEvents] = useState<RawStreamEvent[]>([]);
  const logEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = subscribeToRawStream((message) => {
      setEvents((current) => applyRawStreamMessage(current, message));
    });
    publishRawStreamMessage({ kind: "request_snapshot" });
    return unsubscribe;
  }, []);

  useEffect(() => { logEnd.current?.scrollIntoView({ block: "end" }); }, [events]);

  return <main className="raw-window">
    <header className="raw-stream-heading">
      <div><p className="eyebrow">LIVE DEBUG</p><h1>Raw API Stream</h1></div>
      <button className="button secondary" onClick={() => publishRawStreamMessage({ kind: "clear" })}>로그 지우기</button>
    </header>
    <section className="raw-events" aria-label="Raw API Stream events">
      {events.map((item, index) => <article className="raw-event" key={`${item.occurredAt}-${index}`}>
        <div><time>{new Date(item.occurredAt).toLocaleTimeString()}</time><span className={`raw-badge ${badgeClass(item.type)}`}>{item.type}</span></div>
        <details><summary>JSON payload</summary><pre>{JSON.stringify(item.payload, null, 2)}</pre></details>
      </article>)}
      {!events.length && <p className="raw-empty">Open a chat request in the main window to start streaming events.</p>}
      <div ref={logEnd} />
    </section>
  </main>;
}
