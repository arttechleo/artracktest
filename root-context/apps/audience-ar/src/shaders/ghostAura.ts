/**
 * Ghost Aura Shader - Creates the ethereal glow around Pluto's digital avatar.
 *
 * From the script: "Digital Pluto has an aura or glow around her avatar
 * which pulses and changes colors to reflect her voice volume and emotion."
 *
 * Gothic neo-retrowave cyberpunk aesthetic inspired by Meow Wolf.
 *
 * IMPORTANT: Uses Three.js #include chunks for skinning support.
 * Without these, SkinnedMesh bones have no effect on the shader.
 */

export const ghostAuraVertexShader = /* glsl */ `
  #include <skinning_pars_vertex>
  #include <morphtarget_pars_vertex>

  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec2 vUv;

  void main() {
    #include <beginnormal_vertex>
    #include <morphnormal_vertex>
    #include <skinbase_vertex>
    #include <skinnormal_vertex>

    #include <begin_vertex>
    #include <morphtarget_vertex>
    #include <skinning_vertex>

    vNormal = normalize(normalMatrix * objectNormal);
    vWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  }
`;

export const ghostAuraFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uAuraColor;
  uniform float uIntensity;      // 0-1, driven by voice volume
  uniform float uPulseRate;      // Hz
  uniform float uEmotionBlend;   // 0-1, blend toward emotion color
  uniform vec3 uEmotionColor;    // Target emotion color
  uniform float uOpacity;        // Base ghost opacity
  uniform float uFresnelPower;   // Edge glow strength

  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec2 vUv;

  // Simplex-style noise for organic feel
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  void main() {
    // Fresnel effect - stronger glow at edges (ghostly rim light)
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    float fresnel = pow(1.0 - max(dot(viewDir, vNormal), 0.0), uFresnelPower);

    // Pulse with voice volume
    float pulse = sin(uTime * uPulseRate * 6.2832) * 0.5 + 0.5;
    float voicePulse = mix(0.3, 1.0, uIntensity) * mix(0.7, 1.0, pulse);

    // Blend base aura color with emotion color
    vec3 baseColor = mix(uAuraColor, uEmotionColor, uEmotionBlend);

    // Add psychedelic color shifting (Meow Wolf inspired)
    float colorShift = noise(vUv * 3.0 + uTime * 0.2) * 0.3;
    vec3 shiftedColor = baseColor + vec3(
      sin(colorShift * 6.28) * 0.15,
      sin(colorShift * 6.28 + 2.09) * 0.15,
      sin(colorShift * 6.28 + 4.18) * 0.15
    );

    // Combine: inner ghost body + outer aura glow
    float innerAlpha = uOpacity * (0.4 + 0.3 * voicePulse);
    float auraAlpha = fresnel * voicePulse * uIntensity * 1.5;

    vec3 finalColor = shiftedColor * (1.0 + fresnel * 2.0);
    float finalAlpha = clamp(innerAlpha + auraAlpha, 0.0, 0.95);

    gl_FragColor = vec4(finalColor, finalAlpha);
  }
`;

/**
 * Outer glow shell shader - rendered on a slightly scaled-up copy of the mesh
 * to create the volumetric aura halo effect.
 */
export const auraShellVertexShader = /* glsl */ `
  #include <skinning_pars_vertex>

  uniform float uExpand;    // How much to push vertices outward
  uniform float uTime;
  uniform float uIntensity;

  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  void main() {
    #include <beginnormal_vertex>
    #include <skinbase_vertex>
    #include <skinnormal_vertex>

    #include <begin_vertex>
    #include <skinning_vertex>

    // Expand along normals, modulated by voice intensity
    float expand = uExpand * (0.5 + 0.5 * uIntensity);
    // Add subtle breathing animation
    expand *= 1.0 + 0.15 * sin(uTime * 2.0);

    vec3 expanded = transformed + objectNormal * expand;
    vNormal = normalize(normalMatrix * objectNormal);
    vWorldPosition = (modelMatrix * vec4(expanded, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(expanded, 1.0);
  }
`;

export const auraShellFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uAuraColor;
  uniform float uIntensity;
  uniform float uPulseRate;
  uniform vec3 uEmotionColor;
  uniform float uEmotionBlend;

  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    float fresnel = pow(1.0 - max(dot(viewDir, vNormal), 0.0), 2.0);

    float pulse = sin(uTime * uPulseRate * 6.2832) * 0.5 + 0.5;
    float glow = fresnel * uIntensity * mix(0.5, 1.0, pulse);

    vec3 color = mix(uAuraColor, uEmotionColor, uEmotionBlend);

    // Neon bloom effect
    color *= 1.5;

    gl_FragColor = vec4(color, glow * 0.6);
  }
`;

/**
 * Emotion → color mapping for the aura system.
 * Gothic neo-retrowave cyberpunk palette.
 */
export const EMOTION_COLORS: Record<string, [number, number, number]> = {
  neutral:  [0.0, 0.8, 1.0],   // Cyan
  angry:    [1.0, 0.0, 0.2],   // Red-crimson
  sad:      [0.3, 0.0, 0.8],   // Deep purple
  joyful:   [1.0, 0.0, 0.6],   // Hot pink
  afraid:   [0.5, 0.0, 1.0],   // Violet
  glowing:  [1.0, 0.9, 0.3],   // Gold (for celebration/ascension)
};
