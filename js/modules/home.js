/**
 * ============================================
 * MODULE: Home Page
 * PURPOSE: Dashboard overview.
 * ============================================
 */

import { getCurrentUser } from '../core/auth.js';
import { api } from '../core/api-client.js';
import { formatCurrency, showToast } from '../core/utils.js';

export function init() {
  const container = document.getElementById('page-home');
  if (!container) return;
  
  const user = getCurrentUser();
  container.innerHTML = `
    <div class="home-dashboard">
      <h2>🏠 Dashboard</h2>
      <p>Welcome back, <strong>${user ? user.name : 'User'}</strong>!</p>
      <div class="card-grid" style="margin-top:20px;">
        <div class="card" id="home-projects">📋 Loading projects...</div>
        <div class="card" id="home-finance">💰 Loading finance...</div>
        <div class="card" id="home-approvals">✅ Loading approvals...</div>
      </div>
    </div>
  `;
  
  loadStats();
}

async function loadStats() {
  try {
    const projects = await api.getProjects() || [];
    const summary = await api.getFinanceSummary() || {};
    const approvals = await api.getApprovals() || [];
    
    const projEl = document.getElementById('home-projects');
    if (projEl) projEl.innerHTML = `📋 Projects: <strong>${projects.length}</strong>`;
    
    const finEl = document.getElementById('home-finance');
    if (finEl) finEl.innerHTML = `💰 Net Cash: <strong>${formatCurrency(summary.netCashFlow)}</strong>`;
    
    const appEl = document.getElementById('home-approvals');
    const pending = approvals.filter(a => a.Status === 'Pending' || a.Status === 'For Approval').length;
    if (appEl) appEl.innerHTML = `✅ Pending Approvals: <strong>${pending}</strong>`;
  } catch (e) {
    showToast('Failed to load dashboard stats.', 'error');
  }
}

export function destroy() {
  // Cleanup if needed
}