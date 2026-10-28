# Plano de rastreamento — modelo (skill gtm-tracking)

Modelo de plano de rastreamento para um site com uma home com formulário (`index.html`) e uma página de
obrigado (`obrigado.html`). Toda a lógica de dataLayer está no `tracking.js` desta pasta, comentada em
português. Copie este arquivo para o projeto do aluno e ajuste as tabelas de elementos (seção 6) ao site real.

## 1. O que você precisa trocar

| O quê | Onde | Valor atual | Observação |
|---|---|---|---|
| ID do contêiner web do GTM (lugar 1 de 2) | `<head>` de todas as páginas, no fim do snippet (`snippet-head.html`) | `GTM-XXXXXXX` | Enquanto for `GTM-XXXXXXX` o snippet não carrega nada (a linha `if(i.indexOf('XXXX')...)` impede). |
| ID do contêiner web do GTM (lugar 2 de 2) | `<noscript>` logo depois de `<body>`, em todas as páginas | `GTM-XXXXXXX` | Só é usado com JavaScript desligado. |
| Domínio do GTM Server (opcional) | mesmo snippet, `https://www.googletagmanager.com` | Google | Troque pelo seu domínio próprio (ex.: `https://gtm.seusite.com.br`) se servir o gtm.js pelo contêiner de servidor. |
| ID de medição do GA4 | `tracking.js`, constante `GA4_MEASUREMENT_ID` | `G-XXXXXXXXXX` | Usado só para ler o cookie `_ga_<ID>` (ga_session_id e ga_session_number). |
| Consentimento | `tracking.js`, `window.trackingAtualizarConsentimento()` | tudo `denied`, `consent_source: padrao_negado` | Fica negado até o seu banner/CMP chamar a função (LGPD). |
| Página de obrigado e campos do formulário | `tracking.js`, `PAGINA_OBRIGADO` e `validarFormulario()` | `obrigado.html`; nome, email, telefone, consentimento | Ajuste ao formulário real. |

## 2. Formato padrão de todo push

Todo evento enviado ao dataLayer tem sempre os mesmos quatro blocos:

```json
{
  "event": "nome_do_evento",
  "user_data":  { "...QUEM é o visitante..." },
  "event_data": { "...O QUE aconteceu..." },
  "consent":    { "...estado de consentimento..." }
}
```

- **user_data** (quem) e **event_data** (o quê) ficam separados, para mapear no GTM com variáveis de
  camada de dados como `user_data.email` ou `event_data.event_id`.
- Todas as chaves aparecem em todo push (com `null` ou `""` quando não se aplicam). Assim o GTM nunca
  reaproveita o valor de um evento anterior.
- Os identificadores são lidos de novo **antes de cada push**: cookies como `_fbp` e `_ga` podem ser
  criados pelas tags depois que a página carregou.

### 2.1 user_data — identificadores do visitante

| Chave | Origem | Exemplo | Observação |
|---|---|---|---|
| `external_id` | ID aleatório próprio (UUID), cookie `trk_external_id` + localStorage | `aced42e3-05c5-...` | Persistente (400 dias). Vai como `external_id` para a Meta. |
| `email` | formulário | `nome@exemplo.com` | Vazio até o envio. Normalizado: sem espaços e minúsculo. |
| `phone_number` | formulário | `5511912345678` | Vazio até o envio. Só dígitos com código do país (número BR sem DDI ganha `55`). |
| `first_name`, `last_name` | formulário (nome completo) | `fulano`, `de tal` | Vazio até o envio. Minúsculo. Ajuda o casamento (fn/ln) na Meta. |
| `fbp` | cookie `_fbp` (criado pelo Pixel/tag da Meta) | `fb.1.1793139000000.1234567890` | `null` enquanto nenhuma tag da Meta criar o cookie. |
| `fbc` | `?fbclid=` da URL de entrada; senão cookie `_fbc` como está; senão `null` | `fb.1.<criação em ms>.<fbclid>` | Regras completas em `fbc.md`. A data de criação nunca é refeita. |
| `ga_client_id` | cookie `_ga` (`GA1.1.X.Y` → `X.Y`) | `987654321.1793139000` | |
| `ga_session_id` | cookie `_ga_<ID do GA4>` | `1793139000` | Precisa de `GA4_MEASUREMENT_ID`. Lê os formatos GS1 e GS2. |
| `ga_session_number` | cookie `_ga_<ID do GA4>` | `7` | Idem. |
| `gclid` | URL `?gclid=`; senão cookie `_gcl_aw` | `TESTE_GCLID_456` | Guardado no localStorage para chegar à página de obrigado. |
| `gbraid`, `wbraid` | URL | | Idem (iOS / app). |
| `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content` | URL | `youtube`, `live`, `gtm_server` | Último toque: novas UTMs/click ids na URL substituem as guardadas. |
| `ip_address` | **sempre `null` no navegador** | `null` | Ver seção 4. |
| `user_agent` | `navigator.userAgent` | `Mozilla/5.0 ...` | O servidor também recebe o user agent pelo cabeçalho da requisição. |

