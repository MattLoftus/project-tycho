import * as THREE from 'three'

/**
 * DNA Double Helix to Chromosome — procedural model.
 *
 * Coordinate system:
 *   Origin = center of helix / chromosome
 *   Y up, 1 unit ~ 1 angstrom (helix) or ~1 nm (chromosome)
 *
 * Two groups:
 *   helix — molecular-scale double helix (~20 base pairs)
 *   chromosome — cellular-scale packaging hierarchy
 *
 * Aesthetic: cinematic sci-fi — glassy translucent backbones,
 * luminous base pair bridges, floating particles, strong glow.
 */

// ─── Feature data ────────────────────────────────────────────────────────────

const FEATURES = {
  backbone: {
    name: 'Sugar-Phosphate Backbone',
    type: 'Structure',
    dimensions: '~2 nm helix diameter',
    description: 'The structural framework of DNA, consisting of alternating deoxyribose sugar and phosphate groups linked by phosphodiester bonds. The two antiparallel strands run in opposite 5\u2032\u21923\u2032 directions, forming the outer rails of the double helix. Watson and Crick, building on Rosalind Franklin\u2019s X-ray crystallography (Photo 51, 1952), described this structure in 1953.',
  },
  basePairs: {
    name: 'Base Pairs',
    type: 'Structure',
    dimensions: '0.34 nm between pairs, 10 pairs per turn',
    description: 'Nitrogenous bases project inward from the backbone and pair via hydrogen bonds: adenine (A) with thymine (T) via 2 H-bonds, guanine (G) with cytosine (C) via 3 H-bonds. This complementary base pairing (Chargaff\u2019s rules) enables faithful DNA replication and underlies the genetic code.',
  },
  hydrogenBonds: {
    name: 'Hydrogen Bonds',
    type: 'Bond',
    dimensions: 'A-T: 2 bonds, G-C: 3 bonds',
    description: 'Weak individually but collectively strong, hydrogen bonds between complementary bases hold the two strands together. G-C pairs are more stable than A-T pairs due to the extra bond, which is why GC-rich regions have higher melting temperatures.',
  },
  majorGroove: {
    name: 'Major Groove',
    type: 'Structure',
    dimensions: '~2.2 nm wide',
    description: 'The wider of the two grooves formed by the helical twist of the backbone strands. Transcription factors and regulatory proteins preferentially bind in the major groove because it exposes more of the base pair edges, allowing sequence-specific recognition without unwinding the helix.',
  },
  minorGroove: {
    name: 'Minor Groove',
    type: 'Structure',
    dimensions: '~1.2 nm wide',
    description: 'The narrower groove on the opposite side of the helix from the major groove. Some proteins and small molecules (e.g., DAPI, Hoechst stains) bind here. The minor groove provides less sequence information but is important for certain DNA-binding drugs and antibiotics.',
  },
  nucleotides: {
    name: 'Nucleotides',
    type: 'Monomer',
    dimensions: 'Each ~0.34 nm along the helix axis',
    description: 'The repeating monomers of DNA, each consisting of a phosphate group, a deoxyribose sugar, and one of four nitrogenous bases (A, T, G, C). The human genome contains approximately 3.2 billion nucleotide pairs. Nucleotides also serve as energy carriers (ATP) and signaling molecules (cAMP).',
  },
  nucleosome: {
    name: 'Nucleosome',
    type: 'Complex',
    dimensions: '~11 nm diameter, ~5.5 nm height',
    description: 'The fundamental repeating unit of chromatin: ~147 base pairs of DNA wrapped 1.65 turns around an octamer of histone proteins (two each of H2A, H2B, H3, H4). Discovered by Roger Kornberg in 1974. Nucleosomes compact DNA ~6-fold and regulate gene access through histone modifications.',
  },
  chromatin: {
    name: 'Chromatin Fiber',
    type: 'Structure',
    dimensions: '~30 nm diameter (debated)',
    description: 'The next level of DNA packaging: nucleosomes fold into a higher-order fiber, historically described as a 30 nm solenoid or zigzag structure. Recent cryo-EM studies suggest chromatin in vivo may be more irregular. Histone H1 (linker histone) helps stabilize the folded fiber. Euchromatin is loosely packed and transcriptionally active; heterochromatin is tightly packed and silent.',
  },
  centromere: {
    name: 'Centromere',
    type: 'Region',
    dimensions: 'Typically 0.3\u20135 Mb of repetitive DNA',
    description: 'The constricted region where sister chromatids are joined and where the kinetochore assembles during cell division. Contains highly repetitive alpha-satellite DNA sequences. The kinetochore attaches to spindle microtubules, ensuring accurate chromosome segregation. Centromere position defines chromosome morphology (metacentric, acrocentric, telocentric).',
  },
  telomere: {
    name: 'Telomeres',
    type: 'Region',
    dimensions: '~5\u201315 kb (TTAGGG repeats in humans)',
    description: 'Protective caps at chromosome ends consisting of tandem TTAGGG repeats and associated shelterin protein complex. They prevent chromosome fusion and degradation, solving the end-replication problem. Telomeres shorten with each cell division; the enzyme telomerase (discovered by Blackburn, Greider, and Szostak \u2014 Nobel Prize 2009) can extend them in stem cells and cancer cells.',
  },
}

