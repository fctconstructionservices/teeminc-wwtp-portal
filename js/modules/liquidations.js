/**
 * ============================================
 * MODULE: Liquidations Page
 * LINKED CSS: css/modules/liquidations.css
 * ============================================
 */

import { api } from '../core/api-client.js';
import { showToast, showModal, formatCurrency, formatDate, getStatusBadge } from '../core/utils.js';

export function init() {
  const container = document.getElementById('page-liquidations');
  if (!container) return;
  
  container.innerHTML = `
    <div class="liquidations-module">
      <h2>🧾 Liquidations</h2>
      <button class="btn btn-primary" id="new-liquidation" style="margin-bottom:16px;">+ New Liquidation</button>
      <div id="liquidations-list" class="table-wrapper">Loading...</div>
    </div>
  `;
  
  loadLiquidations();
  
  document.getElementById('new-liquidation').addEventListener('click', showNewLiquidation);
}

async function loadLiquidations() {
  const list = document.getElementById('liquidations-list');
  const data = await api.getLiquidations() || [];
  if (!data.length) { list.innerHTML = '<p>No liquidations.</p>'; return; }
  
  let html = `<table class="data-table"><thead><tr><th>ID</th><th>Project</th><th>Amount</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead><tbody>`;
  data.forEach(row => {
    html += `<tr>
      <td>${row.LiquidationID || '-'}</td>
      <td>${row.Project || '-'}</td>
      <td>${formatCurrency(row.Amount)}</td>
      <td><span class="badge ${getStatusBadge(row.Status)}">${row.Status || 'N/A'}</span></td>
      <td>${formatDate(row.Date || row.Timestamp)}</td>
      <td>
        ${row.Status === 'Pending' ? `
          <button class="btn btn-sm btn-success" data-action="approve-liq" data-id="${row.LiquidationID}">Approve</button>
          <button class="btn btn-sm btn-danger" data-action="reject-liq" data-id="${row.LiquidationID}">Reject</button>
        ` : '-'}
      </td>
    </tr>`;
  });
  html += '</tbody></table>';
  list.innerHTML = html;
  
  list.querySelectorAll('[data-action="approve-liq"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const result = await api.updateLiquidationStatus(id, 'Approved', 'Approved');
      if (result !== null) { showToast('Approved.', 'success'); loadLiquidations(); }
    });
  });
  list.querySelectorAll('[data-action="reject-liq"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const result = await api.updateLiquidationStatus(id, 'Rejected', 'Rejected');
      if (result !== null) { showToast('Rejected.', 'info'); loadLiquidations(); }
    });
  });
}

function showNewLiquidation() {
  showModal('New Liquidation', `
    <div class="form-group"><label>Project</label><input class="form-control" id="liq-project" /></div>
    <div class="form-group"><label>Cash Advance ID (optional)</label><input class="form-control" id="liq-caid" /></div>
    <div class="form-group"><label>Amount</label><input class="form-control" id="liq-amount" type="number" /></div>
    <div class="form-group"><label>Purpose</label><input class="form-control" id="liq-purpose" /></div>
    <div class="form-group"><label>Attachment URL (optional)</label><input class="form-control" id="liq-url" placeholder="https://drive.google.com/..." /></div>
  `, async () => {
    const data = {
      Project: document.getElementById('liq-project').value,
      CashAdvanceID: document.getElementById('liq-caid').value,
      Amount: document.getElementById('liq-amount').value,
      Purpose: document.getElementById('liq-purpose').value,
      AttachmentURL: document.getElementById('liq-url').value
    };
    const result = await api.submitLiquidation(data);
    if (result !== null) { showToast('Liquidation submitted.', 'success'); loadLiquidations(); }
  });
}

export function destroy() {}