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
  // v6.5 PERF: one batched pass for the dashboard
  readMany_(['Projects', 'CashAdvanceRequests', 'CashRelease',
    'IncomingCashRequests', 'Liquidations', 'ActivityLog']);

  // v11 BATCH F2: quotations and lost bids live in the Projects sheet
  // but are not projects — see isLiveProject_() in 28-QuotationService.
  const projects = readAll_('Projects').filter(isLiveProject_).map(function (p) {
    p.editors = projectEditors_(p);   // v6.6: card avatars
    const revenue = getTotalIncomingCashForProject(p.id);
    // v11 BATCH G1: cost vs cash, as above.
    const expenses = projectActualCost_(p.id);
    const cashOut = getTotalReleasedCashForProject(p.id);
    return {
      id: p.id,
      name: p.name,
      status: p.status,
      revenue: revenue,
      expenses: expenses,
      cashPosition: revenue - cashOut
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
    { label: 'Released, This Month', value: '₱' + fmtMoney_(releasedThisMonth), color: '#2F7A46', dashOffset: 60 },
    { label: 'Total Liquid Cash', value: '₱' + fmtMoney_(availableBudget), color: '#24455A', dashOffset: 30 }
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
  requireSuperAdmin_('adding a project');   // v7.0
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


/**
 * ══ v6.6: PER-PROJECT EDITORS ══
 * Super Admin assigns which users may EDIT a project's content (daily
 * records, SOW/Gantt, estimates, billings generate/revise, VOs). An
 * EMPTY list means the project is open to everyone (pre-feature
 * behavior), so nothing locks unexpectedly on deploy. Super Admin can
 * always edit. Approvals remain role-based and are not affected.
 */
function projectEditors_(proj) {
  return safeParse_(proj && proj.editorsJSON, []).map(function (e) { return String(e).toLowerCase(); });
}

function canEditProject_(projectId) {
  var proj = readAll_('Projects').find(function (p) { return p.id === projectId; });
  if (!proj) return false;
  var me = currentUserEmail_().toLowerCase();
  var user = readAll_('Users').find(function (u) { return u.email.toLowerCase() === me; });
  if (user && user.role === 'superadmin') return true;
  var editors = projectEditors_(proj);
  if (editors.length === 0) return true;   // open project
  return editors.indexOf(me) > -1;
}

function assertProjectEditor_(projectId) {
  if (!canEditProject_(projectId)) {
    throw new Error('View-only: you are not assigned as an editor of this project. Ask the Super Admin for access.');
  }
}

/** setProjectEditors - Super Admin only; emails may be empty (= open). */
function setProjectEditors(projectId, emails) {
  var me = currentUserEmail_().toLowerCase();
  var user = readAll_('Users').find(function (u) { return u.email.toLowerCase() === me; });
  if (!user || user.role !== 'superadmin') throw new Error('Only Super Admin can assign project editors.');
  var proj = readAll_('Projects').find(function (p) { return p.id === projectId; });
  if (!proj) throw new Error('Project not found.');
  var users = readAll_('Users');
  var clean = (emails || []).map(function (e) { return String(e).toLowerCase().trim(); })
    .filter(function (e, i, a) { return e && a.indexOf(e) === i; })
    .filter(function (e) { return users.some(function (u) { return u.email.toLowerCase() === e; }); });
  updateRow_('Projects', 'id', projectId, { editorsJSON: JSON.stringify(clean) });
  logActivity_('Editors for ' + projectId + ' set to: ' + (clean.length ? clean.join(', ') : '(open to all)'), 'blue', projectId);
  return { success: true, editors: clean };
}

/** getAssignableUsers - Super Admin only; the checklist for the modal. */
function getAssignableUsers() {
  var me = currentUserEmail_().toLowerCase();
  var user = readAll_('Users').find(function (u) { return u.email.toLowerCase() === me; });
  if (!user || user.role !== 'superadmin') throw new Error('Only Super Admin can view the assignable user list.');
  return readAll_('Users').map(function (u) {
    return { email: u.email, name: u.name || u.email, role: u.role };
  });
}

function getProjectData(projectId) {
  // v6.5 PERF: pull every sheet this page needs in ONE batched pass
  // instead of ~16 separate round-trips. Subsequent readAll_ calls below
  // are served from the per-request memo, so the code stays readable and
  // the duplicate reads that used to cost extra trips are now free.
  // v9.3 PERF: the v9 additions (Users name-map + the four site-ops
  // registers + Personnel) were being read one-by-one AFTER this batch,
  // costing 6 extra Sheets round-trips on every project open. They are
  // part of the batch now, so the whole payload is 1 pass.
  readMany_(['Projects', 'SOWItems', 'EstimateGroups', 'EstimateMaterials',
    'EstimateLabor', 'EstimateEquipment', 'EstimateIndirect', 'DailyRecords',
    'CashAdvanceRequests', 'CashRelease', 'IncomingCashRequests', 'Liquidations',
    'VariationOrders', 'Billings', 'Approvals', 'ClientLists', 'Transfers', 'Equipment',
    'Users', 'OTRequests', 'Punchlist', 'SafetyRecords', 'Drawings', 'Personnel']);

  const projects = readAll_('Projects');
  const proj = projects.find(function (p) { return p.id === projectId; });
  if (!proj) return null;

  const revenue = getTotalIncomingCashForProject(projectId);
  // ── v11 BATCH G1: ACCRUAL SPLITS THESE TWO ──
  // `expenses` is what the job has COST (accrual). `cashPosition` is
  // real money, so it uses cash actually released. Before accrual these
  // were the same number; conflating them now would misstate one or the
  // other.
  const expenses = projectActualCost_(projectId);
  const cashOut = getTotalReleasedCashForProject(projectId);
  const cashPosition = revenue - cashOut;

  // v8: honor sortOrder (Super Admin can move items up/down). Legacy rows
  // without a sortOrder keep their sheet position via the index fallback.
  let sowItems = readAll_('SOWItems').filter(function (s) { return s.projectId === projectId; })
    .map(function (s, i) { s._ord = (s.sortOrder !== '' && s.sortOrder !== undefined && s.sortOrder !== null && !isNaN(parseFloat(s.sortOrder))) ? parseFloat(s.sortOrder) : (i + 1) * 1000; return s; })
    .sort(function (a, b) { return a._ord - b._ord; })
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
        baselineEnd: fmtDate_(s.baselineEnd),
        sortOrder: s._ord
      };
    });

  const incomingCash = readAll_('IncomingCashRequests').filter(function (c) { return c.projectId === projectId && c.status === 'Approved'; });
  // v8: resolve creator emails to display names ONCE, so the Daily
  // Record modal can show "Prepared By: Juan Dela Cruz" instead of the
  // raw email address.
  const userNameByEmail = {};
  readAll_('Users').forEach(function (u) {
    if (u.email) userNameByEmail[String(u.email).toLowerCase()] = u.name || u.email;
  });
  const dailyRecords = liveDailyRecords_()
    .filter(function (d) { return d.projectId === projectId; })
    .map(function (d) {
      return {
        id: d.id,
        // v5: normalized to 'yyyy-MM-dd' — Sheets returns Date objects for
        // date cells; unformatted they serialize to long ISO strings, which
        // broke the display AND the duplicate-date check.
        date: fmtDate_(d.date),
        weatherAM: d.weatherAM,
        weatherPM: d.weatherPM,
        status: d.status || 'draft',
        manpower: safeParse_(d.manpowerJSON, []),
        equipment: safeParse_(d.equipmentJSON, []),
        workAccomplished: safeParse_(d.workAccomplishedJSON, []),
        materialsDelivered: safeParse_(d.materialsDeliveredJSON, []),
        materialsUsed: safeParse_(d.materialsUsedJSON, []),   // v6
        issues: safeParse_(d.issuesJSON, []),
        visitors: safeParse_(d.visitorsJSON, []),
        photos: safeParse_(d.photosJSON, []),
        createdBy: d.createdBy || '',
        createdByName: userNameByEmail[String(d.createdBy || '').toLowerCase()] || d.createdBy || ''
      };
    });

  const groups = readAll_('EstimateGroups').filter(function (g) { return g.projectId === projectId; });
  const allMat = readAll_('EstimateMaterials');
  const allLabor = readAll_('EstimateLabor');
  const allEq = readAll_('EstimateEquipment');
  const allInd = readAll_('EstimateIndirect');

  // v5 (item 13): which admins already signed each pending group, so the
  // Estimates tab can hide the Approve button from someone who signed.
  const allSignoffs = readAll_('Approvals');
  const approvedByFor_ = function (groupId) {
    return allSignoffs
      .filter(function (a) { return a.requestId === groupId && a.decision === 'Approved'; })
      .map(function (a) { return String(a.approver || '').toLowerCase(); });
  };

  // v11 BATCH H5: hide estimate groups belonging to a HEADING.
  // Before H5 every SOW item got a group on creation, titles included,
  // so existing projects already carry orphan draft groups for their
  // headings. Those groups can never be approved — a heading has nothing
  // to price — which meant the Estimates tab could never reach its
  // "all approved" state and the print button that depends on it stayed
  // hidden. They are filtered out on read rather than deleted: removing
  // rows from live projects to fix a display problem is not a trade
  // worth making.
  const headingIds = {};
  buildSowTree_(readAll_('SOWItems').filter(function (s) {
    return s.projectId === projectId;
  })).forEach(function (s) { if (s.isHeading) headingIds[String(s.id).trim()] = true; });

  const estimateGroups = groups
    .filter(function (g) { return !headingIds[String(g.sowId).trim()]; })
    .map(function (g) {
    return {
      id: g.id,
      sowId: g.sowId,
      sowDescription: g.sowDescription,
      status: g.status,
      submittedBy: g.submittedBy || '',
      approvedBy: g.status === 'pending' ? approvedByFor_(g.id) : [],
      materials: allMat.filter(function (m) { return m.groupId === g.id; }),
      labor: allLabor.filter(function (l) { return l.groupId === g.id; }),
      equipment: allEq.filter(function (e) { return e.groupId === g.id; }),
      indirect: allInd.filter(function (i) { return i.groupId === g.id; })
    };
  });

  const cashAdvanceRequests = readAll_('CashAdvanceRequests').filter(function (r) { return r.projectId === projectId; });
  const cashReleases = readAll_('CashRelease').filter(function (r) { return r.projectId === projectId; });
  const liquidations = readAll_('Liquidations').filter(function (l) { return l.projectId === projectId; });

  // v11 BATCH G1: loaded ONCE, outside the per-SOW loop below. Building
  // it inside the loop is what made the old EVM code quadratic — one
  // full sheet scan per scope item.
  const _costBasis = costBasis_(projectId);

  // ─── v3: per-SOW effective budget, actual, and progress ───────
  const groupsById = {};
  groups.forEach(function (g) { groupsById[g.sowId] = g; });

  // v6: Client-Approved variation orders raise (or cut, if deductive)
  // the affected SOW's budget — computed here, never written back, so
  // budgetMode recomputes can't clobber the adjustment.
  const projectVOs = readAll_('VariationOrders').filter(function (v) { return v.projectId === projectId; });
  const voAdjustBySow = {};
  projectVOs.forEach(function (v) {
    if (v.status !== 'Client-Approved') return;
    voAdjustBySow[v.sowId] = (voAdjustBySow[v.sowId] || 0) + (parseFloat(v.amount) || 0);
  });

  sowItems.forEach(function (s) {
    // Effective budget by budgetMode:
    //   'auto'     -> materials + labor + equipment from the estimate group
    //   'indirect' -> indirect costs only
    //   'manual'   -> the stored budget value (edited by hand)
    const g = groupsById[s.id];
    if (g && s.budgetMode !== 'manual') {
      // v5 PERF: compute from the estimate rows already loaded above,
      // instead of re-reading the four estimate sheets per SOW item
      // (which cost 4 full-sheet reads × every SOW on each page load).
      if (s.budgetMode === 'indirect') {
        s.budget = allInd.filter(function (i) { return i.groupId === g.id; })
          .reduce(function (sum, i) { return sum + (parseFloat(i.amount) || 0); }, 0);
      } else {
        s.budget =
          allMat.filter(function (m) { return m.groupId === g.id; })
            .reduce(function (sum, m) { return sum + (parseFloat(m.cost) || 0); }, 0) +
          allLabor.filter(function (l) { return l.groupId === g.id; })
            .reduce(function (sum, l) { return sum + (parseFloat(l.cost) || 0); }, 0) +
          allEq.filter(function (e) { return e.groupId === g.id; })
            .reduce(function (sum, e) { return sum + (parseFloat(e.cost) || 0); }, 0);
      }
    }

    // ── v11 BATCH G1: ACCRUAL ──
    // Actual cost now comes from ONE shared helper (30-CostBasis.gs)
    // instead of being computed here. Cost and cash-out are no longer
    // the same event: cost lands when value is consumed — goods
    // received, or an advance liquidated — while cash-out lands when
    // money moves.
    //
    // An unliquidated release still counts, PROVISIONALLY, so nothing
    // drops when this ships. See THE PROVISIONAL RULE in 30-CostBasis.
    s.actual = sowActualCost_(projectId, s.id, _costBasis);

    // Progress from Daily Site Reports (non-rejected): among work
    // accomplished rows whose scope === this SOW id, the LATEST report
    // date wins; within that date the highest % is taken. Mirrors how
    // MS Project treats the most recent status update as truth.
    s.progress = computeSOWProgress_(s.id, dailyRecords);

    // v6: apply approved variation orders to the working budget
    if (voAdjustBySow[s.id]) {
      s.voAdjustment = voAdjustBySow[s.id];
      s.budget = (s.budget || 0) + voAdjustBySow[s.id];
    }

    // v6.2: the CONTRACT-BASIS estimate total of this SOW — materials +
    // labor + equipment + indirect from its estimate group, counted ONLY
    // once the estimate is APPROVED (approved estimates are what the
    // client signed off as the contract price; drafts must not move the
    // Gantt total or the SWA while they're still being edited). The
    // working `budget` stays untouched as the internal cost control.
    // Gantt weights and SWA amounts use estimateTotal + approved VOs.
    s.estimateTotal = 0;
    if (g && g.status === 'approved') {
      s.estimateTotal =
        allMat.filter(function (m) { return m.groupId === g.id; })
          .reduce(function (sum, m) { return sum + (parseFloat(m.cost) || 0); }, 0) +
        allLabor.filter(function (l) { return l.groupId === g.id; })
          .reduce(function (sum, l) { return sum + (parseFloat(l.cost) || 0); }, 0) +
        allEq.filter(function (e) { return e.groupId === g.id; })
          .reduce(function (sum, e) { return sum + (parseFloat(e.cost) || 0); }, 0) +
        allInd.filter(function (i) { return i.groupId === g.id; })
          .reduce(function (sum, i) { return sum + (parseFloat(i.amount) || 0); }, 0);
    }
  });

  // Budget-weighted total project completion (user-selected weighting).
  // Milestones (zero-duration, zero-budget) are excluded from the weights.
  // ── v11 BATCH H4: SOW HIERARCHY ──
  // Annotated and re-ordered ONCE, here, so the SOW Budget tab, the
  // Timeline, the Estimates tab and the Reports all read the same tree
  // in the same order. Deriving it separately on each surface is how
  // four screens end up disagreeing about which item sits under which.
  sowItems = buildSowTree_(sowItems);

  const weighted = sowItems.filter(function (s) { return !s.isMilestone; });
  const totalBudget = weighted.reduce(function (sum, s) { return sum + (s.budget || 0); }, 0);
  const totalProgress = totalBudget > 0
    ? weighted.reduce(function (sum, s) { return sum + (s.budget || 0) * (s.progress || 0); }, 0) / totalBudget
    : (weighted.length ? weighted.reduce(function (sum, s) { return sum + (s.progress || 0); }, 0) / weighted.length : 0);

  const client = proj.clientId
    ? readAll_('ClientLists').find(function (c) { return c.id === proj.clientId; })
    : null;

  // ════════ v6: SITE MATERIALS · COST BY TYPE · CASHFLOW · EVM ════════

  // ── Site material balance: delivered − used, from daily reports ──
  const siteMap = {};
  dailyRecords.forEach(function (d) {
    if (d.status === 'rejected') return;
    (d.materialsDelivered || []).forEach(function (m) {
      if (!m.material) return;
      const key = m.material;
      if (!siteMap[key]) siteMap[key] = { material: key, unit: m.unit || '', delivered: 0, used: 0, lastMovement: '' };
      siteMap[key].delivered += parseFloat(m.qty) || 0;
      if (!siteMap[key].unit && m.unit) siteMap[key].unit = m.unit;
      if (String(d.date) > String(siteMap[key].lastMovement)) siteMap[key].lastMovement = d.date;
    });
    (d.materialsUsed || []).forEach(function (m) {
      if (!m.material) return;
      const key = m.material;
      if (!siteMap[key]) siteMap[key] = { material: key, unit: m.unit || '', delivered: 0, used: 0, lastMovement: '' };
      siteMap[key].used += parseFloat(m.qty) || 0;
      if (String(d.date) > String(siteMap[key].lastMovement)) siteMap[key].lastMovement = d.date;
    });
  });
  // ── v11 BATCH G2: GOODS RECEIVED AGAINST A PURCHASE ORDER ──
  // Stock now has TWO inflow sources: the daily report (informal
  // deliveries, small buys, anything without a PO) and PO receipts.
  //
  // THE RISK THIS CREATES, stated plainly: if someone logs a delivery in
  // the daily report AND receives it against the PO, the stock doubles.
  // One balance, two sources, and no way for the sheet to know they are
  // the same truck.
  //
  // So each PO-sourced quantity is tracked SEPARATELY as `receivedPO`
  // rather than being folded into `delivered`, and a same-material
  // same-day overlap is flagged on the row. The site can then see the
  // duplicate instead of the balance silently drifting — which is the
  // failure mode that would otherwise take months to notice.
  const poReceipts = ss_().getSheetByName('Receipts')
    ? readAll_('Receipts').filter(function (r) {
        return r.projectId === projectId && low_(r.status) !== 'cancelled';
      })
    : [];
  poReceipts.forEach(function (r) {
    safeParse_(r.linesJSON, []).forEach(function (l) {
      const k = l.itemName;
      if (!k) return;
      if (!siteMap[k]) siteMap[k] = { material: k, unit: l.unit || '', delivered: 0, used: 0, lastMovement: '' };
      siteMap[k].receivedPO = (siteMap[k].receivedPO || 0) + (parseFloat(l.qty) || 0);
      if (!siteMap[k].unit && l.unit) siteMap[k].unit = l.unit;
      const d = fmtDate_(r.receiptDate);
      if (String(d) > String(siteMap[k].lastMovement)) siteMap[k].lastMovement = d;
      // same material received on a PO and logged in a daily report on
      // the same date is almost certainly one delivery entered twice
      (siteMap[k]._poDates = siteMap[k]._poDates || {})[d] = true;
    });
  });
  dailyRecords.forEach(function (d) {
    if (d.status === 'rejected') return;
    (d.materialsDelivered || []).forEach(function (m) {
      const row = siteMap[m.material];
      if (row && row._poDates && row._poDates[String(d.date)]) {
        row.possibleDuplicate = true;
      }
    });
  });

  // v6.9: completed transfers move stock in and out of this site, so the
  // balance is Delivered + In − Used − Out.
  const projTransfers = readAll_('Transfers').filter(function (tr) {
    return tr.status === 'Completed' && tr.itemType === 'Material' &&
      (tr.fromLoc === projectId || tr.toLoc === projectId);
  });
  projTransfers.forEach(function (tr) {
    const k = tr.item;
    if (!k) return;
    if (!siteMap[k]) siteMap[k] = { material: k, unit: tr.unit || '', delivered: 0, used: 0, lastMovement: '' };
    const q = parseFloat(tr.qty) || 0;
    if (tr.toLoc === projectId) siteMap[k].transferredIn = (siteMap[k].transferredIn || 0) + q;
    else siteMap[k].transferredOut = (siteMap[k].transferredOut || 0) + q;
    const d = fmtDate_(tr.transferDate);
    if (String(d) > String(siteMap[k].lastMovement)) siteMap[k].lastMovement = d;
  });

  const siteMaterials = Object.keys(siteMap).map(function (k) {
    const row = siteMap[k];
    row.transferredIn = row.transferredIn || 0;
    row.transferredOut = row.transferredOut || 0;
    row.receivedPO = row.receivedPO || 0;
    row.possibleDuplicate = !!row.possibleDuplicate;
    delete row._poDates;
    // v11 BATCH G2: PO receipts are a third inflow alongside daily-report
    // deliveries and transfers in.
    row.remaining = Math.max(
      row.delivered + row.receivedPO + row.transferredIn - row.used - row.transferredOut, 0);
    return row;
  }).sort(function (a, b) { return a.material < b.material ? -1 : 1; });

  // ── Cost breakdown by REQUEST TYPE (from the originating CA) ──
  const allCAs = readAll_('CashAdvanceRequests');
  const caById = {};
  allCAs.forEach(function (c) { caById[c.id] = c; });
  const costByTypeMap = {};
  cashReleases.forEach(function (r) {
    if (r.status !== 'Reviewed') return;
    let rtype = 'Other';
    const ca = caById[r.originalRequestId];
    if (ca) {
      const pl = safeParse_(ca.payloadJSON, {});
      rtype = pl.requestType || 'Other';
    }
    costByTypeMap[rtype] = (costByTypeMap[rtype] || 0) + (parseFloat(r.amount) || 0);
  });
  const costByType = Object.keys(costByTypeMap)
    .map(function (k) { return { type: k, amount: costByTypeMap[k] }; })
    .sort(function (a, b) { return b.amount - a.amount; });

  // ── Month window (v10 REWRITE — fixes two real bugs) ─────────────
  //
  // BUG 1 "editing the start date changed nothing": the window used to be
  // min/max over the project dates, EVERY SOW date, and today. SOW bars
  // usually begin before the project date, so those dates won the min()
  // and moving the project start had no visible effect on the chart.
  //
  // BUG 2 "the dates went backwards": prependZero_ pushed a point
  // labelled with the project start onto the FRONT of the series even
  // when the first bucket was an earlier month, producing an axis like
  // "Sep 1 (start), Jul 26, Aug 26 ...".
  //
  // The window is now ANCHORED to the project start date, which is the
  // field the user actually edits. SOW dates no longer redefine it; they
  // are clamped into it. Every date goes through fmtDate_() first, so a
  // Date cell and a 'yyyy-MM-dd' string can never disagree by a day.
  const dOf_ = function (x) {
    const t = fmtDate_(x);
    if (!t) return null;
    const p = String(t).slice(0, 10).split('-');
    if (p.length !== 3) return null;
    const d = new Date(+p[0], +p[1] - 1, +p[2]);
    return isNaN(d.getTime()) ? null : d;
  };
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const projStart = dOf_(proj.startDate);
  const projEnd = dOf_(proj.endDate);

  // fall back to the SOW span only when the project has no dates set
  const sowDates = [];
  sowItems.forEach(function (s) {
    const a = dOf_(s.startDate), b = dOf_(s.endDate);
    if (a) sowDates.push(a);
    if (b) sowDates.push(b);
  });

  let winStart = projStart
    || (sowDates.length ? new Date(Math.min.apply(null, sowDates.map(function (d) { return d.getTime(); }))) : new Date(today));
  // the axis must reach at least to today (so AC has somewhere to land)
  // and to the project end / last SOW date, whichever is furthest out
  const endCandidates = [today];
  if (projEnd) endCandidates.push(projEnd);
  sowDates.forEach(function (d) { endCandidates.push(d); });
  let winEnd = new Date(Math.max.apply(null, endCandidates.map(function (d) { return d.getTime(); })));
  if (winEnd < winStart) winEnd = new Date(winStart);

  let mStart = new Date(winStart.getFullYear(), winStart.getMonth(), 1);
  let mEnd = new Date(winEnd.getFullYear(), winEnd.getMonth(), 1);
  const monthsArr = [];
  for (let d = new Date(mStart); d <= mEnd && monthsArr.length < 24; d.setMonth(d.getMonth() + 1)) {
    monthsArr.push({ y: d.getFullYear(), m: d.getMonth() });
  }
  // guarantee strictly ascending buckets regardless of how the loop ran
  monthsArr.sort(function (a, b) { return (a.y * 12 + a.m) - (b.y * 12 + b.m); });
  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monthLabels = monthsArr.map(function (mm) { return MONTH_NAMES[mm.m] + ' ' + String(mm.y).slice(2); });
  const monthKey_ = function (dt) { return dt.getFullYear() * 12 + dt.getMonth(); };
  const monthEnd_ = function (mm) { return new Date(mm.y, mm.m + 1, 0); };
  const nowKey = monthKey_(today);

  // ════════ v6.9: PROJECT EQUIPMENT ════════
  // Everything is derived from the equipment rows of the daily reports —
  // no separate encoding — plus the Equipment DB for the catalogue.
  //
  // PRESENCE MODEL: the first log of a unit is its CHECK-IN; it stays on
  // site until checked out. Days on Site is therefore measured from that
  // first log to today (or to the last log if the unit went stale/left),
  // NOT by counting logged days — so a missed report no longer looks
  // like the machine drove away and came back. Missed reporting instead
  // surfaces as a "stale" flag, making the discipline gap visible.
  const EQ_STATUS_MAP = {
    'operational': 'Operational', 'ok': 'Operational', 'running': 'Operational',
    'working': 'Operational', 'good': 'Operational', 'gumagana': 'Operational',
    'idle': 'Idle', 'standby': 'Standby', 'stand by': 'Standby', 'reserve': 'Standby',
    'under repair': 'Under Repair', 'repair': 'Under Repair', 'maintenance': 'Under Repair',
    'pm': 'Under Repair', 'servicing': 'Under Repair',
    'breakdown': 'Breakdown', 'broken': 'Breakdown', 'down': 'Breakdown',
    'sira': 'Breakdown', 'defective': 'Breakdown'
  };
  const normEqStatus_ = function (raw) {
    const s = String(raw || '').trim().toLowerCase();
    if (!s) return 'Operational';
    if (EQ_STATUS_MAP[s]) return EQ_STATUS_MAP[s];
    const hit = Object.keys(EQ_STATUS_MAP).find(function (k) { return s.indexOf(k) > -1; });
    return hit ? EQ_STATUS_MAP[hit] : 'Operational';
  };

  const eqCatalog = {};
  readAll_('Equipment').forEach(function (e) {
    if (e.name) eqCatalog[String(e.name).toLowerCase()] = e;
  });

  const eqMap = {};
  const downtimeLog = [];
  dailyRecords.forEach(function (d) {
    if (d.status === 'rejected') return;
    const dateKey = String(d.date || '');
    if (!dateKey) return;
    (d.equipment || []).forEach(function (row) {
      const nm = String(row.name || '').trim();
      if (!nm) return;
      const st = normEqStatus_(row.status);
      if (!eqMap[nm]) {
        eqMap[nm] = {
          name: nm, qty: 0, status: 'Operational',
          firstSeen: dateKey, lastSeen: '', operationalDays: 0, loggedDays: 0,
          brand: (eqCatalog[nm.toLowerCase()] || {}).brand || '',
          _days: {}
        };
      }
      const e = eqMap[nm];
      if (dateKey < e.firstSeen) e.firstSeen = dateKey;
      if (dateKey > e.lastSeen) {
        e.lastSeen = dateKey;
        e.status = st;                                  // latest log wins
        e.qty = parseFloat(row.qty) || e.qty || 1;
      }
      if (!e._days[dateKey]) {
        e._days[dateKey] = true;
        e.loggedDays++;
        if (st === 'Operational') e.operationalDays++;
      }
      if (st === 'Under Repair' || st === 'Breakdown') {
        downtimeLog.push({ date: dateKey, name: nm, status: st, remarks: row.remarks || '' });
      }
    });
  });

  // Equipment Rental spend per unit is not itemised on releases, so the
  // project's total rental cost is spread across units by operational
  // days — an honest approximation, labelled as such in the UI.
  const rentalTotal = (costByTypeMap['Equipment Rental'] || 0);
  const totalOpDays = Object.keys(eqMap).reduce(function (s, k) { return s + eqMap[k].operationalDays; }, 0);

  const todayKey = fmtDate_(today);
  const equipmentOnSite = Object.keys(eqMap).map(function (k) {
    const e = eqMap[k];
    const first = new Date(e.firstSeen), last = new Date(e.lastSeen);
    const daysOnSite = Math.max(Math.round((today - first) / 86400000) + 1, 1);
    const staleDays = Math.max(Math.round((today - last) / 86400000), 0);
    const util = daysOnSite > 0 ? Math.round(e.operationalDays / daysOnSite * 100) : 0;
    const costPerOpDay = (totalOpDays > 0 && e.operationalDays > 0)
      ? Math.round(rentalTotal * (e.operationalDays / totalOpDays) / e.operationalDays)
      : 0;
    return {
      name: e.name, brand: e.brand, qty: e.qty, status: e.status,
      firstSeen: e.firstSeen, lastSeen: e.lastSeen,
      daysOnSite: daysOnSite, operationalDays: e.operationalDays,
      loggedDays: e.loggedDays, utilization: Math.min(util, 100),
      staleDays: staleDays, costPerOpDay: costPerOpDay
    };
  }).sort(function (a, b) { return a.name < b.name ? -1 : 1; });

  downtimeLog.sort(function (a, b) { return a.date < b.date ? 1 : -1; });

  const equipmentSummary = {
    unitsOnSite: equipmentOnSite.reduce(function (s, e) { return s + (parseFloat(e.qty) || 0); }, 0),
    types: equipmentOnSite.length,
    operationalNow: equipmentOnSite.filter(function (e) { return e.status === 'Operational'; }).length,
    downNow: equipmentOnSite.filter(function (e) { return e.status === 'Under Repair' || e.status === 'Breakdown'; }).length,
    avgUtilization: equipmentOnSite.length
      ? Math.round(equipmentOnSite.reduce(function (s, e) { return s + e.utilization; }, 0) / equipmentOnSite.length)
      : 0,
    rentalTotal: rentalTotal
  };


  // ── Cashflow (actuals) ──
  const inflowActual = monthsArr.map(function () { return 0; });
  const outflowActual = monthsArr.map(function () { return 0; });
  const incomingForProject = readAll_('IncomingCashRequests').filter(function (c) {
    return c.projectId === projectId && c.status === 'Approved';
  });
  incomingForProject.forEach(function (c) {
    const dt = new Date(fmtDate_(c.transactionDate || c.createdAt));
    if (isNaN(dt)) return;
    const idx = monthsArr.findIndex(function (mm) { return mm.y === dt.getFullYear() && mm.m === dt.getMonth(); });
    if (idx > -1) inflowActual[idx] += parseFloat(c.amount) || 0;
  });
  cashReleases.forEach(function (r) {
    if (r.status !== 'Reviewed') return;
    const dt = new Date(fmtDate_(r.releasedAt || r.createdAt));
    if (isNaN(dt)) return;
    const idx = monthsArr.findIndex(function (mm) { return mm.y === dt.getFullYear() && mm.m === dt.getMonth(); });
    if (idx > -1) outflowActual[idx] += parseFloat(r.amount) || 0;
  });

  // ── Projected outflow, driven by the Gantt: each SOW's remaining
  //    spend (budget − actual, floor 0) spread by day across its
  //    remaining schedule (today → endDate). Overdue tasks land in the
  //    current month. Recomputes whenever bars move on the Timeline. ──
  const outflowProjected = monthsArr.map(function () { return 0; });
  sowItems.forEach(function (s) {
    if (s.isMilestone) return;
    const remainingSpend = Math.max((s.budget || 0) - (s.actual || 0), 0);
    if (remainingSpend <= 0) return;
    const sEnd = new Date(s.endDate);
    if (isNaN(sEnd)) return;
    let from = new Date(Math.max(today.getTime(), new Date(s.startDate).getTime() || today.getTime()));
    if (sEnd < today) {
      const idx = monthsArr.findIndex(function (mm) { return monthKey_(today) === mm.y * 12 + mm.m; });
      if (idx > -1) outflowProjected[idx] += remainingSpend;
      return;
    }
    const totalDays = Math.max(Math.round((sEnd - from) / 86400000) + 1, 1);
    const perDay = remainingSpend / totalDays;
    monthsArr.forEach(function (mm, idx) {
      const mFirst = new Date(mm.y, mm.m, 1);
      const mLast = monthEnd_(mm);
      const a = Math.max(from.getTime(), mFirst.getTime());
      const b = Math.min(sEnd.getTime(), mLast.getTime());
      if (b < a) return;
      const days = Math.round((b - a) / 86400000) + 1;
      outflowProjected[idx] += perDay * days;
    });
  });

  // ── EVM: PV curve from the Gantt; EV/AC as of today. AC series is
  //    real (cumulative reviewed releases by month). ──
  const pvSeries = monthsArr.map(function (mm) {
    const cut = monthEnd_(mm);
    let pv = 0;
    sowItems.forEach(function (s) {
      const b = s.budget || 0;
      if (!b) return;
      const sS = new Date(s.startDate), sE = new Date(s.endDate);
      if (isNaN(sS) || isNaN(sE)) return;
      if (cut < sS) return;
      if (cut >= sE || s.isMilestone) { pv += b; return; }
      const frac = (cut - sS) / Math.max(sE - sS, 1);
      pv += b * Math.min(Math.max(frac, 0), 1);
    });
    return Math.round(pv);
  });
  const acSeries = monthsArr.map(function (mm, idx) {
    if (mm.y * 12 + mm.m > nowKey) return null;
    let cum = 0;
    for (let i = 0; i <= idx; i++) cum += outflowActual[i];
    return Math.round(cum);
  });
  const totalBudgetAll = sowItems.reduce(function (s, x) { return s + (x.isMilestone ? 0 : (x.budget || 0)); }, 0);
  // v6.6: EV is on the CONTRACT basis (approved estimate + client VOs),
  // per Darwin's model: estimates = what the client pays for finished
  // work; budget = the internal spending plan. PV stays budget-based —
  // "how much did we PLAN to spend by now" — and AC is what was actually
  // spent, so CPI reads earned contract value per peso spent.
  // v6.8: EV as a monthly series — for each past month-end, reconstruct
  // every SOW's % complete from the daily reports and value it on the
  // contract basis. Future months are null - EV cannot be forecast.
  // v9.3 PERF: build the progress timeline ONCE; every bucket below
  // (monthly here, weekly further down) now does a binary search
  // instead of re-scanning all daily records.
  const progressIdx = buildProgressIndex_(dailyRecords);

  const evSeries = monthsArr.map(function (mm) {
    if (mm.y * 12 + mm.m > nowKey) return null;
    const cutD = monthEnd_(mm) < today ? monthEnd_(mm) : today;
    const cut = fmtDate_(cutD);   // v6.8.1: string cutoff, inclusive
    let ev = 0;
    sowItems.forEach(function (x) {
      if (x.isMilestone) return;
      const basis = (x.estimateTotal || 0) + (x.voAdjustment || 0);
      if (!basis) return;
      ev += basis * (progressAsOfIdx_(progressIdx, x.id, cut) / 100);
    });
    return Math.round(ev);
  });

  const evNow = sowItems.reduce(function (s, x) {
    if (x.isMilestone) return s;
    const basis = (x.estimateTotal || 0) + (x.voAdjustment || 0);
    return s + basis * ((x.progress || 0) / 100);
  }, 0);
  const nowIdx = monthsArr.findIndex(function (mm) { return mm.y * 12 + mm.m === nowKey; });
  const pvNow = nowIdx > -1 ? pvSeries[nowIdx] : (pvSeries[pvSeries.length - 1] || 0);
  // ── v11 BATCH G1: ACCRUAL ──
  // The monthly acSeries stays CASH-DATED — it is the outflow chart, and
  // a chart of when money left the account is a genuinely useful thing.
  // But acNow, which drives CPI, is taken from the shared cost helper so
  // that CPI cannot disagree with the SOW table sitting next to it.
  // Two different "actual cost" numbers on one screen is a bug users
  // report as "the system is wrong", and they would be right.
  const acNow = projectActualCost_(projectId, _costBasis);
  const evm = {
    labels: monthLabels,
    pvSeries: pvSeries,
    acSeries: acSeries,
    evSeries: evSeries,
    nowIndex: nowIdx,
    pv: Math.round(pvNow),
    ev: Math.round(evNow),
    ac: Math.round(acNow),
    bac: Math.round(totalBudgetAll),
    spi: pvNow > 0 ? Math.round(evNow / pvNow * 100) / 100 : null,
    cpi: acNow > 0 ? Math.round(evNow / acNow * 100) / 100 : null
  };

  const projectCashflow = {
    labels: monthLabels,
    inflow: inflowActual.map(function (v) { return Math.round(v); }),
    outflow: outflowActual.map(function (v) { return Math.round(v); }),
    projectedOutflow: outflowProjected.map(function (v, i) {
      return (monthsArr[i].y * 12 + monthsArr[i].m) >= nowKey ? Math.round(v) : null;
    })
  };

  // ════════ v8: WEEKLY cashflow + EVM series ════════
  // Same math as the monthly series above, bucketed per week (Mon–Sun)
  // so the S-curve and cash flow can be viewed in more detail. Capped
  // at 60 weeks in a window around today for very long projects.
  const dayMs = 86400000;
  // v10: same normalized parse as the monthly window (this was
  // new Date() on the raw cell, which could disagree by a day).
  const projStartD = dOf_(proj.startDate);
  const spanStartW = projStartD || new Date(mStart);
  let wFirst = new Date(spanStartW.getFullYear(), spanStartW.getMonth(), spanStartW.getDate());
  wFirst = new Date(wFirst.getTime() - ((wFirst.getDay() + 6) % 7) * dayMs);   // back to Monday
  const spanEndW = monthEnd_(monthsArr[monthsArr.length - 1]);
  let totalWeeks = Math.ceil((spanEndW - wFirst) / (7 * dayMs)) + 1;
  if (totalWeeks > 60) {
    // keep a window: ~40 weeks back from today, then cap at 60
    const back = new Date(today.getTime() - 40 * 7 * dayMs);
    if (back > wFirst) {
      wFirst = new Date(back.getTime() - ((back.getDay() + 6) % 7) * dayMs);
      totalWeeks = Math.ceil((spanEndW - wFirst) / (7 * dayMs)) + 1;
    }
    if (totalWeeks > 60) totalWeeks = 60;
  }
  const MONTH_SHORT_W = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const weeks = [];
  for (let wi = 0; wi < totalWeeks; wi++) {
    const ws = new Date(wFirst.getTime() + wi * 7 * dayMs);
    const we = new Date(ws.getTime() + 6 * dayMs);
    weeks.push({ start: ws, end: we, label: MONTH_SHORT_W[ws.getMonth()] + ' ' + ws.getDate() });
  }
  const inWeek_ = function (dt, w) { return !isNaN(dt) && dt >= w.start && dt <= new Date(w.end.getFullYear(), w.end.getMonth(), w.end.getDate(), 23, 59, 59); };

  const wkInflow = weeks.map(function () { return 0; });
  const wkOutflow = weeks.map(function () { return 0; });
  incomingForProject.forEach(function (c) {
    const dt = new Date(fmtDate_(c.transactionDate || c.createdAt));
    const idx = weeks.findIndex(function (w) { return inWeek_(dt, w); });
    if (idx > -1) wkInflow[idx] += parseFloat(c.amount) || 0;
  });
  cashReleases.forEach(function (r) {
    if (r.status !== 'Reviewed') return;
    const dt = new Date(fmtDate_(r.releasedAt || r.createdAt));
    const idx = weeks.findIndex(function (w) { return inWeek_(dt, w); });
    if (idx > -1) wkOutflow[idx] += parseFloat(r.amount) || 0;
  });

  const wkProjected = weeks.map(function () { return 0; });
  sowItems.forEach(function (s) {
    if (s.isMilestone) return;
    const remainingSpend = Math.max((s.budget || 0) - (s.actual || 0), 0);
    if (remainingSpend <= 0) return;
    const sEnd = new Date(s.endDate);
    if (isNaN(sEnd)) return;
    let from = new Date(Math.max(today.getTime(), new Date(s.startDate).getTime() || today.getTime()));
    if (sEnd < today) {
      const idx = weeks.findIndex(function (w) { return inWeek_(today, w); });
      if (idx > -1) wkProjected[idx] += remainingSpend;
      return;
    }
    const totalDays = Math.max(Math.round((sEnd - from) / dayMs) + 1, 1);
    const perDay = remainingSpend / totalDays;
    weeks.forEach(function (w, idx) {
      const a = Math.max(from.getTime(), w.start.getTime());
      const b = Math.min(sEnd.getTime(), w.end.getTime());
      if (b < a) return;
      const days = Math.round((b - a) / dayMs) + 1;
      wkProjected[idx] += perDay * days;
    });
  });

  const wkPv = weeks.map(function (w) {
    const cut = w.end;
    let pv = 0;
    sowItems.forEach(function (s) {
      const b = s.budget || 0;
      if (!b) return;
      const sS = new Date(s.startDate), sE = new Date(s.endDate);
      if (isNaN(sS) || isNaN(sE)) return;
      if (cut < sS) return;
      if (cut >= sE || s.isMilestone) { pv += b; return; }
      const frac = (cut - sS) / Math.max(sE - sS, 1);
      pv += b * Math.min(Math.max(frac, 0), 1);
    });
    return Math.round(pv);
  });
  const wkAc = weeks.map(function (w, idx) {
    if (w.start > today) return null;
    let cum = 0;
    for (let i = 0; i <= idx; i++) cum += wkOutflow[i];
    return Math.round(cum);
  });
  const wkEv = weeks.map(function (w) {
    if (w.start > today) return null;
    const cutD = w.end < today ? w.end : today;
    const cut = fmtDate_(cutD);
    let ev = 0;
    sowItems.forEach(function (x) {
      if (x.isMilestone) return;
      const basis = (x.estimateTotal || 0) + (x.voAdjustment || 0);
      if (!basis) return;
      ev += basis * (progressAsOfIdx_(progressIdx, x.id, cut) / 100);
    });
    return Math.round(ev);
  });
  const wkNowIdx = weeks.findIndex(function (w) { return inWeek_(today, w); });

  const evmWeekly = {
    labels: weeks.map(function (w) { return w.label; }),
    pvSeries: wkPv,
    acSeries: wkAc,
    evSeries: wkEv,
    nowIndex: wkNowIdx
  };
  const projectCashflowWeekly = {
    labels: weeks.map(function (w) { return w.label; }),
    inflow: wkInflow.map(function (v) { return Math.round(v); }),
    outflow: wkOutflow.map(function (v) { return Math.round(v); }),
    projectedOutflow: wkProjected.map(function (v, i) {
      return weeks[i].end >= today ? Math.round(v) : null;
    })
  };

  // ── v8: every curve now BEGINS AT ZERO at the project start, so day 0
  //    reads ₱0 instead of jumping straight to the first bucket's
  //    accumulated value. ──
  const startLbl = projStartD
    ? (MONTH_SHORT_W[projStartD.getMonth()] + ' ' + projStartD.getDate() + ' (start)')
    : 'Start';

  /**
   * prependZero_ (v10 FIX) - Adds the ₱0 origin point at the project
   * start so both curves visibly begin at zero.
   *
   * It used to unshift UNCONDITIONALLY, which put a label like
   * "Sep 1 (start)" in front of an earlier bucket such as "Jul 26" and
   * made the axis read backwards. Now the point is only prepended when
   * the project start genuinely precedes the first bucket; otherwise the
   * first bucket already IS the origin and is simply zeroed and
   * relabelled. Either way the axis can only ascend.
   */
  const prependZero_ = function (evmObj, cfObj, firstBucketStart) {
    if (!evmObj || !evmObj.labels || !evmObj.labels.length) return;
    const startsBefore = projStartD && firstBucketStart
      ? projStartD.getTime() < firstBucketStart.getTime()
      : false;

    if (startsBefore) {
      evmObj.labels.unshift(startLbl);
      evmObj.pvSeries.unshift(0);
      evmObj.acSeries.unshift(0);
      evmObj.evSeries.unshift(0);
      if (evmObj.nowIndex !== undefined && evmObj.nowIndex > -1) evmObj.nowIndex += 1;
      cfObj.labels.unshift(startLbl);
      cfObj.inflow.unshift(0);
      cfObj.outflow.unshift(0);
      cfObj.projectedOutflow.unshift(null);
    } else {
      // the window already starts at the project start: make that first
      // bucket the zero origin instead of inserting an out-of-order one
      evmObj.labels[0] = startLbl;
      evmObj.pvSeries[0] = 0;
      evmObj.acSeries[0] = 0;
      evmObj.evSeries[0] = 0;
      cfObj.labels[0] = startLbl;
      cfObj.inflow[0] = 0;
      cfObj.outflow[0] = 0;
      cfObj.projectedOutflow[0] = null;
    }
  };
  // monthly buckets begin on the 1st of the first month; weekly buckets
  // begin on the Monday stored in weeks[0]
  prependZero_(evm, projectCashflow, monthsArr.length ? new Date(monthsArr[0].y, monthsArr[0].m, 1) : null);
  prependZero_(evmWeekly, projectCashflowWeekly, weeks.length ? new Date(weeks[0].start) : null);

  // ── Billings + contract ──
  // v6.1: Sheets auto-parses period strings like "Jul 2026" into Date
  // cells, which serialize back as long ISO strings. Normalize every
  // date-ish field before it reaches the UI.
  const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const fmtPeriod_ = function (v) {
    if (v instanceof Date) return MONTH_SHORT[v.getMonth()] + ' ' + v.getFullYear();
    const s = String(v || '');
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
      const d = new Date(s);
      if (!isNaN(d)) return MONTH_SHORT[d.getMonth()] + ' ' + d.getFullYear();
    }
    return s;
  };
  const billings = readAll_('Billings')
    .filter(function (b) { return b.projectId === projectId; })
    .map(function (b) {
      return {
        id: b.id, projectId: b.projectId, billingNo: b.billingNo,
        period: fmtPeriod_(b.period),
        prevPct: parseFloat(b.prevPct) || 0,
        currentPct: parseFloat(b.currentPct) || 0,
        grossAmount: parseFloat(b.grossAmount) || 0,
        retentionAmount: parseFloat(b.retentionAmount) || 0,
        netAmount: parseFloat(b.netAmount) || 0,
        status: b.status,
        submittedBy: b.submittedBy || '',
        createdAt: fmtDate_(b.createdAt),
        paidAt: b.paidAt ? fmtDate_(b.paidAt) : ''
      };
    })
    .reverse();
  const retentionPctVal = (function () {
    const rp = parseFloat(proj.retentionPct);
    return (isNaN(rp) || rp < 0 || rp > 0.5) ? 0.10 : rp;
  })();
  const contractValueRevised = revisedContractValue_(projectId, proj, projectVOs);

  // v6.3: contract-basis readiness for the UI (computed from the already
  // enriched items — same rules as the backend gate in 17-BillingService).
  const crUnapproved = [], crZeroBudget = [];
  sowItems.forEach(function (s) {
    if (s.isMilestone) return;
    // v11 BATCH H5: a HEADING is never estimated or budgeted — its money
    // is the sum of the items beneath it. Counting it here is what made
    // the Timeline report "setup incomplete" the moment a title was
    // added, and kept the Estimates print button hidden even when every
    // real estimate was approved.
    if (s.isHeading) return;
    if (!((s.estimateTotal || 0) > 0)) crUnapproved.push(s.id);
    if (!((parseFloat(s.budget) || 0) > 0)) crZeroBudget.push(s.id);
  });
  const contractReady = {
    ready: sowItems.some(function (s) { return !s.isMilestone; }) && crUnapproved.length === 0 && crZeroBudget.length === 0,
    unapproved: crUnapproved,
    zeroBudget: crZeroBudget
  };

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
    // v6
    siteMaterials: siteMaterials,
    transfers: getTransfersForProject(projectId),
    // v9: site ops registers + attendance dependencies, in one payload
    // so the Daily form, Punchlist/Safety/Drawings tabs, and the OT
    // lock state all load without extra round-trips.
    otRequests: getOTRequests(projectId),
    punchlist: getPunchlist(projectId),
    safetyRecords: getSafetyRecords(projectId),
    drawings: getDrawings(projectId),
    personnel: getAllPersonnel().filter(function (pp) { return pp.status === 'active'; }),
    equipmentOnSite: equipmentOnSite,
    equipmentSummary: equipmentSummary,
    downtimeLog: downtimeLog.slice(0, 40),
    costByType: costByType,
    projectCashflow: projectCashflow,
    projectCashflowWeekly: projectCashflowWeekly,
    evm: evm,
    evmWeekly: evmWeekly,
    billings: billings,
    variationOrders: projectVOs.slice().reverse(),
    contractValue: parseFloat(proj.contractValue) || 0,
    retentionPct: retentionPctVal,
    // v10: downpayment % of the contract (advance, recouped from billings)
    downpaymentPct: parseFloat(proj.downpaymentPct) || 0,
    contractValueRevised: contractValueRevised,
    contractReady: contractReady,
    // v6.6: per-project editors
    editors: projectEditors_(proj),
    canEdit: canEditProject_(projectId),
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
  assertProjectEditor_(projectId);   // v6.6
  const id = String(data.id || 'SOW-' + Utilities.getUuid().slice(0, 6).toUpperCase()).trim();
  // v11 BATCH B: same id rule the rename path enforces, applied at
  // creation too — otherwise an id containing a comma would silently
  // corrupt every predecessor list it was later added to.
  if (!/^[A-Za-z0-9._\- ]{1,40}$/.test(id)) {
    throw new Error('SOW ID may only contain letters, numbers, dots, dashes, underscores and spaces (max 40).');
  }
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
    baselineStart: '', baselineEnd: '',
    isTitle: data.isTitle ? 'TRUE' : ''   // v11 BATCH H5
  });

  // v11 BATCH B: only create the estimate group if this SOW does not
  // already have one. Before the cascade delete existed, a deleted-then-
  // re-added SOW could end up with two groups pointing at the same id,
  // and every estimate read would pick whichever came first.
  // v11 BATCH H5: a TITLE gets no estimate group. It was getting one,
  // which is why a newly added title appeared on the Estimates tab with
  // a draft estimate nobody could ever approve — and why the tab's
  // "all approved" state, and the print button that depends on it,
  // could never be reached once a title existed.
  const hasGroup = readAll_('EstimateGroups').some(function (g) {
    return g.projectId === projectId && String(g.sowId) === id;
  });
  if (!hasGroup && !data.isTitle) {
    appendRow_('EstimateGroups', {
      id: nextId_('EG'), projectId: projectId, sowId: id,
      sowDescription: description, status: 'draft'
    });
  }

  logActivity_('SOW ' + id + ' added to project ' + projectId, 'blue', id);
  return { success: true, id: id };
}

