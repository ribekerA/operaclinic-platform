# Professional Mobile — Status: protótipo, fora do escopo do piloto

Este diretório contém o app Flutter para o profissional de clínica (login + dashboard de workspace).

**Não faz parte do MVP comercializável.** O app está em desenvolvimento inicial e não está:

- entregue a nenhuma clínica
- incluído no CI/CD do repositório
- implantado em nenhum ambiente de produção ou staging
- coberto por testes automatizados

## Estado atual

- Login de profissional (perfil clinic)
- Carregamento do dashboard do workspace profissional
- Atualização manual dos dados
- Dois endpoints conectados: `POST /auth/login` e `GET /professional-workspace/dashboard`

## Para rodar localmente (desenvolvimento)

```bash
flutter run --dart-define=API_BASE_URL=http://localhost:3001/api/v1
```

## Pré-requisitos

- Flutter SDK instalado (versão especificada em `pubspec.yaml`)
- API local em execução (`pnpm --filter @operaclinic/api start:dev`)

## Estrutura

- `lib/src/features/auth` — login e sessão
- `lib/src/features/workspace` — dashboard profissional
- `lib/src/core/network` — cliente HTTP e autorização

## Escopo futuro

O app profissional está planejado para uma fase posterior ao piloto comercial. A decisão de prioridade e prazo é do time. Não assuma que este código representa uma feature pronta — trate como protótipo de validação de UX.
