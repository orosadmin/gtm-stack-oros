---
name: gtm-tracking
description: Implementa rastreamento com dataLayer padrão (user_data, event_data, consent) em um site e liga GTM web → GTM Server → GA4 e Meta CAPI, incluindo a captura correta do fbc (fbclid/_fbc) da Meta. Use quando o usuário pedir para instalar o GTM, montar dataLayer, plano de rastreamento, eventos de lead/formulário, GTM Server-Side, API de Conversões da Meta, fbc/fbclid/_fbc ou deduplicação com event_id.
---

# gtm-tracking — dataLayer padrão + GTM Server + Meta CAPI

Esta skill ensina e implementa o padrão de rastreamento usado na live de GTM Server da Oros:
um `tracking.js` que monta o dataLayer **antes** do GTM, eventos com formato fixo, envio pelo
GTM web para o contêiner de servidor (a stack deste repositório) e, de lá, para GA4 e Meta CAPI,
com o Pixel da Meta no navegador deduplicado com a CAPI.

As regras sobre GA4, Pixel e CAPI seguem a documentação oficial e o código dos modelos oficiais do
GTM. Cada afirmação traz a fonte entre colchetes (ex.: **[T-CAPI]**), com o link em
`references/fontes.md`.

Material pronto em `references/`:

| Arquivo | Para que serve |
|---|---|
| `references/tracking.js` | Modelo do script: só pushes no dataLayer e captura do `_fbc`, sem ID de GA4 ou Pixel e sem comentários (a explicação está nesta skill e em `references/tracking-plano.md`) |
| `references/snippet-head.html` | `tracking.js` + snippet do GTM (`GTM-XXXXXXX`) para o `<head>`, `<noscript>` para depois do `<body>` e um exemplo de elemento rastreado (seção 4, passo 4) |
| `../../gtm/templates/` | Contêineres web e server prontos para importar no GTM (guia em `gtm/README.md`) |
| `references/datalayer-exemplo.json` | Um push completo de exemplo |
| `references/tracking-plano.md` | Plano de rastreamento: chaves, eventos, convenção de ids, armazenamento |
| `references/fbc.md` | Regras do `fbc` da Meta (leia antes de mexer em fbc) |
| `references/fbc-teste.mjs` | Teste automático do fbc e do telefone: `node references/fbc-teste.mjs` |
| `references/parametros.md` | Referência rápida: nomes GA4 × Meta, parâmetros por evento, dados do usuário (hash e normalização), deduplicação |
| `references/fontes.md` | Links oficiais (Meta, Google, código dos modelos) e o que ficou **NÃO VERIFICADO** |

Nunca coloque IDs reais, tokens ou dados pessoais nos arquivos de exemplo: use os placeholders.

## 1. O padrão do dataLayer

Todo push tem **sempre** os mesmos quatro blocos:

```js
{
  event: 'nome_do_evento',
  user_data: {},
  event_data: {},
  consent: {}
}
```

`user_data` diz **quem** é o visitante (identificadores), `event_data` diz **o que** aconteceu
(detalhes do evento) e `consent` guarda o estado de consentimento.

Regras:

- **user_data × event_data × consent** separados. No GTM você mapeia `user_data.email`,
  `event_data.event_id` etc. com variáveis de camada de dados.
- **Toda chave está presente em todo push**, com `null` ou `""` quando não se aplica. Assim o GTM
  nunca reaproveita um valor de um evento anterior (o dataLayer faz merge).
- Os identificadores (`_fbp`, `_fbc`, `_ga`...) são lidos **de novo antes de cada push**: as tags
  podem criar cookies depois que a página carregou.
- Dados pessoais vão normalizados e **sem hash**: e-mail minúsculo e sem espaços; telefone em
  **E.164 com `+`** (`+5511912345678`), que é o formato do Google [G-EC]. A Meta quer o mesmo número
  **só com dígitos** e DDI [M-CIP]: a tag oficial do servidor remove o `+` antes do hash, mas só a
  primeira ocorrência de cada separador, então nunca mande o telefone com espaços ou hífens [T-CAPI];
  no Pixel, mande sem o `+` (seção 3). O hash SHA-256 é feito pelo Pixel no navegador [M-AM] e pela
  tag da CAPI no servidor [T-CAPI], uma vez só [M-PB]. Tabela completa em `references/parametros.md`.
