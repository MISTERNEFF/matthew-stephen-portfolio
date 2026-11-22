// Interactive SABERTOOTH chronograph (pc#290, pc#303): three.js viewer with an exploded view of the calibre ST-01.
// The movement runs on real gear ratios: the balance swings 4 times a second, the escapement releases the train
// 8 times a second, and every wheel and hand turns by its tooth-count ratio to the escape wheel (ratios come from
// the Blender script as glTF extras). The movement file loads only when it is needed.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const TAU = Math.PI * 2;
const ORDER = ['caseback', 'rotor', 'chrono', 'bridges', 'balance', 'train', 'plate', 'dialworks', 'case', 'dial', 'hands', 'bezel', 'crystal'];
// gap in front of each layer (watch units, 1 = 10 mm); the stack is centred on the head, which first lifts off the strap
const GAP = { caseback: 0, rotor: 1.45, chrono: 1.3, bridges: 1.25, balance: 1.0, train: 0.9, plate: 1.15, dialworks: 1.05, case: 1.45, dial: 1.5, hands: 1.0, bezel: 1.2, crystal: 1.0 };
const OFFSET = {}; { let z = 0; for (const l of ORDER) { z += GAP[l]; OFFSET[l] = z; } const mid = (OFFSET.case + OFFSET.caseback) / 2 + 0.6; for (const l of ORDER) OFFSET[l] -= mid; }
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const smooth = t => t * t * (3 - 2 * t);
const clamp01 = t => Math.min(1, Math.max(0, t));

