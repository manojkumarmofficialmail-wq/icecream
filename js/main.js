/* KALIX Ice Cream — site behaviour. No dependencies. */
(function () {
  'use strict';

  /* ------------------------------------------------------------------
     Config — point these at your real services before launch.
     Leave empty to keep the site fully static (forms show a notice).
     ------------------------------------------------------------------ */
  var CONFIG = {
    newsletterEndpoint: '',   // e.g. 'https://api.example.com/subscribe' — receives POST {email}
    // Where Cash-on-Delivery orders are sent. Set at least one before launch:
    orderEndpoint: '',        // e.g. a Formspree / Google Apps Script / your API URL — receives POST JSON order
    whatsappNumber: '919744758625', // country code + number, digits only — orders are confirmed on this WhatsApp
    freeDeliveryThreshold: 999,
    deliveryFee: 49,          // charged below the free-delivery threshold
    serviceablePincodePrefix: '560', // Bengaluru; set '' to accept any 6-digit pincode
    customerKey: 'kalix.customer.v1',
    ordersKey: 'kalix.orders.v1',
    scoopPrice: 149,
    maxScoops: 3,
    storageKey: 'kalix.cart.v1'
  };

  var CATALOG = {
    ube:        { name: 'Ube Cloud',           price: 449, cats: ['creamy', 'vegan'],  img: 'assets/img/pint-ube-cloud.webp',            bg: '#EEE5F6' },
    pistachio:  { name: 'Pistachio Rose',      price: 449, cats: ['creamy'],           img: 'assets/img/pint-pistachio-rose.webp',       bg: '#EAF0DE' },
    mango:      { name: 'Mango Chili Pop',     price: 449, cats: ['fruity', 'vegan'],  img: 'assets/img/pint-mango-chili-pop.webp',      bg: '#F8E5CC' },
    blackberry: { name: 'Midnight Blackberry', price: 449, cats: ['fruity', 'creamy'], img: 'assets/img/pint-midnight-blackberry.webp',  bg: '#EBDDF1' },
    jaggery:    { name: 'Salted Jaggery',      price: 449, cats: ['creamy'],           img: 'assets/img/pint-salted-jaggery.webp',       bg: '#F3E6D6' },
    strawberry: { name: 'Strawberry Lychee',   price: 449, cats: ['fruity', 'vegan'],  img: 'assets/img/pint-strawberry-lychee.webp',    bg: '#FBE1E6' }
  };
  // Order shown in the cone builder (matches the design).
  var CONE_ORDER = ['ube', 'mango', 'pistachio', 'jaggery', 'blackberry', 'strawberry'];

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var inr = function (n) { return '₹' + n.toLocaleString('en-IN'); };
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') node.textContent = attrs[k];
      else if (k === 'on') Object.keys(attrs.on).forEach(function (ev) { node.addEventListener(ev, attrs.on[ev]); });
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return node;
  }

  /* ==================================================================
     Cart store (persisted to localStorage)
     ================================================================== */
  var cart = load();

  function load() {
    try {
      var raw = JSON.parse(localStorage.getItem(CONFIG.storageKey));
      if (raw && typeof raw === 'object') {
        var pints = {};
        Object.keys(raw.pints || {}).forEach(function (id) {
          var q = parseInt(raw.pints[id], 10);
          if (CATALOG[id] && q > 0) pints[id] = Math.min(q, 99);
        });
        var cones = (Array.isArray(raw.cones) ? raw.cones : []).filter(function (c) {
          return c && Array.isArray(c.scoops) && c.scoops.length && c.scoops.every(function (s) { return CATALOG[s]; }) && c.qty > 0;
        });
        return { pints: pints, cones: cones };
      }
    } catch (e) { /* storage unavailable or corrupt — start fresh */ }
    return { pints: {}, cones: [] };
  }
  function save() {
    try { localStorage.setItem(CONFIG.storageKey, JSON.stringify(cart)); } catch (e) { /* ignore */ }
  }
  function coneKey(scoops) { return scoops.join('+'); }
  function count() {
    var n = 0;
    Object.keys(cart.pints).forEach(function (id) { n += cart.pints[id]; });
    cart.cones.forEach(function (c) { n += c.qty; });
    return n;
  }
  function subtotal() {
    var t = 0;
    Object.keys(cart.pints).forEach(function (id) { t += cart.pints[id] * CATALOG[id].price; });
    cart.cones.forEach(function (c) { t += c.qty * c.scoops.length * CONFIG.scoopPrice; });
    return t;
  }
  function setPint(id, qty) {
    qty = Math.max(0, Math.min(99, qty));
    if (qty === 0) delete cart.pints[id]; else cart.pints[id] = qty;
    commit();
  }
  function addCone(scoops) {
    var key = coneKey(scoops);
    var hit = cart.cones.filter(function (c) { return coneKey(c.scoops) === key; })[0];
    if (hit) hit.qty += 1; else cart.cones.push({ scoops: scoops.slice(), qty: 1 });
    commit();
  }
  function setCone(key, qty) {
    cart.cones = cart.cones
      .map(function (c) { return coneKey(c.scoops) === key ? { scoops: c.scoops, qty: qty } : c; })
      .filter(function (c) { return c.qty > 0; });
    commit();
  }
  function commit() { save(); renderAll(); }

  // Keep tabs in sync.
  window.addEventListener('storage', function (e) {
    if (e.key === CONFIG.storageKey) { cart = load(); renderAll(); }
  });

  /* ==================================================================
     Header: sticky shadow, mobile menu, active link
     ================================================================== */
  var header = $('.header');
  var progressBar = $('[data-progress]');
  var parallaxEls = reduceMotion ? [] : $$('[data-parallax]');
  var lastY = window.scrollY;
  var ticking = false;

  function onScrollFrame() {
    ticking = false;
    var y = window.scrollY;
    var vh = window.innerHeight;
    header.classList.toggle('is-scrolled', y > 8);

    // Hide the header while scrolling down, reveal it when scrolling up.
    var drawerOpen = drawer && !drawer.hidden;
    var menuOpen = menu && !menu.hidden;
    if (!reduceMotion && !drawerOpen && !menuOpen && Math.abs(y - lastY) > 6) {
      header.classList.toggle('is-hidden', y > lastY && y > 420);
    }
    if (y < 120) header.classList.remove('is-hidden');
    lastY = y;

    var max = document.documentElement.scrollHeight - vh;
    progressBar.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, y / max) : 0) + ')';

    // Parallax uses the independent `translate` property so it never fights CSS animations.
    parallaxEls.forEach(function (node) {
      var r = node.getBoundingClientRect();
      if (r.bottom < -200 || r.top > vh + 200) return;
      var speed = parseFloat(node.getAttribute('data-parallax')) || 0;
      var offset = (r.top + r.height / 2 - vh / 2) * speed;
      node.style.translate = '0 ' + offset.toFixed(1) + 'px';
    });
  }
  function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(onScrollFrame); } }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  // Focusing anything inside the header should always bring it back.
  header.addEventListener('focusin', function () { header.classList.remove('is-hidden'); });

  var menuBtn = $('.menu-btn');
  var menu = $('#mobile-menu');
  function setMenu(open) {
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    menu.hidden = !open;
  }
  menuBtn.addEventListener('click', function () { setMenu(menu.hidden); });
  $$('a', menu).forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });
  window.matchMedia('(min-width: 1101px)').addEventListener('change', function (mq) { if (mq.matches) setMenu(false); });

  if ('IntersectionObserver' in window) {
    var navLinks = $$('.nav-links .nav-link');
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        navLinks.forEach(function (a) {
          if (a.getAttribute('href') === '#' + en.target.id) a.setAttribute('aria-current', 'true');
          else a.removeAttribute('aria-current');
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    ['shop', 'build', 'story', 'party', 'find'].forEach(function (id) { var s = document.getElementById(id); if (s) spy.observe(s); });
  }

  /* ==================================================================
     Hero carousel — autoplay driven by the dot's CSS fill animation,
     so hover / focus / off-screen pausing is just animation-play-state.
     ================================================================== */
  (function heroCarousel() {
    var hero = $('[data-carousel]');
    if (!hero) return;
    var slidesBox = $('[data-slides]', hero);
    var slides = $$('.slide', hero);
    var dots = $$('.hero-dot', hero);
    var pauseBtn = $('[data-hero-pause]', hero);
    var INTERVAL = 6500;
    var index = 0;
    var stopped = false;
    var leaveTimers = [];
    hero.style.setProperty('--hero-interval', INTERVAL + 'ms');

    function apply() {
      var s = slides[index];
      slides.forEach(function (sl, k) {
        var on = k === index;
        sl.classList.toggle('is-active', on);
        sl.setAttribute('aria-hidden', String(!on));
        sl.inert = !on;
        if (on) sl.classList.remove('is-leaving');
      });
      dots.forEach(function (d, k) {
        d.classList.remove('is-active');
        d.classList.toggle('is-done', k < index);
        if (k === index) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current');
      });
      void dots[index].offsetWidth; // restart the fill animation
      dots[index].classList.add('is-active');
      hero.style.setProperty('--hero-bg', s.getAttribute('data-bg'));
      hero.style.setProperty('--hero-ink', s.getAttribute('data-ink'));
      hero.classList.toggle('is-dark', s.classList.contains('slide--dark'));
      $('[data-hero-current]', hero).textContent = ('0' + (index + 1)).slice(-2);
    }

    function go(i, dir) {
      i = (i + slides.length) % slides.length;
      if (i === index) return;
      var prev = slides[index];
      slidesBox.classList.toggle('is-back', dir < 0);
      if (!reduceMotion) {
        prev.classList.add('is-leaving');
        leaveTimers.push(setTimeout(function () { prev.classList.remove('is-leaving'); }, 650));
      }
      index = i;
      apply();
    }

    function setStopped(v) {
      stopped = v;
      hero.classList.toggle('is-stopped', v);
      pauseBtn.setAttribute('aria-label', v ? 'Play slideshow' : 'Pause slideshow');
      // Announce slide changes only when the user is in control.
      slidesBox.setAttribute('aria-live', v ? 'polite' : 'off');
      if (!v) apply(); // restart the timer for the current slide
    }

    dots.forEach(function (d, k) {
      d.addEventListener('click', function () { go(k, k > index ? 1 : -1); });
      $('.fill', d).addEventListener('animationend', function (e) {
        if (e.animationName === 'dotFill' && !stopped && d.classList.contains('is-active')) go(index + 1, 1);
      });
    });
    $('[data-hero-prev]', hero).addEventListener('click', function () { go(index - 1, -1); });
    $('[data-hero-next]', hero).addEventListener('click', function () { go(index + 1, 1); });
    pauseBtn.addEventListener('click', function () { setStopped(!stopped); });

    // Pause while the visitor is looking at / interacting with it.
    hero.addEventListener('mouseenter', function () { hero.classList.add('is-hover'); });
    hero.addEventListener('mouseleave', function () { hero.classList.remove('is-hover'); });
    hero.addEventListener('focusin', function () { hero.classList.add('is-hover'); });
    hero.addEventListener('focusout', function (e) { if (!hero.contains(e.relatedTarget)) hero.classList.remove('is-hover'); });
    document.addEventListener('visibilitychange', function () { hero.classList.toggle('is-paused', document.hidden); });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) { hero.classList.toggle('is-offscreen', !en[0].isIntersecting); }, { threshold: 0.25 }).observe(hero);
    }

    // Keyboard: arrow keys when focus is on the carousel controls.
    $('.hero-ui', hero).addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(index + 1, 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(index - 1, -1); }
    });

    // Swipe on touch screens.
    var sx = null, sy = null;
    slidesBox.addEventListener('pointerdown', function (e) { if (e.pointerType !== 'mouse') { sx = e.clientX; sy = e.clientY; } });
    slidesBox.addEventListener('pointerup', function (e) {
      if (sx === null) return;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      sx = sy = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.2) go(index + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
    });
    slidesBox.addEventListener('pointercancel', function () { sx = sy = null; });

    // "Add to cart" buttons inside slides.
    $$('[data-hero-add]', hero).forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-hero-add');
        flyToCart($('.hero-img img', b.closest('.slide')));
        setPint(id, (cart.pints[id] || 0) + 1);
        toast(CATALOG[id].name + ' added to cart');
      });
    });

    if (reduceMotion) setStopped(true);
    apply();
  })();

  /* ==================================================================
     Shop: filters + add to cart controls
     ================================================================== */
  var currentFilter = 'all';
  var filterNote = $('[data-filter-note]');
  $$('.tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      currentFilter = tab.getAttribute('data-filter');
      $$('.tab').forEach(function (t) { t.setAttribute('aria-pressed', String(t === tab)); });
      var shown = 0;
      $$('[data-product]').forEach(function (card) {
        var on = currentFilter === 'all' || card.getAttribute('data-cats').split(' ').indexOf(currentFilter) > -1;
        card.classList.toggle('is-filtered', !on);
        card.classList.remove('is-entering');
        if (on) {
          if (!reduceMotion) {
            card.style.setProperty('--n', shown);
            void card.offsetWidth; // restart the animation
            card.classList.add('is-entering');
          }
          shown++;
        }
      });
      filterNote.textContent = currentFilter === 'all'
        ? 'All 6 flavors · 500 ml pints · ₹449 each'
        : 'Showing ' + shown + ' ' + currentFilter + ' flavors';
    });
  });

  function renderCards() {
    $$('[data-product]').forEach(function (card) {
      var id = card.getAttribute('data-product');
      var name = CATALOG[id].name;
      var q = cart.pints[id] || 0;
      var slot = $('.card-act', card);
      var hadFocus = slot.contains(document.activeElement) ? document.activeElement.getAttribute('data-act') : null;
      slot.textContent = '';
      if (q === 0) {
        slot.appendChild(el('button', {
          class: 'add', type: 'button', 'data-act': 'add', 'aria-label': 'Add ' + name + ' to cart',
          on: { click: function () { flyToCart($('.card-art img', card)); setPint(id, 1); toast(name + ' added to cart'); } }
        }, ['Add to cart ', el('span', { 'aria-hidden': 'true', text: '+' })]));
      } else {
        slot.appendChild(el('div', { class: 'qty' }, [
          el('button', { class: 'qbtn', type: 'button', 'data-act': 'dec', 'aria-label': 'Remove one ' + name, text: '−', on: { click: function () { setPint(id, q - 1); } } }),
          el('span', { class: 'qty-label', 'aria-live': 'polite', text: q + ' in cart' }),
          el('button', { class: 'qbtn', type: 'button', 'data-act': 'inc', 'aria-label': 'Add one more ' + name, text: '+', on: { click: function () { flyToCart($('.card-art img', card)); setPint(id, q + 1); } } })
        ]));
      }
      // Keep keyboard focus stable across re-renders.
      if (hadFocus) {
        var target = $('[data-act="' + hadFocus + '"]', slot) || $('button', slot);
        if (target) target.focus();
      }
    });
  }

  /* ==================================================================
     Build a cone
     ================================================================== */
  var scoops = ['ube', 'strawberry', 'pistachio'];
  var flavorsBox = $('[data-flavors]');
  var flavorBtns = {};
  CONE_ORDER.forEach(function (id) {
    var f = CATALOG[id];
    var btn = el('button', { class: 'flavor', type: 'button', 'aria-pressed': 'false', on: { click: function () { toggleScoop(id); } } }, [
      el('span', { class: 'thumb', style: 'background:' + f.bg }, [el('img', { src: f.img, width: '760', height: '760', alt: '', loading: 'lazy', decoding: 'async' })]),
      el('span', { class: 'flavor-name', text: f.name }),
      el('span', { class: 'tick', 'aria-hidden': 'true' })
    ]);
    flavorBtns[id] = btn;
    flavorsBox.appendChild(btn);
  });
  var coneAdded = $('[data-cone-added]');

  function toggleScoop(id) {
    var i = scoops.indexOf(id);
    if (i > -1) scoops.splice(i, 1);
    else if (scoops.length < CONFIG.maxScoops) {
      scoops.push(id);
      var btn = flavorBtns[id];
      btn.classList.remove('is-pop'); void btn.offsetWidth; btn.classList.add('is-pop');
    }
    coneAdded.hidden = true;
    renderCone();
  }
  $('[data-cone-undo]').addEventListener('click', function () { scoops.pop(); coneAdded.hidden = true; renderCone(); });
  $('[data-cone-clear]').addEventListener('click', function () { scoops = []; coneAdded.hidden = true; renderCone(); });
  $('[data-cone-add]').addEventListener('click', function () {
    if (!scoops.length) return;
    flyToCart($('.cone img'));
    addCone(scoops);
    coneAdded.textContent = 'Cone added. Your cart has ' + count() + (count() === 1 ? ' item.' : ' items.');
    coneAdded.hidden = false;
    toast('Cone added to cart');
  });

  function renderCone() {
    var n = scoops.length;
    var full = n >= CONFIG.maxScoops;
    var empty = n === 0;
    CONE_ORDER.forEach(function (id) {
      var btn = flavorBtns[id];
      var pos = scoops.indexOf(id);
      var on = pos > -1;
      btn.setAttribute('aria-pressed', String(on));
      btn.disabled = full && !on;
      $('.tick', btn).textContent = on ? String(pos + 1) : '';
    });
    var head = $('[data-cone-head]');
    var headText = empty ? 'No scoops yet' : n + (n === 1 ? ' scoop' : ' scoops') + ' · ' + inr(n * CONFIG.scoopPrice);
    if (head.textContent !== headText && !reduceMotion) {
      head.classList.remove('is-flash'); void head.offsetWidth; head.classList.add('is-flash');
    }
    head.textContent = headText;
    $('[data-cone-names]').textContent = empty ? 'Pick up to three flavors.' : scoops.map(function (id, i) { return (i + 1) + '. ' + CATALOG[id].name; }).join('   ');
    $('[data-limit-note]').textContent = full
      ? 'Three scoops is the max. Tap a picked flavor to swap it out.'
      : (empty ? '' : inr(CONFIG.scoopPrice) + ' per scoop · ' + (CONFIG.maxScoops - n) + ' more to go');
    ['[data-cone-undo]', '[data-cone-clear]', '[data-cone-add]'].forEach(function (s) { $(s).disabled = empty; });
  }

  /* ==================================================================
     Find us: search + store selection + map pins
     ================================================================== */
  var storeItems = $$('[data-store]');
  var storeNote = $('[data-store-note]');
  var mapEl = $('[data-map]');
  var selectedStore = 'indiranagar';

  function selectStore(id) {
    selectedStore = id;
    storeItems.forEach(function (li) { $('button', li).setAttribute('aria-pressed', String(li.getAttribute('data-store') === id)); });
    $$('[data-pin]').forEach(function (p) { p.classList.toggle('is-active', p.getAttribute('data-pin') === id); });
    var li = storeItems.filter(function (x) { return x.getAttribute('data-store') === id; })[0];
    mapEl.setAttribute('aria-label', 'Map of four KALIX scoop bars in Bengaluru. Selected: ' + $('.store-name', li).textContent + ', ' + $('[data-area]', li).textContent);
  }
  storeItems.forEach(function (li) {
    $('button', li).addEventListener('click', function () { selectStore(li.getAttribute('data-store')); });
  });

  var whereInput = $('#where');
  function filterStores() {
    var raw = whereInput.value.trim();
    var q = raw.toLowerCase();
    var matches = storeItems.filter(function (li) {
      return !q || ($('.store-name', li).textContent + ' ' + $('[data-area]', li).textContent).toLowerCase().indexOf(q) > -1;
    });
    var none = !!q && matches.length === 0;
    var visible = none ? storeItems : matches;
    storeItems.forEach(function (li) { li.hidden = visible.indexOf(li) === -1; });
    storeNote.textContent = none
      ? 'No scoop bar matches “' + raw + '” yet. Here are all four.'
      : (q ? matches.length + ' match' + (matches.length === 1 ? '' : 'es') + ' for “' + raw + '”' : '4 scoop bars in Bengaluru');
    var stillVisible = visible.some(function (li) { return li.getAttribute('data-store') === selectedStore; });
    if (!stillVisible) selectStore(visible[0].getAttribute('data-store'));
  }
  whereInput.addEventListener('input', filterStores);
  $('[data-find-form]').addEventListener('submit', function (e) { e.preventDefault(); filterStores(); });

  /* ==================================================================
     Newsletter
     ================================================================== */
  var newsForm = $('[data-news-form]');
  var newsNote = $('[data-news-note]');
  var emailInput = $('#email');
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function setNews(msg, isError) {
    newsNote.textContent = msg;
    newsNote.classList.toggle('is-error', !!isError);
    $('.field', newsForm).classList.toggle('is-invalid', !!isError);
    emailInput.setAttribute('aria-invalid', isError ? 'true' : 'false');
  }
  emailInput.addEventListener('input', function () { if (newsNote.textContent) setNews('', false); });
  newsForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var v = emailInput.value.trim();
    if (!EMAIL_RE.test(v)) { setNews('Please enter a valid email address.', true); emailInput.focus(); return; }
    var btn = $('button[type="submit"]', newsForm);
    if (!CONFIG.newsletterEndpoint) {
      setNews('Thanks! Sign-ups open soon — we’ll be in touch.', false);
      newsForm.reset();
      return;
    }
    btn.disabled = true;
    fetch(CONFIG.newsletterEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: v })
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      setNews('Thanks! You’re on the list for fresh drops.', false);
      newsForm.reset();
    }).catch(function () {
      setNews('Something went wrong. Please try again in a moment.', true);
    }).then(function () { btn.disabled = false; });
  });

  /* ==================================================================
     Cart drawer (focus-trapped dialog) with 3 views:
     cart → checkout (delivery details, Cash on Delivery) → done
     ================================================================== */
  var drawer = $('#cart');
  var scrim = $('[data-scrim]');
  var openBtn = $('#cart-open');
  var lastFocus = null;
  var closeTimer = null;
  var currentView = 'cart';

  function openCart(view) {
    clearTimeout(closeTimer); // a pending close must never hide a freshly opened drawer
    if (drawer.hidden) lastFocus = document.activeElement;
    setMenu(false);
    showView(view === 'checkout' && count() ? 'checkout' : (currentView === 'done' ? 'done' : 'cart'), true);
    drawer.hidden = false;
    scrim.hidden = false;
    document.body.classList.add('is-locked');
    void drawer.offsetWidth; // flush styles so the slide-in transition runs
    requestAnimationFrame(function () {
      drawer.classList.add('is-open');
      scrim.classList.add('is-open');
      $('[data-cart-close]', drawer).focus();
    });
  }
  function closeCart() {
    if (drawer.hidden) return;
    drawer.classList.remove('is-open');
    scrim.classList.remove('is-open');
    document.body.classList.remove('is-locked');
    clearTimeout(closeTimer);
    var done = function () {
      drawer.hidden = true;
      scrim.hidden = true;
      if (currentView === 'done') showView('cart', true); // next open starts fresh
    };
    if (reduceMotion) done(); else closeTimer = setTimeout(done, 320);
    if (lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus();
  }
  openBtn.addEventListener('click', function () { openCart(); });
  scrim.addEventListener('click', closeCart);
  $$('[data-cart-close]').forEach(function (b) { b.addEventListener('click', closeCart); });

  var TITLES = { cart: 'Your cart', checkout: 'Delivery details', done: 'Your order' };
  var STEP = { cart: 0, checkout: 1, done: 2 };
  function showView(name, silent) {
    currentView = name;
    $$('[data-view]', drawer).forEach(function (v) {
      var on = v.getAttribute('data-view') === name;
      v.hidden = !on;
      if (on && !silent && !reduceMotion) { v.classList.remove('view-in'); void v.offsetWidth; v.classList.add('view-in'); }
    });
    $('[data-drawer-title]').textContent = TITLES[name];
    $('[data-back]').hidden = name !== 'checkout';
    $$('[data-steps] li').forEach(function (li, i) {
      li.classList.toggle('is-current', i === STEP[name]);
      li.classList.toggle('is-done', i < STEP[name]);
    });
    $('[data-drawer-title]').closest('.drawer').setAttribute('data-current', name);
    if (!silent) {
      var body = $('[data-view="' + name + '"] .drawer-body', drawer);
      if (body) body.scrollTop = 0;
      $('[data-drawer-title]').focus();
    }
  }
  $('[data-back]').addEventListener('click', function () { showView('cart'); });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (!drawer.hidden) closeCart();
      else if (!menu.hidden) { setMenu(false); menuBtn.focus(); }
    }
    if (e.key === 'Tab' && !drawer.hidden) {
      var f = $$('button:not([disabled]), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])', drawer).filter(function (n) { return n.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  function miniQty(label, qty, onChange) {
    return el('div', { class: 'mini-qty' }, [
      el('button', { type: 'button', 'aria-label': 'Decrease ' + label, text: '−', on: { click: function () { onChange(qty - 1); } } }),
      el('span', { 'aria-label': 'Quantity', text: String(qty) }),
      el('button', { type: 'button', 'aria-label': 'Increase ' + label, text: '+', on: { click: function () { onChange(qty + 1); } } })
    ]);
  }

  function deliveryFee(total) { return total === 0 || total >= CONFIG.freeDeliveryThreshold ? 0 : CONFIG.deliveryFee; }

  // A flat list of order lines used by the cart, summary and order payload.
  function orderLines() {
    var lines = [];
    Object.keys(cart.pints).forEach(function (id) {
      var p = CATALOG[id];
      lines.push({ type: 'pint', id: id, name: p.name + ' (500 ml)', qty: cart.pints[id], unit: p.price, total: p.price * cart.pints[id] });
    });
    cart.cones.forEach(function (c) {
      var unit = c.scoops.length * CONFIG.scoopPrice;
      lines.push({ type: 'cone', scoops: c.scoops.slice(), name: c.scoops.length + '-scoop cone: ' + c.scoops.map(function (s) { return CATALOG[s].name; }).join(', '), qty: c.qty, unit: unit, total: unit * c.qty });
    });
    return lines;
  }

  function renderDrawer() {
    var list = $('[data-cart-lines]');
    var activeLabel = drawer.contains(document.activeElement) ? document.activeElement.getAttribute('aria-label') : null;
    list.textContent = '';
    Object.keys(cart.pints).forEach(function (id) {
      var p = CATALOG[id], q = cart.pints[id];
      list.appendChild(el('li', { class: 'line' }, [
        el('div', { class: 'line-art', style: 'background:' + p.bg }, [el('img', { src: p.img, alt: '', width: '760', height: '760', loading: 'lazy' })]),
        el('div', {}, [
          el('p', { class: 'line-name', text: p.name }),
          el('p', { class: 'line-meta', text: '500 ml pint · ' + inr(p.price) }),
          miniQty(p.name, q, function (n) { setPint(id, n); })
        ]),
        el('div', {}, [
          el('p', { class: 'line-price', text: inr(p.price * q) }),
          el('button', { class: 'remove', type: 'button', 'aria-label': 'Remove ' + p.name, text: 'Remove', on: { click: function () { setPint(id, 0); } } })
        ])
      ]));
    });
    cart.cones.forEach(function (c) {
      var key = coneKey(c.scoops);
      var each = c.scoops.length * CONFIG.scoopPrice;
      var first = CATALOG[c.scoops[0]];
      var label = 'cone with ' + c.scoops.map(function (s) { return CATALOG[s].name; }).join(', ');
      list.appendChild(el('li', { class: 'line' }, [
        el('div', { class: 'line-art', style: 'background:' + first.bg }, [el('img', { src: 'assets/img/cone-three-scoops.webp', alt: '', width: '900', height: '1350', loading: 'lazy' })]),
        el('div', {}, [
          el('p', { class: 'line-name', text: c.scoops.length + '-scoop cone' }),
          el('p', { class: 'line-meta', text: c.scoops.map(function (s) { return CATALOG[s].name; }).join(' · ') }),
          miniQty(label, c.qty, function (n) { setCone(key, n); })
        ]),
        el('div', {}, [
          el('p', { class: 'line-price', text: inr(each * c.qty) }),
          el('button', { class: 'remove', type: 'button', 'aria-label': 'Remove ' + label, text: 'Remove', on: { click: function () { setCone(key, 0); } } })
        ])
      ]));
    });

    var n = count();
    var sub = subtotal();
    var fee = deliveryFee(sub);
    $('[data-cart-empty]').hidden = n > 0;
    $('[data-cart-foot]').hidden = n === 0;
    $$('[data-subtotal]').forEach(function (x) { x.textContent = inr(sub); });
    $$('[data-delivery]').forEach(function (x) { x.textContent = fee ? inr(fee) : 'Free'; });
    $$('[data-total]').forEach(function (x) { x.textContent = inr(sub + fee); });
    $('[data-place]').textContent = 'Place order · ' + inr(sub + fee);
    var left = CONFIG.freeDeliveryThreshold - sub;
    $('[data-ship-note]').textContent = left > 0
      ? 'Add ' + inr(left) + ' more for free cold delivery.'
      : 'You’ve unlocked free cold delivery.';
    $('[data-ship-bar]').style.width = Math.min(100, (sub / CONFIG.freeDeliveryThreshold) * 100) + '%';

    // Compact summary inside the checkout form.
    var mini = $('[data-mini-lines]');
    mini.textContent = '';
    orderLines().forEach(function (l) {
      mini.appendChild(el('li', {}, [el('span', { text: l.qty + ' × ' + l.name }), el('span', { text: inr(l.total) })]));
    });

    // Cart emptied while on the checkout step (e.g. from another tab) → back to cart.
    if (n === 0 && currentView === 'checkout') showView('cart', drawer.hidden);

    if (activeLabel) {
      var again = $$('[aria-label]', drawer).filter(function (b) { return b.getAttribute('aria-label') === activeLabel; })[0];
      (again || $('[data-cart-close]', drawer)).focus();
    }
  }

  /* ---------- Checkout (Cash on Delivery) ---------- */
  var form = $('[data-checkout-form]');
  var formAlert = $('[data-form-alert]');
  var slotSelect = $('[data-slots]');

  function buildSlots() {
    var now = new Date();
    var h = now.getHours();
    var opts = [];
    if (h >= 11 && h < 22) opts.push('As soon as possible (45–60 min)');
    if (h < 17) opts.push('Today, 5 pm – 8 pm');
    if (h < 20) opts.push('Today, 8 pm – 10:30 pm');
    opts.push('Tomorrow, 12 pm – 3 pm', 'Tomorrow, 5 pm – 8 pm', 'Tomorrow, 8 pm – 10:30 pm');
    slotSelect.textContent = '';
    opts.forEach(function (o) { slotSelect.appendChild(el('option', { value: o, text: o })); });
  }

  // Remember delivery details on this device for next time (convenience only).
  var CUSTOMER_FIELDS = ['name', 'phone', 'email', 'address', 'area', 'pincode', 'landmark'];
  function prefill() {
    try {
      var saved = JSON.parse(localStorage.getItem(CONFIG.customerKey)) || {};
      CUSTOMER_FIELDS.forEach(function (k) { if (saved[k] && !form.elements[k].value) form.elements[k].value = saved[k]; });
    } catch (e) { /* ignore */ }
  }

  $('[data-checkout]').addEventListener('click', function () {
    if (!count()) return;
    buildSlots();
    prefill();
    clearErrors();
    showView('checkout');
  });

  // Phone & pincode: digits only as you type.
  ['phone', 'pincode'].forEach(function (k) {
    form.elements[k].addEventListener('input', function () { this.value = this.value.replace(/\D/g, ''); });
  });
  $$('.f-input', form).forEach(function (inp) {
    inp.addEventListener('input', function () { setError(inp, ''); });
  });

  var ERR_ID = { name: 'co-name-err', phone: 'co-phone-err', email: 'co-email-err', address: 'co-address-err', area: 'co-area-err', pincode: 'co-pin-err' };
  function setError(input, msg) {
    var id = ERR_ID[input.name];
    if (!id) return;
    var p = document.getElementById(id);
    p.textContent = msg;
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    if (msg) input.setAttribute('aria-describedby', id); else input.removeAttribute('aria-describedby');
    input.closest('.f').classList.toggle('has-error', !!msg);
  }
  function clearErrors() {
    Object.keys(ERR_ID).forEach(function (k) { setError(form.elements[k], ''); });
    formAlert.hidden = true;
  }

  function validate() {
    var v = function (k) { return form.elements[k].value.trim(); };
    var errs = [];
    var check = function (k, ok, msg) { if (!ok) { setError(form.elements[k], msg); errs.push(form.elements[k]); } else setError(form.elements[k], ''); };
    check('name', v('name').length >= 2, 'Please enter your name.');
    check('phone', /^[6-9]\d{9}$/.test(v('phone')), 'Enter a valid 10-digit Indian mobile number.');
    check('email', !v('email') || EMAIL_RE.test(v('email')), 'Enter a valid email or leave it blank.');
    check('address', v('address').length >= 6, 'Please enter your house/flat and street.');
    check('area', v('area').length >= 2, 'Please enter your area.');
    var pin = v('pincode');
    var pinOk = /^\d{6}$/.test(pin);
    var served = !CONFIG.serviceablePincodePrefix || pin.indexOf(CONFIG.serviceablePincodePrefix) === 0;
    check('pincode', pinOk && served, !pinOk ? 'Enter a 6-digit pincode.' : 'Sorry, we only deliver within Bengaluru (560xxx) for now.');
    return errs;
  }

  function makeOrderId() {
    var d = new Date();
    var pad = function (x) { return String(x).padStart(2, '0'); };
    return 'KX-' + pad(d.getDate()) + pad(d.getMonth() + 1) + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
  }

  function whatsappText(order) {
    var c = order.customer;
    return [
      'New KALIX order ' + order.id + ' (Cash on Delivery)',
      '',
      order.items.map(function (l) { return '• ' + l.qty + ' × ' + l.name + ' — ' + inr(l.total); }).join('\n'),
      '',
      'Subtotal: ' + inr(order.subtotal),
      'Delivery: ' + (order.delivery ? inr(order.delivery) : 'Free'),
      'Total to pay (COD): ' + inr(order.total),
      '',
      'Name: ' + c.name,
      'Phone: +91 ' + c.phone,
      'Address: ' + c.address + ', ' + c.area + (c.landmark ? ' (near ' + c.landmark + ')' : '') + ', Bengaluru ' + c.pincode,
      'Time: ' + order.slot + (order.notes ? '\nNotes: ' + order.notes : '')
    ].join('\n');
  }

  function waLink(order) {
    return 'https://wa.me/' + CONFIG.whatsappNumber + '?text=' + encodeURIComponent(whatsappText(order));
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    formAlert.hidden = true;
    if (!count()) { showView('cart'); return; }
    var errs = validate();
    if (errs.length) {
      formAlert.textContent = 'Please fix the highlighted ' + (errs.length === 1 ? 'field' : errs.length + ' fields') + '.';
      formAlert.hidden = false;
      errs[0].focus();
      return;
    }

    var f = form.elements;
    var customer = {};
    CUSTOMER_FIELDS.forEach(function (k) { customer[k] = f[k].value.trim(); });
    var sub = subtotal();
    var fee = deliveryFee(sub);
    var order = {
      id: makeOrderId(),
      createdAt: new Date().toISOString(),
      payment: 'COD',
      items: orderLines(),
      subtotal: sub,
      delivery: fee,
      total: sub + fee,
      slot: f.slot.value,
      notes: f.notes.value.trim(),
      customer: customer
    };

    try { localStorage.setItem(CONFIG.customerKey, JSON.stringify(customer)); } catch (err) { /* ignore */ }

    // Open WhatsApp right away (inside the click, so it isn't treated as a pop-up).
    // The customer just presses "Send" to deliver the order to the shop.
    if (!CONFIG.orderEndpoint && CONFIG.whatsappNumber) {
      window.open(waLink(order), '_blank', 'noopener');
    }

    var btn = $('[data-place]');
    var label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Placing order…';

    var send = CONFIG.orderEndpoint
      ? fetch(CONFIG.orderEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(order)
        }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); })
      : Promise.resolve();

    send.then(function () {
      try {
        var past = JSON.parse(localStorage.getItem(CONFIG.ordersKey)) || [];
        past.unshift(order);
        localStorage.setItem(CONFIG.ordersKey, JSON.stringify(past.slice(0, 20)));
      } catch (err) { /* ignore */ }
      if (!CONFIG.orderEndpoint && !CONFIG.whatsappNumber && window.console) {
        console.warn('[KALIX] No orderEndpoint or whatsappNumber configured — order ' + order.id + ' was only saved in this browser.');
      }
      showDone(order);
      cart = { pints: {}, cones: [] };
      commit();
    }).catch(function () {
      formAlert.textContent = 'We couldn’t place your order. Please check your connection and try again.';
      formAlert.hidden = false;
    }).then(function () {
      btn.disabled = false;
      btn.textContent = label;
    });
  });

  function showDone(order) {
    var c = order.customer;
    $('[data-done-id]').textContent = order.id;
    $('[data-done-total]').textContent = inr(order.total);
    $('[data-done-address]').textContent = c.address + ', ' + c.area + ' ' + c.pincode;
    $('[data-done-slot]').textContent = order.slot;
    var wa = $('[data-done-wa]');
    var viaWhatsApp = !CONFIG.orderEndpoint && CONFIG.whatsappNumber;
    $('[data-done-msg]').textContent = viaWhatsApp
      ? 'Last step: press “Send” in WhatsApp so we receive your order. We’ll reply to confirm. Please keep ' + inr(order.total) + ' ready in cash.'
      : 'We’ll call you on +91 ' + c.phone + ' to confirm. Please keep ' + inr(order.total) + ' ready in cash.';
    $('.done-title').textContent = viaWhatsApp ? 'Almost done!' : 'Order placed!';
    if (CONFIG.whatsappNumber) {
      wa.href = waLink(order);
      $('[data-wa-label]').textContent = viaWhatsApp ? 'Send order on WhatsApp' : 'Message us on WhatsApp';
      wa.hidden = false;
    } else {
      wa.hidden = true;
    }
    showView('done');
    if (!reduceMotion) burst();
  }

  // Small confetti burst of sprinkles on success.
  function burst() {
    var host = $('[data-view="done"] .drawer-body');
    var colors = ['#E8A13A', '#54236B', '#E58FA6', '#9FC07A', '#9CC6E4', '#CDB8E6'];
    for (var i = 0; i < 26; i++) {
      var s = el('span', { class: 'confetti' });
      var angle = Math.random() * Math.PI * 2;
      var dist = 70 + Math.random() * 110;
      s.style.background = colors[i % colors.length];
      s.style.setProperty('--x', Math.cos(angle) * dist + 'px');
      s.style.setProperty('--y', Math.sin(angle) * dist - 40 + 'px');
      s.style.setProperty('--r', Math.round(Math.random() * 360) + 'deg');
      s.style.animationDelay = (Math.random() * 0.15) + 's';
      host.appendChild(s);
      setTimeout(function (node) { node.remove(); }.bind(null, s), 1600);
    }
  }

  /* ==================================================================
     Cart badge + toast
     ================================================================== */
  var badge = $('[data-cart-count]');
  var lastCount = null;
  function renderBadge() {
    var n = count();
    badge.textContent = n > 99 ? '99+' : String(n);
    openBtn.setAttribute('aria-label', 'Cart, ' + n + (n === 1 ? ' item' : ' items'));
    if (lastCount !== null && n > lastCount && !reduceMotion) {
      badge.classList.remove('is-bump'); void badge.offsetWidth; badge.classList.add('is-bump');
    }
    lastCount = n;
  }

  var toastEl = $('[data-toast]');
  var toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-show'); }, 2600);
  }

  function renderAll() { renderCards(); renderDrawer(); renderBadge(); }

  /* ==================================================================
     Scroll reveal
     ================================================================== */
  var revealTargets = $$('.reveal, .reveal-zoom, .reveal-clip, .map-anim');

  // Once an element has finished revealing, drop the reveal class so its own
  // hover transitions (e.g. card lift) are not slowed down by reveal timing.
  function settle(node) {
    if (!node.classList.contains('reveal')) return;
    var i = parseFloat(getComputedStyle(node).getPropertyValue('--i')) || 0;
    setTimeout(function () {
      node.classList.remove('reveal', 'is-in');
      node.classList.add('is-revealed');
    }, 950 + i * 90);
  }

  if ('IntersectionObserver' in window && !reduceMotion) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var node = en.target.__revealTarget || en.target;
        node.classList.add('is-in');
        settle(node);
        io.unobserve(en.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    revealTargets.forEach(function (n) {
      // Already scrolled past (anchor link / restored scroll): show it immediately.
      if (n.getBoundingClientRect().bottom < 0) { n.classList.add('is-in'); settle(n); return; }
      // A fully clipped element never "intersects", so watch its parent instead.
      if (n.classList.contains('reveal-clip')) { n.parentElement.__revealTarget = n; io.observe(n.parentElement); }
      else io.observe(n);
    });
  } else {
    revealTargets.forEach(function (n) { n.classList.add('is-in'); });
  }

  /* ==================================================================
     Fly-to-cart: a small copy of the product arcs into the cart icon
     ================================================================== */
  function flyToCart(img) {
    if (reduceMotion || !img || !img.animate) return;
    var from = img.getBoundingClientRect();
    if (!from.width) return;
    // Bring the header back; while hidden it sits one header-height above the viewport.
    var wasHidden = header.classList.contains('is-hidden');
    header.classList.remove('is-hidden');
    var to = openBtn.getBoundingClientRect();
    if (wasHidden) to = { left: to.left, width: to.width, height: to.height, top: to.top + header.offsetHeight };
    var size = Math.min(110, from.width * 0.6);
    var ghost = el('div', { class: 'fly' }, [el('img', { src: img.currentSrc || img.src, alt: '' })]);
    var sx = from.left + from.width / 2 - size / 2;
    var sy = from.top + from.height / 2 - size / 2;
    ghost.style.cssText = 'width:' + size + 'px;height:' + size + 'px;left:' + sx + 'px;top:' + sy + 'px';
    document.body.appendChild(ghost);
    var dx = to.left + to.width / 2 - (sx + size / 2);
    var dy = to.top + to.height / 2 - (sy + size / 2);
    var anim = ghost.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: 'translate(' + dx * 0.45 + 'px,' + (dy * 0.45 - 90) + 'px) scale(.7)', opacity: 1, offset: 0.45 },
      { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.16)', opacity: .4 }
    ], { duration: 800, easing: 'cubic-bezier(.5,0,.3,1)' });
    anim.onfinish = function () { ghost.remove(); };
  }

  /* ==================================================================
     Card tilt + light follow (pointer devices only)
     ================================================================== */
  if (!reduceMotion && window.matchMedia('(hover: hover) and (min-width: 761px)').matches) {
    $$('.card').forEach(function (card) {
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width;
        var py = (e.clientY - r.top) / r.height;
        card.style.setProperty('--ry', ((px - 0.5) * 6).toFixed(2) + 'deg');
        card.style.setProperty('--rx', ((0.5 - py) * 6).toFixed(2) + 'deg');
        card.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
        card.style.setProperty('--my', (py * 100).toFixed(1) + '%');
      });
      card.addEventListener('pointerleave', function () {
        card.style.removeProperty('--rx');
        card.style.removeProperty('--ry');
      });
    });
  }

  var year = $('[data-year]');
  if (year) year.textContent = String(new Date().getFullYear());

  renderCone();
  renderAll();
  onScroll();
})();
