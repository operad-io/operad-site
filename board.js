// Two small things: tiles rise in as they enter, and the example board opens one row at a time.
(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var items = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !reduce) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    items.forEach(function (el, i) { el.style.setProperty('--d', (i % 4) * 70 + 'ms'); io.observe(el); });
  } else {
    items.forEach(function (el) { el.classList.add('in'); });
  }

  var rows = document.getElementById('rows');
  if (!rows) return;
  rows.addEventListener('click', function (e) {
    var b = e.target.closest('.row');
    if (!b) return;
    var li = b.parentNode, open = li.classList.contains('is-open');
    rows.querySelectorAll('.is-open').forEach(function (o) {
      o.classList.remove('is-open'); o.querySelector('.row').setAttribute('aria-expanded', 'false');
    });
    if (!open) { li.classList.add('is-open'); b.setAttribute('aria-expanded', 'true'); }
  });

  var live = document.getElementById('live');
  var acts = document.getElementById('live-acts');
  if (!live || !acts) return;
  acts.addEventListener('click', function (e) {
    var d = e.target.getAttribute('data-do');
    if (!d) return;
    var st = document.getElementById('live-st'), log = document.getElementById('live-log');
    var merged = d === 'merge';
    st.textContent = merged ? 'merged' : 'rejected';
    st.className = 'r-st ' + (merged ? 'st-ok' : 'st-weak');
    var t = new Date().toTimeString().slice(0, 8);
    log.textContent += '\n- ' + t + '  you chose ' + d + (merged ? '' : ': sent back to the worker');
    acts.innerHTML = '<span>' + (merged ? 'Merged to main. Cleanup runs next.' : 'Back with the worker.') + '</span>';
    live.setAttribute('data-state', merged ? 'done' : 'rejected');
  });
})();
