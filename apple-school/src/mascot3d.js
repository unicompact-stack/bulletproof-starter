// 3D-Яблочкин для урока: тот же набор поз, что у плоского героя
// (wave / think / cheer / talk / idle), рот от реальной громкости звука.
// Модель собрана кодом из примитивов three.js; камера неподвижна.
import {
  CapsuleGeometry, CircleGeometry, Color, CylinderGeometry, ExtrudeGeometry, Group, LatheGeometry,
  Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, Shape, SphereGeometry, TorusGeometry, Vector2,
  WebGLRenderer, HemisphereLight, DirectionalLight, PointLight, SRGBColorSpace, ACESFilmicToneMapping,
} from 'three';

const SKIN = 0xfff3d2;
const GREEN = 0x8eb94c;
const GREEN_DARK = 0x6e9c3c;
const LEAF = 0x35795a;
const LEAF_VEIN = 0x76ad68;
const STEM = 0x795738;
const PUPIL = 0x305546;
const BROW = 0x668b3e;
const SCARF = 0xffcb69;
const SCARF_KNOT = 0xed9c43;
const SHOE = 0xf9bf60;
const MOUTH_LINE = 0x7c3b2d;
const MOUTH_INNER = 0x5e241c;
const TONGUE = 0xe2705c;

const PROFILE = [
  [0.02, -1.0], [0.22, -0.95], [0.45, -0.82], [0.66, -0.62], [0.84, -0.36],
  [0.95, -0.1], [1.0, 0.12], [0.97, 0.35], [0.86, 0.55], [0.7, 0.72],
  [0.5, 0.85], [0.33, 0.93], [0.26, 0.97], [0.2, 0.99], [0.1, 1.0],
].map(([r, y]) => new Vector2(r, y));

function leafShape() {
  const shape = new Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(0.14, 0.34, 0.56, 0.46, 0.92, 0.1);
  shape.bezierCurveTo(0.62, -0.16, 0.2, -0.16, 0, 0);
  return shape;
}

