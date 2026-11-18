# Noise

A lightweight browser-based noise generator. Listen to white, pink, brown, blue,
or violet noise, optionally layer in a sine tone, and adjust the tone and master
volume independently.

## Features

- Five noise colours synthesized in the browser with the Web Audio API
- Seamlessly looping noise with smooth fades when playing, pausing, or changing colour
- Optional sine tone with adjustable frequency (20–200 Hz) and level
- Adjustable master volume
- No external assets, dependencies, or build step

## Run locally

Serve the repository directory with any static file server. For example, with
Python:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000> in a browser that supports the Web Audio API.
You can also open `index.html` directly in a compatible browser.

## Use

Press the play button to start or pause playback. Select a noise colour to switch
the sound, and use the sliders to adjust the master volume. Turn on **Sine tone**
to add a tone; its frequency and level can be adjusted independently. Playback
starts only after you press Play.

Listen at a comfortable level. Prolonged loud listening can damage hearing.
This application is for experimentation only and does not provide medical
treatment.

## Project files

- `index.html` — app layout and controls
- `app.js` — user interface interactions
- `audio.js` — noise synthesis and Web Audio playback
- `styles.css`, `noise.css` — presentation

## License

This project is available under the [MIT License](LICENSE).
