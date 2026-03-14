import * as THREE from 'three'

/**
 * Eukaryotic animal cell cross-section — procedural model.
 *
 * Coordinate system:
 *   Origin = center of cell
 *   Y up, 1 unit ≈ 1 micrometer (scaled for visualization)
 *
 * All organelles are positioned relative to the cell center.
 */

// ─── Feature data ────────────────────────────────────────────────────────────

const FEATURES = {
  cellMembrane: {
    name: 'Cell Membrane',
    type: 'Boundary',
    dimensions: '~7–8 nm thick (phospholipid bilayer)',
    description: 'A selectively permeable phospholipid bilayer that encloses the cell, regulating the passage of ions, nutrients, and waste products. Embedded with proteins for signaling, transport, and structural support. Its fluid mosaic structure allows lateral movement of membrane components.',
  },
  nucleus: {
    name: 'Nucleus',
    type: 'Organelle',
    dimensions: '~5–10 μm diameter',
    description: 'The largest organelle, enclosed by a double membrane (nuclear envelope) perforated by nuclear pores. Contains the cell\'s DNA organized into chromatin, which condenses into chromosomes during division. The nucleus directs gene expression and mediates DNA replication.',
  },
  nucleolus: {
    name: 'Nucleolus',
    type: 'Sub-organelle',
    dimensions: '~1–3 μm diameter',
    description: 'A dense, non-membrane-bound structure within the nucleus responsible for ribosomal RNA (rRNA) synthesis and ribosome subunit assembly. Cells with high protein synthesis demands often have larger or multiple nucleoli.',
  },
  mitochondria: {
    name: 'Mitochondria',
    type: 'Organelle',
    dimensions: '~1–10 μm long, ~0.5–1 μm diameter',
    description: 'The powerhouses of the cell, generating ATP through oxidative phosphorylation on the inner membrane\'s cristae folds. Possess their own circular DNA, supporting the endosymbiotic theory that they originated as free-living alpha-proteobacteria. Involved in apoptosis, calcium signaling, and heat generation.',
  },
  roughER: {
    name: 'Rough Endoplasmic Reticulum',
    type: 'Organelle',
    dimensions: 'Network of flattened sacs, extends from nuclear envelope',
    description: 'A system of membrane-bound sacs (cisternae) studded with ribosomes on its cytoplasmic surface. Synthesizes secretory proteins and membrane proteins, which are co-translationally inserted into the ER lumen for folding, glycosylation, and quality control before transport to the Golgi apparatus.',
  },
  smoothER: {
    name: 'Smooth Endoplasmic Reticulum',
    type: 'Organelle',
    dimensions: 'Tubular network, continuous with rough ER',
    description: 'Lacks ribosomes and specializes in lipid synthesis, steroid hormone production, carbohydrate metabolism, and detoxification of drugs and poisons. In muscle cells, a specialized form (sarcoplasmic reticulum) stores and releases calcium ions for contraction.',
  },
  golgi: {
    name: 'Golgi Apparatus',
    type: 'Organelle',
    dimensions: '~1–3 μm, stack of 4–8 cisternae',
    description: 'A stack of flattened membrane-bound cisternae that receives proteins from the rough ER, modifies them (glycosylation, phosphorylation, sulfation), sorts them, and packages them into vesicles for secretion, lysosomal delivery, or membrane insertion. Has distinct cis (receiving) and trans (shipping) faces.',
  },
  lysosomes: {
    name: 'Lysosomes',
    type: 'Organelle',
    dimensions: '~0.1–1.2 μm diameter',
    description: 'Membrane-bound vesicles containing ~60 types of hydrolytic enzymes active at acidic pH (~4.5–5.0). Digest macromolecules, worn-out organelles (autophagy), and engulfed pathogens (phagocytosis). Defects in lysosomal enzymes cause over 50 lysosomal storage diseases, including Tay-Sachs and Gaucher disease.',
  },
  centrosome: {
    name: 'Centrosome',
    type: 'Organelle',
    dimensions: '~1–2 μm, two centrioles at right angles',
    description: 'The primary microtubule organizing center (MTOC) of the cell, consisting of two centrioles surrounded by pericentriolar material. Nucleates and anchors the microtubule cytoskeleton, and duplicates before mitosis to form the poles of the mitotic spindle. Each centriole is a barrel of nine triplet microtubules.',
  },
  cytoskeleton: {
    name: 'Cytoskeleton',
    type: 'Structural Network',
    dimensions: 'Cell-spanning filament network',
    description: 'A dynamic network of protein filaments providing structural support, intracellular transport, and motility. Comprises three main types: microfilaments (actin, ~7 nm), intermediate filaments (~10 nm), and microtubules (tubulin, ~25 nm). Constantly remodeled to support cell shape changes, division, and migration.',
  },
  vesicles: {
    name: 'Transport Vesicles',
    type: 'Organelle',
    dimensions: '~50–100 nm diameter',
    description: 'Small membrane-enclosed sacs that shuttle proteins and lipids between organelles and to the cell surface. Coated vesicles (clathrin, COPI, COPII) bud from donor membranes and fuse with target membranes, maintaining compartmentalization while enabling continuous molecular traffic.',
  },
}

