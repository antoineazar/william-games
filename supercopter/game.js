// ============================================================
//  SUPERCOPTER – infinite rescue helicopter game
//  Arrow keys to fly | Space to shoot | Rescue civilians!
// ============================================================

const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');

const W = canvas.width;   // 900
const H = canvas.height;  // 500

const GROUND_Y  = H - 80;
const BASE_X    = 20;
const BASE_W    = 130;
const WARZONE_X = BASE_X + BASE_W + 60;

// Movement physics constants
const ACCEL     = 0.75;  // how fast you speed up (px per frame²)
const FRICTION  = 0.84;  // multiplied every frame to slow you down (0–1)
const MAX_SPD   = 6;     // maximum speed in any direction (px per frame)

// Shooting constants
const BULLET_SPEED    = 9;
const SHOOT_COOLDOWN  = 90;
const MAX_AMMO        = 10;
const RELOAD_TIME     = 3000;

// Civilian walking constants
const WALK_SPEED     = 1.6; // px per frame when boarding / disembarking
const BOARDING_RANGE = 130; // px from helicopter centre to trigger boarding walk


// ============================================================
//  HELICOPTER
// ============================================================
const heli = {
  x:           BASE_X + 10,
  y:           GROUND_Y - 80,
  w:           80,
  h:           35,
  vx:          0,          // horizontal velocity (with easing)
  vy:          0,          // vertical velocity (with easing)
  facing:      1,          // 1 = right, -1 = left (for sprite flip + shot direction)
  onBoard:     0,
  maxOnBoard:  4,
  rotorAngle:  0,
  ammo:        MAX_AMMO,
  reloading:   false,
  reloadTimer: 0,
  shootTimer:  0,          // cooldown between rapid shots
  tiltAngle:   0,          // forward lean when moving (radians)
};


// ============================================================
//  CAMERA
// ============================================================
let cameraX = 0;


// ============================================================
//  HELICOPTER SPRITE  –  loaded from assets/, background removed
// ============================================================
const SPRITE_W = 120;
const SPRITE_H = 43;   // keeps the 1743:629 aspect ratio at this width
// Position of the main-rotor hub inside the sprite (measured from sprite top-left)
const ROTOR_HUB_SX = 43; // px from sprite left
const ROTOR_HUB_SY = 4;  // px from sprite top

let heliSprite = null;  // set to an offscreen canvas once the image has loaded

(function loadSprite() {
  const raw = new Image();
  raw.onload = () => {
    const off  = document.createElement('canvas');
    off.width  = SPRITE_W;
    off.height = SPRITE_H;
    const oc   = off.getContext('2d');
    oc.drawImage(raw, 0, 0, SPRITE_W, SPRITE_H);

    // Remove white background: any pixel whose R, G and B channels are all
    // above 230 is considered background and made fully transparent.
    const id = oc.getImageData(0, 0, SPRITE_W, SPRITE_H);
    const d  = id.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] > 230 && d[i + 1] > 230 && d[i + 2] > 230) d[i + 3] = 0;
    }
    oc.putImageData(id, 0, 0);
    heliSprite = off;
  };
  raw.onerror = () => console.warn('Helicopter sprite not found – falling back to shapes.');
  raw.src = 'assets/helicopter-sprite.png';
}());

// ============================================================
//  GAME OBJECTS  –  all in world-space coordinates
// ============================================================
const civilians     = []; // the people to rescue
const buildings     = []; // ruined buildings (decoration)
const enemies       = []; // tanks and missile launchers (ground)
const planes        = []; // enemy planes (air)
const enemyBullets  = []; // projectiles fired BY enemies
const playerBullets = []; // projectiles fired BY the player
const explosions    = []; // short-lived explosion effects


// ============================================================
//  INFINITE WORLD GENERATION
// ============================================================
let nextChunkX = WARZONE_X;
const CHUNK_W  = 340;

function generateChunk(startX) {

  // --- Civilians (1–3 per chunk) ---
  const civCount = 1 + Math.floor(Math.random() * 3);
  for (let i = 0; i < civCount; i++) {
    civilians.push({
      x:           startX + 30 + Math.random() * (CHUNK_W - 80),
      y:           GROUND_Y - 28,
      w:           16,
      h:           28,
      // States: 'waiting' | 'boarding' | 'injured' | 'onBoard' | 'disembarking' | 'rescued' | 'dead'
      state:       'waiting',
      waveOffset:  Math.random() * Math.PI * 2,
      injuryTimer: 0,
      targetX:     0,   // x destination while walking (boarding / disembarking)
      walkCycle:   Math.random() * Math.PI * 2, // phase offset for leg animation
    });
  }

  // --- Building ---
  const bw = 35 + Math.floor(Math.random() * 35);
  const bh = 50 + Math.floor(Math.random() * 55);
  buildings.push({
    x: startX + 60 + Math.floor(Math.random() * (CHUNK_W - bw - 60)),
    w: bw,
    h: bh,
  });

  // --- Tank (60 % chance) ---
  if (Math.random() < 0.6) {
    enemies.push({
      type:          'tank',
      x:             startX + 20 + Math.random() * (CHUNK_W - 60),
      y:             GROUND_Y - 20,
      w:             44,
      h:             20,
      shootTimer:    Math.random() * 4000,
      shootInterval: 3000 + Math.random() * 2000,
    });
  }

  // --- Missile launcher (35 % chance) ---
  if (Math.random() < 0.35) {
    enemies.push({
      type:          'launcher',
      x:             startX + 100 + Math.random() * (CHUNK_W - 150),
      y:             GROUND_Y - 28,
      w:             28,
      h:             28,
      shootTimer:    Math.random() * 4000,
      shootInterval: 4000 + Math.random() * 2000,
    });
  }

  nextChunkX += CHUNK_W;
}

