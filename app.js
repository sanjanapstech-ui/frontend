const DEFAULT_BACKEND_BASE_URL = "http://localhost:3000";

/** @type {HTMLButtonElement} */
const recordBtn = document.getElementById("recordBtn");
/** @type {HTMLSpanElement} */
const recordBtnText = document.getElementById("recordBtnText");
/** @type {HTMLButtonElement} */
const uploadBtn = document.getElementById("uploadBtn");
/** @type {HTMLInputElement} */
const fileInput = document.getElementById("fileInput");
/** @type {HTMLDivElement} */
const dropzone = document.getElementById("dropzone");
/** @type {HTMLAudioElement} */
const audioPlayer = document.getElementById("audioPlayer");
/** @type {HTMLDivElement} */
const audioMeta = document.getElementById("audioMeta");
/** @type {HTMLDivElement} */
const statusText = document.getElementById("statusText");
/** @type {HTMLDivElement} */
const recordingBadge = document.getElementById("recordingBadge");
/** @type {HTMLSpanElement} */
const recordingTimer = document.getElementById("recordingTimer");
/** @type {HTMLButtonElement} */
const transcribeBtn = document.getElementById("transcribeBtn");
/** @type {HTMLButtonElement} */
const sendBtn = document.getElementById("sendBtn");
/** @type {HTMLTextAreaElement} */
const transcriptText = document.getElementById("transcriptText");

let backendBaseUrl = readBackendBaseUrl();

/** @type {{blob: Blob, fileName: string, mimeType: string, durationMs?: number} | null} */
let currentAudio = null;
let currentAudioUrl = null;

/** @type {MediaRecorder | null} */
let mediaRecorder = null;
/** @type {BlobPart[]} */
let recordingChunks = [];
/** @type {number | null} */
let recordingStartMs = null;
/** @type {number | null} */
let recordingTimerInterval = null;

updateUi();

recordBtn.addEventListener("click", async () => {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    stopRecording();
    return;
  }
  await startRecording();
});

uploadBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  if (!file.type?.startsWith("audio/")) {
    setStatus("Please choose an audio file.", { tone: "error" });
    fileInput.value = "";
    return;
  }
  setAudioFromFile(file);
});

dropzone.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") fileInput.click();
});
dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("dragOver");
});
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragOver"));
dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragOver");
  const file = e.dataTransfer?.files?.[0];
  if (!file) return;
  if (!file.type?.startsWith("audio/")) {
    setStatus("Drop an audio file (audio/*).", { tone: "error" });
    return;
  }
  setAudioFromFile(file);
});

transcribeBtn.addEventListener("click", async () => {
  if (!currentAudio) return;
  if (mediaRecorder && mediaRecorder.state === "recording") return;

  transcribeBtn.disabled = true;
  sendBtn.disabled = true;
  setStatus("Transcribing…", { tone: "info" });

  try {
    const form = new FormData();
    form.append("audio", currentAudio.blob, currentAudio.fileName);

    const res = await fetch(joinUrl(backendBaseUrl, "/api/transcribe"), {
      method: "POST",
      body: form,
    });

    if (!res.ok) {
      const body = await safeReadText(res);
      throw new Error(`Transcription failed (${res.status}): ${body || res.statusText}`);
    }

    const data = await res.json().catch(() => ({}));
    const text = typeof data.transcription === "string" ? data.transcription : typeof data.text === "string" ? data.text : "";
    transcriptText.value = text || "";
    setStatus(text ? "Transcription ready." : "No transcription returned.", { tone: text ? "success" : "info" });
  } catch (err) {
    setStatus(err instanceof Error ? err.message : "Transcription failed.", { tone: "error" });
  } finally {
    updateUi();
  }
});

sendBtn.addEventListener("click", async () => {
  if (!currentAudio) return;
  if (mediaRecorder && mediaRecorder.state === "recording") return;

  sendBtn.disabled = true;
  setStatus("Sending…", { tone: "info" });

  try {
    const payload = {
      transcription: transcriptText.value || "",
      mimeType: currentAudio.mimeType,
      fileName: currentAudio.fileName,
      durationMs: currentAudio.durationMs ?? null,
      clientTs: new Date().toISOString(),
    };

    const form = new FormData();
    form.append("audio", currentAudio.blob, currentAudio.fileName);
    form.append("meta", new Blob([JSON.stringify(payload)], { type: "application/json" }), "meta.json");

    const res = await fetch(joinUrl(backendBaseUrl, "/api/submit"), {
      method: "POST",
      body: form,
    });

    if (!res.ok) {
      const body = await safeReadText(res);
      throw new Error(`Send failed (${res.status}): ${body || res.statusText}`);
    }

    setStatus("Sent successfully.", { tone: "success" });
  } catch (err) {
    setStatus(err instanceof Error ? err.message : "Send failed.", { tone: "error" });
  } finally {
    updateUi();
  }
});

audioPlayer.addEventListener("loadedmetadata", () => {
  if (!currentAudio) return;
  if (!Number.isFinite(audioPlayer.duration)) return;
  currentAudio.durationMs = Math.round(audioPlayer.duration * 1000);
  renderAudioMeta();
});

