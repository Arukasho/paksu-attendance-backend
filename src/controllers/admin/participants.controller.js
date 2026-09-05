import { prepareJsonbFields } from "../../utils/validators";

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

// Postgres check_violation. Fires e.g. if marriage_status is sent as
// something other than 'single'/'married' — translated to a 422 instead
// of falling through to a raw 500.
const CHECK_VIOLATION = "23514";

async function list(req, res, next) {
  const search = req.query.search;

  try {
    let query = `
      SELECT u.id, u.full_name, u.username, u.phone, u.email, u.university, u.role,
            u.stambuk, u.domicile_address, u.birth_place, u.birth_date,
            u.ktb_has, u.want_join_ktb, u.serve_as, u.serve_as_other, u.marriage_status,
            (SELECT COUNT(*) FROM attendance a WHERE a.user_id = u.id) AS events_attended
      FROM users u
      WHERE u.deleted_at IS NULL
    `;
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (u.full_name ILIKE $${params.length} OR u.username ILIKE $${params.length} OR u.phone ILIKE $${params.length} OR u.email ILIKE $${params.length})`;
    }

    query += ` ORDER BY
                CASE WHEN u.role = 'admin' THEN 0 ELSE 1 END,
                u.full_name ASC,
                u.id ASC`;

    const result = await pool.query(query, params);
    return res.status(200).json({ data: result.rows });
  } catch (err) {
    return next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const userResult = await pool.query(
      `SELECT id, full_name, username, phone, email, university, stambuk, domicile_address, birth_place, birth_date, ktb_has, want_join_ktb, serve_as, serve_as_other, marriage_status, role
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
    "ktb_has",
    "want_join_ktb",
    "serve_as",
    "serve_as_other",
    "marriage_status",
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

    prepareJsonbFields(updates, ["serve_as"]);

    const setClauses = Object.keys(updates).map(
      (field, i) => `${field} = $${i + 2}`,
    );

    const values = Object.values(updates);

    const result = await pool.query(
      `UPDATE users
       SET ${setClauses.join(", ")}
       WHERE id = $1
         AND deleted_at IS NULL
       RETURNING id, full_name, username, phone, email, university, stambuk, domicile_address, birth_place, birth_date, ktb_has, want_join_ktb, serve_as, serve_as_other, marriage_status`,
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
      action: "update_participant",
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
    if (err.code === CHECK_VIOLATION) {
      return res.status(422).json({
        error: true,
        code: "validation_error",
        message:
          "One or more fields have an invalid value (e.g. marriage_status must be 'single' or 'married').",
      });
    }
    return next(err);
  }
}

async function remove(req, res, next) {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({
        error: true,
        code: "cannot_delete_self",
        message: "You cannot delete your own account.",
      });
    }

    const target = await pool.query(
      "SELECT role, full_name FROM users WHERE id = $1 AND deleted_at IS NULL",
      [req.params.id],
    );
    if (target.rows.length === 0) {
      return res.status(404).json({
        error: true,
        code: "not_found",
        message: "Participant not found.",
      });
    }
    if (target.rows[0].role === "admin") {
      return res.status(400).json({
        error: true,
        code: "cannot_delete_admin",
        message:
          "This account is an admin. Revoke admin status before deleting.",
      });
    }

    await pool.query(
      "UPDATE users SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL",
      [req.params.id],
    );

    await safeLogActivity({
      actorType: "admin",
      actorId: req.user.id,
      actorName: req.user.full_name,
      action: "delete_participant",
      targetType: "user",
      targetId: req.params.id,
      targetLabel: target.rows[0].full_name,
    });

    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

async function changeRole(req, res, next) {
  const { role } = req.body;
  if (!["admin", "attendee"].includes(role)) {
    return res.status(422).json({
      error: true,
      code: "validation_error",
      message: 'role must be "admin" or "attendee".',
    });
  }

  if (req.params.id === req.user.id) {
    return res.status(400).json({
      error: true,
      code: "cannot_change_own_role",
      message: "You cannot change your own admin status.",
    });
  }

  try {
    const target = await pool.query(
      "SELECT full_name, role FROM users WHERE id = $1 AND deleted_at IS NULL",
      [req.params.id],
    );
    if (target.rows.length === 0) {
      return res.status(404).json({
        error: true,
        code: "not_found",
        message: "Participant not found.",
      });
    }

    if (role === "admin" && target.rows[0].role !== "admin") {
      const maxSetting = await pool.query(
        "SELECT value FROM app_settings WHERE key = 'max_admins'",
      );
      const maxAdmins = parseInt(maxSetting.rows[0]?.value || "5");

      const countResult = await pool.query(
        "SELECT COUNT(*) FROM users WHERE role = 'admin' AND deleted_at IS NULL",
      );
      if (parseInt(countResult.rows[0].count) >= maxAdmins) {
        return res.status(403).json({
          error: true,
          code: "max_admins_reached",
          message: `Maximum number of admins (${maxAdmins}) already reached.`,
        });
      }
    }

    const result = await pool.query(
      "UPDATE users SET role = $1 WHERE id = $2 RETURNING id, full_name, role",
      [role, req.params.id],
    );

    await safeLogActivity({
      actorType: "admin",
      actorId: req.user.id,
      actorName: req.user.full_name,
      action: role === "admin" ? "promote_admin" : "revoke_admin",
      targetType: "user",
      targetId: req.params.id,
      targetLabel: target.rows[0].full_name,
    });

    return res.status(200).json({ data: result.rows[0] });
  } catch (err) {
    return next(err);
  }
}

module.exports = { list, getOne, create, update, remove, changeRole };
