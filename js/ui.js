/* ============================================================
   ui.js — 화면 어디서나 쓰는 공통 도구
   ============================================================ */
(function (global) {
  'use strict';

  var store = global.KB.store;

  /** 사용자가 입력한 이름/라벨을 그대로 innerHTML에 넣으면 안 된다 */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  var reduceMotion = global.matchMedia
    ? global.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

  // ---------- 토스트 ----------
  var toastTimer = null;
  function toast(msg) {
    var box = $('#toast');
    box.textContent = msg;
    box.hidden = false;
    box.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      box.classList.remove('is-on');
      setTimeout(function () { box.hidden = true; }, 250);
    }, 2000);
  }

  // ---------- 모달 기본 골격 ----------
  function openModal(html) {
    var m = $('#modal');
    m.innerHTML = '<div class="modal__sheet" role="dialog" aria-modal="true">' + html + '</div>';
    m.hidden = false;
    return m;
  }
  function closeModal() {
    var m = $('#modal');
    m.hidden = true;
    m.innerHTML = '';
  }

  /** 예/아니오 확인. Promise<boolean> */
  function confirmBox(title, desc, okLabel) {
    return new Promise(function (resolve) {
      var m = openModal(
        '<h2 class="modal__title">' + esc(title) + '</h2>' +
        (desc ? '<p class="modal__desc">' + esc(desc) + '</p>' : '') +
        '<div class="modal__row">' +
          '<button class="btn btn--ghost" data-no>취소</button>' +
          '<button class="btn btn--danger" data-yes>' + esc(okLabel || '확인') + '</button>' +
        '</div>'
      );
      $('[data-no]', m).onclick = function () { closeModal(); resolve(false); };
      $('[data-yes]', m).onclick = function () { closeModal(); resolve(true); };
    });
  }

  /** 부모 확인용 PIN 키패드. Promise<boolean> */
  function askPin(title) {
    return new Promise(function (resolve) {
      var buf = '';
      var keys = ['1','2','3','4','5','6','7','8','9','지움','0','확인'];
      var m = openModal(
        '<h2 class="modal__title">' + esc(title || '부모 확인') + '</h2>' +
        '<p class="modal__desc">PIN 4자리를 입력하세요.</p>' +
        '<div class="pin" data-dots></div>' +
        '<div class="keypad">' +
          keys.map(function (k) {
            var cls = (k === '확인') ? ' key--ok' : (k === '지움' ? ' key--del' : '');
            return '<button class="key' + cls + '" data-k="' + esc(k) + '">' + esc(k) + '</button>';
          }).join('') +
        '</div>' +
        '<div class="modal__row"><button class="btn btn--ghost" data-cancel>취소</button></div>'
      );

      function paint() {
        var dots = '';
        for (var i = 0; i < 4; i++) {
          dots += '<span class="pin__dot' + (i < buf.length ? ' is-on' : '') + '"></span>';
        }
        $('[data-dots]', m).innerHTML = dots;
      }
      paint();

      function submit() {
        if (store.checkPin(buf)) { closeModal(); resolve(true); }
        else {
          buf = ''; paint();
          $('.pin', m).classList.remove('is-wrong');
          void $('.pin', m).offsetWidth;      // 리플로우로 애니메이션 재생
          $('.pin', m).classList.add('is-wrong');
          toast('PIN이 맞지 않습니다.');
        }
      }

      $$('.key', m).forEach(function (b) {
        b.onclick = function () {
          var k = b.getAttribute('data-k');
          if (k === '지움') buf = buf.slice(0, -1);
          else if (k === '확인') return submit();
          else if (buf.length < 4) buf += k;
          paint();
          if (buf.length === 4) setTimeout(submit, 120);
        };
      });
      $('[data-cancel]', m).onclick = function () { closeModal(); resolve(false); };
    });
  }

  // ---------- 소리 ----------
  var audioCtx = null;
  function beep(kind) {
    if (!store.all().sound) return;
    try {
      if (!audioCtx) {
        var AC = global.AudioContext || global.webkitAudioContext;
        if (!AC) return;
        audioCtx = new AC();
      }
      var now = audioCtx.currentTime;
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = 'sine';

      if (kind === 'done') { osc.frequency.setValueAtTime(880, now); osc.frequency.setValueAtTime(1320, now + 0.08); }
      else if (kind === 'reward') { osc.frequency.setValueAtTime(660, now); osc.frequency.setValueAtTime(990, now + 0.1); osc.frequency.setValueAtTime(1320, now + 0.2); }
      else { osc.frequency.setValueAtTime(420, now); }

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);

      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(now); osc.stop(now + 0.34);
    } catch (e) { /* 소리는 실패해도 무시 */ }
  }

  /** 체크한 타일에서 별이 병으로 날아가는 1회성 연출 */
  function flyStar(fromEl, toEl) {
    if (reduceMotion || !fromEl || !toEl) return;
    var a = fromEl.getBoundingClientRect();
    var b = toEl.getBoundingClientRect();
    var star = document.createElement('div');
    star.className = 'fly';
    star.textContent = '⭐';
    star.style.left = (a.left + a.width / 2 - 16) + 'px';
    star.style.top = (a.top + a.height / 2 - 16) + 'px';
    $('#fx').appendChild(star);

    var dx = (b.left + b.width / 2) - (a.left + a.width / 2);
    var dy = (b.top + b.height / 2) - (a.top + a.height / 2);

    requestAnimationFrame(function () {
      star.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(0.4)';
      star.style.opacity = '0';
    });
    setTimeout(function () { star.remove(); }, 700);
  }

  /** 누르고 있으면 실행되는 숨은 입구 */
  function longPress(el, ms, fn) {
    var timer = null;
    function start() {
      clearTimeout(timer);
      el.classList.add('is-holding');
      timer = setTimeout(function () { el.classList.remove('is-holding'); fn(); }, ms);
    }
    function cancel() { clearTimeout(timer); el.classList.remove('is-holding'); }
    el.addEventListener('pointerdown', start);
    el.addEventListener('pointerup', cancel);
    el.addEventListener('pointerleave', cancel);
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  /** 별 진행도를 보여주는 유리병 SVG. 글자를 못 읽어도 이해되는 지표 */
  function jarSVG(ratio, color) {
    var h = 40 * Math.max(0, Math.min(1, ratio));
    var y = 54 - h;
    return '' +
      '<svg class="jar" viewBox="0 0 44 62" aria-hidden="true">' +
        '<rect x="13" y="2" width="18" height="6" rx="2" fill="' + color + '"/>' +
        '<path d="M8 12 h28 a4 4 0 0 1 4 4 v38 a4 4 0 0 1 -4 4 h-28 a4 4 0 0 1 -4 -4 v-38 a4 4 0 0 1 4 -4 z" fill="#fff" stroke="#17323B" stroke-width="3"/>' +
        '<rect x="7" y="' + y + '" width="30" height="' + h + '" rx="3" fill="#F6BD3B"/>' +
        '<path d="M8 12 h28 a4 4 0 0 1 4 4 v38 a4 4 0 0 1 -4 4 h-28 a4 4 0 0 1 -4 -4 v-38 a4 4 0 0 1 4 -4 z" fill="none" stroke="#17323B" stroke-width="3"/>' +
      '</svg>';
  }

  global.KB.ui = {
    esc: esc, $: $, $$: $$,
    toast: toast,
    openModal: openModal, closeModal: closeModal,
    confirmBox: confirmBox, askPin: askPin,
    beep: beep, flyStar: flyStar, longPress: longPress,
    jarSVG: jarSVG, reduceMotion: reduceMotion
  };
})(window);