O hash SHA-256 de e-mail/telefone **não** é feito no navegador: as tags do contêiner de servidor
(Meta CAPI, Google Ads Enhanced Conversions) fazem o hash antes de enviar.

### 2.2 event_data — o que aconteceu

| Chave | Exemplo | Observação |
|---|---|---|
| `event_id` | `cc4f8d30-d83e-40e1-ba0a-e86f84e248d6` | UUID único por evento. Usado para deduplicar navegador × servidor (Meta `event_id`, GA). `lead_confirmed` reaproveita o do `generate_lead`. |
| `event_name` | `generate_lead` | Igual ao `event`. |
| `event_timestamp` | `1793139852467` | Milissegundos. Para a Meta CAPI use segundos (`/1000`). |
| `event_source_url` | `http://localhost:8000/index.html?utm_source=...` | URL completa. |
| `page_title` | `Seu Site — Página inicial` | |
| `page_path` | `/index.html` | |
| `referrer` | `null` ou URL anterior | |
| `form_id` | `form-lead` | Só em eventos de formulário (`form_start`, `generate_lead`, `lead_confirmed`). |
| `form_name` | `form-lead-material-aula` | Idem. |
| `element_id` | `hero-cta-principal` | O `data-track-id` do elemento clicado/focado. |
| `element_label` | `Botão principal do topo: leva ao formulário de inscrição` | O `data-track-label`. |
| `element_location` | `hero` | O `data-track-location`. |

### 2.3 consent — padrão negado

| Chave | Valor padrão (antes do banner) |
|---|---|
| `consent_source` | `padrao_negado` (vira `banner` ou a origem informada depois da escolha) |
| `ad_storage` | `denied` |
| `analytics_storage` | `denied` |
| `ad_user_data` | `denied` |
| `ad_personalization` | `denied` |

O modelo não traz banner. O seu banner/CMP chama `window.trackingAtualizarConsentimento({...}, 'banner')`
e os próximos pushes levam o novo estado. Configure também o Consent Mode do GTM (padrão negado +
atualização) a partir do mesmo banner.

## 3. Eventos

| Evento | Quando dispara | Página | event_data extra | Uso sugerido no GTM |
|---|---|---|---|---|
| `page_data` | Assim que a página começa a carregar (antes do GTM) | todas | — | Disponibiliza os dados. O GTM dispara o `page_view` dele (acionador "Inicialização"/"Visualização de página"). |
| `cta_click` | Clique em qualquer `<a>` ou `<button>` com `data-track-id` | todas | `element_id`, `element_label`, `element_location` | Acionador de evento personalizado `cta_click`, filtrando por `event_data.element_id`. |
| `form_start` | Primeiro foco em um campo do formulário (uma vez por página) | home | `form_id`, `form_name`, elemento focado | GA4 `form_start`. |
| `generate_lead` | Envio **válido** do formulário | home | `form_id`, `form_name`, botão de envio | GA4 `generate_lead` (evento recomendado). Push com `eventCallback` + `eventTimeout: 1000`. |
| `lead_confirmed` | Carregamento de `obrigado.html` vindo de um envio real | obrigado | mesmo `event_id` do `generate_lead`, `form_id`, `form_name` | Conversão comprovada: Meta `Lead` (CAPI + Pixel com o mesmo `event_id`), Google Ads. |

O clique no botão de envio gera primeiro um `cta_click` (o clique) e, se o formulário for válido,
um `generate_lead`. Envio inválido não gera `generate_lead`: aparecem mensagens de erro em cada campo.

### 3.1 Fluxo do formulário e redirecionamento

1. O visitante envia o formulário. O `tracking.js` valida nome, e-mail, telefone e a caixa de consentimento.
2. Válido: normaliza os dados, faz o push `generate_lead` com `eventCallback` e `eventTimeout: 1000`
   e guarda `event_id` + dados do lead no `sessionStorage`.
3. Redireciona para `obrigado.html` quando o GTM chamar o `eventCallback` ou, no máximo, após ~1,2 s
   (cobre o caso de o GTM não ter carregado: ID ainda `GTM-XXXXXXX` ou bloqueador de anúncios).
4. Em `obrigado.html`: push `page_data`, depois `lead_confirmed` com o **mesmo** `event_id`; em seguida
   os dados pessoais são apagados do `sessionStorage`. O `fbc` é o mesmo da página de entrada (cookie `_fbc`).
5. Abrir ou recarregar `obrigado.html` diretamente **não** gera `lead_confirmed` (não há lead na
   sessão), então não existe conversão inventada.

**O formulário do modelo não tem backend.** Se o seu tiver, envie os dados ao seu servidor primeiro e
só então faça o push `generate_lead` e o redirecionamento.

## 4. Endereço IP (por que fica `null`)

O JavaScript do navegador **não consegue ler o IP do visitante**, e este site não usa serviços externos
de "descubra seu IP" (seria mais um terceiro recebendo dados do visitante). Por isso `ip_address` é
sempre `null` no dataLayer.

