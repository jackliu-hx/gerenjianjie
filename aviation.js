(() => {
  'use strict';
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const desktop = matchMedia('(min-width: 768px)');
  const toggle = document.getElementById('menu-toggle');
  const nav = document.getElementById('nav-links');
  const backdrop = document.getElementById('menu-backdrop');
  const main = document.getElementById('content');
  let menuOpen = false;
  let oldOverflow = '';
  let closeTimer;
  [...nav.querySelectorAll('a')].forEach((link, index) => link.style.setProperty('--item', index + 1));

  function setMenu(open, restoreFocus = true) {
    if (open && desktop.matches) return;
    clearTimeout(closeTimer);
    if (open && !menuOpen) oldOverflow = document.body.style.overflow;
    menuOpen = open;
    root.classList.toggle('menu-open', open);
    nav.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? '关闭导航菜单' : '打开导航菜单');
    document.body.style.overflow = open ? 'hidden' : oldOverflow;
    main.inert = open;
    document.querySelector('.brand').inert = open;
    document.getElementById('theme-toggle').inert = open;
    document.getElementById('motion-toggle').inert = open;
    if (open) {
      nav.inert = false;
      nav.style.visibility = 'visible';
      nav.querySelector('a').focus({preventScroll:true});
    } else {
      nav.inert = !desktop.matches;
      closeTimer = setTimeout(() => { nav.style.visibility = ''; }, 500);
      if (restoreFocus) toggle.focus({preventScroll:true});
    }
  }
  toggle.addEventListener('click', () => setMenu(!menuOpen));
  backdrop.addEventListener('click', () => setMenu(false));
  nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
    if (menuOpen) setMenu(false);
  }));
  document.addEventListener('keydown', event => {
    if (!menuOpen) return;
    if (event.key === 'Escape') { event.preventDefault(); setMenu(false); }
    if (event.key === 'Tab') {
      const stops = [...nav.querySelectorAll('a'), toggle];
      const index = stops.indexOf(document.activeElement);
      const next = event.shiftKey ? (index - 1 + stops.length) % stops.length : (index + 1) % stops.length;
      event.preventDefault();
      stops[next].focus();
    }
  });
  desktop.addEventListener('change', () => { setMenu(false,false); nav.inert = !desktop.matches; });
  nav.inert = !desktop.matches;

  // Local aviation scene: no remote video is needed for the preview to animate.
  const canvas = document.getElementById('aero-flow');
  const ctx = canvas.getContext('2d', {alpha:true});
  const motionButton = document.getElementById('motion-toggle');
  let paused = reduced.matches;
  let width = 0, height = 0, frame = 0, lastTime = 0, elapsed = 0;
  let pointerX = 0, pointerY = 0, targetX = 0, targetY = 0;
  const trails = Array.from({length:44}, (_,i) => ({lane:i%12,phase:(i*.618034)%1,speed:.035+(i%5)*.009}));
  function path(lane, progress, time) {
    const bend = Math.exp(-Math.pow((progress-.69)*3.8,2));
    return height*(.11+lane*.071) + (lane-5.5)*bend*height*.016 + Math.sin(progress*5+time*.22+lane*.45)*8 + pointerY*12;
  }
  function draw() {
    if (!ctx) return;
    ctx.clearRect(0,0,width,height);
    const light = root.dataset.theme === 'light';
    pointerX += (targetX-pointerX)*.045;
    pointerY += (targetY-pointerY)*.045;
    const start = width*.15;
    const ink = light ? '46,91,102' : '191,219,220';
    for (let lane=0;lane<12;lane++) {
      const paint = ctx.createLinearGradient(0,0,width,0);
      paint.addColorStop(0,`rgba(${ink},0)`);
      paint.addColorStop(.45,`rgba(${ink},.045)`);
      paint.addColorStop(.8,`rgba(${ink},.22)`);
      paint.addColorStop(1,`rgba(${ink},0)`);
      ctx.beginPath();
      for (let x=start;x<=width+30;x+=24) {
        const y=path(lane,(x+pointerX*10)/width,elapsed);
        if(x===start) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.strokeStyle=paint; ctx.lineWidth=.65; ctx.stroke();
    }
    for(const trail of trails) {
      const progress=(elapsed*trail.speed+trail.phase)%1;
      const x=progress*(width+200)-100;
      const y=path(trail.lane,x/width,elapsed);
      const length=35+trail.speed*500;
      const paint=ctx.createLinearGradient(x-length,y,x,y);
      paint.addColorStop(0,'rgba(239,150,109,0)');
      paint.addColorStop(1,light?'rgba(138,65,30,.5)':'rgba(239,169,126,.7)');
      ctx.beginPath(); ctx.moveTo(x-length,y); ctx.lineTo(x,y);
      ctx.strokeStyle=paint; ctx.lineWidth=trail.lane%3===0?1.1:.6; ctx.stroke();
    }
  }
  function resize() {
    width=innerWidth; height=innerHeight;
    const ratio=Math.min(devicePixelRatio||1,1.5);
    canvas.width=Math.round(width*ratio); canvas.height=Math.round(height*ratio);
    if(ctx)ctx.setTransform(ratio,0,0,ratio,0,0);
    draw();
  }
  function animate(time) {
    if(paused || document.hidden) return;
    if(time-lastTime>=30) {
      elapsed+=Math.min((time-lastTime)/1000,.06);
      lastTime=time; draw();
    }
    frame=requestAnimationFrame(animate);
  }
  function synchronize() {
    cancelAnimationFrame(frame);
    root.classList.toggle('motion-paused',paused || document.hidden);
    motionButton.setAttribute('aria-pressed',String(paused));
    motionButton.setAttribute('aria-label',paused?'播放背景动效':'暂停背景动效');
    motionButton.title=paused?'播放背景动效':'暂停背景动效';
    motionButton.querySelector('i').className=paused?'ph ph-play':'ph ph-pause';
    if(!paused && !document.hidden) { lastTime=performance.now(); frame=requestAnimationFrame(animate); }
    else draw();
  }
  motionButton.addEventListener('click',()=>{paused=!paused;synchronize();});
  reduced.addEventListener('change',()=>{paused=reduced.matches;synchronize();});
  document.addEventListener('visibilitychange',synchronize);
  window.addEventListener('resize',resize,{passive:true});
  window.addEventListener('pointermove',event=>{
    if(event.pointerType==='touch')return;
    targetX=event.clientX/Math.max(width,1)-.5;
    targetY=event.clientY/Math.max(height,1)-.5;
  },{passive:true});
  document.documentElement.addEventListener('pointerleave',()=>{targetX=0;targetY=0;});
  new MutationObserver(draw).observe(root,{attributes:true,attributeFilter:['data-theme']});
  resize(); synchronize();
  window.addEventListener('pagehide',()=>cancelAnimationFrame(frame));
  window.addEventListener('pageshow',synchronize);
})();
