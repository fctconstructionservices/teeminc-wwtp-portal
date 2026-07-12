// ================================================================
//  APPROVALS PAGE - Complete with fixes for Issues 3.1-3.10
//  FIX: Added daily records to pending approvals
//  FIX: Super Admin shows Force Approve/Reject instead of normal buttons
//  FIX: Added Incoming Cash to pending approvals
// ================================================================

// ─── REQUEST DETAIL MODAL ──────────────────────────────────────
/**
 * RequestDetailModal - Displays detailed view of a request
 */
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
                if (!data) {
                    const pending = await DataService.getPendingApprovals();
                    const found = pending.requests.find(r => r.id === id);
                    if (found) data = found;
                }
            } else {
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
        const user = App.currentUser;
        const isSuperAdmin = user && user.role === 'superadmin';
        const isApprover = App.isApprover() && !isSuperAdmin;
        const isRequestor = user && data.requestorEmail && 
            user.email.toLowerCase() === data.requestorEmail.toLowerCase();
        const statusCls = data.status === 'Approved' ? 'approved' : data.status === 'Pending' ? 'pending' : 'rejected';
        
        let attachmentsHtml = '';
        if (data.attachments && data.attachments.length > 0) {
            attachmentsHtml = `
                <div class="dg-item full"><span class="dg-label">Attachments</span>
                    <div class="dg-value" style="display:flex;gap:8px;flex-wrap:wrap;">
                        ${data.attachments.map(function(att) {
                            return `<a href="${att.url}" target="_blank" style="display:flex;align-items:center;gap:4px;padding:4px 8px;background:var(--bg);border-radius:4px;border:1px solid var(--line);font-size:12px;text-decoration:none;color:var(--blueprint);">
                                ${Icon.fileText({size:13})} ${att.name || 'Attachment'}
                            </a>`;
                        }).join('')}
                    </div>
                </div>
            `;
        }
        
        let actionButtons = '';
        if (data.status === 'Pending') {
            if (isSuperAdmin) {
                actionButtons = `
                    <button class="btn-sm success" onclick="ApprovalsPage.forceApproveItem('${data.id}','request', true)">Force Approve</button>
                    <button class="btn-sm danger" onclick="ApprovalsPage.forceRejectItem('${data.id}','request', true)">Force Reject</button>
                `;
            } else if (isApprover && !isRequestor) {
                actionButtons = `
                    <button class="btn-sm success" onclick="ApprovalsPage.approveItem('${data.id}','request', true)">Approve</button>
                    <button class="btn-sm danger" onclick="ApprovalsPage.rejectItem('${data.id}','request', true)">Reject</button>
                `;
            }
        }
        
        let html = `
        <div class="print-header">
            <h2>${data.id} — ${data.type}</h2>
            <div class="print-meta">${data.date || new Date().toLocaleDateString()} · <span class="stamp ${statusCls}">${data.status}</span></div>
        </div>
        <div class="print-section"><div class="ps-title">Request Details</div>
            <div class="detail-grid">
                <div class="dg-item"><span class="dg-label">Requestor</span><span class="dg-value">${data.requestor}</span></div>
                <div class="dg-item"><span class="dg-label">Project</span><span class="dg-value">${data.project || data.projectId || '—'}</span></div>
                <div class="dg-item"><span class="dg-label">Amount</span><span class="dg-value">₱${(data.amount || 0).toFixed(2)}</span></div>
                <div class="dg-item"><span class="dg-label">Scope of Work</span><span class="dg-value">${data.scope || '—'}</span></div>
                <div class="dg-item full"><span class="dg-label">Description</span><span class="dg-value">${data.description || '—'}</span></div>
                ${attachmentsHtml}
            </div>
        </div>
        <div class="print-actions">
            <button class="btn-primary" onclick="window.print()">${Icon.printer({size:14})} Print</button>
            ${actionButtons}
            <button class="btn-ghost" onclick="RequestDetailModal.close()">Close</button>
        </div>`;
        return html;
    }
};

// ─── APPROVALS PAGE ────────────────────────────────────────────
/**
 * ApprovalsPage - Main approvals dashboard
 */
