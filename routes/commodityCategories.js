var express = require('express');
var router = express.Router();
var { authenticate, requireRole } = require('../middleware/auth');
var commodityCategoryController = require('../controllers/commodityCategory.controller');

router.use(authenticate);

router.post('/', requireRole(['admin']), commodityCategoryController.create);
router.get('/', commodityCategoryController.list);
router.patch('/:id', requireRole(['admin']), commodityCategoryController.rename);
router.delete('/:id', requireRole(['admin']), commodityCategoryController.remove);

module.exports = router;
