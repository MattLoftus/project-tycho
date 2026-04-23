import * as THREE from 'three'
import { buildShip } from './alcubierre-model.js'

/**
 * Alcubierre Warp Drive V2 — a literal "spacetime conduit" view.
 *
 * A tube-of-revolution around the ship's X axis forms a spacetime grid
 * ribbon. Its radius profile mirrors the Alcubierre metric's behaviour:
 *
 *   - WIDE ahead of the ship (uncompressed space)
 *   - Funnels INTO the front ring (contraction / "sucked in")
 *   - NARROW throat passing through the hull (compressed space)
 *   - Funnels through the back ring and flares OUT explosively behind
 *     (expansion / "exploding out the back")
 *
 * A custom ShaderMaterial draws grid lines — meridians (fixed angular
 * spacing) and parallels (fixed world-X spacing, scrolling in -X with
 * time). Because parallels are spaced by world distance, the grid
 * squares naturally shrink where the tube narrows, visualising the
 * contraction of space without any fake stretching.
 */

// ── Ship ring positions (must match buildShip in alcubierre-model.js) ──
const FRONT_RING_X  = 2.4 / 2 + 0.1     // +1.3
const BACK_RING_X   = -(2.4 / 2 + 0.1)  // -1.3

// ── Ribbon profile parameters ──
const THROAT_R      = 0.35    // radius at center of ship (max compression)
const RING_R        = 0.95    // radius at the ring planes (just inside 1.2)
const MAX_FRONT_R   = 3.2     // radius far ahead of ship
const MAX_BACK_R    = 4.8     // radius far behind ship (larger: "explosion")
const FRONT_EXTENT  = 9       // world units ahead that the ribbon stretches
const BACK_EXTENT   = 13      // world units behind

const U_SEGMENTS    = 320
const V_SEGMENTS    = 40

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

// Proper-distance "density" of parallels along the ship's X axis.
// AHEAD of the ship, space is contracted (Alcubierre metric: York θ<0)
// → more rings per world-X (blueshift feel). BEHIND the ship, space is
// stretched (θ>0) → fewer rings per world-X (redshift feel). Integrating
// this profile into a per-vertex arc coordinate makes parallels literally
// bunch up at the intake and spread out at the exhaust.
function gridDensity(x) {
  const t = smoothstep(-6, 6, x)          // 0 behind, 1 ahead
  return 0.55 + 1.70 * t                  // [0.55, 2.25] rings / world-unit (~4x ratio)
}

// Smoothly interpolated radius as a function of x along the ship's axis.
function ribbonRadius(x) {
  if (x >= FRONT_RING_X) {
    // Front exterior: narrows from MAX_FRONT_R (far) to RING_R (at ring)
    const s = smoothstep(FRONT_RING_X, FRONT_RING_X + FRONT_EXTENT, x)
    return RING_R + (MAX_FRONT_R - RING_R) * s
  }
  if (x <= BACK_RING_X) {
    // Back exterior: expands from RING_R (at ring) to MAX_BACK_R (far)
    // Asymmetric flare: fast initial opening, then levelling out (cube-root feel)
    const t = Math.min(1, (BACK_RING_X - x) / BACK_EXTENT)
    const flare = 1 - Math.pow(1 - t, 1.6)   // easeOut curve, opens fast
    return RING_R + (MAX_BACK_R - RING_R) * flare
  }
  // Interior: parabolic throat between the two rings
  // Range: [-1.3, +1.3] → normalised n ∈ [-1, +1]
  const n = x / FRONT_RING_X
  // Min at n=0 (throat), RING_R at |n|=1 (rings) — quadratic blend
  return THROAT_R + (RING_R - THROAT_R) * (n * n)
}

// ─── Build parametric tube ribbon ────────────────────────────────────────────

