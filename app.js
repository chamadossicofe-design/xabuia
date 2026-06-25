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
  arrayUnion,
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

const APP_VERSION = 'V21-firestore-economico';
const BOOTSTRAP_ADMIN_EMAIL = 'chamadossicofe@gmail.com';

const TICKET_TYPE_LABELS = {
  nf_caminhao_porta: 'Nota fiscal • Caminhão na porta',
  nf_adiantamento: 'Nota fiscal • Adiantamento',
  reativacao_produtos: 'Reativação de produtos',
  novos_produtos: 'Novos produtos',
  pedido_em_andamento: 'Pedido em andamento',
  divergencia_flow: 'Divergência no Flow'
};

const TICKET_GROUPS = {
  nota_fiscal: ['nf_caminhao_porta', 'nf_adiantamento'],
  produtos: ['reativacao_produtos', 'novos_produtos', 'pedido_em_andamento', 'divergencia_flow']
};

const PRODUCT_TICKET_TYPES = new Set(TICKET_GROUPS.produtos);
const INVOICE_TICKET_TYPES = new Set(TICKET_GROUPS.nota_fiscal);

function ticketTypeLabel(type) {
  return TICKET_TYPE_LABELS[type] || type || 'Chamado';
}

function isProductTicketType(type) {
  return PRODUCT_TICKET_TYPES.has(type);
}

function isInvoiceTicketType(type) {
  return INVOICE_TICKET_TYPES.has(type || 'nota_fiscal');
}

const STATUS_LABELS = {
  aberto: 'Aberto',
  reaberto: 'Reaberto',
  em_tratamento: 'Em tratamento',
  informacoes_divergentes: 'Informações divergentes',
  devolver_recusar: 'Devolver e recusar',
  finalizado: 'Finalizado'
};

const ACTIVE_STATUSES = ['aberto', 'reaberto', 'em_tratamento'];
const CLOSED_STATUSES = ['finalizado', 'informacoes_divergentes', 'devolver_recusar'];
const ALL_TICKET_STATUSES = [...ACTIVE_STATUSES, ...CLOSED_STATUSES];
const LIVE_OPEN_LIMIT = 250;
const LIVE_TREATMENT_LIMIT = 250;

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
  reabertura: 'Reabertura',
  informacoes_divergentes: 'Informações divergentes',
  devolver_recusar: 'Devolver e recusar'
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
  ticketTypeFilter: $('ticketTypeFilter'),
  statusFilter: $('statusFilter'),
  orgFilterWrap: $('orgFilterWrap'),
  orgFilter: $('orgFilter'),
  mainDateStart: $('mainDateStart'),
  mainDateEnd: $('mainDateEnd'),
  countAberto: $('countAberto'),
  countReaberto: $('countReaberto'),
  countTratamento: $('countTratamento'),
  countInformacoesDivergentes: $('countInformacoesDivergentes'),
  countDevolverRecusar: $('countDevolverRecusar'),
  countFinalizado: $('countFinalizado'),
  countTotal: $('countTotal'),
  liveStatus: $('liveStatus'),
  ticketList: $('ticketList'),
  ticketDetail: $('ticketDetail'),
  ticketTypeDialog: $('ticketTypeDialog'),
  chooseInvoiceTruckBtn: $('chooseInvoiceTruckBtn'),
  chooseInvoiceAdvanceBtn: $('chooseInvoiceAdvanceBtn'),
  chooseProductReactivationBtn: $('chooseProductReactivationBtn'),
  chooseNewProductBtn: $('chooseNewProductBtn'),
  choosePedidoAndamentoBtn: $('choosePedidoAndamentoBtn'),
  chooseDivergenciaFlowBtn: $('chooseDivergenciaFlowBtn'),
  ticketDialog: $('ticketDialog'),
  ticketForm: $('ticketForm'),
  ticketDialogTitle: $('ticketDialogTitle'),
  ticketTypeInput: $('ticketTypeInput'),
  ticketKeyInput: $('ticketKeyInput'),
  ticketKeyHelp: $('ticketKeyHelp'),
  ticketKeyError: $('ticketKeyError'),
  ticketKeyPreview: $('ticketKeyPreview'),
  ticketKeyCleanText: $('ticketKeyCleanText'),
  ticketOrgWrap: $('ticketOrgWrap'),
  ticketOrgSelect: $('ticketOrgSelect'),
  ticketObsInput: $('ticketObsInput'),
  ticketFileInput: $('ticketFileInput'),
  ticketPasteZone: $('ticketPasteZone'),
  ticketPastePreview: $('ticketPastePreview'),
  clearTicketFileBtn: $('clearTicketFileBtn'),
  saveTicketBtn: $('saveTicketBtn'),
  productTicketDialog: $('productTicketDialog'),
  productTicketForm: $('productTicketForm'),
  productDialogTitle: $('productDialogTitle'),
  productTypeInput: $('productTypeInput'),
  productCodeInput: $('productCodeInput'),
  productOrgWrap: $('productOrgWrap'),
  productOrgSelect: $('productOrgSelect'),
  productObsInput: $('productObsInput'),
  productObsPreview: $('productObsPreview'),
  productFileInput: $('productFileInput'),
  productPasteZone: $('productPasteZone'),
  productPastePreview: $('productPastePreview'),
  clearProductFileBtn: $('clearProductFileBtn'),
  saveProductTicketBtn: $('saveProductTicketBtn'),
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
  pendingProductFile: null,
  ticketBuckets: {},
  unsubTickets: null,
  unsubOrgs: null,
  unsubUsers: null,
  searchTimer: null,
  searchToken: 0,
  filterTimer: null,
  filterToken: 0,
  historyLoadedFor: null
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

function limparChaveNfe(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 44);
}

function chaveNfeValida(value) {
  return limparChaveNfe(value).length === 44;
}

