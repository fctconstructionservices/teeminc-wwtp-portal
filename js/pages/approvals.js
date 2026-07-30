// ================================================================
//  pages/approvals.js — Approvals inbox + My Requests
//
//  PURPOSE: The approval center. Tabs for pending cash advances,
//  cash releases in review (admins), liquidations, materials,
//  equipment, daily records and estimates; the request detail
//  modal; and the requester's own Pending/Approved/Rejected lists.
// ================================================================

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
                    const pending = await DataService.getPendingApprovals(true);
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
        // v4: only ADMIN role approves in the normal flow; super admin
        // force-decides only and is not counted among approvers.
        const isApprover = user && user.role === 'admin';
        // v9.2: cash types carry requestorEmail; DB/OT types carry
        // requestedBy — check both so the requester never sees Approve
        // buttons on their own request (server rejects it anyway).
        const submitterEmail = data.requestorEmail || data.requestedBy || data.submittedBy || data.createdBy || '';
        const isRequestor = user && submitterEmail &&
            user.email.toLowerCase() === String(submitterEmail).toLowerCase();
        const statusCls = data.status === 'Approved' ? 'approved' : data.status === 'Pending' ? 'pending' : data.status === 'Reviewing' ? 'pending' : 'rejected';
        
        // v10: real thumbnails + lightbox instead of text links, so an
        // approver can read the receipt without leaving the modal. Falls
        // back to attachmentsJSON when the backend has not parsed it.
        const attachmentsHtml = AttachmentGallery.render(
            (data.attachments && data.attachments.length) ? data.attachments : data.attachmentsJSON,
            'Attachments'
        );
        
        let actionButtons = '';
        if (data.status === 'Pending') {
            if (isSuperAdmin) {
                actionButtons = `
                    <button class="btn-sm success" onclick="ApprovalsPage.forceApproveItem('${data.id}','${data.type}', true)">Force Approve</button>
                    <button class="btn-sm danger" onclick="ApprovalsPage.forceRejectItem('${data.id}','${data.type}', true)">Force Reject</button>
                `;
            } else if (isApprover && !isRequestor) {
                actionButtons = `
                    <button class="btn-sm success" onclick="ApprovalsPage.approveItem('${data.id}','${data.type}', true)">Approve</button>
                    <button class="btn-sm danger" onclick="ApprovalsPage.rejectItem('${data.id}','${data.type}', true)">Reject</button>
                `;
            }
        }
        
        // v9.2: the detail grid mirrors the fields of the FORM that
        // created the request. OT requests get their own layout (OT
        // Date / Start / End / Affected SOW / Reason) instead of the
        // cash-request fields (requestor/amount) that rendered as
        // "undefined" for them.
        let detailsHtml;
        if (data.type === 'OTRequest') {
            const sowIds = Array.isArray(data.sowIds) && data.sowIds.length
                ? data.sowIds
                : (function () { try { return JSON.parse(data.sowIdsJSON || '[]'); } catch (e) { return []; } })();
            detailsHtml = `
            <div class="print-section"><div class="ps-title">${Icon.timer({size:13})} Overtime Request Details</div>
                <div class="detail-grid">
                    <div class="dg-item"><span class="dg-label">Requested By</span><span class="dg-value">${data.requestedBy || '—'}</span></div>
                    <div class="dg-item"><span class="dg-label">Project</span><span class="dg-value">${data.projectId || '—'}</span></div>
                    <div class="dg-item"><span class="dg-label">OT Date</span><span class="dg-value">${data.otDate || '—'}</span></div>
                    <div class="dg-item"><span class="dg-label">OT Time</span><span class="dg-value">${data.otStart || '—'} – ${data.otEnd || '—'}</span></div>
                    <div class="dg-item full"><span class="dg-label">Affected SOW</span><span class="dg-value">${sowIds.length ? sowIds.join(', ') : '—'}</span></div>
                    <div class="dg-item full"><span class="dg-label">Reason for OT</span><span class="dg-value">${data.reason || '—'}</span></div>
                </div>
                ${attachmentsHtml}
                <div class="data-source-note" style="margin-top:10px;">Once all admins approve, the OT in and out fields open on the Daily Site Record for ${data.otDate || 'this date'} on this project.</div>
            </div>`;
        } else {
            detailsHtml = `
            <div class="print-section"><div class="ps-title">Request Details</div>
                <div class="detail-grid">
                    <div class="dg-item"><span class="dg-label">Requestor</span><span class="dg-value">${data.requestor || data.requestedBy || data.submittedBy || '—'}</span></div>
                    <div class="dg-item"><span class="dg-label">Project</span><span class="dg-value">${data.project || data.projectId || '—'}</span></div>
                    <div class="dg-item"><span class="dg-label">Amount</span><span class="dg-value">₱${fmtMoney((data.amount || 0))}</span></div>
                    <div class="dg-item"><span class="dg-label">Scope of Work</span><span class="dg-value">${data.scope || '—'}</span></div>
                    <div class="dg-item full"><span class="dg-label">Description</span><span class="dg-value">${data.description || '—'}</span></div>
                </div>
                ${attachmentsHtml}
            </div>`;
        }

        let html = `
        <div class="print-header">
            <h2>${data.id} — ${data.type === 'OTRequest' ? 'Overtime Request' : (data.type || 'Request')}</h2>
            <div class="print-meta">${data.createdAt || new Date().toLocaleDateString()} · <span class="stamp ${statusCls}">${data.status}</span></div>
        </div>
        ${detailsHtml}
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
    _myRequestsById: {},

    async load() {
        const container = document.getElementById('approvalsContent');
        UI.showLoading(container);
        try {
            const user = App.currentUser;
            const isSuperAdmin = user && user.role === 'superadmin';
            const isAdmin = user && user.role === 'admin';
            const isApprover = App.isApprover() && !isSuperAdmin && !isAdmin;

            const pendingData = await DataService.getPendingApprovals(true);   // v9.3: always fresh on this page
            const myRequests = await DataService.getMyPendingRequests();
            const myApproved = await DataService.getMyApprovedRequests ? await DataService.getMyApprovedRequests() : [];
            const myRejected = await DataService.getMyRejectedRequests ? await DataService.getMyRejectedRequests() : [];

            const userEmail = user ? user.email.toLowerCase() : '';
            
            const cashAdvances = pendingData.cashAdvances || [];
            const releases = pendingData.releases || [];
            const incomingCash = pendingData.incomingCash || [];   // v3
            const liquidations = pendingData.liquidations || [];
            const materials = pendingData.materials || [];
            const equipment = pendingData.equipment || [];
            const manpower = pendingData.manpower || [];           // v3
            const estimates = pendingData.estimates || [];
            const dailyRecords = pendingData.dailyRecords || [];
            const otRequests = pendingData.otRequests || [];          // v9

            const filteredCashAdvances = cashAdvances.filter(function(r) {
                return r.requestorEmail && r.requestorEmail.toLowerCase() !== userEmail;
            });

            const filteredReleases = releases.filter(function(r) {
                return r.releasedBy && r.releasedBy.toLowerCase() !== userEmail;
            });

            const filteredLiquidations = liquidations.filter(function(l) {
                return l.requestorEmail && l.requestorEmail.toLowerCase() !== userEmail;
            });

            const filteredMaterials = materials.filter(function(m) {
                return m.requestedBy && m.requestedBy.toLowerCase() !== userEmail;
            });

            const filteredEquipment = equipment.filter(function(e) {
                return e.requestedBy && e.requestedBy.toLowerCase() !== userEmail;
            });

            const filteredDailyRecords = dailyRecords.filter(function(d) {
                return d.createdBy && d.createdBy.toLowerCase() !== userEmail;
            });

            // v3: incoming cash + manpower join the inbox
            const filteredIncomingCash = incomingCash.filter(function(r) {
                return r.requestorEmail && r.requestorEmail.toLowerCase() !== userEmail;
            });
            const filteredManpower = manpower.filter(function(m) {
                return m.requestedBy && m.requestedBy.toLowerCase() !== userEmail;
            });

            const totalPending = filteredCashAdvances.length + filteredReleases.length + 
                                filteredIncomingCash.length + filteredLiquidations.length +
                                filteredMaterials.length + filteredEquipment.length +
                                filteredManpower.length + estimates.length + filteredDailyRecords.length + otRequests.length;

            let html = `
            <div class="section-head"><h2>Approval Dashboard</h2><div class="rule"></div>
                <span class="badge">${(isAdmin || isSuperAdmin) ? totalPending + ' pending' : myRequests.length + ' my requests'}</span>
            </div>

            <div class="approval-tab-bar">
                ${(isAdmin || isSuperAdmin) ? `<button class="active" data-tab="pending" onclick="ApprovalsPage.switchTab('pending')">${Icon.clipboardList({size:14})} Pending Approvals (${filteredCashAdvances.length + filteredIncomingCash.length + filteredLiquidations.length + filteredMaterials.length + filteredEquipment.length + filteredManpower.length + estimates.length + filteredDailyRecords.length + otRequests.length})</button>` : ''}
                ${(isAdmin && !isSuperAdmin) ? `<button data-tab="reviewing" onclick="ApprovalsPage.switchTab('reviewing')">${Icon.clipboardList({size:14})} For Review (${filteredReleases.length})</button>` : ''}
                <button ${!(isAdmin || isSuperAdmin) ? 'class="active"' : ''} data-tab="myrequests" onclick="ApprovalsPage.switchTab('myrequests')">${Icon.user({size:14})} My Requests (${myRequests.length})</button>
                <button data-tab="approved" onclick="ApprovalsPage.switchTab('approved')">${Icon.checkCircle({size:14})} Approved (${myApproved.length})</button>
                <button data-tab="rejected" onclick="ApprovalsPage.switchTab('rejected')">${Icon.xCircle({size:14})} Rejected (${myRejected.length})</button>
            </div>

            ${(isAdmin || isSuperAdmin) ? `<div id="approval-tab-pending" class="approval-tab-content active">${this._renderPendingTab({cashAdvances: filteredCashAdvances, incomingCash: filteredIncomingCash, liquidations: filteredLiquidations, materials: filteredMaterials, equipment: filteredEquipment, manpower: filteredManpower, estimates: estimates, dailyRecords: filteredDailyRecords, otRequests: otRequests})}</div>` : ''}
            ${(isAdmin && !isSuperAdmin) ? `<div id="approval-tab-reviewing" class="approval-tab-content">${this._renderReviewingTab(filteredReleases)}</div>` : ''}
            <div id="approval-tab-myrequests" class="approval-tab-content ${!(isAdmin || isSuperAdmin) ? 'active' : ''}">${this._renderMyRequestsTab(myRequests, 'pending')}</div>
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

    _renderPendingTab(data) {
        const user = App.currentUser;
        const isSuperAdmin = user && user.role === 'superadmin';
        // v4: normal Approve/Reject is admin-role only; super admin sees Force only.
        const isApprover = user && user.role === 'admin';

        let html = '';

        // ─── Cash Advance Requests ──────────────────────────────
        html += `<div class="section-head"><h3>Cash Advance Requests</h3><div class="rule"></div></div>`;
        if (data.cashAdvances.length === 0) {
            html += `<div class="empty"><p>No pending cash advance requests.</p></div>`;
        } else {
            html += `<div class="panel"><div style="padding:4px 0;">`;
            data.cashAdvances.forEach(r => {
                let actionsHtml = '';
                if (isSuperAdmin) {
                    actionsHtml = `
                        <button class="btn-sm success" onclick="ApprovalsPage.forceApproveItem('${r.id}','CashAdvance')">Force Approve</button>
                        <button class="btn-sm danger" onclick="ApprovalsPage.forceRejectItem('${r.id}','CashAdvance')">Force Reject</button>
                    `;
                } else if (isApprover) {
                    actionsHtml = `
                        <button class="btn-sm success" onclick="ApprovalsPage.approveItem('${r.id}','CashAdvance')">Approve</button>
                        <button class="btn-sm danger" onclick="ApprovalsPage.rejectItem('${r.id}','CashAdvance')">Reject</button>
                    `;
                }
                html += `
                <div class="approval-request-item" style="cursor:pointer;">
                    <div class="ar-icon">${Icon.wallet({size:16})}</div>
                    <div class="ar-body" onclick="RequestDetailModal.open('${r.id}','request')">
                        <div class="ar-title">${r.requestor} — ${r.projectId || '—'}</div>
                        <div class="ar-meta">
                            <span class="ar-id">${r.id}</span>
                            <span>₱${fmtMoney((r.amount || 0))}</span>
                            <span>${r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ''}</span>
                            <span class="stamp pending" style="transform:none;padding:1px 8px;font-size:9px;">${r.status}</span>
                        </div>
                    </div>
                    <div class="ar-actions">${actionsHtml}</div>
                </div>`;
            });
            html += `</div></div>`;
        }

        // ─── Incoming Cash Requests (v3) ────────────────────────
        html += `<div class="section-head"><h3>Incoming Cash Requests</h3><div class="rule"></div></div>`;
        if (!data.incomingCash || data.incomingCash.length === 0) {
            html += `<div class="empty"><p>No pending incoming cash requests.</p></div>`;
        } else {
            html += `<div class="panel"><div style="padding:4px 0;">`;
            data.incomingCash.forEach(r => {
                let actionsHtml = '';
                if (isSuperAdmin) {
                    actionsHtml = `
                        <button class="btn-sm success" onclick="ApprovalsPage.forceApproveItem('${r.id}','IncomingCash')">Force Approve</button>
                        <button class="btn-sm danger" onclick="ApprovalsPage.forceRejectItem('${r.id}','IncomingCash')">Force Reject</button>
                    `;
                } else if (isApprover) {
                    actionsHtml = `
                        <button class="btn-sm success" onclick="ApprovalsPage.approveItem('${r.id}','IncomingCash')">Approve</button>
                        <button class="btn-sm danger" onclick="ApprovalsPage.rejectItem('${r.id}','IncomingCash')">Reject</button>
                    `;
                }
                html += `
                <div class="approval-request-item" style="cursor:pointer;">
                    <div class="ar-icon">${Icon.incoming ? Icon.incoming({size:16}) : Icon.wallet({size:16})}</div>
                    <div class="ar-body" onclick="RequestDetailModal.open('${r.id}','request')">
                        <div class="ar-title">${r.requestor} — ${r.projectId || '—'}</div>
                        <div class="ar-meta">
                            <span class="ar-id">${r.id}</span>
                            <span>₱${fmtMoney((parseFloat(r.amount) || 0))}</span>
                            <span>${r.paymentMethod || ''}${r.reference ? ' · ' + r.reference : ''}</span>
                            <span>${r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ''}</span>
                            <span class="stamp pending" style="transform:none;padding:1px 8px;font-size:9px;">${r.status}</span>
                        </div>
                    </div>
                    <div class="ar-actions">${actionsHtml}</div>
                </div>`;
            });
            html += `</div></div>`;
        }

        // ─── Liquidation Requests ──────────────────────────────
        html += `<div class="section-head"><h3>Liquidation Requests</h3><div class="rule"></div></div>`;
        if (data.liquidations.length === 0) {
            html += `<div class="empty"><p>No pending liquidation requests.</p></div>`;
        } else {
            html += `<div class="panel"><div style="padding:4px 0;">`;
            data.liquidations.forEach(r => {
                let actionsHtml = '';
                if (isSuperAdmin) {
                    actionsHtml = `
                        <button class="btn-sm success" onclick="ApprovalsPage.forceApproveItem('${r.id}','Liquidation')">Force Approve</button>
                        <button class="btn-sm danger" onclick="ApprovalsPage.forceRejectItem('${r.id}','Liquidation')">Force Reject</button>
                    `;
                } else if (isApprover) {
                    actionsHtml = `
                        <button class="btn-sm success" onclick="ApprovalsPage.approveItem('${r.id}','Liquidation')">Approve</button>
                        <button class="btn-sm danger" onclick="ApprovalsPage.rejectItem('${r.id}','Liquidation')">Reject</button>
                    `;
                }
                html += `
                <div class="approval-request-item" style="cursor:pointer;">
                    <div class="ar-icon">${Icon.receipt({size:16})}</div>
                    <div class="ar-body" onclick="RequestDetailModal.open('${r.id}','request')">
                        <div class="ar-title">${r.requestor} — ${r.projectId || '—'}</div>
                        <div class="ar-meta">
                            <span class="ar-id">${r.id}</span>
                            <span>₱${fmtMoney((r.amount || 0))}</span>
                            <span>${r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ''}</span>
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
                        <button class="btn-sm success" onclick="ApprovalsPage.approveItem('${m.id}','Material')">Approve</button>
                        <button class="btn-sm danger" onclick="ApprovalsPage.rejectItem('${m.id}','Material')">Reject</button>
                    `;
                }
                html += `
                <div class="approval-request-item" style="cursor:pointer;">
                    <div class="ar-icon">${Icon.package({size:16})}</div>
                    <div class="ar-body" onclick="MaterialsPage.viewMaterial('${m.id}')">
                        <div class="ar-title">${m.name || m.brand || 'Unnamed'}</div>
                        <div class="ar-meta">
                            <span class="ar-id">${m.id}</span>
                            ${m.brand ? `<span>${m.brand}</span>` : ''}
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
                        <button class="btn-sm success" onclick="ApprovalsPage.approveItem('${e.id}','Equipment')">Approve</button>
                        <button class="btn-sm danger" onclick="ApprovalsPage.rejectItem('${e.id}','Equipment')">Reject</button>
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

        // ─── v9: Overtime Requests Pending Approval ────────────
        html += `<div class="section-head"><h3>Overtime Requests Pending Approval</h3><div class="rule"></div></div>`;
        if (!data.otRequests || data.otRequests.length === 0) {
            html += `<div class="empty"><p>No pending OT requests.</p></div>`;
        } else {
            html += `<div class="panel"><div style="padding:4px 0;">`;
            data.otRequests.forEach(o => {
                let actionsHtml = '';
                if (isSuperAdmin) {
                    actionsHtml = `
                        <button class="btn-sm success" onclick="ApprovalsPage.forceApproveItem('${o.id}','OTRequest')">Force Approve</button>
                        <button class="btn-sm danger" onclick="ApprovalsPage.forceRejectItem('${o.id}','OTRequest')">Force Reject</button>
                    `;
                } else if (isApprover) {
                    actionsHtml = `
                        <button class="btn-sm success" onclick="ApprovalsPage.approveItem('${o.id}','OTRequest')">Approve</button>
                        <button class="btn-sm danger" onclick="ApprovalsPage.rejectItem('${o.id}','OTRequest')">Reject</button>
                    `;
                }
                html += `
                <div class="approval-request-item" style="cursor:pointer;">
                    <div class="ar-icon">${Icon.timer({size:13})}</div>
                    <div class="ar-body" onclick="RequestDetailModal.open('${o.id}','request')">
                        <div class="ar-title">OT ${o.otDate || ''} · ${o.otStart || '?'}–${o.otEnd || '?'} (${o.projectId || '—'})</div>
                        <div class="ar-meta">
                            <span class="ar-id">${o.id}</span>
                            <span>SOW: ${(o.sowIds || []).join(', ') || '—'}</span>
                            <span>${o.reason || ''}</span>
                            <span>Requested by ${o.requestedBy || '—'}</span>
                            <span class="stamp pending" style="transform:none;padding:1px 8px;font-size:9px;">${o.status}</span>
                        </div>
                    </div>
                    <div class="ar-actions">${actionsHtml}</div>
                </div>`;
            });
            html += `</div></div>`;
        }

        // ─── Manpower Roles Pending Approval (v3) ───────────────
        html += `<div class="section-head"><h3>Manpower Roles Pending Approval</h3><div class="rule"></div></div>`;
        if (!data.manpower || data.manpower.length === 0) {
            html += `<div class="empty"><p>No pending manpower roles.</p></div>`;
        } else {
            html += `<div class="panel"><div style="padding:4px 0;">`;
            data.manpower.forEach(m => {
                let actionsHtml = '';
                if (isSuperAdmin) {
                    actionsHtml = `
                        <button class="btn-sm success" onclick="ApprovalsPage.forceApproveItem('${m.id}','Manpower')">Force Approve</button>
                        <button class="btn-sm danger" onclick="ApprovalsPage.forceRejectItem('${m.id}','Manpower')">Force Reject</button>
                    `;
                } else if (isApprover) {
                    actionsHtml = `
                        <button class="btn-sm success" onclick="ApprovalsPage.approveItem('${m.id}','Manpower')">Approve</button>
                        <button class="btn-sm danger" onclick="ApprovalsPage.rejectItem('${m.id}','Manpower')">Reject</button>
                    `;
                }
                html += `
                <div class="approval-request-item">
                    <div class="ar-icon">${Icon.users({size:16})}</div>
                    <div class="ar-body">
                        <div class="ar-title">${m.role}${m.classification ? ' (' + m.classification + ')' : ''}</div>
                        <div class="ar-meta">
                            <span class="ar-id">${m.id}</span>
                            <span>Requested by ${m.requestedBy || '—'}</span>
                            <span>${m.createdAt ? new Date(m.createdAt).toLocaleDateString() : ''}</span>
                            <span class="stamp pending" style="transform:none;padding:1px 8px;font-size:9px;">${m.status}</span>
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
                        <button class="btn-sm success" onclick="ApprovalsPage.approveItem('${e.id}','Estimate')">Approve</button>
                        <button class="btn-sm danger" onclick="ApprovalsPage.rejectItem('${e.id}','Estimate')">Reject</button>
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
        if (data.dailyRecords.length === 0) {
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
                        <button class="btn-sm success" onclick="ApprovalsPage.approveItem('${d.id}','DailyRecord')">Approve</button>
                        <button class="btn-sm danger" onclick="ApprovalsPage.rejectItem('${d.id}','DailyRecord')">Reject</button>
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

    _renderReviewingTab(reviews) {
        const user = App.currentUser;
        const userEmail = user ? user.email.toLowerCase() : '';
        
        let html = `<div class="section-head"><h3>Cash Release Requests for Review</h3><div class="rule"></div></div>`;
        if (reviews.length === 0) {
            html += `<div class="empty"><p>No release requests awaiting review.</p></div>`;
            return html;
        }
        html += `<div class="panel"><div style="padding:4px 0;">`;
        reviews.forEach(function(r) {
            const isSelf = r.releasedBy && r.releasedBy.toLowerCase() === userEmail;
            const isAdmin = user && user.role === 'admin';
            const canReview = isAdmin && !isSelf;
            let actionsHtml = '';
            if (canReview) {
                actionsHtml = `
                    <button class="btn-sm success" onclick="ApprovalsPage.reviewRelease('${r.id}')">Reviewed</button>
                `;
            } else if (isSelf) {
                actionsHtml = `<span style="font-size:10px;color:var(--ink-soft);">You cannot review your own request.</span>`;
            } else {
                actionsHtml = `<span style="font-size:10px;color:var(--ink-soft);">Waiting for Admin review</span>`;
            }
            html += `
                <div class="approval-request-item" style="cursor:pointer;">
                    <div class="ar-icon">${Icon.outgoing({size:16})}</div>
                    <div class="ar-body" onclick="RequestDetailModal.open('${r.id}','request')">
                        <div class="ar-title">Release Cash — ${r.requestor} (${r.projectId || '—'})</div>
                        <div class="ar-meta">
                            <span class="ar-id">${r.id}</span>
                            <span>₱${fmtMoney((r.amount || 0))}</span>
                            <span class="stamp pending" style="transform:none;padding:1px 8px;font-size:9px;">${r.status}</span>
                        </div>
                    </div>
                    <div class="ar-actions">${actionsHtml}</div>
                </div>`;
        });
        html += `</div></div>`;
        return html;
    },

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
                const icon = r.type === 'CashAdvance' ? Icon.wallet({size:16}) : 
                             r.type === 'Liquidation' ? Icon.receipt({size:16}) : 
                             r.type === 'Estimate' ? Icon.ruler({size:16}) : 
                             r.type === 'Material' ? Icon.package({size:16}) :
                             r.type === 'Equipment' ? Icon.wrench({size:16}) :
                             r.type === 'DailyRecord' ? Icon.clipboardList({size:16}) :
                             r.type === 'IncomingCash' ? Icon.incoming({size:16}) :
                             Icon.fileText({size:16});
                const clickHandler = `ApprovalsPage.openMyRequestDetail('${r.id}')`;
                html += `
                <div class="my-request-item" onclick="${clickHandler}" style="cursor:pointer;">
                    <div class="mr-icon">${icon}</div>
                    <div class="mr-body">
                        <div class="mr-title">${r.type}: ${r.id} — ${r.projectId || '—'}</div>
                        <div class="mr-meta">
                            <span class="mr-id">${r.id}</span>
                            ${r.amount ? `<span>₱${fmtMoney((r.amount || 0))}</span>` : ''}
                            ${r.description ? `<span>${r.description}</span>` : ''}
                            ${r.type === 'OTRequest' ? `<span>OT ${r.otDate || ''} ${r.otStart || ''}–${r.otEnd || ''} · ${r.reason || ''}</span>` : ''}
                            <span>${r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ''}</span>
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
                    if (!group) { UI.toast('Estimate details not found.', 'error'); return; }
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

                case 'IncomingCash':
                case 'CashAdvance':
                case 'CashRelease':
                case 'Liquidation':
                default:
                    RequestDetailModal.open(r.id, 'request');
            }
        } catch (err) {
            console.error('Error opening request detail:', err);
            UI.toast('Error loading details: ' + err.message, 'error');
        }
    },

    async approveItem(id, type, closeModal = false) {
        const confirmed = await Confirm.open('Approve Item?', `Approve ${id}?`);
        if (!confirmed) return;
        try {
            const result = await DataService.approveItemGeneric(id, type);
            // v5: multi-sig — your signature may not be the last one needed
            if (result && result.awaiting) {
                UI.toast(`${id}: your approval is recorded — awaiting the other admins.`, 'success');
            } else {
                UI.toast(`${id} approved!`, 'success');
            }
            if (closeModal) RequestDetailModal.close();
            this.load();
            HomePage.load();
        } catch (err) { 
            UI.toast('' + err.message, 'error'); 
        }
    },

    async rejectItem(id, type, closeModal = false) {
        const confirmed = await Confirm.open('Reject Item?', `Reject ${id}?`);
        if (!confirmed) return;
        try {
            await DataService.rejectItemGeneric(id, type);
            UI.toast(`${id} rejected.`, 'error');
            if (closeModal) RequestDetailModal.close();
            this.load();
            HomePage.load();
        } catch (err) { 
            UI.toast('' + err.message, 'error'); 
        }
    },

    async forceApproveItem(id, type, closeModal = false) {
        const confirmed = await Confirm.open('Force Approve?', `Force approve ${id}?`);
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

    async forceRejectItem(id, type, closeModal = false) {
        const confirmed = await Confirm.open('Force Reject?', `Force reject ${id}?`);
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

    // ─── RELEASE CASH REVIEW ────────────────────────────────────
    async reviewRelease(id) {
        const confirmed = await Confirm.open('Mark as Reviewed?', 'Confirm that you have reviewed this release request?');
        if (!confirmed) return;
        try {
            const user = App.currentUser;
            await DataService.reviewRelease(id, user.email);
            UI.toast('Release request reviewed!', 'success');
            this.load();
            if (typeof HomePage !== 'undefined' && HomePage.load) {
                HomePage.load();
            }
        } catch (err) {
            UI.toast('' + err.message, 'error');
        }
    }
};