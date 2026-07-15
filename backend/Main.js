/**
 * ============================================
 * FILE: Main.gs
 * PURPOSE: Entry point (doGet / doPost) at Router.
 *          Dinadaan lahat ng API requests dito.
 * DEPENDENCIES: Lahat ng ibang .gs files
 * ============================================
 */

// Ang doGet ay ginagamit lang kung web app ang GAS.
// Dahil nasa GitHub Pages ang frontend, gagamitin natin ang doPost bilang API endpoint.
function doPost(e) {
  try {
    var action, payload;

    // Frontend (api-client.js) sends form-urlencoded data (action + payload),
    // hindi raw JSON body. GAS auto-parses form-urlencoded POST data into e.parameter.
    if (e.parameter && e.parameter.action) {
      action = e.parameter.action;
      payload = e.parameter.payload ? JSON.parse(e.parameter.payload) : {};
    } else if (e.postData && e.postData.type === 'application/json') {
      // Fallback: support raw JSON body too, in case ito yung gamitin sa future.
      var data = JSON.parse(e.postData.contents);
      action = data.action;
      payload = data.payload || {};
    } else {
      return respond(errorResponse('No valid action/payload found in request.'));
    }
    
    // Switch para sa lahat ng actions
    switch (action) {
      // Auth
      case 'login':
        return ContentService.createTextOutput(JSON.stringify(authenticateUser(payload.username, payload.password)))
          .setMimeType(ContentService.MimeType.JSON);
      
      // Projects
      case 'getProjects':
        return respond(getProjects());
      case 'addProject':
        return respond(addProject(payload));
      case 'updateProjectStatus':
        return respond(updateProjectStatus(payload.projectId, payload.status));
      
      // Finance - Cash Advance
      case 'getCashAdvances':
        return respond(getCashAdvances());
      case 'submitCashAdvance':
        return respond(submitCashAdvance(payload));
      case 'updateCashAdvanceStatus':
        return respond(updateCashAdvanceStatus(payload.requestId, payload.status, payload.remarks));
      
      // Finance - Cash Release
      case 'getCashReleases':
        return respond(getCashReleases());
      case 'submitCashRelease':
        return respond(submitCashRelease(payload));
      case 'updateCashReleaseStatus':
        return respond(updateCashReleaseStatus(payload.requestId, payload.status, payload.remarks));
      
      // Finance - Incoming Cash
      case 'getIncomingCash':
        return respond(getIncomingCash());
      case 'submitIncomingCash':
        return respond(submitIncomingCash(payload));
      
      // Finance - Summary
      case 'getFinanceSummary':
        return respond(getFinanceSummary());
      
      // Materials
      case 'getMaterials':
        return respond(getMaterials());
      case 'addMaterial':
        return respond(addMaterial(payload));
      case 'updateMaterial':
        return respond(updateMaterial(payload.id, payload.field, payload.value));
      
      // Equipment
      case 'getEquipment':
        return respond(getEquipment());
      case 'addEquipment':
        return respond(addEquipment(payload));
      case 'updateEquipment':
        return respond(updateEquipment(payload.id, payload.field, payload.value));
      
      // Approvals
      case 'getApprovals':
        return respond(getApprovalRequests());
      case 'submitApproval':
        return respond(submitApproval(payload));
      case 'updateApprovalStatus':
        return respond(updateApprovalStatus(payload.approvalId, payload.status, payload.remarks));
      
      // Liquidations
      case 'getLiquidations':
        return respond(getLiquidations());
      case 'submitLiquidation':
        return respond(submitLiquidation(payload));
      case 'updateLiquidationStatus':
        return respond(updateLiquidationStatus(payload.liquidationId, payload.status, payload.remarks));
      
      // Projects list for dropdowns
      case 'getProjectList':
        return respond(getDistinctProjects());
      
      default:
        return respond(errorResponse('Unknown action: ' + action));
    }
  } catch (error) {
    return respond(errorResponse('Server error: ' + error.message));
  }
}

// Helper to easily return JSON
function respond(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// Optional: doGet for testing (kung gusto mong bisitahin ang GAS URL directly)
function doGet() {
  return ContentService.createTextOutput('FCTC ERP Backend is running. Use POST requests.')
    .setMimeType(ContentService.MimeType.TEXT);
}