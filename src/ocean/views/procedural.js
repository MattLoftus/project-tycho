import * as THREE from 'three'
import { EffectComposer }  from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass }      from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { createNoise2D } from 'simplex-noise'
import { CameraController } from '../camera.js'
import { createSeafloor }  from '../seafloor.js'
import { createContacts, SPAWN_XZ }  from '../features.js'
import { createMarineSnow, createVentSmoke } from '../particles.js'
import { initProceduralHUD, setStatus } from '../hud.js'

// ─── Preset configurations ──────────────────────────────────────────────────

const PRESETS = {
  default: {
    label:         'SONAR SURVEY ACTIVE',
    bgColor:       0x010408,
    fogDensity:    0.010,
    bloomStrength: 1.0,
    bloomRadius:   0.6,
    bloomThreshold:0.75,
    ambientColor:  0x061828,
    ambientIntensity: 1.8,
    sunColor:      0x4080c0,
    sunIntensity:  0.5,
    useDefaultSeafloor: true,
  },
  abyssal: {
    label:         'ABYSSAL PLAIN · SURVEY ACTIVE',
    bgColor:       0x000204,
    fogDensity:    0.007,
    bloomStrength: 1.3,
    bloomRadius:   0.7,
    bloomThreshold:0.65,
    ambientColor:  0x040c18,
    ambientIntensity: 1.2,
    sunColor:      0x203060,
    sunIntensity:  0.15,
    // Custom terrain: very flat, very deep
    terrainAmplitude: -8.0,
    terrainOffset:    -22.0,
    terrainFreq:      0.004,
    terrainOctaves:   5,
    terrainWarp:      2.0,
    snowCount:        4500,
  },
  volcanic: {
    label:         'VOLCANIC RIDGE · SURVEY ACTIVE',
    bgColor:       0x020304,
    fogDensity:    0.009,
    bloomStrength: 1.4,
    bloomRadius:   0.65,
    bloomThreshold:0.60,
    ambientColor:  0x0c1420,
    ambientIntensity: 2.0,
    sunColor:      0x6050a0,
    sunIntensity:  0.35,
    // Custom terrain: sharp, dramatic peaks
    terrainAmplitude: -30.0,
    terrainOffset:    -5.0,
    terrainFreq:      0.009,
    terrainOctaves:   8,
    terrainWarp:      6.0,
    snowCount:        2500,
  },
}

// ─── Custom seafloor generator ──────────────────────────────────────────────

function createCustomSeafloor(scene, cfg) {
  const SIZE = 200
  const SEG  = 320
  const noise2D = createNoise2D()

  const { VERT, FRAG } = _getShaders()

  function fbm(x, z) {
    const warp = cfg.terrainWarp || 4.0
    const baseFreq = cfg.terrainFreq || 0.006
    const wx = x + warp * noise2D(x * 0.004, z * 0.004)
    const wz = z + warp * noise2D(x * 0.004 + 5.2, z * 0.004 + 1.3)

    let v = 0, amp = 1, freq = baseFreq, total = 0
    const octaves = cfg.terrainOctaves || 7
    for (let i = 0; i < octaves; i++) {
      v     += noise2D(wx * freq, wz * freq) * amp
      total += amp
      amp   *= 0.52
      freq  *= 2.1
    }
    return (v / total) * (cfg.terrainAmplitude || -20.0) + (cfg.terrainOffset || -8.0)
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

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uMinH: { value: minH },
      uMaxH: { value: maxH },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
  })

  const mesh = new THREE.Mesh(geo, mat)
  scene.add(mesh)

  return { mesh, material: mat, fbm, minH, maxH }
}

