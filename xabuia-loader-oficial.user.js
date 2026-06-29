// ==UserScript==
// @name         Xabuia • Loader oficial
// @namespace    xabuia/infradesk
// @version      1.0.0
// @description  Carrega sempre a versão publicada do Xabuia direto do GitHub Pages.
// @author       Xabuia
// @match        https://asp.infradesk.app/backend/chamados/painel*
// @match        https://asp.infradesk.app/backend/chamados*
// @run-at       document-end
// @icon         https://chamadossicofe-design.github.io/xabuia/xabuia.png
// @homepageURL  https://chamadossicofe-design.github.io/xabuia/
// @grant        GM_xmlhttpRequest
// @connect      chamadossicofe-design.github.io
// @require      https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js
// @require      https://www.gstatic.com/firebasejs/10.12.5/firebase-auth-compat.js
// @require      https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore-compat.js
// ==/UserScript==

(function () {
  'use strict';

  const XABUIA_REMOTE_URL = 'https://chamadossicofe-design.github.io/xabuia/xabuiaasp.js';

  function cacheBustUrl(url) {
    return `${url}${String(url).includes('?') ? '&' : '?'}xabuia_loader=${Date.now()}`;
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
    box.style.cssText = 'position:fixed;inset:auto 18px 18px auto;z-index:2147483647;max-width:430px;background:#7f1d1d;color:#fff;padding:14px 16px;border-radius:14px;box-shadow:0 18px 45px rgba(0,0,0,.25);font-family:Arial,sans-serif;font-size:13px;line-height:1.4';
    box.innerHTML = `<strong>Xabuia não carregou</strong><br>${String(message || 'Falha desconhecida.')}`;
    document.body.appendChild(box);
  }

  function loadRemoteXabuia() {
    GM_xmlhttpRequest({
      method: 'GET',
      url: cacheBustUrl(XABUIA_REMOTE_URL),
      nocache: true,
      revalidate: true,
      timeout: 20000,
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache'
      },
      onload(response) {
        try {
          if (response.status < 200 || response.status >= 300 || !response.responseText) {
            throw new Error(`HTTP ${response.status || 'sem resposta'} ao baixar o Xabuia.`);
          }

          const remoteCode = String(response.responseText || '');
          const remoteVersion = extractMetaVersion(remoteCode) || 'remota';

          window.__XABUIA_REMOTE_LOADER_ACTIVE = true;
          window.__XABUIA_REMOTE_VERSION = remoteVersion;

          console.log(`[Xabuia Loader] Carregando versão publicada: ${remoteVersion}`);
          eval(`${remoteCode}\n//# sourceURL=${XABUIA_REMOTE_URL}`);
        } catch (error) {
          console.error('[Xabuia Loader] Erro ao executar Xabuia remoto:', error);
          showLoaderError(error?.message || 'Erro ao executar o Xabuia remoto.');
        }
      },
      onerror() {
        showLoaderError('Falha de rede ao baixar o Xabuia do GitHub Pages.');
      },
      ontimeout() {
        showLoaderError('Tempo esgotado ao baixar o Xabuia do GitHub Pages.');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadRemoteXabuia, { once: true });
  } else {
    loadRemoteXabuia();
  }
})();
