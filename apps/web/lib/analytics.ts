// Analytics utility — envia eventos para GA4 quando NEXT_PUBLIC_GA_MEASUREMENT_ID estiver configurado.
// Em desenvolvimento sem ID, loga no console para validação.
//
// Uso:
//   import { track } from "@/lib/analytics";
//   track("plan_viewed", { plan_id: "starter", plan_name: "Inicial" });

type TrackProperties = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export function track(eventName: string, properties?: TrackProperties): void {
  if (typeof window === "undefined") return;

  if (window.gtag) {
    window.gtag("event", eventName, properties ?? {});
    return;
  }

  if (process.env.NODE_ENV === "development") {
    console.debug("[analytics]", eventName, properties ?? {});
  }
}

// Eventos pré-definidos — use estes em vez de strings livres para consistência

export const Analytics = {
  // Funil público
  planPageViewed: () =>
    track("plan_page_viewed"),

  planSelected: (planId: string, planName: string) =>
    track("plan_selected", { plan_id: planId, plan_name: planName }),

  registrationStarted: (planId: string) =>
    track("registration_started", { plan_id: planId }),

  registrationCompleted: (planId: string) =>
    track("registration_completed", { plan_id: planId }),

  checkoutStarted: (planId: string) =>
    track("checkout_started", { plan_id: planId }),

  checkoutCompleted: (planId: string) =>
    track("checkout_completed", { plan_id: planId }),

  // Autenticação
  loginSuccess: (profile: "clinic" | "platform") =>
    track("login_success", { profile }),

  loginError: (profile: "clinic" | "platform") =>
    track("login_error", { profile }),

  // Ativação (aha moment)
  firstAppointmentConfirmed: () =>
    track("first_appointment_confirmed"),

  firstCheckIn: () =>
    track("first_check_in"),

  // Recepção (retenção)
  receptionDayOpened: () =>
    track("reception_day_opened"),

  appointmentStatusChanged: (from: string, to: string) =>
    track("appointment_status_changed", { from_status: from, to_status: to }),

  appointmentRescheduled: () =>
    track("appointment_rescheduled"),

  // Onboarding interno (clínica)
  whatsappIntegrationStarted: () =>
    track("whatsapp_integration_started"),

  professionalCreated: () =>
    track("professional_created"),
} as const;
