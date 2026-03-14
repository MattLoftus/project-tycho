import * as THREE from 'three'

/**
 * RBMK-1000 Reactor Unit 4, Chernobyl Nuclear Power Plant — procedural model.
 *
 * Coordinate system:
 *   Origin = center of reactor building at ground level
 *   Y up, X east-west, Z north-south
 *   1 unit = 1 meter
 *
 * Two states: intact (April 25, 1986) and destroyed (April 26, 1986).
 */

// ─── Constants (meters) ─────────────────────────────────────────────────────

const BUILDING_W = 70
const BUILDING_D = 70
const BUILDING_H = 45
const CORE_RADIUS = 6     // graphite stack ~12m diameter
const CORE_HEIGHT = 7
const ELENA_RADIUS = 7    // biological shield disc
const ELENA_THICKNESS = 1.5
const TURBINE_W = 150
const TURBINE_D = 30
const TURBINE_H = 25
const STACK_HEIGHT = 150
const STACK_RADIUS = 2.5

// ─── Materials ──────────────────────────────────────────────────────────────

function makeMaterials() {
  const concrete = new THREE.MeshStandardMaterial({
    color: 0xc0b8a8, roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide,
    emissive: 0xb0a898, emissiveIntensity: 0.4,
  })
  const steel = new THREE.MeshStandardMaterial({
    color: 0x9098a0, roughness: 0.6, metalness: 0.0, side: THREE.DoubleSide,
    emissive: 0x8090a0, emissiveIntensity: 0.3,
  })
  const graphite = new THREE.MeshStandardMaterial({
    color: 0x454545, roughness: 0.85, metalness: 0.0, side: THREE.DoubleSide,
    emissive: 0x404040, emissiveIntensity: 0.3,
  })
  const burningGraphite = new THREE.MeshStandardMaterial({
    color: 0xff4400, roughness: 0.5, metalness: 0.0, side: THREE.DoubleSide,
    emissive: 0xff4400, emissiveIntensity: 1.0,
  })
  const warningYellow = new THREE.MeshStandardMaterial({
    color: 0xe0b030, roughness: 0.7, metalness: 0.0, side: THREE.DoubleSide,
    emissive: 0xd0a020, emissiveIntensity: 0.35,
  })
  const reactorGlow = new THREE.MeshStandardMaterial({
    color: 0xff3300, roughness: 0.3, metalness: 0.0, side: THREE.DoubleSide,
    emissive: 0xff3300, emissiveIntensity: 1.0,
    transparent: true, opacity: 0.7,
  })
  const stackWhite = new THREE.MeshStandardMaterial({
    color: 0xe8e8e8, roughness: 0.8, metalness: 0.0, side: THREE.DoubleSide,
    emissive: 0xe0e0e0, emissiveIntensity: 0.35,
  })
  const stackRed = new THREE.MeshStandardMaterial({
    color: 0xd04040, roughness: 0.8, metalness: 0.0, side: THREE.DoubleSide,
    emissive: 0xc03030, emissiveIntensity: 0.35,
  })
  const pipe = new THREE.MeshStandardMaterial({
    color: 0x909098, roughness: 0.5, metalness: 0.0, side: THREE.DoubleSide,
    emissive: 0x808890, emissiveIntensity: 0.3,
  })
  const smoke = new THREE.MeshStandardMaterial({
    color: 0x555555, roughness: 1.0, metalness: 0.0, side: THREE.DoubleSide,
    transparent: true, opacity: 0.3,
    emissive: 0x333333, emissiveIntensity: 0.2,
  })
  const debris = new THREE.MeshStandardMaterial({
    color: 0xa09888, roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide,
    emissive: 0x908878, emissiveIntensity: 0.35,
  })

  return { concrete, steel, graphite, burningGraphite, warningYellow, reactorGlow, stackWhite, stackRed, pipe, smoke, debris }
}

// ─── Seeded random ──────────────────────────────────────────────────────────

function seededRandom(seed) {
  let s = seed
  return function () {
    s = (s * 16807 + 0) % 2147483647
    return (s - 1) / 2147483646
  }
}

// ─── Reactor Building (intact) ──────────────────────────────────────────────

