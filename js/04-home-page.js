        // ================================================================
        //  HOME PAGE
        // ================================================================

        const HomePage = {
            _loaded: false,
            async load() {
                const projectsContainer = document.getElementById('projectsContainer');
                const gaugesContainer = document.getElementById('gaugesContainer');
                const approvalContainer = document.getElementById('approvalContainer');
                UI.showLoading(projectsContainer);
                UI.showLoading(gaugesContainer);
                UI.showLoading(approvalContainer);
                try {
                    const data = await DataService.getHomeData();
                    const user = App.currentUser;
                    const isApprover = App.isApprover();

                    // ─── Projects ───
                    let projHtml = `<div class="projects-grid">`;
                    data.projects.forEach(p => {
                        projHtml += `
                        <button class="project-card" onclick="ProjectPage.open('${p.id}')">
                            <div class="pc-head"><div class="pc-name">${p.name}</div><span class="stamp approved">${p.status}</span></div>
                            <div class="pc-stats">
                                <div class="pc-stat"><div class="k">Revenue</div><div class="v">₱${p.revenue.toFixed(2)}</div></div>
                                <div class="pc-stat"><div class="k">Expenses</div><div class="v">₱${p.expenses.toFixed(2)}</div></div>
                                <div class="pc-stat"><div class="k">Cash Position</div><div class="v">₱${p.cashPosition.toFixed(2)}</div></div>
                            </div>
                        </button>`;
                    });
                    projHtml += `</div>`;
                    UI.setContent(projectsContainer, projHtml);

                    // ─── Gauges ───
                    let gaugeHtml = `<div class="gauges">`;
                    data.gauges.forEach(g => {
                        gaugeHtml += `
                        <div class="gauge">
                            <svg width="40" height="40" viewBox="0 0 40 40">
                                <circle cx="20" cy="20" r="16" fill="none" stroke="#EFE7D2" stroke-width="5"/>
                                <circle cx="20" cy="20" r="16" fill="none" stroke="${g.color}" stroke-width="5" stroke-dasharray="100.5" stroke-dashoffset="${g.dashOffset}" stroke-linecap="round" transform="rotate(-90 20 20)"/>
                            </svg>
                            <div><div class="g-num">${g.value}</div><div class="g-label">${g.label}</div></div>
                        </div>`;
                    });
                    gaugeHtml += `</div>`;
                    UI.setContent(gaugesContainer, gaugeHtml);

                    // ─── Tickets (Role-based) ───
                    const tickets = [
                        { id: 'request', label: 'Request Cash Advance', sub: 'New requisition', roles: ['admin', 'approver', 'request-only'] },
                        { id: 'record-cash', label: 'Record Incoming Cash', sub: 'Capital / injections', roles: ['admin', 'approver'] },
                        { id: 'release-cash', label: 'Release Cash', sub: 'Approved advance', roles: ['admin', 'approver'] },
                        { id: 'liquidate', label: 'Liquidate Advance', sub: 'Receipts & balance', roles: ['admin', 'approver', 'request-only'] },
                        { id: 'search', label: 'Search Records', sub: 'All transactions', roles: ['admin', 'approver', 'request-only'] },
                        { id: 'materials', label: 'Materials DB', sub: 'Master list & approval', roles: ['admin', 'approver', 'request-only'] },
                        { id: 'equipment', label: 'Tools & Equipment', sub: 'Equipment inventory', roles: ['admin', 'approver', 'request-only'] },
                        { id: 'approvals', label: 'Approvals', sub: 'My requests & pending', roles: ['admin', 'approver', 'request-only'] }
                    ];

                    const userRole = user ? user.role : 'request-only';
                    const visibleTickets = tickets.filter(t => t.roles.includes(userRole));

                    // Compute badge count based on user role
                    let pendingCount;
                    if (user && user.role === 'request-only') {
                        const myRequests = await DataService.getMyPendingRequests();
                        pendingCount = myRequests.length;
                    } else {
                        pendingCount = data.pendingRequests.length + DataService._pendingMaterials.length + DataService._pendingEquipment.length;
                    }

                    let ticketHtml = `<div class="tickets">`;
                    visibleTickets.forEach(t => {
                        const isApproval = t.id === 'approvals';
                        const safetyClass = t.id === 'request' ? 'safety' : '';
                        const approvalClass = isApproval ? 'approval-ticket' : '';
                        const badgeHtml = isApproval ? `<span class="t-badge" id="approvalBadgeHome">${pendingCount}</span>` : '';
                        const borderStyle = t.id === 'materials' ? 'border-color:var(--blueprint);' :
                                            t.id === 'equipment' ? 'border-color:var(--amber);' :
                                            isApproval ? 'border-color:var(--green);' : '';
                        const iconBg = t.id === 'materials' ? 'background:var(--blueprint);color:#fff;' :
                                       t.id === 'equipment' ? 'background:var(--amber);color:#fff;' :
                                       isApproval ? 'background:#E1F0E8;color:var(--green);' : '';
                        const iconEl = t.id === 'request' ? Icon.wallet({ size: 18 }) :
                                        t.id === 'record-cash' ? Icon.incoming({ size: 18 }) :
                                        t.id === 'release-cash' ? Icon.outgoing({ size: 18 }) :
                                        t.id === 'liquidate' ? Icon.receipt({ size: 18 }) :
                                        t.id === 'search' ? Icon.search({ size: 18 }) :
                                        t.id === 'materials' ? Icon.package({ size: 18 }) :
                                        t.id === 'equipment' ? Icon.wrench({ size: 18 }) :
                                        t.id === 'approvals' ? Icon.checkCircle({ size: 18, color: 'currentColor' }) : '';
                        ticketHtml += `
                            <button class="ticket ${safetyClass} ${approvalClass}" onclick="App.navigate('${t.id}')" style="${borderStyle}">
                                <div class="ico" style="${iconBg}">${iconEl}</div>
                                <div class="t-label">${t.label}</div>
                                <div class="t-sub">${t.sub}</div>
                                ${badgeHtml}
                            </button>`;
                    });
                    ticketHtml += `</div>`;

                    const ticketsContainer = document.querySelector('.tickets');
                    if (ticketsContainer) {
                        ticketsContainer.outerHTML = ticketHtml;
                    } else {
                        const sectionHead = document.querySelector('.section-head');
                        if (sectionHead && sectionHead.nextElementSibling && sectionHead.nextElementSibling.classList.contains('tickets')) {
                            sectionHead.nextElementSibling.outerHTML = ticketHtml;
                        }
                    }

                    // ─── Approval Queue ───
                    const pending = data.pendingRequests;
                    const logs = data.logs;
                    let queueHtml = `
                    <div class="panel"><div class="panel-head"><h3>Pending Requests</h3><span class="mono" style="font-size:11px;color:var(--ink-soft)">${pending.length} waiting</span></div>
                        <table><thead><tr><th>Request</th><th>Project</th><th style="text-align:right">Amount</th><th>Status</th></tr></thead><tbody>`;
                    pending.forEach(r => {
                        const cls = r.status === 'Approved' ? 'approved' : r.status === 'Released' ? 'approved' : 'rejected';
                        queueHtml += `<tr><td><span class="req-id">${r.id}</span><br><span style="color:var(--ink-soft);font-size:11px">${r.requestor}</span></td><td>${r.project}</td><td class="amt">₱${r.amount.toFixed(2)}</td><td><span class="stamp ${cls}">${r.status}</span></td></tr>`;
                    });
                    queueHtml += `</tbody></table></div>
                    <div class="panel"><div class="panel-head"><h3>Site Log</h3><span class="mono" style="font-size:11px;color:var(--ink-soft)">recent</span></div><div class="log">`;
                    logs.forEach(l => {
                        queueHtml += `<div class="log-item"><div class="log-tick ${l.type === 'g' ? 'g' : l.type === 'a' ? 'a' : ''}"></div><div class="log-body"><p>${l.text}</p><time>${l.time}</time></div></div>`;
                    });
                    queueHtml += `</div></div>`;
                    UI.setContent(approvalContainer, queueHtml);

                    // Update approval badge
                    const badge = document.getElementById('approvalBadgeHome');
                    if (badge) badge.textContent = pendingCount;

                    this._loaded = true;
                } catch (err) {
                    console.error('Home load error:', err);
                    UI.toast('Error loading home data.', 'error');
                }
            }
        };

