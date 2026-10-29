# Modelos de contêiner do GTM (web + server)

Dois arquivos de exportação do Google Tag Manager, testados na live de GTM Server da Oros, prontos
para importar:

| Arquivo | Tipo de contêiner | Para que serve |
|---|---|---|
| [`templates/web.json`](templates/web.json) | Web | Lê o dataLayer do `tracking.js`, manda os eventos ao GA4 **pelo contêiner de servidor** e dispara o Pixel da Meta no navegador |
| [`templates/server.json`](templates/server.json) | Server | Recebe os hits do GA4, repassa ao GA4 e manda `PageView` e `Lead` à API de Conversões (CAPI) da Meta |

Os arquivos **não têm segredos nem IDs de conta**: todo valor que muda de um site para outro é um
marcador (`PREENCHER_*`, `G-XXXXXXXXXX`, `https://sgtm.seudominio.com`) que você preenche **depois**
de importar, dentro do GTM. Os IDs de conta e de contêiner da exportação original foram trocados por
`0` e o ID público por `GTM-XXXXXXX`; o GTM ignora esses campos na importação.

O desenho completo (por que cada escolha, com as fontes oficiais) está na seção 3 de
[`skills/gtm-tracking/SKILL.md`](../skills/gtm-tracking/SKILL.md). O site precisa do
[`tracking.js`](../skills/gtm-tracking/references/tracking.js) e do
[`snippet-head.html`](../skills/gtm-tracking/references/snippet-head.html) da mesma skill: o contêiner
web depende do formato de dataLayer que eles produzem.

---

## 1. O que cada contêiner faz

### Fluxo

```
tracking.js (página)
  └─ dataLayer: page_data, cta_click, form_start, generate_lead, lead_confirmed
       │  (user_data, event_data com event_id, consent)
       ▼
GTM web
  ├─ ga4_event ──── server_container_url ───▶ GTM Server (esta stack)
  │                                             ├─ ga4_web-to-server ──▶ GA4
  │                                             └─ meta_capi ─────────▶ Meta CAPI (PageView, Lead)
  └─ meta_pixel ────────────────────────────▶ Meta Pixel no navegador (PageView, Lead)
```

**Sem script duplicado:** o GA4 e o Pixel são carregados **só pelo GTM**. A página não pode ter
`gtag.js`, `gtag(...)`, `fbq(...)`, `fbevents.js` ou outro snippet do GTM; se tiver, cada evento é
contado duas vezes e a deduplicação deixa de funcionar.

### Contêiner web (`templates/web.json`)

| Tipo | Nome | O que faz |
|---|---|---|
| Constante | `ga4_tag_id` | ID de medição do GA4 |
| Constante | `meta_pixel` | ID do Pixel da Meta |
| Constante | `transport_url` | URL do contêiner de servidor (`server_container_url`) |
| Variáveis de camada de dados | `event_id`, `event_name`, `user_email`, `user_phone`, `user_first_name`, `user_last_name`, `user_external_id`, `user_fbp`, `user_fbc`, `user_user_agent`, `user_id` | Leem `event_data.*` e `user_data.*` do push (versão 2) |
| Tabela de consulta | `LT - ga4 event name` | `page_data` → `page_view`; os outros eventos ficam com o próprio nome |
| Tabela de consulta | `LT - meta event name` | `page_data` → `PageView`, `generate_lead` → `Lead`, `lead_confirmed` → `Lead` |
| Acionador | `CE - tracked events` | Evento personalizado `^(page_data\|generate_lead\|lead_confirmed\|form_start\|cta_click)$` |
| Acionador | `CE - meta events` | Evento personalizado `^(page_data\|generate_lead\|lead_confirmed)$` |
| Tag | `google_tag` | Tag do Google com `{{ga4_tag_id}}`, `server_container_url` = `{{transport_url}}`, `send_page_view` = `false` e `user_id` = `{{user_id}}`. Dispara na Inicialização |
| Tag | `ga4_event` | Uma tag "Evento do GA4" para todos os eventos rastreados. Nome = `{{LT - ga4 event name}}`; parâmetros `event_id`, `x-fb-ck-fbc`, `x-fb-ck-fbp`, `x-fb-ud-external_id` |
| Tag | `meta_pixel` | Modelo oficial do Pixel (Galeria). Nome = `{{LT - meta event name}}`, Event ID = `{{event_id}}`, correspondência avançada `em`, `ph`, `fn`, `ln`, `external_id`. "Meta-enabled Conversions API" desligado |
| Modelo | Meta Pixel | Modelo oficial da Galeria, embutido na exportação |

