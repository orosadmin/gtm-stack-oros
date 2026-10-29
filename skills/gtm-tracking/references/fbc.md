# fbc (clique em anúncio da Meta) — regras e implementação

O `fbc` diz à Meta **qual clique em anúncio** trouxe o visitante. É o que permite atribuir um lead
enviado pela API de Conversões (CAPI) ao anúncio certo. Se ele for montado errado (data refeita,
fbclid alterado, valor inventado), a Meta atribui errado ou descarta.

Implementação pronta: funções `capturarFbc()` e `obterFbc()` em `tracking.js`.
Prova automática: `node fbc-teste.mjs` nesta pasta. Regras oficiais da Meta: [M-FBC] e [M-PB];
comportamento da tag oficial do servidor: [T-CAPI] (links em [`fontes.md`](fontes.md)).

## 1. Formato

```
fb.<subdomainIndex>.<creationTime>.<fbclid>
fb.1.1790000000000.IwAR0Ab-Cd_Ef
```

| Parte | O que é |
|---|---|
| `fb` | prefixo fixo |
| `subdomainIndex` | nível do domínio onde o cookie `_fbc` fica (ver seção 4) |
| `creationTime` | **momento do clique** em milissegundos (Unix ms): quando o `fbclid` apareceu no site pela primeira vez |
| `fbclid` | o valor do parâmetro `fbclid` da URL, **exatamente** como chegou |

## 2. De onde vem o valor (prioridade)

1. **`fbclid` na URL atual.** O visitante clicou num anúncio da Meta e caiu nesta página com
   `?fbclid=...`. É o clique que atribui ao anúncio.
2. **Senão, o cookie `_fbc` que já existe** (first-party, do seu domínio). Ele é reaproveitado
   **como está gravado**, com a data de criação de dentro dele intacta. Nunca refaça o timestamp.
3. **Senão, nada:** `fbc` vai `null`. Nunca invente um valor (por exemplo, a partir de UTM, do
   `_fbp` ou de um fbclid de outra origem).

## 3. Quando a URL tem `fbclid`

| Situação | O que fazer |
|---|---|
| Já existe `_fbc` com o **mesmo** fbclid (recarregou a página, voltou pelo histórico, o Pixel já gravou) | Mantém o cookie como está. A data de criação original continua valendo. Não regrava. |
| Existe `_fbc` com **outro** fbclid | Clique novo: monta `fb.<índice>.<agora em ms>.<fbclid>` e grava o `_fbc`, substituindo. |
| Não existe `_fbc` | Monta `fb.<índice>.<agora em ms>.<fbclid>` e grava o `_fbc`. |

Detalhes que não podem mudar:

- **"Agora" é o momento em que o fbclid foi visto pela primeira vez no site.** Se o mesmo fbclid
  voltar (ex.: recarregar a URL de entrada), vale a data do cookie (ou da reserva, se o cookie foi
  bloqueado), nunca `Date.now()` de novo. Este era o erro da versão da live: ela carimbava
  `Date.now()` toda vez que montava o valor.
