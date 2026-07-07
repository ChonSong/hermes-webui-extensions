// Bootstrap: starts all modules, wires public API
(function() {
  'use strict';
  if (window.__hwxEmotionAvatarLoaded) return;
  window.__hwxEmotionAvatarLoaded = true;

  function install(attempt) {
    attempt = attempt || 0;

    // Start renderer first (needs DOM)
    if (__ea.renderer && __ea.renderer.canvas2d) {
      if (!__ea.renderer.canvas2d.start()) {
        if (attempt < 60) setTimeout(function(){ install(attempt+1); }, 200);
        return;
      }
    }

    // Start inputs
    if (__ea.inputAgent) __ea.inputAgent.start();
    if (__ea.inputLLM) __ea.inputLLM.start();
    if (__ea.inputFAC) __ea.inputFAC.start();

    // Seed idle expression
    __ea.pipe.pulse('idle', 'idle');

    // Public API
    window.HermesEmotionAvatar = Object.assign({
      version: '0.7.0',
      destroy: function() {
        if (__ea.renderer && __ea.renderer.canvas2d) __ea.renderer.canvas2d.stop();
        if (__ea.inputAgent) __ea.inputAgent.stop();
        if (__ea.inputLLM) __ea.inputLLM.stop();
        if (__ea.inputFAC) __ea.inputFAC.stop();
        window.__hwxEmotionAvatarLoaded = false;
        delete window.HermesEmotionAvatar;
        delete window.__avatarExpression;
      },
      // Direct expression (shortcuts to pipe)
      setExpression: function(e) { __ea.pipe.set(e, 'external'); },
      getExpression: function() { return __ea.pipe.get(); },
    }, __ea.renderer.canvas2d);

    window.__avatarExpression = 'idle';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ install(); }, {once:true});
  } else {
    setTimeout(install, 1000);
  }
})();
