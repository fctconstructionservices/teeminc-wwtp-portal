/**
 * Code.gs — FCTC Operations Board backend (v2 - Separate Sheets)
 * 
 * PURPOSE: This file serves as the backend API for the FCTC Operations Board.
 * It handles all data operations with separate sheets for each request type.
 * 
 * NEW STRUCTURE:
 *   - CashAdvanceRequests (CA-***) - Cash advance requests
 *   - CashRelease (REL-***) - Cash release records
 *   - IncomingCashRequests (IC-***) - Incoming cash requests
 *   - Materials (MAT-***) - Materials requests
 *   - Equipment (EQ-***) - Equipment requests
 *   - Other sheets remain (Projects, SOWItems, DailyRecords, Estimates, etc.)
 * 
 * STATUS FLOWS:
 *   - Cash Advance: Pending → Approved → (auto-copy to CashRelease as Pending)
 *   - Cash Release: Pending → For Review → Reviewed
 *   - Incoming Cash: Pending → Approved/Rejected
 *   - Materials/Equipment: Pending → Approved/Rejected
 */

const SHEET_ID = '1Z-1NtuiJ_BYfUD_9CGfccJmJT6hHmnunc5zbrHaMiDw';

// ============================================================
//  WEB APP ENTRY POINT
// ============================================================

let CURRENT_REQUEST_USER_EMAIL = '';

function doGet(e) {
  return jsonResponse_({ status: 'FCTC Operations Board API is running. Use POST requests.' });
}

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

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * API_ACTIONS - Maps action names to handler functions
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
  // Cash Advance
  submitCashAdvance: submitCashAdvance,
  approveCashAdvance: approveCashAdvance,
  // Cash Release
  submitRelease: submitRelease,
  reviewRelease: reviewRelease,
  getPendingCashReleases: getPendingCashReleases,
  // Incoming Cash
  submitIncomingCash: submitIncomingCash,
  approveIncomingCash: approveIncomingCash,
  // SOW
  addSOWItem: addSOWItem,
  updateSOWItem: updateSOWItem,
  deleteSOWItem: deleteSOWItem,
  addProject: addProject,
  getSOWItemsForProject: getSOWItemsForProject,
  uploadImage: uploadImage
};

// ============================================================
//  GENERIC SHEET HELPERS
// ============================================================

function ss_() { return SpreadsheetApp.openById(SHEET_ID); }
function sheet_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('Sheet not found: ' + name);
  return sh;
}
function headers_(name) { return SCHEMAS[name]; }

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

function appendRow_(name, obj) {
  const sh = sheet_(name);
  const heads = headers_(name);
  const row = heads.map(function (h) { return (obj[h] !== undefined && obj[h] !== null) ? obj[h] : ''; });
  sh.appendRow(row);
  return obj;
}

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

function nextId_(prefix) {
  return prefix + '-' + Utilities.getUuid().slice(0, 8).toUpperCase();
}

function logActivity_(text, type, refId) {
  appendRow_('ActivityLog', {
    timestamp: new Date(),
    text: text,
    type: type || 'blue',
    refId: refId || ''
  });
}

function currentUserEmail_() {
  return CURRENT_REQUEST_USER_EMAIL || '';
}

function currentUserName_() {
  const email = currentUserEmail_();
  const u = readAll_('Users').find(function (row) { return String(row.email).toLowerCase() === String(email).toLowerCase(); });
  return u ? u.name : (email || 'Unknown User');
}

function getAllAdminsExceptSuperAdmin_() {
  return readAll_('Users')
    .filter(function (u) { return u.role === 'admin'; })
    .map(function (u) { return String(u.email).toLowerCase(); });
}

function getAdminEmails_() {
  return readAll_('Users')
    .filter(function (u) { return u.role === 'admin' || u.role === 'approver'; })
    .map(function (u) { return String(u.email).toLowerCase(); });
}

// ============================================================
//  FINANCIAL HELPERS
// ============================================================

function getTotalIncomingCashForProject(projectId) {
  const allIncoming = readAll_('IncomingCashRequests');
  return allIncoming
    .filter(function (c) { return c.projectId === projectId && c.status === 'Approved'; })
    .reduce(function (sum, c) { return sum + (parseFloat(c.amount) || 0); }, 0);
}

function getTotalReleasedCashForProject(projectId) {
  const allReleased = readAll_('CashRelease');
  return allReleased
    .filter(function (r) { return r.projectId === projectId && r.status === 'Reviewed'; })
    .reduce(function (sum, r) { return sum + (parseFloat(r.amount) || 0); }, 0);
}

// ============================================================
//  AUTH
// ============================================================

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

