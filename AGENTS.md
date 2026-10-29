# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Repositório público para alunos e clientes: todo texto para pessoas em português do Brasil.
- Regras que o CI (`.github/workflows/verificacoes.yml`) cobra: sem comentários no código
  (`node scripts/verificar-comentarios.mjs`), sem segredos/IDs reais/dados pessoais
  (`node scripts/verificar-segredos.mjs [--historico]` + gitleaks), modelos do GTM válidos
  (`node scripts/gtm-validar.mjs`) e `node skills/gtm-tracking/references/fbc-teste.mjs`.
- GA4 e Pixel só pelo GTM: a página só carrega `tracking.js` + snippet do GTM, sem `gtag`/`fbq`.
- Exportação nova do GTM: nunca copie o original; gere `gtm/templates/*.json` com
  `node scripts/gtm-limpar.mjs` (guia em `gtm/README.md`, seção 5).
- Ações do GitHub fixadas por SHA completo, sem comentário de versão.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
