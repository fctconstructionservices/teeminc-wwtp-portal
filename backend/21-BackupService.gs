/**
 * 21-BackupService.gs — Daily spreadsheet snapshots (v7.0)
 *
 * WHY: a single accidental row deletion is currently unrecoverable.
 * Sheets' own version history helps for recent edits, but it is not a
 * dependable business backup — it can be exhausted, it is awkward to
 * restore selectively, and it disappears with the file.
 *
 * WHAT IT DOES: once a day, copies the whole spreadsheet into a Drive
 * folder with a dated name, then deletes snapshots older than the
 * retention window so the folder can't grow without bound.
 *
 * SETUP (one time):
 *   1. Create a Drive folder for backups.
 *   2. Copy its ID from the URL (…/folders/THIS_PART).
 *   3. Paste it into BACKUP_FOLDER_ID below.
 *   4. Run installBackupTrigger() once and authorize when prompted.
 *
 * Snapshots are copies, never moves: the live sheet is untouched, so
 * this cannot itself cause data loss.
 */

var BACKUP_FOLDER_ID = '';        // ← paste your Drive folder ID here
var BACKUP_RETENTION_DAYS = 30;

/** installBackupTrigger - run ONCE from the editor. Safe to re-run. */
function installBackupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'runDailyBackup') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('runDailyBackup').timeBased().atHour(2).everyDays(1).create();
  return 'Daily backup trigger installed (runs ~2:00 AM).';
}

function removeBackupTrigger() {
  var n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'runDailyBackup') { ScriptApp.deleteTrigger(t); n++; }
  });
  return 'Removed ' + n + ' backup trigger(s).';
}

/**
 * runDailyBackup - the trigger target. Never throws out of the trigger:
 * a failed backup is logged, not silently ignored, but it must not stop
 * tomorrow's run.
 */
function runDailyBackup() {
  try {
    if (!BACKUP_FOLDER_ID) {
      logActivity_('Backup skipped — BACKUP_FOLDER_ID is not set in 21-BackupService.gs', 'a');
      return;
    }
    var folder = DriveApp.getFolderById(BACKUP_FOLDER_ID);
    var src = DriveApp.getFileById(SHEET_ID);
    var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd_HHmm');
    var copy = src.makeCopy('FCTC-Backup_' + stamp, folder);
    var pruned = pruneOldBackups_(folder);
    logActivity_('Backup created: ' + copy.getName() + (pruned ? ' (' + pruned + ' old snapshot(s) pruned)' : ''), 'g');
  } catch (err) {
    logActivity_('BACKUP FAILED: ' + err.message, 'a');
  }
}

/** pruneOldBackups_ - deletes snapshots past the retention window. */
function pruneOldBackups_(folder) {
  var cutoff = new Date(new Date().getTime() - BACKUP_RETENTION_DAYS * 86400000);
  var files = folder.getFiles();
  var removed = 0;
  while (files.hasNext()) {
    var f = files.next();
    if (f.getName().indexOf('FCTC-Backup_') !== 0) continue;   // never touch unrelated files
    if (f.getDateCreated() < cutoff) { f.setTrashed(true); removed++; }
  }
  return removed;
}

/** runBackupNow - manual snapshot; also the way to verify setup works. */
function runBackupNow() {
  requireSuperAdmin_('running a backup');
  if (!BACKUP_FOLDER_ID) throw new Error('BACKUP_FOLDER_ID is not set in 21-BackupService.gs.');
  var folder = DriveApp.getFolderById(BACKUP_FOLDER_ID);
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd_HHmm');
  var copy = DriveApp.getFileById(SHEET_ID).makeCopy('FCTC-Backup_' + stamp, folder);
  logActivity_('Manual backup created: ' + copy.getName(), 'g');
  return { success: true, name: copy.getName(), url: copy.getUrl() };
}

/** getBackupStatus - for the Super Admin settings view. */
function getBackupStatus() {
  requireSuperAdmin_('viewing backup status');
  if (!BACKUP_FOLDER_ID) return { configured: false, backups: [] };
  var folder = DriveApp.getFolderById(BACKUP_FOLDER_ID);
  var files = folder.getFiles();
  var list = [];
  while (files.hasNext()) {
    var f = files.next();
    if (f.getName().indexOf('FCTC-Backup_') !== 0) continue;
    list.push({ name: f.getName(), created: fmtDate_(f.getDateCreated()), url: f.getUrl() });
  }
  list.sort(function (a, b) { return a.created < b.created ? 1 : -1; });
  var hasTrigger = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'runDailyBackup';
  });
  return {
    configured: true,
    triggerInstalled: hasTrigger,
    retentionDays: BACKUP_RETENTION_DAYS,
    latest: list.length ? list[0] : null,
    count: list.length,
    backups: list.slice(0, 10)
  };
}