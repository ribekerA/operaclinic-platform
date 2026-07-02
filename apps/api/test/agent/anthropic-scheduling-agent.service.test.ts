/**
 * Adversarial test suite for AnthropicSchedulingAgentService
 *
 * 25 scenarios covering: happy paths, edge cases, safety/behavioral rules,
 * error handling, tenant isolation, and conversation history merging.
 *
 * All Anthropic SDK calls are mocked — no real LLM calls are made.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnthropicSchedulingAgentService } from "../../src/modules/agent/anthropic-scheduling-agent.service";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TENANT_A = "tenant-a-uuid";
const TENANT_B = "tenant-b-uuid";
const THREAD_1 = "thread-1-uuid";
const PATIENT_1 = "patient-1-uuid";

function makeAnthropic(overrides: Record<string, unknown> = {}) {
  return {
    messages: {
      create: vi.fn(),
    },
    ...overrides,
  };
}

function makeAgentApi() {
  return {
    getAvailability: vi.fn().mockResolvedValue({ slots: [] }),
    createAppointment: vi.fn().mockResolvedValue({ id: "appt-new", confirmationCode: "VIT-001" }),
    lookupAppointments: vi.fn().mockResolvedValue({ appointments: [] }),
    rescheduleAppointment: vi.fn().mockResolvedValue({ id: "appt-new", startsAt: new Date().toISOString() }),
    cancelAppointment: vi.fn().mockResolvedValue({ cancelled: true }),
  };
}

function makePrisma(historyEvents: Array<{ direction: string; contentText: string }> = []) {
  return {
    messageEvent: {
      findMany: vi.fn().mockResolvedValue(historyEvents),
    },
    professional: {
      findMany: vi.fn().mockResolvedValue([
        { id: "pro-uuid-1", displayName: "Dra. Ana" },
        { id: "pro-uuid-2", displayName: "Dr. Carlos" },
      ]),
    },
    consultationType: {
      findMany: vi.fn().mockResolvedValue([
        { id: "svc-uuid-1", name: "Avaliação Inicial", durationMinutes: 30 },
        { id: "svc-uuid-2", name: "Limpeza de Pele", durationMinutes: 60 },
      ]),
    },
    clinic: {
      findUnique: vi.fn().mockResolvedValue({ displayName: "Clínica Vitalis" }),
    },
  };
}

function makeSkillExecutor() {
  return {
    execute: vi.fn().mockResolvedValue({ success: true }),
  };
}

function makeConfig(apiKey = "sk-test-key", agentEnabled = false) {
  return {
    get: vi.fn((key: string, fallback?: unknown) => {
      if (key === "ANTHROPIC_API_KEY") return apiKey;
      return fallback;
    }),
  };
}

/** Build text-only Anthropic response (end_turn, no tools) */
function textResponse(text: string) {
  return {
    stop_reason: "end_turn",
    content: [{ type: "text", text }],
  };
}

/** Build a tool_use response */
function toolUseResponse(name: string, input: Record<string, unknown>, toolId = "tool-1") {
  return {
    stop_reason: "tool_use",
    content: [
      { type: "tool_use", id: toolId, name, input },
    ],
  };
}

/** Build a mixed response (text + tool_use — Anthropic can return both) */
function mixedResponse(text: string, name: string, input: Record<string, unknown>) {
  return {
    stop_reason: "tool_use",
    content: [
      { type: "text", text },
      { type: "tool_use", id: "tool-mix", name, input },
    ],
  };
}

