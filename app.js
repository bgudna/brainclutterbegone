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

  const LABELS = {
    white: "White",
    pink: "Pink",
    brown: "Brown",
    blue: "Blue",
    violet: "Violet"
  };

  const els = {
    playBtn: document.getElementById("play"),
    status: document.getElementById("status"),
    name: document.getElementById("noise-name"),
    desc: document.getElementById("noise-desc"),
    typeButtons: Array.prototype.slice.call(document.querySelectorAll(".type-btn[data-type]")),
    volume: document.getElementById("volume"),
    toneToggle: document.getElementById("tone-toggle"),
    toneFreq: document.getElementById("tone-freq"),
    toneFreqValue: document.getElementById("tone-freq-value"),
    toneLevel: document.getElementById("tone-level")
  };

  let toneOn = false;

  function renderType(type) {
    els.name.textContent = LABELS[type] || type;
    els.desc.textContent = DESCRIPTIONS[type] || "";
    els.typeButtons.forEach(function (btn) {
      btn.setAttribute("aria-checked", String(btn.dataset.type === type));
    });
  }

  function renderPlayState(isPlaying) {
    document.body.classList.toggle("is-playing", isPlaying);
    els.playBtn.setAttribute("aria-pressed", String(isPlaying));
    els.playBtn.setAttribute("aria-label", isPlaying ? "Pause" : "Play");
    els.status.textContent = isPlaying ? "Playing" : "Paused";
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

  function onTypeClick(event) {
    const type = event.currentTarget.dataset.type;
    audio.setType(type);
    renderType(type);
  }

  function onToneToggle() {
    toneOn = !toneOn;
    audio.setToneEnabled(toneOn);
    renderTone();
  }

  els.playBtn.addEventListener("click", onPlayClick);
  els.typeButtons.forEach(function (btn) {
    btn.addEventListener("click", onTypeClick);
  });
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
  renderType(audio.getType());
  renderPlayState(false);
  renderTone();
  renderToneFrequency(Number(els.toneFreq.value));
  audio.setToneFrequency(els.toneFreq.value);
  audio.setToneLevel(els.toneLevel.value);
  audio.setVolume(els.volume.value);
})();
