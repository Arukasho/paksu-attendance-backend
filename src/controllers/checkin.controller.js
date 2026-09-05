const { processCheckin } = require("../services/checkin.service");

async function checkin(req, res, next) {
  const { qr_payload } = req.body;

  if (
    qr_payload !==
    "https://docs.google.com/forms/d/e/1FAIpQLSdaNIkOYTvyNW84dOGHU6UiG8X3tzfOlKAMO4TnJM3MTGcywQ/viewform?usp=header"
  ) {
    return res.status(400).json({
      error: true,
      code: "invalid_qr_payload",
      message: "Unrecognized QR code.",
    });
  }

  try {
    const result = await processCheckin(req.user.id);
    return res.status(200).json({ data: result });
  } catch (err) {
    return next(err);
  }
}

async function markFormFilled(req, res, next) {
  const { eventId } = req.params;

  try {
    const result = await pool.query(
      `UPDATE attendance
       SET already_fill_form = true
       WHERE user_id = $1
         AND event_id = $2
       RETURNING user_id, event_id, already_fill_form`,
      [req.user.id, eventId],
    );

    console.log("markFormFilled:", {
      userId: req.user.id,
      eventId,
      updatedRows: result.rowCount,
      row: result.rows[0],
    });

    if (result.rowCount === 0) {
      return res.status(404).json({
        error: true,
        code: "attendance_not_found",
        message: "Attendance record not found.",
      });
    }

    return res.status(200).json({
      data: {
        status: "success",
        already_fill_form: result.rows[0].already_fill_form,
      },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { checkin, markFormFilled };
