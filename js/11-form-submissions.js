// ================================================================
//  FORM SUBMISSIONS — with Google Sheets & Drive integration
//  PURPOSE: Handles all form submissions with proper validation
//  
//  FIXES APPLIED:
//  - Added comprehensive field validation (Issue 2.1)
//  - All fields must be filled before submission is allowed
//  - Proper error messaging for missing fields
//  - File upload support with base64 conversion
//  - NEW: Project dropdown shows only Ongoing projects
//  - NEW: SOW dropdown dynamically loads based on selected project
//  - NEW: Record Incoming Cash now requires approval
//  - NEW: All fields required for Record Incoming Cash
// ================================================================

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

// ─── RECORD INCOMING CASH FORM (UPDATED) ──────────────────────

/**
 * submitRecordCashForm - Handles Incoming Cash recording with approval
 * 
 * PURPOSE: Records incoming cash transactions with proof attachment
 * Supports file upload for transfer receipts
 * 
 * FIX: All fields are now required
 * FIX: Creates a request that requires approval
 * FIX: Project dropdown shows ongoing projects only
 */
async function submitRecordCashForm(e) {
    e.preventDefault();
    
    // Get form values
    const type = document.getElementById('rc-type').value;
    const description = document.getElementById('rc-desc').value.trim();
    const amount = parseFloat(document.getElementById('rc-amount').value);
    const method = document.getElementById('rc-method').value;
    const reference = document.getElementById('rc-ref').value.trim();
    const date = document.getElementById('rc-date').value;
    const project = document.getElementById('rc-project').value;
    const fileInput = document.getElementById('rc-file');
    
    // ─── VALIDATE ALL FIELDS ──────────────────────────────────
    let valid = true;
    let missingFields = [];
    
    // Validate Type
    if (!type) {
        document.getElementById('rc-type-field').classList.add('error');
        valid = false;
        missingFields.push('Transaction Type');
    } else {
        document.getElementById('rc-type-field').classList.remove('error');
    }
    
    // Validate Description
    if (!description) {
        document.getElementById('rc-desc-field').classList.add('error');
        valid = false;
        missingFields.push('Description');
    } else {
        document.getElementById('rc-desc-field').classList.remove('error');
    }
    
    // Validate Amount
    if (!amount || amount <= 0) {
        document.getElementById('rc-amount-field').classList.add('error');
        valid = false;
        missingFields.push('Amount');
    } else {
        document.getElementById('rc-amount-field').classList.remove('error');
    }
    
    // Validate Payment Method
    if (!method) {
        document.getElementById('rc-method-field').classList.add('error');
        valid = false;
        missingFields.push('Payment Method');
    } else {
        document.getElementById('rc-method-field').classList.remove('error');
    }
    
    // Validate Reference Number
    if (!reference) {
        document.getElementById('rc-ref-field').classList.add('error');
        valid = false;
        missingFields.push('Reference Number');
    } else {
        document.getElementById('rc-ref-field').classList.remove('error');
    }
    
    // Validate Date
    if (!date) {
        document.getElementById('rc-date-field').classList.add('error');
        valid = false;
        missingFields.push('Transaction Date');
    } else {
        document.getElementById('rc-date-field').classList.remove('error');
    }
    
    // Validate Project
    if (!project) {
        document.getElementById('rc-project-field').classList.add('error');
        valid = false;
        missingFields.push('Project');
    } else {
        document.getElementById('rc-project-field').classList.remove('error');
    }
    
    // Validate File Upload (now required)
    const hasFile = fileInput && fileInput.files && fileInput.files.length > 0;
    if (!hasFile) {
        document.getElementById('rc-file-field').classList.add('error');
        valid = false;
        missingFields.push('Proof of Transaction');
    } else {
        document.getElementById('rc-file-field').classList.remove('error');
    }
    
    // If validation fails
    if (!valid) {
        UI.toast(`Please fill in all required fields: ${missingFields.join(', ')}`, 'error');
        return false;
    }
    
    // ─── CONFIRMATION ──────────────────────────────────────────
    const confirmed = await Confirm.open('Record Incoming Cash?', 
        `Record ₱${amount.toFixed(2)} for ${project}?\n\nThis will be submitted for approval.`);
    if (!confirmed) return false;
    
    // ─── LOADING STATE ─────────────────────────────────────────
    const submitBtn = document.querySelector('#recordCashForm .btn-primary');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Submitting...';
    submitBtn.disabled = true;
    
    // ─── SUBMIT ──────────────────────────────────────────────────
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
        
        // Handle file attachment
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
        
        // Reload home to update pending count
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

/**
 * submitRequestForm - Handles Cash Advance request submission
 * (Unchanged — keep as is)
 */
async function submitRequestForm(e) {
    // ... existing code (unchanged) ...
}

/**
 * submitLiquidateForm - Handles Liquidation submission
 * (Unchanged — keep as is)
 */
async function submitLiquidateForm(e) {
    // ... existing code (unchanged) ...
}

/**
 * submitReleaseForm - Handles Cash Release submission
 * (Unchanged — keep as is)
 */
async function submitReleaseForm(e) {
    // ... existing code (unchanged) ...
}

/**
 * fileToBase64_ - Convert a File object to base64 string
 * (Unchanged — keep as is)
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

/**
 * loadReleaseDropdown - I-load ang approved cash advances sa dropdown
 * (Unchanged — keep as is)
 */
async function loadReleaseDropdown() {
    // ... existing code (unchanged) ...
}

// ─── DOM EVENT LISTENERS ───────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function() {
    // Cash Advance: Project dropdown - load ongoing projects
    const projectSelect = document.getElementById('req-project');
    if (projectSelect) {
        loadProjectsDropdown();
        projectSelect.addEventListener('change', loadSOWItemsForRequest);
    }
    
    // Record Incoming Cash: Project dropdown - load ongoing projects
    const rcProjectSelect = document.getElementById('rc-project');
    if (rcProjectSelect) {
        loadIncomingProjectsDropdown();
    }
});
