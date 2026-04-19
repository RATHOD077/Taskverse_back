// src/controller/mediaLibraryController.js
const db = require('../config/db');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');

const getShareSecret = () => {
  // In production, set SHARE_LINK_SECRET in environment variables.
  // Using a fallback keeps local dev working.
  return process.env.SHARE_LINK_SECRET || process.env.SHARE_SECRET || 'dev-only-share-secret-change-me';
};

const getExpirySeconds = ({ expiresValue, expiresUnit }) => {
  const value = Number(expiresValue);
  const unit = String(expiresUnit || 'day').toLowerCase();

  if (!Number.isFinite(value) || value <= 0) return null;

  if (unit === 'hour' || unit === 'hours') return Math.floor(value * 3600);
  if (unit === 'day' || unit === 'days') return Math.floor(value * 86400);
  if (unit === 'week' || unit === 'weeks') return Math.floor(value * 7 * 86400);

  return null;
};

const getMimeTypeFromPath = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.pdf': return 'application/pdf';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.gif': return 'image/gif';
    case '.webp': return 'image/webp';
    case '.mp4': return 'video/mp4';
    case '.mov': return 'video/quicktime';
    case '.mp3': return 'audio/mpeg';
    case '.wav': return 'audio/wav';
    case '.zip': return 'application/zip';
    default: return 'application/octet-stream';
  }
};

const sendShareError = (res, statusCode, message) => {
  return res.status(statusCode).json({
    success: false,
    message,
  });
};

const resolveDocumentFullPath = (filePath) => {
  // doc.file_path can be stored in multiple formats:
  // - "uploads/<folder>/<file>"
  // - "C:/.../backend/uploads/<folder>/<file>"
  // - "/uploads/<folder>/<file>"
  // We always resolve to the backend's uploads folder.
  const normalized = String(filePath || "").replace(/\\/g, "/");
  const idx = normalized.indexOf("uploads/");
  if (idx !== -1) {
    return path.join(__dirname, "../../", normalized.slice(idx));
  }

  const cleaned = normalized.replace(/^\/+/, "");
  // If it's already an absolute path, use it.
  if (/^[A-Za-z]:\//.test(cleaned)) return cleaned;
  return path.join(__dirname, "../../", cleaned);
};

const getFrontendBaseUrl = (req) => {
  // For other devices to open the share link, set SHARE_FRONTEND_BASE_URL to a LAN IP/domain that they can reach.
  // Example: http://192.168.1.10:5173
  return (
    process.env.SHARE_FRONTEND_BASE_URL ||
    process.env.SHARE_LINK_BASE_URL ||
    req.get("origin") ||
    "http://localhost:5173"
  );
};

const getBackendBaseUrl = (req) => {
  // Backend endpoints must be reachable from the client/device network.
  return (
    process.env.SHARE_BACKEND_BASE_URL ||
    process.env.SHARE_BASE_URL ||
    `${req.protocol}://${req.get("host")}`
  );
};

const getRemainingMinutes = (expSeconds) => {
  // expSeconds comes from JWT "exp" claim (seconds since epoch).
  if (!expSeconds || !Number.isFinite(expSeconds)) return null;
  const nowSeconds = Date.now() / 1000;
  const remainingSeconds = expSeconds - nowSeconds;
  if (remainingSeconds <= 0) return 0;
  return Math.ceil(remainingSeconds / 60);
};

// Get all folders with document count (Fixed & Optimized)
// Get all folders with document count - FIXED for ONLY_FULL_GROUP_BY
exports.getFolders = async (req, res) => {
  try {
    const [folders] = await db.query(`
      SELECT 
        f.id,
        f.name,
        f.client_code,
        f.color,
        DATE_FORMAT(f.created_at, '%Y-%m-%d') AS createdAt,
        COALESCE(COUNT(d.id), 0) AS docCount
      FROM folders f
      LEFT JOIN documents d ON d.folder_id = f.id
      GROUP BY 
        f.id, 
        f.name, 
        f.client_code, 
        f.color, 
        f.created_at
      ORDER BY f.created_at DESC
    `);
    
    const formattedFolders = folders.map(f => ({
      id: f.id,
      name: f.name,
      client: f.client_code,
      color: f.color,
      docCount: Number(f.docCount) || 0,
      createdAt: f.createdAt || ''
    }));

    res.json({ 
      success: true, 
      folders: formattedFolders 
    });
  } catch (error) {
    console.error('=== Error fetching folders ===');
    console.error(error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch folders',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined 
    });
  }
};

