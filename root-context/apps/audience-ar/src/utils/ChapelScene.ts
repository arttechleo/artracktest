/**
 * ChapelScene - The gothic neo-retrowave cyberpunk chapel environment.
 *
 * This is the 3D scene that audience members see through their phone cameras.
 * It overlays the real chapel at Hollywood Forever with digital elements:
 * - Neon stained glass windows
 * - Glowing root system from the coffin
 * - Atmospheric fog and volumetric lighting
 * - The ghost avatar (Pluto, Saejin, Luther, Laura, etc.)
 *
 * Aesthetic: Meow Wolf meets gothic cathedral meets Blade Runner.
 */

import * as THREE from 'three';
import { GhostAvatar } from './GhostAvatar';

export type EnvironmentPreset =
  | 'default'
  | 'psyberpunk'
  | 'darkness'
  | 'red_alert'
  | 'celebration'
  | 'space';

interface ChapelElements {
  /** Neon light pillars flanking the stage */
  neonPillars: THREE.Group;
  /** Floating particle system (digital motes) */
  particles: THREE.Points;
  /** Ground plane with subtle grid pattern */
  ground: THREE.Mesh;
  /** Ambient fog */
  fog: THREE.FogExp2;
}

/** Color palettes for different states */
const PRESETS: Record<EnvironmentPreset, {
  ambient: [number, number, number];
  fog: [number, number, number];
  fogDensity: number;
  neonColors: [number, number, number][];
  particleColor: [number, number, number];
}> = {
  default: {
    ambient: [0.08, 0.03, 0.12],
    fog: [0.02, 0.01, 0.05],
    fogDensity: 0.012,
    neonColors: [[1, 0, 0.6], [0, 0.8, 1], [0.5, 0, 1]],
    particleColor: [0.3, 0.1, 0.8],
  },
  psyberpunk: {
    ambient: [0.15, 0.05, 0.2],
    fog: [0.05, 0.01, 0.08],
    fogDensity: 0.008,
    neonColors: [[1, 0, 0.4], [0, 1, 0.8], [1, 0.5, 0], [0.6, 0, 1]],
    particleColor: [0, 1, 0.6],
  },
  darkness: {
    ambient: [0.0, 0.0, 0.0],
    fog: [0, 0, 0],
    fogDensity: 0.05,
    neonColors: [],
    particleColor: [0, 0, 0],
  },
  red_alert: {
    ambient: [0.3, 0.0, 0.0],
    fog: [0.1, 0.0, 0.0],
    fogDensity: 0.02,
    neonColors: [[1, 0, 0], [0.8, 0, 0.1]],
    particleColor: [1, 0, 0.2],
  },
  celebration: {
    ambient: [0.1, 0.08, 0.15],
    fog: [0.03, 0.01, 0.06],
    fogDensity: 0.005,
    neonColors: [[1, 0.8, 0.2], [1, 0, 0.6], [0, 0.8, 1], [0.5, 0, 1]],
    particleColor: [1, 0.8, 0.3],
  },
  space: {
    ambient: [0.01, 0.01, 0.03],
    fog: [0.0, 0.0, 0.01],
    fogDensity: 0.002,
    neonColors: [[0, 0.3, 0.8], [0.2, 0, 0.5]],
    particleColor: [0.5, 0.5, 1],
  },
};

export class ChapelScene {
  scene: THREE.Scene;
  ghost: GhostAvatar;
  private elements!: ChapelElements;
  private ambientLight!: THREE.AmbientLight;
  private spotLights: THREE.SpotLight[] = [];
  private clock = new THREE.Clock();
  private currentPreset: EnvironmentPreset = 'default';
  private targetPreset: EnvironmentPreset = 'default';
  private transitionProgress = 1;
  private transitionSpeed = 1;

  // Particle animation state
  private particlePositions!: Float32Array;
  private particleVelocities!: Float32Array;

