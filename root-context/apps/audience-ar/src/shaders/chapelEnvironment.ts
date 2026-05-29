/**
 * Chapel Environment Shaders
 *
 * Gothic neo-retrowave cyberpunk chapel inspired by Meow Wolf exhibitions.
 * Neon-lit stained glass, pulsing light strips, volumetric fog,
 * and the glowing coffin with ouroboros/tree root system.
 */

/** Stained glass window shader - animated neon patterns */
export const stainedGlassVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldPosition;

  void main() {
    vUv = uv;
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const stainedGlassFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor1;     // Hot magenta
  uniform vec3 uColor2;     // Cyan
  uniform vec3 uColor3;     // Deep purple
  uniform float uEmissive;  // Glow strength
  uniform float uCycleSpeed;

  varying vec2 vUv;
  varying vec3 vWorldPosition;

  // Voronoi pattern for stained glass cell structure
  vec2 voronoi(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float minDist = 1.0;
    vec2 minPoint = vec2(0.0);
    for (int x = -1; x <= 1; x++) {
      for (int y = -1; y <= 1; y++) {
        vec2 neighbor = vec2(float(x), float(y));
        vec2 point = vec2(
          fract(sin(dot(i + neighbor, vec2(127.1, 311.7))) * 43758.5453),
          fract(sin(dot(i + neighbor, vec2(269.5, 183.3))) * 43758.5453)
        );
        // Animate cell centers slowly
        point = 0.5 + 0.5 * sin(uTime * 0.3 + 6.2832 * point);
        float d = length(f - neighbor - point);
        if (d < minDist) {
          minDist = d;
          minPoint = point;
        }
      }
    }
    return vec2(minDist, dot(minPoint, vec2(1.0)));
  }

  void main() {
    vec2 uv = vUv * 4.0; // Scale for cell density
    vec2 v = voronoi(uv);

    // Color each cell based on its hash
    float t = v.y + uTime * uCycleSpeed;
    vec3 color = mix(uColor1, uColor2, sin(t * 3.14) * 0.5 + 0.5);
    color = mix(color, uColor3, sin(t * 2.17 + 1.0) * 0.5 + 0.5);

    // Lead lines between cells (dark borders)
    float border = smoothstep(0.02, 0.06, v.x);
    vec3 leadColor = vec3(0.02, 0.01, 0.03); // Nearly black with purple tint
    color = mix(leadColor, color, border);

    // Emissive glow
    color *= uEmissive;

    // Slight transparency
    float alpha = mix(0.6, 0.9, border);

    gl_FragColor = vec4(color, alpha);
  }
`;

/** Neon strip light shader - for architectural trim lights */
export const neonStripVertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const neonStripFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uSpeed;
  uniform float uPulseSync; // 0 = independent, 1 = synced to music/voice

  varying vec2 vUv;

  void main() {
    // Traveling wave along the strip
    float wave = sin(vUv.x * 20.0 - uTime * uSpeed) * 0.5 + 0.5;
    // Brightness modulation
    float brightness = 0.5 + 0.5 * wave;

    // Sync pulse (driven externally by voice data)
    brightness *= mix(1.0, 0.3 + 0.7 * sin(uTime * 4.0), uPulseSync);

    vec3 color = uColor * brightness * 2.0; // HDR for bloom
    float alpha = brightness * 0.95;

    gl_FragColor = vec4(color, alpha);
  }
`;

/** Coffin root system shader - glowing tree/ouroboros roots */
export const rootSystemVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying float vBrightness;
  uniform float uTime;

  void main() {
    vUv = uv;
    // Subtle vertex animation - roots gently sway
    vec3 pos = position;
    pos.x += sin(uTime * 0.5 + position.y * 3.0) * 0.01;
    pos.z += cos(uTime * 0.7 + position.y * 2.0) * 0.01;

    vBrightness = 0.5 + 0.5 * sin(uTime * 1.5 + position.y * 5.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

export const rootSystemFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;       // Teal-cyan
  uniform float uGlowIntensity;

  varying vec2 vUv;
  varying float vBrightness;

  void main() {
    // Pulsing energy flowing through roots
    float flow = sin(vUv.y * 15.0 - uTime * 2.0) * 0.5 + 0.5;
    float glow = flow * vBrightness * uGlowIntensity;

    vec3 color = uColor * (1.0 + glow * 2.0);
    float alpha = 0.3 + glow * 0.6;

    gl_FragColor = vec4(color, alpha);
  }
`;
