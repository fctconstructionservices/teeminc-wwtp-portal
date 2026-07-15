# FCTC Operations Board — Modular Refactor

Same system, same behavior, new architecture. Every function, API action, sheet name,
column header, and CSS rule was carried over 1:1 (machine-verified — see Verification).

## Structure

```
backend/                        Google Apps Script (flat .gs — GAS has no folders;
│                               numeric prefixes control top-level load order)
├── 00-Config.gs                SHEET_ID + per-request user email
├── 01-Schemas.gs               TABS + SCHEMAS (shared by runtime and installer)
├── 02-Api.gs                   doGet/doPost + API_ACTIONS router
├── 03-SheetUtils.gs            readAll_/appendRow_/updateRow_/nextId_/safeParse_
├── 04-AuthService.gs           loginUser, role helpers, activity log
├── 05-ProjectService.gs        home data, projects, project data, SOW CRUD
├── 06-DailyRecordService.gs    daily site records + lifecycle
├── 07-EstimateService.gs       estimates save/submit/approve + totals
├── 08-MaterialService.gs       materials catalog
├── 09-EquipmentService.gs      equipment catalog
├── 10-FinanceService.gs        cash advance/release/incoming/liquidation + finance dashboard
├── 11-ApprovalService.gs       approvals inbox + decideItem_ decision engine
├── 12-SearchService.gs         global search
├── 13-FileService.gs           Drive attachments + image uploads
└── 14-SheetSetup.gs            one-time installer + seed data

frontend/
├── index.html                  markup unchanged; only <link>/<script> paths updated
├── css/
│   ├── main.css                the ONLY stylesheet linked; @imports in cascade-safe order
│   ├── base/                   variables (design tokens), reset
│   ├── layout/                 shell, two-column
│   ├── components/             cards, tables, stamps, forms, charts, toast,
│   │                           dialogs, print-modal, utilities
│   └── pages/                  login, home, finance, search, project,
│                               project-sow, materials-equipment, approvals
└── js/
    ├── core/                   icons, app (routing/session/roles), auth (login),
    │                           ui (toast/confirm/lightbox), modals (print/detail)
    ├── services/               data-service.js — the only fetch() bridge to the backend
    ├── pages/                  home, approvals, finance, materials, equipment
    │   └── project/            project-core → project-daily → project-sow →
    │                           project-estimates (ONE ProjectPage object built
    │                           via Object.assign; load order matters)
    ├── features/               search, form-submissions
    └── init.js                 boot — must stay the last script
```

## Deploying the backend (Apps Script)

1. In the Apps Script editor, create one file per `backend/*.gs` (same names) and paste contents.
2. Delete the old `Code.gs` and `SheetSetup.gs` after the new files are in.
3. Deploy → Manage deployments → Edit → New version (keep the same deployment so the
   `/exec` URL — and `GAS_API_URL` in `js/services/data-service.js` — stays valid).
4. `setupSheets()` does NOT need to be re-run; the sheet is untouched by this refactor.

GAS note: file order only matters for top-level `const` initialization. The numeric
prefixes guarantee Config → Schemas load before everything that references them.

## Deploying the frontend (GitHub Pages)

Push the `frontend/` contents to the repo root (or your existing pages root):
`index.html`, `css/`, `js/`. Delete the old `css/style.css` and old flat `js/*.js` files.

## Adding a future module (the scalability recipe)

1. `backend/01-Schemas.gs` — add the sheet name + columns; run `setupSheets()` once.
2. `backend/NN-YourService.gs` — write the functions.
3. `backend/02-Api.gs` — register each action in `API_ACTIONS` (one line each).
4. `js/services/data-service.js` — add wrapper methods.
5. `js/pages/yourpage.js` + `css/pages/yourpage.css` (+ one `@import` in `main.css`,
   one `<script>` tag before `init.js`, and a `page-yourpage` section in index.html).

## Redundant code removed (verified zero references)

- `USER_DB` and `ROLE_LABELS` in the old `01-auth.js` — dead client-side account table;
  authentication has been fully server-side (Users sheet) since the DataService bridge.
  `handleLogin` now lives in `js/core/auth.js`.
- Stale "FIX:" changelog banners replaced with purpose-oriented English documentation.

## Pre-existing issues found (NOT changed — flagged for your decision)

1. **Daily record approvals**: the frontend calls `submitDailyRecordForApproval`,
   `approveDailyRecord`, `rejectDailyRecord` (and DataService also wraps
   `getPendingDailyRecords`), but these actions are not registered in `API_ACTIONS`,
   so the backend answers "Unknown action". The functions exist in
   `06-DailyRecordService.gs`; add four lines to `API_ACTIONS` to activate the flow.
2. **Estimate approval via inbox**: `decideItem_` calls `approveEstimates(id)` with one
   argument while the function expects `(projectId, sowId)` — approving an Estimate from
   the Approvals inbox will not find the group. Approving from the Project → Estimates
   tab works correctly (it passes both arguments).
3. `getPendingCashReleases` appears twice conceptually (also derivable from
   `getPendingApprovals`) — kept, as `loadReleaseDropdown` uses it directly.

## Verification performed

- Backend: all 75 functions present exactly once; `SHEET_ID`, `SCHEMAS`, `TABS`,
  `API_ACTIONS` declared once; concatenation of all `.gs` files parses as one program.
- Frontend JS: every split range is a verbatim copy of the original lines;
  uncovered lines were only old banner comments and boundary blanks;
  `node --check` passes on all 22 JS files.
- CSS: 459/459 flattened rules present; for every selector that appears more than
  once, the final winning rule is identical to the original cascade.
