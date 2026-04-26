import type {
  AssignMessagingHandoffPayload,
  CloseMessagingHandoffPayload,
  CreateMessagingIntegrationConnectionPayload,
  CreateMessagingIntegrationConnectionResponsePayload,
  MessagingHandoffListItemPayload,
  MessagingHandoffListQuery,
  MessagingHandoffPayload,
  MessagingIntegrationConnectionPayload,
  MessagingThreadDetailPayload,
  MessagingThreadListQuery,
  MessagingThreadSummaryPayload,
  OpenMessagingHandoffPayload,
  ResolveMessagingThreadPayload,
  SendMessagingThreadMessagePayload,
  UpdateMessagingThreadPatientPayload,
} from "@operaclinic/shared";
import { requestJson } from "@/lib/client/http";

function buildQuery(query?: Record<string, unknown>): string {
  if (!query) {
    return "";
  }

  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) {
      continue;
    }

    if (typeof value === "string" && !value.trim()) {
      continue;
    }

    params.set(key, String(value));
  }

  const queryString = params.toString();
  return queryString ? `?${queryString}` : "";
}

export async function listMessagingThreads(
  query?: MessagingThreadListQuery,
): Promise<MessagingThreadSummaryPayload[]> {
  return requestJson<MessagingThreadSummaryPayload[]>(
    `/api/messaging/threads${buildQuery(query as Record<string, unknown> | undefined)}`,
  );
}

export async function listMessagingIntegrations(): Promise<
  MessagingIntegrationConnectionPayload[]
> {
  return requestJson<MessagingIntegrationConnectionPayload[]>("/api/integrations");
}

export async function createMessagingIntegration(
  payload: CreateMessagingIntegrationConnectionPayload,
): Promise<CreateMessagingIntegrationConnectionResponsePayload> {
  return requestJson<CreateMessagingIntegrationConnectionResponsePayload>(
    "/api/integrations",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function getMessagingThread(
  threadId: string,
): Promise<MessagingThreadDetailPayload> {
  return requestJson<MessagingThreadDetailPayload>(`/api/messaging/threads/${threadId}`);
}

export async function linkMessagingThreadPatient(
  threadId: string,
  payload: UpdateMessagingThreadPatientPayload,
): Promise<MessagingThreadDetailPayload> {
  return requestJson<MessagingThreadDetailPayload>(
    `/api/messaging/threads/${threadId}/patient`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function resolveMessagingThread(
  threadId: string,
  payload: ResolveMessagingThreadPayload = {},
): Promise<MessagingThreadDetailPayload> {
  return requestJson<MessagingThreadDetailPayload>(
    `/api/messaging/threads/${threadId}/resolve`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function sendMessagingThreadMessage(
  threadId: string,
  payload: SendMessagingThreadMessagePayload,
): Promise<MessagingThreadDetailPayload> {
  return requestJson<MessagingThreadDetailPayload>(
    `/api/messaging/threads/${threadId}/messages`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function listMessagingHandoffs(
  query?: MessagingHandoffListQuery,
) : Promise<MessagingHandoffListItemPayload[]> {
  return requestJson<MessagingHandoffListItemPayload[]>(
    `/api/messaging/handoffs${buildQuery(query as Record<string, unknown> | undefined)}`,
  );
}

export async function openMessagingHandoff(
  payload: OpenMessagingHandoffPayload,
): Promise<MessagingHandoffPayload> {
  return requestJson<MessagingHandoffPayload>("/api/messaging/handoffs", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function assignMessagingHandoff(
  handoffId: string,
  payload: AssignMessagingHandoffPayload,
): Promise<MessagingHandoffPayload> {
  return requestJson<MessagingHandoffPayload>(
    `/api/messaging/handoffs/${handoffId}/assign`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function closeMessagingHandoff(
  handoffId: string,
  payload: CloseMessagingHandoffPayload = {},
): Promise<MessagingHandoffPayload> {
  return requestJson<MessagingHandoffPayload>(
    `/api/messaging/handoffs/${handoffId}/close`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}
