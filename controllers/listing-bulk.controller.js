const listingBulkService = require('../services/listing-bulk.service');
const { sendSuccess } = require('../lib/response');
const { AppError } = require('../lib/errors');

async function downloadTemplate(req, res, next) {
  try {
    const workbook = await listingBulkService.generateTemplateWorkbook();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', 'attachment; filename="listing-bulk-template.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
}

async function bulkUpload(req, res, next) {
  try {
    if (!req.file) {
      throw new AppError('file is required', 400);
    }
    const result = await listingBulkService.parseUploadedWorkbook(req.file.buffer, req.user.id);
    sendSuccess(res, 200, result);
  } catch (err) {
    next(err);
  }
}

async function bulkConfirm(req, res, next) {
  try {
    const { rows } = req.body;
    const result = await listingBulkService.bulkConfirmRows(req.user.id, rows);
    sendSuccess(res, 200, result);
  } catch (err) {
    next(err);
  }
}

module.exports = { downloadTemplate, bulkUpload, bulkConfirm };
