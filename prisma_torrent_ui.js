
(function () {
    'use strict';

    if (window.__prisma_torrent_ui_loaded) return;
    window.__prisma_torrent_ui_loaded = true;

    var css = `
.torrent-list .torrent-item {
    display: grid !important;
    grid-template-columns: 5.2em minmax(0, 1fr) auto !important;
    grid-template-rows: auto auto auto auto !important;
    gap: .25em .65em !important;
    align-items: center !important;
    box-sizing: border-box !important;
    padding: .9em 1em !important;
    margin: 0 0 .65em !important;
    border: 1px solid rgba(255,255,255,.12) !important;
    border-radius: 1em !important;
    background: linear-gradient(145deg,#1b1b1b,#0a0a0a) !important;
    overflow: hidden !important;
}

.torrent-list .torrent-item__title {
    grid-column: 2 / 4 !important;
    grid-row: 1 !important;
    min-width: 0 !important;
    font-size: 1.18em !important;
    font-weight: 500 !important;
    line-height: 1.25 !important;
    white-space: normal !important;
    overflow-wrap: anywhere !important;
}

.torrent-list .torrent-item__details {
    display: contents !important;
}

.torrent-list .torrent-item__bitrate {
    grid-column: 1 !important;
    grid-row: 2 / 5 !important;
    display: flex !important;
    flex-direction: column !important;
    gap: .18em !important;
    color: white !important;
    font-weight: 700 !important;
}

.torrent-list .torrent-item__bitrate > span {
    color: #aaa !important;
    background: transparent !important;
}

.torrent-list .torrent-item__date {
    grid-column: 2 !important;
    grid-row: 2 !important;
    color: #999 !important;
    font-size: .88em !important;
    margin: 0 !important;
}

.torrent-list .torrent-item__tracker {
    grid-column: 2 !important;
    grid-row: 3 !important;
    color: #999 !important;
    font-size: .88em !important;
    margin: 0 !important;
    overflow: hidden !important;
}

.torrent-list .torrent-item__seeds {
    grid-column: 3 !important;
    grid-row: 2 !important;
    justify-self: end !important;
    color: #65d69b !important;
    font-size: 1.12em !important;
    font-weight: 800 !important;
}

.torrent-list .torrent-item__grabs {
    grid-column: 2 !important;
    grid-row: 4 !important;
    justify-self: start !important;
    padding: .16em .45em !important;
    border: 1px solid #444 !important;
    border-radius: .45em !important;
    background: #222 !important;
    color: #bbb !important;
    font-size: .82em !important;
}

.torrent-list .torrent-item__size {
    grid-column: 3 !important;
    grid-row: 3 / 5 !important;
    justify-self: end !important;
    align-self: end !important;
    padding: .16em .5em !important;
    border: 1px solid #444 !important;
    border-radius: .45em !important;
    background: #222 !important;
    color: white !important;
    font-weight: 700 !important;
}

.torrent-list .torrent-item__ffprobe {
    grid-column: 2 / 4 !important;
    grid-row: 5 !important;
    padding-top: .25em !important;
}

.torrent-list .torrent-item__ffprobe > div {
    margin: .25em .35em .1em 0 !important;
    padding: .28em .48em !important;
    border-radius: .45em !important;
    background: #222 !important;
    font-size: .78em !important;
}

.torrent-list .torrent-item.focus {
    background: linear-gradient(145deg,#282828,#111) !important;
}

.torrent-list .torrent-item.focus::after {
    border: .16em solid #ddd !important;
    border-radius: 1.1em !important;
}

@media (max-width:560px) {
    .torrent-list .torrent-item {
        grid-template-columns: 4.3em minmax(0,1fr) auto !important;
        padding: .75em .8em !important;
        column-gap: .5em !important;
    }
    .torrent-list .torrent-item__title {
        font-size: 1.05em !important;
    }
    .torrent-list .torrent-item__tracker,
    .torrent-list .torrent-item__date {
        font-size: .8em !important;
    }
}
`;

    function inject() {
        var old = document.getElementById('prisma-torrent-ui');
        if (old) old.remove();

        var style = document.createElement('style');
        style.id = 'prisma-torrent-ui';
        style.textContent = css;
        document.head.appendChild(style);
    }

    function init() {
        inject();

        if (typeof Lampa !== 'undefined' &&
            Lampa.Listener &&
            Lampa.Listener.follow) {
            Lampa.Listener.follow('app', function () {
                inject();
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
