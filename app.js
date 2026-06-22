import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js';
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  updateProfile,
  signOut
} from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js';
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  onSnapshot,
  limit
} from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js';
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL
} from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-storage.js';

const firebaseConfig = {
  apiKey: 'AIzaSyADfd6RhNN6rj6qX1judbjevvh-ZwMwmJE',
  authDomain: 'chamadossicofe-36fbe.firebaseapp.com',
  projectId: 'chamadossicofe-36fbe',
  storageBucket: 'chamadossicofe-36fbe.firebasestorage.app',
  messagingSenderId: '81395419196',
  appId: '1:81395419196:web:8322d61652f6240b49db39'
};

const APP_VERSION = 'V10';
const BOOTSTRAP_ADMIN_EMAIL = 'chamadossicofe@gmail.com';
const STATUS_LABELS = {
  aberto: 'Aberto',
  reaberto: 'Reaberto',
  em_tratamento: 'Em tratamento',
  finalizado: 'Finalizado'
};

const HISTORY_TYPE_LABELS = {
  criacao: 'Criação',
  observacao: 'Observação',
  fiscal: 'Fiscal',
  divergencia: 'Divergência',
  devolucao: 'Devolução',
  reentrega: 'Reentrega',
  contato: 'Contato',
  tratativa: 'Tratativa',
  anexo: 'Anexo',
  status: 'Status',
  reabertura: 'Reabertura'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
auth.languageCode = 'pt-BR';
const db = getFirestore(app);
const storage = getStorage(app);
const googleProvider = new GoogleAuthProvider();

const $ = (id) => document.getElementById(id);

const els = {
  toast: $('toast'),
  authView: $('authView'),
  onboardingView: $('onboardingView'),
  blockedView: $('blockedView'),
  appView: $('appView'),
  tabLogin: $('tabLogin'),
  tabRegister: $('tabRegister'),
  authForm: $('authForm'),
  nameField: $('nameField'),
  displayNameInput: $('displayNameInput'),
  emailInput: $('emailInput'),
  passwordInput: $('passwordInput'),
  authSubmitBtn: $('authSubmitBtn'),
  googleBtn: $('googleBtn'),
  resetPasswordBtn: $('resetPasswordBtn'),
  connectionHelp: $('connectionHelp'),
  onboardingForm: $('onboardingForm'),
  onboardingNameInput: $('onboardingNameInput'),
  onboardingOrgSelect: $('onboardingOrgSelect'),
  onboardingEmpty: $('onboardingEmpty'),
  logoutOnboardingBtn: $('logoutOnboardingBtn'),
  logoutBlockedBtn: $('logoutBlockedBtn'),
  userLine: $('userLine'),
  adminPanel: $('adminPanel'),
  quickOrgForm: $('quickOrgForm'),
  quickOrgNameInput: $('quickOrgNameInput'),
  quickOrgList: $('quickOrgList'),
  newTicketBtn: $('newTicketBtn'),
  adminBtn: $('adminBtn'),
  logoutBtn: $('logoutBtn'),
  searchInput: $('searchInput'),
  statusFilter: $('statusFilter'),
  orgFilterWrap: $('orgFilterWrap'),
  orgFilter: $('orgFilter'),
  countAberto: $('countAberto'),
  countReaberto: $('countReaberto'),
  countTratamento: $('countTratamento'),
  countFinalizado: $('countFinalizado'),
  countTotal: $('countTotal'),
  liveStatus: $('liveStatus'),
  ticketList: $('ticketList'),
  ticketDetail: $('ticketDetail'),
  ticketDialog: $('ticketDialog'),
  ticketForm: $('ticketForm'),
  ticketKeyInput: $('ticketKeyInput'),
  ticketOrgWrap: $('ticketOrgWrap'),
  ticketOrgSelect: $('ticketOrgSelect'),
  ticketObsInput: $('ticketObsInput'),
  ticketTypeSelect: $('ticketTypeSelect'),
  ticketFileInput: $('ticketFileInput'),
  ticketPasteZone: $('ticketPasteZone'),
  ticketPastePreview: $('ticketPastePreview'),
  clearTicketFileBtn: $('clearTicketFileBtn'),
  saveTicketBtn: $('saveTicketBtn'),
  adminDialog: $('adminDialog'),
  orgForm: $('orgForm'),
  orgNameInput: $('orgNameInput'),
  orgAdminList: $('orgAdminList'),
  usersAdminList: $('usersAdminList'),
  operatorReportStart: $('operatorReportStart'),
  operatorReportEnd: $('operatorReportEnd'),
  operatorReportBtn: $('operatorReportBtn'),
  operatorReportBox: $('operatorReportBox')
};

const state = {
  mode: 'login',
  user: null,
  profile: null,
  orgs: [],
  users: [],
  tickets: [],
  selectedTicketId: null,
  pendingTicketFile: null,
  pendingHistoryFile: null,
  ticketBuckets: {},
  unsubTickets: null,
  unsubOrgs: null,
  unsubUsers: null
};

function showToast(message, type = 'info') {
  els.toast.textContent = message;
  els.toast.className = `toast ${type === 'error' ? 'error' : type === 'success' ? 'success' : ''}`;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => els.toast.classList.add('hidden'), 4200);
}

function showConnectionHelp(message = '') {
  if (!els.connectionHelp) return;
  els.connectionHelp.innerHTML = `
    <strong>Firestore bloqueou ou ainda não respondeu.</strong><br>
    ${escapeHtml(message || 'Crie o Cloud Firestore e publique o arquivo firestore.rules.')}<br><br>
    Se aparecer <strong>Missing or insufficient permissions</strong>, quase sempre é porque as regras ainda não foram publicadas no menu
    <strong>Firestore Database &gt; Regras</strong>. Cole o arquivo <strong>firestore.rules</strong> inteiro e clique em <strong>Publicar</strong>.
  `;
  els.connectionHelp.classList.remove('hidden');
}

function hideConnectionHelp() {
  if (els.connectionHelp) els.connectionHelp.classList.add('hidden');
}

function showOnly(view) {
  [els.authView, els.onboardingView, els.blockedView, els.appView].forEach((el) => el.classList.add('hidden'));
  view.classList.remove('hidden');
}

function isBootstrapAdmin(user = state.user) {
  return user?.email?.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL;
}

function isAdmin() {
  return state.profile?.papel === 'admin' || isBootstrapAdmin();
}

function isOperatorOrAdmin() {
  return ['admin', 'operador'].includes(state.profile?.papel) || isBootstrapAdmin();
}

function normalizeKey(value) {
  return String(value || '').trim();
}

function digitsOnly(value) {
  return String(value || '').replace(/\D+/g, '');
}

