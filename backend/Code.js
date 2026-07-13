/**
 * Code.gs — FCTC Operations Board backend
 * 
 * PURPOSE: This file serves as the backend API for the FCTC Operations Board.
 * It handles all data operations including authentication, project management,
 * cash advance requests, approvals, materials/equipment management, and more.
 * 
 * ARCHITECTURE: Standalone Google Apps Script that connects to a Google Sheet
 * for data storage. The frontend (hosted on GitHub Pages) communicates with
 * this backend via fetch() calls to the deployed web app URL.
 * 
 * FIXES APPLIED:
 * - Fixed self-approval prevention (Issue 3.1)
 * - Fixed approval logic to require all approvers (Issue 3.7)
 * - Added proper role-based approval (Issue 3.2, 3.4)
 * - Added getMyApprovedRequests and getMyRejectedRequests (Issue 3.6)
 * - Daily Records approval system (Draft → Pending → Approved/Rejected)
 * - Photo upload to Drive and display in Photos tab
 * - SOW management: add, update, delete with Gantt integration
 * - FIX: Duplicate approval entries for non-cash requests (Bug #2)
 * - FIX: getProjectData no longer calls .map() on a single project object
 * - FIX: Added qty and unit fields to SOWItems
 * - FIX: Typo in logActivity for daily records
 * - FIX: getPendingApprovals() no longer double-lists non-cash requests
 * - FIX: Super Admin is EXCLUDED from normal approval requirements.
 *   Super Admin ONLY has Force Approve/Force Reject capabilities.
 * - FIX: Added forceReject() function for Super Admin override.
 * - FIX: Added support for Incoming Cash approval workflow.
 * 
 * NEW: Revenue, Expenses, and Cash Position are now DYNAMICALLY computed
 * from the data, not stored statically.
 *   • Project Revenue = total approved Incoming Cash for that project
 *   • Project Expenses = total approved "Release Cash" for that project
 *   • Cash Position = Revenue - Expenses
 *   • Finance dashboard KPIs reflect these totals across all projects.
 * 
 * NEW: Release Cash workflow
 *   • Only Super Admin can submit release requests
 *   • Status = "Reviewing" after submission
 *   • All Admins (non-superadmin) must review via "Reviewed" action
 *   • After all Admins review, status becomes "Released"
 */

const SHEET_ID = '1Z-1NtuiJ_BYfUD_9CGfccJmJT6hHmnunc5zbrHaMiDw';

// ============================================================
//  WEB APP ENTRY POINT
// ============================================================

let CURRENT_REQUEST_USER_EMAIL = '';

/**
 * doGet - Handles GET requests to the web app
 * PURPOSE: Provides a simple status response when accessed via browser
 */
function doGet(e) {
  return jsonResponse_({ status: 'FCTC Operations Board API is running. Use POST requests.' });
}

/**
 * doPost - Main entry point for all API calls from frontend
 * PURPOSE: Routes incoming requests to the appropriate handler function
 * 
 * @param {Object} e - The request event containing post data
 * @returns {Object} JSON response with success flag and data or error
 */
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    const params = body.params || [];
    CURRENT_REQUEST_USER_EMAIL = body.userEmail || '';

    const fn = API_ACTIONS[action];
    if (!fn) throw new Error('Unknown action: ' + action);

    const result = fn.apply(null, params);
    return jsonResponse_({ success: true, data: result });
  } catch (err) {
    return jsonResponse_({ success: false, error: err.message });
  }
}

/**
 * jsonResponse_ - Helper to create JSON responses
 * PURPOSE: Standardizes API response format
 */
function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * API_ACTIONS - Maps action names to handler functions
 * PURPOSE: Routes API calls to the correct backend function
 */
const API_ACTIONS = {
  loginUser: loginUser,
  getHomeData: getHomeData,
  getProjectData: getProjectData,
  getFinanceData: getFinanceData,
  search: search,
  saveEstimates: saveEstimates,
  submitEstimatesForApproval: submitEstimatesForApproval,
  approveEstimates: approveEstimates,
  getAllMaterials: getAllMaterials,
  getMaterials: getMaterials,
  requestMaterial: requestMaterial,
  approveMaterial: approveMaterial,
  searchMaterials: searchMaterials,
  getAllEquipment: getAllEquipment,
  getEquipment: getEquipment,
  requestEquipment: requestEquipment,
  approveEquipment: approveEquipment,
  searchEquipment: searchEquipment,
  addDailyRecord: addDailyRecord,
  getPendingApprovals: getPendingApprovals,
  getMyPendingRequests: getMyPendingRequests,
  getMyApprovedRequests: getMyApprovedRequests,
  getMyRejectedRequests: getMyRejectedRequests,
  getRequestById: getRequestById,
  approveItem: approveItem,
  rejectItem: rejectItem,
  forceApprove: forceApprove,
  forceReject: forceReject,
  submitCashAdvance: submitCashAdvance,
  submitLiquidation: submitLiquidation,
  submitIncomingCash: submitIncomingCash,
  submitRelease: submitRelease,
  reviewRelease: reviewRelease,
  getApprovedCashAdvancesForRelease: getApprovedCashAdvancesForRelease,
  // Daily record approval
  submitDailyRecordForApproval: submitDailyRecordForApproval,
  approveDailyRecord: approveDailyRecord,
  rejectDailyRecord: rejectDailyRecord,
  getPendingDailyRecords: getPendingDailyRecords,
  // SOW management
  addSOWItem: addSOWItem,
  updateSOWItem: updateSOWItem,
  deleteSOWItem: deleteSOWItem,
  addProject: addProject,
  getSOWItemsForProject: getSOWItemsForProject,
  // Photo upload
  uploadImage: uploadImage
};

// ============================================================
//  GENERIC SHEET HELPERS
// ============================================================

/**
 * ss_ - Get the main spreadsheet
 * PURPOSE: Centralizes access to the Google Sheet
 */
function ss_() { return SpreadsheetApp.openById(SHEET_ID); }

/**
 * sheet_ - Get a specific sheet by name
 * PURPOSE: Gets a sheet and throws error if not found
 */
function sheet_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('Sheet not found: ' + name);
  return sh;
}

/**
 * headers_ - Get column headers for a sheet
 * PURPOSE: Returns the schema/headers for a given sheet
 */
function headers_(name) { return SCHEMAS[name]; }

/**
 * readAll_ - Read all rows from a sheet as objects
 * PURPOSE: Converts sheet data to array of objects with column names as keys
 */
function readAll_(name) {
  const sh = sheet_(name);
  const lastRow = sh.getLastRow();
  const cols = headers_(name).length;
  if (lastRow < 2) return [];
  const values = sh.getRange(2, 1, lastRow - 1, cols).getValues();
  const heads = headers_(name);
  return values
    .filter(function (row) { return row.join('') !== ''; })
    .map(function (row) {
      const obj = {};
      heads.forEach(function (h, i) { obj[h] = row[i]; });
      return obj;
    });
}

/**
 * appendRow_ - Add a new row to a sheet
 * PURPOSE: Inserts a new record with proper column mapping
 */
function appendRow_(name, obj) {
  const sh = sheet_(name);
  const heads = headers_(name);
  const row = heads.map(function (h) { return (obj[h] !== undefined && obj[h] !== null) ? obj[h] : ''; });
  sh.appendRow(row);
  return obj;
}

/**
 * findRowNum_ - Find a row by ID field
 * PURPOSE: Locates a row based on a unique identifier
 */
function findRowNum_(name, idField, idValue) {
  const sh = sheet_(name);
  const heads = headers_(name);
  const idCol = heads.indexOf(idField) + 1;
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return -1;
  const ids = sh.getRange(2, idCol, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(idValue)) return i + 2;
  }
  return -1;
}

/**
 * updateRow_ - Update a specific row
 * PURPOSE: Updates fields of an existing record
 */
function updateRow_(name, idField, idValue, patch) {
  const rowNum = findRowNum_(name, idField, idValue);
  if (rowNum === -1) return false;
  const sh = sheet_(name);
  const heads = headers_(name);
  Object.keys(patch).forEach(function (key) {
    const col = heads.indexOf(key);
    if (col > -1) sh.getRange(rowNum, col + 1).setValue(patch[key]);
  });
  return true;
}