function readBackendBaseUrl() {
  const fromWindow = window.NUMENTRIX_CONFIG?.backendBaseUrl;
  const fromStorage = localStorage.getItem("numentrix_backend_base_url");
  const raw = (typeof fromWindow === "string" && fromWindow.trim()) || (typeof fromStorage === "string" && fromStorage.trim());
  if (!raw) return DEFAULT_BACKEND_BASE_URL;
  try {
    return new URL(raw).origin;
  } catch {
    return DEFAULT_BACKEND_BASE_URL;
  }
}

function updateUi() {
  const isRecording = mediaRecorder?.state === "recording";
  recordBtnText.textContent = isRecording ? "Stop" : "Record";
  uploadBtn.disabled = isRecording;
  transcribeBtn.disabled = !currentAudio || isRecording;
  sendBtn.disabled = !currentAudio || isRecording || !transcriptText.value.trim();

  if (!currentAudio) {
    audioPlayer.removeAttribute("src");
    audioPlayer.load();
  }
  renderAudioMeta();
}

function renderAudioMeta() {
  if (!currentAudio) {
    audioMeta.textContent = "No audio selected";
    return;
  }
  const parts = [];
  parts.push(currentAudio.fileName);
  if (currentAudio.durationMs != null) parts.push(formatMs(currentAudio.durationMs));
  if (currentAudio.mimeType) parts.push(currentAudio.mimeType);
  audioMeta.textContent = parts.join(" • ");
}

function setStatus(message, { tone }) {
  statusText.textContent = message;
  statusText.style.color =
    tone === "error"
      ? "var(--status-error)"
      : tone === "success"
        ? "var(--status-success)"
        : "var(--status-info)";
}

function setAudioFromFile(file) {
  stopRecording();
  transcriptText.value = "";

  file.arrayBuffer().then(
    (buf) => {
      const blob = new Blob([buf], { type: file.type || "audio/*" });
      setCurrentAudio({ blob, fileName: file.name || "upload", mimeType: blob.type || file.type || "" });
      setStatus("Audio ready.", { tone: "success" });
    },
    () => setStatus("Failed to read audio file.", { tone: "error" }),
  );
}

function setCurrentAudio(audio) {
  currentAudio = audio;
  if (currentAudioUrl) URL.revokeObjectURL(currentAudioUrl);
  currentAudioUrl = URL.createObjectURL(audio.blob);
  audioPlayer.src = currentAudioUrl;
  audioPlayer.load();
  updateUi();
}

async function startRecording() {
  stopRecording();
  transcriptText.value = "";

  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus("Recording is not supported in this browser.", { tone: "error" });
    return;
  }

  setStatus("Requesting microphone permission…", { tone: "info" });

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    setStatus("Microphone permission denied.", { tone: "error" });
    return;
  }

  const mimeType = pickRecordingMimeType();
  try {
    mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  } catch {
    stream.getTracks().forEach((t) => t.stop());
    setStatus("Unable to start recorder.", { tone: "error" });
    return;
  }

  recordingChunks = [];
  mediaRecorder.addEventListener("dataavailable", (e) => {
    if (e.data && e.data.size > 0) recordingChunks.push(e.data);
  });

  mediaRecorder.addEventListener("stop", () => {
    try {
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      // ignore
    }

    recordingBadge.hidden = true;
    if (recordingTimerInterval) window.clearInterval(recordingTimerInterval);
    recordingTimerInterval = null;
    recordingStartMs = null;

    const blobType = mediaRecorder?.mimeType || mimeType || "audio/webm";
    const blob = new Blob(recordingChunks, { type: blobType });
    recordingChunks = [];
    mediaRecorder = null;

    if (blob.size === 0) {
      setStatus("Recording was empty.", { tone: "error" });
      updateUi();
      return;
    }

    const ext = blobType.includes("ogg") ? "ogg" : blobType.includes("mp4") ? "mp4" : "webm";
    const name = `recording-${new Date().toISOString().replace(/[:.]/g, "-")}.${ext}`;
    setCurrentAudio({ blob, fileName: name, mimeType: blobType });
    setStatus("Recording ready.", { tone: "success" });
  });

  recordingStartMs = Date.now();
  recordingBadge.hidden = false;
  tickRecordingTimer();
  recordingTimerInterval = window.setInterval(tickRecordingTimer, 250);

  try {
    mediaRecorder.start(250);
  } catch {
    stopRecording();
    setStatus("Failed to start recording.", { tone: "error" });
    return;
  }

  setStatus("Recording…", { tone: "info" });
  updateUi();
}

function stopRecording() {
  if (!mediaRecorder) return;
  try {
    if (mediaRecorder.state === "recording") mediaRecorder.stop();
  } catch {
    // ignore
  }
}

function tickRecordingTimer() {
  if (!recordingStartMs) {
    recordingTimer.textContent = "00:00";
    return;
  }
  const elapsed = Date.now() - recordingStartMs;
  recordingTimer.textContent = formatMs(elapsed);
}

function pickRecordingMimeType() {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/ogg", "audio/mp4"];
  if (!("MediaRecorder" in window)) return "";
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

function formatMs(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function joinUrl(base, path) {
  try {
    return new URL(path, base.endsWith("/") ? base : `${base}/`).toString();
  } catch {
    return `${base}${path}`;
  }
}

async function safeReadText(res) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
