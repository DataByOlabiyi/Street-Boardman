const { z } = require('zod');
const AppError = require('./appError');
const { recordAuditLog } = require('../middleware/auditLog');

// Shared paging, date-range and CSV export for admin lists (FEAT-045).
// Every list keeps its original response key (users, bets, ...) and adds
// `page`, so existing screens keep working while they learn to paginate.
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 500;
const MAX_EXPORT_ROWS = 10_000;

const baseQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  format: z.enum(['json', 'csv']).default('json'),
});

function parseListQuery(query, filters = {}) {
  const result = baseQuery.extend(filters).safeParse(query);
  if (!result.success) throw new AppError(result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', '), 422);
  return result.data;
}

function dateRange(q) {
  if (!q.from && !q.to) return undefined;
  return { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) };
}

// Runs the query as a page (JSON) or as one capped export (CSV).
// `decorate` fills in derived fields (e.g. option totals) on the loaded rows.
async function runList({ req, res, q, model, where, orderBy, include, select, key, columns, resource, decorate }) {
  if (q.format === 'csv') {
    const rows = await model.findMany({ where, orderBy, include, select, take: MAX_EXPORT_ROWS });
    if (decorate) await decorate(rows);
    // Exports are the easiest way to take data out in bulk, so each one is
    // on the audit trail with who asked for what.
    await recordAuditLog({
      actorUserId: req.user.id,
      action: 'DATA_EXPORTED',
      entityType: resource,
      entityId: resource,
      afterState: { filters: req.query, rows: rows.length },
    });
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${resource}-${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.send(toCsv(rows, columns));
  }
  const [items, total] = await Promise.all([
    model.findMany({ where, orderBy, include, select, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    model.count({ where }),
  ]);
  if (decorate) await decorate(items);
  return res.json({ [key]: items, page: { page: q.page, pageSize: q.pageSize, total } });
}

// Spreadsheet apps execute cells starting with = + - @ (CSV injection), so
// those get a leading apostrophe; quotes, commas and newlines are escaped.
function csvCell(value) {
  if (value === null || value === undefined) return '';
  let text = value instanceof Date ? value.toISOString() : String(value);
  // A plain number (e.g. a -500.00 debit) can't be a formula; leave it numeric.
  if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows, columns) {
  const header = columns.map(([name]) => csvCell(name)).join(',');
  const lines = rows.map((row) => columns.map(([, pick]) => csvCell(pick(row))).join(','));
  return [header, ...lines].join('\r\n') + '\r\n';
}

module.exports = { parseListQuery, dateRange, runList, toCsv, csvCell, MAX_EXPORT_ROWS };
