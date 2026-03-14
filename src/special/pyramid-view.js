import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import { createComposer } from '../post.js'
import { createCameraMovement } from '../camera-movement.js'
import { createPyramidModel } from './pyramid-model.js'

/**
 * Great Pyramid of Giza view.
 * Exterior/interior toggle, CSS2D labels, camera fly-to, click-to-inspect.
 */

export function createPyramidView() {
  let scene_, camera_, controls_, renderer_
  let composer_, bloomPass_, cinematicPass_
  let labelRenderer_
  let camMove_
  let clock_
  let model_ = null
  let labels_ = []

  // Transition state
  let transProgress_ = 0
  let transTarget_ = 0

  // Camera fly-to animation state
  let flyAnim_ = null

  return {
    init(renderer) {
      renderer_ = renderer
      clock_ = new THREE.Clock()

      scene_ = new THREE.Scene()
      scene_.fog = new THREE.FogExp2(0x8a7050, 0.0006)

      // Desert sky dome
      const skyGeo = new THREE.SphereGeometry(900, 32, 16)
      const skyMat = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {},
        vertexShader: `
          varying vec3 vWorldPos;
          void main() {
            vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          precision mediump float;
          varying vec3 vWorldPos;
          void main() {
            float h = normalize(vWorldPos).y;
            vec3 groundCol = vec3(0.55, 0.42, 0.28);
            vec3 hazeCol = vec3(0.78, 0.62, 0.42);
            vec3 midCol = vec3(0.45, 0.52, 0.65);
            vec3 zenithCol = vec3(0.18, 0.25, 0.45);

            vec3 col;
            if (h < 0.0) {
              col = groundCol;
            } else if (h < 0.08) {
              col = mix(hazeCol, midCol, h / 0.08);
            } else if (h < 0.4) {
              col = mix(midCol, zenithCol, (h - 0.08) / 0.32);
            } else {
              col = zenithCol;
            }

            float sunAngle = atan(vWorldPos.z, vWorldPos.x);
            float sunTarget = -0.6;
            float sunDist = abs(sunAngle - sunTarget);
            float sunGlow = exp(-sunDist * 2.0) * smoothstep(-0.02, 0.15, h) * smoothstep(0.5, 0.0, h);
            col += vec3(0.4, 0.25, 0.08) * sunGlow;

            gl_FragColor = vec4(col, 1.0);
          }
        `,
      })
      scene_.add(new THREE.Mesh(skyGeo, skyMat))

      camera_ = new THREE.PerspectiveCamera(
        50, window.innerWidth / window.innerHeight, 0.5, 2000
      )
      camera_.position.set(200, 120, 300)

      controls_ = new OrbitControls(camera_, renderer.domElement)
      controls_.enableDamping = true
      controls_.dampingFactor = 0.05
      controls_.target.set(0, 50, 0)
      controls_.minDistance = 20
      controls_.maxDistance = 800
      controls_.maxPolarAngle = Math.PI / 2.05

      camMove_ = createCameraMovement(camera_, controls_)

      // ── Lighting ──
      scene_.add(new THREE.AmbientLight(0x404038, 1.5))

      const sun = new THREE.DirectionalLight(0xffe8c0, 2.0)
      sun.position.set(150, 200, -100)
      scene_.add(sun)

      const fill = new THREE.DirectionalLight(0x4060a0, 0.4)
      fill.position.set(-100, 50, 100)
      scene_.add(fill)

      const rim = new THREE.DirectionalLight(0x806020, 0.3)
      rim.position.set(-50, 80, -200)
      scene_.add(rim)

      // ── Desert ground ──
      const groundGeo = new THREE.PlaneGeometry(2000, 2000, 256, 256)
      groundGeo.rotateX(-Math.PI / 2)
      const gPos = groundGeo.attributes.position
      for (let i = 0; i < gPos.count; i++) {
        const x = gPos.getX(i), z = gPos.getZ(i)
        const dist = Math.sqrt(x * x + z * z)
        const mask = Math.min(1, Math.max(0, (dist - 200) / 300))
        const h = mask * (
          Math.sin(x * 0.008 + z * 0.005) * 3.0 +
          Math.sin(x * 0.02 - z * 0.015) * 1.2 +
          Math.sin(x * 0.04 + z * 0.03) * 0.5
        )
        gPos.setY(i, h)
      }
      groundGeo.computeVertexNormals()

      const groundMat = new THREE.ShaderMaterial({
        uniforms: {
          uSunDir: { value: new THREE.Vector3(0.5, 0.7, -0.3).normalize() },
        },
        vertexShader: `
          varying vec3 vWorldPos;
          varying vec3 vNormal;
          void main() {
            vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          precision mediump float;
          uniform vec3 uSunDir;
          varying vec3 vWorldPos;
          varying vec3 vNormal;

          float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float noise(vec2 p) {
            vec2 i = floor(p), f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
                       mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
          }
          float fbm(vec2 p) {
            float v = 0.0, a = 0.5;
            for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.1; a *= 0.48; }
            return v;
          }

          void main() {
            vec2 wp = vWorldPos.xz;
            float grain = fbm(wp * 0.8);
            float ripple = fbm(wp * 0.15 + vec2(3.7, 1.2));
            float coarse = fbm(wp * 0.03);

            vec3 sandLight = vec3(0.85, 0.72, 0.50);
            vec3 sandMid   = vec3(0.72, 0.58, 0.38);
            vec3 sandDark  = vec3(0.55, 0.42, 0.28);

            vec3 col = mix(sandMid, sandLight, grain * 0.6);
            col = mix(col, sandDark, ripple * 0.3);
            col = mix(col, sandMid, coarse * 0.15);

            float ndotl = max(dot(vNormal, uSunDir), 0.0);
            col *= 0.35 + ndotl * 0.65;

            float dist = length(vWorldPos.xz);
            float haze = smoothstep(400.0, 1000.0, dist);
            col = mix(col, vec3(0.65, 0.52, 0.38), haze);

            gl_FragColor = vec4(col, 1.0);
          }
        `,
      })
      const ground = new THREE.Mesh(groundGeo, groundMat)
      ground.position.y = -0.05
      scene_.add(ground)

      // ── Pyramid model ──
      model_ = createPyramidModel()
      scene_.add(model_.exterior)
      scene_.add(model_.interior)
      scene_.add(model_.wireframe)

      // ── CSS2D label renderer ──
      labelRenderer_ = new CSS2DRenderer()
      labelRenderer_.setSize(window.innerWidth, window.innerHeight)
      labelRenderer_.domElement.style.position = 'absolute'
      labelRenderer_.domElement.style.top = '0'
      labelRenderer_.domElement.style.left = '0'
      labelRenderer_.domElement.style.pointerEvents = 'none'
      document.getElementById('special-app')?.appendChild(labelRenderer_.domElement)

      // Create labels from model anchor positions
      if (model_.labelAnchors) {
        for (const [key, anchor] of Object.entries(model_.labelAnchors)) {
          const div = document.createElement('div')
          div.className = 'sp2-label'
          div.textContent = anchor.name
          div.dataset.featureKey = key
          const label = new CSS2DObject(div)
          label.position.copy(anchor.pos)
          scene_.add(label)
          labels_.push({ obj: label, div, key })
        }
      }

      // ── Post-processing ──
      const post = createComposer(renderer, scene_, camera_)
      composer_ = post.composer
      bloomPass_ = post.bloomPass
      cinematicPass_ = post.cinematicPass

      bloomPass_.strength = 0.3
      bloomPass_.threshold = 0.85
      bloomPass_.radius = 0.4

      cinematicPass_.uniforms.liftR.value = 1.01
      cinematicPass_.uniforms.liftG.value = 1.0
      cinematicPass_.uniforms.liftB.value = 0.99
      cinematicPass_.uniforms.gainR.value = 1.005
      cinematicPass_.uniforms.gainG.value = 1.0
      cinematicPass_.uniforms.gainB.value = 0.995
      cinematicPass_.uniforms.vignetteIntensity.value = 0.3

      transProgress_ = 0
      transTarget_ = 0
    },

    setMode(mode) {
      transTarget_ = mode === 'interior' ? 1.0 : 0.0
    },

    flyTo(featureKey) {
      if (!model_?.labelAnchors?.[featureKey] || !camera_ || !controls_) return

      // Auto-switch to interior
      transTarget_ = 1.0

      const target = model_.labelAnchors[featureKey].pos.clone()
      // Camera position: offset from target
      const offset = new THREE.Vector3(25, 15, 25)
      const camTarget = target.clone().add(offset)

      // Animate over 1.5 seconds
      const startPos = camera_.position.clone()
      const startTarget = controls_.target.clone()
      const duration = 1.5
      flyAnim_ = { startPos, camTarget, startTarget, lookTarget: target, elapsed: 0, duration }
    },

    animate() {
      if (!composer_) return {}
      const dt = clock_.getDelta()

      // ── Camera fly-to animation ──
      if (flyAnim_) {
        flyAnim_.elapsed += dt
        const t = Math.min(flyAnim_.elapsed / flyAnim_.duration, 1)
        // Smooth ease in-out
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2

        camera_.position.lerpVectors(flyAnim_.startPos, flyAnim_.camTarget, e)
        controls_.target.lerpVectors(flyAnim_.startTarget, flyAnim_.lookTarget, e)

        if (t >= 1) flyAnim_ = null
      }

      // ── Smooth transition ──
      const speed = 2.0
      if (transProgress_ < transTarget_) {
        transProgress_ = Math.min(transProgress_ + dt * speed, transTarget_)
      } else if (transProgress_ > transTarget_) {
        transProgress_ = Math.max(transProgress_ - dt * speed, transTarget_)
      }

      const t = transProgress_

      if (model_) {
        const ext = model_.exterior.userData
        if (ext.faceMaterial) ext.faceMaterial.opacity = 1.0 - t * 0.94
        if (ext.shellMaterial) ext.shellMaterial.opacity = 1.0 - t * 0.94
        if (ext.baseMaterial) ext.baseMaterial.opacity = 1.0 - t * 0.70
        if (ext.capstoneMaterial) ext.capstoneMaterial.opacity = 1.0 - t * 0.94

        model_.wireframe.visible = t > 0.01
        model_.wireframe.material.opacity = t * 0.18

        model_.interior.visible = t > 0.05

        // Smooth camera constraint transition
        const interiorT = Math.max(0, (t - 0.3) / 0.4)
        controls_.minDistance = 20 - interiorT * 15
        controls_.maxPolarAngle = Math.PI / 2.05 + interiorT * (Math.PI * 0.85 - Math.PI / 2.05)
      }

      // ── Label visibility — fade with transition + distance ──
      for (const label of labels_) {
        const dist = camera_.position.distanceTo(label.obj.position)
        const distFade = 1.0 - Math.max(0, Math.min(1, (dist - 30) / 300))
        const opacity = t * distFade
        label.div.style.opacity = opacity.toFixed(2)
        label.div.style.display = opacity < 0.02 ? 'none' : ''
      }

      if (camMove_) camMove_.update(dt)
      cinematicPass_.uniforms.time.value = performance.now() * 0.001
      controls_.update()
      composer_.render()
      if (labelRenderer_) labelRenderer_.render(scene_, camera_)

      updateGauges(camera_, t)

      return { camera: camera_ }
    },

    getClickTargets() {
      return model_?.clickTargets ?? []
    },

    focusFeature(key) {
      if (!model_?.features?.[key]) return
      this.setMode('interior')
      this.flyTo(key)
      this.showFeatureDetailByKey(key)
    },

    showFeatureDetailByKey(key) {
      if (!model_?.features?.[key]) return
      this.showFeatureDetail(model_.features[key])
    },

    showFeatureDetail(feature) {
      if (!feature) return
      const content = document.getElementById('sp2-detail-content')
      if (!content) return

      let rows = ''
      const fields = ['dimensions', 'elevation', 'angle', 'material']
      fields.forEach(f => {
        if (feature[f]) {
          rows += `<div style="display:flex;justify-content:space-between;padding:6px 16px;border-bottom:1px solid rgba(212,160,80,0.08);">
            <span style="color:#6a5030;font-size:9px;letter-spacing:2px;text-transform:uppercase">${f}</span>
            <span style="color:#d4a050;font-size:11px;letter-spacing:0.5px">${feature[f]}</span>
          </div>`
        }
      })
      if (feature.description) {
        rows += `<div style="padding:12px 16px;color:#a08050;font-size:11px;line-height:1.6;letter-spacing:0.3px">${feature.description}</div>`
      }

      content.innerHTML = `
        <div style="padding:14px 16px 12px;border-bottom:1px solid rgba(212,160,80,0.3);margin-bottom:4px">
          <div style="color:#d4a050;font-size:13px;letter-spacing:2px;margin-bottom:5px">${feature.name}</div>
          <div style="color:#6a5030;font-size:9px;letter-spacing:3px">${(feature.type || 'STRUCTURE').toUpperCase()}</div>
        </div>
        ${rows}`

      document.getElementById('sp2-detail')?.classList.remove('hidden')
    },

    resize() {
      if (!camera_ || !composer_) return
      camera_.aspect = window.innerWidth / window.innerHeight
      camera_.updateProjectionMatrix()
      composer_.setSize(window.innerWidth, window.innerHeight)
      if (labelRenderer_) labelRenderer_.setSize(window.innerWidth, window.innerHeight)
    },

    dispose() {
      camMove_?.dispose()
      controls_?.dispose()
      composer_?.dispose()
      // Remove label renderer DOM
      if (labelRenderer_?.domElement?.parentNode) {
        labelRenderer_.domElement.parentNode.removeChild(labelRenderer_.domElement)
      }
      // Remove label CSS2D objects
      for (const label of labels_) {
        label.obj.removeFromParent()
      }
      labels_ = []
      if (scene_) {
        scene_.traverse(obj => {
          if (obj.geometry) obj.geometry.dispose()
          if (obj.material) {
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
            mats.forEach(m => {
              if (m && m.dispose) m.dispose()
            })
          }
        })
        if (scene_.background && scene_.background.dispose) scene_.background.dispose()
      }
      scene_ = camera_ = controls_ = composer_ = model_ = labelRenderer_ = null
      flyAnim_ = null
    },
  }
}

// ─── HUD helpers ─────────────────────────────────────────────────────────────

function updateGauges(camera, t) {
  const el = (id) => document.getElementById(id)
  const p = camera.position

  const elev = el('sp2-gauge-elevation')
  if (elev) elev.textContent = `${Math.round(p.y)} m`

  const dist = el('sp2-gauge-distance')
  if (dist) {
    const d = Math.round(p.distanceTo(new THREE.Vector3(0, 50, 0)))
    dist.textContent = `${d} m`
  }

  const mode = el('sp2-gauge-mode')
  if (mode) mode.textContent = t > 0.5 ? 'INTERIOR' : 'EXTERIOR'
}
