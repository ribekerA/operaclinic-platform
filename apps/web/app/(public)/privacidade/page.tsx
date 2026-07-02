import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de Privacidade | OperaClinic",
  description: "Como o OperaClinic coleta, usa e protege os dados das clínicas e pacientes.",
  alternates: { canonical: "/privacidade" },
};

export default function PrivacidadePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-10 py-8">
      <div className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">
          Legal
        </p>
        <h1 className="text-4xl font-semibold leading-tight text-ink">
          Política de Privacidade
        </h1>
        <p className="text-sm text-muted">
          Última atualização: {new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
        </p>
      </div>

      <div className="prose prose-slate max-w-none space-y-8 text-slate-700">
        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-ink">1. Quem somos</h2>
          <p className="text-sm leading-7">
            O OperaClinic é uma plataforma SaaS voltada para gestão operacional de clínicas estéticas privadas,
            desenvolvida e operada por OperaClinic Tecnologia Ltda. Esta política descreve como tratamos os dados
            coletados durante o uso do produto e do site.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-ink">2. Dados coletados</h2>
          <p className="text-sm leading-7">Coletamos dados em três contextos:</p>
          <ul className="space-y-2 text-sm leading-7">
            <li><strong>Cadastro da clínica:</strong> nome, e-mail, telefone, CNPJ e dados do responsável.</li>
            <li><strong>Uso da plataforma:</strong> registros de agendamento, histórico de atendimentos, configurações da operação.</li>
            <li><strong>Acesso ao site:</strong> dados de navegação coletados via cookies analíticos (quando habilitados).</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-ink">3. Como usamos os dados</h2>
          <ul className="space-y-2 text-sm leading-7">
            <li>Operar, manter e melhorar a plataforma.</li>
            <li>Enviar comunicações transacionais (confirmações, alertas de operação).</li>
            <li>Oferecer suporte via WhatsApp ou e-mail.</li>
            <li>Cumprir obrigações legais e regulatórias.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-ink">4. Compartilhamento</h2>
          <p className="text-sm leading-7">
            Não vendemos dados. Compartilhamos apenas com fornecedores de infraestrutura (ex: cloud, pagamento)
            estritamente necessários para operar o serviço, e quando exigido por lei.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-ink">5. Segurança</h2>
          <p className="text-sm leading-7">
            Utilizamos criptografia em trânsito (TLS) e em repouso onde aplicável. Acesso aos dados é restrito por
            função. Realizamos revisões periódicas de segurança.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-ink">6. Seus direitos (LGPD)</h2>
          <p className="text-sm leading-7">
            Você tem direito a acessar, corrigir, portar ou solicitar a exclusão dos seus dados. Para exercer
            qualquer direito, entre em contato via{" "}
            <a
              href="https://wa.me/5511968771362"
              className="text-accent underline underline-offset-2 hover:opacity-80"
              target="_blank"
              rel="noopener noreferrer"
            >
              WhatsApp
            </a>
            {" "}ou pelo e-mail indicado no contrato da sua clínica.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-ink">7. Cookies</h2>
          <p className="text-sm leading-7">
            Utilizamos cookies técnicos essenciais para o funcionamento da plataforma. Cookies analíticos são
            opcionais e ativados apenas com consentimento explícito.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-ink">8. Contato</h2>
          <p className="text-sm leading-7">
            Dúvidas sobre esta política? Fale com o nosso time pelo{" "}
            <a
              href="https://wa.me/5511968771362?text=Dúvida%20sobre%20política%20de%20privacidade"
              className="text-accent underline underline-offset-2 hover:opacity-80"
              target="_blank"
              rel="noopener noreferrer"
            >
              WhatsApp comercial
            </a>.
          </p>
        </section>
      </div>
    </div>
  );
}
