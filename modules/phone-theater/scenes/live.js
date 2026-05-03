import { escapeHtml, escapeHtmlAttr } from '../../utils/dom-escape.js';
import { buildTheaterDeleteKey } from '../core/delete-key.js';
import { getCellByHeader, mapTheaterRows, normalizeText, resolveRowIdentity, splitSemicolonText } from '../core/table-index.js';

const BARRAGE_OVERLAY_LIMIT = 12;
const BARRAGE_DELAY_STEP = 1.6;
const BARRAGE_MIN_DURATION = 10;
const BARRAGE_MAX_DURATION = 18;
const PAUSED_CLASS = 'is-barrage-paused';
const TEXT_PAUSE = '暂停弹幕';
const TEXT_RESUME = '继续弹幕';

const LIVE_TABLES = Object.freeze({
    rooms: '直播间主表',
    barrageBands: '直播间弹幕分栏表',
});

function buildViewModel(resolved) {
    const roomsTable = resolved.tables.rooms;
    const barrageTable = resolved.tables.barrageBands;

    const barragesByRoom = new Map();
    mapTheaterRows(barrageTable, (row) => {
        const roomName = normalizeText(getCellByHeader(barrageTable, row, '所属直播间名'));
        if (!roomName) return null;
        const item = {
            fan: splitSemicolonText(getCellByHeader(barrageTable, row, '粉丝弹幕串')),
            hater: splitSemicolonText(getCellByHeader(barrageTable, row, '黑子弹幕串')),
            other: splitSemicolonText(getCellByHeader(barrageTable, row, '其他弹幕串')),
            rhythm: normalizeText(getCellByHeader(barrageTable, row, '节奏标签')),
            time: normalizeText(getCellByHeader(barrageTable, row, '时间文本')),
            status: normalizeText(getCellByHeader(barrageTable, row, '状态标签')),
        };
        if (!barragesByRoom.has(roomName)) barragesByRoom.set(roomName, []);
        barragesByRoom.get(roomName).push(item);
        return item;
    });

    const rooms = mapTheaterRows(roomsTable, (row, rowIndex) => {
        const roomName = resolveRowIdentity(roomsTable, row, '直播间名', '直播间 ', rowIndex);
        return {
            roomName,
            deleteKey: buildTheaterDeleteKey('room', rowIndex, roomName),
            rowIndex,
            streamer: normalizeText(getCellByHeader(roomsTable, row, '主播名', '主播')) || '主播',
            tag: normalizeText(getCellByHeader(roomsTable, row, '主播标签')),
            title: normalizeText(getCellByHeader(roomsTable, row, '直播标题')),
            liveStatus: normalizeText(getCellByHeader(roomsTable, row, '当前状态')),
            summary: normalizeText(getCellByHeader(roomsTable, row, '直播内容概述')),
            mood: normalizeText(getCellByHeader(roomsTable, row, '房间气氛')),
            interaction: normalizeText(getCellByHeader(roomsTable, row, '观看/互动数据')),
            time: normalizeText(getCellByHeader(roomsTable, row, '时间文本')),
            status: normalizeText(getCellByHeader(roomsTable, row, '状态标签')),
            barrages: barragesByRoom.get(roomName) || [],
        };
    });

    return { rooms };
}

function collectDeletableKeys(viewModel) {
    return (viewModel?.content?.rooms || []).map(room => room?.deleteKey).filter(Boolean);
}

function flattenRoomBarrages(barrages) {
    const items = [];
    barrages.forEach((band) => {
        (band.fan || []).forEach((text) => {
            const value = normalizeText(text);
            if (!value) return;
            items.push({ text: value, type: 'fan' });
        });
        (band.other || []).forEach((text) => {
            const value = normalizeText(text);
            if (!value) return;
            items.push({ text: value, type: 'other' });
        });
        (band.hater || []).forEach((text) => {
            const value = normalizeText(text);
            if (!value) return;
            items.push({ text: value, type: 'hater' });
        });
    });
    return items;
}