function keySearchValue(value) {
  const digits = digitsOnly(value);
  return digits || normalizeKey(value).toLowerCase();
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

function safeDocPart(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'item';
}

function ticketDocId(orgId, chaveBusca) {
  return `${safeDocPart(orgId)}_${hashText(chaveBusca)}`;
}

function parseNfeKey(chave) {
  const digits = digitsOnly(chave);
  if (digits.length !== 44) return null;

  const notaRaw = digits.slice(25, 34);
  const notaNumero = Number.parseInt(notaRaw, 10);

  return {
    chave: digits,
    uf: digits.slice(0, 2),
    anoMes: digits.slice(2, 6),
    cnpj: digits.slice(6, 20),
    modelo: digits.slice(20, 22),
    serie: digits.slice(22, 25),
    numeroRaw: notaRaw,
    numero: Number.isFinite(notaNumero) ? String(notaNumero) : notaRaw,
    tipoEmissao: digits.slice(34, 35),
    codigo: digits.slice(35, 43),
    digito: digits.slice(43, 44)
  };
}

function compactKeyTitle(chave) {
  const parsed = parseNfeKey(chave);
  if (!parsed) return normalizeKey(chave);
  return `NF ${parsed.numero} • CNPJ ${parsed.cnpj}`;
}

function renderKeyInfo(chave) {
  const parsed = parseNfeKey(chave);
  if (!parsed) {
    return `<div class="key-box"><div class="key-raw">${escapeHtml(chave)}</div></div>`;
  }

  return `
    <div class="key-box">
      <div class="key-main">${escapeHtml(parsed.chave)}</div>
      <div class="key-facts">
        <span><strong>Número:</strong> ${escapeHtml(parsed.numero)}</span>
        <span><strong>CNPJ:</strong> ${escapeHtml(parsed.cnpj)}</span>
        <span><strong>Série:</strong> ${escapeHtml(parsed.serie)}</span>
        <span><strong>Modelo:</strong> ${escapeHtml(parsed.modelo)}</span>
      </div>
    </div>
  `;
}

function historyTypeLabel(type) {
  return HISTORY_TYPE_LABELS[type] || type || 'Observação';
}

function historyTypeBadge(type) {
  const safe = String(type || 'observacao').replace(/[^a-z0-9_-]/gi, '_');
  return `<span class="history-type ${safe}">${escapeHtml(historyTypeLabel(type))}</span>`;
}

function selectedUserName() {
  return state.profile?.nome || state.user?.displayName || state.user?.email || 'Usuário';
}

function safeIdFromName(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || `org-${Date.now()}`;
}

function formatDate(value) {
  if (!value) return '—';
  const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(date);
}

function timestampMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function roleLabel(role) {
  return ({ admin: 'Admin', operador: 'Operador', usuario: 'Usuário' })[role] || role || 'Usuário';
}

function statusBadge(status) {
  const label = STATUS_LABELS[status] || status || 'Aberto';
  const safe = status || 'aberto';
  return `<span class="status ${safe}">${label}</span>`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function setText(el, value) {
  if (el) el.textContent = value;
}

async function loadOrCreateProfile(user) {
  const profileRef = doc(db, 'usuarios', user.uid);
  const snap = await getDoc(profileRef);

  if (snap.exists()) {
    return { id: snap.id, ...snap.data() };
  }

  if (user.email?.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL) {
    const data = {
      uid: user.uid,
      nome: user.displayName || 'Administrador SICOFÊ',
      email: user.email,
      organizacaoId: null,
      organizacaoNome: 'Todas as organizações',
      papel: 'admin',
      ativo: true,
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp()
    };
    await setDoc(profileRef, data);
    return { id: user.uid, ...data };
  }

  return null;
}

function startOrgListener() {
  if (state.unsubOrgs) state.unsubOrgs();
  const q = query(collection(db, 'organizacoes'), orderBy('nome'));
  state.unsubOrgs = onSnapshot(q, (snapshot) => {
    state.orgs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    hideConnectionHelp();
    renderOrgSelects();
    if (isAdmin()) renderAdmin();
  }, (error) => {
    const msg = error?.code === 'permission-denied'
      ? 'Firestore negou a leitura das organizações. Publique o arquivo firestore.rules no Firebase Console.'
      : `Erro ao carregar organizações: ${error.message}`;
    showToast(msg, 'error');
    showConnectionHelp(msg);
  });
}

function renderOrgSelects() {
  const activeOrgs = state.orgs.filter((org) => org.ativa !== false);

  const fill = (select, includeAll = false) => {
    const current = select.value;
    select.innerHTML = '';
    if (includeAll) {
      const opt = document.createElement('option');
      opt.value = 'todas';
      opt.textContent = 'Todas';
      select.appendChild(opt);
    }
    activeOrgs.forEach((org) => {
      const opt = document.createElement('option');
      opt.value = org.id;
      opt.textContent = org.nome;
      select.appendChild(opt);
    });
    if ([...select.options].some((opt) => opt.value === current)) select.value = current;
  };

  fill(els.onboardingOrgSelect, false);
  fill(els.ticketOrgSelect, false);
  fill(els.orgFilter, true);

  const hasOrgs = activeOrgs.length > 0;
  els.onboardingEmpty.classList.toggle('hidden', hasOrgs);
  els.onboardingOrgSelect.disabled = !hasOrgs;
}

function startUsersListener() {
  if (state.unsubUsers) state.unsubUsers();
  if (!isAdmin()) return;

  const q = query(collection(db, 'usuarios'), orderBy('nome'));
  state.unsubUsers = onSnapshot(q, (snapshot) => {
    state.users = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderAdmin();
  }, (error) => showToast(`Erro ao carregar usuários: ${error.message}`, 'error'));
}

function stopTicketsListener() {
  if (Array.isArray(state.unsubTickets)) {
    state.unsubTickets.forEach((unsub) => {
      try { unsub(); } catch (_) {}
    });
  } else if (typeof state.unsubTickets === 'function') {
    try { state.unsubTickets(); } catch (_) {}
  }
  state.unsubTickets = null;
  state.ticketBuckets = {};
}

function mergeTicketBuckets() {
  try {
    const byId = new Map();
    Object.values(state.ticketBuckets).flat().forEach((ticket) => {
      if (ticket?.id) byId.set(ticket.id, ticket);
    });
    state.tickets = [...byId.values()].sort((a, b) => timestampMillis(b.atualizadoEm) - timestampMillis(a.atualizadoEm));
    renderTickets();
    setText(els.liveStatus, 'Ao vivo');
  } catch (error) {
    console.error('Erro ao renderizar chamados:', error);
    setText(els.liveStatus, 'Erro');
    showToast(`Erro ao mostrar chamados: ${error.message}`, 'error');
  }
}

function listenTicketBucket(name, q) {
  return onSnapshot(q, (snapshot) => {
    state.ticketBuckets[name] = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    mergeTicketBuckets();
  }, (error) => {
    setText(els.liveStatus, 'Erro');
    if (String(error?.message || '').includes('requires an index')) {
      showToast('O Firestore pediu um índice composto. Esta versão evita os índices compostos principais; confira se atualizou todos os arquivos e recarregou com Ctrl + F5.', 'error');
      return;
    }
    showToast(`Erro ao carregar chamados: ${error.message}`, 'error');
  });
}

function startTicketsListener() {
  stopTicketsListener();
  setText(els.liveStatus, 'Atualizando...');

  if (isAdmin()) {
    state.unsubTickets = [listenTicketBucket('admin', query(collection(db, 'chamados')))];
    return;
  }

  if (state.profile?.papel === 'operador') {
    // Operador vê a fila geral aberta/reaberta/finalizada e, dos chamados em tratamento,
    // somente aqueles que ele mesmo colocou em tratamento. A tela começa filtrada só nos ativos.
    state.unsubTickets = [
      listenTicketBucket('fila', query(collection(db, 'chamados'), where('status', 'in', ['aberto', 'reaberto', 'finalizado']))),
      listenTicketBucket('meus', query(collection(db, 'chamados'), where('operadorTratamentoId', '==', state.user.uid)))
    ];
    return;
  }

  // Usuário comum vê sua organização. O filtro padrão mostra só ativos e limita em 20 na tela;
  // ao pesquisar ou trocar o filtro, consegue localizar chamados antigos da organização.
  state.unsubTickets = [
    listenTicketBucket('org', query(collection(db, 'chamados'), where('organizacaoId', '==', state.profile.organizacaoId)))
  ];
}

function filteredTickets() {
  const searchRaw = normalizeKey(els.searchInput.value);
  const search = searchRaw.toLowerCase();
  const searchDigits = digitsOnly(searchRaw);
  const status = els.statusFilter.value || 'ativos';
  const orgId = els.orgFilter.value;
  const activeStatuses = ['aberto', 'reaberto', 'em_tratamento'];

  let tickets = state.tickets.filter((ticket) => {
    if (status === 'ativos' && !activeStatuses.includes(ticket.status || 'aberto')) return false;
    if (status !== 'todos' && status !== 'ativos' && ticket.status !== status) return false;
    if (isOperatorOrAdmin() && orgId && orgId !== 'todas' && ticket.organizacaoId !== orgId) return false;

    if (search) {
      const chave = String(ticket.chave || '').toLowerCase();
      const chaveDigits = digitsOnly(chave);
      const title = compactKeyTitle(ticket.chave).toLowerCase();
      const matchText = chave.includes(search) || title.includes(search);
      const matchDigits = searchDigits && chaveDigits.includes(searchDigits);
      if (!matchText && !matchDigits) return false;
    }

    return true;
  });

  // Padrão para usuário comum: não deixa a tela enorme.
  // Se ele pesquisar ou mudar para outro status, mostramos tudo que bater com o filtro.
  if (!isOperatorOrAdmin() && status === 'ativos' && !search) {
    tickets = tickets.slice(0, 20);
  }

  return tickets;
}

function renderTickets() {
  const tickets = filteredTickets();
  const counts = tickets.reduce((acc, ticket) => {
    acc[ticket.status || 'aberto'] = (acc[ticket.status || 'aberto'] || 0) + 1;
    return acc;
  }, {});

  setText(els.countAberto, counts.aberto || 0);
  setText(els.countReaberto, counts.reaberto || 0);
  setText(els.countTratamento, counts.em_tratamento || 0);
  setText(els.countFinalizado, counts.finalizado || 0);
  setText(els.countTotal, tickets.length);

  if (!tickets.length) {
    els.ticketList.innerHTML = '<div class="empty-state">Nenhum chamado encontrado.</div>';
    if (state.selectedTicketId && !state.tickets.some((t) => t.id === state.selectedTicketId)) {
      state.selectedTicketId = null;
      renderTicketDetail(null);
    }
    return;
  }

  els.ticketList.innerHTML = tickets.map((ticket) => `
    <button class="ticket-item ${ticket.id === state.selectedTicketId ? 'active' : ''}" type="button" data-ticket-id="${ticket.id}">
      <div class="ticket-row">
        <span class="ticket-key">${escapeHtml(compactKeyTitle(ticket.chave))}</span>
        ${statusBadge(ticket.status)}
      </div>
      <div class="ticket-raw-key">${escapeHtml(ticket.chave)}</div>
      <div class="ticket-meta">
        <span>${escapeHtml(ticket.organizacaoNome || 'Sem organização')}</span>
        <span>•</span>
        <span>Criado por ${escapeHtml(ticket.criadoPorNome || ticket.criadoPorEmail || '—')}</span>
        ${ticket.operadorTratamentoNome ? `<span>•</span><span>Tratando: ${escapeHtml(ticket.operadorTratamentoNome)}</span>` : ''}
        <span>•</span>
        <span>${formatDate(ticket.atualizadoEm)}</span>
      </div>
    </button>
  `).join('');

  if (state.selectedTicketId) {
    renderTicketDetail(state.tickets.find((t) => t.id === state.selectedTicketId));
  }
}

async function selectTicket(ticketId) {
  state.selectedTicketId = ticketId;
  const ticket = state.tickets.find((t) => t.id === ticketId);
  renderTickets();
  await renderTicketDetail(ticket);
}

async function renderTicketDetail(ticket) {
  if (!ticket) {
    els.ticketDetail.className = 'card detail-card empty';
    els.ticketDetail.innerHTML = `
      <h2>Selecione um chamado</h2>
      <p class="muted">Clique em um chamado para ver o histórico e adicionar novas observações.</p>
    `;
    return;
  }

  const assignedLine = ticket.status === 'em_tratamento' && ticket.operadorTratamentoNome
    ? `<p class="muted">Em tratamento com <strong>${escapeHtml(ticket.operadorTratamentoNome)}</strong>.</p>`
    : '';

  els.ticketDetail.className = 'card detail-card';
  els.ticketDetail.innerHTML = `
    <div class="section-head detail-head">
      <div>
        <h2 class="detail-title">${escapeHtml(compactKeyTitle(ticket.chave))}</h2>
        <p class="muted">${escapeHtml(ticket.organizacaoNome || 'Sem organização')} • Atualizado ${formatDate(ticket.atualizadoEm)}</p>
        ${assignedLine}
      </div>
      ${statusBadge(ticket.status)}
    </div>

    ${renderKeyInfo(ticket.chave)}

    ${ticket.anexo?.url ? `<p><a class="attachment-link" href="${escapeHtml(ticket.anexo.url)}" target="_blank" rel="noopener">Abrir último anexo: ${escapeHtml(ticket.anexo.nome || 'arquivo')}</a></p>` : ''}

    <div class="detail-actions">
      ${isOperatorOrAdmin() ? `
        <label class="field compact">
          <span>Status</span>
          <select id="detailStatusSelect">
            <option value="aberto">Aberto</option>
            <option value="reaberto">Reaberto</option>
            <option value="em_tratamento">Em tratamento</option>
            <option value="finalizado">Finalizado</option>
          </select>
        </label>
      ` : ''}
      ${ticket.status === 'finalizado' ? `<button id="reopenTicketBtn" class="btn ghost" type="button">Reabrir chamado</button>` : ''}
      <label class="field grow">
        <span>Nova ocorrência</span>
        <textarea id="newHistoryText" rows="3" placeholder="Digite uma nova ocorrência"></textarea>
      </label>
      <button id="addHistoryBtn" class="btn primary" type="button">Adicionar</button>
    </div>

    <div class="history-attachment">
      <input id="historyFileInput" class="hidden-file" type="file" accept="image/*,.pdf,.txt,.csv,.xlsx,.xls,.doc,.docx" />
      <div id="historyPasteZone" class="paste-zone paste-zone-small" tabindex="0" role="button" aria-label="Adicionar anexo na ocorrência">
        <div class="paste-empty">
          <strong>Anexo da ocorrência</strong>
          <small>Cole um print com Ctrl+V, clique para escolher arquivo ou arraste aqui.</small>
        </div>
        <div id="historyPastePreview" class="paste-preview hidden"></div>
      </div>
      <button id="clearHistoryFileBtn" class="btn ghost hidden" type="button">Remover anexo da ocorrência</button>
    </div>

    <h3>Histórico</h3>
    <div id="historyList" class="history"><div class="empty-state">Carregando histórico...</div></div>
  `;

  if (isOperatorOrAdmin()) {
    const select = $('detailStatusSelect');
    select.value = ticket.status || 'aberto';
    select.addEventListener('change', () => updateTicketStatus(ticket, select.value));
  }

  const reopenButton = $('reopenTicketBtn');
  if (reopenButton) reopenButton.addEventListener('click', () => reopenTicket(ticket, 'Chamado reaberto manualmente.'));

  clearHistoryAttachment();
  setupHistoryPasteZone();
  $('addHistoryBtn').addEventListener('click', () => addHistory(ticket.id));
  await loadHistory(ticket.id);
}

async function loadHistory(ticketId) {
  const historyList = $('historyList');
  if (!historyList) return;

  const q = query(collection(db, 'chamados', ticketId, 'historico'), orderBy('criadoEm', 'asc'));
  const snapshot = await getDocs(q);
  const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

  if (!items.length) {
    historyList.innerHTML = '<div class="empty-state">Nenhuma observação registrada.</div>';
    return;
  }

  historyList.innerHTML = items.map((item) => `
    <div class="history-item">
      <div class="history-item-head">
        <strong>${escapeHtml(item.usuarioNome || item.usuarioEmail || 'Sistema')}</strong>
        ${historyTypeBadge(item.tipo)}
      </div>
      <div class="history-text">${escapeHtml(item.texto)}</div>
      ${item.anexo?.url ? `<a class="attachment-link" href="${escapeHtml(item.anexo.url)}" target="_blank" rel="noopener">Abrir anexo: ${escapeHtml(item.anexo.nome || 'arquivo')}</a>` : ''}
      <small>${formatDate(item.criadoEm)}</small>
    </div>
  `).join('');
}

async function addHistory(ticketId) {
  const textarea = $('newHistoryText');
  const texto = normalizeKey(textarea.value);
  const file = state.pendingHistoryFile || $('historyFileInput')?.files?.[0] || null;
  if (!texto && !file) return showToast('Digite a ocorrência ou anexe um arquivo antes de adicionar.', 'error');

  const { anexo, warning } = await tryUploadTicketFile(ticketId, file);
  const textoFinal = texto || `Anexo enviado: ${file?.name || 'imagem-colada.png'}`;

  await addDoc(collection(db, 'chamados', ticketId, 'historico'), {
    texto: textoFinal,
    tipo: 'observacao',
    usuarioId: state.user.uid,
    usuarioNome: selectedUserName(),
    usuarioEmail: state.user.email,
    criadoEm: serverTimestamp(),
    ...(anexo ? { anexo } : {})
  });

  await updateDoc(doc(db, 'chamados', ticketId), {
    atualizadoEm: serverTimestamp(),
    ...(anexo ? { anexo } : {})
  });

  textarea.value = '';
  clearHistoryAttachment();
  await loadHistory(ticketId);
  showToast(warning || 'Ocorrência adicionada.', warning ? 'error' : 'success');
}

async function addSystemHistory(ticketId, texto, tipo = 'status', extra = {}) {
  await addDoc(collection(db, 'chamados', ticketId, 'historico'), {
    texto,
    tipo,
    usuarioId: state.user.uid,
    usuarioNome: selectedUserName(),
    usuarioEmail: state.user.email,
    criadoEm: serverTimestamp(),
    ...extra
  });
}

async function uploadTicketFile(ticketId, file) {
  if (!file) return null;
  const cleanName = (file.name || 'imagem-colada.png').replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `chamados/${ticketId}/${Date.now()}-${cleanName}`;
  const fileRef = ref(storage, path);
  await uploadBytes(fileRef, file, { contentType: file.type || 'application/octet-stream' });
  const url = await getDownloadURL(fileRef);
  return {
    nome: file.name || 'imagem-colada.png',
    tipo: file.type || null,
    tamanho: file.size,
    path,
    url
  };
}

async function tryUploadTicketFile(ticketId, file) {
  if (!file) return { anexo: null, warning: '' };

  try {
    const anexo = await uploadTicketFile(ticketId, file);
    return { anexo, warning: '' };
  } catch (error) {
    console.warn('Anexo não enviado:', error);
    const message = String(error?.message || '');
    const code = String(error?.code || '');
    const storageHint = code.includes('storage/') || message.toLowerCase().includes('storage') || message.includes('permission');
    return {
      anexo: null,
      warning: storageHint
        ? 'Chamado salvo, mas o anexo não foi enviado. Crie o Cloud Storage e publique o storage.rules quando for ativar anexos.'
        : `Chamado salvo, mas o anexo não foi enviado: ${message || code}`
    };
  }
}

function ticketStatusPayload(status) {
  const payload = {
    status,
    atualizadoEm: serverTimestamp()
  };

  if (status === 'em_tratamento') {
    payload.operadorTratamentoId = state.user.uid;
    payload.operadorTratamentoNome = selectedUserName();
    payload.operadorTratamentoEmail = state.user.email;
    payload.tratamentoIniciadoEm = serverTimestamp();
  }

  if (['aberto', 'reaberto'].includes(status)) {
    payload.operadorTratamentoId = null;
    payload.operadorTratamentoNome = null;
    payload.operadorTratamentoEmail = null;
    payload.tratamentoIniciadoEm = null;
  }

  if (status === 'finalizado') {
    payload.finalizadoPor = state.user.uid;
    payload.finalizadoPorNome = selectedUserName();
    payload.finalizadoPorEmail = state.user.email;
    payload.finalizadoEm = serverTimestamp();
  }

  if (status === 'reaberto') {
    payload.reabertoPor = state.user.uid;
    payload.reabertoPorNome = selectedUserName();
    payload.reabertoPorEmail = state.user.email;
    payload.reabertoEm = serverTimestamp();
  }

  return payload;
}

async function reopenTicket(ticket, texto = 'Chamado reaberto.') {
  await updateDoc(doc(db, 'chamados', ticket.id), ticketStatusPayload('reaberto'));
  await addSystemHistory(ticket.id, texto, 'reabertura');
  showToast('Chamado reaberto.', 'success');
}

async function updateTicketStatus(ticket, status) {
  if (!STATUS_LABELS[status]) return;
  await updateDoc(doc(db, 'chamados', ticket.id), ticketStatusPayload(status));

  await addSystemHistory(ticket.id, `Status alterado para ${STATUS_LABELS[status]}.`, status === 'reaberto' ? 'reabertura' : 'status');

  showToast('Status atualizado.', 'success');
}

async function createTicket(event) {
  event.preventDefault();
  const chave = normalizeKey(els.ticketKeyInput.value);
  const observacao = normalizeKey(els.ticketObsInput.value);
  const tipo = els.ticketTypeSelect?.value || 'criacao';
  const file = state.pendingTicketFile || els.ticketFileInput.files?.[0] || null;

  if (!chave || !observacao) return showToast('Preencha chave e ocorrência.', 'error');

  let org;
  if (isOperatorOrAdmin()) {
    org = state.orgs.find((item) => item.id === els.ticketOrgSelect.value);
  } else {
    org = { id: state.profile.organizacaoId, nome: state.profile.organizacaoNome };
  }
  if (!org?.id) return showToast('Selecione uma organização.', 'error');

  els.saveTicketBtn.disabled = true;
  els.saveTicketBtn.textContent = 'Salvando...';

  try {
    const chaveBusca = keySearchValue(chave);
    const deterministicRef = doc(db, 'chamados', ticketDocId(org.id, chaveBusca));
    const existingInMemory = state.tickets.find((ticket) => (
      ticket.organizacaoId === org.id
      && (ticket.chaveBusca === chaveBusca || keySearchValue(ticket.chave) === chaveBusca)
    ));

    let existingSnap = null;
    if (!existingInMemory) {
      try {
        existingSnap = await getDoc(deterministicRef);
      } catch (error) {
        // Algumas regras antigas negavam getDoc() quando o chamado ainda não existia.
        // Nesse caso seguimos para o setDoc(); se já existir e não puder alterar, o Firestore vai negar ali.
        if (error?.code !== 'permission-denied') throw error;
        console.warn('Consulta prévia do chamado foi negada; tentando salvar direto.', error);
      }
    }

    const existingRef = existingInMemory ? doc(db, 'chamados', existingInMemory.id) : deterministicRef;
    const existingTicket = existingInMemory || (existingSnap?.exists() ? { id: deterministicRef.id, ...existingSnap.data() } : null);

    if (existingTicket) {
      await updateDoc(existingRef, ticketStatusPayload('reaberto'));

      const { anexo, warning } = await tryUploadTicketFile(existingRef.id, file);
      if (anexo) {
        await updateDoc(existingRef, { anexo, atualizadoEm: serverTimestamp() });
      }

      await addSystemHistory(existingRef.id, observacao, 'reabertura', anexo ? { anexo } : {});
      showToast(warning || 'Já existia chamado com essa chave. Reabri o mesmo chamado e incluí a nova ocorrência.', warning ? 'error' : 'success');
      state.selectedTicketId = existingRef.id;
    } else {
      await setDoc(deterministicRef, {
        chave,
        chaveBusca,
        organizacaoId: org.id,
        organizacaoNome: org.nome,
        status: 'aberto',
        criadoPor: state.user.uid,
        criadoPorNome: selectedUserName(),
        criadoPorEmail: state.user.email,
        criadoEm: serverTimestamp(),
        atualizadoEm: serverTimestamp()
      });

      const { anexo, warning } = await tryUploadTicketFile(deterministicRef.id, file);
      if (anexo) {
        await updateDoc(deterministicRef, {
          anexo,
          atualizadoEm: serverTimestamp()
        });
      }

      await addDoc(collection(db, 'chamados', deterministicRef.id, 'historico'), {
        texto: observacao,
        tipo,
        usuarioId: state.user.uid,
        usuarioNome: selectedUserName(),
        usuarioEmail: state.user.email,
        criadoEm: serverTimestamp(),
        ...(anexo ? { anexo } : {})
      });

      state.selectedTicketId = deterministicRef.id;
      showToast(warning || 'Chamado criado com sucesso.', warning ? 'error' : 'success');
    }

    els.ticketForm.reset();
    clearTicketAttachment();
    els.ticketDialog.close();
  } catch (error) {
    const message = error?.code === 'permission-denied'
      ? 'Permissão negada pelo Firestore. Publique o firestore.rules da V10. Se estava usando anexo, crie também o Cloud Storage e publique o storage.rules.'
      : error.message;
    showToast(`Erro ao salvar chamado: ${message}`, 'error');
  } finally {
    els.saveTicketBtn.disabled = false;
    els.saveTicketBtn.textContent = 'Salvar chamado';
  }
}

function renderApp() {
  const profile = state.profile;
  els.userLine.textContent = `${profile.nome || state.user.email} • ${roleLabel(profile.papel)} • ${profile.organizacaoNome || 'Todas as organizações'}`;
  els.adminBtn.classList.toggle('hidden', !isAdmin());
  els.adminPanel?.classList.toggle('hidden', true);
  els.orgFilterWrap.classList.toggle('hidden', !isOperatorOrAdmin());
  els.ticketOrgWrap?.classList.toggle('hidden', !isOperatorOrAdmin());
  showOnly(els.appView);
  renderOrgSelects();
  startTicketsListener();
  startUsersListener();
}

function renderAdmin() {
  if (!isAdmin()) return;

  const orgHtml = state.orgs.length ? state.orgs.map((org) => `
    <div class="mini-item">
      <div class="mini-item-head">
        <div>
          <strong>${escapeHtml(org.nome)}</strong><br>
          <small class="muted">ID: ${escapeHtml(org.id)}</small>
        </div>
        <span class="pill">${org.ativa === false ? 'Inativa' : 'Ativa'}</span>
      </div>
      <button class="btn ghost" type="button" data-toggle-org="${org.id}" data-active="${org.ativa === false ? 'true' : 'false'}">
        ${org.ativa === false ? 'Reativar' : 'Desativar'}
      </button>
    </div>
  `).join('') : '<div class="empty-state">Nenhuma organização cadastrada. Cadastre a primeira acima.</div>';

  els.orgAdminList.innerHTML = orgHtml;
  if (els.quickOrgList) els.quickOrgList.innerHTML = orgHtml;

  els.usersAdminList.innerHTML = state.users.length ? state.users.map((user) => `
    <div class="mini-item">
      <div class="mini-item-head">
        <div>
          <strong>${escapeHtml(user.nome || user.email)}</strong><br>
          <small class="muted">${escapeHtml(user.email || '')}</small><br>
          <small class="muted">${escapeHtml(user.organizacaoNome || 'Todas as organizações')}</small>
        </div>
        <span class="pill">${user.ativo === false ? 'Banido' : roleLabel(user.papel)}</span>
      </div>
      <div class="mini-controls">
        <select data-role-user="${user.id}">
          <option value="usuario">Usuário</option>
          <option value="operador">Operador</option>
          <option value="admin">Admin</option>
        </select>
        <select data-org-user="${user.id}">
          <option value="">Todas/sem organização</option>
          ${state.orgs.map((org) => `<option value="${org.id}">${escapeHtml(org.nome)}</option>`).join('')}
        </select>
        <button class="btn ${user.ativo === false ? 'ghost' : 'danger'}" type="button" data-toggle-user="${user.id}" data-active="${user.ativo === false ? 'true' : 'false'}">
          ${user.ativo === false ? 'Reativar' : 'Banir'}
        </button>
      </div>
    </div>
  `).join('') : '<div class="empty-state">Nenhum usuário encontrado.</div>';

  state.users.forEach((user) => {
    const roleSelect = els.usersAdminList.querySelector(`[data-role-user="${CSS.escape(user.id)}"]`);
    const orgSelect = els.usersAdminList.querySelector(`[data-org-user="${CSS.escape(user.id)}"]`);
    if (roleSelect) roleSelect.value = user.papel || 'usuario';
    if (orgSelect) orgSelect.value = user.organizacaoId || '';
  });
}


function localDateStart(value) {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
}

function localDateEnd(value) {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
}

function todayInputValue() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function firstDayMonthInputValue() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}-01`;
}

function ensureReportDates() {
  if (!els.operatorReportStart || !els.operatorReportEnd) return;
  if (!els.operatorReportStart.value) els.operatorReportStart.value = firstDayMonthInputValue();
  if (!els.operatorReportEnd.value) els.operatorReportEnd.value = todayInputValue();
}

function operatorReportKey(uid, name, email) {
  return uid || email || name || 'sem-operador';
}

function operatorReportName(uid, name, email) {
  if (name) return name;
  const user = state.users.find((item) => item.id === uid || item.email === email);
  return user?.nome || user?.email || email || 'Sem operador';
}

function generateOperatorReport() {
  if (!isAdmin() || !els.operatorReportBox) return;
  ensureReportDates();

  const start = localDateStart(els.operatorReportStart.value);
  const end = localDateEnd(els.operatorReportEnd.value);
  if (!start || !end || start > end) {
    els.operatorReportBox.innerHTML = '<div class="empty-state">Informe um intervalo de datas válido.</div>';
    return;
  }

  const rows = new Map();
  const ensure = (uid, name, email) => {
    const key = operatorReportKey(uid, name, email);
    if (!rows.has(key)) {
      rows.set(key, {
        uid: uid || '',
        nome: operatorReportName(uid, name, email),
        email: email || '',
        iniciados: 0,
        finalizados: 0,
        reabertos: 0
      });
    }
    return rows.get(key);
  };

  const inRange = (value) => {
    const ms = timestampMillis(value);
    return ms >= start && ms <= end;
  };

  state.tickets.forEach((ticket) => {
    if (ticket.tratamentoIniciadoEm && inRange(ticket.tratamentoIniciadoEm)) {
      ensure(ticket.operadorTratamentoId, ticket.operadorTratamentoNome, ticket.operadorTratamentoEmail).iniciados += 1;
    }

    if (ticket.finalizadoEm && inRange(ticket.finalizadoEm)) {
      ensure(ticket.finalizadoPor, ticket.finalizadoPorNome, ticket.finalizadoPorEmail).finalizados += 1;
    }

    if (ticket.reabertoEm && inRange(ticket.reabertoEm)) {
      ensure(ticket.reabertoPor, ticket.reabertoPorNome, ticket.reabertoPorEmail).reabertos += 1;
    }
  });

  const data = [...rows.values()]
    .map((row) => ({ ...row, total: row.iniciados + row.finalizados + row.reabertos }))
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, 'pt-BR'));

  if (!data.length) {
    els.operatorReportBox.innerHTML = '<div class="empty-state">Nenhuma tratativa encontrada nesse intervalo.</div>';
    return;
  }

  els.operatorReportBox.innerHTML = `
    <div class="table-wrap">
      <table class="report-table">
        <thead>
          <tr>
            <th>Operador</th>
            <th>Em tratamento</th>
            <th>Finalizados</th>
            <th>Reabertos</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${data.map((row) => `
            <tr>
              <td><strong>${escapeHtml(row.nome)}</strong><br><small>${escapeHtml(row.email || row.uid)}</small></td>
              <td>${row.iniciados}</td>
              <td>${row.finalizados}</td>
              <td>${row.reabertos}</td>
              <td><strong>${row.total}</strong></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function saveOrganizationByName(nome) {
  nome = normalizeKey(nome);
  if (!nome) return;
  const orgId = safeIdFromName(nome);

  await setDoc(doc(db, 'organizacoes', orgId), {
    nome,
    ativa: true,
    criadoPor: state.user.uid,
    criadoPorEmail: state.user.email,
    criadoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp()
  }, { merge: true });

  showToast('Organização salva no Firestore.', 'success');
}

async function createOrg(event) {
  event.preventDefault();
  const input = event.currentTarget?.id === 'quickOrgForm' ? els.quickOrgNameInput : els.orgNameInput;
  await saveOrganizationByName(input.value);
  input.value = '';
}

async function toggleOrg(orgId, active) {
  await updateDoc(doc(db, 'organizacoes', orgId), {
    ativa: active,
    atualizadoEm: serverTimestamp()
  });
  showToast(active ? 'Organização reativada.' : 'Organização desativada.', 'success');
}

async function updateUserRole(userId, papel) {
  await updateDoc(doc(db, 'usuarios', userId), {
    papel,
    atualizadoEm: serverTimestamp()
  });
  showToast('Permissão atualizada.', 'success');
}

async function updateUserOrg(userId, orgId) {
  const org = state.orgs.find((item) => item.id === orgId);
  await updateDoc(doc(db, 'usuarios', userId), {
    organizacaoId: org?.id || null,
    organizacaoNome: org?.nome || 'Todas as organizações',
    atualizadoEm: serverTimestamp()
  });
  showToast('Organização do usuário atualizada.', 'success');
}

async function toggleUser(userId, active) {
  if (userId === state.user.uid && !active) {
    return showToast('Você não pode banir a própria conta em uso.', 'error');
  }
  await updateDoc(doc(db, 'usuarios', userId), {
    ativo: active,
    atualizadoEm: serverTimestamp()
  });
  showToast(active ? 'Usuário reativado.' : 'Usuário banido.', 'success');
}

async function completeOnboarding(event) {
  event.preventDefault();
  const nome = normalizeKey(els.onboardingNameInput.value);
  const org = state.orgs.find((item) => item.id === els.onboardingOrgSelect.value);

  if (!nome || !org) return showToast('Informe seu nome e escolha uma organização.', 'error');

  const data = {
    uid: state.user.uid,
    nome,
    email: state.user.email,
    organizacaoId: org.id,
    organizacaoNome: org.nome,
    papel: 'usuario',
    ativo: true,
    criadoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp()
  };

  await setDoc(doc(db, 'usuarios', state.user.uid), data);
  if (state.user.displayName !== nome) await updateProfile(state.user, { displayName: nome });
  state.profile = { id: state.user.uid, ...data };
  renderApp();
}

function setAuthMode(mode) {
  state.mode = mode;
  const isRegister = mode === 'register';
  els.tabLogin.classList.toggle('active', !isRegister);
  els.tabRegister.classList.toggle('active', isRegister);
  els.nameField.classList.toggle('hidden', !isRegister);
  els.authSubmitBtn.textContent = isRegister ? 'Criar conta' : 'Entrar';
  els.passwordInput.autocomplete = isRegister ? 'new-password' : 'current-password';
}

async function submitAuth(event) {
  event.preventDefault();
  const email = normalizeKey(els.emailInput.value);
  const password = els.passwordInput.value;
  const displayName = normalizeKey(els.displayNameInput.value);

  try {
    if (state.mode === 'register') {
      if (!displayName) return showToast('Informe o usuário.', 'error');

      try {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(cred.user, { displayName });
        showToast('Conta criada. Agora escolha a organização.', 'success');
      } catch (error) {
        if (error?.code !== 'auth/email-already-in-use') throw error;

        // Se o usuário clicou em "Criar conta" por engano, tentamos entrar com a mesma senha.
        // Se essa conta for Google, essa tentativa falha e mostramos a instrução correta.
        try {
          await signInWithEmailAndPassword(auth, email, password);
          showToast('Esse e-mail já existia. Entrei com a senha informada.', 'success');
        } catch (_) {
          setAuthMode('login');
          els.passwordInput.focus();
          showToast('Esse e-mail já tem cadastro. Mudei para Entrar. Se a conta foi criada pelo Google, use o botão Google; se quer senha, clique em Definir ou recuperar senha.', 'error');
        }
      }
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
  } catch (error) {
    showToast(authErrorMessage(error), 'error');
  }
}

async function loginWithGoogle() {
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (error) {
    if (['auth/popup-blocked', 'auth/cancelled-popup-request'].includes(error?.code)) {
      await signInWithRedirect(auth, googleProvider);
      return;
    }
    showToast(authErrorMessage(error), 'error');
  }
}

async function resetPassword() {
  const email = normalizeKey(els.emailInput.value);
  if (!email) {
    els.emailInput.focus();
    return showToast('Digite o e-mail primeiro para enviar o link de senha.', 'error');
  }

  try {
    await sendPasswordResetEmail(auth, email);
    showToast('Enviei o link para definir/recuperar a senha. Confira seu e-mail.', 'success');
  } catch (error) {
    showToast(authErrorMessage(error), 'error');
  }
}

function authErrorMessage(error) {
  const code = error?.code || '';
  const map = {
    'auth/invalid-credential': 'E-mail ou senha inválidos. Se essa conta foi criada pelo Google, use Entrar/Criar com Google; senha local não é criada automaticamente.',
    'auth/wrong-password': 'Senha inválida. Se essa conta foi criada pelo Google, use Entrar/Criar com Google.',
    'auth/user-not-found': 'Não encontrei esse e-mail. Crie a conta ou entre com Google.',
    'auth/email-already-in-use': 'Este e-mail já possui cadastro. Clique em Entrar, use o botão Google se foi criado pelo Gmail, ou recupere/defina a senha por e-mail.',
    'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
    'auth/popup-closed-by-user': 'Login com Google cancelado.',
    'auth/popup-blocked': 'O navegador bloqueou a janela do Google. Vou tentar pelo redirecionamento.',
    'auth/account-exists-with-different-credential': 'Esse e-mail já existe com outro método. Entre pelo método usado antes ou defina uma senha por e-mail.',
    'auth/unauthorized-domain': 'Domínio não autorizado no Firebase Authentication.',
    'auth/too-many-requests': 'Muitas tentativas. Aguarde um pouco e tente novamente.',
    'auth/network-request-failed': 'Falha de rede. Confira sua conexão.',
    'auth/operation-not-allowed': 'Este provedor de login não está habilitado no Firebase.'
  };
  return map[code] || error.message || 'Erro de autenticação.';
}

async function logout() {
  await signOut(auth);
}

function cleanupListeners() {
  stopTicketsListener();
  if (state.unsubOrgs) state.unsubOrgs();
  if (state.unsubUsers) state.unsubUsers();
  state.unsubOrgs = null;
  state.unsubUsers = null;
}


function setTicketAttachment(file) {
  if (!file) return;
  state.pendingTicketFile = file;

  if (els.ticketPasteZone) {
    els.ticketPasteZone.classList.add('has-file');
  }

  if (els.ticketPastePreview) {
    const sizeKb = file.size ? `${Math.round(file.size / 1024)} KB` : '';
    const isImage = file.type?.startsWith('image/');
    els.ticketPastePreview.innerHTML = `
      ${isImage ? `<img src="${URL.createObjectURL(file)}" alt="Prévia do anexo" />` : ''}
      <div><strong>${escapeHtml(file.name || 'imagem-colada.png')}</strong><br><small>${escapeHtml(file.type || 'arquivo')} ${escapeHtml(sizeKb)}</small></div>
    `;
    els.ticketPastePreview.classList.remove('hidden');
  }

  if (els.clearTicketFileBtn) els.clearTicketFileBtn.classList.remove('hidden');
}

function clearTicketAttachment() {
  state.pendingTicketFile = null;
  if (els.ticketFileInput) els.ticketFileInput.value = '';
  if (els.ticketPasteZone) els.ticketPasteZone.classList.remove('has-file');
  if (els.ticketPastePreview) {
    els.ticketPastePreview.innerHTML = '';
    els.ticketPastePreview.classList.add('hidden');
  }
  if (els.clearTicketFileBtn) els.clearTicketFileBtn.classList.add('hidden');
}

function setHistoryAttachment(file) {
  if (!file) return;
  state.pendingHistoryFile = file;

  const zone = $('historyPasteZone');
  const preview = $('historyPastePreview');
  const clearBtn = $('clearHistoryFileBtn');

  if (zone) zone.classList.add('has-file');

  if (preview) {
    const sizeKb = file.size ? `${Math.round(file.size / 1024)} KB` : '';
    const isImage = file.type?.startsWith('image/');
    preview.innerHTML = `
      ${isImage ? `<img src="${URL.createObjectURL(file)}" alt="Prévia do anexo" />` : ''}
      <div><strong>${escapeHtml(file.name || 'imagem-colada.png')}</strong><br><small>${escapeHtml(file.type || 'arquivo')} ${escapeHtml(sizeKb)}</small></div>
    `;
    preview.classList.remove('hidden');
  }

  if (clearBtn) clearBtn.classList.remove('hidden');
}

function clearHistoryAttachment() {
  state.pendingHistoryFile = null;
  const input = $('historyFileInput');
  const zone = $('historyPasteZone');
  const preview = $('historyPastePreview');
  const clearBtn = $('clearHistoryFileBtn');

  if (input) input.value = '';
  if (zone) zone.classList.remove('has-file');
  if (preview) {
    preview.innerHTML = '';
    preview.classList.add('hidden');
  }
  if (clearBtn) clearBtn.classList.add('hidden');
}

function firstImageFromClipboard(event) {
  const items = [...(event.clipboardData?.items || [])];
  const imageItem = items.find((item) => item.kind === 'file' && item.type.startsWith('image/'));
  const file = imageItem?.getAsFile();
  if (!file) return null;
  const ext = file.type.includes('jpeg') ? 'jpg' : 'png';
  return new File([file], `imagem-colada-${Date.now()}.${ext}`, { type: file.type || `image/${ext}` });
}

function setupPasteZone() {
  if (!els.ticketPasteZone || !els.ticketFileInput) return;

  els.ticketPasteZone.addEventListener('click', () => els.ticketFileInput.click());
  els.ticketFileInput.addEventListener('change', () => setTicketAttachment(els.ticketFileInput.files?.[0]));
  els.clearTicketFileBtn?.addEventListener('click', clearTicketAttachment);

  els.ticketPasteZone.addEventListener('paste', (event) => {
    const file = firstImageFromClipboard(event);
    if (!file) return;
    event.preventDefault();
    setTicketAttachment(file);
    showToast('Imagem colada no anexo.', 'success');
  });

  els.ticketPasteZone.addEventListener('dragover', (event) => {
    event.preventDefault();
    els.ticketPasteZone.classList.add('drag-over');
  });

  els.ticketPasteZone.addEventListener('dragleave', () => els.ticketPasteZone.classList.remove('drag-over'));

  els.ticketPasteZone.addEventListener('drop', (event) => {
    event.preventDefault();
    els.ticketPasteZone.classList.remove('drag-over');
    const file = event.dataTransfer?.files?.[0];
    if (file) setTicketAttachment(file);
  });
}

function setupHistoryPasteZone() {
  const zone = $('historyPasteZone');
  const input = $('historyFileInput');
  const clearBtn = $('clearHistoryFileBtn');
  if (!zone || !input) return;

  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', () => setHistoryAttachment(input.files?.[0]));
  clearBtn?.addEventListener('click', clearHistoryAttachment);

  zone.addEventListener('paste', (event) => {
    const file = firstImageFromClipboard(event);
    if (!file) return;
    event.preventDefault();
    setHistoryAttachment(file);
    showToast('Imagem colada na ocorrência.', 'success');
  });

  zone.addEventListener('dragover', (event) => {
    event.preventDefault();
    zone.classList.add('drag-over');
  });

  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));

  zone.addEventListener('drop', (event) => {
    event.preventDefault();
    zone.classList.remove('drag-over');
    const file = event.dataTransfer?.files?.[0];
    if (file) setHistoryAttachment(file);
  });
}

getRedirectResult(auth).catch((error) => {
  if (error) showToast(authErrorMessage(error), 'error');
});

onAuthStateChanged(auth, async (user) => {
  cleanupListeners();
  state.user = user;
  state.profile = null;
  state.tickets = [];
  state.users = [];
  state.selectedTicketId = null;

  if (!user) {
    showOnly(els.authView);
    return;
  }

  try {
    hideConnectionHelp();
    const profile = await loadOrCreateProfile(user);

    if (!profile) {
      els.onboardingNameInput.value = user.displayName || '';
      showOnly(els.onboardingView);
      startOrgListener();
      return;
    }

    state.profile = profile;

    if (profile.ativo === false) {
      showOnly(els.blockedView);
      return;
    }

    startOrgListener();
    renderApp();
  } catch (error) {
    const message = String(error?.message || '');
    const isPermission = error?.code === 'permission-denied' || message.toLowerCase().includes('missing or insufficient permissions');
    const isOffline = error?.code === 'unavailable' || message.toLowerCase().includes('offline') || message.toLowerCase().includes('failed to get document');
    const friendly = isPermission
      ? 'Firestore negou o acesso. Publique o arquivo firestore.rules em Firestore Database > Regras.'
      : message;

    showToast(`Erro ao iniciar sessão: ${friendly}`, 'error');
    if (isPermission || isOffline) showConnectionHelp(friendly);
    showOnly(els.authView);
  }
});

els.tabLogin.addEventListener('click', () => setAuthMode('login'));
els.tabRegister.addEventListener('click', () => setAuthMode('register'));
els.authForm.addEventListener('submit', submitAuth);
els.googleBtn.addEventListener('click', loginWithGoogle);
els.resetPasswordBtn.addEventListener('click', resetPassword);
els.logoutBtn.addEventListener('click', logout);
els.logoutOnboardingBtn.addEventListener('click', logout);
els.logoutBlockedBtn.addEventListener('click', logout);
els.onboardingForm.addEventListener('submit', completeOnboarding);
els.newTicketBtn.addEventListener('click', () => {
  els.ticketForm.reset();
  clearTicketAttachment();
  els.ticketDialog.showModal();
});
els.ticketForm.addEventListener('submit', createTicket);
els.adminBtn.addEventListener('click', () => {
  ensureReportDates();
  renderAdmin();
  els.adminDialog.showModal();
});
els.orgForm.addEventListener('submit', createOrg);
els.operatorReportBtn?.addEventListener('click', generateOperatorReport);
els.quickOrgForm?.addEventListener('submit', createOrg);
els.searchInput.addEventListener('input', renderTickets);
els.statusFilter.addEventListener('change', renderTickets);
els.orgFilter.addEventListener('change', renderTickets);

document.addEventListener('click', (event) => {
  const closeId = event.target?.dataset?.closeDialog;
  if (closeId) $(closeId)?.close();

  const ticketButton = event.target.closest?.('[data-ticket-id]');
  if (ticketButton) selectTicket(ticketButton.dataset.ticketId);

  const orgButton = event.target.closest?.('[data-toggle-org]');
  if (orgButton) toggleOrg(orgButton.dataset.toggleOrg, orgButton.dataset.active === 'true');

  const userButton = event.target.closest?.('[data-toggle-user]');
  if (userButton) toggleUser(userButton.dataset.toggleUser, userButton.dataset.active === 'true');
});

document.addEventListener('change', (event) => {
  const roleUser = event.target?.dataset?.roleUser;
  if (roleUser) updateUserRole(roleUser, event.target.value);

  const orgUser = event.target?.dataset?.orgUser;
  if (orgUser) updateUserOrg(orgUser, event.target.value);
});

document.addEventListener('paste', (event) => {
  if (!els.ticketDialog?.open) return;
  const file = firstImageFromClipboard(event);
  if (!file) return;
  event.preventDefault();
  setTicketAttachment(file);
  showToast('Imagem colada no anexo.', 'success');
});

setupPasteZone();
setAuthMode('login');