function buildReactorBuildingIntact(mt) {
  const group = new THREE.Group()
  const hw = BUILDING_W / 2
  const hd = BUILDING_D / 2

  // Main walls — four sides
  const wallT = 2.0

  // Front wall (–Z)
  const frontGeo = new THREE.BoxGeometry(BUILDING_W, BUILDING_H, wallT)
  const front = new THREE.Mesh(frontGeo, mt.concrete)
  front.position.set(0, BUILDING_H / 2, -hd)
  group.add(front)

  // Back wall (+Z)
  const back = new THREE.Mesh(frontGeo, mt.concrete)
  back.position.set(0, BUILDING_H / 2, hd)
  group.add(back)

  // Left wall (–X)
  const sideGeo = new THREE.BoxGeometry(wallT, BUILDING_H, BUILDING_D)
  const left = new THREE.Mesh(sideGeo, mt.concrete)
  left.position.set(-hw, BUILDING_H / 2, 0)
  group.add(left)

  // Right wall (+X)
  const right = new THREE.Mesh(sideGeo, mt.concrete)
  right.position.set(hw, BUILDING_H / 2, 0)
  group.add(right)

  // Roof
  const roofGeo = new THREE.BoxGeometry(BUILDING_W, 1.5, BUILDING_D)
  const roof = new THREE.Mesh(roofGeo, mt.concrete)
  roof.position.set(0, BUILDING_H, 0)
  group.add(roof)

  // Floor
  const floorGeo = new THREE.BoxGeometry(BUILDING_W, 0.5, BUILDING_D)
  const floor = new THREE.Mesh(floorGeo, mt.concrete)
  floor.position.set(0, 0.25, 0)
  group.add(floor)

  // Window-like markings (dark bands on walls)
  for (let y = 15; y < BUILDING_H; y += 10) {
    const bandGeo = new THREE.BoxGeometry(BUILDING_W + 0.2, 1.0, 0.3)
    const band = new THREE.Mesh(bandGeo, mt.steel)
    band.position.set(0, y, -hd - 0.2)
    group.add(band)
    const band2 = new THREE.Mesh(bandGeo, mt.steel)
    band2.position.set(0, y, hd + 0.2)
    group.add(band2)
  }

  return group
}

// ─── Reactor Building (destroyed) ───────────────────────────────────────────

function buildReactorBuildingDestroyed(mt) {
  const group = new THREE.Group()
  const hw = BUILDING_W / 2
  const hd = BUILDING_D / 2
  const wallT = 2.0

  // Front wall — partially standing (lower 60%)
  const frontH = BUILDING_H * 0.6
  const frontGeo = new THREE.BoxGeometry(BUILDING_W, frontH, wallT)
  const front = new THREE.Mesh(frontGeo, mt.concrete)
  front.position.set(0, frontH / 2, -hd)
  group.add(front)

  // Back wall — mostly intact but jagged top (model as shorter)
  const backH = BUILDING_H * 0.8
  const backGeo = new THREE.BoxGeometry(BUILDING_W, backH, wallT)
  const back = new THREE.Mesh(backGeo, mt.concrete)
  back.position.set(0, backH / 2, hd)
  group.add(back)

  // Left wall — standing
  const leftGeo = new THREE.BoxGeometry(wallT, BUILDING_H * 0.85, BUILDING_D)
  const leftWall = new THREE.Mesh(leftGeo, mt.concrete)
  leftWall.position.set(-hw, BUILDING_H * 0.85 / 2, 0)
  group.add(leftWall)

  // Right wall — blown out (only lower portion)
  const rightH = BUILDING_H * 0.35
  const rightGeo = new THREE.BoxGeometry(wallT, rightH, BUILDING_D * 0.7)
  const rightWall = new THREE.Mesh(rightGeo, mt.concrete)
  rightWall.position.set(hw, rightH / 2, -5)
  group.add(rightWall)

  // No roof — blown off

  // Floor
  const floorGeo = new THREE.BoxGeometry(BUILDING_W, 0.5, BUILDING_D)
  const floor = new THREE.Mesh(floorGeo, mt.concrete)
  floor.position.set(0, 0.25, 0)
  group.add(floor)

  // Jagged wall fragments along right side top
  const rand = seededRandom(42)
  for (let i = 0; i < 8; i++) {
    const fragW = 2 + rand() * 4
    const fragH = 3 + rand() * 8
    const fragGeo = new THREE.BoxGeometry(wallT, fragH, fragW)
    const frag = new THREE.Mesh(fragGeo, mt.concrete)
    frag.position.set(
      hw,
      rightH + fragH / 2,
      -hd + 10 + i * 7 + rand() * 3
    )
    frag.rotation.z = (rand() - 0.5) * 0.15
    group.add(frag)
  }

  return group
}

