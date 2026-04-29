import * as THREE from 'three'
import { createNoise2D } from 'simplex-noise'

/**
 * Pangaea-to-Present-Day continental drift model.
 *
 * Coordinate system:
 *   Origin = center of Earth sphere
 *   Globe radius = 20 units
 *
 * High-quality continent meshes with:
 *   - Chaikin-subdivided coastlines with noise perturbation
 *   - Grid-fill triangulation with vertex displacement for terrain
 *   - Hypsometric vertex coloring (lowland green → mountain brown → snow)
 *   - Coastline glow edges
 *   - Bathymetry ocean shader with era-dependent coloring
 *   - Quaternion-based plate rotation + translation
 *   - Cloud layer with procedural noise
 */

// ─── Geological period data ─────────────────────────────────────────────────

const PERIODS = [
  { mya: 250, name: 'Pangaea',             label: 'Supercontinent Pangaea' },
  { mya: 200, name: 'Laurasia & Gondwana', label: 'Early Jurassic split' },
  { mya: 150, name: 'Late Jurassic',       label: 'Widening Atlantic' },
  { mya: 100, name: 'Mid Cretaceous',      label: 'South Atlantic opens' },
  { mya: 50,  name: 'Early Cenozoic',      label: 'India collides with Asia' },
  { mya: 0,   name: 'Present Day',         label: 'Modern configuration' },
]

// ─── Feature data ───────────────────────────────────────────────────────────

const FEATURES = {
  northAmerica: {
    name: 'North America',
    type: 'Continent',
    dimensions: '24.7 million km²',
    description: 'Originally part of Laurasia, North America separated from Europe as the North Atlantic opened ~180 Mya. The Appalachian Mountains preserve the suture where it once joined Africa and Europe in the heart of Pangaea.',
  },
  southAmerica: {
    name: 'South America',
    type: 'Continent',
    dimensions: '17.8 million km²',
    description: 'Part of the Gondwana supercontinent, South America began separating from Africa ~130 Mya as the South Atlantic Ocean opened. The matching coastlines and shared fossil species between the two continents were key evidence for continental drift theory.',
  },
  africa: {
    name: 'Africa',
    type: 'Continent',
    dimensions: '30.4 million km²',
    description: 'Africa sat near the center of Pangaea. As Gondwana fragmented, Africa remained relatively stationary while other continents drifted away. The East African Rift is actively splitting the continent today.',
  },
  europe: {
    name: 'Europe',
    type: 'Continent',
    dimensions: '10.2 million km²',
    description: 'Part of Laurasia, Europe was connected to North America until the North Atlantic widened. The Alps formed when Africa pushed northward into Europe during the Cenozoic era.',
  },
  asia: {
    name: 'Asia',
    type: 'Continent',
    dimensions: '44.6 million km²',
    description: 'The largest continent, Asia was part of Laurasia but also incorporated terranes that drifted northward from Gondwana. The Himalayas formed when India, originally a Gondwanan fragment, collided with Asia ~50 Mya and continues pushing northward today.',
  },
  india: {
    name: 'Indian Subcontinent',
    type: 'Tectonic Plate',
    dimensions: '4.4 million km²',
    description: 'One of the fastest-moving tectonic plates in geological history, India separated from Gondwana ~120 Mya and raced northward at ~15 cm/year. Its collision with Asia created the Himalayas and the Tibetan Plateau — the most dramatic tectonic event of the Cenozoic.',
  },
  australia: {
    name: 'Australia',
    type: 'Continent',
    dimensions: '8.6 million km²',
    description: 'Australia remained connected to Antarctica until ~45 Mya, the last Gondwanan breakup. Its long isolation led to the evolution of unique marsupial fauna. It continues drifting northward at ~7 cm/year.',
  },
  antarctica: {
    name: 'Antarctica',
    type: 'Continent',
    dimensions: '14.2 million km²',
    description: 'Once at the core of Gondwana with a temperate climate, Antarctica drifted to the South Pole by ~34 Mya. The opening of the Drake Passage created the Antarctic Circumpolar Current, thermally isolating the continent and triggering its glaciation.',
  },
}

// ─── Continent shapes (simplified lat/lon outlines) ─────────────────────────

