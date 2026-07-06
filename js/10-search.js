        // ================================================================
        //  SEARCH (unchanged)
        // ================================================================

        async function performSearch() {
            const query = document.getElementById('searchInput').value;
            const results = await DataService.search(query);
            const countEl = document.getElementById('searchCount');
            const emptyEl = document.getElementById('searchEmpty');
            const tableWrap = document.getElementById('searchTableWrap');
            const tbody = document.getElementById('searchTableBody');
            countEl.textContent = results.length + ' found';
            if (results.length === 0 || !query.trim()) {
                emptyEl.style.display = 'block';
                tableWrap.style.display = 'none';
                if (!query.trim()) { emptyEl.querySelector('p').textContent = 'Mag-type para maghanap.'; } else { emptyEl
                        .querySelector('p').textContent = 'Walang match.'; }
                return;
            }
            emptyEl.style.display = 'none';
            tableWrap.style.display = 'block';
            let rows = '';
            results.forEach(r => {
                const cls = r.status === 'Approved' || r.status === 'Released' ? 'approved' : r.status ===
                    'Pending' ? 'pending' : 'rejected';
                rows +=
                    `<tr><td><span class="req-id">${r.id}</span></td><td>${r.requestor}</td><td>${r.project}</td><td class="amt">₱${r.amount.toFixed(2)}</td><td><span class="stamp ${cls}">${r.status}</span></td></tr>`;
            });
            tbody.innerHTML = rows;
        }

