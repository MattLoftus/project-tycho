import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import { createComposer } from '../post.js'
import { createCameraMovement } from '../camera-movement.js'
import { createPtaModel, hellingsDowns } from './pta-model.js'

/**
 * NANOGrav Pulsar Timing Array view.
 *
 * View setup:
 *   - Camera inside the celestial sphere, looking toward the center where Earth sits
 *   - Pulsars lit on the sphere shell, faint Earth-pulsar lines
 *   - Orbit controls let user rotate the sky
 *
 * Interactivity:
 *   - Pair-angle slider scrubs the selected angular separation; one
 *     representative pair at that angle is highlighted with a great-circle
 *     arc, and the HD curve canvas marks the current angle and its
 *     correlation amplitude
 *   - Click any pulsar to spotlight it (basic — flips an inactive label
 *     to active for the duration of the view)
 */

export function createPtaView() {
  let scene_, camera_, controls_, renderer_
  let composer_, bloomPass_, cinematicPass_
  let labelRenderer_
  let camMove_
  let clock_
  let model_ = null
  let simTime_ = 0
  let hdCanvas_ = null, hdCtx_ = null
  let pairAngleDeg_ = 60
  let raycaster_ = null, mouse_ = null
  let labels_ = []
  let activeSpotlightLabel_ = null

  function initHdCanvas() {
    hdCanvas_ = document.getElementById('sp2-pta-hd-canvas')
    if (hdCanvas_) hdCtx_ = hdCanvas_.getContext('2d')
  }

  function drawHdCurve() {
    if (!model_) return
    if (!hdCanvas_ || !hdCtx_) {
      initHdCanvas()
      if (!hdCtx_) return
    }
    const w = hdCanvas_.width
    const h = hdCanvas_.height

    hdCtx_.fillStyle = 'rgba(8, 14, 22, 0.85)'
    hdCtx_.fillRect(0, 0, w, h)

    // Plot HD(θ) for θ ∈ [0, 180°]
    // x range 0..w → 0..π
    // y range: HD is in [-0.25, 0.5]; we'll use [-0.3, 0.55] for padding
    const yMin = -0.3, yMax = 0.55
    function yPx(v) {
      return h - 12 - (v - yMin) / (yMax - yMin) * (h - 24)
    }

    // Gridlines + axis labels
    hdCtx_.strokeStyle = 'rgba(255, 144, 192, 0.18)'
    hdCtx_.lineWidth = 1
    hdCtx_.beginPath()
    // y=0 line (no correlation)
    hdCtx_.moveTo(0, yPx(0))
    hdCtx_.lineTo(w, yPx(0))
    hdCtx_.stroke()

    // y-axis tick labels
    hdCtx_.fillStyle = 'rgba(255, 144, 192, 0.45)'
    hdCtx_.font = "9px 'Share Tech Mono', monospace"
    hdCtx_.fillText('+0.5', 4, yPx(0.5) + 3)
    hdCtx_.fillText('  0', 4, yPx(0) + 3)
    hdCtx_.fillText('-0.25', 4, yPx(-0.25) + 3)

    // x-axis tick labels (0°, 90°, 180°)
    hdCtx_.fillText('0°', 30, h - 2)
    hdCtx_.fillText('90°', w / 2 - 8, h - 2)
    hdCtx_.fillText('180°', w - 22, h - 2)

    // HD curve
    hdCtx_.strokeStyle = '#ffb0d0'
    hdCtx_.lineWidth = 2.0
    hdCtx_.shadowColor = '#ff90c0'
    hdCtx_.shadowBlur = 4
    hdCtx_.beginPath()
    const STEPS = 200
    for (let s = 0; s <= STEPS; s++) {
      const theta = (s / STEPS) * Math.PI
      const v = hellingsDowns(theta)
      const x = (s / STEPS) * w
      const y = yPx(v)
      if (s === 0) hdCtx_.moveTo(x, y)
      else hdCtx_.lineTo(x, y)
    }
    hdCtx_.stroke()
    hdCtx_.shadowBlur = 0

    // Vertical line + dot at the currently selected angle
    const angDeg = pairAngleDeg_
    const xCur = (angDeg / 180) * w
    const vCur = hellingsDowns(angDeg * Math.PI / 180)
    const yCur = yPx(vCur)

    hdCtx_.strokeStyle = 'rgba(255, 255, 255, 0.55)'
    hdCtx_.lineWidth = 1
    hdCtx_.beginPath()
    hdCtx_.moveTo(xCur, 12)
    hdCtx_.lineTo(xCur, h - 14)
    hdCtx_.stroke()

    hdCtx_.fillStyle = '#ffffff'
    hdCtx_.beginPath()
    hdCtx_.arc(xCur, yCur, 4, 0, Math.PI * 2)
    hdCtx_.fill()

    // Caption: "θ = X°  HD = Y"
    hdCtx_.fillStyle = '#ffffff'
    hdCtx_.font = "10px 'Share Tech Mono', monospace"
    const caption = `θ = ${angDeg.toFixed(0)}°   HD = ${vCur.toFixed(3)}`
    const tw = hdCtx_.measureText(caption).width
    let tx = xCur + 8
    if (tx + tw > w - 4) tx = xCur - tw - 8
    hdCtx_.fillText(caption, tx, Math.max(14, yCur - 6))
  }

  return {
    init(renderer) {
      renderer_ = renderer
      clock_ = new THREE.Clock()
      simTime_ = 0

      scene_ = new THREE.Scene()
      scene_.background = new THREE.Color(0x000408)

      camera_ = new THREE.PerspectiveCamera(
        55, window.innerWidth / window.innerHeight, 0.5, 2000
      )
      // Sit just inside the celestial sphere, off-axis, looking at Earth
      camera_.position.set(35, 22, 50)

      controls_ = new OrbitControls(camera_, renderer.domElement)
      controls_.enableDamping = true
      controls_.dampingFactor = 0.05
      controls_.target.set(0, 0, 0)
      controls_.minDistance = 12
      controls_.maxDistance = 250
      camMove_ = createCameraMovement(camera_, controls_)

      // Lights — mostly self-emissive geometry
      scene_.add(new THREE.AmbientLight(0x202830, 1.2))

      model_ = createPtaModel()
      scene_.add(model_.root)

      // Pair-highlight labels (positioned each frame in animate())
      let pairLabelA_ = null, pairLabelB_ = null
      function makePairLabelDiv(text) {
        const div = document.createElement('div')
        div.textContent = text
        div.style.color = '#ffffff'
        div.style.fontFamily = "'Share Tech Mono', monospace"
        div.style.fontSize = '10px'
        div.style.letterSpacing = '2px'
        div.style.textShadow = '0 0 8px rgba(0,0,0,0.7)'
        div.style.padding = '2px 5px'
        div.style.background = 'rgba(0,0,0,0.55)'
        div.style.border = '1px solid rgba(255,255,255,0.7)'
        return div
      }
      this._pairLabelA = makePairLabelDiv('')
      this._pairLabelB = makePairLabelDiv('')
      this._pairLabelObjA = new CSS2DObject(this._pairLabelA)
      this._pairLabelObjB = new CSS2DObject(this._pairLabelB)

      // CSS2D label renderer for pulsar names on hover/click
      labelRenderer_ = new CSS2DRenderer()
      labelRenderer_.setSize(window.innerWidth, window.innerHeight)
      labelRenderer_.domElement.style.position = 'absolute'
      labelRenderer_.domElement.style.top = '0'
      labelRenderer_.domElement.style.left = '0'
      labelRenderer_.domElement.style.pointerEvents = 'none'
      const appContainer = document.getElementById('spacetime-app')
      appContainer?.appendChild(labelRenderer_.domElement)

      // Earth label
      const earthDiv = document.createElement('div')
      earthDiv.textContent = 'EARTH'
      earthDiv.style.color = '#ff90c0'
      earthDiv.style.fontFamily = "'Share Tech Mono', monospace"
      earthDiv.style.fontSize = '10px'
      earthDiv.style.letterSpacing = '2px'
      earthDiv.style.textShadow = '0 0 8px rgba(0,0,0,0.7)'
      earthDiv.style.padding = '2px 5px'
      earthDiv.style.background = 'rgba(0,0,0,0.4)'
      earthDiv.style.border = '1px solid #ff90c0'
      const earthLabel = new CSS2DObject(earthDiv)
      earthLabel.position.set(0, 6, 0)
      scene_.add(earthLabel)

      // Pair labels added to scene (position updated each frame)
      scene_.add(this._pairLabelObjA)
      scene_.add(this._pairLabelObjB)

      // Slider
      const slider = document.getElementById('sp2-pta-pair-slider')
      const sliderLabel = document.getElementById('sp2-pta-pair-angle-label')
      if (slider) {
        const apply = () => {
          pairAngleDeg_ = parseFloat(slider.value)
          if (sliderLabel) sliderLabel.textContent = pairAngleDeg_.toFixed(0) + '°'
          model_.setSelectedAngle(pairAngleDeg_ * Math.PI / 180)
        }
        slider.addEventListener('input', apply)
        apply()
      }

      // HD canvas
      initHdCanvas()

      // Click handling for pulsars — spotlight a pulsar by name
      raycaster_ = new THREE.Raycaster()
      mouse_ = new THREE.Vector2()
      const onClick = (e) => {
        if (!model_) return
        mouse_.x = (e.clientX / window.innerWidth) * 2 - 1
        mouse_.y = (e.clientY / window.innerHeight) * -2 + 1
        raycaster_.setFromCamera(mouse_, camera_)
        const hits = raycaster_.intersectObjects(
          model_.pulsarMarkers.map(m => m.mesh), false,
        )
        if (hits.length > 0) {
          const ud = hits[0].object.userData
          if (activeSpotlightLabel_) {
            scene_.remove(activeSpotlightLabel_)
            activeSpotlightLabel_ = null
          }
          const div = document.createElement('div')
          div.textContent = ud.name
          div.style.color = '#ffffff'
          div.style.fontFamily = "'Share Tech Mono', monospace"
          div.style.fontSize = '10px'
          div.style.letterSpacing = '2px'
          div.style.textShadow = '0 0 8px rgba(0,0,0,0.7)'
          div.style.padding = '2px 5px'
          div.style.background = 'rgba(0,0,0,0.55)'
          div.style.border = '1px solid #ffffff'
          const lbl = new CSS2DObject(div)
          lbl.position.copy(hits[0].object.position).multiplyScalar(1.1)
          scene_.add(lbl)
          activeSpotlightLabel_ = lbl
        }
      }
      renderer.domElement.addEventListener('click', onClick)
      // Stash for dispose
      const _onClick = onClick
      this._onClick = onClick

      // Post-processing
      const post = createComposer(renderer, scene_, camera_)
      composer_ = post.composer
      bloomPass_ = post.bloomPass
      cinematicPass_ = post.cinematicPass

      bloomPass_.strength = 0.85
      bloomPass_.threshold = 0.18
      bloomPass_.radius = 0.7

      cinematicPass_.uniforms.liftR.value = 1.04
      cinematicPass_.uniforms.liftG.value = 0.96
      cinematicPass_.uniforms.liftB.value = 1.00
      cinematicPass_.uniforms.gainR.value = 1.06
      cinematicPass_.uniforms.gainG.value = 0.96
      cinematicPass_.uniforms.gainB.value = 1.00
      cinematicPass_.uniforms.vignetteIntensity.value = 0.34
      cinematicPass_.uniforms.grainIntensity.value = 0.025
    },

    animate() {
      if (!composer_) return {}
      const dt = clock_.getDelta()
      simTime_ += dt

      model_.update(simTime_)

      // Sync the pulsar count gauge if it exists
      const countEl = document.getElementById('sp2-pta-pulsar-count')
      if (countEl && model_) countEl.textContent = String(model_.pulsarData.length)

      drawHdCurve()

      // Update pair labels — show the names of the two highlighted pulsars
      const pair = model_.getSelectedPair()
      if (pair) {
        this._pairLabelA.textContent = pair.pulsarA.name
        this._pairLabelB.textContent = pair.pulsarB.name
        const SKY_R = 80
        this._pairLabelObjA.position.copy(pair.pulsarA.dirUnit).multiplyScalar(SKY_R * 1.10)
        this._pairLabelObjB.position.copy(pair.pulsarB.dirUnit).multiplyScalar(SKY_R * 1.10)
        this._pairLabelObjA.visible = true
        this._pairLabelObjB.visible = true
      } else {
        this._pairLabelObjA.visible = false
        this._pairLabelObjB.visible = false
      }

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
      if (renderer_ && this._onClick) {
        renderer_.domElement.removeEventListener('click', this._onClick)
      }
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
      activeSpotlightLabel_ = null
      labels_ = []
      scene_ = camera_ = controls_ = composer_ = model_ = labelRenderer_ = null
      hdCanvas_ = hdCtx_ = null
    },
  }
}
