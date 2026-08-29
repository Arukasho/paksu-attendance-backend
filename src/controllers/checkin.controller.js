const { processCheckin } = require("../services/checkin.service");

async function checkin(req, res, next) {
  const { qr_payload } = req.body;

  if (qr_payload !== "ORG_ATTENDANCE_CHECKIN") {
    return res
      .status(400)
      .json({
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

module.exports = { checkin };
