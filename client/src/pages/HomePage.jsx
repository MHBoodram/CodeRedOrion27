import { useEffect, useRef, useState } from "react";
import girlLogo from "../../../Girl(2).svg";
import WeatherBadge from "../components/WeatherBadge.jsx";
import "./HomePage.css";

const navItems = ["Try-on", "Discover", "Saved", "History"];

const recommendations = [
  {
    name: "Soft Tailored Coat",
    brand: "Maison de Lune",
    price: "$238",
    style: "Warm neutrals",
    image:
      "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=900&q=80",
  },
  {
    name: "Leather Mini",
    brand: "Vanta Atelier",
    price: "$189",
    style: "Night out",
    image:
      "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=80",
  },
  {
    name: "Silk Statement Set",
    brand: "Veloura",
    price: "$210",
    style: "Fluid layers",
    image:
      "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=900&q=80",
  },
];

const savedLooks = [
  { name: "Cinnamon layers", time: "2h ago" },
  { name: "Weekend ease", time: "1d ago" },
  { name: "City minimal", time: "3d ago" },
];

const previousFits = [
  { name: "Velvet dusk", date: "Apr 24, 2026", vibe: "Late dinner glow" },
  { name: "Café neutral", date: "Apr 18, 2026", vibe: "Effortless layers" },
  { name: "Studio soft", date: "Apr 09, 2026", vibe: "Clean tailoring" },
  { name: "Rainy day edit", date: "Mar 31, 2026", vibe: "Warm and grounded" },
];

const similarStyles = [
  { name: "Warm tailoring", detail: "Soft structure · earthy tones", image: recommendations[0].image },
  { name: "Modern romantic", detail: "Fluid layers · muted accents", image: recommendations[2].image },
];

function getWeatherDescription(code) {
  if (code === 0) return "Clear skies";
  if ([1, 2].includes(code)) return "Partly cloudy";
  if (code === 3) return "Cloudy";
  if ([45, 48].includes(code)) return "Foggy";
  if ([51, 53, 55, 56, 57].includes(code)) return "Light drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Rain expected";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow expected";
  if ([95, 96, 99].includes(code)) return "Thunderstorms";
  return "Check local conditions";
}

