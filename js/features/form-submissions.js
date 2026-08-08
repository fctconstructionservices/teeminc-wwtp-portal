// ================================================================
//  features/form-submissions.js — All request form handlers
//
//  PURPOSE: Validation + submission for Cash Advance, Incoming Cash,
//  Release Cash, Liquidation, Material and Equipment request forms,
//  including file/photo attachments (fileToBase64_) and the project
//  and pending-release dropdown loaders used by core/app.js routing.
// ================================================================

/**
 * setDateNeededMin - Sets the minimum selectable date for Date Needed
 * PURPOSE: The earliest selectable date is 3 days after today.
 */
/**
 * wireRequestBudgetCheck (v11 BATCH H1) - Attaches the budget check to
 * the cash advance form. Bound once, guarded by a flag, because
 * loadProjectsDropdown runs again on every visit to the page and
 * re-binding would stack duplicate listeners.
 */
function wireRequestBudgetCheck() {
    if (wireRequestBudgetCheck._done) return;
    ['req-project', 'req-scope', 'req-amount'].forEach(function (id) {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('change', refreshRequestBudgetCheck);
        el.addEventListener('input', refreshRequestBudgetCheck);
    });
    wireRequestBudgetCheck._done = true;
}

/**
 * ── v11 BATCH H3: VENDOR LOOKUP ON LIQUIDATION ──
 *
 * The vendor name stays FREE TEXT. Most liquidations are for the corner
 * hardware you buy from once, and forcing every one of those into the
 * supplier list would fill it with names nobody will ever use again.
 *
 * But when the vendor IS on record, the TIN should not have to be
 * looked up by hand — that is the field people leave blank, because
 * they do not have it in front of them. So a datalist offers the
 * suppliers you already have, and choosing one fills in the TIN.
 *
 * The match is case- and whitespace-insensitive, so a name typed by
 * hand still matches a supplier record.
 *
 * The TIN is only overwritten when it is empty or still holds the value
 * a previous match put there. Someone who typed a TIN by hand keeps it.
 */
var _liqSuppliers = [];
var _liqAutoFilledTin = '';

async function loadLiquidationVendors() {
    if (_liqSuppliers.length) return;
    if (!getSessionToken()) return;
    try {
        _liqSuppliers = (await DataService.getSuppliers()) || [];
    } catch (err) {
        _liqSuppliers = [];   // never block the form on this
        return;
    }
    const dl = document.getElementById('liq-vendor-list');
    if (!dl) return;
    dl.innerHTML = _liqSuppliers
        .filter(s => String(s.status || 'active').toLowerCase() !== 'inactive')
        .map(s => `<option value="${String(s.name).replace(/"/g, '&quot;')}"></option>`)
        .join('');
}

function matchLiquidationVendor() {
    const nameEl = document.getElementById('liq-vendor');
    const tinEl = document.getElementById('liq-tin');
    const hint = document.getElementById('liq-vendor-hint');
    if (!nameEl || !tinEl) return;

    const typed = nameEl.value.trim().toLowerCase();
    const hit = typed
        ? _liqSuppliers.find(s => String(s.name || '').trim().toLowerCase() === typed)
        : null;

    if (hit) {
        if (!tinEl.value.trim() || tinEl.value.trim() === _liqAutoFilledTin) {
            tinEl.value = hit.tin || '';
            _liqAutoFilledTin = hit.tin || '';
        }
        if (hint) {
            hint.textContent = hit.tin
                ? `On record — TIN filled from ${hit.name} (${hit.termsLabel || 'terms not set'}).`
                : `On record, but no TIN is saved against ${hit.name}. Add it under Knowledge Base → Suppliers.`;
            hint.style.color = hit.tin ? 'var(--green)' : 'var(--amber)';
        }
        return;
    }

    // Typed away from a match: clear only what we filled in.
    if (tinEl.value.trim() && tinEl.value.trim() === _liqAutoFilledTin) {
        tinEl.value = '';
        _liqAutoFilledTin = '';
    }
    if (hint) {
        hint.textContent = typed ? 'Not on the supplier list — enter the TIN by hand.' : '';
        hint.style.color = 'var(--ink-soft)';
    }
}