// ─── Materials ───────────────────────────────────────────────────────────────

function makeMaterials() {
  const membrane = new THREE.MeshStandardMaterial({
    color: 0xd0e0b0, roughness: 0.4, metalness: 0.1,
    transparent: true, opacity: 0.2, depthWrite: false,
    side: THREE.DoubleSide,
    emissive: 0x90b060, emissiveIntensity: 0.75,
  })

  const nuclearEnvelope = new THREE.MeshStandardMaterial({
    color: 0x6080c0, roughness: 0.3, metalness: 0.1,
    transparent: true, opacity: 0.4, depthWrite: false,
    side: THREE.DoubleSide,
    emissive: 0x5070b0, emissiveIntensity: 0.8,
  })

  const nucleolus = new THREE.MeshStandardMaterial({
    color: 0x5070b0, roughness: 0.5, metalness: 0.0,
    emissive: 0x4060a0, emissiveIntensity: 0.9,
  })

  const chromatin = new THREE.MeshStandardMaterial({
    color: 0x6090d0, roughness: 0.4, metalness: 0.05,
    emissive: 0x5080c0, emissiveIntensity: 0.9,
  })

  const mitochondria = new THREE.MeshStandardMaterial({
    color: 0xe06050, roughness: 0.45, metalness: 0.05,
    emissive: 0xc04030, emissiveIntensity: 0.85,
    transparent: true, opacity: 0.45, depthWrite: false,
    side: THREE.DoubleSide,
  })

  const cristae = new THREE.MeshStandardMaterial({
    color: 0xf09080, roughness: 0.4, metalness: 0.0,
    side: THREE.DoubleSide,
    emissive: 0xf07060, emissiveIntensity: 1.0,
  })

  const roughER = new THREE.MeshStandardMaterial({
    color: 0x70a0e0, roughness: 0.4, metalness: 0.05,
    transparent: true, opacity: 0.6, depthWrite: false,
    side: THREE.DoubleSide,
    emissive: 0x5080c0, emissiveIntensity: 0.8,
  })

  const smoothER = new THREE.MeshStandardMaterial({
    color: 0x80b0f0, roughness: 0.35, metalness: 0.05,
    transparent: true, opacity: 0.55, depthWrite: false,
    side: THREE.DoubleSide,
    emissive: 0x6090d0, emissiveIntensity: 0.8,
  })

  const ribosome = new THREE.MeshStandardMaterial({
    color: 0x6070b0, roughness: 0.6, metalness: 0.0,
    emissive: 0x4050a0, emissiveIntensity: 0.85,
  })

  const golgi = new THREE.MeshStandardMaterial({
    color: 0xe8d050, roughness: 0.35, metalness: 0.1,
    transparent: true, opacity: 0.65, depthWrite: false,
    side: THREE.DoubleSide,
    emissive: 0xc0a830, emissiveIntensity: 0.85,
  })

  const lysosome = new THREE.MeshStandardMaterial({
    color: 0xc050d0, roughness: 0.4, metalness: 0.05,
    emissive: 0xa030b0, emissiveIntensity: 0.9,
  })

  const centriole = new THREE.MeshStandardMaterial({
    color: 0x60d0b0, roughness: 0.4, metalness: 0.1,
    emissive: 0x40b090, emissiveIntensity: 0.85,
  })

  const vesicle = new THREE.MeshStandardMaterial({
    color: 0xf0e080, roughness: 0.3, metalness: 0.05,
    transparent: true, opacity: 0.55, depthWrite: false,
    emissive: 0xd0c050, emissiveIntensity: 0.7,
  })

  const nuclearPore = new THREE.MeshStandardMaterial({
    color: 0x90b070, roughness: 0.5, metalness: 0.1,
    emissive: 0x709050, emissiveIntensity: 0.8,
  })

  return {
    membrane, nuclearEnvelope, nucleolus, chromatin,
    mitochondria, cristae, roughER, smoothER, ribosome,
    golgi, lysosome, centriole, vesicle, nuclearPore,
  }
}

