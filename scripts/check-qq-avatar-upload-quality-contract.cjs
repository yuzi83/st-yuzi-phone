const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('modules/qq-v2/ui/app.js', 'utf8');

const uploadFunctions = [
    'updatePrivateProfileAsset',
    'updateConversationBackgroundAsset',
    'updateCurrentProfileAsset',
    'uploadImageLibraryAsset',
];

for (const [index, name] of uploadFunctions.entries()) {
    const start = source.indexOf(`const ${name} =`);
    const end = index + 1 < uploadFunctions.length
        ? source.indexOf(`const ${uploadFunctions[index + 1]} =`, start)
        : source.indexOf('const confirmImageLibraryDeletion =', start);
    const body = start >= 0 && end > start ? source.slice(start, end) : '';
    assert.match(body, /pickImageFiles\(/, `${name} must use the raw image picker`);
    assert.doesNotMatch(body, /pickImageFile\(/, `${name} must not use the crop-and-compress picker`);
    assert.doesNotMatch(body, /cropPreset|cropTitle|compress\s*:/, `${name} must not crop or compress QQ images`);
    assert.doesNotMatch(body, /fetch\(dataUrl\)|fileToDataUrl/, `${name} must keep the original File as its Blob`);
}

const profileUploads = source.slice(
    source.indexOf('const updatePrivateProfileAsset ='),
    source.indexOf('const uploadImageLibraryAsset ='),
);
assert.equal((profileUploads.match(/multiple:\s*false/g) || []).length, 3,
    'current-user, NPC profile and conversation background uploads must remain single-file controls');

const libraryUpload = source.slice(
    source.indexOf('const uploadImageLibraryAsset ='),
    source.indexOf('const confirmImageLibraryDeletion ='),
);
assert.match(libraryUpload, /facade\.intent\.saveImageLibraryAssets\(/,
    'image libraries must use the batch persistence path');
assert.doesNotMatch(libraryUpload, /multiple:\s*false/,
    'image libraries must keep multi-select enabled');

console.log('[qq-avatar-upload-quality-contract] checks passed');
