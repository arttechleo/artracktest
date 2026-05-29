/**
 * PropManager - Manages digital props that appear/disappear during the show.
 *
 * Props: cake, coin, dinnerware, chapel environment
 * Triggered via show control messages.
 */

import * as THREE from 'three';

interface PropConfig {
  url: string;
  position: THREE.Vector3;
  scale: THREE.Vector3;
  rotation?: THREE.Euler;
  visible: boolean;
}

export class PropManager {
  private scene: THREE.Scene;
  private props: Map<string, THREE.Group> = new Map();
  private configs: Record<string, PropConfig>;
  private loaded = false;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // Default positions relative to scene origin (where Pluto is placed)
    this.configs = {
      cake: {
        url: '/models/cake.glb',
        position: new THREE.Vector3(0.5, 0, 0.3),  // Right of center, on ground
        scale: new THREE.Vector3(0.008, 0.008, 0.008),
        visible: false,
      },
      coin: {
        url: '/models/coin.glb',
        position: new THREE.Vector3(0, 1.5, 0.5),  // Floating at chest height
        scale: new THREE.Vector3(0.1, 0.1, 0.1),
        visible: false,
      },
      dinnerware: {
        url: '/models/dinnerware.glb',
        position: new THREE.Vector3(0, 0.8, 0.3),  // Table height
        scale: new THREE.Vector3(0.01, 0.01, 0.01),
        visible: false,
      },
      chapel: {
        url: '/models/church_staging4.glb',  // swapped from chapel_environment.glb
        position: new THREE.Vector3(0, 0, 0),
        scale: new THREE.Vector3(1, 1, 1),
        visible: false,
      },
    };
  }

  async loadAll() {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const loader = new GLTFLoader();

    const loadPromises = Object.entries(this.configs).map(([id, config]) => {
      return new Promise<void>((resolve) => {
        loader.load(
          config.url,
          (gltf) => {
            const group = new THREE.Group();
            group.add(gltf.scene);
            group.position.copy(config.position);
            group.scale.copy(config.scale);
            if (config.rotation) {
              group.rotation.copy(config.rotation);
            }
            group.visible = config.visible;

            // Make all meshes not cast shadows and disable frustum culling
            group.traverse((child: any) => {
              if (child.isMesh) {
                child.castShadow = false;
                child.receiveShadow = false;
                child.frustumCulled = false;

              }
            });

            this.scene.add(group);
            this.props.set(id, group);
            console.log(`[Props] Loaded: ${id} (${config.url})`);
            resolve();
          },
          undefined,
          (err) => {
            console.warn(`[Props] Failed to load ${id}:`, err);
            resolve();
          }
        );
      });
    });

    await Promise.all(loadPromises);
    this.loaded = true;
    console.log(`[Props] All props loaded: ${this.props.size}`);
  }

  /** Show or hide a prop */
  setPropVisible(id: string, visible: boolean) {
    const prop = this.props.get(id);
    if (prop) {
      prop.visible = visible;
      console.log(`[Props] ${id}: ${visible ? 'SHOW' : 'HIDE'}`);
    }
  }

  /** Handle prop messages from show control */
  handlePropMessage(data: any) {
    const { id, action } = data;
    switch (action) {
      case 'show':
        this.setPropVisible(id, true);
        break;
      case 'hide':
        this.setPropVisible(id, false);
        break;
      case 'light':
        // Light candles on cake — add emissive glow
        if (id === 'candles') {
          const cake = this.props.get('cake');
          if (cake) {
            cake.traverse((child: any) => {
              if (child.isMesh && child.material) {
                child.material.emissive = new THREE.Color(1.0, 0.6, 0.1);
                child.material.emissiveIntensity = 0.5;
              }
            });
          }
        }
        break;
      case 'blowout':
        // Blow out candles — remove emissive
        if (id === 'candles') {
          const cake = this.props.get('cake');
          if (cake) {
            cake.traverse((child: any) => {
              if (child.isMesh && child.material) {
                child.material.emissiveIntensity = 0;
              }
            });
          }
        }
        break;
    }
  }

  /** Get a prop group for positioning */
  getProp(id: string): THREE.Group | undefined {
    return this.props.get(id);
  }
}
