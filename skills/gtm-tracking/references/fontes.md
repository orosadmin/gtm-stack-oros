# Fontes oficiais usadas nesta skill

Toda afirmação sobre o comportamento do GA4, do Pixel da Meta e da API de Conversões (CAPI) nesta
skill vem de uma das fontes abaixo. No texto, a fonte aparece entre colchetes, por exemplo
**[M-DEDUP]** ou **[T-CAPI]**: procure a sigla aqui para abrir o link e conferir.

Como ler:

- **Código do modelo** ([T-CAPI], [T-PIX]) é a fonte mais forte: é o código que o GTM executa.
  Quando a documentação e o código divergem, vale o código.
- **NÃO VERIFICADO** marca o que não foi confirmado em fonte oficial. Teste no Preview antes de
  confiar nesses pontos.
- Levantamento feito em 28/10/2026. As páginas da Meta e do Google mudam; confira a data da página.

## Código dos modelos do GTM (oficiais)

| Sigla | Fonte | Usada para |
|---|---|---|
| [T-CAPI] | [facebookincubator/ConversionsAPI-Tag-for-GoogleTagManager](https://github.com/facebookincubator/ConversionsAPI-Tag-for-GoogleTagManager) (`template.tpl`, `metadata.yaml`) | Tag da API de Conversões no GTM Server: mapa automático de nomes GA4 → Meta, ausência de campo de nome de evento, leitura de `event_id`, `x-fb-ck-*`, `x-fb-ud-*`, `x-fb-cd-*`, `custom_properties` e `user_data.*`, hash e normalização no servidor, reconstrução do `fbc` a partir do `fbclid` da `page_location`, "Extend cookies" |
| [T-PIX] | [facebook/GoogleTagManager-WebTemplate-For-FacebookPixel](https://github.com/facebook/GoogleTagManager-WebTemplate-For-FacebookPixel) (`template.tpl`, v2.0.9) | Tag do Pixel no GTM web: não traduz nomes GA4, `trackSingle` × `trackSingleCustom`, campo Event ID, propriedades do objeto, "Consent Granted" (`fbq('consent', 'grant'/'revoke')`) |

## Meta

| Sigla | Fonte | Usada para |
|---|---|---|
| [M-GTM] | [Conversions API: GTM server-side](https://developers.facebook.com/documentation/ads-commerce/conversions-api/guides/gtm-server-side.md) | Tabela de mapeamento GA4 → Meta, parâmetros `x-fb-*`, `custom_properties` em JSON, eventos personalizados, ranking de chaves de correspondência |
| [M-DEDUP] | [Deduplicação de eventos do Pixel e do servidor](https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events) | Chave de deduplicação (`eventID` do Pixel = `event_id` da CAPI + mesmo nome + mesmo Pixel), janela de 48 h, alternativa com `fbp`/`external_id` |
| [M-FBC] | [Parâmetros fbp e fbc](https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/fbp-and-fbc) | Formato do `fbc`/`fbp`, subdomainIndex, creationTime em ms, quando gravar o `_fbc`, 90 dias, fbclid sensível a maiúsculas |
| [M-CIP] | [Parâmetros de informação do cliente](https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters) | Quais chaves de `user_data` levam hash e como normalizar cada uma (telefone só dígitos com DDI etc.) |
| [M-SE] | [Parâmetros do evento de servidor](https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/server-event) | Campos obrigatórios (`event_name`, `event_time` em segundos e até 7 dias, `user_data`, `action_source`, `event_source_url`), janela de 48 h |
| [M-CD] | [Parâmetros de custom_data](https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/custom-data) | `value`, `currency`, `contents`, `content_type`, `num_items`, `search_string` |
| [M-STD] | [Referência do Pixel: eventos padrão](https://developers.facebook.com/docs/meta-pixel/reference) | Lista de eventos padrão e parâmetros de cada um |
| [M-CT] | [Rastreamento de conversões do Pixel](https://developers.facebook.com/docs/meta-pixel/implementation/conversion-tracking) | Nome de evento personalizado com até 50 caracteres |
| [M-AM] | [Correspondência avançada do Pixel](https://developers.facebook.com/docs/meta-pixel/advanced/advanced-matching) | O Pixel faz o hash SHA-256 dos dados passados no `init` |
| [M-PB] | [Parameter Builder](https://developers.facebook.com/docs/marketing-api/conversions-api/parameter-builder-feature-library) | Capturar cedo, não sobrescrever cookies, "hash uma vez só", sufixo de 8 caracteres no `fbc` |
| [M-API] | [Usando a API de Conversões](https://developers.facebook.com/docs/marketing-api/conversions-api/using-the-api) | `test_event_code`: eventos de teste não são descartados; remova em produção |
| [M-BP] | [Boas práticas da API de Conversões](https://developers.facebook.com/documentation/ads-commerce/conversions-api/best-practices.md) | `client_user_agent` obrigatório em eventos de site, combinações de `user_data` rejeitadas, enviar `event_id` e `external_id` sempre |
| [M-VER] | [Verificando a configuração](https://developers.facebook.com/documentation/ads-commerce/conversions-api/verifying-setup.md) | Aba Event Deduplication no Gerenciador de Eventos, meta de EMQ ≥ 6,0 |
| [M-EXT] | [Parâmetro external_id](https://developers.facebook.com/documentation/ads-commerce/conversions-api/parameters/external-id.md) | `external_id` consistente em todos os canais |
| [M-LDU] | [Opções de processamento de dados (LDU)](https://developers.facebook.com/documentation/ads-commerce/marketing-api/overview/data-processing-options.md) | Limited Data Use: só estados dos EUA |
| [M-BTT] | [Termos das Ferramentas de Negócios da Meta](https://www.facebook.com/legal/terms/businesstools) | O que não enviar à Meta, consentimento verificável onde a lei exige |

## Google

| Sigla | Fonte | Usada para |
|---|---|---|
| [G-EV] | [Referência de eventos do GA4](https://developers.google.com/analytics/devguides/collection/ga4/reference/events) | Eventos recomendados e parâmetros (`generate_lead`, `purchase`, `items`, `currency` com `value`) |
| [G-SST] | [Configurar o GA4 com tagueamento no servidor](https://developers.google.com/tag-platform/learn/sst-fundamentals/5-sst-setup-analytics) | `server_container_url` na tag do Google, cliente GA4, acionador "Client Name = GA4", ID de medição em branco na tag do servidor |
| [G-SIG] | [Google signals no sGTM](https://developers.google.com/tag-platform/tag-manager/server-side/google-signals-in-sgtm?option=GA4) | ID de medição em branco herda o do hit (lido em resumo de busca) |
| [G-CED] | [Dados comuns do evento no sGTM](https://developers.google.com/tag-platform/tag-manager/server-side/common-event-data) | Nomes dos dados do evento no servidor: `client_id`, `ip_override`, `user_agent`, `page_location`, `user_data.*` |
| [G-API] | [API de modelos do sGTM](https://developers.google.com/tag-platform/tag-manager/server-side/api) | `getRemoteAddress` lê `Forwarded`/`X-Forwarded-For` (melhor esforço) |
| [G-TR] | [Transformações no sGTM](https://developers.google.com/tag-platform/tag-manager/server-side/transformations) | Transformações Augment/Exclude por tag |
| [G-UID] | [User-ID no GA4](https://developers.google.com/analytics/devguides/collection/ga4/user-id) | `user_id` só para usuário logado; `null` ao sair |
| [G-UPD] | [Coleta de dados fornecidos pelo usuário](https://support.google.com/analytics/answer/14077171) | Precisa ativar a coleta no Admin do GA4 |
| [G-UPD-GTM] | [Dados fornecidos pelo usuário no GTM (manual)](https://support.google.com/analytics/answer/14179229) e [(automático)](https://support.google.com/analytics/answer/14179632) | Variável "Dados fornecidos pelo usuário" na tag de evento (lidas em resumo de busca, não abertas diretamente) |
| [G-EC] | [Enhanced conversions para web (Google Ads API)](https://developers.google.com/google-ads/api/docs/conversions/enhanced-conversions/web) | Normalização do Google: e-mail minúsculo, telefone E.164 com `+`, nomes minúsculos |
| [G-PII] | [Política de PII do Google Analytics](https://support.google.com/analytics/answer/6366371) | Nada de dado pessoal em parâmetros, URLs ou `user_id` |
| [G-CM] | [Consent Mode](https://developers.google.com/tag-platform/security/guides/consent) | Quatro chaves do Consent Mode v2, padrão antes das tags, atualização pelo banner |
| [G-SCM] | [Consent Mode no sGTM](https://developers.google.com/tag-platform/tag-manager/server-side/consent-mode) | Tags do Google no servidor respeitam o consentimento recebido |
| [G-TXN] | [Deduplicação por transaction_id](https://support.google.com/analytics/answer/12313109) | GA4 deduplica `purchase` com o mesmo `transaction_id` (só streams web) |

## Por assunto: qual fonte sustenta o quê

| Assunto | Fontes | Situação |
|---|---|---|
| Mapa automático GA4 → Meta na tag do servidor; nomes não mapeados passam como evento personalizado | [T-CAPI], [M-GTM] | Confirmado no código |
| Tag do servidor sem campo de nome de evento nem campos de usuário | [T-CAPI] | Confirmado no código |
| Pixel web não traduz nomes GA4 | [T-PIX] | Confirmado no código |
| Trocar o `event_name` só na tag da Meta com uma transformação Augment | [G-TR] | **NÃO VERIFICADO**: a página diz que Augment altera parâmetros existentes, mas não cita `event_name`. Esta skill não depende disso |
| Deduplicação: mesmo nome, mesmo `event_id`, mesmo Pixel, 48 h | [M-DEDUP], [M-SE], [T-CAPI] | Confirmado |
| Qual lado a Meta mantém na deduplicação | [M-DEDUP], [M-SE] | As duas páginas dizem coisas diferentes (o primeiro recebido × o do navegador se chegarem em ~5 min) |
| Evento só com `event_id` de um lado | — | **NÃO VERIFICADO**: não documentado; espere contagem dupla |
| Rótulo "Deduplicated" em Test Events | — | **NÃO VERIFICADO** em página oficial |
| Regras do `fbc` (formato, quando gravar, 90 dias) | [M-FBC], [M-PB] | Confirmado |
| Tag do servidor refaz o `fbc` quando a `page_location` tem `fbclid` e regrava o cookie com "Extend cookies" | [T-CAPI] | Confirmado no código |
| subdomainIndex em domínios como `.com.br` (o modelo usa 1; a tag oficial calcula 2) | [M-FBC], [T-CAPI] | **NÃO VERIFICADO** qual a Meta considera certo e se ela valida o índice |
| Normalização e hash de cada chave de usuário (Meta) | [M-CIP], [T-CAPI] | Confirmado |
| Telefone E.164 com `+` para o Google | [G-EC] | Página do Google Ads API, a especificação oficial mais próxima |
| O Pixel faz hash do `external_id` passado no `init` | [M-AM] | **NÃO VERIFICADO**: a página lista o campo, mas não detalha |
| Cliente GA4 do servidor preenche `ip_override` a partir da requisição | [G-API], [G-CED], [T-CAPI] | **NÃO VERIFICADO** na documentação; a tag da Meta depende disso. Confira no Preview |
| Usar `CF-Connecting-IP` (Cloudflare) para corrigir o IP | — | **NÃO VERIFICADO**: só se o Preview mostrar o IP do proxy |
| `user_id` só para logado | [G-UID] | Confirmado |
| `test_event_code` fora de produção | [M-API], [M-GTM] | Confirmado |
| Consent Mode v2 e consentimento do Pixel | [G-CM], [G-SCM], [T-PIX], [M-BTT] | Confirmado |
| Versão da Graph API na tag oficial (v25.0) ainda dentro do suporte | [T-CAPI], [M-API] | **NÃO VERIFICADO**; os exemplos atuais da Meta usam v26.0 |
| "Meta-enabled Conversions API" do Pixel criar uma segunda fonte de servidor | [T-PIX] | **NÃO VERIFICADO**; confira em Gerenciador de Eventos → método de conexão |