- **O fbclid é usado cru.** Não mude maiúsculas/minúsculas, não corte (`trim`), não decodifique
  (`decodeURIComponent`/`URLSearchParams` transformam `%2B` e `+`) nem codifique de novo
  (`encodeURIComponent` ao gravar o cookie). O modelo lê o parâmetro direto de `location.search`.
  Um fbclid que não cabe num cookie sem alteração (espaço, `;`, `,`, `"`, `\`) é ignorado.
- **"Mesmo clique"** = a parte depois do 3º ponto do cookie é igual ao fbclid (o modelo também aceita
  o fbclid seguido de `.algo`, caso a Meta anexe um sufixo).
- **Cookie `_fbc`:** 90 dias, `path=/`, `SameSite=Lax`, no **domínio registrável**
  (`domain=seusite.com.br`, para valer em `www.` e na raiz). O valor vai cru, sem `encodeURIComponent`.
  O modelo conta os 90 dias a partir da criação do clique.
- A Meta recomenda gravar o `_fbc` como **cookie HTTP** (cabeçalho da resposta) com 90 dias [M-FBC].
  O `tracking.js` grava pelo `document.cookie`: o formato é o mesmo, mas alguns navegadores encurtam
  a vida de cookies gravados por script. A opção "Extend cookies" da tag oficial do servidor regrava
  o `_fbc`/`_fbp` como cookie HTTP de 90 dias (ver seção 7).

## 4. subdomainIndex

Pela definição da Meta, é o nível do domínio em que o cookie foi gravado:

| Índice | Domínio do cookie | Exemplo |
|---|---|---|
| 0 | só o TLD | `com` |
| 1 | domínio registrável | `exemplo.com`, `seusite.com.br` |
| 2 | um subdomínio | `www.exemplo.com` |

Como o modelo descobre: a função `dominioRegistravel()` tenta gravar um cookie de teste do sufixo
mais curto para o mais longo (`com.br` → `seusite.com.br` → ...). O navegador recusa sufixos
públicos, então o primeiro aceito é o domínio registrável. Como o `_fbc` é gravado nesse domínio, o
índice é **1** (constante `FBC_SUBDOMAIN_INDEX`). Em `localhost`, IP ou arquivo aberto do disco não há
domínio registrável: o cookie fica só no host e o índice continua 1, que é o valor que a Meta indica
quando não se sabe o nível. Se você mudar o modelo para gravar no host (`www.`), use 2.

Ao **ler** um `_fbc` existente, o índice que estiver nele é mantido: o valor é repassado inteiro.

**Domínios como `.com.br`:** a tag oficial do servidor calcula o índice contando as partes do domínio
registrável menos 1, então para `seusite.com.br` ela usa **2**, enquanto este modelo usa 1 [T-CAPI].
A definição da Meta [M-FBC] não trata sufixos com duas partes; qual dos dois a Meta considera certo,
e se ela valida o índice, é **NÃO VERIFICADO**.

## 5. Não brigar com o Pixel da Meta

Se o site também carrega o Pixel (pelo GTM web), ele grava o `_fbc` sozinho. Por isso o modelo:

1. **lê primeiro** (cookie `_fbc`);
2. **só grava** quando o cookie não existe ou quando chega um fbclid **novo**;
3. com o mesmo fbclid, deixa o cookie do Pixel intacto (mesma data de criação);
4. lê o cookie de novo antes de **cada** push, então se o Pixel gravar depois, o próximo evento já
   leva o valor dele.

O `tracking.js` roda antes do GTM, então na página de entrada ele grava primeiro; o Pixel encontra o
cookie com o mesmo fbclid e o mantém.

## 6. Persistência até a página de obrigado

O `fbclid` só existe na URL de entrada. Navegação interna e o redirecionamento para a página de
obrigado não o carregam. Por isso:

- `capturarFbc()` roda **uma vez no carregamento de cada página**, antes do primeiro push
  (`page_data`). Na página de entrada ele grava o `_fbc`.
- Nas páginas seguintes o valor vem do cookie `_fbc`.
- **Reserva:** uma cópia em `sessionStorage` e `localStorage` (`trk_fbc`), usada **só** quando o
  cookie não existe (cookies bloqueados, por exemplo). A reserva é ignorada depois de 90 dias da
  criação, como o cookie.
- O `lead_confirmed` da página de obrigado leva o **mesmo** `fbc` do `page_data` da página de entrada.

## 7. O que o servidor faz (tag oficial da API de Conversões da Meta)

A tag oficial do GTM Server não tem campos para o `fbc`: ela escolhe o valor sozinha, nesta ordem
(função `getFbcValue` do modelo) [T-CAPI]:

1. o parâmetro de evento `x-fb-ck-fbc` (o modelo `gtm/templates/web.json` manda `{{user_fbc}}` na tag
   `ga4_event`); senão o cookie `_fbc` que chegou na requisição;
2. **porém, se a `page_location` do evento tiver `fbclid`, a tag ignora o passo 1** e monta
   `fb.<índice>.<agora no servidor, em ms>.<fbclid decodificado>`, com o índice calculado como na
   seção 4 (2 em `.com.br`);
3. com **"Extend cookies"** ligado, depois de uma resposta 2xx da Meta a tag regrava `_fbc` e `_fbp`
   como cookies HTTP (domínio automático, 90 dias, `Secure`, `SameSite=Lax`), inclusive o valor
   refeito no passo 2.

Garantido com este modelo + a tag oficial:

- O `fbc` só existe se houve `fbclid` (na URL ou num `_fbc` anterior). Ninguém inventa um valor.
- Em páginas **sem** `fbclid` na URL (navegação interna, página de obrigado), a Meta recebe o valor
  do `tracking.js`/cookie, com a data de criação original.
- O `fbc` não é hasheado [M-CIP] e o fbclid mantém maiúsculas e minúsculas.
- Se vier `null`/vazio e não houver cookie, a tag não envia `fbc`.

**Não** garantido:

- Nos eventos cuja URL ainda tem `fbclid` (a página de entrada e qualquer recarga dela), o servidor
  envia o fbc **refeito**, com a hora do servidor, e não o valor do navegador. A diferença costuma ser
  de segundos no primeiro hit.
- Com "Extend cookies" ligado, essa recarga também **troca a data de criação do cookie `_fbc`**. A
  regra "mesmo clique = mesma data" (teste 2 do `fbc-teste.mjs`) vale para o `tracking.js`, mas o
  servidor pode regravar o cookie depois. Para manter a data original, desligue "Extend cookies"
  (perde a regravação como cookie HTTP); a recomendação desta skill é aceitar o comportamento
  oficial da Meta.
- A tag oficial decodifica o fbclid da URL; o `tracking.js` usa cru. Para fbclids reais (sem `%`),
  os dois são iguais (**NÃO VERIFICADO** para todos os casos).
- A tag oficial não descarta `fbc` malformado, no futuro ou com mais de 90 dias. Se quiser esse
  filtro, ele tem de ser feito por você (opcional; a Meta não exige).

O IP (`client_ip_address`) e o user agent (`client_user_agent`) vêm dos dados do evento no servidor
(`ip_override` e `user_agent`), não do navegador [T-CAPI][G-CED].

## 8. Teste rápido no navegador (DevTools)

1. Abra o site com `?fbclid=TESTE123` (ex.: `https://www.seusite.com.br/?fbclid=TESTE123`).
2. No console:
   ```js
   document.cookie.split('; ').find(c => c.startsWith('_fbc='))
   // "_fbc=fb.1.1790000000000.TESTE123"
   dataLayer.filter(e => e.user_data).at(-1).user_data.fbc
   // "fb.1.1790000000000.TESTE123"  (o mesmo valor)
   ```
   Em Application → Cookies, confira domínio `.seusite.com.br`, caminho `/`, validade de 90 dias.
3. Recarregue **sem** o parâmetro (e depois com o mesmo `?fbclid=TESTE123`): o número do meio
   (data de criação) **não muda**. Isso testa o `tracking.js`. Com a tag da Meta no servidor e
   "Extend cookies" ligado, a recarga com `fbclid` na URL pode trocar a data pela hora do servidor
   (seção 7): é o comportamento da tag oficial.
4. Abra com `?fbclid=TESTE456`: o valor é **substituído** e a data de criação é nova.
5. Envie o formulário: o `lead_confirmed` na página de obrigado tem o mesmo `fbc`.
6. Apague o cookie `_fbc` e o `trk_fbc` (Application → Storage), abra sem `fbclid`: `fbc` é `null`.

Teste automático (sem navegador, sem rede): `node fbc-teste.mjs` nesta pasta. Ele carrega o
`tracking.js` num navegador simulado e prova os casos acima, inclusive o do Pixel já ter gravado o
cookie e o de cookies bloqueados.
