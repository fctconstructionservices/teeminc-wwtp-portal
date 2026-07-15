/**
 * 09-EquipmentService.gs — Equipment database
 *
 * PURPOSE: The equipment catalog. Mirrors 08-MaterialService.gs:
 * request -> Pending -> approved, searchable by name or code.
 */

function getAllEquipment() { return readAll_('Equipment'); }
function getEquipment(status) { return readAll_('Equipment').filter(function (e) { return e.status === status; }); }
function requestEquipment(data) {
  const id = nextId_('EQ');
  appendRow_('Equipment', {
    id: id, code: data.code || id, name: data.name, desc: data.desc, category: data.category,
    unit: data.unit, rate: data.rate, brand: data.brand, supplier: data.supplier,
    image: data.image || '', docsJSON: JSON.stringify(data.docs || []), notes: data.notes || '',
    status: 'Pending', requestedBy: currentUserEmail_(), createdAt: new Date()
  });
  logActivity_('Equipment "' + data.name + '" requested by ' + currentUserName_(), 'blue');
  return { success: true, id: id };
}
function approveEquipment(id) { updateRow_('Equipment', 'id', id, { status: 'approved' }); logActivity_('Equipment ' + id + ' approved', 'g'); return { success: true }; }
function searchEquipment(query) {
  query = String(query || '').toLowerCase();
  return readAll_('Equipment').filter(function (e) {
    return (e.name && e.name.toLowerCase().indexOf(query) > -1) ||
      (e.code && String(e.code).toLowerCase().indexOf(query) > -1);
  });
}