const CONTINENT_OUTLINES_RAW = {
  northAmerica: [
    [70,-165],[72,-155],[72,-140],[71,-120],[71,-100],[70,-90],[68,-75],[62,-62],
    [55,-57],[47,-52],[44,-60],[43,-66],[40,-70],[35,-75],[30,-82],[25,-82],
    [25,-90],[25,-98],[28,-105],[32,-115],[34,-118],[37,-122],[40,-124],
    [45,-124],[48,-124],[52,-128],[56,-133],[58,-138],[60,-147],[64,-155],
    [67,-162],[70,-165],
  ],
  southAmerica: [
    [12,-72],[10,-76],[7,-77],[4,-77],[1,-80],[-3,-80],[-5,-78],[-8,-75],
    [-12,-77],[-15,-75],[-18,-70],[-22,-70],[-25,-68],[-28,-66],[-32,-68],
    [-36,-72],[-40,-73],[-44,-72],[-48,-73],[-52,-70],[-55,-68],[-55,-64],
    [-52,-60],[-48,-58],[-42,-56],[-38,-55],[-34,-52],[-28,-48],[-22,-42],
    [-16,-38],[-10,-35],[-5,-35],[-2,-42],[0,-50],[2,-52],[5,-58],[8,-62],
    [10,-66],[12,-72],
  ],
  africa: [
    [37,10],[37,5],[36,-2],[34,-8],[32,-10],[30,-12],[25,-16],[20,-17],
    [15,-17],[10,-15],[6,-10],[5,-5],[4,2],[3,9],[2,10],[0,10],[-2,12],
    [-5,12],[-8,14],[-12,15],[-16,12],[-20,12],[-25,15],[-28,17],[-30,18],
    [-33,18],[-35,20],[-34,25],[-32,28],[-28,32],[-22,35],[-15,40],
    [-10,42],[-5,42],[-2,43],[0,44],[3,44],[8,48],[10,45],[12,44],
    [15,42],[18,40],[22,38],[25,36],[28,34],[30,33],[32,32],[33,30],
    [35,28],[37,20],[37,10],
  ],
  europe: [
    [38,-8],[38,-5],[40,-2],[42,0],[43,3],[44,8],[43,12],[40,15],[38,20],
    [38,24],[40,28],[42,30],[44,28],[46,25],[47,22],[48,18],[48,14],
    [48,8],[48,3],[48,0],[50,-2],[52,-5],[54,-6],[56,-5],[58,-3],[59,2],
    [60,5],[61,8],[63,10],[65,13],[67,16],[68,20],[70,25],[70,30],
    [68,32],[65,30],[62,30],[60,32],[58,30],[55,28],[52,32],[50,36],
    [48,32],[46,30],[44,30],[42,30],[40,28],[38,24],
  ],
  asia: [
    [70,25],[70,35],[72,45],[73,55],[74,65],[74,80],[73,100],[72,120],
    [72,130],[70,140],[68,150],[66,160],[65,170],[62,170],[60,162],
    [56,148],[52,140],[48,135],[45,135],[42,132],[38,128],[35,128],
    [32,122],[28,118],[24,112],[22,108],[20,106],[18,104],[14,100],
    [10,98],[8,98],[6,100],[4,103],[2,104],[1,103],[2,98],[5,93],
    [8,82],[10,78],[14,76],[18,73],[22,70],[25,68],[28,64],[30,55],
    [32,48],[35,38],[38,32],[40,28],[42,30],[44,30],[46,30],[48,32],
    [50,36],[52,32],[55,28],[58,30],[60,32],[62,30],[65,30],[68,32],
    [70,30],[70,25],
  ],
  india: [
    [32,70],[30,68],[28,66],[25,68],[22,70],[18,72],[14,74],[10,76],
    [8,77],[7,78],[8,80],[10,80],[14,80],[18,82],[22,86],[25,88],
    [27,88],[28,86],[30,82],[32,78],[32,70],
  ],
  australia: [
    [-12,130],[-14,128],[-16,126],[-18,122],[-20,118],[-22,116],
    [-25,114],[-28,114],[-30,116],[-32,116],[-34,118],[-35,122],
    [-36,130],[-37,138],[-38,145],[-37,148],[-35,150],[-33,152],
    [-30,153],[-27,153],[-24,150],[-20,148],[-18,146],[-16,144],
    [-14,142],[-12,140],[-11,136],[-11,132],[-12,130],
  ],
  antarctica: [
    [-65,-60],[-68,-55],[-70,-50],[-72,-55],[-74,-65],[-76,-80],
    [-78,-95],[-79,-110],[-78,-125],[-76,-140],[-74,-150],[-72,-160],
    [-70,-168],[-68,-175],[-67,175],[-68,165],[-70,155],[-72,145],
    [-74,130],[-76,115],[-77,100],[-76,85],[-74,70],[-72,55],
    [-70,40],[-68,25],[-66,10],[-66,-5],[-66,-20],[-66,-35],
    [-65,-48],[-65,-60],
  ],
}

// ─── Drift keyframes: [dLat, dLon, rotationDeg] ─────────────────────────────
// Offsets from present-day position at each time period.
// Rotation is clockwise degrees around the plate's local vertical axis.

