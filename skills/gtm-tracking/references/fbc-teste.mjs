/*
 * fbc-teste.mjs — prova as regras do fbc do tracking.js sem navegador e sem rede.
 *
 * Rode na pasta references:   node fbc-teste.mjs
 *
 * Carrega o tracking.js de verdade dentro de um "navegador de mentira" (Node vm)
 * com cookies que respeitam domain/expires, localStorage, sessionStorage e um
 * relógio controlado. Cada carregamento de página roda o script do zero, como
 * no navegador; cookies e armazenamento continuam entre as páginas.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import assert from 'node:assert/strict';

const CODIGO = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'tracking.js'), 'utf8');
const DIA = 864e5;
const SUFIXOS_PUBLICOS = new Set(['com', 'br', 'com.br', 'net']);

function criarNavegador({ host = 'www.exemplo.com.br', bloquearCookies = false } = {}) {
  const jar = new Map(); // nome -> { valor, dominio, expira, atributos }
  const escritas = [];   // toda escrita feita pelo script (para provar que ele não reescreve)
  const local = new Map();
  let sessao = new Map();
  let agora = Date.UTC(2026, 9, 1, 12, 0, 0);

  function armazenamento(mapa) {
    return {
      getItem: (k) => (mapa().has(k) ? mapa().get(k) : null),
      setItem: (k, v) => mapa().set(k, String(v)),
      removeItem: (k) => mapa().delete(k),
    };
  }

  function lerJar() {
    return [...jar.entries()]
      .filter(([, c]) => c.expira === null || c.expira > agora)
      .map(([n, c]) => `${n}=${c.valor}`)
      .join('; ');
  }

  function gravarJar(linha) {
    if (bloquearCookies) return;
    const [par, ...attrs] = linha.split(';').map((s) => s.trim());
    const igual = par.indexOf('=');
    const nome = par.slice(0, igual);
    const valor = par.slice(igual + 1);
    const a = {};
    for (const at of attrs) {
      const i = at.indexOf('=');
      a[(i === -1 ? at : at.slice(0, i)).toLowerCase()] = i === -1 ? true : at.slice(i + 1);
    }
    if (a.domain) {
      const d = a.domain.replace(/^\./, '');
      if (SUFIXOS_PUBLICOS.has(d) || !(host === d || host.endsWith('.' + d))) return; // navegador recusa
    }
    const expira = a.expires ? Date.parse(a.expires) : null;
    if (expira !== null && expira <= agora) { jar.delete(nome); return; }
    if (nome !== 'trk_teste_dominio') escritas.push({ nome, valor, ...a });
    jar.set(nome, { valor, dominio: a.domain || null, expira, atributos: a });
  }

  function carregar(caminho, { pagina = 'home', avancarMs = 0 } = {}) {
    agora += avancarMs;
    const url = new URL(caminho, `https://${host}/`);
    const RealDate = Date;
    class DataControlada extends RealDate {
      constructor(...args) { super(...(args.length ? args : [agora])); }
      static now() { return agora; }
    }
    const window = {
      location: { href: url.href, hostname: url.hostname, pathname: url.pathname, search: url.search },
      localStorage: armazenamento(() => local),
      sessionStorage: armazenamento(() => sessao),
      crypto: webcrypto,
      dataLayer: [],
      setTimeout: () => 0,
      Date: DataControlada,
      URLSearchParams,
      JSON, Object, Array, Number, String, Math, RegExp, Uint8Array,
    };
    window.window = window;
    window.navigator = { userAgent: 'teste-node' };
    window.document = {
      title: 'teste',
      referrer: '',
      documentElement: { getAttribute: (n) => (n === 'data-page' ? pagina : null) },
      addEventListener: () => {},
      getElementById: () => null,
      get cookie() { return lerJar(); },
      set cookie(linha) { gravarJar(linha); },
    };
    vm.runInNewContext(CODIGO, window);
    return window.dataLayer;
  }

  return {
    carregar,
    cookie: (n) => jar.get(n) || null,
    escritas,
    sessao,
    local,
    /* Grava um cookie "por fora" do script, como o Pixel da Meta faria. Não conta como escrita do script. */
    cookieExterno(linha) { gravarJar(linha); escritas.length = 0; },
    agora: () => agora,
  };
}

const fbcDo = (dl, evento = 'page_data') => dl.find((e) => e.event === evento).user_data.fbc;
const resultados = [];
function caso(nome, fn) {
  try { fn(); resultados.push(['ok', nome]); } catch (e) { resultados.push(['FALHOU', nome, e.message]); }
}

caso('1. fbclid na URL sem cookie: monta fb.1.<agora>.<fbclid> e grava _fbc (90 dias, path=/, SameSite=Lax, domínio registrável)', () => {
  const nav = criarNavegador();
  const dl = nav.carregar('/?fbclid=TESTE123');
  const esperado = `fb.1.${nav.agora()}.TESTE123`;
  assert.equal(fbcDo(dl), esperado);
  const c = nav.cookie('_fbc');
  assert.equal(c.valor, esperado);
  assert.equal(c.dominio, 'exemplo.com.br');
  assert.equal(c.atributos.path, '/');
  assert.equal(c.atributos.samesite, 'Lax');
  assert.equal(c.expira, nav.agora() + 90 * DIA);
});

