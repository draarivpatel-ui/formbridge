import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FormDefinitionError,
  PLAIN_LANGUAGE_THRESHOLD,
  auditReadingLevels,
  buildPrintPayload,
  confirmReviewEntry,
  countSentences,
  countSyllables,
  createReviewSession,
  editReviewEntry,
  fillForm,
  formatValue,
  gradeQuestion,
  gradeReadingLevel,
  loadFormDefinition,
  resolveText,
  reviewProgress,
  validateDefinition,
  validateValue,
  wordsIn,
} from '../src/form-engine.js';

const text = (en, es = `ES ${en}`) => ({ en, es });

function field(overrides = {}) {
  return {
    id: 'full_name',
    type: 'text',
    section: 'main',
    required: true,
    profileKey: 'person.name',
    maxLength: 20,
    label: text('Full name'),
    question: text('What is your full legal name?'),
    plain: text('What is your full name?'),
    why: text('The office matches this answer to your record.'),
    help: text('Use your legal name.'),
    printLabel: text('Name'),
    ...overrides,
  };
}

function definition(fields = [field()], overrides = {}) {
  return {
    id: 'test-form',
    version: 1,
    meta: {
      title: text('Test form'),
      summary: text('A test form'),
      audience: text('Test audience'),
      fictionalNotice: text('Fictional test form'),
    },
    printFooter: text('Test footer'),
    sections: [{ id: 'main', label: text('Main section') }],
    fields,
    signingSummary: [{ id: 'truth', text: text('I certify the answers.'), plain: text('I promise they are true.') }],
    ...overrides,
  };
}

function validationError(input) {
  try {
    loadFormDefinition(input);
    return null;
  } catch (error) {
    return error;
  }
}

const sampleDefinition = loadFormDefinition(readFileSync(new URL('../forms/sample-school-enrollment.json', import.meta.url), 'utf8'));
const sampleProfile = JSON.parse(readFileSync(new URL('../forms/example-household-profile.json', import.meta.url), 'utf8'));

test('sample school form definition loads with every field type represented', () => {
  assert.equal(sampleDefinition.id, 'sample-school-enrollment');
  assert.equal(sampleDefinition.fields.length, 14);
  assert.deepEqual(new Set(sampleDefinition.fields.map((item) => item.type)), new Set(['text', 'date', 'currency', 'yesno', 'select', 'signature']));
  assert.equal(validateDefinition(sampleDefinition).length, 0);
});

test('loader rejects a non-object definition', () => {
  const error = validationError([]);
  assert.ok(error instanceof FormDefinitionError);
  assert.equal(error.issues[0].path, '$');
});

test('loader rejects malformed JSON text', () => {
  const error = validationError('{"id":');
  assert.ok(error instanceof FormDefinitionError);
  assert.match(error.issues[0].message, /not valid JSON/);
});

test('loader rejects duplicate field ids', () => {
  const error = validationError(definition([field(), field()]));
  assert.ok(error.issues.some((issue) => issue.path === 'fields[1].id' && issue.message.includes('unique')));
});

test('loader rejects an unknown field type', () => {
  const error = validationError(definition([field({ type: 'number' })]));
  assert.ok(error.issues.some((issue) => issue.path === 'fields[0].type'));
});

test('loader rejects missing Spanish text', () => {
  const badField = field();
  badField.plain.es = '';
  const error = validationError(definition([badField]));
  assert.ok(error.issues.some((issue) => issue.path === 'fields[0].plain.es'));
});

test('loader rejects select fields with fewer than two options', () => {
  const selectField = field({ id: 'choice', type: 'select', options: [{ value: 'a', label: text('A') }] });
  const error = validationError(definition([selectField]));
  assert.ok(error.issues.some((issue) => issue.path === 'fields[0].options'));
});

test('loader rejects impossible date bounds', () => {
  const dateField = field({ id: 'signed_date', type: 'date', min: '2026-02-30' });
  const error = validationError(definition([dateField]));
  assert.ok(error.issues.some((issue) => issue.path === 'fields[0].min'));
});

test('loader rejects reversed currency bounds and bad regex patterns', () => {
  const badCurrency = field({ id: 'income', type: 'currency', min: 100, max: 20 });
  const badPattern = field({ id: 'patterned', pattern: '[' });
  const error = validationError(definition([badCurrency, badPattern]));
  assert.ok(error.issues.some((issue) => issue.path === 'fields[0].min'));
  assert.ok(error.issues.some((issue) => issue.path === 'fields[1].pattern'));
});

