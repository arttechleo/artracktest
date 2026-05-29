/**
 * ROOT (Running Out Of Time) - Audience AR Experience
 *
 * Main application component. Manages:
 * 1. WebSocket connection to relay server
 * 2. Show state (current act/scene, lighting, ghost character)
 * 3. 8th Wall AR rendering pipeline with button-confirmed placement
 * 4. Audience interaction UI (judgment voting, time donations)
 */

import React, { useEffect, useRef, useCallback, useState } from 'react';
import * as THREE from 'three';
import { useRelaySocket } from './hooks/useRelaySocket';
import { useShowState } from './hooks/useShowState';
import { ChapelScene, EnvironmentPreset } from './utils/ChapelScene';
import { PropManager } from './utils/PropManager';
import { createInMemoriamSlide } from './utils/InMemoriam';
import { JudgmentPanel } from './components/JudgmentPanel';
import { HUD } from './components/HUD';

// Expose THREE globally for 8th Wall self-hosted engine
(window as any).THREE = THREE;

// Default relay server URL - configurable via ?relay= URL param
const getRelayUrl = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get('relay') || 'wss://root-relay.onrender.com';
};

interface PlacementController {
  place: () => boolean;
  rotate: (deltaRadians: number) => void;
}

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chapelRef = useRef<ChapelScene | null>(null);
  const placementRef = useRef<PlacementController | null>(null);
  const animFrameRef = useRef<number>(0);
  const [arReady, setArReady] = useState(false);
  const [placed, setPlaced] = useState(false);
  const [placementReady, setPlacementReady] = useState(false);
  const [mode, setMode] = useState<'loading' | 'ar' | 'preview'>('loading');
  const [skeletonFrames, setSkeletonFrames] = useState(0);
  const [boneMatchInfo, setBoneMatchInfo] = useState('');
  const [lastAction, setLastAction] = useState('(tap a button to test)');

  const { showState, handleShowMessage } = useShowState();

  // Handle incoming WebSocket messages
  const handleMessage = useCallback((msg: any) => {
    handleShowMessage(msg);

    const chapel = chapelRef.current;
    if (!chapel) return;

    switch (msg.type) {
      case 'calibrate':
        chapel.ghost.handleCalibration(msg.data);
        setBoneMatchInfo('CALIBRATION RECEIVED!');
        console.log('[ROOT] Calibration received from Quest');
        break;
      case 'skeleton':
        chapel.ghost.pushSkeletonFrame(msg.data);
        setSkeletonFrames(chapel.ghost.frameCount);
        setBoneMatchInfo(`${chapel.ghost.calibrationStatus} | ${chapel.ghost.matchedBones}/${chapel.ghost.totalQuestBones}`);

        break;
      case 'aura':
        chapel.ghost.setAura({
          color: [msg.data.color.x, msg.data.color.y, msg.data.color.z],
          intensity: msg.data.intensity,
          pulseRate: msg.data.pulseRate,
          emotion: msg.data.emotion,
        });
        break;
      case 'voice_level':
        chapel.ghost.setAura({
          intensity: msg.data.volume,
          pulseRate: msg.data.speaking ? 2.0 : 0.5,
        });
        // Drive Pluto's lip sync from same mic data (no-op if Pluto has no blendshapes)
        chapel.ghost.setVoiceLevel(msg.data.volume, msg.data.speaking);
        break;
      case 'emote':
        // Trigger a named facial expression on Pluto.
        // Triggered by show_control: { type: 'emote', data: { name: 'sad', duration?: 5 } }
        chapel.ghost.triggerEmote(msg.data.name, msg.data.duration);
        break;
      case 'lip_sync':
        // Oculus Lipsync viseme weights from Quest. Drives word-accurate
        // mouth shapes (phoneme-based) instead of the simple volume jaw flap.
        // Format: { type: 'lip_sync', data: { visemes: { sil, PP, FF, ..., ou } } }
        if (msg.data?.visemes) {
          chapel.ghost.setVisemes(msg.data.visemes);
        }
        break;
      case 'ghost_character':
        chapel.ghost.setVisible(msg.data.visible);
        if (msg.data.state) {
          chapel.ghost.setState(msg.data.state);
        }
        break;
      case 'lighting_cue': {
        chapel.setPreset(msg.data.preset as EnvironmentPreset, msg.data.fadeDuration);
        // Show/hide chapel environment based on lighting preset
        const pm2 = (window as any).__propManager as PropManager;
        if (pm2) {
          if (msg.data.preset === 'chapel') {
            pm2.setPropVisible('chapel', true);
          } else if (msg.data.preset === 'dark') {
            pm2.setPropVisible('chapel', false);
          }
        }
        break;
      }
      case 'prop': {
        const pm = (window as any).__propManager as PropManager;
        if (pm) pm.handlePropMessage(msg.data);
        break;
      }
      case 'projection': {
        const mem = (window as any).__memoriam as THREE.Mesh;
        if (msg.data.style === 'subtitle' && mem) {
          mem.visible = true;
        } else if (msg.data.style === 'clear' && mem) {
          mem.visible = false;
        }
        // Also handle via useShowState for HUD text
        break;
      }
      case 'xr_blackout':
        if (msg.data.active) {
          chapel.ghost.setVisible(false);
          const mem = (window as any).__memoriam as THREE.Mesh;
          if (mem) mem.visible = false;
        } else {
          chapel.ghost.setVisible(true);
        }
        break;
    }
  }, [handleShowMessage]);

  const { state: relayState, send } = useRelaySocket(getRelayUrl(), handleMessage);

  // Initialize scene
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const chapel = new ChapelScene();
    chapelRef.current = chapel;

    // Scene hidden until placed in AR mode; visible in preview mode
    chapel.scene.visible = false;

    console.log('[ROOT] Debug skeleton added to scene');

    // Load the Pluto model through GhostAvatar.
    // ?model=v1 in the URL reverts to the original (no blendshapes) for A/B comparison.
    const urlParams = new URLSearchParams(window.location.search);
    const useV1 = urlParams.get('model') === 'v1';
    const plutoUrl = useV1 ? '/models/PlutoRig_Mixamo.glb' : '/models/PlutoRig_Mixamo_v2.glb';
    console.log(`[ROOT] Loading Pluto model: ${plutoUrl}`);
    chapel.ghost.loadModel(plutoUrl)
      .then(() => {
        console.log(`[ROOT] Pluto ${useV1 ? 'v1' : 'v2'} loaded through GhostAvatar!`);
        chapel.ghost.setVisible(true);
        // Expose ghost on window for console testing of emotes and lip sync
        (window as any).__ghost = chapel.ghost;
        // Convenience helper: fake a sustained mic volume to test lip sync without Quest
        (window as any).__testMic = (volume = 0.5, durationMs = 3000) => {
          const startedAt = performance.now();
          const id = setInterval(() => {
            const elapsed = performance.now() - startedAt;
            if (elapsed > durationMs) {
              clearInterval(id);
              chapel.ghost.setVoiceLevel(0, false);
              return;
            }
            // Wobble volume a bit so it looks like speech, not a held vowel
            const wobble = volume * (0.6 + 0.4 * Math.sin(elapsed * 0.012));
            chapel.ghost.setVoiceLevel(wobble, wobble > 0.1);
          }, 30);
        };
        console.log('[ROOT] Test from console:');
        console.log('  __ghost.triggerEmote("happy")  // try: neutral, happy, sad, angry, surprised, confused, scared, contemplative');
        console.log('  __testMic(0.5, 3000)  // fake mic volume 0.5 for 3 seconds → lip sync');
      })
      .catch((err) => {
        console.error('[ROOT] FAILED to load Pluto model:', err);
      });


    // Load digital props (cake, coin, dinnerware, chapel environment)
    const propManager = new PropManager(chapel.scene);
    propManager.loadAll();
    (window as any).__propManager = propManager;

    // In Memoriam slide
    const memoriam = createInMemoriamSlide();
    chapel.scene.add(memoriam);
    (window as any).__memoriam = memoriam;

    // Bright lights
    const testLight = new THREE.DirectionalLight(0xffffff, 3);
    testLight.position.set(2, 5, 5);
    chapel.scene.add(testLight);
    const ambLight = new THREE.AmbientLight(0xffffff, 1.0);
    chapel.scene.add(ambLight);
    console.log('[ROOT] Test lights + cube added');

    // Stage DISABLED
    // const stageLoader = new GLTFLoader();

    const initAR = async () => {
      // Wait for 8th Wall to load
      await new Promise<void>((resolve) => {
        if (window.XR8) { resolve(); return; }
        const check = setInterval(() => {
          if (window.XR8) { clearInterval(check); resolve(); }
        }, 100);
        setTimeout(() => { clearInterval(check); resolve(); }, 5000);
      });

      // Check for camera
      const hasCamera = await navigator.mediaDevices?.enumerateDevices()
        .then(devices => devices.some(d => d.kind === 'videoinput'))
        .catch(() => false);

      // Allow ?mode=preview in URL to skip AR placement entirely (debug/testing).
      const forcePreview = urlParams.get('mode') === 'preview';

      if (window.XR8 && hasCamera && !forcePreview) {
        try {
          placementRef.current = initXR8(
            canvas,
            chapel,
            () => {
              setPlaced(true);
              setPlacementReady(false);
              chapel.scene.visible = true;
            },
            setPlacementReady,
          );
          setMode('ar');
          console.log('[ROOT] 8th Wall AR mode started');
        } catch (err) {
          console.warn('[ROOT] XR8 failed, falling back to preview:', err);
          initPreviewMode(canvas, chapel);
          setMode('preview');
          chapel.scene.visible = true;
          setPlaced(true);
        }
      } else {
        if (forcePreview) console.log('[ROOT] Preview mode forced via ?mode=preview');
        console.log('[ROOT] No camera detected, using 3D preview mode');
        initPreviewMode(canvas, chapel);
        setMode('preview');
        chapel.scene.visible = true;
        setPlaced(true);
      }

      setArReady(true);
    };

    initAR();

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      chapel.dispose();
      if (window.XR8) {
        try { window.XR8.stop(); } catch { /* ignore */ }
      }
      placementRef.current = null;
    };
  }, []);

  // Update chapel when show state changes
  useEffect(() => {
    const chapel = chapelRef.current;
    if (!chapel) return;
    chapel.setPreset(showState.chapelState as EnvironmentPreset, showState.fadeDuration);
    // TEMPORARY: Force ghost visible for skinning test (ignore show state)
    chapel.ghost.setVisible(true);
    // chapel.ghost.setVisible(showState.ghostVisible);
  }, [showState.chapelState, showState.fadeDuration, showState.ghostVisible]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <canvas ref={canvasRef} id="ar-canvas" />

      {/* Blackout overlay */}
      <div className={`blackout ${showState.blackout ? 'active' : ''}`}
           style={{ transition: `opacity ${showState.fadeDuration}s` }} />

      {/* HUD overlay */}
      <HUD showState={showState} relayState={relayState} tapToPlace={!placed} skeletonFrames={skeletonFrames} boneMatchInfo={boneMatchInfo} />

      {/* Face test panel — only in preview/debug mode for phone testing without console */}
      {mode === 'preview' && (
        <div
          // STOP touch propagation so OrbitControls on the canvas can't eat our taps
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',     // fixed beats absolute for guaranteed top
            top: 'max(10px, env(safe-area-inset-top))',
            right: '10px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            zIndex: 9999,           // way above everything
            pointerEvents: 'auto',
            maxWidth: '52vw',
            touchAction: 'manipulation',
          }}
        >
          {/* Status line — confirms taps are being received */}
          <div style={{
            background: 'rgba(0,0,0,0.85)',
            color: '#0f0',
            padding: '6px 10px',
            borderRadius: 4,
            fontSize: '11px',
            fontFamily: 'monospace',
            border: '1px solid #0f0',
            textAlign: 'center',
          }}>
            {lastAction}
          </div>

          <div style={faceTestLabel}>LIP SYNC</div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <FaceBtn label="quiet" onTap={() => {
              chapelRef.current?.ghost.setVoiceLevel(0.25, true);
              setLastAction('lip: quiet ✓');
            }} />
            <FaceBtn label="med" onTap={() => {
              chapelRef.current?.ghost.setVoiceLevel(0.55, true);
              setLastAction('lip: med ✓');
            }} />
            <FaceBtn label="loud" onTap={() => {
              chapelRef.current?.ghost.setVoiceLevel(0.9, true);
              setLastAction('lip: loud ✓');
            }} />
            <FaceBtn label="stop" onTap={() => {
              chapelRef.current?.ghost.setVoiceLevel(0, false);
              setLastAction('lip: stopped');
            }} />
          </div>
          <FaceBtn label="TALK (4s)" big onTap={() => {
            setLastAction('lip: talking...');
            const start = performance.now();
            const id = setInterval(() => {
              const t = (performance.now() - start) / 1000;
              if (t > 4) { clearInterval(id); chapelRef.current?.ghost.setVoiceLevel(0, false); setLastAction('lip: done'); return; }
              const v = 0.5 + 0.3 * Math.sin(t * 6) + 0.1 * Math.sin(t * 13);
              chapelRef.current?.ghost.setVoiceLevel(Math.max(0, v), true);
            }, 30);
          }} />

          <div style={{ ...faceTestLabel, marginTop: 8 }}>EMOTES</div>
          {['happy', 'sad', 'angry', 'surprised', 'confused', 'scared', 'contemplative', 'neutral'].map((emote) => (
            <FaceBtn
              key={emote}
              label={emote}
              onTap={() => {
                chapelRef.current?.ghost.triggerEmote(emote);
                setLastAction(`emote: ${emote} ✓`);
              }}
            />
          ))}
        </div>
      )}


      {/* Judgment panel (Act 5, Scene 7) */}
      {showState.interactionMode === 'judgment' && (
        <JudgmentPanel onSubmit={(years) => {
          send({
            type: 'judgment_vote',
            data: { deviceId: relayState.deviceId, yearsGranted: years },
          });
        }} />
      )}

      {/* Placement controls — only in AR mode before placement */}
      {arReady && !placed && mode === 'ar' && (
        <div style={{
          position: 'absolute',
          bottom: 'max(24px, env(safe-area-inset-bottom))',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'grid',
          gridTemplateColumns: '48px minmax(112px, 34vw) 48px',
          gap: '10px',
          alignItems: 'center',
          zIndex: 40,
          pointerEvents: 'auto',
        }}>
          <button
            aria-label="Rotate left"
            onClick={() => placementRef.current?.rotate(THREE.MathUtils.degToRad(12))}
            style={placementButtonStyle}
          >
            &#8630;
          </button>
          <button
            onClick={() => placementRef.current?.place()}
            onPointerUp={() => placementRef.current?.place()}
            style={{
              ...placementButtonStyle,
              width: '100%',
              minWidth: 112,
              padding: '0 18px',
              opacity: placementReady ? 1 : 0.85,
            }}
          >
            PLACE
          </button>
          <button
            aria-label="Rotate right"
            onClick={() => placementRef.current?.rotate(THREE.MathUtils.degToRad(-12))}
            style={placementButtonStyle}
          >
            &#8631;
          </button>
        </div>
      )}

      {/* Connection status */}
      {!relayState.connected && arReady && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: 'var(--neon-orange)',
          fontFamily: 'var(--font-display)',
          fontSize: '0.8rem',
          textAlign: 'center',
        }}>
          CONNECTING TO SHOW...
        </div>
      )}

      {/* Mode indicator */}
      {arReady && (
        <div style={{
          position: 'absolute',
          top: '3%',
          left: '3%',
          fontSize: '0.6rem',
          color: mode === 'ar' ? 'var(--neon-cyan)' : 'rgba(255,255,255,0.3)',
          fontFamily: 'var(--font-display)',
        }}>
          {mode === 'ar' ? 'AR CAMERA' : 'PREVIEW'}
        </div>
      )}
    </div>
  );
}

