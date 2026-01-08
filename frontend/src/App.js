import { auth } from "./firebase";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from "firebase/auth";

import { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";
import { db } from "./firebase";
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  orderBy   // ✅ ADD THIS (make sure it is added only once)
} from "firebase/firestore";


function LocationPicker({ setCoords }) {
  useMapEvents({
    click(e) {
      setCoords({
        lat: e.latlng.lat,
        lng: e.latlng.lng,
      });
    },
  });
  return null;
}

export default function App() {
  const [page, setPage] = useState(1);

  const [problem, setProblem] = useState("");
 const [city, setCity] = useState("");
  const [aiData, setAiData] = useState(null);
  const [loading, setLoading] = useState(false);

  const [coords, setCoords] = useState(null);
  const [detailedLocation, setDetailedLocation] = useState("");
  const [image, setImage] = useState(null);
  const [mailBody, setMailBody] = useState("");

  const [user, setUser] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  
  const [authMode, setAuthMode] = useState("login");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);

  const [grievances, setGrievances] = useState([]);
  const [allGrievances, setAllGrievances] = useState([]);

  const ADMIN_EMAILS = [""];

  const [isAdmin, setIsAdmin] = useState(false);


 useEffect(() => {
  const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
    setUser(currentUser);
    if (currentUser) {
      setPage(0); // ✅ Go to dashboard after login
    }

    if (currentUser && currentUser.email === "admin@grievancenet.com") {
      setIsAdmin(true);
    } else {
      setIsAdmin(false);
    }
  });

  return () => unsubscribe();
}, []);

  useEffect(() => {
  if (!user) return;

  const q = query(
    collection(db, "grievances"),
    where("userId", "==", user.uid)
  );

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const list = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    setGrievances(list);
  });
 return () => unsubscribe();
}, [user]);


 useEffect(() => {
  if (!isAdmin) return;

  const q = query(
    collection(db, "grievances"),
    orderBy("createdAt", "desc") // latest first
  );

  const unsubscribe = onSnapshot(q, (snapshot) => {
    setAllGrievances(
      snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
    );
  });

  return () => unsubscribe();
}, [isAdmin]);

   const login = async () => {
  if (!email || !password) {
    setAuthError("Email and password are required");
    return;
  }

  if (!email.includes("@")) {
    setAuthError("Please enter a valid email address");
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email.trim(), password);
    setAuthError("");
  } catch (err) {
    setAuthError(err.message);
  }
};


const updateStatus = async (id, newStatus) => {
  try {
    await updateDoc(doc(db, "grievances", id), {
      status: newStatus,
    });
  } catch (err) {
    alert("Failed to update status");
  }
};


