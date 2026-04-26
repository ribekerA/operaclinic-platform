"use client";

import { requestJson } from "@/lib/client/http";
import type {
  CommercialOnboardingSummaryPayload,
  CommercialPlanSummaryPayload,
  CommercialStartOnboardingResponsePayload,
  CompleteCommercialOnboardingPayload,
  StartCommercialOnboardingPayload,
  CommercialAdminListOnboardingsQuery,
  CommercialAdminOnboardingSummary,
} from "@operaclinic/shared";

export function listPublicCommercialPlans(): Promise<CommercialPlanSummaryPayload[]> {
  return requestJson<CommercialPlanSummaryPayload[]>("/api/commercial/plans");
}

export function startCommercialOnboarding(
  payload: StartCommercialOnboardingPayload,
): Promise<CommercialStartOnboardingResponsePayload> {
  return requestJson<CommercialStartOnboardingResponsePayload>(
    "/api/commercial/onboarding/start",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export function getCommercialOnboarding(
  onboardingToken: string,
): Promise<CommercialOnboardingSummaryPayload> {
  return requestJson<CommercialOnboardingSummaryPayload>(
    `/api/commercial/onboarding/${onboardingToken}`,
  );
}

export function completeCommercialOnboarding(
  onboardingToken: string,
  payload: CompleteCommercialOnboardingPayload,
): Promise<CommercialOnboardingSummaryPayload> {
  return requestJson<CommercialOnboardingSummaryPayload>(
    `/api/commercial/onboarding/${onboardingToken}/complete`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export function confirmCommercialCheckout(
  onboardingToken: string,
  sessionId?: string,
): Promise<CommercialOnboardingSummaryPayload> {
  const params = new URLSearchParams();

  if (sessionId) {
    params.set("sessionId", sessionId);
  }

  const queryString = params.toString();

  return requestJson<CommercialOnboardingSummaryPayload>(
    `/api/commercial/onboarding/${onboardingToken}/confirm-checkout${queryString ? `?${queryString}` : ""}`,
    {
      method: "POST",
    },
  );
}

export function finalizeCommercialOnboarding(
  onboardingToken: string,
): Promise<CommercialOnboardingSummaryPayload> {
  return requestJson<CommercialOnboardingSummaryPayload>(
    `/api/commercial/onboarding/${onboardingToken}/finalize`,
    {
      method: "POST",
    },
  );
}

export function listAdminOnboardings(
  query: CommercialAdminListOnboardingsQuery,
): Promise<CommercialAdminOnboardingSummary[]> {
  const params = new URLSearchParams();
  if (query.status) params.append("status", query.status);
  if (query.search) params.append("search", query.search);
  if (query.page) params.append("page", query.page);
  if (query.limit) params.append("limit", query.limit);

  const queryString = params.toString();
  const url = `/api/admin/commercial/onboardings${queryString ? `?${queryString}` : ""}`;

  return requestJson<CommercialAdminOnboardingSummary[]>(url);
}

