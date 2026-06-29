// ==UserScript==
// @name         Xabuia • Infradesk → Firestore manual econômico
// @namespace    xabuia/infradesk
// @version      3.2.3
// @description  Abre/atualiza chamados Xabuia direto do card do Infradesk. Não monitora desconhecidos; só acompanha chamados abertos pelo usuário e ativos na tela.
// @author       Xabuia
// @match        https://asp.infradesk.app/backend/chamados/painel*
// @match        https://asp.infradesk.app/backend/chamados*
// @run-at       document-end
// @icon         https://chamadossicofe-design.github.io/xabuia/xabuia.png
// @homepageURL  https://chamadossicofe-design.github.io/xabuia/
// @updateURL    https://chamadossicofe-design.github.io/xabuia/xabuiaasp.js
// @downloadURL  https://chamadossicofe-design.github.io/xabuia/xabuiaasp.js
// @grant        GM_info
// @grant        GM_xmlhttpRequest
// @connect      chamadossicofe-design.github.io
// @require      https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js
// @require      https://www.gstatic.com/firebasejs/10.12.5/firebase-auth-compat.js
// @require      https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore-compat.js
// ==/UserScript==

(function () {
  'use strict';

  /********************************************************************
   * CONFIGURAÇÕES
   ********************************************************************/
  const XABUIA_VERSION = (typeof GM_info !== 'undefined' && GM_info?.script?.version) ? GM_info.script.version : '3.2.3';
  const XABUIA_ICON_URL = 'https://chamadossicofe-design.github.io/xabuia/xabuia.png';
  const XABUIA_UPDATE_URL = 'https://chamadossicofe-design.github.io/xabuia/xabuiaasp.js';
  const XABUIA_VERSION_CHECK_EVERY_MS = 1000 * 60 * 60 * 4; // 4 horas = até 6 verificações por dia
  const XABUIA_UPDATE_CACHE_KEY = 'xabuia_force_update_cache_v1';
  const BOOTSTRAP_ADMIN_EMAIL = 'chamadossicofe@gmail.com';
  const XABUIA_CACHE_KEY = 'xabuia_tm_cache_v23_manual';
  const XABUIA_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7;
  const XABUIA_PROFILE_CACHE_TTL_MS = 1000 * 60 * 60 * 12;
  const XABUIA_PROFILE_CACHE_PREFIX = 'xabuia_tm_profile_v23_';
  const XABUIA_TARGET_STATUS_ID = '6';
  const XABUIA_TARGET_STATUS_DESC = 'em analise terceiro';

  const firebaseConfig = {
    apiKey: 'AIzaSyADfd6RhNN6rj6qX1judbjevvh-ZwMwmJE',
    authDomain: 'chamadossicofe-36fbe.firebaseapp.com',
    projectId: 'chamadossicofe-36fbe',
    storageBucket: 'chamadossicofe-36fbe.firebasestorage.app',
    messagingSenderId: '81395419196',
    appId: '1:81395419196:web:8322d61652f6240b49db39'
  };

  /********************************************************************
   * TRAVA DE ATUALIZAÇÃO OBRIGATÓRIA
   * Lê o MESMO xabuiaasp.js publicado no GitHub Pages.
   * Se existir @version maior, bloqueia o uso até atualizar.
   ********************************************************************/
  const versionGateState = {
    blocked: false,
    latestVersion: '',
    checking: null
  };

  function readUpdateCache() {
    try { return JSON.parse(localStorage.getItem(XABUIA_UPDATE_CACHE_KEY) || '{}') || {}; } catch (_) { return {}; }
  }

  function writeUpdateCache(data) {
    try { localStorage.setItem(XABUIA_UPDATE_CACHE_KEY, JSON.stringify(data || {})); } catch (_) {}
  }

  function extractMetaVersion(scriptText) {
    const match = String(scriptText || '').match(/\/\/\s*@version\s+([^\s]+)/i);
    return match ? match[1].trim() : '';
  }

  function compareVersions(installed, latest) {
    const a = String(installed || '0').match(/\d+/g)?.map(Number) || [0];
    const b = String(latest || '0').match(/\d+/g)?.map(Number) || [0];
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i += 1) {
      const left = a[i] || 0;
      const right = b[i] || 0;
      if (left > right) return 1;
      if (left < right) return -1;
    }
    return 0;
  }

  function cacheBustUrl(url) {
    return `${url}${String(url).includes('?') ? '&' : '?'}xabuia_update_check=${Date.now()}`;
  }

  function tampermonkeyInstallUrl(url) {
    return `https://www.tampermonkey.net/script_installation.php#url=${encodeURIComponent(cacheBustUrl(url))}`;
  }

  function getRemoteScriptText(url) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest !== 'function') {
        reject(new Error('GM_xmlhttpRequest indisponível. Atualize/reinstale o script Xabuia.'));
        return;
      }

      GM_xmlhttpRequest({
        method: 'GET',
        url: cacheBustUrl(url),
        nocache: true,
        revalidate: true,
        timeout: 15000,
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache'
        },
        onload(response) {
          if (response.status >= 200 && response.status < 300 && response.responseText) {
            resolve(response.responseText);
          } else {
            reject(new Error(`Não consegui consultar a versão publicada. HTTP ${response.status}`));
          }
        },
        onerror() { reject(new Error('Falha de rede ao consultar a versão publicada.')); },
        ontimeout() { reject(new Error('Tempo esgotado ao consultar a versão publicada.')); }
      });
    });
  }

  function xabuiaIsUpdateBlocked() {
    const cache = readUpdateCache();
    const latest = versionGateState.latestVersion || cache.latestVersion || '';
    if (latest && compareVersions(XABUIA_VERSION, latest) < 0) {
      versionGateState.blocked = true;
      versionGateState.latestVersion = latest;
      return true;
    }
    return versionGateState.blocked;
  }

  function removeXabuiaUiForUpdateBlock() {
    document.querySelectorAll('.xabuia-card-btn,.xabuia-box').forEach((el) => el.remove());
    const modal = document.getElementById('xabuia-overlay');
    if (modal) modal.classList.remove('open');
  }

  function showXabuiaUpdateBlock(latestVersion = '') {
    versionGateState.blocked = true;
    if (latestVersion) versionGateState.latestVersion = latestVersion;
    removeXabuiaUiForUpdateBlock();

    let overlay = document.getElementById('xabuia-force-update-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'xabuia-force-update-overlay';
      overlay.innerHTML = `
        <div class="xabuia-force-update-card">
          <img src="${XABUIA_ICON_URL}" alt="Xabuia">
          <h2>Atualização obrigatória do Xabuia</h2>
          <p>Existe uma versão nova publicada. Para evitar erro e manter todos no mesmo padrão, esta versão instalada foi bloqueada.</p>
          <div class="xabuia-force-update-versions">
            <span>Instalada: <strong id="xabuia-installed-version"></strong></span>
            <span>Publicada: <strong id="xabuia-latest-version"></strong></span>
          </div>
          <button id="xabuia-update-now" type="button">Atualizar agora</button>
          <button id="xabuia-reload-after-update" type="button">Já atualizei, recarregar página</button>
          <small>Na tela do Tampermonkey, clique em Atualizar/Instalar. Depois recarregue esta página do Infradesk.</small>
        </div>
      `;

      const style = document.createElement('style');
      style.id = 'xabuia-force-update-style';
      style.textContent = `
        #xabuia-force-update-overlay{position:fixed;inset:0;z-index:2147483647;background:rgba(15,23,42,.78);display:flex;align-items:center;justify-content:center;padding:20px;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        .xabuia-force-update-card{width:min(480px,calc(100vw - 32px));background:#fff;border-radius:22px;box-shadow:0 28px 80px rgba(0,0,0,.34);padding:24px;text-align:center;color:#172033}
        .xabuia-force-update-card img{width:62px;height:62px;border-radius:16px;margin-bottom:10px}
        .xabuia-force-update-card h2{font-size:22px;margin:6px 0 8px;color:#111827}
        .xabuia-force-update-card p{font-size:14px;line-height:1.45;color:#475569;margin:0 0 14px}
        .xabuia-force-update-versions{display:grid;gap:6px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:10px;margin:12px 0 16px;text-align:left;font-size:13px}
        .xabuia-force-update-card button{width:100%;border:0;border-radius:14px;min-height:44px;padding:10px 14px;font-weight:900;cursor:pointer;margin-top:8px}
        #xabuia-update-now{background:#155eef;color:#fff}
        #xabuia-reload-after-update{background:#f8fafc;color:#172033;border:1px solid #dfe7f0}
        .xabuia-force-update-card small{display:block;color:#64748b;margin-top:12px;font-size:12px}
      `;
      document.head.appendChild(style);
      document.body.appendChild(overlay);

      document.getElementById('xabuia-update-now')?.addEventListener('click', () => {
        window.open(tampermonkeyInstallUrl(XABUIA_UPDATE_URL), '_blank', 'noopener,noreferrer');
      });

      document.getElementById('xabuia-reload-after-update')?.addEventListener('click', () => {
        window.location.reload();
      });
    }

    const installedEl = document.getElementById('xabuia-installed-version');
    const latestEl = document.getElementById('xabuia-latest-version');
    if (installedEl) installedEl.textContent = XABUIA_VERSION || 'desconhecida';
    if (latestEl) latestEl.textContent = versionGateState.latestVersion || latestVersion || 'consultando...';
  }

  function clearXabuiaUpdateBlockIfCurrent() {
    const cache = readUpdateCache();
    const latest = versionGateState.latestVersion || cache.latestVersion || '';
    if (!latest || compareVersions(XABUIA_VERSION, latest) >= 0) {
      versionGateState.blocked = false;
      document.getElementById('xabuia-force-update-overlay')?.remove();
    }
  }

  async function checkXabuiaLatestVersion(force = false) {
    const cache = readUpdateCache();
    const now = Date.now();

    if (!force && cache.lastCheckAt && now - Number(cache.lastCheckAt) < XABUIA_VERSION_CHECK_EVERY_MS) {
      if (xabuiaIsUpdateBlocked()) showXabuiaUpdateBlock(cache.latestVersion || '');
      return cache.latestVersion || '';
    }

    if (versionGateState.checking) return versionGateState.checking;

    versionGateState.checking = (async () => {
      try {
        const remoteText = await getRemoteScriptText(XABUIA_UPDATE_URL);
        const latestVersion = extractMetaVersion(remoteText);

        if (!latestVersion) throw new Error('Não encontrei @version no arquivo publicado.');

        console.log(`[Xabuia] Atualização consultada no GitHub. Instalada: ${XABUIA_VERSION}. Publicada: ${latestVersion}.`);

        writeUpdateCache({ lastCheckAt: now, latestVersion });
        versionGateState.latestVersion = latestVersion;

        if (compareVersions(XABUIA_VERSION, latestVersion) < 0) {
          showXabuiaUpdateBlock(latestVersion);
          return latestVersion;
        }

        clearXabuiaUpdateBlockIfCurrent();
        return latestVersion;
      } catch (error) {
        console.warn('[Xabuia] Verificação de atualização falhou:', error);
        if (xabuiaIsUpdateBlocked()) showXabuiaUpdateBlock(versionGateState.latestVersion || cache.latestVersion || '');
        return cache.latestVersion || '';
      } finally {
        versionGateState.checking = null;
      }
    })();

    return versionGateState.checking;
  }

  const TIPO_CHAMADO = 'nf_caminhao_porta';
  const TIPO_CHAMADO_NOME = 'NF • Caminhão na porta';
  const ACTIVE_STATUS_VALUES = ['aberto', 'reaberto', 'em_tratamento'];
  const FINAL_STATUS_VALUES = ['informacoes_divergentes', 'devolver_recusar', 'finalizado'];
  const MAX_VISIBLE_ACTIVE_MONITORS = 8;

  const STATUS_LABELS = {
    aberto: 'Aberto',
    reaberto: 'Reaberto',
    em_tratamento: 'Em tratamento',
    informacoes_divergentes: 'Informações divergentes',
    devolver_recusar: 'Devolver e recusar',
    finalizado: 'Finalizado'
  };

  const state = {
    authReady: false,
    user: null,
    profile: null,
    profileLoading: null,
    ticketDocUnsubs: new Map(),
    userTicketsByChaveBusca: new Map(),
    userTicketsByChave: new Map(),
    activeCard: null,
    activeData: null,
    activeTicketLookup: null,
    isSaving: false,
    scanTimer: null
  };

  /********************************************************************
   * FIREBASE
   ********************************************************************/
  const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth(app);
  const db = firebase.firestore(app);
  auth.languageCode = 'pt-BR';

  auth.onAuthStateChanged((user) => {
    state.authReady = true;
    state.user = user || null;
    state.profile = user ? readCachedProfile(user.uid) : null;
    state.userTicketsByChaveBusca.clear();
    state.userTicketsByChave.clear();
    state.activeTicketLookup = null;
    stopAllTicketMonitors();

    // Modo v23: ficar logado no Google não abre listener no Firestore.
    // A página só mostra os ícones. Perfil/chamado só são lidos quando o usuário clica no Xabuia
    // ou quando existe cache local de chamado ativo já aberto por ele.
    if (!user) clearAllCardBoxes();

    renderAuthInfo();
    scanCards();
  });

  async function loadProfileIfNeeded(force = false) {
    if (!state.user) return null;
    if (!force && state.profile) return state.profile;

    if (!force) {
      const cached = readCachedProfile(state.user.uid);
      if (cached) {
        state.profile = cached;
        return state.profile;
      }
    }

    if (state.profileLoading) return state.profileLoading;

    state.profileLoading = (async () => {
      try {
        const snap = await db.collection('usuarios').doc(state.user.uid).get();
        state.profile = snap.exists ? { id: snap.id, ...snap.data() } : null;
        writeCachedProfile(state.user.uid, state.profile);
        return state.profile;
      } catch (error) {
        console.warn('[Xabuia] Erro ao carregar perfil:', error);
        return null;
      } finally {
        state.profileLoading = null;
      }
    })();

    return state.profileLoading;
  }

  function isActiveXabuiaStatus(status) {
    return ACTIVE_STATUS_VALUES.includes(String(status || ''));
  }

  function shouldMonitorTicket(ticket) {
    return !!(ticket?.id && ticket?.chave && isActiveXabuiaStatus(ticket.status));
  }

  function rememberTicketInMaps(ticket) {
    if (!ticket) return;
    const chave = digitsOnly(ticket.chave || '');
    const chaveBusca = ticket.chaveBusca || (chave ? typedChaveBusca(chave) : '');
    if (chaveBusca) state.userTicketsByChaveBusca.set(chaveBusca, ticket);
    if (chave) state.userTicketsByChave.set(chave, ticket);
  }

  function startTicketMonitor(ref, seedTicket = null) {
    if (!ref || !seedTicket?.id || !shouldMonitorTicket(seedTicket)) return;
    if (state.ticketDocUnsubs.has(ref.id)) return;

    const unsub = ref.onSnapshot((snap) => {
      if (!snap.exists) {
        state.ticketDocUnsubs.get(ref.id)?.();
        state.ticketDocUnsubs.delete(ref.id);
        return;
      }

      const ticket = { id: snap.id, ...snap.data() };
      rememberTicketInMaps(ticket);
      rememberTicket(ticket);
      renderTargetCardsFromKnownTickets();

      // Quando sair dos status ativos, mostra o último status recebido e para de ouvir.
      if (!isActiveXabuiaStatus(ticket.status)) {
        const currentUnsub = state.ticketDocUnsubs.get(ref.id);
        if (currentUnsub) {
          try { currentUnsub(); } catch (_) {}
          state.ticketDocUnsubs.delete(ref.id);
        }
      }
    }, (error) => {
      console.warn('[Xabuia] Monitor do chamado falhou:', error);
      const currentUnsub = state.ticketDocUnsubs.get(ref.id);
      if (currentUnsub) {
        try { currentUnsub(); } catch (_) {}
        state.ticketDocUnsubs.delete(ref.id);
      }
    });

    state.ticketDocUnsubs.set(ref.id, unsub);
  }

  function stopAllTicketMonitors() {
    state.ticketDocUnsubs.forEach((unsub) => {
      try { unsub(); } catch (_) {}
    });
    state.ticketDocUnsubs.clear();
  }

  function syncVisibleKnownMonitors() {
    if (!state.user || !state.profile?.organizacaoId) {
      stopAllTicketMonitors();
      return;
    }

    const desired = new Map();
    for (const card of targetCards()) {
      if (desired.size >= MAX_VISIBLE_ACTIVE_MONITORS) break;
      const data = parseCard(card);
      const ticket = lookupKnownTicket(data.chave);
      if (!shouldMonitorTicket(ticket)) continue;
      const ref = db.collection('chamados').doc(ticket.id);
      desired.set(ref.id, { ref, ticket });
    }

    state.ticketDocUnsubs.forEach((unsub, id) => {
      if (!desired.has(id)) {
        try { unsub(); } catch (_) {}
        state.ticketDocUnsubs.delete(id);
      }
    });

    desired.forEach(({ ref, ticket }) => startTicketMonitor(ref, ticket));
  }

  /********************************************************************
   * UTILITÁRIOS
   ********************************************************************/
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function digitsOnly(value) { return String(value || '').replace(/\D+/g, ''); }
  function normalizeText(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
  function normalizeStatusText(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }
  function safeDocPart(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'item';
  }
  function hashText(value) {
    let hash = 0x811c9dc5;
    const text = String(value || '');
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }
  function ticketDocId(orgId, chaveBusca) { return `${safeDocPart(orgId)}_${hashText(chaveBusca)}`; }
  function keySearchValue(value) { const digits = digitsOnly(value); return digits || normalizeText(value).toLowerCase(); }
  function typedChaveBusca(chave) { return `${TIPO_CHAMADO}:${keySearchValue(chave)}`; }
  function legacyChaveBusca(chave) { return keySearchValue(chave); }
  function formatDate(value) {
    if (!value) return '—';
    const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
  }
  function toMillis(value) {
    if (!value) return 0;
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (typeof value.toDate === 'function') return value.toDate().getTime();
    if (value instanceof Date) return value.getTime();
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }
  function selectedUserName() { return state.profile?.nome || state.user?.displayName || state.user?.email || 'Usuário'; }
  function canOpenFromInfradesk() {
    return Boolean(state.user && state.profile && state.profile.ativo !== false && state.profile.papel === 'usuario' && state.profile.organizacaoId);
  }

  function parseNfeKey(chave) {
    const digits = digitsOnly(chave);
    if (digits.length !== 44) return null;
    const numeroRaw = digits.slice(25, 34);
    const numero = Number.parseInt(numeroRaw, 10);
    return { chave: digits, cnpj: digits.slice(6, 20), modelo: digits.slice(20, 22), serie: digits.slice(22, 25), numero: Number.isFinite(numero) ? String(numero) : numeroRaw };
  }

  function parseCard(card) {
    const fullText = card.innerText || '';
    const directMatch = fullText.match(/\b\d{44}\b/);
    const chave = directMatch ? directMatch[0] : '';
    const parsed = parseNfeKey(chave);
    const id = card.getAttribute('data-chamado-id') || '';
    const empresa = normalizeText($('.item-data-empresa', card)?.textContent || '');
    const fornecedor = normalizeText($('.item-data-fornecedor', card)?.textContent || '');
    const subcategoria = normalizeText($('.item-subcategoria', card)?.getAttribute('title') || $('.item-subcategoria', card)?.textContent || '');
    const statusInfradesk = normalizeText(card.closest('ul[data-status-descricao]')?.getAttribute('data-status-descricao') || '');
    const ultimaDescricao = normalizeText($('.item-ultima-descricao-copy', card)?.textContent || '');
    return { id, numero: id, chave, parsed, empresa, fornecedor, subcategoria, statusInfradesk, ultimaDescricao };
  }

  function cardStatusInfo(card) {
    const ul = card?.closest?.('ul.list-status-chamados[data-status-id], ul[data-status-id]');
    const statusId = normalizeText(ul?.getAttribute('data-status-id') || '');
    const statusDesc = normalizeStatusText(ul?.getAttribute('data-status-descricao') || '');
    return { ul, statusId, statusDesc };
  }
  function isTargetCard(card) {
    const info = cardStatusInfo(card);
    return info.statusId === XABUIA_TARGET_STATUS_ID || info.statusDesc.includes(XABUIA_TARGET_STATUS_DESC);
  }
  function targetCards() { return $$('.chamado-item[data-chamado-id]').filter((card) => isTargetCard(card)); }
  function hasTargetCards() { return targetCards().length > 0; }

  function primaryRefForKey(chave) {
    if (!state.profile?.organizacaoId) return null;
    return db.collection('chamados').doc(ticketDocId(state.profile.organizacaoId, typedChaveBusca(chave)));
  }
  function legacyRefForKey(chave) {
    if (!state.profile?.organizacaoId) return null;
    return db.collection('chamados').doc(ticketDocId(state.profile.organizacaoId, legacyChaveBusca(chave)));
  }
  function lookupKnownTicket(chave) {
    const clean = digitsOnly(chave);
    return state.userTicketsByChaveBusca.get(typedChaveBusca(clean))
      || state.userTicketsByChaveBusca.get(legacyChaveBusca(clean))
      || state.userTicketsByChave.get(clean)
      || cachedTicket(clean);
  }

  function profileCacheKey(uid) { return `${XABUIA_PROFILE_CACHE_PREFIX}${uid || 'anon'}`; }
  function readCachedProfile(uid) {
    if (!uid) return null;
    try {
      const raw = localStorage.getItem(profileCacheKey(uid));
      const entry = raw ? JSON.parse(raw) : null;
      if (!entry?.profile || !entry.cachedAt) return null;
      if (Date.now() - Number(entry.cachedAt) > XABUIA_PROFILE_CACHE_TTL_MS) return null;
      return entry.profile;
    } catch (_) {
      return null;
    }
  }
  function writeCachedProfile(uid, profile) {
    if (!uid || !profile) return;
    try {
      localStorage.setItem(profileCacheKey(uid), JSON.stringify({ cachedAt: Date.now(), profile }));
    } catch (_) {}
  }

  /********************************************************************
   * CACHE LOCAL
   ********************************************************************/
  function readCache() {
    try { return JSON.parse(localStorage.getItem(XABUIA_CACHE_KEY) || '{}') || {}; } catch (_) { return {}; }
  }
  function writeCache(cache) { try { localStorage.setItem(XABUIA_CACHE_KEY, JSON.stringify(cache || {})); } catch (_) {} }
  function cacheKey(chave) { return state.profile?.organizacaoId && chave ? `${state.profile.organizacaoId}|${digitsOnly(chave)}` : ''; }
  function rememberTicket(ticket) {
    const chave = digitsOnly(ticket?.chave || '');
    const key = cacheKey(chave);
    if (!key) return;
    const cache = readCache();
    const now = Date.now();
    cache[key] = {
      cachedAt: now,
      orgId: state.profile.organizacaoId,
      chave,
      ticket: {
        ...ticket,
        atualizadoEmMs: toMillis(ticket.atualizadoEm) || now,
        ultimaOcorrenciaEmMs: toMillis(ticket.ultimaOcorrenciaEm) || toMillis(ticket.atualizadoEm) || now
      }
    };
    Object.keys(cache).forEach((itemKey) => {
      if (!cache[itemKey]?.cachedAt || now - cache[itemKey].cachedAt > XABUIA_CACHE_TTL_MS) delete cache[itemKey];
    });
    writeCache(cache);
  }
  function cachedTicket(chave) {
    const key = cacheKey(chave);
    if (!key) return null;
    const entry = readCache()[key];
    if (!entry || !entry.ticket || Date.now() - Number(entry.cachedAt || 0) > XABUIA_CACHE_TTL_MS) return null;
    return {
      ...entry.ticket,
      __fromCache: true,
      atualizadoEm: entry.ticket.atualizadoEmMs ? new Date(entry.ticket.atualizadoEmMs) : entry.ticket.atualizadoEm,
      ultimaOcorrenciaEm: entry.ticket.ultimaOcorrenciaEmMs ? new Date(entry.ticket.ultimaOcorrenciaEmMs) : entry.ticket.ultimaOcorrenciaEm
    };
  }

  /********************************************************************
   * UI
   ********************************************************************/
  function injectStyles() {
    if ($('#xabuia-tm-style')) return;
    const style = document.createElement('style');
    style.id = 'xabuia-tm-style';
    style.textContent = `
      .xabuia-card-btn{width:24px!important;height:24px!important;padding:1px!important;border:1px solid #c7d2fe!important;background:#eef2ff!important;border-radius:5px!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;vertical-align:middle!important;margin-left:2px!important}.xabuia-card-btn:hover{background:#dbeafe!important;border-color:#155eef!important}.xabuia-card-btn img{width:18px!important;height:18px!important;display:block!important;border-radius:4px!important}.xabuia-card-btn.xabuia-missing-key{opacity:.35!important;filter:grayscale(1)!important}
      .xabuia-box{clear:both;margin:9px 0 10px;padding:0;border:1px solid rgba(21,94,239,.18);background:#fff;border-radius:12px;color:#172033;font-size:12px;line-height:1.35;overflow:hidden;box-shadow:0 10px 22px rgba(15,23,42,.10)}.xabuia-box-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 9px;font-weight:900;color:#fff;background:linear-gradient(135deg,#155eef,#7c3aed)}.xabuia-box-title{display:inline-flex;align-items:center;gap:6px;min-width:0}.xabuia-box-title img{width:18px;height:18px;border-radius:5px;flex:0 0 auto}.xabuia-chip{display:inline-flex;align-items:center;border-radius:999px;padding:2px 7px;font-size:10px;font-weight:900;background:rgba(255,255,255,.96);color:#1d4ed8;border:1px solid rgba(255,255,255,.65);white-space:nowrap}.xabuia-box-body{padding:8px 9px 9px;background:#f8fafc;border-left:4px solid #155eef}.xabuia-last-text{margin-top:3px;padding:6px 7px;border-radius:9px;background:#fff;border:1px solid #e2e8f0;color:#334155;overflow-wrap:anywhere;white-space:pre-wrap}.xabuia-box small{color:#64748b;display:block;margin-top:5px}.xabuia-box.xabuia-status-reaberto .xabuia-box-head{background:linear-gradient(135deg,#f59e0b,#ea580c)}.xabuia-box.xabuia-status-em_tratamento .xabuia-box-head{background:linear-gradient(135deg,#b54708,#f97316)}.xabuia-box.xabuia-status-finalizado .xabuia-box-head{background:linear-gradient(135deg,#067647,#12b76a)}.xabuia-box.xabuia-status-informacoes_divergentes .xabuia-box-head,.xabuia-box.xabuia-status-devolver_recusar .xabuia-box-head{background:linear-gradient(135deg,#b42318,#ef4444)}
      .xabuia-overlay{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:999999;display:none;align-items:center;justify-content:center;padding:20px}.xabuia-overlay.open{display:flex}.xabuia-modal{width:min(520px,calc(100vw - 32px));background:#fff;border-radius:18px;box-shadow:0 24px 60px rgba(0,0,0,.22);overflow:hidden;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.xabuia-modal-head{display:flex;align-items:center;gap:12px;padding:16px 18px;border-bottom:1px solid #e5e7eb}.xabuia-modal-head img{width:42px;height:42px;border-radius:12px}.xabuia-modal-head h3{margin:0;font-size:18px;color:#172033}.xabuia-modal-head p{margin:2px 0 0;color:#687386;font-size:12px}.xabuia-close{margin-left:auto;border:0;border-radius:10px;background:#f1f5f9;width:34px;height:34px;font-size:18px;line-height:1}.xabuia-modal-body{padding:18px;display:grid;gap:12px}.xabuia-info{border:1px solid #dbeafe;background:#eff6ff;color:#1e3a8a;padding:10px 12px;border-radius:12px;font-size:12px}.xabuia-field{display:grid;gap:6px}.xabuia-field label{font-weight:800;color:#687386;font-size:12px}.xabuia-field textarea{min-height:105px;width:100%;border:1px solid #dfe7f0;border-radius:12px;padding:10px 12px;outline:none;resize:vertical;color:#172033}.xabuia-actions{display:flex;gap:8px;justify-content:flex-end;padding:0 18px 18px}.xabuia-btn{border:0;border-radius:12px;padding:10px 14px;font-weight:800;min-height:40px}.xabuia-btn.primary{background:#155eef;color:#fff}.xabuia-btn.ghost{background:#f8fafc;border:1px solid #dfe7f0;color:#172033}.xabuia-btn:disabled{opacity:.6;cursor:not-allowed}.xabuia-authbar{padding:10px 12px;border-radius:12px;background:#fff7ed;color:#9a3412;border:1px solid #fed7aa;font-size:12px}.xabuia-authbar.ok{background:#ecfdf3;color:#067647;border-color:#bbf7d0}.xabuia-toast{position:fixed;top:18px;right:18px;z-index:1000000;background:#111827;color:#fff;padding:12px 14px;border-radius:12px;box-shadow:0 18px 45px rgba(15,23,42,.18);max-width:min(420px,calc(100vw - 36px));display:none}.xabuia-toast.open{display:block}.xabuia-toast.success{background:#067647}.xabuia-toast.error{background:#b42318}
    `;
    document.head.appendChild(style);
  }

  function ensureModal() {
    if ($('#xabuia-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'xabuia-overlay';
    overlay.className = 'xabuia-overlay';
    overlay.innerHTML = `
      <div class="xabuia-modal" role="dialog" aria-modal="true" aria-labelledby="xabuia-modal-title">
        <div class="xabuia-modal-head">
          <img src="${XABUIA_ICON_URL}" alt="Xabuia"><div><h3 id="xabuia-modal-title">Abrir Xabuia</h3><p>${TIPO_CHAMADO_NOME}</p></div><button id="xabuia-close" class="xabuia-close" type="button">×</button>
        </div>
        <div class="xabuia-modal-body">
          <div id="xabuia-authbar" class="xabuia-authbar">Verificando login...</div>
          <div id="xabuia-info" class="xabuia-info"></div>
          <div class="xabuia-field"><label for="xabuia-comment">Ocorrência obrigatória</label><textarea id="xabuia-comment" placeholder="Ex.: Caminhão na porta aguardando liberação da nota fiscal..."></textarea></div>
          <div class="xabuia-info" style="background:#f8fafc;color:#475569;border-color:#e2e8f0;">Se a NF ainda não existir no Xabuia, será aberta como <strong>Aberto</strong>. Se já existir e estiver encerrada, será <strong>Reaberta</strong>. Se já estiver ativa, será adicionada apenas uma nova ocorrência.</div>
        </div>
        <div class="xabuia-actions"><button id="xabuia-login" class="xabuia-btn ghost" type="button">Conectar Google</button><button id="xabuia-cancel" class="xabuia-btn ghost" type="button">Cancelar</button><button id="xabuia-save" class="xabuia-btn primary" type="button">Salvar Xabuia</button></div>
      </div>`;
    document.body.appendChild(overlay);
    $('#xabuia-close').addEventListener('click', closeModal);
    $('#xabuia-cancel').addEventListener('click', closeModal);
    $('#xabuia-login').addEventListener('click', loginGoogle);
    $('#xabuia-save').addEventListener('click', saveActiveTicket);
    overlay.addEventListener('click', (event) => { if (event.target === overlay) closeModal(); });
  }

  function showToast(message, type = 'info') {
    let toast = $('#xabuia-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'xabuia-toast';
      toast.className = 'xabuia-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.className = `xabuia-toast open ${type === 'success' ? 'success' : type === 'error' ? 'error' : ''}`;
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.remove('open'), 4500);
  }

  function renderAuthInfo() {
    const authbar = $('#xabuia-authbar');
    const loginBtn = $('#xabuia-login');
    const saveBtn = $('#xabuia-save');
    if (!authbar || !loginBtn || !saveBtn) return;
    loginBtn.style.display = state.user ? 'none' : '';
    if (!state.user) { authbar.className = 'xabuia-authbar'; authbar.innerHTML = 'Conecte sua conta Google do Xabuia para salvar direto no Firebase.'; saveBtn.disabled = true; return; }
    if (!state.profile) { authbar.className = 'xabuia-authbar'; authbar.innerHTML = `Logado como <strong>${escapeHtml(state.user.email)}</strong>, aguardando perfil Xabuia.`; saveBtn.disabled = true; return; }
    if (state.profile.ativo === false) { authbar.className = 'xabuia-authbar'; authbar.innerHTML = 'Sua conta Xabuia está bloqueada.'; saveBtn.disabled = true; return; }
    if (state.profile.papel !== 'usuario') { authbar.className = 'xabuia-authbar'; authbar.innerHTML = `Logado como <strong>${escapeHtml(state.profile.nome || state.user.email)}</strong>, mas abertura pelo Infradesk é permitida apenas para usuários comuns.`; saveBtn.disabled = true; return; }
    authbar.className = 'xabuia-authbar ok';
    authbar.innerHTML = `Salvando como <strong>${escapeHtml(state.profile.nome || state.user.email)}</strong> em <strong>${escapeHtml(state.profile.organizacaoNome || 'sua organização')}</strong>.`;
    saveBtn.disabled = false;
  }

  /********************************************************************
   * CARD DO INFRADESK
   ********************************************************************/
  function scanCards() {
    if (xabuiaIsUpdateBlocked()) {
      showXabuiaUpdateBlock(versionGateState.latestVersion || readUpdateCache()?.latestVersion || '');
      return;
    }
    injectStyles();
    ensureModal();
    const cards = $$('.chamado-item[data-chamado-id]');
    cards.forEach((card) => {
      if (!isTargetCard(card)) { removeXabuiaUiFromCard(card); return; }
      if (card.dataset.xabuiaButtonReady !== '1') { card.dataset.xabuiaButtonReady = '1'; addXabuiaButton(card); }
      // Não consulta Firestore para card desconhecido. Só renderiza cache/local já conhecido.
      renderCardFromKnownTicket(card);
    });
    syncVisibleKnownMonitors();
  }

  function addXabuiaButton(card) {
    if ($('.xabuia-card-btn', card)) return;
    const data = parseCard(card);
    const toolbar = $('.list-toolbar .toolbar-atendente', card) || $('.list-toolbar', card) || card;
    const anchor = $('.btn-anexo', toolbar);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `xabuia-card-btn ${data.chave ? '' : 'xabuia-missing-key'}`;
    btn.title = data.chave ? 'Abrir chamado Xabuia' : 'Chave NF-e não encontrada no card';
    btn.innerHTML = `<img src="${XABUIA_ICON_URL}" alt="Xabuia">`;
    btn.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); openModal(card); });
    if (anchor?.parentElement) anchor.insertAdjacentElement('beforebegin', btn); else toolbar.appendChild(btn);
  }

  function removeXabuiaUiFromCard(card) {
    if (!card) return;
    $$('.xabuia-card-btn', card).forEach((btn) => btn.remove());
    $$('.xabuia-box', card).forEach((box) => box.remove());
    delete card.dataset.xabuiaButtonReady;
  }
  function clearAllCardBoxes() { $$('.xabuia-box').forEach((box) => box.remove()); }
  function removeCardBox(card) { $('.xabuia-box', card)?.remove(); }
  function removeCardBoxByChave(chave) {
    if (!chave) return;
    targetCards().forEach((card) => { if (digitsOnly(parseCard(card).chave) === chave) removeCardBox(card); });
  }
  function ensureCardBox(card) {
    let box = $('.xabuia-box', card);
    if (box) return box;
    box = document.createElement('div');
    box.className = 'xabuia-box';
    const tags = $('.chamado-tags', card);
    if (tags?.parentElement) tags.insertAdjacentElement('afterend', box); else (card.children?.[0] || card).appendChild(box);
    return box;
  }

  function renderCardFromKnownTicket(card) {
    const data = parseCard(card);
    const ticket = lookupKnownTicket(data.chave);
    if (!ticket) { removeCardBox(card); return false; }
    renderCardBox(card, ticket);
    return true;
  }
  function renderTargetCardsFromKnownTickets() { targetCards().forEach(renderCardFromKnownTicket); }

  function renderCardBox(card, ticket = null) {
    if (!ticket) { removeCardBox(card); return; }
    const box = ensureCardBox(card);
    const status = ticket.status || 'aberto';
    const label = STATUS_LABELS[status] || status;
    const histText = escapeHtml(normalizeText(ticket.ultimaOcorrenciaTexto || ticket.ultimoComentario || ticket.ultimaObservacao || 'Chamado aberto no Xabuia.'));
    const histUser = ticket.ultimaOcorrenciaUsuarioNome || ticket.ultimaOcorrenciaUsuarioEmail || '';
    const histDate = formatDate(ticket.ultimaOcorrenciaEm || ticket.atualizadoEm);
    box.className = `xabuia-box xabuia-status-${String(status).replace(/[^a-z0-9_-]/gi, '_')}`;
    box.innerHTML = `
      <div class="xabuia-box-head"><span class="xabuia-box-title"><img src="${XABUIA_ICON_URL}" alt=""> Xabuia</span><span class="xabuia-chip ${escapeHtml(status)}">${escapeHtml(label)}</span></div>
      <div class="xabuia-box-body"><div><strong>Última ocorrência</strong></div><div class="xabuia-last-text">${histText}</div><small>${escapeHtml(histDate)}${histUser ? ' • ' : ''}${escapeHtml(histUser)}</small></div>`;
  }

  /********************************************************************
   * MODAL E SALVAMENTO
   ********************************************************************/
  async function openModal(card) {
    if (xabuiaIsUpdateBlocked()) { showXabuiaUpdateBlock(versionGateState.latestVersion || readUpdateCache()?.latestVersion || ''); return; }
    if (!isTargetCard(card)) { showToast('O Xabuia está habilitado apenas na coluna Em Análise Terceiro.', 'error'); return; }
    state.activeCard = card;
    state.activeData = parseCard(card);
    state.activeTicketLookup = null;
    if (!state.activeData.chave || state.activeData.chave.length !== 44) { showToast('Não encontrei uma chave NF-e de 44 dígitos neste card.', 'error'); return; }

    // Só agora, com ação explícita do usuário, lemos perfil e no máximo o documento deste card.
    if (state.user && !state.profile) await loadProfileIfNeeded(false);

    const parsed = state.activeData.parsed;
    $('#xabuia-info').innerHTML = `
      <div><strong>Chave:</strong> ${escapeHtml(state.activeData.chave)}</div>
      ${parsed ? `<div><strong>NF:</strong> ${escapeHtml(parsed.numero)} • <strong>CNPJ:</strong> ${escapeHtml(parsed.cnpj)}</div>` : ''}
      <div><strong>Infradesk:</strong> ${escapeHtml(state.activeData.id || '—')} • ${escapeHtml(state.activeData.statusInfradesk || '—')}</div>
      <div><strong>Empresa:</strong> ${escapeHtml(state.activeData.empresa || '—')}</div>
      <div><strong>Fornecedor:</strong> ${escapeHtml(state.activeData.fornecedor || '—')}</div>`;
    $('#xabuia-comment').value = '';
    renderAuthInfo();
    $('#xabuia-overlay').classList.add('open');
    setTimeout(() => $('#xabuia-comment')?.focus(), 50);

    // Se já existe Xabuia para este card, descobre somente este documento e passa a monitorar
    // apenas se o status for ativo. Card desconhecido nunca é varrido automaticamente.
    if (canOpenFromInfradesk()) {
      try {
        const lookup = await findExistingTicketRef(state.activeData.chave);
        state.activeTicketLookup = lookup;
        if (lookup.exists && lookup.ticket) {
          rememberTicketInMaps(lookup.ticket);
          rememberTicket(lookup.ticket);
          renderCardBox(card, lookup.ticket);
          if (shouldMonitorTicket(lookup.ticket)) startTicketMonitor(lookup.ref, lookup.ticket);
        }
      } catch (error) {
        console.warn('[Xabuia] Não consegui verificar o chamado aberto:', error);
      }
    }
  }
  function closeModal() { $('#xabuia-overlay')?.classList.remove('open'); state.activeCard = null; state.activeData = null; state.activeTicketLookup = null; state.isSaving = false; }
  async function loginGoogle() {
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      await auth.signInWithPopup(provider);
      await loadProfileIfNeeded(false);
      renderAuthInfo();
      showToast('Conta Google conectada.', 'success');
    } catch (error) {
      showToast(error?.code === 'auth/unauthorized-domain' ? 'Domínio asp.infradesk.app não autorizado no Firebase Authentication.' : (error.message || 'Erro ao conectar Google.'), 'error');
    }
  }

  function ticketStatusPayload(status) {
    const now = firebase.firestore.FieldValue.serverTimestamp();
    const payload = { status, atualizadoEm: now };
    if (status === 'em_tratamento') { payload.operadorTratamentoId = state.user.uid; payload.operadorTratamentoNome = selectedUserName(); payload.operadorTratamentoEmail = state.user.email; payload.tratamentoIniciadoEm = now; }
    if (['aberto', 'reaberto'].includes(status)) { payload.operadorTratamentoId = null; payload.operadorTratamentoNome = null; payload.operadorTratamentoEmail = null; payload.tratamentoIniciadoEm = null; }
    if (status === 'reaberto') { payload.reabertoPor = state.user.uid; payload.reabertoPorNome = selectedUserName(); payload.reabertoPorEmail = state.user.email; payload.reabertoEm = now; }
    return payload;
  }
  function lastOccurrencePayload(texto, tipo) {
    const now = firebase.firestore.FieldValue.serverTimestamp();
    return { ultimaOcorrenciaTexto: texto, ultimaOcorrenciaTipo: tipo, ultimaOcorrenciaUsuarioId: state.user.uid, ultimaOcorrenciaUsuarioNome: selectedUserName(), ultimaOcorrenciaUsuarioEmail: state.user.email, ultimaOcorrenciaEm: now, atualizadoEm: now };
  }
  function historyTypeForStatus(status, existsBefore, previousStatus = '') {
    if (!existsBefore && status === 'aberto') return 'criacao';
    if (status === 'reaberto' && previousStatus !== 'reaberto') return 'reabertura';
    return existsBefore ? 'observacao' : 'criacao';
  }
  function statusAfterInfradeskOccurrence(existsBefore, previousStatus) {
    if (!existsBefore) return 'aberto';
    if (['aberto', 'reaberto', 'em_tratamento'].includes(previousStatus)) return previousStatus;
    return 'reaberto';
  }

  async function findExistingTicketRef(chave) {
    const known = lookupKnownTicket(chave);
    if (known?.id) return { ref: db.collection('chamados').doc(known.id), ticket: known, exists: true };
    const primary = primaryRefForKey(chave);
    const primarySnap = primary ? await primary.get() : null;
    if (primarySnap?.exists) return { ref: primary, ticket: { id: primarySnap.id, ...primarySnap.data() }, exists: true };
    const legacy = legacyRefForKey(chave);
    if (legacy && legacy.id !== primary?.id) {
      const legacySnap = await legacy.get();
      if (legacySnap.exists) return { ref: legacy, ticket: { id: legacySnap.id, ...legacySnap.data() }, exists: true };
    }
    return { ref: primary, ticket: null, exists: false };
  }

  async function saveActiveTicket() {
    if (xabuiaIsUpdateBlocked()) { showXabuiaUpdateBlock(versionGateState.latestVersion || readUpdateCache()?.latestVersion || ''); return; }
    if (state.isSaving) return;
    const data = state.activeData;
    const card = state.activeCard;
    const comment = normalizeText($('#xabuia-comment')?.value || '');
    if (!data?.chave || data.chave.length !== 44) return showToast('Chave NF-e inválida.', 'error');
    if (!comment) { showToast('Escreva a ocorrência para salvar a Xabuia.', 'error'); $('#xabuia-comment')?.focus(); return; }
    if (!state.user) return showToast('Conecte sua conta Google primeiro.', 'error');
    if (!state.profile) await loadProfileIfNeeded(true);
    if (!canOpenFromInfradesk()) return showToast('Usuário sem permissão ou sem organização para abrir Xabuia pelo Infradesk.', 'error');

    state.isSaving = true;
    const saveBtn = $('#xabuia-save');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Salvando...';

    try {
      const lookup = state.activeTicketLookup?.ref && digitsOnly(state.activeData?.chave || '') === digitsOnly(data.chave || '')
        ? state.activeTicketLookup
        : await findExistingTicketRef(data.chave);
      const { ref, ticket: previousTicket, exists } = lookup;
      if (!ref) throw new Error('Referência do chamado inválida.');
      const previousStatus = previousTicket?.status || '';
      const finalStatus = statusAfterInfradeskOccurrence(exists, previousStatus);
      const historyType = historyTypeForStatus(finalStatus, exists, previousStatus);
      const now = firebase.firestore.FieldValue.serverTimestamp();
      const requester = firebase.firestore.FieldValue.arrayUnion(state.user.uid);

      if (!exists) {
        await ref.set({
          tipoChamado: TIPO_CHAMADO,
          chave: data.chave,
          chaveBusca: typedChaveBusca(data.chave),
          organizacaoId: state.profile.organizacaoId,
          organizacaoNome: state.profile.organizacaoNome,
          status: 'aberto',
          criadoPor: state.user.uid,
          criadoPorNome: selectedUserName(),
          criadoPorEmail: state.user.email,
          criadoEm: now,
          atualizadoEm: now,
          solicitantesIds: [state.user.uid],
          ...lastOccurrencePayload(comment, historyType)
        });
      } else if (finalStatus === previousStatus) {
        await ref.update({ solicitantesIds: requester, ...lastOccurrencePayload(comment, historyType) });
      } else {
        await ref.update({ ...ticketStatusPayload(finalStatus), solicitantesIds: requester, ...lastOccurrencePayload(comment, historyType) });
      }

      await ref.collection('historico').add({ texto: comment, tipo: historyType, usuarioId: state.user.uid, usuarioNome: selectedUserName(), usuarioEmail: state.user.email, criadoEm: now });

      const localTicket = { id: ref.id, ...(previousTicket || {}), chave: data.chave, chaveBusca: typedChaveBusca(data.chave), status: finalStatus, organizacaoId: state.profile.organizacaoId, ultimaOcorrenciaTexto: comment, ultimaOcorrenciaTipo: historyType, ultimaOcorrenciaUsuarioNome: selectedUserName(), ultimaOcorrenciaUsuarioEmail: state.user.email, ultimaOcorrenciaEm: new Date(), atualizadoEm: new Date() };
      rememberTicketInMaps(localTicket);
      rememberTicket(localTicket);
      if (card) renderCardBox(card, localTicket);
      if (shouldMonitorTicket(localTicket)) startTicketMonitor(ref, localTicket);
      else syncVisibleKnownMonitors();

      showToast(!exists ? 'Xabuia aberta com ocorrência.' : finalStatus === previousStatus ? 'Ocorrência adicionada sem alterar o status.' : 'Xabuia reaberta com ocorrência.', 'success');
      closeModal();
    } catch (error) {
      console.error('[Xabuia] Erro ao salvar:', error);
      showToast(error?.code === 'permission-denied' ? 'Permissão negada pelo Firestore. Publique as regras v21.' : (error.message || 'Erro ao salvar chamado.'), 'error');
    } finally {
      state.isSaving = false;
      saveBtn.disabled = false;
      saveBtn.textContent = 'Salvar Xabuia';
    }
  }

  /********************************************************************
   * OBSERVADOR DO KANBAN
   ********************************************************************/
  const observer = new MutationObserver(() => {
    window.clearTimeout(state.scanTimer);
    state.scanTimer = window.setTimeout(scanCards, 300);
  });

  function boot() {
    if (xabuiaIsUpdateBlocked()) {
      showXabuiaUpdateBlock(versionGateState.latestVersion || readUpdateCache()?.latestVersion || '');
      checkXabuiaLatestVersion(true);
      return;
    }
    // Força uma consulta real ao GitHub quando a página carrega.
    // Isso evita depender do agendamento automático do Tampermonkey.
    checkXabuiaLatestVersion(true);
    window.setInterval(() => checkXabuiaLatestVersion(true), XABUIA_VERSION_CHECK_EVERY_MS);
    injectStyles();
    ensureModal();
    scanCards();
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('focus', () => { checkXabuiaLatestVersion(false); scanCards(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { checkXabuiaLatestVersion(false); scanCards(); } });
    console.log(`[Xabuia] Tampermonkey v${XABUIA_VERSION} carregado. Modo manual: zero monitoramento de cards desconhecidos; só chamados ativos já abertos.`);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();
