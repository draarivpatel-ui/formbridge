# FormBridge

FormBridge is an offline-capable, bilingual plain-language helper for filling paper school and benefit forms. It loads a JSON form definition, fills supported answers from a saved household profile, walks the family through a guided review, and prepares a clean printed copy plus a separate one-page summary of what the signature means.

**Live demo:** [https://aariv.me/formbridge/](https://aariv.me/formbridge/)

Built November 2026 for Code for Change. The bundled school enrollment form and household profile are fictional demonstration material. They are not accepted by any school, agency or benefits office.

## Run it

```sh
npm start
```

Open the exact local URL printed in the terminal, normally `http://127.0.0.1:4173/`. Node 22 or later is enough. There are no package dependencies to install.

The app is static. `index.html`, `styles.css`, `sw.js`, `favicon.svg`, `src/` and `forms/` can be copied to any static host. After the first successful visit, the service worker caches the application for offline use in the same browser. A browser that has never opened the page still needs one online visit first.

## Verify

```sh
npm test
npm run test:browser
npm run capture
```

- `npm test` runs deterministic `node --test` coverage over definition loading, malformed definitions, validators, bilingual resolution, profile fill, review transitions, reading grading and print payload shape.
- `npm run test:browser` drives headless Chrome through the real UI, including an invalid date, Spanish toggle, guided review and print preview.
- `npm run capture` writes three real 1440 by 900 PNG captures to `assets/`: fill, review and printed summary.

## What the sample demonstrates

1. Load the bundled fictional school enrollment definition or choose another JSON definition.
2. Edit the household profile once. It is stored only in `localStorage` in the same browser.
3. Fill the form from that profile. Inline validation gives one specific message at a time.
4. Review each answer with the original form wording, the plain-language rewrite, the reason the question is asked, and an editable answer.
5. Toggle the interface and print output between English and Spanish.
6. Print a clean filled copy and a separate signing-summary page.
7. Inspect the reading-level audit. It uses a deterministic syllable and word heuristic, flags questions above grade 6, and shows the supplied rewrite.

## Form definition format

A form definition is one JSON object. The loader rejects unknown field types, duplicate ids, missing English or Spanish text, malformed dates, invalid regular expressions, reversed numeric bounds, bad select options and missing signing-summary items.

```json
{
  "id": "sample-school-enrollment",
  "version": 1,
  "meta": {
    "title": { "en": "Form title", "es": "Título del formulario" },
    "summary": { "en": "Short honest summary", "es": "Resumen corto y honesto" },
    "audience": { "en": "Who this is for", "es": "Para quién es" },
    "fictionalNotice": { "en": "Fictional sample only.", "es": "Ejemplo ficticio solamente." }
  },
  "printFooter": { "en": "Print footer", "es": "Pie de impresión" },
  "sections": [
    { "id": "student", "label": { "en": "Student information", "es": "Información del estudiante" } }
  ],
  "fields": [
    {
      "id": "student_first_name",
      "type": "text",
      "section": "student",
      "required": true,
      "profileKey": "student.firstName",
      "maxLength": 40,
      "label": { "en": "Student legal first name", "es": "Primer nombre legal del estudiante" },
      "question": { "en": "Original form wording", "es": "Texto original del formulario" },
      "plain": { "en": "What is the student's legal first name?", "es": "¿Cuál es el primer nombre legal del estudiante?" },
      "why": { "en": "Why the office asks", "es": "Por qué pregunta la oficina" },
      "help": { "en": "Concrete answer help", "es": "Ayuda concreta para responder" },
      "printLabel": { "en": "Student first name", "es": "Primer nombre del estudiante" }
    }
  ],
  "signingSummary": [
    {
      "id": "truth",
      "text": { "en": "Legal or formal statement", "es": "Declaración legal o formal" },
      "plain": { "en": "Plain meaning", "es": "Significado sencillo" }
    }
  ]
}
```

### Field types and validation

| Type | Accepted value | Validation |
| --- | --- | --- |
| `text` | string | required, optional `maxLength`, optional regular expression `pattern` |
| `date` | `YYYY-MM-DD` string | real calendar date, optional `min`, optional `max` |
| `currency` | number or dollar-formatted string such as `1250.75` | numeric amount rounded to cents, optional `min`, optional `max` |
| `yesno` | boolean or yes/no text in English or Spanish | normalized to `yes` or `no` |
| `select` | one declared option value | value must match `options[].value` |
| `signature` | typed demonstration name | required length and at least one letter |

`profileKey` is a dotted path into the saved household profile, such as `student.firstName` or `household.annualIncome`. A missing profile value does not crash the fill. It becomes a missing answer that the fill and review screens mark for attention.

Every user-facing field string is either a plain string or an object with `en` and `es` strings. In this project the sample uses both languages everywhere. Select options use the same shape:

```json
"options": [
  { "value": "spanish", "label": { "en": "Spanish", "es": "Español" } }
]
```

## Reading-level heuristic

The grader counts sentences, words and approximate syllables, then applies a deterministic Flesch-Kincaid-style grade calculation. It is useful for catching bureaucratic wording such as long nested instructions. It is not a measure of legal meaning, translation quality, cultural fit or whether a person understands the question. Spanish scores are especially approximate because the formula was designed around English readability. The rewrite shown in the audit is the rewrite supplied by the form author, not machine-generated text.

## Privacy and honest limits

- The app has no backend and sends no household answers to a server.
- The saved household profile stays in browser `localStorage`. Clearing browser storage removes it.
- The service worker makes the static app available offline after the first visit. It is not a guarantee for a fresh device or a cleared browser cache.
- FormBridge does not determine eligibility, enrollment, benefits, legal status or whether a typed signature is acceptable.
- The printed copy is a preparation aid. The issuing office's real form, instructions and signature rules control what can be submitted.
- The sample income value is only a fictional demonstration value. Currency output uses United States dollar formatting such as `$42,000.00`.
- The app is not legal advice, benefits advice, school enrollment advice or translation certification.

## Project layout

```text
forms/                    fictional sample form and household profile
src/form-engine.js        shared deterministic form logic
src/app.js                browser application
src/ui-text.js            English and Spanish interface text
scripts/serve.mjs         dependency-free local static server
scripts/browser-check.mjs real headless-Chrome UI smoke test
scripts/capture-screenshots.mjs
assets/                   1440 by 900 demo captures
test/                     node:test deterministic tests
video/                    narration script, steps and rendered demo assets
```

## AI disclosure

AI coding assistants were used during development. Local voice synthesis was used for the demonstration narration. The form logic, validation cases, sample data, README and demonstration copy were checked against deterministic tests and real browser runs. The sample form and household are fictional.
