// ================================================================
//  HOME PAGE - Complete with fixes for Issues 1.1, 3.5, 3.6, 3.10
//  FIX: Added App.updateUserBadges() after rendering tickets
//  NEW: Project filtering with tabs (Ongoing, Completed, All)
// ================================================================

/**
 * HomePage - Main dashboard
 */
const HomePage = {
    _loaded: false,
    _allProjects: [],
    _currentFilter: 'ongoing',
    
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
            const isSuperAdmin = user && user.role === 'superadmin';
            
            // ✅ I-save ang projects
            this._allProjects = data.projects || [];
            this._currentFilter = 'ongoing';
            
            // ─── Projects Section Head ────────────────────────────
            const sectionHead = document.getElementById('projectsSectionHead');
            if (sectionHead) {
                let rightContent = '';
                if (isSuperAdmin) {
                    rightContent = `
                        <button class="btn-primary" onclick="ProjectPage.showAddProjectModal()" 
                            style="padding:4px 14px;font-size:11px;margin-left:auto;">
                            + Add Project
                        </button>
                    `;
                } else {
                    const projectCount = data.projects ? data.projects.length : 0;
                    rightContent = `<span class="badge project-count-badge">${projectCount} projects</span>`;
                }
                sectionHead.innerHTML = `
                    <h2>Projects</h2>
                    <div class="rule"></div>
                    ${rightContent}
                `;
            }

            // ─── Project Status Tabs ──────────────────────────────
            // ✅ Idagdag ang tabs kung wala pa
            if (!document.querySelector('.project-status-tabs')) {
                const tabsHtml = `
                    <div class="project-status-tabs" style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">
                        <button class="btn-sm primary" data-status="ongoing" onclick="HomePage.filterProjects('ongoing')">
                            🔵 Ongoing
                        </button>
                        <button class="btn-sm" data-status="completed" onclick="HomePage.filterProjects('completed')">
                            ✅ Completed
                        </button>
                        <button class="btn-sm" data-status="all" onclick="HomePage.filterProjects('all')">
                            📋 All Projects
                        </button>
                    </div>
                `;
                if (sectionHead && sectionHead.nextSibling) {
                    sectionHead.insertAdjacentHTML('afterend', tabsHtml);
                }
            }

            // ─── ✅ RENDER PROJECTS (FILTERED) ────────────────────
            // ✅ TANGGAL NA ANG LUMANG CODE! ITO LANG ANG GAGAMITIN.
            this.renderProjects();

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

            // ─── Tickets ──────────────────────────────────────────
            // ... (same as before, no changes) ...
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

            const userEmail = user ? user.email.toLowerCase() : '';
            const pendingData = await DataService.getPendingApprovals();

            const filteredRequests = pendingData.requests.filter(function(r) {
                const notSelf = r.requestorEmail && r.requestorEmail.toLowerCase() !== userEmail;
                const notActed = !r.userActed;
                return notSelf && notActed;
            });

            const filteredMaterials = pendingData.materials.filter(function(m) {
                return m.requestedBy && m.requestedBy.toLowerCase() !== userEmail;
            });

            const filteredEquipment = pendingData.equipment.filter(function(e) {
                return e.requestedBy && e.requestedBy.toLowerCase() !== userEmail;
            });

            const filteredDailyRecords = pendingData.dailyRecords ? pendingData.dailyRecords.filter(function(d) {
                return d.createdBy && d.createdBy.toLowerCase() !== userEmail;
            }) : [];

            const pendingCount = filteredRequests.length + 
                    filteredMaterials.length +
                    filteredEquipment.length + 
                    (pendingData.estimates ? pendingData.estimates.length : 0) +
                    filteredDailyRecords.length;
            
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
                const sectionHeadEl = document.querySelector('.section-head');
                if (sectionHeadEl && sectionHeadEl.nextElementSibling && sectionHeadEl.nextElementSibling.classList.contains('tickets')) {
                    sectionHeadEl.nextElementSibling.outerHTML = ticketHtml;
                }
            }

            App.updateUserBadges();

            // ─── Approval Queue ─────────────────────────────────
            const pending = data.pendingRequests;
            const logs = data.logs;
            
            const activePending = pending.filter(r => r.status === 'Pending');

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

            const badge = document.getElementById('approvalBadgeHome');
            if (badge) badge.textContent = pendingCount;

            this._loaded = true;
        } catch (err) {
            console.error('Home load error:', err);
            UI.toast('Error loading home data.', 'error');
        }
    },

    /**
     * renderProjects - I-render ang projects base sa current filter
     */
    renderProjects() {
        const container = document.getElementById('projectsContainer');
        if (!container) {
            console.warn('projectsContainer not found');
            return;
        }

        let filteredProjects = [];

        if (this._currentFilter === 'all') {
            filteredProjects = this._allProjects;
        } else if (this._currentFilter === 'completed') {
            filteredProjects = this._allProjects.filter(function(p) {
                return p.status && p.status.toLowerCase() === 'completed';
            });
        } else {
            // 'ongoing' - lahat ng hindi completed
            filteredProjects = this._allProjects.filter(function(p) {
                return p.status && p.status.toLowerCase() !== 'completed';
            });
        }

        // Update tab buttons
        document.querySelectorAll('.project-status-tabs .btn-sm').forEach(function(btn) {
            btn.classList.remove('primary');
            if (btn.dataset.status === HomePage._currentFilter) {
                btn.classList.add('primary');
            }
        });

        // Update project count
        const countBadge = document.querySelector('.project-count-badge');
        if (countBadge) {
            countBadge.textContent = filteredProjects.length + ' projects';
        }

        // Render projects
        if (filteredProjects.length === 0) {
            UI.setContent(container, `
                <div class="empty" style="padding:40px 20px;">
                    <p>No ${this._currentFilter === 'all' ? '' : this._currentFilter} projects found.</p>
                </div>
            `);
            return;
        }

        let projHtml = `<div class="projects-grid">`;
        filteredProjects.forEach(function(p) {
            const statusClass = p.status && p.status.toLowerCase() === 'completed' ? 'approved' : 'ontrack';
            projHtml += `
                <button class="project-card" onclick="ProjectPage.open('${p.id}')">
                    <div class="pc-head">
                        <div class="pc-name">${p.name}</div>
                        <span class="stamp ${statusClass}">${p.status || 'Ongoing'}</span>
                    </div>
                    <div class="pc-stats">
                        <div class="pc-stat"><div class="k">Revenue</div><div class="v">₱${(p.revenue || 0).toFixed(2)}</div></div>
                        <div class="pc-stat"><div class="k">Expenses</div><div class="v">₱${(p.expenses || 0).toFixed(2)}</div></div>
                        <div class="pc-stat"><div class="k">Cash Position</div><div class="v">₱${(p.cashPosition || 0).toFixed(2)}</div></div>
                    </div>
                </button>`;
        });
        projHtml += `</div>`;
        UI.setContent(container, projHtml);
    },

    /**
     * filterProjects - I-filter ang projects base sa status
     */
    filterProjects(status) {
        this._currentFilter = status;
        this.renderProjects();
    }
};
