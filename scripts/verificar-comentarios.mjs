import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';

const ANTES_DE_REGEX = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^']);
const PALAVRAS_ANTES_DE_REGEX = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);

function linhaDe(fonte, posicao) {
  let linha = 1;
  for (let i = 0; i < posicao; i++) if (fonte[i] === '\n') linha++;
  return linha;
}

function comentariosJs(fonte) {
  const achados = [];
  let i = 0;
  let ultimoCaractere = '';
  let ultimaPalavra = '';

  function pularTexto(aspas) {
    i++;
    while (i < fonte.length && fonte[i] !== aspas) {
      if (fonte[i] === '\\') i++;
      i++;
    }
    i++;
  }

  function pularRegex() {
    i++;
    let classe = false;
    while (i < fonte.length && fonte[i] !== '\n') {
      const c = fonte[i];
      if (c === '\\') i++;
      else if (c === '[') classe = true;
      else if (c === ']') classe = false;
      else if (c === '/' && !classe) break;
      i++;
    }
    i++;
    while (/[a-z]/i.test(fonte[i] || '')) i++;
  }

  function pularModelo() {
    i++;
    while (i < fonte.length && fonte[i] !== '`') {
      if (fonte[i] === '\\') i += 2;
      else if (fonte[i] === '$' && fonte[i + 1] === '{') {
        i += 2;
        codigo(true);
        i++;
      } else i++;
    }
    i++;
  }

  function codigo(dentroDeChaves) {
    let profundidade = 0;
    while (i < fonte.length) {
      const c = fonte[i];
      const d = fonte[i + 1];
      if (c === '/' && d === '/') {
        achados.push(linhaDe(fonte, i));
        while (i < fonte.length && fonte[i] !== '\n') i++;
      } else if (c === '/' && d === '*') {
        achados.push(linhaDe(fonte, i));
        const fim = fonte.indexOf('*/', i + 2);
        i = fim === -1 ? fonte.length : fim + 2;
      } else if (c === '"' || c === "'") {
        pularTexto(c);
        ultimoCaractere = c;
        ultimaPalavra = '';
      } else if (c === '`') {
        pularModelo();
        ultimoCaractere = c;
        ultimaPalavra = '';
      } else if (c === '/') {
        if (ANTES_DE_REGEX.has(ultimoCaractere) || PALAVRAS_ANTES_DE_REGEX.has(ultimaPalavra)) {
          pularRegex();
          ultimoCaractere = '/';
          ultimaPalavra = '';
        } else {
          ultimoCaractere = c;
          ultimaPalavra = '';
          i++;
        }
      } else if (/\s/.test(c)) {
        i++;
      } else if (/[A-Za-z0-9_$]/.test(c)) {
        let palavra = '';
        while (i < fonte.length && /[A-Za-z0-9_$]/.test(fonte[i])) palavra += fonte[i++];
        ultimaPalavra = palavra;
        ultimoCaractere = 'a';
      } else {
        if (c === '{') profundidade++;
        if (c === '}') {
          if (dentroDeChaves && profundidade === 0) return;
          profundidade--;
        }
        ultimoCaractere = c;
        ultimaPalavra = '';
        i++;
      }
    }
  }

  codigo(false);
  return achados;
}

function comentariosHtml(fonte) {
  const achados = [];
  for (const m of fonte.matchAll(/<!--/g)) achados.push(linhaDe(fonte, m.index));
  for (const m of fonte.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    const base = linhaDe(fonte, m.index + m[0].indexOf(m[1])) - 1;
    for (const linha of comentariosJs(m[1])) achados.push(base + linha);
  }
  return achados;
}

function comentariosCerquilha(fonte) {
  const achados = [];
  fonte.split('\n').forEach((linha, indice) => {
    if (indice === 0 && linha.startsWith('#!')) return;
    const semTextos = linha.replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, '""');
    if (/(^|\s)#/.test(semTextos)) achados.push(indice + 1);
  });
  return achados;
}

function comentariosJson(fonte) {
  const achados = [];
  JSON.parse(fonte, function (chave, valor) {
    if (/^_?(coment|comment)/i.test(chave)) achados.push(chave);
    return valor;
  });
  return achados.map(() => linhaDe(fonte, fonte.search(/"_?(coment|comment)/i)));
}

const POR_LINGUAGEM = {
  js: comentariosJs, javascript: comentariosJs, mjs: comentariosJs,
  html: comentariosHtml,
  bash: comentariosCerquilha, sh: comentariosCerquilha, shell: comentariosCerquilha,
  yaml: comentariosCerquilha, yml: comentariosCerquilha, dotenv: comentariosCerquilha, env: comentariosCerquilha,
  json: comentariosJson,
};

function blocosMarkdown(fonte) {
  const achados = [];
  for (const m of fonte.matchAll(/^```([A-Za-z]+)[^\n]*\n([\s\S]*?)^```/gm)) {
    const verificar = POR_LINGUAGEM[m[1].toLowerCase()];
    if (!verificar || m[1].toLowerCase() === 'json') continue;
    const base = linhaDe(fonte, m.index);
    for (const linha of verificar(m[2])) achados.push(base + linha);
  }
  return achados;
}

function verificadorDe(arquivo) {
  if (arquivo.startsWith('gtm/templates/')) return null;
  const nome = basename(arquivo);
  const extensao = extname(arquivo).slice(1).toLowerCase();
  if (nome === '.env.example' || nome === '.gitignore' || nome === 'CODEOWNERS' || nome === 'Dockerfile') return comentariosCerquilha;
  if (['js', 'mjs', 'cjs'].includes(extensao)) return comentariosJs;
  if (['html', 'htm'].includes(extensao)) return comentariosHtml;
  if (['yml', 'yaml', 'sh'].includes(extensao)) return comentariosCerquilha;
  if (extensao === 'json') return comentariosJson;
  if (extensao === 'md') return blocosMarkdown;
  return null;
}

const arquivos = process.argv.length > 2
  ? process.argv.slice(2)
  : execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).split('\u0000').filter(Boolean);

let total = 0;
let verificados = 0;
for (const arquivo of arquivos) {
  const verificar = verificadorDe(arquivo);
  if (!verificar) continue;
  verificados++;
  for (const linha of verificar(readFileSync(arquivo, 'utf8'))) {
    console.log(`${arquivo}:${linha}: comentário no código`);
    total++;
  }
}
console.log(total ? `\n${total} comentário(s) em ${verificados} arquivos verificados` : `nenhum comentário em ${verificados} arquivos verificados`);
process.exit(total ? 1 : 0);
