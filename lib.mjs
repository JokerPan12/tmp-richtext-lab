// 共享库：从 lab.html 抽出，供 index.html（生成器）和 lab.html（实验室）共用

(function(root, factory){
  const api = factory();
  /* 浏览器里 <script src> 直接跑，挂到全局；Node 里走 ESM export */
  if(typeof module !== "undefined" && module.exports){ module.exports = api; }
  else { root.RTLib = api; }
})(typeof globalThis !== "undefined" ? globalThis : this, function(){
"use strict";

/* =========================================================================
   1) 标签定义表
   ========================================================================= */
const TAGS = {
  b:{cn:"加粗",           ex:"<b>粗体</b>",                       open:(s,e)=>{e.style.fontWeight="700";},  block:false},
  i:{cn:"斜体",           ex:"<i>斜体</i>",                       open:(s,e)=>{e.style.fontStyle="italic";}, block:false},
  u:{cn:"下划线",         ex:"<u>下划线</u>",                     open:(s,e)=>{e.style.textDecoration="underline";}, block:false},
  s:{cn:"删除线",         ex:"<s>划掉</s>",                       open:(s,e)=>{e.style.textDecoration="line-through";}, block:false},
  strikethrough:{cn:"删除线（完整写法）", ex:"<strikethrough>划掉</strikethrough>", open:(s,e)=>{e.style.textDecoration="line-through";}, block:false},
  color:{cn:"文字颜色",   ex:"<color=#ff5555>红色</color>",        open:(s,e)=>{e.style.color=normColor(av(attrs(s),"color")||"#ffffff");}, block:false},
  alpha:{cn:"透明度（00–FF）", ex:"<alpha=#80>半透明</alpha>",     open:(s,e)=>{const v=av(attrs(s),"alpha")||"FF"; e.style.opacity=String((parseInt(v.replace("#",""),16)||255)/255);}, block:false},
  size:{cn:"字号（TMP 点值）", ex:"<size=160>放大</size>",         open:(s,e)=>{e.dataset.size=av(attrs(s),"size")||"100";}, block:false},
  mark:{cn:"底色高亮（聊天里通常无效）", ex:"<mark=#ffcc0066>高亮</mark>", open:(s,e)=>{e.style.background=normColor(av(attrs(s),"mark")||"#ffff00");}, block:false},
  gradient:{cn:"渐变（需预设名 · 聊天里通常无效）", ex:"<gradient=Sunset>渐变字</gradient>", open:(s,e)=>{e.classList.add("g-demo");}, block:false},
  font:{cn:"字体（需已打包）", ex:"<font=SimHei>换字体</font>",     open:(s,e)=>{e.style.fontFamily=(av(attrs(s),"font")||"SimHei")+',"Microsoft YaHei",sans-serif';}, block:false},
  "font-weight":{cn:"字重", ex:"<font-weight=800>更粗</font-weight>", open:(s,e)=>{e.style.fontWeight=av(attrs(s),"font-weight")||"800";}, block:false},
  sprite:{cn:"内联图标/表情", ex:'<sprite name="smile">',          open:(s,e)=>{const a=attrs(s); const lb=a.name||a.index||a._def||"?"; const c=document.createElement("span"); c.className="sprite-chip"; c.textContent=lb; e.appendChild(c);}, block:false},
  style:{cn:"自定义样式（需预设）", ex:'<style="Title">标题样式</style>', open:(s,e)=>{e.style.fontWeight="700"; e.style.letterSpacing="1px"; e.title="style="+(av(attrs(s),"style")||"");}, block:false},
  link:{cn:"可点击链接段", ex:'<link="item_1001">查看物品</link>',  open:(s,e)=>{e.style.color="#7ec3ff"; e.style.textDecoration="underline"; e.title="linkID = "+(av(attrs(s),"link")||"");}, block:false},
  align:{cn:"水平对齐",   ex:"<align=center>居中</align>",         open:(s,e)=>{const v=(av(attrs(s),"align")||"left").toLowerCase(); e.style.textAlign=v==="justified"?"justify":v;}, block:true},
  indent:{cn:"整段缩进",  ex:"<indent=15%>整段缩进</indent>",       open:(s,e)=>{e.style.textIndent=len(av(attrs(s),"indent")||"10%"); e.dataset.indent=len(av(attrs(s),"indent")||"10%");}, block:true},
  "line-indent":{cn:"首行缩进", ex:"<line-indent=2em>首行缩进</line-indent>", open:(s,e)=>{e.style.textIndent=len(av(attrs(s),"line-indent")||"2em");}, block:true},
  "line-height":{cn:"行高", ex:"<line-height=200%>行距变大</line-height>", open:(s,e)=>{e.style.lineHeight=len(av(attrs(s),"line-height")||"150%");}, block:true},
  margin:{cn:"左右边距",  ex:"<margin=2em>左右留白</margin>",       open:(s,e)=>{const v=len(av(attrs(s),"margin")||"1em"); e.style.marginLeft=v; e.style.marginRight=v;}, block:true},
  width:{cn:"文本区宽度", ex:"<width=60%>变窄</width>",            open:(s,e)=>{e.style.display="inline-block"; e.style.width=len(av(attrs(s),"width")||"50%");}, block:true},
  voffset:{cn:"基线垂直偏移", ex:"<voffset=0.6em>上浮</voffset>",   open:(s,e)=>{e.style.position="relative"; e.style.top="-"+len(av(attrs(s),"voffset")||"0.5em");}, block:false},
  cspace:{cn:"字间距",    ex:"<cspace=0.6em>稀</cspace>",          open:(s,e)=>{e.style.letterSpacing=len(av(attrs(s),"cspace")||"0.5em");}, block:false},
  mspace:{cn:"等宽显示",  ex:"<mspace=1.6em>等宽字</mspace>",       open:(s,e)=>{e.style.fontFamily="Consolas,monospace"; e.style.letterSpacing=len(av(attrs(s),"mspace")||"1em");}, block:false},
  space:{cn:"插入空白",   ex:"A<space=4em>B",                     open:(s,e)=>{e.style.display="inline-block"; e.style.width=len(av(attrs(s),"space")||"1em");}, block:false},
  pos:{cn:"指定本行横向位置", ex:"<pos=40%>定位</pos>",            open:(s,e)=>{e.style.position="relative"; e.style.left=len(av(attrs(s),"pos")||"0");}, block:false},
  rotate:{cn:"单字/整段旋转", ex:"<rotate=20>歪着的字</rotate>",    open:(s,e)=>{const n=(av(attrs(s),"rotate")||"0").replace(/[^\-0-9.]/g,""); e.style.display="inline-block"; e.style.transform="rotate("+(n||"0")+"deg)";}, block:false},
  sub:{cn:"下标",         ex:"H<sub>2</sub>O",                    open:(s,e)=>{e.style.fontSize=".72em"; e.style.verticalAlign="-0.22em";}, block:false},
  sup:{cn:"上标",         ex:"x<sup>2</sup>",                     open:(s,e)=>{e.style.fontSize=".72em"; e.style.verticalAlign="0.45em";}, block:false},
  uppercase:{cn:"转大写", ex:"<uppercase>abc</uppercase>",         open:(s,e)=>{e.style.textTransform="uppercase";}, block:false},
  allcaps:{cn:"转大写（同义词）", ex:"<allcaps>abc</allcaps>",      open:(s,e)=>{e.style.textTransform="uppercase";}, block:false},
  lowercase:{cn:"转小写", ex:"<lowercase>ABC</lowercase>",         open:(s,e)=>{e.style.textTransform="lowercase";}, block:false},
  smallcaps:{cn:"小型大写", ex:"<smallcaps>abc</smallcaps>",       open:(s,e)=>{e.style.fontVariant="small-caps";}, block:false},
  nobr:{cn:"禁止段内换行", ex:"<nobr>这一整段不会被拆开换行</nobr>", open:(s,e)=>{e.style.whiteSpace="nowrap";}, block:false},
  br:{cn:"强制换行（自闭和）", ex:"第一行<br>第二行",               open:()=>{}, block:true},
  page:{cn:"分页（自闭和）", ex:"<page>",                          open:()=>{}, block:true},
  noparse:{cn:"不解析内部标签", ex:"<noparse><b>不会变粗</b></noparse>", open:()=>{}, block:false}
};
const ALIAS = {strike:"s", "lineheight":"line-height", allcapsTxt:"uppercase"};
const SELF_CLOSING = new Set(["br","page","sprite","space","pos"]);


/* =========================================================================
   2) 工具函数
   ========================================================================= */
function esc(t){return String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}

/* 属性解析：兼容 TMP 的三种写法
   name="v" / name=v / 省略属性名（如 <color=#fff>、<size=120>、<align=center>）
   省略属性名时键名记为空串，取值可用 attrs(head)._ 或 attrs(head).color 兜底。 */
function attrs(s){
  const out={_def:""}, re=/([A-Za-z_][\w-]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s=]+))|=\s*("([^"]*)"|'([^']*)'|([^\s=]+))|([A-Za-z_][\w-]*)/g;
  let m;
  while((m=re.exec(s))){
    if(m[1]!==undefined){ out[m[1].toLowerCase()] = m[3]!==undefined?m[3]:(m[4]!==undefined?m[4]:m[5]); continue; }
    if(m[6]!==undefined){ out._def = m[7]!==undefined?m[7]:(m[8]!==undefined?m[8]:m[9]); continue; }
    if(m[10]!==undefined){ out[m[10]]=""; }
  }
  return out;
}
/* 取属性的值：优先同名字段，其次取省略属性名时的默认值 */
function av(a, key){ return a[key] !== undefined && a[key] !== "" ? a[key] : (a._def || ""); }
/* "15%" / "2em" / "30" → CSS 长度；裸数字按 px 处理 */
function len(v){
  v=String(v==null?"":v).trim();
  if(v==="") return "0px";
  if(/^[-\d.]+$/.test(v)) return v+"px";
  return v.replace(/^([-\d.]+)\s*$/, "$1px");
}
function normColor(v){
  v=String(v||"").trim();
  if(v==="") return "#ffffff";
  if(/^#?[0-9a-fA-F]{8}$/.test(v)){
    const h=v.replace("#","");
    const r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16),a=parseInt(h.slice(6,8),16)/255;
    return "rgba("+r+","+g+","+b+","+a.toFixed(3)+")";
  }
  return /^#/.test(v)?v:"#"+v;
}
/* 从标签头解析出属性字符串（去掉标签名） */
function tagBody(head, name){ return head.slice(name.length); }
function resolveName(n){
  n=String(n||"").toLowerCase();
  return ALIAS[n]||n;
}

