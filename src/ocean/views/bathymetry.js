import * as THREE from 'three'
import { EffectComposer }  from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass }      from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { CameraController } from '../camera.js'
import { VERT } from '../seafloor.js'
import { createMarineSnow, createVentSmoke } from '../particles.js'
import { initGeoHUD, setStatus, setFeatureClickCallback } from '../hud.js'
import { createTitanicModel } from '../titanic-model.js'

// ─── Region definitions ──────────────────────────────────────────────────────

const REGIONS = {
  mariana: {
    label:    'MARIANA TRENCH',
    subtitle: 'CHALLENGER DEEP · WESTERN PACIFIC',
    z: 7, baseX: 112, baseY: 57, grid: 4, sceneH: 50,
    camPos: [0, 60, 180],
    bgColor: 0x010306,
    fogDensity: 0.008,
    features: [
      { name: 'Challenger Deep',      type: 'trench',   lat: 11.34, lon: 142.20, depth: '-10,935 m', width: '1.6 km' },
      { name: 'Sirena Deep',          type: 'trench',   lat: 11.33, lon: 142.42, depth: '-10,714 m', width: '---' },
      { name: 'Mariana Arc Vents',    type: 'vent',     lat: 12.95, lon: 143.60, depth: '-3,600 m',  temp: '300 °C' },
      { name: 'Xenophyophore Colony', type: 'creature',  lat: 11.40, lon: 142.35, depth: '-10,640 m', species: 'Xenophyophorea' },
    ],
  },
  midatlantic: {
    label:    'MID-ATLANTIC RIDGE',
    subtitle: 'DIVERGENT PLATE BOUNDARY · ATLANTIC OCEAN',
    z: 6, baseX: 24, baseY: 23, grid: 4, sceneH: 42,
    camPos: [0, 55, 200],
    bgColor: 0x010508,
    fogDensity: 0.007,
    features: [
      { name: 'Rift Valley',         type: 'trench',   lat: 36.3,  lon: -33.8, depth: '-3,800 m',  width: '30 km' },
      { name: 'TAG Hydrothermal',    type: 'vent',     lat: 30.0,  lon: -42.0, depth: '-3,670 m',  temp: '366 °C' },
      { name: 'Lucky Strike Field',  type: 'vent',     lat: 37.3,  lon: -32.3, depth: '-1,700 m',  temp: '333 °C' },
      { name: 'Azores Plateau',      type: 'seamount', lat: 38.0,  lon: -28.0, depth: '-1,000 m',  width: '---' },
    ],
  },
  hawaiian: {
    label:    'HAWAIIAN SEAMOUNT CHAIN',
    subtitle: 'HOTSPOT VOLCANISM · CENTRAL PACIFIC',
    z: 7, baseX: 6, baseY: 55, grid: 4, sceneH: 48,
    camPos: [0, 70, 190],
    bgColor: 0x010508,
    fogDensity: 0.007,
    features: [
      { name: 'Lōʻihi Seamount',     type: 'seamount', lat: 18.92, lon: -155.27, depth: '-969 m',   width: '---' },
      { name: 'Mauna Kea Base',       type: 'seamount', lat: 19.82, lon: -155.47, depth: '-5,998 m', width: '120 km' },
      { name: 'Hawaiian Trough',      type: 'trench',   lat: 19.00, lon: -156.50, depth: '-5,400 m', width: '120 km' },
      { name: 'Pele\'s Vents',        type: 'vent',     lat: 18.92, lon: -155.25, depth: '-1,200 m', temp: '200 °C' },
    ],
  },
  puertorico: {
    label:    'PUERTO RICO TRENCH',
    subtitle: 'MILWAUKEE DEEP · WESTERN ATLANTIC',
    z: 7, baseX: 40, baseY: 56, grid: 4, sceneH: 50,
    camPos: [0, 65, 185],
    bgColor: 0x010306,
    fogDensity: 0.008,
    features: [
      { name: 'Milwaukee Deep',        type: 'trench',   lat: 19.68, lon: -66.37, depth: '-8,376 m', width: '3.2 km' },
      { name: 'Brownson Deep',         type: 'trench',   lat: 19.72, lon: -67.20, depth: '-8,380 m', width: '---' },
      { name: 'Muertos Trough',        type: 'trench',   lat: 18.00, lon: -68.00, depth: '-5,625 m', width: '50 km' },
      { name: 'Mona Canyon Seep',      type: 'vent',     lat: 18.50, lon: -67.50, depth: '-4,200 m', temp: '85 °C' },
    ],
  },
  philippine: {
    label:    'PHILIPPINE TRENCH',
    subtitle: 'GALATHEA DEEP · WESTERN PACIFIC',
    z: 7, baseX: 109, baseY: 60, grid: 4, sceneH: 50,
    camPos: [0, 60, 180],
    bgColor: 0x010306,
    fogDensity: 0.008,
    features: [
      { name: 'Galathea Deep',         type: 'trench',   lat: 7.83,  lon: 126.67, depth: '-10,540 m', width: '1.4 km' },
      { name: 'Emden Deep',            type: 'trench',   lat: 7.30,  lon: 126.90, depth: '-10,400 m', width: '---' },
      { name: 'Philippine Seamount',   type: 'seamount', lat: 9.00,  lon: 127.50, depth: '-2,800 m',  width: '45 km' },
      { name: 'Benham Rise',           type: 'seamount', lat: 10.50, lon: 128.00, depth: '-1,500 m',  width: '90 km' },
    ],
  },
  java: {
    label:    'JAVA TRENCH',
    subtitle: 'SUNDA ARC · INDIAN OCEAN',
    z: 7, baseX: 103, baseY: 67, grid: 4, sceneH: 46,
    camPos: [0, 65, 190],
    bgColor: 0x010408,
    fogDensity: 0.007,
    features: [
      { name: 'Diamantina Deep',       type: 'trench',   lat: -11.20, lon: 114.90, depth: '-7,290 m', width: '---' },
      { name: 'Sunda Strait Vents',    type: 'vent',     lat: -10.50, lon: 113.00, depth: '-3,400 m', temp: '220 °C' },
      { name: 'Christmas Island Rise', type: 'seamount', lat: -10.48, lon: 115.40, depth: '-2,500 m', width: '35 km' },
      { name: 'Abyssal Tube Worms',    type: 'creature', lat: -10.80, lon: 114.20, depth: '-6,100 m', species: 'Lamellibrachia sp.' },
    ],
  },
  tonga: {
    label:    'TONGA TRENCH',
    subtitle: 'HORIZON DEEP · SOUTH PACIFIC',
    z: 7, baseX: 1, baseY: 71, grid: 4, sceneH: 50,
    camPos: [0, 65, 185],
    bgColor: 0x010306,
    fogDensity: 0.008,
    features: [
      { name: 'Horizon Deep',        type: 'trench',   lat: -23.30, lon: -174.70, depth: '-10,823 m', width: '1.8 km' },
      { name: 'Tonga Ridge',         type: 'seamount', lat: -22.30, lon: -175.80, depth: '-1,200 m',  width: '60 km'  },
      { name: 'Kermadec Trench',     type: 'trench',   lat: -26.00, lon: -175.30, depth: '-10,047 m', width: '---'    },
      { name: 'Tonga Volcanic Arc',  type: 'vent',     lat: -21.15, lon: -175.75, depth: '-2,800 m',  temp: '280 °C'  },
    ],
  },
  cayman: {
    label:    'CAYMAN TROUGH',
    subtitle: 'MID-CAYMAN SPREADING CENTER · CARIBBEAN SEA',
    z: 7, baseX: 34, baseY: 56, grid: 4, sceneH: 45,
    camPos: [0, 60, 180],
    bgColor: 0x010408,
    fogDensity: 0.007,
    features: [
      { name: 'Cayman Trench',        type: 'trench',   lat: 19.20, lon: -80.00, depth: '-7,686 m', width: '---'     },
      { name: 'Beebe Vent Field',     type: 'vent',     lat: 18.55, lon: -81.72, depth: '-4,960 m', temp: '401 °C'   },
      { name: 'Von Damm Vent Field',  type: 'vent',     lat: 18.38, lon: -81.80, depth: '-2,300 m', temp: '226 °C'   },
      { name: 'Cayman Ridge',         type: 'seamount', lat: 19.80, lon: -79.50, depth: '-1,500 m', width: '80 km'   },
    ],
  },
  southsandwich: {
    label:    'SOUTH SANDWICH TRENCH',
    subtitle: 'METEOR DEEP · SOUTHERN ATLANTIC',
    z: 7, baseX: 53, baseY: 86, grid: 4, sceneH: 48,
    camPos: [0, 60, 185],
    bgColor: 0x010306,
    fogDensity: 0.008,
    features: [
      { name: 'Meteor Deep',              type: 'trench',   lat: -55.20, lon: -26.20, depth: '-8,264 m', width: '---'    },
      { name: 'South Sandwich Arc',       type: 'seamount', lat: -56.50, lon: -27.00, depth: '-1,800 m', width: '50 km'  },
      { name: 'East Scotia Ridge Vents',  type: 'vent',     lat: -56.09, lon: -30.32, depth: '-2,600 m', temp: '380 °C'  },
      { name: 'Kemp Seamount',            type: 'seamount', lat: -59.70, lon: -28.35, depth: '-50 m',    width: '---'    },
    ],
  },
  titanic: {
    label:    'TITANIC WRECK SITE',
    subtitle: 'NORTH ATLANTIC ABYSSAL PLAIN · 41°43\u2032N 49°56\u2032W',
    z: 7, baseX: 44, baseY: 46, grid: 4, sceneH: 45,
    camPos: null,
    bgColor: 0x020810,
    fogDensity: 0.003,
    features: [
      { name: 'RMS Titanic Wreck',     type: 'trench',   lat: 41.73, lon: -49.95, depth: '-3,784 m', width: '---' },
      { name: 'Grand Banks Shelf Edge', type: 'seamount', lat: 43.50, lon: -50.00, depth: '-200 m',   width: '350 km' },
      { name: 'Sohm Abyssal Plain',    type: 'trench',   lat: 40.00, lon: -52.00, depth: '-5,100 m', width: '---' },
      { name: 'Titanic Canyon',         type: 'trench',   lat: 41.50, lon: -49.50, depth: '-4,200 m', width: '15 km' },
    ],
  },
}