// ============================================================
//  HOME
// ============================================================

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

  const cashAdvances = readAll_('CashAdvanceRequests');
  const pendingCA = cashAdvances.filter(function (r) { return r.status === 'Pending'; });
  const pendingApprovals = pendingCA.length;

  const cashReleases = readAll_('CashRelease');
  const pendingReleases = cashReleases.filter(function (r) { return r.status === 'Pending'; });
  const reviewingReleases = cashReleases.filter(function (r) { return r.status === 'For Review'; });

  const releasedThisMonth = cashReleases
    .filter(function (r) { return r.status === 'Reviewed' && new Date(r.createdAt).getMonth() === new Date().getMonth(); })
    .reduce(function (s, r) { return s + (parseFloat(r.amount) || 0); }, 0);

  const allIncoming = readAll_('IncomingCashRequests');
  const totalIncoming = allIncoming
    .filter(function (c) { return c.status === 'Approved'; })
    .reduce(function (s, c) { return s + (parseFloat(c.amount) || 0); }, 0);

  const totalReleased = cashReleases
    .filter(function (r) { return r.status === 'Reviewed'; })
    .reduce(function (s, r) { return s + (parseFloat(r.amount) || 0); }, 0);

  const availableBudget = totalIncoming - totalReleased;

  const gauges = [
    { label: 'Pending Approval', value: String(pendingCA.length), color: '#C2860F', dashOffset: 70 },
    { label: 'Pending Release', value: String(pendingReleases.length), color: '#24455A', dashOffset: 55 },
    { label: 'Released, This Month', value: '₱' + releasedThisMonth.toLocaleString(), color: '#2F7A46', dashOffset: 60 },
    { label: 'Total Liquid Cash', value: '₱' + availableBudget.toLocaleString(), color: '#24455A', dashOffset: 30 }
  ];

  const logs = readAll_('ActivityLog').slice(-10).reverse().map(function (l) {
    return { text: l.text, time: Utilities.formatDate(new Date(l.timestamp), Session.getScriptTimeZone(), 'MMM d'), type: l.type };
  });

  return { projects: projects, gauges: gauges, pendingRequests: pendingCA, logs: logs };
}

// ============================================================
//  PROJECT
// ============================================================

function addProject(id, name, status, revenue, expenses, cashPosition) {
  var userEmail = currentUserEmail_();
  var users = readAll_('Users');
  var user = users.find(function(u) { return u.email.toLowerCase() === userEmail.toLowerCase(); });
  if (!user || user.role !== 'superadmin') {
    throw new Error('Only Super Admin can add new projects.');
  }
  var projects = readAll_('Projects');
  var existing = projects.find(function(p) { return p.id === id; });
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
  logActivity_('New project "' + name + '" (' + id + ') created by ' + currentUserName_(), 'blue');
  return { success: true, id: id, name: name, message: 'Project "' + name + '" created successfully.' };
}

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

  const incomingCash = readAll_('IncomingCashRequests').filter(function (c) { return c.projectId === projectId && c.status === 'Approved'; });
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

  // Estimates (unchanged)
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

  const cashAdvanceRequests = readAll_('CashAdvanceRequests').filter(function (r) { return r.projectId === projectId; });
  const cashReleases = readAll_('CashRelease').filter(function (r) { return r.projectId === projectId; });

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
    cashAdvanceRequests: cashAdvanceRequests,
    cashReleases: cashReleases,
    incomingCash: incomingCash,
    sowItems: sowItems,
    dailyRecords: dailyRecords,
    estimates: { groups: estimateGroups },
    photos: allPhotos
  };
}

function safeParse_(str, fallback) {
  try { return str ? JSON.parse(str) : fallback; } catch (e) { return fallback; }
}

