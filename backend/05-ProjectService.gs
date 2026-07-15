/**
 * 05-ProjectService.gs — Home dashboard, projects, and SOW items
 *
 * PURPOSE: Aggregated read models for the Home page and the Project
 * page, plus CRUD for projects and their Scope-of-Work (SOW) items.
 *
 * getProjectData() is the heaviest endpoint: it joins Projects,
 * SOWItems, DailyRecords (JSON columns are parsed), the four
 * Estimate* sheets, and all cash sheets into one payload so the
 * frontend needs a single round-trip per project open.
 */

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

  const cashReleases = readAll_('CashRelease');
  const pendingReleases = cashReleases.filter(function (r) { return r.status === 'Pending'; });
  const reviewingReleases = cashReleases.filter(function (r) { return r.status === 'For Review'; });

  const liquidations = readAll_('Liquidations');
  const pendingLiquidation = liquidations.filter(function (l) { return l.status === 'Pending'; });

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
    { label: 'Pending Approval', value: String(pendingCA.length + pendingLiquidation.length), color: '#C2860F', dashOffset: 70 },
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
  const liquidations = readAll_('Liquidations').filter(function (l) { return l.projectId === projectId; });

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
    liquidations: liquidations,
    incomingCash: incomingCash,
    sowItems: sowItems,
    dailyRecords: dailyRecords,
    estimates: { groups: estimateGroups },
    photos: allPhotos
  };
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
