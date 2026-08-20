import { all, first, run } from './db.js';
import { logActivity, low, nextId, nowIso, num, requireRole, safeParseArray } from './util.js';

// ─── MATERIALS / EQUIPMENT / MANPOWER ──────────────────────────
// All three are the same shape: a catalog table with a status that
// moves pending -> approved. Keeping one implementation means the
// three can never drift apart the way three copies would.

const CATALOGS = {
  Material: { table: 'Materials', prefix: 'MAT', label: 'material' },
  Equipment: { table: 'Equipment', prefix: 'EQP', label: 'equipment' },
  Manpower: { table: 'Manpower', prefix: 'MPW', label: 'manpower role' },
};

function catalogOf(type) {
  const c = CATALOGS[type];
  if (!c) throw new Error('Unknown catalog type: ' + type);
  return c;
}

async function listCatalog(env, type, status) {
  const { table } = catalogOf(type);
  if (!status) return all(env, `SELECT * FROM "${table}"`);
  return all(env, `SELECT * FROM "${table}" WHERE lower(status) = ?`, low(status));
}

async function searchCatalog(env, type, query, fields) {
  const { table } = catalogOf(type);
  const q = `%${low(query)}%`;
  const where = fields.map((f) => `lower("${f}") LIKE ?`).join(' OR ');
  return all(env, `SELECT * FROM "${table}" WHERE ${where}`, ...fields.map(() => q));
}

export const getAllMaterials = (env) => listCatalog(env, 'Material', null);
export const getMaterials = (env, _i, status) => listCatalog(env, 'Material', status || 'approved');
export const searchMaterials = (env, _i, query) => searchCatalog(env, 'Material', query, ['name', 'code']);

export const getAllEquipment = (env) => listCatalog(env, 'Equipment', null);
export const getEquipment = (env, _i, status) => listCatalog(env, 'Equipment', status || 'approved');
export const searchEquipment = (env, _i, query) => searchCatalog(env, 'Equipment', query, ['name', 'code']);

export const getAllManpower = (env) => listCatalog(env, 'Manpower', null);
export const getManpower = (env, _i, status) => listCatalog(env, 'Manpower', status || 'approved');
export const searchManpower = (env, _i, query) => searchCatalog(env, 'Manpower', query, ['role', 'code']);

export async function requestMaterial(env, identity, data) {
  const d = data || {};
  if (!d.name) throw new Error('A material needs a name.');
  const id = nextId('MAT');
  await run(
    env,
    `INSERT INTO Materials (id, code, name, desc, category, subcategory, unit, rate, brand,
       supplier, model, specs, grade, size, length, thickness, weight, standardCode,
       application, image, docsJSON, notes, status, requestedBy, createdAt)
     VALUES (?, ?, ?, ?, ?, '', ?, ?, ?, ?, '', '', '', '', '', '', '', '', '', ?, ?, ?, 'pending', ?, ?)`,
    id, d.code || id, d.name, d.desc || '', d.category || '', d.unit || '', num(d.rate),
    d.brand || '', d.supplier || '', d.image || '', JSON.stringify(d.docs || []),
    d.notes || '', low(identity.email), nowIso()
  );
  await logActivity(env, identity.email, `Material Database Update Request: "${d.name}" requested.`, 'blue');
  return { success: true, id, autoApproved: false };
}

export async function requestEquipment(env, identity, data) {
  const d = data || {};
  if (!d.name) throw new Error('Equipment needs a name.');
  const id = nextId('EQP');
  await run(
    env,
    `INSERT INTO Equipment (id, code, name, desc, category, type, unit, rate, brand, supplier,
       model, capacity, serial, powerSource, ownership, acquisitionDate, condition, manual,
       image, docsJSON, notes, status, requestedBy, createdAt)
     VALUES (?, ?, ?, ?, ?, '', ?, ?, ?, ?, '', '', '', '', '', '', '', '', ?, ?, ?, 'pending', ?, ?)`,
    id, d.code || id, d.name, d.desc || '', d.category || '', d.unit || '', num(d.rate),
    d.brand || '', d.supplier || '', d.image || '', JSON.stringify(d.docs || []),
    d.notes || '', low(identity.email), nowIso()
  );
  await logActivity(env, identity.email, `Equipment Database Update Request: "${d.name}" requested.`, 'blue');
  return { success: true, id, autoApproved: false };
}

