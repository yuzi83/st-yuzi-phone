import { getCurrentPhoneAiInstructionPresetName } from '../../../phone-core/chat-support.js';

export function getCurrentAiInstructionPresetNameText() {
    const safeName = String(getCurrentPhoneAiInstructionPresetName() || '').trim();
    return safeName || '默认实时回复预设';
}