/**
 * nextId_ - Generate a unique ID
 * PURPOSE: Creates IDs with prefix and UUID for uniqueness
 */
function nextId_(prefix) {
  return prefix + '-' + Utilities.getUuid().slice(0, 8).toUpperCase();
}

/**
 * logActivity_ - Log an activity entry
 * PURPOSE: Records user actions for audit trail
 */
function logActivity_(text, type, refId) {
  appendRow_('ActivityLog', {
    timestamp: new Date(),
    text: text,
    type: type || 'blue',
    refId: refId || ''
  });
}

/**
 * currentUserEmail_ - Get the current user's email
 * PURPOSE: Returns the email of the authenticated user from the request
 */
function currentUserEmail_() {
  return CURRENT_REQUEST_USER_EMAIL || '';
}

// ============================================================
//  AUTH
// ============================================================

/**
 * loginUser - Authenticate a user
 * PURPOSE: Validates email/password against the Users sheet
 * 
 * @param {string} email - User's email
 * @param {string} password - User's password
 * @returns {Object} User object with role information
 */
function loginUser(email, password) {
  email = String(email || '').trim().toLowerCase();
  const users = readAll_('Users');
  const record = users.find(function (u) { return String(u.email).toLowerCase() === email; });

  if (!record) {
    throw new Error('This email is not registered. Please contact your administrator for access.');
  }
  if (String(record.password) !== String(password)) {
    throw new Error('Invalid password. Please try again.');
  }
  return {
    email: record.email,
    name: record.name,
    role: record.role,
    roleLabel: record.roleLabel,
    loggedIn: true
  };
}

/**
 * getAdminEmails_ - Get all admin/approver emails (EXCLUDING superadmin)
 * PURPOSE: Retrieves list of users who are REQUIRED to approve requests.
 * Super Admin is NOT required (they have Force Approve/Reject instead).
 */
function getAdminEmails_() {
  return readAll_('Users')
    .filter(function (u) { 
      return u.role === 'admin' || u.role === 'approver';
    })
    .map(function (u) { return String(u.email).toLowerCase(); });
}

/**
 * getAllAdminsExceptSuperAdmin_ - Get all admin emails (EXCLUDING superadmin)
 * PURPOSE: Used for Release Cash review workflow
 */
function getAllAdminsExceptSuperAdmin_() {
  return readAll_('Users')
    .filter(function (u) {
      return u.role === 'admin';
    })
    .map(function (u) {
      return String(u.email).toLowerCase();
    });
}

/**
 * getApproversOnly_ - Get only approver emails (excluding admins)
 * PURPOSE: Gets list of approver role users
 */
function getApproversOnly_() {
  return readAll_('Users')
    .filter(function (u) { return u.role === 'approver'; })
    .map(function (u) { return String(u.email).toLowerCase(); });
}

// ============================================================
//  HELPER FUNCTIONS FOR COMPUTED FINANCIALS
// ============================================================

/**
 * getTotalIncomingCashForProject - Sum of all approved incoming cash for a project
 * PURPOSE: Computes project revenue from IncomingCash sheet
 */
function getTotalIncomingCashForProject(projectId) {
  return readAll_('IncomingCash')
    .filter(function (c) { return c.projectId === projectId; })
    .reduce(function (sum, c) { return sum + (parseFloat(c.amount) || 0); }, 0);
}

/**
 * getTotalReleasedCashForProject - Sum of all approved Release Cash requests for a project
 * PURPOSE: Computes project expenses from Requests sheet
 */
function getTotalReleasedCashForProject(projectId) {
  return readAll_('Requests')
    .filter(function (r) { return r.projectId === projectId && r.type === 'Release Cash' && r.status === 'Released'; })
    .reduce(function (sum, r) { return sum + (parseFloat(r.amount) || 0); }, 0);
}

// ============================================================
//  HOME
// ============================================================

/**
 * getHomeData - Get data for the home page dashboard
 * PURPOSE: Returns projects (with computed revenue/expenses/cash), gauges, pending requests, and activity logs
 */
function getHomeData() {
  const projects = readAll_('Projects').map(function (p) {
    const revenue = getTotalIncomingCashForProject(p.id);
    const expenses = getTotalReleasedCashForProject(p.id);
    return {
      id: p.id,
      name: p.name,
      status: p.status,
      revenue: revenue,
      expenses: expenses,
      cashPosition: revenue - expenses
    };
  });

  const requests = readAll_('Requests');
  const pending = requests.filter(function (r) { return r.status === 'Pending'; });

  const pendingRequests = requests.slice(-5).reverse().map(function (r) {
    return {
      id: r.id, requestor: r.requestor, project: r.projectId,
      amount: r.amount, status: r.status
    };
  });

  const releasedThisMonth = requests
    .filter(function (r) { return r.type === 'Release Cash' && r.status === 'Released'; })
    .reduce(function (s, r) { return s + Number(r.amount || 0); }, 0);

  const allIncoming = readAll_('IncomingCash');
  const totalIncoming = allIncoming.reduce(function(s, c) { 
    return s + Number(c.amount || 0); 
  }, 0);

  const totalReleased = requests
    .filter(function (r) { return r.type === 'Release Cash' && r.status === 'Released'; })
    .reduce(function (s, r) { return s + Number(r.amount || 0); }, 0);

  const availableBudget = totalIncoming - totalReleased;  

  const gauges = [
    { label: 'Pending Approval', value: String(pending.length), color: '#C2860F', dashOffset: 70 },
    { label: 'Overdue Liquidation', value: String(requests.filter(function (r) { return r.type === 'Liquidation' && r.status === 'Pending'; }).length), color: '#B23A2E', dashOffset: 88 },
    { label: 'Released, This Month', value: '₱' + releasedThisMonth.toLocaleString(), color: '#2F7A46', dashOffset: 55 },
    { label: 'Total Liquid Cash', value: '₱' + availableBudget.toLocaleString(), color: '#24455A', dashOffset: 30 }
  ];

  const logs = readAll_('ActivityLog').slice(-10).reverse().map(function (l) {
    return { text: l.text, time: Utilities.formatDate(new Date(l.timestamp), Session.getScriptTimeZone(), 'MMM d'), type: l.type };
  });

  return { projects: projects, gauges: gauges, pendingRequests: pendingRequests, logs: logs };
}

// ============================================================
//  PROJECT
// ============================================================

/**
 * addProject - Add a new project to the database
 */
function addProject(id, name, status, revenue, expenses, cashPosition) {
    var userEmail = currentUserEmail_();
    var users = readAll_('Users');
    var user = users.find(function(u) { 
        return u.email.toLowerCase() === userEmail.toLowerCase(); 
    });
    
    if (!user || user.role !== 'superadmin') {
        throw new Error('Only Super Admin can add new projects.');
    }

    var projects = readAll_('Projects');
    var existing = projects.find(function(p) { 
        return p.id === id; 
    });
    if (existing) {
        throw new Error('Project ID "' + id + '" already exists. Please use a different ID.');
    }

    appendRow_('Projects', {
        id: id,
        name: name || id,
        status: status || 'Ongoing',
        revenue: 0,
        expenses: 0,
        cashPosition: 0
    });

    logActivity_(
        'New project "' + name + '" (' + id + ') created by ' + currentUserName_(),
        'blue'
    );

    return { 
        success: true, 
        id: id, 
        name: name,
        message: 'Project "' + name + '" created successfully.'
    };
}

/**
 * getProjectData - Get detailed data for a specific project
 * PURPOSE: Returns all project details with computed financials
 */
