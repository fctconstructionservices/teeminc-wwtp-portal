/**
 * ============================================
 * MODULE: Finance Page
 * LINKED CSS: css/modules/finance.css
 * ============================================
 */

import { api } from '../core/api-client.js';
import { showToast, showModal, formatCurrency, formatDate, getStatusBadge } from '../core/utils.js';

export function init() {
  const container = document.getElementById('page-finance');
  if (!container) return;
  
  container.innerHTML = `
    <div class="finance-module">
      <h2>💰 Finance Dashboard</h2>
      <div class="finance-summary" id="finance-summary">Loading...</div>
      
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin:16px 0;">
        <button class="btn btn-primary" data-tab="advances">Cash Advances</button>
        <button class="btn btn-primary" data-tab="releases">Cash Releases</button>
        <button class="btn btn-primary" data-tab="incoming">Incoming Cash</button>
      </div>
      
      <div id="finance-detail" class="card">Select a tab above.</div>
    </div>
  `;
  
  loadSummary();
  
  container.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      loadDetail(tab);
    });
  });
}

async function loadSummary() {
  const el = document.getElementById('finance-summary');
  const data = await api.getFinanceSummary();
  if (!data) { el.innerHTML = '<p>No data.</p>'; return; }
  
  el.innerHTML = `
    <div class="summary-item"><span>Total Advances</span><div class="amount">${formatCurrency(data.totalAdvances)}</div></div>
    <div class="summary-item"><span>Total Releases</span><div class="amount">${formatCurrency(data.totalReleases)}</div></div>
    <div class="summary-item positive"><span>Total Incoming</span><div class="amount">${formatCurrency(data.totalIncoming)}</div></div>
    <div class="summary-item ${data.netCashFlow >= 0 ? 'positive' : 'negative'}">
      <span>Net Cash Flow</span><div class="amount">${formatCurrency(data.netCashFlow)}</div>
    </div>
  `;
}

async function loadDetail(tab) {
  const el = document.getElementById('finance-detail');
  let data = [];
  let title = '';
  
  if (tab === 'advances') {
    data = await api.getCashAdvances() || [];
    title = 'Cash Advances';
    el.innerHTML = `<h3>${title}</h3><button class="btn btn-success" id="new-advance">+ New Advance</button>
      <div class="table-wrapper">${renderTable(data, 'Advance')}</div>`;
    document.getElementById('new-advance')?.addEventListener('click', showNewAdvance);
  } else if (tab === 'releases') {
    data = await api.getCashReleases() || [];
    title = 'Cash Releases';
    el.innerHTML = `<h3>${title}</h3><button class="btn btn-success" id="new-release">+ New Release</button>
      <div class="table-wrapper">${renderTable(data, 'Release')}</div>`;
    document.getElementById('new-release')?.addEventListener('click', showNewRelease);
  } else if (tab === 'incoming') {
    data = await api.getIncomingCash() || [];
    title = 'Incoming Cash';
    el.innerHTML = `<h3>${title}</h3><button class="btn btn-success" id="new-incoming">+ Record Incoming</button>
      <div class="table-wrapper">${renderIncomingTable(data)}</div>`;
    document.getElementById('new-incoming')?.addEventListener('click', showNewIncoming);
  }
}

function renderTable(data, type) {
  if (!data.length) return '<p>No records.</p>';
  const idKey = type === 'Advance' ? 'RequestID' : 'ReleaseID';
  let html = `<table class="data-table"><thead><tr><th>ID</th><th>Project</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead><tbody>`;
  data.forEach(row => {
    html += `<tr>
      <td>${row[idKey] || '-'}</td>
      <td>${row.Project || '-'}</td>
      <td>${formatCurrency(row.Amount)}</td>
      <td><span class="badge ${getStatusBadge(row.Status)}">${row.Status || 'N/A'}</span></td>
      <td>${formatDate(row.Date || row.Timestamp)}</td>
    </tr>`;
  });
  html += '</tbody></table>';
  return html;
}

function renderIncomingTable(data) {
  if (!data.length) return '<p>No records.</p>';
  let html = `<table class="data-table"><thead><tr><th>ID</th><th>Project</th><th>Amount</th><th>Source</th><th>Date</th></tr></thead><tbody>`;
  data.forEach(row => {
    html += `<tr>
      <td>${row.TransactionID || '-'}</td>
      <td>${row.Project || '-'}</td>
      <td>${formatCurrency(row.Amount)}</td>
      <td>${row.Source || '-'}</td>
      <td>${formatDate(row.Date || row.Timestamp)}</td>
    </tr>`;
  });
  html += '</tbody></table>';
  return html;
}

function showNewAdvance() {
  showModal('New Cash Advance', `
    <div class="form-group"><label>Project</label><input class="form-control" id="ca-project" placeholder="Project name" /></div>
    <div class="form-group"><label>Amount</label><input class="form-control" id="ca-amount" type="number" /></div>
    <div class="form-group"><label>Purpose</label><input class="form-control" id="ca-purpose" /></div>
  `, async () => {
    const data = {
      Project: document.getElementById('ca-project').value,
      Amount: document.getElementById('ca-amount').value,
      Purpose: document.getElementById('ca-purpose').value
    };
    const result = await api.submitCashAdvance(data);
    if (result !== null) { showToast('Submitted.', 'success'); loadDetail('advances'); }
  });
}

function showNewRelease() {
  showModal('New Cash Release', `
    <div class="form-group"><label>Project</label><input class="form-control" id="cr-project" /></div>
    <div class="form-group"><label>Amount</label><input class="form-control" id="cr-amount" type="number" /></div>
    <div class="form-group"><label>Purpose</label><input class="form-control" id="cr-purpose" /></div>
  `, async () => {
    const data = {
      Project: document.getElementById('cr-project').value,
      Amount: document.getElementById('cr-amount').value,
      Purpose: document.getElementById('cr-purpose').value
    };
    const result = await api.submitCashRelease(data);
    if (result !== null) { showToast('Submitted.', 'success'); loadDetail('releases'); }
  });
}

function showNewIncoming() {
  showModal('Record Incoming Cash', `
    <div class="form-group"><label>Project</label><input class="form-control" id="ic-project" /></div>
    <div class="form-group"><label>Amount</label><input class="form-control" id="ic-amount" type="number" /></div>
    <div class="form-group"><label>Source</label><input class="form-control" id="ic-source" /></div>
  `, async () => {
    const data = {
      Project: document.getElementById('ic-project').value,
      Amount: document.getElementById('ic-amount').value,
      Source: document.getElementById('ic-source').value
    };
    const result = await api.submitIncomingCash(data);
    if (result !== null) { showToast('Recorded.', 'success'); loadDetail('incoming'); }
  });
}

export function destroy() {}