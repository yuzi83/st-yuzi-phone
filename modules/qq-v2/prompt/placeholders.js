export const QQ_V2_PROMPT_PLACEHOLDER_DEFINITIONS = Object.freeze([
    Object.freeze({ token: '{{私聊人物}}', variable: 'privatePerson', description: '人物名字。' }),
    Object.freeze({ token: '{{私聊主动人物}}', variable: 'privateProactivePeople', description: '联系人所有人名字。' }),
    Object.freeze({ token: '{{群聊成员}}', variable: 'groupMembers', description: '当前群聊成员的身份、角色与权限。' }),
    Object.freeze({ token: '{{群聊记忆}}', variable: 'groupMemory', description: '当前私聊人物参加的群聊记忆。' }),
    Object.freeze({ token: '{{主动群聊记忆}}', variable: 'proactiveGroupMemory', description: '本轮主动私聊人物参加的群聊记忆。' }),
    Object.freeze({ token: '{{私聊记忆}}', variable: 'privateMemory', description: '当前群聊成员各自的私聊记忆。' }),
    Object.freeze({ token: '{{主动私聊记忆}}', variable: 'proactivePrivateMemory', description: '本轮主动群聊成员各自的私聊记忆。' }),
    Object.freeze({ token: '{{私聊主动记录}}', variable: 'privateProactiveHistory', description: '本轮主动私聊候选会话的最近记录。' }),
    Object.freeze({ token: '{{群聊记录}}', variable: 'groupHistory', description: '当前群聊会话的最近消息记录。' }),
    Object.freeze({ token: '{{正文上下文}}', variable: 'storyContext', description: 'SillyTavern 当前正文的最近若干轮对话。' }),
    Object.freeze({ token: '{{世界书内容}}', variable: 'worldbookContent', description: '当前请求命中的世界书内容。' }),
    Object.freeze({ token: '{{故事时间}}', variable: 'storyTime', description: '当前故事时间。' }),
    Object.freeze({ token: '{{可用表情}}', variable: 'availableStickers', description: '可发送表情的 ID 与含义说明。' }),
]);

export const QQ_V2_PROMPT_PLACEHOLDERS = Object.freeze(
    QQ_V2_PROMPT_PLACEHOLDER_DEFINITIONS.map(({ token }) => token),
);
