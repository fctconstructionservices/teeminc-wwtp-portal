/**
 * 15-ClientService.gs — Client directory (v3)
 *
 * PURPOSE: Backs the Client dropdown + "Add Client" mini-form inside
 * the Add Project modal. Clients live in the ClientLists sheet and
 * can also be maintained directly in the spreadsheet.
 */

/**
 * getClients - All clients, newest first, for the dropdown.
 */
function getClients() {
  return readAll_('ClientLists').map(function (c) {
    return {
      id: c.id,
      name: c.name,
      contactPerson: c.contactPerson || '',
      contactNumber: c.contactNumber || '',
      email: c.email || '',
      address: c.address || ''
    };
  }).reverse();
}

/**
 * addClient - Creates a client from the in-app mini-form.
 * Name is required; duplicates (case-insensitive name) are rejected
 * so the dropdown never fills up with near-identical entries.
 */
function addClient(data) {
  const name = String(data && data.name || '').trim();
  if (!name) throw new Error('Client name is required.');

  const dup = readAll_('ClientLists').find(function (c) {
    return String(c.name).trim().toLowerCase() === name.toLowerCase();
  });
  if (dup) throw new Error('Client "' + name + '" already exists.');

  const id = nextId_('CL');
  appendRow_('ClientLists', {
    id: id,
    name: name,
    contactPerson: data.contactPerson || '',
    contactNumber: data.contactNumber || '',
    email: data.email || '',
    address: data.address || '',
    createdAt: new Date()
  });
  logActivity_('Client "' + name + '" added by ' + currentUserName_(), 'blue', id);
  return { success: true, id: id, name: name };
}
