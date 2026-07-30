FCTC OPERATIONS BOARD — v10
Nine bug-list items, implemented and verified against the dev branch
====================================================================

╔══════════════════════════════════════════════════════════════════╗
║  E2E VERIFIED IN A HEADLESS BROWSER (the real app, mocked backend) ║
╠══════════════════════════════════════════════════════════════════╣
║  emoji rendered in the DOM ............. none                     ║
║  attachment thumbnails ................. 3 cards, img + PDF       ║
║  attachment lightbox ................... opens                    ║
║  schedule grid ......................... 5 rows, 6 columns        ║
║  predecessor locks ..................... A.2, B.2 (correct)       ║
║  working-day math ...... Jun 1 + 8 days = Jun 9, Sundays skipped  ║
║  cycle guard ........................... blocks A.1 -> A.2 loop   ║
║  searchable picker .......... filters, highlights, grouped        ║
║  downpayment ledger .................... panel + DP recoup column ║
║  portfolio chart ....... indexAxis y, stacked, worst-first        ║
║  finance chart ......... indexAxis y, variance, worst-first       ║
║  Funding card + "collected from clients" wording ....... present  ║
║  page errors ........................... none                     ║
╚══════════════════════════════════════════════════════════════════╝


ITEM 1 — ATTACHMENTS VISIBLE IN EVERY MODAL
  ROOT CAUSE was deeper than a styling problem: the row carries
  `attachmentsJSON` (a STRING) while the modal tested `data.attachments`
  (an ARRAY). That condition was never true, so attachments were not
  merely ugly — they NEVER rendered at all.
  FIX: attachmentsOf_() in the backend parses attachmentsJSON and also
  picks up the single-image columns used elsewhere (image, beforeImage,
  afterImage, fileUrl, receiptUrl). New shared AttachmentGallery
  component renders images as thumbnails that open in a lightbox and
  non-images (PDF/DWG) as labelled cards; a dead link collapses to a
  caption instead of a broken-image box. Wired into the request detail
  modal (cash advance, release, incoming cash, liquidation, material,
  equipment, OT), punchlist, and safety. Pending-approval lists now
  carry parsed attachments too.

ITEM 2 — "COLLECTED" COUNTS CLIENT MONEY ONLY
  CONFIRMED BUG: collected summed EVERY approved IncomingCash row, and
  that sheet also holds owner capital, partner injections and loans.
  Capital was being reported as client collections, which is why
  Collected could exceed Billed and Uncollected went negative.
  FIX: a collection must be traceable to a billing. New `sourceType`
  column: 'Client Collection' (created only by marking a billing paid)
  vs 'Funding' (everything manually recorded). Legacy rows still resolve
  via paymentMethod or a PB-/DP- reference. Funding is reported in its
  own portfolio card — still counted in cash position, never in
  Collected.

ITEM 3 — DOWNPAYMENT WORKFLOW
  A downpayment is an ADVANCE against the contract, not extra income.
  Recorded as plain cash it breaks item 2 AND overcharges the client,
  who would pay the advance once and again inside each progress billing.
  IMPLEMENTED: Downpayment % in Contract Settings (Super Admin) ->
  "Record downpayment" creates DP-0001 at 0% accomplishment with NO
  retention -> normal multi-signature approval -> Mark paid posts a
  Client Collection. Every progress billing then deducts
  DP recoupment = DP% x its own gross, capped at the outstanding
  advance, shown as its own column in the register. The DP ledger
  (advance / recouped / outstanding + progress bar) is DERIVED, never
  stored, so it cannot drift. PB numbering is unaffected by the DP.

ITEM 4 — READABLE CHARTS
  Both charts were vertical, so project and SOW names rotated 45° and
  clipped, and the comparison needed mental arithmetic between two bar
  heights.
  Billed vs Collected: horizontal, with Collected drawn INSIDE the
  billed bar as a stack — the pale tail IS the receivable. Sorted by
  largest receivable first.
  Budget vs Actual: plots VARIANCE against the centre line — over-runs
  right in red, savings left in green — sorted worst-first. Tooltips
  still show budget, actual and percentage.
  Both remain Chart.js (indexAxis:'y'); no new library. Added
  .canvas-wrap.tall for the extra vertical room these need.