// ─── Seeded random for reproducible placement ────────────────────────────────

function seededRandom(seed) {
  let s = seed
  return function () {
    s = (s * 16807 + 0) % 2147483647
    return (s - 1) / 2147483646
  }
}

// ─── Cell membrane ───────────────────────────────────────────────────────────

function buildCellMembrane(mt) {
  const geo = new THREE.SphereGeometry(50, 64, 48)
  // Slightly deform for organic feel
  const pos = geo.attributes.position
  const rng = seededRandom(42)
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    const len = Math.sqrt(x * x + y * y + z * z)
    const noise = 1.0 + (rng() - 0.5) * 0.04
    const scale = noise * 50 / len
    pos.setXYZ(i, x * scale, y * scale, z * scale)
  }
  geo.computeVertexNormals()
  const mesh = new THREE.Mesh(geo, mt.membrane)
  mesh.userData.feature = FEATURES.cellMembrane
  return mesh
}

// ─── Nucleus ─────────────────────────────────────────────────────────────────

function buildNucleus(mt) {
  const group = new THREE.Group()
  const rng = seededRandom(101)

  // Outer nuclear envelope
  const outerGeo = new THREE.SphereGeometry(12, 32, 24)
  const outer = new THREE.Mesh(outerGeo, mt.nuclearEnvelope)
  group.add(outer)

  // Inner nuclear envelope
  const innerGeo = new THREE.SphereGeometry(11.5, 32, 24)
  const innerMat = mt.nuclearEnvelope.clone()
  innerMat.opacity = 0.18
  const inner = new THREE.Mesh(innerGeo, innerMat)
  group.add(inner)

  // Nucleolus
  const nucleolusGeo = new THREE.SphereGeometry(3, 16, 12)
  const nucleolusMesh = new THREE.Mesh(nucleolusGeo, mt.nucleolus)
  nucleolusMesh.position.set(2, 1, -1)
  nucleolusMesh.userData.feature = FEATURES.nucleolus
  group.add(nucleolusMesh)

  // Nuclear pores — small torus shapes on surface
  const poreGeo = new THREE.TorusGeometry(0.6, 0.15, 8, 12)
  for (let i = 0; i < 10; i++) {
    const phi = Math.acos(2 * rng() - 1)
    const theta = rng() * Math.PI * 2
    const r = 12.05
    const x = r * Math.sin(phi) * Math.cos(theta)
    const y = r * Math.sin(phi) * Math.sin(theta)
    const z = r * Math.cos(phi)

    const pore = new THREE.Mesh(poreGeo, mt.nuclearPore)
    pore.position.set(x, y, z)
    // Orient pore to face outward
    pore.lookAt(0, 0, 0)
    group.add(pore)
  }

  // Chromatin — tangled tube-like shapes
  for (let c = 0; c < 5; c++) {
    const points = []
    let cx = (rng() - 0.5) * 14
    let cy = (rng() - 0.5) * 14
    let cz = (rng() - 0.5) * 14
    for (let p = 0; p < 12; p++) {
      // Keep within nucleus bounds
      const maxR = 10
      const r = Math.sqrt(cx * cx + cy * cy + cz * cz)
      if (r > maxR) {
        cx *= maxR / r
        cy *= maxR / r
        cz *= maxR / r
      }
      points.push(new THREE.Vector3(cx, cy, cz))
      cx += (rng() - 0.5) * 4
      cy += (rng() - 0.5) * 4
      cz += (rng() - 0.5) * 4
    }
    if (points.length >= 2) {
      const curve = new THREE.CatmullRomCurve3(points)
      const tubeGeo = new THREE.TubeGeometry(curve, 30, 0.25, 6, false)
      const tube = new THREE.Mesh(tubeGeo, mt.chromatin)
      group.add(tube)
    }
  }

  // Position nucleus slightly off-center
  group.position.set(-3, 2, 0)

  return { group, nucleolusMesh }
}

