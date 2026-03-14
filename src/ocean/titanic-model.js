import * as THREE from 'three'

/**
 * Procedural RMS Titanic wreck — split into bow and stern sections.
 * The ship broke between the 3rd and 4th funnels (z ≈ -0.9 in model space).
 * Returns { bow, stern, debris }
 *   bow/stern: THREE.Group
 *   debris: THREE.Group (scattered wreckage for between the pieces)
 */

const BREAK_Z = -0.9

// ─── Feature data ───────────────────────────────────────────────────────────

const FEATURES = {
  bow: {
    name: 'Bow Section',
    type: 'Hull Structure',
    dimensions: '133 m long (intact)',
    description: 'The forward section of the Titanic, remarkably intact after its 3,800 m descent. The bow struck the seabed at roughly 25 knots, burying itself up to 18 m into the sediment. The forecastle, well deck, and most of the superstructure forward of the third funnel survive.',
  },
  stern: {
    name: 'Stern Section',
    type: 'Hull Structure',
    dimensions: '100 m long (heavily damaged)',
    description: 'The aft section suffered catastrophic implosion damage during the sinking. Air trapped inside collapsed entire decks as hydrostatic pressure overwhelmed the structure. The stern lies roughly 600 m south of the bow, rotated almost 180 degrees from the bow\'s heading.',
  },
  funnels: {
    name: 'Funnel Bases',
    type: 'Superstructure',
    dimensions: '7.3 m diameter, 18.9 m tall (original)',
    description: 'All four funnels broke free during the sinking. Only the bases and guy-wire anchor points remain on the wreck. Funnel No. 1 was found in the debris field. The fourth funnel was a dummy used for ventilation and aesthetic balance.',
  },
  bridge: {
    name: 'Bridge & Wheelhouse',
    type: 'Navigation',
    dimensions: '12.5 m wide, 5 m deep',
    description: 'The nerve center of the ship where First Officer Murdoch ordered "hard a-starboard" moments before the collision. The telemotor that held the ship\'s wheel still stands. The bridge wings extended to port and starboard for docking maneuvers.',
  },
  grandStaircase: {
    name: 'Grand Staircase',
    type: 'Interior Feature',
    dimensions: '18 m tall (6 decks), wrought-iron & glass dome',
    description: 'The forward Grand Staircase was the most opulent feature of the ship, descending six decks beneath an ornate iron-and-glass dome. The dome and staircase are gone — only the opening remains, providing a haunting portal into the ship\'s interior.',
  },
  boatDeck: {
    name: 'Boat Deck',
    type: 'Deck Structure',
    dimensions: '200 m long, uppermost deck',
    description: 'The topmost deck from which lifeboats were launched on the night of the sinking. Titanic carried only 20 lifeboats — enough for roughly half the people aboard. The davits that held the boats still line both sides of the wreck.',
  },
  forecastle: {
    name: 'Forecastle',
    type: 'Deck Structure',
    dimensions: '39 m long, forward deck',
    description: 'The raised forward deck where the anchor chains, capstans, and mooring equipment were located. The crow\'s nest, from which lookout Frederick Fleet spotted the iceberg, was mounted on the foremast just aft of the forecastle.',
  },
  poopDeck: {
    name: 'Poop Deck',
    type: 'Deck Structure',
    dimensions: '32 m long, stern deck',
    description: 'The raised aft deck was the last part of the ship above water. As the bow sank, the stern rose until the ship broke apart between the third and fourth funnels. Survivors described the stern rising to nearly vertical before its final plunge.',
  },
  debrisField: {
    name: 'Debris Field',
    type: 'Wreckage Zone',
    dimensions: '~1.5 km long, 0.8 km wide',
    description: 'Scattered between the bow and stern sections, the debris field contains thousands of artifacts: coal, hull plates, wine bottles, personal belongings, a fallen funnel, and structural fragments. The field traces the path the ship took as it broke apart during the descent.',
  },
}

// ─── Label anchors (positions in model space relative to bow/stern origins) ──

const LABEL_ANCHORS = {
  bow:            { pos: new THREE.Vector3(0, 2.5, 3.0),   name: 'Bow Section' },
  stern:          { pos: new THREE.Vector3(0, 2.5, -3.5),  name: 'Stern Section' },
  funnels:        { pos: new THREE.Vector3(0, 2.8, 1.2),   name: 'Funnel Bases' },
  bridge:         { pos: new THREE.Vector3(0, 2.0, 2.35),  name: 'Bridge' },
  grandStaircase: { pos: new THREE.Vector3(0, 1.8, 1.9),   name: 'Grand Staircase' },
  boatDeck:       { pos: new THREE.Vector3(0.6, 1.6, 1.0), name: 'Boat Deck' },
  forecastle:     { pos: new THREE.Vector3(0, 1.5, 4.5),   name: 'Forecastle' },
  poopDeck:       { pos: new THREE.Vector3(0, 1.2, -4.6),  name: 'Poop Deck' },
  debrisField:    { pos: new THREE.Vector3(0, 0.8, 0),     name: 'Debris Field' },
}

// ─── Utility ────────────────────────────────────────────────────────────────

function smoothstep(a, b, t) {
  const x = Math.max(0, Math.min(1, (t - a) / (b - a)))
  return x * x * (3 - 2 * x)
}

function m(geo, mat, x, y, z) {
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.set(x, y, z)
  return mesh
}

// Seeded PRNG
function rng(s) {
  let v = s
  return () => { v = (v * 16807) % 2147483647; return v / 2147483647 }
}

// ─── Hull geometry ──────────────────────────────────────────────────────────

function beamW(t) {
  if (t < 0.08) return 0.55 + 0.45 * smoothstep(0, 0.08, t)
  if (t > 0.55) { const bt = (t - 0.55) / 0.45; return Math.max(1.0 - bt * bt, 0.01) }
  return 1.0
}

function createHullSection(zMin, zMax) {
  const L = 12, halfW = 0.7, D = 1.0
  const segs = 80, rings = 24
  const v = [], idx = []

  const segList = []
  for (let i = 0; i <= segs; i++) {
    const t = i / segs
    const z = (t - 0.5) * L
    if (z >= zMin && z <= zMax) segList.push({ t, z })
  }
  const tMin = zMin / L + 0.5, tMax = zMax / L + 0.5
  if (segList.length === 0 || segList[0].z > zMin + 0.01)
    segList.unshift({ t: tMin, z: zMin })
  if (segList[segList.length - 1].z < zMax - 0.01)
    segList.push({ t: tMax, z: zMax })

  for (let i = 0; i < segList.length; i++) {
    const { t, z } = segList[i]
    const w = beamW(t)
    const vShape = t > 0.5 ? (t - 0.5) / 0.5 * 0.4 : 0
    for (let j = 0; j <= rings; j++) {
      const angle = (j / rings) * Math.PI - Math.PI / 2
      const x = Math.sin(angle) * halfW * w
      let y = -Math.cos(angle) * D - vShape * (1 - Math.abs(Math.sin(angle))) * 0.3
      y = Math.min(y, 0)
      v.push(x, y, z)
    }
  }

  for (let i = 0; i < segList.length - 1; i++)
    for (let j = 0; j < rings; j++) {
      const a = i * (rings + 1) + j, b = a + rings + 1
      idx.push(a, b, a + 1, a + 1, b, b + 1)
    }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  return geo
}

function hullW(z) { return beamW(z / 12 + 0.5) }
function hullX(y, z) {
  const w = hullW(z)
  const cosA = Math.min(1, -y / 1.0)
  return Math.sqrt(Math.max(0, 1 - cosA * cosA)) * 0.7 * w
}

// ─── Break edge ─────────────────────────────────────────────────────────────

