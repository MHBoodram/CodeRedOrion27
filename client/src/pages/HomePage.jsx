import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import girlLogo from "../assets/Girl(6).svg";
import WeatherBadge from "../components/WeatherBadge.jsx";
import { api, describeError } from "../api.js";
import { useAuth } from "../auth.jsx";
import { makeThumbnail } from "../Imageutils.js";
import { requestStyleMoodboard } from "../styleGuideApi.js";
import "./HomePage.css";
import "./Analysis.css";

// Longest edge of any photo we keep or upload. Keeps request bodies small (server limit is 6 MB).
const MAX_OUTFIT_IMAGE_EDGE = 1024;

// Turns a notification row from the API into the text the dropdown shows.
function describeNotification(n) {
  const outfit = n.outfit?.title ? ` "${n.outfit.title}"` : " your outfit";
  if (n.type === "rating") return { label: "New rating", message: `Rated${outfit} ${n.detail} out of 5 stars.` };
  if (n.type === "comment") return { label: "New comment", message: n.detail ? `Commented on${outfit}: ${n.detail}` : `Commented on${outfit}.` };
  if (n.type === "follow") return { label: "New follower", message: "Started following you." };
  return { label: "Update", message: "" };
}

function timeAgo(iso) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} d ago`;
}

const colorSwatches = {
  indigo: "#49436f",
  navy: "#293b58",
  blue: "#47769a",
  white: "#f4f0e9",
  cream: "#e9ddc6",
  tan: "#c3a477",
  beige: "#cbb99c",
  brown: "#79563f",
  black: "#242124",
  gray: "#858286",
  grey: "#858286",
  olive: "#73724a",
  green: "#55745b",
  red: "#9b4547",
  burgundy: "#6e303e",
  purple: "#755880",
  pink: "#c57f91",
  yellow: "#d5b84f",
  orange: "#c57a44",
};

function getColorSwatch(color, index) {
  const normalized = color.trim().toLowerCase();
  if (/^#[\da-f]{3}(?:[\da-f]{3})?(?:[\da-f]{2})?$/i.test(normalized)) return normalized;
  const match = Object.keys(colorSwatches).find((name) => normalized.includes(name));
  return match ? colorSwatches[match] : `hsl(${(index * 67 + 18) % 360} 30% 48%)`;
}

const navItems = ["Today's Fit", "Past Fits", "Friends", "Style Guide"];

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

async function resizeImageFile(file, maxSize = MAX_OUTFIT_IMAGE_EDGE) {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare that image.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
    if (!blob) throw new Error("Could not compress that image. Please try another photo.");
    return blob;
  } finally {
    bitmap.close();
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string"
      ? resolve(reader.result)
      : reject(new Error("Could not prepare that image."));
    reader.onerror = () => reject(new Error("Could not prepare that image."));
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl) {
  const match = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/s);
  if (!match) throw new Error("This photo could not be prepared for analysis. Please upload it again.");

  const binary = window.atob(match[2]);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: match[1] });
}

export default function HomePage() {
  const { user, logout, updateUser } = useAuth();
  const username = user?.username || "Guest";
  const email = user?.email || "";
  const usernameInitials = username.slice(0, 2).toUpperCase();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("Camera");
  const [stylePrompt, setStylePrompt] = useState("");
  const [styleMoodboard, setStyleMoodboard] = useState(null);
  const [styleGuideStatus, setStyleGuideStatus] = useState("idle");
  const [styleGuideError, setStyleGuideError] = useState("");
  const [friends, setFriends] = useState([]);
  const [friendsScope, setFriendsScope] = useState("all");
  const [friendsStatus, setFriendsStatus] = useState("idle");
  const [friendsError, setFriendsError] = useState("");
  const [friendComments, setFriendComments] = useState({});
  const [friendCommentDrafts, setFriendCommentDrafts] = useState({});
  const [friendHoverRatings, setFriendHoverRatings] = useState({});
  const [pendingActions, setPendingActions] = useState({});
  const [recommended, setRecommended] = useState([]);
  const [recommendedStatus, setRecommendedStatus] = useState("loading");
  const [settingsDraft, setSettingsDraft] = useState(null);
  const [settingsStatus, setSettingsStatus] = useState("idle");
  const [settingsError, setSettingsError] = useState("");
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isNotificationMenuOpen, setIsNotificationMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notificationsError, setNotificationsError] = useState("");
  const [cameraStarted, setCameraStarted] = useState(false);
  const [cameraStatus, setCameraStatus] = useState("idle");
  const [cameraError, setCameraError] = useState("");
  const [cameraSwitchMessage, setCameraSwitchMessage] = useState("");
  const [photoCountdown, setPhotoCountdown] = useState(3);
  const [countdownRemaining, setCountdownRemaining] = useState(null);
  const [currentWeather, setCurrentWeather] = useState(null);
  const [capturedFit, setCapturedFit] = useState("");
  const [targetStyle, setTargetStyle] = useState("");
  const [analysisResult, setAnalysisResult] = useState(null);
  const [analysisStatus, setAnalysisStatus] = useState("idle");
  const [analysisError, setAnalysisError] = useState("");
  const [pastFits, setPastFits] = useState([]);
  const [pastFitsStatus, setPastFitsStatus] = useState("idle");
  const [pastFitsError, setPastFitsError] = useState("");
  const videoRef = useRef(null);
  const photoInputRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const cameraDevicesRef = useRef([]);
  const cameraSessionRef = useRef(0);
  const photoCountdownTimerRef = useRef(null);
  const accountMenuRef = useRef(null);
  const notificationMenuRef = useRef(null);
  const accountMenuCloseTimerRef = useRef(null);

  const isHistoryView = activeTab === "Past Fits";
  const isStyleGuideView = activeTab === "Style Guide";
  const isCameraView = activeTab === "Camera";
  const isFriendsView = activeTab === "Friends";
  // The hero/recommendations page. No nav item opens it right now; it shows when no other tab is active.
  const isHomeView = !isStyleGuideView && !isFriendsView && !isHistoryView && !isCameraView;
  const isPhotoCountdownActive = countdownRemaining !== null && photoCountdownTimerRef.current !== null;
  const unreadNotificationCount = notifications.filter((notification) => !notification.read).length;

  // Load notifications on mount, every 30 seconds, and whenever the bell is opened.
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    async function load() {
      try {
        const data = await api.notifications({ signal: controller.signal });
        if (!cancelled) { setNotifications(data.notifications || []); setNotificationsError(""); }
      } catch (error) {
        if (!cancelled && !controller.signal.aborted) setNotificationsError(describeError(error));
      }
    }
    load();
    const timer = window.setInterval(load, 30000);
    return () => { cancelled = true; controller.abort(); window.clearInterval(timer); };
  }, [isNotificationMenuOpen]);
  const fitScore = typeof analysisResult?.score === "number" ? analysisResult.score : null;
  const noOutfitDetected = analysisResult !== null && analysisResult.score === null;

  // Reload history every time the Past Fits tab opens, so a fit analyzed a moment ago is always there.
  useEffect(() => {
    if (!isHistoryView) return undefined;

    const controller = new AbortController();
    setPastFitsStatus("loading");
    setPastFitsError("");
    api
      .fits({ limit: 50, signal: controller.signal })
      .then(({ fits = [] }) => {
        setPastFits(fits);
        setPastFitsStatus("success");
      })
      .catch((error) => {
        if (error?.name === "AbortError") return;
        setPastFitsError(describeError(error));
        setPastFitsStatus("error");
      });
    return () => controller.abort();
  }, [isHistoryView]);

  useEffect(() => {
    if (!isFriendsView) return undefined;

    const controller = new AbortController();
    const query = new URLSearchParams({ sort: "recent", scope: friendsScope, limit: "20" });
    setFriendsStatus("loading");
    setFriendsError("");

    api(`/outfits?${query}`, { signal: controller.signal })
      .then(async ({ outfits = [] }) => {
        setFriends(outfits);
        const commentEntries = await Promise.all(outfits.map(async (outfit) => {
          try {
            const { comments = [] } = await api(`/outfits/${outfit.id}/comments`, { signal: controller.signal });
            return [outfit.id, comments];
          } catch {
            return [outfit.id, []];
          }
        }));

        if (controller.signal.aborted) return;
        setFriendComments(Object.fromEntries(commentEntries));
        setFriendsStatus("success");
      })
      .catch((error) => {
        if (error?.name === "AbortError") return;
        setFriendsError(error instanceof Error ? error.message : "Could not load outfits.");
        setFriendsStatus("error");
      });

    return () => controller.abort();
  }, [friendsScope, isFriendsView]);

  // Home recommendations: top-rated outfits, or the newest ones if nothing has been rated yet.
  useEffect(() => {
    if (!isHomeView) return undefined;

    const controller = new AbortController();
    api("/outfits?sort=top&limit=3", { signal: controller.signal })
      .then(async ({ outfits = [] }) => {
        if (outfits.length) return outfits;
        return (await api("/outfits?sort=recent&limit=3", { signal: controller.signal })).outfits || [];
      })
      .then((outfits) => {
        setRecommended(outfits);
        setRecommendedStatus("success");
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setRecommendedStatus("error");
        console.error("Could not load recommendations:", describeError(error));
      });

    return () => controller.abort();
  }, [isHomeView]);

  function openSettings() {
    setSettingsDraft({ display_name: user?.display_name || "", bio: user?.bio || "", avatar_url: user?.avatar_url || "" });
    setSettingsStatus("idle");
    setSettingsError("");
    setIsSettingsOpen(true);
  }

  async function saveSettings(event) {
    event.preventDefault();
    const displayName = settingsDraft.display_name.trim();
    if (!displayName) {
      setSettingsError("Display name can't be empty.");
      setSettingsStatus("error");
      return;
    }
    setSettingsStatus("saving");
    setSettingsError("");
    try {
      const { user: updated } = await api("/users/me", {
        method: "PATCH",
        body: { display_name: displayName, bio: settingsDraft.bio.trim(), avatar_url: settingsDraft.avatar_url.trim() },
      });
      updateUser(updated);
      setSettingsDraft({ display_name: updated.display_name || "", bio: updated.bio || "", avatar_url: updated.avatar_url || "" });
      setSettingsStatus("saved");
    } catch (error) {
      setSettingsError(describeError(error));
      setSettingsStatus("error");
    }
  }

  // Runs `action` once per key at a time, so a double click can't fire two requests.
  async function runOnce(key, action) {
    if (pendingActions[key]) return;
    setPendingActions((current) => ({ ...current, [key]: true }));
    try {
      await action();
    } finally {
      setPendingActions((current) => ({ ...current, [key]: false }));
    }
  }

  // Follow / unfollow an outfit's author. Updates every card by that author right away, and rolls back if the server refuses.
  function toggleFollowAuthor(outfit) {
    const author = outfit.author;
    if (!author?.username || author.username === username) return;
    const next = !outfit.author_followed;
    const setFollowed = (value) => setFriends((current) => current.map((o) => (
      o.author?.id === author.id ? { ...o, author_followed: value } : o
    )));
    return runOnce(`follow-${author.id}`, async () => {
      setFollowed(next);
      try {
        await api(`/users/${encodeURIComponent(author.username)}/follow`, { method: next ? "POST" : "DELETE" });
        setFriendsError("");
      } catch (error) {
        setFollowed(!next);
        setFriendsError(describeError(error));
      }
    });
  }

  async function rateFriendFit(friendId, rating) {
    try {
      const result = await api(`/outfits/${friendId}/rating`, {
        method: "PUT",
        body: { score: rating },
      });
      setFriends((current) => current.map((outfit) => (
        outfit.id === friendId ? { ...outfit, ...result } : outfit
      )));
      setFriendsError("");
    } catch (error) {
      setFriendsError(error instanceof Error ? error.message : "Could not save your rating.");
    }
  }

  async function addFriendComment(event, friendId) {
    event.preventDefault();
    const text = friendCommentDrafts[friendId]?.trim();
    if (!text) return;

    try {
      const { comment } = await api(`/outfits/${friendId}/comments`, {
        method: "POST",
        body: { body: text },
      });
      setFriendComments((current) => ({
        ...current,
        [friendId]: [...(current[friendId] || []), { ...comment, author: { username } }],
      }));
      setFriendCommentDrafts((current) => ({ ...current, [friendId]: "" }));
      setFriendsError("");
    } catch (error) {
      setFriendsError(error instanceof Error ? error.message : "Could not post your comment.");
    }
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

  async function markNotificationRead(notificationId) {
    setNotifications((current) => current.map((notification) => (
      notification.id === notificationId ? { ...notification, read: true } : notification
    )));
    try {
      await api.markNotificationRead(notificationId);
    } catch (error) {
      setNotificationsError(describeError(error));
    }
  }

  async function markAllNotificationsRead() {
    setNotifications((current) => current.map((notification) => ({ ...notification, read: true })));
    try {
      await api.markAllNotificationsRead();
    } catch (error) {
      setNotificationsError(describeError(error));
    }
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

  useEffect(() => {
    if (isCameraView && cameraStarted) return;

    window.clearTimeout(photoCountdownTimerRef.current);
    photoCountdownTimerRef.current = null;
  }, [isCameraView, cameraStarted]);

  useEffect(() => () => window.clearTimeout(photoCountdownTimerRef.current), []);

  function openFriendsView() {
    setActiveTab("Friends");
  }

  function changeFriendsScope(scope) {
    if (scope === friendsScope) return;
    setFriends([]);
    setFriendComments({});
    setFriendsScope(scope);
  }

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
    cancelPhotoCountdown();
    setCapturedFit(photoData);
    resetStyleAnalysis();
  }

  function cancelPhotoCountdown() {
    window.clearTimeout(photoCountdownTimerRef.current);
    photoCountdownTimerRef.current = null;
    setCountdownRemaining(null);
  }

  function startPhotoCountdown() {
    const deadline = Date.now() + photoCountdown * 1000;
    setCountdownRemaining(photoCountdown);

    function updateCountdown() {
      const remaining = Math.ceil((deadline - Date.now()) / 1000);
      if (remaining <= 0) {
        photoCountdownTimerRef.current = null;
        setCountdownRemaining(null);
        captureFit();
        return;
      }

      setCountdownRemaining(remaining);
      const nextTick = deadline - (remaining - 1) * 1000 - Date.now();
      photoCountdownTimerRef.current = window.setTimeout(updateCountdown, Math.max(1, nextTick));
    }

    photoCountdownTimerRef.current = window.setTimeout(updateCountdown, 1000);
  }

  async function startCamera() {
    setCountdownRemaining(null);
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
    cancelPhotoCountdown();
    setCapturedFit("");
    setCameraError("");
    setCameraStarted(false);
    setCameraStatus("idle");
    resetStyleAnalysis();
  }

  function backToPhotoChoices() {
    cancelPhotoCountdown();
    setCameraError("");
    setCameraSwitchMessage("");
    setCameraStarted(false);
    setCameraStatus("idle");
  }

  function handleLogout() {
    logout();
    navigate("/login");
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
      const photoData = await blobToDataUrl(await resizeImageFile(file));
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

    setAnalysisStatus("loading");
    setAnalysisError("");
    setAnalysisResult(null);
    try {
      const resizedPhoto = await blobToDataUrl(await resizeImageFile(dataUrlToBlob(capturedFit)));
      const dataUrlMatch = resizedPhoto.match(/^data:(image\/[^;]+);base64,(.+)$/s);
      if (!dataUrlMatch) throw new Error("This photo could not be prepared for analysis. Please upload it again.");

      const thumbnail = await makeThumbnail(resizedPhoto);
      const result = await api.analyzeFit({
        image: dataUrlMatch[2],
        mimeType: dataUrlMatch[1],
        targetStyle: normalizedTargetStyle,
        thumbnail: thumbnail || undefined,
        weather: currentWeather
          ? { tempF: currentWeather.tempF, description: currentWeather.description }
          : undefined,
      });
      setAnalysisResult(result);
      setAnalysisStatus("success");
    } catch (error) {
      setAnalysisError(describeError(error) || "Could not analyze this photo. Please try again.");
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
              onClick={() => item === "Today's Fit" ? openCameraPage() : item === "Friends" ? openFriendsView() : setActiveTab(item)}
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
                  {unreadNotificationCount > 0 && (
                    <button type="button" onClick={markAllNotificationsRead}>Mark all read</button>
                  )}
                </header>
                {notificationsError && <p className="notification-empty" role="alert">{notificationsError}</p>}
                {notifications.length ? (
                  <ul>
                    {notifications.map((notification) => {
                      const { label, message } = describeNotification(notification);
                      return (
                      <li key={notification.id}>
                        <button
                          className={`notification-item${notification.read ? "" : " unread"}`}
                          type="button"
                          role="menuitem"
                          onClick={() => markNotificationRead(notification.id)}
                        >
                          <span className="notification-type">{label}</span>
                          <span className="notification-copy">
                            <strong>{notification.actor.displayName || notification.actor.username}</strong>
                            <span>{message}</span>
                            <time>{timeAgo(notification.createdAt)}</time>
                          </span>
                          {!notification.read && <span className="notification-unread-dot" aria-label="Unread" />}
                        </button>
                      </li>
                      );
                    })}
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
              <span className="avatar" aria-hidden="true">
                {user?.avatar_url ? <img src={user.avatar_url} alt="" /> : usernameInitials}
              </span>
              <strong>{user?.display_name || username}</strong>
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
                    openSettings();
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
                  placeholder="e.g. relaxed autumn streetwear in warm neutrals"
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
            <div className="friends-scope" role="group" aria-label="Choose a feed">
              <button type="button" className={friendsScope === "following" ? "primary-btn" : "secondary-btn"} onClick={() => changeFriendsScope("following")}>
                Following
              </button>
              <button type="button" className={friendsScope === "all" ? "primary-btn" : "secondary-btn"} onClick={() => changeFriendsScope("all")}>
                Everyone
              </button>
            </div>
            {friendsStatus === "loading" && <p className="style-guide-status" role="status">Loading outfits…</p>}
            {friendsError && <p className="style-guide-error" role="alert">{friendsError}</p>}
            {friendsStatus === "success" && friends.length === 0 && (
              <p className="style-guide-status">
                {friendsScope === "following"
                  ? "You're not following anyone yet. Switch to Everyone to find outfits."
                  : "No outfits have been posted yet."}
              </p>
            )}
            <div className="friends-grid">
              {friends.map((outfit) => {
                const author = outfit.author || { username: "unknown" };
                const isOwnOutfit = author.username === username;
                const comments = friendComments[outfit.id] || [];
                const displayedRating = friendHoverRatings[outfit.id] ?? outfit.my_rating ?? 0;
                return (
                  <article className="friend-card" key={outfit.id}>
                    <header className="friend-card-header">
                      <div className="friend-avatar" aria-hidden="true">{author.username.slice(0, 2).toUpperCase()}</div>
                      <div>
                        <h2>{author.username}</h2>
                        <time dateTime={outfit.created_at}>
                          {new Date(outfit.created_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                        </time>
                      </div>
                      <div className="friend-card-actions">
                        {!isOwnOutfit && (
                          <button
                            type="button"
                            className={outfit.author_followed ? "secondary-btn friend-action active" : "secondary-btn friend-action"}
                            aria-pressed={Boolean(outfit.author_followed)}
                            disabled={Boolean(pendingActions[`follow-${author.id}`])}
                            onClick={() => toggleFollowAuthor(outfit)}
                          >
                            {outfit.author_followed ? "Following" : "Follow"}
                          </button>
                        )}
                      </div>
                    </header>
                    {outfit.cover_image_url && (
                      <img className="friend-photo" src={outfit.cover_image_url} alt={`${author.username} wearing ${outfit.title}`} />
                    )}
                    <div className="friend-card-details">
                      <h3>{outfit.title}</h3>
                      <p className="friend-fit-score">
                        <span>Rated:</span>
                        <strong>
                          {outfit.rating_count ? `${Number(outfit.rating_avg).toFixed(1)} / 5` : "No ratings yet"}
                        </strong>
                      </p>
                      {outfit.description && <p className="friend-style-worn">{outfit.description}</p>}

                      <section className="friend-rating-section" aria-label={`Rate ${author.username}'s outfit`}>
                        <div className="friend-rating-heading">
                          <span>Your rating</span>
                          <span>{outfit.my_rating ? `${outfit.my_rating} / 5` : isOwnOutfit ? "Your outfit" : "Not rated"}</span>
                        </div>
                        <div
                          className="friend-stars"
                          role="group"
                          aria-label={`Rate ${author.username} out of five stars`}
                          onMouseLeave={() => setFriendHoverRatings((current) => {
                            const next = { ...current };
                            delete next[outfit.id];
                            return next;
                          })}
                          onBlur={(event) => {
                            if (!event.currentTarget.contains(event.relatedTarget)) {
                              setFriendHoverRatings((current) => {
                                const next = { ...current };
                                delete next[outfit.id];
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
                              disabled={isOwnOutfit}
                              aria-label={`${star} ${star === 1 ? "star" : "stars"}`}
                              aria-pressed={outfit.my_rating === star}
                              onMouseEnter={() => setFriendHoverRatings((current) => ({ ...current, [outfit.id]: star }))}
                              onFocus={() => setFriendHoverRatings((current) => ({ ...current, [outfit.id]: star }))}
                              onClick={() => rateFriendFit(outfit.id, star)}
                            >
                              &#9733;
                            </button>
                          ))}
                        </div>
                      </section>

                      <section className="friend-comments" aria-label={`Comments on ${author.username}'s fit`}>
                        <h4>Comments</h4>
                        <ul>
                          {comments.map((comment) => (
                            <li key={comment.id}><strong>{comment.author?.username}</strong><p>{comment.body}</p></li>
                          ))}
                        </ul>
                        <form className="friend-comment-form" onSubmit={(event) => addFriendComment(event, outfit.id)}>
                          <label htmlFor={`friend-comment-${outfit.id}`}>Add a comment</label>
                          <input
                            id={`friend-comment-${outfit.id}`}
                            type="text"
                            value={friendCommentDrafts[outfit.id] || ""}
                            onChange={(event) => setFriendCommentDrafts((current) => ({ ...current, [outfit.id]: event.target.value }))}
                            placeholder="What do you think?"
                            autoComplete="off"
                            maxLength="240"
                          />
                          <button className="secondary-btn" type="submit" disabled={!friendCommentDrafts[outfit.id]?.trim()}>
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
                  <button type="button" className="primary-btn" onClick={openCameraPage}>
                    Start styling
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
                  <button type="button" className="link-btn" onClick={openFriendsView}>
                    See all
                  </button>
                </div>

                {recommendedStatus === "loading" && <p className="style-guide-status" role="status">Loading looks…</p>}
                {recommendedStatus === "error" && <p className="style-guide-error" role="alert">Could not load looks right now.</p>}
                {recommendedStatus === "success" && recommended.length === 0 && (
                  <p className="style-guide-status">No outfits posted yet.</p>
                )}
                <div className="recommend-grid">
                  {recommended.map((outfit) => (
                    <article key={outfit.id} className="look-card">
                      <div
                        className="look-image"
                        style={outfit.cover_image_url ? { backgroundImage: `url(${outfit.cover_image_url})` } : undefined}
                        aria-label={outfit.title}
                      />
                      <div className="look-meta">
                        <div className="look-row">
                          <span>@{outfit.author?.username}</span>
                          <strong>{outfit.rating_count ? `${Number(outfit.rating_avg).toFixed(1)} / 5` : "New"}</strong>
                        </div>
                        <h3>{outfit.title}</h3>
                        <p>{outfit.tags?.[0] || outfit.occasion || "Fresh look"}</p>
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

            {pastFitsStatus === "loading" && <p className="style-guide-status" role="status">Loading your fits…</p>}
            {pastFitsStatus === "error" && <p className="style-guide-error" role="alert">{pastFitsError}</p>}
            {pastFitsStatus === "success" && pastFits.length === 0 && (
              <p className="style-guide-status">No fits yet. Take your first photo on Today's Fit!</p>
            )}

            <div className="history-list">
              {pastFits.map((fit) => (
                <article key={fit.id} className="history-item">
                  {fit.thumbnail ? (
                    <img className="history-image" src={fit.thumbnail} alt={`${fit.detectedStyle || "Outfit"} outfit`} />
                  ) : (
                    <div className="history-image" role="img" aria-label="No photo saved" />
                  )}
                  <div className="history-copy">
                    <div className="history-topline">
                      <span>{new Date(fit.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
                    </div>
                    <div className="history-rating">
                      <span>Rating</span>
                      <strong>{fit.score === null ? "—" : fit.score.toFixed(1)} / 10</strong>
                    </div>
                    <h3>{fit.detectedStyle || "style"}</h3>
                    <p>{fit.verdict}</p>
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
              <button type="button" className="link-btn" onClick={() => setActiveTab("Style Guide")}>
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
                    {!capturedFit && cameraStarted && isPhotoCountdownActive && (
                      <div className="camera-countdown-overlay" role="status" aria-live="assertive">
                        <strong>{countdownRemaining}</strong>
                        <span>Get ready</span>
                      </div>
                    )}
                  </div>

                  <div className="camera-controls">
                    {!capturedFit && cameraStarted && cameraStatus === "ready" && (
                      <button type="button" className="secondary-btn switch-camera-button" onClick={switchCamera}>
                        <span aria-hidden="true">⇄</span>
                        Switch camera
                      </button>
                    )}
                    {!capturedFit && cameraStarted && cameraStatus === "ready" && (
                      <fieldset className="camera-countdown-picker" disabled={isPhotoCountdownActive}>
                        <legend>Photo timer</legend>
                        <div className="camera-countdown-options">
                          {[3, 5, 10].map((seconds) => (
                            <label key={seconds}>
                              <input
                                type="radio"
                                name="photo-countdown"
                                value={seconds}
                                checked={photoCountdown === seconds}
                                onChange={() => setPhotoCountdown(seconds)}
                              />
                              <span>{seconds} sec</span>
                            </label>
                          ))}
                        </div>
                      </fieldset>
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
                        onClick={isPhotoCountdownActive ? cancelPhotoCountdown : startPhotoCountdown}
                        disabled={cameraStatus !== "ready"}
                      >
                        <span className="shutter-icon" aria-hidden="true" />
                        {isPhotoCountdownActive ? "Cancel countdown" : "Take fit photo"}
                      </button>
                    ) : null}
                    </div>
                  {cameraSwitchMessage && <p className="camera-switch-message" role="status">{cameraSwitchMessage}</p>}
                </section>

                {analysisResult?.colors?.length > 0 && !noOutfitDetected && (
                  <div
                    className="outfit-color-bar"
                    role="img"
                    aria-label={`Outfit color palette: ${analysisResult.colors.join(", ")}`}
                  >
                    {analysisResult.colors.slice(0, 4).map((color, index) => (
                      <span
                        key={`${color}-${index}`}
                        style={{ backgroundColor: getColorSwatch(color, index) }}
                        aria-hidden="true"
                      />
                    ))}
                  </div>
                )}

                {capturedFit ? (
                  <section className="fit-feedback">
                    <p className="mini-label">After the photo</p>
                    <h2>{analysisResult ? "Your fit, reviewed" : "Ready for your review?"}</h2>
                    <form className="analysis-form" onSubmit={analyzeTargetStyle}>
                      <label htmlFor="target-style">What style are you going for?</label>
                      <div className="analysis-form-row">
                        <input
                          id="target-style"
                          className="style-guide-input"
                          value={targetStyle}
                          onChange={(event) => setTargetStyle(event.target.value)}
                          placeholder="e.g. relaxed autumn streetwear"
                          maxLength={300}
                          required
                        />
                        <button className="primary-btn" type="submit" disabled={analysisStatus === "loading" || !targetStyle.trim()}>
                          {analysisStatus === "loading" ? "Analyzing…" : analysisResult ? "Analyze again" : "Analyze my fit"}
                        </button>
                      </div>
                    </form>
                    {analysisStatus === "loading" && <p className="style-guide-status" role="status">Your stylist is taking a look…</p>}
                    {analysisError && <p className="style-guide-error" role="alert">{analysisError}</p>}
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
                    <strong>{fitScore === null ? "—" : fitScore.toFixed(1)}</strong>
                    <span>/ 10</span>
                  </div>
                  {!capturedFit && <p>Take a photo of your fit to reveal your style score.</p>}
                  {noOutfitDetected && <p role="status">No outfit detected. Try another photo with your full outfit in view.</p>}
                  {!analysisResult && capturedFit ? (
                    <p>Enter a target style to get outfit feedback.</p>
                  ) : null}
                  {analysisResult?.verdict && <p className="analysis-verdict">{analysisResult.verdict}</p>}
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
                      <p className="mini-label">What is your fit giving?</p>
                    </div>
                  </div>
                  {analysisResult?.detectedStyle && !noOutfitDetected ? (
                    <div className="gemini-style-match">
                      <p className="mini-label">Closest style match</p>
                      <h3>{analysisResult.detectedStyle}</h3>
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
            {settingsDraft && (
              <form className="account-settings-form" onSubmit={saveSettings}>
                <label>
                  Display name
                  <input
                    type="text"
                    value={settingsDraft.display_name}
                    maxLength={60}
                    required
                    onChange={(event) => setSettingsDraft((draft) => ({ ...draft, display_name: event.target.value }))}
                  />
                </label>
                <label>
                  Bio
                  <textarea
                    rows={3}
                    value={settingsDraft.bio}
                    maxLength={300}
                    onChange={(event) => setSettingsDraft((draft) => ({ ...draft, bio: event.target.value }))}
                  />
                </label>
                <label>
                  Avatar image URL (leave empty for none)
                  <input
                    type="url"
                    placeholder="https://…"
                    value={settingsDraft.avatar_url}
                    onChange={(event) => setSettingsDraft((draft) => ({ ...draft, avatar_url: event.target.value }))}
                  />
                </label>
                {settingsError && <p className="style-guide-error" role="alert">{settingsError}</p>}
                {settingsStatus === "saved" && <p className="style-guide-status" role="status">Saved.</p>}
                <div className="account-settings-actions">
                  <button className="primary-btn" type="submit" disabled={settingsStatus === "saving"}>
                    {settingsStatus === "saving" ? "Saving…" : "Save changes"}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
    </div>
  );
}