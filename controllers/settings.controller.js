const settingsService = require('../services/settings.service');
const { sendSuccess } = require('../lib/response');

async function list(req, res, next) {
  try {
    const settings = await settingsService.listSettings();
    sendSuccess(res, 200, settings);
  } catch (err) {
    next(err);
  }
}

async function getByKey(req, res, next) {
  try {
    const { key } = req.params;
    const setting = await settingsService.getSetting(key);
    sendSuccess(res, 200, setting);
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const { key } = req.params;
    const { value } = req.body;
    const setting = await settingsService.upsertSetting(key, value, req.user.id);
    sendSuccess(res, 200, setting);
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getByKey, update };
