import * as THREE from 'three'
import { EffectComposer }  from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass }      from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { CameraController } from '../camera.js'
import { initMarsHUD, setStatus, setTerrainLabel, setFeatureClickCallback } from '../hud.js'

// ─── Region definitions ──────────────────────────────────────────────────────

const REGIONS = {
  everestv2: {
    label:    'MOUNT EVEREST',
    subtitle: 'KHUMBU REGION · NEPAL / TIBET',
    // Elevation mesh — z=12 4x4 gives a 1024x1024 heightmap (~35 km coverage)
    z: 12, baseX: 3035, baseY: 1714, grid: 4,
    // Satellite imagery — higher zoom for sharper texture over the same area
    // satZ=14 → 16x16 tiles → 4096x4096 texture (~9.5 m/pixel)
    satZ: 14,
    sceneH: 52,
    camPos:    [0, 80, 180],
    camTarget: [10, 0, 30],
    features: [
      { name: 'Mount Everest',   type: 'Summit',  lat: 27.988, lon: 86.925, depth: '---', width: '8,849 m' },
      { name: 'Lhotse',          type: 'Summit',  lat: 27.962, lon: 86.933, depth: '---', width: '8,516 m' },
      { name: 'Nuptse',          type: 'Summit',  lat: 27.965, lon: 86.895, depth: '---', width: '7,861 m' },
      { name: 'Khumbu Icefall',  type: 'Glacier', lat: 28.005, lon: 86.860, depth: '---', width: '5,500 m' },
      { name: 'Rongbuk Glacier', type: 'Glacier', lat: 28.08,  lon: 86.85,  depth: '---', width: '22 km'   },
      { name: 'Cho Oyu',         type: 'Summit',  lat: 28.094, lon: 86.661, depth: '---', width: '8,188 m' },
    ],
  },
  grandcanyonv2: {
    label:    'GRAND CANYON',
    subtitle: 'COLORADO PLATEAU · ARIZONA',
    // Elevation mesh — z=11 4x4 gives a 1024x1024 heightmap (~63 km coverage)
    z: 11, baseX: 384, baseY: 800, grid: 4,
    // satZ=13 → 16x16 tiles → 4096x4096 texture (~15 m/pixel)
    satZ: 13,
    sceneH: 26,
    blurRadius: 3,
    camPos:    [0, 55, 240],
    camTarget: [0, -5, 100],
    features: [
      { name: 'South Rim',        type: 'Rim',    lat: 36.06, lon: -112.14, depth: '1,800 m', width: '16 km'  },
      { name: 'North Rim',        type: 'Rim',    lat: 36.20, lon: -112.06, depth: '2,450 m', width: '---'    },
      { name: 'Colorado River',   type: 'River',  lat: 36.10, lon: -112.10, depth: '---',     width: '90 m'   },
      { name: 'Bright Angel Pt',  type: 'Vista',  lat: 36.21, lon: -112.05, depth: '---',     width: '---'    },
      { name: 'Desert View',      type: 'Vista',  lat: 36.04, lon: -111.83, depth: '---',     width: '---'    },
      { name: 'Havasu Falls',     type: 'Falls',  lat: 36.26, lon: -112.70, depth: '---',     width: '30 m'   },
    ],
  },
  yosemite: {
    label:    'YOSEMITE VALLEY',
    subtitle: 'SIERRA NEVADA · CALIFORNIA',
    z: 12, baseX: 685, baseY: 1583, grid: 4,
    satZ: 14,
    sceneH: 36,
    blurRadius: 2,
    camPos:    [30, 70, 120],
    camTarget: [50, 0, -70],
    features: [
      { name: 'El Capitan',      type: 'Cliff',     lat: 37.734, lon: -119.637, depth: '---', width: '900 m'   },
      { name: 'Half Dome',       type: 'Summit',    lat: 37.746, lon: -119.533, depth: '---', width: '2,693 m' },
      { name: 'Yosemite Falls',  type: 'Waterfall', lat: 37.756, lon: -119.597, depth: '---', width: '739 m'   },
      { name: 'Bridalveil Fall', type: 'Waterfall', lat: 37.717, lon: -119.646, depth: '---', width: '188 m'   },
      { name: 'Glacier Point',   type: 'Vista',     lat: 37.731, lon: -119.574, depth: '---', width: '2,199 m' },
      { name: 'Nevada Fall',     type: 'Waterfall', lat: 37.726, lon: -119.535, depth: '---', width: '181 m'   },
    ],
  },
  fjords: {
    label:    'GEIRANGERFJORD',
    subtitle: 'SUNNMØRE · WESTERN NORWAY',
    // z=11 for wider lat coverage at 62°N (Web Mercator stretches heavily)
    z: 11, baseX: 1062, baseY: 569, grid: 4,
    satZ: 13,
    sceneH: 28,
    blurRadius: 3,
    camPos:    [30, 60, 100],
    camTarget: [50, 0, -80],
    features: [
      { name: 'Geiranger',           type: 'Village',   lat: 62.096, lon: 7.206, depth: '---', width: '---'    },
      { name: 'Seven Sisters Falls', type: 'Waterfall', lat: 62.108, lon: 7.092, depth: '---', width: '250 m'  },
      { name: 'The Suitor Falls',    type: 'Waterfall', lat: 62.112, lon: 7.078, depth: '---', width: '---'    },
      { name: 'Dalsnibba',           type: 'Vista',     lat: 62.045, lon: 7.272, depth: '---', width: '1,476 m'},
      { name: 'Flydalsjuvet',        type: 'Vista',     lat: 62.083, lon: 7.230, depth: '---', width: '---'    },
      { name: 'Eagle Road',          type: 'Route',     lat: 62.088, lon: 7.155, depth: '---', width: '---'    },
    ],
  },
  craterlake: {
    label:    'CRATER LAKE',
    subtitle: 'CASCADE RANGE · OREGON',
    z: 12, baseX: 657, baseY: 1503, grid: 4,
    satZ: 14,
    sceneH: 30,
    blurRadius: 2,
    camPos:    [0, 70, 150],
    camTarget: [10, 0, -20],
    features: [
      { name: 'Wizard Island',   type: 'Volcano',  lat: 42.946, lon: -122.158, depth: '---', width: '2,113 m' },
      { name: 'Phantom Ship',    type: 'Rock',     lat: 42.925, lon: -122.070, depth: '---', width: '---'     },
      { name: 'Rim Village',     type: 'Vista',    lat: 42.912, lon: -122.145, depth: '---', width: '2,168 m' },
      { name: 'Garfield Peak',   type: 'Summit',   lat: 42.916, lon: -122.120, depth: '---', width: '2,457 m' },
      { name: 'Watchman Peak',   type: 'Summit',   lat: 42.945, lon: -122.172, depth: '---', width: '2,442 m' },
      { name: 'Cleetwood Cove',  type: 'Trailhead',lat: 42.978, lon: -122.081, depth: '---', width: '---'     },
    ],
  },
  hawaii: {
    label:    'HAWAI\u02BBI (BIG ISLAND)',
    subtitle: 'PACIFIC OCEAN · UNITED STATES',
    // z=10 for full island coverage (~150 km)
    z: 10, baseX: 67, baseY: 453, grid: 4,
    satZ: 12,
    sceneH: 24,
    blurRadius: 2,
    camPos:    [-20, 60, 160],
    camTarget: [10, 0, -30],
    features: [
      { name: 'Mauna Kea',    type: 'Summit',  lat: 19.821, lon: -155.468, depth: '---', width: '4,207 m' },
      { name: 'Kilauea',      type: 'Volcano', lat: 19.421, lon: -155.287, depth: '---', width: '1,247 m' },
      { name: 'Mauna Loa',    type: 'Volcano', lat: 19.475, lon: -155.608, depth: '---', width: '4,169 m' },
      { name: 'Hualalai',     type: 'Volcano', lat: 19.693, lon: -155.870, depth: '---', width: '2,523 m' },
      { name: 'Hilo Bay',     type: 'Coast',   lat: 19.730, lon: -155.080, depth: '---', width: '---'     },
      { name: 'Kohala',       type: 'Volcano', lat: 20.085, lon: -155.790, depth: '---', width: '1,670 m' },
    ],
  },
  patagonia: {
    label:    'TORRES DEL PAINE',
    subtitle: 'MAGALLANES · CHILEAN PATAGONIA',
    z: 11, baseX: 606, baseY: 1360, grid: 4,
    satZ: 13,
    sceneH: 32,
    blurRadius: 2,
    camPos:    [20, 65, 140],
    camTarget: [30, 0, -40],
    features: [
      { name: 'Torres del Paine', type: 'Summit',  lat: -50.942, lon: -72.960, depth: '---', width: '2,884 m' },
      { name: 'Grey Glacier',     type: 'Glacier', lat: -50.980, lon: -73.230, depth: '---', width: '6 km'    },
      { name: 'Lake Pehoé',       type: 'Lake',    lat: -51.080, lon: -72.980, depth: '---', width: '---'     },
      { name: 'Cuernos del Paine',type: 'Summit',  lat: -50.985, lon: -72.945, depth: '---', width: '2,600 m' },
      { name: 'French Valley',    type: 'Valley',  lat: -50.975, lon: -73.060, depth: '---', width: '---'     },
      { name: 'Nordenskjöld Lake',type: 'Lake',    lat: -51.040, lon: -72.860, depth: '---', width: '---'     },
    ],
  },
  dolomites: {
    label:    'DOLOMITES',
    subtitle: 'SOUTH TYROL · NORTHERN ITALY',
    // z=11 for wider coverage across the Dolomite range (~70 km)
    z: 11, baseX: 1089, baseY: 722, grid: 4,
    satZ: 13,
    sceneH: 36,
    blurRadius: 2,
    camPos:    [10, 75, 160],
    camTarget: [20, 0, -30],
    features: [
      { name: 'Sassolungo',       type: 'Summit',  lat: 46.516, lon: 11.730, depth: '---', width: '3,181 m' },
      { name: 'Marmolada',        type: 'Glacier', lat: 46.435, lon: 11.853, depth: '---', width: '3,343 m' },
      { name: 'Seceda',           type: 'Vista',   lat: 46.601, lon: 11.724, depth: '---', width: '2,519 m' },
      { name: 'Lago di Braies',   type: 'Lake',    lat: 46.694, lon: 12.085, depth: '---', width: '---'     },
      { name: 'Passo di Giau',    type: 'Pass',    lat: 46.484, lon: 12.053, depth: '---', width: '2,236 m' },
      { name: 'Odle Group',       type: 'Ridge',   lat: 46.613, lon: 11.810, depth: '---', width: '3,025 m' },
    ],
  },
  matterhorn: {
    label:    'MATTERHORN',
    subtitle: 'PENNINE ALPS · SWITZERLAND / ITALY',
    z: 12, baseX: 2133, baseY: 1455, grid: 4,
    satZ: 14,
    sceneH: 40,
    blurRadius: 2,
    camPos:    [0, 80, 160],
    camTarget: [15, 0, -20],
    features: [
      { name: 'Matterhorn',     type: 'Summit',  lat: 45.977, lon: 7.659, depth: '---', width: '4,478 m' },
      { name: 'Gorner Glacier', type: 'Glacier', lat: 45.960, lon: 7.800, depth: '---', width: '14 km'   },
      { name: 'Monte Rosa',     type: 'Summit',  lat: 45.937, lon: 7.867, depth: '---', width: '4,634 m' },
      { name: 'Zermatt',        type: 'Village', lat: 46.020, lon: 7.749, depth: '---', width: '1,608 m' },
      { name: 'Theodul Pass',   type: 'Pass',    lat: 45.945, lon: 7.710, depth: '---', width: '3,295 m' },
      { name: 'Breithorn',      type: 'Summit',  lat: 45.941, lon: 7.747, depth: '---', width: '4,164 m' },
    ],
  },
  iceland: {
    label:    'ICELAND HIGHLANDS',
    subtitle: 'SOUTHERN HIGHLANDS · ICELAND',
    // z=10 for wider coverage at 64°N
    z: 10, baseX: 455, baseY: 272, grid: 4,
    satZ: 12,
    sceneH: 28,
    blurRadius: 2,
    camPos:    [10, 65, 140],
    camTarget: [20, 0, -40],
    features: [
      { name: 'Landmannalaugar',  type: 'Geothermal', lat: 63.993, lon: -19.059, depth: '---', width: '---'     },
      { name: 'Hekla',            type: 'Volcano',    lat: 63.983, lon: -19.700, depth: '---', width: '1,491 m' },
      { name: 'Eyjafjallajökull', type: 'Glacier',    lat: 63.630, lon: -19.613, depth: '---', width: '1,651 m' },
      { name: 'Þórsmörk',        type: 'Valley',     lat: 63.680, lon: -19.510, depth: '---', width: '---'     },
      { name: 'Ljótipollur',      type: 'Crater Lake',lat: 63.976, lon: -19.205, depth: '---', width: '---'     },
      { name: 'Mýrdalsjökull',    type: 'Glacier',    lat: 63.600, lon: -19.100, depth: '---', width: '---'     },
    ],
  },
  zhangjiajie: {
    label:    'ZHANGJIAJIE',
    subtitle: 'HUNAN PROVINCE · CHINA',
    z: 12, baseX: 3302, baseY: 1697, grid: 4,
    satZ: 14,
    sceneH: 35,
    blurRadius: 2,
    camPos:    [20, 65, 130],
    camTarget: [40, 0, -50],
    features: [
      { name: 'Avatar Hallelujah Mt', type: 'Pillar',  lat: 29.347, lon: 110.404, depth: '---', width: '1,080 m' },
      { name: 'Tianzi Mountain',      type: 'Summit',  lat: 29.378, lon: 110.432, depth: '---', width: '1,262 m' },
      { name: 'Golden Whip Stream',   type: 'Stream',  lat: 29.328, lon: 110.412, depth: '---', width: '---'     },
      { name: 'Yuanjiajie',           type: 'Plateau', lat: 29.350, lon: 110.398, depth: '---', width: '---'     },
      { name: 'Baofeng Lake',         type: 'Lake',    lat: 29.300, lon: 110.455, depth: '---', width: '---'     },
      { name: 'Huangshi Village',     type: 'Vista',   lat: 29.365, lon: 110.420, depth: '---', width: '---'     },
    ],
  },
  deadsea: {
    label:    'DEAD SEA',
    subtitle: 'JORDAN RIFT VALLEY · ISRAEL / JORDAN',
    // z=11 for longer coverage of the Dead Sea (~60 km)
    z: 11, baseX: 1223, baseY: 833, grid: 4,
    satZ: 13,
    sceneH: 32,
    blurRadius: 2,
    camPos:    [0, 70, 160],
    camTarget: [10, 0, -20],
    features: [
      { name: 'Dead Sea',       type: 'Lake',   lat: 31.50, lon: 35.48, depth: '-430 m', width: '17 km'  },
      { name: 'Masada',         type: 'Fortress',lat: 31.316, lon: 35.354, depth: '---', width: '59 m'   },
      { name: 'Ein Gedi',       type: 'Oasis',  lat: 31.462, lon: 35.389, depth: '---', width: '---'     },
      { name: 'Qumran',         type: 'Ruins',  lat: 31.741, lon: 35.459, depth: '---', width: '---'     },
      { name: 'Wadi Arugot',    type: 'Canyon', lat: 31.458, lon: 35.368, depth: '---', width: '---'     },
      { name: 'Judaean Desert', type: 'Desert', lat: 31.60,  lon: 35.30,  depth: '---', width: '---'     },
    ],
  },
}