// ─── Graphite Core (intact) ─────────────────────────────────────────────────

function buildCoreIntact(mt) {
  const group = new THREE.Group()

  // Graphite block grid — 8x8 visible cross-section
  const gridSize = 8
  const blockSize = (CORE_RADIUS * 2) / gridSize
  const blockH = CORE_HEIGHT / gridSize

  for (let gx = 0; gx < gridSize; gx++) {
    for (let gz = 0; gz < gridSize; gz++) {
      for (let gy = 0; gy < gridSize; gy++) {
        const x = -CORE_RADIUS + blockSize * (gx + 0.5)
        const z = -CORE_RADIUS + blockSize * (gz + 0.5)
        // Only place blocks within the circular footprint
        if (x * x + z * z > CORE_RADIUS * CORE_RADIUS) continue

        const geo = new THREE.BoxGeometry(blockSize * 0.92, blockH * 0.92, blockSize * 0.92)
        const mesh = new THREE.Mesh(geo, mt.graphite)
        mesh.position.set(x, CORE_HEIGHT / 2 + blockH * (gy - gridSize / 2 + 0.5), z)
        group.add(mesh)
      }
    }
  }

  // Core container — outer cylinder wall (structural)
  const containerGeo = new THREE.CylinderGeometry(CORE_RADIUS + 0.5, CORE_RADIUS + 0.5, CORE_HEIGHT, 32, 1, true)
  const containerMat = mt.steel.clone()
  containerMat.transparent = true
  containerMat.opacity = 0.3
  containerMat.depthWrite = false
  const container = new THREE.Mesh(containerGeo, containerMat)
  container.position.y = CORE_HEIGHT / 2
  group.add(container)

  group.position.set(0, 10, 0) // Core sits on a platform within the building
  return group
}

// ─── Graphite Core (destroyed) ──────────────────────────────────────────────

function buildCoreDestroyed(mt) {
  const group = new THREE.Group()
  const rand = seededRandom(137)

  // Scattered graphite blocks — some still in rough position, many displaced
  const gridSize = 8
  const blockSize = (CORE_RADIUS * 2) / gridSize
  const blockH = CORE_HEIGHT / gridSize

  for (let gx = 0; gx < gridSize; gx++) {
    for (let gz = 0; gz < gridSize; gz++) {
      for (let gy = 0; gy < gridSize; gy++) {
        const x = -CORE_RADIUS + blockSize * (gx + 0.5)
        const z = -CORE_RADIUS + blockSize * (gz + 0.5)
        if (x * x + z * z > CORE_RADIUS * CORE_RADIUS) continue

        // Some blocks ejected, some burning, some in place
        const ejected = rand() > 0.45
        const burning = rand() > 0.55

        const geo = new THREE.BoxGeometry(blockSize * 0.88, blockH * 0.88, blockSize * 0.88)
        const mat = burning ? mt.burningGraphite : mt.graphite
        const mesh = new THREE.Mesh(geo, mat)

        if (ejected) {
          // Scattered outward and upward
          const angle = rand() * Math.PI * 2
          const dist = CORE_RADIUS + rand() * 20
          mesh.position.set(
            Math.cos(angle) * dist,
            rand() * 8 - 2,
            Math.sin(angle) * dist
          )
          mesh.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI)
        } else {
          mesh.position.set(
            x + (rand() - 0.5) * 2,
            CORE_HEIGHT / 2 + blockH * (gy - gridSize / 2 + 0.5) + (rand() - 0.5) * 1.5,
            z + (rand() - 0.5) * 2
          )
          mesh.rotation.set((rand() - 0.5) * 0.3, (rand() - 0.5) * 0.3, (rand() - 0.5) * 0.3)
        }

        group.add(mesh)
      }
    }
  }

  // Glowing core center — emissive sphere
  const glowGeo = new THREE.SphereGeometry(4, 16, 12)
  const glowMesh = new THREE.Mesh(glowGeo, mt.reactorGlow)
  glowMesh.position.y = CORE_HEIGHT / 2 + 2
  glowMesh.userData.isGlow = true
  group.add(glowMesh)

  // Second inner glow
  const innerGlowGeo = new THREE.SphereGeometry(2.5, 12, 8)
  const innerGlowMat = mt.reactorGlow.clone()
  innerGlowMat.emissiveIntensity = 1.5
  innerGlowMat.opacity = 0.9
  const innerGlow = new THREE.Mesh(innerGlowGeo, innerGlowMat)
  innerGlow.position.y = CORE_HEIGHT / 2 + 2
  innerGlow.userData.isGlow = true
  group.add(innerGlow)

  group.position.set(0, 10, 0)
  return group
}

