import * as THREE from 'three'

/**
 * Great Pyramid of Giza (Pyramid of Khufu) — procedural model.
 *
 * Coordinate system:
 *   Origin = center of pyramid base at ground level
 *   Y up, X east-west, Z north-south (negative Z = north / entrance side)
 *   1 unit = 1 meter
 *
 * All internal structures are positioned via chained anchor points
 * derived from the entrance location and passage angle (26.3°).
 */

// ─── Constants (meters) ──────────────────────────────────────────────────────

const BASE       = 230.6
const HALF       = BASE / 2       // 115.3
const HEIGHT     = 146.59
const SLOPE      = 51.844 * Math.PI / 180
const PASS_ANGLE = 26.3 * Math.PI / 180
const PASS_W     = 1.2
const PASS_H     = 1.1

const sinA = Math.sin(PASS_ANGLE)  // 0.4431
const cosA = Math.cos(PASS_ANGLE)  // 0.8962

// ─── Anchor points (chained from entrance) ───────────────────────────────────

// North face Z at a given height: the face slopes inward from -HALF at base to 0 at apex
function northFaceZ(h) { return -(HALF - h / Math.tan(SLOPE)) }

const ENTRANCE = new THREE.Vector3(7, 17, northFaceZ(17))

// Junction where ascending branches from descending — 28m down from entrance
const JUNC_DIST = 28
const JUNCTION = new THREE.Vector3(
  ENTRANCE.x,
  ENTRANCE.y - sinA * JUNC_DIST,
  ENTRANCE.z + cosA * JUNC_DIST
)

// Descending passage continues from junction down to subterranean area
// Total descending passage ~105m; beyond junction another ~77m into bedrock
const DESC_CONT = 77
const DESC_END = new THREE.Vector3(
  JUNCTION.x,
  JUNCTION.y - sinA * DESC_CONT,
  JUNCTION.z + cosA * DESC_CONT
)

// Subterranean chamber — at bottom of descending passage, roughly centered
const SUBTERRANEAN = new THREE.Vector3(0, -27, DESC_END.z)

// Ascending passage — 39.3m up from junction at same angle
const ASC_LEN = 39.3
const ASC_END = new THREE.Vector3(
  JUNCTION.x,
  JUNCTION.y + sinA * ASC_LEN,
  JUNCTION.z + cosA * ASC_LEN
)

// Grand Gallery — continues from ASC_END upward, 46.68m
const GAL_LEN = 46.68
const GAL_END = new THREE.Vector3(
  ASC_END.x,
  ASC_END.y + sinA * GAL_LEN,
  ASC_END.z + cosA * GAL_LEN
)

// Queen's Chamber — horizontal passage from ASC_END heading toward center, ~38m
const QC_PASS_LEN = 38
const QC_PASS_END = new THREE.Vector3(0, ASC_END.y, ASC_END.z + QC_PASS_LEN)
// Chamber centered near the pyramid's NS axis
const QUEENS = new THREE.Vector3(0, 21, QC_PASS_END.z)

// King's Chamber — past a short antechamber at the top of the Grand Gallery
const KINGS = new THREE.Vector3(0, 43, GAL_END.z + 3)

// ─── Materials ───────────────────────────────────────────────────────────────

function makeMaterials() {
  // Interior materials — very high emissive so they self-illuminate inside the pyramid
  const limestone = new THREE.MeshStandardMaterial({
    color: 0xf0e0b8, roughness: 0.80, metalness: 0.02, side: THREE.DoubleSide,
    emissive: 0xe8d8a8, emissiveIntensity: 0.55,
  })
  const limestoneLight = new THREE.MeshStandardMaterial({
    color: 0xf5e8c0, roughness: 0.75, metalness: 0.03, side: THREE.DoubleSide,
    emissive: 0xf0e0b0, emissiveIntensity: 0.55,
  })
  const granite = new THREE.MeshStandardMaterial({
    color: 0xe0b8a8, roughness: 0.70, metalness: 0.05, side: THREE.DoubleSide,
    emissive: 0xd0a090, emissiveIntensity: 0.5,
  })
  const darkGranite = new THREE.MeshStandardMaterial({
    color: 0xc89888, roughness: 0.72, metalness: 0.04, side: THREE.DoubleSide,
    emissive: 0xb88070, emissiveIntensity: 0.45,
  })
  const bedrock = new THREE.MeshStandardMaterial({
    color: 0xc0b0a0, roughness: 0.88, metalness: 0.02, side: THREE.DoubleSide,
    emissive: 0xa89880, emissiveIntensity: 0.45,
  })
  const shaft = new THREE.MeshStandardMaterial({
    color: 0xe0d0a8, roughness: 0.85, metalness: 0.02, side: THREE.DoubleSide,
    emissive: 0xc8b888, emissiveIntensity: 0.35,
    transparent: true, opacity: 0.35,
  })
  const exteriorFace = new THREE.MeshStandardMaterial({
    color: 0xd4b878, roughness: 0.85, metalness: 0.05,
    side: THREE.DoubleSide, transparent: true, opacity: 1.0,
  })
  const exteriorBase = new THREE.MeshStandardMaterial({
    color: 0xd8c8a0, roughness: 0.92, metalness: 0.02,
    side: THREE.DoubleSide, transparent: true, opacity: 1.0,
  })
  const voidMat = new THREE.MeshStandardMaterial({
    color: 0x4080ff, roughness: 0.5, metalness: 0.0,
    transparent: true, opacity: 0.15,
    emissive: 0x2040a0, emissiveIntensity: 0.3,
    side: THREE.DoubleSide,
  })
  return { limestone, limestoneLight, granite, darkGranite, bedrock, shaft, exteriorFace, exteriorBase, voidMat }
}

// ─── Passage helper ──────────────────────────────────────────────────────────

function createPassage(start, end, width, height, mat) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const dz = end.z - start.z
  const length = Math.sqrt(dx * dx + dy * dy + dz * dz)

  const geo = new THREE.BoxGeometry(width, height, length)
  const mesh = new THREE.Mesh(geo, mat)

  // Position at midpoint
  mesh.position.set(
    (start.x + end.x) / 2,
    (start.y + end.y) / 2,
    (start.z + end.z) / 2
  )

  // Align Z-axis of box with passage direction
  const dir = new THREE.Vector3(dx, dy, dz).normalize()
  const m4 = new THREE.Matrix4()
  const up = Math.abs(dir.y) > 0.99
    ? new THREE.Vector3(0, 0, 1)
    : new THREE.Vector3(0, 1, 0)
  m4.lookAt(new THREE.Vector3(), dir, up)
  mesh.quaternion.setFromRotationMatrix(m4)

  return mesh
}

