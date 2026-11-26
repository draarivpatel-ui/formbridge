import {
  PLAIN_LANGUAGE_THRESHOLD,
  auditReadingLevels,
  buildPrintPayload,
  confirmReviewEntry,
  createReviewSession,
  editReviewEntry,
  fillForm,
  formatValue,
  getByPath,
  loadFormDefinition,
  resolveText,
  reviewProgress,
  validateValue,
} from './form-engine.js';
import { PROFILE_INPUTS, UI } from './ui-text.js';

const PROFILE_KEY = 'formbridge-profile-v1';
const LOCALE_KEY = 'formbridge-locale-v1';
const app = document.getElementById('app');

const state = {
  locale: localStorage.getItem(LOCALE_KEY) || 'en',
  screen: 'load',
  definition: null,
  definitionSource: 'sample',
  definitionIssues: [],
  exampleProfile: null,
  profile: {},
  fill: null,
  review: null,
  printPayload: null,
  profileNotice: '',
  loadError: '',
  offline: 'checking',
};

const t = () => UI[state.locale] || UI.en;
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const clone = (value) => JSON.parse(JSON.stringify(value));

function setByPath(object, path, value) {
  const parts = path.split('.');
  let current = object;
  for (const part of parts.slice(0, -1)) {
    if (!current[part] || typeof current[part] !== 'object' || Array.isArray(current[part])) current[part] = {};
    current = current[part];
  }
  current[parts.at(-1)] = value;
}

function saveProfile() {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(state.profile));
  state.profileNotice = t().saved;
  updateProfileNotice();
}

