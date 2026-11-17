/*
 * audio.js: Web Audio noise engine.
 *
 * Each noise colour is generated once into a looping stereo AudioBuffer.
 * The graph, built on the first Play (inside a user gesture):
 *
 *   source (looping buffer) -> sourceGain (per-source, used for crossfades)
 *     -> fadeGain (play/pause envelope) -> volumeGain (master volume) -> destination
 *
 * Changing colour starts a new source and crossfades. Pause mutes via fadeGain
 * and the source keeps running silently, so no duplicate nodes accumulate.
 */
(function () {
  "use strict";

  const TYPES = ["white", "pink", "brown", "blue", "violet"];
  const DEFAULT_TYPE = "pink";

  // ---- Tuning ----
  const FADE_TIME = 0.3;            // seconds for play/pause and colour crossfades
  const BUFFER_SECONDS = 6;         // length of the generated loop
  const LOOP_BLEND_SECONDS = 0.5;   // crossfade region that hides the loop seam
  const PEAK_LEVEL = 0.8;           // each colour is normalised to this peak
  const MAX_LEVEL = 0.4;            // output gain at slider = 100
  const VOLUME_TIME_CONSTANT = 0.03;

  let ctx = null;
  let fadeGain = null;
  let volumeGain = null;
  let current = null;              // { source, gain, type }
  let currentType = DEFAULT_TYPE;
  let playing = false;
  let volumeSlider = 30;           // 0..100, matches the default in index.html
  const bufferCache = {};

  // ---- Helpers ----

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function levelFromSlider(value) {
    const fraction = clamp(value, 0, 100) / 100;
    return MAX_LEVEL * fraction * fraction;
  }

  /**
   * Generate raw samples for one channel of a given colour.
   * White noise is the source. The other colours are filtered or differentiated versions of it.
   */
  function generateSamples(type, length) {
    const out = new Float32Array(length);

    // Paul Kellet's economy pink filter state.
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    // Brown (integrated white) state.
    let brown = 0;
    // Previous values for differentiation.
    let prevWhite = 0;
    let prevPink = 0;

    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;

      if (type === "white") {
        out[i] = white;
        continue;
      }

      if (type === "brown") {
        brown = (brown + 0.02 * white) / 1.02;
        out[i] = brown;
        continue;
      }

      if (type === "violet") {
        // Differentiated white noise: +6 dB per octave.
        out[i] = white - prevWhite;
        prevWhite = white;
        continue;
      }

      // Pink filter, used directly for "pink" and differentiated for "blue".
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
      b6 = white * 0.115926;

      if (type === "pink") {
        out[i] = pink * 0.11;
      } else {
        // blue: differentiated pink, +3 dB per octave.
        out[i] = (pink - prevPink) * 0.11;
        prevPink = pink;
      }
    }

    return out;
  }

  /**
   * Build a seamless looping stereo buffer for one colour.
   * Extra samples are generated past the loop point, and the last
   * LOOP_BLEND_SECONDS are crossfaded into the start so the loop has no click.
   */
  function createNoiseBuffer(type) {
    const sampleRate = ctx.sampleRate;
    const length = Math.round(sampleRate * BUFFER_SECONDS);
    const blend = Math.round(sampleRate * LOOP_BLEND_SECONDS);
    const total = length + blend;

    const channels = [];
    let peak = 0;

    for (let c = 0; c < 2; c++) {
      const raw = generateSamples(type, total);
      const looped = new Float32Array(length);

      for (let i = 0; i < length; i++) {
        if (i < blend) {
          // Fade the tail into the head: at i = 0 the output is the tail, moving to the head.
          const t = i / blend;
          looped[i] = raw[i] * t + raw[length + i] * (1 - t);
        } else {
          looped[i] = raw[i];
        }
        const abs = Math.abs(looped[i]);
        if (abs > peak) peak = abs;
      }
      channels.push(looped);
    }

    // Normalise so every colour peaks at the same level.
    const scale = peak > 0 ? PEAK_LEVEL / peak : 1;
    const buffer = ctx.createBuffer(2, length, sampleRate);
    for (let c = 0; c < 2; c++) {
      const data = channels[c];
      for (let i = 0; i < length; i++) data[i] *= scale;
      buffer.copyToChannel(data, c);
    }
    return buffer;
  }

  function getBuffer(type) {
    if (!bufferCache[type]) {
      bufferCache[type] = createNoiseBuffer(type);
    }
    return bufferCache[type];
  }

  /** Start a looping source for a colour, with its gain at the given starting value. */
  function startSource(type, startGain) {
    const source = ctx.createBufferSource();
    source.buffer = getBuffer(type);
    source.loop = true;

    const gain = ctx.createGain();
    gain.gain.value = startGain;

    source.connect(gain);
    gain.connect(fadeGain);
    source.start();

    return { source: source, gain: gain, type: type };
  }

  /** Create the audio graph once. Must be called from a user gesture. */
  function buildGraph() {
    if (ctx) return;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    ctx = new AudioContextClass();

    fadeGain = ctx.createGain();
    fadeGain.gain.value = 0; // silent until Play

    volumeGain = ctx.createGain();
    volumeGain.gain.value = levelFromSlider(volumeSlider);

    fadeGain.connect(volumeGain);
    volumeGain.connect(ctx.destination);
  }

  /** Ramp a gain node from its current value to a target over FADE_TIME. */
  function rampGain(gainParam, target, now) {
    gainParam.cancelScheduledValues(now);
    gainParam.setValueAtTime(gainParam.value, now);
    gainParam.linearRampToValueAtTime(target, now + FADE_TIME);
  }

  /**
   * Crossfade from the current colour to a new one.
   * The old source is stopped after its fade-out completes.
   */
  function switchTo(type) {
    const now = ctx.currentTime;
    const next = startSource(type, 0);
    rampGain(next.gain.gain, 1, now);

    if (current) {
      const old = current;
      rampGain(old.gain.gain, 0, now);
      old.source.stop(now + FADE_TIME + 0.05);
    }

    current = next;
  }

  // ---- Public API ----

  function getType() {
    return currentType;
  }

  function getTypes() {
    return TYPES.slice();
  }

  function isPlaying() {
    return playing;
  }

  /** Select a noise colour. If the graph exists, this crossfades immediately. */
  function setType(type) {
    if (TYPES.indexOf(type) === -1) return;
    if (type === currentType) return;

    currentType = type;
    if (ctx && current) {
      switchTo(type);
    }
  }

  /** Start playback with a fade-in. Resumes the AudioContext if needed. */
  async function play() {
    buildGraph();

    if (ctx.state !== "running") {
      await ctx.resume();
    }

    if (!current) {
      // First start: create the source directly at full gain.
      current = startSource(currentType, 1);
    }

    rampGain(fadeGain.gain, 1, ctx.currentTime);
    playing = true;
  }

  /** Pause with a fade-out. The source keeps running silently. */
  function pause() {
    if (!ctx) return;

    rampGain(fadeGain.gain, 0, ctx.currentTime);
    playing = false;
  }

  /** Set master volume from the 0..100 slider. Smoothed to avoid zipper noise. */
  function setVolume(value) {
    volumeSlider = clamp(Number(value), 0, 100);
    if (!volumeGain) return;

    volumeGain.gain.setTargetAtTime(
      levelFromSlider(volumeSlider),
      ctx.currentTime,
      VOLUME_TIME_CONSTANT
    );
  }

  window.NoiseAudio = {
    getType: getType,
    getTypes: getTypes,
    setType: setType,
    play: play,
    pause: pause,
    setVolume: setVolume,
    isPlaying: isPlaying
  };
})();
