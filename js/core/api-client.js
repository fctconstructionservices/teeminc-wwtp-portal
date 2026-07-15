/**
 * ============================================
 * FILE: core/api-client.js
 * PURPOSE: Centralized fetch wrapper using form-urlencoded
 *          para maiwasan ang CORS preflight.
 * ============================================
 */

import { API_BASE } from './config.js';
import { showToast } from './utils.js';

export async function apiRequest(action, payload = {}) {
  try {
    // Gumamit ng URLSearchParams para maging form-urlencoded
    const formData = new URLSearchParams();
    formData.append('action', action);
    formData.append('payload', JSON.stringify(payload));

    const response = await fetch(API_BASE, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString()
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!data.success) {
      showToast(data.message || 'Operation failed.', 'error');
      return null;
    }
    return data.data;
  } catch (error) {
    showToast('Network error: ' + error.message, 'error');
    return null;
  }
}

// Specific API functions (hindi nagbabago)
export const api = {
  login: (username, password) => apiRequest('login', { username, password }),
  
  // Projects
  getProjects: () => apiRequest('getProjects'),
  addProject: (data) => apiRequest('addProject', data),
  updateProjectStatus: (projectId, status) => apiRequest('updateProjectStatus', { projectId, status }),
  
  // Finance
  getCashAdvances: () => apiRequest('getCashAdvances'),
  submitCashAdvance: (data) => apiRequest('submitCashAdvance', data),
  updateCashAdvanceStatus: (requestId, status, remarks) => apiRequest('updateCashAdvanceStatus', { requestId, status, remarks }),
  
  getCashReleases: () => apiRequest('getCashReleases'),
  submitCashRelease: (data) => apiRequest('submitCashRelease', data),
  updateCashReleaseStatus: (requestId, status, remarks) => apiRequest('updateCashReleaseStatus', { requestId, status, remarks }),
  
  getIncomingCash: () => apiRequest('getIncomingCash'),
  submitIncomingCash: (data) => apiRequest('submitIncomingCash', data),
  
  getFinanceSummary: () => apiRequest('getFinanceSummary'),
  
  // Materials
  getMaterials: () => apiRequest('getMaterials'),
  addMaterial: (data) => apiRequest('addMaterial', data),
  updateMaterial: (id, field, value) => apiRequest('updateMaterial', { id, field, value }),
  
  // Equipment
  getEquipment: () => apiRequest('getEquipment'),
  addEquipment: (data) => apiRequest('addEquipment', data),
  updateEquipment: (id, field, value) => apiRequest('updateEquipment', { id, field, value }),
  
  // Approvals
  getApprovals: () => apiRequest('getApprovals'),
  submitApproval: (data) => apiRequest('submitApproval', data),
  updateApprovalStatus: (approvalId, status, remarks) => apiRequest('updateApprovalStatus', { approvalId, status, remarks }),
  
  // Liquidations
  getLiquidations: () => apiRequest('getLiquidations'),
  submitLiquidation: (data) => apiRequest('submitLiquidation', data),
  updateLiquidationStatus: (liquidationId, status, remarks) => apiRequest('updateLiquidationStatus', { liquidationId, status, remarks }),
  
  getProjectList: () => apiRequest('getProjectList')
};