/* script.js
   - unified script for index.html and programma.html
   - features:
     * improved sticky header (no shake)
     * carousel (data-images driven)
     * day-tabs filtering (keeps per-day HTML)
     * staggered reveal for .card
     * page transitions (enter/exit) respecting prefers-reduced-motion
     * shared loadCurrentProgramFromPrograma() exposed on window
       -> uses local DOM if available, otherwise fetches/parses programma.html
*/

(function(){
  'use strict';

  /* ---------- Utilities ---------- */
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const noop = ()=>{};
  const clamp = (n,a,b) => Math.max(a, Math.min(b, n));

  /* ---------- DOMContentLoaded init ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    // set current year(s)
    const y = new Date().getFullYear();
    $('#year') && ($('#year').textContent = y);
    $('#year-2') && ($('#year-2').textContent = y);

    // reveal animation for cards (stagger)
    initReveal();

    // header stickiness
    initHeaderSticky();

    // page transitions (if #page wrapper present)
    initPageTransitions();

    // carousels
    $$('.carousel').forEach(initCarousel);

    // day-tabs on programma page
    $$('.day-tabs').forEach(initDayTabs);

    // keyboard accessibility for nav items
    $$('.nav-link, .nav-cta').forEach(el => {
      el.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); el.click(); }
      });
    });

    // init now-playing auto-fill if there's a #now-playing container
    const nowTarget = $('#now-playing');
    if (nowTarget) {
      // call the shared loader (will use DOM if on programma page otherwise will fetch)
      window.loadCurrentProgramFromPrograma().then(()=>{/* done */});
      // refresh every 30 seconds
      setInterval(() => window.loadCurrentProgramFromPrograma().catch(()=>{}), 30_000);
    }

  });

  /* ---------- Reveal (IntersectionObserver) ---------- */
  function initReveal(){
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // don't animate for reduced motion
      $$('.card').forEach(c => { c.style.opacity = 1; c.style.transform = 'none'; });
      return;
    }

    const els = $$('.card');
    if (!els.length) return;
    const obs = new IntersectionObserver((entries, oi) => {
      entries.forEach((entry, i) => {
        if (entry.isIntersecting) {
          const el = entry.target;
          el.style.transition = `opacity 700ms ease ${Math.min(300, 60 * i)}ms, transform 700ms cubic-bezier(.22,.9,.16,1) ${Math.min(300, 60 * i)}ms`;
          el.style.opacity = '1';
          el.style.transform = 'translateY(0)';
          oi.unobserve(el);
        }
      });
    }, {threshold: 0.12});
    els.forEach((c) => {
      c.style.opacity = '0';
      c.style.transform = 'translateY(18px)';
      obs.observe(c);
    });
  }

  /* ---------- Header sticky (no-shake) ---------- */
  function initHeaderSticky(){
    const header = document.getElementById('site-header');
    if (!header) return;
    const TH = 60;
    let ticking = false;
    function update(){
      const y = window.scrollY || window.pageYOffset;
      header.classList.toggle('scrolled', y > TH);
      ticking = false;
    }
    window.addEventListener('scroll', () => {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, {passive:true});
    // run once
    update();
  }

  /* ---------- Page transitions ---------- */
  function initPageTransitions(){
    const page = document.getElementById('page');
    if (!page) return;
    // respect prefers-reduced-motion
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduce) {
      requestAnimationFrame(()=>page.classList.add('enter'));
      // intercept same-origin internal links for smooth exit
      document.addEventListener('click', (ev) => {
        const a = ev.target.closest && ev.target.closest('a');
        if (!a) return;
        const href = a.getAttribute('href');
        if (!href || href.startsWith('mailto:') || href.startsWith('tel:') || a.target === '_blank') return;
        try {
          const url = new URL(href, location.href);
          if (url.origin !== location.origin) return;
          // let hash links and same-page anchors behave normally
          if (url.pathname === location.pathname && url.hash) return;
          ev.preventDefault();
          page.classList.remove('enter');
          page.classList.add('exit');
          const onEnd = () => { page.removeEventListener('transitionend', onEnd); window.location.href = url.href; };
          page.addEventListener('transitionend', onEnd);
          // fallback nav in case transitionend doesn't fire
          setTimeout(()=>window.location.href = url.href, 650);
        } catch(e){ /* ignore */ }
      });
    } else {
      page.classList.add('enter');
    }
  }

  /* ---------- Carousel (data-images driven) ---------- */
  function parseImageList(str){
    if (!str) return [];
    str = String(str).trim();
    // try JSON
    try { const p = JSON.parse(str); if (Array.isArray(p)) return p; } catch(e){}
    // newline separated
    const lines = str.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    if (lines.length) return lines;
    return [str];
  }

  function initCarousel(root){
    const viewport = root.querySelector('.carousel-viewport') || root;
    const track = root.querySelector('.carousel-track');
    const prevBtn = root.querySelector('.carousel-btn.prev');
    const nextBtn = root.querySelector('.carousel-btn.next');
    const dotsWrap = root.querySelector('.carousel-dots');

    if (!track) return;

    // build slides from data-images if provided and track empty
    const data = root.getAttribute('data-images') || '';
    const imgs = parseImageList(data);
    if (imgs.length && track.children.length === 0) {
      imgs.forEach((src,i) => {
        const img = document.createElement('img');
        img.className = 'carousel-slide';
        img.setAttribute('role','listitem');
        img.setAttribute('loading','lazy');
        img.src = src;
        img.alt = `Studio foto ${i+1}`;
        track.appendChild(img);
      });
    }

    // fallback placeholder
    if (track.children.length === 0) {
      const ph = document.createElement('div');
      ph.className = 'carousel-slide';
      ph.textContent = 'Geen afbeeldingen';
      ph.style.minHeight = '160px';
      ph.style.display = 'flex';
      ph.style.alignItems = 'center';
      ph.style.justifyContent = 'center';
      ph.style.background = '#eef9ff';
      track.appendChild(ph);
    }

    let index = 0;
    const autoplay = root.dataset.autoplay === 'true';
    const interval = Number(root.dataset.interval) || 4200;
    let timer = null;
    let startX = 0, deltaX = 0;

    function createDots(){
      if (!dotsWrap) return;
      dotsWrap.innerHTML = '';
      Array.from(track.children).forEach((_,i) => {
        const btn = document.createElement('button');
        btn.className = 'carousel-dot';
        btn.setAttribute('aria-label', `Ga naar slide ${i+1}`);
        btn.dataset.index = i;
        btn.addEventListener('click', ()=>goTo(i));
        dotsWrap.appendChild(btn);
      });
    }

    function refresh(){
      const width = (viewport.clientWidth || viewport.offsetWidth) || track.clientWidth;
      track.style.transform = `translateX(${-index * width}px)`;
      if (dotsWrap) Array.from(dotsWrap.children).forEach((d,i)=>d.classList.toggle('active', i===index));
    }

    function goTo(i){
      index = ((i % track.children.length) + track.children.length) % track.children.length;
      refresh();
      resetAutoplay();
    }
    function next(){ goTo(index + 1); }
    function prev(){ goTo(index - 1); }

    nextBtn && nextBtn.addEventListener('click', next);
    prevBtn && prevBtn.addEventListener('click', prev);

    // keyboard for carousel
    root.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    });

    // responsive
    let resizeTimer = null;
    window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(refresh, 120); });

    // touch
    track.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; deltaX = 0; stopAutoplay(); }, {passive:true});
    track.addEventListener('touchmove', (e) => {
      deltaX = e.touches[0].clientX - startX;
      const width = (viewport.clientWidth || viewport.offsetWidth) || track.clientWidth;
      track.style.transform = `translateX(${-index * width + deltaX}px)`;
    }, {passive:true});
    track.addEventListener('touchend', () => {
      if (Math.abs(deltaX) > 60) deltaX < 0 ? next() : prev();
      else refresh();
      resetAutoplay();
    });

    // pause on hover/focus
    root.addEventListener('mouseenter', stopAutoplay);
    root.addEventListener('mouseleave', resetAutoplay);
    root.addEventListener('focusin', stopAutoplay);
    root.addEventListener('focusout', resetAutoplay);

    function startAutoplay(){ if (!autoplay) return; stopAutoplay(); timer = setInterval(next, interval); }
    function stopAutoplay(){ if (timer) { clearInterval(timer); timer = null; } }
    function resetAutoplay(){ stopAutoplay(); startAutoplay(); }

    createDots();
    refresh();
    startAutoplay();
  }

  /* ---------- Day tabs (uses existing per-day HTML) ---------- */
  function initDayTabs(container){
    if (!container) return;
    const tabs = Array.from(container.querySelectorAll('.day-tab'));
    const scheduleDays = $$('.schedule-day');
    if (!scheduleDays.length) return;

    function show(day){
      if (day === 'all') {
        scheduleDays.forEach(sd => sd.classList.remove('hidden'));
      } else {
        scheduleDays.forEach(sd => {
          if ((sd.dataset.day || sd.id || '').toLowerCase() === day) sd.classList.remove('hidden');
          else sd.classList.add('hidden');
        });
        // scroll to visible day (nice on mobile)
        const first = document.querySelector(`.schedule-day[data-day="${day}"], .schedule-day#${day}`);
        if (first) first.scrollIntoView({behavior: 'smooth', block: 'start'});
      }
    }

    tabs.forEach(t => {
      t.addEventListener('click', () => {
        tabs.forEach(x => x.setAttribute('aria-pressed','false'));
        t.setAttribute('aria-pressed','true');
        show((t.dataset.day || 'all').toLowerCase());
      });
      t.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); t.click(); }
      });
    });

    // initial active tab
    const active = tabs.find(t => t.getAttribute('aria-pressed') === 'true') || tabs[0];
    if (active) {
      active.setAttribute('aria-pressed','true');
      show((active.dataset.day || 'all').toLowerCase());
    }
  }

  /* ---------- Now-playing (shared) ----------
     - Exposed as window.loadCurrentProgramFromPrograma()
     - If running on programma.html (DOM has .schedule-day): compute from DOM
     - Else: fetch('programma.html') and parse remote DOM
     - Returns a promise that resolves to { html, found }
  */
  async function loadCurrentProgramFromPrograma(){
    // if schedule-day elements exist in current DOM, use them
    const localNodes = $$('.schedule-day');
    if (localNodes.length) return computeNowFromScheduleDOM(localNodes);

    // otherwise try to fetch programa.html and parse it
    try {
      const resp = await fetch('programma.html', {cache: 'no-store'});
      if (!resp.ok) throw new Error('Fetch failed: ' + resp.status);
      const text = await resp.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'text/html');
      const remoteNodes = Array.from(doc.querySelectorAll('.schedule-day'));
      if (!remoteNodes.length) throw new Error('Geen schedule nodes in fetched document');
      return computeNowFromScheduleDOM(remoteNodes, true);
    } catch (err) {
      console.warn('loadCurrentProgramFromPrograma error:', err);
      // render fallback in page if target exists
      renderNowPlayingToTarget('<div class="muted">Geen programma nu</div>');
      return { html: '<div class="muted">Geen programma nu</div>', found:false };
    }
  }

  // expose globally
  window.loadCurrentProgramFromPrograma = loadCurrentProgramFromPrograma;

  /* ---------- computeNowFromScheduleDOM ----------
     nodes: array-like of schedule-day elements (local DOM nodes or nodes from fetched doc)
     remote: if true, nodes may belong to remote doc; still treat same
     returns { html, found }
  */
  function computeNowFromScheduleDOM(nodes, remote=false){
    // map nodes by data-day or id
    const map = {};
    nodes.forEach(n => {
      const key = (n.dataset && n.dataset.day) ? n.dataset.day.toLowerCase() : (n.id ? n.id.toLowerCase() : null);
      if (key) map[key] = n;
    });

    const daysMap = ['zondag','maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag'];
    const now = new Date();
    const dayKey = daysMap[now.getDay()];

    const scheduleNode = map[dayKey];
    if (!scheduleNode) {
      const out = { html: '<div class="muted">Geen programma nu</div>', found:false };
      renderNowPlayingToTarget(out.html);
      return out;
    }

    // collect program items inside scheduleNode
    const programEls = Array.from(scheduleNode.querySelectorAll('.program-item, li, .program'));
    const items = programEls.map(el => {
      const timeEl = el.querySelector('time, .program-time') || null;
      const titleEl = el.querySelector('.program-title') || null;
      const rawText = (el.textContent || '').trim();
      const timeText = timeEl ? timeEl.textContent.trim() : (rawText.match(/\d{1,2}:\d{2}(?:\s*[-–]\s*\d{1,2}:\d{2})?/) || [''])[0];
      const titleText = titleEl ? titleEl.textContent.trim() : rawText.replace(timeText,'').trim();
      return { timeText, titleText };
    }).filter(i => i.timeText || i.titleText);

    // helper to convert HH:MM -> minutes
    const toMinutes = (hm) => {
      if (!hm) return null;
      const m = hm.match(/(\d{1,2}):(\d{2})/);
      if (!m) return null;
      return parseInt(m[1],10)*60 + parseInt(m[2],10);
    };

    const nowMinutes = now.getHours()*60 + now.getMinutes();
    let found = null;

    // try ranges first
    for (const it of items) {
      const range = it.timeText.match(/(\d{1,2}:\d{2})\s*[–\-]\s*(\d{1,2}:\d{2})/);
      if (range) {
        const s = toMinutes(range[1]); const e = toMinutes(range[2]);
        if (s !== null && e !== null) {
          if (s <= e) {
            if (nowMinutes >= s && nowMinutes < e) { found = { title: it.titleText || 'Onbekend', start:s, end:e }; break; }
          } else {
            // wraps midnight
            if (nowMinutes >= s || nowMinutes < e) { found = { title: it.titleText || 'Onbekend', start:s, end:e }; break; }
          }
        }
      }
    }

    // fallback: choose latest program that started <= now
    if (!found) {
      const starts = items.map(it => {
        const m = it.timeText.match(/(\d{1,2}:\d{2})/);
        return { title: it.titleText || 'Onbekend', start: m ? toMinutes(m[1]) : null };
      }).filter(i => i.start !== null).sort((a,b)=>a.start - b.start);

      if (starts.length) {
        let cand = null;
        for (const p of starts) { if (p.start <= nowMinutes) cand = p; else break; }
        if (cand) found = { title: cand.title, start: cand.start, end: null };
      }
    }

    if (!found) {
      const out = { html: '<div class="muted">Geen programma nu</div>', found:false };
      renderNowPlayingToTarget(out.html);
      return out;
    }

    // build output html
    const safeTitle = escapeHtml(found.title || 'Onbekend programma');
    const timeStr = (found.start && found.end) ? `${fmt(found.start)} – ${fmt(found.end)}` :
                    (found.start ? `${fmt(found.start)} →` : '');
    const html = `
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="width:56px;height:56px;border-radius:10px;background:linear-gradient(135deg,#f0fbff,#e6f7ff);display:flex;align-items:center;justify-content:center;font-weight:800;color:var(--accent-2);">
          ▶
        </div>
        <div style="flex:1;">
          <div style="font-weight:800;font-size:1rem;">Nu: ${safeTitle}</div>
          <div class="muted" style="font-size:.92rem;margin-top:4px;">${timeStr}</div>
        </div>
      </div>
    `;
    renderNowPlayingToTarget(html);
    return { html, found:true };
  }

  // render into #now-playing if present
  function renderNowPlayingToTarget(html){
    const t = document.getElementById('now-playing');
    if (t) t.innerHTML = html;
  }

  /* ---------- small helpers ---------- */
  function fmt(mins) {
    if (mins === null || mins === undefined) return '';
    mins = (mins + 24*60) % (24*60);
    const h = Math.floor(mins/60);
    const m = mins % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  }
  function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  /* ---------- expose small API for debugging ---------- */
  window.__MNS = window.__MNS || {};
  window.__MNS.loadCurrentProgramFromPrograma = loadCurrentProgramFromPrograma;

})(); // IIFE end
