/**
 * 12-SearchService.gs — Global search
 *
 * PURPOSE: Case-insensitive substring search across projects and all
 * request sheets, returning uniform {type, id, label} rows for the
 * frontend results table.
 */

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
  readAll_('Liquidations').forEach(function (l) {
    if (l.id.toLowerCase().indexOf(query) > -1 || (l.description && l.description.toLowerCase().indexOf(query) > -1)) {
      results.push({ type: 'Liquidation', id: l.id, label: l.description });
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
