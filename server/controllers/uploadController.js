const asyncHandler = require('../utils/asyncHandler');
const uploadService = require('../services/uploadService');

const uploadEvidence = asyncHandler(async (req, res) => {
  const upload = await uploadService.saveEvidence(req.user.id, req.body);
  res.status(201).json({
    upload: { id: upload.id, url: uploadService.evidencePath(upload.id), contentType: upload.contentType, sizeBytes: upload.sizeBytes },
  });
});

// Served with the stored (sniffed) type, never anything the uploader said,
// plus nosniff and a no-script CSP from helmet: an image can't be turned
// into a page.
const getEvidence = asyncHandler(async (req, res) => {
  const { contentType, bytes } = await uploadService.readEvidence(req.params.id);
  res.set('Content-Type', contentType);
  res.set('Content-Disposition', 'inline');
  res.set('Cache-Control', 'private, max-age=86400');
  res.send(bytes);
});

module.exports = { uploadEvidence, getEvidence };
