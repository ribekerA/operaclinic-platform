import { NextResponse } from "next/server";
import { requestBackendPublic } from "@/lib/server/backend-session";

export const dynamic = "force-dynamic";

type RuntimeHealthStatus = "ok" | "degraded" | "down";

interface RuntimeStatusPayload {
  checkedAt: string;
  environment: string;
  web: {
    status: RuntimeHealthStatus;
    message: string;
  };
  api: {
    status: RuntimeHealthStatus;
    statusCode: number | null;
    message: string;
  };
}

export async function GET(): Promise<NextResponse> {
  const checkedAt = new Date().toISOString();

  const payload: RuntimeStatusPayload = {
    checkedAt,
    environment: process.env.NODE_ENV ?? "development",
    web: {
      status: "ok",
      message: "Next.js servindo a suite web local.",
    },
    api: {
      status: "down",
      statusCode: null,
      message: "API indisponivel.",
    },
  };

  try {
    const result = await requestBackendPublic({
      method: "GET",
      path: "/health",
    });

    const isHealthy =
      result.status >= 200 &&
      result.status < 300 &&
      result.data &&
      typeof result.data === "object" &&
      "status" in result.data &&
      (result.data as { status?: string }).status === "ok";

    payload.api = {
      status: isHealthy ? "ok" : "degraded",
      statusCode: result.status,
      message: isHealthy
        ? "Backend respondeu ao healthcheck."
        : "Backend respondeu, mas fora do esperado.",
    };
  } catch {
    payload.api = {
      status: "down",
      statusCode: null,
      message: "Nao foi possivel atingir o backend.",
    };
  }

  return NextResponse.json(payload);
}