function getProjectData(projectId) {
  const projects = readAll_('Projects');
  const proj = projects.find(function (p) { return p.id === projectId; });
  
  if (!proj) return null;

  const revenue = getTotalIncomingCashForProject(projectId);
  const expenses = getTotalReleasedCashForProject(projectId);
  const cashPosition = revenue - expenses;

  const sowItems = readAll_('SOWItems').filter(function (s) { return s.projectId === projectId; })
    .map(function(s) {
      return {
        id: s.id,
        projectId: s.projectId,
        description: s.description,
        budget: parseFloat(s.budget || 0),
        actual: parseFloat(s.actual || 0),
        startDate: s.startDate || '',
        endDate: s.endDate || '',
        status: s.status || 'On Track',
        qty: parseFloat(s.qty || 0),
        unit: s.unit || ''
      };
    });

  const incomingCash = readAll_('IncomingCash').filter(function (c) { return c.projectId === projectId; });

  const dailyRecords = readAll_('DailyRecords')
    .filter(function (d) { return d.projectId === projectId; })
    .map(function (d) {
      return {
        id: d.id,
        date: d.date,
        weatherAM: d.weatherAM,
        weatherPM: d.weatherPM,
        status: d.status || 'draft',
        manpower: safeParse_(d.manpowerJSON, []),
        equipment: safeParse_(d.equipmentJSON, []),
        workAccomplished: safeParse_(d.workAccomplishedJSON, []),
        materialsDelivered: safeParse_(d.materialsDeliveredJSON, []),
        issues: safeParse_(d.issuesJSON, []),
        visitors: safeParse_(d.visitorsJSON, []),
        photos: safeParse_(d.photosJSON, []),
        createdBy: d.createdBy || ''
      };
    });

  const groups = readAll_('EstimateGroups').filter(function (g) { return g.projectId === projectId; });
  const allMat = readAll_('EstimateMaterials');
  const allLabor = readAll_('EstimateLabor');
  const allEq = readAll_('EstimateEquipment');
  const allInd = readAll_('EstimateIndirect');

  const estimateGroups = groups.map(function (g) {
    return {
      sowId: g.sowId,
      sowDescription: g.sowDescription,
      status: g.status,
      materials: allMat.filter(function (m) { return m.groupId === g.id; }),
      labor: allLabor.filter(function (l) { return l.groupId === g.id; }),
      equipment: allEq.filter(function (e) { return e.groupId === g.id; }),
      indirect: allInd.filter(function (i) { return i.groupId === g.id; })
    };
  });

  const allPhotos = [];
  dailyRecords.forEach(function (d) {
    if (d.photos && d.photos.length) {
      d.photos.forEach(function (p) { allPhotos.push(p); });
    }
    if (d.workAccomplished) {
      d.workAccomplished.forEach(function (w) { if (w.image) allPhotos.push(w.image); });
    }
    if (d.issues) {
      d.issues.forEach(function (iss) { if (iss.image) allPhotos.push(iss.image); });
    }
  });

  return {
    name: proj.name,
    status: proj.status,
    revenue: revenue,
    expenses: expenses,
    cashPosition: cashPosition,
    requests: readAll_('Requests').filter(function (r) { return r.projectId === projectId; }),
    incomingCash: incomingCash,
    sowItems: sowItems,
    dailyRecords: dailyRecords,
    estimates: { groups: estimateGroups },
    photos: allPhotos
  };
}

/**
 * safeParse_ - Safely parse JSON string
 */
function safeParse_(str, fallback) {
  try { return str ? JSON.parse(str) : fallback; } catch (e) { return fallback; }
}

/**
 * addDailyRecord - Add a new daily record (saves as draft by default)
 */
function addDailyRecord(projectId, data) {
  const photoUrls = [];
  if (data.photos && data.photos.length) {
    data.photos.forEach(function (photoBase64, index) {
      try {
        const blob = Utilities.newBlob(
          Utilities.base64Decode(photoBase64),
          'image/jpeg',
          'daily_photo_' + Date.now() + '_' + index + '.jpg'
        );
        const folder = getOrCreateAttachmentsFolder_();
        const file = folder.createFile(blob);
        photoUrls.push(file.getUrl());
      } catch (e) {
        // ignore
      }
    });
  }

  const workAccomplishedWithUrls = (data.workAccomplished || []).map(function (w) {
    if (w.image && w.image.startsWith && !w.image.startsWith('data:')) {
      return w;
    }
    return w;
  });

  const issuesWithUrls = (data.issues || []).map(function (iss) {
    if (iss.image && iss.image.startsWith && !iss.image.startsWith('data:')) {
      return iss;
    }
    return iss;
  });

  const recordId = nextId_('DR');
  appendRow_('DailyRecords', {
    id: recordId,
    projectId: projectId,
    date: data.date,
    weatherAM: data.weatherAM,
    weatherPM: data.weatherPM,
    status: data.status || 'draft',
    manpowerJSON: JSON.stringify(data.manpower || []),
    equipmentJSON: JSON.stringify(data.equipment || []),
    workAccomplishedJSON: JSON.stringify(workAccomplishedWithUrls),
    materialsDeliveredJSON: JSON.stringify(data.materialsDelivered || []),
    issuesJSON: JSON.stringify(issuesWithUrls),
    visitorsJSON: JSON.stringify(data.visitors || []),
    photosJSON: JSON.stringify(photoUrls),
    createdBy: currentUserEmail_(),
    createdAt: new Date()
  });
  
  logActivity_('Daily record added for ' + projectId + ' (' + data.date + ') by ' + currentUserName_(), 'blue', recordId);
  return { success: true, id: recordId };
}

/**
 * submitDailyRecordForApproval - Submit a daily record for approval
 */
function submitDailyRecordForApproval(recordId) {
  updateRow_('DailyRecords', 'id', recordId, { status: 'pending' });
  logActivity_('Daily record ' + recordId + ' submitted by ' + currentUserName_() + ' for approval', 'g', recordId);
  
  const record = readAll_('DailyRecords').find(function (r) { return r.id === recordId; });
  appendRow_('Requests', {
    id: nextId_('REQ'),
    type: 'DailyRecord',
    projectId: record ? record.projectId : '',
    requestor: currentUserName_(),
    requestorEmail: currentUserEmail_(),
    amount: '',
    description: 'Daily record ' + recordId + ' (' + (record ? record.date : '') + ')',
    scope: '',
    attachmentsJSON: '[]',
    payloadJSON: JSON.stringify({ recordId: recordId }),
    status: 'Pending',
    createdAt: new Date(),
    refId: recordId,
    dateNeeded: ''
  });
  return { success: true };
}

function approveDailyRecord(recordId) {
  return approveItem(recordId, 'DailyRecord');
}

function rejectDailyRecord(recordId) {
  return rejectItem(recordId, 'DailyRecord');
}

function getPendingDailyRecords() {
  return readAll_('DailyRecords').filter(function (d) { return d.status === 'pending'; });
}

// ============================================================
//  ESTIMATES
// ============================================================

function saveEstimates(projectId, groups) {
  groups.forEach(function (g) {
    let groupRow = readAll_('EstimateGroups').find(function (row) {
      return row.projectId === projectId && row.sowId === g.sowId;
    });
    let groupId;
    if (groupRow) {
      groupId = groupRow.id;
      updateRow_('EstimateGroups', 'id', groupId, { sowDescription: g.sowDescription });
    } else {
      groupId = nextId_('EG');
      appendRow_('EstimateGroups', {
        id: groupId, projectId: projectId, sowId: g.sowId,
        sowDescription: g.sowDescription, status: 'draft'
      });
    }
    replaceGroupChildren_('EstimateMaterials', groupId, g.materials || [], ['material', 'materialName', 'desc', 'qty', 'rate', 'cost']);
    replaceGroupChildren_('EstimateLabor', groupId, g.labor || [], ['role', 'desc', 'qty', 'duration', 'rate', 'cost']);
    replaceGroupChildren_('EstimateEquipment', groupId, g.equipment || [], ['equipment', 'equipName', 'desc', 'qty', 'duration', 'rate', 'cost']);
    replaceGroupChildren_('EstimateIndirect', groupId, g.indirect || [], ['desc', 'type', 'amount']);
  });
  return { success: true };
}

function replaceGroupChildren_(sheetName, groupId, items, fields) {
  const sh = sheet_(sheetName);
  const heads = headers_(sheetName);
  const groupCol = heads.indexOf('groupId') + 1;
  const lastRow = sh.getLastRow();
  if (lastRow >= 2) {
    const groupIds = sh.getRange(2, groupCol, lastRow - 1, 1).getValues();
    for (let i = groupIds.length - 1; i >= 0; i--) {
      if (String(groupIds[i][0]) === String(groupId)) sh.deleteRow(i + 2);
    }
  }
  items.forEach(function (item) {
    const row = { id: item.id || nextId_('EI'), groupId: groupId };
    fields.forEach(function (f) { row[f] = item[f]; });
    appendRow_(sheetName, row);
  });
}

