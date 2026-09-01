const pool = require("../config/db");
const { logActivity } = require("./activityLog.service");

async function processCheckin(userId) {
  // Find today's events (is_active, not deleted), ordered soonest first.
  const eventsResult = await pool.query(
    `SELECT id, name, location, event_datetime, checkin_open_minutes, checkin_close_minutes
   FROM events
   WHERE deleted_at IS NULL
     AND event_datetime::date = CURRENT_DATE
     AND (
       (auto_activate = true AND now() BETWEEN event_datetime - interval '3 hours' AND event_datetime + interval '3 hours')
       OR (auto_activate = false AND is_active = true)
     )
   ORDER BY auto_activate ASC, event_datetime ASC`,
  );

  const now = new Date();

  for (const event of eventsResult.rows) {
    const eventTime = new Date(event.event_datetime);
    const windowStart = new Date(
      eventTime.getTime() - event.checkin_open_minutes * 60000,
    );
    const windowEnd = new Date(
      eventTime.getTime() + event.checkin_close_minutes * 60000,
    );

    if (now < windowStart) {
      // This event hasn't opened yet — too early.
      return {
        status: "too_early",
        event: publicEvent(event),
        opens_at: windowStart.toISOString(),
      };
    }

    if (now >= windowStart && now <= windowEnd) {
      // We're inside this event's check-in window.
      const existing = await pool.query(
        "SELECT checked_in_at FROM attendance WHERE user_id = $1 AND event_id = $2",
        [userId, event.id],
      );

      if (existing.rows.length > 0) {
        return {
          status: "already_checked_in",
          event: publicEvent(event),
          checked_in_at: existing.rows[0].checked_in_at,
        };
      }

      const inserted = await pool.query(
        `INSERT INTO attendance (user_id, event_id) VALUES ($1, $2) RETURNING checked_in_at`,
        [userId, event.id],
      );

      await logActivity({
        actorType: "user",
        actorId: userId,
        action: "check_in",
        targetType: "event",
        targetId: event.id,
        targetLabel: event.name,
      });

      return {
        status: "success",
        event: publicEvent(event),
        checked_in_at: inserted.rows[0].checked_in_at,
      };
    }

    if (now > windowEnd) {
      // This event's window already closed — too late (unless a later event today still applies).
      return {
        status: "too_late",
        event: publicEvent(event),
        closed_at: windowEnd.toISOString(),
      };
    }
  }

  // No events today at all.
  return { status: "no_active_event" };
}

function publicEvent(event) {
  return { id: event.id, name: event.name, location: event.location };
}

module.exports = { processCheckin };
