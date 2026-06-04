# AR Stage Tracking — Project Plan

WebAR theater experience. Printed + projected AprilTags as physical stage anchors, detected in-browser via WASM, Three.js renders a hero asset locked to the stage. Cross-platform mobile browser, no Unity at runtime.

## WORKING (tested in previz, deployed)

BUILD: `apriltag-2026-06-03-m`

- 9-tag detection (id0–8), per-ID colors + per-ID size map
- Tag generation tool with `--ids` flag (apriltag-generator/)
- HERO / ALL TAGS mode toggle (touch buttons, HUD)
- Hero pyramid placed at id0/id1/id2 triangle, biased toward id2/coffin (COFFIN_BIAS=0.5)
- Tag-derived physical-up orientation (apex points real-world up, independent of phone tilt; spin around physical-up axis)
- Occlusion resilience: full placement on 3 tags; reconstructs from pair (id2+id0 or id2+id1) and tracks as phone moves; recalibrates whenever all 3 return
- Guidance arrows on supporting tags id3–08 pointing toward hero; uses last-known hero position when hero fully lost
- HUD: BUILD, MODE, DETECTED IDs, TRIANGLE/HERO state, BIAS, UP source, ARROWS count

## TAG MAP

| Sketch | ID | Type | Role | Size |
|--------|-----|------|------|------|
| C1 | 0 | perm | wing anchor (projected screen) | ~10-15cm projected, PLACEHOLDER 0.125 — MEASURE |
| C2 | 1 | perm | wing anchor (projected screen) | ~10-15cm projected, PLACEHOLDER 0.125 — MEASURE |
| C3 | 2 | perm | coffin front (hero anchor) | 0.1143 (4.5in) — MEASURE actual |
| C4 | 3 | temp | support / guidance arrow | 0.10 placeholder |
| C5 | 4 | temp | support / guidance arrow | 0.10 placeholder |
| C6 | 5 | temp | support / guidance arrow | 0.10 placeholder |
| C7 | 6 | temp | support / guidance arrow | 0.10 placeholder |
| C8 | 7 | temp | support / guidance arrow | 0.10 placeholder |
| C9 | 8 | temp | support / guidance arrow | 0.10 placeholder |

id2 (coffin) is the constant anchor — required for hero placement. id0/id1 are wings. id3–08 are support + guidance.

## REMAINING

### Before show (needs stage access)
- Measure real black-border size of every printed tag → update TAG_SIZE map
- Measure projected id0/id1 size on screen (or tag-to-tag gap) → replace 0.125 placeholder
- Confirm core tags id0/id1/id2 mounted vertically/plumb (physical-up depends on it)
- Measure + record each tag's physical position on stage
- Test detection under real show lighting (spotlights, color washes, blackouts)
- Tune COFFIN_BIAS to final value on real set

### Content
- Replace gold test pyramid with real hero 3D asset (GLTFLoader; keep physical-up + occlusion placement logic)

### Venue questions (see AR_SESSION_HANDOFF.md)
- Projected tag size, stage access for setup/tech rehearsal, lighting on tag areas, coffin position, audience device + link delivery

## SAFETY / DEPLOY
- Live app = repo ROOT. Render builds `npm install; npm run build` (build.js) → dist/. dist/ gitignored, regenerated on deploy. Push src only.
- Full pre-cleanup backup on `deprecated` branch (local + origin).
- Workflow: build → commit → push → test on deployed mobile. eruda + HUD for on-phone debug.
- Printable tag PNG/PDF in apriltag-generator/output/ (gitignored) — BACK THESE UP off-machine before show.

## TUNABLES (top of src/app.js)
TAG_SIZE map, COFFIN_BIAS, LERP, HFOV_DEG, PROC_W, BUILD marker, TAG_COLOR, TRI_IDS, SUPPORT_IDS
