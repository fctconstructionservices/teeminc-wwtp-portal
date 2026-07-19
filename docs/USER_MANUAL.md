# FCTC Construction Services
# Internal Operations Portal — User Manual

**Version 7.4** · For internal use

---

## Contents

1. [Getting Started](#1-getting-started)
2. [Understanding Your Role](#2-understanding-your-role)
3. [The Home Dashboard](#3-the-home-dashboard)
4. [Requesting Cash](#4-requesting-cash)
5. [Approving Requests](#5-approving-requests)
6. [Releasing and Liquidating Cash](#6-releasing-and-liquidating-cash)
7. [Recording Incoming Cash](#7-recording-incoming-cash)
8. [Working Inside a Project](#8-working-inside-a-project)
9. [The Daily Site Record](#9-the-daily-site-record)
10. [Estimates and the Contract Basis](#10-estimates-and-the-contract-basis)
11. [Progress Billings](#11-progress-billings)
12. [Variation Orders](#12-variation-orders)
13. [Site Materials and Transfers](#13-site-materials-and-transfers)
14. [Equipment](#14-equipment)
15. [Databases: Materials, Equipment, Manpower, Clients](#15-databases)
16. [The Portfolio Dashboard](#16-the-portfolio-dashboard)
17. [Super Admin Tasks](#17-super-admin-tasks)
18. [Troubleshooting](#18-troubleshooting)
19. [Quick Reference](#19-quick-reference)

---

# 1. Getting Started

## Logging in

1. Open the portal link in your browser.
2. Enter your **email** and **password**.
3. Click **Log In**.

You stay logged in for **8 hours of inactivity**. While you are actively using the system the session keeps renewing itself, so you will not be interrupted mid-task. If you leave it idle overnight, you will be asked to log in again the next morning.

> **If you see "Your session expired"** — this is normal after a long idle period. Log in again. If you had an unsaved form open, copy your work before dismissing the message.

## Forgot your password?

There is no self-service password reset yet. Contact the **Super Admin**, who can reset it for you.

## Changing your password

Not available in the app yet. Ask the Super Admin.

---

# 2. Understanding Your Role

Your role decides what you can see and do. Roles are set by the Super Admin.

| Role | Can do |
|---|---|
| **Request Only** | Submit cash advance requests and liquidations. Submit daily site records. View projects. |
| **Approver** | Everything above, plus approve or reject requests. |
| **Admin** | Everything above, plus release cash, generate billings, record client decisions on variation orders, and approve transfers. Admins are the required signatories on multi-signature approvals. |
| **Super Admin** | Everything. Plus: create and edit projects, set contract values, assign project editors, force-approve, and run backups. |

## Project editors

Separately from your role, the Super Admin can assign **who may edit each project**. If you are not assigned to a project, you can still *see* everything in it, but the buttons to add or change content are hidden — you will see a **View-only** notice at the top.

If no editors are assigned to a project, it is open to everyone. This is the default.

> **Note:** approvals are *not* affected by editor assignment. An admin can approve a billing for a project they are not assigned to edit.

---

# 3. The Home Dashboard

The home page has four areas:

**Projects** — cards for each project, filtered by Ongoing / Completed / All. Click a card to open the project. Small circular avatars on a card show who is assigned as editor.

**Finance Overview** — company-wide cash gauges. Click **Full Dashboard** for detail.

**Approval Queue** — everything waiting for *your* signature. Once you sign an item, it disappears from your queue even if other admins still need to sign.

**Recent Activity** — an audit trail of what happened across the system.

A number badge on the Approvals menu shows how many items are waiting for you.

---

# 4. Requesting Cash

**Who:** anyone. **Where:** Home → *Request Cash Advance*.

## Steps

1. Choose the **Request Type**:
   - General and Administrative
   - Project Overhead
   - Labor / Payroll
   - Equipment Rental
   - Materials Purchase
   - Reimbursement
2. Choose the **Project**. For non-project overhead, choose *General and Administrative Expenses (G&A)*.
3. Choose the **Scope of Work (SOW)** the money is for, if applicable.
4. Enter the **Amount** and a clear **Purpose**.
5. Set **Date Needed** (must be today or later).
6. Attach supporting documents if you have them (quotation, payroll sheet).
7. Click **Submit Request**.

## What happens next

Your request goes to **Pending** and appears in the approval queues of all admins except yourself. You cannot approve your own request.

Once **every admin** has approved it, the request becomes **Approved** and is ready for cash release. A single rejection stops it.

You can watch its status from the project's Finance section or the Approvals page.

---

# 5. Approving Requests

**Who:** Approver, Admin, Super Admin. **Where:** Approvals page, or the Approval Queue on Home.

## How multi-signature approval works

This is the most important rule in the system:

> **Every admin must approve before an item is finalised.** One rejection is enough to reject it. You cannot approve something you submitted yourself.

After you sign, the item leaves your queue but stays pending until the others sign. You will see *"Approved by you — awaiting other admins."*

## What goes through this flow

- Cash Advance Requests
- Incoming Cash
- Liquidations
- Materials, Equipment and Manpower database entries
- Daily Site Records
- Estimates
- Progress Billings

## Steps

1. Open **Approvals**.
2. Review the details. Click attachments to inspect them.
3. Click **Approve** or **Reject**.

## Force approve (Super Admin only)

The Super Admin sees a **Force Approve** button, which finalises an item without waiting for the other signatures. Use this only when someone is unavailable and the item is urgent. Every force approval is recorded in the activity log.

---

# 6. Releasing and Liquidating Cash

## Releasing cash (Admin)

**Where:** Home → *Release Cash*.

1. Select the approved cash advance being paid out.
2. Enter the amount released, the payment method and the reference number.
3. Attach proof of payment.
4. Submit.

The release goes to **For Review**. Another admin must review it — **you cannot review your own release.** Once reviewed, the amount counts as actual project cost.

## Liquidating (anyone who received cash)

**Where:** Home → *Liquidate*.

1. Select the release you are liquidating. Only your own advances appear.
2. Enter what was actually spent, item by item.
3. Attach receipts.
4. Submit for approval.

**If you spent less than you received:** the difference stays as your accountability until returned.

**If you spent more:** once the liquidation is approved, the system automatically creates a **Reimbursement** cash advance in your name for the excess, tied to the same project and SOW. You do not need to file it yourself.

A cash advance stops appearing in your liquidation list once approved liquidations cover the full amount.

---

# 7. Recording Incoming Cash

**Who:** Approver and above. **Where:** Home → *Record Incoming Cash*.

Use this for money received that is **not** a billing collection — capital infusion, refunds, other income.

1. Choose the project (or G&A).
2. Enter amount, payment method, reference and transaction date.
3. Attach proof.
4. Submit for approval.

> **Billing collections are different.** When you mark a progress billing as **Paid**, the system creates the incoming cash entry automatically. Do not enter it twice.

---

# 8. Working Inside a Project

Open a project from Home. You will see these tabs:

| Tab | What it is for |
|---|---|
| **Overview** | Snapshot, cashflow, earned value, cost breakdown |
| **SOW Budget** | The scope of work items and their internal budgets |
| **Timeline** | Gantt chart — schedule, dependencies, progress |
| **Daily Records** | Daily site reports |
| **Site Materials** | Material stock on site, and transfers |
| **Equipment** | Equipment on site, utilisation, downtime |
| **Estimates** | Cost estimates per SOW item |
| **Billings** | Progress billings to the client |
| **Variations** | Variation orders |
| **Photos** | Photo gallery |

## Reading the Overview

**Project Cashflow** — bars are actual money in and out; the dotted amber line is projected outflow derived from the Gantt schedule. Move a bar on the Timeline and the projection changes.

**Earned Value (EVM)** — three numbers that tell you whether the project is healthy:

- **PV (Planned Value)** — what you *planned* to have spent by now, based on the schedule.
- **EV (Earned Value)** — the *contract value of work actually completed*: % complete × approved estimate (plus approved variation orders).
- **AC (Actual Cost)** — what you *actually* spent (reviewed cash releases).

From these:

- **SPI = EV ÷ PV** — schedule performance. Below 1.00 means behind schedule.
- **CPI = EV ÷ AC** — cost performance. Below 1.00 means you are spending more than you are earning.

**Cost Breakdown** — where the money went, grouped by request type.

---

# 9. The Daily Site Record

**Who:** project editors. **Where:** Project → Daily Records → *+ Add Daily Site Record*.

This is the single most important routine in the system. Progress percentages, material stock, equipment utilisation and earned value all come from here.

## Sections

1. **Date and Weather** — one record per date per project.
2. **Manpower** — role and headcount. Roles come from the Manpower database.
3. **Equipment** — name, quantity, and **status**: Operational, Idle, Under Repair, Breakdown, Standby.
4. **Work Accomplished** — location, **SOW item**, description, **% complete**, and a photo. *This is what drives project progress.*
5. **Materials Delivered** — what arrived on site.
6. **Materials Used** — what was consumed. You can only select materials with stock remaining, and you cannot log more than remains.
7. **Issues / Delays** — description, cause, time lost, photo.
8. **Visitors** — name, company, purpose, time in and out.
9. **Photos** — general site photos.

## Percent complete

Enter the **cumulative** percentage for that SOW item, not the day's increment. If foundation was 45% yesterday and you did more today, enter the new total (say 52%).

The system takes the **latest report date** as the truth for each SOW item.

## Saving and submitting

- **Save Record (Draft)** — saved but not counted yet. You can still edit or delete it.
- **Submit** — sends it for approval. Once submitted it is frozen.

Drafts show three buttons: **Submit**, **Edit**, **Delete**. Only the creator can edit; the creator or Super Admin can delete.

> **Editing a draft:** existing photos are kept. New uploads are added to them, not replacing them.

## On a phone

On a phone the form becomes **step-by-step** — one section at a time with large buttons and a progress bar at the top. Same data, easier to fill on site. Tap **Next** to advance; the **Save** button appears on the last step.

---

# 10. Estimates and the Contract Basis

**Who:** project editors. **Where:** Project → Estimates.

## Why estimates matter

Approved estimates are the **contract basis** — what the client is billed against. This is different from the SOW budget, which is your internal cost control.

> **Approved estimates = what the client pays for.**
> **SOW budget = what you plan to spend.**

Only **approved** estimates count toward the contract basis. Drafts do not affect anything, so you can edit freely without moving billing figures.

## Building an estimate

For each SOW item, enter line items in four groups:

- **Materials** — material, quantity, unit (auto), rate, cost
- **Labor** — role (from Manpower database), quantity, days, rate, cost
- **Equipment** — equipment, quantity, days, rate, cost
- **Indirect** — description, type, multiplier, cost

**Indirect costs** are computed from the direct costs using a multiplier. VAT is calculated last, on top of direct plus non-VAT indirect costs. The VAT rate defaults to 12% and is editable.

## Approval

Click **Submit for Approval** on a group. It goes through the same multi-signature flow. Once approved, the group is locked — it will not be overwritten by later saves.

---

# 11. Progress Billings

**Who:** Admin (Super Admin sets the contract value). **Where:** Project → Billings.

## Before you can bill

The system will block billing until:

1. **Every** non-milestone SOW item has an **approved, non-empty estimate**, and
2. **Every** non-milestone SOW item has a **budget greater than zero**.

If either is missing, you will see an amber banner telling you exactly which items to fix, and the Generate button will be hidden.

## One-time setup (Super Admin)

In the Billings tab, set:

- **Contract Value** — the signed contract amount
- **Retention %** — default 10%

## Generating a billing

1. Click **+ Generate from Progress**. The system uses the current contract-basis progress percentage.
2. It computes:
   - **Gross** = (current % − last billed %) × revised contract value
   - **Retention** = gross × retention %
   - **Net** = gross − retention
3. The billing is created as **Pending** and goes for multi-signature approval.

*Revised contract value = contract value + all client-approved variation orders.*

## The SWA (Statement of Work Accomplishment)

Click any **billing number** to open the SWA — the document you send to the client. It shows every SOW item with quantity, amount, weight, previous accomplishment, this period, and to-date figures, plus the summary (contract amount, VAT-exclusive amount, retention, amount due, VAT, total).

Click **Print** for an A4 landscape printout, and sign under Prepared by / Reviewed by / Noted by.

## When the client evaluates a different percentage

This happens often. The client reviews and approves, say, 68% when you billed 72%.

Click **Revise %** on the billing, enter the client-approved percentage. The system will:

- Mark the original billing as **Rejected** (kept for the audit trail)
- Create a new billing numbered `PB-000N-R` at the client's percentage
- Send it through approval again, since the amounts changed

## Marking as paid

When the client pays, click **Mark Paid**. The system automatically creates an **Approved Incoming Cash** entry for the net amount. Do not record the collection separately.

---

# 12. Variation Orders

**Who:** project editors to submit; Admin to record the client's decision. **Where:** Project → Variations.

A variation order is a change to the contract — additional or deducted scope.

## Submitting

1. Select the **affected SOW item**.
2. Write a clear **description**.
3. Enter the **amount**. Use a **negative** number for deductive variations.
4. Click **Submit for Client**.

The VO status becomes **For Client**.

## Recording the client's decision

When the client responds, an admin clicks **Client Approved** or **Rejected**.

On approval, the system automatically:

- Adds the amount to the affected SOW item's working budget
- Increases the revised contract value, which the Billings tab bills against

Nothing is double-encoded, and the underlying SOW row is never overwritten.

> Variation orders are subject to the same readiness gate as billings — the base contract must be complete first.

---

# 13. Site Materials and Transfers

**Where:** Project → Site Materials.

## Material balance

The table shows, per material:

**Delivered + Transfers In − Used − Transfers Out = Remaining**

Everything is derived from Daily Site Records and completed transfers. There is no separate inventory encoding.

Status indicators: **OK**, **Low** (20% or less remaining), **Out** (zero).

## Transfers

Use a transfer when materials or equipment move between locations. A location is either a **project** or the **Warehouse**.

Three directions are possible:

- Project → Project
- Project → Warehouse (surplus returned after a project ends)
- Warehouse → Project (issuing stock to a new project)

### Creating a transfer

1. Click **⇄ New Transfer**.
2. Choose **From** and **To**.
3. Choose **Material** or **Equipment**.
4. Pick the item — only items with stock at the source appear, with quantities shown.
5. Enter quantity (cannot exceed what is available), date, and reason.
6. Click **Submit for Approval**.

Either side's editor may request a transfer.

### Approving

One admin approves. On approval, stock is **decremented at the source and incremented at the destination in the same action**, so the two sides can never fall out of step.

> **Cost does not transfer.** It stays with the project that purchased the item.

## The Warehouse

Go to **Materials Database → 🏭 Warehouse** to see what the warehouse holds. Its contents come entirely from completed transfers.

**Check the warehouse before purchasing new stock.**

---

# 14. Equipment

**Where:** Project → Equipment.

All data comes from the equipment rows of Daily Site Records.

## What you see

- **Equipment on Site** — quantity, current status, days on site, operational days, utilisation
- **Downtime Log** — every Under Repair and Breakdown entry with remarks
- **Cost vs Usage** — rental cost per operational day, which shows which machines are expensive relative to actual use

## How presence is tracked

A unit's **first log entry is its check-in**. It stays on site until it is transferred out. This means a missed day of logging does **not** look like the machine left and came back.

If a unit has not been logged for three days or more, a **stale** warning appears. That is a signal that reporting was missed, not that the equipment is gone.

## Utilisation

**Utilisation = operational days ÷ days on site.**

Low utilisation on rented equipment means you are paying for idle time.

---

# 15. Databases

Materials, Equipment, Manpower and Clients are shared reference data used by estimates and daily reports.

## Adding an entry

**Where:** the relevant database page → *+ Add*.

1. Fill in the details (name, brand, specifications, unit, rate, category).
2. Submit. The entry goes to **pending**.
3. It becomes selectable in forms only after approval.

This keeps dropdown values consistent and analysable across every project.

## Clients

Clients must exist before a project can be linked to one. Add them under the Clients page.

---

# 16. The Portfolio Dashboard

**Where:** Home → *Portfolio View*.

This answers one question: **which project needs my attention today?**

## Needs Attention

A severity-ordered list. The most costly problem is always first. Items include:

- CPI below 0.90 — spending more than earning, with the peso gap shown
- SPI below 0.90 — behind schedule
- Billings unpaid for 30 days or more
- Estimates not approved, blocking billing
- SOW items without budgets
- No daily report for five days or more

Each row has a **View** button that takes you straight to the relevant tab.

## All Projects table

Every project side by side: progress, SPI, CPI, contract value, billed, collected, cash position, and a health verdict (On Track / Watch / At Risk / Setup).

Colour on the SPI and CPI chips carries the verdict — green is at or above 1.00, amber is 0.90 to 1.00, red is below 0.90.

---

# 17. Super Admin Tasks

## Creating a project

Home → **+ Add Project**. Provide ID, name, client, location, and dates. The client must already exist in the Clients database.

## Assigning project editors

Open the project. In the **Editors** row at the top, click **⚙ Manage Editors**, tick the users who may edit, and save.

Leaving all boxes unticked means the project is open to everyone.

## Setting the contract value

Project → Billings → **Contract Settings**. Enter the contract value and retention percentage.

> Keep this consistent with the sum of approved estimates plus approved variation orders. The system does not force them to match.

## View As (testing and support)

Menu → **👁 View As (test)**. Pick a user to see the system exactly as they do — useful for verifying permissions or investigating a report of "I can't see this."

An amber banner shows while you are impersonating. Click **Stop** to return.

> Every action performed while impersonating is logged as `real@email (as viewed@email)`. The audit trail never loses the real actor.

## Backups

A backup runs automatically each night and keeps 30 days of snapshots in a Drive folder.

To take one immediately, run `runBackupNow()` from the Apps Script editor.

## Resetting a password

In the Users sheet, clear the user's `passwordHash` and `passwordSalt` cells, and put a temporary password in the `password` column. On their next login it will be accepted and re-hashed automatically. Tell them to inform you so you can repeat the process if they want it changed again.

---

# 18. Troubleshooting

**"Session expired. Please log in again."**
Normal after 8 hours of inactivity. Log in again. Copy unsaved work first if a form is open.

**"View-only: you are not assigned as an editor of this project."**
Ask the Super Admin to add you as an editor of that project.

**"Cannot generate a billing — the contract basis is incomplete."**
Some SOW items lack approved estimates or budgets. The banner names them. Fix those first.

**"Materials Used exceeds site stock."**
You are trying to log more than remains. Check the Site Materials tab — the material may need a delivery or a transfer in.

**"There is already a record for [date]."**
One daily record per project per date. Edit the existing draft instead of creating a new one.

**"Self-approval is not allowed."**
You cannot approve your own submission. Another admin must sign.

**"The system is busy with another update."**
Two people saved at the same moment. Wait a few seconds and try again.

**A request I submitted is still pending.**
Every admin must sign. Check the Approvals page to see who has not yet signed.

**Progress percentage looks wrong.**
The system uses the **latest report date** for each SOW item. Check whether a later report has a lower percentage than an earlier one.

**Photos are not appearing.**
Only photos successfully uploaded to Drive appear. If the record was saved while offline or the upload failed, the photo will be missing. Re-edit the draft and attach it again.

---

# 19. Quick Reference

## Status meanings

| Status | Meaning |
|---|---|
| **Draft** | Saved but not submitted. Editable. |
| **Pending** | Waiting for signatures. |
| **Approved** | All required signatures collected. |
| **Rejected** | Declined, or superseded by a revision. |
| **For Review** | Cash release awaiting a second admin. |
| **Reviewed** | Release confirmed; counts as actual cost. |
| **For Client** | Variation order sent to the client. |
| **Client-Approved** | Client accepted the variation. |
| **Paid** | Billing collected. |
| **Completed** | Transfer executed; stock moved. |

## Daily routine for site staff

1. Open the project → Daily Records → **+ Add Daily Site Record**
2. Fill in every section that applies
3. Enter **cumulative** % complete for each SOW item worked on
4. Attach photos
5. **Save as draft**, review, then **Submit**

## Weekly routine for admins

1. Open **Portfolio View** — work through Needs Attention
2. Clear the **Approval Queue**
3. Review cash releases pending review
4. Check overdue billings and follow up with clients
5. Check the Warehouse before approving new material purchases

## Golden rules

1. **One daily record per project per date.**
2. **Percent complete is cumulative**, not the day's increment.
3. **Approved estimates are the contract basis** — approve them before billing.
4. **You cannot approve your own submission.**
5. **Every admin must sign** before an item is final.
6. **Mark Paid creates the incoming cash entry** — never record it twice.
7. **Check the Warehouse** before buying materials.

---

*Questions or problems not covered here should go to the Super Admin.*