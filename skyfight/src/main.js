import { Game, SPRITE_PATHS } from "./game.js";
import { drawRadar } from "./ui/radar.js";
import { updateHud } from "./ui/hud.js";

const canvas = document.getElementById("gameCanvas");
const radarCanvas = document.getElementById("radarCanvas");
const radarCtx = radarCanvas.getContext("2d");
const hudElements = {
  levelValue: document.getElementById("levelValue"),
  scoreValue: document.getElementById("scoreValue"),
  healthValue: document.getElementById("healthValue"),
  statusLabel: document.getElementById("statusLabel"),
  effectBanner: document.getElementById("effectBanner"),
  effectBannerTitle: document.getElementById("effectBannerTitle"),
  effectBannerSub: document.getElementById("effectBannerSub"),
  finalScoreValue: document.getElementById("finalScoreValue"),
  gameOverMessage: document.getElementById("gameOverMessage"),
  gameOverOverlay: document.getElementById("gameOverOverlay"),
  levelCompleteOverlay: document.getElementById("levelCompleteOverlay"),
  levelCompleteText: document.getElementById("levelCompleteText"),
  jetUnlockPanel: document.getElementById("jetUnlockPanel"),
  unlockedJetImage: document.getElementById("unlockedJetImage"),
  unlockedJetName: document.getElementById("unlockedJetName"),
};
const restartButton = document.getElementById("restartButton");
const nextLevelButton = document.getElementById("nextLevelButton");
const leaderboardList = document.getElementById("leaderboardList");
const leaderboardPrompt = document.getElementById("leaderboardPrompt");
const leaderboardPromptText = document.getElementById("leaderboardPromptText");
const leaderboardForm = document.getElementById("leaderboardForm");
const leaderboardNameInput = document.getElementById("leaderboardNameInput");
const instructionsOverlay = document.getElementById("instructionsOverlay");
const startGameButton = document.getElementById("startGameButton");

const input = {
  left: false,
  right: false,
  throttleUp: false,
  throttleDown: false,
  fire: false,
};

const sprites = await loadSprites(SPRITE_PATHS);
const game = new Game(canvas, sprites);
const LEADERBOARD_KEY = "skyfight.leaderboard.v1";
const LEADERBOARD_SIZE = 20;
let leaderboard = loadLeaderboard();
let gameOverHandled = false;
let hasStarted = false;
renderLeaderboard(leaderboard);
const backgroundMusic = createBackgroundMusic("./assets/music/CrabRaveLoop.mov");
enableMusicOnFirstInteraction(backgroundMusic);
let cheatBuffer = "";

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function onKeyChange(event, isDown) {
  if (!hasStarted) return;
  const key = event.key.toLowerCase();
  if (isDown && /^[a-z]$/.test(key)) {
    cheatBuffer = `${cheatBuffer}${key}`.slice(-12);
    if (cheatBuffer.includes("win")) {
      cheatBuffer = "";
      game.forceCompleteLevel();
      gameOverHandled = false;
      hideLeaderboardPrompt();
    }
    if (cheatBuffer.includes("god")) {
      cheatBuffer = "";
      game.toggleInvincibilityCheat();
    }
    if (cheatBuffer.includes("willy")) {
      cheatBuffer = "";
      const value = window.prompt("Cheat code accepted. Enter level number:");
      const level = Number(value);
      if (Number.isFinite(level) && level > 0) {
        game.jumpToLevel(level);
        gameOverHandled = false;
        hideLeaderboardPrompt();
      }
    }
  }

  if (["arrowleft", "a"].includes(key)) input.left = isDown;
  if (["arrowright", "d"].includes(key)) input.right = isDown;
  if (["arrowup", "w"].includes(key)) input.throttleUp = isDown;
  if (["arrowdown", "s"].includes(key)) input.throttleDown = isDown;
  if (key === " ") {
    input.fire = isDown;
    event.preventDefault();
  }
}

window.addEventListener("resize", resizeCanvas);
window.addEventListener("keydown", (event) => onKeyChange(event, true));
window.addEventListener("keyup", (event) => onKeyChange(event, false));
startGameButton.addEventListener("click", () => {
  hasStarted = true;
  instructionsOverlay.classList.add("hidden");
  lastTime = performance.now();
});
restartButton.addEventListener("click", () => {
  game.reset();
  gameOverHandled = false;
  hideLeaderboardPrompt();
});
nextLevelButton.addEventListener("click", () => {
  game.startNextLevel();
  gameOverHandled = false;
});
leaderboardForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!game.isOver) return;

  const safeName = sanitizeName(leaderboardNameInput.value);
  leaderboard = addScore(leaderboard, safeName, game.score);
  saveLeaderboard(leaderboard);
  renderLeaderboard(leaderboard);
  leaderboardPromptText.textContent = "Score saved!";
  leaderboardForm.classList.add("hidden");
});

resizeCanvas();

