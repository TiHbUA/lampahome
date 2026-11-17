(function () {
    'use strict';

    // ===== ПОШУК DLE =====
    var DLE_POST_BODY = 'do=search&subaction=search&search_start=0&full_search=0&result_from=1&story={q}';
    var DLE_GET = '/index.php?do=search&subaction=search&story={q}';

    // Сторінка фільму у DLE: .../12345-nazva.html
    var ITEM_RE = /\/\d+-[^\/?#]+\.html$/;

    // Стартові сайти. Шаблони оновлюються разом із плагіном,
    // а ваші сайти та стан увімк/вимк зберігаються.
    var PRESETS = [
        {
            name: 'UASerials',
            base: 'https://uaserials.com',
            search: '/search/{q}/',
            results: 'a[href]',
            enabled: true
        },
        {
            // посилання без id: /serial/nazva/
            name: 'UAFix',
            base: 'https://uafix.net',
            dle: true,
            linkRe: '^\\/(?!page\\/|tags\\/|xfsearch\\/|user\\/|index)[a-z-]+\\/[a-z0-9-]+\\/$',
            results: 'a[href]',
            enabled: true
        },
        {
            name: 'UAKino',
            base: 'https://uakino.best',
            dle: true,
            results: 'a[href]',
            enabled: true
        }
    ];

    var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

    // ===== СХОВИЩЕ =====
    function saveSites(list) {
        Lampa.Storage.set('uafresh_sites', list);
    }

    function loadSites() {
        var s = Lampa.Storage.get('uafresh_sites', '');
        return (s && s.length) ? s : [];
    }

    function mergePresets() {
        var list = loadSites();
        PRESETS.forEach(function (p) {
            var found = null;
            list.forEach(function (s) { if (s.base === p.base) found = s; });
            if (!found) return list.push(JSON.parse(JSON.stringify(p)));
            ['search', 'post', 'results', 'linkRe', 'dle'].forEach(function (k) {
                if (p[k] === undefined) delete found[k];
                else found[k] = p[k];
            });
        });
        saveSites(list);
    }

    function proxy() {
        return Lampa.Storage.get('uafresh_proxy', '') || '';
    }

    function streamViaProxy() {
        var v = Lampa.Storage.get('uafresh_stream_proxy', false);
        return v === true || v === 'true';
    }

    function platformIs(name) {
        try {
            return !!(Lampa.Platform && Lampa.Platform.is && Lampa.Platform.is(name));
        } catch (e) {
            return false;
        }
    }

    // ===== МЕРЕЖА =====
    function hostOf(url) {
        return (String(url).match(/^https?:\/\/([^\/?#]+)/i) || [])[1] || '';
    }

    function describe(a) {
        var status = a && a.status;
        var text = a && (a.responseText || a.message || a.error);
        if (text && typeof text === 'string') {
            var t = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
            text = (t ? t[1] : text).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
        } else text = '';
        var head = status ? 'HTTP ' + status : 'немає з\'єднання';
        if (/just a moment|attention required|cloudflare/i.test(text)) head += ' (захист Cloudflare)';
        return head + (text ? ' «' + text + '»' : '');
    }

    var hostPref = {};

    // Спочатку напряму (працює в застосунку Android та з українським IP),
    // потім через проксі. o: { post, ref, xhr }
    function get(url, ok, fail, o) {
        o = o || {};
        var p = proxy();
        var host = hostOf(url);
        var methods = p ? ['direct', 'proxy'] : ['direct'];
        if (p && hostPref[host] === 'proxy') methods = ['proxy'];
        var errors = [];

        (function attempt(i) {
            var method = methods[i];
            var net = new Lampa.Reguest();
            var u = url;
            var headers = {};

            if (method === 'proxy') {
                u = p + encodeURIComponent(url) +
                    (o.ref ? '&ref=' + encodeURIComponent(o.ref) : '') +
                    (o.xhr ? '&xhr=1' : '');
            } else {
                headers['User-Agent'] = UA;
                headers['Accept-Language'] = 'uk-UA,uk;q=0.9,en;q=0.8';
                if (o.ref) headers.Referer = o.ref;
                if (o.xhr) headers['X-Requested-With'] = 'XMLHttpRequest';
            }
            if (o.post) headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';

            net.timeout(20000);
            net.native(u, function (text) {
                if (method === 'proxy' && methods.length === 2 && i === 1) hostPref[host] = 'proxy';
                ok(text);
            }, function (a) {
                errors.push((method === 'proxy' ? 'проксі' : 'напряму') + ': ' + describe(a));
                if (i + 1 < methods.length) return attempt(i + 1);
                if (fail) fail(errors.join('; '));
            }, o.post || false, { dataType: 'text', headers: headers });
        })(0);
    }

    function abs(base, href) {
        if (!href) return '';
        href = String(href).replace(/&amp;/g, '&').trim();
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

    function sameHost(a, b) {
        var h = function (u) {
            return String(u).replace(/^https?:\/\/(www\.)?([^\/:?#]+).*$/, '$2').toLowerCase();
        };
        return h(a) === h(b);
    }

    // ===== НАЗВИ =====
    // "8.32024ФолаутFallout" -> "Фолаут / Fallout (2024)"
    function cleanTitle(raw) {
        var t = (raw || '').replace(/\s+/g, ' ').trim();
        var year = '';
        var m = t.match(/^\d{1,2}(?:\.\d)?\s?((?:19|20)\d{2})(?=\D)/);
        if (m) {
            year = m[1];
            t = t.slice(m[0].length);
        }
        t = t.replace(/\s+(онлайн|дивитис[ья]|смотреть)(\s.*)?$/i, '');
        t = t.replace(/([а-яіїєґ'’!?.:»)])([A-Z])/g, '$1 / $2').trim();
        if (/^(дивитис[ья]|смотреть|watch|play|детальніше|більше)$/i.test(t)) return '';
        return year ? t + ' (' + year + ')' : t;
    }

    function titleOf(a) {
        var h = a.querySelector('h1,h2,h3,h4,h5,h6,.movie-title,.poster__title');
        var t = h && h.textContent.trim();
        if (!t) t = a.getAttribute('title');
        if (!t) {
            var img = a.querySelector('img');
            var alt = img && (img.getAttribute('alt') || img.getAttribute('title'));
            if (alt && !/постер|poster/i.test(alt)) t = alt;
        }
        if (!t) t = a.textContent;
        return cleanTitle(t);
    }

    // ===== ПОШУК =====
    function collect(doc, site, selector) {
        var linkRe = null;
        try { if (site.linkRe) linkRe = new RegExp(site.linkRe); } catch (e) {}

        var byUrl = {};
        var order = [];

        doc.querySelectorAll(selector).forEach(function (a) {
            var href = a.getAttribute('href');
            if (!href) return;

            var full = abs(site.base, href);
            if (!sameHost(full, site.base)) return;

            var path;
            try { path = new URL(full).pathname; } catch (e) { return; }
            if (!(ITEM_RE.test(path) || (linkRe && linkRe.test(path)))) return;

            var title = titleOf(a);
            if (!byUrl[full]) {
                byUrl[full] = { title: '', url: full, site: site };
                order.push(full);
            }
            if (title && !byUrl[full].title) byUrl[full].title = title;
        });

        return order.map(function (u) { return byUrl[u]; }).filter(function (r) { return r.title.length > 1; });
    }

    function attemptsFor(site, query) {
        var q = encodeURIComponent(query);
        if (site.dle) {
            return [
                { url: site.base + '/index.php?do=search', post: DLE_POST_BODY.replace(/\{q\}/g, q) },
                { url: site.base + DLE_GET.replace(/\{q\}/g, q), post: '' }
            ];
        }
        return [{
            url: site.base + (site.search || DLE_GET).replace(/\{q\}/g, q),
            post: site.post ? site.post.replace(/\{q\}/g, q) : ''
        }];
    }

    // cb(results|null, info). При повній невдачі info.error містить причини.
    function searchSite(site, query, cb) {
        var attempts = attemptsFor(site, query);
        var anyOk = false;
        var lastInfo = null;
        var lastErr = '';

        (function next(i) {
            if (i >= attempts.length) return cb(anyOk ? [] : null, anyOk ? lastInfo : { error: lastErr });

            var at = attempts[i];
            get(at.url, function (html) {
                anyOk = true;
                html = String(html);
                var doc = parse(html);
                var res = collect(doc, site, site.results || 'a[href]');
                var t = doc.querySelector('title');

                lastInfo = {
                    method: at.post ? 'POST' : 'GET',
                    len: html.length,
                    anchors: doc.querySelectorAll('a[href]').length,
                    title: t ? t.textContent.trim().slice(0, 70) : '(немає)'
                };

                if (res.length) cb(res, lastInfo);
                else next(i + 1);
            }, function (err) {
                lastErr = err;
                next(i + 1);
            }, { post: at.post, ref: site.base + '/' });
        })(0);
    }

    // ===== СТОРІНКА: ПЛЕЄРИ ТА ПЛЕЙЛИСТ =====
    var PLAYER_URL = /(?:https?:)?\/\/(?:[a-z0-9-]+\.)*(?:ashdi\.vip|tortuga\.[a-z]+|zetvideo\.net|[a-z0-9-]*hdvb[a-z0-9-]*\.[a-z]+)\/[^"'\s<>\\]+/gi;

    function loadPage(page, cb) {
        get(page.url, function (html) {
            html = String(html);
            var doc = parse(html);
            var iframes = [];
            var add = function (src) {
                src = abs(page.site.base, src);
                if (!src || /youtube|youtu\.be|trailer/i.test(src)) return;
                if (/\.(js|css|png|jpe?g|webp|gif|svg|ico)(\?|$)/i.test(src)) return;
                if (iframes.indexOf(src) < 0) iframes.push(src);
            };

            doc.querySelectorAll('iframe').forEach(function (f) {
                add(f.getAttribute('src') || f.getAttribute('data-src'));
            });
            (html.match(PLAYER_URL) || []).forEach(add);

            var pl = doc.querySelector('.playlists-ajax');
            var playlist = null;
            if (pl && pl.getAttribute('data-news_id')) {
                var hash = (html.match(/dle_login_hash\s*=\s*['"]([^'"]+)['"]/) || [])[1];
                playlist = {
                    newsId: pl.getAttribute('data-news_id'),
                    xfield: pl.getAttribute('data-xfname') || 'playlist',
                    hash: hash || ''
                };
            }

            cb({ iframes: iframes, playlist: playlist });
        }, function (err) {
            cb(null, err);
        }, { ref: page.site.base + '/' });
    }

    // Плейлист DLE (UAKino): <li data-file data-id data-voice>
    // Повертає дерево груп (сезон · озвучка) з серіями; назви груп потрібні для фільтрів.
    function loadPlaylist(page, pl, cb) {
        var url = page.site.base + '/engine/ajax/playlists.php?news_id=' + encodeURIComponent(pl.newsId) +
            '&xfield=' + encodeURIComponent(pl.xfield) +
            (pl.hash ? '&user_hash=' + encodeURIComponent(pl.hash) : '') +
            '&time=' + Date.now();

        get(url, function (text) {
            var body = String(text);
            try {
                var j = JSON.parse(body);
                body = j && j.response ? String(j.response) : '';
            } catch (e) {}

            var doc = parse(body);
            var labels = {};
            var eps = [];

            doc.querySelectorAll('li').forEach(function (li) {
                var file = li.getAttribute('data-file');
                var id = li.getAttribute('data-id');
                var txt = li.textContent.replace(/\s+/g, ' ').trim();
                if (file) {
                    eps.push({ id: id || '', voice: li.getAttribute('data-voice') || '', title: txt, file: abs(page.site.base, file) });
                } else if (id !== null) {
                    labels[id] = txt;
                }
            });

            var groups = {};
            var order = [];
            eps.forEach(function (ep) {
                var parts = ep.id ? ep.id.split('_') : [];
                var names = [];
                for (var i = 1; i <= parts.length; i++) {
                    var l = labels[parts.slice(0, i).join('_')];
                    if (l && names.indexOf(l) < 0) names.push(l);
                }
                if (ep.voice && names.indexOf(ep.voice) < 0) names.push(ep.voice);
                var g = names.filter(function (n) {
                    return !/^(озвучування|озвучка|озвучення)$/i.test(n);
                }).join(' · ') || page.site.name;

                if (/трейлер|trailer/i.test(g + ' ' + ep.title)) return;
                if (!groups[g]) { groups[g] = []; order.push(g); }
                groups[g].push({ title: ep.title || page.title, player: ep.file });
            });

            cb(order.map(function (g) { return { title: g, folder: groups[g] }; }));
        }, function () {
            cb([]);
        }, { ref: page.url, xhr: true });
    }

    // ===== PLAYERJS =====
    function tryJson(str) {
        try { return JSON.parse(str); } catch (e) { return null; }
    }

    // Усі рядкові значення key:"..." з екрануванням (без важких regex)
    function jsStrings(html, key, max) {
        var re = new RegExp('[\\s,{]' + key + '\\s*:\\s*([\'"])', 'g');
        var out = [];
        var m;

        while ((m = re.exec(html)) && out.length < (max || 6)) {
            var q = m[1];
            var s = '';
            var i = m.index + m[0].length;
            var closed = false;

            for (; i < html.length; i++) {
                var c = html.charAt(i);
                if (c === '\\') {
                    var n = html.charAt(++i);
                    s += n === 'n' ? '\n' : n;
                    continue;
                }
                if (c === q) { closed = true; break; }
                s += c;
            }
            if (closed) out.push(s);
            re.lastIndex = i + 1;
        }
        return out;
    }

    // "[360]url,[720]url" або "url1 or url2" -> { url, q } найкращої якості
    function pickBest(f) {
        if (!f || typeof f !== 'string') return null;
        f = f.replace(/\\\//g, '/');
        var best = null;
        var bestQ = -1;

        f.split(/,(?=\s*(?:\[|https?:|\/\/))/).forEach(function (part) {
            var m = part.trim().match(/^(?:\[([^\]]*)\])?\s*([\s\S]+)$/);
            if (!m) return;
            var u = m[2].split(' or ')[0].trim();
            if (u.indexOf('//') === 0) u = 'https:' + u;
            if (!/^https?:\/\//.test(u)) return;
            var q = /4k|uhd/i.test(m[1] || '') ? 2160 : (parseInt(m[1], 10) || 0);
            if (q > bestQ) { best = { url: u, q: q }; bestQ = q; }
        });

        return best;
    }

    function normTree(arr) {
        var out = [];
        (arr || []).forEach(function (n) {
            if (!n) return;
            var title = n.title || n.name || '';
            if (n.folder) {
                var ch = normTree(n.folder);
                if (ch.length) out.push({ title: title, folder: ch });
            } else {
                var b = pickBest(n.file);
                if (b) out.push({ title: title, url: b.url, q: b.q });
            }
        });
        return out;
    }

    // Шифр "#2...": base64 із домішками "//<base64-сміття>"
    function decodeEnc(file) {
        if (!/^#2/.test(file)) return null;
        var s = file.slice(2).replace(/\\\//g, '/');

        function trash(chunk) {
            try { return /^[a-z]{2,12}_[0-9a-f]{16,64}$/i.test(atob(chunk)); } catch (e) { return false; }
        }

        function removeOne() {
            var re = /\/\/([A-Za-z0-9+]+={0,2})/g;
            var runs = [];
            var m;
            while ((m = re.exec(s))) {
                runs.push({ at: m.index, run: m[1] });
                re.lastIndex = m.index + 1;
            }
            var i, r;
            for (i = 0; i < runs.length; i++) {
                r = runs[i];
                if (/=$/.test(r.run) && trash(r.run)) {
                    s = s.slice(0, r.at) + s.slice(r.at + 2 + r.run.length);
                    return true;
                }
            }
            for (i = 0; i < runs.length; i++) {
                r = runs[i];
                for (var len = r.run.length - r.run.length % 4; len >= 8; len -= 4) {
                    if (trash(r.run.slice(0, len))) {
                        s = s.slice(0, r.at) + s.slice(r.at + 2 + len);
                        return true;
                    }
                }
            }
            return false;
        }

        for (var g = 0; g < 200 && removeOne(); g++) {}

        var out;
        try { out = decodeURIComponent(escape(atob(s))); } catch (e) { return null; }
        return /^\s*(\[|https?:|\{)/.test(out) ? out : null;
    }

    function interpretFile(file) {
        file = String(file || '').trim();
        if (!file) return null;

        if (file.charAt(0) === '#') {
            var dec = decodeEnc(file);
            if (!dec) return { enc: file.slice(0, 2) };
            file = dec.trim();
        }

        if (/^\[\s*\{/.test(file)) {
            var j = tryJson(file);
            var tree = j ? normTree(j) : [];
            return tree.length ? { tree: tree } : null;
        }

        var b = pickBest(file);
        return b ? { url: b.url, q: b.q } : null;
    }

    function playerjsData(html) {
        var files = jsStrings(html, 'file');
        var enc = null;
        for (var i = 0; i < files.length; i++) {
            var d = interpretFile(files[i]);
            if (d && (d.tree || d.url)) return d;
            if (d && d.enc) enc = d;
        }
        return enc;
    }

    // cb({tree}) | cb({url, q}) | cb({info})
    function extractStream(iframe, ref, cb) {
        get(iframe, function (html) {
            var d;
            try {
                html = String(html);
                d = playerjsData(html);
                if (d && d.tree) return cb({ tree: d.tree });
                if (d && d.url) return cb({ url: d.url, q: d.q });

                var clean = html.replace(/\\\//g, '/');
                var one = clean.match(/https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*/) || clean.match(/https?:\/\/[^"'\s\\]+\.mp4[^"'\s\\]*/);
                if (one) return cb({ url: one[0], q: 0 });

                cb({
                    info: (d && d.enc ? 'шифр ' + d.enc + ' не розпізнано; ' : '') +
                        'потік не знайдено у відповіді (' + html.length + ' симв.): ' +
                        html.replace(/\s+/g, ' ').slice(0, 90)
                });
            } catch (e) {
                cb({ info: 'помилка розбору плеєра: ' + (e && e.message || e) });
            }
        }, function (err) {
            cb({ info: 'запит до плеєра не пройшов: ' + err });
        }, { ref: ref });
    }

    // ===== СЕРІЇ: РОЗБІР ДЕРЕВА НА СЕЗОН / СЕРІЯ / ОЗВУЧКА =====
    // Розгортає дерево папок у плаский список листків зі шляхом назв
    function flatten(nodes, path, out, extra) {
        (nodes || []).forEach(function (n) {
            if (!n) return;
            var p = path.concat([n.title || '']);
            if (n.folder) flatten(n.folder, p, out, extra);
            else out.push({ path: p, url: n.url, q: n.q, player: n.player, ref: extra.ref, prefix: extra.prefix });
        });
    }

    // Визначає сезон, серію та озвучку з назв у шляху
    function classify(raw, idx) {
        var parts = [];
        raw.path.forEach(function (p) {
            String(p).split(' · ').forEach(function (x) {
                x = x.trim();
                if (x) parts.push(x);
            });
        });

        var season = null;
        var episode = null;
        var rest = [];

        parts.forEach(function (p, i) {
            var m;
            if (season === null && (m = p.match(/^(?:сезон|season|s)\s*(\d+)$/i) || p.match(/^(\d+)\s*(?:сезон|season)$/i))) {
                season = parseInt(m[1], 10);
            } else if (episode === null && (m = p.match(/^(?:серія|серия|episode|ep|e)\s*\.?\s*(\d+)/i) || p.match(/^(\d+)\s*(?:серія|серия|episode|ep)/i))) {
                episode = parseInt(m[1], 10);
            } else if (episode === null && i === parts.length - 1 && /^\d+$/.test(p)) {
                episode = parseInt(p, 10);
            } else {
                rest.push(p);
            }
        });

        if (raw.prefix) rest.unshift(raw.prefix);

        var label = '';
        if (episode !== null) label = (season !== null ? 'S' + season + ' / ' : '') + 'Серія ' + episode;
        else if (season !== null) label = 'Сезон ' + season;

        return {
            _i: idx,
            url: raw.url,
            q: raw.q || 0,
            player: raw.player,
            ref: raw.ref,
            season: season,
            episode: episode,
            voice: rest.join(' · '),
            label: label
        };
    }

    function buildEpisodes(raw) {
        return raw.map(classify);
    }

    function uniq(arr) {
        var out = [];
        arr.forEach(function (x) { if (out.indexOf(x) < 0) out.push(x); });
        return out;
    }

    // Завантажує сторінку й повертає плаский список серій/потоків
    function collectEpisodes(page, cb) {
        loadPage(page, function (info, err) {
            if (!info) return cb(null, err || 'сторінку не вдалося завантажити');

            var viaIframes = function () {
                var list = info.iframes;
                if (!list.length) return cb([], 'плеєрів на сторінці не знайдено');

                var raw = [];
                var notes = [];
                var left = list.length;

                list.forEach(function (ifr) {
                    extractStream(ifr, page.url, function (r) {
                        var extra = { ref: ifr, prefix: list.length > 1 ? hostOf(ifr) : '' };
                        if (r.tree) flatten(r.tree, [], raw, extra);
                        else if (r.url) raw.push({ path: [], url: r.url, q: r.q, ref: ifr, prefix: extra.prefix });
                        else if (r.info) notes.push(hostOf(ifr) + ': ' + r.info);

                        if (--left > 0) return;
                        cb(buildEpisodes(raw), raw.length ? '' : notes.join('; '));
                    });
                });
            };

            if (!info.playlist) return viaIframes();

            loadPlaylist(page, info.playlist, function (tree) {
                if (!tree.length) return viaIframes();
                var raw = [];
                flatten(tree, [], raw, { ref: page.url, prefix: '' });
                cb(buildEpisodes(raw));
            });
        });
    }

    // ===== ПЕРЕГЛЯД =====
    function backContent() {
        Lampa.Controller.toggle('content');
    }

    function isAshdi(url) {
        return /^https?:\/\/([a-z0-9-]+\.)*ashdi\.vip\//i.test(String(url || ''));
    }

    // Потік через проксі (з перезаписом m3u8 у Worker) - для браузера
    function streamUrl(u, sref) {
        var p = proxy();
        if (!p || !streamViaProxy()) return u;
        return p + encodeURIComponent(u) + (sref ? '&ref=' + encodeURIComponent(sref) : '');
    }

    function showInfo(title, lines) {
        Lampa.Select.show({
            title: title,
            items: lines.map(function (l) { return { title: l }; }),
            onSelect: backContent,
            onBack: backContent
        });
    }

    function playUrl(url, title, list, sref) {
        var p = { url: streamUrl(url, sref), title: title };
        if (isAshdi(url) && (platformIs('tizen') || platformIs('webos'))) p.hls_type = 'native';

        var playlist = list && list.length ? list.map(function (x) {
            return { url: streamUrl(x.url, sref), title: x.title };
        }) : [p];

        noty('Потік: ' + hostOf(url) + (streamViaProxy() && proxy() ? ' (через проксі)' : ''));
        try {
            Lampa.Player.play(p);
            Lampa.Player.playlist(playlist);
        } catch (e) {
            showInfo('Помилка запуску плеєра', [String(e && e.message || e), url]);
        }
    }

    function browseTree(nodes, title, back, ref, sref) {
        Lampa.Select.show({
            title: title,
            items: nodes.map(function (n) { return { title: n.title || '—', node: n }; }),
            onSelect: function (a) {
                var n = a.node;
                if (n.folder) {
                    browseTree(n.folder, n.title || title, function () { browseTree(nodes, title, back, ref, sref); }, ref, sref);
                } else if (n.player) {
                    playIframe(n.player, ref, n.title || title);
                } else {
                    var list = nodes.filter(function (x) { return x.url; }).map(function (x) {
                        return { url: x.url, title: x.title };
                    });
                    playUrl(n.url, n.title || title, list, sref);
                }
            },
            onBack: back || backContent
        });
    }

    function playIframe(iframe, ref, title) {
        noty('Шукаю потік...');
        extractStream(iframe, ref, function (r) {
            if (r.tree) return browseTree(r.tree, title, null, ref, iframe);
            if (r.url) return playUrl(r.url, title, null, iframe);
            showInfo('Не вдалося витягти потік', [r.info, 'Плеєр: ' + iframe]);
        });
    }

    // ===== КЕРУВАННЯ САЙТАМИ =====
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
                dle: true,
                results: 'a[href]',
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
                if (val) list[index][key] = val;
                else delete list[index][key];
                saveSites(list);
            }
            siteMenu(index);
        });
    }

    function testSite(index) {
        var site = loadSites()[index];
        noty('Перевіряю ' + site.name + '...');
        searchSite(site, 'fallout', function (res, info) {
            var items;
            if (res === null) {
                items = [{ title: 'Помилка запиту' }, { title: (info && info.error) || 'без деталей' }];
            } else {
                items = [{ title: 'Знайдено результатів: ' + res.length }];
                if (info) {
                    items.push({ title: 'Метод: ' + info.method });
                    items.push({ title: 'Розмір відповіді: ' + info.len + ' симв.' });
                    items.push({ title: 'Посилань на сторінці: ' + info.anchors });
                    items.push({ title: 'Заголовок сторінки: ' + info.title });
                }
                if (res.length) items.push({ title: 'Перший: ' + res[0].title });
            }
            Lampa.Select.show({
                title: site.name + ': перевірка пошуку',
                items: items,
                onSelect: function () { siteMenu(index); },
                onBack: function () { siteMenu(index); }
            });
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
                { title: 'Режим DLE (POST, потім GET): ' + (s.dle ? 'так' : 'ні'), act: 'dle' },
                { title: 'Шаблон пошуку (без DLE)', subtitle: s.search || '—', act: 'search' },
                { title: 'POST-тіло (без DLE)', subtitle: s.post || '—', act: 'post' },
                { title: 'Шаблон посилань на сторінки (regex)', subtitle: s.linkRe || 'за замовчуванням: /123-назва.html', act: 'linkRe' },
                { title: 'CSS-селектор результатів', subtitle: s.results || 'a[href]', act: 'results' },
                { title: 'Видалити сайт', act: 'delete' }
            ],
            onSelect: function (a) {
                if (a.act === 'toggle') {
                    list[index].enabled = !list[index].enabled;
                    saveSites(list);
                    siteMenu(index);
                } else if (a.act === 'dle') {
                    list[index].dle = !list[index].dle;
                    saveSites(list);
                    siteMenu(index);
                } else if (a.act === 'test') testSite(index);
                else if (a.act === 'name') editField(index, 'name', 'Назва');
                else if (a.act === 'search') editField(index, 'search', 'Шаблон пошуку, напр. /search/{q}/');
                else if (a.act === 'post') editField(index, 'post', 'POST-тіло, напр. do=search&subaction=search&story={q}', true);
                else if (a.act === 'linkRe') editField(index, 'linkRe', 'Regex шляху сторінки, напр. ^/[a-z-]+/[a-z0-9-]+/$', true);
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
        items.push({ title: 'CORS-проксі', subtitle: proxy() || 'не задано', proxy: true });
        items.push({
            title: 'Потік через проксі: ' + (streamViaProxy() ? 'так' : 'ні'),
            subtitle: 'Увімкніть, якщо в браузері відео не запускається',
            streamProxy: true
        });
        items.push({ title: 'Скинути список сайтів', reset: true });

        Lampa.Select.show({
            title: 'Сайти UAFresh',
            items: items,
            onSelect: function (a) {
                if (a.add) addSite();
                else if (a.proxy) {
                    Lampa.Input.edit({ title: 'CORS-проксі (https://проксі/?url=)', value: proxy(), free: true, nosave: true }, function (val) {
                        Lampa.Storage.set('uafresh_proxy', (val || '').trim());
                        hostPref = {};
                        manageSites();
                    });
                } else if (a.streamProxy) {
                    Lampa.Storage.set('uafresh_stream_proxy', !streamViaProxy());
                    manageSites();
                } else if (a.reset) {
                    saveSites([]);
                    mergePresets();
                    noty('Список скинуто');
                    manageSites();
                } else siteMenu(a.index);
            },
            onBack: backContent
        });
    }

    // ===== СТОРІНКА ЛАМПИ: ШАПКА (пошук / Балансер / Фільтр) + СПИСОК СЕРІЙ =====
    var CSS = '' +
        '.uaf-item{position:relative;display:flex;align-items:center;padding:1.2em 1.5em;margin-bottom:1em;border-radius:.4em;background-color:rgba(0,0,0,.3)}' +
        '.uaf-item svg{width:2.4em;height:2.4em;flex:none;margin-right:1em}' +
        '.uaf-item__body{min-width:0}' +
        '.uaf-item__title{font-size:1.7em;line-height:1.2}' +
        '.uaf-item__info{font-size:1.1em;margin-top:.4em;opacity:.9}' +
        '.uaf-item.focus{background-color:#fff;color:#000}' +
        '.uaf-empty{padding:2em 1.5em;border-radius:.4em;background-color:rgba(0,0,0,.3)}' +
        '.uaf-empty__title{font-size:1.6em;margin-bottom:.6em}' +
        '.uaf-empty__line{font-size:1.1em;opacity:.8;margin-top:.3em;word-break:break-word}';

    var PLAY_SVG = '<svg viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<circle cx="64" cy="64" r="56" stroke="currentColor" stroke-width="16"/>' +
        '<path d="M90.4 64.3L50.4 87.4L50.4 41.2L90.4 64.3Z" fill="currentColor"/></svg>';

    function UAFreshComponent(object) {
        var self = this;
        var scroll = new Lampa.Scroll({ mask: true, over: true });
        var files = new Lampa.Explorer(object);
        var filter = new Lampa.Filter(object);
        var movie = object.movie || {};

        var last;
        var found = {};       // назва сайту -> знайдені сторінки
        var siteNames = [];   // сайти, де щось знайдено
        var errs = {};
        var cache = {};       // url сторінки -> список серій
        var view = null;      // { page, eps }
        var current = [];     // серії, що показані зараз
        var token = 0;
        var choice = { site: 0, page: 0, season: 0, voice: 0 };

        function queries() {
            if (object.search) return [object.search];
            var q = [];
            [movie.title || movie.name, movie.original_title || movie.original_name].forEach(function (x) {
                if (x && q.indexOf(x) < 0) q.push(x);
            });
            return q;
        }

        function queryText() {
            return queries()[0] || '';
        }

        function manageItem() {
            return { title: '⚙ Керування сайтами', subtitle: 'Додати, вимкнути, проксі', stype: 'manage', items: [{ title: 'Відкрити', index: 0 }] };
        }

        function setChips() {
            var r = filter.render();
            try {
                r.find('.filter--sort span').text('Балансер');
                r.find('.filter--search div').removeClass('hide').text(queryText());
            } catch (e) {}
        }

        function applyFilters(seasons, voices) {
            var items = [];
            var chosen = [];

            if (view && seasons.length) {
                items.push({
                    title: 'Сезон',
                    subtitle: 'Сезон ' + seasons[choice.season],
                    stype: 'season',
                    items: seasons.map(function (s, i) { return { title: 'Сезон ' + s, index: i, selected: i === choice.season }; })
                });
                chosen.push('Сезон: Сезон ' + seasons[choice.season]);
            }

            if (view && voices.length > 1) {
                items.push({
                    title: 'Озвучка',
                    subtitle: voices[choice.voice],
                    stype: 'voice',
                    items: voices.map(function (v, i) { return { title: v, index: i, selected: i === choice.voice }; })
                });
                chosen.push('Озвучка: ' + voices[choice.voice]);
            }

            var pages = found[siteNames[choice.site]] || [];
            if (pages.length > 1) {
                items.push({
                    title: 'Результат',
                    subtitle: pages[choice.page] && pages[choice.page].title,
                    stype: 'page',
                    items: pages.map(function (p, i) { return { title: p.title, index: i, selected: i === choice.page }; })
                });
            }

            items.push(manageItem());

            filter.set('filter', items);
            filter.set('sort', siteNames.map(function (n, i) {
                return { title: n, source: i, selected: i === choice.site };
            }));
            filter.chosen('filter', chosen);
            filter.chosen('sort', siteNames.length ? [siteNames[choice.site]] : []);
            setChips();
        }

        this.loading = function (on) {
            if (!self.activity) return;
            self.activity.loader(!!on);
            if (!on) self.activity.toggle();
        };

        this.empty = function (msg, lines) {
            view = null;
            current = [];
            scroll.clear();
            applyFilters([], []);

            var box = $('<div class="uaf-empty"></div>');
            box.append($('<div class="uaf-empty__title"></div>').text(msg));
            (lines || []).forEach(function (l) {
                if (l) box.append($('<div class="uaf-empty__line"></div>').text(l));
            });
            scroll.append(box);
            self.loading(false);
        };

        function episodeTitle(ep, page) {
            var base = movie.title || movie.name || page.title;
            return ep.label ? base + ' / ' + ep.label : base;
        }

        function playEpisode(ep, page) {
            var title = episodeTitle(ep, page);
            if (ep.player) return playIframe(ep.player, page.url, title);

            var list = current.filter(function (e) { return e.url; }).map(function (e) {
                return { url: e.url, title: episodeTitle(e, page) };
            });
            playUrl(ep.url, title, list, ep.ref);
        }

        // Фільтри + малювання списку (без повторного завантаження)
        this.list = function () {
            var v = view;
            if (!v) return;

            var isSeries = v.eps.some(function (e) { return e.episode !== null; });
            var seasons = isSeries ? uniq(v.eps.filter(function (e) { return e.season !== null; }).map(function (e) { return e.season; })).sort(function (a, b) { return a - b; }) : [];
            if (choice.season >= seasons.length) choice.season = 0;

            var inSeason = v.eps.filter(function (e) { return !seasons.length || e.season === seasons[choice.season]; });
            var voices = isSeries ? uniq(inSeason.map(function (e) { return e.voice; }).filter(Boolean)) : [];
            if (choice.voice >= voices.length) choice.voice = 0;

            applyFilters(seasons, voices);

            var shown = inSeason.filter(function (e) {
                return voices.length < 2 || e.voice === voices[choice.voice];
            });
            if (isSeries) {
                shown.sort(function (a, b) { return ((a.episode || 0) - (b.episode || 0)) || (a._i - b._i); });
            }
            current = shown;

            scroll.clear();

            if (!shown.length) {
                self.empty('Нічого не знайдено на сторінці', [v.err, v.page.url]);
                return;
            }

            shown.forEach(function (ep) {
                var title = ep.label || movie.title || movie.name || v.page.title;
                var info = [ep.q ? ep.q + 'p' : '', ep.voice].filter(Boolean).join(' / ') || v.page.site.name;

                var item = $('<div class="uaf-item selector">' + PLAY_SVG +
                    '<div class="uaf-item__body"><div class="uaf-item__title"></div><div class="uaf-item__info"></div></div></div>');
                item.find('.uaf-item__title').text(title);
                item.find('.uaf-item__info').text(info);

                item.on('hover:enter', function () { playEpisode(ep, v.page); });
                item.on('hover:focus', function (e) {
                    last = e.target;
                    scroll.update($(e.target), true);
                });
                scroll.append(item);
            });

            self.loading(false);
        };

        // Завантаження сторінки обраного сайту
        this.source = function () {
            var name = siteNames[choice.site];
            var page = (found[name] || [])[choice.page];
            if (!page) return self.empty('Нічого не знайдено');

            self.loading(true);
            var my = ++token;

            if (cache[page.url]) {
                view = { page: page, eps: cache[page.url], err: '' };
                return self.list();
            }

            collectEpisodes(page, function (eps, err) {
                if (my !== token) return;
                if (eps && eps.length) cache[page.url] = eps;
                view = { page: page, eps: eps || [], err: err || '' };
                self.list();
            });
        };

        // Пошук по всіх увімкнених сайтах
        this.search = function () {
            var qs = queries();
            var sites = loadSites().filter(function (s) { return s.enabled; });

            found = {};
            siteNames = [];
            errs = {};
            view = null;
            choice = { site: 0, page: 0, season: 0, voice: 0 };
            setChips();

            if (!qs.length) return self.empty('Немає назви для пошуку');
            if (!sites.length) return self.empty('Немає активних сайтів', ['Відкрийте Фільтр → «⚙ Керування сайтами»']);

            self.loading(true);
            var left = sites.length * qs.length;
            var seen = {};

            sites.forEach(function (site) {
                qs.forEach(function (query) {
                    searchSite(site, query, function (res, info) {
                        if (res === null) errs[site.name] = (info && info.error) || 'помилка запиту';
                        (res || []).slice(0, 8).forEach(function (r) {
                            if (seen[r.url]) return;
                            seen[r.url] = 1;
                            (found[site.name] = found[site.name] || []).push(r);
                        });

                        if (--left > 0) return;

                        siteNames = uniq(sites.map(function (s) { return s.name; }).filter(function (n) { return found[n]; }));
                        if (!siteNames.length) {
                            var names = Object.keys(errs);
                            return self.empty(
                                names.length ? 'Не вдалося отримати відповідь від сайтів' : 'Нічого не знайдено',
                                names.map(function (n) { return n + ': ' + errs[n]; })
                            );
                        }
                        self.source();
                    });
                });
            });
        };

        filter.onSearch = function (value) {
            value = (value || '').trim();
            if (!value) return self.start();
            Lampa.Activity.replace({ search: value, clarification: true });
        };

        filter.onBack = function () {
            self.start();
        };

        filter.onSelect = function (type, a, b) {
            Lampa.Select.close();

            if (type === 'sort') {
                if (a.source === choice.site) return self.start();
                choice.site = a.source;
                choice.page = 0;
                choice.season = 0;
                choice.voice = 0;
                return self.source();
            }

            if (a.stype === 'manage') return manageSites();

            choice[a.stype] = b.index;
            if (a.stype === 'page') {
                choice.season = 0;
                choice.voice = 0;
                self.source();
            } else {
                if (a.stype === 'season') choice.voice = 0;
                self.list();
                self.start();
            }
        };

        this.create = function () {
            filter.render().find('.selector').on('hover:focus', function (e) {
                last = e.target;
            });

            files.appendFiles(scroll.render());
            files.appendHead(filter.render());
            scroll.body().addClass('torrent-list');
            scroll.minus(files.render().find('.explorer__files-head'));

            setChips();
            this.search();

            return this.render();
        };

        this.render = function () {
            return files.render();
        };

        this.start = function () {
            if (Lampa.Activity.active().activity !== this.activity) return;

            Lampa.Controller.add('content', {
                toggle: function () {
                    Lampa.Controller.collectionSet(scroll.render(), files.render());
                    Lampa.Controller.collectionFocus(last || false, scroll.render());
                },
                up: function () {
                    if (Navigator.canmove('up')) Navigator.move('up');
                    else Lampa.Controller.toggle('head');
                },
                down: function () {
                    Navigator.move('down');
                },
                right: function () {
                    if (Navigator.canmove('right')) Navigator.move('right');
                    else filter.show(Lampa.Lang.translate('title_filter'), 'filter');
                },
                left: function () {
                    if (Navigator.canmove('left')) Navigator.move('left');
                    else Lampa.Controller.toggle('menu');
                },
                back: this.back.bind(this)
            });

            Lampa.Controller.toggle('content');
        };

        this.back = function () {
            Lampa.Activity.backward();
        };

        this.pause = function () {};
        this.stop = function () {};

        this.destroy = function () {
            token++;
            files.destroy();
            scroll.destroy();
        };
    }

    // ===== КНОПКА В КАРТЦІ ФІЛЬМУ =====
    function initButton() {
        Lampa.Listener.follow('full', function (e) {
            if (e.type !== 'complite') return;

            var btn = $('<div class="full-start__button selector view--uafresh"><span>UAFresh</span></div>');
            btn.on('hover:enter', function () {
                Lampa.Activity.push({
                    url: '',
                    title: 'UAFresh',
                    component: 'uafresh',
                    movie: e.data.movie,
                    page: 1
                });
            });

            var render = e.object.activity.render();
            var anchor = render.find('.view--torrent');
            if (anchor.length) anchor.after(btn);
            else render.find('.full-start__buttons').append(btn);
        });
    }

    // Показує помилку відтворення, щоб було зрозуміло, що саме не так
    function initPlayerHook() {
        try {
            if (Lampa.PlayerVideo && Lampa.PlayerVideo.listener && Lampa.PlayerVideo.listener.follow) {
                Lampa.PlayerVideo.listener.follow('error', function (e) {
                    var text = String(e && (e.error || e.message) || 'помилка плеєра');
                    if (/fatal \[false\]/.test(text)) return;
                    noty('UAFresh: ' + text.slice(0, 120));
                });
            }
        } catch (e) {}
    }

    function init() {
        mergePresets();
        $('<style></style>').text(CSS).appendTo('head');
        Lampa.Component.add('uafresh', UAFreshComponent);
        initButton();
        initPlayerHook();
    }

    if (window.appready) init();
    else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') init();
        });
    }
})();
