const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});

async function sendOtpEmail(toEmail, otp) {
  await transporter.sendMail({
    from: `"Paksu Attendance" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: "Your password reset code",
    text: `Your OTP code is ${otp}. It expires in 15 minutes.`,
  });
}

module.exports = { sendOtpEmail };
