import * as THREE from 'three'
import { createBathymetryView } from '../ocean/views/bathymetry.js'

/**
 * Titanic wreck site — standalone special view.
 * Wraps the ocean bathymetry Titanic view but stubs out the ocean HUD
 * so it works within the special-app HUD system.
 *
 * Adds CSS2D labels, click targets, flyTo, and feature detail panel
 * consistent with other special views (pangaea, cell, dna, etc.).
 */
export function createTitanicView() {
  let innerView = null
  let camera_ = null
  let scene_ = null
  let controls_ = null
  let flyAnim_ = null
  let clickTargets_ = []

  // Feature data imported from the model via scene traversal
  let features_ = null
  let labelAnchors_ = null

  // Bow/stern world transforms for label positioning
  let bowGroup_ = null
  let sternGroup_ = null
  let debrisGroup_ = null

  return {
    async init(renderer) {
      // Ensure ocean HUD elements exist (hidden) so the bathymetry view doesn't crash
      _ensureOceanHudStubs()

      innerView = createBathymetryView('titanic')
      await innerView.init(renderer)

      // Hide the ocean loading overlay if it appeared
      const ocLoading = document.getElementById('oc-loading')
      if (ocLoading) ocLoading.style.display = 'none'

      // Grab scene, camera, and controls from inner view
      scene_ = innerView.getScene()
      camera_ = innerView.getCamera()
      controls_ = innerView.getControls()

      if (!scene_ || !camera_) return

      // ── Discover Titanic model meshes in the scene ──
      // The bathymetry view adds bow, stern, debris as direct children.
      // Tagged meshes have userData.featureKey set by the model builder.
      clickTargets_ = []
      const featureWorldPositions = {}

      scene_.traverse(obj => {
        if (obj.userData?.featureKey) {
          clickTargets_.push(obj)

          // Compute world position for label anchor
          const worldPos = new THREE.Vector3()
          obj.getWorldPosition(worldPos)
          featureWorldPositions[obj.userData.featureKey] = worldPos
        }

        // Track the major groups by name/structure
        if (obj.isGroup && obj.children?.length > 0) {
          const firstChild = obj.children[0]
          if (firstChild?.userData?.featureKey === 'bow') bowGroup_ = obj
          if (firstChild?.userData?.featureKey === 'stern') sternGroup_ = obj
        }
        if (obj.userData?.featureKey === 'debrisField') debrisGroup_ = obj
      })

      // Extract features from the first tagged mesh
      const anyTagged = clickTargets_[0]
      if (anyTagged?.userData?.feature) {
        // Import the FEATURES object — all tagged meshes reference the same dict
        features_ = {}
        clickTargets_.forEach(t => {
          if (t.userData.featureKey && t.userData.feature) {
            features_[t.userData.featureKey] = t.userData.feature
          }
        })
      }

      // ── Build label anchors in world space ──
      // Use the world positions of tagged meshes, offset upward for readability
      labelAnchors_ = {}
      const labelOffsetY = 2.5

      // Map feature keys to appropriate label positions
      const labelConfig = {
        bow:            { offsetY: 3.5, offsetX: 0, offsetZ: 2.0 },
        stern:          { offsetY: 3.5, offsetX: 0, offsetZ: -1.0 },
        funnels:        { offsetY: 4.0, offsetX: 0, offsetZ: 0 },
        bridge:         { offsetY: 2.8, offsetX: 0, offsetZ: 0 },
        grandStaircase: { offsetY: 2.5, offsetX: 0, offsetZ: 0 },
        boatDeck:       { offsetY: 2.5, offsetX: 1.5, offsetZ: 0 },
        forecastle:     { offsetY: 2.5, offsetX: 0, offsetZ: 0 },
        poopDeck:       { offsetY: 2.5, offsetX: 0, offsetZ: 0 },
        debrisField:    { offsetY: 2.0, offsetX: 0, offsetZ: 0 },
      }

      for (const [key, worldPos] of Object.entries(featureWorldPositions)) {
        const cfg = labelConfig[key] || { offsetY: labelOffsetY, offsetX: 0, offsetZ: 0 }
        const name = features_?.[key]?.name || key
        labelAnchors_[key] = {
          pos: new THREE.Vector3(
            worldPos.x + cfg.offsetX,
            worldPos.y + cfg.offsetY,
            worldPos.z + cfg.offsetZ
          ),
          name,
        }
      }

    },

    animate() {
      if (!innerView) return {}
      const result = innerView.animate()

      // Update camera reference (in case it changed)
      if (result?.camera) camera_ = result.camera

      // ── Camera fly-to animation ──
      if (flyAnim_ && camera_ && controls_) {
        flyAnim_.elapsed += flyAnim_.clock.getDelta()
        const t = Math.min(flyAnim_.elapsed / flyAnim_.duration, 1)
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2

        camera_.position.lerpVectors(flyAnim_.startPos, flyAnim_.camTarget, e)
        controls_.target.lerpVectors(flyAnim_.startTarget, flyAnim_.lookTarget, e)

        if (t >= 1) flyAnim_ = null
      }

      return result
    },

    getClickTargets() {
      return clickTargets_
    },

    flyTo(featureKey) {
      if (!labelAnchors_?.[featureKey] || !camera_ || !controls_) return

      const target = labelAnchors_[featureKey].pos.clone()
      // Position camera offset from the feature — slightly above and to the side
      const dir = target.clone().sub(controls_.target).normalize()
      const offset = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(5)
      offset.y = 4
      const camTarget = target.clone().add(offset)

      const startPos = camera_.position.clone()
      const startTarget = controls_.target.clone()
      const duration = 1.5
      flyAnim_ = {
        startPos,
        camTarget,
        startTarget,
        lookTarget: target,
        elapsed: 0,
        duration,
        clock: new THREE.Clock(),
      }
    },

    focusFeature(key) {
      this.flyTo(key)
      this.showFeatureDetailByKey(key)
    },

    showFeatureDetailByKey(key) {
      if (!features_?.[key]) return
      this.showFeatureDetail(features_[key])
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
          <div style="color:#204060;font-size:9px;letter-spacing:3px">${(feature.type || 'STRUCTURE').toUpperCase()}</div>
        </div>
        ${rows}`

      document.getElementById('sp2-detail')?.classList.remove('hidden')
    },

    resize() {
      innerView?.resize()
      if (labelRenderer_) labelRenderer_.setSize(window.innerWidth, window.innerHeight)
    },

    dispose() {
      flyAnim_ = null
      clickTargets_ = []
      features_ = null
      labelAnchors_ = null
      bowGroup_ = null
      sternGroup_ = null
      debrisGroup_ = null

      innerView?.dispose()
      innerView = null
      scene_ = null
      camera_ = null
      controls_ = null
    },
  }
}

/**
 * Ensure the ocean HUD DOM elements exist so initGeoHUD() calls
 * don't throw. These are invisible stubs.
 */
function _ensureOceanHudStubs() {
  const ids = [
    'oc-hud-system-title', 'oc-contact-panel', 'oc-geo-panel',
    'oc-geo-region-label', 'oc-geo-feature-list', 'oc-geo-feature-count',
    'oc-status-text', 'oc-loading',
    'oc-coord-lat', 'oc-coord-lon', 'oc-coord-depth',
    'oc-gauge-depth', 'oc-gauge-pressure', 'oc-gauge-temp',
    'oc-gauge-o2', 'oc-mission-time',
  ]
  // Only create stubs if they don't already exist
  let container = document.getElementById('oc-hud-stubs')
  if (!container) {
    container = document.createElement('div')
    container.id = 'oc-hud-stubs'
    container.style.display = 'none'
    document.body.appendChild(container)
  }
  for (const id of ids) {
    if (!document.getElementById(id)) {
      const el = document.createElement('div')
      el.id = id
      container.appendChild(el)
    }
  }
}
