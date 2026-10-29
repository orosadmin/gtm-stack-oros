# Como contribuir

Correções e melhorias são bem-vindas, principalmente na documentação.

1. Para algo grande, abra uma issue antes e explique a ideia.
2. Faça um fork, crie um branch e abra um pull request para `master`.
3. Preencha o checklist do pull request. O CI (`verificacoes`) precisa passar.
4. Todo pull request é revisado e aprovado pelo dono do repositório (`.github/CODEOWNERS`) antes de
   entrar. Ninguém faz push direto em `master`.

## Regras

- **Sem segredos:** nenhum token, senha, Container Config, ID real de conta, de Pixel ou de GA4 e
  nenhum dado pessoal, nem em exemplos. Use os marcadores (`PREENCHER_*`, `G-XXXXXXXXXX`,
  `GTM-XXXXXXX`, `seudominio.com`). Exportações do GTM passam por `node scripts/gtm-limpar.mjs`.
- **Sem comentários no código:** `.js`, `.mjs`, `.html`, `.yml`, `.sh` e os blocos de código da
  documentação não têm comentários. Explique na documentação em português.
- **Sem analytics duplicado:** GA4 e Pixel da Meta são carregados **só pelo GTM**. Nada de `gtag.js`,
  `gtag(...)`, `fbq(...)` ou IDs de medição no código da página.
- **Documentação em português do Brasil.** Nomes no código seguem o padrão dos arquivos existentes.
- **Commits** no imperativo, em português, como o histórico (ex.: `Adiciona ...`, `Corrige ...`).
- Ações do GitHub ficam fixadas pelo SHA completo do commit, nunca por tag; o Dependabot propõe as
  atualizações.

Antes de abrir o pull request, rode:

```bash
node scripts/gtm-validar.mjs
node scripts/verificar-comentarios.mjs
node scripts/verificar-segredos.mjs
node skills/gtm-tracking/references/fbc-teste.mjs
```

## Licença das contribuições

O projeto usa a licença [MIT](LICENSE). Ao enviar uma contribuição, você concorda que ela seja
distribuída sob a mesma licença.
