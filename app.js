/* =============================================================================
   生成器页面逻辑（经典脚本，故意不用 ES module）
   原因：Chrome / Edge 在 file:// 下会以 CORS 为由拦截 ES module，
   双击打开 HTML 时 import 直接失败、整段脚本不执行。
   这里改成普通脚本 + window.RTLib / window.RTCompose 全局对象，file:// 可正常跑。
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
var LABEL = RTC.LABEL, GROUPS = RTC.GROUPS, tagFor = RTC.tagFor, compose = RTC.compose;

var $ = function(id){ return document.getElementById(id); };

/* =========================================================================
   颜色：内部用 HSV 保存，输出 HEX。
   用 HSV 而不是 RGB，是因为滑块能直接对上"色相 / 饱和度 / 明度"三个直觉维度。
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
   （#e0b45e 的色相是 40.5°，取整成 40 再转回去就变成 #e0b55e），
   所以统一保留 1 位小数，保证 HEX→HSV→HEX 往返一致。 */
function round1(n){ return Math.round(n * 10) / 10; }
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
  return {
    h: round1(hh),
    s: round1(mx === 0 ? 0 : (d / mx) * 100),
    v: round1(mx * 100)
  };
}
var SIZES = [["50","很小"],["70","小"],["85","略小"],["100","标准"],["125","略大"],["150","大"],["200","很大"],["300","巨大"]];

var state = {
  order: [], on: {},
  font:"SimHei", fw:"800", alpha:"#80", space:"3em",
  color:"#e0b45e", size:100,
  hue:41, sat:65, bri:88,           /* 颜色滑块的内部状态 */
  cspace:0.5, lineh:150, rotate:15, voffset:0.5, indent:15, width:60,
  sprite:"smile", link:"item_1001"
};

/* ================= 生成 ================= */
function generate(){ return compose($("text").value, state.order, state.on, state); }

/* ================= 预览 ================= */
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

/* ================= 状态操作 ================= */
function add(k){
  if(state.on[k]) return remove(k);
  var g = GROUPS[k];
  if(g) state.order.filter(function(x){ return GROUPS[x] === g; }).forEach(remove);
  state.on[k] = true;
  state.order.push(k);
  sync(); update();
}
function remove(k){
  if(!state.on[k]) return;
  state.on[k] = false;
  state.order = state.order.filter(function(x){ return x !== k; });
  sync(); update();
}
function move(k, dir){
  var i = state.order.indexOf(k), j = i + dir;
  if(i < 0 || j < 0 || j >= state.order.length) return;
  var t = state.order[i]; state.order[i] = state.order[j]; state.order[j] = t;
  sync(); update();
}
function setOnly(keys){
  state.order = []; state.on = {};
  keys.forEach(function(k){ state.on[k] = true; state.order.push(k); });
  sync(); update();
}

/* ================= 构建控件 ================= */
function buildOptions(){
  TEXT_OPTS.forEach(function(o){
    var b = document.createElement("button");
    b.className = "opt"; b.textContent = o.label; b.dataset.k = o.k;
    b.onclick = function(){ add(o.k); };
    $("grp-text").appendChild(b);
  });
  DECO_OPTS.forEach(function(o){
    var b = document.createElement("button");
    b.className = "opt"; b.textContent = o.label; b.dataset.k = o.k;
    b.onclick = function(){ add(o.k); };
    $("grp-deco").appendChild(b);
  });
  SIZES.forEach(function(pair){
    var v = pair[0], label = pair[1];
    var b = document.createElement("button");
    b.className = "opt"; b.textContent = label + " " + v; b.dataset.size = v;
    b.onclick = function(){
      if(state.on.size && String(state.size) === v) return remove("size");
      state.size = Number(v);
      $("sizeRange").value = v; $("sizeNum").value = v;
      if(!state.on.size){ state.on.size = true; state.order.push("size"); }
      sync(); update();
    };
    $("grp-size").appendChild(b);
  });
  /* 颜色滑块：轨道背景随当前颜色实时变化，所见即所得 */
  ["hueRange", "satRange", "briRange"].forEach(function(id){ bindColorSlider(id); });
  $("colorprev").onclick = function(){ copyText(state.color, "色值 " + state.color + " 已复制"); };
  [["金色加粗", ["color","size","b"]],
   ["只有颜色", ["color"]],
   ["大字警告", ["size","color","b"]],
   ["小字注释", ["size","color"]],
   ["全部清空", []]].forEach(function(pair){
    var label = pair[0], keys = pair[1];
    var b = document.createElement("button");
    b.className = "btn tiny"; b.textContent = label;
    b.onclick = function(){
      if(keys.length === 0) return setOnly([]);
      if(keys.indexOf("size") >= 0){
        state.size = (label === "小字注释") ? 70 : (label === "大字警告" ? 200 : 100);
        $("sizeRange").value = Math.min(300, state.size); $("sizeNum").value = state.size;
      }
      if(keys.indexOf("color") >= 0){
        applyHexColor((label === "小字注释") ? "#9aa2b8" : "#e0b45e");
      }
      setOnly(keys);
    };
    $("presets").appendChild(b);
  });
}