// ─── Resolution offset (applied to satZ at load time) ────────────────────────

let resolutionOffset = 0
export function getResolutionOffset() { return resolutionOffset }
export function setResolutionOffset(n) { resolutionOffset = n }

// ─── Coordinate utilities ────────────────────────────────────────────────────

function gridBounds(z, baseX, baseY, grid) {
  const n     = Math.pow(2, z)
  const west  = (baseX / n) * 360 - 180
  const east  = ((baseX + grid) / n) * 360 - 180
  const north = Math.atan(Math.sinh(Math.PI * (1 - 2 * baseY / n))) * (180 / Math.PI)
  const south = Math.atan(Math.sinh(Math.PI * (1 - 2 * (baseY + grid) / n))) * (180 / Math.PI)
  return { west, east, north, south }
}

function latlonToScene(lat, lon, bounds, planeSize = 300) {
  const nx = (lon - bounds.west)  / (bounds.east  - bounds.west)
  const ny = (lat - bounds.north) / (bounds.south - bounds.north)
  return new THREE.Vector3(
    (nx - 0.5) * planeSize,
    0,
    (ny - 0.5) * planeSize,
  )
}

// ─── Tile loading ─────────────────────────────────────────────────────────────

function fetchTile(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload  = () => resolve(img)
    img.onerror = () => reject(new Error(`Tile failed: ${url}`))
    img.src = url
  })
}

