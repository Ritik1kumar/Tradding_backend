const commodityCategoryService = require('../services/commodityCategory.service');
const { sendSuccess } = require('../lib/response');
const { parsePagination, buildMeta } = require('../lib/pagination');

async function create(req, res, next) {
  try {
    const { name } = req.body;
    const category = await commodityCategoryService.createCategory(name, req.user.id);
    sendSuccess(res, 201, category);
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const { name } = req.query;
    const { page, limit, skip, take } = parsePagination(req.query);
    const { data, total } = await commodityCategoryService.listCategories({ name, skip, take });
    sendSuccess(res, 200, data, buildMeta({ page, limit, total }));
  } catch (err) {
    next(err);
  }
}

async function rename(req, res, next) {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const category = await commodityCategoryService.renameCategory(id, name, req.user.id);
    sendSuccess(res, 200, category);
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const { id } = req.params;
    await commodityCategoryService.deleteCategory(id, req.user.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { create, list, rename, remove };