- `ip_address` fica **sempre `null` no navegador** (o JS não consegue ler o IP e não usamos serviço
  externo). O servidor lê o IP da requisição (cabeçalhos `Forwarded`/`X-Forwarded-For`, em melhor
  esforço [G-API]) e a tag da Meta envia `client_ip_address` e `client_user_agent` a partir dos dados
  do evento `ip_override` e `user_agent` [T-CAPI][G-CED]. Atrás da Cloudflare, confira no Preview do
  servidor se `ip_override` é o IP do visitante e não o do proxy (se não for, uma transformação
  Augment com o cabeçalho `CF-Connecting-IP` pode resolver; **NÃO VERIFICADO** nesta stack).

Chaves completas em `references/tracking-plano.md` (seção 2) e exemplo em
`references/datalayer-exemplo.json`.

### Eventos

| Evento | Quando | Observação |
|---|---|---|
| `page_data` | carregamento de toda página, antes do GTM | vira `page_view` no GA4 e `PageView` no Pixel/CAPI (tabelas da seção 3) |
| `cta_click` | clique em `<a>`/`<button>` com `data-track-id` | `element_id/label/location` |
| `form_start` | primeiro foco num campo do formulário (uma vez) | `form_id`, `form_name` |
| `generate_lead` | envio **válido** do formulário | push com `eventCallback` + `eventTimeout`, depois redireciona; `Lead` na Meta |
| `lead_confirmed` | página de obrigado, só se veio de envio real | **mesmo `event_id`** do `generate_lead`; `Lead` só no Pixel |

- `event_data.event_id` é um UUID por evento e serve para **deduplicar** navegador × servidor na
  Meta: mesmo nome de evento, mesmo `event_id` (o "Event ID" do Pixel e o parâmetro `event_id` da tag
  de evento GA4, que a tag do servidor lê), mesmo Pixel ID, dentro de 48 h [M-DEDUP][M-SE][T-CAPI].
  O `lead_confirmed` reaproveita o `event_id` do `generate_lead` (guardado no `sessionStorage` e
  apagado depois do push), então os dois viram um `Lead` só na Meta.
- Abrir a página de obrigado direto **não** gera `lead_confirmed`: nada de conversão inventada.

### Identificação dos elementos

Todo elemento relevante tem `id` = `data-track-id` (kebab-case, `<local>-<tipo>-<nome>`, ex.:
`hero-cta-principal`), `data-track-label` (para que serve, em português) e `data-track-location`
(`nav`, `hero`, `form`, `footer`, `obrigado`...). O formulário também tem `data-track-id`. Tabela de
exemplo em `references/tracking-plano.md` (seções 5 e 6).

### Consentimento

O bloco `consent` começa **todo `denied`** (`consent_source: "padrao_negado"`), também em produção, e
só muda quando o banner/CMP do site chama `window.trackingAtualizarConsentimento({...}, 'banner')`.
Nunca deixe o padrão como `granted`. Esta skill não implementa banner.

**Ainda não ligado no contêiner inicial:** nenhuma tag lê esse bloco hoje. O próximo passo é ligar,
a partir do mesmo banner, o **Consent Mode v2** do Google (`ad_storage`, `analytics_storage`,
`ad_user_data`, `ad_personalization`: padrão negado antes das tags e atualização na escolha)
[G-CM][G-SCM] e o consentimento do Pixel (campo "Consent Granted" do modelo, que chama
`fbq('consent', 'grant'|'revoke')`) [T-PIX], além de bloquear a tag da Meta no servidor sem
consentimento. A base legal (LGPD) é decisão do cliente; os Termos da Meta exigem consentimento
verificável onde a lei pede [M-BTT].

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
7. **Servidor:** o `fbc` vai sem hash. A tag oficial lê `x-fb-ck-fbc` (ou o cookie `_fbc`), mas
   **refaz** o valor com a hora do servidor quando a `page_location` tem `fbclid` e, com "Extend
   cookies" ligado, regrava o cookie [T-CAPI]. O que fica e o que não fica garantido está em
   `references/fbc.md` (seção 7).