// ─── Chamber helper ──────────────────────────────────────────────────────────

function createChamber(pos, w, d, h, mat) {
  // Semi-transparent chamber walls so interior contents are visible
  const chamberMat = mat.clone()
  chamberMat.transparent = true
  chamberMat.opacity = 0.35
  chamberMat.depthWrite = false
  const geo = new THREE.BoxGeometry(w, h, d)
  const mesh = new THREE.Mesh(geo, chamberMat)
  mesh.position.set(pos.x, pos.y + h / 2, pos.z)
  return mesh
}

function createSarcophagus(pos) {
  // Hollow granite coffer — open-top box with thick walls
  const group = new THREE.Group()
  const outerW = 2.28, outerD = 0.98, outerH = 1.05
  const wallT = 0.15  // wall thickness
  const floorT = 0.12 // floor thickness

  const sarcMat = new THREE.MeshStandardMaterial({
    color: 0xc09080, roughness: 0.6, metalness: 0.08, side: THREE.DoubleSide,
    emissive: 0xa07060, emissiveIntensity: 0.5,
  })

  // Floor slab
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(outerW, floorT, outerD), sarcMat
  )
  floor.position.y = floorT / 2

  // Long walls (front & back)
  const longWall = new THREE.BoxGeometry(outerW, outerH - floorT, wallT)
  const front = new THREE.Mesh(longWall, sarcMat)
  front.position.set(0, floorT + (outerH - floorT) / 2, outerD / 2 - wallT / 2)
  const back = new THREE.Mesh(longWall, sarcMat)
  back.position.set(0, floorT + (outerH - floorT) / 2, -outerD / 2 + wallT / 2)

  // Short walls (left & right)
  const shortWall = new THREE.BoxGeometry(wallT, outerH - floorT, outerD - wallT * 2)
  const left = new THREE.Mesh(shortWall, sarcMat)
  left.position.set(-outerW / 2 + wallT / 2, floorT + (outerH - floorT) / 2, 0)
  const right = new THREE.Mesh(shortWall, sarcMat)
  right.position.set(outerW / 2 - wallT / 2, floorT + (outerH - floorT) / 2, 0)

  group.add(floor, front, back, left, right)
  group.position.set(pos.x, pos.y, pos.z)
  return group
}

// ─── Exterior shell (instanced block geometry) ──────────────────────────────

function buildExterior(mt) {
  const group = new THREE.Group()
  const H = HALF

  // 60 courses, top 5 replaced by a larger capstone pyramidion.
  const GAP = 0.04
  const BLOCK_DEPTH = 1.2

  const transforms = []
  const colors = []

  function hash(a, b) {
    let h = (a * 127 + b * 311) & 0xffff
    h = ((h * 0x45d9f3b) >>> 0) & 0xffff
    return (h & 0xff) / 255
  }

  const sandBase = new THREE.Color(0.95, 0.92, 0.80)
  const sandWarm = new THREE.Color(1.0, 0.96, 0.85)
  const sandCool = new THREE.Color(0.90, 0.87, 0.78)

  const NUM_COURSES = 210
  const CAPSTONE_COURSES = 7
  const BLOCK_COURSES = NUM_COURSES - CAPSTONE_COURSES
  const courseH = HEIGHT / NUM_COURSES
  const BLOCK_W = courseH  // square blocks

  for (let course = 0; course < BLOCK_COURSES; course++) {
    const yBot = course * courseH
    const yMid = yBot + courseH / 2
    const blockH = courseH - GAP

    const tBot = yBot / HEIGHT
    const tTop = (yBot + courseH) / HEIGHT
    const halfBot = HALF * (1 - tBot)
    const halfTop = HALF * (1 - tTop)
    const halfMid = (halfBot + halfTop) / 2

    const stagger = (course % 2) * (BLOCK_W / 2)

    const faces = [
      { axis: 'z', sign: -1 },
      { axis: 'x', sign:  1 },
      { axis: 'z', sign:  1 },
      { axis: 'x', sign: -1 },
    ]

    for (let fi = 0; fi < faces.length; fi++) {
      const face = faces[fi]
      const facePos = halfMid * face.sign
      const faceLen = halfBot * 2

      const nBlocks = Math.max(1, Math.floor((faceLen + GAP) / BLOCK_W))
      const actualBlockW = (faceLen - GAP * nBlocks) / nBlocks

      for (let bi = 0; bi < nBlocks; bi++) {
        const t = (bi + 0.5) / nBlocks
        const along = -faceLen / 2 + t * faceLen + stagger

        if (Math.abs(along) > faceLen / 2 - actualBlockW * 0.3) continue

        const m4 = new THREE.Matrix4()
        let px, py, pz, sx, sz

        py = yMid

        if (face.axis === 'z') {
          px = along; pz = facePos
          sx = actualBlockW - GAP; sz = BLOCK_DEPTH
        } else {
          px = facePos; pz = along
          sx = BLOCK_DEPTH; sz = actualBlockW - GAP
        }

        m4.makeScale(sx, blockH, sz)
        m4.setPosition(px, py, pz)
        transforms.push(m4.clone())

        const h = hash(course * 4 + fi, bi)
        const col = sandBase.clone()
        if (h > 0.5) col.lerp(sandWarm, (h - 0.5) * 2)
        else col.lerp(sandCool, (0.5 - h) * 2)
        col.multiplyScalar(1.0 - (course / NUM_COURSES) * 0.15)
        colors.push(col)
      }
    }
  }

  // InstancedMesh for blocks
  const blockGeo = new THREE.BoxGeometry(1, 1, 1)
  const blockMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.85,
    metalness: 0.03,
    transparent: true,
    opacity: 1.0,
  })

  const instancedMesh = new THREE.InstancedMesh(blockGeo, blockMat, transforms.length)
  const colorAttr = new Float32Array(transforms.length * 3)

  for (let i = 0; i < transforms.length; i++) {
    instancedMesh.setMatrixAt(i, transforms[i])
    colorAttr[i * 3 + 0] = colors[i].r
    colorAttr[i * 3 + 1] = colors[i].g
    colorAttr[i * 3 + 2] = colors[i].b
  }

  instancedMesh.instanceMatrix.needsUpdate = true
  instancedMesh.instanceColor = new THREE.InstancedBufferAttribute(colorAttr, 3)
  group.add(instancedMesh)

  // ── Solid inner shell — prevents seeing through gaps between blocks ──
  const shellPositions = new Float32Array([
    -H, 0, -H,   H, 0, -H,   0, HEIGHT, 0,
     H, 0, -H,   H, 0,  H,   0, HEIGHT, 0,
     H, 0,  H,  -H, 0,  H,   0, HEIGHT, 0,
    -H, 0,  H,  -H, 0, -H,   0, HEIGHT, 0,
  ])
  const shellGeo = new THREE.BufferGeometry()
  shellGeo.setAttribute('position', new THREE.Float32BufferAttribute(shellPositions, 3))
  shellGeo.computeVertexNormals()
  const shellMat = new THREE.MeshStandardMaterial({
    color: 0xe0d8c0,
    roughness: 0.9,
    metalness: 0.0,
    emissive: 0xd0c8a8,
    emissiveIntensity: 0.2,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 1.0,
  })
  group.add(new THREE.Mesh(shellGeo, shellMat))

  // ── Capstone (pyramidion) — 5 courses tall, electrum/gold ──
  const capY = BLOCK_COURSES * courseH
  const capH = CAPSTONE_COURSES * courseH
  const capHalf = HALF * (1 - capY / HEIGHT)
  // ConeGeometry(radius, height, radialSegments) with 4 sides = pyramid
  const capRadius = capHalf * Math.SQRT2  // circumradius of square base
  const capGeo = new THREE.ConeGeometry(capRadius, capH, 4, 1)
  capGeo.rotateY(Math.PI / 4) // align square base with pyramid faces

  const capMat = new THREE.MeshStandardMaterial({
    color: 0xf5e680,
    roughness: 0.4,
    metalness: 0.0,
    emissive: 0xf0dc60,
    emissiveIntensity: 0.5,
  })
  const capstone = new THREE.Mesh(capGeo, capMat)
  capstone.position.y = capY + capH / 2 // ConeGeometry is centered on origin
  group.add(capstone)

  // Base
  const baseGeo = new THREE.PlaneGeometry(BASE, BASE)
  baseGeo.rotateX(-Math.PI / 2)
  group.add(new THREE.Mesh(baseGeo, mt.exteriorBase))

  group.userData.faceMaterial = blockMat
  group.userData.shellMaterial = shellMat
  group.userData.baseMaterial = mt.exteriorBase
  group.userData.capstoneMaterial = capMat
  return group
}