const DRIFT_KEYFRAMES = {
  //                        250 Mya              200 Mya              150 Mya              100 Mya              50 Mya             0 Mya
  northAmerica: [  [ 20,  80, -30],    [ 15,  60, -22],    [ 10,  40, -14],    [  5,  20,  -7],    [ 2,   8,  -2],    [0, 0, 0]  ],
  southAmerica: [  [-10,  70,  20],    [ -8,  55,  15],    [ -5,  40,  10],    [ -3,  25,   6],    [-1,  10,   2],    [0, 0, 0]  ],
  africa:       [  [-15,  20,  10],    [-12,  15,   8],    [ -8,  10,   5],    [ -4,   6,   3],    [-1,   2,   1],    [0, 0, 0]  ],
  europe:       [  [  5,  40, -15],    [  4,  30, -11],    [  2,  20,  -7],    [  1,  10,  -3],    [ 0,   4,  -1],    [0, 0, 0]  ],
  asia:         [  [  0,  20,  -5],    [  0,  15,  -4],    [  0,  10,  -3],    [  0,   5,  -1],    [ 0,   2,   0],    [0, 0, 0]  ],
  india:        [  [-50,  10,  35],    [-45,   8,  28],    [-35,   5,  20],    [-25,   3,  12],    [-10,  1,   4],    [0, 0, 0]  ],
  australia:    [  [ 15, -40,  25],    [ 12, -35,  20],    [ 10, -25,  14],    [  5, -15,   8],    [ 2,  -5,   3],    [0, 0, 0]  ],
  antarctica:   [  [ 20,   0, -10],    [ 15,   0,  -8],    [ 10,   0,  -5],    [  5,   0,  -3],    [ 2,   0,  -1],    [0, 0, 0]  ],
}

const RADIUS = 20
const TERRAIN_HEIGHT = 0.7  // max continent elevation above ocean
const GRID_SPACING = 2.0    // degrees between terrain grid points

// ─── Noise generators ────────────────────────────────────────────────────────

const terrainNoise = createNoise2D()
const coastNoise = createNoise2D()
const mountainNoise = createNoise2D()

function fbm(noise, x, y, octaves, lacunarity, gain) {
  let value = 0, amp = 1, freq = 1, max = 0
  for (let i = 0; i < octaves; i++) {
    value += amp * noise(x * freq, y * freq)
    max += amp
    amp *= gain
    freq *= lacunarity
  }
  return value / max
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function latLonToVec3(lat, lon, radius) {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lon + 180) * (Math.PI / 180)
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  )
}

/** Chaikin curve subdivision for smoother coastlines */
function chaikinSubdivide(points, iterations) {
  let pts = points
  for (let iter = 0; iter < iterations; iter++) {
    const next = []
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1]
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25])
      next.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75])
    }
    // Close the loop
    next.push(next[0])
    pts = next
  }
  return pts
}

/** Add noise perturbation to coastline points */
function perturbCoastline(points, scale, amplitude) {
  return points.map(([lat, lon]) => {
    const n = coastNoise(lat * scale, lon * scale) * amplitude
    const n2 = coastNoise(lat * scale * 2.5, lon * scale * 2.5) * amplitude * 0.4
    return [lat + n + n2, lon + n * 0.8 + n2 * 0.6]
  })
}