const register = async () => {
  if (!email || !password || !name) {
    setAuthError("All fields are required");
    return;
  }

  if (!email.includes("@")) {
    setAuthError("Please enter a valid email");
    return;
  }

  if (password.length < 6) {
    setAuthError("Password must be at least 6 characters");
    return;
  }

  try {
    await createUserWithEmailAndPassword(auth, email.trim(), password);

    await signOut(auth); // force logout
    
    // ✅ CLEAR INPUT FIELDS
    setEmail("");
    setPassword("");
    setName("");
    setPhone("");

    // ✅ SWITCH TO LOGIN MODE
    setAuthMode("login");
    setAuthError("✅ Registered successfully! Please login.");
  
  } catch (err) {
    setAuthError(err.message);
  }
};


  const logout = async () => {
    await signOut(auth);
    setPage(1);
    setProblem("");
    setAiData(null);
    setMailBody("");
    setCoords(null);
    setDetailedLocation("");
  };


  // ---------------- AI CALL ----------------
  const generateMail = async () => {
    if (!problem.trim()) {
      alert("Please describe your problem first");
      return;
    }

    setLoading(true);
    setAiData(null);

    try {
      const res = await fetch("http://localhost:5000/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: problem, location: city }),
      });

      const data = await res.json();
      setAiData(data);
      setMailBody(data.draftedMail || "");
    } catch {
      alert("Backend not reachable");
    }

    setLoading(false);
  };

  // ---------------- LOCATION ----------------
  const getCurrentLocation = () => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        }),
      () => alert("Location permission denied")
    );
  };

  // ---------------- SEND EMAIL ----------------
 const sendEmail = async () => {
  try {
    const formData = new FormData();
    formData.append("body", mailBody);
    formData.append("detailed_location", detailedLocation);
    formData.append("latitude", coords?.lat || "");
    formData.append("longitude", coords?.lng || "");
    if (image) formData.append("image", image);

    const res = await fetch("http://localhost:5000/send-email", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();

    // ✅ CHECK HTTP STATUS, NOT data.status
    if (res.ok) {
      // ✅ SAVE TO FIRESTORE
      await addDoc(collection(db, "grievances"), {
        userId: user.uid,
        problem: problem,
        city: city,
        mailBody: mailBody,
        detailedLocation: detailedLocation,
        latitude: coords?.lat || "",
        longitude: coords?.lng || "",
        status: "Pending",
        createdAt: serverTimestamp(),
      });

      alert("✅ Grievance submitted successfully");
      setPage(3); // Go to Status page
    } else {
      alert(data.error || "❌ Mail failed");
    }
  } catch (err) {
    console.error(err);
    alert("❌ Error submitting grievance");
  }
};




function AdminDashboard({ grievances }) {
  const updateStatus = async (id, newStatus) => {
    await updateDoc(doc(db, "grievances", id), {
      status: newStatus,
    });
    alert("✅ Status updated successfully");
  };

  const getStatusIcon = (status) => {
    switch(status) {
      case "Resolved": return "✅";
      case "In Progress": return "⚙️";
      case "Rejected": return "❌";
      default: return "⏳";
    }
  };

  return (
    <div className="card">
      <h2>🛠 Admin Grievance Panel</h2>
      <p className="muted" style={{ marginBottom: 20 }}>Manage and track all grievances submitted by users</p>

      {grievances.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          <p style={{ fontSize: '3rem', marginBottom: 10 }}>📭</p>
          <p className="muted">No grievances submitted yet</p>
        </div>
      )}

      {grievances.map((g) => (
        <div key={g.id} className="grievance-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 8 }}>
                <span style={{ marginRight: 8 }}>📋</span>
                {g.problem}
              </p>
            </div>
            <span style={{ fontSize: '1.5rem', marginLeft: 12 }}>
              {getStatusIcon(g.status)}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 12 }}>
            <p><strong>🏙 City:</strong> {g.city}</p>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              <strong>📅 Submitted:</strong>{" "}
              {g.createdAt?.toDate
                ? g.createdAt.toDate().toLocaleString('en-US', { 
                    dateStyle: 'medium', 
                    timeStyle: 'short' 
                  })
                : "Just now"}
            </p>
          </div>

          {g.latitude && g.longitude && (
            <p style={{ fontSize: '0.9rem' }}>
              <strong>📍 Coordinates:</strong> {parseFloat(g.latitude).toFixed(4)}, {parseFloat(g.longitude).toFixed(4)}
            </p>
          )}

          {g.detailedLocation && (
            <p style={{ fontSize: '0.9rem' }}>
              <strong>🏷 Landmark:</strong> {g.detailedLocation}
            </p>
          )}

          <div className="status-row" style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-color)' }}>
            <span className="status-label">Status:</span>
            <select
              className={`status-select ${
                g.status === "Resolved"
                  ? "status-resolved"
                  : g.status === "In Progress"
                  ? "status-processing"
                  : g.status === "Rejected"
                  ? "status-rejected"
                  : "status-pending"
              }`}
              value={g.status}
              onChange={(e) => updateStatus(g.id, e.target.value)}
            >
              <option value="Pending">⏳ Pending</option>
              <option value="In Progress">⚙️ In Progress</option>
              <option value="Resolved">✅ Resolved</option>
              <option value="Rejected">❌ Rejected</option>
            </select>
          </div>
        </div>
      ))}
    </div>
  );
}


   // ================= LOGIN UI =================
  if (!user) {
  return (
    <div className="auth-container">
      <div className="auth-card">
        {authMode === "login" && (
          <>
            <h2>🔐 Welcome Back</h2>
            <p className="muted text-center mb-lg">Sign in to manage your grievances</p>

            <input
              className="input"
              type="email"
              placeholder="Email Address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && login()}
            />

            <br /><br />

            <div style={{ position: "relative" }}>
              <input
                className="input"
                type={showLoginPassword ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && login()}
              />

              <span
                className="password-toggle"
                onClick={() => setShowLoginPassword(!showLoginPassword)}
              >
                {showLoginPassword ? "🙈" : "👁️"}
              </span>
            </div>


            <br /><br />

            <button className="btn primary" onClick={login} style={{ width: "100%" }}>
              <span>🚀 Login</span>
            </button>

            <p className="text-center mt-md">
              New user?{" "}
              <span className="auth-link" onClick={() => setAuthMode("register")}>
                Register here
              </span>
            </p>
          </>
        )}

        {authMode === "register" && (
          <>
            <h2>📝 Create Account</h2>
            <p className="muted text-center mb-lg">Join us to report and track grievances</p>

            <input
              className="input"
              placeholder="Full Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <br /><br />

            <input
              className="input"
              type="email"
              placeholder="Email Address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <br /><br />

            <input
              className="input"
              placeholder="Phone Number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />

            <br /><br />

            <div style={{ position: "relative" }}>
              <input
                className="input"
                type={showRegisterPassword ? "text" : "password"}
                placeholder="Password (min 6 chars)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && register()}
              />

              <span
                className="password-toggle"
                onClick={() => setShowRegisterPassword(!showRegisterPassword)}
              >
                {showRegisterPassword ? "🙈" : "👁️"}
              </span>
            </div>

            <br /><br />

            <button className="btn primary" onClick={register} style={{ width: "100%" }}>
              <span>✨ Create Account</span>
            </button>

            <p className="text-center mt-md">
              Already registered?{" "}
              <span className="auth-link" onClick={() => setAuthMode("login")}>
                Login
              </span>
            </p>
          </>
        )}

        {authError && (
          <div className={`auth-error ${authError.includes("successfully") ? "success" : "error"}`}>
            {authError}
          </div>
        )}
      </div>
    </div>
  );
}


