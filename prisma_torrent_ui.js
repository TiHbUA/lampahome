
(function () {
'use strict';

if (window.__prisma_torrent_ui_v02_loaded) return;
window.__prisma_torrent_ui_v02_loaded = true;

var STYLE_ID = 'prisma-torrent-ui';

var css = `
.torrent-list .torrent-item {
    display: grid !important;
    grid-template-columns: 5.1em minmax(0,1fr) auto !important;
    grid-template-rows: auto auto auto auto auto !important;
    column-gap: .65em !important;
    row-gap: .22em !important;
    align-items: center !important;
    box-sizing: border-box !important;
    position: relative !important;
    padding: .85em 1em !important;
    margin: 0 0 .65em !important;
    border: 1px solid rgba(255,255,255,.13) !important;
    border-radius: 1em !important;
    background: linear-gradient(145deg,#111,#080808) !important;
    line-height: 1.25 !important;
    overflow: hidden !important;
}

.torrent-list .torrent-item > .torrent-item__title {
    grid-column: 2 / 4 !important;
    grid-row: 1 !important;
    min-width: 0 !important;
    margin: 0 0 .18em !important;
    color: #f5f5f5 !important;
    font-size: 1.16em !important;
    font-weight: 500 !important;
    line-height: 1.27 !important;
    white-space: normal !important;
    overflow-wrap: anywhere !important;
}

.torrent-list .torrent-item > .torrent-item__details {
    display: contents !important;
}

.torrent-list .torrent-item > .torrent-item__ffprobe {
    grid-column: 2 / 4 !important;
    grid-row: 2 !important;
    position: relative !important;
    display: flex !important;
    flex-wrap: wrap !important;
    align-items: center !important;
    gap: .32em !important;
    min-width: 0 !important;
    padding: .05em 0 .15em !important;
    margin: 0 !important;
    float: none !important;
}

.torrent-list .torrent-item > .torrent-item__ffprobe.hide {
    display: none !important;
}

.torrent-list .torrent-item__ffprobe > div {
    float: none !important;
    display: inline-flex !important;
    align-items: center !important;
    margin: 0 !important;
    padding: .25em .48em !important;
    border: 1px solid rgba(255,255,255,.18) !important;
    border-radius: .42em !important;
    background: rgba(255,255,255,.10) !important;
    color: #eee !important;
    font-size: .82em !important;
    line-height: 1.2 !important;
    white-space: nowrap !important;
}

.torrent-list .torrent-item__ffprobe > .m-resolution:first-child {
    position: absolute !important;
    right: calc(100% + .65em) !important;
    top: 0 !important;
    width: 4.45em !important;
    min-height: 1.8em !important;
    justify-content: center !important;
    padding: .18em .2em !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    color: #fff !important;
    font-size: .96em !important;
    font-weight: 800 !important;
}

.torrent-list .torrent-item__bitrate {
    grid-column: 1 !important;
    grid-row: 3 / 6 !important;
    align-self: center !important;
    justify-self: start !important;
    min-width: 0 !important;
    margin: 0 !important;
    color: rgba(255,255,255,.55) !important;
    font-size: 0 !important;
    font-weight: 600 !important;
    line-height: 1.15 !important;
}

.torrent-list .torrent-item__bitrate > span {
    display: block !important;
    margin-top: .18em !important;
    padding: 0 !important;
    background: transparent !important;
    color: rgba(255,255,255,.68) !important;
    font-size: 12px !important;
    font-weight: 600 !important;
}

.torrent-list .torrent-item__date {
    grid-column: 2 !important;
    grid-row: 3 !important;
    min-width: 0 !important;
    margin: 0 !important;
    color: rgba(255,255,255,.62) !important;
    font-size: .86em !important;
    font-weight: 400 !important;
}

.torrent-list .torrent-item__tracker {
    grid-column: 2 !important;
    grid-row: 4 !important;
    min-width: 0 !important;
    margin: 0 !important;
    color: rgba(255,255,255,.58) !important;
    font-size: .84em !important;
    line-height: 1.25 !important;
    white-space: normal !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
}

.torrent-list .torrent-item__seeds {
    grid-column: 3 !important;
    grid-row: 3 !important;
    justify-self: end !important;
    align-self: center !important;
    margin: 0 !important;
    color: #65d69b !important;
    font-size: 0 !important;
    font-weight: 800 !important;
    line-height: 1.05 !important;
    text-align: right !important;
}

.torrent-list .torrent-item__seeds > span {
    display: inline !important;
    padding: 0 !important;
    background: transparent !important;
    color: #65d69b !important;
    font-size: 23px !important;
    font-weight: 800 !important;
}

.torrent-list .torrent-item__seeds::after {
    content: 'РОЗДАЮТЬ' !important;
    display: block !important;
    margin-top: .18em !important;
    color: rgba(255,255,255,.48) !important;
    font-size: 10px !important;
    font-weight: 700 !important;
    letter-spacing: .08em !important;
}

.torrent-list .torrent-item__grabs {
    grid-column: 2 !important;
    grid-row: 5 !important;
    justify-self: start !important;
    margin: 0 !important;
    padding: .16em .48em !important;
    border: 1px solid rgba(255,255,255,.19) !important;
    border-radius: .42em !important;
    background: rgba(255,255,255,.09) !important;
    color: rgba(255,255,255,.65) !important;
    font-size: .82em !important;
    white-space: nowrap !important;
}

.torrent-list .torrent-item__grabs > span {
    padding: 0 !important;
    background: transparent !important;
    color: #fff !important;
    font-weight: 700 !important;
}

.torrent-list .torrent-item__size {
    grid-column: 3 !important;
    grid-row: 5 !important;
    justify-self: end !important;
    margin: 0 !important;
    padding: .16em .5em !important;
    border: 1px solid rgba(255,255,255,.2) !important;
    border-radius: .42em !important;
    background: rgba(255,255,255,.10) !important;
    color: #fff !important;
    font-size: .88em !important;
    font-weight: 700 !important;
    white-space: nowrap !important;
}

.torrent-list .torrent-item.focus {
    background: linear-gradient(145deg,#202020,#111) !important;
}

.torrent-list .torrent-item.focus::after {
    content: '' !important;
    position: absolute !important;
    inset: 0 !important;
    border: 2px solid rgba(255,255,255,.72) !important;
    border-radius: 1em !important;
    pointer-events: none !important;
}

.torrent-filter {
    display: flex !important;
    flex-wrap: wrap !important;
    gap: .4em !important;
    margin-bottom: 1.1em !important;
}

.torrent-filter .simple-button {
    border-radius: .55em !important;
    background: rgba(255,255,255,.09) !important;
    padding: .48em .8em !important;
}

.torrent-filter .simple-button.focus {
    background: rgba(255,255,255,.2) !important;
    box-shadow: inset 0 0 0 1px rgba(255,255,255,.55) !important;
}

@media (max-width:560px) {
    .torrent-list .torrent-item {
        grid-template-columns: 4.25em minmax(0,1fr) auto !important;
        column-gap: .48em !important;
        padding: .72em .75em !important;
        border-radius: .85em !important;
    }

    .torrent-list .torrent-item > .torrent-item__title {
        font-size: 1.02em !important;
    }

    .torrent-list .torrent-item__seeds > span {
        font-size: 19px !important;
    }

    .torrent-list .torrent-item__date,
    .torrent-list .torrent-item__tracker {
        font-size: .78em !important;
    }

    .torrent-list .torrent-item__ffprobe > div {
        font-size: .72em !important;
    }
}
`;

    function inject() {
        var old = document.getElementById(STYLE_ID);
        if (old) old.remove();

        var style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = css;
        document.head.appendChild(style);
    }

    function init() {
        inject();

        if (typeof Lampa !== 'undefined' &&
            Lampa.Listener && Lampa.Listener.follow) {

            Lampa.Listener.follow('app', function () {
                inject();
            });

            Lampa.Listener.follow('torrent', function (event) {
                if (event && event.type === 'render') inject();
            });
        }

        console.log('[Prisma Torrent UI] loaded');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
