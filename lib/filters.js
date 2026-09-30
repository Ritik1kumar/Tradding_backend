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

// Parses a `min`/`max` pair into a Prisma gte/lte range filter for a numeric
// field (e.g. price). Returns undefined when neither bound is given; throws
// on a non-finite value.
function buildNumberRangeFilter(min, max, fieldName = 'value') {
  const range = {};

  if (min !== undefined) {
    const parsedMin = Number(min);
    if (!Number.isFinite(parsedMin)) {
      throw new AppError(`min${capitalize(fieldName)} must be a valid number`, 400);
    }
    range.gte = parsedMin;
  }

  if (max !== undefined) {
    const parsedMax = Number(max);
    if (!Number.isFinite(parsedMax)) {
      throw new AppError(`max${capitalize(fieldName)} must be a valid number`, 400);
    }
    range.lte = parsedMax;
  }

  return Object.keys(range).length ? range : undefined;
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

module.exports = { buildContainsFilter, buildDateRangeFilter, buildNumberRangeFilter };
