// Host-side simulation of one player: movement + role abilities.
// Guests never run this; they receive the snapshot() output and draw it.
import { ROLES, EMPTY_INPUT, EDGE_KEYS } from '../roles.js';

const Rect = Phaser.Geom.Rectangle;
const hit = Phaser.Geom.Intersects.RectangleToRectangle;

// Tunables (starting values — see docs/GAME_DESIGN.md §2)
const T = {
  wallJumpX: 280, wallJumpY: 560, wallLock: 0.18, wallSlide: 120,
  climbSpeed: 150, climbSide: 110, crawlSpeed: 140,
  dashSpeed: 620, dashTime: 0.15, dashCooldown: 0.6,
  liftRange: 40, throwCrateX: 420, throwCrateY: 320, smashRange: 40,
  throwMateRange: 60, throwMateX: 260, throwMateY: 820,
  beamLength: 360, energyDrain: 30, energyRegen: 22, regenDelay: 0.5, flareCost: 40, flareRadius: 180,
  slamSpeed: 900, chainRange: 320, chainLife: 10, yankRange: 280, yankSpeed: 700,
  rideSpeed: 420, dropTime: 0.25,
  jumpBuffer: 0.12, coyote: 0.08, wallGrace: 0.1,
};

/** Shortest distance from point (px, py) to segment (x1, y1)-(x2, y2). */
function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy || 1;
  const t = Phaser.Math.Clamp(((px - x1) * dx + (py - y1) * dy) / len2, 0, 1);
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

export class PlayerSim {
  constructor(scene, group, id, name, role, x, feetY) {
    this.scene = scene;
    this.group = group;
    this.id = id;
    this.name = name;
    this.facing = 1;
    this.input = { ...EMPTY_INPUT };
    this.pressed = {};           // edge flags, consumed once per step
    this.checkpoint = x;
    this.#resetState();
    this.#createHitbox(role, x, feetY);
  }

