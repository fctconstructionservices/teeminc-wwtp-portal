/**
 * 00-Config.gs — Global configuration
 *
 * PURPOSE: Single source of truth for system-wide constants.
 * SHEET_ID must never change unless the whole database is migrated
 * to a different Google Sheet.
 *
 * CURRENT_REQUEST_USER_EMAIL is set once per request by doPost()
 * (see 02-Api.gs) and read by AuthService helpers. Google Apps
 * Script executes each web request in an isolated context, so this
 * top-level variable is safe: it cannot leak between users.
 */

const SHEET_ID = '1Z-1NtuiJ_BYfUD_9CGfccJmJT6hHmnunc5zbrHaMiDw';

// Set per-request in doPost(); read via currentUserEmail_() in 04-AuthService.gs.
let CURRENT_REQUEST_USER_EMAIL = '';
// v7.0: identity now comes from the session token, never from the client.
// _USER_EMAIL is who you are ACTING as (may be an impersonation target);
// _REAL_EMAIL is who actually logged in — audit logs record both.
let CURRENT_REQUEST_REAL_EMAIL = '';
let CURRENT_REQUEST_ROLE = '';
let CURRENT_REQUEST_TOKEN = '';
let CURRENT_REQUEST_IMPERSONATING = false;