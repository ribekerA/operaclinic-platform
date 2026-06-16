import { NextRequest, NextResponse } from "next/server";
import { requestBackendRawText } from "@/lib/server/backend-session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const result = await requestBackendRawText({
    method: "GET",
    path: "/reports/patients/csv",
    queryString: request.nextUrl.searchParams.toString(),
  });

  if (result.status !== 200) {
    return new NextResponse(result.text, { status: result.status });
  }

  return new NextResponse(result.text, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pacientes.csv"`,
    },
  });
}
