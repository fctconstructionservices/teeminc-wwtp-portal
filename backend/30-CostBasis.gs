/**
 * 30-CostBasis.gs — What a project has actually COST (v11 BATCH G1)
 *
 * ══════════════════════════════════════════════════════════════
 *  THIS IS THE HIGHEST-RISK FILE IN THE SYSTEM. READ BEFORE EDITING.
 * ══════════════════════════════════════════════════════════════
 *
 * WHY IT EXISTS. Until now, one record did two jobs. A Reviewed
 * `CashRelease` meant BOTH "money left the account" AND "the job cost
 * this much". Under cash basis those are the same event, so nothing
 * broke. Under accrual they are not:
 *
 *   COST      lands when value is consumed — goods received, or an
 *             advance liquidated with receipts.
 *   CASH OUT  lands when money actually moves.
 *
 * Those two numbers now differ, and conflating them would misstate
 * either the project's cost or its cash position.
 *
 * WHAT READS THIS. The figures below feed:
 *   1. SOW item `actual`          (05-ProjectService)
 *   2. Project expenses           (10-FinanceService)
 *   3. EVM's AC, and therefore CPI
 *   4. Portfolio cost variance    (22-PortfolioService)
 *   5. The retrospective's cost findings (27-LessonsService)
 *
 * All five go through this file. If the maths here is wrong, EVERY cost
 * number in the system is wrong at once — which is exactly why it lives
 * in one place instead of being copied into five.
 *
 * ── THE PROVISIONAL RULE ─────────────────────────────────────
 *
 * A naive accrual switch would make every historical figure MOVE.
 * Projects holding unliquidated advances would suddenly look cheaper
 * than they did yesterday — alarming if a client has already been shown
 * a report.
 *
 * So a released-but-unliquidated advance still counts, as a PROVISIONAL
 * cost, replaced by the real figure once liquidated. Formally, for each
 * Reviewed release:
 *
 *     cost = max(liquidated_against_it, unliquidated_remainder + liquidated)
 *          = max(liquidated, released)
 *
 * Consequences, both deliberate:
 *   · Nothing ever drops when this ships. The numbers only get more
 *     accurate, never more flattering.
 *   · If ₱50,000 was released and ₱30,000 liquidated, cost shows
 *     ₱50,000 until the remaining ₱20,000 is either liquidated or
 *     returned — because until then you genuinely do not know which it
 *     is, and the conservative reading is the safe one.
 *   · Liquidating MORE than was released (a top-up settled later) is
 *     counted in full.
 *
 * ── GOODS RECEIVED ───────────────────────────────────────────
 *
 * The third term is receipts against purchase orders. In Batch G1 the
 * Receipts sheet does not exist yet, so that term is zero and this file
 * returns EXACTLY what the old code returned. That is deliberate: the
 * helper is introduced and wired to all five call sites FIRST, verified
 * to change nothing, and only then given a new source of cost in G2.
 * Introducing the plumbing and the new numbers in one step would leave
 * no way to tell which of the two broke something.
 */

/**
 * costBasis_ - Loads everything needed to compute cost for a project,
 * once. Every function below takes this bundle rather than re-reading
 * sheets, because these figures are computed per SOW item in a loop and
 * re-reading inside it is what made the old EVM code quadratic.
 */
function costBasis_(projectId) {
  var sheets = ['CashRelease', 'Liquidations'];
  if (ss_().getSheetByName('Receipts')) sheets.push('Receipts');
  readMany_(sheets);

  var releases = readAll_('CashRelease').filter(function (r) {
    return r.projectId === projectId && low_(r.status) === 'reviewed';
  });

  // Approved liquidations, totalled per originating cash advance.
  var liqByCA = {};
  readAll_('Liquidations').forEach(function (l) {
    if (l.projectId !== projectId) return;
    if (low_(l.status) !== 'approved') return;
    var k = l.cashAdvanceId;
    if (!k) return;
    liqByCA[k] = (liqByCA[k] || 0) + (parseFloat(l.amount) || 0);
  });

  // Goods received against purchase orders. Empty until Batch G2.
  var receipts = [];
  if (ss_().getSheetByName('Receipts')) {
    receipts = readAll_('Receipts').filter(function (r) {
      return r.projectId === projectId && low_(r.status) !== 'cancelled';
    });
  }

  return { releases: releases, liqByCA: liqByCA, receipts: receipts };
}

