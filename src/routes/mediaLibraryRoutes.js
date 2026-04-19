// src/routes/mediaLibraryRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { verifyToken } = require('../middleware/authMiddleware');

const {
  getFolders,
  createFolder,
  deleteFolder,
  getDocumentsByFolder,
  uploadDocument,
  deleteDocument,
  createShareLink,
  getSharedPage,
  getSharedDocument,
  getSharedMeta,
  getEmpFolders
} = require('../controller/mediaLibraryController');   // We'll create this next

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folderPath = path.join(__dirname, '../../uploads', req.params.folderId || 'temp');
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }
    cb(null, folderPath);
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + file.originalname.replace(/\s+/g, '_');
    cb(null, uniqueName);
  }
});

const upload = multer({ storage });

// Folder Routes
router.get('/folders', getFolders);
router.get('/emp-folders', verifyToken, getEmpFolders);
router.post('/folders', createFolder);
router.delete('/folders/:id', deleteFolder);

// Document Routes
router.get('/folders/:folderId/documents', getDocumentsByFolder);
router.post('/folders/:folderId/documents', upload.single('file'), uploadDocument);
router.delete('/documents/:id', deleteDocument);   // Note: using /documents/:id as per your frontend

// Share Routes (expiring token)
router.post('/share', createShareLink);
router.get('/shared/:token', getSharedPage);
router.get('/shared/:token/meta', getSharedMeta);
router.get('/shared/:token/file', getSharedDocument);
router.get('/shared/:token/download', getSharedDocument);

module.exports = router;