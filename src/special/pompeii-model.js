import * as THREE from 'three'

/**
 * Pompeii City Block (Roman Insula) — procedural model.
 *
 * Coordinate system:
 *   Origin = center of the insula at ground level
 *   Y up, X east-west, Z north-south
 *   1 unit = 1 meter
 *
 * Returns TWO versions of the same block:
 *   reconstructed — 79 AD, living city with roofs, plaster, frescoes
 *   ruins — present day excavation, broken walls, no roofs
 */

// ─── Constants (meters) ──────────────────────────────────────────────────────

const BLOCK_W = 40    // east-west
const BLOCK_D = 30    // north-south
const HALF_W = BLOCK_W / 2
const HALF_D = BLOCK_D / 2

const WALL_H = 3.5    // reconstructed wall height
const WALL_T = 0.4    // wall thickness

const STREET_W = 4    // street width (along south side)

// ─── Materials ───────────────────────────────────────────────────────────────

function makeMaterials() {
  const stone = new THREE.MeshStandardMaterial({
    color: 0xd8c8a0, roughness: 0.9, metalness: 0.02, side: THREE.DoubleSide,
    emissive: 0xd8c8a0, emissiveIntensity: 0.3,
  })
  const plaster = new THREE.MeshStandardMaterial({
    color: 0xf0e8d8, roughness: 0.75, metalness: 0.01, side: THREE.DoubleSide,
    emissive: 0xf0e8d8, emissiveIntensity: 0.35,
  })
  const frescoRed = new THREE.MeshStandardMaterial({
    color: 0xcc3333, roughness: 0.7, metalness: 0.01, side: THREE.DoubleSide,
    emissive: 0xcc3333, emissiveIntensity: 0.25,
  })
  const frescoBlack = new THREE.MeshStandardMaterial({
    color: 0x1a1a1a, roughness: 0.7, metalness: 0.01, side: THREE.DoubleSide,
    emissive: 0x1a1a1a, emissiveIntensity: 0.15,
  })
  const frescoYellow = new THREE.MeshStandardMaterial({
    color: 0xd4a020, roughness: 0.7, metalness: 0.01, side: THREE.DoubleSide,
    emissive: 0xd4a020, emissiveIntensity: 0.25,
  })
  const terracotta = new THREE.MeshStandardMaterial({
    color: 0xc07050, roughness: 0.8, metalness: 0.02, side: THREE.DoubleSide,
    emissive: 0xc07050, emissiveIntensity: 0.3,
  })
  const ruinStone = new THREE.MeshStandardMaterial({
    color: 0xb0a888, roughness: 0.95, metalness: 0.02, side: THREE.DoubleSide,
    emissive: 0xb0a888, emissiveIntensity: 0.25,
  })
  const columnMarble = new THREE.MeshStandardMaterial({
    color: 0xe8e0d0, roughness: 0.5, metalness: 0.05, side: THREE.DoubleSide,
    emissive: 0xe8e0d0, emissiveIntensity: 0.35,
  })
  const water = new THREE.MeshStandardMaterial({
    color: 0x4080a0, roughness: 0.2, metalness: 0.1, side: THREE.DoubleSide,
    transparent: true, opacity: 0.6,
    emissive: 0x4080a0, emissiveIntensity: 0.15,
  })
  const mosaicWhite = new THREE.MeshStandardMaterial({
    color: 0xf0ece0, roughness: 0.6, metalness: 0.01, side: THREE.DoubleSide,
    emissive: 0xf0ece0, emissiveIntensity: 0.3,
  })
  const mosaicBlack = new THREE.MeshStandardMaterial({
    color: 0x2a2a28, roughness: 0.6, metalness: 0.01, side: THREE.DoubleSide,
    emissive: 0x2a2a28, emissiveIntensity: 0.15,
  })
  const mosaicTerracotta = new THREE.MeshStandardMaterial({
    color: 0xb05030, roughness: 0.6, metalness: 0.01, side: THREE.DoubleSide,
    emissive: 0xb05030, emissiveIntensity: 0.2,
  })
  const ground = new THREE.MeshStandardMaterial({
    color: 0xc0b090, roughness: 0.9, metalness: 0.02, side: THREE.DoubleSide,
    emissive: 0xc0b090, emissiveIntensity: 0.2,
  })
  const streetStone = new THREE.MeshStandardMaterial({
    color: 0x908070, roughness: 0.95, metalness: 0.02, side: THREE.DoubleSide,
    emissive: 0x908070, emissiveIntensity: 0.2,
  })

  return {
    stone, plaster, frescoRed, frescoBlack, frescoYellow,
    terracotta, ruinStone, columnMarble, water,
    mosaicWhite, mosaicBlack, mosaicTerracotta, ground, streetStone,
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeWall(x, z, w, d, h, mat) {
  const geo = new THREE.BoxGeometry(w, h, d)
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.set(x, h / 2, z)
  return mesh
}

function makeFloor(x, z, w, d, mat) {
  const geo = new THREE.PlaneGeometry(w, d)
  geo.rotateX(-Math.PI / 2)
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.set(x, 0.01, z)
  return mesh
}

function makeRuinWall(x, z, w, d, maxH, mat) {
  // Irregular broken wall top via vertex displacement
  const segsW = Math.max(2, Math.floor(w / 0.5))
  const segsH = Math.max(2, Math.floor(maxH / 0.5))
  const geo = new THREE.BoxGeometry(w, maxH, d, segsW, segsH, 1)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    // Only displace vertices near the top
    if (y > maxH * 0.3) {
      const px = pos.getX(i)
      const pz = pos.getZ(i)
      // Pseudo-random displacement based on position
      const hash = Math.sin(px * 12.7 + pz * 31.1 + x * 7.3 + z * 13.7) * 0.5 + 0.5
      const displacement = -hash * maxH * 0.5
      pos.setY(i, y + displacement)
    }
  }
  geo.computeVertexNormals()
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.set(x, maxH / 2, z)
  return mesh
}

function makeColumn(x, z, height, mat, broken = false) {
  const group = new THREE.Group()
  const actualH = broken ? height * (0.3 + Math.random() * 0.4) : height

  // Shaft
  const shaftGeo = new THREE.CylinderGeometry(0.18, 0.22, actualH, 12)
  const shaft = new THREE.Mesh(shaftGeo, mat)
  shaft.position.set(0, actualH / 2, 0)
  group.add(shaft)

  if (!broken) {
    // Capital (wider disc at top — Corinthian style approximation)
    const capGeo = new THREE.CylinderGeometry(0.32, 0.2, 0.25, 12)
    const cap = new THREE.Mesh(capGeo, mat)
    cap.position.set(0, actualH + 0.125, 0)
    group.add(cap)

    // Base
    const baseGeo = new THREE.CylinderGeometry(0.25, 0.28, 0.15, 12)
    const base = new THREE.Mesh(baseGeo, mat)
    base.position.set(0, 0.075, 0)
    group.add(base)
  }

  group.position.set(x, 0, z)
  return group
}

function makeFresco(x, z, w, h, rotY, mat) {
  const geo = new THREE.PlaneGeometry(w, h)
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.set(x, h / 2 + 0.5, z)
  mesh.rotation.y = rotY
  return mesh
}

// ─── Mosaic floor patterns ───────────────────────────────────────────────────

function buildMosaicFloor(cx, cz, w, d, mt) {
  const group = new THREE.Group()

  // Base white floor
  group.add(makeFloor(cx, cz, w, d, mt.mosaicWhite))

  // Border rectangle in black
  const borderW = 0.3
  // Top border
  group.add(makeFloor(cx, cz - d / 2 + borderW / 2, w, borderW, mt.mosaicBlack))
  // Bottom border
  group.add(makeFloor(cx, cz + d / 2 - borderW / 2, w, borderW, mt.mosaicBlack))
  // Left border
  group.add(makeFloor(cx - w / 2 + borderW / 2, cz, borderW, d, mt.mosaicBlack))
  // Right border
  group.add(makeFloor(cx + w / 2 - borderW / 2, cz, borderW, d, mt.mosaicBlack))

  // Central diamond pattern in terracotta
  const diamSize = Math.min(w, d) * 0.3
  const diamGeo = new THREE.PlaneGeometry(diamSize, diamSize)
  diamGeo.rotateX(-Math.PI / 2)
  diamGeo.rotateY(Math.PI / 4) // but plane is horizontal, so rotate around Y
  const diam = new THREE.Mesh(diamGeo, mt.mosaicTerracotta)
  diam.position.set(cx, 0.02, cz)
  diam.rotation.y = Math.PI / 4
  group.add(diam)

  return group
}

// ─── Build Reconstructed (79 AD) ─────────────────────────────────────────────

function buildReconstructed(mt) {
  const group = new THREE.Group()

  // ── Layout positions (relative to block center) ──
  // Block extends from -HALF_W to +HALF_W (X) and -HALF_D to +HALF_D (Z)
  // Street is along south side (+Z), so building footprint is -HALF_D to HALF_D - STREET_W

  const buildS = HALF_D - STREET_W  // southern edge of building
  const buildN = -HALF_D            // northern edge

  // ── Outer perimeter walls ──
  // North wall
  group.add(makeWall(0, buildN, BLOCK_W, WALL_T, WALL_H, mt.plaster))
  // South wall (street-facing, with shop openings later)
  group.add(makeWall(0, buildS, BLOCK_W, WALL_T, WALL_H, mt.plaster))
  // East wall
  group.add(makeWall(HALF_W, (buildN + buildS) / 2, WALL_T, buildS - buildN, WALL_H, mt.plaster))
  // West wall
  group.add(makeWall(-HALF_W, (buildN + buildS) / 2, WALL_T, buildS - buildN, WALL_H, mt.plaster))

  // ── Fauces (entrance corridor) ── centered on south wall
  const faucesX = -5
  const faucesW = 1.5
  const faucesD = 4
  const faucesZ = buildS - faucesD / 2
  // Fauces walls
  group.add(makeWall(faucesX - faucesW / 2, faucesZ, WALL_T, faucesD, WALL_H, mt.plaster))
  group.add(makeWall(faucesX + faucesW / 2, faucesZ, WALL_T, faucesD, WALL_H, mt.plaster))
  // Fauces floor
  group.add(buildMosaicFloor(faucesX, faucesZ, faucesW, faucesD, mt))

  // ── Atrium ── ~10m x 8m, connected to fauces
  const atriumX = faucesX
  const atriumW = 10
  const atriumD = 8
  const atriumZ = buildS - faucesD - atriumD / 2
  // Atrium walls (east, west, partial north — openings to tablinum)
  group.add(makeWall(atriumX - atriumW / 2, atriumZ, WALL_T, atriumD, WALL_H, mt.plaster))
  group.add(makeWall(atriumX + atriumW / 2, atriumZ, WALL_T, atriumD, WALL_H, mt.plaster))
  // North wall of atrium (with opening to tablinum)
  group.add(makeWall(atriumX - atriumW / 2 + 1.5, atriumZ - atriumD / 2, 3, WALL_T, WALL_H, mt.plaster))
  group.add(makeWall(atriumX + atriumW / 2 - 1.5, atriumZ - atriumD / 2, 3, WALL_T, WALL_H, mt.plaster))

  // Frescoes on atrium walls
  group.add(makeFresco(atriumX - atriumW / 2 + 0.02, atriumZ, 0.01, 2.0, 0, mt.frescoRed))
  group.add(makeFresco(atriumX - atriumW / 2 + 0.02, atriumZ - 2, 0.01, 2.0, 0, mt.frescoBlack))
  group.add(makeFresco(atriumX + atriumW / 2 - 0.02, atriumZ, 0.01, 2.0, Math.PI, mt.frescoYellow))
  group.add(makeFresco(atriumX + atriumW / 2 - 0.02, atriumZ + 2, 0.01, 2.0, Math.PI, mt.frescoRed))

  // Atrium floor
  group.add(buildMosaicFloor(atriumX, atriumZ, atriumW, atriumD, mt))

  // Impluvium (shallow pool in atrium center)
  const impW = 3, impD = 2, impDepth = 0.3
  // Sunken basin walls
  const impGeo = new THREE.BoxGeometry(impW, impDepth, impD)
  const impMesh = new THREE.Mesh(impGeo, mt.stone)
  impMesh.position.set(atriumX, -impDepth / 2 + 0.01, atriumZ)
  group.add(impMesh)
  // Water surface
  const waterGeo = new THREE.PlaneGeometry(impW - 0.1, impD - 0.1)
  waterGeo.rotateX(-Math.PI / 2)
  const waterMesh = new THREE.Mesh(waterGeo, mt.water)
  waterMesh.position.set(atriumX, -0.05, atriumZ)
  group.add(waterMesh)
  // Rim around impluvium
  const rimT = 0.12, rimH = 0.15
  group.add(makeWall(atriumX, atriumZ - impD / 2 - rimT / 2, impW + rimT * 2, rimT, rimH, mt.stone))
  group.add(makeWall(atriumX, atriumZ + impD / 2 + rimT / 2, impW + rimT * 2, rimT, rimH, mt.stone))
  group.add(makeWall(atriumX - impW / 2 - rimT / 2, atriumZ, rimT, impD, rimH, mt.stone))
  group.add(makeWall(atriumX + impW / 2 + rimT / 2, atriumZ, rimT, impD, rimH, mt.stone))

  // ── Tablinum ── ~4m x 5m, at back of atrium
  const tabX = atriumX
  const tabW = 4
  const tabD = 5
  const tabZ = atriumZ - atriumD / 2 - tabD / 2
  group.add(makeWall(tabX - tabW / 2, tabZ, WALL_T, tabD, WALL_H, mt.plaster))
  group.add(makeWall(tabX + tabW / 2, tabZ, WALL_T, tabD, WALL_H, mt.plaster))
  group.add(makeWall(tabX, tabZ - tabD / 2, tabW, WALL_T, WALL_H, mt.plaster))
  // Frescoes
  group.add(makeFresco(tabX - tabW / 2 + 0.02, tabZ, 0.01, 2.2, 0, mt.frescoRed))
  group.add(makeFresco(tabX + tabW / 2 - 0.02, tabZ, 0.01, 2.2, Math.PI, mt.frescoRed))
  group.add(buildMosaicFloor(tabX, tabZ, tabW, tabD, mt))

  // ── Peristyle Garden ── ~12m x 10m courtyard with colonnade
  const periX = atriumX + 3 // offset slightly east
  const periW = 12
  const periD = 10
  const periZ = tabZ - tabD / 2 - periD / 2
  // Peristyle walls
  group.add(makeWall(periX - periW / 2, periZ, WALL_T, periD, WALL_H, mt.plaster))
  group.add(makeWall(periX + periW / 2, periZ, WALL_T, periD, WALL_H, mt.plaster))
  group.add(makeWall(periX, periZ - periD / 2, periW, WALL_T, WALL_H, mt.plaster))
  group.add(makeWall(periX, periZ + periD / 2, periW, WALL_T, WALL_H, mt.plaster))

  // Garden floor (earth/green)
  const gardenMat = new THREE.MeshStandardMaterial({
    color: 0x607040, roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide,
    emissive: 0x607040, emissiveIntensity: 0.2,
  })
  group.add(makeFloor(periX, periZ, periW - 2, periD - 2, gardenMat))

  // Colonnade — columns around inner perimeter
  const colInset = 1.2
  const colH = 3.0
  // North and south rows
  for (let i = 0; i < 5; i++) {
    const cx = periX - periW / 2 + colInset + i * ((periW - colInset * 2) / 4)
    group.add(makeColumn(cx, periZ - periD / 2 + colInset, colH, mt.columnMarble))
    group.add(makeColumn(cx, periZ + periD / 2 - colInset, colH, mt.columnMarble))
  }
  // East and west rows (excluding corners already placed)
  for (let i = 1; i < 4; i++) {
    const cz = periZ - periD / 2 + colInset + i * ((periD - colInset * 2) / 4)
    group.add(makeColumn(periX - periW / 2 + colInset, cz, colH, mt.columnMarble))
    group.add(makeColumn(periX + periW / 2 - colInset, cz, colH, mt.columnMarble))
  }

  // ── Triclinium (dining room) ── ~5m x 4m, off peristyle east side
  const tricX = periX + periW / 2 + 2.5
  const tricW = 5
  const tricD = 4
  const tricZ = periZ
  group.add(makeWall(tricX - tricW / 2, tricZ, WALL_T, tricD, WALL_H, mt.plaster))
  group.add(makeWall(tricX + tricW / 2, tricZ, WALL_T, tricD, WALL_H, mt.plaster))
  group.add(makeWall(tricX, tricZ - tricD / 2, tricW, WALL_T, WALL_H, mt.plaster))
  group.add(makeWall(tricX, tricZ + tricD / 2, tricW, WALL_T, WALL_H, mt.plaster))
  group.add(makeFresco(tricX - tricW / 2 + 0.02, tricZ, 0.01, 2.0, 0, mt.frescoRed))
  group.add(makeFresco(tricX + tricW / 2 - 0.02, tricZ, 0.01, 2.0, Math.PI, mt.frescoYellow))
  group.add(buildMosaicFloor(tricX, tricZ, tricW, tricD, mt))

  // ── Cubicula (bedrooms) ── 3 small rooms along east side of atrium
  for (let i = 0; i < 3; i++) {
    const cubX = atriumX + atriumW / 2 + 1.8
    const cubW = 3
    const cubD = 3
    const cubZ = atriumZ - atriumD / 2 + 1.5 + i * (cubD + 0.5)
    group.add(makeWall(cubX - cubW / 2, cubZ, WALL_T, cubD, WALL_H, mt.plaster))
    group.add(makeWall(cubX + cubW / 2, cubZ, WALL_T, cubD, WALL_H, mt.plaster))
    group.add(makeWall(cubX, cubZ - cubD / 2, cubW, WALL_T, WALL_H, mt.plaster))
    group.add(makeWall(cubX, cubZ + cubD / 2, cubW, WALL_T, WALL_H, mt.plaster))
    group.add(makeFloor(cubX, cubZ, cubW, cubD, mt.mosaicWhite))
  }

  // ── Tabernae (shops) ── 4 shops along south (street-facing) wall
  const tabernaeY = buildS
  for (let i = 0; i < 4; i++) {
    const shopX = -HALF_W + 3 + i * 8
    // Skip if overlapping with fauces
    if (Math.abs(shopX - faucesX) < 4) continue
    const shopW = 3
    const shopD = 4
    const shopZ = tabernaeY - shopD / 2
    // Side walls
    group.add(makeWall(shopX - shopW / 2, shopZ, WALL_T, shopD, WALL_H, mt.plaster))
    group.add(makeWall(shopX + shopW / 2, shopZ, WALL_T, shopD, WALL_H, mt.plaster))
    // Back wall
    group.add(makeWall(shopX, shopZ - shopD / 2, shopW, WALL_T, WALL_H, mt.plaster))
    // Wide opening on street side (no wall — just a counter ledge)
    const counterGeo = new THREE.BoxGeometry(shopW - 0.2, 0.8, 0.3)
    const counter = new THREE.Mesh(counterGeo, mt.stone)
    counter.position.set(shopX, 0.4, tabernaeY - 0.15)
    group.add(counter)
    group.add(makeFloor(shopX, shopZ, shopW, shopD, mt.stone))
  }

  // ── Roofing ── terracotta tile roofing (angled planes)
  // Main domus roof
  const roofOverhang = 0.5
  const roofH = 1.5

  // Atrium compluvium (open roof with angled sides)
  const aRoofParts = [
    // South slope
    { x: atriumX, z: atriumZ + atriumD / 2 - 1.5, w: atriumW + roofOverhang * 2, d: 3, rx: -0.3 },
    // North slope
    { x: atriumX, z: atriumZ - atriumD / 2 + 1.5, w: atriumW + roofOverhang * 2, d: 3, rx: 0.3 },
  ]
  for (const rp of aRoofParts) {
    const rGeo = new THREE.PlaneGeometry(rp.w, rp.d)
    const rMesh = new THREE.Mesh(rGeo, mt.terracotta)
    rMesh.position.set(rp.x, WALL_H + roofH * 0.5, rp.z)
    rMesh.rotation.x = -Math.PI / 2 + rp.rx
    group.add(rMesh)
  }

  // Tablinum roof
  const tabRoofGeo = new THREE.PlaneGeometry(tabW + roofOverhang * 2, tabD + roofOverhang * 2)
  tabRoofGeo.rotateX(-Math.PI / 2)
  const tabRoof = new THREE.Mesh(tabRoofGeo, mt.terracotta)
  tabRoof.position.set(tabX, WALL_H + 0.1, tabZ)
  group.add(tabRoof)

  // Triclinium roof
  const tricRoofGeo = new THREE.PlaneGeometry(tricW + roofOverhang * 2, tricD + roofOverhang * 2)
  tricRoofGeo.rotateX(-Math.PI / 2)
  const tricRoof = new THREE.Mesh(tricRoofGeo, mt.terracotta)
  tricRoof.position.set(tricX, WALL_H + 0.1, tricZ)
  group.add(tricRoof)

  // Cubicula roofs
  for (let i = 0; i < 3; i++) {
    const cubX = atriumX + atriumW / 2 + 1.8
    const cubZ = atriumZ - atriumD / 2 + 1.5 + i * 3.5
    const cRoofGeo = new THREE.PlaneGeometry(3 + roofOverhang, 3 + roofOverhang)
    cRoofGeo.rotateX(-Math.PI / 2)
    const cRoof = new THREE.Mesh(cRoofGeo, mt.terracotta)
    cRoof.position.set(cubX, WALL_H + 0.1, cubZ)
    group.add(cRoof)
  }

  // Shop roofs
  for (let i = 0; i < 4; i++) {
    const shopX = -HALF_W + 3 + i * 8
    if (Math.abs(shopX - faucesX) < 4) continue
    const sRoofGeo = new THREE.PlaneGeometry(3.5, 4.5)
    sRoofGeo.rotateX(-Math.PI / 2)
    const sRoof = new THREE.Mesh(sRoofGeo, mt.terracotta)
    sRoof.position.set(shopX, WALL_H + 0.1, buildS - 2)
    group.add(sRoof)
  }

  // ── Street ── along south side
  const streetZ = HALF_D - STREET_W / 2
  group.add(makeFloor(0, streetZ, BLOCK_W, STREET_W, mt.streetStone))

  // Stepping stones (3 raised blocks for crossing)
  for (let i = 0; i < 3; i++) {
    const ssGeo = new THREE.BoxGeometry(0.6, 0.25, 0.6)
    const ss = new THREE.Mesh(ssGeo, mt.stone)
    ss.position.set(-3 + i * 3, 0.125, streetZ)
    group.add(ss)
  }

  // Curb stones along street
  const curbGeo = new THREE.BoxGeometry(BLOCK_W, 0.2, 0.3)
  const curbN = new THREE.Mesh(curbGeo, mt.stone)
  curbN.position.set(0, 0.1, HALF_D - STREET_W)
  group.add(curbN)
  const curbS = new THREE.Mesh(curbGeo.clone(), mt.stone)
  curbS.position.set(0, 0.1, HALF_D)
  group.add(curbS)

  return group
}

// ─── Build Ruins (Present Day) ───────────────────────────────────────────────

function buildRuins(mt) {
  const group = new THREE.Group()

  const buildS = HALF_D - STREET_W
  const buildN = -HALF_D

  // Same layout as reconstructed, but broken walls, no roofs, no plaster

  // ── Outer perimeter walls — broken ──
  group.add(makeRuinWall(0, buildN, BLOCK_W, WALL_T, 1.5, mt.ruinStone))
  group.add(makeRuinWall(0, buildS, BLOCK_W, WALL_T, 1.2, mt.ruinStone))
  group.add(makeRuinWall(HALF_W, (buildN + buildS) / 2, WALL_T, buildS - buildN, 1.8, mt.ruinStone))
  group.add(makeRuinWall(-HALF_W, (buildN + buildS) / 2, WALL_T, buildS - buildN, 1.6, mt.ruinStone))

  // ── Fauces ──
  const faucesX = -5
  const faucesW = 1.5
  const faucesD = 4
  const faucesZ = buildS - faucesD / 2
  group.add(makeRuinWall(faucesX - faucesW / 2, faucesZ, WALL_T, faucesD, 1.0, mt.ruinStone))
  group.add(makeRuinWall(faucesX + faucesW / 2, faucesZ, WALL_T, faucesD, 0.8, mt.ruinStone))
  // Mosaic floor (survives in ruins)
  group.add(buildMosaicFloor(faucesX, faucesZ, faucesW, faucesD, mt))

  // ── Atrium ──
  const atriumX = faucesX
  const atriumW = 10
  const atriumD = 8
  const atriumZ = buildS - faucesD - atriumD / 2
  group.add(makeRuinWall(atriumX - atriumW / 2, atriumZ, WALL_T, atriumD, 1.5, mt.ruinStone))
  group.add(makeRuinWall(atriumX + atriumW / 2, atriumZ, WALL_T, atriumD, 1.2, mt.ruinStone))
  group.add(makeRuinWall(atriumX - atriumW / 2 + 1.5, atriumZ - atriumD / 2, 3, WALL_T, 1.0, mt.ruinStone))
  group.add(makeRuinWall(atriumX + atriumW / 2 - 1.5, atriumZ - atriumD / 2, 3, WALL_T, 0.9, mt.ruinStone))

  // Mosaic floor survives
  group.add(buildMosaicFloor(atriumX, atriumZ, atriumW, atriumD, mt))

  // Impluvium (survives well in ruins)
  const impW = 3, impD = 2, impDepth = 0.3
  const impGeo = new THREE.BoxGeometry(impW, impDepth, impD)
  const impMesh = new THREE.Mesh(impGeo, mt.stone)
  impMesh.position.set(atriumX, -impDepth / 2 + 0.01, atriumZ)
  group.add(impMesh)
  // Rainwater collects
  const waterGeo = new THREE.PlaneGeometry(impW - 0.1, impD - 0.1)
  waterGeo.rotateX(-Math.PI / 2)
  const waterMesh = new THREE.Mesh(waterGeo, mt.water)
  waterMesh.position.set(atriumX, -0.08, atriumZ)
  group.add(waterMesh)
  // Rim
  const rimT = 0.12, rimH = 0.15
  group.add(makeWall(atriumX, atriumZ - impD / 2 - rimT / 2, impW + rimT * 2, rimT, rimH, mt.ruinStone))
  group.add(makeWall(atriumX, atriumZ + impD / 2 + rimT / 2, impW + rimT * 2, rimT, rimH, mt.ruinStone))
  group.add(makeWall(atriumX - impW / 2 - rimT / 2, atriumZ, rimT, impD, rimH, mt.ruinStone))
  group.add(makeWall(atriumX + impW / 2 + rimT / 2, atriumZ, rimT, impD, rimH, mt.ruinStone))

  // ── Tablinum ──
  const tabX = atriumX
  const tabW = 4
  const tabD = 5
  const tabZ = atriumZ - atriumD / 2 - tabD / 2
  group.add(makeRuinWall(tabX - tabW / 2, tabZ, WALL_T, tabD, 1.3, mt.ruinStone))
  group.add(makeRuinWall(tabX + tabW / 2, tabZ, WALL_T, tabD, 1.0, mt.ruinStone))
  group.add(makeRuinWall(tabX, tabZ - tabD / 2, tabW, WALL_T, 0.8, mt.ruinStone))
  group.add(buildMosaicFloor(tabX, tabZ, tabW, tabD, mt))

  // ── Peristyle ──
  const periX = atriumX + 3
  const periW = 12
  const periD = 10
  const periZ = tabZ - tabD / 2 - periD / 2
  group.add(makeRuinWall(periX - periW / 2, periZ, WALL_T, periD, 1.5, mt.ruinStone))
  group.add(makeRuinWall(periX + periW / 2, periZ, WALL_T, periD, 1.2, mt.ruinStone))
  group.add(makeRuinWall(periX, periZ - periD / 2, periW, WALL_T, 1.0, mt.ruinStone))
  group.add(makeRuinWall(periX, periZ + periD / 2, periW, WALL_T, 0.8, mt.ruinStone))

  // Garden floor
  const gardenMat = new THREE.MeshStandardMaterial({
    color: 0x706848, roughness: 0.95, metalness: 0.0, side: THREE.DoubleSide,
    emissive: 0x706848, emissiveIntensity: 0.15,
  })
  group.add(makeFloor(periX, periZ, periW - 2, periD - 2, gardenMat))

  // Broken column stumps
  const colInset = 1.2
  for (let i = 0; i < 5; i++) {
    const cx = periX - periW / 2 + colInset + i * ((periW - colInset * 2) / 4)
    group.add(makeColumn(cx, periZ - periD / 2 + colInset, 3.0, mt.columnMarble, true))
    group.add(makeColumn(cx, periZ + periD / 2 - colInset, 3.0, mt.columnMarble, true))
  }
  for (let i = 1; i < 4; i++) {
    const cz = periZ - periD / 2 + colInset + i * ((periD - colInset * 2) / 4)
    group.add(makeColumn(periX - periW / 2 + colInset, cz, 3.0, mt.columnMarble, true))
    group.add(makeColumn(periX + periW / 2 - colInset, cz, 3.0, mt.columnMarble, true))
  }

  // ── Triclinium ──
  const tricX = periX + periW / 2 + 2.5
  const tricW = 5
  const tricD = 4
  const tricZ = periZ
  group.add(makeRuinWall(tricX - tricW / 2, tricZ, WALL_T, tricD, 1.2, mt.ruinStone))
  group.add(makeRuinWall(tricX + tricW / 2, tricZ, WALL_T, tricD, 0.7, mt.ruinStone))
  group.add(makeRuinWall(tricX, tricZ - tricD / 2, tricW, WALL_T, 0.9, mt.ruinStone))
  group.add(makeRuinWall(tricX, tricZ + tricD / 2, tricW, WALL_T, 1.0, mt.ruinStone))
  group.add(buildMosaicFloor(tricX, tricZ, tricW, tricD, mt))

  // ── Cubicula ──
  for (let i = 0; i < 3; i++) {
    const cubX = atriumX + atriumW / 2 + 1.8
    const cubW = 3
    const cubD = 3
    const cubZ = atriumZ - atriumD / 2 + 1.5 + i * (cubD + 0.5)
    group.add(makeRuinWall(cubX - cubW / 2, cubZ, WALL_T, cubD, 0.8 + i * 0.2, mt.ruinStone))
    group.add(makeRuinWall(cubX + cubW / 2, cubZ, WALL_T, cubD, 0.6 + i * 0.15, mt.ruinStone))
    group.add(makeRuinWall(cubX, cubZ - cubD / 2, cubW, WALL_T, 0.7 + i * 0.1, mt.ruinStone))
    group.add(makeRuinWall(cubX, cubZ + cubD / 2, cubW, WALL_T, 0.5 + i * 0.2, mt.ruinStone))
    group.add(makeFloor(cubX, cubZ, cubW, cubD, mt.mosaicWhite))
  }

  // ── Tabernae (shops) — broken ──
  const tabernaeY = buildS
  for (let i = 0; i < 4; i++) {
    const shopX = -HALF_W + 3 + i * 8
    const faucesXLocal = -5
    if (Math.abs(shopX - faucesXLocal) < 4) continue
    const shopW = 3
    const shopD = 4
    const shopZ = tabernaeY - shopD / 2
    group.add(makeRuinWall(shopX - shopW / 2, shopZ, WALL_T, shopD, 1.0, mt.ruinStone))
    group.add(makeRuinWall(shopX + shopW / 2, shopZ, WALL_T, shopD, 0.8, mt.ruinStone))
    group.add(makeRuinWall(shopX, shopZ - shopD / 2, shopW, WALL_T, 0.6, mt.ruinStone))
    // Counter survives
    const counterGeo = new THREE.BoxGeometry(shopW - 0.2, 0.6, 0.3)
    const counter = new THREE.Mesh(counterGeo, mt.ruinStone)
    counter.position.set(shopX, 0.3, tabernaeY - 0.15)
    group.add(counter)
    group.add(makeFloor(shopX, shopZ, shopW, shopD, mt.ruinStone))
  }

  // NO roofs in ruins

  // ── Street ── (survives)
  const streetZ = HALF_D - STREET_W / 2
  group.add(makeFloor(0, streetZ, BLOCK_W, STREET_W, mt.streetStone))

  // Stepping stones
  for (let i = 0; i < 3; i++) {
    const ssGeo = new THREE.BoxGeometry(0.6, 0.25, 0.6)
    const ss = new THREE.Mesh(ssGeo, mt.ruinStone)
    ss.position.set(-3 + i * 3, 0.125, streetZ)
    group.add(ss)
  }

  // Curb stones
  const curbGeo = new THREE.BoxGeometry(BLOCK_W, 0.15, 0.3)
  const curbN = new THREE.Mesh(curbGeo, mt.ruinStone)
  curbN.position.set(0, 0.075, HALF_D - STREET_W)
  group.add(curbN)
  const curbS = new THREE.Mesh(curbGeo.clone(), mt.ruinStone)
  curbS.position.set(0, 0.075, HALF_D)
  group.add(curbS)

  return group
}

// ─── Feature info data ───────────────────────────────────────────────────────

const FEATURES = {
  atrium: {
    name: 'Atrium',
    type: 'Room',
    dimensions: '~10m × 8m',
    material: 'Plastered walls with painted frescoes',
    description: 'The central reception hall of a Roman domus. Open to the sky through the compluvium (roof opening), it collected rainwater in the impluvium below. The atrium was the public heart of the house — where clients gathered each morning to greet the paterfamilias.',
  },
  impluvium: {
    name: 'Impluvium',
    type: 'Water Feature',
    dimensions: '3m × 2m, 0.3m deep',
    material: 'Stone basin, often lined with marble',
    description: 'A shallow rectangular pool in the atrium floor, positioned directly beneath the compluvium opening in the roof. It collected rainwater which drained to an underground cistern. The impluvium was both functional (water supply) and decorative, often featuring mosaic or marble lining.',
  },
  tablinum: {
    name: 'Tablinum',
    type: 'Room',
    dimensions: '~4m × 5m',
    material: 'Plastered walls, mosaic floor',
    description: 'The study or office of the paterfamilias, positioned at the rear of the atrium with a direct line of sight to the entrance. This visual axis was deliberate — visitors could see the master at work from the fauces. Family records, wax ancestor masks (imagines), and the household safe were kept here.',
  },
  peristyle: {
    name: 'Peristyle Garden',
    type: 'Courtyard',
    dimensions: '~12m × 10m',
    material: 'Colonnade of marble/limestone columns',
    description: 'A colonnaded garden at the heart of the private quarters. Inspired by Greek architecture, the peristyle was surrounded by columns supporting a covered walkway. Gardens featured fountains, statuary, and carefully tended plants. In wealthy homes like the House of the Faun, the peristyle could be larger than the atrium.',
  },
  triclinium: {
    name: 'Triclinium',
    type: 'Dining Room',
    dimensions: '~5m × 4m',
    material: 'Frescoed walls, mosaic floor',
    description: 'The Roman dining room, named for the three couches (klinai) arranged in a U-shape around a central table. Diners reclined on their left side while eating with their right hand. Wealthy Romans spent hours at dinner (cena), which served as the day\'s main social event. Walls were typically decorated with elaborate frescoes.',
  },
  tabernae: {
    name: 'Tabernae (Shops)',
    type: 'Commercial',
    dimensions: '~3m × 4m each',
    material: 'Stone counters, wide street openings',
    description: 'Shop fronts built into the street-facing wall of the insula. Each had a wide opening secured by wooden shutters at night, and a stone counter (mensa ponderaria) for displaying goods. Common businesses included bakeries (pistrina), wine bars (thermopolia), and fullers (fullonicae). Shop owners often lived in a mezzanine above.',
  },
  fauces: {
    name: 'Fauces (Entrance)',
    type: 'Passage',
    dimensions: '~1.5m wide, 4m long',
    material: 'Mosaic floor, plastered walls',
    description: 'The narrow entrance corridor connecting the street door to the atrium. The word means "throat" in Latin. Often decorated with a mosaic threshold — many Pompeian homes had "CAVE CANEM" (beware of dog) mosaics here. The fauces created a dramatic reveal: a compressed passage opening into the bright, spacious atrium.',
  },
  mosaics: {
    name: 'Mosaic Floors',
    type: 'Decoration',
    dimensions: 'Throughout the domus',
    material: 'Tesserae (small stone/glass cubes)',
    description: 'Roman mosaics were assembled from thousands of tiny stone or glass cubes (tesserae), typically 1-2cm across. Common patterns ranged from simple black-and-white geometric designs to elaborate polychrome scenes. The House of the Faun contained the famous Alexander Mosaic — a 5.8m × 3.1m masterpiece depicting Alexander the Great battling Darius III.',
  },
  frescoes: {
    name: 'Wall Frescoes',
    type: 'Decoration',
    dimensions: 'Full wall coverage',
    material: 'Pigment applied to wet plaster (buon fresco)',
    description: 'Pompeian wall painting followed four distinct styles over 200 years. The characteristic "Pompeian red" (vermillion from cinnabar or red ochre) was applied while plaster was still wet (fresco), creating a permanent chemical bond. Walls were divided into zones: a dado at the bottom, a main central panel, and an upper frieze. Common subjects included mythological scenes, landscapes, and architectural illusions.',
  },
}

// ─── Click targets ───────────────────────────────────────────────────────────

function buildClickTargets(mt) {
  const targets = []
  const invisMat = new THREE.MeshBasicMaterial({ visible: false })

  const buildS = HALF_D - STREET_W
  const faucesX = -5
  const faucesD = 4
  const atriumX = faucesX
  const atriumD = 8
  const atriumZ = buildS - faucesD - atriumD / 2
  const tabX = atriumX
  const tabD = 5
  const tabZ = atriumZ - atriumD / 2 - tabD / 2
  const periX = atriumX + 3
  const periD = 10
  const periZ = tabZ - tabD / 2 - periD / 2
  const tricX = periX + 12 / 2 + 2.5
  const tricZ = periZ

  function addTarget(key, x, z, w, d) {
    const geo = new THREE.BoxGeometry(w, 3, d)
    const mesh = new THREE.Mesh(geo, invisMat)
    mesh.position.set(x, 1.5, z)
    mesh.userData.feature = FEATURES[key]
    mesh.userData.featureKey = key
    targets.push(mesh)
  }

  addTarget('atrium', atriumX, atriumZ, 10, 8)
  addTarget('impluvium', atriumX, atriumZ, 3, 2)
  addTarget('tablinum', tabX, tabZ, 4, 5)
  addTarget('peristyle', periX, periZ, 12, 10)
  addTarget('triclinium', tricX, tricZ, 5, 4)
  addTarget('fauces', faucesX, buildS - faucesD / 2, 1.5, 4)

  // Tabernae — collective target
  addTarget('tabernae', -HALF_W + 11, buildS - 2, 20, 4)

  // Mosaic — target over atrium floor
  addTarget('mosaics', atriumX, atriumZ, 8, 6)

  // Frescoes — target on atrium wall area
  addTarget('frescoes', atriumX - 5 + 0.5, atriumZ, 1, 6)

  return targets
}

// ─── Label anchors ───────────────────────────────────────────────────────────

function buildLabelAnchors() {
  const buildS = HALF_D - STREET_W
  const faucesX = -5
  const faucesD = 4
  const atriumX = faucesX
  const atriumW = 10
  const atriumD = 8
  const atriumZ = buildS - faucesD - atriumD / 2
  const tabX = atriumX
  const tabW = 4
  const tabD = 5
  const tabZ = atriumZ - atriumD / 2 - tabD / 2
  const periX = atriumX + 3
  const periW = 12
  const periD = 10
  const periZ = tabZ - tabD / 2 - periD / 2
  const tricX = periX + periW / 2 + 2.5
  const tricZ = periZ

  return {
    fauces:      { pos: new THREE.Vector3(faucesX, 4, buildS - faucesD / 2), name: 'Fauces' },
    atrium:      { pos: new THREE.Vector3(atriumX, 5, atriumZ), name: 'Atrium' },
    impluvium:   { pos: new THREE.Vector3(atriumX, 2, atriumZ), name: 'Impluvium' },
    tablinum:    { pos: new THREE.Vector3(tabX, 5, tabZ), name: 'Tablinum' },
    peristyle:   { pos: new THREE.Vector3(periX, 5, periZ), name: 'Peristyle Garden' },
    triclinium:  { pos: new THREE.Vector3(tricX, 5, tricZ), name: 'Triclinium' },
    tabernae:    { pos: new THREE.Vector3(-HALF_W + 11, 4, buildS - 1), name: 'Tabernae' },
    mosaics:     { pos: new THREE.Vector3(atriumX + 3, 2, atriumZ + 2), name: 'Mosaic Floors' },
    frescoes:    { pos: new THREE.Vector3(atriumX - atriumW / 2 + 1, 3, atriumZ - 1), name: 'Frescoes' },
  }
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function createPompeiiModel() {
  const mt = makeMaterials()

  const reconstructed = buildReconstructed(mt)
  const ruins = buildRuins(mt)
  const clickTargets = buildClickTargets(mt)
  const labelAnchors = buildLabelAnchors()

  // Ruins start hidden (reconstructed visible by default)
  ruins.visible = false

  return { reconstructed, ruins, clickTargets, labelAnchors, features: FEATURES }
}
