(() => {
  'use strict';
  const root = document.documentElement;
  const $ = (selector, parent = document) => parent.querySelector(selector);
  const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const desktop = matchMedia('(min-width: 768px)');
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const storage = {
    get(key) { try { return localStorage.getItem(key); } catch (_) { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch (_) { /* Optional persistence. */ } }
  };
  let frame = 0, previousTime = 0, elapsed = 0;
  const state = { paused: storage.get('lh-aviation-motion') === 'paused', zone: 'home', heroVisible: true };
  const canMove = () => !state.paused && !reduced.matches && !document.hidden;
  const canPoint = () => canMove() && desktop.matches && fine.matches;

  // PointerController / MouseState. Events only record targets; one shared RAF writes styles.
  const mouse = { targetX: innerWidth / 2, targetY: innerHeight / 2, currentX: innerWidth / 2, currentY: innerHeight / 2, velocityX: 0, velocityY: 0, energy: 0, inside: false };
  const lens = $('.cursor-lens');
  const heroScene = $('.aircraft-scene');
  // Separate the hero photograph from content so the shared airflow sits between them.
  const hero = $('#home'), heroAircraft = $('.hero-aircraft');
  document.body.insertBefore(heroAircraft, $('#content'));
  document.body.insertBefore($('#aero-flow'), $('#content'));
  root.classList.add('scene-separated');
  const sizeHero = () => heroAircraft.style.height = `${hero.offsetHeight}px`;
  if ('ResizeObserver' in window) new ResizeObserver(entries => {
    heroAircraft.style.height = `${entries[0].contentRect.height}px`;
  }).observe(hero);
  else sizeHero();
  const glassElements = $$('.glass,.glass-panel,.glass-control,.button');
  let activeGlass = null, activeRect = null, lastPointerWrite = 0;
  function releaseGlass() {
    if (activeGlass) {
      activeGlass.classList.remove('is-tilting');
      activeGlass.style.removeProperty('--tilt-x');
      activeGlass.style.removeProperty('--tilt-y');
      activeGlass.style.removeProperty('--mouse-x');
      activeGlass.style.removeProperty('--mouse-y');
    }
    activeGlass = null; activeRect = null;
  }
  glassElements.forEach(element => {
    element.addEventListener('pointerenter', () => {
      if (!canPoint()) return;
      releaseGlass(); activeGlass = element;
      // One layout measurement per entry, never inside RAF or pointermove.
      activeRect = element.getBoundingClientRect();
      element.classList.toggle('is-tilting', element.hasAttribute('data-tilt'));
    });
    element.addEventListener('pointerleave', () => { if (activeGlass === element) releaseGlass(); });
  });
  window.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch' || !canPoint()) return;
    mouse.targetX = event.clientX; mouse.targetY = event.clientY; mouse.inside = true;
  }, { passive: true });
  document.addEventListener('pointerover', event => {
    lens.classList.toggle('is-active', canPoint() && !!event.target.closest('a,button,.cert,.project-visual'));
  }, { passive: true });
  root.addEventListener('pointerleave', () => { mouse.inside = false; lens.classList.remove('is-active'); releaseGlass(); });
  // Invalidate the cached hover rectangle on scroll; no layout read or section polling.
  window.addEventListener('scroll', releaseGlass, { passive: true });
  function updatePointer(time, dt) {
    if (!canPoint()) return;
    const factor = 1 - Math.pow(.92, dt * 60);
    const dx = (mouse.targetX - mouse.currentX) * factor;
    const dy = (mouse.targetY - mouse.currentY) * factor;
    mouse.currentX += dx; mouse.currentY += dy;
    mouse.velocityX = dx; mouse.velocityY = dy;
    mouse.energy += (Math.min(1, Math.hypot(dx, dy) / 18) - mouse.energy) * .08;
    if (Math.abs(dx) + Math.abs(dy) < .025 && !activeGlass) return;
    lens.style.transform = `translate3d(${mouse.currentX.toFixed(2)}px,${mouse.currentY.toFixed(2)}px,0)`;
    // Optical backgrounds are intentionally capped at 30 updates/sec; parallax remains smooth.
    if (state.heroVisible) {
      heroScene.style.setProperty('--mouse-x-normalized', ((mouse.currentX / AirflowCanvas.width - .5) * 2).toFixed(3));
      heroScene.style.setProperty('--mouse-y-normalized', ((mouse.currentY / AirflowCanvas.height - .5) * 2).toFixed(3));
    }
    if (activeGlass && activeRect && time - lastPointerWrite > 32) {
      lastPointerWrite = time;
      const x = clamp((mouse.currentX - activeRect.left) / activeRect.width, 0, 1);
      const y = clamp((mouse.currentY - activeRect.top) / activeRect.height, 0, 1);
      activeGlass.style.setProperty('--mouse-x', `${(x * 100).toFixed(1)}%`);
      activeGlass.style.setProperty('--mouse-y', `${(y * 100).toFixed(1)}%`);
      if (activeGlass.hasAttribute('data-tilt')) {
        activeGlass.style.setProperty('--tilt-x', `${((.5-y)*5).toFixed(2)}deg`);
        activeGlass.style.setProperty('--tilt-y', `${((x-.5)*5).toFixed(2)}deg`);
      }
    }
  }

  // AirflowCanvas. Streamlines represent a field, never cursor-following particles.
  // All dimensions, paints and line parameters are cached outside the rendering loop.
  const canvas = $('#aero-flow');
  let context = null;
  try { context = canvas.getContext('2d', { alpha: true }); } catch (_) { canvas.hidden = true; }
  const AirflowCanvas = {
    width: innerWidth, height: innerHeight, dpr: 1, lanes: [], paint: null, flightPaint: null,
    flowDirection: 0, quiet: 1, convergence: 0, lastDraw: 0,
    resize() {
      this.width = innerWidth; this.height = innerHeight;
      this.dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(this.width * this.dpr); canvas.height = Math.round(this.height * this.dpr);
      const count = desktop.matches ? clamp(Math.round(this.width / 65), 16, 25) : 8;
      this.lanes = Array.from({ length: count }, (_, index) => ({ y: (index + .5) / count, phase: index * .57, bend: (index - count / 2) / count }));
      if (context) context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.palette(); this.draw(0, true);
    },
    palette() {
      if (!context) return;
      const light = root.dataset.theme === 'light';
      const rgb = light ? '47,91,112' : '157,208,229';
      this.paint = context.createLinearGradient(0, 0, this.width, 0);
      this.paint.addColorStop(0, `rgba(${rgb},.012)`);
      this.paint.addColorStop(.4, `rgba(${rgb},.07)`);
      this.paint.addColorStop(.78, `rgba(${rgb},.14)`);
      this.paint.addColorStop(1, `rgba(${rgb},.012)`);
      this.flightPaint = light ? 'rgba(51,96,119,.16)' : 'rgba(174,224,244,.2)';
    },
    draw(time, force = false) {
      if (!context) return;
      // Mobile draws at 30Hz with 60-68% fewer lanes. Desktop targets the display RAF.
      if (!force && !desktop.matches && time - this.lastDraw < 32) return;
      this.lastDraw = time;
      const w = this.width, h = this.height;
      this.flowDirection += ((state.zone === 'projects' ? 0 : .045) - this.flowDirection) * .018;
      this.quiet += ((state.zone === 'education' ? .4 : 1) - this.quiet) * .018;
      this.convergence += ((state.zone === 'contact' ? .73 : 0) - this.convergence) * .018;
      context.clearRect(0, 0, w, h);
      context.lineWidth = .7; context.strokeStyle = this.paint; context.globalAlpha = this.quiet;
      const pointer = canPoint() && mouse.inside;
      for (const lane of this.lanes) {
        context.beginPath();
        for (let x = -30; x <= w + 30; x += 28) {
          const p = x / w;
          const wing = Math.exp(-Math.pow((p - .65) * 4, 2));
          let y = lane.y * h + wing * lane.bend * h * .19 + Math.sin(p * 6 + lane.phase - elapsed * .17) * 8;
          y += (p - .5) * h * this.flowDirection;
          y += (h * .32 - y) * Math.exp(-Math.pow((p-.43)*2.5, 2)) * this.convergence;
          if (pointer) {
            const dx = x - mouse.currentX, dy = y - mouse.currentY;
            const influence = Math.exp(-(dx*dx / 26000 + dy*dy / 18000));
            y += Math.tanh(dy / 45) * influence * (14 + mouse.energy * 22);
          }
          if (x === -30) context.moveTo(x, y); else context.lineTo(x, y);
        }
        context.stroke();
      }
      // One quiet curved flight path per 32 seconds; no fabricated flight telemetry.
      const cycle = elapsed % 32;
      if (desktop.matches && cycle > 21 && cycle < 31 && !reduced.matches) {
        const progress = (cycle - 21) / 10;
        const fade = Math.min(progress*5, (1-progress)*5, 1);
        context.globalAlpha = fade * this.quiet;
        context.strokeStyle = this.flightPaint; context.lineWidth = .8;
        context.beginPath();
        const end = w * progress;
        for (let x=0; x<=end; x+=8) {
          const y = h * .24 + Math.sin(x/w * 4.4) * h * .12;
          if (x === 0) context.moveTo(x,y); else context.lineTo(x,y);
        }
        context.stroke();
        const fy = h * .24 + Math.sin(progress * 4.4) * h * .12;
        context.save(); context.translate(end, fy); context.rotate(Math.atan(Math.cos(progress*4.4)*h*.12*4.4/w));
        context.beginPath();context.moveTo(7,0);context.lineTo(-5,-5);context.lineTo(-2,0);context.lineTo(-5,5);context.closePath();context.fillStyle=this.flightPaint;context.fill();context.restore();
      }
      context.globalAlpha = 1;
    }
  };

  // CounterController. Original text and accessible labels remain the source of truth.
  const counters = new Set();
  const counterRecords = new WeakMap();
  $$('[data-reveal="number"]').forEach(element => {
    const original = element.textContent;
    const match = original.match(/-?\d[\d,]*/);
    if (!match || original.includes('/')) return;
    counterRecords.set(element, { original, value: Number(match[0].replaceAll(',', '')), token: match[0], started: 0 });
    element.setAttribute('aria-label', original);
  });
  function startCounter(element) {
    const record = counterRecords.get(element);
    if (!record || record.started || !canMove()) return;
    record.started = performance.now(); counters.add(element); wake();
  }
  function updateCounters(time, finish = false) {
    for (const element of counters) {
      const record = counterRecords.get(element);
      const progress = finish ? 1 : clamp((time - record.started) / 850, 0, 1);
      const value = Math.round(record.value * (1 - Math.pow(1 - progress, 3)));
      element.textContent = progress === 1 ? record.original : record.original.replace(record.token, record.token.includes(',') ? value.toLocaleString('en-US') : String(value));
      if (progress === 1) counters.delete(element);
    }
  }

  // RevealController. One observer supports fade / slide / mask / stagger / number / label.
  const reveals = $$('[data-reveal]');
  // Observe the unmasked heading box; clip only its inner content.
  // Observing a fully clipped node can permanently prevent intersection notifications.
  reveals.filter(element => element.dataset.reveal === 'mask').forEach(element => {
    const content = document.createElement('span'); content.className = 'mask-content';
    content.append(...element.childNodes); element.append(content);
  });
  $$('.metric').forEach((element,index) => element.style.setProperty('--item',index));
  reveals.forEach(element => {
    element.style.setProperty('--reveal-delay', `${Number(element.dataset.delay) || 0}ms`);
    if (element.dataset.reveal === 'stagger') [...element.children].forEach((child,index) => child.style.setProperty('--item',index));
  });
  function reveal(element) {
    element.classList.add('visible');
    if (element.dataset.reveal === 'stagger') [...element.children].forEach(child => child.classList.add('visible'));
    if (element.dataset.reveal === 'number') startCounter(element);
  }
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { reveal(entry.target); observer.unobserve(entry.target); }
    }), { threshold: .1, rootMargin: '0px 0px -25px' });
    reveals.forEach(element => observer.observe(element));
    root.classList.add('reveal-ready');
  } else reveals.forEach(reveal);

  // NavigationController. Native anchors, observer-based progress, focus-managed mobile drawer.
  const nav = $('#nav-links'), menuToggle = $('#menu-toggle'), main = $('#content');
  const header = $('.site-nav'), progressNav = $('.flight-progress');
  const navLinks = $$('a', nav), progressLinks = $$('a', progressNav);
  const inertDuringMenu = [main, $('.brand'), $('#theme-toggle'), $('#motion-toggle'), progressNav];
  let menuOpen = false, savedOverflow = '';
  navLinks.forEach((link,index) => link.style.setProperty('--item',index));
  function setMenu(open, restore = true) {
    if (open && desktop.matches) return;
    if (open && !menuOpen) savedOverflow = document.body.style.overflow;
    menuOpen = open; root.classList.toggle('menu-open',open); nav.classList.toggle('open',open);
    menuToggle.setAttribute('aria-expanded',String(open)); menuToggle.setAttribute('aria-label',open?'关闭导航菜单':'打开导航菜单');
    nav.inert = !desktop.matches && !open;
    inertDuringMenu.forEach(element => { element.inert = open; });
    document.body.style.overflow = open ? 'hidden' : savedOverflow;
    if (open) navLinks[0].focus({preventScroll:true}); else if (restore) menuToggle.focus({preventScroll:true});
  }
  menuToggle.addEventListener('click',() => setMenu(!menuOpen));
  $('#menu-backdrop').addEventListener('click',() => setMenu(false));
  navLinks.forEach(link => link.addEventListener('click',() => {if(menuOpen) setMenu(false);}));
  nav.inert = !desktop.matches;
  document.addEventListener('keydown',event => {
    if (!menuOpen) return;
    if (event.key === 'Escape') {event.preventDefault();setMenu(false);}
    if (event.key === 'Tab') {
      const stops = [...navLinks,menuToggle], index = stops.indexOf(document.activeElement);
      event.preventDefault(); stops[(index + (event.shiftKey?-1:1) + stops.length) % stops.length].focus();
    }
  });
  function setZone(id) {
    state.zone = id; root.dataset.zone = id;
    const target = id === 'about' ? 'home' : id === 'creation' ? 'projects' : id === 'contact' ? 'education' : id;
    [...navLinks,...progressLinks].forEach(link => {
      const active = link.getAttribute('href') === `#${target}`;
      link.classList.toggle('active',active);
      if(active) link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');
    });
  }
  setZone('home');
  if ('IntersectionObserver' in window) {
    const zoneObserver = new IntersectionObserver(entries => entries.forEach(entry => {if(entry.isIntersecting)setZone(entry.target.id);}),{rootMargin:'-20% 0px -70% 0px',threshold:0});
    $$('main > section[id],main > footer[id]').forEach(section => zoneObserver.observe(section));
    new IntersectionObserver(entries => {header.classList.toggle('is-scrolled',!entries[0].isIntersecting);}).observe($('#nav-sentinel'));
    new IntersectionObserver(entries => {state.heroVisible = entries[0].isIntersecting;}).observe($('#home'));
  }

  // ProjectTabs. Retain outgoing content for the 480ms transition, then apply hidden/inert.
  const tabs = $$('.tab'), panels = $$('.project-panel');
  let currentTab = tabs[0], tabAnimations = [], transitionId = 0;
  panels.forEach((panel,index) => { panel.inert = index !== 0; panel.tabIndex = 0; });
  tabs.forEach((tab,index) => {tab.tabIndex=index===0?0:-1;});
  function selectTab(tab) {
    if (tab === currentTab) return;
    const generation = ++transitionId;
    tabAnimations.forEach(animation => animation.cancel()); tabAnimations=[];
    const outgoing = document.getElementById(currentTab.getAttribute('aria-controls'));
    const incoming = document.getElementById(tab.getAttribute('aria-controls'));
    panels.forEach(panel => {panel.classList.remove('is-outgoing');panel.hidden=panel!==outgoing&&panel!==incoming;panel.inert=panel!==incoming;});
    currentTab = tab;
    tabs.forEach(item => {const selected=item===tab;item.setAttribute('aria-selected',String(selected));item.tabIndex=selected?0:-1;});
    incoming.hidden=false; incoming.removeAttribute('aria-hidden'); outgoing.setAttribute('aria-hidden','true');
    releaseGlass();
    const finish = () => {if(generation!==transitionId)return;outgoing.hidden=true;outgoing.classList.remove('is-outgoing');tabAnimations.forEach(a=>a.cancel());tabAnimations=[];};
    if (reduced.matches || !incoming.animate) {finish();return;}
    outgoing.classList.add('is-outgoing');
    const options = {duration:480,easing:'cubic-bezier(.16,1,.3,1)',fill:'both'};
    tabAnimations = [outgoing.animate([{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(-12px)'}],options),incoming.animate([{opacity:0,transform:'translateY(18px)',clipPath:'inset(0 0 6%)'},{opacity:1,transform:'translateY(0)',clipPath:'inset(0)'}],options)];
    Promise.all(tabAnimations.map(animation=>animation.finished)).then(finish).catch(()=>{});
  }
  tabs.forEach(tab => {
    tab.addEventListener('click',()=>selectTab(tab));
    tab.addEventListener('keydown',event=>{
      const index=tabs.indexOf(tab);let next;
      if(event.key==='ArrowRight')next=(index+1)%tabs.length;
      if(event.key==='ArrowLeft')next=(index-1+tabs.length)%tabs.length;
      if(event.key==='Home')next=0;if(event.key==='End')next=tabs.length-1;
      if(next!==undefined){event.preventDefault();tabs[next].focus();selectTab(tabs[next]);}
    });
  });

  // CertificateViewer. Native modal focus trap + ESC, backdrop and animated close.
  const viewer=$('#viewer'),viewerImage=$('#viewer-image'),viewerBody=$('.dialog-body',viewer);
  let certificateTrigger=null,closeTimer=0,dialogOverflow='';
  function openCertificate(figure) {
    const image=$('img',figure);certificateTrigger=figure;clearTimeout(closeTimer);
    if(typeof viewer.showModal!=='function'){window.open(image.src,'_blank','noopener');return;}
    viewer.classList.remove('is-closing');viewerBody.classList.remove('is-error');viewerImage.hidden=false;
    viewerImage.src=image.src;viewerImage.alt=image.alt;$('#viewer-title').textContent=figure.dataset.title;
    dialogOverflow=document.body.style.overflow;document.body.style.overflow='hidden';viewer.showModal();$('#viewer-close').focus();
  }
  function closeCertificate() {
    if(!viewer.open || viewer.classList.contains('is-closing'))return;
    const finish=()=>{viewer.close();viewer.classList.remove('is-closing');};
    if(reduced.matches){finish();return;}viewer.classList.add('is-closing');closeTimer=setTimeout(finish,250);
  }
  viewer.addEventListener('close',()=>{document.body.style.overflow=dialogOverflow;certificateTrigger?.focus({preventScroll:true});});
  $$('.cert').forEach(figure=>{
    figure.addEventListener('click',()=>openCertificate(figure));
    figure.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openCertificate(figure);}});
  });
  $('#viewer-close').addEventListener('click',closeCertificate);
  viewer.addEventListener('cancel',event=>{event.preventDefault();closeCertificate();});
  let backdropDown=false;
  viewer.addEventListener('pointerdown',event=>{backdropDown=event.target===viewer;});
  viewer.addEventListener('click',event=>{if(event.target===viewer&&backdropDown)closeCertificate();});
  viewerImage.addEventListener('error',()=>{viewerBody.classList.add('is-error');viewerImage.hidden=true;});

  // Theme, contacts and resilient image states.
  const themeButton=$('#theme-toggle'),motionButton=$('#motion-toggle');
  function syncTheme() {
    const light=root.dataset.theme==='light';const label=light?'切换到深色主题':'切换到浅色主题';
    $('i',themeButton).className=light?'ph ph-moon':'ph ph-sun';themeButton.title=label;themeButton.setAttribute('aria-label',label);
    $('meta[name="theme-color"]').content=light?'#EAF0F2':'#050B10';
    AirflowCanvas.palette();AirflowCanvas.draw(performance.now(),true);
  }
  themeButton.addEventListener('click',()=>{root.dataset.theme=root.dataset.theme==='light'?'dark':'light';storage.set('lh-aviation-theme',root.dataset.theme);syncTheme();});
  const toast=$('#toast');let toastTimer=0;
  function showToast(text){toast.textContent=text;toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('show'),2600);}
  async function copy(value) {
    try {await navigator.clipboard.writeText(value);showToast('已复制：'+value);return;} catch(_) { /* Local-file and denied clipboard fallback. */ }
    const prior=document.activeElement,field=document.createElement('textarea');field.value=value;field.style.cssText='position:fixed;opacity:0;left:0;top:0';document.body.append(field);field.select();
    let copied=false;try {copied=document.execCommand('copy');}catch(_){}field.remove();prior?.focus({preventScroll:true});
    showToast(copied?'已复制：'+value:'复制未成功，请手动记录：'+value);
  }
  $('.copy-email').addEventListener('click',()=>copy('2231619599@qq.com'));
  $$('[data-copy]').forEach(button=>button.addEventListener('click',()=>copy(button.dataset.copy)));
  $$('.project-visual img,.creation-media img,.cert img').forEach(image=>{
    const error=()=>image.parentElement.classList.add('is-error');image.addEventListener('error',error);if(image.complete&&!image.naturalWidth)error();
  });

  // MotionController. One shared scheduler; storage, system preference and visibility compose.
  function animate(time) {
    frame=0;
    if(!canMove())return;
    // High-refresh and headless displays may issue >240 RAF callbacks/sec. Cap visual work.
    if(previousTime && time-previousTime<15){frame=requestAnimationFrame(animate);return;}
    const dt=Math.min((time-(previousTime||time))/1000,.04);previousTime=time;elapsed+=dt;
    updatePointer(time,dt);AirflowCanvas.draw(time);updateCounters(time);
    if(context || canPoint() || counters.size) frame=requestAnimationFrame(animate);
  }
  function wake(){if(!frame&&canMove())frame=requestAnimationFrame(animate);}
  function synchronize() {
    cancelAnimationFrame(frame);frame=0;previousTime=0;
    root.classList.toggle('motion-paused',state.paused);root.classList.toggle('motion-reduced',reduced.matches);root.classList.toggle('page-hidden',document.hidden);
    const stopped=state.paused||reduced.matches;
    motionButton.setAttribute('aria-pressed',String(stopped));
    const label=reduced.matches?'系统已开启减少动态效果':state.paused?'播放背景动效':'暂停背景动效';
    motionButton.setAttribute('aria-label',label);motionButton.title=label;
    $('i',motionButton).className=stopped?'ph ph-play':'ph ph-pause';
    if(!canMove()) {
      releaseGlass();lens.classList.remove('is-active');updateCounters(performance.now(),true);
      heroScene.style.setProperty('--mouse-x-normalized','0');heroScene.style.setProperty('--mouse-y-normalized','0');
      if(!document.hidden)AirflowCanvas.draw(performance.now(),true);
    } else wake();
  }
  motionButton.addEventListener('click',()=>{
    if(reduced.matches){showToast('已遵循系统“减少动态效果”设置，环境动效保持关闭。');return;}
    state.paused=!state.paused;storage.set('lh-aviation-motion',state.paused?'paused':'playing');synchronize();
  });
  reduced.addEventListener('change',synchronize);
  document.addEventListener('visibilitychange',synchronize);
  desktop.addEventListener('change',()=>{setMenu(false,false);releaseGlass();AirflowCanvas.resize();});
  fine.addEventListener('change',()=>{releaseGlass();lens.classList.remove('is-active');});
  let resizeFrame=0;
  window.addEventListener('resize',()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>{releaseGlass();sizeHero();AirflowCanvas.resize();});},{passive:true});
  window.addEventListener('pagehide',()=>{cancelAnimationFrame(frame);frame=0;});
  window.addEventListener('pageshow',synchronize);
  AirflowCanvas.resize();syncTheme();synchronize();
})();
