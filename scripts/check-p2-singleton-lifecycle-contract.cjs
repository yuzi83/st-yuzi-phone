const fs=require('fs');
const path=require('path');
const ROOT=process.cwd();
const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
const check=(out,file,desc,ok)=>out.push({file,desc,ok});
const pos=(s,n)=>{const i=s.indexOf(n);if(i<0)throw new Error(`缺少片段: ${n}`);return i;};
function main(){
  const index=read('index.js');
  const loader=JSON.parse(read('酒馆助手脚本-玉子手机.json')).content;
  new Function('window','document','fetch',`return (async()=>{${loader}\n})();`);
  const out=[];
  check(out,'index.js','定义 singleton key',index.includes("const INSTANCE_KEY = '__YUZI_PHONE_INSTANCE__';"));
  check(out,'index.js','定义 owner token',index.includes('const INSTANCE_OWNER_TOKEN ='));
  for(const f of ['version','source','createdAt','status','ownerToken','instanceId','destroy','getInitStatus'])check(out,'index.js',`record 包含 ${f}`,index.includes(f));
  const guard=pos(index,'if (!acquireSingletonGuard()) return;');
  const cfg=pos(index,'configureErrorHandler({');
  const bind=pos(index,'bindPhoneBootstrapWindowEvents(globalEventManager);');
  const init=pos(index,'await ensureInitialized();');
  check(out,'index.js','guard 前置阻止初始化链路',guard<cfg&&cfg<bind&&bind<init);
  check(out,'index.js','拒绝 active instance',index.includes("blockSingletonInitialization('active-instance'"));
  check(out,'index.js','拒绝 legacy traces',index.includes("blockSingletonInitialization('legacy-traces'"));
  check(out,'index.js','ownerToken 防误删',index.includes('host?.[INSTANCE_KEY]?.ownerToken === INSTANCE_OWNER_TOKEN'));
  check(out,'index.js','index trace 不含 css/js',!/LEGACY_INSTANCE_TRACE_IDS[\s\S]*yuzi-phone-css/.test(index)&&!/LEGACY_INSTANCE_TRACE_IDS[\s\S]*yuzi-phone-js/.test(index));
  check(out,'loader','检测 singleton key',loader.includes("const INSTANCE_KEY = '__YUZI_PHONE_INSTANCE__';"));
  for(const id of ['yuzi-phone-root','yuzi-phone-standalone','yuzi-phone-toggle','yuzi-phone-settings','yuzi-phone-css','yuzi-phone-js'])check(out,'loader',`检测 ${id}`,loader.includes(id));
  const first=pos(loader,'const initialBlockReason = getDuplicateLoadBlockReason();');
  const fetchCall=pos(loader,"fetch('https://api.github.com/repos/yuzi83/st-yuzi-phone/tags')");
  const second=pos(loader,'const postFetchBlockReason = getDuplicateLoadBlockReason();');
  const appendLink=pos(loader,'appendChild(link)');
  const appendScript=pos(loader,'appendChild(script)');
  check(out,'loader','loader fetch 前和 append 前均复检重复加载',first<fetchCall&&fetchCall<second&&second<appendLink&&appendLink<appendScript);
  check(out,'loader','loader 不使用顶层 return',!loader.includes('return;'));
  check(out,'loader','loader 不自动 destroy 旧实例',!loader.includes('.destroy(')&&!loader.includes('destroy?.('));
  check(out,'loader','重复加载提示使用 warn',loader.includes('console.warn(message, reason);'));
  const failed=out.filter(x=>!x.ok);
  if(failed.length){
    console.error('[p2-singleton-lifecycle-contract-check] 检查失败：');
    for(const x of failed) console.error(`- ${x.file}: ${x.desc}`);
    process.exitCode=1;
    return;
  }
  console.log('[p2-singleton-lifecycle-contract-check] 检查通过');
  for(const x of out) console.log(`- OK | ${x.file} | ${x.desc}`);
}
main();