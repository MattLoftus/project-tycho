import * as THREE from 'three'

/**
 * Procedural RMS Titanic wreck model.
 * Detailed exterior with wreck-appropriate materials.
 * Returns a THREE.Group.
 */

function smoothstep(a, b, t) {
  const x = Math.max(0, Math.min(1, (t - a) / (b - a)))
  return x * x * (3 - 2 * x)
}

function m(geo, mat, x, y, z) {
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.set(x, y, z)
  return mesh
}

function createHull() {
  // L=length, halfW=max half-beam, D=max draft
  const L = 12, halfW = 0.7, D = 1.0
  const segs = 80, rings = 24
  const v = [], idx = []

  for (let i = 0; i <= segs; i++) {
    const t = i / segs         // 0 = stern, 1 = bow
    const z = (t - 0.5) * L   // -6 stern, +6 bow

    // Beam width factor: full amidships, tapers at bow and stern
    let w
    if (t < 0.08) {
      // Stern: moderate taper with rounded counter
      w = 0.55 + 0.45 * smoothstep(0, 0.08, t)
    } else if (t > 0.55) {
      // Bow: long gentle taper to knife edge
      const bt = (t - 0.55) / 0.45
      w = Math.max(1.0 - bt * bt, 0.01)
    } else {
      w = 1.0
    }

    // V-shape increases toward the bow (sharper bottom at bow)
    const vShape = t > 0.5 ? (t - 0.5) / 0.5 * 0.4 : 0

    for (let j = 0; j <= rings; j++) {
      // Sweep from left waterline → keel → right waterline
      const angle = (j / rings) * Math.PI - Math.PI / 2
      const sinA = Math.sin(angle) // -1 (left) to +1 (right)
      const cosA = Math.cos(angle) // 0 at sides, 1 at keel

      let x = sinA * halfW * w
      // Rounded U amidships, V at bow
      let y = -cosA * D - vShape * (1 - Math.abs(sinA)) * 0.3

      y = Math.min(y, 0)

      v.push(x, y, z)
    }
  }

  for (let i = 0; i < segs; i++)
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

export function createTitanicModel() {
  const ship = new THREE.Group()

  // ── Materials ──
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

  // ═══════════════════════════════════════════════════════════════════════════
  // HULL
  // ═══════════════════════════════════════════════════════════════════════════
  ship.add(new THREE.Mesh(createHull(), rustHull))

  // Red anti-fouling bottom
  const redHull = new THREE.Mesh(createHull(), redBottom)
  redHull.scale.set(1.003, 0.6, 1.001)
  redHull.position.y = -0.4
  ship.add(redHull)

  // Bow stem (keel line at bow)
  ship.add(m(new THREE.BoxGeometry(0.02, 0.8, 0.02), darkRust, 0, 0.1, 5.9))

  // Hull width at a given z (matches createHull taper logic)
  function hullW(z) {
    const t = z / 12 + 0.5
    if (t < 0.08) return 0.55 + 0.45 * smoothstep(0, 0.08, t)
    if (t > 0.55) { const bt = (t - 0.55) / 0.45; return Math.max(1.0 - bt * bt, 0.01) }
    return 1.0
  }
  // Hull surface x at given y and z
  function hullX(y, z) {
    const w = hullW(z)
    const cosA = Math.min(1, -y / 1.0)
    return Math.sqrt(Math.max(0, 1 - cosA * cosA)) * 0.7 * w
  }

  // Hull portholes — two rows following hull curvature
  const portGeo = new THREE.CircleGeometry(0.018, 8)
  const portRimGeo = new THREE.RingGeometry(0.016, 0.022, 8)
  for (const side of [-1, 1]) {
    const ry = side * Math.PI / 2
    for (let i = 0; i < 44; i++) {
      const pz = 4.5 - i * 0.22
      const hx = hullX(-0.15, pz)
      if (hx < 0.15) continue
      const pw = m(portGeo, windowMat, side * (hx - 0.002), -0.15, pz)
      pw.rotation.y = ry; ship.add(pw)
      const pr = m(portRimGeo, metalMat, side * (hx - 0.001), -0.15, pz)
      pr.rotation.y = ry; ship.add(pr)
    }
    for (let i = 0; i < 38; i++) {
      const pz = 4.0 - i * 0.24
      const hx = hullX(-0.38, pz)
      if (hx < 0.15) continue
      const pw = m(portGeo, windowMat, side * (hx - 0.002), -0.38, pz)
      pw.rotation.y = ry; ship.add(pw)
      const pr = m(portRimGeo, metalMat, side * (hx - 0.001), -0.38, pz)
      pr.rotation.y = ry; ship.add(pr)
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DECKS
  // ═══════════════════════════════════════════════════════════════════════════

  // Main deck (teak planking)
  ship.add(m(new THREE.BoxGeometry(1.3, 0.035, 11.0), teakDeck, 0, 0.02, -0.2))

  // Deck plank lines
  for (let i = -6; i <= 6; i++) {
    ship.add(m(new THREE.BoxGeometry(0.002, 0.002, 10.8), sediment, i * 0.09, 0.04, -0.2))
  }

  // Forecastle deck
  ship.add(m(new THREE.BoxGeometry(1.15, 0.15, 2.6), darkRust, 0, 0.1, 4.1))

  // Forecastle bulwarks
  for (const side of [-1, 1])
    ship.add(m(new THREE.BoxGeometry(0.025, 0.12, 2.6), darkRust, side * 0.565, 0.24, 4.1))

  // Well deck (between forecastle and bridge)
  ship.add(m(new THREE.BoxGeometry(1.1, 0.04, 0.8), teakDeck, 0, 0.02, 2.6))

  // Poop deck (stern)
  ship.add(m(new THREE.BoxGeometry(1.0, 0.14, 1.6), darkRust, 0, 0.09, -4.65))

  // Poop deck bulwarks
  for (const side of [-1, 1])
    ship.add(m(new THREE.BoxGeometry(0.02, 0.1, 1.6), darkRust, side * 0.49, 0.21, -4.65))

  // ═══════════════════════════════════════════════════════════════════════════
  // SUPERSTRUCTURE
  // ═══════════════════════════════════════════════════════════════════════════

  const aLen = 7.2
  ship.add(m(new THREE.BoxGeometry(1.08, 0.2, aLen), ghostWhite, 0, 0.13, -0.2))    // A-deck
  ship.add(m(new THREE.BoxGeometry(1.0, 0.18, 6.4), fadedCream, 0, 0.32, -0.05))    // B-deck
  ship.add(m(new THREE.BoxGeometry(0.94, 0.16, 5.6), ghostWhite, 0, 0.49, 0.05))    // C-deck (Promenade)
  ship.add(m(new THREE.BoxGeometry(0.84, 0.14, 4.2), fadedCream, 0, 0.64, 0.3))     // Boat deck

  // Promenade deck covered walkway (C-deck side panels)
  for (const side of [-1, 1]) {
    // Enclosed section forward
    ship.add(m(new THREE.BoxGeometry(0.015, 0.14, 2.0), glassMat, side * 0.465, 0.49, 1.5))
    // Open section aft — stanchions only
    for (let i = 0; i < 10; i++)
      ship.add(m(new THREE.CylinderGeometry(0.004, 0.004, 0.14, 4), ghostWhite, side * 0.465, 0.49, -0.8 - i * 0.22))
  }

  // Superstructure windows (3 rows)
  const winGeoA = new THREE.PlaneGeometry(0.055, 0.045)
  const winGeoB = new THREE.PlaneGeometry(0.05, 0.04)
  const winGeoC = new THREE.PlaneGeometry(0.04, 0.035)
  for (const side of [-1, 1]) {
    const ry = side * Math.PI / 2
    for (let i = 0; i < 36; i++) {
      const w = m(winGeoA, windowMat, side * 0.541, 0.15, aLen / 2 - 0.5 - i * 0.185)
      w.rotation.y = ry; ship.add(w)
    }
    for (let i = 0; i < 32; i++) {
      const w = m(winGeoB, windowMat, side * 0.501, 0.34, 3.0 - i * 0.19)
      w.rotation.y = ry; ship.add(w)
    }
    for (let i = 0; i < 26; i++) {
      const w = m(winGeoC, windowMat, side * 0.471, 0.51, 2.6 - i * 0.19)
      w.rotation.y = ry; ship.add(w)
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RAILINGS (main deck, boat deck, forecastle, poop)
  // ═══════════════════════════════════════════════════════════════════════════

  function addRailing(xOff, yBase, zStart, zEnd, count) {
    const len = zEnd - zStart
    for (const side of [-1, 1]) {
      // Top rail
      ship.add(m(new THREE.BoxGeometry(0.006, 0.006, len), railMat, side * xOff, yBase + 0.07, (zStart + zEnd) / 2))
      // Middle rail
      ship.add(m(new THREE.BoxGeometry(0.004, 0.004, len), railMat, side * xOff, yBase + 0.04, (zStart + zEnd) / 2))
      // Stanchions
      const spacing = len / count
      for (let i = 0; i <= count; i++)
        ship.add(m(new THREE.CylinderGeometry(0.003, 0.003, 0.08, 4), railMat, side * xOff, yBase + 0.035, zStart + i * spacing))
    }
  }

  addRailing(0.63, 0.02, -5.4, 2.6, 30)   // Main deck rails
  addRailing(0.48, 0.56, -1.5, 2.2, 14)    // Boat deck rails
  addRailing(0.565, 0.17, 2.8, 5.3, 10)    // Forecastle rails
  addRailing(0.49, 0.14, -5.4, -3.8, 6)    // Poop deck rails

  // ═══════════════════════════════════════════════════════════════════════════
  // BRIDGE & WHEELHOUSE
  // ═══════════════════════════════════════════════════════════════════════════

  ship.add(m(new THREE.BoxGeometry(0.65, 0.22, 0.7), ghostWhite, 0, 0.82, 2.35))

  // Bridge windows (front row)
  for (let i = 0; i < 7; i++)
    ship.add(m(new THREE.PlaneGeometry(0.05, 0.065), windowMat, -0.24 + i * 0.08, 0.85, 2.701))

  // Bridge side windows
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const bw = m(new THREE.PlaneGeometry(0.06, 0.065), windowMat, side * 0.326, 0.85, 2.5 - i * 0.15)
      bw.rotation.y = side * Math.PI / 2; ship.add(bw)
    }
  }

  // Bridge wings
  ship.add(m(new THREE.BoxGeometry(1.25, 0.04, 0.35), fadedCream, 0, 0.72, 2.35))

  // Wing cabs (enclosed ends)
  for (const side of [-1, 1])
    ship.add(m(new THREE.BoxGeometry(0.12, 0.18, 0.28), ghostWhite, side * 0.58, 0.82, 2.35))

  // Wheelhouse
  ship.add(m(new THREE.BoxGeometry(0.32, 0.16, 0.32), ghostWhite, 0, 0.98, 2.35))
  // Wheelhouse windows
  for (let i = 0; i < 4; i++)
    ship.add(m(new THREE.PlaneGeometry(0.045, 0.05), windowMat, -0.1 + i * 0.065, 1.0, 2.521))

  // Compass platform
  ship.add(m(new THREE.BoxGeometry(0.5, 0.06, 0.3), fadedCream, 0, 0.97, 1.85))

  // Binnacle (compass housing)
  ship.add(m(new THREE.CylinderGeometry(0.02, 0.02, 0.08, 6), brassLamp, 0, 1.04, 1.85))

  // ═══════════════════════════════════════════════════════════════════════════
  // GRAND STAIRCASE DOME
  // ═══════════════════════════════════════════════════════════════════════════

  // Glass dome over the grand staircase (between funnels 1&2)
  const domeGeo = new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2)
  const dome = m(domeGeo, glassMat, 0, 0.72, 1.9)
  ship.add(dome)
  // Dome frame ribs
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
    const ribGeo = new THREE.BufferGeometry().setFromPoints(ribPts)
    const rib = new THREE.Line(ribGeo, new THREE.LineBasicMaterial({ color: 0x665530 }))
    rib.position.set(0, 0.52, 1.9)
    ship.add(rib)
  }

  // Aft grand staircase dome (smaller)
  const aftDome = m(new THREE.SphereGeometry(0.14, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), glassMat, 0, 0.72, -1.0)
  ship.add(aftDome)

  // ═══════════════════════════════════════════════════════════════════════════
  // FUNNELS (4)
  // ═══════════════════════════════════════════════════════════════════════════

  const funnelZ = [2.6, 1.2, -0.2, -1.6]
  funnelZ.forEach((fz, fi) => {
    const fg = new THREE.Group()
    fg.position.set(0, 0.72, fz)
    fg.rotation.x = -0.065 // slight rake aft

    // Main funnel body
    const body = new THREE.CylinderGeometry(0.125, 0.15, 1.25, 20)
    body.scale(1, 1, 0.82) // oval cross-section
    fg.add(new THREE.Mesh(body, fadedBuff))

    // Black top band
    const topGeo = new THREE.CylinderGeometry(0.13, 0.125, 0.3, 20)
    topGeo.scale(1, 1, 0.82)
    const topMesh = new THREE.Mesh(topGeo, blackened)
    topMesh.position.y = 0.72
    fg.add(topMesh)

    // Cowl rim
    const cowlGeo = new THREE.CylinderGeometry(0.148, 0.13, 0.06, 20)
    cowlGeo.scale(1, 1, 0.82)
    const cowlMesh = new THREE.Mesh(cowlGeo, blackened)
    cowlMesh.position.y = 0.9
    fg.add(cowlMesh)

    // Steam pipe
    fg.add(m(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 10), metalMat, 0, 0.94, 0))

    // Funnel base collar
    const baseGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.06, 20)
    baseGeo.scale(1, 1, 0.82)
    fg.add(new THREE.Mesh(baseGeo, darkRust))

    // Guy wires (6 per funnel)
    for (let a = 0; a < 6; a++) {
      const ang = (a / 6) * Math.PI * 2
      fg.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0.7, 0),
        new THREE.Vector3(Math.cos(ang) * 0.55, -0.65, Math.sin(ang) * 0.45)
      ]), wireMat))
    }

    // Ladder on each funnel (aft side)
    for (let r = 0; r < 8; r++) {
      fg.add(m(new THREE.BoxGeometry(0.06, 0.003, 0.003), metalMat, 0, -0.3 + r * 0.18, -0.12))
    }
    fg.add(m(new THREE.BoxGeometry(0.003, 1.3, 0.003), metalMat, -0.025, 0.04, -0.12))
    fg.add(m(new THREE.BoxGeometry(0.003, 1.3, 0.003), metalMat, 0.025, 0.04, -0.12))

    ship.add(fg)
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // MASTS
  // ═══════════════════════════════════════════════════════════════════════════

  // Foremast
  ship.add(m(new THREE.CylinderGeometry(0.02, 0.028, 3.0, 8), mastMat, 0, 1.7, 3.8))

  // Crow's nest
  ship.add(m(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 12), metalMat, 0, 2.3, 3.8))
  const cnRail = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.005, 6, 12), metalMat)
  cnRail.position.set(0, 2.37, 3.8); cnRail.rotation.x = Math.PI / 2; ship.add(cnRail)
  // Crow's nest floor
  ship.add(m(new THREE.CircleGeometry(0.058, 12), metalMat, 0, 2.27, 3.8))

  // Yardarms
  for (const y of [2.6, 2.8]) {
    const yd = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.8, 4), mastMat)
    yd.rotation.z = Math.PI / 2; yd.position.set(0, y, 3.8); ship.add(yd)
  }

  // Foremast topmast
  ship.add(m(new THREE.CylinderGeometry(0.008, 0.014, 0.8, 6), mastMat, 0, 3.5, 3.8))

  // Mainmast
  ship.add(m(new THREE.CylinderGeometry(0.018, 0.026, 2.6, 8), mastMat, 0, 1.5, -3.1))
  const myrd = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.65, 4), mastMat)
  myrd.rotation.z = Math.PI / 2; myrd.position.set(0, 2.5, -3.1); ship.add(myrd)

  // Mainmast topmast
  ship.add(m(new THREE.CylinderGeometry(0.006, 0.012, 0.7, 6), mastMat, 0, 3.1, -3.1))

  // Mast lights
  ship.add(m(new THREE.SphereGeometry(0.012, 6, 6), brassLamp, 0, 3.15, 3.8))
  ship.add(m(new THREE.SphereGeometry(0.01, 6, 6), brassLamp, 0, 2.85, -3.1))

  // ═══════════════════════════════════════════════════════════════════════════
  // CARGO CRANES / DERRICKS
  // ═══════════════════════════════════════════════════════════════════════════

  // Forward well deck cargo derricks (between foremast and forecastle)
  for (const side of [-1, 1]) {
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.01, 1.4, 6), mastMat)
    boom.position.set(side * 0.15, 1.0, 3.2)
    boom.rotation.z = side * 0.6
    boom.rotation.x = -0.3
    ship.add(boom)
  }

  // Aft cargo derricks (between mainmast and poop deck)
  for (const side of [-1, 1]) {
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.01, 1.2, 6), mastMat)
    boom.position.set(side * 0.15, 0.9, -3.6)
    boom.rotation.z = side * 0.5
    boom.rotation.x = 0.3
    ship.add(boom)
  }

  // Cargo hatch covers (well decks)
  ship.add(m(new THREE.BoxGeometry(0.35, 0.04, 0.4), sediment, 0, 0.05, 3.0))
  ship.add(m(new THREE.BoxGeometry(0.35, 0.04, 0.35), sediment, 0, 0.05, -3.8))

  // ═══════════════════════════════════════════════════════════════════════════
  // LIFEBOATS + DAVITS (16 boats)
  // ═══════════════════════════════════════════════════════════════════════════

  for (let i = 0; i < 8; i++) {
    for (const side of [-1, 1]) {
      const bz = 2.2 - i * 0.52
      // Lifeboat hull
      const boat = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.1, 4, 8), boatMat)
      boat.rotation.x = Math.PI / 2
      boat.position.set(side * 0.5, 0.67, bz)
      ship.add(boat)

      // Lifeboat gunwale
      const gunwale = m(new THREE.BoxGeometry(0.005, 0.005, 0.12), railMat, side * 0.5, 0.685, bz)
      ship.add(gunwale)

      // Lifeboat thwarts (seats)
      for (let t = -1; t <= 1; t++)
        ship.add(m(new THREE.BoxGeometry(0.03, 0.002, 0.004), boatMat, side * 0.5, 0.67, bz + t * 0.03))

      // Davit crane
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(side * 0.07, 0.14, 0),
        new THREE.Vector3(side * 0.09, 0.04, 0)
      )
      const davit = new THREE.Mesh(new THREE.TubeGeometry(curve, 8, 0.006, 5, false), metalMat)
      davit.position.set(side * 0.44, 0.62, bz)
      ship.add(davit)

      // Davit falls (ropes)
      ship.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(side * 0.52, 0.76, bz),
        new THREE.Vector3(side * 0.5, 0.685, bz + 0.04)
      ]), wireMat))
      ship.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(side * 0.52, 0.76, bz),
        new THREE.Vector3(side * 0.5, 0.685, bz - 0.04)
      ]), wireMat))
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
  ]
  ventPos.forEach(([x, z]) => {
    // Vent shaft
    ship.add(m(new THREE.CylinderGeometry(0.024, 0.02, 0.14, 8), ventMat, x, 0.09, z))
    // Cowl top
    const cowl = m(new THREE.SphereGeometry(0.03, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), ventMat, x, 0.17, z)
    ship.add(cowl)
    // Cowl mouth
    ship.add(m(new THREE.CircleGeometry(0.022, 8), blackened, x, 0.165, z + 0.025))
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // BOW DETAIL
  // ═══════════════════════════════════════════════════════════════════════════

  // Capstans
  for (const x of [-0.28, 0.28])
    ship.add(m(new THREE.CylinderGeometry(0.038, 0.044, 0.08, 10), metalMat, x, 0.22, 4.5))

  // Anchor windlass
  ship.add(m(new THREE.BoxGeometry(0.4, 0.06, 0.08), metalMat, 0, 0.2, 4.8))
  ship.add(m(new THREE.CylinderGeometry(0.04, 0.04, 0.38, 10), metalMat, 0, 0.24, 4.8))

  // Anchor chains
  for (const side of [-0.38, 0.38]) {
    // Chain on deck
    const chainDeck = m(new THREE.CylinderGeometry(0.008, 0.008, 0.5, 4), metalMat, side * 0.7, 0.18, 4.9)
    chainDeck.rotation.z = Math.PI / 2 * 0.3
    ship.add(chainDeck)
    // Chain going over side
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.6, 4), metalMat)
    chain.position.set(side, -0.1, 5.15)
    chain.rotation.x = 0.7
    ship.add(chain)
  }

  // Bollards (bow)
  for (const x of [-0.35, 0.35, -0.2, 0.2]) {
    ship.add(m(new THREE.CylinderGeometry(0.015, 0.018, 0.04, 6), metalMat, x, 0.2, 5.0))
  }

  // Jack staff (flag pole at bow)
  ship.add(m(new THREE.CylinderGeometry(0.004, 0.006, 0.5, 4), mastMat, 0, 0.5, 5.5))

  // ═══════════════════════════════════════════════════════════════════════════
  // STERN DETAIL
  // ═══════════════════════════════════════════════════════════════════════════

  // Stern counter
  ship.add(m(new THREE.BoxGeometry(0.65, 0.7, 0.06), darkRust, 0, -0.2, -5.88))

  // Stern nameplate area (recessed panel)
  ship.add(m(new THREE.BoxGeometry(0.4, 0.08, 0.01), blackened, 0, 0.02, -5.92))

  // Docking bridge (aft)
  ship.add(m(new THREE.BoxGeometry(0.5, 0.12, 0.3), ghostWhite, 0, 0.28, -4.3))
  // Docking bridge windows
  for (let i = 0; i < 4; i++)
    ship.add(m(new THREE.PlaneGeometry(0.06, 0.04), windowMat, -0.12 + i * 0.08, 0.3, -5.88))

  // Stern flagpole
  ship.add(m(new THREE.CylinderGeometry(0.004, 0.006, 0.4, 4), mastMat, 0, 0.38, -5.7))

  // Propellers
  function makeProp(px, pz, blades, r) {
    const g = new THREE.Group()
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), propMat))
    for (let b = 0; b < blades; b++) {
      const a = (b / blades) * Math.PI * 2
      // Wider blades with slight twist
      const bladeGeo = new THREE.BoxGeometry(r * 0.9, 0.006, 0.06)
      const blade = new THREE.Mesh(bladeGeo, propMat)
      blade.position.set(Math.cos(a) * r / 2, Math.sin(a) * r / 2, 0)
      blade.rotation.z = a
      blade.rotation.y = 0.2 // blade pitch
      g.add(blade)
    }
    g.position.set(px, -0.82, pz)
    return g
  }
  ship.add(makeProp(-0.28, -5.65, 3, 0.24))
  ship.add(makeProp(0.28, -5.65, 3, 0.24))
  ship.add(makeProp(0, -5.5, 4, 0.2))

  // Propeller shafts (visible below stern)
  for (const px of [-0.28, 0.28])
    ship.add(m(new THREE.CylinderGeometry(0.015, 0.015, 1.0, 6), metalMat, px, -0.75, -5.2))
  ship.add(m(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 6), metalMat, 0, -0.72, -5.2))

  // Shaft brackets (A-brackets)
  for (const px of [-0.28, 0.28]) {
    ship.add(m(new THREE.BoxGeometry(0.008, 0.15, 0.06), metalMat, px, -0.65, -5.0))
    ship.add(m(new THREE.BoxGeometry(0.008, 0.15, 0.06), metalMat, px, -0.65, -5.4))
  }

  // Rudder
  ship.add(m(new THREE.BoxGeometry(0.015, 0.4, 0.22),
    new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.25 }), 0, -0.62, -5.82))

  // ═══════════════════════════════════════════════════════════════════════════
  // RIGGING
  // ═══════════════════════════════════════════════════════════════════════════

  // Forestay
  ship.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 3.1, 3.8), new THREE.Vector3(0, 0.25, 5.5)]), wireMat))
  // Backstay (foremast)
  ship.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 3.1, 3.8), new THREE.Vector3(0, 0.72, 2.6)]), wireMat))
  // Mainmast stays
  ship.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 2.8, -3.1), new THREE.Vector3(0, 0.15, -5.5)]), wireMat))
  ship.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 2.8, -3.1), new THREE.Vector3(0, 0.72, -1.6)]), wireMat))

  // Shrouds (side rigging)
  for (const side of [-1, 1]) {
    // Foremast shrouds
    for (let i = 0; i < 3; i++) {
      ship.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 2.6 - i * 0.3, 3.8),
        new THREE.Vector3(side * 0.55, 0.18, 3.8 + (i - 1) * 0.2)
      ]), wireMat))
    }
    // Mainmast shrouds
    for (let i = 0; i < 3; i++) {
      ship.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 2.4 - i * 0.3, -3.1),
        new THREE.Vector3(side * 0.5, 0.12, -3.1 + (i - 1) * 0.2)
      ]), wireMat))
    }
  }

  // Aerial wire between masts
  ship.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 3.1, 3.8), new THREE.Vector3(0, 2.8, -3.1)]), wireMat))

  // ═══════════════════════════════════════════════════════════════════════════
  // DECK FEATURES
  // ═══════════════════════════════════════════════════════════════════════════

  // Deck skylights (larger, with glass)
  for (const z of [1.9, 0.5, -0.9]) {
    ship.add(m(new THREE.BoxGeometry(0.42, 0.1, 0.28), fadedCream, 0, 0.62, z))
    ship.add(m(new THREE.BoxGeometry(0.36, 0.005, 0.22), glassMat, 0, 0.68, z))
  }

  // Officers' quarters deckhouse
  ship.add(m(new THREE.BoxGeometry(0.5, 0.12, 0.6), ghostWhite, 0, 0.78, 1.5))
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const ow = m(new THREE.PlaneGeometry(0.06, 0.04), windowMat, side * 0.251, 0.8, 1.65 - i * 0.15)
      ow.rotation.y = side * Math.PI / 2; ship.add(ow)
    }
  }

  // Stern deckhouse
  ship.add(m(new THREE.BoxGeometry(0.65, 0.14, 0.35), fadedCream, 0, 0.2, -4.0))

  // Bollards (stern)
  for (const x of [-0.3, 0.3])
    ship.add(m(new THREE.CylinderGeometry(0.015, 0.018, 0.04, 6), metalMat, x, 0.18, -5.2))

  // Deck benches (boat deck)
  for (let i = 0; i < 6; i++) {
    ship.add(m(new THREE.BoxGeometry(0.06, 0.025, 0.025), teakDeck, 0.3, 0.585, 1.8 - i * 0.5))
    ship.add(m(new THREE.BoxGeometry(0.06, 0.025, 0.025), teakDeck, -0.3, 0.585, 1.8 - i * 0.5))
  }

  return ship
}