async function loadHeightmap(region, onStatus) {
  const { z, baseX, baseY, grid } = region
  const TILE  = 256
  const total = TILE * grid

  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = total
  const ctx = canvas.getContext('2d')

  onStatus('FETCHING ELEVATION TILES...')

  await Promise.all(
    Array.from({ length: grid * grid }, (_, i) => {
      const col = i % grid
      const row = Math.floor(i / grid)
      return fetchTile(`/terrarium/terrarium/${z}/${baseX + col}/${baseY + row}.png`)
        .then(img => ctx.drawImage(img, col * TILE, row * TILE))
    }),
  )

  onStatus('PROCESSING ELEVATION DATA...')

  const { data } = ctx.getImageData(0, 0, total, total)
  const raw = new Float32Array(total * total)
  for (let i = 0; i < raw.length; i++) {
    raw[i] = data[i * 4] * 256 + data[i * 4 + 1] + data[i * 4 + 2] / 256 - 32768
  }

  return { raw, size: total }
}

async function loadSatelliteImagery(region, onStatus) {
  // Satellite tiles at higher zoom than elevation for sharper imagery.
  // satZ=14 over the same geographic area as z=12 4x4 → 16x16 tiles → 4096x4096
  const satZ    = (region.satZ ?? region.z) + resolutionOffset
  const ratio   = Math.pow(2, satZ - region.z)
  const satBaseX = region.baseX * ratio
  const satBaseY = region.baseY * ratio
  const satGrid  = region.grid  * ratio   // e.g. 4*4 = 16
  const TILE  = 256
  const total = TILE * satGrid

  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = total
  const ctx = canvas.getContext('2d')

  const tileCount = satGrid * satGrid
  let loaded = 0
  const reportInterval = Math.max(16, Math.floor(tileCount / 16))
  onStatus(`FETCHING SATELLITE IMAGERY... 0/${tileCount}`)

  await Promise.all(
    Array.from({ length: tileCount }, (_, i) => {
      const col = i % satGrid
      const row = Math.floor(i / satGrid)
      // ESRI uses {z}/{y}/{x} order
      return fetchTile(`/esri/ArcGIS/rest/services/World_Imagery/MapServer/tile/${satZ}/${satBaseY + row}/${satBaseX + col}`)
        .then(img => {
          ctx.drawImage(img, col * TILE, row * TILE)
          loaded++
          if (loaded % reportInterval === 0 || loaded === tileCount) {
            onStatus(`FETCHING SATELLITE IMAGERY... ${loaded}/${tileCount}`)
          }
        })
    }),
  )

  return canvas
}

