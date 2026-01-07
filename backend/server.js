const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

app.post("/send-email", upload.any(), async (req, res) => {
  try {
    const { body, detailed_location, latitude, longitude } = req.body;

    await transporter.sendMail({
      from: `"GrievanceNet" <${process.env.MAIL_USER}>`,
      to: "admin@grievancenet.com", // or govt mail
      subject: "Civic Grievance Report",
      text: `
${body}

📍 Location:
${detailed_location}

Coordinates:
Lat: ${latitude}
Lng: ${longitude}
`,
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Mail failed" });
  }
});