function buildBarrageOverlayItems(items) {
    const limited = items.slice(0, BARRAGE_OVERLAY_LIMIT);
    const trackCounter = { fan: 0, other: 0, hater: 0 };
    return limited.map((item, index) => {
        let track;
        if (item.type === 'fan') {
            track = trackCounter.fan % 3;
            trackCounter.fan += 1;
        } else if (item.type === 'other') {
            track = 3 + (trackCounter.other % 2);
            trackCounter.other += 1;
        } else {
            track = 5;
        }
        const length = item.text.length;
        const rawDuration = 8 + length * 0.25;
        const duration = Math.min(BARRAGE_MAX_DURATION, Math.max(BARRAGE_MIN_DURATION, rawDuration));
        const delay = Number((index * BARRAGE_DELAY_STEP).toFixed(2));
        return {
            ...item,
            track,
            delay,
            duration: Number(duration.toFixed(2)),
        };
    });
}

function renderLiveBarrageOverlay(items) {
    const overlayItems = buildBarrageOverlayItems(items);
    if (overlayItems.length <= 0) {
        return '<div class="phone-theater-barrage-overlay" aria-hidden="true"></div>';
    }
    return `
        <div class="phone-theater-barrage-overlay" aria-hidden="true">
            ${overlayItems.map(item => `
                <div class="phone-theater-barrage-rail" style="--phone-theater-barrage-track:${item.track};">
                    <span class="phone-theater-barrage-pill is-${item.type}" style="--phone-theater-barrage-delay:${item.delay}s;--phone-theater-barrage-duration:${item.duration}s;">${escapeHtml(item.text)}</span>
                </div>
            `).join('')}
        </div>
    `;
}

function renderLiveStage(room, items, renderKit) {
    const metricsParts = splitSemicolonText(room.interaction);
    const metricsHtml = metricsParts.map(part => `<span class="phone-theater-live-metric">${escapeHtml(part)}</span>`).join('');
    const isLive = /直播|live|on/i.test(room.liveStatus || '');
    return `
        <section class="phone-theater-live-stage" aria-label="直播舞台">
            <div class="phone-theater-live-bg" aria-hidden="true">
                <span class="phone-theater-live-glow phone-theater-live-glow-a"></span>
                <span class="phone-theater-live-glow phone-theater-live-glow-b"></span>
                <span class="phone-theater-live-glow phone-theater-live-glow-c"></span>
                <svg class="phone-theater-live-wave" viewBox="0 0 320 60" preserveAspectRatio="none" aria-hidden="true">
                    <path d="M0 30 Q 40 10 80 30 T 160 30 T 240 30 T 320 30" fill="none" stroke="currentColor" stroke-width="1"></path>
                    <path d="M0 30 Q 40 50 80 30 T 160 30 T 240 30 T 320 30" fill="none" stroke="currentColor" stroke-width="1" opacity="0.6"></path>
                </svg>
            </div>
            <header class="phone-theater-live-topbar">
                <div class="phone-theater-live-badge ${isLive ? 'is-on-air' : ''}">
                    <span class="phone-theater-live-dot" aria-hidden="true"></span>
                    <span>${escapeHtml(room.liveStatus || '直播间')}</span>
                </div>
                <div class="phone-theater-live-metrics">
                    ${metricsHtml}
                    ${room.time ? `<span class="phone-theater-live-metric is-time">${escapeHtml(room.time)}</span>` : ''}
                </div>
            </header>
            <div class="phone-theater-live-center">
                <div class="phone-theater-live-room-title">${escapeHtml(room.roomName)}</div>
                ${room.title ? `<div class="phone-theater-live-topic">${escapeHtml(room.title)}</div>` : ''}
                <div class="phone-theater-live-streamer">
                    <span class="phone-theater-live-streamer-name">${escapeHtml(room.streamer)}</span>
                    ${room.tag ? `<span class="phone-theater-live-streamer-tag">${escapeHtml(room.tag)}</span>` : ''}
                </div>
            </div>
            ${renderLiveBarrageOverlay(items)}
            <footer class="phone-theater-live-mood-row">
                ${room.mood ? renderKit.renderTag(room.mood, 'is-mood') : ''}
                ${room.status ? renderKit.renderTag(room.status, 'is-status') : ''}
            </footer>
        </section>
    `;
}