// ─── Fuel Channels ──────────────────────────────────────────────────────────

function buildFuelChannelsIntact(mt, count) {
  const group = new THREE.Group()
  const rand = seededRandom(73)

  for (let i = 0; i < count; i++) {
    const angle = rand() * Math.PI * 2
    const r = rand() * (CORE_RADIUS - 0.5)
    const x = Math.cos(angle) * r
    const z = Math.sin(angle) * r

    const geo = new THREE.CylinderGeometry(0.08, 0.08, CORE_HEIGHT + 4, 6)
    const mesh = new THREE.Mesh(geo, mt.steel)
    mesh.position.set(x, CORE_HEIGHT / 2 + 10, z)
    group.add(mesh)
  }

  return group
}

function buildFuelChannelsDestroyed(mt, count) {
  const group = new THREE.Group()
  const rand = seededRandom(73)

  for (let i = 0; i < count; i++) {
    const angle = rand() * Math.PI * 2
    const r = rand() * (CORE_RADIUS - 0.5)
    const x = Math.cos(angle) * r
    const z = Math.sin(angle) * r

    const geo = new THREE.CylinderGeometry(0.08, 0.08, CORE_HEIGHT + 4, 6)
    const mesh = new THREE.Mesh(geo, mt.steel)

    // Bent and broken tubes
    mesh.position.set(
      x + (rand() - 0.5) * 6,
      CORE_HEIGHT / 2 + 10 + (rand() - 0.5) * 5,
      z + (rand() - 0.5) * 6
    )
    mesh.rotation.set(
      (rand() - 0.5) * 1.2,
      rand() * Math.PI,
      (rand() - 0.5) * 1.2
    )

    group.add(mesh)
  }

  return group
}

// ─── Control Rods ───────────────────────────────────────────────────────────

function buildControlRodsIntact(mt, count) {
  const group = new THREE.Group()
  const rand = seededRandom(211)

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2
    const r = CORE_RADIUS * 0.6
    const x = Math.cos(angle) * r
    const z = Math.sin(angle) * r

    const geo = new THREE.CylinderGeometry(0.15, 0.15, CORE_HEIGHT + 6, 8)
    const mesh = new THREE.Mesh(geo, mt.warningYellow)
    mesh.position.set(x, CORE_HEIGHT / 2 + 12, z)
    group.add(mesh)
  }

  return group
}

function buildControlRodsDestroyed(mt, count) {
  const group = new THREE.Group()
  const rand = seededRandom(211)

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2
    const r = CORE_RADIUS * 0.6
    const x = Math.cos(angle) * r
    const z = Math.sin(angle) * r

    const geo = new THREE.CylinderGeometry(0.15, 0.15, CORE_HEIGHT + 6, 8)
    const mesh = new THREE.Mesh(geo, mt.warningYellow)

    const ejected = rand() > 0.4
    if (ejected) {
      // Scattered outward
      const ejectAngle = rand() * Math.PI * 2
      const ejectDist = CORE_RADIUS + rand() * 25
      mesh.position.set(
        Math.cos(ejectAngle) * ejectDist,
        rand() * 15,
        Math.sin(ejectAngle) * ejectDist
      )
      mesh.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI)
    } else {
      mesh.position.set(x + (rand() - 0.5) * 3, CORE_HEIGHT / 2 + 12 + rand() * 3, z + (rand() - 0.5) * 3)
      mesh.rotation.set((rand() - 0.5) * 0.6, 0, (rand() - 0.5) * 0.6)
    }

    group.add(mesh)
  }

  return group
}

// ─── Biological Shield ("Elena") ────────────────────────────────────────────

function buildElenaIntact(mt) {
  const group = new THREE.Group()

  // 2000-ton circular disc sitting level on top of core
  const geo = new THREE.CylinderGeometry(ELENA_RADIUS, ELENA_RADIUS, ELENA_THICKNESS, 32)
  const mesh = new THREE.Mesh(geo, mt.concrete)
  mesh.position.set(0, 10 + CORE_HEIGHT + ELENA_THICKNESS / 2, 0)
  group.add(mesh)

  // Perimeter ring for detail
  const ringGeo = new THREE.TorusGeometry(ELENA_RADIUS, 0.3, 8, 32)
  const ring = new THREE.Mesh(ringGeo, mt.steel)
  ring.rotation.x = Math.PI / 2
  ring.position.set(0, 10 + CORE_HEIGHT + ELENA_THICKNESS / 2, 0)
  group.add(ring)

  return group
}

