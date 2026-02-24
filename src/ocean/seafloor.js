import * as THREE from 'three'
import { createNoise2D } from 'simplex-noise'

// ─── Shaders ────────────────────────────────────────────────────────────────

const VERT = /* glsl */`
  varying float vHeight;
  varying vec3  vWorldNormal;
  varying vec3  vWorldPos;

  void main() {
    vHeight      = position.y;
    vWorldPos    = (modelMatrix * vec4(position, 1.0)).xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position  = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const FRAG = /* glsl */`
  uniform float uTime;
  uniform float uMinH;
  uniform float uMaxH;

  varying float vHeight;
  varying vec3  vWorldNormal;
  varying vec3  vWorldPos;

  vec3 depthColor(float t) {
    // t=0 is deepest, t=1 is shallowest
    vec3 c0 = vec3(0.01, 0.01, 0.04);   // abyssal zone  — near black
    vec3 c1 = vec3(0.02, 0.04, 0.12);   // hadal zone    — deep indigo
    vec3 c2 = vec3(0.04, 0.10, 0.25);   // bathyal zone  — dark navy
    vec3 c3 = vec3(0.08, 0.22, 0.40);   // mesopelagic   — steel blue
    vec3 c4 = vec3(0.15, 0.40, 0.55);   // shallow water — teal

    if (t < 0.25) return mix(c0, c1, t * 4.0);
    if (t < 0.50) return mix(c1, c2, (t - 0.25) * 4.0);
    if (t < 0.75) return mix(c2, c3, (t - 0.50) * 4.0);
    return            mix(c3, c4, (t - 0.75) * 4.0);
  }

  void main() {
    float t     = clamp((vHeight - uMinH) / (uMaxH - uMinH), 0.0, 1.0);
    vec3  color = depthColor(t);

    // ── Light attenuation (Beer-Lambert: sunlight fades with depth)
    float depthFactor = 1.0 - t;  // 0 at surface, 1 at deepest
    vec3  sunAtten = vec3(
      exp(-depthFactor * 5.0),   // red absorbed first
      exp(-depthFactor * 2.5),   // green fades mid-depth
      exp(-depthFactor * 1.2)    // blue persists deepest
    );
    vec3  sunDir = normalize(vec3(0.3, 1.0, 0.2));
    float diff   = max(dot(normalize(vWorldNormal), sunDir), 0.0);
    color *= (0.06 + diff * 0.94 * sunAtten);

    // ── Bioluminescence in the deep (scattered glow points)
    float bioNoise = fract(sin(dot(floor(vWorldPos.xz * 0.3), vec2(12.9898, 78.233))) * 43758.5453);
    float bioGlow  = smoothstep(0.97, 1.0, bioNoise) * depthFactor * 0.7;
    color += vec3(0.08, 0.45, 0.70) * bioGlow;

    // ── Isobath contour lines (depth contours)
    float range = uMaxH - uMinH;
    float cStep = range / 20.0;
    float c     = mod(vHeight - uMinH, cStep) / cStep;
    float line  = 1.0 - smoothstep(0.0, 0.055, min(c, 1.0 - c));
    color = mix(color, vec3(0.0, 0.30, 0.55) * 0.45, line * 0.7);

    // ── Sonar grid (world-space, teal tinted)
    float gx   = 1.0 - smoothstep(0.0, 0.045, abs(fract(vWorldPos.x / 8.0) - 0.5) * 2.0);
    float gz   = 1.0 - smoothstep(0.0, 0.045, abs(fract(vWorldPos.z / 8.0) - 0.5) * 2.0);
    float grid = max(gx, gz) * 0.14;
    color += vec3(0.0, 0.18, 0.32) * grid;

    // ── Sonar pulse (radial expanding ring)
    float dist      = length(vWorldPos.xz);
    float pulsePos  = fract(uTime * 0.08) * 130.0;
    float pulseLine = exp(-abs(dist - pulsePos) * 1.0);
    color += vec3(0.0, 0.50, 0.70) * pulseLine * 0.20;

    // ── Caustics shimmer (subtle, only in shallow areas)
    float causticsPattern = sin(vWorldPos.x * 1.5 + uTime * 0.8) *
                            sin(vWorldPos.z * 1.5 + uTime * 0.6);
    float causticsStrength = sunAtten.b * 0.06 * t;
    color += vec3(0.25, 0.60, 0.80) * max(causticsPattern, 0.0) * causticsStrength;

    // ── Deep fog (underwater murk)
    float fogDist = length(vWorldPos.xz);
    float fog     = smoothstep(65.0, 115.0, fogDist);
    color = mix(color, vec3(0.01, 0.02, 0.05), fog);

    gl_FragColor = vec4(color, 1.0);
  }
`

// ─── Terrain generation ─────────────────────────────────────────────────────

export function createSeafloor(scene) {
  const SIZE = 200
  const SEG  = 320
  const noise2D = createNoise2D()

  // Domain-warped FBM — inverted for ocean floor
  function fbm(x, z) {
    const wx = x + 4.0 * noise2D(x * 0.004, z * 0.004)
    const wz = z + 4.0 * noise2D(x * 0.004 + 5.2, z * 0.004 + 1.3)

    let v = 0, amp = 1, freq = 0.006, total = 0
    for (let i = 0; i < 7; i++) {
      v     += noise2D(wx * freq, wz * freq) * amp
      total += amp
      amp   *= 0.52
      freq  *= 2.1
    }
    // Invert and push negative: ocean floor is below zero
    return (v / total) * -20.0 - 8.0
  }

  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG)
  geo.rotateX(-Math.PI / 2)

  const pos  = geo.attributes.position
  let minH = Infinity, maxH = -Infinity

  for (let i = 0; i < pos.count; i++) {
    const h = fbm(pos.getX(i), pos.getZ(i))
    pos.setY(i, h)
    if (h < minH) minH = h
    if (h > maxH) maxH = h
  }

  pos.needsUpdate = true
  geo.computeVertexNormals()

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uMinH: { value: minH },
      uMaxH: { value: maxH },
    },
    vertexShader:   VERT,
    fragmentShader: FRAG,
  })

  const mesh = new THREE.Mesh(geo, mat)
  scene.add(mesh)

  return { mesh, material: mat, fbm, minH, maxH }
}

// ─── Exported shaders for bathymetry views ──────────────────────────────────

export { VERT, FRAG }
