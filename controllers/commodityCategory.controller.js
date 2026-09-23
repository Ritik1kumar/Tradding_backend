const commodityCategoryService = require('../services/commodityCategory.service');

async function create(req, res, next) {
  try {
    const { name } = req.body;
    const category = await commodityCategoryService.createCategory(name, req.user.id);
    res.status(201).json(category);
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const categories = await commodityCategoryService.listCategories();
    res.status(200).json(categories);
  } catch (err) {
    next(err);
  }
}

async function rename(req, res, next) {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const category = await commodityCategoryService.renameCategory(id, name, req.user.id);
    res.status(200).json(category);
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
