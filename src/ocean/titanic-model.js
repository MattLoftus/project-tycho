import * as THREE from 'three'

/**
 * Procedural RMS Titanic model for the ocean floor scene.
 * Wreck-tinted materials (rust, sediment, corrosion).
 * Returns a THREE.Group scaled to fit the bathymetry scene.
 */

function smoothstep(a, b, t) {
  const x = Math.max(0, Math.min(1, (t - a) / (b - a)))
  return x * x * (3 - 2 * x)
}

// Helper: create mesh and position it
function m(geo, mat, x, y, z) {
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.set(x, y, z)
  return mesh
}

function createHull() {
  const L = 12, halfW = 0.7, D = 1.0
  const segs = 60, rings = 20
  const v = [], idx = []

  for (let i = 0; i <= segs; i++) {
    const t = i / segs
    const z = (t - 0.5) * L

    let w
    if (t < 0.06) w = 0.5 + 0.5 * smoothstep(0, 0.06, t)
    else if (t > 0.6) {
      const bt = (t - 0.6) / 0.4
      w = Math.max(1.0 - bt * bt * 0.98, 0.02)
    } else w = 1.0

    const bowRise = t > 0.82 ? smoothstep(0.82, 1.0, t) * 0.55 : 0
    const sternRise = t < 0.08 ? smoothstep(0.08, 0, t) * 0.2 : 0

    for (let j = 0; j <= rings; j++) {
      const angle = (j / rings) * Math.PI
      const sinA = Math.sin(angle), cosA = Math.cos(angle)
      const vAmount = t > 0.4 ? (t - 0.4) / 0.6 * 0.35 : 0
      let x = sinA * halfW * w
      const y = -Math.abs(cosA) * D - vAmount * (1 - Math.abs(sinA)) * 0.3 + bowRise + sternRise
      if (t > 0.75) {
        const flare = (t - 0.75) / 0.25 * 0.08 * Math.max(0, sinA)
        x += sinA > 0 ? flare : -flare
      }
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

  // ── Wreck materials ──
  const rustHull = new THREE.MeshStandardMaterial({ color: 0x3a1e0e, roughness: 0.9, metalness: 0.1 })
  const darkRust = new THREE.MeshStandardMaterial({ color: 0x2a1508, roughness: 0.95, metalness: 0.05 })
  const sediment = new THREE.MeshStandardMaterial({ color: 0x1a1812, roughness: 0.95 })
  const ghostWhite = new THREE.MeshStandardMaterial({ color: 0x3a3830, roughness: 0.85 })
  const fadedCream = new THREE.MeshStandardMaterial({ color: 0x2e2a22, roughness: 0.9 })
  const fadedBuff = new THREE.MeshStandardMaterial({ color: 0x5a3a18, roughness: 0.7, metalness: 0.1 })
  const blackened = new THREE.MeshStandardMaterial({ color: 0x0e0e0e, roughness: 0.8 })
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x1a1a16, metalness: 0.3, roughness: 0.8 })
  const windowMat = new THREE.MeshStandardMaterial({ color: 0x060606, roughness: 0.4 })
  const propMat = new THREE.MeshStandardMaterial({ color: 0x4a3a1a, roughness: 0.6, metalness: 0.4 })

  // ── Hull ──
  ship.add(new THREE.Mesh(createHull(), rustHull))

  // Red anti-fouling (faded) — visible on lower hull
  const redHull = new THREE.Mesh(createHull(), new THREE.MeshStandardMaterial({
    color: 0x4a1818, roughness: 0.85,
  }))
  redHull.scale.set(1.003, 0.6, 1.001)
  redHull.position.y = -0.4
  ship.add(redHull)

  // ── Main deck ──
  ship.add(m(new THREE.BoxGeometry(1.3, 0.035, 11.0), sediment, 0, 0.02, -0.2))

  // Forecastle
  ship.add(m(new THREE.BoxGeometry(1.15, 0.15, 2.6), darkRust, 0, 0.1, 4.1))

  // Forecastle bulwarks
  for (const side of [-1, 1])
    ship.add(m(new THREE.BoxGeometry(0.025, 0.1, 2.6), darkRust, side * 0.565, 0.22, 4.1))

  // Poop deck
  ship.add(m(new THREE.BoxGeometry(1.0, 0.14, 1.6), darkRust, 0, 0.09, -4.65))

  // ── Superstructure ──
  const aLen = 7.2
  ship.add(m(new THREE.BoxGeometry(1.08, 0.2, aLen), ghostWhite, 0, 0.13, -0.2))   // A-deck
  ship.add(m(new THREE.BoxGeometry(1.0, 0.18, 6.4), fadedCream, 0, 0.32, -0.05))   // B-deck
  ship.add(m(new THREE.BoxGeometry(0.94, 0.16, 5.6), ghostWhite, 0, 0.49, 0.05))   // C-deck
  ship.add(m(new THREE.BoxGeometry(0.84, 0.14, 4.2), fadedCream, 0, 0.64, 0.3))    // D-deck

  // Windows
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

  // Railings
  const railMat = new THREE.MeshStandardMaterial({ color: 0x222218, metalness: 0.3, roughness: 0.85 })
  for (const side of [-1, 1]) {
    ship.add(m(new THREE.BoxGeometry(0.008, 0.008, 10.5), railMat, side * 0.63, 0.1, -0.2))
    for (let i = 0; i < 40; i++)
      ship.add(m(new THREE.CylinderGeometry(0.003, 0.003, 0.08, 4), railMat, side * 0.63, 0.065, -5.0 + i * 0.26))
    ship.add(m(new THREE.BoxGeometry(0.006, 0.006, 5.4), railMat, side * 0.48, 0.61, 0.05))
  }

  // ── Bridge ──
  ship.add(m(new THREE.BoxGeometry(0.65, 0.2, 0.65), ghostWhite, 0, 0.82, 2.3))

  // Bridge windows
  for (let i = 0; i < 6; i++)
    ship.add(m(new THREE.PlaneGeometry(0.055, 0.06), windowMat, -0.24 + i * 0.09, 0.85, 2.626))

  // Bridge wings
  ship.add(m(new THREE.BoxGeometry(1.2, 0.035, 0.3), fadedCream, 0, 0.73, 2.3))

  // Wheelhouse
  ship.add(m(new THREE.BoxGeometry(0.3, 0.14, 0.3), ghostWhite, 0, 0.96, 2.3))

  // Compass platform
  ship.add(m(new THREE.BoxGeometry(0.5, 0.06, 0.3), fadedCream, 0, 0.95, 1.8))

  // ── Funnels ──
  const funnelZ = [2.6, 1.2, -0.2, -1.6]
  funnelZ.forEach(fz => {
    const fg = new THREE.Group()
    fg.position.set(0, 0.72, fz)
    fg.rotation.x = -0.065

    const body = new THREE.CylinderGeometry(0.125, 0.15, 1.25, 16)
    body.scale(1, 1, 0.82)
    fg.add(new THREE.Mesh(body, fadedBuff))

    const topGeo = new THREE.CylinderGeometry(0.13, 0.125, 0.28, 16)
    topGeo.scale(1, 1, 0.82)
    const topMesh = new THREE.Mesh(topGeo, blackened)
    topMesh.position.y = 0.72
    fg.add(topMesh)

    const cowlGeo = new THREE.CylinderGeometry(0.145, 0.13, 0.06, 16)
    cowlGeo.scale(1, 1, 0.82)
    const cowlMesh = new THREE.Mesh(cowlGeo, blackened)
    cowlMesh.position.y = 0.88
    fg.add(cowlMesh)

    const pipe = m(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 10), metalMat, 0, 0.92, 0)
    fg.add(pipe)

    const wireMat = new THREE.LineBasicMaterial({ color: 0x333330, transparent: true, opacity: 0.4 })
    for (let a = 0; a < 4; a++) {
      const ang = (a / 4) * Math.PI * 2 + Math.PI / 4
      fg.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0.7, 0),
        new THREE.Vector3(Math.cos(ang) * 0.5, -0.6, Math.sin(ang) * 0.4)
      ]), wireMat))
    }

    ship.add(fg)
  })

  // ── Masts ──
  const mastMat = new THREE.MeshStandardMaterial({ color: 0x2a1e10, roughness: 0.9 })

  // Foremast
  ship.add(m(new THREE.CylinderGeometry(0.018, 0.026, 2.8, 8), mastMat, 0, 1.6, 3.8))

  // Crow's nest
  ship.add(m(new THREE.CylinderGeometry(0.055, 0.055, 0.05, 10), metalMat, 0, 2.24, 3.8))
  const cnRail = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.004, 4, 10), metalMat)
  cnRail.position.set(0, 2.3, 3.8); cnRail.rotation.x = Math.PI / 2; ship.add(cnRail)

  // Yardarms
  for (const y of [2.5, 2.7]) {
    const yd = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.7, 4), mastMat)
    yd.rotation.z = Math.PI / 2; yd.position.set(0, y, 3.8); ship.add(yd)
  }

  // Mainmast
  ship.add(m(new THREE.CylinderGeometry(0.016, 0.024, 2.4, 8), mastMat, 0, 1.4, -3.1))
  const myrd = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.6, 4), mastMat)
  myrd.rotation.z = Math.PI / 2; myrd.position.set(0, 2.3, -3.1); ship.add(myrd)

  // ── Lifeboats + Davits ──
  const boatMat = new THREE.MeshStandardMaterial({ color: 0x3a3428, roughness: 0.85 })
  for (let i = 0; i < 8; i++) {
    for (const side of [-1, 1]) {
      const bz = 2.2 - i * 0.52
      const boat = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.09, 4, 6), boatMat)
      boat.rotation.x = Math.PI / 2; boat.position.set(side * 0.5, 0.66, bz); ship.add(boat)

      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(side * 0.06, 0.12, 0),
        new THREE.Vector3(side * 0.08, 0.04, 0)
      )
      const davit = new THREE.Mesh(new THREE.TubeGeometry(curve, 6, 0.005, 4, false), metalMat)
      davit.position.set(side * 0.44, 0.62, bz); ship.add(davit)
    }
  }

  // ── Ventilators ──
  const ventMat = new THREE.MeshStandardMaterial({ color: 0x3a3228, roughness: 0.9 })
  const ventPos = [[0.22, 3.3], [-0.22, 3.3], [0.25, 2.8], [-0.25, 2.8],
    [0.2, -2.5], [-0.2, -2.5], [0.2, -3.0], [-0.2, -3.0], [0.15, -3.8], [-0.15, -3.8]]
  ventPos.forEach(([x, z]) => {
    ship.add(m(new THREE.CylinderGeometry(0.022, 0.018, 0.12, 6), ventMat, x, 0.08, z))
    ship.add(m(new THREE.SphereGeometry(0.028, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2), ventMat, x, 0.15, z))
  })

  // Capstans
  for (const x of [-0.28, 0.28])
    ship.add(m(new THREE.CylinderGeometry(0.035, 0.04, 0.07, 8), metalMat, x, 0.21, 4.5))

  // Anchor chains
  for (const side of [-0.38, 0.38]) {
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 1.4, 4), metalMat)
    chain.position.set(side, -0.1, 5.15); chain.rotation.x = 0.7; ship.add(chain)
  }

  // ── Stern ──
  ship.add(m(new THREE.BoxGeometry(0.6, 0.65, 0.05), darkRust, 0, -0.2, -5.88))

  // Propellers
  function makeProp(px, pz, blades, r) {
    const g = new THREE.Group()
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 6), propMat))
    for (let b = 0; b < blades; b++) {
      const a = (b / blades) * Math.PI * 2
      const blade = new THREE.Mesh(new THREE.BoxGeometry(r * 0.85, 0.005, 0.045), propMat)
      blade.position.set(Math.cos(a) * r / 2, Math.sin(a) * r / 2, 0)
      blade.rotation.z = a; g.add(blade)
    }
    g.position.set(px, -0.82, pz); return g
  }
  ship.add(makeProp(-0.28, -5.65, 3, 0.22))
  ship.add(makeProp(0.28, -5.65, 3, 0.22))
  ship.add(makeProp(0, -5.5, 4, 0.18))

  // Rudder
  const rudder = m(new THREE.BoxGeometry(0.012, 0.35, 0.2),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.2 }), 0, -0.62, -5.82)
  ship.add(rudder)

  // ── Rigging ──
  const rigging = new THREE.LineBasicMaterial({ color: 0x333330, transparent: true, opacity: 0.4 })
  ship.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 2.9, 3.8), new THREE.Vector3(0, 0.2, 5.3)]), rigging))
  ship.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 2.5, -3.1), new THREE.Vector3(0, 0.12, -5.3)]), rigging))
  for (const side of [-1, 1]) {
    ship.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 2.6, 3.8), new THREE.Vector3(side * 0.55, 0.2, 3.8)]), rigging))
    ship.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 2.3, -3.1), new THREE.Vector3(side * 0.5, 0.15, -3.1)]), rigging))
  }

  // Deck skylights
  for (const z of [1.9, 0.5, -0.9])
    ship.add(m(new THREE.BoxGeometry(0.4, 0.1, 0.25), fadedCream, 0, 0.62, z))

  // Stern deckhouse
  ship.add(m(new THREE.BoxGeometry(0.6, 0.12, 0.3), fadedCream, 0, 0.2, -4.0))

  return ship
}
