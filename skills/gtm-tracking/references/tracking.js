(function () {
  'use strict';

  var PAGINA_OBRIGADO = 'obrigado.html';

  var TEMPO_MAXIMO_GTM_MS = 1000;

  var CHAVE_EXTERNAL_ID = 'trk_external_id';
  var CHAVE_ATRIBUICAO = 'trk_atribuicao';
  var CHAVE_LEAD = 'trk_lead_enviado';
  var CHAVE_FBC_RESERVA = 'trk_fbc';

  var FBC_DIAS = 90;

  var PARAMETROS_ATRIBUICAO = [
    'gclid', 'gbraid', 'wbraid',
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'
  ];

  window.dataLayer = window.dataLayer || [];

  function lerCookie(nome) {
    try {
      var partes = document.cookie ? document.cookie.split('; ') : [];
      for (var i = 0; i < partes.length; i++) {
        var igual = partes[i].indexOf('=');
        if (partes[i].substring(0, igual) === nome) {
          return decodeURIComponent(partes[i].substring(igual + 1));
        }
      }
    } catch (e) {}
    return null;
  }

  function gravarCookie(nome, valor, dias) {
    try {
      var expira = new Date(Date.now() + dias * 864e5).toUTCString();
      document.cookie = nome + '=' + encodeURIComponent(valor) +
        '; expires=' + expira + '; path=/; SameSite=Lax';
    } catch (e) {}
  }

  function lerCookieBruto(nome) {
    try {
      var partes = document.cookie ? document.cookie.split('; ') : [];
      for (var i = 0; i < partes.length; i++) {
        var igual = partes[i].indexOf('=');
        if (partes[i].substring(0, igual) === nome) return partes[i].substring(igual + 1);
      }
    } catch (e) {}
    return null;
  }

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
    } catch (e) {}
    return dominioRegistravelCache;
  }

  function lerLocal(chave) {
    try { return window.localStorage.getItem(chave); } catch (e) { return null; }
  }

  function gravarLocal(chave, valor) {
    try { window.localStorage.setItem(chave, valor); } catch (e) {}
  }

  function lerSessao(chave) {
    try { return window.sessionStorage.getItem(chave); } catch (e) { return null; }
  }

  function gravarSessao(chave, valor) {
    try { window.sessionStorage.setItem(chave, valor); } catch (e) {}
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

  function normalizarEmail(email) {
    return (email || '').trim().toLowerCase();
  }

  function normalizarTelefone(telefone) {
    var texto = (telefone || '').trim();
    var digitos = texto.replace(/\D/g, '');
    if (!digitos) return '';
    if (texto.charAt(0) !== '+' && (digitos.length === 10 || digitos.length === 11)) {
      digitos = '55' + digitos;
    }
    return '+' + digitos;
  }

  function normalizarNome(nome) {
    var partes = (nome || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
    return {
      first_name: partes[0] || '',
      last_name: partes.slice(1).join(' ')
    };
  }

  function obterExternalId() {
    var id = lerCookie(CHAVE_EXTERNAL_ID) || lerLocal(CHAVE_EXTERNAL_ID);
    if (!id) {
      id = gerarUUID();
    }
    gravarCookie(CHAVE_EXTERNAL_ID, id, 400);
    gravarLocal(CHAVE_EXTERNAL_ID, id);
    return id;
  }

  var FBC_FORMATO = /^fb\.(\d+)\.(\d+)\.(.+)$/;

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

  function fbclidAceitavel(fbclid) {
    return !!fbclid && /^[\x21-\x7E]+$/.test(fbclid) && !/[;,"\\]/.test(fbclid);
  }

  function lerFbc(valor) {
    var partes = valor ? FBC_FORMATO.exec(valor) : null;
    return partes ? { valor: valor, criadoEm: Number(partes[2]), fbclid: partes[3] } : null;
  }

  function mesmoClique(fbc, fbclid) {
    return fbc.fbclid === fbclid || fbc.fbclid.indexOf(fbclid + '.') === 0;
  }

  function reservaFbc() {
    var fbc = lerFbc(lerSessao(CHAVE_FBC_RESERVA)) || lerFbc(lerLocal(CHAVE_FBC_RESERVA));
    if (!fbc) return null;
    var idade = Date.now() - fbc.criadoEm;
    return idade >= 0 && idade <= FBC_DIAS * 864e5 ? fbc : null;
  }

  function gravarFbc(fbc) {
    try {
      var dominio = dominioRegistravel();
      document.cookie = '_fbc=' + fbc.valor +
        '; expires=' + new Date(fbc.criadoEm + FBC_DIAS * 864e5).toUTCString() +
        '; path=/; SameSite=Lax' + (dominio ? '; domain=' + dominio : '');
    } catch (e) {}
    gravarSessao(CHAVE_FBC_RESERVA, fbc.valor);
    gravarLocal(CHAVE_FBC_RESERVA, fbc.valor);
  }

  var FBC_SUBDOMAIN_INDEX = 1;

  function capturarFbc() {
    var fbclid = parametroUrlBruto('fbclid');
    var doCookie = lerFbc(lerCookieBruto('_fbc'));

    if (fbclidAceitavel(fbclid)) {
      var conhecido = doCookie || reservaFbc();
      if (conhecido && mesmoClique(conhecido, fbclid)) {
        if (!doCookie) gravarFbc(conhecido);
        return;
      }
      var agora = Date.now();
      gravarFbc({ valor: 'fb.' + FBC_SUBDOMAIN_INDEX + '.' + agora + '.' + fbclid, criadoEm: agora, fbclid: fbclid });
      return;
    }

    if (doCookie) {
      gravarSessao(CHAVE_FBC_RESERVA, doCookie.valor);
      gravarLocal(CHAVE_FBC_RESERVA, doCookie.valor);
    }
  }

  function obterFbc() {
    var doCookie = lerFbc(lerCookieBruto('_fbc'));
    if (doCookie) return doCookie.valor;
    var reserva = reservaFbc();
    return reserva ? reserva.valor : null;
  }

  function obterGaClientId() {
    var ga = lerCookie('_ga');
    if (!ga) return null;
    var partes = ga.split('.');
    return partes.length >= 4 ? partes.slice(-2).join('.') : null;
  }

  function gclidDoCookie() {
    var valor = lerCookie('_gcl_aw');
    if (!valor) return null;
    var partes = valor.split('.');
    return partes.length >= 3 ? partes.slice(2).join('.') : null;
  }

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

  var dadosDoLead = { email: '', phone_number: '', first_name: '', last_name: '' };

  function montarUserData() {
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
      gclid: atribuicao.gclid,
      gbraid: atribuicao.gbraid,
      wbraid: atribuicao.wbraid,
      utm_source: atribuicao.utm_source,
      utm_medium: atribuicao.utm_medium,
      utm_campaign: atribuicao.utm_campaign,
      utm_term: atribuicao.utm_term,
      utm_content: atribuicao.utm_content,
      ip_address: null,
      user_agent: navigator.userAgent
    };
  }

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

  var pagina = document.documentElement.getAttribute('data-page');
  capturarFbc();
  enviarEvento('page_data', {});

  document.addEventListener('click', function (evento) {
    var alvo = evento.target.closest ? evento.target.closest('a[data-track-id], button[data-track-id]') : null;
    if (!alvo) return;
    enviarEvento('cta_click', dadosDoElemento(alvo));
  });

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

  function mostrarErro(campo, mensagem) {
    var caixa = document.getElementById(campo.id + '-erro');
    if (caixa) caixa.textContent = mensagem;
    campo.setAttribute('aria-invalid', mensagem ? 'true' : 'false');
  }

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

    var okTelefone = /^\+[1-9]\d{9,14}$/.test(normalizarTelefone(telefone.value));
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

    var enviado = enviarEvento('generate_lead', extra, {
      eventCallback: irParaObrigado,
      eventTimeout: TEMPO_MAXIMO_GTM_MS
    });
    setTimeout(irParaObrigado, TEMPO_MAXIMO_GTM_MS + 200);

    try {
      window.sessionStorage.setItem(CHAVE_LEAD, JSON.stringify({
        event_id: enviado.event_data.event_id,
        form_id: extra.form_id,
        form_name: extra.form_name,
        lead: dadosDoLead
      }));
    } catch (e) {}
  });

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

      try { window.sessionStorage.removeItem(CHAVE_LEAD); } catch (e) {}
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