Depois de qualquer mudança no fbc, rode `node references/fbc-teste.mjs` (todos os casos devem passar)
e faça o teste manual da seção 8 de `references/fbc.md` (`?fbclid=TESTE123`, recarregar, outro fbclid).

## 3. Ligando GTM web → GTM Server → GA4 / Meta CAPI

Os contêineres prontos para importar estão em `gtm/templates/` na raiz deste repositório
(`web.json` e `server.json`), com o passo a passo de importação, a tabela do que preencher e os
limites em `gtm/README.md`. Esta seção explica o desenho deles. Princípio: **uma tag por provedor**
em cada contêiner, nomes vindos de **tabelas de consulta** e o que muda de um site para outro fica só
em **constantes**.

**Sem script duplicado:** GA4 e Pixel da Meta são carregados **só pelo GTM**. A página carrega apenas
o `tracking.js` (que só faz pushes no dataLayer e cuida do `_fbc`) e o snippet do GTM. Nunca coloque
`gtag.js`, `fbq(...)`, `fbevents.js`, ID de medição do GA4 ou Pixel ID no código do site: o evento
seria contado duas vezes e a deduplicação por `event_id` deixaria de funcionar.

Tags usadas: o modelo oficial do Pixel da Meta no GTM web [T-PIX] e a tag oficial da API de
Conversões da Meta no GTM Server [T-CAPI], ambos da Galeria de modelos (vêm embutidos nos arquivos
de exportação).

### O que cada tag oficial faz (e não faz)

- **Pixel (web) não traduz nomes GA4** [T-PIX]. O nome vai como está: `generate_lead` viraria um
  evento **personalizado** e nunca deduplicaria com o `Lead` do servidor. Por isso o nome do Pixel vem
  de uma tabela de consulta para o nome **padrão** da Meta (`generate_lead` → `Lead`,
  `page_data` → `PageView`).
- **A tag do servidor não tem campo de nome de evento nem campos de dados do usuário** [T-CAPI]. Ela
  traduz sozinha os nomes GA4 do mapa oficial (`page_view` → `PageView`, `generate_lead` → `Lead`,
  `purchase` → `Purchase`...; tabela em `references/parametros.md`) [M-GTM]. Qualquer outro nome
  (`cta_click`, `form_start`, `lead_confirmed`, `scroll`...) vai para a Meta **igual, como evento
  personalizado**. Por isso o **acionador** da tag do servidor limita os eventos.
- A tag do servidor lê tudo dos dados do evento GA4 [T-CAPI]:
  - `event_id` → `event_id` (deduplicação);
  - `x-fb-ck-fbc` / `x-fb-ck-fbp` → `fbc` / `fbp` (senão os cookies `_fbc`/`_fbp` da requisição);
  - `x-fb-ud-*` → chaves de usuário sem hash da tag (ex.: `x-fb-ud-external_id`);
  - `user_data.email_address`, `user_data.phone_number`, `user_data.address.*` → `em`, `ph`, `fn`,
    `ln`... (ela normaliza e faz o hash);
  - `x-fb-cd-*` e `custom_properties` (JSON em texto) → `custom_data`;
  - `ip_override` e `user_agent` → `client_ip_address` e `client_user_agent`.

### Constantes (as únicas edições por site)

| Contêiner | Constante | Valor no modelo | Observação |
|---|---|---|---|
| Web | `ga4_tag_id` | `G-XXXXXXXXXX` | ID de medição do GA4, usado pela `google_tag` e pela `ga4_event` |
| Web | `meta_pixel` | `PREENCHER_META_PIXEL_ID` | O mesmo Pixel ID do servidor (a deduplicação é por Pixel) [M-DEDUP] |
| Web | `transport_url` | `https://sgtm.seudominio.com` | `https://` + `GTM_DOMAIN` desta stack |
| Servidor | `meta_pixel` | `PREENCHER_META_PIXEL_ID` | Igual ao do web |
| Servidor | `meta_access_token` | `PREENCHER_META_ACCESS_TOKEN` | Só no contêiner de servidor; nunca no código do site nem no repositório |
| Servidor | `meta_test_event_code` | vazio | Preencha **só** durante o teste e apague antes de publicar |

