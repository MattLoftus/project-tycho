import * as THREE from 'three'

/**
 * NANOGrav Pulsar Timing Array — Hellings-Downs Sky
 *
 * 67 millisecond pulsars from the NANOGrav 15-year dataset placed on the
 * celestial sphere at their cataloged RA/Dec. Earth at the center.
 * Each pulsar's pulse arrival times correlate with every other pulsar's
 * according to the angular separation between them, following the
 * Hellings-Downs (1983) curve — the smoking-gun signature of a
 * gravitational-wave background isotropically distributed across the sky.
 *
 * Interactive: a slider scrubs through 0°-180° angular separation. The
 * scene highlights an example pair at that separation and the HD curve
 * (drawn on a HUD canvas) shows the predicted correlation amplitude.
 */

const SKY_RADIUS = 80
const EARTH_RADIUS = 4

// 67 NANOGrav 15-year pulsars (J-name format encodes approx RA/Dec).
// We parse "JHHMM±DDMM" to derive (RA hours, Dec degrees). This is the
// historical IAU pulsar nomenclature; positions are accurate to ~few
// arcminutes which is well within the visualization scale.
const PULSAR_NAMES = [
  'J0023+0923', 'J0030+0451', 'J0125-2327', 'J0340+4130', 'J0406+3039',
  'J0437-4715', 'J0509+0856', 'J0557+1551', 'J0605+3757', 'J0610-2100',
  'J0613-0200', 'J0614-3329', 'J0636+5128', 'J0645+5158', 'J0709+0458',
  'J0740+6620', 'J0931-1902', 'J1012+5307', 'J1012-4235', 'J1022+1001',
  'J1024-0719', 'J1125+7819', 'J1312+0051', 'J1453+1902', 'J1455-3330',
  'J1600-3053', 'J1614-2230', 'J1630+3734', 'J1640+2224', 'J1643-1224',
  'J1705-1903', 'J1713+0747', 'J1719-1438', 'J1730-2304', 'J1738+0333',
  'J1741+1351', 'J1744-1134', 'J1745+1017', 'J1747-4036', 'J1751-2857',
  'J1802-2124', 'J1811-2405', 'J1832-0836', 'J1843-1113', 'J1853+1303',
  'J1857+0943', 'J1903+0327', 'J1909-3744', 'J1910+1256', 'J1911+1347',
  'J1918-0642', 'J1923+2515', 'J1939+2134', 'J1944+0907', 'J1946+3417',
  'J1955+2908', 'J2010-1323', 'J2017+0603', 'J2033+1734', 'J2043+1711',
  'J2124-3358', 'J2145-0750', 'J2214+3000', 'J2229+2643', 'J2234+0611',
  'J2234+0944', 'J2317+1439',
]

// Parse a pulsar J-name into (RA, Dec) in radians.
// Format: J HH MM ± DD MM  (two digits each), with the sign before declination.
function parsePulsarName(name) {
  // name like "J1909-3744" or "J2317+1439"
  const m = name.match(/^J(\d{2})(\d{2})([+-])(\d{2})(\d{2})$/)
  if (!m) throw new Error('Invalid pulsar name ' + name)
  const raH = parseInt(m[1], 10)
  const raM = parseInt(m[2], 10)
  const decSign = m[3] === '-' ? -1 : 1
  const decD = parseInt(m[4], 10)
  const decM = parseInt(m[5], 10)
  const raHours = raH + raM / 60
  const decDeg = decSign * (decD + decM / 60)
  const ra = raHours * (Math.PI / 12)
  const dec = decDeg * (Math.PI / 180)
  return { ra, dec, raHours, decDeg }
}

// Convert (RA, Dec) to a 3D unit vector (equatorial coordinates).
// We use astronomical convention: RA increases counterclockwise looking
// from +Z (north celestial pole), Dec measured from equatorial plane.
function raDecToUnitVec(ra, dec) {
  return new THREE.Vector3(
    Math.cos(dec) * Math.cos(ra),
    Math.sin(dec),                    // North celestial pole = +Y
    -Math.cos(dec) * Math.sin(ra),    // RA increases CCW from +X about +Y
  )
}

