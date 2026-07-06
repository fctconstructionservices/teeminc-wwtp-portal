// ================================================================
//  FORM SUBMISSIONS — with Google Sheets & Drive integration
// ================================================================

// ─── REQUEST CASH ADVANCE ──────────────────────────────────────
async function submitRequestForm(e) {
    e.preventDefault();

    // --- Validation ---
    const project = document.getElementById('req-project').value;
    const description = document.getElementById('req-desc').value.trim();
    const amount = parseFloat(document.getElementById('req-amount').value);
    const requestType = document.getElementById('req-type').value;
    const scopeOfWork = document.getElementById('req-scope').value.trim();
    const dateNeeded = document.getElementById('req-date').value;
    const fileInput = document.getElementById('req-file');

    let valid = true;
    if (!project) {
        document.getElementById('req-project-field').classList.add('error');
        valid = false;
    } else {
        document.getElementById('req-project-field').classList.remove('error');
    }
    if (!description) {
        document.getElementById('req-desc-field').classList.add('error');
        valid = false;
    } else {
        document.getElementById('req-desc-field').classList.remove('error');
    }
    if (!amount || amount <= 0) {
        document.getElementById('req-amount-field').classList.add('error');
        valid = false;
    } else {
        document.getElementById('req-amount-field').classList.remove('error');
    }
    if (!valid) {
        UI.toast('Please fix the errors above.', 'error');
        return false;
    }

    // --- Confirm ---
    const confirmed = await Confirm.open('Submit Request?', `Submit for ₱${amount.toFixed(2)}?`);
    if (!confirmed) return false;

    // --- Show loading state ---
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
            project, description, amount, requestType, scopeOfWork, dateNeeded
        };

        // Optional file attachment -> base64, saved to Drive server-side
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
            resultDiv._hideTimer = setTimeout(() => { resultDiv.style.display = 'none'; }, 3000);
        }

        document.getElementById('requestForm').reset();
        if (fileInput) fileInput.value = '';

        if (typeof HomePage !== 'undefined' && HomePage.load) HomePage.load();

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

// Helper: convert a File object to a raw base64 string (no data: prefix)
function fileToBase64_(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// ─── LIQUIDATE ──────────────────────────────────────────────────
// (unchanged – still uses DataService mock)
async function submitLiquidateForm(e) {
    e.preventDefault();
    const requestId = document.getElementById('liq-req-id').value;
    const receiptNo = document.getElementById('liq-receipt').value.trim();
    const amount = parseFloat(document.getElementById('liq-amount').value);
    const description = document.getElementById('liq-desc').value.trim();
    let valid = true;
    if (!requestId) { document.getElementById('liq-req-field').classList.add('error');
        valid = false; } else { document.getElementById('liq-req-field').classList.remove('error'); }
    if (!receiptNo) { document.getElementById('liq-receipt-field').classList.add('error');
        valid = false; } else { document.getElementById('liq-receipt-field').classList.remove('error'); }
    if (!amount || amount <= 0) { document.getElementById('liq-amount-field').classList.add('error');
        valid = false; } else { document.getElementById('liq-amount-field').classList.remove('error'); }
    if (!description) { document.getElementById('liq-desc-field').classList.add('error');
        valid = false; } else { document.getElementById('liq-desc-field').classList.remove('error'); }
    if (!valid) return false;
    const confirmed = await Confirm.open('Submit Liquidation?', `Liquidate ${requestId}?`);
    if (!confirmed) return false;
    try {
        await DataService.submitLiquidation({ requestId, receiptNo, amount, description });
        UI.toast('Liquidation submitted!', 'success');
        document.getElementById('liquidateForm').reset();
        App.navigate('home');
    } catch (err) { UI.toast('' + err.message, 'error'); }
    return false;
}

// ─── RECORD INCOMING CASH ──────────────────────────────────────
async function submitRecordCashForm(e) {
    e.preventDefault();
    const description = document.getElementById('rc-desc').value.trim();
    const amount = parseFloat(document.getElementById('rc-amount').value);
    const project = document.getElementById('rc-project').value;
    const fileInput = document.getElementById('rc-file');
    let valid = true;
    if (!description) { document.getElementById('rc-desc-field').classList.add('error');
        valid = false; } else { document.getElementById('rc-desc-field').classList.remove('error'); }
    if (!amount || amount <= 0) { document.getElementById('rc-amount-field').classList.add('error');
        valid = false; } else { document.getElementById('rc-amount-field').classList.remove('error'); }
    if (!project) { document.getElementById('rc-project-field').classList.add('error');
        valid = false; } else { document.getElementById('rc-project-field').classList.remove('error'); }
    if (!valid) return false;
    const confirmed = await Confirm.open('Record Incoming Cash?', `Record ₱${amount.toFixed(2)}?`);
    if (!confirmed) return false;
    try {
        const payload = { description, amount, project };
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
    } catch (err) { UI.toast('' + err.message, 'error'); }
    return false;
}

// ─── RELEASE CASH ──────────────────────────────────────────────
// (unchanged)
async function submitReleaseForm(e) {
    e.preventDefault();
    const requestId = document.getElementById('rel-req-id').value;
    const amount = parseFloat(document.getElementById('rel-amount').value);
    let valid = true;
    if (!requestId) { document.getElementById('rel-req-field').classList.add('error');
        valid = false; } else { document.getElementById('rel-req-field').classList.remove('error'); }
    if (!amount || amount <= 0) { document.getElementById('rel-amount-field').classList.add('error');
        valid = false; } else { document.getElementById('rel-amount-field').classList.remove('error'); }
    if (!valid) return false;
    const confirmed = await Confirm.open('Release Cash?', `Release ₱${amount.toFixed(2)}?`);
    if (!confirmed) return false;
    try {
        await DataService.submitRelease({ requestId, amount });
        UI.toast('Cash released!', 'success');
        document.getElementById('releaseForm').reset();
        App.navigate('home');
    } catch (err) { UI.toast('' + err.message, 'error'); }
    return false;
}
