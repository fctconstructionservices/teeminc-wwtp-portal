/**
 * 27-LessonsService.gs — Lessons Learned (v11 BATCH F1)
 *
 * PURPOSE: Item 11's second half. When a project finishes, its whole
 * life cycle — plan versus actual — is captured as a permanent record in
 * the Knowledge Base, together with concrete suggestions for the next
 * project.
 *
 * WHY A RETROSPECTIVE HAS TO BE GENERATED, NOT TYPED.
 * Every construction firm intends to write lessons learned and almost
 * none do, because at handover nobody wants to reconstruct nine months
 * of slippage from memory. So this does not ask you to remember: it
 * reads the baseline dates, the budgets, the actuals, the daily reports,
 * the safety log and the punchlist that are ALREADY in the system and
 * works out what happened. You then edit and add the judgement that only
 * a person has.
 *
 * A NOTE ON THE SUGGESTIONS.
 * They are RULE-BASED and every one names the evidence it came from —
 * "B.2 finished 14 days after baseline" — so you can check it. They are
 * deliberately not vague advice. A suggestion nobody can trace back to a
 * number gets ignored, and rightly so.
 *
 * The generator is idempotent per project: re-running it replaces the
 * auto-generated entry and never touches manually written lessons.
 */

// ============================================================
//  LESSONS
// ============================================================

/** getLessons - every lesson, newest first. Optionally one project. */
function getLessons(projectId) {
  ensureSheet_('LessonsLearned');
  var rows = readAll_('LessonsLearned');
  if (projectId) rows = rows.filter(function (l) { return l.projectId === projectId; });
  rows.sort(function (a, b) { return new Date(b.capturedAt) - new Date(a.capturedAt); });
  return sanitizeDatesDeep_(rows.map(function (l) {
    l.metrics = safeParse_(l.metricsJSON, null);
    l.findings = safeParse_(l.findingsJSON, []);
    l.suggestions = safeParse_(l.suggestionsJSON, []);
    return l;
  }));
}

/** addLesson - a manually written lesson. Any project editor may file one. */
function addLesson(data) {
  ensureSheet_('LessonsLearned');
  if (!data || !data.title) throw new Error('A title is required.');
  if (data.projectId) assertProjectEditor_(data.projectId);
  var proj = data.projectId
    ? readAll_('Projects').find(function (p) { return p.id === data.projectId; })
    : null;
  var id = nextId_('LL');
  appendRow_('LessonsLearned', {
    id: id,
    projectId: String(data.projectId || ''),
    projectName: proj ? proj.name : String(data.projectName || ''),
    source: 'manual',
    category: String(data.category || 'General'),
    title: String(data.title),
    whatHappened: String(data.whatHappened || ''),
    rootCause: String(data.rootCause || ''),
    impact: String(data.impact || ''),
    recommendation: String(data.recommendation || ''),
    metricsJSON: '',
    findingsJSON: '',
    suggestionsJSON: '',
    capturedBy: currentUserEmail_().toLowerCase(),
    capturedAt: new Date(),
    updatedAt: new Date()
  });
  logActivity_('Lesson learned ' + id + ' filed: ' + data.title, 'blue', id);
  return { success: true, id: id };
}

function updateLesson(id, data) {
  var row = readAll_('LessonsLearned').find(function (l) { return l.id === id; });
  if (!row) throw new Error('Lesson not found.');
  if (row.projectId) assertProjectEditor_(row.projectId);
  var upd = { updatedAt: new Date() };
  ['category', 'title', 'whatHappened', 'rootCause', 'impact', 'recommendation']
    .forEach(function (f) { if (data[f] !== undefined) upd[f] = String(data[f]); });
  updateRow_('LessonsLearned', 'id', id, upd);
  logActivity_('Lesson learned ' + id + ' updated', 'g', id);
  return { success: true };
}

function deleteLesson(id) {
  requireSuperAdmin_('deleting a lesson learned');
  var row = readAll_('LessonsLearned').find(function (l) { return l.id === id; });
  if (!row) throw new Error('Lesson not found.');
  deleteRow_('LessonsLearned', 'id', id);
  logActivity_('Lesson learned ' + id + ' deleted by ' + currentUserName_(), 'a', id);
  return { success: true };
}

