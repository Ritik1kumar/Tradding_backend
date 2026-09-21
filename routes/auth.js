var express = require('express');
var router = express.Router();
var authController = require('../controllers/auth.controller');

router.post('/login', authController.login);
router.post('/verify-otp', authController.verifyOtp);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);

module.exports = router;
