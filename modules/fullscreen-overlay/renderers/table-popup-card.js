const SIZE_SCALES = Object.freeze({
    compact: 0.86,
    normal: 1,
    large: 1.16,
});

function hexToRgba(hex, opacity) {
    const value = String(hex || '#FFFFFF').replace('#', '');
    const red = Number.parseInt(value.slice(0, 2), 16);
    const green = Number.parseInt(value.slice(2, 4), 16);
    const blue = Number.parseInt(value.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
}

function pickTextColor(hex) {
    const value = String(hex || '#FFFFFF').replace('#', '');
    const red = Number.parseInt(value.slice(0, 2), 16);
    const green = Number.parseInt(value.slice(2, 4), 16);
    const blue = Number.parseInt(value.slice(4, 6), 16);
    return ((red * 299) + (green * 587) + (blue * 114)) / 1000 >= 150
        ? '#1F1F1F'
        : '#FFFFFF';
}

function applyCardStyle(element, settings, viewport) {
    const sizeScale = SIZE_SCALES[settings.sizePreset] || 1;
    const baseWidth = Math.min(viewport.width * 0.88, 560) * sizeScale;
    element.style.setProperty('--yuzi-phone-fullscreen-overlay-popup-width', `${baseWidth}px`);
    element.style.setProperty(
        '--yuzi-phone-fullscreen-overlay-popup-columns',
        String(settings.columnCount),
    );
    element.style.setProperty(
        '--yuzi-phone-fullscreen-overlay-popup-radius',
        `${settings.borderRadiusPx * sizeScale}px`,
    );
    element.style.setProperty(
        '--yuzi-phone-fullscreen-overlay-popup-background',
        hexToRgba(settings.backgroundColor, settings.opacity),
    );
    element.style.setProperty(
        '--yuzi-phone-fullscreen-overlay-popup-color',
        pickTextColor(settings.backgroundColor),
    );
    element.style.setProperty(
        '--yuzi-phone-fullscreen-overlay-popup-label-size',
        `${11 * sizeScale}px`,
    );
    element.style.setProperty(
        '--yuzi-phone-fullscreen-overlay-popup-value-size',
        `${14 * sizeScale}px`,
    );
    element.style.setProperty(
        '--yuzi-phone-fullscreen-overlay-popup-padding',
        `${14 * sizeScale}px`,
    );
    element.style.setProperty(
        '--yuzi-phone-fullscreen-overlay-popup-gap',
        `${8 * sizeScale}px`,
    );
    element.style.setProperty(
        '--yuzi-phone-fullscreen-overlay-notification-avatar-size',
        `${48 * sizeScale}px`,
    );
    element.style.setProperty(
        '--yuzi-phone-fullscreen-overlay-notification-font-size',
        `${15 * sizeScale}px`,
    );
    element.style.setProperty(
        '--yuzi-phone-fullscreen-overlay-popup-duration',
        `${settings.durationMs}ms`,
    );
    element.style.setProperty(
        '--yuzi-phone-fullscreen-overlay-popup-transform-origin',
        settings.placementMode === 'center' ? 'center center' : 'top left',
    );
}

export function createTablePopupCard(documentRef, item, settings, viewport) {
    const element = documentRef.createElement('div');
    element.className = 'yuzi-phone-fullscreen-overlay-table-popup';
    applyCardStyle(element, settings, viewport);
    if (item.kind === 'message-notification') {
        const sizeScale = SIZE_SCALES[settings.sizePreset] || 1;
        element.className += ' yuzi-phone-fullscreen-overlay-message-notification';
        element.style.setProperty(
            '--yuzi-phone-fullscreen-overlay-popup-width',
            `${Math.min(viewport.width * 0.88, 460) * sizeScale}px`,
        );
        const avatar = documentRef.createElement('span');
        avatar.className = 'yuzi-phone-fullscreen-overlay-message-notification-avatar';
        avatar.textContent = Array.from(item.senderName)[0] || 'Q';
        const text = documentRef.createElement('span');
        text.className = 'yuzi-phone-fullscreen-overlay-message-notification-text';
        text.textContent = item.text;
        element.appendChild(avatar);
        element.appendChild(text);
        return { element, avatar };
    }
    item.cells.forEach((cell) => {
        const field = documentRef.createElement('div');
        field.className = 'yuzi-phone-fullscreen-overlay-table-popup-cell';
        const label = documentRef.createElement('span');
        label.className = 'yuzi-phone-fullscreen-overlay-table-popup-label';
        label.textContent = cell.label;
        const value = documentRef.createElement('span');
        value.className = 'yuzi-phone-fullscreen-overlay-table-popup-value';
        value.textContent = cell.value === '' ? '—' : cell.value;
        field.appendChild(label);
        field.appendChild(value);
        element.appendChild(field);
    });
    return { element, avatar: null };
}
