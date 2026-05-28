import { escapeHtml, escapeHtmlAttr } from '../../utils/dom-escape.js';
import { buildTheaterDeleteKey } from '../core/delete-key.js';
import { getCellByHeader, mapTheaterRows, normalizeText, resolveRowIdentity, splitSemicolonText } from '../core/table-index.js';

const BARRAGE_TONES = Object.freeze(['rose', 'blue', 'violet', 'gold', 'mint']);
const BARRAGE_MARKS = Object.freeze(['✦', '◇', '♕', '☂', '♪', '✧']);
const BARRAGE_INDENTS = Object.freeze([0, 2, 1, 3, 0, 1, 2, 4, 1, 3]);
const BARRAGE_KIND_LABELS = Object.freeze({
    plot: '剧情',
    stan: '推角',
    clash: '对线',
});
const BARRAGE_HIDDEN_CLASS = 'is-barrage-hidden';
const TEXT_HIDE_BARRAGE = '暂停弹幕';
const TEXT_SHOW_BARRAGE = '显示弹幕';
const DEFAULT_BARRAGE_BADGE = '观众';
const BARRAGE_KIND_SEQUENCE = Object.freeze(['plot', 'stan', 'clash']);

const LIVE_TABLES = Object.freeze({
    rooms: '直播表',
});

function hashStringToIndex(text, modulo) {
    if (!Number.isFinite(modulo) || modulo <= 0) return 0;
    const value = String(text || '');
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
        hash = (hash * 31 + value.charCodeAt(index)) | 0;
    }
    return Math.abs(hash) % modulo;
}

function getStableTone(seed) {
    return BARRAGE_TONES[hashStringToIndex(seed, BARRAGE_TONES.length)] || BARRAGE_TONES[0];
}

function getStableMark(seed) {
    return BARRAGE_MARKS[hashStringToIndex(seed, BARRAGE_MARKS.length)] || BARRAGE_MARKS[0];
}

function getStableIndent(seed, index) {
    const seedIndex = hashStringToIndex(seed, BARRAGE_INDENTS.length);
    return BARRAGE_INDENTS[(seedIndex + index) % BARRAGE_INDENTS.length] || 0;
}

function resolveBarrageKind(seed, index) {
    const offset = hashStringToIndex(seed, BARRAGE_KIND_SEQUENCE.length);
    return BARRAGE_KIND_SEQUENCE[(offset + index) % BARRAGE_KIND_SEQUENCE.length] || BARRAGE_KIND_SEQUENCE[0];
}

function buildBarrageItem({ text, kind, badge, favoredSide, funLevel, status, time, bandIndex, itemIndex }) {
    const safeText = normalizeText(text);
    if (!safeText) return null;
    const safeBadge = normalizeText(badge) || DEFAULT_BARRAGE_BADGE;
    const safeFavoredSide = normalizeText(favoredSide);
    const safeKind = BARRAGE_KIND_LABELS[kind] ? kind : 'plot';
    const seed = `${safeBadge}|${safeFavoredSide}|${safeKind}|${safeText}|${bandIndex}|${itemIndex}`;
    return {
        text: safeText,
        badge: safeBadge,
        favoredSide: safeFavoredSide,
        kind: safeKind,
        kindLabel: BARRAGE_KIND_LABELS[safeKind],
        funLevel: normalizeText(funLevel),
        status: normalizeText(status),
        time: normalizeText(time),
        tone: getStableTone(`${safeBadge}|${safeFavoredSide}`),
        mark: getStableMark(seed),
        indent: getStableIndent(seed, itemIndex),
    };
}

function parseLiveBarrageSegment(segment) {
    const raw = normalizeText(segment);
    if (!raw) return null;

    const separatorIndex = raw.search(/[:：]/);
    if (separatorIndex < 0) {
        return {
            badge: DEFAULT_BARRAGE_BADGE,
            text: raw,
            raw,
        };
    }

    const badge = normalizeText(raw.slice(0, separatorIndex)) || DEFAULT_BARRAGE_BADGE;
    const text = normalizeText(raw.slice(separatorIndex + 1)) || '（空弹幕）';
    return {
        badge,
        text,
        raw,
    };
}

