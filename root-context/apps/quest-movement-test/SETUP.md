# ROOT Theater — Movement SDK Test Project

**Purpose:** Clean test project to verify Meta Movement SDK body tracking → WebSocket streaming → WebAR ghost avatar pipeline. Built for the April 11th Broadwater stage test.

## Quick Start

### 1. Open in Unity Hub
- Open Unity Hub → Add → Browse to `root-theater/apps/quest-movement-test/`
- Use **Unity 2022.3.15f1** or newer (LTS recommended)
- Unity will import packages — this takes a few minutes on first open

### 2. Switch to Android Build Target
- File → Build Settings → Android → **Switch Platform**
- Wait for reimport to finish

### 3. Import Movement SDK Body Tracking Samples
- Window → Package Manager
- Find **"Meta XR Movement SDK"** in the package list (under "Packages - Meta Platforms, Inc.")
- Click the **Samples** tab
- Click **Import** next to **"Body Tracking Samples"**
- (Optional) Also import **"Advanced Samples"** for more retargeting examples

### 4. Open a Body Tracking Sample Scene
After importing, look in:
```
Assets/Samples/Meta XR Movement SDK/<version>/Body Tracking Samples/Scenes/
```
Open one of the body tracking scenes (e.g., `BodyTrackingForFitness` or `HipPinning`).

Or use the menu: **ROOT Theater → Setup Wizard → Search for Body Tracking Scenes**

### 5. Add RetargetStreamer to the Avatar
- In the Hierarchy, find the avatar GameObject that has a `CharacterRetargeter` component
  - Use menu: **ROOT Theater → Setup Wizard → Find CharacterRetargeter in Scene**
- Add the `RetargetStreamer` component to that same GameObject
- Set `Relay Server Url` to your relay server:
  - **Local testing:** `ws://YOUR_PC_IP:8080`
  - **Phone testing (ngrok):** `wss://YOUR-NGROK-URL.ngrok-free.dev`

### 6. Add WebSocketSharp.dll
- Download from: https://github.com/sta/websocket-sharp
- Or build from source and place `websocket-sharp.dll` in `Assets/Plugins/`
- The RetargetStreamer uses WebSocketSharp for the relay connection

### 7. Build APK
- File → Build Settings → Build
- Or use: **ROOT Theater → Setup Wizard → Build APK**
- Install on Quest 3: `adb install ROOT-Movement-Test.apk`

### 8. Test the Pipeline
1. Start the relay server: `cd root-theater/apps/relay-server && npm start`
2. Start ngrok: `npx ngrok http 8080`
3. Put on Quest 3, run the APK
4. On phone, open: `https://dist-six-steel-86.vercel.app/?relay=wss://YOUR-NGROK.ngrok-free.dev`
5. Ghost avatar on phone should mirror your body movements!

## Architecture

```
Quest 3 (APK)                    Phone (WebAR)
┌──────────────┐                 ┌──────────────────┐
│ Body Tracking │                 │ 8th Wall AR      │
│      ↓        │                 │      ↓            │
│ CharacterRe-  │    WebSocket   │ GhostAvatar.ts   │
│ targeter      │ ──────────→   │ (applies bones)  │
│      ↓        │  relay server  │      ↓            │
│ RetargetStr-  │                 │ Ghost aura +     │
│ eamer.cs      │                 │ chapel scene     │
└──────────────┘                 └──────────────────┘
```

## Key Settings Already Configured

- **Build Target:** Android (Quest 3)
- **Scripting Backend:** IL2CPP
- **Target Architecture:** ARM64
- **Min SDK:** 32 (Quest 3)
- **Active Input:** Both (Old + New Input System)
- **Color Space:** Linear
- **Graphics API:** Vulkan + OpenGLES3
- **Internet Permission:** Enabled (for WebSocket)
- **Microphone Description:** Set (for voice detection)

## Troubleshooting

**"No CharacterRetargeter found"**
→ Import the Body Tracking Samples first (Step 3)

**"Cached 0 bones"**
→ The avatar doesn't have a Humanoid Animator. Check the avatar's FBX import settings.

**Build fails with IL2CPP errors**
→ Make sure Android NDK is installed via Unity Hub → Installs → your version → Modules

**WebSocket won't connect from APK**
→ Quest 3 needs WiFi on the same network as relay server. Use the ngrok URL for cross-network.

## Menu Shortcuts

- **ROOT Theater → Setup Wizard** — Step-by-step guide with buttons
- **ROOT Theater → Quick Check** — Verify project settings in Console