ITEM 5 — CASHFLOW & S-CURVE DATE BUG (you were right, two bugs)
  (a) The month window was min/max over the project dates, EVERY SOW
      date, and today. SOW bars usually start earlier, so they won the
      min() and editing the project start changed nothing on screen.
  (b) prependZero_ ALWAYS unshifted a point labelled with the project
      start, even when the first bucket was an earlier month, producing
      "Sep 1 (start), Jul 26, Aug 26 ..." — the backwards dates.
  (c) The weekly block parsed the raw cell with new Date() while the
      monthly path used fmtDate_(), so the two could differ by a day.
  FIX: the window is ANCHORED to the project start date (the field you
  actually edit); SOW dates are clamped into it, not allowed to redefine
  it. The zero point is prepended only when the start genuinely precedes
  the first bucket, otherwise the first bucket becomes the origin.
  Buckets are sorted before return. All dates go through one normalized
  parser.
  VERIFIED: 405 assertions — moving the start to Jun/Jul/Sep/Oct each
  moves the first bucket correctly, 400 randomized starts all produce
  strictly ascending axes, and a project with no dates still falls back
  to the SOW span.

ITEM 6 — TIMELINE: START, FINISH, DURATION, PREDECESSOR
  New editable schedule grid above the Gantt bars
  (js/pages/project/project-schedule.js):
   · Start / Days / Finish stay consistent — set a duration and the
     finish moves; set a finish and the duration recalculates.
   · Duration counts WORKING DAYS and skips Sundays.
   · Pick a predecessor and the start snaps to the first working day
     after that item finishes, and keeps following it; successors
     cascade automatically, so one delayed item re-plans the chain.
   · A dependent row shows a read-only start with a lock icon.
   · Circular dependencies are refused with a clear message.
   · "Recalculate chain" re-applies every link top-down.
   · Everything saves through updateSOWItem — the same call the
     draggable bars use — so PV, projected cashflow and progress all
     recompute from one source of truth.

ITEM 7 — PROFESSIONAL ICONS, NO EMOJI
  Counted 156 emoji across 43 distinct characters. Extended the existing
  Icon library with 24 new SVGs (trash, pencil, timer, transfer,
  warehouse, punchlist, safety, drawing, spreadsheet, arrowUp/Down,
  moon, restore, refresh, hourglass, check, folder, calendar, pin,
  megaphone, siren, eye, circleDot, settings) and replaced all of them.
  Typographic characters that are NOT emoji were deliberately kept
  (the arrow in "Category -> Subcategory", middots, dashes).
  Emoji rendered in the DOM: 0.

ITEM 8 — ALL NOTES IN ENGLISH
  36 user-facing strings rewritten, covering helper notes, empty states,
  validation messages and modal copy. Remaining Tagalog UI strings: 0.
  (Our chat stays Taglish; the product speaks English.)

ITEM 9 — SEARCHABLE ESTIMATE PICKERS
  New SearchSelect component replaces the three native <select> pickers
  in Estimates (Materials, Labor, Equipment). Matches on ANY part of the
  name, brand, ID, category or spec, in any word order — "rebar 12"
  finds "Deformed Rebar 12mm x 6m". Results are grouped by category with
  unit and DB rate on the right so you can confirm the item before
  committing; matches are highlighted. Keyboard-first: type, arrow,
  Enter, Escape. The committed value lives in a hidden input, so unit
  and rate still auto-fill and the save path is unchanged.


DEPLOYMENT
==========
BACKEND (7 files) — paste into Apps Script, then
Deploy > Manage deployments > Edit > NEW VERSION > Deploy:
    backend/01-Schemas.gs        (4 new columns)
    backend/02-Api.gs            (3 new actions)
    backend/05-ProjectService.gs (item 5 date fix + downpaymentPct)
    backend/10-FinanceService.gs (sourceType on manual incoming cash)
    backend/11-ApprovalService.gs(attachment parsing + type tagging)
    backend/17-BillingService.gs (downpayment + recoupment)
    backend/22-PortfolioService.gs (collected filter + funding split)

>>> RUN migrateSchemas() ONCE from the Apps Script editor. <<<
It adds four columns: Projects.downpaymentPct,
Billings.billingType, Billings.dpRecoupment,
IncomingCashRequests.sourceType.
Existing rows keep working — collections recorded before this update
are still recognised through their payment method or PB-/DP- reference.

FRONTEND — push to dev. New files:
    js/components/search-select.js
    js/pages/project/project-schedule.js
    css/components/attachments.css
    css/components/search-select.css
(css/bundle.css is regenerated; the GitHub Action rebuilds it on push.)

Hard refresh afterwards (Ctrl+Shift+R).


ONE THING I FOUND ALONG THE WAY
  css/pages/project-gantt.css was ORPHANED — present in the repo but
  never imported by main.css, so nothing in it ever applied. I moved
  the styles it needed into pages/gantt.css (which IS imported) and
  deleted the dead file. Worth knowing in case you had edited it and
  wondered why nothing changed.

SETTING UP A DOWNPAYMENT ON AN EXISTING PROJECT
  1. Billings tab > Contract Settings > set Downpayment % > Save.
  2. Press "Record downpayment" -> DP-0001 goes for approval.
  3. Approve, then Mark paid when the client's money lands.
  4. Generate progress billings as usual; the recoupment is automatic.
