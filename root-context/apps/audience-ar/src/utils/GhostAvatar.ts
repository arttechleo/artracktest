/**
 * GhostAvatar - Manages the ghost character's 3D mesh with aura effects.
 *
 * Receives skeleton data from Quest 3 via WebSocket and applies it
 * to a Three.js skeleton in real-time. Renders the ghostly translucent
 * avatar with voice-reactive aura glow.
 */

import * as THREE from 'three';
import {
  ghostAuraVertexShader,
  ghostAuraFragmentShader,
  auraShellVertexShader,
  auraShellFragmentShader,
  EMOTION_COLORS,
} from '../shaders/ghostAura';
import { PlutoFace } from './PlutoFace';

export interface AuraParams {
  color: [number, number, number];
  intensity: number;
  pulseRate: number;
  emotion: string;
}

interface BoneTransformData {
  name: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
  worldPos?: { x: number; y: number; z: number };
  worldRot?: { x: number; y: number; z: number; w: number };
}

interface SkeletonFrameData {
  rootPosition: { x: number; y: number; z: number };
  rootRotation: { x: number; y: number; z: number; w: number };
  bones: BoneTransformData[];
  timestamp: number;
}

interface BoneRotationMapping {
  unityRestWorldQ: THREE.Quaternion;
  unityRestLocalQ: THREE.Quaternion;
  glbRestLocalQ: THREE.Quaternion;
  worldMapping?: THREE.Quaternion;
  localMapping: THREE.Quaternion;
}

// Bone connections for drawing debug skeleton lines
const SKELETON_CONNECTIONS: [string, string][] = [
  ['Hips', 'Spine'], ['Spine', 'Spine1'], ['Spine1', 'Spine2'],
  ['Spine2', 'Neck'], ['Neck', 'Head'],
  ['Spine2', 'LeftShoulder'], ['LeftShoulder', 'LeftArm'],
  ['LeftArm', 'LeftForeArm'], ['LeftForeArm', 'LeftHand'],
  ['Spine2', 'RightShoulder'], ['RightShoulder', 'RightArm'],
  ['RightArm', 'RightForeArm'], ['RightForeArm', 'RightHand'],
  ['Hips', 'LeftUpLeg'], ['LeftUpLeg', 'LeftLeg'],
  ['LeftLeg', 'LeftFoot'], ['LeftFoot', 'LeftToeBase'],
  ['Hips', 'RightUpLeg'], ['RightUpLeg', 'RightLeg'],
  ['RightLeg', 'RightFoot'], ['RightFoot', 'RightToeBase'],
];

export class GhostAvatar {
  group: THREE.Group;
  private ghostMaterial: THREE.ShaderMaterial;
  private auraMaterial: THREE.ShaderMaterial;
  private bones: Map<string, THREE.Bone> = new Map();
  private clock = new THREE.Clock();

  // Debug skeleton
  debugGroup: THREE.Group;
  private debugLines: THREE.LineSegments | null = null;
  private debugJoints: THREE.Points | null = null;
  frameCount = 0;
  matchedBones = 0;  // How many Quest bones matched model bones
  totalQuestBones = 0;  // How many bones the Quest sent
  firstMissName = '';  // First bone name that didn't match
  firstMapName = '';   // First name in our bone map
  get boneMapSize() { return this.bones.size; }

  // Interpolation buffers (2 frames for lerp)
  private prevFrame: SkeletonFrameData | null = null;
  private currFrame: SkeletonFrameData | null = null;
  private interpT = 0;

  // Reference to the skinned mesh for manual skeleton updates
  private skinnedMeshes: any[] = [];

  // Facial blendshape controller (lip sync, blinks, emotes).
  // Stays null + no-op until Pluto v2 with morph targets is loaded.
  private plutoFace: PlutoFace | null = null;

  // World-rotation retargeting:
  // At calibration: compute the transform from Unity world space → AR world space
  // Each frame: convert Unity world rotations to AR world, set on bones
  private glbRestQuats: Map<string, THREE.Quaternion> = new Map();
  private glbRestWorldPos: Map<string, THREE.Vector3> = new Map();
  private glbRestAimDirs: Map<string, THREE.Vector3> = new Map();
  private glbRestHipsPos: THREE.Vector3 | null = null;
  private unityRestHipsPos: THREE.Vector3 | null = null;
  // Per-bone: mapping from Unity world rotation to GLB local rotation at rest
  // boneMapping = inv(parentWorldQuat_glb) * calibWorldQuat_ar
  // where calibWorldQuat_ar = coordTransform * unityWorldQuat_calib
  private boneWorldToLocal: Map<string, BoneRotationMapping> = new Map();
  // Rest world positions for position conversion
  private restWorldPos: Map<string, THREE.Vector3> = new Map();
  private unityRestQuats: Map<string, THREE.Quaternion> = new Map();
  // Raw Unity world rotations at calibration time — used for Hips retargeting
  // because Hips LOCAL rotation often stays ~identity (body turn lives in parent
  // transform), so we must use WORLD rotation to capture body orientation.
  private unityRestWorldRotRaw: Map<string, THREE.Quaternion> = new Map();
  private _calibrated = false;

  // Show states
  private _avatarState: 'normal' | 'frozen' | 'hacked' = 'normal';
  private _glitchTime = 0;
  private _glowShell: any = null; // Outer glow shell mesh
  calibrationStatus = 'waiting'; // Exposed for HUD

  // Aura state. Starts silent (intensity 0) so the rim glow ramps up
  // naturally when voice_level messages arrive. Blue tone matches shader default.
  private targetAura: AuraParams = {
    color: [0.1, 0.55, 1.0],
    intensity: 0.0,
    pulseRate: 1.0,
    emotion: 'neutral',
  };
  private currentAura: AuraParams = { ...this.targetAura };

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'GhostAvatar';

    // Debug wireframe skeleton group (overlaid on top of avatar)
    this.debugGroup = new THREE.Group();
    this.debugGroup.name = 'DebugSkeleton';
    this.debugGroup.position.set(0, 0, 0); // Same position as avatar
    this.createDebugSkeleton();
    this.group.add(this.debugGroup);