// Hellings-Downs angular correlation curve.
// HD(θ) = 3/2 · x · ln(x) − x/4 + 1/2,  where x = (1 − cos θ)/2.
// Returns the dimensionless correlation amplitude in [-0.25, 0.5].
export function hellingsDowns(thetaRad) {
  if (thetaRad <= 0) return 0.5
  const x = (1 - Math.cos(thetaRad)) / 2
  if (x <= 0) return 0.5
  return (3 / 2) * x * Math.log(x) - x / 4 + 0.5
}

function buildEarth() {
  const group = new THREE.Group()
  const inner = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_RADIUS, 24, 24),
    new THREE.MeshBasicMaterial({ color: 0x102030 }),
  )
  group.add(inner)
  const wire = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_RADIUS * 1.02, 18, 12),
    new THREE.MeshBasicMaterial({
      color: 0xff90c0, wireframe: true, transparent: true, opacity: 0.4,
    }),
  )
  group.add(wire)
  // Outer halo
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_RADIUS * 1.4, 24, 16),
    new THREE.MeshBasicMaterial({
      color: 0xff90c0, transparent: true, opacity: 0.08, side: THREE.BackSide,
    }),
  )
  group.add(halo)
  return group
}

function buildCelestialSphere() {
  // A faint wireframe sphere at SKY_RADIUS so the user has a sense of "the
  // sky" — pulsars sit on this shell.
  const group = new THREE.Group()
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(SKY_RADIUS, 36, 24),
    new THREE.MeshBasicMaterial({
      color: 0xff90c0, wireframe: true, transparent: true, opacity: 0.06, side: THREE.BackSide,
    }),
  )
  group.add(sphere)
  // Galactic-plane-ish reference ring (just a tilted circle, not actually
  // the galactic plane but suggestive of structure)
  const ringGeo = new THREE.TorusGeometry(SKY_RADIUS, 0.2, 4, 96)
  const ring = new THREE.Mesh(
    ringGeo,
    new THREE.MeshBasicMaterial({
      color: 0x6080a0, transparent: true, opacity: 0.18,
    }),
  )
  ring.rotation.x = -Math.PI / 2 + 0.4  // slight tilt
  group.add(ring)
  return group
}

function buildStarfield() {
  // Far stars beyond the celestial sphere
  const STAR_COUNT = 2200
  const STAR_RADIUS = 600
  const positions = new Float32Array(STAR_COUNT * 3)
  for (let i = 0; i < STAR_COUNT; i++) {
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    const r = STAR_RADIUS * (0.95 + 0.05 * Math.random())
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = r * Math.cos(phi)
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  return new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0x9090b0, size: 0.6, sizeAttenuation: true,
    transparent: true, opacity: 0.7,
  }))
}

function buildPulsars(pulsarData) {
  // One Group containing all pulsar markers; each marker is a small sphere
  // mesh with userData = { index, name } so we can highlight specific ones.
  const group = new THREE.Group()
  const markers = []
  const baseGeo = new THREE.SphereGeometry(1.1, 14, 14)
  const haloGeo = new THREE.SphereGeometry(2.4, 14, 14)
  for (const p of pulsarData) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xff90c0 })
    const mesh = new THREE.Mesh(baseGeo, mat)
    mesh.position.copy(p.dirUnit).multiplyScalar(SKY_RADIUS)
    mesh.userData = { name: p.name, index: p.index }
    group.add(mesh)
    // Faint halo around each marker for readability against the dark sky
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xff90c0, transparent: true, opacity: 0.15,
    })
    const halo = new THREE.Mesh(haloGeo, haloMat)
    halo.position.copy(mesh.position)
    group.add(halo)
    markers.push({ mesh, halo, p })
  }
  return { group, markers }
}

