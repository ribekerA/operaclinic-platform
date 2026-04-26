"use client";

import type {
  MessagingHandoffListItemPayload,
  MessagingThreadDetailPayload,
} from "@operaclinic/shared";
import { AlertCircle, MessageSquare, UserCheck, Zap } from "lucide-react";
import { io } from "socket.io-client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AdminEmptyState,
  AdminMetricGrid,
  AdminSectionHeader,
  adminTextareaClassName,
} from "@/components/platform/platform-admin";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { useSession } from "@/hooks/use-session";
import {
  assignMessagingHandoff,
  closeMessagingHandoff,
  getMessagingThread,
  listMessagingHandoffs,
  sendMessagingThreadMessage,
} from "@/lib/client/messaging-api";
import { toErrorMessage } from "@/lib/client/http";
import { formatDateTime } from "@/lib/formatters";

interface MessagingThreadEvent {
  threadId: string;
}

export function ReceptionInbox() {
  const { user } = useSession({ expectedProfile: "clinic" });
  const [handoffs, setHandoffs] = useState<MessagingHandoffListItemPayload[]>([]);
  const [selectedThread, setSelectedThread] = useState<MessagingThreadDetailPayload | null>(null);
  const [replyText, setReplyText] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingThread, setIsLoadingThread] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const selectedThreadIdRef = useRef<string | null>(null);

  const loadInbox = useCallback(async () => {
    setIsLoading(true);
    try {
      const list = await listMessagingHandoffs();
      setHandoffs(list.filter((handoff) => handoff.status !== "CLOSED"));
    } catch (requestError) {
      setError(toErrorMessage(requestError, "Erro ao carregar inbox."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  async function handleSelectThread(threadId: string) {
    setIsLoadingThread(true);
    try {
      const detail = await getMessagingThread(threadId);
      setSelectedThread(detail);
    } catch (requestError) {
      setError(toErrorMessage(requestError, "Erro ao abrir conversa."));
    } finally {
      setIsLoadingThread(false);
    }
  }

  useEffect(() => {
    selectedThreadIdRef.current = selectedThread?.id ?? null;
  }, [selectedThread?.id]);

  useEffect(() => {
    void loadInbox();

    const tenantId = user?.activeTenantId ?? null;

    if (!tenantId) {
      return;
    }

    const socket = io(
      `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/messaging`,
      {
        withCredentials: true,
        query: { tenantId },
      },
    );

    socket.on("new_handoff", (data: MessagingHandoffListItemPayload) => {
      setHandoffs((previous) => {
        if (previous.some((handoff) => handoff.id === data.id)) {
          return previous;
        }

        if (data.priority === "HIGH") {
          void new Audio(
            "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3",
          )
            .play()
            .catch(() => undefined);
        }

        return [data, ...previous];
      });
    });

    socket.on("handoff_updated", (data: MessagingHandoffListItemPayload) => {
      setHandoffs((previous) => {
        if (data.status === "CLOSED") {
          return previous.filter((handoff) => handoff.id !== data.id);
        }

        return previous.map((handoff) =>
          handoff.id === data.id ? data : handoff,
        );
      });

      if (selectedThreadIdRef.current === data.threadId) {
        void handleSelectThread(data.threadId);
      }
    });

    const handleThreadEvent = (data: MessagingThreadEvent) => {
      void loadInbox();

      if (selectedThreadIdRef.current === data.threadId) {
        void handleSelectThread(data.threadId);
      }
    };

    socket.on("thread_activity", handleThreadEvent);
    socket.on("thread_updated", handleThreadEvent);

    return () => {
      socket.disconnect();
    };
  }, [loadInbox, user?.activeTenantId]);

  const stats = useMemo(
    () => ({
      total: handoffs.length,
      high: handoffs.filter((handoff) => handoff.priority === "HIGH").length,
      pending: handoffs.filter((handoff) => !handoff.assignedToUserId).length,
    }),
    [handoffs],
  );

  const sortedHandoffs = useMemo(() => {
    const priorityRank = { HIGH: 0, MEDIUM: 1, LOW: 2 };

    return [...handoffs].sort(
      (a, b) =>
        (priorityRank[a.priority as keyof typeof priorityRank] ?? 3) -
        (priorityRank[b.priority as keyof typeof priorityRank] ?? 3),
    );
  }, [handoffs]);

  const inboxMetrics = useMemo(
    () => [
      {
        label: "Transbordos",
        value: String(stats.total),
        helper: "Conversas fora do fluxo automatico.",
      },
      {
        label: "Alta prioridade",
        value: String(stats.high),
        helper: "Pedem atencao imediata.",
        tone: stats.high > 0 ? ("danger" as const) : ("default" as const),
      },
      {
        label: "Sem dono",
        value: String(stats.pending),
        helper: "Aguardando alguem assumir.",
        tone: stats.pending > 0 ? ("warning" as const) : ("default" as const),
      },
    ],
    [stats],
  );

  async function handleAssume(handoffId: string) {
    if (!user) {
      return;
    }

    setActiveAction(`assume-${handoffId}`);

    try {
      await assignMessagingHandoff(handoffId, { assignedToUserId: user.id });
      await loadInbox();

      if (selectedThread) {
        await handleSelectThread(selectedThread.id);
      }
    } catch (requestError) {
      setError(toErrorMessage(requestError, "Erro ao assumir."));
    } finally {
      setActiveAction(null);
    }
  }

  async function handleCloseHandoff(handoffId: string) {
    if (!selectedThread) {
      return;
    }

    setActiveAction(`close-${handoffId}`);

    try {
      await closeMessagingHandoff(handoffId, { resolveThread: false });
      await loadInbox();
      await handleSelectThread(selectedThread.id);
    } catch (requestError) {
      setError(toErrorMessage(requestError, "Erro ao encerrar handoff."));
    } finally {
      setActiveAction(null);
    }
  }

  async function handleSendMessage() {
    if (!selectedThread || !replyText.trim()) {
      return;
    }

    setActiveAction("send");

    try {
      await sendMessagingThreadMessage(selectedThread.id, {
        text: replyText.trim(),
      });
      setReplyText("");
      await handleSelectThread(selectedThread.id);
    } catch (requestError) {
      setError(toErrorMessage(requestError, "Erro ao enviar."));
    } finally {
      setActiveAction(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <AdminSectionHeader
          eyebrow="Inbox"
          title="Fila de transbordo"
          description="Conversas que sairam do fluxo automatico e pedem resposta humana."
          actions={
            <StatusPill
              label={`${stats.pending} aguardando`}
              tone={stats.high > 0 ? "danger" : "warning"}
            />
          }
        />
        <AdminMetricGrid items={inboxMetrics} />
      </Card>

      {error ? (
        <Card className="border-rose-200 bg-rose-50 p-3 text-xs text-rose-700" role="alert">
          {error}
        </Card>
      ) : null}

      {isLoading ? (
        <div className="grid min-h-[70vh] gap-4 xl:grid-cols-[minmax(320px,360px)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-3 pr-1" role="status" aria-live="polite">
            {Array.from({ length: 4 }, (_, index) => (
              <div
                key={index}
                className="animate-pulse rounded-2xl border border-slate-200 bg-white p-4"
              >
                <div className="h-3 w-24 rounded-full bg-slate-200" />
                <div className="mt-3 h-4 w-40 rounded-full bg-slate-200" />
                <div className="mt-3 h-3 w-52 rounded-full bg-slate-100" />
              </div>
            ))}
          </div>

          <div className="flex min-h-[70vh] min-w-0 flex-col overflow-hidden rounded-3xl border border-border bg-white shadow-xl">
            <div className="flex flex-1 items-center justify-center p-6" role="status" aria-live="polite">
              <div className="max-w-sm text-center">
                <div className="mx-auto w-fit rounded-full bg-panel p-6">
                  <MessageSquare className="h-12 w-12 text-muted opacity-30" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-ink">Carregando conversa</h3>
                <p className="mt-2 text-sm text-muted">
                  Buscando o historico completo para atendimento humano.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : stats.total === 0 ? (
        <Card className="min-h-[420px] bg-white">
          <div className="flex h-full min-h-[380px] items-center justify-center">
            <div className="w-full max-w-xl">
              <AdminEmptyState
                title="Nenhum transbordo ativo"
                description="A automacao esta dando conta das conversas neste momento."
              />
            </div>
          </div>
        </Card>
      ) : (
        <div className="grid min-h-[70vh] gap-4 xl:grid-cols-[minmax(320px,360px)_minmax(0,1fr)]">
          <div className="min-w-0 overflow-y-auto pr-1">
            <div className="flex min-w-0 flex-col gap-4">
              {sortedHandoffs.map((handoff) => (
                <button
                  key={handoff.id}
                  onClick={() => handleSelectThread(handoff.threadId)}
                  className={`group relative flex flex-col gap-2 rounded-2xl border p-4 text-left transition-all ${
                    selectedThread?.id === handoff.threadId
                      ? "border-accent bg-accentSoft ring-2 ring-accent/10"
                      : "border-border bg-white hover:border-accent hover:bg-accentSoft/30"
                  }`}
                >
                  {handoff.priority === "HIGH" ? (
                    <div className="absolute -left-1 -top-1">
                      <span className="flex h-3 w-3 animate-ping rounded-full bg-rose-500 opacity-75"></span>
                      <span className="relative inline-flex h-3 w-3 rounded-full bg-rose-600"></span>
                    </div>
                  ) : null}

                  <div className="flex items-center justify-between gap-3">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider ${
                        handoff.priority === "HIGH"
                          ? "text-rose-600"
                          : handoff.priority === "MEDIUM"
                            ? "text-amber-600"
                            : "text-sky-600"
                      }`}
                    >
                      Prioridade {handoff.priority}
                    </span>
                    <span className="shrink-0 text-[10px] text-muted">
                      {formatDateTime(handoff.createdAt)}
                    </span>
                  </div>

                  <div className="flex min-w-0 items-center gap-2">
                    <p className="min-w-0 flex-1 truncate font-bold text-ink">
                      {handoff.thread.patientDisplayName ||
                        handoff.thread.contactDisplayValue}
                    </p>
                    {handoff.assignedToUserId ? (
                      <UserCheck className="h-4 w-4 shrink-0 text-emerald-500" />
                    ) : null}
                  </div>

                  <div className="flex min-w-0 items-center gap-2 text-xs text-muted">
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    <p className="truncate italic">&quot;{handoff.reason}&quot;</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex min-h-[70vh] min-w-0 flex-col overflow-hidden rounded-3xl border border-border bg-white shadow-xl">
            {isLoadingThread ? (
              <div className="flex flex-1 items-center justify-center p-6" role="status" aria-live="polite">
                <div className="max-w-sm text-center">
                  <div className="mx-auto w-fit rounded-full bg-panel p-6">
                    <MessageSquare className="h-12 w-12 text-muted opacity-30" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-ink">Carregando conversa</h3>
                  <p className="mt-2 text-sm text-muted">
                    Buscando o historico completo para atendimento humano.
                  </p>
                </div>
              </div>
            ) : !selectedThread ? (
              <div className="flex flex-1 items-center justify-center p-6">
                <div className="max-w-sm text-center">
                  <div className="mx-auto w-fit rounded-full bg-panel p-6">
                    <MessageSquare className="h-12 w-12 text-muted opacity-30" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-ink">
                    Selecione uma conversa
                  </h3>
                  <p className="mt-2 text-sm text-muted">
                    Escolha um item da fila lateral para assumir o atendimento humano.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between border-b bg-panel/30 px-6 py-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent font-bold text-white">
                      {(selectedThread.patientDisplayName ||
                        selectedThread.contactDisplayValue)[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <h3 className="line-clamp-1 font-bold text-ink">
                        {selectedThread.patientDisplayName ||
                          selectedThread.contactDisplayValue}
                      </h3>
                      <div className="flex items-center gap-2 text-[10px] text-muted">
                        <Zap className="h-3 w-3 text-amber-500" />
                        <span>Conduzido por IA ate agora</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {!selectedThread.openHandoff?.assignedToUserId ? (
                      <Button
                        onClick={() => handleAssume(selectedThread.openHandoff!.id)}
                        className="bg-accent hover:bg-accent/90"
                        disabled={Boolean(activeAction) || !selectedThread.openHandoff}
                      >
                        Assumir atendimento
                      </Button>
                    ) : selectedThread.openHandoff.assignedToUserId === user?.id ? (
                      <>
                        <StatusPill label="Voce esta atendendo" tone="success" />
                        <Button
                          onClick={() =>
                            handleCloseHandoff(selectedThread.openHandoff!.id)
                          }
                          disabled={Boolean(activeAction)}
                          className="border border-border bg-white text-ink hover:bg-panel"
                        >
                          Encerrar handoff
                        </Button>
                      </>
                    ) : (
                      <StatusPill label="Em atendimento" tone="warning" />
                    )}
                  </div>
                </div>

                <div className="flex flex-1 flex-col gap-4 overflow-y-auto bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-fixed p-6">
                  {selectedThread.events.map((event) => (
                    <div
                      key={event.id}
                      className={`flex ${
                        event.direction === "INBOUND"
                          ? "justify-start"
                          : "justify-end"
                      }`}
                    >
                      <div
                        className={`max-w-[80%] rounded-2xl px-4 py-3 shadow-sm ${
                          event.direction === "INBOUND"
                            ? "border border-border bg-white text-ink"
                            : event.direction === "OUTBOUND" &&
                                event.metadata?.source === "AGENT"
                              ? "border border-amber-100 bg-amber-50 text-amber-900"
                              : "bg-accent text-white"
                        }`}
                      >
                        {event.direction === "OUTBOUND" &&
                        event.metadata?.source === "AGENT" ? (
                          <div className="mb-1 flex items-center gap-1 opacity-60">
                            <Zap className="h-3 w-3" />
                            <span className="text-[10px] font-bold uppercase">
                              Robo Opera
                            </span>
                          </div>
                        ) : null}
                        <p className="whitespace-pre-wrap text-sm">
                          {event.contentText || "(Interacao de sistema)"}
                        </p>
                        <span
                          className={`mt-1 block text-[10px] opacity-60 ${
                            event.direction === "OUTBOUND" ? "text-right" : ""
                          }`}
                        >
                          {formatTimeOnly(event.occurredAt)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t bg-white p-4">
                  {selectedThread.openHandoff?.assignedToUserId === user?.id ? (
                    <div className="flex gap-2">
                      <textarea
                        value={replyText}
                        onChange={(event) => setReplyText(event.target.value)}
                        placeholder="Escreva sua resposta..."
                        className={`${adminTextareaClassName} min-h-[44px] max-h-32 flex-1 resize-none`}
                        rows={1}
                      />
                      <Button
                        onClick={handleSendMessage}
                        disabled={!replyText.trim() || Boolean(activeAction)}
                        className="h-auto rounded-2xl bg-accent px-6 hover:bg-accent/90"
                      >
                        Enviar
                      </Button>
                    </div>
                  ) : (
                    <p className="py-2 text-center text-xs text-muted">
                      Assuma o atendimento para enviar mensagens.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function formatTimeOnly(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