export async function requestManpower(env, identity, data) {
  const d = data || {};
  if (!d.role) throw new Error('A manpower entry needs a role.');
  const id = nextId('MPW');
  await run(
    env,
    `INSERT INTO Manpower (id, code, role, classification, notes, status, requestedBy, createdAt)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
    id, d.code || id, d.role, d.classification || '', d.notes || '', low(identity.email), nowIso()
  );
  await logActivity(env, identity.email, `Manpower Database Update Request: "${d.role}" requested.`, 'blue');
  return { success: true, id, autoApproved: false };
}

// ─── PERSONNEL (real people, not catalog roles) ────────────────

export async function getAllPersonnel(env) {
  return all(env, 'SELECT * FROM Personnel ORDER BY name');
}

export async function addPersonnel(env, identity, data) {
  const d = data || {};
  if (!d.name) throw new Error('A person needs a name.');
  const id = nextId('PRS');
  await run(
    env,
    `INSERT INTO Personnel (id, name, role, classification, contactNumber, dailyRate, notes,
       status, addedBy, createdAt, updatedAt, image, signature)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, d.name, d.role || '', d.classification || '', d.contactNumber || '', num(d.dailyRate),
    d.notes || '', d.status || 'active', low(identity.email), nowIso(), nowIso(),
    d.image || '', d.signature || ''
  );
  await logActivity(env, identity.email, `Personnel "${d.name}" added.`, 'blue');
  return { success: true, id };
}

export async function updatePersonnel(env, identity, id, data) {
  const d = data || {};
  const existing = await first(env, 'SELECT * FROM Personnel WHERE id = ?', id);
  if (!existing) throw new Error('That person is no longer in the directory.');
  await run(
    env,
    `UPDATE Personnel SET name = ?, role = ?, classification = ?, contactNumber = ?,
       dailyRate = ?, notes = ?, status = ?, updatedAt = ?, image = ?, signature = ?
     WHERE id = ?`,
    d.name ?? existing.name, d.role ?? existing.role, d.classification ?? existing.classification,
    d.contactNumber ?? existing.contactNumber,
    d.dailyRate === undefined ? existing.dailyRate : num(d.dailyRate),
    d.notes ?? existing.notes, d.status ?? existing.status, nowIso(),
    d.image ?? existing.image, d.signature ?? existing.signature, id
  );
  await logActivity(env, identity.email, `Personnel "${d.name || existing.name}" updated.`, 'blue');
  return { success: true };
}

// ─── CLIENTS ───────────────────────────────────────────────────

export async function getClients(env) {
  const rows = await all(env, 'SELECT * FROM ClientLists');
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    contactPerson: c.contactPerson || '',
    contactNumber: c.contactNumber || '',
    email: c.email || '',
    address: c.address || '',
  })).reverse();
}