function renderLiveSummaryCard(room, renderKit) {
    if (!room.summary && !room.mood && !room.status) return '';
    const metaItems = [
        room.mood ? `房间气氛 · ${room.mood}` : '',
        room.status ? `状态 · ${room.status}` : '',
    ];
    return `
        <section class="phone-theater-live-summary-card" aria-label="聊天摘要">
            <div class="phone-theater-section-title">聊天摘要</div>
            <div class="phone-theater-body-text">${escapeHtml(room.summary || '（暂无概述）')}</div>
            ${renderKit.renderMetaLine(metaItems)}
        </section>
    `;
}

function getBarragePoolStatus(room) {
    const first = Array.isArray(room.barrages) && room.barrages.length > 0 ? room.barrages[0] : null;
    return normalizeText(first?.status) || '正常滚动';
}

function getBarrageTypeLabel(type) {
    if (type === 'fan') return '粉丝';
    if (type === 'hater') return '黑子';
    return '路人';
}

function renderLiveBarragePool(items, room, renderKit) {
    if (items.length <= 0) {
        return `
            <section class="phone-theater-barrage-pool" aria-label="弹幕池">
                <div class="phone-theater-barrage-pool-head">
                    <span class="phone-theater-section-title">弹幕池</span>
                </div>
                ${renderKit.renderEmpty('暂无弹幕切片')}
            </section>
        `;
    }
    const statusText = getBarragePoolStatus(room);
    return `
        <section class="phone-theater-barrage-pool" aria-label="弹幕池">
            <div class="phone-theater-barrage-pool-head">
                <span class="phone-theater-section-title">弹幕池</span>
                <span class="phone-theater-barrage-pool-status">${escapeHtml(statusText)}</span>
            </div>
            <ul class="phone-theater-barrage-pool-list">
                ${items.map(item => `
                    <li class="phone-theater-barrage-pool-item is-${item.type}">
                        <span class="phone-theater-barrage-pool-tag">${escapeHtml(getBarrageTypeLabel(item.type))}</span>
                        <span class="phone-theater-barrage-pool-text">${escapeHtml(item.text)}</span>
                    </li>
                `).join('')}
            </ul>
        </section>
    `;
}

function renderLiveControls() {
    return `
        <footer class="phone-theater-live-controls" aria-label="直播控制">
            <span class="phone-theater-live-input" role="presentation">说点什么…</span>
            <button type="button" class="phone-theater-barrage-toggle" aria-pressed="false">暂停弹幕</button>
        </footer>
    `;
}

function renderContent(viewModel, uiState = {}, renderKit) {
    const rooms = viewModel?.content?.rooms || [];
    if (rooms.length <= 0) return renderKit.renderEmpty(viewModel.emptyText);
    return `
        <div class="phone-theater-live-page">
            ${rooms.map((room) => {
        const items = flattenRoomBarrages(room.barrages || []);
        const selected = uiState.deleteManageMode && uiState.selectedKeys?.has(room.deleteKey);
        return `
                    <article class="phone-theater-live-room ${selected ? 'is-delete-selected' : ''}" data-room-name="${escapeHtmlAttr(room.roomName)}" data-theater-delete-key="${escapeHtmlAttr(room.deleteKey)}">
                        ${renderKit.renderDeleteSelectButton(room.deleteKey, uiState)}
                        ${renderLiveStage(room, items, renderKit)}
                        ${renderLiveSummaryCard(room, renderKit)}
                        ${renderLiveBarragePool(items, room, renderKit)}
                        ${renderLiveControls()}
                    </article>
                `;
    }).join('')}
        </div>
    `;
}

