---
name: gtm-tracking
description: Implementa rastreamento com dataLayer padrão (user_data, event_data, consent) em um site e liga GTM web → GTM Server → GA4 e Meta CAPI, incluindo a captura correta do fbc (fbclid/_fbc) da Meta. Use quando o usuário pedir para instalar o GTM, montar dataLayer, plano de rastreamento, eventos de lead/formulário, GTM Server-Side, API de Conversões da Meta, fbc/fbclid/_fbc ou deduplicação com event_id.
---

# gtm-tracking — dataLayer padrão + GTM Server + Meta CAPI

Esta skill ensina e implementa o padrão de rastreamento usado na live de GTM Server da Oros:
um `tracking.js` que monta o dataLayer **antes** do GTM, eventos com formato fixo, envio pelo
GTM web para o contêiner de servidor (a stack deste repositório) e, de lá, para GA4 e Meta CAPI.

Material pronto em `references/`:

| Arquivo | Para que serve |
|---|---|
| `references/tracking.js` | Modelo do script (placeholders `G-XXXXXXXXXX`; comentado em português) |
| `references/snippet-head.html` | Ordem no `<head>`, snippet do GTM (`GTM-XXXXXXX`), `<noscript>` e exemplo de elemento rastreado |
| `references/datalayer-exemplo.json` | Um push completo de exemplo |
| `references/tracking-plano.md` | Plano de rastreamento: chaves, eventos, convenção de ids, armazenamento |
| `references/fbc.md` | Regras do `fbc` da Meta (leia antes de mexer em fbc) |
| `references/fbc-teste.mjs` | Teste automático do fbc: `node references/fbc-teste.mjs` |

Nunca coloque IDs reais, tokens ou dados pessoais nos arquivos de exemplo: use os placeholders.

## 1. O padrão do dataLayer

Todo push tem **sempre** os mesmos quatro blocos:

```js
{
  event: 'nome_do_evento',
  user_data:  { /* QUEM é o visitante: identificadores */ },
  event_data: { /* O QUE aconteceu: detalhes do evento */ },
  consent:    { /* estado de consentimento */ }
}
```

Regras:

- **user_data × event_data × consent** separados. No GTM você mapeia `user_data.email`,
  `event_data.event_id` etc. com variáveis de camada de dados.
- **Toda chave está presente em todo push**, com `null` ou `""` quando não se aplica. Assim o GTM
  nunca reaproveita um valor de um evento anterior (o dataLayer faz merge).
- Os identificadores (`_fbp`, `_fbc`, `_ga`...) são lidos **de novo antes de cada push**: as tags
  podem criar cookies depois que a página carregou.
- Dados pessoais vão normalizados (e-mail minúsculo e sem espaços, telefone só dígitos com DDI) e
  **sem hash**: o hash SHA-256 é feito pelas tags no servidor.
- `ip_address` fica **sempre `null` no navegador** (o JS não consegue ler o IP e não usamos serviço
  externo). O contêiner de servidor lê o IP da requisição (`X-Forwarded-For`; atrás da Cloudflare
  desta stack ele chega por esse cabeçalho) e a tag da Meta envia `client_ip_address` e
  `client_user_agent` a partir dela.

Chaves completas em `references/tracking-plano.md` (seção 2) e exemplo em
`references/datalayer-exemplo.json`.

### Eventos

| Evento | Quando | Observação |
|---|---|---|
| `page_data` | carregamento de toda página, antes do GTM | só entrega dados; o `page_view` é do GTM |
| `cta_click` | clique em `<a>`/`<button>` com `data-track-id` | `element_id/label/location` |
| `form_start` | primeiro foco num campo do formulário (uma vez) | `form_id`, `form_name` |
| `generate_lead` | envio **válido** do formulário | push com `eventCallback` + `eventTimeout`, depois redireciona |
| `lead_confirmed` | página de obrigado, só se veio de envio real | **mesmo `event_id`** do `generate_lead` |