function parseLiveBarrages(value, options = {}) {
    const text = normalizeText(value);
    if (!text || text.toLowerCase() === 'none') return [];

    const favoredSide = normalizeText(options.favoredSide);
    const funLevel = normalizeText(options.funLevel);
    const status = normalizeText(options.status);
    const time = normalizeText(options.time);
    const bandIndex = Number.isInteger(options.bandIndex) ? options.bandIndex : 0;

    return splitSemicolonText(text)
        .map(parseLiveBarrageSegment)
        .filter(Boolean)
        .map((segment, itemIndex) => buildBarrageItem({
            text: segment.text,
            kind: resolveBarrageKind(`${segment.badge}|${segment.text}|${favoredSide}|${status}`, itemIndex),
            badge: segment.badge,
            favoredSide,
            funLevel,
            status,
            time,
            bandIndex,
            itemIndex,
        }))
        .filter(Boolean);
}

function buildViewModel(resolved) {
    const roomsTable = resolved.tables.rooms;

    const rooms = mapTheaterRows(roomsTable, (row, rowIndex) => {
        const roomName = resolveRowIdentity(roomsTable, row, '直播间名', '直播间 ', rowIndex);
        const time = normalizeText(getCellByHeader(roomsTable, row, '时间文本'));
        const status = normalizeText(getCellByHeader(roomsTable, row, '状态标签'));
        return {
            roomName,
            deleteKey: buildTheaterDeleteKey('room', rowIndex, roomName),
            rowIndex,
            castLineup: normalizeText(getCellByHeader(roomsTable, row, '领衔阵容')),
            castTag: normalizeText(getCellByHeader(roomsTable, row, '阵容标签')),
            streamTitle: normalizeText(getCellByHeader(roomsTable, row, '直播标题')),
            liveStatus: normalizeText(getCellByHeader(roomsTable, row, '当前状态')),
            stageSummary: normalizeText(getCellByHeader(roomsTable, row, '剧情舞台概述')),
            chemistryFocus: normalizeText(getCellByHeader(roomsTable, row, '对手戏看点')),
            interaction: normalizeText(getCellByHeader(roomsTable, row, '观看/互动数据')),
            time,
            status,
            barrageItems: parseLiveBarrages(getCellByHeader(roomsTable, row, '弹幕串'), {
                favoredSide: normalizeText(getCellByHeader(roomsTable, row, '主推角色/阵营')),
                funLevel: normalizeText(getCellByHeader(roomsTable, row, '乐子强度')),
                status,
                time,
                bandIndex: rowIndex,
            }),
        };
    });

    return { rooms };
}

function collectDeletableKeys(viewModel) {
    return (viewModel?.content?.rooms || []).map(room => room?.deleteKey).filter(Boolean);
}

function getBarrageWallStatus(room) {
    const firstItem = Array.isArray(room.barrageItems) && room.barrageItems.length > 0 ? room.barrageItems[0] : null;
    return normalizeText(firstItem?.status) || normalizeText(room.status) || '弹幕热议';
}

function getBarrageWallFunLevel(room) {
    const firstItem = Array.isArray(room.barrageItems) && room.barrageItems.length > 0 ? room.barrageItems[0] : null;
    return normalizeText(firstItem?.funLevel) || '正常滚动';
}

function renderMetricPills(room) {
    const parts = splitSemicolonText(room.interaction).slice(0, 4);
    const metricsHtml = parts.map(part => `<span class="phone-theater-live-stat-pill">${escapeHtml(part)}</span>`).join('');
    const timeHtml = room.time ? `<span class="phone-theater-live-time-pill">◷ ${escapeHtml(room.time)}</span>` : '';
    return `${metricsHtml}${timeHtml}`;
}

