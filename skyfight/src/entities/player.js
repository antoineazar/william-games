export class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.angle = -Math.PI / 2;
    this.speed = 0;
    this.maxSpeed = 420;
    this.minSpeed = 140;
    this.acceleration = 220;
    this.turnRate = 2.6;
    this.radius = 28;
    this.hp = 100;
    this.maxHp = 100;
    this.fireCooldown = 0;
    this.fireInterval = 0.35;
  }

  update(dt, input, world) {
    if (input.joystickActive) {
      // Mobile: turn toward joystick heading at a limited rate.
      const targetAngle = Math.atan2(input.joystickY, input.joystickX);
      const delta = normalizeAngle(targetAngle - this.angle);
      const maxTurn = this.turnRate * 1.75 * dt;
      this.angle += Math.sign(delta) * Math.min(Math.abs(delta), maxTurn);

      // Pull distance controls target speed (acceleration feel).
      const targetSpeed = this.minSpeed + (this.maxSpeed - this.minSpeed) * input.joystickStrength;
      const accelRate = this.acceleration * 2.2;
      if (this.speed < targetSpeed) {
        this.speed = Math.min(targetSpeed, this.speed + accelRate * dt);
      } else {
        this.speed = Math.max(targetSpeed, this.speed - accelRate * dt);
      }
    } else {
      const turnInput = (input.left ? 1 : 0) - (input.right ? 1 : 0);
      this.angle -= turnInput * this.turnRate * dt;

      if (input.throttleUp) {
        this.speed += this.acceleration * dt;
      } else if (input.throttleDown) {
        this.speed -= this.acceleration * dt;
      }
    }

    this.speed = Math.max(this.minSpeed, Math.min(this.maxSpeed, this.speed));
    this.x += Math.cos(this.angle) * this.speed * dt;
    this.y += Math.sin(this.angle) * this.speed * dt;

    this.x = Math.max(0, Math.min(world.width, this.x));
    this.y = Math.max(0, Math.min(world.height, this.y));
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
  }

  canFire() {
    return this.fireCooldown <= 0;
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
