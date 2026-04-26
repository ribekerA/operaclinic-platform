"use client";

import type {
  MessageEventDirection,
  MessageThreadStatus,
  MessagingEventPayload,
  MessagingHandoffListItemPayload,
  MessagingHandoffPayload,
  MessagingThreadDetailPayload,
  MessagingThreadSummaryPayload,
} from "@operaclinic/shared";
import {
  LifeBuoy,
  Link2,
  MessagesSquare,
  Send,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AdminCollectionSkeleton,
  AdminEmptyState,
  AdminMetricGrid,
  AdminPageHeader,
  AdminSectionHeader,
  adminInputClassName,
  adminSelectClassName,
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
  linkMessagingThreadPatient,
  listMessagingHandoffs,
  listMessagingThreads,
  openMessagingHandoff,
  resolveMessagingThread,
  sendMessagingThreadMessage,
} from "@/lib/client/messaging-api";
import { toErrorMessage } from "@/lib/client/http";
import type { PatientSummaryResponse } from "@/lib/client/patients-api";
import { listPatients } from "@/lib/client/patients-api";
import {
  formatDateLabel,
  formatDateTime,
  getHandoffStatusLabel,
  getHandoffStatusTone,
  getMessageDirectionLabel,
  getMessagingThreadStatusLabel,
  getMessagingThreadStatusTone,
} from "@/lib/formatters";

type ThreadFilter = "ALL" | MessageThreadStatus;
type HandoffView = "ALL" | "QUEUE" | "MINE";
type PatientView = "ALL" | "LINKED" | "UNLINKED";

const operationRoles = ["TENANT_ADMIN", "CLINIC_MANAGER", "RECEPTION"];

function getActiveHandoff(
  thread: MessagingThreadDetailPayload | MessagingThreadSummaryPayload | null,
): MessagingHandoffPayload | null {
  if (!thread) {
    return null;
  }

  return thread.openHandoff ?? null;
}

function getHandoffSourceLabel(source: MessagingHandoffPayload["source"]): string {
  return source === "AUTOMATIC" ? "Automatico" : "Manual";
}

function getAssigneeLabel(handoff: MessagingHandoffPayload | null): string {
  if (!handoff) {
    return "Sem handoff";
  }

  return (
    handoff.assignedToUser?.fullName ??
    handoff.assignedToUser?.email ??
    "Fila da recepcao"
  );
}

function getEventTone(
  direction: MessageEventDirection,
): "success" | "warning" | "neutral" {
  if (direction === "OUTBOUND") {
    return "success";
  }

  if (direction === "SYSTEM") {
    return "warning";
  }

  return "neutral";
}

