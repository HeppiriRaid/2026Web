/* ============================================================
   KOKI TAKAMATSU — motion layer
   Lenis (smooth scroll) + GSAP/ScrollTrigger + custom cursor
   WebGL hover distortion is loaded lazily from ./webgl.js
   ============================================================ */
const { gsap } = window;
const ScrollTrigger = window.ScrollTrigger;
gsap.registerPlugin(ScrollTrigger);

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const COARSE  = window.matchMedia('(hover:none),(pointer:coarse)').matches;

const revealed = new WeakSet();
let lenis = null;

/* ------------------------------------------------------------
   Line splitter — wraps each visual line in .line-mask>.line-inner
   Respects <br>. Re-runnable (stores original markup).
------------------------------------------------------------ */
function splitLines(el){
  if(!el.dataset.orig) el.dataset.orig = el.innerHTML;
  else el.innerHTML = el.dataset.orig;

  const tokens = [];
  el.childNodes.forEach(node=>{
    if(node.nodeType === 3){
      node.textContent.split(/\s+/).forEach(w=>{ if(w.length) tokens.push({w}); });
    } else if(node.nodeName === 'BR'){ tokens.push({br:true}); }
    else if(node.textContent.trim()){ tokens.push({w:node.textContent.trim()}); }
  });

  el.innerHTML = '';
  const probes = [];
  tokens.forEach(t=>{
    if(t.br){ probes.push({br:true}); el.appendChild(document.createElement('br')); return; }
    const s = document.createElement('span');
    s.style.display = 'inline-block';
    s.textContent = t.w;
    el.appendChild(s); el.appendChild(document.createTextNode(' '));
    probes.push({el:s});
  });

  const lines = []; let cur = []; let lastTop = null;
  probes.forEach(p=>{
    if(p.br){ lines.push(cur); cur = []; lastTop = null; return; }
    const top = p.el.offsetTop;
    if(lastTop !== null && top > lastTop + 2){ lines.push(cur); cur = []; }
    cur.push(p.el.textContent); lastTop = top;
  });
  if(cur.length) lines.push(cur);

  el.innerHTML = '';
  const inners = [];
  lines.forEach(words=>{
    const mask = document.createElement('span'); mask.className = 'line-mask';
    const inner = document.createElement('span'); inner.className = 'line-inner';
    inner.textContent = words.join(' ');
    mask.appendChild(inner); el.appendChild(mask); inners.push(inner);
  });
  return inners;
}

/* ------------------------------------------------------------
   Reveals
------------------------------------------------------------ */
let revealCtx = [];

function buildReveals(){
  // tear down previous
  revealCtx.forEach(c=>c.st && c.st.kill());
  revealCtx = [];

  document.querySelectorAll('[data-reveal]').forEach(el=>{
    const isLines = el.classList.contains('reveal-lines');
    const manual  = el.closest('#about');          // first screen → played by intro
    const wasDone = revealed.has(el);
    let play;

    if(isLines){
      const inners = splitLines(el);
      gsap.set(inners, { yPercent: wasDone ? 0 : 120 });
      play = ()=>{ revealed.add(el);
        gsap.to(inners,{ yPercent:0, duration:1.05, ease:'expo.out', stagger:0.08 }); };
    } else {
      gsap.set(el, { y: wasDone ? 0 : 28, opacity: wasDone ? 1 : 0 });
      play = ()=>{ revealed.add(el);
        gsap.to(el,{ y:0, opacity:1, duration:1, ease:'expo.out' }); };
    }
    el._play = play;

    if(manual){ if(wasDone) play(); return; }      // intro handles #about
    const st = ScrollTrigger.create({ trigger:el, start:'top 90%', once:true, onEnter:play });
    revealCtx.push({el, st});
  });

  // catch elements already in view (deep-link / reload mid-page)
  requestAnimationFrame(revealInView);
}

// Safety net: reveal anything in view that a ScrollTrigger couldn't reach
// (e.g. elements in the final viewport the page can't scroll past).
function revealInView(ratio=0.92){
  document.querySelectorAll('[data-reveal]').forEach(el=>{
    if(revealed.has(el) || el.closest('#about')) return;
    const r = el.getBoundingClientRect();
    if(r.top < innerHeight*ratio && r.bottom > 0) el._play && el._play();
  });
}

