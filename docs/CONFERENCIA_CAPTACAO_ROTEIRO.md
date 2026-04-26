# Conferência de Alinhamento — Prontidão para Captação

**Data**: 05 de abril de 2026  
**Duração**: 60 minutos  
**Objetivo**: Alinhar time sobre o que está pronto, o que não está, e definir como captar com honestidade comercial.

---

## ANTES DA REUNIÃO — Checklist de 5 minutos

Quem vai rodar o demo precisa fazer isso antes de entrar na sala:

- [ ] API local rodando (`npm run api:ready:check` → EXIT 0)
- [ ] Tenant de demo com dados de estética carregados (botox, harmonização, preenchimento)
- [ ] Login de recepcionista de demo funcionando
- [ ] WhatsApp mock ativado no `.env` local (`WHATSAPP_PROVIDER=mock`)
- [ ] Navegador sem extensão que quebre layout (usar Chrome limpo)
- [ ] Tela cheia, font size legível para quem vai assistir

---

## PARTE 1 — DEMO AO VIVO (20 min)

Rodar sem preparação prévia. O ponto é mostrar o fluxo real, não o fluxo ensaiado.

### Sequência obrigatória

#### 1. Login da clínica (2 min)
- Acessar URL da aplicação web
- Fazer login com usuário de recepcionista da clínica demo
- **Mostrar**: painel de recepção carregado com agenda do dia
- **Critério de aprovação**: nenhum erro 500, tela carregada em menos de 3s

#### 2. Buscar disponibilidade e criar agendamento (7 min)
- Buscar paciente pelo nome (deve encontrar rapidamente)
- Clicar em "Novo agendamento"
- Selecionar profissional + especialidade estética + data
- Ver slots disponíveis retornados pelo backend
- Selecionar slot e confirmar
- **Mostrar**: appointment aparece na agenda do dia
- **Critério de aprovação**: fluxo completo sem reload ou erro

#### 3. Check-in do paciente (3 min)
- Na agenda do dia, localizar o agendamento recém-criado
- Fazer check-in
- **Mostrar**: status muda para "Em atendimento"
- **Critério de aprovação**: mudança de status visível sem delay

#### 4. No-show e cancelamento (4 min)
- Mostrar outro agendamento
- Marcar como no-show OU cancelar
- **Mostrar**: histórico de status registrado
- **Critério de aprovação**: sistema registra, não permite estado inválido

#### 5. Inbox e handoff (4 min)
- Abrir inbox de mensagens
- Mostrar thread com paciente (mock WhatsApp)
- Abrir handoff para "equipe"
- **Mostrar**: handoff registrado com prioridade
- **Critério de aprovação**: handoff criado, não perdido

---

## PARTE 2 — MAPA DE PERGUNTAS DO LEAD (15 min)

Preparar resposta honesta para as perguntas mais prováveis:

### Sobre WhatsApp
> "O sistema integra com WhatsApp?"

**Resposta**: Sim. O sistema recebe e envia mensagens pelo WhatsApp Business API (Meta). A configuração é feita por clínica — você precisa de um número dedicado. Os primeiros clientes vão validar essa integração conosco em campo.

**Não dizer**: "está 100% operacional em produção" — porque falta validação real com número real.

---

### Sobre app do profissional
> "O profissional consegue ver a agenda pelo celular?"

**Resposta**: A agenda está acessível pelo navegador mobile. O aplicativo dedicado para o profissional está em desenvolvimento — previsão de entrega nas próximas semanas para os primeiros clientes.

**Não dizer**: "tem app" — porque o app móvel existe como projeto Flutter mas não está entregue.

---

### Sobre preço e ativação
> "Quanto custa e quanto tempo para ativar?"

**Resposta**: [Definir o time o preço antes da reunião]. Ativação leva de 1 a 3 dias úteis — criamos a clínica, configuramos o WhatsApp, treinamos a recepcionista.

**Não dizer**: "ativa no mesmo dia" — isso depende da configuração do WhatsApp Meta ainda não validada end-to-end.

---

### Sobre prontuário e procedimentos estéticos
> "Tem prontuário? Plano de tratamento? Histórico de procedimentos?"

**Resposta**: O sistema tem protocolos de procedimentos (Botox, Harmonização, Preenchimento, etc.) com controle de sessões. Prontuário completo com consentimento e fotos antes/depois está no roadmap — é uma das próximas evoluções do produto.

---

### Sobre segurança e dados do paciente
> "Onde ficam os dados? É seguro?"

**Resposta**: Dados por clínica completamente isolados — nenhuma clínica acessa dados de outra. Hospedagem em nuvem com criptografia, controle de acesso por papel (recepcionista, gestor, plataforma) e trilha de auditoria de toda ação.

---

### Sobre suporte
> "Se der problema, quem me ajuda?"

**Resposta**: Atendimento direto pela equipe OperaClinic durante o piloto. Os primeiros clientes têm suporte próximo e contato direto com o time de produto.

---

## PARTE 3 — DECISÃO: CAPTAR AGORA OU FECHAR GAPS PRIMEIRO? (15 min)

