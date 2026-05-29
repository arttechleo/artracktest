# Oculus Lipsync Setup (Quest Side)

This wires Meta's OVRLipSync (phoneme-accurate lip sync) into
`RetargetStreamer.cs` so the audience-ar app gets viseme weights and
drives the actual mouth shapes on Pluto instead of just opening her jaw
with mic volume.

## Why

OVRLipSync analyzes the mic audio in real time on the Quest, detecting
which phoneme (consonant/vowel sound) is currently being spoken. It
outputs 15 viseme weights (PP, FF, TH, aa, E, ih, oh, ou, etc.). When
the audience-ar receives these, it can drive Pluto's `viseme_PP`,
`viseme_AA`, etc. shape keys for word-accurate mouth movement.

## Prerequisites

- Unity project: `apps/quest-movement-test/`
- Build platform: Android (Quest 3)
- Meta XR All-in-One SDK already installed (we use it for Movement SDK)

## Step 1: Install Oculus Audio SDK

The Oculus Audio SDK ships OVRLipSync. It is bundled with the **Meta XR
All-in-One SDK** as the **Voice SDK** / **Audio SDK** package, OR you
can install the standalone Oculus Lipsync package.

### Option A — via Meta XR Package Manager (preferred)

1. In Unity: `Window` → `Package Manager`
2. Select **My Registries** or **In Project** → **Meta XR Audio SDK**
3. Install it. Should pull in OVRLipSync automatically.

### Option B — standalone Oculus Lipsync

1. Download from: https://developer.oculus.com/downloads/package/oculus-lipsync-unity/
2. Import the `.unitypackage` into the project.
3. The plugin lands in `Assets/Oculus/LipSync/`.

## Step 2: Add OVRLipSync to the scene

In `MovementBody.unity`:

1. Find the GameObject with `RetargetStreamer` component attached (usually
   the avatar or a dedicated GameObject called `RetargetStreamer`).
2. Add component → **OVR Lip Sync Context**
3. Add component → **OVR Lip Sync Mic Input**
4. On `OVRLipSyncMicInput`: set **Mic Control** to **Constant Speak**
   (so it always samples the mic, like the existing voice level does).
5. On `OVRLipSyncContext`: keep defaults; ensure `Audio Loopback` is OFF
   (we don't want to hear our own mic).

## Step 3: Extend RetargetStreamer.cs

Add a new method `SendLipSync()` that runs each `LateUpdate` (or every
N frames at ~30fps to keep bandwidth sane) and sends viseme weights to
the relay.

Insert this near the existing `SendVoiceLevel()` method:

```csharp
// At top of file (with other usings):
using Oculus.LipSync;

// As class fields (add near _micClip):
private OVRLipSyncContext _lipSyncCtx;
private float _lastLipSyncSent;
private const float LIP_SYNC_INTERVAL = 1f / 30f; // 30 fps

// In Start(), after the mic setup:
_lipSyncCtx = GetComponent<OVRLipSyncContext>();
if (_lipSyncCtx == null)
    Log("OVRLipSyncContext not found — phoneme lip sync disabled.");

// New method:
void SendLipSync()
{
    if (_lipSyncCtx == null || !_connected) return;
    if (Time.time - _lastLipSyncSent < LIP_SYNC_INTERVAL) return;
    _lastLipSyncSent = Time.time;

    OVRLipSync.Frame frame = _lipSyncCtx.GetCurrentPhonemeFrame();
    if (frame == null) return;

    // OVRLipSync.VisemeCount = 15: indexes match the Viseme enum
    // (sil, PP, FF, TH, DD, kk, CH, SS, nn, RR, aa, E, ih, oh, ou)
    string[] names = {
        "sil", "PP", "FF", "TH", "DD", "kk", "CH", "SS",
        "nn", "RR", "aa", "E", "ih", "oh", "ou"
    };

    var visemes = new Dictionary<string, float>();
    for (int i = 0; i < names.Length && i < frame.Visemes.Length; i++)
    {
        visemes[names[i]] = frame.Visemes[i];
    }

    lock (_sendQueue)
    {
        _sendQueue.Enqueue(JsonConvert.SerializeObject(new
        {
            type = "lip_sync",
            data = new { visemes }
        }));
    }
}
```

Then in `LateUpdate()` (or wherever `SendVoiceLevel()` is called):

```csharp
if (enableVoiceDetection && _frameCounter % 5 == 0)
    SendVoiceLevel();

// NEW:
SendLipSync();
```

## Step 4: Build & deploy APK

1. `File` → `Build Settings` → `Build` (or `Build and Run` with Quest connected)
2. Install the new APK on Quest 3

## Step 5: Verify

Open the audience-ar phone view + show control. Have Deidra speak into
the Quest mic and watch Pluto's mouth.

- **Volume-driven jaw flap before** → mouth opens proportionally to volume
- **Phoneme-driven now** → mouth forms actual P, F, vowel shapes

In the browser console you should see no errors. To verify visemes are
arriving on the audience side, in dev tools console:

```js
__ghost.plutoFace.currentVisemes  // should be {sil, PP, ...} with non-zero values when speaking
```

## Mapping reference (OVR → model shape key)

| OVR viseme | Model shape key | Sound |
|-----------|-----------------|-------|
| sil       | (none)          | silence |
| PP        | viseme_PP       | p, b, m |
| FF        | viseme_FF       | f, v |
| TH        | viseme_TH       | th |
| DD        | viseme_DD       | t, d, s, z |
| kk        | viseme_KK       | k, g |
| CH        | viseme_CH       | ch, j, sh |
| SS        | viseme_SS       | (sibilants) |
| nn        | viseme_NN       | n |
| RR        | viseme_RR       | r |
| aa        | viseme_AA       | ah |
| E         | viseme_EE       | eh |
| ih        | viseme_II       | ee, ih |
| oh        | viseme_OO       | oh |
| ou        | vismeme_UU      | oo (artist typo, mapped both spellings) |

## Troubleshooting

**No mouth movement at all after upgrade:**
- Verify OVRLipSyncContext is on the same GameObject as RetargetStreamer
- Check Unity console for errors about missing plugin DLLs
- Confirm OVRLipSyncMicInput's "Mic Input Source" is set
- Verify Quest mic permission granted to the APK

**Mouth shapes look exaggerated:**
- Scale down weights in PlutoFace.ts's viseme application
  (currently 1:1 — set to 0.7 for subtler movement)

**Lag between voice and mouth:**
- Reduce `LIP_SYNC_INTERVAL` in RetargetStreamer to send more often (e.g., 1/60)
- Or check WebSocket queue isn't backing up

## Status / Hand-off

- ✅ Audience-ar receives `lip_sync` messages and drives visemes (done)
- ✅ Relay forwards `lip_sync` to audience role (done)
- ⏳ Quest side: needs Paul's PC + Unity work
- ⏳ Test end-to-end after Quest APK rebuilt