// ─── Underwater fragment shader (for real bathymetry) ───────────────────────

const FRAG = /* glsl */`
  precision mediump float;
  uniform float uTime;
  uniform float uMinH;
  uniform float uMaxH;

  varying float vHeight;
  varying vec3  vWorldNormal;
  varying vec3  vWorldPos;

  vec3 depthColor(float t) {
    vec3 c0 = vec3(0.01, 0.01, 0.04);
    vec3 c1 = vec3(0.02, 0.04, 0.12);
    vec3 c2 = vec3(0.04, 0.10, 0.25);
    vec3 c3 = vec3(0.08, 0.22, 0.40);
    vec3 c4 = vec3(0.15, 0.40, 0.55);

    if (t < 0.25) return mix(c0, c1, t * 4.0);
    if (t < 0.50) return mix(c1, c2, (t - 0.25) * 4.0);
    if (t < 0.75) return mix(c2, c3, (t - 0.50) * 4.0);
    return            mix(c3, c4, (t - 0.75) * 4.0);
  }

  void main() {
    float t     = clamp((vHeight - uMinH) / (uMaxH - uMinH), 0.0, 1.0);
    vec3  color = depthColor(t);

    float depthFactor = 1.0 - t;
    vec3  sunAtten = vec3(
      exp(-depthFactor * 5.0),
      exp(-depthFactor * 2.5),
      exp(-depthFactor * 1.2)
    );
    vec3  sunDir = normalize(vec3(0.3, 1.0, 0.2));
    float diff   = max(dot(normalize(vWorldNormal), sunDir), 0.0);
    color *= (0.06 + diff * 0.94 * sunAtten);

    float range = uMaxH - uMinH;
    float cStep = range / 20.0;
    float c     = mod(vHeight - uMinH, cStep) / cStep;
    float line  = 1.0 - smoothstep(0.0, 0.055, min(c, 1.0 - c));
    color = mix(color, vec3(0.0, 0.30, 0.55) * 0.45, line * 0.7);

    float gx   = 1.0 - smoothstep(0.0, 0.045, abs(fract(vWorldPos.x / 8.0) - 0.5) * 2.0);
    float gz   = 1.0 - smoothstep(0.0, 0.045, abs(fract(vWorldPos.z / 8.0) - 0.5) * 2.0);
    color += vec3(0.0, 0.18, 0.32) * max(gx, gz) * 0.14;

    float dist      = length(vWorldPos.xz);
    float pulsePos  = fract(uTime * 0.08) * 160.0;
    float pulseLine = exp(-abs(dist - pulsePos) * 0.8);
    color += vec3(0.0, 0.50, 0.70) * pulseLine * 0.18;

    float fog = smoothstep(150.0, 220.0, length(vWorldPos.xz));
    color = mix(color, vec3(0.01, 0.02, 0.05), fog);

    gl_FragColor = vec4(color, 1.0);
  }
`

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

