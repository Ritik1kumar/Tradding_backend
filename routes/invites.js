var express = require('express');
var router = express.Router();
var { authenticate, requireRole } = require('../middleware/auth');
var inviteController = require('../controllers/invite.controller');

router.use(authenticate, requireRole(['admin', 'broker']));

router.post('/', inviteController.sendInvitation);
router.get('/', inviteController.listInvitations);
router.patch('/:id/cancel', inviteController.cancelInvitation);

module.exports = router;
