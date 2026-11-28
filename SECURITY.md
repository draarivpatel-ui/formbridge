# Security policy

## Reporting a vulnerability

Use the private GitHub Security Advisory form at [Report a vulnerability](https://github.com/draarivpatel-ui/formbridge/security/advisories/new). Do not open a public issue, pull request or discussion with exploit details.

Never include a live secret, token, cookie, private key, victim hostname or proprietary payload in a report. Use synthetic values and redacted transcripts.

## Supported versions

| Version | Status |
| --- | --- |
| latest `main` | Supported |

Security fixes are applied to the latest state of the default branch.

## Scope

This policy covers the offline-capable FormBridge browser application, form-definition loading, household profile storage, validation and review flow, bilingual rendering, print output, the service worker and the local static server.

In scope:

- A cross-site scripting or HTML injection path through form definitions, household profile data, validation messages, review content, print output or imported JSON.
- A form-definition parser or validation flaw that accepts attacker-controlled data outside the documented schema and turns it into executable or misleading output.
- A local storage, print serialization or summary-generation flaw that exposes one household's answers in an unexpected context.
- A local server flaw such as path traversal, unintended exposure outside the documented loopback interface, or response header behavior that helps attacker-controlled content execute.
- A service worker or cache-control flaw that serves attacker-controlled application code across an update.

Out of scope:

- Legal, school, agency or benefits advice, and the fictional sample form content itself.
- Browser vulnerabilities, operating system compromise or physical access to the machine.
- Reading-level estimation limits, unless a report shows a specific validation or output integrity failure.

## Coordinated disclosure

- Acknowledgment: within 3 business days.
- Initial triage: within 14 calendar days.
- Fix or mitigation target: within 90 calendar days for confirmed reports.
- Coordinated public disclosure: up to 90 days by default, adjusted by mutual agreement when exploitation or user risk requires a different date.
