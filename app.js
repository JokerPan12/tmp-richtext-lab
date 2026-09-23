/* =============================================================================
   生成器页面逻辑（经典脚本，故意不用 ES module）
   原因：Chrome / Edge 在 file:// 下会以 CORS 为由拦截 ES module，
   双击打开 HTML 时 import 直接失败、整段脚本不执行。
   这里改成普通脚本 + window.RTLib / window.RTCompose 全局对象，file:// 可正常跑。

   交互模型：
     · 一条消息由多个「片段」组成，每个片段有自己的文字、颜色、字号、加粗、斜体
     · 样式区的值作用于「当前选中的片段」，所以能做出"一条消息三段不同颜色"
   ============================================================================= */
(function(){
"use strict";

var RTLib = window.RTLib, RTC = window.RTCompose;
if(!RTLib || !RTC){
  document.body.insertAdjacentHTML("afterbegin",
    '<div style="background:#ef6b6b;color:#fff;padding:12px 16px;border-radius:8px;margin:12px">'
    + '共享库没加载成功（lib.mjs / compose.mjs）。请确认这三个文件在同一目录下。</div>');
  return;
}

var parseTree = RTLib.parseTree, renderTree = RTLib.renderTree, applySizes = RTLib.applySizes;
var TEXT_OPTS = RTC.TEXT_OPTS, DECO_OPTS = RTC.DECO_OPTS, PLAIN_TAGS = RTC.PLAIN_TAGS;
var LABEL = RTC.LABEL, tagFor = RTC.tagFor;
var composeSegments = RTC.composeSegments, composeSegment = RTC.composeSegment;

var $ = function(id){ return document.getElementById(id); };

var SIZES = [["50","很小"],["70","小"],["85","略小"],["100","标准"],["125","略大"],["150","大"],["200","很大"],["300","巨大"]];

/* =========================================================================
   颜色工具：内部用 HSV，输出 HEX。
   用 HSV 而不是 RGB，是因为滑块能直接对上"色相 / 饱和度 / 明度"这三个直觉维度。
   ========================================================================= */
function hsvToRgb(h, s, v){
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  v = Math.max(0, Math.min(100, v)) / 100;
  var c = v * s;
  var x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  var m = v - c;
  var r = 0, g = 0, b = 0;
  if(h < 60){ r = c; g = x; }
  else if(h < 120){ r = x; g = c; }
  else if(h < 180){ g = c; b = x; }
  else if(h < 240){ g = x; b = c; }
  else if(h < 300){ r = x; b = c; }
  else { r = c; b = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
function rgbToHex(r, g, b){
  var pad = function(n){ var t = Math.max(0, Math.min(255, Math.round(n))).toString(16); return t.length < 2 ? "0" + t : t; };
  return "#" + pad(r) + pad(g) + pad(b);
}
function hsvToHex(h, s, v){
  var c = hsvToRgb(h, s, v);
  return rgbToHex(c[0], c[1], c[2]);
}
/* HEX → HSV。刻意不取整：色相四舍五入到整度会丢精度
   （#e0b45e 的色相是 40.5°，取整成 40 再转回去就变成 #e0b55e）。 */
function round1(n){ return Math.round(n * 10) / 10; }
function fmt1(n){ return (Math.round(n * 10) / 10).toString(); }
function hexToHsv(hex){
  var m = /^#?([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/.exec(String(hex));
  if(!m) return null;
  var r = parseInt(m[1].slice(0, 2), 16) / 255;
  var g = parseInt(m[1].slice(2, 4), 16) / 255;
  var b = parseInt(m[1].slice(4, 6), 16) / 255;
  var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  var hh = 0;
  if(d !== 0){
    if(mx === r) hh = 60 * (((g - b) / d) % 6);
    else if(mx === g) hh = 60 * ((b - r) / d + 2);
    else hh = 60 * ((r - g) / d + 4);
  }
  if(hh < 0) hh += 360;
  return { h: round1(hh), s: round1(mx === 0 ? 0 : (d / mx) * 100), v: round1(mx * 100) };
}

/* =========================================================================
   状态
   ========================================================================= */
var DEFAULTS = { color:"#ffffff", size:"16" };   /* 字体颜色默认白、字号默认 16 */

var state = {
  font:"SimHei", fw:"800", alpha:"#80", space:"3em",
  color:DEFAULTS.color, size:Number(DEFAULTS.size),   /* 作用于当前选中片段 */
  cspace:0.5, lineh:150, rotate:15, voffset:0.5, indent:15, width:60,
  sprite:"smile", link:"item_1001",
  globals:{}                                          /* 作用于整条消息的样式 */
};
var segments = [];
var activeId = null;
var segSeq = 0;

function newSegment(text, opt){
  opt = opt || {};
  return {
    id:"s" + (++segSeq),
    text:text || "",
    on: opt.on || {},
    color: opt.color || null,
    size: opt.size || null
  };
}
function activeSegment(){
  for(var i = 0; i < segments.length; i++){ if(segments[i].id === activeId) return segments[i]; }
  return null;
}
var segState = activeSegment;

/* =========================================================================
   生成
   ========================================================================= */
function baseState(){ return Object.assign({}, state, state.globals); }
function generate(){ return composeSegments(segments, baseState()); }

/* =========================================================================
   预览
   ========================================================================= */
function escapeHtml(s){
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
function renderPreview(code){
  var pane = $("preview"), rawEl = $("rawout");

  var re = /<(\/?)([A-Za-z_][\w-]*)((?:"[^"]*"|'[^']*'|[^>])*?)(\/?)>/g;
  var out = "", last = 0, m;
  while((m = re.exec(code))){
    out += escapeHtml(code.slice(last, m.index));
    out += '<span class="t-name">' + escapeHtml(m[0]) + "</span>";
    last = re.lastIndex;
  }
  out += escapeHtml(code.slice(last));
  rawEl.innerHTML = out || '<span style="color:#4d5468">（还没有输入文字）</span>';

  pane.innerHTML = "";
  if(!code){ pane.textContent = "（还没有输入文字）"; pane.style.color = "#5c6273"; return; }
  pane.style.color = "";
  var base = 16;
  pane.style.fontSize = base + "px";
  pane.appendChild(renderTree(parseTree(code, { enabled:false }), { base: base }));
  applySizes(pane, base);
  pane.querySelectorAll("[data-indent]").forEach(function(s){
    var line = s.closest ? s.closest(".msgline") : null;
    if(line) line.style.paddingLeft = s.dataset.indent;
  });
}

/* =========================================================================
   片段列表
   ========================================================================= */
function styleSummary(seg){
  var bits = [];
  if(seg.on.size) bits.push("字号 " + (seg.size || DEFAULTS.size));
  if(seg.on.color) bits.push(seg.color || DEFAULTS.color);
  if(seg.on.b) bits.push("加粗");
  if(seg.on.i) bits.push("斜体");
  return bits.join(" · ") || "无样式";
}
function buildSegments(){
  var box = $("segments");
  box.innerHTML = "";
  if(!segments.length){
    box.innerHTML = '<div class="segempty">还没有片段 —— 点下面的「＋ 添加片段」，或在「快捷组合」里点「图中示例」</div>';
    return;
  }
  segments.forEach(function(seg, i){
    var card = document.createElement("div");
    card.className = "segcard" + (seg.id === activeId ? " active" : "");
    card.dataset.id = seg.id;

    var head = document.createElement("div");
    head.className = "seghead";
    var no = document.createElement("span");
    no.className = "segno"; no.textContent = "#" + (i + 1);
    var pick = document.createElement("button");
    pick.className = "segpick" + (seg.id === activeId ? " on" : "");
    pick.textContent = (seg.id === activeId) ? "✓ 正在编辑" : "选用";
    pick.title = "选中这个片段，再用上面的样式区改它的颜色/字号";
    var sum = document.createElement("span");
    sum.className = "segsum"; sum.textContent = styleSummary(seg);
    var up = document.createElement("button");
    up.className = "segbtn"; up.textContent = "↑"; up.title = "上移";
    up.disabled = (i === 0);
    var dn = document.createElement("button");
    dn.className = "segbtn"; dn.textContent = "↓"; dn.title = "下移";
    dn.disabled = (i === segments.length - 1);
    var del = document.createElement("button");
    del.className = "segbtn del"; del.textContent = "×"; del.title = "删除片段";

    head.appendChild(no); head.appendChild(pick); head.appendChild(sum);
    head.appendChild(up); head.appendChild(dn); head.appendChild(del);

    var ta = document.createElement("textarea");
    ta.className = "segtext";
    ta.rows = 1;
    ta.placeholder = (i === 0) ? "例如：好友给你赠送了" : "这一段的文字";
    ta.value = seg.text;
    ta.spellcheck = false;

    var tools = document.createElement("div");
    tools.className = "segtools";
    [["color","颜色"],["size","字号"],["b","加粗"],["i","斜体"]].forEach(function(pair){
      var k = pair[0], name = pair[1];
      var b = document.createElement("button");
      b.className = "segtool" + (seg.on[k] ? " on" : "");
      b.textContent = name;
      b.title = "给这个片段" + (seg.on[k] ? "取消" : "启用") + name;
      b.onclick = function(e){
        e.stopPropagation();
        if(seg.on[k]) delete seg.on[k]; else seg.on[k] = true;
        activeId = seg.id;
        buildSegments(); sync(); update();
      };
      tools.appendChild(b);
      if(k === "color"){
        var sw = document.createElement("button");
        sw.className = "segswatch";
        sw.style.background = seg.color || DEFAULTS.color;
        sw.title = "单独给这个片段选颜色";
        sw.onclick = function(e){
          e.stopPropagation();
          activeId = seg.id;
          seg.on.color = true;
          buildSegments();
          openPicker(seg.color || DEFAULTS.color);
        };
        tools.appendChild(sw);
      }
      if(k === "size"){
        var si = document.createElement("input");
        si.type = "number"; si.className = "segsize";
        si.min = 1; si.max = 999; si.step = 1;
        si.value = seg.size || DEFAULTS.size;
        si.title = "单独给这个片段设字号";
        si.onclick = function(e){ e.stopPropagation(); };
        si.onchange = function(){
          var v = Math.max(1, Math.min(999, Number(si.value) || Number(DEFAULTS.size)));
          si.value = v;
          seg.size = String(v);
          seg.on.size = true;
          activeId = seg.id;
          buildSegments(); sync(); update();
        };
        tools.appendChild(si);
      }
    });

    card.onclick = function(){ if(activeId !== seg.id){ activeId = seg.id; buildSegments(); sync(); update(); } };
    pick.onclick = function(e){ e.stopPropagation(); activeId = seg.id; buildSegments(); sync(); update(); };
    up.onclick = function(e){ e.stopPropagation(); moveSeg(i, -1); };
    dn.onclick = function(e){ e.stopPropagation(); moveSeg(i, 1); };
    del.onclick = function(e){ e.stopPropagation(); deleteSeg(seg.id); };
    ta.oninput = function(){ seg.text = ta.value; sync(); update(); };
    ta.onfocus = function(){ if(activeId !== seg.id){ activeId = seg.id; buildSegments(); sync(); } };

    card.appendChild(head); card.appendChild(ta); card.appendChild(tools);
    box.appendChild(card);
  });
}
function moveSeg(i, dir){
  var j = i + dir;
  if(j < 0 || j >= segments.length) return;
  var t = segments[i]; segments[i] = segments[j]; segments[j] = t;
  buildSegments(); sync(); update();
}
function deleteSeg(id){
  segments = segments.filter(function(s){ return s.id !== id; });
  if(activeId === id) activeId = segments.length ? segments[0].id : null;
  buildSegments(); sync(); update();
}
function addSeg(text, opt){
  var seg = newSegment(text, opt);
  segments.push(seg);
  activeId = seg.id;
  buildSegments(); sync(); update();
  return seg;
}

/* =========================================================================
   颜色选择弹窗
   ========================================================================= */
var picker = { target:null, h:0, s:0, v:100 };
function openPicker(hex){
  var seg = segState();
  picker.target = seg ? seg.id : null;
  var hsv = hexToHsv(hex) || { h:0, s:0, v:100 };
  picker.h = hsv.h; picker.s = hsv.s; picker.v = hsv.v;
  $("hueRange").value = hsv.h; $("hueNum").value = fmt1(hsv.h);
  $("satRange").value = hsv.s; $("satNum").value = fmt1(hsv.s);
  $("briRange").value = hsv.v; $("briNum").value = fmt1(hsv.v);
  paintPicker();
  var dlg = $("colorModal");
  if(dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "open");
}
function closePicker(){
  var d = $("colorModal");
  if(d.close) d.close(); else d.removeAttribute("open");
}
function paintPicker(){
  var hex = hsvToHex(picker.h, picker.s, picker.v);
  $("previewBig").style.background = hex;
  $("previewBigHex").textContent = hex;
  $("mHex").value = hex;
  $("satRange").style.background =
    "linear-gradient(90deg," + hsvToHex(picker.h, 0, picker.v) + "," + hsvToHex(picker.h, 100, picker.v) + ")";
  $("briRange").style.background =
    "linear-gradient(90deg,#000," + hsvToHex(picker.h, picker.s, 100) + ")";
  $("hueRange").style.background =
    "linear-gradient(90deg,#f00 0%,#ff0 17%,#0f0 33%,#0ff 50%,#00f 67%,#f0f 83%,#f00 100%)";
}
/* 滑块变化：实时应用到目标片段 */
function pickerChanged(){
  paintPicker();
  var hex = hsvToHex(picker.h, picker.s, picker.v);
  var seg = null;
  for(var i = 0; i < segments.length; i++){ if(segments[i].id === picker.target) seg = segments[i]; }
  if(seg){ seg.color = hex; seg.on.color = true; } else { state.color = hex; }
  $("colorprev").style.background = hex;
  $("colorprevhex").textContent = hex;
  $("hexin").value = hex;
  buildSegments(); sync(); update();
}

/* =========================================================================
   样式区
   ========================================================================= */
function buildOptions(){
  TEXT_OPTS.forEach(function(o){
    var b = document.createElement("button");
    b.className = "opt"; b.textContent = o.label; b.dataset.k = o.k;
    b.onclick = function(){ toggleSegStyle(o.k); };
    $("grp-text").appendChild(b);
  });
  DECO_OPTS.forEach(function(o){
    var b = document.createElement("button");
    b.className = "opt"; b.textContent = o.label; b.dataset.k = o.k;
    b.onclick = function(){ toggleGlobal(o.k); };
    $("grp-deco").appendChild(b);
  });
  SIZES.forEach(function(pair){
    var v = pair[0], label = pair[1];
    var b = document.createElement("button");
    b.className = "opt"; b.textContent = label + " " + v; b.dataset.size = v;
    b.onclick = function(){
      var seg = segState();
      if(seg){
        if(seg.on.size && String(seg.size || DEFAULTS.size) === v) delete seg.on.size;
        else { seg.size = v; seg.on.size = true; }
      } else { state.size = Number(v); }
      $("sizeRange").value = v; $("sizeNum").value = v;
      buildSegments(); sync(); update();
    };
    $("grp-size").appendChild(b);
  });
  $("colorprev").onclick = function(){
    var seg = segState();
    openPicker(seg ? (seg.color || DEFAULTS.color) : state.color);
  };
  $("colorpick").oninput = function(e){ applyHexColor(e.target.value); };
  bindColorSlider("hueRange"); bindColorSlider("satRange"); bindColorSlider("briRange");

  [["金色加粗", ["color","size","b"]],
   ["只有颜色", ["color"]],
   ["大字警告", ["size","color","b"]],
   ["小字注释", ["size","color"]],
   ["图中示例", "__demo__"],
   ["全部清空", "__clear__"]].forEach(function(pair){
    var label = pair[0], keys = pair[1];
    var b = document.createElement("button");
    b.className = "btn tiny"; b.textContent = label;
    b.onclick = function(){
      if(keys === "__clear__"){ segments = []; activeId = null; buildSegments(); sync(); update(); return; }
      if(keys === "__demo__"){
        segments = [
          newSegment("好友给你赠送了",   { on:{ size:true, color:true },         color:"#ffffff", size:"16" }),
          newSegment("【千机神杯×100】", { on:{ size:true, color:true, b:true }, color:"#ff2f2f", size:"16" }),
          newSegment("【点击领取】",     { on:{ size:true, color:true },         color:"#7ec3ff", size:"16" })
        ];
        activeId = segments[1].id;
        buildSegments(); sync(); update();
        toast("已填入图中示例：白 + 红 + 青三段");
        return;
      }
      var seg = segState() || segments[0] || addSeg("");
      seg.on = {};
      keys.forEach(function(k){
        seg.on[k] = true;
        if(k === "color") seg.color = (label === "小字注释") ? "#9aa2b8" : "#e0b45e";
        if(k === "size") seg.size = (label === "小字注释") ? "70" : (label === "大字警告" ? "200" : "16");
      });
      if(keys.indexOf("color") >= 0) state.color = seg.color;
      if(keys.indexOf("size") >= 0){
        state.size = Number(seg.size);
        $("sizeRange").value = Math.min(300, state.size); $("sizeNum").value = state.size;
      }
      activeId = seg.id;
      buildSegments(); sync(); update();
    };
    $("presets").appendChild(b);
  });
}
function toggleSegStyle(k){
  var seg = segState();
  if(!seg){ toast("先添加或选中一个片段", true); return; }
  if(seg.on[k]) delete seg.on[k]; else seg.on[k] = true;
  if(k === "color" && seg.on.color){ state.color = seg.color || DEFAULTS.color; }
  if(k === "size" && seg.on.size){ state.size = Number(seg.size || DEFAULTS.size); }
  buildSegments(); sync(); update();
}
function toggleGlobal(k){
  if(state.globals[k]) delete state.globals[k]; else state.globals[k] = true;
  sync(); update();
}

/* =========================================================================
   颜色：预览块 / HEX / 滑块
   ========================================================================= */
function bindColorSlider(rangeId){
  var numId = rangeId.replace("Range", "Num");
  var read = function(){
    picker.h = Number($("hueRange").value);
    picker.s = Number($("satRange").value);
    picker.v = Number($("briRange").value);
  };
  $(rangeId).oninput = function(){ read(); pickerChanged(); };
  $(numId).oninput = function(){
    var v = Number($(numId).value);
    if(isNaN(v)) return;
    var hi = (rangeId === "hueRange") ? 360 : 100;
    $(rangeId).value = Math.max(0, Math.min(hi, v));
    read(); pickerChanged();
  };
}
function applyHexColor(hex){
  var hsv = hexToHsv(hex);
  if(!hsv) return false;
  picker.h = hsv.h; picker.s = hsv.s; picker.v = hsv.v;
  $("hueRange").value = hsv.h; $("hueNum").value = fmt1(hsv.h);
  $("satRange").value = hsv.s; $("satNum").value = fmt1(hsv.s);
  $("briRange").value = hsv.v; $("briNum").value = fmt1(hsv.v);
  var norm = hsvToHex(hsv.h, hsv.s, hsv.v);
  var seg = segState();
  if(seg){ seg.color = norm; seg.on.color = true; } else { state.color = norm; }
  paintPicker(); buildSegments(); sync(); update();
  return true;
}

/* =========================================================================
   同步界面
   ========================================================================= */
function sync(){
  var seg = segState(), glob = state.globals;

  Array.prototype.forEach.call(document.querySelectorAll(".opt[data-k]"), function(b){
    var k = b.dataset.k;
    var isText = TEXT_OPTS.some(function(o){ return o.k === k; });
    b.classList.toggle("on", isText ? (seg ? !!seg.on[k] : false) : !!glob[k]);
  });

  var curSize = seg ? String(seg.size || DEFAULTS.size) : String(state.size);
  var sizeOn = seg ? !!seg.on.size : true;
  Array.prototype.forEach.call(document.querySelectorAll("#grp-size .opt"), function(b){
    b.classList.toggle("on", sizeOn && curSize === b.dataset.size);
  });

  [["chipCspace","cspace"],["chipLineh","lineh"],
   ["chipRotate","rotate"],["chipVoffset","voffset"],["chipIndent","indent"],["chipWidth","width"],
   ["chipSprite","sprite"],["chipLink","link"]].forEach(function(pair){
    $(pair[0]).classList.toggle("on", !!glob[pair[1]]);
  });

  /* 颜色预览块：跟着当前片段 */
  var shown = seg ? (seg.color || DEFAULTS.color) : state.color;
  $("colorprev").style.background = shown;
  $("colorprevhex").textContent = shown;
  if(document.activeElement !== $("hexin")) $("hexin").value = shown;
  $("sizeRange").value = Math.min(300, Number(curSize) || 16);
  $("sizeNum").value = curSize;
  $("hueRange").value = picker.h; $("satRange").value = picker.s; $("briRange").value = picker.v;
  $("hueNum").value = fmt1(picker.h); $("satNum").value = fmt1(picker.s); $("briNum").value = fmt1(picker.v);
  paintPicker();

  /* 已选样式清单 */
  var picked = $("picked");
  picked.innerHTML = "";
  var items = [];
  if(seg){
    if(seg.on.size) items.push(["字号", "<size=" + (seg.size || DEFAULTS.size) + ">"]);
    if(seg.on.color) items.push(["颜色", "<color=" + (seg.color || DEFAULTS.color) + ">"]);
    if(seg.on.b) items.push(["加粗", "<b>"]);
    if(seg.on.i) items.push(["斜体", "<i>"]);
  }
  Object.keys(glob).forEach(function(k){
    if(glob[k]) items.push([LABEL[k] || k, tagFor(k, baseState())]);
  });
  if(!items.length){
    picked.innerHTML = '<span style="color:#4d5468">当前片段没有任何样式 —— 点上面的按钮加</span>';
  }else{
    items.forEach(function(it){
      var el = document.createElement("span");
      el.className = "tagchip";
      var nm = document.createElement("span"); nm.textContent = it[0];
      var cd = document.createElement("code"); cd.textContent = it[1];
      el.appendChild(nm); el.appendChild(cd);
      picked.appendChild(el);
    });
  }

  var plain = segments.map(function(s){ return s.text.replace(/\n/g, ""); }).join("");
  var cEl = $("counter");
  cEl.textContent = plain.length + " 字 · 整段代码 " + generate().length + " 字符";
  cEl.className = "counter" + (plain.length > 120 ? " over" : plain.length > 60 ? " warn" : "");
}

function update(){
  var code = generate();
  $("code").value = code;
  var plain = segments.map(function(s){ return s.text.replace(/\n/g, ""); }).join("");
  $("taglen").textContent = code ? ("共 " + code.length + " 字符，其中标签占 " + (code.length - plain.length) + " 个") : "";
  renderPreview(code);
}

/* =========================================================================
   事件
   ========================================================================= */
$("btn-addseg").onclick = function(){
  addSeg("");
  var t = document.querySelector(".segcard.active .segtext");
  if(t) t.focus();
};
$("btn-clear").onclick = function(){ segments = []; activeId = null; buildSegments(); sync(); update(); };
$("btn-gen").onclick = function(){ update(); toast("代码已生成"); };
$("btn-copy").onclick = function(){
  var code = generate();
  if(!code) return toast("还没有代码可复制", true);
  copyText(code, "已复制到剪贴板");
};

$("hexin").onchange = function(e){
  var v = e.target.value.trim();
  if(/^#?[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(v)){
    $("hexin").classList.remove("bad");
    applyHexColor((v.charAt(0) === "#") ? v : ("#" + v));
  }else{
    toast("颜色要写成 #RRGGBB 或 #RRGGBBAA", true);
    $("hexin").classList.add("bad");
    setTimeout(function(){ $("hexin").classList.remove("bad"); }, 1200);
    var seg = segState();
    $("hexin").value = seg ? (seg.color || DEFAULTS.color) : state.color;
  }
};
$("mHex").onchange = function(e){
  var v = e.target.value.trim();
  if(/^#?[0-9a-fA-F]{6}$/.test(v)){
    var hsv = hexToHsv(v);
    picker.h = hsv.h; picker.s = hsv.s; picker.v = hsv.v;
    $("hueRange").value = hsv.h; $("satRange").value = hsv.s; $("briRange").value = hsv.v;
    pickerChanged();
  }else{
    toast("颜色要写成 #RRGGBB", true);
    paintPicker();
  }
};
$("mClose").onclick = function(){ closePicker(); };
$("mDone").onclick = function(){ closePicker(); toast("颜色已应用"); };
$("colorModal").addEventListener("click", function(e){ if(e.target === $("colorModal")) closePicker(); });

$("sizeRange").oninput = function(e){
  var v = Number(e.target.value);
  state.size = v;
  var seg = segState();
  if(seg){ seg.size = String(v); seg.on.size = true; }
  $("sizeNum").value = v;
  buildSegments(); sync(); update();
};
$("sizeNum").onchange = function(e){
  var v = Math.max(1, Math.min(999, Number(e.target.value) || 16));
  state.size = v; e.target.value = v; $("sizeRange").value = Math.min(300, v);
  var seg = segState();
  if(seg){ seg.size = String(v); seg.on.size = true; }
  buildSegments(); sync(); update();
};

function bindGlobalSlider(rangeId, valId, key, fmt, apply){
  $(rangeId).oninput = function(e){
    var v = Number(e.target.value);
    apply(v);
    $(valId).textContent = fmt(v);
    state.globals[key] = true;
    sync(); update();
  };
}
bindGlobalSlider("cspaceRange","cspaceVal","cspace", function(v){ return v.toFixed(2) + "em"; }, function(v){ state.cspace = v; });
bindGlobalSlider("linehRange","linehVal","lineh", function(v){ return v + "%"; }, function(v){ state.lineh = v; });
bindGlobalSlider("rotateRange","rotateVal","rotate", function(v){ return v + "°"; }, function(v){ state.rotate = v; });
bindGlobalSlider("voffsetRange","voffsetVal","voffset", function(v){ return v.toFixed(1) + "em"; }, function(v){ state.voffset = v; });
bindGlobalSlider("indentRange","indentVal","indent", function(v){ return v + "%"; }, function(v){ state.indent = v; });
bindGlobalSlider("widthRange","widthVal","width", function(v){ return v + "%"; }, function(v){ state.width = v; });

$("chipCspace").onclick = function(){ toggleGlobal("cspace"); };
$("chipLineh").onclick = function(){ toggleGlobal("lineh"); };
$("chipRotate").onclick = function(){ toggleGlobal("rotate"); };
$("chipVoffset").onclick = function(){ toggleGlobal("voffset"); };
$("chipIndent").onclick = function(){ toggleGlobal("indent"); };
$("chipWidth").onclick = function(){ toggleGlobal("width"); };
$("chipSprite").onclick = function(){ toggleGlobal("sprite"); };
$("chipLink").onclick = function(){ toggleGlobal("link"); };
$("spriteName").onchange = function(e){ state.sprite = e.target.value.trim() || "smile"; sync(); update(); };
$("linkId").onchange = function(e){ state.link = e.target.value.trim() || "item_1001"; sync(); update(); };

function copyText(text, okMsg){
  var done = function(ok){ toast(ok ? okMsg : "复制失败，请手动选中复制", !ok); };
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(function(){ done(true); }, function(){ legacyCopy(text, done); });
  }else{
    legacyCopy(text, done);
  }
}
function legacyCopy(text, done){
  var el = $("code");
  var prev = el.value, wasReadonly = el.hasAttribute("readonly");
  el.removeAttribute("readonly");
  el.value = text;
  el.select();
  var ok = false;
  try{ ok = document.execCommand("copy"); }catch(e){ ok = false; }
  el.value = prev;
  if(wasReadonly) el.setAttribute("readonly", "readonly");
  done(ok);
}
var toastTimer = 0;
function toast(msg, isErr){
  var t = $("toast");
  t.textContent = msg;
  t.className = "toast show" + (isErr ? " err" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){ t.className = "toast" + (isErr ? " err" : ""); }, 1700);
}

/* =========================================================================
   启动
   ========================================================================= */
buildOptions();
addSeg("");                                   /* 打开就有一个空片段，直接可打字 */
var initHsv = hexToHsv(DEFAULTS.color);
picker.h = initHsv.h; picker.s = initHsv.s; picker.v = initHsv.v;
sync(); update();

/* 给自检脚本用 */
window.__composer = {
  state: state,
  segments: segments,
  DEFAULTS: DEFAULTS,
  generate: generate,
  composeSegments: composeSegments,
  composeSegment: composeSegment,
  segmentState: RTC.segmentState,
  PLAIN_TAGS: PLAIN_TAGS,
  color: { hsvToHex: hsvToHex, hexToHsv: hexToHsv, hsvToRgb: hsvToRgb, rgbToHex: rgbToHex }
};
})();
