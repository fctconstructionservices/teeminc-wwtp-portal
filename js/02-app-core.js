// ================================================================
//  APP CORE - Complete with dynamic user badge updates
//  FIX: Dynamic requesting badge based on logged-in user
//  FIX: Page reload badge fix - await page loads before updating badges
//  FIX: Added loadIncomingProjectsDropdown for record-cash page
//  FIX: Fixed duplicate restrictedPages declaration (Issue 5.1)
//  FIX: Added isSuperAdmin() method
//  FIX: Updated updateApprovalBadge() for new sheets structure
// ================================================================

const App = {
    currentUser: null,
    _pendingCount: 0,

    init() {
        const saved = localStorage.getItem('fctc_user');
        if (saved) {
            try {
                this.currentUser = JSON.parse(saved);
                if (this.currentUser && this.currentUser.loggedIn) {
                    this.updateUserBadges();
                    this.navigate('home');
                    return;
                }
            } catch (_) {}
        }
        this.navigate('login');
        const theme = localStorage.getItem('fctc_theme') || 'light';
        if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    },

    async navigate(page) {
        // ─── RELEASE CASH: Super Admin only ──────────────────
        if (page === 'release-cash' && !this.isSuperAdmin()) {
            UI.toast('Access denied. Super Admin only.', 'error');
            if (page !== 'home') {
                setTimeout(() => this.navigate('home'), 800);
                return;
            }
        }

        // ─── RECORD CASH: Approvers only ──────────────────────
        if (page === 'record-cash' && !this.isApprover()) {
            UI.toast('Access denied. Approvers only.', 'error');
            if (page !== 'home') {
                setTimeout(() => this.navigate('home'), 800);
                return;
            }
        }

        if (page === 'request') {
            loadProjectsDropdown();
        }
        if (page === 'record-cash') {
            setTimeout(loadIncomingProjectsDropdown, 100);
        }

        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        const target = document.getElementById('page-' + page);
        if (target) {
            target.classList.add('active');
            target.setAttribute('tabindex', '-1');
            target.focus({ preventScroll: false });
            window.scrollTo({ top: 0, behavior: 'instant' });
        }
        
        if (page === 'home') await HomePage.load();
        if (page === 'finance') await FinancePage.load();
        if (page === 'materials') await MaterialsPage.load();
        if (page === 'equipment') await EquipmentPage.load();
        if (page === 'approvals') await ApprovalsPage.load();
        if (page === 'release-cash') {
            setTimeout(loadReleaseDropdown, 100);
        }

        this.updateUserBadges();
        await this.updateApprovalBadge();

        document.querySelectorAll('.topbar .actions').forEach(el => el.classList.remove('open'));
    },

    logout() {
        localStorage.removeItem('fctc_user');
        this.currentUser = null;
        this.navigate('login');
        UI.toast('Logged out.', 'success');
    },

    toggleTheme() {
        const html = document.documentElement;
        const current = html.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        html.setAttribute('data-theme', next);
        localStorage.setItem('fctc_theme', next);
        UI.toast(next === 'dark' ? 'Dark mode' : 'Light mode', 'success');
    },

    getUser() {
        return this.currentUser;
    },

    hasRole(role) {
        if (!this.currentUser) return false;
        return this.currentUser.role === role;
    },

    isAdmin() {
        return this.hasRole('admin') || this.hasRole('superadmin');
    },

    isApprover() {
        return this.hasRole('approver') || this.hasRole('admin') || this.hasRole('superadmin');
    },

    // ✅ NEW: Check if user is Super Admin
    isSuperAdmin() {
        return this.hasRole('superadmin');
    },

    isRequestOnly() {
        return this.hasRole('request-only');
    },

    canApprove() {
        return this.isApprover() || this.isAdmin();
    },

    canSubmit() {
        return true;
    },

    updateUserBadges() {
        const user = this.getUser();
        if (!user) return;
        
        const name = user.name || 'User';
        const email = user.email || '';
        
        document.querySelectorAll('.requester-badge').forEach(el => {
            const strong = el.querySelector('strong');
            if (strong) {
                strong.textContent = name;
            } else {
                const text = el.textContent;
                const colonIndex = text.indexOf(':');
                if (colonIndex > -1) {
                    const prefix = text.substring(0, colonIndex + 1);
                    el.textContent = `${prefix} ${name}`;
                } else {
                    el.textContent = `Requesting as: ${name}`;
                }
            }
        });
        
        const homeLabel = document.getElementById('home-user-label');
        if (homeLabel) {
            const roleLabel = user.roleLabel || user.role || 'User';
            homeLabel.textContent = `${roleLabel} — ${name}`;
        }
    },

    async updateApprovalBadge() {
        try {
            const user = this.getUser();
            if (!user) return;
            
            const pendingData = await DataService.getPendingApprovals();
            const userEmail = this.getUser().email.toLowerCase();

            // Count pending cash advances (excluding self)
            const pendingCashAdvances = (pendingData.cashAdvances || []).filter(function(r) {
                return r.requestorEmail && r.requestorEmail.toLowerCase() !== userEmail;
            });
            
            // Count reviewing releases (for Admins)
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
            
            this._pendingCount = pendingCashAdvances.length + pendingReleases.length + 
                                 pendingMaterials.length + pendingEquipment.length + 
                                 pendingEstimates.length + pendingDailyRecords.length;
            
            document.querySelectorAll('.t-badge, #approvalBadgeHome').forEach(el => {
                el.textContent = this._pendingCount;
            });
        } catch (err) {
            console.error('Error updating badge:', err);
        }
    }
};