// ─── Wireframe overlay ───────────────────────────────────────────────────────

function buildWireframe() {
  // Simple pyramid outline — 4 edge lines from base corners to apex + base loop
  const H = HALF
  const lineVerts = [
    // Base loop
    -H, 0, -H,   H, 0, -H,
     H, 0, -H,   H, 0,  H,
     H, 0,  H,  -H, 0,  H,
    -H, 0,  H,  -H, 0, -H,
    // Edges to apex
    -H, 0, -H,   0, HEIGHT, 0,
     H, 0, -H,   0, HEIGHT, 0,
     H, 0,  H,   0, HEIGHT, 0,
    -H, 0,  H,   0, HEIGHT, 0,
  ]
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(lineVerts, 3))
  const mat = new THREE.LineBasicMaterial({
    color: 0xd4a050,
    transparent: true, opacity: 0.15,
  })
  const mesh = new THREE.LineSegments(geo, mat)
  mesh.visible = false
  return mesh
}

// ─── Grand Gallery (7-step corbelled) ────────────────────────────────────────

function buildGrandGallery(mt) {
  const group = new THREE.Group()
  const steps = 7
  const widths = [2.1, 1.92, 1.74, 1.56, 1.38, 1.19, 1.0]
  const totalH = 8.6
  const stepH = totalH / steps
  const wallT = 0.25

  for (let i = 0; i < steps; i++) {
    const w = widths[i]
    const prevW = i > 0 ? widths[i - 1] : w
    const y = stepH * i

    // Left wall slab
    const lGeo = new THREE.BoxGeometry(wallT, stepH, GAL_LEN)
    const lMesh = new THREE.Mesh(lGeo, mt.limestoneLight)
    lMesh.position.set(-w / 2 + wallT / 2, y + stepH / 2, 0)
    group.add(lMesh)

    // Right wall slab
    const rMesh = new THREE.Mesh(lGeo, mt.limestoneLight)
    rMesh.position.set(w / 2 - wallT / 2, y + stepH / 2, 0)
    group.add(rMesh)

    // Corbel ledge (the overhang step) — only from step 1 onward
    if (i > 0) {
      const ledgeW = (prevW - w) / 2
      const ledgeGeo = new THREE.BoxGeometry(ledgeW, 0.15, GAL_LEN)
      // Left ledge
      const llMesh = new THREE.Mesh(ledgeGeo, mt.limestoneLight)
      llMesh.position.set(-w / 2 - ledgeW / 2 + wallT / 2, y + 0.075, 0)
      group.add(llMesh)
      // Right ledge
      const rlMesh = new THREE.Mesh(ledgeGeo, mt.limestoneLight)
      rlMesh.position.set(w / 2 + ledgeW / 2 - wallT / 2, y + 0.075, 0)
      group.add(rlMesh)
    }
  }

  // Floor
  const floorGeo = new THREE.BoxGeometry(widths[0], 0.2, GAL_LEN)
  const floorMesh = new THREE.Mesh(floorGeo, mt.limestoneLight)
  floorMesh.position.y = 0.1
  group.add(floorMesh)

  // Ceiling cap
  const ceilGeo = new THREE.BoxGeometry(widths[6] + 0.1, 0.3, GAL_LEN)
  const ceilMesh = new THREE.Mesh(ceilGeo, mt.limestoneLight)
  ceilMesh.position.y = totalH + 0.15
  group.add(ceilMesh)

  // Position + rotate
  const mid = new THREE.Vector3(
    (ASC_END.x + GAL_END.x) / 2,
    (ASC_END.y + GAL_END.y) / 2,
    (ASC_END.z + GAL_END.z) / 2,
  )
  group.position.copy(mid)

  const dir = new THREE.Vector3().subVectors(GAL_END, ASC_END).normalize()
  const m4 = new THREE.Matrix4()
  m4.lookAt(new THREE.Vector3(), dir, new THREE.Vector3(0, 1, 0))
  group.quaternion.setFromRotationMatrix(m4)

  return group
}

