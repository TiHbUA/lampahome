(function () {
    'use strict';

    if (window.torrent_pretty_plugin) return;
    window.torrent_pretty_plugin = true;

    var CSS = '\
.torrent-item.tp-done{padding:0!important;background:rgba(255,255,255,.04);border-radius:1.2em;margin-bottom:.8em;overflow:hidden}\
.torrent-item.tp-done.focus{background:rgba(255,255,255,.12);box-shadow:0 0 0 .2em #fff}\
.torrent-item.tp-done>*:not(.tp-row):not(.tp-foot){display:none!important}\
.tp-foot{display:flex;align-items:center;gap:.8em;padding:.8em 1.2em;background:rgba(255,255,255,.07);border-top:1px solid rgba(255,255,255,.08)}\
.tp-foot-ico{flex:0 0 1.6em;height:1.6em;border:.12em solid #4ade80;border-radius:50%;color:#4ade80;display:flex;align-items:center;justify-content:center;font-size:1em;font-weight:700;line-height:1}\
.tp-foot-t{font-weight:700;font-size:1.05em}\
.tp-foot-s{font-size:.85em;color:#9aa}\
.tp-row{display:flex;align-items:center;padding:1em 1.2em;gap:1.2em}\
.tp-q{flex:0 0 6em;text-align:center;line-height:1.3}\
.tp-q b{display:block;font-size:1.3em;font-weight:700;color:#fff}\
.tp-q b.q4k{color:#f5c542}\
.tp-q small{display:block;font-size:.85em;color:#9aa}\
.tp-q em{display:block;font-style:normal;font-weight:700;color:#f5c542;font-size:.9em}\
.tp-main{flex:1;min-width:0}\
.tp-title{font-size:1.25em;font-weight:700;line-height:1.3;margin-bottom:.5em;word-break:break-word}\
.tp-badges{display:flex;flex-wrap:wrap;gap:.5em;margin-bottom:.5em}\
.tp-badge{background:rgba(255,255,255,.1);border-radius:.5em;padding:.25em .7em;font-size:.95em;font-weight:600}\
.tp-meta{font-size:.9em;color:#9aa;line-height:1.5}\
.tp-side{flex:0 0 auto;text-align:right}\
.tp-seeds{font-size:1.7em;font-weight:700;display:flex;align-items:center;justify-content:flex-end;gap:.3em}\
.tp-seeds.hi{color:#4ade80}.tp-seeds.mid{color:#facc15}.tp-seeds.lo{color:#f87171}\
.tp-bars{display:inline-flex;align-items:flex-end;gap:.12em;height:.8em}\
.tp-bars i{display:block;width:.15em;background:currentColor;border-radius:.05em;opacity:.25}\
.tp-bars i.on{opacity:1}\
.tp-bars i:nth-child(1){height:30%}.tp-bars i:nth-child(2){height:55%}.tp-bars i:nth-child(3){height:80%}.tp-bars i:nth-child(4){height:100%}\
.tp-lbl{font-size:.75em;letter-spacing:.1em;color:#9aa;margin-bottom:.5em}\
.tp-chips{display:flex;gap:.5em;justify-content:flex-end}\
.tp-chip{border:1px solid rgba(255,255,255,.25);border-radius:.5em;padding:.2em .6em;font-size:.95em;font-weight:600;white-space:nowrap}\
@media (max-width:700px){.tp-row{flex-wrap:wrap}.tp-q{flex-basis:4.5em}.tp-side{flex-basis:100%;text-align:left}.tp-seeds,.tp-chips{justify-content:flex-start}}';

    var TRANSLATIONS = [
        [/HDRezka/i, 'HDRezka'], [/LostFilm/i, 'LostFilm'], [/Дубляж|Дубл\b|\bDUB\b/i, 'Дубляж'],
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
        if (/2160p|\b4K\b|UHD/i.test(t)) return { label: '2160p', tag: '4K', cls: 'q4k' };
        if (/1080p|1080i|FHD/i.test(t)) return { label: '1080p', tag: 'FHD', cls: '' };
        if (/720p/i.test(t)) return { label: '720p', tag: 'HD', cls: '' };
        if (/480p|DVDRip|DLRip|SD\b|TVRip|HDTVRip/i.test(t)) return { label: '480p', tag: 'SD', cls: 'qlow' };
        return { label: '—', tag: '', cls: 'qlow' };
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

        // Ліва колонка: якість
        var left = el('div', 'tp-q');
        left.appendChild(el('b', q.cls, q.label));
        if (/Dolby\s*Vision|\bDV\b/i.test(title)) left.appendChild(el('em', '', 'DV'));
        var brNum = '', brUnit = '';
        if (bitrate) {
            var bm = bitrate.replace(/^[^\d]*/, '').match(/^([\d.,]+)\s*(.*)$/);
            if (bm) { brNum = bm[1]; brUnit = bm[2]; }
        }
        if (brNum) {
            var bs = el('small', '', brNum);
            bs.style.fontWeight = '700';
            bs.style.color = '#cfd8d8';
            left.appendChild(bs);
            if (brUnit) left.appendChild(el('small', '', brUnit));
        }
        item.setAttribute('data-tp-seeds', seeds);
        item.setAttribute('data-tp-q', q.label);
        item.setAttribute('data-tp-br', brNum);
        row.appendChild(left);

        // Центр: назва, бейджі, дата, трекери
        var main = el('div', 'tp-main');
        main.appendChild(el('div', 'tp-title', title));

        var badges = el('div', 'tp-badges');
        if (/HDR/i.test(title)) badges.appendChild(el('span', 'tp-badge', '☀ HDR'));
        if (/Dolby\s*Vision|\bDV\b/i.test(title)) badges.appendChild(el('span', 'tp-badge', 'Dolby Vision'));
        if (q.tag) badges.appendChild(el('span', 'tp-badge', q.tag));
        for (var i = 0; i < TRANSLATIONS.length; i++) {
            if (TRANSLATIONS[i][0].test(title)) {
                badges.appendChild(el('span', 'tp-badge', '🎙 ' + TRANSLATIONS[i][1]));
                break;
            }
        }
        if (badges.childNodes.length) main.appendChild(badges);

        var meta = el('div', 'tp-meta');
        if (date) meta.appendChild(el('div', '', date));
        if (tracker) meta.appendChild(el('div', '', tracker));
        main.appendChild(meta);
        row.appendChild(main);

        // Права колонка: роздають / качають / розмір
        var side = el('div', 'tp-side');
        var level = seeds >= 100 ? 'hi' : seeds >= 20 ? 'mid' : 'lo';
        var bars = seeds >= 100 ? 4 : seeds >= 50 ? 3 : seeds >= 10 ? 2 : seeds > 0 ? 1 : 0;

        var s = el('div', 'tp-seeds ' + level);
        s.appendChild(el('span', '', String(seeds)));
        var b = el('span', 'tp-bars');
        for (var k = 1; k <= 4; k++) b.appendChild(el('i', k <= bars ? 'on' : ''));
        s.appendChild(b);
        side.appendChild(s);
        side.appendChild(el('div', 'tp-lbl', 'РОЗДАЮТЬ'));

        var chips = el('div', 'tp-chips');
        chips.appendChild(el('span', 'tp-chip', 'Качають: ' + grabs));
        if (size) chips.appendChild(el('span', 'tp-chip', size));
        side.appendChild(chips);
        row.appendChild(side);

        item.appendChild(row);
        item.classList.add('tp-done');
    }

    function markBest() {
        var all = document.querySelectorAll('.torrent-item.tp-done');
        if (!all.length) return;

        var best = null, max = 0;
        for (var i = 0; i < all.length; i++) {
            var sd = parseInt(all[i].getAttribute('data-tp-seeds'), 10) || 0;
            if (sd > max) { max = sd; best = all[i]; }
        }
        if (max < 100) best = null;

        // Якщо смужка вже стоїть де треба і більше ніде — DOM не чіпаємо
        var foots = document.querySelectorAll('.torrent-item .tp-foot');
        if (best && foots.length === 1 && foots[0].parentNode === best) return;
        if (!best && !foots.length) return;

        for (var j = 0; j < foots.length; j++) foots[j].parentNode.removeChild(foots[j]);
        if (!best) return;

        var foot = el('div', 'tp-foot');
        foot.appendChild(el('div', 'tp-foot-ico', '✓'));
        var box = el('div', '');
        box.appendChild(el('div', 'tp-foot-t', 'Багато роздавальників (' + max + ')'));
        var br = parseFloat(String(best.getAttribute('data-tp-br')).replace(',', '.'));
        var sub = best.getAttribute('data-tp-q') + (br ? ' • ' + Math.round(br) + ' Mbps' : '');
        box.appendChild(el('div', 'tp-foot-s', sub));
        foot.appendChild(box);
        best.appendChild(foot);
    }

    function scan(root) {
        var items = (root || document).querySelectorAll('.torrent-item:not(.tp-done)');
        for (var i = 0; i < items.length; i++) {
            try { build(items[i]); } catch (e) { /* не ламаємо Lampa */ }
        }
        try { markBest(); } catch (e) {}
    }

    function start() {
        var style = document.createElement('style');
        style.textContent = CSS;
        document.head.appendChild(style);

        scan(document);

        var timer = null;
        new MutationObserver(function () {
            clearTimeout(timer);
            timer = setTimeout(function () { scan(document); }, 50);
        }).observe(document.body, { childList: true, subtree: true });
    }

    if (window.appready) start();
    else if (window.Lampa && Lampa.Listener) {
        Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') start(); });
    } else {
        document.addEventListener('DOMContentLoaded', start);
    }
})();