function setDateNeededMin() {
    const dateInput = document.getElementById('req-date');
    if (!dateInput) return;
    
    const today = new Date();
    const minDate = new Date(today);
    minDate.setDate(today.getDate() + 3);
    
    const year = minDate.getFullYear();
    const month = String(minDate.getMonth() + 1).padStart(2, '0');
    const day = String(minDate.getDate()).padStart(2, '0');
    const minDateStr = `${year}-${month}-${day}`;
    
    dateInput.setAttribute('min', minDateStr);
    
    if (!dateInput.value) {
        dateInput.value = minDateStr;
    }
}

/**
 * loadProjectsDropdown - Fills the project dropdown with ongoing projects only.
 * PURPOSE: Filter the list so only Ongoing projects appear in the dropdown.
 */
async function loadProjectsDropdown() {
    // v7.0.2: guard at the source. This also runs from DOMContentLoaded,
    // which fires before anyone has logged in, so checking only at the
    // navigate() call sites was not enough.
    if (!getSessionToken()) return;
    try {
        const data = await DataService.getHomeData();
        const select = document.getElementById('req-project');
        if (!select) return;
        
        const ongoingProjects = data.projects.filter(function(p) {
            const status = p.status ? p.status.toLowerCase() : '';
            return status === 'ongoing';
        });
        
        select.innerHTML = '';
        
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = '— Select Ongoing Project —';
        defaultOption.disabled = true;
        defaultOption.selected = true;
        select.appendChild(defaultOption);
        
        if (ongoingProjects.length === 0) {
            const noOption = document.createElement('option');
            noOption.value = '';
            noOption.textContent = '— No ongoing projects available —';
            noOption.disabled = true;
            select.appendChild(noOption);
        } else {
            ongoingProjects.forEach(function(proj) {
                const option = document.createElement('option');
                option.value = proj.id;
                option.textContent = proj.name + ' (' + proj.status + ')';
                select.appendChild(option);
            });
        }
        
        const firstSelected = select.value;
        if (firstSelected) {
            await loadSOWItemsForRequest();
        }
        
        setDateNeededMin();
        wireRequestBudgetCheck();   // v11 BATCH H1
        
        //console.log('✅ Ongoing projects loaded:', ongoingProjects.length);
        
    } catch (err) {
        console.error('Error loading ongoing projects:', err);
        const select = document.getElementById('req-project');
        if (select) {
            select.innerHTML = '<option value="">Error loading projects</option>';
        }
    }
}

/**
 * loadIncomingProjectsDropdown - Fills the incoming cash project dropdown.
 * PURPOSE: Same as loadProjectsDropdown but for record-cash form
 */
async function loadIncomingProjectsDropdown() {
    if (!getSessionToken()) return;   // v7.0.2: same reason as above
    try {
        const data = await DataService.getHomeData();
        const select = document.getElementById('rc-project');
        if (!select) return;
        
        const ongoingProjects = data.projects.filter(function(p) {
            const status = p.status ? p.status.toLowerCase() : '';
            return status === 'ongoing';
        });
        
        select.innerHTML = '';
        
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = '— Select Ongoing Project —';
        defaultOption.disabled = true;
        defaultOption.selected = true;
        select.appendChild(defaultOption);
        
        if (ongoingProjects.length === 0) {
            const noOption = document.createElement('option');
            noOption.value = '';
            noOption.textContent = '— No ongoing projects available —';
            noOption.disabled = true;
            select.appendChild(noOption);
        } else {
            ongoingProjects.forEach(function(proj) {
                const option = document.createElement('option');
                option.value = proj.id;
                option.textContent = proj.name + ' (' + proj.status + ')';
                select.appendChild(option);
            });
        }
        
        //console.log('✅ Incoming projects loaded:', ongoingProjects.length);
        
    } catch (err) {
        console.error('Error loading incoming projects:', err);
        const select = document.getElementById('rc-project');
        if (select) {
            select.innerHTML = '<option value="">Error loading projects</option>';
        }
    }
}

