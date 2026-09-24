const tosService = require('../services/tos.service');
const { sendSuccess } = require('../lib/response');

async function accept(req, res, next) {
  try {
    const { version } = req.body;
    const result = await tosService.acceptTos(req.user.id, version);
    sendSuccess(res, 200, result);
  } catch (err) {
    next(err);
  }
}

async function status(req, res, next) {
  try {
    const result = await tosService.getTosStatus(req.user.id);
    sendSuccess(res, 200, result);
  } catch (err) {
    next(err);
  }
}

module.exports = { accept, status };
