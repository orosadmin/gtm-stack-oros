# Segurança

## Como relatar uma vulnerabilidade

Relate **em particular**, nunca numa issue, discussão ou pull request público:

1. Abra a aba **Security** do repositório e clique em **Report a vulnerability**
   ([link direto](https://github.com/orosadmin/gtm-stack-oros/security/advisories/new)).
2. Descreva o problema, como reproduzir e o impacto. **Não** inclua o valor de tokens ou senhas:
   diga só onde estão (arquivo, commit, linha).

A equipe da Oros responde pelo próprio relato. Não divulgue o problema antes da correção.

## Encontrou um token ou segredo exposto

- **Neste repositório** (um arquivo, commit, issue ou PR): relate como acima. Não copie o valor.
- **Seu próprio token** (você publicou sem querer um token da Meta, o `CLOUDFLARE_TOKEN`, o
  `GTM_CONTAINER_CONFIG` ou o `.env`):
  1. **Revogue e gere um novo agora**, no painel de origem (Gerenciador de Eventos da Meta, Cloudflare
     Zero Trust, GTM). Apagar o arquivo ou o commit **não basta**: o valor continua no histórico, em
     forks e em caches.
  2. Troque o valor onde ele é usado (constante do contêiner de servidor do GTM, `.env`) e publique.
  3. Confira no painel de origem se houve uso indevido no período.

## Regras para não vazar nada

- Segredos ficam **fora do repositório**: no `.env` (já no `.gitignore`) e nas constantes do contêiner
  de servidor do GTM, ou num cofre como o Secret Manager do Google Cloud.
- Nunca cole tokens, o `.env`, o Container Config, IDs reais de Pixel/GA4 ou dados de visitantes
  (e-mail, telefone, IP) em issues, PRs, prints ou logs.
- Exportações do GTM passam por `node scripts/gtm-limpar.mjs` antes de qualquer commit.
- O CI roda `scripts/verificar-segredos.mjs` e o gitleaks em todo pull request, na árvore e no
  histórico.
