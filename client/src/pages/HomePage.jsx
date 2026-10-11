import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import girlLogo from "../assets/Girl(6).svg";
import WeatherBadge from "../components/WeatherBadge.jsx";
import { dummyFriends, dummyNotifications, dummyPastFits } from "../data/dummyDatabase.js";
import { requestStyleMoodboard } from "../styleGuideApi.js";
import "./HomePage.css";

const GEMINI_API_URL = import.meta.env.VITE_GEMINI_API_URL || "http://localhost:3001/api/analyze-outfit";
const MAX_OUTFIT_IMAGE_EDGE = 1600;

const navItems = ["Today's Fit", "Past Fits", "Friends", "Style Guide"];

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

function getCurrentUsername() {
  try {
    const savedUser = JSON.parse(window.localStorage.getItem("fitcheck-user") || "null");
    const session = JSON.parse(window.localStorage.getItem("fitcheck-session") || "null");
    return savedUser?.username || session?.username || savedUser?.name || session?.name || "Guest";
  } catch {
    return "Guest";
  }
}

function getCurrentEmail() {
  try {
    const savedUser = JSON.parse(window.localStorage.getItem("fitcheck-user") || "null");
    const session = JSON.parse(window.localStorage.getItem("fitcheck-session") || "null");
    return savedUser?.email || session?.email || "No email saved";
  } catch {
    return "No email saved";
  }
}

function resizeImageFile(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      try {
        const scale = Math.min(1, MAX_OUTFIT_IMAGE_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Could not prepare that image.");

        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(objectUrl);
        resolve(canvas.toDataURL("image/jpeg", 0.88));
      } catch (error) {
        URL.revokeObjectURL(objectUrl);
        reject(error);
      }
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read that image. Please try another photo."));
    };

    image.src = objectUrl;
  });
}

