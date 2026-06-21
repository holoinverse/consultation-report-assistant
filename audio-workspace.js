(function initializeAudioWorkspace(global) {
  "use strict";

  const store = global.MediaLibraryStore;
  const elements = {
    start: document.querySelector("#startRecording"),
    pause: document.querySelector("#pauseRecording"),
    resume: document.querySelector("#resumeRecording"),
    stop: document.querySelector("#stopRecording"),
    status: document.querySelector("#recordingStatus"),
    duration: document.querySelector("#recordingDuration"),
    dialog: document.querySelector("#recordingNameDialog"),
    recordingName: document.querySelector("#recordingName"),
    saveSummary: document.querySelector("#recordingSaveSummary"),
    save: document.querySelector("#saveRecording"),
    discard: document.querySelector("#discardRecording"),
    closeDialog: document.querySelector("#closeRecordingDialog"),
    renameDialog: document.querySelector("#renameRecordingDialog"),
    renameName: document.querySelector("#renameRecordingName"),
    confirmRename: document.querySelector("#confirmRenameRecording"),
    cancelRename: document.querySelector("#cancelRenameRecording"),
    closeRename: document.querySelector("#closeRenameRecording"),
    count: document.querySelector("#audioLibraryCount"),
    statusMessage: document.querySelector("#audioLibraryStatus"),
    list: document.querySelector("#audioLibraryList"),
    player: document.querySelector("#libraryPlayer"),
    playerName: document.querySelector("#libraryPlayerName"),
    playerMeta: document.querySelector("#libraryPlayerMeta"),
    audio: document.querySelector("#libraryAudioElement"),
    playToggle: document.querySelector("#libraryPlayToggle"),
    currentTime: document.querySelector("#libraryCurrentTime"),
    seek: document.querySelector("#librarySeek"),
    playerDuration: document.querySelector("#libraryDuration"),
    uploadedAudio: document.querySelector("#audioPlayer")
  };

  if (!store || !elements.start) return;

  let recorder = null;
  let microphoneStream = null;
  let chunks = [];
  let timer = null;
  let accumulatedMilliseconds = 0;
  let activeStartedAt = 0;
  let pendingRecording = null;
  let libraryItems = [];
  let selectedItemId = "";
  let playbackUrl = "";
  let renamingItemId = "";

  function toast(message) {
    if (typeof global.showToast === "function") global.showToast(message);
  }

  function escapeHTML(value) {
    return String(value || "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  }

  function fileSize(bytes) {
    if (!bytes) return "0 KB";
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function clock(seconds, includeHours = false) {
    const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const remainder = Math.floor(safe % 60);
    return includeHours || hours ? [hours, minutes, remainder].map(value => String(value).padStart(2, "0")).join(":") : `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  }

  function recordingMilliseconds() {
    return accumulatedMilliseconds + (activeStartedAt ? Date.now() - activeStartedAt : 0);
  }

  function updateRecordingTimer() {
    const seconds = recordingMilliseconds() / 1000;
    elements.duration.textContent = clock(seconds, true);
    elements.duration.dateTime = `PT${Math.round(seconds)}S`;
  }

  function setRecordingStatus(mode, title, detail) {
    elements.status.classList.toggle("recording", mode === "recording");
    elements.status.classList.toggle("paused", mode === "paused");
    elements.status.querySelector("strong").textContent = title;
    elements.status.querySelector("small").textContent = detail;
  }

  function setRecordingButtons(mode) {
    elements.start.disabled = mode !== "idle";
    elements.pause.disabled = mode !== "recording";
    elements.resume.disabled = mode !== "paused";
    elements.stop.disabled = !["recording", "paused"].includes(mode);
  }

  function supportedMimeType() {
    const types = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"];
    return types.find(type => global.MediaRecorder?.isTypeSupported?.(type)) || "";
  }

  function stopMicrophoneTracks() {
    microphoneStream?.getTracks().forEach(track => track.stop());
    microphoneStream = null;
  }

  function stopTimer() {
    clearInterval(timer);
    timer = null;
  }

  function resetRecorder() {
    stopTimer();
    stopMicrophoneTracks();
    recorder = null;
    chunks = [];
    accumulatedMilliseconds = 0;
    activeStartedAt = 0;
    updateRecordingTimer();
    setRecordingButtons("idle");
    setRecordingStatus("idle", "Ready to record", "Microphone access is requested only when recording starts.");
  }

  async function startRecording() {
    if (!global.MediaRecorder || !navigator.mediaDevices?.getUserMedia) {
      setRecordingStatus("idle", "Recording unavailable", "This browser does not support microphone recording.");
      toast("Microphone recording is not supported in this browser.");
      return;
    }
    try {
      elements.start.disabled = true;
      setRecordingStatus("idle", "Requesting microphone access…", "Your audio remains in this browser.");
      elements.uploadedAudio?.pause();
      elements.audio.pause();
      microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = supportedMimeType();
      recorder = mimeType ? new MediaRecorder(microphoneStream, { mimeType }) : new MediaRecorder(microphoneStream);
      chunks = [];
      accumulatedMilliseconds = 0;
      activeStartedAt = Date.now();
      recorder.addEventListener("dataavailable", event => { if (event.data?.size) chunks.push(event.data); });
      recorder.addEventListener("stop", finishRecording, { once: true });
      recorder.addEventListener("error", () => {
        toast("The recording stopped because the browser reported an audio error.");
        resetRecorder();
      }, { once: true });
      recorder.start(1000);
      timer = setInterval(updateRecordingTimer, 250);
      updateRecordingTimer();
      setRecordingButtons("recording");
      setRecordingStatus("recording", "Recording", "Keep this tab open while capturing audio.");
    } catch (error) {
      resetRecorder();
      const denied = error?.name === "NotAllowedError" || error?.name === "SecurityError";
      setRecordingStatus("idle", denied ? "Microphone permission needed" : "Recording could not start", denied ? "Allow microphone access, then try again." : "Check that a microphone is available.");
      toast(denied ? "Microphone access was not granted." : "The microphone could not be started.");
    }
  }

  function pauseRecording() {
    if (recorder?.state !== "recording") return;
    recorder.pause();
    accumulatedMilliseconds += Date.now() - activeStartedAt;
    activeStartedAt = 0;
    updateRecordingTimer();
    setRecordingButtons("paused");
    setRecordingStatus("paused", "Recording paused", "Resume when you are ready to continue.");
  }

  function resumeRecording() {
    if (recorder?.state !== "paused") return;
    recorder.resume();
    activeStartedAt = Date.now();
    setRecordingButtons("recording");
    setRecordingStatus("recording", "Recording", "Keep this tab open while capturing audio.");
  }

  function stopRecording() {
    if (!recorder || recorder.state === "inactive") return;
    if (activeStartedAt) accumulatedMilliseconds += Date.now() - activeStartedAt;
    activeStartedAt = 0;
    updateRecordingTimer();
    stopTimer();
    setRecordingButtons("processing");
    setRecordingStatus("idle", "Preparing recording…", "Your recording is being prepared locally.");
    recorder.stop();
    stopMicrophoneTracks();
  }

  function finishRecording() {
    const duration = accumulatedMilliseconds / 1000;
    const mimeType = recorder?.mimeType || chunks[0]?.type || "audio/webm";
    const blob = new Blob(chunks, { type: mimeType });
    recorder = null;
    chunks = [];
    if (!blob.size) {
      resetRecorder();
      toast("No audio data was captured. Please try again.");
      return;
    }
    pendingRecording = { blob, duration, mimeType };
    elements.recordingName.value = `Consultation Recording - ${new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date())}`;
    elements.saveSummary.textContent = `${clock(duration, true)} · ${fileSize(blob.size)} · Ready to save locally`;
    if (typeof elements.dialog.showModal === "function") elements.dialog.showModal();
    else elements.dialog.setAttribute("open", "");
    elements.recordingName.focus();
    elements.recordingName.select();
  }

  function closeRecordingDialog() {
    if (typeof elements.dialog.close === "function") elements.dialog.close();
    else elements.dialog.removeAttribute("open");
  }

  function discardRecording() {
    pendingRecording = null;
    closeRecordingDialog();
    resetRecorder();
    toast("Recording discarded.");
  }

  async function saveRecording() {
    const name = elements.recordingName.value.trim();
    if (!pendingRecording || !name) { elements.recordingName.focus(); toast("Enter a recording name before saving."); return; }
    elements.save.disabled = true;
    try {
      await store.save({
        type: "audio",
        name,
        blob: pendingRecording.blob,
        mimeType: pendingRecording.mimeType,
        metadata: { duration: pendingRecording.duration },
        source: "recording"
      });
      pendingRecording = null;
      closeRecordingDialog();
      resetRecorder();
      await loadLibrary();
      toast("Recording saved to the local Audio Library.");
    } catch (error) {
      const quota = error?.name === "QuotaExceededError";
      toast(quota ? "Browser storage is full. Remove older recordings and try again." : "The recording could not be saved locally.");
    } finally {
      elements.save.disabled = false;
    }
  }

  function recordingDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Unknown date" : new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
  }

  function renderLibrary() {
    elements.count.textContent = `(${libraryItems.length})`;
    elements.statusMessage.hidden = libraryItems.length > 0;
    elements.statusMessage.textContent = libraryItems.length ? "" : "No saved recordings yet. Start a recording to build your local library.";
    elements.list.innerHTML = libraryItems.map(item => `
      <article class="media-item" data-media-id="${escapeHTML(item.id)}">
        <div class="media-item-main"><span class="audio-file-icon" aria-hidden="true">♪</span><div><strong>${escapeHTML(item.name)}</strong><div class="media-item-meta"><span>${escapeHTML(recordingDate(item.createdAt))}</span><span>${escapeHTML(clock(Number(item.metadata?.duration) || 0, true))}</span><span>${escapeHTML(fileSize(item.size))}</span></div></div></div>
        <div class="media-item-actions" aria-label="Actions for ${escapeHTML(item.name)}">
          <button type="button" data-media-action="play">Play</button><button type="button" data-media-action="rename">Rename</button><button type="button" data-media-action="duplicate">Duplicate</button><button type="button" data-media-action="delete">Delete</button>
        </div>
      </article>`).join("");
  }

  async function loadLibrary() {
    elements.statusMessage.hidden = false;
    elements.statusMessage.textContent = "Loading saved recordings…";
    try {
      libraryItems = await store.list("audio");
      renderLibrary();
    } catch {
      libraryItems = [];
      elements.count.textContent = "(0)";
      elements.list.innerHTML = "";
      elements.statusMessage.hidden = false;
      elements.statusMessage.textContent = "The local Audio Library is unavailable in this browser.";
    }
  }

  function releasePlaybackUrl() {
    if (playbackUrl) URL.revokeObjectURL(playbackUrl);
    playbackUrl = "";
  }

  function clearLibraryPlayer() {
    elements.audio.pause();
    elements.audio.removeAttribute("src");
    elements.audio.load();
    releasePlaybackUrl();
    selectedItemId = "";
    elements.player.hidden = true;
    elements.seek.value = "0";
    elements.seek.max = "0";
    elements.currentTime.textContent = "00:00";
    elements.playerDuration.textContent = "00:00";
    elements.playToggle.textContent = "▶";
    elements.playToggle.setAttribute("aria-label", "Play selected recording");
  }

  async function playItem(item) {
    if (selectedItemId === item.id) {
      if (elements.audio.paused) await elements.audio.play(); else elements.audio.pause();
      return;
    }
    elements.audio.pause();
    releasePlaybackUrl();
    selectedItemId = item.id;
    playbackUrl = URL.createObjectURL(item.blob);
    elements.audio.src = playbackUrl;
    elements.playerName.textContent = item.name;
    elements.playerMeta.textContent = `${recordingDate(item.createdAt)} · ${fileSize(item.size)}`;
    elements.player.hidden = false;
    elements.seek.max = String(Number(item.metadata?.duration) || 0);
    elements.playerDuration.textContent = clock(Number(item.metadata?.duration) || 0);
    elements.uploadedAudio?.pause();
    try { await elements.audio.play(); }
    catch { toast("Playback could not start automatically. Choose Play again."); }
  }

  function openRenameDialog(item) {
    renamingItemId = item.id;
    elements.renameName.value = item.name;
    if (typeof elements.renameDialog.showModal === "function") elements.renameDialog.showModal();
    else elements.renameDialog.setAttribute("open", "");
    elements.renameName.focus();
    elements.renameName.select();
  }

  function closeRenameDialog() {
    renamingItemId = "";
    if (typeof elements.renameDialog.close === "function") elements.renameDialog.close();
    else elements.renameDialog.removeAttribute("open");
  }

  async function confirmRename() {
    const name = elements.renameName.value.trim();
    const item = libraryItems.find(entry => entry.id === renamingItemId);
    if (!item || !name) { elements.renameName.focus(); toast("Enter a recording name."); return; }
    elements.confirmRename.disabled = true;
    try {
      await store.update(item.id, { name });
      if (selectedItemId === item.id) elements.playerName.textContent = name;
      closeRenameDialog();
      await loadLibrary();
      toast("Recording renamed.");
    } catch {
      toast("The recording could not be renamed.");
    } finally {
      elements.confirmRename.disabled = false;
    }
  }

  async function handleLibraryAction(event) {
    const button = event.target.closest("[data-media-action]");
    const row = event.target.closest("[data-media-id]");
    if (!button || !row) return;
    const item = libraryItems.find(entry => entry.id === row.dataset.mediaId);
    if (!item) return;
    try {
      if (button.dataset.mediaAction === "play") await playItem(item);
      if (button.dataset.mediaAction === "rename") openRenameDialog(item);
      if (button.dataset.mediaAction === "duplicate") {
        await store.duplicate(item.id);
        await loadLibrary();
        toast("Recording duplicated locally.");
      }
      if (button.dataset.mediaAction === "delete") {
        if (!global.confirm(`Delete “${item.name}”? This recording cannot be recovered.`)) return;
        if (selectedItemId === item.id) clearLibraryPlayer();
        await store.remove(item.id);
        await loadLibrary();
        toast("Recording deleted from this browser.");
      }
    } catch (error) {
      const quota = error?.name === "QuotaExceededError";
      toast(quota ? "Browser storage is full." : "The Audio Library could not complete that action.");
    }
  }

  elements.start.addEventListener("click", startRecording);
  elements.pause.addEventListener("click", pauseRecording);
  elements.resume.addEventListener("click", resumeRecording);
  elements.stop.addEventListener("click", stopRecording);
  elements.save.addEventListener("click", saveRecording);
  elements.discard.addEventListener("click", discardRecording);
  elements.closeDialog.addEventListener("click", discardRecording);
  elements.dialog.addEventListener("cancel", event => { event.preventDefault(); discardRecording(); });
  elements.confirmRename.addEventListener("click", confirmRename);
  elements.cancelRename.addEventListener("click", closeRenameDialog);
  elements.closeRename.addEventListener("click", closeRenameDialog);
  elements.renameDialog.addEventListener("cancel", event => { event.preventDefault(); closeRenameDialog(); });
  elements.list.addEventListener("click", handleLibraryAction);
  elements.playToggle.addEventListener("click", () => {
    if (!elements.audio.src) return;
    if (elements.audio.paused) elements.audio.play().catch(() => toast("Playback could not be started."));
    else elements.audio.pause();
  });
  elements.seek.addEventListener("input", () => { if (Number.isFinite(elements.audio.duration)) elements.audio.currentTime = Number(elements.seek.value); });
  elements.audio.addEventListener("loadedmetadata", () => {
    const duration = Number.isFinite(elements.audio.duration) ? elements.audio.duration : Number(elements.seek.max) || 0;
    elements.seek.max = String(duration);
    elements.playerDuration.textContent = clock(duration);
  });
  elements.audio.addEventListener("timeupdate", () => {
    elements.seek.value = String(elements.audio.currentTime || 0);
    elements.currentTime.textContent = clock(elements.audio.currentTime || 0);
  });
  elements.audio.addEventListener("play", () => { elements.playToggle.textContent = "Ⅱ"; elements.playToggle.setAttribute("aria-label", "Pause selected recording"); });
  elements.audio.addEventListener("pause", () => { elements.playToggle.textContent = "▶"; elements.playToggle.setAttribute("aria-label", "Play selected recording"); });
  elements.audio.addEventListener("ended", () => { elements.playToggle.textContent = "▶"; elements.seek.value = "0"; });
  elements.uploadedAudio?.addEventListener("play", () => elements.audio.pause());
  global.addEventListener("pagehide", () => { stopTimer(); stopMicrophoneTracks(); releasePlaybackUrl(); });

  if (!global.MediaRecorder || !navigator.mediaDevices?.getUserMedia) {
    elements.start.disabled = true;
    setRecordingStatus("idle", "Recording unavailable", "Upload audio instead, or use a browser with MediaRecorder support.");
  }
  loadLibrary();
})(window);
