# AR Stage Tracking — Project Plan

WebAR theater experience. Printed AprilTags as physical stage anchors, detected in-browser via WASM, Three.js renders AR content locked to tag pose. Cross-platform mobile browser (iOS + Android), no Unity at runtime.

## Current State (working)

BUILD: `apriltag-2026-06-02-e` — live on Render, verified with printed tags.

- AprilTag detection via arenaxr apriltag-js-standalone (WASM + worker + Comlink), vendored offline in `public/apriltag/`
- 6DoF pose per tag, one cube locked on each tag face (full position + orientation)
- Detects id0 (cyan) and id1 (orange)
- Pose convert OpenCV→GL `diag(1,-1,-1)`, column-major R, verified orthonormal
- Cube driven by position + quaternion (not raw matrix — avoids stale matrixWorld bug)
- On-screen debug HUD + eruda mobile console: BUILD marker, detector state, fps, per-tag id/margin/hamming/dist/center/pose-err, cube lock status
- Tag generation tool in `apriltag-generator/` (tag36h11, stage-mode boards, 300 DPI, SVG/PDF)

### Tunables (top of src/app.js)
`TAG_TL=0` `TAG_TR=1` `TAG_SIZE_M=0.20` `HFOV_DEG=60` `PROC_W=960` `LERP=0.35`

### Deploy
Render repo-root deploy. `build.js` copies index.html + src/ + public/ into dist/. Live app files: `src/app.js`, `public/apriltag/*`, `index.html`, `build.js`, `render.yaml`. Rollback snapshot on `deprecated` branch.

## Roadmap

### 1. Multi-tag centroid stabilization
- Detect all visible tags per frame, read id + pose each
- Compute centroid of all visible tag positions → use as stage anchor point
- Re-anchor instantly when tags appear/disappear
- AR content positioned relative to centroid, not a single tag

### 2. Fallback hierarchy
- Fallback 1: use only remaining visible tags if some are occluded
- Fallback 2: prioritize 2 permanent anchor tags as fixed reference
- Fallback 3: manual "Tap to align stage" recalibration button

### 3. Stage layout
- Tags at stage corners (primary), sides (redundant), optional center reference
- Map exact tag IDs → physical positions
- Consider inverted white-on-black tags for low-light scenes

### 4. Edge cases to handle
- Actor occlusion of tags
- Spotlight wash-out of markers
- Motion blur from phone movement
- iOS vs Android camera performance differences
- Partial tag visibility

### 5. Content
- Replace test cubes with show AR content
- Tie content placement to stabilized centroid anchor

## Open Decisions
- Drop unused `vite.config.js` + `compile-targets.js` (MindAR-era leftovers)?
- Exact stage tag layout + ID assignment
- What AR content replaces the cubes

## Constraints
- Live indoor theater show — 5 day deadline
- Variable lighting (spotlights, color washes)
- Audience-operated phones, mixed devices