function submitEstimatesForApproval(projectId, sowId) {
  const g = readAll_('EstimateGroups').find(function (row) { return row.projectId === projectId && row.sowId === sowId; });
  if (!g) throw new Error('Estimate group not found');
  updateRow_('EstimateGroups', 'id', g.id, { status: 'pending' });

  appendRow_('Requests', {
    id: nextId_('REQ'), type: 'Estimate', projectId: projectId,
    requestor: currentUserName_(), requestorEmail: currentUserEmail_(),
    amount: '', description: g.sowDescription, scope: sowId,
    attachmentsJSON: '[]', payloadJSON: '', status: 'Pending',
    createdAt: new Date(), refId: g.id
  });
  logActivity_('Estimate for ' + sowId + ' submitted for approval', 'g');
  return { success: true };
}

function approveEstimates(projectId, sowId) {
  const g = readAll_('EstimateGroups').find(function (row) { return row.projectId === projectId && row.sowId === sowId; });
  let newBudget = null;
  if (g) {
    updateRow_('EstimateGroups', 'id', g.id, { status: 'approved' });
    newBudget = computeEstimateGroupTotal_(g.id);
    updateRow_('SOWItems', 'id', sowId, { budget: newBudget });
  }
  logActivity_('Estimate for ' + sowId + ' approved' + (newBudget !== null ? ' — SOW budget set to ₱' + newBudget.toFixed(2) : ''), 'g');
  return { success: true, budget: newBudget };
}

function computeEstimateGroupTotal_(groupId) {
  const matSum = readAll_('EstimateMaterials').filter(function (m) { return m.groupId === groupId; })
    .reduce(function (s, m) { return s + (parseFloat(m.cost) || 0); }, 0);
  const laborSum = readAll_('EstimateLabor').filter(function (l) { return l.groupId === groupId; })
    .reduce(function (s, l) { return s + (parseFloat(l.cost) || 0); }, 0);
  const eqSum = readAll_('EstimateEquipment').filter(function (e) { return e.groupId === groupId; })
    .reduce(function (s, e) { return s + (parseFloat(e.cost) || 0); }, 0);
  const indSum = readAll_('EstimateIndirect').filter(function (i) { return i.groupId === groupId; })
    .reduce(function (s, i) { return s + (parseFloat(i.amount) || 0); }, 0);
  return matSum + laborSum + eqSum + indSum;
}

function currentUserName_() {
  const email = currentUserEmail_();
  const u = readAll_('Users').find(function (row) { return String(row.email).toLowerCase() === String(email).toLowerCase(); });
  return u ? u.name : (email || 'Unknown User');
}

// ============================================================
//  MATERIALS DATABASE
// ============================================================

function getAllMaterials() { return readAll_('Materials'); }

function getMaterials(status) {
  status = status || 'approved';
  return readAll_('Materials').filter(function (m) { return m.status === status; });
}

function requestMaterial(data) {
  const id = nextId_('MAT');
  appendRow_('Materials', {
    id: id, code: data.code || id, name: data.name, desc: data.desc, category: data.category,
    unit: data.unit, rate: data.rate, brand: data.brand, supplier: data.supplier,
    image: data.image || '', docsJSON: JSON.stringify(data.docs || []), notes: data.notes || '',
    status: 'Pending', requestedBy: currentUserEmail_(), createdAt: new Date()
  });
  appendRow_('Requests', {
    id: nextId_('REQ'), type: 'Material', projectId: '', requestor: currentUserName_(),
    requestorEmail: currentUserEmail_(), amount: '', description: data.name, scope: '',
    attachmentsJSON: '[]', payloadJSON: '', status: 'Pending', createdAt: new Date(), refId: id
  });
  logActivity_('Material Database Update Request: "' + data.name + '" requested by ' + currentUserName_(), 'blue');
  return { success: true, id: id };
}

function approveMaterial(id) { return approveGenericItem_('Materials', id, 'Material'); }

function searchMaterials(query) {
  query = String(query || '').toLowerCase();
  return readAll_('Materials').filter(function (m) {
    return (m.name && m.name.toLowerCase().indexOf(query) > -1) ||
      (m.code && String(m.code).toLowerCase().indexOf(query) > -1);
  });
}

// ============================================================
//  EQUIPMENT DATABASE
// ============================================================

function getAllEquipment() { return readAll_('Equipment'); }

function getEquipment(status) {
  status = status || 'approved';
  return readAll_('Equipment').filter(function (e) { return e.status === status; });
}

function requestEquipment(data) {
  const id = nextId_('EQ');
  appendRow_('Equipment', {
    id: id, code: data.code || id, name: data.name, desc: data.desc, category: data.category,
    unit: data.unit, rate: data.rate, brand: data.brand, supplier: data.supplier,
    image: data.image || '', docsJSON: JSON.stringify(data.docs || []), notes: data.notes || '',
    status: 'Pending', requestedBy: currentUserEmail_(), createdAt: new Date()
  });
  appendRow_('Requests', {
    id: nextId_('REQ'), type: 'Equipment', projectId: '', requestor: currentUserName_(),
    requestorEmail: currentUserEmail_(), amount: '', description: data.name, scope: '',
    attachmentsJSON: '[]', payloadJSON: '', status: 'Pending', createdAt: new Date(), refId: id
  });
  logActivity_('Equipment "' + data.name + '" requested by ' + currentUserName_(), 'blue');
  return { success: true, id: id };
}

function approveEquipment(id) { return approveGenericItem_('Equipment', id, 'Equipment'); }

function searchEquipment(query) {
  query = String(query || '').toLowerCase();
  return readAll_('Equipment').filter(function (e) {
    return (e.name && e.name.toLowerCase().indexOf(query) > -1) ||
      (e.code && String(e.code).toLowerCase().indexOf(query) > -1);
  });
}

function approveGenericItem_(sheetName, id, typeLabel) {
  updateRow_(sheetName, 'id', id, { status: 'approved' });
  logActivity_(typeLabel + ' ' + id + ' approved', 'g');
  return { success: true };
}

// ============================================================
//  FINANCE
// ============================================================

/**
 * getFinanceData - Get finance dashboard data
 */