export async function addClient(env, identity, data) {
  const d = data || {};
  if (!d.name) throw new Error('A client needs a name.');
  // Near-identical entries make the dropdown useless, so reject duplicates.
  const dupe = await first(env, 'SELECT id FROM ClientLists WHERE lower(name) = ?', low(d.name));
  if (dupe) throw new Error('A client with that name already exists.');

  const id = nextId('CL');
  await run(
    env,
    `INSERT INTO ClientLists (id, name, contactPerson, contactNumber, email, address, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id, d.name, d.contactPerson || '', d.contactNumber || '', d.email || '', d.address || '', nowIso()
  );
  await logActivity(env, identity.email, `Client "${d.name}" added.`, 'blue');
  return { success: true, id };
}

// ─── SUPPLIERS ─────────────────────────────────────────────────

function supplierTermsLabel(days) {
  const d = parseInt(days, 10);
  if (!d) return 'Cash on delivery';
  return d + ' days from delivery';
}

export async function getSuppliers(env) {
  const [rows, invoices] = await Promise.all([
    all(env, 'SELECT * FROM Suppliers'),
    all(env, 'SELECT supplierId, grossAmount, paidAmount, status FROM SupplierInvoices'),
  ]);

  // Outstanding is computed live rather than stored: a cached balance
  // that drifts from the invoices is worse than no balance at all.
  const owed = new Map();
  for (const inv of invoices) {
    if (low(inv.status) === 'cancelled') continue;
    const bal = num(inv.grossAmount) - num(inv.paidAmount);
    if (bal > 0.005) owed.set(inv.supplierId, (owed.get(inv.supplierId) || 0) + bal);
  }

  for (const s of rows) {
    s.outstanding = Math.round((owed.get(s.id) || 0) * 100) / 100;
    s.termsLabel = supplierTermsLabel(s.termsDays);
  }
  rows.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return rows;
}

export async function addSupplier(env, identity, data) {
  const d = data || {};
  if (!d.name) throw new Error('A supplier needs a name.');
  const id = nextId('SUP');
  await run(
    env,
    `INSERT INTO Suppliers (id, name, contactPerson, contactNumber, email, address, tin,
       termsDays, vatRegistered, pricesIncludeVat, category, notes, status, createdBy,
       createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
    id, d.name, d.contactPerson || '', d.contactNumber || '', d.email || '', d.address || '',
    d.tin || '', num(d.termsDays), d.vatRegistered ? 1 : 0, d.pricesIncludeVat ? 1 : 0,
    d.category || '', d.notes || '', low(identity.email), nowIso(), nowIso()
  );
  await logActivity(env, identity.email, `Supplier "${d.name}" added.`, 'blue');
  return { success: true, id };
}

export async function updateSupplier(env, identity, id, data) {
  const d = data || {};
  const existing = await first(env, 'SELECT * FROM Suppliers WHERE id = ?', id);
  if (!existing) throw new Error('That supplier no longer exists.');
  await run(
    env,
    `UPDATE Suppliers SET name = ?, contactPerson = ?, contactNumber = ?, email = ?, address = ?,
       tin = ?, termsDays = ?, vatRegistered = ?, pricesIncludeVat = ?, category = ?, notes = ?,
       status = ?, updatedAt = ? WHERE id = ?`,
    d.name ?? existing.name, d.contactPerson ?? existing.contactPerson,
    d.contactNumber ?? existing.contactNumber, d.email ?? existing.email,
    d.address ?? existing.address, d.tin ?? existing.tin,
    d.termsDays === undefined ? existing.termsDays : num(d.termsDays),
    d.vatRegistered === undefined ? existing.vatRegistered : (d.vatRegistered ? 1 : 0),
    d.pricesIncludeVat === undefined ? existing.pricesIncludeVat : (d.pricesIncludeVat ? 1 : 0),
    d.category ?? existing.category, d.notes ?? existing.notes,
    d.status ?? existing.status, nowIso(), id
  );
  await logActivity(env, identity.email, `Supplier "${d.name || existing.name}" updated.`, 'blue');
  return { success: true };
}

export async function deleteSupplier(env, identity, id) {
  requireRole(identity, ['superadmin', 'admin'], 'deleting a supplier');
  await run(env, 'DELETE FROM Suppliers WHERE id = ?', id);
  await logActivity(env, identity.email, `Supplier ${id} deleted.`, 'a');
  return { success: true };
}

// ─── USERS visible to the assignment pickers ───────────────────

export async function getAssignableUsers(env) {
  const rows = await all(env, 'SELECT email, name, role, roleLabel FROM Users ORDER BY name');
  return rows.map((u) => ({ email: u.email, name: u.name || u.email, role: u.role, roleLabel: u.roleLabel }));
}

export async function getViewAsUsers(env, identity) {
  requireRole(identity, ['superadmin'], 'impersonation');
  const rows = await all(env, 'SELECT email, name, role, roleLabel FROM Users ORDER BY name');
  return rows.filter((u) => low(u.email) !== low(identity.realEmail));
}

export async function setViewAs(env, identity, email) {
  requireRole(identity, ['superadmin'], 'impersonation');
  // Stored on the SESSION, never trusted from the client.
  await run(env, 'UPDATE Sessions SET viewAs = ? WHERE token = ?', low(email || ''), identity.token);
  return { success: true, viewAs: low(email || '') };
}

export { safeParseArray };
