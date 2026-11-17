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

            var tree = order.map(function (g) { return { title: g, folder: groups[g] }; });
            if (tree.length === 1) tree = tree[0].folder;
            cb(tree);
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

    // "[360]url,[720]url" або "url1 or url2" -> найкраща якість
    function pickUrl(f) {
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
            if (q > bestQ) { best = u; bestQ = q; }
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
                var u = pickUrl(n.file);
                if (u) out.push({ title: title, url: u });
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

        var u = pickUrl(file);
        return u ? { url: u } : null;
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

    // cb({tree}) | cb({url}) | cb({info})
    function extractStream(iframe, ref, cb) {
        get(iframe, function (html) {
            var d;
            try {
                html = String(html);
                d = playerjsData(html);
                if (d && d.tree) return cb({ tree: d.tree });
                if (d && d.url) return cb({ url: d.url });

                var clean = html.replace(/\\\//g, '/');
                var one = clean.match(/https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*/) || clean.match(/https?:\/\/[^"'\s\\]+\.mp4[^"'\s\\]*/);
                if (one) return cb({ url: one[0] });

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

    function pickPlayer(page) {
        noty('Завантажую сторінку...');
        loadPage(page, function (info, err) {
            if (!info) return showInfo('Сторінку не вдалося завантажити', [err || 'невідома помилка', page.url]);

            var viaIframes = function () {
                if (!info.iframes.length) return noty('Плеєрів на сторінці не знайдено');
                if (info.iframes.length === 1) return playIframe(info.iframes[0], page.url, page.title);

                Lampa.Select.show({
                    title: 'Оберіть плеєр',
                    items: info.iframes.map(function (u, i) {
                        return { title: 'Плеєр ' + (i + 1) + ' (' + hostOf(u) + ')', url: u };
                    }),
                    onSelect: function (a) { playIframe(a.url, page.url, page.title); },
                    onBack: backContent
                });
            };

            if (!info.playlist) return viaIframes();

            loadPlaylist(page, info.playlist, function (tree) {
                if (tree.length) browseTree(tree, page.title, null, page.url);
                else viaIframes();
            });
        });
    }

    function startSearch(movie) {
        var queries = [];
        [movie.title || movie.name, movie.original_title || movie.original_name].forEach(function (q) {
            if (q && queries.indexOf(q) < 0) queries.push(q);
        });
        if (!queries.length) return noty('Немає назви для пошуку');

        var sites = loadSites().filter(function (s) { return s.enabled; });
        if (!sites.length) return noty('Немає активних сайтів. Відкрийте UAFresh → «⚙ Керування сайтами»');

        var all = [];
        var seen = {};
        var errList = {};
        var total = sites.length * queries.length;
        var left = total;
        noty('Шукаю: ' + queries[0]);

        sites.forEach(function (site) {
            queries.forEach(function (query) {
                searchSite(site, query, function (res, info) {
                    if (res === null) errList[site.name] = info && info.error || 'помилка запиту';
                    (res || []).slice(0, 8).forEach(function (r) {
                        if (seen[r.url]) return;
                        seen[r.url] = 1;
                        all.push(r);
                    });

                    if (--left > 0) return;

                    var items = all.map(function (r) {
                        return { title: r.title, subtitle: r.site.name, page: r };
                    });

                    var title = 'UAFresh: результати';
                    if (!all.length) {
                        var names = Object.keys(errList);
                        title = names.length ? 'Не вдалося отримати відповідь від сайтів' : 'Нічого не знайдено';
                        names.forEach(function (n) {
                            items.push({ title: n + ': ' + errList[n] });
                        });
                    }
                    items.push({ title: '⚙ Керування сайтами', manage: true });

                    Lampa.Select.show({
                        title: title,
                        items: items,
                        onSelect: function (a) {
                            if (a.manage) manageSites();
                            else if (a.page) pickPlayer(a.page);
                            else backContent();
                        },
                        onBack: backContent
                    });
                });
            });
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
