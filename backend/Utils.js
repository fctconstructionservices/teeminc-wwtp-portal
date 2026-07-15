/**
 * ============================================
 * FILE: Utils.gs
 * PURPOSE: Generic helper functions (date, ID, validation).
 * DEPENDENCIES: None
 * ============================================
 */

function generateId(prefix) {
  return (prefix || 'ID') + '-' + Utilities.getUuid().substring(0, 8).toUpperCase();
}

function formatDate(dateString) {
  if (!dateString) return '';
  var d = new Date(dateString);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
}

function sanitizeInput(value) {
  if (typeof value === 'string') {
    return value.replace(/[<>]/g, ''); // Simple XSS protection
  }
  return value;
}

function isEmpty(value) {
  return value === undefined || value === null || value === '';
}