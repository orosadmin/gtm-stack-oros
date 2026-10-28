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
| `references/tracking.js` | Modelo do script (placeholders `G-XXXXXXXXXX`; comentado em português) |
| `references/snippet-head.html` | Ordem no `<head>`, snippet do GTM (`GTM-XXXXXXX`), `<noscript>` e exemplo de elemento rastreado |
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

Este é o desenho do **contêiner modelo** (web e servidor) que acompanha esta skill. Os arquivos de
exportação dos contêineres serão adicionados a este repositório depois; até lá, monte à mão seguindo
esta seção. Princípio: **uma tag por provedor** em cada contêiner, nomes vindos de **tabelas de
consulta**, e o que muda de um site para outro fica só em **constantes**.

Tags usadas: o modelo oficial do Pixel da Meta no GTM web [T-PIX] e a tag oficial da API de
Conversões da Meta no GTM Server [T-CAPI], ambos da Galeria de modelos.

### O que cada tag oficial faz (e não faz)

- **Pixel (web) não traduz nomes GA4** [T-PIX]. O nome vai como está: `generate_lead` viraria um
  evento **personalizado** e nunca deduplicaria com o `Lead` do servidor. Por isso o nome do Pixel vem
  de uma tabela de consulta para o nome **padrão** da Meta (`generate_lead` → `Lead`,
  `page_data` → `PageView`).
- **A tag do servidor não tem campo de nome de evento nem campos de dados do usuário** [T-CAPI]. Ela
  traduz sozinha os nomes GA4 do mapa oficial (`page_view` → `PageView`, `generate_lead` → `Lead`,
  `purchase` → `Purchase`...; tabela em `references/parametros.md`) [M-GTM]. Qualquer outro nome
  (`cta_click`, `form_start`, `lead_confirmed`, `scroll`...) vai para a Meta **igual, como evento
  personalizado**. Por isso o **acionador** da tag do servidor precisa limitar os eventos.
- A tag do servidor lê tudo dos dados do evento GA4 [T-CAPI]:
  - `event_id` → `event_id` (deduplicação);
  - `x-fb-ck-fbc` / `x-fb-ck-fbp` → `fbc` / `fbp` (senão os cookies `_fbc`/`_fbp` da requisição);
  - `x-fb-ud-*` → chaves de usuário sem hash da tag (ex.: `x-fb-ud-external_id`);
  - `user_data.email_address`, `user_data.phone_number`, `user_data.address.*` → `em`, `ph`, `fn`,
    `ln`... (ela normaliza e faz o hash);
  - `x-fb-cd-*` e `custom_properties` (JSON em texto) → `custom_data`;
  - `ip_override` e `user_agent` → `client_ip_address` e `client_user_agent`.

### Constantes (as únicas edições por site)

| Contêiner | Constante | Observação |
|---|---|---|
| Web | `C - ga4 measurement id` | **Tem de ser o mesmo ID** usado pela tag do Google e pelo `GA4_MEASUREMENT_ID` do `tracking.js`; senão `ga_session_id`/`ga_session_number` ficam `null` e os dados vão para outra propriedade |
| Web | `C - meta pixel id` | O mesmo Pixel ID do servidor (a deduplicação é por Pixel) [M-DEDUP] |
| Web | `C - server container url` | `https://` + `GTM_DOMAIN` desta stack |
| Servidor | `C - meta pixel id` | Igual ao do web |
| Servidor | `C - meta access token` | Só no contêiner de servidor; nunca no código do site nem no repositório |
| Servidor | `C - meta test event code` | Usado **só no Preview** (ver abaixo) |

### Tabelas de consulta (GTM web, sobre `{{Event}}`)

| dataLayer `event` | `LT - ga4 event name` | `LT - meta event name` |
|---|---|---|
| `page_data` | `page_view` | `PageView` |
| `generate_lead` | `generate_lead` | `Lead` |
| `lead_confirmed` | `lead_confirmed` | `Lead` (mesmo `event_id` do `generate_lead`: deduplica) |
| `cta_click`, `form_start` | igual ao evento | (vazio: a Meta não recebe) |

Valor padrão de `LT - meta event name`: vazio. Evento personalizado só vai para a Meta se você
colocar um nome na tabela.

### GTM web

1. **Variáveis de camada de dados** (versão 2): `user_data.email`, `user_data.phone_number`,
   `user_data.first_name`, `user_data.last_name`, `user_data.external_id`, `user_data.fbp`,
   `user_data.fbc`, `event_data.event_id`, `event_data.element_id`, `event_data.form_id` etc.
   Nomeie como `DLV - user_data.fbc`.
2. **Tag do Google** com `{{C - ga4 measurement id}}`, `server_container_url` =
   `{{C - server container url}}` [G-SST] e `send_page_view` = `false` (o `page_view` sai da tag de
   evento, com `event_id`). Dispara na Inicialização. `user_id` só para usuário **logado**; **não**
   mapeie o `external_id` anônimo para `user_id` [G-UID].