for (let i = 0; i < 5; i++) generateChunk(nextChunkX);


// ============================================================
//  INPUT
// ============================================================
const keys = {};

window.addEventListener('keydown', e => {
  keys[e.key] = true;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'b', 'B'].includes(e.key)) {
    e.preventDefault();
  }
  if ((e.key === 'r' || e.key === 'R') && gameOver) restartGame();
});
window.addEventListener('keyup', e => { keys[e.key] = false; });


// ============================================================
//  GAME STATE
// ============================================================
let score        = 0;
let totalRescued = 0;
let lives        = 3;
let invincible   = false;
let invTimer     = 0;
const INV_MS     = 2000;

let gameOver        = false;
let planeSpawnTimer = 5000;
const PLANE_INTERVAL = 9000;

let lastTime = 0;


// ============================================================
//  RESTART
// ============================================================
function restartGame() {
  heli.x           = BASE_X + 10;
  heli.y           = GROUND_Y - 80;
  heli.vx          = 0;
  heli.vy          = 0;
  heli.facing      = 1;
  heli.onBoard     = 0;
  heli.ammo        = MAX_AMMO;
  heli.reloading   = false;
  heli.reloadTimer = 0;
  heli.shootTimer  = 0;
  heli.tiltAngle   = 0;

  civilians.length    = 0;
  buildings.length    = 0;
  enemies.length      = 0;
  planes.length       = 0;
  enemyBullets.length = 0;
  playerBullets.length = 0;
  explosions.length   = 0;

  nextChunkX = WARZONE_X;
  for (let i = 0; i < 5; i++) generateChunk(nextChunkX);

  cameraX         = 0;
  score           = 0;
  totalRescued    = 0;
  lives           = 3;
  invincible      = false;
  invTimer        = 0;
  gameOver        = false;
  planeSpawnTimer = 5000;
}


// ============================================================
//  HELPERS
// ============================================================

// Returns true if circle (cx, cy, cr) overlaps rectangle (bx, by, bw, bh)
function circleHitsBox(cx, cy, cr, bx, by, bw, bh) {
  const nearX = Math.max(bx, Math.min(cx, bx + bw));
  const nearY = Math.max(by, Math.min(cy, by + bh));
  return Math.hypot(cx - nearX, cy - nearY) < cr;
}

// Spawn a visual explosion at a world position
function addExplosion(x, y, big = false) {
  explosions.push({ x, y, r: 0, maxR: big ? 40 : 22, timer: 0, duration: big ? 650 : 420 });
}


// ============================================================
//  FIRE HELPERS
// ============================================================

// Enemy (ground) fires a bullet toward the helicopter
function fireEnemyBullet(enemy) {
  const ex   = enemy.x + enemy.w / 2;
  const ey   = enemy.y;
  const tx   = heli.x + heli.w / 2;
  const ty   = heli.y + heli.h / 2;
  const dist = Math.hypot(tx - ex, ty - ey);
  const spd  = enemy.type === 'launcher' ? 2.5 : 5;

  enemyBullets.push({
    x:      ex,
    y:      ey,
    vx:     ((tx - ex) / dist) * spd,
    vy:     ((ty - ey) / dist) * spd,
    source: enemy.type,
    homing: false,   // homing disabled – missiles fly straight
    r:      enemy.type === 'launcher' ? 6 : 4,
  });
}

// Enemy plane drops a bomb straight down
function fireEnemyBomb(plane) {
  enemyBullets.push({
    x:      plane.x + plane.w / 2,
    y:      plane.y + plane.h,
    vx:     0,
    vy:     4,
    source: 'plane',
    homing: false,
    r:      5,
  });
}

// Player fires a bullet in the direction the helicopter is pointing.
// Space = forward shot (horizontal + tilt); B = straight down.
function firePlayerBullet(downward = false) {
  const cx = heli.x + heli.w / 2;
  const cy = heli.y + heli.h / 2;

  if (downward) {
    playerBullets.push({ x: cx, y: heli.y + heli.h + 2, vx: 0, vy: BULLET_SPEED, r: 4 });
    return;
  }

  // Bullet travels in the direction the nose is actually pointing:
  //   facing right (1): base angle 0  (→), tilted clockwise by tiltAngle
  //   facing left (-1): base angle π  (←), same tilt added
  const bulletAngle = heli.facing === 1 ? heli.tiltAngle : Math.PI + heli.tiltAngle;
  const bvx = Math.cos(bulletAngle) * BULLET_SPEED;
  const bvy = Math.sin(bulletAngle) * BULLET_SPEED;

  // Spawn from the nose tip (in the bullet's travel direction)
  playerBullets.push({
    x: cx + Math.cos(bulletAngle) * (heli.w / 2 + 4),
    y: cy + Math.sin(bulletAngle) * (heli.h / 2 + 2),
    vx: bvx,
    vy: bvy,
    r: 4,
  });
}


