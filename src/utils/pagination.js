const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 10;

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

const getPagination = (query = {}) => {
  const page = parsePositiveInt(query.page, 1);
  const requestedLimit = parsePositiveInt(query.limit, DEFAULT_LIMIT);
  const limit = Math.min(requestedLimit, MAX_LIMIT);
  const offset = (page - 1) * limit;

  return { page, limit, offset };
};

const getPagingMeta = ({ total, page, limit }) => {
  const safeTotal = Number.isFinite(total) ? Number(total) : 0;
  const totalPages = safeTotal > 0 ? Math.ceil(safeTotal / limit) : 0;

  return {
    total: safeTotal,
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
};

module.exports = {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  getPagination,
  getPagingMeta,
};
