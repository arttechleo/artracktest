/**
 * StageAnchor - Precisely aligns the virtual chapel onto the physical stage.
 *
 * STRATEGY: Image Target Anchoring
 *
 * A printed marker (high-contrast image) is placed on the stage in a known
 * position. When any audience member's phone recognizes the marker, the
 * 3D chapel scene locks precisely to that world-space position.
 *
 * Why image targets are best for theater:
 * 1. PRECISE - sub-centimeter accuracy, all 100 phones see the same thing
 * 2. INSTANT - locks on in <1 second when pointed at stage
 * 3. PERSISTENT - once found, SLAM maintains tracking even if marker occluded
 * 4. NO SETUP - audience just points phone at stage, it works
 *
 * The marker can be:
 * - A large poster/banner on the stage floor
 * - Projected onto the stage surface
 * - Printed on the coffin itself (the ouroboros/tree design)
 * - A banner behind the pulpit
 *
 * For ROOT, we recommend printing the ouroboros/tree symbol from the coffin
 * as a ~1m wide banner. It's already part of the set design, high contrast,
 * and audience naturally looks at it.
 */

import * as THREE from 'three';

export interface AnchorConfig {
  /** Physical width of the printed marker in meters */
  markerWidthMeters: number;
  /** Offset from marker center to where the chapel origin should be */
  offsetFromMarker: THREE.Vector3;
  /** Rotation offset (e.g., if marker is on the floor vs wall) */
  rotationOffset: THREE.Euler;
}

/** Default config: marker on stage floor, chapel centered above it */
const DEFAULT_CONFIG: AnchorConfig = {
  markerWidthMeters: 1.0, // 1 meter wide printed marker
  offsetFromMarker: new THREE.Vector3(0, 0, 0), // chapel origin at marker center
  rotationOffset: new THREE.Euler(0, 0, 0),
};

export class StageAnchor {
  private config: AnchorConfig;
  private anchored = false;
  private anchorMatrix = new THREE.Matrix4();
  private targetGroup: THREE.Group;

  /** Smoothing for jitter reduction */
  private smoothPosition = new THREE.Vector3();
  private smoothQuaternion = new THREE.Quaternion();
  private smoothingFactor = 0.15; // Lower = smoother but slower to respond

  constructor(targetGroup: THREE.Group, config?: Partial<AnchorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.targetGroup = targetGroup;
  }

  /**
   * Create the 8th Wall image target pipeline module.
   *
   * This hooks into XR8's image target system to detect the stage marker
   * and position the chapel scene precisely on top of it.
   */
  createPipelineModule(): any {
    const self = this;

    return {
      name: 'root-stage-anchor',

      listeners: [
        /**
         * Fired when the image target is first detected.
         * Positions the chapel scene at the marker location.
         */
        {
          event: 'image-target.image-found',
          process: (event: any) => {
            const { position, rotation, scale } = event.detail;

            // Build transform matrix from image target pose
            const pos = new THREE.Vector3(position.x, position.y, position.z);
            const rot = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
            const scl = new THREE.Vector3(scale, scale, scale);

            // Apply marker offset (e.g., chapel center is 2m behind marker)
            const offsetWorld = self.config.offsetFromMarker.clone();
            offsetWorld.applyQuaternion(rot);
            pos.add(offsetWorld);

            // Apply rotation offset
            const rotOffset = new THREE.Quaternion().setFromEuler(self.config.rotationOffset);
            rot.multiply(rotOffset);

            // Set initial position (no smoothing on first detection)
            self.smoothPosition.copy(pos);
            self.smoothQuaternion.copy(rot);

            self.targetGroup.position.copy(pos);
            self.targetGroup.quaternion.copy(rot);
            self.targetGroup.visible = true;
            self.anchored = true;

            console.log('[ROOT] Stage anchor FOUND - chapel aligned to stage');
          },
        },

        /**
         * Fired every frame while the image target is visible.
         * Smoothly updates the position to reduce jitter.
         */
        {
          event: 'image-target.image-updated',
          process: (event: any) => {
            if (!self.anchored) return;

            const { position, rotation } = event.detail;
            const pos = new THREE.Vector3(position.x, position.y, position.z);
            const rot = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);

            // Apply offsets
            const offsetWorld = self.config.offsetFromMarker.clone();
            offsetWorld.applyQuaternion(rot);
            pos.add(offsetWorld);

            const rotOffset = new THREE.Quaternion().setFromEuler(self.config.rotationOffset);
            rot.multiply(rotOffset);

            // Smooth the transform to reduce jitter
            self.smoothPosition.lerp(pos, self.smoothingFactor);
            self.smoothQuaternion.slerp(rot, self.smoothingFactor);

            self.targetGroup.position.copy(self.smoothPosition);
            self.targetGroup.quaternion.copy(self.smoothQuaternion);
          },
        },

        /**
         * Fired when the image target is lost from view.
         * The chapel stays in place (SLAM continues tracking).
         */
        {
          event: 'image-target.image-lost',
          process: () => {
            // Don't hide the chapel - SLAM will maintain position
            console.log('[ROOT] Stage marker lost from view - SLAM maintaining position');
          },
        },
      ],
    };
  }

  /**
   * Configure XR8 to use image target detection.
   * Call this before XR8.run().
   *
   * @param imageTargetData - The processed image target JSON data.
   *   Generate this using 8th Wall's image-target-cli tool:
   *   `npx @8thwall/image-target-cli process ./stage-marker.png`
   */
  static configureImageTarget(imageTargetData: any[]) {
    const onxrloaded = () => {
      if (!window.XR8) return;
      window.XR8.XrController.configure({
        imageTargetData,
      });
    };

    if (window.XR8) {
      onxrloaded();
    } else {
      window.addEventListener('xrloaded', onxrloaded);
    }
  }

  /** Whether the stage has been detected and anchored */
  get isAnchored(): boolean {
    return this.anchored;
  }

  /** Reset anchor (e.g., if audience member wants to re-align) */
  reset() {
    this.anchored = false;
    this.targetGroup.visible = false;
  }
}

/**
 * SETUP GUIDE - How to create the stage marker:
 *
 * 1. Design or export the ouroboros/tree image from the coffin prop
 *    - High contrast (dark background, bright lines)
 *    - Asymmetric (so orientation can be detected)
 *    - At least 800x800px resolution
 *
 * 2. Process it with the 8th Wall image target CLI:
 *    ```
 *    npm install -g @8thwall/image-target-cli
 *    image-target-cli process ./stage-marker.png --output ./public/targets/
 *    ```
 *    This generates a .json file with the visual features.
 *
 * 3. Print the marker:
 *    - Print at 1m x 1m (or larger) for reliable detection from audience distance
 *    - Matte finish (no glare under stage lights)
 *    - Place flat on stage floor at the exact center where the coffin sits
 *    - OR mount vertically behind the pulpit
 *
 * 4. Load the target data in the app:
 *    ```typescript
 *    import stageTarget from '../assets/targets/stage-marker.json';
 *    StageAnchor.configureImageTarget([stageTarget]);
 *    ```
 *
 * ALTERNATIVE: If you don't want a visible marker, you can:
 * - Use the coffin itself as the marker (photograph it, process the photo)
 * - Project a UV-reactive pattern that's only visible under blacklight
 * - Use a QR code that doubles as the "download the app" instruction
 *
 * DISTANCE: Image targets work reliably up to ~5m. For a 100-seat chapel,
 * front rows will lock instantly. Back rows may need to zoom in briefly
 * or use SLAM fallback (tap to place).
 */