// ============================================================
//  UPDATE  –  all game logic, runs every frame
// ============================================================
function update(dt) {
  if (gameOver) return;

  // ── Helicopter movement with easing ──────────────────────
  // Apply friction first so releasing a key causes smooth deceleration
  heli.vx *= FRICTION;
  heli.vy *= FRICTION;

  // Add acceleration while keys are held
  if (keys['ArrowLeft'])  heli.vx -= ACCEL;
  if (keys['ArrowRight']) heli.vx += ACCEL;
  if (keys['ArrowUp'])    heli.vy -= ACCEL;
  if (keys['ArrowDown'])  heli.vy += ACCEL;

  // Cap speed
  heli.vx = Math.max(-MAX_SPD, Math.min(MAX_SPD, heli.vx));
  heli.vy = Math.max(-MAX_SPD, Math.min(MAX_SPD, heli.vy));

  // Move
  heli.x += heli.vx;
  heli.y += heli.vy;

  // World boundaries – also kill velocity when hitting a wall
  if (heli.x <= 0)                  { heli.x = 0;                heli.vx = Math.max(0, heli.vx); }
  if (heli.y <= 15)                 { heli.y = 15;               heli.vy = Math.max(0, heli.vy); }
  if (heli.y >= GROUND_Y - heli.h) { heli.y = GROUND_Y - heli.h; heli.vy = Math.min(0, heli.vy); }

  // Update facing direction based on velocity
  if (heli.vx >  0.3) heli.facing =  1;
  if (heli.vx < -0.3) heli.facing = -1;

  // Tilt proportional to horizontal speed (max ~14 degrees)
  heli.tiltAngle = (heli.vx / MAX_SPD) * 0.25;

  heli.rotorAngle += 0.18;

  // ── Camera ───────────────────────────────────────────────
  cameraX = Math.max(0, heli.x - W * 0.38);

  // ── World generation ─────────────────────────────────────
  while (nextChunkX < cameraX + W + CHUNK_W * 2) generateChunk(nextChunkX);

  // ── Invincibility timer ───────────────────────────────────
  if (invincible) {
    invTimer += dt;
    if (invTimer >= INV_MS) { invincible = false; invTimer = 0; }
  }

  // ── Player shooting ───────────────────────────────────────
  heli.shootTimer -= dt;

  const wantsForwardShot  = keys[' '];
  const wantsDownwardShot = keys['b'] || keys['B'];

  if ((wantsForwardShot || wantsDownwardShot) && !heli.reloading) {
    if (heli.ammo > 0 && heli.shootTimer <= 0) {
      heli.shootTimer = SHOOT_COOLDOWN;
      heli.ammo--;
      firePlayerBullet(wantsDownwardShot && !wantsForwardShot);
      if (heli.ammo === 0) {
        heli.reloading   = true;
        heli.reloadTimer = 0;
      }
    }
  }

  if (heli.reloading) {
    heli.reloadTimer += dt;
    if (heli.reloadTimer >= RELOAD_TIME) {
      heli.ammo      = MAX_AMMO;
      heli.reloading = false;
      heli.reloadTimer = 0;
    }
  }

  // ── Player bullets: move and collide ─────────────────────
  for (let i = playerBullets.length - 1; i >= 0; i--) {
    const b = playerBullets[i];
    b.x += b.vx;
    b.y += b.vy;

    // Remove if off-screen or hits ground
    if (b.x < cameraX - 100 || b.x > cameraX + W + 100 || b.y > GROUND_Y || b.y < 0) {
      playerBullets.splice(i, 1);
      continue;
    }

    // Check vs ground enemies (tanks and launchers)
    let hit = false;
    for (let j = enemies.length - 1; j >= 0; j--) {
      const e = enemies[j];
      if (circleHitsBox(b.x, b.y, b.r, e.x, e.y, e.w, e.h)) {
        addExplosion(e.x + e.w / 2, e.y + e.h / 2, false);
        score += e.type === 'tank' ? 20 : 15;
        enemies.splice(j, 1);
        playerBullets.splice(i, 1);
        hit = true;
        break;
      }
    }
    if (hit) continue;

    // Check vs planes
    for (let j = planes.length - 1; j >= 0; j--) {
      const p = planes[j];
      if (circleHitsBox(b.x, b.y, b.r, p.x, p.y, p.w, p.h)) {
        addExplosion(p.x + p.w / 2, p.y + p.h / 2, true);
        score += 25;
        planes.splice(j, 1);
        playerBullets.splice(i, 1);
        hit = true;
        break;
      }
    }
  }

  // ── Landing check ────────────────────────────────────────
  // The helicopter must be fully on the ground (touching the grass)
  // for people to get in or out.
  const heliCenterX = heli.x + heli.w / 2;
  const isLanded    = heli.y >= GROUND_Y - heli.h - 2;
  const overBase    = heli.x + heli.w > BASE_X && heli.x < BASE_X + BASE_W;

  // ── Trigger boarding: civilians walk toward the helicopter ─
  // Only when landed outside the base (i.e. in the warzone)
  if (isLanded && !overBase) {
    const numBoarding = civilians.filter(c => c.state === 'boarding').length;
    const canBoard    = heli.maxOnBoard - heli.onBoard - numBoarding;

    if (canBoard > 0) {
      for (const civ of civilians) {
        if (civ.state !== 'waiting' && civ.state !== 'injured') continue;
        if (Math.abs((civ.x + civ.w / 2) - heliCenterX) < BOARDING_RANGE) {
          civ.state       = 'boarding';
          civ.injuryTimer = 0;  // safe once they start walking
          civ.targetX     = heliCenterX - civ.w / 2;
        }
      }
    }
  }

  // If helicopter leaves the ground, any mid-walk boarding is cancelled
  if (!isLanded) {
    for (const civ of civilians) {
      if (civ.state === 'boarding') civ.state = 'waiting';
    }
  }

  // ── Move boarding civilians toward the helicopter each frame ─
  for (const civ of civilians) {
    if (civ.state !== 'boarding') continue;
    const dir = civ.targetX > civ.x ? 1 : -1;
    civ.x += dir * WALK_SPEED;
    if (Math.abs(civ.x - civ.targetX) <= WALK_SPEED + 1) {
      civ.x     = civ.targetX;
      civ.state = 'onBoard';
      heli.onBoard++;
    }
  }

  // ── Trigger disembarking: when landed at base with passengers ─
  if (isLanded && overBase && heli.onBoard > 0) {
    let slotOffset = 0;
    for (const civ of civilians) {
      if (civ.state !== 'onBoard') continue;
      civ.state   = 'disembarking';
      // Start them near the helicopter, staggered so they don't stack
      civ.x       = heli.x + heli.w / 2 - civ.w / 2 + slotOffset;
      civ.y       = GROUND_Y - civ.h;
      civ.targetX = BASE_X + 12 + Math.random() * (BASE_W - 30);
      slotOffset += 8;  // each person exits slightly further along
    }
    heli.onBoard = 0;
  }

  // ── Move disembarking civilians toward the base ────────────
  for (const civ of civilians) {
    if (civ.state !== 'disembarking') continue;
    const dir = civ.targetX > civ.x ? 1 : -1;
    civ.x += dir * WALK_SPEED;
    if (Math.abs(civ.x - civ.targetX) <= WALK_SPEED + 1) {
      civ.x         = civ.targetX;
      civ.state     = 'rescued';
      score        += 10;
      totalRescued += 1;
    }
  }

  // ── Injured civilians countdown ───────────────────────────
  for (const civ of civilians) {
    if (civ.state === 'injured') {
      civ.injuryTimer -= dt;
      if (civ.injuryTimer <= 0) civ.state = 'dead';
    }
  }

  // ── Ground enemies: shoot ────────────────────────────────
  for (const enemy of enemies) {
    const onScreen = enemy.x > cameraX - 300 && enemy.x < cameraX + W + 300;
    if (!onScreen) continue;
    const dist = Math.hypot(
      (heli.x + heli.w / 2) - (enemy.x + enemy.w / 2),
      (heli.y + heli.h / 2) - (enemy.y + enemy.h / 2)
    );
    if (dist > 550) continue;
    enemy.shootTimer += dt;
    if (enemy.shootTimer >= enemy.shootInterval) {
      enemy.shootTimer = 0;
      fireEnemyBullet(enemy);
    }
  }

  // ── Plane spawning ────────────────────────────────────────
  if (heli.x > WARZONE_X) {
    planeSpawnTimer -= dt;
    if (planeSpawnTimer <= 0) {
      planeSpawnTimer = PLANE_INTERVAL;
      planes.push({
        x:             cameraX + W + 60,
        y:             55 + Math.random() * 180,
        w:             64,
        h:             24,
        speed:         2 + Math.random() * 1.5,
        shootTimer:    2000 + Math.random() * 2000,
        shootInterval: 3500 + Math.random() * 2000,
      });
    }
  }

  // ── Plane movement and shooting ───────────────────────────
  for (let i = planes.length - 1; i >= 0; i--) {
    const plane = planes[i];
    plane.x -= plane.speed;
    plane.shootTimer -= dt;
    if (plane.shootTimer <= 0) {
      plane.shootTimer = plane.shootInterval;
      fireEnemyBomb(plane);
    }
    if (plane.x + plane.w < cameraX - 150) planes.splice(i, 1);
  }

  // ── Enemy bullets: move and collide ──────────────────────
  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    const b = enemyBullets[i];

    // Homing missiles steer toward the helicopter
    if (b.homing) {
      const dx   = (heli.x + heli.w / 2) - b.x;
      const dy   = (heli.y + heli.h / 2) - b.y;
      const dist = Math.hypot(dx, dy);
      b.vx += (dx / dist) * 0.07;
      b.vy += (dy / dist) * 0.07;
      const spd = Math.hypot(b.vx, b.vy);
      b.vx = (b.vx / spd) * 2.5;
      b.vy = (b.vy / spd) * 2.5;
    }

    b.x += b.vx;
    b.y += b.vy;

    if (b.x < cameraX - 150 || b.x > cameraX + W + 150 ||
        b.y < 0 || b.y > GROUND_Y + 10) {
      enemyBullets.splice(i, 1);
      continue;
    }

    // Hits helicopter
    if (!invincible && circleHitsBox(b.x, b.y, b.r, heli.x, heli.y, heli.w, heli.h)) {
      enemyBullets.splice(i, 1);
      lives--;
      invincible = true;
      invTimer   = 0;
      if (lives <= 0) { lives = 0; gameOver = true; }
      continue;
    }

    // Hits a waiting civilian
    let hitCiv = false;
    for (const civ of civilians) {
      if (civ.state !== 'waiting') continue;
      if (circleHitsBox(b.x, b.y, b.r, civ.x, civ.y, civ.w, civ.h)) {
        civ.state       = 'injured';
        civ.injuryTimer = 5000;
        enemyBullets.splice(i, 1);
        hitCiv = true;
        break;
      }
    }
    if (hitCiv) continue;
  }

  // ── Explosions ────────────────────────────────────────────
  for (let i = explosions.length - 1; i >= 0; i--) {
    const exp = explosions[i];
    exp.timer += dt;
    exp.r = exp.maxR * (exp.timer / exp.duration);
    if (exp.timer >= exp.duration) explosions.splice(i, 1);
  }
}