function syncTicketKeyInput(showError = false) {
  if (!els.ticketKeyInput) return '';

  const clean = limparChaveNfe(els.ticketKeyInput.value);

  if (els.ticketKeyInput.value !== clean) {
    els.ticketKeyInput.value = clean;
  }

  if (els.ticketKeyCleanText) {
    els.ticketKeyCleanText.textContent = clean || '—';
  }

  if (els.ticketKeyPreview) {
    els.ticketKeyPreview.classList.toggle('hidden', !clean);
  }

  const invalid = showError && clean.length !== 44;

  if (els.ticketKeyError) {
    els.ticketKeyError.classList.toggle('hidden', !invalid);
  }

  els.ticketKeyInput.classList.toggle('invalid', invalid);

  return clean;
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

function shortPersonName(value) {
  const clean = normalizeKey(value);
  if (!clean) return '';
  const parts = clean.split(' ').filter(Boolean);
  return parts.length > 2 ? `${parts[0]} ${parts[1]}` : clean;
}

function selectedUserName() {
  return shortPersonName(state.profile?.nome || state.user?.displayName || state.user?.email || 'Usuário');
}

function statusAutoOccurrenceText(status) {
  if (status === 'em_tratamento') return `Reservado por: ${selectedUserName()}`;
  return '';
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


function isMultiDropdown(control) {
  return !!control?.classList?.contains('multi-dropdown');
}

function filterCheckboxes(control) {
  return [...(control?.querySelectorAll?.('input[data-filter-option]') || [])];
}

function selectedValues(control, allValue = 'todos') {
  if (!control) return [allValue];

  if (isMultiDropdown(control)) {
    const values = filterCheckboxes(control)
      .filter((input) => input.checked)
      .map((input) => input.value)
      .filter(Boolean);
    return values.length ? values : [allValue];
  }

  if (!control.multiple) return [control.value || allValue];

  const values = [...control.selectedOptions].map((opt) => opt.value).filter(Boolean);
  return values.length ? values : [allValue];
}

function updateMultiDropdownLabel(control, allValue) {
  if (!isMultiDropdown(control)) return;

  const label = control.querySelector('.multi-dropdown-label');
  if (!label) return;

  const allLabel = control.dataset.labelAll || 'Todos';
  const singular = control.dataset.labelSingular || 'item';
  const plural = control.dataset.labelPlural || 'itens';
  const values = selectedValues(control, allValue);

  if (values.includes(allValue)) {
    label.textContent = allLabel;
    return;
  }

  const checked = filterCheckboxes(control).filter((input) => input.checked);
  if (checked.length === 1) {
    label.textContent = checked[0].closest('label')?.textContent?.trim() || checked[0].value;
    return;
  }

  label.textContent = `${checked.length} ${checked.length === 1 ? singular : plural}`;
}

function normalizeMultiDropdown(control, allValue, changedInput = null) {
  if (!isMultiDropdown(control)) return;

  const checkboxes = filterCheckboxes(control);
  const allInput = checkboxes.find((input) => input.value === allValue);
  if (!allInput) return;

  if (changedInput?.value === allValue && changedInput.checked) {
    checkboxes.forEach((input) => {
      if (input !== allInput) input.checked = false;
    });
  } else if (changedInput && changedInput.value !== allValue && changedInput.checked) {
    allInput.checked = false;
  }

  if (!checkboxes.some((input) => input.checked)) {
    allInput.checked = true;
  }

  updateMultiDropdownLabel(control, allValue);
}

function normalizeMultiSelect(control, allValue, changedInput = null) {
  if (!control) return;

  if (isMultiDropdown(control)) {
    normalizeMultiDropdown(control, allValue, changedInput);
    return;
  }

  if (!control.multiple) return;

  const selected = [...control.selectedOptions].map((opt) => opt.value);
  const allOption = [...control.options].find((opt) => opt.value === allValue);
  if (!allOption) return;

  if (!selected.length) {
    allOption.selected = true;
    return;
  }

  if (selected.length > 1 && selected.includes(allValue)) {
    allOption.selected = false;
  }
}

function closeMultiDropdown(control) {
  if (isMultiDropdown(control)) {
    window.setTimeout(() => { control.open = false; }, 80);
  }
}

function handleTicketTypeFilterChange(event) {
  normalizeMultiSelect(els.ticketTypeFilter, 'todos', event.target);
  renderTickets();
  if (event.target?.matches?.('input[data-filter-option]')) closeMultiDropdown(els.ticketTypeFilter);
}

function handleOrgFilterChange(event) {
  normalizeMultiSelect(els.orgFilter, 'todas', event.target);
  renderTickets();
  if (event.target?.matches?.('input[data-filter-option]')) closeMultiDropdown(els.orgFilter);
}

function normalizeProductCode(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 80);
}

function ticketTitle(ticket) {
  const type = ticket?.tipoChamado || 'nota_fiscal';
  if (isProductTicketType(type)) {
    return `${ticketTypeLabel(type)} • Produto ${ticket.codigoProduto || ticket.chave || '—'}`;
  }
  return compactKeyTitle(ticket?.chave || '');
}

function ticketRawLine(ticket) {
  const type = ticket?.tipoChamado || 'nota_fiscal';
  if (isProductTicketType(type)) return `Código do produto: ${ticket.codigoProduto || ticket.chave || '—'}`;
  return ticket.chave || '';
}

function isTabularText(text) {
  const lines = String(text || '').trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 1) return false;
  const tabLines = lines.filter((line) => line.includes('\t'));
  if (!tabLines.length) return false;
  const maxCols = Math.max(...tabLines.map((line) => line.split('\t').length));
  return maxCols >= 2;
}

