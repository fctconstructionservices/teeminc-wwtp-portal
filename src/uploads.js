import { requireRole } from './auth.js';

export async function proxyToFileProxy(env, payload) {
  if (!env.DRIVE_PROXY_URL || !env.DRIVE_PROXY_SECRET) {
    throw new Error('File uploads are not configured yet.');
  }

  const response = await fetch(env.DRIVE_PROXY_URL, {
    method: 'POST',
    body: JSON.stringify({ secret: env.DRIVE_PROXY_SECRET, ...payload }),
  });

  if (!response.ok) throw new Error('Upload proxy returned ' + response.status);

  const result = await response.json();
  if (!result.success) throw new Error(result.error || 'Upload failed.');
  return result;
}

export async function uploadImage(env, _identity, base64, fileName, mimeType) {
  if (!base64 || !fileName) throw new Error('Nothing to upload.');
  const result = await proxyToFileProxy(env, { base64, name: fileName, mime: mimeType });
  return { id: result.id, url: result.url };
}

export async function saveCompanyLogo(env, identity, base64, fileName, mimeType) {
  requireRole(identity, ['superadmin', 'admin'], 'Uploading the company logo');
  if (!base64 || !fileName) throw new Error('Nothing to upload.');
  const result = await proxyToFileProxy(env, { base64, name: fileName, mime: mimeType });
  return { id: result.id, url: result.url };
}