/** Point-in-polygon test (ray casting) for lat/lon */
function pointInPolygon(testLat, testLon, polygon) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i]
    const [yj, xj] = polygon[j]
    if ((yi > testLat) !== (yj > testLat) &&
        testLon < (xj - xi) * (testLat - yi) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

/** Get terrain height at a lat/lon point using multi-octave noise */
function getTerrainHeight(lat, lon, key) {
  const base = fbm(terrainNoise, lat * 0.08, lon * 0.08, 4, 2.0, 0.5)
  const detail = fbm(mountainNoise, lat * 0.15 + 100, lon * 0.15 + 100, 3, 2.2, 0.45)

  // Mountain ranges: boost height in certain zones per continent
  let mountainFactor = 0
  if (key === 'northAmerica') {
    // Rockies: western coast
    const distWest = Math.abs(lon - (-120))
    if (distWest < 10) mountainFactor = (1 - distWest / 10) * 0.6
    // Appalachians
    const distEast = Math.abs(lon - (-78)) + Math.abs(lat - 38) * 0.3
    if (distEast < 8) mountainFactor = Math.max(mountainFactor, (1 - distEast / 8) * 0.3)
  } else if (key === 'southAmerica') {
    const distAndes = Math.abs(lon - (-70))
    if (distAndes < 6) mountainFactor = (1 - distAndes / 6) * 0.7
  } else if (key === 'asia') {
    // Himalayas
    const distHim = Math.sqrt(Math.pow(lat - 30, 2) + Math.pow(lon - 85, 2))
    if (distHim < 15) mountainFactor = (1 - distHim / 15) * 0.8
  } else if (key === 'africa') {
    // East African highlands
    const distEA = Math.sqrt(Math.pow(lat - (-2), 2) + Math.pow(lon - 37, 2))
    if (distEA < 10) mountainFactor = (1 - distEA / 10) * 0.4
  } else if (key === 'europe') {
    // Alps
    const distAlps = Math.sqrt(Math.pow(lat - 46, 2) + Math.pow(lon - 10, 2))
    if (distAlps < 6) mountainFactor = (1 - distAlps / 6) * 0.5
  } else if (key === 'antarctica') {
    mountainFactor = 0.2 // ice sheet elevation
  }

  const h = (base * 0.4 + detail * 0.3 + mountainFactor) * TERRAIN_HEIGHT
  return Math.max(0.05, Math.min(TERRAIN_HEIGHT, h + 0.15))
}

/** Hypsometric color for a given height (0 = coast, TERRAIN_HEIGHT = peak) */
function getTerrainColor(height, lat, key, mya) {
  const t = height / TERRAIN_HEIGHT // 0..1

  // Base hypsometric ramp
  const lowland = new THREE.Color(0x4a8a3a)   // green lowlands
  const mid = new THREE.Color(0x6a9a4a)       // lighter green
  const highland = new THREE.Color(0x8a7a40)   // olive/tan
  const mountain = new THREE.Color(0x7a6a5a)   // brown-gray
  const snow = new THREE.Color(0xd8dce8)       // snow cap

  let color
  if (t < 0.25) color = lowland.clone().lerp(mid, t / 0.25)
  else if (t < 0.5) color = mid.clone().lerp(highland, (t - 0.25) / 0.25)
  else if (t < 0.75) color = highland.clone().lerp(mountain, (t - 0.5) / 0.25)
  else color = mountain.clone().lerp(snow, (t - 0.75) / 0.25)

  // Era-dependent tinting
  if (mya !== undefined) {
    // Pangaea era (>200 Mya): more arid/desert tones
    const aridity = smoothstep(180, 250, mya)
    if (aridity > 0) {
      const desert = new THREE.Color(0x9a8a60)
      color.lerp(desert, aridity * 0.5)
    }

    // Ice age tinting for Antarctica
    if (key === 'antarctica' && mya < 35) {
      const iceAmount = smoothstep(35, 10, mya)
      color.lerp(new THREE.Color(0xd0dce8), iceAmount * 0.8)
    }

    // Ice age for northern latitudes
    if (mya < 3 && lat > 55) {
      const glacial = smoothstep(3, 0.5, mya) * smoothstep(55, 75, lat)
      color.lerp(new THREE.Color(0xc8d4e0), glacial * 0.4)
    }
  }

  return color
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/** Interpolate drift offset for a given time */
function getDriftOffset(key, mya) {
  const keyframes = DRIFT_KEYFRAMES[key]
  if (!keyframes) return [0, 0, 0]

  const times = [250, 200, 150, 100, 50, 0]
  if (mya >= 250) return keyframes[0]
  if (mya <= 0) return keyframes[5]

  let i = 0
  for (; i < times.length - 1; i++) {
    if (mya >= times[i + 1]) break
  }

  const t0 = times[i], t1 = times[i + 1]
  const k0 = keyframes[i], k1 = keyframes[i + 1]
  const f = (t0 - mya) / (t0 - t1)
  const s = f * f * (3 - 2 * f) // smoothstep

  return [
    k0[0] + (k1[0] - k0[0]) * s,
    k0[1] + (k1[1] - k0[1]) * s,
    k0[2] + (k1[2] - k0[2]) * s,
  ]
}

// ─── Continent mesh builder ─────────────────────────────────────────────────

function buildContinent(key, rawOutline) {
  const group = new THREE.Group()

  // Subdivide and perturb coastline for organic look
  const smoothed = chaikinSubdivide(rawOutline, 2)
  const outline = perturbCoastline(smoothed, 0.12, 0.4)

  // Compute bounding box of outline
  let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180
  for (const [lat, lon] of outline) {
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
    if (lon < minLon) minLon = lon
    if (lon > maxLon) maxLon = lon
  }

  // Generate grid points inside the polygon
  const interiorPoints = [] // {lat, lon, height}
  for (let lat = minLat; lat <= maxLat; lat += GRID_SPACING) {
    for (let lon = minLon; lon <= maxLon; lon += GRID_SPACING) {
      if (pointInPolygon(lat, lon, outline)) {
        const h = getTerrainHeight(lat, lon, key)
        interiorPoints.push({ lat, lon, h })
      }
    }
  }

  // Also include outline points as boundary vertices
  const edgePoints = outline.map(([lat, lon]) => ({
    lat, lon, h: 0.08 // coastal low elevation
  }))

  // Combine all points
  const allPoints = [...edgePoints, ...interiorPoints]

  // Centroid for fallback
  const centroidLat = rawOutline.reduce((s, p) => s + p[0], 0) / rawOutline.length
  const centroidLon = rawOutline.reduce((s, p) => s + p[1], 0) / rawOutline.length

  // Triangulate using Delaunay-like approach:
  // Project lat/lon to 2D, use ear-clipping-friendly approach
  // For simplicity, use a fan + grid approach
  const positions = []
  const normals = []
  const colors = []
  const indices = []

  // Add all vertices to the buffer
  for (const pt of allPoints) {
    const r = RADIUS + pt.h
    const v = latLonToVec3(pt.lat, pt.lon, r)
    const n = v.clone().normalize()
    const col = getTerrainColor(pt.h, pt.lat, key)
    positions.push(v.x, v.y, v.z)
    normals.push(n.x, n.y, n.z)
    colors.push(col.r, col.g, col.b)
  }

  // Triangulate: for each interior point, connect to nearest 3 neighbors
  // Simple approach: Delaunay via indexed triangulation
  // Use a grid-based approach: for each grid cell, make 2 triangles
  const gridMap = new Map()
  const edgeCount = edgePoints.length
  for (let i = 0; i < interiorPoints.length; i++) {
    const pt = interiorPoints[i]
    const gi = Math.round((pt.lat - minLat) / GRID_SPACING)
    const gj = Math.round((pt.lon - minLon) / GRID_SPACING)
    gridMap.set(`${gi},${gj}`, edgeCount + i)
  }

  // Grid-cell triangulation
  for (let lat = minLat; lat < maxLat; lat += GRID_SPACING) {
    for (let lon = minLon; lon < maxLon; lon += GRID_SPACING) {
      const gi = Math.round((lat - minLat) / GRID_SPACING)
      const gj = Math.round((lon - minLon) / GRID_SPACING)
      const a = gridMap.get(`${gi},${gj}`)
      const b = gridMap.get(`${gi},${gj + 1}`)
      const c = gridMap.get(`${gi + 1},${gj}`)
      const d = gridMap.get(`${gi + 1},${gj + 1}`)

      if (a !== undefined && b !== undefined && c !== undefined) {
        indices.push(a, b, c)
      }
      if (b !== undefined && d !== undefined && c !== undefined) {
        indices.push(b, d, c)
      }
    }
  }

  // Also fan-triangulate the coastal edge to fill gaps between edge and grid
  // Connect edge points to nearest grid interior points
  for (let i = 0; i < edgePoints.length - 1; i++) {
    const ept = edgePoints[i]
    const enext = edgePoints[(i + 1) % edgePoints.length]

    // Find nearest interior point
    let nearestIdx = -1, nearestDist = Infinity
    for (let j = 0; j < interiorPoints.length; j++) {
      const ip = interiorPoints[j]
      const d = Math.pow(ip.lat - ept.lat, 2) + Math.pow(ip.lon - ept.lon, 2)
      if (d < nearestDist) { nearestDist = d; nearestIdx = edgeCount + j }
    }
    if (nearestIdx >= 0) {
      indices.push(i, (i + 1) % edgePoints.length, nearestIdx)
    }
  }

  if (positions.length > 0 && indices.length > 0) {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geo.setIndex(indices)
    geo.computeVertexNormals()

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.75,
      metalness: 0.05,
      emissive: 0x304020,
      emissiveIntensity: 0.3,
    })

    const mesh = new THREE.Mesh(geo, mat)
    mesh.userData.feature = FEATURES[key]
    mesh.userData.featureKey = key
    group.add(mesh)
  }

  // Coastline glow edge
  const coastVerts = outline.map(([lat, lon]) => latLonToVec3(lat, lon, RADIUS + 0.12))
  const coastGeo = new THREE.BufferGeometry().setFromPoints(coastVerts)
  const coastLine = new THREE.Line(coastGeo, new THREE.LineBasicMaterial({
    color: 0x60c0a0,
    transparent: true,
    opacity: 0.35,
  }))
  group.add(coastLine)

  // Continental shelf (subtle translucent fringe)
  const shelfVerts = []
  const shelfColors = []
  const shelfIndices = []
  const shelfOutline = outline.map(([lat, lon]) => {
    // Expand outward from centroid
    const dLat = lat - centroidLat
    const dLon = lon - centroidLon
    const len = Math.sqrt(dLat * dLat + dLon * dLon)
    const expand = 2.5 / (len || 1)
    return [lat + dLat * expand * 0.08, lon + dLon * expand * 0.08]
  })

  for (let i = 0; i < outline.length - 1; i++) {
    const vi = shelfVerts.length / 3
    const inner = latLonToVec3(outline[i][0], outline[i][1], RADIUS + 0.03)
    const outer = latLonToVec3(shelfOutline[i][0], shelfOutline[i][1], RADIUS + 0.02)
    const innerNext = latLonToVec3(outline[i + 1][0], outline[i + 1][1], RADIUS + 0.03)
    const outerNext = latLonToVec3(shelfOutline[i + 1][0], shelfOutline[i + 1][1], RADIUS + 0.02)

    shelfVerts.push(inner.x, inner.y, inner.z)
    shelfVerts.push(outer.x, outer.y, outer.z)
    shelfVerts.push(innerNext.x, innerNext.y, innerNext.z)
    shelfVerts.push(outerNext.x, outerNext.y, outerNext.z)

    // Inner = visible teal, outer = transparent
    shelfColors.push(0.25, 0.6, 0.55, 0.12, 0.4, 0.45, 0.25, 0.6, 0.55, 0.12, 0.4, 0.45)

    shelfIndices.push(vi, vi + 2, vi + 1)
    shelfIndices.push(vi + 1, vi + 2, vi + 3)
  }

  if (shelfVerts.length > 0) {
    const shelfGeo = new THREE.BufferGeometry()
    shelfGeo.setAttribute('position', new THREE.Float32BufferAttribute(shelfVerts, 3))
    shelfGeo.setAttribute('color', new THREE.Float32BufferAttribute(shelfColors, 3))
    shelfGeo.setIndex(shelfIndices)
    shelfGeo.computeVertexNormals()

    const shelfMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    group.add(new THREE.Mesh(shelfGeo, shelfMat))
  }

  // Store data for drift updates
  group.userData.continentKey = key
  group.userData.baseOutline = outline
  group.userData.rawOutline = rawOutline
  group.userData.interiorPoints = interiorPoints
  group.userData.edgePoints = edgePoints
  group.userData.centroidLat = centroidLat
  group.userData.centroidLon = centroidLon

  return group
}

