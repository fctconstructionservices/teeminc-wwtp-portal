/**
 * ============================================
 * MODULE: Projects Page
 * LINKED CSS: css/modules/projects.css
 * ============================================
 */

import { api } from '../core/api-client.js';
import { showToast, showModal, formatDate, getStatusBadge } from '../core/utils.js';

export function init() {
  const container = document.getElementById('page-projects');
  if (!container) return;
  
  container.innerHTML = `
    <div class="projects-module">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h2>📋 Projects</h2>
        <button class="btn btn-primary" id="add-project-btn">+ New Project</button>
      </div>
      <div id="projects-list" class="table-wrapper">Loading...</div>
    </div>
  `;
  
  loadProjects();
  
  document.getElementById('add-project-btn').addEventListener('click', showAddProjectModal);
}

async function loadProjects() {
  const list = document.getElementById('projects-list');
  const projects = await api.getProjects();
  if (!projects) {
    list.innerHTML = '<p>No projects found.</p>';
    return;
  }
  
  let html = `<table class="data-table">
    <thead><tr><th>ID</th><th>Name</th><th>Location</th><th>Status</th><th>Actions</th></tr></thead><tbody>`;
  
  projects.forEach(p => {
    const statusClass = getStatusBadge(p.Status);
    html += `<tr>
      <td>${p.ProjectID || '-'}</td>
      <td>${p.ProjectName || '-'}</td>
      <td>${p.Location || '-'}</td>
      <td><span class="badge ${statusClass}">${p.Status || 'N/A'}</span></td>
      <td>
        <button class="btn btn-sm btn-success" data-action="update-status" data-id="${p.ProjectID}">Update Status</button>
      </td>
    </tr>`;
  });
  
  html += '</tbody></table>';
  list.innerHTML = html;
  
  // Bind events
  list.querySelectorAll('[data-action="update-status"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = btn.dataset.id;
      showModal('Update Status', `
        <div class="form-group">
          <label>New Status</label>
          <select class="form-control" id="status-select">
            <option value="Active">Active</option>
            <option value="On Hold">On Hold</option>
            <option value="Completed">Completed</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        </div>
      `, async () => {
        const status = document.getElementById('status-select').value;
        const result = await api.updateProjectStatus(id, status);
        if (result !== null) {
          showToast('Status updated.', 'success');
          loadProjects();
        }
      });
    });
  });
}

function showAddProjectModal() {
  showModal('Add New Project', `
    <div class="form-group">
      <label>Project Name</label>
      <input class="form-control" id="proj-name" placeholder="Enter project name" />
    </div>
    <div class="form-group">
      <label>Location</label>
      <input class="form-control" id="proj-location" placeholder="Enter location" />
    </div>
    <div class="form-group">
      <label>Status</label>
      <select class="form-control" id="proj-status">
        <option value="Active">Active</option>
        <option value="On Hold">On Hold</option>
      </select>
    </div>
  `, async () => {
    const name = document.getElementById('proj-name').value.trim();
    const location = document.getElementById('proj-location').value.trim();
    const status = document.getElementById('proj-status').value;
    if (!name) { showToast('Project name is required.', 'error'); return; }
    const result = await api.addProject({ ProjectName: name, Location: location, Status: status });
    if (result !== null) {
      showToast('Project added.', 'success');
      loadProjects();
    }
  });
}

export function destroy() {
  // Cleanup
}