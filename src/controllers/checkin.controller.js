const pool = require("../config/db");
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
    await pool.query(
      "UPDATE attendance SET already_fill_form = true WHERE user_id = $1 AND event_id = $2",
      [req.user.id, eventId],
    );
    return res.status(200).json({ data: { status: "success" } });
  } catch (err) {
    return next(err);
  }
}

module.exports = { checkin, markFormFilled };
