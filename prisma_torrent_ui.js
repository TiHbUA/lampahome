(function () {
    'use strict';

    if (window.torrent_pretty_plugin) return;
    window.torrent_pretty_plugin = true;

    var CSS = '\
.torrent-item.tp-done{padding:0!important;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.07);border-radius:1em;margin-bottom:.7em;overflow:hidden}\
.torrent-item.tp-done.focus{background:rgba(255,255,255,.1);box-shadow:0 0 0 .2em #fff}\
.torrent-item.tp-done>*:not(.tp-row):not(.tp-foot){display:none!important}\
.tp-row{display:flex;align-items:center;padding:.9em 1.2em;gap:1.2em}\
.tp-q{flex:0 0 6.5em;line-height:1.3}\
.tp-q b{display:block;font-size:1.45em;font-weight:700;color:#fff}\
.tp-q b.q4k{color:#f5c542}\
.tp-q em{display:block;font-style:normal;font-weight:700;color:#f5c542;font-size:.85em}\
.tp-br{font-size:.85em;color:#9aa;white-space:nowrap}\
.tp-br strong{color:#d7dede;font-weight:700;margin-right:.2em}\
.tp-br span{font-size:.85em}\
.tp-main{flex:1;min-width:0}\
.tp-title{font-size:1.15em;font-weight:600;line-height:1.3;margin-bottom:.45em;word-break:break-word}\
.tp-badges{display:flex;flex-wrap:wrap;gap:.5em;margin-bottom:.45em}\
.tp-badge{display:inline-flex;align-items:center;gap:.4em;background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.06);border-radius:.5em;padding:.25em .7em;font-size:.95em;font-weight:600}\
.tp-badge svg{width:.85em;height:.85em;fill:currentColor}\
.tp-meta{display:flex;flex-wrap:wrap;gap:.3em 1.2em;font-size:.9em;color:#9aa}\
.tp-side{flex:0 0 auto;text-align:right}\
.tp-seeds{font-size:1.6em;font-weight:700;display:flex;align-items:center;justify-content:flex-end;gap:.3em;line-height:1.1}\
.tp-seeds.hi{color:#4ade80}.tp-seeds.mid{color:#facc15}.tp-seeds.lo{color:#f87171}\
.tp-bars{display:inline-flex;align-items:flex-end;gap:.12em;height:.75em}\
.tp-bars i{display:block;width:.15em;background:currentColor;border-radius:.05em;opacity:.25}\
.tp-bars i.on{opacity:1}\
.tp-bars i:nth-child(1){height:30%}.tp-bars i:nth-child(2){height:55%}.tp-bars i:nth-child(3){height:80%}.tp-bars i:nth-child(4){height:100%}\
.tp-lbl{font-size:.7em;font-weight:700;letter-spacing:.12em;color:#9aa;margin:.1em 0 .5em}\
.tp-chips{display:flex;gap:.5em;justify-content:flex-end}\
.tp-chip{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.1);border-radius:.45em;padding:.2em .6em;font-size:.95em;font-weight:700;white-space:nowrap;color:#fff}\
.tp-chip span{font-weight:400;color:#aab}\
.tp-foot{display:flex;align-items:center;gap:.9em;padding:.7em 1.2em;background:rgba(255,255,255,.07)}\
.tp-foot-ico{flex:0 0 1.7em;height:1.7em;border:.12em solid #4ade80;border-radius:50%;color:#4ade80;display:flex;align-items:center;justify-content:center;font-weight:700;line-height:1}\
.tp-foot-t{font-weight:700;font-size:1.05em;line-height:1.25}\
.tp-foot-s{font-size:.85em;color:#9aa}\
@media (max-width:700px){.tp-row{flex-wrap:wrap}.tp-q{flex-basis:5em}.tp-side{flex-basis:100%;text-align:left}.tp-seeds,.tp-chips{justify-content:flex-start}}';

    var MIC = '<svg viewBox="0 0 24 24"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/></svg>';

    var DUB_RE = /Дубляж|Дубл(?![а-яіїє])|ДБ(?![А-Яа-яІіЇїЄє])|\bDUB\b/i;

    var TRANSLATIONS = [
        [DUB_RE, 'Дубляж'], [/HDRezka/i, 'HDRezka'], [/LostFilm/i, 'LostFilm'],
        [/TVShows/i, 'TVShows'], [/Jaskier/i, 'Jaskier'], [/ColdFilm/i, 'ColdFilm'],
        [/Кубик/i, 'Кубик в кубе'], [/AMEDIA/i, 'AMEDIA'], [/\bUkr\b|Укр/i, 'UKR'],
        [/\bMVO\b/i, 'MVO'], [/\bAVO\b/i, 'AVO']
    ];

    function txt(el, sel) {
        var n = el.querySelector(sel);
        return n ? n.textContent.replace(/\s+/g, ' ').trim() : '';
    }

    function num(s) {
        var m = String(s).match(/\d+/);
        return m ? parseInt(m[0], 10) : 0;
    }

    function detectQuality(t) {
        if (/2160p|\b4K\b|UHD/i.test(t)) return { label: '2160p', tag: '4K', cls: 'q4k', hd: true };
        if (/1080p|1080i|FHD/i.test(t)) return { label: '1080p', tag: 'FHD', cls: '', hd: true };
        if (/720p/i.test(t)) return { label: '720p', tag: 'HD', cls: '', hd: true };
        if (/480p|DVDRip|DLRip|\bSD\b|TVRip|HDTVRip/i.test(t)) return { label: '480p', tag: 'SD', cls: '', hd: false };
        return { label: '—', tag: '', cls: '', hd: false };
    }

    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text !== undefined) e.textContent = text;
        return e;
    }

    function build(item) {
        if (item.classList.contains('tp-done')) return;

        var title = txt(item, '.torrent-item__title');
        if (!title) return; // ще не заповнено

        var q = detectQuality(title);
        var seeds = num(txt(item, '.torrent-item__seeds span') || txt(item, '.torrent-item__seeds'));
        var grabs = num(txt(item, '.torrent-item__grabs span') || txt(item, '.torrent-item__grabs'));
        var size = txt(item, '.torrent-item__size');
        var tracker = txt(item, '.torrent-item__tracker');
        var date = txt(item, '.torrent-item__date');
        var bitrate = txt(item, '.torrent-item__bitrate');

        var row = el('div', 'tp-row');

        // Ліва колонка: якість + бітрейт в один рядок
        var left = el('div', 'tp-q');
        left.appendChild(el('b', q.cls, q.label));
        if (/Dolby\s*Vision|\bDV\b/i.test(title)) left.appendChild(el('em', '', 'DV'));

        var brNum = '', brUnit = '';
        if (bitrate) {
            var bm = bitrate.replace(/^[^\d]*/, '').match(/^([\d.,]+)\s*(.*)$/);
            if (bm) { brNum = bm[1]; brUnit = bm[2]; }
        }
        if (brNum) {
            var br = el('div', 'tp-br');
            br.appendChild(el('strong', '', brNum));
            if (brUnit) br.appendChild(el('span', '', brUnit));
            left.appendChild(br);
        }
        row.appendChild(left);

        // Центр
        var main = el('div', 'tp-main');
        main.appendChild(el('div', 'tp-title', title));

        var badges = el('div', 'tp-badges');
        if (/HDR/i.test(title)) badges.appendChild(el('span', 'tp-badge', '☀ HDR'));
        if (/Dolby\s*Vision|\bDV\b/i.test(title)) badges.appendChild(el('span', 'tp-badge', 'Dolby Vision'));
        if (q.tag) badges.appendChild(el('span', 'tp-badge', q.tag));

        var hasDub = DUB_RE.test(title);
        for (var i = 0; i < TRANSLATIONS.length; i++) {
            if (TRANSLATIONS[i][0].test(title)) {
                var b = el('span', 'tp-badge');
                b.innerHTML = MIC;
                b.appendChild(document.createTextNode(TRANSLATIONS[i][1]));
                badges.appendChild(b);
            }
        }
        if (badges.childNodes.length) main.appendChild(badges);

        var meta = el('div', 'tp-meta');
        if (date) meta.appendChild(el('span', '', date));
        if (tracker) meta.appendChild(el('span', '', tracker));
        main.appendChild(meta);
        row.appendChild(main);

        // Права колонка
        var side = el('div', 'tp-side');
        var level = seeds >= 100 ? 'hi' : seeds >= 20 ? 'mid' : 'lo';
        var bars = seeds >= 100 ? 4 : seeds >= 50 ? 3 : seeds >= 10 ? 2 : seeds > 0 ? 1 : 0;

        var s = el('div', 'tp-seeds ' + level);
        s.appendChild(el('span', '', String(seeds)));
        var bb = el('span', 'tp-bars');
        for (var k = 1; k <= 4; k++) bb.appendChild(el('i', k <= bars ? 'on' : ''));
        s.appendChild(bb);
        side.appendChild(s);
        side.appendChild(el('div', 'tp-lbl', 'РОЗДАЮТЬ'));

        var chips = el('div', 'tp-chips');
        var c1 = el('span', 'tp-chip');
        c1.appendChild(el('span', '', 'Качають: '));
        c1.appendChild(document.createTextNode(String(grabs)));
        chips.appendChild(c1);
        if (size) chips.appendChild(el('span', 'tp-chip', size));
        side.appendChild(chips);
        row.appendChild(side);

        item.setAttribute('data-tp-seeds', seeds);
        item.setAttribute('data-tp-q', q.hd ? q.label : '');
        item.setAttribute('data-tp-hd', q.hd ? '1' : '');
        item.setAttribute('data-tp-dub', hasDub ? '1' : '');
        item.setAttribute('data-tp-br', brNum);

        item.appendChild(row);
        item.classList.add('tp-done');
    }

    // Смужки знизу: «Рекомендовано» (одна) та «Багато роздавальників (N)»
    function updateFooters() {
        var all = document.querySelectorAll('.torrent-item.tp-done');
        if (!all.length) return;

        // Сортуємо за кількістю роздаючих: 1-ша — «Рекомендовано», наступні 3 — «Багато роздавальників»
        var sorted = Array.prototype.slice.call(all).sort(function (a, b) {
            return (parseInt(b.getAttribute('data-tp-seeds'), 10) || 0) -
                   (parseInt(a.getAttribute('data-tp-seeds'), 10) || 0);
        });

        for (var j = 0; j < all.length; j++) {
            var item = all[j];
            var seeds = parseInt(item.getAttribute('data-tp-seeds'), 10) || 0;
            var pos = sorted.indexOf(item);
            var kind = '';
            if (seeds > 0) {
                if (pos === 0) kind = 'rec';
                else if (pos <= 3) kind = 'many';
            }

            var key = kind ? kind + '|' + seeds : '';
            if ((item.getAttribute('data-tp-foot') || '') === key) continue; // нічого не міняємо

            var old = item.querySelector('.tp-foot');
            if (old) old.parentNode.removeChild(old);
            item.setAttribute('data-tp-foot', key);
            if (!kind) continue;

            var foot = el('div', 'tp-foot');
            foot.appendChild(el('div', 'tp-foot-ico', '✓'));
            var box = el('div', '');
            box.appendChild(el('div', 'tp-foot-t',
                kind === 'rec' ? 'Рекомендовано' : 'Багато роздавальників (' + seeds + ')'));

            var qlabel = item.getAttribute('data-tp-q');
            var brv = parseFloat(String(item.getAttribute('data-tp-br')).replace(',', '.'));
            var parts = [];
            if (qlabel) parts.push(qlabel);
            if (brv) parts.push(Math.round(brv) + ' Mbps');
            if (parts.length) box.appendChild(el('div', 'tp-foot-s', parts.join(' • ')));

            foot.appendChild(box);
            item.appendChild(foot);
        }
    }

    function scan() {
        var items = document.querySelectorAll('.torrent-item:not(.tp-done)');
        for (var i = 0; i < items.length; i++) {
            try { build(items[i]); } catch (e) { /* не ламаємо Lampa */ }
        }
        try { updateFooters(); } catch (e) {}
    }

    function start() {
        var style = document.createElement('style');
        style.textContent = CSS;
        document.head.appendChild(style);

        scan();

        var timer = null;
        new MutationObserver(function () {
            clearTimeout(timer);
            timer = setTimeout(scan, 50);
        }).observe(document.body, { childList: true, subtree: true });
    }

    if (window.appready) start();
    else if (window.Lampa && Lampa.Listener) {
        Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') start(); });
    } else {
        document.addEventListener('DOMContentLoaded', start);
    }
})();