/* =========================================================================
   3) 解析：标签文本 → 树
   ========================================================================= */
/* 文本一律用 #text 叶子节点表示，只有一个真相来源 */
function textNode(t){ return {tag:"#text", head:"", kids:[], text:t}; }
function parseTree(str, whitelist){
  const root={tag:"#root", head:"", kids:[]};
  const mode={align:"left"};
  const stack=[root];
  let i=0;
  const pushText=(t)=>{ if(t) stack[stack.length-1].kids.push(textNode(t)); };
  const newBlock=()=>{
    const nd={tag:"#line", head:"", kids:[], align:mode.align};
    stack[stack.length-1].kids.push(nd);
    return nd;
  };
  const top=()=>stack[stack.length-1];

  while(i<str.length){
    const lt=str.indexOf("<",i);
    if(lt<0){ pushText(str.slice(i)); break; }
    pushText(str.slice(i,lt));

    if(str.startsWith("<<",lt)){ pushText("<"); i=lt+2; continue; }

    const gt=str.indexOf(">",lt+1);
    if(gt<0){ pushText(str.slice(lt)); break; }

    const inner=str.slice(lt+1,gt).trim();
    const rawName=(inner[0]==="/"?inner.slice(1):inner).trim().split(/[\s=]/)[0]||"";
    const name=resolveName(rawName);
    const closing=inner[0]==="/";

    if(!name || !TAGS[name]){
      pushText(str.slice(lt,gt+1));
      i=gt+1;
      continue;
    }

    /* <noparse> 特殊处理：内部内容一律当纯文本，不再解析成标签 */
    if(name==="noparse" && !closing){
      const closeTag="</"+rawName+">";
      const closeAt=str.indexOf(closeTag,gt+1);
      const endAt = closeAt<0 ? str.length : closeAt;
      pushText(str.slice(gt+1,endAt));
      i = closeAt<0 ? str.length : closeAt+closeTag.length;
      continue;
    }

    if(whitelist && whitelist.enabled && !whitelist.set.has(name)){
      pushText(str.slice(lt,gt+1));      /* 被过滤 → 原样显示为文字 */
      i=gt+1;
      continue;
    }

    if(name==="br"||name==="page"){
      newBlock();
      i=gt+1;
      continue;
    }
    if(closing){
      for(let k=stack.length-1;k>0;k--){
        if(stack[k].tag===name && stack[k].rawName===rawName){
          stack.length=k;
          if(name==="align"){ mode.align="left"; }
          break;
        }
      }
      i=gt+1;
      continue;
    }

    const def=TAGS[name];
    if(SELF_CLOSING.has(name)){
      const node={tag:name, rawName:rawName, head:tagBody(inner,rawName), kids:[], self:true};
      if(name==="pos"){ mode.align="left"; }
      top().kids.push(node);
      i=gt+1;
      continue;
    }

    /* 块级标签同时开一条新行；<align> 在开标签处就生效，其余块级标签重置对齐 */
    if(def.block){
      if(name==="align"){
        mode.align=(av(attrs(inner.slice(rawName.length)),"align")||"left").toLowerCase();
      }else{
        mode.align="left";
      }
      newBlock();
    }
    const node={tag:name, rawName:rawName, head:tagBody(inner,rawName), kids:[]};
    top().kids.push(node);
    stack.push(node);
    i=gt+1;
  }
  return root;
}

