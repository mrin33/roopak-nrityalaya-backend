const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const AppError = require('../utils/AppError');
const { upload: uploadConfig } = require('../config/env');

const uploadDir = path.resolve(uploadConfig.dir);
fs.mkdirSync(uploadDir, { recursive: true });

// Strict allowlist. The stored extension is derived from the validated MIME
// type, never from the client-supplied file name, so HTML, SVG, scripts and
// other active content can never be stored or served.
const ALLOWED = {
  'image/jpeg': { ext: '.jpg', kind: 'photo' },
  'image/png': { ext: '.png', kind: 'photo' },
  'image/webp': { ext: '.webp', kind: 'photo' },
  'image/gif': { ext: '.gif', kind: 'photo' },
  'video/mp4': { ext: '.mp4', kind: 'video' },
  'video/webm': { ext: '.webm', kind: 'video' },
  'video/quicktime': { ext: '.mov', kind: 'video' },
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    cb(null, `${crypto.randomUUID()}${ALLOWED[file.mimetype].ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (!ALLOWED[file.mimetype]) {
    return cb(
      AppError.badRequest('Unsupported file type. Allowed: JPG, PNG, WEBP, GIF, MP4, WEBM, MOV.')
    );
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: uploadConfig.maxBytes, files: 1, fields: 10 },
});

// Magic-number signatures, checked after the file is written, so a renamed
// or mislabelled file (e.g. HTML sent as image/png) is rejected.
const matchesSignature = (mime, buf) => {
  const hex = buf.toString('hex');
  const ascii = buf.toString('latin1');
  switch (mime) {
    case 'image/jpeg':
      return hex.startsWith('ffd8ff');
    case 'image/png':
      return hex.startsWith('89504e470d0a1a0a');
    case 'image/gif':
      return ascii.startsWith('GIF87a') || ascii.startsWith('GIF89a');
    case 'image/webp':
      return ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP';
    case 'video/webm':
      return hex.startsWith('1a45dfa3');
    case 'video/mp4':
    case 'video/quicktime':
      // ISO base media: bytes 4-8 are an atom type such as ftyp/moov/mdat/wide.
      return ['ftyp', 'moov', 'mdat', 'wide', 'free', 'skip'].includes(ascii.slice(4, 8));
    default:
      return false;
  }
};

const verifyUploadedFile = async (req, res, next) => {
  if (!req.file) return next();
  try {
    const handle = await fs.promises.open(req.file.path, 'r');
    const buf = Buffer.alloc(16);
    await handle.read(buf, 0, 16, 0);
    await handle.close();
    if (!matchesSignature(req.file.mimetype, buf)) {
      await fs.promises.unlink(req.file.path).catch(() => {});
      return next(AppError.badRequest('The file content does not match its type.'));
    }
    req.file.kind = ALLOWED[req.file.mimetype].kind;
    next();
  } catch (err) {
    next(err);
  }
};

// Delete a stored upload, e.g. when the DB insert that references it fails.
const removeUploadedFile = async (file) => {
  if (file && file.path) await fs.promises.unlink(file.path).catch(() => {});
};

// Resolve a stored media URL ("/uploads/<name>") to a safe absolute path.
const STORED_NAME = /^[A-Za-z0-9._-]+\.(jpe?g|png|webp|gif|mp4|webm|mov)$/i;
const resolveStoredFile = (mediaUrl) => {
  if (!mediaUrl) return null;
  const name = path.basename(String(mediaUrl));
  if (!STORED_NAME.test(name)) return null;
  const full = path.join(uploadDir, name);
  return full.startsWith(uploadDir + path.sep) ? full : null;
};

const isSafeStoredName = (name) => STORED_NAME.test(name) && path.basename(name) === name;

module.exports = upload;
module.exports.upload = upload;
module.exports.verifyUploadedFile = verifyUploadedFile;
module.exports.removeUploadedFile = removeUploadedFile;
module.exports.resolveStoredFile = resolveStoredFile;
module.exports.isSafeStoredName = isSafeStoredName;
module.exports.uploadDir = uploadDir;