function readMetadataText(
  metadata: Record<string, unknown> | null,
  key: string,
): string | null {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getEventSummary(event: MessagingEventPayload): string {
  switch (event.eventType) {
    case "THREAD_CREATED":
      return "Thread criada no canal.";
    case "MESSAGE_RECEIVED":
      return event.contentText ?? "Mensagem inbound registrada.";
    case "MESSAGE_SENT":
      return event.contentText ?? "Mensagem enviada pela recepcao.";
    case "MESSAGE_SEND_FAILED":
      return readMetadataText(event.metadata, "error") ?? "Falha no envio da mensagem.";
    case "HANDOFF_OPENED":
      return readMetadataText(event.metadata, "reason") ?? "Handoff aberto para recepcao.";
    case "HANDOFF_ASSIGNED":
      return "Handoff atribuido para atendimento humano.";
    case "HANDOFF_CLOSED":
      return event.contentText ?? "Handoff fechado.";
    case "THREAD_PATIENT_LINKED":
      return "Paciente vinculado a thread.";
    case "THREAD_RESOLVED":
      return event.contentText ?? "Thread marcada como resolvida.";
    default:
      return event.contentText ?? "Evento registrado na timeline.";
  }
}

function getEventActorLabel(event: MessagingEventPayload): string {
  if (event.actorUser?.fullName) {
    return event.actorUser.fullName;
  }

  if (event.actorUser?.email) {
    return event.actorUser.email;
  }

  if (event.direction === "INBOUND") {
    return "Paciente";
  }

  return "Sistema";
}

function getLastInboundPreview(thread: MessagingThreadDetailPayload): string {
  const inboundEvent = [...thread.events]
    .reverse()
    .find((event) => event.direction === "INBOUND" && event.contentText);

  return inboundEvent?.contentText ?? thread.lastMessagePreview ?? "Sem mensagem legivel.";
}

export function MessagingWorkspace() {
  const { user: sessionUser, loading: sessionLoading } = useSession({
    expectedProfile: "clinic",
  });

  const canOperate = useMemo(
    () => sessionUser?.roles.some((role) => operationRoles.includes(role)) ?? false,
    [sessionUser],
  );
  const isReception = sessionUser?.roles.includes("RECEPTION") ?? false;

  const [threadFilter, setThreadFilter] = useState<ThreadFilter>("ALL");
  const [handoffView, setHandoffView] = useState<HandoffView>("ALL");
  const [patientView, setPatientView] = useState<PatientView>("ALL");
  const [search, setSearch] = useState("");

  const [threads, setThreads] = useState<MessagingThreadSummaryPayload[]>([]);
  const [handoffs, setHandoffs] = useState<MessagingHandoffListItemPayload[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [selectedThread, setSelectedThread] =
    useState<MessagingThreadDetailPayload | null>(null);

  const [handoffReason, setHandoffReason] = useState("");
  const [handoffNote, setHandoffNote] = useState("");
  const [closeNote, setCloseNote] = useState("");
  const [resolveOnClose, setResolveOnClose] = useState(false);
  const [resolveNote, setResolveNote] = useState("");
  const [replyText, setReplyText] = useState("");

  const [patientSearch, setPatientSearch] = useState("");
  const [patientResults, setPatientResults] = useState<PatientSummaryResponse[]>([]);
  const [isSearchingPatients, setIsSearchingPatients] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingThread, setIsLoadingThread] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const activeHandoff = useMemo(() => getActiveHandoff(selectedThread), [selectedThread]);

  const filteredThreads = useMemo(() => {
    return threads.filter((thread) => {
      if (handoffView === "QUEUE" && thread.openHandoff?.assignedToUserId) {
        return false;
      }

      if (handoffView === "MINE" && thread.openHandoff?.assignedToUserId !== sessionUser?.id) {
        return false;
      }

      if (patientView === "LINKED" && !thread.patientId) {
        return false;
      }

      if (patientView === "UNLINKED" && thread.patientId) {
        return false;
      }

      return true;
    });
  }, [handoffView, patientView, sessionUser?.id, threads]);

  const filteredHandoffs = useMemo(() => {
    return handoffs.filter((handoff) => {
      if (handoffView === "QUEUE") {
        return !handoff.assignedToUserId;
      }

      if (handoffView === "MINE") {
        return handoff.assignedToUserId === sessionUser?.id;
      }

      if (patientView === "LINKED" && !handoff.thread.patientId) {
        return false;
      }

      if (patientView === "UNLINKED" && handoff.thread.patientId) {
        return false;
      }

      return true;
    });
  }, [handoffs, handoffView, patientView, sessionUser?.id]);

  const metrics = useMemo(() => {
    const activeThreads = threads.filter((thread) => thread.status !== "CLOSED").length;
    const openHandoffs = handoffs.filter((handoff) => handoff.status !== "CLOSED").length;
    const queue = handoffs.filter((handoff) => !handoff.assignedToUserId).length;
    const mine = handoffs.filter((handoff) => handoff.assignedToUserId === sessionUser?.id).length;

    return {
      activeThreads,
      openHandoffs,
      queue,
      mine,
    };
  }, [handoffs, sessionUser?.id, threads]);

  const loadWorkspace = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [threadList, handoffList] = await Promise.all([
        listMessagingThreads(
          threadFilter === "ALL"
            ? { search: search.trim() || undefined }
            : { status: threadFilter, search: search.trim() || undefined },
        ),
        listMessagingHandoffs(),
      ]);

      setThreads(threadList);
      setHandoffs(handoffList);
    } catch (requestError) {
      setError(
        toErrorMessage(requestError, "Nao foi possivel carregar a inbox de mensagens."),
      );
    } finally {
      setIsLoading(false);
    }
  }, [search, threadFilter]);

  const loadThread = useCallback(async (threadId: string) => {
    setIsLoadingThread(true);
    setError(null);

    try {
      setSelectedThread(await getMessagingThread(threadId));
    } catch (requestError) {
      setError(
        toErrorMessage(requestError, "Nao foi possivel abrir a thread selecionada."),
      );
    } finally {
      setIsLoadingThread(false);
    }
  }, []);

  useEffect(() => {
    if (!sessionLoading && canOperate) {
      void loadWorkspace();
      return;
    }

    if (!sessionLoading) {
      setIsLoading(false);
    }
  }, [canOperate, loadWorkspace, sessionLoading]);

  useEffect(() => {
    if (!selectedThreadId) {
      setSelectedThread(null);
      setPatientResults([]);
      setPatientSearch("");
      setReplyText("");
      setHandoffReason("");
      setHandoffNote("");
      setCloseNote("");
      setResolveNote("");
      setResolveOnClose(false);
      return;
    }

    void loadThread(selectedThreadId);
  }, [loadThread, selectedThreadId]);

  async function refreshAfterMutation(threadId?: string | null): Promise<void> {
    await loadWorkspace();

    if (threadId) {
      await loadThread(threadId);
    }
  }

  async function handleSearchPatients(): Promise<void> {
    if (!patientSearch.trim()) {
      setPatientResults([]);
      return;
    }

    setIsSearchingPatients(true);
    setError(null);

    try {
      setPatientResults(
        await listPatients({
          search: patientSearch.trim(),
          isActive: "true",
          limit: "6",
        }),
      );
    } catch (requestError) {
      setError(
        toErrorMessage(
          requestError,
          "Nao foi possivel buscar pacientes para esta thread.",
        ),
      );
    } finally {
      setIsSearchingPatients(false);
    }
  }

  async function handleOpenHandoff(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!selectedThread) {
      return;
    }

    if (!handoffReason.trim()) {
      setError("Informe o motivo do handoff para a recepcao.");
      return;
    }

    setActiveAction("open-handoff");
    setError(null);
    setSuccess(null);

    try {
      await openMessagingHandoff({
        threadId: selectedThread.id,
        reason: handoffReason.trim(),
        note: handoffNote.trim() || undefined,
      });

      setSuccess("Handoff aberto com sucesso.");
      setHandoffReason("");
      setHandoffNote("");
      await refreshAfterMutation(selectedThread.id);
    } catch (requestError) {
      setError(
        toErrorMessage(requestError, "Nao foi possivel abrir o handoff desta thread."),
      );
    } finally {
      setActiveAction(null);
    }
  }

  async function handleTakeOwnership(handoff: MessagingHandoffPayload): Promise<void> {
    if (!sessionUser?.id) {
      return;
    }

    setActiveAction(`assign:${handoff.id}`);
    setError(null);
    setSuccess(null);

    try {
      await assignMessagingHandoff(handoff.id, {
        assignedToUserId: sessionUser.id,
      });
      setSuccess("Handoff atribuido para sua recepcao.");
      await refreshAfterMutation(handoff.threadId);
    } catch (requestError) {
      setError(toErrorMessage(requestError, "Nao foi possivel assumir este handoff."));
    } finally {
      setActiveAction(null);
    }
  }

  async function handleCloseHandoff(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!activeHandoff) {
      return;
    }

    setActiveAction(`close:${activeHandoff.id}`);
    setError(null);
    setSuccess(null);

    try {
      await closeMessagingHandoff(activeHandoff.id, {
        note: closeNote.trim() || undefined,
        resolveThread: resolveOnClose,
      });
      setSuccess(resolveOnClose ? "Handoff fechado e thread resolvida." : "Handoff fechado.");
      setCloseNote("");
      setResolveOnClose(false);
      await refreshAfterMutation(activeHandoff.threadId);
    } catch (requestError) {
      setError(
        toErrorMessage(requestError, "Nao foi possivel fechar o handoff desta thread."),
      );
    } finally {
      setActiveAction(null);
    }
  }

  async function handleLinkPatient(patientId: string | null): Promise<void> {
    if (!selectedThread) {
      return;
    }

    setActiveAction(`patient:${selectedThread.id}`);
    setError(null);
    setSuccess(null);

    try {
      await linkMessagingThreadPatient(selectedThread.id, { patientId });
      setSuccess(patientId ? "Paciente vinculado a thread." : "Vinculo removido da thread.");
      await refreshAfterMutation(selectedThread.id);
    } catch (requestError) {
      setError(
        toErrorMessage(
          requestError,
          "Nao foi possivel atualizar o paciente desta thread.",
        ),
      );
    } finally {
      setActiveAction(null);
    }
  }

  async function handleResolveThread(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!selectedThread) {
      return;
    }

    setActiveAction(`resolve:${selectedThread.id}`);
    setError(null);
    setSuccess(null);

    try {
      await resolveMessagingThread(selectedThread.id, {
        note: resolveNote.trim() || undefined,
      });
      setSuccess("Thread marcada como resolvida.");
      setResolveNote("");
      await refreshAfterMutation(selectedThread.id);
    } catch (requestError) {
      setError(toErrorMessage(requestError, "Nao foi possivel resolver esta thread."));
    } finally {
      setActiveAction(null);
    }
  }

  async function handleSendMessage(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!selectedThread) {
      return;
    }

    if (!replyText.trim()) {
      setError("Escreva a mensagem antes de enviar.");
      return;
    }

    setActiveAction(`send:${selectedThread.id}`);
    setError(null);
    setSuccess(null);

    try {
      await sendMessagingThreadMessage(selectedThread.id, {
        text: replyText.trim(),
      });
      setSuccess("Mensagem enviada para a paciente.");
      setReplyText("");
      await refreshAfterMutation(selectedThread.id);
    } catch (requestError) {
      setError(
        toErrorMessage(
          requestError,
          "Nao foi possivel enviar a mensagem desta thread.",
        ),
      );
    } finally {
      setActiveAction(null);
    }
  }

  if (!sessionLoading && !canOperate) {
    return (
      <Card className="space-y-3 bg-white">
        <h1 className="text-2xl font-semibold text-ink">Mensagens e handoffs</h1>
        <p className="text-sm leading-6 text-muted">
          Esta area e reservada para recepcao, gestores e administracao da clinica
          tratarem conversas que exigem atendimento humano.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Clinica | Mensageria"
        title="Conversas que pedem atendimento humano"
        description="A recepcao assume a excecao, vincula o paciente com seguranca e resolve o caso sem poluir a agenda."
        actions={
          <Button type="button" onClick={() => void loadWorkspace()} disabled={isLoading}>
            {isLoading ? "Atualizando..." : "Atualizar inbox"}
          </Button>
        }
      >
        <AdminMetricGrid
          items={[
            {
              label: "Threads ativas",
              value: String(metrics.activeThreads),
              helper: "Conversas ainda em andamento.",
            },
            {
              label: "Handoffs abertos",
              value: String(metrics.openHandoffs),
              helper: "Precisam de acao humana.",
              tone: metrics.openHandoffs > 0 ? ("warning" as const) : ("default" as const),
            },
            {
              label: "Fila da recepcao",
              value: String(metrics.queue),
              helper: "Casos sem dono no momento.",
            },
            {
              label: "Atribuidas para mim",
              value: String(metrics.mine),
              helper: "Conversas sob sua responsabilidade.",
              tone: metrics.mine > 0 ? ("accent" as const) : ("default" as const),
            },
          ]}
        />
      </AdminPageHeader>

      <section className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
        <Card className="space-y-4 bg-white">
          <AdminSectionHeader
            eyebrow="Filtros"
            title="Encontre a conversa certa"
            description="Busque por paciente, contato ou estado da thread e atualize a fila sem recarregar a pagina inteira."
          />

          <div className="grid gap-3 lg:grid-cols-[1fr_210px_190px_210px]">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void loadWorkspace();
                }
              }}
              placeholder="Buscar por paciente, contato ou ultima mensagem"
              className={adminInputClassName}
            />
            <select
              value={threadFilter}
              onChange={(event) => setThreadFilter(event.target.value as ThreadFilter)}
              className={adminSelectClassName}
            >
              <option value="ALL">Todas as threads</option>
              <option value="OPEN">Abertas</option>
              <option value="IN_HANDOFF">Em handoff</option>
              <option value="CLOSED">Resolvidas</option>
            </select>
            <select
              value={handoffView}
              onChange={(event) => setHandoffView(event.target.value as HandoffView)}
              className={adminSelectClassName}
            >
              <option value="ALL">Todos os responsaveis</option>
              <option value="QUEUE">Fila sem dono</option>
              <option value="MINE">Atribuidas para mim</option>
            </select>
            <select
              value={patientView}
              onChange={(event) => setPatientView(event.target.value as PatientView)}
              className={adminSelectClassName}
            >
              <option value="ALL">Todos os pacientes</option>
              <option value="LINKED">Paciente identificado</option>
              <option value="UNLINKED">Sem paciente vinculado</option>
            </select>
          </div>
        </Card>

        <Card className="space-y-4 bg-white">
          <AdminSectionHeader
            eyebrow="Fluxo"
            title="Regras da operacao"
            description="Como tratar a conversa sem misturar atendimento humano com agendamento."
            actions={<StatusPill label={`${metrics.openHandoffs} ativos`} tone="warning" />}
          />
          <div className="grid gap-3">
            <div className="rounded-2xl border border-border bg-panel/50 px-4 py-4">
              <div className="flex items-center gap-3">
                <LifeBuoy className="h-5 w-5 text-accent" />
                <p className="font-semibold text-ink">Handoff antes da resposta humana</p>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted">
                A recepcao so envia mensagem pela thread depois que o handoff esta aberto.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-panel/50 px-4 py-4">
              <div className="flex items-center gap-3">
                <Link2 className="h-5 w-5 text-accent" />
                <p className="font-semibold text-ink">Vinculo de paciente seguro</p>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted">
                A thread pode seguir sem paciente definitivo ate a recepcao confirmar o vinculo certo.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-panel/50 px-4 py-4">
              <div className="flex items-center gap-3">
                <MessagesSquare className="h-5 w-5 text-accent" />
                <p className="font-semibold text-ink">Agenda continua fora da thread</p>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted">
                Esta area trata conversa, contexto e excecao. Agendamento continua na recepcao e no scheduling.
              </p>
            </div>
          </div>
        </Card>
      </section>

      {error ? (
        <Card className="border-red-200 bg-red-50" role="alert">
          <p className="text-sm text-red-700">{error}</p>
        </Card>
      ) : null}

      {success ? (
        <Card className="border-emerald-200 bg-emerald-50" role="status" aria-live="polite">
          <p className="text-sm text-emerald-700">{success}</p>
        </Card>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="space-y-4 bg-white" aria-busy={isLoading}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-ink">Inbox de threads</h2>
              <p className="text-sm text-muted">
                Conversas recentes por paciente, contato e estado operacional.
              </p>
            </div>
            <StatusPill label={`${filteredThreads.length} threads`} />
          </div>

          {isLoading ? (
            <div role="status" aria-live="polite">
              <AdminCollectionSkeleton items={4} />
            </div>
          ) : filteredThreads.length === 0 ? (
            <AdminEmptyState
              title="Nenhuma thread encontrada"
              description="Ajuste os filtros ou atualize a inbox para buscar novas conversas."
            />
          ) : (
            <div className="space-y-3">
              {filteredThreads.map((thread) => (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => setSelectedThreadId(thread.id)}
                  className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                    selectedThreadId === thread.id
                      ? "border-accent bg-accentSoft"
                      : "border-border bg-white hover:bg-accentSoft"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-ink">
                          {thread.patientDisplayName ?? thread.contactDisplayValue}
                        </p>
                        <StatusPill
                          label={getMessagingThreadStatusLabel(thread.status)}
                          tone={getMessagingThreadStatusTone(thread.status)}
                        />
                        {thread.openHandoff ? (
                          <StatusPill
                            label={getHandoffStatusLabel(thread.openHandoff.status)}
                            tone={getHandoffStatusTone(thread.openHandoff.status)}
                          />
                        ) : null}
                      </div>
                      <p className="text-xs text-muted">{thread.contactDisplayValue}</p>
                      <p className="text-sm text-muted">
                        {thread.lastMessagePreview ?? "Thread sem mensagem legivel ainda."}
                      </p>
                    </div>

                    <div className="space-y-2 text-right">
                      <p className="text-xs text-muted">
                        {thread.lastMessageAt ? formatDateTime(thread.lastMessageAt) : "Sem atividade"}
                      </p>
                      {thread.openHandoff ? (
                        <p className="text-xs font-semibold text-ink">
                          {getAssigneeLabel(thread.openHandoff)}
                        </p>
                      ) : (
                        <p className="text-xs text-muted">Sem handoff ativo</p>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card className="space-y-4 bg-white" aria-busy={isLoading}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-ink">Handoffs abertos</h2>
              <p className="text-sm text-muted">
                Fila da recepcao com prioridade para o que ainda nao tem dono.
              </p>
            </div>
            <StatusPill label={`${filteredHandoffs.length} itens`} tone="warning" />
          </div>

          {filteredHandoffs.length === 0 ? (
            <AdminEmptyState
              title="Nenhum handoff aberto"
              description="Nao ha itens na fila para o filtro atual."
            />
          ) : (
            <div className="space-y-3">
              {filteredHandoffs.map((handoff) => (
                <div
                  key={handoff.id}
                  className="rounded-2xl border border-border bg-panel/60 px-4 py-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-ink">
                          {handoff.thread.patientDisplayName ?? handoff.thread.contactDisplayValue}
                        </p>
                        <StatusPill
                          label={getHandoffStatusLabel(handoff.status)}
                          tone={getHandoffStatusTone(handoff.status)}
                        />
                      </div>
                      <p className="mt-1 text-xs text-muted">{handoff.reason}</p>
                      <p className="mt-1 text-xs text-muted">
                        {handoff.note ?? handoff.thread.lastMessagePreview ?? "Sem nota complementar."}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted">{getAssigneeLabel(handoff)}</p>
                      <p className="mt-1 text-xs text-muted">{formatDateTime(handoff.openedAt)}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedThreadId(handoff.threadId)}
                      className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-ink transition hover:bg-accentSoft"
                    >
                      Abrir thread
                    </button>
                    {isReception && !handoff.assignedToUserId ? (
                      <Button
                        type="button"
                        className="px-3 py-2 text-xs"
                        disabled={activeAction === `assign:${handoff.id}`}
                        onClick={() => void handleTakeOwnership(handoff)}
                      >
                        {activeAction === `assign:${handoff.id}` ? "Assumindo..." : "Assumir"}
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        {!selectedThreadId ? (
          <Card className="space-y-3 bg-white xl:col-span-2">
            <AdminEmptyState
              title="Selecione uma thread para operar"
              description="A recepcao escolhe a conversa certa e trabalha o contexto sem sair do painel."
            />
          </Card>
        ) : isLoadingThread || !selectedThread ? (
          <Card className="space-y-3 bg-white xl:col-span-2">
            <div role="status" aria-live="polite">
              <AdminCollectionSkeleton items={2} />
            </div>
          </Card>
        ) : (
          <>
            <div className="space-y-4">
              <Card className="space-y-4 bg-white">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-muted">Conversa ativa</p>
                    <h2 className="mt-2 text-xl font-semibold text-ink">
                      {selectedThread.patientDisplayName ?? selectedThread.contactDisplayValue}
                    </h2>
                    <p className="mt-1 text-sm text-muted">{selectedThread.contactDisplayValue}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill
                      label={getMessagingThreadStatusLabel(selectedThread.status)}
                      tone={getMessagingThreadStatusTone(selectedThread.status)}
                    />
                    {activeHandoff ? (
                      <StatusPill
                        label={getHandoffStatusLabel(activeHandoff.status)}
                        tone={getHandoffStatusTone(activeHandoff.status)}
                      />
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setSelectedThreadId(null)}
                      className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-ink transition hover:bg-accentSoft"
                    >
                      Fechar detalhe
                    </button>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl border border-border bg-panel/50 px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.12em] text-muted">Canal</p>
                    <p className="mt-2 font-semibold text-ink">{selectedThread.integration.displayName}</p>
                  </div>
                  <div className="rounded-2xl border border-border bg-panel/50 px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.12em] text-muted">Ultima atividade</p>
                    <p className="mt-2 font-semibold text-ink">
                      {selectedThread.lastMessageAt
                        ? formatDateTime(selectedThread.lastMessageAt)
                        : "Sem atividade"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border bg-panel/50 px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.12em] text-muted">Ultima inbound</p>
                    <p className="mt-2 text-sm font-semibold text-ink">{getLastInboundPreview(selectedThread)}</p>
                  </div>
                </div>
              </Card>

              <Card className="space-y-4 bg-white">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-ink">Conversa e rastreabilidade</h3>
                    <p className="text-sm text-muted">
                      O historico mostra mensagem, sistema e handoff no mesmo fluxo.
                    </p>
                  </div>
                  <StatusPill label={`${selectedThread.events.length} eventos`} />
                </div>

                <div className="max-h-[520px] space-y-3 overflow-y-auto pr-1">
                  {selectedThread.events.length === 0 ? (
                    <AdminEmptyState
                      title="Timeline vazia"
                      description="Ainda nao ha eventos legiveis para esta conversa."
                    />
                  ) : (
                    selectedThread.events.map((event) => (
                      <div
                        key={event.id}
                        className="rounded-2xl border border-border bg-panel/50 px-4 py-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <StatusPill
                                label={getMessageDirectionLabel(event.direction)}
                                tone={getEventTone(event.direction)}
                              />
                              <p className="text-sm font-semibold text-ink">
                                {getEventSummary(event)}
                              </p>
                            </div>
                            <p className="text-xs text-muted">
                              {getEventActorLabel(event)} - {formatDateTime(event.occurredAt)}
                            </p>
                          </div>
                          <p className="text-xs uppercase tracking-[0.12em] text-muted">
                            {event.eventType.replaceAll("_", " ")}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Card>

              <Card className="space-y-4 bg-white">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-ink">Resposta humana</h3>
                    <p className="text-sm text-muted">
                      A recepcao continua a conversa somente com handoff aberto.
                    </p>
                  </div>
                  {activeHandoff ? (
                    <StatusPill label="Liberado" tone="success" />
                  ) : (
                    <StatusPill label="Bloqueado" tone="warning" />
                  )}
                </div>

                {activeHandoff ? (
                  <form onSubmit={(event) => void handleSendMessage(event)} className="space-y-3">
                    <textarea
                      value={replyText}
                      onChange={(event) => setReplyText(event.target.value)}
                      rows={4}
                      placeholder="Escreva a resposta da recepcao para a paciente."
                      className={adminTextareaClassName}
                    />
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs text-muted">
                        Use esta resposta para orientar e fechar contexto. Agendamento continua no painel de recepcao.
                      </p>
                      <Button
                        type="submit"
                        disabled={activeAction === `send:${selectedThread.id}`}
                        className="gap-2"
                      >
                        <Send className="h-4 w-4" />
                        {activeAction === `send:${selectedThread.id}` ? "Enviando..." : "Enviar"}
                      </Button>
                    </div>
                  </form>
                ) : (
                  <AdminEmptyState
                    title="Resposta bloqueada"
                    description="Abra ou assuma um handoff antes de responder pela thread."
                  />
                )}
              </Card>
            </div>

            <div className="space-y-4">
              <Card className="space-y-4 bg-white">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-ink">Contexto operacional</h3>
                    <p className="text-sm text-muted">
                      Paciente, handoff e acoes rapidas no mesmo lado da operacao.
                    </p>
                  </div>
                  <StatusPill label={selectedThread.integration.displayName} />
                </div>

                <div className="rounded-2xl border border-border bg-panel/50 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.12em] text-muted">Paciente</p>
                  <p className="mt-2 font-semibold text-ink">
                    {selectedThread.patient?.fullName ?? "Sem vinculo definitivo"}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {selectedThread.patient?.documentNumber ?? "Documento nao informado"}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {selectedThread.patient?.birthDate
                      ? `Nascimento: ${formatDateLabel(selectedThread.patient.birthDate)}`
                      : "Nascimento nao informado."}
                  </p>
                </div>

                {activeHandoff ? (
                  <div className="rounded-2xl border border-border bg-panel/50 px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.12em] text-muted">Handoff</p>
                    <p className="mt-2 font-semibold text-ink">{activeHandoff.reason}</p>
                    <p className="mt-1 text-sm text-muted">
                      {activeHandoff.note ?? "Sem observacao complementar."}
                    </p>
                    <p className="mt-3 text-xs text-muted">
                      Responsavel: {getAssigneeLabel(activeHandoff)}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      Origem {getHandoffSourceLabel(activeHandoff.source).toLowerCase()} - {formatDateTime(activeHandoff.openedAt)}
                    </p>
                  </div>
                ) : (
                  <AdminEmptyState
                    title="Sem handoff aberto"
                    description="Abra um handoff quando a conversa precisar de atendimento humano."
                  />
                )}

                {isReception && activeHandoff && !activeHandoff.assignedToUserId ? (
                  <Button
                    type="button"
                    disabled={activeAction === `assign:${activeHandoff.id}`}
                    onClick={() => void handleTakeOwnership(activeHandoff)}
                  >
                    {activeAction === `assign:${activeHandoff.id}` ? "Assumindo..." : "Assumir atendimento"}
                  </Button>
                ) : null}
              </Card>

              <Card className="space-y-4 bg-white">
                <div>
                  <h3 className="text-base font-semibold text-ink">Paciente e cadastro</h3>
                  <p className="text-sm text-muted">
                    Vincule com seguranca para a recepcao continuar o fluxo certo.
                  </p>
                </div>

                {selectedThread.patient ? (
                  <div className="rounded-2xl border border-border bg-panel/50 px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-ink">{selectedThread.patient.fullName ?? "Paciente"}</p>
                        <div className="mt-2 space-y-1 text-xs text-muted">
                          {selectedThread.patient.contacts.map((contact) => (
                            <p key={`${contact.type}:${contact.value}`}>
                              {contact.type} - {contact.value}
                              {contact.isPrimary ? " - principal" : ""}
                            </p>
                          ))}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleLinkPatient(null)}
                        disabled={activeAction === `patient:${selectedThread.id}`}
                        className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-ink transition hover:bg-accentSoft disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Remover vinculo
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="space-y-3">
                  <div className="flex flex-wrap gap-3">
                    <input
                      type="search"
                      value={patientSearch}
                      onChange={(event) => setPatientSearch(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void handleSearchPatients();
                        }
                      }}
                      placeholder="Buscar paciente por nome, telefone ou WhatsApp"
                      className={`${adminInputClassName} min-w-0 flex-1`}
                    />
                    <Button type="button" onClick={() => void handleSearchPatients()} disabled={isSearchingPatients}>
                      {isSearchingPatients ? "Buscando..." : "Buscar"}
                    </Button>
                  </div>

                  {patientResults.length > 0 ? (
                    <div className="space-y-3">
                      {patientResults.map((patient) => (
                        <div key={patient.id} className="rounded-2xl border border-border bg-panel/50 px-4 py-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-ink">{patient.fullName ?? "Paciente sem nome"}</p>
                              <p className="mt-1 text-xs text-muted">
                                {patient.documentNumber ?? "Documento nao informado"}
                              </p>
                            </div>
                            <Button
                              type="button"
                              className="px-3 py-2 text-xs"
                              disabled={activeAction === `patient:${selectedThread.id}`}
                              onClick={() => void handleLinkPatient(patient.id)}
                            >
                              Vincular
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : patientSearch.trim() ? (
                    <AdminEmptyState
                      title="Nenhum paciente encontrado"
                      description="Revise a busca ou tente outro contato para localizar o cadastro certo."
                    />
                  ) : null}
                </div>
              </Card>

              <Card className="space-y-4 bg-white">
                <div>
                  <h3 className="text-base font-semibold text-ink">Acoes da thread</h3>
                  <p className="text-sm text-muted">
                    Encaminhe, feche o handoff ou resolva a conversa sem misturar agenda aqui.
                  </p>
                </div>

                {activeHandoff ? (
                  <form onSubmit={(event) => void handleCloseHandoff(event)} className="space-y-3">
                    <textarea
                      value={closeNote}
                      onChange={(event) => setCloseNote(event.target.value)}
                      rows={3}
                      placeholder="Resumo rapido do atendimento humano."
                      className={adminTextareaClassName}
                    />
                    <label className="flex items-center gap-3 rounded-2xl border border-border px-4 py-3 text-sm text-ink">
                      <input
                        type="checkbox"
                        checked={resolveOnClose}
                        onChange={(event) => setResolveOnClose(event.target.checked)}
                      />
                      Resolver thread ao fechar o handoff
                    </label>
                    <Button type="submit" disabled={activeAction === `close:${activeHandoff.id}`}>
                      {activeAction === `close:${activeHandoff.id}` ? "Fechando..." : "Encerrar handoff"}
                    </Button>
                  </form>
                ) : selectedThread.status === "CLOSED" ? (
                  <AdminEmptyState
                    title="Thread resolvida"
                    description="Esta conversa ja foi encerrada e nao precisa de novas acoes."
                  />
                ) : (
                  <form onSubmit={(event) => void handleOpenHandoff(event)} className="space-y-3">
                    <input
                      type="text"
                      value={handoffReason}
                      onChange={(event) => setHandoffReason(event.target.value)}
                      placeholder="Motivo do handoff"
                      className={adminInputClassName}
                    />
                    <textarea
                      value={handoffNote}
                      onChange={(event) => setHandoffNote(event.target.value)}
                      rows={3}
                      placeholder="Contexto util para a recepcao."
                      className={adminTextareaClassName}
                    />
                    <Button type="submit" disabled={activeAction === "open-handoff"}>
                      {activeAction === "open-handoff" ? "Abrindo..." : "Abrir handoff"}
                    </Button>
                  </form>
                )}

                {!activeHandoff && selectedThread.status !== "CLOSED" ? (
                  <form onSubmit={(event) => void handleResolveThread(event)} className="space-y-3">
                    <textarea
                      value={resolveNote}
                      onChange={(event) => setResolveNote(event.target.value)}
                      rows={3}
                      placeholder="Resumo final para marcar a thread como resolvida."
                      className={adminTextareaClassName}
                    />
                    <Button type="submit" disabled={activeAction === `resolve:${selectedThread.id}`}>
                      {activeAction === `resolve:${selectedThread.id}` ? "Resolvendo..." : "Marcar thread como resolvida"}
                    </Button>
                  </form>
                ) : null}
              </Card>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