// ============================================================
//  RETROSPECTIVE — plan vs actual across the whole life cycle
// ============================================================

var _LL_DAY_MS = 86400000;

function _llDay(v) {
  if (!v) return null;
  var m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}
function _llDiff(a, b) { return Math.round((b - a) / _LL_DAY_MS); }
function _llPct(n, d) { return d ? Math.round(n / d * 1000) / 10 : 0; }

/**
 * generateProjectRetrospective - Reads everything the project recorded
 * and produces the metrics, the findings and the suggestions.
 *
 * Returns the retrospective WITHOUT saving, so the UI can show it for
 * review first. saveProjectRetrospective() persists it. Generating and
 * saving are separate because an auto-written record that lands in the
 * knowledge base unreviewed is how a knowledge base fills with noise.
 */
function generateProjectRetrospective(projectId) {
  var proj = readAll_('Projects').find(function (p) { return p.id === projectId; });
  if (!proj) throw new Error('Project not found.');

  readMany_(['SOWItems', 'DailyRecords', 'SafetyRecords', 'Punchlist',
    'Billings', 'VariationOrders', 'CashAdvanceRequests', 'EstimateGroups']);

  var sow = readAll_('SOWItems').filter(function (s) { return s.projectId === projectId; });
  var daily = readAll_('DailyRecords').filter(function (d) {
    return d.projectId === projectId && low_(d.status) !== 'deleted';
  });
  var safety = readAll_('SafetyRecords').filter(function (r) { return r.projectId === projectId; });
  var punch = readAll_('Punchlist').filter(function (r) { return r.projectId === projectId; });
  var vos = readAll_('VariationOrders').filter(function (v) { return v.projectId === projectId; });
  var bills = readAll_('Billings').filter(function (b) {
    return b.projectId === projectId && low_(b.status) !== 'rejected';
  });

  // ── schedule: baseline vs actual, per item and overall ──
  var slips = [];
  var withBaseline = 0;
  sow.forEach(function (s) {
    var bs = _llDay(s.baselineStart), be = _llDay(s.baselineEnd);
    var as_ = _llDay(s.startDate), ae = _llDay(s.endDate);
    if (!be || !ae) return;
    withBaseline++;
    var finishSlip = _llDiff(be, ae);
    var startSlip = (bs && as_) ? _llDiff(bs, as_) : null;
    var planDur = (bs && be) ? _llDiff(bs, be) + 1 : null;
    var actDur = (as_ && ae) ? _llDiff(as_, ae) + 1 : null;
    slips.push({
      id: s.id, description: s.description,
      startSlip: startSlip, finishSlip: finishSlip,
      planDuration: planDur, actualDuration: actDur,
      durationDelta: (planDur && actDur) ? actDur - planDur : null,
      critical: !!String(s.predecessors || '').trim()
    });
  });
  var lateItems = slips.filter(function (x) { return x.finishSlip > 0; })
    .sort(function (a, b) { return b.finishSlip - a.finishSlip; });
  var earlyItems = slips.filter(function (x) { return x.finishSlip < 0; })
    .sort(function (a, b) { return a.finishSlip - b.finishSlip; });

  var planEnd = null, actEnd = null;
  sow.forEach(function (s) {
    var be = _llDay(s.baselineEnd), ae = _llDay(s.endDate);
    if (be && (!planEnd || be > planEnd)) planEnd = be;
    if (ae && (!actEnd || ae > actEnd)) actEnd = ae;
  });
  var overallSlip = (planEnd && actEnd) ? _llDiff(planEnd, actEnd) : null;

  // ── cost: budget vs actual, per item and overall ──
  var totalBudget = 0, totalActual = 0;
  var overruns = [];
  sow.forEach(function (s) {
    var b = parseFloat(s.budget) || 0, a = parseFloat(s.actual) || 0;
    totalBudget += b; totalActual += a;
    if (b > 0 && a > b) {
      overruns.push({ id: s.id, description: s.description, budget: b, actual: a,
        over: a - b, overPct: _llPct(a - b, b) });
    }
  });
  overruns.sort(function (a, b) { return b.over - a.over; });

  // ── site effort ──
  var manDays = 0, workDays = daily.length, issueCount = 0, lostHours = 0;
  var manByRole = {};
  daily.forEach(function (d) {
    safeParse_(d.manpowerJSON, []).forEach(function (m) {
      var n = parseInt(m.count, 10) || 0;
      manDays += n;
      var role = m.role || m.classification || 'Unspecified';
      manByRole[role] = (manByRole[role] || 0) + n;
    });
    safeParse_(d.issuesJSON, []).forEach(function (i) {
      issueCount++;
      lostHours += parseFloat(i.timeLost) || 0;
    });
  });

  // ── safety and quality ──
  var safetyByType = {};
  safety.forEach(function (r) { safetyByType[r.recordType] = (safetyByType[r.recordType] || 0) + 1; });
  var incidents = (safetyByType['Incident'] || 0);
  var nearMisses = (safetyByType['Near Miss'] || 0);
  var toolbox = (safetyByType['Toolbox Talk'] || 0);
  var punchOpen = punch.filter(function (p) { return p.status !== 'Closed'; }).length;

  // ── commercial ──
  var voApproved = vos.filter(function (v) { return low_(v.status) === 'approved'; });
  var voValue = voApproved.reduce(function (s, v) { return s + (parseFloat(v.amount) || 0); }, 0);
  var billedNet = bills.reduce(function (s, b) { return s + (parseFloat(b.netAmount) || 0); }, 0);
  var collected = bills.filter(function (b) { return low_(b.status) === 'paid'; })
    .reduce(function (s, b) { return s + (parseFloat(b.netAmount) || 0); }, 0);

  var contract = parseFloat(proj.contractValue) || 0;
  var contractRevised = contract + voValue;

  var metrics = {
    contractValue: contract,
    contractValueRevised: contractRevised,
    totalBudget: Math.round(totalBudget * 100) / 100,
    totalActual: Math.round(totalActual * 100) / 100,
    costVariance: Math.round((totalBudget - totalActual) * 100) / 100,
    costVariancePct: _llPct(totalBudget - totalActual, totalBudget),
    plannedFinish: planEnd ? fmtDate_(planEnd) : '',
    actualFinish: actEnd ? fmtDate_(actEnd) : '',
    overallSlipDays: overallSlip,
    sowCount: sow.length,
    sowWithBaseline: withBaseline,
    lateItems: lateItems.length,
    earlyItems: earlyItems.length,
    workDays: workDays,
    manDays: manDays,
    issueCount: issueCount,
    lostHours: Math.round(lostHours * 10) / 10,
    toolboxTalks: toolbox,
    incidents: incidents,
    nearMisses: nearMisses,
    punchlistTotal: punch.length,
    punchlistOpen: punchOpen,
    voCount: voApproved.length,
    voValue: Math.round(voValue * 100) / 100,
    billedNet: Math.round(billedNet * 100) / 100,
    collected: Math.round(collected * 100) / 100,
    topOverruns: overruns.slice(0, 5),
    topDelays: lateItems.slice(0, 5).map(function (x) {
      return { id: x.id, description: x.description, days: x.finishSlip };
    }),
    manpowerByRole: manByRole
  };

  return {
    projectId: projectId,
    projectName: proj.name,
    metrics: metrics,
    findings: _llFindings(metrics, withBaseline, sow.length),
    suggestions: _llSuggestions(metrics, withBaseline, sow.length, lateItems, overruns)
  };
}