    // Ghost body material — USE_SKINNING define is required for
    // #include <skinning_pars_vertex> to generate actual GLSL code
    this.ghostMaterial = new THREE.ShaderMaterial({
      vertexShader: ghostAuraVertexShader,
      fragmentShader: ghostAuraFragmentShader,
      defines: { USE_SKINNING: '', USE_MORPHTARGETS: '', USE_MORPHNORMALS: '' },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uAuraColor: { value: new THREE.Color(0.0, 0.8, 1.0) },
        uIntensity: { value: 0.3 },
        uPulseRate: { value: 1.0 },
        uEmotionBlend: { value: 0.0 },
        uEmotionColor: { value: new THREE.Color(0.0, 0.8, 1.0) },
        uOpacity: { value: 0.6 },
        uFresnelPower: { value: 3.0 },
      },
    });

    // Aura shell material (outer glow, also needs skinning)
    this.auraMaterial = new THREE.ShaderMaterial({
      vertexShader: auraShellVertexShader,
      fragmentShader: auraShellFragmentShader,
      defines: { USE_SKINNING: '', USE_MORPHTARGETS: '', USE_MORPHNORMALS: '' },
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
      uniforms: {
        uTime: { value: 0 },
        uExpand: { value: 0.08 },
        uAuraColor: { value: new THREE.Color(0.0, 0.8, 1.0) },
        uIntensity: { value: 0.3 },
        uPulseRate: { value: 1.0 },
        uEmotionColor: { value: new THREE.Color(0.0, 0.8, 1.0) },
        uEmotionBlend: { value: 0.0 },
      },
    });

    // No placeholder — model loads directly
  }

  /**
   * Load a GLB model and replace the placeholder.
   * Extracts the skeleton for mocap-driven animation.
   */
  async loadModel(url: string) {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const loader = new GLTFLoader();

    return new Promise<void>((resolve, reject) => {
      loader.load(
        url,
        (gltf) => {
          // Clear placeholder
          while (this.group.children.length) {
            this.group.remove(this.group.children[0]);
          }

          const model = gltf.scene;

          // Get bones directly from SkinnedMesh skeleton —
          // this guarantees we modify the EXACT bone objects that drive the mesh
          model.traverse((child: any) => {
            if (child.isSkinnedMesh) {
              console.log(`[ROOT] Found SkinnedMesh: "${child.name}", skeleton has ${child.skeleton.bones.length} bones`);

              // Index bones from the skeleton (these are the actual deforming bones)
              for (const bone of child.skeleton.bones) {
                const boneName = bone.name
                  .replace(/^mixamorig:?/, '')
                  .replace(/^Armature_/, '');
                this.bones.set(boneName, bone);
                if (boneName !== bone.name) {
                  this.bones.set(bone.name, bone);
                }
                console.log(`  bone: "${bone.name}" → "${boneName}"`);
              }

              child.castShadow = false;
              child.receiveShadow = false;
              child.frustumCulled = false;
              this.skinnedMeshes.push(child);

              // Detect mesh role by name. Eyes and teeth are INSIDE the head —
              // they should be opaque and render BEFORE the body so the body's depth
              // properly occludes them. Only the body/face gets the ghost shader.
              const meshName = (child.name || '').toLowerCase();
              const isEyeOrTeeth = meshName.includes('eye') || meshName.includes('teeth') || meshName.includes('tooth');

              if (isEyeOrTeeth) {
                // Keep original material but ensure it writes depth and renders first.
                // Crank emissive a touch so it doesn't look dead inside the ghost body.
                const origStd = child.material as THREE.MeshStandardMaterial;
                if (origStd) {
                  origStd.transparent = false;
                  origStd.depthWrite = true;
                  origStd.depthTest = true;
                  origStd.side = THREE.FrontSide;
                  if ('emissive' in origStd) {
                    (origStd as any).emissive = new THREE.Color(0.15, 0.15, 0.2);
                    (origStd as any).emissiveIntensity = 0.4;
                  }
                  origStd.needsUpdate = true;
                }
                child.renderOrder = 0;
                console.log(`[ROOT] Kept original material on "${child.name}" (interior mesh)`);
              } else {
                // Body / face: apply ghost aura shader.
                // Voice-reactive rim-edge glow: faint blue halo when silent,
                // dramatic bright pulsing rim when she's speaking.
                const origMat = child.material as THREE.MeshStandardMaterial;
                const origMap = origMat?.map || null;
                this.ghostMaterial = new THREE.ShaderMaterial({
                  vertexShader: ghostAuraVertexShader,
                  fragmentShader: `
                    uniform sampler2D uBaseMap;
                    uniform float uTime;
                    uniform vec3 uAuraColor;
                    uniform float uIntensity;
                    uniform float uPulseRate;
                    uniform float uEmotionBlend;
                    uniform vec3 uEmotionColor;
                    uniform float uOpacity;
                    uniform float uFresnelPower;

                    varying vec3 vNormal;
                    varying vec3 vWorldPosition;
                    varying vec2 vUv;

                    void main() {
                      vec4 texColor = texture2D(uBaseMap, vUv);

                      // Fresnel = 1 at silhouette edges, 0 at faces pointed at camera
                      vec3 viewDir = normalize(cameraPosition - vWorldPosition);
                      float fresnel = pow(1.0 - max(dot(viewDir, vNormal), 0.0), uFresnelPower);

                      // Speech detection: smooth ramp from "noise floor" to "clearly talking".
                      // Below 0.04 volume = essentially silent; above 0.4 = full speaking glow.
                      float speakBoost = smoothstep(0.04, 0.40, uIntensity);

                      // Quiet ambient breath pulse (slow, subtle, always on)
                      float breath = sin(uTime * 1.4) * 0.5 + 0.5;
                      // Active speaking pulse (faster, tied to uPulseRate)
                      float speechPulse = sin(uTime * uPulseRate * 6.2832) * 0.5 + 0.5;
                      // Blend: when silent, use slow breath; when speaking, use speech pulse
                      float pulse = mix(breath * 0.5, speechPulse, speakBoost);

                      vec3 auraColor = mix(uAuraColor, uEmotionColor, uEmotionBlend);

                      // Body keeps its texture, mild aura tint (so she still reads as Pluto)
                      vec3 bodyColor = texColor.rgb * 0.92 + auraColor * 0.08;

                      // Rim glow has TWO layers:
                      //   1) Faint always-on ghostly halo (so she always reads as supernatural)
                      //   2) Dramatic speech-driven brightening on top
                      float baselineRim = fresnel * 0.35;                              // soft halo at rest
                      float speechRim = fresnel * speakBoost * (1.6 + 0.7 * pulse);    // bright when speaking
                      vec3 rimGlow = auraColor * (baselineRim + speechRim);

                      vec3 finalColor = bodyColor + rimGlow;

                      // Body opacity: high floor so inner geometry doesn't show through.
                      // A tiny boost when speaking adds presence.
                      float baseAlpha = uOpacity * (0.95 + 0.05 * speakBoost);
                      float finalAlpha = clamp(baseAlpha + fresnel * 0.05, 0.95, 1.0);

                      gl_FragColor = vec4(finalColor, finalAlpha);
                    }
                  `,
                  defines: { USE_SKINNING: '', USE_MORPHTARGETS: '', USE_MORPHNORMALS: '' },
                  transparent: true,
                  depthWrite: true,
                  side: THREE.FrontSide,
                  uniforms: {
                    uBaseMap: { value: origMap },
                    uTime: { value: 0 },
                    // Blue rim color. Slightly more saturated cyan-blue reads well in AR.
                    uAuraColor: { value: new THREE.Color(0.1, 0.55, 1.0) },
                    uIntensity: { value: 0.0 },   // start silent, voice_level updates it
                    uPulseRate: { value: 1.0 },
                    uEmotionBlend: { value: 0.0 },
                    uEmotionColor: { value: new THREE.Color(0.1, 0.55, 1.0) },
                    uOpacity: { value: 1.0 },
                    uFresnelPower: { value: 2.5 },  // thinner, sharper rim line
                  },
                });
                child.material = this.ghostMaterial;
                child.renderOrder = 2;

                // ── Outer glow shell ──
                // Duplicate of the body mesh inflated slightly along normals,
                // rendered with backface culling reversed + additive blending +
                // pure aura color. Result: a soft glow halo OUTSIDE the silhouette
                // that intensifies when speaking, without touching body pixels.
                // (Vertex shader expands along normals; fragment shader is rim-only.)
                const shellMaterial = new THREE.ShaderMaterial({
                  vertexShader: auraShellVertexShader,
                  fragmentShader: auraShellFragmentShader,
                  defines: {
                    USE_SKINNING: '',
                    USE_MORPHTARGETS: '',
                    USE_MORPHNORMALS: '',
                  },
                  transparent: true,
                  depthWrite: false,           // don't occlude anything; we're just glow
                  depthTest: true,             // still get hidden behind the body where it covers us
                  blending: THREE.AdditiveBlending,
                  side: THREE.FrontSide,       // front-facing fresnel — high at silhouette edges
                  uniforms: {
                    uTime: { value: 0 },
                    uExpand: { value: 0.025 },     // ~2.5cm outward bulge
                    uAuraColor: { value: new THREE.Color(0.1, 0.55, 1.0) },
                    uIntensity: { value: 0.0 },
                    uPulseRate: { value: 1.0 },
                    uEmotionColor: { value: new THREE.Color(0.1, 0.55, 1.0) },
                    uEmotionBlend: { value: 0.0 },
                  },
                });
                // Create a SkinnedMesh clone that shares the skeleton so it deforms with bones.
                const shellMesh = new THREE.SkinnedMesh(child.geometry, shellMaterial);
                shellMesh.skeleton = child.skeleton;
                shellMesh.bindMode = child.bindMode;
                shellMesh.bindMatrix.copy(child.bindMatrix);
                shellMesh.bindMatrixInverse.copy(child.bindMatrixInverse);
                shellMesh.bind(child.skeleton, child.bindMatrix);
                shellMesh.frustumCulled = false;
                shellMesh.renderOrder = 1;          // render BEFORE body so body draws over solid parts
                child.parent?.add(shellMesh);
                this._glowShell = shellMesh;
                this.auraMaterial = shellMaterial;  // so the update loop's existing uniforms code finds it
                console.log('[ROOT] Glow shell attached — rim-light bloom enabled, body untouched');
              }

              const hasTransformOnSkinnedMesh =
                child.position.lengthSq() > 0.000001
                || child.quaternion.angleTo(new THREE.Quaternion()) > 0.0001
                || Math.abs(child.scale.x - 1) > 0.0001
                || Math.abs(child.scale.y - 1) > 0.0001
                || Math.abs(child.scale.z - 1) > 0.0001;
              if (hasTransformOnSkinnedMesh) {
                console.warn(
                  `[ROOT] SkinnedMesh "${child.name}" has non-identity transform. `
                  + 'If Pluto deforms badly, export/bake the mesh and armature to identity transforms.',
                );
              }

              // Expose skeleton for direct arm swing test (same approach that worked for Soldier)
              const leftArm = child.skeleton?.bones?.find(
                (b: any) => b.name.includes('LeftArm') && !b.name.includes('Fore')
              );
              if (leftArm) {
                console.log(`[ROOT] Found LeftArm for swing test: "${leftArm.name}"`);
                (window as any).__testBone = leftArm;
                (window as any).__testSkeleton = child.skeleton;
                (window as any).__testMesh = child;
              }
            } else if (child.isMesh) {
              child.castShadow = false;
              child.receiveShadow = false;
            }
          });

          console.log(`[ROOT] Indexed ${this.bones.size} bones total`);

          // ── Teeth rigid-rig workaround ──
          // The v16 model has teeth weighted across 108 vertex groups (artist bug)
          // which causes teeth to NOT follow the head when it rotates.
          // Force-override teeth skinning: every vertex 100% weighted to head bone.
          // Side effect: jawOpen blendshape still works because shape keys are
          // vertex DELTAS in mesh local space, applied before skinning.
          try {
            const teethMesh = this.skinnedMeshes.find(
              (m: any) => (m.name || '').toLowerCase().includes('teeth')
            );
            if (teethMesh?.skeleton) {
              const headBoneIndex = teethMesh.skeleton.bones.findIndex(
                (b: any) => b.name.includes('Head') && !b.name.includes('HeadTop')
              );
              if (headBoneIndex >= 0) {
                const skinIndexAttr = teethMesh.geometry.attributes.skinIndex;
                const skinWeightAttr = teethMesh.geometry.attributes.skinWeight;
                const vertCount = skinIndexAttr.count;
                for (let i = 0; i < vertCount; i++) {
                  skinIndexAttr.setXYZW(i, headBoneIndex, 0, 0, 0);
                  skinWeightAttr.setXYZW(i, 1, 0, 0, 0);
                }
                skinIndexAttr.needsUpdate = true;
                skinWeightAttr.needsUpdate = true;
                console.log(`[ROOT] Re-rigged Teeth: ${vertCount} verts → 100% Head bone (idx ${headBoneIndex})`);
              } else {
                console.warn('[ROOT] Teeth re-rig skipped: no Head bone found in skeleton');
              }
            }
          } catch (err) {
            console.warn('[ROOT] Teeth re-rig failed (non-fatal):', err);
          }

          // ── Pick up morph-driven meshes that aren't SkinnedMesh ──
          // v16 ships EyeRight as a plain Mesh (no JOINTS_0/WEIGHTS_0 in GLB)
          // because the artist didn't bind it to the armature for skinning.
          // BUT EyeRight is parented to `mixamorig:RightEye` bone in the
          // scene graph hierarchy, so it ALREADY follows head movement
          // via normal parent-child transform inheritance — no skinning needed.
          //
          // The only issue was that PlutoFace previously took SkinnedMesh[] only,
          // so EyeRight's morph targets (eyeLookOutRight, etc.) were never
          // indexed → never driven → right eye stayed static while left moved.
          //
          // Just add such meshes to the morph-drive list. DO NOT re-parent
          // them — they're already in the correct place in the hierarchy.
          const morphMeshes: THREE.Mesh[] = [...this.skinnedMeshes];
          const collectedNonSkinned: THREE.Mesh[] = [];
          model.traverse((child: any) => {
            if (
              child.isMesh
              && !child.isSkinnedMesh
              && child.morphTargetDictionary
              && Object.keys(child.morphTargetDictionary).length > 0
            ) {
              collectedNonSkinned.push(child);
            }
          });
          for (const child of collectedNonSkinned) {
            const shapeNames = Object.keys((child as any).morphTargetDictionary);
            console.log(
              `[ROOT] Including non-skinned mesh "${child.name}" with ${shapeNames.length} morphs in face pipeline. Parent: ${child.parent?.name || '?'}`
            );
            // Match the eye/teeth material treatment so it renders consistently.
            const std = child.material as THREE.MeshStandardMaterial;
            if (std) {
              std.transparent = false;
              std.depthWrite = true;
              std.depthTest = true;
              std.side = THREE.FrontSide;
              if ('emissive' in std) {
                (std as any).emissive = new THREE.Color(0.15, 0.15, 0.2);
                (std as any).emissiveIntensity = 0.4;
              }
              std.needsUpdate = true;
            }
            (child as any).renderOrder = 0;
            morphMeshes.push(child);
          }

          // Initialize face controller (lip sync, blinks, emotes).
          // No-op if loaded model has no morph targets.
          this.plutoFace = new PlutoFace(morphMeshes);

          // Add model to group.
          // Dynamic Y offset: compute the model's bbox min and shift so feet sit at y=0.
          // This works regardless of where the artist placed the model's origin
          // (v1 Pluto had origin at hips; v16 has origin at feet — different offsets).
          model.updateMatrixWorld(true);
          const groundingBox = new THREE.Box3().setFromObject(model);
          model.position.y = -groundingBox.min.y;
          console.log(`[ROOT] Grounded model: bbox.min.y was ${groundingBox.min.y.toFixed(3)}, offset by ${model.position.y.toFixed(3)}`);
          this.group.add(model);

          // Store each bone's GLB rest quaternion for delta retargeting.
          // When Quest data arrives, we compute: offset = glbRest * inv(unityRest)
          // Then each frame: bone.quaternion = offset * unityCurrent
          // This automatically handles ALL coordinate system differences.
          for (const [name, bone] of this.bones.entries()) {
            // Only store once per bone (we have both stripped and original names)
            if (!this.glbRestQuats.has(name)) {
              this.glbRestQuats.set(name, bone.quaternion.clone());
            }
          }
          model.updateMatrixWorld(true);
          for (const [name, bone] of this.bones.entries()) {
            if (!this.glbRestWorldPos.has(name)) {
              const worldPos = new THREE.Vector3();
              bone.getWorldPosition(worldPos);
              this.glbRestWorldPos.set(name, worldPos);
            }
          }
          for (const [name, bone] of this.bones.entries()) {
            const childName = this.getChildBoneName(name);
            const child = childName ? this.findBone(childName) : undefined;
            if (child && !this.glbRestAimDirs.has(name)) {
              const restDirInParent = child.position.clone().normalize();
              restDirInParent.applyQuaternion(bone.quaternion);
              this.glbRestAimDirs.set(name, restDirInParent.normalize());
            }
          }
          // Store Hips rest position
          const hips = this.findBone('Hips');
          if (hips) {
            this.glbRestHipsPos = hips.position.clone();
          }
          console.log(`[ROOT] Stored ${this.glbRestQuats.size} rest quaternions for delta retargeting`);

          // Log actual bounding box to verify size
          const box = new THREE.Box3().setFromObject(model);
          const size = box.getSize(new THREE.Vector3());
          console.log(`[ROOT] Model bbox size: ${size.x.toFixed(3)} x ${size.y.toFixed(3)} x ${size.z.toFixed(3)}`);
          console.log(`[ROOT] Model bbox min: ${box.min.x.toFixed(3)}, ${box.min.y.toFixed(3)}, ${box.min.z.toFixed(3)}`);
          console.log(`[ROOT] Model bbox max: ${box.max.x.toFixed(3)}, ${box.max.y.toFixed(3)}, ${box.max.z.toFixed(3)}`);

          resolve();
        },
        undefined,
        reject,
      );
    });
  }

  /** Create debug wireframe skeleton visualization */
  private createDebugSkeleton() {
    // Line segments for bone connections
    const lineGeo = new THREE.BufferGeometry();
    const linePositions = new Float32Array(SKELETON_CONNECTIONS.length * 6); // 2 points * 3 coords per line
    lineGeo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
    const lineMat = new THREE.LineBasicMaterial({ color: 0xff00ff, linewidth: 2 });
    this.debugLines = new THREE.LineSegments(lineGeo, lineMat);
    this.debugGroup.add(this.debugLines);

    // Points for joint positions
    const jointGeo = new THREE.BufferGeometry();
    const jointPositions = new Float32Array(55 * 3); // max 55 bones
    jointGeo.setAttribute('position', new THREE.BufferAttribute(jointPositions, 3));
    const jointMat = new THREE.PointsMaterial({ color: 0x00ff00, size: 0.05, sizeAttenuation: true });
    this.debugJoints = new THREE.Points(jointGeo, jointMat);
    this.debugGroup.add(this.debugJoints);
  }

  private unityWorldPositionToThree(p: { x: number; y: number; z: number }) {
    return new THREE.Vector3(p.x, p.y, -p.z);
  }

  private unityWorldQuatToThree(q: { x: number; y: number; z: number; w: number }) {
    return new THREE.Quaternion(-q.x, -q.y, q.z, q.w).normalize();
  }

  /** Update debug skeleton from raw bone data using world positions */
  private updateDebugSkeleton(frame: SkeletonFrameData) {
    if (!this.debugLines || !this.debugJoints) return;

    const hips = frame.bones.find(b => b.name === 'Hips');
    const hipsPos = hips
      ? this.unityWorldPositionToThree(hips.worldPos || hips.position)
      : null;
    const debugHipsAnchor = this.glbRestHipsPos || new THREE.Vector3();

    // Build a map of bone name -> avatar-local position in Three.js coordinates.
    const bonePositions = new Map<string, THREE.Vector3>();
    for (const bone of frame.bones) {
      const wp = bone.worldPos || bone.position;
      const p = this.unityWorldPositionToThree(wp);
      if (hipsPos) p.sub(hipsPos).add(debugHipsAnchor);
      bonePositions.set(bone.name, p);
    }

    // Update joint points (green dots at each bone)
    // World positions used directly (no scaling) — they're in meters.
    const jointPos = this.debugJoints.geometry.attributes.position as THREE.BufferAttribute;
    let jointIdx = 0;
    for (const bone of frame.bones) {
      if (jointIdx < 55) {
        const wp = bone.worldPos || bone.position;
        const p = this.unityWorldPositionToThree(wp);
        if (hipsPos) p.sub(hipsPos).add(debugHipsAnchor);
        jointPos.setXYZ(jointIdx, p.x, p.y, p.z);
        jointIdx++;
      }
    }
    jointPos.needsUpdate = true;
    this.debugJoints.geometry.setDrawRange(0, jointIdx);

    // Update line segments (magenta lines connecting bones) — convert coords
    const linePos = this.debugLines.geometry.attributes.position as THREE.BufferAttribute;
    let lineIdx = 0;
    for (const [parentName, childName] of SKELETON_CONNECTIONS) {
      const p = bonePositions.get(parentName);
      const c = bonePositions.get(childName);
      if (p && c) {
        linePos.setXYZ(lineIdx * 2, p.x, p.y, p.z);
        linePos.setXYZ(lineIdx * 2 + 1, c.x, c.y, c.z);
        lineIdx++;
      }
    }
    linePos.needsUpdate = true;
    this.debugLines.geometry.setDrawRange(0, lineIdx * 2);
  }

  /** Handle calibration message from Quest — stores T-pose rest rotations */
  handleCalibration(data: any) {
    if (!data.bones || this.glbRestQuats.size === 0) {
      console.warn('[ROOT] Calibration received but model not loaded yet');
      return;
    }

    // Store rest data for world-rotation retargeting
    this.unityRestQuats.clear();
    this.restWorldPos.clear();
    this.boneWorldToLocal.clear();
    this.unityRestWorldRotRaw.clear();

    // Step 1: Put GLB bones in rest pose and update world matrices
    for (const [name, q] of this.glbRestQuats.entries()) {
      const bone = this.bones.get(name);
      if (bone) {
        bone.quaternion.copy(q);
      }
    }
    // Update all skeleton matrices
    for (const sm of this.skinnedMeshes) {
      if (sm.skeleton) {
        sm.skeleton.bones.forEach((b: any) => {
          b.updateMatrix();
          b.updateMatrixWorld(true);
        });
      }
    }

    // Step 2: For each bone, store the mapping from Unity world rotation to GLB local rotation
    for (const boneData of data.bones) {
      const r = boneData.rotation;
      // Store RAW Unity local quaternion (no coordinate conversion) — used by
      // applyDeltaYawFlipRetarget which computes delta from rest then flips Y.
      this.unityRestQuats.set(boneData.name, new THREE.Quaternion(r.x, r.y, r.z, r.w));
      // Store RAW Unity world quaternion too (used by Hips retargeting).
      if (boneData.worldRot) {
        const wr = boneData.worldRot;
        this.unityRestWorldRotRaw.set(
          boneData.name,
          new THREE.Quaternion(wr.x, wr.y, wr.z, wr.w),
        );
      }

      const wp = boneData.worldPos || boneData.position;
      this.restWorldPos.set(boneData.name, this.unityWorldPositionToThree(wp));

      if (boneData.worldRot) {
        const bone = this.findBone(boneData.name);
        if (bone) {
          const unityWorldQ = this.unityWorldQuatToThree(boneData.worldRot);

          // GLB world rotation at T-pose
          const glbWorldQ = new THREE.Quaternion();
          bone.getWorldQuaternion(glbWorldQ);

          // The mapping: glbWorld = mapping * unityWorld
          // So: mapping = glbWorld * inv(unityWorld)
          const mapping = glbWorldQ.clone().multiply(unityWorldQ.clone().invert());
          const glbRestLocalQ = this.getGlbRestQuat(boneData.name) || new THREE.Quaternion();
          const unityRestLocalQ = new THREE.Quaternion(r.x, r.y, r.z, r.w);

          this.boneWorldToLocal.set(boneData.name, {
            unityRestWorldQ: unityWorldQ,
            unityRestLocalQ,
            glbRestLocalQ,
            worldMapping: mapping,
            localMapping: glbRestLocalQ.clone().multiply(unityRestLocalQ.clone().invert()),
          });
        }
      }
    }

    const hipsData = data.bones.find((b: any) => b.name === 'Hips');
    if (hipsData) {
      // Store WORLD position for root motion (not local)
      const hwp = hipsData.worldPos || hipsData.position;
      this.unityRestHipsPos = this.unityWorldPositionToThree(hwp);
    }

    this._calibrated = true;
    this.calibrationStatus = `calibrated (${this.boneWorldToLocal.size} bones)`;
    console.log(`[ROOT] CALIBRATED with ${this.boneWorldToLocal.size} world rotation mappings`);
  }

  /** Receive a skeleton frame from Quest 3 via WebSocket */
  pushSkeletonFrame(frame: SkeletonFrameData) {
    this.frameCount++;
    if (this.frameCount <= 3 || this.frameCount % 100 === 0) {
      console.log(`[ROOT] Skeleton frame #${this.frameCount} | ${frame.bones.length} bones`);
    }

    // Auto-calibrate fallback: if no calibrate message after 30 frames,
    // use current frame as rest pose (no T-pose required)
    if (!this._calibrated && this.frameCount >= 30 && this.glbRestQuats.size > 0) {
      console.log('[ROOT] Auto-calibrating from frame (no calibrate message received)');
      this.handleCalibration({ bones: frame.bones });
    }

    this.prevFrame = this.currFrame;
    this.currFrame = frame;
    this.interpT = 0;

    // Update debug skeleton
    this.updateDebugSkeleton(frame);
  }

  /** Update aura parameters (from voice/emotion data) */
  setAura(params: Partial<AuraParams>) {
    Object.assign(this.targetAura, params);
  }

  // Diagnostic tracking
  private _skinTestLogged = false;
  private _skinTestFrame = 0;

  /** Called every render frame */
  update(deltaTime: number) {
    const elapsed = this.clock.getElapsedTime();

    // Smooth aura transitions
    const lerpSpeed = 5 * deltaTime;
    this.currentAura.intensity += (this.targetAura.intensity - this.currentAura.intensity) * lerpSpeed;
    this.currentAura.pulseRate += (this.targetAura.pulseRate - this.currentAura.pulseRate) * lerpSpeed;
    for (let i = 0; i < 3; i++) {
      this.currentAura.color[i] += (this.targetAura.color[i] - this.currentAura.color[i]) * lerpSpeed;
    }

    // Get emotion color
    const emotionColor = EMOTION_COLORS[this.targetAura.emotion] || EMOTION_COLORS.neutral;
    const emotionBlend = this.targetAura.emotion !== 'neutral' ? 0.6 : 0.0;

    // Update ghost aura shader uniforms
    if (this.ghostMaterial?.uniforms?.uTime) {
      this.ghostMaterial.uniforms.uTime.value = elapsed;
      this.ghostMaterial.uniforms.uAuraColor.value.setRGB(...this.currentAura.color);
      this.ghostMaterial.uniforms.uIntensity.value = this.currentAura.intensity;
      this.ghostMaterial.uniforms.uPulseRate.value = this.currentAura.pulseRate;
      if (this.ghostMaterial.uniforms.uEmotionColor) {
        this.ghostMaterial.uniforms.uEmotionColor.value.setRGB(...emotionColor);
        this.ghostMaterial.uniforms.uEmotionBlend.value = emotionBlend;
      }
    }

    // Update outer glow shell uniforms
    if (this._glowShell?.material?.uniforms) {
      const gu = this._glowShell.material.uniforms;
      gu.uTime.value = elapsed;
      gu.uAuraColor.value.setRGB(...this.currentAura.color);
      gu.uIntensity.value = this.currentAura.intensity;
      gu.uPulseRate.value = this.currentAura.pulseRate;
      gu.uEmotionColor.value.setRGB(...emotionColor);
      gu.uEmotionBlend.value = emotionBlend;
    }

    // ─── SKINNING DIAGNOSTIC ────────────────────────────────
    this._skinTestFrame++;
    if (this.skinnedMeshes.length > 0 && this.bones.size > 0) {
      // Log detailed diagnostic once
      if (!this._skinTestLogged) {
        this._skinTestLogged = true;
        console.log('[ROOT DIAG] === SKINNING DIAGNOSTIC ===');
        console.log(`[ROOT DIAG] SkinnedMeshes: ${this.skinnedMeshes.length}`);
        for (const sm of this.skinnedMeshes) {
          console.log(`[ROOT DIAG]   mesh "${sm.name}": skeleton=${!!sm.skeleton}, bones=${sm.skeleton?.bones?.length}, bindMode="${sm.bindMode}"`);
          console.log(`[ROOT DIAG]   geometry skinIndex=${!!sm.geometry?.attributes?.skinIndex}, skinWeight=${!!sm.geometry?.attributes?.skinWeight}`);
          console.log(`[ROOT DIAG]   boneInverses: ${sm.skeleton?.boneInverses?.length}`);
          if (sm.skeleton?.bones?.length > 0) {
            const skBone0 = sm.skeleton.bones[0];
            const mapBone = this.bones.get(skBone0.name.replace(/^mixamorig:/, ''));
            console.log(`[ROOT DIAG]   bone[0] "${skBone0.name}" same ref as map: ${skBone0 === mapBone}`);
            console.log(`[ROOT DIAG]   bone[0] parent: "${skBone0.parent?.name || 'null'}", matrixAutoUpdate: ${skBone0.matrixAutoUpdate}`);
          }
          // Check material type
          const mat = sm.material;
          console.log(`[ROOT DIAG]   material type: ${mat?.type}, isShaderMaterial: ${mat?.isShaderMaterial}, isMeshStdMat: ${mat?.isMeshStandardMaterial}`);
        }
        console.log(`[ROOT DIAG] Bone map entries: ${this.bones.size}`);
        console.log(`[ROOT DIAG] Bone names: ${Array.from(this.bones.keys()).join(', ')}`);
      }

      // FORCED TEST: Swing LeftArm with a sine wave to verify skinning works
      const testBone = this.bones.get('LeftArm');
      if (testBone && !this.currFrame) {
        // Only do the test swing when no skeleton data is flowing
        const angle = Math.sin(elapsed * 2) * 0.8;
        testBone.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle);
        if (this._skinTestFrame <= 5) {
          console.log(`[ROOT DIAG] Test swing LeftArm "${testBone.name}" angle=${angle.toFixed(3)}, quat=${testBone.quaternion.x.toFixed(3)},${testBone.quaternion.y.toFixed(3)},${testBone.quaternion.z.toFixed(3)},${testBone.quaternion.w.toFixed(3)}`);
        }
      }
    }

    // Apply skeleton data from Quest 3 (only after calibration)
    // Frozen state: skip skeleton updates (avatar locks in current pose)
    if (this.currFrame && this._calibrated && this._avatarState !== 'frozen') {
      this.interpolateSkeleton(deltaTime);
    }

    // Hacked state: add glitch jitter to bones
    if (this._avatarState === 'hacked') {
      this._glitchTime += deltaTime;
      // Random bone jitter every few frames
      if (Math.random() < 0.3) {
        for (const sm of this.skinnedMeshes) {
          if (sm.skeleton) {
            const randomBone = sm.skeleton.bones[Math.floor(Math.random() * sm.skeleton.bones.length)];
            if (randomBone) {
              const glitchAmount = 0.05 * Math.sin(this._glitchTime * 50);
              randomBone.quaternion.x += glitchAmount * (Math.random() - 0.5);
              randomBone.quaternion.y += glitchAmount * (Math.random() - 0.5);
              randomBone.quaternion.normalize();
            }
          }
        }
      }
      // Occasional position glitch (teleport stutter)
      if (Math.random() < 0.05) {
        this.group.position.x += (Math.random() - 0.5) * 0.1;
        this.group.position.z += (Math.random() - 0.5) * 0.1;
      }
    }

    // Force skeleton matrix updates
    for (const sm of this.skinnedMeshes) {
      if (sm.skeleton) {
        sm.skeleton.bones.forEach((b: any) => {
          b.updateMatrix();
          b.updateMatrixWorld(true);
        });
        sm.skeleton.update();
      }
    }

    // Update face blendshapes (lip sync, blinks, emotes).
    // No-op if loaded model has no morph targets.
    this.plutoFace?.update(deltaTime);
  }

  /**
   * Forward mic volume to the face controller for lip sync.
   * Called from App.tsx when a voice_level message arrives.
   */
  setVoiceLevel(volume: number, speaking: boolean) {
    this.plutoFace?.setVoiceLevel(volume, speaking);
  }

  /**
   * Forward Oculus Lipsync viseme weights from Quest to the face controller.
   * Called from App.tsx when a lip_sync message arrives.
   * visemes is a map of viseme name → weight (0-1).
   */
  setVisemes(visemes: Record<string, number>) {
    this.plutoFace?.setVisemes(visemes);
  }

  /**
   * Trigger a named facial emote (happy, sad, angry, surprised, confused, scared, contemplative, neutral).
   * Pass durationSeconds to override the library default; 0 = hold until next trigger.
   */
  triggerEmote(name: string, durationSeconds?: number) {
    this.plutoFace?.triggerEmote(name, durationSeconds);
  }

  private findBone(name: string): THREE.Bone | undefined {
    return this.bones.get(name)
      || this.bones.get('mixamorig:' + name)
      || this.bones.get('mixamorig' + name);
  }

  private getGlbRestQuat(name: string) {
    return this.glbRestQuats.get(name)
      || this.glbRestQuats.get('mixamorig:' + name)
      || this.glbRestQuats.get('mixamorig' + name);
  }

  /**
   * Yaw-mirrored delta retargeting (using Euler decomposition for exactness).
   *
   * For bones where aim-retarget can't see yaw, AND where Unity (LH) ↔ Three.js
   * (RH) coordinate handedness reverses yaw direction.
   *
   * Math:
   *   delta = inv(unityRest) * unityNow          // rotation from rest to current
   *   euler = decompose(delta, order='YXZ')      // explicit yaw / pitch / roll
   *   euler.y *= -1                              // flip ONLY yaw axis
   *   delta_fixed = quat_from_euler(euler)
   *   bone.q = glbRest * delta_fixed
   *
   * Why Euler over component-negate: a quaternion (qx, -qy, qz, qw) is only
   * "yaw-flipped" exactly when qx=qz=0 (pure yaw). For mixed rotations like
   * nod+turn, qy encodes coupling between axes — naive negation gets wrong
   * answer. Euler decomposition cleanly isolates yaw so flipping is exact.
   */
  private applyDeltaYawFlipRetarget(
    boneName: string,
    bone: THREE.Bone,
    boneData: BoneTransformData,
  ): boolean {
    const unityRest = this.unityRestQuats.get(boneName);
    const glbRest = this.getGlbRestQuat(boneName);
    if (!unityRest || !glbRest) return false;

    const r = boneData.rotation;
    const unityNow = new THREE.Quaternion(r.x, r.y, r.z, r.w).normalize();

    // Delta: rotation from calibration rest to current pose
    const delta = unityRest.clone().invert().multiply(unityNow);

    // Decompose into Yaw → Pitch → Roll. Y-first order means euler.y IS the
    // pure yaw angle, isolated from pitch/roll.
    const euler = new THREE.Euler().setFromQuaternion(delta, 'YXZ');

    // Mirror both yaw (Y) and roll (Z) — both are flipped by the Unity LH ↔
    // Three.js RH coordinate change. Pitch (X) survives because the head bone's
    // X axis happens to align between the two systems.
    euler.y = -euler.y;   // fixes left/right head turn
    euler.z = -euler.z;   // fixes ear-to-shoulder tilt

    // Recompose into a quaternion and apply on top of GLB rest pose.
    const deltaFixed = new THREE.Quaternion().setFromEuler(euler);
    bone.quaternion.copy(glbRest.clone().multiply(deltaFixed)).normalize();
    return true;
  }

  /**
   * Hips-specific retargeting using WORLD rotation rather than local.
   *
   * Why: In Mixamo / standard humanoid rigs, the body's overall orientation
   * (the "I'm now facing 90° to the right") often lives in a parent transform
   * ABOVE the Hips bone — not in the Hips bone's local rotation. So
   * t.localRotation of Hips stays ~identity even when the performer spins 180°.
   *
   * Quest sends t.rotation (world rotation) per bone. For Hips, that world
   * rotation IS the body's orientation in world space — exactly what we need.
   *
   * Same Y+Z Euler flip as the local-rotation version handles Unity LH ↔
   * Three.js RH yaw/roll mirroring.
   */
  private applyHipsWorldRotationRetarget(
    bone: THREE.Bone,
    boneData: BoneTransformData,
  ): boolean {
    if (!boneData.worldRot) return false;
    const unityRestWorld = this.unityRestWorldRotRaw.get('Hips');
    const glbRest = this.getGlbRestQuat('Hips');
    if (!unityRestWorld || !glbRest) return false;

    const wr = boneData.worldRot;
    const unityNowWorld = new THREE.Quaternion(wr.x, wr.y, wr.z, wr.w).normalize();

    // Body's rotation since calibration, in Unity world space
    const worldDelta = unityRestWorld.clone().invert().multiply(unityNowWorld);

    // Y+Z Euler flip for LH→RH yaw and roll
    const euler = new THREE.Euler().setFromQuaternion(worldDelta, 'YXZ');
    euler.y = -euler.y;
    euler.z = -euler.z;
    const fixedDelta = new THREE.Quaternion().setFromEuler(euler);

    // Hips is root: its parent has no rotation, so local == world.
    bone.quaternion.copy(glbRest.clone().multiply(fixedDelta)).normalize();
    return true;
  }

  private applyRotationRetarget(
    boneName: string,
    bone: THREE.Bone,
    boneData: BoneTransformData,
  ) {
    const mapping = this.boneWorldToLocal.get(boneName);

    if (mapping) {
      const r = boneData.rotation;
      const currentLocalQ = new THREE.Quaternion(r.x, r.y, r.z, r.w).normalize();
      bone.quaternion.copy(mapping.localMapping.clone().multiply(currentLocalQ)).normalize();
      return true;
    }

    if (mapping?.worldMapping && boneData.worldRot) {
      const desiredWorldQ = mapping.worldMapping
        .clone()
        .multiply(this.unityWorldQuatToThree(boneData.worldRot));
      const parentWorldQ = new THREE.Quaternion();
      if (bone.parent) bone.parent.getWorldQuaternion(parentWorldQ);
      bone.quaternion.copy(parentWorldQ.invert().multiply(desiredWorldQ)).normalize();
      return true;
    }

    return false;
  }

  private applyTargetRestAimRetarget(
    boneName: string,
    bone: THREE.Bone,
    currPos: THREE.Vector3 | undefined,
    currChildPos: THREE.Vector3 | null,
  ) {
    const glbRest = this.getGlbRestQuat(boneName);
    const restDirInParent = this.glbRestAimDirs.get(boneName);
    if (!currPos || !currChildPos || !glbRest || !restDirInParent) {
      return false;
    }

    const currWorldDir = currChildPos.clone().sub(currPos);
    if (currWorldDir.lengthSq() < 0.000001) {
      return false;
    }
    currWorldDir.normalize();

    bone.parent?.updateMatrixWorld(true);
    const parentWorldQ = new THREE.Quaternion();
    if (bone.parent) bone.parent.getWorldQuaternion(parentWorldQ);

    const currDirInParent = currWorldDir.applyQuaternion(parentWorldQ.invert()).normalize();
    const aimQuat = new THREE.Quaternion().setFromUnitVectors(
      restDirInParent,
      currDirInParent,
    );

    bone.quaternion.copy(aimQuat.multiply(glbRest)).normalize();
    return true;
  }

  private getChildBoneName(boneName: string) {
    const children: Record<string, string> = {
      'Hips': 'Spine', 'Spine': 'Spine1', 'Spine1': 'Spine2',
      'Spine2': 'Neck', 'Neck': 'Head',
      'LeftShoulder': 'LeftArm', 'LeftArm': 'LeftForeArm',
      'LeftForeArm': 'LeftHand',
      'RightShoulder': 'RightArm', 'RightArm': 'RightForeArm',
      'RightForeArm': 'RightHand',
      'LeftUpLeg': 'LeftLeg', 'LeftLeg': 'LeftFoot',
      'LeftFoot': 'LeftToeBase',
      'RightUpLeg': 'RightLeg', 'RightLeg': 'RightFoot',
      'RightFoot': 'RightToeBase',
    };
    return children[boneName];
  }

  private interpolateSkeleton(_deltaTime: number) {
    if (!this.currFrame) return;

    let matched = 0;
    let firstMiss = '';
    this.totalQuestBones = this.currFrame.bones.length;

    const currWorldPos = new Map<string, THREE.Vector3>();
    for (const b of this.currFrame.bones) {
      const wp = b.worldPos || b.position;
      currWorldPos.set(b.name, this.unityWorldPositionToThree(wp));
    }

    const BONE_ORDER = [
      'Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
      'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
      'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
      'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase',
      'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase',
    ];

    // Bones where aim-retargeting can't see yaw rotation.
    // Aim-retarget computes bone direction from bone→child position vector.
    // For these bones, child is straight up (HeadTop_End above Head, Head above Neck,
    // each Spine above the previous). So head/spine YAW (turning left/right)
    // produces no aim change → head/torso don't follow when actor turns.
    // Use local-rotation retarget instead — captures the yaw via Quest's local quat.
    const ROTATION_RETARGET_BONES = new Set([
      'Hips',                          // body yaw — without this, body doesn't rotate at all
      'Spine', 'Spine1', 'Spine2',     // torso twist when chest turns independently of hips
      'Neck', 'Head',                  // head turn (yaw)
    ]);
    // One-time console marker so we can confirm the latest deploy is loaded
    // (look for this line in console — if you see "yaw-flip-euler-v3" the new code is live)
    if (this.frameCount === 1) {
      console.log('[ROOT] Retarget version: hips-world-rot-v5');
    }

    for (const boneName of BONE_ORDER) {
      const bone = this.findBone(boneName);
      const boneData = this.currFrame.bones.find(b => b.name === boneName);
      if (!bone || !boneData) continue;
      matched++;

      const childName = this.getChildBoneName(boneName);
      const currPos = currWorldPos.get(boneName);
      const currChildPos = childName ? currWorldPos.get(childName) : null;

      let retargeted = false;
      if (boneName === 'Hips') {
        // Hips uses WORLD rotation (not local) because in standard humanoid rigs
        // the body turn often lives in a parent transform above Hips, leaving
        // Hips local rotation ~identity even on 180° spins.
        retargeted = this.applyHipsWorldRotationRetarget(bone, boneData);
      }
      if (!retargeted && ROTATION_RETARGET_BONES.has(boneName)) {
        // Delta-yaw-flip retarget: captures yaw/twist AND mirrors Y-axis rotation
        // direction (Unity LH ↔ Three.js RH). See applyDeltaYawFlipRetarget for math.
        retargeted = this.applyDeltaYawFlipRetarget(boneName, bone, boneData);
      }
      if (!retargeted) {
        retargeted = this.applyTargetRestAimRetarget(
          boneName,
          bone,
          currPos,
          currChildPos,
        );
      }
      if (!retargeted) {
        this.applyRotationRetarget(boneName, bone, boneData);
      }

      bone.updateMatrix();
      bone.updateMatrixWorld(true);

      // Root motion + rotation
      if (boneName === 'Hips') {
        const wp = boneData.worldPos;
        if (wp && this.unityRestHipsPos && this.glbRestHipsPos) {
          const currHipsPos = this.unityWorldPositionToThree(wp);
          const delta = currHipsPos.sub(this.unityRestHipsPos);

          bone.position.copy(this.glbRestHipsPos).add(new THREE.Vector3(0, delta.y, 0));
          bone.updateMatrix();
          bone.updateMatrixWorld(true);

          this.group.position.x = delta.x;
          this.group.position.z = delta.z;
        }
      }
    }

    this.matchedBones = matched;
    this.firstMissName = firstMiss;
    if (this.bones.size > 0) this.firstMapName = Array.from(this.bones.keys())[0];
  }

  /** Set visibility */
  setVisible(visible: boolean) {
    this.group.visible = visible;
  }

  /** Set avatar state: normal, frozen, hacked */
  setState(state: 'normal' | 'frozen' | 'hacked') {
    this._avatarState = state;
    console.log(`[ROOT] Avatar state: ${state}`);

    if (state === 'hacked') {
      // Red aura, high intensity
      this.setAura({ color: [1.0, 0.0, 0.2], intensity: 0.9, pulseRate: 4.0, emotion: 'angry' });
    } else if (state === 'normal') {
      this.setAura({ color: [0.0, 0.8, 1.0], intensity: 0.4, pulseRate: 1.0, emotion: 'neutral' });
    }
    // frozen: just stops skeleton updates, keeps current aura
  }

  dispose() {
    this.ghostMaterial.dispose();
    this.auraMaterial.dispose();
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
      }
    });
  }
}
