import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import { createComposer } from '../post.js'
import { createCameraMovement } from '../camera-movement.js'
import { createLigoModel } from './ligo-model.js'

/**
 * LIGO — Detecting Spacetime
 *
 * Earth-scale view of the two LIGO interferometers (H1 Hanford, L1
 * Livingston), a distant binary inspiral source, and the gravitational-
 * wave fronts washing over the detectors. Each site's L-shaped arms
 * stretch and squeeze in real time as the chirp arrives.
 */

export function createLigoView() {
  let scene_, camera_, controls_, renderer_
  let composer_, bloomPass_, cinematicPass_
  let labelRenderer_
  let camMove_
  let clock_
  let model_ = null
  let speedMultiplier_ = 1.0
  let simTime_ = 0
  let strainCanvas_ = null, strainCtx_ = null
  let h1Label_ = null, l1Label_ = null

  function initStrainCanvas() {
    strainCanvas_ = document.getElementById('sp2-ligo-strain-canvas')
    if (strainCanvas_) {
      strainCtx_ = strainCanvas_.getContext('2d')
    }
  }

  function drawStrainPlot() {
    if (!model_) return
    // Defensive: re-acquire canvas if it became available later
    if (!strainCanvas_ || !strainCtx_) {
      strainCanvas_ = document.getElementById('sp2-ligo-strain-canvas')
      if (strainCanvas_) strainCtx_ = strainCanvas_.getContext('2d')
      if (!strainCtx_) return
    }
    const { buffer, head } = model_.getStrainHistory()
    const w = strainCanvas_.width
    const h = strainCanvas_.height

    // Solid fill to confirm the canvas is active
    strainCtx_.fillStyle = 'rgba(8, 14, 22, 0.85)'
    strainCtx_.fillRect(0, 0, w, h)

    // Center axis
    strainCtx_.strokeStyle = 'rgba(64, 224, 192, 0.45)'
    strainCtx_.lineWidth = 1
    strainCtx_.beginPath()
    strainCtx_.moveTo(0, h / 2)
    strainCtx_.lineTo(w, h / 2)
    strainCtx_.stroke()

    // Strain trace — fat, glowing
    strainCtx_.shadowColor = '#40e0c0'
    strainCtx_.shadowBlur = 4
    strainCtx_.strokeStyle = '#80f0d0'
    strainCtx_.lineWidth = 2.0
    strainCtx_.beginPath()
    const N = buffer.length
    for (let i = 0; i < N; i++) {
      const idx = (head + i) % N
      const v = buffer[idx]
      const x = (i / (N - 1)) * w
      const y = h / 2 - v * (h * 0.42)
      if (i === 0) strainCtx_.moveTo(x, y)
      else strainCtx_.lineTo(x, y)
    }
    strainCtx_.stroke()
    strainCtx_.shadowBlur = 0
  }

  return {
    init(renderer) {
      renderer_ = renderer
      clock_ = new THREE.Clock()
      simTime_ = 0

      scene_ = new THREE.Scene()
      scene_.background = new THREE.Color(0x000408)

      camera_ = new THREE.PerspectiveCamera(
        50, window.innerWidth / window.innerHeight, 0.5, 2000
      )
      // Front-on view of Earth with the source binary visible up-and-to-the-left
      camera_.position.set(180, 100, 180)

      controls_ = new OrbitControls(camera_, renderer.domElement)
      controls_.enableDamping = true
      controls_.dampingFactor = 0.05
      controls_.target.set(0, 0, 0)
      controls_.minDistance = 80
      controls_.maxDistance = 600

      camMove_ = createCameraMovement(camera_, controls_)

      // Lighting (mostly self-emissive geometry, but a touch of fill)
      scene_.add(new THREE.AmbientLight(0x223040, 1.2))
      const key = new THREE.DirectionalLight(0x6090c0, 0.8)
      key.position.set(80, 60, 80)
      scene_.add(key)

      model_ = createLigoModel()
      scene_.add(model_.root)

      // CSS2D labels for H1 and L1
      labelRenderer_ = new CSS2DRenderer()
      labelRenderer_.setSize(window.innerWidth, window.innerHeight)
      labelRenderer_.domElement.style.position = 'absolute'
      labelRenderer_.domElement.style.top = '0'
      labelRenderer_.domElement.style.left = '0'
      labelRenderer_.domElement.style.pointerEvents = 'none'
      const appContainer = document.getElementById('spacetime-app') || document.getElementById('special-app')
      appContainer?.appendChild(labelRenderer_.domElement)

      function makeLabel(text, color) {
        const div = document.createElement('div')
        div.textContent = text
        div.style.color = color
        div.style.fontFamily = "'Share Tech Mono', monospace"
        div.style.fontSize = '11px'
        div.style.letterSpacing = '2px'
        div.style.textShadow = '0 0 8px rgba(0,0,0,0.7)'
        div.style.padding = '2px 6px'
        div.style.background = 'rgba(0,0,0,0.35)'
        div.style.border = `1px solid ${color}`
        return new CSS2DObject(div)
      }
      h1Label_ = makeLabel('H1 — HANFORD', '#40e0c0')
      l1Label_ = makeLabel('L1 — LIVINGSTON', '#ff90c0')
      h1Label_.position.copy(model_.h1.basePosition).multiplyScalar(1.15)
      l1Label_.position.copy(model_.l1.basePosition).multiplyScalar(1.15)
      scene_.add(h1Label_)
      scene_.add(l1Label_)

      // Speed slider
      const slider = document.getElementById('sp2-ligo-speed')
      const speedLabel = document.getElementById('sp2-ligo-speed-label')
      if (slider) {
        slider.addEventListener('input', () => {
          speedMultiplier_ = slider.value / 100
          if (speedLabel) speedLabel.textContent = speedMultiplier_.toFixed(1) + 'x'
        })
      }

      // Strain plot canvas
      initStrainCanvas()

      // Post-processing — soft, high-tech feel
      const post = createComposer(renderer, scene_, camera_)
      composer_ = post.composer
      bloomPass_ = post.bloomPass
      cinematicPass_ = post.cinematicPass

      bloomPass_.strength = 0.85
      bloomPass_.threshold = 0.18
      bloomPass_.radius = 0.7

      cinematicPass_.uniforms.liftR.value = 0.92
      cinematicPass_.uniforms.liftG.value = 0.96
      cinematicPass_.uniforms.liftB.value = 1.06
      cinematicPass_.uniforms.gainR.value = 0.96
      cinematicPass_.uniforms.gainG.value = 0.99
      cinematicPass_.uniforms.gainB.value = 1.04
      cinematicPass_.uniforms.vignetteIntensity.value = 0.32
      cinematicPass_.uniforms.grainIntensity.value = 0.025
    },

    animate() {
      if (!composer_) return {}
      const dt = clock_.getDelta()
      simTime_ += dt * speedMultiplier_

      model_.update(simTime_)

      // Phase indicator
      const phaseEl = document.getElementById('sp2-ligo-phase')
      if (phaseEl) phaseEl.textContent = model_.getPhase()

      drawStrainPlot()

      if (camMove_) camMove_.update(dt)
      cinematicPass_.uniforms.time.value = performance.now() * 0.001
      controls_.update()
      composer_.render()
      if (labelRenderer_) labelRenderer_.render(scene_, camera_)

      return { camera: camera_ }
    },

    getClickTargets() { return [] },

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
      if (labelRenderer_?.domElement?.parentNode) {
        labelRenderer_.domElement.parentNode.removeChild(labelRenderer_.domElement)
      }
      if (scene_) {
        scene_.traverse(obj => {
          if (obj.geometry) obj.geometry.dispose()
          if (obj.material) {
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
            mats.forEach(m => { if (m && m.dispose) m.dispose() })
          }
        })
      }
      h1Label_ = l1Label_ = null
      scene_ = camera_ = controls_ = composer_ = model_ = labelRenderer_ = null
      strainCanvas_ = strainCtx_ = null
    },
  }
}
