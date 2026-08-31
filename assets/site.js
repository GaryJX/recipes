(function () {
  'use strict';

  function initThemeToggle() {
    var toggle = document.querySelector('[data-theme-toggle]');
    if (!toggle) return;

    toggle.addEventListener('click', function () {
      var next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem('theme', next);
      } catch (error) {
        /* Private browsing: the theme simply won't persist. */
      }
    });
  }

  function initStickyHeader() {
    var header = document.querySelector('.site-header');
    if (!header) return;

    var update = function () {
      header.classList.toggle('is-stuck', window.scrollY > 8);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
  }

  function initSearch() {
    var input = document.getElementById('search');
    var list = document.getElementById('cards');
    var empty = document.getElementById('empty');
    if (!input || !list) return;

    var items = Array.prototype.slice.call(list.querySelectorAll('.card-item'));
    var filters = Array.prototype.slice.call(document.querySelectorAll('.filter'));
    var activeTag = 'all';

    function apply() {
      var query = input.value.trim().toLowerCase();
      var visible = 0;

      items.forEach(function (item) {
        var tags = (item.dataset.tags || '').split('|');
        var matchesTag = activeTag === 'all' || tags.indexOf(activeTag) !== -1;
        var matchesQuery = query === '' || (item.dataset.search || '').indexOf(query) !== -1;
        var show = matchesTag && matchesQuery;
        item.hidden = !show;
        if (show) visible += 1;
      });

      if (empty) empty.hidden = visible !== 0;
    }

    input.addEventListener('input', apply);
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        input.value = '';
        apply();
      }
    });

    filters.forEach(function (button) {
      button.addEventListener('click', function () {
        activeTag = button.dataset.filter;
        filters.forEach(function (other) {
          other.classList.toggle('is-active', other === button);
        });
        apply();
      });
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === '/' && document.activeElement !== input) {
        event.preventDefault();
        input.focus();
      }
    });

    apply();
  }

  function initIngredientCheckoff() {
    var items = document.querySelectorAll('.section.is-ingredients > ul > li');
    if (items.length === 0) return;

    Array.prototype.forEach.call(items, function (item) {
      item.setAttribute('role', 'checkbox');
      item.setAttribute('aria-checked', 'false');
      item.tabIndex = 0;

      var toggle = function () {
        var checked = item.classList.toggle('is-checked');
        item.setAttribute('aria-checked', checked ? 'true' : 'false');
      };

      item.addEventListener('click', function (event) {
        if (event.target.closest('a')) return;
        toggle();
      });

      item.addEventListener('keydown', function (event) {
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault();
          toggle();
        }
      });
    });
  }

  function initTocHighlight() {
    var links = Array.prototype.slice.call(document.querySelectorAll('.toc a'));
    if (links.length === 0 || !('IntersectionObserver' in window)) return;

    var byId = {};
    var targets = [];

    links.forEach(function (link) {
      var section = document.getElementById(decodeURIComponent(link.hash.slice(1)));
      if (!section) return;
      byId[section.id] = link;
      targets.push(section);
    });

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          links.forEach(function (link) {
            link.classList.remove('is-current');
          });
          if (byId[entry.target.id]) byId[entry.target.id].classList.add('is-current');
        });
      },
      { rootMargin: '-20% 0px -70% 0px' }
    );

    targets.forEach(function (target) {
      observer.observe(target);
    });
  }

  initThemeToggle();
  initStickyHeader();
  initSearch();
  initIngredientCheckoff();
  initTocHighlight();
})();