// ─── Heightmap processing ─────────────────────────────────────────────────────

function blurHeightmap(src, size, radius) {
  const tmp = new Float32Array(src.length)
  const out = new Float32Array(src.length)
  const w   = 2 * radius + 1

  for (let r = 0; r < size; r++) {
    const off = r * size
    let sum = 0
    for (let k = -radius; k <= radius; k++) sum += src[off + Math.max(0, Math.min(size - 1, k))]
    tmp[off] = sum / w
    for (let c = 1; c < size; c++) {
      sum -= src[off + Math.max(0, c - radius - 1)]
      sum += src[off + Math.min(size - 1, c + radius)]
      tmp[off + c] = sum / w
    }
  }
  for (let c = 0; c < size; c++) {
    let sum = 0
    for (let k = -radius; k <= radius; k++) sum += tmp[Math.max(0, Math.min(size - 1, k)) * size + c]
    out[c] = sum / w
    for (let r = 1; r < size; r++) {
      sum -= tmp[Math.max(0, r - radius - 1) * size + c]
      sum += tmp[Math.min(size - 1, r + radius) * size + c]
      out[r * size + c] = sum / w
    }
  }
  return out
}

// ─── Terrain mesh with satellite texture ──────────────────────────────────────

function buildTerrain(scene, raw, size, satelliteCanvas, sceneH, renderer, blurRadius = 2) {
  const smooth = blurHeightmap(raw, size, blurRadius)

  let minR = Infinity, maxR = -Infinity
  for (const v of smooth) { if (v < minR) minR = v; if (v > maxR) maxR = v }

  const scale = sceneH / Math.max(maxR - minR, 1)

  const geo = new THREE.PlaneGeometry(300, 300, size - 1, size - 1)
  geo.rotateX(-Math.PI / 2)

  const pos = geo.attributes.position
  for (let i = 0; i < smooth.length; i++) {
    pos.setY(i, (smooth[i] - minR) * scale - sceneH / 2)
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()

  // Satellite imagery texture
  const texture = new THREE.CanvasTexture(satelliteCanvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter  = THREE.LinearMipmapLinearFilter
  texture.magFilter  = THREE.LinearFilter
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy()

  const mat = new THREE.MeshStandardMaterial({
    map:       texture,
    roughness: 0.85,
    metalness: 0.0,
  })

  const mesh = new THREE.Mesh(geo, mat)
  scene.add(mesh)

  function sampleHeight(sceneX, sceneZ) {
    const col = Math.round((sceneX / 300 + 0.5) * (size - 1))
    const row = Math.round((sceneZ / 300 + 0.5) * (size - 1))
    const idx = Math.max(0, Math.min(size * size - 1, row * size + col))
    return (smooth[idx] - minR) * scale - sceneH / 2
  }

  return { mesh, material: mat, sampleHeight }
}

// ─── Feature markers ──────────────────────────────────────────────────────────

function buildFeatureMarkers(scene, features) {
  return features.map(f => {
    const pos = f.scenePos

    const ringGeo = new THREE.RingGeometry(3.5, 5.5, 48)
    ringGeo.rotateX(-Math.PI / 2)
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x1a7fc4, transparent: true, opacity: 0.22,
      side: THREE.DoubleSide, depthWrite: false,
    })
    const ring = new THREE.Mesh(ringGeo, ringMat)
    ring.position.copy(pos)
    scene.add(ring)

    const dotGeo = new THREE.CircleGeometry(1.2, 24)
    dotGeo.rotateX(-Math.PI / 2)
    const dotMat = new THREE.MeshBasicMaterial({
      color: 0x1a7fc4, transparent: true, opacity: 0.35,
      side: THREE.DoubleSide, depthWrite: false,
    })
    const dot = new THREE.Mesh(dotGeo, dotMat)
    dot.position.copy(pos)
    scene.add(dot)

    const pulseGeo = new THREE.RingGeometry(3.5, 5.5, 48)
    pulseGeo.rotateX(-Math.PI / 2)
    const pulseMat = new THREE.MeshBasicMaterial({
      color: 0x40b8ff, transparent: true, opacity: 0,
      side: THREE.DoubleSide, depthWrite: false,
    })
    const pulse = new THREE.Mesh(pulseGeo, pulseMat)
    pulse.position.copy(pos)
    scene.add(pulse)

    return { ring, ringMat, dot, dotMat, pulse, pulseMat, active: false, phase: 0 }
  })
}

