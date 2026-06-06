import { useState, useEffect } from "react";
import { SERVER } from "./config";

export default function App() {
  const [file, setFile] = useState(null);
  const [videos, setVideos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [ip, setIp] = useState("");

  useEffect(() => {
    fetchIp();
    fetchVideos();
  }, []);

  const fetchIp = async () => {
    try {
      const res = await fetch(`${SERVER}/ip`);
      const data = await res.text();
      setIp(data);
    } catch (err) {
      console.error("Failed to fetch IP", err);
    }
  };

  const fetchVideos = async () => {
    try {
      const res = await fetch(`${SERVER}/api/videos`);
      const data = await res.json();
      setVideos(data);
    } catch (err) {
      console.error("Failed to fetch videos", err);
    }
  };

  const upload = async () => {
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      await fetch(`${SERVER}/upload`, {
        method: "POST",
        body: formData,
      });
      fetchVideos();
      setFile(null);
      // Reset input file element
      const fileInput = document.getElementById("video-upload");
      if (fileInput) fileInput.value = "";
    } catch (err) {
      console.error("Upload failed", err);
    } finally {
      setUploading(false);
    }
  };

  const castVideo = async (filename) => {
    try {
      await fetch(`${SERVER}/api/cast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename }),
      });
    } catch (err) {
      console.error("Failed to cast", err);
    }
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>
          Welcome to Abbey's Home Cast: Inspiration for future casts
        </h1>
        <p style={styles.subtitle}>Upload and stream instantly to your TV.</p>
        <p>
          Open this on your TV:
          <br />
          <strong>http://{ip}:3000/receiver</strong>
        </p>
      </header>

      <section style={styles.uploadSection}>
        <div style={styles.uploadCard}>
          <h2 style={styles.cardTitle}>Upload a New Video</h2>
          <input
            id="video-upload"
            type="file"
            accept="video/*"
            onChange={(e) => setFile(e.target.files[0])}
            style={styles.fileInput}
          />
          <button
            onClick={upload}
            style={{
              ...styles.primaryButton,
              opacity: !file || uploading ? 0.5 : 1,
            }}
            disabled={!file || uploading}
          >
            {uploading ? "Uploading..." : "Upload & Play"}
          </button>
        </div>
      </section>

      <section style={styles.listSection}>
        <h2 style={styles.sectionTitle}>Your Videos</h2>
        <div style={styles.grid}>
          {videos.map((video) => (
            <div key={video} style={styles.propertyCard}>
              <div style={styles.cardPhoto}>
                <svg
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
              </div>
              <div style={styles.cardMeta}>
                <h3 style={styles.cardTitleText} title={video}>
                  {video}
                </h3>
                <p style={styles.cardSubtext}>Video file</p>
                <button
                  onClick={() => castVideo(video)}
                  style={styles.pillButton}
                >
                  Cast to TV
                </button>
              </div>
            </div>
          ))}
          {videos.length === 0 && (
            <p style={styles.mutedText}>
              No videos uploaded yet. Add some to get started!
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

const styles = {
  container: {
    backgroundColor: "#ffffff",
    minHeight: "100vh",
    fontFamily:
      '"Airbnb Cereal VF", Circular, -apple-system, system-ui, Roboto, sans-serif',
    color: "#222222",
    padding: "0 24px",
    maxWidth: "1080px",
    margin: "0 auto",
  },
  header: {
    paddingTop: "64px",
    paddingBottom: "32px",
  },
  title: {
    fontSize: "28px",
    fontWeight: 700,
    margin: "0 0 8px 0",
    color: "#222222",
    letterSpacing: "-0.02em",
  },
  subtitle: {
    fontSize: "16px",
    fontWeight: 400,
    color: "#6a6a6a",
    margin: 0,
  },
  uploadSection: {
    marginBottom: "48px",
  },
  uploadCard: {
    border: "1px solid #dddddd",
    borderRadius: "14px",
    padding: "24px",
    backgroundColor: "#ffffff",
    boxShadow:
      "rgba(0, 0, 0, 0.02) 0 0 0 1px, rgba(0, 0, 0, 0.04) 0 2px 6px 0, rgba(0, 0, 0, 0.1) 0 4px 8px 0",
  },
  cardTitle: {
    fontSize: "21px",
    fontWeight: 700,
    margin: "0 0 16px 0",
    letterSpacing: "-0.01em",
  },
  fileInput: {
    display: "block",
    marginBottom: "16px",
    fontSize: "16px",
    color: "#222222",
  },
  primaryButton: {
    backgroundColor: "#ff385c",
    color: "#ffffff",
    border: "none",
    borderRadius: "8px",
    padding: "14px 24px",
    fontSize: "16px",
    fontWeight: 500,
    cursor: "pointer",
    width: "100%",
    transition: "background-color 0.2s",
  },
  listSection: {
    paddingBottom: "64px",
  },
  sectionTitle: {
    fontSize: "21px",
    fontWeight: 700,
    margin: "0 0 24px 0",
    letterSpacing: "-0.01em",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
    gap: "24px",
  },
  propertyCard: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  cardPhoto: {
    width: "100%",
    aspectRatio: "4 / 3",
    backgroundColor: "#222222",
    borderRadius: "14px",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.1)",
  },
  cardMeta: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  cardTitleText: {
    fontSize: "16px",
    fontWeight: 600,
    margin: 0,
    color: "#222222",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  cardSubtext: {
    fontSize: "14px",
    color: "#6a6a6a",
    margin: 0,
  },
  pillButton: {
    backgroundColor: "#ffffff",
    color: "#222222",
    border: "1px solid #222222",
    borderRadius: "9999px",
    padding: "8px 16px",
    fontSize: "14px",
    fontWeight: 500,
    cursor: "pointer",
    marginTop: "8px",
    alignSelf: "flex-start",
    transition: "all 0.2s",
  },
  mutedText: {
    color: "#6a6a6a",
    fontSize: "16px",
  },
};