  constructor() {
    this.scene = new THREE.Scene();
    this.ghost = new GhostAvatar();

    this.buildScene();
    this.scene.add(this.ghost.group);
    this.ghost.setVisible(false); // Hidden until ascension
  }

  private buildScene() {
    // Fog
    const fogColor = new THREE.Color(...PRESETS.default.fog);
    this.scene.fog = new THREE.FogExp2(fogColor, PRESETS.default.fogDensity);
    this.scene.background = null; // Transparent for AR camera passthrough

    // Ambient light
    this.ambientLight = new THREE.AmbientLight(
      new THREE.Color(...PRESETS.default.ambient),
      1.0,
    );
    this.scene.add(this.ambientLight);

    // Spot lights (neon colored, pointing at stage area)
    const spotPositions: [number, number, number][] = [
      [-2, 3, -1],  // Stage left high
      [2, 3, -1],   // Stage right high
      [0, 4, -2],   // Center top back
      [-1.5, 0.5, 1], // Low left fill
      [1.5, 0.5, 1],  // Low right fill
    ];

    const spotColors = PRESETS.default.neonColors;
    spotPositions.forEach((pos, i) => {
      const color = spotColors[i % spotColors.length];
      const spot = new THREE.SpotLight(
        new THREE.Color(...color),
        2.0,
        10,
        Math.PI / 6,
        0.5,
        1,
      );
      spot.position.set(...pos);
      spot.target.position.set(0, 1, 0);
      this.scene.add(spot);
      this.scene.add(spot.target);
      this.spotLights.push(spot);
    });

    // Neon pillars (vertical light strips flanking the stage)
    const neonPillars = new THREE.Group();
    neonPillars.name = 'NeonPillars';
    const pillarPositions: [number, number][] = [
      [-2.5, -1], [-2.5, 1], [2.5, -1], [2.5, 1],
    ];
    pillarPositions.forEach((pos, i) => {
      const geo = new THREE.BoxGeometry(0.05, 3.5, 0.05);
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(...spotColors[i % spotColors.length]),
        transparent: true,
        opacity: 0.8,
      });
      const pillar = new THREE.Mesh(geo, mat);
      pillar.position.set(pos[0], 1.75, pos[1]);
      neonPillars.add(pillar);
    });
    this.scene.add(neonPillars);

    // Floating particles (digital motes / dust)
    const particleCount = 500;
    this.particlePositions = new Float32Array(particleCount * 3);
    this.particleVelocities = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      this.particlePositions[i * 3] = (Math.random() - 0.5) * 8;
      this.particlePositions[i * 3 + 1] = Math.random() * 4;
      this.particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 6;

      this.particleVelocities[i * 3] = (Math.random() - 0.5) * 0.002;
      this.particleVelocities[i * 3 + 1] = Math.random() * 0.003 + 0.001;
      this.particleVelocities[i * 3 + 2] = (Math.random() - 0.5) * 0.002;
    }

    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(this.particlePositions, 3));

    const particleMat = new THREE.PointsMaterial({
      color: new THREE.Color(...PRESETS.default.particleColor),
      size: 0.03,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const particles = new THREE.Points(particleGeo, particleMat);
    this.scene.add(particles);

    // Ground plane (subtle reflective grid)
    const groundGeo = new THREE.PlaneGeometry(12, 12);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x050108,
      metalness: 0.8,
      roughness: 0.3,
      transparent: true,
      opacity: 0.5,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    // Hidden by default — in AR mode the real floor IS the floor, and this
    // dark plane would just occlude the camera passthrough. Expose via
    // chapel.elements.ground.visible = true if needed for preview reference.
    ground.visible = false;
    this.scene.add(ground);

    this.elements = {
      neonPillars,
      particles,
      ground,
      fog: this.scene.fog as THREE.FogExp2,
    };
  }

  /** Transition to a new environment preset */
  setPreset(preset: EnvironmentPreset, fadeDuration = 1) {
    if (preset === this.currentPreset && this.transitionProgress >= 1) return;
    this.targetPreset = preset;
    this.transitionProgress = 0;
    this.transitionSpeed = 1 / Math.max(fadeDuration, 0.1);
  }

  /** Update called every frame */
  update(deltaTime: number) {
    const elapsed = this.clock.getElapsedTime();

    // Environment transition
    if (this.transitionProgress < 1) {
      this.transitionProgress = Math.min(
        this.transitionProgress + deltaTime * this.transitionSpeed,
        1,
      );

      const t = this.transitionProgress;
      const target = PRESETS[this.targetPreset] || PRESETS.default;

      // Lerp ambient light
      const currentAmbient = this.ambientLight.color;
      currentAmbient.r += (target.ambient[0] - currentAmbient.r) * t;
      currentAmbient.g += (target.ambient[1] - currentAmbient.g) * t;
      currentAmbient.b += (target.ambient[2] - currentAmbient.b) * t;

      // Lerp fog
      if (this.scene.fog instanceof THREE.FogExp2) {
        this.scene.fog.color.r += (target.fog[0] - this.scene.fog.color.r) * t;
        this.scene.fog.color.g += (target.fog[1] - this.scene.fog.color.g) * t;
        this.scene.fog.color.b += (target.fog[2] - this.scene.fog.color.b) * t;
        this.scene.fog.density += (target.fogDensity - this.scene.fog.density) * t;
      }

      // Update spot light colors
      this.spotLights.forEach((spot, i) => {
        if (target.neonColors.length > 0) {
          const tc = target.neonColors[i % target.neonColors.length];
          spot.color.r += (tc[0] - spot.color.r) * t;
          spot.color.g += (tc[1] - spot.color.g) * t;
          spot.color.b += (tc[2] - spot.color.b) * t;
          spot.intensity = THREE.MathUtils.lerp(spot.intensity, 2.0, t);
        } else {
          spot.intensity = THREE.MathUtils.lerp(spot.intensity, 0.0, t);
        }
      });

      // Update particle color
      const pMat = this.elements.particles.material as THREE.PointsMaterial;
      pMat.color.r += (target.particleColor[0] - pMat.color.r) * t;
      pMat.color.g += (target.particleColor[1] - pMat.color.g) * t;
      pMat.color.b += (target.particleColor[2] - pMat.color.b) * t;

      if (this.transitionProgress >= 1) {
        this.currentPreset = this.targetPreset;
      }
    }

    // Animate particles
    for (let i = 0; i < this.particlePositions.length / 3; i++) {
      this.particlePositions[i * 3] += this.particleVelocities[i * 3];
      this.particlePositions[i * 3 + 1] += this.particleVelocities[i * 3 + 1];
      this.particlePositions[i * 3 + 2] += this.particleVelocities[i * 3 + 2];

      // Reset particles that float too high
      if (this.particlePositions[i * 3 + 1] > 4.5) {
        this.particlePositions[i * 3 + 1] = 0;
        this.particlePositions[i * 3] = (Math.random() - 0.5) * 8;
        this.particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 6;
      }
    }
    this.elements.particles.geometry.attributes.position.needsUpdate = true;

    // Animate neon pillars (subtle pulse)
    this.elements.neonPillars.children.forEach((pillar, i) => {
      if (pillar instanceof THREE.Mesh) {
        const mat = pillar.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.6 + 0.3 * Math.sin(elapsed * 2 + i * 1.5);
      }
    });

    // Update ghost avatar
    this.ghost.update(deltaTime);
  }

  /** Set stage anchor position (from 8th Wall ground plane detection) */
  setStageAnchor(position: THREE.Vector3, rotation?: THREE.Euler) {
    this.scene.position.copy(position);
    if (rotation) {
      this.scene.rotation.copy(rotation);
    }
  }

  dispose() {
    this.ghost.dispose();
    this.scene.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Points) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
  }
}
