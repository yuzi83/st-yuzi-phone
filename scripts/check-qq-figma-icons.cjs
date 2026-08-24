const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');

class FakeClassList {
    constructor() {
        this.values = new Set();
    }

    add(...names) {
        names.filter(Boolean).forEach((name) => this.values.add(name));
    }

    contains(name) {
        return this.values.has(name);
    }
}

class FakeElement {
    constructor(namespace, tagName) {
        this.namespaceURI = namespace;
        this.tagName = tagName;
        this.attributes = new Map();
        this.children = [];
        this.classList = new FakeClassList();
    }

    setAttribute(name, value) {
        this.attributes.set(name, String(value));
    }

    getAttribute(name) {
        return this.attributes.get(name) ?? null;
    }

    append(...children) {
        this.children.push(...children);
    }
}

const fakeDocument = Object.freeze({
    createElementNS(namespace, tagName) {
        return new FakeElement(namespace, tagName);
    },
});

async function main() {
    const icons = await import(pathToFileURL(path.join(ROOT, 'modules/qq-v2/ui/figma-icons.js')).href);

    assert.deepEqual(icons.QQ_FIGMA_ROOT_ICON_MAP, Object.freeze({
        messages: 'message',
        contacts: 'person',
        assistant: 'channel',
        settings: 'dynamic',
    }));

    assert.deepEqual(icons.QQ_FIGMA_TOOL_ICON_MAP, Object.freeze({
        voice: 'voice',
        image: 'image',
        video: 'camera',
        transfer: 'transfer',
        emoji: 'emoji',
        plus: 'plus',
    }));

    const iconNames = [
        ...Object.values(icons.QQ_FIGMA_ROOT_ICON_MAP),
        ...Object.values(icons.QQ_FIGMA_TOOL_ICON_MAP),
    ];
    iconNames.forEach((name) => {
        const icon = icons.createQQFigmaIconElement(name, fakeDocument, 'yuzi-qq-icon');
        assert.equal(icon.tagName, 'svg');
        assert.equal(icon.namespaceURI, 'http://www.w3.org/2000/svg');
        assert.equal(icon.getAttribute('viewBox'), '0 0 24 24');
        assert.equal(icon.getAttribute('aria-hidden'), 'true');
        assert.equal(icon.getAttribute('focusable'), 'false');
        assert.equal(icon.getAttribute('data-qq-figma-icon'), name);
        assert.ok(icon.classList.contains('yuzi-qq-icon'));
        assert.ok(icon.children.length > 0);
    });

    console.log('[qq-figma-icons] passed');
}

main().catch((error) => {
    console.error('[qq-figma-icons] failed');
    console.error(error);
    process.exitCode = 1;
});