/** Rebuild continent vertex positions with drift offset + rotation applied */
function updateContinentPosition(continentGroup, mya) {
  const key = continentGroup.userData.continentKey
  const outline = continentGroup.userData.baseOutline
  const interior = continentGroup.userData.interiorPoints
  const edgePts = continentGroup.userData.edgePoints
  const centroidLat = continentGroup.userData.centroidLat
  const centroidLon = continentGroup.userData.centroidLon
  if (!key || !outline) return

  const [dLat, dLon, dRot] = getDriftOffset(key, mya)
  const rotRad = (dRot || 0) * Math.PI / 180

  // Rotation quaternion around the plate centroid's radial axis
  const centroidPos = latLonToVec3(centroidLat + dLat, centroidLon + dLon, 1)
  const axis = centroidPos.normalize()
  const quat = new THREE.Quaternion().setFromAxisAngle(axis, rotRad)

  // Helper: apply drift + rotation to a lat/lon point
  function transformPoint(lat, lon, r) {
    const driftedLat = lat + dLat
    const driftedLon = lon + dLon
    const v = latLonToVec3(driftedLat, driftedLon, r)
    // Rotate around centroid axis
    if (Math.abs(rotRad) > 0.001) {
      const centroid3D = latLonToVec3(centroidLat + dLat, centroidLon + dLon, r)
      v.sub(centroid3D)
      v.applyQuaternion(quat)
      v.add(centroid3D)
    }
    return v
  }

  // Update terrain mesh (child 0)
  const terrainMesh = continentGroup.children[0]
  if (terrainMesh?.geometry) {
    const pos = terrainMesh.geometry.attributes.position
    const nrm = terrainMesh.geometry.attributes.normal
    const col = terrainMesh.geometry.attributes.color

    let vi = 0
    // Edge points first
    for (const ep of edgePts) {
      const r = RADIUS + ep.h
      const v = transformPoint(ep.lat, ep.lon, r)
      const n = v.clone().normalize()
      const c = getTerrainColor(ep.h, ep.lat, key, mya)
      pos.setXYZ(vi, v.x, v.y, v.z)
      nrm.setXYZ(vi, n.x, n.y, n.z)
      col.setXYZ(vi, c.r, c.g, c.b)
      vi++
    }
    // Interior points
    for (const ip of interior) {
      const r = RADIUS + ip.h
      const v = transformPoint(ip.lat, ip.lon, r)
      const n = v.clone().normalize()
      const c = getTerrainColor(ip.h, ip.lat, key, mya)
      pos.setXYZ(vi, v.x, v.y, v.z)
      nrm.setXYZ(vi, n.x, n.y, n.z)
      col.setXYZ(vi, c.r, c.g, c.b)
      vi++
    }
    pos.needsUpdate = true
    nrm.needsUpdate = true
    col.needsUpdate = true
  }

  // Update coastline (child 1)
  const coastLine = continentGroup.children[1]
  if (coastLine?.geometry) {
    const pos = coastLine.geometry.attributes.position
    for (let i = 0; i < outline.length; i++) {
      const v = transformPoint(outline[i][0], outline[i][1], RADIUS + 0.12)
      pos.setXYZ(i, v.x, v.y, v.z)
    }
    pos.needsUpdate = true
  }

  // Update shelf (child 2)
  const shelf = continentGroup.children[2]
  if (shelf?.geometry) {
    const shelfOutline = outline.map(([lat, lon]) => {
      const dLatC = lat - centroidLat
      const dLonC = lon - centroidLon
      const len = Math.sqrt(dLatC * dLatC + dLonC * dLonC)
      const expand = 2.5 / (len || 1)
      return [lat + dLatC * expand * 0.08, lon + dLonC * expand * 0.08]
    })

    const pos = shelf.geometry.attributes.position
    let vi = 0
    for (let i = 0; i < outline.length - 1; i++) {
      const inner = transformPoint(outline[i][0], outline[i][1], RADIUS + 0.03)
      const outer = transformPoint(shelfOutline[i][0], shelfOutline[i][1], RADIUS + 0.02)
      const innerNext = transformPoint(outline[i + 1][0], outline[i + 1][1], RADIUS + 0.03)
      const outerNext = transformPoint(shelfOutline[i + 1][0], shelfOutline[i + 1][1], RADIUS + 0.02)
      pos.setXYZ(vi++, inner.x, inner.y, inner.z)
      pos.setXYZ(vi++, outer.x, outer.y, outer.z)
      pos.setXYZ(vi++, innerNext.x, innerNext.y, innerNext.z)
      pos.setXYZ(vi++, outerNext.x, outerNext.y, outerNext.z)
    }
    pos.needsUpdate = true
  }

  // Store current centroid for labels
  const centroid3D = transformPoint(centroidLat, centroidLon, RADIUS + 2.0)
  continentGroup.userData.currentCentroid = centroid3D
}

