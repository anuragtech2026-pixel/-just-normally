/* ============================================================
   CHINDY.exe — interaction layer
   built by Anurag for Chindy

   // If Chindy is reading this...
   // yes, I actually made this entire thing for you.
   ============================================================ */

(function () {
  'use strict';

  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* ----------------------------------------------------------
     TYPEWRITER — types an array of {t, c} tokens into a container
     ---------------------------------------------------------- */
  function typeLine(container, tokens, speed) {
    return new Promise(function (resolve) {
      var line = document.createElement('div');
      line.className = 'cline';
      container.appendChild(line);

      if (!tokens.length) { resolve(line); return; }

      // instant mode (reduced motion or speed 0)
      if (!speed || speed <= 0) {
        tokens.forEach(function (tok) {
          var span = document.createElement('span');
          span.className = 'tk tk-' + (tok.c || 'plain');
          span.textContent = tok.t;
          line.appendChild(span);
        });
        resolve(line);
        return;
      }

      var ti = 0, ci = 0, chars = null, span = null;

      function step() {
        if (ti >= tokens.length) { resolve(line); return; }
        if (chars === null) {
          chars = Array.from(tokens[ti].t); // code-point safe (emoji flags)
          if (chars.length === 0) { ti++; chars = null; return step(); }
          span = document.createElement('span');
          span.className = 'tk tk-' + (tokens[ti].c || 'plain');
          line.appendChild(span);
        }
        span.textContent += chars[ci];
        ci++;
        if (ci >= chars.length) { ti++; ci = 0; chars = null; span = null; }
        setTimeout(step, speed);
      }
      step();
    });
  }

  /* ----------------------------------------------------------
     SOUND — tiny UI blips (Web Audio, no files)
     ---------------------------------------------------------- */
  var Sound = {
    ctx: null,
    ensure: function () {
      if (!this.ctx) {
        var Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) return null;
        try { this.ctx = new Ctor(); } catch (e) { return null; }
      }
      if (this.ctx.state === 'suspended') { this.ctx.resume().catch(function () {}); }
      return this.ctx;
    },
    blip: function (freq, dur, vol, type) {
      var ctx = this.ensure();
      if (!ctx) return;
      try {
        var now = ctx.currentTime;
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = type || 'sine';
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(vol || 0.04, now + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + dur + 0.05);
      } catch (e) { /* audio is a nicety, never a blocker */ }
    }
  };

  /* ----------------------------------------------------------
     SOUNDTRACK — a soft generated pad, never autoplays
     ---------------------------------------------------------- */
  var Music = {
    playing: false,
    ctx: null,
    bus: null,
    filter: null,
    timer: null,
    idx: 0,
    chords: [
      [261.63, 329.63, 392.00, 493.88],   // Cmaj7
      [220.00, 261.63, 329.63, 440.00],   // Am7
      [174.61, 220.00, 261.63, 329.63],   // Fmaj7
      [196.00, 246.94, 293.66, 392.00]    // G
    ],

    start: function () {
      var ctx = Sound.ensure();
      if (!ctx || this.playing) return;
      this.ctx = ctx;

      this.filter = ctx.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.value = 1500;
      this.filter.Q.value = 0.6;

      this.bus = ctx.createGain();
      this.bus.gain.cancelScheduledValues(ctx.currentTime);
      this.bus.gain.setValueAtTime(0.0001, ctx.currentTime);
      this.bus.gain.exponentialRampToValueAtTime(0.6, ctx.currentTime + 2);

      this.filter.connect(this.bus);
      this.bus.connect(ctx.destination);

      this.playing = true;
      this.schedule();
    },

    stop: function () {
      if (!this.playing) return;
      this.playing = false;
      clearTimeout(this.timer);
      var ctx = this.ctx;
      if (ctx && this.bus) {
        try {
          this.bus.gain.cancelScheduledValues(ctx.currentTime);
          this.bus.gain.setValueAtTime(Math.max(this.bus.gain.value, 0.0001), ctx.currentTime);
          this.bus.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9);
        } catch (e) {}
      }
      var bus = this.bus, filter = this.filter;
      setTimeout(function () {
        try { if (bus) bus.disconnect(); if (filter) filter.disconnect(); } catch (e) {}
      }, 1100);
      this.bus = null;
      this.filter = null;
    },

    schedule: function () {
      if (!this.playing || !this.ctx) return;
      var ctx = this.ctx;
      var when = ctx.currentTime + 0.08;
      var dur = 7.2;
      var chord = this.chords[this.idx % this.chords.length];
      this.idx++;

      for (var i = 0; i < chord.length; i++) {
        this.voice(chord[i], when, dur, i);
      }
      // two gentle sparkle notes over each chord
      this.pluck(chord[2] * 2, when + 2.6, 0.016);
      if (this.idx % 2 === 0) this.pluck(chord[3] * 2, when + 4.6, 0.013);

      var self = this;
      this.timer = setTimeout(function () { self.schedule(); }, (dur - 0.5) * 1000);
    },

    voice: function (freq, when, dur, i) {
      var ctx = this.ctx;
      try {
        var osc = ctx.createOscillator();
        osc.type = i === 0 ? 'sine' : 'triangle';
        osc.frequency.value = freq;
        osc.detune.value = i % 2 ? 5 : -5;

        var g = ctx.createGain();
        var peak = i === 0 ? 0.055 : 0.028;
        g.gain.setValueAtTime(0.0001, when);
        g.gain.exponentialRampToValueAtTime(peak, when + 1.7);
        g.gain.setValueAtTime(peak, when + dur - 2.4);
        g.gain.exponentialRampToValueAtTime(0.0001, when + dur);

        osc.connect(g).connect(this.filter);
        osc.start(when);
        osc.stop(when + dur + 0.1);
      } catch (e) {}
    },

    pluck: function (freq, when, vol) {
      var ctx = this.ctx;
      try {
        var osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        var g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, when);
        g.gain.exponentialRampToValueAtTime(vol, when + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, when + 1.6);
        osc.connect(g).connect(this.filter);
        osc.start(when);
        osc.stop(when + 1.7);
      } catch (e) {}
    }
  };

  /* ----------------------------------------------------------
     STARFIELD — twinkling stars, drifting dust, tiny hearts
     ---------------------------------------------------------- */
  function initStarfield() {
    var canvas = $('#starfield');
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext('2d');
    var w = 0, h = 0;
    var stars = [], motes = [], floaters = [];
    var raf = 0, running = false;
    var t0 = (window.performance && performance.now()) || Date.now();
    var lastHeart = 0;

    var STAR_COLORS = ['#ffffff', '#ffffff', '#e6ddff', '#ffd9ec', '#cfe9ff'];
    var MOTE_COLORS = ['#ff9fc6', '#b9a5ff', '#9ad8ff'];

    function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

    function build() {
      var area = w * h;
      var n = Math.max(60, Math.min(150, Math.round(area / 9500)));
      stars = [];
      for (var i = 0; i < n; i++) {
        stars.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: Math.random() * 1.3 + 0.35,
          a: Math.random() * 0.5 + 0.25,
          ph: Math.random() * Math.PI * 2,
          sp: 0.4 + Math.random() * 0.9,
          c: pick(STAR_COLORS)
        });
      }
      motes = [];
      var mn = REDUCED ? 0 : Math.max(6, Math.min(16, Math.round(area / 70000)));
      for (var j = 0; j < mn; j++) {
        motes.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: Math.random() * 1.6 + 0.6,
          vy: -(Math.random() * 0.12 + 0.04),
          sw: Math.random() * Math.PI * 2,
          sws: Math.random() * 0.01 + 0.004,
          a: Math.random() * 0.16 + 0.07,
          c: pick(MOTE_COLORS)
        });
      }
      floaters = [];
    }

    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
      if (REDUCED) drawStatic();
    }

    function heartPath(x, y, s) {
      ctx.beginPath();
      ctx.moveTo(x, y + s);
      ctx.bezierCurveTo(x - s * 1.4, y, x - s * 1.1, y - s * 1.1, x, y - s * 0.35);
      ctx.bezierCurveTo(x + s * 1.1, y - s * 1.1, x + s * 1.4, y, x, y + s);
      ctx.closePath();
    }

    function drawStars(t) {
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        var a = REDUCED ? s.a : s.a * (0.55 + 0.45 * Math.sin(t * s.sp + s.ph));
        ctx.globalAlpha = Math.max(0, a);
        ctx.fillStyle = s.c;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function drawStatic() {
      ctx.clearRect(0, 0, w, h);
      drawStars(0);
    }

    function spawnHeart(now) {
      floaters.push({
        x: Math.random() * w,
        y: h + 12,
        s: 3 + Math.random() * 3.5,
        vy: 0.18 + Math.random() * 0.2,
        ph: Math.random() * Math.PI * 2,
        a: 0.4 + Math.random() * 0.2,
        c: Math.random() > 0.45 ? '#ff9fc6' : '#c4b5fd',
        born: now,
        life: 9000 + Math.random() * 4000
      });
    }

    function frame(now) {
      if (!running) return;
      raf = requestAnimationFrame(frame);
      var t = (now - t0) / 1000;

      ctx.clearRect(0, 0, w, h);
      drawStars(t);

      for (var i = 0; i < motes.length; i++) {
        var m = motes[i];
        m.y += m.vy;
        m.sw += m.sws;
        m.x += Math.sin(m.sw) * 0.18;
        if (m.y < -8) { m.y = h + 8; m.x = Math.random() * w; }
        ctx.globalAlpha = m.a;
        ctx.fillStyle = m.c;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        ctx.fill();
      }

      if (now - lastHeart > 7000 && floaters.length < 3) {
        lastHeart = now;
        spawnHeart(now);
      }
      for (var k = floaters.length - 1; k >= 0; k--) {
        var f = floaters[k];
        var age = (now - f.born) / 1000;
        if (age * 1000 > f.life) { floaters.splice(k, 1); continue; }
        f.y -= f.vy;
        f.x += Math.sin(age * 1.3 + f.ph) * 0.3;
        ctx.globalAlpha = Math.sin(Math.PI * (age * 1000 / f.life)) * f.a;
        ctx.fillStyle = f.c;
        heartPath(f.x, f.y, f.s);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function start() {
      if (REDUCED || running) return;
      running = true;
      raf = requestAnimationFrame(frame);
    }
    function stop() {
      running = false;
      cancelAnimationFrame(raf);
    }

    resize();
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop();
      else start();
    });
    start();
  }

  /* ----------------------------------------------------------
     FX — heart bursts, toast, "Chindy detected"
     ---------------------------------------------------------- */
  function heartsBurst(x, y, count) {
    if (REDUCED) return;
    var layer = $('#fx');
    if (!layer) return;
    count = count || 10;
    var group = document.createElement('div');
    group.className = 'burst';
    for (var i = 0; i < count; i++) {
      var s = document.createElement('span');
      s.className = 'b-heart';
      s.textContent = '♥';
      s.style.left = x + 'px';
      s.style.top = y + 'px';
      s.style.fontSize = (11 + Math.random() * 9) + 'px';
      var angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      var dist = 70 + Math.random() * 90;
      s.style.setProperty('--tx', Math.round(Math.cos(angle) * dist) + 'px');
      s.style.setProperty('--ty', Math.round(Math.sin(angle) * dist - 70) + 'px');
      s.style.setProperty('--rot', Math.round((Math.random() - 0.5) * 540) + 'deg');
      s.style.animationDelay = (Math.random() * 0.14) + 's';
      group.appendChild(s);
    }
    layer.appendChild(group);
    setTimeout(function () { group.remove(); }, 1900);
  }

  var toastTimer = null;
  function toast(msg) {
    var t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 3600);
  }

  var detectedCooldown = false;
  function chindyDetected() {
    if (detectedCooldown) return;
    detectedCooldown = true;
    Sound.blip(880, 0.16, 0.045, 'triangle');

    var layer = $('#fx');
    if (layer && !$('.detected')) {
      var d = document.createElement('div');
      d.className = 'detected';
      d.innerHTML = '<span>Chindy detected</span><b>✓</b>';
      layer.appendChild(d);
      setTimeout(function () { d.remove(); }, 2600);
    }
    heartsBurst(window.innerWidth / 2, window.innerHeight * 0.24, 9);

    setTimeout(function () { detectedCooldown = false; }, 2600);
  }

  /* ----------------------------------------------------------
     SCROLL PROGRESS + REVEAL
     ---------------------------------------------------------- */
  function initScrollProgress() {
    var bar = $('#scrollBar');
    if (!bar) return;
    var ticking = false;
    function update() {
      var doc = document.documentElement;
      var max = doc.scrollHeight - window.innerHeight;
      var p = max > 0 ? (window.scrollY / max) * 100 : 0;
      bar.style.width = Math.max(0, Math.min(100, p)) + '%';
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    }, { passive: true });
    update();
  }

  function initReveal() {
    var sections = document.querySelectorAll('.section, .finale');
    Array.prototype.forEach.call(sections, function (sec) {
      var items = sec.querySelectorAll('[data-reveal]');
      Array.prototype.forEach.call(items, function (el, i) {
        el.style.transitionDelay = (i * 0.1) + 's';
      });
    });

    if (!('IntersectionObserver' in window)) {
      Array.prototype.forEach.call(document.querySelectorAll('[data-reveal]'), function (el) {
        el.classList.add('in');
      });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.16, rootMargin: '0px 0px -40px 0px' });

    Array.prototype.forEach.call(document.querySelectorAll('[data-reveal]'), function (el) {
      io.observe(el);
    });
  }

  /* ----------------------------------------------------------
     BOOT SEQUENCE
     ---------------------------------------------------------- */
  var BOOT_LINES = [
    [{ t: 'INITIALIZING', c: 'hi' }, { t: '...', c: 'dim' }],
    [{ t: 'Loading special project', c: 'dim' }, { t: '...', c: 'dim' }],
    [{ t: 'Project: ', c: 'k' }, { t: 'CHINDY.exe', c: 'v' }],
    [{ t: 'Creator: ', c: 'k' }, { t: 'ANURAG', c: 'v' }],
    [{ t: 'Origin: ', c: 'k' }, { t: 'INDIA ', c: 'v' }, { t: '\u{1F1EE}\u{1F1F3}', c: 'flag' }],
    [{ t: 'Destination: ', c: 'k' }, { t: 'PHILIPPINES ', c: 'v' }, { t: '\u{1F1F5}\u{1F1ED}', c: 'flag' }],
    [{ t: 'Purpose: ', c: 'k' }, { t: 'CLASSIFIED', c: 'secret' }],
    [{ t: 'Status: ', c: 'k' }, { t: 'READY', c: 'ok' }]
  ];

  var booted = false;

  async function runBoot() {
    var box = $('#bootLines');
    var bar = $('#bootBar');
    if (!box) return;

    for (var i = 0; i < BOOT_LINES.length; i++) {
      await typeLine(box, BOOT_LINES[i], REDUCED ? 0 : 17);
      bar.style.width = Math.round(((i + 1) / BOOT_LINES.length) * 100) + '%';
      if (!REDUCED) await sleep(130);
    }
    box.classList.add('done');

    var btn = $('#runBtn');
    btn.hidden = false;
    booted = true;
    try { btn.focus({ preventScroll: true }); } catch (e) {}
  }

  async function enterExperience() {
    var boot = $('#boot');
    var app = $('#app');
    var btn = $('#runBtn');
    if (btn.disabled) return;
    btn.disabled = true;

    Sound.blip(660, 0.14, 0.05, 'triangle');

    boot.classList.add('leaving');
    document.documentElement.classList.remove('no-scroll');
    document.body.classList.add('ready');
    app.classList.add('ready');
    window.scrollTo(0, 0);

    await sleep(REDUCED ? 80 : 720);
    boot.hidden = true;

    initReveal();
    initConfession();
    initFinale();
  }

  /* ----------------------------------------------------------
     SECTION 1 — SYSTEM CHECK
     ---------------------------------------------------------- */
  var QUESTIONS = [
    {
      q: 'Coffee or Chai?',
      options: [
        { label: 'Coffee', note: 'Caffeine parsed. Productivity levels: suspiciously high.' },
        { label: 'Chai', note: 'Chosen by the creator\u2019s homeland. Bias detected\u2026 respectfully ignored.' }
      ]
    },
    {
      q: 'Sunset or Rain?',
      options: [
        { label: 'Sunset', note: 'Golden hour enjoyer. Very main-character energy.' },
        { label: 'Rain', note: 'Rain + warm room = elite software engineering conditions.' }
      ]
    },
    {
      q: 'Movies or Music?',
      options: [
        { label: 'Movies', note: 'popcorn.dll loaded. Movie night: two people, one screen.' },
        { label: 'Music', note: 'Soundtrack attached to this very website. Check the \u266A button.' }
      ]
    }
  ];

  var qi = 0;
  var answering = false;

  function renderQuestion() {
    var q = QUESTIONS[qi];
    $('#qCount').textContent = 'question ' + (qi + 1) + ' / ' + QUESTIONS.length;
    $('#qTitle').textContent = q.q;

    var wrap = $('#qOptions');
    wrap.innerHTML = '';
    wrap.classList.remove('answered');

    q.options.forEach(function (opt, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'option';

      var key = document.createElement('span');
      key.className = 'opt-key';
      key.textContent = 'AB'[i];

      var label = document.createElement('span');
      label.className = 'opt-label';
      label.textContent = opt.label;

      var arrow = document.createElement('span');
      arrow.className = 'opt-arrow';
      arrow.setAttribute('aria-hidden', 'true');
      arrow.textContent = '\u2192';

      b.appendChild(key);
      b.appendChild(label);
      b.appendChild(arrow);
      b.addEventListener('click', function () { answer(i, b); });
      wrap.appendChild(b);
    });
  }

  async function answer(i, btn) {
    if (answering) return;
    answering = true;

    Sound.blip(600, 0.1, 0.045, 'triangle');

    var opt = QUESTIONS[qi].options[i];
    var wrap = $('#qOptions');
    wrap.classList.add('answered');
    btn.classList.add('chosen');
    Array.prototype.forEach.call(wrap.children, function (el) { el.disabled = true; });

    var steps = $('#qSteps').children;
    if (steps[qi]) steps[qi].classList.add('on');

    var log = $('#qLog');
    Array.prototype.forEach.call(log.children, function (el) { el.classList.add('old'); });

    var msgs = ['Preference detected.', opt.note, 'Interesting...', 'Updating compatibility matrix...'];
    for (var m = 0; m < msgs.length; m++) {
      await typeLine(log, [{ t: '> ', c: 'prompt' }, { t: msgs[m], c: 'log' }], REDUCED ? 0 : 11);
      if (!REDUCED) await sleep(210);
    }
    $('#qStatus').textContent = msgs.join(' ');

    qi++;
    if (qi < QUESTIONS.length) {
      if (!REDUCED) await sleep(480);
      renderQuestion();
    } else {
      showResult();
    }
    answering = false;
  }

  function showResult() {
    var r = $('#qResult');
    r.hidden = false;
    requestAnimationFrame(function () { r.classList.add('in'); });
    $('#qStatus').textContent = 'Compatibility analysis complete. Result: Interesting person detected.';
  }

  function initCheck() {
    renderQuestion();
    var cont = $('#continueBtn');
    if (cont) {
      cont.addEventListener('click', function () {
        Sound.blip(700, 0.1, 0.04, 'triangle');
        var target = $('#distance');
        if (target) target.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' });
      });
    }
  }

  /* ----------------------------------------------------------
     SECTION 3 — THE ENGINEER'S CONFESSION
     ---------------------------------------------------------- */
  var CODE_LINES = [
    [{ t: 'const ', c: 'key' }, { t: 'person', c: 'plain' }, { t: ' = ', c: 'plain' }, { t: '"Chindy"', c: 'str' }, { t: ';', c: 'plain' }],
    [{ t: 'const ', c: 'key' }, { t: 'creator', c: 'plain' }, { t: ' = ', c: 'plain' }, { t: '"Anurag"', c: 'str' }, { t: ';', c: 'plain' }],
    [{ t: ' ', c: 'plain' }],
    [{ t: 'if ', c: 'key' }, { t: '(', c: 'plain' }, { t: 'person', c: 'plain' }, { t: ' === ', c: 'plain' }, { t: '"Chindy"', c: 'str' }, { t: ') {', c: 'plain' }],
    [{ t: '    project', c: 'plain' }, { t: '.status', c: 'fn' }, { t: ' = ', c: 'plain' }, { t: '"special"', c: 'str' }, { t: ';', c: 'plain' }],
    [{ t: '}', c: 'plain' }],
    [{ t: ' ', c: 'plain' }],
    [{ t: '// If Chindy is reading this...', c: 'com' }],
    [{ t: '// yes, I actually made this entire thing for you.', c: 'com' }]
  ];

  var confessionStarted = false;

  async function runConfession() {
    var codeBox = $('#codeLines');
    var out = $('#codeOut');
    if (!codeBox || !out) return;

    for (var i = 0; i < CODE_LINES.length; i++) {
      await typeLine(codeBox, CODE_LINES[i], REDUCED ? 0 : 15);
      if (!REDUCED) await sleep(95);
    }
    codeBox.classList.add('done');

    if (!REDUCED) await sleep(380);
    await typeLine(out, [
      { t: '> ', c: 'prompt' },
      { t: 'Compilation successful.', c: 'ok' }
    ], REDUCED ? 0 : 14);

    var thinking = $('#thinking');
    thinking.hidden = false;
    await sleep(REDUCED ? 250 : 1900);
    thinking.hidden = true;

    await typeLine(out, [
      { t: '> ', c: 'prompt' },
      { t: 'Error 404:', c: 'err' }
    ], REDUCED ? 0 : 16);

    if (!REDUCED) await sleep(320);
    await typeLine(out, [
      { t: '> ', c: 'prompt' },
      { t: "Reason why you're so interesting not found.", c: 'hl' }
    ], REDUCED ? 0 : 14);

    out.classList.add('done');
  }

  function initConfession() {
    var section = $('#confession');
    if (!section) return;

    if (!('IntersectionObserver' in window)) {
      if (!confessionStarted) { confessionStarted = true; runConfession(); }
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting && !confessionStarted) {
          confessionStarted = true;
          io.disconnect();
          runConfession();
        }
      });
    }, { threshold: 0.3 });
    io.observe(section);
  }

  /* ----------------------------------------------------------
     SECTION 4 — SECRET FILE
     ---------------------------------------------------------- */
  var fileOpened = false;

  function initSecret() {
    var btn = $('#openBtn');
    if (!btn) return;

    btn.addEventListener('click', async function () {
      if (fileOpened) return;
      fileOpened = true;

      Sound.blip(720, 0.14, 0.05, 'triangle');

      var folder = $('#folder');
      var progress = $('#openProgress');
      var bar = $('#openBar');
      var letter = $('#letter');
      var status = $('#fileStatus');

      btn.disabled = true;
      btn.textContent = '[ DECRYPTING\u2026 ]';
      folder.classList.add('unlocked');
      progress.hidden = false;
      requestAnimationFrame(function () { bar.style.width = '100%'; });

      await sleep(REDUCED ? 120 : 1550);

      letter.hidden = false;
      letter.setAttribute('aria-hidden', 'false');
      requestAnimationFrame(function () { letter.classList.add('open'); });

      btn.classList.add('gone');
      setTimeout(function () { btn.hidden = true; }, REDUCED ? 20 : 520);
      status.hidden = false;

      if (!REDUCED) await sleep(500);
      letter.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'center' });

      if (!REDUCED) await sleep(2700);
      var r = letter.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) {
        heartsBurst(r.left + r.width / 2, r.top + r.height - 46, 10);
      }
    });
  }

  /* ----------------------------------------------------------
     SECTION 5 — THE FINAL SURPRISE
     ---------------------------------------------------------- */
  var finaleStarted = false;

  function runFinale() {
    var fin = $('#finale');
    if (!fin) return;
    fin.classList.add('active');
    document.body.classList.add('finale-on');

    var seq = [
      [700, '.fin-1'],
      [2400, '.fin-2'],
      [4400, '.fin-3'],
      [5500, '.fin-heart'],
      [6700, '.fin-4'],
      [7700, '.fin-5'],
      [8500, '.fin-sign'],
      [9200, '.fin-actions']
    ];

    if (REDUCED) {
      seq.forEach(function (step) {
        var el = fin.querySelector(step[1]);
        if (el) el.classList.add('show');
      });
      return;
    }

    seq.forEach(function (step) {
      setTimeout(function () {
        var el = fin.querySelector(step[1]);
        if (!el) return;
        el.classList.add('show');
        if (step[1] === '.fin-heart') {
          var r = el.getBoundingClientRect();
          if (r.top < window.innerHeight && r.bottom > 0) {
            heartsBurst(r.left + r.width / 2, r.top + r.height / 2, 14);
          }
        }
      }, step[0]);
    });
  }

  function initFinale() {
    var fin = $('#finale');
    if (!fin) return;

    if (!('IntersectionObserver' in window)) {
      if (!finaleStarted) { finaleStarted = true; runFinale(); }
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting && !finaleStarted) {
            finaleStarted = true;
            io.disconnect();
            runFinale();
          }
        });
      }, { threshold: 0, rootMargin: '-25% 0px -25% 0px' });
      io.observe(fin);
    }

    var reboot = $('#rebootBtn');
    if (reboot) {
      reboot.addEventListener('click', function () {
        Sound.blip(540, 0.12, 0.045, 'triangle');
        setTimeout(function () { window.location.reload(); }, 160);
      });
    }
  }

  /* ----------------------------------------------------------
     EASTER EGGS
     ---------------------------------------------------------- */
  function initEasterEggs() {
    // 1 — clicking the terminal icon 5 times
    var termBtn = $('#termBtn');
    var termClicks = 0;
    if (termBtn) {
      termBtn.addEventListener('click', function () {
        termClicks++;
        Sound.blip(500 + termClicks * 40, 0.07, 0.035, 'square');
        if (termClicks >= 5) {
          termClicks = 0;
          toast('Okay fine\u2026 I really like talking to you.');
          var r = termBtn.getBoundingClientRect();
          heartsBurst(r.left + r.width / 2, r.top + r.height / 2, 7);
        }
      });
    }

    // 2 — pressing the C key
    document.addEventListener('keydown', function (e) {
      if (e.key && e.key.toLowerCase() === 'c' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        var tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
        if (tag === 'input' || tag === 'textarea') return;
        chindyDetected();
      }
    });
  }

  /* ----------------------------------------------------------
     MUSIC TOGGLE
     ---------------------------------------------------------- */
  function initMusic() {
    var btn = $('#musicBtn');
    var label = $('#musicLabel');
    if (!btn) return;

    btn.addEventListener('click', function () {
      if (Music.playing) {
        Music.stop();
        btn.classList.remove('playing');
        btn.setAttribute('aria-pressed', 'false');
        label.textContent = 'Play soundtrack';
      } else {
        Music.start();
        if (Music.playing) {
          btn.classList.add('playing');
          btn.setAttribute('aria-pressed', 'true');
          label.textContent = 'Stop soundtrack';
        }
      }
    });
  }

  /* ----------------------------------------------------------
     INIT
     ---------------------------------------------------------- */
  if ('scrollRestoration' in history) {
    try { history.scrollRestoration = 'manual'; } catch (e) {}
  }
  window.scrollTo(0, 0);

  initStarfield();
  initScrollProgress();
  initCheck();
  initSecret();
  initEasterEggs();
  initMusic();
  runBoot();

  var runBtn = $('#runBtn');
  if (runBtn) runBtn.addEventListener('click', enterExperience);

})();