/**
 * _llFindings - plain statements of what the numbers say. Facts only;
 * the judgement about what to do about them lives in _llSuggestions.
 */
function _llFindings(m, withBaseline, sowCount) {
  var out = [];

  if (m.overallSlipDays === null) {
    out.push({ area: 'Schedule', text:
      'Schedule performance cannot be measured — no baseline was saved for this project.' });
  } else if (m.overallSlipDays > 0) {
    out.push({ area: 'Schedule', text:
      'Finished ' + m.overallSlipDays + ' day(s) after the baseline finish of ' + m.plannedFinish +
      '. ' + m.lateItems + ' of ' + withBaseline + ' baselined item(s) finished late.' });
  } else if (m.overallSlipDays < 0) {
    out.push({ area: 'Schedule', text:
      'Finished ' + Math.abs(m.overallSlipDays) + ' day(s) ahead of the baseline finish of ' +
      m.plannedFinish + '.' });
  } else {
    out.push({ area: 'Schedule', text: 'Finished exactly on the baseline finish date.' });
  }

  if (m.totalBudget > 0) {
    if (m.costVariance < 0) {
      out.push({ area: 'Cost', text:
        'Actual cost exceeded budget by ' + fmtMoney_(Math.abs(m.costVariance)) +
        ' (' + Math.abs(m.costVariancePct) + '%). ' + m.topOverruns.length +
        ' SOW item(s) ran over.' });
    } else {
      out.push({ area: 'Cost', text:
        'Came in ' + fmtMoney_(m.costVariance) + ' (' + m.costVariancePct +
        '%) under the total budget of ' + fmtMoney_(m.totalBudget) + '.' });
    }
  } else {
    out.push({ area: 'Cost', text:
      'Cost performance cannot be measured — no SOW budgets were set.' });
  }

  if (m.voCount) {
    out.push({ area: 'Commercial', text:
      m.voCount + ' approved variation order(s) worth ' + fmtMoney_(m.voValue) +
      ', moving the contract from ' + fmtMoney_(m.contractValue) + ' to ' +
      fmtMoney_(m.contractValueRevised) + '.' });
  }

  if (m.billedNet > 0) {
    var outstanding = m.billedNet - m.collected;
    out.push({ area: 'Commercial', text:
      fmtMoney_(m.billedNet) + ' billed net, ' + fmtMoney_(m.collected) + ' collected' +
      (outstanding > 0 ? ', ' + fmtMoney_(outstanding) + ' still outstanding at closeout.' : '.') });
  }

  if (m.workDays) {
    out.push({ area: 'Productivity', text:
      m.manDays + ' man-days across ' + m.workDays + ' recorded site day(s), averaging ' +
      Math.round(m.manDays / m.workDays * 10) / 10 + ' workers per day.' });
  }

  if (m.issueCount) {
    out.push({ area: 'Productivity', text:
      m.issueCount + ' issue(s) logged in daily reports, costing ' + m.lostHours + ' recorded hour(s).' });
  }

  out.push({ area: 'Safety', text:
    m.toolboxTalks + ' toolbox talk(s), ' + m.nearMisses + ' near miss(es), ' +
    m.incidents + ' incident(s) recorded.' });

  if (m.punchlistTotal) {
    out.push({ area: 'Quality', text:
      m.punchlistTotal + ' punchlist item(s) raised' +
      (m.punchlistOpen ? ', ' + m.punchlistOpen + ' still open at closeout.' : ', all closed.') });
  }

  return out;
}

