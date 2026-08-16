/**
 * documents.test.js — The project document register.
 *
 * The register's whole value is that it does not lose things. Most of
 * these tests are therefore about what happens to the OLD copy when a
 * new one arrives, and who can see what.
 */

const fs = require('fs');
const path = require('path');

module.exports = function (t) {

    const SHEETS = { ProjectDocuments: [], Users: [] };
    const harness = `
        function ensureSheet_(n){ if(!SHEETS[n]) SHEETS[n]=[]; return SHEETS[n]; }
        function readAll_(n){ return (SHEETS[n]||[]).map(r=>Object.assign({},r)); }
        function readMany_(){}
        function appendRow_(n,row){ (SHEETS[n]=SHEETS[n]||[]).push(Object.assign({},row)); }
        function updateRow_(n,k,v,p){ (SHEETS[n]||[]).forEach(r=>{ if(String(r[k])===String(v)) Object.assign(r,p); }); }
        function deleteRow_(n,k,v){ SHEETS[n]=(SHEETS[n]||[]).filter(r=>String(r[k])!==String(v)); }
        var _s=0; function nextId_(p){return p+'-'+(++_s);}
        var ROLE='superadmin';
        function currentUserEmail_(){return 'd@f.ph';} function currentUserName_(){return 'D';}
        function currentUserRole_(){return ROLE;}
        function requireLogin_(){} function assertProjectEditor_(){} function requireSuperAdmin_(){}
        function logActivity_(){} function sanitizeDatesDeep_(v){return v;}
        function uploadImage(b,n){ return {url:'http://drive/'+n}; }
        var Utilities={formatDate:(d)=>{const m=new Date(d.getTime()+8*3600*1000);
            const p=n=>String(n).padStart(2,'0');
            return m.getUTCFullYear()+'-'+p(m.getUTCMonth()+1)+'-'+p(m.getUTCDate());}};
        var Session={getScriptTimeZone:()=>'Asia/Manila'};
    `;
    const api = new Function('SHEETS', harness +
        t.read('backend/40-DocumentService.gs') +
        '\nreturn {getProjectDocuments, addProjectDocument, deleteProjectDocument, docDay_, setRole:v=>{ROLE=v}};')(SHEETS);
    SHEETS.Users.push({ email: 'd@f.ph', name: 'Darwin' });

    t.describe('filing a document', () => {
        api.addProjectDocument({ projectId: 'P1', title: 'Signed contract',
            category: 'Contract', receivedFrom: 'AgriFarms', receivedDate: '2026-03-14',
            confidential: true, fileBase64: 'x', fileName: 'contract.pdf' });

        t.it('it is filed as version 1', () => {
            const r = api.getProjectDocuments('P1');
            t.eq(r.documents.length, 1);
            t.eq(r.documents[0].version, 1);
        });
        t.it('a file is mandatory', () => {
            // An entry with no document behind it is a note, not a record.
            try { api.addProjectDocument({ projectId: 'P1', title: 'x', category: 'Other' });
                t.ok(false, 'it accepted an entry with no file'); }
            catch (e) { t.ok(/Attach the file/.test(e.message)); }
        });
        t.it('the date is stored as text so Sheets leaves it alone', () => {
            // The same trap that made every assigned task invisible.
            t.eq(SHEETS.ProjectDocuments[0].receivedDate[0], "'");
            t.eq(api.docDay_(new Date(2026, 2, 14)), '2026-03-14');
            t.eq(api.docDay_("'2026-03-14"), '2026-03-14');
        });
    });

    t.describe('a new version never destroys the old one', () => {
        const first = SHEETS.ProjectDocuments[0].id;
        api.addProjectDocument({ projectId: 'P1', title: 'Signed contract',
            category: 'Contract', supersedes: first,
            fileBase64: 'x', fileName: 'contract-rev1.pdf' });

        t.it('both rows exist but only one is current', () => {
            const r = api.getProjectDocuments('P1');
            t.eq(r.documents.length, 2);
            t.eq(r.total, 1);
        });
        t.it('the old file is still reachable', () => {
            // In a dispute the question is rarely "what does it say" but
            // "what did it say in March" — a register that overwrites
            // cannot answer that, while looking authoritative.
            const old = api.getProjectDocuments('P1').documents.find(d => d.id === first);
            t.ok(old.superseded);
            t.ok(!!old.fileUrl);
        });
        t.it('the new one points back at what it replaced', () => {
            const cur = api.getProjectDocuments('P1').documents.find(d => !d.superseded);
            t.eq(cur.version, 2);
            t.eq(cur.supersedes, first);
        });
        t.it('confidentiality is INHERITED by the new version', () => {
            // Without this, uploading a revision of a confidential
            // contract silently exposes it — and nobody notices, because
            // the person uploading can see it either way.
            const cur = api.getProjectDocuments('P1').documents.find(d => !d.superseded);
            t.ok(cur.confidential);
        });
    });

    t.describe('confidential documents', () => {
        t.it('a requester sees none of them', () => {
            api.setRole('request-only');
            t.eq(api.getProjectDocuments('P1').documents.length, 0);
        });
        t.it('an approver sees them', () => {
            api.setRole('approver');
            t.ok(api.getProjectDocuments('P1').documents.length > 0);
            api.setRole('superadmin');
        });
    });

    t.describe('deleting', () => {
        t.it('a superseded document cannot be deleted', () => {
            const old = SHEETS.ProjectDocuments.find(d => d.superseded === 'TRUE');
            try { api.deleteProjectDocument(old.id); t.ok(false, 'it deleted the history'); }
            catch (e) { t.ok(/history this register exists to keep/.test(e.message)); }
        });
        t.it('deleting a version puts the previous one back in force', () => {
            // Otherwise the project is left with no current copy at all.
            const v2 = SHEETS.ProjectDocuments.find(d => d.version === 2);
            const prev = v2.supersedes;
            api.deleteProjectDocument(v2.id);
            t.eq(SHEETS.ProjectDocuments.find(d => d.id === prev).superseded, '');
        });
    });
};
