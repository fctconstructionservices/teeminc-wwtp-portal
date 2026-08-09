// ================================================================
//  pages/home.js — Home dashboard
//
//  PURPOSE: Renders the gauges strip, project cards with
//  Ongoing/Completed/All filter tabs, pending request tickets and
//  the recent activity log from DataService.getHomeData().
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
                            style="padding:4px 14px;font-size:11px;">
                            + Add Project
                        </button>
                    `;
                } else {
                    const projectCount = data.projects ? data.projects.length : 0;
                    rightContent = `<span class="badge project-count-badge">${projectCount} projects</span>`;
                }
                // v7.2.1: this block REWRITES the section head, so the
                // Portfolio link has to live here — putting it in
                // index.html meant it was wiped on every load.
                sectionHead.innerHTML = `
                    <h2>Projects</h2>
                    <div class="rule"></div>
                    <button class="link-btn" onclick="App.navigate('portfolio')">Portfolio View <span class="btn-arrow"></span></button>
                    ${rightContent}
                `;
            }

            // ─── Project Status Tabs ──────────────────────────────
            if (!document.querySelector('.project-status-tabs')) {
                const tabsHtml = `
                    <div class="project-status-tabs" style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">
                        <button class="btn-sm primary" data-status="ongoing" onclick="HomePage.filterProjects('ongoing')">
                            ${Icon.circleDot({size:11})} Ongoing
                        </button>
                        <button class="btn-sm" data-status="completed" onclick="HomePage.filterProjects('completed')">
                            ${Icon.checkCircle({size:13})} Completed
                        </button>
                        <button class="btn-sm" data-status="all" onclick="HomePage.filterProjects('all')">
                            ${Icon.punchlist({size:13})} All Projects
                        </button>
                    </div>
                `;
                if (sectionHead && sectionHead.nextSibling) {
                    sectionHead.insertAdjacentHTML('afterend', tabsHtml);
                }
            }

            // ─── ✅ RENDER PROJECTS (FILTERED) ────────────────────
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
            // ── v12: THE TILES ARE GONE ──
            // "Start a transaction" was a second, partial copy of the
            // navigation: eleven buttons that did nothing the top bar
            // does not now do, and only some of what it does. Two routes
            // to the same page is two things to keep in step, and these
            // were already behind — no Purchase Orders, no Suppliers, no
            // Timeline.
            //
            // The dashboard is a DASHBOARD now: what needs you, and what
            // the money is doing. Going somewhere is the bar's job.
            const tickets = [];

            const userRole = user ? user.role : 'request-only';
            const visibleTickets = tickets.filter(t => t.roles.includes(userRole));

            const pendingData = await DataService.getPendingApprovals();
            const userEmail = user ? user.email.toLowerCase() : '';

            // Count pending items using new structure
            const pendingCashAdvances = (pendingData.cashAdvances || []).filter(function(r) {
                return r.requestorEmail && r.requestorEmail.toLowerCase() !== userEmail;
            });

            const pendingReleases = (pendingData.releases || []).filter(function(r) {
                return r.releasedBy && r.releasedBy.toLowerCase() !== userEmail;
            });

            const pendingMaterials = (pendingData.materials || []).filter(function(m) {
                return m.requestedBy && m.requestedBy.toLowerCase() !== userEmail;
            });

            const pendingEquipment = (pendingData.equipment || []).filter(function(e) {
                return e.requestedBy && e.requestedBy.toLowerCase() !== userEmail;
            });

            const pendingEstimates = pendingData.estimates || [];
            const pendingDailyRecords = (pendingData.dailyRecords || []).filter(function(d) {
                return d.createdBy && d.createdBy.toLowerCase() !== userEmail;
            });

            const pendingCount = pendingCashAdvances.length + pendingReleases.length + 
                                pendingMaterials.length + pendingEquipment.length + 
                                pendingEstimates.length + pendingDailyRecords.length;
            
            let ticketHtml = '';

            // Remove the tile strip and its heading outright.
            const ticketsContainer = document.querySelector('.tickets');
            if (ticketsContainer) {
                ticketsContainer.remove();
            } else if (false) {
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
                    queueHtml += `<tr><td><span class="req-id">${r.id}</span><br><span style="color:var(--ink-soft);font-size:11px">${r.requestor}</span></td><td>${projectDisplay}</td><td class="amt">₱${fmtMoney((r.amount || 0))}</td><td><span class="stamp pending">${r.status}</span></td></tr>`;
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
     * renderProjects - Renders the project cards for the current filter.
     */
    renderProjects() {
        const container = document.getElementById('projectsContainer');
        if (!container) {
            console.error('projectsContainer not found');
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
            // 'ongoing' - everything that is not completed
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

        // Update project count badge
        const countBadge = document.querySelector('.project-count-badge');
        if (countBadge) {
            countBadge.textContent = filteredProjects.length + ' projects';
        }

        // Render projects
        if (filteredProjects.length === 0) {
            container.innerHTML = `
                <div class="empty" style="padding:40px 20px;">
                    <p>No ${this._currentFilter === 'all' ? '' : this._currentFilter} projects found.</p>
                </div>
            `;
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
                        <div class="pc-stat"><div class="k">Revenue</div><div class="v">₱${fmtMoney((p.revenue || 0))}</div></div>
                        <div class="pc-stat"><div class="k">Expenses</div><div class="v">₱${fmtMoney((p.expenses || 0))}</div></div>
                        <div class="pc-stat"><div class="k">Cash Position</div><div class="v">₱${fmtMoney((p.cashPosition || 0))}</div></div>
                    </div>
                    ${(p.editors && p.editors.length) ? `<div class="home-editor-avatars" style="margin-top:8px;">
                        ${p.editors.slice(0, 4).map(e => `<span class="editor-avatar" title="${e}">${e.slice(0, 2).toUpperCase()}</span>`).join('')}
                        <span class="more">${p.editors.length > 4 ? '+' + (p.editors.length - 4) + ' · ' : ''}editors</span>
                    </div>` : ''}
                </button>`;
        });
        projHtml += `</div>`;
        
        container.innerHTML = projHtml;
    },

    /**
     * filterProjects - Filters the project list by status.
     */
    filterProjects(status) {
        this._currentFilter = status;
        this.renderProjects();
    }
};