function buildElenaDestroyed(mt) {
  const group = new THREE.Group()

  // Tilted/displaced — blown upward by explosion, fell back at angle
  const geo = new THREE.CylinderGeometry(ELENA_RADIUS, ELENA_RADIUS, ELENA_THICKNESS, 32)
  const mesh = new THREE.Mesh(geo, mt.concrete)
  mesh.position.set(4, 10 + CORE_HEIGHT + ELENA_THICKNESS / 2 + 3, 3)
  mesh.rotation.set(0.45, 0.2, 0.3) // Tilted ~25 degrees
  group.add(mesh)

  return group
}

// ─── Steam Separator Drums ──────────────────────────────────────────────────

function buildSteamDrumsIntact(mt) {
  const group = new THREE.Group()
  const drumRadius = 1.5
  const drumLength = 20

  const positions = [
    [-12, 30, -8],
    [-12, 30, 8],
    [12, 30, -8],
    [12, 30, 8],
  ]

  for (const [x, y, z] of positions) {
    const geo = new THREE.CylinderGeometry(drumRadius, drumRadius, drumLength, 16)
    geo.rotateZ(Math.PI / 2) // Horizontal orientation
    const mesh = new THREE.Mesh(geo, mt.steel)
    mesh.position.set(x, y, z)
    group.add(mesh)

    // End caps
    const capGeo = new THREE.SphereGeometry(drumRadius, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2)
    const capL = new THREE.Mesh(capGeo, mt.steel)
    capL.position.set(x - drumLength / 2, y, z)
    capL.rotation.z = Math.PI / 2
    group.add(capL)
    const capR = new THREE.Mesh(capGeo, mt.steel)
    capR.position.set(x + drumLength / 2, y, z)
    capR.rotation.z = -Math.PI / 2
    group.add(capR)
  }

  return group
}

function buildSteamDrumsDestroyed(mt) {
  const group = new THREE.Group()
  const drumRadius = 1.5
  const drumLength = 20
  const rand = seededRandom(99)

  const positions = [
    [-12, 30, -8],
    [-12, 30, 8],
    [12, 30, -8],
    [12, 30, 8],
  ]

  for (const [x, y, z] of positions) {
    const geo = new THREE.CylinderGeometry(drumRadius, drumRadius * (0.7 + rand() * 0.3), drumLength * (0.5 + rand() * 0.5), 16)
    geo.rotateZ(Math.PI / 2)
    const mesh = new THREE.Mesh(geo, mt.steel)
    // Ruptured, dangling — displaced and tilted
    mesh.position.set(
      x + (rand() - 0.5) * 8,
      y - rand() * 10,
      z + (rand() - 0.5) * 5
    )
    mesh.rotation.set((rand() - 0.5) * 0.8, rand() * 0.5, (rand() - 0.5) * 0.5)
    group.add(mesh)
  }

  return group
}

// ─── Turbine Hall ───────────────────────────────────────────────────────────

function buildTurbineHall(mt) {
  const group = new THREE.Group()

  // Simple box to the side (+X direction), lower height
  const geo = new THREE.BoxGeometry(TURBINE_D, TURBINE_H, TURBINE_W)
  const mesh = new THREE.Mesh(geo, mt.concrete)
  mesh.position.set(BUILDING_W / 2 + TURBINE_D / 2, TURBINE_H / 2, 0)
  group.add(mesh)

  // Roof detail
  const roofGeo = new THREE.BoxGeometry(TURBINE_D + 2, 0.8, TURBINE_W + 2)
  const roof = new THREE.Mesh(roofGeo, mt.steel)
  roof.position.set(BUILDING_W / 2 + TURBINE_D / 2, TURBINE_H, 0)
  group.add(roof)

  return group
}

// ─── Cooling Pond Pipes ─────────────────────────────────────────────────────

function buildCoolingPipes(mt) {
  const group = new THREE.Group()

  // Large pipes running from building toward cooling pond
  for (let i = 0; i < 4; i++) {
    const geo = new THREE.CylinderGeometry(0.8, 0.8, 60, 8)
    geo.rotateZ(Math.PI / 2)
    const mesh = new THREE.Mesh(geo, mt.pipe)
    mesh.position.set(BUILDING_W / 2 + TURBINE_D + 30, 3 + i * 2.5, -15 + i * 10)
    group.add(mesh)
  }

  return group
}

