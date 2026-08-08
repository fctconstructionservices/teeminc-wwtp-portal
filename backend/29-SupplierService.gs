/**
 * 29-SupplierService.gs — Supplier master data (v11 BATCH G1)
 *
 * PURPOSE: The people you buy from, and — the part that actually
 * matters — WHEN THEY MUST BE PAID.
 *
 * WHY THIS IS NEW. Materials and Equipment already carry a `supplier`
 * column, but it is free text: a name, nothing else. No terms, no TIN,
 * no contact, and no way to answer "who do we owe, and when is it due".
 * Payment terms live here because the due date on every payable is
 * computed from them.
 *
 * The free-text `supplier` field on Materials and Equipment is LEFT
 * ALONE. A `supplierId` is added alongside it so records can be linked
 * over time without a migration that would rewrite years of catalogue
 * data on the strength of fuzzy name matching.
 *
 * VAT lives here too, per supplier, because in practice some issue VAT
 * invoices and some do not, and getting it wrong at entry is much more
 * expensive than asking once.
 */

var SUPPLIER_TERMS = [0, 7, 15, 30, 45, 60, 90];   // days; 0 = COD

/** getSuppliers - all suppliers, with outstanding balance per supplier. */
function getSuppliers() {
  ensureSheet_('Suppliers');
  var rows = readAll_('Suppliers');

  // Outstanding is computed live rather than stored: a cached balance
  // that drifts from the invoices is worse than no balance at all.
  var owed = {};
  if (ss_().getSheetByName('SupplierInvoices')) {
    readAll_('SupplierInvoices').forEach(function (inv) {
      if (low_(inv.status) === 'cancelled') return;
      var bal = (parseFloat(inv.grossAmount) || 0) - (parseFloat(inv.paidAmount) || 0);
      if (bal > 0.005) owed[inv.supplierId] = (owed[inv.supplierId] || 0) + bal;
    });
  }

  rows.forEach(function (s) {
    s.outstanding = Math.round((owed[s.id] || 0) * 100) / 100;
    s.termsLabel = supplierTermsLabel_(s.termsDays);
  });
  rows.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
  return sanitizeDatesDeep_(rows);
}

function supplierTermsLabel_(days) {
  var d = parseInt(days, 10);
  if (!d) return 'Cash on delivery';
  return d + ' days from delivery';
}

/** supplierById_ - internal lookup. */
function supplierById_(id) {
  return readAll_('Suppliers').find(function (s) { return s.id === id; }) || null;
}

/**
 * supplierDueDate_ - The whole point of the supplier record.
 * Due date = delivery date + terms. COD is due on delivery.
 */
function supplierDueDate_(supplierId, deliveryDate) {
  var s = supplierById_(supplierId);
  var days = s ? (parseInt(s.termsDays, 10) || 0) : 0;
  var base = deliveryDate ? new Date(deliveryDate) : new Date();
  if (isNaN(base)) base = new Date();
  var due = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
  return fmtDate_(due);
}

function addSupplier(data) {
  requireApprover_('adding a supplier');
  ensureSheet_('Suppliers');
  if (!data || !String(data.name || '').trim()) throw new Error('Supplier name is required.');

  var name = String(data.name).trim();
  if (readAll_('Suppliers').some(function (s) {
    return low_(s.name) === low_(name) && low_(s.status) !== 'inactive';
  })) {
    throw new Error('A supplier named "' + name + '" already exists.');
  }

  var id = nextId_('SUP');
  appendRow_('Suppliers', {
    id: id,
    name: name,
    contactPerson: String(data.contactPerson || ''),
    contactNumber: String(data.contactNumber || ''),
    email: String(data.email || ''),
    address: String(data.address || ''),
    tin: String(data.tin || ''),
    termsDays: _supTerms_(data.termsDays),
    vatRegistered: data.vatRegistered === undefined ? true : !!data.vatRegistered,
    pricesIncludeVat: data.pricesIncludeVat === undefined ? true : !!data.pricesIncludeVat,
    category: String(data.category || ''),
    notes: String(data.notes || ''),
    status: 'active',
    createdBy: currentUserEmail_().toLowerCase(),
    createdAt: new Date(),
    updatedAt: new Date()
  });
  logActivity_('Supplier "' + name + '" added (' + supplierTermsLabel_(data.termsDays) + ')', 'blue', id);
  return { success: true, id: id };
}

function _supTerms_(v) {
  var d = parseInt(v, 10);
  if (isNaN(d) || d < 0) return 0;
  return Math.min(d, 180);
}

function updateSupplier(id, data) {
  requireApprover_('editing a supplier');
  var s = supplierById_(id);
  if (!s) throw new Error('Supplier not found.');
  var upd = { updatedAt: new Date() };
  ['name', 'contactPerson', 'contactNumber', 'email', 'address', 'tin', 'category', 'notes']
    .forEach(function (f) { if (data[f] !== undefined) upd[f] = String(data[f]).trim(); });
  if (data.termsDays !== undefined) upd.termsDays = _supTerms_(data.termsDays);
  ['vatRegistered', 'pricesIncludeVat'].forEach(function (f) {
    if (data[f] !== undefined) upd[f] = !!data[f];
  });
  if (data.status !== undefined) {
    upd.status = low_(data.status) === 'inactive' ? 'inactive' : 'active';
  }
  updateRow_('Suppliers', 'id', id, upd);
  logActivity_('Supplier ' + (upd.name || s.name) + ' updated', 'g', id);
  return { success: true };
}

/**
 * deleteSupplier - Super Admin only, and only when nothing references
 * them. A supplier with purchase history is DEACTIVATED instead:
 * deleting them would orphan every PO and invoice that names them, and
 * an unpaid invoice pointing at a supplier who no longer exists is a
 * debt you cannot chase.
 */
function deleteSupplier(id) {
  requireSuperAdmin_('deleting a supplier');
  var s = supplierById_(id);
  if (!s) throw new Error('Supplier not found.');

  var used = 0;
  ['PurchaseOrders', 'SupplierInvoices'].forEach(function (sheet) {
    if (!ss_().getSheetByName(sheet)) return;
    used += readAll_(sheet).filter(function (r) { return r.supplierId === id; }).length;
  });

  if (used) {
    updateRow_('Suppliers', 'id', id, { status: 'inactive', updatedAt: new Date() });
    logActivity_('Supplier ' + s.name + ' deactivated (has ' + used + ' record(s), so not deleted)', 'a', id);
    return { success: true, deactivated: true, references: used };
  }
  deleteRow_('Suppliers', 'id', id);
  logActivity_('Supplier ' + s.name + ' deleted by ' + currentUserName_(), 'a', id);
  return { success: true, deactivated: false };
}
