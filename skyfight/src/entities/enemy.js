export class Enemy {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.angle = Math.random() * Math.PI * 2;
    this.speed = 170 + Math.random() * 60;
    this.turnRate = 1.5;
    this.radius = 24;
    this.hp = 40;
    this.fireCooldown = 0.8 + Math.random() * 0.6;
    this.fireInterval = 1.2 + Math.random() * 0.5;
    this.attackRange = 560;
    this.wanderTurn = (Math.random() - 0.5) * 0.9;
    this.wanderTimer = 0.8 + Math.random() * 1.5;
  }

  update(dt, player, world, targetVisible) {
    if (targetVisible) {
      const targetAngle = Math.atan2(player.y - this.y, player.x - this.x);
      const delta = normalizeAngle(targetAngle - this.angle);
      this.angle += Math.sign(delta) * Math.min(Math.abs(delta), this.turnRate * dt);
    } else {
      this.wanderTimer -= dt;
      if (this.wanderTimer <= 0) {
        this.wanderTimer = 0.6 + Math.random() * 1.4;
        this.wanderTurn = (Math.random() - 0.5) * 1.4;
      }
      this.angle += this.wanderTurn * dt;

      // When the player is cloaked, enemies wander. Steer inward before edges.
      const edgePadding = 170;
      const nearEdge =
        this.x < edgePadding ||
        this.x > world.width - edgePadding ||
        this.y < edgePadding ||
        this.y > world.height - edgePadding;
      if (nearEdge) {
        const centerAngle = Math.atan2(world.height * 0.5 - this.y, world.width * 0.5 - this.x);
        const deltaToCenter = normalizeAngle(centerAngle - this.angle);
        const avoidTurnRate = this.turnRate * 2.35;
        this.angle += Math.sign(deltaToCenter) * Math.min(Math.abs(deltaToCenter), avoidTurnRate * dt);
      }
    }

    this.x += Math.cos(this.angle) * this.speed * dt;
    this.y += Math.sin(this.angle) * this.speed * dt;

    this.x = Math.max(0, Math.min(world.width, this.x));
    this.y = Math.max(0, Math.min(world.height, this.y));

    if (!targetVisible) {
      // If already clipped to a border, immediately redirect toward map center.
      const clipped = this.x <= 0 || this.x >= world.width || this.y <= 0 || this.y >= world.height;
      if (clipped) {
        this.angle =
          Math.atan2(world.height * 0.5 - this.y, world.width * 0.5 - this.x) +
          (Math.random() - 0.5) * 0.32;
      }
    }
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
  }

  canFireAt(player, targetVisible) {
    if (!targetVisible) return false;
    if (this.fireCooldown > 0) return false;
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    return Math.hypot(dx, dy) <= this.attackRange;
  }

  onFire() {
    this.fireCooldown = this.fireInterval;
  }
}

function normalizeAngle(angle) {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
