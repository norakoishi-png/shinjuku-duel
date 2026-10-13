/* ============================================================
 * main.js - 应用入口：状态流转 / 输入 / HUD / 主循环
 *
 * 界面状态：menu（主菜单）-> countdown（3-2-1-开战）
 *           -> playing <-> paused -> result -> 回菜单或再战
 * ============================================================ */
(function (global) {
  'use strict';

  var cfg = global.SD.config;
  var Game = global.SD.Game;
  var Renderer = global.SD.Renderer;
  var AudioManager = global.SD.AudioManager;

  /* ---------- DOM ---------- */
  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('game-canvas');
  var screenMenu = $('screen-menu');
  var screenPause = $('screen-pause');
  var screenResult = $('screen-result');
  var countdownEl = $('countdown');
  var tapHint = $('tap-hint');
  var diffBadge = $('diff-badge');
  var mahoBar = $('mahoraga-bar');

  var bars = {
    gojoHp: $('hp-gojo'), sukunaHp: $('hp-sukuna'), mahoHp: $('hp-maho'),
    gojoCharge: $('charge-gojo'), sukunaCharge: $('charge-sukuna')
  };

  /* ---------- 实例 ---------- */
  var audio = new AudioManager($('bgm'));
  var renderer = new Renderer(canvas);
  var game = new Game();

  var uiState = 'menu';   // menu / countdown / playing / paused / result
  var settings = loadSettings();

  /* ================= 设置持久化 ================= */

  function loadSettings() {
    try {
      return JSON.parse(localStorage.getItem(cfg.STORAGE_KEY) || '{}');
    } catch (e) { return {}; }
  }
  function saveSettings() {
    try { localStorage.setItem(cfg.STORAGE_KEY, JSON.stringify(settings)); } catch (e) {}
  }

  /* ================= 界面切换 ================= */

  function show(el) { el.classList.remove('hidden'); }
  function hide(el) { el.classList.add('hidden'); }

  function setUI(s) {
    uiState = s;
    hide(screenMenu); hide(screenPause); hide(screenResult);
    if (s === 'menu') show(screenMenu);
    if (s === 'paused') show(screenPause);
    if (s === 'result') show(screenResult);
  }

  /* ================= 开局流程 ================= */

  function startGame(diff) {
    audio.unlock();
    audio.click();
    game.reset(diff || settings.difficulty || cfg.DEFAULT_DIFFICULTY);
    if (audio.musicOn) audio.playBgm();   // 在点击手势内启动，满足自动播放策略
    tapHint.classList.remove('fade');
    mahoBar.classList.remove('show');
    diffBadge.textContent = cfg.DIFFICULTIES[game.difficulty].label;
    setUI('countdown');
    runCountdown(function () {
      setUI('playing');
      game.begin();
      audio.playBgm();
    });
  }

  /** 3 - 2 - 1 - 开战 */
  function runCountdown(done) {
    var steps = ['3', '2', '1', '开战'];
    var i = 0;
    show(countdownEl);
    (function step() {
      if (uiState !== 'countdown') { hide(countdownEl); return; } // 中途被取消
      countdownEl.textContent = steps[i];
      countdownEl.classList.remove('pop');
      void countdownEl.offsetWidth;       // 强制重排以重启动画
      countdownEl.classList.add('pop');
      i++;
      if (i < steps.length) {
        setTimeout(step, 700);
      } else {
        setTimeout(function () { hide(countdownEl); done(); }, 620);
      }
    })();
  }

  function backToMenu() {
    audio.click();
    audio.pauseBgm();
    setUI('menu');
    game.reset(game.difficulty);
    mahoBar.classList.remove('show');
  }

  /* ================= 暂停 ================= */

  function pauseGame() {
    if (uiState !== 'playing' || game.state !== 'playing') return;
    game.pause();
    audio.pauseBgm();
    setUI('paused');
  }
  function resumeGame() {
    if (uiState !== 'paused') return;
    audio.click();
    setUI('playing');
    game.resume();
    audio.playBgm();
  }

  /* ================= 结算 ================= */

  function showResult() {
    audio.pauseBgm();
    setUI('result');
    var r = game.result;
    var title = $('result-title');
    title.textContent = r.win ? '五条悟 胜' : '败北';
    title.className = 'panel-title result-title ' + (r.win ? 'win' : 'lose');
    $('result-sub').textContent = r.win
      ? '两面宿傩，讨伐成功。'
      : '还没结束 —— 调整翻转节奏，再战。';
    var sec = Math.round(r.duration / 1000);
    var acc = r.shots ? Math.round(r.hits / r.shots * 100) : 0;
    $('result-stats').innerHTML =
      '<span>用时<b>' + Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0') + '</b></span>' +
      '<span>命中率<b>' + acc + '%</b></span>' +
      '<span>黑闪<b>×' + r.blackFlash + '</b></span>';
  }

  /* ================= 输入 ================= */

  function playerFire() {
    if (uiState !== 'playing') return;
    audio.unlock();
    if (game.tryAttack('gojo', 'player')) {
      tapHint.classList.add('fade');
    }
  }

  canvas.addEventListener('pointerdown', function (e) {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    playerFire();
  });
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  document.addEventListener('keydown', function (e) {
    // 空格 / 回车：开火或流程推进
    if (e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      if (e.repeat) return;
      audio.unlock();
      if (uiState === 'playing') playerFire();
      else if (uiState === 'menu') startGame();
      else if (uiState === 'result') startGame();
      else if (uiState === 'paused') resumeGame();
      return;
    }
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
      if (uiState === 'playing') pauseGame();
      else if (uiState === 'paused') resumeGame();
      return;
    }
    if (e.key === 'm' || e.key === 'M') $('btn-music').click();
    if (e.key === 'n' || e.key === 'N') $('btn-sfx').click();
  });

  /* 首次任意手势解锁音频（浏览器自动播放策略） */
  document.addEventListener('pointerdown', function () { audio.unlock(); },
                          { capture: true, passive: true });

  /* ---------- 主菜单控件 ---------- */

  var diffCards = document.querySelectorAll('.diff-card');
  diffCards.forEach(function (card) {
    card.addEventListener('click', function () {
      audio.unlock();
      diffCards.forEach(function (c) {
        c.classList.remove('selected');
        c.setAttribute('aria-checked', 'false');
      });
      card.classList.add('selected');
      card.setAttribute('aria-checked', 'true');
      settings.difficulty = card.getAttribute('data-diff');
      saveSettings();
      audio.click();
    });
  });
  if (settings.difficulty) {
    diffCards.forEach(function (c) {
      var on = c.getAttribute('data-diff') === settings.difficulty;
      c.classList.toggle('selected', on);
      c.setAttribute('aria-checked', String(on));
    });
  } else {
    settings.difficulty = cfg.DEFAULT_DIFFICULTY;
  }

  $('btn-start-menu').addEventListener('click', function () { startGame(settings.difficulty); });

  /* ---------- HUD 按钮 ---------- */

  $('btn-pause').addEventListener('click', pauseGame);
  $('btn-resume').addEventListener('click', resumeGame);
  $('btn-restart-pause').addEventListener('click', function () { startGame(game.difficulty); });
  $('btn-menu-pause').addEventListener('click', backToMenu);
  $('btn-rematch').addEventListener('click', function () { startGame(game.difficulty); });
  $('btn-menu-result').addEventListener('click', backToMenu);

  function syncSoundBtns() {
    $('btn-music').classList.toggle('off', !audio.musicOn);
    $('btn-sfx').classList.toggle('off', !audio.sfxOn);
  }
  $('btn-music').addEventListener('click', function () {
    audio.unlock();
    audio.toggleMusic();
    settings.music = audio.musicOn;
    saveSettings();
    syncSoundBtns();
  });
  $('btn-sfx').addEventListener('click', function () {
    audio.unlock();
    audio.toggleSfx();
    settings.sfx = audio.sfxOn;
    saveSettings();
    syncSoundBtns();
  });
  if (settings.music === false) { audio.musicOn = false; }
  if (settings.sfx === false) { audio.sfxOn = false; }
  syncSoundBtns();

  /* ================= 切后台自动暂停 ================= */

  function autoPause() { if (uiState === 'playing') pauseGame(); }
  document.addEventListener('visibilitychange', function () { if (document.hidden) autoPause(); });
  global.addEventListener('blur', autoPause);

  /* ================= HUD 刷新 ================= */

  function updateHud() {
    bars.gojoHp.style.width = (game.gojo.hp / game.gojo.maxHp * 100) + '%';
    bars.sukunaHp.style.width = (game.sukuna.hp / game.sukuna.maxHp * 100) + '%';
    bars.gojoCharge.style.width = game.gojo.charge + '%';
    bars.sukunaCharge.style.width = game.sukuna.charge + '%';
    bars.gojoCharge.classList.toggle('ult-ready', game.gojo.charge >= cfg.SHOT.chargeUlt);
    bars.sukunaCharge.classList.toggle('ult-ready', game.sukuna.charge >= cfg.SHOT.chargeUlt);

    if (game.maho.active && game.maho.alive) {
      mahoBar.classList.add('show');
      bars.mahoHp.style.width = (game.maho.hp / game.maho.maxHp * 100) + '%';
    } else {
      mahoBar.classList.remove('show');
    }
  }

  /* ================= 音频事件派发 ================= */

  function handleEvents(events) {
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      if (ev.t === 'fire') audio.ability(ev.ability);
      else if (ev.t === 'hit') audio.impact(ev.power);
      else if (ev.t === 'blackflash') audio.blackFlash();
      else if (ev.t === 'summon') audio.thunder();
      else if (ev.t === 'end') {
        if (!ev.win) audio.thunder();
        setTimeout(showResult, 1100); // 留出爆炸演出时间
      }
    }
  }

  /* ================= 画布自适应 ================= */

  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(function () { renderer.resize(); }).observe(canvas);
  } else {
    global.addEventListener('resize', function () { renderer.resize(); });
  }

  /* ================= 主循环 ================= */

  function boot() {
    renderer.resize();
    diffBadge.textContent = cfg.DIFFICULTIES[game.difficulty].label;
    setUI('menu');

    var last = performance.now();
    function frame(now) {
      var dt = Math.min((now - last) / 1000, 0.05); // 切后台回来防跳帧
      last = now;

      game.update(dt);
      handleEvents(game.drainEvents());
      renderer.draw(game, game.timeMs);
      updateHud();

      global.requestAnimationFrame(frame);
    }
    global.requestAnimationFrame(frame);
  }

  boot();
})(window);