// ─── Ventilation Stack ──────────────────────────────────────────────────────

function buildVentStack(mt) {
  const group = new THREE.Group()

  // Main chimney — thin cylinder, 150m tall, between Unit 3 and 4
  const bandHeight = 15
  const numBands = Math.floor(STACK_HEIGHT / bandHeight)

  for (let i = 0; i < numBands; i++) {
    const r = STACK_RADIUS - (i / numBands) * 0.8 // Slight taper
    const geo = new THREE.CylinderGeometry(r, r + 0.05, bandHeight, 12)
    const mat = (i % 2 === 0) ? mt.stackWhite : mt.stackRed
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(-BUILDING_W / 2 - 15, bandHeight * i + bandHeight / 2, 0)
    group.add(mesh)
  }

  // Platform ring near top
  const platGeo = new THREE.TorusGeometry(STACK_RADIUS + 1, 0.3, 8, 16)
  const plat = new THREE.Mesh(platGeo, mt.steel)
  plat.rotation.x = Math.PI / 2
  plat.position.set(-BUILDING_W / 2 - 15, STACK_HEIGHT * 0.85, 0)
  group.add(plat)

  return group
}

// ─── Debris & Rubble (destroyed) ────────────────────────────────────────────

function buildDebris(mt) {
  const group = new THREE.Group()
  const rand = seededRandom(256)

  // Rubble on ground — scattered small boxes/irregular shapes
  for (let i = 0; i < 120; i++) {
    const size = 0.5 + rand() * 3
    const geo = new THREE.BoxGeometry(size, size * (0.3 + rand() * 0.7), size * (0.5 + rand() * 0.5))
    const mat = rand() > 0.7 ? mt.graphite : mt.debris
    const mesh = new THREE.Mesh(geo, mat)

    // Scatter around reactor building, mostly on the right (blown out) side
    const angle = (rand() - 0.3) * Math.PI * 1.5
    const dist = BUILDING_W / 2 + rand() * 40
    mesh.position.set(
      Math.cos(angle) * dist + (rand() - 0.5) * 20,
      size * 0.15,
      Math.sin(angle) * dist + (rand() - 0.5) * 30
    )
    mesh.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI)
    group.add(mesh)
  }

  // Larger concrete chunks from the building
  for (let i = 0; i < 20; i++) {
    const w = 3 + rand() * 6
    const h = 1 + rand() * 3
    const d = 2 + rand() * 5
    const geo = new THREE.BoxGeometry(w, h, d)
    const mesh = new THREE.Mesh(geo, mt.concrete)
    mesh.position.set(
      20 + rand() * 30,
      h / 2,
      (rand() - 0.5) * 50
    )
    mesh.rotation.set((rand() - 0.5) * 0.3, rand() * Math.PI, (rand() - 0.5) * 0.2)
    group.add(mesh)
  }

  return group
}

// ─── Smoke suggestion (destroyed) ───────────────────────────────────────────

function buildSmoke(mt) {
  const group = new THREE.Group()
  const rand = seededRandom(333)

  // Semi-transparent spheres rising from exposed core
  for (let i = 0; i < 30; i++) {
    const size = 2 + rand() * 5
    const geo = new THREE.SphereGeometry(size, 8, 6)
    const mesh = new THREE.Mesh(geo, mt.smoke)
    mesh.position.set(
      (rand() - 0.5) * 15,
      20 + rand() * 60,
      (rand() - 0.5) * 15
    )
    mesh.userData.smokeY = mesh.position.y
    mesh.userData.smokeSpeed = 0.5 + rand() * 1.5
    group.add(mesh)
  }

  return group
}

// ─── Feature info data ──────────────────────────────────────────────────────

