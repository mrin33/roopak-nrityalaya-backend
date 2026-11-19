// Optional, backwards-compatible pagination for list endpoints.
// Without ?limit the response is capped at DEFAULT_LIMIT rows so a table that
// keeps growing can never be returned in one unbounded response. The full row
// count is sent in the X-Total-Count header (exposed through CORS).
const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 1000;

/** Appends LIMIT/OFFSET placeholders to `values` and returns the SQL fragment. */
const pageClause = (values, { limit, offset } = {}) => {
  values.push(Math.min(limit || DEFAULT_LIMIT, MAX_LIMIT));
  const limitIdx = values.length;
  values.push(offset || 0);
  return 'LIMIT $' + limitIdx + ' OFFSET $' + values.length;
};

/** Sends rows (which must include a `total_count` column) with X-Total-Count. */
const sendPage = (res, rows) => {
  const total = rows.length ? Number(rows[0].total_count) : 0;
  res.set('X-Total-Count', String(total));
  res.json(rows.map(({ total_count, ...row }) => row));
};

module.exports = { DEFAULT_LIMIT, MAX_LIMIT, pageClause, sendPage };
