const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const AppError = require('../utils/AppError');
const { upload: uploadConfig } = require('../config/env');

const uploadDir = path.resolve(uploadConfig.dir);
fs.mkdirSync(uploadDir, { recursive: true });

// Strict allowlists. The stored extension is derived from the validated MIME
// type, never from the client-supplied file name, so HTML, SVG, scripts and
// other active content can never be stored or served.
const GALLERY_TYPES = {
  'image/jpeg': { ext: '.jpg', kind: 'photo' },
  'image/png': { ext: '.png', kind: 'photo' },
  'image/webp': { ext: '.webp', kind: 'photo' },
  'image/gif': { ext: '.gif', kind: 'photo' },
  'video/mp4': { ext: '.mp4', kind: 'video' },
  'video/webm': { ext: '.webm', kind: 'video' },
  'video/quicktime': { ext: '.mov', kind: 'video' },
};

const RESOURCE_TYPES = {
  'application/pdf': { ext: '.pdf', kind: 'document' },
  'audio/mpeg': { ext: '.mp3', kind: 'audio' },
  'audio/mp3': { ext: '.mp3', kind: 'audio' },
  'audio/wav': { ext: '.wav', kind: 'audio' },
  'audio/x-wav': { ext: '.wav', kind: 'audio' },
  'audio/mp4': { ext: '.m4a', kind: 'audio' },
  'audio/x-m4a': { ext: '.m4a', kind: 'audio' },
  'video/mp4': { ext: '.mp4', kind: 'video' },
  'video/webm': { ext: '.webm', kind: 'video' },
  'image/jpeg': { ext: '.jpg', kind: 'image' },
  'image/png': { ext: '.png', kind: 'image' },
  'image/webp': { ext: '.webp', kind: 'image' },
};

// Magic-number signatures, checked after the file is written, so a renamed
// or mislabelled file (e.g. HTML sent as image/png) is rejected.
const matchesSignature = (mime, buf) => {
  const hex = buf.toString('hex');
  const ascii = buf.toString('latin1');
  const isoMedia = ['ftyp', 'moov', 'mdat', 'wide', 'free', 'skip'].includes(ascii.slice(4, 8));
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
    case 'audio/mp4':
    case 'audio/x-m4a':
      return isoMedia;
    case 'application/pdf':
      return ascii.startsWith('%PDF-');
    case 'audio/mpeg':
    case 'audio/mp3':
      // ID3 tag or an MPEG audio frame sync (0xFFE…)
      return ascii.startsWith('ID3') || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0);
    case 'audio/wav':
    case 'audio/x-wav':
      return ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WAVE';
    default:
      return false;
  }
};

const describe = (types) =>
  [...new Set(Object.values(types).map((t) => t.ext.slice(1).toUpperCase()))].join(', ');

/**
 * Build a multer instance + post-upload verifier for one category of files.
 *   subdir: '' for gallery media, 'resources' for learning resources
 */
const createUploader = ({ types, subdir = '' }) => {
  const dir = path.join(uploadDir, subdir);
  fs.mkdirSync(dir, { recursive: true });

  const multerInstance = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, dir),
      filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}${types[file.mimetype].ext}`),
    }),
    fileFilter: (req, file, cb) => {
      if (!types[file.mimetype]) {
        return cb(AppError.badRequest(`Unsupported file type. Allowed: ${describe(types)}.`));
      }
      cb(null, true);
    },
    limits: { fileSize: uploadConfig.maxBytes, files: 1, fields: 10 },
  });

  const verify = async (req, res, next) => {
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
      req.file.kind = types[req.file.mimetype].kind;
      req.file.storedUrl = `/uploads/${subdir ? `${subdir}/` : ''}${req.file.filename}`;
      next();
    } catch (err) {
      next(err);
    }
  };

  return { single: (field) => multerInstance.single(field), verify };
};

const galleryUploader = createUploader({ types: GALLERY_TYPES });
const resourceUploader = createUploader({ types: RESOURCE_TYPES, subdir: 'resources' });

// Delete a stored upload, e.g. when the DB insert that references it fails.
const removeUploadedFile = async (file) => {
  if (file && file.path) await fs.promises.unlink(file.path).catch(() => {});
};

// Resolve a stored media URL ("/uploads/<name>" or "/uploads/resources/<name>")
// to a safe absolute path inside the upload directory.
const STORED_NAME = /^[A-Za-z0-9._-]+\.(jpe?g|png|webp|gif|mp4|webm|mov|pdf|mp3|wav|m4a)$/i;
const resolveStoredFile = (mediaUrl) => {
  if (!mediaUrl) return null;
  const match = String(mediaUrl).match(/^\/uploads\/(?:(resources)\/)?([^/]+)$/);
  if (!match || !STORED_NAME.test(match[2])) return null;
  const full = path.join(uploadDir, match[1] || '', match[2]);
  return full.startsWith(uploadDir + path.sep) ? full : null;
};

const deleteStoredFile = async (mediaUrl) => {
  const file = resolveStoredFile(mediaUrl);
  if (file) await fs.promises.unlink(file).catch(() => {});
};

const isSafeStoredName = (name) => STORED_NAME.test(name) && path.basename(name) === name;

// Backwards-compatible exports for gallery uploads
module.exports = galleryUploader;
module.exports.upload = galleryUploader;
module.exports.verifyUploadedFile = galleryUploader.verify;
module.exports.galleryUploader = galleryUploader;
module.exports.resourceUploader = resourceUploader;
module.exports.removeUploadedFile = removeUploadedFile;
module.exports.resolveStoredFile = resolveStoredFile;
module.exports.deleteStoredFile = deleteStoredFile;
module.exports.isSafeStoredName = isSafeStoredName;
module.exports.uploadDir = uploadDir;
