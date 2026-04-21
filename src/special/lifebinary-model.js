import * as THREE from 'three'

/**
 * Life of a Binary — a chapter-driven journey through the full
 * evolution of a compact binary system:
 *
 *   I.   FORMATION  — two stars in a wide stable orbit
 *   II.  INSPIRAL   — gradual energy loss to GW radiation, spiraling in
 *   III. MERGER     — collision, brief intense burst
 *   IV.  RINGDOWN   — remnant oscillates, emitting decaying waves
 *   V.   SETTLED    — stable Kerr black hole with frame dragging
 *
 * Same grid/rubber-sheet visual as the other views, but parameters
 * (separation, orbital speed, GW amplitude, remnant visibility) all
 * transition smoothly across chapters. Chapters cycle automatically;
 * a chapter nav lets the user skip/replay.
 */

const GRID_SIZE       = 60
const GRID_DIVISIONS  = 40
const GRID_RESOLUTION = 250
const STAR_COUNT      = 2500
const STAR_RADIUS     = 120

// Object (equal-mass binary for clarity)
const OBJ_MASS   = 10
const OBJ_S      = 1.5
const OBJ_R      = 1.5
const OBJ_S2     = OBJ_S * OBJ_S
const OBJ_R2     = OBJ_R * OBJ_R

// Remnant (merged BH)
const REMNANT_R  = 2.2
const REMNANT_S  = 1.5
const REMNANT_S2 = REMNANT_S * REMNANT_S
const REMNANT_R2 = REMNANT_R * REMNANT_R

// GW wave propagation speed (visual, not real c)
const GW_SPEED   = 6

// ─── Chapter definitions ────────────────────────────────────────────────────
// durations in seconds — total ~60s loop
export const CHAPTERS = [
  { name: 'FORMATION', duration: 10, label: 'I. Formation' },
  { name: 'INSPIRAL',  duration: 18, label: 'II. Inspiral' },
  { name: 'MERGER',    duration: 1.5, label: 'III. Merger' },
  { name: 'RINGDOWN',  duration: 8,  label: 'IV. Ringdown' },
  { name: 'SETTLED',   duration: 12, label: 'V. Settled' },
]

function chapterTime(t) {
  // Convert absolute time to (chapterIdx, chapterT in [0,1])
  const total = CHAPTERS.reduce((s, c) => s + c.duration, 0)
  const tMod = ((t % total) + total) % total
  let acc = 0
  for (let i = 0; i < CHAPTERS.length; i++) {
    if (tMod < acc + CHAPTERS[i].duration) {
      return { idx: i, localT: (tMod - acc) / CHAPTERS[i].duration, absT: tMod }
    }
    acc += CHAPTERS[i].duration
  }
  return { idx: CHAPTERS.length - 1, localT: 1, absT: tMod }
}

// Easing
function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

// ─── Grid ───────────────────────────────────────────────────────────────────

function buildDynamicGrid() {
  const group = new THREE.Group()
  const lines = []
  const half = GRID_SIZE / 2
  const step = GRID_SIZE / GRID_DIVISIONS

  const gridMat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.75,
  })

  function makeLine(getXZ) {
    const count = GRID_RESOLUTION + 1
    const baseX = new Float32Array(count)
    const baseZ = new Float32Array(count)
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)

    for (let j = 0; j < count; j++) {
      const t = j / GRID_RESOLUTION
      const { x, z } = getXZ(t)
      baseX[j] = x
      baseZ[j] = z
      positions[j * 3]     = x
      positions[j * 3 + 1] = 0
      positions[j * 3 + 2] = z
    }

    const geo = new THREE.BufferGeometry()
    const posAttr = new THREE.BufferAttribute(positions, 3)
    posAttr.setUsage(THREE.DynamicDrawUsage)
    const colAttr = new THREE.BufferAttribute(colors, 3)
    colAttr.setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute('position', posAttr)
    geo.setAttribute('color', colAttr)

    const line = new THREE.Line(geo, gridMat)
    line.frustumCulled = false
    group.add(line)
    lines.push({ posAttr, colAttr, baseX, baseZ, count })
  }

  for (let i = 0; i <= GRID_DIVISIONS; i++) {
    const z = -half + i * step
    makeLine(t => ({ x: -half + t * GRID_SIZE, z }))
  }
  for (let i = 0; i <= GRID_DIVISIONS; i++) {
    const x = -half + i * step
    makeLine(t => ({ x, z: -half + t * GRID_SIZE }))
  }

  return { group, lines }
}