function buildRibbon() {
  const positions = new Float32Array(U_SEGMENTS * V_SEGMENTS * 3)
  const uvs       = new Float32Array(U_SEGMENTS * V_SEGMENTS * 2)
  const radii     = new Float32Array(U_SEGMENTS * V_SEGMENTS)  // per-vertex
  const arcS      = new Float32Array(U_SEGMENTS * V_SEGMENTS)  // proper distance
  const indices   = []

  const farFront = FRONT_RING_X + FRONT_EXTENT
  const farBack  = BACK_RING_X - BACK_EXTENT
  const totalLen = farFront - farBack
  const dxStep   = totalLen / (U_SEGMENTS - 1)

  // Pre-integrate density(x) → per-U proper-distance coordinate.
  // sByI[0] = 0 at x = farFront; decreases (more negative) going toward the
  // trail. Adjacent rings are closer in x where density(x) is high.
  const sByI = new Float32Array(U_SEGMENTS)
  sByI[0] = 0
  for (let i = 1; i < U_SEGMENTS; i++) {
    const xmid = farFront - (i - 0.5) * dxStep
    sByI[i] = sByI[i - 1] - gridDensity(xmid) * dxStep
  }

  for (let i = 0; i < U_SEGMENTS; i++) {
    // u = 0 → farFront (nose side), u = 1 → farBack (trail)
    const u = i / (U_SEGMENTS - 1)
    const x = farFront - u * totalLen
    const r = ribbonRadius(x)
    const s = sByI[i]

    for (let j = 0; j < V_SEGMENTS; j++) {
      const v = j / (V_SEGMENTS - 1)
      const ang = v * Math.PI * 2
      const idx = (i * V_SEGMENTS + j)

      positions[idx * 3]     = x
      positions[idx * 3 + 1] = Math.sin(ang) * r
      positions[idx * 3 + 2] = Math.cos(ang) * r

      uvs[idx * 2]     = u
      uvs[idx * 2 + 1] = v

      radii[idx] = r
      arcS[idx]  = s
    }
  }

  // Indices (two triangles per quad). Wrap v at the seam so the tube closes.
  for (let i = 0; i < U_SEGMENTS - 1; i++) {
    for (let j = 0; j < V_SEGMENTS; j++) {
      const jn = (j + 1) % V_SEGMENTS
      const a = i * V_SEGMENTS + j
      const b = i * V_SEGMENTS + jn
      const c = (i + 1) * V_SEGMENTS + j
      const d = (i + 1) * V_SEGMENTS + jn
      indices.push(a, c, b, b, c, d)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('uv',       new THREE.BufferAttribute(uvs, 2))
  geo.setAttribute('radius',   new THREE.BufferAttribute(radii, 1))
  geo.setAttribute('arcS',     new THREE.BufferAttribute(arcS, 1))
  geo.setIndex(indices)
  geo.computeVertexNormals()

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      time:         { value: 0 },
      scrollSpeed:  { value: 4.5 },
      frontRingX:   { value: FRONT_RING_X },
      backRingX:    { value: BACK_RING_X },
      throatR:      { value: THROAT_R },
      maxFrontR:    { value: MAX_FRONT_R },
      ringGlow:     { value: 1.0 },
    },
    transparent: true,
    depthWrite:  false,
    blending:    THREE.AdditiveBlending,
    side:        THREE.FrontSide,
    vertexShader: `
      attribute float radius;
      attribute float arcS;
      varying vec3  vWorldPos;
      varying vec2  vUv;
      varying float vRadius;
      varying float vArcS;

      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vUv = uv;
        vRadius = radius;
        vArcS = arcS;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      precision highp float;
      varying vec3  vWorldPos;
      varying vec2  vUv;
      varying float vRadius;
      varying float vArcS;

      uniform float time;
      uniform float scrollSpeed;
      uniform float frontRingX;
      uniform float backRingX;
      uniform float throatR;
      uniform float maxFrontR;
      uniform float ringGlow;

      // Antialiased line mask. Returns 1 near line (at integer values).
      float lineMask(float coord, float halfWidth) {
        float f = abs(fract(coord) - 0.5);
        float aa = fwidth(coord) * 1.8 + halfWidth;
        return 1.0 - smoothstep(halfWidth, aa, f);
      }

      void main() {
        // ── Parallel rings: spaced by PROPER-DISTANCE (arc-length) ──
        // vArcS is pre-baked from the density profile — high density ahead
        // of the ship, low behind — so integer ticks bunch up at the intake
        // (blueshift) and spread at the exhaust (redshift). Scrolling is
        // just a uniform shift in this coordinate, so rings organically
        // crawl through the compressed region and race past in the rear.
        float ringCoord = vArcS + time * scrollSpeed;
        float rings = lineMask(ringCoord, 0.08);

        // ── Meridian lines: fixed count around the tube ──
        // Run the full length of the ribbon — no fade at wide radii.
        float meridianCount = 20.0;
        float meridianCoord = vUv.y * meridianCount;
        float meridians = lineMask(meridianCoord, 0.06);

        float grid = max(rings, meridians);

        // ── Compression glow: narrower radius = more compressed = brighter ──
        // Ramp starts at a moderate radius so the immediate throat (where the
        // ship lives) doesn't overbloom. Tube stays cool cyan near the hull,
        // grid lines still contrast on darker background.
        float compression = smoothstep(maxFrontR * 0.9, throatR * 2.0, vRadius);
        compression = clamp(compression * 0.7, 0.0, 0.7);

        // ── Colour palette (muted) ──
        // Desaturated blues ahead, desaturated warm amber behind — the
        // asymmetry sells the blueshift/redshift metaphor without the
        // saturated-cartoon look of full-chroma primaries.
        vec3 cCool    = vec3(0.30, 0.50, 0.72);    // muted dusty blue
        vec3 cHot     = vec3(0.55, 0.78, 0.88);    // soft cyan (throat)
        vec3 cExhaust = vec3(0.82, 0.58, 0.38);    // muted warm amber (rear)
        vec3 cBlaze   = vec3(0.90, 0.80, 0.62);    // soft gold (ring flash)
        vec3 color    = mix(cCool, cHot, compression);

        // Blend toward exhaust amber behind the rear ring. Capped so the
        // tail never fully saturates.
        float rearMix = smoothstep(backRingX - 1.0, backRingX - 10.0, vWorldPos.x);
        color = mix(color, cExhaust, rearMix * 0.55);

        // ── Ring plane flash: brightens grid where it crosses front/back rings ──
        // Sharper falloff so the glow is confined to the ring planes and
        // doesn't bleed into the interior throat (which would hide the ship).
        float dxFront = vWorldPos.x - frontRingX;
        float dxBack  = vWorldPos.x - backRingX;
        float flashF = exp(-dxFront * dxFront * 7.0);
        float flashB = exp(-dxBack  * dxBack  * 7.0);
        float flash = max(flashF, flashB) * ringGlow;
        color = mix(color, cBlaze, flash * 0.45);

        // ── Brightness ──
        // Grid lines are the hero; the tube surface between them is mostly dark.
        // Additive blending + bloom will glow them up without washing the scene.
        float gridBrightness = grid * (0.50 + 0.8 * compression + 0.7 * flash);
        float base = 0.004 + 0.025 * compression + 0.10 * flash;

        // Fade the very far ends so the ribbon doesn't clip harshly
        float endsFade = smoothstep(0.0, 0.025, vUv.x) *
                        smoothstep(1.0, 0.97, vUv.x);

        vec3 finalCol = color * (gridBrightness + base) * endsFade;
        gl_FragColor = vec4(finalCol, 1.0);
      }
    `,
  })

  const mesh = new THREE.Mesh(geo, mat)
  mesh.frustumCulled = false
  return { mesh, mat }
}

