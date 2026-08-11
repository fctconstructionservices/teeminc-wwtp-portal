/**
 * project-delete.test.js — Removing a project without orphaning money.
 *
 * The whole risk here is a PARTIAL delete: the header row goes and rows
 * in twenty-four other sheets stay. Those still reach the portfolio and
 * the cashflow, so nothing breaks visibly — the numbers are just
 * quietly, permanently slightly wrong.
 *
 * The assertion that matters is the one that walks every sheet and
 * proves nothing still points at the deleted project.
 */

const fs = require('fs');
const path = require('path');

module.exports = function (t) {

    const SHEETS = { Projects: [], SOWItems: [], Billings: [], CashRelease: [],
        EstimateGroups: [], EstimateMaterials: [], EstimateLabor: [],
        EstimateEquipment: [], EstimateIndirect: [], PurchaseRequests: [], PRLines: [],
        PurchaseOrders: [], POLines: [], Approvals: [], DailyRecords: [],
        Comments: [], IncomingCashRequests: [], Liquidations: [] };

    const harness = `
        function ss_(){ return { getSheetByName:n=>SHEETS[n]?{}:null }; }
        function readAll_(n){ return (SHEETS[n]||[]).map(r=>Object.assign({},r)); }
        function deleteRowsWhere_(n,m){ const b=(SHEETS[n]||[]).length;
            SHEETS[n]=(SHEETS[n]||[]).filter(r=>!Object.keys(m).every(k=>String(r[k])===String(m[k]))); return b-SHEETS[n].length; }
        function deleteRowsByValues_(n,c,v){ const b=(SHEETS[n]||[]).length;
            SHEETS[n]=(SHEETS[n]||[]).filter(r=>v.indexOf(String(r[c]))===-1); return b-SHEETS[n].length; }
        function deleteRow_(n,k,v){ SHEETS[n]=(SHEETS[n]||[]).filter(r=>String(r[k])!==String(v)); }
        function updateRow_(n,k,v,p){ (SHEETS[n]||[]).forEach(r=>{ if(String(r[k])===String(v)) Object.assign(r,p); }); }
        function requireSuperAdmin_(){} function currentUserName_(){return 'D';}
        function logActivity_(){} function low_(v){return String(v||'').toLowerCase();}
        function fmtMoney_(n){return String(n);}
    `;
    const api = new Function('SHEETS', harness +
        fs.readFileSync(path.join(t.ROOT, 'backend/37-ProjectDeleteService.gs'), 'utf8') +
        '\nreturn {previewProjectDelete, deleteProject, archiveProject, unarchiveProject};')(SHEETS);

    SHEETS.Projects.push({ id: 'P1', name: 'BF2/NF2 Lagoon Liner', status: 'Ongoing' },
        { id: 'P2', name: 'Keep Me', status: 'Ongoing' });
    SHEETS.SOWItems.push({ id: '1.1', projectId: 'P1' }, { id: '9.9', projectId: 'P2' });
    SHEETS.Billings.push({ id: 'B1', projectId: 'P1', netAmount: 120000 },
        { id: 'B9', projectId: 'P2', netAmount: 5 });
    SHEETS.CashRelease.push({ id: 'R1', projectId: 'P1', status: 'Reviewed', amount: 50000 });
    SHEETS.IncomingCashRequests.push({ id: 'I1', projectId: 'P1', status: 'Approved', amount: 300000 });
    SHEETS.EstimateGroups.push({ id: 'EG1', projectId: 'P1' }, { id: 'EG9', projectId: 'P2' });
    SHEETS.EstimateMaterials.push({ id: 'M1', groupId: 'EG1' }, { id: 'M9', groupId: 'EG9' });
    SHEETS.PurchaseRequests.push({ id: 'PR1', projectId: 'P1' });
    SHEETS.PRLines.push({ id: 'PL1', prId: 'PR1' });
    SHEETS.PurchaseOrders.push({ id: 'PO1', projectId: 'P1' });
    SHEETS.POLines.push({ id: 'OL1', poId: 'PO1' });
    SHEETS.Approvals.push({ requestId: 'B1' }, { requestId: 'EG1' }, { requestId: 'B9' });
    SHEETS.DailyRecords.push({ id: 'D1', projectId: 'P1' });
    SHEETS.Comments.push({ id: 'C1', projectId: 'P1' });

    t.describe('project delete — preview', () => {
        const p = api.previewProjectDelete('P1');
        t.it('reaches rows that have no projectId of their own', () => {
            // Estimate lines hang off a group, PR lines off a request. A
            // delete matching only on projectId leaves every one behind.
            t.ok(p.counts.EstimateLines > 0);
            t.ok(p.counts.PRLines > 0 && p.counts.POLines > 0);
        });
        t.it('reports the money separately from the row count', () => {
            // "3 billings" and "₱1.2M" are different facts, and only the
            // second one makes anybody stop.
            t.ok(p.hasMoney);
            t.eq(p.money.billed, 120000);
            t.eq(p.money.collected, 300000);
        });
    });

    t.describe('project delete — confirmation', () => {
        t.it('a wrong name deletes nothing', () => {
            try { api.deleteProject('P1', 'wrong'); t.ok(false, 'it deleted anyway'); }
            catch (e) { t.ok(/name exactly/.test(e.message)); }
            t.eq(SHEETS.Projects.length, 2);
        });
    });

    t.describe('project delete — nothing is orphaned', () => {
        api.deleteProject('P1', 'BF2/NF2 Lagoon Liner');

        t.it('no row in ANY sheet still points at the project', () => {
            const orphans = [];
            Object.keys(SHEETS).forEach(sheet =>
                SHEETS[sheet].forEach(r => { if (r.projectId === 'P1') orphans.push(sheet); }));
            t.ok(orphans.length === 0, 'orphaned rows in: ' + orphans.join(', '));
        });
        t.it('indirect children go with their parents', () => {
            t.ok(!SHEETS.EstimateMaterials.find(r => r.groupId === 'EG1'));
            t.ok(!SHEETS.PRLines.find(r => r.prId === 'PR1'));
            t.ok(!SHEETS.POLines.find(r => r.poId === 'PO1'));
        });
        t.it('approval signatures go too', () => {
            // Keyed on request id, not project — so they survive a naive
            // delete and accumulate forever.
            t.ok(!SHEETS.Approvals.find(r => r.requestId === 'B1' || r.requestId === 'EG1'));
        });
        t.it('the neighbouring project is untouched', () => {
            t.ok(SHEETS.Projects.find(x => x.id === 'P2'));
            t.eq(SHEETS.SOWItems.length, 1);
            t.eq(SHEETS.EstimateMaterials.length, 1);
            t.eq(SHEETS.Approvals.length, 1);
        });
    });

    t.describe('archive', () => {
        t.it('archiving keeps every record', () => {
            api.archiveProject('P2', 'finished');
            const a = SHEETS.Projects.find(x => x.id === 'P2');
            t.eq(a.status, 'Archived');
            t.eq(a.previousStatus, 'Ongoing');
            t.eq(SHEETS.SOWItems.length, 1, 'archiving must never remove anything');
        });
        t.it('restoring puts the old status back', () => {
            api.unarchiveProject('P2');
            t.eq(SHEETS.Projects.find(x => x.id === 'P2').status, 'Ongoing');
        });
    });
};