// ─── Mitochondria ────────────────────────────────────────────────────────────

function buildMitochondria(mt) {
  const group = new THREE.Group()
  const rng = seededRandom(200)
  const positions = []

  for (let i = 0; i < 6; i++) {
    const mitoGroup = new THREE.Group()

    // Outer capsule
    const capsuleGeo = new THREE.CapsuleGeometry(1.5, 3, 12, 16)
    const capsule = new THREE.Mesh(capsuleGeo, mt.mitochondria)
    mitoGroup.add(capsule)

    // Inner cristae folds — thin wavy planes inside
    for (let c = 0; c < 4; c++) {
      const offset = (c - 1.5) * 0.7
      const cristaePts = []
      for (let p = 0; p < 8; p++) {
        const y = -1.2 + p * 0.35
        const x = offset + Math.sin(p * 1.2 + c) * 0.3
        const z = Math.cos(p * 0.8 + c * 0.5) * 0.4
        cristaePts.push(new THREE.Vector3(x, y, z))
      }
      const curve = new THREE.CatmullRomCurve3(cristaePts)
      const cristaeGeo = new THREE.TubeGeometry(curve, 12, 0.25, 6, false)
      mitoGroup.add(new THREE.Mesh(cristaeGeo, mt.cristae))
    }

    // Position in cytoplasm (avoid nucleus area)
    let px, py, pz, dist
    do {
      const angle = rng() * Math.PI * 2
      const radius = 18 + rng() * 22
      px = Math.cos(angle) * radius
      py = (rng() - 0.5) * 30
      pz = Math.sin(angle) * radius
      dist = Math.sqrt(px * px + py * py + pz * pz)
    } while (dist > 45 || dist < 16)

    mitoGroup.position.set(px, py, pz)
    mitoGroup.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI)
    mitoGroup.userData.feature = FEATURES.mitochondria
    mitoGroup.userData.bobOffset = rng() * Math.PI * 2
    positions.push(mitoGroup.position.clone())
    group.add(mitoGroup)
  }

  return { group, positions }
}

// ─── Endoplasmic Reticulum ───────────────────────────────────────────────────

