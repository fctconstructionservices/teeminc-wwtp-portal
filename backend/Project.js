/**
 * ============================================
 * FILE: Projects.gs
 * PURPOSE: Project CRUD operations.
 * DEPENDENCIES: SheetService.gs, Config.gs
 * ============================================
 */

/**
 * Get all projects.
 * @returns {Array<object>} List of projects.
 */
function getProjects() {
  return getSheetData(SHEETS.PROJECTS);
}

/**
 * Add a new project.
 * @param {object} projectData - Contains ProjectName, Location, Status, etc.
 * @returns {object} { success: boolean, message: string }
 */
function addProject(projectData) {
  try {
    var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEETS.PROJECTS);
    var headers = sheet.getDataRange().getValues()[0];
    var newRow = [];
    
    // Auto-generate ProjectID if not provided
    if (!projectData.ProjectID) {
      projectData.ProjectID = 'PRJ-' + Utilities.getUuid().substring(0, 8).toUpperCase();
    }
    
    // Map keys to column order
    for (var i = 0; i < headers.length; i++) {
      newRow.push(projectData[headers[i]] || '');
    }
    
    appendRow(SHEETS.PROJECTS, newRow);
    return successResponse({ id: projectData.ProjectID }, 'Project added successfully.');
  } catch (e) {
    return errorResponse(e.message);
  }
}

/**
 * Update project status.
 * @param {string} projectId - Project ID.
 * @param {string} newStatus - New status value.
 * @returns {object} Result.
 */
function updateProjectStatus(projectId, newStatus) {
  try {
    var row = findRowByColumn(SHEETS.PROJECTS, 'ProjectID', projectId);
    if (!row) return errorResponse('Project not found.');
    
    // Hanapin ang column index ng 'Status'
    var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEETS.PROJECTS);
    var headers = sheet.getDataRange().getValues()[0];
    var colIndex = headers.indexOf('Status') + 1; // 1-based
    
    updateCell(SHEETS.PROJECTS, row._rowIndex, colIndex, newStatus);
    return successResponse(null, 'Project status updated.');
  } catch (e) {
    return errorResponse(e.message);
  }
}