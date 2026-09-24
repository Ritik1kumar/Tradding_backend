var express = require('express');
var router = express.Router();
var { authenticate, requireRole } = require('../middleware/auth');
var settingsController = require('../controllers/settings.controller');

router.use(authenticate);

router.get('/', settingsController.list);
router.get('/:key', settingsController.getByKey);
router.patch('/:key', requireRole(['admin']), settingsController.update);

module.exports = router;
