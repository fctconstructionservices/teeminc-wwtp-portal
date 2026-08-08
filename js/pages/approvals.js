// ================================================================
//  pages/approvals.js — Approvals inbox + My Requests
//
//  PURPOSE: The approval center. Tabs for pending cash advances,
//  cash releases in review (admins), liquidations, materials,
//  equipment, manpower, OT, estimates, billings and daily records;
//  the request detail modal; and the requester's own Pending /
//  Approved / Rejected lists.
//
//  ── v11 BATCH A REWRITE ──────────────────────────────────────
//  THE "NOT FOUND" BUG. Clicking a pending item used to hand off to
//  whichever PAGE owned that record type:
//      estimates    -> ProjectPage.openSOWBreakdown()
//      daily records-> ProjectPage.viewRecordById()
//      materials    -> MaterialsPage.viewMaterial()
//      equipment    -> EquipmentPage.viewEquipment()
//      manpower     -> (no handler at all)
//  Every one of those reads a cache that page fills when YOU OPEN IT.
//  From the Approvals page those caches are empty, so the handler hit
//  its "not found" branch and closed the modal. On top of that, the
//  fallback inside _loadDetails() read `pending.requests`, a key
//  getPendingApprovals() has never returned, which threw a TypeError.
//
//  FIX: the inbox no longer delegates to other pages. Every row opens
//  RequestDetailModal, which fetches its own record from the server via
//  getRequestById() and renders a layout per type. It is now
//  self-contained and works from a cold page load.
//
//  The nine near-identical section blocks in _renderPendingTab() were
//  also collapsed into one data-driven renderer (SECTIONS below), so a
//  new approvable type is a few lines instead of forty.
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
            // v11: single source of truth. getRequestById() now covers
            // every approvable type including Estimates and Billings,
            // which it previously did not, so the old broken fallback
            // (pending.requests — a key that does not exist) is gone.
            const data = await DataService.getRequestById(id);
            if (!data) {
                UI.toast(`Request ${id} could not be found on the server.`, 'error');
                this.close();
                return;
            }
            body.innerHTML = this._renderDetails(data);
        } catch (err) {
            console.error('RequestDetailModal load error:', err);
            UI.toast('Error loading details: ' + (err.message || err), 'error');
            this.close();
        }
    },

    /** Human label for a type code. */
    _typeLabel(t) {
        return ({
            CashAdvance: 'Cash Advance Request',
            CashRelease: 'Cash Release',
            IncomingCash: 'Incoming Cash',
            Liquidation: 'Liquidation',
            Material: 'Material Database Request',
            Equipment: 'Equipment Database Request',
            Manpower: 'Manpower Role Request',
            DailyRecord: 'Daily Site Record',
            Estimate: 'SOW Estimate',
            Billing: 'Billing',
            OTRequest: 'Overtime Request'
        })[t] || t || 'Request';
    },

    _row(label, value, full) {
        return `<div class="dg-item${full ? ' full' : ''}"><span class="dg-label">${label}</span><span class="dg-value">${value || '—'}</span></div>`;
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
        const st = String(data.status || '').toLowerCase();
        const statusCls = st === 'approved' || st === 'paid' ? 'approved'
            : (st === 'pending' || st === 'reviewing' || st === 'for review') ? 'pending'
            : 'rejected';
        const isPending = st === 'pending' || st === 'for review';

        // v10: real thumbnails + lightbox instead of text links, so an
        // approver can read the receipt without leaving the modal.
        const attachmentsHtml = AttachmentGallery.render(
            (data.attachments && data.attachments.length) ? data.attachments : data.attachmentsJSON,
            'Attachments'
        );

        let actionButtons = '';
        if (isPending) {
            if (isSuperAdmin) {
                // v11: the super admin may force-decide ANYTHING, including
                // a request they filed themselves. The backend guard that
                // used to block this has been reordered to match.
                actionButtons = `
                    <button class="btn-sm success" onclick="ApprovalsPage.forceApproveItem('${data.id}','${data.type}', true)">Force Approve</button>
                    <button class="btn-sm danger" onclick="ApprovalsPage.forceRejectItem('${data.id}','${data.type}', true)">Force Reject</button>
                `;
            } else if (isApprover && !isRequestor) {
                actionButtons = `
                    <button class="btn-sm success" onclick="ApprovalsPage.approveItem('${data.id}','${data.type}', true)">Approve</button>
                    <button class="btn-sm danger" onclick="ApprovalsPage.rejectItem('${data.id}','${data.type}', true)">Reject</button>
                `;
            } else if (isRequestor) {
                actionButtons = `<span style="font-size:11px;color:var(--ink-soft);">You filed this request — it needs another admin's approval.</span>`;
            }
        }

        const project = data.projectName || data.projectId || '—';
        const R = this._row.bind(this);
        let detailsHtml;

        // ── per-type layouts ──────────────────────────────────────
        // Each layout mirrors the FORM that created the request, so an
        // approver sees the same fields the requester filled in rather
        // than a generic amount/description grid full of "undefined".
        if (data.type === 'OTRequest') {
            const sowIds = Array.isArray(data.sowIds) && data.sowIds.length
                ? data.sowIds
                : (function () { try { return JSON.parse(data.sowIdsJSON || '[]'); } catch (e) { return []; } })();
            detailsHtml = `
            <div class="print-section"><div class="ps-title">${Icon.timer({size:13})} Overtime Request Details</div>
                <div class="detail-grid">
                    ${R('Requested By', data.requestedBy)}
                    ${R('Project', project)}
                    ${R('OT Date', data.otDate)}
                    ${R('OT Time', `${data.otStart || '—'} – ${data.otEnd || '—'}`)}
                    ${R('Affected SOW', sowIds.length ? sowIds.join(', ') : '—', true)}
                    ${R('Reason for OT', data.reason, true)}
                </div>
                ${attachmentsHtml}
                <div class="data-source-note" style="margin-top:10px;">Once all admins approve, the OT in and out fields open on the Daily Site Record for ${data.otDate || 'this date'} on this project.</div>
            </div>`;

        } else if (data.type === 'Estimate') {
            // v11: estimates are now viewable straight from the inbox.
            // Previously this needed the Estimates tab of the right
            // project to have been opened first, which is why clicking
            // one from Approvals always failed.
            const L = data.lines || {};
            const table = (title, rows, cols) => {
                if (!rows || !rows.length) return '';
                return `<div class="ps-subtitle" style="margin-top:10px;font-size:11px;font-weight:700;">${title}</div>
                <table class="mini-table" style="width:100%;font-size:11.5px;margin-top:4px;">
                    <thead><tr>${cols.map(c => `<th style="text-align:${c[2] || 'left'}">${c[0]}</th>`).join('')}</tr></thead>
                    <tbody>${rows.map(r => `<tr>${cols.map(c => {
                        const v = r[c[1]];
                        const num = c[2] === 'right';
                        return `<td style="text-align:${c[2] || 'left'}">${num ? fmtMoney(parseFloat(v) || 0) : (v || '—')}</td>`;
                    }).join('')}</tr>`).join('')}</tbody>
                </table>`;
            };
            detailsHtml = `
            <div class="print-section"><div class="ps-title">${Icon.ruler({size:13})} Estimate for ${data.sowId || ''}</div>
                <div class="detail-grid">
                    ${R('Submitted By', data.submittedBy)}
                    ${R('Project', project)}
                    ${R('SOW Item', data.sowId)}
                    ${R('Estimate Total', '₱' + fmtMoney(data.amount || 0))}
                    ${R('Description', data.sowDescription, true)}
                </div>
                ${table('Materials', L.materials, [['Item','materialName'],['Description','desc'],['Qty','qty','right'],['Rate','rate','right'],['Cost','cost','right']])}
                ${table('Labor', L.labor, [['Role','role'],['Description','desc'],['Qty','qty','right'],['Duration','duration','right'],['Rate','rate','right'],['Cost','cost','right']])}
                ${table('Equipment', L.equipment, [['Item','equipName'],['Description','desc'],['Qty','qty','right'],['Duration','duration','right'],['Rate','rate','right'],['Cost','cost','right']])}
                ${table('Indirect Costs', L.indirect, [['Description','desc'],['Type','type'],['Amount','amount','right']])}
                <div class="data-source-note" style="margin-top:10px;">Approving this estimate writes its total back to the SOW budget, following that item's budget mode.</div>
            </div>`;

        } else if (data.type === 'Billing') {
            const gross = parseFloat(data.grossAmount) || 0;
            const ret = parseFloat(data.retentionAmount) || 0;
            const dpr = parseFloat(data.dpRecoupment) || 0;
            const net = parseFloat(data.netAmount) || 0;
            detailsHtml = `
            <div class="print-section"><div class="ps-title">${Icon.receipt({size:13})} ${data.billingType || 'Progress'} Billing ${data.billingNo || ''}</div>
                <div class="detail-grid">
                    ${R('Submitted By', data.submittedBy)}
                    ${R('Project', project)}
                    ${R('Period', data.period)}
                    ${R('Accomplishment', `${data.prevPct || 0}% → ${data.currentPct || 0}%`)}
                    ${R('Gross Amount', '₱' + fmtMoney(gross))}
                    ${R('Less Retention', '₱' + fmtMoney(ret))}
                    ${R('Less DP Recoupment', '₱' + fmtMoney(dpr))}
                    ${R('NET PAYABLE', '<b>₱' + fmtMoney(net) + '</b>')}
                </div>
                ${attachmentsHtml}
                <div class="data-source-note" style="margin-top:10px;">Approving releases this billing for sending and collection. It is not revenue until it is marked Paid.</div>
            </div>`;

        } else if (data.type === 'Material' || data.type === 'Equipment') {
            detailsHtml = `
            <div class="print-section"><div class="ps-title">${data.type === 'Material' ? Icon.package({size:13}) : Icon.wrench({size:13})} ${this._typeLabel(data.type)}</div>
                <div class="detail-grid">
                    ${R('Requested By', data.requestedBy)}
                    ${R('Name', data.name)}
                    ${R('Brand', data.brand)}
                    ${R('Category', data.category)}
                    ${R('Unit', data.unit)}
                    ${R('Rate', '₱' + fmtMoney(parseFloat(data.rate) || 0))}
                    ${R('Supplier', data.supplier)}
                    ${R('Code', data.code)}
                    ${R('Description', data.desc, true)}
                    ${R('Notes', data.notes, true)}
                </div>
                ${attachmentsHtml}
            </div>`;

        } else if (data.type === 'Manpower') {
            detailsHtml = `
            <div class="print-section"><div class="ps-title">${Icon.users({size:13})} Manpower Role Request</div>
                <div class="detail-grid">
                    ${R('Requested By', data.requestedBy)}
                    ${R('Role / Trade', data.role)}
                    ${R('Classification', data.classification)}
                    ${R('Code', data.code)}
                    ${R('Notes', data.notes, true)}
                </div>
            </div>`;

        } else if (data.type === 'DailyRecord') {
            detailsHtml = `
            <div class="print-section"><div class="ps-title">${Icon.clipboardList({size:13})} Daily Site Record</div>
                <div class="detail-grid">
                    ${R('Prepared By', data.createdBy)}
                    ${R('Project', project)}
                    ${R('Date', data.date)}
                    ${R('Weather AM / PM', `${data.weatherAM || '—'} / ${data.weatherPM || '—'}`)}
                    ${R('Remarks', data.remarks, true)}
                </div>
                ${attachmentsHtml}
                <div class="data-source-note" style="margin-top:10px;">Open the project's Daily Records tab for the full manpower, equipment and accomplishment breakdown.</div>
            </div>`;

        } else {
            // Cash Advance / Incoming Cash / Liquidation / Cash Release
            detailsHtml = `
            <div class="print-section"><div class="ps-title">${this._typeLabel(data.type)}</div>
                <div class="detail-grid">
                    ${R('Requestor', data.requestor || data.requestedBy || data.submittedBy)}
                    ${R('Project', project)}
                    ${R('Amount', '₱' + fmtMoney(parseFloat(data.amount) || 0))}
                    ${R('Scope of Work', data.scope)}
                    ${data.paymentMethod ? R('Payment Method', data.paymentMethod) : ''}
                    ${data.reference ? R('Reference', data.reference) : ''}
                    ${data.dateNeeded ? R('Date Needed', data.dateNeeded) : ''}
                    ${R('Description', data.description, true)}
                </div>
                ${attachmentsHtml}
            </div>`;
        }

        return `
        <div class="print-header">
            <h2>${data.id} — ${this._typeLabel(data.type)}</h2>
            <div class="print-meta">${data.createdAt || new Date().toLocaleDateString()} · <span class="stamp ${statusCls}">${data.status}</span></div>
        </div>
        ${detailsHtml}
        <div class="print-actions">
            <button class="btn-primary" onclick="PrintDoc.print()">${Icon.printer({size:14})} Print</button>
            ${actionButtons}
            <button class="btn-ghost" onclick="RequestDetailModal.close()">Close</button>
        </div>`;
    }
};

