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
  precision mediump float;
  uniform float uTime;
  uniform float uMinH;
  uniform float uMaxH;

  varying float vHeight;
  varying vec3  vWorldNormal;
  varying vec3  vWorldPos;

  vec3 terrainColor(float t) {
    vec3 c0 = vec3(0.03, 0.07, 0.14);   // deep basin  — dark ocean blue
    vec3 c1 = vec3(0.09, 0.10, 0.13);   // low plains  — dark slate
    vec3 c2 = vec3(0.20, 0.14, 0.09);   // mid slopes  — dark rust
    vec3 c3 = vec3(0.62, 0.35, 0.07);   // high ridges — amber
    vec3 c4 = vec3(0.88, 0.76, 0.38);   // peaks       — pale gold

    if (t < 0.25) return mix(c0, c1, t * 4.0);
    if (t < 0.50) return mix(c1, c2, (t - 0.25) * 4.0);
    if (t < 0.75) return mix(c2, c3, (t - 0.50) * 4.0);
    return            mix(c3, c4, (t - 0.75) * 4.0);
  }

  void main() {
    float t     = clamp((vHeight - uMinH) / (uMaxH - uMinH), 0.0, 1.0);
    vec3  color = terrainColor(t);

    // ── Directional lighting
    vec3  sunDir = normalize(vec3(1.2, 2.5, 0.8));
    float diff   = max(dot(normalize(vWorldNormal), sunDir), 0.0);
    color *= (0.14 + diff * 0.86);

    // ── Topographic contour lines
    float range  = uMaxH - uMinH;
    float cStep  = range / 24.0;
    float c      = mod(vHeight - uMinH, cStep) / cStep;
    float line   = 1.0 - smoothstep(0.0, 0.055, min(c, 1.0 - c));
    color = mix(color, vec3(0.0, 0.62, 0.82) * 0.48, line * 0.85);

    // ── World-space survey grid
    float gx   = 1.0 - smoothstep(0.0, 0.045, abs(fract(vWorldPos.x / 8.0) - 0.5) * 2.0);
    float gz   = 1.0 - smoothstep(0.0, 0.045, abs(fract(vWorldPos.z / 8.0) - 0.5) * 2.0);
    float grid = max(gx, gz) * 0.16;
    color += vec3(0.0, 0.28, 0.44) * grid;

    // ── Animated scan sweep (horizontal radar line)
    float scanPos   = vWorldPos.x / 100.0;
    float scanPhase = fract(uTime * 0.12) * 2.0 - 1.0;
    float scanLine  = exp(-abs(scanPos - scanPhase) * 18.0);
    color += vec3(0.0, 0.55, 0.75) * scanLine * 0.12;

    // ── Edge fog
    float dist = length(vWorldPos.xz);
    float fog  = smoothstep(75.0, 115.0, dist);
    color = mix(color, vec3(0.02, 0.04, 0.08), fog);

    gl_FragColor = vec4(color, 1.0);
  }
`

// ─── Terrain generation ─────────────────────────────────────────────────────

export function createTerrain(scene) {
  const SIZE = 200
  const SEG  = 320
  const noise2D = createNoise2D()

  // Domain-warped fractional Brownian motion — produces more organic shapes
  function fbm(x, z) {
    // First, warp the input coordinates
    const wx = x + 4.0 * noise2D(x * 0.004, z * 0.004)
    const wz = z + 4.0 * noise2D(x * 0.004 + 5.2, z * 0.004 + 1.3)

    let v = 0, amp = 1, freq = 0.006, total = 0
    for (let i = 0; i < 7; i++) {
      v     += noise2D(wx * freq, wz * freq) * amp
      total += amp
      amp   *= 0.52
      freq  *= 2.1
    }
    return (v / total) * 20.0
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
