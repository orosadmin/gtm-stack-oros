/*
 * ============================================================================
 *  tracking.js — modelo de dataLayer padrão (skill gtm-tracking)
 * ============================================================================
 *
 *  Este arquivo é carregado no <head> de TODAS as páginas, ANTES do snippet do
 *  Google Tag Manager. Adapte ao seu site os pontos marcados com ">>>"
 *  (ID do GA4, página de obrigado, campos do formulário). Ele:
 *
 *    1. cria o window.dataLayer;
 *    2. envia o evento "page_data" assim que a página começa a carregar;
 *    3. escuta cliques em botões e links marcados com data-track-id ("cta_click");
 *    4. escuta o primeiro foco no formulário ("form_start");
 *    5. valida o formulário e, no envio válido, dispara "generate_lead" e
 *       redireciona para obrigado.html;
 *    6. em obrigado.html dispara "lead_confirmed" com o MESMO event_id.
 *
 *  Todo push tem sempre o mesmo formato:
 *
 *    {
 *      event:      "nome_do_evento",
 *      user_data:  { ...QUEM é o visitante (identificadores)... },
 *      event_data: { ...O QUE aconteceu (detalhes do evento)... },
 *      consent:    { ...estado de consentimento... }
 *    }
 *
 *  Os identificadores são lidos de novo antes de CADA push, porque cookies como
 *  _fbp e _ga podem ser criados pelas tags depois que a página carregou.
 * ============================================================================
 */