// ─── UI HELPERS ──────────────────────────────────────────────────

const UI = {
    toast(msg, type = 'info') {
        const el = document.getElementById('toast');
        const icon = type === 'error' ? Icon.xCircle({ size: 18 }) :
                     type === 'success' ? Icon.checkCircle({ size: 18 }) :
                     Icon.warning({ size: 18 });
        el.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-msg">${msg}</span>`;
        el.className = 'toast';
        if (type === 'error') el.classList.add('error');
        if (type === 'success') el.classList.add('success');
        el.classList.add('show');
        clearTimeout(el._timer);
        el._timer = setTimeout(() => el.classList.remove('show'), 2800);
    },
    
    showLoading(container) {
        if (!container) return;
        container.innerHTML =
            `<div class="loading-overlay"><div class="loader"></div><p>Loading data...</p></div>`;
    },
    
    setContent(container, html) {
        if (container) container.innerHTML = html;
    }
};

// ─── CONFIRM DIALOG ─────────────────────────────────────────────

const Confirm = {
    _resolve: null,
    open(title, message) {
        return new Promise((resolve) => {
            document.getElementById('confirmTitle').textContent = title;
            document.getElementById('confirmMessage').textContent = message;
            document.getElementById('confirmOverlay').classList.add('open');
            this._resolve = resolve;
        });
    },
    confirm() {
        document.getElementById('confirmOverlay').classList.remove('open');
        if (this._resolve) this._resolve(true);
        this._resolve = null;
    },
    cancel() {
        document.getElementById('confirmOverlay').classList.remove('open');
        if (this._resolve) this._resolve(false);
        this._resolve = null;
    }
};

// ─── PRINT MODAL ─────────────────────────────────────────────────

