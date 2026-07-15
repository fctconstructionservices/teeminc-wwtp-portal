/**
 * ============================================
 * MODULE: Materials Page
 * LINKED CSS: css/modules/materials.css
 * ============================================
 */

import { api } from '../core/api-client.js';
import { showToast, showModal, formatCurrency } from '../core/utils.js';

export function init() {
  const container = document.getElementById('page-materials');
  if (!container) return;
  
  container.innerHTML = `
    <div class="materials-module">
      <h2>📦 Materials & Equipment</h2>
      <div class="material-actions">
        <button class="btn btn-primary" id="add-material">+ Material</button>
        <button class="btn btn-primary" id="add-equipment">+ Equipment</button>
      </div>
      <div class="card-grid">
        <div class="card"><h3>Materials</h3><div id="materials-list">Loading...</div></div>
        <div class="card"><h3>Equipment</h3><div id="equipment-list">Loading...</div></div>
      </div>
    </div>
  `;
  
  loadMaterials();
  loadEquipment();
  
  document.getElementById('add-material').addEventListener('click', showAddMaterial);
  document.getElementById('add-equipment').addEventListener('click', showAddEquipment);
}

async function loadMaterials() {
  const el = document.getElementById('materials-list');
  const data = await api.getMaterials() || [];
  if (!data.length) { el.innerHTML = '<p>No materials.</p>'; return; }
  let html = `<table class="data-table"><thead><tr><th>Name</th><th>Qty</th><th>Price</th></tr></thead><tbody>`;
  data.forEach(row => {
    html += `<tr><td>${row.Name || '-'}</td><td>${row.Quantity || 0}</td><td>${formatCurrency(row.UnitPrice)}</td></tr>`;
  });
  html += '</tbody></table>';
  el.innerHTML = html;
}

async function loadEquipment() {
  const el = document.getElementById('equipment-list');
  const data = await api.getEquipment() || [];
  if (!data.length) { el.innerHTML = '<p>No equipment.</p>'; return; }
  let html = `<table class="data-table"><thead><tr><th>Name</th><th>Type</th><th>Status</th></tr></thead><tbody>`;
  data.forEach(row => {
    html += `<tr><td>${row.Name || '-'}</td><td>${row.Type || '-'}</td><td>${row.Status || 'N/A'}</td></tr>`;
  });
  html += '</tbody></table>';
  el.innerHTML = html;
}

function showAddMaterial() {
  showModal('Add Material', `
    <div class="form-group"><label>Name</label><input class="form-control" id="mat-name" /></div>
    <div class="form-group"><label>Quantity</label><input class="form-control" id="mat-qty" type="number" /></div>
    <div class="form-group"><label>Unit Price</label><input class="form-control" id="mat-price" type="number" /></div>
  `, async () => {
    const data = {
      Name: document.getElementById('mat-name').value,
      Quantity: document.getElementById('mat-qty').value,
      UnitPrice: document.getElementById('mat-price').value
    };
    const result = await api.addMaterial(data);
    if (result !== null) { showToast('Added.', 'success'); loadMaterials(); }
  });
}

function showAddEquipment() {
  showModal('Add Equipment', `
    <div class="form-group"><label>Name</label><input class="form-control" id="eq-name" /></div>
    <div class="form-group"><label>Type</label><input class="form-control" id="eq-type" /></div>
    <div class="form-group"><label>Status</label><select class="form-control" id="eq-status"><option value="Available">Available</option><option value="In Use">In Use</option></select></div>
  `, async () => {
    const data = {
      Name: document.getElementById('eq-name').value,
      Type: document.getElementById('eq-type').value,
      Status: document.getElementById('eq-status').value
    };
    const result = await api.addEquipment(data);
    if (result !== null) { showToast('Added.', 'success'); loadEquipment(); }
  });
}

export function destroy() {}