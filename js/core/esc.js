// ================================================================
//  core/esc.js — One escaper, everywhere. (v20)
//
//  ── THE PROBLEM ─────────────────────────────────────────────
//
//  Almost every screen is built by writing a template literal into
//  innerHTML. That is fast to write and it is fine right up until a
//  value came from a person — and in this system nearly every value
//  did. A material description, a personnel note, a project name, a
//  supplier's address: all typed by somebody.
//
//  Eight of the twenty-five page files had a private `_esc` and used
//  it. The other seventeen did not, so a description containing
//
//      <img src=x onerror="...">
//
//  runs the moment anyone opens the list it appears in. And the person
//  most likely to open every list is the Super Admin — who can force
//  approve anything.
//
//  ── WHY ONE GLOBAL AND NOT SEVENTEEN COPIES ─────────────────
//
//  A private helper per page is how this happened. Seventeen files were
//  written without one because nothing made it obvious that one was
//  needed. A single global that every page can reach removes the excuse
//  and, more usefully, makes the omission greppable: a test can now
//  assert that no page interpolates a known user field without it.
//
//  Deliberately terse. `esc(x)` gets used; `HtmlUtil.escapeHtml(x)`
//  gets skipped when somebody is in a hurry, and the times people are
//  in a hurry are exactly the times this matters.
// ================================================================

/**
 * esc - makes a value safe to place inside HTML text or an attribute.
 *
 * Escapes the five characters that can break out of either context.
 * Quotes are included because most interpolations in this codebase sit
 * inside attributes — `title="${esc(x)}"` — and escaping only < and >
 * would leave those wide open.
 */
function esc(v) {
    if (v === null || v === undefined) return '';
    return String(v)
        .replace(/&/g, '&amp;')     // first, or it double-escapes the rest
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * escAttr - for a value going into an unquoted attribute or a URL.
 *
 * Anything that is not a letter, digit or a short safe list becomes a
 * numeric entity. Heavier than esc and deliberately so: an unquoted
 * attribute can be escaped by a space alone, which esc leaves intact.
 */
function escAttr(v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/[^\w.,:\/\- ]/g, function (c) {
        return '&#' + c.charCodeAt(0) + ';';
    });
}

/**
 * escUrl - for href and src.
 *
 * A stored URL is user input too. `javascript:` in an href runs on
 * click, and a Drive link that has been edited by hand is indis-
 * tinguishable from one that has not — so the SCHEME is checked rather
 * than the string being trusted because of where it came from.
 */
function escUrl(v) {
    var s = String(v === null || v === undefined ? '' : v).trim();
    if (!s) return '';
    // Relative and anchor links are fine.
    if (/^[#\/?]/.test(s)) return esc(s);
    if (/^(https?:|mailto:|tel:|data:image\/)/i.test(s)) return esc(s);
    // Anything else — javascript:, vbscript:, an unknown scheme — is
    // dropped rather than rendered. A broken image is a visible, minor
    // problem; a working script is an invisible, serious one.
    return '';
}

/**
 * escLines - escapes, then turns newlines into <br>.
 *
 * For notes and remarks fields, where the line breaks are meaningful.
 * The escaping happens FIRST; doing it the other way round would strip
 * the <br> tags this just inserted.
 */
function escLines(v) {
    return esc(v).replace(/\r?\n/g, '<br>');
}
