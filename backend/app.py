from flask import Flask, request, jsonify
from flask_cors import CORS
import os, json, smtplib
from email.message import EmailMessage
from dotenv import load_dotenv
import google.generativeai as genai

# ---------------- SETUP ----------------
load_dotenv()

app = Flask(__name__)
CORS(app)

# ---------------- GEMINI CONFIG ----------------
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
GEMINI_MODEL = "models/gemini-flash-latest"

# ---------------- EMAIL CONFIG ----------------
SENDER_EMAIL = os.getenv("SENDER_EMAIL")
SENDER_PASSWORD = os.getenv("SENDER_PASSWORD")

# Same email for all departments (hackathon demo)
AUTHORITY_EMAIL = "grievancenet@gmail.com"

# ---------------- EMAIL HELPER ----------------
def send_email(to_email, subject, body, attachments=None):
    msg = EmailMessage()
    msg["From"] = SENDER_EMAIL
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.set_content(body)

    if attachments:
        for file in attachments:
            if file and file.filename:
                msg.add_attachment(
                    file.read(),
                    maintype="application",
                    subtype="octet-stream",
                    filename=file.filename
                )

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(SENDER_EMAIL, SENDER_PASSWORD)
        server.send_message(msg)

# ---------------- AI ANALYSIS ----------------
@app.route("/chat", methods=["POST"])
def chat():
    data = request.get_json()
    user_message = data.get("message", "")
    city = data.get("location", "")

    prompt = f"""You are a civic grievance assistant. Analyze the complaint and respond with ONLY a valid JSON object. 
Do not include any markdown, code blocks, or explanations outside the JSON.

Return this exact JSON structure:
{{
  "department": "one of: Municipal Corporation / Electricity Board / Water Department / Police / Health Department / Public Works / Sanitation",
  "summary": "one sentence summary of the issue",
  "advice": "Step-by-step recommendations:\\n1. First immediate action\\n2. Who to contact (with number if known)\\n3. Expected timeline\\n4. What documentation to keep\\n5. Escalation steps if not resolved",
  "draftedMail": "Professional email with proper greeting, clear subject line, detailed complaint, location, and formal closing"
}}

USER COMPLAINT:
{user_message}

LOCATION:
{city}

Provide specific, actionable advice. Include helpline numbers if relevant (like 100 for police, 108 for ambulance, 1916 for complaints).
Return ONLY the JSON object, nothing else."""

    try:
        model = genai.GenerativeModel(
            GEMINI_MODEL,
            generation_config={
                "temperature": 0.7,
                "top_p": 0.8,
                "top_k": 40,
            }
        )
        response = model.generate_content(prompt)

        raw = response.text.strip()
        
        # Remove markdown code blocks if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        
        # Clean up the response
        raw = raw.strip()
        
        # Find JSON boundaries
        start = raw.find("{")
        end = raw.rfind("}") + 1
        
        if start == -1 or end == 0:
            raise ValueError("No JSON found in response")
        
        json_str = raw[start:end]
        ai_json = json.loads(json_str)
        
        # Validate required fields
        required_fields = ["department", "summary", "advice", "draftedMail"]
        for field in required_fields:
            if field not in ai_json or not ai_json[field]:
                raise ValueError(f"Missing or empty field: {field}")

        ai_json["aiUsed"] = True
        ai_json["mailTo"] = AUTHORITY_EMAIL
        
        print("✅ AI Response parsed successfully")
        return jsonify(ai_json)

    except Exception as e:
        print(f"❌ AI Error: {str(e)}")
        print(f"Raw response: {response.text if 'response' in locals() else 'No response'}")
        
        # -------- INTELLIGENT FALLBACK --------
        # Determine department based on keywords
        msg_lower = user_message.lower()
        
        if any(word in msg_lower for word in ['light', 'electricity', 'power', 'voltage', 'transformer']):
            dept = "Electricity Board"
            advice_steps = """1. Call electricity board helpline immediately for power outages
2. Note down your consumer number and report the issue
3. Take photos if there's visible damage to wires/poles
4. Expected resolution: 24-48 hours for routine issues
5. Escalate to senior engineer if not resolved in 3 days"""
            
        elif any(word in msg_lower for word in ['water', 'pipe', 'leak', 'drainage', 'sewage']):
            dept = "Water Department"
            advice_steps = """1. Report to water department helpline or municipal office
2. Note the exact location and time when issue started
3. Take photos/videos of the problem area
4. Expected resolution: 2-3 days for pipe repairs
5. Follow up with local corporator if no response"""
            
        elif any(word in msg_lower for word in ['garbage', 'waste', 'trash', 'clean', 'sanitation']):
            dept = "Sanitation Department"
            advice_steps = """1. Contact municipal sanitation department
2. Note the ward number and exact location
3. Keep record of complaint number
4. Expected resolution: 1-2 days for garbage collection
5. Escalate to municipal commissioner if recurring issue"""
            
        elif any(word in msg_lower for word in ['road', 'pothole', 'street', 'traffic', 'signal']):
            dept = "Public Works Department"
            advice_steps = """1. Report to PWD office or municipal roads department
2. Provide exact location with landmarks
3. Take clear photos showing the issue
4. Expected resolution: 1-2 weeks for minor repairs
5. Mark the area if it's a safety hazard"""
            
        elif any(word in msg_lower for word in ['police', 'crime', 'theft', 'safety', 'violence']):
            dept = "Police Department"
            advice_steps = """1. Call 100 immediately for emergencies
2. Visit nearest police station to file FIR if needed
3. Collect all evidence and witness details
4. Note down complaint/FIR number
5. Follow up with station in-charge for updates"""
            
        elif any(word in msg_lower for word in ['health', 'hospital', 'medical', 'disease', 'clinic']):
            dept = "Health Department"
            advice_steps = """1. Contact health department or call 108 for medical emergencies
2. Report to nearest government hospital
3. Document symptoms and affected persons
4. Expected response: Immediate for disease outbreaks
5. Contact district health officer for follow-up"""
        else:
            dept = "Municipal Corporation"
            advice_steps = """1. Contact your local municipal office or city helpline (1916)
2. Provide detailed description with exact location
3. Take photos/videos as proof
4. Note down complaint reference number
5. Follow up after 3-5 working days if no response"""

        fallback = {
            "department": dept,
            "summary": f"Civic issue reported regarding: {user_message[:100]}...",
            "advice": advice_steps,
            "draftedMail": f"""To,
The Concerned Authority
{dept}
{city}

Subject: Urgent Civic Grievance - {dept} Issue

Respected Sir/Madam,

I am writing to bring to your immediate attention a civic issue that requires urgent intervention.

Issue Details:
{user_message}

Location: {city}

This matter is causing significant inconvenience to residents in the area. I kindly request you to take necessary action at the earliest.

I would appreciate if you could:
1. Acknowledge receipt of this complaint
2. Provide a timeline for resolution
3. Assign a reference number for tracking

I look forward to your prompt response and action.

Thanking you,
Yours sincerely,
Concerned Citizen""",
            "aiUsed": False,
            "mailTo": AUTHORITY_EMAIL
        }
        return jsonify(fallback), 200

