/**
 * sow-repair.test.js — Repairing BOTH sides of a relationship.
 *
 * The first version of repairSowIds rewrote SOWItems.id and nothing
 * else. Ten other sheets still held the old numeric value, so the
 * moment the ids became text every relationship broke — an estimate
 * group whose sowId was 1.1 stopped matching a SOW item whose id was
 * "1.1", the system concluded there was no estimate, and created a
 * fresh draft beside the approved one.
 *
 * REPAIRING ONE SIDE OF A RELATIONSHIP IS WORSE THAN REPAIRING NEITHER.
 * Neither is consistent; one side is silently wrong, and it presents as
 * a feature bug — "why are my estimates duplicated" — rather than as
 * the data migration it actually is.
 */

const fs = require('fs');
const path = require('path');

module.exports = function (t) {

    const src = t.read('backend/36-SowBulkService.gs');

    t.describe('every sheet holding a SOW id is repaired', () => {
        const refs = /var SOW_REFERENCES = \[([\s\S]*?)\];/.exec(src)[1];
        const schemas = t.read('backend/01-Schemas.gs');

        t.it('the list matches what the schema actually declares', () => {
            // Derived from the schema rather than hand-listed here, so a
            // sheet added later with a sowId column fails this test
            // instead of silently going unrepaired.
            const declared = [...schemas.matchAll(/^  ([A-Z][A-Za-z]+): \[[^\]]*'sowId'/gm)]
                .map(m => m[1]);
            const missing = declared.filter(n => refs.indexOf("'" + n + "'") === -1);
            t.ok(missing.length === 0,
                'these hold a sowId and would be left pointing at nothing: ' + missing.join(', '));
        });

        t.it('predecessor lists are included', () =>
            t.ok(/predecessors/.test(refs),
                'a predecessor is a SOW id too, and a broken one silently unlinks a task'));
    });

    t.describe('the duplicate estimates are cleaned up safely', () => {
        const SHEETS = { EstimateGroups: [], EstimateMaterials: [], EstimateLabor: [],
            EstimateEquipment: [], EstimateIndirect: [] };
        const merge = new Function('SHEETS', `
            function readAll_(n){ return (SHEETS[n]||[]).map(r=>Object.assign({},r)); }
            function deleteRow_(n,k,v){ SHEETS[n]=(SHEETS[n]||[]).filter(r=>String(r[k])!==String(v)); }
            function ss_(){ return {getSheetByName:n=>SHEETS[n]?{}:null}; }
            function low_(v){return String(v||'').toLowerCase();}
            function _cellKey_(v){ if(v==null) return '';
              if(typeof v==='number') return String(v);
              return String(v).trim().replace(/^'/,''); }
        ` + src.match(/function mergeDuplicateEstimateGroups_[\s\S]*?\n}/)[0] +
            '\nreturn mergeDuplicateEstimateGroups_;')(SHEETS);

        SHEETS.EstimateGroups.push(
            { id: 'EG1', projectId: 'P1', sowId: 1.1, status: 'approved' },
            { id: 'EG2', projectId: 'P1', sowId: "'1.1", status: 'draft' },
            { id: 'EG3', projectId: 'P1', sowId: 2.1, status: 'approved' },
            { id: 'EG4', projectId: 'P1', sowId: "'2.1", status: 'draft' },
            { id: 'EG5', projectId: 'P1', sowId: 3.1, status: 'draft' },
            { id: 'EG9', projectId: 'P2', sowId: 1.1, status: 'approved' });
        SHEETS.EstimateMaterials.push({ id: 'M1', groupId: 'EG4' }, { id: 'M2', groupId: 'EG4' });

        const r = merge('P1');

        t.it('an EMPTY duplicate draft is removed', () => {
            t.eq(r.removed, 1);
            t.ok(!SHEETS.EstimateGroups.find(g => g.id === 'EG2'));
        });
        t.it('the approved estimate is never touched', () =>
            t.ok(!!SHEETS.EstimateGroups.find(g => g.id === 'EG1')));

        t.it('a duplicate WITH priced lines is kept and reported', () => {
            // Somebody may have started pricing into it before noticing
            // the duplicate. Deleting it throws that work away.
            t.eq(r.kept.length, 1);
            t.ok(!!SHEETS.EstimateGroups.find(g => g.id === 'EG4'));
            t.eq(r.kept[0].lines, 2, 'and it says how much is in it');
        });

        t.it('a lone draft with no approved twin is left alone', () =>
            // Two drafts for one scope is something a person did. It is
            // not this function's business to tidy that.
            t.ok(!!SHEETS.EstimateGroups.find(g => g.id === 'EG5')));

        t.it('another project is untouched', () =>
            t.ok(!!SHEETS.EstimateGroups.find(g => g.id === 'EG9')));
    });

    t.describe('the result is reported honestly', () => {
        const sow = t.read('js/pages/project/project-sow.js');
        t.it('kept duplicates are shown, not swallowed', () =>
            t.ok(/duplicatesKept/.test(sow),
                'a duplicate the repair refused to delete needs a person to decide'));
        t.it('the reference count is reported', () =>
            t.ok(/refsFixed/.test(sow)));
    });
};
