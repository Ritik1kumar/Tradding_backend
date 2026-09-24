const inviteService = require('../services/invite.service');
const { sendSuccess } = require('../lib/response');
const { parsePagination, buildMeta } = require('../lib/pagination');

async function sendInvitation(req, res, next) {
  console.log("this is issue")
  try {
    const { phone, roleHint } = req.body;
    const invite = await inviteService.sendInvitation({
      phone,
      roleHint,
      actorUserId: req.user.id,
    });
    sendSuccess(res, 201, invite);
  } catch (err) {
    next(err);
  }
}

async function listInvitations(req, res, next) {
  try {
    const { status, phone, roleHint, createdFrom, createdTo } = req.query;
    const { page, limit, skip, take } = parsePagination(req.query);
    const { data, total } = await inviteService.listInvitations({
      status,
      phone,
      roleHint,
      createdFrom,
      createdTo,
      skip,
      take,
    });
    sendSuccess(res, 200, data, buildMeta({ page, limit, total }));
  } catch (err) {
    next(err);
  }
}

async function cancelInvitation(req, res, next) {
  try {
    const { id } = req.params;
    const invite = await inviteService.cancelInvitation({
      id,
      actorUserId: req.user.id,
    });
    sendSuccess(res, 200, invite);
  } catch (err) {
    next(err);
  }
}

module.exports = { sendInvitation, listInvitations, cancelInvitation };