### Contêiner server (`templates/server.json`)

| Tipo | Nome | O que faz |
|---|---|---|
| Cliente | `GA4` | Recebe os hits do GTM web (cookie `FPID` gerenciado pelo servidor) |
| Constante | `meta_pixel` | ID do Pixel (o mesmo do web) |
| Constante | `meta_access_token` | Token de acesso da API de Conversões |
| Constante | `meta_test_event_code` | Código de teste da Meta. **Vazio** no modelo |
| Acionador | `ga4_client_name` | Client Name = `GA4` |
| Acionador | `ga4_meta_events` | Client Name = `GA4` **e** Event Name corresponde a `^(page_view\|generate_lead)$` |
| Tag | `ga4_web-to-server` | Repassa todos os eventos ao GA4 (ID de medição herdado do hit) |
| Tag | `meta_capi` | Tag oficial da API de Conversões (Galeria). Pixel, token e código de teste das constantes; Action Source `website`; "Extend cookies" ligado |
| Modelo | Conversions API Tag | Modelo oficial da Galeria, embutido na exportação |

### Como GA4, Pixel e CAPI trabalham juntos

| Evento do dataLayer | GA4 (via servidor) | Pixel (navegador) | CAPI (servidor) |
|---|---|---|---|
| `page_data` | `page_view` | `PageView` | `PageView` |
| `cta_click` | `cta_click` | — | — |
| `form_start` | `form_start` | — | — |
| `generate_lead` | `generate_lead` | `Lead` | `Lead` |
| `lead_confirmed` | `lead_confirmed` | `Lead` (mesmo `event_id` do `generate_lead`) | — |

- **Deduplicação por `event_id`:** o `tracking.js` gera um UUID por evento. O Pixel manda esse valor
  como Event ID e a `ga4_event` manda como parâmetro `event_id`, que a tag `meta_capi` lê no servidor.
  Mesmo nome de evento + mesmo `event_id` + mesmo Pixel em até 48 h = a Meta conta **uma** vez.
- **`lead_confirmed`** (página de obrigado) reaproveita o `event_id` do `generate_lead`. O Pixel manda
  `Lead` de novo e a Meta deduplica; a CAPI não recebe `lead_confirmed` de propósito (o acionador
  `ga4_meta_events` só deixa passar `page_view` e `generate_lead`).
- **`fbp` e `fbc`:** o `tracking.js` lê o cookie `_fbp` e captura o `fbc` (de `fbclid` na URL ou do
  cookie `_fbc`, sem refazer a data do clique). A `ga4_event` manda os dois como `x-fb-ck-fbp` e
  `x-fb-ck-fbc`, e a `meta_capi` os usa no servidor. Regras completas em
  [`fbc.md`](../skills/gtm-tracking/references/fbc.md).
- **`external_id`:** ID aleatório próprio do visitante, enviado ao Pixel (correspondência avançada) e
  ao servidor (`x-fb-ud-external_id`). Não é `user_id` do GA4.
- **IP e user agent:** a `meta_capi` usa `ip_override` e `user_agent` que o cliente GA4 do servidor
  preenche a partir da requisição.

---

## 2. Como importar

Faça na ordem: **servidor primeiro** (você precisa da URL dele para o web), depois o web.

1. **Contêiner de servidor:** crie (ou abra) um contêiner do tipo **Server** e suba a stack Docker
   deste repositório (passos 1 a 5 do [README principal](../README.md)).
2. GTM → **Administrador** → **Importar contêiner** → escolha `templates/server.json`.
3. Espaço de trabalho: **Novo** (recomendado) ou um existente.
4. Opção de importação:
   - **Substituir (Overwrite):** use em contêiner **novo ou vazio**. Apaga as tags, acionadores e
     variáveis que já existem no espaço de trabalho e deixa só o conteúdo do arquivo. É o modo
     testado.
   - **Mesclar (Merge):** use se o contêiner já tem outras coisas que você quer manter. Escolha
     **Renomear** itens em conflito (mais seguro) ou **Substituir** itens em conflito. Depois
     confira se não ficaram duas tags GA4 ou duas tags da Meta disparando no mesmo evento.
