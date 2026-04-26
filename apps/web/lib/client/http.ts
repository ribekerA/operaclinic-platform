export interface ApiErrorPayload {
  message?: string | string[];
  statusCode?: number;
}

export class ApiRequestError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(status: number, message: string, payload: unknown) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.payload = payload;
  }
}

function resolveErrorMessage(payload: unknown, fallback: string): string {
  if (
    payload &&
    typeof payload === "object" &&
    "message" in payload
  ) {
    const rawMessage = (payload as ApiErrorPayload).message;

    if (typeof rawMessage === "string" && rawMessage.trim()) {
      return rawMessage;
    }

    if (Array.isArray(rawMessage) && rawMessage.length > 0) {
      return rawMessage.join(", ");
    }
  }

  return fallback;
}

async function parseBody(response: Response): Promise<unknown> {
  const rawBody = await response.text();

  if (!rawBody) {
    return null;
  }

  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    return { message: rawBody };
  }
}

export async function requestJson<TResponse>(
  path: string,
  init?: RequestInit,
): Promise<TResponse> {
  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const payload = await parseBody(response);

  if (!response.ok) {
    const message = resolveErrorMessage(
      payload,
      `Request failed with status ${response.status}.`,
    );

    throw new ApiRequestError(response.status, message, payload);
  }

  return payload as TResponse;
}

export function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiRequestError) {
    return error.message;
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
}

