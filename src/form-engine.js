export const FIELD_TYPES = new Set(['text', 'date', 'currency', 'yesno', 'select', 'signature']);
export const PLAIN_LANGUAGE_THRESHOLD = 6;
export const LOCALES = ['en', 'es'];

export class FormDefinitionError extends Error {
  constructor(issues) {
    super(`Invalid form definition: ${issues.map((issue) => `${issue.path} ${issue.message}`).join('; ')}`);
    this.name = 'FormDefinitionError';
    this.issues = issues;
  }
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const empty = (value) => value === undefined || value === null || value === '';

function addIssue(issues, path, message) {
  issues.push({ path, message });
}

function checkTextMap(value, path, issues) {
  if (typeof value === 'string') {
    if (!value.trim()) addIssue(issues, path, 'must not be blank');
    return;
  }
  if (!isObject(value)) {
    addIssue(issues, path, 'must be a string or an object with en and es text');
    return;
  }
  for (const locale of LOCALES) {
    if (typeof value[locale] !== 'string' || !value[locale].trim()) {
      addIssue(issues, `${path}.${locale}`, 'is required');
    }
  }
}

export function resolveText(value, locale = 'en', fallback = 'en') {
  if (typeof value === 'string') return value;
  if (!isObject(value)) return '';
  if (typeof value[locale] === 'string' && value[locale].trim()) return value[locale];
  if (typeof value[fallback] === 'string' && value[fallback].trim()) return value[fallback];
  for (const key of Object.keys(value)) {
    if (typeof value[key] === 'string' && value[key].trim()) return value[key];
  }
  return '';
}

function validDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function validProfileKey(value) {
  return /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)*$/.test(value);
}