/* =========================================================================
   4) 渲染：树 → DOM
   ========================================================================= */
function buildSpan(node, ctx){
  const span=document.createElement("span");
  if(node.tag==="#text"){ span.textContent=node.text||""; return span; }
  if(node.tag){
    const def=TAGS[node.tag];
    def.open(node.head, span, ctx);
  }
  if(node.tag==="noparse"){
    /* 内部内容原样输出，不再解析成标签 */
    (node.kids||[]).forEach(k=>{ span.appendChild(document.createTextNode(k.tag==="#text"?(k.text||""):rawOf(k))); });
  }else{
    (node.kids||[]).forEach(k=>span.appendChild(buildSpan(k, ctx)));
  }
  return span;
}
/* 把节点还原成它的原始标签文本（给 noparse 用，保证被吞掉的标签也能显示出来） */
function rawOf(node){
  const attr = node.head && node.head.trim() ? node.head : "";
  return "<"+ (node.rawName||node.tag) + attr + ">" +
         (node.kids||[]).map(k=>k.tag==="#text"?(k.text||""):rawOf(k)).join("") +
         "</"+ (node.rawName||node.tag) + ">";
}
function buildLine(node, ctx){
  const div=document.createElement("span");
  div.className="msgline";
  div.style.display="block";
  if(node.align) div.style.textAlign = node.align==="justified"?"justify":node.align;
  (node.kids||[]).forEach(k=>div.appendChild(buildSpan(k, ctx)));
  return div;
}
/* 把子节点按 #line 边界切分成若干行；每行就是一串待渲染的兄弟节点 */
function linesOf(root){
  const out=[]; let cur={kids:[], align:"left"};
  (root.kids||[]).forEach(k=>{
    if(k.tag==="#line"){
      out.push(cur);
      cur={kids:[], align:k.align||"left"};
    }else{
      cur.kids.push(k);
    }
  });
  out.push(cur);
  return out;
}
function renderTree(root, ctx){
  const frag=document.createDocumentFragment();
  linesOf(root).forEach(l=>frag.appendChild(buildLine(l, ctx)));
  return frag;
}
/* 后处理：把 <size> 从 dataset 换算成实际 font-size（基准字号 × size/100） */
function applySizes(el, base){
  el.querySelectorAll("[data-size]").forEach(s=>{
    const v=parseFloat(s.dataset.size);
    if(!isNaN(v)) s.style.fontSize=(base*v/100)+"px";
  });
  /* <indent> 在 TMP 里作用于整段的每一行，这里把缩进提升到行容器上 */
  el.querySelectorAll("[data-indent]").forEach(s=>{
    const line=s.closest ? s.closest(".msgline") : null;
    if(line) line.style.paddingLeft=s.dataset.indent;
  });
}

