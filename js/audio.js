/* ============================================================
 * audio.js - 音频模块
 *
 * 资源策略：BGM 与 11 个音效均沿用原作公开发布的同一份资源
 * （地址见 config.AUDIO），通过 HTMLAudio 音频池播放，
 * 无需本地音频文件；若某个资源加载失败则自动降级为
 * Web Audio 合成音，保证任何环境下都有反馈。
 * ============================================================ */
(function (global) {
  'use strict';

  var cfg = global.SD.config;
  var POOL_SIZE = 3;

  function AudioManager(bgmEl) {
    this.bgm = bgmEl;
    this.bgm.volume = 0.45;
    this.musicOn = true;
    this.sfxOn = true;

    this.pools = Object.create(null); // name -> HTMLAudio[]
    this.broken = Object.create(null); // 加载失败的资源 -> 合成降级
    this.ctx = null;
  }

  AudioManager.prototype = {
    /**
     * 必须在用户手势中调用：创建/恢复 AudioContext
     * （BGM 的播放由界面流程显式控制，不在解锁时自动开始）
     */
    unlock: function () {
      try {
        if (!this.ctx) {
          var AC = global.AudioContext || global.webkitAudioContext;
          if (AC) this.ctx = new AC();
        }
        if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      } catch (e) { /* 忽略 */ }
    },

    /* ---------- BGM ---------- */

    playBgm: function () {
      if (!this.musicOn || !this.bgm) return;
      this.bgm.play().catch(function () { /* 自动播放被拒时静默，等下次手势 */ });
    },

    pauseBgm: function () {
      if (this.bgm) this.bgm.pause();
    },

    toggleMusic: function () {
      this.musicOn = !this.musicOn;
      if (this.musicOn) { this.unlock(); } else { this.pauseBgm(); }
      return this.musicOn;
    },

    toggleSfx: function () {
      this.sfxOn = !this.sfxOn;
      return this.sfxOn;
    },

    /* ---------- 音效池 ---------- */

    _pool: function (name) {
      if (this.pools[name]) return this.pools[name];
      var list = [];
      // preload=none：避免页面初始化时大量并发预加载把请求互相挤掉（ERR_ABORTED），
      // 资源在首次 play() 时才按需拉取
      for (var i = 0; i < POOL_SIZE; i++) {
        var a = new Audio(cfg.AUDIO_BASE + cfg.AUDIO[name]);
        a.preload = 'none';
        (function (self, n, el) {
          el.addEventListener('error', function () { self.broken[n] = true; });
        })(this, name, a);
        list.push(a);
      }
      this.pools[name] = list;
      return list;
    },

    /**
     * 播放单个采样
     * @param {string} name config.AUDIO 中的键
     * @param {Object} o {volume, rate, delay}
     */
    sample: function (name, o) {
      if (!this.sfxOn) return;
      o = o || {};
      if (this.broken[name]) { this._synth(name, o); return; }
      try {
        var list = this._pool(name);
        var el = null;
        for (var i = 0; i < list.length; i++) {
          if (list[i].paused || list[i].ended) { el = list[i]; break; }
        }
        if (!el) el = list[0];

        var play = function () {
          el.volume = Math.min(Math.max(o.volume == null ? 0.7 : o.volume, 0), 1);
          el.playbackRate = o.rate || 1;
          el.play().catch(function () {});
        };

        if (o.delay) {
          setTimeout(play, o.delay * 1000);
        } else if (el.readyState >= 1) {
          // 已缓冲：从头重播（此时 seek 不会中止加载）
          el.pause();
          try { el.currentTime = 0; } catch (e) {}
          play();
        } else {
          play(); // 尚未加载：直接 play，由浏览器拉流，勿先 seek（否则 ERR_ABORTED）
        }
      } catch (e) { /* 忽略 */ }
    },

    /** 远程音效不可用时的合成兜底：短促噪声/正弦音 */
    _synth: function (name, o) {
      if (!this.ctx) return;
      try {
        var t0 = this.ctx.currentTime + (o.delay || 0);
        var osc = this.ctx.createOscillator();
        var gain = this.ctx.createGain();
        var freq = name === 'thunderHit' ? 70 : name === 'fireExplosion' ? 120 : 420;
        osc.type = name === 'swordWhoosh' || name === 'vacuum' ? 'sine' : 'square';
        osc.frequency.setValueAtTime(freq, t0);
        osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.5), t0 + 0.18);
        gain.gain.setValueAtTime(o.volume || 0.12, t0);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
        osc.connect(gain).connect(this.ctx.destination);
        osc.start(t0);
        osc.stop(t0 + 0.24);
      } catch (e) { /* 忽略 */ }
    },

    /* ---------- 游戏事件 -> 音效组合 ---------- */

    /** 释放术式 */
    ability: function (type) {
      switch (type) {
        case 'blue':
          this.sample('vacuum', { volume: 0.85, rate: 0.86 });
          this.sample('laser', { volume: 0.45, rate: 0.8, delay: 0.045 });
          break;
        case 'red':
          this.sample('shockwave', { volume: 0.9, rate: 1.18 });
          this.sample('movieImpact', { volume: 0.3, rate: 1.28 });
          break;
        case 'purple':
          this.sample('magicMystery', { volume: 0.8, rate: 0.9 });
          this.sample('thunderHit', { volume: 0.55, rate: 0.9, delay: 0.06 });
          break;
        case 'slash':
          this.sample('swordWhoosh', { volume: 0.8, rate: 1 });
          break;
        case 'cleave':
          this.sample('magicSlice', { volume: 0.8, rate: 1 });
          break;
        case 'flame':
          this.sample('fireball', { volume: 0.7, rate: 1 });
          this.sample('fireExplosion', { volume: 0.7, rate: 1, delay: 0.05 });
          break;
      }
    },

    /** 弹丸命中身体 */
    impact: function (power) {
      this.sample('swordImpact', { volume: 0.75, rate: 1 + (power - 1) * 0.1 });
      if (power >= 2) this.sample('movieImpact', { volume: 0.4, rate: 1.1 });
    },

    /** 黑闪 */
    blackFlash: function () {
      this.sample('thunderHit', { volume: 0.95, rate: 0.8 });
      this.sample('movieImpact', { volume: 0.6, rate: 0.9 });
    },

    /** 魔虚罗相关 */
    thunder: function () {
      this.sample('thunderHit', { volume: 0.85, rate: 0.85 });
    },

    click: function () {
      this.sample('laser', { volume: 0.18, rate: 1.6 });
    }
  };

  global.SD.AudioManager = AudioManager;
})(window);