/**
 * _llSuggestions - Rule-based recommendations. Each one carries the
 * evidence it was derived from, so the reader can check it rather than
 * take it on trust. Deliberately conservative: a rule only fires when
 * the underlying data is actually there.
 */
function _llSuggestions(m, withBaseline, sowCount, lateItems, overruns) {
  var out = [];
  var add = function (priority, area, text, evidence) {
    out.push({ priority: priority, area: area, text: text, evidence: evidence });
  };

  // ── the data itself was incomplete ──
  if (withBaseline === 0 && sowCount > 0) {
    add('high', 'Process',
      'Save a baseline as soon as the schedule is agreed on the next project. Without one, no schedule performance can be measured at closeout and this retrospective can say nothing about delay.',
      'None of the ' + sowCount + ' SOW items had baseline dates.');
  } else if (withBaseline < sowCount) {
    add('medium', 'Process',
      'Baseline every SOW item, not some. The items without one are invisible to schedule analysis.',
      (sowCount - withBaseline) + ' of ' + sowCount + ' items had no baseline.');
  }
  if (m.totalBudget === 0 && sowCount > 0) {
    add('high', 'Process',
      'Set a budget on every SOW item before work starts. Cost variance cannot be computed without one, so overruns are only visible after the money is spent.',
      'Total SOW budget was zero across ' + sowCount + ' items.');
  }

  // ── schedule ──
  if (m.overallSlipDays !== null && m.overallSlipDays > 0) {
    var worst = lateItems.slice(0, 3);
    if (worst.length) {
      add('high', 'Schedule',
        'Allow more float on the activities that drove the delay, or plan them to start earlier. These three accounted for the largest slips: ' +
        worst.map(function (x) { return x.id + ' (' + x.finishSlip + 'd)'; }).join(', ') + '.',
        'Project finished ' + m.overallSlipDays + ' day(s) past baseline.');
    }
    var linked = lateItems.filter(function (x) { return x.critical; });
    if (linked.length >= 2) {
      add('medium', 'Schedule',
        'Late items were chained to predecessors, so each slip pushed the next. Consider breaking the longest chain into parallel work, or adding buffer between linked activities.',
        linked.length + ' late item(s) had predecessor links.');
    }
  }
  var badEstimates = lateItems.filter(function (x) {
    return x.planDuration && x.actualDuration && x.actualDuration > x.planDuration * 1.5;
  });
  if (badEstimates.length) {
    add('medium', 'Estimating',
      'Duration estimates for these activities were materially short. Use the actual durations from this project as the starting point next time rather than the original estimate.',
      badEstimates.map(function (x) {
        return x.id + ' planned ' + x.planDuration + 'd, took ' + x.actualDuration + 'd';
      }).slice(0, 3).join('; ') + '.');
  }

  // ── cost ──
  if (overruns.length) {
    var top = overruns.slice(0, 3);
    add(m.costVariance < 0 ? 'high' : 'medium', 'Cost',
      'Review the unit rates and quantities used for these items before quoting similar work: ' +
      top.map(function (x) { return x.id + ' (+' + x.overPct + '%)'; }).join(', ') + '.',
      top.map(function (x) {
        return x.id + ' budget ' + fmtMoney_(x.budget) + ', actual ' + fmtMoney_(x.actual);
      }).join('; ') + '.');
  }

  // ── commercial ──
  if (m.voCount >= 3) {
    add('medium', 'Commercial',
      'A high number of variations usually points to scope that was unclear at tender. Tighten the scope definition and the exclusions list on the next quotation.',
      m.voCount + ' approved variation orders worth ' + fmtMoney_(m.voValue) + '.');
  }
  if (m.billedNet > 0 && m.collected < m.billedNet) {
    add('high', 'Commercial',
      'Collection lagged billing at closeout. Agree the billing and payment cycle with the client in writing before mobilisation, and chase retention release on a schedule.',
      fmtMoney_(m.billedNet - m.collected) + ' of ' + fmtMoney_(m.billedNet) + ' still uncollected.');
  }

  // ── productivity ──
  if (m.issueCount && m.lostHours > 0) {
    add(m.lostHours >= 40 ? 'high' : 'low', 'Productivity',
      'Time lost to logged issues was material. Review the recurring causes in the daily reports and address the top one before the next mobilisation.',
      m.lostHours + ' hour(s) lost across ' + m.issueCount + ' logged issue(s).');
  }

  // ── safety ──
  if (m.incidents > 0) {
    add('high', 'Safety',
      'Incidents occurred. Fold each one into the toolbox talk programme for the next project, and check that the corrective action recorded here was actually carried through.',
      m.incidents + ' incident(s) recorded.');
  }
  if (m.workDays > 0 && m.toolboxTalks / Math.max(m.workDays, 1) < 0.15) {
    add('medium', 'Safety',
      'Toolbox talks were infrequent relative to the number of site days. A weekly minimum is a reasonable target.',
      m.toolboxTalks + ' talk(s) across ' + m.workDays + ' site day(s).');
  }
  if (m.nearMisses === 0 && m.workDays > 30) {
    add('low', 'Safety',
      'No near misses were recorded across a long project. That usually means they were not being reported rather than not happening — worth encouraging on the next job.',
      '0 near misses across ' + m.workDays + ' site day(s).');
  }

  // ── quality ──
  if (m.punchlistOpen > 0) {
    add('high', 'Quality',
      'Punchlist items were still open at closeout. Close every item before demobilising — reopening a site to fix defects costs more than fixing them in place.',
      m.punchlistOpen + ' of ' + m.punchlistTotal + ' item(s) open.');
  }

  if (!out.length) {
    add('low', 'General',
      'No rule-based issues were found in the recorded data. Add your own observations — the numbers cannot capture everything that mattered on site.',
      'All measured indicators were within expected ranges.');
  }

  var rank = { high: 0, medium: 1, low: 2 };
  out.sort(function (a, b) { return rank[a.priority] - rank[b.priority]; });
  return out;
}

