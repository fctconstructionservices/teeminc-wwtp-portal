// ================================================================
        //  APPROVALS PAGE
        // ================================================================

        // --- Request Detail Modal ---
        const RequestDetailModal = {
            _currentId: null,
            _type: 'request',
            open(id, type = 'request') {
                this._currentId = id;
                this._type = type;
                const modal = document.getElementById('requestDetailModal');
                const body = document.getElementById('requestDetailBody');
                UI.showLoading(body);
                modal.classList.add('open');
                document.body.style.overflow = 'hidden';
                this._loadDetails(id, type);
            },
            close() {
                document.getElementById('requestDetailModal').classList.remove('open');
                document.body.style.overflow = '';
            },
            async _loadDetails(id, type) {
                const body = document.getElementById('requestDetailBody');
                try {
                    let data;
                    if (type === 'request') {
                        data = await DataService.getRequestById(id);
                    } else {
                        // For materials/equipment/estimates, we can use existing view methods
                        // For now, we only handle 'request' type
                        UI.toast('Details for this type not yet supported.', 'error');
                        this.close();
                        return;
                    }
                    if (!data) {
                        UI.toast('Request not found.', 'error');
                        this.close();
                        return;
                    }
                    body.innerHTML = this._renderDetails(data);
                } catch (err) {
                    UI.toast('Error loading details.', 'error');
                    this.close();
                }
            },
            _renderDetails(data) {
                const isApprover = App.isApprover();
                const statusCls = data.status === 'Approved' ? 'approved' : data.status === 'Pending' ? 'pending' : 'rejected';
                let html = `
                <div class="print-header">
                    <h2>${data.id} — ${data.type}</h2>
                    <div class="print-meta">${data.date} · <span class="stamp ${statusCls}">${data.status}</span></div>
                </div>
                <div class="print-section"><div class="ps-title">Request Details</div>
                    <div class="detail-grid">
                        <div class="dg-item"><span class="dg-label">Requestor</span><span class="dg-value">${data.requestor}</span></div>
                        <div class="dg-item"><span class="dg-label">Project</span><span class="dg-value">${data.project}</span></div>
                        <div class="dg-item"><span class="dg-label">Amount</span><span class="dg-value">₱${data.amount.toFixed(2)}</span></div>
                        <div class="dg-item"><span class="dg-label">Scope of Work</span><span class="dg-value">${data.scope || '—'}</span></div>
                        <div class="dg-item full"><span class="dg-label">Description</span><span class="dg-value">${data.description || '—'}</span></div>
                        ${data.notes ? `<div class="dg-item full"><span class="dg-label">Notes</span><span class="dg-value">${data.notes}</span></div>` : ''}
                        ${data.attachments && data.attachments.length ? `<div class="dg-item full"><span class="dg-label">Attachments</span><span class="dg-value">${data.attachments.join(', ')}</span></div>` : ''}
                    </div>
                </div>
                <div class="print-actions">
                    <button class="btn-primary" onclick="window.print()">${Icon.printer({size:14})} Print</button>
                    ${isApprover ? `
                        <button class="btn-sm success" onclick="ApprovalsPage.approveItem('${data.id}','request', true)">Approve</button>
                        <button class="btn-sm danger" onclick="ApprovalsPage.rejectItem('${data.id}','request', true)">Reject</button>
                    ` : ''}
                    <button class="btn-ghost" onclick="RequestDetailModal.close()">Close</button>
                </div>`;
                return html;
            }
        };

        const ApprovalsPage = {
            _loaded: false,
            _currentTab: 'pending',

            async load() {
                const container = document.getElementById('approvalsContent');
                UI.showLoading(container);
                try {
                    const user = App.currentUser;
                    const isApprover = App.isApprover();

                    // If request-only, show only "My Requests"
                    if (!isApprover) {
                        const myRequests = await DataService.getMyPendingRequests();
                        let html = `
                        <div class="section-head"><h2>Approvals</h2><div class="rule"></div>
                            <span class="badge">My Requests (${myRequests.length})</span>
                        </div>
                        <div class="approval-tab-bar">
                            <button class="active" data-tab="myrequests" onclick="ApprovalsPage.switchTab('myrequests')">${Icon.user({size:14})} My Requests (${myRequests.length})</button>
                        </div>
                        <div id="approval-tab-myrequests" class="approval-tab-content active">
                            ${this._renderMyRequestsTab(myRequests)}
                        </div>`;
                        UI.setContent(container, html);
                        this._loaded = true;
                        return;
                    }

                    // For approvers/admins: show both tabs
                    const pendingData = await DataService.getPendingApprovals();
                    const myRequests = await DataService.getMyPendingRequests();

                    const totalPending = pendingData.requests.length + pendingData.materials.length +
                        pendingData.equipment.length + pendingData.estimates.length;

                    let html = `
                    <div class="section-head"><h2>Approval Dashboard</h2><div class="rule"></div>
                        <span class="badge">${totalPending} pending</span>
                    </div>

                    <div class="approval-tab-bar">
                        <button class="active" data-tab="pending" onclick="ApprovalsPage.switchTab('pending')">${Icon.clipboardList({size:14})} Pending (${totalPending})</button>
                        <button data-tab="myrequests" onclick="ApprovalsPage.switchTab('myrequests')">${Icon.user({size:14})} My Requests (${myRequests.length})</button>
                    </div>

                    <div id="approval-tab-pending" class="approval-tab-content active">
                        ${this._renderPendingTab(pendingData)}
                    </div>
                    <div id="approval-tab-myrequests" class="approval-tab-content">
                        ${this._renderMyRequestsTab(myRequests)}
                    </div>`;

                    UI.setContent(container, html);
                    this._loaded = true;
                } catch (err) {
                    console.error('Approvals load error:', err);
                    UI.toast('Error loading approvals.', 'error');
                }
            },

            switchTab(tab) {
                this._currentTab = tab;
                document.querySelectorAll('.approval-tab-bar button').forEach(b => b.classList.remove('active'));
                document.querySelector(`.approval-tab-bar button[data-tab="${tab}"]`)?.classList.add('active');
                document.querySelectorAll('.approval-tab-content').forEach(el => el.classList.remove('active'));
                const target = document.getElementById(`approval-tab-${tab}`);
                if (target) target.classList.add('active');
            },

            _renderPendingTab(data) {
                let html = `<div class="section-head"><h3>Cash Advance Requests</h3><div class="rule"></div></div>`;
                if (data.requests.length === 0) {
                    html += `<div class="empty"><p>No pending cash advance requests.</p></div>`;
                } else {
                    html += `<div class="panel"><div style="padding:4px 0;">`;
                    data.requests.forEach(r => {
                        html += `
                        <div class="approval-request-item" onclick="RequestDetailModal.open('${r.id}','request')" style="cursor:pointer;">
                            <div class="ar-icon">${Icon.wallet({size:16})}</div>
                            <div class="ar-body">
                                <div class="ar-title">${r.requestor} — ${r.project}</div>
                                <div class="ar-meta">
                                    <span class="ar-id">${r.id}</span>
                                    <span>₱${r.amount.toFixed(2)}</span>
                                    <span>${r.date}</span>
                                    <span class="stamp pending" style="transform:none;padding:1px 8px;font-size:9px;">${r.status}</span>
                                </div>
                            </div>
                            <div style="color:var(--ink-soft);">›</div>
                        </div>`;
                    });
                    html += `</div></div>`;
                }

                // Materials
                html += `<div class="section-head"><h3>Materials Pending Approval</h3><div class="rule"></div></div>`;
                if (data.materials.length === 0) {
                    html += `<div class="empty"><p>No pending materials.</p></div>`;
                } else {
                    html += `<div class="panel"><div style="padding:4px 0;">`;
                    data.materials.forEach(m => {
                        html += `
                        <div class="approval-request-item" onclick="MaterialsPage.viewMaterial('${m.id}')" style="cursor:pointer;">
                            <div class="ar-icon">${Icon.package({size:16})}</div>
                            <div class="ar-body">
                                <div class="ar-title">${m.brand} — ${m.specs || m.category}</div>
                                <div class="ar-meta">
                                    <span class="ar-id">${m.id}</span>
                                    <span>${m.category}</span>
                                    <span class="stamp pending" style="transform:none;padding:1px 8px;font-size:9px;">${m.status}</span>
                                </div>
                            </div>
                            <div style="color:var(--ink-soft);">›</div>
                        </div>`;
                    });
                    html += `</div></div>`;
                }

                // Equipment
                html += `<div class="section-head"><h3>Equipment Pending Approval</h3><div class="rule"></div></div>`;
                if (data.equipment.length === 0) {
                    html += `<div class="empty"><p>No pending equipment.</p></div>`;
                } else {
                    html += `<div class="panel"><div style="padding:4px 0;">`;
                    data.equipment.forEach(e => {
                        html += `
                        <div class="approval-request-item" onclick="EquipmentPage.viewEquipment('${e.id}')" style="cursor:pointer;">
                            <div class="ar-icon">${Icon.wrench({size:16})}</div>
                            <div class="ar-body">
                                <div class="ar-title">${e.brand} ${e.model ? '— ' + e.model : ''}</div>
                                <div class="ar-meta">
                                    <span class="ar-id">${e.id}</span>
                                    <span>${e.category}</span>
                                    <span class="stamp pending" style="transform:none;padding:1px 8px;font-size:9px;">${e.status}</span>
                                </div>
                            </div>
                            <div style="color:var(--ink-soft);">›</div>
                        </div>`;
                    });
                    html += `</div></div>`;
                }

                // Estimates
                html += `<div class="section-head"><h3>Estimates Pending Approval</h3><div class="rule"></div></div>`;
                if (data.estimates.length === 0) {
                    html += `<div class="empty"><p>No pending estimates.</p></div>`;
                } else {
                    html += `<div class="panel"><div style="padding:4px 0;">`;
                    data.estimates.forEach(e => {
                        html += `
                        <div class="approval-request-item" onclick="ProjectPage.openSOWBreakdown('${e.id}')" style="cursor:pointer;">
                            <div class="ar-icon">${Icon.ruler({size:16})}</div>
                            <div class="ar-body">
                                <div class="ar-title">${e.id} — ${e.description || e.project}</div>
                                <div class="ar-meta">
                                    <span class="ar-id">${e.id}</span>
                                    <span>${e.project}</span>
                                    <span>${e.requestor}</span>
                                    <span class="stamp pending" style="transform:none;padding:1px 8px;font-size:9px;">${e.status}</span>
                                </div>
                            </div>
                            <div style="color:var(--ink-soft);">›</div>
                        </div>`;
                    });
                    html += `</div></div>`;
                }

                return html;
            },

            _renderMyRequestsTab(requests) {
                let html = `<div class="section-head"><h3>My Pending Requests</h3><div class="rule"></div></div>`;
                if (requests.length === 0) {
                    html += `<div class="empty"><p>You have no pending requests.</p></div>`;
                } else {
                    html += `<div class="panel"><div style="padding:4px 0;">`;
                    requests.forEach(r => {
                        const icon = r.type === 'Cash Advance' ? Icon.wallet({size:16}) : r.type === 'Liquidation' ? Icon.receipt({size:16}) : r
                            .type === 'Estimate' ? Icon.ruler({size:16}) : Icon.fileText({size:16});
                        // For request-only, we can show details if we have full data; we'll open details modal
                        const clickHandler = `RequestDetailModal.open('${r.id}','request')`;
                        html += `
                        <div class="my-request-item" onclick="${clickHandler}" style="cursor:pointer;">
                            <div class="mr-icon">${icon}</div>
                            <div class="mr-body">
                                <div class="mr-title">${r.type}: ${r.id} — ${r.project}</div>
                                <div class="mr-meta">
                                    <span class="mr-id">${r.id}</span>
                                    ${r.amount ? `<span>₱${r.amount.toFixed(2)}</span>` : ''}
                                    ${r.description ? `<span>${r.description}</span>` : ''}
                                    <span>${r.date}</span>
                                    <span class="stamp pending" style="transform:none;padding:1px 8px;font-size:9px;">Pending</span>
                                </div>
                            </div>
                            <div style="font-size:11px;color:var(--ink-soft);">›</div>
                        </div>`;
                    });
                    html += `</div></div>`;
                }
                return html;
            },

            async approveItem(id, type, closeModal = false) {
                const confirmed = await Confirm.open('Approve Item?', `Approve ${id}?`);
                if (!confirmed) return;
                try {
                    if (type === 'material') {
                        await DataService.approveMaterial(id);
                    } else if (type === 'equipment') {
                        await DataService.approveEquipment(id);
                    } else if (type === 'estimate') {
                        const projects = ['fctc-cs', 'ga-overhead'];
                        let found = false;
                        for (const projId of projects) {
                            const p = await DataService.getProjectData(projId);
                            if (p && p.estimates && p.estimates.groups) {
                                const group = p.estimates.groups.find(g => g.sowId === id);
                                if (group && group.status === 'pending') {
                                    await DataService.approveEstimates(projId, id);
                                    found = true;
                                    break;
                                }
                            }
                        }
                        if (!found) { UI.toast('Estimate not found or not pending.', 'error'); return; }
                    } else if (type === 'request') {
                        // Cash Advance / Liquidation / Incoming Cash / Release Cash
                        await DataService.approveItemGeneric(id, 'request');
                        UI.toast(`Request ${id} approved.`, 'success');
                        if (closeModal) RequestDetailModal.close();
                        this.load();
                        HomePage.load();
                        return;
                    }
                    UI.toast(`${id} approved!`, 'success');
                    if (closeModal) RequestDetailModal.close();
                    this.load();
                    HomePage.load();
                } catch (err) { UI.toast('' + err.message, 'error'); }
            },

            async rejectItem(id, type, closeModal = false) {
                const confirmed = await Confirm.open('Reject Item?', `Reject ${id}?`);
                if (!confirmed) return;
                try {
                    if (type === 'material') {
                        await DataService.rejectItemGeneric(id, 'Material');
                    } else if (type === 'equipment') {
                        await DataService.rejectItemGeneric(id, 'Equipment');
                    } else if (type === 'estimate') {
                        await DataService.rejectItemGeneric(id, 'Estimate');
                    } else if (type === 'request') {
                        await DataService.rejectItemGeneric(id, 'request');
                    }
                    UI.toast(`${id} rejected.`, 'error');
                    if (closeModal) RequestDetailModal.close();
                    this.load();
                    HomePage.load();
                } catch (err) { UI.toast('' + err.message, 'error'); }
            }
        };
