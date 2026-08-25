(function () {
  'use strict';

  var MODE_READY = 'ready';
  var MODE_COUNTDOWN = 'countdown';
  var MODE_GRACE = 'grace';
  var MODE_OVERTIME = 'overtime';
  var STORAGE_KEY = 'hotpotato-settings-v1';
  var INTRO_OPTIONS = [15, 20, 30, 45, 60];
  var GRACE_OPTIONS = [0, 3, 5, 10];
  var DEFAULT_SETTINGS = {
    introSeconds: 20,
    graceSeconds: 5,
    soundEnabled: true
  };
  var THEME_COLORS = {
    ready: '#173824',
    countdown: '#111820',
    warning: '#b66012',
    grace: '#bb1f2d',
    overtime: '#d01625'
  };

  var app = document.querySelector('[data-app]');
  var stage = document.querySelector('[data-stage]');
  var primary = document.querySelector('[data-primary]');
  var secondary = document.querySelector('[data-secondary]');
  var eyebrow = document.querySelector('[data-eyebrow]');
  var personEl = document.querySelector('[data-person]');
  var settingsOpen = document.querySelector('[data-settings-open]');
  var settingsClose = document.querySelector('[data-settings-close]');
  var settingsBackdrop = document.querySelector('[data-settings]');
  var settingsForm = document.querySelector('[data-settings-form]');
  var settingsStatus = document.querySelector('[data-settings-status]');
  var soundLabel = document.querySelector('[data-sound-label]');
  var resetCounter = document.querySelector('[data-reset-counter]');
  var fullscreenButton = document.querySelector('[data-fullscreen]');
  var themeColor = document.querySelector('#theme-color');

  var settings = loadSettings();
  var mode = MODE_READY;
  var sessionStarted = false;
  var person = 1;
  var frameId = 0;
  var countdownStartedAt = 0;
  var countdownDurationMs = settings.introSeconds * 1000;
  var graceStartedAt = 0;
  var graceDurationMs = settings.graceSeconds * 1000;
  var lastRenderedSecond = null;
  var wakeLock = null;
  var audioContext = null;
  var alertInterval = 0;
  var activeOscillators = [];

  initialize();

  function initialize() {
    syncSettingsForm();
    bindEvents();
    renderReady();
    registerServiceWorker();
  }

  function bindEvents() {
    stage.addEventListener('click', handleStageTap);
    stage.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleStageTap(event);
      }
    });

    settingsOpen.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      openSettings();
    });

    settingsClose.addEventListener('click', function (event) {
      event.preventDefault();
      closeSettings();
    });

    settingsBackdrop.addEventListener('click', function (event) {
      if (event.target === settingsBackdrop) closeSettings();
    });

    settingsForm.addEventListener('submit', function (event) {
      event.preventDefault();
    });

    settingsForm.addEventListener('change', handleSettingsChange);

    resetCounter.addEventListener('click', function () {
      person = 1;
      renderPerson();
      setStatus('Person reset');
    });

    fullscreenButton.addEventListener('click', requestFullScreen);

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !settingsBackdrop.hidden) closeSettings();
    });

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        if (sessionStarted) requestWakeLock();
        if (mode === MODE_COUNTDOWN || mode === MODE_GRACE) scheduleTick();
        if (mode === MODE_OVERTIME) startAlert();
      }
    });

    window.addEventListener('beforeunload', function () {
      stopAlert();
    });
  }

  function handleStageTap(event) {
    event.preventDefault();

    if (mode === MODE_READY) {
      sessionStarted = true;
      unlockAudio();
      requestWakeLock();
      startCountdown();
      return;
    }

    if (mode === MODE_COUNTDOWN || mode === MODE_GRACE || mode === MODE_OVERTIME) {
      person += 1;
      unlockAudio();
      startCountdown();
    }
  }

  function startCountdown() {
    closeSettings();
    stopAlert();
    cancelTick();

    mode = MODE_COUNTDOWN;
    countdownStartedAt = performance.now();
    countdownDurationMs = settings.introSeconds * 1000;
    lastRenderedSecond = null;

    renderCountdown(countdownDurationMs);
    scheduleTick();
  }

  function enterGrace(now) {
    cancelTick();
    stopAlert();

    mode = MODE_GRACE;
    graceStartedAt = now;
    graceDurationMs = settings.graceSeconds * 1000;
    lastRenderedSecond = null;
    vibrate([180]);
    renderGrace();

    if (graceDurationMs <= 0) {
      enterOvertime();
      return;
    }

    scheduleTick();
  }

  function enterOvertime() {
    cancelTick();
    mode = MODE_OVERTIME;
    vibrate([130, 80, 130]);
    renderOvertime();
    startAlert();
  }

  function scheduleTick() {
    cancelTick();
    frameId = window.requestAnimationFrame(tick);
  }

  function cancelTick() {
    if (frameId) {
      window.cancelAnimationFrame(frameId);
      frameId = 0;
    }
  }

  function tick(now) {
    frameId = 0;

    if (mode === MODE_COUNTDOWN) {
      var remainingMs = countdownDurationMs - (now - countdownStartedAt);
      if (remainingMs <= 0) {
        enterGrace(now);
        return;
      }

      renderCountdown(remainingMs);
      scheduleTick();
      return;
    }

    if (mode === MODE_GRACE) {
      if (now - graceStartedAt >= graceDurationMs) {
        enterOvertime();
        return;
      }

      scheduleTick();
    }
  }

  function renderReady() {
    mode = MODE_READY;
    stopAlert();
    cancelTick();
    app.dataset.mode = MODE_READY;
    app.classList.remove('is-warning');
    updateTheme(MODE_READY);
    primary.className = 'timer-primary';
    eyebrow.textContent = 'Hot Potato';
    primary.textContent = 'TAP TO START';
    secondary.textContent = settings.introSeconds + ' second introduction';
    stage.setAttribute('aria-label', 'Tap to start timer');
    renderPerson();
  }

  function renderCountdown(remainingMs) {
    var seconds = Math.max(1, Math.ceil(remainingMs / 1000));

    if (lastRenderedSecond === seconds && app.dataset.mode === MODE_COUNTDOWN) return;

    lastRenderedSecond = seconds;
    app.dataset.mode = MODE_COUNTDOWN;
    app.classList.toggle('is-warning', seconds <= 5);
    updateTheme(seconds <= 5 ? 'warning' : MODE_COUNTDOWN);
    primary.className = 'timer-primary is-number';
    eyebrow.textContent = 'Your intro';
    primary.textContent = String(seconds);
    secondary.textContent = seconds <= 5 ? 'Almost there' : 'Tap when done';
    stage.setAttribute('aria-label', seconds + ' seconds remaining. Tap to start the next person.');
    renderPerson();
  }

  function renderGrace() {
    app.dataset.mode = MODE_GRACE;
    app.classList.remove('is-warning');
    updateTheme(MODE_GRACE);
    primary.className = 'timer-primary';
    eyebrow.textContent = 'Time';
    primary.textContent = 'WRAP IT UP 👀';
    secondary.textContent = 'Pass the phone';
    stage.setAttribute('aria-label', 'Time expired. Pass the phone. Tap to start the next person.');
    renderPerson();
  }

  function renderOvertime() {
    app.dataset.mode = MODE_OVERTIME;
    app.classList.remove('is-warning');
    updateTheme(MODE_OVERTIME);
    primary.className = 'timer-primary';
    eyebrow.textContent = 'Overtime';
    primary.textContent = 'PASS THE PHONE! 🔥';
    secondary.textContent = 'Tap for next person';
    stage.setAttribute('aria-label', 'Overtime. Pass the phone. Tap to start the next person.');
    renderPerson();
  }

  function renderPerson() {
    personEl.textContent = 'Person ' + person;
  }

  function updateTheme(key) {
    if (themeColor) themeColor.setAttribute('content', THEME_COLORS[key] || THEME_COLORS.ready);
  }

  function loadSettings() {
    try {
      var stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
      if (!stored || typeof stored !== 'object') return Object.assign({}, DEFAULT_SETTINGS);

      return {
        introSeconds: INTRO_OPTIONS.indexOf(Number(stored.introSeconds)) >= 0 ? Number(stored.introSeconds) : DEFAULT_SETTINGS.introSeconds,
        graceSeconds: GRACE_OPTIONS.indexOf(Number(stored.graceSeconds)) >= 0 ? Number(stored.graceSeconds) : DEFAULT_SETTINGS.graceSeconds,
        soundEnabled: typeof stored.soundEnabled === 'boolean' ? stored.soundEnabled : DEFAULT_SETTINGS.soundEnabled
      };
    } catch (error) {
      return Object.assign({}, DEFAULT_SETTINGS);
    }
  }

  function persistSettings() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      setStatus('Settings could not be saved');
    }
  }

  function syncSettingsForm() {
    settingsForm.elements.introSeconds.value = String(settings.introSeconds);
    settingsForm.elements.graceSeconds.value = String(settings.graceSeconds);
    settingsForm.elements.soundEnabled.checked = settings.soundEnabled;
    updateSoundLabel();
  }

  function handleSettingsChange(event) {
    var target = event.target;

    if (target.name === 'introSeconds') {
      settings.introSeconds = Number(target.value);
      setStatus('Intro time saved');
    }

    if (target.name === 'graceSeconds') {
      settings.graceSeconds = Number(target.value);
      setStatus('Grace period saved');
    }

    if (target.name === 'soundEnabled') {
      settings.soundEnabled = target.checked;
      updateSoundLabel();
      setStatus(settings.soundEnabled ? 'Sound on' : 'Sound off');

      if (settings.soundEnabled) {
        unlockAudio();
        if (mode === MODE_OVERTIME) startAlert();
      } else {
        stopAlert();
      }
    }

    persistSettings();

    if (mode === MODE_READY) {
      secondary.textContent = settings.introSeconds + ' second introduction';
    }
  }

  function updateSoundLabel() {
    soundLabel.textContent = settings.soundEnabled ? 'On' : 'Off';
  }

  function openSettings() {
    settingsBackdrop.hidden = false;
    setStatus('');
    window.setTimeout(function () {
      settingsClose.focus({ preventScroll: true });
    }, 0);
  }

  function closeSettings() {
    if (settingsBackdrop.hidden) return;

    settingsBackdrop.hidden = true;
    settingsOpen.focus({ preventScroll: true });
  }

  function setStatus(message) {
    settingsStatus.textContent = message;
  }

  async function requestWakeLock() {
    if (!('wakeLock' in navigator) || !sessionStarted || document.visibilityState !== 'visible') return;

    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', function () {
        wakeLock = null;
      });
    } catch (error) {
      wakeLock = null;
    }
  }

  async function unlockAudio() {
    var AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;

    try {
      if (!audioContext) audioContext = new AudioCtor();
      if (audioContext.state === 'suspended') await audioContext.resume();

      var buffer = audioContext.createBuffer(1, 1, audioContext.sampleRate);
      var source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);
      source.start(0);
    } catch (error) {
      audioContext = null;
    }
  }

  function startAlert() {
    if (!settings.soundEnabled || alertInterval) return;

    unlockAudio().then(function () {
      playDing();
      alertInterval = window.setInterval(playDing, 1000);
    });
  }

  function stopAlert() {
    if (alertInterval) {
      window.clearInterval(alertInterval);
      alertInterval = 0;
    }

    activeOscillators.forEach(function (oscillator) {
      try {
        oscillator.stop();
      } catch (error) {
        // The oscillator may already have ended.
      }
    });
    activeOscillators = [];
  }

  function playDing() {
    if (!settings.soundEnabled) return;

    var AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;
    if (!audioContext) audioContext = new AudioCtor();
    if (audioContext.state === 'suspended') audioContext.resume().catch(function () {});

    try {
      var now = audioContext.currentTime;
      var oscillator = audioContext.createOscillator();
      var gain = audioContext.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, now);
      oscillator.frequency.exponentialRampToValueAtTime(1320, now + 0.08);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.13, now + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);

      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      activeOscillators.push(oscillator);

      oscillator.addEventListener('ended', function () {
        activeOscillators = activeOscillators.filter(function (item) {
          return item !== oscillator;
        });
        gain.disconnect();
      });

      oscillator.start(now);
      oscillator.stop(now + 0.26);
    } catch (error) {
      stopAlert();
    }
  }

  function vibrate(pattern) {
    if (!('vibrate' in navigator)) return;

    try {
      navigator.vibrate(pattern);
    } catch (error) {
      // Vibration is optional and browser-dependent.
    }
  }

  async function requestFullScreen() {
    var root = document.documentElement;
    var request = root.requestFullscreen || root.webkitRequestFullscreen;

    if (!request) {
      setStatus('Full screen unavailable here');
      return;
    }

    try {
      await request.call(root);
      setStatus('Full screen on');
    } catch (error) {
      setStatus('Full screen blocked by browser');
    }
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').catch(function () {});
    });
  }
})();