export function createMascot3D(host, options = {}) {
  const reduced = options.reducedMotion ?? window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const canvas = document.createElement('canvas');
  canvas.className = 'mascot-3d-canvas';
  const wrap = document.createElement('span');
  wrap.className = 'mascot-3d';
  wrap.setAttribute('role', 'img');
  wrap.setAttribute('aria-label', 'Яблочкин — зелёный яблочный друг');
  wrap.append(canvas);

  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 0.1, 40);
  camera.position.set(0, 0.42, 5.35);
  camera.lookAt(0, 0.28, 0);

  scene.add(new HemisphereLight(0xffffff, 0x86a565, 0.85));
  const key = new DirectionalLight(0xfff4dd, 1.55);
  key.position.set(2.6, 3.6, 3.4);
  scene.add(key);
  const rim = new PointLight(0xcfe8ff, 9, 12);
  rim.position.set(-2.4, 1.2, -2.6);
  scene.add(rim);
  const fill = new DirectionalLight(0xe4f2ff, 0.4);
  fill.position.set(-2.2, 0.8, 2.4);
  scene.add(fill);

  const materials = [];
  const standard = (color, extra = {}) => {
    const material = new MeshStandardMaterial({ color: new Color(color), roughness: 0.6, metalness: 0.02, ...extra });
    materials.push(material);
    return material;
  };

  const root = new Group();
  const body = new Group();
  root.add(body);

  const bodyGeometry = new LatheGeometry(PROFILE, 56);
  const position = bodyGeometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const radius = Math.hypot(x, z);
    if (radius > 0.001) {
      const wobble = 1 + 0.022 * Math.sin(5 * Math.atan2(z, x));
      position.setX(i, x * wobble);
      position.setZ(i, z * wobble);
    }
  }
  for (let i = 0; i < position.count; i += 1) {
    const z = position.getZ(i);
    if (z > 0.45) position.setZ(i, 0.45 + (z - 0.45) * 0.42);
  }
  bodyGeometry.computeVertexNormals();
  const solid = new Mesh(bodyGeometry, standard(GREEN));
  solid.scale.set(1, 1.04, 1);
  body.add(solid);

  const face = new Mesh(new SphereGeometry(0.9, 40, 28), standard(SKIN, { roughness: 0.8 }));
  face.scale.set(0.82, 0.75, 0.35);
  face.position.set(0, 0.12, 0.42);
  body.add(face);

  // Глаза: почти плоские купола, зрачок и блик — без выпуклых шаров.
  const eyes = [];
  const pupils = [];
  const happyArcs = [];
  for (const side of [-1, 1]) {
    const eye = new Group();
    eye.position.set(0.29 * side, 0.28, 0.63);
    const white = new Mesh(new SphereGeometry(0.17, 32, 24), standard(0xffffff, { roughness: 0.32 }));
    white.scale.set(1, 1.18, 0.42);
    const pupil = new Mesh(new SphereGeometry(0.098, 24, 18), standard(PUPIL, { roughness: 0.22 }));
    pupil.scale.set(1, 1.12, 0.42);
    pupil.position.set(-0.012 * side, -0.01, 0.045);
    pupil.userData.side = side;
    const spark = new Mesh(new CircleGeometry(0.03, 16), standard(0xffffff, { roughness: 0.1 }));
    spark.position.set(0.034 * side, 0.05, 0.092);
    const happy = new Mesh(new TorusGeometry(0.115, 0.03, 8, 20, Math.PI), standard(PUPIL, { roughness: 0.4 }));
    happy.position.set(0, 0.01, 0.075);
    happy.visible = false;
    eye.add(white, pupil, spark, happy);
    body.add(eye);
    eyes.push(eye);
    pupils.push(pupil);
    happyArcs.push(happy);
  }

  const brows = [];
  for (const side of [-1, 1]) {
    const brow = new Mesh(new CapsuleGeometry(0.028, 0.16, 4, 10), standard(BROW, { roughness: 0.8 }));
    brow.rotation.set(0.3, 0, Math.PI / 2 + 0.2 * side);
    brow.position.set(0.3 * side, 0.56, 0.615);
    body.add(brow);
    brows.push(brow);
  }

  for (const side of [-1, 1]) {
    const cheek = new Mesh(new SphereGeometry(0.12, 20, 14), standard(0xffb49c, { roughness: 0.9, transparent: true, opacity: 0.35 }));
    cheek.scale.set(1, 0.62, 0.22);
    cheek.position.set(0.5 * side, -0.02, 0.63);
    body.add(cheek);
  }

  // Рот: тонкая улыбка в покое; при речи раскрывается тёмный рот и язычок.
  const mouth = new Group();
  mouth.position.set(0, -0.06, 0.68);
  const smileLine = new Mesh(new TorusGeometry(0.155, 0.026, 10, 24, Math.PI * 1.08), standard(MOUTH_LINE, { roughness: 0.5 }));
  smileLine.rotation.z = Math.PI;
  const inner = new Mesh(new SphereGeometry(0.145, 24, 18), standard(MOUTH_INNER, { roughness: 0.6 }));
  inner.scale.set(1, 0.05, 0.42);
  inner.position.z = -0.012;
  const tongue = new Mesh(new SphereGeometry(0.09, 20, 14), standard(TONGUE, { roughness: 0.65 }));
  tongue.scale.set(1, 0.05, 0.5);
  tongue.position.set(0, -0.05, 0.02);
  mouth.add(smileLine, inner, tongue);
  body.add(mouth);

  // Корона (черенок и лист) — отдельная группа, качается в позе «think».
  const crown = new Group();
  crown.position.set(0, 1.16, 0);
  const stem = new Mesh(new CylinderGeometry(0.062, 0.092, 0.56, 14), standard(STEM, { roughness: 0.95 }));
  stem.position.set(0.02, 0.12, 0);
  stem.rotation.z = -0.16;
  const leaf = new Mesh(
    new ExtrudeGeometry(leafShape(), { depth: 0.05, bevelEnabled: true, bevelThickness: 0.018, bevelSize: 0.018, bevelSegments: 2, curveSegments: 16 }),
    standard(LEAF, { roughness: 0.55 }),
  );
  leaf.scale.setScalar(0.86);
  leaf.rotation.set(0.35, -0.5, 0.42);
  leaf.position.set(0.1, 0.26, 0.02);
  const vein = new Mesh(new CylinderGeometry(0.016, 0.011, 0.6, 8), standard(LEAF_VEIN, { roughness: 0.6 }));
  vein.rotation.set(0.2, 0, 1.34);
  vein.position.set(0.42, 0.26, 0.07);
  crown.add(stem, leaf, vein);
  body.add(crown);

  const scarf = new Mesh(new TorusGeometry(0.6, 0.16, 12, 36), standard(SCARF, { roughness: 0.8 }));
  scarf.rotation.x = Math.PI / 2;
  scarf.position.set(0, -0.66, 0.04);
  body.add(scarf);
  const knot = new Mesh(new SphereGeometry(0.15, 18, 12), standard(SCARF_KNOT, { roughness: 0.8 }));
  knot.position.set(0.42, -0.72, 0.5);
  body.add(knot);

  const arms = [];
  for (const side of [-1, 1]) {
    const arm = new Group();
    arm.position.set(0.8 * side, 0.06, 0.06);
    const upper = new Mesh(new CapsuleGeometry(0.13, 0.42, 6, 14), standard(side < 0 ? GREEN : GREEN_DARK, { roughness: 0.68 }));
    upper.position.set(0.12 * side, -0.26, 0);
    upper.rotation.z = 0.24 * side;
    const hand = new Mesh(new SphereGeometry(0.19, 22, 16), standard(SKIN, { roughness: 0.78 }));
    hand.scale.set(1, 1.05, 0.9);
    hand.position.set(0.24 * side, -0.5, 0.06);
    arm.add(upper, hand);
    arm.rotation.z = 0.3 * side;
    body.add(arm);
    arms.push(arm);
  }

  for (const side of [-1, 1]) {
    const leg = new Mesh(new SphereGeometry(0.2, 18, 12), standard(0x678c36, { roughness: 0.8 }));
    leg.scale.set(1.05, 0.8, 1.2);
    leg.position.set(0.36 * side, -1.06, 0.1);
    const shoe = new Mesh(new SphereGeometry(0.24, 20, 14), standard(SHOE, { roughness: 0.7 }));
    shoe.scale.set(1.15, 0.6, 1.4);
    shoe.position.set(0.36 * side, -1.16, 0.22);
    body.add(leg, shoe);
  }

  root.scale.setScalar(0.86);
  root.position.y = 0.16;
  scene.add(root);

  let pose = 'idle';
  let talking = false;
  let level = 0;
  let blinkAt = 1.6 + Math.random() * 2;
  let blink = 0;
  let frame = null;
  let last = performance.now();
  let disposed = false;

  const resize = () => {
    const width = host.clientWidth || 240;
    const height = host.clientHeight || 256;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);

  const tick = (now) => {
    if (disposed) return;
    frame = requestAnimationFrame(tick);
    const delta = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now / 1000;
    const calm = reduced ? 0 : 1;

    blinkAt -= delta;
    if (blinkAt <= 0) { blink = 1; blinkAt = 2.6 + Math.random() * 3.2; }
    blink = Math.max(0, blink - delta * 7.5);
    const closed = Math.sin(Math.min(1, blink) * Math.PI);
    const cheer = pose === 'cheer';
    for (const eye of eyes) eye.scale.y = cheer ? 0.12 : 1 - 0.92 * closed;
    for (const arc of happyArcs) arc.visible = cheer;

    const open = talking ? Math.max(0, Math.min(1, level)) : 0;
    mouth.scale.y = 0.5 + open * 1.25;
    mouth.scale.x = 1 + open * 0.1;
    inner.scale.y = 0.05 + open * 0.85;
    tongue.scale.y = 0.05 + open * 0.7;

    const breathe = 1 + Math.sin(t * 1.8) * 0.012 * calm;
    body.scale.set(1, breathe, 1);
    body.rotation.y = Math.sin(t * 0.5) * 0.05 * calm;
    root.position.y = 0.16 + Math.sin(t * 1.8) * 0.015 * calm + (cheer ? Math.abs(Math.sin(t * 5)) * 0.1 * calm : 0);

    const swing = Math.sin(t * 3.4) * calm;
    if (pose === 'wave') {
      arms[0].rotation.z = -0.95 - swing * 0.4;
      arms[1].rotation.z = 0.3;
    } else if (cheer) {
      arms[0].rotation.z = -2.45 - swing * 0.15;
      arms[1].rotation.z = 2.45 + swing * 0.15;
    } else if (pose === 'talk') {
      arms[0].rotation.z = -0.42 - open * 0.4;
      arms[1].rotation.z = 0.42 + open * 0.4;
    } else {
      arms[0].rotation.z = 0.3 + swing * 0.03;
      arms[1].rotation.z = 0.3 - swing * 0.03;
    }

    const think = pose === 'think';
    crown.rotation.z = think ? Math.sin(t * 2.4) * 0.14 : Math.sin(t * 0.9) * 0.02 * calm;
    for (const brow of brows) brow.position.y = 0.56 + (think || cheer ? 0.045 : 0);
    for (const pupil of pupils) {
      const side = pupil.userData.side;
      pupil.position.y = -0.01 + (think ? 0.04 : 0);
      pupil.position.x = -0.012 * side + (think ? 0.03 : 0);
    }

    renderer.render(scene, camera);
  };

  host.innerHTML = '';
  host.append(wrap);
  resize();
  frame = requestAnimationFrame((time) => { last = time; tick(time); });

  const api = {
    kind: '3d',
    setPose(value) { pose = value; },
    setTalking(value) { talking = value; if (!value) level = 0; },
    setLevel(value) { level = value; },
    getPose: () => pose,
    getLevel: () => level,
    dispose() {
      disposed = true;
      if (frame !== null) cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.dispose();
      host.innerHTML = '';
    },
  };
  window.__yablochkin3d = api;
  return api;
}
