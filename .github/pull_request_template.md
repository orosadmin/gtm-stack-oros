## O que muda

## Como foi testado

## Checklist

- [ ] Nenhum segredo, token, ID de conta real ou dado pessoal (inclusive em `gtm/templates/`)
- [ ] Nenhum comentário no código (`node scripts/verificar-comentarios.mjs`)
- [ ] Nenhum analytics duplicado: GA4 e Pixel só pelo GTM, nada de `gtag`/`fbq` na página
- [ ] Modelos do GTM válidos (`node scripts/gtm-validar.mjs`)
- [ ] Teste do fbc passando (`node skills/gtm-tracking/references/fbc-teste.mjs`)
- [ ] Documentação atualizada e em português