function renderTextContent(text) {
  const value = String(text ?? '');
  if (!isTabularText(value)) {
    return `<div class="history-text">${escapeHtml(value)}</div>`;
  }

  const rows = value.trim().split(/\r?\n/).filter(Boolean).map((line) => line.split('\t'));
  const maxCols = Math.max(...rows.map((row) => row.length));
  const normalized = rows.map((row) => [...row, ...Array(maxCols - row.length).fill('')]);

  return `
    <div class="excel-table-wrap">
      <table class="excel-table">
        <tbody>
          ${normalized.map((row) => `
            <tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderProductInfo(ticket) {
  return `
    <div class="key-box product-key-box">
      <div class="key-facts product-facts">
        <span><strong>Formulário:</strong> ${escapeHtml(ticketTypeLabel(ticket.tipoChamado))}</span>
        <span><strong>Código do produto:</strong> ${escapeHtml(ticket.codigoProduto || ticket.chave || '—')}</span>
      </div>
    </div>
  `;
}

function renderTicketInfo(ticket) {
  if (isProductTicketType(ticket.tipoChamado)) return renderProductInfo(ticket);
  return renderKeyInfo(ticket.chave);
}

function updateProductObsPreview() {
  if (!els.productObsPreview || !els.productObsInput) return;
  const text = els.productObsInput.value;
  if (!isTabularText(text)) {
    els.productObsPreview.classList.add('hidden');
    els.productObsPreview.innerHTML = '';
    return;
  }
  els.productObsPreview.innerHTML = `<strong>Prévia da tabela colada:</strong>${renderTextContent(text)}`;
  els.productObsPreview.classList.remove('hidden');
}

function setText(el, value) {
  if (el) el.textContent = value;
}

function currentUserSolicitanteArray() {
  return state.user?.uid ? [state.user.uid] : [];
}

function requesterUpdatePayload() {
  return state.user?.uid ? { solicitantesIds: arrayUnion(state.user.uid) } : {};
}

function lastOccurrencePayload(texto, tipo, anexo = null) {
  const payload = {
    ultimaOcorrenciaTexto: normalizeKey(texto || ''),
    ultimaOcorrenciaTipo: tipo || 'observacao',
    ultimaOcorrenciaUsuarioId: state.user?.uid || null,
    ultimaOcorrenciaUsuarioNome: selectedUserName(),
    ultimaOcorrenciaUsuarioEmail: state.user?.email || null,
    ultimaOcorrenciaEm: serverTimestamp(),
    atualizadoEm: serverTimestamp()
  };
  if (anexo) payload.anexo = anexo;
  return payload;
}

function createTicketBasePayload({ tipoChamado, chave, chaveBusca, org, codigoProduto = null, observacao = '', tipoHistorico = 'criacao' }) {
  return {
    tipoChamado,
    ...(codigoProduto ? { codigoProduto } : {}),
    chave,
    chaveBusca,
    organizacaoId: org.id,
    organizacaoNome: org.nome,
    status: 'aberto',
    criadoPor: state.user.uid,
    criadoPorNome: selectedUserName(),
    criadoPorEmail: state.user.email,
    criadoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
    solicitantesIds: currentUserSolicitanteArray(),
    ultimaOcorrenciaTexto: normalizeKey(observacao || ''),
    ultimaOcorrenciaTipo: tipoHistorico,
    ultimaOcorrenciaUsuarioId: state.user.uid,
    ultimaOcorrenciaUsuarioNome: selectedUserName(),
    ultimaOcorrenciaUsuarioEmail: state.user.email,
    ultimaOcorrenciaEm: serverTimestamp()
  };
}

async function addHistoryDoc(ticketId, texto, tipo = 'observacao', extra = {}) {
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


function fillOrgDropdown(dropdown, activeOrgs, includeAll = false) {
  if (!isMultiDropdown(dropdown)) return;

  const allValue = dropdown.dataset.allValue || (includeAll ? 'todas' : 'todos');
  const selectedBefore = selectedValues(dropdown, allValue);
  const menu = dropdown.querySelector('.multi-dropdown-menu');
  if (!menu) return;

  menu.innerHTML = '';

  if (includeAll) {
    const label = document.createElement('label');
    label.innerHTML = `<input type="checkbox" value="${escapeHtml(allValue)}" data-filter-option /> ${escapeHtml(dropdown.dataset.labelAll || 'Todas')}`;
    menu.appendChild(label);
  }

  activeOrgs.forEach((org) => {
    const label = document.createElement('label');
    label.innerHTML = `<input type="checkbox" value="${escapeHtml(org.id)}" data-filter-option /> ${escapeHtml(org.nome)}`;
    menu.appendChild(label);
  });

  const checkboxes = filterCheckboxes(dropdown);
  checkboxes.forEach((input) => {
    input.checked = selectedBefore.includes(input.value);
  });

  if (includeAll && !checkboxes.some((input) => input.checked)) {
    const allInput = checkboxes.find((input) => input.value === allValue);
    if (allInput) allInput.checked = true;
  }

  normalizeMultiDropdown(dropdown, allValue);
}

function renderOrgSelects() {
  const activeOrgs = state.orgs.filter((org) => org.ativa !== false);

  const fill = (select, includeAll = false) => {
    if (!select) return;

    if (isMultiDropdown(select)) {
      fillOrgDropdown(select, activeOrgs, includeAll);
      return;
    }

    const selectedBefore = select.multiple ? [...select.selectedOptions].map((opt) => opt.value) : [];
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

    if (select.multiple) {
      const values = selectedBefore.length ? selectedBefore : (includeAll ? ['todas'] : []);
      [...select.options].forEach((opt) => {
        opt.selected = values.includes(opt.value);
      });
      if (includeAll && ![...select.selectedOptions].length && select.options.length) {
        select.options[0].selected = true;
      }
      return;
    }

    if ([...select.options].some((opt) => opt.value === current)) {
      select.value = current;
    } else if (includeAll && select.options.length) {
      select.value = 'todas';
    }
  };

  fill(els.onboardingOrgSelect, false);
  fill(els.ticketOrgSelect, false);
  fill(els.productOrgSelect, false);
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

  const chamadosRef = collection(db, 'chamados');

  // V21 econômico:
  // - operador/admin acompanha só a fila aberta/reaberta + os próprios em tratamento;
  // - usuário comum acompanha somente chamados onde ele está em solicitantesIds;
  // - nada de listener de coleção inteira para usuário comum.
  if (isOperatorOrAdmin()) {
    state.unsubTickets = [
      listenTicketBucket(
        'fila_aberta_reaberta',
        query(chamadosRef, where('status', 'in', ['aberto', 'reaberto']), limit(LIVE_OPEN_LIMIT))
      ),
      listenTicketBucket(
        'meus_em_tratamento',
        query(
          chamadosRef,
          where('status', '==', 'em_tratamento'),
          where('operadorTratamentoId', '==', state.user.uid),
          limit(LIVE_TREATMENT_LIMIT)
        )
      )
    ];
    return;
  }

  state.unsubTickets = [
    listenTicketBucket(
      'meus_chamados',
      query(
        chamadosRef,
        where('organizacaoId', '==', state.profile.organizacaoId),
        where('solicitantesIds', 'array-contains', state.user.uid),
        where('status', 'in', ALL_TICKET_STATUSES),
        limit(200)
      )
    )
  ];
}

function clearSearchBucket() {
  if (state.searchTimer) {
    window.clearTimeout(state.searchTimer);
    state.searchTimer = null;
  }

  if (state.ticketBuckets.busca_remota) {
    delete state.ticketBuckets.busca_remota;
    mergeTicketBuckets();
  } else {
    renderTickets();
  }
}

function clearFilterBucket(shouldMerge = true) {
  if (state.filterTimer) {
    window.clearTimeout(state.filterTimer);
    state.filterTimer = null;
  }

  if (state.ticketBuckets.filtro_remoto) {
    delete state.ticketBuckets.filtro_remoto;
    if (shouldMerge) mergeTicketBuckets();
  } else if (shouldMerge) {
    renderTickets();
  }
}

function selectedStatusValue() {
  return els.statusFilter?.value || 'ativos';
}

function selectedTypeValuesForQuery() {
  const values = selectedValues(els.ticketTypeFilter, 'todos');
  if (values.includes('todos')) return [];
  return values.filter((type) => TICKET_TYPE_LABELS[type]);
}

function selectedOrgValuesForQuery() {
  if (!isOperatorOrAdmin()) {
    return state.profile?.organizacaoId ? [state.profile.organizacaoId] : [];
  }

  const selected = selectedValues(els.orgFilter, 'todas');
  if (!selected.includes('todas')) return selected.filter(Boolean);
  return [];
}

function dateFilterValues() {
  return {
    startValue: els.mainDateStart?.value || '',
    endValue: els.mainDateEnd?.value || ''
  };
}

function hasMainDateFilter() {
  const dates = dateFilterValues();
  return !!(dates.startValue || dates.endValue);
}

function localDateStartDate(value) {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function localDateEndDate(value) {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, 23, 59, 59, 999);
}

function ticketMatchesMainDateFilter(ticket) {
  const searchRaw = normalizeKey(els.searchInput?.value || '');
  if (searchRaw.length >= 3) return true;

  const selectedStatus = selectedStatusValue();
  const ticketStatus = ticket?.status || 'aberto';

  // A data padrão é para consulta/histórico. A fila ativa precisa aparecer inteira,
  // mesmo quando o chamado foi aberto em outro dia.
  if (isActivePanelStatus(selectedStatus)) return true;
  if (selectedStatus === 'todos' && ['aberto', 'reaberto', 'em_tratamento'].includes(ticketStatus)) return true;

  if (!hasMainDateFilter()) return true;
  const dates = dateFilterValues();
  const start = dates.startValue ? localDateStart(dates.startValue) : null;
  const end = dates.endValue ? localDateEnd(dates.endValue) : null;
  const ms = timestampMillis(ticket.criadoEm);
  if (!ms) return false;
  if (start != null && ms < start) return false;
  if (end != null && ms > end) return false;
  return true;
}

function remoteFilterStatuses() {
  const status = selectedStatusValue();

  if (status === 'todos') return ['finalizado', 'informacoes_divergentes', 'devolver_recusar'];
  if (isClosedStatus(status)) return [status];

  // Status ativos/aberto/reaberto/em_tratamento vêm dos listeners leves.
  return [];
}

function isClosedStatus(status) {
  return ['finalizado', 'informacoes_divergentes', 'devolver_recusar'].includes(status);
}

function isActivePanelStatus(status) {
  return ['ativos', 'aberto', 'reaberto', 'em_tratamento'].includes(status || 'ativos');
}

function needsRemoteFilterQuery() {
  const status = selectedStatusValue();

  // A fila ativa fica sempre carregada pelo listener leve.
  // A data padrão "hoje" não deve esconder chamados abertos/reabertos/em tratamento antigos.
  if (isActivePanelStatus(status)) return false;

  // "Todos" = fila ativa já carregada + fechados do período selecionado.
  // Status fechado = consulta remota somente daquele status/período.
  return status === 'todos' || isClosedStatus(status);
}

function buildRemoteFilterQueries() {
  const chamadosRef = collection(db, 'chamados');
  const statuses = remoteFilterStatuses();
  const typeValues = selectedTypeValuesForQuery();
  const orgValues = selectedOrgValuesForQuery();
  ensureMainDates();
  const dates = dateFilterValues();
  const startDate = localDateStartDate(dates.startValue);
  const endDate = localDateEndDate(dates.endValue);
  const queries = [];
  const maxQueries = 40;

  const effectiveOrgValues = !isOperatorOrAdmin()
    ? (state.profile?.organizacaoId ? [state.profile.organizacaoId] : [])
    : (orgValues.length ? orgValues : [null]);

  const effectiveTypeValues = typeValues.length ? typeValues : [null];

  for (const status of statuses) {
    for (const orgId of effectiveOrgValues) {
      for (const tipoChamado of effectiveTypeValues) {
        if (queries.length >= maxQueries) return queries;

        const parts = [chamadosRef];
        parts.push(where('status', '==', status));

        if (orgId) parts.push(where('organizacaoId', '==', orgId));
        if (tipoChamado) parts.push(where('tipoChamado', '==', tipoChamado));

        // Pesquisa por data de abertura: usa criadoEm, assim não baixa tudo para filtrar no navegador.
        if (startDate) parts.push(where('criadoEm', '>=', startDate));
        if (endDate) parts.push(where('criadoEm', '<=', endDate));

        parts.push(limit(hasMainDateFilter() ? 300 : 120));
        queries.push(query(...parts));
      }
    }
  }

  return queries;
}

async function runRemoteFilterQuery() {
  const token = ++state.filterToken;

  if (!needsRemoteFilterQuery()) {
    clearFilterBucket(false);
    renderTickets();
    setText(els.liveStatus, 'Ao vivo');
    return;
  }

  const remoteQueries = buildRemoteFilterQueries();
  if (!remoteQueries.length) {
    clearFilterBucket(false);
    renderTickets();
    setText(els.liveStatus, 'Ao vivo');
    return;
  }

  setText(els.liveStatus, 'Filtrando...');

  try {
    const found = new Map();
    for (const q of remoteQueries) {
      if (token !== state.filterToken) return;
      const snapshot = await getDocs(q);
      snapshot.docs.forEach((d) => {
        found.set(d.id, { id: d.id, ...d.data() });
      });
    }

    if (token !== state.filterToken) return;
    state.ticketBuckets.filtro_remoto = [...found.values()];
    mergeTicketBuckets();
    setText(els.liveStatus, found.size ? `Filtro: ${found.size} encontrado(s)` : 'Ao vivo');
  } catch (error) {
    if (token !== state.filterToken) return;
    console.error('Erro no filtro remoto:', error);
    setText(els.liveStatus, 'Erro no filtro');
    if (String(error?.message || '').includes('requires an index')) {
      showToast('O Firestore pediu um índice para esse filtro. Publique o arquivo firestore.indexes.json do pacote v20 ou clique no link do erro no console para criar o índice sugerido.', 'error');
      return;
    }
    showToast(`Erro ao filtrar chamados: ${error.message}`, 'error');
  }
}

function scheduleRemoteFilterQuery() {
  if (state.filterTimer) window.clearTimeout(state.filterTimer);
  state.filterTimer = window.setTimeout(runRemoteFilterQuery, 350);
}

function ticketTypeSearchValues() {
  const selected = selectedValues(els.ticketTypeFilter, 'todos');
  if (!selected.includes('todos')) {
    return selected.filter((type) => TICKET_TYPE_LABELS[type]);
  }

  // Inclui o tipo legado "nota_fiscal" porque versões antigas podem ter gravado a chaveBusca assim.
  return [...Object.keys(TICKET_TYPE_LABELS), 'nota_fiscal'];
}

function orgSearchValues() {
  if (!isOperatorOrAdmin()) {
    return state.profile?.organizacaoId ? [state.profile.organizacaoId] : [];
  }

  const selected = selectedValues(els.orgFilter, 'todas');
  if (!selected.includes('todas')) {
    return selected.filter(Boolean);
  }

  return state.orgs
    .filter((org) => org && org.id && org.ativa !== false)
    .map((org) => org.id);
}

function searchCandidateValues(raw) {
  const value = keySearchValue(raw);
  if (!value || value.length < 3) return [];

  return ticketTypeSearchValues().map((type) => ({
    type,
    chaveBusca: `${type}:${value}`
  }));
}

async function runRemoteTicketSearch(raw) {
  const token = ++state.searchToken;
  const searchRaw = normalizeKey(raw);

  if (!searchRaw || searchRaw.length < 3) {
    clearSearchBucket();
    setText(els.liveStatus, 'Ao vivo');
    return;
  }

  const orgIds = orgSearchValues();
  const candidates = searchCandidateValues(searchRaw).map((item) => item.chaveBusca);

  if (!candidates.length) {
    clearSearchBucket();
    setText(els.liveStatus, 'Ao vivo');
    return;
  }

  setText(els.liveStatus, 'Buscando...');

  try {
    const found = new Map();
    const chamadosRef = collection(db, 'chamados');
    const chaveChunks = [];
    for (let i = 0; i < candidates.length; i += 10) chaveChunks.push(candidates.slice(i, i + 10));

    const effectiveOrgIds = !isOperatorOrAdmin()
      ? (state.profile?.organizacaoId ? [state.profile.organizacaoId] : [])
      : (orgIds.length ? orgIds : [null]);

    for (const orgId of effectiveOrgIds) {
      for (const chunk of chaveChunks) {
        if (token !== state.searchToken) return;
        const parts = [chamadosRef, where('chaveBusca', 'in', chunk), limit(20)];
        if (orgId) parts.splice(1, 0, where('organizacaoId', '==', orgId));
        const snapshot = await getDocs(query(...parts));
        snapshot.docs.forEach((d) => found.set(d.id, { id: d.id, ...d.data() }));
      }
    }

    if (token !== state.searchToken) return;
    state.ticketBuckets.busca_remota = [...found.values()];
    mergeTicketBuckets();
    setText(els.liveStatus, found.size ? `Busca: ${found.size} encontrado(s)` : 'Ao vivo');
  } catch (error) {
    if (token !== state.searchToken) return;
    console.error('Erro na busca remota:', error);
    setText(els.liveStatus, 'Erro na busca');
    if (String(error?.message || '').includes('requires an index')) {
      showToast('O Firestore pediu um índice para a busca. Publique o firestore.indexes.json atualizado do pacote v21.', 'error');
      return;
    }
    showToast(`Erro ao pesquisar chamados: ${error.message}`, 'error');
  }
}

function refreshQueryBackedFilters() {
  scheduleRemoteFilterQuery();

  const searchRaw = normalizeKey(els.searchInput.value);
  if (state.searchTimer) window.clearTimeout(state.searchTimer);

  if (!searchRaw || searchRaw.length < 3) {
    if (state.ticketBuckets.busca_remota) delete state.ticketBuckets.busca_remota;
    renderTickets();
    return;
  }

  state.searchTimer = window.setTimeout(() => {
    runRemoteTicketSearch(searchRaw);
  }, 450);
}

function scheduleRemoteTicketSearch() {
  renderTickets();
  refreshQueryBackedFilters();
}

function renderAndRefreshSearch() {
  renderTickets();
  refreshQueryBackedFilters();
}


function filteredTickets() {
  const searchRaw = normalizeKey(els.searchInput.value);
  const search = searchRaw.toLowerCase();
  const searchDigits = digitsOnly(searchRaw);
  const status = els.statusFilter.value || 'ativos';
  const typeValues = selectedValues(els.ticketTypeFilter, 'todos');
  const orgValues = selectedValues(els.orgFilter, 'todas');
  const allTypes = typeValues.includes('todos');
  const allOrgs = orgValues.includes('todas');

  let tickets = state.tickets.filter((ticket) => {
    const ticketStatus = ticket.status || 'aberto';
    const ticketTipo = ticket.tipoChamado || 'nota_fiscal';

    if (status === 'ativos' && !ACTIVE_STATUSES.includes(ticketStatus)) return false;
    if (status !== 'todos' && status !== 'ativos' && ticketStatus !== status) return false;

    if (!allTypes && !typeValues.includes(ticketTipo)) return false;

    if (isOperatorOrAdmin() && !allOrgs && !orgValues.includes(ticket.organizacaoId)) {
      return false;
    }

    if (!isOperatorOrAdmin() && ticket.organizacaoId !== state.profile?.organizacaoId) {
      return false;
    }

    if (!ticketMatchesMainDateFilter(ticket)) return false;

    if (search) {
      const chave = String(ticket.chave || '').toLowerCase();
      const codigo = String(ticket.codigoProduto || '').toLowerCase();
      const chaveDigits = digitsOnly(chave);
      const title = ticketTitle(ticket).toLowerCase();
      const typeLabel = ticketTypeLabel(ticketTipo).toLowerCase();
      const matchText = chave.includes(search) || codigo.includes(search) || title.includes(search) || typeLabel.includes(search);
      const matchDigits = searchDigits && (chaveDigits.includes(searchDigits) || digitsOnly(codigo).includes(searchDigits));
      if (!matchText && !matchDigits) return false;
    }

    return true;
  });

  if (!isOperatorOrAdmin() && status === 'ativos' && !search && !hasMainDateFilter()) {
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
  setText(els.countInformacoesDivergentes, counts.informacoes_divergentes || 0);
  setText(els.countDevolverRecusar, counts.devolver_recusar || 0);
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

  els.ticketList.innerHTML = tickets.map((ticket) => {
    const tipo = ticket.tipoChamado || 'nota_fiscal';
    return `
      <button class="ticket-item ${ticket.id === state.selectedTicketId ? 'active' : ''}" type="button" data-ticket-id="${ticket.id}">
        <div class="ticket-row">
          <span class="ticket-key">${escapeHtml(ticketTitle(ticket))}</span>
          ${statusBadge(ticket.status)}
        </div>
        <div class="ticket-form-title">${escapeHtml(ticketTypeLabel(tipo))}</div>
        <div class="ticket-raw-key">${escapeHtml(ticketRawLine(ticket))}</div>
        <div class="ticket-meta">
          <span>${escapeHtml(ticket.organizacaoNome || 'Sem organização')}</span>
          <span>•</span>
          <span>Criado por ${escapeHtml(ticket.criadoPorNome || ticket.criadoPorEmail || '—')}</span>
          ${ticket.operadorTratamentoNome ? `<span>•</span><span>Tratando: ${escapeHtml(ticket.operadorTratamentoNome)}</span>` : ''}
          <span>•</span>
          <span>${formatDate(ticket.atualizadoEm)}</span>
        </div>
      </button>
    `;
  }).join('');

  if (state.selectedTicketId && !state.tickets.some((t) => t.id === state.selectedTicketId)) {
    state.selectedTicketId = null;
    state.historyLoadedFor = null;
    renderTicketDetail(null);
  }
}

async function selectTicket(ticketId) {
  state.selectedTicketId = ticketId;
  state.historyLoadedFor = null;
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
        <div class="detail-form-title">${escapeHtml(ticketTypeLabel(ticket.tipoChamado || 'nota_fiscal'))}</div>
        <h2 class="detail-title">${escapeHtml(ticketTitle(ticket))}</h2>
        <p class="muted">${escapeHtml(ticket.organizacaoNome || 'Sem organização')} • Atualizado ${formatDate(ticket.atualizadoEm)}</p>
        ${assignedLine}
      </div>
      ${statusBadge(ticket.status)}
    </div>

    ${renderTicketInfo(ticket)}

    ${ticket.anexo?.url ? `<p><a class="attachment-link" href="${escapeHtml(ticket.anexo.url)}" target="_blank" rel="noopener">Abrir último anexo: ${escapeHtml(ticket.anexo.nome || 'arquivo')}</a></p>` : ''}

    <div class="occurrence-panel">
      ${isOperatorOrAdmin() ? `
        <div class="occurrence-toolbar">
          <label class="field compact status-field">
            <span>Status</span>
            <select id="detailStatusSelect">
              <option value="aberto">Aberto</option>
              <option value="reaberto">Reaberto</option>
              <option value="em_tratamento">Em tratamento</option>
              <option value="informacoes_divergentes">Informações divergentes</option>
              <option value="devolver_recusar">Devolver e recusar</option>
              <option value="finalizado">Finalizado</option>
            </select>
          </label>
          ${CLOSED_STATUSES.includes(ticket.status) ? `<button id="reopenTicketBtn" class="btn ghost" type="button">Reabrir chamado</button>` : ''}
        </div>
      ` : CLOSED_STATUSES.includes(ticket.status) ? `<div class="occurrence-toolbar"><button id="reopenTicketBtn" class="btn ghost" type="button">Reabrir chamado</button></div>` : ''}

      <label class="field occurrence-textarea">
        <span>Nova ocorrência</span>
        <textarea id="newHistoryText" rows="4" placeholder="Digite uma nova ocorrência. Se colar uma tabela do Excel, ela aparecerá formatada no histórico."></textarea>
      </label>

      <div class="history-attachment">
        <input id="historyFileInput" class="hidden-file" type="file" accept="image/*,.pdf,.txt,.csv,.xlsx,.xls,.doc,.docx" />
        <div id="historyPasteZone" class="paste-zone paste-zone-small" tabindex="0" role="button" aria-label="Adicionar anexo na ocorrência">
          <div class="paste-empty">
            <strong>Anexo da ocorrência</strong>
            <small>Cole um print com Ctrl+V, clique para escolher arquivo ou arraste aqui.</small>
          </div>
          <div id="historyPastePreview" class="paste-preview hidden"></div>
        </div>
        <button id="clearHistoryFileBtn" class="btn ghost hidden" type="button">Remover anexo</button>
      </div>

      <div class="occurrence-actions">
        <button id="addHistoryBtn" class="btn primary compact-add" type="button">Adicionar</button>
      </div>
    </div>

    <h3>Histórico</h3>
    <div id="historyList" class="history"><div class="empty-state">Carregando histórico...</div></div>
  `;

  if (isOperatorOrAdmin()) {
    const select = $('detailStatusSelect');
    select.value = ticket.status || 'aberto';
  }

  const reopenButton = $('reopenTicketBtn');
  if (reopenButton) reopenButton.addEventListener('click', () => reopenTicket(ticket, 'Chamado reaberto manualmente.'));

  clearHistoryAttachment();
  setupHistoryPasteZone();
  $('addHistoryBtn').addEventListener('click', () => addHistory(ticket));
  if (state.historyLoadedFor !== ticket.id) {
    await loadHistory(ticket.id);
    state.historyLoadedFor = ticket.id;
  }
}


async function loadHistory(ticketId) {
  const historyList = $('historyList');
  if (!historyList) return;

  const q = query(collection(db, 'chamados', ticketId, 'historico'), orderBy('criadoEm', 'asc'), limit(80));
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
      ${renderTextContent(item.texto)}
      ${item.anexo?.url ? `<a class="attachment-link" href="${escapeHtml(item.anexo.url)}" target="_blank" rel="noopener">Abrir anexo: ${escapeHtml(item.anexo.nome || 'arquivo')}</a>` : ''}
      <small>${formatDate(item.criadoEm)}</small>
    </div>
  `).join('');
}

function historyTypeForStatusChange(status) {
  if (status === 'em_tratamento') return 'tratativa';
  if (status === 'reaberto') return 'reabertura';
  if (status === 'informacoes_divergentes') return 'informacoes_divergentes';
  if (status === 'devolver_recusar') return 'devolver_recusar';
  return 'status';
}

async function addHistory(ticket) {
  const ticketId = typeof ticket === 'string' ? ticket : ticket?.id;
  const currentStatus = (typeof ticket === 'object' && ticket?.status) ? ticket.status : 'aberto';
  const selectedStatus = $('detailStatusSelect')?.value || currentStatus;
  const statusChanged = isOperatorOrAdmin() && selectedStatus !== currentStatus;

  const textarea = $('newHistoryText');
  let texto = normalizeKey(textarea.value);
  const file = state.pendingHistoryFile || $('historyFileInput')?.files?.[0] || null;

  if (!ticketId) return showToast('Chamado inválido.', 'error');

  if (statusChanged && selectedStatus === 'em_tratamento' && !texto) {
    texto = statusAutoOccurrenceText(selectedStatus);
  }

  if (statusChanged && selectedStatus !== 'em_tratamento' && !texto) {
    textarea.focus();
    return showToast('Digite uma nova ocorrência explicando a alteração de status.', 'error');
  }

  if (!texto && !file && !statusChanged) {
    return showToast('Digite a ocorrência ou anexe um arquivo antes de adicionar.', 'error');
  }

  const addButton = $('addHistoryBtn');
  if (addButton) {
    addButton.disabled = true;
    addButton.textContent = 'Salvando...';
  }

  try {
    const { anexo, warning } = await tryUploadTicketFile(ticketId, file);
    const textoFinal = texto || `Anexo enviado: ${file?.name || 'imagem-colada.png'}`;
    const historyType = statusChanged ? historyTypeForStatusChange(selectedStatus) : 'observacao';

    const updatePayload = {
      ...(statusChanged ? ticketStatusPayload(selectedStatus) : {}),
      ...lastOccurrencePayload(textoFinal, historyType, anexo),
      ...(anexo ? { anexo } : {})
    };

    await updateDoc(doc(db, 'chamados', ticketId), updatePayload);
    await addHistoryDoc(ticketId, textoFinal, historyType, anexo ? { anexo } : {});

    textarea.value = '';
    clearHistoryAttachment();
    state.historyLoadedFor = null;
    await loadHistory(ticketId);
    state.historyLoadedFor = ticketId;

    if (statusChanged) {
      showToast(warning || `Status e ocorrência salvos: ${STATUS_LABELS[selectedStatus]}.`, warning ? 'error' : 'success');
    } else {
      showToast(warning || 'Ocorrência adicionada.', warning ? 'error' : 'success');
    }
  } catch (error) {
    showToast(`Erro ao salvar ocorrência: ${error.message}`, 'error');
  } finally {
    if (addButton) {
      addButton.disabled = false;
      addButton.textContent = 'Adicionar';
    }
  }
}

async function addSystemHistory(ticketId, texto, tipo = 'status', extra = {}) {
  await addHistoryDoc(ticketId, texto, tipo, extra);
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

  if (status === 'informacoes_divergentes') {
    payload.informacoesDivergentesPor = state.user.uid;
    payload.informacoesDivergentesPorNome = selectedUserName();
    payload.informacoesDivergentesPorEmail = state.user.email;
    payload.informacoesDivergentesEm = serverTimestamp();
  }

  if (status === 'devolver_recusar') {
    payload.devolverRecusarPor = state.user.uid;
    payload.devolverRecusarPorNome = selectedUserName();
    payload.devolverRecusarPorEmail = state.user.email;
    payload.devolverRecusarEm = serverTimestamp();
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
  await updateDoc(doc(db, 'chamados', ticket.id), {
    ...ticketStatusPayload('reaberto'),
    ...lastOccurrencePayload(texto, 'reabertura')
  });
  await addSystemHistory(ticket.id, texto, 'reabertura');
  showToast('Chamado reaberto.', 'success');
}

async function updateTicketStatus(ticket, status) {
  if (!STATUS_LABELS[status]) return;
  const texto = `Status alterado para ${STATUS_LABELS[status]}.`;
  const tipo = status === 'reaberto' ? 'reabertura' : 'status';
  await updateDoc(doc(db, 'chamados', ticket.id), {
    ...ticketStatusPayload(status),
    ...lastOccurrencePayload(texto, tipo)
  });

  await addSystemHistory(ticket.id, texto, tipo);

  showToast('Status atualizado.', 'success');
}


async function createTicket(event) {
  event.preventDefault();

  const tipoChamado = els.ticketTypeInput?.value || 'nf_caminhao_porta';
  const chave = limparChaveNfe(els.ticketKeyInput.value);
  const observacao = normalizeKey(els.ticketObsInput.value);
  const tipoHistorico = 'criacao';
  const file = state.pendingTicketFile || els.ticketFileInput.files?.[0] || null;

  syncTicketKeyInput(true);

  if (!isInvoiceTicketType(tipoChamado)) {
    return showToast('Este formulário não é de nota fiscal.', 'error');
  }

  if (!chaveNfeValida(chave)) {
    els.ticketKeyInput.focus();
    return showToast('Chave de acesso inválida. Informe exatamente 44 números.', 'error');
  }

  if (!observacao) {
    els.ticketObsInput.focus();
    return showToast('Preencha a observação inicial.', 'error');
  }

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
    const chaveBusca = `${tipoChamado}:${keySearchValue(chave)}`;
    const deterministicRef = doc(db, 'chamados', ticketDocId(org.id, chaveBusca));

    const existingInMemory = state.tickets.find((ticket) => (
      ticket.organizacaoId === org.id
      && (ticket.chaveBusca === chaveBusca || `${ticket.tipoChamado || 'nota_fiscal'}:${keySearchValue(ticket.chave)}` === chaveBusca)
    ));

    let existingSnap = null;
    if (!existingInMemory) {
      try {
        existingSnap = await getDoc(deterministicRef);
      } catch (error) {
        if (error?.code !== 'permission-denied') throw error;
        console.warn('Consulta prévia do chamado foi negada; tentando salvar direto.', error);
      }
    }

    const existingRef = existingInMemory ? doc(db, 'chamados', existingInMemory.id) : deterministicRef;
    const existingTicket = existingInMemory || (existingSnap?.exists() ? { id: deterministicRef.id, ...existingSnap.data() } : null);

    if (existingTicket) {
      const { anexo, warning } = await tryUploadTicketFile(existingRef.id, file);
      const updatePayload = {
        ...ticketStatusPayload('reaberto'),
        ...requesterUpdatePayload(),
        ...lastOccurrencePayload(observacao, 'reabertura', anexo),
        ...(anexo ? { anexo } : {})
      };
      await updateDoc(existingRef, updatePayload);
      await addSystemHistory(existingRef.id, observacao, 'reabertura', anexo ? { anexo } : {});
      showToast(warning || 'Já existia chamado com essa chave e formulário. Reabri o mesmo chamado e incluí a nova ocorrência.', warning ? 'error' : 'success');
      state.selectedTicketId = existingRef.id;
    } else {
      await setDoc(deterministicRef, createTicketBasePayload({ tipoChamado, chave, chaveBusca, org, observacao, tipoHistorico }));

      const { anexo, warning } = await tryUploadTicketFile(deterministicRef.id, file);
      if (anexo) await updateDoc(deterministicRef, { ...lastOccurrencePayload(observacao, tipoHistorico, anexo), anexo });
      await addSystemHistory(deterministicRef.id, observacao, tipoHistorico, anexo ? { anexo } : {});

      state.selectedTicketId = deterministicRef.id;
      showToast(warning || 'Chamado criado com sucesso.', warning ? 'error' : 'success');
    }

    els.ticketForm.reset();
    clearTicketAttachment();
    syncTicketKeyInput(false);
    els.ticketDialog.close();
  } catch (error) {
    const message = error?.code === 'permission-denied'
      ? 'Permissão negada pelo Firestore. Publique o firestore.rules v21 atualizado.'
      : error.message;
    showToast(`Erro ao salvar chamado: ${message}`, 'error');
  } finally {
    els.saveTicketBtn.disabled = false;
    els.saveTicketBtn.textContent = 'Salvar chamado';
  }
}

async function createProductTicket(event) {
  event.preventDefault();

  const tipoChamado = els.productTypeInput?.value || 'reativacao_produtos';
  const codigoProduto = normalizeProductCode(els.productCodeInput.value);
  const observacao = normalizeKey(els.productObsInput.value);
  const file = state.pendingProductFile || els.productFileInput?.files?.[0] || null;

  if (!isProductTicketType(tipoChamado)) {
    return showToast('Este formulário de produto ainda não está configurado.', 'error');
  }

  if (!codigoProduto) {
    els.productCodeInput.focus();
    return showToast('Informe o código do produto.', 'error');
  }

  if (!observacao) {
    els.productObsInput.focus();
    return showToast('Preencha a observação inicial.', 'error');
  }

  let org;
  if (isOperatorOrAdmin()) {
    org = state.orgs.find((item) => item.id === els.productOrgSelect.value);
  } else {
    org = { id: state.profile.organizacaoId, nome: state.profile.organizacaoNome };
  }

  if (!org?.id) return showToast('Selecione uma organização.', 'error');

  els.saveProductTicketBtn.disabled = true;
  els.saveProductTicketBtn.textContent = 'Salvando...';

  try {
    const chave = codigoProduto;
    const chaveBusca = `${tipoChamado}:${keySearchValue(codigoProduto)}`;
    const deterministicRef = doc(db, 'chamados', ticketDocId(org.id, chaveBusca));

    const existingInMemory = state.tickets.find((ticket) => (
      ticket.organizacaoId === org.id
      && (ticket.chaveBusca === chaveBusca || `${ticket.tipoChamado}:${keySearchValue(ticket.codigoProduto || ticket.chave)}` === chaveBusca)
    ));

    let existingSnap = null;
    if (!existingInMemory) {
      try {
        existingSnap = await getDoc(deterministicRef);
      } catch (error) {
        if (error?.code !== 'permission-denied') throw error;
        console.warn('Consulta prévia do chamado foi negada; tentando salvar direto.', error);
      }
    }

    const existingRef = existingInMemory ? doc(db, 'chamados', existingInMemory.id) : deterministicRef;
    const existingTicket = existingInMemory || (existingSnap?.exists() ? { id: deterministicRef.id, ...existingSnap.data() } : null);

    if (existingTicket) {
      const { anexo, warning } = await tryUploadTicketFile(existingRef.id, file);
      await updateDoc(existingRef, {
        ...ticketStatusPayload('reaberto'),
        ...requesterUpdatePayload(),
        ...lastOccurrencePayload(observacao, 'reabertura', anexo),
        ...(anexo ? { anexo } : {})
      });
      await addSystemHistory(existingRef.id, observacao, 'reabertura', anexo ? { anexo } : {});
      showToast(warning || 'Já existia chamado desse produto para este formulário. Reabri e incluí a nova ocorrência.', warning ? 'error' : 'success');
      state.selectedTicketId = existingRef.id;
    } else {
      await setDoc(deterministicRef, createTicketBasePayload({
        tipoChamado,
        chave,
        chaveBusca,
        codigoProduto,
        org,
        observacao,
        tipoHistorico: 'criacao'
      }));

      const { anexo, warning } = await tryUploadTicketFile(deterministicRef.id, file);
      if (anexo) await updateDoc(deterministicRef, { ...lastOccurrencePayload(observacao, 'criacao', anexo), anexo });
      await addSystemHistory(deterministicRef.id, observacao, 'criacao', anexo ? { anexo } : {});

      state.selectedTicketId = deterministicRef.id;
      showToast(warning || 'Chamado de produto criado com sucesso.', warning ? 'error' : 'success');
    }

    els.productTicketForm.reset();
    clearProductAttachment();
    updateProductObsPreview();
    els.productTicketDialog.close();
  } catch (error) {
    const message = error?.code === 'permission-denied'
      ? 'Permissão negada pelo Firestore. Publique o firestore.rules v21 atualizado.'
      : error.message;
    showToast(`Erro ao salvar chamado: ${message}`, 'error');
  } finally {
    els.saveProductTicketBtn.disabled = false;
    els.saveProductTicketBtn.textContent = 'Salvar chamado';
  }
}

function renderApp() {
  const profile = state.profile;
  els.userLine.textContent = `${profile.nome || state.user.email} • ${roleLabel(profile.papel)} • ${profile.organizacaoNome || 'Todas as organizações'}`;
  els.adminBtn.classList.toggle('hidden', !isAdmin());
  els.adminPanel?.classList.toggle('hidden', true);
  els.orgFilterWrap.classList.toggle('hidden', !isOperatorOrAdmin());
  els.ticketOrgWrap?.classList.toggle('hidden', !isOperatorOrAdmin());
  els.productOrgWrap?.classList.toggle('hidden', !isOperatorOrAdmin());
  showOnly(els.appView);
  renderOrgSelects();
  ensureMainDates();
  startTicketsListener();
  refreshQueryBackedFilters();
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

function ensureMainDates() {
  const today = todayInputValue();
  if (els.mainDateStart && !els.mainDateStart.value) els.mainDateStart.value = today;
  if (els.mainDateEnd && !els.mainDateEnd.value) els.mainDateEnd.value = today;
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

async function generateOperatorReport() {
  if (!isAdmin() || !els.operatorReportBox) return;
  ensureReportDates();

  const start = localDateStart(els.operatorReportStart.value);
  const end = localDateEnd(els.operatorReportEnd.value);
  const startDate = localDateStartDate(els.operatorReportStart.value);
  const endDate = localDateEndDate(els.operatorReportEnd.value);

  if (!start || !end || start > end || !startDate || !endDate) {
    els.operatorReportBox.innerHTML = '<div class="empty-state">Informe um intervalo de datas válido.</div>';
    return;
  }

  const btn = els.operatorReportBtn;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Gerando...';
  }

  els.operatorReportBox.innerHTML = '<div class="empty-state">Consultando Firestore apenas no período informado...</div>';

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
        reabertos: 0,
        divergentes: 0,
        devolvidos: 0
      });
    }
    return rows.get(key);
  };

  async function countByDateField(field, applyTicket) {
    const q = query(
      collection(db, 'chamados'),
      where(field, '>=', startDate),
      where(field, '<=', endDate),
      limit(1000)
    );
    const snapshot = await getDocs(q);
    snapshot.docs.forEach((d) => applyTicket({ id: d.id, ...d.data() }));
    return snapshot.size;
  }

  try {
    await countByDateField('tratamentoIniciadoEm', (ticket) => {
      ensure(ticket.operadorTratamentoId, ticket.operadorTratamentoNome, ticket.operadorTratamentoEmail).iniciados += 1;
    });

    await countByDateField('finalizadoEm', (ticket) => {
      ensure(ticket.finalizadoPor, ticket.finalizadoPorNome, ticket.finalizadoPorEmail).finalizados += 1;
    });

    await countByDateField('reabertoEm', (ticket) => {
      ensure(ticket.reabertoPor, ticket.reabertoPorNome, ticket.reabertoPorEmail).reabertos += 1;
    });

    await countByDateField('informacoesDivergentesEm', (ticket) => {
      ensure(
        ticket.informacoesDivergentesPor,
        ticket.informacoesDivergentesPorNome,
        ticket.informacoesDivergentesPorEmail
      ).divergentes += 1;
    });

    await countByDateField('devolverRecusarEm', (ticket) => {
      ensure(
        ticket.devolverRecusarPor,
        ticket.devolverRecusarPorNome,
        ticket.devolverRecusarPorEmail
      ).devolvidos += 1;
    });

    const data = [...rows.values()]
      .map((row) => ({
        ...row,
        total: row.iniciados + row.finalizados + row.reabertos + row.divergentes + row.devolvidos
      }))
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
              <th>Divergentes</th>
              <th>Devolver/recusar</th>
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
                <td>${row.divergentes}</td>
                <td>${row.devolvidos}</td>
                <td><strong>${row.total}</strong></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (error) {
    console.error('Erro ao gerar relatório:', error);
    if (String(error?.message || '').includes('requires an index')) {
      els.operatorReportBox.innerHTML = '<div class="empty-state">O Firestore pediu um índice para esse relatório. Abra o console do navegador e clique no link do erro para criar o índice sugerido.</div>';
      return;
    }
    els.operatorReportBox.innerHTML = `<div class="empty-state">Erro ao gerar relatório: ${escapeHtml(error.message)}</div>`;
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Gerar relatório';
    }
  }
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