function addBreakEdge(group, zPos, mat, facing) {
  const rand = rng(facing === 'bow' ? 99 : 77)
  const tornMat = new THREE.MeshStandardMaterial({
    color: 0x2a1808, roughness: 0.95, metalness: 0.08, side: THREE.DoubleSide
  })

  // Jagged plates
  for (let i = 0; i < 22; i++) {
    const x = (rand() - 0.5) * 1.3
    const y = -rand() * 0.9
    const w = 0.03 + rand() * 0.12
    const h = 0.04 + rand() * 0.18
    const plate = m(new THREE.BoxGeometry(w, h, 0.006), tornMat, x, y, zPos)
    plate.rotation.x = (rand() - 0.5) * 1.0
    plate.rotation.z = (rand() - 0.5) * 0.5
    group.add(plate)
  }

  // Hanging girders
  for (let i = 0; i < 5; i++) {
    const x = (rand() - 0.5) * 0.8
    const len = 0.1 + rand() * 0.25
    const girder = m(new THREE.BoxGeometry(0.012, len, 0.012), tornMat, x, -rand() * 0.5, zPos)
    girder.rotation.x = (rand() - 0.5) * 0.6
    group.add(girder)
  }

  // Exposed deck edges
  const deckYs = [0.02, 0.13, 0.32, 0.49, 0.64]
  deckYs.forEach(dy => {
    group.add(m(new THREE.BoxGeometry(1.0, 0.02, 0.01), mat, 0, dy, zPos))
  })

  // Twisted rebar/framing
  for (let i = 0; i < 8; i++) {
    const x = (rand() - 0.5) * 1.0
    const y = rand() * 0.6
    const rod = m(new THREE.CylinderGeometry(0.004, 0.004, 0.08 + rand() * 0.12, 4), mat, x, y, zPos)
    rod.rotation.set(rand() * 1.5, rand(), rand() * 0.8)
    group.add(rod)
  }
}

// ─── Rusticles ──────────────────────────────────────────────────────────────

function addRusticles(group, zMin, zMax, seed) {
  const rand = rng(seed)
  const rustMat = new THREE.MeshStandardMaterial({ color: 0x5a3018, roughness: 0.95, metalness: 0.05 })
  const rustMat2 = new THREE.MeshStandardMaterial({ color: 0x4a2810, roughness: 0.95, metalness: 0.08 })
  const rustMat3 = new THREE.MeshStandardMaterial({ color: 0x3a1e0a, roughness: 0.9, metalness: 0.1 })
  const mats = [rustMat, rustMat2, rustMat3]

  // Along hull waterline and lower edges
  for (let i = 0; i < 60; i++) {
    const z = zMin + rand() * (zMax - zMin)
    const side = rand() > 0.5 ? 1 : -1
    const y = -0.05 - rand() * 0.6
    const xBase = hullX(y, z)
    if (xBase < 0.1) continue

    const len = 0.03 + rand() * 0.12
    const geo = new THREE.ConeGeometry(0.003 + rand() * 0.006, len, 4)
    const r = m(geo, mats[Math.floor(rand() * 3)], side * (xBase + 0.002), y - len / 2, z)
    r.rotation.z = side * (0.1 + rand() * 0.3)
    group.add(r)
  }

  // Along deck edges
  for (let i = 0; i < 30; i++) {
    const z = zMin + rand() * (zMax - zMin)
    const side = rand() > 0.5 ? 1 : -1
    const y = 0.01
    const len = 0.02 + rand() * 0.08
    const geo = new THREE.ConeGeometry(0.002 + rand() * 0.005, len, 4)
    const r = m(geo, mats[Math.floor(rand() * 3)], side * (0.55 + rand() * 0.1), y - len / 2, z)
    group.add(r)
  }

  // Clusters hanging from railing edges
  for (let i = 0; i < 15; i++) {
    const z = zMin + rand() * (zMax - zMin)
    const side = rand() > 0.5 ? 1 : -1
    // Small cluster of 2-4 rusticles
    const cx = side * (0.48 + rand() * 0.16)
    const cy = 0.55 + rand() * 0.15
    for (let j = 0; j < 2 + Math.floor(rand() * 3); j++) {
      const len = 0.02 + rand() * 0.06
      const geo = new THREE.ConeGeometry(0.002 + rand() * 0.004, len, 3)
      const r = m(geo, mats[Math.floor(rand() * 3)],
        cx + (rand() - 0.5) * 0.02, cy - len / 2 - j * 0.008, z + (rand() - 0.5) * 0.02)
      group.add(r)
    }
  }
}

// ─── Hull plate seams ───────────────────────────────────────────────────────

function addPlateSeams(group, zMin, zMax) {
  const seamMat = new THREE.MeshStandardMaterial({
    color: 0x2a1a0a, roughness: 0.95, metalness: 0.08
  })

  // Horizontal strake seams along hull
  const seams = [-0.1, -0.25, -0.45, -0.65, -0.8]
  seams.forEach(y => {
    const validZ = []
    for (let z = zMin + 0.1; z < zMax - 0.1; z += 0.3) {
      const x = hullX(y, z)
      if (x > 0.1) validZ.push(z)
    }
    if (validZ.length < 2) return
    for (const side of [-1, 1]) {
      for (let i = 0; i < validZ.length - 1; i++) {
        const z0 = validZ[i], z1 = validZ[i + 1]
        const x0 = hullX(y, (z0 + z1) / 2)
        const seam = m(new THREE.BoxGeometry(0.004, 0.004, z1 - z0), seamMat,
          side * (x0 + 0.001), y, (z0 + z1) / 2)
        group.add(seam)
      }
    }
  })

  // Vertical plate boundaries (riveted seams) every ~0.5 units
  for (let z = zMin + 0.3; z < zMax - 0.3; z += 0.45) {
    for (const side of [-1, 1]) {
      const pts = []
      for (let y = -0.05; y > -0.85; y -= 0.1) {
        const x = hullX(y, z)
        if (x > 0.08) pts.push(new THREE.Vector3(side * (x + 0.001), y, z))
      }
      if (pts.length >= 2) {
        const seam = m(new THREE.BoxGeometry(0.003, pts[0].y - pts[pts.length - 1].y, 0.003),
          seamMat, side * hullX(-0.4, z), (pts[0].y + pts[pts.length - 1].y) / 2, z)
        group.add(seam)
      }
    }
  }
}

// ─── Debris field ───────────────────────────────────────────────────────────

