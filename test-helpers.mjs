/* =============================================================================
   测试辅助：加载 UMD 库 + 极简 DOM 桩
   库文件（lib.mjs / compose.mjs）用的是 UMD 包装：
     - 浏览器 <script src>：没有 module，挂到 globalThis.RTLib / RTCompose
     - Node require：命中 module.exports
   测试里统一用 eval 源码的方式加载，和执行环境保持一致，避免文件名后缀带来的歧义。
   ============================================================================= */
import fs from "node:fs";

const DEFAULT_DIR = "E:/documents/dsh-demo/tmp-richtext-lab/";

/* 加载一个 UMD 库，返回它的 API 对象 */
export function loadLib(file, dir = DEFAULT_DIR){
  const src = fs.readFileSync(dir + file, "utf8");
  const prev = { RTLib: globalThis.RTLib, RTCompose: globalThis.RTCompose };
  delete globalThis.RTLib; delete globalThis.RTCompose;
  /* 故意不提供 module 与 document，让 UMD 走"挂全局"分支 */
  new Function("globalThis", src)(globalThis);
  const api = file.startsWith("lib") ? globalThis.RTLib : globalThis.RTCompose;
  if(!api) throw new Error(file + " 没有导出任何东西（UMD 包装坏了？）");
  /* 还原全局，避免互相污染 */
  if(prev.RTLib === undefined) delete globalThis.RTLib; else globalThis.RTLib = prev.RTLib;
  if(prev.RTCompose === undefined) delete globalThis.RTCompose; else globalThis.RTCompose = prev.RTCompose;
  return api;
}

/* 取出 HTML 里的经典脚本（按加载顺序） */
export function scriptsOf(html){
  const out = [];
  const re = /<script([^>]*)>([\s\S]*?)<\/script>/g;
  let m;
  while((m = re.exec(html))){
    const attrs = m[1] || "", body = m[2] || "";
    const src = (attrs.match(/src\s*=\s*"([^"]+)"/) || [])[1];
    if(src) out.push({ type: "src", file: src });
    else if(body.trim()) out.push({ type: "inline", body });
  }
  return out;
}

/* 极简 DOM 桩：元素有 kids 数组，文本节点没有 */
export function makeEl(tag = "div", id = ""){
  const el = {
    tagName: tag, id, kids: [], children: [], attrs: {}, style: {}, dataset: {},
    value: "", textContent: "", innerHTML: "", title: "", disabled: false,
    selectionStart: 0, selectionEnd: 0, className: "", _cls: new Set(), _text: "",
    classList: {
      add: (...c) => c.forEach(x => el._cls.add(x)),
      remove: (...c) => c.forEach(x => el._cls.delete(x)),
      contains: c => el._cls.has(c),
      toggle: (c, on) => { if (on === undefined) el._cls.has(c) ? el._cls.delete(c) : el._cls.add(c); else if (on) el._cls.add(c); else el._cls.delete(c); },
      replace: () => {}
    },
    appendChild(c){ el.kids.push(c); el.children.push(c); return c; },
    append(...cs){ cs.forEach(c => el.appendChild(c)); },
    insertAdjacentHTML(){},
    setAttribute(k, v){ el.attrs[k] = v; },
    getAttribute(k){ return el.attrs[k]; },
    removeAttribute(k){ delete el.attrs[k]; },
    querySelectorAll(){ return []; },
    querySelector(){ return null; },
    closest(){ return null; },
    focus(){}, select(){}, click(){},
    addEventListener(){}, removeEventListener(){},
    getBoundingClientRect(){ return { top:0, left:0, width:100, height:20 }; }
  };
  return el;
}

export function makeDocument(html = "", missing = []){
  const byId = new Map();
  [...String(html).matchAll(/\bid="([^"]+)"/g)].forEach(m => byId.set(m[1], makeEl("div", m[1])));
  return {
    _byId: byId,
    getElementById(id){
      if(!byId.has(id)){ byId.set(id, makeEl("div", id)); missing.push(id); }
      return byId.get(id);
    },
    createElement: tag => makeEl(tag),
    createTextNode: t => ({ nodeType: 3, textContent: String(t) }),
    createDocumentFragment: () => makeEl("#fragment"),
    querySelectorAll: () => [],
    querySelector: () => null,
    addEventListener(){}, removeEventListener(){},
    execCommand(){ return true; },
    head: makeEl("head"), body: makeEl("body")
  };
}

/* 把 DOM 桩挂成全局（lib 里是裸用 document 的），跑完自动还原 */
export function withDom(doc, fn){
  const prev = { document: globalThis.document, window: globalThis.window };
  globalThis.document = doc;
  globalThis.window = globalThis;
  try{ return fn(); }
  finally{
    globalThis.document = prev.document;
    globalThis.window = prev.window;
  }
}

export function assertNoModules(html){
  return {
    hasModuleScript: /<script[^>]*type\s*=\s*"module"/.test(html),
    hasImport: /(^|\n)\s*import\s+.*from\s+["']/.test(html)
  };
}

export const DIR = DEFAULT_DIR;