function buildRoughER(mt) {
  const group = new THREE.Group()
  const rng = seededRandom(300)

  // Folded sheet-like structures near nucleus
  for (let s = 0; s < 5; s++) {
    const sheetGeo = new THREE.PlaneGeometry(6, 4, 12, 8)
    // Wrinkle the sheet
    const pos = sheetGeo.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i)
      pos.setZ(i, Math.sin(x * 1.5 + s) * 0.4 + Math.cos(y * 2) * 0.3)
    }
    sheetGeo.computeVertexNormals()

    const sheet = new THREE.Mesh(sheetGeo, mt.roughER)
    const angle = (s / 5) * Math.PI * 0.8 - 0.2
    sheet.position.set(
      -3 + Math.cos(angle + 1.5) * 16,
      -2 + s * 1.8,
      Math.sin(angle + 1.5) * 16
    )
    sheet.rotation.set(rng() * 0.5, rng() * Math.PI, rng() * 0.3)
    group.add(sheet)

    // Ribosomes dotted on surface
    const ribGeo = new THREE.SphereGeometry(0.15, 4, 4)
    for (let r = 0; r < 25; r++) {
      const rib = new THREE.Mesh(ribGeo, mt.ribosome)
      const rx = (rng() - 0.5) * 5
      const ry = (rng() - 0.5) * 3.5
      const rz = Math.sin(rx * 1.5 + s) * 0.4 + Math.cos(ry * 2) * 0.3 + 0.2
      rib.position.set(rx, ry, rz)
      sheet.add(rib)
    }
  }

  group.userData.feature = FEATURES.roughER
  return group
}

function buildSmoothER(mt) {
  const group = new THREE.Group()
  const rng = seededRandom(350)

  // Tubular network
  for (let t = 0; t < 6; t++) {
    const points = []
    let cx = 10 + rng() * 8
    let cy = (rng() - 0.5) * 10
    let cz = -12 + rng() * 6
    for (let p = 0; p < 8; p++) {
      points.push(new THREE.Vector3(cx, cy, cz))
      cx += (rng() - 0.5) * 5
      cy += (rng() - 0.5) * 4
      cz += (rng() - 0.5) * 5
    }
    const curve = new THREE.CatmullRomCurve3(points)
    const tubeGeo = new THREE.TubeGeometry(curve, 20, 0.35, 6, false)
    group.add(new THREE.Mesh(tubeGeo, mt.smoothER))
  }

  group.userData.feature = FEATURES.smoothER
  return group
}

// ─── Golgi Apparatus ─────────────────────────────────────────────────────────

function buildGolgi(mt) {
  const group = new THREE.Group()

  // Stack of curved disc shapes
  for (let i = 0; i < 6; i++) {
    const discGeo = new THREE.SphereGeometry(4, 24, 6, 0, Math.PI * 2, 0.3, Math.PI * 0.4)
    // Flatten into disc shape
    const pos = discGeo.attributes.position
    for (let v = 0; v < pos.count; v++) {
      const y = pos.getY(v)
      pos.setY(v, y * 0.15)
    }
    discGeo.computeVertexNormals()

    const disc = new THREE.Mesh(discGeo, mt.golgi)
    disc.position.set(0, i * 0.8, 0)
    // Slightly curve each disc
    disc.rotation.x = -0.15 + i * 0.02
    group.add(disc)
  }

  group.position.set(18, -5, 12)
  group.rotation.set(0.2, 0.5, 0.1)
  group.userData.feature = FEATURES.golgi
  return group
}

// ─── Lysosomes ───────────────────────────────────────────────────────────────

function buildLysosomes(mt) {
  const group = new THREE.Group()
  const rng = seededRandom(400)

  const lysoGeo = new THREE.SphereGeometry(1.5, 12, 10)
  const positions = [
    [25, -8, -15],
    [-20, -12, 22],
    [15, 15, -25],
    [-28, 5, -10],
  ]

  for (const [x, y, z] of positions) {
    const lyso = new THREE.Mesh(lysoGeo, mt.lysosome)
    lyso.position.set(x, y, z)
    const scale = 0.8 + rng() * 0.5
    lyso.scale.set(scale, scale, scale)
    lyso.userData.feature = FEATURES.lysosomes
    group.add(lyso)
  }

  return group
}

