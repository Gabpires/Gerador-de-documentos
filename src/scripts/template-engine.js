(() => {
  'use strict';
  const API = '/api/templates';
  const $ = (id) => document.getElementById(id);
  const text = (value) => String(value ?? '');
  const types = ['text', 'textarea', 'number', 'currency', 'date', 'select', 'checkbox'];
  const labels = { receipt: 'Recibo', declaration: 'Declaração', term: 'Termo', contract: 'Contrato', custom: 'Documento livre' };
  let catalog = { templates: [], archived: [] };
  let draft = null;
  let activeDocument = null;
  let legacyMigrationChecked = false;

  async function request(url, options = {}) {
    const response = await fetch(url, { headers: { 'content-type': 'application/json', ...(options.headers || {}) }, ...options });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Não foi possível acessar os templates.');
    return payload;
  }
  function notice(message, error = false) {
    const box = $('templateEngineNotice');
    if (!box) return;
    box.textContent = message;
    box.className = `template-engine-notice${error ? ' is-error' : ''}`;
  }
  function slug(value) { return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 63); }
  function tagFrom(value) { return `{{${text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64) || 'CAMPO'}}}`; }
  function blankField(index = 1) { const name = `Campo ${index}`; return { id: `campo_${index}`, name, tag: tagFrom(name), type: 'text', required: false, defaultValue: '', helpText: '', validation: 'none', options: [] }; }
  function blankTemplate() {
    return {
      definition: { schemaVersion: 1, id: 'novo-template', name: 'Novo template', documentKind: 'custom', status: 'active', revision: 0, fields: [blankField()] },
      html: '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>body{font:12pt/1.5 Arial,sans-serif;color:#222;margin:18mm}h1{text-align:center}</style></head><body><h1>Novo documento</h1><p>Inclua as tags disponíveis no texto.</p></body></html>'
    };
  }
  function sanitizeHtml(source) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(text(source), 'text/html');
    doc.querySelectorAll('script,iframe,frame,object,embed,form,svg,math,base,meta[http-equiv]').forEach(node => node.remove());
    doc.querySelectorAll('*').forEach(node => {
      [...node.attributes].forEach(attribute => {
        const name = attribute.name.toLowerCase();
        const value = attribute.value.trim();
        if (name.startsWith('on') || name === 'srcdoc' || /^javascript:|^vbscript:/i.test(value)) node.removeAttribute(attribute.name);
        if ((name === 'href' || name === 'src') && !(/^#|^data:image\/(png|gif|jpeg|webp);base64,/i.test(value))) node.removeAttribute(attribute.name);
        if (name === 'style' && /@import|url\s*\(|expression\s*\(|behavior\s*:|-moz-binding/i.test(value)) node.removeAttribute(attribute.name);
      });
    });
    doc.querySelectorAll('style').forEach(style => { if (/@import|url\s*\(|expression\s*\(|behavior\s*:|-moz-binding/i.test(style.textContent)) style.remove(); });
    return '<!doctype html>' + doc.documentElement.outerHTML;
  }
  function renderHtml(template, values, placeholders = true) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(sanitizeHtml(template.html), 'text/html');
    const byTag = new Map(template.definition.fields.map(field => [field.tag, values[field.id]]));
    const names = new Map(template.definition.fields.map(field => [field.tag, field.name]));
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      node.nodeValue = node.nodeValue.replace(/\{\{[A-Z][A-Z0-9_]{1,63}\}\}/g, tag => {
        const value = byTag.get(tag);
        if (value === true) return 'Sim';
        if (value === false) return 'Não';
        return text(value).trim() || (placeholders ? `⟦${names.get(tag) || tag}⟧` : '');
      });
    });
    return '<!doctype html>' + doc.documentElement.outerHTML;
  }
  function humanDate(value) { if (!/^\d{4}-\d{2}-\d{2}$/.test(text(value))) return text(value); const [year, month, day] = value.split('-'); return `${day}/${month}/${year}`; }
  function formatValue(field, value) {
    if (field.type === 'checkbox') return value === true ? 'Sim' : 'Não';
    if (field.type === 'select') return field.options.find(option => option.value === value)?.label || value;
    if (field.type === 'date') return humanDate(value);
    if (field.type === 'currency' && value) { const number = Number(text(value).replace(/\./g, '').replace(',', '.')); if (Number.isFinite(number)) return number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
    return value;
  }
  function valuesOf(form, definition) {
    const values = {};
    definition.fields.forEach(field => { const input = form.elements.namedItem(field.id); values[field.id] = input ? (field.type === 'checkbox' ? input.checked : input.value) : field.defaultValue; });
    return values;
  }
  function valueIsPresent(field, value) { return field.type === 'checkbox' ? value === true : text(value).trim() !== ''; }
  function validationMessage(field, value) {
    if (field.required && !valueIsPresent(field, value)) return `${field.name} é obrigatório.`;
    if (!valueIsPresent(field, value)) return '';
    const raw = text(value).trim();
    if (field.validation === 'cpfCnpj') { const digits = raw.replace(/\D/g, ''); if (!((digits.length === 11 || digits.length === 14) && !/^(\d)\1+$/.test(digits))) return `Informe um CPF ou CNPJ válido para ${field.name}.`; }
    if (field.validation === 'currency' && !Number.isFinite(Number(raw.replace(/\./g, '').replace(',', '.')))) return `Informe um valor monetário válido para ${field.name}.`;
    if (field.validation === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `Informe uma data válida para ${field.name}.`;
    return '';
  }
  function validationIssues(definition, values) { return definition.fields.map(field => ({ field, message: validationMessage(field, values[field.id]) })).filter(item => item.message); }
  function focusDynamicField(input) { input?.focus(); input?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }
  function renderValidationSummary(form, issues, visible) {
    const summary = form.querySelector('#dynamicValidationSummary');
    if (!summary) return;
    summary.replaceChildren(); summary.hidden = !visible || !issues.length;
    if (!visible || !issues.length) return;
    summary.append(createElement('strong', { text: issues.length === 1 ? 'Falta corrigir 1 campo antes da revisão.' : `Faltam corrigir ${issues.length} campos antes da revisão.` }));
    const list = createElement('ul');
    issues.forEach(({ field, message }) => { const input = form.elements.namedItem(field.id); const item = createElement('li'); item.append(createElement('button', { type: 'button', text: field.name, onClick: () => focusDynamicField(input) }), document.createTextNode(' — ' + message)); list.append(item); });
    summary.append(list);
  }
  function renderDynamicReview(form, definition, values, issues) {
    const status = form.querySelector('#dynamicCompletionStatus'), list = form.querySelector('#dynamicPendingList');
    if (!status || !list) return;
    const required = definition.fields.filter(field => field.required), completed = required.filter(field => valueIsPresent(field, values[field.id])).length, next = required.find(field => !valueIsPresent(field, values[field.id]));
    status.textContent = !required.length ? 'Este modelo não possui campos obrigatórios.' : `${completed} de ${required.length} campos obrigatórios preenchidos.${next ? ` Próximo campo necessário: ${next.name}.` : ' Todos os campos obrigatórios foram preenchidos.'}`;
    list.replaceChildren();
    if (!issues.length) { list.append(createElement('p', { className: 'dynamic-review-clear', text: 'Não há pendências neste momento. Você pode revisar e emitir quando estiver pronto.' })); return; }
    issues.forEach(({ field, message }) => { const input = form.elements.namedItem(field.id), item = createElement('li'); item.append(createElement('button', { type: 'button', text: field.name, onClick: () => focusDynamicField(input) }), createElement('span', { text: message })); list.append(item); });
  }
  function syncDynamicValidation(form, definition, { showErrors = false, focus = false } = {}) {
    const values = valuesOf(form, definition), issues = validationIssues(definition, values), messages = new Map(issues.map(issue => [issue.field.id, issue.message]));
    definition.fields.forEach(field => { const input = form.elements.namedItem(field.id), error = $(`dynamic-error-${field.id}`), message = messages.get(field.id) || ''; input?.setAttribute('aria-invalid', showErrors && message ? 'true' : 'false'); if (error) error.textContent = showErrors ? message : ''; });
    renderValidationSummary(form, issues, showErrors); renderDynamicReview(form, definition, values, issues);
    if (focus && issues.length) focusDynamicField(form.elements.namedItem(issues[0].field.id));
    return { valid: !issues.length, values, issues };
  }
  function validateValues(form, definition, { focus = true } = {}) { return syncDynamicValidation(form, definition, { showErrors: true, focus }).valid; }
  function createElement(tag, properties = {}, children = []) {
    const element = document.createElement(tag);
    Object.entries(properties).forEach(([key, value]) => { if (key === 'className') element.className = value; else if (key === 'text') element.textContent = value; else if (key.startsWith('on')) element.addEventListener(key.slice(2).toLowerCase(), value); else element[key] = value; });
    children.forEach(child => element.append(child));
    return element;
  }
  function addFieldControl(row, label, input) {
    const field = createElement('label', { className: 'template-field-control' });
    field.append(createElement('span', { text: label }), input); row.append(field);
  }
  function fieldRow(field, index) {
    const row = createElement('article', { className: 'template-field-row' });
    const title = createElement('strong', { text: `Campo ${index + 1}` });
    const actions = createElement('div', { className: 'template-field-actions' });
    const up = createElement('button', { type: 'button', text: '↑', title: 'Mover para cima', ariaLabel: `Mover campo ${index + 1} para cima`, onClick: () => moveField(index, -1) });
    const down = createElement('button', { type: 'button', text: '↓', title: 'Mover para baixo', ariaLabel: `Mover campo ${index + 1} para baixo`, onClick: () => moveField(index, 1) });
    const remove = createElement('button', { type: 'button', text: 'Remover', className: 'danger-button', onClick: () => { draft.definition.fields.splice(index, 1); renderFields(); syncTags(); } });
    actions.append(up, down, remove); row.append(title, actions);
    const controls = createElement('div', { className: 'template-field-controls' });
    const id = createElement('input', { value: field.id, maxLength: 64 });
    const name = createElement('input', { value: field.name, maxLength: 120 });
    const tag = createElement('input', { value: field.tag, maxLength: 80 });
    const type = createElement('select'); types.forEach(value => type.add(new Option({ text: 'Texto', textarea: 'Texto longo', number: 'Número', currency: 'Moeda', date: 'Data', select: 'Combobox', checkbox: 'Caixa de seleção' }[value], value))); type.value = field.type;
    const required = createElement('input', { type: 'checkbox', checked: field.required });
    const validation = createElement('select'); [['none', 'Sem regra'], ['cpfCnpj', 'CPF/CNPJ'], ['currency', 'Moeda'], ['date', 'Data']].forEach(([value, label]) => validation.add(new Option(label, value))); validation.value = field.validation || 'none';
    const defaultValue = createElement('input', { value: text(field.defaultValue), maxLength: 300 });
    const help = createElement('input', { value: text(field.helpText), maxLength: 280 });
    addFieldControl(controls, 'Identificador', id); addFieldControl(controls, 'Nome do campo', name); addFieldControl(controls, 'Tag', tag); addFieldControl(controls, 'Tipo', type); addFieldControl(controls, 'Validação', validation); addFieldControl(controls, 'Valor padrão', defaultValue); addFieldControl(controls, 'Ajuda', help);
    const requiredHintId = `template-field-required-${index}`;
    required.setAttribute('aria-describedby', requiredHintId);
    const requiredLabel = createElement('label', { className: 'template-field-check', text: 'Obrigatório ' }); requiredLabel.append(required); controls.append(requiredLabel);
    const options = createElement('textarea', { value: field.options.map(option => `${option.label}=${option.value}`).join('\n'), placeholder: 'Rótulo=valor, uma opção por linha' });
    const optionsLabel = createElement('label', { className: 'template-field-options', text: 'Opções do combobox' }); optionsLabel.append(options); controls.append(optionsLabel);
    optionsLabel.hidden = field.type !== 'select';
    const guidance = createElement('div', { className: 'template-field-guidance', id: requiredHintId, text: 'Obrigatório bloqueia a emissão quando o campo estiver vazio. A validação confere apenas valores preenchidos; o valor padrão aparece ao iniciar um novo documento.' });
    row.append(controls, guidance);
    const change = () => {
      const previousName = field.name;
      field.id = slug(id.value).replace(/-/g, '_') || `campo_${index + 1}`;
      field.name = name.value.trim();
      if (!tag.dataset.changed || tag.value === tagFrom(previousName)) tag.value = tagFrom(field.name);
      field.tag = tag.value.trim().toUpperCase(); field.type = type.value; field.required = required.checked; field.validation = validation.value; field.defaultValue = defaultValue.value; field.helpText = help.value; field.options = options.value.split('\n').map(line => line.split('=').map(part => part.trim())).filter(parts => parts[0] && parts[1]).map(([label, value]) => ({ label, value }));
      optionsLabel.hidden = field.type !== 'select'; refreshTagPicker(); updateJsonPreview(); renderStudioPreview(); updateStudioToolbar();
    };
    [id, name, type, required, validation, defaultValue, help, options].forEach(input => input.addEventListener('input', change));
    type.addEventListener('change', change); required.addEventListener('change', change); tag.addEventListener('input', () => { tag.dataset.changed = 'true'; change(); });
    return row;
  }
  function renderFields() { const box = $('templateFields'); if (!box || !draft) return; box.replaceChildren(...draft.definition.fields.map(fieldRow)); updateJsonPreview(); refreshTagPicker(); }
  function moveField(index, direction) { const next = index + direction; if (next < 0 || next >= draft.definition.fields.length) return; [draft.definition.fields[index], draft.definition.fields[next]] = [draft.definition.fields[next], draft.definition.fields[index]]; renderFields(); }
  function syncTags() { draft.definition.fields.forEach((field, index) => { if (!field.id) field.id = `campo_${index + 1}`; if (!field.tag) field.tag = tagFrom(field.name); }); refreshTagPicker(); }
  function updateJsonPreview() { const box = $('templateJsonPreview'); if (box && draft) box.value = JSON.stringify(draft.definition, null, 2); }
  function updateStudioToolbar() { const toolbar = document.querySelector('.template-toolbar'); if (toolbar && draft) toolbar.setAttribute('aria-label', `Ferramentas de edição do template: ${draft.definition.name || 'Novo template'}`); }
  function refreshTagPicker() { const picker = $('templateTagPicker'); if (!picker || !draft) return; const current = picker.value; picker.replaceChildren(new Option('Inserir tag...', '')); draft.definition.fields.forEach(field => picker.add(new Option(`${field.name} — ${field.tag}`, field.tag))); picker.value = [...picker.options].some(option => option.value === current) ? current : ''; }
  function sourceValue() { return $('templateHtmlSource').hidden ? visualHtml() : $('templateHtmlSource').value; }
  function visualHtml() {
    const parser = new DOMParser(); const doc = parser.parseFromString(draft.html, 'text/html');
    doc.body.innerHTML = $('templateVisualEditor').innerHTML;
    return '<!doctype html>' + doc.documentElement.outerHTML;
  }
  function syncVisual() { const parser = new DOMParser(); parser.parseFromString(sanitizeHtml(draft.html), 'text/html'); $('templateVisualEditor').innerHTML = parser.parseFromString(sanitizeHtml(draft.html), 'text/html').body.innerHTML; }
  function setSourceMode(source) {
    const visual = $('templateVisualEditor'), code = $('templateHtmlSource'), toggle = $('templateSourceToggle');
    if (source) { draft.html = visualHtml(); code.value = draft.html; code.hidden = false; visual.hidden = true; toggle.textContent = 'Usar editor visual'; }
    else { draft.html = code.value; syncVisual(); code.hidden = true; visual.hidden = false; toggle.textContent = 'Editar HTML'; }
    renderStudioPreview();
  }
  function renderStudioPreview() {
    const frame = $('templateStudioPreview'); if (!frame || !draft) return;
    const values = Object.fromEntries(draft.definition.fields.map(field => [field.id, field.defaultValue]));
    frame.srcdoc = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">${renderHtml({ ...draft, html: sourceValue() }, values)}`;
  }
  function collectDefinition() {
    const definition = draft.definition;
    definition.id = slug($('templateId').value);
    definition.name = $('templateName').value.trim();
    definition.documentKind = $('templateKind').value;
    syncTags();
    return definition;
  }
  function populateStudio(template) {
    draft = structuredClone(template || blankTemplate());
    $('templateId').value = draft.definition.id; $('templateName').value = draft.definition.name; $('templateKind').value = draft.definition.documentKind;
    $('templateRevision').textContent = draft.definition.revision ? `Revisão ${draft.definition.revision}` : 'Ainda não salvo';
    $('templateHtmlSource').hidden = true; $('templateVisualEditor').hidden = false; $('templateSourceToggle').textContent = 'Editar HTML';
    syncVisual(); renderFields(); updateStudioToolbar(); renderStudioPreview();
  }
  async function saveTemplate() {
    try {
      const definition = collectDefinition();
      if (!definition.id || definition.name.length < 3) throw new Error('Informe um identificador e nome com ao menos 3 caracteres.');
      if (new Set(definition.fields.map(field => field.tag)).size !== definition.fields.length) throw new Error('As tags devem ser únicas.');
      const html = sanitizeHtml(sourceValue());
      const saved = await request(`${API}/${definition.id}`, { method: 'PUT', body: JSON.stringify({ definition, html, expectedRevision: draft.definition.revision || 0 }) });
      populateStudio(saved); await loadCatalog(); notice('Template salvo em resources/templates.');
    } catch (error) { notice(error.message, true); }
  }
  async function migrateLegacyModels() {
    if (legacyMigrationChecked || !window.paraibaDocumentApp?.legacyTemplates) return;
    legacyMigrationChecked = true;
    const existing = new Set([...catalog.templates, ...catalog.archived].map(item => item.id));
    const models = window.paraibaDocumentApp.legacyTemplates().filter(model => model.id && !existing.has(model.id));
    let migrated = 0;
    for (const model of models) {
      const html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>body{font:12pt/1.5 Arial,sans-serif;margin:18mm}</style></head><body><h1>' + model.name.replace(/</g, '') + '</h1>' + model.fields.map(field => '<p><strong>' + field.name.replace(/</g, '') + ':</strong> ' + field.tag + '</p>').join('') + '</body></html>';
      try { await request(`${API}/${model.id}`, { method: 'PUT', body: JSON.stringify({ definition: { schemaVersion: 1, id: model.id, name: model.name, documentKind: model.documentKind, status: 'active', revision: 0, fields: model.fields }, html, expectedRevision: 0 }) }); migrated++; } catch (error) { notice(`Um modelo antigo não pôde ser convertido: ${error.message}`, true); }
    }
    if (models.length === migrated) window.paraibaDocumentApp.markResourceMigration?.();
    if (migrated) { catalog = await request(API); renderCatalog(); notice(`${migrated} modelo(s) local(is) convertido(s) para resources/templates.`); }
  }
  async function loadCatalog() {
    try { catalog = await request(API); renderCatalog(); await migrateLegacyModels(); } catch (error) { notice(`Servidor de templates indisponível: ${error.message}`, true); }
  }
  function renderCatalog() {
    const box = $('templateCatalog'); if (!box) return; box.replaceChildren();
    const all = [...catalog.templates, ...catalog.archived];
    if (!all.length) { box.append(createElement('p', { className: 'empty-state', text: 'Nenhum template salvo em resources/templates.' })); return; }
    all.forEach(item => {
      const card = createElement('article', { className: `template-resource-card${item.status === 'archived' ? ' is-archived' : ''}` }); card.dataset.templateId = item.id;
      card.append(createElement('h3', { text: item.name }), createElement('p', { text: `${labels[item.documentKind]} · ${item.fieldCount} campo(s) · revisão ${item.revision}` }));
      const actions = createElement('div', { className: 'contact-actions' });
      actions.append(createElement('button', { type: 'button', text: 'Editar', onClick: () => openTemplate(item.id) }));
      if (item.status === 'active') actions.append(createElement('button', { type: 'button', className: 'primary', text: 'Usar documento', onClick: () => startDocument(item.id) }), createElement('button', { type: 'button', className: 'danger-button', text: 'Arquivar', onClick: () => archiveTemplate(item.id, false) }));
      else actions.append(createElement('button', { type: 'button', className: 'btn btn-secondary', text: 'Restaurar', onClick: () => archiveTemplate(item.id, true) }));
      card.append(actions); box.append(card);
    });
  }
  async function openTemplate(id) { try { populateStudio(await request(`${API}/${id}`)); $('templateEditorPanel').scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (error) { notice(error.message, true); } }
  async function archiveTemplate(id, restore) { try { await request(`${API}/${id}/${restore ? 'restore' : 'archive'}`, { method: 'POST', body: '{}' }); await loadCatalog(); notice(restore ? 'Template restaurado.' : 'Template arquivado.'); } catch (error) { notice(error.message, true); } }
  function command(command) { $('templateVisualEditor').focus(); document.execCommand(command, false); draft.html = visualHtml(); renderStudioPreview(); }
  function insertTag() { const tag = $('templateTagPicker').value; if (!tag) return; const editor = $('templateVisualEditor'); editor.focus(); const selection = window.getSelection(); if (!selection.rangeCount) { editor.append(document.createTextNode(tag)); } else { const range = selection.getRangeAt(0); range.deleteContents(); range.insertNode(document.createTextNode(tag)); range.collapse(false); selection.removeAllRanges(); selection.addRange(range); } draft.html = visualHtml(); renderStudioPreview(); }
  function startDocument(id) { openTemplate(id).then(() => { const template = structuredClone(draft); activeDocument = { template, values: Object.fromEntries(template.definition.fields.map(field => [field.id, field.defaultValue])), draftId: '', draftSavedAt: '', validationAttempted: false }; const host = $('dynamicDocumentHost'); host.hidden = false; document.querySelector('#view-new .app').hidden = true; buildDocumentForm(); window.paraibaDocumentApp?.activateView('new'); }); }
  function buildDocumentForm(record = null) {
    const host = $('dynamicDocumentHost'); const { template } = activeDocument; const definition = template.definition, isReadOnly = !!record && record.status !== 'draft', isDraft = !!record && record.status === 'draft';
    host.replaceChildren();
    const shell = createElement('div', { className: 'dynamic-document-layout' });
    const panel = createElement('section', { className: 'dynamic-document-panel' });
    const head = createElement('div', { className: 'dynamic-document-header' });
    head.append(createElement('div', {}, [createElement('h2', { text: isReadOnly ? definition.name : `Novo ${labels[definition.documentKind].toLowerCase()}` }), createElement('p', { text: isReadOnly ? 'Snapshot emitido: este conteúdo não será alterado por edições futuras.' : isDraft ? 'Rascunho salvo: continue preenchendo, revise e emita quando estiver pronto.' : 'Preencha os campos e revise a prévia antes de emitir.' })]));
    head.append(createElement('button', { type: 'button', text: 'Voltar ao fluxo anterior', className: 'btn btn-quiet', onClick: closeDocument })); panel.append(head);
    const form = createElement('form', { className: 'dynamic-document-form' });
    form.append(createElement('section', { id: 'dynamicValidationSummary', className: 'dynamic-validation-summary', role: 'alert', hidden: true }));
    const review = createElement('section', { id: 'dynamicReview', className: 'dynamic-review' }); review.setAttribute('aria-labelledby', 'dynamicReviewTitle');
    const completionStatus = createElement('p', { id: 'dynamicCompletionStatus', role: 'status' }); completionStatus.setAttribute('aria-live', 'polite');
    review.append(createElement('h3', { id: 'dynamicReviewTitle', text: 'Revisão do preenchimento' }), completionStatus, createElement('h4', { text: 'Pendências do modelo' }), createElement('ul', { id: 'dynamicPendingList', className: 'dynamic-pending-list' }));
    form.append(review);
    definition.fields.forEach(field => {
      const wrapper = createElement('label', { className: 'field dynamic-field' }); wrapper.append(createElement('span', { text: field.name + (field.required ? ' *' : '') }));
      let input;
      const value = activeDocument.values[field.id] ?? field.defaultValue;
      if (field.type === 'textarea') input = createElement('textarea', { name: field.id, value: text(value), rows: 4, disabled: isReadOnly });
      else if (field.type === 'select') { input = createElement('select', { name: field.id, disabled: isReadOnly }); input.add(new Option('Selecione...', '')); field.options.forEach(option => input.add(new Option(option.label, option.value))); input.value = text(value); }
      else { input = createElement('input', { name: field.id, type: field.type === 'date' ? 'date' : field.type === 'checkbox' ? 'checkbox' : 'text', value: field.type === 'checkbox' ? undefined : text(value), checked: field.type === 'checkbox' ? value === true : undefined, disabled: isReadOnly }); if (field.type === 'currency') input.inputMode = 'decimal'; if (field.type === 'number') input.inputMode = 'numeric'; }
      input.id = `dynamic-${field.id}`; wrapper.htmlFor = input.id;
      const helpId = `dynamic-help-${field.id}`, errorId = `dynamic-error-${field.id}`;
      input.setAttribute('aria-describedby', [field.helpText ? helpId : '', errorId].filter(Boolean).join(' ')); if (field.required) input.setAttribute('aria-required', 'true');
      const clearError = () => { activeDocument.values = valuesOf(form, definition); syncDynamicValidation(form, definition, { showErrors: activeDocument.validationAttempted === true }); refreshDocumentPreview(); };
      input.addEventListener('input', clearError); input.addEventListener('change', clearError); wrapper.append(input); if (field.helpText) wrapper.append(createElement('small', { id: helpId, text: field.helpText })); wrapper.append(createElement('span', { id: errorId, className: 'field-error', role: 'alert' })); form.append(wrapper);
    });
    if (!isReadOnly) { const draftState = createElement('p', { id: 'dynamicDraftState', className: 'dynamic-draft-state', role: 'status', text: activeDocument.draftId ? 'Rascunho salvo neste navegador. Ele não recebeu numeração.' : 'Nenhum rascunho salvo ainda. Salve antes de interromper um formulário longo; a numeração só é usada na emissão.' }); const actions = createElement('div', { className: 'dynamic-document-actions' }); actions.append(createElement('button', { id: 'saveDynamicDraftBtn', type: 'button', className: 'btn btn-secondary', text: activeDocument.draftId ? 'Atualizar rascunho' : 'Salvar rascunho', onClick: () => persistDocument('draft', form) }), createElement('button', { type: 'button', className: 'btn btn-primary', text: definition.documentKind === 'custom' ? 'Emitir documento' : 'Emitir e numerar', onClick: () => persistDocument('issued', form) })); if (activeDocument.draftId) actions.append(createElement('button', { id: 'discardDynamicDraftBtn', type: 'button', className: 'btn btn-quiet', text: 'Descartar rascunho', onClick: discardActiveDraft })); form.append(draftState, actions); }
    panel.append(form); const preview = createElement('section', { className: 'dynamic-preview-panel' }); preview.append(createElement('h2', { text: 'Prévia A4' }), createElement('iframe', { id: 'dynamicDocumentPreview', title: 'Prévia do documento dinâmico', sandbox: '' })); if (isReadOnly) preview.append(createElement('button', { type: 'button', className: 'btn btn-secondary', text: 'Imprimir snapshot', onClick: () => printSnapshot(record.templateSnapshot?.renderedHtml) })); shell.append(panel, preview); host.append(shell); syncDynamicValidation(form, definition); refreshDocumentPreview(); }
  function refreshDocumentPreview() { const frame = $('dynamicDocumentPreview'); if (!frame || !activeDocument) return; const values = Object.fromEntries(activeDocument.template.definition.fields.map(field => [field.id, formatValue(field, activeDocument.values[field.id])])); frame.srcdoc = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">${renderHtml(activeDocument.template, values)}`; }
  function dynamicFingerprint(template, values) { return JSON.stringify({ id: template.definition.id, revision: template.definition.revision, html: template.html, values }); }
  function dynamicReviewFields(template, values, identity) {
    const definition = template.definition;
    return [
      { label: 'Modelo', value: `${definition.name} · revisão ${definition.revision || 1}` },
      { label: 'Categoria', value: labels[definition.documentKind] || 'Documento' },
      { label: 'Número proposto', value: identity.number || 'Sem numeração · documento livre' },
      { label: 'Responsável', value: identity.operator },
      ...definition.fields.filter(field => field.required || text(values[field.id]).trim() || values[field.id] === true).map(field => ({ label: field.name, value: formatValue(field, values[field.id]) }))
    ];
  }
  async function persistDocument(status, form) {
    if (status === 'issued') activeDocument.validationAttempted = true;
    if (status === 'issued' && !validateValues(form, activeDocument.template.definition)) { notice('Confira as pendências indicadas antes de revisar a emissão.', true); return; }
    activeDocument.values = valuesOf(form, activeDocument.template.definition);
    const template = activeDocument.template, definition = template.definition;
    if (status === 'issued') {
      const identity = window.paraibaDocumentApp?.previewDynamicIdentity(definition.documentKind, activeDocument.values);
      const requestReview = window.paraibaDocumentApp?.requestIssueReview;
      if (!identity || typeof requestReview !== 'function') { notice('A revisão da emissão não está disponível. Recarregue a página e tente novamente.', true); return; }
      const reviewedValues = { ...activeDocument.values }, reviewedFingerprint = dynamicFingerprint(template, reviewedValues);
      await requestReview({
        title: `Revisar emissão de ${labels[definition.documentKind].toLowerCase()}`,
        description: 'Confira o modelo e os valores atuais. Os nomes abaixo seguem os campos definidos no template.',
        fields: dynamicReviewFields(template, reviewedValues, identity),
        consequence: identity.number ? 'O número será reservado somente ao emitir. O template, os valores e o HTML ficarão congelados no histórico.' : 'Este documento livre não receberá número. O template, os valores e o HTML ficarão congelados no histórico.',
        validate: () => {
          if (!activeDocument || !validateValues(form, definition, { focus: false })) return { ok: false, invalidFields: true, message: 'Existem campos obrigatórios ou inválidos. Corrija-os e abra uma nova revisão.' };
          const currentValues = valuesOf(form, definition), currentIdentity = window.paraibaDocumentApp.previewDynamicIdentity(definition.documentKind, currentValues);
          if (dynamicFingerprint(activeDocument.template, currentValues) !== reviewedFingerprint || currentIdentity.number !== identity.number || Number(currentIdentity.year) !== Number(identity.year)) return { ok: false, stale: true, message: 'Os valores ou a numeração mudaram. Confira e abra uma nova revisão.' };
          return { ok: true };
        },
        onInvalid: result => { if (result.invalidFields) validateValues(form, definition); notice(result.message || 'Confira os dados e abra a revisão novamente.', true); },
        commit: () => {
          const formattedValues = Object.fromEntries(definition.fields.map(field => [field.id, formatValue(field, reviewedValues[field.id])]));
          const record = window.paraibaDocumentApp.saveDynamicDocument({ status, definition, html: sanitizeHtml(template.html), renderedHtml: renderHtml(template, formattedValues, false), values: reviewedValues, expectedIdentity: identity, draftId: activeDocument.draftId });
          if (!record) throw new Error('Não foi possível registrar o documento neste navegador. Seus valores continuam na edição.');
          return record;
        },
        onSuccess: record => {
          notice(`${record.number || 'Documento'} emitido, registrado e congelado no histórico.`);
          activeDocument = { template: { definition: record.templateSnapshot.definition, html: record.templateSnapshot.html }, values: record.fields };
          buildDocumentForm(record);
        }
      });
      return;
    }
    const values = Object.fromEntries(definition.fields.map(field => [field.id, formatValue(field, activeDocument.values[field.id])]));
    const renderedHtml = renderHtml(template, values, true);
    try {
      const record = window.paraibaDocumentApp?.saveDynamicDocument({ status, definition, html: sanitizeHtml(template.html), renderedHtml, values: activeDocument.values, draftId: activeDocument.draftId });
      if (!record) throw new Error('O armazenamento local não está disponível.');
      notice('Rascunho salvo neste navegador, sem numeração.');
      activeDocument = { template: { definition: record.templateSnapshot.definition, html: record.templateSnapshot.html }, values: record.fields, draftId: record.id, draftSavedAt: record.updatedAt || record.createdAt, validationAttempted: false };
      buildDocumentForm(record);
    } catch (error) { notice(error.message, true); }
  }
  async function discardActiveDraft() {
    if (!activeDocument?.draftId) return;
    const confirmed = await window.paraibaDocumentApp?.requestAction?.({ title: 'Descartar rascunho?', description: 'Os valores salvos deste documento serão removidos deste navegador. Nenhuma numeração foi reservada.', confirmLabel: 'Descartar rascunho', danger: true });
    if (!confirmed) return;
    if (!window.paraibaDocumentApp?.discardDynamicDraft?.(activeDocument.draftId)) { notice('Não foi possível descartar o rascunho neste navegador.', true); return; }
    const template = activeDocument.template;
    activeDocument = { template, values: Object.fromEntries(template.definition.fields.map(field => [field.id, field.defaultValue])), draftId: '', draftSavedAt: '', validationAttempted: false };
    buildDocumentForm(); notice('Rascunho descartado. Nenhuma numeração foi usada.');
  }
  function closeDocument() { activeDocument = null; $('dynamicDocumentHost').hidden = true; document.querySelector('#view-new .app').hidden = false; }
  function openRecord(record) { activeDocument = { template: { definition: record.templateSnapshot.definition, html: record.templateSnapshot.html }, values: record.fields || {}, draftId: record.status === 'draft' ? record.id : '', draftSavedAt: record.updatedAt || record.createdAt || '', validationAttempted: false }; window.paraibaDocumentApp?.activateView('new'); $('dynamicDocumentHost').hidden = false; document.querySelector('#view-new .app').hidden = true; buildDocumentForm(record); }
  function printSnapshot(html) {
    if (!html) return;
    const frame = document.createElement('iframe');
    frame.className = 'dynamic-print-frame';
    // O snapshot continua sem scripts; a mesma origem só permite chamar print() no iframe.
    frame.setAttribute('sandbox', 'allow-modals allow-same-origin');
    frame.addEventListener('load', () => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } finally {
        setTimeout(() => frame.remove(), 1000);
      }
    }, { once: true });
    frame.srcdoc = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">${html}`;
    document.body.append(frame);
  }
  function setupStudio() {
    const view = $('view-templates'); if (!view) return;
    const host = createElement('section', { id: 'templateStudio', className: 'template-studio content-card wide-card' });
    host.innerHTML = `<div class="template-studio-head"><div><h2>Templates HTML</h2><p>Crie o formulário no JSON e use as tags no editor visual ou no HTML.</p></div><button class="btn btn-primary" type="button" id="newTemplateBtn">Novo template</button></div><p id="templateEngineNotice" class="template-engine-notice" role="status"></p><div class="template-catalog" id="templateCatalog"></div><section class="template-editor-panel" id="templateEditorPanel"><div class="template-editor-meta"><label class="field"><span>Identificador do arquivo</span><input id="templateId" maxlength="63" /></label><label class="field"><span>Nome do template</span><input id="templateName" maxlength="120" /></label><label class="field"><span>Categoria</span><select id="templateKind"><option value="receipt">Recibo</option><option value="declaration">Declaração</option><option value="term">Termo</option><option value="contract">Contrato</option><option value="custom">Documento livre</option></select></label><span id="templateRevision" class="template-revision"></span></div><div class="template-builder-grid"><section><div class="template-section-title"><h3>Campos do formulário</h3><button type="button" id="addTemplateField">Adicionar campo</button></div><div id="templateFields"></div><label class="field"><span>JSON gerado</span><textarea id="templateJsonPreview" readonly rows="10"></textarea></label></section><section><div class="template-section-title"><h3>Conteúdo do documento</h3><button type="button" id="templateSourceToggle">Editar HTML</button></div><p class="template-tag-hint" id="templateTagHint">Uma tag insere o valor do campo no texto do documento. Posicione o cursor no conteúdo e escolha a tag correspondente.</p><div class="template-toolbar" role="toolbar" aria-describedby="templateTagHint"><button type="button" data-command="bold" aria-label="Negrito"><strong aria-hidden="true">B</strong></button><button type="button" data-command="italic" aria-label="Itálico"><em aria-hidden="true">I</em></button><button type="button" data-command="underline" aria-label="Sublinhado"><u aria-hidden="true">S</u></button><button type="button" data-command="insertUnorderedList">Lista</button><button type="button" data-command="insertOrderedList">Numerar</button><select id="templateTagPicker" aria-label="Inserir tag"></select><button type="button" id="insertTemplateTag">Inserir tag</button></div><div id="templateVisualEditor" class="template-visual-editor" contenteditable="true" aria-label="Editor visual do template"></div><textarea id="templateHtmlSource" class="template-html-source" rows="16" aria-label="Código HTML do template"></textarea><iframe id="templateStudioPreview" title="Prévia do template" sandbox=""></iframe></section></div><div class="template-save-actions"><button type="button" id="saveTemplateBtn" class="btn btn-primary">Salvar HTML e JSON em resources</button></div></section>`;
    view.append(host);
    $('newTemplateBtn').addEventListener('click', () => populateStudio(blankTemplate())); $('addTemplateField').addEventListener('click', () => { draft.definition.fields.push(blankField(draft.definition.fields.length + 1)); renderFields(); }); $('templateSourceToggle').addEventListener('click', () => setSourceMode($('templateHtmlSource').hidden)); $('insertTemplateTag').addEventListener('click', insertTag); $('saveTemplateBtn').addEventListener('click', saveTemplate); document.querySelectorAll('[data-command]').forEach(button => button.addEventListener('click', () => command(button.dataset.command))); $('templateVisualEditor').addEventListener('input', () => { draft.html = visualHtml(); renderStudioPreview(); }); $('templateHtmlSource').addEventListener('input', renderStudioPreview); ['templateId', 'templateName', 'templateKind'].forEach(id => $(id).addEventListener('input', () => { collectDefinition(); updateJsonPreview(); updateStudioToolbar(); }));
    populateStudio(blankTemplate()); loadCatalog();
  }
  function init() { if (!$('dynamicDocumentHost')) { const host = document.createElement('section'); host.id = 'dynamicDocumentHost'; host.hidden = true; $('view-new').prepend(host); } setupStudio(); }
  window.TemplateDocumentEngine = { startDocument, openRecord, printSnapshot, refreshCatalog: loadCatalog };
  document.addEventListener('DOMContentLoaded', init);
})();