### Opção A — Captar agora como beta comercial

**Argumentos a favor**:
- Core de recepção e scheduling está funcional e testado (198 testes passando, E2E verde)
- Multi-tenant e isolamento validados
- WhatsApp mock funcional para demo, Meta API existe (falta só validação em campo)
- Receita antecipada financia fechamento dos gaps

**Condições obrigatórias**:
- Ser explícito com o lead: "Você é cliente fundador / beta"
- Oferecer preço diferenciado + SLA de suporte próximo
- Não prometer ativação instantânea ou app profissional antes do prazo real
- Ter termo de aceite que menciona "funcionalidades em evolução"

**Lead ideal para captar agora**: Clínica pequena, 1–2 profissionais, recepcionista dedicada, dono operativo, baixa complexidade de integração.

---

### Opção B — Fechar os 4 gaps críticos primeiro, depois captar

**Tempo estimado para fechar os 4 gaps**:

| Gap | Estimativa |
|---|---|
| Validação Stripe em produção | 1–2 dias (setup + teste real) |
| Validação WhatsApp Meta em produção | 2–5 dias (número real + Meta admin + inbound/outbound) |
| App profissional mínimo | 2–4 semanas |
| Cron de reminder 24h nativo | 1–2 dias |

**Total sem app profissional**: ~1 semana  
**Total com app profissional**: ~4 semanas

**Recomendação do produto**: Fazer Opção A com o perfil certo de lead enquanto fecha Stripe + WhatsApp (1 semana). App profissional pode ser "roadmap próxima versão" para primeiros clientes.

---

## PARTE 4 — GAPS POR PRIORIDADE (10 min)

Após o debate, definir **dono e prazo** para cada gap:

### P0 — Bloqueia ativação de cliente pagante

| Gap | O que é | Próximo passo | Dono | Prazo |
|---|---|---|---|---|
| Stripe produção | Webhook → ativação real sem teste | Criar conta Stripe real, configurar webhook, fazer checkout com cartão real, checar ativação automática | ___ | ___ |
| WhatsApp Meta produção | Token real + número real + inbound testado | Seguir `docs/WHATSAPP_EXECUTION_2_3_1_RUNBOOK.md` D0 | ___ | ___ |

### P1 — Bloqueia demonstração completa ou UX crítica

| Gap | O que é | Próximo passo | Dono | Prazo |
|---|---|---|---|---|
| App profissional | Não existe tela real | Definir MVP mínimo: agenda pessoal + check-in | ___ | ___ |
| Cron reminder 24h | Depende de trigger externo | Adicionar `@Cron` no módulo de follow-ups | ___ | ___ |

### P2 — Técnico, não bloqueia captação mas bloqueia escala

| Gap | O que é | Próximo passo | Dono | Prazo |
|---|---|---|---|---|
| Buffer de observabilidade volátil | Métricas perdem ao reiniciar | Persistir no banco ou exportar para APM | ___ | ___ |
| Deduplicação de webhook sem providerEventId | Mensagens duplicadas possíveis | Fingerprint por payload como fallback | ___ | ___ |
| Webhook Stripe silencia erro | Evento pode ser perdido | Log explícito + alert crítico se falhar | ___ | ___ |

---

## SAÍDA OBRIGATÓRIA DA REUNIÃO

Ao final dos 60 minutos, o time deve ter respondido:

1. **O demo passou ao vivo sem erro?** → Sim / Não (se não, o que travou?)
2. **Qual é o perfil do primeiro lead que vamos abordar?** → Descrever em 2 frases
3. **É Opção A ou B?** → Definir com data
4. **P0 gaps: quem é o dono e qual é a data?** → Preencher a tabela acima
5. **Qual é o pitch de 30 segundos?** → Escrever e ler em voz alta antes de sair da sala

---

## PITCH DE 30 SEGUNDOS — RASCUNHO

> "OperaClinic é o sistema de operação para clínicas estéticas que reduz no-show e organiza a recepção pelo WhatsApp. A recepcionista agenda, confirma e faz check-in direto pelo sistema — sem planilha, sem papel. Os primeiros clientes entram com suporte próximo do time e condições especiais de fundador."

Ajustar com o time antes de usar em campo.

---

## REFERÊNCIAS

- [PROJECT_COMPLETION_CHECKLIST.md](PROJECT_COMPLETION_CHECKLIST.md) — estado atual por módulo
- [PILOT_READINESS_PLAN.md](PILOT_READINESS_PLAN.md) — gaps operacionais detalhados
- [WHATSAPP_EXECUTION_2_3_1_RUNBOOK.md](WHATSAPP_EXECUTION_2_3_1_RUNBOOK.md) — como configurar WhatsApp por clínica
- [RELEASE_GO_NO_GO_CHECKLIST.md](../RELEASE_GO_NO_GO_CHECKLIST.md) — evidências de release de 01/04/2026
- [AI_OPERATIONAL_VALIDATION_2026-04-03.md](AI_OPERATIONAL_VALIDATION_2026-04-03.md) — validação de agentes e guardrails