// ─── Materials ───────────────────────────────────────────────────────────────

function makeMaterials() {
  // Theme blue: #60a0e0 — backbone, bases, and accents derive from this
  // Corresponding red: #e06080, green: #60e0a0, amber: #e0a060

  // Backbone strands — self-illuminated, matte holographic
  const backboneBlue = new THREE.MeshStandardMaterial({
    color: 0x60a0e0, roughness: 0.6, metalness: 0.0,
    side: THREE.DoubleSide,
    emissive: 0x60a0e0, emissiveIntensity: 0.8,
    transparent: true, opacity: 0.8, depthWrite: false,
  })
  const backboneOrange = new THREE.MeshStandardMaterial({
    color: 0xe06080, roughness: 0.6, metalness: 0.0,
    side: THREE.DoubleSide,
    emissive: 0xe06080, emissiveIntensity: 0.8,
    transparent: true, opacity: 0.8, depthWrite: false,
  })

  // Base pairs — thin luminous bridges
  const baseA = new THREE.MeshStandardMaterial({
    color: 0x60e0a0, roughness: 0.5, metalness: 0.0, side: THREE.DoubleSide,
    emissive: 0x60e0a0, emissiveIntensity: 0.7,
    transparent: true, opacity: 0.7, depthWrite: false,
  })
  const baseT = new THREE.MeshStandardMaterial({
    color: 0xe06080, roughness: 0.5, metalness: 0.0, side: THREE.DoubleSide,
    emissive: 0xe06080, emissiveIntensity: 0.7,
    transparent: true, opacity: 0.7, depthWrite: false,
  })
  const baseG = new THREE.MeshStandardMaterial({
    color: 0x60a0e0, roughness: 0.5, metalness: 0.0, side: THREE.DoubleSide,
    emissive: 0x60a0e0, emissiveIntensity: 0.7,
    transparent: true, opacity: 0.7, depthWrite: false,
  })
  const baseC = new THREE.MeshStandardMaterial({
    color: 0xe0a060, roughness: 0.5, metalness: 0.0, side: THREE.DoubleSide,
    emissive: 0xe0a060, emissiveIntensity: 0.7,
    transparent: true, opacity: 0.7, depthWrite: false,
  })

  // Hydrogen bonds — faint connectors in theme blue
  const hBond = new THREE.MeshStandardMaterial({
    color: 0x80b0d0, roughness: 0.5, metalness: 0.0, side: THREE.DoubleSide,
    emissive: 0x60a0e0, emissiveIntensity: 0.8,
    transparent: true, opacity: 0.55, depthWrite: false,
  })

  // Nucleotide markers — bright nodes in theme blue
  const nucleotide = new THREE.MeshStandardMaterial({
    color: 0x80c0f0, roughness: 0.5, metalness: 0.0, side: THREE.DoubleSide,
    emissive: 0x60a0e0, emissiveIntensity: 0.9,
  })

  // Chromosome materials — same palette family
  const histone = new THREE.MeshStandardMaterial({
    color: 0x8080c0, roughness: 0.5, metalness: 0.0, side: THREE.DoubleSide,
    emissive: 0x6060a0, emissiveIntensity: 0.6,
  })
  const linkerDNA = new THREE.MeshStandardMaterial({
    color: 0x60a0e0, roughness: 0.5, metalness: 0.0, side: THREE.DoubleSide,
    emissive: 0x60a0e0, emissiveIntensity: 0.5,
  })
  const chromatinFiber = new THREE.MeshStandardMaterial({
    color: 0x8090c0, roughness: 0.5, metalness: 0.0, side: THREE.DoubleSide,
    emissive: 0x6080b0, emissiveIntensity: 0.5,
  })
  const chromosomeBody = new THREE.MeshStandardMaterial({
    color: 0x9070b0, roughness: 0.5, metalness: 0.0,
    side: THREE.DoubleSide,
    emissive: 0x7060a0, emissiveIntensity: 0.6,
  })
  const centromereMat = new THREE.MeshStandardMaterial({
    color: 0xe06080, roughness: 0.5, metalness: 0.0, side: THREE.DoubleSide,
    emissive: 0xe06080, emissiveIntensity: 0.6,
  })
  const telomereMat = new THREE.MeshStandardMaterial({
    color: 0x60e0a0, roughness: 0.5, metalness: 0.0, side: THREE.DoubleSide,
    emissive: 0x60e0a0, emissiveIntensity: 0.6,
  })
  return {
    backboneBlue, backboneOrange, baseA, baseT, baseG, baseC,
    hBond, nucleotide, histone, linkerDNA, chromatinFiber,
    chromosomeBody, centromereMat, telomereMat,
  }
}