O IP é preenchido **no servidor**: quando o GTM web envia o hit para o contêiner de servidor, o servidor
lê o IP da própria requisição (cabeçalho `X-Forwarded-For` / IP remoto). A tag da API de Conversões da
Meta no contêiner de servidor envia `client_ip_address` e `client_user_agent` a partir dessa requisição;
o cliente GA4 do servidor faz o mesmo para o Google.

## 5. Convenção de identificadores dos elementos

Todo elemento interativo ou relevante para conversão tem:

| Atributo | Regra | Exemplo |
|---|---|---|
| `id` | kebab-case, único na página, formato `<local>-<tipo>-<nome>` | `hero-cta-principal` |
| `data-track-id` | igual ao `id` | `hero-cta-principal` |
| `data-track-label` | português simples dizendo para que serve | `Botão principal do topo: leva ao formulário de inscrição` |
| `data-track-location` | `nav`, `hero`, `beneficios`, `form`, `footer` ou `obrigado` | `hero` |
| `aria-label` | quando o texto visível não basta (logo, formulário) | `Seu Site, voltar ao início` |

Tipos usados no nome: `link` (link de menu/rodapé), `cta` (chamada para ação), `campo` (campo de
formulário), `botao` (botão), e nomes próprios para a página de obrigado (`titulo`, `mensagem`).

No GTM, use a variável de camada de dados `event_data.element_id` (ou as variáveis integradas
Click ID / Click Element) para criar acionadores por elemento.

## 6. Lista de elementos (exemplo — troque pelos elementos do seu site)

### index.html

| data-track-id | Elemento | Local | Para que serve |
|---|---|---|---|
| `nav-logo` | link | nav | Logo no menu: volta ao topo da página |
| `nav-link-beneficios` | link | nav | Menu: ir para a seção de benefícios |
| `nav-link-como-funciona` | link | nav | Menu: ir para a seção como funciona |
| `nav-cta-inscricao` | link (botão) | nav | Botão do menu: ir para o formulário de inscrição |
| `hero-cta-principal` | link (botão) | hero | Botão principal do topo: leva ao formulário de inscrição |
| `hero-cta-secundario` | link (botão) | hero | Botão secundário do topo: ver os benefícios |
| `beneficio-cta-eventos` | link | beneficios | Cartão Eventos sem perda: ir para o formulário |
| `beneficio-cta-identificadores` | link | beneficios | Cartão Identificadores completos: ir para o formulário |
| `beneficio-cta-conversao` | link | beneficios | Cartão Conversão comprovada: ir para o formulário |
| `form-lead` | formulário | form | Formulário de inscrição para receber o material da aula |
| `form-campo-nome` | campo | form | Campo do formulário: nome completo |
| `form-campo-email` | campo | form | Campo do formulário: e-mail |
| `form-campo-telefone` | campo | form | Campo do formulário: telefone com código do país |
| `form-campo-consentimento` | caixa de seleção | form | Caixa do formulário: autoriza ser contatado |
| `form-botao-enviar` | botão | form | Botão de envio do formulário: gera o lead |
| `footer-link-formulario` | link | footer | Rodapé: ir para o formulário |
| `footer-link-privacidade` | link | footer | Rodapé: ver o aviso de privacidade |
| `footer-link-topo` | link | footer | Rodapé: voltar ao topo |

### obrigado.html

| data-track-id | Elemento | Local | Para que serve |
|---|---|---|---|
| `nav-logo` | link | nav | Logo no menu: volta para a página inicial |
| `obrigado-titulo` | título | obrigado | Título da página de obrigado: prova de que o formulário foi enviado |
| `obrigado-mensagem` | texto | obrigado | Mensagem de confirmação do envio |
| `obrigado-event-id` | código | obrigado | Mostra o event_id do lead, o mesmo do generate_lead |
| `obrigado-link-voltar` | link (botão) | obrigado | Botão da página de obrigado: voltar para a página inicial |
| `obrigado-cta-como-funciona` | link (botão) | obrigado | Botão da página de obrigado: rever como funciona a medição |
| `footer-link-privacidade` | link | footer | Rodapé: ver o aviso de privacidade |

## 7. Armazenamento usado pelo site

| Nome | Tipo | Duração | Conteúdo |
|---|---|---|---|
| `trk_external_id` | cookie + localStorage | 400 dias | ID aleatório do visitante |
| `_fbc` | cookie (domínio registrável, `path=/`, `SameSite=Lax`) | 90 dias a partir da criação do clique | Gravado só quando chega um `fbclid` novo ou o cookie falta; ver `fbc.md` |
| `trk_fbc` | sessionStorage + localStorage | reserva; ignorada depois de 90 dias da criação | Cópia do `_fbc`, usada só se o cookie não existir |
| `trk_atribuicao` | localStorage | até novo clique com UTM/click id | gclid, gbraid, wbraid e UTMs do último toque |
| `trk_lead_enviado` | sessionStorage | apagado no push do `lead_confirmed` | event_id, form_id/form_name e dados do lead |
