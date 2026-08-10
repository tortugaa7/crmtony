(() => {
  'use strict';

  const CONFIG = window.CRM_CONFIG || {};
  const $ = id => document.getElementById(id);
  const DEFAULT_PRIORITIES = [
    { id: 'low', label: 'Baixa' },
    { id: 'medium', label: 'Média' },
    { id: 'high', label: 'Alta' },
    { id: 'urgent', label: 'Urgente' }
  ];
  const DEFAULT_PARTNER_TYPES = [
    { id: 'architect', label: 'Arquiteto(a)' },
    { id: 'builder', label: 'Construtor(a)' },
    { id: 'other', label: 'Outro parceiro' }
  ];
  const STAGES = Array.isArray(CONFIG.stages) ? CONFIG.stages.filter(stage => stage && stage.id && stage.label) : [];
  const PRIORITIES = Array.isArray(CONFIG.priorities) && CONFIG.priorities.length ? CONFIG.priorities : DEFAULT_PRIORITIES;
  const SOURCES = Array.from(new Set((Array.isArray(CONFIG.sources) ? CONFIG.sources : ['Outro'])
    .map(source => String(source || '').trim()).filter(Boolean)));
  const configuredPartnerTypes = Array.isArray(CONFIG.partnerTypes)
    ? CONFIG.partnerTypes.filter(type => type?.id && type?.label)
    : [];
  const PARTNER_TYPES = configuredPartnerTypes.length ? configuredPartnerTypes : DEFAULT_PARTNER_TYPES;
  const STORAGE_KEY = CONFIG.storageKey || 'tony_crm_clients_v2';
  const LEGACY_STORAGE_KEY = 'tony_crm_clients_v1';
  const PARTNER_STORAGE_KEY = CONFIG.partnerStorageKey || 'tony_crm_partners_v1';
  const UI_STORAGE_KEY = 'tony_crm_ui_v1';
  const BACKUP_VERSION = 3;
  const MAX_HISTORY_ENTRIES = Number.isFinite(Number(CONFIG.maxHistoryEntries)) ? Math.max(10, Number(CONFIG.maxHistoryEntries)) : 40;
  const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
  const dateFormatter = new Intl.DateTimeFormat('pt-BR');
  const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const moneyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

  if (!STAGES.length || new Set(STAGES.map(stage => stage.id)).size !== STAGES.length) {
    document.body.innerHTML = '<main class="configuration-error"><h1>Configuração inválida</h1><p>Revise as etapas definidas no arquivo <code>config.js</code> antes de usar o CRM.</p></main>';
    return;
  }

  const stageById = new Map(STAGES.map(stage => [stage.id, stage]));
  const priorityById = new Map(PRIORITIES.map(priority => [priority.id, priority]));
  const partnerTypeById = new Map(PARTNER_TYPES.map(type => [type.id, type]));
  const stageGroups = Array.from(new Set(STAGES.map(stage => stage.group || 'Fluxo')));
  const DEFAULT_STAGE_ID = STAGES[0].id;
  const DEFAULT_PRIORITY_ID = priorityById.has('medium') ? 'medium' : PRIORITIES[0].id;
  const DEFAULT_PARTNER_TYPE_ID = partnerTypeById.has('architect') ? 'architect' : PARTNER_TYPES[0].id;
  const DEFAULT_SOURCE = SOURCES[0] || 'Outro';
  const CLOSED_STAGE_ID = stageById.has(CONFIG.closedStageId) ? CONFIG.closedStageId : (stageById.has('closed') ? 'closed' : STAGES[STAGES.length - 1].id);
  const CLOSED_STAGE_INDEX = STAGES.findIndex(stage => stage.id === CLOSED_STAGE_ID);

  let clients = loadInitialClients();
  let partners = loadInitialPartners();
  let currentView = 'dashboard';
  let pipelineGroup = stageGroups.includes('Comercial') ? 'Comercial' : stageGroups[0];
  let editingId = null;
  let editingPartnerId = null;
  let searchTerm = '';
  let lastFocusedElement = null;
  let draggedClientId = null;
  let storageWarningShown = false;
  let partnerFilter = 'all';
  let reportPeriod = createDefaultPeriod();

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }

  function cleanText(value, maxLength = 300) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
  }

  function cleanNotes(value, maxLength = 3000) {
    return String(value ?? '')
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, maxLength);
  }

  function localDateKey(date = new Date()) {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 10);
  }

  function isValidDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }

  function validTimestamp(value) {
    return typeof value === 'string' && !Number.isNaN(Date.parse(value));
  }

  function uid() {
    return window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function isSafeId(value) {
    return /^[A-Za-z0-9_-]{8,100}$/.test(String(value || ''));
  }

  function parseMoney(value) {
    if (value === '' || value === null || value === undefined) return null;
    const normalized = typeof value === 'string' ? value.trim().replace(',', '.') : value;
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return Math.round(parsed * 100) / 100;
  }

  function digits(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function money(value) {
    return moneyFormatter.format(Number(value || 0));
  }

  function hasValue(value) {
    return Number.isFinite(Number(value)) && Number(value) > 0;
  }

  function dateBR(value) {
    return isValidDate(value) ? dateFormatter.format(new Date(`${value}T12:00:00`)) : '—';
  }

  function dateTimeBR(value) {
    return validTimestamp(value) ? dateTimeFormatter.format(new Date(value)) : 'Data não registrada';
  }

  function stageInfo(id) {
    return stageById.get(id) || STAGES[0];
  }

  function priorityInfo(id) {
    return priorityById.get(id) || priorityById.get(DEFAULT_PRIORITY_ID) || DEFAULT_PRIORITIES[1];
  }

  function partnerTypeInfo(id) {
    return partnerTypeById.get(id) || partnerTypeById.get(DEFAULT_PARTNER_TYPE_ID) || DEFAULT_PARTNER_TYPES[2];
  }

  function partnerById(id) {
    return partners.find(partner => partner.id === id) || null;
  }

  function isClosedStage(stageId) {
    const stageIndex = STAGES.findIndex(stage => stage.id === stageId);
    return CLOSED_STAGE_INDEX >= 0 && stageIndex >= CLOSED_STAGE_INDEX;
  }

  function sourceInfo(source) {
    return SOURCES.includes(source) ? source : (SOURCES.includes('Outro') ? 'Outro' : DEFAULT_SOURCE);
  }

  function cleanUrl(value) {
    const url = cleanText(value, 500);
    if (!url) return '';
    try {
      const parsed = new URL(url);
      return ['https:', 'http:'].includes(parsed.protocol) ? url : '';
    } catch {
      return '';
    }
  }

  function timestampDate(value) {
    return validTimestamp(value) ? localDateKey(new Date(value)) : '';
  }

  function createDefaultPeriod() {
    const now = new Date();
    return {
      mode: 'month',
      month: localDateKey(now).slice(0, 7),
      quarter: Math.floor(now.getMonth() / 3) + 1,
      year: now.getFullYear()
    };
  }

  function reportYear(value) {
    const year = Number.parseInt(value, 10);
    const currentYear = new Date().getFullYear();
    return Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : currentYear;
  }

  function isoMonthStart(year, monthIndex) {
    return `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`;
  }

  function periodYears() {
    const currentYear = new Date().getFullYear();
    const years = new Set([currentYear - 5, currentYear - 4, currentYear - 3, currentYear - 2, currentYear - 1, currentYear, currentYear + 1]);
    clients.forEach(client => [client.closedAt, timestampDate(client.createdAt)].forEach(date => {
      const year = Number.parseInt(String(date || '').slice(0, 4), 10);
      if (Number.isInteger(year) && year >= 2000 && year <= 2100) years.add(year);
    }));
    return [...years].sort((a, b) => b - a);
  }

  function resolvePeriod(period = reportPeriod) {
    const mode = ['month', 'quarter', 'year'].includes(period?.mode) ? period.mode : 'month';
    const fallback = createDefaultPeriod();
    const selectedYear = reportYear(period?.year ?? fallback.year);
    const selectedQuarter = [1, 2, 3, 4].includes(Number(period?.quarter)) ? Number(period.quarter) : fallback.quarter;
    const validMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(period?.month || '')) ? String(period.month) : fallback.month;

    if (mode === 'month') {
      const [year, month] = validMonth.split('-').map(Number);
      const nextYear = month === 12 ? year + 1 : year;
      const nextMonth = month === 12 ? 0 : month;
      return {
        mode,
        start: `${validMonth}-01`,
        end: isoMonthStart(nextYear, nextMonth),
        label: new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1, 12)),
        filenamePart: validMonth
      };
    }

    if (mode === 'quarter') {
      const startMonth = (selectedQuarter - 1) * 3;
      const endYear = selectedQuarter === 4 ? selectedYear + 1 : selectedYear;
      const endMonth = selectedQuarter === 4 ? 0 : selectedQuarter * 3;
      return {
        mode,
        start: isoMonthStart(selectedYear, startMonth),
        end: isoMonthStart(endYear, endMonth),
        label: `${selectedQuarter}º trimestre de ${selectedYear}`,
        filenamePart: `${selectedYear}-t${selectedQuarter}`
      };
    }

    return {
      mode,
      start: `${selectedYear}-01-01`,
      end: `${selectedYear + 1}-01-01`,
      label: `Ano de ${selectedYear}`,
      filenamePart: String(selectedYear)
    };
  }

  function dateInPeriod(date, period) {
    return isValidDate(date) && date >= period.start && date < period.end;
  }

  function periodSummary(period = resolvePeriod()) {
    const leads = clients.filter(client => dateInPeriod(timestampDate(client.createdAt), period));
    const sales = clients.filter(client => dateInPeriod(client.closedAt, period)).sort((a, b) => b.closedAt.localeCompare(a.closedAt));
    const revenue = sales.reduce((sum, client) => sum + Number(client.value || 0), 0);
    const salesWithoutCloseDate = clients.filter(client => isClosedStage(client.stage) && !isValidDate(client.closedAt));
    return {
      period,
      leads,
      sales,
      revenue,
      averageTicket: sales.length ? revenue / sales.length : 0,
      salesWithoutCloseDate
    };
  }

  function eventEntry(message, type = 'update', date = new Date().toISOString()) {
    return { id: uid(), type, message: cleanText(message, 180), at: validTimestamp(date) ? date : new Date().toISOString() };
  }

  function normalizeHistory(history) {
    if (!Array.isArray(history)) return [];
    const usedIds = new Set();
    return history.reduce((result, item) => {
      if (!item || typeof item !== 'object') return result;
      const message = cleanText(item.message, 180);
      if (!message) return result;
      let id = isSafeId(item.id) ? item.id : uid();
      while (usedIds.has(id)) id = uid();
      usedIds.add(id);
      result.push({ id, type: cleanText(item.type, 30) || 'update', message, at: validTimestamp(item.at) ? item.at : new Date().toISOString() });
      return result;
    }, []).slice(-MAX_HISTORY_ENTRIES);
  }

  function withHistory(client, message, type = 'update') {
    return [...normalizeHistory(client.history), eventEntry(message, type)].slice(-MAX_HISTORY_ENTRIES);
  }

  function normalizePartner(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const name = cleanText(raw.name, 120);
    if (!name) return null;
    const now = new Date().toISOString();
    return {
      id: isSafeId(raw.id) ? raw.id : uid(),
      name,
      type: partnerTypeById.has(raw.type) ? raw.type : DEFAULT_PARTNER_TYPE_ID,
      phone: cleanText(raw.phone, 20),
      email: cleanText(raw.email, 160),
      city: cleanText(raw.city, 80),
      notes: cleanNotes(raw.notes, 2000),
      createdAt: validTimestamp(raw.createdAt) ? raw.createdAt : now,
      updatedAt: validTimestamp(raw.updatedAt) ? raw.updatedAt : now
    };
  }

  function normalizePartners(rawPartners) {
    if (!Array.isArray(rawPartners)) return [];
    const ids = new Set();
    const result = [];
    rawPartners.forEach(raw => {
      const partner = normalizePartner(raw);
      if (!partner) return;
      while (ids.has(partner.id)) partner.id = uid();
      ids.add(partner.id);
      result.push(partner);
    });
    return result;
  }

  function normalizeClient(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const name = cleanText(raw.name, 120);
    if (!name) return null;

    const stage = stageById.has(raw.stage) ? raw.stage : DEFAULT_STAGE_ID;
    const priority = priorityById.has(raw.priority) ? raw.priority : DEFAULT_PRIORITY_ID;
    const source = sourceInfo(cleanText(raw.source, 80));
    const now = new Date().toISOString();
    const value = parseMoney(raw.value);

    return {
      id: isSafeId(raw.id) ? raw.id : uid(),
      name,
      phone: cleanText(raw.phone, 20),
      email: cleanText(raw.email, 160),
      stage,
      priority,
      source,
      responsible: cleanText(raw.responsible, 80),
      partnerId: isSafeId(raw.partnerId) ? raw.partnerId : '',
      service: cleanText(raw.service, 140),
      value,
      followUp: isValidDate(raw.followUp) ? raw.followUp : '',
      measurementDate: isValidDate(raw.measurementDate) ? raw.measurementDate : '',
      installationDate: isValidDate(raw.installationDate) ? raw.installationDate : '',
      closedAt: isClosedStage(stage) && isValidDate(raw.closedAt) ? raw.closedAt : '',
      contractNumber: cleanText(raw.contractNumber, 80),
      contractUrl: cleanUrl(raw.contractUrl),
      city: cleanText(raw.city, 80),
      neighborhood: cleanText(raw.neighborhood, 80),
      address: cleanText(raw.address, 180),
      notes: cleanNotes(raw.notes, 3000),
      history: normalizeHistory(raw.history),
      createdAt: validTimestamp(raw.createdAt) ? raw.createdAt : now,
      updatedAt: validTimestamp(raw.updatedAt) ? raw.updatedAt : now
    };
  }

  function normalizeClients(rawClients) {
    if (!Array.isArray(rawClients)) return [];
    const ids = new Set();
    const result = [];
    rawClients.forEach(raw => {
      const client = normalizeClient(raw);
      if (!client) return;
      while (ids.has(client.id)) client.id = uid();
      ids.add(client.id);
      result.push(client);
    });
    return result;
  }

  function readStorage(key) {
    try {
      return { ok: true, value: window.localStorage.getItem(key) };
    } catch (error) {
      console.warn('Não foi possível ler o armazenamento local.', error);
      return { ok: false, value: null };
    }
  }

  function parseStoredClients(value) {
    if (!value) return null;
    try {
      const parsed = JSON.parse(value);
      return normalizeClients(Array.isArray(parsed) ? parsed : parsed?.clients);
    } catch (error) {
      console.warn('Os dados locais do CRM não puderam ser lidos.', error);
      return null;
    }
  }

  function loadInitialClients() {
    const current = readStorage(STORAGE_KEY);
    if (!current.ok) return [];
    const currentClients = parseStoredClients(current.value);
    if (currentClients) return currentClients;

    const legacy = readStorage(LEGACY_STORAGE_KEY);
    const legacyClients = legacy.ok ? parseStoredClients(legacy.value) : null;
    if (!legacyClients) return [];

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(legacyClients));
    } catch (error) {
      console.warn('Não foi possível migrar os dados antigos do CRM.', error);
    }
    return legacyClients;
  }

  function parseStoredPartners(value) {
    if (!value) return null;
    try {
      const parsed = JSON.parse(value);
      return normalizePartners(Array.isArray(parsed) ? parsed : parsed?.partners);
    } catch (error) {
      console.warn('Os parceiros locais do CRM não puderam ser lidos.', error);
      return null;
    }
  }

  function loadInitialPartners() {
    const stored = readStorage(PARTNER_STORAGE_KEY);
    if (!stored.ok) return [];
    return parseStoredPartners(stored.value) || [];
  }

  function persistClients(nextClients) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextClients));
      return true;
    } catch (error) {
      console.error('Não foi possível salvar os dados do CRM.', error);
      showStorageError();
      return false;
    }
  }

  function commitClients(nextClients, { rerender = true } = {}) {
    const normalized = normalizeClients(nextClients);
    if (!persistClients(normalized)) return false;
    clients = normalized;
    if (rerender) render();
    return true;
  }

  function persistPartners(nextPartners) {
    try {
      window.localStorage.setItem(PARTNER_STORAGE_KEY, JSON.stringify(nextPartners));
      return true;
    } catch (error) {
      console.error('Não foi possível salvar os parceiros do CRM.', error);
      showStorageError();
      return false;
    }
  }

  function commitPartners(nextPartners, { rerender = true } = {}) {
    const normalized = normalizePartners(nextPartners);
    if (!persistPartners(normalized)) return false;
    partners = normalized;
    if (rerender) render();
    return true;
  }

  function commitCollections(nextClients, nextPartners, { rerender = true } = {}) {
    const normalizedClients = normalizeClients(nextClients);
    const normalizedPartners = normalizePartners(nextPartners);
    let previousClients = null;
    let previousPartners = null;
    let hasSnapshot = false;
    try {
      previousClients = window.localStorage.getItem(STORAGE_KEY);
      previousPartners = window.localStorage.getItem(PARTNER_STORAGE_KEY);
      hasSnapshot = true;
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedClients));
      window.localStorage.setItem(PARTNER_STORAGE_KEY, JSON.stringify(normalizedPartners));
    } catch (error) {
      if (hasSnapshot) {
        try {
          if (previousClients === null) window.localStorage.removeItem(STORAGE_KEY);
          else window.localStorage.setItem(STORAGE_KEY, previousClients);
          if (previousPartners === null) window.localStorage.removeItem(PARTNER_STORAGE_KEY);
          else window.localStorage.setItem(PARTNER_STORAGE_KEY, previousPartners);
        } catch (restoreError) {
          console.warn('Não foi possível restaurar o estado local após uma falha.', restoreError);
        }
      }
      console.error('Não foi possível salvar os dados do CRM.', error);
      showStorageError();
      return false;
    }
    clients = normalizedClients;
    partners = normalizedPartners;
    if (rerender) render();
    return true;
  }

  function showToast(message, variant = 'success') {
    const region = $('toastRegion');
    if (!region) return;
    const toast = document.createElement('div');
    toast.className = `toast ${variant}`;
    toast.setAttribute('role', variant === 'error' ? 'alert' : 'status');
    toast.textContent = message;
    region.append(toast);
    window.setTimeout(() => toast.classList.add('leaving'), 3_500);
    window.setTimeout(() => toast.remove(), 3_850);
  }

  function showStorageError() {
    if (storageWarningShown) return;
    storageWarningShown = true;
    showToast('Não foi possível salvar neste navegador. Libere espaço ou importe um backup em outro navegador.', 'error');
  }

  function whatsappLink(client) {
    let phone = digits(client.phone);
    const countryCode = digits(CONFIG.whatsappCountryCode || '55');
    if (countryCode && phone.startsWith(countryCode) && phone.length > 11) phone = phone.slice(countryCode.length);
    if (phone.length < 10) return null;
    const firstName = cleanText(client.name, 120).split(' ')[0];
    const greeting = String(CONFIG.whatsappGreeting || 'Olá{name}! Tudo bem?')
      .replace(/\{name\}/g, firstName ? `, ${firstName}` : '');
    return `https://wa.me/${countryCode}${phone}?text=${encodeURIComponent(greeting)}`;
  }

  function filteredClients() {
    const query = searchTerm.trim().toLocaleLowerCase('pt-BR');
    if (!query) return clients;
    return clients.filter(client => {
      const stage = stageInfo(client.stage);
      const priority = priorityInfo(client.priority);
      const partner = partnerById(client.partnerId);
      return [
        client.name, client.phone, client.email, client.city, client.neighborhood, client.address,
        client.service, client.responsible, client.source, client.notes, stage.label, stage.short,
        priority.label, partner?.name, client.followUp, client.measurementDate, client.installationDate,
        client.closedAt, client.contractNumber
      ].some(value => String(value || '').toLocaleLowerCase('pt-BR').includes(query));
    });
  }

  function reminderState(client) {
    if (!isValidDate(client.followUp)) return 'none';
    const today = localDateKey();
    if (client.followUp < today) return 'overdue';
    if (client.followUp === today) return 'today';
    return 'upcoming';
  }

  function render() {
    if (!['dashboard', 'pipeline', 'clients', 'partners', 'reports'].includes(currentView)) currentView = 'dashboard';
    document.querySelectorAll('.view').forEach(view => view.classList.add('hidden'));
    $(`${currentView}View`).classList.remove('hidden');
    document.querySelectorAll('.nav-btn').forEach(button => button.classList.toggle('active', button.dataset.view === currentView));

    const titles = {
      dashboard: ['Visão geral', 'Resultados por período e visão operacional em um só lugar.'],
      pipeline: ['Funil de clientes', 'Arraste os cartões para atualizar a etapa do cliente.'],
      clients: ['Clientes', 'Lista completa com busca e acompanhamento.'],
      partners: ['Parceiros e indicações', 'Arquitetos, construtores e outros parceiros vinculados aos clientes.'],
      reports: ['Relatórios', 'Fechamentos separados por mês, trimestre ou ano.']
    };
    $('pageTitle').textContent = titles[currentView][0];
    $('pageSubtitle').textContent = titles[currentView][1];
    $('searchInput').value = searchTerm;
    const searchEnabled = ['pipeline', 'clients'].includes(currentView);
    $('searchInput').disabled = !searchEnabled;
    $('searchInput').placeholder = searchEnabled ? 'Buscar cliente, telefone, cidade...' : 'Busca disponível em Funil e Clientes';
    $('searchInput').closest('.search-box').classList.toggle('is-disabled', !searchEnabled);

    if (currentView === 'dashboard') renderDashboard();
    if (currentView === 'pipeline') renderPipeline();
    if (currentView === 'clients') renderClients();
    if (currentView === 'partners') renderPartners();
    if (currentView === 'reports') renderReports();
  }

  function periodControlsHtml() {
    const mode = reportPeriod.mode;
    const period = resolvePeriod();
    const yearOptions = periodYears().map(year => `<option value="${year}" ${reportYear(reportPeriod.year) === year ? 'selected' : ''}>${year}</option>`).join('');
    const detailControl = mode === 'month'
      ? `<label class="period-field"><span>Mês</span><input type="month" data-period-month value="${escapeHTML(reportPeriod.month)}" /></label>`
      : mode === 'quarter'
        ? `<label class="period-field"><span>Trimestre</span><select data-period-quarter>${[1, 2, 3, 4].map(quarter => `<option value="${quarter}" ${Number(reportPeriod.quarter) === quarter ? 'selected' : ''}>${quarter}º trimestre</option>`).join('')}</select></label><label class="period-field"><span>Ano</span><select data-period-year>${yearOptions}</select></label>`
        : `<label class="period-field"><span>Ano</span><select data-period-year>${yearOptions}</select></label>`;
    return `<section class="period-toolbar" aria-label="Período analisado"><div class="period-copy"><span>Resultados de</span><strong>${escapeHTML(period.label)}</strong><small>Vendas entram exclusivamente pela data de fechamento.</small></div><div class="period-controls"><div class="segmented period-mode"><button type="button" data-period-mode="month" class="${mode === 'month' ? 'active' : ''}">Mensal</button><button type="button" data-period-mode="quarter" class="${mode === 'quarter' ? 'active' : ''}">Trimestral</button><button type="button" data-period-mode="year" class="${mode === 'year' ? 'active' : ''}">Anual</button></div><div class="period-fields">${detailControl}</div></div></section>`;
  }

  function bindPeriodControls(container, rerender) {
    container.querySelectorAll('[data-period-mode]').forEach(button => button.addEventListener('click', () => {
      reportPeriod = { ...reportPeriod, mode: button.dataset.periodMode };
      rerender();
    }));
    const monthInput = container.querySelector('[data-period-month]');
    if (monthInput) monthInput.addEventListener('change', event => {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value)) return;
      const [year, month] = event.target.value.split('-').map(Number);
      reportPeriod = { ...reportPeriod, month: event.target.value, year, quarter: Math.floor((month - 1) / 3) + 1 };
      rerender();
    });
    const quarterInput = container.querySelector('[data-period-quarter]');
    if (quarterInput) quarterInput.addEventListener('change', event => {
      reportPeriod = { ...reportPeriod, quarter: Number(event.target.value) };
      rerender();
    });
    const yearInput = container.querySelector('[data-period-year]');
    if (yearInput) yearInput.addEventListener('change', event => {
      reportPeriod = { ...reportPeriod, year: reportYear(event.target.value) };
      rerender();
    });
  }

  function renderDashboard() {
    const summary = periodSummary();
    const attention = clients.filter(client => ['overdue', 'today'].includes(reminderState(client)) && client.stage !== 'post_sale');
    const nextFollowUps = [...attention].sort((a, b) => a.followUp.localeCompare(b.followUp)).slice(0, 6);

    $('dashboardView').innerHTML = `
      ${periodControlsHtml()}
      <div class="summary-grid period-summary-grid">
        <div class="summary-card"><span>Leads cadastrados</span><strong>${summary.leads.length}</strong><small>No período selecionado</small></div>
        <div class="summary-card"><span>Vendas fechadas</span><strong>${summary.sales.length}</strong><small>Por data de fechamento</small></div>
        <div class="summary-card"><span>Faturamento fechado</span><strong>${money(summary.revenue)}</strong><small>Sem misturar outros períodos</small></div>
        <div class="summary-card"><span>Ticket médio</span><strong>${money(summary.averageTicket)}</strong><small>Vendas fechadas no período</small></div>
      </div>
      ${summary.salesWithoutCloseDate.length ? `<div class="data-quality-alert"><div><strong>${summary.salesWithoutCloseDate.length} venda(s) sem data de fechamento</strong><span>Elas não entram no resultado de ${escapeHTML(summary.period.label)} até você registrar a data correta.</span></div><button type="button" class="secondary-btn" data-view-link="clients">Corrigir dados</button></div>` : ''}
      <section class="dashboard-panel" aria-labelledby="closedSalesTitle">
        <div class="dashboard-panel-heading"><div><h2 id="closedSalesTitle">Vendas fechadas em ${escapeHTML(summary.period.label)}</h2><p>Lista baseada somente na data de fechamento cadastrada.</p></div><div class="panel-actions"><button type="button" class="text-btn" data-view-link="reports">Ver relatório</button><button type="button" class="secondary-btn compact-btn" data-download-period-report>⇩ Baixar PDF</button></div></div>
        ${summary.sales.length ? `<div class="period-sales-list">${summary.sales.slice(0, 6).map(periodSaleRow).join('')}${summary.sales.length > 6 ? `<p class="panel-more">+ ${summary.sales.length - 6} venda(s) disponível(is) no relatório completo.</p>` : ''}</div>` : `<div class="empty-state compact"><strong>Nenhuma venda fechada neste período.</strong><span>Ao marcar a data de fechamento no cliente, ela aparecerá aqui no mês, trimestre e ano corretos.</span></div>`}
      </section>
      <section class="dashboard-panel" aria-labelledby="operationalTitle">
        <div class="dashboard-panel-heading"><div><h2 id="operationalTitle">Visão operacional atual</h2><p>Clientes em carteira hoje. Esta área não altera os resultados do período.</p></div><button type="button" class="text-btn" data-view-link="pipeline">Abrir funil</button></div>
        <div class="stage-grid operational-stage-grid">${STAGES.map(stage => {
          const list = clients.filter(client => client.stage === stage.id);
          return `<button type="button" class="stage-stat" data-go-stage="${escapeHTML(stage.id)}"><div class="stage-icon" aria-hidden="true">${stageIcon(stage.id)}</div><div><span>${escapeHTML(stage.short || stage.label)}</span><strong>${list.length}</strong><small>${money(list.reduce((sum, client) => sum + Number(client.value || 0), 0))}</small></div></button>`;
        }).join('')}</div>
      </section>
      <section class="dashboard-panel" aria-labelledby="followUpTitle">
        <div class="dashboard-panel-heading"><div><h2 id="followUpTitle">Retornos que pedem atenção</h2><p>Vencidos e programados para hoje.</p></div><button type="button" class="text-btn" data-view-link="clients">Ver todos os clientes</button></div>
        ${nextFollowUps.length ? `<div class="follow-up-list">${nextFollowUps.map(client => followUpRow(client)).join('')}</div>` : `<div class="empty-state compact"><strong>${clients.length ? 'Tudo em dia por enquanto.' : 'Comece adicionando o primeiro cliente.'}</strong><span>${clients.length ? 'Nenhum retorno vencido ou marcado para hoje.' : 'O CRM vai organizar o atendimento, produção e instalação.'}</span>${clients.length ? '' : '<button type="button" class="primary-btn" data-new-client>＋ Cadastrar cliente</button>'}</div>`}
      </section>`;

    bindDashboardActions();
  }

  function stageIcon(id) {
    return ({ whatsapp: 'W', hot: '🔥', budget: '$', closed: '✓', measurement: 'M', production: 'P', ready: 'R', installation: 'I', post_sale: '★' })[id] || '•';
  }

  function followUpRow(client) {
    const state = reminderState(client);
    const label = state === 'overdue' ? 'Retorno vencido' : 'Retorno hoje';
    return `<button type="button" class="follow-up-row ${state}" data-open-client="${escapeHTML(client.id)}"><span class="follow-up-date">${dateBR(client.followUp)}</span><span class="follow-up-copy"><strong>${escapeHTML(client.name)}</strong><small>${escapeHTML(client.service || 'Sem serviço informado')} · ${escapeHTML(stageInfo(client.stage).short || stageInfo(client.stage).label)}</small></span><span class="follow-up-status">${label}</span></button>`;
  }

  function periodSaleRow(client) {
    const partner = partnerById(client.partnerId);
    return `<button type="button" class="period-sale-row" data-open-client="${escapeHTML(client.id)}"><span class="period-sale-date">${dateBR(client.closedAt)}</span><span class="period-sale-copy"><strong>${escapeHTML(client.name)}</strong><small>${escapeHTML(client.service || 'Serviço não informado')}${partner ? ` · Indicação: ${escapeHTML(partner.name)}` : ''}</small></span><span class="period-sale-value">${hasValue(client.value) ? money(client.value) : 'Sem valor'}</span></button>`;
  }

  function bindDashboardActions() {
    bindPeriodControls($('dashboardView'), renderDashboard);
    $('dashboardView').querySelectorAll('[data-go-stage]').forEach(button => button.addEventListener('click', () => {
      const stage = stageInfo(button.dataset.goStage);
      pipelineGroup = stage.group || pipelineGroup;
      currentView = 'pipeline';
      render();
    }));
    $('dashboardView').querySelectorAll('[data-open-client]').forEach(button => button.addEventListener('click', () => openClient(button.dataset.openClient)));
    $('dashboardView').querySelectorAll('[data-new-client]').forEach(button => button.addEventListener('click', () => openClient()));
    $('dashboardView').querySelectorAll('[data-view-link]').forEach(button => button.addEventListener('click', () => {
      currentView = button.dataset.viewLink;
      render();
    }));
    $('dashboardView').querySelectorAll('[data-download-period-report]').forEach(button => button.addEventListener('click', downloadPeriodReport));
  }

  function reportFilename(period, suffix = '') {
    const prefix = cleanText(CONFIG.reportFilePrefix || 'relatorio-tony-crm', 60).replace(/[^a-z0-9_-]/gi, '-') || 'relatorio-tony-crm';
    return `${prefix}-${period.filenamePart}${suffix ? `-${suffix}` : ''}.pdf`;
  }

  function buildPeriodReportPayload(summary = periodSummary()) {
    return {
      companyName: CONFIG.companyName || 'Tony Acabamentos',
      periodLabel: summary.period.label,
      generatedAt: dateTimeBR(new Date().toISOString()),
      metrics: {
        leads: String(summary.leads.length),
        closedSales: String(summary.sales.length),
        revenue: money(summary.revenue),
        averageTicket: money(summary.averageTicket),
        missingCloseDates: summary.salesWithoutCloseDate.length
      },
      sales: summary.sales.map(client => ({
        closedAt: dateBR(client.closedAt),
        name: client.name,
        service: client.service || 'Não informado',
        value: hasValue(client.value) ? money(client.value) : 'R$ 0,00'
      }))
    };
  }

  function downloadPeriodReport() {
    if (!window.TonyPdfReport?.download) {
      showToast('O gerador de PDF não foi carregado. Atualize a página e tente novamente.', 'error');
      return;
    }
    const summary = periodSummary();
    window.TonyPdfReport.download(buildPeriodReportPayload(summary), reportFilename(summary.period));
    showToast(`Relatório de ${summary.period.label} baixado em PDF.`);
  }

  function clientReportFilename(client) {
    const slug = cleanText(client.name, 80).toLocaleLowerCase('pt-BR')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || client.id;
    const prefix = cleanText(CONFIG.reportFilePrefix || 'relatorio-tony-crm', 60).replace(/[^a-z0-9_-]/gi, '-') || 'relatorio-tony-crm';
    return `${prefix}-cliente-${slug}.pdf`;
  }

  function buildClientReportPayload(client) {
    const partner = partnerById(client.partnerId);
    return {
      companyName: CONFIG.companyName || 'Tony Acabamentos',
      clientName: client.name,
      generatedAt: dateTimeBR(new Date().toISOString()),
      status: stageInfo(client.stage).label,
      details: [
        { label: 'WhatsApp', value: client.phone || 'Não informado' },
        { label: 'E-mail', value: client.email || 'Não informado' },
        { label: 'Serviço', value: client.service || 'Não informado' },
        { label: 'Valor', value: hasValue(client.value) ? money(client.value) : 'Não informado' },
        { label: 'Data de fechamento', value: dateBR(client.closedAt) },
        { label: 'Contrato / pedido', value: client.contractNumber || 'Não informado' },
        { label: 'Parceiro / indicação', value: partner?.name || 'Indicação direta' },
        { label: 'Endereço', value: [client.address, client.neighborhood, client.city].filter(Boolean).join(' - ') || 'Não informado' }
      ],
      notes: client.notes || 'Sem observações registradas.',
      contractLink: client.contractUrl || '',
      history: normalizeHistory(client.history).slice().reverse().map(entry => ({ at: dateTimeBR(entry.at), message: entry.message }))
    };
  }

  function downloadClientReport(id = editingId) {
    const client = clients.find(item => item.id === id);
    if (!client) {
      showToast('Este cliente não foi encontrado para gerar o relatório.', 'error');
      return;
    }
    if (!window.TonyPdfReport?.downloadClient) {
      showToast('O gerador de PDF não foi carregado. Atualize a página e tente novamente.', 'error');
      return;
    }
    window.TonyPdfReport.downloadClient(buildClientReportPayload(client), clientReportFilename(client));
    showToast(`Relatório individual de ${client.name} baixado em PDF.`);
  }

  function renderReports() {
    const summary = periodSummary();
    $('reportsView').innerHTML = `
      ${periodControlsHtml()}
      <section class="report-hero"><div><span class="section-kicker">RELATÓRIO PRONTO</span><h2>${escapeHTML(summary.period.label)}</h2><p>O PDF reúne somente as vendas cuja data de fechamento está dentro do período escolhido.</p></div><button type="button" class="primary-btn report-download-btn" data-download-period-report>⇩ Baixar relatório em PDF</button></section>
      <div class="summary-grid period-summary-grid">
        <div class="summary-card"><span>Leads cadastrados</span><strong>${summary.leads.length}</strong><small>No período selecionado</small></div>
        <div class="summary-card"><span>Vendas fechadas</span><strong>${summary.sales.length}</strong><small>Por data de fechamento</small></div>
        <div class="summary-card"><span>Faturamento fechado</span><strong>${money(summary.revenue)}</strong><small>Somente do período</small></div>
        <div class="summary-card"><span>Ticket médio</span><strong>${money(summary.averageTicket)}</strong><small>Somente do período</small></div>
      </div>
      ${summary.salesWithoutCloseDate.length ? `<div class="data-quality-alert"><div><strong>${summary.salesWithoutCloseDate.length} venda(s) ainda sem data de fechamento</strong><span>Elas ficam fora do relatório até a data ser informada no cadastro do cliente.</span></div><button type="button" class="secondary-btn" data-view-link="clients">Abrir clientes</button></div>` : ''}
      <section class="dashboard-panel report-list-panel" aria-labelledby="reportSalesTitle"><div class="dashboard-panel-heading"><div><h2 id="reportSalesTitle">Vendas incluídas no relatório</h2><p>${summary.sales.length} venda(s) fechada(s) em ${escapeHTML(summary.period.label)}.</p></div></div>${summary.sales.length ? `<div class="table-shell report-table-shell"><table><thead><tr><th>Fechamento</th><th>Cliente</th><th>Parceiro</th><th>Contrato</th><th>Serviço</th><th>Valor</th><th>PDF</th></tr></thead><tbody>${summary.sales.map(reportSaleRow).join('')}</tbody></table></div>` : '<div class="empty-state compact"><strong>Não há vendas para este período.</strong><span>Você pode escolher outro mês, trimestre ou ano acima.</span></div>'}</section>`;
    bindPeriodControls($('reportsView'), renderReports);
    $('reportsView').querySelectorAll('[data-download-period-report]').forEach(button => button.addEventListener('click', downloadPeriodReport));
    $('reportsView').querySelectorAll('[data-view-link]').forEach(button => button.addEventListener('click', () => {
      currentView = button.dataset.viewLink;
      render();
    }));
    $('reportsView').querySelectorAll('[data-open-client]').forEach(button => button.addEventListener('click', () => openClient(button.dataset.openClient)));
    $('reportsView').querySelectorAll('[data-client-report]').forEach(button => button.addEventListener('click', () => downloadClientReport(button.dataset.clientReport)));
  }

  function reportSaleRow(client) {
    const partner = partnerById(client.partnerId);
    return `<tr><td>${dateBR(client.closedAt)}</td><td><button type="button" class="table-link-btn" data-open-client="${escapeHTML(client.id)}">${escapeHTML(client.name)}</button></td><td>${escapeHTML(partner?.name || '—')}</td><td>${escapeHTML(client.contractNumber || '—')}</td><td>${escapeHTML(client.service || '—')}</td><td>${hasValue(client.value) ? money(client.value) : '—'}</td><td><button type="button" class="row-action" data-client-report="${escapeHTML(client.id)}">PDF</button></td></tr>`;
  }

  function partnerStats(partner) {
    const referrals = clients.filter(client => client.partnerId === partner.id);
    const closed = referrals.filter(client => isValidDate(client.closedAt));
    return {
      referrals,
      closed,
      revenue: closed.reduce((sum, client) => sum + Number(client.value || 0), 0)
    };
  }

  function renderPartners() {
    const visiblePartners = partners.filter(partner => partnerFilter === 'all' || partner.type === partnerFilter)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    $('partnersView').innerHTML = `
      <section class="partners-toolbar"><div class="segmented partner-filter" aria-label="Filtrar parceiros"><button type="button" data-partner-filter="all" class="${partnerFilter === 'all' ? 'active' : ''}">Todos (${partners.length})</button>${PARTNER_TYPES.map(type => `<button type="button" data-partner-filter="${escapeHTML(type.id)}" class="${partnerFilter === type.id ? 'active' : ''}">${escapeHTML(type.label)} (${partners.filter(partner => partner.type === type.id).length})</button>`).join('')}</div><button type="button" class="primary-btn" data-new-partner>＋ Novo parceiro</button></section>
      <div class="partner-summary-grid"><div class="summary-card"><span>Parceiros cadastrados</span><strong>${partners.length}</strong><small>Arquitetos, construtores e outros</small></div><div class="summary-card"><span>Indicações vinculadas</span><strong>${clients.filter(client => client.partnerId).length}</strong><small>Clientes com parceiro identificado</small></div><div class="summary-card"><span>Vendas de indicações</span><strong>${clients.filter(client => client.partnerId && isValidDate(client.closedAt)).length}</strong><small>Com data de fechamento</small></div></div>
      ${visiblePartners.length ? `<div class="partners-grid">${visiblePartners.map(partnerCard).join('')}</div>` : `<div class="empty-state"><strong>${partners.length ? 'Nenhum parceiro neste filtro.' : 'Ainda não há parceiros cadastrados.'}</strong><span>Cadastre arquitetos, construtores ou outros parceiros e vincule-os aos clientes indicados.</span><button type="button" class="primary-btn" data-new-partner>＋ Cadastrar parceiro</button></div>`}`;
    $('partnersView').querySelectorAll('[data-partner-filter]').forEach(button => button.addEventListener('click', () => {
      partnerFilter = button.dataset.partnerFilter;
      renderPartners();
    }));
    $('partnersView').querySelectorAll('[data-new-partner]').forEach(button => button.addEventListener('click', () => openPartner()));
    $('partnersView').querySelectorAll('[data-open-partner]').forEach(button => button.addEventListener('click', () => openPartner(button.dataset.openPartner)));
  }

  function partnerCard(partner) {
    const stats = partnerStats(partner);
    const type = partnerTypeInfo(partner.type);
    return `<button type="button" class="partner-card" data-open-partner="${escapeHTML(partner.id)}"><div class="partner-card-top"><div><span class="partner-type-pill">${escapeHTML(type.label)}</span><strong>${escapeHTML(partner.name)}</strong><small>${escapeHTML(partner.city || 'Cidade não informada')}</small></div><span class="partner-open">Abrir</span></div><div class="partner-card-stats"><span><strong>${stats.referrals.length}</strong> indicação(ões)</span><span><strong>${stats.closed.length}</strong> venda(s)</span><span><strong>${money(stats.revenue)}</strong> fechado</span></div></button>`;
  }

  function renderPipeline() {
    const data = filteredClients();
    if (!stageGroups.includes(pipelineGroup)) pipelineGroup = stageGroups[0];
    const stages = STAGES.filter(stage => (stage.group || 'Fluxo') === pipelineGroup);
    $('pipelineView').innerHTML = `
      <div class="segmented" aria-label="Escolher área do funil">${stageGroups.map(group => `<button type="button" data-group="${escapeHTML(group)}" class="${pipelineGroup === group ? 'active' : ''}">${escapeHTML(group === 'Operação' ? 'Produção e instalação' : group)}</button>`).join('')}</div>
      <div class="pipeline-wrap">${stages.map(stage => {
        const list = data.filter(client => client.stage === stage.id);
        return `<section class="pipeline-column" data-drop-stage="${escapeHTML(stage.id)}"><div class="column-header"><div><strong>${escapeHTML(stage.short || stage.label)}</strong><span>${list.length} cliente${list.length === 1 ? '' : 's'}</span></div><em>${money(list.reduce((sum, client) => sum + Number(client.value || 0), 0))}</em></div><div class="column-body">${list.length ? list.map(clientCard).join('') : '<div class="empty-column">Arraste um cliente para cá</div>'}</div></section>`;
      }).join('')}</div>`;

    $('pipelineView').querySelectorAll('.segmented button').forEach(button => button.addEventListener('click', () => {
      pipelineGroup = button.dataset.group;
      renderPipeline();
    }));
    setupPipelineDragAndDrop();
  }

  function priorityMark(priority) {
    return ({ low: '↓', medium: '•', high: '↑', urgent: '!' })[priority] || '•';
  }

  function clientCard(client) {
    const location = [client.neighborhood, client.city].filter(Boolean).join(' • ');
    const reminder = reminderState(client);
    const whatsapp = whatsappLink(client);
    const priority = priorityInfo(client.priority);
    const partner = partnerById(client.partnerId);
    return `<article class="client-card priority-${escapeHTML(client.priority)}" draggable="true" data-id="${escapeHTML(client.id)}" tabindex="0" aria-label="Abrir cliente ${escapeHTML(client.name)}"><div class="card-top"><div><strong>${escapeHTML(client.name)}</strong><span>${escapeHTML(client.service || 'Sem serviço informado')}</span></div><span class="priority-dot ${escapeHTML(client.priority)}" title="Prioridade ${escapeHTML(priority.label)}">${priorityMark(client.priority)}</span></div>${client.phone ? `<div class="card-line">☎ ${escapeHTML(client.phone)}</div>` : ''}${partner ? `<div class="card-line">⌘ ${escapeHTML(partner.name)}</div>` : ''}${location ? `<div class="card-line">⌖ ${escapeHTML(location)}</div>` : ''}${client.followUp ? `<div class="card-line reminder-${reminder}">◷ ${reminder === 'overdue' ? 'Retorno vencido: ' : reminder === 'today' ? 'Retorno hoje: ' : 'Retorno: '}${dateBR(client.followUp)}</div>` : ''}<div class="card-footer"><span class="value">${hasValue(client.value) ? money(client.value) : 'Sem valor'}</span>${whatsapp ? `<a class="wa-link" href="${escapeHTML(whatsapp)}" target="_blank" rel="noreferrer" aria-label="Abrir WhatsApp de ${escapeHTML(client.name)}">W</a>` : ''}</div></article>`;
  }

  function setupPipelineDragAndDrop() {
    $('pipelineView').querySelectorAll('.client-card').forEach(card => {
      card.addEventListener('click', event => {
        if (!event.target.closest('a')) openClient(card.dataset.id);
      });
      card.addEventListener('keydown', event => {
        if ((event.key === 'Enter' || event.key === ' ') && !event.target.closest('a')) {
          event.preventDefault();
          openClient(card.dataset.id);
        }
      });
      card.addEventListener('dragstart', event => {
        draggedClientId = card.dataset.id;
        card.classList.add('dragging');
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', draggedClientId);
      });
      card.addEventListener('dragend', () => {
        draggedClientId = null;
        card.classList.remove('dragging');
        $('pipelineView').querySelectorAll('.pipeline-column').forEach(column => column.classList.remove('drag-over'));
      });
    });

    $('pipelineView').querySelectorAll('[data-drop-stage]').forEach(column => {
      column.addEventListener('dragover', event => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        column.classList.add('drag-over');
      });
      column.addEventListener('dragleave', event => {
        if (!column.contains(event.relatedTarget)) column.classList.remove('drag-over');
      });
      column.addEventListener('drop', event => {
        event.preventDefault();
        column.classList.remove('drag-over');
        const id = event.dataTransfer.getData('text/plain') || draggedClientId;
        if (id) moveClientToStage(id, column.dataset.dropStage);
      });
    });
  }

  function moveClientToStage(id, stageId) {
    const client = clients.find(item => item.id === id);
    if (!client || !stageById.has(stageId) || client.stage === stageId) return;
    const previousStage = stageInfo(client.stage);
    const nextStage = stageInfo(stageId);
    const enteringClosedStage = !isClosedStage(client.stage) && isClosedStage(stageId);
    const leavingClosedStage = isClosedStage(client.stage) && !isClosedStage(stageId);
    const closeDate = isClosedStage(stageId) ? (client.closedAt || (enteringClosedStage ? localDateKey() : '')) : '';
    const now = new Date().toISOString();
    const nextClients = clients.map(item => {
      if (item.id !== id) return item;
      let history = withHistory(item, `Etapa alterada de ${previousStage.label} para ${nextStage.label}.`, 'stage');
      if (enteringClosedStage && closeDate) history = [...history, eventEntry(`Data de fechamento registrada em ${dateBR(closeDate)}.`, 'closed', now)].slice(-MAX_HISTORY_ENTRIES);
      if (leavingClosedStage && item.closedAt) history = [...history, eventEntry('Venda reaberta e data de fechamento removida.', 'reopened', now)].slice(-MAX_HISTORY_ENTRIES);
      return { ...item, stage: stageId, closedAt: closeDate, history, updatedAt: now };
    });
    if (commitClients(nextClients, { rerender: false })) {
      renderPipeline();
      showToast(`${client.name} movido para ${nextStage.short || nextStage.label}.${enteringClosedStage ? ' Data de fechamento registrada.' : ''}`);
    }
  }

  function renderClients() {
    const data = [...filteredClients()].sort((a, b) => {
      const aReminder = reminderState(a);
      const bReminder = reminderState(b);
      const aWeight = aReminder === 'overdue' ? 0 : aReminder === 'today' ? 1 : 2;
      const bWeight = bReminder === 'overdue' ? 0 : bReminder === 'today' ? 1 : 2;
      if (aWeight !== bWeight) return aWeight - bWeight;
      return String(b.updatedAt).localeCompare(String(a.updatedAt));
    });
    $('clientsView').innerHTML = data.length ? `<div class="table-shell"><table><thead><tr><th>Cliente</th><th>Contato</th><th>Parceiro</th><th>Etapa</th><th>Serviço</th><th>Contrato</th><th>Valor</th><th>Fechamento</th><th>Próximo retorno</th><th><span class="sr-only">Ação</span></th></tr></thead><tbody>${data.map(clientRow).join('')}</tbody></table></div>` : `<div class="empty-state"><strong>${clients.length ? 'Nenhum cliente encontrado.' : 'Ainda não há clientes no CRM.'}</strong><span>${clients.length ? 'Tente outro termo de busca.' : 'Cadastre o primeiro atendimento para começar o acompanhamento.'}</span>${clients.length ? '<button type="button" class="secondary-btn" data-clear-search>Limpar busca</button>' : '<button type="button" class="primary-btn" data-new-client>＋ Cadastrar cliente</button>'}</div>`;
    $('clientsView').querySelectorAll('tr[data-open-client]').forEach(row => {
      row.addEventListener('click', event => {
        if (event.target.closest('a, button')) return;
        openClient(row.dataset.openClient);
      });
      row.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openClient(row.dataset.openClient);
        }
      });
    });
    $('clientsView').querySelectorAll('button[data-open-client]').forEach(button => button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      openClient(button.dataset.openClient);
    }));
    $('clientsView').querySelectorAll('[data-new-client]').forEach(button => button.addEventListener('click', () => openClient()));
    $('clientsView').querySelectorAll('[data-clear-search]').forEach(button => button.addEventListener('click', () => {
      searchTerm = '';
      $('searchInput').value = '';
      renderClients();
    }));
  }

  function clientRow(client) {
    const reminder = reminderState(client);
    const partner = partnerById(client.partnerId);
    const whatsapp = whatsappLink(client);
    return `<tr data-open-client="${escapeHTML(client.id)}" tabindex="0"><td><strong>${escapeHTML(client.name)}</strong><small>${escapeHTML(client.city || 'Cidade não informada')}</small></td><td>${whatsapp ? `<a href="${escapeHTML(whatsapp)}" target="_blank" rel="noreferrer" aria-label="Abrir WhatsApp de ${escapeHTML(client.name)}">W ${escapeHTML(client.phone)}</a>` : '—'}</td><td>${escapeHTML(partner?.name || '—')}</td><td><span class="stage-pill">${escapeHTML(stageInfo(client.stage).short || stageInfo(client.stage).label)}</span></td><td>${escapeHTML(client.service || '—')}</td><td>${escapeHTML(client.contractNumber || '—')}</td><td>${hasValue(client.value) ? money(client.value) : '—'}</td><td>${dateBR(client.closedAt)}</td><td><span class="table-reminder ${reminder}">${dateBR(client.followUp)}</span></td><td><button type="button" class="row-action" data-open-client="${escapeHTML(client.id)}" aria-label="Abrir ${escapeHTML(client.name)}">Abrir</button></td></tr>`;
  }

  function fillSelects() {
    $('fStage').innerHTML = STAGES.map(stage => `<option value="${escapeHTML(stage.id)}">${escapeHTML(stage.label)}</option>`).join('');
    $('fPriority').innerHTML = PRIORITIES.map(priority => `<option value="${escapeHTML(priority.id)}">${escapeHTML(priority.label)}</option>`).join('');
    $('fSource').innerHTML = SOURCES.map(source => `<option value="${escapeHTML(source)}">${escapeHTML(source)}</option>`).join('');
    $('pType').innerHTML = PARTNER_TYPES.map(type => `<option value="${escapeHTML(type.id)}">${escapeHTML(type.label)}</option>`).join('');
    fillPartnerSelect();
  }

  function fillPartnerSelect(selectedId = '') {
    const select = $('fPartner');
    if (!select) return;
    const selected = isSafeId(selectedId) ? selectedId : '';
    const options = partners.slice().sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      .map(partner => `<option value="${escapeHTML(partner.id)}">${escapeHTML(partner.name)} · ${escapeHTML(partnerTypeInfo(partner.type).label)}</option>`);
    if (selected && !partners.some(partner => partner.id === selected)) options.push(`<option value="${escapeHTML(selected)}">Parceiro removido</option>`);
    select.innerHTML = `<option value="">Sem parceiro / indicação direta</option>${options.join('')}`;
    select.value = selected;
  }

  function renderClientHistory(client) {
    const history = $('clientHistory');
    if (!client) {
      history.classList.add('hidden');
      history.innerHTML = '';
      return;
    }
    const entries = normalizeHistory(client.history).slice().reverse();
    const partner = partnerById(client.partnerId);
    history.classList.remove('hidden');
    history.innerHTML = `<div class="client-history-heading"><h3 id="clientHistoryTitle">Histórico comercial</h3><span>Última atualização: ${dateTimeBR(client.updatedAt)}</span></div><div class="client-commercial-summary"><span><small>Fechamento</small><strong>${dateBR(client.closedAt)}</strong></span><span><small>Contrato</small><strong>${escapeHTML(client.contractNumber || 'Não informado')}</strong></span><span><small>Indicação</small><strong>${escapeHTML(partner?.name || 'Direta')}</strong></span></div>${entries.length ? `<ol>${entries.map(entry => `<li><span>${escapeHTML(entry.message)}</span><time datetime="${escapeHTML(entry.at)}">${dateTimeBR(entry.at)}</time></li>`).join('')}</ol>` : '<p class="history-empty">Nenhuma mudança de etapa foi registrada ainda.</p>'}`;
  }

  function openClient(id = null) {
    const client = id ? clients.find(item => item.id === id) : null;
    if (id && !client) {
      showToast('Este cliente não foi encontrado. Atualize a tela e tente novamente.', 'error');
      return;
    }
    editingId = client?.id || null;
    lastFocusedElement = document.activeElement;
    $('modalTitle').textContent = client ? 'Editar cliente' : 'Novo cliente';
    $('deleteClientBtn').classList.toggle('hidden', !client);
    $('clientReportBtn').classList.toggle('hidden', !client);
    fillPartnerSelect(client?.partnerId || '');
    const fields = {
      fName: client?.name || '', fPhone: client?.phone || '', fEmail: client?.email || '',
      fStage: client?.stage || DEFAULT_STAGE_ID, fPriority: client?.priority || DEFAULT_PRIORITY_ID,
      fSource: client?.source || DEFAULT_SOURCE, fResponsible: client?.responsible || '',
      fPartner: client?.partnerId || '', fService: client?.service || '', fValue: client?.value ?? '', fContractNumber: client?.contractNumber || '', fFollowUp: client?.followUp || '',
      fMeasurement: client?.measurementDate || '', fInstallation: client?.installationDate || '',
      fClosedAt: client?.closedAt || '', fContractUrl: client?.contractUrl || '',
      fCity: client?.city || '', fNeighborhood: client?.neighborhood || '', fAddress: client?.address || '',
      fNotes: client?.notes || ''
    };
    Object.entries(fields).forEach(([fieldId, value]) => { $(fieldId).value = value; });
    updateClosingDateField({ autoFill: !client });
    renderClientHistory(client);
    updateWhatsappButton();
    updateContractButton();
    $('clientModal').classList.remove('hidden');
    document.body.classList.add('modal-open');
    window.setTimeout(() => $('fName').focus(), 0);
  }

  function refreshModalBodyState() {
    const anyModalOpen = !$('clientModal').classList.contains('hidden') || !$('partnerModal').classList.contains('hidden');
    document.body.classList.toggle('modal-open', anyModalOpen);
  }

  function closeModal() {
    if ($('clientModal').classList.contains('hidden')) return;
    $('clientModal').classList.add('hidden');
    refreshModalBodyState();
    editingId = null;
    renderClientHistory(null);
    if (lastFocusedElement instanceof HTMLElement) lastFocusedElement.focus();
    lastFocusedElement = null;
  }

  function formData() {
    return {
      name: cleanText($('fName').value, 120),
      phone: cleanText($('fPhone').value, 20),
      email: cleanText($('fEmail').value, 160),
      stage: stageById.has($('fStage').value) ? $('fStage').value : DEFAULT_STAGE_ID,
      priority: priorityById.has($('fPriority').value) ? $('fPriority').value : DEFAULT_PRIORITY_ID,
      source: sourceInfo($('fSource').value),
      responsible: cleanText($('fResponsible').value, 80),
      partnerId: isSafeId($('fPartner').value) ? $('fPartner').value : '',
      service: cleanText($('fService').value, 140),
      value: parseMoney($('fValue').value),
      contractNumber: cleanText($('fContractNumber').value, 80),
      followUp: isValidDate($('fFollowUp').value) ? $('fFollowUp').value : '',
      measurementDate: isValidDate($('fMeasurement').value) ? $('fMeasurement').value : '',
      installationDate: isValidDate($('fInstallation').value) ? $('fInstallation').value : '',
      closedAt: isValidDate($('fClosedAt').value) ? $('fClosedAt').value : '',
      contractUrl: cleanUrl($('fContractUrl').value),
      city: cleanText($('fCity').value, 80),
      neighborhood: cleanText($('fNeighborhood').value, 80),
      address: cleanText($('fAddress').value, 180),
      notes: cleanNotes($('fNotes').value, 3000)
    };
  }

  function updateClosingDateField({ autoFill = false } = {}) {
    const field = $('closedAtField');
    const input = $('fClosedAt');
    const wasDisabled = input.disabled;
    const shouldEnable = isClosedStage($('fStage').value);
    input.disabled = !shouldEnable;
    field.classList.toggle('field-disabled', !shouldEnable);
    if (!shouldEnable) input.value = '';
    if (shouldEnable && autoFill && wasDisabled && !input.value) input.value = localDateKey();
  }

  function updateWhatsappButton() {
    const button = $('whatsappBtn');
    const link = whatsappLink(formData());
    button.classList.toggle('hidden', !link);
    if (link) button.href = link;
    else button.removeAttribute('href');
  }

  function updateContractButton() {
    const button = $('contractBtn');
    const link = cleanUrl($('fContractUrl').value);
    button.classList.toggle('hidden', !link);
    if (link) button.href = link;
    else button.removeAttribute('href');
  }

  function validateForm(data) {
    if (!data.name) {
      showToast('Informe o nome do cliente antes de salvar.', 'error');
      $('fName').focus();
      return false;
    }
    const phoneDigits = digits(data.phone);
    if (phoneDigits && phoneDigits.length < 10) {
      showToast('Digite um WhatsApp completo ou deixe o campo em branco.', 'error');
      $('fPhone').focus();
      return false;
    }
    return true;
  }

  function saveClient(event) {
    event.preventDefault();
    const form = $('clientForm');
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    const data = formData();
    if (!validateForm(data)) return;
    const now = new Date().toISOString();

    if (editingId) {
      const current = clients.find(client => client.id === editingId);
      if (!current) {
        showToast('Este cliente não existe mais. Atualize a tela e tente novamente.', 'error');
        closeModal();
        return;
      }
      const stageChanged = current.stage !== data.stage;
      const enteringClosedStage = !isClosedStage(current.stage) && isClosedStage(data.stage);
      const leavingClosedStage = isClosedStage(current.stage) && !isClosedStage(data.stage);
      const closedAt = isClosedStage(data.stage) ? (data.closedAt || current.closedAt || (enteringClosedStage ? localDateKey() : '')) : '';
      const closeDateChanged = current.closedAt !== closedAt;
      let history = stageChanged ? withHistory(current, `Etapa alterada de ${stageInfo(current.stage).label} para ${stageInfo(data.stage).label}.`, 'stage') : current.history;
      if (closeDateChanged && closedAt) history = [...normalizeHistory(history), eventEntry(`Data de fechamento registrada em ${dateBR(closedAt)}.`, 'closed', now)].slice(-MAX_HISTORY_ENTRIES);
      if (closeDateChanged && !closedAt && (leavingClosedStage || current.closedAt)) history = [...normalizeHistory(history), eventEntry('Data de fechamento removida porque a venda voltou para o comercial.', 'reopened', now)].slice(-MAX_HISTORY_ENTRIES);
      const nextClient = {
        ...current,
        ...data,
        closedAt,
        history,
        updatedAt: now
      };
      if (commitClients(clients.map(client => client.id === editingId ? nextClient : client))) {
        closeModal();
        showToast('Cliente atualizado com sucesso.');
      }
      return;
    }

    const closedAt = isClosedStage(data.stage) ? (data.closedAt || localDateKey()) : '';
    const newClient = {
      ...data,
      closedAt,
      id: uid(),
      history: [
        eventEntry(`Cliente cadastrado na etapa ${stageInfo(data.stage).label}.`, 'created', now),
        ...(closedAt ? [eventEntry(`Data de fechamento registrada em ${dateBR(closedAt)}.`, 'closed', now)] : [])
      ],
      createdAt: now,
      updatedAt: now
    };
    if (commitClients([newClient, ...clients])) {
      closeModal();
      showToast('Cliente cadastrado com sucesso.');
    }
  }

  function deleteClient() {
    const client = clients.find(item => item.id === editingId);
    if (!client) return;
    if (!window.confirm(`Excluir ${client.name}? Esta ação não pode ser desfeita, então faça um backup se precisar manter o histórico.`)) return;
    if (commitClients(clients.filter(item => item.id !== client.id))) {
      closeModal();
      showToast('Cliente excluído.');
    }
  }

  function renderPartnerReferrals(partner) {
    const section = $('partnerReferrals');
    if (!partner) {
      section.classList.add('hidden');
      section.innerHTML = '';
      return;
    }
    const stats = partnerStats(partner);
    const referrals = [...stats.referrals].sort((a, b) => {
      const aDate = a.closedAt || timestampDate(a.createdAt);
      const bDate = b.closedAt || timestampDate(b.createdAt);
      return String(bDate).localeCompare(String(aDate));
    });
    section.classList.remove('hidden');
    section.innerHTML = `<div class="partner-referrals-heading"><div><h3 id="partnerReferralsTitle">Indicações e histórico comercial</h3><p>${stats.referrals.length} cliente(s) indicado(s) · ${stats.closed.length} venda(s) · ${money(stats.revenue)} fechado</p></div></div>${referrals.length ? `<div class="table-shell partner-referral-table"><table><thead><tr><th>Cliente</th><th>Etapa</th><th>Contrato</th><th>Fechamento</th><th>Valor</th><th></th></tr></thead><tbody>${referrals.map(client => `<tr><td><strong>${escapeHTML(client.name)}</strong><small>${escapeHTML(client.service || 'Serviço não informado')}</small></td><td><span class="stage-pill">${escapeHTML(stageInfo(client.stage).short || stageInfo(client.stage).label)}</span></td><td>${escapeHTML(client.contractNumber || '—')}</td><td>${dateBR(client.closedAt)}</td><td>${hasValue(client.value) ? money(client.value) : '—'}</td><td><button type="button" class="row-action" data-open-partner-client="${escapeHTML(client.id)}">Abrir</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="history-empty">Nenhum cliente foi vinculado a este parceiro ainda.</p>'}`;
    section.querySelectorAll('[data-open-partner-client]').forEach(button => button.addEventListener('click', () => {
      closePartnerModal();
      openClient(button.dataset.openPartnerClient);
    }));
  }

  function openPartner(id = null) {
    const partner = id ? partners.find(item => item.id === id) : null;
    if (id && !partner) {
      showToast('Este parceiro não foi encontrado. Atualize a tela e tente novamente.', 'error');
      return;
    }
    editingPartnerId = partner?.id || null;
    lastFocusedElement = document.activeElement;
    $('partnerModalTitle').textContent = partner ? 'Editar parceiro' : 'Novo parceiro';
    $('deletePartnerBtn').classList.toggle('hidden', !partner);
    const fields = {
      pName: partner?.name || '', pType: partner?.type || DEFAULT_PARTNER_TYPE_ID,
      pPhone: partner?.phone || '', pEmail: partner?.email || '', pCity: partner?.city || '', pNotes: partner?.notes || ''
    };
    Object.entries(fields).forEach(([fieldId, value]) => { $(fieldId).value = value; });
    renderPartnerReferrals(partner);
    $('partnerModal').classList.remove('hidden');
    document.body.classList.add('modal-open');
    window.setTimeout(() => $('pName').focus(), 0);
  }

  function closePartnerModal() {
    if ($('partnerModal').classList.contains('hidden')) return;
    $('partnerModal').classList.add('hidden');
    editingPartnerId = null;
    renderPartnerReferrals(null);
    refreshModalBodyState();
    if (lastFocusedElement instanceof HTMLElement) lastFocusedElement.focus();
    lastFocusedElement = null;
  }

  function partnerFormData() {
    return {
      name: cleanText($('pName').value, 120),
      type: partnerTypeById.has($('pType').value) ? $('pType').value : DEFAULT_PARTNER_TYPE_ID,
      phone: cleanText($('pPhone').value, 20),
      email: cleanText($('pEmail').value, 160),
      city: cleanText($('pCity').value, 80),
      notes: cleanNotes($('pNotes').value, 2000)
    };
  }

  function savePartner(event) {
    event.preventDefault();
    const form = $('partnerForm');
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    const data = partnerFormData();
    if (!data.name) {
      showToast('Informe o nome do parceiro antes de salvar.', 'error');
      $('pName').focus();
      return;
    }
    const phoneDigits = digits(data.phone);
    if (phoneDigits && phoneDigits.length < 10) {
      showToast('Digite um WhatsApp completo ou deixe o campo em branco.', 'error');
      $('pPhone').focus();
      return;
    }
    const now = new Date().toISOString();
    if (editingPartnerId) {
      const current = partners.find(partner => partner.id === editingPartnerId);
      if (!current) {
        showToast('Este parceiro não existe mais. Atualize a tela e tente novamente.', 'error');
        closePartnerModal();
        return;
      }
      if (commitPartners(partners.map(partner => partner.id === current.id ? { ...current, ...data, updatedAt: now } : partner))) {
        closePartnerModal();
        showToast('Parceiro atualizado com sucesso.');
      }
      return;
    }
    const newPartner = { ...data, id: uid(), createdAt: now, updatedAt: now };
    if (commitPartners([newPartner, ...partners])) {
      closePartnerModal();
      showToast('Parceiro cadastrado com sucesso.');
    }
  }

  function deletePartner() {
    const partner = partners.find(item => item.id === editingPartnerId);
    if (!partner) return;
    const referrals = clients.filter(client => client.partnerId === partner.id);
    const warning = referrals.length ? `\n\n${referrals.length} cliente(s) indicado(s) ficarão sem parceiro vinculado.` : '';
    if (!window.confirm(`Excluir ${partner.name}?${warning}\n\nEssa ação não pode ser desfeita.`)) return;
    const nextClients = clients.map(client => client.partnerId === partner.id ? { ...client, partnerId: '', updatedAt: new Date().toISOString() } : client);
    if (commitCollections(nextClients, partners.filter(item => item.id !== partner.id))) {
      closePartnerModal();
      showToast('Parceiro excluído e indicações desvinculadas.');
    }
  }

  function exportBackup() {
    const backup = {
      app: 'tony-crm',
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      clients,
      partners
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const prefix = cleanText(CONFIG.backupFilePrefix || 'tony-crm-backup', 50).replace(/[^a-z0-9_-]/gi, '-') || 'tony-crm-backup';
    link.href = url;
    link.download = `${prefix}-${localDateKey()}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 500);
    showToast('Backup exportado. Guarde o arquivo em um local seguro.');
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
      reader.onload = () => resolve(String(reader.result || ''));
      reader.readAsText(file, 'utf-8');
    });
  }

  async function importBackup(event) {
    const input = event.target;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      showToast('O backup é grande demais. Use um arquivo de até 5 MB.', 'error');
      return;
    }
    try {
      const text = await readFileAsText(file);
      const parsed = JSON.parse(text);
      const rawClients = Array.isArray(parsed) ? parsed : parsed?.clients;
      if (!Array.isArray(rawClients)) throw new Error('Formato sem lista de clientes.');
      const rawPartners = Array.isArray(parsed?.partners) ? parsed.partners : [];
      const importedClients = normalizeClients(rawClients);
      const importedPartners = normalizePartners(rawPartners);
      const ignoredClients = rawClients.length - importedClients.length;
      const ignoredPartners = rawPartners.length - importedPartners.length;
      if (!importedClients.length && rawClients.length) throw new Error('Nenhum cliente válido foi encontrado.');
      const details = `${importedClients.length} cliente(s) e ${importedPartners.length} parceiro(s) serão importados${ignoredClients || ignoredPartners ? `; ${ignoredClients + ignoredPartners} registro(s) inválido(s) serão ignorados` : ''}.`;
      if (!window.confirm(`${details}\n\nIsso substituirá os ${clients.length} cliente(s) e ${partners.length} parceiro(s) atuais neste navegador. Deseja continuar?`)) return;
      if (commitCollections(importedClients, importedPartners)) showToast('Backup importado com sucesso.');
    } catch (error) {
      console.warn('Falha ao importar backup.', error);
      showToast('Arquivo de backup inválido ou corrompido.', 'error');
    }
  }

  function updateSidebarState() {
    const collapsed = $('sidebar').classList.contains('collapsed');
    $('collapseBtn').setAttribute('aria-label', collapsed ? 'Expandir menu' : 'Recolher menu');
    $('collapseBtn').querySelector('span:last-child').textContent = collapsed ? 'Expandir' : 'Recolher';
    try {
      window.localStorage.setItem(UI_STORAGE_KEY, JSON.stringify({ sidebarCollapsed: collapsed }));
    } catch (error) {
      console.warn('Não foi possível salvar a preferência do menu.', error);
    }
  }

  function loadSidebarState() {
    const stored = readStorage(UI_STORAGE_KEY);
    if (!stored.ok || !stored.value) return;
    try {
      const state = JSON.parse(stored.value);
      if (state?.sidebarCollapsed) $('sidebar').classList.add('collapsed');
    } catch (error) {
      console.warn('Não foi possível carregar a preferência do menu.', error);
    }
  }

  function trapFocus(event) {
    if (event.key !== 'Tab') return;
    const modal = !$('clientModal').classList.contains('hidden') ? $('clientModal') : (!$('partnerModal').classList.contains('hidden') ? $('partnerModal') : null);
    if (!modal) return;
    const focusable = [...modal.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])')]
      .filter(element => !element.closest('.hidden'));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function bindEvents() {
    $('clientForm').addEventListener('submit', saveClient);
    $('deleteClientBtn').addEventListener('click', deleteClient);
    $('closeModalBtn').addEventListener('click', closeModal);
    $('cancelModalBtn').addEventListener('click', closeModal);
    $('clientReportBtn').addEventListener('click', () => downloadClientReport());
    $('clientModal').addEventListener('mousedown', event => {
      if (event.target === $('clientModal')) closeModal();
    });
    $('partnerForm').addEventListener('submit', savePartner);
    $('deletePartnerBtn').addEventListener('click', deletePartner);
    $('closePartnerModalBtn').addEventListener('click', closePartnerModal);
    $('cancelPartnerModalBtn').addEventListener('click', closePartnerModal);
    $('partnerModal').addEventListener('mousedown', event => {
      if (event.target === $('partnerModal')) closePartnerModal();
    });
    $('newClientBtn').addEventListener('click', () => openClient());
    $('searchInput').addEventListener('input', event => {
      searchTerm = event.target.value;
      render();
    });
    $('fPhone').addEventListener('input', updateWhatsappButton);
    $('fName').addEventListener('input', updateWhatsappButton);
    $('fContractUrl').addEventListener('input', updateContractButton);
    $('fStage').addEventListener('change', () => updateClosingDateField({ autoFill: true }));
    document.querySelectorAll('.nav-btn').forEach(button => button.addEventListener('click', () => {
      currentView = button.dataset.view;
      render();
    }));
    $('collapseBtn').addEventListener('click', () => {
      $('sidebar').classList.toggle('collapsed');
      updateSidebarState();
    });
    $('exportBtn').addEventListener('click', exportBackup);
    $('importInput').addEventListener('change', importBackup);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !$('partnerModal').classList.contains('hidden')) closePartnerModal();
      else if (event.key === 'Escape' && !$('clientModal').classList.contains('hidden')) closeModal();
      trapFocus(event);
    });
    window.addEventListener('storage', event => {
      if (event.key === STORAGE_KEY) {
        const incoming = event.newValue === null ? [] : parseStoredClients(event.newValue);
        if (!incoming) return;
        clients = incoming;
        render();
        showToast('Os clientes foram atualizados em outra aba.', 'success');
      }
      if (event.key === PARTNER_STORAGE_KEY) {
        const incoming = event.newValue === null ? [] : parseStoredPartners(event.newValue);
        if (!incoming) return;
        partners = incoming;
        render();
        showToast('Os parceiros foram atualizados em outra aba.', 'success');
      }
    });
  }

  function init() {
    document.title = `${CONFIG.productName || 'CRM'} | ${CONFIG.companyName || 'Tony Acabamentos'}`;
    document.querySelector('.brand-copy strong').textContent = CONFIG.shortName || 'TONY';
    document.querySelector('.brand-copy span').textContent = CONFIG.productName || 'CRM';
    fillSelects();
    loadSidebarState();
    updateSidebarState();
    bindEvents();
    render();
  }

  init();
})();
