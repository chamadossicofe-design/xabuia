// ==UserScript==
// @name         Xabuia • Loader oficial InfraDesk
// @namespace    xabuia/infradesk-loader
// @version      3.1.0
// @description  Loader fixo: carrega o Xabuia atualizado do GitHub Pages a cada abertura, sem cache de @require para o aplicativo.
// @author       Xabuia
// @match        https://*.infradesk.app/backend/chamados*
// @run-at       document-end
// @noframes
// @sandbox      raw
// @icon         https://chamadossicofe-design.github.io/xabuia/xabuia.png
// @homepageURL  https://chamadossicofe-design.github.io/xabuia/
// @updateURL    https://chamadossicofe-design.github.io/xabuia/xabuia-loader-oficial.user.js
// @downloadURL  https://chamadossicofe-design.github.io/xabuia/xabuia-loader-oficial.user.js
// @grant        none
// @require      https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js
// @require      https://www.gstatic.com/firebasejs/10.12.5/firebase-auth-compat.js
// @require      https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore-compat.js
// ==/UserScript==
//
// ATENÇÃO: não acrescentar @require para xabuiaasp.js.
// O aplicativo é carregado pelo bloco independente abaixo, com URL nova a
// cada abertura. Não são usados fetch, eval, nem injeção de código inline.
//
// Arquivo: xabuia-loader-oficial.user.js
(function () {
  'use strict';

  // =========================================================================
  // LOADER FIXO XABUIA — INDEPENDENTE DAS FUNÇÕES DO APLICATIVO
  // =========================================================================
  const LOADER_VERSION = '3.1.0';
  const APP_URL = 'https://chamadossicofe-design.github.io/xabuia/xabuiaasp.js';
  const XABUIA_ICON_URL = 'https://chamadossicofe-design.github.io/xabuia/xabuia.png';
  const PREFIXO = '[Xabuia Loader]';
  const ERRO_ID = 'xabuia-loader-error';
  const SCRIPT_ID = 'xabuia-loader-script-remoto';
  const FLAG_LOADER = '__XABUIA_LOADER_FIXO_ATIVO__';
  const INTERVALO_MS = 250;
  const MAX_TENTATIVAS = 60;
  const TEMPO_LIMITE_REDE_MS = 20000;

  if (window[FLAG_LOADER]) {
    console.warn(PREFIXO, 'O loader já foi iniciado nesta aba; ignorando execução duplicada.');
    return;
  }
  window[FLAG_LOADER] = true;

  // Preserva os sinais utilizados pelo loader anterior e indica ao aplicativo
  // que sua execução ocorreu no contexto da página.
  window.__XABUIA_LOADER_PAGE_CONTEXT_ACTIVE__ = true;
  window.__XABUIA_REMOTE_LOADER_ACTIVE__ = true;
  window.__XABUIA_LOADER_VERSION__ = LOADER_VERSION;
  window.__XABUIA_LOADER_UPDATE_URL__ =
    'https://chamadossicofe-design.github.io/xabuia/xabuia-loader-oficial.user.js';
  window.__XABUIA_LOADER_READY__ = false;

  const diagnostico = {
    loaderVersion: LOADER_VERSION,
    origem: APP_URL,
    requisitada: '',
    etapa: 'iniciando',
    firebase: false,
    aplicativo: false,
    estilo: false,
    janela: false,
    moduloKanban: false,
    erro: '',
    carregadoEm: ''
  };
  window.__XABUIA_LOADER_DIAGNOSTICO__ = diagnostico;

  function atualizarDiagnostico() {
    diagnostico.firebase = Boolean(window.firebase?.auth && window.firebase?.firestore);
    diagnostico.aplicativo = Boolean(window.__XABUIA_APP_RUNNING__);
    diagnostico.estilo = Boolean(document.getElementById('xabuia-tm-style'));
    diagnostico.janela = Boolean(document.getElementById('xabuia-overlay'));
    diagnostico.moduloKanban = Boolean(
      document.getElementById('xabuia-kanban-controles-visuais-v1') ||
      document.getElementById('xabuia-kanban-controles-visuais-v1-1')
    );
  }

  function carregamentoRealConcluido() {
    atualizarDiagnostico();
    return diagnostico.aplicativo && diagnostico.estilo && diagnostico.janela;
  }

  function removerErro() {
    document.getElementById(ERRO_ID)?.remove();
  }

  function mostrarErro(mensagem) {
    atualizarDiagnostico();
    diagnostico.etapa = 'erro';
    diagnostico.erro = mensagem;
    window.__XABUIA_LOADER_READY__ = false;
    console.error(PREFIXO, mensagem, { ...diagnostico });

    let caixa = document.getElementById(ERRO_ID);
    if (!caixa) {
      caixa = document.createElement('div');
      caixa.id = ERRO_ID;
      caixa.style.cssText =
        'position:fixed;right:18px;bottom:18px;z-index:2147483647;' +
        'max-width:480px;padding:14px 16px;border-radius:14px;' +
        'color:#fff;background:#7f1d1d;box-shadow:0 18px 45px #0005;' +
        'font:13px/1.45 Arial,sans-serif';
      (document.body || document.documentElement).appendChild(caixa);
    }

    // TextContent mantém a mensagem segura (sem interpretar HTML remoto).
    caixa.textContent =
      'Xabuia não terminou de carregar. ' + mensagem +
      ' Consulte no Console: window.__XABUIA_LOADER_DIAGNOSTICO__';
  }

  function anunciarPronto() {
    if (window.__XABUIA_LOADER_READY__) return;
    atualizarDiagnostico();
    removerErro();
    diagnostico.etapa = 'pronto';
    diagnostico.erro = '';
    diagnostico.carregadoEm = new Date().toISOString();
    window.__XABUIA_LOADER_READY__ = true;

    const versaoAplicativo = String(window.__XABUIA_REMOTE_VERSION || '');
    window.dispatchEvent(new CustomEvent('xabuia:loader-ready', {
      detail: {
        loaderVersion: LOADER_VERSION,
        xabuiaVersion: versaoAplicativo,
        origem: APP_URL
      }
    }));

    console.info(PREFIXO,
      'Pronto. Loader ' + LOADER_VERSION +
      (versaoAplicativo ? ' · Xabuia ' + versaoAplicativo : ' · Xabuia carregado') +
      ' · módulo Kanban: ' + (diagnostico.moduloKanban ? 'instalado' : 'não encontrado') +
      ' · origem: ' + APP_URL);
  }

  function verificarMontagem() {
    if (carregamentoRealConcluido()) {
      anunciarPronto();
      return;
    }

    let tentativas = 0;
    const temporizador = window.setInterval(function () {
      if (carregamentoRealConcluido()) {
        window.clearInterval(temporizador);
        anunciarPronto();
        return;
      }

      tentativas += 1;
      if (tentativas >= MAX_TENTATIVAS) {
        window.clearInterval(temporizador);
        mostrarErro('O arquivo remoto foi obtido, mas a interface do Xabuia não terminou de iniciar.');
      }
    }, INTERVALO_MS);
  }

  function iniciar() {
    if (window.__XABUIA_APP_RUNNING__) {
      mostrarErro('Já existe um Xabuia em execução nesta aba. Desative loaders duplicados ou atualize o loader antigo no Tampermonkey.');
      return;
    }

    atualizarDiagnostico();
    if (!diagnostico.firebase) {
      mostrarErro('Firebase não está disponível. Confira os três @require das bibliotecas Firebase.');
      return;
    }

    // Cache-busting em cada abertura, sem @require do aplicativo:
    // publica-se sempre o mesmo xabuiaasp.js no GitHub Pages.
    const url = APP_URL + '?_xabuia_atual=' + Date.now() + '-' +
      Math.floor(Math.random() * 1000000000);
    diagnostico.requisitada = url;
    diagnostico.etapa = 'carregando';

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = url;
    script.async = false;

    // Alguns sites utilizam nonce em suas políticas de segurança (CSP).
    const scriptComNonce = document.querySelector('script[nonce]');
    const nonce = scriptComNonce?.nonce || scriptComNonce?.getAttribute('nonce') || '';
    if (nonce) script.setAttribute('nonce', nonce);

    let concluido = false;
    const limite = window.setTimeout(function () {
      if (concluido) return;
      concluido = true;
      mostrarErro('A busca do GitHub Pages excedeu 20 segundos. Verifique conexão, publicação ou bloqueio da página.');
    }, TEMPO_LIMITE_REDE_MS);

    script.addEventListener('load', function () {
      if (concluido) return;
      concluido = true;
      window.clearTimeout(limite);
      diagnostico.etapa = 'arquivo-carregado';
      verificarMontagem();
    }, { once: true });

    script.addEventListener('error', function () {
      if (concluido) return;
      concluido = true;
      window.clearTimeout(limite);
      mostrarErro('Falha ao carregar o aplicativo remoto. Verifique se o arquivo existe ou se o InfraDesk bloqueou a URL por CSP.');
    }, { once: true });

    (document.head || document.documentElement).appendChild(script);
    console.info(PREFIXO, 'Buscando Xabuia atualizado:', url);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar, { once: true });
  } else {
    iniciar();
  }
})();
