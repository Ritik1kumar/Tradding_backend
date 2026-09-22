const tosVersionService = require('../services/tosVersion.service');

async function publish(req, res, next) {
  try {
    const { effectiveDate, termsUrl, privacyUrl } = req.body;
    const tosVersion = await tosVersionService.publishVersion(
      { effectiveDate, termsUrl, privacyUrl },
      req.user.id
    );
    res.status(201).json(tosVersion);
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const versions = await tosVersionService.listVersions();
    res.status(200).json(versions);
  } catch (err) {
    next(err);
  }
}

async function current(req, res, next) {
  try {
    const version = await tosVersionService.getCurrentVersion();
    res.status(200).json(version);
  } catch (err) {
    next(err);
  }
}

module.exports = { publish, list, current };
