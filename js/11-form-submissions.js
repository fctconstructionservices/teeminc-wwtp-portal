// ================================================================
//  FORM SUBMISSIONS — with Google Sheets & Drive integration
//  PURPOSE: Handles all form submissions with proper validation
//  
//  FIXES APPLIED:
//  - Added comprehensive field validation (Issue 2.1)
//  - All fields must be filled before submission is allowed
//  - Proper error messaging for missing fields
//  - File upload support with base64 conversion
// ================================================================

/**
 * submitRequestForm - Handles Cash Advance request submission
 * 
 * PURPOSE: Validates all fields, shows confirmation dialog, 
 * converts file attachments to base64, and submits to backend
 * 
 * FIX: Added comprehensive field validation (Issue 2.1)
 * All required fields must be filled before proceeding
 */
async function submitRequestForm(e) {
    e.preventDefault();

    // --- FIX: Validate all required fields (Issue 2.1) ---
    const project = document.getElementById('req-project').value;
    const description = document.getElementById('req-desc').value.trim();
    const amount = parseFloat(document.getElementById('req-amount').value);
    const requestType = document.getElementById('req-type').value;
    const scopeOfWork = document.getElementById('req-scope').value.trim();
    const dateNeeded = document.getElementById('req-date').value;
    const fileInput = document.getElementById('req-file');

    // FIX: Check if all required fields are filled (Issue 2.1)
    let valid = true;
    let missingFields = [];
    
    // Validate Project field
    if (!project) {
        document.getElementById('req-project-field').classList.add('error');
        valid = false;
        missingFields.push('Project');
    } else {
        document.getElementById('req-project-field').classList.remove('error');
    }
    
    // Validate Description field
    if (!description) {
        document.getElementById('req-desc-field').classList.add('error');
        valid = false;
        missingFields.push('Description');
    } else {
        document.getElementById('req-desc-field').classList.remove('error');
    }
    
    // Validate Amount field
    if (!amount || amount <= 0) {
        document.getElementById('req-amount-field').classList.add('error');
        valid = false;
        missingFields.push('Amount');
    } else {
        document.getElementById('req-amount-field').classList.remove('error');
    }
    // Validate Date Needed
    
    if (!dateNeeded) {
        document.getElementById('req-date-field').classList.add('error');
        valid = false;
        missingFields.push('Date Needed');
    } else {
    document.getElementById('req-date-field').classList.remove('error');
    }

    // Validate File Upload

    const hasFile = fileInput && fileInput.files && fileInput.files.length > 0;
    if (!hasFile) {
        document.getElementById('req-file-field').classList.add('error');
        valid = false;
        missingFields.push('Quotation/Basis file');
    } else {
    document.getElementById('req-file-field').classList.remove('error');
}
    // If validation fails, show error message with missing fields
    if (!valid) {
        UI.toast(`Please fill in all required fields: ${missingFields.join(', ')}`, 'error');
        return false;
    }

    // --- Show confirmation dialog ---
    const confirmed = await Confirm.open('Submit Request?', `Submit for ₱${amount.toFixed(2)}?`);
    if (!confirmed) return false;

    // --- Show loading state while submitting ---
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
        // Build the payload
        const payload = {
            project, 
            description, 
            amount, 
            requestType, 
            scopeOfWork, 
            dateNeeded
        };

        // Handle file attachment - convert to base64 for server upload
        if (fileInput && fileInput.files.length > 0) {
            const file = fileInput.files[0];
            payload.fileBase64 = await fileToBase64_(file);
            payload.fileName = file.name;
            payload.fileMimeType = file.type;
        }

        // Submit to backend
        const data = await DataService.submitCashAdvance(payload);

        // Show success message
        UI.toast(`Request submitted successfully!`, 'success');

        // Update result div with success
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

        // Reset the form
        document.getElementById('requestForm').reset();
        if (fileInput) fileInput.value = '';

        // Reload home page to update data
        if (typeof HomePage !== 'undefined' && HomePage.load) {
            HomePage.load();
        }

    } catch (err) {
        console.error('Submission error:', err);
        UI.toast('' + err.message, 'error');

        // Show error in result div
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
 * 
 * PURPOSE: Prepares file attachments for server-side storage
 * Uses FileReader API to read the file and convert to base64
 * 
 * @param {File} file - The file to convert
 * @returns {Promise<string>} Base64 encoded string (without data: prefix)
 */
function fileToBase64_(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            // Remove the data:image/png;base64, prefix
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// ─── LIQUIDATE FORM ──────────────────────────────────────────────────

/**
 * submitLiquidateForm - Handles Liquidation submission
 * 
 * PURPOSE: Submits liquidation data with receipt details
 * Validates required fields before submission
 */
async function submitLiquidateForm(e) {
    e.preventDefault();
    
    // Get form values
    const requestId = document.getElementById('liq-req-id').value;
    const receiptNo = document.getElementById('liq-receipt').value.trim();
    const amount = parseFloat(document.getElementById('liq-amount').value);
    const description = document.getElementById('liq-desc').value.trim();
    
    // Validate required fields
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
    
    // Show confirmation
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
 * submitRecordCashForm - Handles Incoming Cash recording
 * 
 * PURPOSE: Records incoming cash transactions with proof attachment
 * Supports file upload for transfer receipts
 */
async function submitRecordCashForm(e) {
    e.preventDefault();
    
    // Get form values
    const description = document.getElementById('rc-desc').value.trim();
    const amount = parseFloat(document.getElementById('rc-amount').value);
    const project = document.getElementById('rc-project').value;
    const fileInput = document.getElementById('rc-file');
    
    // Validate required fields
    let valid = true;
    
    if (!description) { 
        document.getElementById('rc-desc-field').classList.add('error');
        valid = false; 
    } else { 
        document.getElementById('rc-desc-field').classList.remove('error'); 
    }
    
    if (!amount || amount <= 0) { 
        document.getElementById('rc-amount-field').classList.add('error');
        valid = false; 
    } else { 
        document.getElementById('rc-amount-field').classList.remove('error'); 
    }
    
    if (!project) { 
        document.getElementById('rc-project-field').classList.add('error');
        valid = false; 
    } else { 
        document.getElementById('rc-project-field').classList.remove('error'); 
    }
    
    if (!valid) return false;
    
    // Show confirmation
    const confirmed = await Confirm.open('Record Incoming Cash?', `Record ₱${amount.toFixed(2)}?`);
    if (!confirmed) return false;
    
    try {
        const payload = { description, amount, project };
        
        // Handle file attachment
        if (fileInput && fileInput.files.length > 0) {
            const file = fileInput.files[0];
            payload.fileBase64 = await fileToBase64_(file);
            payload.fileName = file.name;
            payload.fileMimeType = file.type;
        }
        
        await DataService.submitIncomingCash(payload);
        
        UI.toast('Cash recorded successfully!', 'success');
        document.getElementById('recordCashForm').reset();
        if (fileInput) fileInput.value = '';
        App.navigate('home');
    } catch (err) { 
        UI.toast('' + err.message, 'error'); 
    }
    
    return false;
}

// ─── RELEASE CASH FORM ──────────────────────────────────────────────

/**
 * submitReleaseForm - Handles Cash Release submission
 * 
 * PURPOSE: Releases approved cash advance funds
 * Validates request ID and amount before submission
 */
async function submitReleaseForm(e) {
    e.preventDefault();
    
    // Get form values
    const requestId = document.getElementById('rel-req-id').value;
    const amount = parseFloat(document.getElementById('rel-amount').value);
    
    // Validate required fields
    let valid = true;
    
    if (!requestId) { 
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
    
    if (!valid) return false;
    
    // Show confirmation
    const confirmed = await Confirm.open('Release Cash?', `Release ₱${amount.toFixed(2)}?`);
    if (!confirmed) return false;
    
    try {
        await DataService.submitRelease({ requestId, amount });
        
        UI.toast('Cash released!', 'success');
        document.getElementById('releaseForm').reset();
        App.navigate('home');
    } catch (err) { 
        UI.toast('' + err.message, 'error'); 
    }

     try {
        await DataService.submitRelease({ requestId, amount });
        UI.toast('Cash released!', 'success');
        document.getElementById('releaseForm').reset();
        
        // ✅ I-reload ang dropdown para mawala ang na-release na
        await loadReleaseDropdown();
        
        App.navigate('home');
    } catch (err) { 
        UI.toast('' + err.message, 'error'); 
    }
    
    return false;
}
    /**
    * loadReleaseDropdown - I-load ang approved cash advances sa dropdown
     * 
     * PURPOSE: Populate ang #rel-req-id dropdown na may available na cash advances
     */
    async function loadReleaseDropdown() {
      try {
        const select = document.getElementById('rel-req-id');
        if (!select) return;
    
    //  Kunin ang data mula sa backend
    const advances = await DataService.getApprovedCashAdvancesForRelease();
    
    //  I-clear ang options (except ang default placeholder)
    select.innerHTML = '<option value="">— Select approved request —</option>';
    
    //  Kung walang available, magpakita ng message
    if (!advances || advances.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = '— No approved cash advances available —';
      option.disabled = true;
      select.appendChild(option);
      return;
    }
    
    //  Idagdag ang mga options
    advances.forEach(function(ca) {
      const option = document.createElement('option');
      option.value = ca.id;
      const dateStr = ca.date ? new Date(ca.date).toLocaleDateString() : 'N/A';
      option.textContent = `${ca.id} · ${ca.requestor} · ₱${ca.amount.toFixed(2)} · ${dateStr}`;
      select.appendChild(option);
    });
    
  } catch (err) {
    console.error('Error loading release dropdown:', err);
    // Magpakita ng error message sa dropdown
    const select = document.getElementById('rel-req-id');
    if (select) {
      select.innerHTML = '<option value="">— Error loading requests —</option>';
    }
  }
}
    // updated project project list at Cash advance request form
    async function loadProjectsDropdown() {
    try {
        const data = await DataService.getHomeData(); // or create a dedicated getAllProjects action
        const select = document.getElementById('req-project');
        if (!select) return;
        
        // Clear existing options (keep the first one as placeholder if needed)
        select.innerHTML = '';
        
        data.projects.forEach(function(proj) {
            const option = document.createElement('option');
            option.value = proj.id;
            option.textContent = proj.name;
            select.appendChild(option);
        });
    } catch (err) {
        console.error('Error loading projects:', err);
    }
}
/**
 * loadSOWItemsForRequest - Punoan ang SOW dropdown base sa napiling project
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

    // I-disable muna habang naglo-load
    scopeSelect.innerHTML = '<option value="">Loading SOW items...</option>';
    scopeSelect.disabled = true;

    try {
        // Tawag sa bagong lightweight API
        const sowItems = await DataService.getSOWItemsForProject(projectId);

        // I-clear at punuan ang dropdown
        scopeSelect.innerHTML = '';
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = '— Select SOW Item —';
        scopeSelect.appendChild(defaultOption);

        sowItems.forEach(function(item) {
            const option = document.createElement('option');
            option.value = item.id;  // Hal. "A.1"
            // Display: "A.1 - Construction of Tempfacil"
            option.textContent = item.id + ' - ' + (item.description || 'No description');
            scopeSelect.appendChild(option);
        });

        scopeSelect.disabled = false;

    } catch (err) {
        console.error('Error loading SOW items:', err);
        scopeSelect.innerHTML = '<option value="">Error loading SOW items</option>';
        scopeSelect.disabled = false;
        UI.toast('Failed to load SOW items for this project.', 'error');
    }
}
    // Sa ibaba ng 11-form-submissions.js (o sa 12-init.js)

    document.addEventListener('DOMContentLoaded', function() {
    const projectSelect = document.getElementById('req-project');
    if (projectSelect) {
        // Kapag nagbago ang project, i-reload ang SOW dropdown
        projectSelect.addEventListener('change', loadSOWItemsForRequest);
        
        // Initial load para sa default na project (unang load ng page)
        // Maghintay ng konti para siguradong handa na ang DOM
        setTimeout(loadSOWItemsForRequest, 200);
    }
});
     
