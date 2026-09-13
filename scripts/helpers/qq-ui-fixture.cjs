function dataAttributeName(property) {
    return 'data-' + String(property).replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase());
}

function dataPropertyName(attribute) {
    return attribute.slice(5).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
}

function matchesSelector(element, selector) {
    const selectors = String(selector || '').split(',').map((item) => item.trim()).filter(Boolean);
    if (selectors.length > 1) return selectors.some((item) => matchesSelector(element, item));
    let value = selectors[0] || '';
    if (!value) return false;
    if (value === '[tabindex]:not([tabindex="-1"])') {
        return element.hasAttribute('tabindex') && element.getAttribute('tabindex') !== '-1';
    }

    const excludesDisabled = value.includes(':not([disabled])');
    value = value.replace(':not([disabled])', '');
    if (excludesDisabled && (element.disabled || element.hasAttribute('disabled'))) return false;
    const requiresChecked = value.includes(':checked');
    value = value.replace(':checked', '');
    if (requiresChecked && element.checked !== true) return false;

    const attributes = [...value.matchAll(/\[([^\]]+)\]/g)].map((match) => match[1]);
    value = value.replace(/\[[^\]]+\]/g, '');
    const classes = [...value.matchAll(/\.([\w-]+)/g)].map((match) => match[1]);
    value = value.replace(/\.[\w-]+/g, '').trim();

    if (value && value !== '*' && element.tagName.toLowerCase() !== value.toLowerCase()) return false;
    if (!classes.every((className) => element.classList.contains(className))) return false;

    return attributes.every((attribute) => {
        const match = attribute.match(/^([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s\]]+)))?$/);
        if (!match) return false;
        const [, name, doubleQuoted, singleQuoted, bare] = match;
        if (!element.hasAttribute(name)) return false;
        const expected = doubleQuoted ?? singleQuoted ?? bare;
        return expected === undefined || element.getAttribute(name) === expected;
    });
}

class FakeElement {
    constructor(tagName = 'div') {
        this.tagName = String(tagName).toUpperCase();
        this.children = [];
        this.parentNode = null;
        this._attributes = new Map();
        this._dataset = {};
        this.dataset = new Proxy(this._dataset, {
            get: (target, property) => target[property],
            set: (target, property, value) => {
                const text = String(value);
                target[property] = text;
                this._attributes.set(dataAttributeName(property), text);
                return true;
            },
        });
        this._classes = new Set();
        this.classList = {
            add: (...names) => names.filter(Boolean).forEach((name) => this._classes.add(String(name))),
            remove: (...names) => names.filter(Boolean).forEach((name) => this._classes.delete(String(name))),
            contains: (name) => this._classes.has(String(name)),
            toggle: (name, force) => {
                const present = force === undefined ? !this._classes.has(String(name)) : Boolean(force);
                if (present) this._classes.add(String(name));
                else this._classes.delete(String(name));
                return present;
            },
        };
        this.listeners = new Map();
        this.style = {};
        this.textContent = '';
        this.value = '';
        this.disabled = false;
        this.tabIndex = 0;
        this.scrollTop = 0;
        this.scrollHeight = 100;
        this.clientHeight = 100;
        this._rootConnected = false;
    }

    get className() {
        return [...this._classes].join(' ');
    }

    set className(value) {
        this._classes = new Set(String(value || '').split(/\s+/).filter(Boolean));
    }

    get parentElement() {
        return this.parentNode;
    }

    get isConnected() {
        return this._rootConnected === true || this.parentNode?.isConnected === true;
    }

    append(...children) {
        children.forEach((child) => {
            if (!(child instanceof FakeElement)) throw new TypeError('Fake DOM only accepts element children');
            child.remove();
            child.parentNode = this;
            this.children.push(child);
        });
    }

    appendChild(child) {
        this.append(child);
        return child;
    }

    removeChild(child) {
        const index = this.children.indexOf(child);
        if (index >= 0) this.children.splice(index, 1);
        if (child.parentNode === this) child.parentNode = null;
        return child;
    }

    replaceChildren(...children) {
        [...this.children].forEach((child) => this.removeChild(child));
        this.append(...children);
    }

    remove() {
        this.parentNode?.removeChild(this);
    }

    setAttribute(name, value) {
        const attribute = String(name);
        const text = String(value);
        this._attributes.set(attribute, text);
        if (attribute === 'class') this.className = text;
        if (attribute === 'disabled') this.disabled = true;
        if (attribute === 'tabindex') this.tabIndex = Number(text);
        if (attribute.startsWith('data-')) this._dataset[dataPropertyName(attribute)] = text;
    }

    getAttribute(name) {
        return this._attributes.get(String(name)) ?? null;
    }

    hasAttribute(name) {
        return this._attributes.has(String(name));
    }

    addEventListener(type, listener) {
        const listeners = this.listeners.get(type) || [];
        listeners.push(listener);
        this.listeners.set(type, listeners);
    }

    removeEventListener(type, listener) {
        const listeners = this.listeners.get(type) || [];
        this.listeners.set(type, listeners.filter((candidate) => candidate !== listener));
    }

    async dispatch(type, properties = {}) {
        const event = {
            target: properties.target || this,
            key: properties.key || '',
            shiftKey: properties.shiftKey === true,
            preventDefault() {},
            stopPropagation() {},
            ...properties,
        };
        for (const listener of this.listeners.get(type) || []) {
            await listener(event);
        }
        return event;
    }

    click() {
        return this.dispatch('click', { target: this });
    }

    focus() {
        global.document.activeElement = this;
    }