/**
 * updateSOWItem - Edits a SOW item.
 *
 * ── v11 BATCH B ──────────────────────────────────────────────
 * TWO CHANGES.
 *
 * 1. SCOPED WRITES. Every lookup here matched SOWItems by `id` ALONE.
 *    SOW ids are hand-typed ("A.1", "1.1") and repeat freely across
 *    projects, so editing A.1 in this project could rewrite A.1 in a
 *    different one. All SOWItems access is now keyed on id + projectId.
 *
 * 2. THE ID ITSELF IS EDITABLE, via data.newId. The old flow only ever
 *    changed the description (the UI was a single prompt()), so a typo
 *    in the SOW number meant deleting the item and rebuilding its whole
 *    estimate. Renaming is a genuine cascade — the id is a foreign key
 *    in eight places — so it is handled by renameSOWId_() below rather
 *    than a bare column write.
 */
function updateSOWItem(projectId, sowId, data) {
  assertProjectEditor_(projectId);   // v6.6

  const key = { id: sowId, projectId: projectId };
  if (findRowNumWhere_('SOWItems', key) === -1) throw new Error('SOW item not found in this project.');

  // ── the id rename runs FIRST, so the field patch below lands on the
  //    row under its new id ──
  var renamedTo = null;
  if (data.newId !== undefined && String(data.newId).trim() &&
      String(data.newId).trim() !== String(sowId)) {
    renamedTo = renameSOWId_(projectId, sowId, String(data.newId).trim());
    sowId = renamedTo;
    key.id = sowId;
  }

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

  if (Object.keys(patch).length) updateRowWhere_('SOWItems', key, patch);

  // v8: keep the estimate group's description in sync when the SOW is
  // renamed, so the Estimates tab and breakdown modal show the new name.
  if (data.description !== undefined) {
    const grp = readAll_('EstimateGroups').find(function (g) { return g.projectId === projectId && g.sowId === sowId; });
    if (grp) updateRow_('EstimateGroups', 'id', grp.id, { sowDescription: data.description });
  }

  logActivity_('SOW ' + sowId + ' updated' + (renamedTo ? ' (renamed from ' + arguments[1] + ')' : ''), 'blue', sowId);
  return { success: true, id: sowId, renamed: !!renamedTo };
}

