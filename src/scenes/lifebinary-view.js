import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { createComposer } from '../post.js'
import { createCameraMovement } from '../camera-movement.js'
import { createLifeBinaryModel, CHAPTERS } from './lifebinary-model.js'

/**
 * Life of a Binary view — chapter-driven journey.
 *
 * Wraps the shared lifebinary-model. Reads the model's current chapter
 * each frame to update HUD text (title, progress bar, chapter label).
 * Exposes a chapter nav in the HUD for skipping between chapters.
 */

export function createLifeBinaryView() {
  let scene_, camera_, controls_, renderer_
  let composer_, bloomPass_, cinematicPass_
  let camMove_
  let clock_
  let model_ = null
  let lastChapter = -1

  return {
    init(renderer) {
      renderer_ = renderer
      clock_ = new THREE.Clock()

      scene_ = new THREE.Scene()
      scene_.background = new THREE.Color(0x020408)

      camera_ = new THREE.PerspectiveCamera(
        50, window.innerWidth / window.innerHeight, 0.1, 500
      )
      camera_.position.set(18, 12, 18)

      controls_ = new OrbitControls(camera_, renderer.domElement)
      controls_.enableDamping = true
      controls_.dampingFactor = 0.05
      controls_.target.set(0, -1, 0)
      controls_.minDistance = 8
      controls_.maxDistance = 120

      camMove_ = createCameraMovement(camera_, controls_)

      scene_.add(new THREE.AmbientLight(0x304060, 2.0))
      const key = new THREE.DirectionalLight(0x4060a0, 2.0)
      key.position.set(15, 25, 20)
      scene_.add(key)
      const fill = new THREE.DirectionalLight(0x304080, 1.0)
      fill.position.set(-10, 5, -15)
      scene_.add(fill)
      const centerLight = new THREE.PointLight(0x4080cc, 80, 30)
      centerLight.position.set(0, -2, 0)
      scene_.add(centerLight)

      model_ = createLifeBinaryModel()
      scene_.add(model_.grid)
      scene_.add(model_.objA)
      scene_.add(model_.objB)
      scene_.add(model_.remnant)
      scene_.add(model_.disk)
      scene_.add(model_.starfield)

      // Chapter nav buttons
      document.querySelectorAll('#sp2-lifebinary-chapters .chapter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.chapter, 10)
          if (!isNaN(idx)) model_.skipTo(idx)
        })
      })

      const post = createComposer(renderer, scene_, camera_)
      composer_      = post.composer
      bloomPass_     = post.bloomPass
      cinematicPass_ = post.cinematicPass

      bloomPass_.strength  = 0.7
      bloomPass_.threshold = 0.25
      bloomPass_.radius    = 0.6

      cinematicPass_.uniforms.liftR.value = 0.90
      cinematicPass_.uniforms.liftG.value = 0.94
      cinematicPass_.uniforms.liftB.value = 1.08
      cinematicPass_.uniforms.gainR.value = 0.95
      cinematicPass_.uniforms.gainG.value = 0.98
      cinematicPass_.uniforms.gainB.value = 1.06
      cinematicPass_.uniforms.vignetteIntensity.value = 0.35
      cinematicPass_.uniforms.grainIntensity.value = 0.03
    },

    animate() {
      if (!composer_) return {}
      const dt = clock_.getDelta()

      model_.update(clock_.elapsedTime)

      // HUD updates — chapter label + progress bar
      const chap = model_.currentChapter
      const localT = model_.chapterLocalT
      if (chap !== lastChapter) {
        lastChapter = chap
        // Update chapter label
        const label = document.getElementById('sp2-lifebinary-chapter-label')
        if (label) label.textContent = CHAPTERS[chap].label
        // Update subtitle/phase element
        const phase = document.getElementById('sp2-lifebinary-phase')
        if (phase) phase.textContent = CHAPTERS[chap].name
        // Highlight active chapter button
        document.querySelectorAll('#sp2-lifebinary-chapters .chapter-btn').forEach(b => {
          b.classList.toggle('active', parseInt(b.dataset.chapter, 10) === chap)
        })
      }

      // Update progress bar
      const progressFill = document.getElementById('sp2-lifebinary-progress-fill')
      if (progressFill) {
        // Global progress = (sum of previous chapter durations + localT * current duration) / total
        let beforeCurrent = 0
        for (let i = 0; i < chap; i++) beforeCurrent += CHAPTERS[i].duration
        const total = CHAPTERS.reduce((s, c) => s + c.duration, 0)
        const globalT = (beforeCurrent + localT * CHAPTERS[chap].duration) / total
        progressFill.style.width = (globalT * 100).toFixed(1) + '%'
      }

      if (camMove_) camMove_.update(dt)
      cinematicPass_.uniforms.time.value = performance.now() * 0.001
      controls_.update()
      composer_.render()

      return { camera: camera_ }
    },

    getClickTargets() { return [] },

    resize() {
      if (!camera_ || !composer_) return
      camera_.aspect = window.innerWidth / window.innerHeight
      camera_.updateProjectionMatrix()
      composer_.setSize(window.innerWidth, window.innerHeight)
    },

    dispose() {
      camMove_?.dispose()
      controls_?.dispose()
      composer_?.dispose()
      if (scene_) {
        scene_.traverse(obj => {
          if (obj.geometry) obj.geometry.dispose()
          if (obj.material) {
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
            mats.forEach(m => { if (m && m.dispose) m.dispose() })
          }
        })
      }
      scene_ = camera_ = controls_ = composer_ = model_ = null
      lastChapter = -1
    },
  }
}
