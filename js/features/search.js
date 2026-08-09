// ================================================================
//  features/search.js — Global search (v8)
//
//  PURPOSE: Queries backend search and renders results GROUPED BY
//  TYPE, each group with columns that actually fit that type (a
//  Material has no "amount"; a Cash Advance has no "brand"). Every
//  row is clickable and opens a detail modal built from the result's
//  `detail` payload — Materials/Equipment route to their existing
//  datasheet modals when the full record is available.
// ================================================================

const SearchPage = {
    _results: [],
    _seq: 0,

    /** Column plans per result type: [label, renderFn] */
    _plans: {
        // ── v11 BATCH I4: columns for the record types added in I3 ──
        // Without a plan a type falls back to ID / Description / Status,
        // which is readable but throws away the one figure that makes
        // each of these worth finding: the amount, the supplier, the due
        // date.
        'Quotation': [
            ['Quote No.', r => `<span class="req-id">${r.id}</span>`],
            ['Title', r => r.label || '—'],
            ['Quoted', r => '₱' + fmtMoney(r.amount || 0)],
            ['Status', r => SearchPage._stamp(r.status)]
        ],
        'Purchase Request': [
            ['PR No.', r => `<span class="req-id">${r.id}</span>`],
            ['Title', r => r.label || '—'],
            ['Amount', r => '₱' + fmtMoney(r.amount || 0)],
            ['Status', r => SearchPage._stamp(r.status)]
        ],
        'Purchase Order': [
            ['PO No.', r => `<span class="req-id">${r.id}</span>`],
            ['Supplier', r => r.label || '—'],
            ['Gross', r => '₱' + fmtMoney(r.amount || 0)],
            ['Status', r => SearchPage._stamp(r.status)]
        ],
        'Goods Receipt': [
            ['Receipt', r => `<span class="req-id">${r.id}</span>`],
            ['Delivery ref', r => r.label || '—'],
            ['Value', r => '₱' + fmtMoney(r.amount || 0)],
            ['Received', r => r.date || '—']
        ],
        'Supplier Invoice': [
            ['Invoice', r => `<span class="req-id">${r.label || r.id}</span>`],
            ['Gross', r => '₱' + fmtMoney(r.amount || 0)],
            ['Status', r => SearchPage._stamp(r.status)]
        ],
        'Supplier': [
            ['Supplier', r => r.label || '—'],
            ['ID', r => `<span class="req-id">${r.id}</span>`],
            ['Status', r => SearchPage._stamp(r.status)]
        ],
        'Safety': [
            ['Date', r => r.date || '—'],
            ['Type', r => r.label || '—'],
            ['Project', r => r.projectId || '—'],
            ['Status', r => SearchPage._stamp(r.status)]
        ],
        'Punchlist': [
            ['Ref', r => `<span class="req-id">${r.id}</span>`],
            ['Description', r => r.label || '—'],
            ['Status', r => SearchPage._stamp(r.status)]
        ],
        'Drawing': [
            ['Drawing', r => r.label || '—'],
            ['Revision', r => r.status || '—'],
            ['Issued', r => r.date || '—']
        ],
        'OT Request': [
            ['Request', r => `<span class="req-id">${r.id}</span>`],
            ['Reason', r => r.label || '—'],
            ['Date', r => r.date || '—'],
            ['Status', r => SearchPage._stamp(r.status)]
        ],
        'Lesson': [
            ['Lesson', r => r.label || '—'],
            ['Category', r => r.status || '—'],
            ['Captured', r => r.date || '—']
        ],

        'Project': [
            ['Project ID', r => `<span class="req-id">${r.id}</span>`],
            ['Name', r => r.label || '—'],
            ['Status', r => SearchPage._stamp(r.status)]
        ],
        'Cash Advance': [
            ['ID', r => `<span class="req-id">${r.id}</span>`],
            ['Requestor', r => r.requestor || '—'],
            ['Project', r => r.projectId || '—'],
            ['Purpose', r => r.label || '—'],
            ['Amount', r => `<span class="amt">₱${fmtMoney(r.amount || 0)}</span>`],
            ['Status', r => SearchPage._stamp(r.status)]
        ],
        'Cash Release': [
            ['ID', r => `<span class="req-id">${r.id}</span>`],
            ['Requestor', r => r.requestor || '—'],
            ['Project', r => r.projectId || '—'],
            ['Amount', r => `<span class="amt">₱${fmtMoney(r.amount || 0)}</span>`],
            ['Status', r => SearchPage._stamp(r.status)]
        ],
        'Incoming Cash': [
            ['ID', r => `<span class="req-id">${r.id}</span>`],
            ['Project', r => r.projectId || '—'],
            ['Description', r => r.label || '—'],
            ['Date', r => `<span class="mono" style="font-size:11px">${r.date || '—'}</span>`],
            ['Amount', r => `<span class="amt">₱${fmtMoney(r.amount || 0)}</span>`],
            ['Status', r => SearchPage._stamp(r.status)]
        ],
        'Liquidation': [
            ['ID', r => `<span class="req-id">${r.id}</span>`],
            ['Requestor', r => r.requestor || '—'],
            ['Project', r => r.projectId || '—'],
            ['Amount', r => `<span class="amt">₱${fmtMoney(r.amount || 0)}</span>`],
            ['Status', r => SearchPage._stamp(r.status)]
        ],
        'Material': [
            ['ID', r => `<span class="req-id">${r.id}</span>`],
            ['Material', r => r.label || '—'],
            ['Brand', r => r.brand || '—'],
            ['Category', r => r.category || '—'],
            ['Unit', r => r.unit || '—'],
            ['Status', r => SearchPage._stamp(r.status)]
        ],
        'Equipment': [
            ['ID', r => `<span class="req-id">${r.id}</span>`],
            ['Equipment', r => r.label || '—'],
            ['Category', r => r.category || '—'],
            ['Unit', r => r.unit || '—'],
            ['Status', r => SearchPage._stamp(r.status)]
        ],
        'Manpower Role': [
            ['ID', r => `<span class="req-id">${r.id}</span>`],
            ['Role / Trade', r => r.label || '—'],
            ['Classification', r => r.category || '—'],
            ['Status', r => SearchPage._stamp(r.status)]
        ],
        'Personnel': [
            ['ID', r => `<span class="req-id">${r.id}</span>`],
            ['Name', r => r.label || '—'],
            ['Position', r => r.category || '—'],
            ['Status', r => SearchPage._stamp(r.status)]
        ],
        'Billing': [
            ['ID', r => `<span class="req-id">${r.id}</span>`],
            ['Billing #', r => r.label || '—'],
            ['Project', r => r.projectId || '—'],
            ['Date', r => `<span class="mono" style="font-size:11px">${r.date || '—'}</span>`],
            ['Net Amount', r => `<span class="amt">₱${fmtMoney(r.amount || 0)}</span>`],
            ['Status', r => SearchPage._stamp(r.status)]
        ],
        'Transfer': [
            ['ID', r => `<span class="req-id">${r.id}</span>`],
            ['Item', r => r.label || '—'],
            ['Date', r => `<span class="mono" style="font-size:11px">${r.date || '—'}</span>`],
            ['Status', r => SearchPage._stamp(r.status)]
        ]
    },

    _stamp(status) {
        const s = String(status || '');
        const l = s.toLowerCase();
        const cls = (l === 'approved' || l === 'reviewed' || l === 'paid' || l === 'completed' ||
                     l === 'released' || l === 'active' || l === 'ongoing' || l === 'approved for release') ? 'approved'
                  : (l === 'pending' || l === 'for review' || l === 'pending approval' || l === 'draft') ? 'pending'
                  : 'rejected';
        return s ? `<span class="stamp ${cls}" style="transform:none;padding:1px 8px;font-size:9px;">${s}</span>` : '—';
    },

    open(idx) {
        const r = this._results[idx];
        if (!r) return;
        // Materials/Equipment: use their proper datasheet modal when the
        // full cached record exists; else fall back to the detail modal.
        if (r.type === 'Material') {
            const full = (DataService._materials || []).find(m => m.id === r.id);
            if (full) { MatPrintModal.open(full); return; }
        }
        if (r.type === 'Equipment') {
            const full = (DataService._equipment || []).find(e => e.id === r.id);
            if (full) { EquipPrintModal.open(full); return; }
        }
        if (r.type === 'Project') {
            // a project result navigates straight to the project page
            ProjectPage.open(r.id);
            return;
        }
        SearchDetailModal.open(r);
    }
};