function updateMarkers(markers, dt) {
  markers.forEach(m => {
    if (m.active) {
      m.phase = (m.phase + dt * 1.2) % 1
      const s = 1 + m.phase * 2.2
      m.pulse.scale.set(s, 1, s)
      m.pulseMat.opacity = (1 - m.phase) * 0.75
      m.ringMat.opacity  = 0.85
      m.dotMat.opacity   = 0.9
    } else {
      m.phase = 0
      m.pulse.scale.set(1, 1, 1)
      m.pulseMat.opacity = 0
      m.ringMat.opacity  = 0.22
      m.dotMat.opacity   = 0.35
    }
  })
}

// ─── View factory ─────────────────────────────────────────────────────────────

export function createPhotoView(regionKey) {
  let scene_, camCtrl_, composer_, terrain_, markers_, clock_

  return {
    async init(renderer) {
      const region = REGIONS[regionKey]
      clock_ = new THREE.Clock()

      scene_ = new THREE.Scene()
      scene_.background = new THREE.Color(0x1a2a3a)
      scene_.fog = new THREE.Fog(0x6a8aaa, 200, 400)

      const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.5, 2000)
      camCtrl_ = new CameraController(camera, renderer.domElement)

      if (region.camPos) {
        const [cx, cy, cz] = region.camPos
        camCtrl_.camera.position.set(cx, cy, cz)
      }
      if (region.camTarget) {
        const [tx, ty, tz] = region.camTarget
        camCtrl_.controls.target.set(tx, ty, tz)
        camCtrl_.camera.lookAt(tx, ty, tz)
      }

      // Post-processing — subtle bloom for snow/rock highlights
      composer_ = new EffectComposer(renderer)
      composer_.addPass(new RenderPass(scene_, camera))
      composer_.addPass(new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.15, 0.3, 0.9,
      ))

      // Naturalistic lighting
      const sun = new THREE.DirectionalLight(0xfff8f0, 2.0)
      sun.position.set(120, 200, 60)
      scene_.add(sun)

      const fill = new THREE.DirectionalLight(0x80a0c0, 0.4)
      fill.position.set(-100, 60, -80)
      scene_.add(fill)

      const hemi = new THREE.HemisphereLight(0x87CEEB, 0x444030, 0.5)
      scene_.add(hemi)

      // Load elevation + satellite concurrently
      const [heightmapResult, satelliteCanvas] = await Promise.all([
        loadHeightmap(region, setStatus),
        loadSatelliteImagery(region, setStatus),
      ])

      setStatus('BUILDING TERRAIN MESH...')
      terrain_ = buildTerrain(
        scene_, heightmapResult.raw, heightmapResult.size,
        satelliteCanvas, region.sceneH, renderer, region.blurRadius,
      )

      // Place feature markers
      const bounds = gridBounds(region.z, region.baseX, region.baseY, region.grid)
      const featuresWithPos = region.features.map(f => {
        const pos = latlonToScene(f.lat, f.lon, bounds)
        pos.y = terrain_.sampleHeight(pos.x, pos.z) + 0.3
        return { ...f, scenePos: pos }
      })

      markers_ = buildFeatureMarkers(scene_, featuresWithPos)

      // HUD
      initMarsHUD(region, featuresWithPos, 'EARTH SURFACE SURVEY')
      setStatus(`${region.label} · ACTIVE`)
      setTerrainLabel(`EARTH · ESRI SATELLITE · Z${(region.satZ ?? region.z) + resolutionOffset}`)

      setFeatureClickCallback((feature, idx) => {
        if (feature.scenePos && camCtrl_) {
          camCtrl_.focusOn(feature.scenePos)
          setStatus(`TARGETING: ${feature.name.toUpperCase()}`)
          setTimeout(() => setStatus(`${region.label} · ACTIVE`), 3000)
        }
        markers_.forEach((m, i) => { m.active = (i === idx) })
      })
    },

    animate() {
      if (!composer_) return
      const dt = clock_.getDelta()
      if (markers_?.length) updateMarkers(markers_, dt)
      camCtrl_.update(dt)
      composer_.render()
      return { camera: camCtrl_.camera }
    },

    getClickTargets() { return [] },

    resize() {
      if (!camCtrl_ || !composer_) return
      camCtrl_.camera.aspect = window.innerWidth / window.innerHeight
      camCtrl_.camera.updateProjectionMatrix()
      composer_.setSize(window.innerWidth, window.innerHeight)
    },

    dispose() {
      setFeatureClickCallback(null)
      camCtrl_?.dispose()
      composer_?.dispose()
      scene_?.traverse((obj) => {
        obj.geometry?.dispose()
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
        mats?.forEach(m => {
          m?.map?.dispose()
          m?.dispose()
        })
      })
      scene_ = camCtrl_ = composer_ = terrain_ = markers_ = null
    },
  }
}
