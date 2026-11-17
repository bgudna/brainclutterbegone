/*
 * audio.js: Web Audio noise engine.
 *
 * Each noise colour is synthesised once into an exactly periodic stereo buffer:
 * a random-phase spectrum shaped to the colour's power law is inverse-transformed,
 * so the last sample flows directly into the first with no crossfade needed.
 *
 * Graph, built on the first Play (inside a user gesture):
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

  // Power spectrum ~ 1 / f^alpha. Amplitude per bin ~ f^(-alpha/2).
  const SPECTRAL_EXPONENT = { white: 0, pink: 1, brown: 2, blue: -1, violet: -2 };

  // ---- Tuning ----
  const LOOP_LENGTH = 1 << 18;      // 262144 samples: about 5.9 s at 44.1 kHz, 5.5 s at 48 kHz
  const FADE_TIME = 0.3;            // seconds for play/pause and colour crossfades
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

  /** In-place iterative radix-2 FFT. Length must be a power of two. */
  function fftInPlace(re, im) {
    const n = re.length;

    // Bit-reversal permutation.
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }

    // Butterflies.
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1;
      const angle = -2 * Math.PI / len;
      const wr = Math.cos(angle);
      const wi = Math.sin(angle);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < half; k++) {
          const a = i + k;
          const b = a + half;
          const tr = re[b] * cr - im[b] * ci;
          const ti = re[b] * ci + im[b] * cr;
          re[b] = re[a] - tr;
          im[b] = im[a] - ti;
          re[a] += tr;
          im[a] += ti;
          const ncr = cr * wr - ci * wi;
          ci = cr * wi + ci * wr;
          cr = ncr;
        }
      }
    }
  }

  /**
   * Generate one channel of exactly periodic noise with the given colour.
   * Random phases give noise, and the amplitude shaping gives the colour.
   * The spectrum is Hermitian so the output is real. DC and Nyquist are zero.
   */
  function generateLoopChannel(type) {
    const n = LOOP_LENGTH;
    const alpha = SPECTRAL_EXPONENT[type];
    const re = new Float64Array(n);
    const im = new Float64Array(n);

    for (let k = 1; k < n / 2; k++) {
      const amp = Math.pow(k, -alpha / 2);
      const phase = Math.random() * 2 * Math.PI;
      re[k] = amp * Math.cos(phase);
      im[k] = amp * Math.sin(phase);
      re[n - k] = re[k];      // conjugate symmetry
      im[n - k] = -im[k];
    }

    // Inverse DFT via forward FFT: conjugate the input, transform, take the real part.
    for (let k = 0; k < n; k++) im[k] = -im[k];
    fftInPlace(re, im);

    return re; // holds n * x[t]
  }

  /** Build a seamless stereo buffer for one colour, normalised to PEAK_LEVEL. */
  function createNoiseBuffer(type) {
    const left = generateLoopChannel(type);
    const right = generateLoopChannel(type);

    let peak = 0;
    for (let i = 0; i < LOOP_LENGTH; i++) {
      peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
    }
    const scale = peak > 0 ? PEAK_LEVEL / peak : 1;

    const buffer = ctx.createBuffer(2, LOOP_LENGTH, ctx.sampleRate);
    const outL = new Float32Array(LOOP_LENGTH);
    const outR = new Float32Array(LOOP_LENGTH);
    for (let i = 0; i < LOOP_LENGTH; i++) {
      outL[i] = left[i] * scale;
      outR[i] = right[i] * scale;
    }
    buffer.copyToChannel(outL, 0);
    buffer.copyToChannel(outR, 1);
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

  /** Ramp a gain param from its current value to a target over FADE_TIME. */
  function rampGain(gainParam, target, now) {
    gainParam.cancelScheduledValues(now);
    gainParam.setValueAtTime(gainParam.value, now);
    gainParam.linearRampToValueAtTime(target, now + FADE_TIME);
  }

  /** Crossfade from the current colour to a new one. The old source stops after its fade-out. */
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
