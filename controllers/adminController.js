const { wrapController } = require('../utils/asyncHandler');
const { createPasswordSetupLink } = require('./admin/shared');

// The admin API is implemented in controllers/admin/*, one module per area.
const adminController = Object.assign(
  {},
  require('./admin/students'),
  require('./admin/teachers'),
  require('./admin/batches'),
  require('./admin/fees'),
  require('./admin/analytics'),
  require('./admin/gallery'),
  require('./admin/messages'),
);

module.exports = wrapController(adminController);
module.exports.createPasswordSetupLink = createPasswordSetupLink;
