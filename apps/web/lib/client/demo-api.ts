import { requestJson, toErrorMessage } from "@/lib/client/http";

export interface CreateLeadDemoResult {
  slug: string;
  expiresAt: string;
}

export async function createLeadDemo(clinicName: string): Promise<CreateLeadDemoResult> {
  return requestJson<CreateLeadDemoResult>("/api/demo/multi", {
    method: "POST",
    body: JSON.stringify({ clinicName }),
  });
}

export async function notifyFounderOfDemoBooking(
  slug: string,
  appointmentId: string,
): Promise<{ notified: boolean }> {
  return requestJson<{ notified: boolean }>(`/api/demo/multi/${slug}/notify-founder`, {
    method: "POST",
    body: JSON.stringify({ appointmentId }),
  });
}

export { toErrorMessage };
