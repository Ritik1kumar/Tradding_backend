const { AppError } = require('./errors');

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

// Parses ?page & ?limit off req.query into Prisma-ready skip/take, with
// sane defaults and a hard cap so a client can't force an unbounded findMany.
function parsePagination({ page, limit } = {}) {
  let parsedPage = DEFAULT_PAGE;
  if (page !== undefined) {
    parsedPage = Number(page);
    if (!Number.isInteger(parsedPage) || parsedPage < 1) {
      throw new AppError('page must be a positive integer', 400);
    }
  }

  let parsedLimit = DEFAULT_LIMIT;
  if (limit !== undefined) {
    parsedLimit = Number(limit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1) {
      throw new AppError('limit must be a positive integer', 400);
    }
    if (parsedLimit > MAX_LIMIT) {
      throw new AppError(`limit must not exceed ${MAX_LIMIT}`, 400);
    }
  }

  return {
    page: parsedPage,
    limit: parsedLimit,
    skip: (parsedPage - 1) * parsedLimit,
    take: parsedLimit,
  };
}

function buildMeta({ page, limit, total }) {
  return {
    page,
    limit,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  };
}

module.exports = { parsePagination, buildMeta };
