import { Injectable, Logger, OnApplicationShutdown } from "@nestjs/common";
import { AgentMessageBridgeService } from "../agent/agent-message-bridge.service";

interface RouteParams {
  tenantId: string;
  threadId: string;
  messageText: string | null;
  senderPhoneNumber: string;
  senderDisplayName: string | null;
  patientId: string | null;
  correlationId: string;
}

interface PendingEntry {
  timer: ReturnType<typeof setTimeout>;
  texts: (string | null)[];
  latest: RouteParams;
}

const DEBOUNCE_WINDOW_MS = 5_000;
const MAX_PENDING_KEYS = 2_000;

@Injectable()
export class MessageDebounceService implements OnApplicationShutdown {
  private readonly logger = new Logger(MessageDebounceService.name);
  private readonly pending = new Map<string, PendingEntry>();

  constructor(private readonly agentBridge: AgentMessageBridgeService) {}

  schedule(params: RouteParams): void {
    const key = `${params.tenantId}:${params.senderPhoneNumber}`;
    const existing = this.pending.get(key);

    if (existing) {
      clearTimeout(existing.timer);
      existing.texts.push(params.messageText);
      existing.latest = params;
    } else {
      if (this.pending.size >= MAX_PENDING_KEYS) {
        this.logger.warn(
          `MessageDebounce: max pending keys (${MAX_PENDING_KEYS}) reached — routing immediately`,
        );
        void this.agentBridge.routeInboundMessage(params);
        return;
      }

      this.pending.set(key, {
        timer: null!,
        texts: [params.messageText],
        latest: params,
      });
    }

    const entry = this.pending.get(key)!;
    entry.timer = setTimeout(() => this.flush(key), DEBOUNCE_WINDOW_MS);
  }

  onApplicationShutdown(): void {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
    }

    this.pending.clear();
  }

  private flush(key: string): void {
    const entry = this.pending.get(key);

    if (!entry) return;

    this.pending.delete(key);

    const aggregatedText =
      entry.texts.filter(Boolean).join("\n") || null;

    this.logger.debug(
      `MessageDebounce flush: key=${key} messages=${entry.texts.length}`,
    );

    void this.agentBridge.routeInboundMessage({
      ...entry.latest,
      messageText: aggregatedText,
    });
  }
}
