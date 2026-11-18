/*
 * app.js: UI interactions and display state for the noise variant.
 * All audio work is delegated to window.NoiseAudio (audio.js).
 */
(function () {
  "use strict";

  const audio = window.NoiseAudio;

  const DESCRIPTIONS = {
    white: "Equal energy at all frequencies",
    pink: "Equal energy in each octave",
    brown: "Strong emphasis on low frequencies",
    blue: "Emphasis on high frequencies",
    violet: "Strongest emphasis on high frequencies"
  };

  const els = {
    playBtn: document.getElementById("play"),
    status: document.getElementById("status"),
    typeSelect: document.getElementById("noise-type"),
    desc: document.getElementById("noise-desc"),
    volume: document.getElementById("volume"),
    toneToggle: document.getElementById("tone-toggle"),
    toneFreq: document.getElementById("tone-freq"),
    toneFreqValue: document.getElementById("tone-freq-value"),
    toneLevel: document.getElementById("tone-level")
  };

  let toneOn = false;

  function renderType(type) {
    els.typeSelect.value = type;
    els.desc.textContent = DESCRIPTIONS[type] || "";
  }

  function renderPlayState(isPlaying) {
    document.body.classList.toggle("is-playing", isPlaying);
    els.playBtn.setAttribute("aria-pressed", String(isPlaying));
    els.playBtn.setAttribute("aria-label", isPlaying ? "Pause" : "Play");
    els.status.textContent = isPlaying ? "Playing" : "Paused";
    updateMediaSessionState(isPlaying);
  }

  function renderTone() {
    els.toneToggle.setAttribute("aria-checked", String(toneOn));
    els.toneToggle.textContent = toneOn ? "Sine tone: on" : "Sine tone: off";
  }

  function renderToneFrequency(hz) {
    els.toneFreqValue.textContent = Math.round(hz) + " Hz";
  }

  async function onPlayClick() {
    if (audio.isPlaying()) {
      audio.pause();
      renderPlayState(false);
      return;
    }

    try {
      await audio.play();
      renderPlayState(true);
    } catch (err) {
      console.error("Playback failed:", err);
      els.status.textContent = "Audio unavailable";
    }
  }

  function onTypeChange(event) {
    const type = event.target.value;
    audio.setType(type);
    renderType(type);
  }

  function onToneToggle() {
    toneOn = !toneOn;
    audio.setToneEnabled(toneOn);
    renderTone();
  }

  // ---------- OS media controls (Media Session API) ----------

  function setupMediaSession() {
    if (!("mediaSession" in navigator)) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: "Noise",
      artist: "Binaural",
      album: "Noise generator"
    });

    navigator.mediaSession.setActionHandler("play", async function () {
      if (!audio.isPlaying()) {
        try {
          await audio.play();
          renderPlayState(true);
        } catch (err) {
          console.error("Playback failed:", err);
        }
      }
    });

    navigator.mediaSession.setActionHandler("pause", function () {
      if (audio.isPlaying()) {
        audio.pause();
        renderPlayState(false);
      }
    });

    // Some keyboards send a toggle-style event; map it to play/pause.
    navigator.mediaSession.setActionHandler("stop", function () {
      if (audio.isPlaying()) {
        audio.pause();
        renderPlayState(false);
      }
    });
  }

  function updateMediaSessionState(isPlaying) {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }

  els.playBtn.addEventListener("click", onPlayClick);
  els.typeSelect.addEventListener("change", onTypeChange);
  els.toneToggle.addEventListener("click", onToneToggle);
  els.toneFreq.addEventListener("input", function (event) {
    audio.setToneFrequency(event.target.value);
    renderToneFrequency(Number(event.target.value));
  });
  els.toneLevel.addEventListener("input", function (event) {
    audio.setToneLevel(event.target.value);
  });
  els.volume.addEventListener("input", function (event) {
    audio.setVolume(event.target.value);
  });

  // Initial state: paused, tone off, sliders synced with the engine.
  // No audio is started here.
  setupMediaSession();
  renderType(audio.getType());
  renderPlayState(false);
  renderTone();
  renderToneFrequency(Number(els.toneFreq.value));
  audio.setToneFrequency(els.toneFreq.value);
  audio.setToneLevel(els.toneLevel.value);
  audio.setVolume(els.volume.value);
})();