const PrintModal = {
    open(record) {
        const modal = document.getElementById('printModal');
        const body = document.getElementById('printBody');
        body.innerHTML = this.renderPrintView(record);
        modal.classList.add('open');
        document.body.style.overflow = 'hidden';
    },
    close() {
        document.getElementById('printModal').classList.remove('open');
        document.body.style.overflow = '';
    },
    renderPrintView(r) {
        const totalManpower = r.manpower ? r.manpower.reduce((s, m) => s + (parseInt(m.count) || 0), 0) : 0;
        const statusCls = r.status === 'On Track' ? 'ontrack' : r.status === 'Delayed' ? 'delayed' : 'completed';
        let html = `
                <div class="print-header">
                    <h2>Daily Site Record</h2>
                    <div class="print-meta">${r.date} · <span class="stamp ${statusCls}" style="transform:none;font-size:10px;">${r.status}</span></div>
                </div>
                <div class="print-section"><div class="ps-title">Weather & Status</div><div class="ps-grid">
                    <div class="item"><span class="label">Weather AM</span><span class="value">${r.weatherAM || '—'}</span></div>
                    <div class="item"><span class="label">Weather PM</span><span class="value">${r.weatherPM || '—'}</span></div>
                    <div class="item"><span class="label">Status</span><span class="value">${r.status}</span></div>
                </div></div>
                <div class="print-section"><div class="ps-title">Manpower <span style="font-weight:400;font-size:10px;color:var(--ink-soft);">(Total: ${totalManpower})</span></div>
                    ${r.manpower && r.manpower.length ? `<table class="ps-table"><thead><tr><th>Trade / Role</th><th>Number Present</th></tr></thead><tbody>${r.manpower.map(m => `<tr><td>${m.role}</td><td>${m.count}</td></tr>`).join('')}</tbody></table>` : `<p style="font-size:12px;color:var(--ink-soft);">No manpower recorded.</p>`}
                </div>
                <div class="print-section"><div class="ps-title">Equipment on Site</div>
                    ${r.equipment && r.equipment.length ? `<table class="ps-table"><thead><tr><th>Equipment</th><th>Qty</th><th>Status</th><th>Remarks</th></tr></thead><tbody>${r.equipment.map(e => `<tr><td>${e.name}</td><td>${e.qty}</td><td>${e.status || '—'}</td><td>${e.remarks || '—'}</td></tr>`).join('')}</tbody></table>` : `<p style="font-size:12px;color:var(--ink-soft);">No equipment recorded.</p>`}
                </div>
                <div class="print-section"><div class="ps-title">Work Accomplished</div>
                    ${r.workAccomplished && r.workAccomplished.length ? `<table class="ps-table"><thead><tr><th>Location/Area</th><th>Scope of Work</th><th>Description</th><th>% Complete</th></tr></thead><tbody>${r.workAccomplished.map(w => `<tr><td>${w.location || '—'}</td><td>${w.scope || '—'}</td><td>${w.description || '—'}</td><td>${w.percentComplete || 0}%</td></tr>`).join('')}</tbody></table>` : `<p style="font-size:12px;color:var(--ink-soft);">No work accomplished recorded.</p>`}
                </div>
                <div class="print-section"><div class="ps-title">Materials Delivered</div>
                    ${r.materialsDelivered && r.materialsDelivered.length ? `<table class="ps-table"><thead><tr><th>Material</th><th>Qty</th><th>Unit</th><th>Supplier / DR No.</th></tr></thead><tbody>${r.materialsDelivered.map(m => `<tr><td>${m.material}</td><td>${m.qty}</td><td>${m.unit || '—'}</td><td>${m.supplier || '—'}</td></tr>`).join('')}</tbody></table>` : `<p style="font-size:12px;color:var(--ink-soft);">No materials delivered recorded.</p>`}
                </div>
                <div class="print-section"><div class="ps-title">Issues / Delays</div>
                    ${r.issues && r.issues.length ? `<table class="ps-table"><thead><tr><th>Description</th><th>Cause</th><th>Time Lost (hrs)</th></tr></thead><tbody>${r.issues.map(iss => `<tr><td>${iss.description || '—'}</td><td>${iss.cause || '—'}</td><td>${iss.timeLost || 0}</td></tr>`).join('')}</tbody></table>` : `<p style="font-size:12px;color:var(--ink-soft);">No issues recorded.</p>`}
                </div>
                <div class="print-section"><div class="ps-title">Visitors</div>
                    ${r.visitors && r.visitors.length ? `<table class="ps-table"><thead><tr><th>Name</th><th>Company / Role</th><th>Purpose</th><th>Time In</th><th>Time Out</th><th>Remarks</th></tr></thead><tbody>${r.visitors.map(v => `<tr><td>${v.name}</td><td>${v.company || '—'} ${v.role ? '· ' + v.role : ''}</td><td>${v.purpose || '—'}</td><td>${v.timeIn || '—'}</td><td>${v.timeOut || '—'}</td><td>${v.remarks || '—'}</td></tr>`).join('')}</tbody></table>` : `<p style="font-size:12px;color:var(--ink-soft);">No visitors recorded.</p>`}
                </div>
                <div class="print-actions">
                    <button class="btn-primary" onclick="window.print()">${Icon.printer({size:14})} Print</button>
                    <button class="btn-ghost" onclick="PrintModal.close()">Close</button>
                </div>`;
        return html;
    }
};