function createDebrisField() {
  const debris = new THREE.Group()
  const rand = rng(42)
  const debrisMat = new THREE.MeshStandardMaterial({ color: 0x2a2218, roughness: 0.95 })
  const metalDebris = new THREE.MeshStandardMaterial({ color: 0x2a2a25, roughness: 0.85, metalness: 0.2 })
  const rustDebris = new THREE.MeshStandardMaterial({ color: 0x3a2210, roughness: 0.9, metalness: 0.1 })

  // Scattered hull plates
  for (let i = 0; i < 25; i++) {
    const x = (rand() - 0.5) * 12
    const z = (rand() - 0.5) * 18
    const w = 0.1 + rand() * 0.3
    const h = 0.08 + rand() * 0.2
    const plate = m(new THREE.BoxGeometry(w, 0.008, h), rustDebris, x, 0.004, z)
    plate.rotation.y = rand() * Math.PI
    plate.rotation.x = (rand() - 0.5) * 0.3
    debris.add(plate)
  }

  // Scattered rivets/bolts
  for (let i = 0; i < 40; i++) {
    const x = (rand() - 0.5) * 14
    const z = (rand() - 0.5) * 20
    debris.add(m(new THREE.CylinderGeometry(0.008, 0.008, 0.005, 5), metalDebris, x, 0.003, z))
  }

  // Broken davit arms
  for (let i = 0; i < 4; i++) {
    const x = (rand() - 0.5) * 8
    const z = (rand() - 0.5) * 14
    const arm = m(new THREE.CylinderGeometry(0.008, 0.012, 0.6 + rand() * 0.4, 5), metalDebris, x, 0.01, z)
    arm.rotation.z = (rand() - 0.5) * 0.8
    arm.rotation.x = rand() * Math.PI * 2
    debris.add(arm)
  }

  // Fallen funnel (funnel 1 fell near the bow in reality)
  const fallenFunnel = new THREE.Group()
  const funnelBody = new THREE.CylinderGeometry(0.125, 0.15, 1.25, 16)
  funnelBody.scale(1, 1, 0.82)
  const fBuff = new THREE.MeshStandardMaterial({ color: 0x3a2a14, roughness: 0.9, metalness: 0.1 })
  fallenFunnel.add(new THREE.Mesh(funnelBody, fBuff))
  const topGeo = new THREE.CylinderGeometry(0.13, 0.125, 0.3, 16)
  topGeo.scale(1, 1, 0.82)
  const topM = new THREE.Mesh(topGeo, new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.85 }))
  topM.position.y = 0.72
  fallenFunnel.add(topM)
  fallenFunnel.position.set(3, 0.15, 6)
  fallenFunnel.rotation.z = Math.PI / 2 + 0.2
  fallenFunnel.rotation.y = 0.8
  debris.add(fallenFunnel)

  // Coal scattered
  const coalMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.95 })
  for (let i = 0; i < 30; i++) {
    const x = (rand() - 0.5) * 10
    const z = (rand() - 0.5) * 16
    const s = 0.008 + rand() * 0.015
    debris.add(m(new THREE.DodecahedronGeometry(s, 0), coalMat, x, s, z))
  }

  // Ceramic/china fragments
  const chinaMat = new THREE.MeshStandardMaterial({ color: 0x6a6258, roughness: 0.7 })
  for (let i = 0; i < 12; i++) {
    const x = (rand() - 0.5) * 8
    const z = (rand() - 0.5) * 12
    const piece = m(new THREE.BoxGeometry(0.02 + rand() * 0.03, 0.003, 0.015 + rand() * 0.02),
      chinaMat, x, 0.002, z)
    piece.rotation.y = rand() * Math.PI
    debris.add(piece)
  }

  // Shoes/boots (leather lasts)
  const leatherMat = new THREE.MeshStandardMaterial({ color: 0x2a1a0a, roughness: 0.9 })
  for (let i = 0; i < 6; i++) {
    const x = (rand() - 0.5) * 6
    const z = (rand() - 0.5) * 10
    const shoe = m(new THREE.CapsuleGeometry(0.006, 0.02, 3, 4), leatherMat, x, 0.006, z)
    shoe.rotation.z = Math.PI / 2
    shoe.rotation.y = rand() * Math.PI
    debris.add(shoe)
  }

  // Bottles
  const glassMat2 = new THREE.MeshStandardMaterial({ color: 0x122212, roughness: 0.4, metalness: 0.15 })
  for (let i = 0; i < 8; i++) {
    const x = (rand() - 0.5) * 7
    const z = (rand() - 0.5) * 12
    const bottle = m(new THREE.CylinderGeometry(0.004, 0.006, 0.04, 6), glassMat2, x, 0.004, z)
    bottle.rotation.z = Math.PI / 2 + (rand() - 0.5) * 0.3
    bottle.rotation.y = rand() * Math.PI
    debris.add(bottle)
  }

  // Large structural sections
  for (let i = 0; i < 6; i++) {
    const x = (rand() - 0.5) * 10
    const z = (rand() - 0.5) * 16
    const w = 0.2 + rand() * 0.5
    const d = 0.15 + rand() * 0.3
    const section = m(new THREE.BoxGeometry(w, 0.02 + rand() * 0.06, d), rustDebris, x, 0.01, z)
    section.rotation.y = rand() * Math.PI
    section.rotation.x = (rand() - 0.5) * 0.2
    debris.add(section)
  }

  // Twisted pipes
  for (let i = 0; i < 8; i++) {
    const x = (rand() - 0.5) * 9
    const z = (rand() - 0.5) * 14
    const pipe = m(new THREE.CylinderGeometry(0.006, 0.006, 0.15 + rand() * 0.3, 5), metalDebris, x, 0.01, z)
    pipe.rotation.x = rand() * Math.PI
    pipe.rotation.z = rand() * Math.PI
    debris.add(pipe)
  }

  return debris
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN MODEL
// ═════════════════════════════════════════════════════════════════════════════