// ─── Tile loading ───────────────────────────────────────────────────────────

function fetchTile(z, x, y, retries = 2) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload  = () => resolve(img)
    img.onerror = () => {
      if (retries > 0) {
        setTimeout(() => fetchTile(z, x, y, retries - 1).then(resolve, reject), 500)
      } else {
        reject(new Error(`Tile ${z}/${x}/${y} failed`))
      }
    }
    img.src = `/terrarium/terrarium/${z}/${x}/${y}.png`
  })
}

async function loadHeightmap(region, onStatus) {
  const { z, baseX, baseY, grid } = region
  const TILE  = 256
  const total = TILE * grid

  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = total
  const ctx = canvas.getContext('2d')

  onStatus('FETCHING BATHYMETRY TILES...')

  await Promise.all(
    Array.from({ length: grid * grid }, (_, i) => {
      const col = i % grid
      const row = Math.floor(i / grid)
      return fetchTile(z, baseX + col, baseY + row)
        .then(img => ctx.drawImage(img, col * TILE, row * TILE))
    }),
  )

  onStatus('PROCESSING DEPTH DATA...')

  const { data } = ctx.getImageData(0, 0, total, total)
  const raw = new Float32Array(total * total)
  // Terrarium RGB encoding: elevation (m) = R*256 + G + B/256 - 32768
  for (let i = 0; i < raw.length; i++) {
    raw[i] = data[i * 4] * 256 + data[i * 4 + 1] + data[i * 4 + 2] / 256 - 32768
  }

  return { raw, size: total }
}

