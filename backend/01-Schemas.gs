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
    'clientId', 'location', 'startDate', 'endDate', 'contractValue', 'retentionPct', 'editorsJSON'],
  // v3 additions (appended):
  //   budgetMode   -> 'auto' (mat+labor+equip from approved estimate),
  //                   'indirect' (indirect costs only) or 'manual'
  //   predecessors -> comma-separated SOW IDs (Finish-to-Start) for the Gantt
  //   isMilestone  -> 'TRUE' for zero-duration milestone tasks
  //   baselineStart/baselineEnd -> snapshot saved via saveBaseline()
  // v8: sortOrder appended — display order of SOW items (Super Admin can
  // move items up/down). Blank = legacy row; falls back to sheet order.
  SOWItems: ['id', 'projectId', 'description', 'budget', 'actual', 'startDate', 'endDate', 'status', 'qty', 'unit',
    'budgetMode', 'predecessors', 'isMilestone', 'baselineStart', 'baselineEnd', 'sortOrder'],
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

  IncomingCashRequests: ['id', 'type', 'projectId', 'requestor', 'requestorEmail', 'amount', 'description',
    'paymentMethod', 'reference', 'transactionDate', 'attachmentsJSON', 'status', 'createdAt'],
  
  // v3 NEW: client directory for the Add Project form
  ClientLists: ['id', 'name', 'contactPerson', 'contactNumber', 'email', 'address', 'createdAt'],

  // v3 NEW: manpower role catalog (Option A — roles/trades, not individuals).
  // Same request -> Pending -> approved flow as Materials/Equipment.
  Manpower: ['id', 'code', 'role', 'classification', 'notes', 'status', 'requestedBy', 'createdAt'],

  // v8 NEW: Personnel directory — ACTUAL PEOPLE (names), separate from
  // the Manpower role catalog above. Roles feed the Estimates (planning);
  // Personnel are the real names used for actual site execution.
  // status: 'active' | 'inactive' (operational data, no multi-sig needed).
  Personnel: ['id', 'name', 'role', 'classification', 'contactNumber', 'dailyRate',
    'notes', 'status', 'addedBy', 'createdAt', 'updatedAt'],

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
  SafetyRecords: ['id', 'projectId', 'recordType', 'recordDate', 'description',
    'severity', 'personsInvolved', 'actionTaken', 'image', 'status',
    'reportedBy', 'createdAt', 'updatedAt'],

  // v9 NEW: DRAWING PLANS register — drawing files (PDF/image) uploaded
  // to Drive with revision control per project.
  Drawings: ['id', 'projectId', 'drawingNo', 'title', 'discipline', 'revision',
    'drawingDate', 'fileUrl', 'fileName', 'remarks', 'status',
    'uploadedBy', 'createdAt', 'updatedAt'],

  // v6 NEW: progress billings. gross = (currentPct − prevPct) × revised
  // contract; retention withheld; Paid creates an Approved IncomingCash.
  Billings: ['id', 'projectId', 'billingNo', 'period', 'prevPct', 'currentPct',
    'grossAmount', 'retentionAmount', 'netAmount', 'status', 'submittedBy', 'createdAt', 'paidAt'],

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