  #resetState() {
    this.crouching = false;
    this.climbing = false;
    this.lockT = 0;              // wall-jump control lock
    this.dashT = 0; this.dashCd = 0; this.airDash = true;
    this.carrying = null;        // crate object (Warden)
    this.bracing = false;
    this.energy = 100; this.sinceBeam = 99;
    this.beam = null;            // { x1, y1, x2, y2 } (Weaver)
    this.flareT = 0;
    this.planted = false;
    this.slamming = false;
    this.ride = null;            // { x1, y1, x2, y2, t, dur } chain zipline
    this.dropT = 0;
    this.jumpBufT = 0;           // jump pressed slightly before landing still counts
    this.coyoteT = 0;            // jump shortly after leaving a ledge still counts
    this.wallT = 0; this.wallDir = 0; // Scout: wall contact grace (contact flags flicker frame to frame)
  }

  #createHitbox(role, x, feetY) {
    this.role = role;
    const r = ROLES[role];
    this.stats = r;
    this.hitbox?.destroy();
    this.hitbox = this.scene.add.rectangle(x, feetY - r.h / 2, r.w, r.h).setVisible(false);
    this.hitbox.sim = this;
    this.group.add(this.hitbox);
    this.hitbox.body.setCollideWorldBounds(true);
  }

  get body() { return this.hitbox.body; }
  get x() { return this.body.center.x; }
  get feet() { return this.body.bottom; }
  get bounds() { return new Rect(this.body.x, this.body.y, this.body.width, this.body.height); }
  get grounded() { return this.body.blocked.down || this.body.touching.down; }

  setRole(role) {
    if (!ROLES[role] || role === this.role) return;
    this.#dropCarried();
    this.#setPlanted(false);
    const x = this.x, feet = this.feet;
    this.#resetState();
    this.#createHitbox(role, x, feet);
  }

  setInput(input) {
    if (typeof input !== 'object' || input === null) return;
    for (const k of EDGE_KEYS) if (input[k] && !this.input[k]) this.pressed[k] = true; // remember presses between steps
    for (const k of Object.keys(EMPTY_INPUT)) this.input[k] = !!input[k];              // never trust network data
  }

  /** Removes the player from the world (e.g. on disconnect), releasing anything they hold. */
  destroy() {
    this.#dropCarried();
    this.hitbox.destroy();
  }

  respawn() {
    this.#dropCarried();
    this.#setPlanted(false);
    this.#resetState();
    this.body.reset(this.checkpoint, 300);
  }

  // ---------------------------------------------------------------- step
  /** ctx: { level, players, time, dt, fx(type, x, y) } */
  step(ctx) {
    const { dt } = ctx;
    const inp = this.input, pr = this.pressed;
    const body = this.body;
    this.lockT = Math.max(0, this.lockT - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.dropT = Math.max(0, this.dropT - dt);
    this.flareT = Math.max(0, this.flareT - dt);
    this.jumpBufT = pr.jump ? T.jumpBuffer : Math.max(0, this.jumpBufT - dt);
    this.coyoteT = this.grounded ? T.coyote : Math.max(0, this.coyoteT - dt);
    this.wallT = Math.max(0, this.wallT - dt);
    body.pushable = !this.planted;

    if (this.ride) { this.#stepRide(dt); this.pressed = {}; return; }

    // Chain: anyone (except the planted anchor holding it) presses E near either end to ride it.
    if (pr.interact && ctx.level.chain && !this.planted) this.#tryRide(ctx.level.chain);

    const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    if (dir && !this.planted) this.facing = dir;
    if (this.grounded) { this.airDash = true; if (this.slamming) { this.slamming = false; ctx.fx('slam', this.x, this.feet); } }

    // Drop through one-way platforms.
    if (inp.down && pr.jump && this.grounded) this.dropT = T.dropTime;

    const ability = { scout: this.#scout, warden: this.#warden, weaver: this.#weaver, anchor: this.#anchor }[this.role];
    const consumed = ability.call(this, ctx, dir);   // role may take over movement this frame

    if (!consumed) {
      const speed = this.crouching ? Math.min(this.stats.speed, T.crawlSpeed) : this.stats.speed;
      if (this.lockT <= 0) body.setVelocityX(dir * speed);
      if (this.jumpBufT > 0 && this.coyoteT > 0 && !inp.down) {
        body.setVelocityY(-this.stats.jump);
        this.jumpBufT = 0; this.coyoteT = 0;
      }
    }

    this.#applyWind(ctx);
    this.pressed = {};
  }

  // ---------------------------------------------------------------- Scout
  #scout(ctx, dir) {
    const { dt, level } = ctx;
    const body = this.body, inp = this.input, pr = this.pressed;

    // Dash (J)
    if (this.dashT > 0) {
      this.dashT -= dt;
      body.setVelocity(this.facing * T.dashSpeed, 0);
      if (this.dashT <= 0) body.setAllowGravity(true);
      return true;
    }
    if (pr.a1 && this.dashCd <= 0 && (this.grounded || this.airDash)) {
      if (!this.grounded) this.airDash = false;
      this.dashT = T.dashTime; this.dashCd = T.dashCooldown;
      this.#setCrouch(false, level);
      body.setAllowGravity(false);
      body.setVelocity(this.facing * T.dashSpeed, 0);
      return true;
    }

    // Mesh climbing (hold W on mesh)
    const onMesh = level.mesh.some((m) => hit(this.bounds, m.rect));
    if (onMesh && inp.up && !this.climbing) this.climbing = true;
    if (this.climbing && (!onMesh || (pr.jump && dir))) {
      this.climbing = false;
      body.setAllowGravity(true);
      if (onMesh) { body.setVelocity(dir * this.stats.speed, -this.stats.jump); return true; } // jump off sideways
    }
    if (this.climbing) {
      body.setAllowGravity(false);
      body.setVelocity(dir * T.climbSide, inp.up ? -T.climbSpeed : inp.down ? T.climbSpeed : 0);
      return true;
    }

    // Crawl (S) — only the Scout's hitbox shrinks, so only the Scout fits vents.
    this.#setCrouch(inp.down && this.grounded || (this.crouching && !this.#canStand(level)), level);

    // Wall-jump / wall-slide (with a short grace window after touching the wall)
    const touching = body.blocked.left ? -1 : body.blocked.right ? 1 : 0;
    if (!this.grounded && touching) { this.wallDir = touching; this.wallT = T.wallGrace; }
    if (this.grounded) this.wallT = 0;
    if (this.wallT > 0) {
      if (this.jumpBufT > 0) {
        body.setVelocity(-this.wallDir * T.wallJumpX, -T.wallJumpY);
        this.facing = -this.wallDir;
        this.lockT = T.wallLock;
        this.wallT = 0; this.jumpBufT = 0;
        return true;
      }
      if (dir === this.wallDir && body.velocity.y > T.wallSlide) body.setVelocityY(T.wallSlide);
    }
    return false;
  }

  #setCrouch(on, level) {
    if (on === this.crouching) return;
    if (!on && !this.#canStand(level)) return;
    this.crouching = on;
    const r = this.stats;
    const h = on ? r.crouchH : r.h;
    this.body.setSize(r.w, h, false);
    this.body.setOffset(0, r.h - h);
  }

  #canStand(level) {
    const r = this.stats;
    const b = this.body;
    const extra = r.h - b.height;
    if (extra <= 0) return true;
    const hits = this.scene.physics.overlapRect(b.x + 1, b.y - extra, r.w - 2, extra, true, true);
    return hits.every((h) => h === b || h.gameObject?.sim);
  }

  // ---------------------------------------------------------------- Warden
  #warden(ctx, dir) {
    const { level } = ctx;
    const body = this.body, pr = this.pressed, inp = this.input;
    this.bracing = false;

    if (this.carrying) {
      const c = this.carrying.view;
      c.setPosition(this.x, body.y - 12);
      if (pr.a1) {                                   // J: throw
        const crate = this.carrying;
        this.carrying = null;
        crate.carriedBy = null;
        c.body.enable = true;
        c.body.reset(this.x + this.facing * 16, body.y - 12);
        c.body.setVelocity(this.facing * T.throwCrateX, -T.throwCrateY);
      }
      return false;
    }

    if (pr.a1) {
      const running = Math.abs(dir) > 0;
      const crate = !running && level.crates.find((k) => !k.carriedBy &&
        Phaser.Math.Distance.Between(k.view.x, k.view.y, this.x, body.center.y) < T.liftRange);
      if (crate) {                                   // J near crate: lift
        this.carrying = crate;
        crate.carriedBy = this.id;
        crate.view.body.enable = false;
        return false;
      }
      if (running) {                                 // J while running: smash
        const front = new Rect(this.facing > 0 ? body.right : body.x - T.smashRange, body.y, T.smashRange, body.height);
        const wall = level.cracked.find((w) => !w.broken && hit(front, w.view.getBounds()));
        if (wall) { level.breakObject(wall); ctx.fx('smash', wall.view.x, wall.view.y); }
      }
    }

    // Hold J under a crusher: brace it.
    if (inp.a1) {
      const crusher = level.crushers.find((k) => this.x > k.data.x && this.x < k.data.x + k.data.w);
      if (crusher) this.bracing = true;
    }

    // K next to a teammate: throw them.
    if (pr.a2) {
      const mate = this.#nearestMate(ctx.players, T.throwMateRange);
      if (mate) {
        mate.lockT = 0.25;
        mate.body.setVelocity(this.facing * T.throwMateX, -T.throwMateY);
        ctx.fx('throw', mate.x, mate.feet);
      }
    }
    return false;
  }

  #dropCarried() {
    if (!this.carrying) return;
    const c = this.carrying;
    c.carriedBy = null;
    c.view.body.enable = true;
    c.view.body.reset(this.x, this.body.y - 12);
    this.carrying = null;
  }

  // ---------------------------------------------------------------- Weaver
  #weaver(ctx, dir) {
    const { dt, level } = ctx;
    const inp = this.input, pr = this.pressed, body = this.body;
    this.beam = null;
    this.sinceBeam += dt;

    // K: flare (all directions)
    if (pr.a2 && this.energy >= T.flareCost) {
      this.energy -= T.flareCost;
      this.sinceBeam = 0;
      this.flareT = 0.6;
      ctx.fx('flare', this.x, body.center.y);
    }
    if (this.flareT > 0) this.#lightCircle(level, ctx.time, this.x, body.center.y, T.flareRadius);

    // Hold J: beam aimed with the direction keys; the Weaver stands still while casting.
    if (inp.a1 && this.energy > 0) {
      let ax = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      const ay = (inp.down ? 1 : 0) - (inp.up ? 1 : 0);
      if (!ax && !ay) ax = this.facing;
      if (ax) this.facing = ax;
      const len = Math.hypot(ax, ay);
      const x1 = this.x, y1 = body.y + 14;
      const end = this.#castRay(level, x1, y1, ax / len, ay / len, T.beamLength);
      this.beam = { x1, y1, x2: end.x, y2: end.y };
      this.#lightLine(level, ctx.time, this.beam);
      this.energy = Math.max(0, this.energy - T.energyDrain * dt);
      this.sinceBeam = 0;
      body.setVelocityX(0);
      return true;
    }
    if (this.sinceBeam > T.regenDelay) this.energy = Math.min(100, this.energy + T.energyRegen * dt);
    return false;
  }

  /** March along the ray until it hits solid level geometry. */
  #castRay(level, x, y, dx, dy, max) {
    const solids = level.data.solids;
    const closedGates = level.gates.filter((g) => !g.open).map((g) => g.data);
    const blockers = [...solids, ...closedGates, ...level.cracked.filter((c) => !c.broken).map((c) => c.data)];
    for (let d = 0; d <= max; d += 6) {
      const px = x + dx * d, py = y + dy * d;
      if (blockers.some((r) => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h)) return { x: px, y: py };
    }
    return { x: x + dx * max, y: y + dy * max };
  }

  #lightLine(level, time, b) {
    const line = new Phaser.Geom.Line(b.x1, b.y1, b.x2, b.y2);
    for (const n of level.nodes) {
      if (distToSegment(n.data.x, n.data.y, b.x1, b.y1, b.x2, b.y2) < 12) n.litUntil = time + 0.15;
    }
    for (const p of level.phantom) {
      if (Phaser.Geom.Intersects.LineToRectangle(line, new Rect(p.data.x, p.data.y - 4, p.data.w, p.data.h + 8))) p.litUntil = time + 0.4;
    }
  }

  #lightCircle(level, time, x, y, r) {
    for (const n of level.nodes) if (Phaser.Math.Distance.Between(x, y, n.data.x, n.data.y) < r) n.litUntil = time + 0.15;
    for (const p of level.phantom) {
      const cx = Phaser.Math.Clamp(x, p.data.x, p.data.x + p.data.w), cy = Phaser.Math.Clamp(y, p.data.y, p.data.y + p.data.h);
      if (Phaser.Math.Distance.Between(x, y, cx, cy) < r) p.litUntil = time + 0.4;
    }
  }

  // ---------------------------------------------------------------- Anchor
  #anchor(ctx, dir) {
    const { level, time } = ctx;
    const body = this.body, pr = this.pressed;

    if (pr.a1) {
      if (this.planted) this.#setPlanted(false);                      // J: release
      else if (this.grounded) this.#setPlanted(true);                 // J on ground: plant
      else { this.slamming = true; body.setVelocity(0, T.slamSpeed); } // J in air: slam
    }

    if (pr.a2) {
      const hook = this.planted && level.hooks.find((h) =>
        Phaser.Math.Distance.Between(h.data.x, h.data.y, this.x, body.y + 8) < T.chainRange);
      if (level.chain && level.chain.owner === this.id) {
        level.chain = null;                                           // K again: retract
      } else if (hook) {
        level.chain = { x1: this.x, y1: body.y + 8, x2: hook.data.x, y2: hook.data.y, owner: this.id, until: time + T.chainLife };
      } else {
        const mate = this.#nearestMate(ctx.players, T.yankRange);     // K at teammate: yank
        if (mate) {
          const a = Phaser.Math.Angle.Between(mate.x, mate.body.center.y, this.x, body.center.y);
          mate.lockT = 0.3;
          mate.body.setVelocity(Math.cos(a) * T.yankSpeed, Math.min(-250, Math.sin(a) * T.yankSpeed));
          ctx.fx('yank', mate.x, mate.body.center.y);
        }
      }
    }

    if (this.planted) { body.setVelocity(0, 0); return true; }
    return false;
  }

  #setPlanted(on) {
    if (this.planted === on) return;
    this.planted = on;
    const b = this.body;
    b.setAllowGravity(!on);
    b.setImmovable(on);
    b.pushable = !on;
    if (on) b.setVelocity(0, 0);
  }

  // ---------------------------------------------------------------- shared helpers
  #nearestMate(players, range) {
    let best = null, bestD = range;
    for (const p of players) {
      if (p === this || p.ride) continue;
      const d = Phaser.Math.Distance.Between(p.x, p.body.center.y, this.x, this.body.center.y);
      if (d < bestD) { best = p; bestD = d; }
    }
    return best;
  }

  #tryRide(chain) {
    const d1 = Phaser.Math.Distance.Between(this.x, this.body.center.y, chain.x1, chain.y1);
    const d2 = Phaser.Math.Distance.Between(this.x, this.body.center.y, chain.x2, chain.y2);
    if (Math.min(d1, d2) > 50) return;
    const [ax, ay, bx, by] = d1 < d2 ? [chain.x1, chain.y1, chain.x2, chain.y2] : [chain.x2, chain.y2, chain.x1, chain.y1];
    const dur = Phaser.Math.Distance.Between(ax, ay, bx, by) / T.rideSpeed;
    this.ride = { x1: ax, y1: ay, x2: bx, y2: by, t: 0, dur };
    this.#setCrouch(false, null);
    this.body.enable = false;
  }

  #stepRide(dt) {
    const r = this.ride;
    r.t = Math.min(r.dur, r.t + dt);
    const k = r.t / r.dur;
    const h = this.stats.h;
    this.hitbox.setPosition(r.x1 + (r.x2 - r.x1) * k, r.y1 + (r.y2 - r.y1) * k + h / 2 + 4); // hang below the chain
    if (r.t >= r.dur) {
      this.ride = null;
      this.body.enable = true;
      this.body.reset(this.hitbox.x, this.hitbox.y - 6);
      this.body.setVelocity(Math.sign(r.x2 - r.x1) * 120, -200);
    }
  }

  #applyWind(ctx) {
    if (this.planted || this.ride) return;
    for (const w of ctx.level.wind) {
      if (!w.active || !hit(this.bounds, w.rect)) continue;
      // Holding on to a planted Anchor protects you from the wind.
      const sheltered = ctx.players.some((p) => p.planted && p !== this &&
        Phaser.Math.Distance.Between(p.x, p.body.center.y, this.x, this.body.center.y) < 40);
      if (sheltered) continue;
      const mult = this.role === 'scout' ? 1.3 : 1;
      this.body.setVelocityX(this.body.velocity.x + w.data.push * mult);
    }
  }

  // ---------------------------------------------------------------- network
  snapshot() {
    return {
      id: this.id, name: this.name, role: this.role,
      x: this.ride ? this.hitbox.x : this.x,
      y: this.ride ? this.hitbox.y + this.stats.h / 2 : this.feet,
      facing: this.facing,
      crouch: this.crouching, climb: this.climbing, planted: this.planted, brace: this.bracing,
      carry: !!this.carrying, energy: Math.round(this.energy), dash: this.dashT > 0, ride: !!this.ride,
      beam: this.beam && [this.beam.x1, this.beam.y1, this.beam.x2, this.beam.y2].map(Math.round),
      flare: this.flareT > 0,
    };
  }
}