function loadSavedProfile() {
  try {
    const saved = localStorage.getItem(PROFILE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

function recomputeFill() {
  if (!state.definition) return;
  state.fill = fillForm(state.definition, state.profile);
  state.review = createReviewSession(state.definition, state.fill, state.locale);
  state.printPayload = null;
}

function updateFillCompleteness() {
  const missing = [];
  const invalid = [];
  for (const field of state.definition.fields) {
    const value = state.fill.values[field.id];
    const result = state.fill.results[field.id];
    if (field.required && (value === undefined || value === null || value === '')) missing.push(field.id);
    if (!result.valid) invalid.push(field.id);
  }
  state.fill.missing = missing;
  state.fill.invalid = invalid;
  state.fill.complete = missing.length === 0 && invalid.length === 0;
}

function setFillValue(field, rawValue) {
  const result = validateValue(field, rawValue, state.locale);
  const value = result.valid ? result.value : rawValue;
  state.fill.values[field.id] = value;
  state.fill.results[field.id] = result;
  updateFillCompleteness();
  if (state.review) {
    const entry = state.review.entries.find((candidate) => candidate.id === field.id);
    if (entry) {
      entry.answer = value;
      entry.validation = result;
      entry.status = result.valid ? 'edited' : 'needs-attention';
      state.review.complete = false;
    }
  }
  updateFieldState(field.id, result);
  updateRail();
  updateStepStates();
}

function updateFieldState(fieldId, result) {
  const holder = document.querySelector(`[data-field-state="${CSS.escape(fieldId)}"]`);
  if (!holder) return;
  holder.classList.toggle('is-invalid', !result.valid);
  holder.classList.toggle('is-valid', result.valid);
  const message = holder.querySelector('.field-message');
  if (message) {
    message.textContent = result.valid ? (result.message || t().validationOk) : result.message;
    message.classList.toggle('bad', !result.valid);
  }
  const mark = holder.querySelector('.proof-mark');
  if (mark) mark.dataset.state = result.valid ? 'ready' : 'attention';
}

function updateProfileNotice() {
  const node = document.querySelector('[data-profile-notice]');
  if (node) node.textContent = state.profileNotice;
}

function profileCoverage() {
  if (!state.definition) return { found: 0, total: 0 };
  const found = state.definition.fields.filter((field) => {
    const value = getByPath(state.profile, field.profileKey);
    return value !== undefined && value !== null && value !== '';
  }).length;
  return { found, total: state.definition.fields.length };
}

function screenAllowed(screen) {
  if (screen === 'load') return true;
  if (!state.definition) return false;
  if (screen === 'profile') return true;
  if (!state.fill) return false;
  if (screen === 'fill') return true;
  if (screen === 'review') return Boolean(state.review);
  if (screen === 'print') return Boolean(state.review && state.review.complete);
  return false;
}

function go(screen) {
  if (!screenAllowed(screen)) return;
  state.screen = screen;
  if (screen === 'print') preparePrintPayload();
  render();
}

function preparePrintPayload() {
  if (!state.definition || !state.review || !state.review.complete) return false;
  state.printPayload = buildPrintPayload(state.definition, state.review, state.locale, new Date().toISOString());
  return true;
}

function currentReviewField() {
  if (!state.definition || !state.review) return null;
  return state.definition.fields[state.review.currentIndex] || state.definition.fields[0];
}

function inputHtml(field, value, context) {
  const text = t();
  const id = `${context}-${field.id}`;
  const labelId = `${id}-label`;
  if (field.type === 'select') {
    const options = (field.options || []).map((option) => `<option value="${esc(option.value)}"${option.value === value ? ' selected' : ''}>${esc(resolveText(option.label, state.locale))}</option>`).join('');
    return `<select id="${esc(id)}" aria-labelledby="${esc(labelId)}" data-${context}-input="${esc(field.id)}"><option value="">${esc(text.selectPlaceholder)}</option>${options}</select>`;
  }
  if (field.type === 'yesno') {
    return `<div class="yn-row" role="radiogroup" aria-labelledby="${esc(labelId)}">
      <label class="yn"><input type="radio" name="${esc(id)}" value="yes" data-${context}-input="${esc(field.id)}"${value === 'yes' ? ' checked' : ''}><span>${esc(text.yes)}</span></label>
      <label class="yn"><input type="radio" name="${esc(id)}" value="no" data-${context}-input="${esc(field.id)}"${value === 'no' ? ' checked' : ''}><span>${esc(text.no)}</span></label>
    </div>`;
  }
  const type = 'text';
  const mode = field.type === 'currency' ? ' inputmode="decimal"' : field.type === 'date' ? ' inputmode="numeric" placeholder="YYYY-MM-DD"' : '';
  const extra = field.type === 'signature' ? ' autocomplete="name" signature-input' : '';
  return `<input id="${esc(id)}" type="${type}"${mode}${extra} aria-labelledby="${esc(labelId)}" data-${context}-input="${esc(field.id)}" value="${esc(value)}">`;
}

function validationFor(field) {
  return state.fill?.results[field.id] || validateValue(field, state.fill?.values[field.id] ?? '', state.locale);
}

function fieldStatus(field) {
  const result = validationFor(field);
  if (!result.valid) return 'attention';
  if (state.fill.values[field.id] === '') return field.required ? 'attention' : 'pending';
  return 'ready';
}

function renderLoad() {
  const text = t();
  const def = state.definition;
  const audit = def ? auditReadingLevels(def, ['en', 'es'], PLAIN_LANGUAGE_THRESHOLD) : [];
  const flagged = audit.filter((item) => item.flagged);
  const shown = audit.filter((item) => item.locale === state.locale).slice(0, 8);
  return `<section class="screen-panel">
    <div class="screen-heading"><h1>${esc(text.loadTitle)}</h1></div>
    <div class="load-grid">
      <article class="panel sample-panel">
        <h2>${esc(text.samplePanelTitle)}</h2>
        <dl class="meta-list">
          <div><dt>ID</dt><dd>${esc(def?.id || '')}</dd></div>
          <div><dt>Version</dt><dd>${esc(def?.version || '')}</dd></div>
          <div><dt>${esc(text.fields)}</dt><dd>${esc(def?.fields.length || 0)}</dd></div>
          <div><dt>Source</dt><dd>${esc(state.definitionSource === 'sample' ? text.formSourceSample : text.formSourceCustom)}</dd></div>
        </dl>
        <p class="notice-text">${esc(def ? resolveText(def.meta.summary, state.locale) : '')}</p>
        <div class="button-row">
          <button class="button secondary" data-action="load-sample">${esc(text.reloadSample)}</button>
          <button class="button primary" data-action="go" data-screen="profile">${esc(text.steps.profile)}</button>
        </div>
      </article>
      <article class="panel">
        <h2>${esc(text.customPanelTitle)}</h2>
        <label class="file-picker">${esc(text.chooseFile)}<input type="file" accept="application/json,.json" data-action-file="form-json"></label>
        ${state.loadError ? `<div class="load-error" role="alert"><strong>${esc(text.formLoadError)}</strong><pre>${esc(state.loadError)}</pre></div>` : ''}
      </article>
    </div>
    <article class="panel audit-panel">
      <div class="audit-head">
        <h2>${esc(text.readingAudit)}</h2>
        <div class="audit-count"><strong>${esc(flagged.length)}</strong> ${esc(text.flaggedQuestions)}</div>
      </div>
      <p class="notice-text">${esc(text.validDefinition)}</p>
      <div class="audit-table" role="table" aria-label="${esc(text.readingAudit)}">
        <div class="audit-row audit-head-row" role="row">
          <span>${esc(text.steps.fill)}</span><span>${esc(text.originalGrade)}</span><span>${esc(text.rewriteGrade)}</span><span>${esc(text.suggestedRewrite)}</span>
        </div>
        ${shown.map((item) => {
          const field = def.fields.find((candidate) => candidate.id === item.fieldId);
          return `<div class="audit-row${item.flagged ? ' flagged' : ''}" role="row">
            <span>${esc(resolveText(field.label, state.locale))}</span>
            <span>${item.original.grade.toFixed(2)}</span>
            <span>${item.plain.grade.toFixed(2)}</span>
            <span>${item.flagged ? esc(item.suggestedRewrite || resolveText(field.plain, state.locale)) : esc(text.noRewriteNeeded)}</span>
          </div>`;
        }).join('')}
      </div>
    </article>
  </section>`;
}

function profileInputHtml(input) {
  const value = getByPath(state.profile, input.path);
  const id = `profile-${input.path.replaceAll('.', '-')}`;
  const label = state.locale === 'es' ? input.es : input.en;
  if (input.type === 'select') {
    return `<label class="profile-field" for="${esc(id)}"><span>${esc(label)}</span><select id="${esc(id)}" data-profile-input="${esc(input.path)}" data-profile-type="select"><option value="">${esc(t().selectPlaceholder)}</option>${input.options.map(([valueOption, en, es]) => `<option value="${esc(valueOption)}"${value === valueOption ? ' selected' : ''}>${esc(state.locale === 'es' ? es : en)}</option>`).join('')}</select></label>`;
  }
  if (input.type === 'yesno') {
    return `<fieldset class="profile-field yn-profile"><legend>${esc(label)}</legend><div class="yn-row">
      <label class="yn"><input type="radio" name="${esc(id)}" value="yes" data-profile-input="${esc(input.path)}" data-profile-type="yesno"${value === true || value === 'yes' ? ' checked' : ''}><span>${esc(t().yes)}</span></label>
      <label class="yn"><input type="radio" name="${esc(id)}" value="no" data-profile-input="${esc(input.path)}" data-profile-type="yesno"${value === false || value === 'no' ? ' checked' : ''}><span>${esc(t().no)}</span></label>
    </div></fieldset>`;
  }
  const type = input.type === 'date' ? 'date' : 'text';
  const mode = input.type === 'currency' ? ' inputmode="decimal"' : '';
  return `<label class="profile-field" for="${esc(id)}"><span>${esc(label)}</span><input id="${esc(id)}" type="${type}"${mode} data-profile-input="${esc(input.path)}" data-profile-type="${esc(input.type)}" value="${esc(value ?? '')}"></label>`;
}

function renderProfile() {
  const text = t();
  const coverage = profileCoverage();
  const ratio = coverage.total ? coverage.found / coverage.total : 0;
  return `<section class="screen-panel">
    <div class="screen-heading"><h1>${esc(text.profileTitle)}</h1></div>
    <div class="notice-band"><span>${esc(text.profileIntro)}</span><strong>${esc(text.localOnly)}</strong></div>
    <article class="panel">
      <div class="coverage-head">
        <h2>${esc(text.coverage)}</h2>
        <span>${coverage.found} / ${coverage.total} ${esc(text.coverageReady)}</span>
      </div>
      <meter class="coverage-bar" min="0" max="1" value="${ratio}"><span>${Math.round(ratio * 100)}%</span></meter>
      <div class="profile-grid">${PROFILE_INPUTS.map(profileInputHtml).join('')}</div>
      <div class="button-row">
        <button class="button secondary" data-action="use-example-profile">${esc(text.useExample)}</button>
        <button class="button secondary" data-action="export-profile">${esc(text.exportProfile)}</button>
        <button class="button danger-quiet" data-action="clear-profile">${esc(text.clearProfile)}</button>
      </div>
      <p class="save-note" data-profile-notice>${esc(state.profileNotice)}</p>
    </article>
    <article class="panel">
      <h2>${esc(text.advancedProfile)}</h2>
      <textarea class="profile-json" data-profile-json spellcheck="false">${esc(JSON.stringify(state.profile, null, 2))}</textarea>
      <div class="button-row">
        <button class="button secondary" data-action="import-profile">${esc(text.importProfile)}</button>
        <button class="button primary" data-action="fill-from-profile">${esc(text.fillFromProfile)}</button>
      </div>
    </article>
  </section>`;
}

function renderFillField(field) {
  const value = state.fill.values[field.id] ?? '';
  const result = validationFor(field);
  const status = fieldStatus(field);
  const invalid = !result.valid;
  return `<article class="fill-field${invalid ? ' is-invalid' : ' is-valid'}" data-field-state="${esc(field.id)}">
    <div class="field-top">
      <div>
        <h3 id="fill-${esc(field.id)}-label">${esc(resolveText(field.label, state.locale))}</h3>
        <p class="plain-line">${esc(resolveText(field.plain, state.locale))}</p>
      </div>
      <span class="proof-mark" data-state="${status}" aria-label="${esc(t().status[invalid ? 'needs-attention' : 'pending'])}"></span>
    </div>
    ${inputHtml(field, value, 'fill')}
    <div class="field-footer">
      <p class="help-text">${esc(resolveText(field.help, state.locale))}</p>
      <p class="field-message${invalid ? ' bad' : ''}" aria-live="polite">${esc(invalid ? result.message : t().validationOk)}</p>
    </div>
  </article>`;
}

function renderFill() {
  const text = t();
  const sections = state.definition.sections.map((section) => ({
    section,
    fields: state.definition.fields.filter((field) => field.section === section.id),
  }));
  return `<section class="screen-panel">
    <div class="screen-heading"><h1>${esc(text.fillTitle)}</h1></div>
    <div class="notice-band"><span>${esc(text.fillIntro)}</span><strong>${state.fill.complete ? esc(text.ready) : `${state.fill.missing.length} ${esc(text.missing)}`}</strong></div>
    ${sections.map(({ section, fields }) => `<section class="fill-section">
      <h2>${esc(resolveText(section.label, state.locale))}</h2>
      <div class="fill-list">${fields.map(renderFillField).join('')}</div>
    </section>`).join('')}
    <div class="screen-actions">
      <button class="button secondary" data-action="refill">${esc(text.refill)}</button>
      <button class="button primary" data-action="start-review">${esc(text.startReview)}</button>
    </div>
  </section>`;
}

function reviewInputArea(field, entry) {
  return inputHtml(field, entry.answer, 'review');
}

function renderReview() {
  const text = t();
  const field = currentReviewField();
  const entry = state.review.entries[state.review.currentIndex];
  const progress = reviewProgress(state.review);
  const index = state.review.currentIndex;
  const validation = entry.validation || validateValue(field, entry.answer, state.locale);
  return `<section class="screen-panel">
    <div class="screen-heading"><h1>${esc(text.reviewTitle)}</h1></div>
    <div class="review-layout">
      <aside class="review-index" aria-label="${esc(text.reviewStatus)}">
        ${state.review.entries.map((candidate, candidateIndex) => {
          const candidateField = state.definition.fields.find((item) => item.id === candidate.id);
          return `<button class="review-dot ${esc(candidate.status)}${candidateIndex === index ? ' current' : ''}" data-action="review-jump" data-index="${candidateIndex}">
            <span class="proof-mark" data-state="${candidate.status}"></span><span>${esc(resolveText(candidateField.label, state.locale))}</span>
          </button>`;
        }).join('')}
      </aside>
      <article class="review-card">
        <div class="review-count">${index + 1} ${esc(text.reviewOf)} ${state.review.entries.length}</div>
        <h2 class="review-question">${esc(resolveText(field.plain, state.locale))}</h2>
        <div class="question-pair">
          <section>
            <h3>${esc(text.originalQuestion)}</h3>
            <p>${esc(resolveText(field.question, state.locale))}</p>
          </section>
          <section>
            <h3>${esc(text.whyWeAsk)}</h3>
            <p>${esc(resolveText(field.why, state.locale))}</p>
          </section>
        </div>
        <label class="answer-label" id="review-${esc(field.id)}-label">${esc(text.yourAnswer)}</label>
        ${reviewInputArea(field, entry)}
        <p class="help-text">${esc(resolveText(field.help, state.locale))}</p>
        <p class="field-message${validation.valid ? '' : ' bad'}" aria-live="polite">${esc(validation.valid ? t().validationOk : validation.message)}</p>
        <div class="review-actions">
          <button class="button secondary" data-action="review-back"${index === 0 ? ' disabled' : ''}>${esc(text.back)}</button>
          <button class="button secondary" data-action="review-first-open">${esc(text.jumpToFirstOpen)}</button>
          <button class="button primary" data-action="review-confirm">${esc(text.confirmAnswer)}</button>
        </div>
      </article>
    </div>
    <meter class="review-progress" aria-label="${esc(text.reviewStatus)}" min="0" max="1" value="${progress.ratio}">${Math.round(progress.ratio * 100)}%</meter>
    <div class="completion-panel${state.review.complete ? ' show' : ''}">
      <p>${esc(state.review.complete ? text.reviewComplete : text.reviewIncomplete)}</p>
      <button class="button primary" data-action="prepare-print"${state.review.complete ? '' : ' disabled'}>${esc(text.preparePrint)}</button>
    </div>
  </section>`;
}

function groupPrintRows(payload) {
  const groups = [];
  for (const row of payload.rows) {
    let group = groups.find((candidate) => candidate.section === row.section);
    if (!group) {
      group = { section: row.section, label: row.sectionLabel, rows: [] };
      groups.push(group);
    }
    group.rows.push(row);
  }
  return groups;
}

function renderPrintDocument(payload) {
  const text = t();
  const groups = groupPrintRows(payload);
  return `<div class="print-document">
    <section class="print-page filled-page">
      <header class="print-head">
        <div><h1>${esc(payload.title)}</h1><p>${esc(payload.notice)}</p></div>
        <div class="print-meta"><span>${esc(text.generatedAt)}</span><strong>${esc((payload.generatedAt || '').slice(0, 10))}</strong></div>
      </header>
      ${groups.map((group) => `<section class="print-section">
        <h2>${esc(group.label)}</h2>
        <table><tbody>
          ${group.rows.map((row) => `<tr class="${esc(row.type)}"><th>${esc(row.label)}</th><td>${esc(row.formattedAnswer)}</td></tr>`).join('')}
        </tbody></table>
      </section>`).join('')}
      <footer>${esc(payload.footer)}</footer>
    </section>
    <section class="print-page signing-page">
      <header class="print-head compact"><h1>${esc(text.signingCopy)}</h1></header>
      <ol class="signing-list">
        ${payload.signingSummary.map((item) => `<li><p class="legal-line">${esc(item.text)}</p><p class="plain-summary"><strong>${esc(text.signingPlain)}:</strong> ${esc(item.plain)}</p></li>`).join('')}
      </ol>
      <div class="signature-box">
        <span>${esc(payload.rows.find((row) => row.type === 'signature')?.formattedAnswer || '')}</span>
        <small>${esc(text.typedSignatureNote)}</small>
      </div>
      <footer>${esc(payload.footer)}</footer>
    </section>
  </div>`;
}

function renderPrint() {
  const text = t();
  if (!state.printPayload) preparePrintPayload();
  return `<section class="screen-panel print-screen">
    <div class="screen-heading no-print"><h1>${esc(text.printTitle)}</h1></div>
    <div class="notice-band no-print"><span>${esc(text.printHint)}</span><strong>${esc(text.localOnly)}</strong></div>
    <div class="screen-actions no-print">
      <button class="button secondary" data-action="download-print">${esc(text.downloadPayload)}</button>
      <button class="button primary" data-action="print-now">${esc(text.printNow)}</button>
    </div>
    <div class="print-preview">${state.printPayload ? renderPrintDocument(state.printPayload) : esc(text.printLocked)}</div>
  </section>`;
}

function renderRail() {
  if (!state.definition) return '';
  const entries = state.review?.entries || [];
  return `<aside class="context-rail">
    <section class="rail-panel">
      <h2>${esc(t().reviewStatus)}</h2>
      <div class="rail-list">
        ${state.definition.fields.map((field, index) => {
          const entry = entries.find((candidate) => candidate.id === field.id);
          const status = entry?.status || (validationFor(field).valid ? 'pending' : 'needs-attention');
          return `<button class="rail-item" data-action="rail-jump" data-index="${index}"><span class="proof-mark" data-state="${esc(status)}"></span><span>${esc(resolveText(field.printLabel, state.locale))}</span></button>`;
        }).join('')}
      </div>
    </section>
    <section class="rail-panel small-print">
      <h2>${esc(t().fictional)}</h2>
      <p>${esc(resolveText(state.definition.meta.fictionalNotice, state.locale))}</p>
    </section>
  </aside>`;
}

function updateRail() {
  const rail = document.querySelector('.context-rail');
  if (!rail || !state.definition) return;
  const template = document.createElement('template');
  template.innerHTML = renderRail().trim();
  rail.replaceWith(template.content.firstElementChild);
}

function render() {
  document.documentElement.lang = state.locale;
  document.body.dataset.screen = state.screen;
  if (!state.definition) {
    app.innerHTML = `<div class="boot-panel">${esc(state.loadError || 'Loading FormBridge')}</div>`;
    return;
  }
  const screens = { load: renderLoad, profile: renderProfile, fill: renderFill, review: renderReview, print: renderPrint };
  const text = t();
  app.innerHTML = `<header class="appbar">
    <div class="brand-wrap"><span class="brand-mark" aria-hidden="true"></span><div class="brand">FormBridge</div></div>
    <div class="app-actions">
      <span class="offline-pill" data-offline>${esc(state.offline === 'ready' ? text.offlineReady : state.offline === 'pending' ? text.offlinePending : text.offlineChecking)}</span>
      <button class="language-toggle" data-action="toggle-locale">${esc(text.languageButton)}</button>
    </div>
  </header>
  <div class="shell">
    <nav class="steps" aria-label="FormBridge steps">
      ${Object.entries(text.steps).map(([screen, label], index) => `<button class="step-button${state.screen === screen ? ' active' : ''}" data-action="go" data-screen="${esc(screen)}"${screenAllowed(screen) ? '' : ' disabled'}><span class="step-number">${index + 1}</span><span>${esc(label)}</span></button>`).join('')}
    </nav>
    <main class="screen" id="main">${screens[state.screen]()}</main>
    ${renderRail()}
  </div>`;
  updateStepStates();
}

function updateStepStates() {
  document.querySelectorAll('.step-button').forEach((button) => {
    button.disabled = !screenAllowed(button.dataset.screen);
    if (!screenAllowed(button.dataset.screen)) button.title = t().incompleteStep;
  });
}

function download(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function loadSample() {
  const response = await fetch('./forms/sample-school-enrollment.json');
  const text = await response.text();
  state.definition = loadFormDefinition(text);
  state.definitionSource = 'sample';
  state.definitionIssues = [];
  state.loadError = '';
  state.screen = 'load';
  recomputeFill();
  render();
}

async function loadCustomFile(file) {
  try {
    const text = await file.text();
    state.definition = loadFormDefinition(text);
    state.definitionSource = 'custom';
    state.definitionIssues = [];
    state.loadError = '';
    state.screen = 'load';
    recomputeFill();
  } catch (error) {
    state.loadError = error.issues ? error.issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n') : error.message;
  }
  render();
}

function profileValueFromInput(input) {
  const type = input.dataset.profileType;
  if (type === 'yesno') return input.value === 'yes';
  if (type === 'currency') {
    const number = Number(String(input.value).replace(/[$,\s]/g, ''));
    return Number.isFinite(number) && input.value !== '' ? number : input.value;
  }
  return input.value;
}

function handleProfileInput(input) {
  setByPath(state.profile, input.dataset.profileInput, profileValueFromInput(input));
  saveProfile();
}

function syncAdvancedProfile() {
  const box = document.querySelector('[data-profile-json]');
  if (box) box.value = JSON.stringify(state.profile, null, 2);
}

function confirmAllForDemo() {
  if (!state.definition || !state.review) return false;
  for (const entry of [...state.review.entries]) {
    const confirmed = confirmReviewEntry(state.definition, state.review, entry.id);
    state.review = confirmed.state;
  }
  return state.review.complete;
}

async function init() {
  try {
    const [formResponse, profileResponse] = await Promise.all([
      fetch('./forms/sample-school-enrollment.json'),
      fetch('./forms/example-household-profile.json'),
    ]);
    state.definition = loadFormDefinition(await formResponse.text());
    state.exampleProfile = await profileResponse.json();
    state.profile = loadSavedProfile() || clone(state.exampleProfile);
    recomputeFill();
    render();
  } catch (error) {
    state.loadError = error.message;
    app.innerHTML = `<div class="boot-panel">${esc(error.message)}</div>`;
  }
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js');
      state.offline = registration.active || registration.waiting || registration.installing ? 'ready' : 'pending';
    } catch {
      state.offline = 'pending';
    }
    const pill = document.querySelector('[data-offline]');
    if (pill) pill.textContent = state.offline === 'ready' ? t().offlineReady : t().offlinePending;
  } else {
    state.offline = 'pending';
  }
}

document.addEventListener('click', (event) => {
  const actionNode = event.target.closest('[data-action]');
  if (!actionNode) return;
  const action = actionNode.dataset.action;
  if (action === 'toggle-locale') {
    state.locale = state.locale === 'en' ? 'es' : 'en';
    localStorage.setItem(LOCALE_KEY, state.locale);
    if (state.definition && state.fill) {
      for (const field of state.definition.fields) {
        state.fill.results[field.id] = validateValue(field, state.fill.values[field.id], state.locale);
      }
      if (state.review) state.review.locale = state.locale;
      if (state.review?.complete) preparePrintPayload();
    }
    render();
  }
  if (action === 'go') go(actionNode.dataset.screen);
  if (action === 'load-sample') loadSample();
  if (action === 'use-example-profile') {
    state.profile = clone(state.exampleProfile);
    saveProfile();
    recomputeFill();
    render();
  }
  if (action === 'clear-profile') {
    state.profile = {};
    localStorage.removeItem(PROFILE_KEY);
    state.profileNotice = t().profileCleared;
    recomputeFill();
    render();
  }
  if (action === 'export-profile') download('formbridge-household-profile.json', JSON.stringify(state.profile, null, 2));
  if (action === 'import-profile') {
    const box = document.querySelector('[data-profile-json]');
    try {
      const parsed = JSON.parse(box.value);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('profile must be an object');
      state.profile = parsed;
      saveProfile();
      recomputeFill();
      render();
    } catch {
      state.profileNotice = t().profileBadJson;
      updateProfileNotice();
    }
  }
  if (action === 'fill-from-profile') {
    recomputeFill();
    go('fill');
  }
  if (action === 'refill') {
    recomputeFill();
    render();
  }
  if (action === 'start-review') {
    state.review = createReviewSession(state.definition, state.fill, state.locale);
    state.screen = 'review';
    render();
  }
  if (action === 'review-jump') {
    state.review.currentIndex = Number(actionNode.dataset.index);
    render();
  }
  if (action === 'rail-jump') {
    if (state.screen !== 'review') {
      state.screen = 'review';
    }
    if (state.review) state.review.currentIndex = Number(actionNode.dataset.index);
    render();
  }
  if (action === 'review-back') {
    state.review.currentIndex = Math.max(0, state.review.currentIndex - 1);
    render();
  }
  if (action === 'review-first-open') {
    const index = state.review.entries.findIndex((entry) => entry.status !== 'confirmed');
    state.review.currentIndex = index === -1 ? state.review.entries.length - 1 : index;
    render();
  }
  if (action === 'review-confirm') {
    const field = currentReviewField();
    const result = confirmReviewEntry(state.definition, state.review, field.id);
    state.review = result.state;
    if (state.review.complete) preparePrintPayload();
    render();
  }
  if (action === 'prepare-print') {
    if (preparePrintPayload()) go('print');
  }
  if (action === 'download-print' && state.printPayload) {
    download('formbridge-print-payload.json', JSON.stringify(state.printPayload, null, 2));
  }
  if (action === 'print-now') {
    if (preparePrintPayload()) window.print();
  }
  if (action === 'reset-demo') {
    localStorage.removeItem(PROFILE_KEY);
    localStorage.removeItem(LOCALE_KEY);
    location.reload();
  }
});

document.addEventListener('input', (event) => {
  const input = event.target;
  if (!(input instanceof HTMLElement)) return;
  if (input.dataset.fillInput) {
    const field = state.definition.fields.find((candidate) => candidate.id === input.dataset.fillInput);
    if (field) setFillValue(field, input.value);
  }
  if (input.dataset.reviewInput) {
    const field = state.definition.fields.find((candidate) => candidate.id === input.dataset.reviewInput);
    if (field) {
      const result = editReviewEntry(state.definition, state.review, field.id, input.value);
      state.review = result.state;
      const message = document.querySelector('.review-card .field-message');
      if (message) {
        message.textContent = result.result.valid ? t().validationOk : result.result.message;
        message.classList.toggle('bad', !result.result.valid);
      }
      updateRail();
    }
  }
  if (input.dataset.profileInput) {
    handleProfileInput(input);
    syncAdvancedProfile();
  }
});

document.addEventListener('change', (event) => {
  const input = event.target;
  if (!(input instanceof HTMLElement)) return;
  if (input.matches('[data-action-file="form-json"]') && input.files?.length) {
    loadCustomFile(input.files[0]);
    return;
  }
  if (input.dataset.fillInput) {
    const field = state.definition.fields.find((candidate) => candidate.id === input.dataset.fillInput);
    if (field) setFillValue(field, input.value);
  }
  if (input.dataset.reviewInput) {
    const field = state.definition.fields.find((candidate) => candidate.id === input.dataset.reviewInput);
    if (field) {
      const result = editReviewEntry(state.definition, state.review, field.id, input.value);
      state.review = result.state;
      updateRail();
    }
  }
  if (input.dataset.profileInput) {
    handleProfileInput(input);
    syncAdvancedProfile();
  }
});

window.__formbridge = {
  state,
  go,
  render,
  confirmAllForDemo,
  preparePrintPayload,
  recomputeFill,
};

init();