- `event_data.event_id` é um UUID por evento e serve para **deduplicar** navegador × servidor
  (Pixel e CAPI com o mesmo `event_id` + mesmo nome de evento). O `lead_confirmed` reaproveita o
  `event_id` do `generate_lead` (guardado no `sessionStorage` e apagado depois do push).
- Abrir a página de obrigado direto **não** gera `lead_confirmed`: nada de conversão inventada.

### Identificação dos elementos

Todo elemento relevante tem `id` = `data-track-id` (kebab-case, `<local>-<tipo>-<nome>`, ex.:
`hero-cta-principal`), `data-track-label` (para que serve, em português) e `data-track-location`
(`nav`, `hero`, `form`, `footer`, `obrigado`...). O formulário também tem `data-track-id`. Tabela de
exemplo em `references/tracking-plano.md` (seções 5 e 6).

### Consentimento

O bloco `consent` começa **todo `denied`** (`consent_source: "padrao_negado"`) e só muda quando o
banner/CMP do site chama `window.trackingAtualizarConsentimento({...}, 'banner')`. Nunca deixe o
padrão como `granted`. Esta skill não implementa banner; configure também o Consent Mode do GTM
(padrão negado + atualização) a partir do mesmo banner.

## 2. fbc da Meta (obrigatório fazer certo)

Formato: `fb.<subdomainIndex>.<creationTime ms>.<fbclid>`. Detalhes e justificativas em
`references/fbc.md`. Resumo do que o `tracking.js` faz (`capturarFbc()` e `obterFbc()`):

1. **Prioridade:** (a) `fbclid` na URL atual; (b) senão o cookie `_fbc` existente, **exatamente como
   está**, com a data de criação intacta; (c) senão `null`. Nunca invente um valor.
2. **Com `fbclid` na URL:** se o `_fbc` já tem o mesmo fbclid, mantém o cookie (data original). Se
   é outro ou não há cookie, monta `fb.1.<agora ms>.<fbclid>`, onde "agora" é a primeira vez que
   esse fbclid apareceu no site, e grava `_fbc` por 90 dias, `path=/`, `SameSite=Lax`, no domínio
   registrável. **Não** use `Date.now()` toda vez que montar o valor: esse era o erro da versão da live.
3. **fbclid cru:** sem mudar maiúsculas/minúsculas, sem `trim`, sem decodificar nem codificar de novo
   (o modelo lê de `location.search`, não de `URLSearchParams`, e grava o cookie sem
   `encodeURIComponent`).
4. **subdomainIndex:** 0 = TLD (`com`), 1 = `exemplo.com`, 2 = `www.exemplo.com`. O modelo descobre o
   domínio registrável tentando gravar um cookie de teste (o navegador recusa sufixos públicos) e
   grava nele, então usa **1**.
5. **Não brigar com o Pixel:** lê primeiro e só grava quando o cookie falta ou chega fbclid novo.
6. **Persistência:** captura no carregamento de cada página (o fbclid só existe na URL de entrada); as
   páginas seguintes e a de obrigado leem o cookie (reserva em `sessionStorage`/`localStorage` só se
   o cookie não existir). O `lead_confirmed` leva o mesmo fbc da entrada.
7. **Servidor:** envia o `fbc` à Meta CAPI como recebeu (sem hash); usa a data de criação para
   descartar valores malformados, no futuro ou com mais de 90 dias.

Depois de qualquer mudança no fbc, rode `node references/fbc-teste.mjs` (todos os casos devem passar)
e faça o teste manual da seção 8 de `references/fbc.md` (`?fbclid=TESTE123`, recarregar, outro fbclid).

## 3. Ligando GTM web → GTM Server → GA4 / Meta CAPI

Princípio: **uma tag por provedor** em cada contêiner. O nome do evento vem de uma variável e de uma
**tabela de mapeamento**, não de uma tag por evento.

### GTM web

1. **Variáveis de camada de dados** (versão 2): `user_data.email`, `user_data.phone_number`,
   `user_data.first_name`, `user_data.last_name`, `user_data.external_id`, `user_data.fbp`,
   `user_data.fbc`, `user_data.ga_client_id`, `event_data.event_id`, `event_data.element_id`,
   `event_data.form_id`, `consent.ad_storage` etc. Nomeie como `DLV - user_data.fbc`.