// ============================================================
//  DRAW FUNCTIONS
//
//  SCREEN SPACE  – background and HUD (no camera offset)
//  WORLD SPACE   – everything else (ctx translated by -cameraX)
// ============================================================

function drawSkyAndGround() {
  ctx.fillStyle = '#87CEEB';
  ctx.fillRect(0, 0, W, GROUND_Y);
  ctx.fillStyle = '#8B7355';
  ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
  ctx.fillStyle = '#5a8a3a';
  ctx.fillRect(0, GROUND_Y, W, 8);
}

function drawClouds() {
  const pattern = [
    [80, 58, 28],[105, 52, 22],[58, 53, 20],
    [340, 70, 32],[362, 63, 24],[318, 65, 22],
    [600, 55, 26],[622, 48, 20],
  ];
  const shift = (cameraX * 0.4) % W;
  ctx.fillStyle = 'white';
  for (const [cx, cy, r] of pattern) {
    for (let tile = -1; tile <= 1; tile++) {
      ctx.beginPath();
      ctx.arc(cx - shift + tile * W, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ── World-space draw functions ────────────────────────────────

function drawBase() {
  ctx.fillStyle = 'rgba(50, 200, 50, 0.18)';
  ctx.fillRect(BASE_X - 10, 0, BASE_W + 20, GROUND_Y);
  ctx.fillStyle = '#2d6a2d';
  ctx.fillRect(BASE_X - 10, GROUND_Y, BASE_W + 20, H - GROUND_Y);
  ctx.fillStyle = '#ffdd00';
  ctx.fillRect(BASE_X, GROUND_Y - 4, BASE_W, 6);
  ctx.fillStyle = 'white';
  ctx.font = 'bold 14px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('BASE', BASE_X + BASE_W / 2, GROUND_Y + 28);
}

function drawWarzone() {
  if (cameraX + W < WARZONE_X) return;
  ctx.fillStyle = 'rgba(255, 60, 60, 0.07)';
  ctx.fillRect(WARZONE_X - 30, 0, 9000000, GROUND_Y);
  const labelX = Math.max(WARZONE_X - 20, cameraX + 10);
  ctx.fillStyle = '#cc4444';
  ctx.font = 'bold 15px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('! WARZONE', labelX, 26);
}

function drawBuildings() {
  for (const b of buildings) {
    if (b.x + b.w < cameraX - 50 || b.x > cameraX + W + 50) continue;
    ctx.fillStyle = '#8a7060';
    ctx.fillRect(b.x, GROUND_Y - b.h, b.w, b.h);
    ctx.fillStyle = '#333';
    ctx.fillRect(b.x + 6, GROUND_Y - b.h + 10, 10, 10);
    if (b.w > 30) ctx.fillRect(b.x + 22, GROUND_Y - b.h + 10, 10, 10);
    ctx.fillStyle = '#554';
    ctx.fillRect(b.x + 6, GROUND_Y - b.h + 30, 10, 10);
  }
}

function drawEnemies() {
  for (const enemy of enemies) {
    if (enemy.x + enemy.w < cameraX - 50 || enemy.x > cameraX + W + 50) continue;

    if (enemy.type === 'tank') {
      // Treads
      ctx.fillStyle = '#2a3020';
      ctx.fillRect(enemy.x - 2, enemy.y + 12, enemy.w + 4, 8);
      // Body
      ctx.fillStyle = '#4a5540';
      ctx.fillRect(enemy.x + 2, enemy.y + 5, enemy.w - 4, 10);
      // Turret dome
      ctx.fillStyle = '#3a4530';
      ctx.beginPath();
      ctx.arc(enemy.x + enemy.w / 2, enemy.y + 7, 9, Math.PI, 0);
      ctx.fill();
      // Gun barrel – rotates to aim at the helicopter
      const tankAngle = Math.atan2(
        (heli.y + heli.h / 2) - (enemy.y + 7),
        (heli.x + heli.w / 2) - (enemy.x + enemy.w / 2)
      );
      ctx.save();
      ctx.translate(enemy.x + enemy.w / 2, enemy.y + 7);
      ctx.rotate(tankAngle);
      ctx.fillStyle = '#222';
      ctx.fillRect(0, -2, 24, 5);
      ctx.restore();

    } else if (enemy.type === 'launcher') {
      // Platform
      ctx.fillStyle = '#3a4a3a';
      ctx.fillRect(enemy.x, enemy.y + 16, enemy.w, 12);
      // Launch tube angles toward helicopter
      const launchAngle = Math.atan2(
        (heli.y + heli.h / 2) - (enemy.y + 16),
        (heli.x + heli.w / 2) - (enemy.x + enemy.w / 2)
      );
      ctx.save();
      ctx.translate(enemy.x + enemy.w / 2, enemy.y + 16);
      ctx.rotate(launchAngle);
      ctx.fillStyle = '#778877';
      ctx.fillRect(-4, -20, 8, 20);
      ctx.fillStyle = '#99aa99';
      ctx.fillRect(-3, -22, 6, 5);
      ctx.restore();
    }
  }
}

function drawCivilian(civ, time) {
  if (civ.state === 'rescued' || civ.state === 'onBoard' || civ.state === 'dead') return;
  if (civ.x + civ.w < cameraX - 20 || civ.x > cameraX + W + 20) return;

  const { x, y, waveOffset, walkCycle, state, injuryTimer } = civ;
  const isInjured      = state === 'injured';
  const isBoarding     = state === 'boarding';
  const isDisembarking = state === 'disembarking';
  const isWalking      = isBoarding || isDisembarking;

  // Injured civilians blink (faster when almost out of time)
  if (isInjured) {
    const rate = injuryTimer < 2000 ? 140 : 380;
    if (Math.floor(time / rate) % 2 === 1) return;
  }

  // ── Animated legs ────────────────────────────────────────
  // Walking: legs alternate. Standing: legs still.
  const legSwing = isWalking ? Math.round(Math.sin(time * 0.015 + walkCycle) * 5) : 0;
  const leg1Y    = y + 18 + legSwing;
  const leg2Y    = y + 18 - legSwing;

  // ── Arms ─────────────────────────────────────────────────
  ctx.fillStyle = '#f0c080';
  if (isWalking) {
    // Arms swing opposite to legs when walking
    const armSwing = Math.round(Math.sin(time * 0.015 + walkCycle + Math.PI) * 4);
    ctx.fillRect(x - 4,  y + 10 + armSwing, 5, 4);
    ctx.fillRect(x + 11, y + 10 - armSwing, 5, 4);
  } else if (!isInjured) {
    // Waving arms when waiting
    const wave = Math.sin(time * 0.005 + waveOffset) * 0.3 + 0.3;
    ctx.fillRect(x - 4,  y + 9 - Math.round(wave * 6), 5, 4);
    ctx.fillRect(x + 11, y + 9 - Math.round(wave * 6), 5, 4);
  }

  // ── Legs ─────────────────────────────────────────────────
  ctx.fillStyle = isInjured ? '#772222' : isDisembarking ? '#225522' : '#33558a';
  ctx.fillRect(x + 2, leg1Y, 5, 10);
  ctx.fillRect(x + 9, leg2Y, 5, 10);

  // ── Body ─────────────────────────────────────────────────
  ctx.fillStyle = isInjured      ? '#bb2222' :
                  isDisembarking ? '#33aa44' : // green = safe, heading home
                  '#4488ff';
  ctx.fillRect(x + 1, y + 9, 14, 10);

  // ── Head ─────────────────────────────────────────────────
  ctx.fillStyle = '#f0c080';
  ctx.beginPath();
  ctx.arc(x + 8, y + 5, 6, 0, Math.PI * 2);
  ctx.fill();

  // ── Countdown bar (injured only) ─────────────────────────
  if (isInjured) {
    const fillW = Math.max(0, (injuryTimer / 5000) * 28);
    ctx.fillStyle = '#333';
    ctx.fillRect(x - 6, y - 12, 28, 5);
    ctx.fillStyle = injuryTimer < 2000 ? '#ff2222' : '#ff8800';
    ctx.fillRect(x - 6, y - 12, fillW, 5);
  }
}

function drawPlanes() {
  for (const plane of planes) {
    if (plane.x + plane.w < cameraX - 50 || plane.x > cameraX + W + 50) continue;
    const { x, y, w, h } = plane;
    ctx.fillStyle = '#9a5830';
    ctx.fillRect(x + 8, y, w - 16, h);           // wings
    ctx.fillStyle = '#7a4820';
    ctx.fillRect(x, y + 5, w, h - 10);            // fuselage
    ctx.fillStyle = '#444';
    ctx.fillRect(x, y + 7, 8, h - 14);            // nose
    ctx.fillStyle = '#88bbee';
    ctx.fillRect(x + 8, y + 7, 14, 8);            // cockpit
    ctx.fillStyle = '#9a5830';
    ctx.fillRect(x + w - 10, y - 4, 8, 12);       // tail fin
  }
}

function drawHelicopter() {
  // Flash during invincibility window
  if (invincible && Math.floor(invTimer / 140) % 2 === 1) return;

  const { x, y, w, h, facing } = heli;
  const cx = x + w / 2;
  const cy = y + h / 2;

  // Ground shadow (drawn before any transform so it stays flat)
  const shadowScale = 1 - (GROUND_Y - (y + h)) / GROUND_Y;
  ctx.fillStyle = `rgba(0,0,0,${0.15 * shadowScale})`;
  ctx.beginPath();
  ctx.ellipse(cx - 5, GROUND_Y + 4, (w / 2) * shadowScale, 5 * shadowScale, 0, 0, Math.PI * 2);
  ctx.fill();

  // Apply tilt + facing flip.
  // The sprite's default orientation is facing LEFT (cockpit on the left).
  // scale(-1,1) mirrors it to face RIGHT when facing === 1.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(heli.tiltAngle);
  if (facing === 1) ctx.scale(-1, 1);
  ctx.translate(-cx, -cy);

  if (heliSprite) {
    // Sprite bottom aligned with collision-box bottom; horizontally centred.
    const sx = x + w / 2 - SPRITE_W / 2;   // = x - 20
    const sy = y + h - SPRITE_H;             // = y - 8
    ctx.drawImage(heliSprite, sx, sy, SPRITE_W, SPRITE_H);

    // Animated main-rotor overlay (thin dark blade spinning on top of the
    // static rotor in the sprite image so the helicopter looks alive)
    const hubX = sx + ROTOR_HUB_SX;  // rotor hub in world space
    const hubY = sy + ROTOR_HUB_SY;
    ctx.save();
    ctx.translate(hubX, hubY);
    ctx.rotate(heli.rotorAngle);
    ctx.fillStyle = 'rgba(30,30,30,0.72)';
    ctx.fillRect(-42, -2, 84, 4);
    ctx.restore();
  } else {
    // ── Fallback shapes (shown for the first frame or two while image loads) ──
    ctx.fillStyle = '#6a8a6a';
    ctx.fillRect(x + w - 14, y + h / 2 - 4, 28, 7);

    ctx.save();
    ctx.translate(x + w + 13, y + h / 2 - 1);
    ctx.rotate(heli.rotorAngle * 2.5);
    ctx.fillStyle = '#bbb';
    ctx.fillRect(-13, -2, 26, 4);
    ctx.restore();

    ctx.fillStyle = '#4a7a4a';
    ctx.beginPath();
    ctx.roundRect(x, y + 7, w - 14, h - 6, 9);
    ctx.fill();

    ctx.fillStyle = '#a8ddf8';
    ctx.beginPath();
    ctx.roundRect(x + 6, y + 11, 30, 16, 5);
    ctx.fill();

    ctx.fillStyle = '#555';
    ctx.beginPath();
    ctx.arc(x + w / 2 - 7, y + 7, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(x + w / 2 - 7, y + 7);
    ctx.rotate(heli.rotorAngle);
    ctx.fillStyle = 'rgba(60,60,60,0.85)';
    ctx.fillRect(-38, -3, 76, 5);
    ctx.restore();
  }

  ctx.restore(); // end of facing-flip / tilt transform

  // Civilian count badge (drawn un-flipped so the number is always readable)
  if (heli.onBoard > 0) {
    ctx.fillStyle = '#ffdd00';
    ctx.beginPath();
    ctx.arc(x + w - 20, y + 4, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#333';
    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`+${heli.onBoard}`, x + w - 20, y + 9);
  }
}

function drawEnemyBullets() {
  for (const b of enemyBullets) {
    if (b.x < cameraX - 20 || b.x > cameraX + W + 20) continue;
    if (b.source === 'tank') {
      ctx.fillStyle = '#ffee00';
    } else if (b.source === 'launcher') {
      // Missile trail
      ctx.fillStyle = 'rgba(255, 140, 0, 0.35)';
      ctx.beginPath();
      ctx.arc(b.x - b.vx * 3, b.y - b.vy * 3, b.r * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff8800';
    } else {
      ctx.fillStyle = '#ff2222';
    }
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPlayerBullets() {
  ctx.fillStyle = '#00ffcc';
  for (const b of playerBullets) {
    if (b.x < cameraX - 20 || b.x > cameraX + W + 20) continue;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
    // Small bright trail
    ctx.fillStyle = 'rgba(0, 255, 200, 0.3)';
    ctx.beginPath();
    ctx.arc(b.x - b.vx * 2, b.y - b.vy * 2, b.r * 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#00ffcc';
  }
}

function drawExplosions() {
  for (const exp of explosions) {
    const progress = exp.timer / exp.duration;
    const alpha    = Math.max(0, 1 - progress);
    // Outer ring
    ctx.fillStyle = `rgba(255, 110, 0, ${alpha * 0.85})`;
    ctx.beginPath();
    ctx.arc(exp.x, exp.y, exp.r, 0, Math.PI * 2);
    ctx.fill();
    // Inner bright core
    ctx.fillStyle = `rgba(255, 240, 80, ${alpha})`;
    ctx.beginPath();
    ctx.arc(exp.x, exp.y, exp.r * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── Screen-space HUD ──────────────────────────────────────────

function drawHUD() {
  // -- Score panel (top-left) --
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  ctx.roundRect(8, 8, 170, 60, 8);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 20px Arial';
  ctx.textAlign = 'left';
  ctx.fillText(`Score: ${score}`, 18, 32);
  ctx.font = '14px Arial';
  ctx.fillStyle = '#ddd';
  ctx.fillText(`Rescued: ${totalRescued}`, 18, 55);

  // -- Lives panel (top-centre) --
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  ctx.roundRect(W / 2 - 78, 8, 156, 52, 8);
  ctx.fill();
  ctx.fillStyle = '#ddd';
  ctx.font = '11px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('LIVES', W / 2, 22);
  for (let i = 0; i < 3; i++) {
    const lx    = W / 2 - 58 + i * 44;
    const alive = i < lives;
    ctx.fillStyle = alive ? 'rgba(50,50,50,0.9)' : 'rgba(120,120,120,0.2)';
    ctx.fillRect(lx - 4, 28, 38, 3);
    ctx.fillStyle = alive ? '#4a7a4a' : '#2a3a2a';
    ctx.beginPath();
    ctx.roundRect(lx + 2, 31, 22, 11, 3);
    ctx.fill();
    ctx.fillStyle = alive ? '#6a8a6a' : '#3a4a3a';
    ctx.fillRect(lx + 20, 33, 10, 4);
  }

  // -- Capacity panel (top-right) --
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  ctx.roundRect(W - 175, 8, 167, 60, 8);
  ctx.fill();
  ctx.fillStyle = '#ddd';
  ctx.font = '13px Arial';
  ctx.textAlign = 'right';
  ctx.fillText('On board:', W - 12, 26);
  for (let i = 0; i < heli.maxOnBoard; i++) {
    const ix = W - 160 + i * 36;
    ctx.fillStyle = i < heli.onBoard ? '#4af' : 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.arc(ix + 10, 43, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(ix + 4, 50, 12, 10);
  }

  // -- Ammo panel (bottom-left) --
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  ctx.roundRect(8, H - 40, 210, 30, 6);
  ctx.fill();

  if (heli.reloading) {
    ctx.fillStyle = '#ff7700';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('RELOADING', 18, H - 22);
    const barX   = 105;
    const barW   = 105;
    const filled = (heli.reloadTimer / RELOAD_TIME) * barW;
    ctx.fillStyle = '#333';
    ctx.fillRect(barX, H - 33, barW, 10);
    ctx.fillStyle = '#ff9900';
    ctx.fillRect(barX, H - 33, filled, 10);
  } else {
    ctx.fillStyle = '#aaa';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('AMMO', 18, H - 22);
    for (let i = 0; i < MAX_AMMO; i++) {
      ctx.fillStyle = i < heli.ammo ? '#00ffcc' : '#2a3a3a';
      ctx.beginPath();
      ctx.arc(70 + i * 15, H - 25, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // -- Controls hint (bottom-centre) --
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.roundRect(W / 2 - 110, H - 26, 220, 20, 4);
  ctx.fill();
  ctx.fillStyle = '#888';
  ctx.font = '11px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Arrows: move   Space: shoot forward   B: shoot down', W / 2, H - 13);

  // -- Return to base arrow --
  if (heli.onBoard > 0 && cameraX > BASE_X + BASE_W) {
    const screens = Math.max(1, Math.round((heli.x - (BASE_X + BASE_W)) / W));
    const label   = screens === 1 ? '1 screen away' : `${screens} screens away`;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.beginPath();
    ctx.roundRect(W / 2 - 135, H - 68, 270, 28, 8);
    ctx.fill();
    ctx.fillStyle = '#ffdd00';
    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`← Return to base  (${label})`, W / 2, H - 50);
  }

  // -- Game Over overlay --
  if (gameOver) {
    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ff3333';
    ctx.font = 'bold 52px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', W / 2, H / 2 - 28);
    ctx.fillStyle = 'white';
    ctx.font = '22px Arial';
    ctx.fillText(`Score: ${score}   Rescued: ${totalRescued}`, W / 2, H / 2 + 22);
    ctx.fillStyle = '#aaa';
    ctx.font = '16px Arial';
    ctx.fillText('Press  R  to play again', W / 2, H / 2 + 62);
  }
}


// ============================================================
//  GAME LOOP  –  runs ~60 times per second
// ============================================================
function gameLoop(time) {
  const dt = lastTime === 0 ? 16 : Math.min(time - lastTime, 100);
  lastTime = time;

  update(dt);
  ctx.clearRect(0, 0, W, H);

  // 1. Screen-space background
  drawSkyAndGround();
  drawClouds();

  // 2. World-space objects
  ctx.save();
  ctx.translate(-Math.round(cameraX), 0);
  drawBase();
  drawWarzone();
  drawBuildings();
  drawEnemies();
  for (const civ of civilians) drawCivilian(civ, time);
  drawPlanes();
  drawHelicopter();
  drawEnemyBullets();
  drawPlayerBullets();
  drawExplosions();
  ctx.restore();

  // 3. Screen-space HUD
  drawHUD();

  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