function getFinanceData() {
  const projects = readAll_('Projects');
  const requests = readAll_('Requests');
  const incoming = readAll_('IncomingCash');
  const sowItems = readAll_('SOWItems');
  const now = new Date();

  let totalRevenue = 0;
  let totalExpenses = 0;
  projects.forEach(function (p) {
    totalRevenue += getTotalIncomingCashForProject(p.id);
    totalExpenses += getTotalReleasedCashForProject(p.id);
  });
  const cashPosition = totalRevenue - totalExpenses;

  const pendingReqs = requests.filter(function (r) { return r.status === 'Pending'; });
  const pendingAmount = pendingReqs.reduce(function (s, r) { return s + Number(r.amount || 0); }, 0);

  const kpis = [
    { label: 'Total Revenue', value: '₱' + totalRevenue.toFixed(2), sub: 'All projects', cls: 'good' },
    { label: 'Total Expenses', value: '₱' + totalExpenses.toFixed(2), sub: 'All projects', cls: '' },
    { label: 'Cash Position', value: '₱' + cashPosition.toFixed(2), sub: 'Revenue - Expenses', cls: 'good' },
    { label: 'Pending Requests', value: String(pendingReqs.length), sub: '₱' + pendingAmount.toFixed(2) + ' total', cls: 'warn' }
  ];

  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ label: Utilities.formatDate(d, Session.getScriptTimeZone(), 'MMM'), year: d.getFullYear(), month: d.getMonth() });
  }
  const inflow = months.map(function (m) {
    return incoming.filter(function (c) { const cd = new Date(c.date); return cd.getFullYear() === m.year && cd.getMonth() === m.month; })
      .reduce(function (s, c) { return s + Number(c.amount || 0); }, 0);
  });
  const outflow = months.map(function (m) {
    return requests.filter(function (r) {
      if (r.type !== 'Release Cash' || r.status !== 'Released') return false;
      const rd = new Date(r.createdAt);
      return rd.getFullYear() === m.year && rd.getMonth() === m.month;
    }).reduce(function (s, r) { return s + Number(r.amount || 0); }, 0);
  });
  const cashflow = { labels: months.map(function (m) { return m.label; }), inflow: inflow, outflow: outflow, projectedFrom: months.length };

  const budgetVsActual = {
    labels: projects.map(function (p) { return p.name; }),
    budget: projects.map(function (p) {
      const items = sowItems.filter(function (s) { return s.projectId === p.id; });
      const sum = items.reduce(function (s, i) { return s + Number(i.budget || 0); }, 0);
      return sum || Number(p.revenue || 0);
    }),
    actual: projects.map(function (p) {
      const items = sowItems.filter(function (s) { return s.projectId === p.id; });
      const sum = items.reduce(function (s, i) { return s + Number(i.actual || 0); }, 0);
      return sum || Number(p.expenses || 0);
    })
  };

  const typeGroups = {};
  requests.filter(function (r) { return r.status === 'Approved' || r.status === 'Released'; }).forEach(function (r) {
    typeGroups[r.type] = (typeGroups[r.type] || 0) + Number(r.amount || 0);
  });
  const breakdownKeys = Object.keys(typeGroups);
  const breakdownTotal = Object.values(typeGroups).reduce(function (s, v) { return s + v; }, 0) || 1;
  const breakdown = {
    labels: breakdownKeys.length ? breakdownKeys : ['No data'],
    values: breakdownKeys.length ? breakdownKeys.map(function (k) { return Math.round((typeGroups[k] / breakdownTotal) * 100); }) : [100]
  };

  const cashAdv = requests.filter(function (r) { return r.type === 'Cash Advance' && r.status === 'Pending'; });
  const buckets = { '0-30 days': 0, '31-60 days': 0, '61-90 days': 0, '90+ days': 0 };
  cashAdv.forEach(function (r) {
    const days = Math.floor((now - new Date(r.createdAt)) / (1000 * 60 * 60 * 24));
    const amt = Number(r.amount || 0);
    if (days <= 30) buckets['0-30 days'] += amt;
    else if (days <= 60) buckets['31-60 days'] += amt;
    else if (days <= 90) buckets['61-90 days'] += amt;
    else buckets['90+ days'] += amt;
  });
  const aging = { labels: Object.keys(buckets), values: Object.values(buckets) };

  const costStatus = projects.map(function (p) {
    const items = sowItems.filter(function (s) { return s.projectId === p.id; });
    const budget = items.reduce(function (s, i) { return s + Number(i.budget || 0); }, 0) || Number(p.revenue || 0);
    const actual = items.reduce(function (s, i) { return s + Number(i.actual || 0); }, 0) || Number(p.expenses || 0);
    const pct = budget > 0 ? (actual / budget) * 100 : 0;
    const status = pct >= 100 ? 'Over Budget' : pct >= 85 ? 'At Risk' : 'On Track';
    const cls = pct >= 100 ? 'danger' : pct >= 85 ? 'warn' : 'good';
    return { project: p.name, budget: budget, actual: actual, status: status, cls: cls };
  });

  return { kpis: kpis, cashflow: cashflow, budgetVsActual: budgetVsActual, breakdown: breakdown, aging: aging, costStatus: costStatus };
}

function uploadAttachmentIfAny_(payload) {
  if (!payload.fileBase64 || !payload.fileName) return { fileUrl: '', fileName: '' };
  try {
    const blob = Utilities.newBlob(
      Utilities.base64Decode(payload.fileBase64),
      payload.fileMimeType || 'application/octet-stream',
      payload.fileName
    );
    const folder = getOrCreateAttachmentsFolder_();
    const file = folder.createFile(blob);
    return { fileUrl: file.getUrl(), fileName: payload.fileName };
  } catch (e) {
    logActivity_('File upload failed: ' + e.message, 'a');
    return { fileUrl: '', fileName: '' };
  }
}

// ============================================================
//  CASH REQUESTS
// ============================================================

function submitCashAdvance(payload) {
  const uploaded = uploadAttachmentIfAny_(payload);
  const fileUrl = uploaded.fileUrl;
  const fileName = uploaded.fileName;

  const id = nextId_('REQ');
  
  var projectName = '';
  if (payload.project) {
    var projects = readAll_('Projects');
    var proj = projects.find(function(p) { 
      return p.id === payload.project || p.name === payload.project;
    });
    if (proj) {
      projectName = ' for ' + proj.name;
    } else {
      projectName = ' for ' + payload.project;
    }
  }

  appendRow_('Requests', {
    id: id, 
    type: 'Cash Advance', 
    projectId: payload.project || '',
    requestor: currentUserName_(), 
    requestorEmail: currentUserEmail_(),
    amount: payload.amount, 
    description: payload.description || '',
    scope: payload.scopeOfWork || '',
    attachmentsJSON: JSON.stringify(fileUrl ? [{ url: fileUrl, name: fileName }] : []),
    payloadJSON: JSON.stringify({ 
      requestType: payload.requestType || '', 
      dateNeeded: payload.dateNeeded || '' 
    }),
    status: 'Pending', 
    createdAt: new Date(), 
    refId: '',
    dateNeeded: payload.dateNeeded || ""
  });
  
  logActivity_(
    'Cash advance ₱' + payload.amount + ' requested by ' + currentUserName_() + projectName,
    'blue'
  );
  
  return { success: true, requestId: id, fileUrl: fileUrl, fileName: fileName };
}

function getOrCreateAttachmentsFolder_() {
  const name = 'FCTC Ops Board Attachments';
  const folders = DriveApp.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(name);
}

// ============================================================
//  INCOMING CASH (with approval workflow)
// ============================================================

function submitIncomingCash(payload) {
    const uploaded = uploadAttachmentIfAny_(payload);
    const fileUrl = uploaded.fileUrl;
    const fileName = uploaded.fileName;
    const id = nextId_('REQ');
    
    var projectName = '';
    if (payload.project) {
        var projects = readAll_('Projects');
        var proj = projects.find(function(p) { 
            return p.id === payload.project || p.name === payload.project;
        });
        if (proj) {
            projectName = ' for ' + proj.name;
        } else {
            projectName = ' for ' + payload.project;
        }
    }

    appendRow_('Requests', {
        id: id,
        type: 'Incoming Cash',
        projectId: payload.project || '',
        requestor: currentUserName_(),
        requestorEmail: currentUserEmail_(),
        amount: payload.amount,
        description: payload.description || '',
        scope: payload.type || '',
        attachmentsJSON: JSON.stringify(fileUrl ? [{ url: fileUrl, name: fileName }] : []),
        payloadJSON: JSON.stringify({
            method: payload.method || '',
            reference: payload.reference || '',
            date: payload.date || ''
        }),
        status: 'Pending',
        createdAt: new Date(),
        refId: '',
        dateNeeded: ''
    });
    
    logActivity_(
        'Incoming cash ₱' + payload.amount + ' recorded by ' + currentUserName_() + projectName + ' (pending approval)',
        'blue'
    );
    
    return { success: true, requestId: id, fileUrl: fileUrl, fileName: fileName };
}

function approveIncomingCash(id) {
    const req = readAll_('Requests').find(function(r) { return r.id === id; });
    if (!req) throw new Error('Request not found: ' + id);
    
    var payload = {};
    try {
        payload = JSON.parse(req.payloadJSON || '{}');
    } catch(e) { /* ignore */ }
    
    var attachments = [];
    try {
        attachments = JSON.parse(req.attachmentsJSON || '[]');
    } catch(e) { /* ignore */ }
    
    const incomingId = nextId_('IC');
    appendRow_('IncomingCash', {
        id: incomingId,
        projectId: req.projectId || '',
        date: payload.date || new Date(),
        name: req.requestor,
        desc: req.description,
        amount: parseFloat(req.amount || 0),
        attachmentUrl: attachments.length > 0 ? attachments[0].url : '',
        attachmentName: attachments.length > 0 ? attachments[0].name : ''
    });
    
    updateRow_('Requests', 'id', id, { 
        status: 'Approved',
        refId: incomingId
    });
    
    logActivity_('Incoming cash ₱' + req.amount + ' approved and recorded', 'g', incomingId);
    return { success: true, incomingId: incomingId };
}

