// ==UserScript==
// @name         Xabuia • Infradesk → Firebase direto
// @namespace    xabuia/infradesk
// @version      2.6.0
// @description  Abre/atualiza chamados Xabuia direto do card do Infradesk em modo leve: modo leve adaptativo: somente coluna Em Análise Terceiro, sem listeners, com refresh econômico.
// @author       Xabuia
// @match        https://asp.infradesk.app/backend/chamados/painel*
// @match        https://asp.infradesk.app/backend/chamados*
// @run-at       document-end
// @icon         https://chamadossicofe-design.github.io/xabuia/xabuia.png
// @homepageURL  https://chamadossicofe-design.github.io/xabuia/
// @updateURL    https://chamadossicofe-design.github.io/xabuia/xabuiaasp.js
// @downloadURL  https://chamadossicofe-design.github.io/xabuia/xabuiaasp.js
// @grant        none
// @require      https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js
// @require      https://www.gstatic.com/firebasejs/10.12.5/firebase-auth-compat.js
// @require      https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore-compat.js
// ==/UserScript==

(function () {
  'use strict';

  /********************************************************************
   * CONFIGURAÇÕES
   ********************************************************************/
  const XABUIA_VERSION = '13.0.0-terceiro-auto-refresh-adaptativo';
  const XABUIA_ICON_URL = 'https://chamadossicofe-design.github.io/xabuia/xabuia.png';
  const BOOTSTRAP_ADMIN_EMAIL = 'chamadossicofe@gmail.com';

  // V13 leve/adaptativo:
  // - Não usa onSnapshot no Infradesk.
  // - Só atua na coluna Em Análise Terceiro.
  // - Ao recarregar/focar a página, força uma checagem dos cards já conhecidos.
  // - Depois faz refresh inteligente: lê o documento do chamado periodicamente
  //   e só lê o último histórico quando o chamado mudou.
  // - Modo ativo: atualiza rápido enquanto você está usando a tela.
  // - Modo parado/noite: reduz o ritmo para economizar leituras durante longos períodos.
  // - Assim pega resposta/status do operador sem manter listeners abertos.
  const XABUIA_CACHE_KEY = 'xabuia_tm_cache_v13_terceiro';
  const XABUIA_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 dias
  const XABUIA_TARGET_STATUS_ID = '6';
  const XABUIA_TARGET_STATUS_DESC = 'em analise terceiro';
  const XABUIA_ACTIVE_REFRESH_TTL_MS = 1000 * 60 * 1; // usando a tela: 1 minuto
  const XABUIA_IDLE_REFRESH_TTL_MS = 1000 * 60 * 3; // tela parada/noite: 3 minutos
  const XABUIA_DISCOVERY_REFRESH_TTL_MS = 1000 * 60 * 10; // cards sem cache: descobre a cada 10 minutos
  const XABUIA_ACTIVE_WINDOW_MS = 1000 * 60 * 10; // após interação, fica em modo rápido por 10 min
  const XABUIA_AUTO_REFRESH_MAX_CARDS = 15;

  const firebaseConfig = {
    apiKey: 'AIzaSyADfd6RhNN6rj6qX1judbjevvh-ZwMwmJE',
    authDomain: 'chamadossicofe-36fbe.firebaseapp.com',
    projectId: 'chamadossicofe-36fbe',
    storageBucket: 'chamadossicofe-36fbe.firebasestorage.app',
    messagingSenderId: '81395419196',
    appId: '1:81395419196:web:8322d61652f6240b49db39'
  };

  const TIPO_CHAMADO = 'nf_caminhao_porta';
  const TIPO_CHAMADO_NOME = 'NF • Caminhão na porta';

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
    activeCard: null,
    activeData: null,
    cardUnsubs: new Map(),
    isSaving: false,
    profileLoadedAt: 0,
    profileLoading: null,
    targetRefreshTimer: null,
    targetRefreshRunning: false,
    periodicRefreshTimer: null,
    forceNextTargetRefresh: false,
    lastHumanActivityAt: Date.now(),
    activityRefreshTimer: null
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
    state.profile = null;
    state.profileLoadedAt = 0;
    state.profileLoading = null;

    // V10: não lê Firestore no carregamento/reload do Infradesk.
    // Perfil do usuário só é consultado quando clicar no Xabuia ou quando houver
    // cache local suficiente para pintar um card alvo.
    clearCardSubscriptions();
    if (!user) clearAllCardBoxes();

    renderAuthInfo();
    scanCards();

    // V11: se existir card na coluna alvo, faz uma consulta leve por get(),
    // apenas nessa coluna, para reapresentar o painel após reload.
    // Sem onSnapshot, então não fica listener aberto.
    if (user) scheduleTargetRefresh(450, true);
  });

  async function loadProfileIfNeeded(force = false) {
    if (!state.user) return null;

    const now = Date.now();
    if (!force && state.profile && state.profileLoadedAt && now - state.profileLoadedAt < 1000 * 60 * 10) {
      return state.profile;
    }

    if (state.profileLoading) return state.profileLoading;

    state.profileLoading = (async () => {
      try {
        const snap = await db.collection('usuarios').doc(state.user.uid).get();
        state.profile = snap.exists ? { id: snap.id, ...snap.data() } : null;
        state.profileLoadedAt = Date.now();
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

  /********************************************************************
   * UTILITÁRIOS
   ********************************************************************/
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function digitsOnly(value) {
    return String(value || '').replace(/\D+/g, '');
  }

  function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
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

  function ticketDocId(orgId, chaveBusca) {
    return `${safeDocPart(orgId)}_${hashText(chaveBusca)}`;
  }

  function keySearchValue(value) {
    const digits = digitsOnly(value);
    return digits || normalizeText(value).toLowerCase();
  }

  function formatDate(value) {
    if (!value) return '—';
    const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short'
    }).format(date);
  }

  function toMillis(value) {
    if (!value) return 0;
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (typeof value.toDate === 'function') return value.toDate().getTime();
    if (value instanceof Date) return value.getTime();
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function readCache() {
    try {
      const raw = localStorage.getItem(XABUIA_CACHE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function writeCache(cache) {
    try {
      localStorage.setItem(XABUIA_CACHE_KEY, JSON.stringify(cache || {}));
    } catch (_) {}
  }

  function cacheKeyFor(chave) {
    const orgId = state.profile?.organizacaoId || '';
    const cleanKey = digitsOnly(chave);
    return orgId && cleanKey ? `${orgId}|${cleanKey}` : '';
  }

  function normalizeCachedEntry(entry) {
    if (!entry || !entry.ticket) return null;
    const out = {
      ...entry,
      ticket: {
        ...entry.ticket,
        __fromCache: true,
        atualizadoEm: entry.ticket.atualizadoEmMs ? new Date(entry.ticket.atualizadoEmMs) : entry.ticket.atualizadoEm
      },
      history: entry.history ? {
        ...entry.history,
        criadoEm: entry.history.criadoEmMs ? new Date(entry.history.criadoEmMs) : entry.history.criadoEm
      } : null
    };
    return out;
  }

  function rememberCardTicket(card, ticket = null, history = null) {
    if (!card || !state.profile?.organizacaoId || !ticket) return;
    const data = parseCard(card);
    if (!data.chave) return;

    const key = cacheKeyFor(data.chave);
    if (!key) return;

    const cache = readCache();
    const previous = cache[key] || {};
    const nowMs = Date.now();

    cache[key] = {
      orgId: state.profile.organizacaoId,
      chave: data.chave,
      cachedAt: nowMs,
      remoteCheckedAt: nowMs,
      ticket: {
        status: ticket.status || 'aberto',
        atualizadoEmMs: toMillis(ticket.atualizadoEm) || nowMs,
        ultimaOcorrenciaTexto: ticket.ultimaOcorrenciaTexto || ticket.ultimoComentario || ticket.ultimaObservacao || '',
        ultimaOcorrenciaUsuarioNome: ticket.ultimaOcorrenciaUsuarioNome || ticket.ultimaOcorrenciaUsuarioEmail || ''
      },
      history: history ? {
        texto: historyText(history),
        usuarioNome: history.usuarioNome || history.usuarioEmail || '',
        criadoEmMs: toMillis(history.criadoEm) || nowMs
      } : null
    };

    // limpeza simples para não deixar localStorage crescer para sempre
    Object.keys(cache).forEach((itemKey) => {
      const item = cache[itemKey];
      if (!item || !item.cachedAt || nowMs - item.cachedAt > XABUIA_CACHE_TTL_MS) {
        delete cache[itemKey];
      }
    });

    writeCache(cache);
  }

  function cachedEntryForCard(card) {
    if (!card || !state.profile?.organizacaoId) return null;
    const data = parseCard(card);
    if (!data.chave) return null;

    const entry = readCache()[cacheKeyFor(data.chave)];
    if (!entry || entry.orgId !== state.profile.organizacaoId) return null;
    if (!entry.cachedAt || Date.now() - entry.cachedAt > XABUIA_CACHE_TTL_MS) return null;
    return normalizeCachedEntry(entry);
  }

  function renderCachedCardBox(card) {
    const entry = cachedEntryForCard(card);
    if (!entry || !entry.ticket) return false;
    renderCardBox(card, entry.ticket, entry.history || null);
    return true;
  }

  function selectedUserName() {
    return state.profile?.nome || state.user?.displayName || state.user?.email || 'Usuário';
  }

  function isBootstrapAdmin() {
    return state.user?.email?.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL;
  }

  function canOpenFromInfradesk() {
    return Boolean(
      state.user &&
      state.profile &&
      state.profile.ativo !== false &&
      state.profile.papel === 'usuario' &&
      state.profile.organizacaoId
    );
  }

  function parseNfeKey(chave) {
    const digits = digitsOnly(chave);
    if (digits.length !== 44) return null;
    const numeroRaw = digits.slice(25, 34);
    const numero = Number.parseInt(numeroRaw, 10);
    return {
      chave: digits,
      cnpj: digits.slice(6, 20),
      modelo: digits.slice(20, 22),
      serie: digits.slice(22, 25),
      numero: Number.isFinite(numero) ? String(numero) : numeroRaw
    };
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

    return {
      id,
      numero: id,
      chave,
      parsed,
      empresa,
      fornecedor,
      subcategoria,
      statusInfradesk,
      ultimaDescricao
    };
  }

  function ticketRefForKey(chave) {
    if (!state.profile?.organizacaoId) return null;
    const chaveBusca = keySearchValue(chave);
    return db.collection('chamados').doc(ticketDocId(state.profile.organizacaoId, chaveBusca));
  }

  function clearCardSubscriptions() {
    state.cardUnsubs.forEach((unsub) => {
      try { unsub(); } catch (_) {}
    });
    state.cardUnsubs.clear();
    $$('.chamado-item[data-chamado-id]').forEach((card) => {
      delete card.dataset.xabuiaObserved;
    });
  }

  function clearAllCardBoxes() {
    $$('.xabuia-box').forEach((box) => box.remove());
  }

  /********************************************************************
   * ESTILO E UI
   ********************************************************************/
  function injectStyles() {
    if ($('#xabuia-tm-style')) return;
    const style = document.createElement('style');
    style.id = 'xabuia-tm-style';
    style.textContent = `
      .xabuia-card-btn {
        width: 24px !important;
        height: 24px !important;
        padding: 1px !important;
        border: 1px solid #c7d2fe !important;
        background: #eef2ff !important;
        border-radius: 5px !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        vertical-align: middle !important;
        margin-left: 2px !important;
      }
      .xabuia-card-btn:hover {
        background: #dbeafe !important;
        border-color: #155eef !important;
      }
      .xabuia-card-btn img {
        width: 18px !important;
        height: 18px !important;
        display: block !important;
        border-radius: 4px !important;
      }
      .xabuia-card-btn.xabuia-missing-key {
        opacity: .35 !important;
        filter: grayscale(1) !important;
      }
      .xabuia-box {
        clear: both;
        margin: 9px 0 10px;
        padding: 0;
        border: 1px solid rgba(21, 94, 239, .18);
        background: #ffffff;
        border-radius: 12px;
        color: #172033;
        font-size: 12px;
        line-height: 1.35;
        overflow: hidden;
        box-shadow: 0 10px 22px rgba(15, 23, 42, .10);
      }
      .xabuia-box-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 7px 9px;
        font-weight: 900;
        color: #fff;
        background: linear-gradient(135deg, #155eef, #7c3aed);
      }
      .xabuia-box-title {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
      }
      .xabuia-box-title img {
        width: 18px;
        height: 18px;
        border-radius: 5px;
        flex: 0 0 auto;
        box-shadow: 0 2px 8px rgba(255,255,255,.22);
      }
      .xabuia-chip {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 2px 7px;
        font-size: 10px;
        font-weight: 900;
        background: rgba(255,255,255,.96);
        color: #1d4ed8;
        border: 1px solid rgba(255,255,255,.65);
        white-space: nowrap;
      }
      .xabuia-box-body {
        padding: 8px 9px 9px;
        background: #f8fafc;
        border-left: 4px solid #155eef;
      }
      .xabuia-box-body strong { color: #0f172a; }
      .xabuia-last-text {
        margin-top: 3px;
        padding: 6px 7px;
        border-radius: 9px;
        background: #fff;
        border: 1px solid #e2e8f0;
        color: #334155;
        overflow-wrap: anywhere;
        white-space: pre-wrap;
      }
      .xabuia-box small { color: #64748b; display:block; margin-top: 5px; }
      .xabuia-box.xabuia-status-aberto .xabuia-box-body { border-left-color: #155eef; background: #eff6ff; }
      .xabuia-box.xabuia-status-reaberto .xabuia-box-head { background: linear-gradient(135deg, #f59e0b, #ea580c); }
      .xabuia-box.xabuia-status-reaberto .xabuia-box-body { border-left-color: #f59e0b; background: #fffbeb; }
      .xabuia-box.xabuia-status-em_tratamento .xabuia-box-head { background: linear-gradient(135deg, #b54708, #f97316); }
      .xabuia-box.xabuia-status-em_tratamento .xabuia-box-body { border-left-color: #f97316; background: #fff7ed; }
      .xabuia-box.xabuia-status-finalizado .xabuia-box-head { background: linear-gradient(135deg, #067647, #12b76a); }
      .xabuia-box.xabuia-status-finalizado .xabuia-box-body { border-left-color: #12b76a; background: #ecfdf3; }
      .xabuia-box.xabuia-status-informacoes_divergentes .xabuia-box-head,
      .xabuia-box.xabuia-status-devolver_recusar .xabuia-box-head { background: linear-gradient(135deg, #b42318, #ef4444); }
      .xabuia-box.xabuia-status-informacoes_divergentes .xabuia-box-body,
      .xabuia-box.xabuia-status-devolver_recusar .xabuia-box-body { border-left-color: #ef4444; background: #fef3f2; }
      .xabuia-overlay {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, .55);
        z-index: 999999;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 20px;
      }
      .xabuia-overlay.open { display: flex; }
      .xabuia-modal {
        width: min(520px, calc(100vw - 32px));
        background: #fff;
        border-radius: 18px;
        box-shadow: 0 24px 60px rgba(0,0,0,.22);
        overflow: hidden;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .xabuia-modal-head {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 16px 18px;
        border-bottom: 1px solid #e5e7eb;
      }
      .xabuia-modal-head img { width: 42px; height: 42px; border-radius: 12px; }
      .xabuia-modal-head h3 { margin: 0; font-size: 18px; color: #172033; }
      .xabuia-modal-head p { margin: 2px 0 0; color: #687386; font-size: 12px; }
      .xabuia-close {
        margin-left: auto;
        border: 0;
        border-radius: 10px;
        background: #f1f5f9;
        width: 34px;
        height: 34px;
        font-size: 18px;
        line-height: 1;
      }
      .xabuia-modal-body { padding: 18px; display: grid; gap: 12px; }
      .xabuia-info {
        border: 1px solid #dbeafe;
        background: #eff6ff;
        color: #1e3a8a;
        padding: 10px 12px;
        border-radius: 12px;
        font-size: 12px;
      }
      .xabuia-field { display: grid; gap: 6px; }
      .xabuia-field label { font-weight: 800; color: #687386; font-size: 12px; }
      .xabuia-field textarea {
        min-height: 105px;
        width: 100%;
        border: 1px solid #dfe7f0;
        border-radius: 12px;
        padding: 10px 12px;
        outline: none;
        resize: vertical;
        color: #172033;
      }
      .xabuia-field textarea:focus,
      .xabuia-field select:focus {
        border-color: rgba(21, 94, 239, .55);
        box-shadow: 0 0 0 4px rgba(21, 94, 239, .12);
      }
      .xabuia-field select {
        width: 100%;
        border: 1px solid #dfe7f0;
        border-radius: 12px;
        padding: 10px 12px;
        background: #fff;
        color: #172033;
        outline: none;
      }
      .xabuia-modal-grid {
        display: grid;
        grid-template-columns: minmax(0, .85fr) minmax(0, 1.15fr);
        gap: 10px;
      }
      @media (max-width: 560px) {
        .xabuia-modal-grid { grid-template-columns: 1fr; }
      }
      .xabuia-actions {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
        padding: 0 18px 18px;
      }
      .xabuia-btn {
        border: 0;
        border-radius: 12px;
        padding: 10px 14px;
        font-weight: 800;
        min-height: 40px;
      }
      .xabuia-btn.primary { background: #155eef; color: #fff; }
      .xabuia-btn.ghost { background: #f8fafc; border: 1px solid #dfe7f0; color: #172033; }
      .xabuia-btn.danger { background: #fef3f2; border: 1px solid #fecdca; color: #b42318; }
      .xabuia-btn:disabled { opacity: .6; cursor: not-allowed; }
      .xabuia-authbar {
        padding: 10px 12px;
        border-radius: 12px;
        background: #fff7ed;
        color: #9a3412;
        border: 1px solid #fed7aa;
        font-size: 12px;
      }
      .xabuia-authbar.ok { background: #ecfdf3; color: #067647; border-color: #bbf7d0; }
      .xabuia-toast {
        position: fixed;
        top: 18px;
        right: 18px;
        z-index: 1000000;
        background: #111827;
        color: #fff;
        padding: 12px 14px;
        border-radius: 12px;
        box-shadow: 0 18px 45px rgba(15, 23, 42, .18);
        max-width: min(420px, calc(100vw - 36px));
        display: none;
      }
      .xabuia-toast.open { display: block; }
      .xabuia-toast.success { background: #067647; }
      .xabuia-toast.error { background: #b42318; }
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
          <img src="${XABUIA_ICON_URL}" alt="Xabuia">
          <div>
            <h3 id="xabuia-modal-title">Abrir Xabuia</h3>
            <p>NF • Caminhão na porta</p>
          </div>
          <button id="xabuia-close" class="xabuia-close" type="button">×</button>
        </div>
        <div class="xabuia-modal-body">
          <div id="xabuia-authbar" class="xabuia-authbar">Verificando login...</div>
          <div id="xabuia-info" class="xabuia-info"></div>
          <div class="xabuia-field">
            <label for="xabuia-comment">Ocorrência obrigatória</label>
            <textarea id="xabuia-comment" placeholder="Ex.: Caminhão na porta aguardando liberação da nota fiscal..."></textarea>
          </div>
          <div class="xabuia-info" style="background:#f8fafc;color:#475569;border-color:#e2e8f0;">
            Se a NF ainda não existir no Xabuia, será aberta como <strong>Aberto</strong>.
            Se já existir e estiver encerrada, será <strong>Reaberta</strong>.
            Se já estiver <strong>Aberta</strong>, <strong>Reaberta</strong> ou <strong>Em tratamento</strong>, será adicionada apenas uma nova ocorrência.
          </div>
        </div>
        <div class="xabuia-actions">
          <button id="xabuia-login" class="xabuia-btn ghost" type="button">Conectar Google</button>
          <button id="xabuia-cancel" class="xabuia-btn ghost" type="button">Cancelar</button>
          <button id="xabuia-save" class="xabuia-btn primary" type="button">Salvar Xabuia</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    $('#xabuia-close').addEventListener('click', closeModal);
    $('#xabuia-cancel').addEventListener('click', closeModal);
    $('#xabuia-login').addEventListener('click', loginGoogle);
    $('#xabuia-save').addEventListener('click', saveActiveTicket);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeModal();
    });
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

    if (!state.user) {
      authbar.className = 'xabuia-authbar';
      authbar.innerHTML = 'Conecte sua conta Google do Xabuia para salvar direto no Firebase.';
      saveBtn.disabled = true;
      return;
    }

    if (!state.profile) {
      authbar.className = 'xabuia-authbar';
      authbar.innerHTML = `Logado como <strong>${escapeHtml(state.user.email)}</strong>. O perfil Xabuia será conferido ao clicar/salvar.`;
      saveBtn.disabled = false;
      return;
    }

    if (state.profile.ativo === false) {
      authbar.className = 'xabuia-authbar';
      authbar.innerHTML = 'Sua conta Xabuia está bloqueada.';
      saveBtn.disabled = true;
      return;
    }

    if (state.profile.papel !== 'usuario') {
      authbar.className = 'xabuia-authbar';
      authbar.innerHTML = `Logado como <strong>${escapeHtml(state.profile.nome || state.user.email)}</strong>, mas abertura pelo Infradesk é permitida apenas para usuários comuns.`;
      saveBtn.disabled = true;
      return;
    }

    authbar.className = 'xabuia-authbar ok';
    authbar.innerHTML = `Salvando como <strong>${escapeHtml(state.profile.nome || state.user.email)}</strong> em <strong>${escapeHtml(state.profile.organizacaoNome || 'sua organização')}</strong>.`;
    saveBtn.disabled = false;
  }

  function normalizeStatusText(value) {
    return normalizeText(value)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
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

  function removeXabuiaUiFromCard(card) {
    if (!card) return;
    $$('.xabuia-card-btn', card).forEach((btn) => btn.remove());
    $$('.xabuia-box', card).forEach((box) => box.remove());
    delete card.dataset.xabuiaButtonReady;
    delete card.dataset.xabuiaAutoRefreshAt;
  }

  function currentAutoRefreshTtl() {
    const activeRecently = Date.now() - Number(state.lastHumanActivityAt || 0) < XABUIA_ACTIVE_WINDOW_MS;
    return activeRecently ? XABUIA_ACTIVE_REFRESH_TTL_MS : XABUIA_IDLE_REFRESH_TTL_MS;
  }

  function shouldAutoRefreshCard(card, opts = {}) {
    if (!card || !state.user || !state.profile?.organizacaoId) return false;
    const data = parseCard(card);
    if (!data.chave || data.chave.length !== 44) return false;

    const key = cacheKeyFor(data.chave);
    const entry = key ? readCache()[key] : null;
    const lastRemoteCheck = Number(entry?.remoteCheckedAt || 0);
    const hasKnownXabuia = Boolean(entry?.ticket);

    // V12: quando a página recarrega/ganha foco, confere imediatamente os cards
    // que já têm Xabuia conhecida. Isso evita ficar preso em cache velho.
    if (opts.forceKnown && hasKnownXabuia) return true;

    const ttl = hasKnownXabuia ? currentAutoRefreshTtl() : XABUIA_DISCOVERY_REFRESH_TTL_MS;
    return !lastRemoteCheck || Date.now() - lastRemoteCheck > ttl;
  }

  function markRemoteChecked(card) {
    if (!card || !state.profile?.organizacaoId) return;
    const data = parseCard(card);
    const key = data.chave ? cacheKeyFor(data.chave) : '';
    if (!key) return;
    const cache = readCache();
    cache[key] = cache[key] || {
      orgId: state.profile.organizacaoId,
      chave: data.chave,
      cachedAt: Date.now()
    };
    cache[key].remoteCheckedAt = Date.now();
    writeCache(cache);
  }

  function targetCards() {
    return $$('.chamado-item[data-chamado-id]').filter((card) => isTargetCard(card));
  }

  function hasTargetCards() {
    return targetCards().length > 0;
  }

  function scheduleTargetRefresh(delay = 300, forceKnown = false) {
    if (forceKnown) state.forceNextTargetRefresh = true;
    window.clearTimeout(state.targetRefreshTimer);
    state.targetRefreshTimer = window.setTimeout(refreshTargetCardsIfNeeded, delay);
  }

  async function refreshTargetCardsIfNeeded() {
    if (state.targetRefreshRunning) return;
    if (!state.user) return;

    const cards = targetCards();
    if (!cards.length) return;

    state.targetRefreshRunning = true;
    const forceKnown = state.forceNextTargetRefresh;
    state.forceNextTargetRefresh = false;
    try {
      // Uma única leitura de perfil por janela de cache. Só acontece se existir card alvo.
      await loadProfileIfNeeded(false);
      if (!state.profile?.organizacaoId) return;

      // scanCards decide quais cards precisam consultar remoto de acordo com o TTL.
      scanCards({ forceKnown });
    } finally {
      state.targetRefreshRunning = false;
    }
  }

  /********************************************************************
   * CARD DO INFRADESK
   ********************************************************************/
  function scanCards(opts = {}) {
    injectStyles();
    ensureModal();

    const allCards = $$('.chamado-item[data-chamado-id]');
    let autoRefreshCount = 0;

    allCards.forEach((card) => {
      if (!card) return;

      if (!isTargetCard(card)) {
        // V10: não queremos nem ícone fora de "Em Análise Terceiro".
        removeXabuiaUiFromCard(card);
        return;
      }

      if (card.dataset.xabuiaButtonReady !== '1') {
        card.dataset.xabuiaButtonReady = '1';
        addXabuiaButton(card);
      }

      // Reapresenta cache local, sem Firestore.
      renderCachedCardBox(card);

      // V10: consulta remota opcional e limitada, somente na coluna alvo.
      // Isso permite a última resposta aparecer no Infradesk sem assinar todos os cards.
      if (
        state.user &&
        state.profile?.organizacaoId &&
        autoRefreshCount < XABUIA_AUTO_REFRESH_MAX_CARDS &&
        shouldAutoRefreshCard(card, { forceKnown: opts.forceKnown })
      ) {
        autoRefreshCount += 1;
        markRemoteChecked(card);
        refreshCardXabuiaStatus(card, { silent: true, forceHistory: opts.forceKnown });
      }
    });
  }

  function addXabuiaButton(card) {
    if (!isTargetCard(card)) return;
    if ($('.xabuia-card-btn', card)) return;
    const data = parseCard(card);
    const toolbar = $('.list-toolbar .toolbar-atendente', card) || $('.list-toolbar', card) || card;
    const anchor = $('.btn-anexo', toolbar);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `xabuia-card-btn ${data.chave ? '' : 'xabuia-missing-key'}`;
    btn.title = data.chave ? 'Abrir chamado Xabuia' : 'Chave NF-e não encontrada no card';
    btn.innerHTML = `<img src="${XABUIA_ICON_URL}" alt="Xabuia">`;
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openModal(card);
    });

    if (anchor?.parentElement) {
      anchor.insertAdjacentElement('beforebegin', btn);
    } else {
      toolbar.appendChild(btn);
    }
  }

  function removeCardBox(card) {
    const box = $('.xabuia-box', card);
    if (box) box.remove();
  }

  function ensureCardBox(card) {
    let box = $('.xabuia-box', card);
    if (box) return box;

    box = document.createElement('div');
    box.className = 'xabuia-box';

    const tags = $('.chamado-tags', card);
    if (tags?.parentElement) {
      tags.insertAdjacentElement('afterend', box);
    } else {
      const body = card.children?.[0] || card;
      body.appendChild(box);
    }
    return box;
  }

  function historyText(history) {
    return normalizeText(
      history?.texto
      || history?.comentario
      || history?.observacao
      || history?.descricao
      || ''
    );
  }

  function renderCardBox(card, ticket = null, history = null) {
    // Não mostra bloco "Sem chamado". O painel Xabuia só aparece quando a NF já tem Xabuia aberta.
    if (!ticket) {
      removeCardBox(card);
      return;
    }

    const box = ensureCardBox(card);
    const status = ticket.status || 'aberto';
    const label = STATUS_LABELS[status] || status;

    // V7: mantém a última ocorrência carregada. Na V6, quando o snapshot do chamado atualizava,
    // ele redesenhava o card sem o histórico e podia trocar o texto por "Chamado aberto...".
    const textFromHistory = historyText(history);
    const textFromTicket = normalizeText(ticket.ultimaOcorrenciaTexto || ticket.ultimoComentario || ticket.ultimaObservacao || '');
    const histText = escapeHtml(textFromHistory || textFromTicket || 'Carregando última ocorrência...');
    const histUser = history?.usuarioNome || history?.usuarioEmail || ticket.ultimaOcorrenciaUsuarioNome || ticket.ultimaOcorrenciaUsuarioEmail || '';
    const histDate = formatDate(history?.criadoEm || ticket.ultimaOcorrenciaEm || ticket.atualizadoEm);

    box.className = `xabuia-box xabuia-status-${String(status).replace(/[^a-z0-9_-]/gi, '_')}`;
    box.innerHTML = `
      <div class="xabuia-box-head">
        <span class="xabuia-box-title"><img src="${XABUIA_ICON_URL}" alt=""> Xabuia</span>
        <span class="xabuia-chip ${escapeHtml(status)}">${escapeHtml(label)}</span>
      </div>
      <div class="xabuia-box-body">
        <div><strong>Última ocorrência</strong></div>
        <div class="xabuia-last-text">${histText}</div>
        <small>${escapeHtml(histDate)}${histUser ? ' • ' : ''}${escapeHtml(histUser)}</small>
      </div>
    `;

    // Guarda a última informação conhecida para reaparecer após reload sem consultar o Firestore.
    // Quando veio do próprio cache, não regrava para evitar escrita local a cada scan do DOM.
    if (!ticket.__fromCache) {
      rememberCardTicket(card, ticket, history, false);
    }
  }

  async function refreshCardXabuiaStatus(card, opts = {}) {
    if (!canOpenFromInfradesk()) return null;

    const data = parseCard(card);
    if (!data.chave || data.chave.length !== 44) return null;

    const ref = ticketRefForKey(data.chave);
    if (!ref) return null;

    try {
      const previousEntry = cachedEntryForCard(card);
      const previousTicket = previousEntry?.ticket || null;
      const previousHistory = previousEntry?.history || null;
      const previousUpdatedMs = toMillis(previousTicket?.atualizadoEm);
      const previousStatus = previousTicket?.status || '';

      // V12: leitura leve principal. Esta leitura é suficiente para saber se status/data mudou.
      const snap = await ref.get();

      if (!snap.exists) {
        removeCardBox(card);
        const key = cacheKeyFor(data.chave);
        if (key) {
          const cache = readCache();
          delete cache[key];
          writeCache(cache);
        }
        return null;
      }

      const ticket = { id: snap.id, ...snap.data() };
      const currentUpdatedMs = toMillis(ticket.atualizadoEm);
      const currentStatus = ticket.status || '';

      let history = previousHistory || null;
      const changed =
        opts.forceHistory ||
        !history ||
        currentStatus !== previousStatus ||
        (currentUpdatedMs && previousUpdatedMs && currentUpdatedMs !== previousUpdatedMs) ||
        (currentUpdatedMs && !previousUpdatedMs);

      // Só lê o último histórico quando precisa. Assim o refresh automático consome 1 leitura
      // na maioria dos ciclos, e 2 leituras apenas quando há alteração real.
      if (changed) {
        try {
          const historySnap = await ref.collection('historico')
            .orderBy('criadoEm', 'desc')
            .limit(1)
            .get();

          history = historySnap.docs[0]?.data() || null;
        } catch (historyError) {
          console.warn('[Xabuia] Erro ao ler última ocorrência:', historyError);
        }
      }

      renderCardBox(card, ticket, history);
      rememberCardTicket(card, ticket, history);
      return { ticket, history };
    } catch (error) {
      console.warn('[Xabuia] Erro ao consultar chamado:', error);
      if (!opts.silent) {
        showToast('Não consegui consultar a Xabuia deste card.', 'error');
      }
      return null;
    }
  }

  /********************************************************************
   * MODAL E SALVAMENTO
   ********************************************************************/
  async function openModal(card) {
    if (!isTargetCard(card)) {
      showToast('O Xabuia está habilitado apenas na coluna Em Análise Terceiro.', 'error');
      return;
    }

    state.activeCard = card;
    state.activeData = parseCard(card);

    if (!state.activeData.chave || state.activeData.chave.length !== 44) {
      showToast('Não encontrei uma chave NF-e de 44 dígitos neste card.', 'error');
      return;
    }

    if (state.user && !state.profile) {
      await loadProfileIfNeeded(false);
    }

    const parsed = state.activeData.parsed;
    $('#xabuia-info').innerHTML = `
      <div><strong>Chave:</strong> ${escapeHtml(state.activeData.chave)}</div>
      ${parsed ? `<div><strong>NF:</strong> ${escapeHtml(parsed.numero)} • <strong>CNPJ:</strong> ${escapeHtml(parsed.cnpj)}</div>` : ''}
      <div><strong>Infradesk:</strong> ${escapeHtml(state.activeData.id || '—')} • ${escapeHtml(state.activeData.statusInfradesk || '—')}</div>
      <div><strong>Empresa:</strong> ${escapeHtml(state.activeData.empresa || '—')}</div>
      <div><strong>Fornecedor:</strong> ${escapeHtml(state.activeData.fornecedor || '—')}</div>
    `;

    $('#xabuia-comment').value = '';
    renderAuthInfo();
    $('#xabuia-overlay').classList.add('open');

    // V9 máximo leve: consulta apenas uma vez o card aberto, sem listener permanente.
    if (canOpenFromInfradesk()) {
      refreshCardXabuiaStatus(card, { silent: true });
    }

    setTimeout(() => $('#xabuia-comment')?.focus(), 50);
  }

  function closeModal() {
    $('#xabuia-overlay')?.classList.remove('open');
    state.activeCard = null;
    state.activeData = null;
    state.isSaving = false;
  }

  async function loginGoogle() {
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      await auth.signInWithPopup(provider);
      showToast('Conta Google conectada.', 'success');
    } catch (error) {
      const msg = error?.code === 'auth/unauthorized-domain'
        ? 'Domínio asp.infradesk.app não autorizado no Firebase Authentication. Adicione esse domínio em Authentication > Settings > Authorized domains.'
        : (error.message || 'Erro ao conectar Google.');
      showToast(msg, 'error');
    }
  }

  function ticketStatusPayload(status) {
    const payload = {
      status,
      atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (status === 'em_tratamento') {
      payload.operadorTratamentoId = state.user.uid;
      payload.operadorTratamentoNome = selectedUserName();
      payload.operadorTratamentoEmail = state.user.email;
      payload.tratamentoIniciadoEm = firebase.firestore.FieldValue.serverTimestamp();
    }

    if (['aberto', 'reaberto'].includes(status)) {
      payload.operadorTratamentoId = null;
      payload.operadorTratamentoNome = null;
      payload.operadorTratamentoEmail = null;
      payload.tratamentoIniciadoEm = null;
    }

    if (status === 'reaberto') {
      payload.reabertoPor = state.user.uid;
      payload.reabertoPorNome = selectedUserName();
      payload.reabertoPorEmail = state.user.email;
      payload.reabertoEm = firebase.firestore.FieldValue.serverTimestamp();
    }

    if (status === 'finalizado') {
      payload.finalizadoPor = state.user.uid;
      payload.finalizadoPorNome = selectedUserName();
      payload.finalizadoPorEmail = state.user.email;
      payload.finalizadoEm = firebase.firestore.FieldValue.serverTimestamp();
    }

    if (status === 'informacoes_divergentes') {
      payload.informacoesDivergentesPor = state.user.uid;
      payload.informacoesDivergentesPorNome = selectedUserName();
      payload.informacoesDivergentesPorEmail = state.user.email;
      payload.informacoesDivergentesEm = firebase.firestore.FieldValue.serverTimestamp();
    }

    if (status === 'devolver_recusar') {
      payload.devolverRecusarPor = state.user.uid;
      payload.devolverRecusarPorNome = selectedUserName();
      payload.devolverRecusarPorEmail = state.user.email;
      payload.devolverRecusarEm = firebase.firestore.FieldValue.serverTimestamp();
    }

    return payload;
  }

  function historyTypeForStatus(status, existsBefore, previousStatus = '') {
    if (!existsBefore && status === 'aberto') return 'criacao';
    if (status === 'reaberto' && previousStatus !== 'reaberto') return 'reabertura';
    return existsBefore ? 'observacao' : 'criacao';
  }

  function statusAfterInfradeskOccurrence(existsBefore, previousStatus) {
    if (!existsBefore) return 'aberto';

    // Não faz sentido "reabrir" chamado que já está aberto, reaberto ou em tratamento.
    // Nesses casos, só adicionamos nova ocorrência e mantemos o status atual.
    if (['aberto', 'reaberto', 'em_tratamento'].includes(previousStatus)) {
      return previousStatus;
    }

    // Se estava encerrado/recusado/divergente/finalizado, reabre.
    return 'reaberto';
  }

  async function saveActiveTicket() {
    if (state.isSaving) return;
    const data = state.activeData;
    const card = state.activeCard;
    const comment = normalizeText($('#xabuia-comment')?.value || '');

    if (!data?.chave || data.chave.length !== 44) {
      showToast('Chave NF-e inválida.', 'error');
      return;
    }

    if (!comment) {
      showToast('Escreva a ocorrência para salvar a Xabuia.', 'error');
      $('#xabuia-comment')?.focus();
      return;
    }

    if (!state.user) {
      showToast('Conecte sua conta Google primeiro.', 'error');
      return;
    }

    if (!state.profile) {
      await loadProfileIfNeeded(true);
    }

    if (!state.profile) {
      showToast('Perfil Xabuia não encontrado para este usuário.', 'error');
      return;
    }

    if (state.profile.papel !== 'usuario') {
      showToast('Abertura pelo Infradesk é permitida apenas para usuários comuns.', 'error');
      return;
    }

    if (state.profile.ativo === false) {
      showToast('Sua conta Xabuia está bloqueada.', 'error');
      return;
    }

    if (!state.profile.organizacaoId) {
      showToast('Seu usuário Xabuia não possui organização.', 'error');
      return;
    }

    state.isSaving = true;
    const saveBtn = $('#xabuia-save');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Salvando...';

    try {
      const chaveBusca = keySearchValue(data.chave);
      const ref = ticketRefForKey(data.chave);
      const snap = await ref.get();
      const existsBefore = snap.exists;
      const previousTicket = existsBefore ? snap.data() : null;
      const previousStatus = previousTicket?.status || '';
      const finalStatus = statusAfterInfradeskOccurrence(existsBefore, previousStatus);
      const now = firebase.firestore.FieldValue.serverTimestamp();
      const userPayload = {
        usuarioId: state.user.uid,
        usuarioNome: selectedUserName(),
        usuarioEmail: state.user.email,
        criadoEm: now
      };

      if (!existsBefore) {
        await ref.set({
          tipoChamado: TIPO_CHAMADO,
          chave: data.chave,
          chaveBusca,
          organizacaoId: state.profile.organizacaoId,
          organizacaoNome: state.profile.organizacaoNome,
          status: 'aberto',
          criadoPor: state.user.uid,
          criadoPorNome: selectedUserName(),
          criadoPorEmail: state.user.email,
          criadoEm: now,
          atualizadoEm: now
        });
      } else if (finalStatus === previousStatus) {
        // Já estava aberto/reaberto/em tratamento: não reabre, só registra movimento.
        await ref.update({
          atualizadoEm: now
        });
      } else {
        // Estava finalizado/divergente/devolvido: reabre automaticamente.
        await ref.update(ticketStatusPayload(finalStatus));
      }

      await ref.collection('historico').add({
        texto: comment,
        tipo: historyTypeForStatus(finalStatus, existsBefore, previousStatus),
        ...userPayload
      });

      const feedback = !existsBefore
        ? 'Xabuia aberta com ocorrência.'
        : finalStatus === previousStatus
          ? 'Ocorrência adicionada sem alterar o status.'
          : 'Xabuia reaberta com ocorrência.';
      showToast(feedback, 'success');

      if (card) {
        const localTicket = {
          status: finalStatus,
          atualizadoEm: new Date()
        };
        const localHistory = {
          texto: comment,
          usuarioNome: selectedUserName(),
          criadoEm: new Date()
        };

        renderCardBox(card, localTicket, localHistory);
        rememberCardTicket(card, localTicket, localHistory);
      }

      closeModal();
    } catch (error) {
      console.error('[Xabuia] Erro ao salvar:', error);
      const message = error?.code === 'permission-denied'
        ? 'Permissão negada pelo Firestore. Confira se o usuário é comum, está ativo e se as regras atuais permitem atualizar status e histórico.'
        : (error.message || 'Erro ao salvar chamado.');
      showToast(message, 'error');
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
    window.clearTimeout(scanCards.timer);
    scanCards.timer = window.setTimeout(() => {
      scanCards();
      // Se o Infradesk redesenhou/moveu cards, confere somente a coluna alvo.
      scheduleTargetRefresh(700, false);
    }, 300);
  });

  function markHumanActivity() {
    state.lastHumanActivityAt = Date.now();
    window.clearTimeout(state.activityRefreshTimer);
    state.activityRefreshTimer = window.setTimeout(() => {
      if (!document.hidden) scheduleTargetRefresh(350, false);
    }, 1200);
  }

  function boot() {
    injectStyles();
    ensureModal();
    scanCards();
    scheduleTargetRefresh(700, true);

    observer.observe(document.body, { childList: true, subtree: true });

    if (!state.periodicRefreshTimer) {
      state.periodicRefreshTimer = window.setInterval(() => {
        if (!document.hidden) scheduleTargetRefresh(0, false);
      }, XABUIA_ACTIVE_REFRESH_TTL_MS);
    }

    window.addEventListener('focus', () => {
      markHumanActivity();
      scheduleTargetRefresh(250, true);
    });
    ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'].forEach((eventName) => {
      window.addEventListener(eventName, markHumanActivity, { passive: true });
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        markHumanActivity();
        scheduleTargetRefresh(250, true);
      }
    });

    console.log(`[Xabuia] Tampermonkey v${XABUIA_VERSION} carregado. Alvo: somente Em Análise Terceiro. Sem listeners; refresh adaptativo por get().`);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