// ─── Helix helpers ───────────────────────────────────────────────────────────

const HELIX_RADIUS = 5
const PITCH = 3.4       // nm per full turn (10 bp)
const BP_SPACING = 0.34 // nm between base pairs
const NUM_BP = 20
const TWIST_PER_BP = (2 * Math.PI) / 10  // 36 degrees

function helixPoint(t, strandOffset) {
  const angle = (t / PITCH) * 2 * Math.PI + strandOffset
  return new THREE.Vector3(
    HELIX_RADIUS * Math.cos(angle),
    t * 3 - (NUM_BP * BP_SPACING * 3) / 2,
    HELIX_RADIUS * Math.sin(angle)
  )
}

function buildBackbones(mt) {
  const group = new THREE.Group()
  const numSamples = 200

  for (let strand = 0; strand < 2; strand++) {
    const offset = strand * Math.PI
    const points = []

    for (let i = 0; i <= numSamples; i++) {
      const t = (i / numSamples) * NUM_BP * BP_SPACING
      points.push(helixPoint(t, offset))
    }

    const curve = new THREE.CatmullRomCurve3(points)
    const tubeGeo = new THREE.TubeGeometry(curve, 120, 0.3, 8, false)
    const mat = strand === 0 ? mt.backboneBlue : mt.backboneOrange
    const mesh = new THREE.Mesh(tubeGeo, mat)
    mesh.userData.feature = FEATURES.backbone
    group.add(mesh)
  }

  return group
}

function buildBasePairs(mt) {
  const group = new THREE.Group()
  const sequence = ['AT', 'GC', 'AT', 'AT', 'GC', 'GC', 'AT', 'GC', 'AT', 'GC',
                     'GC', 'AT', 'GC', 'AT', 'AT', 'GC', 'AT', 'GC', 'GC', 'AT']

  for (let i = 0; i < NUM_BP; i++) {
    const t = (i + 0.5) * BP_SPACING
    const p1 = helixPoint(t, 0)
    const p2 = helixPoint(t, Math.PI)

    const mid = p1.clone().add(p2).multiplyScalar(0.5)
    const dir = p2.clone().sub(p1)
    const len = dir.length()
    dir.normalize()

    const isAT = sequence[i] === 'AT'
    const mat1 = isAT ? mt.baseA : mt.baseG
    const mat2 = isAT ? mt.baseT : mt.baseC

    // Thin light-bridge rungs
    const halfLen = (len - 0.6) / 2
    const rungGeo = new THREE.CylinderGeometry(0.12, 0.12, halfLen, 6)
    rungGeo.rotateZ(Math.PI / 2)

    const half1 = new THREE.Mesh(rungGeo, mat1)
    const half2 = new THREE.Mesh(rungGeo, mat2)

    const offset1 = dir.clone().multiplyScalar(-(halfLen / 2 + 0.2))
    const offset2 = dir.clone().multiplyScalar(halfLen / 2 + 0.2)

    half1.position.copy(mid).add(offset1)
    half2.position.copy(mid).add(offset2)

    const angle = Math.atan2(dir.z, dir.x)
    half1.rotation.y = -angle
    half2.rotation.y = -angle

    half1.userData.feature = FEATURES.basePairs
    half2.userData.feature = FEATURES.basePairs

    group.add(half1)
    group.add(half2)
  }

  return group
}