const ApprovalsPage = {
    _loaded: false,
    _currentTab: 'pending',

    async load() {
        const container = document.getElementById('approvalsContent');
        UI.showLoading(container);
        try {
            const user = App.currentUser;
            const isSuperAdmin = user && user.role === 'superadmin';
            const isApprover = App.isApprover() && !isSuperAdmin;

            const pendingData = await DataService.getPendingApprovals();
            const myRequests = await DataService.getMyPendingRequests();
            const myApproved = await DataService.getMyApprovedRequests ? await DataService.getMyApprovedRequests() : [];
            const myRejected = await DataService.getMyRejectedRequests ? await DataService.getMyRejectedRequests() : [];

            const userEmail = user ? user.email.toLowerCase() : '';
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

            const totalPending = filteredRequests.length + filteredMaterials.length +
                filteredEquipment.length + (pendingData.estimates ? pendingData.estimates.length : 0) +
                filteredDailyRecords.length;

            let html = `
            <div class="section-head"><h2>Approval Dashboard</h2><div class="rule"></div>
                <span class="badge">${isApprover || isSuperAdmin ? totalPending + ' pending' : myRequests.length + ' my requests'}</span>
            </div>

            <div class="approval-tab-bar">
                ${(isApprover || isSuperAdmin) ? `<button class="active" data-tab="pending" onclick="ApprovalsPage.switchTab('pending')">${Icon.clipboardList({size:14})} ${isSuperAdmin ? 'Force Approval' : 'My Pending Approvals'} (${totalPending})</button>` : ''}
                <button ${!(isApprover || isSuperAdmin) ? 'class="active"' : ''} data-tab="myrequests" onclick="ApprovalsPage.switchTab('myrequests')">${Icon.user({size:14})} My Pending Requests (${myRequests.length})</button>
                <button data-tab="approved" onclick="ApprovalsPage.switchTab('approved')">${Icon.checkCircle({size:14})} My Approved Requests (${myApproved.length})</button>
                <button data-tab="rejected" onclick="ApprovalsPage.switchTab('rejected')">${Icon.xCircle({size:14})} My Rejected Requests (${myRejected.length})</button>
            </div>

            ${(isApprover || isSuperAdmin) ? `<div id="approval-tab-pending" class="approval-tab-content active">${this._renderPendingTab({requests: filteredRequests, materials: filteredMaterials, equipment: filteredEquipment, estimates: pendingData.estimates || [], dailyRecords: filteredDailyRecords})}</div>` : ''}
            <div id="approval-tab-myrequests" class="approval-tab-content ${!(isApprover || isSuperAdmin) ? 'active' : ''}">${this._renderMyRequestsTab(myRequests, 'pending')}</div>
            <div id="approval-tab-approved" class="approval-tab-content">${this._renderMyRequestsTab(myApproved, 'approved')}</div>
            <div id="approval-tab-rejected" class="approval-tab-content">${this._renderMyRequestsTab(myRejected, 'rejected')}</div>`;

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

    /**
     * _renderPendingTab - Renders the pending approvals tab
     * FIX: Added Incoming Cash section
     * FIX: Super Admin shows Force Approve/Reject
     */
    _renderPendingTab(data) {
        const user = App.currentUser;
        const isSuperAdmin = user && user.role === 'superadmin';
        const isApprover = App.isApprover() && !isSuperAdmin;

        let html = '';

        // ─── Cash Advance Requests ──────────────────────────────
        html += `<div class="section-head"><h3>Cash Advance Requests</h3><div class="rule"></div></div>`;
        const cashAdvanceRequests = data.requests.filter(function(r) {
            return r.type === 'Cash Advance';
        });
        if (cashAdvanceRequests.length === 0) {
            html += `<div class="empty"><p>No pending cash advance requests.</p></div>`;
        } else {
            html += `<div class="panel"><div style="padding:4px 0;">`;
            cashAdvanceRequests.forEach(r => {
                let actionsHtml = '';
                if (isSuperAdmin) {
                    actionsHtml = `
                        <button class="btn-sm success" onclick="ApprovalsPage.forceApproveItem('${r.id}','request')">Force Approve</button>
                        <button class="btn-sm danger" onclick="ApprovalsPage.forceRejectItem('${r.id}','request')">Force Reject</button>
                    `;
                } else if (isApprover) {
                    actionsHtml = `
                        <button class="btn-sm success" onclick="ApprovalsPage.approveItem('${r.id}','request')">Approve</button>
                        <button class="btn-sm danger" onclick="ApprovalsPage.rejectItem('${r.id}','request')">Reject</button>
                    `;
                }
                html += `
                <div class="approval-request-item" style="cursor:pointer;">
                    <div class="ar-icon">${Icon.wallet({size:16})}</div>
                    <div class="ar-body" onclick="RequestDetailModal.open('${r.id}','request')">
                        <div class="ar-title">${r.requestor} — ${r.projectId || '—'}</div>
                        <div class="ar-meta">
                            <span class="ar-id">${r.id}</span>
                            <span>₱${(r.amount || 0).toFixed(2)}</span>
                            <span>${r.date || new Date().toLocaleDateString()}</span>
                            <span class="stamp pending" style="transform:none;padding:1px 8px;font-size:9px;">${r.status}</span>
                        </div>
                    </div>
                    <div class="ar-actions">${actionsHtml}</div>
                </div>`;
            });
            html += `</div></div>`;
        }

        // ─── Incoming Cash Requests ──────────────────────────────
        html += `<div class="section-head"><h3>Incoming Cash Requests</h3><div class="rule"></div></div>`;
        const incomingRequests = data.requests.filter(function(r) {
            return r.type === 'Incoming Cash';
        });
        if (incomingRequests.length === 0) {
            html += `<div class="empty"><p>No pending incoming cash requests.</p></div>`;
        } else {
            html += `<div class="panel"><div style="padding:4px 0;">`;
            incomingRequests.forEach(r => {
                let actionsHtml = '';
                if (isSuperAdmin) {
                    actionsHtml = `
                        <button class="btn-sm success" onclick="ApprovalsPage.forceApproveItem('${r.id}','Incoming Cash')">Force Approve</button>
                        <button class="btn-sm danger" onclick="ApprovalsPage.forceRejectItem('${r.id}','Incoming Cash')">Force Reject</button>
                    `;
                } else if (isApprover) {
                    actionsHtml = `
                        <button class="btn-sm success" onclick="ApprovalsPage.approveItem('${r.id}','request')">Approve</button>
                        <button class="btn-sm danger" onclick="ApprovalsPage.rejectItem('${r.id}','request')">Reject</button>
                    `;
                }
                html += `
                <div class="approval-request-item" style="cursor:pointer;">
                    <div class="ar-icon">${Icon.incoming({size:16})}</div>
                    <div class="ar-body" onclick="RequestDetailModal.open('${r.id}','request')">
                        <div class="ar-title">${r.requestor} — ${r.projectId || '—'}</div>
                        <div class="ar-meta">
                            <span class="ar-id">${r.id}</span>
                            <span>${r.type}</span>
                            <span>₱${(r.amount || 0).toFixed(2)}</span>
                            <span>${r.description || '—'}</span>
                            <span class="stamp pending" style="transform:none;padding:1px 8px;font-size:9px;">${r.status}</span>
                        </div>
                    </div>
                    <div class="ar-actions">${actionsHtml}</div>
                </div>`;
            });
            html += `</div></div>`;
        }

        // ─── Materials Pending Approval ──────────────────────────
        html += `<div class="section-head"><h3>Materials Pending Approval</h3><div class="rule"></div></div>`;
        if (data.materials.length === 0) {
            html += `<div class="empty"><p>No pending materials.</p></div>`;
        } else {
            html += `<div class="panel"><div style="padding:4px 0;">`;
            data.materials.forEach(m => {
                let actionsHtml = '';
                if (isSuperAdmin) {
                    actionsHtml = `
                        <button class="btn-sm success" onclick="ApprovalsPage.forceApproveItem('${m.id}','Material')">Force Approve</button>
                        <button class="btn-sm danger" onclick="ApprovalsPage.forceRejectItem('${m.id}','Material')">Force Reject</button>
                    `;
                } else if (isApprover) {
                    actionsHtml = `
                        <button class="btn-sm success" onclick="ApprovalsPage.approveItem('${m.id}','material')">Approve</button>
                        <button class="btn-sm danger" onclick="ApprovalsPage.rejectItem('${m.id}','material')">Reject</button>
                    `;
                }
                html += `
                <div class="approval-request-item" style="cursor:pointer;">
                    <div class="ar-icon">${Icon.package({size:16})}</div>
                    <div class="ar-body" onclick="MaterialsPage.viewMaterial('${m.id}')">
                        <div class="ar-title">${m.brand || m.name || 'Unnamed'} — ${m.specs || m.desc || m.category}</div>
                        <div class="ar-meta">
                            <span class="ar-id">${m.id}</span>
                            <span>${m.category}</span>
                            <span class="stamp pending" style="transform:none;padding:1px 8px;font-size:9px;">${m.status}</span>
                        </div>
                    </div>
                    <div class="ar-actions">${actionsHtml}</div>
                </div>`;
            });
            html += `</div></div>`;
        }

        // ─── Equipment Pending Approval ──────────────────────────
        html += `<div class="section-head"><h3>Equipment Pending Approval</h3><div class="rule"></div></div>`;
        if (data.equipment.length === 0) {
            html += `<div class="empty"><p>No pending equipment.</p></div>`;
        } else {
            html += `<div class="panel"><div style="padding:4px 0;">`;
            data.equipment.forEach(e => {
                let actionsHtml = '';
                if (isSuperAdmin) {
                    actionsHtml = `
                        <button class="btn-sm success" onclick="ApprovalsPage.forceApproveItem('${e.id}','Equipment')">Force Approve</button>
                        <button class="btn-sm danger" onclick="ApprovalsPage.forceRejectItem('${e.id}','Equipment')">Force Reject</button>
                    `;
                } else if (isApprover) {
                    actionsHtml = `
                        <button class="btn-sm success" onclick="ApprovalsPage.approveItem('${e.id}','equipment')">Approve</button>
                        <button class="btn-sm danger" onclick="ApprovalsPage.rejectItem('${e.id}','equipment')">Reject</button>
                    `;
                }
                html += `
                <div class="approval-request-item" style="cursor:pointer;">
                    <div class="ar-icon">${Icon.wrench({size:16})}</div>
                    <div class="ar-body" onclick="EquipmentPage.viewEquipment('${e.id}')">
                        <div class="ar-title">${e.brand || e.name || 'Unnamed'} ${e.model ? '— ' + e.model : ''}</div>
                        <div class="ar-meta">
                            <span class="ar-id">${e.id}</span>
                            <span>${e.category}</span>
                            <span class="stamp pending" style="transform:none;padding:1px 8px;font-size:9px;">${e.status}</span>
                        </div>
                    </div>
                    <div class="ar-actions">${actionsHtml}</div>
                </div>`;
            });
            html += `</div></div>`;
        }

        // ─── Estimates Pending Approval ──────────────────────────
        html += `<div class="section-head"><h3>Estimates Pending Approval</h3><div class="rule"></div></div>`;
        if (data.estimates.length === 0) {
            html += `<div class="empty"><p>No pending estimates.</p></div>`;
        } else {
            html += `<div class="panel"><div style="padding:4px 0;">`;
            data.estimates.forEach(e => {
                let actionsHtml = '';
                if (isSuperAdmin) {
                    actionsHtml = `
                        <button class="btn-sm success" onclick="ApprovalsPage.forceApproveItem('${e.id}','Estimate')">Force Approve</button>
                        <button class="btn-sm danger" onclick="ApprovalsPage.forceRejectItem('${e.id}','Estimate')">Force Reject</button>
                    `;
                } else if (isApprover) {
                    actionsHtml = `
                        <button class="btn-sm success" onclick="ApprovalsPage.approveItem('${e.sowId || e.id}','estimate')">Approve</button>
                        <button class="btn-sm danger" onclick="ApprovalsPage.rejectItem('${e.sowId || e.id}','estimate')">Reject</button>
                    `;
                }
                html += `
                <div class="approval-request-item" style="cursor:pointer;">
                    <div class="ar-icon">${Icon.ruler({size:16})}</div>
                    <div class="ar-body" onclick="ProjectPage.openSOWBreakdown('${e.sowId || e.id}')">
                        <div class="ar-title">${e.sowId || e.id} — ${e.sowDescription || e.description || '—'}</div>
                        <div class="ar-meta">
                            <span class="ar-id">${e.id}</span>
                            <span>${e.projectId || '—'}</span>
                            <span class="stamp pending" style="transform:none;padding:1px 8px;font-size:9px;">${e.status}</span>
                        </div>
                    </div>
                    <div class="ar-actions">${actionsHtml}</div>
                </div>`;
            });
            html += `</div></div>`;
        }

        // ─── Daily Records Pending Approval ──────────────────────
        html += `<div class="section-head"><h3>Daily Records Pending Approval</h3><div class="rule"></div></div>`;
        if (!data.dailyRecords || data.dailyRecords.length === 0) {
            html += `<div class="empty"><p>No pending daily records.</p></div>`;
        } else {
            html += `<div class="panel"><div style="padding:4px 0;">`;
            data.dailyRecords.forEach(d => {
                let actionsHtml = '';
                if (isSuperAdmin) {
                    actionsHtml = `
                        <button class="btn-sm success" onclick="ApprovalsPage.forceApproveItem('${d.id}','DailyRecord')">Force Approve</button>
                        <button class="btn-sm danger" onclick="ApprovalsPage.forceRejectItem('${d.id}','DailyRecord')">Force Reject</button>
                    `;
                } else if (isApprover) {
                    actionsHtml = `
                        <button class="btn-sm success" onclick="ApprovalsPage.approveDailyRecord('${d.id}')">Approve</button>
                        <button class="btn-sm danger" onclick="ApprovalsPage.rejectDailyRecord('${d.id}')">Reject</button>
                    `;
                }
                html += `
                <div class="approval-request-item" style="cursor:pointer;">
                    <div class="ar-icon">${Icon.clipboardList({size:16})}</div>
                    <div class="ar-body" onclick="ProjectPage.viewRecordById('${d.id}')">
                        <div class="ar-title">Daily Record — ${d.date || 'No date'} (${d.projectId || '—'})</div>
                        <div class="ar-meta">
                            <span class="ar-id">${d.id}</span>
                            <span>${d.weatherAM || ''} / ${d.weatherPM || ''}</span>
                            <span class="stamp pending" style="transform:none;padding:1px 8px;font-size:9px;">Pending</span>
                        </div>
                    </div>
                    <div class="ar-actions">${actionsHtml}</div>
                </div>`;
            });
            html += `</div></div>`;
        }

        return html;
    },

    /**
     * _renderMyRequestsTab - Renders the user's own requests
     */
    _renderMyRequestsTab(requests, statusType) {
        const statusLabel = statusType === 'pending' ? 'Pending' : statusType === 'approved' ? 'Approved' : 'Rejected';
        const statusCls = statusType === 'pending' ? 'pending' : statusType === 'approved' ? 'approved' : 'rejected';

        this._myRequestsById = this._myRequestsById || {};
        requests.forEach(r => { this._myRequestsById[r.id] = r; });
        
        let html = `<div class="section-head"><h3>My ${statusLabel} Requests</h3><div class="rule"></div></div>`;
        if (requests.length === 0) {
            html += `<div class="empty"><p>You have no ${statusLabel.toLowerCase()} requests.</p></div>`;
        } else {
            html += `<div class="panel"><div style="padding:4px 0;">`;
            requests.forEach(r => {
                const icon = r.type === 'Cash Advance' ? Icon.wallet({size:16}) : 
                             r.type === 'Liquidation' ? Icon.receipt({size:16}) : 
                             r.type === 'Estimate' ? Icon.ruler({size:16}) : 
                             r.type === 'Material' ? Icon.package({size:16}) :
                             r.type === 'Equipment' ? Icon.wrench({size:16}) :
                             r.type === 'DailyRecord' ? Icon.clipboardList({size:16}) :
                             r.type === 'Incoming Cash' ? Icon.incoming({size:16}) :
                             Icon.fileText({size:16});
                const clickHandler = `ApprovalsPage.openMyRequestDetail('${r.id}')`;
                html += `
                <div class="my-request-item" onclick="${clickHandler}" style="cursor:pointer;">
                    <div class="mr-icon">${icon}</div>
                    <div class="mr-body">
                        <div class="mr-title">${r.type}: ${r.id} — ${r.projectId || '—'}</div>
                        <div class="mr-meta">
                            <span class="mr-id">${r.id}</span>
                            ${r.amount ? `<span>₱${(r.amount || 0).toFixed(2)}</span>` : ''}
                            ${r.description ? `<span>${r.description}</span>` : ''}
                            <span>${r.date || new Date().toLocaleDateString()}</span>
                            <span class="stamp ${statusCls}" style="transform:none;padding:1px 8px;font-size:9px;">${r.status}</span>
                        </div>
                    </div>
                    <div style="font-size:11px;color:var(--ink-soft);">›</div>
                </div>`;
            });
            html += `</div></div>`;
        }
        return html;
    },

    /**
     * openMyRequestDetail - Routes a "My Requests" click to the correct detail view.
     */
    async openMyRequestDetail(id) {
        const r = this._myRequestsById && this._myRequestsById[id];
        if (!r) { RequestDetailModal.open(id, 'request'); return; }

        try {
            switch (r.type) {
                case 'Material':
                    await MaterialsPage.viewMaterial(r.refId || r.id);
                    break;

                case 'Equipment':
                    await EquipmentPage.viewEquipment(r.refId || r.id);
                    break;

                case 'Estimate': {
                    if (!r.projectId) { UI.toast('Missing project reference for this estimate.', 'error'); return; }
                    const projectData = await DataService.getProjectData(r.projectId);
                    if (!projectData) { UI.toast('Project not found.', 'error'); return; }
                    const group = (projectData.estimates && projectData.estimates.groups || [])
                        .find(g => g.sowId === r.scope);
                    if (!group) { UI.toast('Estimate details not found (it may have changed since this request).', 'error'); return; }
                    SOWBreakdownModal.open(r.scope, {
                        materials: group.materials || [],
                        equipment: group.equipment || [],
                        labor: group.labor || [],
                        indirect: group.indirect || []
                    });
                    break;
                }

                case 'DailyRecord': {
                    if (!r.projectId) { UI.toast('Missing project reference for this daily record.', 'error'); return; }
                    const projectData = await DataService.getProjectData(r.projectId);
                    if (!projectData) { UI.toast('Project not found.', 'error'); return; }
                    const record = (projectData.dailyRecords || []).find(d => d.id === (r.refId || r.id));
                    if (!record) { UI.toast('Daily record not found.', 'error'); return; }
                    PrintModal.open(record);
                    break;
                }

                case 'Incoming Cash': {
                    RequestDetailModal.open(r.id, 'request');
                    break;
                }

                default:
                    RequestDetailModal.open(r.id, 'request');
            }
        } catch (err) {
            console.error('Error opening request detail:', err);
            UI.toast('Error loading details: ' + err.message, 'error');
        }
    },

    /**
     * approveItem - Handle normal approval action (for Approvers/Admins)
     */
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
        } catch (err) { 
            UI.toast('' + err.message, 'error'); 
        }
    },

    /**
     * rejectItem - Handle normal rejection action (for Approvers/Admins)
     */
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
        } catch (err) { 
            UI.toast('' + err.message, 'error'); 
        }
    },

    /**
     * forceApproveItem - Super Admin force approve any item
     */
    async forceApproveItem(id, type, closeModal = false) {
        const confirmed = await Confirm.open('Force Approve?', 
            `As Super Admin, you are about to FORCE APPROVE ${id}. This will bypass all other approvers. Continue?`);
        if (!confirmed) return;
        try {
            await DataService.forceApprove(id, type);
            UI.toast(`${id} force-approved!`, 'success');
            if (closeModal) RequestDetailModal.close();
            this.load();
            HomePage.load();
        } catch (err) {
            UI.toast('' + err.message, 'error');
        }
    },

    /**
     * forceRejectItem - Super Admin force reject any item
     */
    async forceRejectItem(id, type, closeModal = false) {
        const confirmed = await Confirm.open('Force Reject?', 
            `As Super Admin, you are about to FORCE REJECT ${id}. This will bypass all other approvers. Continue?`);
        if (!confirmed) return;
        try {
            await DataService.forceReject(id, type);
            UI.toast(`${id} force-rejected.`, 'error');
            if (closeModal) RequestDetailModal.close();
            this.load();
            HomePage.load();
        } catch (err) {
            UI.toast('' + err.message, 'error');
        }
    },

    /**
     * approveDailyRecord - Approve a daily record (for Approvers/Admins)
     */
    async approveDailyRecord(id) {
        const confirmed = await Confirm.open('Approve Daily Record?', 'Approve this daily record?');
        if (!confirmed) return;
        try {
            await DataService.approveDailyRecord(id);
            UI.toast('Daily record approved.', 'success');
            this.load();
            HomePage.load();
        } catch (err) {
            UI.toast('' + err.message, 'error');
        }
    },

    /**
     * rejectDailyRecord - Reject a daily record (for Approvers/Admins)
     */
    async rejectDailyRecord(id) {
        const confirmed = await Confirm.open('Reject Daily Record?', 'Reject this daily record?');
        if (!confirmed) return;
        try {
            await DataService.rejectDailyRecord(id);
            UI.toast('Daily record rejected.', 'error');
            this.load();
            HomePage.load();
        } catch (err) {
            UI.toast('' + err.message, 'error');
        }
    }
};
