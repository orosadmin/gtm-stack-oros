# GTM Server-Side com Docker + Cloudflare Tunnel

Material aberto da Oros para alunos e clientes: uma stack mínima para rodar o **Google Tag Manager
Server-Side** na sua própria máquina/VM, com HTTPS público via **Cloudflare Tunnel**, os
**contêineres do GTM** (web e server) prontos para importar e uma **skill de rastreamento** para
agentes de IA, para enviar dados ao **Google Analytics 4** e à **Meta** (Pixel + API de Conversões).

## Para quem é

Para quem acompanhou a live de GTM Server da Oros (ou já conhece o básico de GTM) e quer montar o
rastreamento de um site de captura de leads com GTM Server próprio, sem pagar hospedagem gerenciada.
Você precisa saber usar o terminal, o Docker e o painel do GTM.

## O que este repositório faz

- Sobe o servidor de tagging do GTM e o servidor de preview em Docker, expostos com HTTPS pela
  Cloudflare, sem abrir portas (passos 1 a 5).
- Traz os contêineres **web** e **server** do GTM, sem segredos, para importar e preencher
  ([`gtm/README.md`](gtm/README.md)): GA4 pelo servidor, Pixel da Meta no navegador e API de
  Conversões no servidor, com deduplicação por `event_id`, `fbp` e `fbc`.
- Traz a skill `gtm-tracking`: o `tracking.js` que monta o dataLayer (eventos `page_data`,
  `cta_click`, `form_start`, `generate_lead`, `lead_confirmed`) e captura o `fbc` da Meta do jeito
  certo, com plano de rastreamento, referência de parâmetros e teste automático.

## O que ele NÃO faz (limitações)

- **Não liga o consentimento (LGPD):** o dataLayer leva o estado de consentimento, mas nenhuma tag o
  lê ainda. Banner/CMP, Consent Mode v2 e consentimento do Pixel ficam por sua conta.
- **Não é hospedagem gerenciada:** você cuida da máquina, das atualizações, do monitoramento e da
  disponibilidade. Não há escala automática nem alta disponibilidade: é um contêiner de produção e um
  de preview numa máquina só.
- **Não cobre e-commerce** (`purchase`, carrinho), Google Ads, TikTok, LinkedIn ou outras plataformas.
- **Não manda e-mail e telefone ao servidor** no modelo atual (só o Pixel manda); o passo a passo está
  em [`gtm/README.md`](gtm/README.md).
- **Imagens Docker sem versão fixa:** o compose usa `gtm-cloud-image:stable` e
  `cloudflared:latest`. Um `docker compose pull` pode trazer uma versão nova sem aviso.
- Lista completa de pendências e cuidados dos contêineres: [`gtm/README.md`](gtm/README.md), seção 3.

Configuração suportada: Linux, macOS ou Windows com Docker Compose v2, domínio com DNS na Cloudflare,
contêiner web do GTM, GA4 e um Pixel da Meta.

## Início rápido

1. Suba a stack (passos 1 a 5 abaixo) e confirme `https://sgtm.seudominio.com/healthy`.
2. Importe e preencha os contêineres: [`gtm/README.md`](gtm/README.md).
3. Instale o `tracking.js` e o snippet do GTM no site:
   [`skills/gtm-tracking/SKILL.md`](skills/gtm-tracking/SKILL.md), seção 4.
4. Teste no Preview e no Gerenciador de Eventos da Meta: [`gtm/README.md`](gtm/README.md), seção 4.

## Mapa do repositório

| Caminho | O que é |
|---|---|
| `docker-compose.yml`, `.env.example` | Stack do GTM Server (produção + preview) e túnel da Cloudflare |
| `gtm/templates/web.json`, `gtm/templates/server.json` | Contêineres do GTM para importar (sem segredos) |
| `gtm/README.md` | O que os contêineres fazem, como importar, o que preencher, limitações e plano de teste |
| `skills/gtm-tracking/` | Skill para agentes de IA: `tracking.js`, snippet do GTM, plano de rastreamento, regras do `fbc` e teste |
| `scripts/` | Verificações usadas no CI: modelos do GTM, comentários no código, segredos; e a limpeza de exportações do GTM |
| `.github/` | CI (`verificacoes.yml`), Dependabot, dono do código e modelos de PR/issue |
| `docs/PUBLICAR.md` | Configurações do GitHub para quem mantém o repositório |
| `SECURITY.md`, `CONTRIBUTING.md`, `LICENSE` | Segurança, como contribuir e licença |

---

## Pré-requisitos