// Get employee folders restricted to assigned cases
exports.getEmpFolders = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
       return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const [folders] = await db.query(`
      SELECT 
        f.id,
        f.name,
        f.client_code,
        f.color,
        DATE_FORMAT(f.created_at, '%Y-%m-%d') AS createdAt,
        COALESCE(COUNT(d.id), 0) AS docCount
      FROM folders f
      LEFT JOIN documents d ON d.folder_id = f.id
      WHERE EXISTS (
        SELECT 1 FROM cases c 
        WHERE LOWER(c.client_name) COLLATE utf8mb4_unicode_ci = LOWER(f.name) COLLATE utf8mb4_unicode_ci
        AND c.assigned_to = ?
      )
      OR EXISTS (
        SELECT 1 FROM task t
        LEFT JOIN customer cust ON cust.id = t.client_id
        WHERE (LOWER(cust.name) COLLATE utf8mb4_unicode_ci = LOWER(f.name) COLLATE utf8mb4_unicode_ci OR FIND_IN_SET(f.id, t.folder_access))
        AND t.assigned_to = ?
      )
      GROUP BY 
        f.id, 
        f.name, 
        f.client_code, 
        f.color, 
        f.created_at
      ORDER BY f.created_at DESC
    `, [userId, userId]);
    
    const formattedFolders = folders.map(f => ({
      id: f.id,
      name: f.name,
      client: f.client_code,
      color: f.color,
      docCount: Number(f.docCount) || 0,
      createdAt: f.createdAt || ''
    }));

    res.json({ 
      success: true, 
      folders: formattedFolders 
    });
  } catch (error) {
    console.error('=== Error fetching emp folders ===');
    console.error(error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch folders'
    });
  }
};

// Create a new folder
exports.createFolder = async (req, res) => {
  try {
    const { name, clientCode, color } = req.body;
    
    if (!name?.trim()) {
      return res.status(400).json({ success: false, message: 'Folder name is required' });
    }

    const client_code = (clientCode || name.trim().slice(0, 3).toUpperCase()).trim();

    const [result] = await db.query(
      'INSERT INTO folders (name, client_code, color) VALUES (?, ?, ?)',
      [name.trim(), client_code, color || '#6366f1']
    );

    res.status(201).json({ 
      success: true, 
      folderId: result.insertId,
      message: 'Folder created successfully' 
    });
  } catch (error) {
    console.error('Error creating folder:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ success: false, message: 'Client code must be unique' });
    }
    res.status(500).json({ success: false, message: 'Failed to create folder' });
  }
};

// Delete folder
exports.deleteFolder = async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM folders WHERE id = ?', [id]);
    res.json({ success: true, message: 'Folder deleted successfully' });
  } catch (error) {
    console.error('Error deleting folder:', error);
    res.status(500).json({ success: false, message: 'Failed to delete folder' });
  }
};

// Get documents by folder ID
exports.getDocumentsByFolder = async (req, res) => {
  try {
    const { folderId } = req.params;
    const [documents] = await db.query(
      `SELECT 
         id, name, file_type as type, 
         file_size, uploaded_at, file_path 
       FROM documents 
       WHERE folder_id = ? 
       ORDER BY uploaded_at DESC`,
      [folderId]
    );

    const formattedDocs = documents.map(d => ({
      id: d.id,
      name: d.name,
      type: d.type,
      size: d.file_size ? `${(d.file_size / 1024 / 1024).toFixed(2)} MB` : "—",
      uploadedAt: d.uploaded_at 
        ? new Date(d.uploaded_at).toISOString().slice(0, 10) 
        : '',
      path: d.file_path
    }));

    res.json({ success: true, documents: formattedDocs });
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch documents' });
  }
};

