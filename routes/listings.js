var express = require('express');
var router = express.Router();
var { authenticate } = require('../middleware/auth');
var listingController = require('../controllers/listing.controller');

router.use(authenticate);

router.post('/', listingController.create);
router.get('/', listingController.list);
router.get('/:id', listingController.getById);
// Must come before '/:id' — otherwise Express would match "bulk-price" as :id.
router.patch('/bulk-price', listingController.bulkPrice);
router.patch('/:id/withdraw', listingController.withdraw);
router.patch('/:id', listingController.update);

module.exports = router;
