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
  MANPOWER: 'Manpower'
};

/**
 * SCHEMAS - Defines the column structure for each sheet
 */
const SCHEMAS = {
  Users: ['email', 'name', 'password', 'role', 'roleLabel'],
  // v3: clientId/location/startDate/endDate appended at the END so existing
  // rows keep their column positions. Run migrateSchemas() once after deploy.
  Projects: ['id', 'name', 'status', 'revenue', 'expenses', 'cashPosition',
    'clientId', 'location', 'startDate', 'endDate'],
  // v3 additions (appended):
  //   budgetMode   -> 'auto' (mat+labor+equip from approved estimate),
  //                   'indirect' (indirect costs only) or 'manual'
  //   predecessors -> comma-separated SOW IDs (Finish-to-Start) for the Gantt
  //   isMilestone  -> 'TRUE' for zero-duration milestone tasks
  //   baselineStart/baselineEnd -> snapshot saved via saveBaseline()
  SOWItems: ['id', 'projectId', 'description', 'budget', 'actual', 'startDate', 'endDate', 'status', 'qty', 'unit',
    'budgetMode', 'predecessors', 'isMilestone', 'baselineStart', 'baselineEnd'],
  DailyRecords: ['id', 'projectId', 'date', 'weatherAM', 'weatherPM', 'status',
    'manpowerJSON', 'equipmentJSON', 'workAccomplishedJSON', 'materialsDeliveredJSON',
    'issuesJSON', 'visitorsJSON', 'photosJSON', 'createdBy', 'createdAt'],
  // v3: submittedBy appended — who sent the estimate for approval,
  // so the Approve button can be hidden from the submitter.
  EstimateGroups: ['id', 'projectId', 'sowId', 'sowDescription', 'status', 'submittedBy'],
  EstimateMaterials: ['id', 'groupId', 'material', 'materialName', 'desc', 'qty', 'rate', 'cost'],
  EstimateLabor: ['id', 'groupId', 'role', 'desc', 'qty', 'duration', 'rate', 'cost'],
  EstimateEquipment: ['id', 'groupId', 'equipment', 'equipName', 'desc', 'qty', 'duration', 'rate', 'cost'],
  EstimateIndirect: ['id', 'groupId', 'desc', 'type', 'amount'],
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

  Approvals: ['requestId', 'approver', 'decision', 'timestamp', 'remarks'],
  ActivityLog: ['timestamp', 'text', 'type', 'refId']
};
