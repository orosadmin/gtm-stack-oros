import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const REGRAS = [
  ['token_meta', /\bEAA[A-Za-z0-9]{20,}/g],
  ['config_conteiner_gtm', /aWQ9R1RN[A-Za-z0-9+/=]{20,}/g],
  ['token_jwt_ou_cloudflare', /\beyJ[A-Za-z0-9_-]{30,}/g],
  ['chave_privada', /-----BEGIN [A-Z ]*PRIVATE KEY-----/g],
  ['token_github', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/g],
  ['chave_google', /\bAIza[0-9A-Za-z_-]{30,}/g],
  ['atribuicao_de_segredo', /\b(?:access_token|api[_-]?key|secret|password|passwd|senha|token)\b["']?\s*[:=]\s*["']?(?!PREENCHER_|meu_|seu_|\{\{|\$\{)[A-Za-z0-9_\-./+]{16,}/gi],
  ['base64_longo', /[A-Za-z0-9+/]{80,}={0,2}/g],
  ['hex_longo', /\b[0-9a-f]{64,}\b/g],
  ['email', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g],
  ['telefone_br', /\+?55\s?\(?\d{2}\)?\s?9?\d{4}[\s-]?\d{4}\b/g],
  ['ipv4', /\b(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}\b/g],
  ['id_gtm_real', /\bGTM-(?!X{5,}\b)[A-Z0-9]{6,9}\b/g],
  ['id_ga4_real', /\bG-(?!X{5,}\b)[A-Z0-9]{8,12}\b/g],
  ['id_numerico_longo', /\b\d{15,16}\b/g],
  ['codigo_teste_meta', /\bTEST\d{4,}\b/g],
  ['conta_gtm_real', /accounts\/[1-9]\d{5,}/g],
];

const PERMITIDOS = {
  email: /@(exemplo\.com(\.br)?|seudominio\.com|seusite\.com(\.br)?|empresa\.com|example\.(com|org)|users\.noreply\.github\.com)$/i,
  telefone_br: /^(\+?55\s?\(?11\)?\s?9?1234[\s-]?5678|\+?5511900000000|\+?55\s?11\s?3123[\s-]?4567|\+?551131234567)$/,
  ipv4: /^(0\.0\.0\.0|127\.0\.0\.1|1\.1\.1\.1|8\.8\.8\.8|8\.8\.4\.4)$/,
  id_ga4_real: /^G-AB12CD34EF$/,
};

const LINHA_PERMITIDA = /"(signature|fingerprint|version)"\s*:|^\s*[A-Z_]*SHA256:\s/;

function preparar(texto) {
  return texto
    .replace(/data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+/g, '')
    .replace(/___TESTS___[\s\S]*?___NOTES___/g, '');
}

function procurar(texto) {
  const achados = {};
  for (const linha of preparar(texto).split('\n')) {
    if (LINHA_PERMITIDA.test(linha)) continue;
    for (const [nome, regra] of REGRAS) {
      for (const m of linha.matchAll(regra)) {
        if (PERMITIDOS[nome]?.test(m[0])) continue;
        achados[nome] = (achados[nome] || 0) + 1;
      }
    }
  }
  return achados;
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 28 });
}

function ehTexto(conteudo) {
  return !conteudo.includes('\u0000');
}

const historico = process.argv.includes('--historico');
const avulsos = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const resultado = new Map();

function registrar(origem, achados) {
  for (const [regra, total] of Object.entries(achados)) {
    const chave = `${regra}\t${origem}`;
    resultado.set(chave, (resultado.get(chave) || 0) + total);
  }
}

if (historico) {
  const vistos = new Set();
  for (const linha of git('rev-list', '--all', '--objects').split('\n')) {
    const [objeto, ...caminho] = linha.split(' ');
    if (!objeto || !caminho.length || vistos.has(objeto)) continue;
    if (git('cat-file', '-t', objeto).trim() !== 'blob') continue;
    vistos.add(objeto);
    const conteudo = git('cat-file', '-p', objeto);
    if (ehTexto(conteudo)) registrar(caminho.join(' '), procurar(conteudo));
  }
  registrar('(mensagens de commit)', procurar(git('log', '--all', '--format=%B')));
  console.log(`histórico: ${vistos.size} versões de arquivo analisadas`);
} else {
  const arquivos = avulsos.length
    ? avulsos
    : git('ls-files', '-z', '--cached', '--others', '--exclude-standard').split('\u0000').filter(Boolean);
  for (const arquivo of arquivos) {
    const conteudo = readFileSync(arquivo, 'utf8');
    if (ehTexto(conteudo)) registrar(arquivo, procurar(conteudo));
  }
  console.log(`árvore: ${arquivos.length} arquivos analisados`);
}

if (!resultado.size) {
  console.log('nenhum segredo ou dado pessoal encontrado');
  process.exit(0);
}
console.log('ACHADOS (só contagens; os valores nunca são mostrados):');
for (const [chave, total] of [...resultado.entries()].sort()) {
  const [regra, origem] = chave.split('\t');
  console.log(`  ${regra}: ${total} em ${origem}`);
}
process.exit(1);
