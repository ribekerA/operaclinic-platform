import {
  AdminPageHeader,
  AdminShortcutPanel,
} from "@/components/platform/platform-admin";
import { ReceptionInbox } from "@/components/reception/reception-inbox";

export default function ClinicInboxPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Clinica | Inbox"
        title="Conversas que pedem atencao humana"
        description="Acompanhe os transbordos da IA e trate rapidamente os casos que sairam do fluxo automatico."
      >
        <AdminShortcutPanel
          title="Acoes rapidas"
          items={[
            {
              label: "Recepcao",
              description: "Voltar para fila e agenda do dia.",
              href: "/clinic/reception",
            },
            {
              label: "Mensageria",
              description: "Abrir a area completa de mensagens.",
              href: "/clinic/messaging",
            },
            {
              label: "Pacientes",
              description: "Abrir a base para vinculos e conferencias.",
              href: "/clinic/patients",
            },
          ]}
        />
      </AdminPageHeader>

      <ReceptionInbox />
    </div>
  );
}
