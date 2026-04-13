/*
 * Copyright (C) 2026 CzXieDdan
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see &lt;https://www.gnu.org/licenses/&gt;.
 */

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
const startHighScoreEl = document.getElementById('start-high-score-value') as HTMLSpanElement;
const leaderboardListStartEl = document.getElementById('leaderboard-list-start') as HTMLUListElement;
const leaderboardListGameOverEl = document.getElementById('leaderboard-list-gameover') as HTMLUListElement;

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
  if (startHighScoreEl) startHighScoreEl.innerText = highScore.toString();
}

function getBrowserId() {
  const key = 'biggerqiuqi_browser_id';
  const existing = localStorage.getItem(key);
  if (existing) return existing;

  const id = `qiuqi_${crypto.randomUUID()}`;
  localStorage.setItem(key, id);
  return id;
}

const browserId = getBrowserId();

async function fetchPlayerScore() {
  const response = await fetch(`/api/leaderboard/${browserId}`);
  if (!response.ok) return null;
  return response.json();
}

async function fetchLeaderboard() {
  const response = await fetch('/api/leaderboard?limit=10');
  if (!response.ok) return [];
  const data = await response.json();
  return data.leaderboard ?? [];
}

async function submitScore(currentScore: number) {
  const response = await fetch('/api/leaderboard', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      browser_id: browserId,
      score: currentScore,
    }),
  });

  if (!response.ok) return null;
  return response.json();
}

function renderLeaderboardItems(
  target: HTMLUListElement,
  leaderboard: Array<{ browser_id: string; best_score: number }>,
) {
  if (!target) return;

  target.innerHTML = '';

  leaderboard.forEach((entry, index) => {
    const item = document.createElement('li');
    item.innerText = `Rank ${index + 1} - ${entry.best_score} pts`;
    target.appendChild(item);
  });
}

async function refreshLeaderboardUI() {
  const [player, leaderboard] = await Promise.all([fetchPlayerScore(), fetchLeaderboard()]);

  if (player?.best_score != null) {
    highScore = Math.max(highScore, player.best_score);
    highScoreEl.innerText = highScore.toString();
    if (startHighScoreEl) startHighScoreEl.innerText = highScore.toString();
  }

  renderLeaderboardItems(leaderboardListStartEl, leaderboard);
  renderLeaderboardItems(leaderboardListGameOverEl, leaderboard);
}

loadHighScore();

// --- Three.js Setup ---
const container = document.getElementById('app')!;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9dd3ff);

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.3, 3000);
camera.position.set(0, currentCameraHeight, currentCameraHeight * 0.75);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

// --- Lights ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.82);
scene.add(ambientLight);

const hemiLight = new THREE.HemisphereLight(0xeaf7ff, 0x7aae57, 1.02);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.18);
dirLight.position.set(18, 28, 12);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
dirLight.shadow.camera.top = 34;
dirLight.shadow.camera.bottom = -34;
dirLight.shadow.camera.left = -34;
dirLight.shadow.camera.right = 34;
dirLight.shadow.camera.near = 1;
dirLight.shadow.camera.far = 96;
dirLight.shadow.bias = -0.00012;
dirLight.shadow.normalBias = 0.028;
scene.add(dirLight);

const dirLightTarget = new THREE.Object3D();
scene.add(dirLightTarget);
dirLight.target = dirLightTarget;