export function validateDefinition(def) {
  const issues = [];
  if (!isObject(def)) {
    return [{ path: '$', message: 'must be an object' }];
  }
  if (typeof def.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(def.id)) {
    addIssue(issues, 'id', 'must be a lowercase slug');
  }
  if (!Number.isInteger(def.version) || def.version < 1) {
    addIssue(issues, 'version', 'must be a positive integer');
  }
  if (!isObject(def.meta)) {
    addIssue(issues, 'meta', 'must be an object');
  } else {
    for (const key of ['title', 'summary', 'audience', 'fictionalNotice']) {
      checkTextMap(def.meta[key], `meta.${key}`, issues);
    }
  }
  checkTextMap(def.printFooter, 'printFooter', issues);

  if (!Array.isArray(def.sections) || def.sections.length === 0) {
    addIssue(issues, 'sections', 'must be a non-empty array');
  } else {
    const sectionIds = new Set();
    def.sections.forEach((section, index) => {
      const base = `sections[${index}]`;
      if (!isObject(section)) {
        addIssue(issues, base, 'must be an object');
        return;
      }
      if (typeof section.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(section.id)) {
        addIssue(issues, `${base}.id`, 'must be a lowercase slug');
      } else if (sectionIds.has(section.id)) {
        addIssue(issues, `${base}.id`, 'must be unique');
      } else {
        sectionIds.add(section.id);
      }
      checkTextMap(section.label, `${base}.label`, issues);
    });
  }

  if (!Array.isArray(def.fields) || def.fields.length === 0) {
    addIssue(issues, 'fields', 'must be a non-empty array');
  } else {
    const ids = new Set();
    const sectionIds = new Set((def.sections || []).map((section) => section && section.id));
    def.fields.forEach((field, index) => {
      const base = `fields[${index}]`;
      if (!isObject(field)) {
        addIssue(issues, base, 'must be an object');
        return;
      }
      if (typeof field.id !== 'string' || !/^[a-z][a-z0-9_]*$/.test(field.id)) {
        addIssue(issues, `${base}.id`, 'must use lowercase letters, digits and underscores');
      } else if (ids.has(field.id)) {
        addIssue(issues, `${base}.id`, 'must be unique');
      } else {
        ids.add(field.id);
      }
      if (!FIELD_TYPES.has(field.type)) {
        addIssue(issues, `${base}.type`, `must be one of ${[...FIELD_TYPES].join(', ')}`);
      }
      if (typeof field.required !== 'boolean') {
        addIssue(issues, `${base}.required`, 'must be true or false');
      }
      if (typeof field.profileKey !== 'string' || !validProfileKey(field.profileKey)) {
        addIssue(issues, `${base}.profileKey`, 'must be a dotted object path');
      }
      if (!sectionIds.has(field.section)) {
        addIssue(issues, `${base}.section`, 'must name a section id');
      }
      for (const key of ['label', 'question', 'plain', 'why', 'help', 'printLabel']) {
        checkTextMap(field[key], `${base}.${key}`, issues);
      }
      if (field.type === 'select') {
        if (!Array.isArray(field.options) || field.options.length < 2) {
          addIssue(issues, `${base}.options`, 'must contain at least two options');
        } else {
          const values = new Set();
          field.options.forEach((option, optionIndex) => {
            const optionBase = `${base}.options[${optionIndex}]`;
            if (!isObject(option)) {
              addIssue(issues, optionBase, 'must be an object');
              return;
            }
            if (typeof option.value !== 'string' || !option.value.trim()) {
              addIssue(issues, `${optionBase}.value`, 'must be a non-empty string');
            } else if (values.has(option.value)) {
              addIssue(issues, `${optionBase}.value`, 'must be unique');
            } else {
              values.add(option.value);
            }
            checkTextMap(option.label, `${optionBase}.label`, issues);
          });
        }
      }
      if (field.type === 'text') {
        if (field.maxLength !== undefined && (!Number.isInteger(field.maxLength) || field.maxLength < 1)) {
          addIssue(issues, `${base}.maxLength`, 'must be a positive integer');
        }
        if (field.pattern !== undefined) {
          try {
            new RegExp(field.pattern);
          } catch {
            addIssue(issues, `${base}.pattern`, 'must be a valid regular expression');
          }
        }
      }
      if (field.type === 'date') {
        for (const key of ['min', 'max']) {
          if (field[key] !== undefined && (typeof field[key] !== 'string' || !validDateOnly(field[key]))) {
            addIssue(issues, `${base}.${key}`, 'must be a real YYYY-MM-DD date');
          }
        }
        if (field.min && field.max && validDateOnly(field.min) && validDateOnly(field.max) && field.min > field.max) {
          addIssue(issues, `${base}.min`, 'must not be after max');
        }
      }
      if (field.type === 'currency') {
        for (const key of ['min', 'max']) {
          if (field[key] !== undefined && typeof field[key] !== 'number') {
            addIssue(issues, `${base}.${key}`, 'must be a number');
          }
        }
        if (typeof field.min === 'number' && typeof field.max === 'number' && field.min > field.max) {
          addIssue(issues, `${base}.min`, 'must not be after max');
        }
      }
      if (field.type === 'signature' && field.minLength !== undefined && (!Number.isInteger(field.minLength) || field.minLength < 2)) {
        addIssue(issues, `${base}.minLength`, 'must be an integer of at least 2');
      }
    });
  }

  if (!Array.isArray(def.signingSummary) || def.signingSummary.length === 0) {
    addIssue(issues, 'signingSummary', 'must be a non-empty array');
  } else {
    def.signingSummary.forEach((item, index) => {
      const base = `signingSummary[${index}]`;
      if (!isObject(item)) {
        addIssue(issues, base, 'must be an object');
        return;
      }
      if (typeof item.id !== 'string' || !item.id.trim()) addIssue(issues, `${base}.id`, 'must be a non-empty string');
      checkTextMap(item.text, `${base}.text`, issues);
      checkTextMap(item.plain, `${base}.plain`, issues);
    });
  }
  return issues;
}

export function loadFormDefinition(input) {
  let parsed = input;
  if (typeof input === 'string') {
    try {
      parsed = JSON.parse(input);
    } catch (error) {
      throw new FormDefinitionError([{ path: '$', message: `is not valid JSON: ${error.message}` }]);
    }
  }
  const issues = validateDefinition(parsed);
  if (issues.length) throw new FormDefinitionError(issues);
  return parsed;
}

export function getByPath(object, path) {
  let current = object;
  for (const part of path.split('.')) {
    if (!isObject(current) || !(part in current)) return undefined;
    current = current[part];
  }
  return current;
}