// ─── Objects ────────────────────────────────────────────────────────────────

function buildObj(emissive) {
  const geo = new THREE.SphereGeometry(OBJ_R, 48, 32)
  const mat = new THREE.MeshStandardMaterial({
    color: 0x0c1428,
    roughness: 0.12,
    metalness: 0.9,
    emissive,
    emissiveIntensity: 1.2,
  })
  return { mesh: new THREE.Mesh(geo, mat), mat }
}

function buildRemnant() {
  const geo = new THREE.SphereGeometry(REMNANT_R, 64, 48)
  const mat = new THREE.MeshStandardMaterial({
    color: 0x02060c,
    roughness: 0.05,
    metalness: 0.98,
    emissive: 0x2050e0,
    emissiveIntensity: 1.4,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.visible = false
  return { mesh, mat }
}

// Shader-rendered accretion disk — direct port of the Novikov-Thorne thin-disk
// shader from src/views/blackhole.js (temperature gradient + Doppler beaming +
// Keplerian log-spiral FBM turbulence). We rescale local geometry coordinates
// into the BH shader's unit system (inner≈4.5, outer≈20) so the exact same
// shading math applies on a flat RingGeometry without ray-marching.
function buildAccretionRing() {
  const innerR = REMNANT_R * 1.4
  const outerR = REMNANT_R * 4.0
  const geo = new THREE.RingGeometry(innerR, outerR, 256, 48)
  // Tilt slightly so we see the disk at an angle (adds depth)
  geo.rotateX(-Math.PI / 2 + 0.25)

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      time:        { value: 0 },
      opacity:     { value: 0 },
      innerR:      { value: innerR },
      outerR:      { value: outerR },
      diskInner:   { value: 4.5 },   // shader-space inner (matches blackhole.js)
      diskOuter:   { value: 20.0 },  // shader-space outer (matches blackhole.js)
    },
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      varying vec2 vLocalXY;
      varying vec3 vWorldPos;
      void main() {
        vLocalXY = position.xy;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      precision highp float;
      varying vec2 vLocalXY;
      varying vec3 vWorldPos;
      uniform float time;
      uniform float opacity;
      uniform float innerR;
      uniform float outerR;
      uniform float diskInner;
      uniform float diskOuter;

      // ── Noise (from blackhole.js) ──
      float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float noise(vec2 p){
        vec2 i=floor(p), f=fract(p);
        f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),
                   mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
      }
      float fbm(vec2 p){
        float v = 0.0, a = 0.5;
        for(int i=0;i<8;i++){
          v += a*noise(p); p *= 2.1; a *= 0.5;
        }
        return v;
      }

      void main() {
        // Rescale local radius into the BH shader's coordinate system
        // (diskInner..diskOuter), so the same shading math applies.
        float rLocal = length(vLocalXY);
        float tNorm = clamp((rLocal - innerR) / (outerR - innerR), 0.0, 1.0);
        float r = mix(diskInner, diskOuter, tNorm);
        float theta = atan(vLocalXY.y, vLocalXY.x);

        float t = (r - diskInner)/(diskOuter - diskInner);

        // Temperature: T ∝ r^(-3/4) (Novikov-Thorne thin disk)
        float temp = pow(max(1.0 - t*0.82, 0.01), 2.0);

        // Colour: vivid gold → saturated orange → deep red-brown
        vec3 cHot  = vec3(1.0, 0.85, 0.55);
        vec3 cWarm = vec3(0.92, 0.45, 0.08);
        vec3 cCool = vec3(0.50, 0.12, 0.02);
        vec3 col;
        if(t < 0.2) col = mix(cHot, cWarm, t/0.2);
        else        col = mix(cWarm, cCool, (t-0.2)/0.8);

        // Doppler beaming
        float beta = mix(0.22, 0.06, t);
        float cosA = cos(theta);
        float D = (1.0 + beta*cosA) / max(1.0 - beta*cosA, 0.01);
        float doppler = pow(D, 2.0);

        // Keplerian differential rotation: ω ∝ r^(-3/2)
        float omega = 1.8 / pow(max(r, diskInner), 1.5);
        float rotAngle = theta + omega * time;

        // Logarithmic-spiral streamline coordinates
        float logR = log(max(r, 0.1));
        float s = rotAngle - logR * 2.5;
        float q = logR;

        // Multi-scale FBM turbulence (no rings)
        float large = fbm(vec2(s, q) * 4.8);
        float med   = fbm(vec2(s * 10.0, q * 11.0) + vec2(13.7, 7.3));
        float fine  = fbm(vec2(s * 20.0, q * 22.0) + vec2(31.5, 19.1));
        float turb = 0.15 + 0.45 * large + 0.28 * med + 0.12 * fine;
        turb = mix(0.75, turb, smoothstep(0.0, 0.25, t));

        float emission = temp * turb * doppler * 1.1;

        // Incidence-based optical depth (ray direction ≈ camera→fragment)
        vec3 rayDir = normalize(vWorldPos - cameraPosition);
        // The disk was tilted by -π/2 + 0.25 about world X, so its normal in
        // world space is approximately (0, cos(0.25), -sin(0.25)).
        vec3 diskN = vec3(0.0, 0.9689, -0.2474);
        float cosInc = abs(dot(rayDir, diskN));
        float tau = 2.5 / max(cosInc, 0.2);
        tau *= (0.6 + 0.4 * temp);
        float alpha = 1.0 - exp(-tau);

        // Soft radial edges
        alpha *= smoothstep(0.0, 0.04, t) * smoothstep(1.0, 0.65, t);

        // Additive output, pre-multiplied by alpha so thinner regions glow less
        gl_FragColor = vec4(col * emission * alpha * opacity, 1.0);
      }
    `,
  })

  const mesh = new THREE.Mesh(geo, mat)
  mesh.visible = false
  return { mesh, mat }
}

// ─── Starfield ──────────────────────────────────────────────────────────────

function buildStarfield() {
  const positions = new Float32Array(STAR_COUNT * 3)
  const colors = new Float32Array(STAR_COUNT * 3)
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
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  return new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.5, vertexColors: true, transparent: true, opacity: 0.7, sizeAttenuation: true,
  }))
}

// ─── State derivation per chapter ───────────────────────────────────────────
// Given a chapter index + localT in [0,1], compute:
//   sep (separation), omega (orbital rad/s), gwAmp, remnantVisible, remnantGlow, diskOpacity

function chapterState(idx, localT, absT) {
  const SEP_WIDE   = 20   // Formation start separation
  const SEP_LOOSE  = 14   // Formation end ≈ inspiral start
  const SEP_CLOSE  = 3.5  // Inspiral end = merger trigger

  let sep, omega, gwAmp, binaryVisible = true, remnantVisible = false
  let remnantGlow = 0, diskOpacity = 0, theta = 0

  // A running theta that's chapter-appropriate (monotonic across chapters)
  // We rebuild theta per chapter from local values; cumulative angle maintained
  // by using `absT` within the chapter.
  const GRAV = 1.0  // mass-absorbed G
  const totalMass = OBJ_MASS * 2

  if (idx === 0) {
    // FORMATION: nearly stable wide orbit, slowly tightening slightly
    sep = SEP_WIDE - (SEP_WIDE - SEP_LOOSE) * localT
    omega = Math.sqrt(GRAV * totalMass / Math.pow(sep, 3))
    gwAmp = 0.01 * localT
  } else if (idx === 1) {
    // INSPIRAL: separation shrinks from LOOSE to CLOSE, chirp
    const progress = localT  // [0..1]
    sep = SEP_LOOSE - (SEP_LOOSE - SEP_CLOSE) * Math.pow(progress, 0.7)
    omega = Math.sqrt(GRAV * totalMass / Math.pow(sep, 3))
    gwAmp = 0.015 + 0.12 * Math.pow(progress, 2)
  } else if (idx === 2) {
    // MERGER: objects collapse together, burst, remnant appears midway
    sep = SEP_CLOSE * (1 - localT)
    omega = Math.sqrt(GRAV * totalMass / Math.max(0.3, Math.pow(sep, 3)))
    gwAmp = 0.2 * (1 - 0.5 * localT)  // peak then fade
    binaryVisible = localT < 0.5
    remnantVisible = localT >= 0.45
    remnantGlow = 2.0 * (1 - Math.abs(0.5 - localT) * 2)  // peak at center
  } else if (idx === 3) {
    // RINGDOWN: remnant oscillates, decaying sinusoid
    sep = 0
    omega = 0
    binaryVisible = false
    remnantVisible = true
    // Decaying wave amplitude, strong at start, fading to 0
    const env = Math.exp(-localT * 3)
    gwAmp = 0.14 * env * Math.cos(localT * 18)  // decaying oscillation
    gwAmp = Math.abs(gwAmp)
    remnantGlow = 1.0 + 0.5 * env * Math.sin(localT * 22)
    diskOpacity = Math.max(0, (localT - 0.6)) * 1.5  // disk fades in late
  } else {
    // SETTLED: stable Kerr BH with accretion disk. The remnant itself is a
    // black shadow — all the light comes from the accretion disk.
    sep = 0
    omega = 0
    binaryVisible = false
    remnantVisible = true
    gwAmp = 0.005
    remnantGlow = 0
    diskOpacity = 1.0
  }

  return { sep, omega, gwAmp, binaryVisible, remnantVisible, remnantGlow, diskOpacity }
}

// ─── Export ─────────────────────────────────────────────────────────────────

export function createLifeBinaryModel() {
  const objA = buildObj(0x2050c0)
  const objB = buildObj(0x2050c0)
  const remnant = buildRemnant()
  const disk = buildAccretionRing()
  const grid = buildDynamicGrid()
  const starfield = buildStarfield()

  // Accumulating orbit angle, updated per-frame from chapter-appropriate omega
  let cumulativeTheta = 0
  let lastTime = 0
  // Allow external control of current time (for chapter skipping)
  let simTime = 0

  // Camera hints per chapter — view can read these to adjust camera framing
  const cameraHints = {
    FORMATION: { position: [16, 12, 16], target: [0, -1, 0] },
    INSPIRAL:  { position: [14, 10, 14], target: [0, -1, 0] },
    MERGER:    { position: [10, 6, 10],  target: [0, -1, 0] },
    RINGDOWN:  { position: [12, 8, 12],  target: [0, -1, 0] },
    SETTLED:   { position: [18, 10, 18], target: [0, -1, 0] },
  }

  return {
    grid: grid.group,
    objA: objA.mesh,
    objB: objB.mesh,
    remnant: remnant.mesh,
    disk: disk.mesh,
    starfield,
    // state inspection
    currentChapter: 0,
    chapterLocalT: 0,
    cameraHints,

    setTime(t) { simTime = t },
    getTime() { return simTime },
    skipTo(chapterIdx) {
      let acc = 0
      for (let i = 0; i < chapterIdx; i++) acc += CHAPTERS[i].duration
      // Add a tiny offset into the target chapter so chapterTime returns that
      // chapter (the boundary case tMod == acc would fall into the NEXT chapter)
      simTime = acc + 0.01
      // Don't touch lastTime — next update() computes dt from the clock normally.
      // Update currentChapter + localT immediately so the HUD reflects the jump
      // on the very next animate frame without waiting for update() to run.
      this.currentChapter = chapterIdx
      this.chapterLocalT = 0.01 / CHAPTERS[chapterIdx].duration
    },

    update(elapsed) {
      // Advance our own clock; support skipping (setTime) without breaking dt
      const dt = Math.min(0.5, Math.max(0, elapsed - lastTime))
      lastTime = elapsed
      simTime += dt

      const { idx, localT, absT } = chapterTime(simTime)
      this.currentChapter = idx
      this.chapterLocalT = localT

      const state = chapterState(idx, localT, absT)

      // Update cumulative orbit angle
      cumulativeTheta += state.omega * dt

      // Binary positions
      const halfSep = state.sep / 2
      const ax = -halfSep * Math.cos(cumulativeTheta)
      const az = -halfSep * Math.sin(cumulativeTheta)
      const bx =  halfSep * Math.cos(cumulativeTheta)
      const bz =  halfSep * Math.sin(cumulativeTheta)

      if (state.binaryVisible && state.sep > 0.1) {
        const objY = -OBJ_MASS / Math.sqrt(OBJ_R2 + OBJ_S2)
                   + -OBJ_MASS / Math.sqrt(state.sep * state.sep + OBJ_S2)
        objA.mesh.position.set(ax, objY, az)
        objB.mesh.position.set(bx, objY, bz)
        objA.mesh.visible = true
        objB.mesh.visible = true
      } else {
        objA.mesh.visible = false
        objB.mesh.visible = false
      }

      // Remnant
      remnant.mesh.visible = state.remnantVisible
      if (state.remnantVisible) {
        const remY = -2 * OBJ_MASS / Math.sqrt(REMNANT_R2 + REMNANT_S2)
        remnant.mesh.position.set(0, remY, 0)
        remnant.mat.emissiveIntensity = state.remnantGlow
      }

      // Accretion disk
      disk.mesh.visible = state.diskOpacity > 0.01
      if (disk.mesh.visible) {
        const remY = -2 * OBJ_MASS / Math.sqrt(REMNANT_R2 + REMNANT_S2)
        disk.mesh.position.set(0, remY, 0)
        // Shader uniforms drive turbulence + opacity
        disk.mat.uniforms.time.value = elapsed
        disk.mat.uniforms.opacity.value = state.diskOpacity
      }

      // Grid update
      updateGrid(
        grid.lines,
        ax, az, bx, bz,
        state.binaryVisible ? state.sep : 0,
        state.remnantVisible,
        cumulativeTheta,
        state.omega,
        state.gwAmp,
        simTime,
      )

      starfield.rotation.y = elapsed * 0.002
    },
  }
}

function updateGrid(lines, ax, az, bx, bz, sep, remnantVisible, cumulativeTheta, omega, gwAmp, time) {
  for (const line of lines) {
    const parr = line.posAttr.array
    const carr = line.colAttr.array

    for (let i = 0; i < line.count; i++) {
      const x = line.baseX[i]
      const z = line.baseZ[i]

      let y = 0

      // Wells
      if (sep > 0.1) {
        // Binary wells
        const dax = x - ax, daz = z - az
        const ar2 = dax * dax + daz * daz
        const dbx = x - bx, dbz = z - bz
        const br2 = dbx * dbx + dbz * dbz

        y = -OBJ_MASS / Math.sqrt(ar2 + OBJ_S2)
          + -OBJ_MASS / Math.sqrt(br2 + OBJ_S2)

        // Drape over object A
        if (ar2 < OBJ_R2) {
          const objY = -OBJ_MASS / Math.sqrt(OBJ_R2 + OBJ_S2)
                     + -OBJ_MASS / Math.sqrt(sep * sep + OBJ_S2)
          const aTop = objY + Math.sqrt(OBJ_R2 - ar2)
          if (aTop > y) y = aTop
        }
        if (br2 < OBJ_R2) {
          const objY = -OBJ_MASS / Math.sqrt(OBJ_R2 + OBJ_S2)
                     + -OBJ_MASS / Math.sqrt(sep * sep + OBJ_S2)
          const bTop = objY + Math.sqrt(OBJ_R2 - br2)
          if (bTop > y) y = bTop
        }
      }

      if (remnantVisible) {
        // Single remnant well
        const cr2 = x * x + z * z
        const remY = -2 * OBJ_MASS / Math.sqrt(cr2 + REMNANT_S2)
        if (sep <= 0.1) y = remY
        else y = Math.min(y, remY)

        if (cr2 < REMNANT_R2) {
          const remCenterY = -2 * OBJ_MASS / Math.sqrt(REMNANT_R2 + REMNANT_S2)
          const rTop = remCenterY + Math.sqrt(REMNANT_R2 - cr2)
          if (rTop > y) y = rTop
        }
      }

      // Quadrupole GW pinwheel (cos(2φ))
      if (gwAmp > 0.001) {
        const r = Math.sqrt(x * x + z * z)
        if (r > 2) {
          const phi = Math.atan2(z, x)
          const thetaRet = cumulativeTheta - (r / GW_SPEED) * omega
          const wave = gwAmp / (1 + r * 0.03)
                     * Math.cos(2 * (phi - thetaRet))
          y += wave
        }
      }

      parr[i * 3 + 1] = y

      // Color — bright near wells, fading to dim
      const aDist = Math.sqrt((x - ax) * (x - ax) + (z - az) * (z - az))
      const bDist = Math.sqrt((x - bx) * (x - bx) + (z - bz) * (z - bz))
      const rDist = Math.sqrt(x * x + z * z)
      let glow = 0
      if (sep > 0.1) glow = Math.max(Math.exp(-aDist * 0.05), Math.exp(-bDist * 0.05))
      if (remnantVisible) glow = Math.max(glow, Math.exp(-rDist * 0.04))
      const intensity = 0.18 + 0.7 * glow
      carr[i * 3]     = intensity * 0.55
      carr[i * 3 + 1] = intensity * 0.9
      carr[i * 3 + 2] = intensity * 1.0
    }

    line.posAttr.needsUpdate = true
    line.colAttr.needsUpdate = true
  }
}