// ─── Air shafts ──────────────────────────────────────────────────────────────

function buildAirShafts(chamberPos, chamberH, northAngle, southAngle, shaftLen, mat) {
  const shafts = new THREE.Group()
  const w = 0.22, h = 0.16

  // Shaft start: midway up the chamber wall
  const startY = chamberPos.y + chamberH / 2

  // North shaft
  const nEnd = new THREE.Vector3(
    chamberPos.x,
    startY + Math.sin(northAngle) * shaftLen,
    chamberPos.z - Math.cos(northAngle) * shaftLen
  )
  const nStart = new THREE.Vector3(chamberPos.x, startY, chamberPos.z)
  shafts.add(createPassage(nStart, nEnd, w, h, mat))

  // South shaft
  const sEnd = new THREE.Vector3(
    chamberPos.x,
    startY + Math.sin(southAngle) * shaftLen,
    chamberPos.z + Math.cos(southAngle) * shaftLen
  )
  const sStart = new THREE.Vector3(chamberPos.x, startY, chamberPos.z)
  shafts.add(createPassage(sStart, sEnd, w, h, mat))

  return shafts
}

// ─── Well shaft ──────────────────────────────────────────────────────────────

function buildWellShaft(mat) {
  // Near-vertical shaft from lower descending passage area up to Grand Gallery base
  const bottom = new THREE.Vector3(JUNCTION.x - 2, -25, JUNCTION.z + 5)
  const top = new THREE.Vector3(ASC_END.x - 2, ASC_END.y, ASC_END.z - 2)

  const length = bottom.distanceTo(top)
  const geo = new THREE.CylinderGeometry(0.4, 0.4, length, 8)
  const mesh = new THREE.Mesh(geo, mat)

  mesh.position.set(
    (bottom.x + top.x) / 2,
    (bottom.y + top.y) / 2,
    (bottom.z + top.z) / 2
  )

  // Align cylinder axis with shaft direction
  const dir = new THREE.Vector3().subVectors(top, bottom).normalize()
  const m4 = new THREE.Matrix4()
  const up = Math.abs(dir.y) > 0.99
    ? new THREE.Vector3(0, 0, 1)
    : new THREE.Vector3(0, 1, 0)
  m4.lookAt(new THREE.Vector3(), dir, up)
  const q = new THREE.Quaternion().setFromRotationMatrix(m4)
  // Cylinder default axis is Y, lookAt aligns Z — rotate 90° around X
  const fixQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2)
  mesh.quaternion.copy(q).multiply(fixQ)

  return mesh
}

// ─── Big Void (ScanPyramids 2017) — rendered as uncertainty ──────────────────

function buildBigVoid() {
  const group = new THREE.Group()

  // Position above and parallel to Grand Gallery
  const galMid = new THREE.Vector3(
    (ASC_END.x + GAL_END.x) / 2,
    (ASC_END.y + GAL_END.y) / 2 + 15,
    (ASC_END.z + GAL_END.z) / 2,
  )

  // Dashed wireframe ellipsoid outline
  const ellGeo = new THREE.SphereGeometry(1, 16, 12)
  ellGeo.scale(15, 4, 7)
  const edges = new THREE.EdgesGeometry(ellGeo)
  const dashMat = new THREE.LineDashedMaterial({
    color: 0x6090d0, transparent: true, opacity: 0.5,
    dashSize: 2, gapSize: 1.5,
  })
  const wireEll = new THREE.LineSegments(edges, dashMat)
  wireEll.computeLineDistances()
  wireEll.position.copy(galMid)
  wireEll.rotation.x = -PASS_ANGLE * 0.5
  group.add(wireEll)

  // Scattered point cloud inside bounds — suggests uncertainty
  const nPoints = 300
  const pointPositions = new Float32Array(nPoints * 3)
  for (let i = 0; i < nPoints; i++) {
    // Random point inside ellipsoid
    let x, y, z
    do {
      x = (Math.random() - 0.5) * 2
      y = (Math.random() - 0.5) * 2
      z = (Math.random() - 0.5) * 2
    } while (x * x + y * y + z * z > 1)
    pointPositions[i * 3] = x * 15
    pointPositions[i * 3 + 1] = y * 4
    pointPositions[i * 3 + 2] = z * 7
  }
  const pointGeo = new THREE.BufferGeometry()
  pointGeo.setAttribute('position', new THREE.Float32BufferAttribute(pointPositions, 3))
  const pointMat = new THREE.PointsMaterial({
    color: 0x80b0e0, size: 0.6, transparent: true, opacity: 0.35,
    sizeAttenuation: true,
  })
  const points = new THREE.Points(pointGeo, pointMat)
  points.position.copy(galMid)
  points.rotation.x = -PASS_ANGLE * 0.5
  group.add(points)

  return group
}

// ─── Relieving chambers (with Campbell's pointed roof) ──────────────────────

