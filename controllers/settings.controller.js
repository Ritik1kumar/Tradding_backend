const settingsService = require('../services/settings.service');
const { sendSuccess } = require('../lib/response');
const { parsePagination, buildMeta } = require('../lib/pagination');

async function list(req, res, next) {
  try {
    const { key } = req.query;
    const { page, limit, skip, take } = parsePagination(req.query);
    const { data, total } = await settingsService.listSettings({ key, skip, take });
    sendSuccess(res, 200, data, buildMeta({ page, limit, total }));
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