// ─── Ocean with bathymetry shader ────────────────────────────────────────────

function buildOceanSphere() {
  const geo = new THREE.SphereGeometry(RADIUS, 96, 64)

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uMya: { value: 250 },
      uTime: { value: 0 },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      varying float vY;
      uniform float uTime;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vY = position.y / 20.0; // normalized height
        // Subtle ocean surface animation
        vec3 pos = position;
        float wave = sin(pos.x * 0.8 + uTime * 0.3) * cos(pos.z * 0.6 + uTime * 0.2) * 0.05;
        pos += normal * wave;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      precision mediump float;
      uniform float uMya;
      uniform float uTime;
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      varying float vY;

      void main() {
        // Depth zone coloring
        vec3 deepOcean = vec3(0.04, 0.08, 0.18);
        vec3 midOcean = vec3(0.06, 0.15, 0.32);
        vec3 shallow = vec3(0.10, 0.28, 0.42);

        // Use world position for pseudo-bathymetry
        float n = sin(vWorldPos.x * 0.3) * cos(vWorldPos.z * 0.25) * 0.5 + 0.5;
        float ridge = smoothstep(0.42, 0.5, n) * smoothstep(0.58, 0.5, n);

        vec3 color = mix(deepOcean, midOcean, n * 0.6);
        // Mid-ocean ridges: slightly brighter
        color += ridge * vec3(0.03, 0.06, 0.12);

        // Era-dependent: Panthalassic (250Mya) = darker, more uniform
        float pangaeaFactor = smoothstep(150.0, 250.0, uMya);
        vec3 panthalassa = vec3(0.03, 0.06, 0.15);
        color = mix(color, panthalassa, pangaeaFactor * 0.4);

        // Subtle wave shimmer
        float shimmer = sin(vWorldPos.x * 2.0 + uTime * 0.5) * sin(vWorldPos.z * 1.8 + uTime * 0.4);
        color += shimmer * 0.008;

        // Emissive glow
        color += vec3(0.06, 0.12, 0.22);

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  })

  return new THREE.Mesh(geo, mat)
}