function _getShaders() {
  // Import the shared ocean shaders
  const VERT = /* glsl */`
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
  const FRAG = /* glsl */`
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
      vec3  sunAtten = vec3(exp(-depthFactor * 5.0), exp(-depthFactor * 2.5), exp(-depthFactor * 1.2));
      vec3  sunDir = normalize(vec3(0.3, 1.0, 0.2));
      float diff   = max(dot(normalize(vWorldNormal), sunDir), 0.0);
      color *= (0.06 + diff * 0.94 * sunAtten);
      float bioNoise = fract(sin(dot(floor(vWorldPos.xz * 0.3), vec2(12.9898, 78.233))) * 43758.5453);
      float bioGlow  = smoothstep(0.97, 1.0, bioNoise) * depthFactor * 0.7;
      color += vec3(0.08, 0.45, 0.70) * bioGlow;
      float range = uMaxH - uMinH;
      float cStep = range / 20.0;
      float c     = mod(vHeight - uMinH, cStep) / cStep;
      float line  = 1.0 - smoothstep(0.0, 0.055, min(c, 1.0 - c));
      color = mix(color, vec3(0.0, 0.30, 0.55) * 0.45, line * 0.7);
      float gx   = 1.0 - smoothstep(0.0, 0.045, abs(fract(vWorldPos.x / 8.0) - 0.5) * 2.0);
      float gz   = 1.0 - smoothstep(0.0, 0.045, abs(fract(vWorldPos.z / 8.0) - 0.5) * 2.0);
      color += vec3(0.0, 0.18, 0.32) * max(gx, gz) * 0.14;
      float dist      = length(vWorldPos.xz);
      float pulsePos  = fract(uTime * 0.08) * 130.0;
      float pulseLine = exp(-abs(dist - pulsePos) * 1.0);
      color += vec3(0.0, 0.50, 0.70) * pulseLine * 0.20;
      float causticsPattern = sin(vWorldPos.x * 1.5 + uTime * 0.8) * sin(vWorldPos.z * 1.5 + uTime * 0.6);
      float causticsStrength = sunAtten.b * 0.06 * t;
      color += vec3(0.25, 0.60, 0.80) * max(causticsPattern, 0.0) * causticsStrength;
      float fogDist = length(vWorldPos.xz);
      float fog     = smoothstep(65.0, 115.0, fogDist);
      color = mix(color, vec3(0.01, 0.02, 0.05), fog);
      gl_FragColor = vec4(color, 1.0);
    }
  `
  return { VERT, FRAG }
}

// ─── Factory ────────────────────────────────────────────────────────────────

export function createProceduralView(presetKey) {
  const cfg = PRESETS[presetKey] || PRESETS.default
  let scene_, camCtrl_, composer_, terrain_, contacts_, snow_, smoke_, clock_

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
      sun.position.set(60, 200, 40)
      scene_.add(sun)
      const fill = new THREE.DirectionalLight(0x0a1830, 0.3)
      fill.position.set(-80, 40, -60)
      scene_.add(fill)

      if (cfg.useDefaultSeafloor) {
        terrain_ = createSeafloor(scene_)
      } else {
        terrain_ = createCustomSeafloor(scene_, cfg)
      }

      contacts_ = createContacts(scene_, terrain_)

      snow_ = createMarineSnow(scene_, cfg.snowCount || 3000)

      const ventPositions = []
      contacts_.data.forEach((c, i) => {
        if (c.type === 'vent') {
          const [x, z] = SPAWN_XZ[i]
          const h = terrain_.fbm(x, z)
          ventPositions.push(new THREE.Vector3(x, h + 0.4, z))
        }
      })
      smoke_ = createVentSmoke(scene_, ventPositions)

      initProceduralHUD(contacts_.data)
      setStatus(cfg.label)
    },

    animate() {
      if (!composer_) return
      const dt = clock_.getDelta()
      const t  = clock_.elapsedTime

      terrain_.material.uniforms.uTime.value = t
      contacts_.update(t)
      snow_.update(dt, camCtrl_.camera.position)
      smoke_.update(dt)
      camCtrl_.update(dt)
      composer_.render()
      return { camera: camCtrl_.camera }
    },

    getClickTargets() { return contacts_?.markers ?? [] },

    resize() {
      if (!camCtrl_ || !composer_) return
      camCtrl_.camera.aspect = window.innerWidth / window.innerHeight
      camCtrl_.camera.updateProjectionMatrix()
      composer_.setSize(window.innerWidth, window.innerHeight)
    },

    dispose() {
      snow_?.dispose()
      smoke_?.dispose()
      camCtrl_?.dispose()
      composer_?.dispose()
      scene_?.traverse((obj) => {
        obj.geometry?.dispose()
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
        mats.forEach(m => m?.dispose())
      })
      scene_ = camCtrl_ = composer_ = terrain_ = contacts_ = snow_ = smoke_ = null
    },
  }
}

// ─── Default exports (backwards compat — used as module by ocean-app) ───────

const _default = createProceduralView('default')
export const init = (r) => _default.init(r)
export const animate = () => _default.animate()
export const getClickTargets = () => _default.getClickTargets()
export const resize = () => _default.resize()
export const dispose = () => _default.dispose()
