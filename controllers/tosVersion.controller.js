const tosVersionService = require('../services/tosVersion.service');
const { sendSuccess } = require('../lib/response');

async function publish(req, res, next) {
  try {
    const { effectiveDate, termsUrl, privacyUrl } = req.body;
    const tosVersion = await tosVersionService.publishVersion(
      { effectiveDate, termsUrl, privacyUrl },
      req.user.id
    );
    sendSuccess(res, 201, tosVersion);
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const versions = await tosVersionService.listVersions();
    sendSuccess(res, 200, versions);
  } catch (err) {
    next(err);
  }
}

async function current(req, res, next) {
  try {
    const version = await tosVersionService.getCurrentVersion();
    sendSuccess(res, 200, version);
  } catch (err) {
    next(err);
  }
}

module.exports = { publish, list, current };
