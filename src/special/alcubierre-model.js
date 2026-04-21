import * as THREE from 'three'

/**
 * Alcubierre Warp Drive — ship's reference frame (wind tunnel).
 *
 * The warp bubble is fixed at the origin. Z-direction grid lines (vertical
 * stripes) scroll through the bubble in -X, showing space flowing past.
 * X-direction lines (horizontal stripes) are static and show the warp shape.
 * Together they create the wind-tunnel effect without wrap artifacts.
 */

const GRID_SIZE       = 60
const GRID_DIVISIONS  = 50
const GRID_RESOLUTION = 300
const STAR_COUNT      = 2500
const STAR_RADIUS     = 120
const HALF            = GRID_SIZE / 2

// ─── Warp bubble (fixed at origin) ───────────────────────────────────────────
const BUBBLE_R        = 6
const WARP_AMP        = 4
const WALL_W          = 2.5
const FLOW_SPEED      = 3

// ─── Warp deformation ────────────────────────────────────────────────────────

function warpY(x, z) {
  const r2 = x * x + z * z
  const r = Math.sqrt(r2)
  if (r < 0.001) return 0
  const wallDist = r - BUBBLE_R
  const wall = Math.exp(-wallDist * wallDist / (2 * WALL_W * WALL_W))
  // Smooth fade near center: r²/(r²+1) → 0 at origin, → 1 for r >> 1
  const centerFade = r2 / (r2 + 1)
  return -WARP_AMP * (x / r) * wall * centerFade
}

function warpColor(x, z) {
  const r = Math.sqrt(x * x + z * z)
  const wallDist = r - BUBBLE_R
  const wall = Math.exp(-wallDist * wallDist / (2 * WALL_W * WALL_W))
  const intensity = 0.45 + 0.55 * wall
  return [intensity * 0.55, intensity * 0.9, intensity * 1.0]
}

// ─── Grid builders ───────────────────────────────────────────────────────────

function buildGridLine(gridMat, getXZ, count) {
  const baseX = new Float32Array(count)
  const baseZ = new Float32Array(count)
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)

  for (let j = 0; j < count; j++) {
    const t = j / (count - 1)
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

  return { line, posAttr, colAttr, baseX, baseZ, count }
}

function buildGrid() {
  const group = new THREE.Group()
  const step = GRID_SIZE / GRID_DIVISIONS
  const count = GRID_RESOLUTION + 1

  const gridMat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.75,
  })

  // X-direction lines (static — show the warp shape)
  const xLines = []
  for (let i = 0; i <= GRID_DIVISIONS; i++) {
    const z = -HALF + i * step
    const data = buildGridLine(gridMat, t => ({ x: -HALF + t * GRID_SIZE, z }), count)
    group.add(data.line)
    xLines.push(data)
  }

  // Z-direction lines (scroll in -X through the bubble)
  const zLines = []
  for (let i = 0; i <= GRID_DIVISIONS; i++) {
    const x = -HALF + i * step
    const data = buildGridLine(gridMat, t => ({ x, z: -HALF + t * GRID_SIZE }), count)
    group.add(data.line)
    zLines.push(data)
  }

  // Compute initial state for X-lines (static deformation)
  for (const d of xLines) {
    const parr = d.posAttr.array
    const carr = d.colAttr.array
    for (let i = 0; i < d.count; i++) {
      const x = d.baseX[i], z = d.baseZ[i]
      parr[i * 3 + 1] = warpY(x, z)
      const [cr, cg, cb] = warpColor(x, z)
      carr[i * 3] = cr; carr[i * 3 + 1] = cg; carr[i * 3 + 2] = cb
    }
    d.posAttr.needsUpdate = true
    d.colAttr.needsUpdate = true
  }

  return { group, xLines, zLines }
}

// ─── Ship (centered at origin, aligned along X axis) ─────────────────────────
//
// Central cylinder hull with warp-field generator rings at each end.
// Thin struts connect the hull to the rings. Rings glow to suggest
// they're the source of the bubble.