async function performSearch() {
    const query = document.getElementById('searchInput').value.trim();
    const countEl = document.getElementById('searchCount');
    const emptyEl = document.getElementById('searchEmpty');
    const resultsEl = document.getElementById('searchResults');

    if (!query) {
        countEl.textContent = '0 found';
        emptyEl.style.display = 'block';
        emptyEl.querySelector('p').textContent = 'Type to search.';
        resultsEl.innerHTML = '';
        return;
    }

    // debounce + stale-response guard: only the LATEST query may render
    const seq = ++SearchPage._seq;

    // ── v11 BATCH I3: SAY THAT IT IS SEARCHING ──
    // A search over twenty-odd sheets takes a moment on Apps Script. With
    // no feedback the screen simply sat there, so people typed again,
    // which starts another search and makes it slower still. The spinner
    // is not decoration — it is what stops the retrying.
    countEl.textContent = 'Searching...';
    emptyEl.style.display = 'block';
    emptyEl.querySelector('p').innerHTML =
        '<span class="search-spin"></span> Searching every record for “' +
        String(query).replace(/&/g, '&amp;').replace(/</g, '&lt;') + '”...';
    resultsEl.innerHTML = '';

    try {
        const results = await DataService.search(query);
        if (seq !== SearchPage._seq) return;   // a newer search superseded this one
        SearchPage._results = results;
        countEl.textContent = results.length + ' found';

        // ── v11 BATCH I4: SAY WHAT WAS SEARCHED ──
        // The frontend and the Apps Script backend deploy separately, so
        // this page can be several versions ahead of its server. A search
        // that quietly omits purchase orders looks exactly like a search
        // that found none, and the conclusion drawn is "the record does
        // not exist" — the worst possible wrong answer.
        //
        // The backend reports how many record types it covers. If that
        // is fewer than this build expects, the Apps Script has not been
        // redeployed, and it says so instead of leaving you guessing.
        const EXPECTED_TYPES = 22;
        const covered = results.length ? (results[0]._coverage || 0) : 0;
        SearchPage._staleBackend = covered > 0 && covered < EXPECTED_TYPES;

        if (!results.length) {
            emptyEl.style.display = 'block';
            // Offer the likeliest explanation rather than a flat "none".
            emptyEl.querySelector('p').innerHTML =
                'No matches found.<br><span style="font-size:11.5px;color:var(--ink-soft)">' +
                'If you expected a purchase order, quotation or supplier here and the backend ' +
                'has not been redeployed since the last update, it will not be searched yet.</span>';
            resultsEl.innerHTML = '';
            return;
        }
        emptyEl.style.display = 'none';

        // group by type, keep a stable order
        // v11 BATCH I3: the new record types are ordered too. A type that
        // is not listed here still renders — it just sorts last — so a
        // future record type appears in search the day it is added
        // rather than the day someone remembers this array.
        const order = ['Project', 'Quotation', 'Purchase Request', 'Purchase Order',
            'Goods Receipt', 'Supplier Invoice', 'Supplier',
            'Cash Advance', 'Cash Release', 'Incoming Cash', 'Liquidation', 'Billing',
            'Material', 'Equipment', 'Manpower Role', 'Personnel', 'Transfer',
            'Safety', 'Punchlist', 'Drawing', 'OT Request', 'Lesson'];
        const groups = {};
        results.forEach((r, i) => {
            r._idx = i;
            (groups[r.type] = groups[r.type] || []).push(r);
        });

        let html = SearchPage._staleBackend
            ? `<div class="panel" style="margin-bottom:14px;border-left:3px solid var(--amber);">
                 <div style="padding:11px 14px;font-size:12.5px;line-height:1.5;">
                   <b>This search covered ${covered} of ${EXPECTED_TYPES} record types.</b>
                   Purchase orders, quotations, suppliers and others are missing because the
                   Apps Script backend has not been redeployed since the last update. Push
                   <code>backend/</code> with clasp and redeploy.
                 </div>
               </div>`
            : '';
        order.concat(Object.keys(groups).filter(t => !order.includes(t))).forEach(type => {
            const rows = groups[type];
            if (!rows || !rows.length) return;
            const plan = SearchPage._plans[type] || [
                ['ID', r => `<span class="req-id">${r.id}</span>`],
                ['Description', r => r.label || '—'],
                ['Status', r => SearchPage._stamp(r.status)]
            ];
            html += `
            <div class="panel" style="margin-bottom:14px;">
                <div class="panel-head"><h3>${type}</h3><span class="mono" style="font-size:11px;color:var(--ink-soft)">${rows.length} result${rows.length > 1 ? 's' : ''}</span></div>
                <table><thead><tr>${plan.map(c => `<th>${c[0]}</th>`).join('')}<th></th></tr></thead><tbody>`;
            rows.forEach(r => {
                html += `<tr style="cursor:pointer;" onclick="SearchPage.open(${r._idx})" title="Click to view details">
                    ${plan.map(c => `<td>${c[1](r)}</td>`).join('')}
                    <td style="color:var(--ink-soft);text-align:right;">›</td>
                </tr>`;
            });
            html += `</tbody></table></div>`;
        });
        resultsEl.innerHTML = html;
    } catch (err) {
        if (seq !== SearchPage._seq) return;
        emptyEl.style.display = 'block';
        emptyEl.querySelector('p').textContent = 'Search failed: ' + (err.message || err);
        countEl.textContent = '0 found';
        if (seq !== SearchPage._seq) return;
        console.error('Search error:', err);
        UI.toast('Error performing search.', 'error');
    }
}
