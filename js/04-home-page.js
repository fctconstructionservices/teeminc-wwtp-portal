// ================================================================
//  HOME PAGE - Complete with fixes for Issues 1.1, 3.5, 3.6, 3.10
//  FIX: Added App.updateUserBadges() after rendering tickets
// ================================================================

/**
 * HomePage - Main dashboard
 * 
 * FIXES APPLIED:
 * - Fixed "My Approval Queue" renamed to "Approval Que" (Issue 3.6)
 * - Pending requests now disappear when approved (Issue 3.9)
 * - Fixed undefined project display (Issue 3.5)
 * - Unified ticker count with approvals page (Issue 3.10)
 * - ✅ Added updateUserBadges() after rendering tickets
 */
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

            // ─── Projects ────────────────────────────────────────
            let projHtml = `<div class="projects-grid">`;
            data.projects.forEach(p => {
                projHtml += `
                <button class="project-card" onclick="ProjectPage.open('${p.id}')">
                    <div class="pc-head"><div class="pc-name">${p.name}</div><span class="stamp approved">${p.status}</span></div>
                    <div class="pc-stats">
                        <div class="pc-stat"><div class="k">Revenue</div><div class="v">₱${(p.revenue || 0).toFixed(2)}</div></div>
                        <div class="pc-stat"><div class="k">Expenses</div><div class="v">₱${(p.expenses || 0).toFixed(2)}</div></div>
                        <div class="pc-stat"><div class="k">Cash Position</div><div class="v">₱${(p.cashPosition || 0).toFixed(2)}</div></div>
                    </div>
                </button>`;
            });
            projHtml += `</div>`;
            UI.setContent(projectsContainer, projHtml);

            // ─── Gauges ──────────────────────────────────────────
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

            // ─── Tickets (Role-based) ──────────────────────────
            const tickets = [
                { id: 'request', label: 'Request Cash Advance', sub: 'New requisition', roles: ['superadmin', 'admin', 'approver', 'request-only'] },
                { id: 'record-cash', label: 'Record Incoming Cash', sub: 'Capital / injections', roles: ['superadmin', 'admin', 'approver'] },
                { id: 'release-cash', label: 'Release Cash', sub: 'Approved advance', roles: ['superadmin', 'admin', 'approver'] },
                { id: 'liquidate', label: 'Liquidate Advance', sub: 'Receipts & balance', roles: ['superadmin', 'admin', 'approver', 'request-only'] },
                { id: 'search', label: 'Search Records', sub: 'All transactions', roles: ['superadmin', 'admin', 'approver', 'request-only'] },
                { id: 'materials', label: 'Materials DB', sub: 'Master list & approval', roles: ['superadmin', 'admin', 'approver', 'request-only'] },
                { id: 'equipment', label: 'Tools & Equipment', sub: 'Equipment inventory', roles: ['superadmin', 'admin', 'approver', 'request-only'] },
                { id: 'approvals', label: 'Approvals', sub: 'My requests & pending', roles: ['superadmin', 'admin', 'approver', 'request-only'] }
            ];

            const userRole = user ? user.role : 'request-only';
            const visibleTickets = tickets.filter(t => t.roles.includes(userRole));

            // eto yung red circle Compute pending count for badge
            const myRequests = await DataService.getPendingApprovals();
            const pendingCount = myRequests.length;

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

            // ✅ FIX: Update user badges after rendering tickets
            App.updateUserBadges();

            // ─── Approval Queue ─────────────────────────────────
            // Changed from "My Approval Queue" to "Approval Que" (Issue 3.6)
            const pending = data.pendingRequests;
            const logs = data.logs;
            
            // Homepage Pending Reequest - makikita na lahat ng request na pending (overview)
            const userEmail = user ? user.email.toLowerCase() : '';
            const filteredPending = pending;
            const activePending = filteredPending.filter(r => r.status === 'Pending');

            let queueHtml = `
            <div class="panel"><div class="panel-head"><h3>Pending Requests</h3><span class="mono" style="font-size:11px;color:var(--ink-soft)">${activePending.length} waiting</span></div>
                <div style="max-height:300px;overflow-y:auto;">`;
            if (activePending.length === 0) {
                queueHtml += `<div class="empty"><p>No pending requests.</p></div>`;
            } else {
                queueHtml += `<table><thead><tr><th>Request</th><th>Project</th><th style="text-align:right">Amount</th><th>Status</th></tr></thead><tbody>`;
                activePending.slice(0, 10).forEach(r => {
                    const projectDisplay = r.projectId || r.project || '—';
                    queueHtml += `<tr><td><span class="req-id">${r.id}</span><br><span style="color:var(--ink-soft);font-size:11px">${r.requestor}</span></td><td>${projectDisplay}</td><td class="amt">₱${(r.amount || 0).toFixed(2)}</td><td><span class="stamp pending">${r.status}</span></td></tr>`;
                });
                queueHtml += `</tbody></table>`;
            }
            queueHtml += `</div></div>
            
            <div class="panel"><div class="panel-head"><h3>Activity Log</h3><span class="mono" style="font-size:11px;color:var(--ink-soft)">recent</span></div>
                <div class="log" style="max-height:300px;overflow-y:auto;">`;
            logs.forEach(l => {
                queueHtml += `<div class="log-item"><div class="log-tick ${l.type === 'g' ? 'g' : l.type === 'a' ? 'a' : ''}"></div><div class="log-body"><p>${l.text}</p><time>${l.time}</time></div></div>`;
            });
            queueHtml += `</div></div>`;
            UI.setContent(approvalContainer, queueHtml);

            // ✅ FIX: Update approval badge with unified count (Issue 3.10)
            const badge = document.getElementById('approvalBadgeHome');
            if (badge) badge.textContent = pendingCount;

            this._loaded = true;
        } catch (err) {
            console.error('Home load error:', err);
            UI.toast('Error loading home data.', 'error');
        }
    }
};