function buildPulsarLines(pulsarData) {
  // Faint line from Earth (origin) to each pulsar — visualizes the
  // direction to each pulsar in the timing array.
  const group = new THREE.Group()
  const lineSegs = []
  for (const p of pulsarData) {
    const positions = new Float32Array(6)
    positions[0] = 0; positions[1] = 0; positions[2] = 0
    const tip = p.dirUnit.clone().multiplyScalar(SKY_RADIUS)
    positions[3] = tip.x; positions[4] = tip.y; positions[5] = tip.z
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const mat = new THREE.LineBasicMaterial({
      color: 0xff90c0, transparent: true, opacity: 0.10,
    })
    const line = new THREE.Line(geo, mat)
    group.add(line)
    lineSegs.push({ line, mat, baseOpacity: 0.10 })
  }
  return { group, lineSegs }
}

function buildHighlight() {
  // Pair-highlight: a thicker bright line drawn between two highlighted
  // pulsars, plus pulsing markers. We pre-allocate one set; update its
  // endpoints + visibility each frame.
  const group = new THREE.Group()
  const positions = new Float32Array(6)
  const geo = new THREE.BufferGeometry()
  const posAttr = new THREE.BufferAttribute(positions, 3)
  posAttr.setUsage(THREE.DynamicDrawUsage)
  geo.setAttribute('position', posAttr)
  const mat = new THREE.LineBasicMaterial({
    color: 0xffe0f0, transparent: true, opacity: 0.95, linewidth: 3,
  })
  const arc = new THREE.Line(geo, mat)
  arc.frustumCulled = false
  group.add(arc)
  // Bright markers (will be repositioned each frame to highlighted pulsars)
  const markerGeo = new THREE.SphereGeometry(2.8, 18, 18)
  const m1 = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }))
  const m2 = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }))
  const haloGeo = new THREE.SphereGeometry(6.5, 20, 20)
  const h1 = new THREE.Mesh(haloGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }))
  const h2 = new THREE.Mesh(haloGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }))
  group.add(h1, h2)
  group.add(m1, m2)
  return { group, posAttr, arc, m1, m2, h1, h2, mat }
}

