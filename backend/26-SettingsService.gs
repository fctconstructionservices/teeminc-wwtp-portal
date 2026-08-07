/**
 * 26-SettingsService.gs — System settings (v11 BATCH E)
 *
 * PURPOSE: A key/value store for configuration that belongs to the
 * COMPANY rather than to any one project. The first and main consumer
 * is the PRINT TEMPLATE.
 *
 * WHY THIS EXISTS. Every printed document in the system — cash advance,
 * daily record, estimate, SWA billing, datasheet — came out of the
 * browser with no letterhead at all. A client receiving one could not
 * tell it came from FCTC. The company name, address, TIN, PCAB licence
 * and logo were nowhere in the codebase, so there was nothing to print
 * even if a header had existed.
 *
 * DESIGN. Values are stored as JSON STRINGS against a key, not as
 * columns. A setting can therefore grow from a single field into a
 * nested object without another schema migration — which matters here,
 * because the print template already holds an array of signature blocks
 * and will grow again when the report generator lands.
 *
 * PERMISSIONS. Reading is open to any logged-in user: the letterhead
 * must render for whoever is printing. Writing is SUPER ADMIN ONLY —
 * this is the company's identity on documents that go to clients.
 */

var SETTING_PRINT_TEMPLATE = 'printTemplate';

/**
 * DEFAULT_PRINT_TEMPLATE_ - Used until a Super Admin saves one, and as
 * the base that a saved template is merged over. Merging rather than
 * replacing means a template saved today still works after a future
 * version adds a field: the new field falls back to its default instead
 * of arriving undefined and rendering as "undefined" on a client's
 * document.
 */
function defaultPrintTemplate_() {
  return {
    // identity
    companyName: 'FCTC Construction Services',
    tagline: '',
    addressLine1: '',
    addressLine2: '',
    phone: '',
    email: '',
    website: '',
    tin: '',
    pcabLicense: '',

    // branding
    logoUrl: '',
    logoHeight: 54,
    accentColor: '#24455A',
    headerLayout: 'logo-left',   // logo-left | logo-center | minimal
    showLogo: true,
    showDivider: true,

    // page
    paperSize: 'A4',             // A4 | Letter
    marginMm: 12,

    // footer
    footerText: '',
    showTimestamp: true,
    showPreparedBy: true,

    // signature blocks printed at the foot of a document
    signatories: [
      { label: 'Prepared by', name: '', position: '' },
      { label: 'Reviewed by', name: '', position: '' },
      { label: 'Approved by', name: '', position: '' }
    ],

    // diagonal watermark, e.g. DRAFT or NOT FOR ISSUE. Empty = none.
    watermark: ''
  };
}

/**
 * getSetting_ - Parsed value for a key, or null.
 * The Settings sheet creates itself on first use, so deploying this
 * batch does not require anyone to add a sheet by hand — a forgotten
 * manual step is a broken feature.
 */
function getSetting_(key) {
  ensureSheet_('Settings');
  var row = readAll_('Settings').find(function (r) { return r.key === key; });
  if (!row) return null;
  return safeParse_(row.value, null);
}

/** setSetting_ - Upserts a key. Value is stored as JSON. */
function setSetting_(key, value) {
  ensureSheet_('Settings');
  var payload = {
    key: key,
    value: JSON.stringify(value),
    updatedBy: currentUserEmail_().toLowerCase(),
    updatedAt: new Date()
  };
  var exists = readAll_('Settings').some(function (r) { return r.key === key; });
  if (exists) updateRow_('Settings', 'key', key, payload);
  else appendRow_('Settings', payload);
  return value;
}

/**
 * getPrintTemplate - The template every printed document uses.
 * Readable by any logged-in user, because the letterhead has to render
 * for whoever hits Print.
 *
 * The saved value is merged OVER the defaults rather than replacing
 * them, so a template saved before a field existed still produces a
 * complete document.
 */