// ─── Flow particles: bright streaks riding the profile along the ribbon ──

const FLOW_COUNT  = 3600
const FLOW_SPEED  = 12.0  // world-X units per second

function buildFlowParticles() {
  const positions = new Float32Array(FLOW_COUNT * 3)
  const colors    = new Float32Array(FLOW_COUNT * 3)
  const sizes     = new Float32Array(FLOW_COUNT)
  const seeds     = new Float32Array(FLOW_COUNT * 2)  // (v angle, r jitter)

  const farFront = FRONT_RING_X + FRONT_EXTENT
  const farBack  = BACK_RING_X - BACK_EXTENT
  const totalLen = farFront - farBack

  for (let i = 0; i < FLOW_COUNT; i++) {
    seeds[i * 2]     = Math.random() * Math.PI * 2
    seeds[i * 2 + 1] = 0.85 + Math.random() * 0.3      // radius jitter (0.85..1.15 of profile)
    sizes[i]         = 0.35 + Math.random() * 0.5
    // Stagger initial phase along the tube
    const phase = Math.random() * totalLen
    positions[i * 3] = farFront - phase
    colors[i * 3]     = 0.6
    colors[i * 3 + 1] = 0.85
    colors[i * 3 + 2] = 1.0
  }

  const geo = new THREE.BufferGeometry()
  const posAttr = new THREE.BufferAttribute(positions, 3)
  posAttr.setUsage(THREE.DynamicDrawUsage)
  const colAttr = new THREE.BufferAttribute(colors, 3)
  colAttr.setUsage(THREE.DynamicDrawUsage)
  const sizeAttr = new THREE.BufferAttribute(sizes, 1)
  geo.setAttribute('position', posAttr)
  geo.setAttribute('color',    colAttr)
  geo.setAttribute('size',     sizeAttr)

  // Custom shader: round soft-edged points with a bright core.
  // `gl_PointCoord` runs 0..1 across the sprite; we mask anything outside a
  // circle centred at (0.5, 0.5). Size attenuation mimics PointsMaterial.
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      baseSize: { value: 1.6 },   // ~px at 10 world-units away, scales by depth
    },
    transparent: true,
    depthWrite:  false,
    blending:    THREE.AdditiveBlending,
    vertexShader: `
      attribute vec3  color;
      attribute float size;
      uniform   float baseSize;
      varying   vec3  vColor;

      void main() {
        vColor = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        // Size attenuation: equivalent to PointsMaterial sizeAttenuation:true
        gl_PointSize = baseSize * size * (120.0 / max(-mv.z, 1.0));
        gl_Position  = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      precision highp float;
      varying vec3 vColor;

      void main() {
        vec2 d = gl_PointCoord - vec2(0.5);
        float r2 = dot(d, d);                    // 0 at centre, 0.25 at edge
        float alpha = 1.0 - smoothstep(0.18, 0.25, r2);
        if (alpha < 0.01) discard;
        float core = 1.0 - smoothstep(0.0, 0.12, r2);
        gl_FragColor = vec4(vColor * (0.85 + 0.7 * core), alpha);
      }
    `,
  })

  const points = new THREE.Points(geo, mat)
  points.frustumCulled = false

  return { points, posAttr, colAttr, seeds }
}

