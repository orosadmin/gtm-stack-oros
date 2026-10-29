import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const MARCADORES = {
  web: {
    meta_pixel: 'PREENCHER_META_PIXEL_ID',
    ga4_tag_id: 'G-XXXXXXXXXX',
    transport_url: 'https://sgtm.seudominio.com',
  },
  server: {
    meta_pixel: 'PREENCHER_META_PIXEL_ID',
    meta_access_token: 'PREENCHER_META_ACCESS_TOKEN',
    meta_test_event_code: '',
  },
};

const NOMES = { web: 'gtm-stack-oros-web', server: 'gtm-stack-oros-server' };
const URL_SERVIDOR = 'https://sgtm.seudominio.com';
const ID_PUBLICO = 'GTM-XXXXXXX';

function zerarCaminho(texto) {
  return texto
    .replace(/accounts\/\d+/g, 'accounts/0')
    .replace(/containers\/\d+/g, 'containers/0')
    .replace(/workspaces\/\d+/g, 'workspaces/0');
}

function zerarIds(objeto) {
  if (Array.isArray(objeto)) return objeto.forEach(zerarIds);
  if (!objeto || typeof objeto !== 'object') return;
  for (const chave of Object.keys(objeto)) {
    const valor = objeto[chave];
    if (chave === 'accountId' || chave === 'containerId') objeto[chave] = '0';
    else if ((chave === 'path' || chave === 'tagManagerUrl') && typeof valor === 'string') objeto[chave] = zerarCaminho(valor);
    else zerarIds(valor);
  }
}

function tipoDoConteiner(versao) {
  const contexto = versao.container?.usageContext || [];
  if (contexto.includes('SERVER')) return 'server';
  if (contexto.includes('WEB')) return 'web';
  throw new Error('usageContext desconhecido: use uma exportação de contêiner Web ou Server');
}

export function limpar(exportacao) {
  const versao = exportacao.containerVersion;
  const tipo = tipoDoConteiner(versao);
  const marcadores = MARCADORES[tipo];
  const avisos = [];

  zerarIds(versao);
  versao.container.name = NOMES[tipo];
  versao.container.publicId = ID_PUBLICO;
  if (versao.container.tagIds) versao.container.tagIds = [ID_PUBLICO];
  if (versao.container.taggingServerUrls) versao.container.taggingServerUrls = [URL_SERVIDOR];

  for (const variavel of versao.variable || []) {
    if (variavel.type !== 'c') continue;
    const parametro = (variavel.parameter || []).find((p) => p.key === 'value');
    if (!parametro) continue;
    if (Object.hasOwn(marcadores, variavel.name)) {
      parametro.value = marcadores[variavel.name];
    } else {
      parametro.value = 'PREENCHER_' + variavel.name.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
      avisos.push(variavel.name);
    }
  }
  return { tipo, avisos };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [entrada, saida] = process.argv.slice(2);
  if (!entrada || !saida) {
    console.error('uso: node scripts/gtm-limpar.mjs <exportacao-do-gtm.json> <gtm/templates/web.json|server.json>');
    process.exit(2);
  }
  const exportacao = JSON.parse(readFileSync(entrada, 'utf8'));
  const { tipo, avisos } = limpar(exportacao);
  writeFileSync(saida, JSON.stringify(exportacao, null, 4) + '\n');
  console.log(`contêiner ${tipo} limpo e gravado em ${saida}`);
  if (avisos.length) console.log(`constantes sem marcador conhecido (trocadas por PREENCHER_*): ${avisos.join(', ')}`);
}
