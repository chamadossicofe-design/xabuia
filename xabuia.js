// ==UserScript==
// @name         Xabuia • Infradesk → Firebase direto
// @namespace    xabuia/infradesk
// @version      4.0.0
// @description  Abre/atualiza chamados Xabuia direto do card do Infradesk, sem seleção manual de status; reabre somente chamados encerrados.
// @author       Xabuia
// @match        https://asp.infradesk.app/backend/chamados/painel*
// @match        https://asp.infradesk.app/backend/chamados*
// @run-at       document-end
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
  const XABUIA_VERSION = '4.0.0';
  const XABUIA_ICON_URL = 'https://chamadossicofe-design.github.io/xabuia/xabuia.png';
  const BOOTSTRAP_ADMIN_EMAIL = 'chamadossicofe@gmail.com';

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
    isSaving: false
  };

  /********************************************************************
   * FIREBASE
   ********************************************************************/
  const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth(app);
  const db = firebase.firestore(app);
  auth.languageCode = 'pt-BR';

  auth.onAuthStateChanged(async (user) => {
    state.authReady = true;
    state.user = user || null;
    state.profile = null;

    if (user) {
      try {
        const snap = await db.collection('usuarios').doc(user.uid).get();
        if (snap.exists) state.profile = { id: snap.id, ...snap.data() };
      } catch (error) {
        console.warn('[Xabuia] Erro ao carregar perfil:', error);
      }
    }

    renderAuthInfo();
    scanCards();
  });

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
        margin: 8px 0 10px;
        padding: 8px 9px;
        border: 1px solid #c7d2fe;
        background: #eef2ff;
        border-radius: 8px;
        color: #1e293b;
        font-size: 12px;
        line-height: 1.35;
      }
      .xabuia-box-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        font-weight: 800;
        margin-bottom: 3px;
      }
      .xabuia-chip {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 2px 7px;
        font-size: 10px;
        font-weight: 900;
        background: #fff;
        color: #1d4ed8;
        border: 1px solid #bfdbfe;
        white-space: nowrap;
      }
      .xabuia-chip.aberto { color: #0f48ba; background: #eff6ff; }
      .xabuia-chip.reaberto { color: #92400e; background: #fef3c7; border-color: #fde68a; }
      .xabuia-chip.em_tratamento { color: #b54708; background: #fff7ed; border-color: #fed7aa; }
      .xabuia-chip.finalizado { color: #067647; background: #ecfdf3; border-color: #bbf7d0; }
      .xabuia-chip.informacoes_divergentes, .xabuia-chip.devolver_recusar { color: #b42318; background: #fef3f2; border-color: #fecdca; }
      .xabuia-box small { color: #64748b; }
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
      authbar.innerHTML = `Logado como <strong>${escapeHtml(state.user.email)}</strong>, mas o perfil Xabuia não foi encontrado.`;
      saveBtn.disabled = true;
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

  /********************************************************************
   * CARD DO INFRADESK
   ********************************************************************/
  function scanCards() {
    injectStyles();
    ensureModal();

    $$('.chamado-item[data-chamado-id]').forEach((card) => {
      if (!card || card.dataset.xabuiaReady === '1') return;
      card.dataset.xabuiaReady = '1';
      addXabuiaButton(card);
      ensureCardBox(card);
      observeCardXabuiaStatus(card);
    });
  }

  function addXabuiaButton(card) {
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

  function ensureCardBox(card) {
    let box = $('.xabuia-box', card);
    if (box) return box;

    box = document.createElement('div');
    box.className = 'xabuia-box';
    box.innerHTML = `
      <div class="xabuia-box-head">
        <span>Xabuia</span>
        <span class="xabuia-chip">Sem chamado</span>
      </div>
      <div class="xabuia-box-body"><small>Aguardando abertura.</small></div>
    `;

    const tags = $('.chamado-tags', card);
    if (tags?.parentElement) {
      tags.insertAdjacentElement('afterend', box);
    } else {
      const body = card.children?.[0] || card;
      body.appendChild(box);
    }
    return box;
  }

  function renderCardBox(card, ticket = null, history = null, loading = false) {
    const box = ensureCardBox(card);
    if (loading) {
      box.innerHTML = `
        <div class="xabuia-box-head">
          <span>Xabuia</span>
          <span class="xabuia-chip">Consultando...</span>
        </div>
        <div class="xabuia-box-body"><small>Buscando status no Firebase.</small></div>
      `;
      return;
    }

    if (!ticket) {
      box.innerHTML = `
        <div class="xabuia-box-head">
          <span>Xabuia</span>
          <span class="xabuia-chip">Sem chamado</span>
        </div>
        <div class="xabuia-box-body"><small>Aguardando abertura.</small></div>
      `;
      return;
    }

    const status = ticket.status || 'aberto';
    const label = STATUS_LABELS[status] || status;
    const histText = history?.texto ? escapeHtml(history.texto) : 'Sem histórico.';
    const histUser = history?.usuarioNome || history?.usuarioEmail || '';
    const histDate = formatDate(history?.criadoEm || ticket.atualizadoEm);
    box.innerHTML = `
      <div class="xabuia-box-head">
        <span>Xabuia</span>
        <span class="xabuia-chip ${escapeHtml(status)}">${escapeHtml(label)}</span>
      </div>
      <div class="xabuia-box-body">
        <div><strong>Última ocorrência:</strong> ${histText}</div>
        <small>${escapeHtml(histDate)}${histUser ? ' • ' : ''}${escapeHtml(histUser)}</small>
      </div>
    `;
  }

  function observeCardXabuiaStatus(card) {
    if (!canOpenFromInfradesk()) return;
    const data = parseCard(card);
    if (!data.chave || data.chave.length !== 44) return;
    const key = `${card.getAttribute('data-chamado-id')}|${data.chave}`;
    if (state.cardUnsubs.has(key)) return;

    const ref = ticketRefForKey(data.chave);
    if (!ref) return;

    renderCardBox(card, null, null, true);
    let lastTicket = null;
    let unsubHistory = null;

    const unsubTicket = ref.onSnapshot((snap) => {
      if (!snap.exists) {
        lastTicket = null;
        if (unsubHistory) {
          unsubHistory();
          unsubHistory = null;
        }
        renderCardBox(card, null);
        return;
      }

      lastTicket = { id: snap.id, ...snap.data() };
      renderCardBox(card, lastTicket, null);

      if (!unsubHistory) {
        unsubHistory = ref.collection('historico')
          .orderBy('criadoEm', 'desc')
          .limit(1)
          .onSnapshot((historySnap) => {
            const item = historySnap.docs[0]?.data() || null;
            renderCardBox(card, lastTicket, item);
          }, (error) => {
            console.warn('[Xabuia] Erro ao ler histórico:', error);
            renderCardBox(card, lastTicket, null);
          });
      }
    }, (error) => {
      console.warn('[Xabuia] Erro ao ler chamado:', error);
      const box = ensureCardBox(card);
      box.innerHTML = `
        <div class="xabuia-box-head">
          <span>Xabuia</span>
          <span class="xabuia-chip">Erro</span>
        </div>
        <div class="xabuia-box-body"><small>${escapeHtml(error.message || 'Erro ao consultar Firebase.')}</small></div>
      `;
    });

    state.cardUnsubs.set(key, () => {
      try { unsubTicket(); } catch (_) {}
      try { if (unsubHistory) unsubHistory(); } catch (_) {}
    });
  }

  /********************************************************************
   * MODAL E SALVAMENTO
   ********************************************************************/
  function openModal(card) {
    state.activeCard = card;
    state.activeData = parseCard(card);

    if (!state.activeData.chave || state.activeData.chave.length !== 44) {
      showToast('Não encontrei uma chave NF-e de 44 dígitos neste card.', 'error');
      return;
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
        renderCardBox(card, {
          status: finalStatus,
          atualizadoEm: new Date()
        }, {
          texto: comment,
          usuarioNome: selectedUserName(),
          criadoEm: new Date()
        });
        observeCardXabuiaStatus(card);
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
    scanCards.timer = window.setTimeout(scanCards, 300);
  });

  function boot() {
    injectStyles();
    ensureModal();
    scanCards();
    observer.observe(document.body, { childList: true, subtree: true });
    console.log(`[Xabuia] Tampermonkey v${XABUIA_VERSION} carregado.`);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
