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
  const STAGES = Array.isArray(CONFIG.stages) ? CONFIG.stages.filter(stage => stage && stage.id && stage.label) : [];
  const PRIORITIES = Array.isArray(CONFIG.priorities) && CONFIG.priorities.length ? CONFIG.priorities : DEFAULT_PRIORITIES;
  const SOURCES = Array.from(new Set((Array.isArray(CONFIG.sources) ? CONFIG.sources : ['Outro'])
    .map(source => String(source || '').trim()).filter(Boolean)));
  const STORAGE_KEY = CONFIG.storageKey || 'tony_crm_clients_v2';
  const LEGACY_STORAGE_KEY = 'tony_crm_clients_v1';
  const UI_STORAGE_KEY = 'tony_crm_ui_v1';
  const BACKUP_VERSION = 2;
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
  const stageGroups = Array.from(new Set(STAGES.map(stage => stage.group || 'Fluxo')));
  const DEFAULT_STAGE_ID = STAGES[0].id;
  const DEFAULT_PRIORITY_ID = priorityById.has('medium') ? 'medium' : PRIORITIES[0].id;
  const DEFAULT_SOURCE = SOURCES[0] || 'Outro';

  let clients = loadInitialClients();
  let currentView = 'dashboard';
  let pipelineGroup = stageGroups.includes('Comercial') ? 'Comercial' : stageGroups[0];
  let editingId = null;
  let searchTerm = '';
  let lastFocusedElement = null;
  let draggedClientId = null;
  let storageWarningShown = false;

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

  function sourceInfo(source) {
    return SOURCES.includes(source) ? source : (SOURCES.includes('Outro') ? 'Outro' : DEFAULT_SOURCE);
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
      service: cleanText(raw.service, 140),
      value,
      followUp: isValidDate(raw.followUp) ? raw.followUp : '',
      measurementDate: isValidDate(raw.measurementDate) ? raw.measurementDate : '',
      installationDate: isValidDate(raw.installationDate) ? raw.installationDate : '',
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
      return [
        client.name, client.phone, client.email, client.city, client.neighborhood, client.address,
        client.service, client.responsible, client.source, client.notes, stage.label, stage.short,
        priority.label, client.followUp, client.measurementDate, client.installationDate
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
    if (!['dashboard', 'pipeline', 'clients'].includes(currentView)) currentView = 'dashboard';
    document.querySelectorAll('.view').forEach(view => view.classList.add('hidden'));
    $(`${currentView}View`).classList.remove('hidden');
    document.querySelectorAll('.nav-btn').forEach(button => button.classList.toggle('active', button.dataset.view === currentView));

    const titles = {
      dashboard: ['Visão geral', 'Acompanhe o comercial e a operação em um só lugar.'],
      pipeline: ['Funil de clientes', 'Arraste os cartões para atualizar a etapa do cliente.'],
      clients: ['Clientes', 'Lista completa com busca e acompanhamento.']
    };
    $('pageTitle').textContent = titles[currentView][0];
    $('pageSubtitle').textContent = titles[currentView][1];
    $('searchInput').value = searchTerm;

    if (currentView === 'dashboard') renderDashboard();
    if (currentView === 'pipeline') renderPipeline();
    if (currentView === 'clients') renderClients();
  }

  function renderDashboard() {
    const data = filteredClients();
    const active = data.filter(client => client.stage !== 'post_sale').length;
    const closedIndex = STAGES.findIndex(stage => stage.id === 'closed');
    const closedStageIds = closedIndex >= 0 ? STAGES.slice(closedIndex).map(stage => stage.id) : [];
    const potentialStageIds = STAGES.filter(stage => stage.group === 'Comercial' && !['whatsapp', 'closed'].includes(stage.id)).map(stage => stage.id);
    const potential = data.filter(client => potentialStageIds.includes(client.stage)).reduce((sum, client) => sum + Number(client.value || 0), 0);
    const closed = data.filter(client => closedStageIds.includes(client.stage)).reduce((sum, client) => sum + Number(client.value || 0), 0);
    const attention = data.filter(client => ['overdue', 'today'].includes(reminderState(client)) && client.stage !== 'post_sale');
    const nextFollowUps = [...attention].sort((a, b) => a.followUp.localeCompare(b.followUp)).slice(0, 6);

    $('dashboardView').innerHTML = `
      <div class="summary-grid">
        <div class="summary-card"><span>Clientes ativos</span><strong>${active}</strong><small>${data.length} no total</small></div>
        <div class="summary-card"><span>Potencial em aberto</span><strong>${money(potential)}</strong><small>Quentes e orçamentos</small></div>
        <div class="summary-card"><span>Valor fechado</span><strong>${money(closed)}</strong><small>Negócios ganhos</small></div>
        <div class="summary-card ${attention.length ? 'summary-attention' : ''}"><span>Retornos pendentes</span><strong>${attention.length}</strong><small>${attention.length ? 'Vencidos ou para hoje' : 'Nenhum retorno para hoje'}</small></div>
      </div>
      <div class="stage-grid">${STAGES.map(stage => {
        const list = data.filter(client => client.stage === stage.id);
        return `<button type="button" class="stage-stat" data-go-stage="${escapeHTML(stage.id)}"><div class="stage-icon" aria-hidden="true">${stageIcon(stage.id)}</div><div><span>${escapeHTML(stage.short || stage.label)}</span><strong>${list.length}</strong><small>${money(list.reduce((sum, client) => sum + Number(client.value || 0), 0))}</small></div></button>`;
      }).join('')}</div>
      <section class="dashboard-panel" aria-labelledby="followUpTitle">
        <div class="dashboard-panel-heading"><div><h2 id="followUpTitle">Retornos que pedem atenção</h2><p>Vencidos e programados para hoje.</p></div><button type="button" class="text-btn" data-view-link="clients">Ver todos os clientes</button></div>
        ${nextFollowUps.length ? `<div class="follow-up-list">${nextFollowUps.map(client => followUpRow(client)).join('')}</div>` : `<div class="empty-state compact"><strong>${data.length ? 'Tudo em dia por enquanto.' : 'Comece adicionando o primeiro cliente.'}</strong><span>${data.length ? 'Nenhum retorno vencido ou marcado para hoje.' : 'O CRM vai organizar o atendimento, produção e instalação.'}</span>${data.length ? '' : '<button type="button" class="primary-btn" data-new-client>＋ Cadastrar cliente</button>'}</div>`}
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

  function bindDashboardActions() {
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
    return `<article class="client-card priority-${escapeHTML(client.priority)}" draggable="true" data-id="${escapeHTML(client.id)}" tabindex="0" aria-label="Abrir cliente ${escapeHTML(client.name)}"><div class="card-top"><div><strong>${escapeHTML(client.name)}</strong><span>${escapeHTML(client.service || 'Sem serviço informado')}</span></div><span class="priority-dot ${escapeHTML(client.priority)}" title="Prioridade ${escapeHTML(priority.label)}">${priorityMark(client.priority)}</span></div>${client.phone ? `<div class="card-line">☎ ${escapeHTML(client.phone)}</div>` : ''}${location ? `<div class="card-line">⌖ ${escapeHTML(location)}</div>` : ''}${client.followUp ? `<div class="card-line reminder-${reminder}">◷ ${reminder === 'overdue' ? 'Retorno vencido: ' : reminder === 'today' ? 'Retorno hoje: ' : 'Retorno: '}${dateBR(client.followUp)}</div>` : ''}<div class="card-footer"><span class="value">${hasValue(client.value) ? money(client.value) : 'Sem valor'}</span>${whatsapp ? `<a class="wa-link" href="${escapeHTML(whatsapp)}" target="_blank" rel="noreferrer" aria-label="Abrir WhatsApp de ${escapeHTML(client.name)}">W</a>` : ''}</div></article>`;
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
    const nextClients = clients.map(item => item.id !== id ? item : {
      ...item,
      stage: stageId,
      history: withHistory(item, `Etapa alterada de ${previousStage.label} para ${nextStage.label}.`, 'stage'),
      updatedAt: new Date().toISOString()
    });
    if (commitClients(nextClients, { rerender: false })) {
      renderPipeline();
      showToast(`${client.name} movido para ${nextStage.short || nextStage.label}.`);
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
    $('clientsView').innerHTML = data.length ? `<div class="table-shell"><table><thead><tr><th>Cliente</th><th>Contato</th><th>Etapa</th><th>Serviço</th><th>Valor</th><th>Próximo retorno</th><th><span class="sr-only">Ação</span></th></tr></thead><tbody>${data.map(clientRow).join('')}</tbody></table></div>` : `<div class="empty-state"><strong>${clients.length ? 'Nenhum cliente encontrado.' : 'Ainda não há clientes no CRM.'}</strong><span>${clients.length ? 'Tente outro termo de busca.' : 'Cadastre o primeiro atendimento para começar o acompanhamento.'}</span>${clients.length ? '<button type="button" class="secondary-btn" data-clear-search>Limpar busca</button>' : '<button type="button" class="primary-btn" data-new-client>＋ Cadastrar cliente</button>'}</div>`;
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
    const whatsapp = whatsappLink(client);
    const reminder = reminderState(client);
    return `<tr data-open-client="${escapeHTML(client.id)}" tabindex="0"><td><strong>${escapeHTML(client.name)}</strong><small>${escapeHTML(client.city || 'Cidade não informada')}</small></td><td>${whatsapp ? `<a href="${escapeHTML(whatsapp)}" target="_blank" rel="noreferrer" aria-label="Abrir WhatsApp de ${escapeHTML(client.name)}">W ${escapeHTML(client.phone)}</a>` : '—'}</td><td><span class="stage-pill">${escapeHTML(stageInfo(client.stage).short || stageInfo(client.stage).label)}</span></td><td>${escapeHTML(client.service || '—')}</td><td>${hasValue(client.value) ? money(client.value) : '—'}</td><td><span class="table-reminder ${reminder}">${dateBR(client.followUp)}</span></td><td><button type="button" class="row-action" data-open-client="${escapeHTML(client.id)}" aria-label="Abrir ${escapeHTML(client.name)}">Abrir</button></td></tr>`;
  }

  function fillSelects() {
    $('fStage').innerHTML = STAGES.map(stage => `<option value="${escapeHTML(stage.id)}">${escapeHTML(stage.label)}</option>`).join('');
    $('fPriority').innerHTML = PRIORITIES.map(priority => `<option value="${escapeHTML(priority.id)}">${escapeHTML(priority.label)}</option>`).join('');
    $('fSource').innerHTML = SOURCES.map(source => `<option value="${escapeHTML(source)}">${escapeHTML(source)}</option>`).join('');
  }

  function renderClientHistory(client) {
    const history = $('clientHistory');
    if (!client) {
      history.classList.add('hidden');
      history.innerHTML = '';
      return;
    }
    const entries = normalizeHistory(client.history).slice().reverse();
    history.classList.remove('hidden');
    history.innerHTML = `<div class="client-history-heading"><h3 id="clientHistoryTitle">Histórico</h3><span>Última atualização: ${dateTimeBR(client.updatedAt)}</span></div>${entries.length ? `<ol>${entries.map(entry => `<li><span>${escapeHTML(entry.message)}</span><time datetime="${escapeHTML(entry.at)}">${dateTimeBR(entry.at)}</time></li>`).join('')}</ol>` : '<p class="history-empty">Nenhuma mudança de etapa foi registrada ainda.</p>'}`;
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
    const fields = {
      fName: client?.name || '', fPhone: client?.phone || '', fEmail: client?.email || '',
      fStage: client?.stage || DEFAULT_STAGE_ID, fPriority: client?.priority || DEFAULT_PRIORITY_ID,
      fSource: client?.source || DEFAULT_SOURCE, fResponsible: client?.responsible || '',
      fService: client?.service || '', fValue: client?.value ?? '', fFollowUp: client?.followUp || '',
      fMeasurement: client?.measurementDate || '', fInstallation: client?.installationDate || '',
      fCity: client?.city || '', fNeighborhood: client?.neighborhood || '', fAddress: client?.address || '',
      fNotes: client?.notes || ''
    };
    Object.entries(fields).forEach(([fieldId, value]) => { $(fieldId).value = value; });
    renderClientHistory(client);
    updateWhatsappButton();
    $('clientModal').classList.remove('hidden');
    document.body.classList.add('modal-open');
    window.setTimeout(() => $('fName').focus(), 0);
  }

  function closeModal() {
    if ($('clientModal').classList.contains('hidden')) return;
    $('clientModal').classList.add('hidden');
    document.body.classList.remove('modal-open');
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
      service: cleanText($('fService').value, 140),
      value: parseMoney($('fValue').value),
      followUp: isValidDate($('fFollowUp').value) ? $('fFollowUp').value : '',
      measurementDate: isValidDate($('fMeasurement').value) ? $('fMeasurement').value : '',
      installationDate: isValidDate($('fInstallation').value) ? $('fInstallation').value : '',
      city: cleanText($('fCity').value, 80),
      neighborhood: cleanText($('fNeighborhood').value, 80),
      address: cleanText($('fAddress').value, 180),
      notes: cleanNotes($('fNotes').value, 3000)
    };
  }

  function updateWhatsappButton() {
    const button = $('whatsappBtn');
    const link = whatsappLink(formData());
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
      const nextClient = {
        ...current,
        ...data,
        history: stageChanged ? withHistory(current, `Etapa alterada de ${stageInfo(current.stage).label} para ${stageInfo(data.stage).label}.`, 'stage') : current.history,
        updatedAt: now
      };
      if (commitClients(clients.map(client => client.id === editingId ? nextClient : client))) {
        closeModal();
        showToast('Cliente atualizado com sucesso.');
      }
      return;
    }

    const newClient = {
      ...data,
      id: uid(),
      history: [eventEntry(`Cliente cadastrado na etapa ${stageInfo(data.stage).label}.`, 'created', now)],
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

  function exportBackup() {
    const backup = {
      app: 'tony-crm',
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      clients
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
      const imported = normalizeClients(rawClients);
      const ignored = rawClients.length - imported.length;
      if (!imported.length && rawClients.length) throw new Error('Nenhum cliente válido foi encontrado.');
      const details = `${imported.length} cliente(s) válido(s) serão importados${ignored ? `; ${ignored} registro(s) inválido(s) serão ignorados` : ''}.`;
      if (!window.confirm(`${details}\n\nIsso substituirá os ${clients.length} cliente(s) atuais neste navegador. Deseja continuar?`)) return;
      if (commitClients(imported)) showToast('Backup importado com sucesso.');
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
    if (event.key !== 'Tab' || $('clientModal').classList.contains('hidden')) return;
    const focusable = [...$('clientModal').querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])')]
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
    $('clientModal').addEventListener('mousedown', event => {
      if (event.target === $('clientModal')) closeModal();
    });
    $('newClientBtn').addEventListener('click', () => openClient());
    $('searchInput').addEventListener('input', event => {
      searchTerm = event.target.value;
      render();
    });
    $('fPhone').addEventListener('input', updateWhatsappButton);
    $('fName').addEventListener('input', updateWhatsappButton);
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
      if (event.key === 'Escape' && !$('clientModal').classList.contains('hidden')) closeModal();
      trapFocus(event);
    });
    window.addEventListener('storage', event => {
      if (event.key !== STORAGE_KEY || event.newValue === null) return;
      const incoming = parseStoredClients(event.newValue);
      if (!incoming) return;
      clients = incoming;
      render();
      showToast('Os dados foram atualizados em outra aba.', 'success');
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