/**
 * renameSOWId_ (v11 BATCH B) - Changes a SOW item's id and rewrites
 * every reference to it inside the SAME project.
 *
 * The SOW id is an unenforced foreign key in eight places. Changing the
 * SOWItems row alone would leave all of them pointing at an id that no
 * longer exists — the estimate would detach, the item would vanish from
 * its own budget rollup, and its cash advances would stop counting
 * toward "actual". Every one of those is rewritten here:
 *
 *   SOWItems.id                     the row itself
 *   SOWItems.predecessors           sibling tasks that depend on it
 *   EstimateGroups.sowId            the estimate and all its line items
 *   CashAdvanceRequests.sowId       feeds the SOW actual
 *   CashRelease.sowId               feeds the SOW actual
 *   VariationOrders.sowId           adjusts the SOW budget + contract
 *   Punchlist.sowId                 defect tracking
 *   OTRequests.sowIdsJSON           affected-SOW array
 *   DailyRecords.workAccomplishedJSON[].scope   drives % complete
 *
 * Everything is scoped by projectId, so an identical id in another
 * project is never touched.
 *
 * The whole call runs inside the document lock doPost() already takes
 * for write actions, so no other request can read a half-renamed state.
 */
function renameSOWId_(projectId, oldId, newId) {
  if (!/^[A-Za-z0-9._\- ]{1,40}$/.test(newId)) {
    throw new Error('SOW ID may only contain letters, numbers, dots, dashes, underscores and spaces (max 40).');
  }
  const clash = readAll_('SOWItems').find(function (s) {
    return s.projectId === projectId && String(s.id) === newId;
  });
  if (clash) throw new Error('SOW ID "' + newId + '" already exists in this project.');

  // 1. the row itself
  updateRowWhere_('SOWItems', { id: oldId, projectId: projectId }, { id: newId });

  // 2. predecessor links on sibling tasks (comma-separated id list)
  readAll_('SOWItems').filter(function (s) {
    return s.projectId === projectId && String(s.predecessors || '').indexOf(oldId) > -1;
  }).forEach(function (s) {
    const rebuilt = String(s.predecessors).split(',')
      .map(function (p) { return p.trim(); })
      .map(function (p) { return p === oldId ? newId : p; })
      .filter(String).join(',');
    if (rebuilt !== String(s.predecessors)) {
      updateRowWhere_('SOWItems', { id: s.id, projectId: projectId }, { predecessors: rebuilt });
    }
  });

  // 3. simple sowId foreign keys, all project-scoped
  [['EstimateGroups', 'sowId'], ['CashAdvanceRequests', 'sowId'],
   ['CashRelease', 'sowId'], ['VariationOrders', 'sowId'],
   ['Punchlist', 'sowId']].forEach(function (spec) {
    const sheetName = spec[0], col = spec[1];
    readAll_(sheetName).filter(function (r) {
      return r.projectId === projectId && String(r[col]) === oldId;
    }).forEach(function (r) {
      const p = {}; p[col] = newId;
      updateRow_(sheetName, 'id', r.id, p);
    });
  });

  // 4. OT requests hold an ARRAY of affected SOW ids
  readAll_('OTRequests').filter(function (o) { return o.projectId === projectId; })
    .forEach(function (o) {
      const ids = safeParse_(o.sowIdsJSON, []);
      if (ids.indexOf(oldId) === -1) return;
      const next = ids.map(function (x) { return x === oldId ? newId : x; });
      updateRow_('OTRequests', 'id', o.id, { sowIdsJSON: JSON.stringify(next) });
    });

  // 5. daily reports scope each accomplishment row to a SOW id — this is
  //    what computeSOWProgress_ reads, so missing it would zero the
  //    item's % complete and its earned value.
  readAll_('DailyRecords').filter(function (d) { return d.projectId === projectId; })
    .forEach(function (d) {
      const rows = safeParse_(d.workAccomplishedJSON, []);
      if (!rows.length) return;
      var touched = false;
      rows.forEach(function (w) {
        if (String(w.scope) === oldId) { w.scope = newId; touched = true; }
      });
      if (touched) updateRow_('DailyRecords', 'id', d.id, { workAccomplishedJSON: JSON.stringify(rows) });
    });

  logActivity_('SOW ' + oldId + ' renamed to ' + newId + ' in ' + projectId +
    ' — estimates, cash advances, variations, punchlist, OT and daily reports relinked', 'blue', newId);
  return newId;
}

