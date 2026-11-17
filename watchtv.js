(function () {
    'use strict';

    // ===== ТИПОВІ НАЛАШТУВАННЯ DLE =====
    var DLE_SEARCH = '/index.php?do=search&subaction=search&story={q}';
    var DLE_RESULTS = '#dle-content a[href]';

    // Посилання на сторінку фільму/серіалу у DLE: .../12345-nazva.html
    var ITEM_RE = /\/\d+-[^\/?#]+\.html(?:[?#].*)?$/;

    // Стартові сайти. При оновленні плагіна їхні шаблони оновлюються,
    // а твої власні сайти та стан увімк/вимк зберігаються.
    var PRESETS = [
        {
            name: 'UASerials',
            base: 'https://uaserials.com',
            search: '/search/{q}/',
            results: 'a[href]',
            enabled: true
        },
        {
            name: 'UAFix',
            base: 'https://uafix.net',
            search: '/index.php?do=search&subaction=search&search_start=0&full_search=0&result_from=1&story={q}',
            results: DLE_RESULTS,
            enabled: true
        },
        {
            // Якщо GET не працює - в меню сайту задай POST-тіло:
            // do=search&subaction=search&story={q}
            name: 'UAKino',
            base: 'https://uakino.best',
            search: DLE_SEARCH,
            results: DLE_RESULTS,
            enabled: true
        }
    ];

    // ===== СХОВИЩЕ =====
    function saveSites(list) {
        Lampa.Storage.set('uafresh_sites', list);
    }

    function loadSites() {
        var s = Lampa.Storage.get('uafresh_sites', '');
        return (s && s.length) ? s : [];
    }

    // Додає відсутні пресети, оновлює шаблони існуючих
    function mergePresets() {
        var list = loadSites();
        PRESETS.forEach(function (p) {
            var found = null;
            list.forEach(function (s) { if (s.base === p.base) found = s; });
            if (found) {
                found.search = p.search;
                found.results = p.results;
            } else {
                list.push(JSON.parse(JSON.stringify(p)));
            }
        });
        saveSites(list);
    }

    function proxy() {
        return Lampa.Storage.get('uafresh_proxy', '') || '';
    }

    // ===== МЕРЕЖА =====
    function get(url, ok, fail, post) {
        var net = new Lampa.Reguest();
        var p = proxy();
        var u = p ? p + encodeURIComponent(url) : url;
        var params = { dataType: 'text' };
        if (post) params.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
        net.timeout(15000);
        net.native(u, ok, fail || function () {}, post || false, params);
    }

    function abs(base, href) {
        if (!href) return '';
        if (href.indexOf('//') === 0) return 'https:' + href;
        if (href.indexOf('http') === 0) return href;
        return base + (href.charAt(0) === '/' ? '' : '/') + href;
    }

    function parse(html) {
        return new DOMParser().parseFromString(html, 'text/html');
    }

    function noty(t) {
        Lampa.Noty.show(t);
    }

    // "8.32024ФолаутFallout" -> "Фолаут / Fallout (2024)"
    function cleanTitle(raw) {
        var t = (raw || '').replace(/\s+/g, ' ').trim();
        var year = '';
        var m = t.match(/^\d{1,2}(?:\.\d)?\s?((?:19|20)\d{2})(?=\D)/);
        if (m) {
            year = m[1];
            t = t.slice(m[0].length);
        }
        t = t.replace(/([а-яіїєґ'’!?.:»)])([A-Z])/g, '$1 / $2').trim();
        return year ? t + ' (' + year + ')' : t;
    }

    // ===== ПОШУК / ПЛЕЄРИ / ПОТІК =====
    function searchSite(site, query, cb) {
        var q = encodeURIComponent(query);
        var url = site.base + site.search.replace(/\{q\}/g, q);
        var post = site.post ? site.post.replace(/\{q\}/g, q) : '';

        get(url, function (html) {
            var doc = parse(html);
            var seen = {};
            var res = [];

            doc.querySelectorAll(site.results).forEach(function (a) {
                var href = a.getAttribute('href');
                if (!href || !ITEM_RE.test(href)) return;

                var full = abs(site.base, href);
                if (seen[full]) return;

                var title = cleanTitle(a.getAttribute('title') || a.textContent);
                if (!title || title.length < 2) return;

                seen[full] = 1;
                res.push({ title: title, url: full, site: site });
            });

            cb(res);
        }, function () {
            cb(null); // null = помилка запиту
        }, post);
    }

    function getIframes(page, cb) {
        get(page.url, function (html) {
            var doc = parse(html);
            var list = [];

            doc.querySelectorAll('iframe').forEach(function (f) {
                var src = f.getAttribute('data-src') || f.getAttribute('src');
                if (src) list.push(abs(page.site.base, src));
            });

            if (!list.length) {
                var m = html.match(/https?:\/\/[^"'\s\\]*(ashdi|tortuga|zetvideo|vidsrc|moonanime)[^"'\s\\]*/gi);
                if (m) list = m;
            }

            cb(list);
        }, function () {
            cb([]);
        });
    }

    function extractStream(iframe, cb) {
        get(iframe, function (html) {
            var clean = html.replace(/\\\//g, '/');
            var m = clean.match(/https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*/);
            if (m) return cb(m[0]);
            var mp4 = clean.match(/https?:\/\/[^"'\s\\]+\.mp4[^"'\s\\]*/);
            cb(mp4 ? mp4[0] : null);
        }, function () {
            cb(null);
        });
    }

    // ===== ПЕРЕГЛЯД =====
    function backContent() {
        Lampa.Controller.toggle('content');
    }

    function playIframe(iframe, title) {
        noty('Шукаю потік...');
        extractStream(iframe, function (stream) {
            if (!stream) return noty('Не вдалося витягти потік з плеєра');
            Lampa.Player.play({ url: stream, title: title });
            Lampa.Player.playlist([{ url: stream, title: title }]);
        });
    }

    function pickPlayer(page) {
        noty('Завантажую сторінку...');
        getIframes(page, function (iframes) {
            if (!iframes.length) return noty('Плеєрів на сторінці не знайдено');

            Lampa.Select.show({
                title: 'Оберіть плеєр',
                items: iframes.map(function (u, i) {
                    return { title: 'Плеєр ' + (i + 1) + ' (' + u.replace(/^https?:\/\//, '').split('/')[0] + ')', url: u };
                }),
                onSelect: function (a) { playIframe(a.url, page.title); },
                onBack: backContent
            });
        });
    }

    function startSearch(movie) {
        // Шукаємо і за українською, і за оригінальною назвою
        var queries = [];
        [movie.title || movie.name, movie.original_title || movie.original_name].forEach(function (q) {
            if (q && queries.indexOf(q) < 0) queries.push(q);
        });
        if (!queries.length) return noty('Немає назви для пошуку');

        var sites = loadSites().filter(function (s) { return s.enabled; });
        if (!sites.length) return noty('Немає активних сайтів. Додайте їх у Налаштування → UAFresh');

        var all = [];
        var seen = {};
        var left = sites.length * queries.length;
        noty('Шукаю: ' + queries[0]);

        sites.forEach(function (site) {
            queries.forEach(function (query) {
                searchSite(site, query, function (res) {
                    (res || []).slice(0, 8).forEach(function (r) {
                        if (seen[r.url]) return;
                        seen[r.url] = 1;
                        all.push(r);
                    });

                    if (--left > 0) return;
                    if (!all.length) return noty('Нічого не знайдено');

                    Lampa.Select.show({
                        title: 'UAFresh: результати',
                        items: all.map(function (r) {
                            return { title: r.title, subtitle: r.site.name, page: r };
                        }),
                        onSelect: function (a) { pickPlayer(a.page); },
                        onBack: backContent
                    });
                });
            });
        });
    }

    // ===== КЕРУВАННЯ САЙТАМИ (НАЛАШТУВАННЯ) =====
    function backSettings() {
        Lampa.Controller.toggle('settings_component');
    }

    function normalizeUrl(v) {
        v = (v || '').trim();
        if (!v) return '';
        if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
        var m = v.match(/^(https?:\/\/[^\/\s]+)/i);
        return m ? m[1] : '';
    }

    function addSite() {
        Lampa.Input.edit({ title: 'Адреса сайту', value: 'https://', free: true, nosave: true }, function (val) {
            var base = normalizeUrl(val);
            if (!base) return manageSites();

            var list = loadSites();
            if (list.some(function (s) { return s.base === base; })) {
                noty('Цей сайт вже є в списку');
                return manageSites();
            }

            list.push({
                name: base.replace(/^https?:\/\/(www\.)?/, ''),
                base: base,
                search: DLE_SEARCH,
                results: DLE_RESULTS,
                enabled: true
            });
            saveSites(list);
            noty('Додано. Натисніть на сайт → «Перевірити пошук»');
            manageSites();
        });
    }

    function editField(index, key, title, allowEmpty) {
        var list = loadSites();
        Lampa.Input.edit({ title: title, value: list[index][key] || '', free: true, nosave: true }, function (val) {
            val = (val || '').trim();
            if (val || allowEmpty) {
                list[index][key] = val;
                saveSites(list);
            }
            siteMenu(index);
        });
    }

    function testSite(index) {
        var site = loadSites()[index];
        noty('Перевіряю ' + site.name + '...');
        searchSite(site, 'fallout', function (res) {
            if (res === null) noty(site.name + ': помилка запиту (потрібен проксі?)');
            else if (!res.length) noty(site.name + ': запит пройшов, але результатів 0 (змініть шаблон/селектор або спробуйте POST)');
            else noty(site.name + ': працює, знайдено ' + res.length);
            siteMenu(index);
        });
    }

    function siteMenu(index) {
        var list = loadSites();
        var s = list[index];
        if (!s) return manageSites();

        Lampa.Select.show({
            title: s.name,
            items: [
                { title: s.enabled ? 'Вимкнути' : 'Увімкнути', act: 'toggle' },
                { title: 'Перевірити пошук', act: 'test' },
                { title: 'Назва: ' + s.name, act: 'name' },
                { title: 'Шаблон пошуку (GET)', subtitle: s.search, act: 'search' },
                { title: 'POST-тіло (порожньо = GET)', subtitle: s.post || '—', act: 'post' },
                { title: 'CSS-селектор результатів', subtitle: s.results, act: 'results' },
                { title: 'Видалити сайт', act: 'delete' }
            ],
            onSelect: function (a) {
                if (a.act === 'toggle') {
                    list[index].enabled = !list[index].enabled;
                    saveSites(list);
                    siteMenu(index);
                } else if (a.act === 'test') testSite(index);
                else if (a.act === 'name') editField(index, 'name', 'Назва');
                else if (a.act === 'search') editField(index, 'search', 'Шаблон пошуку ({q} = запит)');
                else if (a.act === 'post') editField(index, 'post', 'POST-тіло, напр. do=search&subaction=search&story={q}', true);
                else if (a.act === 'results') editField(index, 'results', 'CSS-селектор');
                else if (a.act === 'delete') {
                    list.splice(index, 1);
                    saveSites(list);
                    manageSites();
                }
            },
            onBack: manageSites
        });
    }

    function manageSites() {
        var items = loadSites().map(function (s, i) {
            return { title: (s.enabled ? '✓ ' : '✗ ') + s.name, subtitle: s.base, index: i };
        });
        items.push({ title: '+ Додати сайт', add: true });

        Lampa.Select.show({
            title: 'Сайти UAFresh',
            items: items,
            onSelect: function (a) {
                if (a.add) addSite();
                else siteMenu(a.index);
            },
            onBack: backSettings
        });
    }

    function initSettings() {
        Lampa.SettingsApi.addComponent({
            component: 'uafresh',
            name: 'UAFresh',
            icon: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M10 8l6 4-6 4z"/></svg>'
        });

        Lampa.SettingsApi.addParam({
            component: 'uafresh',
            param: { name: 'uafresh_manage', type: 'button' },
            field: { name: 'Сайти', description: 'Додати, вимкнути, перевірити або видалити сайти' },
            onChange: manageSites
        });

        Lampa.SettingsApi.addParam({
            component: 'uafresh',
            param: { name: 'uafresh_proxy', type: 'input', default: '' },
            field: { name: 'CORS-проксі', description: 'Формат: https://проксі/?url=  (порожнє = без проксі)' }
        });

        Lampa.SettingsApi.addParam({
            component: 'uafresh',
            param: { name: 'uafresh_reset', type: 'button' },
            field: { name: 'Скинути список сайтів', description: 'Видалити свої сайти й повернути стандартні' },
            onChange: function () {
                saveSites([]);
                mergePresets();
                noty('Список скинуто');
            }
        });
    }

    // ===== КНОПКА В КАРТЦІ ФІЛЬМУ =====
    function initButton() {
        Lampa.Listener.follow('full', function (e) {
            if (e.type !== 'complite') return;

            var btn = $('<div class="full-start__button selector view--uafresh"><span>UAFresh</span></div>');
            btn.on('hover:enter', function () {
                startSearch(e.data.movie);
            });

            var render = e.object.activity.render();
            var anchor = render.find('.view--torrent');
            if (anchor.length) anchor.after(btn);
            else render.find('.full-start__buttons').append(btn);
        });
    }

    function init() {
        mergePresets();
        initSettings();
        initButton();
    }

    if (window.appready) init();
    else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') init();
        });
    }
})();
