import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Termos de Uso | OperaClinic",
  description: "Condições de uso da plataforma OperaClinic para clínicas estéticas.",
  alternates: { canonical: "/termos" },
};

export default function TermosPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-10 py-8">
      <div className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">
          Legal
        </p>
        <h1 className="text-4xl font-semibold leading-tight text-ink">
          Termos de Uso
        </h1>
        <p className="text-sm text-muted">
          Última atualização: {new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
        </p>
      </div>

      <div className="prose prose-slate max-w-none space-y-8 text-slate-700">
        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-ink">1. Aceitação</h2>
          <p className="text-sm leading-7">
            Ao criar uma conta ou utilizar o OperaClinic, você concorda com estes Termos de Uso. Se não concordar
            com qualquer parte, não utilize o serviço.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-ink">2. Descrição do serviço</h2>
          <p className="text-sm leading-7">
            O OperaClinic é uma plataforma SaaS para gestão operacional de clínicas estéticas privadas, oferecendo
            módulos de recepção web, agenda por profissional e integração com WhatsApp. O serviço é prestado
            mediante assinatura de plano comercial.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-ink">3. Conta e responsabilidade</h2>
          <ul className="space-y-2 text-sm leading-7">
            <li>O titular da conta é responsável por todas as atividades realizadas com suas credenciais.</li>
            <li>Dados cadastrais devem ser precisos e mantidos atualizados.</li>
            <li>O compartilhamento de credenciais com terceiros não autorizados é vedado.</li>
            <li>Notifique-nos imediatamente em caso de acesso não autorizado.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-ink">4. Planos e pagamento</h2>
          <p className="text-sm leading-7">
            O acesso à plataforma está condicionado ao pagamento da assinatura do plano escolhido. Os valores e
            condições estão disponíveis na{" "}
            <Link href="/planos" className="text-accent underline underline-offset-2 hover:opacity-80">
              página de planos
            </Link>
            . Pagamentos são processados por parceiros homologados. Não armazenamos dados de cartão de crédito.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-ink">5. Cancelamento</h2>
          <p className="text-sm leading-7">
            Você pode cancelar sua assinatura a qualquer momento pelo painel ou via WhatsApp. O acesso permanece
            ativo até o fim do período já pago. Não há reembolso proporcional de períodos parcialmente utilizados,
            salvo em casos previstos em lei.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-ink">6. Uso permitido</h2>
          <p className="text-sm leading-7">É vedado:</p>
          <ul className="space-y-2 text-sm leading-7">
            <li>Utilizar o serviço para fins ilegais ou fraudulentos.</li>
            <li>Tentar acessar dados de outras clínicas ou comprometer a segurança da plataforma.</li>
            <li>Revender ou sublicenciar o acesso a terceiros sem autorização prévia.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-ink">7. Limitação de responsabilidade</h2>
          <p className="text-sm leading-7">
            O OperaClinic não se responsabiliza por perdas decorrentes de uso indevido da plataforma, interrupções
            de serviços de terceiros (WhatsApp, operadoras) ou eventos fora do nosso controle. Nos esforçamos para
            manter disponibilidade de 99,5% ao mês.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-ink">8. Privacidade</h2>
          <p className="text-sm leading-7">
            O tratamento de dados pessoais é regido pela nossa{" "}
            <Link href="/privacidade" className="text-accent underline underline-offset-2 hover:opacity-80">
              Política de Privacidade
            </Link>
            , em conformidade com a LGPD (Lei 13.709/2018).
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-ink">9. Alterações nos termos</h2>
          <p className="text-sm leading-7">
            Podemos atualizar estes termos periodicamente. Notificaremos por e-mail ou painel com antecedência
            mínima de 15 dias para mudanças relevantes. O uso continuado após a vigência constitui aceitação.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-ink">10. Foro e lei aplicável</h2>
          <p className="text-sm leading-7">
            Estes termos são regidos pelas leis brasileiras. Fica eleito o foro da comarca de São Paulo — SP para
            dirimir quaisquer controvérsias.
          </p>
        </section>
      </div>
    </div>
  );
}