# ---------------- SEND EMAIL ----------------
@app.route("/send-email", methods=["POST"])
def send_mail_api():
    try:
        body = request.form.get("body", "").strip()
        detailed_location = request.form.get("detailed_location", "").strip()
        latitude = request.form.get("latitude", "").strip()
        longitude = request.form.get("longitude", "").strip()
        attachments = request.files.getlist("image")

        if not body:
            return jsonify({"error": "Mail body missing"}), 400

        # ✅ Google Maps clickable link
        maps_link = ""
        if latitude and longitude:
            maps_link = f"https://www.google.com/maps?q={latitude},{longitude}"

        full_body = f"""
CIVIC GRIEVANCE REPORT

📍 Detailed Location:
{detailed_location if detailed_location else "Not provided"}

🧭 Coordinates:
Latitude: {latitude if latitude else "N/A"}
Longitude: {longitude if longitude else "N/A"}

🗺️ Open in Google Maps:
{maps_link if maps_link else "Location link not available"}

📝 Complaint:
{body}

-- Sent via GrievanceNet (Gemini-powered)
"""

        send_email(
            AUTHORITY_EMAIL,
            "New Civic Grievance",
            full_body,
            attachments
        )

        return jsonify({"status": "Mail sent successfully"})

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ---------------- HEALTH CHECK ----------------
@app.route("/", methods=["GET"])
def home():
    return jsonify({"status": "GrievanceNet backend running"})

# ---------------- RUN ----------------
if __name__ == "__main__":
    app.run(debug=True)
