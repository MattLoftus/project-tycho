const TYPE_HEX = {
  vent:     '#ff6030',
  creature: '#40ff80',
  nodule:   '#e0a040',
  trench:   '#2080ff',
  seamount: '#c060ff',
}

const startTime = Date.now()
let _featureClickCb = null

// ─── Shared setters ───────────────────────────────────────────────────────────

export function setStatus(text) {
  const el = document.getElementById('oc-status-text')
  if (el) el.textContent = text
}

export function setFeatureClickCallback(fn) {
  _featureClickCb = fn
}

// ─── Procedural HUD ───────────────────────────────────────────────────────────

export function initProceduralHUD(contacts) {
  document.getElementById('oc-hud-system-title').textContent = 'DEEP OCEAN SURVEY SYSTEM'
  document.getElementById('oc-contact-panel').style.display  = ''
  document.getElementById('oc-geo-panel').style.display      = 'none'

  const list = document.getElementById('oc-contact-list')
  list.innerHTML = ''

  contacts.forEach((c) => {
    const col  = TYPE_HEX[c.type]
    const item = document.createElement('div')
    item.className = 'contact-item'
    item.innerHTML = `
      <div class="contact-item-header">
        <span class="contact-dot" style="background:${col};box-shadow:0 0 7px ${col}"></span>
        <span class="contact-name">${c.name}</span>
      </div>
      <div class="contact-meta">
        <span class="contact-depth">${c.depth}</span>
        <span class="contact-type type-${c.type}">${c.type.toUpperCase()}</span>
      </div>`
    item.addEventListener('click', () => showContactDetail(c))
    list.appendChild(item)
  })

  document.getElementById('oc-contact-count').textContent = contacts.length
  _fadeOutLoading()
}

// ─── Geo HUD (real bathymetry views) ────────────────────────────────────────

export function initGeoHUD(region, featuresWithPos, systemTitle = 'DEEP OCEAN SURVEY SYSTEM') {
  document.getElementById('oc-hud-system-title').textContent = systemTitle
  document.getElementById('oc-contact-panel').style.display  = 'none'
  document.getElementById('oc-geo-panel').style.display      = ''
  document.getElementById('oc-geo-region-label').textContent  = region.subtitle

  const list = document.getElementById('oc-geo-feature-list')
  list.innerHTML = ''

  featuresWithPos.forEach((f, i) => {
    const col  = TYPE_HEX[f.type] || '#2080ff'
    const item = document.createElement('div')
    item.className = 'contact-item feature-item'
    item.innerHTML = `
      <div class="contact-item-header">
        <span class="contact-dot" style="background:${col};box-shadow:0 0 7px ${col}88"></span>
        <span class="contact-name">${f.name}</span>
      </div>
      <div class="contact-meta">
        <span class="contact-depth">${f.depth}</span>
        <span class="contact-type type-${f.type || 'trench'}">${(f.type || f.featureType || '').toUpperCase()}</span>
      </div>`

    item.addEventListener('mouseenter', () => item.classList.add('feature-targeted'))
    item.addEventListener('mouseleave', () => item.classList.remove('feature-targeted'))
    item.addEventListener('click', () => {
      item.classList.add('feature-activated')
      setTimeout(() => item.classList.remove('feature-activated'), 600)
      if (_featureClickCb) _featureClickCb(f, i)
    })

    list.appendChild(item)
  })

  document.getElementById('oc-geo-feature-count').textContent = featuresWithPos.length
  _fadeOutLoading()
}

// ─── Per-frame ────────────────────────────────────────────────────────────────

export function updateHUD(camera) {
  const p = camera.position

  document.getElementById('oc-coord-lat').textContent   = (-(p.z / 100) * 90).toFixed(3)
  document.getElementById('oc-coord-lon').textContent   = ((p.x / 100) * 180).toFixed(3)

  // Depth: camera Y maps to depth (lower Y = deeper)
  const depthM = Math.max(0, Math.round(-p.y * 50 + 2000))
  document.getElementById('oc-coord-depth').textContent = `-${depthM}`

  // Gauges
  document.getElementById('oc-gauge-depth').textContent    = `-${depthM} m`
  document.getElementById('oc-gauge-pressure').textContent = `${(depthM / 10 + 1).toFixed(1)} atm`
  // Temperature: ~2°C at abyssal, warmer near surface or vents
  const temp = Math.max(1.2, 4.0 - depthM * 0.0005).toFixed(1)
  document.getElementById('oc-gauge-temp').textContent     = `${temp} °C`
  // O2: slowly "decreases" deeper as a cosmetic effect
  const o2 = Math.max(72, 98 - depthM * 0.004).toFixed(0)
  document.getElementById('oc-gauge-o2').textContent       = `${o2}%`

  // Dive time
  const ms = Date.now() - startTime
  const ss = String(Math.floor(ms / 1000)   % 60).padStart(2, '0')
  const mm = String(Math.floor(ms / 60000)  % 60).padStart(2, '0')
  const hh = String(Math.floor(ms / 3600000)   ).padStart(2, '0')
  document.getElementById('oc-mission-time').textContent = `T+ ${hh}:${mm}:${ss}`
}

// ─── Contact detail ─────────────────────────────────────────────────────────

export function showContactDetail(contact) {
  const col = TYPE_HEX[contact.type] || '#2080ff'

  let rows = `
    <div class="detail-row"><span class="label">DEPTH</span><span class="value">${contact.depth}</span></div>
    <div class="detail-row"><span class="label">TYPE</span><span class="value">${contact.type.toUpperCase()}</span></div>`

  // Add type-specific fields
  if (contact.temp)       rows += `<div class="detail-row"><span class="label">TEMPERATURE</span><span class="value">${contact.temp}</span></div>`
  if (contact.minerals)   rows += `<div class="detail-row"><span class="label">MINERALS</span><span class="value">${contact.minerals}</span></div>`
  if (contact.species)    rows += `<div class="detail-row"><span class="label">SPECIES</span><span class="value">${contact.species}</span></div>`
  if (contact.discovered) rows += `<div class="detail-row"><span class="label">DISCOVERED</span><span class="value">${contact.discovered}</span></div>`
  if (contact.composition)rows += `<div class="detail-row"><span class="label">COMPOSITION</span><span class="value">${contact.composition}</span></div>`
  if (contact.density)    rows += `<div class="detail-row"><span class="label">DENSITY</span><span class="value">${contact.density}</span></div>`
  if (contact.width)      rows += `<div class="detail-row"><span class="label">WIDTH</span><span class="value">${contact.width}</span></div>`

  rows += `<div class="detail-row"><span class="label">CONTACT ID</span><span class="value">DO-${String(contact.id).padStart(4, '0')}</span></div>`
  rows += `<div class="detail-row"><span class="label">STATUS</span><span class="value" style="color:#40ff80;">CONFIRMED</span></div>`

  document.getElementById('oc-contact-detail-content').innerHTML = `
    <div style="padding:14px 16px 12px;border-bottom:1px solid ${col}30;margin-bottom:4px;">
      <div style="color:${col};font-size:13px;letter-spacing:2px;margin-bottom:5px;text-shadow:0 0 12px ${col}60">${contact.name}</div>
      <div style="color:#3a5870;font-size:9px;letter-spacing:3px;">${contact.type.toUpperCase()} CONTACT</div>
    </div>
    <div class="detail-body">${rows}</div>`
  document.getElementById('oc-contact-detail').classList.remove('hidden')
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function _fadeOutLoading() {
  const el = document.getElementById('oc-loading')
  if (!el) return
  el.classList.add('fade-out')
  setTimeout(() => el.remove(), 950)
}