// ============================================================
//  DAILY RECORDS (unchanged)
// ============================================================

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
      } catch (e) {}
    });
  }

  const workAccomplishedWithUrls = (data.workAccomplished || []).map(function (w) {
    if (w.image && w.image.startsWith && !w.image.startsWith('data:')) return w;
    return w;
  });
  const issuesWithUrls = (data.issues || []).map(function (iss) {
    if (iss.image && iss.image.startsWith && !iss.image.startsWith('data:')) return iss;
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

function submitDailyRecordForApproval(recordId) {
  updateRow_('DailyRecords', 'id', recordId, { status: 'pending' });
  // We'll keep a generic request entry for daily records in the old Requests sheet for backward compatibility?
  // Actually we can just use the DailyRecords sheet directly.
  // For approvals, we'll handle in getPendingApprovals.
  logActivity_('Daily record ' + recordId + ' submitted for approval', 'g', recordId);
  return { success: true };
}

function approveDailyRecord(recordId) {
  updateRow_('DailyRecords', 'id', recordId, { status: 'approved' });
  logActivity_('Daily record ' + recordId + ' approved', 'g', recordId);
  return { success: true };
}

function rejectDailyRecord(recordId) {
  updateRow_('DailyRecords', 'id', recordId, { status: 'rejected' });
  logActivity_('Daily record ' + recordId + ' rejected', 'a', recordId);
  return { success: true };
}

function getPendingDailyRecords() {
  return readAll_('DailyRecords').filter(function (d) { return d.status === 'pending'; });
}

// ============================================================
//  ESTIMATES (unchanged)
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

// ============================================================
//  MATERIALS & EQUIPMENT (unchanged)
// ============================================================

function getAllMaterials() { return readAll_('Materials'); }
function getMaterials(status) { return readAll_('Materials').filter(function (m) { return m.status === status; }); }
function requestMaterial(data) {
  const id = nextId_('MAT');
  appendRow_('Materials', {
    id: id, code: data.code || id, name: data.name, desc: data.desc, category: data.category,
    unit: data.unit, rate: data.rate, brand: data.brand, supplier: data.supplier,
    image: data.image || '', docsJSON: JSON.stringify(data.docs || []), notes: data.notes || '',
    status: 'Pending', requestedBy: currentUserEmail_(), createdAt: new Date()
  });
  logActivity_('Material Database Update Request: "' + data.name + '" requested by ' + currentUserName_(), 'blue');
  return { success: true, id: id };
}
function approveMaterial(id) { updateRow_('Materials', 'id', id, { status: 'approved' }); logActivity_('Material ' + id + ' approved', 'g'); return { success: true }; }
function searchMaterials(query) {
  query = String(query || '').toLowerCase();
  return readAll_('Materials').filter(function (m) {
    return (m.name && m.name.toLowerCase().indexOf(query) > -1) ||
      (m.code && String(m.code).toLowerCase().indexOf(query) > -1);
  });
}

function getAllEquipment() { return readAll_('Equipment'); }
function getEquipment(status) { return readAll_('Equipment').filter(function (e) { return e.status === status; }); }
function requestEquipment(data) {
  const id = nextId_('EQ');
  appendRow_('Equipment', {
    id: id, code: data.code || id, name: data.name, desc: data.desc, category: data.category,
    unit: data.unit, rate: data.rate, brand: data.brand, supplier: data.supplier,
    image: data.image || '', docsJSON: JSON.stringify(data.docs || []), notes: data.notes || '',
    status: 'Pending', requestedBy: currentUserEmail_(), createdAt: new Date()
  });
  logActivity_('Equipment "' + data.name + '" requested by ' + currentUserName_(), 'blue');
  return { success: true, id: id };
}
function approveEquipment(id) { updateRow_('Equipment', 'id', id, { status: 'approved' }); logActivity_('Equipment ' + id + ' approved', 'g'); return { success: true }; }
function searchEquipment(query) {
  query = String(query || '').toLowerCase();
  return readAll_('Equipment').filter(function (e) {
    return (e.name && e.name.toLowerCase().indexOf(query) > -1) ||
      (e.code && String(e.code).toLowerCase().indexOf(query) > -1);
  });
}

// ============================================================
//  CASH ADVANCE
// ============================================================

function submitCashAdvance(payload) {
  const uploaded = uploadAttachmentIfAny_(payload);
  const fileUrl = uploaded.fileUrl;
  const fileName = uploaded.fileName;

  const id = nextId_('CA');
  var projectName = '';
  if (payload.project) {
    var projects = readAll_('Projects');
    var proj = projects.find(function(p) { return p.id === payload.project || p.name === payload.project; });
    projectName = proj ? ' for ' + proj.name : ' for ' + payload.project;
  }

  appendRow_('CashAdvanceRequests', {
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
    dateNeeded: payload.dateNeeded || ""
  });

  logActivity_('Cash advance ₱' + payload.amount + ' requested by ' + currentUserName_() + projectName, 'blue', id);
  return { success: true, requestId: id, fileUrl: fileUrl, fileName: fileName };
}

function approveCashAdvance(id) {
  const ca = readAll_('CashAdvanceRequests').find(function (r) { return r.id === id; });
  if (!ca) throw new Error('Cash advance request not found.');
  if (ca.status !== 'Pending') throw new Error('Request is not pending.');

  // Update status to Approved
  updateRow_('CashAdvanceRequests', 'id', id, { status: 'Approved' });

  // AUTO-COPY to CashRelease sheet with status 'Pending'
  const releaseId = nextId_('REL');
  appendRow_('CashRelease', {
    id: releaseId,
    originalRequestId: id,
    projectId: ca.projectId || '',
    requestor: ca.requestor,
    requestorEmail: ca.requestorEmail,
    amount: ca.amount,
    description: ca.description,
    scope: ca.scope,
    status: 'Pending',
    createdAt: new Date(),
    releasedBy: '',
    releasedAt: '',
    reviewedByJSON: '[]'
  });

  logActivity_('Cash advance ' + id + ' approved and copied to CashRelease as ' + releaseId + ' (Pending)', 'g', id);
  return { success: true, releaseId: releaseId };
}

// ============================================================
//  CASH RELEASE
// ============================================================

function getPendingCashReleases() {
  return readAll_('CashRelease').filter(function (r) { return r.status === 'Pending'; });
}

function submitRelease(payload) {
  const releaseId = payload.releaseId; // from dropdown
  const releaseAmount = parseFloat(payload.amount) || 0;

  const allReleases = readAll_('CashRelease');
  const release = allReleases.find(function (r) { return r.id === releaseId && r.status === 'Pending'; });
  if (!release) throw new Error('Pending release record not found.');

  const approvedAmount = parseFloat(release.amount) || 0;
  if (releaseAmount > approvedAmount) {
    throw new Error('Release amount (₱' + releaseAmount.toFixed(2) + ') exceeds approved amount (₱' + approvedAmount.toFixed(2) + ').');
  }

  // Update the release record
  updateRow_('CashRelease', 'id', releaseId, {
    status: 'For Review',
    releasedBy: currentUserEmail_(),
    releasedAt: new Date(),
    amount: releaseAmount // store the actual released amount (could be partial)
  });

  // Update the original Cash Advance status to 'Released'
  const caId = release.originalRequestId;
  if (caId) {
    updateRow_('CashAdvanceRequests', 'id', caId, { status: 'Released' });
  }

  logActivity_('Release of ₱' + releaseAmount + ' for ' + releaseId + ' submitted by ' + currentUserName_() + ' (For Review)', 'blue', releaseId);
  return { success: true, releaseId: releaseId };
}

function reviewRelease(releaseId, reviewerEmail) {
  const release = readAll_('CashRelease').find(function (r) { return r.id === releaseId && r.status === 'For Review'; });
  if (!release) throw new Error('Release record not found or not in For Review status.');

  if (release.releasedBy && release.releasedBy.toLowerCase() === reviewerEmail.toLowerCase()) {
    throw new Error('Self-review is not allowed.');
  }

  // Get existing reviewers
  let reviewedBy = [];
  try {
    reviewedBy = JSON.parse(release.reviewedByJSON || '[]');
  } catch (e) { reviewedBy = []; }

  if (reviewedBy.indexOf(reviewerEmail.toLowerCase()) === -1) {
    reviewedBy.push(reviewerEmail.toLowerCase());
  }

  // Update reviewedByJSON
  updateRow_('CashRelease', 'id', releaseId, { reviewedByJSON: JSON.stringify(reviewedBy) });

  // Get all admins except superadmin
  const admins = getAllAdminsExceptSuperAdmin_();
  const requiredReviewers = admins.filter(function (admin) {
    return admin !== release.releasedBy.toLowerCase();
  });

  // Check if all required reviewers have reviewed
  const allReviewed = requiredReviewers.every(function (admin) {
    return reviewedBy.indexOf(admin) !== -1;
  });

  if (allReviewed) {
    updateRow_('CashRelease', 'id', releaseId, { status: 'Reviewed' });
    logActivity_('Release ' + releaseId + ' fully reviewed and released', 'g', releaseId);
    return { success: true, status: 'Reviewed' };
  } else {
    logActivity_('Release ' + releaseId + ' reviewed by ' + reviewerEmail, 'blue', releaseId);
    return { success: true, status: 'For Review' };
  }
}

// ============================================================
//  INCOMING CASH
// ============================================================

function submitIncomingCash(payload) {
  const uploaded = uploadAttachmentIfAny_(payload);
  const fileUrl = uploaded.fileUrl;
  const fileName = uploaded.fileName;

  const id = nextId_('IC');
  var projectName = '';
  if (payload.project) {
    var projects = readAll_('Projects');
    var proj = projects.find(function(p) { return p.id === payload.project || p.name === payload.project; });
    projectName = proj ? ' for ' + proj.name : ' for ' + payload.project;
  }

  appendRow_('IncomingCashRequests', {
    id: id,
    type: payload.type || 'Cash Injection',
    projectId: payload.project || '',
    requestor: currentUserName_(),
    requestorEmail: currentUserEmail_(),
    amount: payload.amount,
    description: payload.description || '',
    paymentMethod: payload.method || '',
    reference: payload.reference || '',
    transactionDate: payload.date || '',
    attachmentsJSON: JSON.stringify(fileUrl ? [{ url: fileUrl, name: fileName }] : []),
    status: 'Pending',
    createdAt: new Date()
  });

  logActivity_('Incoming cash ₱' + payload.amount + ' recorded by ' + currentUserName_() + projectName + ' (pending approval)', 'blue', id);
  return { success: true, requestId: id, fileUrl: fileUrl, fileName: fileName };
}

function approveIncomingCash(id) {
  const req = readAll_('IncomingCashRequests').find(function (r) { return r.id === id; });
  if (!req) throw new Error('Request not found.');
  if (req.status !== 'Pending') throw new Error('Request is not pending.');

  updateRow_('IncomingCashRequests', 'id', id, { status: 'Approved' });
  logActivity_('Incoming cash ₱' + req.amount + ' approved', 'g', id);
  return { success: true };
}

// ============================================================
//  APPROVALS
// ============================================================

function getPendingApprovals() {
  const userEmail = currentUserEmail_().toLowerCase();
  const isAdmin = readAll_('Users').find(function (u) { return u.email.toLowerCase() === userEmail && (u.role === 'admin' || u.role === 'superadmin'); });

  // Cash Advance Pending
  const cashAdvances = readAll_('CashAdvanceRequests').filter(function (r) {
    return r.status === 'Pending' && r.requestorEmail.toLowerCase() !== userEmail;
  }).map(function (r) {
    return { id: r.id, type: 'Cash Advance', projectId: r.projectId, requestor: r.requestor, requestorEmail: r.requestorEmail, amount: r.amount, description: r.description, status: r.status, createdAt: r.createdAt };
  });

  // Cash Release For Review (only for admins, exclude superadmin)
  let releases = [];
  if (isAdmin && isAdmin.role !== 'superadmin') {
    releases = readAll_('CashRelease').filter(function (r) {
      return r.status === 'For Review' && r.releasedBy && r.releasedBy.toLowerCase() !== userEmail;
    }).map(function (r) {
      return { id: r.id, type: 'Cash Release', projectId: r.projectId, requestor: r.requestor, requestorEmail: r.requestorEmail, amount: r.amount, description: r.description, status: r.status, createdAt: r.createdAt };
    });
  }

  // Materials, Equipment, DailyRecords (kept in their own sheets)
  const materials = readAll_('Materials').filter(function (m) { return m.status === 'Pending' && m.requestedBy && m.requestedBy.toLowerCase() !== userEmail; });
  const equipment = readAll_('Equipment').filter(function (e) { return e.status === 'Pending' && e.requestedBy && e.requestedBy.toLowerCase() !== userEmail; });
  const dailyRecords = readAll_('DailyRecords').filter(function (d) { return d.status === 'pending' && d.createdBy && d.createdBy.toLowerCase() !== userEmail; });

  // Estimates
  const estimates = readAll_('EstimateGroups').filter(function (g) { return g.status === 'pending'; });

  return {
    cashAdvances: cashAdvances,
    releases: releases,
    materials: materials,
    equipment: equipment,
    dailyRecords: dailyRecords,
    estimates: estimates
  };
}

function getMyPendingRequests() {
  const email = currentUserEmail_().toLowerCase();
  const cashAdvances = readAll_('CashAdvanceRequests').filter(function (r) { return r.requestorEmail && r.requestorEmail.toLowerCase() === email && r.status === 'Pending'; });
  const releases = readAll_('CashRelease').filter(function (r) { return r.requestorEmail && r.requestorEmail.toLowerCase() === email && r.status === 'Pending'; });
  const incoming = readAll_('IncomingCashRequests').filter(function (r) { return r.requestorEmail && r.requestorEmail.toLowerCase() === email && r.status === 'Pending'; });
  const materials = readAll_('Materials').filter(function (m) { return m.requestedBy && m.requestedBy.toLowerCase() === email && m.status === 'Pending'; });
  const equipment = readAll_('Equipment').filter(function (e) { return e.requestedBy && e.requestedBy.toLowerCase() === email && e.status === 'Pending'; });
  const dailyRecords = readAll_('DailyRecords').filter(function (d) { return d.createdBy && d.createdBy.toLowerCase() === email && d.status === 'pending'; });
  const estimates = readAll_('EstimateGroups').filter(function (g) { return g.status === 'pending'; });

  return [...cashAdvances, ...releases, ...incoming, ...materials, ...equipment, ...dailyRecords, ...estimates];
}

function getMyApprovedRequests() {
  const email = currentUserEmail_().toLowerCase();
  const cashAdvances = readAll_('CashAdvanceRequests').filter(function (r) { return r.requestorEmail && r.requestorEmail.toLowerCase() === email && r.status === 'Approved'; });
  const incoming = readAll_('IncomingCashRequests').filter(function (r) { return r.requestorEmail && r.requestorEmail.toLowerCase() === email && r.status === 'Approved'; });
  const materials = readAll_('Materials').filter(function (m) { return m.requestedBy && m.requestedBy.toLowerCase() === email && m.status === 'approved'; });
  const equipment = readAll_('Equipment').filter(function (e) { return e.requestedBy && e.requestedBy.toLowerCase() === email && e.status === 'approved'; });
  const dailyRecords = readAll_('DailyRecords').filter(function (d) { return d.createdBy && d.createdBy.toLowerCase() === email && d.status === 'approved'; });
  return [...cashAdvances, ...incoming, ...materials, ...equipment, ...dailyRecords];
}

function getMyRejectedRequests() {
  const email = currentUserEmail_().toLowerCase();
  const cashAdvances = readAll_('CashAdvanceRequests').filter(function (r) { return r.requestorEmail && r.requestorEmail.toLowerCase() === email && r.status === 'Rejected'; });
  const incoming = readAll_('IncomingCashRequests').filter(function (r) { return r.requestorEmail && r.requestorEmail.toLowerCase() === email && r.status === 'Rejected'; });
  const materials = readAll_('Materials').filter(function (m) { return m.requestedBy && m.requestedBy.toLowerCase() === email && m.status === 'rejected'; });
  const equipment = readAll_('Equipment').filter(function (e) { return e.requestedBy && e.requestedBy.toLowerCase() === email && e.status === 'rejected'; });
  const dailyRecords = readAll_('DailyRecords').filter(function (d) { return d.createdBy && d.createdBy.toLowerCase() === email && d.status === 'rejected'; });
  return [...cashAdvances, ...incoming, ...materials, ...equipment, ...dailyRecords];
}

function getRequestById(id) {
  // Check all sheets
  let req = readAll_('CashAdvanceRequests').find(function (r) { return r.id === id; });
  if (req) return req;
  req = readAll_('CashRelease').find(function (r) { return r.id === id; });
  if (req) return req;
  req = readAll_('IncomingCashRequests').find(function (r) { return r.id === id; });
  if (req) return req;
  req = readAll_('Materials').find(function (m) { return m.id === id; });
  if (req) return req;
  req = readAll_('Equipment').find(function (e) { return e.id === id; });
  if (req) return req;
  req = readAll_('DailyRecords').find(function (d) { return d.id === id; });
  if (req) return req;
  return null;
}

// For approveItem and rejectItem, we need to handle different types
function approveItem(id, type) {
  return decideItem_(id, type, 'Approved');
}

function rejectItem(id, type) {
  return decideItem_(id, type, 'Rejected');
}

function decideItem_(id, type, decision) {
  const approver = currentUserEmail_().toLowerCase();

  if (type === 'CashAdvance') {
    const ca = readAll_('CashAdvanceRequests').find(function (r) { return r.id === id; });
    if (!ca) throw new Error('Request not found.');
    if (ca.requestorEmail && ca.requestorEmail.toLowerCase() === approver) {
      throw new Error('Self-approval is not allowed.');
    }
    if (ca.status !== 'Pending') throw new Error('Request is not pending.');
    if (decision === 'Approved') {
      return approveCashAdvance(id);
    } else {
      updateRow_('CashAdvanceRequests', 'id', id, { status: 'Rejected' });
      logActivity_('Cash advance ' + id + ' rejected', 'a', id);
      return { success: true, status: 'Rejected' };
    }
  }

  if (type === 'IncomingCash') {
    const inc = readAll_('IncomingCashRequests').find(function (r) { return r.id === id; });
    if (!inc) throw new Error('Request not found.');
    if (inc.requestorEmail && inc.requestorEmail.toLowerCase() === approver) {
      throw new Error('Self-approval is not allowed.');
    }
    if (inc.status !== 'Pending') throw new Error('Request is not pending.');
    if (decision === 'Approved') {
      return approveIncomingCash(id);
    } else {
      updateRow_('IncomingCashRequests', 'id', id, { status: 'Rejected' });
      logActivity_('Incoming cash ' + id + ' rejected', 'a', id);
      return { success: true, status: 'Rejected' };
    }
  }

  if (type === 'Material') {
    const mat = readAll_('Materials').find(function (m) { return m.id === id; });
    if (!mat) throw new Error('Material not found.');
    if (mat.requestedBy && mat.requestedBy.toLowerCase() === approver) {
      throw new Error('Self-approval is not allowed.');
    }
    if (mat.status !== 'Pending') throw new Error('Material is not pending.');
    updateRow_('Materials', 'id', id, { status: decision === 'Approved' ? 'approved' : 'rejected' });
    logActivity_('Material ' + id + ' ' + (decision === 'Approved' ? 'approved' : 'rejected'), decision === 'Approved' ? 'g' : 'a', id);
    return { success: true };
  }

  if (type === 'Equipment') {
    const eq = readAll_('Equipment').find(function (e) { return e.id === id; });
    if (!eq) throw new Error('Equipment not found.');
    if (eq.requestedBy && eq.requestedBy.toLowerCase() === approver) {
      throw new Error('Self-approval is not allowed.');
    }
    if (eq.status !== 'Pending') throw new Error('Equipment is not pending.');
    updateRow_('Equipment', 'id', id, { status: decision === 'Approved' ? 'approved' : 'rejected' });
    logActivity_('Equipment ' + id + ' ' + (decision === 'Approved' ? 'approved' : 'rejected'), decision === 'Approved' ? 'g' : 'a', id);
    return { success: true };
  }

  if (type === 'DailyRecord') {
    const dr = readAll_('DailyRecords').find(function (d) { return d.id === id; });
    if (!dr) throw new Error('Daily record not found.');
    if (dr.createdBy && dr.createdBy.toLowerCase() === approver) {
      throw new Error('Self-approval is not allowed.');
    }
    if (dr.status !== 'pending') throw new Error('Daily record is not pending.');
    updateRow_('DailyRecords', 'id', id, { status: decision === 'Approved' ? 'approved' : 'rejected' });
    logActivity_('Daily record ' + id + ' ' + (decision === 'Approved' ? 'approved' : 'rejected'), decision === 'Approved' ? 'g' : 'a', id);
    return { success: true };
  }

  if (type === 'Estimate') {
    // Estimates are handled via approveEstimates
    return approveEstimates(id);
  }

  throw new Error('Invalid type for approval: ' + type);
}

// ─── SUPER ADMIN FORCE APPROVE/REJECT ─────────────────────────

function forceApprove(id, type) {
  const user = readAll_('Users').find(function (u) { 
    return String(u.email).toLowerCase() === currentUserEmail_().toLowerCase(); 
  });
  if (!user || user.role !== 'superadmin') {
    throw new Error('Only the Super Admin can force-approve.');
  }
  // Just call approveItem with superadmin override
  return decideItem_(id, type, 'Approved');
}

function forceReject(id, type) {
  const user = readAll_('Users').find(function (u) { 
    return String(u.email).toLowerCase() === currentUserEmail_().toLowerCase(); 
  });
  if (!user || user.role !== 'superadmin') {
    throw new Error('Only the Super Admin can force-reject.');
  }
  return decideItem_(id, type, 'Rejected');
}

// ============================================================
//  FINANCE
// ============================================================

function getFinanceData() {
  const projects = readAll_('Projects');
  const allIncoming = readAll_('IncomingCashRequests');
  const allReleases = readAll_('CashRelease');
  const sowItems = readAll_('SOWItems');
  const now = new Date();

  let totalRevenue = 0;
  let totalExpenses = 0;
  projects.forEach(function (p) {
    totalRevenue += getTotalIncomingCashForProject(p.id);
    totalExpenses += getTotalReleasedCashForProject(p.id);
  });
  const cashPosition = totalRevenue - totalExpenses;

  const pendingCA = readAll_('CashAdvanceRequests').filter(function (r) { return r.status === 'Pending'; });
  const pendingAmount = pendingCA.reduce(function (s, r) { return s + Number(r.amount || 0); }, 0);

  const kpis = [
    { label: 'Total Revenue', value: '₱' + totalRevenue.toFixed(2), sub: 'All projects', cls: 'good' },
    { label: 'Total Expenses', value: '₱' + totalExpenses.toFixed(2), sub: 'All projects', cls: '' },
    { label: 'Cash Position', value: '₱' + cashPosition.toFixed(2), sub: 'Revenue - Expenses', cls: 'good' },
    { label: 'Pending Requests', value: String(pendingCA.length), sub: '₱' + pendingAmount.toFixed(2) + ' total', cls: 'warn' }
  ];

  // Monthly cashflow (based on incoming approved and release reviewed)
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ label: Utilities.formatDate(d, Session.getScriptTimeZone(), 'MMM'), year: d.getFullYear(), month: d.getMonth() });
  }
  const inflow = months.map(function (m) {
    return allIncoming.filter(function (c) {
      const cd = new Date(c.transactionDate || c.createdAt);
      return cd.getFullYear() === m.year && cd.getMonth() === m.month && c.status === 'Approved';
    }).reduce(function (s, c) { return s + Number(c.amount || 0); }, 0);
  });
  const outflow = months.map(function (m) {
    return allReleases.filter(function (r) {
      const rd = new Date(r.releasedAt || r.createdAt);
      return rd.getFullYear() === m.year && rd.getMonth() === m.month && r.status === 'Reviewed';
    }).reduce(function (s, r) { return s + Number(r.amount || 0); }, 0);
  });
  const cashflow = { labels: months.map(function (m) { return m.label; }), inflow: inflow, outflow: outflow, projectedFrom: months.length };

  const budgetVsActual = {
    labels: projects.map(function (p) { return p.name; }),
    budget: projects.map(function (p) {
      const items = sowItems.filter(function (s) { return s.projectId === p.id; });
      return items.reduce(function (s, i) { return s + Number(i.budget || 0); }, 0);
    }),
    actual: projects.map(function (p) {
      const items = sowItems.filter(function (s) { return s.projectId === p.id; });
      return items.reduce(function (s, i) { return s + Number(i.actual || 0); }, 0);
    })
  };

  const typeGroups = {};
  allIncoming.filter(function (c) { return c.status === 'Approved'; }).forEach(function (c) {
    typeGroups['Incoming'] = (typeGroups['Incoming'] || 0) + Number(c.amount || 0);
  });
  allReleases.filter(function (r) { return r.status === 'Reviewed'; }).forEach(function (r) {
    typeGroups['Release'] = (typeGroups['Release'] || 0) + Number(r.amount || 0);
  });
  const breakdownKeys = Object.keys(typeGroups);
  const breakdownTotal = Object.values(typeGroups).reduce(function (s, v) { return s + v; }, 0) || 1;
  const breakdown = {
    labels: breakdownKeys.length ? breakdownKeys : ['No data'],
    values: breakdownKeys.length ? breakdownKeys.map(function (k) { return Math.round((typeGroups[k] / breakdownTotal) * 100); }) : [100]
  };

  // Aging for pending cash advances
  const pendingCAForAging = readAll_('CashAdvanceRequests').filter(function (r) { return r.status === 'Pending'; });
  const buckets = { '0-30 days': 0, '31-60 days': 0, '61-90 days': 0, '90+ days': 0 };
  pendingCAForAging.forEach(function (r) {
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
    const budget = items.reduce(function (s, i) { return s + Number(i.budget || 0); }, 0);
    const actual = items.reduce(function (s, i) { return s + Number(i.actual || 0); }, 0);
    const pct = budget > 0 ? (actual / budget) * 100 : 0;
    const status = pct >= 100 ? 'Over Budget' : pct >= 85 ? 'At Risk' : 'On Track';
    const cls = pct >= 100 ? 'danger' : pct >= 85 ? 'warn' : 'good';
    return { project: p.name, budget: budget, actual: actual, status: status, cls: cls };
  });

  return { kpis: kpis, cashflow: cashflow, budgetVsActual: budgetVsActual, breakdown: breakdown, aging: aging, costStatus: costStatus };
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
  readAll_('CashAdvanceRequests').forEach(function (r) {
    if (r.id.toLowerCase().indexOf(query) > -1 || (r.description && r.description.toLowerCase().indexOf(query) > -1)) {
      results.push({ type: 'Cash Advance', id: r.id, label: r.description });
    }
  });
  readAll_('CashRelease').forEach(function (r) {
    if (r.id.toLowerCase().indexOf(query) > -1) results.push({ type: 'Cash Release', id: r.id, label: r.description });
  });
  readAll_('IncomingCashRequests').forEach(function (r) {
    if (r.id.toLowerCase().indexOf(query) > -1 || (r.description && r.description.toLowerCase().indexOf(query) > -1)) {
      results.push({ type: 'Incoming Cash', id: r.id, label: r.description });
    }
  });
  readAll_('Materials').forEach(function (m) {
    if (m.name && m.name.toLowerCase().indexOf(query) > -1) results.push({ type: 'Material', id: m.id, label: m.name });
  });
  readAll_('Equipment').forEach(function (e) {
    if (e.name && e.name.toLowerCase().indexOf(query) > -1) results.push({ type: 'Equipment', id: e.id, label: e.name });
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
  if (existing) throw new Error('SOW ID already exists for this project.');

  appendRow_('SOWItems', {
    id: id, projectId: projectId, description: description,
    budget: budget, actual: actual, startDate: startDate, endDate: endDate,
    status: status, qty: qty, unit: unit
  });

  appendRow_('EstimateGroups', {
    id: nextId_('EG'), projectId: projectId, sowId: id,
    sowDescription: description, status: 'draft'
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
  if (rowNum > -1) sheet_('SOWItems').deleteRow(rowNum);
  const group = readAll_('EstimateGroups').find(function (g) { return g.projectId === projectId && g.sowId === sowId; });
  if (group) {
    const groupRow = findRowNum_('EstimateGroups', 'id', group.id);
    if (groupRow > -1) sheet_('EstimateGroups').deleteRow(groupRow);
  }
  logActivity_('SOW ' + sowId + ' deleted from project ' + projectId, 'a', sowId);
  return { success: true };
}

function getSOWItemsForProject(projectId) {
  return readAll_('SOWItems').filter(function (s) { return s.projectId === projectId; })
    .map(function(s) {
      return { id: s.id, description: s.description, qty: parseFloat(s.qty || 0), unit: s.unit || '' };
    });
}

// ============================================================
//  ATTACHMENTS & PHOTO UPLOAD
// ============================================================

function getOrCreateAttachmentsFolder_() {
  const name = 'FCTC Ops Board Attachments';
  const folders = DriveApp.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(name);
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