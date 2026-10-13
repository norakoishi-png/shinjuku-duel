/* ============================================================
 * config.js - 全局配置：场地 / 术式 / 难度 / 音频资源
 *
 * 说明：本作为免费同人游戏《新宿决战 JUJUTSU PHYSICS DUEL》
 * 的简化版，角色名称（五条悟 / 两面宿傩 / 魔虚罗）、术式名称
 * （苍 / 赫 / 虚式「茈」 / 解 / 捌 / 「开」）与数值体系沿用原作，
 * BGM 与音效直接引用原作已公开发布的同一份音频资源。
 * ============================================================ */
(function (global) {
  'use strict';

  /** 逻辑画布尺寸（渲染层按 DPR 放大，CSS 再缩放，保证清晰） */
  var W = 960;
  var H = 600;

  var config = {
    W: W,
    H: H,

    /** 竞技场边界（与原作一致的悬空斗技场：有顶、有地、两侧软墙） */
    ARENA: { floor: H - 92, ceiling: 68, side: 10 },

    /** 重力（像素/秒²，参考原作） */
    GRAVITY: 195,

    COLORS: {
      gojo: '#44d9ff',
      gojoDeep: '#266fff',
      sukuna: '#ff4e64',
      sukunaDeep: '#9a1732',
      purple: '#b05cff',
      flame: '#ffb23f',
      gold: '#e4c866',
      white: '#f5f8ff'
    },

    /**
     * 术式规格表
     * speed 弹速 / radius 判定半径 / damage 伤害 / knock 命中击退
     * recoil 发射反作用力 / life 存活秒数 / power 档位
     */
    ABILITIES: {
      blue:   { side: 'gojo',   label: '苍', color: '#44d9ff', core: '#e9fbff', speed: 470, radius: 9,  damage: 10, knock: 175, recoil: 215, life: 2.1, power: 1 },
      red:    { side: 'gojo',   label: '赫', color: '#ff536d', core: '#fff0e7', speed: 560, radius: 12, damage: 16, knock: 260, recoil: 285, life: 2.0, power: 2 },
      purple: { side: 'gojo',   label: '茈', color: '#b05cff', core: '#ffffff', speed: 690, radius: 18, damage: 30, knock: 420, recoil: 365, life: 1.8, power: 3,
                announce: '虚式「茈」' },
      slash:  { side: 'sukuna', label: '解', color: '#ff4e64', core: '#ffe9ed', speed: 530, radius: 8,  damage: 10, knock: 185, recoil: 220, life: 1.9, power: 1 },
      cleave: { side: 'sukuna', label: '捌', color: '#f7f2ff', core: '#ffffff', speed: 580, radius: 7,  damage: 9,  knock: 165, recoil: 270, life: 1.75, power: 2,
                spread: [-0.1, 0.1] },            // 捌：双发扇形斩击
      flame:  { side: 'sukuna', label: '开', color: '#ffb23f', core: '#fff6d2', speed: 650, radius: 19, damage: 30, knock: 430, recoil: 370, life: 1.8, power: 3,
                announce: '■「开」' }
    },

    /** 出手节奏 */
    SHOT: {
      playerCooldown: 260,     // 玩家（五条悟）冷却 ms
      aiCooldown: 510,         // AI（宿傩）冷却 ms
      everyNth: 3,             // 每 3 发为二档术式（赫 / 捌）
      chargeGain: 13,          // 每发咒力增量
      chargeUlt: 100,          // 满槽 -> 必杀
      domainChargePerShot: 8   // （简化版未使用领域，保留数值备忘）
    },

    /** 黑闪：近距离命中概率触发，伤害翻倍 */
    BLACK_FLASH: { chance: 0.16, multiplier: 1.6, range: 150 },

    /**
     * 难度三选一（原作四档，简化版去掉「无间」）
     * aimMin/aimMax ：出手时身体朝向与目标的夹角余弦阈值（越小越准）
     * forcedShotMs  ：等不到好角度也强制出手的时限
     * reactionMin/Max：AI 出手间隔
     * damageMul     ：宿傩造成伤害倍率
     * takenMul      ：宿傩承受伤害倍率（减伤）
     * knockTakenMul ：宿傩被击退倍率
     * projectileSpeed：宿傩弹速倍率
     * lead          ：预判提前量（秒）
     */
    DIFFICULTIES: {
      easy: {
        label: '轻松', startDelay: 850,
        aimMin: 0.5, aimMax: 0.76, forcedShotMs: 2200,
        reactionMin: 700, reactionMax: 1100,
        damageMul: 0.86, takenMul: 1, knockTakenMul: 1,
        projectileSpeed: 1, lead: 0.05,
        mahoraga: false
      },
      normal: {
        label: '标准', startDelay: 450,
        aimMin: 0.25, aimMax: 0.55, forcedShotMs: 1450,
        reactionMin: 430, reactionMax: 760,
        damageMul: 1.1, takenMul: 0.9, knockTakenMul: 0.88,
        projectileSpeed: 1.06, lead: 0.22,
        mahoraga: false
      },
      shura: {
        label: '修罗', startDelay: 250,
        aimMin: 0.06, aimMax: 0.24, forcedShotMs: 760,
        reactionMin: 260, reactionMax: 460,
        damageMul: 1.4, takenMul: 0.9, knockTakenMul: 0.7,
        projectileSpeed: 1.16, lead: 0.42,
        mahoraga: true
      }
    },
    DEFAULT_DIFFICULTY: 'easy',

    /** 魔虚罗（修罗难度：宿傩血量低于 70 时参战） */
    MAHORAGA: {
      triggerHp: 70,
      hp: 72,
      attackInterval: 1100,   // ms
      attackDamage: 10,
      attackSpeed: 560,
      adaptPerStack: 0.18,    // 同类术式适应减伤
      adaptCap: 0.55
    },

    /** 音频资源：与原作完全相同的公开地址（BGM 为用户要求保留项） */
    AUDIO_BASE: 'https://fancy-chaja-9945bc.netlify.app/assets/',
    AUDIO: {
      bgm: 'audio/bgm-battle-v1.mp3',
      vacuum: 'sfx/vacuum_whoosh.mp3',        // 苍
      laser: 'sfx/laser_shot.mp3',
      shockwave: 'sfx/energy_shockwave.mp3',  // 赫
      swordWhoosh: 'sfx/sword_whoosh.mp3',    // 解
      magicSlice: 'sfx/magic_sword_slice.mp3',// 捌
      swordImpact: 'sfx/sword_impact.mp3',    // 命中
      fireExplosion: 'sfx/fire_spell_explosion.mp3', // 开
      fireball: 'sfx/fireball_spell.mp3',
      magicMystery: 'sfx/magic_mystery_whoosh.mp3',  // 茈
      thunderHit: 'sfx/cinematic_thunder_hit.mp3',   // 魔虚罗 / 黑闪
      movieImpact: 'sfx/movie_impact.mp3'
    },

    STORAGE_KEY: 'shinjuku-duel-lite-v1'
  };

  global.SD = global.SD || {};
  global.SD.config = config;
})(window);