// ================= ADMIN VIEW =================
if (isAdmin) {
  return (
    <div className="app-container">
      <header className="hero">
        <div className="hero-inner">
          <h1>🛡 Admin Control Panel</h1>
          <p className="tagline">Monitor and manage all submitted grievances</p>
        </div>
        <button className="btn ghost" onClick={logout}>
          <span>🚪 Logout</span>
        </button>
      </header>

      <AdminDashboard grievances={allGrievances} />
    </div>
  );
}


  // ================= MAIN APP =================
  return (
    <div className="app-container">
      <header className="hero">
        <div className="hero-inner">
          <h1>📢 AI Grievance Assistant</h1>
          <p className="tagline">Report civic issues in plain language — AI helps you draft and submit clear grievance requests efficiently.</p>
        </div>
        <button className="btn ghost" onClick={logout}>
          <span>🚪 Logout</span>
        </button>
      </header>

      <main className="content">
        <div className="card">
          {page === 0 && (
            <div className="form">
              <h2>👋 Welcome to GrievanceNet</h2>
              <p className="muted" style={{ fontSize: '1rem', lineHeight: 1.6, marginTop: 12 }}>
                Your voice matters. Track your submitted complaints or raise a new grievance to make your community better.
              </p>

              <div className="actions" style={{ marginTop: 30 }}>
                <button className="btn primary" onClick={() => setPage(3)} style={{ flex: 1 }}>
                  <span>📊 View My Complaints</span>
                </button>

                <button className="btn secondary" onClick={() => setPage(1)} style={{ flex: 1 }}>
                  <span>➕ Raise New Complaint</span>
                </button>
              </div>

              <div style={{ marginTop: 30, padding: 20, background: 'rgba(102, 126, 234, 0.1)', borderRadius: 'var(--border-radius-sm)', border: '1px solid rgba(102, 126, 234, 0.2)' }}>
                <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                  💡 <strong>Tip:</strong> Use our AI-powered assistant to automatically draft professional grievance emails based on your description.
                </p>
              </div>
            </div>
          )}


          {page === 1 && (
            <div className="form">
              <label className="label">Describe your problem</label>
              <textarea
                rows="5"
                className="input textarea"
                value={problem}
                onChange={(e) => setProblem(e.target.value)}
                placeholder="E.g., Streetlight not working near my house, garbage piling up..."
              />

              <label className="label">City / Area</label>
              <input
                type="text"
                className="input"
                placeholder="Enter your city or area (e.g., Benz Circle, MG Road)"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />


              <div className="actions">
                <button className="btn primary" onClick={generateMail} disabled={loading}>
                  <span>{loading ? "🔄 Analyzing…" : "🤖 Analyze with Gemini AI"}</span>
                </button>

                {aiData && (
                  <button className="btn secondary" onClick={() => setPage(2)}>
                    <span>Next: Add Location →</span>
                  </button>
                )}
              </div>

              {aiData && (
                <div className="ai-preview">
                  <h3>✨ AI-Generated Draft</h3>
                  <p className="muted" style={{ marginBottom: 10 }}>Review the auto-generated grievance mail below</p>
                  <textarea className="input textarea" rows={8} value={mailBody} readOnly />
                  
                  {/* AI Advice Section */}
                  {aiData.advice && (
                    <div style={{ 
                      marginTop: 20, 
                      padding: '20px 24px', 
                      background: 'linear-gradient(135deg, rgba(67, 233, 123, 0.15), rgba(79, 172, 254, 0.1))',
                      border: '2px solid rgba(67, 233, 123, 0.4)',
                      borderRadius: 'var(--border-radius-sm)',
                      boxShadow: '0 0 30px rgba(67, 233, 123, 0.3), 0 8px 20px rgba(0, 0, 0, 0.2)'
                    }}>
                      <h4 style={{ 
                        margin: '0 0 16px 0', 
                        fontSize: '1.2rem',
                        fontWeight: 700,
                        color: '#43e97b',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        textShadow: '0 2px 10px rgba(67, 233, 123, 0.3)'
                      }}>
                        💡 Recommended Action Steps
                      </h4>
                      <div style={{ 
                        color: 'var(--text-secondary)',
                        lineHeight: 1.8,
                        fontSize: '0.95rem',
                        whiteSpace: 'pre-line'
                      }}>
                        {aiData.advice.split('\\n').map((line, index) => (
                          <div key={index} style={{ 
                            marginBottom: line.trim().match(/^\\d+\\./) ? '10px' : '4px',
                            paddingLeft: line.trim().match(/^\\d+\\./) ? '0' : '0',
                            color: line.trim().match(/^\\d+\\./) ? 'var(--text-primary)' : 'var(--text-secondary)',
                            fontWeight: line.trim().match(/^\\d+\\./) ? '600' : '400'
                          }}>
                            {line}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Department Info */}
                  {aiData.department && (
                    <div style={{ 
                      marginTop: 16, 
                      padding: '12px 16px',
                      background: 'rgba(102, 126, 234, 0.1)',
                      borderLeft: '4px solid #667eea',
                      borderRadius: '8px'
                    }}>
                      <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                        <strong style={{ color: 'var(--text-primary)' }}>📋 Department:</strong> {aiData.department}
                      </p>
                    </div>
                  )}

                  {/* Summary */}
                  {aiData.summary && (
                    <div style={{ 
                      marginTop: 12, 
                      padding: '12px 16px',
                      background: 'rgba(240, 147, 251, 0.1)',
                      borderLeft: '4px solid #f093fb',
                      borderRadius: '8px'
                    }}>
                      <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                        <strong style={{ color: 'var(--text-primary)' }}>📝 Summary:</strong> {aiData.summary}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {page === 2 && (
            <div className="form">
              <h2>📍 Location Details</h2>
              <p className="muted mb-md">Pin your exact location for faster resolution</p>

              <div className="row space-between">
                <button className="btn secondary" onClick={getCurrentLocation}>
                  <span>📍 Use Current Location</span>
                </button>
                <button className="btn ghost" onClick={() => setPage(1)}>
                  <span>← Back</span>
                </button>
              </div>

              {coords && (
                <p className="muted">Lat: {coords.lat} | Lng: {coords.lng}</p>
              )}

              <div className="map-wrap">
                <MapContainer
                  center={[16.5062, 80.648]}
                  zoom={13}
                  className="map"
                >
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  <LocationPicker setCoords={setCoords} />
                  {coords && <Marker position={[coords.lat, coords.lng]} />}
                </MapContainer>
              </div>

              <label className="label">Detailed location</label>
              <textarea
                rows="2"
                className="input textarea"
                placeholder="E.g., Near ABC Hospital, 2nd cross street"
                value={detailedLocation}
                onChange={(e) => setDetailedLocation(e.target.value)}
              />

              <label className="label">Mail body</label>
              <textarea
                rows="6"
                className="input textarea"
                value={mailBody}
                onChange={(e) => setMailBody(e.target.value)}
              />

              <label className="label">Attach photo (optional)</label>
              <input className="input file" type="file" onChange={(e) => setImage(e.target.files[0])} />

              <div className="actions">
                <button className="btn primary" onClick={sendEmail} style={{ width: '100%' }}>
                  <span>📤 Submit Grievance</span>
                </button>
              </div>
            </div>
          )}


          {page === 3 && (
            <div className="form">
              <h2>📊 My Grievances</h2>
              <p className="muted mb-lg">Track the status of all your submitted grievances</p>

              {grievances.length === 0 && (
                <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--bg-card)', borderRadius: 'var(--border-radius-sm)', border: '1px dashed var(--border-color)' }}>
                  <p style={{ fontSize: '4rem', marginBottom: 16 }}>📝</p>
                  <p className="muted" style={{ fontSize: '1.1rem' }}>No grievances submitted yet</p>
                  <button className="btn primary" onClick={() => setPage(1)} style={{ marginTop: 20 }}>
                    <span>➕ Submit Your First Grievance</span>
                  </button>
                </div>
              )}

              {grievances.map((g) => (
                <div key={g.id} className="grievance-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 8 }}>
                        <strong>📋 Issue:</strong> {g.problem}
                      </p>
                      <p style={{ marginBottom: 4 }}><strong>🏙 City:</strong> {g.city}</p>
                      <p style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
                        <strong>Status:</strong>
                        <span
                          style={{
                            padding: '6px 16px',
                            borderRadius: '20px',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            background:
                              g.status === "Resolved"
                                ? "rgba(34, 197, 94, 0.2)"
                                : g.status === "In Progress"
                                ? "rgba(245, 158, 11, 0.2)"
                                : g.status === "Rejected"
                                ? "rgba(107, 114, 128, 0.2)"
                                : "rgba(239, 68, 68, 0.2)",
                            color:
                              g.status === "Resolved"
                                ? "#22c55e"
                                : g.status === "In Progress"
                                ? "#f59e0b"
                                : g.status === "Rejected"
                                ? "#6b7280"
                                : "#ef4444",
                          }}
                        >
                          {g.status === "Resolved" && "✅"}
                          {g.status === "In Progress" && "⚙️"}
                          {g.status === "Rejected" && "❌"}
                          {g.status === "Pending" && "⏳"}
                          {" "}{g.status}
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
              ))}

              {grievances.length > 0 && (
                <button className="btn ghost" onClick={() => setPage(0)} style={{ marginTop: 20, width: '100%' }}>
                  <span>← Back to Dashboard</span>
                </button>
              )}
            </div>
          )}

        </div>

        <aside className="sidebar">
          <div className="card small">
            <h4>💡 Quick Tips</h4>
            <ul style={{ marginTop: 12 }}>
              <li>✓ Be clear and concise in your description</li>
              <li>✓ Include exact location details</li>
              <li>✓ Attach photos for faster verification</li>
              <li>✓ Use the map to pinpoint the spot</li>
            </ul>
          </div>

          <div className="card small">
            <h4>🤖 AI Assistant</h4>
            <p className="muted">Powered by Google Gemini AI to help you draft professional grievance emails automatically.</p>
          </div>

          <div className="card small">
            <h4>🔒 Privacy</h4>
            <p className="muted">Your data is secure. Nothing is sent without your explicit action.</p>
          </div>
        </aside>
      </main>

      

      <div className={`loading-overlay ${loading ? 'visible' : ''}`}>Analyzing…</div>
    </div>
  );
}
