/**
 * 01-Schemas.gs — Sheet names and column definitions
 *
 * PURPOSE: Defines every sheet (tab) name and its exact column
 * headers. This is shared by BOTH the runtime API (readAll_,
 * appendRow_, etc. in 03-SheetUtils.gs) and the one-time installer
 * (14-SheetSetup.gs).
 *
 * WARNING: Column order here MUST match the physical order of the
 * header row in the Google Sheet. Never rename or reorder columns
 * without migrating existing data. To ADD a module in the future:
 * add a new entry to TABS + SCHEMAS, then run setupSheets() once —
 * existing sheets are left untouched.
 */

const TABS = {
  USERS: 'Users',
  PROJECTS: 'Projects',
  SOW_ITEMS: 'SOWItems',
  DAILY_RECORDS: 'DailyRecords',
  ESTIMATE_GROUPS: 'EstimateGroups',
  ESTIMATE_MATERIALS: 'EstimateMaterials',
  ESTIMATE_LABOR: 'EstimateLabor',
  ESTIMATE_EQUIPMENT: 'EstimateEquipment',
  ESTIMATE_INDIRECT: 'EstimateIndirect',
  MATERIALS: 'Materials',
  EQUIPMENT: 'Equipment',
  CASH_ADVANCE_REQUESTS: 'CashAdvanceRequests',
  CASH_RELEASE: 'CashRelease',
  LIQUIDATIONS: 'Liquidations',
  INCOMING_CASH_REQUESTS: 'IncomingCashRequests',
  APPROVALS: 'Approvals',
  ACTIVITY_LOG: 'ActivityLog',
  CLIENT_LISTS: 'ClientLists',
  MANPOWER: 'Manpower',
  PERSONNEL: 'Personnel',
  OT_REQUESTS: 'OTRequests',
  PUNCHLIST: 'Punchlist',
  SAFETY_RECORDS: 'SafetyRecords',
  DRAWINGS: 'Drawings',
  BILLINGS: 'Billings',
  TRANSFERS: 'Transfers',
  SESSIONS: 'Sessions',
  LOGIN_ATTEMPTS: 'LoginAttempts',
  LOGIN_ATTEMPTS: 'LoginAttempts',
  VARIATION_ORDERS: 'VariationOrders'
};

/**
 * SCHEMAS - Defines the column structure for each sheet
 */
