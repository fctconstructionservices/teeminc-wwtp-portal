/**
 * 22-PortfolioService.gs — Cross-project overview (v7.2)
 *
 * WHY: with several projects running, the question "which one needs me
 * today?" could only be answered by opening each project and reading its
 * numbers. This computes that answer once, across everything.
 *
 * NO NEW DATA: every figure here already exists somewhere — SPI/CPI from
 * the EVM logic, contract readiness from the billing gate, overdue
 * billings from the Billings sheet, staleness from the daily reports. The
 * value is in collecting them and RANKING them by how much they matter.
 *
 * Attention items are severity-scored so the list is ordered by urgency
 * rather than by project, which is what makes it scannable in seconds.
 */

var PORTFOLIO_STALE_DAYS = 5;        // no daily report for this long → flag
var PORTFOLIO_OVERDUE_DAYS = 30;     // billing sent this long ago → flag

function getPortfolioData() {
  requireLogin_();

  readMany_(['Projects', 'SOWItems', 'EstimateGroups', 'EstimateMaterials',
    'EstimateLabor', 'EstimateEquipment', 'EstimateIndirect', 'DailyRecords',
    'CashRelease', 'IncomingCashRequests', 'CashAdvanceRequests',
    'Billings', 'VariationOrders', 'ClientLists']);

  // v11 BATCH F2: quotations and lost bids live in the Projects sheet
  // but are not projects — see isLiveProject_() in 28-QuotationService.
  var projects = readAll_('Projects').filter(isLiveProject_);
  var clients = readAll_('ClientLists');
  var clientById = {};
  clients.forEach(function (c) { clientById[c.id] = c.name || c.clientName || ''; });

  var allSOW = readAll_('SOWItems');
  var allDaily = liveDailyRecords_();
  var allBillings = readAll_('Billings');
  var allVOs = readAll_('VariationOrders');
  var allReleases = readAll_('CashRelease');
  var allIncoming = readAll_('IncomingCashRequests');

  var groups = readAll_('EstimateGroups');
  var mats = readAll_('EstimateMaterials');
  var labor = readAll_('EstimateLabor');
  var equip = readAll_('EstimateEquipment');
  var indirect = readAll_('EstimateIndirect');
  var groupTotal_ = function (gid) {
    var s = 0;
    mats.forEach(function (m) { if (m.groupId === gid) s += parseFloat(m.cost) || 0; });
    labor.forEach(function (l) { if (l.groupId === gid) s += parseFloat(l.cost) || 0; });
    equip.forEach(function (e) { if (e.groupId === gid) s += parseFloat(e.cost) || 0; });
    indirect.forEach(function (i) { if (i.groupId === gid) s += parseFloat(i.amount) || 0; });
    return s;
  };

  var today = new Date(); today.setHours(0, 0, 0, 0);
  var todayKey = fmtDate_(today);
  var attention = [];
  var rows = [];

  var totalContract = 0, totalBilled = 0, totalCollected = 0, totalVO = 0;
  var totalFunding = 0;   // v10: owner capital, reported separately from collections

  projects.forEach(function (p) {
    if (String(p.status || '').toLowerCase() === 'archived') return;

    var sows = allSOW.filter(function (s) { return s.projectId === p.id; });
    var daily = allDaily.filter(function (d) { return d.projectId === p.id && d.status !== 'rejected'; });
    var bills = allBillings.filter(function (b) { return b.projectId === p.id; });
    var vos = allVOs.filter(function (v) { return v.projectId === p.id && v.status === 'Client-Approved'; });

    // ── contract basis per SOW (approved estimates + approved VOs) ──
    var voBySow = {};
    vos.forEach(function (v) { voBySow[v.sowId] = (voBySow[v.sowId] || 0) + (parseFloat(v.amount) || 0); });
    var groupBySow = {};
    groups.forEach(function (g) { if (g.projectId === p.id) groupBySow[g.sowId] = g; });

    var basisSum = 0, earned = 0, plannedSum = 0, plannedToDate = 0;
    var unapproved = [], zeroBudget = [];

    // ── v18 FIX: TITLES ARE NOT MISSING AN ESTIMATE ──
    // A title has nothing to price — that is what makes it a title. It
    // was being counted as an SOW item without an approved estimate, so
    // every project with a properly structured BOQ reported a problem
    // that could never be cleared. Approving every real estimate did
    // not silence it, which is the worst kind of alert: one you learn
    // to ignore.
    var tree = buildSowTree_(sows);
    var isHeading = {};
    tree.forEach(function (n) { if (n.isHeading) isHeading[String(n.id).trim()] = true; });

    sows.forEach(function (s) {
      if (String(s.isMilestone) === 'true') return;
      if (isHeading[String(s.id).trim()]) return;
      var g = groupBySow[s.id];
      var est = (g && g.status === 'approved') ? groupTotal_(g.id) : 0;
      if (est <= 0) unapproved.push(s.id);
      var budget = parseFloat(s.budget) || 0;
      if (!(budget > 0)) zeroBudget.push(s.id);

      var basis = est + (voBySow[s.id] || 0);
      basisSum += basis;
      var prog = computeSOWProgress_(s.id, daily.map(function (d) {
        return { status: d.status, date: fmtDate_(d.date), workAccomplished: safeParse_(d.workAccomplishedJSON, []) };
      }));
      earned += basis * (prog / 100);

      // planned value to date, from the schedule
      plannedSum += budget;
      var sS = new Date(s.startDate), sE = new Date(s.endDate);
      if (!isNaN(sS) && !isNaN(sE)) {
        if (today >= sE) plannedToDate += budget;
        else if (today > sS) plannedToDate += budget * ((today - sS) / Math.max(sE - sS, 1));
      }
    });

    // ── v11 BATCH G1: ACCRUAL ──
    // Cost now comes from the shared helper (30-CostBasis.gs) so the
    // portfolio's CPI matches the one on each project's own page. Cash
    // released is kept separately below for the cash position, because
    // under accrual those are no longer the same figure.
    var actualCost = projectActualCost_(p.id);
    var cashOut = allReleases.filter(function (r) {
      return r.projectId === p.id && r.status === 'Reviewed';
    }).reduce(function (s, r) { return s + (parseFloat(r.amount) || 0); }, 0);

    // ── v10: COLLECTED = CLIENT MONEY ONLY ──
    // This used to sum EVERY approved incoming-cash row, but that sheet
    // also holds owner capital, partner injections and loans. Capital was
    // therefore reported as client collections, which made Collected
    // exceed Billed and drove "Uncollected" negative.
    // A collection must be traceable to a billing: either the auto-posted
    // row from Mark Paid (sourceType 'Client Collection') or, for rows
    // created before this column existed, a Billing Collection /
    // Downpayment payment method or a reference to a billing number.
    var projIncoming = allIncoming.filter(function (c) {
      return c.projectId === p.id && c.status === 'Approved';
    });
    var isClientMoney = function (c) {
      if (c.sourceType) return String(c.sourceType) === 'Client Collection';
      var pm = String(c.paymentMethod || '');
      if (pm === 'Billing Collection' || pm === 'Downpayment') return true;
      return /^(PB|DP)-\d+/.test(String(c.reference || ''));   // legacy rows
    };
    var collected = projIncoming.filter(isClientMoney)
      .reduce(function (s, c) { return s + (parseFloat(c.amount) || 0); }, 0);
    // everything else is real cash but it is FUNDING, not a collection
    var funding = projIncoming.filter(function (c) { return !isClientMoney(c); })
      .reduce(function (s, c) { return s + (parseFloat(c.amount) || 0); }, 0);

    var billedGross = bills.filter(function (b) { return b.status !== 'Rejected'; })
      .reduce(function (s, b) { return s + (parseFloat(b.grossAmount) || 0); }, 0);

    var voSum = vos.reduce(function (s, v) { return s + (parseFloat(v.amount) || 0); }, 0);
    var contract = (parseFloat(p.contractValue) || 0) + voSum;

    var progress = basisSum > 0 ? (earned / basisSum * 100) : 0;
    var spi = plannedToDate > 0 ? earned / plannedToDate : null;
    var cpi = actualCost > 0 ? earned / actualCost : null;

    totalContract += contract;
    totalBilled += billedGross;
    totalCollected += collected;
    totalFunding += funding;
    totalVO += voSum;

    // ── health verdict ──
    var health = 'On Track', healthClass = 'ok';
    if ((spi !== null && spi < 0.85) || (cpi !== null && cpi < 0.85)) { health = 'At Risk'; healthClass = 'bad'; }
    else if ((spi !== null && spi < 1) || (cpi !== null && cpi < 1)) { health = 'Watch'; healthClass = 'warn'; }
    if (String(p.status || '').toLowerCase() === 'planning' || basisSum === 0) { health = 'Setup'; healthClass = 'neutral'; }

    // ── attention items, severity-scored so urgency drives the order ──
    if (cpi !== null && cpi < 0.9) {
      attention.push({
        severity: cpi < 0.8 ? 1 : 2, icon: '⚠', projectId: p.id, projectName: p.name,
        text: 'CPI ' + cpi.toFixed(2) + ' - over by ₱' + fmtMoney_(Math.round(actualCost - earned)) + ' against value earned',
        tab: 'overview'
      });
    }
    if (spi !== null && spi < 0.9) {
      attention.push({
        severity: spi < 0.8 ? 1 : 2, icon: '🕐', projectId: p.id, projectName: p.name,
        text: 'SPI ' + spi.toFixed(2) + ' - behind schedule',
        tab: 'gantt'
      });
    }
    bills.forEach(function (b) {
      if (b.status !== 'Approved' && b.status !== 'Sent') return;
      var d = new Date(fmtDate_(b.createdAt));
      if (isNaN(d)) return;
      var age = Math.round((today - d) / 86400000);
      if (age >= PORTFOLIO_OVERDUE_DAYS) {
        attention.push({
          severity: age >= 60 ? 1 : 2, icon: '₱', projectId: p.id, projectName: p.name,
          text: b.billingNo + ' — ' + age + ' days overdue (₱' + fmtMoney_(b.netAmount) + ')',
          tab: 'billings'
        });
      }
    });
    if (unapproved.length) {
      attention.push({
        severity: 3, icon: '📋', projectId: p.id, projectName: p.name,
        text: unapproved.length + ' estimate(s) not yet approved - billing is locked',
        tab: 'estimates'
      });
    }
    if (zeroBudget.length) {
      attention.push({
        severity: 3, icon: '📋', projectId: p.id, projectName: p.name,
        text: zeroBudget.length + ' SOW item(s) without a budget',
        tab: 'sow'
      });
    }
    if (String(p.status || '').toLowerCase() === 'ongoing' && daily.length) {
      var lastKey = daily.reduce(function (mx, d) {
        var k = fmtDate_(d.date); return k > mx ? k : mx;
      }, '');
      if (lastKey) {
        var lastD = new Date(lastKey);
        var gap = Math.round((today - lastD) / 86400000);
        if (gap >= PORTFOLIO_STALE_DAYS) {
          attention.push({
            severity: gap >= 10 ? 2 : 3, icon: '📅', projectId: p.id, projectName: p.name,
            text: 'No daily report for ' + gap + ' days',
            tab: 'daily'
          });
        }
      }
    }

    rows.push({
      id: p.id,
      name: p.name,
      status: p.status || 'Ongoing',
      client: clientById[p.clientId] || '',
      progress: Math.round(progress * 10) / 10,
      spi: spi === null ? null : Math.round(spi * 100) / 100,
      cpi: cpi === null ? null : Math.round(cpi * 100) / 100,
      contract: Math.round(contract),
      billed: Math.round(billedGross),
      collected: Math.round(collected),
      actualCost: Math.round(actualCost),
      funding: Math.round(funding),
      cashPosition: Math.round(collected + funding - cashOut),
      health: health,
      healthClass: healthClass
    });
  });

  attention.sort(function (a, b) { return a.severity - b.severity; });

  var uncollected = totalBilled - totalCollected;
  return {
    summary: {
      activeProjects: rows.filter(function (r) { return String(r.status).toLowerCase() !== 'completed'; }).length,
      totalProjects: rows.length,
      totalContract: Math.round(totalContract),
      totalVO: Math.round(totalVO),
      totalBilled: Math.round(totalBilled),
      totalCollected: Math.round(totalCollected),
      totalFunding: Math.round(totalFunding),
      uncollected: Math.round(uncollected),
      attentionCount: attention.length,
      urgentCount: attention.filter(function (a) { return a.severity === 1; }).length
    },
    attention: attention.slice(0, 20),
    projects: rows
  };
}