/**
 * ── v11 BATCH H1: BUDGET CHECK ON CASH ADVANCES ──
 *
 * A cash advance draws on exactly the same scope budget as a purchase
 * request, so it made no sense for one route to be checked and the
 * other not — and the unchecked one was the easier of the two to raise.
 *
 * The check is the SAME server call the purchase request uses
 * (checkPrBudget), so the two can never disagree about what a scope
 * item has left. It warns; it does not block. A site that genuinely has
 * to overspend a line will do so either way, and the useful thing is
 * that the approvers see it.
 *
 * Debounced, because it fires on every keystroke in the amount field
 * and each call reads several sheets.
 */
var _reqBudgetTimer = null;

function refreshRequestBudgetCheck() {
    clearTimeout(_reqBudgetTimer);
    _reqBudgetTimer = setTimeout(_doRequestBudgetCheck, 400);
}

async function _doRequestBudgetCheck() {
    const box = document.getElementById('req-budget');
    if (!box) return;
    const projectId = (document.getElementById('req-project') || {}).value || '';
    const sowId = (document.getElementById('req-scope') || {}).value || '';
    const amount = parseFloat((document.getElementById('req-amount') || {}).value) || 0;

    if (!projectId || !sowId || amount <= 0) { box.innerHTML = ''; return; }

    try {
        const b = await DataService.checkPrBudget(projectId, sowId, amount);
        const esc = v => String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const basisWord = { materials: 'materials estimate', estimate: 'estimate',
                            budget: 'SOW budget' }[b.basis] || 'budget';
        const title = { ok: 'Within the ' + basisWord,
                        near: 'Close to the ' + basisWord,
                        over: 'Over the ' + basisWord + ' for ' + sowId,
                        'no-estimate': 'Nothing to check against' }[b.state] || '';
        const pct = b.budget > 0 ? Math.min(100, Math.round(b.committed / b.budget * 100)) : 0;
        const pctThis = b.budget > 0 ? Math.min(100 - pct, Math.round(b.requested / b.budget * 100)) : 0;
        const peso = v => '₱' + fmtMoney(parseFloat(v) || 0);

        box.innerHTML =
            '<div class="pr-budget-box ' + b.state + '" style="margin-top:10px;">' +
                '<b>' + (b.state === 'over' ? Icon.warning({ size: 12 }) + ' ' : '') + title + '</b>' +
                '<p>' + esc(b.message) + '</p>' +
                (b.budget > 0
                    ? '<div class="pr-bar"><div class="pr-bar-used" style="width:' + pct + '%"></div>' +
                      '<div class="pr-bar-this" style="left:' + pct + '%;width:' + pctThis + '%"></div></div>' +
                      '<div class="pr-bar-nums"><span>Committed ' + peso(b.committed) +
                      ' · this request ' + peso(b.requested) + '</span><span>' +
                      esc(b.basisLabel || 'budget') + ' ' + peso(b.budget) + '</span></div>'
                    : '') +
            '</div>';
    } catch (err) {
        box.innerHTML = '';
    }
}

/**
 * loadSOWItemsForRequest - Fills the SOW dropdown for the selected project.
 * PURPOSE: Loads the selected project's SOW items into the scope-of-work dropdown
 */
