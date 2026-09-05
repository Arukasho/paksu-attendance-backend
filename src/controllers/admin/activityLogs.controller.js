const pool = require("../../config/db");

async function list(req, res, next) {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const offset = (page - 1) * limit;
  const actorType = req.query.actor_type;

  try {
    let baseQuery = "FROM activity_logs";
    const whereParams = [];
    if (actorType) {
      whereParams.push(actorType);
      baseQuery += ` WHERE actor_type = $${whereParams.length}`;
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) ${baseQuery}`,
      whereParams,
    );
    const total = parseInt(countResult.rows[0].count);

    const dataParams = [...whereParams, limit, offset];
    const dataQuery = `SELECT * ${baseQuery} ORDER BY created_at DESC LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`;
    const result = await pool.query(dataQuery, dataParams);

    return res.status(200).json({
      data: result.rows,
      meta: { page, limit, total, total_pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { list };
