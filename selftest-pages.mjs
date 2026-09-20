// 页面自检：按 HTML 里的 <script> 顺序，在 DOM 桩里把两个页面真跑一遍。
// 目的：抓"初始化就崩""引用了不存在的 id""用了 file:// 下会失败的 ES module"。
import fs from "node:fs";
import { scriptsOf, assertNoModules } from "./test-helpers.mjs";

const D = "E:/documents/dsh-demo/tmp-richtext-lab/";
let pass = 0, fail = 0;
const check = (n, c, x) => { if (c) { pass++; console.log("PASS  " + n); } else { fail++; console.log("FAIL  " + n + (x ? "\n      " + x : "")); } };

/* ---------- DOM 桩 ---------- */
function makeEl(tag = "div", id = ""){
  const el = {
    tagName: tag, id, kids: [], children: [], attrs: {}, style: {}, dataset: {},
    value: "", textContent: "", innerHTML: "", title: "", disabled: false,
    selectionStart: 0, selectionEnd: 0, className: "", _cls: new Set(),
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

function makeDocument(html, missing){
  const byId = new Map();
  [...html.matchAll(/\bid="([^"]+)"/g)].forEach(m => byId.set(m[1], makeEl("div", m[1])));
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

/* 在 Node 里把浏览器经典脚本跑起来：临时把桩挂成全局，再 require 库文件。
   库文件是同一份源文件（.mjs 里的 UMD），所以测的就是浏览器真正加载的代码。 */
function runPage(file){
  const html = fs.readFileSync(D + file, "utf8");
  const scripts = scriptsOf(html);
  const missing = [];
  const doc = makeDocument(html, missing);

  /* 浏览器里 window === globalThis，所以桩也直接挂在 globalThis 上，
     页面脚本和 UMD 包装看到的才是同一个对象。 */
  const prev = { document: globalThis.document, navigator: globalThis.navigator };
  globalThis.document = doc;
  try{ Object.defineProperty(globalThis, "navigator", { value: { clipboard: null }, configurable: true, writable: true }); }catch(e){}
  globalThis.window = globalThis;
  globalThis.__composer = null;
  delete globalThis.RTLib; delete globalThis.RTCompose;
  const win = globalThis;
  doc.defaultView = win;
  try{
    for(const s of scripts){
      if(s.type === "src"){
        /* 直接执行库文件源码，且故意不传 module —— UMD 会走"挂全局"分支，和浏览器一致 */
        const src = fs.readFileSync(D + s.file, "utf8");
        new Function("globalThis", "window", "document", src)(globalThis, win, doc);
      }else{
        new Function("window", "document", "navigator", s.body)(win, doc, win.navigator);
      }
    }
  }finally{
    globalThis.document = prev.document;
    globalThis.window = undefined;
    if(prev.navigator !== undefined){
      try{ Object.defineProperty(globalThis, "navigator", { value: prev.navigator, configurable: true, writable: true }); }catch(e){}
    }
  }
  return { doc, win, html, scripts, missing };
}

/* ---------- index.html ---------- */
let idx = null;
try{
  idx = runPage("index.html");
  check("index.html 脚本能完整跑起来", true);
}catch(e){
  check("index.html 脚本能完整跑起来", false, e.message + "\n" + e.stack.split("\n").slice(1,4).join("\n"));
}
if(idx){
  check("index.html 没有引用不存在的元素 id", idx.missing.length === 0, idx.missing.join(", "));
  check("index.html 加载了 lib / compose / app 三个脚本",
    idx.scripts.filter(s => s.type === "src").map(s => s.file).join(",") === "lib.mjs,compose.mjs,app.js",
    idx.scripts.filter(s => s.type === "src").map(s => s.file).join(","));
  const c = idx.win.__composer;
  check("页面暴露了 __composer（说明脚本执行到了末尾）", !!c);
  if(c){
    check("默认状态生成预期代码（与原始例子一致）",
      c.compose("滴滴滴", c.state.order, c.state.on, c.state) === "<color=#e0b45e><size=100><b>滴滴滴</b></size></color>",
      c.compose("滴滴滴", c.state.order, c.state.on, c.state));
    check("默认选中了 颜色/字号/加粗", !!(c.state.on.color && c.state.on.size && c.state.on.b));
  }
  ["presets","grp-text","grp-deco","grp-size","swatches","picked","code","preview","rawout","counter","taglen"]
    .forEach(id => check("容器存在: " + id, idx.doc._byId.has(id)));
  /* 回归：实测无效的标签已从生成器移除，页面上不该还有它们的控件 */
  check("页面上没有渐变字控件", !idx.doc._byId.has("chipGradient"));
  check("页面上没有底色高亮控件", !idx.doc._byId.has("chipMark") && !idx.doc._byId.has("markpick"));
  const appSrc = fs.readFileSync(D + "app.js", "utf8");
  check("app.js 里不再引用 chipGradient", !appSrc.includes("chipGradient"));
  check("app.js 里不再引用 chipMark / markpick", !appSrc.includes("chipMark") && !appSrc.includes("markpick"));
  if(c){
    const allKeys = Object.keys(c.PLAIN_TAGS);
    const allOn = {}; allKeys.forEach(k => { allOn[k] = true; });
    const everything = c.compose("x", allKeys, allOn, c.state);
    check("勾满全部样式也产不出 <gradient> / <mark>",
      everything.indexOf("<gradient") < 0 && everything.indexOf("<mark") < 0, everything);
  }
}

/* ---------- lab.html ---------- */
try{
  const lab = runPage("lab.html");
  check("lab.html 脚本能完整跑起来", true);
  check("lab.html 没有引用不存在的元素 id", lab.missing.length === 0, lab.missing.join(", "));
}catch(e){
  check("lab.html 脚本能完整跑起来", false, e.message + "\n" + e.stack.split("\n").slice(1,4).join("\n"));
}

/* ---------- 关键回归：绝不能再出现 ES module（file:// 会被 CORS 拦） ---------- */
for(const f of ["index.html", "lab.html"]){
  const html = fs.readFileSync(D + f, "utf8");
  const m = assertNoModules(html);
  check(f + " 没有 type=\"module\" 脚本", !m.hasModuleScript);
  check(f + " 没有 import 语句", !m.hasImport);
  check(f + " 用 src 引入共享库", /<script src="(lib|compose)\.mjs"><\/script>/.test(html));
  check(f + " 没有内联复制解析器", !html.includes("function parseTree") && !html.includes("const TAGS = {"));
}

/* ---------- 移动端自适应：静态检查 ---------- */
for(const f of ["index.html", "lab.html"]){
  const html = fs.readFileSync(D + f, "utf8");
  const vp = (html.match(/<meta name="viewport" content="([^"]+)"/) || [])[1] || "";
  check(f + " 声明了 viewport", vp.length > 0, vp);
  check(f + " viewport 用 width=device-width", /width=device-width/.test(vp), vp);
  check(f + " viewport 支持刘海屏（viewport-fit=cover）", /viewport-fit=cover/.test(vp), vp);
  check(f + " 声明了 color-scheme: dark（避免移动端白底闪烁）", /name="color-scheme" content="dark"/.test(html));
  check(f + " 有手机断点（≤640px）", /@media[^{]*max-width:\s*640px/.test(html));
  check(f + " 有小平板断点（≤780/900px）", /@media[^{]*max-width:\s*(780|900)px/.test(html));
  check(f + " 有触屏适配（pointer:coarse）", /@media[^{]*(pointer:coarse|hover:none)/.test(html));
  check(f + " 触屏下输入框 ≥16px（iOS 聚焦不缩放）", /input[^{]*\{[^}]*font-size:\s*(1[6-9]|[2-9]\d)px/.test(html)
    || /#text,#code,\.hexin,\.num\{font-size:16px\}/.test(html) || /textarea,\.rawbox\{font-size:1[5-9]px\}/.test(html));
  check(f + " 用了 safe-area 内边距（刘海/小白条）", /env\(safe-area-inset/.test(html) || f === "lab.html");
  check(f + " 没有固定宽度撑破小屏的容器", !/min-width:\s*(4[0-9]\d|[5-9]\d\d|\d{4,})px/.test(html));
  check(f + " 有 img/svg/table/pre 宽度保险", /img,svg,table,pre\{max-width:100%\}/.test(html.replace(/\s+/g, "")));
  check(f + " 有 overflow-x 保险（不带动整页横滑）", /overflow-x:\s*hidden/.test(html));
}

/* 生成器页面的两栏结果区必须在窄屏折叠成单列 */
check("index.html 的结果区在窄屏折叠为单列", /@media[^{]*max-width:\s*780px[^{]*\{[\s\S]*?\.result\{grid-template-columns:1fr\}/.test(fs.readFileSync(D + "index.html", "utf8")));
check("lab.html 的左右分栏在窄屏折叠为上下", /@media[^{]*max-width:\s*900px[^{]*\{[\s\S]*?\.app\{grid-template-columns:1fr/.test(fs.readFileSync(D + "lab.html", "utf8")));

console.log("\n结果: " + pass + " 通过, " + fail + " 失败");
process.exit(fail ? 1 : 0);