export default function HomePage() {
  const [activeTab, setActiveTab] = useState("Camera");
  const [cameraAttempt, setCameraAttempt] = useState(0);
  const [cameraStatus, setCameraStatus] = useState("loading");
  const [cameraError, setCameraError] = useState("");
  const [cameraSwitchMessage, setCameraSwitchMessage] = useState("");
  const [capturedFit, setCapturedFit] = useState("");
  const videoRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const cameraDevicesRef = useRef([]);
  const cameraSessionRef = useRef(0);

  const isHistoryView = activeTab === "History";
  const isCameraView = activeTab === "Camera";

  useEffect(() => {
    if (!isCameraView) return undefined;

    let cancelled = false;
    let stream;
    const video = videoRef.current;
    cameraSessionRef.current += 1;

    async function getVideoInputs() {
      const devices = await navigator.mediaDevices.enumerateDevices();
      cameraDevicesRef.current = devices.filter((device) => device.kind === "videoinput");
      return cameraDevicesRef.current;
    }

    async function startCamera() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Camera access is not supported by this browser or connection.");
        }

        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } catch (initialError) {
          const devices = await getVideoInputs();
          if (devices.length === 0) throw initialError;

          let lastError = initialError;
          for (const device of devices) {
            try {
              stream = await navigator.mediaDevices.getUserMedia({
                video: { deviceId: { exact: device.deviceId } },
                audio: false,
              });
              break;
            } catch (error) {
              lastError = error;
            }
          }
          if (!stream) throw lastError;
        }

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        cameraStreamRef.current = stream;
        if (video) video.srcObject = stream;
        if (!cancelled) setCameraStatus("ready");
        try {
          await getVideoInputs();
        } catch {
          cameraDevicesRef.current = [];
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error
            ? error.message
            : "Unable to access the camera. Check your browser permissions and try again.";
          setCameraError(message);
          setCameraStatus("error");
        }
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      cameraSessionRef.current += 1;
      const activeStream = cameraStreamRef.current;
      activeStream?.getTracks().forEach((track) => track.stop());
      if (stream && stream !== activeStream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      cameraStreamRef.current = null;
      if (video) video.srcObject = null;
    };
  }, [isCameraView, cameraAttempt]);

  function openCameraPage() {
    setCameraError("");
    setCameraSwitchMessage("");
    setCameraStatus("loading");
    setCapturedFit("");
    setActiveTab("Camera");
  }

  async function switchCamera() {
    const currentStream = cameraStreamRef.current;
    const video = videoRef.current;
    const session = cameraSessionRef.current;
    if (!currentStream || !video || !navigator.mediaDevices?.getUserMedia) {
      setCameraSwitchMessage("Camera is not ready to switch yet.");
      return;
    }

    setCameraSwitchMessage("");
    const oldDeviceId = currentStream.getVideoTracks()[0]?.getSettings().deviceId;

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((device) => device.kind === "videoinput");
      cameraDevicesRef.current = videoInputs;
      if (videoInputs.length < 2) {
        setCameraSwitchMessage("Only one camera is available on this device.");
        return;
      }

      const currentIndex = videoInputs.findIndex((device) => device.deviceId === oldDeviceId);
      const nextDevices = videoInputs
        .map((_, index) => videoInputs[(currentIndex + index + 1) % videoInputs.length])
        .filter((device) => device.deviceId !== oldDeviceId);
      let lastError;

      for (const device of nextDevices) {
        let nextStream;
        try {
          nextStream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: { exact: device.deviceId } },
            audio: false,
          });
        } catch (error) {
          lastError = error;
          continue;
        }

        if (session !== cameraSessionRef.current) {
          nextStream.getTracks().forEach((track) => track.stop());
          return;
        }

        video.srcObject = nextStream;
        cameraStreamRef.current = nextStream;
        currentStream.getTracks().forEach((track) => track.stop());
        setCameraStatus("ready");
        return;
      }

      const reason = lastError instanceof Error ? ` ${lastError.message}` : "";
      setCameraSwitchMessage(`Could not open another camera. Your current camera is still active.${reason}`);
    } catch (error) {
      const reason = error instanceof Error ? ` ${error.message}` : "";
      setCameraSwitchMessage(`Could not check available cameras.${reason}`);
    }
  }

  function captureFit() {
    const video = videoRef.current;
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      setCameraError("The camera preview is not ready yet. Please wait a moment and try again.");
      setCameraStatus("error");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      setCameraError("Could not capture an image from the camera.");
      setCameraStatus("error");
      return;
    }

    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    setCapturedFit(canvas.toDataURL("image/jpeg", 0.88));
  }

  return (
    <div className="fashion-app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <img className="brand-logo" src={girlLogo} alt="Fit Check logo" />
          </div>
          <div className="brand-copy">
            <span>Fashion</span>
            <strong>Check</strong>
          </div>
        </div>

        <nav className="nav-menu" aria-label="Main navigation">
          {navItems.map((item) => (
            <button
              key={item}
              type="button"
              className={(item === activeTab || (item === "Try-on" && isCameraView)) ? "nav-item active" : "nav-item"}
              onClick={() => item === "Try-on" ? openCameraPage() : setActiveTab(item)}
            >
              {item}
            </button>
          ))}
        </nav>

        <div className="promo-card">
          <p>Season drop</p>
          <h3>Autumn Luxe</h3>
          <button type="button">View edit</button>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <label className="search-box" aria-label="Search fashion recommendations">
            <span aria-hidden="true">⌕</span>
            <input type="text" placeholder="Search looks, brands..." />
          </label>

          <div className="user-pill">
            <div className="avatar">AR</div>
            <div>
              <strong>Ariana</strong>
              <small>Premium</small>
            </div>
          </div>
          <button type="button" className="secondary-btn dashboard-switch" onClick={() => window.location.href = "/login"}>
            Back to login
          </button>
        </header>

        {!isHistoryView && !isCameraView ? (
          <>
            <section className="hero-panel">
              <div className="hero-copy">
                <p className="eyebrow">Curated for you</p>
                <h1>Dress for the mood, not the schedule.</h1>
                <p className="hero-text">
                  Build your day around soft structure, rich neutrals, and pieces that feel
                  like a quiet power move.
                </p>

                <div className="hero-actions">
                  <button type="button" className="primary-btn">
                    Start styling
                  </button>
                  <button type="button" className="secondary-btn">
                    My closet
                  </button>
                </div>
              </div>

              <div className="hero-visual">
                <div className="visual-card">
                  <div className="visual-image" aria-hidden="true" />
                  <div className="visual-meta">
                    <span>Soft drama</span>
                    <strong>Monochrome edit</strong>
                  </div>
                </div>
              </div>
            </section>

            <section className="content-grid">
              <div className="recommend-panel">
                <div className="section-header">
                  <div>
                    <p className="mini-label">Recommended now</p>
                    <h2>Trending looks</h2>
                  </div>
                  <button type="button" className="link-btn">
                    See all
                  </button>
                </div>

                <div className="recommend-grid">
                  {recommendations.map((item) => (
                    <article key={item.name} className="look-card">
                      <div
                        className="look-image"
                        style={{ backgroundImage: `url(${item.image})` }}
                        aria-label={item.name}
                      />
                      <div className="look-meta">
                        <div className="look-row">
                          <span>{item.brand}</span>
                          <strong>{item.price}</strong>
                        </div>
                        <h3>{item.name}</h3>
                        <p>{item.style}</p>
                      </div>
                    </article>
                  ))}
                </div>
              </div>

              <aside className="side-panel">
                <div className="quick-card">
                  <p className="mini-label">Style note</p>
                  <h3>Warm neutrals are winning this week.</h3>
                  <p>
                    Pair a rich brown base with soft lilac accents for a polished, low-effort
                    statement.
                  </p>
                </div>

                <div className="saved-card">
                  <div className="section-header compact">
                    <h3>Saved looks</h3>
                    <span>04</span>
                  </div>

                  <ul>
                    {savedLooks.map((look) => (
                      <li key={look.name}>
                        <span className="dot" aria-hidden="true" />
                        <div>
                          <strong>{look.name}</strong>
                          <small>{look.time}</small>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </aside>
            </section>
          </>
        ) : isHistoryView ? (
          <section className="history-panel">
            <div className="section-header history-header">
              <div>
                <p className="mini-label">Your timeline</p>
                <h2>Previous fits</h2>
              </div>
              <button type="button" className="link-btn">
                Export moodboard
              </button>
            </div>

            <div className="history-list">
              {previousFits.map((fit, index) => (
                <article key={fit.name} className="history-item">
                  <div
                    className="history-image"
                    style={{
                      backgroundImage: `url(https://images.unsplash.com/${[
                        "photo-1529139574466-a303027c1d8b",
                        "photo-1524504388940-b1c1722653e1",
                        "photo-1483985988355-763728e1935b",
                        "photo-1496747611176-843222e1e57c",
                      ][index]}?auto=format&fit=crop&w=900&q=80)`,
                    }}
                  />
                  <div className="history-copy">
                    <div className="history-topline">
                      <span>{fit.date}</span>
                      <span className="tag">Fit #{index + 1}</span>
                    </div>
                    <h3>{fit.name}</h3>
                    <p>{fit.vibe}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : (
          <section className="camera-page">
            <header className="camera-page-header">
              <div>
                <p className="mini-label">Virtual fitting room</p>
                <h1>Try on your fit</h1>
                <p>Capture today’s look and get a little styling inspiration.</p>
              </div>
              <button type="button" className="link-btn" onClick={() => setActiveTab("Discover")}>
                Back to discover
              </button>
            </header>

            <div className="camera-layout">
              <div className="camera-main-column">
                <section className="camera-stage" aria-label="Camera preview">
                  <div className="camera-preview">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      aria-label="Live camera preview"
                      className={capturedFit ? "camera-video is-hidden" : "camera-video"}
                    />
                    {capturedFit && <img className="captured-image" src={capturedFit} alt="Your captured outfit" />}
                    {!capturedFit && cameraStatus === "loading" && (
                      <p className="camera-message" role="status">Connecting to your camera…</p>
                    )}
                    {!capturedFit && cameraStatus === "error" && (
                      <div className="camera-message camera-error" role="alert">
                        <p>{cameraError}</p>
                        <button
                          type="button"
                          className="primary-btn"
                          onClick={() => {
                            setCameraError("");
                            setCameraStatus("loading");
                            setCameraAttempt((attempt) => attempt + 1);
                          }}
                        >
                          Try again
                        </button>
                      </div>
                    )}
                    {!capturedFit && cameraStatus === "ready" && (
                      <span className="camera-live"><span /> Camera is on</span>
                    )}
                  </div>

                  <div className="camera-controls">
                    {!capturedFit && cameraStatus === "ready" && (
                      <button type="button" className="secondary-btn switch-camera-button" onClick={switchCamera}>
                        <span aria-hidden="true">⇄</span>
                        Switch camera
                      </button>
                    )}
                    {capturedFit ? (
                      <button type="button" className="primary-btn capture-button" onClick={() => setCapturedFit("")}>
                        Retake photo
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="primary-btn capture-button"
                        onClick={captureFit}
                        disabled={cameraStatus !== "ready"}
                      >
                        <span className="shutter-icon" aria-hidden="true" />
                        Take fit photo
                      </button>
                    )}
                    <span>Your photo stays in this session and is not uploaded.</span>
                  </div>
                  {cameraSwitchMessage && <p className="camera-switch-message" role="status">{cameraSwitchMessage}</p>}
                </section>

                {capturedFit ? (
                  <section className="fit-feedback">
                    <p className="mini-label">After the photo</p>
                    <h2>Small tweaks, polished finish</h2>
                    <p className="feedback-disclaimer">
                      These are general styling ideas, not automated image analysis.
                    </p>
                    <ul className="improvement-list">
                      <li><span>01</span><p>Try a defined waist with a belt or a front tuck to give the outfit more shape.</p></li>
                      <li><span>02</span><p>Add one warm-metal accessory to bring a focal point to the look.</p></li>
                      <li><span>03</span><p>Layer a tailored outer piece for extra structure and a more finished feel.</p></li>
                    </ul>
                  </section>
                ) : (
                  <div className="fit-feedback fit-feedback-empty">
                    <p className="mini-label">Your fit notes</p>
                    <p>Take a photo to reveal outfit improvement ideas here.</p>
                  </div>
                )}
              </div>

              <aside className="camera-side-column">
                <section className="weather-card">
                  <div className="camera-card-heading">
                    <div>
                      <p className="mini-label">Today, where you are</p>
                      <h2>Weather</h2>
                    </div>
                    <span className="weather-icon" aria-hidden="true">☼</span>
                  </div>
                  <WeatherBadge />
                </section>

                <section className="rating-card">
                  <p className="mini-label">Your style score</p>
                  <div className="rating-row">
                    <strong>{capturedFit ? "8.5" : "—"}</strong>
                    <span>/ 10</span>
                  </div>
                  <p>{capturedFit ? "Sample editorial score; photo-based outfit analysis is not connected yet." : "Take a fit photo to reveal your style score."}</p>
                </section>

                <section className="similar-card">
                  <div className="camera-card-heading">
                    <div>
                      <p className="mini-label">Inspired by your fit</p>
                      <h2>Similar styles</h2>
                    </div>
                  </div>
                  <div className="similar-list">
                    {similarStyles.map((style) => (
                      <article className="similar-style" key={style.name}>
                        <img src={style.image} alt="" />
                        <div>
                          <h3>{style.name}</h3>
                          <p>{style.detail}</p>
                        </div>
                      </article>
                    ))}
                  </div>
                  <p className="similar-disclaimer">Curated suggestions; not matched by image recognition.</p>
                </section>
              </aside>
            </div>
          </section>
        )}
      </main>

      {!isCameraView && (
        <button
          type="button"
          className="camera-launcher"
          onClick={openCameraPage}
          aria-label="Open camera to try on a fit"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M4 7.5h3l1.4-2h7.2l1.4 2h3A1.5 1.5 0 0 1 21.5 9v9a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 18V9A1.5 1.5 0 0 1 4 7.5Z" />
            <circle cx="12" cy="13.5" r="3.5" />
          </svg>
          <span>Try on with camera</span>
        </button>
      )}
    </div>
  );
}
