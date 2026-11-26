# Unison

A browser-only telemetry viewer for sim racing. Drop in an iRacing `.ibt` file or a SimHub `.telemetry.json` recording and you get:

- **Lap comparison**: reference vs compare lap on a shared distance axis, with a delta trace, speed, throttle, brake, gear and steering, plus any other channel from the file (RPM, G-forces, tyre temps, ride heights…)
- **Lap playback**: play, pause and scrub through the lap at 0.25×–4×. The chart playhead, the track-map car dots, a live G-force circle with a trail, pedal bars and a steering wheel all move together. A ghost line shows where the compare car is at the same moment.
- **Track map**: from GPS for `.ibt` files, rebuilt from heading and speed for SimHub files. Coloured by speed, throttle, brake, gear, lateral G, steering or time gained/lost.
- **Sector & corner analysis**: sector splits with session bests and theoretical best lap. Corners are detected automatically, with brake points, entry/min/exit speeds and time gained or lost per corner.
- **Private**: files are parsed in a Web Worker on your machine and never uploaded.

Light mode by default, with a dark-mode toggle in the header.

## Supported files

| Source | Extension | Rate | Notes |
| --- | --- | --- | --- |
| iRacing disk telemetry | `.ibt` | 60 Hz | Enable with Alt+L in iRacing. Saved under `Documents\iRacing\telemetry`. |
| SimHub Telemetry/Replay | `.telemetry.json` | ~10 Hz | Despite the name, a binary file of compressed JSON frames. Tested with iRacing; other games are mapped on a best-effort basis (see `src/parsers/channels.ts`). |
| Unison export | `.unison` | as recorded | Made with the **Export** button: the laps you tick, with every channel. Open it again to see just those laps. |

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build to dist/
npx tsx scripts/inspect.ts <file...>   # print laps/sectors for telemetry files from the command line
npx tsx scripts/corners.ts <file>      # print detected corners for the two fastest laps
npx tsx scripts/make-demo.ts <file.ibt> 8 10   # rebuild public/demo/session.bin (the "Try it out" demo) from chosen laps
```

## Deploying

`.github/workflows/deploy.yml` builds and publishes to GitHub Pages on every push to `main`. In the repository settings, set **Pages → Source** to **GitHub Actions**. The site will then be served at `https://<user>.github.io/Iracing-telemetry/`.

## How it's organised

```
src/parsers/     .ibt and SimHub readers, session-info YAML, channel name/unit mapping
src/analysis/    lap detection, distance resampling, delta, track map, corners
src/worker/      parsing runs off the main thread
src/state/       app store, actions (open files, demo, playback)
src/components/  chart (canvas), track map, live dash, tables, channel picker
```
