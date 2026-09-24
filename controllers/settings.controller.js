const settingsService = require('../services/settings.service');

async function list(req, res, next) {
  try {
    const settings = await settingsService.listSettings();
    res.status(200).json(settings);
  } catch (err) {
    next(err);
  }
}

async function getByKey(req, res, next) {
  try {
    const { key } = req.params;
    const setting = await settingsService.getSetting(key);
    res.status(200).json(setting);
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const { key } = req.params;
    const { value } = req.body;
    const setting = await settingsService.upsertSetting(key, value, req.user.id);
    res.status(200).json(setting);
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getByKey, update };