5. Confira o resumo (o que será adicionado, alterado e apagado) e confirme.
6. Preencha as constantes do servidor (tabela abaixo) **no GTM**, nunca no arquivo.
7. Repita os passos 2 a 5 no contêiner **Web** com `templates/web.json` e preencha as constantes do
   web.
8. Teste (seção 4) antes de **Enviar/Publicar** os dois contêineres.

### O que preencher depois de importar

| Contêiner | Variável (constante) | Valor no modelo | O que colocar | Onde encontrar |
|---|---|---|---|---|
| Web | `ga4_tag_id` | `G-XXXXXXXXXX` | ID de medição do GA4 | GA4 → Administrador → Fluxos de dados → seu fluxo da Web → "ID da métrica" (`G-...`) |
| Web | `meta_pixel` | `PREENCHER_META_PIXEL_ID` | ID do Pixel (só números) | Gerenciador de Eventos da Meta → sua fonte de dados → Configurações → "ID do conjunto de dados/Pixel" |
| Web | `transport_url` | `https://sgtm.seudominio.com` | `https://` + o seu `GTM_DOMAIN` | O `.env` da stack (Passo 1 do README principal) |
| Server | `meta_pixel` | `PREENCHER_META_PIXEL_ID` | O **mesmo** Pixel do web | Igual ao de cima |
| Server | `meta_access_token` | `PREENCHER_META_ACCESS_TOKEN` | Token da API de Conversões | Gerenciador de Eventos → sua fonte de dados → Configurações → API de Conversões → "Gerar token de acesso" |
| Server | `meta_test_event_code` | vazio | Só durante o teste: o código `TEST...` | Gerenciador de Eventos → **Eventos de teste**. **Apague antes de publicar** |

Também troque, **no site** (não no GTM), o `GTM-XXXXXXX` do `snippet-head.html` pelo ID do seu
contêiner web (GTM → no topo da tela, ao lado do nome do contêiner).

---

## 3. Limitações e o que NÃO está feito

Leia antes de usar em produção.

1. **Código de teste da Meta:** a `meta_capi` usa a constante `meta_test_event_code`, vazia no modelo.
   Preencha só no teste e **apague antes de publicar**: eventos com código de teste não são
   descartados e a Meta pede para removê-lo em produção. O ideal (não feito) é uma tabela de consulta
   sobre `{{Debug Mode}}` que devolve o código só no Preview.
2. **Consentimento (LGPD) não está ligado:** o `tracking.js` manda o bloco `consent` (negado por
   padrão), mas **nenhuma tag lê esse bloco**. Faltam o banner/CMP do site, o Consent Mode v2 do
   Google, o consentimento do Pixel (o modelo dispara com "Consent Granted" ligado) e o bloqueio da
   `meta_capi` sem consentimento. A base legal é decisão de quem usa.
3. **E-mail e telefone não vão ao servidor:** hoje só o Pixel (navegador) manda `em`, `ph`, `fn`,
   `ln`. Para o GA4 e a CAPI também receberem, crie no web uma variável "Dados fornecidos pelo
   usuário" (manual) com e-mail, telefone, nome e sobrenome do `user_data` e passe como `user_data` na
   `ga4_event` (e ative a coleta de dados fornecidos pelo usuário no GA4).
4. **Sem transformação "Excluir parâmetros" no servidor:** os parâmetros `x-fb-*` e `event_id` chegam
   ao GA4. Útil, mas não essencial: crie uma transformação de exclusão só para a tag
   `ga4_web-to-server`.
5. **Atualização dos modelos da Galeria:** os modelos "Meta Pixel" e "Conversions API Tag" vêm
   embutidos na versão da exportação. Atualize pela Galeria (GTM → Modelos) quando houver versão
   nova e teste de novo.
6. **"Extend cookies" ligado na `meta_capi`:** quando a URL do evento ainda tem `fbclid` (página de
   entrada e recargas dela), a tag do servidor **refaz** o `fbc` com a hora do servidor e regrava o
   cookie `_fbc`, trocando a data de criação que o `tracking.js` preserva. Detalhes e a decisão de
   desligar ou não em [`fbc.md`](../skills/gtm-tracking/references/fbc.md), seção 7.
7. **Telefone no Pixel com `+`:** a correspondência avançada recebe `{{user_phone}}` em E.164 com
   `+`. A Meta pede só dígitos; se o próprio Pixel remove o `+` antes do hash é **não verificado**.
   Para garantir, crie uma variável JavaScript que tire o `+` e use no campo `ph`.
