import * as THREE from 'three'

/**
 * Procedural RMS Titanic wreck — split into bow and stern sections.
 * The ship broke between the 3rd and 4th funnels (z ≈ -0.9 in model space).
 * Returns { bow: THREE.Group, stern: THREE.Group }
 */

const BREAK_Z = -0.9 // break point between 3rd and 4th funnels

function smoothstep(a, b, t) {
  const x = Math.max(0, Math.min(1, (t - a) / (b - a)))
  return x * x * (3 - 2 * x)
}

function m(geo, mat, x, y, z) {
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.set(x, y, z)
  return mesh
}

// Hull width factor at t (0=stern, 1=bow)
function beamW(t) {
  if (t < 0.08) return 0.55 + 0.45 * smoothstep(0, 0.08, t)
  if (t > 0.55) { const bt = (t - 0.55) / 0.45; return Math.max(1.0 - bt * bt, 0.01) }
  return 1.0
}

function createHullSection(zMin, zMax) {
  const L = 12, halfW = 0.7, D = 1.0
  const segs = 80, rings = 24
  const v = [], idx = []

  // Only generate segments within [zMin, zMax]
  const segList = []
  for (let i = 0; i <= segs; i++) {
    const t = i / segs
    const z = (t - 0.5) * L
    if (z >= zMin && z <= zMax) segList.push({ t, z })
  }
  // Add boundary segments if needed
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
      const sinA = Math.sin(angle)
      const cosA = Math.cos(angle)
      const x = sinA * halfW * w
      let y = -cosA * D - vShape * (1 - Math.abs(sinA)) * 0.3
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

// Hull surface x at given y and z
function hullW(z) {
  const t = z / 12 + 0.5
  return beamW(t)
}
function hullX(y, z) {
  const w = hullW(z)
  const cosA = Math.min(1, -y / 1.0)
  return Math.sqrt(Math.max(0, 1 - cosA * cosA)) * 0.7 * w
}

// Jagged torn-metal edge at the break point
function addBreakEdge(group, zPos, mat, facing) {
  const rng = (s) => { let v = s; return () => { v = (v * 16807) % 2147483647; return v / 2147483647 } }
  const rand = rng(facing === 'bow' ? 99 : 77)
  const tornMat = new THREE.MeshStandardMaterial({
    color: 0x4a2a10, roughness: 0.95, metalness: 0.1, side: THREE.DoubleSide
  })

  // Jagged plates hanging/protruding at break
  for (let i = 0; i < 14; i++) {
    const x = (rand() - 0.5) * 1.2
    const y = -rand() * 0.8
    const w = 0.04 + rand() * 0.1
    const h = 0.05 + rand() * 0.15
    const plate = m(new THREE.BoxGeometry(w, h, 0.008), tornMat, x, y, zPos)
    plate.rotation.x = (rand() - 0.5) * 0.8
    plate.rotation.z = (rand() - 0.5) * 0.4
    group.add(plate)
  }

  // Exposed deck edges (cross-section of deck plates)
  const deckYs = [0.02, 0.13, 0.32, 0.49, 0.64]
  deckYs.forEach(dy => {
    group.add(m(new THREE.BoxGeometry(1.0, 0.02, 0.01), mat, 0, dy, zPos))
  })
}

export function createTitanicModel() {
  const bow = new THREE.Group()
  const stern = new THREE.Group()

  // ── Shared Materials ──
  const rustHull    = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.85, metalness: 0.15, side: THREE.DoubleSide })
  const darkRust    = new THREE.MeshStandardMaterial({ color: 0x6b3410, roughness: 0.9, metalness: 0.1 })
  const redBottom   = new THREE.MeshStandardMaterial({ color: 0x6a2020, roughness: 0.85, side: THREE.DoubleSide })
  const sediment    = new THREE.MeshStandardMaterial({ color: 0x5a4838, roughness: 0.9 })
  const ghostWhite  = new THREE.MeshStandardMaterial({ color: 0x9a9080, roughness: 0.8 })
  const fadedCream  = new THREE.MeshStandardMaterial({ color: 0x8a7a62, roughness: 0.85 })
  const fadedBuff   = new THREE.MeshStandardMaterial({ color: 0xb07830, roughness: 0.65, metalness: 0.15 })
  const blackened   = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.75 })
  const metalMat    = new THREE.MeshStandardMaterial({ color: 0x5a5a50, metalness: 0.45, roughness: 0.65 })
  const windowMat   = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.3, metalness: 0.2 })
  const propMat     = new THREE.MeshStandardMaterial({ color: 0x8a7a3a, roughness: 0.55, metalness: 0.5 })
  const railMat     = new THREE.MeshStandardMaterial({ color: 0x3a3830, metalness: 0.35, roughness: 0.8 })
  const glassMat    = new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.2, metalness: 0.3, transparent: true, opacity: 0.6 })
  const wireMat     = new THREE.LineBasicMaterial({ color: 0x444440, transparent: true, opacity: 0.5 })
  const mastMat     = new THREE.MeshStandardMaterial({ color: 0x3a2e18, roughness: 0.85 })
  const boatMat     = new THREE.MeshStandardMaterial({ color: 0x5a5040, roughness: 0.8 })
  const ventMat     = new THREE.MeshStandardMaterial({ color: 0x4a4238, roughness: 0.85 })
  const teakDeck    = new THREE.MeshStandardMaterial({ color: 0x5a4a30, roughness: 0.9 })
  const brassLamp   = new THREE.MeshStandardMaterial({ color: 0x887740, roughness: 0.4, metalness: 0.6 })

  // Helper: add to bow or stern based on z position
  function add(mesh, z) {
    if (z === undefined) z = mesh.position.z
    ;(z >= BREAK_Z ? bow : stern).add(mesh)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HULLS (split at break)
  // ═══════════════════════════════════════════════════════════════════════════
  bow.add(new THREE.Mesh(createHullSection(BREAK_Z, 6), rustHull))
  stern.add(new THREE.Mesh(createHullSection(-6, BREAK_Z), rustHull))

  // Red anti-fouling bottom
  const redBow = new THREE.Mesh(createHullSection(BREAK_Z, 6), redBottom)
  redBow.scale.set(1.003, 0.6, 1.001); redBow.position.y = -0.4
  bow.add(redBow)
  const redStern = new THREE.Mesh(createHullSection(-6, BREAK_Z), redBottom)
  redStern.scale.set(1.003, 0.6, 1.001); redStern.position.y = -0.4
  stern.add(redStern)

  // Torn edges at break point
  addBreakEdge(bow, BREAK_Z, darkRust, 'bow')
  addBreakEdge(stern, BREAK_Z, darkRust, 'stern')

  // Bow stem
  bow.add(m(new THREE.BoxGeometry(0.02, 0.8, 0.02), darkRust, 0, 0.1, 5.9))

  // ═══════════════════════════════════════════════════════════════════════════
  // HULL PORTHOLES
  // ═══════════════════════════════════════════════════════════════════════════
  const portGeo = new THREE.CircleGeometry(0.018, 8)
  const portRimGeo = new THREE.RingGeometry(0.016, 0.022, 8)
  for (const side of [-1, 1]) {
    const ry = side * Math.PI / 2
    for (let i = 0; i < 44; i++) {
      const pz = 4.5 - i * 0.22
      const hx = hullX(-0.15, pz)
      if (hx < 0.15) continue
      const pw = m(portGeo, windowMat, side * (hx - 0.002), -0.15, pz)
      pw.rotation.y = ry; add(pw, pz)
      const pr = m(portRimGeo, metalMat, side * (hx - 0.001), -0.15, pz)
      pr.rotation.y = ry; add(pr, pz)
    }
    for (let i = 0; i < 38; i++) {
      const pz = 4.0 - i * 0.24
      const hx = hullX(-0.38, pz)
      if (hx < 0.15) continue
      const pw = m(portGeo, windowMat, side * (hx - 0.002), -0.38, pz)
      pw.rotation.y = ry; add(pw, pz)
      const pr = m(portRimGeo, metalMat, side * (hx - 0.001), -0.38, pz)
      pr.rotation.y = ry; add(pr, pz)
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DECKS (split at break)
  // ═══════════════════════════════════════════════════════════════════════════

  // Bow main deck: from break to forward
  const bowDeckLen = 5.9 - BREAK_Z
  bow.add(m(new THREE.BoxGeometry(1.3, 0.035, bowDeckLen), teakDeck, 0, 0.02, (5.9 + BREAK_Z) / 2))
  // Stern main deck
  const sternDeckLen = BREAK_Z - (-5.9)
  stern.add(m(new THREE.BoxGeometry(1.3, 0.035, sternDeckLen), teakDeck, 0, 0.02, (BREAK_Z + -5.9) / 2))

  // Forecastle deck (bow)
  bow.add(m(new THREE.BoxGeometry(1.15, 0.15, 2.6), darkRust, 0, 0.1, 4.1))
  for (const side of [-1, 1])
    bow.add(m(new THREE.BoxGeometry(0.025, 0.12, 2.6), darkRust, side * 0.565, 0.24, 4.1))

  // Well deck (bow)
  bow.add(m(new THREE.BoxGeometry(1.1, 0.04, 0.8), teakDeck, 0, 0.02, 2.6))

  // Poop deck (stern)
  stern.add(m(new THREE.BoxGeometry(1.0, 0.14, 1.6), darkRust, 0, 0.09, -4.65))
  for (const side of [-1, 1])
    stern.add(m(new THREE.BoxGeometry(0.02, 0.1, 1.6), darkRust, side * 0.49, 0.21, -4.65))

  // ═══════════════════════════════════════════════════════════════════════════
  // SUPERSTRUCTURE (split at break)
  // ═══════════════════════════════════════════════════════════════════════════

  // A-deck: bow section (break to forward end)
  const aFwd = 3.4, aBrk = BREAK_Z
  bow.add(m(new THREE.BoxGeometry(1.08, 0.2, aFwd - aBrk), ghostWhite, 0, 0.13, (aFwd + aBrk) / 2))
  // A-deck: stern section
  const aAft = -3.8
  stern.add(m(new THREE.BoxGeometry(1.08, 0.2, aBrk - aAft), ghostWhite, 0, 0.13, (aBrk + aAft) / 2))

  // B-deck split
  bow.add(m(new THREE.BoxGeometry(1.0, 0.18, 3.15 - aBrk), fadedCream, 0, 0.32, (3.15 + aBrk) / 2))
  stern.add(m(new THREE.BoxGeometry(1.0, 0.18, aBrk - (-3.25)), fadedCream, 0, 0.32, (aBrk + -3.25) / 2))

  // C-deck split
  bow.add(m(new THREE.BoxGeometry(0.94, 0.16, 2.85 - aBrk), ghostWhite, 0, 0.49, (2.85 + aBrk) / 2))
  stern.add(m(new THREE.BoxGeometry(0.94, 0.16, aBrk - (-2.75)), ghostWhite, 0, 0.49, (aBrk + -2.75) / 2))

  // Boat deck split
  bow.add(m(new THREE.BoxGeometry(0.84, 0.14, 2.4 - aBrk), fadedCream, 0, 0.64, (2.4 + aBrk) / 2))
  stern.add(m(new THREE.BoxGeometry(0.84, 0.14, aBrk - (-1.8)), fadedCream, 0, 0.64, (aBrk + -1.8) / 2))

  // Promenade deck (bow section only — mostly forward)
  for (const side of [-1, 1]) {
    bow.add(m(new THREE.BoxGeometry(0.015, 0.14, 2.0), glassMat, side * 0.465, 0.49, 1.5))
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SUPERSTRUCTURE WINDOWS (split at break)
  // ═══════════════════════════════════════════════════════════════════════════
  const winGeoA = new THREE.PlaneGeometry(0.055, 0.045)
  const winGeoB = new THREE.PlaneGeometry(0.05, 0.04)
  const winGeoC = new THREE.PlaneGeometry(0.04, 0.035)
  for (const side of [-1, 1]) {
    const ry = side * Math.PI / 2
    for (let i = 0; i < 36; i++) {
      const wz = 3.4 / 2 + 3.4 / 2 - 0.5 - i * 0.185
      const w = m(winGeoA, windowMat, side * 0.541, 0.15, wz)
      w.rotation.y = ry; add(w, wz)
    }
    for (let i = 0; i < 32; i++) {
      const wz = 3.0 - i * 0.19
      const w = m(winGeoB, windowMat, side * 0.501, 0.34, wz)
      w.rotation.y = ry; add(w, wz)
    }
    for (let i = 0; i < 26; i++) {
      const wz = 2.6 - i * 0.19
      const w = m(winGeoC, windowMat, side * 0.471, 0.51, wz)
      w.rotation.y = ry; add(w, wz)
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RAILINGS (split)
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

  addRailing(bow, 0.63, 0.02, BREAK_Z, 2.6, 13)     // Bow main deck rails
  addRailing(stern, 0.63, 0.02, -5.4, BREAK_Z, 17)   // Stern main deck rails
  addRailing(bow, 0.48, 0.56, BREAK_Z, 2.2, 12)      // Bow boat deck rails
  addRailing(stern, 0.48, 0.56, -1.8, BREAK_Z, 3)    // Stern boat deck rails
  addRailing(bow, 0.565, 0.17, 2.8, 5.3, 10)         // Forecastle rails
  addRailing(stern, 0.49, 0.14, -5.4, -3.8, 6)       // Poop deck rails

  // ═══════════════════════════════════════════════════════════════════════════
  // BRIDGE & WHEELHOUSE (all on bow)
  // ═══════════════════════════════════════════════════════════════════════════
  bow.add(m(new THREE.BoxGeometry(0.65, 0.22, 0.7), ghostWhite, 0, 0.82, 2.35))
  for (let i = 0; i < 7; i++)
    bow.add(m(new THREE.PlaneGeometry(0.05, 0.065), windowMat, -0.24 + i * 0.08, 0.85, 2.701))
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const bw = m(new THREE.PlaneGeometry(0.06, 0.065), windowMat, side * 0.326, 0.85, 2.5 - i * 0.15)
      bw.rotation.y = side * Math.PI / 2; bow.add(bw)
    }
  }
  bow.add(m(new THREE.BoxGeometry(1.25, 0.04, 0.35), fadedCream, 0, 0.72, 2.35))
  for (const side of [-1, 1])
    bow.add(m(new THREE.BoxGeometry(0.12, 0.18, 0.28), ghostWhite, side * 0.58, 0.82, 2.35))
  bow.add(m(new THREE.BoxGeometry(0.32, 0.16, 0.32), ghostWhite, 0, 0.98, 2.35))
  for (let i = 0; i < 4; i++)
    bow.add(m(new THREE.PlaneGeometry(0.045, 0.05), windowMat, -0.1 + i * 0.065, 1.0, 2.521))
  bow.add(m(new THREE.BoxGeometry(0.5, 0.06, 0.3), fadedCream, 0, 0.97, 1.85))
  bow.add(m(new THREE.CylinderGeometry(0.02, 0.02, 0.08, 6), brassLamp, 0, 1.04, 1.85))

  // ═══════════════════════════════════════════════════════════════════════════
  // GRAND STAIRCASE DOME (bow)
  // ═══════════════════════════════════════════════════════════════════════════
  const domeGeo = new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2)
  bow.add(m(domeGeo, glassMat, 0, 0.72, 1.9))
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2
    const ribPts = []
    for (let t = 0; t <= 10; t++) {
      const phi = (t / 10) * Math.PI / 2
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

  // ═══════════════════════════════════════════════════════════════════════════
  // FUNNELS — 1-3 on bow, 4th on stern (all fell off in reality,
  // but funnel bases remain; we keep them for recognizability)
  // ═══════════════════════════════════════════════════════════════════════════
  const funnelZ = [2.6, 1.2, -0.2, -1.6]
  funnelZ.forEach((fz) => {
    const group = fz >= BREAK_Z ? bow : stern
    const fg = new THREE.Group()
    fg.position.set(0, 0.72, fz)
    fg.rotation.x = -0.065

    const body = new THREE.CylinderGeometry(0.125, 0.15, 1.25, 20)
    body.scale(1, 1, 0.82)
    fg.add(new THREE.Mesh(body, fadedBuff))

    const topGeo = new THREE.CylinderGeometry(0.13, 0.125, 0.3, 20)
    topGeo.scale(1, 1, 0.82)
    const topMesh = new THREE.Mesh(topGeo, blackened)
    topMesh.position.y = 0.72
    fg.add(topMesh)

    const cowlGeo = new THREE.CylinderGeometry(0.148, 0.13, 0.06, 20)
    cowlGeo.scale(1, 1, 0.82)
    const cowlMesh = new THREE.Mesh(cowlGeo, blackened)
    cowlMesh.position.y = 0.9
    fg.add(cowlMesh)

    fg.add(m(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 10), metalMat, 0, 0.94, 0))

    const baseGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.06, 20)
    baseGeo.scale(1, 1, 0.82)
    fg.add(new THREE.Mesh(baseGeo, darkRust))

    for (let a = 0; a < 6; a++) {
      const ang = (a / 6) * Math.PI * 2
      fg.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0.7, 0),
        new THREE.Vector3(Math.cos(ang) * 0.55, -0.65, Math.sin(ang) * 0.45)
      ]), wireMat))
    }

    for (let r = 0; r < 8; r++)
      fg.add(m(new THREE.BoxGeometry(0.06, 0.003, 0.003), metalMat, 0, -0.3 + r * 0.18, -0.12))
    fg.add(m(new THREE.BoxGeometry(0.003, 1.3, 0.003), metalMat, -0.025, 0.04, -0.12))
    fg.add(m(new THREE.BoxGeometry(0.003, 1.3, 0.003), metalMat, 0.025, 0.04, -0.12))

    group.add(fg)
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // MASTS
  // ═══════════════════════════════════════════════════════════════════════════

  // Foremast (bow)
  bow.add(m(new THREE.CylinderGeometry(0.02, 0.028, 3.0, 8), mastMat, 0, 1.7, 3.8))
  bow.add(m(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 12), metalMat, 0, 2.3, 3.8))
  const cnRail = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.005, 6, 12), metalMat)
  cnRail.position.set(0, 2.37, 3.8); cnRail.rotation.x = Math.PI / 2; bow.add(cnRail)
  bow.add(m(new THREE.CircleGeometry(0.058, 12), metalMat, 0, 2.27, 3.8))
  for (const y of [2.6, 2.8]) {
    const yd = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.8, 4), mastMat)
    yd.rotation.z = Math.PI / 2; yd.position.set(0, y, 3.8); bow.add(yd)
  }
  bow.add(m(new THREE.CylinderGeometry(0.008, 0.014, 0.8, 6), mastMat, 0, 3.5, 3.8))
  bow.add(m(new THREE.SphereGeometry(0.012, 6, 6), brassLamp, 0, 3.15, 3.8))

  // Mainmast (stern)
  stern.add(m(new THREE.CylinderGeometry(0.018, 0.026, 2.6, 8), mastMat, 0, 1.5, -3.1))
  const myrd = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.65, 4), mastMat)
  myrd.rotation.z = Math.PI / 2; myrd.position.set(0, 2.5, -3.1); stern.add(myrd)
  stern.add(m(new THREE.CylinderGeometry(0.006, 0.012, 0.7, 6), mastMat, 0, 3.1, -3.1))
  stern.add(m(new THREE.SphereGeometry(0.01, 6, 6), brassLamp, 0, 2.85, -3.1))

  // ═══════════════════════════════════════════════════════════════════════════
  // CARGO CRANES / DERRICKS
  // ═══════════════════════════════════════════════════════════════════════════
  for (const side of [-1, 1]) {
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.01, 1.4, 6), mastMat)
    boom.position.set(side * 0.15, 1.0, 3.2)
    boom.rotation.z = side * 0.6; boom.rotation.x = -0.3
    bow.add(boom)
  }
  for (const side of [-1, 1]) {
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.01, 1.2, 6), mastMat)
    boom.position.set(side * 0.15, 0.9, -3.6)
    boom.rotation.z = side * 0.5; boom.rotation.x = 0.3
    stern.add(boom)
  }
  bow.add(m(new THREE.BoxGeometry(0.35, 0.04, 0.4), sediment, 0, 0.05, 3.0))
  stern.add(m(new THREE.BoxGeometry(0.35, 0.04, 0.35), sediment, 0, 0.05, -3.8))

  // ═══════════════════════════════════════════════════════════════════════════
  // LIFEBOATS + DAVITS (split at break)
  // ═══════════════════════════════════════════════════════════════════════════
  for (let i = 0; i < 8; i++) {
    for (const side of [-1, 1]) {
      const bz = 2.2 - i * 0.52
      const group = bz >= BREAK_Z ? bow : stern

      const boat = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.1, 4, 8), boatMat)
      boat.rotation.x = Math.PI / 2
      boat.position.set(side * 0.5, 0.67, bz)
      group.add(boat)

      group.add(m(new THREE.BoxGeometry(0.005, 0.005, 0.12), railMat, side * 0.5, 0.685, bz))

      for (let t = -1; t <= 1; t++)
        group.add(m(new THREE.BoxGeometry(0.03, 0.002, 0.004), boatMat, side * 0.5, 0.67, bz + t * 0.03))

      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(side * 0.07, 0.14, 0),
        new THREE.Vector3(side * 0.09, 0.04, 0)
      )
      const davit = new THREE.Mesh(new THREE.TubeGeometry(curve, 8, 0.006, 5, false), metalMat)
      davit.position.set(side * 0.44, 0.62, bz)
      group.add(davit)
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VENTILATORS (split)
  // ═══════════════════════════════════════════════════════════════════════════
  const ventPos = [
    [0.22, 3.3], [-0.22, 3.3], [0.25, 2.8], [-0.25, 2.8],
    [0.3, 1.6], [-0.3, 1.6], [0.3, 0.8], [-0.3, 0.8],
    [0.2, -2.5], [-0.2, -2.5], [0.2, -3.0], [-0.2, -3.0],
    [0.15, -3.8], [-0.15, -3.8], [0.25, -0.6], [-0.25, -0.6],
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
  for (const x of [-0.28, 0.28])
    bow.add(m(new THREE.CylinderGeometry(0.038, 0.044, 0.08, 10), metalMat, x, 0.22, 4.5))
  bow.add(m(new THREE.BoxGeometry(0.4, 0.06, 0.08), metalMat, 0, 0.2, 4.8))
  bow.add(m(new THREE.CylinderGeometry(0.04, 0.04, 0.38, 10), metalMat, 0, 0.24, 4.8))
  for (const side of [-0.38, 0.38]) {
    const chainDeck = m(new THREE.CylinderGeometry(0.008, 0.008, 0.5, 4), metalMat, side * 0.7, 0.18, 4.9)
    chainDeck.rotation.z = Math.PI / 2 * 0.3; bow.add(chainDeck)
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.6, 4), metalMat)
    chain.position.set(side, -0.1, 5.15); chain.rotation.x = 0.7; bow.add(chain)
  }
  for (const x of [-0.35, 0.35, -0.2, 0.2])
    bow.add(m(new THREE.CylinderGeometry(0.015, 0.018, 0.04, 6), metalMat, x, 0.2, 5.0))
  bow.add(m(new THREE.CylinderGeometry(0.004, 0.006, 0.5, 4), mastMat, 0, 0.5, 5.5))

  // ═══════════════════════════════════════════════════════════════════════════
  // STERN DETAIL
  // ═══════════════════════════════════════════════════════════════════════════
  stern.add(m(new THREE.BoxGeometry(0.65, 0.7, 0.06), darkRust, 0, -0.2, -5.88))
  stern.add(m(new THREE.BoxGeometry(0.4, 0.08, 0.01), blackened, 0, 0.02, -5.92))
  stern.add(m(new THREE.BoxGeometry(0.5, 0.12, 0.3), ghostWhite, 0, 0.28, -4.3))
  for (let i = 0; i < 4; i++)
    stern.add(m(new THREE.PlaneGeometry(0.06, 0.04), windowMat, -0.12 + i * 0.08, 0.3, -5.88))
  stern.add(m(new THREE.CylinderGeometry(0.004, 0.006, 0.4, 4), mastMat, 0, 0.38, -5.7))

  // Propellers
  function makeProp(px, pz, blades, r) {
    const g = new THREE.Group()
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), propMat))
    for (let b = 0; b < blades; b++) {
      const a = (b / blades) * Math.PI * 2
      const blade = new THREE.Mesh(new THREE.BoxGeometry(r * 0.9, 0.006, 0.06), propMat)
      blade.position.set(Math.cos(a) * r / 2, Math.sin(a) * r / 2, 0)
      blade.rotation.z = a; blade.rotation.y = 0.2; g.add(blade)
    }
    g.position.set(px, -0.82, pz); return g
  }
  stern.add(makeProp(-0.28, -5.65, 3, 0.24))
  stern.add(makeProp(0.28, -5.65, 3, 0.24))
  stern.add(makeProp(0, -5.5, 4, 0.2))
  for (const px of [-0.28, 0.28])
    stern.add(m(new THREE.CylinderGeometry(0.015, 0.015, 1.0, 6), metalMat, px, -0.75, -5.2))
  stern.add(m(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 6), metalMat, 0, -0.72, -5.2))
  for (const px of [-0.28, 0.28]) {
    stern.add(m(new THREE.BoxGeometry(0.008, 0.15, 0.06), metalMat, px, -0.65, -5.0))
    stern.add(m(new THREE.BoxGeometry(0.008, 0.15, 0.06), metalMat, px, -0.65, -5.4))
  }
  stern.add(m(new THREE.BoxGeometry(0.015, 0.4, 0.22),
    new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.25 }), 0, -0.62, -5.82))

  // Stern bollards
  for (const x of [-0.3, 0.3])
    stern.add(m(new THREE.CylinderGeometry(0.015, 0.018, 0.04, 6), metalMat, x, 0.18, -5.2))
  stern.add(m(new THREE.BoxGeometry(0.65, 0.14, 0.35), fadedCream, 0, 0.2, -4.0))

  // ═══════════════════════════════════════════════════════════════════════════
  // RIGGING (split)
  // ═══════════════════════════════════════════════════════════════════════════
  bow.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 3.1, 3.8), new THREE.Vector3(0, 0.25, 5.5)]), wireMat))
  bow.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 3.1, 3.8), new THREE.Vector3(0, 0.72, 2.6)]), wireMat))
  stern.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 2.8, -3.1), new THREE.Vector3(0, 0.15, -5.5)]), wireMat))
  stern.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 2.8, -3.1), new THREE.Vector3(0, 0.72, -1.6)]), wireMat))
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      bow.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 2.6 - i * 0.3, 3.8),
        new THREE.Vector3(side * 0.55, 0.18, 3.8 + (i - 1) * 0.2)
      ]), wireMat))
      stern.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 2.4 - i * 0.3, -3.1),
        new THREE.Vector3(side * 0.5, 0.12, -3.1 + (i - 1) * 0.2)
      ]), wireMat))
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DECK FEATURES (split)
  // ═══════════════════════════════════════════════════════════════════════════
  for (const z of [1.9, 0.5]) {
    bow.add(m(new THREE.BoxGeometry(0.42, 0.1, 0.28), fadedCream, 0, 0.62, z))
    bow.add(m(new THREE.BoxGeometry(0.36, 0.005, 0.22), glassMat, 0, 0.68, z))
  }

  // Officers' quarters (bow)
  bow.add(m(new THREE.BoxGeometry(0.5, 0.12, 0.6), ghostWhite, 0, 0.78, 1.5))
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const ow = m(new THREE.PlaneGeometry(0.06, 0.04), windowMat, side * 0.251, 0.8, 1.65 - i * 0.15)
      ow.rotation.y = side * Math.PI / 2; bow.add(ow)
    }
  }

  // Deck benches (split)
  for (let i = 0; i < 6; i++) {
    const bz = 1.8 - i * 0.5
    const group = bz >= BREAK_Z ? bow : stern
    group.add(m(new THREE.BoxGeometry(0.06, 0.025, 0.025), teakDeck, 0.3, 0.585, bz))
    group.add(m(new THREE.BoxGeometry(0.06, 0.025, 0.025), teakDeck, -0.3, 0.585, bz))
  }

  return { bow, stern }
}
