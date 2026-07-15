/**
 * 11-ApprovalService.gs — Central approval workflow
 *
 * PURPOSE: The approvals inbox and the single decision engine.
 *
 * decideItem_() enforces, per request type: self-approval ban,
 * status guards, one-vote-per-approver (Approvals sheet), and the
 * "all admins/approvers except the requestor" consensus rule for
 * cash advances. forceApprove/forceReject are superadmin-only
 * overrides that reuse the same engine.
 *
 * SCALABILITY: To make a NEW request type approvable, add one
 * `if (type === '...')` block in decideItem_() and include it in
 * getPendingApprovals()/getMy*Requests().
 */

// ============================================================
//  APPROVALS
// ============================================================

function getPendingApprovals() {
  const userEmail = currentUserEmail_().toLowerCase();
  const userRecord = readAll_('Users').find(function (u) { 
    return u.email.toLowerCase() === userEmail; 
  });
  const isAdmin = userRecord && (userRecord.role === 'admin' || userRecord.role === 'superadmin');

  // Cash Advances
  const cashAdvances = readAll_('CashAdvanceRequests').filter(function (r) {
    return r.status === 'Pending' && r.requestorEmail.toLowerCase() !== userEmail;
  }).map(function (r) {
    return { id: r.id, type: 'CashAdvance', projectId: r.projectId, requestor: r.requestor, requestorEmail: r.requestorEmail, amount: r.amount, description: r.description, status: r.status, createdAt: r.createdAt };
  });

  // Cash Releases (For Review) - Admin only
  let releases = [];
  if (isAdmin && userRecord.role !== 'superadmin') {
    releases = readAll_('CashRelease').filter(function (r) {
      return r.status === 'For Review' && r.releasedBy && r.releasedBy.toLowerCase() !== userEmail;
    }).map(function (r) {
      return { 
        id: r.id, 
        type: 'CashRelease', 
        projectId: r.projectId, 
        requestor: r.requestor, 
        requestorEmail: r.requestorEmail, 
        amount: r.amount, 
        description: r.description, 
        status: r.status, 
        createdAt: r.createdAt,
        releasedBy: r.releasedBy
      };
    });
  }

  // Liquidations
  const liquidations = readAll_('Liquidations').filter(function (l) {
    return l.status === 'Pending' && l.requestorEmail.toLowerCase() !== userEmail;
  }).map(function (l) {
    return { id: l.id, type: 'Liquidation', projectId: l.projectId, requestor: l.requestor, requestorEmail: l.requestorEmail, amount: l.amount, description: l.description, status: l.status, createdAt: l.createdAt };
  });

  // Materials, Equipment, DailyRecords, Estimates
  const materials = readAll_('Materials').filter(function (m) { 
    return m.status === 'Pending' && m.requestedBy && m.requestedBy.toLowerCase() !== userEmail; 
  });
  const equipment = readAll_('Equipment').filter(function (e) { 
    return e.status === 'Pending' && e.requestedBy && e.requestedBy.toLowerCase() !== userEmail; 
  });
  const dailyRecords = readAll_('DailyRecords').filter(function (d) { 
    return d.status === 'pending' && d.createdBy && d.createdBy.toLowerCase() !== userEmail; 
  });
  const estimates = readAll_('EstimateGroups').filter(function (g) { 
    return g.status === 'pending'; 
  });

  return {
    cashAdvances: cashAdvances,
    releases: releases,
    liquidations: liquidations,
    materials: materials,
    equipment: equipment,
    dailyRecords: dailyRecords,
    estimates: estimates
  };
}

