/**
 * ============================================
 * FILE: core/utils.js
 * PURPOSE: Pure helper functions (UI at formatting).
 * ============================================
 */

export function formatCurrency(amount) {
  if (!amount) return '₱0.00';
  return '₱' + parseFloat(amount).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatDate(dateString) {
  if (!dateString) return '-';
  const d = new Date(dateString);
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function getStatusBadge(status) {
  const map = {
    'Pending': 'badge-pending',
    'Approved': 'badge-approved',
    'Rejected': 'badge-rejected',
    'For Approval': 'badge-for-approval',
    'Completed': 'badge-completed',
    'Cancelled': 'badge-rejected'
  };
  return map[status] || 'badge-pending';
}

export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container') || (() => {
    const div = document.createElement('div');
    div.id = 'toast-container';
    div.className = 'toast-container';
    document.body.appendChild(div);
    return div;
  })();

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}

export function showModal(title, contentHTML, onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay open';
  overlay.innerHTML = `
    <div class="modal-box">
      <h3 class="modal-title">${title}</h3>
      <div class="modal-body">${contentHTML}</div>
      <div class="modal-actions">
        <button class="btn" data-close>Cancel</button>
        <button class="btn btn-primary" data-confirm>Confirm</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('[data-close]').addEventListener('click', () => overlay.remove());
  overlay.querySelector('[data-confirm]').addEventListener('click', () => {
    if (onConfirm) onConfirm();
    overlay.remove();
  });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}