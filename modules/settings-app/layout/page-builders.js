import { buildSettingsHomePageHtml as buildSettingsHomePageHtmlImpl } from './page-builders/overview-builders.js';
import {
    buildAppearancePageHtml as buildAppearancePageHtmlImpl,
    buildButtonStylePageHtml as buildButtonStylePageHtmlImpl,
} from './page-builders/appearance-builders.js';
import {
    buildDatabasePageHtml as buildDatabasePageHtmlImpl,
    buildDatabaseTableChecklistHtml as buildDatabaseTableChecklistHtmlImpl,
} from './page-builders/data-builders.js';
import {
    buildPromptEditorPageHtml as buildPromptEditorPageHtmlImpl,
    buildApiPromptConfigPageHtml as buildApiPromptConfigPageHtmlImpl,
    buildAiInstructionPresetsPageHtml as buildAiInstructionPresetsPageHtmlImpl,
    buildBeautifyTemplatePageHtml as buildBeautifyTemplatePageHtmlImpl,
} from './page-builders/editor-builders.js';

export function buildSettingsHomePageHtml(args) {
    return buildSettingsHomePageHtmlImpl(args);
}

export function buildAppearancePageHtml(args) {
    return buildAppearancePageHtmlImpl(args);
}

export function buildDatabaseTableChecklistHtml(tableEntries, selectedSet, apiAvailability) {
    return buildDatabaseTableChecklistHtmlImpl(tableEntries, selectedSet, apiAvailability);
}

export function buildDatabasePageHtml(args) {
    return buildDatabasePageHtmlImpl(args);
}

export function buildButtonStylePageHtml(args) {
    return buildButtonStylePageHtmlImpl(args);
}

export function buildPromptEditorPageHtml(args) {
    return buildPromptEditorPageHtmlImpl(args);
}

export function buildApiPromptConfigPageHtml(args) {
    return buildApiPromptConfigPageHtmlImpl(args);
}

export function buildAiInstructionPresetsPageHtml(args) {
    return buildAiInstructionPresetsPageHtmlImpl(args);
}

export function buildBeautifyTemplatePageHtml(args) {
    return buildBeautifyTemplatePageHtmlImpl(args);
}