// ─── MATERIAL PRINT MODAL ──────────────────────────────────────

const MatPrintModal = {
    open(material) {
        const modal = document.getElementById('matPrintModal');
        const body = document.getElementById('matPrintBody');
        body.innerHTML = this.renderPrintView(material);
        modal.classList.add('open');
        document.body.style.overflow = 'hidden';
    },
    close() {
        document.getElementById('matPrintModal').classList.remove('open');
        document.body.style.overflow = '';
    },
    renderPrintView(m) {
        const imgHtml = m.image ? `<img src="${m.image}" alt="${m.brand}" />` :
            `<div class="no-img-placeholder">${Icon.package({size:28})}<br>No Image</div>`;
        return `
                <div class="detail-print-header">
                    <div class="dph-left">
                        <h2>${m.brand || 'Material'} — ${m.specs || ''}</h2>
                        <div class="dph-id">${m.id} · ${m.category || ''} ${m.subcategory ? '→ ' + m.subcategory : ''}</div>
                    </div>
                    <div class="dph-right">${imgHtml}</div>
                </div>
                <div class="print-section"><div class="ps-title">General Information</div>
                    <div class="detail-grid">
                        <div class="dg-item"><span class="dg-label">Material ID</span><span class="dg-value">${m.id}</span></div>
                        <div class="dg-item"><span class="dg-label">Category</span><span class="dg-value">${m.category || '—'}</span></div>
                        <div class="dg-item"><span class="dg-label">Subcategory</span><span class="dg-value">${m.subcategory || '—'}</span></div>
                        <div class="dg-item"><span class="dg-label">Unit of Measurement</span><span class="dg-value">${m.unit || '—'}</span></div>
                    </div>
                </div>
                <div class="print-section"><div class="ps-title">Material Identification</div>
                    <div class="detail-grid">
                        <div class="dg-item"><span class="dg-label">Brand</span><span class="dg-value">${m.brand || '—'}</span></div>
                        <div class="dg-item"><span class="dg-label">Model / Serial No.</span><span class="dg-value">${m.model || '—'}</span></div>
                    </div>
                </div>
                <div class="print-section"><div class="ps-title">Technical Specifications</div>
                    <div class="detail-grid">
                        <div class="dg-item full"><span class="dg-label">Specifications</span><span class="dg-value">${m.specs || '—'}</span></div>
                        <div class="dg-item"><span class="dg-label">Grade</span><span class="dg-value">${m.grade || '—'}</span></div>
                        <div class="dg-item"><span class="dg-label">Size / Dimension</span><span class="dg-value">${m.size || '—'}</span></div>
                        <div class="dg-item"><span class="dg-label">Length</span><span class="dg-value">${m.length || '—'}</span></div>
                        <div class="dg-item"><span class="dg-label">Thickness</span><span class="dg-value">${m.thickness || '—'}</span></div>
                        <div class="dg-item"><span class="dg-label">Weight</span><span class="dg-value">${m.weight || '—'}</span></div>
                    </div>
                </div>
                <div class="print-section"><div class="ps-title">Standard Codes</div>
                    <div class="detail-grid">
                        <div class="dg-item full"><span class="dg-label">Standard / Code Reference</span><span class="dg-value">${m.standardCode || '—'}</span></div>
                    </div>
                </div>
                ${m.pdfUrl ? `<div class="print-section"><div class="ps-title">Documents</div><p style="font-size:12px;display:flex;align-items:center;gap:5px;">${Icon.fileText({size:14})} ${m.pdfUrl}</p></div>` : ''}
                <div class="print-section"><div class="ps-title">Additional Information</div>
                    <div class="detail-grid">
                        <div class="dg-item full"><span class="dg-label">Typical Use / Application</span><span class="dg-value">${m.application || '—'}</span></div>
                        <div class="dg-item full"><span class="dg-label">Notes / Remarks</span><span class="dg-value">${m.notes || '—'}</span></div>
                    </div>
                </div>
                <div class="print-actions">
                    <button class="btn-primary" onclick="window.print()">${Icon.printer({size:14})} Print</button>
                    <button class="btn-ghost" onclick="MatPrintModal.close()">Close</button>
                </div>`;
    }
};

