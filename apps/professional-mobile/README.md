# Professional Mobile (Flutter)

Scaffold inicial do app do profissional para o OperaClinic.

## Escopo inicial

- Login de profissional (perfil clinic)
- Carregamento do dashboard do workspace profissional
- Atualizacao manual dos dados

## Variaveis de ambiente (via --dart-define)

- `API_BASE_URL`: URL base da API, ex: `http://localhost:3001/api/v1`

Exemplo:

```bash
flutter run --dart-define=API_BASE_URL=http://localhost:3001/api/v1
```

## Fluxos conectados

- `POST /auth/login`
- `GET /professional-workspace/dashboard`

## Estrutura

- `lib/src/features/auth`: login e sessao
- `lib/src/features/workspace`: dashboard profissional
- `lib/src/core/network`: cliente HTTP e autorizacao
