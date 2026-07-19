// ================================================================
//  features/search.js — Global search
//
//  PURPOSE: Queries backend search (projects + all request sheets)
//  and renders the results table with status stamps.
// ================================================================

async function performSearch() {
    const query = document.getElementById('searchInput').value.trim();
    const countEl = document.getElementById('searchCount');
    const emptyEl = document.getElementById('searchEmpty');
    const tableWrap = document.getElementById('searchTableWrap');
    const tbody = document.getElementById('searchTableBody');
    
    if (!query) {
        countEl.textContent = '0 found';
        emptyEl.style.display = 'block';
        emptyEl.querySelector('p').textContent = 'Mag-type para maghanap.';
        tableWrap.style.display = 'none';
        return;
    }
    
    try {
        const results = await DataService.search(query);
        countEl.textContent = results.length + ' found';
        
        if (results.length === 0) {
            emptyEl.style.display = 'block';
            emptyEl.querySelector('p').textContent = 'No matches found.';
            tableWrap.style.display = 'none';
            return;
        }
        
        emptyEl.style.display = 'none';
        tableWrap.style.display = 'block';
        
        let rows = '';
        results.forEach(r => {
            const cls = r.status === 'Approved' || r.status === 'Reviewed' ? 'approved' : 
                       r.status === 'Pending' || r.status === 'For Review' ? 'pending' : 'rejected';
            rows += `<tr><td><span class="req-id">${r.id}</span></td><td>${r.requestor || r.name || '—'}</td><td>${r.projectId || '—'}</td><td class="amt">₱${fmtMoney((r.amount || 0))}</td><td><span class="stamp ${cls}">${r.status || '—'}</span></td></tr>`;
        });
        tbody.innerHTML = rows;
    } catch (err) {
        console.error('Search error:', err);
        UI.toast('Error performing search.', 'error');
    }
}