/* ============================================================
 * game.js - 核心战斗逻辑（纯逻辑 + FX 数据，不直接操作 DOM）
 *
 * 核心玩法循环（与原作一致，做了规则简化）：
 *  1. 两名咒术师是悬空斗技场里的"翻转刚体"：受重力下坠、
 *     触墙反弹、带角速度持续翻滚。
 *  2. 点击即沿【身体当前朝向】射出术式弹丸，发射产生反作用力
 *     把自己向反方向推开并追加旋转 —— 在翻滚中卡角度命中对手。
 *  3. 术式循环：普通 → 普通 → 二档（每 3 发）；咒力槽满 -> 必杀。
 *  4. 简化：去掉双人/联机/领域展开；修罗难度保留魔虚罗援军。
 * ============================================================ */
(function (global) {
  'use strict';

  var cfg = global.SD.config;
  var TAU = Math.PI * 2;

  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* ---------------- 角色工厂 ---------------- */

  function createFighter(id) {
    var isGojo = id === 'gojo';
    var radius = clamp(Math.min(cfg.W, cfg.H) * 0.055, 27, 39);
    return {
      id: id,
      name: isGojo ? '五条悟' : '两面宿傩',
      x: isGojo ? cfg.W * 0.28 : cfg.W * 0.72,
      y: isGojo ? cfg.H * 0.58 : cfg.H * 0.34,
      vx: isGojo ? 35 : -35,
      vy: -90,
      angle: Math.atan2(-cfg.H * 0.24, cfg.W * 0.44),
      angVel: isGojo ? -0.58 : 0.58,
      radius: radius,
      hp: 100, maxHp: 100,
      charge: 0,
      shotCount: 0,
      lastShotAt: -1e4,
      hurtAt: -1e4,
      baseSign: isGojo ? 1 : -1,
      alive: true,
      trail: []
    };
  }

  function createMahoraga() {
    return {
      id: 'mahoraga',
      name: '魔虚罗',
      x: cfg.W * 0.54,
      y: cfg.H * 0.34,
      vx: -24, vy: -72,
      angle: -0.16,
      angVel: 0.42,
      radius: clamp(Math.min(cfg.W, cfg.H) * 0.062, 31, 43),
      hp: cfg.MAHORAGA.hp, maxHp: cfg.MAHORAGA.hp,
      alive: true, active: false,
      hurtAt: -1e4,
      wheelAngle: 0,
      adapt: Object.create(null),
      trail: []
    };
  }

  /* ---------------- 游戏主体 ---------------- */

  function Game() {
    this.state = 'idle'; // idle / playing / paused / ended
    this.events = [];    // 每帧由 main 取走的事件（音效等）
    this.reset(cfg.DEFAULT_DIFFICULTY, true);
  }

  Game.prototype = {
    /* ============ 局生命周期 ============ */

    reset: function (difficulty, silent) {
      this.difficulty = cfg.DIFFICULTIES[difficulty] ? difficulty : cfg.DEFAULT_DIFFICULTY;
      this.profile = cfg.DIFFICULTIES[this.difficulty];

      this.gojo = createFighter('gojo');
      this.sukuna = createFighter('sukuna');
      this.maho = createMahoraga();

      this.projectiles = [];
      this.particles = [];
      this.floaters = [];
      this.announcements = [];

      this.shake = 0;
      this.flash = 0;
      this.timeMs = 0;

      // AI 计时
      this.aiNextAt = this.profile.startDelay;
      this.aiWaitStart = 0;
      this.mahoNextAttackAt = 0;

      // 战绩统计
      this.stats = { shots: 0, hits: 0, blackFlash: 0, startedAt: 0, duration: 0 };
      this.result = null;

      this.state = 'idle';
      if (!silent) this.events.push({ t: 'reset' });
    },

    /** 倒计时结束后进入战斗 */
    begin: function () {
      this.state = 'playing';
      this.stats.startedAt = this.timeMs;
    },

    pause: function () { if (this.state === 'playing') this.state = 'paused'; },
    resume: function () { if (this.state === 'paused') this.state = 'playing'; },

    /* ============ 主更新 ============ */

    update: function (dt) {
      this._updateFx(dt);
      if (this.state !== 'playing') return;

      this.timeMs += dt * 1000;

      this._updateBody(this.gojo, dt);
      this._updateBody(this.sukuna, dt);
      this._updateMahoraga(dt);
      this._updateAi(this.timeMs);
      this._updateProjectiles(dt);

      this.stats.duration = this.timeMs - this.stats.startedAt;
    },

    /* ============ 刚体物理 ============ */

    _updateBody: function (f, dt) {
      if (!f.alive) return;
      var A = cfg.ARENA;

      f.vy += cfg.GRAVITY * dt;
      f.vx *= Math.pow(0.993, dt * 60);
      f.vy *= Math.pow(0.998, dt * 60);
      f.angVel *= Math.pow(0.997, dt * 60);

      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.angle += f.angVel * dt;
      f.angle = ((f.angle + Math.PI) % TAU + TAU) % TAU - Math.PI;

      var r = f.radius;
      var color = f.id === 'gojo' ? cfg.COLORS.gojo : cfg.COLORS.sukuna;

      // 左右软墙
      if (f.x < A.side + r) {
        f.x = A.side + r;
        f.vx = Math.abs(f.vx) * 0.78;
        f.angVel += rand(-0.65, 0.65);
        this.burst(f.x - r, f.y, color, 5, 120);
      } else if (f.x > cfg.W - A.side - r) {
        f.x = cfg.W - A.side - r;
        f.vx = -Math.abs(f.vx) * 0.78;
        f.angVel += rand(-0.65, 0.65);
        this.burst(f.x + r, f.y, color, 5, 120);
      }
      // 顶
      if (f.y < A.ceiling + r) {
        f.y = A.ceiling + r;
        f.vy = Math.abs(f.vy) * 0.75;
        f.angVel += rand(-0.7, 0.7);
      }
      // 地面：持续弹跳，保证战斗不停滞
      if (f.y > A.floor - r) {
        f.y = A.floor - r;
        f.vy = -Math.max(105, Math.abs(f.vy) * 0.7);
        f.vx += rand(-25, 25);
        f.angVel += rand(-0.75, 0.75);
        this.burst(f.x, f.y + r, color, 6, 130);
      }

      // 拖尾
      var last = f.trail[0];
      if (!last || Math.hypot(last.x - f.x, last.y - f.y) > 6) {
        f.trail.unshift({ x: f.x, y: f.y, life: 0.48 });
        if (f.trail.length > 12) f.trail.pop();
      }
      for (var i = 0; i < f.trail.length; i++) f.trail[i].life -= dt;
      f.trail = f.trail.filter(function (p) { return p.life > 0; });
    },

    /* ============ 术式 / 攻击 ============ */

    /** 身体当前朝向前方（baseSign 决定两人朝向基准相反） */
    _facing: function (f, offset) {
      var a = f.angle + (offset || 0);
      return { x: Math.cos(a) * f.baseSign, y: Math.sin(a) * f.baseSign };
    },

    /** 玩家 / AI 出手入口 */
    tryAttack: function (id, source) {
      if (this.state !== 'playing') return false;
      var f = id === 'gojo' ? this.gojo : this.sukuna;
      if (!f.alive) return false;
      if (id === 'sukuna' && source !== 'ai') return false;

      var now = this.timeMs;
      var cd = id === 'gojo' ? cfg.SHOT.playerCooldown : cfg.SHOT.aiCooldown;
      if (now - f.lastShotAt < cd) return false;

      f.lastShotAt = now;
      f.shotCount += 1;
      if (id === 'gojo') this.stats.shots += 1;

      var isUlt = f.charge >= cfg.SHOT.chargeUlt;
      var is2nd = !isUlt && f.shotCount % cfg.SHOT.everyNth === 0;
      var ability;
      if (id === 'gojo') ability = isUlt ? 'purple' : (is2nd ? 'red' : 'blue');
      else ability = isUlt ? 'flame' : (is2nd ? 'cleave' : 'slash');

      f.charge = isUlt ? 0 : clamp(f.charge + cfg.SHOT.chargeGain, 0, 100);

      this._launch(f, ability);
      return true;
    },

    _launch: function (f, ability) {
      var spec = cfg.ABILITIES[ability];
      var offsets = spec.spread || [0];
      var speedMul = f.id === 'sukuna' ? this.profile.projectileSpeed : 1;

      for (var i = 0; i < offsets.length; i++) {
        var dir = this._facing(f, offsets[i]);
        var d = f.radius + spec.radius + 10;
        this.projectiles.push({
          owner: f.id,
          type: ability,
          label: spec.label,
          color: spec.color, core: spec.core,
          x: f.x + dir.x * d, y: f.y + dir.y * d,
          vx: dir.x * spec.speed * speedMul + f.vx * 0.12,
          vy: dir.y * spec.speed * speedMul + f.vy * 0.12,
          radius: spec.radius,
          damage: spec.damage, knock: spec.knock,
          power: spec.power,
          life: spec.life, maxLife: spec.life,
          alive: true
        });
      }

      // 反作用力：向发射方向的反方向推开，并追加翻滚
      var dir0 = this._facing(f);
      f.vx -= dir0.x * spec.recoil;
      f.vy -= dir0.y * spec.recoil;
      f.vy -= spec.power === 3 ? 35 : 12;
      f.angVel += f.baseSign * rand(1.25, 2.05) * (Math.random() > 0.16 ? -1 : 1);
      f.angVel = clamp(f.angVel, -5.2, 5.2);

      this.burst(f.x + dir0.x * (f.radius + 9), f.y + dir0.y * (f.radius + 9),
                 spec.color, spec.power === 3 ? 24 : 11, spec.power === 3 ? 240 : 135, dir0);
      this.events.push({ t: 'fire', ability: ability });

      if (spec.power === 3) {
        this.shake = Math.max(this.shake, 12);
        this.flash = 0.26;
        this.announce(spec.announce, spec.color, 1.05);
      }
    },

    /* ============ 弹丸更新与命中 ============ */

    _updateProjectiles: function (dt) {
      var A = cfg.ARENA;
      for (var i = this.projectiles.length - 1; i >= 0; i--) {
        var p = this.projectiles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;

        // 出界 / 到期消失
        if (p.life <= 0 || p.x < -30 || p.x > cfg.W + 30 || p.y < A.ceiling - 30 || p.y > A.floor + 30) {
          this.projectiles.splice(i, 1);
          continue;
        }

        // 选择可命中的目标
        if (p.owner === 'gojo') {
          if (this._tryHit(p, this.sukuna, false)) { this.projectiles.splice(i, 1); continue; }
          if (this.maho.active && this._tryHit(p, this.maho, true)) { this.projectiles.splice(i, 1); continue; }
        } else {
          if (this._tryHit(p, this.gojo, false)) { this.projectiles.splice(i, 1); continue; }
        }
      }
    },

    /** 圆碰撞命中判定 */
    _tryHit: function (p, target, isMaho) {
      if (!p.alive || !target.alive) return false;
      var rr = p.radius + target.radius;
      if (Math.hypot(p.x - target.x, p.y - target.y) > rr) return false;
      this._applyDamage(p, target, isMaho);
      return true;
    },

    _applyDamage: function (p, target, isMaho) {
      var prof = this.profile;
      var fromPlayer = p.owner === 'gojo';
      var dmg = p.damage;

      // 难度修正：宿傩造成伤害 / 承受减伤
      if (!fromPlayer) dmg *= prof.damageMul;
      if (!isMaho && target.id === 'sukuna') dmg *= prof.takenMul;

      // 魔虚罗术式适应：同类攻击逐次减伤
      if (isMaho) {
        var stacks = this.maho.adapt[p.type] || 0;
        dmg *= 1 - Math.min(cfg.MAHORAGA.adaptCap, stacks * cfg.MAHORAGA.adaptPerStack);
        this.maho.adapt[p.type] = stacks + 1;
        this.maho.wheelAngle += Math.PI * 0.25;
      }

      // 黑闪：玩家近距离命中概率触发
      var blackFlash = false;
      if (fromPlayer && this.gojo.alive) {
        var dist = Math.hypot(this.gojo.x - target.x, this.gojo.y - target.y);
        if (dist < cfg.BLACK_FLASH.range && Math.random() < cfg.BLACK_FLASH.chance) {
          blackFlash = true;
          dmg *= cfg.BLACK_FLASH.multiplier;
        }
      }
      dmg = Math.max(1, Math.round(dmg));

      target.hp = clamp(target.hp - dmg, 0, target.maxHp);
      target.hurtAt = this.timeMs;

      // 击退 + 追加翻转
      var sp = Math.hypot(p.vx, p.vy) || 1;
      var nx = p.vx / sp, ny = p.vy / sp;
      var knockMul = target.id === 'sukuna' ? prof.knockTakenMul : 1;
      target.vx += nx * p.knock * knockMul;
      target.vy += ny * p.knock * knockMul - 24;
      target.angVel += rand(-2.3, 2.3);

      // 视觉/听觉反馈
      this.burst(target.x, target.y, p.color, blackFlash ? 26 : 14, blackFlash ? 260 : 180);
      this.floaters.push({
        x: target.x, y: target.y - target.radius - 6,
        text: blackFlash ? '黑闪 -' + dmg : '-' + dmg,
        color: blackFlash ? '#111' : p.color,
        life: 0.7
      });
      this.events.push({ t: 'hit', power: p.power });
      if (fromPlayer) this.stats.hits += 1;

      if (blackFlash) {
        this.stats.blackFlash += 1;
        this.shake = Math.max(this.shake, 10);
        this.flash = 0.3;
        this.announce('黑 闪', '#ffffff', 0.7);
        this.events.push({ t: 'blackflash' });
      }

      // 修罗：宿傩血量跌破阈值，魔虚罗参战
      if (!isMaho && target.id === 'sukuna' && this.profile.mahoraga &&
          this.maho.alive && !this.maho.active &&
          target.hp <= cfg.MAHORAGA.triggerHp) {
        this._summonMahoraga();
      }

      if (target.hp <= 0) {
        if (isMaho) {
          // 讨伐魔虚罗：援军退场，奖励五条悟咒力，战斗继续
          var dead = this.maho;
          dead.alive = false; dead.active = false;
          this.gojo.charge = clamp(this.gojo.charge + 40, 0, 100);
          this.announce('魔虚罗 讨伐', cfg.COLORS.gold, 1.3);
          this.burst(dead.x, dead.y, cfg.COLORS.gold, 36, 280);
          this.shake = Math.max(this.shake, 10);
          this.events.push({ t: 'summon' });
        } else {
          this._defeat(target);
        }
      }
    },

    /* ============ 魔虚罗 ============ */

    _summonMahoraga: function () {
      var m = this.maho;
      m.active = true;
      m.x = cfg.W * 0.54; m.y = cfg.H * 0.3;
      m.vx = -24; m.vy = -72; m.angVel = 0.42;
      m.trail = [];
      this.mahoNextAttackAt = this.timeMs + 900;
      this.announce('魔虚罗 参战', cfg.COLORS.gold, 1.4);
      this.burst(m.x, m.y, cfg.COLORS.gold, 30, 250);
      this.shake = Math.max(this.shake, 8);
      this.events.push({ t: 'summon' });
    },

    _updateMahoraga: function (dt) {
      var m = this.maho;
      if (!m.alive || !m.active) return;
      this._updateBody(m, dt);
      m.wheelAngle += dt * 1.2;

      // 周期性朝五条悟发射适应斩
      if (this.state === 'playing' && this.timeMs >= this.mahoNextAttackAt && this.gojo.alive) {
        this.mahoNextAttackAt = this.timeMs + cfg.MAHORAGA.attackInterval;
        var M = cfg.MAHORAGA;
        var ang = Math.atan2(this.gojo.y - m.y, this.gojo.x - m.x) + rand(-0.12, 0.12);
        var d = m.radius + 14;
        this.projectiles.push({
          owner: 'mahoraga', type: 'mahoSlash',
          label: '剣', color: cfg.COLORS.gold, core: '#fff8d6',
          x: m.x + Math.cos(ang) * d, y: m.y + Math.sin(ang) * d,
          vx: Math.cos(ang) * M.attackSpeed, vy: Math.sin(ang) * M.attackSpeed,
          radius: 9, damage: M.attackDamage, knock: 200,
          power: 1, life: 2.2, maxLife: 2.2, alive: true
        });
        m.vx -= Math.cos(ang) * 60;
        m.vy -= Math.sin(ang) * 60;
        this.events.push({ t: 'fire', ability: 'slash' });
      }
    },

    /* ============ AI ============ */

    _updateAi: function (now) {
      if (now < this.aiNextAt || !this.sukuna.alive || !this.gojo.alive) return;
      var p = this.profile;
      var s = this.sukuna, g = this.gojo;

      var dir = this._facing(s);
      // 预判目标位置（带提前量）
      var tx = g.x + g.vx * p.lead - s.x;
      var ty = g.y + g.vy * p.lead - s.y;
      var len = Math.hypot(tx, ty) || 1;
      var alignment = dir.x * (tx / len) + dir.y * (ty / len);
      var waited = now - this.aiWaitStart;

      if (alignment > rand(p.aimMin, p.aimMax) || waited > p.forcedShotMs) {
        if (this.tryAttack('sukuna', 'ai')) {
          this.aiNextAt = now + rand(p.reactionMin, p.reactionMax);
          this.aiWaitStart = now;
        } else {
          this.aiNextAt = now + 80;
        }
      } else {
        this.aiNextAt = now + 100;
      }
    },

    /* ============ 胜负 ============ */

    _defeat: function (loser) {
      loser.alive = false;
      this.state = 'ended';
      var win = loser.id !== 'gojo';
      this.result = {
        win: win,
        duration: this.stats.duration,
        shots: this.stats.shots,
        hits: this.stats.hits,
        blackFlash: this.stats.blackFlash
      };
      this.shake = 14;
      this.burst(loser.x, loser.y, loser.id === 'gojo' ? cfg.COLORS.gojo : cfg.COLORS.sukuna, 40, 300);
      this.events.push({ t: 'end', win: win });
    },

    /* ============ FX 数据（渲染层只读） ============ */

    burst: function (x, y, color, count, speed, bias) {
      for (var i = 0; i < count; i++) {
        var ang = Math.random() * TAU;
        var sp = speed * rand(0.3, 1);
        this.particles.push({
          x: x, y: y,
          vx: Math.cos(ang) * sp + (bias ? bias.x * speed * 0.4 : 0),
          vy: Math.sin(ang) * sp + (bias ? bias.y * speed * 0.4 : 0),
          r: rand(1.6, 3.6),
          color: color,
          life: rand(0.3, 0.65), maxLife: 0.65
        });
      }
    },

    announce: function (text, color, dur) {
      this.announcements.push({ text: text, color: color, life: dur, maxLife: dur });
    },

    _updateFx: function (dt) {
      var i;
      for (i = this.particles.length - 1; i >= 0; i--) {
        var pt = this.particles[i];
        pt.life -= dt;
        if (pt.life <= 0) { this.particles.splice(i, 1); continue; }
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.vx *= Math.pow(0.94, dt * 60);
        pt.vy *= Math.pow(0.94, dt * 60);
      }
      for (i = this.floaters.length - 1; i >= 0; i--) {
        var f = this.floaters[i];
        f.life -= dt;
        f.y -= dt * 42;
        if (f.life <= 0) this.floaters.splice(i, 1);
      }
      for (i = this.announcements.length - 1; i >= 0; i--) {
        this.announcements[i].life -= dt;
        if (this.announcements[i].life <= 0) this.announcements.splice(i, 1);
      }
      if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 26);
      if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 1.4);
    },

    /** main 每帧取走红黑事件 */
    drainEvents: function () {
      var ev = this.events;
      this.events = [];
      return ev;
    }
  };

  global.SD.Game = Game;
})(window);