function buildShip() {
  const group = new THREE.Group()

  const hullMat = new THREE.MeshStandardMaterial({
    color: 0x283848,
    roughness: 0.2,
    metalness: 0.85,
    emissive: 0x203050,
    emissiveIntensity: 0.8,
  })

  const ringMat = new THREE.MeshStandardMaterial({
    color: 0x1a2040,
    roughness: 0.15,
    metalness: 0.85,
    emissive: 0x3060c0,
    emissiveIntensity: 1.5,
  })

  const strutMat = new THREE.MeshStandardMaterial({
    color: 0x304050,
    roughness: 0.3,
    metalness: 0.8,
    emissive: 0x203048,
    emissiveIntensity: 0.6,
  })

  // ── Main hull: cylinder along X ──
  const hullLen = 2.4
  const hullR = 0.3
  const hullGeo = new THREE.CylinderGeometry(hullR, hullR, hullLen, 16, 1)
  hullGeo.rotateZ(Math.PI / 2) // align with X axis
  group.add(new THREE.Mesh(hullGeo, hullMat))

  // ── Tapered nose cone (+X end) ──
  const noseGeo = new THREE.ConeGeometry(hullR, 0.6, 16)
  noseGeo.rotateZ(-Math.PI / 2) // point in +X
  const nose = new THREE.Mesh(noseGeo, hullMat)
  nose.position.x = hullLen / 2 + 0.3
  group.add(nose)

  // ── Engine flare (-X end) ──
  const flareGeo = new THREE.CylinderGeometry(hullR, hullR * 1.3, 0.3, 16)
  flareGeo.rotateZ(Math.PI / 2)
  const flare = new THREE.Mesh(flareGeo, hullMat)
  flare.position.x = -hullLen / 2 - 0.15
  group.add(flare)

  // ── Warp rings — torus at each end ──
  const ringR = 1.2      // ring major radius (distance from center)
  const ringTube = 0.08   // ring tube radius
  const ringSegs = 32

  function addRingAssembly(xPos) {
    // Outer torus
    const torusGeo = new THREE.TorusGeometry(ringR, ringTube, 12, ringSegs)
    torusGeo.rotateY(Math.PI / 2)
    const ring = new THREE.Mesh(torusGeo, ringMat)
    ring.position.x = xPos
    group.add(ring)

    // Inner torus for depth
    const innerGeo = new THREE.TorusGeometry(ringR * 0.85, ringTube * 0.6, 10, ringSegs)
    innerGeo.rotateY(Math.PI / 2)
    const inner = new THREE.Mesh(innerGeo, ringMat)
    inner.position.x = xPos
    group.add(inner)

    // 4 radial struts connecting hull to ring
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + Math.PI / 4
      const strutLen = ringR - hullR
      const strutGeo = new THREE.CylinderGeometry(0.025, 0.025, strutLen, 6)
      const strut = new THREE.Mesh(strutGeo, strutMat)
      const midR = hullR + strutLen / 2
      strut.position.set(xPos, Math.cos(angle) * midR, Math.sin(angle) * midR)
      strut.rotation.x = angle
      group.add(strut)
    }
  }

  addRingAssembly(hullLen / 2 + 0.1)   // front
  addRingAssembly(-hullLen / 2 - 0.1)  // rear

  // Position ship slightly above the grid surface (inside flat bubble)
  group.position.y = 0.15

  return { group, ringMat }
}

// ─── Starfield ───────────────────────────────────────────────────────────────

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

// ─── Wake particles — stream behind the bubble in -X ─────────────────────────

const WAKE_COUNT = 200
const WAKE_SPEED = 8
const WAKE_SPREAD = 4  // lateral spread (Y/Z)

function buildWake() {
  const positions = new Float32Array(WAKE_COUNT * 3)
  const colors = new Float32Array(WAKE_COUNT * 3)
  // Store base offsets for each particle
  const offsets = new Float32Array(WAKE_COUNT * 3) // x-phase, y-offset, z-offset

  for (let i = 0; i < WAKE_COUNT; i++) {
    offsets[i * 3]     = Math.random() * 40 // x phase (spread along trail)
    offsets[i * 3 + 1] = (Math.random() - 0.5) * WAKE_SPREAD
    offsets[i * 3 + 2] = (Math.random() - 0.5) * WAKE_SPREAD

    colors[i * 3]     = 0.3
    colors[i * 3 + 1] = 0.6
    colors[i * 3 + 2] = 0.9
  }

  const geo = new THREE.BufferGeometry()
  const posAttr = new THREE.BufferAttribute(positions, 3)
  posAttr.setUsage(THREE.DynamicDrawUsage)
  geo.setAttribute('position', posAttr)
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))

  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.2,
    vertexColors: true,
    transparent: true,
    opacity: 0.35,
    sizeAttenuation: true,
    depthWrite: false,
  }))

  return { points, posAttr, offsets }
}

function updateWake(wake, time) {
  const parr = wake.posAttr.array
  for (let i = 0; i < WAKE_COUNT; i++) {
    const phase = wake.offsets[i * 3]
    const yOff  = wake.offsets[i * 3 + 1]
    const zOff  = wake.offsets[i * 3 + 2]

    // Particle streams in -X from behind the bubble (x < -BUBBLE_R)
    const x = -BUBBLE_R - ((time * WAKE_SPEED + phase) % 40)
    parr[i * 3]     = x
    parr[i * 3 + 1] = yOff * (1 + Math.abs(x) * 0.02) // spread widens with distance
    parr[i * 3 + 2] = zOff * (1 + Math.abs(x) * 0.02)
  }
  wake.posAttr.needsUpdate = true
}

// ─── Export ──────────────────────────────────────────────────────────────────

export function createAlcubierreModel() {
  const grid = buildGrid()
  const ship = buildShip()
  const wake = buildWake()
  const starfield = buildStarfield()

  // Initial Z-line positions
  updateZLines(grid.zLines, 0)

  return {
    grid: grid.group,
    ship: ship.group,
    wake: wake.points,
    starfield,

    update(time) {
      updateZLines(grid.zLines, time * FLOW_SPEED)
      updateWake(wake, time)

      ship.ringMat.emissiveIntensity = 1.8

      starfield.rotation.y = time * 0.003
    },
  }
}

function updateZLines(zLines, offset) {
  for (const d of zLines) {
    // Shift this line's X position, wrap to grid bounds
    // All vertices in a Z-line share the same baseX, so the whole line shifts as a unit
    const rawX = d.baseX[0] - offset
    const x = ((rawX % GRID_SIZE) + GRID_SIZE + HALF) % GRID_SIZE - HALF

    const parr = d.posAttr.array
    const carr = d.colAttr.array

    for (let i = 0; i < d.count; i++) {
      const z = d.baseZ[i]
      parr[i * 3]     = x
      parr[i * 3 + 1] = warpY(x, z)
      parr[i * 3 + 2] = z

      const [cr, cg, cb] = warpColor(x, z)
      carr[i * 3] = cr; carr[i * 3 + 1] = cg; carr[i * 3 + 2] = cb
    }

    d.posAttr.needsUpdate = true
    d.colAttr.needsUpdate = true
  }
}