/**
 * moveSOWItem (v8) - Super Admin moves a SOW item up or down in the
 * display order. Sort orders are normalized to 1000, 2000, 3000... on
 * first use (legacy rows fall back to their sheet position), then the
 * two neighbours simply swap values.
 */
function moveSOWItem(projectId, sowId, direction) {
  requireSuperAdmin_('reordering SOW items');
  const list = readAll_('SOWItems')
    .filter(function (s) { return s.projectId === projectId; })
    .map(function (s, i) {
      s._ord = (s.sortOrder !== '' && s.sortOrder !== undefined && s.sortOrder !== null && !isNaN(parseFloat(s.sortOrder)))
        ? parseFloat(s.sortOrder) : (i + 1) * 1000;
      return s;
    })
    .sort(function (a, b) { return a._ord - b._ord; });

  const idx = list.findIndex(function (s) { return s.id === sowId; });
  if (idx === -1) throw new Error('SOW item not found.');
  const swapWith = direction === 'up' ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= list.length) return { success: true, moved: false };

  // normalize everyone, then swap the two involved
  list.forEach(function (s, i) { s._ord = (i + 1) * 1000; });
  const a = list[idx]._ord;
  list[idx]._ord = list[swapWith]._ord;
  list[swapWith]._ord = a;
  // SOW ids (e.g. "A.1") can repeat across projects, so rows are matched
  // by id AND projectId — never by id alone.
  const sh = sheet_('SOWItems');
  const heads = headers_('SOWItems');
  const idCol = heads.indexOf('id'), pjCol = heads.indexOf('projectId'), soCol = heads.indexOf('sortOrder');
  if (soCol === -1) throw new Error('sortOrder column is missing — run migrateSchemas() once from the Apps Script editor.');
  const values = sh.getDataRange().getValues();
  const ordById = {};
  list.forEach(function (s) { ordById[s.id] = s._ord; });
  for (let r = 1; r < values.length; r++) {
    if (String(values[r][pjCol]) !== String(projectId)) continue;
    const rid = String(values[r][idCol]);
    if (ordById[rid] !== undefined) sh.getRange(r + 1, soCol + 1).setValue(ordById[rid]);
  }
  _invalidateRead_('SOWItems');
  logActivity_('SOW ' + sowId + ' moved ' + direction + ' in project ' + projectId, 'blue', sowId);
  return { success: true, moved: true };
}

