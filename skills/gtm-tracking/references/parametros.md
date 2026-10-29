# Parâmetros GA4 × Meta (Pixel e API de Conversões) — referência rápida

Tabelas de consulta para montar as tags. As siglas entre colchetes levam às fontes em
[`fontes.md`](fontes.md). "Tag do servidor" = tag oficial da API de Conversões da Meta no GTM Server
[T-CAPI]; "Pixel" = modelo oficial do Pixel no GTM web [T-PIX].

## 1. Nomes de evento

| Meta (padrão) | GA4 | A tag do servidor traduz sozinha? | O Pixel traduz? |
|---|---|---|---|
| `PageView` | `page_view` | sim | **não** |
| `ViewContent` | `view_item` | sim | não |
| `Lead` | `generate_lead` | sim | não |
| `CompleteRegistration` | `sign_up` | sim | não |
| `InitiateCheckout` | `begin_checkout` | sim | não |
| `AddToCart` | `add_to_cart` | sim | não |
| `AddPaymentInfo` / `AddToWishlist` | `add_payment_info` / `add_to_wishlist` | sim | não |
| `Purchase` | `purchase` | sim | não |
| `Search` | `search` | sim | não |
| `Contact` | (sem recomendado; ex.: `contact`) | **não**: o nome passa igual | não |
| `Subscribe` | (sem recomendado; ex.: `subscribe`) | **não**: o nome passa igual | não |

Fontes: [M-GTM], [T-CAPI], [M-STD].

- **Tag do servidor:** `event_name = mapa[nome GA4] || nome GA4`. Ela **não tem campo de nome de
  evento**. Qualquer nome fora do mapa (`cta_click`, `form_start`, `lead_confirmed`, `scroll`,
  `user_engagement`...) vai para a Meta como **evento personalizado**. Por isso o acionador da tag
  precisa limitar os eventos [T-CAPI].
- **Pixel:** o nome vai como está. Se for um dos nomes padrão (maiúsculas importam), o modelo chama
  `fbq('trackSingle', ...)`; senão, `fbq('trackSingleCustom', ...)`. `generate_lead` no Pixel vira
  evento personalizado e **nunca** deduplica com o `Lead` do servidor. Use uma tabela de consulta
  para mandar o nome padrão da Meta [T-PIX].
- Nome de evento personalizado: até 50 caracteres [M-CT].

## 2. Parâmetros por evento

`*` = obrigatório se o outro for enviado (no GA4, `currency` é obrigatório quando há `value`) [G-EV].

| Evento (Meta / GA4) | GA4 [G-EV] | Meta `custom_data` [M-STD][M-CD] |
|---|---|---|
| PageView / page_view | nada obrigatório (`page_location`, `page_title` vêm da tag) | nada |
| ViewContent / view_item | `currency`*, `value`*, `items` **obrigatório** | `content_ids`, `content_type`, `contents`, `currency`, `value`, `content_name`, `content_category` (catálogo Advantage+: `contents` ou `content_ids`) |
| Lead / generate_lead | `currency`*, `value`*, `lead_source` | `currency`, `value` (opcionais; obrigatórios se otimizar por valor [M-CD]) |
| CompleteRegistration / sign_up | `method` | `currency`, `value`, `status` |
| Contact / (personalizado) | — | — |
| InitiateCheckout / begin_checkout | `currency`*, `value`*, `coupon`, `items` **obrigatório** | `content_ids`, `contents`, `currency`, `num_items`, `value` |
| AddToCart / add_to_cart | `currency`*, `value`*, `items` **obrigatório** | `content_ids`, `content_type`, `contents`, `currency`, `value` |
| Purchase / purchase | **`transaction_id`**, `currency`*, `value`*, **`items`**, `coupon`, `shipping`, `tax` | **`currency` e `value` obrigatórios**, `content_ids`/`contents`, `content_type`, `num_items`, `order_id` |
| Search / search | **`search_term`** | `search_string`, `content_ids`, `contents`, `content_type`, `currency`, `value` |
| Subscribe / (personalizado) | — | `currency`, `predicted_ltv`, `value` |

- GA4 `items`: cada item precisa de `item_id` ou `item_name` [G-EV].
- Meta `contents[]`: `id` e `quantity` obrigatórios; `content_type` = `product` ou `product_group` [M-STD][M-CD].
- Todo evento de servidor precisa de `event_name`, `event_time` (Unix em **segundos**, no máximo 7
  dias atrás, senão a requisição inteira falha), `user_data`, `action_source` e, em site,
  `event_source_url` [M-SE].

### Como a tag do servidor monta o `custom_data` a partir do evento GA4 [T-CAPI]

| Campo Meta | De onde vem (dados do evento no sGTM) |
|---|---|
| `currency`, `value` | `currency`, `value` |
| `search_string` | `search_term` |
| `order_id` | `transaction_id` |
| `contents` | `x-fb-cd-contents` (JSON em texto); senão montado de `items` (`item_id`‖`item_name`, `price`, `quantity`) |
| `content_ids`, `content_type`, `content_name`, `content_category`, `num_items`, `predicted_ltv`, `status`, `delivery_category` | **só** de `x-fb-cd-<campo>`; não vêm de `items` |
| qualquer chave extra | `custom_properties` (objeto em JSON texto) |
| `event_id` | `event_id` (o `x-fb-event_id` citado em [M-GTM] não é lido pelo código) |
| `event_source_url` / `referrer_url` | `page_location` / `page_referrer` |
| `event_time` | `event_time`; senão o momento do envio |
| `action_source` | `action_source` do evento; senão o da tag |

`x-fb-cd-contents` e `custom_properties` precisam ir como `JSON.stringify(...)` [M-GTM].

## 3. Dados do usuário

