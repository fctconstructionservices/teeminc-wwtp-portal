// ================================================================
//  FORM SUBMISSIONS — with Google Sheets & Drive integration
//  PURPOSE: Handles all form submissions with proper validation
//  
//  UPDATED: Works with new separate sheets structure
//  - Cash Advance → CashAdvanceRequests sheet
//  - Incoming Cash → IncomingCashRequests sheet
//  - Release Cash → CashRelease sheet
// ================================================================

/**
 * setDateNeededMin - I-set ang minimum date para sa Date Needed field
 * PURPOSE: Ang pinakamaagang pwedeng piliin ay 3 days after today
 */
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
 * loadProjectsDropdown - Punoan ang project dropdown ng ongoing projects lang
 * PURPOSE: I-filter ang projects para Ongoing lang ang lumabas sa dropdown
 */
async function loadProjectsDropdown() {
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
        
        console.log('✅ Ongoing projects loaded:', ongoingProjects.length);
        
    } catch (err) {
        console.error('Error loading ongoing projects:', err);
        const select = document.getElementById('req-project');
        if (select) {
            select.innerHTML = '<option value="">Error loading projects</option>';
        }
    }
}

/**
 * loadIncomingProjectsDropdown - Punoan ang incoming cash project dropdown
 * PURPOSE: Same as loadProjectsDropdown but for record-cash form
 */
async function loadIncomingProjectsDropdown() {
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
        
        console.log('✅ Incoming projects loaded:', ongoingProjects.length);
        
    } catch (err) {
        console.error('Error loading incoming projects:', err);
        const select = document.getElementById('rc-project');
        if (select) {
            select.innerHTML = '<option value="">Error loading projects</option>';
        }
    }
}

/**
 * loadSOWItemsForRequest - Punoan ang SOW dropdown base sa napiling project
 * PURPOSE: I-load ang SOW items ng napiling project para sa scope of work dropdown
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

    const confirmed = await Confirm.open('Submit Request?', `Submit for ₱${amount.toFixed(2)}?`);
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

async function submitLiquidateForm(e) {
    e.preventDefault();
    
    const requestId = document.getElementById('liq-req-id').value;
    const receiptNo = document.getElementById('liq-receipt').value.trim();
    const amount = parseFloat(document.getElementById('liq-amount').value);
    const description = document.getElementById('liq-desc').value.trim();
    
    let valid = true;
    
    if (!requestId) { 
        document.getElementById('liq-req-field').classList.add('error');
        valid = false; 
    } else { 
        document.getElementById('liq-req-field').classList.remove('error'); 
    }
    
    if (!receiptNo) { 
        document.getElementById('liq-receipt-field').classList.add('error');
        valid = false; 
    } else { 
        document.getElementById('liq-receipt-field').classList.remove('error'); 
    }
    
    if (!amount || amount <= 0) { 
        document.getElementById('liq-amount-field').classList.add('error');
        valid = false; 
    } else { 
        document.getElementById('liq-amount-field').classList.remove('error'); 
    }
    
    if (!description) { 
        document.getElementById('liq-desc-field').classList.add('error');
        valid = false; 
    } else { 
        document.getElementById('liq-desc-field').classList.remove('error'); 
    }
    
    if (!valid) return false;
    
    const confirmed = await Confirm.open('Submit Liquidation?', `Liquidate ${requestId}?`);
    if (!confirmed) return false;
    
    try {
        await DataService.submitLiquidation({ 
            requestId, 
            receiptNo, 
            amount, 
            description 
        });
        
        UI.toast('Liquidation submitted!', 'success');
        document.getElementById('liquidateForm').reset();
        App.navigate('home');
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
        `Record ₱${amount.toFixed(2)} for ${project}?\n\nThis will be submitted for approval.`);
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
            option.textContent = `${r.id} · ${r.requestor} · ₱${parseFloat(r.amount).toFixed(2)} · ${dateStr}`;
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
    
    if (amount > approvedAmount) {
        document.getElementById('rel-amount-field').classList.add('error');
        UI.toast(`Release amount (₱${amount.toFixed(2)}) exceeds approved amount (₱${approvedAmount.toFixed(2)}).`, 'error');
        return false;
    }
    
    if (!valid) return false;
    
    const confirmed = await Confirm.open('Release Cash?', `Release ₱${amount.toFixed(2)} for ${releaseId}?\n\nThis will be submitted for review by Administrators.`);
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
    const projectSelect = document.getElementById('req-project');
    if (projectSelect) {
        loadProjectsDropdown();
        projectSelect.addEventListener('change', loadSOWItemsForRequest);
    }
    
    const rcProjectSelect = document.getElementById('rc-project');
    if (rcProjectSelect) {
        loadIncomingProjectsDropdown();
    }
});