/**
 * ============================================
 * FILE: core/auth.js
 * PURPOSE: Login/logout at session management.
 * ============================================
 */

import { api } from './api-client.js';
import { showToast } from './utils.js';

let currentUser = null;

export function isLoggedIn() {
  return !!localStorage.getItem('fctc_token') && !!localStorage.getItem('fctc_user');
}

export function getCurrentUser() {
  if (!currentUser) {
    const userStr = localStorage.getItem('fctc_user');
    if (userStr) currentUser = JSON.parse(userStr);
  }
  return currentUser;
}

export async function login(username, password) {
  const result = await api.login(username, password);
  if (result && result.user) {
    currentUser = result.user;
    localStorage.setItem('fctc_token', result.token);
    localStorage.setItem('fctc_user', JSON.stringify(result.user));
    showToast(`Welcome, ${result.user.name}!`, 'success');
    return true;
  }
  return false;
}

export function logout() {
  currentUser = null;
  localStorage.removeItem('fctc_token');
  localStorage.removeItem('fctc_user');
  showToast('Logged out.', 'info');
  window.location.hash = '#login';
  location.reload(); // Force refresh para malinis ang state
}

export function requireAuth() {
  if (!isLoggedIn()) {
    window.location.hash = '#login';
    return false;
  }
  return true;
}