// ─── Terrain mesh ───────────────────────────────────────────────────────────

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

function buildTerrain(scene, raw, size, sceneH = 40) {
  const smooth = blurHeightmap(raw, size, 2)

  let minR = Infinity, maxR = -Infinity
  for (const v of smooth) { if (v < minR) minR = v; if (v > maxR) maxR = v }

  const scale = sceneH / Math.max(maxR - minR, 1)

  const geo = new THREE.PlaneGeometry(300, 300, size - 1, size - 1)
  geo.rotateX(-Math.PI / 2)

  const pos = geo.attributes.position
  let minH = Infinity, maxH = -Infinity
  for (let i = 0; i < smooth.length; i++) {
    const h = (smooth[i] - minR) * scale - sceneH / 2
    pos.setY(i, h)
    if (h < minH) minH = h
    if (h > maxH) maxH = h
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uMinH: { value: minH },
      uMaxH: { value: maxH },
    },
    vertexShader: VERT, fragmentShader: FRAG,
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

// ─── Feature markers ────────────────────────────────────────────────────────

function buildFeatureMarkers(scene, features) {
  return features.map(f => {
    const pos = f.scenePos
    const TYPE_COLORS = { vent: 0xff6030, creature: 0x40ff80, nodule: 0xe0a040, trench: 0x2080ff, seamount: 0xc060ff }
    const col = TYPE_COLORS[f.type] || 0x2080ff

    const ringGeo = new THREE.RingGeometry(3.5, 5.5, 48)
    ringGeo.rotateX(-Math.PI / 2)
    const ringMat = new THREE.MeshBasicMaterial({
      color: col, transparent: true, opacity: 0.22,
      side: THREE.DoubleSide, depthWrite: false,
    })
    const ring = new THREE.Mesh(ringGeo, ringMat)
    ring.position.copy(pos)
    scene.add(ring)

    const dotGeo = new THREE.CircleGeometry(1.2, 24)
    dotGeo.rotateX(-Math.PI / 2)
    const dotMat = new THREE.MeshBasicMaterial({
      color: col, transparent: true, opacity: 0.35,
      side: THREE.DoubleSide, depthWrite: false,
    })
    const dot = new THREE.Mesh(dotGeo, dotMat)
    dot.position.copy(pos)
    scene.add(dot)

    const pulseGeo = new THREE.RingGeometry(3.5, 5.5, 48)
    pulseGeo.rotateX(-Math.PI / 2)
    const pulseMat = new THREE.MeshBasicMaterial({
      color: col, transparent: true, opacity: 0,
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

// ─── View factory ───────────────────────────────────────────────────────────

export function createBathymetryView(regionKey) {
  let scene_, camCtrl_, composer_, terrain_, markers_, snow_, clock_

  return {
    async init(renderer) {
      clock_ = new THREE.Clock()

      const region = REGIONS[regionKey]
      scene_ = new THREE.Scene()
      scene_.background = new THREE.Color(region.bgColor)
      scene_.fog = new THREE.FogExp2(region.bgColor, region.fogDensity)

      const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.5, 2000)
      camCtrl_ = new CameraController(camera, renderer.domElement)
      if (region.camPos) {
        const [cx, cy, cz] = region.camPos
        camCtrl_.camera.position.set(cx, cy, cz)
      }

      composer_ = new EffectComposer(renderer)
      composer_.addPass(new RenderPass(scene_, camera))
      composer_.addPass(new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.9, 0.5, 0.78
      ))

      // Lighting
      if (regionKey === 'titanic') {
        // Bright ROV-style lighting for wreck exploration
        scene_.add(new THREE.AmbientLight(0x6699cc, 3.5))
        const sun = new THREE.DirectionalLight(0xaaddff, 2.5)
        sun.position.set(40, 100, 30)
        scene_.add(sun)
        const fill = new THREE.DirectionalLight(0x7799bb, 1.5)
        fill.position.set(-60, 60, -40)
        scene_.add(fill)
        const back = new THREE.DirectionalLight(0x6688aa, 1.0)
        back.position.set(0, 50, -80)
        scene_.add(back)
      } else {
        // Dim deep-sea lighting
        scene_.add(new THREE.AmbientLight(0x061828, 1.5))
        const sun = new THREE.DirectionalLight(0x4080c0, 0.4)
        sun.position.set(80, 200, 50)
        scene_.add(sun)
        const fill = new THREE.DirectionalLight(0x0a1830, 0.25)
        fill.position.set(-80, 40, -60)
        scene_.add(fill)
      }

      const { raw, size } = await loadHeightmap(region, setStatus)
      terrain_ = buildTerrain(scene_, raw, size, region.sceneH)

      const bounds = gridBounds(region.z, region.baseX, region.baseY, region.grid)
      const featuresWithPos = region.features.map(f => {
        const pos = latlonToScene(f.lat, f.lon, bounds)
        pos.y = terrain_.sampleHeight(pos.x, pos.z) + 0.3
        return { ...f, scenePos: pos }
      })

      markers_ = buildFeatureMarkers(scene_, featuresWithPos)

      // Place Titanic wreck — bow and stern sections
      if (regionKey === 'titanic') {
        const { bow, stern } = createTitanicModel()

        // Bow section — relatively intact, slight list to port
        const bowPos = latlonToScene(41.73, -49.95, bounds)
        bowPos.y = terrain_.sampleHeight(bowPos.x, bowPos.z) + 1.8
        bow.position.copy(bowPos)
        bow.rotation.y = 0.4
        bow.rotation.z = 0.05  // slight list
        bow.rotation.x = 0.03  // bow-down trim (buried in mud)
        bow.scale.setScalar(1.0)
        scene_.add(bow)

        // Stern section — ~600m south, more damaged, different heading
        // At model scale, 600m ≈ 27 units, but we use ~12 for visibility
        const sternPos = bowPos.clone().add(new THREE.Vector3(-4, 0, -12))
        sternPos.y = terrain_.sampleHeight(sternPos.x, sternPos.z) + 1.8
        stern.position.copy(sternPos)
        stern.rotation.y = 0.8  // different heading from bow
        stern.rotation.z = -0.08 // list to starboard
        stern.rotation.x = -0.04 // stern-down
        stern.scale.setScalar(1.0)
        scene_.add(stern)

        // Wreck-site lighting
        const wreckKey = new THREE.PointLight(0xaaccee, 12, 50, 1.0)
        wreckKey.position.copy(bowPos).add(new THREE.Vector3(5, 12, 8))
        scene_.add(wreckKey)
        const wreckFill = new THREE.PointLight(0x88aacc, 8, 45, 1.2)
        wreckFill.position.copy(bowPos).add(new THREE.Vector3(-6, 8, -5))
        scene_.add(wreckFill)
        // Light on stern section too
        const sternLight = new THREE.PointLight(0xaaccee, 10, 40, 1.0)
        sternLight.position.copy(sternPos).add(new THREE.Vector3(3, 10, 5))
        scene_.add(sternLight)

        // Camera starts with overview of bow section
        camCtrl_.camera.position.set(bowPos.x + 12, bowPos.y + 10, bowPos.z + 22)
        camCtrl_.controls.target.copy(bowPos)
        camCtrl_.controls.minDistance = 4
        camCtrl_.camera.near = 0.1
        camCtrl_.camera.updateProjectionMatrix()
      }

      // Marine snow
      snow_ = createMarineSnow(scene_, 2500)

      initGeoHUD(region, featuresWithPos, 'DEEP OCEAN SURVEY SYSTEM')
      setStatus(`${region.label} · ACTIVE`)

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
      if (!composer_ || !terrain_) return
      const dt = clock_.getDelta()
      terrain_.material.uniforms.uTime.value = clock_.elapsedTime
      if (markers_?.length) updateMarkers(markers_, dt)
      snow_?.update(dt, camCtrl_.camera.position)
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
      snow_?.dispose()
      camCtrl_?.dispose()
      composer_?.dispose()
      scene_?.traverse((obj) => {
        obj.geometry?.dispose()
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
        mats?.forEach(m => m?.dispose())
      })
      scene_ = camCtrl_ = composer_ = terrain_ = markers_ = snow_ = null
    },
  }
}
