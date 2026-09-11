import { pickImageFiles } from '../../settings-app/services/media-upload.js';

// 只拥有人物选择与人设编辑；会话列表、消息、媒体和请求仍由 QQ App 拥有。
export function createAssistantUI({ facade, createElement: el, createButton: button, avatar,
    showDialog, clearOverlay, openChat, render, makeSecondaryPage, settingField,
    pickBackground, clearBackground, isCurrent, report }) {
    const drafts = new Map();
    const check = result => {
        if (!result?.ok) throw new Error(result?.error?.message || '操作失败，请重试');
        return result;
    };
    const save = async (characterId, patch) => check(await facade.intent.saveAssistantCharacter({ characterId, patch }));
    const open = async input => {
        const result = check(await facade.intent.openAssistant(input));
        if (!isCurrent()) return;
        clearOverlay();
        await openChat(result.result.conversation);
    };
    const confirm = (title, text, action) => {
        const content = el('p'); content.textContent = text;
        const cancel = button('取消', 'yuzi-qq-secondary-button'); cancel.addEventListener('click', clearOverlay);
        const accept = button('确认', 'yuzi-qq-danger-button');
        accept.addEventListener('click', async () => {
            accept.disabled = true;
            try { await action(); } catch (error) { accept.disabled = false; report(error); }
        });
        showDialog({ title, content, actions: [cancel, accept] });
    };
    const createCharacter = () => {
        const content = el('div', 'yuzi-qq-dialog-form');
        const name = el('input', 'yuzi-qq-add-contact-name-input');
        name.placeholder = '人物姓名'; name.maxLength = 120; name.setAttribute('aria-label', '人物姓名');
        const error = el('p', 'yuzi-qq-form-error');
        const cancel = button('取消', 'yuzi-qq-secondary-button'); cancel.addEventListener('click', clearOverlay);
        const accept = button('创建人物', 'yuzi-qq-primary-button'); accept.disabled = true;
        name.addEventListener('input', () => { accept.disabled = !name.value.trim(); });
        accept.addEventListener('click', async () => {
            accept.disabled = true;
            try { await open({ name: name.value }); }
            catch (failure) { error.textContent = failure.message; accept.disabled = false; }
        });
        name.addEventListener('keydown', event => {
            if (event.key === 'Enter' && !event.isComposing && !accept.disabled) { event.preventDefault(); accept.click(); }
        });
        content.append(name, error);
        showDialog({ title: '新建人物', content, actions: [cancel, accept] }); name.focus();
    };
    const choose = async () => {
        try {
            const { characters } = check(await facade.query.assistantCharacters());
            if (!isCurrent()) return;
            const content = el('div', 'yuzi-qq-assistant-characters');
            for (const character of characters) {
                const row = el('div', 'yuzi-qq-assistant-character-row');
                const select = button('', 'yuzi-qq-conversation-row');
                const label = el('span'); label.textContent = character.formalName;
                select.append(avatar(character), label);
                select.addEventListener('click', async () => {
                    select.disabled = true;
                    try { await open({ characterId: character.characterId }); }
                    catch (error) { select.disabled = false; report(error); }
                });
                row.append(select);
                if (!character.isBuiltIn) {
                    const remove = button('×', 'yuzi-qq-icon-button', { 'aria-label': `删除人物${character.formalName}` });
                    remove.addEventListener('click', () => confirm('删除人物', `删除“${character.formalName}”及其在所有酒馆聊天中的陪聊记录？此操作不可撤销。`, async () => {
                        check(await facade.intent.deleteAssistantCharacter({ characterId: character.characterId }));
                        drafts.delete(character.characterId); clearOverlay(); await render();
                    }));
                    row.append(remove);
                }
                content.append(row);
            }
            const add = button('新建人物', 'yuzi-qq-primary-button'); add.addEventListener('click', createCharacter);
            const close = button('取消', 'yuzi-qq-secondary-button'); close.addEventListener('click', clearOverlay);
            showDialog({ title: '选择陪聊人物', content, actions: [close, add] });
        } catch (error) { report(error); }
    };
    const settings = async conversation => {
        const { main, content } = makeSecondaryPage('陪聊设置', { className: 'yuzi-qq-conversation-settings-view yuzi-qq-assistant-settings-view' });
        const { characters } = check(await facade.query.assistantCharacters());
        if (!isCurrent()) return main;
        const character = characters.find(item => item.characterId === conversation.assistantCharacterId);
        if (!character) return main;
        const id = character.characterId;
        let draft = drafts.get(id);
        if (!draft || draft.value === draft.saved) {
            draft = { saved: character.persona, value: character.persona }; drafts.set(id, draft);
        }
        const card = el('div', 'yuzi-qq-conversation-settings-fields');
        const status = el('p', 'yuzi-qq-settings-status'); status.setAttribute('role', 'status');
        const name = settingField('姓名', 'assistantName', character.formalName);
        name.querySelector('input').addEventListener('change', async event => {
            try { await save(id, { formalName: event.target.value }); status.textContent = ''; }
            catch (error) { status.textContent = error.message; }
        });
        const avatarRow = el('div', 'yuzi-qq-assistant-profile-row');
        const avatarLabel = el('span'); avatarLabel.textContent = '头像';
        const upload = button('更换头像', 'yuzi-qq-secondary-button');
        upload.addEventListener('click', () => pickImageFiles(async ([selected]) => {
            if (!isCurrent()) return;
            const result = check(await facade.intent.saveImageLibraryAsset({ library: 'avatar', blob: selected.file, mimeType: selected.file.type }));
            if (!isCurrent()) return;
            await save(id, { avatarAssetId: result.asset.assetId }); if (isCurrent()) await render();
        }, { multiple: false, maxSizeMB: 8, onError: message => report(new Error(message)) }));
        avatarRow.append(avatarLabel, avatar(character), upload);
        const background = el('div', 'yuzi-qq-assistant-profile-row');
        const backgroundLabel = el('span'); backgroundLabel.textContent = '聊天背景';
        const change = button('更换背景', 'yuzi-qq-secondary-button'); change.addEventListener('click', () => pickBackground(conversation.conversationId));
        background.append(backgroundLabel, change);
        if (conversation.backgroundAssetId) {
            const remove = button('清除背景', 'yuzi-qq-secondary-button');
            remove.addEventListener('click', () => { void clearBackground(conversation.conversationId).catch(report); }); background.append(remove);
        }
        const persona = el('label', 'yuzi-qq-field yuzi-qq-assistant-persona');
        const label = el('span', 'yuzi-qq-field-label'); label.textContent = '人物人设';
        const textarea = el('textarea'); textarea.value = draft.value; textarea.rows = 12;
        textarea.placeholder = '在这里自由填写人物身份、性格、说话方式与语料';
        textarea.addEventListener('input', () => { draft.value = textarea.value; });
        persona.append(label, textarea);
        const actions = el('div', 'yuzi-qq-assistant-profile-row');
        const submit = button('保存人设', 'yuzi-qq-primary-button');
        submit.addEventListener('click', async () => {
            const value = textarea.value; submit.disabled = true;
            try { await save(id, { persona: value }); draft.saved = value; status.textContent = '人设已保存'; }
            catch (error) { status.textContent = error.message; }
            finally { submit.disabled = false; }
        });
        actions.append(submit);
        if (character.isBuiltIn) {
            const reset = button('恢复默认人设', 'yuzi-qq-secondary-button');
            reset.addEventListener('click', () => { textarea.value = character.defaultPersona; draft.value = textarea.value; status.textContent = '已填回默认人设，点击保存后生效'; }); actions.append(reset);
        }
        card.append(name, avatarRow, background, persona, actions, status); content.append(card); return main;
    };
    return {
        choose, settings,
        leave(characterId, action) {
            const draft = drafts.get(characterId);
            if (!draft || draft.value === draft.saved) return action();
            confirm('放弃未保存的人设？', '人设修改尚未保存，是否放弃并返回？', () => {
                drafts.delete(characterId); clearOverlay(); return action();
            });
        },
    };
}