/**
 * _releaseCost_ - The cost a single Reviewed release represents.
 * See THE PROVISIONAL RULE above.
 */
function _releaseCost_(rel, liqByCA) {
  var released = parseFloat(rel.amount) || 0;
  var liquidated = liqByCA[rel.originalRequestId] || 0;
  return Math.max(released, liquidated);
}

/**
 * projectActualCost_ - Total cost incurred by a project.
 * Replaces the old getTotalReleasedCashForProject() for COSTING.
 * That function still exists and still means CASH OUT — do not
 * substitute one for the other.
 */
function projectActualCost_(projectId, basis) {
  basis = basis || costBasis_(projectId);
  var total = 0;
  basis.releases.forEach(function (r) { total += _releaseCost_(r, basis.liqByCA); });
  basis.receipts.forEach(function (r) { total += _receiptCost_(r); });
  return Math.round(total * 100) / 100;
}

/**
 * sowActualCost_ - Cost incurred against ONE SOW item.
 * A release inherits its sowId from the originating cash advance; a
 * receipt inherits its sowId from the purchase request line.
 */
function sowActualCost_(projectId, sowId, basis) {
  basis = basis || costBasis_(projectId);
  var key = String(sowId);
  var total = 0;
  basis.releases.forEach(function (r) {
    if (String(r.sowId) !== key) return;
    total += _releaseCost_(r, basis.liqByCA);
  });
  basis.receipts.forEach(function (r) {
    if (String(r.sowId) !== key) return;
    total += _receiptCost_(r);
  });
  return Math.round(total * 100) / 100;
}

/**
 * _receiptCost_ - What a goods receipt adds to cost.
 *
 * NET OF RECOVERABLE INPUT VAT when the company is VAT-registered:
 * input VAT is reclaimed, so charging it to the job would overstate the
 * job's cost by 12%. When the company is not VAT-registered the VAT is
 * a real cost and stays in.
 *
 * Returns 0 in Batch G1 — the Receipts sheet does not exist yet.
 */
function _receiptCost_(r) {
  var net = parseFloat(r.netAmount);
  if (!isNaN(net)) return net;
  return parseFloat(r.grossAmount) || 0;
}

/**
 * companyIsVatRegistered_ - Drives whether input VAT is recoverable.
 * Stored in Settings so it is answered once, not per purchase.
 * Defaults to TRUE, which is the common case for a firm invoicing
 * clients with VAT.
 */
function companyIsVatRegistered_() {
  var v = getSetting_('vatRegistered');
  return v === null || v === undefined ? true : !!v;
}

/**
 * splitVat_ - Given an amount and whether it includes VAT, returns
 * { gross, net, vat }. Rate is 12% (Philippines).
 *
 * `net` is what hits the job's cost when VAT is recoverable; `gross` is
 * what the supplier is actually paid and what the payable carries.
 */
function splitVat_(amount, pricesIncludeVat, supplierIsVatRegistered) {
  var amt = parseFloat(amount) || 0;
  var RATE = 0.12;

  // No VAT to split if the supplier does not charge it, or we cannot
  // reclaim it — in the latter case the whole amount is cost.
  if (!supplierIsVatRegistered || !companyIsVatRegistered_()) {
    return { gross: r2_(amt), net: r2_(amt), vat: 0 };
  }
  if (pricesIncludeVat) {
    var net = amt / (1 + RATE);
    return { gross: r2_(amt), net: r2_(net), vat: r2_(amt - net) };
  }
  var vat = amt * RATE;
  return { gross: r2_(amt + vat), net: r2_(amt), vat: r2_(vat) };
}

function r2_(n) { return Math.round((parseFloat(n) || 0) * 100) / 100; }