let lastTime = performance.now();
function frame(now) {
  if (!hasStarted) {
    game.render();
    drawRadar(radarCtx, radarCanvas, game);
    requestAnimationFrame(frame);
    return;
  }
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;

  game.update(dt, input);
  game.render();
  drawRadar(radarCtx, radarCanvas, game);
  updateHud(game, hudElements);
  handleGameOverLeaderboardFlow();

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function createBackgroundMusic(path) {
  const music = new Audio(path);
  music.loop = true;
  music.preload = "auto";
  music.volume = 0.32;
  music.addEventListener("error", () => {
    console.warn(`Could not load background music: ${path}`);
  });
  return music;
}

function enableMusicOnFirstInteraction(music) {
  if (!music) return;
  const startMusic = () => {
    music.play().catch(() => {
      // Browser blocked autoplay until another interaction.
    });
  };

  const unlockMusic = () => {
    startMusic();
    window.removeEventListener("pointerdown", unlockMusic);
    window.removeEventListener("keydown", unlockMusic);
    window.removeEventListener("touchstart", unlockMusic);
  };

  window.addEventListener("pointerdown", unlockMusic);
  window.addEventListener("keydown", unlockMusic);
  window.addEventListener("touchstart", unlockMusic, { passive: true });

  // Try immediately in browsers that permit autoplay.
  startMusic();
}

function handleGameOverLeaderboardFlow() {
  if (!game.isOver) return;
  if (gameOverHandled) return;
  gameOverHandled = true;

  renderLeaderboard(leaderboard);
  if (isTopScore(game.score, leaderboard)) {
    leaderboardPromptText.textContent = "Top 20! Enter your name:";
    leaderboardForm.classList.remove("hidden");
    leaderboardPrompt.classList.remove("hidden");
    leaderboardNameInput.value = "";
    leaderboardNameInput.focus();
  } else {
    hideLeaderboardPrompt();
  }
}

async function loadSprites(paths) {
  const entries = Object.entries(paths);
  const loaded = await Promise.all(
    entries.map(async ([key, path]) => {
      try {
        const img = await loadImage(path);
        return [key, shouldRemoveBackground(key) ? removeConnectedLightBackground(img) : img];
      } catch (error) {
        console.warn(`Could not load sprite for ${key}:`, error);
        return [key, null];
      }
    })
  );

  return Object.fromEntries(loaded);
}

function loadImage(path) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${path}`));
    img.src = path;
  });
}

function shouldRemoveBackground(key) {
  return (
    key === "enemy" ||
    key === "boss1" ||
    key === "boss2" ||
    key === "boss3" ||
    key === "boss4" ||
    key === "jet1" ||
    key === "jet2" ||
    key === "f18" ||
    key === "jet4" ||
    key === "jetStealth" ||
    key === "missile" ||
    key === "missileHoming"
  );
}

function removeConnectedLightBackground(image) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(image, 0, 0);

  const imageData = ctx.getImageData(0, 0, width, height);
  const { data } = imageData;
  const visited = new Uint8Array(width * height);
  const stack = [];

  const pushIfBackground = (x, y) => {
    const idx = y * width + x;
    if (visited[idx]) return;
    if (!isBackgroundPixel(data, idx)) return;
    visited[idx] = 1;
    stack.push(idx);
  };

  for (let x = 0; x < width; x += 1) {
    pushIfBackground(x, 0);
    pushIfBackground(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    pushIfBackground(0, y);
    pushIfBackground(width - 1, y);
  }

  while (stack.length > 0) {
    const idx = stack.pop();
    const px = idx % width;
    const py = Math.floor(idx / width);
    data[idx * 4 + 3] = 0;

    if (px > 0) pushIfBackground(px - 1, py);
    if (px < width - 1) pushIfBackground(px + 1, py);
    if (py > 0) pushIfBackground(px, py - 1);
    if (py < height - 1) pushIfBackground(px, py + 1);
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function isBackgroundPixel(data, pixelIndex) {
  const i = pixelIndex * 4;
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  const a = data[i + 3];
  if (a < 8) return true;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const brightness = (r + g + b) / 3;

  // Keep only very light, low-saturation edge-connected regions.
  return brightness > 205 && max - min < 32;
}

function loadLeaderboard() {
  try {
    const raw = window.localStorage.getItem(LEADERBOARD_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((entry) => ({
        name: sanitizeName(entry.name),
        score: Number(entry.score) || 0,
      }))
      .filter((entry) => entry.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, LEADERBOARD_SIZE);
  } catch {
    return [];
  }
}

function saveLeaderboard(board) {
  window.localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(board.slice(0, LEADERBOARD_SIZE)));
}

function addScore(board, name, score) {
  const next = [...board, { name, score: Math.max(0, Math.floor(score)) }];
  next.sort((a, b) => b.score - a.score);
  return next.slice(0, LEADERBOARD_SIZE);
}

function isTopScore(score, board) {
  const normalized = Math.max(0, Math.floor(score));
  if (board.length < LEADERBOARD_SIZE) return normalized > 0;
  return normalized > board[board.length - 1].score;
}

function sanitizeName(name) {
  const clean = String(name || "")
    .toUpperCase()
    .replace(/[^A-Z0-9 _.-]/g, "")
    .trim();
  return (clean || "ACE").slice(0, 12);
}

function renderLeaderboard(board) {
  leaderboardList.innerHTML = "";
  const rows = board.length > 0 ? board : [{ name: "---", score: 0 }];

  for (let i = 0; i < LEADERBOARD_SIZE; i += 1) {
    const entry = rows[i] || { name: "---", score: 0 };
    const li = document.createElement("li");
    li.className = `leaderboardRow ${i < 3 ? "topRank" : ""}`;
    li.innerHTML = `
      <span>${String(i + 1).padStart(2, "0")}.</span>
      <span>${entry.name}</span>
      <span>${String(entry.score).padStart(4, " ")}</span>
    `;
    leaderboardList.appendChild(li);
  }
}

function hideLeaderboardPrompt() {
  leaderboardPrompt.classList.add("hidden");
  leaderboardForm.classList.remove("hidden");
}