/* 语法高亮：把标签名/属性/闭合标出来，供实验室页面使用 */
function highlight(str, whitelist){
  const re=/<(\/?)([A-Za-z_][\w-]*)((?:"[^"]*"|'[^']*'|[^>])*?)(\/?)>/g;
  let out="", last=0, m;
  while((m=re.exec(str))){
    out+=esc(str.slice(last,m.index));
    const name=resolveName(m[2]), raw=m[2], attrsStr=m[3]||"";
    const known=!!TAGS[name];
    const filtered=known && whitelist.enabled && !whitelist.set.has(name);
    const cls = !known ? "t-bad" : (filtered ? "t-bad" : "t-name");
    let seg='<span class="'+cls+'">&lt;'+m[1]+raw+'</span>';
    seg+=attrsStr.replace(/([A-Za-z_][\w-]*)(\s*=\s*)("[^"]*"|'[^']*'|[^\s]+)?/g,
        (s,n,eq,v)=>'<span class="t-attr">'+esc(n+(eq||"")+(v||""))+'</span>');
    seg+='<span class="'+cls+'">'+(m[4]||"")+'&gt;</span>';
    out+=seg;
    last=re.lastIndex;
  }
  out+=esc(str.slice(last));
  return out;
}

return {
  TAGS, ALIAS, SELF_CLOSING,
  esc, attrs, av, len, normColor, resolveName, tagBody,
  parseTree, buildSpan, buildLine, linesOf, renderTree, applySizes, rawOf, highlight
};
});