test('bilingual resolution uses requested locale when present', () => {
  assert.equal(resolveText({ en: 'Hello', es: 'Hola' }, 'es'), 'Hola');
});

test('bilingual resolution falls back to English and then first available text', () => {
  assert.equal(resolveText({ en: 'Hello', es: '' }, 'es'), 'Hello');
  assert.equal(resolveText({ fr: 'Bonjour' }, 'es'), 'Bonjour');
  assert.equal(resolveText('Plain string', 'es'), 'Plain string');
  assert.equal(resolveText(null, 'es'), '');
});

test('required text validation returns a specific bilingual message', () => {
  const result = validateValue(field(), '', 'es');
  assert.equal(result.valid, false);
  assert.equal(result.code, 'required');
  assert.equal(result.message, 'ES Full name es obligatorio.');
});

test('optional text may remain empty', () => {
  const result = validateValue(field({ required: false }), '');
  assert.equal(result.valid, true);
  assert.equal(result.value, '');
});

test('text max length and pattern validation are enforced', () => {
  const longResult = validateValue(field({ maxLength: 4 }), 'abcdef');
  assert.equal(longResult.valid, false);
  assert.equal(longResult.code, 'textLong');
  const patterned = field({ pattern: '^[0-9]{3}$' });
  assert.equal(validateValue(patterned, '123').valid, true);
  assert.equal(validateValue(patterned, '12A').code, 'textPattern');
});

test('date validation accepts real ISO dates and normalizes whitespace', () => {
  const dateField = field({ type: 'date', min: '2026-01-01', max: '2026-12-31' });
  const result = validateValue(dateField, ' 2026-11-20 ');
  assert.equal(result.valid, true);
  assert.equal(result.value, '2026-11-20');
});

test('date validation rejects bad shape, impossible dates and bounds', () => {
  const dateField = field({ type: 'date', min: '2026-01-01', max: '2026-12-31' });
  assert.equal(validateValue(dateField, '11/20/2026').code, 'dateFormat');
  assert.equal(validateValue(dateField, '2026-02-30').code, 'dateInvalid');
  assert.equal(validateValue(dateField, '2025-12-31').code, 'dateMin');
  assert.equal(validateValue(dateField, '2027-01-01').code, 'dateMax');
});

test('currency validation accepts dollar formatting and rounds cents', () => {
  const money = field({ type: 'currency', min: 0, max: 5000 });
  const result = validateValue(money, ' $1,250.755 ');
  assert.equal(result.valid, true);
  assert.equal(result.value, 1250.76);
});

test('currency validation rejects text, negative values and high values', () => {
  const money = field({ type: 'currency', min: 0, max: 5000 });
  assert.equal(validateValue(money, 'many dollars').code, 'currencyInvalid');
  assert.equal(validateValue(money, '-1').code, 'currencyMin');
  assert.equal(validateValue(money, '5001').code, 'currencyMax');
});

test('yesno validation normalizes booleans and bilingual strings', () => {
  const yesno = field({ type: 'yesno' });
  assert.equal(validateValue(yesno, true).value, 'yes');
  assert.equal(validateValue(yesno, false).value, 'no');
  assert.equal(validateValue(yesno, 'Sí').value, 'yes');
  assert.equal(validateValue(yesno, 'false').value, 'no');
});

test('yesno validation rejects ambiguous answers with a specific message', () => {
  const yesno = field({ type: 'yesno' });
  const result = validateValue(yesno, 'maybe', 'en');
  assert.equal(result.valid, false);
  assert.equal(result.message, 'Choose yes or no for Full name.');
});

test('select validation accepts only declared option values', () => {
  const select = field({ type: 'select', options: [{ value: 'a', label: text('A') }, { value: 'b', label: text('B') }] });
  assert.equal(validateValue(select, 'a').valid, true);
  assert.equal(validateValue(select, 'c').code, 'select');
});

test('signature validation requires letters and minimum length', () => {
  const signature = field({ type: 'signature', minLength: 5 });
  assert.equal(validateValue(signature, 'Ana Example').valid, true);
  assert.equal(validateValue(signature, '12345').code, 'signature');
  assert.equal(validateValue(signature, 'Ana').code, 'signature');
});

test('syllable heuristic matches known word cases', () => {
  assert.equal(countSyllables('school'), 1);
  assert.equal(countSyllables('student'), 2);
  assert.equal(countSyllables('information'), 4);
  assert.equal(countSyllables('created'), 2);
  assert.equal(countSyllables('language'), 2);
  assert.equal(countSyllables(' café '), 2);
});

