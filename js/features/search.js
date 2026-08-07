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
    try {
        const results = await DataService.search(query);
        if (seq !== SearchPage._seq) return;   // a newer search superseded this one
        SearchPage._results = results;
        countEl.textContent = results.length + ' found';

        if (!results.length) {
            emptyEl.style.display = 'block';
            emptyEl.querySelector('p').textContent = 'No matches found.';
            resultsEl.innerHTML = '';
            return;
        }
        emptyEl.style.display = 'none';

        // group by type, keep a stable order
        const order = ['Project', 'Cash Advance', 'Cash Release', 'Incoming Cash', 'Liquidation',
            'Material', 'Equipment', 'Manpower Role', 'Personnel', 'Billing', 'Transfer'];
        const groups = {};
        results.forEach((r, i) => {
            r._idx = i;
            (groups[r.type] = groups[r.type] || []).push(r);
        });

        let html = '';
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
        console.error('Search error:', err);
        UI.toast('Error performing search.', 'error');
    }
}