async function loadSOWItemsForRequest() {
    const projectSelect = document.getElementById('req-project');
    const scopeSelect = document.getElementById('req-scope');
    if (!projectSelect || !scopeSelect) return;

    const projectId = projectSelect.value;
    if (!projectId) {
        scopeSelect.innerHTML = '<option value="">— Select SOW Item —</option>';
        scopeSelect.disabled = false;
        return;
    }

    scopeSelect.innerHTML = '<option value="">Loading SOW items...</option>';
    scopeSelect.disabled = true;

    try {
        const sowItems = await DataService.getSOWItemsForProject(projectId);

        scopeSelect.innerHTML = '';
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = '— Select SOW Item —';
        defaultOption.disabled = true;
        defaultOption.selected = true;
        scopeSelect.appendChild(defaultOption);

        if (sowItems.length === 0) {
            const noOption = document.createElement('option');
            noOption.value = '';
            noOption.textContent = '— No SOW items for this project —';
            noOption.disabled = true;
            scopeSelect.appendChild(noOption);
        } else {
            sowItems.forEach(function(item) {
                const option = document.createElement('option');
                option.value = item.id;
                option.textContent = item.id + ' - ' + (item.description || 'No description');
                scopeSelect.appendChild(option);
            });
        }

        scopeSelect.disabled = false;

    } catch (err) {
        console.error('Error loading SOW items:', err);
        scopeSelect.innerHTML = '<option value="">Error loading SOW items</option>';
        scopeSelect.disabled = false;
        UI.toast('Failed to load SOW items for this project.', 'error');
    }
}

/**
 * submitRequestForm - Handles Cash Advance request submission
 */