function messageFor(field, code, locale, detail = {}) {
  const label = resolveText(field.label, locale);
  const messages = {
    required: {
      en: `${label} is required.`,
      es: `${label} es obligatorio.`,
    },
    textLong: {
      en: `${label} must be ${detail.maxLength} characters or fewer.`,
      es: `${label} debe tener ${detail.maxLength} caracteres o menos.`,
    },
    textPattern: {
      en: `Check ${label}. Use the format shown in the help text.`,
      es: `Revise ${label}. Use el formato que aparece en la ayuda.`,
    },
    dateFormat: {
      en: `Enter ${label} as YYYY-MM-DD.`,
      es: `Escriba ${label} como AAAA-MM-DD.`,
    },
    dateInvalid: {
      en: `${label} is not a real calendar date.`,
      es: `${label} no es una fecha real del calendario.`,
    },
    dateMin: {
      en: `${label} cannot be before ${detail.min}.`,
      es: `${label} no puede ser antes de ${detail.min}.`,
    },
    dateMax: {
      en: `${label} cannot be after ${detail.max}.`,
      es: `${label} no puede ser después de ${detail.max}.`,
    },
    currencyInvalid: {
      en: `Enter ${label} as a dollar amount, such as 1250.75.`,
      es: `Escriba ${label} como una cantidad en dólares, por ejemplo 1250.75.`,
    },
    currencyMin: {
      en: `${label} cannot be less than ${detail.min}.`,
      es: `${label} no puede ser menos que ${detail.min}.`,
    },
    currencyMax: {
      en: `${label} cannot be more than ${detail.max}.`,
      es: `${label} no puede ser más que ${detail.max}.`,
    },
    yesno: {
      en: `Choose yes or no for ${label}.`,
      es: `Elija sí o no para ${label}.`,
    },
    select: {
      en: `Choose one of the listed options for ${label}.`,
      es: `Elija una de las opciones de la lista para ${label}.`,
    },
    signature: {
      en: `Type the name that should appear on the signature line.`,
      es: `Escriba el nombre que debe aparecer en la línea de firma.`,
    },
  };
  const pair = messages[code] || messages.required;
  return pair[locale] || pair.en;
}

function invalid(field, code, locale, value, detail) {
  return { valid: false, code, message: messageFor(field, code, locale, detail), value };
}

export function validateValue(field, raw, locale = 'en') {
  const missing = empty(raw) || (typeof raw === 'string' && !raw.trim());
  if (missing) {
    if (field.required) return invalid(field, 'required', locale, raw);
    return { valid: true, code: 'ok', message: '', value: '' };
  }

  if (field.type === 'text') {
    const value = String(raw).trim();
    if (field.maxLength && value.length > field.maxLength) {
      return invalid(field, 'textLong', locale, value, { maxLength: field.maxLength });
    }
    if (field.pattern && !(new RegExp(field.pattern).test(value))) {
      return invalid(field, 'textPattern', locale, value);
    }
    return { valid: true, code: 'ok', message: '', value };
  }

  if (field.type === 'date') {
    const value = String(raw).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return invalid(field, 'dateFormat', locale, value);
    if (!validDateOnly(value)) return invalid(field, 'dateInvalid', locale, value);
    if (field.min && value < field.min) return invalid(field, 'dateMin', locale, value, { min: field.min });
    if (field.max && value > field.max) return invalid(field, 'dateMax', locale, value, { max: field.max });
    return { valid: true, code: 'ok', message: '', value };
  }

  if (field.type === 'currency') {
    const text = String(raw).trim().replace(/[$,\s]/g, '');
    if (!/^-?\d+(\.\d+)?$/.test(text)) return invalid(field, 'currencyInvalid', locale, raw);
    const value = Math.round(Number(text) * 100) / 100;
    if (typeof field.min === 'number' && value < field.min) return invalid(field, 'currencyMin', locale, value, { min: field.min });
    if (typeof field.max === 'number' && value > field.max) return invalid(field, 'currencyMax', locale, value, { max: field.max });
    return { valid: true, code: 'ok', message: '', value };
  }

  if (field.type === 'yesno') {
    if (raw === true) return { valid: true, code: 'ok', message: '', value: 'yes' };
    if (raw === false) return { valid: true, code: 'ok', message: '', value: 'no' };
    const text = String(raw).trim().toLowerCase();
    if (['yes', 'y', 'true', '1', 'si', 'sí'].includes(text)) return { valid: true, code: 'ok', message: '', value: 'yes' };
    if (['no', 'n', 'false', '0'].includes(text)) return { valid: true, code: 'ok', message: '', value: 'no' };
    return invalid(field, 'yesno', locale, raw);
  }

  if (field.type === 'select') {
    const value = String(raw).trim();
    if ((field.options || []).some((option) => option.value === value)) {
      return { valid: true, code: 'ok', message: '', value };
    }
    return invalid(field, 'select', locale, value);
  }

  if (field.type === 'signature') {
    const value = String(raw).trim();
    const minLength = field.minLength || 2;
    if (value.length < minLength || !/\p{L}/u.test(value)) {
      return invalid(field, 'signature', locale, value);
    }
    return { valid: true, code: 'ok', message: '', value };
  }

  return invalid(field, 'required', locale, raw);
}

