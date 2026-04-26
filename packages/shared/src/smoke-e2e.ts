export const SMOKE_E2E = {
  tenantSlug: "estetica-demo",
  clinicLoginPath: "/login/clinic",
  platformLoginPath: "/login/platform",
  smokePassword: "Smoke@123",
  smokeChangedPassword: "Smoke@456",
  platform: {
    email: "superadmin@operaclinic.local",
    password: "ChangeMe123!",
  },
  aestheticClinicAdmin: {
    email: "admin@estetica-demo.local",
    password: "Demo@123",
  },
  aestheticClinicReception: {
    email: "recepcao@estetica-demo.local",
    password: "Demo@123",
  },
  aestheticClinicAccountUser: {
    email: "smoke.account@estetica-demo.local",
    fullName: "Smoke Account User",
  },
  aestheticClinicResetUser: {
    email: "smoke.reset@estetica-demo.local",
    fullName: "Smoke Reset User",
  },
  aestheticClinicLifecycleUser: {
    email: "smoke.lifecycle@estetica-demo.local",
    fullName: "Smoke Lifecycle User",
  },
  aestheticClinicResources: {
    unitName: "Unidade Estetica Smoke E2E",
    consultationTypeName: "Avaliacao Estetica Smoke E2E",
    professionalRegister: "ESTETICA-SMOKE-E2E",
    professionalFullName: "Dra. Estetica Smoke E2E",
    professionalDisplayName: "Dra. Estetica Smoke",
    patientFullName: "Paciente Smoke E2E",
    patientContactValue: "+5511999000001",
    patientDocumentNumber: "SMOKE-E2E-PACIENTE-ESTETICA",
    appointmentNote: "Atendimento estetico Smoke E2E",
    appointmentRoom: "Sala Estetica Smoke",
  },
} as const;

export type SmokeE2EConfig = typeof SMOKE_E2E;