export function createPtaModel() {
  const root = new THREE.Group()
  const pulsarData = PULSAR_NAMES.map((name, index) => {
    const { ra, dec, raHours, decDeg } = parsePulsarName(name)
    return {
      name, index, ra, dec, raHours, decDeg,
      dirUnit: raDecToUnitVec(ra, dec),
    }
  })

  // Pre-compute pairwise angular separations for all (i,j) pairs
  const N = pulsarData.length
  const pairs = []
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const dot = pulsarData[i].dirUnit.dot(pulsarData[j].dirUnit)
      const ang = Math.acos(Math.max(-1, Math.min(1, dot)))
      pairs.push({ i, j, ang })
    }
  }
  pairs.sort((a, b) => a.ang - b.ang)

  function pairAtAngle(angRad) {
    // Binary search the sorted-by-angle pair list for the closest pair
    let lo = 0, hi = pairs.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (pairs[mid].ang < angRad) lo = mid + 1
      else hi = mid
    }
    // lo is the first pair with ang >= angRad; check lo and lo-1
    const candidates = []
    if (lo > 0) candidates.push(pairs[lo - 1])
    if (lo < pairs.length) candidates.push(pairs[lo])
    let best = candidates[0]
    for (const c of candidates) {
      if (Math.abs(c.ang - angRad) < Math.abs(best.ang - angRad)) best = c
    }
    return best
  }

  const earth = buildEarth()
  const sky = buildCelestialSphere()
  const starfield = buildStarfield()
  const pulsarPack = buildPulsars(pulsarData)
  const linePack = buildPulsarLines(pulsarData)
  const highlight = buildHighlight()

  root.add(starfield)
  root.add(sky)
  root.add(earth)
  root.add(linePack.group)
  root.add(pulsarPack.group)
  root.add(highlight.group)

  // Animate gentle pulse on each marker for a "nature's clocks" feel
  let currentSelectedAngleRad = Math.PI / 3
  let lastSimTime = 0

  function setSelectedAngle(angRad) {
    currentSelectedAngleRad = angRad
  }

  function update(simTime) {
    lastSimTime = simTime

    // Earth slow rotation
    earth.rotation.y = simTime * 0.08

    // Each pulsar pulses with its own phase — at base brightness 0.65, peak 1.0
    for (let k = 0; k < pulsarPack.markers.length; k++) {
      const { mesh, p } = pulsarPack.markers[k]
      const phase = simTime * (1.5 + 0.7 * (p.index % 5)) + p.index * 0.4
      const intensity = 0.7 + 0.3 * Math.max(0, Math.sin(phase))
      const r = 1.0
      const g = 0.56 + 0.10 * intensity   // 144/255 ≈ 0.565
      const b = 0.75 + 0.06 * intensity   // 192/255 ≈ 0.753
      mesh.material.color.setRGB(r, g, b)
      mesh.scale.setScalar(0.85 + 0.45 * intensity)
    }

    // Highlight: dim all pulsars-to-Earth lines, brighten only the pair
    for (const seg of linePack.lineSegs) {
      seg.mat.opacity = seg.baseOpacity
    }

    const pair = pairAtAngle(currentSelectedAngleRad)
    if (pair) {
      // Move highlight markers + arc endpoints to the selected pair
      const a = pulsarData[pair.i].dirUnit.clone().multiplyScalar(SKY_RADIUS)
      const b = pulsarData[pair.j].dirUnit.clone().multiplyScalar(SKY_RADIUS)
      highlight.m1.position.copy(a)
      highlight.m2.position.copy(b)
      highlight.h1.position.copy(a)
      highlight.h2.position.copy(b)
      // Pulse the highlight markers
      const pulse = 0.8 + 0.4 * Math.abs(Math.sin(simTime * 3.5))
      highlight.m1.scale.setScalar(pulse)
      highlight.m2.scale.setScalar(pulse)
      highlight.h1.scale.setScalar(pulse)
      highlight.h2.scale.setScalar(pulse)
      // Arc geometry: render a great-circle polyline between a and b
      // For simplicity, sample 24 points along the slerp on the unit sphere
      // then scale to SKY_RADIUS.
      const SEGS = 32
      const aN = pulsarData[pair.i].dirUnit
      const bN = pulsarData[pair.j].dirUnit
      const ang = pair.ang
      const pts = new Float32Array((SEGS + 1) * 3)
      for (let s = 0; s <= SEGS; s++) {
        const t = s / SEGS
        // Slerp on the unit sphere
        const sinAng = Math.sin(ang)
        if (sinAng < 1e-4) {
          pts[s * 3] = a.x; pts[s * 3 + 1] = a.y; pts[s * 3 + 2] = a.z
          continue
        }
        const w1 = Math.sin((1 - t) * ang) / sinAng
        const w2 = Math.sin(t * ang) / sinAng
        const x = (aN.x * w1 + bN.x * w2) * SKY_RADIUS
        const y = (aN.y * w1 + bN.y * w2) * SKY_RADIUS
        const z = (aN.z * w1 + bN.z * w2) * SKY_RADIUS
        pts[s * 3] = x; pts[s * 3 + 1] = y; pts[s * 3 + 2] = z
      }
      const arcGeo = highlight.arc.geometry
      // Replace the buffer (it's small; cheap)
      arcGeo.setAttribute('position', new THREE.BufferAttribute(pts, 3))
      arcGeo.attributes.position.needsUpdate = true
      arcGeo.computeBoundingSphere()
      // Brighten the two highlighted Earth-pulsar lines
      linePack.lineSegs[pair.i].mat.opacity = 0.85
      linePack.lineSegs[pair.j].mat.opacity = 0.85
      // Pulse the highlight arc with the HD value
      const hd = hellingsDowns(pair.ang)
      // |HD| in [0, 0.5]; map to opacity 0.5..1.0
      highlight.mat.opacity = 0.5 + Math.abs(hd)
      highlight.group.visible = true
    } else {
      highlight.group.visible = false
    }
  }

  function getSelectedPair() {
    const pair = pairAtAngle(currentSelectedAngleRad)
    if (!pair) return null
    return {
      ang: pair.ang,
      hd: hellingsDowns(pair.ang),
      pulsarA: pulsarData[pair.i],
      pulsarB: pulsarData[pair.j],
    }
  }

  return {
    root,
    pulsarData,
    pulsarMarkers: pulsarPack.markers,  // for click handling
    update,
    setSelectedAngle,
    getSelectedPair,
    pairCount: pairs.length,
  }
}