// ─── 8th Wall AR Mode ────────────────────────────────────────────

const placementButtonStyle: React.CSSProperties = {
  height: 48,
  border: '1px solid rgba(0, 212, 255, 0.85)',
  borderRadius: 6,
  background: 'rgba(2, 8, 16, 0.82)',
  color: 'var(--neon-cyan)',
  fontFamily: 'var(--font-display)',
  fontSize: '0.9rem',
  textShadow: '0 0 8px var(--neon-cyan)',
  boxShadow: '0 0 14px rgba(0, 212, 255, 0.28)',
  touchAction: 'manipulation',
};

const faceTestLabel: React.CSSProperties = {
  color: '#fff',
  fontSize: '11px',
  fontWeight: 'bold',
  textShadow: '0 0 4px #000',
  textAlign: 'right',
  letterSpacing: '0.1em',
};

const faceBtnStyle: React.CSSProperties = {
  padding: '14px 16px',
  border: '2px solid #ff80c8',
  borderRadius: 8,
  background: 'rgba(40, 8, 50, 0.92)',
  color: '#fff',
  fontSize: '14px',
  fontWeight: 'bold',
  textShadow: '0 0 6px rgba(255, 80, 200, 0.8)',
  boxShadow: '0 0 10px rgba(255, 80, 200, 0.4)',
  touchAction: 'manipulation',
  cursor: 'pointer',
  textAlign: 'center',
  flex: 1,
  WebkitTapHighlightColor: 'transparent',
  WebkitUserSelect: 'none',
  userSelect: 'none',
};