test('word and sentence counting is deterministic', () => {
  assert.deepEqual(wordsIn('One two three.'), ['One', 'two', 'three']);
  assert.equal(countSentences('One. Two! Three?'), 3);
  assert.equal(countSentences('No terminal punctuation'), 1);
});

test('reading grader matches a known simple sentence case', () => {
  const result = gradeReadingLevel('What is your name?');
  assert.equal(result.words, 4);
  assert.equal(result.syllables, 4);
  assert.equal(result.sentences, 1);
  assert.equal(result.grade, -2.23);
  assert.equal(result.overThreshold, false);
});

test('reading grader matches a known pangram case', () => {
  const result = gradeReadingLevel('The quick brown fox jumps over the lazy dog.');
  assert.equal(result.words, 9);
  assert.equal(result.syllables, 11);
  assert.equal(result.grade, 2.34);
});

test('reading grader flags a bureaucratic sentence over the threshold', () => {
  const result = gradeReadingLevel('Provide all applicable documentation verifying household composition, residency status, annual income, and authorization for institutional record verification.');
  assert.equal(result.overThreshold, true);
  assert.ok(result.grade > PLAIN_LANGUAGE_THRESHOLD);
});

test('question grading suggests the supplied plain rewrite', () => {
  const item = gradeQuestion(field({
    question: text('Provide the legal appellation exactly as represented on foundational documentation.'),
    plain: text('What is your legal name?'),
  }), 'en');
  assert.equal(item.flagged, true);
  assert.equal(item.suggestedRewrite, 'What is your legal name?');
  assert.equal(item.rewriteHelps, true);
});

test('reading audit is deterministic across repeated runs', () => {
  const first = auditReadingLevels(sampleDefinition, ['en']);
  const second = auditReadingLevels(sampleDefinition, ['en']);
  assert.deepEqual(first, second);
  assert.equal(first.length, sampleDefinition.fields.length);
  assert.ok(first.some((item) => item.flagged));
});

test('profile fill resolves nested profile values and normalizes types', () => {
  const fill = fillForm(sampleDefinition, sampleProfile);
  assert.equal(fill.values.student_first_name, 'Nadia');
  assert.equal(fill.values.receives_benefits, 'yes');
  assert.equal(fill.values.annual_income, 42000);
  assert.equal(fill.complete, true);
  assert.deepEqual(fill.missing, []);
});

test('profile fill reports missing required answers without throwing', () => {
  const fill = fillForm(sampleDefinition, {});
  assert.equal(fill.complete, false);
  assert.ok(fill.missing.includes('student_first_name'));
  assert.ok(fill.missing.includes('signature_name'));
  assert.equal(fill.values.student_first_name, '');
});

test('profile fill reports invalid profile values', () => {
  const badProfile = structuredClone(sampleProfile);
  badProfile.student.birthDate = 'not a date';
  const fill = fillForm(sampleDefinition, badProfile);
  assert.equal(fill.complete, false);
  assert.ok(fill.invalid.includes('student_birth_date'));
});

test('review session starts valid profile entries as pending', () => {
  const fill = fillForm(sampleDefinition, sampleProfile);
  const review = createReviewSession(sampleDefinition, fill, 'en');
  assert.equal(review.entries.length, sampleDefinition.fields.length);
  assert.equal(review.entries[0].status, 'pending');
  assert.equal(review.complete, false);
  assert.equal(review.currentIndex, 0);
});

test('review session starts invalid entries as needs-attention', () => {
  const fill = fillForm(sampleDefinition, {});
  const review = createReviewSession(sampleDefinition, fill, 'en');
  assert.equal(review.entries[0].status, 'needs-attention');
});

test('confirming a valid review entry advances to the next open item', () => {
  const fill = fillForm(sampleDefinition, sampleProfile);
  let review = createReviewSession(sampleDefinition, fill, 'en');
  const result = confirmReviewEntry(sampleDefinition, review, 'student_first_name');
  review = result.state;
  assert.equal(result.confirmed, true);
  assert.equal(review.entries[0].status, 'confirmed');
  assert.equal(review.currentIndex, 1);
});

test('editing a review entry to an invalid value blocks confirmation', () => {
  const fill = fillForm(sampleDefinition, sampleProfile);
  let review = createReviewSession(sampleDefinition, fill, 'en');
  const edited = editReviewEntry(sampleDefinition, review, 'student_birth_date', '2026-02-30');
  review = edited.state;
  assert.equal(edited.result.valid, false);
  assert.equal(review.entries.find((entry) => entry.id === 'student_birth_date').status, 'needs-attention');
  const confirmed = confirmReviewEntry(sampleDefinition, review, 'student_birth_date');
  assert.equal(confirmed.confirmed, false);
  assert.equal(confirmed.state.complete, false);
});