/**
 * saveProjectRetrospective - Persists a generated retrospective.
 * Idempotent per project: the previous auto-generated entry is replaced,
 * so re-running after late data arrives does not create duplicates.
 * Manually written lessons are never touched.
 */
function saveProjectRetrospective(projectId, edits) {
  assertProjectEditor_(projectId);
  ensureSheet_('LessonsLearned');
  var r = generateProjectRetrospective(projectId);
  edits = edits || {};

  var existing = readAll_('LessonsLearned').find(function (l) {
    return l.projectId === projectId && l.source === 'auto';
  });

  var payload = {
    projectId: projectId,
    projectName: r.projectName,
    source: 'auto',
    category: 'Project Retrospective',
    title: String(edits.title || ('Retrospective — ' + r.projectName)),
    whatHappened: String(edits.whatHappened || ''),
    rootCause: String(edits.rootCause || ''),
    impact: String(edits.impact || ''),
    recommendation: String(edits.recommendation || ''),
    metricsJSON: JSON.stringify(r.metrics),
    findingsJSON: JSON.stringify(r.findings),
    suggestionsJSON: JSON.stringify(r.suggestions),
    capturedBy: currentUserEmail_().toLowerCase(),
    updatedAt: new Date()
  };

  var id;
  if (existing) {
    id = existing.id;
    updateRow_('LessonsLearned', 'id', id, payload);
  } else {
    id = nextId_('LL');
    payload.id = id;
    payload.capturedAt = new Date();
    appendRow_('LessonsLearned', payload);
  }
  logActivity_('Project retrospective saved for ' + r.projectName +
    ' — ' + r.findings.length + ' finding(s), ' + r.suggestions.length + ' suggestion(s)', 'g', id);
  return { success: true, id: id, retrospective: sanitizeDatesDeep_(r) };
}

