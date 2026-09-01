const pool = require("../../config/db");
const { logActivity } = require("../../services/activityLog.service");

async function summary(req, res, next) {
  try {
    const activeEventResult = await pool.query(
      `SELECT id, name, event_datetime FROM events
   WHERE deleted_at IS NULL
     AND event_datetime::date = CURRENT_DATE
     AND (
       (auto_activate = true AND now() BETWEEN event_datetime - interval '3 hours' AND event_datetime + interval '3 hours')
       OR (auto_activate = false AND is_active = true)
     )
   ORDER BY auto_activate ASC, event_datetime ASC
   LIMIT 1`,
    );

    if (activeEventResult.rows.length === 0) {
      return res.status(200).json({ data: { active_event: null } });
    }

    const event = activeEventResult.rows[0];

    const registeredResult = await pool.query(
      "SELECT COUNT(*) FROM users WHERE deleted_at IS NULL",
    );
    const attendingResult = await pool.query(
      "SELECT COUNT(*) FROM attendance WHERE event_id = $1",
      [event.id],
    );

    const registered = parseInt(registeredResult.rows[0].count);
    const attending = parseInt(attendingResult.rows[0].count);
    const notAttended = registered - attending;
    const attendanceRate =
      registered > 0 ? Math.round((attending / registered) * 1000) / 10 : 0;

    return res.status(200).json({
      data: {
        active_event: {
          id: event.id,
          name: event.name,
          event_datetime: event.event_datetime,
          registered,
          attending,
          not_attended: notAttended,
          attendance_rate: attendanceRate,
        },
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function eventSummary(req, res, next) {
  try {
    const eventResult = await pool.query(
      `SELECT id, name FROM events
       WHERE id = $1 AND deleted_at IS NULL`,
      [req.params.id],
    );

    if (eventResult.rows.length === 0) {
      return res
        .status(404)
        .json({ error: true, code: "not_found", message: "Event not found." });
    }

    const event = eventResult.rows[0];

    const registeredResult = await pool.query(
      "SELECT COUNT(*) FROM users WHERE deleted_at IS NULL",
    );
    const presentResult = await pool.query(
      "SELECT COUNT(*) FROM attendance WHERE event_id = $1",
      [event.id],
    );

    const totalRegistered = parseInt(registeredResult.rows[0].count);
    const present = parseInt(presentResult.rows[0].count);
    const notPresent = totalRegistered - present;
    const attendanceRate =
      totalRegistered > 0
        ? Math.round((present / totalRegistered) * 1000) / 10
        : 0;

    return res.status(200).json({
      data: {
        event: { id: event.id, name: event.name },
        total_registered: totalRegistered,
        present,
        not_present: notPresent,
        attendance_rate: attendanceRate,
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function eventAttendance(req, res, next) {
  try {
    const eventResult = await pool.query(
      "SELECT id, name FROM events WHERE id = $1",
      [req.params.id],
    );
    if (eventResult.rows.length === 0) {
      return res
        .status(404)
        .json({ error: true, code: "not_found", message: "Event not found." });
    }

    const attendeesResult = await pool.query(
      `SELECT u.id AS user_id, u.full_name, u.university, a.checked_in_at
       FROM attendance a
       JOIN users u ON u.id = a.user_id
       WHERE a.event_id = $1
       ORDER BY a.checked_in_at DESC`,
      [req.params.id],
    );

    return res.status(200).json({
      data: { event: eventResult.rows[0], attendees: attendeesResult.rows },
    });
  } catch (err) {
    return next(err);
  }
}

async function eventAttendanceFull(req, res, next) {
  const { id: eventId } = req.params;
  const search = req.query.search ? `%${req.query.search}%` : null;

  try {
    const eventResult = await pool.query(
      "SELECT id, name FROM events WHERE id = $1",
      [eventId],
    );
    if (eventResult.rows.length === 0) {
      return res
        .status(404)
        .json({ error: true, code: "not_found", message: "Event not found." });
    }

    const attendeesResult = await pool.query(
      `SELECT u.id AS user_id, u.full_name, u.username, u.university,
              (a.id IS NOT NULL) AS attended, a.checked_in_at
       FROM users u
       LEFT JOIN attendance a ON a.user_id = u.id AND a.event_id = $1
       WHERE u.deleted_at IS NULL
         AND ($2::text IS NULL OR u.full_name ILIKE $2 OR u.username ILIKE $2)
       ORDER BY attended DESC, u.full_name ASC`,
      [eventId, search],
    );

    return res.status(200).json({
      data: { event: eventResult.rows[0], attendees: attendeesResult.rows },
    });
  } catch (err) {
    return next(err);
  }
}

async function manualCheckin(req, res, next) {
  const { id: eventId, userId } = req.params;

  try {
    const existing = await pool.query(
      "SELECT id FROM attendance WHERE user_id = $1 AND event_id = $2",
      [userId, eventId],
    );
    if (existing.rows.length > 0) {
      return res.status(200).json({ data: { status: "already_checked_in" } });
    }

    const inserted = await pool.query(
      "INSERT INTO attendance (user_id, event_id) VALUES ($1, $2) RETURNING checked_in_at",
      [userId, eventId],
    );

    const userInfo = await pool.query(
      "SELECT full_name FROM users WHERE id = $1",
      [userId],
    );

    await logActivity({
      actorType: "admin",
      actorId: req.user.id,
      actorName: req.user.full_name,
      action: "mark_present",
      targetType: "user",
      targetId: userId,
      targetLabel: userInfo.rows[0]?.full_name,
      details: { event_id: eventId },
    });

    return res.status(201).json({
      data: {
        status: "success",
        checked_in_at: inserted.rows[0].checked_in_at,
      },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  summary,
  eventSummary,
  eventAttendance,
  eventAttendanceFull,
  manualCheckin,
};