/**
 * deleteSOWItem - Removes a SOW item and everything that belongs to it.
 *
 * ── v11 BATCH B: TWO BUGS FIXED ──────────────────────────────
 *
 * 1. WRONG-PROJECT DELETE. The row was found with
 *    findRowNum_('SOWItems', 'id', sowId) — id only. SOW ids are typed
 *    by hand and repeat across projects, so deleting "A.1" here could
 *    delete "A.1" belonging to another project, whichever sat higher in
 *    the sheet. Silent, unrecoverable data loss. Now scoped to
 *    id + projectId.
 *
 * 2. ORPHANED ESTIMATE LINE ITEMS. The EstimateGroups row was deleted
 *    but its children in EstimateMaterials / EstimateLabor /
 *    EstimateEquipment / EstimateIndirect were left behind forever,
 *    keyed to a groupId nothing points at any more. The old confirm
 *    dialog even admitted this ("its estimate group will be orphaned").
 *    Every material, labor, equipment and indirect row you ever entered
 *    for a deleted SOW stayed in the spreadsheet, growing it on every
 *    delete and slowing every estimate read. They are now removed with
 *    the group.
 *
 * Returns what was actually deleted so the UI can report it honestly.
 */
function deleteSOWItem(projectId, sowId) {
  assertProjectEditor_(projectId);   // v6.6

  const deleted = deleteRowsWhere_('SOWItems', { id: sowId, projectId: projectId });
  if (!deleted) throw new Error('SOW item not found in this project.');

  // ── cascade: estimate group + every line item under it ──
  const groupIds = readAll_('EstimateGroups')
    .filter(function (g) { return g.projectId === projectId && g.sowId === sowId; })
    .map(function (g) { return g.id; });

  var lineItems = 0;
  if (groupIds.length) {
    ['EstimateMaterials', 'EstimateLabor', 'EstimateEquipment', 'EstimateIndirect']
      .forEach(function (sheetName) {
        lineItems += deleteRowsByValues_(sheetName, 'groupId', groupIds);
      });
    groupIds.forEach(function (gid) { deleteRow_('EstimateGroups', 'id', gid); });
  }

  // ── dangling references: clear rather than delete ──
  // A cash advance or variation order is a financial record and must
  // survive its SOW. Blanking the link keeps the money in the project
  // ledger while removing the pointer to a row that no longer exists.
  var unlinked = 0;
  [['CashAdvanceRequests', 'sowId'], ['CashRelease', 'sowId'], ['Punchlist', 'sowId']]
    .forEach(function (spec) {
      readAll_(spec[0]).filter(function (r) {
        return r.projectId === projectId && String(r[spec[1]]) === String(sowId);
      }).forEach(function (r) {
        const p = {}; p[spec[1]] = '';
        updateRow_(spec[0], 'id', r.id, p);
        unlinked++;
      });
    });

  // Predecessor links pointing at the deleted task would break the CPM
  // forward pass, so they are stripped from every sibling.
  readAll_('SOWItems').filter(function (s) {
    return s.projectId === projectId && String(s.predecessors || '').indexOf(sowId) > -1;
  }).forEach(function (s) {
    const rebuilt = String(s.predecessors).split(',')
      .map(function (p) { return p.trim(); })
      .filter(function (p) { return p && p !== String(sowId); })
      .join(',');
    updateRowWhere_('SOWItems', { id: s.id, projectId: projectId }, { predecessors: rebuilt });
  });

  logActivity_('SOW ' + sowId + ' deleted from project ' + projectId +
    ' — ' + groupIds.length + ' estimate group(s), ' + lineItems + ' line item(s) removed' +
    (unlinked ? ', ' + unlinked + ' record(s) unlinked' : ''), 'a', sowId);
  return { success: true, estimateGroups: groupIds.length, lineItems: lineItems, unlinked: unlinked };
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
/**
 * computeSOWProgressAsOf_ (v6.8.1) - Same "latest report date wins" rule
 * as computeSOWProgress_, but only counting reports dated on/before the
 * cutoff, so the EVM chart can draw EV as a historical line.
 *
 * DATES ARE COMPARED AS 'yyyy-MM-dd' STRINGS, not as parsed Dates. The
 * mapped records carry fmtDate_ output, which is always zero-padded ISO,
 * so lexicographic comparison is exact and timezone-proof. Parsing to
 * Date instead silently dropped (a) records whose stored value didn't
 * parse cleanly and (b) records dated on the cutoff day itself, because
 * an ISO string parses as UTC midnight while the cutoff was local
 * midnight — that off-by-hours gap zeroed the whole EV line even though
 * the EV KPI (computed by the tolerant computeSOWProgress_) was correct.
 */
/**
 * buildProgressIndex_ (v9.3 PERF) - Builds, in ONE pass over the daily
 * records, a per-SOW timeline: { sowId: [{ d: 'yyyy-MM-dd', p: pct }, ...] }
 * sorted by date, one entry per date (max % reported that day).
 *
 * WHY: the S-curve asked "what was SOW X's % as of date D" once per
 * (bucket x SOW). Each of those calls re-scanned EVERY daily record, so
 * the cost was months x SOW x records — and the v9 weekly series
 * multiplied it again (up to 60 more buckets). On a long project that
 * was millions of iterations, i.e. SECONDS of Apps Script CPU on every
 * project open. Building the index once and binary-searching it gives
 * identical numbers for a tiny fraction of the work.
 */
function buildProgressIndex_(dailyRecords) {
  var byS = {};
  (dailyRecords || []).forEach(function (d) {
    if (d.status === 'rejected') return;
    var key = String(d.date || '');
    if (!key) return;
    (d.workAccomplished || []).forEach(function (w) {
      var sid = String(w.scope || '');
      if (!sid) return;
      var pct = parseFloat(w.percentComplete) || 0;
      if (!byS[sid]) byS[sid] = {};
      // same date, multiple rows for the SOW -> keep the highest %
      if (byS[sid][key] === undefined || pct > byS[sid][key]) byS[sid][key] = pct;
    });
  });
  var out = {};
  Object.keys(byS).forEach(function (sid) {
    out[sid] = Object.keys(byS[sid]).sort().map(function (dt) {
      return { d: dt, p: byS[sid][dt] };
    });
  });
  return out;
}

/**
 * progressAsOfIdx_ (v9.3 PERF) - The % of a SOW as of a cutoff date,
 * read from buildProgressIndex_ via binary search. Matches the old
 * computeSOWProgressAsOf_ exactly: the value from the most recent
 * record on or before the cutoff that reported this SOW.
 */
function progressAsOfIdx_(index, sowId, cutoffStr) {
  var arr = index[String(sowId)];
  if (!arr || !arr.length) return 0;
  var lo = 0, hi = arr.length - 1, best = -1;
  while (lo <= hi) {
    var mid = (lo + hi) >> 1;
    if (arr[mid].d <= cutoffStr) { best = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  if (best < 0) return 0;
  return Math.min(100, Math.max(0, arr[best].p));
}

function computeSOWProgressAsOf_(sowId, dailyRecords, cutoffStr) {
  let bestKey = '';
  let best = 0;
  (dailyRecords || []).forEach(function (d) {
    if (d.status === 'rejected') return;
    const key = String(d.date || '');
    if (!key || key > cutoffStr) return;
    const rows = (d.workAccomplished || []).filter(function (w) {
      return String(w.scope) === String(sowId);
    });
    if (!rows.length) return;
    const pct = rows.reduce(function (mx, w) {
      return Math.max(mx, parseFloat(w.percentComplete) || 0);
    }, 0);
    if (bestKey === '' || key > bestKey || (key === bestKey && pct > best)) {
      bestKey = key;
      best = pct;
    }
  });
  return Math.min(100, Math.max(0, best));
}

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
  assertProjectEditor_(projectId);   // v6.6
  const valid = ['auto', 'indirect', 'manual'];
  if (valid.indexOf(mode) === -1) throw new Error('Invalid budget mode: ' + mode);

  // v11 BATCH B: scoped to id + projectId. SOW ids repeat across
  // projects, so the id-only lookup could set another project's budget.
  if (findRowNumWhere_('SOWItems', { id: sowId, projectId: projectId }) === -1) {
    throw new Error('SOW item not found in this project.');
  }

  let budget;
  if (mode === 'manual') {
    budget = parseFloat(manualAmount) || 0;
  } else {
    const g = readAll_('EstimateGroups').find(function (row) {
      return row.projectId === projectId && row.sowId === sowId;
    });
    budget = g ? computeEstimateGroupTotalByMode_(g.id, mode) : 0;
  }

  updateRowWhere_('SOWItems', { id: sowId, projectId: projectId }, { budgetMode: mode, budget: budget });
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
  assertProjectEditor_(projectId);   // v6.6
  const items = readAll_('SOWItems').filter(function (s) { return s.projectId === projectId; });
  if (!items.length) throw new Error('No SOW items to baseline.');
  items.forEach(function (s) {
    // v11 BATCH B: scoped — an id-only write here baselined the
    // same-numbered task in whichever project happened to sit first.
    updateRowWhere_('SOWItems', { id: s.id, projectId: projectId }, {
      baselineStart: s.startDate || '',
      baselineEnd: s.endDate || ''
    });
  });
  logActivity_('Baseline saved for project ' + projectId + ' (' + items.length + ' tasks) by ' + currentUserName_(), 'blue');
  return { success: true, count: items.length };
}