function buildRelievingChambers(mt) {
  const group = new THREE.Group()
  const w = 10.47, d = 5.23
  const heights = [1.5, 2.0, 1.8, 1.5, 2.5]
  let y = KINGS.y + 5.8

  const names = [
    "Davison's Chamber", "Wellington's Chamber",
    "Nelson's Chamber", "Lady Arbuthnot's Chamber", "Campbell's Chamber"
  ]

  for (let i = 0; i < 5; i++) {
    const h = heights[i]
    const mat = i < 4 ? mt.granite : mt.limestone
    const mesh = createChamber(new THREE.Vector3(KINGS.x, y, KINGS.z), w, d, h, mat)
    mesh.userData.feature = {
      name: names[i],
      type: 'Relieving Chamber',
      dimensions: `${w}m × ${d}m × ${h}m`,
      elevation: `${Math.round(y)}m above base`,
      material: i < 4 ? 'Red Aswan granite' : 'Limestone (pointed roof)',
      description: i === 4
        ? 'The uppermost relieving chamber with a distinctive pointed limestone roof. Contains the only known builder\'s graffiti — cartouches of Pharaoh Khufu painted in red ochre.'
        : `One of five chambers stacked above the King\'s Chamber to redistribute the immense weight of the ${Math.round(HEIGHT - y)}m of masonry above.`,
    }
    group.add(mesh)
    y += h + 0.3
  }

  // Campbell's Chamber pointed gable roof
  const roofH = 3.0
  const roofY = y - 0.3 // top of last chamber
  const hw = w / 2, hd = d / 2
  const roofVerts = new Float32Array([
    // Front triangle
    -hw, 0, -hd,  hw, 0, -hd,  0, roofH, 0,
    // Back triangle
    hw, 0, hd,  -hw, 0, hd,  0, roofH, 0,
    // Left slope
    -hw, 0, -hd,  0, roofH, 0,  -hw, 0, hd,
    -hw, 0, hd,  0, roofH, 0,  -hw, 0, hd, // degenerate, replace below
    // Right slope
    hw, 0, -hd,  hw, 0, hd,  0, roofH, 0,
  ])
  // Simpler: use two quads (left slope + right slope) as triangles
  const roofPositions = new Float32Array([
    // Left slope (2 tris)
    -hw, 0, -hd,   0, roofH, 0,  -hw, 0, hd,
    -hw, 0, hd,    0, roofH, 0,   0, roofH, 0, // degenerate — skip
    // Right slope (2 tris)
    hw, 0, -hd,   hw, 0, hd,    0, roofH, 0,
    // Front gable
    -hw, 0, -hd,   hw, 0, -hd,  0, roofH, 0,
    // Back gable
    hw, 0, hd,   -hw, 0, hd,   0, roofH, 0,
  ])
  // Better approach: 4 triangles
  const gableVerts = new Float32Array([
    -hw, 0, -hd,  hw, 0, -hd,  0, roofH, 0,  // front
    hw, 0, hd,  -hw, 0, hd,   0, roofH, 0,   // back
    -hw, 0, -hd,  0, roofH, 0, -hw, 0, hd,   // left
    hw, 0, -hd,  hw, 0, hd,    0, roofH, 0,  // right
  ])
  const gableGeo = new THREE.BufferGeometry()
  gableGeo.setAttribute('position', new THREE.Float32BufferAttribute(gableVerts, 3))
  gableGeo.computeVertexNormals()
  const gable = new THREE.Mesh(gableGeo, mt.limestone)
  gable.position.set(KINGS.x, roofY, KINGS.z)
  group.add(gable)

  return group
}

// ─── Scale figures (human silhouettes for reference) ────────────────────────

function buildScaleFigures() {
  const group = new THREE.Group()
  const figMat = new THREE.MeshStandardMaterial({
    color: 0x3a3020, roughness: 0.9, metalness: 0.0,
    transparent: true, opacity: 0.7,
    emissive: 0x201810, emissiveIntensity: 0.2,
  })

  function makeFigure(x, y, z) {
    const fig = new THREE.Group()
    // Body
    const bodyGeo = new THREE.CylinderGeometry(0.2, 0.22, 1.4, 8)
    const body = new THREE.Mesh(bodyGeo, figMat)
    body.position.y = 0.7
    fig.add(body)
    // Head
    const headGeo = new THREE.SphereGeometry(0.15, 8, 6)
    const head = new THREE.Mesh(headGeo, figMat)
    head.position.y = 1.55
    fig.add(head)
    fig.position.set(x, y, z)
    return fig
  }

  // At entrance (shows passage scale)
  group.add(makeFigure(ENTRANCE.x + 1.5, ENTRANCE.y - 0.5, ENTRANCE.z))
  // Inside Grand Gallery (shows dramatic height)
  const galMidY = (ASC_END.y + GAL_END.y) / 2
  const galMidZ = (ASC_END.z + GAL_END.z) / 2
  group.add(makeFigure(ASC_END.x, galMidY - 2, galMidZ))
  // Next to sarcophagus
  group.add(makeFigure(KINGS.x + 3, KINGS.y, KINGS.z))
  // At base exterior (shows massive scale)
  group.add(makeFigure(5, 0, -(HALF + 5)))

  return group
}

// ─── Granite plugs (3 blocks sealing ascending passage) ─────────────────────

function buildGranitePlugs(mt) {
  const group = new THREE.Group()
  const plugLengths = [1.57, 1.67, 1.0]
  let dist = 0
  for (const len of plugLengths) {
    const start = new THREE.Vector3(
      JUNCTION.x,
      JUNCTION.y + sinA * dist,
      JUNCTION.z + cosA * dist // ascending direction from junction
    )
    const end = new THREE.Vector3(
      JUNCTION.x,
      JUNCTION.y + sinA * (dist + len),
      JUNCTION.z + cosA * (dist + len)
    )
    group.add(createPassage(start, end, PASS_W + 0.1, PASS_H + 0.1, mt.granite))
    dist += len + 0.05
  }
  return group
}

// ─── Al-Mamun's Tunnel (832 CE forced entry) ────────────────────────────────

function buildAlMamunTunnel(mt) {
  const group = new THREE.Group()
  const tunnelMat = new THREE.MeshStandardMaterial({
    color: 0x908060, roughness: 0.95, metalness: 0.01, side: THREE.DoubleSide,
    emissive: 0x605040, emissiveIntensity: 0.2,
  })

  // Enters north face at ~7m height, runs ~27m roughly horizontal (south)
  const entryZ = northFaceZ(7)
  const entry = new THREE.Vector3(7, 7, entryZ)
  const bend = new THREE.Vector3(7, 7, entryZ + 27)
  group.add(createPassage(entry, bend, 1.0, 1.0, tunnelMat))

  // Turns left (east) ~5m to reach ascending passage past granite plugs
  const end = new THREE.Vector3(JUNCTION.x, JUNCTION.y + 2, JUNCTION.z + 2)
  group.add(createPassage(bend, end, 1.0, 1.0, tunnelMat))

  return group
}