// Upload document
exports.uploadDocument = async (req, res) => {
  try {
    const { folderId } = req.params;
    const { name, type } = req.body;
    const file = req.file;

    if (!name?.trim() || !type || !file) {
      return res.status(400).json({ 
        success: false, 
        message: 'Document name, type and file are required' 
      });
    }

    // Verify folder exists
    const [folderExists] = await db.query('SELECT id FROM folders WHERE id = ?', [folderId]);
    if (folderExists.length === 0) {
      return res.status(404).json({ success: false, message: 'Folder not found' });
    }

    // Always store a relative path so the frontend can use `/uploads/...` reliably.
    // (multer's file.path is absolute, which breaks public URLs like `http://host:5000/C:/...`)
    const filePath = `uploads/${folderId}/${file.filename}`;

    const [result] = await db.query(
      `INSERT INTO documents 
       (folder_id, name, file_type, mime_type, file_size, file_path, original_name) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [folderId, name.trim(), type, file.mimetype, file.size, filePath, file.originalname]
    );

    res.status(201).json({ 
      success: true, 
      documentId: result.insertId,
      message: 'Document uploaded successfully' 
    });
  } catch (error) {
    console.error('Error uploading document:', error);
    res.status(500).json({ success: false, message: 'Failed to upload document' });
  }
};

// Delete document + physical file
exports.deleteDocument = async (req, res) => {
  try {
    const { id } = req.params;

    // Get file path before deleting
    const [doc] = await db.query('SELECT file_path FROM documents WHERE id = ?', [id]);
    
    if (doc.length > 0 && doc[0].file_path) {
      const fullPath = path.join(__dirname, '../../', doc[0].file_path);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    }

    await db.query('DELETE FROM documents WHERE id = ?', [id]);
    res.json({ success: true, message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ success: false, message: 'Failed to delete document' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Share links with expiry + download permission
// ─────────────────────────────────────────────────────────────────────────────
exports.createShareLink = async (req, res) => {
  try {
    const {
      documentId,
      expiresValue = 7,
      expiresUnit = 'day',
      allowDownload = true
    } = req.body || {};

    const docIdNum = Number(documentId);
    if (!docIdNum) {
      return res.status(400).json({ success: false, message: 'documentId is required' });
    }

    const expirySeconds = getExpirySeconds({ expiresValue, expiresUnit });
    if (!expirySeconds) {
      return res.status(400).json({
        success: false,
        message: 'Invalid expiry. Use a positive expiresValue and unit (hour/day/week).',
      });
    }

    const [docs] = await db.query(
      'SELECT id, file_path, original_name FROM documents WHERE id = ?',
      [docIdNum]
    );

    if (!docs || docs.length === 0) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    const secret = getShareSecret();

    const token = jwt.sign(
      { documentId: docIdNum, allowDownload: !!allowDownload },
      secret,
      { expiresIn: expirySeconds }
    );

    const frontendBaseUrl = getFrontendBaseUrl(req);
    const backendBaseUrl = getBackendBaseUrl(req);

    // Clean URLs (no query params), easy to copy/share.
    // View:    /shared/<token> (frontend page inside your platform)
    // Download:/api/media-library/shared/<token>/download (backend endpoint)
    const viewLink = `${frontendBaseUrl}/shared/${token}`;
    const downloadLink = allowDownload
      ? `${backendBaseUrl}/api/media-library/shared/${token}/download`
      : null;

    const expiresAt = new Date(Date.now() + expirySeconds * 1000).toISOString();

    return res.json({
      success: true,
      expiresAt,
      viewLink,
      downloadLink,
      allowDownload: !!allowDownload
    });
  } catch (error) {
    console.error('Error creating share link:', error);
    return res.status(500).json({ success: false, message: 'Failed to create share link' });
  }
};

exports.getSharedPage = async (req, res) => {
  try {
    const secret = getShareSecret();
    const token = req.params.token;
    if (!token) return sendShareError(res, 400, "Missing token");

    let payload;
    try {
      payload = jwt.verify(token, secret);
    } catch (err) {
      return sendShareError(res, 403, 'Share link is invalid or has expired');
    }

    const docIdNum = Number(payload.documentId);
    const allowDownload = !!payload.allowDownload;
    const remainingMinutes = getRemainingMinutes(payload.exp);

    const backendBaseUrl = getBackendBaseUrl(req);
    const fileUrl = `${backendBaseUrl}/api/media-library/shared/${token}/file`;
    const downloadUrl = allowDownload ? `${backendBaseUrl}/api/media-library/shared/${token}/download` : null;

    const [docs] = await db.query(
      'SELECT id, file_path, original_name, file_type as type FROM documents WHERE id = ?',
      [docIdNum]
    );

    if (!docs || docs.length === 0) {
      return sendShareError(res, 404, 'Document not found');
    }

    const doc = docs[0];

    const safeName = String(doc.original_name || doc.name || path.basename(doc.file_path || "")).replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const safeType = String(doc.type || "").toLowerCase();

    const remainingText =
      remainingMinutes === null
        ? "Expired when token expires"
        : remainingMinutes <= 0
          ? "Expired"
          : `Expires in ${remainingMinutes} minute(s)`;

    const downloadSection = allowDownload
      ? `<a class="btn" href="${downloadUrl}" download>Download</a>`
      : ``;

    // Basic embed by file type; if we can't embed, we show a link to view.
    const embed = (() => {
      if (safeType.includes("image")) {
        return `<img class="embed" alt="${safeName}" src="${fileUrl}" />`;
      }
      if (safeType.includes("pdf")) {
        return `<iframe class="embed" title="${safeName}" src="${fileUrl}"></iframe>`;
      }
      if (safeType.includes("video")) {
        return `<video class="embed" controls src="${fileUrl}"></video>`;
      }
      if (safeType.includes("audio")) {
        return `<audio controls src="${fileUrl}"></audio>`;
      }
      // Fallback: still allow "view" by linking to the fileUrl.
      return `<div class="fallback"><a href="${fileUrl}" target="_blank" rel="noreferrer">Open document</a></div>`;
    })();

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(`
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeName}</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; margin: 0; background: #f8fafc; color: #0f172a; }
      .wrap { max-width: 1100px; margin: 0 auto; padding: 20px; }
      .card { background: white; border: 1px solid #e5e7eb; border-radius: 16px; padding: 16px; }
      h1 { font-size: 18px; margin: 0; }
      .meta { margin-top: 6px; font-size: 12px; color: #64748b; }
      .actions { margin-top: 12px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
      .btn { display: inline-flex; padding: 10px 14px; background: #10b981; color: white; text-decoration: none; border-radius: 12px; font-weight: 700; }
      .btn-secondary { display: inline-flex; padding: 10px 14px; background: #eef2ff; color: #4f46e5; text-decoration: none; border-radius: 12px; font-weight: 700; }
      .embed { width: 100%; height: 75vh; border: 1px solid #e5e7eb; border-radius: 14px; background: #fff; }
      img.embed { object-fit: contain; height: auto; max-height: 70vh; }
      iframe.embed { }
      video.embed { height: auto; max-height: 70vh; }
      .fallback { padding: 16px; border: 1px dashed #e5e7eb; border-radius: 14px; text-align: center; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <h1>${safeName}</h1>
        <div class="meta">${remainingText}</div>
        <div class="actions">
          ${allowDownload ? downloadSection : ``}
          <a class="btn-secondary" href="${fileUrl}" target="_blank" rel="noreferrer">View</a>
        </div>
        <div style="margin-top: 14px;">
          ${embed}
        </div>
      </div>
    </div>
  </body>
</html>
    `);
  } catch (error) {
    console.error('Error serving shared page:', error);
    return res.status(500).json({ success: false, message: 'Failed to serve shared page' });
  }
};

exports.getSharedDocument = async (req, res) => {
  try {
    const secret = getShareSecret();
    const token = req.params.token || (req.query || {}).token;
    if (!token) return sendShareError(res, 400, "Missing token");

    let payload;
    try {
      payload = jwt.verify(token, secret);
    } catch (err) {
      return sendShareError(res, 403, "Share link is invalid or has expired");
    }

    const docIdNum = Number(payload.documentId);
    const allowDownload = !!payload.allowDownload;
    const downloadRequested = req.path.endsWith("/download");

    const [docs] = await db.query(
      "SELECT id, file_path, original_name FROM documents WHERE id = ?",
      [docIdNum]
    );

    if (!docs || docs.length === 0) {
      return sendShareError(res, 404, "Document not found");
    }

    const doc = docs[0];
    const fullPath = resolveDocumentFullPath(doc.file_path);

    if (!fs.existsSync(fullPath)) {
      return sendShareError(res, 404, "File not found on server");
    }

    if (downloadRequested && !allowDownload) {
      return sendShareError(res, 403, "Download permission is not allowed for this share link");
    }

    const mimeType = getMimeTypeFromPath(fullPath);
    const filename = doc.original_name || path.basename(fullPath);

    res.setHeader("Content-Type", mimeType);
    res.setHeader(
      "Content-Disposition",
      downloadRequested ? `attachment; filename="${filename}"` : `inline; filename="${filename}"`
    );

    return res.sendFile(fullPath);
  } catch (error) {
    console.error("Error serving shared document:", error);
    return res.status(500).json({ success: false, message: "Failed to serve shared document" });
  }
};

exports.getSharedMeta = async (req, res) => {
  try {
    const secret = getShareSecret();
    const token = req.params.token;
    if (!token) return sendShareError(res, 400, "Missing token");

    let payload;
    try {
      payload = jwt.verify(token, secret);
    } catch (err) {
      return sendShareError(res, 403, "Share link is invalid or has expired");
    }

    const docIdNum = Number(payload.documentId);
    const allowDownload = !!payload.allowDownload;
    const remainingMinutes = getRemainingMinutes(payload.exp);
    const expiresAt = payload.exp ? new Date(payload.exp * 1000).toISOString() : null;

    const backendBaseUrl = getBackendBaseUrl(req);
    const fileUrl = `${backendBaseUrl}/api/media-library/shared/${token}/file`;
    const downloadUrl = allowDownload
      ? `${backendBaseUrl}/api/media-library/shared/${token}/download`
      : null;

    const [docs] = await db.query(
      "SELECT id, file_path, original_name, file_type as type, file_size, uploaded_at FROM documents WHERE id = ?",
      [docIdNum]
    );

    if (!docs || docs.length === 0) {
      return sendShareError(res, 404, "Document not found");
    }

    const doc = docs[0];

    const fileSizeText =
      doc.file_size
        ? `${(doc.file_size / 1024 / 1024).toFixed(2)} MB`
        : "—";

    const uploadedAtText = doc.uploaded_at
      ? new Date(doc.uploaded_at).toISOString().slice(0, 10)
      : "";

    return res.json({
      success: true,
      documentId: docIdNum,
      name: doc.original_name || doc.name,
      type: doc.type,
      fileSize: fileSizeText,
      uploadedAt: uploadedAtText,
      expiresAt,
      remainingMinutes,
      allowDownload,
      fileUrl,
      downloadUrl
    });
  } catch (error) {
    console.error("Error fetching shared meta:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch shared meta" });
  }
};