import { Player } from "./entities/player.js";
import { Enemy } from "./entities/enemy.js";
import { Missile } from "./entities/missile.js";

export const SPRITE_PATHS = {
  jet1: "./assets/sprites/jet1.png",
  jet2: "./assets/sprites/jet2.png",
  f18: "./assets/sprites/f18.png",
  jet4: "./assets/sprites/jet4.png",
  jetStealth: "./assets/sprites/jet-stealth.png",
  enemy: "./assets/sprites/mig.png",
  boss1: "./assets/sprites/boss1.png",
  boss2: "./assets/sprites/boss2.png",
  boss3: "./assets/sprites/boss3.png",
  boss4: "./assets/sprites/boss4.png",
  missile: "./assets/sprites/missile1.png",
  missileHoming: "./assets/sprites/missile-homing.png",
};

export class Game {
  constructor(canvas, sprites) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.sprites = sprites;

    this.world = { width: 3600, height: 2400 };
    this.player = new Player(this.world.width / 2, this.world.height / 2);
    this.player.speed = 230;
    this.player.maxHp = 2;
    this.player.hp = this.player.maxHp;
    this.player.radius = 30;

    this.enemies = [];
    this.boss = null;
    this.missiles = [];
    this.explosions = [];
    this.powerups = [];
    this.activeEffects = {};
    this.camera = { x: 0, y: 0 };

