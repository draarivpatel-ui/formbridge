# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Delegated by the implementation brief: static HTML, CSS and browser ES modules, with Node 22 used only for local serving, tests, capture and video tooling. No runtime package dependencies.

## Users

Inferred from the implementation brief because this is a subagent run: families completing school or benefit paper forms, especially households that read Spanish or need simpler English. A second audience is contest judges reviewing whether the tool is practical, honest and well crafted.

## Product Purpose

FormBridge turns a machine-readable paper-form definition into a guided, bilingual filling and review flow. It reuses one saved household profile, explains why each question is asked, flags difficult wording, and produces a clean printable copy plus a one-page signing summary. Success means a family can understand and correct answers before printing without sending private information to a server.

## Positioning

The mechanism is a local form-definition compiler: every question carries its original wording, a plain-language rewrite, a why-we-ask explanation, bilingual labels and validation rules, so the same JSON drives fill assistance, guided review, reading-level audit and print output.

## Operating Context

The app is a static offline-capable browser tool. It may be opened once from a hosted page and then reused where connectivity is unreliable. The sample form and household profile are fictional demonstration material. The product is not legal advice, benefits advice, school enrollment advice, or a substitute for the issuing agency's instructions.

## Capabilities and Constraints

Confirmed capabilities: JSON form definitions; text, date, currency, yes/no, select and signature fields; deterministic validation; English and Spanish labels; profile-based fill; guided review with editable fixes; plain-language reading-level grading; print payload generation; local-only storage.

Constraints: no backend, no account system, no external asset calls, no machine translation at runtime, no legal or eligibility determination, no real household data in the public demo. Reading level is a heuristic, not a measure of legal meaning or translation quality.

## Evidence on Hand

The brief supplies the product concept, contest deadline, required field types and demonstration workflow. It supplies no user research, agency partnership, pilot result, or real form data. Those absences must not be filled with invented claims.

## Product Principles

1. Keep private household information in the browser.
2. Show the original question and the plain-language rewrite together.
3. Validate one field at a time with a specific recovery message.
4. Treat print output as a first-class product surface.
5. Label fictional demonstration material and heuristic limits plainly.

## Accessibility & Inclusion

The interface must work with keyboard navigation, visible focus, high-contrast text, browser zoom, and English or Spanish UI text. Plain language is a product requirement, not a decorative concern.
