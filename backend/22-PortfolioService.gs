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

  var projects = readAll_('Projects');
  var clients = readAll_('ClientLists');
  var clientById = {};
  clients.forEach(function (c) { clientById[c.id] = c.name || c.clientName || ''; });

  var allSOW = readAll_('SOWItems');
  var allDaily = readAll_('DailyRecords');
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

    sows.forEach(function (s) {
      if (String(s.isMilestone) === 'true') return;
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

    var actualCost = allReleases.filter(function (r) {
      return r.projectId === p.id && r.status === 'Reviewed';
    }).reduce(function (s, r) { return s + (parseFloat(r.amount) || 0); }, 0);

    var collected = allIncoming.filter(function (c) {
      return c.projectId === p.id && c.status === 'Approved';
    }).reduce(function (s, c) { return s + (parseFloat(c.amount) || 0); }, 0);

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
        text: 'CPI ' + cpi.toFixed(2) + ' — lampas ng ₱' + fmtMoney_(Math.round(actualCost - earned)) + ' ang gastos sa nakuha',
        tab: 'overview'
      });
    }
    if (spi !== null && spi < 0.9) {
      attention.push({
        severity: spi < 0.8 ? 1 : 2, icon: '🕐', projectId: p.id, projectName: p.name,
        text: 'SPI ' + spi.toFixed(2) + ' — huli sa iskedyul',
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
          text: b.billingNo + ' — ' + age + ' araw nang hindi nababayaran (₱' + fmtMoney_(b.netAmount) + ')',
          tab: 'billings'
        });
      }
    });
    if (unapproved.length) {
      attention.push({
        severity: 3, icon: '📋', projectId: p.id, projectName: p.name,
        text: unapproved.length + ' estimate(s) hindi pa approved — naka-lock ang billing',
        tab: 'estimates'
      });
    }
    if (zeroBudget.length) {
      attention.push({
        severity: 3, icon: '📋', projectId: p.id, projectName: p.name,
        text: zeroBudget.length + ' SOW item(s) walang budget',
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
            text: 'Walang daily report sa loob ng ' + gap + ' araw',
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
      cashPosition: Math.round(collected - actualCost),
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
      uncollected: Math.round(uncollected),
      attentionCount: attention.length,
      urgentCount: attention.filter(function (a) { return a.severity === 1; }).length
    },
    attention: attention.slice(0, 20),
    projects: rows
  };
}