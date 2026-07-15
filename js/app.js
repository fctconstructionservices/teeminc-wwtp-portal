/**
 * ============================================
 * FILE: app.js
 * PURPOSE: Main router at module loader.
 * ============================================
 */

import { ROUTES, API_BASE } from './core/config.js';
import { isLoggedIn, requireAuth, logout, getCurrentUser } from './core/auth.js';
import { showToast } from './core/utils.js';
import { api } from './core/api-client.js';

// Import modules (lazy load)
const modules = {
  home: () => import('./modules/home.js'),
  projects: () => import('./modules/projects.js'),
  finance: () => import('./modules/finance.js'),
  approvals: () => import('./modules/approvals.js'),
  materials: () => import('./modules/materials.js'),
  liquidations: () => import('./modules/liquidations.js')
};

let currentModule = null;

async function loadModule(route) {
  // Check login
  if (route !== 'home' && !requireAuth()) {
    renderLogin();
    return;
  }

  // Hide all sections
  document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));

  // Show container
  const container = document.getElementById('app-container');
  if (container) container.style.display = 'block';

  // Hide login
  const loginDiv = document.getElementById('login-container');
  if (loginDiv) loginDiv.style.display = 'none';

  // Set active nav
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const navMap = {
    'home': 'nav-home',
    'projects': 'nav-projects',
    'finance': 'nav-finance',
    'approvals': 'nav-approvals',
    'materials': 'nav-materials',
    'liquidations': 'nav-liquidations'
  };
  const activeNav = document.getElementById(navMap[route]);
  if (activeNav) activeNav.classList.add('active');

  // Load module
  if (modules[route]) {
    try {
      const mod = await modules[route]();
      if (currentModule && currentModule.destroy) currentModule.destroy();
      if (mod.init) {
        currentModule = mod;
        mod.init();
      }
    } catch (e) {
      console.error('Module load error:', e);
      showToast('Failed to load module.', 'error');
    }
  }
}

function renderLogin() {
  document.getElementById('app-container').style.display = 'none';
  const loginDiv = document.getElementById('login-container');
  if (loginDiv) loginDiv.style.display = 'flex';
  
  // If already logged in but route requires auth, show unauthorized
  if (isLoggedIn()) {
    showToast('Please log in again.', 'warning');
  }
}

function handleHash() {
  const hash = window.location.hash || '#home';
  const route = ROUTES[hash] || 'home';
  loadModule(route);
}

// Global logout function
window.logoutUser = logout;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  // Setup navigation clicks
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', (e) => {
      const target = el.dataset.target;
      if (target) {
        window.location.hash = target;
      }
    });
  });

  // Setup login form
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('login-username').value;
      const password = document.getElementById('login-password').value;
      const btn = loginForm.querySelector('[type="submit"]');
      btn.textContent = 'Logging in...';
      btn.disabled = true;
      
      const success = await window.loginUser(username, password);
      
      btn.textContent = 'Login';
      btn.disabled = false;
      
      if (success) {
        window.location.hash = '#home';
        handleHash();
      }
    });
  }

  // Theme toggle
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('fctc_theme', next);
      themeToggle.textContent = next === 'dark' ? '☀️' : '🌙';
    });
    const saved = localStorage.getItem('fctc_theme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);
    themeToggle.textContent = saved === 'dark' ? '☀️' : '🌙';
  }

  // Expose login for global use
  window.loginUser = async (username, password) => {
    const { login } = await import('./core/auth.js');
    return login(username, password);
  };

  // Handle hash changes
  window.addEventListener('hashchange', handleHash);

  // Initial load
  if (isLoggedIn()) {
    handleHash();
  } else {
    renderLogin();
    if (window.location.hash !== '#login') {
      window.location.hash = '#login';
    }
  }
});