/**
 * 13-FileService.gs — Drive attachments and photo uploads
 *
 * PURPOSE: Every file in the system lands in one Drive folder
 * ('FCTC Ops Board Attachments'), created on demand. Payloads carry
 * base64 (fileBase64/fileName/fileMimeType); only the resulting
 * Drive URLs are stored in sheet rows.
 */

// ============================================================
//  ATTACHMENTS & PHOTO UPLOAD
// ============================================================

function getOrCreateAttachmentsFolder_() {
  const name = 'FCTC Ops Board Attachments';
  const folders = DriveApp.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(name);
}

function uploadAttachmentIfAny_(payload) {
  if (!payload.fileBase64 || !payload.fileName) return { fileUrl: '', fileName: '' };
  try {
    const blob = Utilities.newBlob(
      Utilities.base64Decode(payload.fileBase64),
      payload.fileMimeType || 'application/octet-stream',
      payload.fileName
    );
    const folder = getOrCreateAttachmentsFolder_();
    const file = folder.createFile(blob);
    return { fileUrl: file.getUrl(), fileName: payload.fileName };
  } catch (e) {
    logActivity_('File upload failed: ' + e.message, 'a');
    return { fileUrl: '', fileName: '' };
  }
}

function uploadImage(base64Data, fileName, mimeType) {
  try {
    const blob = Utilities.newBlob(
      Utilities.base64Decode(base64Data),
      mimeType || 'image/jpeg',
      fileName || 'image_' + Date.now() + '.jpg'
    );
    const folder = getOrCreateAttachmentsFolder_();
    const file = folder.createFile(blob);
    return { success: true, url: file.getUrl(), id: file.getId() };
  } catch (e) {
    throw new Error('Image upload failed: ' + e.message);
  }
}
