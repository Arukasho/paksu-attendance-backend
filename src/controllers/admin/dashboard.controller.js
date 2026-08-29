// TODO: implement. See docs/api-contract.md section 7.
const pool = require("../../config/db");

async function summary(req, res, next) {
  try {
    const activeEventResult = await pool.query(
      `SELECT id, name, event_datetime FROM events
       WHERE is_active = true AND deleted_at IS NULL AND event_datetime::date = CURRENT_DATE
       ORDER BY event_datetime ASC LIMIT 1`,
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
  res.status(501).json({
    error: true,
    code: "not_implemented",
    message: "event summary: TODO",
  });
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

    return res
      .status(200)
      .json({
        data: { event: eventResult.rows[0], attendees: attendeesResult.rows },
      });
  } catch (err) {
    return next(err);
  }
}

module.exports = { summary, eventSummary, eventAttendance };