// ─── Queen's Chamber niche ───────────────────────────────────────────────────

function buildQueensNiche(mt) {
  // Corbelled niche on east wall, 4.7m tall, 1.0m deep, stepping inward
  const group = new THREE.Group()
  const steps = 5
  const totalH = 4.7
  const baseW = 1.6, topW = 0.5
  const depth = 1.0
  const stepH = totalH / steps

  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1)
    const w = baseW - (baseW - topW) * t
    const d = depth - t * 0.3
    const geo = new THREE.BoxGeometry(d, stepH, w)
    const mesh = new THREE.Mesh(geo, mt.limestone)
    mesh.position.set(
      QUEENS.x + 5.75 / 2 - d / 2, // east wall
      QUEENS.y + stepH * i + stepH / 2,
      QUEENS.z
    )
    group.add(mesh)
  }
  return group
}

// ─── Feature info data ───────────────────────────────────────────────────────

const FEATURES = {
  descendingPassage: {
    name: 'Descending Passage',
    type: 'Passage',
    dimensions: '~105m long, 1.2m × 1.1m',
    angle: '26.3° downward',
    elevation: 'From 17m above base to 27m below',
    material: 'Limestone masonry → bedrock',
    description: 'The original entrance passage, cut through the pyramid\'s masonry and continuing down into the bedrock beneath. Used since antiquity to access the subterranean chamber.',
  },
  ascendingPassage: {
    name: 'Ascending Passage',
    type: 'Passage',
    dimensions: '39.3m long, 1.2m × 1.1m',
    angle: '26.3° upward',
    elevation: '4.6m → 22.0m above base',
    material: 'Limestone',
    description: 'Branches from the Descending Passage, originally sealed with three massive granite plugs. First opened by Caliph al-Ma\'mun\'s workers c. 832 CE by tunneling around the plugs.',
  },
  grandGallery: {
    name: 'Grand Gallery',
    type: 'Gallery',
    dimensions: '46.68m long, 2.1m (base) → 1.0m (top), 8.6m tall',
    angle: '26.3° upward',
    elevation: '22.0m → 42.7m above base',
    material: 'Limestone, 7-step corbelled walls',
    description: 'An architectural masterpiece — a corbelled hall narrowing from 2.1m at the base to 1.0m at the top through seven successive overhangs. The most impressive interior space of the pyramid. Its immense size relative to its function remains debated.',
  },
  queensChamber: {
    name: 'Queen\'s Chamber',
    type: 'Chamber',
    dimensions: '5.75m × 5.23m × 6.26m (pointed ceiling)',
    elevation: '21m above base',
    material: 'Limestone',
    description: 'Despite its name (given by Arab explorers), this chamber was likely not for any queen. Features a large corbelled niche (4.7m tall) on the east wall and two narrow shafts that do not reach the exterior.',
  },
  kingsChamber: {
    name: 'King\'s Chamber',
    type: 'Chamber',
    dimensions: '10.47m × 5.23m × 5.8m',
    elevation: '43m above base',
    material: 'Red Aswan granite',
    description: 'The main burial chamber, constructed entirely of red granite hauled 900 km from Aswan. Contains a lidless granite sarcophagus. Five relieving chambers above distribute the weight of the pyramid. Two air shafts exit through the north and south faces.',
  },
  subterranean: {
    name: 'Subterranean Chamber',
    type: 'Chamber',
    dimensions: '14.1m × 8.4m × ~4m',
    elevation: '27m below base level',
    material: 'Carved from bedrock',
    description: 'The deepest chamber, cut into the living rock beneath the pyramid. Left unfinished — the floor is rough and uneven, with a mysterious pit dug into it. Its original purpose is unknown; it may represent an abandoned burial plan.',
  },
  bigVoid: {
    name: 'Big Void',
    type: 'Discovery (2017)',
    dimensions: '~30–40m long (estimated)',
    elevation: '~55–65m above base',
    material: 'Unknown — detected by muon imaging',
    description: 'Discovered in 2017 by the ScanPyramids project using cosmic-ray muon tomography. Published in Nature, this large void above the Grand Gallery has unknown purpose and exact shape. It may be a structural feature, a construction ramp, or an undiscovered chamber.',
  },
  wellShaft: {
    name: 'Well Shaft',
    type: 'Shaft',
    dimensions: '~0.8m diameter, ~50m long',
    elevation: 'From ~-25m to ~22m',
    material: 'Cut through masonry and bedrock',
    description: 'A near-vertical shaft connecting the lower Descending Passage area to the Grand Gallery. May have served as an escape route for workers who sealed the Ascending Passage with granite plugs from inside.',
  },
  sarcophagus: {
    name: 'Granite Sarcophagus',
    type: 'Artifact',
    dimensions: '2.28m × 0.98m × 1.05m',
    elevation: '43m above base (King\'s Chamber floor)',
    material: 'Red granite, hollowed and polished',
    description: 'A lidless granite coffer, slightly wider than the Ascending Passage — it must have been placed during construction. No lid or contents have ever been found. Drill marks suggest advanced stone-working techniques.',
  },
  airShaftsKing: {
    name: 'King\'s Chamber Air Shafts',
    type: 'Shaft',
    dimensions: '~20cm × 14cm cross-section, ~70m long',
    angle: 'North: ~37°, South: ~38°',
    elevation: 'From 43m to near exterior',
    material: 'Limestone',
    description: 'Two narrow shafts emanating from the King\'s Chamber toward the north and south faces. Originally thought to be ventilation, they may have had astronomical or ritual significance — the northern shaft aligned with the celestial pole, the southern with Orion\'s Belt.',
  },
  airShaftsQueen: {
    name: 'Queen\'s Chamber Shafts',
    type: 'Shaft',
    dimensions: '~22cm × 20cm cross-section',
    angle: '~32° (both)',
    elevation: 'From 21m, not reaching exterior',
    material: 'Limestone',
    description: 'Two shafts discovered in 1872 by Waynman Dixon. Unlike the King\'s Chamber shafts, these do not reach the exterior or the chamber itself — they were sealed at both ends. A small bronze hook, a stone ball, and a cedar plank were found inside.',
  },
  antechamber: {
    name: 'Antechamber',
    type: 'Chamber',
    dimensions: '~3m long × 1.4m wide × 3.6m high',
    elevation: '43m above base',
    material: 'Granite (portcullis grooves)',
    description: 'A small room between the Grand Gallery and King\'s Chamber, featuring granite portcullis slabs that could be lowered to seal the burial chamber. Three vertical grooves in the walls held these blocking stones.',
  },
  entrance: {
    name: 'Original Entrance',
    type: 'Entrance',
    dimensions: '~1.2m × 1.1m opening',
    elevation: '17m above base (course 19)',
    material: 'Limestone, originally concealed by casing stones',
    description: 'Located on the north face, 17 metres above ground level. Known since antiquity, though the exact original concealment method is debated. The classical geographer Strabo described a hinged stone that could be raised.',
  },
  relievingChambers: {
    name: 'Relieving Chambers',
    type: 'Structural',
    dimensions: '5 chambers stacked above King\'s Chamber',
    elevation: '49–63m above base',
    material: 'Granite beams (lower 4), limestone gable (top)',
    description: 'Five chambers stacked above the King\'s Chamber to distribute the immense weight of the pyramid. The top chamber (Campbell\'s) has a pointed gable roof. Discovered by Nathaniel Davison (1765) and Howard Vyse (1837). Ancient quarry marks naming Khufu were found inside.',
  },
  granitePl: {
    name: 'Granite Plugs',
    type: 'Blockage',
    dimensions: '3 blocks: 1.57m, 1.67m, 1.0m long',
    elevation: '~4.6m above base',
    material: 'Red Aswan granite (~60 tons total)',
    description: 'Three massive granite blocks that sealed the base of the Ascending Passage after burial. They were slid down from the Grand Gallery. Al-Ma\'mun\'s workers (c. 832 CE) tunneled around them through softer limestone to access the upper chambers.',
  },
  alMamun: {
    name: 'Al-Ma\'mun\'s Tunnel',
    type: 'Forced Entry',
    dimensions: '~27m long, rough-cut',
    elevation: '~7m above base',
    material: 'Cut through limestone core blocks',
    description: 'Forced in c. 832 CE by Caliph al-Ma\'mun\'s workers, entering the north face below the original entrance. After tunneling ~27m, they heard the sound of a stone falling (a prism block dislodged by vibration) and turned to reach the Descending Passage, bypassing the granite plugs.',
  },
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function createPyramidModel() {
  const mt = makeMaterials()
  const exterior = buildExterior(mt)
  const interior = new THREE.Group()
  const wireframe = buildWireframe()
  const clickTargets = []

  function addFeature(mesh, featureKey) {
    mesh.userData.feature = FEATURES[featureKey]
    mesh.userData.featureKey = featureKey
    interior.add(mesh)
    clickTargets.push(mesh)
    return mesh
  }

  function addMesh(mesh) {
    interior.add(mesh)
    return mesh
  }

  // ── Descending Passage ──
  // Upper section: entrance → junction (through masonry)
  addFeature(
    createPassage(ENTRANCE, JUNCTION, PASS_W, PASS_H, mt.limestone),
    'descendingPassage'
  )
  // Lower section: junction → deep into bedrock
  addMesh(createPassage(JUNCTION, DESC_END, PASS_W, PASS_H, mt.bedrock))

  // ── Subterranean Chamber ──
  addFeature(
    createChamber(SUBTERRANEAN, 14.1, 8.4, 4, mt.bedrock),
    'subterranean'
  )

  // ── Ascending Passage ──
  addFeature(
    createPassage(JUNCTION, ASC_END, PASS_W, PASS_H, mt.limestone),
    'ascendingPassage'
  )

  // ── Queen's horizontal passage ──
  addMesh(createPassage(
    ASC_END,
    new THREE.Vector3(QUEENS.x, ASC_END.y, QUEENS.z),
    PASS_W, PASS_H, mt.limestone
  ))

  // ── Queen's Chamber ──
  addFeature(
    createChamber(QUEENS, 5.75, 5.23, 6.26, mt.limestone),
    'queensChamber'
  )
  // Niche
  const niche = buildQueensNiche(mt)
  if (niche.children.length) addMesh(niche)

  // ── Grand Gallery ──
  const gallery = buildGrandGallery(mt)
  gallery.userData.feature = FEATURES.grandGallery
  interior.add(gallery)
  // Add a simplified clickable box at gallery center for raycasting
  const galCenter = new THREE.Vector3(
    (ASC_END.x + GAL_END.x) / 2,
    (ASC_END.y + GAL_END.y) / 2,
    (ASC_END.z + GAL_END.z) / 2,
  )
  const galClickGeo = new THREE.BoxGeometry(2.1, 8.6, GAL_LEN)
  const galClickMesh = new THREE.Mesh(galClickGeo, new THREE.MeshBasicMaterial({ visible: false }))
  galClickMesh.position.copy(galCenter)
  const galDir = new THREE.Vector3().subVectors(GAL_END, ASC_END).normalize()
  const galM4 = new THREE.Matrix4().lookAt(new THREE.Vector3(), galDir, new THREE.Vector3(0, 1, 0))
  galClickMesh.quaternion.setFromRotationMatrix(galM4)
  galClickMesh.userData.feature = FEATURES.grandGallery
  galClickMesh.userData.featureKey = 'grandGallery'
  interior.add(galClickMesh)
  clickTargets.push(galClickMesh)

  // ── Antechamber ──
  const antechamberPos = new THREE.Vector3(
    GAL_END.x, GAL_END.y, GAL_END.z + 1.5
  )
  // Transition antechamber Y to King's Chamber level
  antechamberPos.y = KINGS.y
  addFeature(
    createChamber(antechamberPos, 1.4, 3, 3.6, mt.granite),
    'antechamber'
  )

  // ── King's Chamber ──
  addFeature(
    createChamber(KINGS, 10.47, 5.23, 5.8, mt.granite),
    'kingsChamber'
  )

  // ── Sarcophagus — hollow granite coffer ──
  const sarcPos = new THREE.Vector3(KINGS.x + 1.5, KINGS.y, KINGS.z)
  const sarc = createSarcophagus(sarcPos)
  sarc.userData.feature = FEATURES.sarcophagus
  interior.add(sarc)
  // Add invisible click target over the sarcophagus group
  const sarcClickGeo = new THREE.BoxGeometry(2.28, 1.05, 0.98)
  const sarcClick = new THREE.Mesh(sarcClickGeo, new THREE.MeshBasicMaterial({ visible: false }))
  sarcClick.position.set(sarcPos.x, sarcPos.y + 0.525, sarcPos.z)
  sarcClick.userData.feature = FEATURES.sarcophagus
  sarcClick.userData.featureKey = 'sarcophagus'
  interior.add(sarcClick)
  clickTargets.push(sarcClick)

  // ── Relieving Chambers ──
  const relieving = buildRelievingChambers(mt)
  interior.add(relieving)
  // Add the topmost as a click target for the group
  if (relieving.children.length > 0) {
    const topRelieving = relieving.children[relieving.children.length - 1]
    topRelieving.userData.featureKey = 'relievingChambers'
    clickTargets.push(topRelieving)
  }

  // ── Air Shafts — King's Chamber ──
  const kcShafts = buildAirShafts(KINGS, 5.8, 37 * Math.PI / 180, 38 * Math.PI / 180, 65, mt.shaft)
  kcShafts.userData.feature = FEATURES.airShaftsKing
  interior.add(kcShafts)

  // ── Air Shafts — Queen's Chamber ──
  const qcShafts = buildAirShafts(QUEENS, 6.26, 32 * Math.PI / 180, 32 * Math.PI / 180, 55, mt.shaft)
  qcShafts.userData.feature = FEATURES.airShaftsQueen
  interior.add(qcShafts)

  // ── Well Shaft ──
  const wellMesh = buildWellShaft(mt.shaft)
  wellMesh.userData.feature = FEATURES.wellShaft
  wellMesh.userData.featureKey = 'wellShaft'
  interior.add(wellMesh)
  clickTargets.push(wellMesh)

  // ── Big Void ──
  const bigVoid = buildBigVoid()
  bigVoid.userData.feature = FEATURES.bigVoid
  interior.add(bigVoid)
  // Use the wireframe as click target
  if (bigVoid.children.length > 0) {
    bigVoid.children[0].userData.feature = FEATURES.bigVoid
    bigVoid.children[0].userData.featureKey = 'bigVoid'
    clickTargets.push(bigVoid.children[0])
  }

  // ── Granite Plugs ──
  const plugs = buildGranitePlugs(mt)
  plugs.userData.feature = {
    name: 'Granite Plugs',
    type: 'Seal',
    dimensions: '3 blocks: 1.57m, 1.67m, 1.0m long',
    elevation: '~5m above base',
    material: 'Red Aswan granite',
    description: 'Three massive granite blocks that sealed the Ascending Passage from the inside. Caliph al-Ma\'mun\'s workers (c. 832 CE) could not move them and instead tunneled around them through the softer limestone.',
  }
  interior.add(plugs)

  // ── Al-Mamun's Tunnel ──
  const tunnel = buildAlMamunTunnel(mt)
  tunnel.userData.feature = {
    name: "Al-Ma'mun's Tunnel",
    type: 'Tunnel (832 CE)',
    dimensions: '~27m horizontal + ~5m turn',
    elevation: '~7m above base',
    material: 'Rough-hewn through limestone core',
    description: 'Forced entry cut by Caliph al-Ma\'mun\'s workers around 832 CE, bypassing the granite plugs that sealed the Ascending Passage. This rough-hewn tunnel is the entrance used by tourists today.',
  }
  interior.add(tunnel)

  // ── Scale Figures ──
  interior.add(buildScaleFigures())

  // Interior starts hidden
  interior.visible = false

  // ── Label anchor positions for CSS2D labels ──
  const galMid = new THREE.Vector3(
    (ASC_END.x + GAL_END.x) / 2,
    (ASC_END.y + GAL_END.y) / 2,
    (ASC_END.z + GAL_END.z) / 2,
  )
  const labelAnchors = {
    entrance:          { pos: ENTRANCE.clone().add(new THREE.Vector3(0, 3, 0)), name: 'Entrance' },
    descendingPassage: { pos: new THREE.Vector3(ENTRANCE.x, (ENTRANCE.y + JUNCTION.y) / 2, (ENTRANCE.z + JUNCTION.z) / 2), name: 'Descending Passage' },
    ascendingPassage:  { pos: new THREE.Vector3(JUNCTION.x, (JUNCTION.y + ASC_END.y) / 2 + 2, (JUNCTION.z + ASC_END.z) / 2), name: 'Ascending Passage' },
    grandGallery:      { pos: galMid.clone().add(new THREE.Vector3(0, 5, 0)), name: 'Grand Gallery' },
    queensChamber:     { pos: QUEENS.clone().add(new THREE.Vector3(0, 8, 0)), name: "Queen's Chamber" },
    kingsChamber:      { pos: KINGS.clone().add(new THREE.Vector3(0, 8, 0)), name: "King's Chamber" },
    antechamber:       { pos: new THREE.Vector3(GAL_END.x, KINGS.y + 5, GAL_END.z + 1.5), name: 'Antechamber' },
    relievingChambers: { pos: KINGS.clone().add(new THREE.Vector3(0, 16, 0)), name: 'Relieving Chambers' },
    subterranean:      { pos: SUBTERRANEAN.clone().add(new THREE.Vector3(0, 6, 0)), name: 'Subterranean Chamber' },
    sarcophagus:       { pos: new THREE.Vector3(KINGS.x + 1.5, KINGS.y + 3, KINGS.z), name: 'Sarcophagus' },
    bigVoid:           { pos: galMid.clone().add(new THREE.Vector3(0, 18, 0)), name: 'Big Void (2017)' },
    wellShaft:         { pos: new THREE.Vector3(JUNCTION.x - 2, (ASC_END.y - 25) / 2 + 5, (ASC_END.z + JUNCTION.z) / 2), name: 'Well Shaft' },
    granitePl:         { pos: JUNCTION.clone().add(new THREE.Vector3(0, 3, 2)), name: 'Granite Plugs' },
    alMamun:           { pos: new THREE.Vector3(7, 10, northFaceZ(7) + 13), name: "Al-Ma'mun's Tunnel" },
  }

  return { exterior, interior, wireframe, clickTargets, labelAnchors, features: FEATURES }
}