/**
 * getRetrospectiveCandidates - Projects at 100% (or marked Completed)
 * that have no saved retrospective yet. This is what stops the exercise
 * being forgotten: the Knowledge Base itself says which projects are
 * waiting.
 */
function getRetrospectiveCandidates() {
  ensureSheet_('LessonsLearned');
  var done = {};
  readAll_('LessonsLearned').forEach(function (l) {
    if (l.source === 'auto' && l.projectId) done[l.projectId] = true;
  });
  var sow = readAll_('SOWItems');
  // `progress` is NOT a stored column — it is derived from the daily
  // reports' work-accomplished rows (see computeSOWProgress_). Reading
  // it off the raw SOWItems row would always be undefined and every
  // project would look complete, so the daily records are parsed here
  // the same way getProjectData does.
  var dailyByProject = {};
  readAll_('DailyRecords').forEach(function (d) {
    if (low_(d.status) === 'deleted') return;
    (dailyByProject[d.projectId] = dailyByProject[d.projectId] || []).push({
      status: d.status,
      workAccomplished: safeParse_(d.workAccomplishedJSON, [])
    });
  });

  return readAll_('Projects').filter(function (p) {
    // v11 BATCH F2: a quotation has no life cycle to look back on.
    if (!isLiveProject_(p)) return false;
    if (done[p.id]) return false;
    if (low_(p.status) === 'completed') return true;
    var items = sow.filter(function (s) { return s.projectId === p.id; });
    if (!items.length) return false;
    var recs = dailyByProject[p.id] || [];
    return items.every(function (s) {
      return computeSOWProgress_(s.id, recs) >= 100;
    });
  }).map(function (p) {
    return { id: p.id, name: p.name, status: p.status, clientName: p.clientName };
  });
}