// ─── EQUIPMENT PRINT MODAL ─────────────────────────────────────

const EquipPrintModal = {
    open(equip) {
        const modal = document.getElementById('equipPrintModal');
        const body = document.getElementById('equipPrintBody');
        body.innerHTML = this.renderPrintView(equip);
        modal.classList.add('open');
        document.body.style.overflow = 'hidden';
    },
    close() {
        document.getElementById('equipPrintModal').classList.remove('open');
        document.body.style.overflow = '';
    },
    renderPrintView(e) {
        const imgHtml = e.image ? `<img src="${e.image}" alt="${e.brand}" />` :
            `<div class="no-img-placeholder">${Icon.wrench({size:28})}<br>No Image</div>`;
        return `
                <div class="detail-print-header">
                    <div class="dph-left">
                        <h2>${e.brand || 'Equipment'} ${e.model ? '— ' + e.model : ''}</h2>
                        <div class="dph-id">${e.id} · ${e.category || ''} ${e.type ? '→ ' + e.type : ''}</div>
                    </div>
                    <div class="dph-right">${imgHtml}</div>
                </div>
                <div class="print-section"><div class="ps-title">General Information</div>
                    <div class="detail-grid">
                        <div class="dg-item"><span class="dg-label">Equipment ID</span><span class="dg-value">${e.id}</span></div>
                        <div class="dg-item"><span class="dg-label">Category / Type</span><span class="dg-value">${e.category || '—'}${e.type ? ' (' + e.type + ')' : ''}</span></div>
                        <div class="dg-item"><span class="dg-label">Capacity / Rating</span><span class="dg-value">${e.capacity || '—'}</span></div>
                        <div class="dg-item"><span class="dg-label">Unit</span><span class="dg-value">${e.unit || '—'}</span></div>
                    </div>
                </div>
                <div class="print-section"><div class="ps-title">Equipment Identification</div>
                    <div class="detail-grid">
                        <div class="dg-item"><span class="dg-label">Brand</span><span class="dg-value">${e.brand || '—'}</span></div>
                        <div class="dg-item"><span class="dg-label">Model</span><span class="dg-value">${e.model || '—'}</span></div>
                        <div class="dg-item"><span class="dg-label">Serial Number</span><span class="dg-value">${e.serial || '—'}</span></div>
                    </div>
                </div>
                <div class="print-section"><div class="ps-title">Technical Specifications</div>
                    <div class="detail-grid">
                        <div class="dg-item"><span class="dg-label">Power Source</span><span class="dg-value">${e.powerSource || '—'}</span></div>
                        <div class="dg-item"><span class="dg-label">Ownership Type</span><span class="dg-value">${e.ownership || '—'}</span></div>
                        <div class="dg-item"><span class="dg-label">Acquisition Date</span><span class="dg-value">${e.acquisitionDate || '—'}</span></div>
                        <div class="dg-item"><span class="dg-label">Condition</span><span class="dg-value">${e.condition || '—'}</span></div>
                    </div>
                </div>
                ${e.manual ? `<div class="print-section"><div class="ps-title">Documents</div><p style="font-size:12px;display:flex;align-items:center;gap:5px;">${Icon.fileText({size:14})} ${e.manual}</p></div>` : ''}
                <div class="print-section"><div class="ps-title">Additional Information</div>
                    <div class="detail-grid">
                        <div class="dg-item full"><span class="dg-label">Notes / Remarks</span><span class="dg-value">${e.notes || '—'}</span></div>
                    </div>
                </div>
                <div class="print-actions">
                    <button class="btn-primary" onclick="window.print()">${Icon.printer({size:14})} Print</button>
                    <button class="btn-ghost" onclick="EquipPrintModal.close()">Close</button>
                </div>`;
    }
};

// ─── SOW BREAKDOWN MODAL ───────────────────────────────────────

