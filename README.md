# artracktest — AprilTag Stage Anchoring (ROOT)

Browser WebAR that anchors a hero 3D object (Pluto) to a physical theater stage using AprilTags. Cross-platform mobile browser, no app install. Built for ROOT (Running Out Of Time), Hollywood Fringe 2026.

- Live: https://artracktest.onrender.com
- Current BUILD: apriltag-2026-06-03-p
- Detector: apriltag-js-standalone (WASM) + Three.js
- Tag generation: apriltag-generator/

## Integration into ROOT
See INTEGRATION.md for the full merge guide (transform contract, occlusion logic, tag map, Pluto facing decision, GLB handling, pre-show calibration).

## Run
Deploys from repo root on Render (npm install; npm run build -> dist/). Push src; dist regenerates on deploy.
