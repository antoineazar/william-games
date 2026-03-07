// ============================================================
//  SUPERCOPTER  –  a rescue helicopter game
//  Controls: Arrow keys to fly
//  Goal: rescue all civilians and bring them to base!
// ============================================================

// --- SETUP: get the canvas and its drawing tool ---
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');

const W = canvas.width;   // 900
const H = canvas.height;  // 500

// The ground sits 80px from the bottom
const GROUND_Y = H - 80;

// The safe base zone on the left side
const BASE_X = 20;
const BASE_W = 130;

// The warzone starts further to the right
const WARZONE_X = BASE_X + BASE_W + 60;

// Number of civilians to rescue
const NUM_CIVILIANS = 10;


// ============================================================
//  HELICOPTER  –  the player's vehicle
// ============================================================
const heli = {
  x:          BASE_X + 10,  // starting x position
  y:          GROUND_Y - 80, // starting y position
  w:          80,  // width
  h:          35,  // height
  speed:      4,   // pixels per frame
  onBoard:    0,   // how many civilians are currently on board
  maxOnBoard: 4,   // helicopter can carry up to 4 at a time
  rotorAngle: 0,   // used to spin the rotor
};


// ============================================================
//  CIVILIANS  –  the people waiting to be rescued
// ============================================================
const civilians = [];

for (let i = 0; i < NUM_CIVILIANS; i++) {
  civilians.push({
    x:     WARZONE_X + 20 + i * 67, // spread them across the warzone
    y:     GROUND_Y - 28,
    w:     16,
    h:     28,
    // Each civilian can be in one of three states:
    //   'waiting'  → standing on the ground
    //   'onBoard'  → riding in the helicopter
    //   'rescued'  → safely delivered to the base
    state: 'waiting',
    // A small wave animation offset so they don't all look identical
    waveOffset: Math.random() * Math.PI * 2,
  });
}


// ============================================================
//  INPUT  –  keep track of which keys are held down
// ============================================================
const keys = {};

window.addEventListener('keydown', e => {
  keys[e.key] = true;
  // Stop the page from scrolling when arrow keys are pressed
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
    e.preventDefault();
  }
});

window.addEventListener('keyup', e => {
  keys[e.key] = false;
});


// ============================================================
//  SCORE
// ============================================================
let score        = 0;
let totalRescued = 0;


// ============================================================
//  UPDATE  –  move things and check rules every frame
// ============================================================
function update() {

  // --- Move the helicopter ---
  if (keys['ArrowLeft'])  heli.x -= heli.speed;
  if (keys['ArrowRight']) heli.x += heli.speed;
  if (keys['ArrowUp'])    heli.y -= heli.speed;
  if (keys['ArrowDown'])  heli.y += heli.speed;

  // Keep the helicopter inside the canvas
  heli.x = Math.max(0, Math.min(W - heli.w, heli.x));
  heli.y = Math.max(15, Math.min(GROUND_Y - heli.h, heli.y));

  // Spin the rotor a little each frame
  heli.rotorAngle += 0.18;

  // Useful measurements
  const heliBottom  = heli.y + heli.h;
  const heliCenterX = heli.x + heli.w / 2;
  const isLow       = heliBottom >= GROUND_Y - 55; // flying close to the ground

  // --- Pick up waiting civilians ---
  if (heli.onBoard < heli.maxOnBoard) {
    for (const civ of civilians) {
      if (civ.state !== 'waiting') continue;

      const civCenterX = civ.x + civ.w / 2;
      const heliReach  = heli.w / 2 + civ.w / 2 + 10;

      if (isLow && Math.abs(heliCenterX - civCenterX) < heliReach) {
        civ.state = 'onBoard';
        heli.onBoard++;
      }
    }
  }

  // --- Drop off civilians at the base ---
  if (heli.onBoard > 0) {
    const overBase = heli.x + heli.w > BASE_X && heli.x < BASE_X + BASE_W;

    if (overBase && isLow) {
      const justRescued = heli.onBoard;
      score        += justRescued * 10;
      totalRescued += justRescued;
      heli.onBoard  = 0;

      for (const civ of civilians) {
        if (civ.state === 'onBoard') civ.state = 'rescued';
      }
    }
  }
}