export default function HomePage() {
  const username = getCurrentUsername();
  const friendFeedbackKey = `fitcheck-friend-feedback:${username}`;
  const email = getCurrentEmail();
  const usernameInitials = username.slice(0, 2).toUpperCase();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("Camera");
  const [stylePrompt, setStylePrompt] = useState("");
  const [styleMoodboard, setStyleMoodboard] = useState(null);
  const [styleGuideStatus, setStyleGuideStatus] = useState("idle");
  const [styleGuideError, setStyleGuideError] = useState("");
  const [friendFeedback, setFriendFeedback] = useState(() => {
    try {
      return JSON.parse(window.localStorage.getItem(friendFeedbackKey) || "{}");
    } catch {
      return {};
    }
  });
  const [friendCommentDrafts, setFriendCommentDrafts] = useState({});
  const [friendHoverRatings, setFriendHoverRatings] = useState({});
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isNotificationMenuOpen, setIsNotificationMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState(dummyNotifications);
  const [cameraStarted, setCameraStarted] = useState(false);
  const [cameraStatus, setCameraStatus] = useState("idle");
  const [cameraError, setCameraError] = useState("");
  const [cameraSwitchMessage, setCameraSwitchMessage] = useState("");
  const [currentWeather, setCurrentWeather] = useState(null);
  const [capturedFit, setCapturedFit] = useState("");
  const [targetStyle, setTargetStyle] = useState("");
  const [analysisResult, setAnalysisResult] = useState(null);
  const [analysisStatus, setAnalysisStatus] = useState("idle");
  const [analysisError, setAnalysisError] = useState("");
  const videoRef = useRef(null);
  const photoInputRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const cameraDevicesRef = useRef([]);
  const cameraSessionRef = useRef(0);
  const accountMenuRef = useRef(null);
  const notificationMenuRef = useRef(null);
  const accountMenuCloseTimerRef = useRef(null);

  const isHistoryView = activeTab === "Past Fits";
  const isStyleGuideView = activeTab === "Style Guide";
  const isCameraView = activeTab === "Camera";
  const isFriendsView = activeTab === "Friends";
  const unreadNotificationCount = notifications.filter((notification) => !notification.read).length;
  const fitRatingOutOfFive = typeof analysisResult?.score === "number"
    ? Math.max(0, Math.min(5, analysisResult.score / 2))
    : null;

  useEffect(() => {
    try {
      window.localStorage.setItem(friendFeedbackKey, JSON.stringify(friendFeedback));
    } catch {
      // Keep feedback in the current view if browser storage is unavailable.
    }
  }, [friendFeedback, friendFeedbackKey]);

  function rateFriendFit(friendId, rating) {
    setFriendFeedback((current) => ({
      ...current,
      [friendId]: { ...current[friendId], rating },
    }));
  }

  function addFriendComment(event, friendId) {
    event.preventDefault();
    const text = friendCommentDrafts[friendId]?.trim();
    if (!text) return;

    setFriendFeedback((current) => {
      const feedback = current[friendId] || {};
      return {
        ...current,
        [friendId]: {
          ...feedback,
          comments: [...(feedback.comments || []), { id: `${Date.now()}`, username, text }],
        },
      };
    });
    setFriendCommentDrafts((current) => ({ ...current, [friendId]: "" }));
  }

  function openAccountMenu() {
    window.clearTimeout(accountMenuCloseTimerRef.current);
    setIsAccountMenuOpen(true);
  }

  function delayAccountMenuClose() {
    window.clearTimeout(accountMenuCloseTimerRef.current);
    accountMenuCloseTimerRef.current = window.setTimeout(() => {
      setIsAccountMenuOpen(false);
    }, 2000);
  }

  useEffect(() => {
    if (!isAccountMenuOpen && !isSettingsOpen && !isNotificationMenuOpen) return undefined;

    function closeAccountOverlays(event) {
      if (event.key === "Escape") {
        window.clearTimeout(accountMenuCloseTimerRef.current);
        setIsAccountMenuOpen(false);
        setIsSettingsOpen(false);
        setIsNotificationMenuOpen(false);
        return;
      }

      if (event.type === "pointerdown" && !accountMenuRef.current?.contains(event.target)) {
        window.clearTimeout(accountMenuCloseTimerRef.current);
        setIsAccountMenuOpen(false);
      }
      if (event.type === "pointerdown" && !notificationMenuRef.current?.contains(event.target)) {
        setIsNotificationMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeAccountOverlays);
    window.addEventListener("keydown", closeAccountOverlays);
    return () => {
      document.removeEventListener("pointerdown", closeAccountOverlays);
      window.removeEventListener("keydown", closeAccountOverlays);
      window.clearTimeout(accountMenuCloseTimerRef.current);
    };
  }, [isAccountMenuOpen, isSettingsOpen, isNotificationMenuOpen]);

  function markNotificationRead(notificationId) {
    setNotifications((current) => current.map((notification) => (
      notification.id === notificationId ? { ...notification, read: true } : notification
    )));
  }

  useEffect(() => {
    if (!isCameraView || !cameraStarted) return undefined;

    return () => {
      cameraSessionRef.current += 1;
      const activeStream = cameraStreamRef.current;
      activeStream?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
      if (videoRef.current) {
        videoRef.current.srcObject = null;
        videoRef.current = null;
      }
    };
  }, [isCameraView, cameraStarted]);

  function openCameraPage() {
    setCameraError("");
    setCameraSwitchMessage("");
    setCameraStarted(false);
    setCameraStatus("idle");
    setCapturedFit("");
    resetStyleAnalysis();
    setActiveTab("Camera");
  }

  function resetStyleAnalysis() {
    setTargetStyle("");
    setAnalysisResult(null);
    setAnalysisStatus("idle");
    setAnalysisError("");
  }

  function setOutfitPhoto(photoData) {
    setCapturedFit(photoData);
    resetStyleAnalysis();
  }

  async function startCamera() {
    setCameraError("");
    setCameraStatus("loading");
    setCameraStarted(true);

    const session = ++cameraSessionRef.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera access requires a secure connection. Upload a photo or open this page on localhost or HTTPS.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      if (session !== cameraSessionRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      cameraStreamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraStatus("ready");
      try {
        cameraDevicesRef.current = (await navigator.mediaDevices.enumerateDevices())
          .filter((device) => device.kind === "videoinput");
      } catch {
        cameraDevicesRef.current = [];
      }
    } catch (error) {
      if (session !== cameraSessionRef.current) return;

      const permissionDenied = ["NotAllowedError", "SecurityError"].includes(error?.name);
      const noCamera = error?.name === "NotFoundError";
      const cameraBusy = error?.name === "NotReadableError";
      const message = permissionDenied
        ? `Camera access is denied for ${window.location.origin}. Allow Camera in this site's address-bar permissions, reload the page, and try again. If it is already allowed there, check your operating system's camera privacy settings.`
        : noCamera
          ? "No camera was found. Connect a camera or upload a photo instead."
          : cameraBusy
            ? "The camera is being used by another app. Close it there or upload a photo instead."
            : error instanceof Error
              ? error.message
              : "Unable to access the camera. Upload a photo or try again.";
      setCameraError(message);
      setCameraStatus("error");
    }
  }

  function retakePhoto() {
    setCapturedFit("");
    setCameraError("");
    setCameraStarted(false);
    setCameraStatus("idle");
    resetStyleAnalysis();
  }

  function backToPhotoChoices() {
    setCameraError("");
    setCameraSwitchMessage("");
    setCameraStarted(false);
    setCameraStatus("idle");
  }

  function handleLogout() {
    try {
      window.localStorage.removeItem("fitcheck-session");
    } finally {
      navigate("/login");
    }
  }

  async function handleStyleGuideSubmit(event) {
    event.preventDefault();
    const prompt = stylePrompt.trim();
    if (!prompt) return;

    setStyleGuideStatus("loading");
    setStyleGuideError("");
    try {
      const moodboard = await requestStyleMoodboard(prompt);
      setStyleMoodboard(moodboard);
      setStyleGuideStatus("success");
    } catch (error) {
      setStyleGuideError(error instanceof Error ? error.message : "Could not build that mood board.");
      setStyleGuideStatus("error");
    }
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

    const scale = Math.min(1, MAX_OUTFIT_IMAGE_EDGE / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) {
      setCameraError("Could not capture an image from the camera.");
      setCameraStatus("error");
      return;
    }

    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    setOutfitPhoto(canvas.toDataURL("image/jpeg", 0.88));
    setCameraStarted(false);
    setCameraStatus("idle");
  }

  async function handlePhotoUpload(event) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setCameraError("Choose an image file for your outfit photo.");
      return;
    }

    try {
      const photoData = await resizeImageFile(file);
      setOutfitPhoto(photoData);
      setCameraStarted(false);
      setCameraStatus("idle");
      setCameraError("");
      setCameraSwitchMessage("");
    } catch (error) {
      setCameraError(error instanceof Error ? error.message : "Could not read that image. Please try another photo.");
    }
  }

  async function analyzeTargetStyle(event) {
    event.preventDefault();
    const normalizedTargetStyle = targetStyle.trim();
    if (!capturedFit || !normalizedTargetStyle) return;

    const dataUrlMatch = capturedFit.match(/^data:(image\/[^;]+);base64,(.+)$/s);
    if (!dataUrlMatch) {
      setAnalysisError("This photo could not be prepared for analysis. Please upload it again.");
      setAnalysisStatus("error");
      return;
    }

    setAnalysisStatus("loading");
    setAnalysisError("");
    setAnalysisResult(null);
    try {
      const response = await fetch(GEMINI_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: dataUrlMatch[2],
          mimeType: dataUrlMatch[1],
          targetStyle: normalizedTargetStyle,
          weather: currentWeather
            ? { tempF: currentWeather.tempF, description: currentWeather.description }
            : undefined,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || `Gemini request failed (${response.status}).`);
      }
      setAnalysisResult(result);
      setAnalysisStatus("success");
    } catch (error) {
      setAnalysisError(error instanceof Error
        ? error.message
        : "Could not reach Gemini. Check that the Gemini service is running.");
      setAnalysisStatus("error");
    }
  }

  return (
    <div className="fashion-app">
      <aside className="sidebar" aria-label="Dashboard navigation">
        <div className="brand">
          <img className="brand-logo" src={girlLogo} alt="Fit Check logo" />
        </div>
        <nav className="nav-menu" aria-label="Main navigation">
          {navItems.map((item) => (
            <button
              key={item}
              type="button"
              className={(item === activeTab || (item === "Today's Fit" && isCameraView)) ? "nav-item active" : "nav-item"}
              onClick={() => item === "Today's Fit" ? openCameraPage() : setActiveTab(item)}
            >
              {item}
            </button>
          ))}
        </nav>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="notification-menu" ref={notificationMenuRef}>
            <button
              className="notification-trigger"
              type="button"
              aria-label={`Notifications${unreadNotificationCount ? `, ${unreadNotificationCount} unread` : ""}`}
              aria-haspopup="menu"
              aria-expanded={isNotificationMenuOpen}
              title="Notifications"
              onClick={() => {
                setIsAccountMenuOpen(false);
                setIsNotificationMenuOpen((open) => !open);
              }}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
              </svg>
              {unreadNotificationCount > 0 && (
                <span className="notification-count">{unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}</span>
              )}
            </button>
            {isNotificationMenuOpen && (
              <div className="notification-dropdown" role="menu" aria-label="Notifications">
                <header className="notification-dropdown-header">
                  <h2>Notifications</h2>
                  <span>{unreadNotificationCount} new</span>
                </header>
                {notifications.length ? (
                  <ul>
                    {notifications.map((notification) => (
                      <li key={notification.id}>
                        <button
                          className={`notification-item${notification.read ? "" : " unread"}`}
                          type="button"
                          role="menuitem"
                          onClick={() => markNotificationRead(notification.id)}
                        >
                          <span className="notification-type">{notification.type}</span>
                          <span className="notification-copy">
                            <strong>{notification.actor}</strong>
                            <span>{notification.message}</span>
                            <time>{notification.time}</time>
                          </span>
                          {!notification.read && <span className="notification-unread-dot" aria-label="Unread" />}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="notification-empty">You’re all caught up.</p>
                )}
              </div>
            )}
          </div>
          <div
            className="account-menu"
            ref={accountMenuRef}
            onMouseEnter={openAccountMenu}
            onMouseLeave={delayAccountMenuClose}
            onFocus={openAccountMenu}
          >
            <button
              className="user-pill"
              type="button"
              aria-label={`Account menu for ${username}`}
              aria-haspopup="menu"
              aria-expanded={isAccountMenuOpen}
              onClick={() => {
                window.clearTimeout(accountMenuCloseTimerRef.current);
                setIsAccountMenuOpen((open) => !open);
              }}
            >
              <span className="avatar" aria-hidden="true">{usernameInitials}</span>
              <strong>{username}</strong>
              <span className="account-chevron" aria-hidden="true">⌄</span>
            </button>
            {isAccountMenuOpen && (
              <div className="account-dropdown" role="menu" aria-label="Account options">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    window.clearTimeout(accountMenuCloseTimerRef.current);
                    setIsAccountMenuOpen(false);
                    setIsSettingsOpen(true);
                  }}
                >
                  Settings
                </button>
                <button className="account-logout" type="button" role="menuitem" onClick={handleLogout}>
                  Log out
                </button>
              </div>
            )}
          </div>
        </header>

        {isStyleGuideView ? (
          <section className="style-guide-page" aria-labelledby="style-guide-title">
            <header className="style-guide-heading">
              <p className="mini-label">Style Guide</p>
              <h1 id="style-guide-title">What style are you imagining?</h1>
              <p>Start with an aesthetic, occasion, color, or silhouette.</p>
            </header>

            <form className="style-guide-form" onSubmit={handleStyleGuideSubmit} aria-busy={styleGuideStatus === "loading"}>
              <label htmlFor="style-guide-prompt">Describe your style</label>
              <div className="style-guide-input-row">
                <input
                  id="style-guide-prompt"
                  className="style-guide-input"
                  value={stylePrompt}
                  onChange={(event) => setStylePrompt(event.target.value)}
                  placeholder="e.g. streetwear, gothic, bohemian"
                  maxLength={120}
                  required
                />
                <button className="primary-btn style-guide-submit" type="submit" disabled={styleGuideStatus === "loading" || !stylePrompt.trim()}>
                  {styleGuideStatus === "loading" ? "Building…" : "Build moodboard"}
                </button>
              </div>
            </form>

            <div className="style-guide-examples" aria-label="Example style prompts">
              <span className="mini-label">Try a direction</span>
              {["Soft autumn tailoring", "Oversized streetwear", "Cozy winter layers", "Soft romantic minimalism"].map((example) => (
                <button className="style-example-button" key={example} type="button" onClick={() => setStylePrompt(example)}>
                  {example}
                </button>
              ))}
            </div>

            {styleGuideStatus === "loading" && <p className="style-guide-status" role="status">Structuring your style brief…</p>}
            {styleGuideError && <p className="style-guide-error" role="alert">{styleGuideError}</p>}

            {styleMoodboard && styleGuideStatus === "success" && (
              <section className="style-moodboard" aria-live="polite" aria-labelledby="moodboard-title">
                <header className="style-moodboard-header">
                  <div>
                    <p className="mini-label">Your style direction</p>
                    <h2 id="moodboard-title">{styleMoodboard.title}</h2>
                    <p>{styleMoodboard.summary}</p>
                  </div>
                  <div className="style-keywords">
                    {styleMoodboard.keywords.map((keyword) => <span key={keyword}>{keyword}</span>)}
                  </div>
                </header>

                <div className="style-palette" aria-label="Suggested color palette">
                  {styleMoodboard.palette.map((color) => (
                    <div className="style-palette-swatch" key={color.name}>
                      <span style={{ backgroundColor: color.value }} aria-hidden="true" />
                      <small>{color.name}</small>
                    </div>
                  ))}
                </div>

                <div className="style-moodboard-grid">
                  {styleMoodboard.looks.map((look, index) => (
                    <article className="style-look" key={look.title}>
                      <img src={look.image} alt={`${look.title} outfit inspiration`} />
                      <div className="style-look-copy">
                        <p className="mini-label">Look {String(index + 1).padStart(2, "0")}</p>
                        <h3>{look.title}</h3>
                        <p>{look.description}</p>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}
          </section>
        ) : isFriendsView ? (
          <section className="friends-page" aria-labelledby="friends-heading">
            <header className="friends-page-header">
              <p className="mini-label">Community</p>
              <h1 id="friends-heading">Friends</h1>
              <p>See what your friends are wearing today and share your take.</p>
            </header>
            <div className="friends-grid">
              {dummyFriends.map((friend) => {
                const feedback = friendFeedback[friend.id] || {};
                const comments = [...friend.comments, ...(feedback.comments || [])];
                const displayedRating = friendHoverRatings[friend.id] ?? feedback.rating ?? 0;
                return (
                  <article className="friend-card" key={friend.id}>
                    <header className="friend-card-header">
                      <div>
                        <h2>{friend.username}</h2>
                        <time>{friend.postedAt}</time>
                      </div>
                    </header>
                    <img className="friend-photo" src={friend.photo} alt={`${friend.username} wearing ${friend.fitName}`} />
                    <div className="friend-card-details">
                      <h3>{friend.fitName}</h3>
                      <p className="friend-fit-score"><span>Fit score</span><strong>{friend.fitScore.toFixed(1)} / 5</strong></p>
                      <p className="friend-style-worn">{friend.styleWorn}</p>

                      <section className="friend-rating-section" aria-label={`Rate ${friend.username}'s outfit`}>
                        <div className="friend-rating-heading">
                          <span>Your rating</span>
                          <output>{feedback.rating ? `${feedback.rating} / 5` : "Not rated"}</output>
                        </div>
                        <div
                          className="friend-stars"
                          role="group"
                          aria-label={`Rate ${friend.username} out of five stars`}
                          onMouseLeave={() => setFriendHoverRatings((current) => {
                            const next = { ...current };
                            delete next[friend.id];
                            return next;
                          })}
                          onBlur={(event) => {
                            if (!event.currentTarget.contains(event.relatedTarget)) {
                              setFriendHoverRatings((current) => {
                                const next = { ...current };
                                delete next[friend.id];
                                return next;
                              });
                            }
                          }}
                        >
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              className={`friend-star${displayedRating >= star ? " selected" : ""}`}
                              key={star}
                              type="button"
                              aria-label={`${star} ${star === 1 ? "star" : "stars"}`}
                              aria-pressed={feedback.rating === star}
                              onMouseEnter={() => setFriendHoverRatings((current) => ({ ...current, [friend.id]: star }))}
                              onFocus={() => setFriendHoverRatings((current) => ({ ...current, [friend.id]: star }))}
                              onClick={() => rateFriendFit(friend.id, star)}
                            >
                              &#9733;
                            </button>
                          ))}
                        </div>
                      </section>

                      <section className="friend-comments" aria-label={`Comments on ${friend.username}'s fit`}>
                        <h4>Comments</h4>
                        <ul>
                          {comments.map((comment) => (
                            <li key={comment.id}><strong>{comment.username}</strong><p>{comment.text}</p></li>
                          ))}
                        </ul>
                        <form className="friend-comment-form" onSubmit={(event) => addFriendComment(event, friend.id)}>
                          <label htmlFor={`friend-comment-${friend.id}`}>Add a comment</label>
                          <input
                            id={`friend-comment-${friend.id}`}
                            type="text"
                            value={friendCommentDrafts[friend.id] || ""}
                            onChange={(event) => setFriendCommentDrafts((current) => ({ ...current, [friend.id]: event.target.value }))}
                            placeholder="What do you think?"
                            autoComplete="off"
                            maxLength="240"
                          />
                          <button className="secondary-btn" type="submit" disabled={!friendCommentDrafts[friend.id]?.trim()}>
                            Comment
                          </button>
                        </form>
                      </section>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : !isHistoryView && !isCameraView ? (
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
                <p className="mini-label">Your History</p>
                <h2>Your past fits</h2>
              </div>
           
            </div>

            <div className="history-list">
              {dummyPastFits.map((fit) => (
                <article key={fit.id} className="history-item">
                  <img className="history-image" src={fit.image} alt={`${fit.name} outfit`} />
                  <div className="history-copy">
                    <div className="history-topline">
                      <span>{fit.date}</span>
                      <span className="tag">{fit.id}</span>
                    </div>
                    <div className="history-rating">
                      <span>Rating</span>
                      <strong>{fit.rating.toFixed(1)} / 10</strong>
                    </div>
                    <h3>{fit.name}</h3>
                    <p>{fit.styleWorn}</p>
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
                <h1>Check your fit!</h1>
                <p>Snap a picture, see your rating, and get a little styling advice.</p>
              </div>
              <button type="button" className="link-btn" onClick={() => setActiveTab("Discover")}>
                Discover more styles
              </button>
            </header>

            <div className="camera-layout">
              <div className="camera-main-column">
                <section className="camera-stage" aria-label="Camera preview">
                  <input
                    ref={photoInputRef}
                    className="camera-file-input"
                    type="file"
                    accept="image/*"
                    aria-label="Choose an outfit photo to upload"
                    onChange={handlePhotoUpload}
                  />
                  <div className="camera-preview">
                    {cameraStarted && !capturedFit && (
                      <button
                        className="camera-preview-back"
                        type="button"
                        aria-label="Back to photo choices"
                        title="Back to photo choices"
                        onClick={backToPhotoChoices}
                      >
                        <span aria-hidden="true">&#8592;</span>
                      </button>
                    )}
                    {!capturedFit && cameraStarted && (
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        aria-label="Live camera preview"
                        className="camera-video"
                      />
                    )}
                    {capturedFit && <img className="captured-image" src={capturedFit} alt="Your captured outfit" />}
                    {!capturedFit && !cameraStarted && (
                      <div className="camera-start-choices">
                        <p>How would you like to add your outfit photo?</p>
                        <div className="camera-start-actions">
                          <button type="button" className="secondary-btn" onClick={() => photoInputRef.current?.click()}>
                            Upload photo
                          </button>
                          <button type="button" className="primary-btn" onClick={startCamera}>
                            Take fit photo
                          </button>
                        </div>
                      </div>
                    )}
                    {!capturedFit && cameraStarted && cameraStatus === "loading" && (
                      <p className="camera-message" role="status">Connecting to your camera…</p>
                    )}
                    {!capturedFit && cameraStarted && cameraStatus === "error" && (
                      <div className="camera-message camera-error" role="alert">
                        <p>{cameraError}</p>
                        <button
                          type="button"
                          className="primary-btn"
                          onClick={startCamera}
                        >
                          Try again
                        </button>
                      </div>
                    )}
                    {!capturedFit && cameraStarted && cameraStatus === "ready" && (
                      <span className="camera-live"><span /> Camera is on</span>
                    )}
                  </div>

                  <div className="camera-controls">
                    {!capturedFit && cameraStarted && cameraStatus === "ready" && (
                      <button type="button" className="secondary-btn switch-camera-button" onClick={switchCamera}>
                        <span aria-hidden="true">⇄</span>
                        Switch camera
                      </button>
                    )}
                    {capturedFit ? (
                      <>
                        <button type="button" className="secondary-btn upload-photo-button" onClick={() => photoInputRef.current?.click()}>
                          Upload another
                        </button>
                        <button type="button" className="primary-btn capture-button" onClick={retakePhoto}>
                          Retake photo
                        </button>
                      </>
                    ) : cameraStarted ? (
                      <button
                        type="button"
                        className="primary-btn capture-button"
                        onClick={captureFit}
                        disabled={cameraStatus !== "ready"}
                      >
                        <span className="shutter-icon" aria-hidden="true" />
                        Take fit photo
                      </button>
                    ) : null}
                    <span>Your photo stays in this session and is not uploaded.</span>
                  </div>
                  {cameraSwitchMessage && <p className="camera-switch-message" role="status">{cameraSwitchMessage}</p>}
                </section>

                {analysisResult?.colors?.filter((color) => /^#[\da-f]{6}$/i.test(color)).slice(0, 4).length > 0 && (
                  <div className="outfit-color-bar" role="img" aria-label="Outfit color palette">
                    {analysisResult.colors
                      .filter((color) => /^#[\da-f]{6}$/i.test(color))
                      .slice(0, 4)
                      .map((color, index) => (
                        <span key={`${color}-${index}`} style={{ backgroundColor: color }} aria-hidden="true" />
                      ))}
                  </div>
                )}

                {capturedFit ? (
                  <section className="fit-feedback">
                    <p className="mini-label">Style check</p>
                    <h2>What kind of outfit are you aiming for?</h2>
                    <form className="target-style-form" onSubmit={analyzeTargetStyle}>
                      <div className="target-style-fields">
                        <input
                          id="target-style"
                          type="text"
                          value={targetStyle}
                          onChange={(event) => setTargetStyle(event.target.value)}
                          placeholder="e.g. business casual, gothic, techwear"
                          maxLength="300"
                          required
                        />
                        <button className="primary-btn" type="submit" disabled={!targetStyle.trim() || analysisStatus === "loading"}>
                          {analysisStatus === "loading" ? "Analyzing…" : "Get feedback"}
                        </button>
                      </div>
                    </form>

                    {analysisStatus === "loading" && <p className="analysis-status" role="status">Sending your outfit and target style to Gemini…</p>}
                    {analysisError && <p className="analysis-error" role="alert">{analysisError}</p>}

                  </section>
                ) : (
                  <div className="fit-feedback fit-feedback-empty">
                    <p className="mini-label">Your fit notes</p>
                    <p>Take a photo to reveal outfit improvement ideas here.</p>
                  </div>
                )}
              </div>

              <aside className={`camera-side-column${analysisResult ? "" : " camera-side-column-compact"}`}>
                <section className="weather-card">
                  <div className="camera-card-heading">
                    <div>
                      <p className="mini-label">How's the weather today?</p>
                    </div>
                    <span className="weather-icon" aria-hidden="true">☼</span>
                  </div>
                  <WeatherBadge onLoaded={setCurrentWeather} />
                  {analysisResult?.weatherFit?.note && (
                    <div className={`weather-fit-note${analysisResult.weatherFit.ok === false ? " not-matched" : ""}`} aria-live="polite">
                      <strong>
                        {analysisResult.weatherFit.ok === true
                          ? "Outfit suits today"
                          : analysisResult.weatherFit.ok === false
                            ? "Weather mismatch"
                            : "Weather fit"}
                      </strong>
                      <p>{analysisResult.weatherFit.note}</p>
                    </div>
                  )}
                </section>

                <section className="rating-card">
                  <p className="mini-label">Your style score</p>
                  <div className="rating-row">
                    <strong>{fitRatingOutOfFive === null ? "—" : fitRatingOutOfFive.toFixed(1)}</strong>
                    <span>/ 5</span>
                  </div>
                  {analysisResult?.verdict ? (
                    <p>{analysisResult.verdict}</p>
                  ) : capturedFit ? (
                    <p>Enter a target style to get outfit feedback.</p>
                  ) : null}
                  {analysisResult?.whatsWorking?.length > 0 && (
                    <div className="score-notes">
                      <h3>What’s working</h3>
                      <ul>{analysisResult.whatsWorking.map((item, index) => <li key={`working-${index}`}>{item}</li>)}</ul>
                    </div>
                  )}
                  {analysisResult?.improvements?.length > 0 && (
                    <div className="score-notes">
                      <h3>Try next</h3>
                      <ul>{analysisResult.improvements.map((item, index) => <li key={`improvement-${index}`}>{item}</li>)}</ul>
                    </div>
                  )}
                </section>

                <section className="similar-card">
                  <div className="camera-card-heading">
                    <div>
                      <p className="mini-label">What's your fit giving?</p>
                      {analysisResult?.fitGiving?.vibe && <h2>{analysisResult.fitGiving.vibe}</h2>}
                    </div>
                  </div>
                  {analysisResult?.fitGiving?.closestStyle ? (
                    <div className="gemini-style-match">
                      <p className="mini-label">Closest style match</p>
                      <h3>{analysisResult.fitGiving.closestStyle}</h3>
                      {analysisResult.fitGiving.reason && <p>{analysisResult.fitGiving.reason}</p>}
                    </div>
                  ) : null}
                </section>
              </aside>
            </div>
          </section>
        )}
      </main>

      {isSettingsOpen && (
        <div className="account-settings-backdrop" onClick={() => setIsSettingsOpen(false)}>
          <section
            className="account-settings-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-settings-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="account-settings-header">
              <div>
                <p className="mini-label">Account</p>
                <h2 id="account-settings-title">Settings</h2>
              </div>
              <button type="button" className="settings-close" aria-label="Close settings" onClick={() => setIsSettingsOpen(false)}>
                <span aria-hidden="true">&times;</span>
              </button>
            </header>
            <dl className="account-settings-details">
              <div>
                <dt>Username</dt>
                <dd>{username}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{email}</dd>
              </div>
            </dl>
          </section>
        </div>
      )}
    </div>
  );
}