/* ================= 颜色滑块 ================= */
/* 把某条滑块和它的数字框绑在一起 */
function bindColorSlider(rangeId){
  var numId = rangeId.replace("Range", "Num");
  var handler = function(e){
    var v = Number(e.target.value);
    if(rangeId === "hueRange") state.hue = v;
    else if(rangeId === "satRange") state.sat = v;
    else state.bri = v;
    if(!state.on.color){ state.on.color = true; state.order.push("color"); }
    sync(); update();
  };
  $(rangeId).oninput = handler;
  $(numId).oninput = function(e){
    var v = Number(e.target.value);
    if(isNaN(v)) return;
    var lo = (rangeId === "hueRange") ? 0 : 0;
    var hi = (rangeId === "hueRange") ? 360 : 100;
    $(rangeId).value = Math.max(lo, Math.min(hi, v));
    handler({ target: { value: $(rangeId).value } });
  };
}

/* 由当前 HSV 算出 HEX，并刷新所有颜色相关 UI */
function fmt1(n){ return (Math.round(n * 10) / 10).toString(); }
function syncColorUI(){
  state.color = hsvToHex(state.hue, state.sat, state.bri);
  var hex = state.color;

  $("colorprev").style.background = hex;
  $("colorprevhex").textContent = hex;
  if(document.activeElement !== $("hexin")) $("hexin").value = hex;
  $("colorpick").value = hex;
  if(document.activeElement !== $("hueNum")) $("hueNum").value = fmt1(state.hue);
  if(document.activeElement !== $("satNum")) $("satNum").value = fmt1(state.sat);
  if(document.activeElement !== $("briNum")) $("briNum").value = fmt1(state.bri);

  /* 滑块轨道背景跟着当前颜色走 */
  $("satRange").style.background =
    "linear-gradient(90deg," + hsvToHex(state.hue, 0, state.bri) + "," + hsvToHex(state.hue, 100, state.bri) + ")";
  $("briRange").style.background =
    "linear-gradient(90deg,#000," + hsvToHex(state.hue, state.sat, 100) + ")";
  $("hueRange").style.background =
    "linear-gradient(90deg,#f00 0%,#ff0 17%,#0f0 33%,#0ff 50%,#00f 67%,#f0f 83%,#f00 100%)";
}

/* 外部（HEX 输入框 / 系统取色器 / 快捷组合）改了颜色时，反解成 HSV 回填滑块 */
function applyHexColor(hex){
  var hsv = hexToHsv(hex);
  if(!hsv) return false;
  state.hue = hsv.h; state.sat = hsv.s; state.bri = hsv.v;
  $("hueRange").value = hsv.h; $("hueNum").value = fmt1(hsv.h);
  $("satRange").value = hsv.s; $("satNum").value = fmt1(hsv.s);
  $("briRange").value = hsv.v; $("briNum").value = fmt1(hsv.v);
  if(!state.on.color){ state.on.color = true; state.order.push("color"); }
  sync(); update();
  return true;
}