function buildHydrogenBonds(mt) {
  const group = new THREE.Group()
  const sequence = ['AT', 'GC', 'AT', 'AT', 'GC', 'GC', 'AT', 'GC', 'AT', 'GC',
                     'GC', 'AT', 'GC', 'AT', 'AT', 'GC', 'AT', 'GC', 'GC', 'AT']

  const bondGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.6, 4)

  for (let i = 0; i < NUM_BP; i++) {
    const t = (i + 0.5) * BP_SPACING
    const p1 = helixPoint(t, 0)
    const p2 = helixPoint(t, Math.PI)

    const mid = p1.clone().add(p2).multiplyScalar(0.5)
    const dir = p2.clone().sub(p1).normalize()
    const angle = Math.atan2(dir.z, dir.x)

    const isAT = sequence[i] === 'AT'
    const numBonds = isAT ? 2 : 3

    for (let b = 0; b < numBonds; b++) {
      const bond = new THREE.Mesh(bondGeo, mt.hBond)
      const offsetZ = ((b - (numBonds - 1) / 2) * 0.25)
      bond.position.copy(mid)
      bond.position.x += Math.sin(angle) * offsetZ
      bond.position.z -= Math.cos(angle) * offsetZ
      bond.rotation.z = Math.PI / 2
      bond.rotation.y = -angle
      bond.userData.feature = FEATURES.hydrogenBonds
      group.add(bond)
    }
  }

  return group
}

function buildNucleotides(mt) {
  const group = new THREE.Group()
  const sphereGeo = new THREE.SphereGeometry(0.22, 8, 6)

  for (let strand = 0; strand < 2; strand++) {
    const offset = strand * Math.PI
    for (let i = 0; i < NUM_BP; i++) {
      const t = (i + 0.5) * BP_SPACING
      const pos = helixPoint(t, offset)

      const sphere = new THREE.Mesh(sphereGeo, mt.nucleotide)
      sphere.position.copy(pos)
      sphere.userData.feature = FEATURES.nucleotides
      group.add(sphere)
    }
  }

  return group
}

// ─── Floating particles around helix ─────────────────────────────────────────

function buildHelixParticles() {
  const count = 400
  const positions = new Float32Array(count * 3)
  const sizes = new Float32Array(count)

  for (let i = 0; i < count; i++) {
    // Concentrate particles near the helix column
    const angle = Math.random() * Math.PI * 2
    const radius = 2 + Math.random() * 18
    const y = (Math.random() - 0.5) * 30
    positions[i * 3] = Math.cos(angle) * radius
    positions[i * 3 + 1] = y
    positions[i * 3 + 2] = Math.sin(angle) * radius
    sizes[i] = 0.05 + Math.random() * 0.15
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1))

  const mat = new THREE.PointsMaterial({
    color: 0x60a0e0,
    size: 0.12,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
  })

  return new THREE.Points(geo, mat)
}

// ─── Chromosome helpers ─────────────────────────────────────────────────────

