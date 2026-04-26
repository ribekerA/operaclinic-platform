import type {
  AestheticClinicExecutiveDashboardQuery,
  AestheticClinicExecutiveDashboardResponse,
} from "@operaclinic/shared";
import { requestJson } from "@/lib/client/http";

function buildQuery(query?: AestheticClinicExecutiveDashboardQuery): string {
  if (!query) {
    return "";
  }

  const params = new URLSearchParams();

  if (query.periodDays && query.periodDays.trim()) {
    params.set("periodDays", query.periodDays.trim());
  }

  const queryString = params.toString();
  return queryString ? `?${queryString}` : "";
}

export async function getAestheticClinicExecutiveDashboard(
  query?: AestheticClinicExecutiveDashboardQuery,
): Promise<AestheticClinicExecutiveDashboardResponse> {
  return requestJson<AestheticClinicExecutiveDashboardResponse>(
    `/api/clinic/executive-dashboard${buildQuery(query)}`,
  );
}