8. **Configurações herdadas da tag do Google:** a exportação traz, no nível do contêiner web, a
   medição otimizada (rolagem, cliques de saída, formulários, vídeo, histórico do navegador) e a
   coleta **automática** de dados fornecidos pelo usuário. Com a medição de formulários ligada, o GA4
   pode receber um `form_start` próprio além do nosso; com eventos de histórico, sites SPA mandam
   `page_view` extra sem `event_id`; e a coleta automática lê e-mail e telefone da página sem passar
   pelo consentimento. Revise isso no fluxo de dados do GA4 (Medição otimizada) e na tag do Google.
9. **`user_id` vazio:** a `google_tag` lê `user_data.user_id`, que o `tracking.js` não envia. Só
   preencha para usuário **logado**.
10. **IP atrás da Cloudflare:** confira no Preview do servidor se `ip_override` é o IP do visitante e
    não o do proxy (não verificado nesta stack).
11. **Escopo:** o modelo cobre um funil de lead (página, cliques, formulário, obrigado). Não tem
    e-commerce (`purchase`, `add_to_cart`), Google Ads, outras plataformas nem consentimento.

---

## 4. Plano de teste

1. Ligue o **Preview** dos dois contêineres (web e server) e abra o site com `?fbclid=TESTE123`.
2. **GTM web (Tag Assistant):**
   - `page_data` dispara `ga4_event` (nome `page_view`) e `meta_pixel` (`PageView`);
   - `cta_click` e `form_start` disparam só `ga4_event`;
   - ao enviar o formulário, `generate_lead` dispara `ga4_event` e `meta_pixel` (`Lead`);
   - na página de obrigado, `lead_confirmed` dispara `meta_pixel` (`Lead`) com o **mesmo** `event_id`
     do `generate_lead`;
   - cada push tem as quatro chaves (`event`, `user_data`, `event_data`, `consent`).
3. **GTM Server (Preview do servidor):** cada requisição é reivindicada pelo cliente `GA4`;
   `ga4_web-to-server` dispara em todos os eventos; `meta_capi` dispara **só** em `page_view` e
   `generate_lead`. Na aba de solicitações de saída, a chamada à Graph API da Meta responde `200`.
4. **Meta → Gerenciador de Eventos → Eventos de teste** (com `meta_test_event_code` preenchido
   temporariamente): `PageView` e `Lead` aparecem como **navegador e servidor**, com o mesmo
   `event_id`, e o `fbc` traz `TESTE123`.
5. **Deduplicação:** em Visão geral → detalhes do `Lead` → aba **Event Deduplication** (desduplicação de eventos), os eventos
   do navegador e do servidor aparecem como deduplicados. Nenhum `page_data`, `generate_lead`,
   `cta_click`, `form_start`, `scroll` ou `user_engagement` chega à Meta com esse nome.
6. **Sem duplicação no site:** na aba Rede do navegador, `gtag/js` e `fbevents.js` só aparecem uma vez
   e carregados pelo GTM.
7. **Antes de publicar:** apague o `meta_test_event_code`, publique o servidor e depois o web.

---

## 5. Segurança

- **Nunca** coloque o token da Meta, IDs reais ou o Container Config num arquivo do repositório, num
  commit, numa issue ou num print. O token fica **só** na constante `meta_access_token` do contêiner
  de servidor (ou, melhor, num cofre de segredos, como o Secret Manager do Google Cloud, lido por uma
  variável do servidor).
- Ao exportar um contêiner para atualizar estes modelos, **limpe a exportação** antes de qualquer
  commit:

  ```bash
  node scripts/gtm-limpar.mjs ~/Downloads/exportacao-web.json gtm/templates/web.json
  node scripts/gtm-limpar.mjs ~/Downloads/exportacao-server.json gtm/templates/server.json
  node scripts/gtm-validar.mjs
  node scripts/verificar-segredos.mjs
  ```

  O `gtm-limpar.mjs` troca o valor de **toda** constante por um marcador, zera os IDs de conta e de
  contêiner e troca o ID público e a URL do servidor; nunca mostra os valores originais. Nunca
  copie a exportação original para dentro do repositório.
- **Vazou um token?** Revogue o token antigo e gere outro (Gerenciador de Eventos ou usuário do
  sistema no Gerenciador de Negócios), troque no GTM, publique e siga o
  [`SECURITY.md`](../SECURITY.md). Apagar o commit não basta: o valor continua no histórico e em
  cópias.