async function submitRequestForm(e) {
    e.preventDefault();

    const project = document.getElementById('req-project').value;
    const description = document.getElementById('req-desc').value.trim();
    const amount = parseFloat(document.getElementById('req-amount').value);
    const requestType = document.getElementById('req-type').value;
    const scopeOfWork = document.getElementById('req-scope').value.trim();
    const dateNeeded = document.getElementById('req-date').value;
    const fileInput = document.getElementById('req-file');

    let valid = true;
    let missingFields = [];
    
    if (!project) {
        document.getElementById('req-project-field').classList.add('error');
        valid = false;
        missingFields.push('Project');
    } else {
        document.getElementById('req-project-field').classList.remove('error');
    }
    
    if (!description) {
        document.getElementById('req-desc-field').classList.add('error');
        valid = false;
        missingFields.push('Description');
    } else {
        document.getElementById('req-desc-field').classList.remove('error');
    }

    if (!scopeOfWork) {
        document.getElementById('req-scope-field').classList.add('error');
        valid = false;
        missingFields.push('SOW Item');
    } else {
        document.getElementById('req-scope-field').classList.remove('error');
    }
    
    if (!amount || amount <= 0) {
        document.getElementById('req-amount-field').classList.add('error');
        valid = false;
        missingFields.push('Amount');
    } else {
        document.getElementById('req-amount-field').classList.remove('error');
    }
    
    if (dateNeeded) {
        const selectedDate = new Date(dateNeeded);
        const today = new Date();
        const minDate = new Date(today);
        minDate.setDate(today.getDate() + 3);
        
        selectedDate.setHours(0, 0, 0, 0);
        minDate.setHours(0, 0, 0, 0);
        
        if (selectedDate < minDate) {
            document.getElementById('req-date-field').classList.add('error');
            valid = false;
            missingFields.push('Date must be at least 3 days from today');
        } else {
            document.getElementById('req-date-field').classList.remove('error');
        }
    } else {
        document.getElementById('req-date-field').classList.add('error');
        valid = false;
        missingFields.push('Date Needed');
    }

    const hasFile = fileInput && fileInput.files && fileInput.files.length > 0;
    if (!hasFile) {
        document.getElementById('req-file-field').classList.add('error');
        valid = false;
        missingFields.push('Quotation/Basis file');
    } else {
        document.getElementById('req-file-field').classList.remove('error');
    }
    
    if (!valid) {
        UI.toast(`Please fill in all required fields: ${missingFields.join(', ')}`, 'error');
        return false;
    }

    const confirmed = await Confirm.open('Submit Request?', `Submit for ₱${fmtMoney(amount)}?`);
    if (!confirmed) return false;

    const resultDiv = document.getElementById('submissionResult');
    if (resultDiv) {
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = `
            <div style="display:flex;gap:10px;align-items:center;color:var(--ink);">
                <span class="loader" style="width:20px;height:20px;border-width:2px;"></span>
                Submitting…
            </div>
        `;
        resultDiv.style.background = 'var(--blueprint-tint)';
        resultDiv.style.color = 'var(--ink)';
    }

    try {
        const payload = {
            project, 
            description, 
            amount, 
            requestType, 
            scopeOfWork, 
            sowId: scopeOfWork,   // v3: req-scope's value IS the SOW id — this feeds the SOW "actual" via Reviewed releases
            dateNeeded
        };

        if (fileInput && fileInput.files.length > 0) {
            const file = fileInput.files[0];
            payload.fileBase64 = await fileToBase64_(file);
            payload.fileName = file.name;
            payload.fileMimeType = file.type;
        }

        const data = await DataService.submitCashAdvance(payload);
        UI.toast(`Request submitted successfully!`, 'success');

        if (resultDiv) {
            resultDiv.style.background = '#E7F3EA';
            resultDiv.style.color = '#1C2321';
            resultDiv.innerHTML = `
                <div style="display:flex;gap:10px;align-items:center;">
                    <span>${Icon.checkCircle({size:20})}</span>
                    <strong>Request submitted successfully!</strong>
                </div>
            `;
            clearTimeout(resultDiv._hideTimer);
            resultDiv._hideTimer = setTimeout(() => { 
                resultDiv.style.display = 'none'; 
            }, 3000);
        }

        document.getElementById('requestForm').reset();
        if (fileInput) fileInput.value = '';

        if (typeof HomePage !== 'undefined' && HomePage.load) {
            HomePage.load();
        }

    } catch (err) {
        console.error('Submission error:', err);
        UI.toast('' + err.message, 'error');

        if (resultDiv) {
            resultDiv.style.background = '#FAEBE9';
            resultDiv.style.color = '#1C2321';
            resultDiv.innerHTML = `
                <div style="display:flex;gap:12px;align-items:center;">
                    <span>${Icon.xCircle({size:28})}</span>
                    <div>
                        <strong style="color:#B23A2E;">Submission failed</strong>
                        <br /><span style="font-size:13px;color:#5B6360;">${err.message}</span>
                    </div>
                </div>
            `;
        }
    }

    return false;
}

/**
 * fileToBase64_ - Convert a File object to base64 string
 */
