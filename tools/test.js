#!/usr/bin/env node
/**
 * tools/test.js — The test suite. Run it before you push.
 *
 *   node tools/test.js            everything
 *   node tools/test.js wiring     one file, by name
 *
 * ── WHY THIS EXISTS ──
 *
 * Until now every test was written, run once and thrown away, so
 * nothing guarded the earlier work when the next change landed. Four
 * things broke that way and reached you before anyone noticed:
 *
 *   · an unbound icon reference crashed the whole Approvals page
 *   · a print fix blanked the billing sheet
 *   · a packaging slip silently reverted three earlier fixes
 *   · a wrong element id meant the daily record suggestions were never
 *     wired at all — and I "fixed" the logic behind them three times
 *     before finding it
 *
 * Every one of those is caught by a test in here now. That is the rule
 * for adding to this suite: when something breaks, the fix comes with
 * the test that would have caught it.
 *
 * No dependencies, no framework. It runs on plain node so there is
 * nothing to install and no excuse not to run it.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const only = process.argv[2];

let pass = 0, fail = 0, files = 0;
const failures = [];

const C = process.stdout.isTTY
    ? { g: '\x1b[32m', r: '\x1b[31m', d: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m' }
    : { g: '', r: '', d: '', b: '', x: '' };

/** The whole harness: a describe, an it, and three assertions. */
const suite = {
    describe(name, fn) {
        console.log(`\n${C.b}${name}${C.x}`);
        fn();
    },
    it(what, fn) {
        try {
            fn();
            pass++;
            console.log(`  ${C.g}pass${C.x}  ${what}`);
        } catch (err) {
            fail++;
            failures.push({ what, message: err.message });
            console.log(`  ${C.r}FAIL${C.x}  ${what}`);
            console.log(`        ${C.d}${err.message}${C.x}`);
        }
    },
    ok(cond, msg) {
        if (!cond) throw new Error(msg || 'expected true');
    },
    eq(actual, expected, msg) {
        if (actual !== expected) {
            throw new Error((msg ? msg + ' — ' : '') + `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
        }
    },
    /** Reads a file relative to the repo root. Fails loudly if absent. */
    read(rel) {
        const p = path.join(ROOT, rel);
        if (!fs.existsSync(p)) throw new Error(`missing file: ${rel}`);
        return fs.readFileSync(p, 'utf8');
    },
    exists(rel) { return fs.existsSync(path.join(ROOT, rel)); },
    ROOT
};

const dir = path.join(__dirname, 'tests');
if (!fs.existsSync(dir)) {
    console.error('No tools/tests directory found.');
    process.exit(1);
}

fs.readdirSync(dir)
    .filter(f => f.endsWith('.test.js'))
    .filter(f => !only || f.indexOf(only) > -1)
    .sort()
    .forEach(f => {
        files++;
        require(path.join(dir, f))(suite);
    });

console.log(`\n${'─'.repeat(52)}`);
if (fail) {
    console.log(`${C.r}${C.b}${fail} failed${C.x}, ${pass} passed, ${files} file(s)\n`);
    failures.forEach(f => console.log(`  ${C.r}·${C.x} ${f.what}\n    ${C.d}${f.message}${C.x}`));
    console.log('');
    process.exit(1);
}
console.log(`${C.g}${C.b}${pass} passed${C.x}, ${files} file(s)\n`);
