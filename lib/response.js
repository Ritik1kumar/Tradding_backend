function sendSuccess(res, statusCode, data, meta) {
  const body = { success: true, data };
  if (meta !== undefined) {
    body.meta = meta;
  }
  return res.status(statusCode).json(body);
}

module.exports = { sendSuccess };