export function createTitanicModel() {
  const bow = new THREE.Group()
  const stern = new THREE.Group()
  const clickTargets = []

  function tagged(mesh, featureKey) {
    mesh.userData.feature = FEATURES[featureKey]
    mesh.userData.featureKey = featureKey
    clickTargets.push(mesh)
    return mesh
  }

  // ── Shared Materials ──
  const rustHull    = new THREE.MeshStandardMaterial({ color: 0x4e3018, roughness: 0.88, metalness: 0.12, side: THREE.DoubleSide })
  const darkRust    = new THREE.MeshStandardMaterial({ color: 0x3a220e, roughness: 0.92, metalness: 0.10 })
  const redBottom   = new THREE.MeshStandardMaterial({ color: 0x3a1818, roughness: 0.88, side: THREE.DoubleSide })
  const sediment    = new THREE.MeshStandardMaterial({ color: 0x3a3020, roughness: 0.92 })
  const ghostWhite  = new THREE.MeshStandardMaterial({ color: 0x686058, roughness: 0.82 })
  const fadedCream  = new THREE.MeshStandardMaterial({ color: 0x504838, roughness: 0.88 })
  const fadedBuff   = new THREE.MeshStandardMaterial({ color: 0x5a3e20, roughness: 0.78, metalness: 0.12 })
  const blackened   = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.82 })
  const metalMat    = new THREE.MeshStandardMaterial({ color: 0x3a3a32, metalness: 0.35, roughness: 0.72 })
  const windowMat   = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.35, metalness: 0.18 })
  const propMat     = new THREE.MeshStandardMaterial({ color: 0x4a4020, roughness: 0.65, metalness: 0.40 })
  const railMat     = new THREE.MeshStandardMaterial({ color: 0x2a2820, metalness: 0.30, roughness: 0.82 })
  const glassMat    = new THREE.MeshStandardMaterial({ color: 0x101a20, roughness: 0.28, metalness: 0.22, transparent: true, opacity: 0.5 })
  const wireMat     = new THREE.LineBasicMaterial({ color: 0x444440, transparent: true, opacity: 0.5 })
  const mastMat     = new THREE.MeshStandardMaterial({ color: 0x2a200e, roughness: 0.88 })
  const boatMat     = new THREE.MeshStandardMaterial({ color: 0x3a3428, roughness: 0.82 })
  const ventMat     = new THREE.MeshStandardMaterial({ color: 0x2e2c22, roughness: 0.88 })
  const teakDeck    = new THREE.MeshStandardMaterial({ color: 0x3a301c, roughness: 0.92 })
  const brassLamp   = new THREE.MeshStandardMaterial({ color: 0x4a4020, roughness: 0.55, metalness: 0.45 })
  const siltMat     = new THREE.MeshStandardMaterial({ color: 0x2e2618, roughness: 0.92, transparent: true, opacity: 0.7 })

  function add(mesh, z) {
    if (z === undefined) z = mesh.position.z
    ;(z >= BREAK_Z ? bow : stern).add(mesh)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HULLS
  // ═══════════════════════════════════════════════════════════════════════════
  bow.add(tagged(new THREE.Mesh(createHullSection(BREAK_Z, 6), rustHull), 'bow'))
  stern.add(tagged(new THREE.Mesh(createHullSection(-6, BREAK_Z), rustHull), 'stern'))

  // Red anti-fouling bottom
  const redBow = new THREE.Mesh(createHullSection(BREAK_Z, 6), redBottom)
  redBow.scale.set(1.003, 0.6, 1.001); redBow.position.y = -0.4
  bow.add(redBow)
  const redStern = new THREE.Mesh(createHullSection(-6, BREAK_Z), redBottom)
  redStern.scale.set(1.003, 0.6, 1.001); redStern.position.y = -0.4
  stern.add(redStern)

  // Break edges
  addBreakEdge(bow, BREAK_Z, darkRust, 'bow')
  addBreakEdge(stern, BREAK_Z, darkRust, 'stern')

  // Hull plate seams
  addPlateSeams(bow, BREAK_Z, 5.8)
  addPlateSeams(stern, -5.8, BREAK_Z)

  // Rusticles
  addRusticles(bow, BREAK_Z, 5.8, 123)
  addRusticles(stern, -5.8, BREAK_Z, 456)

  // Bow stem (knife-edge)
  bow.add(m(new THREE.BoxGeometry(0.02, 0.8, 0.02), darkRust, 0, 0.1, 5.9))
  // Stem cap
  bow.add(m(new THREE.BoxGeometry(0.04, 0.04, 0.1), metalMat, 0, 0.5, 5.85))

  // ═══════════════════════════════════════════════════════════════════════════
  // HULL PORTHOLES
  // ═══════════════════════════════════════════════════════════════════════════
  const portGeo = new THREE.CircleGeometry(0.018, 8)
  const portRimGeo = new THREE.RingGeometry(0.016, 0.022, 8)
  for (const side of [-1, 1]) {
    const ry = side * Math.PI / 2
    // Upper row
    for (let i = 0; i < 44; i++) {
      const pz = 4.5 - i * 0.22
      const hx = hullX(-0.15, pz)
      if (hx < 0.15) continue
      const pw = m(portGeo, windowMat, side * (hx - 0.002), -0.15, pz)
      pw.rotation.y = ry; add(pw, pz)
      const pr = m(portRimGeo, metalMat, side * (hx - 0.001), -0.15, pz)
      pr.rotation.y = ry; add(pr, pz)
    }
    // Lower row
    for (let i = 0; i < 38; i++) {
      const pz = 4.0 - i * 0.24
      const hx = hullX(-0.38, pz)
      if (hx < 0.15) continue
      const pw = m(portGeo, windowMat, side * (hx - 0.002), -0.38, pz)
      pw.rotation.y = ry; add(pw, pz)
      const pr = m(portRimGeo, metalMat, side * (hx - 0.001), -0.38, pz)
      pr.rotation.y = ry; add(pr, pz)
    }
    // Third row (deeper, F-G deck)
    for (let i = 0; i < 28; i++) {
      const pz = 3.5 - i * 0.28
      const hx = hullX(-0.58, pz)
      if (hx < 0.12) continue
      const pw = m(portGeo, windowMat, side * (hx - 0.002), -0.58, pz)
      pw.rotation.y = ry; add(pw, pz)
      const pr = m(portRimGeo, metalMat, side * (hx - 0.001), -0.58, pz)
      pr.rotation.y = ry; add(pr, pz)
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DECKS
  // ═══════════════════════════════════════════════════════════════════════════

  // Bow main deck
  const bowDeckLen = 5.9 - BREAK_Z
  bow.add(m(new THREE.BoxGeometry(1.3, 0.035, bowDeckLen), teakDeck, 0, 0.02, (5.9 + BREAK_Z) / 2))
  // Stern main deck
  const sternDeckLen = BREAK_Z - (-5.9)
  stern.add(m(new THREE.BoxGeometry(1.3, 0.035, sternDeckLen), teakDeck, 0, 0.02, (BREAK_Z + -5.9) / 2))

  // Deck plank lines (teak planking visible)
  for (let x = -0.5; x <= 0.5; x += 0.08) {
    bow.add(m(new THREE.BoxGeometry(0.003, 0.002, bowDeckLen - 0.1),
      new THREE.MeshStandardMaterial({ color: 0x1e1a0e, roughness: 0.95 }), x, 0.04, (5.9 + BREAK_Z) / 2))
  }

  // Forecastle deck (bow)
  bow.add(tagged(m(new THREE.BoxGeometry(1.15, 0.15, 2.6), darkRust, 0, 0.1, 4.1), 'forecastle'))
  for (const side of [-1, 1])
    bow.add(m(new THREE.BoxGeometry(0.025, 0.12, 2.6), darkRust, side * 0.565, 0.24, 4.1))

  // Well deck (bow)
  bow.add(m(new THREE.BoxGeometry(1.1, 0.04, 0.8), teakDeck, 0, 0.02, 2.6))

  // Poop deck (stern) — partially collapsed
  stern.add(tagged(m(new THREE.BoxGeometry(1.0, 0.14, 1.6), darkRust, 0, 0.09, -4.65), 'poopDeck'))
  for (const side of [-1, 1])
    stern.add(m(new THREE.BoxGeometry(0.02, 0.1, 1.6), darkRust, side * 0.49, 0.21, -4.65))

  // Silt accumulation on flat surfaces
  bow.add(m(new THREE.BoxGeometry(1.2, 0.01, bowDeckLen - 1.5), siltMat, 0, 0.04, (5.0 + BREAK_Z) / 2))
  stern.add(m(new THREE.BoxGeometry(1.1, 0.01, sternDeckLen - 1.0), siltMat, 0, 0.04, (BREAK_Z + -5.0) / 2))

  // ═══════════════════════════════════════════════════════════════════════════
  // SUPERSTRUCTURE
  // ═══════════════════════════════════════════════════════════════════════════

  const aFwd = 3.4, aBrk = BREAK_Z
  // A-deck bow
  bow.add(m(new THREE.BoxGeometry(1.08, 0.2, aFwd - aBrk), ghostWhite, 0, 0.13, (aFwd + aBrk) / 2))
  // A-deck stern
  const aAft = -3.8
  stern.add(m(new THREE.BoxGeometry(1.08, 0.2, aBrk - aAft), ghostWhite, 0, 0.13, (aBrk + aAft) / 2))

  // B-deck
  bow.add(m(new THREE.BoxGeometry(1.0, 0.18, 3.15 - aBrk), fadedCream, 0, 0.32, (3.15 + aBrk) / 2))
  stern.add(m(new THREE.BoxGeometry(1.0, 0.18, aBrk - (-3.25)), fadedCream, 0, 0.32, (aBrk + -3.25) / 2))

  // C-deck
  bow.add(m(new THREE.BoxGeometry(0.94, 0.16, 2.85 - aBrk), ghostWhite, 0, 0.49, (2.85 + aBrk) / 2))
  stern.add(m(new THREE.BoxGeometry(0.94, 0.16, aBrk - (-2.75)), ghostWhite, 0, 0.49, (aBrk + -2.75) / 2))

  // Boat deck
  bow.add(tagged(m(new THREE.BoxGeometry(0.84, 0.14, 2.4 - aBrk), fadedCream, 0, 0.64, (2.4 + aBrk) / 2), 'boatDeck'))
  stern.add(m(new THREE.BoxGeometry(0.84, 0.14, aBrk - (-1.8)), fadedCream, 0, 0.64, (aBrk + -1.8) / 2))

  // Promenade deck windows (enclosed section)
  for (const side of [-1, 1]) {
    bow.add(m(new THREE.BoxGeometry(0.015, 0.14, 2.0), glassMat, side * 0.465, 0.49, 1.5))
    // Promenade deck stanchions
    for (let z = 0.6; z < 2.5; z += 0.25)
      bow.add(m(new THREE.BoxGeometry(0.008, 0.14, 0.008), metalMat, side * 0.465, 0.49, z))
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STERN COLLAPSE — decks compressed/folded
  // The stern section is much more damaged than the bow
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const collapseMat = new THREE.MeshStandardMaterial({
      color: 0x2a1a0a, roughness: 0.95, metalness: 0.08, side: THREE.DoubleSide
    })
    // Collapsed deck plates at various angles
    const rand = rng(333)
    for (let i = 0; i < 12; i++) {
      const z = -2.0 - rand() * 3.5
      const x = (rand() - 0.5) * 0.7
      const w = 0.15 + rand() * 0.35
      const d = 0.1 + rand() * 0.25
      const plate = m(new THREE.BoxGeometry(w, 0.015, d), collapseMat, x, 0.1 + rand() * 0.3, z)
      plate.rotation.x = (rand() - 0.5) * 0.8
      plate.rotation.z = (rand() - 0.5) * 0.3
      stern.add(plate)
    }
    // Buckled hull plates on stern
    for (let i = 0; i < 8; i++) {
      const z = -3.0 - rand() * 2.5
      const side = rand() > 0.5 ? 1 : -1
      const y = -0.1 - rand() * 0.5
      const x = hullX(y, z)
      if (x < 0.1) continue
      const w = 0.08 + rand() * 0.15
      const h = 0.06 + rand() * 0.12
      const buckle = m(new THREE.BoxGeometry(0.01, h, w), collapseMat,
        side * (x + 0.02 + rand() * 0.04), y, z)
      buckle.rotation.y = side * (0.1 + rand() * 0.3)
      stern.add(buckle)
    }
    // Fallen superstructure debris on stern deck
    for (let i = 0; i < 10; i++) {
      const z = -1.5 - rand() * 3.0
      const x = (rand() - 0.5) * 0.6
      const w = 0.05 + rand() * 0.2
      const h = 0.02 + rand() * 0.08
      const d = 0.04 + rand() * 0.15
      stern.add(m(new THREE.BoxGeometry(w, h, d), collapseMat, x, 0.02 + h / 2, z))
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SUPERSTRUCTURE WINDOWS
  // ═══════════════════════════════════════════════════════════════════════════
  const winGeoA = new THREE.PlaneGeometry(0.055, 0.045)
  const winGeoB = new THREE.PlaneGeometry(0.05, 0.04)
  const winGeoC = new THREE.PlaneGeometry(0.04, 0.035)
  for (const side of [-1, 1]) {
    const ry = side * Math.PI / 2
    // A-deck windows
    for (let i = 0; i < 36; i++) {
      const wz = 3.4 / 2 + 3.4 / 2 - 0.5 - i * 0.185
      const w = m(winGeoA, windowMat, side * 0.541, 0.15, wz)
      w.rotation.y = ry; add(w, wz)
    }
    // B-deck windows
    for (let i = 0; i < 32; i++) {
      const wz = 3.0 - i * 0.19
      const w = m(winGeoB, windowMat, side * 0.501, 0.34, wz)
      w.rotation.y = ry; add(w, wz)
    }
    // C-deck windows
    for (let i = 0; i < 26; i++) {
      const wz = 2.6 - i * 0.19
      const w = m(winGeoC, windowMat, side * 0.471, 0.51, wz)
      w.rotation.y = ry; add(w, wz)
    }
    // Boat deck windows
    for (let i = 0; i < 18; i++) {
      const wz = 2.2 - i * 0.22
      const w = m(new THREE.PlaneGeometry(0.035, 0.03), windowMat, side * 0.421, 0.66, wz)
      w.rotation.y = ry; add(w, wz)
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RAILINGS
  // ═══════════════════════════════════════════════════════════════════════════
  function addRailing(group, xOff, yBase, zStart, zEnd, count) {
    const len = zEnd - zStart
    for (const side of [-1, 1]) {
      group.add(m(new THREE.BoxGeometry(0.006, 0.006, len), railMat, side * xOff, yBase + 0.07, (zStart + zEnd) / 2))
      group.add(m(new THREE.BoxGeometry(0.004, 0.004, len), railMat, side * xOff, yBase + 0.04, (zStart + zEnd) / 2))
      const spacing = len / count
      for (let i = 0; i <= count; i++)
        group.add(m(new THREE.CylinderGeometry(0.003, 0.003, 0.08, 4), railMat, side * xOff, yBase + 0.035, zStart + i * spacing))
    }
  }

  addRailing(bow, 0.63, 0.02, BREAK_Z, 2.6, 13)
  addRailing(stern, 0.63, 0.02, -5.4, BREAK_Z, 17)
  addRailing(bow, 0.48, 0.56, BREAK_Z, 2.2, 12)
  addRailing(stern, 0.48, 0.56, -1.8, BREAK_Z, 3)
  addRailing(bow, 0.565, 0.17, 2.8, 5.3, 10)
  addRailing(stern, 0.49, 0.14, -5.4, -3.8, 6)

  // Bow railing curves around the prow
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI / 3 - Math.PI / 6
    const r = 0.35
    const z = 5.3 + Math.cos(ang) * r * 0.5
    const x = Math.sin(ang) * r
    bow.add(m(new THREE.CylinderGeometry(0.003, 0.003, 0.08, 4), railMat, x, 0.21, z))
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BRIDGE & WHEELHOUSE
  // ═══════════════════════════════════════════════════════════════════════════
  bow.add(tagged(m(new THREE.BoxGeometry(0.65, 0.22, 0.7), ghostWhite, 0, 0.82, 2.35), 'bridge'))
  // Front windows
  for (let i = 0; i < 7; i++)
    bow.add(m(new THREE.PlaneGeometry(0.05, 0.065), windowMat, -0.24 + i * 0.08, 0.85, 2.701))
  // Side windows
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const bw = m(new THREE.PlaneGeometry(0.06, 0.065), windowMat, side * 0.326, 0.85, 2.5 - i * 0.15)
      bw.rotation.y = side * Math.PI / 2; bow.add(bw)
    }
  }
  // Bridge wings
  bow.add(m(new THREE.BoxGeometry(1.25, 0.04, 0.35), fadedCream, 0, 0.72, 2.35))
  for (const side of [-1, 1])
    bow.add(m(new THREE.BoxGeometry(0.12, 0.18, 0.28), ghostWhite, side * 0.58, 0.82, 2.35))

  // Wheelhouse (above bridge)
  bow.add(m(new THREE.BoxGeometry(0.32, 0.16, 0.32), ghostWhite, 0, 0.98, 2.35))
  for (let i = 0; i < 4; i++)
    bow.add(m(new THREE.PlaneGeometry(0.045, 0.05), windowMat, -0.1 + i * 0.065, 1.0, 2.521))

  // Compass platform
  bow.add(m(new THREE.BoxGeometry(0.5, 0.06, 0.3), fadedCream, 0, 0.97, 1.85))
  bow.add(m(new THREE.CylinderGeometry(0.02, 0.02, 0.08, 6), brassLamp, 0, 1.04, 1.85))

  // Ship's wheel (in wheelhouse)
  const wheelGeo = new THREE.TorusGeometry(0.04, 0.004, 6, 16)
  const wheel = new THREE.Mesh(wheelGeo, brassLamp)
  wheel.position.set(0, 0.93, 2.4); bow.add(wheel)
  // Wheel spokes
  for (let s = 0; s < 8; s++) {
    const ang = (s / 8) * Math.PI * 2
    const spoke = m(new THREE.CylinderGeometry(0.002, 0.002, 0.04, 3), brassLamp,
      Math.cos(ang) * 0.02, 0.93 + Math.sin(ang) * 0.02, 2.4)
    spoke.rotation.z = ang; bow.add(spoke)
  }

  // Telegraph
  bow.add(m(new THREE.CylinderGeometry(0.008, 0.01, 0.06, 6), brassLamp, 0.15, 0.9, 2.4))
  bow.add(m(new THREE.BoxGeometry(0.025, 0.008, 0.004), brassLamp, 0.15, 0.935, 2.4))

  // Marconi room (behind wheelhouse)
  bow.add(m(new THREE.BoxGeometry(0.35, 0.14, 0.3), ghostWhite, 0, 0.78, 2.0))
  for (const side of [-1, 1]) {
    const mw = m(new THREE.PlaneGeometry(0.04, 0.04), windowMat, side * 0.176, 0.8, 2.0)
    mw.rotation.y = side * Math.PI / 2; bow.add(mw)
  }
  // Marconi aerial wires
  bow.add(m(new THREE.CylinderGeometry(0.003, 0.003, 0.25, 4), mastMat, 0, 0.92, 2.0))

  // ═══════════════════════════════════════════════════════════════════════════
  // GRAND STAIRCASE DOME
  // ═══════════════════════════════════════════════════════════════════════════
  const domeGeo = new THREE.SphereGeometry(0.2, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2)
  bow.add(tagged(m(domeGeo, glassMat, 0, 0.72, 1.9), 'grandStaircase'))
  // Dome ribs
  for (let a = 0; a < 12; a++) {
    const ang = (a / 12) * Math.PI * 2
    const ribPts = []
    for (let t = 0; t <= 12; t++) {
      const phi = (t / 12) * Math.PI / 2
      ribPts.push(new THREE.Vector3(
        Math.cos(ang) * Math.sin(phi) * 0.202,
        Math.cos(phi) * 0.202,
        Math.sin(ang) * Math.sin(phi) * 0.202
      ))
    }
    const rib = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ribPts),
      new THREE.LineBasicMaterial({ color: 0x665530 }))
    rib.position.set(0, 0.52, 1.9)
    bow.add(rib)
  }
  // Dome base ring
  const domeBase = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.008, 6, 20), metalMat)
  domeBase.position.set(0, 0.72, 1.9); domeBase.rotation.x = Math.PI / 2; bow.add(domeBase)

  // Grand staircase opening (the famous hole)
  bow.add(m(new THREE.RingGeometry(0.02, 0.19, 16), blackened, 0, 0.72, 1.9))

  // ═══════════════════════════════════════════════════════════════════════════
  // FUNNELS — bases remain on ship, funnels fell
  // We show stubs/bases and guy-wire anchors
  // ═══════════════════════════════════════════════════════════════════════════
  const funnelZ = [2.6, 1.2, -0.2, -1.6]
  funnelZ.forEach((fz, idx) => {
    const group = fz >= BREAK_Z ? bow : stern
    const fg = new THREE.Group()
    fg.position.set(0, 0.72, fz)
    fg.rotation.x = -0.065

    // Main body
    const body = new THREE.CylinderGeometry(0.125, 0.15, 1.25, 20)
    body.scale(1, 1, 0.82)
    const bodyMesh = new THREE.Mesh(body, fadedBuff)
    if (idx === 0) tagged(bodyMesh, 'funnels')
    fg.add(bodyMesh)

    // Black top
    const topGeo = new THREE.CylinderGeometry(0.13, 0.125, 0.3, 20)
    topGeo.scale(1, 1, 0.82)
    const topMesh = new THREE.Mesh(topGeo, blackened)
    topMesh.position.y = 0.72
    fg.add(topMesh)

    // Cowl
    const cowlGeo = new THREE.CylinderGeometry(0.148, 0.13, 0.06, 20)
    cowlGeo.scale(1, 1, 0.82)
    const cowlMesh = new THREE.Mesh(cowlGeo, blackened)
    cowlMesh.position.y = 0.9
    fg.add(cowlMesh)

    // Steam pipe
    fg.add(m(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 10), metalMat, 0, 0.94, 0))
    // Whistle pipes
    fg.add(m(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 4), metalMat, 0.04, 0.95, 0))
    fg.add(m(new THREE.CylinderGeometry(0.008, 0.008, 0.08, 4), metalMat, -0.04, 0.93, 0))

    // Base ring
    const baseGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.06, 20)
    baseGeo.scale(1, 1, 0.82)
    fg.add(new THREE.Mesh(baseGeo, darkRust))

    // Guy wires (stays)
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2
      fg.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0.7, 0),
        new THREE.Vector3(Math.cos(ang) * 0.55, -0.65, Math.sin(ang) * 0.45)
      ]), wireMat))
    }

    // Ladder rungs
    for (let r = 0; r < 10; r++)
      fg.add(m(new THREE.BoxGeometry(0.06, 0.003, 0.003), metalMat, 0, -0.4 + r * 0.15, -0.12))
    // Ladder rails
    fg.add(m(new THREE.BoxGeometry(0.003, 1.5, 0.003), metalMat, -0.025, 0.04, -0.12))
    fg.add(m(new THREE.BoxGeometry(0.003, 1.5, 0.003), metalMat, 0.025, 0.04, -0.12))

    // Funnel band (white/orange identification band)
    if (idx < 4) {
      const bandGeo = new THREE.CylinderGeometry(0.127, 0.14, 0.08, 20)
      bandGeo.scale(1, 1, 0.82)
      const bandMat = new THREE.MeshStandardMaterial({ color: 0x3a2a10, roughness: 0.8, metalness: 0.08 })
      const band = new THREE.Mesh(bandGeo, bandMat)
      band.position.y = 0.15
      fg.add(band)
    }

    group.add(fg)
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // MASTS
  // ═══════════════════════════════════════════════════════════════════════════

  // Foremast (bow) — with crow's nest
  bow.add(m(new THREE.CylinderGeometry(0.02, 0.028, 3.0, 8), mastMat, 0, 1.7, 3.8))

  // Crow's nest — the lookout platform
  bow.add(m(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 12), metalMat, 0, 2.3, 3.8))
  const cnRail = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.005, 6, 12), metalMat)
  cnRail.position.set(0, 2.37, 3.8); cnRail.rotation.x = Math.PI / 2; bow.add(cnRail)
  bow.add(m(new THREE.CircleGeometry(0.058, 12), metalMat, 0, 2.27, 3.8))
  // Crow's nest inner wall
  bow.add(m(new THREE.CylinderGeometry(0.055, 0.055, 0.12, 12, 1, true), metalMat, 0, 2.33, 3.8))
  // Telephone box in crow's nest
  bow.add(m(new THREE.BoxGeometry(0.015, 0.04, 0.012), metalMat, 0.04, 2.34, 3.8))
  // Bell
  bow.add(m(new THREE.CylinderGeometry(0.005, 0.008, 0.015, 6), brassLamp, -0.04, 2.35, 3.82))

  // Yards (crossbars)
  for (const y of [2.6, 2.8]) {
    const yd = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.8, 4), mastMat)
    yd.rotation.z = Math.PI / 2; yd.position.set(0, y, 3.8); bow.add(yd)
  }
  // Topmast
  bow.add(m(new THREE.CylinderGeometry(0.008, 0.014, 0.8, 6), mastMat, 0, 3.5, 3.8))
  bow.add(m(new THREE.SphereGeometry(0.012, 6, 6), brassLamp, 0, 3.15, 3.8))
  // Masthead light
  bow.add(m(new THREE.SphereGeometry(0.008, 6, 6), brassLamp, 0, 3.9, 3.8))

  // Mainmast (stern)
  stern.add(m(new THREE.CylinderGeometry(0.018, 0.026, 2.6, 8), mastMat, 0, 1.5, -3.1))
  const myrd = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.65, 4), mastMat)
  myrd.rotation.z = Math.PI / 2; myrd.position.set(0, 2.5, -3.1); stern.add(myrd)
  stern.add(m(new THREE.CylinderGeometry(0.006, 0.012, 0.7, 6), mastMat, 0, 3.1, -3.1))
  stern.add(m(new THREE.SphereGeometry(0.01, 6, 6), brassLamp, 0, 2.85, -3.1))
  // Gaff (diagonal boom)
  const gaff = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.006, 0.5, 4), mastMat)
  gaff.position.set(0, 2.6, -3.1); gaff.rotation.z = Math.PI / 4; stern.add(gaff)

  // ═══════════════════════════════════════════════════════════════════════════
  // CARGO CRANES / DERRICKS
  // ═══════════════════════════════════════════════════════════════════════════
  for (const side of [-1, 1]) {
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.01, 1.4, 6), mastMat)
    boom.position.set(side * 0.15, 1.0, 3.2)
    boom.rotation.z = side * 0.6; boom.rotation.x = -0.3
    bow.add(boom)
    // Winch at base
    bow.add(m(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 6), metalMat, side * 0.2, 0.22, 3.4))
  }
  for (const side of [-1, 1]) {
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.01, 1.2, 6), mastMat)
    boom.position.set(side * 0.15, 0.9, -3.6)
    boom.rotation.z = side * 0.5; boom.rotation.x = 0.3
    stern.add(boom)
    stern.add(m(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 6), metalMat, side * 0.2, 0.05, -3.4))
  }

  // Cargo hatches
  bow.add(m(new THREE.BoxGeometry(0.35, 0.04, 0.4), sediment, 0, 0.05, 3.0))
  bow.add(m(new THREE.BoxGeometry(0.3, 0.005, 0.35), metalMat, 0, 0.075, 3.0))  // hatch cover
  stern.add(m(new THREE.BoxGeometry(0.35, 0.04, 0.35), sediment, 0, 0.05, -3.8))
  stern.add(m(new THREE.BoxGeometry(0.3, 0.005, 0.3), metalMat, 0, 0.075, -3.8))

  // Additional forward cargo hatch
  bow.add(m(new THREE.BoxGeometry(0.3, 0.04, 0.35), sediment, 0, 0.05, 3.5))

  // ═══════════════════════════════════════════════════════════════════════════
  // LIFEBOATS + DAVITS
  // ═══════════════════════════════════════════════════════════════════════════
  for (let i = 0; i < 8; i++) {
    for (const side of [-1, 1]) {
      const bz = 2.2 - i * 0.52
      const group = bz >= BREAK_Z ? bow : stern

      const boat = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.1, 4, 8), boatMat)
      boat.rotation.x = Math.PI / 2
      boat.position.set(side * 0.5, 0.67, bz)
      group.add(boat)

      // Gunwale
      group.add(m(new THREE.BoxGeometry(0.005, 0.005, 0.12), railMat, side * 0.5, 0.685, bz))

      // Thwarts (seats)
      for (let t = -1; t <= 1; t++)
        group.add(m(new THREE.BoxGeometry(0.03, 0.002, 0.004), boatMat, side * 0.5, 0.67, bz + t * 0.03))

      // Davit
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(side * 0.07, 0.14, 0),
        new THREE.Vector3(side * 0.09, 0.04, 0)
      )
      const davit = new THREE.Mesh(new THREE.TubeGeometry(curve, 8, 0.006, 5, false), metalMat)
      davit.position.set(side * 0.44, 0.62, bz)
      group.add(davit)

      // Davit rope/fall
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(side * (0.44 + side * 0.09), 0.66, bz),
        new THREE.Vector3(side * 0.5, 0.685, bz)
      ]), wireMat))
    }
  }

  // Collapsible boats (on boat deck roof)
  for (const side of [-1, 1]) {
    for (const z of [2.3, 2.1]) {
      const cb = m(new THREE.BoxGeometry(0.06, 0.012, 0.08), boatMat, side * 0.35, 0.72, z)
      bow.add(cb)
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VENTILATORS
  // ═══════════════════════════════════════════════════════════════════════════
  const ventPos = [
    [0.22, 3.3], [-0.22, 3.3], [0.25, 2.8], [-0.25, 2.8],
    [0.3, 1.6], [-0.3, 1.6], [0.3, 0.8], [-0.3, 0.8],
    [0.2, -2.5], [-0.2, -2.5], [0.2, -3.0], [-0.2, -3.0],
    [0.15, -3.8], [-0.15, -3.8], [0.25, -0.6], [-0.25, -0.6],
    [0.15, 0.3], [-0.15, 0.3], [0.35, 1.0], [-0.35, 1.0],
  ]
  ventPos.forEach(([x, z]) => {
    const group = z >= BREAK_Z ? bow : stern
    group.add(m(new THREE.CylinderGeometry(0.024, 0.02, 0.14, 8), ventMat, x, 0.09, z))
    group.add(m(new THREE.SphereGeometry(0.03, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), ventMat, x, 0.17, z))
    group.add(m(new THREE.CircleGeometry(0.022, 8), blackened, x, 0.165, z + 0.025))
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // BOW DETAIL
  // ═══════════════════════════════════════════════════════════════════════════

  // Anchor windlass
  bow.add(m(new THREE.CylinderGeometry(0.04, 0.04, 0.38, 10), metalMat, 0, 0.24, 4.8))
  bow.add(m(new THREE.BoxGeometry(0.4, 0.06, 0.08), metalMat, 0, 0.2, 4.8))
  // Windlass drum detail
  bow.add(m(new THREE.CylinderGeometry(0.045, 0.045, 0.06, 10), metalMat, 0, 0.24, 4.75))
  bow.add(m(new THREE.CylinderGeometry(0.045, 0.045, 0.06, 10), metalMat, 0, 0.24, 4.85))

  // Capstans (mooring winches)
  for (const x of [-0.28, 0.28])
    bow.add(m(new THREE.CylinderGeometry(0.038, 0.044, 0.08, 10), metalMat, x, 0.22, 4.5))
  // Additional capstans near well deck
  for (const x of [-0.3, 0.3])
    bow.add(m(new THREE.CylinderGeometry(0.03, 0.036, 0.06, 8), metalMat, x, 0.06, 2.7))

  // Anchor chains
  for (const side of [-0.38, 0.38]) {
    const chainDeck = m(new THREE.CylinderGeometry(0.008, 0.008, 0.5, 4), metalMat, side * 0.7, 0.18, 4.9)
    chainDeck.rotation.z = Math.PI / 2 * 0.3; bow.add(chainDeck)
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.6, 4), metalMat)
    chain.position.set(side, -0.1, 5.15); chain.rotation.x = 0.7; bow.add(chain)
  }

  // Anchors (port and starboard)
  for (const side of [-1, 1]) {
    const anchorGroup = new THREE.Group()
    // Shank
    anchorGroup.add(m(new THREE.BoxGeometry(0.015, 0.12, 0.008), metalMat, 0, -0.06, 0))
    // Crown
    anchorGroup.add(m(new THREE.BoxGeometry(0.06, 0.01, 0.008), metalMat, 0, -0.12, 0))
    // Flukes
    const fluke1 = m(new THREE.BoxGeometry(0.03, 0.04, 0.006), metalMat, -0.025, -0.14, 0)
    fluke1.rotation.z = 0.3; anchorGroup.add(fluke1)
    const fluke2 = m(new THREE.BoxGeometry(0.03, 0.04, 0.006), metalMat, 0.025, -0.14, 0)
    fluke2.rotation.z = -0.3; anchorGroup.add(fluke2)
    // Ring at top
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.003, 4, 8), metalMat)
    ring.position.set(0, 0.01, 0); anchorGroup.add(ring)
    anchorGroup.position.set(side * 0.62, 0.1, 5.2)
    anchorGroup.rotation.y = side * 0.2
    bow.add(anchorGroup)
  }
  // Center anchor (Titanic had a massive center anchor)
  const centerAnchor = new THREE.Group()
  centerAnchor.add(m(new THREE.BoxGeometry(0.02, 0.15, 0.01), metalMat, 0, -0.075, 0))
  centerAnchor.add(m(new THREE.BoxGeometry(0.08, 0.012, 0.01), metalMat, 0, -0.15, 0))
  centerAnchor.position.set(0, 0.08, 5.6)
  bow.add(centerAnchor)

  // Bollards
  for (const x of [-0.35, 0.35, -0.2, 0.2])
    bow.add(m(new THREE.CylinderGeometry(0.015, 0.018, 0.04, 6), metalMat, x, 0.2, 5.0))
  // Additional bollards on forecastle
  for (const x of [-0.4, 0.4])
    bow.add(m(new THREE.CylinderGeometry(0.012, 0.015, 0.035, 6), metalMat, x, 0.2, 4.3))

  // Jackstaff (flagpole at bow)
  bow.add(m(new THREE.CylinderGeometry(0.004, 0.006, 0.5, 4), mastMat, 0, 0.5, 5.5))

  // Fairleads (chock fittings for mooring lines)
  for (const side of [-1, 1]) {
    bow.add(m(new THREE.BoxGeometry(0.03, 0.02, 0.01), metalMat, side * 0.55, 0.2, 4.6))
    bow.add(m(new THREE.BoxGeometry(0.03, 0.02, 0.01), metalMat, side * 0.55, 0.2, 5.1))
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STERN DETAIL
  // ═══════════════════════════════════════════════════════════════════════════

  // Stern counter plate
  stern.add(m(new THREE.BoxGeometry(0.65, 0.7, 0.06), darkRust, 0, -0.2, -5.88))
  // Name plate area ("TITANIC" / "LIVERPOOL")
  stern.add(m(new THREE.BoxGeometry(0.4, 0.08, 0.01), blackened, 0, 0.02, -5.92))
  // Letters would be here — suggest with small raised blocks
  for (let i = 0; i < 7; i++)
    stern.add(m(new THREE.BoxGeometry(0.025, 0.035, 0.005), metalMat, -0.09 + i * 0.03, 0.02, -5.93))
  // "LIVERPOOL" below
  for (let i = 0; i < 9; i++)
    stern.add(m(new THREE.BoxGeometry(0.018, 0.022, 0.004), metalMat, -0.08 + i * 0.02, -0.04, -5.93))

  // Docking bridge (stern navigation)
  stern.add(m(new THREE.BoxGeometry(0.5, 0.12, 0.3), ghostWhite, 0, 0.28, -4.3))
  for (let i = 0; i < 4; i++)
    stern.add(m(new THREE.PlaneGeometry(0.06, 0.04), windowMat, -0.12 + i * 0.08, 0.3, -5.88))

  // Ensign staff (flag pole at stern)
  stern.add(m(new THREE.CylinderGeometry(0.004, 0.006, 0.4, 4), mastMat, 0, 0.38, -5.7))
  // Taffrail (stern rail)
  stern.add(m(new THREE.BoxGeometry(0.5, 0.006, 0.006), railMat, 0, 0.23, -5.85))

  // ── Propellers ──
  function makePropBlade(r, twist) {
    // More realistic curved blade shape
    const shape = new THREE.Shape()
    shape.moveTo(0, -0.008)
    shape.quadraticCurveTo(r * 0.3, -0.015, r * 0.5, -0.012)
    shape.quadraticCurveTo(r * 0.8, -0.006, r, 0)
    shape.quadraticCurveTo(r * 0.8, 0.006, r * 0.5, 0.012)
    shape.quadraticCurveTo(r * 0.3, 0.015, 0, 0.008)
    const geo = new THREE.ShapeGeometry(shape, 4)
    return geo
  }

  function makeProp(px, pz, blades, r) {
    const g = new THREE.Group()
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), propMat))
    for (let b = 0; b < blades; b++) {
      const a = (b / blades) * Math.PI * 2
      const blade = new THREE.Mesh(makePropBlade(r, 0.2), propMat)
      blade.rotation.z = a
      blade.rotation.y = 0.25
      g.add(blade)
    }
    // Hub boss
    g.add(m(new THREE.CylinderGeometry(0.02, 0.03, 0.04, 8), propMat, 0, 0, 0.02))
    g.position.set(px, -0.82, pz)
    g.rotation.y = Math.PI / 2
    return g
  }

  stern.add(makeProp(-0.28, -5.65, 3, 0.24))
  stern.add(makeProp(0.28, -5.65, 3, 0.24))
  stern.add(makeProp(0, -5.5, 4, 0.2))

  // Propeller shafts
  for (const px of [-0.28, 0.28])
    stern.add(m(new THREE.CylinderGeometry(0.015, 0.015, 1.0, 6), metalMat, px, -0.75, -5.2))
  stern.add(m(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 6), metalMat, 0, -0.72, -5.2))

  // Shaft brackets (A-frames supporting shafts)
  for (const px of [-0.28, 0.28]) {
    stern.add(m(new THREE.BoxGeometry(0.008, 0.15, 0.06), metalMat, px, -0.65, -5.0))
    stern.add(m(new THREE.BoxGeometry(0.008, 0.15, 0.06), metalMat, px, -0.65, -5.4))
    // Horizontal strut
    stern.add(m(new THREE.BoxGeometry(0.008, 0.008, 0.4), metalMat, px, -0.58, -5.2))
  }

  // Rudder — larger, more detailed
  const rudderGroup = new THREE.Group()
  rudderGroup.add(m(new THREE.BoxGeometry(0.015, 0.45, 0.25),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.2, roughness: 0.8 }), 0, 0, 0))
  // Rudder post
  rudderGroup.add(m(new THREE.CylinderGeometry(0.01, 0.01, 0.5, 6), metalMat, 0, 0, 0.12))
  // Rudder horn
  rudderGroup.add(m(new THREE.BoxGeometry(0.01, 0.08, 0.12), metalMat, 0, -0.2, 0.06))
  rudderGroup.position.set(0, -0.62, -5.82)
  stern.add(rudderGroup)

  // Stern bollards
  for (const x of [-0.3, 0.3])
    stern.add(m(new THREE.CylinderGeometry(0.015, 0.018, 0.04, 6), metalMat, x, 0.18, -5.2))
  stern.add(m(new THREE.BoxGeometry(0.65, 0.14, 0.35), fadedCream, 0, 0.2, -4.0))

  // ═══════════════════════════════════════════════════════════════════════════
  // RIGGING
  // ═══════════════════════════════════════════════════════════════════════════
  // Foremast stays
  bow.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 3.1, 3.8), new THREE.Vector3(0, 0.25, 5.5)]), wireMat))
  bow.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 3.1, 3.8), new THREE.Vector3(0, 0.72, 2.6)]), wireMat))
  // Mainmast stays
  stern.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 2.8, -3.1), new THREE.Vector3(0, 0.15, -5.5)]), wireMat))
  stern.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 2.8, -3.1), new THREE.Vector3(0, 0.72, -1.6)]), wireMat))
  // Shrouds (side stays)
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      bow.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 2.6 - i * 0.25, 3.8),
        new THREE.Vector3(side * 0.55, 0.18, 3.8 + (i - 1.5) * 0.15)
      ]), wireMat))
      stern.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 2.4 - i * 0.25, -3.1),
        new THREE.Vector3(side * 0.5, 0.12, -3.1 + (i - 1.5) * 0.15)
      ]), wireMat))
    }
  }
  // Aerial wires (Marconi antenna between masts)
  for (const dy of [0, 0.1]) {
    bow.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 3.2 + dy, 3.8),
      new THREE.Vector3(0, 2.0 + dy, BREAK_Z)
    ]), wireMat))
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DECK FEATURES
  // ═══════════════════════════════════════════════════════════════════════════

  // Skylights
  for (const z of [1.9, 0.5]) {
    bow.add(m(new THREE.BoxGeometry(0.42, 0.1, 0.28), fadedCream, 0, 0.62, z))
    bow.add(m(new THREE.BoxGeometry(0.36, 0.005, 0.22), glassMat, 0, 0.68, z))
    // Skylight ridge
    bow.add(m(new THREE.BoxGeometry(0.008, 0.02, 0.22), metalMat, 0, 0.69, z))
  }

  // Officers' quarters (bow)
  bow.add(m(new THREE.BoxGeometry(0.5, 0.12, 0.6), ghostWhite, 0, 0.78, 1.5))
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const ow = m(new THREE.PlaneGeometry(0.06, 0.04), windowMat, side * 0.251, 0.8, 1.65 - i * 0.15)
      ow.rotation.y = side * Math.PI / 2; bow.add(ow)
    }
  }

  // Gymnasium (boat deck, starboard side)
  bow.add(m(new THREE.BoxGeometry(0.3, 0.12, 0.35), ghostWhite, 0.2, 0.64, 0.2))
  // Gym windows
  for (let i = 0; i < 3; i++) {
    const gw = m(new THREE.PlaneGeometry(0.06, 0.04), windowMat, 0.351, 0.66, 0.3 - i * 0.1)
    gw.rotation.y = Math.PI / 2; bow.add(gw)
  }

  // Smoking room (aft, near break)
  bow.add(m(new THREE.BoxGeometry(0.5, 0.12, 0.4), ghostWhite, 0, 0.64, -0.6))
  for (const side of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const sw = m(new THREE.PlaneGeometry(0.06, 0.04), windowMat, side * 0.251, 0.66, -0.5 - i * 0.12)
      sw.rotation.y = side * Math.PI / 2; bow.add(sw)
    }
  }

  // Deck benches
  for (let i = 0; i < 6; i++) {
    const bz = 1.8 - i * 0.5
    const group = bz >= BREAK_Z ? bow : stern
    for (const x of [-0.3, 0.3]) {
      group.add(m(new THREE.BoxGeometry(0.06, 0.025, 0.025), teakDeck, x, 0.585, bz))
      // Bench legs
      group.add(m(new THREE.BoxGeometry(0.004, 0.02, 0.004), metalMat, x - 0.025, 0.57, bz))
      group.add(m(new THREE.BoxGeometry(0.004, 0.02, 0.004), metalMat, x + 0.025, 0.57, bz))
    }
  }

  // Deck chairs (scattered/fallen)
  {
    const chairMat = new THREE.MeshStandardMaterial({ color: 0x2a2218, roughness: 0.95 })
    const rand = rng(777)
    for (let i = 0; i < 8; i++) {
      const z = 2.0 - rand() * 3.5
      const group = z >= BREAK_Z ? bow : stern
      const x = (rand() - 0.5) * 0.6
      const chair = m(new THREE.BoxGeometry(0.025, 0.004, 0.06), chairMat, x, 0.575, z)
      chair.rotation.y = rand() * Math.PI
      chair.rotation.x = (rand() - 0.5) * 0.3
      group.add(chair)
    }
  }

  // Companionways (deck hatches/stairs)
  for (const z of [2.4, 0.8, -0.4]) {
    const group = z >= BREAK_Z ? bow : stern
    group.add(m(new THREE.BoxGeometry(0.15, 0.06, 0.1), ghostWhite, 0.35, 0.05, z))
    group.add(m(new THREE.BoxGeometry(0.12, 0.005, 0.08), metalMat, 0.35, 0.085, z))
  }

  // Ventilation cowls (larger type)
  for (const [x, z] of [[0.35, 1.8], [-0.35, 1.3], [0.3, -0.2], [-0.3, -1.0]]) {
    const group = z >= BREAK_Z ? bow : stern
    group.add(m(new THREE.CylinderGeometry(0.035, 0.03, 0.2, 8), ventMat, x, 0.12, z))
    // Cowl top (elbow)
    const cowl = m(new THREE.SphereGeometry(0.04, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2), ventMat, x, 0.23, z)
    group.add(cowl)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DEBRIS FIELD
  // ═══════════════════════════════════════════════════════════════════════════
  const debris = createDebrisField()
  // Tag debris group for click targeting
  debris.userData.feature = FEATURES.debrisField
  debris.userData.featureKey = 'debrisField'

  return { bow, stern, debris, clickTargets, features: FEATURES, labelAnchors: LABEL_ANCHORS }
}