function fileToBase64_(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// ─── LIQUIDATE FORM ──────────────────────────────────────────────────

/**
 * submitLiquidateForm - Handles liquidation submission
 * PURPOSE: Records liquidation with receipt and amount
 */
async function submitLiquidateForm(e) {
    e.preventDefault();
    
    const requestId = document.getElementById('liq-req-id').value;
    const receiptNo = document.getElementById('liq-receipt').value.trim();
    const amount = parseFloat(document.getElementById('liq-amount').value);
    const description = document.getElementById('liq-desc').value.trim();
    const vendor = document.getElementById('liq-vendor').value.trim();
    const tin = document.getElementById('liq-tin').value.trim();
    const date = document.getElementById('liq-date').value;
    const fileInput = document.getElementById('liq-file');
    
    let valid = true;
    let missingFields = [];
    
    if (!requestId) { 
        document.getElementById('liq-req-field').classList.add('error');
        valid = false;
        missingFields.push('Cash Advance Request ID');
    } else { 
        document.getElementById('liq-req-field').classList.remove('error'); 
    }
    
    if (!receiptNo) { 
        document.getElementById('liq-receipt-field').classList.add('error');
        valid = false;
        missingFields.push('Receipt No.');
    } else { 
        document.getElementById('liq-receipt-field').classList.remove('error'); 
    }
    
    if (!amount || amount <= 0) { 
        document.getElementById('liq-amount-field').classList.add('error');
        valid = false;
        missingFields.push('Amount');
    } else { 
        document.getElementById('liq-amount-field').classList.remove('error'); 
    }
    
    if (!description) { 
        document.getElementById('liq-desc-field').classList.add('error');
        valid = false;
        missingFields.push('Description');
    } else { 
        document.getElementById('liq-desc-field').classList.remove('error'); 
    }
    
    // File is optional for liquidation
    const hasFile = fileInput && fileInput.files && fileInput.files.length > 0;
    
    if (!valid) {
        UI.toast(`Please fill in all required fields: ${missingFields.join(', ')}`, 'error');
        return false;
    }
    
    const confirmed = await Confirm.open('Submit Liquidation?', `Liquidate ₱${fmtMoney(amount)} for request ${requestId}?`);
    if (!confirmed) return false;
    
    try {
        const payload = { 
            requestId,
            receiptNo,
            amount,
            description,
            vendor: vendor || '',
            tin: tin || '',
            date: date || new Date().toISOString().split('T')[0],
            projectId: '' // will be derived from the cash advance
        };
        
        if (hasFile) {
            const file = fileInput.files[0];
            payload.fileBase64 = await fileToBase64_(file);
            payload.fileName = file.name;
            payload.fileMimeType = file.type;
        }
        
        await DataService.submitLiquidation(payload);
        
        UI.toast('Liquidation submitted for approval!', 'success');
        document.getElementById('liquidateForm').reset();
        if (fileInput) fileInput.value = '';
        App.navigate('home');
        
        if (typeof HomePage !== 'undefined' && HomePage.load) {
            HomePage.load();
        }
    } catch (err) { 
        UI.toast('' + err.message, 'error'); 
    }
    
    return false;
}

// ─── RECORD INCOMING CASH FORM ──────────────────────────────────────

/**
 * submitRecordCashForm - Handles Incoming Cash recording with approval
 * PURPOSE: Records incoming cash transactions with proof attachment
 */
async function submitRecordCashForm(e) {
    e.preventDefault();
    
    const type = document.getElementById('rc-type').value;
    const description = document.getElementById('rc-desc').value.trim();
    const amount = parseFloat(document.getElementById('rc-amount').value);
    const method = document.getElementById('rc-method').value;
    const reference = document.getElementById('rc-ref').value.trim();
    const date = document.getElementById('rc-date').value;
    const project = document.getElementById('rc-project').value;
    const fileInput = document.getElementById('rc-file');
    
    let valid = true;
    let missingFields = [];
    
    if (!type) {
        document.getElementById('rc-type-field').classList.add('error');
        valid = false;
        missingFields.push('Transaction Type');
    } else {
        document.getElementById('rc-type-field').classList.remove('error');
    }
    
    if (!description) {
        document.getElementById('rc-desc-field').classList.add('error');
        valid = false;
        missingFields.push('Description');
    } else {
        document.getElementById('rc-desc-field').classList.remove('error');
    }
    
    if (!amount || amount <= 0) {
        document.getElementById('rc-amount-field').classList.add('error');
        valid = false;
        missingFields.push('Amount');
    } else {
        document.getElementById('rc-amount-field').classList.remove('error');
    }
    
    if (!method) {
        document.getElementById('rc-method-field').classList.add('error');
        valid = false;
        missingFields.push('Payment Method');
    } else {
        document.getElementById('rc-method-field').classList.remove('error');
    }
    
    if (!reference) {
        document.getElementById('rc-ref-field').classList.add('error');
        valid = false;
        missingFields.push('Reference Number');
    } else {
        document.getElementById('rc-ref-field').classList.remove('error');
    }
    
    if (!date) {
        document.getElementById('rc-date-field').classList.add('error');
        valid = false;
        missingFields.push('Transaction Date');
    } else {
        document.getElementById('rc-date-field').classList.remove('error');
    }
    
    if (!project) {
        document.getElementById('rc-project-field').classList.add('error');
        valid = false;
        missingFields.push('Project');
    } else {
        document.getElementById('rc-project-field').classList.remove('error');
    }
    
    const hasFile = fileInput && fileInput.files && fileInput.files.length > 0;
    if (!hasFile) {
        document.getElementById('rc-file-field').classList.add('error');
        valid = false;
        missingFields.push('Proof of Transaction');
    } else {
        document.getElementById('rc-file-field').classList.remove('error');
    }
    
    if (!valid) {
        UI.toast(`Please fill in all required fields: ${missingFields.join(', ')}`, 'error');
        return false;
    }
    
    const confirmed = await Confirm.open('Record Incoming Cash?', 
        `Record ₱${fmtMoney(amount)} for ${project}?\n\nThis will be submitted for approval.`);
    if (!confirmed) return false;
    
    const submitBtn = document.querySelector('#recordCashForm .btn-primary');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Submitting...';
    submitBtn.disabled = true;
    
    try {
        const payload = { 
            type,
            description, 
            amount, 
            method,
            reference,
            date,
            project
        };
        
        if (fileInput && fileInput.files.length > 0) {
            const file = fileInput.files[0];
            payload.fileBase64 = await fileToBase64_(file);
            payload.fileName = file.name;
            payload.fileMimeType = file.type;
        }
        
        await DataService.submitIncomingCash(payload);
        
        UI.toast('Cash recorded! Submitted for approval.', 'success');
        document.getElementById('recordCashForm').reset();
        if (fileInput) fileInput.value = '';
        App.navigate('home');
        
        if (typeof HomePage !== 'undefined' && HomePage.load) {
            HomePage.load();
        }
        
    } catch (err) {
        console.error('Submission error:', err);
        UI.toast('' + err.message, 'error');
    } finally {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
    
    return false;
}

// ─── RELEASE CASH FORM ──────────────────────────────────────────────

/**
 * loadReleaseDropdown - I-load ang pending releases mula sa CashRelease sheet
 * PURPOSE: Only shows releases with status 'Pending'
 */
/**
 * loadLiquidateDropdown (v4) - Auto-populates the Liquidate Cash Advance
 * form with Reviewed advances that still need liquidating. Each option
 * shows the remaining (unliquidated) balance; selecting one pre-fills the
 * amount with that remaining balance. Entries vanish once fully liquidated.
 */
async function loadLiquidateDropdown() {
    try {
        const select = document.getElementById('liq-req-id');
        if (!select) return;

        const rows = await DataService.getReleasesToLiquidate();

        select.innerHTML = '<option value="">— Select released cash advance —</option>';
        if (!rows || rows.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = '— No advances awaiting liquidation —';
            opt.disabled = true;
            select.appendChild(opt);
            return;
        }

        rows.forEach(function (r) {
            const opt = document.createElement('option');
            opt.value = r.cashAdvanceId;
            opt.dataset.remaining = r.remaining;
            opt.dataset.projectId = r.projectId || '';
            opt.textContent = `${r.cashAdvanceId} · ${r.requestor} · req ₱${fmtMoney(parseFloat(r.requested))} · remaining ₱${fmtMoney(parseFloat(r.remaining))}`;
            select.appendChild(opt);
        });

        select.addEventListener('change', function () {
            const sel = this.options[this.selectedIndex];
            const amt = document.getElementById('liq-amount');
            if (amt && sel && sel.dataset.remaining) {
                amt.value = parseFloat(sel.dataset.remaining).toFixed(2);
            }
        });
    } catch (err) {
        console.error('Liquidate dropdown load error:', err);
    }
}

async function loadReleaseDropdown() {
    try {
        const select = document.getElementById('rel-req-id');
        if (!select) return;
    
        const releases = await DataService.getPendingCashReleases();
        
        select.innerHTML = '<option value="">— Select pending release —</option>';
        
        if (!releases || releases.length === 0) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = '— No pending releases available —';
            option.disabled = true;
            select.appendChild(option);
            return;
        }
        
        releases.forEach(function(r) {
            const option = document.createElement('option');
            option.value = r.id;
            option.dataset.amount = r.amount;
            const dateStr = r.createdAt ? new Date(r.createdAt).toLocaleDateString() : 'N/A';
            option.textContent = `${r.id} · ${r.requestor} · ₱${fmtMoney(parseFloat(r.amount))} · ${dateStr}`;
            select.appendChild(option);
        });
        
        select.addEventListener('change', function() {
            const selected = this.options[this.selectedIndex];
            const amountInput = document.getElementById('rel-amount');
            if (selected && selected.dataset.amount) {
                amountInput.value = parseFloat(selected.dataset.amount).toFixed(2);
                amountInput.dataset.approvedAmount = selected.dataset.amount;
            } else {
                amountInput.value = '';
                amountInput.dataset.approvedAmount = '';
            }
        });
        
    } catch (err) {
        console.error('Error loading release dropdown:', err);
        const select = document.getElementById('rel-req-id');
        if (select) {
            select.innerHTML = '<option value="">— Error loading requests —</option>';
        }
    }
}

/**
 * submitReleaseForm - Super Admin submits release for review
 * PURPOSE: Changes status from Pending to For Review
 */
async function submitReleaseForm(e) {
    e.preventDefault();
    
    const releaseId = document.getElementById('rel-req-id').value;
    const amount = parseFloat(document.getElementById('rel-amount').value);
    const approvedAmount = parseFloat(document.getElementById('rel-amount').dataset.approvedAmount) || 0;
    
    let valid = true;
    
    if (!releaseId) { 
        document.getElementById('rel-req-field').classList.add('error');
        valid = false; 
    } else { 
        document.getElementById('rel-req-field').classList.remove('error'); 
    }
    
    if (!amount || amount <= 0) { 
        document.getElementById('rel-amount-field').classList.add('error');
        valid = false; 
    } else {
        document.getElementById('rel-amount-field').classList.remove('error');
    }
    
    if (amount != approvedAmount) {
        document.getElementById('rel-amount-field').classList.add('error');
        UI.toast(`Release amount (₱${fmtMoney(amount)}) is not equal to the approved amount (₱${fmtMoney(approvedAmount)}).`, 'error');
        return false;
    }
    
    if (!valid) return false;
    
    const confirmed = await Confirm.open('Release Cash?', `Release ₱${fmtMoney(amount)} for ${releaseId}?\n\nThis will be submitted for review by Administrators.`);
    if (!confirmed) return false;
    
    try {
        await DataService.submitRelease({ releaseId, amount });
        UI.toast('Release submitted for review by Administrators.', 'success');
        document.getElementById('releaseForm').reset();
        await loadReleaseDropdown();
        App.navigate('home');
        
        if (typeof HomePage !== 'undefined' && HomePage.load) {
            HomePage.load();
        }
    } catch (err) { 
        UI.toast('' + err.message, 'error'); 
    }
    
    return false;
}

// ─── DOM EVENT LISTENERS ───────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function() {
    // v7.0.2: only wire up listeners here. The dropdowns are populated by
    // App.navigate() once a session exists — fetching on page load ran
    // before login and produced "Session expired" errors.
    const projectSelect = document.getElementById('req-project');
    if (projectSelect) {
        projectSelect.addEventListener('change', loadSOWItemsForRequest);
        if (getSessionToken()) loadProjectsDropdown();
    }

    const rcProjectSelect = document.getElementById('rc-project');
    if (rcProjectSelect && getSessionToken()) {
        loadIncomingProjectsDropdown();
    }
});