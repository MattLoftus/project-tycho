import * as THREE from 'three'
import { EffectComposer }  from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass }      from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { createNoise2D } from 'simplex-noise'
import { CameraController } from '../camera.js'
import { createTerrain }   from '../terrain.js'
import { createDeposits }  from '../deposits.js'
import { initProceduralHUD, setStatus, setTerrainLabel } from '../hud.js'

// ─── Preset configurations ──────────────────────────────────────────────────

const PRESETS = {
  default: {
    label:         'ORBITAL SURVEY ACTIVE',
    terrainLabel:  'PROCEDURAL · SIM',
    bgColor:       0x020810,
    fogDensity:    0.009,
    bloomStrength: 0.7,
    bloomRadius:   0.55,
    bloomThreshold:0.80,
    ambientColor:  0x0a1830,
    ambientIntensity: 1.6,
    sunColor:      0xffe8c0,
    sunIntensity:  1.8,
    fillColor:     0x1a3860,
    fillIntensity: 0.4,
    useDefaultTerrain: true,
  },
  glacial: {
    label:         'GLACIAL TERRAIN · SURVEY ACTIVE',
    terrainLabel:  'GLACIAL · SIM',
    bgColor:       0x040810,
    fogDensity:    0.008,
    bloomStrength: 0.8,
    bloomRadius:   0.5,
    bloomThreshold:0.78,
    ambientColor:  0x101828,
    ambientIntensity: 1.8,
    sunColor:      0xc0d0e8,
    sunIntensity:  1.4,
    fillColor:     0x1a2840,
    fillIntensity: 0.35,
    // Terrain: broad, U-shaped valleys with sharp ridges
    terrainAmplitude: 22.0,
    terrainOffset:    0.0,
    terrainFreq:      0.005,
    terrainOctaves:   6,
    terrainWarp:      6.0,
    // Icy palette: deep crevasse → exposed rock → slate → ice fields → snow
    palette: [
      [0.04, 0.06, 0.12],
      [0.18, 0.22, 0.28],
      [0.45, 0.52, 0.58],
      [0.72, 0.80, 0.88],
      [0.92, 0.95, 1.00],
    ],
  },
  volcanicSurface: {
    label:         'VOLCANIC TERRAIN · SURVEY ACTIVE',
    terrainLabel:  'VOLCANIC · SIM',
    bgColor:       0x0a0404,
    fogDensity:    0.009,
    bloomStrength: 0.9,
    bloomRadius:   0.55,
    bloomThreshold:0.72,
    ambientColor:  0x1a0c08,
    ambientIntensity: 1.6,
    sunColor:      0xffa040,
    sunIntensity:  1.2,
    fillColor:     0x201008,
    fillIntensity: 0.3,
    // Terrain: sharp, jagged peaks with deep calderas
    terrainAmplitude: 26.0,
    terrainOffset:    -2.0,
    terrainFreq:      0.008,
    terrainOctaves:   8,
    terrainWarp:      5.0,
    // Volcanic palette: dark basalt → warm rock → red-orange → bright amber
    palette: [
      [0.04, 0.02, 0.02],
      [0.18, 0.08, 0.04],
      [0.42, 0.16, 0.06],
      [0.72, 0.28, 0.06],
      [0.95, 0.55, 0.12],
    ],
  },
}

// ─── Custom terrain generator (for non-default presets) ─────────────────────