function deleteEntities(context) {
    const { tables, selectedSet, filterTableRows, buildDeleteTargets, hasDeleteTarget } = context;
    const roomsTable = tables.rooms;
    const barrageTable = tables.barrageBands;
    const roomTargets = buildDeleteTargets(selectedSet, 'room');
    const roomNames = new Set();

    const roomDeletion = filterTableRows(roomsTable, (row, rowIndex) => {
        const roomName = resolveRowIdentity(roomsTable, row, '直播间名', '直播间 ', rowIndex);
        const matched = hasDeleteTarget(roomTargets, rowIndex, roomName);
        if (matched) roomNames.add(roomName);
        return matched;
    });

    let removed = roomDeletion.removed;
    if (roomNames.size > 0) {
        removed += filterTableRows(barrageTable, (row) => {
            const roomName = normalizeText(getCellByHeader(barrageTable, row, '所属直播间名'));
            return roomNames.has(roomName);
        }).removed;
    }

    return { removed };
}

function findClosestRoom(element) {
    if (!(element instanceof HTMLElement)) return null;
    const room = element.closest('.phone-theater-live-room');
    return room instanceof HTMLElement ? room : null;
}

function applyToggleState(toggleButton, room, paused) {
    room.classList.toggle(PAUSED_CLASS, paused);
    toggleButton.setAttribute('aria-pressed', paused ? 'true' : 'false');
    toggleButton.textContent = paused ? TEXT_RESUME : TEXT_PAUSE;
}

function bindBarrageToggle(toggleButton, context = {}) {
    const room = findClosestRoom(toggleButton);
    if (!room) return;
    const initiallyPressed = toggleButton.getAttribute('aria-pressed') === 'true';
    applyToggleState(toggleButton, room, initiallyPressed);

    if (toggleButton.dataset.phoneTheaterBarrageBound === 'true') return;
    toggleButton.dataset.phoneTheaterBarrageBound = 'true';

    const handleClick = (event) => {
        event.preventDefault();
        if (typeof context.isActive === 'function' && !context.isActive()) return;
        if (typeof context.isDisposed === 'function' && context.isDisposed()) return;
        const currentRoom = findClosestRoom(toggleButton);
        if (!currentRoom) return;
        const nowPaused = !currentRoom.classList.contains(PAUSED_CLASS);
        applyToggleState(toggleButton, currentRoom, nowPaused);
    };

    if (typeof context.addEventListener === 'function') {
        context.addEventListener(toggleButton, 'click', handleClick);
        return;
    }

    toggleButton.addEventListener('click', handleClick);
}

function bindInteractions(container, context = {}) {
    if (!(container instanceof HTMLElement)) return;
    container.querySelectorAll('.phone-theater-barrage-toggle').forEach((node) => {
        if (node instanceof HTMLElement) {
            bindBarrageToggle(node, context);
        }
    });
}

export const liveScene = Object.freeze({
    id: 'live',
    appKey: '__theater_live',
    name: '直播',
    iconText: '播',
    iconColors: ['#AF52DE', '#FF2D55'],
    orderNo: 3,
    title: '直播',
    subtitle: '直播间弹幕页',
    emptyText: '暂无直播间内容',
    styleScope: 'live',
    primaryTableRole: 'rooms',
    tables: LIVE_TABLES,
    fieldSchema: Object.freeze({
        rooms: Object.freeze({ identity: '直播间名' }),
        barrageBands: Object.freeze({ parentRef: '所属直播间名' }),
    }),
    contract: Object.freeze({
        styleFile: 'styles/phone-theater/live.css',
        requiredClasses: [
            'phone-theater-live-page',
            'phone-theater-live-room',
            'phone-theater-live-stage',
            'phone-theater-barrage-overlay',
            'phone-theater-barrage-pool',
            'phone-theater-barrage-toggle',
            'is-barrage-paused',
        ],
    }),
    buildViewModel,
    collectDeletableKeys,
    deleteEntities,
    renderContent,
    bindInteractions,
});
