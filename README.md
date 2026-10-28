# GTM Server-Side com Docker + Cloudflare Tunnel

Stack mínima para rodar o **Google Tag Manager Server-Side** na sua própria máquina/VM, com HTTPS público via **Cloudflare Tunnel**, e enviar dados para **Google Analytics 4** e **Meta (Facebook)**.

Ao final você terá:

| Serviço | Função | URL pública (exemplo) |
|---|---|---|
| `gtm` | Servidor de tagging (produção) | `https://sgtm.seudominio.com` |
| `gtm-preview` | Servidor de preview/debug do GTM | `https://sgtmp.seudominio.com` |
| `cloudflared` | Túnel que expõe os dois acima com HTTPS | — |

```
Site/Browser ──HTTPS──▶ Cloudflare ──túnel──▶ cloudflared ──▶ gtm:8080
                                                           └─▶ gtm-preview:8080
```

Nenhuma porta é aberta no seu roteador/firewall: o túnel faz conexão de **saída**.

---

## Pré-requisitos

- Docker e Docker Compose v2 (`docker compose version`)
- Um **domínio** com DNS gerenciado na Cloudflare (plano gratuito serve)
- Conta no [Google Tag Manager](https://tagmanager.google.com)

---

## Passo 1 — Clonar e criar o `.env`

```bash
git clone <URL-DESTE-REPOSITORIO>
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

1. **GA4:** no site, configure o `server_container_url` (ou `transport_url`) do GA4 apontando para `https://sgtm.seudominio.com`. No container server, crie um **client** GA4 e uma **tag** GA4.
2. **Meta (Conversions API):** no container server, adicione a tag **Facebook Conversion API** com seu Pixel ID e Access Token.
3. Use o **Preview** para ver as requisições chegando e as tags disparando antes de publicar.

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

```bash
docker compose up -d          # subir
docker compose down           # parar e remover
docker compose logs -f gtm    # logs de um serviço
docker compose pull && docker compose up -d   # atualizar imagens
```

---

## Segurança

- **Nunca** publique o `.env`, o `CLOUDFLARE_TOKEN` ou o `GTM_CONTAINER_CONFIG`. Se vazar, gere um novo no painel correspondente.
- Este repositório contém apenas o `.env.example`, com valores fictícios.