// ─── Centrosome ──────────────────────────────────────────────────────────────

function buildCentrosome(mt) {
  const group = new THREE.Group()

  // Two centrioles at right angles
  const centrioleGeo = new THREE.CylinderGeometry(0.6, 0.6, 2.5, 9, 1, true)

  const c1 = new THREE.Mesh(centrioleGeo, mt.centriole)
  c1.position.set(0, 0, 0)
  group.add(c1)

  const c2 = new THREE.Mesh(centrioleGeo, mt.centriole)
  c2.rotation.x = Math.PI / 2
  c2.position.set(0, 0, 0)
  group.add(c2)

  // Radiating microtubules — thin lines outward
  const lineMat = new THREE.LineBasicMaterial({
    color: 0x40a080,
    transparent: true, opacity: 0.4, depthWrite: false,
  })
  const lineVerts = []
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2
    const len = 3 + Math.random() * 4
    lineVerts.push(0, 0, 0)
    lineVerts.push(
      Math.cos(angle) * len,
      (Math.random() - 0.5) * 2,
      Math.sin(angle) * len
    )
  }
  const lineGeo = new THREE.BufferGeometry()
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(lineVerts, 3))
  group.add(new THREE.LineSegments(lineGeo, lineMat))

  group.position.set(-10, 14, 8)
  group.userData.feature = FEATURES.centrosome
  return group
}

// ─── Cytoskeleton ────────────────────────────────────────────────────────────

