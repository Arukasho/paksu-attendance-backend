// TODO: implement — all routes here require authenticate middleware (req.user.id available).
// See docs/api-contract.md section 2.

const pool = require("../config/db");
const multer = require("multer");
const supabase = require("../config/supabaseStorage");

const { revokeAllRefreshTokensForUser } = require("../services/token.service");
const { logActivity, diffFields } = require("../services/activityLog.service");

// Activity logging is best-effort: a failure here should never turn an
// otherwise-successful update into a 500 for the client.
async function safeLogActivity(payload) {
  try {
    await logActivity(payload);
  } catch (err) {
    console.error("logActivity failed:", err);
  }
}

// Only these are accepted as actual profile photos. Extension is derived
// from this map (never from client-supplied originalname) so a renamed
// file (e.g. "evil.sh" sent as "photo.jpg") can't smuggle an unexpected
// type through, and so the stored key is predictable.
const ALLOWED_PHOTO_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_PHOTO_MIME_TYPES.has(file.mimetype)) {
      const err = new Error("Only JPEG, PNG, or WebP images are allowed.");
      err.code = "invalid_file_type";
      return cb(err);
    }
    cb(null, true);
  },
});

async function getMe(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT id, full_name, username, phone, email, profile_photo_url,
              university, stambuk, domicile_address, birth_place, birth_date, ktb_has, want_join_ktb, serve_as, serve_as_other, marriage_status, created_at
       FROM users WHERE id = $1 AND deleted_at IS NULL`,
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
    "ktb_has",
    "want_join_ktb",
    "marriage_status",
  ];

  const filled = fields.filter(
    (f) => user[f] !== null && user[f] !== undefined && user[f] !== "",
  ).length;

  const hasServiceRole =
    (user.serve_as !== null &&
      user.serve_as !== undefined &&
      user.serve_as !== "") ||
    (user.serve_as_other !== null &&
      user.serve_as_other !== undefined &&
      user.serve_as_other !== "");

  const totalFields = fields.length + 1;
  const completedFields = filled + (hasServiceRole ? 1 : 0);

  return Math.round((completedFields / totalFields) * 100);
}

async function updateMe(req, res, next) {
  const allowedFields = [
    "university",
    "stambuk",
    "domicile_address",
    "birth_place",
    "birth_date",
    "email",
    "ktb_has",
    "want_join_ktb",
    "serve_as",
    "serve_as_other",
    "marriage_status",
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
    const before = await pool.query(
      "SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL",
      [req.user.id],
    );

    if (before.rows.length === 0) {
      return res
        .status(404)
        .json({ error: true, code: "not_found", message: "User not found." });
    }

    const diff = diffFields(before.rows[0], updates);

    const result = await pool.query(
      `UPDATE users SET ${setClauses.join(", ")} WHERE id = $1 AND deleted_at IS NULL
       RETURNING id, full_name, username, phone, email, profile_photo_url,
                 university, stambuk, domicile_address, birth_place, birth_date, ktb_has, want_join_ktb, serve_as, serve_as_other, marriage_status`,
      [req.user.id, ...values],
    );

    const user = result.rows[0];

    await safeLogActivity({
      actorType: "user",
      actorId: req.user.id,
      actorName: user.full_name,
      action: "update_profile",
      targetType: "user",
      targetId: req.user.id,
      targetLabel: user.full_name,
      details: diff,
    });

    return res.status(200).json({
      data: { ...user, profile_completion: calculateCompletion(user) },
    });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({
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

  // Belt-and-suspenders: fileFilter should already have rejected this
  // upstream, but don't trust wiring elsewhere to have applied it.
  if (!ALLOWED_PHOTO_MIME_TYPES.has(req.file.mimetype)) {
    return res.status(422).json({
      error: true,
      code: "invalid_file_type",
      message: "Only JPEG, PNG, or WebP images are allowed.",
    });
  }

  // Fixed key per user, with no extension in the path: re-uploading in a
  // different format still overwrites the same storage object instead of
  // leaving the previous file behind as an orphan.
  const filePath = `${req.user.id}`;

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

    await pool.query(
      "UPDATE users SET profile_photo_url = $1 WHERE id = $2 AND deleted_at IS NULL",
      [photoUrl, req.user.id],
    );

    return res.status(200).json({ data: { profile_photo_url: photoUrl } });
  } catch (err) {
    return next(err);
  }
}

async function getAttendanceHistory(req, res, next) {
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
  const offset = (page - 1) * limit;

  try {
    const result = await pool.query(
      `SELECT e.id AS event_id, e.name AS event_name, e.event_datetime, e.location, 
          a.checked_in_at, a.already_fill_form,
          COUNT(*) OVER() AS total_count
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
  upload,
  getMe,
  updateMe,
  uploadPhoto,
  getAttendanceHistory,
  logoutAllDevices,
};
