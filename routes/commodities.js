var express = require('express');
var router = express.Router();
var { authenticate, requireRole } = require('../middleware/auth');
var commodityController = require('../controllers/commodity.controller');

router.use(authenticate);

router.post('/', requireRole(['admin']), commodityController.create);
router.get('/', commodityController.list);
router.patch('/:id', requireRole(['admin']), commodityController.update);
router.delete('/:id', requireRole(['admin']), commodityController.remove);

module.exports = router;