/* ------------------------------------------------------------
   Media : clip-path reveal + scroll parallax
------------------------------------------------------------ */
function buildMedia(){
  gsap.utils.toArray('.media').forEach(media=>{
    const img = media.querySelector('.media__img');

    gsap.set(media, { clipPath:'inset(0% 0% 100% 0%)' });
    gsap.set(img,   { scale:1.18 });

    ScrollTrigger.create({
      trigger: media, start:'top 86%', once:true,
      onEnter:()=>{
        gsap.to(media,{ clipPath:'inset(0% 0% 0% 0%)', duration:1.25, ease:'expo.out' });
        gsap.to(img,  { scale:1.06, duration:1.6, ease:'expo.out' });
      }
    });

    if(!REDUCED){
      gsap.fromTo(img, { yPercent:-8 }, {
        yPercent:8, ease:'none',
        scrollTrigger:{ trigger:media, start:'top bottom', end:'bottom top', scrub:true }
      });
    }
  });
}

/* ------------------------------------------------------------
   Custom cursor + magnetic
------------------------------------------------------------ */
function initCursor(){
  if(COARSE) return;
  const cursor = document.querySelector('.cursor');
  const dot  = cursor.querySelector('.cursor__dot');
  const ring = cursor.querySelector('.cursor__ring');
  const xDot = gsap.quickTo(dot,'x',{duration:0.18,ease:'power3'}),
        yDot = gsap.quickTo(dot,'y',{duration:0.18,ease:'power3'}),
        xR = gsap.quickTo(ring,'x',{duration:0.45,ease:'power3'}),
        yR = gsap.quickTo(ring,'y',{duration:0.45,ease:'power3'});

  window.addEventListener('mousemove', e=>{
    gsap.to(cursor,{opacity:1,duration:.3});
    xDot(e.clientX); yDot(e.clientY); xR(e.clientX); yR(e.clientY);
  });
  document.addEventListener('mouseleave', ()=>gsap.to(cursor,{opacity:0,duration:.3}));

  document.querySelectorAll('a,[data-magnetic],.link-tag,.media').forEach(el=>{
    el.addEventListener('mouseenter',()=>cursor.classList.add('is-hover'));
    el.addEventListener('mouseleave',()=>cursor.classList.remove('is-hover'));
  });

  // magnetic
  document.querySelectorAll('[data-magnetic]').forEach(el=>{
    const strength = 0.4;
    el.addEventListener('mousemove', e=>{
      const r = el.getBoundingClientRect();
      gsap.to(el,{ x:(e.clientX-(r.left+r.width/2))*strength,
                   y:(e.clientY-(r.top+r.height/2))*strength,
                   duration:.6, ease:'power3' });
    });
    el.addEventListener('mouseleave',()=>gsap.to(el,{x:0,y:0,duration:.6,ease:'elastic.out(1,.4)'}));
  });
}

/* ------------------------------------------------------------
   Header show / hide + nav + progress
------------------------------------------------------------ */
function initChrome(){
  const header = document.querySelector('[data-header]');
  const bar = document.querySelector('[data-progress]');
  let last = 0;

  let throttle = 0;
  const onScroll = ({scroll, progress})=>{
    if(scroll > last && scroll > 240) header.classList.add('is-hidden');
    else header.classList.remove('is-hidden');
    last = scroll;
    if(bar) bar.style.transform = `scaleX(${progress||0})`;
    const now = performance.now();
    if(now - throttle > 140){ throttle = now; revealInView(); }
    if((progress||0) > 0.985) revealInView(1.0);   // reveal trailing bottom items
  };
  if(lenis) lenis.on('scroll', onScroll);
  else { // reduced-motion / no-lenis: still drive header + progress + reveals
    addEventListener('scroll', ()=>{
      const max = document.body.scrollHeight - innerHeight;
      onScroll({ scroll:scrollY, progress: max>0 ? scrollY/max : 0 });
    }, {passive:true});
  }

  document.querySelectorAll('a[href^="#"]').forEach(a=>{
    a.addEventListener('click', e=>{
      const id = a.getAttribute('href');
      if(id === '#' || !document.querySelector(id)) return;
      e.preventDefault();
      lenis ? lenis.scrollTo(id,{offset:0,duration:1.4}) :
              document.querySelector(id).scrollIntoView({behavior:'smooth'});
    });
  });
}

/* ------------------------------------------------------------
   Image load / fallback
------------------------------------------------------------ */
function watchImages(done){
  const imgs = [...document.querySelectorAll('.media__img')];
  let left = imgs.length;
  const tick = ()=>{ if(--left <= 0) done && done(); };
  imgs.forEach(img=>{
    if(img.complete && img.naturalWidth === 0) img.dispatchEvent(new Event('error'));
    img.addEventListener('error', ()=>{ img.closest('.media').classList.add('img-missing'); tick(); }, {once:true});
    img.addEventListener('load',  ()=>{ img.dataset.ready='1'; tick(); }, {once:true});
    if(img.complete) img.dispatchEvent(new Event(img.naturalWidth ? 'load' : 'error'));
  });
  if(!imgs.length) done && done();
}