// ============================================================
//  LIQUIDATION
// ============================================================

function submitLiquidation(payload) {
  appendRow_('Requests', {
    id: nextId_('REQ'), type: 'Liquidation', projectId: payload.projectId || '',
    requestor: currentUserName_(), requestorEmail: currentUserEmail_(),
    amount: payload.amount, description: payload.description || '', scope: payload.requestId || '',
    attachmentsJSON: JSON.stringify(payload.receiptNo ? [payload.receiptNo] : []),
    payloadJSON: JSON.stringify(payload), status: 'Pending', createdAt: new Date(), refId: ''
  });
  logActivity_('Liquidation submitted (₱' + payload.amount + ' by ' + currentUserName_() + ')', 'blue');
  return { success: true };
}

// ============================================================
//  RELEASE CASH (NEW WORKFLOW)
// ============================================================

/**
 * submitRelease - Super Admin submits a release request
 * PURPOSE: Creates a "Reviewing" request that requires all Admins to review
 * 
 * NEW: Status is "Reviewing" (not "Approved")
 * NEW: Validates that no existing release exists (Reviewing or Released)
 */
function submitRelease(payload) {
  const requestId = payload.requestId;
  const releaseAmount = parseFloat(payload.amount) || 0;
  
  // Kunin ang original Cash Advance request
  const allRequests = readAll_('Requests');
  const cashAdvance = allRequests.find(function(r) {
    return r.id === requestId && r.type === 'Cash Advance' && r.status === 'Approved';
  });
  
  if (!cashAdvance) {
    throw new Error('Approved cash advance request not found: ' + requestId);
  }
  
  const approvedAmount = parseFloat(cashAdvance.amount) || 0;
  
  // Validate: hindi dapat lumampas sa approved amount
  if (releaseAmount > approvedAmount) {
    throw new Error('Release amount (₱' + releaseAmount.toFixed(2) + ') exceeds approved amount (₱' + approvedAmount.toFixed(2) + ').');
  }
  
  // Validate: hindi pa dapat na-release o under review
  const existingRelease = allRequests.find(function(r) {
    return r.refId === requestId && r.type === 'Release Cash' && (r.status === 'Reviewing' || r.status === 'Released');
  });
  if (existingRelease) {
    throw new Error('This request is already under review or has been released.');
  }
  
  // ✅ Status = 'Reviewing' (hindi 'Approved')
  const releaseId = nextId_('REQ');
  appendRow_('Requests', {
    id: releaseId,
    type: 'Release Cash',
    projectId: cashAdvance.projectId || '',
    requestor: currentUserName_(),
    requestorEmail: currentUserEmail_(),
    amount: releaseAmount,
    description: 'Cash release for ' + requestId,
    scope: requestId,
    attachmentsJSON: '[]',
    payloadJSON: JSON.stringify(payload),
    status: 'Reviewing',
    createdAt: new Date(),
    refId: requestId,
    dateNeeded: ''
  });
  
  // ✅ I-update ang original Cash Advance request status
  updateRow_('Requests', 'id', requestId, { status: 'Released' });
  
  logActivity_('Release of ₱' + releaseAmount + ' for request ' + requestId + ' submitted by ' + currentUserName_() + ' (reviewing)', 'blue', releaseId);
  return { success: true, releaseId: releaseId };
}

/**
 * reviewRelease - Admin reviews a release request
 * PURPOSE: Records a review and checks if all admins have reviewed
 * 
 * @param {string} requestId - The ID of the release request (not the cash advance)
 * @param {string} reviewerEmail - The email of the Admin reviewing
 * @returns {Object} { success, status: 'Reviewing' | 'Released' }
 */
function reviewRelease(requestId, reviewerEmail) {
  // Hanapin ang release request
  const req = readAll_('Requests').find(function(r) {
    return r.id === requestId && r.type === 'Release Cash' && r.status === 'Reviewing';
  });
  if (!req) {
    throw new Error('Request not found or not in reviewing status.');
  }
  
  // I-check kung self-review (hindi pwedeng i-review ng Super Admin ang sarili niyang request)
  if (req.requestorEmail.toLowerCase() === reviewerEmail.toLowerCase()) {
    throw new Error('Self-review is not allowed.');
  }
  
  // Kunin ang lahat ng admins (except superadmin)
  const admins = getAllAdminsExceptSuperAdmin_();
  
  // Kunin ang mga existing reviews
  const allApprovals = readAll_('Approvals');
  const reviews = allApprovals.filter(function(a) {
    return a.requestId === requestId && a.decision === 'Reviewed';
  });
  const distinctReviewers = reviews.map(function(r) { return r.approver.toLowerCase(); });
  
  // I-record ang review na ito
  appendRow_('Approvals', {
    requestId: requestId,
    approver: reviewerEmail.toLowerCase(),
    decision: 'Reviewed',
    timestamp: new Date(),
    remarks: ''
  });
  
  // I-check kung lahat ng admins (except superadmin) ay nag-review na
  // Exclude ang Super Admin (requestor) kasi hindi sila required
  const requiredReviewers = admins.filter(function(admin) {
    return admin !== req.requestorEmail.toLowerCase();
  });
  
  const allReviewed = requiredReviewers.every(function(admin) {
    return distinctReviewers.includes(admin) || admin === reviewerEmail.toLowerCase();
  });
  
  if (allReviewed) {
    // ✅ Released na!
    updateRow_('Requests', 'id', requestId, { status: 'Released' });
    logActivity_('Release request ' + requestId + ' fully reviewed and released', 'g', requestId);
    return { success: true, status: 'Released' };
  } else {
    logActivity_('Release request ' + requestId + ' reviewed by ' + reviewerEmail, 'blue', requestId);
    return { success: true, status: 'Reviewing' };
  }
}

/**
 * getApprovedCashAdvancesForRelease - Get approved cash advances without existing release
 * PURPOSE: Populates dropdown in Release Cash form
 * 
 * NEW: Excludes requests that already have a release (Reviewing or Released)
 */
function getApprovedCashAdvancesForRelease() {
  const allRequests = readAll_('Requests');
  
  // Kunin ang lahat ng Approved Cash Advances
  const cashAdvances = allRequests.filter(function(r) {
    return r.type === 'Cash Advance' && r.status === 'Approved';
  });
  
  // Kunin ang mga request ID na may existing release (Reviewing o Released)
  const releaseRefIds = {};
  allRequests.filter(function(r) {
    return r.type === 'Release Cash' && (r.status === 'Reviewing' || r.status === 'Released');
  }).forEach(function(r) {
    if (r.refId) {
      releaseRefIds[r.refId] = true;
    }
  });
  
  // I-filter ang mga walang existing release
  const available = cashAdvances.filter(function(ca) {
    return !releaseRefIds[ca.id];
  });
  
  return available.map(function(ca) {
    return {
      id: ca.id,
      requestor: ca.requestor,
      amount: parseFloat(ca.amount) || 0,
      date: ca.createdAt || new Date().toISOString()
    };
  });
}

// ============================================================
//  APPROVALS
// ============================================================

function _isNonCashRequest(type) {
  const nonCashTypes = ['Material', 'Equipment', 'Estimate', 'DailyRecord'];
  return nonCashTypes.indexOf(type) !== -1;
}

