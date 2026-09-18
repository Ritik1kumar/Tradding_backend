const inviteService = require('../services/invite.service');

async function sendInvitation(req, res, next) {
  try {
    const { phone, roleHint } = req.body;
    const invite = await inviteService.sendInvitation({
      phone,
      roleHint,
      actorUserId: req.user.id,
    });
    res.status(201).json(invite);
  } catch (err) {
    next(err);
  }
}

async function listInvitations(req, res, next) {
  try {
    const { status } = req.query;
    const invites = await inviteService.listInvitations({ status });
    res.status(200).json(invites);
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
    res.status(200).json(invite);
  } catch (err) {
    next(err);
  }
}

module.exports = { sendInvitation, listInvitations, cancelInvitation };