    blur() {
        if (global.document.activeElement === this) global.document.activeElement = null;
    }

    matches(selector) {
        return matchesSelector(this, selector);
    }

    closest(selector) {
        for (let current = this; current; current = current.parentNode) {
            if (current.matches(selector)) return current;
        }
        return null;
    }

    querySelectorAll(selector) {
        const found = [];
        const visit = (element) => {
            element.children.forEach((child) => {
                if (child.matches(selector)) found.push(child);
                visit(child);
            });
        };
        visit(this);
        return found;
    }

    querySelector(selector) {
        return this.querySelectorAll(selector)[0] || null;
    }

    contains(candidate) {
        for (let current = candidate; current; current = current.parentNode) {
            if (current === this) return true;
        }
        return false;
    }

    getBoundingClientRect() {
        return { top: 0, bottom: 40, width: 100, height: 40 };
    }
}

function createFakeWindow() {
    const listeners = new Map();
    return {
        addEventListener(type, listener) {
            const entries = listeners.get(type) || [];
            entries.push(listener);
            listeners.set(type, entries);
        },
        removeEventListener(type, listener) {
            const entries = listeners.get(type) || [];
            listeners.set(type, entries.filter((candidate) => candidate !== listener));
        },
    };
}

function installFakeDom() {
    const document = {
        activeElement: null,
        createElement(tagName) { return new FakeElement(tagName); },
    };
    global.document = document;
    global.window = createFakeWindow();
    global.requestAnimationFrame = (callback) => {
        queueMicrotask(() => callback(Date.now()));
        return 1;
    };
    global.cancelAnimationFrame = () => {};
    global.getComputedStyle = () => ({
        minHeight: '40px',
        maxHeight: '120px',
        height: '40px',
        overflowY: 'hidden',
    });
    return document;
}

async function flushUi() {
    for (let index = 0; index < 10; index += 1) await Promise.resolve();
}

function findButton(root, label) {
    return root.querySelectorAll('button').find((button) => button.textContent === label) || null;
}

function privateConversation(name, id) {
    return {
        conversationId: id,
        kind: 'private',
        status: 'active',
        personId: `person-${id}`,
        title: name,
        formalName: name,
        unreadCount: 0,
    };
}

function createFakeFacade({
    outcome,
    errorMessage = '联系人创建失败',
    initialConversations = [],
} = {}) {
    const calls = {
        createPrivateConversation: [],
        createGroupConversation: [],
        aiRequests: 0,
        queryConversations: 0,
    };
    let conversations = [...initialConversations];
    const facade = {
        query: {
            async conversations() {
                calls.queryConversations += 1;
                return { ok: true, conversations };
            },
            async currentContext() {
                return {
                    ok: true,
                    context: {
                        scopeId: 'scope-add-contact-ui',
                        storyTime: '2026-09-04 09:30',
                        user: { name: '用户', avatar: '' },
                    },
                };
            },
            async currentProfile() { return { ok: true, profile: {} }; },
            async globalSettings() { return { ok: true, settings: { worldbook: { enabled: false } } }; },
            async conversation({ conversationId } = {}) {
                const conversation = conversations.find((candidate) => candidate.conversationId === conversationId);
                return conversation
                    ? { ok: true, conversation }
                    : { ok: false, status: 'not-found' };
            },
            async messages() { return { ok: true, page: { items: [], hasMore: false, nextBeforeSequence: null } }; },
            async mediaRender() { return { ok: false, status: 'not-found' }; },
        },
        intent: {
            async createPrivateConversation(input) {
                calls.createPrivateConversation.push({ ...input });
                if (outcome?.ok === false) {
                    return { ok: false, status: 'failed', error: { message: errorMessage } };
                }
                conversations = [privateConversation(outcome.name, outcome.conversationId)];
                return {
                    ok: true,
                    status: 'accepted',
                    result: {
                        created: outcome.created === true,
                        restored: outcome.restored === true,
                        person: { formalName: outcome.name },
                        conversation: conversations[0],
                    },
                };
            },
            async createGroupConversation(input) {
                calls.createGroupConversation.push({
                    name: input.name,
                    memberIds: [...input.memberIds],
                });
                const members = input.memberIds.map((personId) => {
                    const friend = conversations.find((conversation) => conversation.personId === personId);
                    return { personId, formalName: friend?.formalName || personId };
                });
                const conversation = {
                    conversationId: 'group-created',
                    kind: 'group',
                    status: 'active',
                    title: input.name,
                    groupId: 'group-created',
                    group: {
                        groupId: 'group-created',
                        name: input.name,
                        status: 'active',
                        ownerId: '__self__',
                        selfRole: 'owner',
                        selfExited: false,
                        memberIds: [...input.memberIds],
                        members,
                        adminIds: [],
                        mutes: {},
                    },
                    canSend: true,
                    request: { phase: 'idle' },
                    injection: {},
                };
                conversations.push(conversation);
                return { ok: true, status: 'accepted', result: { conversation, group: conversation.group } };
            },
            async sendMessage() { calls.aiRequests += 1; throw new Error('add contact must not send a message'); },
            async retryRequest() { calls.aiRequests += 1; throw new Error('add contact must not request AI'); },
            async openConversation() { return { ok: true, status: 'accepted', unreadCount: 0 }; },
            async releaseMediaRender() { return { ok: true }; },
            async closeConversation() { return { ok: true }; },
        },
    };
    return { facade, calls };
}


module.exports = { FakeElement, installFakeDom, flushUi, findButton, privateConversation, createFakeFacade };
