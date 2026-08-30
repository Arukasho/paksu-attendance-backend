// TODO: implement — all routes here require authenticate middleware (req.user.id available).
// See docs/api-contract.md section 2.

const pool = require("../config/db");
const multer = require("multer");
const supabase = require("../config/supabaseStorage");

const { revokeAllRefreshTokensForUser } = require("../services/token.service");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
}); // 5MB max

async function getMe(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT id, full_name, username, phone, email, profile_photo_url,
              university, stambuk, domicile_address, birth_place, birth_date, created_at
       FROM users WHERE id = $1`,
      [req.user.id],
    );
    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ error: true, code: "not_found", message: "User not found." });
    }
    const user = result.rows[0];
    return res.status(200).json({
      data: { ...user, profile_completion: calculateCompletion(user) },
    });
  } catch (err) {
    return next(err);
  }
}

function calculateCompletion(user) {
  const fields = [
    "university",
    "stambuk",
    "domicile_address",
    "birth_place",
    "birth_date",
    "profile_photo_url",
  ];
  const filled = fields.filter(
    (f) => user[f] !== null && user[f] !== undefined && user[f] !== "",
  ).length;
  return Math.round((filled / fields.length) * 100);
}

async function updateMe(req, res, next) {
  const allowedFields = [
    "university",
    "stambuk",
    "domicile_address",
    "birth_place",
    "birth_date",
    "email",
  ];
  const updates = {};

  for (const field of allowedFields) {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
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
    const result = await pool.query(
      `UPDATE users SET ${setClauses.join(", ")} WHERE id = $1
       RETURNING id, full_name, username, phone, email, profile_photo_url,
                 university, stambuk, domicile_address, birth_place, birth_date`,
      [req.user.id, ...values],
    );

    const user = result.rows[0];
    return res.status(200).json({
      data: { ...user, profile_completion: calculateCompletion(user) },
    });
  } catch (err) {
    if (err.code === "23505") {
      return res
        .status(409)
        .json({
          error: true,
          code: "email_taken",
          message: "This email is already in use.",
        });
    }
    return next(err);
  }
}

async function uploadPhoto(req, res, next) {
  if (!req.file) {
    return res.status(422).json({
      error: true,
      code: "validation_error",
      message: "No photo file provided.",
    });
  }

  const fileExt = req.file.originalname.split(".").pop();
  const filePath = `${req.user.id}.${fileExt}`;

  try {
    const { error: uploadError } = await supabase.storage
      .from("profile-photos")
      .upload(filePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: true,
      });

    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabase.storage
      .from("profile-photos")
      .getPublicUrl(filePath);
    const photoUrl = publicUrlData.publicUrl;

    await pool.query("UPDATE users SET profile_photo_url = $1 WHERE id = $2", [
      photoUrl,
      req.user.id,
    ]);

    return res.status(200).json({ data: { profile_photo_url: photoUrl } });
  } catch (err) {
    return next(err);
  }
}

async function getAttendanceHistory(req, res, next) {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;

  try {
    const result = await pool.query(
      `SELECT e.id AS event_id, e.name AS event_name, e.event_datetime, e.location, a.checked_in_at
       FROM attendance a
       JOIN events e ON e.id = a.event_id
       WHERE a.user_id = $1
       ORDER BY a.checked_in_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset],
    );

    const countResult = await pool.query(
      "SELECT COUNT(*) FROM attendance WHERE user_id = $1",
      [req.user.id],
    );
    const total = parseInt(countResult.rows[0].count);

    return res.status(200).json({
      data: result.rows,
      meta: { page, limit, total, total_pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    return next(err);
  }
}

async function logoutAllDevices(req, res, next) {
  try {
    await revokeAllRefreshTokensForUser(req.user.id);
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getMe,
  updateMe,
  uploadPhoto,
  getAttendanceHistory,
  logoutAllDevices,
};
