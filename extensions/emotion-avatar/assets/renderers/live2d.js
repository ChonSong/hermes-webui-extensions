// Renderer: Live2D — loads user-supplied .model3.json models
// Requires: pixi-live2d-display (MIT) + Cubism WebGL runtime (free for non-commercial)
// Runtime is auto-loaded from CDN on first use. Models are user-provided via URL or upload.
(function() {
  'use strict';
  if (__ea._rendererLive2DLoaded) return; __ea._rendererLive2DLoaded = true;
  __ea.renderer = __ea.renderer || {};

  var _canvas = null;
  var _app = null;
  var _model = null;
  var _rafId = null;
  var _initialized = false;
  var _currentExpr = 'idle';
  var _modelUrl = null;

  // CDN sources for Live2D runtime + pixi-live2d-display
  var RUNTIME_CDN = 'https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js';
  var PIXI_L2D_CDN = 'https://cdn.jsdelivr.net/npm/pixi-live2d-display@0.6.0/dist/cubism4.min.js';
  var PIXI_CDN = 'https://cdn.jsdelivr.net/npm/pixi.js@7.4.2/dist/pixi.min.mjs';
  var _runtimeLoaded = false;

  function loadRuntime() {
    return new Promise(function(resolve, reject) {
      if (_runtimeLoaded) { resolve(); return; }

      // Check if already loaded
      if (typeof Live2DModel !== 'undefined') { _runtimeLoaded = true; resolve(); return; }

      var scripts = [RUNTIME_CDN, PIXI_L2D_CDN];
      var loaded = 0;
      scripts.forEach(function(src) {
        var s = document.createElement('script');
        s.src = src;
        s.onload = function() {
          loaded++;
          if (loaded >= scripts.length) {
            _runtimeLoaded = true;
            resolve();
          }
        };
        s.onerror = function() { reject(new Error('Failed to load Live2D runtime: ' + src)); };
        document.head.appendChild(s);
      });
    });
  }

  function createApp(width, height) {
    if (_app) return;
    // Use minimal PIXI app
    _app = new PIXI.Application({
      width: width || 192,
      height: height || 192,
      transparent: true,
      antialias: true,
      resizeTo: null,
    });
    _canvas.appendChild(_app.view);
  }

  function loadModel(url) {
    if (!_app || !window.Live2DModel) return Promise.reject(new Error('Not initialized'));
    _modelUrl = url;
    return Live2DModel.from(url).then(function(model) {
      if (_model) { _app.stage.removeChild(_model); _model.destroy(); }
      _model = model;
      // Scale to fit canvas
      var scale = Math.min(192 / model.width, 192 / model.height) * 0.85;
      model.scale.set(scale);
      model.anchor.set(0.5, 0.5);
      model.x = 96;
      model.y = 96;
      _app.stage.addChild(model);
      // Auto-blink (Live2D often has built-in blink)
      return model;
    });
  }

  function setExpression(expr) {
    if (!_model) return;
    _currentExpr = expr;
    // Try to trigger expression motion if model has it
    try {
      // pixi-live2d-display v0.6 API
      if (_model.internalModel && _model.internalModel.motionManager) {
        // Stop current motions
        _model.internalModel.motionManager.stopAllMotions();
        // Map our expression names to Live2D expression names
        var exprMap = {
          happy: 'expressions/f01.exp3.json',
          surprised: 'expressions/f04.exp3.json',
          sad: 'expressions/f02.exp3.json',
          angry: 'expressions/f06.exp3.json',
          thinking: 'expressions/f07.exp3.json',
          confused: 'expressions/f08.exp3.json',
          excited: 'expressions/f04.exp3.json',
          worried: 'expressions/f02.exp3.json',
          speaking: null,
          idle: 'expressions/f01.exp3.json',
        };
        var path = exprMap[expr];
        if (path) {
          var motionMgr = _model.internalModel.motionManager;
          if (motionMgr.startMotionPriority) {
            motionMgr.startMotionPriority(path, 3, true);
          }
        }
      }
    } catch(e) {
      // Expression is best-effort
    }
  }

  function onExpressionChange(e) {
    if (e.detail && e.detail.expression) {
      setExpression(e.detail.expression);
    }
  }

  var Live2DRenderer = {
    name: 'Live2D',
    start: function(container) {
      _canvas = container;
      window.addEventListener('hermes:avatar:expression', onExpressionChange);
      return { ready: false, message: 'Live2D runtime loading — provide a model URL in settings' };
    },
    loadModel: function(url) {
      var self = this;
      return loadRuntime().then(function() {
        // Need pixi.js — inject it if not present
        if (!window.PIXI) {
          return new Promise(function(resolve, reject) {
            var s = document.createElement('script');
            s.src = PIXI_CDN;
            s.type = 'module';
            s.onload = function() { resolve(); };
            s.onerror = function() { reject(new Error('Failed to load PIXI.js')); };
            document.head.appendChild(s);
          });
        }
      }).then(function() {
        if (!_app) {
          // Tiny PIXI app inside the container
          _app = new PIXI.Application({
            width: 192,
            height: 192,
            transparent: true,
            antialias: true,
          });
          _canvas.appendChild(_app.view);
        }
        return loadModel(url);
      });
    },
    setExpression: setExpression,
    stop: function() {
      if (_rafId) cancelAnimationFrame(_rafId);
      window.removeEventListener('hermes:avatar:expression', onExpressionChange);
      if (_model) { _app.stage.removeChild(_model); _model.destroy(); _model = null; }
      if (_app) { _app.destroy(true); _app = null; }
      if (_canvas) { _canvas.innerHTML = ''; }
    },
  };

  __ea.renderer.live2d = Live2DRenderer;
})();
