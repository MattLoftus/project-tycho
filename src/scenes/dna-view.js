import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import { createComposer } from '../post.js'
import { createCameraMovement } from '../camera-movement.js'
import { createDNAModel } from './dna-model.js'

/**
 * DNA Double Helix / Chromosome view.
 * Helix/chromosome toggle, CSS2D labels, camera fly-to, click-to-inspect.
 */

export function createDNAView() {
  let scene_, camera_, controls_, renderer_
  let composer_, bloomPass_, cinematicPass_
  let labelRenderer_
  let camMove_
  let clock_
  let model_ = null
  let labels_ = []

  // Transition state: 0 = HELIX, 1 = CHROMOSOME
  let transProgress_ = 0
  let transTarget_ = 0

  // Camera fly-to animation state
  let flyAnim_ = null

  // Track which labels belong to which group
  let helixLabels_ = []
  let chromosomeLabels_ = []

  const HELIX_KEYS = ['backbone', 'basePairs', 'majorGroove', 'minorGroove', 'nucleotides']
  const CHROMO_KEYS = ['nucleosome', 'chromatin', 'centromere', 'telomere']

  return {
    init(renderer) {
      renderer_ = renderer
      clock_ = new THREE.Clock()

      scene_ = new THREE.Scene()
      scene_.background = new THREE.Color(0x020010)
      scene_.fog = new THREE.FogExp2(0x020010, 0.004)

      camera_ = new THREE.PerspectiveCamera(
        50, window.innerWidth / window.innerHeight, 0.5, 500
      )
      camera_.position.set(20, 10, 20)

      controls_ = new OrbitControls(camera_, renderer.domElement)
      controls_.enableDamping = true
      controls_.dampingFactor = 0.05
      controls_.target.set(0, 0, 0)
      controls_.minDistance = 5
      controls_.maxDistance = 150

      camMove_ = createCameraMovement(camera_, controls_)

      // ── Lighting — cinematic sci-fi ──
      scene_.add(new THREE.AmbientLight(0x202040, 2.0))

      // Cool blue key light — strong, from above-right
      const keyLight = new THREE.DirectionalLight(0x4070c0, 3.5)
      keyLight.position.set(30, 40, 20)
      scene_.add(keyLight)

      // Warm magenta rim — defines opposite edge
      const rimLight = new THREE.DirectionalLight(0xc04080, 2.0)
      rimLight.position.set(-25, 5, -30)
      scene_.add(rimLight)

      // Cool fill from below
      const underLight = new THREE.DirectionalLight(0x3060a0, 1.2)
      underLight.position.set(0, -30, 10)
      scene_.add(underLight)

      // Back fill
      const backLight = new THREE.DirectionalLight(0x604090, 1.2)
      backLight.position.set(-10, 20, -40)
      scene_.add(backLight)

      // Point lights near helix for local illumination
      const helixLight = new THREE.PointLight(0x4060c0, 80, 60)
      helixLight.position.set(0, 5, 8)
      scene_.add(helixLight)

      const helixLight2 = new THREE.PointLight(0xc04060, 60, 60)
      helixLight2.position.set(0, -5, -8)
      scene_.add(helixLight2)

      // Chromosome area lights
      const chromosomeLight1 = new THREE.PointLight(0xc040c0, 60, 80)
      chromosomeLight1.position.set(0, -25, 10)
      scene_.add(chromosomeLight1)

      const chromosomeLight2 = new THREE.PointLight(0x40c0c0, 40, 70)
      chromosomeLight2.position.set(0, 25, -5)
      scene_.add(chromosomeLight2)

      // ── DNA model ──
      model_ = createDNAModel()
      scene_.add(model_.helix)
      scene_.add(model_.chromosome)

      // Start with chromosome hidden
      model_.chromosome.visible = false

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

          if (HELIX_KEYS.includes(key)) {
            model_.helix.add(label)
            helixLabels_.push({ obj: label, div, key })
          } else {
            model_.chromosome.add(label)
            chromosomeLabels_.push({ obj: label, div, key })
          }
          labels_.push({ obj: label, div, key })
        }
      }

      // ── Post-processing ──
      const post = createComposer(renderer, scene_, camera_)
      composer_ = post.composer
      bloomPass_ = post.bloomPass
      cinematicPass_ = post.cinematicPass

      bloomPass_.strength = 0.7
      bloomPass_.threshold = 0.4
      bloomPass_.radius = 0.55

      // Cooled-down cinematic color grading — desaturated, moody
      cinematicPass_.uniforms.liftR.value = 0.96
      cinematicPass_.uniforms.liftG.value = 0.95
      cinematicPass_.uniforms.liftB.value = 1.06
      cinematicPass_.uniforms.gainR.value = 0.95
      cinematicPass_.uniforms.gainG.value = 0.93
      cinematicPass_.uniforms.gainB.value = 1.0
      cinematicPass_.uniforms.vignetteIntensity.value = 0.5

      transProgress_ = 0
      transTarget_ = 0
    },

    setMode(mode) {
      transTarget_ = (mode === 'chromosome' || mode === 'interior') ? 1.0 : 0.0
    },

    flyTo(featureKey) {
      if (!model_?.labelAnchors?.[featureKey] || !camera_ || !controls_) return

      // Auto-switch mode based on feature
      if (CHROMO_KEYS.includes(featureKey)) {
        transTarget_ = 1.0
      } else {
        transTarget_ = 0.0
      }

      const target = model_.labelAnchors[featureKey].pos.clone()

      // Transform label position into world space based on which group it's in
      if (CHROMO_KEYS.includes(featureKey)) {
        model_.chromosome.localToWorld(target)
      } else {
        model_.helix.localToWorld(target)
      }

      const offset = new THREE.Vector3(12, 8, 12)
      const camTarget = target.clone().add(offset)

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
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2

        camera_.position.lerpVectors(flyAnim_.startPos, flyAnim_.camTarget, e)
        controls_.target.lerpVectors(flyAnim_.startTarget, flyAnim_.lookTarget, e)

        if (t >= 1) flyAnim_ = null
      }

      // ── Smooth transition ──
      const speed = 1.5
      if (transProgress_ < transTarget_) {
        transProgress_ = Math.min(transProgress_ + dt * speed, transTarget_)
      } else if (transProgress_ > transTarget_) {
        transProgress_ = Math.max(transProgress_ - dt * speed, transTarget_)
      }

      const t = transProgress_

      if (model_) {
        // Slowly rotate helix around its axis
        model_.helix.rotation.y += 0.0015

        // Simple visibility toggle (opacity crossfade breaks material rendering)
        model_.helix.visible = t < 0.5
        model_.chromosome.visible = t >= 0.5

        // Animate floating particles — gentle drift
        if (model_.particles && model_.helix.visible) {
          const positions = model_.particles.geometry.attributes.position
          const origPositions = model_.particleOriginalY
          const time = performance.now() * 0.001
          for (let i = 0; i < positions.count; i++) {
            const baseY = origPositions[i]
            positions.setY(i, baseY + Math.sin(time * 0.3 + i * 0.1) * 0.5)
          }
          positions.needsUpdate = true
        }

        // Camera zoom adjustments for scale difference
        controls_.minDistance = 5 + t * 15
        controls_.maxDistance = 150 + t * 50
      }

      // ── Label visibility ──
      for (const label of helixLabels_) {
        const worldPos = new THREE.Vector3()
        label.obj.getWorldPosition(worldPos)
        const dist = camera_.position.distanceTo(worldPos)
        const distFade = 1.0 - Math.max(0, Math.min(1, (dist - 10) / 60))
        const opacity = (1.0 - t) * distFade
        label.div.style.opacity = opacity.toFixed(2)
        label.div.style.display = opacity < 0.02 ? 'none' : ''
      }

      for (const label of chromosomeLabels_) {
        const worldPos = new THREE.Vector3()
        label.obj.getWorldPosition(worldPos)
        const dist = camera_.position.distanceTo(worldPos)
        const distFade = 1.0 - Math.max(0, Math.min(1, (dist - 10) / 80))
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
          rows += `<div style="display:flex;justify-content:space-between;padding:6px 16px;border-bottom:1px solid rgba(160,80,200,0.08);">
            <span style="color:#503060;font-size:9px;letter-spacing:2px;text-transform:uppercase">${f}</span>
            <span style="color:#c080e0;font-size:11px;letter-spacing:0.5px">${feature[f]}</span>
          </div>`
        }
      })
      if (feature.description) {
        rows += `<div style="padding:12px 16px;color:#a080c0;font-size:11px;line-height:1.6;letter-spacing:0.3px">${feature.description}</div>`
      }

      content.innerHTML = `
        <div style="padding:14px 16px 12px;border-bottom:1px solid rgba(160,80,200,0.3);margin-bottom:4px">
          <div style="color:#c080e0;font-size:13px;letter-spacing:2px;margin-bottom:5px">${feature.name}</div>
          <div style="color:#503060;font-size:9px;letter-spacing:3px">${(feature.type || 'STRUCTURE').toUpperCase()}</div>
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
      helixLabels_ = []
      chromosomeLabels_ = []
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

// (removed — no longer needed)

// ─── HUD helpers ─────────────────────────────────────────────────────────────

function updateGauges(camera, t) {
  const el = (id) => document.getElementById(id)
  const p = camera.position

  const elev = el('sp2-gauge-elevation')
  if (elev) {
    const d = Math.round(p.distanceTo(new THREE.Vector3(0, 0, 0)))
    elev.textContent = t < 0.5 ? `${(d * 0.34).toFixed(1)} nm` : `${d} nm`
  }

  const dist = el('sp2-gauge-distance')
  if (dist) {
    const d = Math.round(p.distanceTo(new THREE.Vector3(0, 0, 0)))
    dist.textContent = `${d} units`
  }

  const mode = el('sp2-gauge-mode')
  if (mode) mode.textContent = t > 0.5 ? 'CHROMOSOME' : 'HELIX'
}