const FEATURES = {
  reactorBuilding: {
    name: 'Reactor Building (Unit 4)',
    type: 'Structure',
    dimensions: '70m × 70m × 45m tall',
    material: 'Reinforced concrete',
    description: 'The reactor building housed the RBMK-1000 reactor core, biological shield, steam separators, and refueling machinery. During the April 26 explosion, the 1000-ton roof was blown off the reactor hall. The right wall facing the turbine hall was destroyed, exposing the burning reactor core to the open air.',
  },
  reactorCore: {
    name: 'RBMK-1000 Reactor Core',
    type: 'Reactor Core',
    dimensions: '~12m diameter × 7m tall graphite stack',
    material: 'Graphite moderator blocks (1,700 tonnes)',
    description: 'The core consisted of 1,661 fuel channels running vertically through a massive graphite moderator stack. During the explosion, the graphite caught fire at ~700°C, burning for 10 days and sending radioactive isotopes into the atmosphere. The graphite fire was the primary vector for widespread contamination across Europe.',
  },
  fuelChannels: {
    name: 'Fuel Channels',
    type: 'Reactor Component',
    dimensions: '1,661 vertical pressure tubes, 88mm bore',
    material: 'Zirconium alloy (Zr+2.5% Nb)',
    description: 'Each fuel channel contained two fuel assemblies with enriched uranium dioxide fuel rods. During the power excursion, the fuel channels ruptured as steam pressure exceeded 70 atmospheres. The zirconium cladding reacted with steam in an exothermic reaction, producing hydrogen gas that contributed to the explosion.',
  },
  controlRods: {
    name: 'Control Rods',
    type: 'Reactor Safety System',
    dimensions: '211 rods total, boron carbide absorber',
    material: 'Boron carbide absorber with graphite displacer tips',
    description: 'The RBMK control rods had a fatal design flaw: graphite displacer tips at the bottom. When the AZ-5 emergency shutdown button was pressed at 01:23:40, the rods began inserting from above — but the graphite tips initially displaced water in the lower core, briefly increasing reactivity instead of reducing it. This "positive scram" effect contributed directly to the power excursion.',
  },
  biologicalShield: {
    name: 'Biological Shield ("Elena")',
    type: 'Reactor Safety Component',
    dimensions: '~14m diameter disc, ~3m thick, ~2,000 tonnes',
    material: 'Steel and concrete composite',
    description: 'The upper biological shield, nicknamed "Elena" by plant workers, was a 2,000-tonne steel and concrete disc sitting atop the reactor core. The steam explosion launched it vertically through the roof, and it fell back at an angle, partially covering the destroyed core. Its displaced position became an iconic image of the disaster.',
  },
  steamDrums: {
    name: 'Steam Separator Drums',
    type: 'Reactor Component',
    dimensions: '4 drums, ~3m diameter × 20m long each',
    material: 'Stainless steel pressure vessels',
    description: 'Four large horizontal drums above the reactor separated steam from the water-steam mixture coming from the fuel channels. The separated steam was piped to the turbines. During the explosion, the steam lines ruptured. The massive pressure buildup in these separators contributed to the destruction of the upper reactor building.',
  },
  turbineHall: {
    name: 'Turbine Hall',
    type: 'Structure',
    dimensions: '~150m × 30m × 25m tall',
    material: 'Steel frame with concrete',
    description: 'The turbine hall housed two 500 MW turbogenerators. It was shared between Units 3 and 4. While not destroyed by the explosion, the turbine hall roof caught fire from burning debris ejected from the reactor. Firefighters on this roof received lethal radiation doses — many died within weeks.',
  },
  coolingPipes: {
    name: 'Main Circulation Pipes',
    type: 'Reactor Cooling System',
    dimensions: '~800mm diameter primary circuit pipes',
    material: 'Stainless steel',
    description: 'The main circulation pumps pushed water through the fuel channels at ~28,000 tonnes per hour. Prior to the accident, operators had reduced coolant flow as part of the ill-fated safety test. The resulting steam buildup in the fuel channels, combined with the RBMK\'s positive void coefficient, created a runaway feedback loop.',
  },
  ventStack: {
    name: 'Ventilation Stack (VSA-2)',
    type: 'Structure',
    dimensions: '~150m tall, shared between Units 3 and 4',
    material: 'Steel lattice with red/white aviation bands',
    description: 'The tall ventilation stack between Units 3 and 4 served as an exhaust for reactor building ventilation. After the disaster, it became heavily contaminated. The stack was finally dismantled in 2013 before the New Safe Confinement was slid into place, as it was too tall to fit inside the new structure.',
  },
}

// ─── Main export ────────────────────────────────────────────────────────────

