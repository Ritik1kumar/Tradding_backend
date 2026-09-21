var express = require('express');
var router = express.Router();
var { authenticate, requireRole } = require('../middleware/auth');
var tosVersionController = require('../controllers/tosVersion.controller');

router.use(authenticate);

router.post('/', requireRole(['admin']), tosVersionController.publish);
router.get('/', requireRole(['admin']), tosVersionController.list);
router.get('/current', tosVersionController.current);

module.exports = router;
