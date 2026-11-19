const express = require('express');
const resourceController = require('../controllers/resourceController');
const { authenticateToken } = require('../middleware/authMiddleware');
const validate = require('../middleware/validate');
const { teacher: v } = require('../validators/domainValidators');

const router = express.Router();

// Download an uploaded learning resource. Students only get resources for
// their own level; teachers and admins can open any active resource.
router.get('/:resource_id/file', authenticateToken, validate({ params: v.resourceId }), resourceController.getResourceFile);

module.exports = router;