// ============================================================
//  DRAW HELPERS
// ============================================================

function drawBackground() {
  // Sky
  ctx.fillStyle = '#87CEEB';
  ctx.fillRect(0, 0, W, GROUND_Y);

  // Clouds (static decorations)
  ctx.fillStyle = 'white';
  for (const [cx, cy, r] of [[150,60,28],[160,55,22],[138,55,20],[500,80,32],[515,74,24],[490,76,22],[780,50,26],[795,44,20]]) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Ground
  ctx.fillStyle = '#8B7355';
  ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);

  // Grass strip on top of the ground
  ctx.fillStyle = '#5a8a3a';
  ctx.fillRect(0, GROUND_Y, W, 8);

  // Base zone – green highlight behind the grass
  ctx.fillStyle = 'rgba(50, 200, 50, 0.18)';
  ctx.fillRect(BASE_X - 10, 0, BASE_W + 20, GROUND_Y);

  // Base ground colour (darker green)
  ctx.fillStyle = '#2d6a2d';
  ctx.fillRect(BASE_X - 10, GROUND_Y, BASE_W + 20, H - GROUND_Y);

  // Landing pad markings
  ctx.fillStyle = '#ffdd00';
  ctx.fillRect(BASE_X, GROUND_Y - 4, BASE_W, 6);

  // BASE label
  ctx.fillStyle = 'white';
  ctx.font = 'bold 14px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('BASE', BASE_X + BASE_W / 2, GROUND_Y + 28);

  // Warzone tint
  ctx.fillStyle = 'rgba(255, 60, 60, 0.07)';
  ctx.fillRect(WARZONE_X - 30, 0, W - WARZONE_X + 30, GROUND_Y);

  // WARZONE label
  ctx.fillStyle = '#cc4444';
  ctx.font = 'bold 15px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('! WARZONE', WARZONE_X - 20, 26);

  // Some simple buildings / ruins in the warzone
  const buildings = [
    { x: 280, w: 40, h: 70 },
    { x: 400, w: 55, h: 90 },
    { x: 520, w: 35, h: 55 },
    { x: 640, w: 50, h: 80 },
    { x: 760, w: 45, h: 65 },
  ];
  for (const b of buildings) {
    ctx.fillStyle = '#8a7060';
    ctx.fillRect(b.x, GROUND_Y - b.h, b.w, b.h);
    // Windows (some broken)
    ctx.fillStyle = '#333';
    ctx.fillRect(b.x + 6,  GROUND_Y - b.h + 10, 10, 10);
    ctx.fillRect(b.x + 22, GROUND_Y - b.h + 10, 10, 10);
    ctx.fillStyle = '#554';
    ctx.fillRect(b.x + 6,  GROUND_Y - b.h + 30, 10, 10);
  }
}

function drawCivilian(civ, time) {
  if (civ.state !== 'waiting') return;

  const x = civ.x;
  const y = civ.y;
  // Tiny wave animation: arms go up when helicopter is near
  const wave = Math.sin(time * 0.005 + civ.waveOffset) * 0.3 + 0.3;

  // Legs
  ctx.fillStyle = '#33558a';
  ctx.fillRect(x + 2,  y + 18, 5, 10);
  ctx.fillRect(x + 9,  y + 18, 5, 10);

  // Body
  ctx.fillStyle = '#4488ff';
  ctx.fillRect(x + 1, y + 9, 14, 10);

  // Arms (raised slightly, waving)
  ctx.fillStyle = '#f0c080';
  ctx.fillRect(x - 4, y + 9 - Math.round(wave * 6), 5, 4);
  ctx.fillRect(x + 11, y + 9 - Math.round(wave * 6), 5, 4);

  // Head
  ctx.fillStyle = '#f0c080';
  ctx.beginPath();
  ctx.arc(x + 8, y + 5, 6, 0, Math.PI * 2);
  ctx.fill();
}