function getMyPendingRequests() {
  const email = currentUserEmail_().toLowerCase();
  const cashAdvances = readAll_('CashAdvanceRequests').filter(function (r) { 
    return r.requestorEmail && r.requestorEmail.toLowerCase() === email && r.status === 'Pending'; 
  }).map(function(r) { r.type = 'CashAdvance'; return r; });
  
  const releases = readAll_('CashRelease').filter(function (r) { 
    return r.requestorEmail && r.requestorEmail.toLowerCase() === email && r.status === 'Pending'; 
  }).map(function(r) { r.type = 'CashRelease'; return r; });
  
  const incoming = readAll_('IncomingCashRequests').filter(function (r) { 
    return r.requestorEmail && r.requestorEmail.toLowerCase() === email && r.status === 'Pending'; 
  }).map(function(r) { r.type = 'IncomingCash'; return r; });
  
  const liquidations = readAll_('Liquidations').filter(function (l) { 
    return l.requestorEmail && l.requestorEmail.toLowerCase() === email && l.status === 'Pending'; 
  }).map(function(l) { l.type = 'Liquidation'; return l; });
  
  const materials = readAll_('Materials').filter(function (m) { 
    return m.requestedBy && m.requestedBy.toLowerCase() === email && m.status === 'Pending'; 
  }).map(function(m) { m.type = 'Material'; return m; });
  
  const equipment = readAll_('Equipment').filter(function (e) { 
    return e.requestedBy && e.requestedBy.toLowerCase() === email && e.status === 'Pending'; 
  }).map(function(e) { e.type = 'Equipment'; return e; });
  
  const dailyRecords = readAll_('DailyRecords').filter(function (d) { 
    return d.createdBy && d.createdBy.toLowerCase() === email && d.status === 'pending'; 
  }).map(function(d) { d.type = 'DailyRecord'; return d; });
  
  const estimates = readAll_('EstimateGroups').filter(function (g) { 
    return g.status === 'pending'; 
  }).map(function(g) { g.type = 'Estimate'; return g; });

  return [].concat(cashAdvances, releases, incoming, liquidations, materials, equipment, dailyRecords, estimates);
}

function getMyApprovedRequests() {
  const email = currentUserEmail_().toLowerCase();
  const cashAdvances = readAll_('CashAdvanceRequests').filter(function (r) { 
    return r.requestorEmail && r.requestorEmail.toLowerCase() === email && r.status === 'Approved'; 
  }).map(function(r) { r.type = 'CashAdvance'; return r; });
  
  const incoming = readAll_('IncomingCashRequests').filter(function (r) { 
    return r.requestorEmail && r.requestorEmail.toLowerCase() === email && r.status === 'Approved'; 
  }).map(function(r) { r.type = 'IncomingCash'; return r; });
  
  const liquidations = readAll_('Liquidations').filter(function (l) { 
    return l.requestorEmail && l.requestorEmail.toLowerCase() === email && l.status === 'Approved'; 
  }).map(function(l) { l.type = 'Liquidation'; return l; });
  
  const materials = readAll_('Materials').filter(function (m) { 
    return m.requestedBy && m.requestedBy.toLowerCase() === email && m.status === 'approved'; 
  }).map(function(m) { m.type = 'Material'; return m; });
  
  const equipment = readAll_('Equipment').filter(function (e) { 
    return e.requestedBy && e.requestedBy.toLowerCase() === email && e.status === 'approved'; 
  }).map(function(e) { e.type = 'Equipment'; return e; });
  
  const dailyRecords = readAll_('DailyRecords').filter(function (d) { 
    return d.createdBy && d.createdBy.toLowerCase() === email && d.status === 'approved'; 
  }).map(function(d) { d.type = 'DailyRecord'; return d; });
  
  return [].concat(cashAdvances, incoming, liquidations, materials, equipment, dailyRecords);
}

function getMyRejectedRequests() {
  const email = currentUserEmail_().toLowerCase();
  const cashAdvances = readAll_('CashAdvanceRequests').filter(function (r) { 
    return r.requestorEmail && r.requestorEmail.toLowerCase() === email && r.status === 'Rejected'; 
  }).map(function(r) { r.type = 'CashAdvance'; return r; });
  
  const incoming = readAll_('IncomingCashRequests').filter(function (r) { 
    return r.requestorEmail && r.requestorEmail.toLowerCase() === email && r.status === 'Rejected'; 
  }).map(function(r) { r.type = 'IncomingCash'; return r; });
  
  const liquidations = readAll_('Liquidations').filter(function (l) { 
    return l.requestorEmail && l.requestorEmail.toLowerCase() === email && l.status === 'Rejected'; 
  }).map(function(l) { l.type = 'Liquidation'; return l; });
  
  const materials = readAll_('Materials').filter(function (m) { 
    return m.requestedBy && m.requestedBy.toLowerCase() === email && m.status === 'rejected'; 
  }).map(function(m) { m.type = 'Material'; return m; });
  
  const equipment = readAll_('Equipment').filter(function (e) { 
    return e.requestedBy && e.requestedBy.toLowerCase() === email && e.status === 'rejected'; 
  }).map(function(e) { e.type = 'Equipment'; return e; });
  
  const dailyRecords = readAll_('DailyRecords').filter(function (d) { 
    return d.createdBy && d.createdBy.toLowerCase() === email && d.status === 'rejected'; 
  }).map(function(d) { d.type = 'DailyRecord'; return d; });
  
  return [].concat(cashAdvances, incoming, liquidations, materials, equipment, dailyRecords);
}

