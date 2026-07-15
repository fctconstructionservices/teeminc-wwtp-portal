/**
 * ============================================
 * MODULE: Approvals Page
 * LINKED CSS: css/modules/approvals.css
 * ============================================
 */

import { api } from '../core/api-client.js';
import { showToast, showModal, formatDate, getStatusBadge } from '../core/utils.js';

export function init() {
  const container = document.getElementById('page-approvals');
  if (!container) return;
  
  container.innerHTML = `
    <div class="approvals-module">
      <h2>✅ Approvals</h2>
      <div class="approval-filters">
        <select id="approval-filter">
          <option value="all">All</option>
          <option value="Pending">Pending</option>
          <option value="For Approval">For Approval</option>
          <option value="Approved">Approved</option>
          <option value="Rejected">Rejected</option>
        </select>
        <button class="btn btn-primary" id="new-approval">+ New Request</button>
      </div>
      <div id="approvals-list" class="table-wrapper">Loading...</div>
    </div>
  `;
  
  loadApprovals();
  
  document.getElementById('approval-filter').addEventListener('change', loadApprovals);
  document.getElementById('new-approval').addEventListener('click', showNewApproval);
}

async function loadApprovals() {
  const list = document.getElementById('approvals-list');
  const filter = document.getElementById('approval-filter').value;
  let data = await api.getApprovals() || [];
  
  if (filter !== 'all') data = data.filter(a => a.Status === filter);
  
  if (!data.length) { list.innerHTML = '<p>No approvals found.</p>'; return; }
  
  let html = `<table class="data-table"><thead><tr><th>ID</th><th>Project</th><th>Type</th><th>Status</th><th>Level</th><th>Actions</th></tr></thead><tbody>`;
  data.forEach(row => {
    html += `<tr>
      <td>${row.ApprovalID || '-'}</td>
      <td>${row.Project || '-'}</td>
      <td>${row.Type || '-'}</td>
      <td><span class="badge ${getStatusBadge(row.Status)}">${row.Status || 'N/A'}</span></td>
      <td>Level ${row.Level || 1}</td>
      <td>
        ${(row.Status === 'Pending' || row.Status === 'For Approval') ? `
          <button class="btn btn-sm btn-success" data-action="approve" data-id="${row.ApprovalID}">Approve</button>
          <button class="btn btn-sm btn-danger" data-action="reject" data-id="${row.ApprovalID}">Reject</button>
        ` : '-'}
      </td>
    </tr>`;
  });
  html += '</tbody></table>';
  list.innerHTML = html;
  
  list.querySelectorAll('[data-action="approve"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const result = await api.updateApprovalStatus(id, 'Approved', 'Approved by user');
      if (result !== null) { showToast('Approved.', 'success'); loadApprovals(); }
    });
  });
  list.querySelectorAll('[data-action="reject"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const result = await api.updateApprovalStatus(id, 'Rejected', 'Rejected by user');
      if (result !== null) { showToast('Rejected.', 'info'); loadApprovals(); }
    });
  });
}

function showNewApproval() {
  showModal('New Approval Request', `
    <div class="form-group"><label>Project</label><input class="form-control" id="app-project" /></div>
    <div class="form-group"><label>Type</label><input class="form-control" id="app-type" placeholder="e.g., Purchase, Cash" /></div>
    <div class="form-group"><label>Details</label><textarea class="form-control" id="app-details" rows="3"></textarea></div>
  `, async () => {
    const data = {
      Project: document.getElementById('app-project').value,
      Type: document.getElementById('app-type').value,
      Details: document.getElementById('app-details').value
    };
    const result = await api.submitApproval(data);
    if (result !== null) { showToast('Request submitted.', 'success'); loadApprovals(); }
  });
}

export function destroy() {}