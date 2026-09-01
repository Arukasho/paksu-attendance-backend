const pool = require("../../config/db");

async function list(req, res, next) {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const offset = (page - 1) * limit;
  const actorType = req.query.actor_type; // optional filter: 'admin' | 'user'

  try {
    let query = "SELECT * FROM activity_logs";
    const params = [];
    if (actorType) {
      params.push(actorType);
      query += ` WHERE actor_type = $${params.length}`;
    }
    params.push(limit, offset);
    query += ` ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const result = await pool.query(query, params);
    return res.status(200).json({ data: result.rows });
  } catch (err) {
    return next(err);
  }
}

module.exports = { list };