function getRequestById(id) {
  let req = readAll_('CashAdvanceRequests').find(function (r) { return r.id === id; });
  if (req) return req;
  req = readAll_('CashRelease').find(function (r) { return r.id === id; });
  if (req) return req;
  req = readAll_('IncomingCashRequests').find(function (r) { return r.id === id; });
  if (req) return req;
  req = readAll_('Liquidations').find(function (l) { return l.id === id; });
  if (req) return req;
  req = readAll_('Materials').find(function (m) { return m.id === id; });
  if (req) return req;
  req = readAll_('Equipment').find(function (e) { return e.id === id; });
  if (req) return req;
  req = readAll_('DailyRecords').find(function (d) { return d.id === id; });
  if (req) return req;
  return null;
}

function approveItem(id, type) {
  return decideItem_(id, type, 'Approved');
}

function rejectItem(id, type) {
  return decideItem_(id, type, 'Rejected');
}

function decideItem_(id, type, decision) {
  const approver = currentUserEmail_().toLowerCase();

  // ─── CASH ADVANCE ────────────────────────────────
  if (type === 'CashAdvance') {
    const ca = readAll_('CashAdvanceRequests').find(function (r) { return r.id === id; });
    if (!ca) throw new Error('Cash advance request not found.');
    if (ca.requestorEmail && ca.requestorEmail.toLowerCase() === approver) {
      throw new Error('Self-approval is not allowed.');
    }
    if (ca.status !== 'Pending') throw new Error('Request is not pending.');
    
    // Check if user already approved/rejected
    const existingApprovals = readAll_('Approvals').filter(function (a) {
      return a.requestId === id && a.approver === approver;
    });
    if (existingApprovals.length > 0) {
      throw new Error('You have already approved/rejected this request.');
    }

    appendRow_('Approvals', {
      requestId: id,
      approver: approver,
      decision: decision,
      timestamp: new Date(),
      remarks: ''
    });

    let finalStatus = 'Pending';
    if (decision === 'Rejected') {
      finalStatus = 'Rejected';
    } else {
      const allApprovers = getAdminEmails_();
      const approvals = readAll_('Approvals').filter(function (a) {
        return a.requestId === id && a.decision === 'Approved';
      });
      const distinctApprovers = approvals.map(function (a) { return a.approver; });
      const uniqueApprovers = distinctApprovers.filter(function (v, i, self) { return self.indexOf(v) === i; });
      const requiredForApproval = allApprovers.filter(function (a) {
        return a !== String(ca.requestorEmail).toLowerCase();
      });
      const allApproved = requiredForApproval.every(function (approverEmail) {
        return uniqueApprovers.indexOf(approverEmail) !== -1;
      });
      finalStatus = allApproved ? 'Approved' : 'Pending';
    }

    if (finalStatus === 'Approved') {
      return approveCashAdvance(id);
    } else {
      updateRow_('CashAdvanceRequests', 'id', id, { status: finalStatus });
      logActivity_('Cash advance ' + id + ' ' + finalStatus.toLowerCase(), finalStatus === 'Rejected' ? 'a' : 'blue');
      return { success: true, status: finalStatus };
    }
  }

  // ─── CASH RELEASE ────────────────────────────────
  if (type === 'CashRelease') {
    const release = readAll_('CashRelease').find(function (r) { return r.id === id; });
    if (!release) throw new Error('Cash release record not found.');
    if (release.releasedBy && release.releasedBy.toLowerCase() === approver) {
      throw new Error('Self-review is not allowed.');
    }
    if (release.status !== 'For Review') throw new Error('Release is not in review status.');
    return reviewRelease(id, approver);
  }

  // ─── INCOMING CASH ──────────────────────────────
  if (type === 'IncomingCash' || type === 'Incoming Cash') {
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

  // ─── LIQUIDATION ──────────────────────────────────
  if (type === 'Liquidation') {
    const liq = readAll_('Liquidations').find(function (l) { return l.id === id; });
    if (!liq) throw new Error('Liquidation record not found.');
    if (liq.requestorEmail && liq.requestorEmail.toLowerCase() === approver) {
      throw new Error('Self-approval is not allowed.');
    }
    if (liq.status !== 'Pending') throw new Error('Liquidation is not pending.');
    if (decision === 'Approved') {
      return approveLiquidation(id);
    } else {
      return rejectLiquidation(id);
    }
  }

  // ─── MATERIALS ────────────────────────────────────
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

  // ─── EQUIPMENT ────────────────────────────────────
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

  // ─── DAILY RECORD ──────────────────────────────────
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

  // ─── ESTIMATE ──────────────────────────────────────
  if (type === 'Estimate') {
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
