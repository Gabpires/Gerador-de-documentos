(() => {
  'use strict';

  const KEY = 'paraibaImoveisRecibosV3';
  const STATUS = {
    draft: 'Rascunho', review: 'Em revisão', issued: 'Emitido', sent: 'Enviado',
    awaiting_signature: 'Aguardando assinatura', signed: 'Assinado', rejected: 'Recusado',
    canceled: 'Cancelado', archived: 'Arquivado'
  };
  const STATUS_KEYS = Object.keys(STATUS);
  const ATTACHMENT_DB = 'paraibaImoveisDocumentos';
  const ATTACHMENT_STORE = 'attachments';
  const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
  const $ = id => document.getElementById(id);
  let selectedDossierId = '';
  let batchRows = [];
  let statusTarget = null;
  let lockTimer = null;
  let locked = false;
  let pendingReceiptDossier = '';
  let pendingGenericDossier = '';

  function text(value) { return String(value ?? ''); }
  function clean(value) { return text(value).trim(); }
  function normal(value) { return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' '); }
  function escape(value) { return text(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
  function now() { return new Date().toISOString(); }
  function today() { return new Date().toISOString().slice(0, 10); }
  function month() { return today().slice(0, 7); }
  function money(value) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0); }
  function date(value) { return value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(`${value}T12:00:00`)) : '—'; }
  function dateTime(value) { return value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—'; }
  function id(prefix = 'mg') { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
  function hash(value) { let number = 2166136261; for (const char of text(value)) { number ^= char.charCodeAt(0); number = Math.imul(number, 16777619); } return (number >>> 0).toString(36); }
  function dossierId(property, contractCode = '') { return `dos-${hash(`${normal(property)}|${normal(contractCode)}`)}`; }

  function initialManagement() {
    return { version: 1, dossiers: [], recordMeta: {}, savedViews: [], audit: [], modelGovernance: {}, attachments: [], settings: {} };
  }
  function managementOf(state) {
    const source = state && state.management && typeof state.management === 'object' ? state.management : {};
    return {
      ...initialManagement(), ...source,
      dossiers: Array.isArray(source.dossiers) ? source.dossiers.filter(item => item && typeof item === 'object').slice(0, 2000) : [],
      savedViews: Array.isArray(source.savedViews) ? source.savedViews.filter(item => item && item.name).slice(0, 50) : [],
      audit: Array.isArray(source.audit) ? source.audit.filter(item => item && item.action).slice(-3000) : [],
      attachments: Array.isArray(source.attachments) ? source.attachments.filter(item => item && item.id && item.dossierId).slice(0, 2000) : [],
      recordMeta: source.recordMeta && typeof source.recordMeta === 'object' ? source.recordMeta : {},
      modelGovernance: source.modelGovernance && typeof source.modelGovernance === 'object' ? source.modelGovernance : {},
      settings: source.settings && typeof source.settings === 'object' ? source.settings : {}
    };
  }
  function emptyState() {
    return { counters: {}, documentCounters: {}, history: [], documents: [], draftDocuments: [], templates: [], contacts: [], clients: [], draft: null, management: {}, meta: { schemaVersion: 10, lastBackupAt: '', installationId: id('installation'), defaultOperator: 'Sandra Marcondes da Silva Alves' } };
  }
  function read() {
    try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : emptyState(); } catch { return null; }
  }
  function write(state, management) {
    if (!state) return false;
    state.management = managementOf({ management });
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: JSON.stringify(state), storageArea: localStorage }));
      return true;
    } catch {
      alert('Não foi possível salvar as informações de gestão neste navegador.');
      return false;
    }
  }
  function update(mutator) {
    const state = read();
    if (!state) { alert('Abra ou registre um documento antes de iniciar a gestão.'); return null; }
    const management = managementOf(state);
    mutator(state, management);
    return write(state, management) ? { state, management } : null;
  }
  function audit(management, payload) {
    management.audit.push({ id: id('evt'), at: now(), ...payload });
    management.audit = management.audit.slice(-3000);
  }

  function allDocuments(state) {
    const receipt = (state.history || []).map(record => ({ ...record, type: 'receipt', recordId: `receipt:${record.number}`, kind: 'receipt' }));
    const documents = (state.documents || []).map(record => ({ ...record, recordId: `document:${record.id}`, kind: 'document' }));
    const drafts = (state.draftDocuments || []).map(record => ({ ...record, status: 'draft', recordId: `draft:${record.id}`, kind: 'draft' }));
    if (state.draft) drafts.push({ ...state.draft, type: 'receipt', status: 'draft', number: '', recordId: 'receipt-draft', kind: 'draft' });
    return [...receipt, ...documents, ...drafts];
  }
  function documentProperty(record) {
    const fields = record.fields || {};
    if (record.type === 'receipt') return clean(record.property);
    if (record.type === 'term') return clean(fields.docProperty);
    if (record.type === 'contract') return clean(fields.docContractProperty);
    return '';
  }
  function documentContract(record) {
    const fields = record.fields || {};
    if (record.type === 'receipt') return clean(record.contractCode);
    if (record.type === 'term') return clean(fields.docRelatedContract);
    return '';
  }
  function documentTenant(record) {
    const fields = record.fields || {};
    if (record.type === 'receipt') return clean(record.tenant);
    if (record.type === 'declaration') return clean(fields.docDeclarant);
    if (record.type === 'term') return clean(fields.docPartyOne);
    if (record.type === 'contract') return clean(fields.docTenantParty || fields.docBuyer || fields.docLandlord);
    return '';
  }
  function documentIdNumber(record) {
    const fields = record.fields || {};
    if (record.type === 'receipt') return clean(record.cpf);
    if (record.type === 'declaration') return clean(fields.docDeclarantDocument);
    if (record.type === 'term') return clean(fields.docPartyOneDocument);
    if (record.type === 'contract') return clean(fields.docTenantPartyDocument || fields.docBuyerDocument || fields.docLandlordDocument);
    return '';
  }
  function documentOwner(record) {
    const fields = record.fields || {};
    return record.type === 'contract' ? clean(fields.docLandlord || fields.docSeller) : '';
  }
  function documentDueDay(record) {
    const fields = record.fields || {};
    return Number(record.type === 'receipt' ? record.dueDay : fields.docContractDueDay) || 0;
  }
  function documentEndDate(record) { return record.type === 'contract' ? clean((record.fields || {}).docEndDate) : ''; }
  function documentDate(record) { return record.type === 'receipt' ? clean(record.receiptDate) : clean((record.fields || {}).docDate); }
  function documentStatus(record) { return STATUS_KEYS.includes(record.status) ? record.status : 'issued'; }
  function documentTitle(record) {
    if (record.type === 'receipt') return `Recibo ${record.number || 'em rascunho'}`;
    return clean((record.fields || {}).docTitle) || `${({ declaration: 'Declaração', term: 'Termo', contract: 'Contrato' })[record.type] || 'Documento'} ${record.number || 'em rascunho'}`;
  }
  function documentDossierId(record, management) {
    const explicit = management.recordMeta[record.recordId] && management.recordMeta[record.recordId].dossierId;
    return explicit || (documentProperty(record) ? dossierId(documentProperty(record), documentContract(record)) : '');
  }
  function documentTags(record, management) { return (management.recordMeta[record.recordId] && management.recordMeta[record.recordId].tags) || []; }

  function dossiers(state, management) {
    const map = new Map();
    management.dossiers.forEach(item => map.set(item.id, { status: 'active', tags: [], checklist: {}, ...item }));
    allDocuments(state).forEach(record => {
      const property = documentProperty(record);
      if (!property) return;
      const recordDossierId = documentDossierId(record, management);
      const current = map.get(recordDossierId) || { id: recordDossierId, property, contractCode: documentContract(record), status: 'active', tags: [], checklist: {}, createdAt: record.createdAt || now() };
      map.set(recordDossierId, {
        ...current,
        property: current.property || property,
        contractCode: current.contractCode || documentContract(record),
        tenant: current.tenant || documentTenant(record),
        tenantDocument: current.tenantDocument || documentIdNumber(record),
        owner: current.owner || documentOwner(record),
        dueDay: Number(current.dueDay) || documentDueDay(record),
        endDate: current.endDate || documentEndDate(record),
        updatedAt: current.updatedAt || record.updatedAt || record.createdAt || now()
      });
    });
    return [...map.values()].sort((a, b) => text(a.property).localeCompare(text(b.property), 'pt-BR'));
  }
  function findDossier(state, management, targetId) { return dossiers(state, management).find(item => item.id === targetId); }
  function docsForDossier(state, management, targetId) { return allDocuments(state).filter(record => documentDossierId(record, management) === targetId); }

  function addTab(id, label, beforeId) {
    const tab = document.createElement('button');
    tab.type = 'button'; tab.role = 'tab'; tab.id = `tab-${id}`; tab.dataset.view = id;
    tab.setAttribute('aria-controls', `view-${id}`); tab.setAttribute('aria-selected', 'false'); tab.textContent = label;
    const nav = document.querySelector('.app-tabs');
    const before = beforeId && $(beforeId);
    nav.insertBefore(tab, before || null);
  }
  function createViews() {
    addTab('management', '◈ Gestão', 'tab-new');
    addTab('dossiers', '▣ Dossiês', 'tab-history');
    const root = $('mainContent');
    const management = document.createElement('section');
    management.className = 'view-panel'; management.id = 'view-management'; management.dataset.panel = 'management'; management.hidden = true;
    management.setAttribute('role', 'tabpanel'); management.setAttribute('aria-labelledby', 'tab-management');
    management.innerHTML = `
      <div class="management-layout">
        <div class="content-card management-hero"><div><span class="eyebrow">Central de operação</span><h2>Gestão documental</h2><p>Priorize pendências, acompanhe contratos e trabalhe a partir dos dossiês.</p></div><div class="header-actions"><button class="btn btn-primary" type="button" id="openDossiersBtn">Abrir dossiês</button><button class="btn btn-secondary" type="button" id="openBatchBtn">Emissão em lote</button></div></div>
        <div class="management-kpis" id="managementKpis" aria-live="polite"></div>
        <div class="management-grid"><section class="content-card"><div class="section-heading"><div><span class="eyebrow">Agenda</span><h3>Contratos e pendências</h3></div></div><div id="managementAgenda" class="management-list"></div></section><section class="content-card"><div class="section-heading"><div><span class="eyebrow">Relatório</span><h3>Recebimentos por imóvel</h3></div></div><div id="managementReport" class="management-list"></div></section></div>
        <section class="content-card" id="batchCard"><div class="section-heading"><div><span class="eyebrow">Competência</span><h3>Emissão mensal em lote</h3><p>Somente documentos válidos recebem número ao confirmar o lote.</p></div></div><div class="batch-controls"><label class="filter-field"><span>Mês de referência</span><input id="batchReference" type="month" /></label><label class="filter-field"><span>Responsável</span><select id="batchOperator"><option value="Sandra Marcondes da Silva Alves">Sandra Marcondes da Silva Alves</option><option value="Ruziel Aparecido Alves Guilherme">Ruziel Aparecido Alves Guilherme</option></select></label><button class="btn btn-secondary" type="button" id="buildBatchBtn">Validar lote</button></div><div id="batchDossierList" class="batch-dossiers"></div><div id="batchPreview" class="management-list" aria-live="polite"></div><button class="btn btn-primary" type="button" id="issueBatchBtn" disabled>Confirmar emissão do lote</button></section>
        <section class="content-card"><div class="section-heading"><div><span class="eyebrow">Consulta</span><h3>Pesquisa avançada e visões salvas</h3></div></div><div class="advanced-search"><label class="filter-field filter-search"><span>Palavra-chave</span><input id="advancedSearch" type="search" placeholder="Documento, pessoa, imóvel ou contrato" /></label><label class="filter-field"><span>Imóvel/contrato</span><input id="advancedProperty" placeholder="Local ou código" /></label><label class="filter-field"><span>De</span><input id="advancedFrom" type="date" /></label><label class="filter-field"><span>Até</span><input id="advancedTo" type="date" /></label><label class="filter-field"><span>Situação</span><select id="advancedStatus"><option value="">Todas</option></select></label><label class="filter-field"><span>Assinatura</span><select id="advancedSignature"><option value="">Todas</option><option value="pending">Pendente</option><option value="signed">Assinado</option></select></label><label class="filter-field"><span>Responsável</span><select id="advancedOperator"><option value="">Todos</option><option>Sandra Marcondes da Silva Alves</option><option>Ruziel Aparecido Alves Guilherme</option></select></label><label class="filter-field"><span>Etiqueta</span><input id="advancedTag" placeholder="Ex.: renovação" /></label><button class="btn btn-secondary" type="button" id="saveViewBtn">Salvar visão</button></div><div class="saved-view-row"><select id="savedViewSelect" aria-label="Visões salvas"><option value="">Visões salvas</option></select><button class="btn btn-quiet" type="button" id="deleteViewBtn">Excluir visão</button></div><div id="advancedResults" class="management-list"></div></section>
        <section class="content-card"><div class="section-heading"><div><span class="eyebrow">Governança</span><h3>Modelos, qualidade e privacidade</h3></div></div><div id="managementGovernance" class="management-list"></div></section>
      </div>`;
    const dossier = document.createElement('section');
    dossier.className = 'view-panel'; dossier.id = 'view-dossiers'; dossier.dataset.panel = 'dossiers'; dossier.hidden = true;
    dossier.setAttribute('role', 'tabpanel'); dossier.setAttribute('aria-labelledby', 'tab-dossiers');
    dossier.innerHTML = `
      <div class="content-card wide-card"><div class="content-header"><div><span class="eyebrow">Centro da navegação</span><h2>Dossiês por imóvel e contrato</h2><p>Contratos, partes, recibos, anexos e eventos organizados no mesmo lugar.</p></div><button class="btn btn-primary" id="toggleDossierForm" type="button" aria-expanded="false" aria-controls="dossierForm">Novo dossiê</button></div>
      <form id="dossierForm" class="dossier-form" hidden><div class="grid2"><label class="field">Imóvel <input id="dossierProperty" required maxlength="1500" /></label><label class="field">Código do contrato <input id="dossierContractCode" maxlength="80" /></label></div><div class="grid2"><label class="field">Locatário / parte principal <input id="dossierTenant" maxlength="200" /></label><label class="field">CPF/CNPJ <input id="dossierTenantDocument" inputmode="numeric" maxlength="18" /></label></div><div class="grid2"><label class="field">Proprietário <input id="dossierOwner" maxlength="200" /></label><label class="field">Término do contrato <input id="dossierEndDate" type="date" /></label></div><div class="grid2"><label class="field">Valor mensal <input id="dossierAmount" inputmode="decimal" placeholder="Ex.: 950,00" /></label><label class="field">Pagamento <select id="dossierPayment"><option>Dinheiro</option><option>Pix</option><option>Dinheiro/PIX</option><option>Transferência bancária</option><option>Boleto</option></select></label></div><div class="grid2"><label class="field">Vencimento mensal <input id="dossierDueDay" type="number" min="1" max="31" /></label><label class="field">Etiquetas <input id="dossierTags" placeholder="Separe por vírgula" /></label></div><label class="field">Observações <textarea id="dossierNotes" rows="3"></textarea></label><div class="modal-actions"><button class="btn btn-secondary" type="button" id="cancelDossierBtn">Cancelar</button><button class="btn btn-primary" type="submit">Salvar dossiê</button></div></form>
      <div class="dossier-tools"><label class="filter-field filter-search"><span>Pesquisar</span><input id="dossierSearch" type="search" placeholder="Imóvel, contrato, parte ou etiqueta" /></label><label class="filter-field"><span>Situação</span><select id="dossierStatusFilter"><option value="">Todas</option><option value="active">Ativos</option><option value="inactive">Inativos</option></select></label></div><div class="dossier-layout"><div id="dossierList" class="dossier-list"></div><article id="dossierDetail" class="dossier-detail" aria-live="polite"></article></div>
      </div>`;
    root.prepend(dossier); root.prepend(management);
  }

  function statusOptions(select) { STATUS_KEYS.forEach(key => { const option = document.createElement('option'); option.value = key; option.textContent = STATUS[key]; select.appendChild(option); }); }
  function createModals() {
    const status = document.createElement('div');
    status.id = 'managementStatusModal'; status.className = 'modal-backdrop'; status.hidden = true;
    status.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="managementStatusTitle"><h2 id="managementStatusTitle">Atualizar situação</h2><p id="managementStatusDescription">O evento será registrado na linha do tempo do dossiê.</p><div class="field"><label for="managementStatusSelect">Nova situação</label><select id="managementStatusSelect"></select></div><div class="field"><label for="managementStatusReason">Motivo / observação</label><textarea id="managementStatusReason" maxlength="500"></textarea></div><div class="modal-actions"><button class="btn btn-secondary" type="button" id="closeManagementStatusBtn">Voltar</button><button class="btn btn-primary" type="button" id="confirmManagementStatusBtn">Registrar alteração</button></div></div>`;
    document.body.appendChild(status); statusOptions($('managementStatusSelect'));
    const lock = document.createElement('div');
    lock.id = 'managementLockModal'; lock.className = 'modal-backdrop'; lock.hidden = true;
    lock.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="managementLockTitle"><h2 id="managementLockTitle">Área local bloqueada</h2><p>Digite a senha configurada para continuar. O bloqueio protege a interface deste navegador; mantenha também backups protegidos por senha.</p><div class="field"><label for="managementUnlockPassword">Senha</label><input id="managementUnlockPassword" type="password" autocomplete="current-password" /></div><div class="field-error" id="managementUnlockError" role="alert"></div><div class="modal-actions"><button class="btn btn-primary" type="button" id="unlockManagementBtn">Desbloquear</button></div></div>`;
    document.body.appendChild(lock);
  }

  function renderDashboard() {
    const state = read(); if (!state) return;
    const management = managementOf(state), records = allDocuments(state), items = dossiers(state, management);
    const currentMonth = month();
    const receipts = records.filter(record => record.type === 'receipt' && documentStatus(record) === 'issued');
    const thisMonth = receipts.filter(record => clean(record.reference) === currentMonth);
    const pending = records.filter(record => ['draft', 'review', 'awaiting_signature'].includes(documentStatus(record))).length;
    const expiring = items.filter(item => item.endDate && daysUntil(item.endDate) >= 0 && daysUntil(item.endDate) <= 60);
    const unsigned = records.filter(record => ['sent', 'awaiting_signature'].includes(documentStatus(record))).length;
    const backupOld = !state.meta || !state.meta.lastBackupAt || (Date.now() - new Date(state.meta.lastBackupAt).getTime()) > 7 * 86400000;
    $('managementKpis').innerHTML = card('Rascunhos e revisão', pending, 'Documentos que exigem ação') + card('Contratos a vencer', expiring.length, 'Nos próximos 60 dias') + card('Recebido no mês', money(thisMonth.reduce((sum, record) => sum + (Number(record.amount) || 0), 0)), `${thisMonth.length} recibo(s) emitido(s)`) + card('Assinaturas pendentes', unsigned, 'Enviados ou aguardando assinatura') + card('Backup', backupOld ? 'Atenção' : 'Em dia', backupOld ? 'Exporte uma nova cópia' : 'Cópia recente registrada');
    const agenda = [...expiring.map(item => ({ kind: 'contract', item })), ...records.filter(record => ['draft', 'review', 'awaiting_signature'].includes(documentStatus(record))).slice(0, 8).map(record => ({ kind: 'document', record }))];
    $('managementAgenda').replaceChildren(...(agenda.length ? agenda.map(agendaRow) : [empty('Nenhuma pendência operacional no momento.')]));
    const byDossier = new Map();
    receipts.filter(record => clean(record.reference) === currentMonth).forEach(record => { const key = documentDossierId(record, management) || 'sem-dossie'; byDossier.set(key, (byDossier.get(key) || 0) + (Number(record.amount) || 0)); });
    const report = [...byDossier.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([key, value]) => { const item = findDossier(state, management, key); return row(item ? item.property : 'Sem dossiê vinculado', money(value)); });
    $('managementReport').replaceChildren(...(report.length ? report : [empty('Ainda não há recebimentos emitidos nesta competência.')]));
    renderBatch(items); renderAdvanced(); renderSavedViews(management); renderGovernance(state, management);
  }
  function card(title, value, description) { return `<article class="management-kpi"><span>${escape(title)}</span><strong>${escape(value)}</strong><small>${escape(description)}</small></article>`; }
  function empty(message) { const item = document.createElement('p'); item.className = 'management-empty'; item.textContent = message; return item; }
  function row(label, value) { const item = document.createElement('div'); item.className = 'management-row'; const strong = document.createElement('strong'); strong.textContent = label; const span = document.createElement('span'); span.textContent = value; item.append(strong, span); return item; }
  function agendaRow(entry) { if (entry.kind === 'contract') { const item = row(entry.item.property, `Término em ${date(entry.item.endDate)}`); item.classList.add('warning-row'); item.addEventListener('click', () => selectDossier(entry.item.id)); return item; } const item = row(documentTitle(entry.record), STATUS[documentStatus(entry.record)]); item.addEventListener('click', () => openStatus(entry.record.recordId)); return item; }
  function daysUntil(value) { return Math.ceil((new Date(`${value}T12:00:00`).getTime() - new Date(`${today()}T12:00:00`).getTime()) / 86400000); }

  function renderBatch(items) {
    const list = $('batchDossierList'); if (!list) return;
    const checked = new Set([...list.querySelectorAll('input:checked')].map(input => input.value));
    list.replaceChildren();
    const active = items.filter(item => item.status !== 'inactive');
    if (!active.length) { list.appendChild(empty('Crie ou emita um documento com imóvel para incluir dossiês no lote.')); return; }
    active.forEach(item => {
      const label = document.createElement('label'); label.className = 'check-row';
      const input = document.createElement('input'); input.type = 'checkbox'; input.value = item.id; input.checked = checked.has(item.id);
      const span = document.createElement('span'); span.textContent = `${item.property} — ${item.tenant || 'parte não informada'}${item.contractCode ? ` · ${item.contractCode}` : ''}`;
      label.append(input, span); list.appendChild(label);
    });
    if (!$('batchReference').value) $('batchReference').value = month();
  }
  function validateBatch() {
    const state = read(); if (!state) return;
    const management = managementOf(state), reference = $('batchReference').value, operator = $('batchOperator').value;
    const chosen = [...document.querySelectorAll('#batchDossierList input:checked')].map(input => input.value);
    batchRows = chosen.map(targetId => {
      const item = findDossier(state, management, targetId); const latest = docsForDossier(state, management, targetId).filter(record => record.type === 'receipt').sort((a, b) => text(b.reference).localeCompare(text(a.reference)))[0];
      const amount = Number(item.amount || (latest && latest.amount) || 0);
      const record = { dossierId: targetId, tenant: item.tenant, cpf: item.tenantDocument, property: item.property, contractCode: item.contractCode || '', dueDay: Number(item.dueDay) || 0, amount, reference, payment: item.payment || (latest && latest.payment) || 'Dinheiro', receiptDate: today(), operator };
      record.error = !reference ? 'Informe a competência.' : !record.tenant || !record.cpf || !record.property || amount <= 0 ? 'Complete nome, documento, imóvel e valor no dossiê.' : '';
      return record;
    });
    const box = $('batchPreview'); box.replaceChildren();
    if (!batchRows.length) box.appendChild(empty('Selecione pelo menos um dossiê para validar.'));
    batchRows.forEach(item => { const line = row(item.property, item.error ? `Exceção: ${item.error}` : `${item.tenant} · ${money(item.amount)}`); line.classList.toggle('error-row', Boolean(item.error)); box.appendChild(line); });
    $('issueBatchBtn').disabled = !batchRows.length || batchRows.some(item => item.error);
  }
  function issueBatch() {
    if (!batchRows.length || batchRows.some(item => item.error)) return;
    if (!confirm(`Emitir ${batchRows.length} recibo(s)? A numeração será reservada somente agora.`)) return;
    const state = read(); if (!state) return; const management = managementOf(state);
    const year = Number(batchRows[0].receiptDate.slice(0, 4));
    const used = (state.history || []).filter(record => text(record.number).endsWith(`/${year}`)).map(record => Number(text(record.number).split('/')[0])).filter(Number.isFinite);
    let sequence = Math.max(Number((state.counters || {})[year]) || 1, ...used.map(number => number + 1), 1);
    const created = batchRows.map(item => {
      const number = `${String(sequence++).padStart(2, '0')}/${year}`;
      const record = { ...item, number, year, type: 'receipt', templateVersion: 1, letterhead: 'institutional', fields: { ...item, number, year }, status: 'issued', createdAt: now(), issuedOn: state.meta && state.meta.installationId || '', printCount: 0, lastPrintedAt: '' };
      const recordId = `receipt:${number}`;
      management.recordMeta[recordId] = { ...(management.recordMeta[recordId] || {}), dossierId: item.dossierId, tags: [] };
      audit(management, { action: 'emitido em lote', recordId, dossierId: item.dossierId, number, actor: item.operator, detail: `Competência ${item.reference}` });
      return record;
    });
    state.history = [...(state.history || []), ...created]; state.counters = { ...(state.counters || {}), [year]: sequence }; state.meta = { ...(state.meta || {}), defaultOperator: batchRows[0].operator };
    if (write(state, management)) { batchRows = []; $('batchPreview').replaceChildren(); $('issueBatchBtn').disabled = true; renderDashboard(); alert(`${created.length} recibo(s) emitido(s) e registrados.`); }
  }

  function readAdvanced() { return { query: clean($('advancedSearch').value), property: clean($('advancedProperty').value), from: $('advancedFrom').value, to: $('advancedTo').value, status: $('advancedStatus').value, signature: $('advancedSignature').value, operator: $('advancedOperator').value, tag: normal($('advancedTag').value) }; }
  function renderAdvanced() {
    const state = read(); if (!state) return; const management = managementOf(state); const criteria = readAdvanced();
    const records = allDocuments(state).filter(record => {
      const dossier = findDossier(state, management, documentDossierId(record, management)); const tags = [...documentTags(record, management), ...((dossier && dossier.tags) || [])]; const blob = normal([documentTitle(record), documentProperty(record), documentContract(record), documentTenant(record), record.number, tags.join(' ')].join(' ')); const recordDate = documentDate(record); const recordStatus = documentStatus(record);
      return (!criteria.query || blob.includes(normal(criteria.query))) && (!criteria.property || normal([documentProperty(record), documentContract(record)].join(' ')).includes(normal(criteria.property))) && (!criteria.from || recordDate >= criteria.from) && (!criteria.to || recordDate <= criteria.to) && (!criteria.status || recordStatus === criteria.status) && (!criteria.signature || (criteria.signature === 'signed' ? recordStatus === 'signed' : ['sent', 'awaiting_signature'].includes(recordStatus))) && (!criteria.operator || clean(record.operator || (record.fields || {}).docOperator) === criteria.operator) && (!criteria.tag || tags.some(tag => normal(tag).includes(criteria.tag)));
    }).slice(0, 100);
    const box = $('advancedResults'); box.replaceChildren(...(records.length ? records.map(record => { const line = row(documentTitle(record), `${STATUS[documentStatus(record)]} · ${documentProperty(record) || 'sem imóvel'}`); line.addEventListener('click', () => openStatus(record.recordId)); return line; }) : [empty('Nenhum documento corresponde aos critérios.')]));
  }
  function renderSavedViews(management) { const select = $('savedViewSelect'); if (!select) return; const selected = select.value; select.replaceChildren(new Option('Visões salvas', '')); management.savedViews.forEach(view => select.add(new Option(view.name, view.id))); select.value = management.savedViews.some(view => view.id === selected) ? selected : ''; }
  function saveView() { const criteria = readAdvanced(); if (!Object.values(criteria).some(Boolean)) { alert('Defina pelo menos um filtro antes de salvar uma visão.'); return; } const name = prompt('Nome desta visão:'); if (!clean(name)) return; update((state, management) => { management.savedViews.push({ id: id('view'), name: clean(name).slice(0, 80), criteria, createdAt: now() }); audit(management, { action: 'visão salva', actor: state.meta && state.meta.defaultOperator || '', detail: clean(name) }); }); renderDashboard(); }
  function applyView() { const state = read(); if (!state) return; const management = managementOf(state); const view = management.savedViews.find(item => item.id === $('savedViewSelect').value); if (!view) return; const criteria = view.criteria || {}; $('advancedSearch').value = criteria.query || ''; $('advancedProperty').value = criteria.property || ''; $('advancedFrom').value = criteria.from || ''; $('advancedTo').value = criteria.to || ''; $('advancedStatus').value = criteria.status || ''; $('advancedSignature').value = criteria.signature || ''; $('advancedOperator').value = criteria.operator || ''; $('advancedTag').value = criteria.tag || ''; renderAdvanced(); }

  function renderGovernance(state, management) {
    const box = $('managementGovernance'); if (!box) return; box.replaceChildren();
    const sameDocument = new Map(); (state.contacts || []).forEach(contact => { const key = text(contact.cpf).replace(/\D/g, ''); if (key) sameDocument.set(key, (sameDocument.get(key) || 0) + 1); });
    const duplicates = [...sameDocument.values()].filter(count => count > 1).length;
    box.append(row('Cadastros com documento em mais de um imóvel', `${duplicates} grupo(s) para revisar`));
    box.append(row('Anexos locais', `${management.attachments.length} arquivo(s) indexado(s) no navegador`));
    box.append(row('Auditoria', `${management.audit.length} evento(s) preservado(s)`));
    const templates = state.templates || []; box.append(row('Modelos versionados', `${templates.length} modelo(s) · ${templates.reduce((sum, template) => sum + ((management.modelGovernance[template.id] || {}).version || 1), 0)} revisão(ões)`));
    const actions = document.createElement('div'); actions.className = 'governance-actions';
    const openTemplates = button('Governar modelos', () => $('tab-templates').click(), 'btn btn-secondary');
    const exportAttachments = button('Backup com anexos', exportAttachmentsPackage, 'btn btn-secondary');
    const configureLock = button('Configurar bloqueio local', configureLocalLock, 'btn btn-secondary');
    actions.append(openTemplates, exportAttachments, configureLock); box.append(actions);
  }
  function button(label, action, classes = '') { const item = document.createElement('button'); item.type = 'button'; item.className = classes; item.textContent = label; item.addEventListener('click', action); return item; }

  function renderDossiers() {
    const state = read(); if (!state) return; const management = managementOf(state); const query = normal($('dossierSearch').value), status = $('dossierStatusFilter').value;
    const list = dossiers(state, management).filter(item => (!status || item.status === status) && (!query || normal([item.property, item.contractCode, item.tenant, item.owner, (item.tags || []).join(' ')].join(' ')).includes(query)));
    const box = $('dossierList'); box.replaceChildren();
    if (!list.length) box.appendChild(empty('Nenhum dossiê corresponde aos filtros.'));
    list.forEach(item => { const card = document.createElement('button'); card.type = 'button'; card.className = `dossier-card${item.id === selectedDossierId ? ' is-selected' : ''}`; card.innerHTML = `<strong>${escape(item.property)}</strong><span>${escape(item.contractCode || 'Sem código de contrato')}</span><small>${escape(item.tenant || 'Parte principal não informada')} · ${item.endDate ? `término ${escape(date(item.endDate))}` : 'sem término informado'}</small>`; card.addEventListener('click', () => selectDossier(item.id)); box.append(card); });
    if (!selectedDossierId && list[0]) selectedDossierId = list[0].id; renderDossierDetail();
  }
  function selectDossier(targetId) { selectedDossierId = targetId; renderDossiers(); }
  function renderDossierDetail() {
    const state = read(); const detail = $('dossierDetail'); if (!state || !detail) return; const management = managementOf(state), item = findDossier(state, management, selectedDossierId);
    detail.replaceChildren(); if (!item) { detail.appendChild(empty('Selecione um dossiê para consultar os documentos relacionados.')); return; }
    const heading = document.createElement('div'); heading.className = 'dossier-detail-head'; const title = document.createElement('div'); title.innerHTML = `<span class="eyebrow">Dossiê</span><h3>${escape(item.property)}</h3><p>${escape(item.contractCode || 'Sem código de contrato')}</p>`; const edit = button('Editar', () => editDossier(item), 'btn btn-secondary'); heading.append(title, edit); detail.append(heading);
    const meta = document.createElement('dl'); meta.className = 'dossier-meta';[['Parte principal', item.tenant || 'Não informada'], ['Proprietário', item.owner || 'Não informado'], ['Término', item.endDate ? date(item.endDate) : 'Não informado'], ['Vencimento', item.dueDay ? `Dia ${item.dueDay}` : 'Não informado'], ['Etiquetas', (item.tags || []).join(', ') || 'Nenhuma']].forEach(([key, value]) => { const dt = document.createElement('dt'); dt.textContent = key; const dd = document.createElement('dd'); dd.textContent = value; meta.append(dt, dd); }); detail.append(meta);
    detail.append(sectionTitle('Checklist documental')); const checklist = document.createElement('div'); checklist.className = 'dossier-checklist';[['inspection', 'Vistoria'], ['identity', 'Documentos de identificação'], ['proof', 'Comprovantes'], ['keys', 'Entrega de chaves'], ['proxy', 'Procuração, se aplicável']].forEach(([key, label]) => { const check = document.createElement('label'); check.className = 'inline-check'; const input = document.createElement('input'); input.type = 'checkbox'; input.checked = Boolean((item.checklist || {})[key]); input.addEventListener('change', () => updateDossierChecklist(item.id, key, input.checked)); check.append(input, document.createTextNode(label)); checklist.append(check); }); detail.append(checklist);
    detail.append(sectionTitle('Documentos relacionados')); const documents = docsForDossier(state, management, item.id).sort((a, b) => text(b.createdAt || b.updatedAt).localeCompare(text(a.createdAt || a.updatedAt))); const documentBox = document.createElement('div'); documentBox.className = 'management-list'; documentBox.append(...(documents.length ? documents.map(record => { const line = row(documentTitle(record), `${STATUS[documentStatus(record)]} · ${date(documentDate(record))}`); line.addEventListener('click', () => openStatus(record.recordId)); return line; }) : [empty('Ainda não há documentos vinculados a este dossiê.')])); detail.append(documentBox);
    detail.append(sectionTitle('Anexos')); const attachmentTools = document.createElement('div'); attachmentTools.className = 'attachment-tools'; const file = document.createElement('input'); file.type = 'file'; file.multiple = true; file.id = 'dossierAttachmentInput'; file.setAttribute('aria-label', 'Adicionar anexos ao dossiê'); file.addEventListener('change', () => addAttachments(item.id, file.files)); attachmentTools.append(file); detail.append(attachmentTools); const attachmentBox = document.createElement('div'); attachmentBox.className = 'management-list'; const attachments = management.attachments.filter(attachment => attachment.dossierId === item.id); attachmentBox.append(...(attachments.length ? attachments.map(attachmentRow) : [empty('Nenhum anexo armazenado localmente.')])); detail.append(attachmentBox);
    detail.append(sectionTitle('Linha do tempo')); const events = management.audit.filter(event => event.dossierId === item.id).slice().reverse(); const timeline = document.createElement('div'); timeline.className = 'timeline'; timeline.append(...(events.length ? events.map(event => { const line = document.createElement('div'); line.className = 'timeline-item'; line.innerHTML = `<strong>${escape(event.action)}</strong><span>${escape(event.detail || event.number || '')}</span><small>${escape(dateTime(event.at))}${event.actor ? ` · ${escape(event.actor)}` : ''}</small>`; return line; }) : [empty('Os próximos eventos deste dossiê serão registrados aqui.')])); detail.append(timeline);
  }
  function sectionTitle(value) { const title = document.createElement('h4'); title.className = 'dossier-section-title'; title.textContent = value; return title; }
  function editDossier(item) { $('dossierProperty').value = item.property || ''; $('dossierContractCode').value = item.contractCode || ''; $('dossierTenant').value = item.tenant || ''; $('dossierTenantDocument').value = item.tenantDocument || ''; $('dossierOwner').value = item.owner || ''; $('dossierEndDate').value = item.endDate || ''; $('dossierAmount').value = item.amount || ''; $('dossierPayment').value = item.payment || 'Dinheiro'; $('dossierDueDay').value = item.dueDay || ''; $('dossierTags').value = (item.tags || []).join(', '); $('dossierNotes').value = item.notes || ''; $('dossierForm').dataset.editing = item.id; $('dossierForm').hidden = false; $('toggleDossierForm').setAttribute('aria-expanded', 'true'); $('dossierProperty').focus(); }
  function saveDossier(event) {
    event.preventDefault(); const property = clean($('dossierProperty').value); if (!property) return; const code = clean($('dossierContractCode').value); const originalId = $('dossierForm').dataset.editing || ''; const targetId = originalId || dossierId(property, code); const amount = Number(clean($('dossierAmount').value).replace('.', '').replace(',', '.')) || 0; const payload = { id: targetId, property, contractCode: code, tenant: clean($('dossierTenant').value), tenantDocument: clean($('dossierTenantDocument').value), owner: clean($('dossierOwner').value), endDate: $('dossierEndDate').value, amount, payment: $('dossierPayment').value, dueDay: Number($('dossierDueDay').value) || 0, tags: clean($('dossierTags').value).split(',').map(clean).filter(Boolean).slice(0, 20), notes: clean($('dossierNotes').value).slice(0, 2000), status: 'active', updatedAt: now() };
    update((state, management) => { const index = management.dossiers.findIndex(item => item.id === targetId); const previous = index >= 0 ? management.dossiers[index] : {}; const next = { ...previous, ...payload, createdAt: previous.createdAt || now() }; if (index >= 0) management.dossiers[index] = next; else management.dossiers.push(next); audit(management, { action: index >= 0 ? 'dossiê atualizado' : 'dossiê criado', dossierId: targetId, actor: state.meta && state.meta.defaultOperator || '', detail: property }); }); selectedDossierId = targetId; closeDossierForm(); renderDossiers(); renderDashboard();
  }
  function closeDossierForm() { $('dossierForm').reset(); delete $('dossierForm').dataset.editing; $('dossierForm').hidden = true; $('toggleDossierForm').setAttribute('aria-expanded', 'false'); }
  function updateDossierChecklist(targetId, key, value) { update((state, management) => { const entry = management.dossiers.find(item => item.id === targetId); if (!entry) return; entry.checklist = { ...(entry.checklist || {}), [key]: value }; entry.updatedAt = now(); audit(management, { action: 'checklist atualizado', dossierId: targetId, actor: state.meta && state.meta.defaultOperator || '', detail: key }); }); renderDossierDetail(); }

  function recordById(state, recordId) { if (recordId.startsWith('receipt:')) return (state.history || []).find(record => `receipt:${record.number}` === recordId); if (recordId.startsWith('document:')) return (state.documents || []).find(record => `document:${record.id}` === recordId); return null; }
  function openStatus(recordId) { const state = read(); if (!state) return; const record = recordById(state, recordId); if (!record) return; statusTarget = recordId; $('managementStatusSelect').value = documentStatus(record); $('managementStatusReason').value = ''; $('managementStatusDescription').textContent = `${documentTitle(record)}. Cancelamentos, recusas e arquivamentos exigem uma justificativa.`; $('managementStatusModal').hidden = false; $('managementStatusSelect').focus(); }
  function closeStatus() { statusTarget = null; $('managementStatusModal').hidden = true; }
  function confirmStatus() {
    if (!statusTarget) return; const nextStatus = $('managementStatusSelect').value, reason = clean($('managementStatusReason').value); if (['canceled', 'rejected', 'archived'].includes(nextStatus) && reason.length < 3) { alert('Informe uma justificativa com pelo menos 3 caracteres.'); return; }
    update((state, management) => { const record = recordById(state, statusTarget); if (!record) return; const previous = documentStatus(record); record.status = nextStatus; record.updatedAt = now(); if (nextStatus === 'canceled') { record.canceledAt = now(); record.canceledBy = state.meta && state.meta.defaultOperator || ''; record.cancelReason = reason; } if (nextStatus === 'archived') record.archivedAt = now(); const dossier = documentDossierId({ ...record, recordId: statusTarget }, management); const meta = management.recordMeta[statusTarget] || {}; management.recordMeta[statusTarget] = { ...meta, version: Number(meta.version || 1) + 1 }; audit(management, { action: 'situação alterada', recordId: statusTarget, dossierId: dossier, number: record.number || '', actor: state.meta && state.meta.defaultOperator || '', detail: `${STATUS[previous]} → ${STATUS[nextStatus]}${reason ? ` · ${reason}` : ''}` }); }); closeStatus(); renderDashboard(); renderDossiers();
  }

  function openAttachmentDB() { return new Promise((resolve, reject) => { const request = indexedDB.open(ATTACHMENT_DB, 1); request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(ATTACHMENT_STORE)) request.result.createObjectStore(ATTACHMENT_STORE); }; request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
  async function putAttachment(attachment, blob) { const db = await openAttachmentDB(); return new Promise((resolve, reject) => { const tx = db.transaction(ATTACHMENT_STORE, 'readwrite'); tx.objectStore(ATTACHMENT_STORE).put(blob, attachment.id); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); }
  async function getAttachment(attachmentId) { const db = await openAttachmentDB(); return new Promise((resolve, reject) => { const tx = db.transaction(ATTACHMENT_STORE, 'readonly'); const request = tx.objectStore(ATTACHMENT_STORE).get(attachmentId); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
  async function deleteAttachment(attachmentId) { const db = await openAttachmentDB(); return new Promise((resolve, reject) => { const tx = db.transaction(ATTACHMENT_STORE, 'readwrite'); tx.objectStore(ATTACHMENT_STORE).delete(attachmentId); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); }
  async function addAttachments(targetId, files) {
    if (!files || !files.length) return; const selected = [...files]; if (selected.some(file => file.size > MAX_ATTACHMENT_BYTES)) { alert('Cada anexo deve ter no máximo 5 MB para manter o backup local utilizável.'); return; }
    const state = read(); if (!state) return; const management = managementOf(state);
    try { for (const file of selected) { const attachment = { id: id('att'), dossierId: targetId, name: file.name.slice(0, 180), type: file.type || 'application/octet-stream', size: file.size, createdAt: now() }; await putAttachment(attachment, file); management.attachments.push(attachment); audit(management, { action: 'anexo adicionado', dossierId: targetId, actor: state.meta && state.meta.defaultOperator || '', detail: attachment.name }); } write(state, management); renderDossierDetail(); renderDashboard(); } catch { alert('Não foi possível armazenar o anexo neste navegador.'); }
  }
  function attachmentRow(attachment) { const line = row(attachment.name, `${Math.ceil(attachment.size / 1024)} KB`); const actions = document.createElement('span'); const download = button('Baixar', async event => { event.stopPropagation(); const blob = await getAttachment(attachment.id); if (!blob) { alert('O arquivo não está mais disponível neste navegador.'); return; } const url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = attachment.name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }); const remove = button('Excluir', async event => { event.stopPropagation(); if (!confirm(`Excluir o anexo “${attachment.name}” deste navegador?`)) return; await deleteAttachment(attachment.id); update((state, management) => { management.attachments = management.attachments.filter(item => item.id !== attachment.id); audit(management, { action: 'anexo excluído', dossierId: attachment.dossierId, actor: state.meta && state.meta.defaultOperator || '', detail: attachment.name }); }); renderDossierDetail(); renderDashboard(); }); actions.append(download, remove); line.append(actions); return line; }

  async function blobToBase64(blob) { const buffer = await blob.arrayBuffer(); let binary = ''; const bytes = new Uint8Array(buffer); for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(binary); }
  async function exportAttachmentsPackage() { const state = read(); if (!state) return; const management = managementOf(state); const attachmentData = []; let bytes = 0; try { for (const attachment of management.attachments) { const blob = await getAttachment(attachment.id); if (!blob) continue; bytes += blob.size; if (bytes > 12 * 1024 * 1024) { alert('Os anexos ultrapassam 12 MB. Baixe-os pelo dossiê ou gere backups por partes.'); return; } attachmentData.push({ ...attachment, data: await blobToBase64(blob) }); } const payload = { app: 'Gerador de Documentos - Paraíba Imóveis', managementPackage: true, exportedAt: now(), state, attachmentData }; const url = URL.createObjectURL(new Blob([JSON.stringify(payload)], { type: 'application/json' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `backup-documentos-anexos-${today()}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); } catch { alert('Não foi possível montar o backup com anexos.'); } }

  async function deriveLock(password, salt) { const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']); const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 180000, hash: 'SHA-256' }, material, 256); return btoa(String.fromCharCode(...new Uint8Array(bits))); }
  async function configureLocalLock() { if (!crypto.subtle) { alert('Este navegador não oferece os recursos de criptografia necessários para o bloqueio local.'); return; } const password = prompt('Crie uma senha local de pelo menos 8 caracteres:'); if (password === null) return; if (password.length < 8) { alert('Use ao menos 8 caracteres.'); return; } const confirmation = prompt('Repita a senha local:'); if (confirmation !== password) { alert('As senhas não coincidem.'); return; } const minutes = Number(prompt('Bloquear após quantos minutos sem atividade? (1 a 120)', '15')); if (!Number.isInteger(minutes) || minutes < 1 || minutes > 120) { alert('Informe um período entre 1 e 120 minutos.'); return; } const salt = crypto.getRandomValues(new Uint8Array(16)); const verifier = await deriveLock(password, salt); update((state, management) => { management.settings.localLock = { enabled: true, timeoutMinutes: minutes, salt: btoa(String.fromCharCode(...salt)), verifier }; audit(management, { action: 'bloqueio local configurado', actor: state.meta && state.meta.defaultOperator || '', detail: `${minutes} minuto(s)` }); }); armLock(); renderDashboard(); alert('Bloqueio local configurado. Ele protege a interface deste navegador, não substitui o backup protegido por senha.'); }
  async function unlock() { const state = read(); if (!state) return; const config = managementOf(state).settings.localLock; const password = $('managementUnlockPassword').value; try { const actual = await deriveLock(password, Uint8Array.from(atob(config.salt), char => char.charCodeAt(0))); if (actual !== config.verifier) { $('managementUnlockError').textContent = 'Senha incorreta.'; return; } locked = false; $('managementLockModal').hidden = true; $('managementUnlockPassword').value = ''; $('managementUnlockError').textContent = ''; armLock(); } catch { $('managementUnlockError').textContent = 'Não foi possível verificar a senha.'; } }
  function armLock() { clearTimeout(lockTimer); const state = read(); if (!state || locked) return; const config = managementOf(state).settings.localLock; if (!config || !config.enabled) return; lockTimer = setTimeout(() => { locked = true; $('managementLockModal').hidden = false; $('managementUnlockPassword').focus(); }, Number(config.timeoutMinutes) * 60 * 1000); }

  function addDossierLinks() {
    const receiptBody = $('receiptEditor') && $('receiptEditor').querySelector('.form-section-body'); const genericBody = $('genericEditor') && $('genericEditor').querySelector('.form-section-body');
    if (receiptBody && !$('receiptDossierLink')) receiptBody.insertAdjacentHTML('afterbegin', '<div class="field management-link-field"><label for="receiptDossierLink">Vincular ao dossiê</label><select id="receiptDossierLink"><option value="">Definir pelo imóvel e contrato</option></select></div>');
    if (genericBody && !$('genericDossierLink')) genericBody.insertAdjacentHTML('beforeend', '<div class="field management-link-field"><label for="genericDossierLink">Vincular ao dossiê</label><select id="genericDossierLink"><option value="">Definir pelo imóvel e contrato</option></select></div>');
    refreshDossierLinks();
  }
  function refreshDossierLinks() { const state = read(); if (!state) return; const management = managementOf(state), items = dossiers(state, management);['receiptDossierLink', 'genericDossierLink'].forEach(target => { const select = $(target); if (!select) return; const selected = select.value; select.replaceChildren(new Option('Definir pelo imóvel e contrato', '')); items.forEach(item => select.add(new Option(`${item.property}${item.contractCode ? ` — ${item.contractCode}` : ''}`, item.id))); select.value = items.some(item => item.id === selected) ? selected : ''; }); }
  function captureNew(before, selectedDossier) { setTimeout(() => { const state = read(); if (!state) return; const management = managementOf(state); const created = allDocuments(state).filter(record => !before.has(record.recordId) && record.kind !== 'draft'); if (!created.length) return; created.forEach(record => { const targetId = selectedDossier || documentDossierId(record, management); const governance = management.modelGovernance[record.templateId] || {}; management.recordMeta[record.recordId] = { ...(management.recordMeta[record.recordId] || {}), dossierId: targetId, tags: (management.recordMeta[record.recordId] || {}).tags || [], version: 1, modelVersion: governance.version || 1 }; audit(management, { action: 'documento emitido', recordId: record.recordId, dossierId: targetId, number: record.number || '', actor: record.operator || (record.fields || {}).docOperator || '', detail: documentTitle(record) }); }); write(state, management); renderDashboard(); refreshDossierLinks(); }, 0); }
  function interceptIssues() {
    $('issueBtn').addEventListener('click', () => { pendingReceiptDossier = $('receiptDossierLink') && $('receiptDossierLink').value || ''; });
    $('confirmIssueBtn').addEventListener('click', () => { const state = read(); if (!state) return; captureNew(new Set(allDocuments(state).map(record => record.recordId)), pendingReceiptDossier); pendingReceiptDossier = ''; });
    $('genericIssueBtn').addEventListener('click', event => { const state = read(); if (!state) return; const management = managementOf(state), templateId = $('docTemplate').value; const rules = management.modelGovernance[templateId] || {}; const missing = (rules.requiredClauses || []).filter(key => !document.querySelector(`[data-clause="${key}"]`).checked); if (missing.length) { event.stopImmediatePropagation(); alert('Este modelo exige as cláusulas: ' + missing.join(', ') + '.'); return; } pendingGenericDossier = $('genericDossierLink') && $('genericDossierLink').value || ''; const before = new Set(allDocuments(state).map(record => record.recordId)); captureNew(before, pendingGenericDossier); }, true);
    $('genericSaveTemplateBtn').addEventListener('click', () => { const state = read(); if (!state) return; const before = new Set((state.templates || []).map(template => template.id)); const parentId = $('docTemplate').value; setTimeout(() => { const updated = read(); if (!updated) return; const created = (updated.templates || []).find(template => !before.has(template.id)); if (!created) return; const management = managementOf(updated); const parent = management.modelGovernance[parentId] || { version: 0, requiredClauses: [] }; management.modelGovernance[created.id] = { version: Number(parent.version || 0) + 1 || 1, supersedes: parentId || '', requiredClauses: [...(parent.requiredClauses || [])], createdAt: now() }; audit(management, { action: parentId ? 'revisão de modelo criada' : 'modelo versionado', actor: updated.meta && updated.meta.defaultOperator || '', detail: created.name }); write(updated, management); refreshTemplateGovernance(); renderDashboard(); }, 0); }, true);
    const capturePrint = () => { const state = read(); if (!state) return; const before = new Map(allDocuments(state).map(record => [record.recordId, Number(record.printCount) || 0])); window.addEventListener('afterprint', () => setTimeout(() => { const updated = read(); if (!updated) return; const management = managementOf(updated); let changed = false; allDocuments(updated).forEach(record => { if ((Number(record.printCount) || 0) <= (before.get(record.recordId) || 0)) return; audit(management, { action: 'documento impresso', recordId: record.recordId, dossierId: documentDossierId(record, management), number: record.number || '', actor: record.operator || (record.fields || {}).docOperator || '', detail: documentTitle(record) }); changed = true; }); if (changed) write(updated, management); }, 0), { once: true }); };
    $('printBtn').addEventListener('click', capturePrint); $('genericPrintBtn').addEventListener('click', capturePrint);
  }
  function addTemplateGovernance() {
    const host = $('view-templates') && $('view-templates').querySelector('.content-card'); if (!host || $('templateGovernance')) return;
    const card = document.createElement('section'); card.id = 'templateGovernance'; card.className = 'model-governance'; card.innerHTML = `<h3>Governança de modelos</h3><p>Defina cláusulas obrigatórias para contratos. A regra é aplicada antes da emissão.</p><label class="field">Modelo <select id="governanceTemplateSelect"><option value="">Selecione um modelo</option></select></label><div class="clause-library" id="governanceClauses"></div><div id="governanceTemplateInfo" class="hint"></div>`; host.append(card);
    $('governanceTemplateSelect').addEventListener('change', renderTemplateGovernance); refreshTemplateGovernance();
  }

  function activateManagementView(name) {
    const tab = $(`tab-${name}`), panel = $(`view-${name}`); if (!tab || !panel) return;
    document.querySelectorAll('.app-tabs [role="tab"]').forEach(item => { const active = item === tab; item.setAttribute('aria-selected', active ? 'true' : 'false'); item.tabIndex = active ? 0 : -1; });
    document.querySelectorAll('.view-panel').forEach(item => { const active = item === panel; item.hidden = !active; item.classList.toggle('is-active', active); });
    window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  function refreshTemplateGovernance() { const state = read(); const select = $('governanceTemplateSelect'); if (!state || !select) return; const current = select.value; select.replaceChildren(new Option('Selecione um modelo', '')); (state.templates || []).filter(template => template.type === 'contract').forEach(template => select.add(new Option(template.name, template.id))); select.value = (state.templates || []).some(template => template.id === current) ? current : ''; renderTemplateGovernance(); }
  function renderTemplateGovernance() { const state = read(); if (!state) return; const management = managementOf(state), template = (state.templates || []).find(item => item.id === $('governanceTemplateSelect').value), box = $('governanceClauses'); box.replaceChildren(); if (!template) { $('governanceTemplateInfo').textContent = 'Selecione um modelo de contrato para configurar as cláusulas obrigatórias.'; return; } const current = management.modelGovernance[template.id] || { version: 1, requiredClauses: [] }; const labels = { payment: 'Pagamento e vencimento', maintenance: 'Conservação e manutenção', adjustment: 'Reajuste', termination: 'Rescisão', inspection: 'Vistoria' }; Object.entries(labels).forEach(([key, label]) => { const row = document.createElement('label'); row.className = 'check-row'; const input = document.createElement('input'); input.type = 'checkbox'; input.checked = (current.requiredClauses || []).includes(key); input.addEventListener('change', () => update((source, data) => { const governance = data.modelGovernance[template.id] || { version: 1, requiredClauses: [] }; const requiredClauses = new Set(governance.requiredClauses || []); input.checked ? requiredClauses.add(key) : requiredClauses.delete(key); data.modelGovernance[template.id] = { ...governance, requiredClauses: [...requiredClauses], updatedAt: now() }; audit(data, { action: 'governança de modelo atualizada', actor: source.meta && source.meta.defaultOperator || '', detail: template.name }); })); row.append(input, document.createTextNode(label)); box.append(row); }); const used = (state.documents || []).filter(record => record.templateId === template.id).length; $('governanceTemplateInfo').textContent = `Revisão ${current.version || 1} · ${used} documento(s) emitido(s) com este modelo.`; }

  function bind() {
    $('openDossiersBtn').addEventListener('click', () => $('tab-dossiers').click()); $('openBatchBtn').addEventListener('click', () => $('batchCard').scrollIntoView({ behavior: 'smooth', block: 'start' })); $('buildBatchBtn').addEventListener('click', validateBatch); $('issueBatchBtn').addEventListener('click', issueBatch);
    ['advancedSearch', 'advancedProperty', 'advancedFrom', 'advancedTo', 'advancedStatus', 'advancedSignature', 'advancedOperator', 'advancedTag'].forEach(target => $(target).addEventListener(['advancedSearch', 'advancedProperty', 'advancedTag'].includes(target) ? 'input' : 'change', renderAdvanced)); $('saveViewBtn').addEventListener('click', saveView); $('savedViewSelect').addEventListener('change', applyView); $('deleteViewBtn').addEventListener('click', () => { const target = $('savedViewSelect').value; if (!target) return; update((state, management) => { management.savedViews = management.savedViews.filter(view => view.id !== target); audit(management, { action: 'visão excluída', actor: state.meta && state.meta.defaultOperator || '' }); }); renderDashboard(); });
    $('toggleDossierForm').addEventListener('click', () => { const form = $('dossierForm'); form.hidden = !form.hidden; $('toggleDossierForm').setAttribute('aria-expanded', form.hidden ? 'false' : 'true'); if (!form.hidden) $('dossierProperty').focus(); }); $('cancelDossierBtn').addEventListener('click', closeDossierForm); $('dossierForm').addEventListener('submit', saveDossier); $('dossierSearch').addEventListener('input', renderDossiers); $('dossierStatusFilter').addEventListener('change', renderDossiers);
    $('closeManagementStatusBtn').addEventListener('click', closeStatus); $('confirmManagementStatusBtn').addEventListener('click', confirmStatus); $('managementStatusModal').addEventListener('click', event => { if (event.target === $('managementStatusModal')) closeStatus(); }); $('unlockManagementBtn').addEventListener('click', unlock); $('managementUnlockPassword').addEventListener('keydown', event => { if (event.key === 'Enter') unlock(); });
    $('tab-management').addEventListener('click', () => { activateManagementView('management'); renderDashboard(); }); $('tab-dossiers').addEventListener('click', () => { activateManagementView('dossiers'); renderDossiers(); });
    ['pointerdown', 'keydown', 'touchstart', 'focus'].forEach(type => document.addEventListener(type, () => { if (!locked) armLock(); }, true)); window.addEventListener('storage', event => { if (event.key === KEY) { refreshDossierLinks(); renderDashboard(); if (!$('view-dossiers').hidden) renderDossiers(); refreshTemplateGovernance(); } });
  }
  function boot() {
    createViews(); createModals(); addDossierLinks(); addTemplateGovernance(); bind(); interceptIssues();
    $('batchReference').value = month(); statusOptions($('advancedStatus')); renderDashboard(); renderDossiers(); armLock();
    setTimeout(() => $('tab-management').click(), 0);
  }
  boot();
})();