function renderLiveStatusStrip(room) {
    return `
        <section class="phone-theater-live-status-strip" aria-label="直播状态">
            <span class="phone-theater-live-onair">
                <span class="phone-theater-live-dot" aria-hidden="true"></span>
                ${escapeHtml(room.liveStatus || '正在直播')}
            </span>
            <div class="phone-theater-live-stats">${renderMetricPills(room)}</div>
        </section>
    `;
}

function renderLivePoster(room) {
    const title = room.streamTitle || room.roomName || '直播剧舞台';
    const status = room.status || room.castTag || 'Stage';
    return `
        <div class="phone-theater-live-poster" aria-hidden="true">
            <div class="phone-theater-live-poster-sky">
                <span class="phone-theater-live-rain is-a"></span>
                <span class="phone-theater-live-rain is-b"></span>
                <span class="phone-theater-live-rain is-c"></span>
                <span class="phone-theater-live-umbrella"></span>
                <span class="phone-theater-live-poster-spark is-one">✦</span>
                <span class="phone-theater-live-poster-spark is-two">✧</span>
            </div>
            <div class="phone-theater-live-poster-caption">
                <span>Rainy</span>
                <strong>Night</strong>
            </div>
            <span class="phone-theater-live-poster-status">${escapeHtml(status)}</span>
            <span class="phone-theater-live-poster-title">${escapeHtml(title)}</span>
        </div>
    `;
}

function renderLiveHero(room) {
    const title = room.streamTitle || room.roomName || '实时追剧片场';
    return `
        <section class="phone-theater-live-hero" aria-label="直播剧舞台信息">
            ${renderLivePoster(room)}
            <div class="phone-theater-live-hero-content">
                <div class="phone-theater-live-hero-kicker">
                    <span>Stage Live</span>
                    <span class="phone-theater-live-gift">🎁 应援榜</span>
                </div>
                <h2 class="phone-theater-live-title">${escapeHtml(title)}</h2>
                ${room.castLineup ? `<div class="phone-theater-live-cast">${escapeHtml(room.castLineup)}</div>` : ''}
                <div class="phone-theater-live-chip-row">
                    ${room.castTag ? `<span class="phone-theater-live-chip is-rose">${escapeHtml(room.castTag)}</span>` : ''}
                    ${room.status ? `<span class="phone-theater-live-chip is-blue">${escapeHtml(room.status)}</span>` : ''}
                </div>
                ${room.stageSummary ? `<p class="phone-theater-live-summary-line"><span>剧情简介：</span>${escapeHtml(room.stageSummary)}</p>` : ''}
                ${room.chemistryFocus ? `<p class="phone-theater-live-focus-line"><span>☆ 本场看点：</span>${escapeHtml(room.chemistryFocus)}</p>` : ''}
            </div>
        </section>
    `;
}

function renderBarrageItem(item) {
    const kindClass = `is-${item.kind}`;
    const toneClass = `tone-${item.tone}`;
    const indent = Number.isInteger(item.indent) ? item.indent : 0;
    const side = item.favoredSide ? ` data-favored-side="${escapeHtmlAttr(item.favoredSide)}"` : '';
    return `
        <li class="phone-theater-live-barrage-item ${kindClass} ${toneClass}" data-indent="${indent}"${side}>
            <span class="phone-theater-live-barrage-badge">${escapeHtml(item.badge)}</span>
            <span class="phone-theater-live-barrage-separator">：</span>
            <span class="phone-theater-live-barrage-text">${escapeHtml(item.text)}</span>
            <span class="phone-theater-live-barrage-mark" aria-hidden="true">${escapeHtml(item.mark)}</span>
        </li>
    `;
}

