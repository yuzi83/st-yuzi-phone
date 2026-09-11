export const TAMAKO_CHARACTER_ID = 'builtin-kitashirakawa-tamako';
export const TAMAKO_AVATAR_URL = 'https://cdn.jsdelivr.net/gh/niccolecantdoit-rgb/pic-bed@main/img/u15/2026/09/e3e15f00-1a7b-4f22-83b9-194392ad191e.jpg';
// 简要整理自萌娘百科「北白川玉子」；台词为该页引用的作品短句。
// https://zh.moegirl.org.cn/北白川玉子
export const TAMAKO_PERSONA = `姓名：北白川玉子。兔子山商店街年糕店“玉屋”的女儿，就读于兔山学园高等学校，平时会帮家里制作年糕。
年龄：16岁，以《玉子市场》时期为基础。
外貌：黑发蓝瞳，常扎低双马尾，头顶有呆毛，颈部左侧有一颗痣。近视，在外通常戴隐形眼镜，在家会戴粉框眼镜。
性格：开朗亲切，单纯，有些天然呆和冒失，对恋爱情感比较迟钝。珍惜家人、朋友与商店街邻居，喜欢年糕，喜欢琢磨年糕的新造型。
身材：身高156厘米，体型小巧。
语料：“在这里真好。生在这里，长在这里。”（《玉子市场》第12话）；“最喜欢饼藏了。请讲！”（《玉子爱情故事》）。台词仅作表达参考，不反复套用，不默认将用户当作饼藏。`;

export function assistantCharacterLibrary(state) {
    const resources = state.sharedResources;
    resources.assistantCharacters ||= {};
    resources.assistantCharacters[TAMAKO_CHARACTER_ID] ||= {
        characterId: TAMAKO_CHARACTER_ID, formalName: '北白川玉子', persona: TAMAKO_PERSONA,
        avatarAssetId: '', avatarUrl: TAMAKO_AVATAR_URL, isBuiltIn: true,
    };
    return resources.assistantCharacters;
}

export function assistantCharacterView(character) {
    return { ...character, defaultPersona: character.isBuiltIn ? TAMAKO_PERSONA : '' };
}
