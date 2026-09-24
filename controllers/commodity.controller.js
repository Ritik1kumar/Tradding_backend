const commodityService = require('../services/commodity.service');
const { sendSuccess } = require('../lib/response');

async function create(req, res, next) {
  try {
    const { categoryId, name } = req.body;
    const commodity = await commodityService.createCommodity(categoryId, name, req.user.id);
    sendSuccess(res, 201, commodity);
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const { categoryId } = req.query;
    const commodities = await commodityService.listCommodities(categoryId);
    sendSuccess(res, 200, commodities);
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const { id } = req.params;
    const { name, categoryId } = req.body;
    const commodity = await commodityService.updateCommodity(
      id,
      { name, categoryId },
      req.user.id
    );
    sendSuccess(res, 200, commodity);
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const { id } = req.params;
    await commodityService.deleteCommodity(id, req.user.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { create, list, update, remove };
