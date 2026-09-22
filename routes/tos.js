var express = require('express');
var router = express.Router();
var { authenticate } = require('../middleware/auth');
var tosController = require('../controllers/tos.controller');

router.use(authenticate);

router.post('/accept', tosController.accept);
router.get('/status', tosController.status);

module.exports = router;