function buildService(options: {
  apiKey?: string;
  historyEvents?: Array<{ direction: string; contentText: string }>;
  anthropicCreateImpl?: ReturnType<typeof vi.fn>;
  agentApiOverrides?: Partial<ReturnType<typeof makeAgentApi>>;
  prismaOverrides?: Partial<ReturnType<typeof makePrisma>>;
}) {
  const anthropic = makeAnthropic();
  const agentApi = { ...makeAgentApi(), ...options.agentApiOverrides };
  const prisma = { ...makePrisma(options.historyEvents), ...options.prismaOverrides };
  const skillExecutor = makeSkillExecutor();
  const config = makeConfig(options.apiKey ?? "sk-test-key");

  if (options.anthropicCreateImpl) {
    anthropic.messages.create = options.anthropicCreateImpl;
  }

  const service = new AnthropicSchedulingAgentService(
    config as never,
    prisma as never,
    agentApi as never,
    skillExecutor as never,
  );

  // Inject the mock Anthropic instance (private field override for unit tests)
  Object.assign(service, { anthropic });

  return { service, anthropic, agentApi, prisma, skillExecutor, config };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("AnthropicSchedulingAgentService", () => {
  // ── 1. Happy path: simple text reply ─────────────────────────────────────

  it("1. returns replyText and sends it via skill when LLM returns text", async () => {
    const { service, anthropic, skillExecutor } = buildService({
      anthropicCreateImpl: vi.fn().mockResolvedValue(textResponse("Olá! Como posso ajudar?")),
    });

    const result = await service.handle({
      tenantId: TENANT_A,
      threadId: THREAD_1,
      patientId: PATIENT_1,
      patientPhone: "5511999999999",
      patientName: "Maria",
      messageText: "Oi",
      correlationId: "corr-1",
    });

    expect(result.status).toBe("COMPLETED");
    expect(result.replyText).toBe("Olá! Como posso ajudar?");
    expect(skillExecutor.execute).toHaveBeenCalledOnce();
    expect(skillExecutor.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        skillName: "send_message",
        payload: expect.objectContaining({ text: "Olá! Como posso ajudar?" }),
      }),
    );
  });

  // ── 2. Tool use: search_availability single iteration ────────────────────

  it("2. executes search_availability tool then replies with result", async () => {
    const createMock = vi.fn()
      .mockResolvedValueOnce(toolUseResponse("search_availability", {
        service_id: "svc-uuid-1",
        date_from: "2026-07-10",
        date_to: "2026-07-10",
      }))
      .mockResolvedValueOnce(textResponse("Há horários disponíveis na quinta-feira."));

    const agentApiOverrides = {
      getAvailability: vi.fn().mockResolvedValue({ slots: [{ startsAt: "2026-07-10T10:00:00-03:00" }] }),
    };

    const { service, agentApi } = buildService({ anthropicCreateImpl: createMock, agentApiOverrides });

    const result = await service.handle({
      tenantId: TENANT_A, threadId: THREAD_1, patientId: null,
      patientPhone: "5511111111111", patientName: "Sofia",
      messageText: "Quero agendar na quinta", correlationId: "corr-2",
    });

    expect(agentApi.getAvailability).toHaveBeenCalledWith(
      TENANT_A,
      expect.objectContaining({ service_id: "svc-uuid-1", date_from: "2026-07-10" }),
    );
    expect(result.status).toBe("COMPLETED");
    expect(result.replyText).toContain("quinta-feira");
  });

  // ── 3. Tool use: create_appointment ──────────────────────────────────────

  it("3. executes create_appointment tool and returns confirmation code", async () => {
    const createMock = vi.fn()
      .mockResolvedValueOnce(toolUseResponse("create_appointment", {
        professional_id: "pro-uuid-1",
        service_id: "svc-uuid-1",
        starts_at: "2026-07-10T10:00:00-03:00",
      }))
      .mockResolvedValueOnce(textResponse("Agendamento confirmado! Código VIT-001."));

    const { service, agentApi } = buildService({ anthropicCreateImpl: createMock });

    const result = await service.handle({
      tenantId: TENANT_A, threadId: THREAD_1, patientId: null,
      patientPhone: "5511222222222", patientName: "Bruno",
      messageText: "Confirma o horário das 10h", correlationId: "corr-3",
    });

    expect(agentApi.createAppointment).toHaveBeenCalledWith(
      TENANT_A,
      expect.objectContaining({
        professional_id: "pro-uuid-1",
        patient_phone: "5511222222222",
        patient_name: "Bruno",
      }),
    );
    expect(result.replyText).toContain("VIT-001");
  });

  // ── 4. Tool use: lookup_appointments ─────────────────────────────────────

  it("4. executes lookup_appointments and returns future bookings", async () => {
    const createMock = vi.fn()
      .mockResolvedValueOnce(toolUseResponse("lookup_appointments", {}))
      .mockResolvedValueOnce(textResponse("Você tem um agendamento em 15/07."));

    const agentApiOverrides = {
      lookupAppointments: vi.fn().mockResolvedValue({
        appointments: [{ id: "appt-1", startsAt: "2026-07-15T09:00:00-03:00", service: "Limpeza de Pele" }],
      }),
    };

    const { service } = buildService({ anthropicCreateImpl: createMock, agentApiOverrides });

    const result = await service.handle({
      tenantId: TENANT_A, threadId: THREAD_1, patientId: PATIENT_1,
      patientPhone: "5511333333333", patientName: "Mariana",
      messageText: "Tenho consulta marcada?", correlationId: "corr-4",
    });

    expect(result.status).toBe("COMPLETED");
    expect(result.replyText).toBe("Você tem um agendamento em 15/07.");
  });

  // ── 5. Tool use: reschedule_appointment ──────────────────────────────────

  it("5. executes reschedule_appointment and confirms new time", async () => {
    const createMock = vi.fn()
      .mockResolvedValueOnce(toolUseResponse("reschedule_appointment", {
        appointment_id: "appt-old",
        starts_at: "2026-07-17T14:00:00-03:00",
        reason: "conflito de agenda",
      }))
      .mockResolvedValueOnce(textResponse("Remarcado para 17/07 às 14h."));

    const { service, agentApi } = buildService({ anthropicCreateImpl: createMock });

    const result = await service.handle({
      tenantId: TENANT_A, threadId: THREAD_1, patientId: PATIENT_1,
      patientPhone: "5511444444444", patientName: "Lucas",
      messageText: "Preciso remarcar para sexta", correlationId: "corr-5",
    });

    expect(agentApi.rescheduleAppointment).toHaveBeenCalledWith(
      TENANT_A,
      "appt-old",
      expect.objectContaining({ starts_at: "2026-07-17T14:00:00-03:00" }),
    );
    expect(result.replyText).toContain("17/07");
  });

  // ── 6. Tool use: cancel_appointment ──────────────────────────────────────

  it("6. executes cancel_appointment and confirms cancellation", async () => {
    const createMock = vi.fn()
      .mockResolvedValueOnce(toolUseResponse("cancel_appointment", {
        appointment_id: "appt-cancel",
        reason: "viagem",
      }))
      .mockResolvedValueOnce(textResponse("Agendamento cancelado com sucesso."));

    const { service, agentApi } = buildService({ anthropicCreateImpl: createMock });

    const result = await service.handle({
      tenantId: TENANT_A, threadId: THREAD_1, patientId: PATIENT_1,
      patientPhone: "5511555555555", patientName: "Beatriz",
      messageText: "Quero cancelar", correlationId: "corr-6",
    });

    expect(agentApi.cancelAppointment).toHaveBeenCalledWith(
      TENANT_A,
      "appt-cancel",
      expect.objectContaining({ reason: "viagem" }),
    );
    expect(result.status).toBe("COMPLETED");
  });

  // ── 7. Edge: missing ANTHROPIC_API_KEY returns FAILED ────────────────────

  it("7. returns FAILED status when ANTHROPIC_API_KEY is empty", async () => {
    const { service } = buildService({ apiKey: "" });

    const result = await service.handle({
      tenantId: TENANT_A, threadId: THREAD_1, patientId: null,
      patientPhone: "5511000000000", patientName: null,
      messageText: "Oi", correlationId: "corr-7",
    });

    expect(result.status).toBe("FAILED");
    expect(result.replyText).toBeNull();
  });

  // ── 8. Edge: empty message text ──────────────────────────────────────────

  it("8. handles empty/whitespace message without crashing", async () => {
    const { service, anthropic } = buildService({
      anthropicCreateImpl: vi.fn().mockResolvedValue(textResponse("Como posso ajudar?")),
    });

    const result = await service.handle({
      tenantId: TENANT_A, threadId: THREAD_1, patientId: null,
      patientPhone: "5511000000001", patientName: null,
      messageText: "   ",
      correlationId: "corr-8",
    });

    // Agent should still call Anthropic (message passing is the caller's responsibility)
    expect(result).toBeDefined();
    expect(["COMPLETED", "WAITING_FOR_INPUT", "FAILED"]).toContain(result.status);
  });

  // ── 9. Edge: LLM returns empty text block (no reply) ─────────────────────

  it("9. returns WAITING_FOR_INPUT when LLM produces empty text", async () => {
    const { service } = buildService({
      anthropicCreateImpl: vi.fn().mockResolvedValue({
        stop_reason: "end_turn",
        content: [{ type: "text", text: "   " }],
      }),
    });

    const result = await service.handle({
      tenantId: TENANT_A, threadId: THREAD_1, patientId: null,
      patientPhone: "5511000000002", patientName: null,
      messageText: "ok", correlationId: "corr-9",
    });

    expect(result.status).toBe("WAITING_FOR_INPUT");
    expect(result.replyText).toBeNull();
  });

  // ── 10. Edge: max tool iterations guard ─────────────────────────────────

  it("10. stops after MAX_TOOL_ITERATIONS and returns FAILED with fallback message", async () => {
    const createMock = vi.fn().mockResolvedValue(
      toolUseResponse("lookup_appointments", {}),
    );

    const { service } = buildService({ anthropicCreateImpl: createMock });

    const result = await service.handle({
      tenantId: TENANT_A, threadId: THREAD_1, patientId: null,
      patientPhone: "5511000000003", patientName: null,
      messageText: "loop", correlationId: "corr-10",
    });

    expect(result.status).toBe("FAILED");
    expect(result.replyText).toContain("Desculpe");
    // Called exactly MAX_TOOL_ITERATIONS (10) times
    expect(createMock).toHaveBeenCalledTimes(10);
  });

  // ── 11. Tool error: agentApi throws on getAvailability ──────────────────

  it("11. tool_result is_error when agentApi.getAvailability throws", async () => {
    const createMock = vi.fn()
      .mockResolvedValueOnce(toolUseResponse("search_availability", {
        service_id: "bad-id",
        date_from: "2026-07-10",
        date_to: "2026-07-10",
      }))
      .mockResolvedValueOnce(textResponse("Não foi possível buscar horários no momento."));

    const agentApiOverrides = {
      getAvailability: vi.fn().mockRejectedValue(new Error("Service not found")),
    };

    const { service } = buildService({ anthropicCreateImpl: createMock, agentApiOverrides });

    const result = await service.handle({
      tenantId: TENANT_A, threadId: THREAD_1, patientId: null,
      patientPhone: "5511000000004", patientName: null,
      messageText: "disponibilidade?", correlationId: "corr-11",
    });

    expect(result.status).toBe("COMPLETED");

    // Second call should include tool_result with is_error: true
    const secondCallMessages = createMock.mock.calls[1]?.[0]?.messages as Array<{ role: string; content: unknown }>;
    const toolResultMsg = secondCallMessages?.find((m) => m.role === "user");
    expect(toolResultMsg?.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "tool_result", is_error: true }),
      ]),
    );
  });

  // ── 12. Tool error: agentApi.createAppointment throws ───────────────────

  it("12. handles create_appointment failure and continues conversation", async () => {
    const createMock = vi.fn()
      .mockResolvedValueOnce(toolUseResponse("create_appointment", {
        professional_id: "pro-uuid-1",
        service_id: "svc-uuid-1",
        starts_at: "2026-07-10T09:00:00-03:00",
      }))
      .mockResolvedValueOnce(textResponse("Houve um problema ao confirmar o agendamento."));

    const agentApiOverrides = {
      createAppointment: vi.fn().mockRejectedValue(new Error("Slot already taken")),
    };

    const { service } = buildService({ anthropicCreateImpl: createMock, agentApiOverrides });

    const result = await service.handle({
      tenantId: TENANT_A, threadId: THREAD_1, patientId: null,
      patientPhone: "5511000000005", patientName: null,
      messageText: "confirma", correlationId: "corr-12",
    });

    expect(result.status).toBe("COMPLETED");
    expect(result.replyText).toBeDefined();
  });

  // ── 13. Anthropic API throws → service returns FAILED ──────────────────

  it("13. returns FAILED when Anthropic API throws a network error", async () => {
    const { service } = buildService({
      anthropicCreateImpl: vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED")),
    });

    const result = await service.handle({
      tenantId: TENANT_A, threadId: THREAD_1, patientId: null,
      patientPhone: "5511000000006", patientName: null,
      messageText: "Oi", correlationId: "corr-13",
    });

    expect(result.status).toBe("FAILED");
    expect(result.replyText).toBeNull();
  });

  // ── 14. send_message skill failure is non-fatal ──────────────────────────

  it("14. does not propagate send_message skill failure — still returns replyText", async () => {
    const { service, skillExecutor } = buildService({
      anthropicCreateImpl: vi.fn().mockResolvedValue(textResponse("Olá!")),
    });

    skillExecutor.execute = vi.fn().mockResolvedValue({ success: false, error: "Thread closed" });

    const result = await service.handle({
      tenantId: TENANT_A, threadId: THREAD_1, patientId: null,
      patientPhone: "5511000000007", patientName: null,
      messageText: "oi", correlationId: "corr-14",
    });

    expect(result.replyText).toBe("Olá!");
    expect(result.status).toBe("COMPLETED");
  });

  // ── 15. Unknown tool name → is_error result, conversation continues ──────

  it("15. unknown tool returns is_error and agent recovers", async () => {
    const createMock = vi.fn()
      .mockResolvedValueOnce(toolUseResponse("nonexistent_tool", { x: 1 }))
      .mockResolvedValueOnce(textResponse("Não entendi a solicitação."));

    const { service } = buildService({ anthropicCreateImpl: createMock });

    const result = await service.handle({
      tenantId: TENANT_A, threadId: THREAD_1, patientId: null,
      patientPhone: "5511000000008", patientName: null,
      messageText: "?", correlationId: "corr-15",
    });

    expect(result.status).toBe("COMPLETED");

    const secondCallMessages = createMock.mock.calls[1]?.[0]?.messages as Array<{ role: string; content: unknown }>;
    const userMsg = secondCallMessages?.find((m) => m.role === "user");
    expect(userMsg?.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ is_error: true }),
      ]),
    );
  });

  // ── 16. Conversation history: loads and passes INBOUND/OUTBOUND events ───

  it("16. loads last 20 message events and passes them as conversation history", async () => {
    const historyEvents = [
      { direction: "INBOUND", contentText: "Quero agendar" },
      { direction: "OUTBOUND", contentText: "Que serviço você prefere?" },
    ];

    const { service, prisma, anthropic } = buildService({
      historyEvents,
      anthropicCreateImpl: vi.fn().mockResolvedValue(textResponse("Entendi!")),
    });

    await service.handle({
      tenantId: TENANT_A, threadId: THREAD_1, patientId: null,
      patientPhone: "5511000000009", patientName: null,
      messageText: "Limpeza de pele", correlationId: "corr-16",
    });

    expect(prisma.messageEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ threadId: THREAD_1 }),
        take: 20,
      }),
    );

    const messages = anthropic.messages.create.mock.calls[0]?.[0]?.messages as Array<{ role: string; content: string }>;
    const userMsg = messages?.find((m) => m.role === "user" && m.content.includes("Quero agendar"));
    const assistantMsg = messages?.find((m) => m.role === "assistant");

    expect(userMsg).toBeDefined();
    expect(assistantMsg?.content).toContain("Que serviço você prefere?");
  });

  // ── 17. Consecutive same-role messages are merged ───────────────────────

  it("17. merges consecutive INBOUND events into a single user message turn", async () => {
    const historyEvents = [
      { direction: "INBOUND", contentText: "Oi" },
      { direction: "INBOUND", contentText: "Quero agendar hoje" },
      { direction: "OUTBOUND", contentText: "Qual serviço?" },
    ];

    const createMock = vi.fn().mockResolvedValue(textResponse("Ok!"));
    const { service, anthropic } = buildService({ historyEvents, anthropicCreateImpl: createMock });

    await service.handle({
      tenantId: TENANT_A, threadId: THREAD_1, patientId: null,
      patientPhone: "5511000000010", patientName: null,
      messageText: "Limpeza", correlationId: "corr-17",
    });

    const messages = anthropic.messages.create.mock.calls[0]?.[0]?.messages as Array<{ role: string; content: string }>;
    const userMessages = messages?.filter((m) => m.role === "user");

    // The two consecutive INBOUND events should be merged into ONE user turn (the current message adds another)
    const mergedTurn = userMessages?.find((m) => m.content.includes("Oi") && m.content.includes("Quero agendar hoje"));
    expect(mergedTurn).toBeDefined();
  });

  // ── 18. System prompt includes clinic name ─────────────────────────────

  it("18. system prompt includes clinic display name from DB", async () => {
    const createMock = vi.fn().mockResolvedValue(textResponse("Olá!"));
    const { service, anthropic } = buildService({ anthropicCreateImpl: createMock });

    await service.handle({
      tenantId: TENANT_A, threadId: THREAD_1, patientId: null,
      patientPhone: "5511000000011", patientName: "Ana",
      messageText: "oi", correlationId: "corr-18",
    });

    const systemPrompt = anthropic.messages.create.mock.calls[0]?.[0]?.system as string;
    expect(systemPrompt).toContain("Clínica Vitalis");
  });

  // ── 19. System prompt includes patient phone and name ──────────────────

  it("19. system prompt includes patient phone and name", async () => {
    const createMock = vi.fn().mockResolvedValue(textResponse("Olá!"));
    const { service, anthropic } = buildService({ anthropicCreateImpl: createMock });

    await service.handle({
      tenantId: TENANT_A, threadId: THREAD_1, patientId: null,
      patientPhone: "5511981110001",
      patientName: "Sofia Almeida",
      messageText: "oi", correlationId: "corr-19",
    });

    const systemPrompt = anthropic.messages.create.mock.calls[0]?.[0]?.system as string;
    expect(systemPrompt).toContain("5511981110001");
    expect(systemPrompt).toContain("Sofia Almeida");
  });

  // ── 20. System prompt includes professional UUIDs ──────────────────────

  it("20. system prompt includes professional IDs and names from DB", async () => {
    const createMock = vi.fn().mockResolvedValue(textResponse("Olá!"));
    const { service, anthropic } = buildService({ anthropicCreateImpl: createMock });

    await service.handle({
      tenantId: TENANT_A, threadId: THREAD_1, patientId: null,
      patientPhone: "5511000000012", patientName: null,
      messageText: "oi", correlationId: "corr-20",
    });

    const systemPrompt = anthropic.messages.create.mock.calls[0]?.[0]?.system as string;
    expect(systemPrompt).toContain("pro-uuid-1");
    expect(systemPrompt).toContain("Dra. Ana");
    expect(systemPrompt).toContain("pro-uuid-2");
    expect(systemPrompt).toContain("Dr. Carlos");
  });

  // ── 21. System prompt includes service UUIDs ──────────────────────────

  it("21. system prompt includes consultation type IDs and names from DB", async () => {
    const createMock = vi.fn().mockResolvedValue(textResponse("Olá!"));
    const { service, anthropic } = buildService({ anthropicCreateImpl: createMock });

    await service.handle({
      tenantId: TENANT_A, threadId: THREAD_1, patientId: null,
      patientPhone: "5511000000013", patientName: null,
      messageText: "oi", correlationId: "corr-21",
    });

    const systemPrompt = anthropic.messages.create.mock.calls[0]?.[0]?.system as string;
    expect(systemPrompt).toContain("svc-uuid-1");
    expect(systemPrompt).toContain("Avaliação Inicial");
    expect(systemPrompt).toContain("svc-uuid-2");
    expect(systemPrompt).toContain("Limpeza de Pele");
  });

  // ── 22. Multi-tool in single response (parallel tool calls) ─────────────

  it("22. handles multiple tool_use blocks in a single response", async () => {
    const createMock = vi.fn()
      .mockResolvedValueOnce({
        stop_reason: "tool_use",
        content: [
          { type: "tool_use", id: "tool-a", name: "lookup_appointments", input: {} },
          { type: "tool_use", id: "tool-b", name: "search_availability", input: { service_id: "svc-uuid-1", date_from: "2026-07-15", date_to: "2026-07-15" } },
        ],
      })
      .mockResolvedValueOnce(textResponse("Encontrei seus agendamentos e horários disponíveis."));

    const { service, agentApi } = buildService({ anthropicCreateImpl: createMock });

    const result = await service.handle({
      tenantId: TENANT_A, threadId: THREAD_1, patientId: PATIENT_1,
      patientPhone: "5511000000014", patientName: null,
      messageText: "o que tenho e o que tem disponível?", correlationId: "corr-22",
    });

    expect(agentApi.lookupAppointments).toHaveBeenCalledOnce();
    expect(agentApi.getAvailability).toHaveBeenCalledOnce();
    expect(result.status).toBe("COMPLETED");

    // Second call should have two tool_results in user message
    const secondCall = createMock.mock.calls[1]?.[0]?.messages as Array<{ role: string; content: unknown }>;
    const toolResultMsg = secondCall?.find((m) => m.role === "user");
    expect(Array.isArray(toolResultMsg?.content)).toBe(true);
    expect((toolResultMsg?.content as unknown[]).length).toBe(2);
  });

  // ── 23. SECURITY: tenantId is scoped on all agentApi calls ──────────────

  it("23. SECURITY: all agentApi calls use the correct tenantId", async () => {
    const createMock = vi.fn()
      .mockResolvedValueOnce(toolUseResponse("search_availability", {
        service_id: "svc-uuid-1",
        date_from: "2026-07-10",
        date_to: "2026-07-10",
      }))
      .mockResolvedValueOnce(textResponse("ok"));

    const { service, agentApi } = buildService({ anthropicCreateImpl: createMock });

    await service.handle({
      tenantId: TENANT_B,
      threadId: "thread-b-1",
      patientId: null,
      patientPhone: "5522000000001",
      patientName: null,
      messageText: "disponibilidade",
      correlationId: "corr-23",
    });

    expect(agentApi.getAvailability).toHaveBeenCalledWith(
      TENANT_B,
      expect.anything(),
    );

    // Confirm tenant-A was NOT used
    const calls = (agentApi.getAvailability as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.every((c: unknown[]) => c[0] === TENANT_B)).toBe(true);
  });

  // ── 24. SECURITY: DB queries are scoped to threadId (not cross-thread) ──

  it("24. SECURITY: history load is scoped to the correct threadId", async () => {
    const createMock = vi.fn().mockResolvedValue(textResponse("ok"));
    const { service, prisma } = buildService({ anthropicCreateImpl: createMock });

    await service.handle({
      tenantId: TENANT_A,
      threadId: "specific-thread-xyz",
      patientId: null,
      patientPhone: "5511000000015",
      patientName: null,
      messageText: "oi",
      correlationId: "corr-24",
    });

    expect(prisma.messageEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ threadId: "specific-thread-xyz" }),
      }),
    );
  });

  // ── 25. send_message skill context uses correct actor and threadId ───────

  it("25. send_message skill is called with system:llm-agent actor and correct threadId", async () => {
    const createMock = vi.fn().mockResolvedValue(textResponse("Agendado com sucesso!"));
    const { service, skillExecutor } = buildService({ anthropicCreateImpl: createMock });

    await service.handle({
      tenantId: TENANT_A,
      threadId: "thread-skill-test",
      patientId: null,
      patientPhone: "5511000000016",
      patientName: null,
      messageText: "confirma",
      correlationId: "corr-25",
    });

    expect(skillExecutor.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          actorUserId: `system:llm-agent:${TENANT_A}`,
          tenantId: TENANT_A,
          threadId: "thread-skill-test",
        }),
      }),
    );
  });
});