// ─── Atmosphere glow ─────────────────────────────────────────────────────────

function buildAtmosphere() {
  const geo = new THREE.SphereGeometry(RADIUS * 1.06, 64, 48)
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      glowColor: { value: new THREE.Color(0x4090c0) },
      viewVector: { value: new THREE.Vector3() },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vViewDir = normalize(cameraPosition - worldPos.xyz);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision mediump float;
      uniform vec3 glowColor;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        float intensity = pow(0.72 - dot(vNormal, vViewDir), 3.0);
        intensity = clamp(intensity, 0.0, 1.0);
        gl_FragColor = vec4(glowColor, intensity * 0.6);
      }
    `,
  })

  const mesh = new THREE.Mesh(geo, mat)
  return { mesh, material: mat }
}

// ─── Cloud layer ─────────────────────────────────────────────────────────────

function buildCloudLayer() {
  const geo = new THREE.SphereGeometry(RADIUS * 1.025, 48, 32)
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    uniforms: {
      uTime: { value: 0 },
    },
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision mediump float;
      uniform float uTime;
      varying vec3 vPos;

      // Compact 3D value noise
      float hash(vec3 p) {
        p = fract(p * vec3(443.897, 441.423, 437.195));
        p += dot(p, p.yzx + 19.19);
        return fract((p.x + p.y) * p.z);
      }

      float noise3D(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
              mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
              mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
          f.z
        );
      }

      float fbm3(vec3 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * noise3D(p);
          p *= 2.1;
          a *= 0.45;
        }
        return v;
      }

      void main() {
        vec3 p = normalize(vPos) * 3.0;
        float n = fbm3(p + vec3(uTime * 0.008, 0.0, uTime * 0.005));
        float cloud = smoothstep(0.35, 0.65, n);
        gl_FragColor = vec4(1.0, 1.0, 1.0, cloud * 0.14);
      }
    `,
  })

  return new THREE.Mesh(geo, mat)
}