function updateFlowParticles(flow, time) {
  const parr = flow.posAttr.array
  const carr = flow.colAttr.array
  const farFront = FRONT_RING_X + FRONT_EXTENT
  const farBack  = BACK_RING_X - BACK_EXTENT
  const totalLen = farFront - farBack

  for (let i = 0; i < FLOW_COUNT; i++) {
    const baseVAngle = flow.seeds[i * 2]
    const rJitter    = flow.seeds[i * 2 + 1]

    // Advance X phase uniformly; wrap when past the trail tip
    // Scale: use current seed as phase offset for deterministic but varied staging
    const phase = (time * FLOW_SPEED + flow.seeds[i * 2] * 20 + i * 3.7) % totalLen
    const x = farFront - phase

    // Accelerate tangentially near the throat — swirl it up to suggest torsion
    const r = ribbonRadius(x)
    // Angular velocity scales with 1/r (conservation of angular momentum feel)
    const swirl = time * 1.2 / Math.max(r, 0.2)
    const ang = baseVAngle + swirl

    parr[i * 3]     = x
    parr[i * 3 + 1] = Math.sin(ang) * r * rJitter
    parr[i * 3 + 2] = Math.cos(ang) * r * rJitter

    // Brighten particles near the ring planes + in the throat
    const dxF = Math.abs(x - FRONT_RING_X)
    const dxB = Math.abs(x - BACK_RING_X)
    const flash = Math.max(Math.exp(-dxF * dxF * 2.0), Math.exp(-dxB * dxB * 2.0))
    const inThroat = x > BACK_RING_X && x < FRONT_RING_X ? 1 : 0

    // Colour shifts cyan → gold near the rings, white in the throat
    const boost = 0.45 + 0.55 * flash + 0.3 * inThroat
    carr[i * 3]     = (0.45 + 0.5 * flash + 0.3 * inThroat) * boost
    carr[i * 3 + 1] = (0.8  + 0.1 * flash + 0.1 * inThroat) * boost
    carr[i * 3 + 2] = (0.95 - 0.2 * flash) * boost
  }
  flow.posAttr.needsUpdate = true
  flow.colAttr.needsUpdate = true
}

// ─── Starfield (copied from v1, kept self-contained so we can tweak) ─────────

const STAR_COUNT  = 2500
const STAR_RADIUS = 120

function buildStarfield() {
  const positions = new Float32Array(STAR_COUNT * 3)
  const colors    = new Float32Array(STAR_COUNT * 3)
  for (let i = 0; i < STAR_COUNT; i++) {
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    const r = STAR_RADIUS * (0.7 + Math.random() * 0.3)
    positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
    positions[i * 3 + 2] = r * Math.cos(phi)
    const warmth = Math.random()
    if (warmth > 0.85) {
      colors[i * 3] = 1.0; colors[i * 3 + 1] = 0.88; colors[i * 3 + 2] = 0.65
    } else if (warmth > 0.6) {
      colors[i * 3] = 0.7; colors[i * 3 + 1] = 0.82; colors[i * 3 + 2] = 1.0
    } else {
      colors[i * 3] = 0.88; colors[i * 3 + 1] = 0.9; colors[i * 3 + 2] = 0.94
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('color',    new THREE.Float32BufferAttribute(colors, 3))
  return new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.5, vertexColors: true, transparent: true, opacity: 0.7, sizeAttenuation: true,
  }))
}

// ─── Export ──────────────────────────────────────────────────────────────────

export function createAlcubierreV2Model() {
  const ship = buildShip()
  // Put the ship at origin (no grid surface to sit on)
  ship.group.position.y = 0

  const ribbon   = buildRibbon()
  const flow     = buildFlowParticles()
  const starfield = buildStarfield()

  return {
    ship: ship.group,
    ribbon: ribbon.mesh,
    flow:   flow.points,
    starfield,

    update(time) {
      ribbon.mat.uniforms.time.value = time
      // Pulse the ring flash gently so the two rings feel alive
      ribbon.mat.uniforms.ringGlow.value = 0.85 + 0.25 * Math.sin(time * 1.7)
      ship.ringMat.emissiveIntensity = 1.8 + 0.4 * Math.sin(time * 2.3)

      updateFlowParticles(flow, time)

      starfield.rotation.y = time * 0.003
    },
  }
}
