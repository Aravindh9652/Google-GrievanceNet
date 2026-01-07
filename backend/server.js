const express = require("express");
const cors = require("cors");
const multer = require("multer");

const app = express();
const upload = multer();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Backend running");
});

app.post("/chat", (req, res) => {
  const { message, location } = req.body;

  res.json({
    draftedMail: `To,
The Concerned Authority

Subject: Civic Grievance

Respected Sir/Madam,

I would like to report that ${message} in ${location}.

Kindly take necessary action.

Thanking you.`
  });
});

app.post("/send-email", upload.any(), (req, res) => {
  res.json({ success: true });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
