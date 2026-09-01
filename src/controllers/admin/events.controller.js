const pool = require("../../config/db");
const {
  logActivity,
  diffFields,
} = require("../../services/activityLog.service");

// Activity logging is best-effort: a failure here should never turn an
// otherwise-successful request into a 500 for the client.
async function safeLogActivity(payload) {
  try {
    await logActivity(payload);
  } catch (err) {
    console.error("logActivity failed:", err);
  }
}

async function list(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT e.id, e.name, e.event_datetime, e.location, e.checkin_open_minutes, e.checkin_close_minutes,
          e.auto_activate,
          CASE WHEN e.auto_activate THEN
            (now() BETWEEN e.event_datetime - (e.checkin_open_minutes || ' minutes')::interval
                        AND e.event_datetime + (e.checkin_close_minutes || ' minutes')::interval)
          ELSE e.is_active END AS is_active,
          (SELECT COUNT(*) FROM attendance a WHERE a.event_id = e.id) AS attended_count
   FROM events e
   WHERE e.deleted_at IS NULL
   ORDER BY e.event_datetime DESC`,
    );
    return res.status(200).json({ data: result.rows });
  } catch (err) {
    return next(err);
  }
}

async function create(req, res, next) {
  const {
    name,
    event_datetime,
    location,
    checkin_open_minutes,
    checkin_close_minutes,
  } = req.body;

  if (!name || !event_datetime) {
    return res.status(422).json({
      error: true,
      code: "validation_error",
      message: "name and event_datetime are required.",
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO events (name, event_datetime, location, checkin_open_minutes, checkin_close_minutes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        name,
        event_datetime,
        location || null,
        checkin_open_minutes || 120,
        checkin_close_minutes || 60,
      ],
    );

    await safeLogActivity({
      actorType: "admin",
      actorId: req.user.id,
      actorName: req.user.full_name,
      action: "create_event",
      targetType: "event",
      targetId: result.rows[0].id,
      targetLabel: result.rows[0].name,
    });

    return res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    return next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const result = await pool.query(
      "SELECT * FROM events WHERE id = $1 AND deleted_at IS NULL",
      [req.params.id],
    );
    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ error: true, code: "not_found", message: "Event not found." });
    }
    return res.status(200).json({ data: result.rows[0] });
  } catch (err) {
    return next(err);
  }
}

async function update(req, res, next) {
  const allowedFields = [
    "name",
    "event_datetime",
    "location",
    "checkin_open_minutes",
    "checkin_close_minutes",
    "is_active",
  ];
  const updates = {};

  for (const field of allowedFields) {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  }

  if (updates.is_active !== undefined) {
    updates.auto_activate = false; // manual toggle always overrides auto behavior
  }

  if (Object.keys(updates).length === 0) {
    return res.status(422).json({
      error: true,
      code: "validation_error",
      message: "No valid fields to update.",
    });
  }

  const setClauses = Object.keys(updates).map(
    (field, i) => `${field} = $${i + 2}`,
  );
  const values = Object.values(updates);

  try {
    const before = await pool.query(
      "SELECT * FROM events WHERE id = $1 AND deleted_at IS NULL",
      [req.params.id],
    );

    if (before.rows.length === 0) {
      return res
        .status(404)
        .json({ error: true, code: "not_found", message: "Event not found." });
    }

    const diff = diffFields(before.rows[0], updates);

    const result = await pool.query(
      `UPDATE events SET ${setClauses.join(", ")} WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [req.params.id, ...values],
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ error: true, code: "not_found", message: "Event not found." });
    }

    await safeLogActivity({
      actorType: "admin",
      actorId: req.user.id,
      actorName: req.user.full_name,
      action: "update_event",
      targetType: "event",
      targetId: req.params.id,
      targetLabel: result.rows[0].name,
      details: diff,
    });

    return res.status(200).json({ data: result.rows[0] });
  } catch (err) {
    return next(err);
  }
}

async function remove(req, res, next) {
  try {
    const eventInfo = await pool.query(
      "SELECT name FROM events WHERE id = $1 AND deleted_at IS NULL",
      [req.params.id],
    );

    if (eventInfo.rows.length === 0) {
      return res
        .status(404)
        .json({ error: true, code: "not_found", message: "Event not found." });
    }

    await pool.query(
      "UPDATE events SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL",
      [req.params.id],
    );

    const userInfo = await pool.query(
      "SELECT full_name FROM users WHERE id = $1 AND deleted_at IS NULL",
      [req.user.id],
    );
    if (userInfo.rows.length === 0) {
      return res
        .status(404)
        .json({ error: true, code: "not_found", message: "User not found." });
    }

    await safeLogActivity({
      actorType: "admin",
      actorId: req.user.id,
      actorName: userInfo.rows[0].full_name,
      action: "delete_event",
      targetType: "event",
      targetId: req.params.id,
      targetLabel: eventInfo.rows[0].name,
    });

    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

module.exports = { list, create, getOne, update, remove };
