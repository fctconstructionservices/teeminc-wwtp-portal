/**
 * ============================================
 * FILE: core/config.js
 * PURPOSE: Global constants at configuration.
 * ============================================
 */

// Palitan ito ng actual deployed GAS Web App URL
export const API_BASE = 'https://script.google.com/macros/s/AKfycbxZlZxUwlzyM2RRGSE1zlBQea5vqKKqsZ5LcP0Ovtv2lO_X87kDNP7H8RLzhKMFIP16/exec'; // Example: 'https://script.google.com/macros/s/.../exec'

export const STATUSES = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  FOR_APPROVAL: 'For Approval',
  COMPLETED: 'Completed'
};

export const ICONS = {
  home: '🏠',
  projects: '📋',
  finance: '💰',
  approvals: '✅',
  materials: '📦',
  liquidations: '🧾',
  logout: '🚪'
};

export const ROUTES = {
  '': 'home',
  '#home': 'home',
  '#projects': 'projects',
  '#finance': 'finance',
  '#approvals': 'approvals',
  '#materials': 'materials',
  '#liquidations': 'liquidations'
};