function getPendingApprovals() {
  const userEmail = currentUserEmail_().toLowerCase();
  const allRequests = readAll_('Requests').filter(function (r) {
    return r.status === 'Pending' && !_isNonCashRequest(r.type);
  });
  const allApprovals = readAll_('Approvals');
  
  const requests = allRequests.map(function (r) {
    const userAction = allApprovals.find(function (a) {
      const approvalId = _isNonCashRequest(r.type) ? r.refId : r.id;
      return a.requestId === approvalId && a.approver.toLowerCase() === userEmail;
    });
    return {
      id: r.id,
      type: r.type,
      projectId: r.projectId,
      requestor: r.requestor,
      requestorEmail: r.requestorEmail,
      amount: r.amount,
      description: r.description,
      scope: r.scope,
      status: r.status,
      createdAt: r.createdAt,
      refId: r.refId,
      userActed: !!userAction
    };
  });
  
  // ✅ Add Reviewing requests for Admin review
  const reviewingRequests = readAll_('Requests').filter(function (r) {
    return r.type === 'Release Cash' && r.status === 'Reviewing';
  }).map(function (r) {
    return {
      id: r.id,
      type: r.type,
      projectId: r.projectId,
      requestor: r.requestor,
      requestorEmail: r.requestorEmail,
      amount: r.amount,
      description: r.description,
      scope: r.scope,
      status: r.status,
      createdAt: r.createdAt,
      refId: r.refId,
      userActed: false
    };
  });
  
  const materials = readAll_('Materials').filter(function (m) { return m.status === 'Pending'; });
  const equipment = readAll_('Equipment').filter(function (e) { return e.status === 'Pending'; });
  const estimates = readAll_('EstimateGroups').filter(function (g) { return g.status === 'pending'; });
  const dailyRecords = readAll_('DailyRecords').filter(function (d) { return d.status === 'pending'; });
  
  return { 
    requests: requests, 
    reviewingRequests: reviewingRequests,
    materials: materials, 
    equipment: equipment, 
    estimates: estimates, 
    dailyRecords: dailyRecords 
  };
}

function getMyPendingRequests() {
  const email = currentUserEmail_().toLowerCase();
  return readAll_('Requests').filter(function (r) {
    return String(r.requestorEmail).toLowerCase() === email && r.status === 'Pending';
  });
}

function getMyApprovedRequests() {
  const email = currentUserEmail_().toLowerCase();
  return readAll_('Requests').filter(function (r) {
    return String(r.requestorEmail).toLowerCase() === email && r.status === 'Approved';
  });
}

function getMyRejectedRequests() {
  const email = currentUserEmail_().toLowerCase();
  return readAll_('Requests').filter(function (r) {
    return String(r.requestorEmail).toLowerCase() === email && r.status === 'Rejected';
  });
}

function getRequestById(id) {
  const req = readAll_('Requests').find(function (r) { return r.id === id || r.refId === id; });
  if (req) {
    try {
      req.attachments = req.attachmentsJSON ? JSON.parse(req.attachmentsJSON) : [];
    } catch (e) {
      req.attachments = [];
    }
  }
  return req || null;
}

function approveItem(id, type) {
  return decideItem_(id, type, 'Approved');
}

function rejectItem(id, type) {
  return decideItem_(id, type, 'Rejected');
}

function decideItem_(id, type, decision) {
  const approver = currentUserEmail_().toLowerCase();
  const allApprovers = getAdminEmails_();
  
  const requests = readAll_('Requests');
  let req = requests.find(function (r) { return r.id === id || r.refId === id; });

  if (req && String(req.requestorEmail).toLowerCase() === approver) {
    throw new Error('Self-approval is not allowed. You cannot approve your own request.');
  }

  if (req) {
    if (req.type === 'Incoming Cash') {
      if (decision === 'Approved') {
        return approveIncomingCash(id);
      } else {
        updateRow_('Requests', 'id', req.id, { status: 'Rejected' });
        logActivity_('Incoming cash request ' + req.id + ' rejected', 'a', req.id);
        return { success: true, status: 'Rejected' };
      }
    }

    const isNonCash = _isNonCashRequest(req.type);
    const approvalRequestId = isNonCash ? req.refId : req.id;
    
    const existingApprovals = readAll_('Approvals').filter(function (a) { 
      return a.requestId === approvalRequestId && a.approver === approver;
    });
    
    if (existingApprovals.length > 0) {
      throw new Error('You have already approved/rejected this request.');
    }

    appendRow_('Approvals', {
      requestId: approvalRequestId,
      approver: approver,
      decision: decision,
      timestamp: new Date(),
      remarks: ''
    });

    let finalStatus = 'Pending';
    
    if (decision === 'Rejected') {
      finalStatus = 'Rejected';
    } else {
      const approvals = readAll_('Approvals').filter(function (a) { 
        return a.requestId === approvalRequestId && a.decision === 'Approved'; 
      });
      const distinctApprovers = Array.from(new Set(approvals.map(function (a) { return a.approver; })));
      
      const requiredForApproval = allApprovers.filter(function (a) { 
        return a !== String(req.requestorEmail).toLowerCase(); 
      });
      
      const allApproved = requiredForApproval.every(function (approverEmail) {
        return distinctApprovers.includes(approverEmail);
      });
      
      finalStatus = allApproved ? 'Approved' : 'Pending';
    }

    updateRow_('Requests', 'id', req.id, { status: finalStatus });
    mirrorStatusToMaster_(req, finalStatus);
    logActivity_(req.type + ' ' + req.id + ' ' + finalStatus.toLowerCase(), finalStatus === 'Rejected' ? 'a' : 'g');
    return { success: true, status: finalStatus };
  }

  const sheetName = type === 'Material' ? 'Materials' : (type === 'Equipment' ? 'Equipment' : (type === 'DailyRecord' ? 'DailyRecords' : null));
  if (sheetName) {
    const statusMap = { 'Approved': 'approved', 'Rejected': 'rejected' };
    updateRow_(sheetName, 'id', id, { status: statusMap[decision] || decision.toLowerCase() });
    return { success: true, status: decision };
  }
  throw new Error('Request not found: ' + id);
}

function mirrorStatusToMaster_(req, finalStatus) {
  if (!req.refId) return;
  if (req.type === 'Material') {
    updateRow_('Materials', 'id', req.refId, { status: finalStatus === 'Approved' ? 'approved' : finalStatus.toLowerCase() });
  } else if (req.type === 'Equipment') {
    updateRow_('Equipment', 'id', req.refId, { status: finalStatus === 'Approved' ? 'approved' : finalStatus.toLowerCase() });
  } else if (req.type === 'Estimate') {
    updateRow_('EstimateGroups', 'id', req.refId, { status: finalStatus === 'Approved' ? 'approved' : finalStatus.toLowerCase() });
  } else if (req.type === 'DailyRecord') {
    updateRow_('DailyRecords', 'id', req.refId, { status: finalStatus === 'Approved' ? 'approved' : finalStatus.toLowerCase() });
  }
}

// ============================================================
//  SUPER ADMIN OVERRIDES
// ============================================================

function forceApprove(id, type) {
  const user = readAll_('Users').find(function (u) { 
    return String(u.email).toLowerCase() === currentUserEmail_().toLowerCase(); 
  });
  if (!user || user.role !== 'superadmin') {
    throw new Error('Only the Super Admin can force-approve.');
  }

  if (type === 'Incoming Cash') {
    return approveIncomingCash(id);
  }

  if (type === 'Material') {
    updateRow_('Materials', 'id', id, { status: 'approved' });
    const req = readAll_('Requests').find(function (r) { return r.refId === id && r.type === 'Material'; });
    if (req) updateRow_('Requests', 'id', req.id, { status: 'Approved' });
    logActivity_('Material ' + id + ' force-approved by Super Admin', 'g', id);
    return { success: true, status: 'Approved' };
  }

  if (type === 'Equipment') {
    updateRow_('Equipment', 'id', id, { status: 'approved' });
    const req = readAll_('Requests').find(function (r) { return r.refId === id && r.type === 'Equipment'; });
    if (req) updateRow_('Requests', 'id', req.id, { status: 'Approved' });
    logActivity_('Equipment ' + id + ' force-approved by Super Admin', 'g', id);
    return { success: true, status: 'Approved' };
  }

  if (type === 'Estimate') {
    updateRow_('EstimateGroups', 'id', id, { status: 'approved' });
    const req = readAll_('Requests').find(function (r) { return r.refId === id && r.type === 'Estimate'; });
    if (req) updateRow_('Requests', 'id', req.id, { status: 'Approved' });
    const group = readAll_('EstimateGroups').find(function (g) { return g.id === id; });
    if (group) {
      const total = computeEstimateGroupTotal_(id);
      updateRow_('SOWItems', 'id', group.sowId, { budget: total });
    }
    logActivity_('Estimate ' + id + ' force-approved by Super Admin', 'g', id);
    return { success: true, status: 'Approved' };
  }

  if (type === 'DailyRecord') {
    updateRow_('DailyRecords', 'id', id, { status: 'approved' });
    const req = readAll_('Requests').find(function (r) { return r.refId === id && r.type === 'DailyRecord'; });
    if (req) updateRow_('Requests', 'id', req.id, { status: 'Approved' });
    logActivity_('DailyRecord ' + id + ' force-approved by Super Admin', 'g', id);
    return { success: true, status: 'Approved' };
  }

  const req = readAll_('Requests').find(function (r) { return r.id === id || r.refId === id; });
  if (!req) throw new Error('Request not found: ' + id);
  
  updateRow_('Requests', 'id', req.id, { status: 'Approved' });
  mirrorStatusToMaster_(req, 'Approved');
  logActivity_(req.type + ' ' + req.id + ' force-approved by Super Admin', 'g', req.id);
  return { success: true, status: 'Approved' };
}