export function createChernobylModel() {
  const mt = makeMaterials()
  const intact = new THREE.Group()
  const destroyed = new THREE.Group()
  const clickTargets = []

  // ── Build intact version ──
  const intactBuilding = buildReactorBuildingIntact(mt)
  intactBuilding.userData.feature = FEATURES.reactorBuilding
  intact.add(intactBuilding)
  clickTargets.push(intactBuilding)

  const intactCore = buildCoreIntact(mt)
  intactCore.userData.feature = FEATURES.reactorCore
  intact.add(intactCore)
  clickTargets.push(intactCore)

  const intactFuel = buildFuelChannelsIntact(mt, 70)
  intactFuel.userData.feature = FEATURES.fuelChannels
  intact.add(intactFuel)
  clickTargets.push(intactFuel)

  const intactRods = buildControlRodsIntact(mt, 12)
  intactRods.userData.feature = FEATURES.controlRods
  intact.add(intactRods)
  clickTargets.push(intactRods)

  const intactElena = buildElenaIntact(mt)
  intactElena.userData.feature = FEATURES.biologicalShield
  intact.add(intactElena)
  clickTargets.push(intactElena)

  const intactDrums = buildSteamDrumsIntact(mt)
  intactDrums.userData.feature = FEATURES.steamDrums
  intact.add(intactDrums)
  clickTargets.push(intactDrums)

  // ── Shared structures (present in both versions) ──
  const turbineIntact = buildTurbineHall(mt)
  turbineIntact.userData.feature = FEATURES.turbineHall
  intact.add(turbineIntact)
  clickTargets.push(turbineIntact)

  const pipesIntact = buildCoolingPipes(mt)
  pipesIntact.userData.feature = FEATURES.coolingPipes
  intact.add(pipesIntact)
  clickTargets.push(pipesIntact)

  const stackIntact = buildVentStack(mt)
  stackIntact.userData.feature = FEATURES.ventStack
  intact.add(stackIntact)
  clickTargets.push(stackIntact)

  // ── Build destroyed version ──
  const destroyedBuilding = buildReactorBuildingDestroyed(mt)
  destroyedBuilding.userData.feature = FEATURES.reactorBuilding
  destroyed.add(destroyedBuilding)

  const destroyedCore = buildCoreDestroyed(mt)
  destroyedCore.userData.feature = FEATURES.reactorCore
  destroyed.add(destroyedCore)

  const destroyedFuel = buildFuelChannelsDestroyed(mt, 70)
  destroyedFuel.userData.feature = FEATURES.fuelChannels
  destroyed.add(destroyedFuel)

  const destroyedRods = buildControlRodsDestroyed(mt, 12)
  destroyedRods.userData.feature = FEATURES.controlRods
  destroyed.add(destroyedRods)

  const destroyedElena = buildElenaDestroyed(mt)
  destroyedElena.userData.feature = FEATURES.biologicalShield
  destroyed.add(destroyedElena)

  const destroyedDrums = buildSteamDrumsDestroyed(mt)
  destroyedDrums.userData.feature = FEATURES.steamDrums
  destroyed.add(destroyedDrums)

  // Shared structures in destroyed version too
  const turbineDestroyed = buildTurbineHall(mt)
  turbineDestroyed.userData.feature = FEATURES.turbineHall
  destroyed.add(turbineDestroyed)

  const pipesDestroyed = buildCoolingPipes(mt)
  pipesDestroyed.userData.feature = FEATURES.coolingPipes
  destroyed.add(pipesDestroyed)

  const stackDestroyed = buildVentStack(mt)
  stackDestroyed.userData.feature = FEATURES.ventStack
  destroyed.add(stackDestroyed)

  // Destroyed-only elements
  destroyed.add(buildDebris(mt))
  destroyed.add(buildSmoke(mt))

  // Destroyed starts hidden
  destroyed.visible = false

  // ── Label anchor positions — spread out to avoid overlap ──
  const labelAnchors = {
    reactorBuilding:  { pos: new THREE.Vector3(0, BUILDING_H + 8, -20), name: 'Reactor Building' },
    reactorCore:      { pos: new THREE.Vector3(-15, 18, -15), name: 'Reactor Core' },
    biologicalShield: { pos: new THREE.Vector3(15, 25, -20), name: 'Biological Shield "Elena"' },
    steamDrums:       { pos: new THREE.Vector3(-20, 35, 15), name: 'Steam Separator Drums' },
    turbineHall:      { pos: new THREE.Vector3(BUILDING_W / 2 + TURBINE_D / 2, TURBINE_H + 5, -30), name: 'Turbine Hall' },
    coolingPipes:     { pos: new THREE.Vector3(BUILDING_W / 2 + TURBINE_D + 30, 12, 20), name: 'Cooling Pipes' },
    ventStack:        { pos: new THREE.Vector3(-BUILDING_W / 2 - 15, STACK_HEIGHT * 0.6, 0), name: 'Ventilation Stack' },
  }

  return { intact, destroyed, clickTargets, labelAnchors, features: FEATURES }
}
