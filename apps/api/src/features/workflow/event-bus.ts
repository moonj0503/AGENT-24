import type { AgentEvent } from "@continuity/contracts";

export type SequencedAgentEvent = {
  readonly sequence: number;
  readonly event: AgentEvent;
};

export interface AgentEventPublisher {
  publish(event: AgentEvent): number;
}

export class InMemoryAgentEventBus implements AgentEventPublisher {
  private sequence = 0;
  private readonly history: SequencedAgentEvent[] = [];
  private readonly listeners = new Set<(event: SequencedAgentEvent) => void>();

  publish(event: AgentEvent): number {
    const record = { sequence: ++this.sequence, event };
    this.history.push(record);
    if (this.history.length > 100) this.history.shift();
    for (const listener of this.listeners) listener(record);
    return record.sequence;
  }

  subscribe(afterSequence: number, listener: (event: SequencedAgentEvent) => void): () => void {
    for (const event of this.history) {
      if (event.sequence > afterSequence) listener(event);
    }
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
