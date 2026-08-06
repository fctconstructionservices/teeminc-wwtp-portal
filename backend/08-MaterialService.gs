/**
 * 08-MaterialService.gs — Materials database
 *
 * PURPOSE: The materials catalog. New entries start as 'Pending'
 * requests and become visible in dropdowns once 'approved'
 * (approval itself is routed through 11-ApprovalService.gs).
 */

// ============================================================
//  MATERIALS & EQUIPMENT
// ============================================================

function getAllMaterials() { return readAll_('Materials'); }
function getMaterials(status) { return readAll_('Materials').filter(function (m) { return m.status === status; }); }
function requestMaterial(data) {
  requireLogin_();   // v7.0
  const id = nextId_('MAT');
  appendRow_('Materials', {
    id: id, code: data.code || id, name: data.name, desc: data.desc, category: data.category,
    unit: data.unit, rate: data.rate, brand: data.brand, supplier: data.supplier,
    image: data.image || '', docsJSON: JSON.stringify(data.docs || []), notes: data.notes || '',
    status: 'pending', requestedBy: currentUserEmail_(), createdAt: new Date()
  });
  logActivity_('Material Database Update Request: "' + data.name + '" requested by ' + currentUserName_(), 'blue');
  // v11 BATCH A: Super Admin bypass.
  var autoApproved = autoApproveIfSuper_(id, 'Material');
  return { success: true, id: id, autoApproved: autoApproved };
}
function approveMaterial(id) {
  requireApprover_('approving a material');   // v7.0
  updateRow_('Materials', 'id', id, { status: 'approved' }); logActivity_('Material ' + id + ' approved', 'g'); return { success: true }; }
function searchMaterials(query) {
  query = String(query || '').toLowerCase();
  return readAll_('Materials').filter(function (m) {
    return (m.name && m.name.toLowerCase().indexOf(query) > -1) ||
      (m.code && String(m.code).toLowerCase().indexOf(query) > -1);
  });
}