function createCustomTerrain(scene, cfg) {
  const SIZE = 200
  const SEG  = 320
  const noise2D = createNoise2D()

  const amplitude = cfg.terrainAmplitude || 20.0
  const offset    = cfg.terrainOffset    || 0.0
  const baseFreq  = cfg.terrainFreq      || 0.006
  const octaves   = cfg.terrainOctaves   || 7
  const warp      = cfg.terrainWarp      || 4.0

  function fbm(x, z) {
    const wx = x + warp * noise2D(x * 0.004, z * 0.004)
    const wz = z + warp * noise2D(x * 0.004 + 5.2, z * 0.004 + 1.3)

    let v = 0, amp = 1, freq = baseFreq, total = 0
    for (let i = 0; i < octaves; i++) {
      v     += noise2D(wx * freq, wz * freq) * amp
      total += amp
      amp   *= 0.52
      freq  *= 2.1
    }
    return (v / total) * amplitude + offset
  }

  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG)
  geo.rotateX(-Math.PI / 2)

  const pos = geo.attributes.position
  let minH = Infinity, maxH = -Infinity
  for (let i = 0; i < pos.count; i++) {
    const h = fbm(pos.getX(i), pos.getZ(i))
    pos.setY(i, h)
    if (h < minH) minH = h
    if (h > maxH) maxH = h
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()

  const p = cfg.palette
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uMinH: { value: minH },
      uMaxH: { value: maxH },
      uC0: { value: new THREE.Color(...p[0]) },
      uC1: { value: new THREE.Color(...p[1]) },
      uC2: { value: new THREE.Color(...p[2]) },
      uC3: { value: new THREE.Color(...p[3]) },
      uC4: { value: new THREE.Color(...p[4]) },
    },
    vertexShader: CUSTOM_VERT,
    fragmentShader: CUSTOM_FRAG,
  })

  const mesh = new THREE.Mesh(geo, mat)
  scene.add(mesh)

  return { mesh, material: mat, fbm, minH, maxH }
}

// ─── Shaders for custom terrain (palette via uniforms) ──────────────────────

const CUSTOM_VERT = /* glsl */`
  varying float vHeight;
  varying vec3  vWorldNormal;
  varying vec3  vWorldPos;
  void main() {
    vHeight      = position.y;
    vWorldPos    = (modelMatrix * vec4(position, 1.0)).xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position  = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const CUSTOM_FRAG = /* glsl */`
  precision mediump float;
  uniform float uTime;
  uniform float uMinH;
  uniform float uMaxH;
  uniform vec3  uC0;
  uniform vec3  uC1;
  uniform vec3  uC2;
  uniform vec3  uC3;
  uniform vec3  uC4;
  varying float vHeight;
  varying vec3  vWorldNormal;
  varying vec3  vWorldPos;

  vec3 terrainColor(float t) {
    if (t < 0.25) return mix(uC0, uC1, t * 4.0);
    if (t < 0.50) return mix(uC1, uC2, (t - 0.25) * 4.0);
    if (t < 0.75) return mix(uC2, uC3, (t - 0.50) * 4.0);
    return            mix(uC3, uC4, (t - 0.75) * 4.0);
  }

  void main() {
    float t     = clamp((vHeight - uMinH) / (uMaxH - uMinH), 0.0, 1.0);
    vec3  color = terrainColor(t);

    vec3  sunDir = normalize(vec3(1.2, 2.5, 0.8));
    float diff   = max(dot(normalize(vWorldNormal), sunDir), 0.0);
    color *= (0.14 + diff * 0.86);

    float range  = uMaxH - uMinH;
    float cStep  = range / 24.0;
    float c      = mod(vHeight - uMinH, cStep) / cStep;
    float line   = 1.0 - smoothstep(0.0, 0.055, min(c, 1.0 - c));
    color = mix(color, vec3(0.0, 0.62, 0.82) * 0.48, line * 0.85);

    float gx   = 1.0 - smoothstep(0.0, 0.045, abs(fract(vWorldPos.x / 8.0) - 0.5) * 2.0);
    float gz   = 1.0 - smoothstep(0.0, 0.045, abs(fract(vWorldPos.z / 8.0) - 0.5) * 2.0);
    color += vec3(0.0, 0.28, 0.44) * max(gx, gz) * 0.16;

    float scanPos   = vWorldPos.x / 100.0;
    float scanPhase = fract(uTime * 0.12) * 2.0 - 1.0;
    color += vec3(0.0, 0.55, 0.75) * exp(-abs(scanPos - scanPhase) * 18.0) * 0.12;

    float fog = smoothstep(75.0, 115.0, length(vWorldPos.xz));
    color = mix(color, vec3(0.02, 0.04, 0.08), fog);

    gl_FragColor = vec4(color, 1.0);
  }