- Docker e Docker Compose v2 (`docker compose version`)
- Um **domínio** com DNS gerenciado na Cloudflare (plano gratuito serve)
- Conta no [Google Tag Manager](https://tagmanager.google.com)

---

## Passo 1 — Clonar e criar o `.env`

```bash
git clone https://github.com/orosadmin/gtm-stack-oros.git
cd gtm-stack-oros
cp .env.example .env
```

Você vai preencher o `.env` nos próximos passos. **Nunca faça commit dele**: já está no `.gitignore`.

| Variável | O que é |
|---|---|
| `GTM_CONTAINER_CONFIG` | Config do container server-side (Passo 2) |
| `GTM_DOMAIN` | Domínio de produção, **sem** `https://` (ex.: `sgtm.seudominio.com`) |
| `GTM_PREVIEW_DOMAIN` | Domínio do preview, **sem** `https://` (ex.: `sgtmp.seudominio.com`) |
| `CLOUDFLARE_TOKEN` | Token do túnel (Passo 3) |

Preencha agora `GTM_DOMAIN` e `GTM_PREVIEW_DOMAIN` com os subdomínios que você quer usar.

---

## Passo 2 — Criar o container server-side no GTM

1. No GTM, crie um container novo do tipo **Server**.
2. Escolha **Manually provision tagging server**.
3. Copie o valor do campo **Container Config** (uma string longa em base64).
4. Cole em `GTM_CONTAINER_CONFIG` no `.env`.
5. Em **Admin → Container Settings → Server container URL**, informe `https://` + seu `GTM_DOMAIN`.

---

## Passo 3 — Criar o túnel na Cloudflare

1. Acesse **Cloudflare Zero Trust → Networks → Tunnels → Create a tunnel**.
2. Tipo: **Cloudflared**. Dê um nome (ex.: `gtm-live`).
3. Na tela de instalação, copie **apenas o token** (a string longa depois de `--token`).
4. Cole em `CLOUDFLARE_TOKEN` no `.env`.
5. Na aba **Public Hostnames**, adicione **dois** hostnames:

| Hostname | Service |
|---|---|
| `sgtm.seudominio.com` | `HTTP` → `gtm:8080` |
| `sgtmp.seudominio.com` | `HTTP` → `gtm-preview:8080` |

> ⚠️ Use **HTTP** (não HTTPS) e os **nomes dos serviços** do compose (`gtm`, `gtm-preview`), não `localhost`. O HTTPS é terminado pela Cloudflare.

A Cloudflare cria os registros DNS (CNAME) automaticamente. Se já existir um registro com o mesmo nome, ele **não é sobrescrito**: apague-o ou ajuste manualmente em **DNS → Records**.

---

## Passo 4 — Subir a stack

```bash
docker compose up -d
docker compose ps
docker compose logs -f
```

Os três containers (`gtm`, `gtm-preview`, `cloudflared`) devem estar `running`. No log do `cloudflared`, procure por `Registered tunnel connection`.

---

## Passo 5 — Validar

```bash
curl -i https://sgtm.seudominio.com/healthy
curl -i https://sgtmp.seudominio.com/healthy
```

Os dois devem responder `HTTP/2 200` com o corpo `ok`.

Se funcionar, abra o GTM server-side e clique em **Preview**: a janela do Tag Assistant deve conectar usando o domínio de preview.

---

## Passo 6 — Enviar dados (GA4 e Meta)

Importe os contêineres prontos de [`gtm/templates/`](gtm/templates) e preencha os marcadores
(ID do GA4, Pixel, token da Meta, URL do servidor) **dentro do GTM**, seguindo
[`gtm/README.md`](gtm/README.md). Lá estão a ordem de importação (servidor primeiro, depois web), a
diferença entre **Substituir** e **Mesclar**, a tabela do que preencher e o plano de teste.

O GA4 e o Pixel são carregados **só pelo GTM**: não coloque `gtag.js` nem `fbq` no site. O **Test
Event Code** da Meta deve ficar vazio fora do teste.

O desenho completo (constantes, tabelas de consulta, Pixel no navegador deduplicado com a CAPI) está
em [`skills/gtm-tracking/SKILL.md`](skills/gtm-tracking/SKILL.md), seção 3, com as fontes oficiais em
[`skills/gtm-tracking/references/fontes.md`](skills/gtm-tracking/references/fontes.md).

---

## Skill de rastreamento para agentes (`skills/gtm-tracking`)

Este repositório traz uma skill que ensina um agente de IA (Claude Code e similares) a implementar o
rastreamento da live no **seu** site:

- dataLayer padrão (`user_data`, `event_data`, `consent`) com os eventos `page_data`, `cta_click`,
  `form_start`, `generate_lead` e `lead_confirmed` (com `event_id` para deduplicação);
- convenção de ids dos elementos (`data-track-id`, `data-track-label`, `data-track-location`);
- consentimento negado por padrão até o banner atualizar (o Consent Mode v2 e o consentimento do
  Pixel ainda não estão ligados nos contêineres: é o próximo passo);
- ligação GTM web → GTM Server (esta stack) → GA4 e Meta CAPI, com uma tag por provedor, Pixel com
  nomes padrão da Meta e deduplicação por `event_id`;
- captura correta do **`fbc` da Meta** (`fbclid` da URL ou cookie `_fbc`, sem refazer a data do clique).

Os modelos ficam em `skills/gtm-tracking/references/` (`tracking.js`, snippet do GTM, exemplo de
dataLayer, plano de rastreamento, regras do fbc, referência de parâmetros GA4 × Meta e um teste:
`node skills/gtm-tracking/references/fbc-teste.mjs`).

As regras sobre GA4, Pixel e API de Conversões seguem a documentação oficial do Google e da Meta e
o código dos modelos oficiais do GTM. A lista de fontes, com o que não pôde ser confirmado, está em
[`skills/gtm-tracking/references/fontes.md`](skills/gtm-tracking/references/fontes.md).

**Usar no Claude Code:** copie ou crie um link da pasta para `.claude/skills/` do projeto do seu site:

Dentro do projeto do seu site, copie a pasta:

```bash
mkdir -p .claude/skills
cp -r /caminho/para/gtm-stack-oros/skills/gtm-tracking .claude/skills/
```

Ou crie um link, para receber atualizações com `git pull`:

```bash
mkdir -p .claude/skills
ln -s /caminho/para/gtm-stack-oros/skills/gtm-tracking .claude/skills/gtm-tracking
```

Depois peça, por exemplo: *"use a skill gtm-tracking para instalar o rastreamento neste site"*.
Outros agentes: aponte para `skills/gtm-tracking/SKILL.md` como instrução.

---

## Problemas comuns

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| `Could not resolve host` só na sua máquina, mas outros acessam | Cache negativo de DNS do roteador/provedor | Troque o DNS do computador para `1.1.1.1`/`8.8.8.8` e limpe o cache (`ipconfig /flushdns`, `resolvectl flush-caches`). Confirme com `dig +short seu.dominio @1.1.1.1` |
| Erro 502 / 1033 da Cloudflare | Túnel sem conexão ou destino errado | `docker compose logs cloudflared`; confira que o destino é `http://gtm:8080` |
| 404 em `/healthy` | Hostname sem rota no túnel | Revise os Public Hostnames (Passo 3) |
| DNS não existe para o subdomínio | Registro CNAME não foi criado | Crie manualmente um CNAME para `<tunnel-id>.cfargotunnel.com` com proxy ligado |
| Preview não abre | `GTM_PREVIEW_DOMAIN` com `https://` ou sem rota | Use só o domínio, sem esquema, e confira a rota do `gtm-preview` |
| Container reiniciando | `GTM_CONTAINER_CONFIG` inválido | Copie de novo do GTM, sem aspas nem espaços extras |

---

## Comandos úteis

| Comando | O que faz |
|---|---|
| `docker compose up -d` | Sobe a stack |
| `docker compose down` | Para e remove os contêineres |
| `docker compose logs -f gtm` | Mostra os logs de um serviço |
| `docker compose pull && docker compose up -d` | Atualiza as imagens |
| `node scripts/gtm-validar.mjs` | Valida os modelos do GTM |
| `node scripts/verificar-segredos.mjs` | Procura segredos e dados pessoais nos arquivos (`--historico` para todo o histórico do git) |
| `node scripts/verificar-comentarios.mjs` | Confere que não há comentários no código |
| `node skills/gtm-tracking/references/fbc-teste.mjs` | Testa as regras do `fbc` |

Os scripts precisam só do Node.js 20 ou mais novo, sem instalar pacotes.

---

## Segurança

- **Nunca** publique o `.env`, o `CLOUDFLARE_TOKEN`, o `GTM_CONTAINER_CONFIG` ou o token da Meta. Se
  vazar, gere um novo no painel correspondente.
- Este repositório contém apenas o `.env.example` e os modelos do GTM, com valores fictícios.
- Achou uma vulnerabilidade ou um segredo exposto? Veja o [`SECURITY.md`](SECURITY.md): relato
  privado, nunca em issue pública.

## Como obter ajuda

- Dúvidas e problemas: abra uma issue em
  [github.com/orosadmin/gtm-stack-oros/issues](https://github.com/orosadmin/gtm-stack-oros/issues)
  (sem colar tokens, `.env` ou IDs reais).
- Alunos: usem também os canais da comunidade da Oros.
- Quer melhorar algo? Leia o [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Licença

[MIT](LICENSE) © 2026 Oros. Você pode usar, copiar, modificar, distribuir e até vender o que fizer
com este código, em projetos pessoais ou comerciais, desde que mantenha o aviso de copyright e a
licença. O software é fornecido "como está", sem garantia.

Os modelos oficiais da Galeria do GTM embutidos em `gtm/templates/` ("Meta Pixel" e "Conversions
API Tag") são da Meta, publicados sob a licença Apache-2.0 nos repositórios
[facebook/GoogleTagManager-WebTemplate-For-FacebookPixel](https://github.com/facebook/GoogleTagManager-WebTemplate-For-FacebookPixel)
e
[facebookincubator/ConversionsAPI-Tag-for-GoogleTagManager](https://github.com/facebookincubator/ConversionsAPI-Tag-for-GoogleTagManager),
e seguem os termos da Galeria de modelos do GTM.
