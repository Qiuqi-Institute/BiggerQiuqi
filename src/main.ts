import * as THREE from 'three';

// --- Game State ---
let isGameStarted = false;
let score = 0;
let highScore = 0;
let isGameOver = false;
let playerRadius = 1;
const baseCameraHeight = 16;
let currentCameraHeight = baseCameraHeight;

// --- DOM Elements ---
const scoreEl = document.getElementById('score') as HTMLSpanElement;
const scoreBoardEl = document.getElementById('score-board') as HTMLDivElement;
const gameOverEl = document.getElementById('game-over') as HTMLDivElement;
const restartBtn = document.getElementById('restart-btn') as HTMLButtonElement;
const startScreenEl = document.getElementById('start-screen') as HTMLDivElement;
const startBtn = document.getElementById('start-btn') as HTMLButtonElement;
const finalScoreEl = document.getElementById('final-score') as HTMLSpanElement;
const highScoreEl = document.getElementById('high-score') as HTMLSpanElement;

// --- Cookie Helpers ---
function getCookie(name: string): string | null {
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${name}=`));

  return match ? decodeURIComponent(match.split('=')[1]) : null;
}

function setCookie(name: string, value: string, days = 365) {
  const expires = new Date(Date.now() + days * 86400000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

function loadHighScore() {
  const stored = getCookie('biggerqiuqi_high_score');
  highScore = stored ? Number.parseInt(stored, 10) || 0 : 0;
  highScoreEl.innerText = highScore.toString();
}

loadHighScore();

// --- Three.js Setup ---
const container = document.getElementById('app')!;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9dd3ff);

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.05, 3000);
camera.position.set(0, currentCameraHeight, currentCameraHeight * 0.75);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

// --- Lights ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.76);
scene.add(ambientLight);

const hemiLight = new THREE.HemisphereLight(0xeaf7ff, 0x7aae57, 0.96);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.15);
dirLight.position.set(18, 28, 12);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
dirLight.shadow.camera.top = 90;
dirLight.shadow.camera.bottom = -90;
dirLight.shadow.camera.left = -90;
dirLight.shadow.camera.right = 90;
scene.add(dirLight);

// --- Ground ---
function createGroundTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  const base = ctx.createLinearGradient(0, 0, 1024, 1024);
  base.addColorStop(0, '#4e9443');
  base.addColorStop(0.28, '#5da84d');
  base.addColorStop(0.52, '#4b8f40');
  base.addColorStop(0.78, '#5b9c4a');
  base.addColorStop(1, '#4a8a3c');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 1024, 1024);

  for (let i = 0; i < 360; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 1024;
    const r = 120 + Math.random() * 260;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${36 + Math.floor(Math.random() * 18)}, ${88 + Math.floor(Math.random() * 28)}, ${24 + Math.floor(Math.random() * 18)}, 0.10)`);
    g.addColorStop(0.7, 'rgba(0,0,0,0.03)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < 32000; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 1024;
    const len = 2 + Math.random() * 9;
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.25;
    ctx.strokeStyle =
      Math.random() > 0.5
        ? `rgba(${65 + Math.floor(Math.random() * 45)}, ${120 + Math.floor(Math.random() * 70)}, ${35 + Math.floor(Math.random() * 30)}, ${0.08 + Math.random() * 0.12})`
        : `rgba(${30 + Math.floor(Math.random() * 35)}, ${78 + Math.floor(Math.random() * 45)}, ${20 + Math.floor(Math.random() * 22)}, ${0.05 + Math.random() * 0.09})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(220, 220);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const groundTexture = createGroundTexture();
const groundGeo = new THREE.PlaneGeometry(10000, 10000);
const groundMat = new THREE.MeshStandardMaterial({
  map: groundTexture,
  roughness: 1,
  metalness: 0,
  color: 0xffffff,
});
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// --- Foreground Grass Clumps ---
interface GrassPatch {
  mesh: THREE.Group;
}
const grassPatches: GrassPatch[] = [];

function createGrassBladeMaterial() {
  const bladeCanvas = document.createElement('canvas');
  bladeCanvas.width = 48;
  bladeCanvas.height = 160;
  const ctx = bladeCanvas.getContext('2d')!;
  const bladeGradient = ctx.createLinearGradient(24, 160, 24, 0);
  bladeGradient.addColorStop(0, '#325f24');
  bladeGradient.addColorStop(0.45, '#5d9d49');
  bladeGradient.addColorStop(1, '#a7de73');
  ctx.fillStyle = bladeGradient;

  ctx.beginPath();
  ctx.moveTo(24, 156);
  ctx.quadraticCurveTo(6, 110, 15, 18);
  ctx.quadraticCurveTo(23, 6, 31, 18);
  ctx.quadraticCurveTo(42, 110, 24, 156);
  ctx.closePath();
  ctx.fill();

  const tex = new THREE.CanvasTexture(bladeCanvas);
  tex.colorSpace = THREE.SRGBColorSpace;

  return new THREE.MeshStandardMaterial({
    map: tex,
    transparent: true,
    side: THREE.DoubleSide,
    alphaTest: 0.35,
    depthWrite: false,
    roughness: 1,
  });
}

const grassBladeMaterial = createGrassBladeMaterial();

function createGrassPatch(): THREE.Group {
  const patch = new THREE.Group();

  for (let i = 0; i < 16; i++) {
    const blade = new THREE.Mesh(
      new THREE.PlaneGeometry(0.62, 1.9 + Math.random() * 0.85),
      grassBladeMaterial
    );
    blade.position.set((Math.random() - 0.5) * 1.5, 0.68 + Math.random() * 0.3, (Math.random() - 0.5) * 1.5);
    blade.rotation.y = Math.random() * Math.PI;
    blade.rotation.z = (Math.random() - 0.5) * 0.14;
    patch.add(blade);

    const bladeCross = blade.clone();
    bladeCross.rotation.y += Math.PI / 2;
    patch.add(bladeCross);
  }

  return patch;
}

function spawnGrassPatch(x: number, z: number) {
  const mesh = createGrassPatch();
  const scale = 0.92 + Math.random() * 1.1;
  mesh.scale.setScalar(scale);
  mesh.position.set(x, 0.03, z);
  scene.add(mesh);
  grassPatches.push({ mesh });
}

// --- Ground Contact Shadow Helper ---
function createContactShadow(radiusX: number, radiusZ: number, opacity: number) {
  const geo = new THREE.CircleGeometry(1, 40);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.scale.set(radiusX, radiusZ, 1);
  mesh.renderOrder = 1;
  return mesh;
}

// --- Obstacles / Collision ---
interface Obstacle {
  position: THREE.Vector2;
  radius: number;
}
const obstacles: Obstacle[] = [];

function clearObstacles() {
  obstacles.length = 0;
}

function addObstacle(x: number, z: number, radius: number) {
  obstacles.push({
    position: new THREE.Vector2(x, z),
    radius,
  });
}

function resolveObstacleCollision(position: THREE.Vector3, radius: number) {
  const pos2 = new THREE.Vector2(position.x, position.z);

  for (const obstacle of obstacles) {
    const diff = pos2.clone().sub(obstacle.position);
    const minDist = radius + obstacle.radius;
    const distSq = diff.lengthSq();

    if (distSq < minDist * minDist) {
      if (distSq < 0.0001) {
        diff.set(1, 0);
      } else {
        diff.normalize();
      }

      const corrected = obstacle.position.clone().add(diff.multiplyScalar(minDist));
      position.x = corrected.x;
      position.z = corrected.y;
      pos2.copy(corrected);
    }
  }
}

// --- Player (Qiuqi) ---
let playerRoot: THREE.Group;
let playerMesh: THREE.Mesh;
let playerShadowMesh: THREE.Mesh;
let playerAuraMesh: THREE.Mesh;
const targetPosition = new THREE.Vector3(0, 0, 0);

const textureLoader = new THREE.TextureLoader();
textureLoader.load('/Qiuqi.webp', (texture) => {
  texture.colorSpace = THREE.SRGBColorSpace;

  playerRoot = new THREE.Group();

  playerShadowMesh = createContactShadow(1.14, 1.14, 0.18);
  playerShadowMesh.position.y = 0.02;
  playerRoot.add(playerShadowMesh);

  const auraGeo = new THREE.RingGeometry(1.02, 1.24, 64);
  const auraMat = new THREE.MeshBasicMaterial({
    color: 0xff7cc8,
    transparent: true,
    opacity: 0.62,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  playerAuraMesh = new THREE.Mesh(auraGeo, auraMat);
  playerAuraMesh.rotation.x = -Math.PI / 2;
  playerAuraMesh.position.y = 0.028;
  playerAuraMesh.renderOrder = 2;
  playerRoot.add(playerAuraMesh);

  const geometry = new THREE.CircleGeometry(1, 64);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    alphaTest: 0.08,
  });

  playerMesh = new THREE.Mesh(geometry, material);
  playerMesh.rotation.x = -Math.PI / 2;
  playerMesh.position.y = 0.032;
  playerMesh.renderOrder = 3;
  playerRoot.add(playerMesh);

  playerRoot.position.set(0, 0, 0);
  scene.add(playerRoot);
});

// --- Mouse Interaction ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

window.addEventListener('mousemove', (event) => {
  if (isGameOver) return;

  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  raycaster.ray.intersectPlane(groundPlane, targetPosition);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Environment Objects (Trees, Rocks) ---
interface EnvObject {
  mesh: THREE.Object3D;
}
let envObjects: EnvObject[] = [];

function createTree(): THREE.Group {
  const tree = new THREE.Group();

  const groundShadow = createContactShadow(1.4, 1.15, 0.12);
  groundShadow.position.y = 0.02;
  tree.add(groundShadow);

  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 1 });
  const leavesMat = new THREE.MeshStandardMaterial({ color: 0x469948, roughness: 1 });

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 2.8, 12), trunkMat);
  trunk.position.y = 1.55;
  trunk.castShadow = true;
  tree.add(trunk);

  const leaves1 = new THREE.Mesh(new THREE.SphereGeometry(1.8, 12, 12), leavesMat);
  leaves1.position.set(0, 3.55, 0);
  leaves1.scale.set(1.25, 0.95, 1.2);
  leaves1.castShadow = true;
  tree.add(leaves1);

  const leaves2 = new THREE.Mesh(new THREE.SphereGeometry(1.22, 12, 12), leavesMat);
  leaves2.position.set(0.4, 4.25, 0.15);
  leaves2.castShadow = true;
  tree.add(leaves2);

  return tree;
}

function createRock(): THREE.Group {
  const group = new THREE.Group();
  const shadow = createContactShadow(1.25, 0.95, 0.11);
  shadow.position.y = 0.02;
  group.add(shadow);

  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8c8c8c, roughness: 0.98 });
  const rockGeo = new THREE.DodecahedronGeometry(1 + Math.random() * 0.8, 0);
  const rock = new THREE.Mesh(rockGeo, rockMat);
  rock.position.y = 0.95;
  rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
  rock.scale.set(1.25, 0.78 + Math.random() * 0.35, 1 + Math.random() * 0.5);
  rock.castShadow = true;
  group.add(rock);

  return group;
}

function spawnEnvironmentObject(x: number, z: number) {
  const isTree = Math.random() > 0.32;
  const obj = isTree ? createTree() : createRock();
  const scale = 0.75 + Math.random() * 1.4;
  obj.scale.multiplyScalar(scale);
  obj.position.set(x, 0, z);
  scene.add(obj);
  envObjects.push({ mesh: obj });

  addObstacle(x, z, isTree ? 1.1 * scale : 1.0 * scale);
}

// --- Pigs ---
interface PigParts {
  root: THREE.Group;
  body: THREE.Mesh;
  head: THREE.Mesh;
  legs: THREE.Mesh[];
  tail: THREE.Mesh;
  cheeks: THREE.Mesh[];
  pupils: THREE.Mesh[];
}

interface PigData {
  mesh: THREE.Group;
  radius: number;
  walkCycle: number;
  parts: PigParts;
  warningIntensity: number;
  baseSkin: THREE.Color;
}

let pigs: PigData[] = [];

function createPigMesh(radius: number): PigParts {
  const root = new THREE.Group();

  const skinMat = new THREE.MeshStandardMaterial({ color: 0xf8c6cf, roughness: 0.96 });
  const skinDarkMat = new THREE.MeshStandardMaterial({ color: 0xf0a2b1, roughness: 0.95 });
  const blushMat = new THREE.MeshStandardMaterial({ color: 0xff8fa3, roughness: 0.95 });
  const hoofMat = new THREE.MeshStandardMaterial({ color: 0x70585d, roughness: 1 });
  const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.5 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(radius, 28, 28), skinMat);
  body.scale.set(1.52, 1.06, 1.84);
  body.position.y = radius * 1.14;
  body.castShadow = true;
  root.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.82, 28, 28), skinMat);
  head.scale.set(1.2, 1.1, 1.18);
  head.position.set(0, radius * 1.26, radius * 1.95);
  head.castShadow = true;
  root.add(head);

  const snout = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.25, radius * 0.36, radius * 0.56, 24),
    skinDarkMat
  );
  snout.rotation.x = Math.PI / 2;
  snout.position.set(0, radius * 1.12, radius * 2.73);
  snout.castShadow = true;
  root.add(snout);

  const noseHoleGeo = new THREE.SphereGeometry(radius * 0.055, 10, 10);
  const noseLeft = new THREE.Mesh(noseHoleGeo, hoofMat);
  noseLeft.position.set(-radius * 0.12, radius * 1.12, radius * 2.98);
  const noseRight = noseLeft.clone();
  noseRight.position.x = radius * 0.12;
  root.add(noseLeft, noseRight);

  const earGeo = new THREE.ConeGeometry(radius * 0.17, radius * 0.34, 12);
  const leftEar = new THREE.Mesh(earGeo, skinMat);
  leftEar.position.set(-radius * 0.44, radius * 2.08, radius * 1.82);
  leftEar.rotation.z = Math.PI / 9;
  leftEar.rotation.x = -Math.PI / 8;
  leftEar.castShadow = true;

  const rightEar = new THREE.Mesh(earGeo, skinMat);
  rightEar.position.set(radius * 0.44, radius * 2.08, radius * 1.82);
  rightEar.rotation.z = -Math.PI / 9;
  rightEar.rotation.x = -Math.PI / 8;
  rightEar.castShadow = true;
  root.add(leftEar, rightEar);

  const eyeWhiteGeo = new THREE.SphereGeometry(radius * 0.13, 14, 14);
  const leftEyeWhite = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
  leftEyeWhite.scale.set(1.2, 1.05, 0.75);
  leftEyeWhite.position.set(-radius * 0.31, radius * 1.4, radius * 2.45);

  const rightEyeWhite = leftEyeWhite.clone();
  rightEyeWhite.position.x = radius * 0.31;
  root.add(leftEyeWhite, rightEyeWhite);

  const pupilGeo = new THREE.SphereGeometry(radius * 0.065, 12, 12);
  const leftPupil = new THREE.Mesh(pupilGeo, eyeMat);
  leftPupil.position.set(-radius * 0.31, radius * 1.38, radius * 2.59);
  const rightPupil = leftPupil.clone();
  rightPupil.position.x = radius * 0.31;
  root.add(leftPupil, rightPupil);

  const cheekGeo = new THREE.SphereGeometry(radius * 0.125, 12, 12);
  const leftCheek = new THREE.Mesh(cheekGeo, blushMat);
  leftCheek.scale.set(1.15, 0.82, 0.62);
  leftCheek.position.set(-radius * 0.46, radius * 1.02, radius * 2.52);
  const rightCheek = leftCheek.clone();
  rightCheek.position.x = radius * 0.46;
  root.add(leftCheek, rightCheek);

  const legGeo = new THREE.CylinderGeometry(radius * 0.14, radius * 0.16, radius * 0.88, 12);
  const legs: THREE.Mesh[] = [];
  const legOffsets: Array<[number, number]> = [
    [-radius * 0.56, radius * 0.92],
    [radius * 0.56, radius * 0.92],
    [-radius * 0.56, -radius * 0.9],
    [radius * 0.56, -radius * 0.9],
  ];

  legOffsets.forEach(([x, z]) => {
    const leg = new THREE.Mesh(legGeo, skinDarkMat);
    leg.position.set(x, radius * 0.34, z);
    leg.castShadow = true;
    root.add(leg);

    const hoof = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.145, radius * 0.165, radius * 0.14, 12),
      hoofMat
    );
    hoof.position.set(x, radius * -0.03, z);
    hoof.castShadow = true;
    root.add(hoof);

    legs.push(leg);
  });

  const tail = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 0.18, radius * 0.038, 8, 20, Math.PI * 1.55),
    skinDarkMat
  );
  tail.position.set(0, radius * 1.18, -radius * 1.75);
  tail.rotation.x = Math.PI / 2.5;
  tail.castShadow = true;
  root.add(tail);

  return {
    root,
    body,
    head,
    legs,
    tail,
    cheeks: [leftCheek, rightCheek],
    pupils: [leftPupil, rightPupil],
  };
}

function spawnPig() {
  if (!playerRoot) return;

  const isEdible = Math.random() < 0.72;
  const pigRadius = isEdible
    ? playerRadius * (0.34 + Math.random() * 0.56)
    : playerRadius * (1.08 + Math.random() * 0.52);

  const pigParts = createPigMesh(pigRadius);
  const pigMesh = pigParts.root;

  const angle = Math.random() * Math.PI * 2;
  const distance = currentCameraHeight * 1.7 + Math.random() * 15;

  pigMesh.position.x = playerRoot.position.x + Math.cos(angle) * distance;
  pigMesh.position.z = playerRoot.position.z + Math.sin(angle) * distance;
  pigMesh.lookAt(playerRoot.position.x, pigMesh.position.y, playerRoot.position.z);

  scene.add(pigMesh);
  pigs.push({
    mesh: pigMesh,
    radius: pigRadius,
    walkCycle: Math.random() * Math.PI * 2,
    parts: pigParts,
    warningIntensity: 0,
    baseSkin: new THREE.Color(0xf8c6cf),
  });
}

// --- Game Logic ---
function updateHighScoreUI() {
  finalScoreEl.innerText = score.toString();
  highScoreEl.innerText = highScore.toString();
}

function startGame() {
  isGameStarted = true;
  startScreenEl.classList.add('hidden');
  scoreBoardEl.classList.remove('hidden');
  resetGame();
}

startBtn.addEventListener('click', startGame);

function resetGame() {
  score = 0;
  playerRadius = 1;
  currentCameraHeight = baseCameraHeight;
  isGameOver = false;

  scoreEl.innerText = score.toString();
  updateHighScoreUI();
  gameOverEl.classList.add('hidden');
  clearObstacles();

  if (playerRoot && playerMesh && playerShadowMesh && playerAuraMesh) {
    playerRoot.position.set(0, 0, 0);
    playerMesh.scale.set(1, 1, 1);
    playerShadowMesh.scale.set(1, 1, 1);
    playerAuraMesh.scale.set(1, 1, 1);
    targetPosition.set(0, 0, 0);
  }

  pigs.forEach((p) => scene.remove(p.mesh));
  pigs = [];
  envObjects.forEach((e) => scene.remove(e.mesh));
  envObjects = [];
  grassPatches.forEach((g) => scene.remove(g.mesh));
  grassPatches.length = 0;

  for (let i = 0; i < 18; i++) spawnPig();

  for (let i = 0; i < 34; i++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = 12 + Math.random() * 58;
    spawnEnvironmentObject(Math.cos(angle) * distance, Math.sin(angle) * distance);
  }

  for (let i = 0; i < 160; i++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = 4 + Math.random() * 55;
    spawnGrassPatch(Math.cos(angle) * distance, Math.sin(angle) * distance);
  }
}

restartBtn.addEventListener('click', resetGame);

// --- Animation Loop ---
const clock = new THREE.Clock();
const cameraTarget = new THREE.Vector3();
const cameraLookAt = new THREE.Vector3();
const smoothForward = new THREE.Vector3(0, 0, 1);

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  const t = clock.getElapsedTime();

  if (playerRoot && playerMesh && playerShadowMesh && playerAuraMesh) {
    const activeTarget =
      isGameStarted && !isGameOver
        ? new THREE.Vector3(targetPosition.x, 0, targetPosition.z)
        : playerRoot.position.clone();

    const distanceToTarget = playerRoot.position.distanceTo(activeTarget);
    const speed = 10 * Math.max(0.52, 1 / Math.sqrt(playerRadius));
    const moveDist = speed * delta;

    if (isGameStarted && !isGameOver) {
      if (distanceToTarget > moveDist) {
        const dir = new THREE.Vector3().subVectors(activeTarget, playerRoot.position).normalize();
        playerRoot.position.add(dir.multiplyScalar(moveDist));
      } else {
        playerRoot.position.copy(activeTarget);
      }

      resolveObstacleCollision(playerRoot.position, playerRadius * 0.82);
    }

    playerShadowMesh.scale.set(playerRadius * 1.03, playerRadius * 1.03, 1);
    playerMesh.scale.set(playerRadius, playerRadius, 1);
    playerAuraMesh.scale.set(playerRadius * 1.04, playerRadius * 1.04, 1);
    (playerAuraMesh.material as THREE.MeshBasicMaterial).opacity = 0.56 + Math.sin(t * 3) * 0.08;

    currentCameraHeight = THREE.MathUtils.lerp(
      currentCameraHeight,
      baseCameraHeight + playerRadius * 5.5,
      2.1 * delta
    );

    const desiredForward =
      isGameStarted && !isGameOver
        ? new THREE.Vector3(
            targetPosition.x - playerRoot.position.x,
            0,
            targetPosition.z - playerRoot.position.z
          )
        : new THREE.Vector3(Math.sin(clock.getElapsedTime() * 0.35), 0, 1);

    if (desiredForward.lengthSq() > 0.01) {
      desiredForward.normalize();
      smoothForward.lerp(desiredForward, Math.min(1, 2.8 * delta));
      smoothForward.normalize();
    }

    cameraTarget.set(
      playerRoot.position.x - smoothForward.x * currentCameraHeight * 0.16,
      currentCameraHeight * 1.12,
      playerRoot.position.z + currentCameraHeight * 0.72 - smoothForward.z * currentCameraHeight * 0.16
    );
    camera.position.lerp(cameraTarget, Math.min(1, 3.4 * delta));

    cameraLookAt.set(
      playerRoot.position.x + smoothForward.x * Math.min(3.2, playerRadius * 0.9),
      0.16,
      playerRoot.position.z + smoothForward.z * Math.min(3.2, playerRadius * 0.9)
    );
    camera.lookAt(cameraLookAt);

    for (let i = pigs.length - 1; i >= 0; i--) {
      const pig = pigs[i];
      const flatPigPos = new THREE.Vector3(pig.mesh.position.x, 0, pig.mesh.position.z);
      const dist = playerRoot.position.distanceTo(flatPigPos);
      const isDangerous = pig.radius > playerRadius;
      const dangerStrength = isDangerous
        ? THREE.MathUtils.clamp(1.1 - dist / (playerRadius * 12 + 12), 0.15, 0.8)
        : 0;

      pig.warningIntensity = THREE.MathUtils.lerp(pig.warningIntensity, dangerStrength, Math.min(1, 4 * delta));
      const pulse = 0.5 + 0.5 * Math.sin(t * 5 + i);

      const warningColor = pig.baseSkin.clone().lerp(new THREE.Color(0xff6b6b), pig.warningIntensity * (0.5 + pulse * 0.35));
      (pig.parts.body.material as THREE.MeshStandardMaterial).color.copy(warningColor);
      (pig.parts.head.material as THREE.MeshStandardMaterial).color.copy(warningColor);

      if (isGameStarted && !isGameOver && dist < playerRadius + pig.radius) {
        if (playerRadius > pig.radius) {
          scene.remove(pig.mesh);
          pigs.splice(i, 1);

          score += Math.floor(pig.radius * 10);
          scoreEl.innerText = score.toString();

          const areaIncrease = Math.PI * Math.pow(pig.radius, 2) * 0.1;
          const currentArea = Math.PI * Math.pow(playerRadius, 2);
          playerRadius = Math.sqrt((currentArea + areaIncrease) / Math.PI);
        } else {
          isGameOver = true;
          if (score > highScore) {
            highScore = score;
            setCookie('biggerqiuqi_high_score', String(highScore));
          }
          updateHighScoreUI();
          gameOverEl.classList.remove('hidden');
        }
      } else {
        const pigTarget =
          isGameStarted && !isGameOver ? playerRoot.position : new THREE.Vector3(0, 0, 0);
        const pigSpeed =
          1.48 * delta * (1 / Math.max(0.75, Math.sqrt(pig.radius))) + 0.08 * delta;
        const dir = new THREE.Vector3().subVectors(pigTarget, pig.mesh.position);
        dir.y = 0;

        if (dir.lengthSq() > 0.001) {
          dir.normalize();
          pig.mesh.position.add(dir.multiplyScalar(pigSpeed));
          resolveObstacleCollision(pig.mesh.position, pig.radius * 0.72);
          pig.mesh.lookAt(pigTarget.x, pig.mesh.position.y + pig.radius * 0.8, pigTarget.z);
        }

        pig.walkCycle += pigSpeed * 8.5 + delta * 1.6;
        const bob = Math.abs(Math.sin(pig.walkCycle)) * pig.radius * 0.05;
        pig.parts.body.position.y = pig.radius * 1.14 + bob;
        pig.parts.head.position.y = pig.radius * 1.24 + bob * 1.05;
        pig.parts.body.rotation.z = Math.sin(pig.walkCycle * 0.5) * 0.04;
        pig.parts.head.rotation.z = Math.sin(pig.walkCycle * 0.5 + 0.2) * 0.08;

        pig.parts.legs.forEach((leg, idx) => {
          const phase = idx % 2 === 0 ? 0 : Math.PI;
          leg.rotation.x = Math.sin(pig.walkCycle + phase) * 0.2;
        });

        pig.parts.tail.rotation.z = Math.sin(pig.walkCycle * 1.4) * 0.55;
        pig.parts.cheeks.forEach((cheek) => {
          cheek.scale.y = 0.78 + Math.abs(Math.sin(pig.walkCycle * 0.5)) * 0.08;
        });
        pig.parts.pupils.forEach((pupil, idx) => {
          pupil.position.x =
            (idx === 0 ? -1 : 1) * pig.radius * 0.31 +
            Math.sin(pig.walkCycle * 0.3) * pig.radius * 0.01;
        });
      }
    }

    if (pigs.length < 24 + playerRadius * 2.3) {
      spawnPig();
    }

    for (let i = pigs.length - 1; i >= 0; i--) {
      const pig = pigs[i];
      const dist = playerRoot.position.distanceTo(pig.mesh.position);
      if (dist > currentCameraHeight * 6.6) {
        scene.remove(pig.mesh);
        pigs.splice(i, 1);
      }
    }

    if (envObjects.length < 46) {
      const angle = Math.random() * Math.PI * 2;
      const distance = currentCameraHeight * 2.8 + Math.random() * 42;
      spawnEnvironmentObject(
        playerRoot.position.x + Math.cos(angle) * distance,
        playerRoot.position.z + Math.sin(angle) * distance
      );
    }

    for (let i = envObjects.length - 1; i >= 0; i--) {
      const env = envObjects[i];
      const dist = playerRoot.position.distanceTo(env.mesh.position);
      if (dist > currentCameraHeight * 7.2) {
        scene.remove(env.mesh);
        envObjects.splice(i, 1);
      }
    }

    if (grassPatches.length < 220) {
      const angle = Math.random() * Math.PI * 2;
      const distance = 6 + Math.random() * (currentCameraHeight * 3.0);
      spawnGrassPatch(
        playerRoot.position.x + Math.cos(angle) * distance,
        playerRoot.position.z + Math.sin(angle) * distance
      );
    }

    for (let i = grassPatches.length - 1; i >= 0; i--) {
      const patch = grassPatches[i];
      const dist = playerRoot.position.distanceTo(patch.mesh.position);
      if (dist > currentCameraHeight * 4.4) {
        scene.remove(patch.mesh);
        grassPatches.splice(i, 1);
      }
    }
  }

  renderer.render(scene, camera);
}

resetGame();
animate();