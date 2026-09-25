const { AppError } = require('./errors');

// Case-insensitive "contains" filter for a text field, e.g. ?name=chana ->
// { name: { contains: 'chana', mode: 'insensitive' } }. Returns undefined
// for an empty/absent value so callers can spread it straight into `where`.
function buildContainsFilter(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return undefined;
  }
  return { contains: value.trim(), mode: 'insensitive' };
}

// Parses a `from`/`to` pair (date-only or ISO strings) into a Prisma
// gte/lte range filter for a DateTime field. Returns undefined when neither
// bound is given; throws on an unparsable date.
function buildDateRangeFilter(from, to, fieldName = 'date') {
  const range = {};

  if (from !== undefined) {
    const fromDate = new Date(from);
    if (Number.isNaN(fromDate.getTime())) {
      throw new AppError(`${fieldName}From must be a valid date`, 400);
    }
    range.gte = fromDate;
  }

  if (to !== undefined) {
    const toDate = new Date(to);
    if (Number.isNaN(toDate.getTime())) {
      throw new AppError(`${fieldName}To must be a valid date`, 400);
    }
    range.lte = toDate;
  }

  return Object.keys(range).length ? range : undefined;
}

module.exports = { buildContainsFilter, buildDateRangeFilter };
