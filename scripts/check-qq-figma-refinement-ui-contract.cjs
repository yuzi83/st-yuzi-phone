const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

function sourceSlice(source, startMarker, endMarker) {
    const start = source.indexOf(startMarker);
    if (start < 0) return '';
    const end = endMarker ? source.indexOf(endMarker, start + startMarker.length) : -1;
    return source.slice(start, end < 0 ? source.length : end);
}

function cssRuleHas(source, selector, declaration) {
    const selectorStart = source.indexOf(selector);
    if (selectorStart < 0) return false;
    const ruleStart = source.indexOf('{', selectorStart);
    const ruleEnd = source.indexOf('}', ruleStart + 1);
    return ruleStart >= 0 && ruleEnd >= 0 && source.slice(ruleStart + 1, ruleEnd).includes(declaration);
}

function main() {
    const app = read('modules/qq-v2/ui/app.js');
    const css = read('styles/phone-base/12-qq-app.css');
    const gaps = [];
    const requireContract = (condition, message) => {
        if (!condition) gaps.push(message);
    };
    const secondaryPageFactory = sourceSlice(app, 'const makeSecondaryPage =', 'const makeProfileTop =');
    requireContract(
        /yuzi-qq-secondary-page/.test(secondaryPageFactory)
            && /yuzi-qq-secondary-top/.test(secondaryPageFactory)
            && /yuzi-qq-secondary-scroll/.test(secondaryPageFactory),
        'the shared secondary-page factory must own the fixed top and body-only scroll structure',
    );
    const requireSecondaryPage = (source, label) => {
        requireContract(
            /makeSecondaryPage\(/.test(source),
            `${label} must use the shared fixed-top, body-only-scroll secondary-page shell`,
        );
    };

    // Approved TDD seam: rendered QQ UI routes/classes and injected Facade calls.
    const pageRouter = sourceSlice(app, 'const renderPage = async', 'const render = async');
    requireContract(
        /const renderCurrentProfile = async/.test(app)
            && /facade\.query\.currentProfile\(\)/.test(app)
            && /page\?\.type === 'current-profile'/.test(pageRouter)
            && /renderCurrentProfile\(token\)/.test(pageRouter)
            && /yuzi-qq-current-profile-view/.test(app)
            && /data-qq-current-profile-edit/.test(app),
        'current-profile route must render its own Facade-backed current-profile view and expose its edit action',
    );

    const settingsGroups = sourceSlice(app, 'const QQ_SETTINGS_GROUPS = Object.freeze([', ']);');
    const groupKinds = Array.from(settingsGroups.matchAll(/kind:\s*'([^']+)'/g), (match) => match[1]);
    requireContract(
        JSON.stringify(groupKinds) === JSON.stringify(['reply', 'context', 'worldbook', 'image-library']),
        'settings root must list reply, context, worldbook, image-library in the agreed four-entry order',
    );
    const settingsRoot = sourceSlice(app, 'const renderSettingsRoot =', 'const settingField =');
    requireContract(
        !/data-qq-back|back\s*:\s*true/.test(settingsRoot),
        'settings root must not render a back button',
    );
    requireContract(
        /makeHeader\('\\u8bbe\\u7f6e',[\s\S]{0,180}back:\s*false/.test(settingsRoot)
            && /QQ_SETTINGS_GROUPS\.slice\(0, 2\)/.test(settingsRoot)
            && /QQ_SETTINGS_GROUPS\.slice\(2\)/.test(settingsRoot)
            && /yuzi-qq-settings-root-groups/.test(settingsRoot)
            && cssRuleHas(css, '.yuzi-qq-settings-root-groups', 'gap: var(--yuzi-qq-settings-root-stack-gap)')
            && cssRuleHas(css, '.yuzi-qq-settings-root-sheet', 'overflow: hidden')
            && cssRuleHas(css, '.yuzi-qq-settings-root-list', 'overflow: visible')
            && cssRuleHas(css, '.yuzi-qq-settings-root-row + .yuzi-qq-settings-root-row', 'border-block-start: var(--yuzi-qq-line-width) solid var(--yuzi-qq-settings-outline)')
            && cssRuleHas(css, '.yuzi-qq-settings-root-arrow', 'inline-size: var(--yuzi-qq-settings-root-arrow-size)'),
        'settings root must use the shared backless header and render its four entries as two two-row groups',
    );
    const settingsDetail = sourceSlice(app, 'const renderSettingsDetail = async', 'const renderAssistant = async');
    requireSecondaryPage(settingsDetail, 'settings detail');
    const fieldBuilders = sourceSlice(app, 'const settingField =', 'const renderImageLibrary = async');
    requireContract(
        /yuzi-qq-field yuzi-qq-field-row/.test(fieldBuilders)
            && /yuzi-qq-field-label/.test(fieldBuilders)
            && /yuzi-qq-field-control/.test(fieldBuilders)
            && /is-checkbox/.test(fieldBuilders)
            && /is-control-stacked/.test(fieldBuilders)
            && /yuzi-qq-field-input/.test(fieldBuilders)
            && /yuzi-qq-field-select/.test(fieldBuilders),
        'settings controls must keep checkboxes compact and stack text, number, and select controls at full width',
    );
    const replyBranch = sourceSlice(settingsDetail, "if (kind === 'reply')", "else if (kind === 'context')");
    requireContract(
        /privateReplyPresetId/.test(replyBranch)
            && /privateProactivePresetId/.test(replyBranch)
            && /everyTurns/.test(replyBranch)
            && /data-qq-settings-proactive-fields/.test(replyBranch)
            && /enabled/.test(replyBranch)
            && /\.hidden\s*=/.test(replyBranch),
        'reply settings must combine AI reply and proactive controls, hiding proactive content while disabled',
    );
    requireContract(
        /const promptOptions = asArray\(resources\.promptPresets\)/.test(replyBranch)
            && !/const promptOptions = \[\['',/.test(replyBranch),
        'private reply and proactive presets must not offer an unselected option',
    );
    requireContract(
        /hostContextTurns[\s\S]{0,220}'number'/.test(settingsDetail)
            && /conversationHistoryLimit[\s\S]{0,220}'number'/.test(settingsDetail),
        'context settings must expose two numeric controls for host context turns and private history turns',
    );
    requireContract(
        /settings\.worldbook\.light/.test(settingsDetail)
            && /settings\.worldbook\.depth/.test(settingsDetail)
            && /settings\.worldbook\.keywords/.test(settingsDetail)
            && /data-qq-worldbook-keywords/.test(settingsDetail)
            && /light\s*===\s*'green'/.test(settingsDetail)
            && /\.hidden\s*=/.test(settingsDetail),
        'worldbook keywords must be visible only for the green light and hidden for the blue light',
    );

    const conversationSettings = sourceSlice(app, 'const renderConversationSettings = async', 'const renderSettingsRoot =');
    requireSecondaryPage(conversationSettings, 'conversation settings');
    requireContract(
        /page\?\.type === 'conversation-settings'/.test(pageRouter)
            && /renderConversationSettings\(token\)/.test(pageRouter)
            && /yuzi-qq-conversation-settings-view/.test(conversationSettings)
            && /yuzi-qq-conversation-settings-header/.test(conversationSettings)
            && /yuzi-qq-conversation-settings-form/.test(conversationSettings)
            && /remark/.test(conversationSettings)
            && /backgroundAssetId/.test(conversationSettings)
            && /useConversationLight/.test(conversationSettings)
            && /useConversationDepth/.test(conversationSettings)
            && /light/.test(conversationSettings)
            && /depth/.test(conversationSettings)
            && /facade\.intent\.updatePrivateProfile/.test(conversationSettings)
            && /facade\.intent\.setConversationInjection/.test(conversationSettings)
            && !/\u5168\u5c40\u5df2\u5173\u95ed/.test(conversationSettings),
        'conversation settings must use independent local light/depth overrides without a global-closed hint',
    );

    const profileEditorSurface = sourceSlice(app, 'const profileEditRow =', 'const renderProfileEditor = async');
    requireSecondaryPage(profileEditorSurface, 'profile editor');
    requireContract(
        /yuzi-qq-profile-editor-list/.test(profileEditorSurface)
            && /yuzi-qq-profile-editor-group/.test(profileEditorSurface)
            && /yuzi-qq-profile-editor-row/.test(profileEditorSurface)
            && /is-control-stacked/.test(profileEditorSurface)
            && /yuzi-qq-profile-editor-input/.test(profileEditorSurface)
            && /qqProfileFieldInput/.test(profileEditorSurface)
            && /avatarAssetId/.test(profileEditorSurface)
            && /signature/.test(profileEditorSurface)
            && /gender/.test(profileEditorSurface)
            && /birthday/.test(profileEditorSurface)
            && /profileBackgroundAssetId/.test(profileEditorSurface)
            && !/yuzi-qq-profile-editor-portrait/.test(profileEditorSurface)
            && !/data-qq-profile-field-edit/.test(profileEditorSurface),
        'the shared profile editor must keep profile fields inline, expose upload actions without previews, and avoid tertiary field routes',
    );
    requireContract(
        !/profile-field-edit/.test(app)
            && !/renderProfileFieldEditor/.test(app)
            && /persistProfileEditorField/.test(app),
        'profile fields must save inside the shared editor without a tertiary page',
    );

    const profileSurface = sourceSlice(app, 'const profileSummaryRow =', 'const renderProfile = async');
    const friendProfile = sourceSlice(app, 'const renderProfile = async', 'const renderCurrentProfile = async');
    const currentProfile = sourceSlice(app, 'const renderCurrentProfile = async', 'const profileEditRow =');
    const profileTop = sourceSlice(app, 'const makeProfileTop =', 'const makeRootIdentityHeader =');
    requireContract(
        /data-qq-back/.test(profileTop) && /yuzi-qq-profile-back-control/.test(profileTop),
        'the shared profile top must provide the standalone back control',
    );
    requireContract(
        /makeProfileTop\(/.test(profileSurface)
            && !/makeHeader\(/.test(profileSurface)
            && /yuzi-qq-profile-details/.test(profileSurface)
            && /signature/.test(profileSurface)
            && /gender/.test(profileSurface)
            && /birthday/.test(profileSurface)
            && /if \(!text\) return null/.test(profileSurface)
            && /yuzi-qq-profile-signature-pencil/.test(profileSurface)
            && /yuzi-qq-profile-summary-arrow/.test(profileSurface)
            && /\.style\.backgroundImage/.test(profileSurface)
            && !/main\.style\.backgroundImage/.test(profileSurface),
        'the shared profile surface must hide empty details, restore the Figma decorations, and keep background media scoped to the top cover',
    );
    for (const [label, profileSource] of [['friend profile', friendProfile], ['current profile', currentProfile]]) {
        requireContract(
            /renderProfileSurface\(/.test(profileSource)
                && /data-phone-bottom-bar/.test(profileSource),
            `${label} must use a standalone back control, scoped backdrop/details, and a home-safe bottom action bar`,
        );
    }

    const friendProfileEditor = sourceSlice(app, 'const renderProfileEditor = async', 'const messageNode =');
    const currentProfileEditor = sourceSlice(app, 'const renderCurrentProfileEditor = async', 'const renderConversationSettings = async');
    requireContract(
        /renderProfileEditorSurface\(/.test(friendProfileEditor)
            && /renderProfileEditorSurface\(/.test(currentProfileEditor)
            && /current:\s*true/.test(currentProfileEditor),
        'friend and current-user editors must share the same profile editor surface',
    );

    const imageLibrary = sourceSlice(app, 'const renderImageLibrary = async', 'const renderSettingsDetail = async');
    requireSecondaryPage(imageLibrary, 'image library');
    requireContract(
        /['"]avatar['"]/.test(app)
            && /['"]chat-background['"]/.test(app)
            && /['"]profile-background['"]/.test(app)
            && /['"]sticker['"]/.test(app)
            && /facade\.query\.imageLibrary/.test(app)
            && /facade\.query\.sharedResources/.test(app)
            && /facade\.intent\.saveImageLibraryAssets/.test(app)
            && /facade\.intent\.saveStickers/.test(app)
            && /facade\.intent\.deleteImageLibraryAssets/.test(app)
            && /facade\.intent\.deleteSticker/.test(app)
            && /yuzi-qq-image-library-view/.test(app)
            && /data-qq-image-library-item/.test(app)
            && /data-qq-sticker-library-item/.test(app)
            && /data-qq-image-library-delete/.test(app)
            && /yuzi-qq-image-library-delete-action/.test(app)
            && /selectedImageAssetIds/.test(app)
            && /pointerdown/.test(app)
            && /setTimeout/.test(app)
            && /classList\.toggle\('is-selection-mode'/.test(app)
            && cssRuleHas(css, '.yuzi-qq-image-library-view:not(.is-selection-mode) .yuzi-qq-image-library-delete-action', 'display: inline-grid')
            && cssRuleHas(css, '.yuzi-qq-image-library-view.is-selection-mode .yuzi-qq-image-library-delete-action', 'display: inline-grid')
            && /\u5220\u9664/.test(app),
        'image libraries must support the four shared stores, long-press multi-select, always-visible trash, and delete wording',
    );
    requireContract(
        /avatar[\s\S]*profile-background[\s\S]*chat-background[\s\S]*sticker/.test(imageLibrary)
            && /yuzi-qq-image-library-heading/.test(imageLibrary)
            && cssRuleHas(css, '.yuzi-qq-image-library-heading', 'flex-direction: column')
            && cssRuleHas(css, '.yuzi-qq-image-library-heading::after', "content: '\u4ed3\u5e93'"),
        'image libraries must be labeled in avatar, profile-background, chat-background, sticker order with a repository subtitle',
    );

    const addContact = sourceSlice(app, 'const openAddContactForm =', 'const openMessageAddMenu =');
    requireContract(
        /(?:result\?\.result\?\.created\s*===\s*false|!result\?\.result\?\.created)/.test(addContact)
            && /go\(\{[\s\S]{0,140}type:\s*'profile'[\s\S]{0,140}conversationId:/.test(addContact),
        'adding an existing same-name contact must route directly to its matching profile',
    );

    assert.deepEqual(gaps, [], 'QQ Figma refinement UI contract gaps:\n- ' + gaps.join('\n- '));
    console.log('[qq-figma-refinement-ui-contract] passed');
}

try {
    main();
} catch (error) {
    console.error('[qq-figma-refinement-ui-contract] failed');
    console.error(error);
    process.exitCode = 1;
}