function renderLiveBarrageWall(room, items, renderKit) {
    const status = getBarrageWallStatus(room);
    const funLevel = getBarrageWallFunLevel(room);
    if (items.length <= 0) {
        return `
            <section class="phone-theater-live-barrage-wall" aria-label="直播弹幕">
                <header class="phone-theater-live-barrage-head">
                    <span class="phone-theater-section-title">弹幕热议</span>
                    <span class="phone-theater-live-barrage-status">${escapeHtml(status)}</span>
                </header>
                ${renderKit.renderEmpty('暂无弹幕')}
            </section>
        `;
    }
    return `
        <section class="phone-theater-live-barrage-wall" aria-label="直播弹幕">
            <header class="phone-theater-live-barrage-head">
                <span class="phone-theater-section-title">弹幕热议</span>
                <span class="phone-theater-live-barrage-status">${escapeHtml(funLevel)} · ${escapeHtml(status)}</span>
            </header>
            <ul class="phone-theater-live-barrage-list">
                ${items.map(renderBarrageItem).join('')}
            </ul>
        </section>
    `;
}

function renderLiveControls() {
    return `
        <footer class="phone-theater-live-controls" aria-label="直播控制">
            <span class="phone-theater-live-spark" aria-hidden="true">✧</span>
            <span class="phone-theater-live-input" role="presentation">说点什么...</span>
            <button type="button" class="phone-theater-barrage-toggle" aria-pressed="false">${TEXT_HIDE_BARRAGE}</button>
        </footer>
    `;
}

function renderContent(viewModel, uiState = {}, renderKit) {
    const rooms = viewModel?.content?.rooms || [];
    if (rooms.length <= 0) return renderKit.renderEmpty(viewModel.emptyText);
    return `
        <div class="phone-theater-live-page">
            ${rooms.map((room) => {
        const items = Array.isArray(room.barrageItems) ? room.barrageItems : [];
        const selected = uiState.deleteManageMode && uiState.selectedKeys?.has(room.deleteKey);
        return `
                    <article class="phone-theater-live-room ${selected ? 'is-delete-selected' : ''}" data-room-name="${escapeHtmlAttr(room.roomName)}" data-theater-delete-key="${escapeHtmlAttr(room.deleteKey)}">
                        ${renderKit.renderDeleteSelectButton(room.deleteKey, uiState)}
                        ${renderLiveStatusStrip(room)}
                        ${renderLiveHero(room)}
                        ${renderLiveBarrageWall(room, items, renderKit)}
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
    const roomTargets = buildDeleteTargets(selectedSet, 'room');

    const roomDeletion = filterTableRows(roomsTable, (row, rowIndex) => {
        const roomName = resolveRowIdentity(roomsTable, row, '直播间名', '直播间 ', rowIndex);
        return hasDeleteTarget(roomTargets, rowIndex, roomName);
    });

    return { removed: roomDeletion.removed };
}

function findClosestRoom(element) {
    if (!(element instanceof HTMLElement)) return null;
    const room = element.closest('.phone-theater-live-room');
    return room instanceof HTMLElement ? room : null;
}

function applyToggleState(toggleButton, room, hidden) {
    room.classList.toggle(BARRAGE_HIDDEN_CLASS, hidden);
    toggleButton.setAttribute('aria-pressed', hidden ? 'true' : 'false');
    toggleButton.textContent = hidden ? TEXT_SHOW_BARRAGE : TEXT_HIDE_BARRAGE;
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
        const nowHidden = !currentRoom.classList.contains(BARRAGE_HIDDEN_CLASS);
        applyToggleState(toggleButton, currentRoom, nowHidden);
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
    editableTables: Object.freeze([
        Object.freeze({
            role: 'rooms',
            label: '编辑直播表',
            description: '进入原始直播表格列表',
        }),
    ]),
    fieldSchema: Object.freeze({
        rooms: Object.freeze({ identity: '直播间名' }),
    }),
    contract: Object.freeze({
        styleFile: 'styles/phone-theater/live.css',
        requiredClasses: [
            'phone-theater-live-page',
            'phone-theater-live-room',
            'phone-theater-live-status-strip',
            'phone-theater-live-hero',
            'phone-theater-live-barrage-wall',
            'phone-theater-live-barrage-item',
            'phone-theater-barrage-toggle',
            'is-barrage-hidden',
        ],
    }),
    buildViewModel,
    collectDeletableKeys,
    deleteEntities,
    renderContent,
    bindInteractions,
});