const SCHEMAS = {
  // v7.0: passwordHash + passwordSalt replace plaintext 'password'.
  // The legacy column stays so existing rows still load; it is cleared
  // the first time a user logs in and their hash is stored.
  Users: ['email', 'name', 'password', 'role', 'roleLabel', 'passwordHash', 'passwordSalt'],
  // v3: clientId/location/startDate/endDate appended at the END so existing
  // rows keep their column positions. Run migrateSchemas() once after deploy.
  // v6: contractValue (client-facing contract sum, basis of billings) and
  // retentionPct (default 0.10) appended.
  // v6.6: editorsJSON — emails allowed to EDIT this project's content
  // (empty/absent = open to all, the pre-feature behavior). Approvals
  // stay role-based and are NOT affected by this list.
  Projects: ['id', 'name', 'status', 'revenue', 'expenses', 'cashPosition',
    'clientId', 'location', 'startDate', 'endDate', 'contractValue', 'retentionPct', 'editorsJSON',
    // v10: downpayment % of the contract. The advance is recouped from
    // every progress billing until it is fully worked off.
    'downpaymentPct', 'copiedFrom'],
  // v3 additions (appended):
  //   budgetMode   -> 'auto' (mat+labor+equip from approved estimate),
  //                   'indirect' (indirect costs only) or 'manual'
  //   predecessors -> comma-separated SOW IDs (Finish-to-Start) for the Gantt
  //   isMilestone  -> 'TRUE' for zero-duration milestone tasks
  //   baselineStart/baselineEnd -> snapshot saved via saveBaseline()
  // v8: sortOrder appended — display order of SOW items (Super Admin can
  // move items up/down). Blank = legacy row; falls back to sheet order.
  SOWItems: ['id', 'projectId', 'description', 'budget', 'actual', 'startDate', 'endDate', 'status', 'qty', 'unit',
    'budgetMode', 'predecessors', 'isMilestone', 'baselineStart', 'baselineEnd', 'sortOrder',
    // v11 BATCH H5: an explicit TITLE flag. A heading is normally derived
    // from the ids beneath it, but a title added before its children
    // exist has none — so it would be treated as a priced item and
    // demand an estimate it will never have.
    'isTitle'],
  // v6: materialsUsedJSON appended — consumption rows; site stock =
  // delivered − used, computed live in getProjectData.
  // v7.5: deletedAt/deletedBy implement SOFT DELETE. Deleting a draft used
  // to remove the row outright, which made an accidental click permanent
  // and unrecoverable without a spreadsheet backup. The row is now kept
  // and hidden, restorable by a Super Admin, and purged after 30 days.
  DailyRecords: ['id', 'projectId', 'date', 'weatherAM', 'weatherPM', 'status',
    'manpowerJSON', 'equipmentJSON', 'workAccomplishedJSON', 'materialsDeliveredJSON',
    'issuesJSON', 'visitorsJSON', 'photosJSON', 'createdBy', 'createdAt', 'materialsUsedJSON',
    'deletedAt', 'deletedBy'],
  // v3: submittedBy appended — who sent the estimate for approval,
  // so the Approve button can be hidden from the submitter.
  EstimateGroups: ['id', 'projectId', 'sowId', 'sowDescription', 'status', 'submittedBy'],
  // v5: unit appended — auto-filled from the selected material's unit
  EstimateMaterials: ['id', 'groupId', 'material', 'materialName', 'desc', 'qty', 'rate', 'cost', 'unit'],
  EstimateLabor: ['id', 'groupId', 'role', 'desc', 'qty', 'duration', 'rate', 'cost'],
  // v5: unit appended — auto-filled from the selected equipment's unit
  EstimateEquipment: ['id', 'groupId', 'equipment', 'equipName', 'desc', 'qty', 'duration', 'rate', 'cost', 'unit'],
  // v5: multiplier appended — indirect cost = direct total × multiplier
  // (VAT: (direct + non-VAT indirect) × multiplier, default 0.12). The
  // computed peso value is still persisted in 'amount' so every existing
  // total/rollup keeps working unchanged.
  EstimateIndirect: ['id', 'groupId', 'desc', 'type', 'amount', 'multiplier'],
  Materials: ['id', 'code', 'name', 'desc', 'category', 'subcategory', 'unit', 'rate', 'brand', 'supplier',
    'model', 'specs', 'grade', 'size', 'length', 'thickness', 'weight', 'standardCode', 'application',
    'image', 'docsJSON', 'notes', 'status', 'requestedBy', 'createdAt'],
  Equipment: ['id', 'code', 'name', 'desc', 'category', 'type', 'unit', 'rate', 'brand', 'supplier',
    'model', 'capacity', 'serial', 'powerSource', 'ownership', 'acquisitionDate', 'condition', 'manual',
    'image', 'docsJSON', 'notes', 'status', 'requestedBy', 'createdAt'],
  
  // NEW SHEETS
  // v3: sowId appended — links a cash advance to a specific SOW item so the
  // SOW "actual" column can be computed from Reviewed releases.
  CashAdvanceRequests: ['id', 'type', 'projectId', 'requestor', 'requestorEmail', 'amount', 'description', 'scope',
    'attachmentsJSON', 'payloadJSON', 'status', 'createdAt', 'dateNeeded', 'sowId'],
  
  CashRelease: ['id', 'originalRequestId', 'projectId', 'requestor', 'requestorEmail', 'amount', 'description', 'scope',
    'status', 'createdAt', 'releasedBy', 'releasedAt', 'reviewedByJSON', 'sowId'],
  
  Liquidations: ['id', 'cashAdvanceId', 'projectId', 'requestor', 'requestorEmail', 
    'amount', 'description', 'receiptNo', 'attachmentsJSON', 'status', 'createdAt', 'reviewedBy'],  

  // v10: sourceType makes the origin of the money EXPLICIT.
  // 'Client Collection' = traceable to a billing (downpayment or
  // progress) and therefore counts as Collected against the contract.
  // 'Funding' = owner capital, partner injections, loans — real cash,
  // but NOT a client collection. Portfolio "Collected" reads this field,
  // which is what stopped capital from inflating the collected figure.
  IncomingCashRequests: ['id', 'type', 'projectId', 'requestor', 'requestorEmail', 'amount', 'description',
    'paymentMethod', 'reference', 'transactionDate', 'attachmentsJSON', 'status', 'createdAt',
    'sourceType'],
  
  // v3 NEW: client directory for the Add Project form
  ClientLists: ['id', 'name', 'contactPerson', 'contactNumber', 'email', 'address', 'createdAt'],

  // v3 NEW: manpower role catalog (Option A — roles/trades, not individuals).
  // Same request -> Pending -> approved flow as Materials/Equipment.
  Manpower: ['id', 'code', 'role', 'classification', 'notes', 'status', 'requestedBy', 'createdAt'],

  // v8 NEW: Personnel directory — ACTUAL PEOPLE (names), separate from
  // the Manpower role catalog above. Roles feed the Estimates (planning);
  // Personnel are the real names used for actual site execution.
  // status: 'active' | 'inactive' (operational data, no multi-sig needed).
  // v11 BATCH H3: `image` appended — a personnel record without a face
  // is of limited use on site, where the point is recognising who is
  // being referred to.
  Personnel: ['id', 'name', 'role', 'classification', 'contactNumber', 'dailyRate',
    'notes', 'status', 'addedBy', 'createdAt', 'updatedAt', 'image'],

  // v9 NEW: OVERTIME authorization. OT time in/out on a Daily Site
  // Record stays LOCKED until an approved OTRequest exists for that
  // project + date. Multi-sig via the standard approval engine
  // (all admins approve, requester excluded, Super Admin force).
  OTRequests: ['id', 'projectId', 'otDate', 'otStart', 'otEnd', 'sowIdsJSON',
    'reason', 'status', 'requestedBy', 'createdAt', 'updatedAt'],

  // v9 NEW: PUNCHLIST — defects/for-correction items per project.
  // beforeImage = the finding; afterImage = proof of rectification.
  Punchlist: ['id', 'projectId', 'item', 'location', 'sowId', 'priority',
    'assignedTo', 'dueDate', 'status', 'beforeImage', 'afterImage',
    'remarks', 'raisedBy', 'closedBy', 'closedAt', 'createdAt', 'updatedAt'],

  // v9 NEW: SAFETY records — toolbox talks, inspections, incidents,
  // near-misses, violations per project.
  // v11 BATCH D: `attachmentsJSON` added. `image` is KEPT so existing
  // rows keep rendering — addSafetyRecord no longer writes it, and
  // attachmentsOf_() folds any legacy single image into the gallery, so
  // old and new records display identically with no migration.
  // ── v11 BATCH E: SETTINGS ──
  // A plain key/value store for system-wide configuration. The first
  // consumer is the print template (company letterhead, logo, signature
  // blocks) so every printed document carries FCTC's identity instead of
  // a bare browser page. Values are JSON strings, so a setting can grow
  // from a single field into an object without another schema change.
  Settings: ['key', 'value', 'updatedBy', 'updatedAt'],

  // ── v11 BATCH F1: LESSONS LEARNED ──
  // The knowledge that normally leaves with the site team. `source` is
  // 'auto' for a generated project retrospective or 'manual' for one
  // somebody wrote. The three JSON columns hold the computed metrics,
  // the findings and the suggestions, so the retrospective can grow new
  // fields without another schema change.
  // ── v11 BATCH G1: PROCUREMENT ──
  // Suppliers exist for one reason above all: `termsDays` is what sets
  // the due date on every payable. The free-text `supplier` column on
  // Materials and Equipment is left alone; `supplierId` links them over
  // time without a name-matching migration.
  Suppliers: ['id', 'name', 'contactPerson', 'contactNumber', 'email', 'address',
    'tin', 'termsDays', 'vatRegistered', 'pricesIncludeVat', 'category', 'notes',
    'status', 'createdBy', 'createdAt', 'updatedAt'],

  // Every purchase starts as a PR. `budgetState` and `budgetMessage` are
  // STORED, not recomputed on read: an approver must see the same
  // warning the requester saw, and a live recomputation would drift as
  // other requests land in between.
  PurchaseRequests: ['id', 'projectId', 'sowId', 'title', 'justification', 'route',
    'preferredSupplierId', 'dateNeeded', 'deliverTo', 'totalAmount',
    'budgetState', 'budgetMessage', 'status', 'requestor', 'requestorEmail',
    'approvalsJSON', 'cashAdvanceId', 'cancelReason', 'createdAt', 'updatedAt'],
  PRLines: ['id', 'prId', 'materialId', 'itemName', 'unit', 'qty', 'rate', 'amount',
    'qtyOrdered', 'qtyReceived', 'notes', 'sortOrder'],

  // ── v11 BATCH G2: PO · RECEIVING · PAYABLES ──
  // `overPrBy` records how far a PO exceeded its purchase request; a PO
  // over tolerance is HELD rather than issued, because issuing it and
  // asking forgiveness later is how the PR control quietly dies.
  PurchaseOrders: ['id', 'prId', 'projectId', 'sowId', 'supplierId',
    'grossAmount', 'netAmount', 'vatAmount', 'expectedDate', 'deliverTo', 'notes',
    'status', 'overPrBy', 'issuedBy', 'issuedAt', 'createdAt', 'updatedAt'],
  POLines: ['id', 'poId', 'prLineId', 'materialId', 'itemName', 'unit',
    'qty', 'rate', 'amount', 'qtyReceived', 'sortOrder'],

  // A receipt is a COST EVENT: saving one moves the SOW's actual cost,
  // CPI and the project's expenses. `netAmount` is what hits cost —
  // net of recoverable input VAT — while `grossAmount` is what the
  // supplier is actually owed.
  Receipts: ['id', 'poId', 'prId', 'projectId', 'sowId', 'supplierId',
    'receiptDate', 'deliveryRef', 'grossAmount', 'netAmount', 'vatAmount',
    'linesJSON', 'notes', 'status', 'receivedBy', 'createdAt', 'updatedAt'],

  // The debt. Kept separate from the receipt because goods routinely
  // arrive weeks before the invoice. `dueDate` runs from the DELIVERY
  // date, not the invoice date — otherwise a slow-invoicing supplier
  // quietly extends their own credit.
  SupplierInvoices: ['id', 'poId', 'prId', 'projectId', 'sowId', 'supplierId',
    'invoiceNo', 'invoiceDate', 'deliveryDate', 'dueDate',
    'grossAmount', 'netAmount', 'vatAmount', 'paidAmount',
    'receiptIdsJSON', 'paymentsJSON', 'notes', 'status', 'paidDate',
    'recordedBy', 'createdAt', 'updatedAt'],

  // ── v11 BATCH F2: QUOTATIONS ──
  // A quotation owns a Projects row with status 'Quotation' (see
  // 28-QuotationService.gs), so `projectId` is the id that row — and the
  // eventual awarded project — carries. Everything priced during
  // tendering is therefore already the project's on award; nothing is
  // copied. Revisions are SNAPSHOTS of the priced position, not forks.
  Quotations: ['id', 'projectId', 'clientId', 'clientName', 'title', 'status',
    'revision', 'quotedValue', 'validUntil', 'scopeNotes', 'exclusions',
    'preparedBy', 'sentDate', 'decisionDate', 'decisionNote',
    'createdAt', 'updatedAt'],
  QuotationRevisions: ['id', 'quotationId', 'revision', 'quotedValue', 'estimatedCost',
    'sowCount', 'snapshotJSON', 'note', 'createdBy', 'createdAt'],

  LessonsLearned: ['id', 'projectId', 'projectName', 'source', 'category', 'title',
    'whatHappened', 'rootCause', 'impact', 'recommendation',
    'metricsJSON', 'findingsJSON', 'suggestionsJSON',
    'capturedBy', 'capturedAt', 'updatedAt'],

  SafetyRecords: ['id', 'projectId', 'recordType', 'recordDate', 'description',
    'severity', 'personsInvolved', 'actionTaken', 'image', 'attachmentsJSON',
    'status', 'reportedBy', 'createdAt', 'updatedAt'],

  // v9 NEW: DRAWING PLANS register — drawing files (PDF/image) uploaded
  // to Drive with revision control per project.
  Drawings: ['id', 'projectId', 'drawingNo', 'title', 'discipline', 'revision',
    'drawingDate', 'fileUrl', 'fileName', 'remarks', 'status',
    'uploadedBy', 'createdAt', 'updatedAt'],

  // v6 NEW: progress billings. gross = (currentPct − prevPct) × revised
  // contract; retention withheld; Paid creates an Approved IncomingCash.
  // v10: billingType distinguishes a Downpayment (an advance at 0%
  // accomplishment) from a Progress billing; dpRecoupment is the slice
  // of the advance deducted from THIS billing.
  Billings: ['id', 'projectId', 'billingNo', 'period', 'prevPct', 'currentPct',
    'grossAmount', 'retentionAmount', 'netAmount', 'status', 'submittedBy', 'createdAt', 'paidAt',
    'billingType', 'dpRecoupment'],

  // v6 NEW: variation orders. Client-Approved VOs raise the affected SOW
  // budget and the revised contract value (computed live, non-destructive).
  VariationOrders: ['id', 'projectId', 'sowId', 'description', 'amount',
    'status', 'requestedBy', 'createdAt', 'decidedAt'],

  // v6.9 NEW: location-to-location transfers of materials/equipment.
  // fromLoc/toLoc hold either a projectId or the literal 'WAREHOUSE'
  // (a location, deliberately NOT a project — it must never appear in
  // project lists, Gantt, or finance). Approving a transfer moves stock
  // on BOTH sides at once, so the two halves can never drift apart.
  Transfers: ['id', 'fromLoc', 'toLoc', 'itemType', 'item', 'unit', 'qty',
    'reason', 'transferDate', 'status', 'requestedBy', 'createdAt', 'decidedBy', 'decidedAt'],

  // v7.0 NEW: server-issued session tokens. The browser sends a token,
  // never an identity — the server decides who you are by looking the
  // token up here. Sliding 8-hour expiry: lastSeen refreshes on every
  // authenticated call, so an active user is never interrupted and an
  // idle one is logged out.
  Sessions: ['token', 'email', 'createdAt', 'lastSeen', 'expiresAt', 'revoked', 'viewAs'],

  // v7.5: brute-force protection. One row per email, holding the running
  // count of consecutive failures and the time a lockout expires. Rows
  // are cleared on a successful login, so this stays small.
  LoginAttempts: ['email', 'failCount', 'lastFailAt', 'lockedUntil'],

  // v7.5: failed-login tracking. Without this, an attacker holding the
  // /exec URL can try passwords indefinitely at machine speed. Rows are
  // cleared on a successful login and swept periodically.
  LoginAttempts: ['email', 'failCount', 'firstFailAt', 'lastFailAt', 'lockedUntil'],

  Approvals: ['requestId', 'approver', 'decision', 'timestamp', 'remarks'],
  ActivityLog: ['timestamp', 'text', 'type', 'refId']
};