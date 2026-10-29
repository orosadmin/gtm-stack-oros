import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const PASTA = process.argv[2] || 'gtm/templates';
const ACIONADORES_NATIVOS = new Set(['2147479553', '2147479572', '2147479573']);
const VARIAVEIS_INTERNAS = new Set(['_event']);
const MARCADOR_PERMITIDO = /^(|PREENCHER_[A-Z0-9_]+|G-XXXXXXXXXX|https:\/\/sgtm\.seudominio\.com)$/;

function referencias(objeto, achadas = []) {
  if (Array.isArray(objeto)) objeto.forEach((item) => referencias(item, achadas));
  else if (objeto && typeof objeto === 'object') Object.values(objeto).forEach((valor) => referencias(valor, achadas));
  else if (typeof objeto === 'string') for (const m of objeto.matchAll(/\{\{([^{}]+)\}\}/g)) achadas.push(m[1]);
  return achadas;
}

function validar(arquivo) {
  const erros = [];
  let exportacao;
  try {
    exportacao = JSON.parse(readFileSync(arquivo, 'utf8'));
  } catch (e) {
    return { erros: [`JSON inválido: ${e.message}`], resumo: '' };
  }
  const versao = exportacao.containerVersion;
  if (exportacao.exportFormatVersion !== 2) erros.push('exportFormatVersion diferente de 2');
  if (!versao || !versao.container) return { erros: [...erros, 'sem containerVersion.container'], resumo: '' };

  const tags = versao.tag || [];
  const acionadores = versao.trigger || [];
  const variaveis = versao.variable || [];
  const clientes = versao.client || [];
  const nativas = (versao.builtInVariable || []).map((v) => v.name);
  const modelos = versao.customTemplate || [];

  for (const [lista, campo, rotulo] of [[tags, 'tagId', 'tag'], [acionadores, 'triggerId', 'acionador'], [variaveis, 'variableId', 'variável'], [clientes, 'clientId', 'cliente']]) {
    const ids = lista.map((o) => o[campo]);
    if (new Set(ids).size !== ids.length) erros.push(`${rotulo}: ids repetidos`);
    const nomes = lista.map((o) => o.name);
    if (new Set(nomes).size !== nomes.length) erros.push(`${rotulo}: nomes repetidos`);
  }

  const idsAcionadores = new Set(acionadores.map((t) => t.triggerId));
  for (const tag of tags) {
    for (const id of [...(tag.firingTriggerId || []), ...(tag.blockingTriggerId || [])]) {
      if (!idsAcionadores.has(id) && !ACIONADORES_NATIVOS.has(id)) erros.push(`tag "${tag.name}": acionador ${id} não existe`);
    }
    if (!tag.firingTriggerId?.length) erros.push(`tag "${tag.name}": sem acionador de disparo`);
  }

  const nomesValidos = new Set([...variaveis.map((v) => v.name), ...nativas, ...VARIAVEIS_INTERNAS]);
  for (const [rotulo, lista] of [['tag', tags], ['acionador', acionadores], ['variável', variaveis], ['cliente', clientes]]) {
    for (const objeto of lista) {
      for (const nome of referencias(objeto)) {
        if (!nomesValidos.has(nome)) erros.push(`${rotulo} "${objeto.name}": {{${nome}}} não existe`);
      }
    }
  }
  for (const nome of referencias(versao.gtagConfig || [])) {
    if (!nomesValidos.has(nome)) erros.push(`gtagConfig: {{${nome}}} não existe`);
  }

  const tiposPersonalizados = new Set([...tags, ...variaveis, ...clientes].map((o) => o.type).filter((t) => t.startsWith('cvt_')));
  if (tiposPersonalizados.size > modelos.length) erros.push('há tags de modelo personalizado sem o modelo (customTemplate) na exportação');

  for (const variavel of variaveis.filter((v) => v.type === 'c')) {
    const valor = (variavel.parameter || []).find((p) => p.key === 'value')?.value ?? '';
    if (!MARCADOR_PERMITIDO.test(valor)) erros.push(`constante "${variavel.name}": valor não é um marcador (PREENCHER_*, G-XXXXXXXXXX, https://sgtm.seudominio.com ou vazio)`);
  }

  const ids = new Set();
  JSON.stringify(versao, (chave, valor) => {
    if (chave === 'accountId' || chave === 'containerId') ids.add(valor);
    return valor;
  });
  if ([...ids].some((id) => id !== '0')) erros.push('accountId/containerId de uma conta real (devem ser "0")');
  if (versao.container.publicId !== 'GTM-XXXXXXX') erros.push('container.publicId deve ser GTM-XXXXXXX');
  for (const id of versao.container.tagIds || []) if (id !== 'GTM-XXXXXXX') erros.push('container.tagIds deve ter só GTM-XXXXXXX');

  const resumo = `${versao.container.usageContext.join(',')}: ${tags.length} tags, ${acionadores.length} acionadores, ${variaveis.length} variáveis, ${clientes.length} clientes, ${modelos.length} modelos`;
  return { erros, resumo };
}

const arquivos = readdirSync(PASTA).filter((f) => f.endsWith('.json')).sort();
if (!arquivos.length) {
  console.error(`nenhum .json em ${PASTA}`);
  process.exit(1);
}
let falhas = 0;
for (const nome of arquivos) {
  const { erros, resumo } = validar(join(PASTA, nome));
  if (erros.length) {
    falhas += erros.length;
    console.log(`FALHOU ${nome}`);
    for (const erro of erros) console.log(`       ${erro}`);
  } else {
    console.log(`ok     ${nome} (${resumo})`);
  }
}
process.exit(falhas ? 1 : 0);
