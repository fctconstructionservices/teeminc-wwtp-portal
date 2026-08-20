import { batchAll } from './db.js';
import { dayOf, low, num } from './util.js';

const money = (n) => '₱' + Math.round(num(n)).toLocaleString('en-PH');

/**
 * search - one flat, ranked list across every record type.
 *
 * The frontend renders a single results list, so this returns an array
 * of {type, id, label, projectId, status, date, detail} rather than
 * per-type buckets. `detail` is a plain label->value map the result card
 * prints as-is, which is why values are pre-formatted here.
 */
export async function search(env, _identity, query) {
  const q = low(String(query || '').trim());
  if (!q) return [];
  const like = `%${q}%`;

  const [
    projects, materials, equipment, manpower, personnel, suppliers, clients,
    tasks, cashAdv, purchaseRequests, quotations, lessons,
  ] = await batchAll(env, [
    ['SELECT * FROM Projects WHERE lower(id) LIKE ? OR lower(name) LIKE ? OR lower(location) LIKE ?', like, like, like],
    ['SELECT * FROM Materials WHERE lower(id) LIKE ? OR lower(code) LIKE ? OR lower(name) LIKE ? OR lower(brand) LIKE ?', like, like, like, like],
    ['SELECT * FROM Equipment WHERE lower(id) LIKE ? OR lower(code) LIKE ? OR lower(name) LIKE ? OR lower(brand) LIKE ?', like, like, like, like],
    ['SELECT * FROM Manpower WHERE lower(id) LIKE ? OR lower(code) LIKE ? OR lower(role) LIKE ?', like, like, like],
    ['SELECT * FROM Personnel WHERE lower(id) LIKE ? OR lower(name) LIKE ? OR lower(role) LIKE ?', like, like, like],
    ['SELECT * FROM Suppliers WHERE lower(id) LIKE ? OR lower(name) LIKE ? OR lower(category) LIKE ?', like, like, like],
    ['SELECT * FROM ClientLists WHERE lower(id) LIKE ? OR lower(name) LIKE ? OR lower(contactPerson) LIKE ?', like, like, like],
    ['SELECT * FROM Tasks WHERE lower(id) LIKE ? OR lower(title) LIKE ? OR lower(detail) LIKE ?', like, like, like],
    ['SELECT * FROM CashAdvanceRequests WHERE lower(id) LIKE ? OR lower(description) LIKE ? OR lower(requestor) LIKE ?', like, like, like],
    ['SELECT * FROM PurchaseRequests WHERE lower(id) LIKE ? OR lower(title) LIKE ? OR lower(justification) LIKE ?', like, like, like],
    ['SELECT * FROM Quotations WHERE lower(id) LIKE ? OR lower(title) LIKE ? OR lower(clientName) LIKE ?', like, like, like],
    ['SELECT * FROM LessonsLearned WHERE lower(id) LIKE ? OR lower(title) LIKE ? OR lower(category) LIKE ? OR lower(recommendation) LIKE ?', like, like, like, like],
  ]);

  const results = [];

  for (const r of projects) {
    results.push({
      type: 'Project', id: r.id, label: r.name || r.id, projectId: r.id,
      status: r.status || '—', date: dayOf(r.startDate),
      detail: {
        'Project': r.name || '—', 'Status': r.status || '—', 'Location': r.location || '—',
        'Contract': money(r.contractValue), 'Start': dayOf(r.startDate) || '—', 'End': dayOf(r.endDate) || '—',
      },
    });
  }
  for (const r of materials) {
    results.push({
      type: 'Material', id: r.id, label: r.name || r.id, projectId: '',
      status: r.status || '—', date: dayOf(r.createdAt),
      detail: { 'Material': r.name || '—', 'Code': r.code || '—', 'Unit': r.unit || '—', 'Rate': money(r.rate), 'Brand': r.brand || '—', 'Status': r.status || '—' },
    });
  }
  for (const r of equipment) {
    results.push({
      type: 'Equipment', id: r.id, label: r.name || r.id, projectId: '',
      status: r.status || '—', date: dayOf(r.createdAt),
      detail: { 'Equipment': r.name || '—', 'Code': r.code || '—', 'Unit': r.unit || '—', 'Rate': money(r.rate), 'Brand': r.brand || '—', 'Status': r.status || '—' },
    });
  }
  for (const r of manpower) {
    results.push({
      type: 'Manpower', id: r.id, label: r.role || r.id, projectId: '',
      status: r.status || '—', date: dayOf(r.createdAt),
      detail: { 'Role': r.role || '—', 'Code': r.code || '—', 'Classification': r.classification || '—', 'Status': r.status || '—' },
    });
  }
  for (const r of personnel) {
    results.push({
      type: 'Personnel', id: r.id, label: r.name || r.id, projectId: '',
      status: r.status || '—', date: dayOf(r.createdAt),
      detail: { 'Name': r.name || '—', 'Role': r.role || '—', 'Classification': r.classification || '—', 'Daily rate': money(r.dailyRate), 'Contact': r.contactNumber || '—' },
    });
  }
  for (const r of suppliers) {
    results.push({
      type: 'Supplier', id: r.id, label: r.name || r.id, projectId: '',
      status: r.status || '—', date: dayOf(r.createdAt),
      detail: { 'Supplier': r.name || '—', 'Contact': r.contactPerson || '—', 'Number': r.contactNumber || '—', 'Category': r.category || '—' },
    });
  }
  for (const r of clients) {
    results.push({
      type: 'Client', id: r.id, label: r.name || r.id, projectId: '',
      status: '—', date: dayOf(r.createdAt),
      detail: { 'Client': r.name || '—', 'Contact': r.contactPerson || '—', 'Number': r.contactNumber || '—', 'Address': r.address || '—' },
    });
  }
  for (const r of tasks) {
    results.push({
      type: 'Task', id: r.id, label: r.title || r.id, projectId: r.projectId || '',
      status: r.status || '—', date: dayOf(r.dueDate),
      detail: { 'Task': r.title || '—', 'Assigned to': r.assignedTo || '—', 'Due': dayOf(r.dueDate) || '—', 'Priority': r.priority || '—', 'Status': r.status || '—' },
    });
  }
  for (const r of cashAdv) {
    results.push({
      type: 'Cash Advance', id: r.id, label: r.description || r.id, projectId: r.projectId || '',
      status: r.status || '—', date: dayOf(r.createdAt),
      detail: { 'Description': r.description || '—', 'Amount': money(r.amount), 'Requestor': r.requestor || '—', 'Status': r.status || '—', 'Date': dayOf(r.createdAt) || '—' },
    });
  }
  for (const r of purchaseRequests) {
    results.push({
      type: 'Purchase Request', id: r.id, label: r.title || r.id, projectId: r.projectId || '',
      status: r.status || '—', date: dayOf(r.createdAt),
      detail: { 'Title': r.title || '—', 'Amount': money(r.totalAmount), 'Requestor': r.requestor || '—', 'Status': r.status || '—', 'Needed': dayOf(r.dateNeeded) || '—' },
    });
  }
  for (const r of quotations) {
    results.push({
      type: 'Quotation', id: r.id, label: r.title || r.id, projectId: r.projectId || '',
      status: r.status || '—', date: dayOf(r.createdAt),
      detail: { 'Quotation': r.title || '—', 'Client': r.clientName || '—', 'Quoted': money(r.quotedValue), 'Valid until': dayOf(r.validUntil) || '—', 'Status': r.status || '—' },
    });
  }
  for (const r of lessons) {
    results.push({
      type: 'Lesson', id: r.id, label: r.title || r.id, projectId: r.projectId || '',
      status: r.category || '—', date: dayOf(r.capturedAt),
      detail: { 'Lesson': r.title || '—', 'Category': r.category || '—', 'Project': r.projectName || '—', 'Recommendation': r.recommendation || '—', 'Captured': dayOf(r.capturedAt) || '—' },
    });
  }

  // An exact id match is almost always what was meant, so it leads.
  results.sort((a, b) => {
    const aExact = low(a.id) === q ? 0 : 1;
    const bExact = low(b.id) === q ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;
    return String(a.type).localeCompare(String(b.type));
  });

  if (results.length) results[0]._coverage = 12;
  return results;
}
