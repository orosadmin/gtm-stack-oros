# Publicar o repositório e ligar as proteções

Guia para quem administra `orosadmin/gtm-stack-oros`. Faça **depois** de juntar o pull request que
preparou o repositório e **na ordem abaixo**: no plano gratuito de conta pessoal, rulesets e
varredura de segredos só existem em repositório **público**.

Pré-requisito: `gh` autenticado como `orosadmin` (`gh auth status`), com permissão de administrador.

Documentação oficial consultada em 29/10/2026:

- Rulesets ("disponíveis em repositórios públicos com GitHub Free"):
  https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets
- API de rulesets: https://docs.github.com/en/rest/repos/rules
- API de repositório (visibilidade, `security_and_analysis`, alertas do Dependabot, relato privado):
  https://docs.github.com/en/rest/repos/repos
- Varredura de segredos ("em repositórios públicos roda automaticamente, de graça"):
  https://docs.github.com/en/code-security/secret-scanning/introduction/about-secret-scanning
- Proteção de push no repositório (desligada por padrão; ligada pelo administrador):
  https://docs.github.com/en/code-security/secret-scanning/introduction/about-push-protection
- Relato privado de vulnerabilidades (para repositórios públicos):
  https://docs.github.com/en/code-security/security-advisories/working-with-repository-security-advisories/configuring-private-vulnerability-reporting-for-a-repository
- Permissões do GitHub Actions: https://docs.github.com/en/rest/actions/permissions

## 0. Antes de publicar

- O CI `verificacoes` está verde em `master`, inclusive a varredura do histórico.
- Leia a seção "O que ele NÃO faz" do `README.md`: é isso que os alunos vão ver.
- Tudo no histórico do git fica público junto (inclusive nomes e e-mails dos autores dos commits).

## 1. Tornar público

```bash
gh api -X PATCH repos/orosadmin/gtm-stack-oros -f visibility=public
```

## 2. Varredura de segredos e proteção de push

```bash
gh api -X PATCH repos/orosadmin/gtm-stack-oros --input - <<'JSON'
{
  "security_and_analysis": {
    "secret_scanning": { "status": "enabled" },
    "secret_scanning_push_protection": { "status": "enabled" }
  }
}
JSON
```

Se a API recusar a proteção de push, ligue pela tela: **Settings** → **Advanced Security** →
**Secret Protection** → **Push protection** → **Enable**.

## 3. Alertas e atualizações de segurança do Dependabot

```bash
gh api -X PUT repos/orosadmin/gtm-stack-oros/vulnerability-alerts
gh api -X PUT repos/orosadmin/gtm-stack-oros/automated-security-fixes
```

As atualizações das ações do GitHub já vêm do `.github/dependabot.yml`.

## 4. Relato privado de vulnerabilidades

```bash
gh api -X PUT repos/orosadmin/gtm-stack-oros/private-vulnerability-reporting
```

É o canal que o `SECURITY.md` indica (aba **Security** → **Report a vulnerability**).

## 5. GitHub Actions

Permissão padrão do token dos workflows só de leitura, sem aprovar pull requests:

```bash
gh api -X PUT repos/orosadmin/gtm-stack-oros/actions/permissions/workflow \
  -f default_workflow_permissions=read -F can_approve_pull_request_reviews=false
```

Só ações do próprio GitHub, fixadas por SHA (o workflow usa apenas `actions/checkout`; o gitleaks é
baixado com checksum conferido):

```bash
gh api -X PUT repos/orosadmin/gtm-stack-oros/actions/permissions \
  -F enabled=true -f allowed_actions=selected -F sha_pinning_required=true
gh api -X PUT repos/orosadmin/gtm-stack-oros/actions/permissions/selected-actions \
  -F github_owned_allowed=true -F verified_allowed=false
```

Workflows de forks de quem contribui pela primeira vez só rodam depois de aprovados:

```bash
gh api -X PUT repos/orosadmin/gtm-stack-oros/actions/permissions/fork-pr-contributor-approval \
  -f approval_policy=first_time_contributors
```

Para exigir aprovação de **todo** colaborador externo, use `all_external_contributors`.

## 6. Ruleset do `master`

Bloqueia apagar o branch e force-push, exige pull request com 1 aprovação e revisão do dono do
código (`.github/CODEOWNERS`) e exige o CI `verificar` (job do workflow `verificacoes`) verde e
atualizado. O histórico linear é opcional (aceita só squash ou rebase).

Como o dono do repositório é o único revisor e o GitHub não deixa o autor aprovar o próprio pull
request, o papel de administrador (`RepositoryRole` 5) pode passar por cima das regras **só pelo
pull request** (`bypass_mode: pull_request`): o administrador continua sem poder fazer push direto ou
force-push, mas consegue juntar os próprios pull requests.

```bash
gh api -X POST repos/orosadmin/gtm-stack-oros/rulesets --input - <<'JSON'
{
  "name": "proteger-master",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "bypass_actors": [
    { "actor_type": "RepositoryRole", "actor_id": 5, "bypass_mode": "pull_request" }
  ],
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "required_linear_history" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 1,
        "require_code_owner_review": true,
        "dismiss_stale_reviews_on_push": true,
        "require_last_push_approval": false,
        "required_review_thread_resolution": true,
        "allowed_merge_methods": ["squash", "rebase"]
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": true,
        "required_status_checks": [
          { "context": "verificar", "integration_id": 15368 }
        ]
      }
    }
  ]
}
JSON
```

Sem histórico linear, tire a regra `required_linear_history` e acrescente `"merge"` em
`allowed_merge_methods`. O `integration_id` 15368 é o app do GitHub Actions; se der erro, tire o campo
e deixe só o `context`.

## 7. Conferir

```bash
gh api repos/orosadmin/gtm-stack-oros --jq '{visibility, security_and_analysis}'
gh api repos/orosadmin/gtm-stack-oros/rulesets
gh api repos/orosadmin/gtm-stack-oros/actions/permissions/workflow
gh api repos/orosadmin/gtm-stack-oros/private-vulnerability-reporting
```

Depois abra um pull request de teste e confira que ele pede aprovação e o CI `verificar`.
