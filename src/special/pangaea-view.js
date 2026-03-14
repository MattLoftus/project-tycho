import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import { createComposer } from '../post.js'
import { createCameraMovement } from '../camera-movement.js'
import { createPangaeaModel } from './pangaea-model.js'

/**
 * Pangaea-to-Present continental drift view.
 * Continuous time slider (250 Mya → 0 Mya) with three preset modes:
 *   "pangaea" (250 Mya), "drift" (150 Mya), "present" (0 Mya)
 * Slow auto-rotation, atmosphere glow, CSS2D continent labels.
 */

export function createPangaeaView() {
  let scene_, camera_, controls_, renderer_
  let composer_, bloomPass_, cinematicPass_
  let labelRenderer_
  let camMove_
  let clock_
  let model_ = null
  let labels_ = []

  // Time state: millions of years ago (250 = Pangaea, 0 = present)
  let currentMya_ = 250
  let targetMya_ = 250
  let autoRotate_ = true

  // Camera fly-to animation state
  let flyAnim_ = null

  return {
    init(renderer) {
      renderer_ = renderer
      clock_ = new THREE.Clock()

      scene_ = new THREE.Scene()
      scene_.background = new THREE.Color(0x020a14)
      scene_.fog = new THREE.FogExp2(0x020a14, 0.003)

      camera_ = new THREE.PerspectiveCamera(
        50, window.innerWidth / window.innerHeight, 0.5, 500
      )
      camera_.position.set(45, 20, 35)

      controls_ = new OrbitControls(camera_, renderer.domElement)
      controls_.enableDamping = true
      controls_.dampingFactor = 0.05
      controls_.target.set(0, 0, 0)
      controls_.minDistance = 25
      controls_.maxDistance = 150

      camMove_ = createCameraMovement(camera_, controls_)

      // ── Lighting — space environment ──
      scene_.add(new THREE.AmbientLight(0x406080, 3.0))

      // Sun-like directional light
      const sun = new THREE.DirectionalLight(0xfff8e0, 4.0)
      sun.position.set(80, 40, 60)
      scene_.add(sun)

      // Cool fill from opposite side
      const fill = new THREE.DirectionalLight(0x5080c0, 1.5)
      fill.position.set(-60, -20, -40)
      scene_.add(fill)

      // Rim light for atmosphere edge
      const rim = new THREE.DirectionalLight(0x4090c0, 1.0)
      rim.position.set(0, 60, -60)
      scene_.add(rim)

      // ── Starfield background ──
      const starCount = 2000
      const starVerts = new Float32Array(starCount * 3)
      const starSizes = new Float32Array(starCount)
      for (let i = 0; i < starCount; i++) {
        const theta = Math.random() * Math.PI * 2
        const phi = Math.acos(2 * Math.random() - 1)
        const r = 150 + Math.random() * 100
        starVerts[i * 3] = r * Math.sin(phi) * Math.cos(theta)
        starVerts[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
        starVerts[i * 3 + 2] = r * Math.cos(phi)
        starSizes[i] = 0.3 + Math.random() * 1.2
      }
      const starGeo = new THREE.BufferGeometry()
      starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starVerts, 3))
      starGeo.setAttribute('size', new THREE.Float32BufferAttribute(starSizes, 1))
      const starMat = new THREE.PointsMaterial({
        color: 0xc0d0f0,
        size: 0.4,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.6,
      })
      scene_.add(new THREE.Points(starGeo, starMat))

      // ── Pangaea model ──
      model_ = createPangaeaModel()
      scene_.add(model_.group)

      // Set initial time
      model_.setTime(currentMya_)

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

      bloomPass_.strength = 0.5
      bloomPass_.threshold = 0.5
      bloomPass_.radius = 0.6

      // Cool blue space color grading
      cinematicPass_.uniforms.liftR.value = 0.94
      cinematicPass_.uniforms.liftG.value = 0.98
      cinematicPass_.uniforms.liftB.value = 1.06
      cinematicPass_.uniforms.gainR.value = 0.97
      cinematicPass_.uniforms.gainG.value = 1.0
      cinematicPass_.uniforms.gainB.value = 1.04
      cinematicPass_.uniforms.vignetteIntensity.value = 0.4
    },

    setMode(mode) {
      switch (mode) {
        case 'pangaea':
          targetMya_ = 250
          break
        case 'drift':
          targetMya_ = 150
          break
        case 'present':
          targetMya_ = 0
          break
        default:
          // Accept numeric Mya values directly
          if (typeof mode === 'number') {
            targetMya_ = Math.max(0, Math.min(250, mode))
          }
      }
    },

    /** Set time directly (for external slider control) */
    setTime(mya) {
      targetMya_ = Math.max(0, Math.min(250, mya))
    },

    flyTo(featureKey) {
      if (!model_?.labelAnchors?.[featureKey] || !camera_ || !controls_) return

      const target = model_.labelAnchors[featureKey].pos.clone()
      const offset = target.clone().normalize().multiplyScalar(15)
      offset.y += 5
      const camTarget = target.clone().add(offset)

      const startPos = camera_.position.clone()
      const startTarget = controls_.target.clone()
      const duration = 1.5
      flyAnim_ = { startPos, camTarget, startTarget, lookTarget: target, elapsed: 0, duration }
    },

    animate() {
      if (!composer_) return {}
      const dt = clock_.getDelta()
      const elapsed = clock_.elapsedTime

      // ── Camera fly-to animation ──
      if (flyAnim_) {
        flyAnim_.elapsed += dt
        const t = Math.min(flyAnim_.elapsed / flyAnim_.duration, 1)
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2

        camera_.position.lerpVectors(flyAnim_.startPos, flyAnim_.camTarget, e)
        controls_.target.lerpVectors(flyAnim_.startTarget, flyAnim_.lookTarget, e)

        if (t >= 1) flyAnim_ = null
      }

      // ── Smooth time interpolation ──
      const timeSpeed = 40 // Mya per second of transition
      if (Math.abs(currentMya_ - targetMya_) > 0.1) {
        const dir = targetMya_ > currentMya_ ? 1 : -1
        currentMya_ += dir * timeSpeed * dt
        // Clamp to target
        if (dir > 0 && currentMya_ > targetMya_) currentMya_ = targetMya_
        if (dir < 0 && currentMya_ < targetMya_) currentMya_ = targetMya_

        // Update continent positions
        if (model_) {
          model_.setTime(currentMya_)
        }
      }

      if (model_) {
        // Slow auto-rotation of the globe
        if (autoRotate_) {
          model_.group.rotation.y += 0.0002
        }

        // Update atmosphere glow view vector
        if (model_.atmosphere?.material?.uniforms?.viewVector) {
          model_.atmosphere.material.uniforms.viewVector.value.copy(camera_.position)
        }

        // Update ocean shader time
        if (model_.ocean?.material?.uniforms?.uTime) {
          model_.ocean.material.uniforms.uTime.value = elapsed
        }

        // Update cloud layer time (rotate independently)
        if (model_.clouds?.material?.uniforms?.uTime) {
          model_.clouds.material.uniforms.uTime.value = elapsed
        }

        // Update label positions to match drifted continents
        for (const label of labels_) {
          const anchor = model_.labelAnchors[label.key]
          if (anchor) {
            label.obj.position.copy(anchor.pos)
          }
        }
      }

      // ── Label visibility — fade with distance and facing ──
      for (const label of labels_) {
        const worldPos = new THREE.Vector3()
        label.obj.getWorldPosition(worldPos)

        // Fade based on whether the label faces the camera
        const toCamera = camera_.position.clone().sub(worldPos).normalize()
        const surfaceNormal = worldPos.clone().normalize()
        const facing = surfaceNormal.dot(toCamera)

        // Hide labels on the far side of the globe
        const opacity = facing > 0.1 ? Math.min(1, (facing - 0.1) * 3) : 0
        label.div.style.opacity = opacity.toFixed(2)
        label.div.style.display = opacity < 0.02 ? 'none' : ''
      }

      if (camMove_) camMove_.update(dt)
      cinematicPass_.uniforms.time.value = performance.now() * 0.001
      controls_.update()
      composer_.render()
      if (labelRenderer_) labelRenderer_.render(scene_, camera_)

      updateGauges(camera_, currentMya_)

      return { camera: camera_ }
    },

    getClickTargets() {
      return model_?.clickTargets ?? []
    },

    focusFeature(key) {
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
      const fields = ['dimensions']
      fields.forEach(f => {
        if (feature[f]) {
          rows += `<div style="display:flex;justify-content:space-between;padding:6px 16px;border-bottom:1px solid rgba(64,144,192,0.08);">
            <span style="color:#204060;font-size:9px;letter-spacing:2px;text-transform:uppercase">${f}</span>
            <span style="color:#4090c0;font-size:11px;letter-spacing:0.5px">${feature[f]}</span>
          </div>`
        }
      })
      if (feature.description) {
        rows += `<div style="padding:12px 16px;color:#6090b0;font-size:11px;line-height:1.6;letter-spacing:0.3px">${feature.description}</div>`
      }

      content.innerHTML = `
        <div style="padding:14px 16px 12px;border-bottom:1px solid rgba(64,144,192,0.3);margin-bottom:4px">
          <div style="color:#4090c0;font-size:13px;letter-spacing:2px;margin-bottom:5px">${feature.name}</div>
          <div style="color:#204060;font-size:9px;letter-spacing:3px">${(feature.type || 'CONTINENT').toUpperCase()}</div>
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

// ─── HUD helpers ────────────────────────────────────────────────────────────

function updateGauges(camera, mya) {
  const el = (id) => document.getElementById(id)

  const elev = el('sp2-gauge-elevation')
  if (elev) elev.textContent = `${Math.round(mya)} Mya`

  const dist = el('sp2-gauge-distance')
  if (dist) {
    const d = Math.round(camera.position.distanceTo(new THREE.Vector3(0, 0, 0)))
    dist.textContent = `${d} km`
  }

  const mode = el('sp2-gauge-mode')
  if (mode) {
    if (mya > 220) mode.textContent = 'PANGAEA'
    else if (mya > 120) mode.textContent = 'DRIFT'
    else mode.textContent = 'PRESENT'
  }
}