test('editing a review entry to a valid value marks it edited until confirmed', () => {
  const fill = fillForm(sampleDefinition, sampleProfile);
  let review = createReviewSession(sampleDefinition, fill, 'en');
  const edited = editReviewEntry(sampleDefinition, review, 'household_size', '5');
  review = edited.state;
  const entry = review.entries.find((candidate) => candidate.id === 'household_size');
  assert.equal(entry.status, 'edited');
  assert.equal(entry.answer, '5');
  const confirmed = confirmReviewEntry(sampleDefinition, review, 'household_size');
  assert.equal(confirmed.state.entries.find((candidate) => candidate.id === 'household_size').status, 'confirmed');
});

test('review progress counts confirmed and attention states', () => {
  const fill = fillForm(sampleDefinition, sampleProfile);
  let review = createReviewSession(sampleDefinition, fill, 'en');
  review = confirmReviewEntry(sampleDefinition, review, 'student_first_name').state;
  review = editReviewEntry(sampleDefinition, review, 'student_birth_date', 'bad').state;
  const progress = reviewProgress(review);
  assert.equal(progress.total, 14);
  assert.equal(progress.confirmed, 1);
  assert.equal(progress.attention, 1);
  assert.equal(progress.remaining, 13);
});

test('print payload cannot be built before review completion', () => {
  const fill = fillForm(sampleDefinition, sampleProfile);
  const review = createReviewSession(sampleDefinition, fill, 'en');
  assert.throws(() => buildPrintPayload(sampleDefinition, review, 'en'), /Cannot print/);
});

function completedSampleReview(locale = 'en') {
  const fill = fillForm(sampleDefinition, sampleProfile);
  let review = createReviewSession(sampleDefinition, fill, locale);
  for (const item of [...review.entries]) {
    review = confirmReviewEntry(sampleDefinition, review, item.id).state;
  }
  return review;
}

test('review completes only after every item is confirmed', () => {
  const review = completedSampleReview();
  assert.equal(review.complete, true);
  assert.ok(review.entries.every((entry) => entry.status === 'confirmed'));
  assert.equal(reviewProgress(review).remaining, 0);
});

test('print payload has the required shape and deterministic content', () => {
  const review = completedSampleReview();
  const payload = buildPrintPayload(sampleDefinition, review, 'en', '2026-11-20T12:00:00.000Z');
  assert.deepEqual(Object.keys(payload), ['formId', 'formVersion', 'locale', 'generatedAt', 'title', 'notice', 'footer', 'rows', 'signingSummary']);
  assert.equal(payload.formId, 'sample-school-enrollment');
  assert.equal(payload.generatedAt, '2026-11-20T12:00:00.000Z');
  assert.equal(payload.rows.length, 14);
  assert.equal(payload.signingSummary.length, 4);
  assert.deepEqual(Object.keys(payload.rows[0]), ['id', 'type', 'section', 'sectionLabel', 'label', 'question', 'plainQuestion', 'why', 'answer', 'formattedAnswer']);
});

test('print payload localizes labels, footer and formatted values', () => {
  const review = completedSampleReview('es');
  const payload = buildPrintPayload(sampleDefinition, review, 'es', '2026-11-20T12:00:00.000Z');
  assert.equal(payload.title, 'Formulario ficticio de inscripción escolar de ejemplo');
  assert.match(payload.footer, /No es asesoría legal/);
  assert.equal(payload.rows.find((row) => row.id === 'receives_benefits').formattedAnswer, 'Sí');
  assert.equal(payload.rows.find((row) => row.id === 'student_birth_date').formattedAnswer, '18/04/2011');
});

test('print payload formats select, currency and signature values', () => {
  const review = completedSampleReview();
  const payload = buildPrintPayload(sampleDefinition, review, 'en', '2026-11-20T12:00:00.000Z');
  assert.equal(payload.rows.find((row) => row.id === 'student_grade').formattedAnswer, 'Grade 9');
  assert.equal(payload.rows.find((row) => row.id === 'annual_income').formattedAnswer, '$42,000.00');
  assert.equal(payload.rows.find((row) => row.id === 'signature_name').formattedAnswer, 'María Example');
});

test('formatValue handles empty and yesno values in both locales', () => {
  const yesno = field({ type: 'yesno' });
  assert.equal(formatValue(yesno, 'yes', 'en'), 'Yes');
  assert.equal(formatValue(yesno, 'yes', 'es'), 'Sí');
  assert.equal(formatValue(yesno, '', 'es'), 'Sin respuesta');
});