function buildNucleosomes(mt) {
  const group = new THREE.Group()
  const histoneGeo = new THREE.CylinderGeometry(2, 2, 1.5, 16)
  const numNucleosomes = 7
  const spacing = 8

  for (let i = 0; i < numNucleosomes; i++) {
    const nucleosomeGroup = new THREE.Group()

    const histone = new THREE.Mesh(histoneGeo, mt.histone)
    histone.userData.feature = FEATURES.nucleosome
    nucleosomeGroup.add(histone)

    const wrapPoints = []
    const wrapTurns = 1.65
    const wrapSamples = 60
    for (let s = 0; s <= wrapSamples; s++) {
      const angle = (s / wrapSamples) * wrapTurns * Math.PI * 2
      const r = 2.3
      const yOff = (s / wrapSamples - 0.5) * 1.2
      wrapPoints.push(new THREE.Vector3(
        r * Math.cos(angle), yOff, r * Math.sin(angle)
      ))
    }
    const wrapCurve = new THREE.CatmullRomCurve3(wrapPoints)
    const wrapGeo = new THREE.TubeGeometry(wrapCurve, 40, 0.25, 6, false)
    const wrap = new THREE.Mesh(wrapGeo, mt.linkerDNA)
    nucleosomeGroup.add(wrap)

    const x = (i - (numNucleosomes - 1) / 2) * spacing
    const y = Math.sin(i * 0.6) * 2
    const z = Math.cos(i * 0.4) * 3
    nucleosomeGroup.position.set(x, y, z)
    nucleosomeGroup.rotation.set(
      Math.sin(i * 1.1) * 0.3, i * 0.5, Math.sin(i * 0.7) * 0.2
    )

    group.add(nucleosomeGroup)

    if (i < numNucleosomes - 1) {
      const nextX = ((i + 1) - (numNucleosomes - 1) / 2) * spacing
      const nextY = Math.sin((i + 1) * 0.6) * 2
      const nextZ = Math.cos((i + 1) * 0.4) * 3

      const linkerPoints = [
        new THREE.Vector3(x + 2.3, y, z),
        new THREE.Vector3((x + nextX) / 2, (y + nextY) / 2 + 2, (z + nextZ) / 2),
        new THREE.Vector3(nextX - 2.3, nextY, nextZ),
      ]
      const linkerCurve = new THREE.CatmullRomCurve3(linkerPoints)
      const linkerGeo = new THREE.TubeGeometry(linkerCurve, 12, 0.2, 6, false)
      const linker = new THREE.Mesh(linkerGeo, mt.linkerDNA)
      linker.userData.feature = FEATURES.nucleosome
      group.add(linker)
    }
  }

  group.position.set(0, 25, 0)
  return group
}

function buildChromatinFiber(mt) {
  const group = new THREE.Group()

  const fiberPoints = []
  const numSegments = 20
  for (let i = 0; i <= numSegments; i++) {
    const t = i / numSegments
    fiberPoints.push(new THREE.Vector3(
      (t - 0.5) * 40,
      Math.sin(t * Math.PI * 3) * 2 + Math.sin(t * Math.PI * 7) * 0.8,
      Math.cos(t * Math.PI * 2) * 3 + Math.sin(t * Math.PI * 5) * 1.2
    ))
  }

  const fiberCurve = new THREE.CatmullRomCurve3(fiberPoints)
  const fiberGeo = new THREE.TubeGeometry(fiberCurve, 60, 1.8, 10, false)
  const fiber = new THREE.Mesh(fiberGeo, mt.chromatinFiber)
  fiber.userData.feature = FEATURES.chromatin
  group.add(fiber)

  const bumpGeo = new THREE.SphereGeometry(2.2, 8, 6)
  for (let i = 0; i < 12; i++) {
    const t = (i + 0.5) / 12
    const pos = fiberCurve.getPointAt(t)
    const bump = new THREE.Mesh(bumpGeo, mt.chromatinFiber)
    bump.position.copy(pos)
    bump.scale.set(1, 0.7, 1)
    group.add(bump)
  }

  return group
}