// --- Shared Helpers ---
const worldUp = new THREE.Vector3(0, 1, 0);
const tempVecA = new THREE.Vector3();
const tempVecB = new THREE.Vector3();
const tempVecC = new THREE.Vector3();
const frustum = new THREE.Frustum();
const projScreenMatrix = new THREE.Matrix4();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function randomRange(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function randomSigned(range: number) {
  return (Math.random() - 0.5) * range * 2;
}

function setObjectVisible(object: THREE.Object3D | null, visible: boolean) {
  if (!object) return;
  object.visible = visible;
}

function updateFrustum() {
  camera.updateMatrixWorld();
  projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(projScreenMatrix);
}

function isSphereVisible(position: THREE.Vector3, radius: number) {
  return frustum.intersectsSphere(new THREE.Sphere(position, radius));
}

function getRadiusScaledDistance(base: number) {
  return base + playerRadius * base * 0.36;
}

// --- Ground ---
function createGroundTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 2048;
  const ctx = canvas.getContext('2d')!;

  const base = ctx.createLinearGradient(0, 0, 2048, 2048);
  base.addColorStop(0, '#4d8f43');
  base.addColorStop(0.2, '#5ea14d');
  base.addColorStop(0.48, '#4e9244');
  base.addColorStop(0.74, '#618f4b');
  base.addColorStop(1, '#477c38');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 2048, 2048);

  for (let i = 0; i < 540; i++) {
    const x = Math.random() * 2048;
    const y = Math.random() * 2048;
    const r = 180 + Math.random() * 420;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const hueShift = Math.random() > 0.5 ? 1 : -1;
    g.addColorStop(
      0,
      `rgba(${48 + hueShift * 10 + Math.floor(Math.random() * 12)}, ${96 + Math.floor(Math.random() * 32)}, ${
        38 + Math.floor(Math.random() * 20)
      }, 0.11)`,
    );
    g.addColorStop(0.7, 'rgba(255,255,180,0.02)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < 36000; i++) {
    const x = Math.random() * 2048;
    const y = Math.random() * 2048;
    const len = 2 + Math.random() * 10;
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.4;
    ctx.strokeStyle =
      Math.random() > 0.48
        ? `rgba(${55 + Math.floor(Math.random() * 36)}, ${120 + Math.floor(Math.random() * 72)}, ${
            35 + Math.floor(Math.random() * 28)
          }, ${0.08 + Math.random() * 0.12})`
        : `rgba(${28 + Math.floor(Math.random() * 22)}, ${75 + Math.floor(Math.random() * 34)}, ${
            22 + Math.floor(Math.random() * 18)
          }, ${0.04 + Math.random() * 0.07})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
    ctx.stroke();
  }

  for (let i = 0; i < 1200; i++) {
    const x = Math.random() * 2048;
    const y = Math.random() * 2048;
    const size = 12 + Math.random() * 28;
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255, 236, 163, 0.028)' : 'rgba(26, 45, 24, 0.032)';
    ctx.beginPath();
    ctx.ellipse(x, y, size, size * randomRange(0.45, 0.9), Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(160, 160);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const groundTexture = createGroundTexture();
const groundGeo = new THREE.PlaneGeometry(12000, 12000);
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
function createPlayerCompositeTexture(image: HTMLImageElement) {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, size, size);

  const shadowGradient = ctx.createRadialGradient(size / 2, size / 2, size * 0.12, size / 2, size / 2, size * 0.34);
  shadowGradient.addColorStop(0, 'rgba(8,4,10,0.98)');
  shadowGradient.addColorStop(0.55, 'rgba(14,8,18,0.96)');
  shadowGradient.addColorStop(0.76, 'rgba(26,10,34,0.58)');
  shadowGradient.addColorStop(0.92, 'rgba(255,160,220,0.18)');
  shadowGradient.addColorStop(1, 'rgba(255,180,225,0)');
  ctx.fillStyle = shadowGradient;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.34, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.235, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  const imageSize = Math.min(image.naturalWidth || image.width, image.naturalHeight || image.height);
  const sx = ((image.naturalWidth || image.width) - imageSize) / 2;
  const sy = ((image.naturalHeight || image.height) - imageSize) / 2;
  ctx.drawImage(image, sx, sy, imageSize, imageSize, size * 0.265, size * 0.265, size * 0.47, size * 0.47);
  ctx.restore();

  ctx.lineWidth = size * 0.018;
  ctx.strokeStyle = 'rgba(255, 206, 235, 0.88)';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.25, 0, Math.PI * 2);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

const playerRoot = new THREE.Group();
let playerMesh: THREE.Mesh;
const targetPosition = new THREE.Vector3(0, 0, 0);

const playerMaterial = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  transparent: false,
  depthWrite: true,
  depthTest: true,
  side: THREE.DoubleSide,
  alphaTest: 0.32,
});

playerMesh = new THREE.Mesh(new THREE.CircleGeometry(1, 128), playerMaterial);
playerMesh.rotation.x = -Math.PI / 2;
playerMesh.position.set(0, 0.12, 0);
playerMesh.scale.set(2.5, 2.5, 1);
playerMesh.renderOrder = 5;
playerRoot.add(playerMesh);

playerRoot.position.set(0, 0, 0);
scene.add(playerRoot);

const textureLoader = new THREE.TextureLoader();
textureLoader.load('/Qiuqi.webp', (texture) => {
  texture.colorSpace = THREE.SRGBColorSpace;
  const image = texture.image as HTMLImageElement | undefined;
  if (!image) return;
  const compositeTexture = createPlayerCompositeTexture(image);
  playerMaterial.map = compositeTexture;
  playerMaterial.needsUpdate = true;
});

// --- Mouse Interaction ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- LOD Environment Objects ---
interface LODVisual {
  coarse: THREE.Group;
  fine: THREE.Group;
}
interface EnvEntity {
  kind: 'tree' | 'rock';
  position: THREE.Vector3;
  radius: number;
  visual: LODVisual;
  lodLevel: 0 | 1 | 2;
}
interface GrassEntity {
  position: THREE.Vector3;
  radius: number;
  coarse: THREE.Group;
  fine: THREE.Group;
  lodLevel: 0 | 1 | 2;
}

const envEntities: EnvEntity[] = [];
const grassEntities: GrassEntity[] = [];

function createTreeVisual(scale = 1) {
  const coarse = new THREE.Group();
  const fine = new THREE.Group();

  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 1 });
  const barkMat = new THREE.MeshStandardMaterial({ color: 0x7a4d25, roughness: 1 });
  const leavesMat = new THREE.MeshStandardMaterial({ color: 0x489c4b, roughness: 1 });
  const leavesAltMat = new THREE.MeshStandardMaterial({ color: 0x60ad54, roughness: 1 });

  const coarseTrunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.56, 3.35, 8), trunkMat);
  coarseTrunk.position.y = 1.5;
  coarseTrunk.castShadow = true;
  coarse.add(coarseTrunk);

  const coarseLeaves = new THREE.Mesh(new THREE.SphereGeometry(2, 10, 10), leavesMat);
  coarseLeaves.position.set(0, 4.2, 0);
  coarseLeaves.scale.set(1.4, 1.05, 1.35);
  coarseLeaves.castShadow = true;
  coarse.add(coarseLeaves);

  const fineTrunkLower = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.62, 2.45, 12), barkMat);
  fineTrunkLower.position.y = 1.24;
  fineTrunkLower.castShadow = true;
  fine.add(fineTrunkLower);

  const fineTrunkUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 1.58, 10), trunkMat);
  fineTrunkUpper.position.y = 3.18;
  fineTrunkUpper.castShadow = true;
  fine.add(fineTrunkUpper);

  const branch1 = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 1.2, 8), barkMat);
  branch1.position.set(-0.42, 3.02, 0.16);
  branch1.rotation.z = Math.PI / 3.2;
  branch1.rotation.x = Math.PI / 7;
  branch1.castShadow = true;
  fine.add(branch1);

  const branch2 = branch1.clone();
  branch2.position.set(0.44, 2.9, -0.1);
  branch2.rotation.z = -Math.PI / 3.4;
  branch2.rotation.x = -Math.PI / 8;
  fine.add(branch2);

  const crowns = [
    { pos: [0, 4.2, 0], scale: [1.3, 1, 1.28], material: leavesMat },
    { pos: [-0.85, 4.0, 0.35], scale: [0.82, 0.72, 0.78], material: leavesAltMat },
    { pos: [0.84, 4.35, -0.22], scale: [0.94, 0.8, 0.9], material: leavesMat },
    { pos: [0.22, 5.05, 0.28], scale: [0.8, 0.76, 0.82], material: leavesAltMat },
  ];

  crowns.forEach((crown) => {
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.55, 14, 14), crown.material);
    canopy.position.set(crown.pos[0], crown.pos[1], crown.pos[2]);
    canopy.scale.set(crown.scale[0], crown.scale[1], crown.scale[2]);
    canopy.castShadow = true;
    fine.add(canopy);
  });

  coarse.scale.setScalar(scale);
  fine.scale.setScalar(scale);

  return {
    coarse,
    fine,
  };
}

function createRockVisual(scale = 1) {
  const coarse = new THREE.Group();
  const fine = new THREE.Group();

  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8c8c8c, roughness: 0.98 });
  const rockLightMat = new THREE.MeshStandardMaterial({ color: 0xa9a9a9, roughness: 0.94 });
  const rockDarkMat = new THREE.MeshStandardMaterial({ color: 0x757575, roughness: 1 });

  const coarseRock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.15, 0), rockMat);
  coarseRock.position.y = 0.95;
  coarseRock.scale.set(1.25, 0.88, 1.08);
  coarseRock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
  coarseRock.castShadow = true;
  coarse.add(coarseRock);

  const fineCore = new THREE.Mesh(new THREE.DodecahedronGeometry(1.02, 0), rockMat);
  fineCore.position.y = 0.92;
  fineCore.scale.set(1.22, 0.84, 1.02);
  fineCore.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
  fineCore.castShadow = true;
  fine.add(fineCore);

  const fineSide = new THREE.Mesh(new THREE.DodecahedronGeometry(0.56, 0), rockDarkMat);
  fineSide.position.set(-0.56, 0.72, 0.28);
  fineSide.scale.set(1, 0.8, 0.9);
  fineSide.rotation.set(Math.random(), Math.random(), Math.random());
  fineSide.castShadow = true;
  fine.add(fineSide);

  const fineTop = new THREE.Mesh(new THREE.DodecahedronGeometry(0.42, 0), rockLightMat);
  fineTop.position.set(0.38, 1.3, -0.18);
  fineTop.scale.set(1.1, 0.7, 0.95);
  fineTop.rotation.set(Math.random(), Math.random(), Math.random());
  fineTop.castShadow = true;
  fine.add(fineTop);

  coarse.scale.setScalar(scale);
  fine.scale.setScalar(scale);

  return {
    coarse,
    fine,
  };
}

function createGrassLodPatch(bladeCount: number, radius: number, lushness = 1) {
  const patch = new THREE.Group();
  const bladeCanvas = document.createElement('canvas');
  bladeCanvas.width = 48;
  bladeCanvas.height = 180;
  const ctx = bladeCanvas.getContext('2d')!;
  const bladeGradient = ctx.createLinearGradient(24, 180, 24, 0);
  bladeGradient.addColorStop(0, '#2f5f20');
  bladeGradient.addColorStop(0.38, '#5f9f47');
  bladeGradient.addColorStop(1, '#a5e170');
  ctx.fillStyle = bladeGradient;
  ctx.beginPath();
  ctx.moveTo(24, 176);
  ctx.quadraticCurveTo(6, 122, 14, 16);
  ctx.quadraticCurveTo(23, 5, 32, 16);
  ctx.quadraticCurveTo(42, 126, 24, 176);
  ctx.closePath();
  ctx.fill();
  const tex = new THREE.CanvasTexture(bladeCanvas);
  tex.colorSpace = THREE.SRGBColorSpace;

  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    transparent: false,
    side: THREE.DoubleSide,
    alphaTest: 0.5,
    depthWrite: true,
    roughness: 1,
  });

  for (let i = 0; i < bladeCount; i++) {
    const height = randomRange(1.2, 2.5) * lushness;
    const blade = new THREE.Mesh(new THREE.PlaneGeometry(randomRange(0.42, 0.68), height), mat);
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.sqrt(Math.random()) * radius;
    blade.position.set(Math.cos(angle) * dist, height * 0.45, Math.sin(angle) * dist);
    blade.rotation.y = Math.random() * Math.PI;
    blade.rotation.z = randomSigned(0.16);
    blade.castShadow = true;
    patch.add(blade);

    const cross = blade.clone();
    cross.castShadow = true;
    cross.rotation.y += Math.PI / 2;
    patch.add(cross);
  }

  return patch;
}

function spawnEnvironmentEntity(kind: 'tree' | 'rock', x: number, z: number, scale: number) {
  const visual = kind === 'tree' ? createTreeVisual(scale) : createRockVisual(scale);
  visual.coarse.position.set(x, 0, z);
  visual.fine.position.set(x, 0, z);
  visual.coarse.visible = false;
  visual.fine.visible = false;
  scene.add(visual.coarse);
  scene.add(visual.fine);

  const entity: EnvEntity = {
    kind,
    position: new THREE.Vector3(x, 0, z),
    radius: (kind === 'tree' ? 1.3 : 1.05) * scale,
    visual,
    lodLevel: 2,
  };

  addObstacle(x, z, entity.radius);
  envEntities.push(entity);
}

function spawnGrassEntity(x: number, z: number, scale: number) {
  const coarse = createGrassLodPatch(3, 0.52 * scale, 0.95);
  const fine = createGrassLodPatch(10, 0.82 * scale, 1.14);
  coarse.scale.setScalar(scale);
  fine.scale.setScalar(scale);
  coarse.position.set(x, 0.02, z);
  fine.position.set(x, 0.02, z);
  coarse.visible = false;
  fine.visible = false;
  scene.add(coarse);
  scene.add(fine);

  grassEntities.push({
    position: new THREE.Vector3(x, 0, z),
    radius: 1.2 * scale,
    coarse,
    fine,
    lodLevel: 2,
  });
}

function updateEnvLod(entity: EnvEntity) {
  const distance = entity.position.distanceTo(playerRoot.position);
  const fineEnter = getRadiusScaledDistance(34);
  const fineExit = getRadiusScaledDistance(44);
  const coarseEnter = getRadiusScaledDistance(78);
  const coarseExit = getRadiusScaledDistance(94);

  let nextLod = entity.lodLevel;

  if (entity.lodLevel === 0) {
    if (distance > fineExit) nextLod = 1;
  } else if (entity.lodLevel === 1) {
    if (distance < fineEnter) nextLod = 0;
    else if (distance > coarseExit) nextLod = 2;
  } else {
    if (distance < fineEnter) nextLod = 0;
    else if (distance < coarseEnter) nextLod = 1;
  }

  entity.lodLevel = nextLod;
  setObjectVisible(entity.visual.fine, nextLod === 0);
  setObjectVisible(entity.visual.coarse, nextLod === 1);
}

function updateGrassLod(entity: GrassEntity) {
  const distance = entity.position.distanceTo(playerRoot.position);
  const fineEnter = getRadiusScaledDistance(24);
  const fineExit = getRadiusScaledDistance(32);
  const coarseEnter = getRadiusScaledDistance(46);
  const coarseExit = getRadiusScaledDistance(58);

  let nextLod = entity.lodLevel;

  if (entity.lodLevel === 0) {
    if (distance > fineExit) nextLod = 1;
  } else if (entity.lodLevel === 1) {
    if (distance < fineEnter) nextLod = 0;
    else if (distance > coarseExit) nextLod = 2;
  } else {
    if (distance < fineEnter) nextLod = 0;
    else if (distance < coarseEnter) nextLod = 1;
  }

  entity.lodLevel = nextLod;
  setObjectVisible(entity.fine, nextLod === 0);
  setObjectVisible(entity.coarse, nextLod === 1);
}

// --- Pigs ---
interface PigParts {
  root: THREE.Group;
  body: THREE.Mesh;
  head: THREE.Mesh;
  snout: THREE.Mesh;
  legs: THREE.Mesh[];
  tail: THREE.Mesh;
  cheeks: THREE.Mesh[];
  pupils: THREE.Mesh[];
  eyeWhites: THREE.Mesh[];
  ears: THREE.Mesh[];
}

interface PigData {
  mesh: THREE.Group;
  radius: number;
  walkCycle: number;
  parts: PigParts;
  warningIntensity: number;
  baseSkin: THREE.Color;
  velocity: THREE.Vector3;
  wanderAngle: number;
  behaviorBias: number;
  topSpeed: number;
  turnSpeed: number;
  separationStrength: number;
}

const pigs: PigData[] = [];

function createPigMesh(radius: number): PigParts {
  const root = new THREE.Group();

  const skinMat = new THREE.MeshStandardMaterial({ color: 0xf8c6cf, roughness: 0.92 });
  const skinDarkMat = new THREE.MeshStandardMaterial({ color: 0xf0a2b1, roughness: 0.9 });
  const blushMat = new THREE.MeshStandardMaterial({ color: 0xff8fa3, roughness: 0.88 });
  const hoofMat = new THREE.MeshStandardMaterial({ color: 0x70585d, roughness: 1 });
  const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x101010, roughness: 0.4 });
  const highlightMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(radius, 30, 30), skinMat);
  body.scale.set(1.54, 1.24, 1.86);
  body.position.y = radius * 1.18;
  body.castShadow = true;
  root.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.86, 28, 28), skinMat);
  head.scale.set(1.2, 1.12, 1.14);
  head.position.set(0, radius * 1.38, radius * 1.92);
  head.castShadow = true;
  root.add(head);

  const snout = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.29, radius * 0.38, radius * 0.58, 24),
    skinDarkMat,
  );
  snout.rotation.x = Math.PI / 2;
  snout.position.set(0, radius * 1.2, radius * 2.76);
  snout.castShadow = true;
  root.add(snout);

  const noseHoleGeo = new THREE.SphereGeometry(radius * 0.055, 10, 10);
  const noseLeft = new THREE.Mesh(noseHoleGeo, hoofMat);
  noseLeft.position.set(-radius * 0.13, radius * 1.1, radius * 3.08);
  const noseRight = noseLeft.clone();
  noseRight.position.x = radius * 0.13;
  root.add(noseLeft, noseRight);

  const earGeo = new THREE.ConeGeometry(radius * 0.18, radius * 0.36, 12);
  const leftEar = new THREE.Mesh(earGeo, skinMat);
  leftEar.position.set(-radius * 0.47, radius * 2.14, radius * 1.77);
  leftEar.rotation.z = Math.PI / 9;
  leftEar.rotation.x = -Math.PI / 9;
  leftEar.castShadow = true;

  const rightEar = new THREE.Mesh(earGeo, skinMat);
  rightEar.position.set(radius * 0.47, radius * 2.14, radius * 1.77);
  rightEar.rotation.z = -Math.PI / 9;
  rightEar.rotation.x = -Math.PI / 9;
  rightEar.castShadow = true;
  root.add(leftEar, rightEar);

  const eyeWhiteGeo = new THREE.SphereGeometry(radius * 0.155, 14, 14);
  const leftEyeWhite = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
  leftEyeWhite.scale.set(1.26, 1.08, 0.72);
  leftEyeWhite.position.set(-radius * 0.35, radius * 1.46, radius * 2.68);

  const rightEyeWhite = leftEyeWhite.clone();
  rightEyeWhite.position.x = radius * 0.35;
  root.add(leftEyeWhite, rightEyeWhite);

  const pupilGeo = new THREE.SphereGeometry(radius * 0.074, 12, 12);
  const leftPupil = new THREE.Mesh(pupilGeo, eyeMat);
  leftPupil.position.set(-radius * 0.35, radius * 1.45, radius * 2.84);
  const rightPupil = leftPupil.clone();
  rightPupil.position.x = radius * 0.35;
  root.add(leftPupil, rightPupil);

  const eyeHighlightGeo = new THREE.SphereGeometry(radius * 0.028, 10, 10);
  const leftHighlight = new THREE.Mesh(eyeHighlightGeo, highlightMat);
  leftHighlight.position.set(-radius * 0.31, radius * 1.52, radius * 2.9);
  const rightHighlight = leftHighlight.clone();
  rightHighlight.position.x = radius * 0.39;
  root.add(leftHighlight, rightHighlight);

  const cheekGeo = new THREE.SphereGeometry(radius * 0.14, 12, 12);
  const leftCheek = new THREE.Mesh(cheekGeo, blushMat);
  leftCheek.scale.set(1.18, 0.84, 0.58);
  leftCheek.position.set(-radius * 0.48, radius * 1.04, radius * 2.58);
  const rightCheek = leftCheek.clone();
  rightCheek.position.x = radius * 0.48;
  root.add(leftCheek, rightCheek);

  const legGeo = new THREE.CylinderGeometry(radius * 0.135, radius * 0.155, radius * 0.82, 12, 1, true);
  const legs: THREE.Mesh[] = [];
  const legOffsets: Array<[number, number]> = [
    [-radius * 0.56, radius * 0.86],
    [radius * 0.56, radius * 0.86],
    [-radius * 0.54, -radius * 0.78],
    [radius * 0.54, -radius * 0.78],
  ];

  legOffsets.forEach(([x, z]) => {
    const leg = new THREE.Mesh(legGeo, skinDarkMat);
    leg.position.set(x, radius * 0.47, z);
    leg.castShadow = true;
    root.add(leg);

    const hoof = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.145, radius * 0.165, radius * 0.14, 12, 1, true),
      hoofMat,
    );
    hoof.position.set(x, radius * 0.09, z);
    hoof.castShadow = true;
    root.add(hoof);

    legs.push(leg);
  });

  const tail = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 0.18, radius * 0.04, 8, 20, Math.PI * 1.62),
    skinDarkMat,
  );
  tail.position.set(0, radius * 1.15, -radius * 1.79);
  tail.rotation.x = Math.PI / 2.5;
  tail.castShadow = true;
  root.add(tail);

  return {
    root,
    body,
    head,
    snout,
    legs,
    tail,
    cheeks: [leftCheek, rightCheek],
    pupils: [leftPupil, rightPupil],
    eyeWhites: [leftEyeWhite, rightEyeWhite],
    ears: [leftEar, rightEar],
  };
}

function spawnPig() {
  if (!playerRoot) return;

  const isEdible = Math.random() < 0.72;
  const pigRadius = isEdible
    ? playerRadius * randomRange(0.34, 0.62)
    : playerRadius * randomRange(1.05, 1.58);

  const pigParts = createPigMesh(pigRadius);
  const pigMesh = pigParts.root;

  const angle = Math.random() * Math.PI * 2;
  const spawnDistance = getRadiusScaledDistance(48) + Math.random() * 36;

  pigMesh.position.x = playerRoot.position.x + Math.cos(angle) * spawnDistance;
  pigMesh.position.z = playerRoot.position.z + Math.sin(angle) * spawnDistance;
  pigMesh.lookAt(playerRoot.position.x, pigMesh.position.y, playerRoot.position.z);
  scene.add(pigMesh);

  const initialDir = new THREE.Vector3(Math.cos(angle + Math.PI), 0, Math.sin(angle + Math.PI)).normalize();

  pigs.push({
    mesh: pigMesh,
    radius: pigRadius,
    walkCycle: Math.random() * Math.PI * 2,
    parts: pigParts,
    warningIntensity: 0,
    baseSkin: new THREE.Color(0xf8c6cf),
    velocity: initialDir.multiplyScalar(randomRange(1.1, 1.8)),
    wanderAngle: Math.random() * Math.PI * 2,
    behaviorBias: randomRange(0.75, 1.25),
    topSpeed: randomRange(2.1, 3.8),
    turnSpeed: randomRange(2.6, 4.8),
    separationStrength: randomRange(1.1, 1.85),
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

function clearSceneEntities() {
  pigs.forEach((pig) => scene.remove(pig.mesh));
  pigs.length = 0;

  envEntities.forEach((env) => {
    scene.remove(env.visual.coarse);
    scene.remove(env.visual.fine);
  });
  envEntities.length = 0;

  grassEntities.forEach((grass) => {
    scene.remove(grass.coarse);
    scene.remove(grass.fine);
  });
  grassEntities.length = 0;
}

function fillEnvironment() {
  const envCount = 120;
  const grassCount = 420;

  for (let i = 0; i < envCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = randomRange(10, getRadiusScaledDistance(105));
    const x = Math.cos(angle) * distance;
    const z = Math.sin(angle) * distance;
    const scale = randomRange(0.8, 1.65);
    spawnEnvironmentEntity(Math.random() > 0.34 ? 'tree' : 'rock', x, z, scale);
  }

  for (let i = 0; i < grassCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = randomRange(5, getRadiusScaledDistance(92));
    const x = Math.cos(angle) * distance;
    const z = Math.sin(angle) * distance;
    spawnGrassEntity(x, z, randomRange(0.82, 1.26));
  }
}

function ensureEnvironmentAhead() {
  const envPrefetchRadius = getRadiusScaledDistance(118);
  const grassPrefetchRadius = getRadiusScaledDistance(106);

  while (envEntities.length < 160) {
    const angle = Math.random() * Math.PI * 2;
    const distance = envPrefetchRadius * randomRange(0.72, 1.08);
    spawnEnvironmentEntity(
      Math.random() > 0.34 ? 'tree' : 'rock',
      playerRoot.position.x + Math.cos(angle) * distance,
      playerRoot.position.z + Math.sin(angle) * distance,
      randomRange(0.78, 1.72),
    );
  }

  while (grassEntities.length < 520) {
    const angle = Math.random() * Math.PI * 2;
    const distance = grassPrefetchRadius * randomRange(0.68, 1.06);
    spawnGrassEntity(
      playerRoot.position.x + Math.cos(angle) * distance,
      playerRoot.position.z + Math.sin(angle) * distance,
      randomRange(0.82, 1.28),
    );
  }
}

function pruneFarEntities() {
  const envCullRadius = getRadiusScaledDistance(168);
  const grassCullRadius = getRadiusScaledDistance(146);

  for (let i = envEntities.length - 1; i >= 0; i--) {
    const env = envEntities[i];
    if (env.position.distanceTo(playerRoot.position) > envCullRadius) {
      scene.remove(env.visual.coarse);
      scene.remove(env.visual.fine);
      envEntities.splice(i, 1);
    }
  }

  for (let i = grassEntities.length - 1; i >= 0; i--) {
    const grass = grassEntities[i];
    if (grass.position.distanceTo(playerRoot.position) > grassCullRadius) {
      scene.remove(grass.coarse);
      scene.remove(grass.fine);
      grassEntities.splice(i, 1);
    }
  }
}

function resetGame() {
  score = 0;
  playerRadius = 1;
  currentCameraHeight = baseCameraHeight;
  isGameOver = false;

  scoreEl.innerText = score.toString();
  updateHighScoreUI();
  gameOverEl.classList.add('hidden');
  clearObstacles();
  void refreshLeaderboardUI();

  if (playerRoot && playerMesh) {
    playerRoot.position.set(0, 0, 0);
    playerMesh.scale.set(2.5, 2.5, 1);
    targetPosition.set(0, 0, 0);
  }

  clearSceneEntities();

  for (let i = 0; i < 22; i++) spawnPig();
  fillEnvironment();
}

restartBtn.addEventListener('click', resetGame);

// --- Animation Loop ---
const timer = new THREE.Timer();
const cameraTarget = new THREE.Vector3();
const cameraLookAt = new THREE.Vector3();
const smoothForward = new THREE.Vector3(0, 0, 1);
const steerTarget = new THREE.Vector3();
const separationForce = new THREE.Vector3();
const avoidForce = new THREE.Vector3();
const wanderForce = new THREE.Vector3();
const desiredMove = new THREE.Vector3();

function updatePigBehavior(pig: PigData, delta: number, index: number) {
  const toPlayer = tempVecA.subVectors(playerRoot.position, pig.mesh.position);
  toPlayer.y = 0;
  const dist = toPlayer.length();
  const isDangerousToPlayer = pig.radius > playerRadius;
  const isSmallPig = pig.radius < playerRadius * 0.92;

  steerTarget.set(0, 0, 0);
  separationForce.set(0, 0, 0);
  avoidForce.set(0, 0, 0);
  wanderForce.set(0, 0, 0);

  pig.wanderAngle += randomSigned(0.85) * delta * pig.behaviorBias;
  wanderForce.set(Math.cos(pig.wanderAngle), 0, Math.sin(pig.wanderAngle)).multiplyScalar(0.8);

  if (dist > 0.001) {
    const lateral = tempVecB.copy(toPlayer).normalize();
    const offsetAngle = (index % 2 === 0 ? 1 : -1) * (0.45 + pig.behaviorBias * 0.1);
    const sideDir = tempVecC.copy(lateral).applyAxisAngle(worldUp, offsetAngle);

    if (isDangerousToPlayer) {
      steerTarget.add(lateral.multiplyScalar(1.45));
      steerTarget.add(sideDir.multiplyScalar(0.45));
    } else if (isSmallPig) {
      steerTarget.sub(lateral.multiplyScalar(1.8));
      steerTarget.add(sideDir.multiplyScalar(0.55));
    } else {
      steerTarget.add(lateral.multiplyScalar(0.22));
      steerTarget.add(sideDir.multiplyScalar(0.35));
    }
  }

  for (let j = 0; j < pigs.length; j++) {
    if (j === index) continue;
    const other = pigs[j];
    const diff = tempVecA.subVectors(pig.mesh.position, other.mesh.position);
    diff.y = 0;
    const dSq = diff.lengthSq();
    const range = (pig.radius + other.radius) * 3.6;
    if (dSq > 0.0001 && dSq < range * range) {
      separationForce.add(diff.normalize().multiplyScalar((range - Math.sqrt(dSq)) / range));
    }
  }

  for (const obstacle of obstacles) {
    const diff = tempVecA.set(
      pig.mesh.position.x - obstacle.position.x,
      0,
      pig.mesh.position.z - obstacle.position.y,
    );
    const safeDist = pig.radius + obstacle.radius + 2.2;
    const dSq = diff.lengthSq();
    if (dSq > 0.0001 && dSq < safeDist * safeDist) {
      avoidForce.add(diff.normalize().multiplyScalar((safeDist - Math.sqrt(dSq)) / safeDist));
    }
  }

  desiredMove
    .copy(steerTarget)
    .addScaledVector(wanderForce, 0.9)
    .addScaledVector(separationForce, pig.separationStrength)
    .addScaledVector(avoidForce, 1.8);

  if (desiredMove.lengthSq() < 0.001) {
    desiredMove.set(Math.cos(pig.wanderAngle), 0, Math.sin(pig.wanderAngle));
  }

  desiredMove.normalize();
  const desiredSpeed = isDangerousToPlayer
    ? pig.topSpeed * 1.18
    : isSmallPig
      ? pig.topSpeed * 1.12
      : pig.topSpeed * 0.86;

  const desiredVelocity = desiredMove.multiplyScalar(desiredSpeed);
  pig.velocity.lerp(desiredVelocity, Math.min(1, pig.turnSpeed * delta));

  const move = pig.velocity.clone().multiplyScalar(delta);
  pig.mesh.position.add(move);
  resolveObstacleCollision(pig.mesh.position, pig.radius * 0.72);

  if (pig.velocity.lengthSq() > 0.001) {
    const lookTarget = tempVecA.copy(pig.mesh.position).add(pig.velocity);
    pig.mesh.lookAt(lookTarget.x, pig.mesh.position.y + pig.radius * 0.7, lookTarget.z);
  }

  pig.walkCycle += pig.velocity.length() * 2.8 * delta + delta * 1.1;
  const bob = Math.abs(Math.sin(pig.walkCycle)) * pig.radius * 0.06;
  pig.parts.body.position.y = pig.radius * 1.18 + bob;
  pig.parts.head.position.y = pig.radius * 1.38 + bob * 1.06;
  pig.parts.snout.position.y = pig.radius * 1.2 + bob * 0.95;
  pig.parts.body.rotation.z = Math.sin(pig.walkCycle * 0.52) * 0.05;
  pig.parts.head.rotation.z = Math.sin(pig.walkCycle * 0.52 + 0.18) * 0.07;

  pig.parts.legs.forEach((leg, legIndex) => {
    const phase = legIndex % 2 === 0 ? 0 : Math.PI;
    leg.rotation.x = Math.sin(pig.walkCycle + phase) * 0.25;
  });

  pig.parts.tail.rotation.z = Math.sin(pig.walkCycle * 1.5) * 0.6;
  pig.parts.ears.forEach((ear, earIndex) => {
    ear.rotation.x = -Math.PI / 9 + Math.sin(pig.walkCycle * 0.9 + earIndex) * 0.04;
  });
  pig.parts.cheeks.forEach((cheek) => {
    cheek.scale.y = 0.8 + Math.abs(Math.sin(pig.walkCycle * 0.48)) * 0.08;
  });
  pig.parts.pupils.forEach((pupil, pupilIndex) => {
    pupil.position.x =
      (pupilIndex === 0 ? -1 : 1) * pig.radius * 0.35 +
      Math.sin(pig.walkCycle * 0.28) * pig.radius * 0.015;
  });
}

function animate() {
  requestAnimationFrame(animate);

  timer.update();
  const delta = Math.min(timer.getDelta(), 0.05);
  const elapsed = timer.getElapsed();

  if (playerRoot && playerMesh) {
    const activeTarget =
      isGameStarted && !isGameOver
        ? new THREE.Vector3(targetPosition.x, 0, targetPosition.z)
        : playerRoot.position.clone();

    const distanceToTarget = playerRoot.position.distanceTo(activeTarget);
    const speed = 10 * Math.max(0.5, 1 / Math.sqrt(playerRadius));
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

    playerMesh.scale.set(playerRadius * 2.36, playerRadius * 2.36, 1);

    currentCameraHeight = THREE.MathUtils.lerp(
      currentCameraHeight,
      baseCameraHeight + playerRadius * 5.8,
      2.15 * delta,
    );

    const desiredForward =
      isGameStarted && !isGameOver
        ? new THREE.Vector3(
            targetPosition.x - playerRoot.position.x,
            0,
            targetPosition.z - playerRoot.position.z,
          )
        : new THREE.Vector3(Math.sin(elapsed * 0.35), 0, 1);

    if (desiredForward.lengthSq() > 0.01) {
      desiredForward.normalize();
      smoothForward.lerp(desiredForward, Math.min(1, 2.8 * delta));
      smoothForward.normalize();
    }

    dirLight.position.set(playerRoot.position.x + 18, 28, playerRoot.position.z + 12);
    dirLightTarget.position.set(playerRoot.position.x, 0, playerRoot.position.z);
    dirLight.target.updateMatrixWorld();

    cameraTarget.set(
      playerRoot.position.x - smoothForward.x * currentCameraHeight * 0.18,
      currentCameraHeight * 1.1,
      playerRoot.position.z + currentCameraHeight * 0.74 - smoothForward.z * currentCameraHeight * 0.18,
    );
    camera.position.lerp(cameraTarget, Math.min(1, 3.2 * delta));

    cameraLookAt.set(
      playerRoot.position.x + smoothForward.x * Math.min(3.4, playerRadius * 0.96),
      0.12,
      playerRoot.position.z + smoothForward.z * Math.min(3.4, playerRadius * 0.96),
    );
    camera.lookAt(cameraLookAt);

    updateFrustum();

    for (const env of envEntities) updateEnvLod(env);
    for (const grass of grassEntities) updateGrassLod(grass);

    for (let i = pigs.length - 1; i >= 0; i--) {
      const pig = pigs[i];
      const flatPigPos = tempVecA.set(pig.mesh.position.x, 0, pig.mesh.position.z);
      const dist = playerRoot.position.distanceTo(flatPigPos);
      const isDangerous = pig.radius > playerRadius;
      const dangerStrength = isDangerous
        ? clamp(1.12 - dist / (playerRadius * 12 + 12), 0.12, 0.82)
        : 0;

      pig.warningIntensity = THREE.MathUtils.lerp(
        pig.warningIntensity,
        dangerStrength,
        Math.min(1, 4.2 * delta),
      );
      const pulse = 0.5 + 0.5 * Math.sin(elapsed * 5 + i);
      const warningColor = pig.baseSkin
        .clone()
        .lerp(new THREE.Color(0xff6b6b), pig.warningIntensity * (0.5 + pulse * 0.35));
      (pig.parts.body.material as THREE.MeshStandardMaterial).color.copy(warningColor);
      (pig.parts.head.material as THREE.MeshStandardMaterial).color.copy(warningColor);

      if (isGameStarted && !isGameOver && dist < playerRadius + pig.radius) {
        if (playerRadius > pig.radius) {
          scene.remove(pig.mesh);
          pigs.splice(i, 1);

          score += Math.floor(pig.radius * 10);
          scoreEl.innerText = score.toString();

          const areaIncrease = Math.PI * Math.pow(pig.radius, 2) * 0.11;
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
          void submitScore(score).then(() => refreshLeaderboardUI());
        }
      } else {
        updatePigBehavior(pig, delta, i);
      }
    }

    const pigSpawnRadius = getRadiusScaledDistance(44);
    while (pigs.length < 26 + playerRadius * 2.2) {
      spawnPig();
      const pig = pigs[pigs.length - 1];
      if (pig) {
        const angle = Math.random() * Math.PI * 2;
        pig.mesh.position.x = playerRoot.position.x + Math.cos(angle) * pigSpawnRadius;
        pig.mesh.position.z = playerRoot.position.z + Math.sin(angle) * pigSpawnRadius;
      }
    }

    for (let i = pigs.length - 1; i >= 0; i--) {
      const pig = pigs[i];
      const dist = playerRoot.position.distanceTo(pig.mesh.position);
      if (dist > getRadiusScaledDistance(142)) {
        scene.remove(pig.mesh);
        pigs.splice(i, 1);
      }
    }

    ensureEnvironmentAhead();
    pruneFarEntities();
  }

  renderer.render(scene, camera);
}

void refreshLeaderboardUI();
resetGame();
animate();