function getPrintTemplate() {
  var saved = getSetting_(SETTING_PRINT_TEMPLATE) || {};
  var out = defaultPrintTemplate_();
  Object.keys(out).forEach(function (k) {
    if (saved[k] !== undefined && saved[k] !== null && saved[k] !== '') out[k] = saved[k];
  });
  // signatories is an array — take the saved one whole if it has rows,
  // otherwise keep the default set rather than merging index by index.
  if (Array.isArray(saved.signatories) && saved.signatories.length) {
    out.signatories = saved.signatories.slice(0, 4);
  }
  // booleans need an explicit check: `false` is a legitimate saved value
  // that the truthiness test above would have discarded.
  ['showLogo', 'showDivider', 'showTimestamp', 'showPreparedBy'].forEach(function (k) {
    if (typeof saved[k] === 'boolean') out[k] = saved[k];
  });
  return out;
}

/**
 * savePrintTemplate - Super Admin only. Validates the few fields that
 * can break a printed page if they are wrong, then stores the whole
 * object.
 */
function savePrintTemplate(data) {
  requireSuperAdmin_('editing the print template');
  if (!data || typeof data !== 'object') throw new Error('No template data received.');

  var t = defaultPrintTemplate_();
  var out = {};

  // strings — copied straight through, trimmed
  ['companyName', 'tagline', 'addressLine1', 'addressLine2', 'phone', 'email',
   'website', 'tin', 'pcabLicense', 'logoUrl', 'footerText', 'watermark']
    .forEach(function (k) { out[k] = String(data[k] === undefined ? t[k] : data[k]).trim(); });

  if (!out.companyName) throw new Error('Company name is required — it is the one thing every document must carry.');

  // enums — an unrecognised value would silently produce a broken
  // layout, so fall back rather than trusting the client
  out.headerLayout = ['logo-left', 'logo-center', 'minimal'].indexOf(data.headerLayout) > -1
    ? data.headerLayout : t.headerLayout;
  out.paperSize = ['A4', 'Letter'].indexOf(data.paperSize) > -1 ? data.paperSize : t.paperSize;

  // colour — anything that is not a hex value would end up inside a CSS
  // custom property and could break the whole stylesheet
  out.accentColor = /^#[0-9A-Fa-f]{6}$/.test(String(data.accentColor || ''))
    ? String(data.accentColor) : t.accentColor;

  // numbers, clamped to what actually fits on a page
  out.logoHeight = Math.min(120, Math.max(20, parseInt(data.logoHeight, 10) || t.logoHeight));
  out.marginMm = Math.min(30, Math.max(5, parseInt(data.marginMm, 10) || t.marginMm));

  ['showLogo', 'showDivider', 'showTimestamp', 'showPreparedBy'].forEach(function (k) {
    out[k] = data[k] === undefined ? t[k] : !!data[k];
  });

  out.signatories = (Array.isArray(data.signatories) ? data.signatories : [])
    .slice(0, 4)
    .map(function (s) {
      return {
        label: String((s && s.label) || '').trim(),
        name: String((s && s.name) || '').trim(),
        position: String((s && s.position) || '').trim()
      };
    })
    .filter(function (s) { return s.label; });

  setSetting_(SETTING_PRINT_TEMPLATE, out);
  logActivity_('Print template updated by ' + currentUserName_() +
    ' — this changes the letterhead on every printed document', 'blue');
  return { success: true, template: getPrintTemplate() };
}

/**
 * resetPrintTemplate - Super Admin only. Restores the defaults, for
 * when an experiment leaves the letterhead in a state nobody wants to
 * unpick field by field.
 */
function resetPrintTemplate() {
  requireSuperAdmin_('resetting the print template');
  setSetting_(SETTING_PRINT_TEMPLATE, {});
  logActivity_('Print template reset to defaults by ' + currentUserName_(), 'a');
  return { success: true, template: getPrintTemplate() };
}