const vowelGroups = /[aeiouyáéíóúü]+/g;
const syllableExceptions = new Map([
  ['created', 2], ['needed', 2], ['completed', 2], ['wanted', 2], ['decided', 2],
  ['families', 3], ['questions', 2], ['information', 4], ['school', 1], ['language', 2],
]);

export function countSyllables(word) {
  const normalized = String(word).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const letters = normalized.replace(/[^a-z]/g, '');
  if (!letters) return 0;
  if (syllableExceptions.has(letters)) return syllableExceptions.get(letters);
  if (letters.length <= 3) return 1;
  let working = letters;
  const accentedFinal = /[áéíóú]$/i.test(String(word).trim());
  if (!accentedFinal && working.endsWith('e') && !working.endsWith('le') && working.length > 3) working = working.slice(0, -1);
  const groups = working.match(vowelGroups);
  return Math.max(1, groups ? groups.length : 1);
}

export function wordsIn(text) {
  return String(text).match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || [];
}

export function countSentences(text) {
  const pieces = String(text).split(/[.!?]+(?:\s|$)/).map((piece) => piece.trim()).filter(Boolean);
  return Math.max(1, pieces.length);
}

export function gradeReadingLevel(text, threshold = PLAIN_LANGUAGE_THRESHOLD) {
  const words = wordsIn(text);
  const syllables = words.reduce((sum, word) => sum + countSyllables(word), 0);
  const sentences = countSentences(text);
  const rawGrade = words.length ? (0.39 * (words.length / sentences)) + (11.8 * (syllables / words.length)) - 15.59 : 0;
  const grade = Math.round(rawGrade * 100) / 100;
  return {
    text: String(text),
    sentences,
    words: words.length,
    syllables,
    grade,
    threshold,
    overThreshold: grade > threshold,
  };
}

export function gradeQuestion(field, locale = 'en', threshold = PLAIN_LANGUAGE_THRESHOLD) {
  const originalText = resolveText(field.question, locale);
  const plainText = resolveText(field.plain, locale);
  const original = gradeReadingLevel(originalText, threshold);
  const plain = gradeReadingLevel(plainText, threshold);
  return {
    fieldId: field.id,
    locale,
    original,
    plain,
    flagged: original.overThreshold || plain.overThreshold,
    suggestedRewrite: original.overThreshold ? plainText : '',
    rewriteHelps: plain.grade < original.grade,
  };
}

export function auditReadingLevels(def, locales = LOCALES, threshold = PLAIN_LANGUAGE_THRESHOLD) {
  return def.fields.flatMap((field) => locales.map((locale) => gradeQuestion(field, locale, threshold)));
}

export function fillForm(def, profile) {
  const values = {};
  const results = {};
  const missing = [];
  const invalidIds = [];
  for (const field of def.fields) {
    const raw = getByPath(profile || {}, field.profileKey);
    const result = validateValue(field, raw, 'en');
    values[field.id] = result.valid ? result.value : (empty(raw) ? '' : raw);
    results[field.id] = result;
    if (field.required && (empty(raw) || (typeof raw === 'string' && !raw.trim()))) missing.push(field.id);
    if (!result.valid) invalidIds.push(field.id);
  }
  return {
    formId: def.id,
    values,
    results,
    missing,
    invalid: invalidIds,
    complete: missing.length === 0 && invalidIds.length === 0,
  };
}

const clone = (value) => JSON.parse(JSON.stringify(value));

function reviewStatusFor(result) {
  return result.valid ? 'pending' : 'needs-attention';
}

function computeReviewComplete(def, state) {
  return state.entries.every((entry) => {
    const field = def.fields.find((candidate) => candidate.id === entry.id);
    return field && entry.status === 'confirmed' && validateValue(field, entry.answer, state.locale).valid;
  });
}

function moveToNextOpen(state) {
  const index = state.entries.findIndex((entry) => entry.status !== 'confirmed');
  state.currentIndex = index === -1 ? state.entries.length - 1 : index;
}

export function createReviewSession(def, fillResult, locale = 'en') {
  const entries = def.fields.map((field) => {
    const result = fillResult.results[field.id] || validateValue(field, fillResult.values[field.id], locale);
    return {
      id: field.id,
      answer: fillResult.values[field.id] ?? '',
      status: reviewStatusFor(result),
      validation: result,
    };
  });
  const state = {
    formId: def.id,
    locale,
    currentIndex: 0,
    complete: false,
    entries,
  };
  state.complete = computeReviewComplete(def, state);
  return state;
}