caso('2. Recarregar sem o parâmetro e com o mesmo fbclid: data de criação não muda', () => {
  const nav = criarNavegador();
  const original = fbcDo(nav.carregar('/?fbclid=TESTE123'));
  assert.equal(fbcDo(nav.carregar('/', { avancarMs: 60_000 })), original);
  assert.equal(fbcDo(nav.carregar('/?fbclid=TESTE123', { avancarMs: 3 * DIA })), original);
  assert.equal(nav.escritas.filter((e) => e.nome === '_fbc').length, 1, 'o _fbc só pode ser gravado uma vez');
});

caso('3. fbclid diferente substitui o valor (nova data de criação)', () => {
  const nav = criarNavegador();
  const antigo = fbcDo(nav.carregar('/?fbclid=TESTE123'));
  const novo = fbcDo(nav.carregar('/?fbclid=TESTE456', { avancarMs: DIA }));
  assert.notEqual(novo, antigo);
  assert.equal(novo, `fb.1.${nav.agora()}.TESTE456`);
  assert.equal(nav.cookie('_fbc').valor, novo);
});

caso('4. Navegação interna e página de obrigado: lead_confirmed leva o mesmo fbc', () => {
  const nav = criarNavegador();
  const original = fbcDo(nav.carregar('/?fbclid=TESTE123'));
  nav.carregar('/sobre', { avancarMs: 30_000 });
  nav.sessao.set('trk_lead_enviado', JSON.stringify({ event_id: 'evt-1', form_id: 'form-lead', form_name: 'f', lead: {} }));
  const dl = nav.carregar('/obrigado.html', { pagina: 'obrigado', avancarMs: 5_000 });
  assert.equal(fbcDo(dl, 'lead_confirmed'), original);
  assert.equal(dl.find((e) => e.event === 'lead_confirmed').event_data.event_id, 'evt-1');
});

caso('5. Cookie _fbc já existente (ex.: do Pixel): reutilizado como está, sem regravar', () => {
  const nav = criarNavegador();
  const doPixel = 'fb.1.1790000000000.PiXeLClick_Id-9';
  nav.cookieExterno(`_fbc=${doPixel}; path=/; domain=exemplo.com.br`);
  const dl = nav.carregar('/', { avancarMs: DIA });
  assert.equal(fbcDo(dl), doPixel);
  assert.equal(nav.escritas.filter((e) => e.nome === '_fbc').length, 0, 'não pode regravar o cookie do Pixel');
});

caso('6. Pixel já gravou o MESMO clique da URL: cookie mantido (data original), sem regravar', () => {
  const nav = criarNavegador();
  nav.cookieExterno('_fbc=fb.1.1790000000000.TESTE123; path=/; domain=exemplo.com.br');
  const dl = nav.carregar('/?fbclid=TESTE123', { avancarMs: 60_000 });
  assert.equal(fbcDo(dl), 'fb.1.1790000000000.TESTE123');
  assert.equal(nav.escritas.filter((e) => e.nome === '_fbc').length, 0);
});

caso('7. Sem fbclid e sem cookie: fbc = null e nenhum cookie gravado', () => {
  const nav = criarNavegador();
  const dl = nav.carregar('/?utm_source=teste');
  assert.equal(fbcDo(dl), null);
  assert.equal(nav.cookie('_fbc'), null);
});

caso('8. fbclid é usado cru: maiúsculas, hífen, sublinhado e %2B preservados', () => {
  const nav = criarNavegador();
  const dl = nav.carregar('/?a=1&fbclid=IwAR0Ab-Cd_Ef%2BgH&b=2');
  assert.equal(fbcDo(dl), `fb.1.${nav.agora()}.IwAR0Ab-Cd_Ef%2BgH`);
  assert.equal(nav.cookie('_fbc').valor, `fb.1.${nav.agora()}.IwAR0Ab-Cd_Ef%2BgH`);
});

caso('9. Cookies bloqueados: reserva no sessionStorage mantém o mesmo fbc até a página de obrigado', () => {
  const nav = criarNavegador({ bloquearCookies: true });
  const original = fbcDo(nav.carregar('/?fbclid=TESTE123'));
  assert.equal(original, `fb.1.${nav.agora()}.TESTE123`);
  nav.sessao.set('trk_lead_enviado', JSON.stringify({ event_id: 'evt-2', form_id: 'f', form_name: 'f', lead: {} }));
  const dl = nav.carregar('/obrigado.html', { pagina: 'obrigado', avancarMs: 10_000 });
  assert.equal(fbcDo(dl, 'lead_confirmed'), original);
});

caso('10. localhost: cookie fica só no host (sem domain) e o índice continua 1', () => {
  const nav = criarNavegador({ host: 'localhost' });
  const dl = nav.carregar('/?fbclid=TESTE123');
  assert.equal(fbcDo(dl), `fb.1.${nav.agora()}.TESTE123`);
  assert.equal(nav.cookie('_fbc').dominio, null);
});

caso('11. Cookie _fbc fora do formato oficial é ignorado (não inventa valor)', () => {
  const nav = criarNavegador();
  nav.cookieExterno('_fbc=lixo-sem-formato; path=/; domain=exemplo.com.br');
  assert.equal(fbcDo(nav.carregar('/')), null);
});

for (const [estado, nome, erro] of resultados) {
  console.log(`${estado.padEnd(6)} ${nome}${erro ? `\n       ${erro}` : ''}`);
}
const falhas = resultados.filter((r) => r[0] !== 'ok').length;
console.log(`\n${resultados.length - falhas}/${resultados.length} casos passaram`);
process.exit(falhas ? 1 : 0);