/* ================= 同步界面 ================= */
function sync(){
  Array.prototype.forEach.call(document.querySelectorAll(".opt[data-k]"), function(b){
    b.classList.toggle("on", !!state.on[b.dataset.k]);
  });
  Array.prototype.forEach.call(document.querySelectorAll("#grp-size .opt"), function(b){
    b.classList.toggle("on", !!state.on.size && String(state.size) === b.dataset.size);
  });
  /* 颜色：刷新预览块、HEX、数字框与三条滑块的轨道 */
  syncColorUI();
  [["chipCspace","cspace"],["chipLineh","lineh"],
   ["chipRotate","rotate"],["chipVoffset","voffset"],["chipIndent","indent"],["chipWidth","width"],
   ["chipSprite","sprite"],["chipLink","link"]].forEach(function(pair){
    $(pair[0]).classList.toggle("on", !!state.on[pair[1]]);
  });

  var picked = $("picked");
  picked.innerHTML = "";
  var active = state.order.filter(function(k){ return state.on[k]; });
  active.forEach(function(k, i){
    var el = document.createElement("span");
    el.className = "tagchip";
    var name = document.createElement("span");
    name.textContent = LABEL[k] || k;
    var cd = document.createElement("code");
    cd.textContent = tagFor(k, state);
    var up = document.createElement("button");
    up.className = "mv"; up.textContent = "◀"; up.title = "往外移（更外层）";
    up.disabled = (i === 0); up.onclick = function(){ move(k, -1); };
    var dn = document.createElement("button");
    dn.className = "mv"; dn.textContent = "▶"; dn.title = "往里移（更内层）";
    dn.disabled = (i === active.length - 1); dn.onclick = function(){ move(k, 1); };
    var x = document.createElement("button");
    x.className = "x"; x.textContent = "×"; x.title = "移除";
    x.onclick = function(){ remove(k); };
    el.appendChild(name); el.appendChild(cd); el.appendChild(up); el.appendChild(dn); el.appendChild(x);
    picked.appendChild(el);
  });

  var plain = $("text").value.replace(/\n/g, "");
  var cEl = $("counter");
  cEl.textContent = plain.length + " 字 · 整段代码 " + generate().length + " 字符";
  cEl.className = "counter" + (plain.length > 120 ? " over" : plain.length > 60 ? " warn" : "");
}

function update(){
  var code = generate();
  $("code").value = code;
  var plain = $("text").value.replace(/\n/g, "");
  $("taglen").textContent = code ? ("共 " + code.length + " 字符，其中标签占 " + (code.length - plain.length) + " 个") : "";
  renderPreview(code);
}

/* ================= 事件 ================= */
$("text").addEventListener("input", function(){ sync(); update(); });
$("btn-br").onclick = function(){ insertAtCursor("\n"); sync(); update(); };
$("btn-clear").onclick = function(){ $("text").value = ""; sync(); update(); $("text").focus(); };
$("btn-gen").onclick = function(){ update(); toast("代码已生成"); };

/* 系统取色器：改了颜色就反解回 HSV，让三条滑块跟着动 */
$("colorpick").oninput = function(e){ applyHexColor(e.target.value); };
/* HEX 手填：6 位（可带 8 位透明度，透明部分不参与滑块） */
$("hexin").onchange = function(e){
  var v = e.target.value.trim();
  if(/^#?[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(v)){
    var full = (v.charAt(0) === "#") ? v : ("#" + v);
    $("hexin").classList.remove("bad");
    applyHexColor(full);                 /* 内部会同步滑块并把 state.color 规范成 6 位 */
    if(full.length === 9){               /* 带透明度：state.color 补上末两位 */
      state.color = full;
      syncColorUI();
      update();
    }
  }else{
    toast("颜色要写成 #RRGGBB 或 #RRGGBBAA", true);
    $("hexin").classList.add("bad");
    setTimeout(function(){ $("hexin").classList.remove("bad"); }, 1200);
    $("hexin").value = state.on.color ? state.color : "";
  }
};
$("sizeRange").oninput = function(e){
  state.size = Number(e.target.value); $("sizeNum").value = e.target.value;
  if(!state.on.size){ state.on.size = true; state.order.push("size"); }
  sync(); update();
};
$("sizeNum").onchange = function(e){
  var v = Math.max(10, Math.min(999, Number(e.target.value) || 100));
  state.size = v; e.target.value = v; $("sizeRange").value = Math.min(300, v);
  if(!state.on.size){ state.on.size = true; state.order.push("size"); }
  sync(); update();
};