### 3.1 Meta

O Pixel faz o hash SHA-256 do que recebe na correspondência avançada [M-AM]. A tag do servidor faz o
hash do que lê em `user_data.*` e repassa como está tudo que já for um hash (64 caracteres hex)
[T-CAPI]. Faça o hash **uma vez só** [M-PB]. Neste modelo o dataLayer leva os dados normalizados e
**sem hash**.

| Chave | Hash? [M-CIP] | Normalização [M-CIP] | O que a tag do servidor lê [T-CAPI] |
|---|---|---|---|
| `em` | sim | sem espaços nas pontas, minúsculo | `user_data.email_address` (ela normaliza e faz hash) ou `x-fb-ud-em` |
| `ph` | sim | **só dígitos, com DDI**, sem zeros à esquerda | `user_data.phone_number`. Ela remove só a **primeira** ocorrência de `+`, `-`, espaço, `(` e `)`: `+55 11 91234-5678` vira `5511 912345678` (hash errado). Mande E.164 (`+5511912345678`) ou só dígitos |
| `fn`, `ln` | sim | minúsculo, sem pontuação | `user_data.address.first_name` / `last_name` (só tira espaços das pontas e põe em minúsculo) |
| `ct` | sim | minúsculo, **sem espaços** nem pontuação | `user_data.address.city` (espaços e acentos sobrevivem: normalize antes) |
| `st`, `zp`, `country` | sim | minúsculo, sem espaços; `country` em ISO 3166-1 alfa-2 | `user_data.address.region` / `postal_code` / `country` |
| `ge`, `db` | sim | `f`/`m`; `AAAAMMDD` | `x-fb-ud-ge` / `x-fb-ud-db` **sem hash da tag**: mande já com hash |
| `external_id` | recomendado | id estável, igual em todos os canais [M-EXT] | `x-fb-ud-external_id`, repassado como está |
| `client_ip_address` | não | IPv4/IPv6 | `ip_override` dos dados do evento (servidor) |
| `client_user_agent` | não | obrigatório em eventos de site [M-BP] | `user_agent` dos dados do evento (servidor) |
| `fbc` | não | `fb.<índice>.<ms>.<fbclid>` | `x-fb-ck-fbc`, senão cookie `_fbc`; **substituído** se a `page_location` tiver `fbclid` (ver `fbc.md` §7) |
| `fbp` | não | `fb.<índice>.<ms>.<aleatório>` | `x-fb-ck-fbp`, senão cookie `_fbp` |

- Em ordem de peso para a qualidade de correspondência: alto `em`, `fbc`; médio `ph`, `external_id`,
  `fbp`, `db`, `country`, `st`, `ge`; baixo `fn`, `ln`, `ct`, `zp` [M-GTM]. Meta sugere EMQ ≥ 6,0 [M-VER].
- Eventos com `user_data` formado só por certas combinações fracas (ex.: `fn`+`ge`,
  `db`+`client_user_agent`) são rejeitados [M-BP].
- Se o Pixel faz hash do `external_id` passado no `init` é **NÃO VERIFICADO** [M-AM]. Confira no
  Gerenciador de Eventos se os dois lados chegam iguais.

### 3.2 GA4

| Item | Como funciona | Fonte |
|---|---|---|
| `client_id` | A tag do Google lê o cookie `_ga` e manda em cada hit (`client_id` no sGTM) | [G-CED] |
| `user_id` | Só para usuário **logado**; ao sair, `null` (nunca `""`). **Não** use o `external_id` anônimo | [G-UID] |
| Dados fornecidos pelo usuário | Parâmetro `user_data` da tag de evento = variável "Dados fornecidos pelo usuário" (manual). Ative a coleta no Admin do GA4. No sGTM chegam como `user_data.email_address`, `user_data.phone_number`, `user_data.address.*`, que a tag da Meta também lê | [G-UPD], [G-UPD-GTM], [G-CED], [T-CAPI] |
| Normalização Google | e-mail minúsculo sem espaços; telefone **E.164 com `+`**; nomes minúsculos; não fazer hash de cidade, estado, CEP e país | [G-EC] |
| IP e user agent | Preenchidos no servidor a partir da requisição (`ip_override`, `user_agent`) | [G-API], [G-CED] |
| PII | Nada de dado pessoal em parâmetros comuns, URLs ou `user_id`; contato só pelo canal de dados fornecidos pelo usuário | [G-PII] |

## 4. Deduplicação

**Meta** [M-DEDUP][M-SE]

- Chave: `eventID` do Pixel (campo "Event ID" do modelo) **igual** ao `event_id` da CAPI **e** o
  mesmo nome de evento, no **mesmo Pixel ID**.
- Janela: 48 horas a partir do primeiro evento com aquele id.
- Sem `event_id`, a Meta tenta com `fbp`/`external_id`, e isso em geral só funciona se o evento do
  navegador chegar primeiro. Mande os três: `event_id`, `external_id` e `fbp` [M-BP].
- Confira em Gerenciador de Eventos → detalhes do evento → aba **Event Deduplication** [M-VER].

Caminho do `event_id` neste modelo:

```
tracking.js: event_data.event_id (UUID)
  └─ GTM web: {{event_id}}
       ├─ tag do Pixel → campo Event ID → fbq('trackSingle', pixel, 'Lead', props, {eventID})
       └─ tag de evento GA4 → parâmetro event_id
             └─ GTM Server: dado do evento event_id → tag da Meta → event_id   [T-CAPI]
```

**GA4:** não há deduplicação por `event_id` documentada. Cada hit deve chegar ao GA4 **uma vez**
(navegador → sGTM → GA4). Só o `purchase` é deduplicado, pelo `transaction_id` (nunca vazio) [G-TXN].