export async function createWatchViewer({ host, base, reduce = false, onReady, onState, onTouched, onLabel }) {
  const coarse = matchMedia('(pointer: coarse)').matches;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-label', 'Interactive 3D model of the SABERTOOTH concept chronograph');
  canvas.setAttribute('role', 'img');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, 1, 0.05, 400);
  const controls = new OrbitControls(camera, canvas);
  canvas.style.touchAction = 'pan-y';          // vertical swipes still scroll the page on a phone
  controls.enableDamping = true; controls.dampingFactor = 0.09;
  controls.enablePan = false;
  controls.minPolarAngle = THREE.MathUtils.degToRad(20); controls.maxPolarAngle = THREE.MathUtils.degToRad(100);
  controls.rotateSpeed = 0.8; controls.zoomSpeed = 0.9;
  controls.autoRotate = false; controls.autoRotateSpeed = 22 / 12 * 2;   // 22 degrees a second, after 2.5 s idle
  let autoSpin = !reduce;   // off while exploded: the stack reads best from the angle it was framed for

  const ktx2 = new KTX2Loader().setTranscoderPath('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/basis/').detectSupport(renderer);
  const loader = new GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const [hdr, gltf] = await Promise.all([
    new RGBELoader().loadAsync(base + 'studio.hdr'),
    loader.loadAsync(base + 'sabertooth-chronograph.glb'),
  ]);
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = pmrem.fromEquirectangular(hdr).texture;
  hdr.dispose();
  scene.add(gltf.scene);
  const root = gltf.scene.getObjectByName('watch_root');
  // sapphire: thin clear glass (transparent + strong reflections) instead of transmission, which samples the empty
  // transparent backdrop once the crystal flies clear and turns it into a frosted white plate (review r1)
  gltf.scene.traverse(o => {
    if (!o.isMesh || !o.material || o.material.name !== 'sapphire') return;
    o.material = new THREE.MeshPhysicalMaterial({ name: 'sapphire', color: 0xd6e2ff, metalness: 0, roughness: 0.04,
      transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 2.6,
      clearcoat: 1, clearcoatRoughness: 0.03, specularIntensity: 1, ior: 1.77 });
    o.renderOrder = 2;
    // review r2: a thin bright bevel round the edge so the glass reads as a part when it flies clear
    o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox, sz = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
    const r = Math.max(sz.x, sz.z) / 2;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.995, r * 0.012, 8, 96),
      new THREE.MeshPhysicalMaterial({ color: 0xeef4ff, metalness: 0.2, roughness: 0.08, transparent: true, opacity: 0.55, envMapIntensity: 2.4, emissive: 0x9fc6ff, emissiveIntensity: 0.12 }));
    rim.rotation.x = Math.PI / 2; rim.position.copy(c); rim.renderOrder = 3; o.add(rim);
  });

  // soft contact shadow on the floor under the stand (model-viewer's shadow-intensity 0.8 look)
  const bbox0 = new THREE.Box3().setFromObject(gltf.scene);
  { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 8, 64, 64, 64); gr.addColorStop(0, 'rgba(0,0,0,.75)'); gr.addColorStop(0.55, 'rgba(0,0,0,.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const s = (bbox0.max.x - bbox0.min.x) * 1.5;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, toneMapped: false }));
    m.rotation.x = -Math.PI / 2; m.position.set((bbox0.min.x + bbox0.max.x) / 2, bbox0.min.y + 0.002, (bbox0.min.z + bbox0.max.z) / 2); m.renderOrder = -1;
    scene.add(m); }

  // ---------------------------------------------------------------- parts
  const parts = new Map();
  const addParts = (r) => r.traverse(o => {
    const u = o.userData;
    if (!u || !u.part || parts.has(o.name)) return;
    parts.set(o.name, { node: o, pos0: o.position.clone(), q0: o.quaternion.clone(), layer: u.layer, k: u.k, spin: u.spin, u, cur: 0, from: 0, to: 0 });
  });
  addParts(root);
  const P = n => parts.get('P_' + n);
  // watchmaker's finishing as a shader (the procedural meshes have no UVs): 1 = Côtes de Genève (curved brushed
  // stripes), 2 = perlage (overlapping circular grains). Works in object space on the dial plane (glTF x, z),
  // and fades to the average tone where a stripe gets smaller than a pixel, so the overview doesn't shimmer.
  function finish(m, kind) {
    m.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vFinPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFinPos = position;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vFinPos;
float finPattern() {
  vec2 p = vFinPos.xz;
  ${kind === 1 ? `
  float P = 0.42, u = length(p - vec2(1.2, 9.0)) / P;
  float f = fract(u), band = 0.5 + 0.5 * cos(6.2831853 * f);
  band += 0.35 * smoothstep(0.05, 0.0, f);   // the fine line where two stripes meet
  float aa = clamp(fwidth(u) * 1.6, 0.0, 1.0);` : `
  // perlage: overlapping circles on a staggered grid, each later circle covering the earlier ones,
  // each one a radial swirl of grain with a fine rim where it overlaps its neighbour
  float S = 0.045; vec2 q = p / S; vec2 cell = floor(q);   // review r3: 40-50 circles across the plate
  float best = -1e9; vec2 bl = vec2(0.0);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 cc = cell + vec2(float(i), float(j));
    vec2 ctr = cc + vec2(0.5 + 0.5 * mod(cc.y, 2.0), 0.5);
    vec2 l = q - ctr; float order = cc.y * 64.0 + cc.x;
    if (length(l) < 0.78 && order > best) { best = order; bl = l; }
  }
  float d = length(bl) / 0.78, ang = atan(bl.y, bl.x);
  float band = 0.5 + 0.5 * cos(2.0 * ang + d * 5.0);
  band = mix(band, 0.9, smoothstep(0.86, 1.0, d));
  float aa = clamp(fwidth(q.x) * 2.2, 0.0, 1.0);`}
  return mix(band, 0.45, aa);
}`).replace('#include <color_fragment>', '#include <color_fragment>\n  float finV = finPattern(); diffuseColor.rgb *= mix(1.15, 0.8, finV);')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor * 0.55, roughnessFactor * 1.25, finV);')
        // the bands catch light like a brushed finish whatever the studio angle (seen from behind the reflections are dark)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n  totalEmissiveRadiance += vec3(0.80, 0.83, 0.88) * ${kind === 1 ? '0.16' : '0.06'} * (1.0 - finV);`);
    };
    m.customProgramCacheKey = () => 'finish' + kind;
    m.needsUpdate = true;
  }
  let movementReady = false, movementLoading = null, movementGroup = [];
  function loadMovement() {
    if (movementLoading) return movementLoading;
    movementLoading = loader.loadAsync(base + 'sabertooth-movement.glb').then(g => {
      const mr = g.scene.getObjectByName('watch_root');
      const kids = [...mr.children];
      for (const k of kids) { root.add(k); movementGroup.push(k); k.visible = exploded || animating; }
      addParts(root);
      // look pass for the movement metals (seen from behind, away from the studio softboxes, pure mirrors go black)
      const LOOK = {
        movement_rhodium: { color: 0xd9dce2, metalness: 0.85, roughness: 0.3, env: 2.3 },
        movement_rhodium_polished: { metalness: 0.85, roughness: 0.28, env: 1.7 },
        movement_plate: { color: 0xb4b8bf, metalness: 0.75, roughness: 0.42, env: 2.2 },
        movement_gilt: { roughness: 0.3, env: 1.8 },
        movement_brass_dark: { roughness: 0.4, env: 1.5 },
        movement_steel: { roughness: 0.32, env: 1.8 },
        steel_blued: { color: 0x1d4fd8, metalness: 0.85, roughness: 0.28, env: 1.8 },
        ruby: { color: 0xb3102a, emissive: 0x240208, metalness: 0, roughness: 0.03, env: 2.8, coat: 1 },
      };
      movementGroup.forEach(k => k.traverse(o => { if (!o.isMesh) return; const m = o.material, L = LOOK[m.name]; if (!L || m.userData.looked) return; m.userData.looked = true;
        if (L.color !== undefined) m.color.setHex(L.color); if (L.metalness !== undefined) m.metalness = L.metalness; if (L.roughness !== undefined) m.roughness = L.roughness;
        if (L.emissive !== undefined) { m.emissive.setHex(L.emissive); m.emissiveIntensity = 1; } m.envMapIntensity = L.env;
        if (L.coat && 'clearcoat' in m) { m.clearcoat = L.coat; m.clearcoatRoughness = 0.02; }
        if (m.name === 'movement_rhodium') finish(m, 1);   // review r2: Côtes de Genève on the bridges
        if (m.name === 'movement_plate') finish(m, 2);     // and perlage on the main plate
      }));
      movementReady = true;
    });
    return movementLoading;
  }

  // ---------------------------------------------------------------- camera framing
  const center = new THREE.Vector3(), size = new THREE.Vector3();
  const home = { theta: THREE.MathUtils.degToRad(-18), phi: THREE.MathUtils.degToRad(82) };
  function fitDistance(box, theta, phi) {
    // distance at which the box fits the view (vertical fov, current aspect), checked on the 8 corners
    const dir = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
    const c = box.getCenter(new THREE.Vector3());
    const fwd = dir.clone().negate(), up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(fwd, up).normalize(); const upv = new THREE.Vector3().crossVectors(right, fwd);
    const tv = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2), th = tv * camera.aspect;
    let d = 0;
    for (let i = 0; i < 8; i++) {
      const p = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(c);
      const x = Math.abs(p.dot(right)), y = Math.abs(p.dot(upv)), z = p.dot(dir);
      d = Math.max(d, z + x / th, z + y / tv);
    }
    return { d: d * 1.04, c };
  }
  const homeBox = new THREE.Box3().setFromObject(gltf.scene);
  let view = { target: new THREE.Vector3(), theta: home.theta, phi: home.phi, dist: 10 };
  function explodedBox(withBase = false) {
    // every part at its exploded position (computed, not rendered); the strap and stand only when asked
    const b = new THREE.Box3();
    const tmp = new THREE.Box3();
    for (const p of parts.values()) {
      if (p.layer === 'base' && !(withBase && p.node.name === 'P_strap')) continue;
      const save = p.node.position.clone();
      p.node.position.copy(explodedPos(p));
      p.node.updateMatrixWorld(true);
      tmp.setFromObject(p.node); b.union(tmp);
      p.node.position.copy(save); p.node.updateMatrixWorld(true);
    }
    return b;
  }
  function viewFor(state) {
    if (state === 'exploded') {
      const portrait = camera.aspect < 1;
      const theta = THREE.MathUtils.degToRad(portrait ? -150 : -128), phi = THREE.MathUtils.degToRad(portrait ? 54 : 64);   // behind-left: the bridges, jewels and balance face you
      const f = fitDistance(explodedBox(true), theta, phi);   // review r2/r3: the strap ends above the buttons
      return { target: f.c, theta, phi, dist: f.d * (portrait ? 0.98 : 0.92) };
    }
    const f = fitDistance(homeBox, home.theta, home.phi);
    return { target: f.c, theta: home.theta, phi: home.phi, dist: f.d * 0.98 };
  }
  function applyView(v) {
    controls.target.copy(v.target);
    camera.position.copy(v.target).add(new THREE.Vector3().setFromSphericalCoords(v.dist, v.phi, v.theta));
    camera.lookAt(v.target);
  }
  let camTween = null;
  function flyTo(v, dur = 1.6, hump = false) {
    const s = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    let dTheta = v.theta - s.theta; dTheta = Math.atan2(Math.sin(dTheta), Math.cos(dTheta));
    camTween = { t: 0, dur: reduce ? 0.01 : dur, from: { target: controls.target.clone(), theta: s.theta, phi: s.phi, dist: s.radius }, to: { ...v, theta: s.theta + dTheta }, hump: 0 };
    if (hump) {   // halfway round, the camera sees the stack side-on: back off enough to keep all of it in frame (review r1)
      const mid = fitDistance(explodedBox(), s.theta + dTheta / 2, (s.phi + v.phi) / 2).d * 1.2;
      camTween.hump = Math.max(0, mid - (s.radius + v.dist) / 2);
    }
    controls.minDistance = 0; controls.maxDistance = Infinity;
  }
  function setZoomLimits(v) { controls.minDistance = v.dist * 0.32; controls.maxDistance = v.dist * 1.25; }

  function resize() {
    // the canvas fills the whole stage (no hard cut line above the buttons); framing uses the area above the
    // control bar (data-pad, in rem) and the projection simply runs on underneath it
    const w = host.clientWidth || 1, h = host.clientHeight || 1;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize || 16);
    const pad = Math.min(h * 0.3, (parseFloat(host.dataset.pad) || 0) * rem), padT = Math.min(h * 0.2, (parseFloat(host.dataset.padTop) || 0) * rem);
    renderer.setSize(w, h, false); canvas.style.width = '100%'; canvas.style.height = '100%';
    camera.aspect = w / (h - pad - padT);
    if (pad + padT > 0) camera.setViewOffset(w, h - pad - padT, 0, -padT, w, h); else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }
  resize();
  view = viewFor('home'); applyView(view); setZoomLimits(view);
  new ResizeObserver(() => { resize(); if (!camTween && !touched) { view = viewFor(exploded ? 'exploded' : 'home'); applyView(view); setZoomLimits(view); } }).observe(host);

  // ---------------------------------------------------------------- explode / reassemble
  let lifted = false, exploded = false, animating = false, explodeT = 0, explodeFrom = 0, explodeTo = 0, explodeClock = 0;
  const local = new THREE.Vector3();
  // the head lifts straight up until its exploded stack clears the strap and cushion by a small margin
  const liftLocal = new THREE.Vector3(), upLocal = new THREE.Vector3();
  { root.updateMatrixWorld(true); const q = root.getWorldQuaternion(new THREE.Quaternion()).invert(); upLocal.set(0, 1, 0).applyQuaternion(q); }
  function computeLift() {
    liftLocal.set(0, 0, 0);
    const base = new THREE.Box3(), stack = new THREE.Box3(), tmp = new THREE.Box3();
    for (const p of parts.values()) {
      const save = p.node.position.clone();
      p.node.position.copy(explodedPos(p)); p.node.updateMatrixWorld(true);
      tmp.setFromObject(p.node);
      (p.layer === 'base' ? base : stack).union(tmp);
      p.node.position.copy(save); p.node.updateMatrixWorld(true);
    }
    liftLocal.copy(upLocal).multiplyScalar(Math.max(0, base.max.y + 0.35 - stack.min.y));
  }
  function explodedPos(p) {
    const v = p.pos0.clone();
    if (p.layer === 'base' || !p.layer) return v;
    v.add(liftLocal);
    if (p.layer === 'keyless') { v.x += 2.4; v.y += OFFSET.dialworks; return v; }
    if (OFFSET[p.layer] !== undefined) v.y += OFFSET[p.layer] + (p.u.sub || 0) * 0.3;
    return v;
  }
  function layerDelay(p, out) {
    let i = ORDER.indexOf(p.layer); if (p.layer === 'keyless') i = ORDER.indexOf('dialworks'); if (i < 0) return 0;
    return (out ? (ORDER.length - 1 - i) : i) * (reduce ? 0 : 0.055);
  }
  const DUR = reduce ? 0.25 : 1.35;
  async function setExploded(on) {
    if (on === exploded && !animating) return;
    if (on && !movementReady) { onState && onState('loading'); await loadMovement(); }
    if (on && !lifted) { computeLift(); lifted = true; }
    exploded = on; animating = true; explodeClock = 0; armSpin();
    for (const n of movementGroup) n.visible = true;
    for (const p of parts.values()) { p.from = p.cur; p.to = on ? 1 : 0; p.delay = layerDelay(p, on); }
    onState && onState(on ? 'exploded' : 'assembled');
    const v = viewFor(on ? 'exploded' : 'home');
    flyTo(v, on ? 2.6 : 2.8, true); view = v;
    touched = false;
    if (on && !chrono.everStarted) setTimeout(() => press('start'), reduce ? 0 : 1500);
  }
  const pressOff = new Map();   // part -> pusher press depth
  function stepExplode(dt) {
    if (animating) explodeClock += dt;
    let done = true;
    for (const p of parts.values()) {
      if (animating) {
        const t = clamp01((explodeClock - p.delay) / DUR);
        if (t < 1) done = false;
        p.cur = p.from + (p.to - p.from) * ease(t);
      }
      p.node.position.lerpVectors(p.pos0, explodedPos(p), p.cur);
      const d = pressOff.get(p);
      if (d) { const dir = p.u.dir || [1, 0, 0]; local.set(dir[0], dir[2], -dir[1]); p.node.position.addScaledVector(local, -d); }
    }
    if (animating && done) {
      animating = false;
      if (!exploded) for (const n of movementGroup) n.visible = false;
    }
  }

  // ---------------------------------------------------------------- the running movement
  let speed = 1, tw = 0;   // watch time, seconds
  const BEATS = 8, AMP = THREE.MathUtils.degToRad(270), LIFT = THREE.MathUtils.degToRad(50);
  const W_IMP = Math.asin(LIFT / AMP) / Math.PI;
  const chrono = { running: false, everStarted: false, E: 0, lastE: 0, min: 12, hour: 4.5, flyFrom: null, flyT: 0, clutch: 0, hammer: 0, column: 0, columnTo: 0 };
  const yAxis = new THREE.Vector3(0, 1, 0), qd = new THREE.Quaternion();
  function turn(p, a) { if (!p) return; qd.setFromAxisAngle(yAxis, a); p.node.quaternion.copy(p.q0).multiply(qd); }
  const presses = [];
  function press(which) {
    const pp = P(which === 'start' ? 'pusher_start' : 'pusher_reset');
    presses.push({ p: pp, t: 0 });
    if (which === 'start') {
      chrono.running = !chrono.running; chrono.everStarted = true; chrono.columnTo += TAU / 12;
    } else if (!chrono.running) {
      chrono.flyFrom = { E: chrono.E, min: chrono.min, hour: chrono.hour }; chrono.flyT = 0; chrono.columnTo += TAU / 12;
    }
  }
  function stepMovement(dt) {
    tw += dt * speed;
    const u = tw * BEATS;
    const theta = AMP * Math.sin(Math.PI * u);
    const kk = Math.floor(u - W_IMP) + 1;
    const pr = smooth(clamp01((u - kk + W_IMP) / (2 * W_IMP)));
    const E = (kk - 1 + pr) * TAU / 40;
    const sgn = k => (k % 2 === 0 ? 1 : -1);
    const fork = sgn(kk - 1) + (sgn(kk) - sgn(kk - 1)) * pr;
    const dE = E - (chrono.lastE ?? E); chrono.lastE = E;
    if (chrono.running) {
      chrono.E += dE;
      const secs = dt * speed; chrono.hour = (chrono.hour + secs / 3600) % 12;
    }
    // chronograph seconds: one turn of the chrono wheel = one minute; count full turns into the 30-minute counter
    const kc = P('chrono_wheel')?.k ?? P('hand_chrono')?.k ?? -1 / 12;
    const chronoTurns = Math.abs(kc * chrono.E) / TAU;
    if (chrono.running && chrono._turns !== undefined && Math.floor(chronoTurns) > Math.floor(chrono._turns)) chrono.min = (chrono.min + 1) % 30;
    chrono._turns = chronoTurns;
    if (chrono.flyFrom) {   // reset: the hammer drops on the heart cams and everything flies back to zero
      chrono.flyT += dt;
      const t = smooth(clamp01((chrono.flyT - 0.08) / 0.16));
      const turnLen = TAU / Math.abs(kc);
      const rem = ((chrono.flyFrom.E % turnLen) + turnLen) % turnLen;
      const back = rem < turnLen / 2 ? -rem : turnLen - rem;
      chrono.E = chrono.flyFrom.E + back * t;
      const m = chrono.flyFrom.min, h = chrono.flyFrom.hour;
      chrono.min = m * (1 - t); chrono.hour = h * (1 - t);
      chrono.hammer = Math.sin(clamp01(chrono.flyT / 0.5) * Math.PI);
      if (chrono.flyT > 0.5) { chrono.flyFrom = null; chrono.E = 0; chrono.min = 0; chrono.hour = 0; chrono._turns = 0; chrono.hammer = 0; }
    }
    chrono.clutch += ((chrono.running ? 1 : 0) - chrono.clutch) * Math.min(1, dt * 14);
    chrono.column += (chrono.columnTo - chrono.column) * Math.min(1, dt * 16);

    for (const p of parts.values()) {
      const s = p.spin;
      if (s === 'balance') turn(p, theta);
      else if (s === 'hairspring') { turn(p, theta * 0.35); const k = 1 + 0.025 * theta / AMP; p.node.scale.set(k, 1, k); }
      else if (s === 'pallet') turn(p, fork * p.u.swing);
      else if (s === 'chrono') turn(p, p.k * chrono.E);
      else if (s === 'counter30') turn(p, -TAU / 30 * (Math.round(chrono.min * 1000) / 1000 - (p.node.name === 'P_hand_c30' ? 12 : 0)));
      else if (s === 'counter12') turn(p, -TAU / 12 * (chrono.hour - (p.node.name === 'P_hand_c12' ? 4.5 : 0)));
      else if (s === 'column') turn(p, chrono.column);
      else if (s === 'clutch') turn(p, chrono.clutch * p.u.swing);
      else if (s === 'hammer') turn(p, chrono.hammer * p.u.swing);
      else if (s === 'oplever') turn(p, presses.some(x => x.p === P('pusher_start')) ? p.u.swing : 0);
      else if (typeof p.k === 'number' && s !== 'pusher') turn(p, p.k * E);
    }
    pressOff.clear();
    for (let i = presses.length - 1; i >= 0; i--) {
      const x = presses[i]; x.t += dt;
      pressOff.set(x.p, Math.sin(clamp01(x.t / 0.22) * Math.PI) * 0.05);
      if (x.t > 0.22) presses.splice(i, 1);
    }
  }

  // ---------------------------------------------------------------- hover / tap labels
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let hoverPart = null, touched = false, lastMove = null, downAt = null;
  const hiMats = new WeakMap();
  function highlight(p, on) {
    if (!p) return;
    p.node.traverse(o => {
      if (!o.isMesh) return;
      if (on) {
        o.userData.mat0 = o.userData.mat0 || o.material;
        let h = hiMats.get(o.userData.mat0);
        if (!h) { h = o.userData.mat0.clone(); h.emissive = new THREE.Color(0x22d3ee); h.emissiveIntensity = 0.12; hiMats.set(o.userData.mat0, h); }
        o.material = h;
      } else if (o.userData.mat0) o.material = o.userData.mat0;
    });
  }
  function pick(cx, cy) {
    const r = canvas.getBoundingClientRect();
    ndc.set((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const shown = [];
    for (const p of parts.values()) { let o = p.node, vis = true; while (o) { if (!o.visible) { vis = false; break; } o = o.parent; } if (vis) shown.push(p.node); }
    const hits = ray.intersectObjects(shown, true);
    for (const h of hits) {
      let o = h.object;
      while (o && !(o.userData && o.userData.part)) o = o.parent;
      if (o) return { p: parts.get(o.name), point: h.point };
    }
    return null;
  }
  function showLabel(hit, cx, cy) {
    const p = hit && hit.p;
    if (p !== hoverPart) { highlight(hoverPart, false); highlight(p, true); hoverPart = p; }
    if (!p) { onLabel && onLabel(null); return; }
    const r = canvas.getBoundingClientRect();
    onLabel && onLabel({ name: p.u.part, desc: p.u.desc, x: cx - r.left, y: cy - r.top, w: r.width, h: r.height });
  }
  canvas.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' && !e.buttons) lastMove = e; });
  canvas.addEventListener('pointerleave', e => { if (e.pointerType !== 'mouse') return; lastMove = null; showLabel(null); });
  canvas.addEventListener('pointerdown', e => { downAt = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  canvas.addEventListener('pointerup', e => {
    if (!downAt) return;
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y), dtp = performance.now() - downAt.t; downAt = null;
    if (moved > 7 || dtp > 450) return;
    const hit = pick(e.clientX, e.clientY);
    if (hit && hit.p.node.name === 'P_pusher_start') press('start');
    if (hit && hit.p.node.name === 'P_pusher_reset') press('reset');
    if (e.pointerType !== 'mouse') { showLabel(hit, e.clientX, e.clientY); clearTimeout(showLabel._t); showLabel._t = setTimeout(() => showLabel(null), 3800); }
  });
  controls.addEventListener('start', () => {
    touched = true; camTween = null; setZoomLimits(view); controls.autoRotate = false; clearTimeout(controls._t);
    onTouched && onTouched();
  });
  const armSpin = () => { clearTimeout(controls._t); controls.autoRotate = false; if (autoSpin) controls._t = setTimeout(() => { controls.autoRotateSpeed = (exploded ? 10 : 22) / 12 * 2; controls.autoRotate = autoSpin; }, exploded ? 5000 : 2500); };
  controls.addEventListener('end', armSpin);
  armSpin();

  // ---------------------------------------------------------------- loop
  let running = true, last = performance.now(), firstFrame = true;
  const clock = () => { const n = performance.now(); const dt = Math.min(0.05, (n - last) / 1000); last = n; return dt; };
  function frame() {
    if (!running) return;
    requestAnimationFrame(frame);
    tick(clock());
  }
  function tick(dt) {
    if (camTween) {
      camTween.t += dt; const u = clamp01(camTween.t / camTween.dur), t = ease(u), a = camTween.from, b = camTween.to;
      const td = b.dist > a.dist ? 1 - Math.pow(1 - u, 3) : u * u * (3 - 2 * u) * u;   // out: pull back early; in: close in late
      const hump = camTween.hump * Math.pow(Math.sin(Math.PI * t), 0.75);
      applyView({ target: a.target.clone().lerp(b.target, t), theta: a.theta + (b.theta - a.theta) * t, phi: a.phi + (b.phi - a.phi) * t, dist: a.dist + (b.dist - a.dist) * td + hump });
      if (camTween.t >= camTween.dur) { camTween = null; setZoomLimits(view); }
    } else controls.update(dt);
    stepMovement(dt);
    stepExplode(dt);
    if (lastMove) { showLabel(pick(lastMove.clientX, lastMove.clientY), lastMove.clientX, lastMove.clientY); lastMove = null; }
    renderer.render(scene, camera);
    if (firstFrame) { firstFrame = false; onReady && onReady(); }
  }
  requestAnimationFrame(frame);
  // prefetch the movement once the page is idle, so Explode is instant
  const idle = window.requestIdleCallback || (f => setTimeout(f, 2500));
  if (!(navigator.connection && navigator.connection.saveData)) setTimeout(() => idle(() => loadMovement(), { timeout: 4000 }), 2500);

  return {
    toggleExplode: () => setExploded(!exploded),
    isExploded: () => exploded,
    setSlow: on => { speed = on ? 0.125 : 1; },
    setAutoSpin: on => { autoSpin = on; armSpin(); },
    reset: () => { touched = false; const v = viewFor(exploded ? 'exploded' : 'home'); view = v; flyTo(v, 0.9); },
    pause: () => { running = false; },
    resume: () => { if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); } },
    press,
    _debug: { parts, camera, controls, setExploded, pick, scene, renderer, get t() { return tw; }, set t(v) { tw = v; }, step: dt => { running = false; tick(dt); } },
  };
}
