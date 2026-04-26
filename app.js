const DEFAULT_BACKEND_BASE_URL = "http://localhost:3000";

/** @type {HTMLButtonElement} */
const modeVoiceBtn = document.getElementById("modeVoiceBtn");
/** @type {HTMLButtonElement} */
const modeTextBtn = document.getElementById("modeTextBtn");
/** @type {HTMLElement} */
const voiceFlow = document.getElementById("voiceFlow");
/** @type {HTMLElement} */
const textFlow = document.getElementById("textFlow");

/** @type {HTMLDivElement} */
const statusText = document.getElementById("statusText");

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
const recordingBadge = document.getElementById("recordingBadge");
/** @type {HTMLSpanElement} */
const recordingTimer = document.getElementById("recordingTimer");

/** @type {HTMLButtonElement} */
const voiceGenerateBtn = document.getElementById("voiceGenerateBtn");
/** @type {HTMLTextAreaElement} */
const voiceTranscriptText = document.getElementById("voiceTranscriptText");

/** @type {HTMLTextAreaElement} */
const textInputText = document.getElementById("textInputText");
/** @type {HTMLButtonElement} */
const textGenerateBtn = document.getElementById("textGenerateBtn");

const backendBaseUrl = readBackendBaseUrl();

/** @type {"voice" | "text" | null} */
let mode = null;
let isTranscribing = false;
let isGenerating = false;

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

applyMode(null);
updateUi();

modeVoiceBtn.addEventListener("click", () => applyMode("voice"));
modeTextBtn.addEventListener("click", () => applyMode("text"));

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

textInputText.addEventListener("input", () => updateUi());

voiceGenerateBtn.addEventListener("click", async () => {
  if (!currentAudio || mode !== "voice" || isTranscribing || isGenerating) return;
  if (mediaRecorder && mediaRecorder.state === "recording") return;

  isTranscribing = true;
  setStatus("Transcribing...", { tone: "info" });
  updateUi();

  try {
    const transcription = await transcribeCurrentAudio();
    voiceTranscriptText.value = transcription;

    isTranscribing = false;
    isGenerating = true;
    setStatus("Generating...", { tone: "info" });
    updateUi();

    const content = await generateContent({ input: transcription, source: "voice" });
    voiceTranscriptText.value = `${transcription}\n\n${content}`;
    setStatus("Content ready.", { tone: "success" });
  } catch (err) {
    setStatus(err instanceof Error ? err.message : "Generate failed.", { tone: "error" });
  } finally {
    isTranscribing = false;
    isGenerating = false;
    updateUi();
  }
});

textGenerateBtn.addEventListener("click", async () => {
  const input = textInputText.value.trim();
  if (!input || mode !== "text" || isGenerating) return;

  isGenerating = true;
  setStatus("Generating...", { tone: "info" });
  updateUi();

  try {
    const content = await generateContent({ input, source: "text" });
    textInputText.value = content;
    setStatus("Content ready.", { tone: "success" });
  } catch (err) {
    setStatus(err instanceof Error ? err.message : "Generate failed.", { tone: "error" });
  } finally {
    isGenerating = false;
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
  const raw =
    (typeof fromWindow === "string" && fromWindow.trim()) || (typeof fromStorage === "string" && fromStorage.trim());
  if (!raw) return DEFAULT_BACKEND_BASE_URL;
  try {
    return new URL(raw).origin;
  } catch {
    return DEFAULT_BACKEND_BASE_URL;
  }
}

function applyMode(nextMode) {
  mode = nextMode;

  modeVoiceBtn.setAttribute("aria-selected", mode === "voice" ? "true" : "false");
  modeTextBtn.setAttribute("aria-selected", mode === "text" ? "true" : "false");

  voiceFlow.hidden = mode !== "voice";
  textFlow.hidden = mode !== "text";

  clearStatus();
  updateUi();
}

function updateUi() {
  const hasMode = mode !== null;
  const isRecording = mediaRecorder?.state === "recording";

  recordBtnText.textContent = isRecording ? "Stop" : "Record";

  recordBtn.disabled = !hasMode || mode !== "voice" || isTranscribing || isGenerating;
  uploadBtn.disabled = !hasMode || mode !== "voice" || isRecording || isTranscribing || isGenerating;

  voiceGenerateBtn.disabled =
    !hasMode || mode !== "voice" || !currentAudio || isRecording || isTranscribing || isGenerating;

  textGenerateBtn.disabled = !hasMode || mode !== "text" || isGenerating || !textInputText.value.trim();

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
  const parts = [currentAudio.fileName];
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

function clearStatus() {
  statusText.textContent = "";
  statusText.style.color = "var(--muted)";
}

function setAudioFromFile(file) {
  stopRecording();
  voiceTranscriptText.value = "";

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
  voiceTranscriptText.value = "";

  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus("Recording is not supported in this browser.", { tone: "error" });
    return;
  }

  setStatus("Requesting microphone permission...", { tone: "info" });

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

  setStatus("Recording...", { tone: "info" });
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

async function transcribeCurrentAudio() {
  if (!currentAudio) throw new Error("No audio selected.");

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
  const text =
    typeof data.transcription === "string" ? data.transcription : typeof data.text === "string" ? data.text : "";
  if (!text) throw new Error("No transcription returned from backend.");
  return text;
}

async function generateContent({ input, source }) {
  try {
    const res = await fetch(joinUrl(backendBaseUrl, "/api/generate"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input, source }),
    });

    if (!res.ok) {
      const body = await safeReadText(res);
      throw new Error(`Generate failed (${res.status}): ${body || res.statusText}`);
    }

    const data = await res.json().catch(() => ({}));
    const content =
      typeof data.content === "string"
        ? data.content
        : typeof data.output === "string"
          ? data.output
          : typeof data.text === "string"
            ? data.text
            : "";

    if (!content) throw new Error("No content returned from backend.");
    return content;
  } catch {
    const short = input.length > 420 ? `${input.slice(0, 420)}…` : input;
    return `Preview (no backend yet)\n\nSource: ${source}\n\n${short}`;
  }
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