function bindSlider(rangeId, valId, key, fmt, apply){
  $(rangeId).oninput = function(e){
    var v = Number(e.target.value);
    apply(v);
    $(valId).textContent = fmt(v);
    if(!state.on[key]){ state.on[key] = true; state.order.push(key); }
    sync(); update();
  };
}
bindSlider("cspaceRange","cspaceVal","cspace", function(v){ return v.toFixed(2) + "em"; }, function(v){ state.cspace = v; });
bindSlider("linehRange","linehVal","lineh", function(v){ return v + "%"; }, function(v){ state.lineh = v; });
bindSlider("rotateRange","rotateVal","rotate", function(v){ return v + "°"; }, function(v){ state.rotate = v; });
bindSlider("voffsetRange","voffsetVal","voffset", function(v){ return v.toFixed(1) + "em"; }, function(v){ state.voffset = v; });
bindSlider("indentRange","indentVal","indent", function(v){ return v + "%"; }, function(v){ state.indent = v; });
bindSlider("widthRange","widthVal","width", function(v){ return v + "%"; }, function(v){ state.width = v; });

$("chipCspace").onclick = function(){ add("cspace"); };
$("chipLineh").onclick = function(){ add("lineh"); };
$("chipSprite").onclick = function(){ add("sprite"); };
$("chipLink").onclick = function(){ add("link"); };
$("spriteName").onchange = function(e){ state.sprite = e.target.value.trim() || "smile"; sync(); update(); };
$("linkId").onchange = function(e){ state.link = e.target.value.trim() || "item_1001"; sync(); update(); };

$("btn-copy").onclick = function(){
  var code = generate();
  if(!code) return toast("还没有代码可复制", true);
  copyText(code, "已复制到剪贴板");
};
/* 通用复制：优先 Clipboard API，失败则退回 execCommand（file:// 下也能用） */
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

function insertAtCursor(t){
  var el = $("text");
  var s = el.selectionStart, e = el.selectionEnd;
  el.value = el.value.slice(0, s) + t + el.value.slice(e);
  el.selectionStart = el.selectionEnd = s + t.length;
  el.focus();
}
var toastTimer = 0;
function toast(msg, isErr){
  var t = $("toast");
  t.textContent = msg;
  t.className = "toast show" + (isErr ? " err" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){ t.className = "toast" + (isErr ? " err" : ""); }, 1700);
}

/* ================= 启动 ================= */
buildOptions();
$("text").value = "滴滴滴";
state.on.color = state.on.size = state.on.b = true;
state.order = ["color", "size", "b"];
/* 默认颜色 #e0b45e 反解成 HSV，让滑块和预览块一打开就是对的 */
var initHsv = hexToHsv("#e0b45e");
state.hue = initHsv.h; state.sat = initHsv.s; state.bri = initHsv.v;
$("hueRange").value = initHsv.h; $("hueNum").value = fmt1(initHsv.h);
$("satRange").value = initHsv.s; $("satNum").value = fmt1(initHsv.s);
$("briRange").value = initHsv.v; $("briNum").value = fmt1(initHsv.v);
$("sizeRange").value = 100; $("sizeNum").value = 100;
sync(); update();

/* 给自检脚本用 */
window.__composer = {
  compose: compose, tagFor: tagFor, PLAIN_TAGS: PLAIN_TAGS, state: state,
  color: { hsvToHex: hsvToHex, hexToHsv: hexToHsv, hsvToRgb: hsvToRgb, rgbToHex: rgbToHex }
};
})();