/* ------------------------------------------------------------
   Smooth scroll
------------------------------------------------------------ */
function initSmooth(){
  if(REDUCED) return;
  lenis = new Lenis({ lerp:0.1, wheelMultiplier:1, smoothWheel:true });
  window.__lenis = lenis;
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(t=> lenis.raf(t*1000));
  gsap.ticker.lagSmoothing(0);
}

/* ------------------------------------------------------------
   Intro (after preloader) — hero-reveal the first screen
------------------------------------------------------------ */
function intro(){
  const tl = gsap.timeline({ defaults:{ ease:'expo.out' } });

  // header in
  tl.from('.site-header',{ yPercent:-100, opacity:0, duration:1 }, 0.1);

  // about heading lines
  const aboutTitle = document.querySelector('#about .reveal-lines');
  if(aboutTitle){
    const inners = aboutTitle.querySelectorAll('.line-inner');
    tl.to(inners,{ yPercent:0, duration:1.1, stagger:0.09 }, 0.2);
    revealed.add(aboutTitle);
  }
  // about paragraphs + square
  const blocks = document.querySelectorAll('#about [data-reveal]:not(.reveal-lines)');
  blocks.forEach(b=>revealed.add(b));
  tl.to(blocks,{ y:0, opacity:1, duration:1, stagger:0.08 }, 0.5);

  // portrait
  const media = document.querySelector('#about .media');
  if(media){
    const img = media.querySelector('.media__img');
    tl.to(media,{ clipPath:'inset(0% 0% 0% 0%)', duration:1.3 }, 0.35)
      .to(img,  { scale:1.06, duration:1.6 }, 0.35);
  }
}

/* ------------------------------------------------------------
   Preloader
------------------------------------------------------------ */
function preloader(start){
  const pre = document.querySelector('.preloader');
  if(REDUCED || !pre){ document.body.classList.remove('is-loading'); start(); return; }

  const counter = pre.querySelector('[data-count]');
  const lines = pre.querySelectorAll('.preloader__line > span');
  const curtain = pre.querySelector('.preloader__curtain');
  const obj = { v:0 };

  const tl = gsap.timeline();
  tl.to(lines,{ yPercent:0, duration:1, ease:'expo.out', stagger:0.12 }, 0)
    .to(obj,{ v:100, duration:1.6, ease:'power2.inOut',
              onUpdate:()=> counter.textContent = Math.round(obj.v) }, 0)
    .to(pre.querySelector('.preloader__inner'),{ opacity:0, duration:0.5, ease:'power2.in' }, '+=0.15')
    .to(curtain,{ scaleY:0, transformOrigin:'top', duration:1.1, ease:'expo.inOut' }, '-=0.2')
    .add(()=>{ document.body.classList.remove('is-loading'); pre.style.display='none'; }, '-=0.5')
    .add(start, '-=0.9');
}

/* ------------------------------------------------------------
   Boot
------------------------------------------------------------ */
function boot(){
  initSmooth();
  buildReveals();
  buildMedia();
  initCursor();
  initChrome();
  intro();
  ScrollTrigger.refresh();

  // lazy WebGL hover effect (never blocks the core experience)
  if(!REDUCED && !COARSE){
    import('./webgl.js')
      .then(m=> m.initWebGL && m.initWebGL())
      .catch(()=>{ /* WebGL unavailable — silent, CSS experience stands */ });
  }
}

// resize → re-split lines so masks never clip re-wrapped text
let rw = innerWidth;
window.addEventListener('resize', ()=>{
  if(Math.abs(innerWidth - rw) < 40) { ScrollTrigger.refresh(); return; }
  rw = innerWidth;
  clearTimeout(window.__rsz);
  window.__rsz = setTimeout(()=>{ buildReveals(); ScrollTrigger.refresh(); }, 200);
});

window.addEventListener('DOMContentLoaded', ()=>{
  // split + prime line reveals up front so the preloader handoff is seamless
  document.querySelectorAll('.reveal-lines[data-reveal]').forEach(el=>{
    const inners = splitLines(el);
    gsap.set(inners,{ yPercent:120 });
  });
  document.fonts && document.fonts.ready.then(()=>ScrollTrigger.refresh());
  watchImages();
  preloader(boot);
});