/**
 * Touch-friendly button.
 * Uses onPointerDown (fires immediately, no 300ms tap delay on iOS Safari)
 * and stops event propagation so OrbitControls can't intercept it.
 */
function FaceBtn(props: { label: string; onTap: () => void; big?: boolean }) {
  const [pressed, setPressed] = React.useState(false);
  const fire = (e: React.PointerEvent | React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setPressed(true);
    props.onTap();
    setTimeout(() => setPressed(false), 150);
  };
  return (
    <button
      onPointerDown={fire}
      onTouchStart={fire}
      style={{
        ...faceBtnStyle,
        padding: props.big ? '20px 16px' : '14px 16px',
        fontSize: props.big ? '17px' : '14px',
        background: pressed ? '#ff80c8' : faceBtnStyle.background,
        color: pressed ? '#000' : '#fff',
      }}
    >
      {props.label}
    </button>
  );
}

function initXR8(
  canvas: HTMLCanvasElement,
  chapel: ChapelScene,
  onPlaced: () => void,
  onPlacementReady: (ready: boolean) => void,
): PlacementController {
  const XR8 = window.XR8!;
  let scenePlaced = false;
  let xrElapsed = 0;
  let markerVisible = false;
  let lastTwistAngle: number | null = null;
  let lastDragX: number | null = null;
  let xrCamera: THREE.Camera | null = null;

  // Set canvas to fill viewport at device pixel ratio
  const dpr = Math.min(window.devicePixelRatio, 2);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';

  // Placement marker with directional arrow
  const markerGroup = new THREE.Group();
  markerGroup.visible = false;
  let markerYRotation = Math.PI; // Start facing the audience/user by default.

  // Ring reticle
  const reticleGeo = new THREE.RingGeometry(0.12, 0.15, 32);
  const reticleMat = new THREE.MeshBasicMaterial({
    color: 0x00d4ff, transparent: true, opacity: 0.6, side: THREE.DoubleSide,
  });
  const reticle = new THREE.Mesh(reticleGeo, reticleMat);
  reticle.rotation.x = -Math.PI / 2;
  markerGroup.add(reticle);

  // Inner circle
  const innerGeo = new THREE.CircleGeometry(0.1, 32);
  const innerMat = new THREE.MeshBasicMaterial({
    color: 0x00d4ff, transparent: true, opacity: 0.15, side: THREE.DoubleSide,
  });
  const innerCircle = new THREE.Mesh(innerGeo, innerMat);
  innerCircle.rotation.x = -Math.PI / 2;
  markerGroup.add(innerCircle);

  // Directional arrow (cone + shaft) pointing forward
  const arrowGroup = new THREE.Group();
  // Shaft
  const shaftGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.15, 8);
  const arrowMat = new THREE.MeshBasicMaterial({ color: 0xff4444 });
  const shaft = new THREE.Mesh(shaftGeo, arrowMat);
  shaft.rotation.x = -Math.PI / 2; // Point forward
  shaft.position.z = -0.075;
  arrowGroup.add(shaft);
  // Arrowhead
  const headGeo = new THREE.ConeGeometry(0.03, 0.06, 8);
  const arrowHead = new THREE.Mesh(headGeo, arrowMat);
  arrowHead.rotation.x = -Math.PI / 2;
  arrowHead.position.z = -0.18;
  arrowGroup.add(arrowHead);
  arrowGroup.position.y = 0.005; // Slightly above ground
  markerGroup.add(arrowGroup);

  const applyMarkerRotation = () => {
    markerGroup.rotation.y = markerYRotation;
  };

  const setMarkerVisible = (visible: boolean) => {
    if (markerVisible === visible) return;
    markerVisible = visible;
    markerGroup.visible = visible;
    onPlacementReady(visible && !scenePlaced);
  };

  const placeScene = () => {
    if (scenePlaced) return false;
    if (!markerGroup.visible && xrCamera) {
      updateFallbackMarkerFromCamera(xrCamera);
    }
    if (!markerGroup.visible) return false;

    chapel.scene.position.copy(markerGroup.position);
    chapel.scene.quaternion.setFromAxisAngle(
      new THREE.Vector3(0, 1, 0), markerYRotation + Math.PI,
    );
    chapel.scene.visible = true;
    scenePlaced = true;
    setMarkerVisible(false);
    onPlaced();
    return true;
  };

  const rotateMarker = (deltaRadians: number) => {
    if (scenePlaced) return;
    markerYRotation += deltaRadians;
    applyMarkerRotation();
  };

  const updateFallbackMarkerFromCamera = (camera: THREE.Camera) => {
    const cameraWorldPos = new THREE.Vector3();
    const cameraForward = new THREE.Vector3();
    camera.getWorldPosition(cameraWorldPos);
    camera.getWorldDirection(cameraForward);
    markerGroup.position.copy(cameraWorldPos).add(cameraForward.multiplyScalar(2));
    markerGroup.position.y -= 0.9;
    setMarkerVisible(true);
  };

  applyMarkerRotation();

  const rootModule: XR8PipelineModule = {
    name: 'root-chapel',

    onStart: () => {
      const { scene, renderer, camera } = XR8.Threejs.xrScene();
      xrCamera = camera || null;

      scene.add(chapel.scene);
      scene.add(markerGroup);

      renderer.setPixelRatio(dpr);
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.outputColorSpace = 'srgb';
      if (xrCamera) {
        updateFallbackMarkerFromCamera(xrCamera);
      }

      canvas.addEventListener('touchstart', (e) => {
        if (scenePlaced) return;
        e.preventDefault();

        if (e.touches.length >= 2) {
          const a = e.touches[0];
          const b = e.touches[1];
          lastTwistAngle = Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX);
          lastDragX = null;
          return;
        }

        lastDragX = e.touches.length === 1 ? e.touches[0].clientX : null;
        lastTwistAngle = null;
      }, { passive: false });

      canvas.addEventListener('touchmove', (e) => {
        if (scenePlaced) return;
        e.preventDefault();

        if (e.touches.length >= 2) {
          const a = e.touches[0];
          const b = e.touches[1];
          const angle = Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX);
          if (lastTwistAngle !== null) {
            rotateMarker(angle - lastTwistAngle);
          }
          lastTwistAngle = angle;
          lastDragX = null;
          return;
        }

        if (e.touches.length === 1 && lastDragX !== null) {
          const x = e.touches[0].clientX;
          rotateMarker((x - lastDragX) * 0.008);
          lastDragX = x;
        }
      }, { passive: false });

      canvas.addEventListener('touchend', () => {
        lastTwistAngle = null;
        lastDragX = null;
      });
    },


    onUpdate: () => {
      const delta = 1 / 60;
      xrElapsed += delta;
      chapel.update(delta);

      // Arm swing test — only when no Quest skeleton data is flowing
      if (chapel.ghost.frameCount === 0) {
        const testBone = (window as any).__testBone;
        const testSkel = (window as any).__testSkeleton;
        if (testBone && testSkel) {
          const angle = Math.sin(xrElapsed * 2) * 0.8;
          testBone.quaternion.setFromAxisAngle(
            new THREE.Vector3(0, 0, 1), angle
          );
          testBone.updateMatrix();
          testBone.updateMatrixWorld(true);
          testSkel.update();
        }
      }

      // Show placement marker at center of screen before placement
      if (!scenePlaced) {
        try {
          const hits = XR8.XrController.hitTest(0.5, 0.5, ['FEATURE_POINT']);
          if (hits && hits.length > 0) {
            markerGroup.position.set(hits[0].position.x, hits[0].position.y, hits[0].position.z);
            setMarkerVisible(true);
          } else {
            if (xrCamera) {
              updateFallbackMarkerFromCamera(xrCamera);
            } else {
              setMarkerVisible(false);
            }
          }
        } catch {
          if (xrCamera) {
            updateFallbackMarkerFromCamera(xrCamera);
          }
        }
      }
    },
  };

  XR8.addCameraPipelineModules([
    XR8.GlTextureRenderer.pipelineModule(),
    XR8.Threejs.pipelineModule(),
    XR8.XrController.pipelineModule(),
    rootModule,
  ]);

  XR8.run({ canvas });

  return {
    place: placeScene,
    rotate: rotateMarker,
  };
}