// ─── APPROVALS PAGE ────────────────────────────────────────────
/**
 * ApprovalsPage - Main approvals dashboard
 */
const ApprovalsPage = {
    _loaded: false,
    _currentTab: 'pending',

    /**
     * SECTIONS - one entry per approvable type in the pending inbox.
     *   key    : the array key returned by getPendingApprovals()
     *   type   : the type string the backend approval engine expects
     *   title  : section heading
     *   icon   : icon factory
     *   line1  : (item) => main title text
     *   line2  : (item) => array of small meta chips
     * Adding a new approvable type is now three lines here rather than a
     * copy-pasted forty-line block.
     */
    SECTIONS: [
        {
            // v11 BATCH G1: every purchase now starts as a PR, so this is
            // the busiest section. line2 surfaces the budget verdict right
            // in the inbox — an approver should not have to open a request
            // to learn it is over the estimate.
            key: 'purchaseRequests', type: 'PurchaseRequest', title: 'Purchase Requests',
            icon: () => Icon.package({ size: 16 }),
            line1: r => `${r.description || 'Purchase request'} — ${r.scope || ''}`,
            line2: r => [
                r.route === 'cash' ? 'Cash purchase' : 'Purchase order',
                (r.lines || []).length + ' item(s)',
                r.dateNeeded ? 'needed ' + ApprovalsPage._date(r.dateNeeded) : '',
                r.budgetState === 'over' ? '⚠ OVER the materials estimate'
                    : r.budgetState === 'near' ? 'close to the estimate' : ''
            ].filter(Boolean).join(' · ')
        }, {
            key: 'cashAdvances', type: 'CashAdvance', title: 'Cash Advance Requests',
            icon: () => Icon.wallet({size:16}),
            line1: r => `${r.requestor || '—'} — ${r.projectId || '—'}`,
            line2: r => [`₱${fmtMoney(parseFloat(r.amount) || 0)}`, ApprovalsPage._date(r.createdAt)]
        },
        {
            key: 'incomingCash', type: 'IncomingCash', title: 'Incoming Cash Requests',
            icon: () => Icon.incoming({size:16}),
            line1: r => `${r.requestor || '—'} — ${r.projectId || '—'}`,
            line2: r => [`₱${fmtMoney(parseFloat(r.amount) || 0)}`,
                         `${r.paymentMethod || ''}${r.reference ? ' · ' + r.reference : ''}`,
                         ApprovalsPage._date(r.createdAt)]
        },
        {
            key: 'liquidations', type: 'Liquidation', title: 'Liquidation Requests',
            icon: () => Icon.receipt({size:16}),
            line1: r => `${r.requestor || '—'} — ${r.projectId || '—'}`,
            line2: r => [`₱${fmtMoney(parseFloat(r.amount) || 0)}`, ApprovalsPage._date(r.createdAt)]
        },
        {
            // v11: billings finally appear in the inbox. They were created
            // Pending and were fully wired into the approval engine, but
            // the only Approve button lived inside the project Billings
            // tab — no badge, no inbox entry, so a downpayment could sit
            // unapproved indefinitely and the workflow looked broken.
            key: 'billings', type: 'Billing', title: 'Billings Pending Approval',
            icon: () => Icon.spreadsheet({size:16}),
            line1: b => `${b.billingType || 'Progress'} ${b.billingNo || ''} — ${b.projectName || b.projectId || '—'}`,
            line2: b => [`Net ₱${fmtMoney(parseFloat(b.netAmount) || 0)}`,
                         `${b.prevPct || 0}% → ${b.currentPct || 0}%`,
                         b.period || '', ApprovalsPage._date(b.createdAt)]
        },
        {
            key: 'materials', type: 'Material', title: 'Materials Pending Approval',
            icon: () => Icon.package({size:16}),
            line1: m => m.name || m.brand || 'Unnamed',
            line2: m => [m.brand || '', m.category || '', `Requested by ${m.requestedBy || '—'}`]
        },
        {
            key: 'equipment', type: 'Equipment', title: 'Equipment Pending Approval',
            icon: () => Icon.wrench({size:16}),
            line1: e => `${e.brand || e.name || 'Unnamed'}${e.model ? ' — ' + e.model : ''}`,
            line2: e => [e.category || '', `Requested by ${e.requestedBy || '—'}`]
        },
        {
            key: 'manpower', type: 'Manpower', title: 'Manpower Roles Pending Approval',
            icon: () => Icon.users({size:16}),
            line1: m => `${m.role || '—'}${m.classification ? ' (' + m.classification + ')' : ''}`,
            line2: m => [`Requested by ${m.requestedBy || '—'}`, ApprovalsPage._date(m.createdAt)]
        },
        {
            key: 'otRequests', type: 'OTRequest', title: 'Overtime Requests Pending Approval',
            icon: () => Icon.timer({size:16}),
            line1: o => `OT ${o.otDate || ''} · ${o.otStart || '?'}–${o.otEnd || '?'} (${o.projectId || '—'})`,
            line2: o => [`SOW: ${(o.sowIds || []).join(', ') || '—'}`, o.reason || '',
                         `Requested by ${o.requestedBy || '—'}`]
        },
        {
            key: 'estimates', type: 'Estimate', title: 'Estimates Pending Approval',
            icon: () => Icon.ruler({size:16}),
            line1: e => `${e.sowId || e.id} — ${e.sowDescription || e.description || '—'}`,
            line2: e => [e.projectId || '—', `₱${fmtMoney(parseFloat(e.estimateTotal) || 0)}`,
                         `Submitted by ${e.submittedBy || '—'}`]
        },
        {
            key: 'dailyRecords', type: 'DailyRecord', title: 'Daily Records Pending Approval',
            icon: () => Icon.clipboardList({size:16}),
            line1: d => `Daily Record — ${d.date || 'No date'} (${d.projectId || '—'})`,
            line2: d => [`${d.weatherAM || ''} / ${d.weatherPM || ''}`,
                         `Prepared by ${d.createdBy || '—'}`]
        }
    ],

    _date(v) {
        if (!v) return '';
        const d = new Date(v);
        return isNaN(d) ? String(v) : d.toLocaleDateString();
    },

    _esc(v) { return String(v == null ? '' : v).replace(/'/g, '&#39;').replace(/"/g, '&quot;'); },

    async load() {
        const container = document.getElementById('approvalsContent');
        UI.showLoading(container);
        try {
            const user = App.currentUser;
            const isSuperAdmin = user && user.role === 'superadmin';
            const isAdmin = user && user.role === 'admin';

            const pendingData = await DataService.getPendingApprovals(true);   // v9.3: always fresh on this page
            const myRequests = await DataService.getMyPendingRequests();
            const myApproved = await DataService.getMyApprovedRequests();
            const myRejected = await DataService.getMyRejectedRequests();

            // v11: the backend already excludes the current user from
            // every pending list (see getPendingApprovals). The old
            // client-side re-filtering duplicated that logic per type and
            // silently dropped rows whose owner column was blank.
            const releases = pendingData.releases || [];
            const totalPending = this.SECTIONS.reduce(
                (n, s) => n + ((pendingData[s.key] || []).length), 0);

            const html = `
            <div class="section-head"><h2>Approval Dashboard</h2><div class="rule"></div>
                <span class="badge">${(isAdmin || isSuperAdmin) ? totalPending + ' pending' : myRequests.length + ' my requests'}</span>
            </div>

            <div class="approval-tab-bar">
                ${(isAdmin || isSuperAdmin) ? `<button class="active" data-tab="pending" onclick="ApprovalsPage.switchTab('pending')">${Icon.clipboardList({size:14})} Pending Approvals (${totalPending})</button>` : ''}
                ${(isAdmin && !isSuperAdmin) ? `<button data-tab="reviewing" onclick="ApprovalsPage.switchTab('reviewing')">${Icon.clipboardList({size:14})} For Review (${releases.length})</button>` : ''}
                <button ${!(isAdmin || isSuperAdmin) ? 'class="active"' : ''} data-tab="myrequests" onclick="ApprovalsPage.switchTab('myrequests')">${Icon.user({size:14})} My Requests (${myRequests.length})</button>
                <button data-tab="approved" onclick="ApprovalsPage.switchTab('approved')">${Icon.checkCircle({size:14})} Approved (${myApproved.length})</button>
                <button data-tab="rejected" onclick="ApprovalsPage.switchTab('rejected')">${Icon.xCircle({size:14})} Rejected (${myRejected.length})</button>
            </div>

            ${(isAdmin || isSuperAdmin) ? `<div id="approval-tab-pending" class="approval-tab-content active">${this._renderPendingTab(pendingData, totalPending)}</div>` : ''}
            ${(isAdmin && !isSuperAdmin) ? `<div id="approval-tab-reviewing" class="approval-tab-content">${this._renderReviewingTab(releases)}</div>` : ''}
            <div id="approval-tab-myrequests" class="approval-tab-content ${!(isAdmin || isSuperAdmin) ? 'active' : ''}">${this._renderMyRequestsTab(myRequests, 'pending')}</div>
            <div id="approval-tab-approved" class="approval-tab-content">${this._renderMyRequestsTab(myApproved, 'approved')}</div>
            <div id="approval-tab-rejected" class="approval-tab-content">${this._renderMyRequestsTab(myRejected, 'rejected')}</div>`;

            UI.setContent(container, html);
            this._loaded = true;
        } catch (err) {
            console.error('Approvals load error:', err);
            UI.toast('Error loading approvals: ' + (err.message || err), 'error');
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
     * _renderSection - one inbox section, driven by a SECTIONS entry.
     * EVERY row opens RequestDetailModal. Nothing here reaches into
     * another page's cache, which is what broke the old build.
     */
    _renderSection(section, items) {
        const user = App.currentUser;
        const isSuperAdmin = user && user.role === 'superadmin';
        const isApprover = user && user.role === 'admin';

        let html = `<div class="section-head"><h3>${section.title}</h3><div class="rule"></div>
            ${items.length ? `<span class="badge">${items.length}</span>` : ''}</div>`;

        if (!items.length) {
            html += `<div class="empty"><p>No pending ${section.title.toLowerCase().replace(' pending approval', '')}.</p></div>`;
            return html;
        }

        html += `<div class="panel"><div style="padding:4px 0;">`;
        items.forEach(it => {
            const id = this._esc(it.id);
            let actionsHtml = '';
            if (isSuperAdmin) {
                actionsHtml = `
                    <button class="btn-sm success" onclick="event.stopPropagation();ApprovalsPage.forceApproveItem('${id}','${section.type}')">Force Approve</button>
                    <button class="btn-sm danger" onclick="event.stopPropagation();ApprovalsPage.forceRejectItem('${id}','${section.type}')">Force Reject</button>`;
            } else if (isApprover) {
                actionsHtml = `
                    <button class="btn-sm success" onclick="event.stopPropagation();ApprovalsPage.approveItem('${id}','${section.type}')">Approve</button>
                    <button class="btn-sm danger" onclick="event.stopPropagation();ApprovalsPage.rejectItem('${id}','${section.type}')">Reject</button>`;
            }

            const chips = (section.line2(it) || [])
                .filter(x => x !== null && x !== undefined && String(x).trim() !== '')
                .map(x => `<span>${x}</span>`).join('');
            const clipCount = (it.attachments || []).length;

            html += `
            <div class="approval-request-item" style="cursor:pointer;">
                <div class="ar-icon">${section.icon()}</div>
                <div class="ar-body" onclick="RequestDetailModal.open('${id}','request')">
                    <div class="ar-title">${section.line1(it)}</div>
                    <div class="ar-meta">
                        <span class="ar-id">${it.id}</span>
                        ${chips}
                        ${clipCount ? `<span title="${clipCount} attachment(s)">${Icon.fileText({size:11})} ${clipCount}</span>` : ''}
                        <span class="stamp pending" style="transform:none;padding:1px 8px;font-size:9px;">${it.status || 'Pending'}</span>
                    </div>
                </div>
                <div class="ar-actions">${actionsHtml}</div>
            </div>`;
        });
        html += `</div></div>`;
        return html;
    },

    _renderPendingTab(data, total) {
        if (!total) {
            return `<div class="empty" style="padding:36px 18px;">
                <p><b>Nothing is waiting on you.</b></p>
                <p style="font-size:12px;color:var(--ink-soft);">Every request has been decided or is not yours to approve.</p>
            </div>`;
        }
        // Only render sections that actually have items, so the page is
        // not nine "No pending X" blocks the approver has to scroll past.
        return this.SECTIONS
            .filter(s => (data[s.key] || []).length)
            .map(s => this._renderSection(s, data[s.key] || []))
            .join('');
    },

    _renderReviewingTab(reviews) {
        const user = App.currentUser;
        const userEmail = user ? user.email.toLowerCase() : '';

        let html = `<div class="section-head"><h3>Cash Release Requests for Review</h3><div class="rule"></div></div>`;
        if (!reviews.length) {
            html += `<div class="empty"><p>No release requests awaiting review.</p></div>`;
            return html;
        }
        html += `<div class="panel"><div style="padding:4px 0;">`;
        reviews.forEach(r => {
            const isSelf = r.releasedBy && r.releasedBy.toLowerCase() === userEmail;
            const isAdmin = user && user.role === 'admin';
            const canReview = isAdmin && !isSelf;
            let actionsHtml;
            if (canReview) {
                actionsHtml = `<button class="btn-sm success" onclick="event.stopPropagation();ApprovalsPage.reviewRelease('${this._esc(r.id)}')">Reviewed</button>`;
            } else if (isSelf) {
                actionsHtml = `<span style="font-size:10px;color:var(--ink-soft);">You cannot review your own request.</span>`;
            } else {
                actionsHtml = `<span style="font-size:10px;color:var(--ink-soft);">Waiting for Admin review</span>`;
            }
            html += `
                <div class="approval-request-item" style="cursor:pointer;">
                    <div class="ar-icon">${Icon.outgoing({size:16})}</div>
                    <div class="ar-body" onclick="RequestDetailModal.open('${this._esc(r.id)}','request')">
                        <div class="ar-title">Release Cash — ${r.requestor || '—'} (${r.projectId || '—'})</div>
                        <div class="ar-meta">
                            <span class="ar-id">${r.id}</span>
                            <span>₱${fmtMoney(parseFloat(r.amount) || 0)}</span>
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

        // v11 HOTFIX: "this._svg is not a function".
        //
        // Every Icon method is `name(o) { return this._svg(...) }`, so it
        // depends on `this` being the Icon object. The previous version of
        // this map stored METHOD REFERENCES (`Icon.wallet`) and then called
        // the plucked function — `({...}[t] || Icon.fileText)({size:16})` —
        // which invokes it with `this` undefined. `this._svg` is then not a
        // function and the whole My Requests tab throws, taking the
        // Approvals page down with it.
        //
        // Storing the icon NAME and calling `Icon[name](...)` keeps the
        // method attached to its object, so `this` is correct. Any icon
        // name that does not exist falls back to fileText rather than
        // throwing, so a future typo degrades to a generic icon instead of
        // breaking the page.
        const ICON_BY_TYPE = {
            CashAdvance: 'wallet', Liquidation: 'receipt', Estimate: 'ruler',
            Material: 'package', Equipment: 'wrench', DailyRecord: 'clipboardList',
            IncomingCash: 'incoming', CashRelease: 'outgoing', Manpower: 'users',
            OTRequest: 'timer', Billing: 'spreadsheet',
            PurchaseRequest: 'package'   // v11 BATCH G1
        };
        const iconFor = t => {
            const name = ICON_BY_TYPE[t];
            const fn = (name && typeof Icon[name] === 'function') ? name : 'fileText';
            return Icon[fn]({ size: 16 });
        };

        let html = `<div class="section-head"><h3>My ${statusLabel} Requests</h3><div class="rule"></div>
            ${requests.length ? `<span class="badge">${requests.length}</span>` : ''}</div>`;

        if (!requests.length) {
            html += `<div class="empty"><p>You have no ${statusLabel.toLowerCase()} requests.</p></div>`;
            return html;
        }

        html += `<div class="panel"><div style="padding:4px 0;">`;
        requests.forEach(r => {
            const label = RequestDetailModal._typeLabel(r.type);
            const amount = parseFloat(r.amount || r.netAmount) || 0;
            html += `
            <div class="my-request-item" onclick="RequestDetailModal.open('${this._esc(r.id)}','request')" style="cursor:pointer;">
                <div class="mr-icon">${iconFor(r.type)}</div>
                <div class="mr-body">
                    <div class="mr-title">${label}: ${r.id}${r.projectId ? ' — ' + r.projectId : ''}</div>
                    <div class="mr-meta">
                        <span class="mr-id">${r.id}</span>
                        ${amount ? `<span>₱${fmtMoney(amount)}</span>` : ''}
                        ${r.description ? `<span>${r.description}</span>` : ''}
                        ${r.sowId ? `<span>SOW ${r.sowId}</span>` : ''}
                        ${r.type === 'OTRequest' ? `<span>OT ${r.otDate || ''} ${r.otStart || ''}–${r.otEnd || ''}</span>` : ''}
                        <span>${this._date(r.createdAt)}</span>
                        <span class="stamp ${statusCls}" style="transform:none;padding:1px 8px;font-size:9px;">${r.status}</span>
                    </div>
                </div>
                <div style="font-size:11px;color:var(--ink-soft);">›</div>
            </div>`;
        });
        html += `</div></div>`;
        return html;
    },

    // v11: openMyRequestDetail() is retained only so any older inline
    // handler still in a cached page does not throw. It now does exactly
    // what every other row does — open the self-contained modal.
    openMyRequestDetail(id) { RequestDetailModal.open(id, 'request'); },

    async approveItem(id, type, closeModal = false) {
        const confirmed = await Confirm.open('Approve Item?', `Approve ${id}?`);
        if (!confirmed) return;
        try {
            const result = await DataService.approveItemGeneric(id, type);
            // v5: multi-sig — your signature may not be the last one needed
            if (result && result.awaiting) {
                UI.toast(`${id}: your approval is recorded — awaiting the other admins.`, 'success');
            } else {
                UI.toast(`${id} approved.`, 'success');
            }
            if (closeModal) RequestDetailModal.close();
            this.load();
            if (typeof HomePage !== 'undefined' && HomePage.load) HomePage.load();
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
            if (typeof HomePage !== 'undefined' && HomePage.load) HomePage.load();
        } catch (err) {
            UI.toast('' + err.message, 'error');
        }
    },

    async forceApproveItem(id, type, closeModal = false) {
        const confirmed = await Confirm.open('Force Approve?',
            `Force approve ${id}? This finalizes it immediately, without the other admins' signatures.`);
        if (!confirmed) return;
        try {
            await DataService.forceApprove(id, type);
            UI.toast(`${id} force-approved.`, 'success');
            if (closeModal) RequestDetailModal.close();
            this.load();
            if (typeof HomePage !== 'undefined' && HomePage.load) HomePage.load();
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
            if (typeof HomePage !== 'undefined' && HomePage.load) HomePage.load();
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
            UI.toast('Release request reviewed.', 'success');
            this.load();
            if (typeof HomePage !== 'undefined' && HomePage.load) HomePage.load();
        } catch (err) {
            UI.toast('' + err.message, 'error');
        }
    }
};
