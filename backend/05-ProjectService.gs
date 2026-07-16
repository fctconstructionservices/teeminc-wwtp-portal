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

/**
 * addProject (v3) - Creates a project. Status is ALWAYS 'Ongoing' on
 * creation (the status dropdown was removed from the form); revenue,
 * expenses and cashPosition always start at 0 and are computed live
 * from cash sheets anyway.
 *
 * clientId must exist in ClientLists (use addClient first).
 */
function addProject(id, name, clientId, location, startDate, endDate) {
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
  if (clientId) {
    var client = readAll_('ClientLists').find(function(c) { return c.id === clientId; });
    if (!client) throw new Error('Selected client not found. Please refresh the client list.');
  }
  if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
    throw new Error('End date cannot be earlier than start date.');
  }
  appendRow_('Projects', {
    id: id,
    name: name || id,
    status: 'Ongoing',            // fixed on creation by design (v3)
    revenue: 0,
    expenses: 0,
    cashPosition: 0,
    clientId: clientId || '',
    location: location || '',
    startDate: startDate || '',
    endDate: endDate || ''
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
        startDate: fmtDate_(s.startDate),
        endDate: fmtDate_(s.endDate),
        status: s.status || 'On Track',
        qty: parseFloat(s.qty || 0),
        unit: s.unit || '',
        // v3 Gantt/budget fields
        budgetMode: s.budgetMode || 'auto',
        predecessors: String(s.predecessors || ''),
        isMilestone: String(s.isMilestone).toUpperCase() === 'TRUE',
        baselineStart: fmtDate_(s.baselineStart),
        baselineEnd: fmtDate_(s.baselineEnd)
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
      id: g.id,
      sowId: g.sowId,
      sowDescription: g.sowDescription,
      status: g.status,
      submittedBy: g.submittedBy || '',
      materials: allMat.filter(function (m) { return m.groupId === g.id; }),
      labor: allLabor.filter(function (l) { return l.groupId === g.id; }),
      equipment: allEq.filter(function (e) { return e.groupId === g.id; }),
      indirect: allInd.filter(function (i) { return i.groupId === g.id; })
    };
  });

  const cashAdvanceRequests = readAll_('CashAdvanceRequests').filter(function (r) { return r.projectId === projectId; });
  const cashReleases = readAll_('CashRelease').filter(function (r) { return r.projectId === projectId; });
  const liquidations = readAll_('Liquidations').filter(function (l) { return l.projectId === projectId; });

  // ─── v3: per-SOW effective budget, actual, and progress ───────
  const groupsById = {};
  groups.forEach(function (g) { groupsById[g.sowId] = g; });

  sowItems.forEach(function (s) {
    // Effective budget by budgetMode:
    //   'auto'     -> materials + labor + equipment from the estimate group
    //   'indirect' -> indirect costs only
    //   'manual'   -> the stored budget value (edited by hand)
    const g = groupsById[s.id];
    if (g && s.budgetMode !== 'manual') {
      s.budget = computeEstimateGroupTotalByMode_(g.id, s.budgetMode);
    }

    // Actual = sum of Reviewed cash releases tagged with this SOW item.
    // (A release inherits its sowId from the originating cash advance.)
    s.actual = cashReleases
      .filter(function (r) { return r.status === 'Reviewed' && String(r.sowId) === String(s.id); })
      .reduce(function (sum, r) { return sum + (parseFloat(r.amount) || 0); }, 0);

    // Progress from Daily Site Reports (non-rejected): among work
    // accomplished rows whose scope === this SOW id, the LATEST report
    // date wins; within that date the highest % is taken. Mirrors how
    // MS Project treats the most recent status update as truth.
    s.progress = computeSOWProgress_(s.id, dailyRecords);
  });

  // Budget-weighted total project completion (user-selected weighting).
  // Milestones (zero-duration, zero-budget) are excluded from the weights.
  const weighted = sowItems.filter(function (s) { return !s.isMilestone; });
  const totalBudget = weighted.reduce(function (sum, s) { return sum + (s.budget || 0); }, 0);
  const totalProgress = totalBudget > 0
    ? weighted.reduce(function (sum, s) { return sum + (s.budget || 0) * (s.progress || 0); }, 0) / totalBudget
    : (weighted.length ? weighted.reduce(function (sum, s) { return sum + (s.progress || 0); }, 0) / weighted.length : 0);

  const client = proj.clientId
    ? readAll_('ClientLists').find(function (c) { return c.id === proj.clientId; })
    : null;

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
    clientId: proj.clientId || '',
    clientName: client ? client.name : '',
    location: proj.location || '',
    startDate: fmtDate_(proj.startDate),
    endDate: fmtDate_(proj.endDate),
    totalProgress: Math.round(totalProgress * 10) / 10,
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

  // v3: new items default to starting TODAY and ending TOMORROW so
  // they immediately appear on the Gantt with a real 1-day bar.
  const tz = Session.getScriptTimeZone();
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  const startDate = data.startDate || Utilities.formatDate(today, tz, 'yyyy-MM-dd');
  const endDate = data.endDate || Utilities.formatDate(tomorrow, tz, 'yyyy-MM-dd');
  const status = 'On Track';

  const existing = readAll_('SOWItems').find(function (s) { return s.id === id && s.projectId === projectId; });
  if (existing) throw new Error('SOW ID already exists for this project.');

  appendRow_('SOWItems', {
    id: id, projectId: projectId, description: description,
    budget: budget, actual: actual, startDate: startDate, endDate: endDate,
    status: status, qty: qty, unit: unit,
    budgetMode: data.budgetMode || 'auto',
    predecessors: data.predecessors || '',
    isMilestone: data.isMilestone ? 'TRUE' : '',
    baselineStart: '', baselineEnd: ''
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
  // v3 fields
  if (data.qty !== undefined) patch.qty = parseFloat(data.qty) || 0;
  if (data.unit !== undefined) patch.unit = data.unit;
  if (data.budgetMode !== undefined) patch.budgetMode = data.budgetMode;
  if (data.predecessors !== undefined) patch.predecessors = String(data.predecessors || '');
  if (data.isMilestone !== undefined) patch.isMilestone = data.isMilestone ? 'TRUE' : '';
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
//  v3 — PROGRESS, BUDGET MODE, BASELINE
// ============================================================

/**
 * computeSOWProgress_ - % complete of one SOW item from Daily Site
 * Reports. Rejected reports are ignored. The report with the LATEST
 * date containing a work-accomplished row scoped to this SOW wins;
 * if that date has several rows for the same SOW, the highest % is
 * used. Returns 0-100.
 */
function computeSOWProgress_(sowId, dailyRecords) {
  let bestDate = null;
  let best = 0;
  (dailyRecords || []).forEach(function (d) {
    if (d.status === 'rejected') return;
    const rows = (d.workAccomplished || []).filter(function (w) {
      return String(w.scope) === String(sowId);
    });
    if (!rows.length) return;
    const pct = rows.reduce(function (mx, w) {
      return Math.max(mx, parseFloat(w.percentComplete) || 0);
    }, 0);
    const dt = new Date(d.date);
    if (bestDate === null || dt > bestDate || (dt.getTime() === bestDate.getTime() && pct > best)) {
      bestDate = dt;
      best = pct;
    }
  });
  return Math.min(100, Math.max(0, best));
}

/**
 * updateSOWBudget (v3) - Sets how a SOW item's budget is derived.
 *   mode 'auto'     -> live mat+labor+equipment total of its estimate
 *   mode 'indirect' -> live indirect-cost total of its estimate
 *   mode 'manual'   -> the given manualAmount, stored as-is
 * For auto/indirect the current computed value is also persisted so
 * the sheet itself stays readable.
 */
function updateSOWBudget(projectId, sowId, mode, manualAmount) {
  const valid = ['auto', 'indirect', 'manual'];
  if (valid.indexOf(mode) === -1) throw new Error('Invalid budget mode: ' + mode);

  const found = findRowNum_('SOWItems', 'id', sowId);
  if (found === -1) throw new Error('SOW item not found.');

  let budget;
  if (mode === 'manual') {
    budget = parseFloat(manualAmount) || 0;
  } else {
    const g = readAll_('EstimateGroups').find(function (row) {
      return row.projectId === projectId && row.sowId === sowId;
    });
    budget = g ? computeEstimateGroupTotalByMode_(g.id, mode) : 0;
  }

  updateRow_('SOWItems', 'id', sowId, { budgetMode: mode, budget: budget });
  logActivity_('SOW ' + sowId + ' budget set to ₱' + budget.toFixed(2) + ' (' + mode + ')', 'blue', sowId);
  return { success: true, budget: budget, mode: mode };
}

/**
 * saveBaseline (v3) - MS Project-style baseline snapshot: copies the
 * CURRENT start/end of every SOW item in the project into
 * baselineStart/baselineEnd. The Gantt then draws the baseline as a
 * thin ghost bar under each task so slippage is visible.
 */
function saveBaseline(projectId) {
  const items = readAll_('SOWItems').filter(function (s) { return s.projectId === projectId; });
  if (!items.length) throw new Error('No SOW items to baseline.');
  items.forEach(function (s) {
    updateRow_('SOWItems', 'id', s.id, {
      baselineStart: s.startDate || '',
      baselineEnd: s.endDate || ''
    });
  });
  logActivity_('Baseline saved for project ' + projectId + ' (' + items.length + ' tasks) by ' + currentUserName_(), 'blue');
  return { success: true, count: items.length };
}