// ─── Fallback Preview Mode ───────────────────────────────────────

function initPreviewMode(canvas: HTMLCanvasElement, chapel: ChapelScene) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x050108, 1);

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    200,
  );
  // Start framed on her face for blendshape testing.
  // Pluto's face is ~1.7m up; sit ~80cm in front so face fills frame.
  camera.position.set(0, 1.65, 1.0);
  camera.lookAt(0, 1.65, 0);

  // Preview mode: scene visible immediately (no AR placement needed)
  chapel.scene.visible = true;

  // Async-import OrbitControls so phone can pinch/zoom and orbit
  import('three/examples/jsm/controls/OrbitControls.js').then(({ OrbitControls }) => {
    const controls = new OrbitControls(camera, canvas);
    controls.target.set(0, 1.65, 0);   // orbit around face
    controls.minDistance = 0.3;          // can pinch in close
    controls.maxDistance = 12;           // zoom out for full body
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.enablePan = true;
    controls.update();
    (window as any).__previewControls = controls;
    console.log('[ROOT] Preview controls ready: drag to orbit, pinch to zoom');
  });

  // Bloom is now done via a per-mesh glow shell (added inside GhostAvatar.loadModel)
  // rather than a screen-space post-processing pass. Why: post-processing bloom
  // can't tell "rim light" from "bright body texel" — it blooms everything above
  // its threshold, washing out the body. The shell mesh approach only emits glow
  // OUTSIDE the silhouette via inflated backfaces, keeping the body untouched.

  const clock = new THREE.Clock();

  const animate = () => {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    chapel.update(delta);
    const controls = (window as any).__previewControls;
    if (controls) controls.update();

    renderer.render(chapel.scene, camera);
  };
  animate();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}