function setProductAttachment(file) {
  if (!file) return;
  state.pendingProductFile = file;

  if (els.productPasteZone) els.productPasteZone.classList.add('has-file');

  if (els.productPastePreview) {
    const sizeKb = file.size ? `${Math.round(file.size / 1024)} KB` : '';
    const isImage = file.type?.startsWith('image/');
    els.productPastePreview.innerHTML = `
      ${isImage ? `<img src="${URL.createObjectURL(file)}" alt="Prévia do anexo" />` : ''}
      <div><strong>${escapeHtml(file.name || 'imagem-colada.png')}</strong><br><small>${escapeHtml(file.type || 'arquivo')} ${escapeHtml(sizeKb)}</small></div>
    `;
    els.productPastePreview.classList.remove('hidden');
  }

  if (els.clearProductFileBtn) els.clearProductFileBtn.classList.remove('hidden');
}

function clearProductAttachment() {
  state.pendingProductFile = null;
  if (els.productFileInput) els.productFileInput.value = '';
  if (els.productPasteZone) els.productPasteZone.classList.remove('has-file');
  if (els.productPastePreview) {
    els.productPastePreview.innerHTML = '';
    els.productPastePreview.classList.add('hidden');
  }
  if (els.clearProductFileBtn) els.clearProductFileBtn.classList.add('hidden');
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


function setupProductPasteZone() {
  if (!els.productPasteZone || !els.productFileInput) return;

  els.productPasteZone.addEventListener('click', () => els.productFileInput.click());
  els.productFileInput.addEventListener('change', () => setProductAttachment(els.productFileInput.files?.[0]));
  els.clearProductFileBtn?.addEventListener('click', clearProductAttachment);

  els.productPasteZone.addEventListener('paste', (event) => {
    const file = firstImageFromClipboard(event);
    if (!file) return;
    event.preventDefault();
    setProductAttachment(file);
    showToast('Imagem colada no anexo.', 'success');
  });

  els.productPasteZone.addEventListener('dragover', (event) => {
    event.preventDefault();
    els.productPasteZone.classList.add('drag-over');
  });

  els.productPasteZone.addEventListener('dragleave', () => els.productPasteZone.classList.remove('drag-over'));

  els.productPasteZone.addEventListener('drop', (event) => {
    event.preventDefault();
    els.productPasteZone.classList.remove('drag-over');
    const file = event.dataTransfer?.files?.[0];
    if (file) setProductAttachment(file);
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
  els.ticketTypeDialog.showModal();
});

function openInvoiceForm(tipoChamado) {
  els.ticketTypeDialog.close();
  els.ticketForm.reset();
  clearTicketAttachment();
  if (els.ticketTypeInput) els.ticketTypeInput.value = tipoChamado;
  if (els.ticketDialogTitle) els.ticketDialogTitle.textContent = `Novo chamado • ${ticketTypeLabel(tipoChamado)}`;
  syncTicketKeyInput(false);
  els.ticketDialog.showModal();
  window.setTimeout(() => els.ticketKeyInput?.focus(), 50);
}

function openProductForm(tipoChamado) {
  els.ticketTypeDialog.close();
  els.productTicketForm?.reset();
  clearProductAttachment();
  updateProductObsPreview();
  if (els.productTypeInput) els.productTypeInput.value = tipoChamado;
  if (els.productDialogTitle) els.productDialogTitle.textContent = `Novo chamado • ${ticketTypeLabel(tipoChamado)}`;
  els.productTicketDialog?.showModal();
  window.setTimeout(() => els.productCodeInput?.focus(), 50);
}

els.chooseInvoiceTruckBtn?.addEventListener('click', () => openInvoiceForm('nf_caminhao_porta'));
els.chooseInvoiceAdvanceBtn?.addEventListener('click', () => openInvoiceForm('nf_adiantamento'));
els.chooseProductReactivationBtn?.addEventListener('click', () => openProductForm('reativacao_produtos'));
els.chooseNewProductBtn?.addEventListener('click', () => openProductForm('novos_produtos'));
els.choosePedidoAndamentoBtn?.addEventListener('click', () => openProductForm('pedido_em_andamento'));
els.chooseDivergenciaFlowBtn?.addEventListener('click', () => openProductForm('divergencia_flow'));

els.ticketForm.addEventListener('submit', createTicket);
els.productTicketForm?.addEventListener('submit', createProductTicket);
els.productObsInput?.addEventListener('input', updateProductObsPreview);
els.adminBtn.addEventListener('click', () => {
  ensureReportDates();
  startUsersListener();
  renderAdmin();
  els.adminDialog.showModal();
});
els.orgForm.addEventListener('submit', createOrg);
els.operatorReportBtn?.addEventListener('click', generateOperatorReport);
els.quickOrgForm?.addEventListener('submit', createOrg);
els.searchInput.addEventListener('input', scheduleRemoteTicketSearch);
els.ticketTypeFilter?.addEventListener('change', (event) => {
  handleTicketTypeFilterChange(event);
  renderAndRefreshSearch();
});
els.statusFilter.addEventListener('change', renderAndRefreshSearch);
els.orgFilter.addEventListener('change', (event) => {
  handleOrgFilterChange(event);
  renderAndRefreshSearch();
});

els.mainDateStart?.addEventListener('change', () => {
  ensureMainDates();
  renderAndRefreshSearch();
});
els.mainDateEnd?.addEventListener('change', () => {
  ensureMainDates();
  renderAndRefreshSearch();
});

els.ticketKeyInput?.addEventListener('input', () => {
  syncTicketKeyInput(false);
});

els.ticketKeyInput?.addEventListener('paste', () => {
  window.setTimeout(() => syncTicketKeyInput(false), 0);
});

els.ticketKeyInput?.addEventListener('blur', () => {
  syncTicketKeyInput(true);
});

document.addEventListener('click', (event) => {
  document.querySelectorAll('.multi-dropdown[open]').forEach((dropdown) => {
    if (!dropdown.contains(event.target)) dropdown.open = false;
  });

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
  const file = firstImageFromClipboard(event);
  if (!file) return;

  if (els.ticketDialog?.open) {
    event.preventDefault();
    setTicketAttachment(file);
    showToast('Imagem colada no anexo.', 'success');
    return;
  }

  if (els.productTicketDialog?.open) {
    event.preventDefault();
    setProductAttachment(file);
    showToast('Imagem colada no anexo.', 'success');
  }
});

setupPasteZone();
setupProductPasteZone();
setAuthMode('login');
