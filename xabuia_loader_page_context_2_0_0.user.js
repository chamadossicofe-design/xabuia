// ==UserScript==
// @name         Xabuia • Loader oficial page-context
// @namespace    xabuia/infradesk
// @version      2.0.0
// @description  Carrega a versão publicada do Xabuia no contexto da página para preservar login Google e atualização centralizada.
// @author       Xabuia
// @match        https://*.infradesk.app/backend/chamados/painel*
// @match        https://*.infradesk.app/backend/chamados*
// @run-at       document-end
// @icon         https://chamadossicofe-design.github.io/xabuia/xabuia.png
// @homepageURL  https://chamadossicofe-design.github.io/xabuia/
// @grant        none
// @require      https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js
// @require      https://www.gstatic.com/firebasejs/10.12.5/firebase-auth-compat.js
// @require      https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore-compat.js
// ==/UserScript==

(function () {
  'use strict';

  const XABUIA_REMOTE_URL = 'https://chamadossicofe-design.github.io/xabuia/xabuiaasp1.js';
  const XABUIA_ICON_URL = 'https://chamadossicofe-design.github.io/xabuia/xabuia.png';

  if (window.__XABUIA_LOADER_PAGE_CONTEXT_ACTIVE__) {
    console.warn('[Xabuia Loader] Loader já está ativo nesta página. Ignorando segunda carga.');
    return;
  }
  window.__XABUIA_LOADER_PAGE_CONTEXT_ACTIVE__ = true;

  function cacheBustUrl(url) {
    return `${url}${String(url).includes('?') ? '&' : '?'}xabuia_loader_page=${Date.now()}`;
  }

  function extractMetaVersion(scriptText) {
    const match = String(scriptText || '').match(/\/\/\s*@version\s+([^\s]+)/i);
    return match ? match[1].trim() : '';
  }

  function showLoaderError(message) {
    const old = document.getElementById('xabuia-loader-error');
    if (old) old.remove();

    const box = document.createElement('div');
    box.id = 'xabuia-loader-error';
    box.style.cssText = 'position:fixed;inset:auto 18px 18px auto;z-index:2147483647;max-width:460px;background:#7f1d1d;color:#fff;padding:14px 16px;border-radius:14px;box-shadow:0 18px 45px rgba(0,0,0,.25);font-family:Arial,sans-serif;font-size:13px;line-height:1.4';
    box.innerHTML = `<div style="display:flex;gap:10px;align-items:center;margin-bottom:6px"><img src="${XABUIA_ICON_URL}" alt="" style="width:26px;height:26px;border-radius:7px"><strong>Xabuia não carregou</strong></div>${String(message || 'Falha desconhecida.')}`;
    document.body.appendChild(box);
  }

  function alreadyHasXabuiaUi() {
    return !!(document.getElementById('xabuia-overlay') || document.getElementById('xabuia-tm-style') || window.__XABUIA_APP_RUNNING__);
  }

  function executeRemoteCode(remoteCode, remoteVersion) {
    if (alreadyHasXabuiaUi()) {
      console.warn('[Xabuia Loader] Xabuia já parece estar carregado. Não vou executar novamente.');
      return;
    }

    window.__XABUIA_REMOTE_LOADER_ACTIVE = true;
    window.__XABUIA_REMOTE_VERSION = remoteVersion || 'remota';

    const prelude = [
      'window.__XABUIA_REMOTE_LOADER_ACTIVE = true;',
      `window.__XABUIA_REMOTE_VERSION = ${JSON.stringify(remoteVersion || 'remota')};`
    ].join('\n');

    console.log(`[Xabuia Loader] Executando versão publicada no contexto da página: ${remoteVersion || 'remota'}`);
    (0, eval)(`${prelude}\n${remoteCode}\n//# sourceURL=${XABUIA_REMOTE_URL}`);
  }

  async function loadByFetchEval() {
    const response = await fetch(cacheBustUrl(XABUIA_REMOTE_URL), {
      cache: 'no-store',
      credentials: 'omit',
      mode: 'cors'
    });

    if (!response.ok) throw new Error(`HTTP ${response.status || 'sem resposta'} ao baixar o Xabuia.`);

    const remoteCode = await response.text();
    if (!remoteCode || !remoteCode.includes('Xabuia')) throw new Error('Arquivo remoto vazio ou inválido.');

    executeRemoteCode(remoteCode, extractMetaVersion(remoteCode));
  }

  function loadByScriptTagFallback() {
    return new Promise((resolve, reject) => {
      if (alreadyHasXabuiaUi()) {
        resolve();
        return;
      }

      window.__XABUIA_REMOTE_LOADER_ACTIVE = true;
      window.__XABUIA_REMOTE_VERSION = 'remota-script-tag';

      const script = document.createElement('script');
      script.src = cacheBustUrl(XABUIA_REMOTE_URL);
      script.async = false;
      script.onload = () => {
        console.log('[Xabuia Loader] Xabuia carregado por script tag fallback.');
        resolve();
      };
      script.onerror = () => reject(new Error('Fallback por script tag também falhou. Pode ser bloqueio de rede/CSP.'));
      (document.head || document.documentElement).appendChild(script);
    });
  }

  async function loadRemoteXabuia() {
    try {
      await loadByFetchEval();
    } catch (fetchError) {
      console.warn('[Xabuia Loader] Fetch/eval falhou; tentando fallback por script tag:', fetchError);
      try {
        await loadByScriptTagFallback();
      } catch (fallbackError) {
        console.error('[Xabuia Loader] Erro ao carregar Xabuia remoto:', fallbackError);
        showLoaderError(`${fetchError?.message || 'Falha no carregamento principal.'}<br>${fallbackError?.message || ''}`);
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadRemoteXabuia, { once: true });
  } else {
    loadRemoteXabuia();
  }
})();