3. **Uma tag "Evento do GA4"** para todos os eventos, no acionador de evento personalizado
   `^(page_data|cta_click|form_start|generate_lead|lead_confirmed)$`:
   - nome do evento = `{{LT - ga4 event name}}`;
   - parâmetros: `event_id` = `{{DLV - event_data.event_id}}`, `x-fb-ck-fbc` =
     `{{DLV - user_data.fbc}}`, `x-fb-ck-fbp` = `{{DLV - user_data.fbp}}`, `x-fb-ud-external_id` =
     `{{DLV - user_data.external_id}}`, além de `element_id`, `form_id`...;
   - `user_data` = variável "Dados fornecidos pelo usuário" (manual) com e-mail, telefone (E.164),
     nome e sobrenome do `user_data` do dataLayer; ative a coleta de dados fornecidos pelo usuário no
     Admin do GA4 [G-UPD][G-UPD-GTM].
4. **Uma tag do Pixel da Meta** no **mesmo** acionador, com exceção quando `{{LT - meta event name}}`
   estiver vazio:
   - Event Name = Variável `{{LT - meta event name}}`; Event ID = `{{DLV - event_data.event_id}}`;
   - Pixel ID = `{{C - meta pixel id}}`;
   - correspondência avançada: e-mail, telefone **só com dígitos** (ex.: variável JavaScript que
     tira o `+` do `user_data.phone_number`), nome, sobrenome e `external_id` [M-CIP][M-AM];
   - sem linha `server_container_url` nas propriedades do objeto: ela não manda o Pixel pelo
     servidor, só envia mais um parâmetro à Meta.

### GTM Server (esta stack)

1. **Cliente GA4** recebe os hits do GTM web.
2. **Tag GA4** com ID de medição em branco (herda o do hit) e acionador Client Name = `GA4`
   [G-SST][G-SIG]. Recomendado: uma transformação Exclude só para esta tag que tira `x-fb-*` e
   `event_id`, que não servem ao GA4 [G-TR].
3. **Tag da API de Conversões da Meta** (modelo oficial) [T-CAPI]:
   - Pixel ID = `{{C - meta pixel id}}`, Access Token = `{{C - meta access token}}`, Action Source
     `website`;
   - Test Event Code = tabela de consulta sobre `{{Debug Mode}}`: `true` → `{{C - meta test event
     code}}`, senão **vazio**. Eventos com código de teste não são descartados e a Meta manda
     removê-lo em produção [M-API][M-GTM];
   - **acionador limitado**: Client Name = `GA4` **e** Event Name corresponde a
     `^(page_view|generate_lead)$`. Os dois já são traduzidos pela tag (`PageView`, `Lead`), então não
     é preciso trocar nomes no servidor. **Não** use só "Client Name = GA4": todo evento GA4
     (`scroll`, `user_engagement`, `form_start`...) iria para a Meta como personalizado [T-CAPI];
   - o `lead_confirmed` não vai pela CAPI: o Pixel manda `Lead` com o mesmo `event_id` do
     `generate_lead`, que já foi pela CAPI, e a Meta mantém um só [M-DEDUP].
4. Para mandar à Meta um nome fora do mapa da tag (ex.: `Contact`), a saída citada pela Meta é usar o
   nome do evento personalizado [M-GTM]; trocar o `event_name` com uma transformação Augment só para
   a tag da Meta é **NÃO VERIFICADO** [G-TR]: teste no Preview.
5. Consentimento: ver seção 1 ("Ainda não ligado no contêiner inicial").
6. Valide no **Preview** dos dois contêineres antes de publicar e depois confira no Gerenciador de
   Eventos: aba Event Deduplication [M-VER], EMQ do `Lead` ≥ 6 [M-VER] e nenhum `page_data`, `scroll`
   ou `user_engagement` chegando à Meta.

## 4. Implementando no site do aluno

1. Pergunte (ou descubra no código): domínio, páginas, onde fica o formulário e a página de
   obrigado, ID do contêiner web, ID do GA4, domínio do GTM Server. Se o aluno não informar um ID,
   mantenha o placeholder.
2. Copie `references/tracking.js` para o site (ex.: `/assets/tracking.js`). Ajuste os pontos marcados
   com `>>>`: `GA4_MEASUREMENT_ID` (o mesmo ID da constante `C - ga4 measurement id` e da tag do
   Google), `PAGINA_OBRIGADO`, `validarFormulario()` e os nomes dos campos. Não altere o bloco do fbc
   além disso.
3. Em todas as páginas, aplique `references/snippet-head.html`: `tracking.js` **antes** do snippet do
   GTM, `<noscript>` depois do `<body>`, e `data-page` na tag `<html>` (`obrigado` na página de
   obrigado).
4. Marque os elementos com `id`/`data-track-id`/`data-track-label`/`data-track-location` e o
   formulário com `data-track-id`.
5. Ligue o consentimento ao banner do site (`window.trackingAtualizarConsentimento`) e, nos
   contêineres, o Consent Mode v2 e o consentimento do Pixel (seção 1).
6. Gere o plano do site a partir de `references/tracking-plano.md`, com a lista real de elementos.
7. Configure os contêineres como na seção 3.
8. Teste: `node references/fbc-teste.mjs`, o roteiro de `references/fbc.md` (seção 8) e o Preview do
   GTM (cada evento com as quatro chaves, `lead_confirmed` com o mesmo `event_id` do
   `generate_lead` e o mesmo `fbc` da página de entrada; Pixel com `Lead`/`PageView`, nunca
   `generate_lead`/`page_data`; código de teste da Meta vazio fora do Preview).

Se o site não for HTML estático (WordPress, React, Next.js...), mantenha a ideia: o script roda no
`<head>` antes do GTM em toda página; em SPA, adapte o script para repetir o `page_data` (e o `capturarFbc()`) a cada troca de rota.