const SOWBreakdownModal = {
    open(sowId, estimatesData) {
        const modal = document.getElementById('sowBreakdownModal');
        const body = document.getElementById('sowBreakdownBody');
        body.innerHTML = this.renderBreakdown(sowId, estimatesData);
        modal.classList.add('open');
        document.body.style.overflow = 'hidden';
    },
    close() {
        document.getElementById('sowBreakdownModal').classList.remove('open');
        document.body.style.overflow = '';
    },
    renderBreakdown(sowId, data) {
        let materials = [],
            equipment = [],
            labor = [],
            indirect = [];
        if (data.groups) {
            const group = data.groups.find(g => g.sowId === sowId);
            if (group) {
                materials = group.materials || [];
                equipment = group.equipment || [];
                labor = group.labor || [];
                indirect = group.indirect || [];
            }
        } else {
            materials = (data.materials || []).filter(m => m.sow === sowId);
            equipment = (data.equipment || []).filter(e => e.sow === sowId);
            labor = (data.labor || []).filter(l => l.sow === sowId);
            indirect = (data.indirect || []).filter(i => i.sow === sowId);
        }

        const matTotal = materials.reduce((s, m) => s + (parseFloat(m.cost) || 0), 0);
        const eqTotal = equipment.reduce((s, e) => s + (parseFloat(e.cost) || 0), 0);
        const laborTotal = labor.reduce((s, l) => s + (parseFloat(l.cost) || 0), 0);
        const indirectTotal = indirect.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
        const grandTotal = matTotal + eqTotal + laborTotal + indirectTotal;

        let html = `
                <div class="print-header">
                    <h2>${sowId} — Breakdown</h2>
                    <div class="print-mono" style="font-family:'IBM Plex Mono',monospace;font-size:13px;color:var(--ink-soft);">Total Estimate: ₱${grandTotal.toFixed(2)}</div>
                </div>

                <div class="bm-summary">
                    <div class="bm-card"><div class="bm-label">Materials</div><div class="bm-value">₱${matTotal.toFixed(2)}</div></div>
                    <div class="bm-card"><div class="bm-label">Equipment</div><div class="bm-value">₱${eqTotal.toFixed(2)}</div></div>
                    <div class="bm-card"><div class="bm-label">Manpower</div><div class="bm-value">₱${laborTotal.toFixed(2)}</div></div>
                    <div class="bm-card"><div class="bm-label">Indirect Costs</div><div class="bm-value">₱${indirectTotal.toFixed(2)}</div></div>
                </div>

                <div class="print-section"><div class="ps-title">BOM (Materials)</div>
                    ${materials.length ? `<table class="ps-table"><thead><tr><th>Material</th><th>Description</th><th style="text-align:right">Qty</th><th style="text-align:right">Rate</th><th style="text-align:right">Cost</th></tr></thead><tbody>${materials.map(m => `<tr><td>${m.materialName || m.material}</td><td>${m.desc || '—'}</td><td style="text-align:right">${m.qty}</td><td style="text-align:right">₱${parseFloat(m.rate || 0).toFixed(2)}</td><td style="text-align:right">₱${parseFloat(m.cost || 0).toFixed(2)}</td></tr>`).join('')}</tbody></table>` : `<p style="font-size:12px;color:var(--ink-soft);">No materials assigned.</p>`}
                </div>

                <div class="print-section"><div class="ps-title">Equipment Needed</div>
                    ${equipment.length ? `<table class="ps-table"><thead><tr><th>Equipment</th><th>Description</th><th style="text-align:right">Qty</th><th style="text-align:right">Duration</th><th style="text-align:right">Rate</th><th style="text-align:right">Cost</th></tr></thead><tbody>${equipment.map(e => `<tr><td>${e.equipName || e.equipment}</td><td>${e.desc || '—'}</td><td style="text-align:right">${e.qty}</td><td style="text-align:right">${e.duration}</td><td style="text-align:right">₱${parseFloat(e.rate || 0).toFixed(2)}</td><td style="text-align:right">₱${parseFloat(e.cost || 0).toFixed(2)}</td></tr>`).join('')}</tbody></table>` : `<p style="font-size:12px;color:var(--ink-soft);">No equipment assigned.</p>`}
                </div>

                <div class="print-section"><div class="ps-title">Manpower</div>
                    ${labor.length ? `<table class="ps-table"><thead><tr><th>Role</th><th>Description</th><th style="text-align:right">Qty</th><th style="text-align:right">Duration</th><th style="text-align:right">Rate</th><th style="text-align:right">Cost</th></tr></thead><tbody>${labor.map(l => `<tr><td>${l.role}</td><td>${l.desc || '—'}</td><td style="text-align:right">${l.qty}</td><td style="text-align:right">${l.duration}</td><td style="text-align:right">₱${parseFloat(l.rate || 0).toFixed(2)}</td><td style="text-align:right">₱${parseFloat(l.cost || 0).toFixed(2)}</td></tr>`).join('')}</tbody></table>` : `<p style="font-size:12px;color:var(--ink-soft);">No manpower assigned.</p>`}
                </div>

                <div class="print-section"><div class="ps-title">Indirect Costs</div>
                    ${indirect.length ? `<table class="ps-table"><thead><tr><th>Description</th><th>Type</th><th style="text-align:right">Amount</th></tr></thead><tbody>${indirect.map(i => `<tr><td>${i.desc || '—'}</td><td>${i.type || '—'}</td><td style="text-align:right">₱${parseFloat(i.amount || 0).toFixed(2)}</td></tr>`).join('')}</tbody></table>` : `<p style="font-size:12px;color:var(--ink-soft);">No indirect costs assigned.</p>`}
                </div>

                <div class="print-actions">
                    <button class="btn-primary" onclick="window.print()">${Icon.printer({size:14})} Print</button>
                    <button class="btn-ghost" onclick="SOWBreakdownModal.close()">Close</button>
                </div>`;
        return html;
    }
};