    this.score = 0;
    this.isOver = false;
    this.playerDestroyed = false;
    this.playerHitFlash = 0;
    this.playerDestroyedAnim = 0;
    this.levelComplete = false;
    this.levelCompleteAnimTime = 0;
    this.levelCompleteOverlayDelay = 2.4;
    this.levelCompleteTextDuration = 1.0;
    this.levelCompleteFlybyDuration = 2.2;
    this.bossDefeatDelay = 1.15;
    this.bossDefeatTimer = 0;
    this.bossIntroDuration = 2.0;
    this.bossIntroTimer = 0;
    this.level = 1;
    this.levelPhase = "wave";
    this.waveKills = 0;
    this.waveSpawned = 0;
    this.waveTargetKills = this.getWaveTargetKills(this.level);
    this.spawnTimer = 0;
    this.powerupSpawnTimer = randomRange(3, 6);
    this.jetConfig = this.getJetConfigForLevel(this.level);
    this.player.maxHp = this.jetConfig.shield;
    this.player.hp = this.player.maxHp;
    this.player.fireInterval = this.jetConfig.fireInterval;
    this.godMode = false;
    this.clouds = this.createCloudField();
  }

  reset() {
    this.score = 0;
    this.level = 1;
    this.startLevel(this.level);
  }

  startNextLevel() {
    if (!this.levelComplete) return;
    this.level += 1;
    this.startLevel(this.level);
  }

  startLevel(level) {
    this.jetConfig = this.getJetConfigForLevel(level);
    this.player = new Player(this.world.width / 2, this.world.height / 2);
    this.player.speed = 230;
    this.player.maxHp = this.jetConfig.shield;
    this.player.hp = this.player.maxHp;
    this.player.radius = 30;
    this.player.fireInterval = this.jetConfig.fireInterval;

    this.enemies = [];
    this.boss = null;
    this.missiles = [];
    this.explosions = [];
    this.powerups = [];
    this.activeEffects = {};
    this.camera = { x: 0, y: 0 };

    this.isOver = false;
    this.playerDestroyed = false;
    this.playerHitFlash = 0;
    this.playerDestroyedAnim = 0;
    this.levelComplete = false;
    this.levelCompleteAnimTime = 0;
    this.bossIntroTimer = 0;
    this.bossDefeatTimer = 0;
    this.levelPhase = "wave";
    this.waveKills = 0;
    this.waveSpawned = 0;
    this.waveTargetKills = this.getWaveTargetKills(level);
    this.spawnTimer = 0.2;
    this.powerupSpawnTimer = randomRange(3, 6);
  }

  update(dt, input) {
    if (this.isOver) {
      this.updateExplosions(dt);
      this.updatePlayerImpactEffects(dt);
      return;
    }
    if (this.playerDestroyed) {
      this.updateExplosions(dt);
      this.updatePlayerImpactEffects(dt);
      if (this.playerDestroyedAnim <= 0) {
        this.isOver = true;
      }
      return;
    }
    if (this.bossIntroTimer > 0) {
      this.bossIntroTimer = Math.max(0, this.bossIntroTimer - dt);
      return;
    }
    if (this.bossDefeatTimer > 0) {
      this.bossDefeatTimer = Math.max(0, this.bossDefeatTimer - dt);
      this.updateExplosions(dt);
      this.updatePlayerImpactEffects(dt);
      if (this.bossDefeatTimer <= 0) {
        this.levelComplete = true;
        this.levelCompleteAnimTime = 0;
      }
      return;
    }
    if (this.levelComplete) {
      this.levelCompleteAnimTime += dt;
      return;
    }

    const targetVisible = !this.isEffectActive("cloak");

    if (this.levelPhase === "wave") {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.waveSpawned < this.waveTargetKills) {
        this.spawnEnemy();
        this.spawnTimer = 2.0;
      }
    }

    this.player.update(dt, input, this.world);
    this.updatePowerupSpawn(dt);
    this.updatePowerups(dt);
    this.handlePowerupPickup();
    this.updateActiveEffects(dt);

    if (input.fire && this.player.canFire()) {
      this.firePlayerMissile();
      this.player.onFire();
    }

    for (const enemy of this.enemies) {
      enemy.update(dt, this.player, this.world, targetVisible);
      if (enemy.canFireAt(this.player, targetVisible)) {
        this.fireEnemyMissile(enemy);
        enemy.onFire();
      }
    }

    if (this.boss) {
      this.updateBoss(dt, targetVisible);
    }

    for (const missile of this.missiles) {
      const target =
        missile.homing && missile.friendly ? this.findNearestTarget(missile.x, missile.y) : null;
      missile.update(dt, target);
    }

    this.handleMissileHits();
    this.cleanupDeadObjects();
    this.updateExplosions(dt);
    this.updatePlayerImpactEffects(dt);

    if (this.levelPhase === "wave" && this.waveKills >= this.waveTargetKills && this.enemies.length === 0) {
      this.startBossFight();
    }

    if (this.player.hp <= 0) {
      this.player.hp = 0;
      if (!this.playerDestroyed) {
        this.playerDestroyed = true;
        this.playerDestroyedAnim = 1.2;
        this.spawnExplosion(this.player.x, this.player.y, "big");
      }
    }
  }

  render() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const zoom = this.getViewportZoom();
    const viewW = w / zoom;
    const viewH = h / zoom;

    this.camera.x = this.player.x - viewW / 2;
    this.camera.y = this.player.y - viewH / 2;
    this.camera.x = clamp(this.camera.x, 0, this.world.width - viewW);
    this.camera.y = clamp(this.camera.y, 0, this.world.height - viewH);

    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.scale(zoom, zoom);
    this.drawSkyBackdrop(viewW, viewH);
    this.drawSpeedLines();
    this.drawWorldGuides();

    for (const missile of this.missiles) this.drawMissile(missile);
    for (const powerup of this.powerups) this.drawPowerup(powerup);
    for (const explosion of this.explosions) this.drawExplosion(explosion);

    const wingmen =
      this.isEffectActive("wingmen") && !this.levelComplete ? this.getWingmanPositions() : [];
    if (!this.levelComplete) {
      this.drawPlayerEffectAuras(wingmen);
    }

    for (const enemy of this.enemies) this.drawPlane(enemy, false);
    if (this.boss) this.drawBoss();
    if (!this.levelComplete) {
      this.drawWingmen(wingmen);
      if (!this.playerDestroyed) {
        this.drawPlane(this.player, true);
      } else {
        this.drawDestroyedPlayerEffect();
      }
    }
    if (this.levelComplete) {
      const phase = this.getLevelCompletePhase();
      if (phase === "flyby") this.drawLevelCompleteFlyby();
    }
    ctx.restore();

    this.drawArcadeBars(w);
    if (this.isBossIntroActive()) {
      this.drawBossIncomingWarning(w);
    }
    if (this.levelComplete) {
      const phase = this.getLevelCompletePhase();
      if (phase === "text") this.drawLevelCompleteTextNoOverlay();
    }
  }

  spawnEnemy() {
    if (this.levelPhase !== "wave") return;
    if (this.waveSpawned >= this.waveTargetKills) return;
    const margin = 220;
    let x = Math.random() * this.world.width;
    let y = Math.random() * this.world.height;

    if (Math.random() < 0.5) {
      x = Math.random() < 0.5 ? margin : this.world.width - margin;
    } else {
      y = Math.random() < 0.5 ? margin : this.world.height - margin;
    }

    this.enemies.push(new Enemy(x, y));
    this.waveSpawned += 1;
  }

  startBossFight() {
    this.levelPhase = "boss";
    this.enemies = [];
    this.missiles = [];
    this.powerups = [];
    this.activeEffects = {};
    this.player.fireInterval = this.jetConfig.fireInterval;
    const maxShield = this.getBossShield(this.level);
    const spawn = this.getBossSpawnNearScreenEdge();
    this.boss = {
      x: spawn.x,
      y: spawn.y,
      angle: Math.PI / 2,
      speed: 120,
      turnRate: 1.1,
      radius: 56,
      maxHp: maxShield,
      hp: maxShield,
      fireCooldown: 0.8,
      fireInterval: 0.95,
      shots: this.getBossShotCount(this.level),
      attackRange: 920,
      wanderTurn: 0.4,
      wanderTimer: 1.1,
    };
    this.bossIntroTimer = this.bossIntroDuration;
  }

  getBossSpawnNearScreenEdge() {
    const view = this.getViewBounds();
    const inset = 58;
    const side = Math.floor(Math.random() * 4);
    let x = this.player.x;
    let y = this.player.y;

    if (side === 0) {
      x = randomRange(view.x + inset, view.x + view.w - inset);
      y = view.y + inset;
    } else if (side === 1) {
      x = randomRange(view.x + inset, view.x + view.w - inset);
      y = view.y + view.h - inset;
    } else if (side === 2) {
      x = view.x + inset;
      y = randomRange(view.y + inset, view.y + view.h - inset);
    } else {
      x = view.x + view.w - inset;
      y = randomRange(view.y + inset, view.y + view.h - inset);
    }

    return {
      x: clamp(x, 120, this.world.width - 120),
      y: clamp(y, 120, this.world.height - 120),
    };
  }

  updateBoss(dt, targetVisible) {
    const boss = this.boss;
    if (!boss) return;

    if (targetVisible) {
      const targetAngle = Math.atan2(this.player.y - boss.y, this.player.x - boss.x);
      const delta = normalizeAngle(targetAngle - boss.angle);
      boss.angle += Math.sign(delta) * Math.min(Math.abs(delta), boss.turnRate * dt);
    } else {
      boss.wanderTimer -= dt;
      if (boss.wanderTimer <= 0) {
        boss.wanderTimer = randomRange(0.8, 1.6);
        boss.wanderTurn = (Math.random() - 0.5) * 1.0;
      }
      boss.angle += boss.wanderTurn * dt;
    }

    boss.x += Math.cos(boss.angle) * boss.speed * dt;
    boss.y += Math.sin(boss.angle) * boss.speed * dt;
    boss.x = clamp(boss.x, 120, this.world.width - 120);
    boss.y = clamp(boss.y, 120, this.world.height - 120);

    boss.fireCooldown -= dt;
    if (targetVisible && boss.fireCooldown <= 0 && distance(boss, this.player) <= boss.attackRange) {
      this.fireBossMissile();
      boss.fireCooldown = boss.fireInterval;
    }
  }

  fireBossMissile() {
    if (!this.boss) return;
    const boss = this.boss;
    const offsets = this.getBossShotOffsets();
    for (const offset of offsets) {
      const angle = boss.angle + offset;
      this.missiles.push(
        new Missile({
          x: boss.x + Math.cos(angle) * 28,
          y: boss.y + Math.sin(angle) * 28,
          angle,
          speed: 600,
          friendly: false,
        })
      );
    }
  }

  firePlayerMissile() {
    const homing = this.isEffectActive("heatseek");
    const origins = [{ x: this.player.x, y: this.player.y, angle: this.player.angle }];
    if (this.isEffectActive("wingmen")) origins.push(...this.getWingmanPositions());
    const shotOffsets = this.getJetShotOffsets();

    for (const origin of origins) {
      for (const offset of shotOffsets) {
        this.missiles.push(
          new Missile({
            x: origin.x + Math.cos(origin.angle) * 20,
            y: origin.y + Math.sin(origin.angle) * 20,
            angle: origin.angle + offset,
            speed: 780,
            friendly: true,
            homing,
          })
        );
      }
    }
  }

  fireEnemyMissile(enemy) {
    this.missiles.push(
      new Missile({
        x: enemy.x + Math.cos(enemy.angle) * 16,
        y: enemy.y + Math.sin(enemy.angle) * 16,
        angle: enemy.angle,
        speed: 530,
        friendly: false,
      })
    );
  }

  handleMissileHits() {
    for (const missile of this.missiles) {
      if (!missile.isAlive(this.world)) continue;

      if (missile.friendly) {
        let hit = false;

        if (this.boss && isSweptColliding(missile, this.boss)) {
          this.boss.hp -= 1;
          missile.life = 0;
          this.spawnExplosion(this.boss.x, this.boss.y, this.boss.hp <= 0 ? "big" : "small");
          if (this.boss.hp <= 0) {
            this.score += 5;
            this.triggerBossDefeatSequence(this.boss.x, this.boss.y);
            this.boss = null;
          }
          continue;
        }

        for (const enemy of this.enemies) {
          if (enemy.hp <= 0) continue;
          if (!isSweptColliding(missile, enemy)) continue;
          enemy.hp -= missile.damage;
          missile.life = 0;
          this.spawnExplosion(enemy.x, enemy.y, enemy.hp <= 0 ? "big" : "small");
          if (enemy.hp <= 0) {
            this.score += 1;
            this.waveKills += 1;
          }
          hit = true;
          break;
        }
        if (hit) continue;
      } else if (!this.isEffectActive("invincible") && isSweptColliding(missile, this.player)) {
        this.player.hp -= 1;
        this.playerHitFlash = 0.2;
        missile.life = 0;
        this.spawnExplosion(this.player.x, this.player.y, "small");
      }
    }
  }

  spawnExplosion(x, y, size) {
    const particles = [];
    const count = size === "big" ? 24 : 10;
    const speedMin = size === "big" ? 100 : 70;
    const speedMax = size === "big" ? 280 : 170;
    const lifeMin = size === "big" ? 0.32 : 0.2;
    const lifeMax = size === "big" ? 0.72 : 0.45;

    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = speedMin + Math.random() * (speedMax - speedMin);
      const life = lifeMin + Math.random() * (lifeMax - lifeMin);
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 2 + Math.random() * 5,
        life,
        maxLife: life,
      });
    }
    this.explosions.push({ particles });
  }

  triggerBossDefeatSequence(x, y) {
    this.levelPhase = "complete";
    this.missiles = [];
    this.powerups = [];
    this.activeEffects = {};
    this.player.fireInterval = this.jetConfig.fireInterval;
    this.bossDefeatTimer = this.bossDefeatDelay;

    // Multi-burst finale so the boss death reads clearly.
    this.spawnExplosion(x, y, "big");
    this.spawnExplosion(x + randomRange(-36, 36), y + randomRange(-28, 28), "big");
    this.spawnExplosion(x + randomRange(-44, 44), y + randomRange(-34, 34), "small");
    this.spawnExplosion(x + randomRange(-56, 56), y + randomRange(-40, 40), "small");
  }

  updateExplosions(dt) {
    for (const explosion of this.explosions) {
      for (const particle of explosion.particles) {
        if (particle.life <= 0) continue;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.vx *= 0.92;
        particle.vy *= 0.92;
        particle.life -= dt;
      }
    }

    this.explosions = this.explosions.filter((explosion) =>
      explosion.particles.some((particle) => particle.life > 0)
    );
  }

  cleanupDeadObjects() {
    this.enemies = this.enemies.filter((enemy) => enemy.hp > 0);
    this.missiles = this.missiles.filter((missile) => missile.isAlive(this.world));
  }

  updatePowerupSpawn(dt) {
    this.powerupSpawnTimer -= dt;
    if (this.powerupSpawnTimer > 0) return;
    if (this.powerups.length >= 2) {
      this.powerupSpawnTimer = randomRange(3, 6);
      return;
    }
    this.spawnPowerup();
    this.powerupSpawnTimer = randomRange(8, 12);
  }

  spawnPowerup() {
    const angle = Math.random() * Math.PI * 2;
    const distance = randomRange(180, 420);
    const x = clamp(this.player.x + Math.cos(angle) * distance, 120, this.world.width - 120);
    const y = clamp(this.player.y + Math.sin(angle) * distance, 120, this.world.height - 120);
    const type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
    this.powerups.push({ x, y, radius: 22, type, life: 10, maxLife: 10 });
  }

  updatePowerups(dt) {
    for (const powerup of this.powerups) powerup.life -= dt;
    this.powerups = this.powerups.filter((powerup) => powerup.life > 0);
  }

  handlePowerupPickup() {
    for (const powerup of this.powerups) {
      if (!isColliding(powerup, this.player)) continue;
      this.activeEffects[powerup.type] = 10;
      powerup.life = 0;
    }
  }

  updateActiveEffects(dt) {
    this.player.fireInterval = this.jetConfig.fireInterval;
    for (const type of Object.keys(this.activeEffects)) {
      this.activeEffects[type] -= dt;
      if (this.activeEffects[type] <= 0) delete this.activeEffects[type];
    }
  }

  updatePlayerImpactEffects(dt) {
    this.playerHitFlash = Math.max(0, this.playerHitFlash - dt);
    this.playerDestroyedAnim = Math.max(0, this.playerDestroyedAnim - dt);
  }

  drawSkyBackdrop(w = this.canvas.width, h = this.canvas.height) {
    const ctx = this.ctx;
    const theme = getEnvironmentTheme(this.level);

    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, theme.skyTop);
    sky.addColorStop(1, theme.skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < 80; i += 1) {
      const px = (i * 217 + this.camera.x * 0.24) % (w + 300) - 150;
      const py = (i * 127 + this.camera.y * 0.18) % (h + 240) - 120;
      ctx.fillStyle = theme.sparkle;
      ctx.beginPath();
      ctx.arc(px, py, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    this.drawCloudLayer(w, h);
  }

  drawCloudLayer(w, h) {
    const ctx = this.ctx;
    const theme = getEnvironmentTheme(this.level);
    const cullPadding = 240;
    for (const cloud of this.clouds) {
      const sx = cloud.x - this.camera.x;
      const sy = cloud.y - this.camera.y;
      const size = 88 * cloud.scale;

      if (
        sx < -size - cullPadding ||
        sx > w + size + cullPadding ||
        sy < -size - cullPadding ||
        sy > h + size + cullPadding
      ) {
        continue;
      }

      ctx.save();
      ctx.globalAlpha = cloud.alpha;
      ctx.fillStyle = theme.cloud;
      drawCloudBlob(ctx, sx, sy, cloud.scale);
      ctx.restore();
    }
  }

  createCloudField() {
    const area = this.world.width * this.world.height;
    const count = Math.max(90, Math.floor(area / 90000));
    const margin = 280;
    const clouds = [];

    for (let i = 0; i < count; i += 1) {
      clouds.push({
        x: randomRange(-margin, this.world.width + margin),
        y: randomRange(-margin, this.world.height + margin),
        scale: randomRange(0.72, 1.9),
        alpha: randomRange(0.42, 0.88),
      });
    }

    return clouds;
  }

  drawSpeedLines() {
    const speedFactor = this.getPlayerSpeedFactor();
    if (speedFactor <= 0.04 || this.playerDestroyed || this.levelComplete) return;

    const ctx = this.ctx;
    const px = this.player.x - this.camera.x;
    const py = this.player.y - this.camera.y;
    const dirX = Math.cos(this.player.angle);
    const dirY = Math.sin(this.player.angle);
    const perpX = -dirY;
    const perpY = dirX;
    const t = performance.now() * 0.001;
    const lineCount = 7 + Math.floor(speedFactor * 12);

    ctx.save();
    for (let i = 0; i < lineCount; i += 1) {
      const phase = (t * (2.2 + speedFactor * 3.4) + i * 0.43) % 1;
      const side = i % 2 === 0 ? 1 : -1;
      const lateral = side * (18 + (i * 13) % 110);
      const back = 45 + phase * (200 + speedFactor * 120);
      const len = 14 + speedFactor * 40;

      const sx = px - dirX * back + perpX * lateral;
      const sy = py - dirY * back + perpY * lateral;
      const ex = sx - dirX * len;
      const ey = sy - dirY * len;
      const alpha = (0.06 + speedFactor * 0.2) * (1 - phase);

      ctx.strokeStyle = `rgba(220, 245, 255, ${alpha})`;
      ctx.lineWidth = 1 + speedFactor * 1.6;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawWorldGuides() {
    const ctx = this.ctx;
    ctx.strokeStyle = getEnvironmentTheme(this.level).grid;
    ctx.lineWidth = 1;

    const step = 300;
    for (let x = 0; x <= this.world.width; x += step) {
      const sx = x - this.camera.x;
      ctx.beginPath();
      ctx.moveTo(sx, -this.camera.y);
      ctx.lineTo(sx, this.world.height - this.camera.y);
      ctx.stroke();
    }

    for (let y = 0; y <= this.world.height; y += step) {
      const sy = y - this.camera.y;
      ctx.beginPath();
      ctx.moveTo(-this.camera.x, sy);
      ctx.lineTo(this.world.width - this.camera.x, sy);
      ctx.stroke();
    }
  }

  drawPlane(plane, isPlayer) {
    this.drawPlaneSprite(plane.x, plane.y, plane.angle, isPlayer, 1);
  }

  drawBoss() {
    if (!this.boss) return;
    const bossSpriteKey = this.getBossSpriteKeyForLevel(this.level);
    const bossSprite = this.sprites[bossSpriteKey];
    const sx = this.boss.x - this.camera.x;
    const sy = this.boss.y - this.camera.y;
    const ctx = this.ctx;

    if (bossSprite) {
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(this.boss.angle + Math.PI / 2);
      const size = 170;
      ctx.drawImage(bossSprite, -size / 2, -size / 2, size, size);
      ctx.restore();
    } else {
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(this.boss.angle);
      ctx.fillStyle = "#cb5d5d";
      ctx.beginPath();
      ctx.moveTo(70, 0);
      ctx.lineTo(-58, -34);
      ctx.lineTo(-30, 0);
      ctx.lineTo(-58, 34);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  drawPlaneSprite(x, y, angle, isPlayer, scale) {
    const ctx = this.ctx;
    const sx = x - this.camera.x;
    const sy = y - this.camera.y;
    const sprite = isPlayer ? this.sprites[this.jetConfig.spriteKey] : this.sprites.enemy;

    if (sprite) {
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(angle + Math.PI / 2);
      const size = (isPlayer ? 84 : 74) * scale;
      if (isPlayer && this.playerHitFlash > 0) {
        ctx.globalAlpha = 0.45 + Math.sin(performance.now() * 0.08) * 0.45;
      }
      ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(angle);
    ctx.fillStyle = isPlayer ? "#6ce6ff" : "#ff796e";
    ctx.beginPath();
    ctx.moveTo(22 * scale, 0);
    ctx.lineTo(-16 * scale, -10 * scale);
    ctx.lineTo(-10 * scale, 0);
    ctx.lineTo(-16 * scale, 10 * scale);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  drawDestroyedPlayerEffect() {
    const ctx = this.ctx;
    const sx = this.player.x - this.camera.x;
    const sy = this.player.y - this.camera.y;
    const life = Math.max(0, this.playerDestroyedAnim / 1.2);
    const radius = 36 + (1 - life) * 90;
    const alpha = 0.75 * life;

    ctx.strokeStyle = `rgba(255, 160, 70, ${alpha})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = `rgba(255, 110, 50, ${alpha * 0.7})`;
    ctx.beginPath();
    ctx.arc(sx, sy, 16 + (1 - life) * 20, 0, Math.PI * 2);
    ctx.fill();
  }

  drawWingmen(wingmen) {
    if (!this.isEffectActive("wingmen")) return;
    for (const wingman of wingmen) {
      this.drawPlaneSprite(wingman.x, wingman.y, wingman.angle, true, 0.74);
    }
  }

  getWingmanPositions() {
    const offsets = [
      { x: -62, y: 44 },
      { x: -62, y: -44 },
    ];
    const cos = Math.cos(this.player.angle);
    const sin = Math.sin(this.player.angle);
    return offsets.map((offset) => ({
      x: this.player.x + offset.x * cos - offset.y * sin,
      y: this.player.y + offset.x * sin + offset.y * cos,
      angle: this.player.angle,
    }));
  }

  drawMissile(missile) {
    const ctx = this.ctx;
    const sx = missile.x - this.camera.x;
    const sy = missile.y - this.camera.y;
    const psx = missile.prevX - this.camera.x;
    const psy = missile.prevY - this.camera.y;
    const sprite = missile.homing && missile.friendly ? this.sprites.missileHoming : this.sprites.missile;
    this.drawMissileTrail(psx, psy, sx, sy, missile);

    if (sprite) {
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(missile.angle + Math.PI / 2);
      const width = missile.homing && missile.friendly ? 18 : 17;
      const height = missile.homing && missile.friendly ? 26 : 24;
      ctx.drawImage(sprite, -width / 2, -height / 2, width, height);
      ctx.restore();
      if (missile.homing && missile.friendly) {
        ctx.strokeStyle = "rgba(255, 90, 90, 0.75)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(sx, sy, 9, 0, Math.PI * 2);
        ctx.stroke();
      }
      return;
    }

    ctx.fillStyle = missile.friendly ? "#ffe07a" : "#ff5454";
    ctx.beginPath();
    ctx.arc(sx, sy, missile.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  drawMissileTrail(psx, psy, sx, sy, missile) {
    const ctx = this.ctx;
    if (missile.trail.length > 1) {
      for (let i = 1; i < missile.trail.length; i += 1) {
        const a = missile.trail[i - 1];
        const b = missile.trail[i];
        const ax = a.x - this.camera.x;
        const ay = a.y - this.camera.y;
        const bx = b.x - this.camera.x;
        const by = b.y - this.camera.y;
        const fade = i / missile.trail.length;

        if (missile.homing && missile.friendly) {
          const grad = ctx.createLinearGradient(ax, ay, bx, by);
          grad.addColorStop(0, `rgba(255, 70, 50, ${0.05 * fade})`);
          grad.addColorStop(1, `rgba(255, 145, 90, ${0.55 * fade})`);
          ctx.strokeStyle = grad;
          ctx.lineWidth = 2 + 2.5 * fade;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
        } else {
          const grad = ctx.createLinearGradient(ax, ay, bx, by);
          grad.addColorStop(0, `rgba(255, 224, 120, ${0.04 * fade})`);
          grad.addColorStop(1, `rgba(255, 241, 170, ${0.45 * fade})`);
          ctx.strokeStyle = grad;
          ctx.lineWidth = 1.8 + 1.8 * fade;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
        }
      }
    }

    if (missile.homing && missile.friendly) {
      const grad = ctx.createLinearGradient(psx, psy, sx, sy);
      grad.addColorStop(0, "rgba(255, 70, 50, 0)");
      grad.addColorStop(1, "rgba(255, 135, 75, 0.85)");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(psx, psy);
      ctx.lineTo(sx, sy);
      ctx.stroke();

      ctx.fillStyle = "rgba(255, 145, 90, 0.65)";
      ctx.beginPath();
      ctx.arc((psx + sx) * 0.5, (psy + sy) * 0.5, 2.2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    const grad = ctx.createLinearGradient(psx, psy, sx, sy);
    grad.addColorStop(0, "rgba(255, 224, 120, 0)");
    grad.addColorStop(1, "rgba(255, 241, 170, 0.65)");
    ctx.strokeStyle = grad;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(psx, psy);
    ctx.lineTo(sx, sy);
    ctx.stroke();
  }

  drawPowerup(powerup) {
    const ctx = this.ctx;
    const sx = powerup.x - this.camera.x;
    const sy = powerup.y - this.camera.y;
    const lifeRatio = powerup.life / powerup.maxLife;
    const pulse = 1 + Math.sin(performance.now() * 0.01) * 0.12;
    const radius = powerup.radius * pulse;

    ctx.fillStyle = powerupColor(powerup.type, 0.25 + lifeRatio * 0.4);
    ctx.beginPath();
    ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    ctx.font = "bold 16px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(powerupLabel(powerup.type), sx, sy + 1);
  }

  drawExplosion(explosion) {
    const ctx = this.ctx;
    for (const particle of explosion.particles) {
      if (particle.life <= 0) continue;
      const lifeRatio = particle.life / particle.maxLife;
      const sx = particle.x - this.camera.x;
      const sy = particle.y - this.camera.y;
      const radius = particle.radius * lifeRatio;
      const alpha = 0.12 + lifeRatio * 0.7;
      const green = Math.floor(150 + 90 * lifeRatio);
      ctx.fillStyle = `rgba(255, ${green}, 40, ${alpha})`;
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(0.7, radius), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawPlayerEffectAuras(wingmen) {
    const ctx = this.ctx;
    const ships = [{ x: this.player.x, y: this.player.y, angle: this.player.angle }, ...wingmen];
    const pulse = 0.78 + Math.sin(performance.now() * 0.01) * 0.22;

    if (this.isEffectActive("wingmen") && wingmen.length === 2) {
      const p = ships[0];
      for (const wingman of wingmen) {
        ctx.strokeStyle = "rgba(125, 255, 185, 0.35)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x - this.camera.x, p.y - this.camera.y);
        ctx.lineTo(wingman.x - this.camera.x, wingman.y - this.camera.y);
        ctx.stroke();
      }
    }

    for (const ship of ships) {
      const sx = ship.x - this.camera.x;
      const sy = ship.y - this.camera.y;

      if (this.isEffectActive("cloak")) {
        ctx.fillStyle = `rgba(80, 190, 255, ${0.08 + pulse * 0.14})`;
        ctx.beginPath();
        ctx.arc(sx, sy, 34 + pulse * 8, 0, Math.PI * 2);
        ctx.fill();
      }
      if (this.isEffectActive("invincible")) {
        ctx.strokeStyle = `rgba(255, 220, 95, ${0.45 + pulse * 0.4})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(sx, sy, 37 + pulse * 5, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (this.isEffectActive("heatseek")) {
        const nx = sx + Math.cos(ship.angle) * 36;
        const ny = sy + Math.sin(ship.angle) * 36;
        ctx.strokeStyle = "rgba(255, 95, 95, 0.85)";
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(nx - 7, ny);
        ctx.lineTo(nx + 7, ny);
        ctx.moveTo(nx, ny - 7);
        ctx.lineTo(nx, ny + 7);
        ctx.stroke();
      }
    }
  }

  drawArcadeBars(w) {
    const ctx = this.ctx;
    const barW = 220;
    const barH = 12;
    const playerRatio = this.player.hp / this.player.maxHp;

    drawBar(ctx, w / 2 - barW / 2, 64, barW, barH, playerRatio, "#67e6ff", "SHIELD");

    if (this.boss) {
      const bossRatio = this.getDisplayedBossShieldRatio();
      drawBar(ctx, w / 2 - barW / 2, 90, barW, barH, bossRatio, "#ff8e7a", "BOSS SHIELD");
    }
  }

  drawBossIncomingWarning(w) {
    const ctx = this.ctx;
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.02);
    const compact = this.isCompactViewport();
    const small = this.canvas.width <= 760;
    const fontSize = compact ? 28 : small ? 34 : 42;
    const lineWidth = compact ? 4 : 6;
    const y = compact ? 138 : small ? 128 : 120;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = `bold ${fontSize}px Arial`;
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = `rgba(20, 20, 30, ${0.75 + pulse * 0.2})`;
    ctx.fillStyle = `rgba(255, 118, 98, ${0.68 + pulse * 0.3})`;
    ctx.strokeText("WARNING: BOSS INCOMING", w / 2, y);
    ctx.fillText("WARNING: BOSS INCOMING", w / 2, y);
    ctx.restore();
  }

  drawLevelCompleteFlyby() {
    const cycle = 3.0;
    const t = (this.levelCompleteAnimTime % cycle) / cycle;
    const yStart = this.world.height + 170;
    const yEnd = -260;
    const y = yStart + (yEnd - yStart) * t;
    const xCenter = this.player.x;
    const formation = [
      { x: 0, y: 0, scale: 1.0 },
      { x: -108, y: 86, scale: 0.82 },
      { x: 108, y: 86, scale: 0.82 },
    ];

    for (const plane of formation) {
      this.drawPlaneSprite(
        xCenter + plane.x,
        y + plane.y,
        -Math.PI / 2,
        true,
        plane.scale
      );
    }
  }

  drawLevelCompleteTextNoOverlay() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const compact = this.isCompactViewport();
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = compact ? "bold 38px Arial" : "bold 54px Arial";
    ctx.fillStyle = "rgba(255, 226, 132, 0.95)";
    ctx.strokeStyle = "rgba(20, 38, 64, 0.85)";
    ctx.lineWidth = compact ? 4 : 6;
    const y = compact ? 96 : 68;
    const text = "LEVEL COMPLETE";
    ctx.strokeText(text, w / 2, y);
    ctx.fillText(text, w / 2, y);
    ctx.restore();
  }

  getStatusText() {
    if (this.isBossIntroActive()) {
      return "Boss incoming...";
    }
    if (this.bossDefeatTimer > 0) {
      return "Target destroyed!";
    }
    const activeTypes = Object.keys(this.activeEffects);
    if (this.godMode) {
      return "GOD MODE: Invincibility ON";
    }
    if (activeTypes.length > 0) {
      const display = activeTypes
        .map((type) => `${powerupName(type)} ${this.activeEffects[type].toFixed(1)}s`)
        .join(" | ");
      return `Powerups: ${display}`;
    }
    const jetTag = `${this.jetConfig.label}`;
    if (this.levelPhase === "wave") {
      return `Level ${this.level}: ${this.waveKills}/${this.waveTargetKills} planes | ${jetTag}`;
    }
    if (this.levelPhase === "boss" && this.boss) {
      return `Boss Fight - Shield ${this.boss.hp}/${this.boss.maxHp} | ${jetTag}`;
    }
    return "Missile ready";
  }

  getCurrentJetName() {
    return this.jetConfig.label;
  }

  getEffectBanner() {
    const activeTypes = Object.keys(this.activeEffects);
    if (activeTypes.length === 0) return null;
    const sorted = activeTypes.sort((a, b) => this.activeEffects[b] - this.activeEffects[a]);
    const primary = sorted[0];
    const extras = sorted.slice(1).map((type) => powerupName(type).toUpperCase());
    return {
      title: `${powerupName(primary).toUpperCase()} ONLINE`,
      timeLeft: this.activeEffects[primary],
      extras,
    };
  }

  getLevelCompleteText() {
    const nextWave = this.getWaveTargetKills(this.level + 1);
    const currentJet = this.getJetConfigForLevel(this.level).label;
    const nextJet = this.getJetConfigForLevel(this.level + 1).label;
    const unlockText = nextJet !== currentJet ? ` New jet unlocked: ${nextJet}.` : "";
    return `Level ${this.level} (${getEnvironmentTheme(this.level).name}) cleared! Next: ${nextWave} planes + tougher boss.${unlockText}`;
  }

  getUnlockedJetInfo() {
    const current = this.getJetConfigForLevel(this.level);
    const next = this.getJetConfigForLevel(this.level + 1);
    if (current.spriteKey === next.spriteKey) return null;
    return {
      name: next.label,
      spritePath: SPRITE_PATHS[next.spriteKey],
    };
  }

  isLevelCompleteOverlayVisible() {
    return this.levelComplete && this.getLevelCompletePhase() === "overlay";
  }

  getLevelCompletePhase() {
    if (!this.levelComplete) return "none";
    if (this.levelCompleteAnimTime < this.levelCompleteTextDuration) return "text";
    if (this.levelCompleteAnimTime < this.levelCompleteTextDuration + this.levelCompleteFlybyDuration) {
      return "flyby";
    }
    return "overlay";
  }

  isEffectActive(type) {
    if (type === "invincible" && this.godMode) return true;
    return (this.activeEffects[type] || 0) > 0;
  }

  isBossIntroActive() {
    return this.bossIntroTimer > 0;
  }

  getDisplayedBossShieldRatio() {
    if (!this.boss) return 0;
    if (!this.isBossIntroActive()) return this.boss.hp / this.boss.maxHp;
    const progress = 1 - this.bossIntroTimer / this.bossIntroDuration;
    return clamp(progress, 0, 1);
  }

  getPlayerSpeedFactor() {
    const range = Math.max(1, this.player.maxSpeed - this.player.minSpeed);
    return clamp((this.player.speed - this.player.minSpeed) / range, 0, 1);
  }

  getViewportZoom() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (w <= 430 || h <= 500) return 0.82;
    if (w <= 760) return 0.9;
    return 1;
  }

  isCompactViewport() {
    return this.canvas.width <= 430 || this.canvas.height <= 500;
  }

  findNearestTarget(x, y) {
    const view = this.getViewBounds();
    const candidates = [...this.enemies];
    if (this.boss) candidates.push(this.boss);
    let nearest = null;
    let nearestDistSq = Infinity;
    for (const target of candidates) {
      if (!this.isTargetVisibleOnScreen(target, view)) continue;
      const dx = target.x - x;
      const dy = target.y - y;
      const distSq = dx * dx + dy * dy;
      if (distSq < nearestDistSq) {
        nearest = target;
        nearestDistSq = distSq;
      }
    }
    return nearest;
  }

  getViewBounds() {
    const zoom = this.getViewportZoom();
    const w = this.canvas.width / zoom;
    const h = this.canvas.height / zoom;
    const x = clamp(this.player.x - w / 2, 0, this.world.width - w);
    const y = clamp(this.player.y - h / 2, 0, this.world.height - h);
    return { x, y, w, h };
  }

  isTargetVisibleOnScreen(target, view) {
    const margin = (target.radius || 0) + 14;
    return (
      target.x >= view.x - margin &&
      target.x <= view.x + view.w + margin &&
      target.y >= view.y - margin &&
      target.y <= view.y + view.h + margin
    );
  }

  getWaveTargetKills(level) {
    return Math.ceil(5 * Math.pow(1.2, level - 1));
  }

  getBossShield(level) {
    return Math.ceil(5 * Math.pow(1.5, level - 1));
  }

  getBossSpriteKeyForLevel(level) {
    if (level >= 4) return "boss4";
    if (level === 3) return "boss3";
    if (level === 2) return "boss2";
    return "boss1";
  }

  getBossShotCount(level) {
    if (level >= 4) return 3;
    if (level === 3) return 2;
    return 1;
  }

  getBossShotOffsets() {
    if (!this.boss) return [0];
    if (this.boss.shots >= 3) return [-0.16, 0, 0.16];
    if (this.boss.shots === 2) return [-0.09, 0.09];
    return [0];
  }

  getJetConfigForLevel(level) {
    if (level >= 5) {
      return {
        spriteKey: "jetStealth",
        label: "F-35",
        shield: 8,
        fireInterval: 0.22,
        shots: 3,
      };
    }
    if (level >= 4) {
      return {
        spriteKey: "jet4",
        label: "F-22",
        shield: 7,
        fireInterval: 0.22,
        shots: 2,
      };
    }
    if (level >= 3) {
      return {
        spriteKey: "f18",
        label: "F-18",
        shield: 6,
        fireInterval: 0.35,
        shots: 2,
      };
    }
    if (level >= 2) {
      return {
        spriteKey: "jet2",
        label: "F6F Hellcat",
        shield: 5,
        fireInterval: 0.35,
        shots: 1,
      };
    }
    return {
      spriteKey: "jet1",
      label: "P51 Mustang",
      shield: 5,
      fireInterval: 0.35,
      shots: 1,
    };
  }

  getJetShotOffsets() {
    if (this.jetConfig.shots >= 3) return [-0.14, 0, 0.14];
    if (this.jetConfig.shots === 2) return [-0.07, 0.07];
    return [0];
  }

  jumpToLevel(level) {
    const safeLevel = Math.max(1, Math.floor(level));
    this.level = safeLevel;
    this.score = 0;
    this.startLevel(safeLevel);
  }

  forceCompleteLevel() {
    if (this.isOver || this.levelComplete) return;
    this.enemies = [];
    this.boss = null;
    this.missiles = [];
    this.powerups = [];
    this.activeEffects = {};
    this.player.fireInterval = this.jetConfig.fireInterval;
    this.bossIntroTimer = 0;
    this.bossDefeatTimer = 0;
    this.levelComplete = true;
    this.levelCompleteAnimTime = 0;
    this.levelPhase = "complete";
  }

  toggleInvincibilityCheat() {
    if (this.isOver || this.playerDestroyed || this.levelComplete) return;
    this.godMode = !this.godMode;
  }
}

function isColliding(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy) <= a.radius + b.radius;
}

function isSweptColliding(missile, target) {
  const radius = missile.radius + target.radius;
  const ax = missile.prevX;
  const ay = missile.prevY;
  const bx = missile.x;
  const by = missile.y;
  const abx = bx - ax;
  const aby = by - ay;
  const abLenSq = abx * abx + aby * aby;

  if (abLenSq <= 0.000001) return isColliding(missile, target);

  const acx = target.x - ax;
  const acy = target.y - ay;
  const t = clamp((acx * abx + acy * aby) / abLenSq, 0, 1);
  const closestX = ax + abx * t;
  const closestY = ay + aby * t;
  const dx = target.x - closestX;
  const dy = target.y - closestY;
  return dx * dx + dy * dy <= radius * radius;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function drawCloudBlob(ctx, x, y, scale) {
  ctx.beginPath();
  ctx.ellipse(x, y, 44 * scale, 20 * scale, 0, 0, Math.PI * 2);
  ctx.ellipse(x - 30 * scale, y + 2 * scale, 26 * scale, 15 * scale, 0, 0, Math.PI * 2);
  ctx.ellipse(x + 30 * scale, y + 2 * scale, 26 * scale, 15 * scale, 0, 0, Math.PI * 2);
  ctx.ellipse(x - 12 * scale, y - 10 * scale, 22 * scale, 12 * scale, 0, 0, Math.PI * 2);
  ctx.ellipse(x + 12 * scale, y - 10 * scale, 22 * scale, 12 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

const POWERUP_TYPES = ["wingmen", "invincible", "heatseek", "cloak"];

function powerupLabel(type) {
  if (type === "wingmen") return "W";
  if (type === "invincible") return "I";
  if (type === "heatseek") return "H";
  return "C";
}

function powerupName(type) {
  if (type === "wingmen") return "Wingmen";
  if (type === "invincible") return "Invincible";
  if (type === "heatseek") return "Heat Seek";
  return "Cloak";
}

function powerupColor(type, alpha) {
  if (type === "wingmen") return `rgba(122, 255, 164, ${alpha})`;
  if (type === "invincible") return `rgba(255, 203, 80, ${alpha})`;
  if (type === "heatseek") return `rgba(255, 110, 110, ${alpha})`;
  return `rgba(120, 160, 255, ${alpha})`;
}

function drawBar(ctx, x, y, width, height, ratio, color, label) {
  const clamped = clamp(ratio, 0, 1);
  ctx.fillStyle = "rgba(8, 18, 35, 0.65)";
  ctx.fillRect(x - 2, y - 2, width + 4, height + 4);
  ctx.fillStyle = "rgba(255, 255, 255, 0.16)";
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, width * clamped, height);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
  ctx.lineWidth = 1.2;
  ctx.strokeRect(x, y, width, height);

  ctx.fillStyle = "rgba(245, 248, 255, 0.92)";
  ctx.font = "bold 11px Arial";
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  ctx.fillText(label, x, y - 4);
}

function normalizeAngle(angle) {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function getEnvironmentTheme(level) {
  const themes = [
    {
      name: "Water",
      skyTop: "#67b9f2",
      skyBottom: "#5a8fd9",
      sparkle: "rgba(255, 255, 255, 0.34)",
      cloud: "rgba(255, 255, 255, 0.22)",
      grid: "rgba(255, 255, 255, 0.08)",
    },
    {
      name: "Desert",
      skyTop: "#f1c074",
      skyBottom: "#d09254",
      sparkle: "rgba(255, 241, 215, 0.3)",
      cloud: "rgba(255, 238, 205, 0.18)",
      grid: "rgba(120, 72, 34, 0.12)",
    },
    {
      name: "Jungle",
      skyTop: "#5fb66a",
      skyBottom: "#2f7e45",
      sparkle: "rgba(225, 255, 226, 0.24)",
      cloud: "rgba(235, 255, 234, 0.17)",
      grid: "rgba(20, 60, 28, 0.13)",
    },
    {
      name: "City",
      skyTop: "#8e98ad",
      skyBottom: "#535d74",
      sparkle: "rgba(230, 235, 246, 0.24)",
      cloud: "rgba(235, 242, 255, 0.16)",
      grid: "rgba(18, 26, 48, 0.14)",
    },
  ];

  return themes[(Math.max(1, level) - 1) % themes.length];
}
