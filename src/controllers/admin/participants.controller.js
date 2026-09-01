const pool = require("../../config/db");
const bcrypt = require("bcrypt");
const {
  logActivity,
  diffFields,
} = require("../../services/activityLog.service");

// Activity logging is best-effort: a failure here should never turn an
// otherwise-successful create/update/delete into a 500 for the client.
async function safeLogActivity(payload) {
  try {
    await logActivity(payload);
  } catch (err) {
    console.error("logActivity failed:", err);
  }
}

// Postgres unique_violation. Used as a defense-in-depth backstop for the
// check-then-write race between the uniqueness SELECT and the INSERT/UPDATE
// below: if two concurrent requests both pass the check, the DB constraint
// (not this code) is what actually prevents the duplicate, so we translate
// that low-level error into the same clean 409 the pre-check normally returns.
const UNIQUE_VIOLATION = "23505";

async function list(req, res, next) {
  const search = req.query.search;
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
  const offset = (page - 1) * limit;

  try {
    let query = `
      SELECT u.id, u.full_name, u.username, u.phone, u.email, u.university,
            u.stambuk, u.domicile_address, u.birth_place, u.birth_date,
            (SELECT COUNT(*) FROM attendance a WHERE a.user_id = u.id) AS events_attended
      FROM users u
      WHERE u.deleted_at IS NULL
    `;
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (u.full_name ILIKE $${params.length} OR u.username ILIKE $${params.length} OR u.phone ILIKE $${params.length} OR u.email ILIKE $${params.length})`;
    }

    params.push(limit, offset);
    query += ` ORDER BY u.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const result = await pool.query(query, params);
    return res.status(200).json({ data: result.rows });
  } catch (err) {
    return next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const userResult = await pool.query(
      `SELECT id, full_name, username, phone, email, university, stambuk, domicile_address, birth_place, birth_date
       FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [req.params.id],
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({
        error: true,
        code: "not_found",
        message: "Participant not found.",
      });
    }

    const eventsResult = await pool.query(
      `SELECT e.id AS event_id, e.name AS event_name, e.event_datetime,
          (a.id IS NOT NULL) AS attended, a.checked_in_at
   FROM events e
   LEFT JOIN attendance a ON a.event_id = e.id AND a.user_id = $1
   WHERE e.deleted_at IS NULL
   ORDER BY e.event_datetime DESC`,
      [req.params.id],
    );

    return res
      .status(200)
      .json({ data: { ...userResult.rows[0], events: eventsResult.rows } });
  } catch (err) {
    return next(err);
  }
}

async function create(req, res, next) {
  const { full_name, username, phone, email, password } = req.body;

  if (!full_name || !username || !phone || !password) {
    return res.status(422).json({
      error: true,
      code: "validation_error",
      message: "full_name, username, phone, and password are required.",
    });
  }

  try {
    const existing = await pool.query(
      "SELECT username, phone, email FROM users WHERE username = $1 OR phone = $2 OR email = $3",
      [username, phone, email || null],
    );

    if (existing.rows.length > 0) {
      const conflict = existing.rows[0];
      let code = "username_taken";
      if (conflict.phone === phone) code = "phone_taken";
      else if (email && conflict.email === email) code = "email_taken";

      return res.status(409).json({
        error: true,
        code,
        message:
          "An account with this username, phone, or email already exists.",
      });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (full_name, username, phone, email, password_hash)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, full_name, username, phone, email`,
      [full_name, username, phone, email || null, password_hash],
    );

    await safeLogActivity({
      actorType: "admin",
      actorId: req.user.id,
      actorName: req.user.full_name,
      action: "create_user",
      targetType: "user",
      targetId: result.rows[0].id,
      targetLabel: result.rows[0].full_name,
    });

    return res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    if (err.code === UNIQUE_VIOLATION) {
      return res.status(409).json({
        error: true,
        code: "conflict",
        message:
          "An account with this username, phone, or email already exists.",
      });
    }
    return next(err);
  }
}

async function update(req, res, next) {
  const allowedFields = [
    "full_name",
    "username",
    "phone",
    "email",
    "university",
    "stambuk",
    "domicile_address",
    "birth_place",
    "birth_date",
  ];

  const updates = {};

  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(422).json({
      error: true,
      code: "validation_error",
      message: "No valid fields to update.",
    });
  }

  try {
    const before = await pool.query(
      "SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL",
      [req.params.id],
    );

    if (before.rows.length === 0) {
      return res.status(404).json({
        error: true,
        code: "not_found",
        message: "Participant not found.",
      });
    }

    // Only re-check uniqueness for fields that are actually changing and
    // are subject to a unique constraint.
    if (
      (updates.username && updates.username !== before.rows[0].username) ||
      (updates.phone && updates.phone !== before.rows[0].phone) ||
      (updates.email && updates.email !== before.rows[0].email)
    ) {
      const existing = await pool.query(
        `SELECT username, phone, email FROM users
         WHERE id != $1
           AND (username = $2 OR phone = $3 OR email = $4)`,
        [
          req.params.id,
          updates.username || before.rows[0].username,
          updates.phone || before.rows[0].phone,
          updates.email !== undefined ? updates.email : before.rows[0].email,
        ],
      );

      if (existing.rows.length > 0) {
        const conflict = existing.rows[0];
        let code = "username_taken";
        if (updates.phone && conflict.phone === updates.phone)
          code = "phone_taken";
        else if (updates.email && conflict.email === updates.email)
          code = "email_taken";

        return res.status(409).json({
          error: true,
          code,
          message:
            "An account with this username, phone, or email already exists.",
        });
      }
    }

    const diff = diffFields(before.rows[0], updates);

    const setClauses = Object.keys(updates).map(
      (field, i) => `${field} = $${i + 2}`,
    );

    const values = Object.values(updates);

    const result = await pool.query(
      `UPDATE users
       SET ${setClauses.join(", ")}
       WHERE id = $1
         AND deleted_at IS NULL
       RETURNING id, full_name, username, phone, email`,
      [req.params.id, ...values],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: true,
        code: "not_found",
        message: "Participant not found.",
      });
    }

    await safeLogActivity({
      actorType: "admin",
      actorId: req.user.id,
      actorName: req.user.full_name,
      action: "update_user",
      targetType: "user",
      targetId: result.rows[0].id,
      targetLabel: result.rows[0].full_name,
      details: diff,
    });

    return res.status(200).json({ data: result.rows[0] });
  } catch (err) {
    if (err.code === UNIQUE_VIOLATION) {
      return res.status(409).json({
        error: true,
        code: "conflict",
        message:
          "An account with this username, phone, or email already exists.",
      });
    }
    return next(err);
  }
}

async function remove(req, res, next) {
  try {
    const result = await pool.query(
      `UPDATE users
       SET deleted_at = now()
       WHERE id = $1
         AND deleted_at IS NULL
       RETURNING id, full_name`,
      [req.params.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: true,
        code: "not_found",
        message: "Participant not found.",
      });
    }

    await safeLogActivity({
      actorType: "admin",
      actorId: req.user.id,
      actorName: req.user.full_name,
      action: "delete_user",
      targetType: "user",
      targetId: result.rows[0].id,
      targetLabel: result.rows[0].full_name,
    });

    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

module.exports = { list, getOne, create, update, remove };