function forceReject(id, type) {
  const user = readAll_('Users').find(function (u) { 
    return String(u.email).toLowerCase() === currentUserEmail_().toLowerCase(); 
  });
  if (!user || user.role !== 'superadmin') {
    throw new Error('Only the Super Admin can force-reject.');
  }

  if (type === 'Incoming Cash') {
    updateRow_('Requests', 'id', id, { status: 'Rejected' });
    logActivity_('Incoming cash request ' + id + ' force-rejected by Super Admin', 'a', id);
    return { success: true, status: 'Rejected' };
  }

  if (type === 'Material') {
    updateRow_('Materials', 'id', id, { status: 'rejected' });
    const req = readAll_('Requests').find(function (r) { return r.refId === id && r.type === 'Material'; });
    if (req) updateRow_('Requests', 'id', req.id, { status: 'Rejected' });
    logActivity_('Material ' + id + ' force-rejected by Super Admin', 'a', id);
    return { success: true, status: 'Rejected' };
  }

  if (type === 'Equipment') {
    updateRow_('Equipment', 'id', id, { status: 'rejected' });
    const req = readAll_('Requests').find(function (r) { return r.refId === id && r.type === 'Equipment'; });
    if (req) updateRow_('Requests', 'id', req.id, { status: 'Rejected' });
    logActivity_('Equipment ' + id + ' force-rejected by Super Admin', 'a', id);
    return { success: true, status: 'Rejected' };
  }

  if (type === 'Estimate') {
    updateRow_('EstimateGroups', 'id', id, { status: 'rejected' });
    const req = readAll_('Requests').find(function (r) { return r.refId === id && r.type === 'Estimate'; });
    if (req) updateRow_('Requests', 'id', req.id, { status: 'Rejected' });
    logActivity_('Estimate ' + id + ' force-rejected by Super Admin', 'a', id);
    return { success: true, status: 'Rejected' };
  }

  if (type === 'DailyRecord') {
    updateRow_('DailyRecords', 'id', id, { status: 'rejected' });
    const req = readAll_('Requests').find(function (r) { return r.refId === id && r.type === 'DailyRecord'; });
    if (req) updateRow_('Requests', 'id', req.id, { status: 'Rejected' });
    logActivity_('DailyRecord ' + id + ' force-rejected by Super Admin', 'a', id);
    return { success: true, status: 'Rejected' };
  }

  const req = readAll_('Requests').find(function (r) { return r.id === id || r.refId === id; });
  if (!req) throw new Error('Request not found: ' + id);
  
  updateRow_('Requests', 'id', req.id, { status: 'Rejected' });
  mirrorStatusToMaster_(req, 'Rejected');
  logActivity_(req.type + ' ' + req.id + ' force-rejected by Super Admin', 'a', req.id);
  return { success: true, status: 'Rejected' };
}

// ============================================================
//  SEARCH
// ============================================================

function search(query) {
  query = String(query || '').toLowerCase();
  const results = [];
  readAll_('Projects').forEach(function (p) {
    if (p.name.toLowerCase().indexOf(query) > -1) results.push({ type: 'Project', id: p.id, label: p.name });
  });
  readAll_('Materials').forEach(function (m) {
    if (m.name && m.name.toLowerCase().indexOf(query) > -1) results.push({ type: 'Material', id: m.id, label: m.name });
  });
  readAll_('Equipment').forEach(function (e) {
    if (e.name && e.name.toLowerCase().indexOf(query) > -1) results.push({ type: 'Equipment', id: e.id, label: e.name });
  });
  readAll_('Requests').forEach(function (r) {
    if (r.id.toLowerCase().indexOf(query) > -1) results.push({ type: r.type, id: r.id, label: r.description });
  });
  return results;
}

// ============================================================
//  SOW MANAGEMENT
// ============================================================

function addSOWItem(projectId, data) {
  const id = data.id || 'SOW-' + Utilities.getUuid().slice(0, 6).toUpperCase();
  const description = data.description || '';
  const qty = parseFloat(data.qty) || 0;
  const unit = data.unit || '';
  
  const budget = 0;
  const actual = 0;
  const startDate = '';
  const endDate = '';
  const status = 'On Track';

  const existing = readAll_('SOWItems').find(function (s) { return s.id === id && s.projectId === projectId; });
  if (existing) {
    throw new Error('SOW ID already exists for this project.');
  }

  appendRow_('SOWItems', {
    id: id,
    projectId: projectId,
    description: description,
    budget: budget,
    actual: actual,
    startDate: startDate,
    endDate: endDate,
    status: status,
    qty: qty,
    unit: unit
  });

  appendRow_('EstimateGroups', {
    id: nextId_('EG'),
    projectId: projectId,
    sowId: id,
    sowDescription: description,
    status: 'draft'
  });

  logActivity_('SOW ' + id + ' added to project ' + projectId, 'blue', id);
  return { success: true, id: id };
}

function updateSOWItem(projectId, sowId, data) {
  const patch = {};
  if (data.description !== undefined) patch.description = data.description;
  if (data.budget !== undefined) patch.budget = parseFloat(data.budget) || 0;
  if (data.actual !== undefined) patch.actual = parseFloat(data.actual) || 0;
  if (data.startDate !== undefined) patch.startDate = data.startDate;
  if (data.endDate !== undefined) patch.endDate = data.endDate;
  if (data.status !== undefined) patch.status = data.status;
  
  const found = findRowNum_('SOWItems', 'id', sowId);
  if (found === -1) throw new Error('SOW item not found.');
  
  updateRow_('SOWItems', 'id', sowId, patch);
  logActivity_('SOW ' + sowId + ' updated', 'blue', sowId);
  return { success: true };
}

function deleteSOWItem(projectId, sowId) {
  const rowNum = findRowNum_('SOWItems', 'id', sowId);
  if (rowNum > -1) {
    sheet_('SOWItems').deleteRow(rowNum);
  }
  
  const group = readAll_('EstimateGroups').find(function (g) { return g.projectId === projectId && g.sowId === sowId; });
  if (group) {
    const groupRow = findRowNum_('EstimateGroups', 'id', group.id);
    if (groupRow > -1) {
      sheet_('EstimateGroups').deleteRow(groupRow);
    }
  }
  
  logActivity_('SOW ' + sowId + ' deleted from project ' + projectId, 'a', sowId);
  return { success: true };
}

// ============================================================
//  PHOTO UPLOAD
// ============================================================

function uploadImage(base64Data, fileName, mimeType) {
  try {
    const blob = Utilities.newBlob(
      Utilities.base64Decode(base64Data),
      mimeType || 'image/jpeg',
      fileName || 'image_' + Date.now() + '.jpg'
    );
    const folder = getOrCreateAttachmentsFolder_();
    const file = folder.createFile(blob);
    return { success: true, url: file.getUrl(), id: file.getId() };
  } catch (e) {
    throw new Error('Image upload failed: ' + e.message);
  }
}

function getSOWItemsForProject(projectId) {
  return readAll_('SOWItems').filter(function (s) {
    return s.projectId === projectId;
  }).map(function(s) {
    return {
      id: s.id,
      description: s.description,
      qty: parseFloat(s.qty || 0),
      unit: s.unit || ''
    };
  });
}