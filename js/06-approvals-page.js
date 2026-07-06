// ================================================================
//  APPROVALS PAGE - Complete with fixes for Issues 3.1-3.10
//  FIX: Added daily records to pending approvals
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
        const isApprover = App.isApprover();
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
            ${!isRequestor && isApprover && data.status === 'Pending' ? `
                <button class="btn-sm success" onclick="ApprovalsPage.approveItem('${data.id}','request', true)">Approve</button>
                <button class="btn-sm danger" onclick="ApprovalsPage.rejectItem('${data.id}','request', true)">Reject</button>
            ` : ''}
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
            const isApprover = App.isApprover();

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
            // Daily records: filter out self-submitted
            const filteredDailyRecords = pendingData.dailyRecords ? pendingData.dailyRecords.filter(function(d) {
                return d.createdBy && d.createdBy.toLowerCase() !== userEmail;
            }) : [];

            const totalPending = filteredRequests.length + filteredMaterials.length +
                filteredEquipment.length + (pendingData.estimates ? pendingData.estimates.length : 0) +
                filteredDailyRecords.length;

            let html = `
            <div class="section-head"><h2>Approval Dashboard</h2><div class="rule"></div>
                <span class="badge">${isApprover ? totalPending + ' pending' : myRequests.length + ' my requests'}</span>
            </div>

            <div class="approval-tab-bar">
                ${isApprover ? `<button class="active" data-tab="pending" onclick="ApprovalsPage.switchTab('pending')">${Icon.clipboardList({size:14})} My Pending Approvals (${totalPending})</button>` : ''}
                <button ${!isApprover ? 'class="active"' : ''} data-tab="myrequests" onclick="ApprovalsPage.switchTab('myrequests')">${Icon.user({size:14})} My Pending Requests (${myRequests.length})</button>
                <button data-tab="approved" onclick="ApprovalsPage.switchTab('approved')">${Icon.checkCircle({size:14})} My Approved Requests (${myApproved.length})</button>
                <button data-tab="rejected" onclick="ApprovalsPage.switchTab('rejected')">${Icon.xCircle({size:14})} My Rejected Requests (${myRejected.length})</button>
            </div>

            ${isApprover ? `<div id="approval-tab-pending" class="approval-tab-content active">${this._renderPendingTab({requests: filteredRequests, materials: filteredMaterials, equipment: filteredEquipment, estimates: pendingData.estimates || [], dailyRecords: filteredDailyRecords})}</div>` : ''}
            <div id="approval-tab-myrequests" class="approval-tab-content ${!isApprover ? 'active' : ''}">${this._renderMyRequestsTab(myRequests, 'pending')}</div>
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
     * FIX: Added daily records section
     */
    _renderPendingTab(data) {
        let html = `<div class="section-head"><h3>Cash Advance Requests</h3><div class="rule"></div></div>`;
        if (data.requests.length === 0) {
            html += `<div class="empty"><p>No pending cash advance requests.</p></div>`;
        } else {
            html += `<div class="panel"><div style="padding:4px 0;">`;
            data.requests.forEach(r => {
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
                    <div class="ar-actions">
                        <button class="btn-sm success" onclick="ApprovalsPage.approveItem('${r.id}','request')">Approve</button>
                        <button class="btn-sm danger" onclick="ApprovalsPage.rejectItem('${r.id}','request')">Reject</button>
                    </div>
                </div>`;
            });
            html += `</div></div>`;
        }

        html += `<div class="section-head"><h3>Materials Pending Approval</h3><div class="rule"></div></div>`;
        if (data.materials.length === 0) {
            html += `<div class="empty"><p>No pending materials.</p></div>`;
        } else {
            html += `<div class="panel"><div style="padding:4px 0;">`;
            data.materials.forEach(m => {
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
                    <div class="ar-actions">
                        <button class="btn-sm success" onclick="ApprovalsPage.approveItem('${m.id}','material')">Approve</button>
                        <button class="btn-sm danger" onclick="ApprovalsPage.rejectItem('${m.id}','material')">Reject</button>
                    </div>
                </div>`;
            });
            html += `</div></div>`;
        }

        html += `<div class="section-head"><h3>Equipment Pending Approval</h3><div class="rule"></div></div>`;
        if (data.equipment.length === 0) {
            html += `<div class="empty"><p>No pending equipment.</p></div>`;
        } else {
            html += `<div class="panel"><div style="padding:4px 0;">`;
            data.equipment.forEach(e => {
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
                    <div class="ar-actions">
                        <button class="btn-sm success" onclick="ApprovalsPage.approveItem('${e.id}','equipment')">Approve</button>
                        <button class="btn-sm danger" onclick="ApprovalsPage.rejectItem('${e.id}','equipment')">Reject</button>
                    </div>
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
                    <div class="ar-actions">
                        <button class="btn-sm success" onclick="ApprovalsPage.approveItem('${e.sowId || e.id}','estimate')">Approve</button>
                        <button class="btn-sm danger" onclick="ApprovalsPage.rejectItem('${e.sowId || e.id}','estimate')">Reject</button>
                    </div>
                </div>`;
            });
            html += `</div></div>`;
        }

        // DAILY RECORDS - NEW SECTION
        html += `<div class="section-head"><h3>Daily Records Pending Approval</h3><div class="rule"></div></div>`;
        if (!data.dailyRecords || data.dailyRecords.length === 0) {
            html += `<div class="empty"><p>No pending daily records.</p></div>`;
        } else {
            html += `<div class="panel"><div style="padding:4px 0;">`;
            data.dailyRecords.forEach(d => {
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
                    <div class="ar-actions">
                        <button class="btn-sm success" onclick="ApprovalsPage.approveDailyRecord('${d.id}')">Approve</button>
                        <button class="btn-sm danger" onclick="ApprovalsPage.rejectDailyRecord('${d.id}')">Reject</button>
                    </div>
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
        
        let html = `<div class="section-head"><h3>My ${statusLabel} Requests</h3><div class="rule"></div></div>`;
        if (requests.length === 0) {
            html += `<div class="empty"><p>You have no ${statusLabel.toLowerCase()} requests.</p></div>`;
        } else {
            html += `<div class="panel"><div style="padding:4px 0;">`;
            requests.forEach(r => {
                const icon = r.type === 'Cash Advance' ? Icon.wallet({size:16}) : 
                             r.type === 'Liquidation' ? Icon.receipt({size:16}) : 
                             r.type === 'Estimate' ? Icon.ruler({size:16}) : 
                             Icon.fileText({size:16});
                const clickHandler = `RequestDetailModal.open('${r.id}','request')`;
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
     * approveItem - Handle approval action
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
     * rejectItem - Handle rejection action
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
     * approveDailyRecord - Approve a daily record
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
     * rejectDailyRecord - Reject a daily record
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