(function () {
  'use strict';

  /*
   * ##########################################################################
   *  >>> SUBSTITUA AQUI O ID DE MEDIÇÃO DO GA4 <<<
   *
   *  Usado SOMENTE para ler o cookie de sessão do GA4 (_ga_<ID sem o "G-">).
   *  Exemplo: se o ID for G-AB12CD34EF, o cookie lido será _ga_AB12CD34EF.
   *  Enquanto estiver G-XXXXXXXXXX, ga_session_id e ga_session_number ficam null.
   * ##########################################################################
   */
  var GA4_MEASUREMENT_ID = 'G-XXXXXXXXXX';

  /* >>> Página de obrigado para onde o formulário redireciona. */
  var PAGINA_OBRIGADO = 'obrigado.html';

  /* Tempo máximo (ms) que esperamos o GTM processar o generate_lead antes de redirecionar. */
  var TEMPO_MAXIMO_GTM_MS = 1000;

  /* Chaves de armazenamento primário (first-party) usadas por este site. */
  var CHAVE_EXTERNAL_ID = 'trk_external_id';
  var CHAVE_ATRIBUICAO = 'trk_atribuicao';
  var CHAVE_LEAD = 'trk_lead_enviado';
  var CHAVE_FBC_RESERVA = 'trk_fbc';

  /* Validade do cookie _fbc (a mesma que o Pixel da Meta usa). */
  var FBC_DIAS = 90;

  /* Parâmetros de URL que guardamos para não perder a origem ao trocar de página. */
  var PARAMETROS_ATRIBUICAO = [
    'gclid', 'gbraid', 'wbraid',
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'
  ];

  window.dataLayer = window.dataLayer || [];

  /* ------------------------------------------------------------------------
   *  Utilitários de cookie e armazenamento (tudo com try/catch: em navegação
   *  privada ou abrindo o arquivo direto do disco o acesso pode falhar).
   * ---------------------------------------------------------------------- */

  function lerCookie(nome) {
    try {
      var partes = document.cookie ? document.cookie.split('; ') : [];
      for (var i = 0; i < partes.length; i++) {
        var igual = partes[i].indexOf('=');
        if (partes[i].substring(0, igual) === nome) {
          return decodeURIComponent(partes[i].substring(igual + 1));
        }
      }
    } catch (e) { /* sem acesso a cookies */ }
    return null;
  }

  function gravarCookie(nome, valor, dias) {
    try {
      var expira = new Date(Date.now() + dias * 864e5).toUTCString();
      document.cookie = nome + '=' + encodeURIComponent(valor) +
        '; expires=' + expira + '; path=/; SameSite=Lax';
    } catch (e) { /* sem acesso a cookies */ }
  }

  /* Lê o cookie SEM decodificar: usado para o _fbc, que deve ser repassado exatamente como foi gravado. */
  function lerCookieBruto(nome) {
    try {
      var partes = document.cookie ? document.cookie.split('; ') : [];
      for (var i = 0; i < partes.length; i++) {
        var igual = partes[i].indexOf('=');
        if (partes[i].substring(0, igual) === nome) return partes[i].substring(igual + 1);
      }
    } catch (e) { /* sem acesso a cookies */ }
    return null;
  }

  /*
   * Domínio registrável (ex.: "seusite.com.br" para "www.seusite.com.br").
   * Descoberto tentando gravar um cookie de teste do sufixo mais curto para o
   * mais longo: o navegador recusa sufixos públicos ("com", "com.br"), então o
   * primeiro aceito é o domínio registrável. É o mesmo truque do "auto" do GA.
   * Retorna null em localhost, IP ou arquivo aberto do disco (cookie só do host).
   */
  var dominioRegistravelCache;
  function dominioRegistravel() {
    if (dominioRegistravelCache !== undefined) return dominioRegistravelCache;
    dominioRegistravelCache = null;
    try {
      var host = window.location.hostname;
      if (!host || host.indexOf('.') === -1 || /^[\d.]+$/.test(host) || host.indexOf(':') !== -1) {
        return dominioRegistravelCache;
      }
      var rotulos = host.split('.');
      for (var i = rotulos.length - 2; i >= 0; i--) {
        var candidato = rotulos.slice(i).join('.');
        document.cookie = 'trk_teste_dominio=1; path=/; domain=' + candidato;
        if (lerCookieBruto('trk_teste_dominio') === '1') {
          document.cookie = 'trk_teste_dominio=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=' + candidato;
          dominioRegistravelCache = candidato;
          break;
        }
      }
    } catch (e) { /* sem acesso a cookies */ }
    return dominioRegistravelCache;
  }

  function lerLocal(chave) {
    try { return window.localStorage.getItem(chave); } catch (e) { return null; }
  }

  function gravarLocal(chave, valor) {
    try { window.localStorage.setItem(chave, valor); } catch (e) { /* indisponível */ }
  }

  function lerSessao(chave) {
    try { return window.sessionStorage.getItem(chave); } catch (e) { return null; }
  }

  function gravarSessao(chave, valor) {
    try { window.sessionStorage.setItem(chave, valor); } catch (e) { /* indisponível */ }
  }

  function gerarUUID() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    var bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    var hex = Array.prototype.map.call(bytes, function (b) {
      return ('0' + b.toString(16)).slice(-2);
    }).join('');
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) +
      '-' + hex.slice(16, 20) + '-' + hex.slice(20);
  }

  function parametroUrl(nome) {
    try { return new URLSearchParams(window.location.search).get(nome); } catch (e) { return null; }
  }

  /* ------------------------------------------------------------------------
   *  Normalização dos dados pessoais (formato esperado por Meta CAPI e
   *  Google Enhanced Conversions). O hash SHA-256 NÃO é feito aqui: as tags
   *  do contêiner de servidor fazem o hash antes de enviar.
   * ---------------------------------------------------------------------- */

  function normalizarEmail(email) {
    return (email || '').trim().toLowerCase();
  }

  /* Telefone: só dígitos, com código do país. Número brasileiro sem DDI (10 ou 11 dígitos) ganha o 55. */
  function normalizarTelefone(telefone) {
    var digitos = (telefone || '').replace(/\D/g, '');
    if (digitos.length === 10 || digitos.length === 11) {
      digitos = '55' + digitos;
    }
    return digitos;
  }

  function normalizarNome(nome) {
    var partes = (nome || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
    return {
      first_name: partes[0] || '',
      last_name: partes.slice(1).join(' ')
    };
  }

  /* ------------------------------------------------------------------------
   *  Identificadores do visitante
   * ---------------------------------------------------------------------- */

  /* ID próprio (first-party) e aleatório do visitante: vira o external_id da Meta e o user_id que você quiser. */
  function obterExternalId() {
    var id = lerCookie(CHAVE_EXTERNAL_ID) || lerLocal(CHAVE_EXTERNAL_ID);
    if (!id) {
      id = gerarUUID();
    }
    gravarCookie(CHAVE_EXTERNAL_ID, id, 400);
    gravarLocal(CHAVE_EXTERNAL_ID, id);
    return id;
  }

  /*
   * ------------------------------------------------------------------------
   *  fbc (clique em anúncio da Meta) — regras completas em references/fbc.md
   *
   *  Formato: fb.<subdomainIndex>.<criação em ms>.<fbclid>
   *  Prioridade:
   *    a) fbclid na URL atual (o clique no anúncio);
   *    b) senão, o cookie _fbc que já existe, EXATAMENTE como está gravado
   *       (a data de criação dentro dele nunca é refeita);
   *    c) senão, null. Nunca inventamos um valor.
   *  O fbclid é usado como chegou: sem mudar maiúsculas/minúsculas, sem
   *  cortar, sem decodificar nem codificar de novo.
   * ------------------------------------------------------------------------
   */
  var FBC_FORMATO = /^fb\.(\d+)\.(\d+)\.(.+)$/;

  /* Valor do parâmetro como está no endereço (sem decodificar), ou null. */
  function parametroUrlBruto(nome) {
    var busca = (window.location.search || '').replace(/^\?/, '');
    if (!busca) return null;
    var pares = busca.split('&');
    for (var i = 0; i < pares.length; i++) {
      var igual = pares[i].indexOf('=');
      if (igual > 0 && pares[i].substring(0, igual) === nome) return pares[i].substring(igual + 1);
    }
    return null;
  }

  /* Só aceitamos fbclid que pode ir num cookie sem ser alterado (sem espaço, ; , " ou \). */
  function fbclidAceitavel(fbclid) {
    return !!fbclid && /^[\x21-\x7E]+$/.test(fbclid) && !/[;,"\\]/.test(fbclid);
  }

  /* Separa um valor fbc nas partes; null se não estiver no formato oficial. */
  function lerFbc(valor) {
    var partes = valor ? FBC_FORMATO.exec(valor) : null;
    return partes ? { valor: valor, criadoEm: Number(partes[2]), fbclid: partes[3] } : null;
  }

  /* O fbc é do mesmo clique? (aceita um sufixo extra que a Meta possa ter anexado depois do fbclid) */
  function mesmoClique(fbc, fbclid) {
    return fbc.fbclid === fbclid || fbc.fbclid.indexOf(fbclid + '.') === 0;
  }

  /* A reserva (sessionStorage/localStorage) não expira sozinha: só vale dentro dos 90 dias do cookie. */
  function reservaFbc() {
    var fbc = lerFbc(lerSessao(CHAVE_FBC_RESERVA)) || lerFbc(lerLocal(CHAVE_FBC_RESERVA));
    if (!fbc) return null;
    var idade = Date.now() - fbc.criadoEm;
    return idade >= 0 && idade <= FBC_DIAS * 864e5 ? fbc : null;
  }

  /*
   * Grava o _fbc no domínio registrável (vale para www. e para a raiz), por
   * 90 dias contados da CRIAÇÃO do clique, e copia para a reserva.
   * O valor vai cru, sem encodeURIComponent: o Pixel e a Meta leem assim.
   */
  function gravarFbc(fbc) {
    try {
      var dominio = dominioRegistravel();
      document.cookie = '_fbc=' + fbc.valor +
        '; expires=' + new Date(fbc.criadoEm + FBC_DIAS * 864e5).toUTCString() +
        '; path=/; SameSite=Lax' + (dominio ? '; domain=' + dominio : '');
    } catch (e) { /* sem acesso a cookies: fica só a reserva */ }
    gravarSessao(CHAVE_FBC_RESERVA, fbc.valor);
    gravarLocal(CHAVE_FBC_RESERVA, fbc.valor);
  }

  /*
   * subdomainIndex, pela definição da Meta, é o nível do domínio onde o
   * cookie fica: 0 = só o TLD ("com"), 1 = domínio registrável
   * ("seusite.com"), 2 = um subdomínio ("www.seusite.com"). Este modelo grava
   * sempre no domínio registrável (dominioRegistravel), então o índice é 1.
   * Em localhost/IP o cookie fica só no host e usamos 1, que é o valor que a
   * Meta indica quando não se sabe o nível.
   */
  var FBC_SUBDOMAIN_INDEX = 1;

  /*
   * Roda UMA vez, no carregamento, antes do primeiro push. O fbclid só existe
   * na URL de entrada; daqui para frente o valor vive no cookie (e na reserva).
   * Lê primeiro e só grava quando falta o cookie ou quando chega um fbclid novo,
   * para não brigar com o Pixel da Meta, que também grava o _fbc.
   */
  function capturarFbc() {
    var fbclid = parametroUrlBruto('fbclid');
    var doCookie = lerFbc(lerCookieBruto('_fbc'));

    if (fbclidAceitavel(fbclid)) {
      var conhecido = doCookie || reservaFbc();
      if (conhecido && mesmoClique(conhecido, fbclid)) {
        /* Mesmo clique (ex.: recarregou a página de entrada): mantém a data original. */
        if (!doCookie) gravarFbc(conhecido);
        return;
      }
      /* Clique novo (ou primeiro): a criação é o momento em que o fbclid apareceu no site. */
      var agora = Date.now();
      gravarFbc({ valor: 'fb.' + FBC_SUBDOMAIN_INDEX + '.' + agora + '.' + fbclid, criadoEm: agora, fbclid: fbclid });
      return;
    }

    /* Sem fbclid: não grava nada. Só mantém a reserva igual ao cookie, se houver. */
    if (doCookie) {
      gravarSessao(CHAVE_FBC_RESERVA, doCookie.valor);
      gravarLocal(CHAVE_FBC_RESERVA, doCookie.valor);
    }
  }

  /* Lido antes de CADA push: cookie (como está) > reserva > null. */
  function obterFbc() {
    var doCookie = lerFbc(lerCookieBruto('_fbc'));
    if (doCookie) return doCookie.valor;
    var reserva = reservaFbc();
    return reserva ? reserva.valor : null;
  }

  /* _ga = GA1.1.1234567890.1700000000  ->  client_id = "1234567890.1700000000" */
  function obterGaClientId() {
    var ga = lerCookie('_ga');
    if (!ga) return null;
    var partes = ga.split('.');
    return partes.length >= 4 ? partes.slice(-2).join('.') : null;
  }

  /*
   * Cookie de sessão do GA4 (_ga_<ID>). Existem dois formatos:
   *   antigo: GS1.1.1700000000.5.1.1700000100.0.0.0   (sessão = 3º campo, número = 4º)
   *   novo:   GS2.1.s1700000000$o5$g1$t1700000100$j0  (sessão = "s...", número = "o...")
   */
  function obterSessaoGa() {
    var vazio = { ga_session_id: null, ga_session_number: null };
    if (GA4_MEASUREMENT_ID.indexOf('XXXX') !== -1) return vazio;
    var valor = lerCookie('_ga_' + GA4_MEASUREMENT_ID.replace(/^G-/, ''));
    if (!valor) return vazio;
    var partes = valor.split('.');
    if (partes[0] === 'GS1' && partes.length >= 4) {
      return { ga_session_id: partes[2], ga_session_number: Number(partes[3]) };
    }
    var campos = {};
    (partes[2] || '').split('$').forEach(function (campo) {
      campos[campo.charAt(0)] = campo.substring(1);
    });
    return {
      ga_session_id: campos.s || null,
      ga_session_number: campos.o ? Number(campos.o) : null
    };
  }

  /* _gcl_aw = GCL.1700000000.<gclid> (criado pelo Conversion Linker do Google Ads) */
  function gclidDoCookie() {
    var valor = lerCookie('_gcl_aw');
    if (!valor) return null;
    var partes = valor.split('.');
    return partes.length >= 3 ? partes.slice(2).join('.') : null;
  }

  /*
   * Click ids do Google e UTMs: lidos da URL e guardados no localStorage
   * (último toque), para continuarem disponíveis na página de obrigado.
   */
  function obterAtribuicao() {
    var guardado = {};
    try { guardado = JSON.parse(lerLocal(CHAVE_ATRIBUICAO) || '{}'); } catch (e) { guardado = {}; }
    var novos = {};
    var temNovo = false;
    PARAMETROS_ATRIBUICAO.forEach(function (nome) {
      var valor = parametroUrl(nome);
      if (valor) { novos[nome] = valor; temNovo = true; }
    });
    var atribuicao = temNovo ? novos : guardado;
    if (temNovo) gravarLocal(CHAVE_ATRIBUICAO, JSON.stringify(novos));
    var resultado = {};
    PARAMETROS_ATRIBUICAO.forEach(function (nome) {
      resultado[nome] = atribuicao[nome] || null;
    });
    if (!resultado.gclid) resultado.gclid = gclidDoCookie();
    return resultado;
  }

  /* Dados do formulário (preenchidos só no envio; antes disso ficam vazios). */
  var dadosDoLead = { email: '', phone_number: '', first_name: '', last_name: '' };

  /*
   * Monta o bloco user_data (QUEM). Chamado antes de CADA push para pegar
   * cookies que tenham aparecido depois do carregamento.
   */
  function montarUserData() {
    var sessao = obterSessaoGa();
    var atribuicao = obterAtribuicao();
    return {
      external_id: obterExternalId(),
      email: dadosDoLead.email,
      phone_number: dadosDoLead.phone_number,
      first_name: dadosDoLead.first_name,
      last_name: dadosDoLead.last_name,
      fbp: lerCookie('_fbp'),
      fbc: obterFbc(),
      ga_client_id: obterGaClientId(),
      ga_session_id: sessao.ga_session_id,
      ga_session_number: sessao.ga_session_number,
      gclid: atribuicao.gclid,
      gbraid: atribuicao.gbraid,
      wbraid: atribuicao.wbraid,
      utm_source: atribuicao.utm_source,
      utm_medium: atribuicao.utm_medium,
      utm_campaign: atribuicao.utm_campaign,
      utm_term: atribuicao.utm_term,
      utm_content: atribuicao.utm_content,
      /*
       * IP: o JavaScript do navegador NÃO consegue ler o IP do visitante, e
       * não usamos serviços externos de IP. Fica sempre null aqui.
       * É preenchido no SERVIDOR: o contêiner de servidor do GTM lê o IP da
       * requisição (X-Forwarded-For) e a tag da API de Conversões da Meta
       * envia client_ip_address e client_user_agent a partir dela.
       */
      ip_address: null,
      user_agent: navigator.userAgent
    };
  }

  /*
   * Monta o bloco event_data (O QUÊ). Todas as chaves aparecem em todo evento
   * (null quando não se aplicam), para que o GTM nunca reaproveite um valor
   * antigo de um evento anterior.
   */
  function montarEventData(nomeEvento, extra) {
    var dados = {
      event_id: gerarUUID(),
      event_name: nomeEvento,
      event_timestamp: Date.now(),
      event_source_url: window.location.href,
      page_title: document.title,
      page_path: window.location.pathname,
      referrer: document.referrer || null,
      form_id: null,
      form_name: null,
      element_id: null,
      element_label: null,
      element_location: null
    };
    for (var chave in extra) {
      if (Object.prototype.hasOwnProperty.call(extra, chave)) dados[chave] = extra[chave];
    }
    return dados;
  }

  /*
   * >>> CONSENTIMENTO <<<
   * Padrão: tudo "denied" até o seu banner/CMP (LGPD) atualizar. Os nomes
   * seguem o Consent Mode v2 do Google. O banner chama, por exemplo:
   *
   *   window.trackingAtualizarConsentimento({
   *     ad_storage: 'granted', analytics_storage: 'granted',
   *     ad_user_data: 'granted', ad_personalization: 'granted'
   *   }, 'banner');
   *
   * Isso só muda o bloco "consent" dos próximos pushes. Configure também o
   * Consent Mode no GTM (padrão negado + atualização) a partir do banner.
   */
  var estadoConsentimento = {
    consent_source: 'padrao_negado',
    ad_storage: 'denied',
    analytics_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied'
  };

  window.trackingAtualizarConsentimento = function (novo, origem) {
    ['ad_storage', 'analytics_storage', 'ad_user_data', 'ad_personalization'].forEach(function (chave) {
      if (novo && (novo[chave] === 'granted' || novo[chave] === 'denied')) estadoConsentimento[chave] = novo[chave];
    });
    estadoConsentimento.consent_source = origem || 'banner';
  };

  function montarConsent() {
    return {
      consent_source: estadoConsentimento.consent_source,
      ad_storage: estadoConsentimento.ad_storage,
      analytics_storage: estadoConsentimento.analytics_storage,
      ad_user_data: estadoConsentimento.ad_user_data,
      ad_personalization: estadoConsentimento.ad_personalization
    };
  }

  /* Envia um evento no formato padrão. "opcoesGtm" aceita eventCallback/eventTimeout. */
  function enviarEvento(nomeEvento, extraEventData, opcoesGtm) {
    var objeto = {
      event: nomeEvento,
      user_data: montarUserData(),
      event_data: montarEventData(nomeEvento, extraEventData || {}),
      consent: montarConsent()
    };
    if (opcoesGtm) {
      objeto.eventCallback = opcoesGtm.eventCallback;
      objeto.eventTimeout = opcoesGtm.eventTimeout;
    }
    window.dataLayer.push(objeto);
    return objeto;
  }

  function dadosDoElemento(el) {
    return {
      element_id: el.getAttribute('data-track-id'),
      element_label: el.getAttribute('data-track-label'),
      element_location: el.getAttribute('data-track-location')
    };
  }

  /* ------------------------------------------------------------------------
   *  1) page_data — no carregamento de toda página.
   *  O GTM dispara o page_view dele; este evento só entrega os dados.
   * ---------------------------------------------------------------------- */
  var pagina = document.documentElement.getAttribute('data-page');
  capturarFbc();
  enviarEvento('page_data', {});

  /* ------------------------------------------------------------------------
   *  2) cta_click — todo clique em botão ou link com data-track-id.
   * ---------------------------------------------------------------------- */
  document.addEventListener('click', function (evento) {
    var alvo = evento.target.closest ? evento.target.closest('a[data-track-id], button[data-track-id]') : null;
    if (!alvo) return;
    enviarEvento('cta_click', dadosDoElemento(alvo));
  });

  /* ------------------------------------------------------------------------
   *  3) form_start — primeiro foco em qualquer campo do formulário (uma vez).
   * ---------------------------------------------------------------------- */
  var formularioIniciado = false;
  document.addEventListener('focusin', function (evento) {
    if (formularioIniciado) return;
    var form = evento.target.closest ? evento.target.closest('form[data-track-id]') : null;
    if (!form || evento.target === form) return;
    formularioIniciado = true;
    var extra = dadosDoElemento(evento.target);
    extra.form_id = form.id;
    extra.form_name = form.getAttribute('name');
    enviarEvento('form_start', extra);
  });

  /* ------------------------------------------------------------------------
   *  4) Validação e envio do formulário -> generate_lead -> obrigado.html
   *
   *  ATENÇÃO: no modelo o formulário NÃO tem backend. Se o seu tiver, envie os
   *  dados ao seu servidor e só então faça o push generate_lead e redirecione.
   * ---------------------------------------------------------------------- */

  function mostrarErro(campo, mensagem) {
    var caixa = document.getElementById(campo.id + '-erro');
    if (caixa) caixa.textContent = mensagem;
    campo.setAttribute('aria-invalid', mensagem ? 'true' : 'false');
  }

  /* >>> Ajuste aos campos do SEU formulário (aqui: nome, email, telefone, consentimento). */
  function validarFormulario(form) {
    var nome = form.elements.nome;
    var email = form.elements.email;
    var telefone = form.elements.telefone;
    var consentimento = form.elements.consentimento;
    var erros = [];

    var okNome = nome.value.trim().length >= 2;
    mostrarErro(nome, okNome ? '' : 'Digite seu nome (pelo menos 2 letras).');
    if (!okNome) erros.push(nome);

    var okEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizarEmail(email.value));
    mostrarErro(email, okEmail ? '' : 'Digite um e-mail válido, por exemplo nome@empresa.com.');
    if (!okEmail) erros.push(email);

    var digitos = normalizarTelefone(telefone.value);
    var okTelefone = digitos.length >= 12 && digitos.length <= 15;
    mostrarErro(telefone, okTelefone ? '' : 'Digite o telefone com DDD, por exemplo +55 11 91234-5678.');
    if (!okTelefone) erros.push(telefone);

    mostrarErro(consentimento, consentimento.checked ? '' : 'Marque a caixa para autorizar o contato.');
    if (!consentimento.checked) erros.push(consentimento);

    return erros;
  }

  var redirecionando = false;

  document.addEventListener('submit', function (evento) {
    var form = evento.target;
    if (!form.matches || !form.matches('form[data-track-id]')) return;
    evento.preventDefault();
    if (redirecionando) return;

    var erros = validarFormulario(form);
    if (erros.length) {
      erros[0].focus();
      return;
    }

    var nome = normalizarNome(form.elements.nome.value);
    dadosDoLead = {
      email: normalizarEmail(form.elements.email.value),
      phone_number: normalizarTelefone(form.elements.telefone.value),
      first_name: nome.first_name,
      last_name: nome.last_name
    };

    var botao = form.querySelector('[type="submit"]');
    var extra = dadosDoElemento(botao);
    extra.form_id = form.id;
    extra.form_name = form.getAttribute('name');

    redirecionando = true;
    botao.disabled = true;
    botao.textContent = 'Enviando…';

    function irParaObrigado() {
      if (irParaObrigado.feito) return;
      irParaObrigado.feito = true;
      window.location.href = PAGINA_OBRIGADO;
    }

    /*
     * eventCallback: o GTM chama esta função quando terminou de processar o
     * evento (tags disparadas). eventTimeout: limite do próprio GTM.
     * O setTimeout extra garante o redirecionamento mesmo se o GTM não
     * carregou (ex.: ID ainda é GTM-XXXXXXX ou bloqueador de anúncios).
     */
    var enviado = enviarEvento('generate_lead', extra, {
      eventCallback: irParaObrigado,
      eventTimeout: TEMPO_MAXIMO_GTM_MS
    });
    setTimeout(irParaObrigado, TEMPO_MAXIMO_GTM_MS + 200);

    /* Leva o event_id e os dados do lead para a página de obrigado (apagados lá depois do push). */
    try {
      window.sessionStorage.setItem(CHAVE_LEAD, JSON.stringify({
        event_id: enviado.event_data.event_id,
        form_id: extra.form_id,
        form_name: extra.form_name,
        lead: dadosDoLead
      }));
    } catch (e) { /* sessionStorage indisponível: a página de obrigado não terá o lead */ }
  });

  /* ------------------------------------------------------------------------
   *  5) lead_confirmed — só em obrigado.html e só se veio de um envio real.
   *  Reaproveita o event_id do generate_lead (deduplicação navegador/servidor).
   *  Abrir ou recarregar obrigado.html diretamente NÃO gera conversão.
   * ---------------------------------------------------------------------- */
  if (pagina === 'obrigado') {
    var salvo = null;
    try { salvo = JSON.parse(window.sessionStorage.getItem(CHAVE_LEAD) || 'null'); } catch (e) { salvo = null; }

    if (salvo && salvo.event_id) {
      dadosDoLead = salvo.lead;
      enviarEvento('lead_confirmed', {
        event_id: salvo.event_id,
        form_id: salvo.form_id,
        form_name: salvo.form_name,
        element_id: 'obrigado-titulo',
        element_label: 'Título da página de obrigado: prova de que o formulário foi enviado',
        element_location: 'obrigado'
      });

      /* Apaga os dados pessoais da sessão e da memória para não ficarem guardados. */
      try { window.sessionStorage.removeItem(CHAVE_LEAD); } catch (e) { /* indisponível */ }
      dadosDoLead = { email: '', phone_number: '', first_name: '', last_name: '' };
    }

    document.addEventListener('DOMContentLoaded', function () {
      var caixa = document.getElementById('obrigado-event-id');
      if (!caixa) return;
      caixa.textContent = salvo && salvo.event_id
        ? salvo.event_id
        : 'nenhum envio nesta sessão (página aberta diretamente: nenhuma conversão registrada)';
    });
  }
})();
