# FCTC Operations Board — v3 Deployment & Migration Notes

This build adds a Manpower database, a Client directory, per-SOW budget
modes, an MS Project-style CPM Gantt, and several approval-flow fixes on
top of the modular refactor. Read this before deploying.

---

## 1. Deploy the backend (Google Apps Script)

The `backend/` folder holds 17 `.gs` files (`00-Config.gs` … `16-ManpowerService.gs`).
Two files are NEW in v3: `15-ClientService.gs` and `16-ManpowerService.gs`.

1. Open the bound Apps Script project for your spreadsheet.
2. Paste **all** `.gs` files (create the two new ones). Keep the numeric
   filenames — load order doesn't matter for `.gs`, but the numbering keeps
   things readable.
3. **`SHEET_ID` in `00-Config.gs` must stay exactly as it is.** Do not change it.
4. Deploy: **Deploy → Manage deployments → (your deployment) → Edit →
   Version: New version → Deploy.** This keeps the same `/exec` URL, so the
   frontend's `GAS_API_URL` does not change.

## 2. Run the migration ONCE

v3 adds columns to existing sheets and two brand-new sheets. Run the migration
helper a single time after deploying:

1. In the Apps Script editor, select the function **`migrateSchemas`**.
2. Click **Run**. Authorize if prompted.
3. Check the execution log — each sheet reports `up to date`, `appended [...]`,
   or `created ...`.

`migrateSchemas()` is **idempotent and non-destructive**:

- It only **appends** missing columns at the END of a sheet; existing columns
  and all row data are never moved, renamed, or deleted.
- It **creates** `ClientLists` and `Manpower` if absent.
- If a sheet has a column the schema doesn't know, or the existing column order
  doesn't match the schema prefix, it **throws** instead of guessing — resolve
  that sheet by hand, then re-run.

Columns added by v3:

| Sheet | Appended columns |
|---|---|
| Projects | `clientId`, `location`, `startDate`, `endDate` |
| SOWItems | `budgetMode`, `predecessors`, `isMilestone`, `baselineStart`, `baselineEnd` |
| CashAdvanceRequests | `sowId` |
| CashRelease | `sowId` |
| EstimateGroups | `submittedBy` |
| **ClientLists** (new) | `id, name, contactPerson, contactNumber, email, address, createdAt` |
| **Manpower** (new) | `id, code, role, classification, notes, status, requestedBy, createdAt` |

## 3. Deploy the frontend (GitHub Pages)

Push the `frontend/` folder. New files this release:

- `js/pages/manpower.js` — Manpower database page
- `js/pages/project/project-gantt.js` — the new CPM Gantt (augments
  `ProjectPage` via `Object.assign`; **must load after `project-sow.js`**)
- `css/pages/gantt.css` — Gantt styling (imported after `project-sow.css`)

`index.html` already has the new `<script>`/section/nav entries and the
`main.css` `@import` in the right order — just deploy the whole folder.

---

## What's new in v3

**Manpower database** — a role/trade catalog (not individual workers),
mirroring Materials/Equipment: request → Pending → approved. Feeds the Daily
Site Report role dropdown, the estimate labor rows, and Gantt resources.
Reachable from the Home tiles and the Manpower page.

**Clients** — an "Add Client" mini-form lives inside the Add Project modal.
The project form now captures Client, Location, Start Date and End Date;
Status is fixed to `Ongoing` on creation and revenue/expenses stay computed
live from the cash sheets.

**Per-SOW budget modes** — each SOW item's budget can be `auto`
(materials + labor + equipment from its estimate), `indirect` (indirect costs
only), or `manual`. Auto/indirect recompute live and on estimate approval;
manual is never overwritten. Edit via the ✎ button on the Budget figure.

**MS Project-style Gantt** — budget-weighted total % complete, CPM scheduling
over Finish-to-Start predecessors with a red critical path, dependency link
arrows, per-bar progress fill from Daily Reports, Overdue/Behind/On-Track
health, milestones (◆), a today line, and baseline ghost bars (Save Baseline).
Dragging/resizing a bar now **persists** the new dates (the old chart only
simulated the move). Click a bar for a task modal with dates, milestone flag,
predecessors, float, and the resources pulled from its estimate.

**Approvals** — Incoming Cash requests now appear in the approvals inbox, and
Manpower role requests have their own section. Both count toward the badge.

---

## Bugs fixed in v3 (were broken before)

1. **Daily report photos never saved.** The frontend uploads photos and sends
   Drive URLs, but the backend base64-decoded everything and silently failed on
   URLs, so `photosJSON` was always empty. URLs are now stored directly; raw
   base64 (legacy path) is still decoded.

2. **Approving an estimate from the inbox did nothing.** `decideItem_` called
   `approveEstimates(id)` with one argument where `(projectId, sowId)` were
   expected, so it never found the group. It now resolves the `EstimateGroups`
   row by id first, bans self-approval (via `submittedBy`), and — on
   rejection — returns the estimate to `draft` so the creator can edit and
   resubmit. **(Behavior change: rejected estimates go back to draft.)**

3. **SOW breakdown modal always empty.** Its fallback filtered flat arrays by a
   `.sow` property the items never had. It's now passed `{ groups }` and matches
   by `sowId`.

4. **Estimate "Approve" button showed to the submitter.** Submitter detection
   read `p.requests`, which the backend never returned. `EstimateGroups` now
   carries `submittedBy`; the Approve button is approvers-only and hidden from
   the person who submitted it.

5. **Daily-record lifecycle actions returned "Unknown action."** `submitDaily…`,
   `approveDailyRecord`, `rejectDailyRecord`, `getPendingDailyRecords` existed
   but were never registered in the API router. They're registered now, plus a
   server-side one-record-per-date guard (rejected records don't block re-entry).

---

## Still open — needs your input

The final Approvals bullet from the original v3 request was cut off and never
specified. Only **Incoming Cash** was added to the approvals inbox as a result.
If you intended something else for that last item, let me know and I'll add it.