function buildChromosome(mt) {
  const group = new THREE.Group()

  const chromatidLength = 18
  const chromatidRadius = 2.5

  const armPositions = [
    { start: new THREE.Vector3(-3, chromatidLength, 0), end: new THREE.Vector3(-1.5, 1, 0) },
    { start: new THREE.Vector3(3, chromatidLength, 0), end: new THREE.Vector3(1.5, 1, 0) },
    { start: new THREE.Vector3(-3, -chromatidLength, 0), end: new THREE.Vector3(-1.5, -1, 0) },
    { start: new THREE.Vector3(3, -chromatidLength, 0), end: new THREE.Vector3(1.5, -1, 0) },
  ]

  for (const arm of armPositions) {
    const armPoints = []
    const segments = 12
    for (let i = 0; i <= segments; i++) {
      const t = i / segments
      armPoints.push(arm.start.clone().lerp(arm.end, t))
    }
    const curve = new THREE.CatmullRomCurve3(armPoints)

    const tubeGeo = new THREE.TubeGeometry(curve, 20, chromatidRadius, 10, false)
    const pos = tubeGeo.attributes.position
    for (let v = 0; v < pos.count; v++) {
      const vPos = new THREE.Vector3(pos.getX(v), pos.getY(v), pos.getZ(v))
      const normalizedY = (vPos.y + chromatidLength) / (2 * chromatidLength)
      const taper = 0.6 + 0.4 * Math.sin(Math.max(0, Math.min(1, normalizedY)) * Math.PI)
      const center = curve.getPointAt(Math.max(0, Math.min(1, normalizedY)))
      const dx = vPos.x - center.x
      const dz = vPos.z - center.z
      pos.setX(v, center.x + dx * taper)
      pos.setZ(v, center.z + dz * taper)
    }
    tubeGeo.computeVertexNormals()

    const armMesh = new THREE.Mesh(tubeGeo, mt.chromosomeBody)
    armMesh.userData.feature = FEATURES.centromere
    group.add(armMesh)
  }

  const centromereGeo = new THREE.TorusGeometry(2.5, 1.0, 10, 16)
  const centromere = new THREE.Mesh(centromereGeo, mt.centromereMat)
  centromere.rotation.x = Math.PI / 2
  centromere.userData.feature = FEATURES.centromere
  group.add(centromere)

  const telomereGeo = new THREE.SphereGeometry(1.5, 10, 8)
  const telomerePositions = [
    new THREE.Vector3(-3, chromatidLength, 0),
    new THREE.Vector3(3, chromatidLength, 0),
    new THREE.Vector3(-3, -chromatidLength, 0),
    new THREE.Vector3(3, -chromatidLength, 0),
  ]
  for (const tPos of telomerePositions) {
    const telomere = new THREE.Mesh(telomereGeo, mt.telomereMat)
    telomere.position.copy(tPos)
    telomere.userData.feature = FEATURES.telomere
    group.add(telomere)
  }

  group.position.set(0, -25, 0)
  return group
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function createDNAModel() {
  const mt = makeMaterials()
  const clickTargets = []

  // ── Helix group (molecular scale) ──
  const helix = new THREE.Group()

  const backbones = buildBackbones(mt)
  helix.add(backbones)
  for (const child of backbones.children) {
    clickTargets.push(child)
  }

  const basePairs = buildBasePairs(mt)
  helix.add(basePairs)
  for (const child of basePairs.children) {
    clickTargets.push(child)
  }

  const hydrogenBonds = buildHydrogenBonds(mt)
  helix.add(hydrogenBonds)

  const nucleotides = buildNucleotides(mt)
  helix.add(nucleotides)
  for (const child of nucleotides.children) {
    clickTargets.push(child)
  }

  // Floating ambient particles
  const particles = buildHelixParticles()
  helix.add(particles)

  // ── Chromosome group (cellular scale) ──
  const chromosome = new THREE.Group()

  const nucleosomes = buildNucleosomes(mt)
  chromosome.add(nucleosomes)
  for (const child of nucleosomes.children) {
    if (child.children) {
      for (const sub of child.children) {
        clickTargets.push(sub)
      }
    } else {
      clickTargets.push(child)
    }
  }

  const chromatinFiber = buildChromatinFiber(mt)
  chromosome.add(chromatinFiber)
  clickTargets.push(chromatinFiber.children[0])

  const chromosomeModel = buildChromosome(mt)
  chromosome.add(chromosomeModel)
  for (const child of chromosomeModel.children) {
    clickTargets.push(child)
  }

  // ── Label anchors ──
  const labelAnchors = {
    backbone:       { pos: new THREE.Vector3(6, 5, 0), name: 'Sugar-Phosphate Backbone' },
    basePairs:      { pos: new THREE.Vector3(0, 0, 0), name: 'Base Pairs' },
    majorGroove:    { pos: new THREE.Vector3(5.5, 3, -2), name: 'Major Groove' },
    minorGroove:    { pos: new THREE.Vector3(-5.5, -1, 2), name: 'Minor Groove' },
    nucleotides:    { pos: new THREE.Vector3(-6, -4, 0), name: 'Nucleotides' },
    nucleosome:     { pos: new THREE.Vector3(0, 30, 0), name: 'Nucleosome' },
    chromatin:      { pos: new THREE.Vector3(0, 4, 0), name: 'Chromatin Fiber' },
    centromere:     { pos: new THREE.Vector3(0, -25, 3), name: 'Centromere' },
    telomere:       { pos: new THREE.Vector3(4, -43, 0), name: 'Telomere' },
  }

  // Store original Y positions for particle animation (avoids drift accumulation)
  const particlePositions = particles.geometry.attributes.position
  const particleOriginalY = new Float32Array(particlePositions.count)
  for (let i = 0; i < particlePositions.count; i++) {
    particleOriginalY[i] = particlePositions.getY(i)
  }

  return { helix, chromosome, clickTargets, labelAnchors, features: FEATURES, particles, particleOriginalY }
}