// ─── Lat/lon grid ────────────────────────────────────────────────────────────

function buildLatLonGrid() {
  const group = new THREE.Group()
  const mat = new THREE.LineBasicMaterial({
    color: 0x4090c0,
    transparent: true,
    opacity: 0.06,
  })

  for (let lat = -60; lat <= 60; lat += 30) {
    const points = []
    for (let lon = 0; lon <= 360; lon += 3) {
      points.push(latLonToVec3(lat, lon - 180, RADIUS + 0.02))
    }
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), mat))
  }
  for (let lon = -180; lon < 180; lon += 30) {
    const points = []
    for (let lat = -90; lat <= 90; lat += 3) {
      points.push(latLonToVec3(lat, lon, RADIUS + 0.02))
    }
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), mat))
  }

  return group
}

// ─── Main export ────────────────────────────────────────────────────────────

export function createPangaeaModel() {
  const group = new THREE.Group()
  const clickTargets = []
  const continents = []

  // Ocean
  const ocean = buildOceanSphere()
  group.add(ocean)

  // Atmosphere
  const atmo = buildAtmosphere()
  group.add(atmo.mesh)

  // Cloud layer
  const clouds = buildCloudLayer()
  group.add(clouds)

  // Lat/lon grid
  group.add(buildLatLonGrid())

  // Continents
  for (const [key, outline] of Object.entries(CONTINENT_OUTLINES_RAW)) {
    const continent = buildContinent(key, outline)
    group.add(continent)
    continents.push(continent)
    // First child (terrain mesh) is click target
    if (continent.children[0]) {
      clickTargets.push(continent.children[0])
    }
  }

  // Label anchors
  const labelAnchors = {}
  for (const [key, feature] of Object.entries(FEATURES)) {
    const outline = CONTINENT_OUTLINES_RAW[key]
    if (!outline) continue
    const centroidLat = outline.reduce((s, p) => s + p[0], 0) / outline.length
    const centroidLon = outline.reduce((s, p) => s + p[1], 0) / outline.length
    labelAnchors[key] = {
      pos: latLonToVec3(centroidLat, centroidLon, RADIUS + 2.0),
      name: feature.name,
    }
  }

  return {
    group,
    clickTargets,
    labelAnchors,
    features: FEATURES,
    continents,
    atmosphere: atmo,
    ocean,
    clouds,
    radius: RADIUS,
    periods: PERIODS,

    setTime(mya) {
      // Update continent positions
      for (const continent of continents) {
        updateContinentPosition(continent, mya)
      }

      // Update label anchor positions
      for (const key of Object.keys(CONTINENT_OUTLINES_RAW)) {
        const continent = continents.find(c => c.userData.continentKey === key)
        if (continent?.userData.currentCentroid && labelAnchors[key]) {
          labelAnchors[key].pos.copy(continent.userData.currentCentroid)
        }
      }

      // Update ocean shader
      if (ocean.material.uniforms) {
        ocean.material.uniforms.uMya.value = mya
      }
    },
  }
}