### Tabelas de consulta (GTM web, sobre o evento do dataLayer)

| dataLayer `event` | `LT - ga4 event name` | `LT - meta event name` |
|---|---|---|
| `page_data` | `page_view` | `PageView` |
| `generate_lead` | `generate_lead` (padrão: o próprio evento) | `Lead` |
| `lead_confirmed` | `lead_confirmed` (padrão) | `Lead` (mesmo `event_id` do `generate_lead`: deduplica) |
| `cta_click`, `form_start` | igual ao evento (padrão) | não vai para a Meta (acionador `CE - meta events`) |

### GTM web (`gtm/templates/web.json`)

1. **Variáveis de camada de dados** (versão 2): `event_id` (`event_data.event_id`), `event_name`,
   `user_email`, `user_phone`, `user_first_name`, `user_last_name`, `user_external_id`, `user_fbp`,
   `user_fbc`, `user_user_agent` e `user_id` (todas lendo `user_data.*`).
2. **Acionadores:** `CE - tracked events` (evento personalizado
   `^(page_data|generate_lead|lead_confirmed|form_start|cta_click)$`) e `CE - meta events`
   (`^(page_data|generate_lead|lead_confirmed)$`).
3. **`google_tag`** (tag do Google) com `{{ga4_tag_id}}`, `server_container_url` =
   `{{transport_url}}` [G-SST], `send_page_view` = `false` (o `page_view` sai da tag de evento, com
   `event_id`) e `user_id` = `{{user_id}}`. Dispara na Inicialização. O `tracking.js` não envia
   `user_id`: preencha só para usuário **logado**; **não** use o `external_id` anônimo [G-UID].
4. **`ga4_event`** (uma tag "Evento do GA4" para todos os eventos), em `CE - tracked events`:
   - nome do evento = `{{LT - ga4 event name}}`;
   - parâmetros: `event_id` = `{{event_id}}`, `x-fb-ck-fbc` = `{{user_fbc}}`, `x-fb-ck-fbp` =
     `{{user_fbp}}`, `x-fb-ud-external_id` = `{{user_external_id}}`.
5. **`meta_pixel`** (modelo oficial do Pixel), em `CE - meta events`:
   - Event Name = `{{LT - meta event name}}`; Event ID = `{{event_id}}`; Pixel ID = `{{meta_pixel}}`;
   - correspondência avançada: `em`, `ph`, `fn`, `ln` e `external_id` a partir do `user_data`;
   - "Meta-enabled Conversions API" (`optInMetaCAPI`) desligado e sem `server_container_url` nas
     propriedades do objeto.

**Ainda não está no modelo** (faça à mão se precisar; detalhes em `gtm/README.md`): a variável
"Dados fornecidos pelo usuário" (manual) passada como `user_data` na `ga4_event`, para o GA4 e a CAPI
também receberem e-mail e telefone [G-UPD][G-UPD-GTM]; e o telefone **só com dígitos** no Pixel
[M-CIP][M-AM] (o modelo manda `{{user_phone}}` com `+`).

### GTM Server (`gtm/templates/server.json`)

1. **Cliente `GA4`** recebe os hits do GTM web.
2. **`ga4_web-to-server`** (tag GA4) sem ID de medição próprio (herda o do hit), no acionador
   `ga4_client_name` (Client Name = `GA4`) [G-SST][G-SIG].
3. **`meta_capi`** (tag oficial da API de Conversões da Meta) [T-CAPI]:
   - Pixel ID = `{{meta_pixel}}`, Access Token = `{{meta_access_token}}`, Test Event Code =
     `{{meta_test_event_code}}`, Action Source `website`, "Extend cookies" ligado;
   - **acionador limitado** `ga4_meta_events`: Client Name = `GA4` **e** Event Name corresponde a
     `^(page_view|generate_lead)$`. Os dois já são traduzidos pela tag (`PageView`, `Lead`). **Não**
     use só "Client Name = GA4": todo evento GA4 (`scroll`, `user_engagement`, `form_start`...) iria
     para a Meta como personalizado [T-CAPI];
   - o `lead_confirmed` não vai pela CAPI: o Pixel manda `Lead` com o mesmo `event_id` do
     `generate_lead`, que já foi pela CAPI, e a Meta mantém um só [M-DEDUP].
