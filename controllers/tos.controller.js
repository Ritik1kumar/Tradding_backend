const tosService = require('../services/tos.service');

async function accept(req, res, next) {
  try {
    const { version } = req.body;
    const result = await tosService.acceptTos(req.user.id, version);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

async function status(req, res, next) {
  try {
    const result = await tosService.getTosStatus(req.user.id);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { accept, status };
