/* ============================================================
 * renderer.js - Canvas 表现层（只读 game 状态）
 *
 * - 逻辑分辨率固定 960x600，按 devicePixelRatio 放大物理像素
 * - 背景（新宿夜景/斗技场）离屏预渲染一次，运行时零开销
 * - 角色为程序化绘制的 Q 版翻转小人，苍蓝=五条悟、赫红=两面宿傩
 * ============================================================ */
(function (global) {
  'use strict';

  var cfg = global.SD.config;

  function mulberry(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function Renderer(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scale = 1;
    this.bg = null;
    this._buildBackground(1);
  }

  Renderer.prototype = {
    /** 按 CSS 尺寸 x DPR 设置物理分辨率；返回是否发生变化 */
    resize: function () {
      var cssW = this.canvas.clientWidth;
      if (!cssW) return false;
      var dpr = Math.min(global.devicePixelRatio || 1, 2);
      var scale = cssW * dpr / cfg.W;
      var pw = Math.round(cfg.W * scale);
      var ph = Math.round(cfg.H * scale);
      if (pw === this.canvas.width && ph === this.canvas.height) return false;
      this.canvas.width = pw;
      this.canvas.height = ph;
      this.scale = scale;
      this._buildBackground(scale);
      return true;
    },

    /* ================= 背景（离屏预渲染） ================= */

    _buildBackground: function (scale) {
      var c = document.createElement('canvas');
      c.width = Math.round(cfg.W * scale);
      c.height = Math.round(cfg.H * scale);
      var g = c.getContext('2d');
      g.scale(scale, scale);
      var rng = mulberry(20260930);

      // 夜空
      var sky = g.createLinearGradient(0, 0, 0, cfg.H);
      sky.addColorStop(0, '#0a0d1f');
      sky.addColorStop(0.55, '#111029');
      sky.addColorStop(1, '#1a0f22');
      g.fillStyle = sky;
      g.fillRect(0, 0, cfg.W, cfg.H);

      // 月亮
      var mx = cfg.W * 0.82, my = 96;
      var moon = g.createRadialGradient(mx, my, 4, mx, my, 110);
      moon.addColorStop(0, 'rgba(230,235,255,0.55)');
      moon.addColorStop(0.25, 'rgba(190,200,255,0.16)');
      moon.addColorStop(1, 'rgba(190,200,255,0)');
      g.fillStyle = moon;
      g.fillRect(mx - 120, my - 120, 240, 240);
      g.fillStyle = '#dfe5ff';
      g.beginPath(); g.arc(mx, my, 26, 0, Math.PI * 2); g.fill();

      // 星点
      for (var s = 0; s < 70; s++) {
        g.fillStyle = 'rgba(255,255,255,' + (0.1 + rng() * 0.4) + ')';
        g.fillRect(rng() * cfg.W, rng() * cfg.ARENA.ceiling + 10, 1.4, 1.4);
      }

      // 远景楼宇
      this._skyline(g, rng, cfg.ARENA.floor - 60, 150, '#0e1130', 0.5);
      // 近景楼宇
      this._skyline(g, rng, cfg.ARENA.floor - 20, 90, '#070914', 0.85);

      // 斗技场地面
      var fl = cfg.ARENA.floor;
      var ground = g.createLinearGradient(0, fl, 0, cfg.H);
      ground.addColorStop(0, '#141831');
      ground.addColorStop(1, '#080a16');
      g.fillStyle = ground;
      g.fillRect(0, fl, cfg.W, cfg.H - fl);

      // 地面霓虹边线：左苍蓝 -> 中紫 -> 右赫红
      var edge = g.createLinearGradient(0, 0, cfg.W, 0);
      edge.addColorStop(0, cfg.COLORS.gojo);
      edge.addColorStop(0.5, cfg.COLORS.purple);
      edge.addColorStop(1, cfg.COLORS.sukuna);
      g.fillStyle = edge;
      g.fillRect(0, fl - 2, cfg.W, 3);
      g.fillStyle = 'rgba(120,110,255,0.08)';
      g.fillRect(0, fl - 10, cfg.W, 8);

      // 地面透视线
      g.strokeStyle = 'rgba(120,130,220,0.08)';
      g.lineWidth = 1;
      for (var xx = 0; xx <= cfg.W; xx += 48) {
        g.beginPath(); g.moveTo(xx, fl + 4); g.lineTo(xx, cfg.H); g.stroke();
      }

      // 两侧气墙微光
      var lw = g.createLinearGradient(0, 0, 70, 0);
      lw.addColorStop(0, 'rgba(68,217,255,0.12)');
      lw.addColorStop(1, 'rgba(68,217,255,0)');
      g.fillStyle = lw; g.fillRect(0, 0, 70, fl);
      var rw = g.createLinearGradient(cfg.W, 0, cfg.W - 70, 0);
      rw.addColorStop(0, 'rgba(255,78,100,0.12)');
      rw.addColorStop(1, 'rgba(255,78,100,0)');
      g.fillStyle = rw; g.fillRect(cfg.W - 70, 0, 70, fl);

      this.bg = c;
    },

    _skyline: function (g, rng, baseY, maxH, color, winAlpha) {
      var x = -20;
      while (x < cfg.W + 20) {
        var w = 28 + rng() * 56;
        var h = 40 + rng() * maxH;
        g.fillStyle = color;
        g.fillRect(x, baseY - h, w, h);
        // 楼窗
        for (var wy = baseY - h + 8; wy < baseY - 8; wy += 12) {
          for (var wx = x + 5; wx < x + w - 5; wx += 10) {
            if (rng() > 0.62) {
              g.fillStyle = rng() > 0.5
                ? 'rgba(255,217,138,' + (0.12 * winAlpha) + ')'
                : 'rgba(150,190,255,' + (0.14 * winAlpha) + ')';
              g.fillRect(wx, wy, 4, 6);
              g.fillStyle = color;
            }
          }
        }
        x += w + 4;
      }
    },

    /* ================= 主绘制 ================= */

    draw: function (game, now) {
      var ctx = this.ctx;
      ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
      ctx.clearRect(0, 0, cfg.W, cfg.H);

      // 震屏
      if (game.shake > 0.2) {
        var a = game.shake;
        ctx.translate((Math.random() - 0.5) * a, (Math.random() - 0.5) * a);
      }

      ctx.drawImage(this.bg, 0, 0, cfg.W, cfg.H);

      this._drawTrails(ctx, game);
      this._drawProjectiles(ctx, game, now);
      if (game.maho.active && game.maho.alive) this._drawMahoraga(ctx, game.maho, now);
      this._drawFighter(ctx, game.sukuna, now);
      this._drawFighter(ctx, game.gojo, now);
      if (game.state === 'playing') this._drawAimArrow(ctx, game.gojo, now);
      this._drawParticles(ctx, game);
      this._drawFloaters(ctx, game);
      this._drawAnnouncements(ctx, game, now);

      // 受击红屏（五条悟被打中时）
      var hurtAge = (game.timeMs - game.gojo.hurtAt) / 1000;
      if (game.gojo.hurtAt > 0 && hurtAge < 0.4) {
        var vg = ctx.createRadialGradient(cfg.W / 2, cfg.H / 2, cfg.H * 0.3, cfg.W / 2, cfg.H / 2, cfg.H * 0.75);
        vg.addColorStop(0, 'rgba(255,0,40,0)');
        vg.addColorStop(1, 'rgba(255,0,40,' + (0.28 * (1 - hurtAge / 0.4)) + ')');
        ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, cfg.W, cfg.H);
      }

      // 必杀白闪
      if (game.flash > 0.01) {
        ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
        ctx.fillStyle = 'rgba(240,245,255,' + (game.flash * 0.35) + ')';
        ctx.fillRect(0, 0, cfg.W, cfg.H);
      }
    },

    /* ---------- 拖尾 ---------- */
    _drawTrails: function (ctx, game) {
      var all = [game.gojo, game.sukuna];
      if (game.maho.active) all.push(game.maho);
      all.forEach(function (f) {
        if (!f.alive) return;
        var col = f.id === 'gojo' ? cfg.COLORS.gojo : f.id === 'mahoraga' ? cfg.COLORS.gold : cfg.COLORS.sukuna;
        for (var i = 0; i < f.trail.length; i++) {
          var p = f.trail[i];
          ctx.globalAlpha = (p.life / 0.48) * 0.25;
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(p.x, p.y, f.radius * (1 - i / f.trail.length * 0.5), 0, Math.PI * 2);
          ctx.fill();
        }
      });
      ctx.globalAlpha = 1;
    },

    /* ---------- 术师（Q 版翻转小人） ---------- */
    // 本地坐标：+x 为身体朝向（发射方向）
    _drawFighter: function (ctx, f, now) {
      if (!f.alive) return;
      var r = f.radius;
      var rot = f.angle + (f.baseSign < 0 ? Math.PI : 0);
      var isGojo = f.id === 'gojo';
      var main = isGojo ? cfg.COLORS.gojo : cfg.COLORS.sukuna;
      var deep = isGojo ? cfg.COLORS.gojoDeep : cfg.COLORS.sukunaDeep;

      ctx.save();
      ctx.translate(f.x, f.y);

      // 护身光晕
      var aura = ctx.createRadialGradient(0, 0, r * 0.4, 0, 0, r * 2);
      aura.addColorStop(0, main + '55');
      aura.addColorStop(1, main + '00');
      ctx.fillStyle = aura;
      ctx.beginPath(); ctx.arc(0, 0, r * 2, 0, Math.PI * 2); ctx.fill();

      ctx.rotate(rot);

      // 身体（圆角胶囊）
      var bw = r * 1.7, bh = r * 1.18;
      var bg = ctx.createLinearGradient(0, -bh / 2, 0, bh / 2);
      bg.addColorStop(0, isGojo ? '#2b3f7a' : '#3d1220');
      bg.addColorStop(1, deep);
      this._roundRect(ctx, -bw / 2, -bh / 2, bw, bh, bh / 2);
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = main;
      ctx.stroke();

      // 衣领高领（白 / 暗红）
      ctx.fillStyle = isGojo ? '#e8f6ff' : '#5a1424';
      this._roundRect(ctx, r * 0.05, -bh / 2 + 2, r * 0.5, bh * 0.34, 4);
      ctx.fill();

      // 头（位于前端）
      var hx = r * 0.62, hy = 0, hr = r * 0.58;
      var hg = ctx.createRadialGradient(hx - hr * 0.3, hy - hr * 0.3, hr * 0.2, hx, hy, hr);
      hg.addColorStop(0, '#ffe9d6');
      hg.addColorStop(1, '#f0b896');
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.arc(hx, hy, hr, 0, Math.PI * 2); ctx.fill();

      if (isGojo) {
        // 五条悟：白发 + 黑色眼罩
        ctx.fillStyle = '#f2f6ff';
        ctx.beginPath();
        ctx.arc(hx, hy, hr, Math.PI * 1.02, Math.PI * 2.02);
        ctx.fill();
        ctx.fillRect(hx - hr, hy - hr * 0.05, hr * 2, hr * 0.4);
        ctx.fillStyle = '#10131f';
        this._roundRect(ctx, hx - hr * 0.95, hy - hr * 0.3, hr * 1.9, hr * 0.52, hr * 0.26);
        ctx.fill();
      } else {
        // 两面宿傩：粉色尖发 + 纹面 + 四眼
        ctx.fillStyle = '#d96b7f';
        ctx.beginPath();
        ctx.arc(hx, hy, hr, Math.PI * 1.02, Math.PI * 2.02);
        ctx.fill();
        for (var k = -2; k <= 2; k++) {
          var tx = hx + k * hr * 0.4;
          ctx.beginPath();
          ctx.moveTo(tx - hr * 0.18, hy - hr * 0.72);
          ctx.lineTo(tx, hy - hr * (1.05 + Math.abs(k) * -0.06));
          ctx.lineTo(tx + hr * 0.18, hy - hr * 0.72);
          ctx.fill();
        }
        // 四只眼
        ctx.fillStyle = '#ff2d4d';
        [[-0.32, -0.28], [0.3, -0.28], [-0.32, 0.24], [0.3, 0.24]].forEach(function (e) {
          ctx.beginPath();
          ctx.arc(hx + e[0] * hr, hy + e[1] * hr, hr * 0.1, 0, Math.PI * 2);
          ctx.fill();
        });
        // 面纹
        ctx.strokeStyle = '#c32042';
        ctx.lineWidth = 1.4;
        for (var k2 = -1; k2 <= 1; k2 += 2) {
          ctx.beginPath();
          ctx.moveTo(hx + k2 * hr * 0.42, hy + hr * 0.42);
          ctx.lineTo(hx + k2 * hr * 0.6, hy + hr * 0.72);
          ctx.stroke();
        }
      }

      ctx.restore();

      // 受击白闪
      var hurtAge2 = (now - f.hurtAt) / 1000;
      if (f.hurtAt > 0 && hurtAge2 >= 0 && hurtAge2 < 0.15) {
        ctx.globalAlpha = 1 - hurtAge2 / 0.15;
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(f.x, f.y, r * 1.1, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
    },

    /* ---------- 魔虚罗 ---------- */
    _drawMahoraga: function (ctx, m, now) {
      var r = m.radius;
      ctx.save();
      ctx.translate(m.x, m.y);

      // 转轮（头顶，独立旋转）
      ctx.save();
      ctx.translate(0, -r * 1.15);
      ctx.rotate(m.wheelAngle);
      ctx.strokeStyle = cfg.COLORS.gold;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2); ctx.stroke();
      for (var i = 0; i < 8; i++) {
        var a = i * Math.PI / 4;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3);
        ctx.lineTo(Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72);
        ctx.stroke();
      }
      ctx.restore();

      // 光晕
      var aura = ctx.createRadialGradient(0, 0, r * 0.4, 0, 0, r * 1.9);
      aura.addColorStop(0, 'rgba(228,200,102,0.35)');
      aura.addColorStop(1, 'rgba(228,200,102,0)');
      ctx.fillStyle = aura;
      ctx.beginPath(); ctx.arc(0, 0, r * 1.9, 0, Math.PI * 2); ctx.fill();

      ctx.rotate(m.angle);
      // 灰白巨躯
      var bg = ctx.createLinearGradient(0, -r, 0, r);
      bg.addColorStop(0, '#e8e4d8');
      bg.addColorStop(1, '#8d8878');
      ctx.fillStyle = bg;
      this._roundRect(ctx, -r * 0.85, -r * 0.7, r * 1.7, r * 1.4, r * 0.5);
      ctx.fill();
      ctx.strokeStyle = '#5b5647';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      // 头部：兽形 + 双角
      ctx.fillStyle = '#cfcab8';
      ctx.beginPath(); ctx.arc(r * 0.55, 0, r * 0.52, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#8d8878';
      ctx.beginPath();
      ctx.moveTo(r * 0.35, -r * 0.35); ctx.lineTo(r * 0.12, -r * 0.9); ctx.lineTo(r * 0.55, -r * 0.48);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(r * 0.75, -r * 0.35); ctx.lineTo(r * 1.02, -r * 0.9); ctx.lineTo(r * 0.62, -r * 0.48);
      ctx.fill();
      // 赤瞳
      ctx.fillStyle = '#ff3b3b';
      ctx.beginPath(); ctx.arc(r * 0.62, -r * 0.06, r * 0.1, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(r * 0.62, r * 0.22, r * 0.1, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      var hurtAge = (now - m.hurtAt) / 1000;
      if (m.hurtAt > 0 && hurtAge >= 0 && hurtAge < 0.15) {
        ctx.globalAlpha = 1 - hurtAge / 0.15;
        ctx.fillStyle = cfg.COLORS.gold;
        ctx.beginPath(); ctx.arc(m.x, m.y, r * 1.15, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
    },

    /* ---------- 弹丸（发光法球 + 术式汉字） ---------- */
    _drawProjectiles: function (ctx, game, now) {
      game.projectiles.forEach(function (p) {
        var flicker = p.type === 'flame' ? 1 + 0.12 * Math.sin(now / 45) : 1;
        var R = p.radius;

        var glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, R * 3.2 * flicker);
        glow.addColorStop(0, p.color);
        glow.addColorStop(0.35, p.color + '88');
        glow.addColorStop(1, p.color + '00');
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(p.x, p.y, R * 3.2 * flicker, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;

        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, R * flicker, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = p.core;
        ctx.beginPath(); ctx.arc(p.x, p.y, R * 0.55, 0, Math.PI * 2); ctx.fill();

        // 术式名
        ctx.fillStyle = p.power === 3 ? '#1a1030' : '#0b1020';
        ctx.font = 'bold ' + Math.round(R * 1.25) + 'px "Songti SC","SimSun",serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.label, p.x, p.y + 1);
      });
    },

    /* ---------- 粒子 / 飘字 / 公告 ---------- */
    _drawParticles: function (ctx, game) {
      game.particles.forEach(function (pt) {
        ctx.globalAlpha = Math.max(pt.life / pt.maxLife, 0);
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    },

    _drawFloaters: function (ctx, game) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      game.floaters.forEach(function (f) {
        var bf = f.text.indexOf('黑闪') === 0;
        ctx.globalAlpha = Math.min(f.life / 0.4, 1);
        ctx.font = 'bold ' + (bf ? 24 : 17) + 'px sans-serif';
        ctx.lineWidth = 4;
        ctx.strokeStyle = bf ? 'rgba(228,200,102,0.95)' : 'rgba(0,0,0,0.7)';
        ctx.strokeText(f.text, f.x, f.y);
        ctx.fillStyle = bf ? '#0b0b0b' : f.color;
        ctx.fillText(f.text, f.x, f.y);
      });
      ctx.globalAlpha = 1;
    },

    _drawAnnouncements: function (ctx, game) {
      var n = game.announcements.length;
      game.announcements.forEach(function (a, idx) {
        var t = a.life / a.maxLife;
        var scale = t > 0.8 ? 0.8 + (1 - t) * 1.2 : 1; // 出场弹出
        ctx.save();
        ctx.translate(cfg.W / 2, 150 + idx * 52 - (n - 1) * 26);
        ctx.scale(scale, scale);
        ctx.globalAlpha = Math.min(1, t * 2);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 38px "Songti SC","SimSun",serif';
        ctx.lineWidth = 7;
        ctx.strokeStyle = 'rgba(5,6,13,0.85)';
        ctx.strokeText(a.text, 0, 0);
        ctx.fillStyle = a.color;
        ctx.fillText(a.text, 0, 0);
        ctx.restore();
      });
      ctx.globalAlpha = 1;
    },

    /* ---------- 朝向指示（降低操作门槛） ---------- */
    _drawAimArrow: function (ctx, f, now) {
      var a = f.angle;
      var d = f.radius + 16 + 3 * Math.sin(now / 180);
      var x = f.x + Math.cos(a) * d;
      var y = f.y + Math.sin(a) * d;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = cfg.COLORS.gojo;
      ctx.beginPath();
      ctx.moveTo(8, 0); ctx.lineTo(-5, -6); ctx.lineTo(-2, 0); ctx.lineTo(-5, 6);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
    },

    _roundRect: function (ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }
  };

  global.SD.Renderer = Renderer;
})(window);