function drawHelicopter() {
  const x = heli.x;
  const y = heli.y;
  const w = heli.w;
  const h = heli.h;

  // Shadow on the ground (gets smaller when higher up)
  const shadowScale = 1 - (GROUND_Y - (y + h)) / GROUND_Y;
  ctx.fillStyle = `rgba(0,0,0,${0.15 * shadowScale})`;
  ctx.beginPath();
  ctx.ellipse(x + w / 2 - 5, GROUND_Y + 4, (w / 2) * shadowScale, 5 * shadowScale, 0, 0, Math.PI * 2);
  ctx.fill();

  // Tail boom
  ctx.fillStyle = '#6a8a6a';
  ctx.fillRect(x + w - 14, y + h / 2 - 4, 28, 7);

  // Tail rotor
  ctx.save();
  ctx.translate(x + w + 13, y + h / 2 - 1);
  ctx.rotate(heli.rotorAngle * 2.5);
  ctx.fillStyle = '#bbb';
  ctx.fillRect(-13, -2, 26, 4);
  ctx.restore();

  // Main body
  ctx.fillStyle = '#4a7a4a';
  ctx.beginPath();
  ctx.roundRect(x, y + 7, w - 14, h - 6, 9);
  ctx.fill();

  // Window / cockpit
  ctx.fillStyle = '#a8ddf8';
  ctx.beginPath();
  ctx.roundRect(x + 6, y + 11, 30, 16, 5);
  ctx.fill();

  // Window glare
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath();
  ctx.roundRect(x + 8, y + 13, 10, 6, 3);
  ctx.fill();

  // Main rotor hub
  ctx.fillStyle = '#555';
  ctx.beginPath();
  ctx.arc(x + w / 2 - 7, y + 7, 4, 0, Math.PI * 2);
  ctx.fill();

  // Main rotor blades
  ctx.save();
  ctx.translate(x + w / 2 - 7, y + 7);
  ctx.rotate(heli.rotorAngle);
  ctx.fillStyle = 'rgba(60,60,60,0.85)';
  ctx.fillRect(-38, -3, 76, 5);
  ctx.restore();

  // Civilian count badge on the helicopter
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

function drawHUD() {
  // --- Score panel (top-left) ---
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
  ctx.fillText(`Rescued: ${totalRescued} / ${NUM_CIVILIANS}`, 18, 55);

  // --- Capacity panel (top-right) ---
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  ctx.roundRect(W - 175, 8, 167, 60, 8);
  ctx.fill();

  ctx.fillStyle = '#ddd';
  ctx.font = '13px Arial';
  ctx.textAlign = 'right';
  ctx.fillText('On board:', W - 12, 26);

  // Little person icons showing capacity
  for (let i = 0; i < heli.maxOnBoard; i++) {
    const ix = W - 160 + i * 36;
    ctx.fillStyle = i < heli.onBoard ? '#4af' : 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.arc(ix + 10, 43, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(ix + 4, 50, 12, 10);
  }

  // --- "All rescued!" banner ---
  if (totalRescued === NUM_CIVILIANS) {
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.beginPath();
    ctx.roundRect(W / 2 - 210, H / 2 - 65, 420, 110, 14);
    ctx.fill();

    ctx.fillStyle = '#ffdd00';
    ctx.font = 'bold 34px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('All Rescued!', W / 2, H / 2 - 12);

    ctx.fillStyle = 'white';
    ctx.font = '20px Arial';
    ctx.fillText(`Final Score: ${score}`, W / 2, H / 2 + 28);
  }
}


// ============================================================
//  GAME LOOP  –  runs ~60 times per second
// ============================================================
function gameLoop(time) {
  // 1. Update all the game logic
  update();

  // 2. Clear the screen
  ctx.clearRect(0, 0, W, H);

  // 3. Draw everything
  drawBackground();

  for (const civ of civilians) {
    drawCivilian(civ, time);
  }

  drawHelicopter();
  drawHUD();

  // 4. Ask the browser to call this function again next frame
  requestAnimationFrame(gameLoop);
}

// Kick off the game!
requestAnimationFrame(gameLoop);