4. Código de teste: eventos com código de teste não são descartados e a Meta manda removê-lo em
   produção [M-API][M-GTM]. O modelo traz `meta_test_event_code` **vazio**. O ideal (ainda não no
   modelo) é uma tabela de consulta sobre `{{Debug Mode}}`: `true` → código de teste, senão vazio.
5. **Ainda não está no modelo:** uma transformação "Excluir parâmetros" só para a tag GA4, que tira
   `x-fb-*` e `event_id`, que não servem ao GA4 [G-TR].
6. Para mandar à Meta um nome fora do mapa da tag (ex.: `Contact`), a saída citada pela Meta é usar o
   nome do evento personalizado [M-GTM]; trocar o `event_name` com uma transformação Augment só para
   a tag da Meta é **NÃO VERIFICADO** [G-TR]: teste no Preview.
7. Consentimento: ver seção 1 ("Ainda não ligado no contêiner inicial").
8. Valide no **Preview** dos dois contêineres antes de publicar e depois confira no Gerenciador de
   Eventos: aba Event Deduplication [M-VER], EMQ do `Lead` ≥ 6 [M-VER] e nenhum `page_data`, `scroll`
   ou `user_engagement` chegando à Meta.

## 4. Implementando no site do aluno

1. Pergunte (ou descubra no código): domínio, páginas, onde fica o formulário e a página de
   obrigado, ID do contêiner web e domínio do GTM Server. Se o aluno não informar um ID, mantenha o
   placeholder.
2. Procure e **remova** do site qualquer carregamento direto de analytics (`gtag.js`, `gtag(...)`,
   `fbq(...)`, `fbevents.js`, outro snippet do GTM): tudo passa a sair do GTM.
3. Copie `references/tracking.js` para o site (ex.: `/assets/tracking.js`). Ajuste só
   `PAGINA_OBRIGADO` (no topo do arquivo), `validarFormulario()` e os nomes dos campos do formulário
   (`nome`, `email`, `telefone`, `consentimento`). Não altere o bloco do fbc além disso.
4. Em todas as páginas, aplique `references/snippet-head.html`: as duas primeiras tags `<script>`
   (`tracking.js` **antes** do snippet do GTM) dentro do `<head>`; o `<noscript>` logo depois da
   abertura do `<body>`; o `<a>` final é só um exemplo de elemento rastreado. Troque `GTM-XXXXXXX`
   nos dois lugares; enquanto for `GTM-XXXXXXX`, o snippet não carrega nada. Marque a página com
   `data-page` na tag `<html>` (`obrigado` na página de obrigado). Se o `gtm.js` for servido pelo
   contêiner de servidor, troque `https://www.googletagmanager.com` pelo domínio dele.
5. Marque os elementos com `id`/`data-track-id`/`data-track-label`/`data-track-location` e o
   formulário com `data-track-id`.
6. Ligue o consentimento ao banner do site (`window.trackingAtualizarConsentimento`) e, nos
   contêineres, o Consent Mode v2 e o consentimento do Pixel (seção 1).
7. Gere o plano do site a partir de `references/tracking-plano.md`, com a lista real de elementos.
8. Importe e preencha os contêineres de `gtm/templates/` como em `gtm/README.md`.
9. Teste: `node references/fbc-teste.mjs`, o roteiro de `references/fbc.md` (seção 8) e o Preview do
   GTM (cada evento com as quatro chaves, `lead_confirmed` com o mesmo `event_id` do
   `generate_lead` e o mesmo `fbc` da página de entrada; Pixel com `Lead`/`PageView`, nunca
   `generate_lead`/`page_data`; código de teste da Meta vazio fora do Preview; nenhuma requisição a
   `gtag/js` ou `fbevents.js` que não venha do GTM).

Se o site não for HTML estático (WordPress, React, Next.js...), mantenha a ideia: o script roda no
`<head>` antes do GTM em toda página; em SPA, adapte o script para repetir o `page_data` (e o `capturarFbc()`) a cada troca de rota.
