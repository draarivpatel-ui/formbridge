# FormBridge design system

## Concept

A proofreader's desk for bureaucracy. FormBridge treats a paper form as evidence to be checked, not as paperwork to be rushed through. The interface is a quiet civic workbench: original wording, plain language, household answers, review marks and printed output stay visible as parts of one accountable chain.

The product avoids a consumer-app mood. It should feel close to a careful clerk's desk: paper, ink, numbered steps, marginal proofing marks, thin rules and exact print output. The fictional status of the sample is visible rather than decorative.

## Color

| Token | Value | Use |
| --- | --- | --- |
| `--ink` | `#102a43` | Primary text, dark top bar |
| `--paper` | `#f8fbfc` | Main paper surface |
| `--panel` | `#e6eef4` | Navigation, context rail, secondary surfaces |
| `--line` | `#b9c9d4` | Rules and card borders |
| `--teal` | `#087f8c` | Primary action, active workflow step |
| `--teal-dark` | `#075f68` | Hover state for primary action |
| `--ochre` | `#b7791f` | Attention, reading-level flags, unconfirmed review state |
| `--soft` | `#52667a` | Secondary text |
| `--good` | `#237a57` | Confirmed proof mark and offline-ready state |
| `--bad` | `#a33b32` | Specific inline validation message |

No purple-blue gradient is used. The small repeating mark in the status rail is a functional proofing mark and is the detector's sole advisory false positive; it is not decorative stripe wallpaper.

## Typography

The interface uses the platform system sans stack, with dense readable sizes. Body text is 15 px or larger. Form questions use compact 18 to 21 px headings. Numerical coverage and progress values use tabular numerals. Print uses system serif for the filled form because it reads as paper output and system sans for explanations.

## Layout

Desktop is a three-column operate surface:

1. A fixed workflow column with numbered steps.
2. A central task column for the active form operation.
3. A right context rail carrying status, profile coverage, reading audit and proofing marks.

The rail is the signature element. Dashed marginal marks become solid as entries are reviewed, echoing a proofreader checking a document in the margin.

Print is not a scaled screenshot. The filled form and signing summary are separate paper-oriented documents inside the print workspace. A page break keeps the signing explanation on its own page.

## Motion and interaction

Motion is restrained. Panels and review cards transition over 180 to 260 ms with ease-out motion. Scrolling the long fill form is smooth only in normal motion settings. Reduced-motion users receive direct state changes without animated movement.

Validation is inline and specific. The interface never opens with a red error wall. Review confirmation changes one mark at a time.

## Language and accessibility

Every operational label, help string, validation message and print footer resolves through the same English or Spanish localization path. Buttons have visible labels. Focus states use a dark outline plus teal offset. Color is never the only signal: review states also use text and border style.

The reading-level audit is deliberately labeled as heuristic. It does not claim legal correctness or comprehension.

## Fictional-data honesty

The sample enrollment form, household profile and demonstration signature are fictional. Print output repeats that status and says to follow the issuing office's real instructions. This honesty is part of the design system, not a footnote added after the fact.