`

// ─── Factory ────────────────────────────────────────────────────────────────

export function createSurfaceProceduralView(presetKey) {
  const cfg = PRESETS[presetKey] || PRESETS.default
  let scene_, camCtrl_, composer_, terrain_, deposits_, clock_

  return {
    async init(renderer) {
      clock_ = new THREE.Clock()

      scene_ = new THREE.Scene()
      scene_.background = new THREE.Color(cfg.bgColor)
      scene_.fog = new THREE.FogExp2(cfg.bgColor, cfg.fogDensity)

      const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.5, 2000)
      camCtrl_ = new CameraController(camera, renderer.domElement)

      composer_ = new EffectComposer(renderer)
      composer_.addPass(new RenderPass(scene_, camera))
      composer_.addPass(new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        cfg.bloomStrength, cfg.bloomRadius, cfg.bloomThreshold
      ))

      scene_.add(new THREE.AmbientLight(cfg.ambientColor, cfg.ambientIntensity))
      const sun = new THREE.DirectionalLight(cfg.sunColor, cfg.sunIntensity)
      sun.position.set(120, 180, 80)
      scene_.add(sun)
      const fill = new THREE.DirectionalLight(cfg.fillColor, cfg.fillIntensity)
      fill.position.set(-100, 60, -80)
      scene_.add(fill)

      const starPos = new Float32Array(2200 * 3)
      for (let i = 0; i < 2200; i++) {
        const theta = Math.random() * Math.PI * 0.5
        const phi   = Math.random() * Math.PI * 2
        const r     = 460 + Math.random() * 40
        starPos[i * 3]     = r * Math.sin(theta) * Math.cos(phi)
        starPos[i * 3 + 1] = r * Math.cos(theta)
        starPos[i * 3 + 2] = r * Math.sin(theta) * Math.sin(phi)
      }
      const starGeo = new THREE.BufferGeometry()
      starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
      scene_.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0x9aadbe, size: 0.55, sizeAttenuation: true })))

      if (cfg.useDefaultTerrain) {
        terrain_ = createTerrain(scene_)
      } else {
        terrain_ = createCustomTerrain(scene_, cfg)
      }

      deposits_ = createDeposits(scene_, terrain_)

      initProceduralHUD(deposits_.data)
      setStatus(cfg.label)
      setTerrainLabel(cfg.terrainLabel)
    },

    animate() {
      if (!composer_) return
      const dt = clock_.getDelta()
      const t  = clock_.elapsedTime

      terrain_.material.uniforms.uTime.value = t
      deposits_.update(t)
      camCtrl_.update(dt)
      composer_.render()
      return { camera: camCtrl_.camera }
    },

    getClickTargets() { return deposits_?.markers ?? [] },

    resize() {
      if (!camCtrl_ || !composer_) return
      camCtrl_.camera.aspect = window.innerWidth / window.innerHeight
      camCtrl_.camera.updateProjectionMatrix()
      composer_.setSize(window.innerWidth, window.innerHeight)
    },

    dispose() {
      camCtrl_?.dispose()
      composer_?.dispose()
      scene_?.traverse((obj) => {
        obj.geometry?.dispose()
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
        mats.forEach(m => m?.dispose())
      })
      scene_ = camCtrl_ = composer_ = terrain_ = deposits_ = null
    },
  }
}

// ─── Default exports (backwards compat) ─────────────────────────────────────

const _default = createSurfaceProceduralView('default')
export const init = (r) => _default.init(r)
export const animate = () => _default.animate()
export const getClickTargets = () => _default.getClickTargets()
export const resize = () => _default.resize()
export const dispose = () => _default.dispose()