// ─── LIGHTBOX ──────────────────────────────────────────────────

const Lightbox = {
    _images: [],
    _current: 0,
    open(images, index) {
        this._images = images;
        this._current = index;
        this._show();
        document.getElementById('lightbox').classList.add('open');
        document.body.style.overflow = 'hidden';
        document.addEventListener('keydown', this._onKey);
    },
    close() {
        document.getElementById('lightbox').classList.remove('open');
        document.body.style.overflow = '';
        document.removeEventListener('keydown', this._onKey);
    },
    prev() {
        if (this._images.length > 0) {
            this._current = (this._current - 1 + this._images.length) % this._images.length;
            this._show();
        }
    },
    next() {
        if (this._images.length > 0) {
            this._current = (this._current + 1) % this._images.length;
            this._show();
        }
    },
    _show() {
        const img = document.getElementById('lbImg');
        const counter = document.getElementById('lbCounter');
        if (this._images.length > 0) {
            img.src = this._images[this._current];
            counter.textContent = `${this._current + 1} / ${this._images.length}`;
        }
    },
    _onKey(e) {
        if (e.key === 'Escape') Lightbox.close();
        if (e.key === 'ArrowLeft') Lightbox.prev();
        if (e.key === 'ArrowRight') Lightbox.next();
    }
};

// ─── TOGGLE MENU ──────────────────────────────────────────────

function toggleMenu() {
    document.querySelectorAll('.topbar .actions').forEach(el => el.classList.toggle('open'));
}

// ─── LOGIN HANDLER ────────────────────────────────────────────

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim().toLowerCase();
    const pass = document.getElementById('login-pass').value.trim();
    let valid = true;

    if (!email) {
        document.getElementById('login-email-field').classList.add('error');
        valid = false;
    } else {
        document.getElementById('login-email-field').classList.remove('error');
    }
    if (!pass) {
        document.getElementById('login-pass-field').classList.add('error');
        valid = false;
    } else {
        document.getElementById('login-pass-field').classList.remove('error');
    }
    if (!valid) return false;

    let user;
    try {
        user = await DataService.login(email, pass);
    } catch (err) {
        UI.toast('' + err.message, 'error');
        document.getElementById('login-pass-field').classList.add('error');
        return false;
    }

    localStorage.setItem('fctc_user', JSON.stringify(user));
    App.currentUser = user;

    App.updateUserBadges();

    const label = document.getElementById('home-user-label');
    if (label) {
        label.textContent = `${user.roleLabel} — ${user.name}`;
    }

    UI.toast(`Welcome, ${user.name}! (${user.roleLabel})`, 'success');
    App.navigate('home');
    return false;
}