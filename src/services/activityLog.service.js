const pool = require("../config/db");

async function logActivity({
  actorType,
  actorId,
  actorName,
  action,
  targetType,
  targetId,
  targetLabel,
  details,
}) {
  try {
    await pool.query(
      `INSERT INTO activity_logs (actor_type, actor_id, actor_name, action, target_type, target_id, target_label, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        actorType,
        actorId || null,
        actorName || null,
        action,
        targetType || null,
        targetId || null,
        targetLabel || null,
        details ? JSON.stringify(details) : null,
      ],
    );
  } catch (err) {
    console.error("[activityLog] failed to write log:", err); // never let logging failure break the actual operation
  }
}

function diffFields(oldRow, updates) {
  const diff = {};
  for (const key of Object.keys(updates)) {
    if (String(oldRow[key] ?? "") !== String(updates[key] ?? "")) {
      diff[key] = { from: oldRow[key], to: updates[key] };
    }
  }
  return diff;
}

module.exports = { logActivity, diffFields };