2. **Tag do Google (GA4)** com o ID `G-XXXXXXXXXX` e `server_container_url` =
   `https://sgtm.seudominio.com` (o `GTM_DOMAIN` desta stack). Dispara na inicialização/page view.
3. **Uma tag "Evento do GA4"** para todos os eventos:
   - nome do evento = `{{Event}}` (ou uma tabela `LT - nome GA4` se quiser renomear);
   - parâmetros: `event_id`, `fbc`, `fbp`, `external_id`, `element_id`, `form_id`...;
   - dados fornecidos pelo usuário (e-mail, telefone, nome) a partir de `user_data`;
   - acionador de evento personalizado com regex `^(cta_click|form_start|generate_lead|lead_confirmed)$`.
4. Pixel da Meta no navegador é opcional. Se usar, mande o **mesmo `event_id`** para deduplicar com a
   CAPI.

### GTM Server (esta stack)

1. **Cliente GA4** recebe os hits do GTM web.
2. **Uma tag GA4** encaminha todos os eventos para o GA4.
3. **Uma tag da Meta Conversions API** (ex.: modelo "Facebook Conversion API" da galeria) com:
   - **nome do evento** = variável de tabela de consulta sobre o nome do evento recebido:

     | Evento recebido | Evento Meta |
     |---|---|
     | `page_view` | `PageView` |
     | `lead_confirmed` | `Lead` |
     | `generate_lead`, `cta_click`, `form_start` | (vazio: não envia) |

     e uma exceção que bloqueia a tag quando o resultado é vazio;
   - `event_id` = `event_id` recebido (deduplicação com o Pixel);
   - `fbc`, `fbp`, `external_id`, e-mail, telefone, nome a partir dos dados do evento (configure
     explicitamente, não dependa de detecção automática); o `fbc` vai **como recebido**;
   - IP e user agent da requisição (padrão da tag);
   - Pixel ID e Access Token em variáveis/constantes do contêiner, nunca no código do site.
4. Respeite o bloco `consent`: bloqueie a tag da Meta quando `ad_storage`/`ad_user_data` estiver
   `denied`.
5. Valide no **Preview** dos dois contêineres antes de publicar.

## 4. Implementando no site do aluno

1. Pergunte (ou descubra no código): domínio, páginas, onde fica o formulário e a página de
   obrigado, ID do contêiner web, ID do GA4, domínio do GTM Server. Se o aluno não informar um ID,
   mantenha o placeholder.
2. Copie `references/tracking.js` para o site (ex.: `/assets/tracking.js`). Ajuste os pontos marcados
   com `>>>`: `GA4_MEASUREMENT_ID`, `PAGINA_OBRIGADO`, `validarFormulario()` e os nomes dos campos.
   Não altere o bloco do fbc além disso.
3. Em todas as páginas, aplique `references/snippet-head.html`: `tracking.js` **antes** do snippet do
   GTM, `<noscript>` depois do `<body>`, e `data-page` na tag `<html>` (`obrigado` na página de
   obrigado).
4. Marque os elementos com `id`/`data-track-id`/`data-track-label`/`data-track-location` e o
   formulário com `data-track-id`.
5. Ligue o consentimento ao banner do site (`window.trackingAtualizarConsentimento`).
6. Gere o plano do site a partir de `references/tracking-plano.md`, com a lista real de elementos.
7. Configure os contêineres como na seção 3.
8. Teste: `node references/fbc-teste.mjs`, o roteiro de `references/fbc.md` (seção 8) e o Preview do
   GTM (cada evento com as quatro chaves, `lead_confirmed` com o mesmo `event_id` do
   `generate_lead` e o mesmo `fbc` da página de entrada).

Se o site não for HTML estático (WordPress, React, Next.js...), mantenha a ideia: o script roda no
`<head>` antes do GTM em toda página; em SPA, adapte o script para repetir o `page_data` (e o `capturarFbc()`) a cada troca de rota.
