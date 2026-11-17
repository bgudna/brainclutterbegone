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
    typeButtons: Array.prototype.slice.call(document.querySelectorAll(".type-btn")),
    volume: document.getElementById("volume")
  };

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

  els.playBtn.addEventListener("click", onPlayClick);
  els.typeButtons.forEach(function (btn) {
    btn.addEventListener("click", onTypeClick);
  });
  els.volume.addEventListener("input", function (event) {
    audio.setVolume(event.target.value);
  });

  // Initial state: paused, default colour, slider synced with the engine.
  // No audio is started here.
  renderType(audio.getType());
  renderPlayState(false);
  audio.setVolume(els.volume.value);
})();