export function getReviewEntry(state, id) {
  return state.entries.find((entry) => entry.id === id) || null;
}

export function editReviewEntry(def, inputState, id, rawValue) {
  const state = clone(inputState);
  const entry = getReviewEntry(state, id);
  const field = def.fields.find((candidate) => candidate.id === id);
  if (!entry || !field) throw new Error(`Unknown review field: ${id}`);
  const result = validateValue(field, rawValue, state.locale);
  entry.answer = result.valid ? result.value : rawValue;
  entry.validation = result;
  entry.status = result.valid ? 'edited' : 'needs-attention';
  state.currentIndex = state.entries.findIndex((candidate) => candidate.id === id);
  state.complete = computeReviewComplete(def, state);
  return { state, result };
}

export function confirmReviewEntry(def, inputState, id) {
  const state = clone(inputState);
  const entry = getReviewEntry(state, id);
  const field = def.fields.find((candidate) => candidate.id === id);
  if (!entry || !field) throw new Error(`Unknown review field: ${id}`);
  const result = validateValue(field, entry.answer, state.locale);
  entry.validation = result;
  if (!result.valid) {
    entry.status = 'needs-attention';
    state.complete = false;
    return { state, result, confirmed: false };
  }
  entry.answer = result.value;
  entry.status = 'confirmed';
  state.complete = computeReviewComplete(def, state);
  if (!state.complete) moveToNextOpen(state);
  return { state, result, confirmed: true };
}

export function reviewProgress(state) {
  const confirmed = state.entries.filter((entry) => entry.status === 'confirmed').length;
  const attention = state.entries.filter((entry) => entry.status === 'needs-attention').length;
  return {
    total: state.entries.length,
    confirmed,
    attention,
    remaining: state.entries.length - confirmed,
    ratio: state.entries.length ? confirmed / state.entries.length : 0,
  };
}

export function finishReview(def, inputState) {
  const state = clone(inputState);
  state.complete = computeReviewComplete(def, state);
  return state;
}

function optionLabel(field, value, locale) {
  const option = (field.options || []).find((candidate) => candidate.value === value);
  return option ? resolveText(option.label, locale) : value;
}

export function formatValue(field, value, locale = 'en') {
  if (empty(value)) return locale === 'es' ? 'Sin respuesta' : 'Not answered';
  if (field.type === 'date') {
    const [year, month, day] = String(value).split('-');
    return locale === 'es' ? `${day}/${month}/${year}` : `${month}/${day}/${year}`;
  }
  if (field.type === 'currency') {
    return new Intl.NumberFormat(locale === 'es' ? 'es-US' : 'en-US', { style: 'currency', currency: 'USD' }).format(Number(value));
  }
  if (field.type === 'yesno') {
    if (value === 'yes') return locale === 'es' ? 'Sí' : 'Yes';
    if (value === 'no') return 'No';
  }
  if (field.type === 'select') return optionLabel(field, value, locale);
  return String(value);
}

export function buildPrintPayload(def, state, locale = 'en', generatedAt = null) {
  const finished = finishReview(def, state);
  if (!finished.complete) throw new Error('Cannot print until every review item is confirmed and valid');
  const sections = new Map(def.sections.map((section) => [section.id, section]));
  return {
    formId: def.id,
    formVersion: def.version,
    locale,
    generatedAt,
    title: resolveText(def.meta.title, locale),
    notice: resolveText(def.meta.fictionalNotice, locale),
    footer: resolveText(def.printFooter, locale),
    rows: def.fields.map((field) => {
      const entry = getReviewEntry(finished, field.id);
      const section = sections.get(field.section);
      return {
        id: field.id,
        type: field.type,
        section: field.section,
        sectionLabel: resolveText(section.label, locale),
        label: resolveText(field.printLabel, locale),
        question: resolveText(field.question, locale),
        plainQuestion: resolveText(field.plain, locale),
        why: resolveText(field.why, locale),
        answer: entry.answer,
        formattedAnswer: formatValue(field, entry.answer, locale),
      };
    }),
    signingSummary: def.signingSummary.map((item) => ({
      id: item.id,
      text: resolveText(item.text, locale),
      plain: resolveText(item.plain, locale),
    })),
  };
}