function buildCytoskeleton() {
  const rng = seededRandom(500)
  const lineMat = new THREE.LineBasicMaterial({
    color: 0x80a0c0,
    transparent: true, opacity: 0.12, depthWrite: false,
  })

  const verts = []
  for (let i = 0; i < 80; i++) {
    // Random line segments throughout the cell
    const x1 = (rng() - 0.5) * 80
    const y1 = (rng() - 0.5) * 80
    const z1 = (rng() - 0.5) * 80
    const dist1 = Math.sqrt(x1 * x1 + y1 * y1 + z1 * z1)
    if (dist1 > 46) continue

    const x2 = x1 + (rng() - 0.5) * 15
    const y2 = y1 + (rng() - 0.5) * 15
    const z2 = z1 + (rng() - 0.5) * 15
    const dist2 = Math.sqrt(x2 * x2 + y2 * y2 + z2 * z2)
    if (dist2 > 46) continue

    verts.push(x1, y1, z1, x2, y2, z2)
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  const mesh = new THREE.LineSegments(geo, lineMat)
  mesh.userData.feature = FEATURES.cytoskeleton
  return mesh
}

// ─── Vesicles ────────────────────────────────────────────────────────────────

function buildVesicles(mt) {
  const group = new THREE.Group()
  const rng = seededRandom(600)
  const vesGeo = new THREE.SphereGeometry(0.7, 8, 6)

  for (let i = 0; i < 15; i++) {
    const ves = new THREE.Mesh(vesGeo, mt.vesicle)
    // Cluster near Golgi and scattered throughout
    let px, py, pz
    if (i < 6) {
      // Near Golgi
      px = 18 + (rng() - 0.5) * 10
      py = -5 + (rng() - 0.5) * 8
      pz = 12 + (rng() - 0.5) * 10
    } else {
      // Scattered
      const angle = rng() * Math.PI * 2
      const radius = 15 + rng() * 25
      px = Math.cos(angle) * radius
      py = (rng() - 0.5) * 30
      pz = Math.sin(angle) * radius
    }
    const dist = Math.sqrt(px * px + py * py + pz * pz)
    if (dist > 45) continue

    ves.position.set(px, py, pz)
    const scale = 0.5 + rng() * 0.8
    ves.scale.setScalar(scale)
    ves.userData.bobOffset = rng() * Math.PI * 2
    group.add(ves)
  }

  group.userData.feature = FEATURES.vesicles
  return group
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function createCellModel() {
  const mt = makeMaterials()
  const group = new THREE.Group()
  const clickTargets = []

  // ── Cell Membrane ──
  const membrane = buildCellMembrane(mt)
  group.add(membrane)

  // ── Nucleus ──
  const { group: nucleusGroup, nucleolusMesh } = buildNucleus(mt)
  nucleusGroup.userData.feature = FEATURES.nucleus
  group.add(nucleusGroup)
  const nucleusTarget = nucleusGroup.children[0]
  nucleusTarget.userData.featureKey = 'nucleus'
  clickTargets.push(nucleusTarget)
  nucleolusMesh.userData.featureKey = 'nucleolus'
  clickTargets.push(nucleolusMesh)

  // ── Mitochondria ──
  const { group: mitoGroup, positions: mitoPositions } = buildMitochondria(mt)
  group.add(mitoGroup)
  for (const child of mitoGroup.children) {
    child.userData.featureKey = 'mitochondria'
    clickTargets.push(child)
  }

  // ── Rough ER ──
  const rer = buildRoughER(mt)
  group.add(rer)
  for (const child of rer.children) {
    child.userData.featureKey = 'roughER'
    clickTargets.push(child)
  }

  // ── Smooth ER ──
  const ser = buildSmoothER(mt)
  group.add(ser)
  for (const child of ser.children) {
    child.userData.featureKey = 'smoothER'
    clickTargets.push(child)
  }

  // ── Golgi Apparatus ──
  const golgi = buildGolgi(mt)
  group.add(golgi)
  for (const child of golgi.children) {
    child.userData.featureKey = 'golgi'
    clickTargets.push(child)
  }

  // ── Lysosomes ──
  const lysosomes = buildLysosomes(mt)
  group.add(lysosomes)
  for (const child of lysosomes.children) {
    child.userData.featureKey = 'lysosomes'
    clickTargets.push(child)
  }

  // ── Centrosome ──
  const centrosome = buildCentrosome(mt)
  group.add(centrosome)
  for (const child of centrosome.children) {
    child.userData.featureKey = 'centrosome'
    clickTargets.push(child)
  }

  // ── Cytoskeleton ──
  const cytoskeleton = buildCytoskeleton()
  group.add(cytoskeleton)

  // ── Vesicles ──
  const vesicles = buildVesicles(mt)
  group.add(vesicles)

  // ── Label anchors ──
  const labelAnchors = {
    cellMembrane:  { pos: new THREE.Vector3(0, 52, 0), name: 'Cell Membrane' },
    nucleus:       { pos: new THREE.Vector3(-3, 16, 0), name: 'Nucleus' },
    nucleolus:     { pos: new THREE.Vector3(-1, 7, -1), name: 'Nucleolus' },
    mitochondria:  { pos: mitoPositions[0]?.clone().add(new THREE.Vector3(0, 3, 0)) || new THREE.Vector3(30, 5, 20), name: 'Mitochondria' },
    roughER:       { pos: new THREE.Vector3(-3 + 14, 6, 14), name: 'Rough ER' },
    smoothER:      { pos: new THREE.Vector3(18, 2, -12), name: 'Smooth ER' },
    golgi:         { pos: new THREE.Vector3(18, -1, 12), name: 'Golgi Apparatus' },
    lysosomes:     { pos: new THREE.Vector3(25, -6, -15), name: 'Lysosomes' },
    centrosome:    { pos: new THREE.Vector3(-10, 18, 8), name: 'Centrosome' },
    cytoskeleton:  { pos: new THREE.Vector3(-30, -20, 20), name: 'Cytoskeleton' },
    vesicles:      { pos: new THREE.Vector3(22, -8, 18), name: 'Vesicles' },
  }

  return {
    group,
    clickTargets,
    labelAnchors,
    features: FEATURES,
    // References for animation
    mitoGroup,
    vesicles,
  }
}
