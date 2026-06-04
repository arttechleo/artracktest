# AprilTag Stage Anchoring — Integration Guide for ROOT

This document explains how the AprilTag-based spatial anchoring (repo: arttechleo/artracktest, BUILD apriltag-2026-06-03-p) integrates into ROOT's apps/audience-ar/. Written for the ROOT maintainer doing the merge.

## What this module does
Solves WHERE Pluto stands on the physical stage using printed/projected AprilTags, replacing ROOT's "tap to PLACE" (WebXR hit-test). It does NOT touch how Pluto moves — the relay/Quest retargeting drives her bones and face. They compose:
- This module -> Pluto's root transform (position + orientation on stage)
- ROOT relay -> Pluto's bones, face, emotes (live performance)
Merge = take the world transform this module computes each frame, apply to Pluto's root node instead of the tap-to-place anchor.

## Why AprilTags
MindAR image tracking and photo targets were tried and rejected — unreliable under theater lighting. AprilTags are deterministic fiducials: pose from tag geometry, not feature matching, so they hold under spotlights, color washes, motion blur.

## Transform contract
Every frame, for a hero THREE.Group (+Y = up, feet at origin):
- heroObject.position — world position on stage (detector GL camera space)
- heroObject.quaternion — +Y = physical-up (tag-derived), +Z = stage-forward
- heroObject.visible — true only when placement valid

## Tag map
Sketch labels are 1-indexed (C1-C9); code IDs 0-indexed (0-8). C(n) = id(n-1).
- id0 / id1: PROJECTED on upstage screen. Wing anchors. Size 0.125m PLACEHOLDER — MEASURE on stage.
- id2: coffin front. REQUIRED for hero placement. 0.1143m (4.5in).
- id3-8: printed, placed around stage. Support + guidance arrows. 0.10m.

## Placement
1. Full (id0+id1+id2 visible): centroid of 3 -> lerp toward id2 by COFFIN_BIAS (0.75) -> lower onto coffin by up*(LIFT-DROP). Also calibrates.
2. Physical-up: averaged GL +Y axis of visible core tags' poses (tags mounted vertical, so their up = real-world up).
3. Stage-forward facing: hero->id2 projected perpendicular to up. PLACEHOLDER — see Pluto facing.

## Occlusion resilience
Detector is camera-relative. Hero position stored in a local frame anchored to id2 + one wing, rebuilt from whichever pair is live each frame — tracks as phone moves.
Priority: 3-tag (full + recalibrate) -> id2+id0 -> id2+id1 -> lost.
id2 (coffin) REQUIRED. Lose id2 + both wings -> hero hides.
Needs all 3 seen once to calibrate. Show choreography: start with a beat where all 3 core tags are catchable in one frame. Recalibrates whenever all 3 return.

## Guidance arrows (id3-8)
When user loses hero but sees a support tag, arrow on it points toward hero (last-known when hero fully lost). Audience safety net. Keep or replace with ROOT's reorient in merge.

## Pluto facing — DECISION FOR ROOT TEAM
Standalone test forces Pluto to face stage-forward. PLACEHOLDER. In ROOT, the actress drives Pluto live via Quest — her facing should come from RELAY retargeting, not this module. Recommended: this module sets WHERE Pluto stands + physical-up; let relay drive facing/yaw. Drop/override the fixed-facing quaternion for the live show.

## GLB — do NOT carry a copy
Test app commits public/3DModel/PlutoRig_Mixamo.glb (11.4MB) only so the standalone deploy serves it. In ROOT, Pluto's GLB already exists at apps/audience-ar/public/models/. Point at ROOT's model; remove the test copy from the merged build.

## Stack notes
- No bundler in test app: build.js copies src/, public/, index.html into dist/. three via importmap CDN (three@0.150.0). ROOT audience-ar is Vite + React + Three.js — convert CDN importmap to bundled three imports, verify three version (test uses 0.150.0; r152+ removed APIs the detector path relies on).
- Detector: arenaxr apriltag-js-standalone WASM, vendored in public/apriltag/ (worker + Comlink). Init async — await detector-ready callback before set_camera_info / set_tag_size (WASM cwrap race otherwise). Carry public/apriltag/ into ROOT.
- Intrinsics: fx = (PROC_W/2)/tan(HFOV/2), fy=fx, principal point center. HFOV_DEG=60 approx.
- Coords: detector OpenCV cam (x right, y down, z fwd) -> GL (x right, y up, z toward viewer) via diag(1,-1,-1). GL pos = (t[0], -t[1], -t[2]). R column-major.
- Smoothing: LERP=0.35.

## Tunables (top of src/app.js)
TAG_SIZE (per-ID meters, must match physical prints), COFFIN_BIAS=0.75, HERO_DROP_M=0.40, HERO_LIFT_M=0.10, TRI_IDS=[0,1,2], SUPPORT_IDS=[3..8], HFOV_DEG=60, PROC_W=960, HERO_HEIGHT_LIFESIZE=1.7.

## Before show — physical calibration (needs stage access)
- Measure real black-border width of every printed tag -> update TAG_SIZE. Print at 100%/actual size, verify with ruler.
- Measure projected id0/id1 size on screen (or tag-to-tag gap) -> replace 0.125 placeholders.
- Confirm id0/id1/id2 mounted plumb (physical-up depends on it).
- Test detection under real show lighting.
- Tune COFFIN_BIAS / DROP / LIFT so Pluto's feet sit on the coffin lid (currently slightly floating).

## Known deferred
- Pluto floats slightly above coffin lid — tune HERO_DROP_M / HERO_LIFT_M on real set.
- Facing handed to ROOT relay (above).
