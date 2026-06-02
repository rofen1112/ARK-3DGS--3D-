// ../../node_modules/.pnpm/fflate@0.8.3/node_modules/fflate/esm/browser.js
var u8 = Uint8Array;
var u16 = Uint16Array;
var i32 = Int32Array;
var fleb = new u8([
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  1,
  1,
  1,
  1,
  2,
  2,
  2,
  2,
  3,
  3,
  3,
  3,
  4,
  4,
  4,
  4,
  5,
  5,
  5,
  5,
  0,
  /* unused */
  0,
  0,
  /* impossible */
  0
]);
var fdeb = new u8([
  0,
  0,
  0,
  0,
  1,
  1,
  2,
  2,
  3,
  3,
  4,
  4,
  5,
  5,
  6,
  6,
  7,
  7,
  8,
  8,
  9,
  9,
  10,
  10,
  11,
  11,
  12,
  12,
  13,
  13,
  /* unused */
  0,
  0
]);
var clim = new u8([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
var freb = function(eb, start) {
  var b = new u16(31);
  for (var i = 0; i < 31; ++i) {
    b[i] = start += 1 << eb[i - 1];
  }
  var r = new i32(b[30]);
  for (var i = 1; i < 30; ++i) {
    for (var j = b[i]; j < b[i + 1]; ++j) {
      r[j] = j - b[i] << 5 | i;
    }
  }
  return { b, r };
};
var _a = freb(fleb, 2);
var fl = _a.b;
var revfl = _a.r;
fl[28] = 258, revfl[258] = 28;
var _b = freb(fdeb, 0);
var fd = _b.b;
var revfd = _b.r;
var rev = new u16(32768);
for (i = 0; i < 32768; ++i) {
  x = (i & 43690) >> 1 | (i & 21845) << 1;
  x = (x & 52428) >> 2 | (x & 13107) << 2;
  x = (x & 61680) >> 4 | (x & 3855) << 4;
  rev[i] = ((x & 65280) >> 8 | (x & 255) << 8) >> 1;
}
var x;
var i;
var hMap = (function(cd, mb, r) {
  var s = cd.length;
  var i = 0;
  var l = new u16(mb);
  for (; i < s; ++i) {
    if (cd[i])
      ++l[cd[i] - 1];
  }
  var le = new u16(mb);
  for (i = 1; i < mb; ++i) {
    le[i] = le[i - 1] + l[i - 1] << 1;
  }
  var co;
  if (r) {
    co = new u16(1 << mb);
    var rvb = 15 - mb;
    for (i = 0; i < s; ++i) {
      if (cd[i]) {
        var sv = i << 4 | cd[i];
        var r_1 = mb - cd[i];
        var v = le[cd[i] - 1]++ << r_1;
        for (var m = v | (1 << r_1) - 1; v <= m; ++v) {
          co[rev[v] >> rvb] = sv;
        }
      }
    }
  } else {
    co = new u16(s);
    for (i = 0; i < s; ++i) {
      if (cd[i]) {
        co[i] = rev[le[cd[i] - 1]++] >> 15 - cd[i];
      }
    }
  }
  return co;
});
var flt = new u8(288);
for (i = 0; i < 144; ++i)
  flt[i] = 8;
var i;
for (i = 144; i < 256; ++i)
  flt[i] = 9;
var i;
for (i = 256; i < 280; ++i)
  flt[i] = 7;
var i;
for (i = 280; i < 288; ++i)
  flt[i] = 8;
var i;
var fdt = new u8(32);
for (i = 0; i < 32; ++i)
  fdt[i] = 5;
var i;
var flrm = /* @__PURE__ */ hMap(flt, 9, 1);
var fdrm = /* @__PURE__ */ hMap(fdt, 5, 1);
var max = function(a) {
  var m = a[0];
  for (var i = 1; i < a.length; ++i) {
    if (a[i] > m)
      m = a[i];
  }
  return m;
};
var bits = function(d, p, m) {
  var o = p / 8 | 0;
  return (d[o] | d[o + 1] << 8) >> (p & 7) & m;
};
var bits16 = function(d, p) {
  var o = p / 8 | 0;
  return (d[o] | d[o + 1] << 8 | d[o + 2] << 16) >> (p & 7);
};
var shft = function(p) {
  return (p + 7) / 8 | 0;
};
var slc = function(v, s, e) {
  if (s == null || s < 0)
    s = 0;
  if (e == null || e > v.length)
    e = v.length;
  return new u8(v.subarray(s, e));
};
var ec = [
  "unexpected EOF",
  "invalid block type",
  "invalid length/literal",
  "invalid distance",
  "stream finished",
  "no stream handler",
  ,
  // determined by compression function
  "no callback",
  "invalid UTF-8 data",
  "extra field too long",
  "date not in range 1980-2099",
  "filename too long",
  "stream finishing",
  "invalid zip data"
  // determined by unknown compression method
];
var err = function(ind, msg, nt) {
  var e = new Error(msg || ec[ind]);
  e.code = ind;
  if (Error.captureStackTrace)
    Error.captureStackTrace(e, err);
  if (!nt)
    throw e;
  return e;
};
var inflt = function(dat, st, buf, dict) {
  var sl = dat.length, dl = dict ? dict.length : 0;
  if (!sl || st.f && !st.l)
    return buf || new u8(0);
  var noBuf = !buf;
  var resize = noBuf || st.i != 2;
  var noSt = st.i;
  if (noBuf)
    buf = new u8(sl * 3);
  var cbuf = function(l2) {
    var bl = buf.length;
    if (l2 > bl) {
      var nbuf = new u8(Math.max(bl * 2, l2));
      nbuf.set(buf);
      buf = nbuf;
    }
  };
  var final = st.f || 0, pos = st.p || 0, bt = st.b || 0, lm = st.l, dm = st.d, lbt = st.m, dbt = st.n;
  var tbts = sl * 8;
  do {
    if (!lm) {
      final = bits(dat, pos, 1);
      var type = bits(dat, pos + 1, 3);
      pos += 3;
      if (!type) {
        var s = shft(pos) + 4, l = dat[s - 4] | dat[s - 3] << 8, t = s + l;
        if (t > sl) {
          if (noSt)
            err(0);
          break;
        }
        if (resize)
          cbuf(bt + l);
        buf.set(dat.subarray(s, t), bt);
        st.b = bt += l, st.p = pos = t * 8, st.f = final;
        continue;
      } else if (type == 1)
        lm = flrm, dm = fdrm, lbt = 9, dbt = 5;
      else if (type == 2) {
        var hLit = bits(dat, pos, 31) + 257, hcLen = bits(dat, pos + 10, 15) + 4;
        var tl = hLit + bits(dat, pos + 5, 31) + 1;
        pos += 14;
        var ldt = new u8(tl);
        var clt = new u8(19);
        for (var i = 0; i < hcLen; ++i) {
          clt[clim[i]] = bits(dat, pos + i * 3, 7);
        }
        pos += hcLen * 3;
        var clb = max(clt), clbmsk = (1 << clb) - 1;
        var clm = hMap(clt, clb, 1);
        for (var i = 0; i < tl; ) {
          var r = clm[bits(dat, pos, clbmsk)];
          pos += r & 15;
          var s = r >> 4;
          if (s < 16) {
            ldt[i++] = s;
          } else {
            var c = 0, n = 0;
            if (s == 16)
              n = 3 + bits(dat, pos, 3), pos += 2, c = ldt[i - 1];
            else if (s == 17)
              n = 3 + bits(dat, pos, 7), pos += 3;
            else if (s == 18)
              n = 11 + bits(dat, pos, 127), pos += 7;
            while (n--)
              ldt[i++] = c;
          }
        }
        var lt = ldt.subarray(0, hLit), dt = ldt.subarray(hLit);
        lbt = max(lt);
        dbt = max(dt);
        lm = hMap(lt, lbt, 1);
        dm = hMap(dt, dbt, 1);
      } else
        err(1);
      if (pos > tbts) {
        if (noSt)
          err(0);
        break;
      }
    }
    if (resize)
      cbuf(bt + 131072);
    var lms = (1 << lbt) - 1, dms = (1 << dbt) - 1;
    var lpos = pos;
    for (; ; lpos = pos) {
      var c = lm[bits16(dat, pos) & lms], sym = c >> 4;
      pos += c & 15;
      if (pos > tbts) {
        if (noSt)
          err(0);
        break;
      }
      if (!c)
        err(2);
      if (sym < 256)
        buf[bt++] = sym;
      else if (sym == 256) {
        lpos = pos, lm = null;
        break;
      } else {
        var add = sym - 254;
        if (sym > 264) {
          var i = sym - 257, b = fleb[i];
          add = bits(dat, pos, (1 << b) - 1) + fl[i];
          pos += b;
        }
        var d = dm[bits16(dat, pos) & dms], dsym = d >> 4;
        if (!d)
          err(3);
        pos += d & 15;
        var dt = fd[dsym];
        if (dsym > 3) {
          var b = fdeb[dsym];
          dt += bits16(dat, pos) & (1 << b) - 1, pos += b;
        }
        if (pos > tbts) {
          if (noSt)
            err(0);
          break;
        }
        if (resize)
          cbuf(bt + 131072);
        var end = bt + add;
        if (bt < dt) {
          var shift = dl - dt, dend = Math.min(dt, end);
          if (shift + bt < 0)
            err(3);
          for (; bt < dend; ++bt)
            buf[bt] = dict[shift + bt];
        }
        for (; bt < end; ++bt)
          buf[bt] = buf[bt - dt];
      }
    }
    st.l = lm, st.p = lpos, st.b = bt, st.f = final;
    if (lm)
      final = 1, st.m = lbt, st.d = dm, st.n = dbt;
  } while (!final);
  return bt != buf.length && noBuf ? slc(buf, 0, bt) : buf.subarray(0, bt);
};
var et = /* @__PURE__ */ new u8(0);
var b2 = function(d, b) {
  return d[b] | d[b + 1] << 8;
};
var b4 = function(d, b) {
  return (d[b] | d[b + 1] << 8 | d[b + 2] << 16 | d[b + 3] << 24) >>> 0;
};
var b8 = function(d, b) {
  return b4(d, b) + b4(d, b + 4) * 4294967296;
};
function inflateSync(data, opts) {
  return inflt(data, { i: 2 }, opts && opts.out, opts && opts.dictionary);
}
var td = typeof TextDecoder != "undefined" && /* @__PURE__ */ new TextDecoder();
var tds = 0;
try {
  td.decode(et, { stream: true });
  tds = 1;
} catch (e) {
}
var dutf8 = function(d) {
  for (var r = "", i = 0; ; ) {
    var c = d[i++];
    var eb = (c > 127) + (c > 223) + (c > 239);
    if (i + eb > d.length)
      return { s: r, r: slc(d, i - 1) };
    if (!eb)
      r += String.fromCharCode(c);
    else if (eb == 3) {
      c = ((c & 15) << 18 | (d[i++] & 63) << 12 | (d[i++] & 63) << 6 | d[i++] & 63) - 65536, r += String.fromCharCode(55296 | c >> 10, 56320 | c & 1023);
    } else if (eb & 1)
      r += String.fromCharCode((c & 31) << 6 | d[i++] & 63);
    else
      r += String.fromCharCode((c & 15) << 12 | (d[i++] & 63) << 6 | d[i++] & 63);
  }
};
function strFromU8(dat, latin1) {
  if (latin1) {
    var r = "";
    for (var i = 0; i < dat.length; i += 16384)
      r += String.fromCharCode.apply(null, dat.subarray(i, i + 16384));
    return r;
  } else if (td) {
    return td.decode(dat);
  } else {
    var _a2 = dutf8(dat), s = _a2.s, r = _a2.r;
    if (r.length)
      err(8);
    return s;
  }
}
var slzh = function(d, b) {
  return b + 30 + b2(d, b + 26) + b2(d, b + 28);
};
var zh = function(d, b, z) {
  var fnl = b2(d, b + 28), efl = b2(d, b + 30), fn = strFromU8(d.subarray(b + 46, b + 46 + fnl), !(b2(d, b + 8) & 2048)), es = b + 46 + fnl;
  var _a2 = z64hs(d, es, efl, z, b4(d, b + 20), b4(d, b + 24), b4(d, b + 42)), sc = _a2[0], su = _a2[1], off = _a2[2];
  return [b2(d, b + 10), sc, su, fn, es + efl + b2(d, b + 32), off];
};
var z64hs = function(d, b, l, z, sc, su, off) {
  var nsc = sc == 4294967295, nsu = su == 4294967295, noff = off == 4294967295, e = b + l;
  var nf = nsc + nsu + noff;
  if (z && nf) {
    for (; b + 4 < e; b += 4 + b2(d, b + 2)) {
      if (b2(d, b) == 1) {
        return [
          nsc ? b8(d, b + 4 + 8 * nsu) : sc,
          nsu ? b8(d, b + 4) : su,
          noff ? b8(d, b + 4 + 8 * (nsu + nsc)) : off,
          1
        ];
      }
    }
    if (z < 2)
      err(13);
  }
  return [sc, su, off, 0];
};
function unzipSync(data, opts) {
  var files = {};
  var e = data.length - 22;
  for (; b4(data, e) != 101010256; --e) {
    if (!e || data.length - e > 65558)
      err(13);
  }
  ;
  var c = b2(data, e + 8);
  if (!c)
    return {};
  var o = b4(data, e + 16);
  var z = b4(data, e - 20) == 117853008;
  if (z) {
    var ze = b4(data, e - 12);
    z = b4(data, ze) == 101075792;
    if (z) {
      c = b4(data, ze + 32);
      o = b4(data, ze + 48);
    }
  }
  var fltr = opts && opts.filter;
  for (var i = 0; i < c; ++i) {
    var _a2 = zh(data, o, z), c_2 = _a2[0], sc = _a2[1], su = _a2[2], fn = _a2[3], no = _a2[4], off = _a2[5], b = slzh(data, off);
    o = no;
    if (!fltr || fltr({
      name: fn,
      size: sc,
      originalSize: su,
      compression: c_2
    })) {
      if (!c_2)
        files[fn] = slc(data, b, b + sc);
      else if (c_2 == 8)
        files[fn] = inflateSync(data.subarray(b, b + sc), { out: new u8(su) });
      else
        err(14, "unknown compression type " + c_2);
    }
  }
  return files;
}

// ../../external/egs-core/packages/loaders/splat-loader/utils.ts
var DEPTH_INFINITY = 31743;
var buckets = new Uint32Array(65536);
function sortSplats(counts, sorting, order) {
  buckets.fill(0);
  for (let i = 0; i < counts; i++) {
    buckets[sorting[i]]++;
  }
  let activeSplats = 0;
  for (let i = DEPTH_INFINITY - 1; i >= 0; i--) {
    const v = buckets[i];
    buckets[i] = activeSplats;
    activeSplats += v;
  }
  for (let i = 0; i < counts; i++) {
    const v = sorting[i];
    if (v < DEPTH_INFINITY) {
      order[buckets[v]++] = i;
    }
  }
  return activeSplats;
}

// ../../external/egs-core/packages/egs-lib/src/env.ts
var isDebugEnable;
try {
  if (isDebugEnable == null && (CONFIG.IS_DEV || CONFIG.IS_TESTING || CONFIG.IS_DEV_OR_TESTING)) {
    isDebugEnable = true;
  }
} catch (e) {
}
try {
  if (isDebugEnable == null && true) {
    isDebugEnable = true;
  }
} catch (e) {
}
try {
  if (isDebugEnable == null) {
    const urlParam = new URLSearchParams(location.search);
    if (urlParam.has("__enable_debug__")) {
      isDebugEnable = true;
    } else if (urlParam.has("__disable_debug__")) {
      isDebugEnable = false;
    }
  }
} catch (e) {
}
if (isDebugEnable == null) {
  isDebugEnable = false;
}
var ENV = {
  isDebugEnable
};

// ../../external/egs-core/packages/egs-lib/src/logger.ts
var _Logger = class _Logger {
  constructor() {
    this.exceptionCount = 0;
  }
  info(...param) {
    if (!ENV.isDebugEnable) {
      return;
    }
    console.log("EGS:", ...param);
  }
  warn(...param) {
    if (!ENV.isDebugEnable) {
      return;
    }
    console.warn("EGS:", ...param);
  }
  error(content, type = "Unreachable" /* Unreachable */) {
    if (!ENV.isDebugEnable && this.exceptionCount >= _Logger.MAX_EXCEPTION_SIZE) {
      return;
    }
    const error = typeof content === "string" ? new Error(`EGS Exception: <${type}> ${content}`) : content;
    console.error(error);
  }
  // logic error
  unreachable(content) {
    this.error(content, "Unreachable" /* Unreachable */);
  }
  // platform issue
  unsupported(content) {
    this.error(content, "Unsupported" /* Unsupported */);
  }
  // user input invalid
  invalidInput(content) {
    this.error(content, "InvalidInput" /* InvalidInput */);
  }
  // webgl error
  webglError(content) {
    this.error(content, "WebglError" /* WebglError */);
  }
  webGpuError(content) {
    this.error(content, "WebGpuError" /* WebGpuError */);
  }
};
_Logger.MAX_EXCEPTION_SIZE = 1024;
var Logger = _Logger;
var logger = new Logger();

// ../../external/egs-core/packages/egs-lib/src/promise.ts
function deferred() {
  let resolve = () => {
  };
  let reject = () => {
  };
  const promise = new Promise(function(resolveInner, rejectInner) {
    resolve = resolveInner;
    reject = rejectInner;
  });
  return {
    promise,
    resolve,
    reject
  };
}

// ../../external/egs-core/packages/egs-lib/src/worker.ts
var WorkerFlags = {
  BUSY: 1,
  ALIVE: 2,
  PERMANENT: 4,
  KEEP: 1 | 4
};

// ../../external/egs-core/packages/loaders/splat-loader/splat/SplatData.ts
var SplatData = class {
  constructor(maxShDegree = 3, maxTextureSize = 16384, blockCounts = 1) {
    this.totalBlockCounts = 0;
    this.totalBlockShDegree = 3;
    this.blockOffsets = [];
    this.blockExecs = [];
    this.currentBlockIndex = 0;
    this.blockCounts = blockCounts;
    this.maxShDegree = maxShDegree;
    this.maxTextureSize = maxTextureSize;
  }
  initBlock(counts, shDegree) {
    this.blockOffsets.push(this.totalBlockCounts);
    this.totalBlockCounts += counts;
    this.totalBlockShDegree = Math.min(shDegree, this.totalBlockShDegree);
    const { promise, resolve } = deferred();
    this.blockExecs.push(resolve);
    if (this.blockOffsets.length === this.blockCounts) {
      this.init(this.totalBlockCounts, this.totalBlockShDegree);
      this.blockExecs[this.currentBlockIndex](this.blockOffsets[0]);
    }
    return promise;
  }
  finishBlock() {
    this.currentBlockIndex++;
    this.blockExecs[this.currentBlockIndex]?.(this.blockOffsets[this.currentBlockIndex]);
  }
};

// ../../external/egs-core/packages/loaders/splat-loader/splat/utils.ts
var SH_MAPS = {
  0: 0,
  1: 9,
  2: 24,
  3: 45
};
function computeTextureSize(counts, maxTextureSize) {
  if (counts === 0) {
    return { w: 0, h: 0, d: 0 };
  }
  const width = Math.min(Math.ceil(Math.sqrt(counts) / 2) * 2, maxTextureSize);
  const height = Math.min(Math.ceil(counts / width), maxTextureSize);
  const depth = Math.ceil(counts / (width * height));
  return { w: width, h: height, d: depth };
}
function clamp(v, min, max2) {
  return Math.min(Math.max(v, min), max2);
}
var f32buffer = new Float32Array(1);
var u32buffer = new Uint32Array(f32buffer.buffer);
function toHalf(f) {
  f32buffer[0] = f;
  const bits2 = u32buffer[0];
  const sign = bits2 >> 31 & 1;
  const exp = bits2 >> 23 & 255;
  const frac = bits2 & 8388607;
  const halfSign = sign << 15;
  if (exp === 255) {
    if (frac !== 0) {
      return halfSign | 32767;
    }
    return halfSign | 31744;
  }
  const newExp = exp - 127 + 15;
  if (newExp >= 31) {
    return halfSign | 31744;
  }
  if (newExp <= 0) {
    if (newExp < -10) {
      return halfSign;
    }
    const subFrac = (frac | 8388608) >> 1 - newExp + 13;
    return halfSign | subFrac;
  }
  const halfFrac = frac >> 13;
  return halfSign | newExp << 10 | halfFrac;
}
function fromHalf(h) {
  const sign = h >> 15 & 1;
  const exp = h >> 10 & 31;
  const frac = h & 1023;
  let f32bits;
  if (exp === 0) {
    if (frac === 0) {
      f32bits = sign << 31;
    } else {
      let mant = frac;
      let e = -14;
      while ((mant & 1024) === 0) {
        mant <<= 1;
        e--;
      }
      mant &= 1023;
      const newExp = e + 127;
      const newFrac = mant << 13;
      f32bits = sign << 31 | newExp << 23 | newFrac;
    }
  } else if (exp === 31) {
    if (frac === 0) {
      f32bits = sign << 31 | 2139095040;
    } else {
      f32bits = sign << 31 | 2143289344;
    }
  } else {
    const newExp = exp - 15 + 127;
    const newFrac = frac << 13;
    f32bits = sign << 31 | newExp << 23 | newFrac;
  }
  u32buffer[0] = f32bits;
  return f32buffer[0];
}
var Vector3 = class {
  constructor(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
  set(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }
  length() {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
  }
  divideScalar(scalar) {
    const invLength = 1 / scalar;
    this.x *= invLength;
    this.y *= invLength;
    this.z *= invLength;
    return this;
  }
  normalize() {
    return this.divideScalar(this.length() || 1);
  }
};
var Quaternion = class {
  constructor(x, y, z, w) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
  }
  set(x, y, z, w) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
    return this;
  }
  normalize() {
    const length = Math.sqrt(
      this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w
    );
    if (length === 0) {
      return this;
    }
    const invLength = 1 / length;
    this.x *= invLength;
    this.y *= invLength;
    this.z *= invLength;
    this.w *= invLength;
    return this;
  }
};
var tempArr = new Array(4);
var tempVec = new Vector3(0, 0, 0);
var tempQuat = new Quaternion(0, 0, 0, 1);
function encodeQuatOct(x, y, z, w) {
  const q = tempQuat.set(x, y, z, w).normalize();
  if (q.w < 0) {
    q.set(-q.x, -q.y, -q.z, -q.w);
  }
  const theta = 2 * Math.acos(q.w);
  const xyz_norm = Math.sqrt(
    q.x * q.x + q.y * q.y + q.z * q.z
  );
  const axis = xyz_norm < 1e-6 ? tempVec.set(1, 0, 0) : tempVec.set(q.x, q.y, q.z).divideScalar(xyz_norm);
  const sum = Math.abs(axis.x) + Math.abs(axis.y) + Math.abs(axis.z);
  let p_x = axis.x / sum;
  let p_y = axis.y / sum;
  if (axis.z < 0) {
    const tmp = p_x;
    p_x = (1 - Math.abs(p_y)) * (p_x >= 0 ? 1 : -1);
    p_y = (1 - Math.abs(tmp)) * (p_y >= 0 ? 1 : -1);
  }
  tempArr[0] = p_x;
  tempArr[1] = p_y;
  tempArr[2] = theta / Math.PI;
  return tempArr;
}
function decodeQuatOct(u, v, angle) {
  let f_x = u;
  let f_y = v;
  const f_z = 1 - (Math.abs(f_x) + Math.abs(f_y));
  const t = Math.max(-f_z, 0);
  f_x += f_x >= 0 ? -t : t;
  f_y += f_y >= 0 ? -t : t;
  const axis = tempVec.set(f_x, f_y, f_z).normalize();
  const theta = angle * Math.PI;
  const halfTheta = theta * 0.5;
  const s = Math.sin(halfTheta);
  tempArr[0] = axis.x * s;
  tempArr[1] = axis.y * s;
  tempArr[2] = axis.z * s;
  tempArr[3] = Math.cos(halfTheta);
  return tempArr;
}

// ../../external/egs-core/packages/loaders/splat-loader/splat/RawSplatData.ts
var tempQuat2 = new Quaternion(0, 0, 0, 1);
var RawSplatData = class extends SplatData {
  constructor() {
    super(...arguments);
    this.counts = 0;
    this.shDegree = 0;
  }
  init(counts, shDegree) {
    this.counts = counts;
    this.shDegree = Math.min(shDegree, this.maxShDegree);
    const shCounts = this.shCounts = SH_MAPS[shDegree];
    this.table = new Array(14 + shCounts).fill(0).map(() => new Float32Array(counts));
  }
  set(i, single) {
    const { table } = this;
    table[0 /* x */][i] = single.x;
    table[1 /* y */][i] = single.y;
    table[2 /* z */][i] = single.z;
    table[3 /* sx */][i] = single.sx;
    table[4 /* sy */][i] = single.sy;
    table[5 /* sz */][i] = single.sz;
    tempQuat2.set(single.qx, single.qy, single.qz, single.qw).normalize();
    table[6 /* qx */][i] = tempQuat2.x;
    table[7 /* qy */][i] = tempQuat2.y;
    table[8 /* qz */][i] = tempQuat2.z;
    table[9 /* qw */][i] = tempQuat2.w;
    table[10 /* r */][i] = single.r;
    table[11 /* g */][i] = single.g;
    table[12 /* b */][i] = single.b;
    table[13 /* a */][i] = single.a;
  }
  setCenter(i, x, y, z) {
    const { table } = this;
    table[0 /* x */][i] = x;
    table[1 /* y */][i] = y;
    table[2 /* z */][i] = z;
  }
  setScale(i, sx, sy, sz) {
    const { table } = this;
    table[3 /* sx */][i] = sx;
    table[4 /* sy */][i] = sy;
    table[5 /* sz */][i] = sz;
  }
  setQuat(i, qx, qy, qz, qw) {
    const { table } = this;
    tempQuat2.set(qx, qy, qz, qw).normalize();
    table[6 /* qx */][i] = tempQuat2.x;
    table[7 /* qy */][i] = tempQuat2.y;
    table[8 /* qz */][i] = tempQuat2.z;
    table[9 /* qw */][i] = tempQuat2.w;
  }
  setColor(i, r, g, b) {
    const { table } = this;
    table[10 /* r */][i] = r;
    table[11 /* g */][i] = g;
    table[12 /* b */][i] = b;
  }
  setAlpha(i, a) {
    const { table } = this;
    table[13 /* a */][i] = a;
  }
  setShN(i, shN) {
    const { table, shCounts } = this;
    const offset = 13 /* a */ + 1;
    for (let j = 0; j < shCounts; j++) {
      table[offset + j][i] = shN[j];
    }
  }
  get(i, single) {
    const { table } = this;
    single.x = table[0 /* x */][i];
    single.y = table[1 /* y */][i];
    single.z = table[2 /* z */][i];
    single.sx = table[3 /* sx */][i];
    single.sy = table[4 /* sy */][i];
    single.sz = table[5 /* sz */][i];
    single.qx = table[6 /* qx */][i];
    single.qy = table[7 /* qy */][i];
    single.qz = table[8 /* qz */][i];
    single.qw = table[9 /* qw */][i];
    single.r = table[10 /* r */][i];
    single.g = table[11 /* g */][i];
    single.b = table[12 /* b */][i];
    single.a = table[13 /* a */][i];
  }
  getCenter(i, single) {
    const { table } = this;
    single.x = table[0 /* x */][i];
    single.y = table[1 /* y */][i];
    single.z = table[2 /* z */][i];
  }
  getScale(i, single) {
    const { table } = this;
    single.sx = table[3 /* sx */][i];
    single.sy = table[4 /* sy */][i];
    single.sz = table[5 /* sz */][i];
  }
  getQuat(i, single) {
    const { table } = this;
    single.qx = table[6 /* qx */][i];
    single.qy = table[7 /* qy */][i];
    single.qz = table[8 /* qz */][i];
    single.qw = table[9 /* qw */][i];
  }
  getColor(i, single) {
    const { table } = this;
    single.r = table[10 /* r */][i];
    single.g = table[11 /* g */][i];
    single.b = table[12 /* b */][i];
  }
  getAlpha(i, single) {
    const { table } = this;
    single.a = table[13 /* a */][i];
  }
  getShN(i, shN) {
    const { shCounts, table } = this;
    const offset = 13 /* a */ + 1;
    for (let j = 0; j < shCounts; j++) {
      shN[j] = table[offset + j][i];
    }
  }
  fillCenters(centers) {
    const { counts, table } = this;
    const xBuffer = table[0 /* x */];
    const yBuffer = table[1 /* y */];
    const zBuffer = table[2 /* z */];
    for (let i = 0; i < counts; i++) {
      const i3 = i * 3;
      centers[i3 + 0] = xBuffer[i];
      centers[i3 + 1] = yBuffer[i];
      centers[i3 + 2] = zBuffer[i];
    }
  }
  serialize() {
    return {
      counts: this.counts,
      shDegree: this.shDegree,
      samplers: this.table.map((buffer) => ({
        width: this.counts,
        height: 1,
        depth: 1,
        format: 1 /* RGBA_UINT */,
        source: new Uint8Array(buffer.buffer)
      }))
    };
  }
  deserialize(data) {
    const { counts, shDegree, samplers } = data;
    this.counts = counts;
    this.shDegree = shDegree;
    this.shCounts = SH_MAPS[shDegree];
    this.table = samplers.map((sampler) => new Float32Array(sampler.source.buffer));
  }
};

// ../../external/egs-core/packages/loaders/splat-loader/splat/CompressedSplatData.ts
function encode111011s(a, b, c) {
  return clamp((a * 0.5 + 0.5) * 2047 | 0, 0, 2047) << 21 | clamp((b * 0.5 + 0.5) * 1023 | 0, 0, 1023) << 11 | clamp((c * 0.5 + 0.5) * 2047 | 0, 0, 2047);
}
function decode111011s(decode, out, offset) {
  out[offset + 0] = (decode >>> 21 & 2047) / 2047 * 2 - 1;
  out[offset + 1] = (decode >>> 11 & 1023) / 1023 * 2 - 1;
  out[offset + 2] = (decode & 2047) / 2047 * 2 - 1;
}
var CompressedSplatData = class extends SplatData {
  constructor() {
    super(...arguments);
    this.counts = 0;
    this.shDegree = 0;
  }
  init(counts, shDegree) {
    this.counts = counts;
    this.shDegree = Math.min(shDegree, this.maxShDegree);
    const { w: width, h: height, d: depth } = computeTextureSize(counts, this.maxTextureSize);
    const pixelCounts = width * height * depth;
    const splat1Sampler = this.splat1Sampler = {
      width,
      height,
      depth,
      format: 1 /* RGBA_UINT */,
      source: new Uint8Array(16 * pixelCounts)
    };
    this.splat1Float32Buffer = new Float32Array(splat1Sampler.source.buffer);
    this.splat1Uint16Buffer = new Uint16Array(splat1Sampler.source.buffer);
    const splat2Sampler = this.splat2Sampler = {
      width,
      height,
      depth,
      format: 1 /* RGBA_UINT */,
      source: new Uint8Array(16 * pixelCounts)
    };
    this.splat2Uint16Buffer = new Uint16Array(splat2Sampler.source.buffer);
    this.splat2Uint32Buffer = new Uint32Array(splat2Sampler.source.buffer);
    const sh1Sampler = this.sh1Sampler = {
      width,
      height,
      depth,
      format: 1 /* RGBA_UINT */,
      source: new Uint8Array((shDegree >= 1 ? 16 : 0) * pixelCounts)
    };
    this.sh1Uint32Buffer = new Uint32Array(sh1Sampler.source.buffer);
    const sh2Sampler = this.sh2Sampler = {
      width,
      height,
      depth,
      format: 1 /* RGBA_UINT */,
      source: new Uint8Array((shDegree >= 2 ? 16 : 0) * pixelCounts)
    };
    this.sh2Uint32Buffer = new Uint32Array(sh2Sampler.source.buffer);
    const sh3Sampler = this.sh3Sampler = {
      width,
      height,
      depth,
      format: 1 /* RGBA_UINT */,
      source: new Uint8Array((shDegree >= 3 ? 16 : 0) * pixelCounts)
    };
    this.sh3Uint32Buffer = new Uint32Array(sh3Sampler.source.buffer);
    const sh4Sampler = this.sh4Sampler = {
      width,
      height,
      depth,
      format: 1 /* RGBA_UINT */,
      source: new Uint8Array((shDegree >= 3 ? 16 : 0) * pixelCounts)
    };
    this.sh4Uint32Buffer = new Uint32Array(sh4Sampler.source.buffer);
  }
  set(i, single) {
    const { splat1Float32Buffer, splat1Uint16Buffer, splat2Uint16Buffer, splat2Uint32Buffer } = this;
    const i4 = i * 4;
    const i8 = i * 8;
    splat1Float32Buffer[i4 + 0] = single.x;
    splat1Float32Buffer[i4 + 1] = single.y;
    splat1Float32Buffer[i4 + 2] = single.z;
    splat1Uint16Buffer[i8 + 6] = toHalf(single.a);
    splat2Uint16Buffer[i8 + 0] = toHalf(single.r);
    splat2Uint16Buffer[i8 + 1] = toHalf(single.g);
    splat2Uint16Buffer[i8 + 2] = toHalf(single.b);
    splat2Uint16Buffer[i8 + 3] = toHalf(Math.log(single.sx));
    splat2Uint16Buffer[i8 + 4] = toHalf(Math.log(single.sy));
    splat2Uint16Buffer[i8 + 5] = toHalf(Math.log(single.sz));
    const oct = encodeQuatOct(single.qx, single.qy, single.qz, single.qw);
    const quantU = clamp((oct[0] * 0.5 + 0.5) * 1023 | 0, 0, 1023);
    const quantV = clamp((oct[1] * 0.5 + 0.5) * 1023 | 0, 0, 1023);
    const angleInt = clamp(oct[2] * 4095 | 0, 0, 4095);
    splat2Uint32Buffer[i4 + 3] = angleInt << 20 | quantV << 10 | quantU;
  }
  setCenter(i, x, y, z) {
    const { splat1Float32Buffer } = this;
    const i4 = i * 4;
    splat1Float32Buffer[i4 + 0] = x;
    splat1Float32Buffer[i4 + 1] = y;
    splat1Float32Buffer[i4 + 2] = z;
  }
  setScale(i, sx, sy, sz) {
    const { splat2Uint16Buffer } = this;
    const i8 = i * 8;
    splat2Uint16Buffer[i8 + 3] = toHalf(Math.log(sx));
    splat2Uint16Buffer[i8 + 4] = toHalf(Math.log(sy));
    splat2Uint16Buffer[i8 + 5] = toHalf(Math.log(sz));
  }
  setQuat(i, qx, qy, qz, qw) {
    const { splat2Uint32Buffer } = this;
    const i4 = i * 4;
    const oct = encodeQuatOct(qx, qy, qz, qw);
    const quantU = clamp((oct[0] * 0.5 + 0.5) * 1023 | 0, 0, 1023);
    const quantV = clamp((oct[1] * 0.5 + 0.5) * 1023 | 0, 0, 1023);
    const angleInt = clamp(oct[2] * 4095 | 0, 0, 4095);
    splat2Uint32Buffer[i4 + 3] = angleInt << 20 | quantV << 10 | quantU;
  }
  setColor(i, r, g, b) {
    const { splat2Uint16Buffer } = this;
    const i8 = i * 8;
    splat2Uint16Buffer[i8 + 0] = toHalf(r);
    splat2Uint16Buffer[i8 + 1] = toHalf(g);
    splat2Uint16Buffer[i8 + 2] = toHalf(b);
  }
  setAlpha(i, a) {
    const { splat1Uint16Buffer } = this;
    const i8 = i * 8;
    splat1Uint16Buffer[i8 + 6] = toHalf(a);
  }
  setShN(i, shN) {
    const { shDegree, sh1Uint32Buffer, sh2Uint32Buffer } = this;
    const o = i * 4;
    if (shDegree >= 1) {
      sh1Uint32Buffer[o + 0] = encode111011s(shN[0], shN[1], shN[2]);
      sh1Uint32Buffer[o + 1] = encode111011s(shN[3], shN[4], shN[5]);
      sh1Uint32Buffer[o + 2] = encode111011s(shN[6], shN[7], shN[8]);
    }
    if (shDegree >= 2) {
      sh1Uint32Buffer[o + 3] = encode111011s(shN[9], shN[10], shN[11]);
      sh2Uint32Buffer[o + 0] = encode111011s(shN[12], shN[13], shN[14]);
      sh2Uint32Buffer[o + 1] = encode111011s(shN[15], shN[16], shN[17]);
      sh2Uint32Buffer[o + 2] = encode111011s(shN[18], shN[19], shN[20]);
      sh2Uint32Buffer[o + 3] = encode111011s(shN[21], shN[22], shN[23]);
    }
    if (shDegree >= 3) {
      const { sh3Uint32Buffer, sh4Uint32Buffer } = this;
      sh3Uint32Buffer[o + 0] = encode111011s(shN[24], shN[25], shN[26]);
      sh3Uint32Buffer[o + 1] = encode111011s(shN[27], shN[28], shN[29]);
      sh3Uint32Buffer[o + 2] = encode111011s(shN[30], shN[31], shN[32]);
      sh3Uint32Buffer[o + 3] = encode111011s(shN[33], shN[34], shN[35]);
      sh4Uint32Buffer[o + 0] = encode111011s(shN[36], shN[37], shN[38]);
      sh4Uint32Buffer[o + 1] = encode111011s(shN[39], shN[40], shN[41]);
      sh4Uint32Buffer[o + 2] = encode111011s(shN[42], shN[43], shN[44]);
    }
  }
  get(i, single) {
    const { splat1Float32Buffer, splat1Uint16Buffer, splat2Uint16Buffer, splat2Uint32Buffer } = this;
    const i4 = i * 4;
    const i8 = i * 8;
    single.x = splat1Float32Buffer[i4 + 0];
    single.y = splat1Float32Buffer[i4 + 1];
    single.z = splat1Float32Buffer[i4 + 2];
    single.a = fromHalf(splat1Uint16Buffer[i8 + 6]);
    single.r = fromHalf(splat2Uint16Buffer[i8 + 0]);
    single.g = fromHalf(splat2Uint16Buffer[i8 + 1]);
    single.b = fromHalf(splat2Uint16Buffer[i8 + 2]);
    single.sx = Math.exp(fromHalf(splat2Uint16Buffer[i8 + 3]));
    single.sy = Math.exp(fromHalf(splat2Uint16Buffer[i8 + 4]));
    single.sz = Math.exp(fromHalf(splat2Uint16Buffer[i8 + 5]));
    const quatEncode = splat2Uint32Buffer[i4 + 3];
    const u = (quatEncode & 1023 / 1023) * 2 - 1;
    const v = (quatEncode >>> 10 & 1023 / 1023) * 2 - 1;
    const angle = quatEncode >>> 20 & 4095 / 4095;
    const quat = decodeQuatOct(u, v, angle);
    single.qx = quat[0];
    single.qy = quat[1];
    single.qz = quat[2];
    single.qw = quat[3];
  }
  getCenter(i, single) {
    const { splat1Float32Buffer } = this;
    const i4 = i * 4;
    single.x = splat1Float32Buffer[i4 + 0];
    single.y = splat1Float32Buffer[i4 + 1];
    single.z = splat1Float32Buffer[i4 + 2];
  }
  getScale(i, single) {
    const { splat2Uint16Buffer } = this;
    const i8 = i * 8;
    single.sx = Math.exp(fromHalf(splat2Uint16Buffer[i8 + 3]));
    single.sy = Math.exp(fromHalf(splat2Uint16Buffer[i8 + 4]));
    single.sz = Math.exp(fromHalf(splat2Uint16Buffer[i8 + 5]));
  }
  getQuat(i, single) {
    const { splat2Uint32Buffer } = this;
    const i4 = i * 4;
    const quatEncode = splat2Uint32Buffer[i4 + 3];
    const u = (quatEncode & 1023 / 1023) * 2 - 1;
    const v = (quatEncode >>> 10 & 1023 / 1023) * 2 - 1;
    const angle = quatEncode >>> 20 & 4095 / 4095;
    const quat = decodeQuatOct(u, v, angle);
    single.qx = quat[0];
    single.qy = quat[1];
    single.qz = quat[2];
    single.qw = quat[3];
  }
  getColor(i, single) {
    const { splat2Uint16Buffer } = this;
    const i8 = i * 8;
    single.r = fromHalf(splat2Uint16Buffer[i8 + 0]);
    single.g = fromHalf(splat2Uint16Buffer[i8 + 1]);
    single.b = fromHalf(splat2Uint16Buffer[i8 + 2]);
  }
  getAlpha(i, single) {
    const { splat1Uint16Buffer } = this;
    const i8 = i * 8;
    single.a = fromHalf(splat1Uint16Buffer[i8 + 6]);
  }
  getShN(i, shN) {
    const { shDegree, sh1Uint32Buffer, sh2Uint32Buffer } = this;
    const o = i * 4;
    if (shDegree >= 1) {
      decode111011s(sh1Uint32Buffer[o + 0], shN, 0);
      decode111011s(sh1Uint32Buffer[o + 1], shN, 3);
      decode111011s(sh1Uint32Buffer[o + 2], shN, 6);
    }
    if (shDegree >= 2) {
      decode111011s(sh1Uint32Buffer[o + 3], shN, 9);
      decode111011s(sh2Uint32Buffer[o + 0], shN, 12);
      decode111011s(sh2Uint32Buffer[o + 1], shN, 15);
      decode111011s(sh2Uint32Buffer[o + 2], shN, 18);
      decode111011s(sh2Uint32Buffer[o + 3], shN, 21);
    }
    if (shDegree >= 3) {
      const { sh3Uint32Buffer, sh4Uint32Buffer } = this;
      decode111011s(sh3Uint32Buffer[o + 0], shN, 24);
      decode111011s(sh3Uint32Buffer[o + 1], shN, 27);
      decode111011s(sh3Uint32Buffer[o + 2], shN, 30);
      decode111011s(sh3Uint32Buffer[o + 3], shN, 33);
      decode111011s(sh4Uint32Buffer[o + 0], shN, 36);
      decode111011s(sh4Uint32Buffer[o + 1], shN, 39);
      decode111011s(sh4Uint32Buffer[o + 2], shN, 42);
    }
  }
  fillCenters(centers) {
    const { counts, splat1Float32Buffer } = this;
    for (let i = 0; i < counts; i++) {
      const i3 = i * 3;
      const i4 = i * 4;
      centers[i3 + 0] = splat1Float32Buffer[i4 + 0];
      centers[i3 + 1] = splat1Float32Buffer[i4 + 1];
      centers[i3 + 2] = splat1Float32Buffer[i4 + 2];
    }
  }
  serialize() {
    return {
      counts: this.counts,
      shDegree: this.shDegree,
      samplers: [
        this.splat1Sampler,
        this.splat2Sampler,
        this.sh1Sampler,
        this.sh2Sampler,
        this.sh3Sampler,
        this.sh4Sampler
      ]
    };
  }
  deserialize(data) {
    const { counts, shDegree, samplers } = data;
    this.counts = counts;
    this.shDegree = shDegree;
    const { w: width, h: height, d: depth } = computeTextureSize(counts, this.maxTextureSize);
    const pixelCounts = width * height * depth;
    const splat1Sampler = this.splat1Sampler = samplers[0] ?? {
      width,
      height,
      depth,
      format: 1 /* RGBA_UINT */,
      source: new Uint8Array(16 * pixelCounts)
    };
    this.splat1Float32Buffer = new Float32Array(splat1Sampler.source.buffer);
    this.splat1Uint16Buffer = new Uint16Array(splat1Sampler.source.buffer);
    const splat2Sampler = this.splat2Sampler = samplers[1] ?? {
      width,
      height,
      depth,
      format: 1 /* RGBA_UINT */,
      source: new Uint8Array(16 * pixelCounts)
    };
    this.splat2Uint16Buffer = new Uint16Array(splat2Sampler.source.buffer);
    this.splat2Uint32Buffer = new Uint32Array(splat2Sampler.source.buffer);
    const sh1Sampler = this.sh1Sampler = samplers[2] ?? {
      width,
      height,
      depth,
      format: 1 /* RGBA_UINT */,
      source: new Uint8Array((shDegree >= 1 ? 16 : 0) * pixelCounts)
    };
    this.sh1Uint32Buffer = new Uint32Array(sh1Sampler.source.buffer);
    const sh2Sampler = this.sh2Sampler = samplers[3] ?? {
      width,
      height,
      depth,
      format: 1 /* RGBA_UINT */,
      source: new Uint8Array((shDegree >= 2 ? 16 : 0) * pixelCounts)
    };
    this.sh2Uint32Buffer = new Uint32Array(sh2Sampler.source.buffer);
    const sh3Sampler = this.sh3Sampler = samplers[4] ?? {
      width,
      height,
      depth,
      format: 1 /* RGBA_UINT */,
      source: new Uint8Array((shDegree >= 3 ? 16 : 0) * pixelCounts)
    };
    this.sh3Uint32Buffer = new Uint32Array(sh3Sampler.source.buffer);
    const sh4Sampler = this.sh4Sampler = samplers[5] ?? {
      width,
      height,
      depth,
      format: 1 /* RGBA_UINT */,
      source: new Uint8Array((shDegree >= 3 ? 16 : 0) * pixelCounts)
    };
    this.sh4Uint32Buffer = new Uint32Array(sh4Sampler.source.buffer);
  }
};

// ../../external/egs-core/packages/loaders/splat-loader/splat/SuperCompressedSplatData.ts
function packSint5x9ToUint32x2(data, out, offset) {
  const q0 = (data[0] * 16 + 16.5 | 0) & 31;
  const q1 = (data[1] * 16 + 16.5 | 0) & 31;
  const q2 = (data[2] * 16 + 16.5 | 0) & 31;
  const q3 = (data[3] * 16 + 16.5 | 0) & 31;
  const q4 = (data[4] * 16 + 16.5 | 0) & 31;
  const q5 = (data[5] * 16 + 16.5 | 0) & 31;
  const q6 = (data[6] * 16 + 16.5 | 0) & 31;
  const q7 = (data[7] * 16 + 16.5 | 0) & 31;
  const q8 = (data[8] * 16 + 16.5 | 0) & 31;
  let low = 0;
  let high = 0;
  low |= q0 << 0;
  low |= q1 << 5;
  low |= q2 << 10;
  low |= q3 << 15;
  low |= q4 << 20;
  low |= q5 << 25;
  low |= (q6 & 3) << 30;
  high |= q6 >>> 2;
  high |= q7 << 3;
  high |= q8 << 8;
  out[offset] = low;
  out[offset + 1] = high;
}
function unpackSint5x9FromUint32x2(low, high, out, offset) {
  out[offset + 0] = ((low >>> 0 & 31) - 16) * 0.0625;
  out[offset + 1] = ((low >>> 5 & 31) - 16) * 0.0625;
  out[offset + 2] = ((low >>> 10 & 31) - 16) * 0.0625;
  out[offset + 3] = ((low >>> 15 & 31) - 16) * 0.0625;
  out[offset + 4] = ((low >>> 20 & 31) - 16) * 0.0625;
  out[offset + 5] = ((low >>> 25 & 31) - 16) * 0.0625;
  const lowBits = low >>> 30 & 3;
  const highBits = (high & 7) << 2;
  out[offset + 6] = ((lowBits | highBits) - 16) * 0.0625;
  out[offset + 7] = ((high >>> 3 & 31) - 16) * 0.0625;
  out[offset + 8] = ((high >>> 8 & 31) - 16) * 0.0625;
}
function packSint4ToUint8(v0, v1) {
  const l = (v0 * 8 + 8.5 | 0) & 15;
  const h = (v1 * 8 + 8.5 | 0) & 15;
  return h << 4 | l;
}
function unpackUint8ToSint4x2(value, out, offset) {
  out[offset] = (value & 15) * 0.125 - 1;
  out[offset + 1] = (value >> 4 & 15) * 0.125 - 1;
}
function toUnsignedChar(v) {
  return clamp(v * 128 + 128.5 | 0, 0, 255);
}
function fromUnsignedChar(v) {
  return (v - 128) / 128;
}
function toUnsignedCharV2(v) {
  return clamp(v * 255 + 0.5 | 0, 0, 255);
}
var LN_SCALE_MIN = -12;
var LN_SCALE_MAX = 9;
var LN_SCALE = 254 / (LN_SCALE_MAX - LN_SCALE_MIN);
var LN_SCALE_INV = 1 / LN_SCALE;
var SuperCompressedSplatData = class extends SplatData {
  constructor() {
    super(...arguments);
    this.counts = 0;
    this.shDegree = 0;
  }
  init(counts, shDegree) {
    this.counts = counts;
    this.shDegree = Math.min(shDegree, this.maxShDegree);
    const { w: width, h: height, d: depth } = computeTextureSize(counts, this.maxTextureSize);
    const pixelCounts = width * height * depth;
    const splatSampler = this.splatSampler = {
      width,
      height,
      depth,
      format: 1 /* RGBA_UINT */,
      source: new Uint8Array(16 * pixelCounts)
    };
    this.splatUint8Buffer = splatSampler.source;
    this.splatUint16Buffer = new Uint16Array(splatSampler.source.buffer);
    const sh1Sampler = this.sh1Sampler = {
      width,
      height,
      depth,
      format: shDegree === 1 ? 0 /* RG_UINT */ : 1 /* RGBA_UINT */,
      source: new Uint8Array((shDegree >= 1 ? shDegree === 1 ? 8 : 16 : 0) * pixelCounts)
    };
    this.sh1Uint8Buffer = sh1Sampler.source;
    this.sh1Uint32Buffer = new Uint32Array(sh1Sampler.source.buffer);
    const sh2Sampler = this.sh2Sampler = {
      width,
      height,
      depth,
      format: 1 /* RGBA_UINT */,
      source: new Uint8Array((shDegree >= 3 ? 16 : 0) * pixelCounts)
    };
    this.sh2Uint8Buffer = sh2Sampler.source;
  }
  set(i, single) {
    const { splatUint16Buffer, splatUint8Buffer } = this;
    const i8 = i * 8;
    const i16 = i * 16;
    splatUint16Buffer[i8 + 0] = toHalf(single.x);
    splatUint16Buffer[i8 + 1] = toHalf(single.y);
    splatUint16Buffer[i8 + 2] = toHalf(single.z);
    splatUint8Buffer[i16 + 6] = clamp((Math.log(single.sx) - LN_SCALE_MIN) * LN_SCALE + 1.5 | 0, 0, 255);
    splatUint8Buffer[i16 + 7] = clamp((Math.log(single.sy) - LN_SCALE_MIN) * LN_SCALE + 1.5 | 0, 0, 255);
    splatUint8Buffer[i16 + 8] = clamp((Math.log(single.sz) - LN_SCALE_MIN) * LN_SCALE + 1.5 | 0, 0, 255);
    const oct = encodeQuatOct(single.qx, single.qy, single.qz, single.qw);
    splatUint8Buffer[i16 + 9] = toUnsignedChar(oct[0]);
    splatUint8Buffer[i16 + 10] = toUnsignedChar(oct[1]);
    splatUint8Buffer[i16 + 11] = toUnsignedCharV2(oct[2]);
    splatUint8Buffer[i16 + 12] = toUnsignedCharV2(single.r);
    splatUint8Buffer[i16 + 13] = toUnsignedCharV2(single.g);
    splatUint8Buffer[i16 + 14] = toUnsignedCharV2(single.b);
    splatUint8Buffer[i16 + 15] = toUnsignedCharV2(single.a);
  }
  setCenter(i, x, y, z) {
    const { splatUint16Buffer } = this;
    const offset = i * 8;
    splatUint16Buffer[offset + 0] = toHalf(x);
    splatUint16Buffer[offset + 1] = toHalf(y);
    splatUint16Buffer[offset + 2] = toHalf(z);
  }
  setScale(i, sx, sy, sz) {
    const { splatUint8Buffer } = this;
    const offset = i * 16;
    splatUint8Buffer[offset + 6] = clamp((Math.log(sx) - LN_SCALE_MIN) * LN_SCALE + 1.5 | 0, 0, 255);
    splatUint8Buffer[offset + 7] = clamp((Math.log(sy) - LN_SCALE_MIN) * LN_SCALE + 1.5 | 0, 0, 255);
    splatUint8Buffer[offset + 8] = clamp((Math.log(sz) - LN_SCALE_MIN) * LN_SCALE + 1.5 | 0, 0, 255);
  }
  setQuat(i, qx, qy, qz, qw) {
    const { splatUint8Buffer } = this;
    const offset = i * 16;
    const oct = encodeQuatOct(qx, qy, qz, qw);
    splatUint8Buffer[offset + 9] = toUnsignedChar(oct[0]);
    splatUint8Buffer[offset + 10] = toUnsignedChar(oct[1]);
    splatUint8Buffer[offset + 11] = toUnsignedCharV2(oct[2]);
  }
  setColor(i, r, g, b) {
    const { splatUint8Buffer } = this;
    const offset = i * 16;
    splatUint8Buffer[offset + 12] = toUnsignedCharV2(r);
    splatUint8Buffer[offset + 13] = toUnsignedCharV2(g);
    splatUint8Buffer[offset + 14] = toUnsignedCharV2(b);
  }
  setAlpha(i, a) {
    const { splatUint8Buffer } = this;
    const offset = i * 16;
    splatUint8Buffer[offset + 15] = toUnsignedCharV2(a);
  }
  setShN(i, shN) {
    const { shDegree, sh1Uint32Buffer, sh1Uint8Buffer, sh2Uint8Buffer } = this;
    if (shDegree >= 1) {
      const offset = (shDegree === 1 ? 2 : 4) * i;
      packSint5x9ToUint32x2(shN, sh1Uint32Buffer, offset);
    }
    if (shDegree >= 2) {
      const offset = 16 * i + 8;
      sh1Uint8Buffer[offset + 0] = packSint4ToUint8(shN[9], shN[10]);
      sh1Uint8Buffer[offset + 1] = packSint4ToUint8(shN[11], shN[12]);
      sh1Uint8Buffer[offset + 2] = packSint4ToUint8(shN[13], shN[14]);
      sh1Uint8Buffer[offset + 3] = packSint4ToUint8(shN[15], shN[16]);
      sh1Uint8Buffer[offset + 4] = packSint4ToUint8(shN[17], shN[18]);
      sh1Uint8Buffer[offset + 5] = packSint4ToUint8(shN[19], shN[20]);
      sh1Uint8Buffer[offset + 6] = packSint4ToUint8(shN[21], shN[22]);
      sh1Uint8Buffer[offset + 7] = packSint4ToUint8(shN[23], 0);
    }
    if (shDegree >= 3) {
      const offset = 16 * i;
      sh2Uint8Buffer[offset + 0] = packSint4ToUint8(shN[24], shN[25]);
      sh2Uint8Buffer[offset + 1] = packSint4ToUint8(shN[26], shN[27]);
      sh2Uint8Buffer[offset + 2] = packSint4ToUint8(shN[28], shN[29]);
      sh2Uint8Buffer[offset + 3] = packSint4ToUint8(shN[30], shN[31]);
      sh2Uint8Buffer[offset + 4] = packSint4ToUint8(shN[32], shN[33]);
      sh2Uint8Buffer[offset + 5] = packSint4ToUint8(shN[34], shN[35]);
      sh2Uint8Buffer[offset + 6] = packSint4ToUint8(shN[36], shN[37]);
      sh2Uint8Buffer[offset + 7] = packSint4ToUint8(shN[38], shN[39]);
      sh2Uint8Buffer[offset + 8] = packSint4ToUint8(shN[40], shN[41]);
      sh2Uint8Buffer[offset + 9] = packSint4ToUint8(shN[42], shN[43]);
      sh2Uint8Buffer[offset + 10] = packSint4ToUint8(shN[44], 0);
    }
  }
  get(i, single) {
    const { splatUint16Buffer, splatUint8Buffer } = this;
    const i8 = i * 8;
    const i16 = i * 16;
    single.x = fromHalf(splatUint16Buffer[i8 + 0]);
    single.y = fromHalf(splatUint16Buffer[i8 + 1]);
    single.z = fromHalf(splatUint16Buffer[i8 + 2]);
    const uScaleX = splatUint8Buffer[i16 + 6];
    const uScaleY = splatUint8Buffer[i16 + 7];
    const uScaleZ = splatUint8Buffer[i16 + 8];
    single.sx = Math.exp(LN_SCALE_MIN + (uScaleX - 1) * LN_SCALE_INV);
    single.sy = Math.exp(LN_SCALE_MIN + (uScaleY - 1) * LN_SCALE_INV);
    single.sz = Math.exp(LN_SCALE_MIN + (uScaleZ - 1) * LN_SCALE_INV);
    const u = fromUnsignedChar(splatUint8Buffer[i16 + 9]);
    const v = fromUnsignedChar(splatUint8Buffer[i16 + 10]);
    const angle = splatUint8Buffer[i16 + 11] / 255;
    const quat = decodeQuatOct(u, v, angle);
    single.qx = quat[0];
    single.qy = quat[1];
    single.qz = quat[2];
    single.qw = quat[3];
    single.r = splatUint8Buffer[i16 + 12] / 255;
    single.g = splatUint8Buffer[i16 + 13] / 255;
    single.b = splatUint8Buffer[i16 + 14] / 255;
    single.a = splatUint8Buffer[i16 + 15] / 255;
  }
  getCenter(i, single) {
    const { splatUint16Buffer } = this;
    const i8 = i * 8;
    single.x = fromHalf(splatUint16Buffer[i8 + 0]);
    single.y = fromHalf(splatUint16Buffer[i8 + 1]);
    single.z = fromHalf(splatUint16Buffer[i8 + 2]);
  }
  getScale(i, single) {
    const { splatUint8Buffer } = this;
    const i16 = i * 16;
    const uScaleX = splatUint8Buffer[i16 + 6];
    const uScaleY = splatUint8Buffer[i16 + 7];
    const uScaleZ = splatUint8Buffer[i16 + 8];
    single.sx = Math.exp(LN_SCALE_MIN + (uScaleX - 1) * LN_SCALE_INV);
    single.sy = Math.exp(LN_SCALE_MIN + (uScaleY - 1) * LN_SCALE_INV);
    single.sz = Math.exp(LN_SCALE_MIN + (uScaleZ - 1) * LN_SCALE_INV);
  }
  getQuat(i, single) {
    const { splatUint8Buffer } = this;
    const i16 = i * 16;
    const u = fromUnsignedChar(splatUint8Buffer[i16 + 9]);
    const v = fromUnsignedChar(splatUint8Buffer[i16 + 10]);
    const angle = splatUint8Buffer[i16 + 11] / 255;
    const quat = decodeQuatOct(u, v, angle);
    single.qx = quat[0];
    single.qy = quat[1];
    single.qz = quat[2];
    single.qw = quat[3];
  }
  getColor(i, single) {
    const { splatUint8Buffer } = this;
    const i16 = i * 16;
    single.r = splatUint8Buffer[i16 + 12] / 255;
    single.g = splatUint8Buffer[i16 + 13] / 255;
    single.b = splatUint8Buffer[i16 + 14] / 255;
  }
  getAlpha(i, single) {
    const { splatUint8Buffer } = this;
    const i16 = i * 16;
    single.a = splatUint8Buffer[i16 + 15] / 255;
  }
  getShN(i, shN) {
    const { shDegree, sh1Uint32Buffer, sh1Uint8Buffer, sh2Uint8Buffer } = this;
    if (shDegree >= 1) {
      const offset = (shDegree === 1 ? 2 : 4) * i;
      const low = sh1Uint32Buffer[offset];
      const high = sh1Uint32Buffer[offset + 1];
      unpackSint5x9FromUint32x2(low, high, shN, 0);
    }
    if (shDegree >= 2) {
      const offset = 16 * i + 8;
      unpackUint8ToSint4x2(sh1Uint8Buffer[offset + 0], shN, 9);
      unpackUint8ToSint4x2(sh1Uint8Buffer[offset + 1], shN, 11);
      unpackUint8ToSint4x2(sh1Uint8Buffer[offset + 2], shN, 13);
      unpackUint8ToSint4x2(sh1Uint8Buffer[offset + 3], shN, 15);
      unpackUint8ToSint4x2(sh1Uint8Buffer[offset + 5], shN, 17);
      unpackUint8ToSint4x2(sh1Uint8Buffer[offset + 6], shN, 19);
      unpackUint8ToSint4x2(sh1Uint8Buffer[offset + 7], shN, 21);
      shN[23] = (sh2Uint8Buffer[offset + 8] & 15) * 0.125 - 1;
    }
    if (shDegree >= 3) {
      const offset = 16 * i;
      unpackUint8ToSint4x2(sh2Uint8Buffer[offset + 0], shN, 24);
      unpackUint8ToSint4x2(sh2Uint8Buffer[offset + 1], shN, 26);
      unpackUint8ToSint4x2(sh2Uint8Buffer[offset + 2], shN, 28);
      unpackUint8ToSint4x2(sh2Uint8Buffer[offset + 3], shN, 30);
      unpackUint8ToSint4x2(sh2Uint8Buffer[offset + 4], shN, 32);
      unpackUint8ToSint4x2(sh2Uint8Buffer[offset + 5], shN, 34);
      unpackUint8ToSint4x2(sh2Uint8Buffer[offset + 6], shN, 36);
      unpackUint8ToSint4x2(sh2Uint8Buffer[offset + 7], shN, 38);
      unpackUint8ToSint4x2(sh2Uint8Buffer[offset + 8], shN, 40);
      unpackUint8ToSint4x2(sh2Uint8Buffer[offset + 9], shN, 42);
      shN[44] = (sh2Uint8Buffer[offset + 10] & 15) * 0.125 - 1;
    }
  }
  fillCenters(centers) {
    const { counts, splatUint16Buffer } = this;
    for (let i = 0; i < counts; i++) {
      const i3 = i * 3;
      const i8 = i * 8;
      centers[i3 + 0] = fromHalf(splatUint16Buffer[i8 + 0]);
      centers[i3 + 1] = fromHalf(splatUint16Buffer[i8 + 1]);
      centers[i3 + 2] = fromHalf(splatUint16Buffer[i8 + 2]);
    }
  }
  serialize() {
    return {
      counts: this.counts,
      shDegree: this.shDegree,
      samplers: [this.splatSampler, this.sh1Sampler, this.sh2Sampler]
    };
  }
  deserialize(data) {
    const { counts, shDegree, samplers } = data;
    this.counts = counts;
    this.shDegree = shDegree;
    const { w: width, h: height, d: depth } = computeTextureSize(counts, this.maxTextureSize);
    const pixelCounts = width * height * depth;
    const splatSampler = this.splatSampler = samplers[0] ?? {
      width,
      height,
      depth,
      format: 1 /* RGBA_UINT */,
      source: new Uint8Array(16 * pixelCounts)
    };
    this.splatUint8Buffer = new Uint8Array(splatSampler.source.buffer);
    this.splatUint16Buffer = new Uint16Array(splatSampler.source.buffer);
    const sh1Sampler = this.sh1Sampler = samplers[1] ?? {
      width,
      height,
      depth,
      format: shDegree === 1 ? 0 /* RG_UINT */ : 1 /* RGBA_UINT */,
      source: new Uint8Array((shDegree >= 1 ? shDegree === 1 ? 8 : 16 : 0) * pixelCounts)
    };
    this.sh1Uint8Buffer = sh1Sampler.source;
    this.sh1Uint32Buffer = new Uint32Array(sh1Sampler.source.buffer);
    const sh2Sampler = this.sh2Sampler = samplers[2] ?? {
      width,
      height,
      depth,
      format: 1 /* RGBA_UINT */,
      source: new Uint8Array((shDegree >= 3 ? 16 : 0) * pixelCounts)
    };
    this.sh2Uint8Buffer = sh2Sampler.source;
  }
};

// ../../external/egs-core/packages/loaders/splat-loader/splat/SogSplatData.ts
var SogSplatData = class extends SplatData {
  constructor() {
    super(...arguments);
    this.counts = 0;
    this.shDegree = 0;
  }
  init(_counts, _shDegree) {
    throw new Error("Method not implemented.");
  }
  load(meta, meansL, meansU, quats, scales, colors, shNLabels, shNCentroids) {
    this.meta = meta;
    this.meansL = meansL;
    this.meansU = meansU;
    this.quats = quats;
    this.scales = scales;
    this.colors = colors;
    this.shNLabels = shNLabels;
    this.shNCentroids = shNCentroids;
  }
  set(_i, _single) {
    throw new Error("Method not implemented.");
  }
  setCenter(_i, _x, _y, _z) {
    throw new Error("Method not implemented.");
  }
  setScale(_i, _sx, _sy, _sz) {
    throw new Error("Method not implemented.");
  }
  setQuat(_i, _qx, _qy, _qz, _qw) {
    throw new Error("Method not implemented.");
  }
  setColor(_i, _r, _g, _b2) {
    throw new Error("Method not implemented.");
  }
  setAlpha(_i, _a2) {
    throw new Error("Method not implemented.");
  }
  setShN(_i, _shN) {
    throw new Error("Method not implemented.");
  }
  get(_i, _single) {
    throw new Error("Method not implemented.");
  }
  getCenter(_i, _single) {
    throw new Error("Method not implemented.");
  }
  getScale(_i, _single) {
    throw new Error("Method not implemented.");
  }
  getQuat(_i, _single) {
    throw new Error("Method not implemented.");
  }
  getColor(_i, _single) {
    throw new Error("Method not implemented.");
  }
  getAlpha(_i, _single) {
    throw new Error("Method not implemented.");
  }
  getShN(_i, _shN) {
    throw new Error("Method not implemented.");
  }
  fillCenters(_centers) {
    throw new Error("Method not implemented.");
  }
  serialize() {
    return {
      counts: this.meta.counts,
      shDegree: this.meta.shDegree,
      samplers: [
        this.meansL,
        this.meansU,
        this.quats,
        this.scales,
        this.colors,
        this.shNLabels,
        this.shNCentroids
      ].filter((v) => !!v).map((v) => ({
        width: 1,
        height: 1,
        depth: 1,
        format: 1 /* RGBA_UINT */,
        source: v
      })),
      extras: [this.meta]
    };
  }
  deserialize(data) {
    const { samplers, extras = [] } = data;
    this.meta = extras[0];
    this.meansL = samplers[0].source;
    this.meansU = samplers[1].source;
    this.quats = samplers[2].source;
    this.scales = samplers[3].source;
    this.colors = samplers[4].source;
    if (samplers[5]) {
      this.shNLabels = samplers[5].source;
    }
    if (samplers[6]) {
      this.shNCentroids = samplers[6].source;
    }
  }
};

// ../../external/egs-core/packages/loaders/splat-loader/file/utils.ts
var SH_C0 = 0.28209479177387814;
var SH_MAPS2 = {
  0: 0,
  1: 9,
  2: 24,
  3: 45
};
var NUM_F_REST_TO_SH_DEGREE = {
  0: 0,
  9: 1,
  24: 2,
  45: 3
};
var BufferReader = class {
  constructor(buffer = new Uint8Array()) {
    this.head = 0;
    this.tail = 0;
    this.buffer = buffer;
    this.view = new DataView(this.buffer.buffer);
  }
  get remaining() {
    return this.tail - this.head;
  }
  grow(required) {
    const newCap = Math.max(required, this.buffer.length * 2);
    const next = new Uint8Array(newCap);
    next.set(this.buffer.subarray(this.head, this.tail), 0);
    this.tail -= this.head;
    this.head = 0;
    this.buffer = next;
    this.view = new DataView(next.buffer);
  }
  compact() {
    if (this.head === 0) {
      return;
    }
    this.buffer.copyWithin(0, this.head, this.tail);
    this.tail -= this.head;
    this.head = 0;
  }
  write(chunk) {
    const remaining = this.tail - this.head;
    const required = remaining + chunk.length;
    if (this.buffer.length < required) {
      this.grow(required);
    } else if (this.head > 0 && this.buffer.length - this.tail < chunk.length) {
      this.compact();
    }
    this.buffer.set(chunk, this.tail);
    this.tail += chunk.length;
  }
  read(counts) {
    const head = this.head;
    const tail = this.head = head + counts;
    return this.buffer.subarray(head, tail);
  }
};
var StreamChunkDecoder = class {
  constructor(reader) {
    this.currentIndex = 0;
    this.reader = reader;
  }
  setDecoders(decoders) {
    this.decoders = decoders;
    this.decodedTotals = new Uint32Array(decoders.length);
    const [totals, itemSize] = decoders[this.currentIndex].init();
    this.currentTotals = totals;
    this.currentItemSize = itemSize;
  }
  flush() {
    const { reader, decoders, decodedTotals, currentIndex, currentTotals, currentItemSize } = this;
    const stage = decoders[currentIndex];
    const decoded = decodedTotals[currentIndex];
    const counts = Math.min(currentTotals - decoded, reader.remaining / currentItemSize | 0);
    const buf = reader.read(counts * currentItemSize);
    stage.decode(decoded, counts, buf);
    decodedTotals[currentIndex] += counts;
    if (decodedTotals[currentIndex] === currentTotals) {
      this.currentIndex++;
      if (this.currentIndex < decoders.length) {
        const [totals, itemSize] = decoders[this.currentIndex].init();
        this.currentTotals = totals;
        this.currentItemSize = itemSize;
        this.flush();
      }
    }
  }
};
var f32buffer2 = new Float32Array(1);
var u32buffer2 = new Uint32Array(f32buffer2.buffer);
function fromHalf2(h) {
  const sign = h >> 15 & 1;
  const exp = h >> 10 & 31;
  const frac = h & 1023;
  let f32bits;
  if (exp === 0) {
    if (frac === 0) {
      f32bits = sign << 31;
    } else {
      let mant = frac;
      let e = -14;
      while ((mant & 1024) === 0) {
        mant <<= 1;
        e--;
      }
      mant &= 1023;
      const newExp = e + 127;
      const newFrac = mant << 13;
      f32bits = sign << 31 | newExp << 23 | newFrac;
    }
  } else if (exp === 31) {
    if (frac === 0) {
      f32bits = sign << 31 | 2139095040;
    } else {
      f32bits = sign << 31 | 2143289344;
    }
  } else {
    const newExp = exp - 15 + 127;
    const newFrac = frac << 13;
    f32bits = sign << 31 | newExp << 23 | newFrac;
  }
  u32buffer2[0] = f32bits;
  return f32buffer2[0];
}
function clamp2(v, min, max2) {
  return Math.min(Math.max(v, min), max2);
}
function isUrl(str) {
  let url;
  try {
    url = new URL(str);
  } catch {
    return false;
  }
  return url.protocol === "http:" || url.protocol === "https:";
}
var canvas;
var context;
async function decodeImage(fileBytes) {
  if (!context) {
    canvas = new OffscreenCanvas(1, 1);
    context = canvas.getContext("2d", { willReadFrequently: true }) ?? void 0;
  }
  if (!context) {
    throw new Error("Failed to create context");
  }
  const imageBlob = new Blob([fileBytes]);
  const bitmap = await createImageBitmap(imageBlob, {
    premultiplyAlpha: "none"
  });
  const { width, height } = bitmap;
  canvas.width = width;
  canvas.height = height;
  context.drawImage(bitmap, 0, 0, width, height);
  const data = context.getImageData(0, 0, width, height);
  return {
    data: new Uint8Array(data.data.buffer, data.data.byteOffset, data.data.length),
    width,
    height
  };
}
function extractFromRootDir(entries) {
  let dir = "";
  for (const path in entries) {
    if (path.endsWith("/")) {
      dir = path;
      break;
    }
  }
  const result = {};
  for (const path in entries) {
    result[path.replace(dir, "")] = entries[path];
  }
  return result;
}

// ../../external/egs-core/packages/loaders/splat-loader/file/ksplat.ts
var KSPLAT_COMPRESSION = {
  0: {
    bytesPerCenter: 12,
    bytesPerScale: 12,
    bytesPerRotation: 16,
    bytesPerColor: 4,
    bytesPerSphericalHarmonicsComponent: 4,
    scaleOffsetBytes: 12,
    rotationOffsetBytes: 24,
    colorOffsetBytes: 40,
    sphericalHarmonicsOffsetBytes: 44,
    scaleRange: 1
  },
  1: {
    bytesPerCenter: 6,
    bytesPerScale: 6,
    bytesPerRotation: 8,
    bytesPerColor: 4,
    bytesPerSphericalHarmonicsComponent: 2,
    scaleOffsetBytes: 6,
    rotationOffsetBytes: 12,
    colorOffsetBytes: 20,
    sphericalHarmonicsOffsetBytes: 24,
    scaleRange: 32767
  },
  2: {
    bytesPerCenter: 6,
    bytesPerScale: 6,
    bytesPerRotation: 8,
    bytesPerColor: 4,
    bytesPerSphericalHarmonicsComponent: 1,
    scaleOffsetBytes: 6,
    rotationOffsetBytes: 12,
    colorOffsetBytes: 20,
    sphericalHarmonicsOffsetBytes: 24,
    scaleRange: 32767
  }
};
var SHIndex = [
  0,
  3,
  6,
  1,
  4,
  7,
  2,
  5,
  8,
  // sh1
  9,
  14,
  19,
  10,
  15,
  20,
  11,
  16,
  21,
  12,
  17,
  22,
  13,
  18,
  23,
  // sh2
  24,
  31,
  38,
  25,
  32,
  39,
  26,
  33,
  40,
  27,
  34,
  41,
  28,
  35,
  42,
  29,
  36,
  43,
  30,
  37,
  44
  // sh3
];
var HEADER_BYTES = 4096;
var SECTION_BYTES = 1024;
var KsplatFile = class {
  constructor() {
    this.counts = 0;
    this.shDegree = 0;
  }
  load(buffer) {
    this.buffer = buffer;
    const header = new DataView(buffer.buffer, 0, HEADER_BYTES);
    const versionMajor = header.getUint8(0);
    const versionMinor = header.getUint8(1);
    if (versionMajor !== 0 || versionMinor < 1) {
      throw new Error(`Unsupported .ksplat version: ${versionMajor}.${versionMinor}`);
    }
    const maxSectionCount = header.getUint32(4, true);
    const sectionCount = header.getUint32(8, true);
    const maxSplatCount = header.getUint32(12, true);
    const splatCount = header.getUint32(16, true);
    const compressionLevel = header.getUint16(20, true);
    if (compressionLevel < 0 || compressionLevel > 2) {
      throw new Error(`Invalid .ksplat compression level: ${compressionLevel}`);
    }
    const sceneCenterX = header.getFloat32(24, true);
    const sceneCenterY = header.getFloat32(28, true);
    const sceneCenterZ = header.getFloat32(32, true);
    const minSH = header.getFloat32(36, true) || -1.5;
    const maxSH = header.getFloat32(40, true) || 1.5;
    let maxSHDegree = 0;
    const sections = [];
    for (let i = 0; i < maxSectionCount; i++) {
      const section = new DataView(buffer.buffer, HEADER_BYTES + i * SECTION_BYTES, SECTION_BYTES);
      const sectionSplatCount = section.getUint32(0, true);
      const sectionMaxSplatCount = section.getUint32(4, true);
      const bucketSize = section.getUint32(8, true);
      const bucketCount = section.getUint32(12, true);
      const bucketBlockSize = section.getFloat32(16, true);
      const bucketStorageSizeBytes = section.getUint16(20, true);
      const compressionScaleRange = section.getUint32(24, true);
      const fullBucketCount = section.getUint32(32, true);
      const partiallyFilledBucketCount = section.getUint32(36, true);
      const shDegree = section.getUint16(40, true);
      maxSHDegree = Math.max(maxSHDegree, shDegree);
      sections.push({
        sectionSplatCount,
        sectionMaxSplatCount,
        bucketSize,
        bucketCount,
        bucketBlockSize,
        bucketStorageSizeBytes,
        compressionScaleRange: compressionScaleRange || KSPLAT_COMPRESSION[compressionLevel].scaleRange,
        fullBucketCount,
        partiallyFilledBucketCount,
        shDegree
      });
    }
    this.header = {
      versionMajor,
      versionMinor,
      maxSectionCount,
      sectionCount,
      maxSplatCount,
      splatCount,
      compressionLevel,
      sceneCenter: [sceneCenterX, sceneCenterY, sceneCenterZ],
      shRange: [minSH, maxSH]
    };
    this.sections = sections;
    this.counts = splatCount;
    this.shDegree = maxSHDegree;
  }
  async read(stream, contentLength, data) {
    let BlockOffset = 0;
    {
      const buffer2 = new Uint8Array(contentLength);
      const reader = stream.getReader();
      let offset = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer2.set(value, offset);
        offset += value.length;
      }
      this.load(buffer2);
      BlockOffset = await data.initBlock(this.counts, this.shDegree);
    }
    const setFn = data.set.bind(data);
    const setShFn = data.setShN.bind(data);
    const { buffer, header, sections, shDegree: maxSHDegree } = this;
    const { maxSectionCount, compressionLevel, shRange: [minSH, maxSH] } = header;
    const isHighQualitySplatData = compressionLevel === 0;
    const single = {
      x: 0,
      y: 0,
      z: 0,
      sx: 0,
      sy: 0,
      sz: 0,
      qx: 0,
      qy: 0,
      qz: 0,
      qw: 0,
      r: 0,
      g: 0,
      b: 0,
      a: 0,
      shN: []
    };
    const maxSHSize = SH_MAPS2[maxSHDegree];
    const shData = new Array(maxSHSize);
    let sectionBase = HEADER_BYTES + maxSectionCount * SECTION_BYTES;
    for (let i = 0; i < maxSectionCount; i++) {
      const {
        sectionSplatCount,
        sectionMaxSplatCount,
        bucketSize,
        bucketCount,
        bucketBlockSize,
        bucketStorageSizeBytes,
        fullBucketCount,
        partiallyFilledBucketCount,
        compressionScaleRange,
        shDegree
      } = sections[i];
      const fullBucketSplats = fullBucketCount * bucketSize;
      const bucketsMetaDataSizeBytes = partiallyFilledBucketCount * 4;
      const bucketsStorageSizeBytes = bucketStorageSizeBytes * bucketCount + bucketsMetaDataSizeBytes;
      const shComponents = SH_MAPS2[shDegree];
      const {
        bytesPerCenter,
        bytesPerScale,
        bytesPerRotation,
        bytesPerColor,
        bytesPerSphericalHarmonicsComponent,
        scaleOffsetBytes,
        rotationOffsetBytes,
        colorOffsetBytes,
        sphericalHarmonicsOffsetBytes
      } = KSPLAT_COMPRESSION[compressionLevel];
      const bytesPerSplat = bytesPerCenter + bytesPerScale + bytesPerRotation + bytesPerColor + shComponents * bytesPerSphericalHarmonicsComponent;
      const splatDataStorageSizeBytes = bytesPerSplat * sectionMaxSplatCount;
      const storageSizeBytes = splatDataStorageSizeBytes + bucketsStorageSizeBytes;
      const compressionScaleFactor = bucketBlockSize / 2 / compressionScaleRange;
      const bucketsBase = sectionBase + bucketsMetaDataSizeBytes;
      const dataBase = sectionBase + bucketsStorageSizeBytes;
      const data2 = new DataView(buffer.buffer, dataBase, splatDataStorageSizeBytes);
      const bucketArray = new Float32Array(buffer.buffer, bucketsBase, bucketCount * 3);
      const partiallyFilledBucketLengths = new Uint32Array(buffer.buffer, sectionBase, partiallyFilledBucketCount);
      let partialBucketIndex = fullBucketCount;
      let partialBucketBase = fullBucketSplats;
      for (let j = 0; j < sectionSplatCount; j++) {
        const splatOffset = j * bytesPerSplat;
        let bucketIndex;
        if (j < fullBucketSplats) {
          bucketIndex = Math.floor(j / bucketSize);
        } else {
          const bucketLength = partiallyFilledBucketLengths[partialBucketIndex - fullBucketCount];
          if (j >= partialBucketBase + bucketLength) {
            partialBucketIndex += 1;
            partialBucketBase += bucketLength;
          }
          bucketIndex = partialBucketIndex;
        }
        if (isHighQualitySplatData) {
          single.x = data2.getFloat32(splatOffset + 0, true);
          single.y = data2.getFloat32(splatOffset + 4, true);
          single.z = data2.getFloat32(splatOffset + 8, true);
          single.sx = data2.getFloat32(splatOffset + scaleOffsetBytes + 0, true);
          single.sy = data2.getFloat32(splatOffset + scaleOffsetBytes + 4, true);
          single.sz = data2.getFloat32(splatOffset + scaleOffsetBytes + 8, true);
          single.qw = data2.getFloat32(splatOffset + rotationOffsetBytes + 0, true);
          single.qx = data2.getFloat32(splatOffset + rotationOffsetBytes + 4, true);
          single.qy = data2.getFloat32(splatOffset + rotationOffsetBytes + 8, true);
          single.qz = data2.getFloat32(splatOffset + rotationOffsetBytes + 12, true);
        } else {
          single.x = (data2.getUint16(splatOffset + 0, true) - compressionScaleRange) * compressionScaleFactor + bucketArray[3 * bucketIndex + 0];
          single.y = (data2.getUint16(splatOffset + 2, true) - compressionScaleRange) * compressionScaleFactor + bucketArray[3 * bucketIndex + 1];
          single.z = (data2.getUint16(splatOffset + 4, true) - compressionScaleRange) * compressionScaleFactor + bucketArray[3 * bucketIndex + 2];
          single.sx = fromHalf2(data2.getUint16(splatOffset + scaleOffsetBytes + 0, true));
          single.sy = fromHalf2(data2.getUint16(splatOffset + scaleOffsetBytes + 2, true));
          single.sz = fromHalf2(data2.getUint16(splatOffset + scaleOffsetBytes + 4, true));
          single.qw = fromHalf2(data2.getUint16(splatOffset + rotationOffsetBytes + 0, true));
          single.qx = fromHalf2(data2.getUint16(splatOffset + rotationOffsetBytes + 2, true));
          single.qy = fromHalf2(data2.getUint16(splatOffset + rotationOffsetBytes + 4, true));
          single.qz = fromHalf2(data2.getUint16(splatOffset + rotationOffsetBytes + 6, true));
        }
        single.r = data2.getUint8(splatOffset + colorOffsetBytes + 0) / 255;
        single.g = data2.getUint8(splatOffset + colorOffsetBytes + 1) / 255;
        single.b = data2.getUint8(splatOffset + colorOffsetBytes + 2) / 255;
        single.a = data2.getUint8(splatOffset + colorOffsetBytes + 3) / 255;
        setFn(j + BlockOffset, single);
        const shOffsetBytes = splatOffset + sphericalHarmonicsOffsetBytes;
        for (let k = 0; k < shComponents; k++) {
          shData[k] = compressionLevel === 0 ? data2.getFloat32(shOffsetBytes + SHIndex[k] * 4, true) : compressionLevel === 1 ? fromHalf2(data2.getUint16(shOffsetBytes + SHIndex[k] * 2, true)) : minSH + data2.getUint8(shOffsetBytes + SHIndex[k]) / 255 * (maxSH - minSH);
        }
        for (let k = maxSHSize - 1; k >= shComponents; k--) {
          shData[k] = 0;
        }
        setShFn(j + BlockOffset, shData);
      }
      sectionBase += storageSizeBytes;
    }
    data.finishBlock();
  }
  async write(_stream, _data) {
    throw new Error("Method not implemented.");
  }
};

// ../../external/egs-core/packages/loaders/splat-loader/file/ply.ts
var F_REST_REGEX = /^f_rest_([0-9]{1,2})$/;
function createEmptyBlock(properties, shDegree) {
  const result = {
    f_rest: new Array(SH_MAPS2[shDegree])
  };
  for (const name of Object.keys(properties)) {
    if (F_REST_REGEX.test(name)) {
      continue;
    }
    result[name] = 0;
  }
  return result;
}
var FIELD_BYTES = {
  char: 1,
  uchar: 1,
  short: 2,
  ushort: 2,
  int: 4,
  uint: 4,
  float: 4,
  double: 8
};
function createParseFn(properties, littleEndian, shDegree) {
  function createPropertyParse(type) {
    switch (type) {
      case "char":
        return "data.getInt8(offset)";
      case "uchar":
        return "data.getUint8(offset)";
      case "short":
        return `data.getInt16(offset, ${littleEndian})`;
      case "ushort":
        return `data.getUint16(offset, ${littleEndian})`;
      case "int":
        return `data.getInt32(offset, ${littleEndian})`;
      case "uint":
        return `data.getUint32(offset, ${littleEndian})`;
      case "float":
        return `data.getFloat32(offset, ${littleEndian})`;
      case "double":
        return `data.getFloat64(offset, ${littleEndian})`;
    }
  }
  let itemSize = 0;
  const parserSrc = [];
  const shLen = SH_MAPS2[shDegree] / 3;
  for (const [propertyName, propertyType] of Object.entries(properties)) {
    const fRestMatch = propertyName.match(F_REST_REGEX);
    if (fRestMatch) {
      let fRestIndex = parseInt(fRestMatch[1], 10);
      fRestIndex = fRestIndex % shLen * 3 + Math.floor(fRestIndex / shLen);
      parserSrc.push(`item.f_rest[${fRestIndex}] = ${createPropertyParse(propertyType)};`);
    } else {
      parserSrc.push(`item.${propertyName} = ${createPropertyParse(propertyType)};`);
    }
    parserSrc.push(`offset += ${FIELD_BYTES[propertyType]};`);
    itemSize += FIELD_BYTES[propertyType];
  }
  return [itemSize, new Function("data", "offset", "item", parserSrc.join("\n"))];
}
var HeaderTerminator = "end_header\n";
var PlyFile = class {
  constructor() {
    this.littleEndian = true;
    this.comments = [];
    this.elements = {};
    this.isSuperSplatCompressed = false;
    this.counts = 0;
    this.shDegree = 0;
  }
  initHeader(header) {
    let curElement;
    const lines = header.trim().split("\n").map((v) => v.trim()).filter((v) => !!v);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (i === 0) {
        if (line !== "ply") {
          throw new Error("Invalid PLY header");
        }
        continue;
      }
      const fields = line.split(" ");
      switch (fields[0]) {
        case "format":
          if (fields[1] === "binary_little_endian") {
            this.littleEndian = true;
          } else if (fields[1] === "binary_big_endian") {
            this.littleEndian = false;
          } else {
            throw new Error(`Unsupported PLY format: ${fields[1]}`);
          }
          if (fields[2] !== "1.0") {
            throw new Error(`Unsupported PLY version: ${fields[2]}`);
          }
          break;
        case "comment":
          this.comments.push(line.slice("comment ".length));
          break;
        case "element": {
          const name = fields[1];
          curElement = this.elements[name] = {
            name,
            count: parseInt(fields[2], 10),
            properties: {}
          };
          break;
        }
        case "property":
          if (!curElement) {
            throw new Error("Property must be inside an element");
          }
          if (!FIELD_BYTES[fields[1]]) {
            throw new Error(`Unsupported property type '${fields[1]}'`);
          }
          curElement.properties[fields[2]] = fields[1];
          break;
        case "end_header":
          break;
        default:
          console.warn(`Skipping unsupported PLY keyword: ${fields[0]}`);
          break;
      }
    }
    const { elements } = this;
    const isSuperSplatCompressed = this.isSuperSplatCompressed = !!elements.chunk;
    this.counts = elements.vertex?.count ?? 0;
    const shElement = isSuperSplatCompressed ? elements.sh : elements.vertex;
    if (shElement) {
      const { properties } = shElement;
      let num_f_rest = 0;
      while (properties[`f_rest_${num_f_rest}`]) {
        num_f_rest += 1;
      }
      const shDegree = NUM_F_REST_TO_SH_DEGREE[num_f_rest];
      if (shDegree === void 0) {
        throw new Error(`Unsupported number of SH coefficients: ${num_f_rest}`);
      }
      this.shDegree = shDegree;
    }
    for (const name in elements) {
      const { properties } = elements[name];
      if (isSuperSplatCompressed) {
        if (name === "chunk") {
          const {
            min_x,
            min_y,
            min_z,
            max_x,
            max_y,
            max_z,
            min_scale_x,
            min_scale_y,
            min_scale_z,
            max_scale_x,
            max_scale_y,
            max_scale_z,
            min_r,
            min_g,
            min_b,
            max_r,
            max_g,
            max_b
          } = properties;
          if (!min_x || !min_y || !min_z || !max_x || !max_y || !max_z || !min_scale_x || !min_scale_y || !min_scale_z || !max_scale_x || !max_scale_y || !max_scale_z || !min_r || !min_g || !min_b || !max_r || !max_g || !max_b) {
            throw new Error("Missing Compressed PLY chunk properties");
          }
        } else if (name === "vertex") {
          const { packed_position, packed_rotation, packed_scale, packed_color } = properties;
          if (!packed_position || !packed_rotation || !packed_scale || !packed_color) {
            throw new Error("Missing Compressed PLY vertex properties");
          }
        }
      } else {
        if (name === "vertex") {
          const {
            x,
            y,
            z,
            scale_0,
            scale_1,
            scale_2,
            rot_0,
            rot_1,
            rot_2,
            rot_3,
            f_dc_0,
            f_dc_1,
            f_dc_2,
            opacity
          } = properties;
          if (!x || !y || !z || !scale_0 || !scale_1 || !scale_2 || !rot_0 || !rot_1 || !rot_2 || !rot_3 || !f_dc_0 || !f_dc_1 || !f_dc_2 || !opacity) {
            throw new Error("Missing PLY vertex properties");
          }
        }
      }
    }
  }
  async read(stream, _contentLength, data) {
    const setFn = data.set.bind(data);
    const setShFn = data.setShN.bind(data);
    let headerParsed = false;
    let header = "";
    const reader = new BufferReader();
    const decoder = new StreamChunkDecoder(reader);
    let BlockOffset = 0;
    const chunks = [];
    const single = {
      x: 0,
      y: 0,
      z: 0,
      sx: 0,
      sy: 0,
      sz: 0,
      qx: 0,
      qy: 0,
      qz: 0,
      qw: 0,
      r: 0,
      g: 0,
      b: 0,
      a: 0,
      shN: []
    };
    const initDecoder = () => {
      const { elements, littleEndian, isSuperSplatCompressed, shDegree } = this;
      const chunkDecoders = [];
      for (const name in elements) {
        const { count, properties } = elements[name];
        const block = createEmptyBlock(properties, shDegree);
        const [itemSize, parseFn] = createParseFn(properties, littleEndian, shDegree);
        let fn = () => {
        };
        if (isSuperSplatCompressed) {
          if (name === "chunk") {
            fn = (i, item) => {
              chunks[i - BlockOffset] = { ...item };
            };
          } else if (name === "sh") {
            fn = (i, item) => {
              setShFn(i, item.f_rest.map((v) => v * 8 / 255 - 4));
            };
          } else if (name === "vertex") {
            fn = (i, item) => {
              const chunk = chunks[i - BlockOffset >>> 8];
              if (!chunk) {
                throw new Error("Missing PLY chunk");
              }
              const {
                min_x,
                min_y,
                min_z,
                max_x,
                max_y,
                max_z,
                min_scale_x,
                min_scale_y,
                min_scale_z,
                max_scale_x,
                max_scale_y,
                max_scale_z,
                min_r,
                min_g,
                min_b,
                max_r,
                max_g,
                max_b
              } = chunk;
              const { packed_position, packed_rotation, packed_scale, packed_color } = item;
              single.x = (packed_position >>> 21 & 2047) / 2047 * (max_x - min_x) + min_x;
              single.y = (packed_position >>> 11 & 1023) / 1023 * (max_y - min_y) + min_y;
              single.z = (packed_position & 2047) / 2047 * (max_z - min_z) + min_z;
              const r0 = ((packed_rotation >>> 20 & 1023) / 1023 - 0.5) * Math.SQRT2;
              const r1 = ((packed_rotation >>> 10 & 1023) / 1023 - 0.5) * Math.SQRT2;
              const r2 = ((packed_rotation & 1023) / 1023 - 0.5) * Math.SQRT2;
              const rr = Math.sqrt(Math.max(0, 1 - r0 * r0 - r1 * r1 - r2 * r2));
              const rOrder = packed_rotation >>> 30;
              single.qx = rOrder === 0 ? r0 : rOrder === 1 ? rr : r1;
              single.qy = rOrder <= 1 ? r1 : rOrder === 2 ? rr : r2;
              single.qz = rOrder <= 2 ? r2 : rr;
              single.qw = rOrder === 0 ? rr : r0;
              single.sx = Math.exp((packed_scale >>> 21 & 2047) / 2047 * (max_scale_x - min_scale_x) + min_scale_x);
              single.sy = Math.exp((packed_scale >>> 11 & 1023) / 1023 * (max_scale_y - min_scale_y) + min_scale_y);
              single.sz = Math.exp((packed_scale & 2047) / 2047 * (max_scale_z - min_scale_z) + min_scale_z);
              single.r = (packed_color >>> 24 & 255) / 255 * (max_r - min_r) + min_r;
              single.g = (packed_color >>> 16 & 255) / 255 * (max_g - min_g) + min_g;
              single.b = (packed_color >>> 8 & 255) / 255 * (max_b - min_b) + min_b;
              single.a = (packed_color & 255) / 255;
              setFn(i, single);
            };
          }
        } else if (name === "vertex") {
          fn = (i, item) => {
            single.x = item.x;
            single.y = item.y;
            single.z = item.z;
            single.sx = Math.exp(item.scale_0);
            single.sy = Math.exp(item.scale_1);
            single.sz = Math.exp(item.scale_2);
            single.qx = item.rot_1;
            single.qy = item.rot_2;
            single.qz = item.rot_3;
            single.qw = item.rot_0;
            single.r = item.f_dc_0 * SH_C0 + 0.5;
            single.g = item.f_dc_1 * SH_C0 + 0.5;
            single.b = item.f_dc_2 * SH_C0 + 0.5;
            single.a = 1 / (1 + Math.exp(-item.opacity));
            setFn(i, single);
            setShFn(i, item.f_rest);
          };
        }
        chunkDecoders.push({
          init: () => [count, itemSize],
          decode: (offset, counts, buffer) => {
            offset += BlockOffset;
            const dataview = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
            for (let i = 0; i < counts; i++) {
              parseFn(dataview, i * itemSize, block);
              fn(offset + i, block);
            }
          }
        });
      }
      decoder.setDecoders(chunkDecoders);
    };
    const textDecoder = new TextDecoder();
    const source = stream.getReader();
    while (true) {
      const { done, value } = await source.read();
      if (done) {
        break;
      }
      reader.write(value);
      if (!headerParsed) {
        const HeaderReadBlockSize = 4096;
        const counts = Math.ceil(reader.remaining / HeaderReadBlockSize);
        for (let i = 0; i < counts; i++) {
          const chunk = reader.read(HeaderReadBlockSize);
          header += textDecoder.decode(chunk, { stream: true });
          const idx = header.indexOf(HeaderTerminator);
          if (idx >= 0) {
            header = header.slice(0, idx + HeaderTerminator.length);
            reader.head -= HeaderReadBlockSize - new TextEncoder().encode(header).length % HeaderReadBlockSize;
            this.initHeader(header);
            initDecoder();
            BlockOffset = await data.initBlock(this.counts, this.shDegree);
            headerParsed = true;
            break;
          }
        }
        if (!headerParsed) {
          continue;
        }
      }
      decoder.flush();
    }
    data.finishBlock();
  }
  async write(stream, data) {
    const writer2 = stream.getWriter();
    const counts = data.counts;
    const shDegree = data.shDegree;
    const shCounts = SH_MAPS2[shDegree];
    const shCoeffs = shCounts / 3;
    const header = [
      "ply",
      "format binary_little_endian 1.0",
      `comment Generated by EGS`,
      `element vertex ${counts}`,
      "property float x",
      "property float y",
      "property float z",
      "property float scale_0",
      "property float scale_1",
      "property float scale_2",
      "property float rot_1",
      "property float rot_2",
      "property float rot_3",
      "property float rot_0",
      "property float f_dc_0",
      "property float f_dc_1",
      "property float f_dc_2",
      "property float opacity",
      new Array(shCounts).fill(0).map((_, i) => `property float f_rest_${i}`),
      "end_header",
      ""
    ].flat().join("\n");
    writer2.write(new TextEncoder().encode(header));
    const ItemSize2 = 14 + shCounts;
    const chunkSize = 1024;
    const chunkCounts = Math.ceil(counts / chunkSize);
    const single = {
      x: 0,
      y: 0,
      z: 0,
      sx: 0,
      sy: 0,
      sz: 0,
      qx: 0,
      qy: 0,
      qz: 0,
      qw: 0,
      r: 0,
      g: 0,
      b: 0,
      a: 0,
      shN: new Array(shCounts)
    };
    const shN = single.shN;
    for (let i = 0; i < chunkCounts; i++) {
      if (writer2.desiredSize <= 0) {
        await writer2.ready;
      }
      const currentChunkSize = Math.min(chunkSize, counts - i * chunkSize);
      const chunk = new Float32Array(currentChunkSize * ItemSize2);
      const offset = i * chunkSize;
      for (let j = 0; j < currentChunkSize; j++) {
        data.get(offset + j, single);
        data.getShN(offset + j, shN);
        const o = j * ItemSize2;
        chunk[o + 0] = single.x;
        chunk[o + 1] = single.y;
        chunk[o + 2] = single.z;
        chunk[o + 3] = Math.log(single.sx);
        chunk[o + 4] = Math.log(single.sy);
        chunk[o + 5] = Math.log(single.sz);
        chunk[o + 6] = single.qx;
        chunk[o + 7] = single.qy;
        chunk[o + 8] = single.qz;
        chunk[o + 9] = single.qw;
        chunk[o + 10] = (single.r - 0.5) / SH_C0;
        chunk[o + 11] = (single.g - 0.5) / SH_C0;
        chunk[o + 12] = (single.b - 0.5) / SH_C0;
        chunk[o + 13] = single.a === 0 ? -100 : -Math.log(1 / single.a - 1);
        for (let k = 0; k < shCounts; k++) {
          chunk[o + 14 + k] = shN[k % shCoeffs * 3 + (k / shCoeffs | 0)];
        }
      }
      writer2.write(new Uint8Array(chunk.buffer));
      await Promise.resolve();
    }
    await writer2.close();
  }
};

// ../../external/egs-core/packages/loaders/splat-loader/file/sog.ts
var ZIP_MAGIC = 67324752;
var PERM_TABLE = [
  // original quat idx ---> actual storage idx
  [0, 1, 2, 3],
  [3, 1, 2, 0],
  [1, 3, 2, 0],
  [1, 2, 3, 0]
];
var TEMP_ROT = new Float32Array(4);
var SogFile = class {
  constructor() {
    this.counts = 0;
    this.shDegree = 0;
    /**
     * @internal
     */
    this.refs = {};
  }
  async load(stream, contentLength) {
    const buffer = new Uint8Array(contentLength);
    const reader = stream.getReader();
    let offset = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer.set(value, offset);
      offset += value.length;
    }
    let metaBuffer = buffer;
    const view = new DataView(buffer.buffer);
    if (view.getUint32(0, true) === ZIP_MAGIC) {
      this.refs = extractFromRootDir(unzipSync(buffer));
      metaBuffer = this.refs["meta.json"];
      if (!metaBuffer) {
        throw new Error("SOG meta.json not found in the zip archive.");
      }
    }
    this.meta = JSON.parse(new TextDecoder().decode(metaBuffer));
    if (this.meta.version === void 0) {
      const { means, quats, shN } = this.meta;
      if (quats.encoding !== "quaternion_packed") {
        throw new Error("Unsupported quaternion encoding");
      }
      this.counts = means.shape[0];
      this.shDegree = shN ? NUM_F_REST_TO_SH_DEGREE[shN.shape[1]] : 0;
      this.version = 1;
    } else {
      const { version, count, shN } = this.meta;
      if (version !== 2) {
        throw new Error(`Unsupported SOGS version: ${version}`);
      }
      this.counts = count;
      this.shDegree = shN?.bands ?? 0;
      this.version = version;
    }
  }
  parse_v1(data, offset) {
    const setFn = data.set.bind(data);
    const setShFn = data.setShN.bind(data);
    const { meta, counts, shDegree, cached } = this;
    const [mean0, mean1, scale0, quat0, color0, centroids, labels] = cached.map((v) => v.data);
    const {
      means: { mins: [centerMinX, centerMinY, centerMinZ], maxs: [centerMaxX, centerMaxY, centerMaxZ] },
      scales: { mins: [scaleMinX, scaleMinY, scaleMinZ], maxs: [scaleMaxX, scaleMaxY, scaleMaxZ] },
      sh0: { mins: [colorMinR, colorMinG, colorMinB, colorMinA], maxs: [colorMaxR, colorMaxG, colorMaxB, colorMaxA] },
      shN
    } = meta;
    const rangeX = (centerMaxX - centerMinX) / 65535;
    const rangeY = (centerMaxY - centerMinY) / 65535;
    const rangeZ = (centerMaxZ - centerMinZ) / 65535;
    const SX_LUT = new Float32Array(256);
    const SY_LUT = new Float32Array(256);
    const SZ_LUT = new Float32Array(256);
    const scaleRangeX = (scaleMaxX - scaleMinX) / 255;
    const scaleRangeY = (scaleMaxY - scaleMinY) / 255;
    const scaleRangeZ = (scaleMaxZ - scaleMinZ) / 255;
    for (let i = 0; i < 256; i++) {
      SX_LUT[i] = Math.exp(scaleMinX + scaleRangeX * i);
      SY_LUT[i] = Math.exp(scaleMinY + scaleRangeY * i);
      SZ_LUT[i] = Math.exp(scaleMinZ + scaleRangeZ * i);
    }
    const A_LUT = new Float32Array(256);
    const colorRangeR = (colorMaxR - colorMinR) / 255;
    const colorRangeG = (colorMaxG - colorMinG) / 255;
    const colorRangeB = (colorMaxB - colorMinB) / 255;
    const colorRangeA = (colorMaxA - colorMinA) / 255;
    for (let i = 0; i < 256; i++) {
      A_LUT[i] = 1 / (1 + Math.exp(-(colorMinA + colorRangeA * i)));
    }
    const single = {
      x: 0,
      y: 0,
      z: 0,
      sx: 0,
      sy: 0,
      sz: 0,
      qx: 0,
      qy: 0,
      qz: 0,
      qw: 0,
      r: 0,
      g: 0,
      b: 0,
      a: 0,
      shN: []
    };
    for (let i = 0; i < counts; i++) {
      const i4 = i * 4;
      const x = centerMinX + rangeX * (mean0[i4 + 0] + (mean1[i4 + 0] << 8));
      const y = centerMinY + rangeY * (mean0[i4 + 1] + (mean1[i4 + 1] << 8));
      const z = centerMinZ + rangeZ * (mean0[i4 + 2] + (mean1[i4 + 2] << 8));
      single.x = Math.sign(x) * (Math.exp(Math.abs(x)) - 1);
      single.y = Math.sign(y) * (Math.exp(Math.abs(y)) - 1);
      single.z = Math.sign(z) * (Math.exp(Math.abs(z)) - 1);
      single.sx = SX_LUT[scale0[i4 + 0]];
      single.sy = SY_LUT[scale0[i4 + 1]];
      single.sz = SZ_LUT[scale0[i4 + 2]];
      TEMP_ROT[0] = (quat0[i4 + 0] / 255 - 0.5) * Math.SQRT2;
      TEMP_ROT[1] = (quat0[i4 + 1] / 255 - 0.5) * Math.SQRT2;
      TEMP_ROT[2] = (quat0[i4 + 2] / 255 - 0.5) * Math.SQRT2;
      TEMP_ROT[3] = Math.sqrt(Math.max(0, 1 - TEMP_ROT[0] * TEMP_ROT[0] - TEMP_ROT[1] * TEMP_ROT[1] - TEMP_ROT[2] * TEMP_ROT[2]));
      const PERM = PERM_TABLE[quat0[i4 + 3] - 252];
      single.qx = TEMP_ROT[PERM[0]];
      single.qy = TEMP_ROT[PERM[1]];
      single.qz = TEMP_ROT[PERM[2]];
      single.qw = TEMP_ROT[PERM[3]];
      single.r = SH_C0 * (colorMinR + colorRangeR * color0[i4 + 0]) + 0.5;
      single.g = SH_C0 * (colorMinG + colorRangeG * color0[i4 + 1]) + 0.5;
      single.b = SH_C0 * (colorMinB + colorRangeB * color0[i4 + 2]) + 0.5;
      single.a = A_LUT[color0[i4 + 3]];
      setFn(offset + i, single);
    }
    if (shN) {
      const centroidTexWidth = cached[5].width;
      const { mins: min, maxs: max2 } = shN;
      const range = (max2 - min) / 255;
      const shCounts = SH_MAPS2[shDegree];
      const sh = new Array(shCounts);
      const shCoeffs = shCounts / 3;
      for (let i = 0; i < counts; i++) {
        const i4 = i * 4;
        const label = labels[i4] + (labels[i4 + 1] << 8);
        const o = ((label >>> 6) * centroidTexWidth + (label & 63) * 15) * 4;
        for (let j = 0; j < shCoeffs; j++) {
          sh[j * 3 + 0] = min + range * centroids[o + j * 4 + 0];
          sh[j * 3 + 1] = min + range * centroids[o + j * 4 + 1];
          sh[j * 3 + 2] = min + range * centroids[o + j * 4 + 2];
        }
        setShFn(offset + i, sh);
      }
    }
  }
  parse_v2(data, offset) {
    const setFn = data.set.bind(data);
    const setShFn = data.setShN.bind(data);
    const { meta, counts, shDegree, cached } = this;
    const { means, scales, sh0, shN } = meta;
    const {
      mins: [centerMinX, centerMinY, centerMinZ],
      maxs: [centerMaxX, centerMaxY, centerMaxZ]
    } = means;
    const { codebook: scaleCodebook } = scales;
    const { codebook: sh0Codebook } = sh0;
    const [mean0, mean1, scale0, quat0, color0, centroids, labels] = cached.map((img) => img.data);
    const rangeX = (centerMaxX - centerMinX) / 65535;
    const rangeY = (centerMaxY - centerMinY) / 65535;
    const rangeZ = (centerMaxZ - centerMinZ) / 65535;
    const SCALE_LUT = scaleCodebook.map((v) => Math.exp(v));
    const single = {
      x: 0,
      y: 0,
      z: 0,
      sx: 0,
      sy: 0,
      sz: 0,
      qx: 0,
      qy: 0,
      qz: 0,
      qw: 0,
      r: 0,
      g: 0,
      b: 0,
      a: 0,
      shN: []
    };
    for (let i = 0; i < counts; i++) {
      const i4 = i * 4;
      const x = centerMinX + rangeX * (mean0[i4 + 0] + (mean1[i4 + 0] << 8));
      const y = centerMinY + rangeY * (mean0[i4 + 1] + (mean1[i4 + 1] << 8));
      const z = centerMinZ + rangeZ * (mean0[i4 + 2] + (mean1[i4 + 2] << 8));
      single.x = Math.sign(x) * (Math.exp(Math.abs(x)) - 1);
      single.y = Math.sign(y) * (Math.exp(Math.abs(y)) - 1);
      single.z = Math.sign(z) * (Math.exp(Math.abs(z)) - 1);
      single.sx = SCALE_LUT[scale0[i4 + 0]];
      single.sy = SCALE_LUT[scale0[i4 + 1]];
      single.sz = SCALE_LUT[scale0[i4 + 2]];
      TEMP_ROT[0] = (quat0[i4 + 0] / 255 - 0.5) * Math.SQRT2;
      TEMP_ROT[1] = (quat0[i4 + 1] / 255 - 0.5) * Math.SQRT2;
      TEMP_ROT[2] = (quat0[i4 + 2] / 255 - 0.5) * Math.SQRT2;
      TEMP_ROT[3] = Math.sqrt(Math.max(0, 1 - TEMP_ROT[0] * TEMP_ROT[0] - TEMP_ROT[1] * TEMP_ROT[1] - TEMP_ROT[2] * TEMP_ROT[2]));
      const PERM = PERM_TABLE[quat0[i4 + 3] - 252];
      single.qx = TEMP_ROT[PERM[0]];
      single.qy = TEMP_ROT[PERM[1]];
      single.qz = TEMP_ROT[PERM[2]];
      single.qw = TEMP_ROT[PERM[3]];
      single.r = SH_C0 * sh0Codebook[color0[i4 + 0]] + 0.5;
      single.g = SH_C0 * sh0Codebook[color0[i4 + 1]] + 0.5;
      single.b = SH_C0 * sh0Codebook[color0[i4 + 2]] + 0.5;
      single.a = color0[i4 + 3] / 255;
      setFn(offset + i, single);
    }
    if (shN) {
      const { codebook } = shN;
      const shCounts = SH_MAPS2[shDegree];
      const shCoeffs = shCounts / 3;
      const offsetItemSize = shCoeffs * 4;
      const sh = new Array(shCounts);
      for (let i = 0; i < counts; i++) {
        const i4 = i * 4;
        const o = (labels[i4 + 0] + (labels[i4 + 1] << 8)) * offsetItemSize;
        for (let j = 0; j < shCoeffs; j++) {
          sh[j * 3] = codebook[centroids[o + j * 4 + 0]];
          sh[j * 3 + 1] = codebook[centroids[o + j * 4 + 1]];
          sh[j * 3 + 2] = codebook[centroids[o + j * 4 + 2]];
        }
        setShFn(offset + i, sh);
      }
    }
  }
  async loadTexture(path) {
    let buffer = this.refs[path];
    if (!buffer && isUrl(path)) {
      buffer = await fetch(path).then((res) => res.arrayBuffer()).then((buf) => new Uint8Array(buf));
    }
    if (!buffer) {
      throw new Error(`Cannot load texture: ${path}`);
    }
    return decodeImage(buffer.buffer);
  }
  async read(stream, contentLength, data) {
    await this.load(stream, contentLength);
    const BlockOffset = await data.initBlock(this.counts, this.shDegree);
    const { means, scales, quats, sh0, shN } = this.meta;
    this.cached = await Promise.all([
      means.files[0],
      means.files[1],
      scales.files[0],
      quats.files[0],
      sh0.files[0],
      shN?.files[0],
      shN?.files[1]
    ].filter((path) => !!path).map((path) => this.loadTexture(path)));
    if (this.version === 1) {
      this.parse_v1(data, BlockOffset);
    } else if (this.version === 2) {
      this.parse_v2(data, BlockOffset);
    } else {
      throw new Error(`Unsupported SOG version: ${this.version}`);
    }
    data.finishBlock();
  }
  async write(_stream, _data) {
    throw new Error("Method not implemented.");
  }
};

// ../../external/egs-core/packages/loaders/splat-loader/file/splat.ts
var ItemSize = 32;
var SplatFile = class {
  async read(stream, contentLength, data) {
    const setFn = data.set.bind(data);
    const counts = Math.floor(contentLength / ItemSize);
    const BlockOffset = await data.initBlock(counts, 0);
    const reader = new BufferReader();
    const decoder = new StreamChunkDecoder(reader);
    const single = {
      x: 0,
      y: 0,
      z: 0,
      sx: 0,
      sy: 0,
      sz: 0,
      qx: 0,
      qy: 0,
      qz: 0,
      qw: 0,
      r: 0,
      g: 0,
      b: 0,
      a: 0,
      shN: []
    };
    decoder.setDecoders([
      {
        init: () => [counts, ItemSize],
        decode: (offset, counts2, buffer) => {
          offset += BlockOffset;
          const f32Array = new Float32Array(buffer.buffer);
          let o = 0;
          for (let i = 0; i < counts2; i++) {
            o = i * 8;
            single.x = f32Array[o];
            single.y = f32Array[o + 1];
            single.z = f32Array[o + 2];
            single.sx = f32Array[o + 3];
            single.sy = f32Array[o + 4];
            single.sz = f32Array[o + 5];
            o = i * 32;
            single.r = buffer[o + 24] / 255;
            single.g = buffer[o + 25] / 255;
            single.b = buffer[o + 26] / 255;
            single.a = buffer[o + 27] / 255;
            single.qw = (buffer[o + 28] - 128) / 128;
            single.qx = (buffer[o + 29] - 128) / 128;
            single.qy = (buffer[o + 30] - 128) / 128;
            single.qz = (buffer[o + 31] - 128) / 128;
            setFn(offset + i, single);
          }
        }
      }
    ]);
    const source = stream.getReader();
    while (true) {
      const { done, value } = await source.read();
      if (done) {
        break;
      }
      reader.write(value);
      decoder.flush();
    }
    data.finishBlock();
  }
  async write(stream, data) {
    const writer2 = stream.getWriter();
    const chunkSize = 2048;
    const chunkCounts = Math.ceil(data.counts / chunkSize);
    const single = {
      x: 0,
      y: 0,
      z: 0,
      sx: 0,
      sy: 0,
      sz: 0,
      qx: 0,
      qy: 0,
      qz: 0,
      qw: 0,
      r: 0,
      g: 0,
      b: 0,
      a: 0,
      shN: []
    };
    for (let i = 0; i < chunkCounts; i++) {
      if (writer2.desiredSize <= 0) {
        await writer2.ready;
      }
      const currentChunkSize = Math.min(chunkSize, data.counts - i * chunkSize);
      const chunk = new Uint8Array(currentChunkSize * ItemSize);
      const dataView = new DataView(chunk.buffer);
      const offset = i * chunkSize;
      for (let j = 0; j < currentChunkSize; j++) {
        data.get(offset + j, single);
        const o = j * ItemSize;
        dataView.setFloat32(o, single.x, true);
        dataView.setFloat32(o + 4, single.y, true);
        dataView.setFloat32(o + 8, single.z, true);
        dataView.setFloat32(o + 12, single.sx, true);
        dataView.setFloat32(o + 16, single.sy, true);
        dataView.setFloat32(o + 20, single.sz, true);
        dataView.setUint8(o + 24, clamp2(Math.round(single.r * 255), 0, 255));
        dataView.setUint8(o + 25, clamp2(Math.round(single.g * 255), 0, 255));
        dataView.setUint8(o + 26, clamp2(Math.round(single.b * 255), 0, 255));
        dataView.setUint8(o + 27, clamp2(Math.round(single.a * 255), 0, 255));
        dataView.setUint8(o + 28, clamp2(Math.round(single.qw * 128 + 128), 0, 255));
        dataView.setUint8(o + 29, clamp2(Math.round(single.qx * 128 + 128), 0, 255));
        dataView.setUint8(o + 30, clamp2(Math.round(single.qy * 128 + 128), 0, 255));
        dataView.setUint8(o + 31, clamp2(Math.round(single.qz * 128 + 128), 0, 255));
      }
      writer2.write(chunk);
      await Promise.resolve();
    }
    await writer2.close();
  }
};

// ../../node_modules/.pnpm/zstddec@0.2.0/node_modules/zstddec/dist/zstddec.modern.js
var init;
var instance;
var heap;
var IMPORT_OBJECT = {
  env: {
    emscripten_notify_memory_growth: (_) => {
      heap = new Uint8Array(instance.exports.memory.buffer);
    }
  }
};
var ZSTDDecoder = class {
  init() {
    if (init) return init;
    if (typeof fetch !== "undefined") {
      init = fetch(`data:application/wasm;base64,${wasm}`).then((response) => response.arrayBuffer()).then((arrayBuffer) => WebAssembly.instantiate(arrayBuffer, IMPORT_OBJECT)).then(this._init);
    } else {
      init = WebAssembly.instantiate(Buffer.from(wasm, "base64"), IMPORT_OBJECT).then(this._init);
    }
    return init;
  }
  _init(result) {
    instance = result.instance;
    IMPORT_OBJECT.env.emscripten_notify_memory_growth(0);
  }
  decode(array, uncompressedSize = 0) {
    if (!instance) throw new Error("ZSTDDecoder: Await .init() before decoding.");
    const compressedSize = array.byteLength;
    const compressedPtr = instance.exports.malloc(compressedSize);
    heap.set(array, compressedPtr);
    uncompressedSize = uncompressedSize || Number(instance.exports.ZSTD_findDecompressedSize(compressedPtr, compressedSize));
    const uncompressedPtr = instance.exports.malloc(uncompressedSize);
    const actualSize = instance.exports.ZSTD_decompress(uncompressedPtr, uncompressedSize, compressedPtr, compressedSize);
    const dec = heap.slice(uncompressedPtr, uncompressedPtr + actualSize);
    instance.exports.free(compressedPtr);
    instance.exports.free(uncompressedPtr);
    return dec;
  }
};
var wasm = "AGFzbQEAAAABoAEUYAF/AGADf39/AGACf38AYAF/AX9gBX9/f39/AX9gA39/fwF/YAR/f39/AX9gAn9/AX9gAAF/YAd/f39/f39/AX9gB39/f39/f38AYAR/f39/AX5gAn9/AX5gBn9/f39/fwBgDn9/f39/f39/f39/f39/AX9gCH9/f39/f39/AX9gCX9/f39/f39/fwF/YAN+f38BfmAFf39/f38AYAAAAicBA2Vudh9lbXNjcmlwdGVuX25vdGlmeV9tZW1vcnlfZ3Jvd3RoAAADJyYDAAMACAQJBQEHBwADBgoLBAQDBAEABgUMBQ0OAQEBDxAREgYAEwQFAXABAgIFBwEBggKAgAIGCAF/AUGgnwQLB9MBCgZtZW1vcnkCAAxaU1REX2lzRXJyb3IADRlaU1REX2ZpbmREZWNvbXByZXNzZWRTaXplABkPWlNURF9kZWNvbXByZXNzACQGbWFsbG9jAAEEZnJlZQACGV9faW5kaXJlY3RfZnVuY3Rpb25fdGFibGUBABlfZW1zY3JpcHRlbl9zdGFja19yZXN0b3JlAAQcZW1zY3JpcHRlbl9zdGFja19nZXRfY3VycmVudAAFIl9fY3hhX2luY3JlbWVudF9leGNlcHRpb25fcmVmY291bnQAJQkHAQBBAQsBJgwBCgqtkgMm1ScBC38jAEEQayIKJAACQAJAAkACQAJAAkACQAJAAkACQCAAQfQBTQRAQagbKAIAIgRBECAAQQtqQfgDcSAAQQtJGyIGQQN2IgB2IgFBA3EEQAJAIAFBf3NBAXEgAGoiAkEDdCIBQdAbaiIAIAFB2BtqKAIAIgEoAggiBUYEQEGoGyAEQX4gAndxNgIADAELIAUgADYCDCAAIAU2AggLIAFBCGohACABIAJBA3QiAkEDcjYCBCABIAJqIgEgASgCBEEBcjYCBAwLCyAGQbAbKAIAIghNDQEgAQRAAkBBAiAAdCICQQAgAmtyIAEgAHRxaCIBQQN0IgBB0BtqIgIgAEHYG2ooAgAiACgCCCIFRgRAQagbIARBfiABd3EiBDYCAAwBCyAFIAI2AgwgAiAFNgIICyAAIAZBA3I2AgQgACAGaiIHIAFBA3QiASAGayIFQQFyNgIEIAAgAWogBTYCACAIBEAgCEF4cUHQG2ohAUG8GygCACECAn8gBEEBIAhBA3Z0IgNxRQRAQagbIAMgBHI2AgAgAQwBCyABKAIICyEDIAEgAjYCCCADIAI2AgwgAiABNgIMIAIgAzYCCAsgAEEIaiEAQbwbIAc2AgBBsBsgBTYCAAwLC0GsGygCACILRQ0BIAtoQQJ0QdgdaigCACICKAIEQXhxIAZrIQMgAiEBA0ACQCABKAIQIgBFBEAgASgCFCIARQ0BCyAAKAIEQXhxIAZrIgEgAyABIANJIgEbIQMgACACIAEbIQIgACEBDAELCyACKAIYIQkgAiACKAIMIgBHBEAgAigCCCIBIAA2AgwgACABNgIIDAoLIAIoAhQiAQR/IAJBFGoFIAIoAhAiAUUNAyACQRBqCyEFA0AgBSEHIAEiAEEUaiEFIAAoAhQiAQ0AIABBEGohBSAAKAIQIgENAAsgB0EANgIADAkLQX8hBiAAQb9/Sw0AIABBC2oiAUF4cSEGQawbKAIAIgdFDQBBHyEIQQAgBmshAyAAQfT//wdNBEAgBkEmIAFBCHZnIgBrdkEBcSAAQQF0a0E+aiEICwJAAkACQCAIQQJ0QdgdaigCACIBRQRAQQAhAAwBC0EAIQAgBkEZIAhBAXZrQQAgCEEfRxt0IQIDQAJAIAEoAgRBeHEgBmsiBCADTw0AIAEhBSAEIgMNAEEAIQMgASEADAMLIAAgASgCFCIEIAQgASACQR12QQRxaigCECIBRhsgACAEGyEAIAJBAXQhAiABDQALCyAAIAVyRQRAQQAhBUECIAh0IgBBACAAa3IgB3EiAEUNAyAAaEECdEHYHWooAgAhAAsgAEUNAQsDQCAAKAIEQXhxIAZrIgIgA0khASACIAMgARshAyAAIAUgARshBSAAKAIQIgEEfyABBSAAKAIUCyIADQALCyAFRQ0AIANBsBsoAgAgBmtPDQAgBSgCGCEIIAUgBSgCDCIARwRAIAUoAggiASAANgIMIAAgATYCCAwICyAFKAIUIgEEfyAFQRRqBSAFKAIQIgFFDQMgBUEQagshAgNAIAIhBCABIgBBFGohAiAAKAIUIgENACAAQRBqIQIgACgCECIBDQALIARBADYCAAwHCyAGQbAbKAIAIgVNBEBBvBsoAgAhAAJAIAUgBmsiAUEQTwRAIAAgBmoiAiABQQFyNgIEIAAgBWogATYCACAAIAZBA3I2AgQMAQsgACAFQQNyNgIEIAAgBWoiASABKAIEQQFyNgIEQQAhAkEAIQELQbAbIAE2AgBBvBsgAjYCACAAQQhqIQAMCQsgBkG0GygCACICSQRAQbQbIAIgBmsiATYCAEHAG0HAGygCACIAIAZqIgI2AgAgAiABQQFyNgIEIAAgBkEDcjYCBCAAQQhqIQAMCQtBACEAIAZBL2oiAwJ/QYAfKAIABEBBiB8oAgAMAQtBjB9CfzcCAEGEH0KAoICAgIAENwIAQYAfIApBDGpBcHFB2KrVqgVzNgIAQZQfQQA2AgBB5B5BADYCAEGAIAsiAWoiBEEAIAFrIgdxIgEgBk0NCEHgHigCACIFBEBB2B4oAgAiCCABaiIJIAhNIAUgCUlyDQkLAkBB5B4tAABBBHFFBEACQAJAAkACQEHAGygCACIFBEBB6B4hAANAIAAoAgAiCCAFTQRAIAUgCCAAKAIEakkNAwsgACgCCCIADQALC0EAEAMiAkF/Rg0DIAEhBEGEHygCACIAQQFrIgUgAnEEQCABIAJrIAIgBWpBACAAa3FqIQQLIAQgBk0NA0HgHigCACIABEBB2B4oAgAiBSAEaiIHIAVNIAAgB0lyDQQLIAQQAyIAIAJHDQEMBQsgBCACayAHcSIEEAMiAiAAKAIAIAAoAgRqRg0BIAIhAAsgAEF/Rg0BIAZBMGogBE0EQCAAIQIMBAtBiB8oAgAiAiADIARrakEAIAJrcSICEANBf0YNASACIARqIQQgACECDAMLIAJBf0cNAgtB5B5B5B4oAgBBBHI2AgALIAEQAyICQX9GQQAQAyIAQX9GciAAIAJNcg0FIAAgAmsiBCAGQShqTQ0FC0HYHkHYHigCACAEaiIANgIAQdweKAIAIABJBEBB3B4gADYCAAsCQEHAGygCACIDBEBB6B4hAANAIAIgACgCACIBIAAoAgQiBWpGDQIgACgCCCIADQALDAQLQbgbKAIAIgBBACAAIAJNG0UEQEG4GyACNgIAC0EAIQBB7B4gBDYCAEHoHiACNgIAQcgbQX82AgBBzBtBgB8oAgA2AgBB9B5BADYCAANAIABBA3QiAUHYG2ogAUHQG2oiBTYCACABQdwbaiAFNgIAIABBAWoiAEEgRw0AC0G0GyAEQShrIgBBeCACa0EHcSIBayIFNgIAQcAbIAEgAmoiATYCACABIAVBAXI2AgQgACACakEoNgIEQcQbQZAfKAIANgIADAQLIAIgA00gASADS3INAiAAKAIMQQhxDQIgACAEIAVqNgIEQcAbIANBeCADa0EHcSIAaiIBNgIAQbQbQbQbKAIAIARqIgIgAGsiADYCACABIABBAXI2AgQgAiADakEoNgIEQcQbQZAfKAIANgIADAMLQQAhAAwGC0EAIQAMBAtBuBsoAgAgAksEQEG4GyACNgIACyACIARqIQVB6B4hAAJAA0AgBSAAKAIAIgFHBEAgACgCCCIADQEMAgsLIAAtAAxBCHFFDQMLQegeIQADQAJAIAAoAgAiASADTQRAIAMgASAAKAIEaiIFSQ0BCyAAKAIIIQAMAQsLQbQbIARBKGsiAEF4IAJrQQdxIgFrIgc2AgBBwBsgASACaiIBNgIAIAEgB0EBcjYCBCAAIAJqQSg2AgRBxBtBkB8oAgA2AgAgAyAFQScgBWtBB3FqQS9rIgAgACADQRBqSRsiAUEbNgIEIAFB8B4pAgA3AhAgAUHoHikCADcCCEHwHiABQQhqNgIAQeweIAQ2AgBB6B4gAjYCAEH0HkEANgIAIAFBGGohAANAIABBBzYCBCAAQQhqIQIgAEEEaiEAIAIgBUkNAAsgASADRg0AIAEgASgCBEF+cTYCBCADIAEgA2siAkEBcjYCBCABIAI2AgACfyACQf8BTQRAIAJBeHFB0BtqIQACf0GoGygCACIBQQEgAkEDdnQiAnFFBEBBqBsgASACcjYCACAADAELIAAoAggLIQEgACADNgIIIAEgAzYCDEEMIQJBCAwBC0EfIQAgAkH///8HTQRAIAJBJiACQQh2ZyIAa3ZBAXEgAEEBdGtBPmohAAsgAyAANgIcIANCADcCECAAQQJ0QdgdaiEBAkACQEGsGygCACIFQQEgAHQiBHFFBEBBrBsgBCAFcjYCACABIAM2AgAMAQsgAkEZIABBAXZrQQAgAEEfRxt0IQAgASgCACEFA0AgBSIBKAIEQXhxIAJGDQIgAEEddiEFIABBAXQhACABIAVBBHFqIgQoAhAiBQ0ACyAEIAM2AhALIAMgATYCGEEIIQIgAyIBIQBBDAwBCyABKAIIIgAgAzYCDCABIAM2AgggAyAANgIIQQAhAEEYIQJBDAsgA2ogATYCACACIANqIAA2AgALQbQbKAIAIgAgBk0NAEG0GyAAIAZrIgE2AgBBwBtBwBsoAgAiACAGaiICNgIAIAIgAUEBcjYCBCAAIAZBA3I2AgQgAEEIaiEADAQLQaQbQTA2AgBBACEADAMLIAAgAjYCACAAIAAoAgQgBGo2AgQgAkF4IAJrQQdxaiIIIAZBA3I2AgQgAUF4IAFrQQdxaiIEIAYgCGoiA2shBwJAQcAbKAIAIARGBEBBwBsgAzYCAEG0G0G0GygCACAHaiIANgIAIAMgAEEBcjYCBAwBC0G8GygCACAERgRAQbwbIAM2AgBBsBtBsBsoAgAgB2oiADYCACADIABBAXI2AgQgACADaiAANgIADAELIAQoAgQiAEEDcUEBRgRAIABBeHEhCSAEKAIMIQICQCAAQf8BTQRAIAQoAggiASACRgRAQagbQagbKAIAQX4gAEEDdndxNgIADAILIAEgAjYCDCACIAE2AggMAQsgBCgCGCEGAkAgAiAERwRAIAQoAggiACACNgIMIAIgADYCCAwBCwJAIAQoAhQiAAR/IARBFGoFIAQoAhAiAEUNASAEQRBqCyEBA0AgASEFIAAiAkEUaiEBIAAoAhQiAA0AIAJBEGohASACKAIQIgANAAsgBUEANgIADAELQQAhAgsgBkUNAAJAIAQoAhwiAEECdEHYHWoiASgCACAERgRAIAEgAjYCACACDQFBrBtBrBsoAgBBfiAAd3E2AgAMAgsCQCAEIAYoAhBGBEAgBiACNgIQDAELIAYgAjYCFAsgAkUNAQsgAiAGNgIYIAQoAhAiAARAIAIgADYCECAAIAI2AhgLIAQoAhQiAEUNACACIAA2AhQgACACNgIYCyAHIAlqIQcgBCAJaiIEKAIEIQALIAQgAEF+cTYCBCADIAdBAXI2AgQgAyAHaiAHNgIAIAdB/wFNBEAgB0F4cUHQG2ohAAJ/QagbKAIAIgFBASAHQQN2dCICcUUEQEGoGyABIAJyNgIAIAAMAQsgACgCCAshASAAIAM2AgggASADNgIMIAMgADYCDCADIAE2AggMAQtBHyECIAdB////B00EQCAHQSYgB0EIdmciAGt2QQFxIABBAXRrQT5qIQILIAMgAjYCHCADQgA3AhAgAkECdEHYHWohAAJAAkBBrBsoAgAiAUEBIAJ0IgVxRQRAQawbIAEgBXI2AgAgACADNgIADAELIAdBGSACQQF2a0EAIAJBH0cbdCECIAAoAgAhAQNAIAEiACgCBEF4cSAHRg0CIAJBHXYhASACQQF0IQIgACABQQRxaiIFKAIQIgENAAsgBSADNgIQCyADIAA2AhggAyADNgIMIAMgAzYCCAwBCyAAKAIIIgEgAzYCDCAAIAM2AgggA0EANgIYIAMgADYCDCADIAE2AggLIAhBCGohAAwCCwJAIAhFDQACQCAFKAIcIgFBAnRB2B1qIgIoAgAgBUYEQCACIAA2AgAgAA0BQawbIAdBfiABd3EiBzYCAAwCCwJAIAUgCCgCEEYEQCAIIAA2AhAMAQsgCCAANgIUCyAARQ0BCyAAIAg2AhggBSgCECIBBEAgACABNgIQIAEgADYCGAsgBSgCFCIBRQ0AIAAgATYCFCABIAA2AhgLAkAgA0EPTQRAIAUgAyAGaiIAQQNyNgIEIAAgBWoiACAAKAIEQQFyNgIEDAELIAUgBkEDcjYCBCAFIAZqIgQgA0EBcjYCBCADIARqIAM2AgAgA0H/AU0EQCADQXhxQdAbaiEAAn9BqBsoAgAiAUEBIANBA3Z0IgJxRQRAQagbIAEgAnI2AgAgAAwBCyAAKAIICyEBIAAgBDYCCCABIAQ2AgwgBCAANgIMIAQgATYCCAwBC0EfIQAgA0H///8HTQRAIANBJiADQQh2ZyIAa3ZBAXEgAEEBdGtBPmohAAsgBCAANgIcIARCADcCECAAQQJ0QdgdaiEBAkACQCAHQQEgAHQiAnFFBEBBrBsgAiAHcjYCACABIAQ2AgAgBCABNgIYDAELIANBGSAAQQF2a0EAIABBH0cbdCEAIAEoAgAhAQNAIAEiAigCBEF4cSADRg0CIABBHXYhASAAQQF0IQAgAiABQQRxaiIHKAIQIgENAAsgByAENgIQIAQgAjYCGAsgBCAENgIMIAQgBDYCCAwBCyACKAIIIgAgBDYCDCACIAQ2AgggBEEANgIYIAQgAjYCDCAEIAA2AggLIAVBCGohAAwBCwJAIAlFDQACQCACKAIcIgFBAnRB2B1qIgUoAgAgAkYEQCAFIAA2AgAgAA0BQawbIAtBfiABd3E2AgAMAgsCQCACIAkoAhBGBEAgCSAANgIQDAELIAkgADYCFAsgAEUNAQsgACAJNgIYIAIoAhAiAQRAIAAgATYCECABIAA2AhgLIAIoAhQiAUUNACAAIAE2AhQgASAANgIYCwJAIANBD00EQCACIAMgBmoiAEEDcjYCBCAAIAJqIgAgACgCBEEBcjYCBAwBCyACIAZBA3I2AgQgAiAGaiIFIANBAXI2AgQgAyAFaiADNgIAIAgEQCAIQXhxQdAbaiEAQbwbKAIAIQECf0EBIAhBA3Z0IgcgBHFFBEBBqBsgBCAHcjYCACAADAELIAAoAggLIQQgACABNgIIIAQgATYCDCABIAA2AgwgASAENgIIC0G8GyAFNgIAQbAbIAM2AgALIAJBCGohAAsgCkEQaiQAIAAL3AsBCH8CQCAARQ0AIABBCGsiAyAAQQRrKAIAIgJBeHEiAGohBQJAIAJBAXENACACQQJxRQ0BIAMgAygCACIEayIDQbgbKAIASQ0BIAAgBGohAAJAAkACQEG8GygCACADRwRAIAMoAgwhASAEQf8BTQRAIAEgAygCCCICRw0CQagbQagbKAIAQX4gBEEDdndxNgIADAULIAMoAhghByABIANHBEAgAygCCCICIAE2AgwgASACNgIIDAQLIAMoAhQiAgR/IANBFGoFIAMoAhAiAkUNAyADQRBqCyEEA0AgBCEGIAIiAUEUaiEEIAEoAhQiAg0AIAFBEGohBCABKAIQIgINAAsgBkEANgIADAMLIAUoAgQiAkEDcUEDRw0DQbAbIAA2AgAgBSACQX5xNgIEIAMgAEEBcjYCBCAFIAA2AgAPCyACIAE2AgwgASACNgIIDAILQQAhAQsgB0UNAAJAIAMoAhwiBEECdEHYHWoiAigCACADRgRAIAIgATYCACABDQFBrBtBrBsoAgBBfiAEd3E2AgAMAgsCQCADIAcoAhBGBEAgByABNgIQDAELIAcgATYCFAsgAUUNAQsgASAHNgIYIAMoAhAiAgRAIAEgAjYCECACIAE2AhgLIAMoAhQiAkUNACABIAI2AhQgAiABNgIYCyADIAVPDQAgBSgCBCIEQQFxRQ0AAkACQAJAAkAgBEECcUUEQEHAGygCACAFRgRAQcAbIAM2AgBBtBtBtBsoAgAgAGoiADYCACADIABBAXI2AgQgA0G8GygCAEcNBkGwG0EANgIAQbwbQQA2AgAPC0G8GygCACIHIAVGBEBBvBsgAzYCAEGwG0GwGygCACAAaiIANgIAIAMgAEEBcjYCBCAAIANqIAA2AgAPCyAEQXhxIABqIQAgBSgCDCEBIARB/wFNBEAgBSgCCCICIAFGBEBBqBtBqBsoAgBBfiAEQQN2d3E2AgAMBQsgAiABNgIMIAEgAjYCCAwECyAFKAIYIQggASAFRwRAIAUoAggiAiABNgIMIAEgAjYCCAwDCyAFKAIUIgIEfyAFQRRqBSAFKAIQIgJFDQIgBUEQagshBANAIAQhBiACIgFBFGohBCABKAIUIgINACABQRBqIQQgASgCECICDQALIAZBADYCAAwCCyAFIARBfnE2AgQgAyAAQQFyNgIEIAAgA2ogADYCAAwDC0EAIQELIAhFDQACQCAFKAIcIgRBAnRB2B1qIgIoAgAgBUYEQCACIAE2AgAgAQ0BQawbQawbKAIAQX4gBHdxNgIADAILAkAgBSAIKAIQRgRAIAggATYCEAwBCyAIIAE2AhQLIAFFDQELIAEgCDYCGCAFKAIQIgIEQCABIAI2AhAgAiABNgIYCyAFKAIUIgJFDQAgASACNgIUIAIgATYCGAsgAyAAQQFyNgIEIAAgA2ogADYCACADIAdHDQBBsBsgADYCAA8LIABB/wFNBEAgAEF4cUHQG2ohAgJ/QagbKAIAIgRBASAAQQN2dCIAcUUEQEGoGyAAIARyNgIAIAIMAQsgAigCCAshACACIAM2AgggACADNgIMIAMgAjYCDCADIAA2AggPC0EfIQEgAEH///8HTQRAIABBJiAAQQh2ZyICa3ZBAXEgAkEBdGtBPmohAQsgAyABNgIcIANCADcCECABQQJ0QdgdaiEEAn8CQAJ/QawbKAIAIgZBASABdCICcUUEQEGsGyACIAZyNgIAIAQgAzYCAEEYIQFBCAwBCyAAQRkgAUEBdmtBACABQR9HG3QhASAEKAIAIQQDQCAEIgIoAgRBeHEgAEYNAiABQR12IQQgAUEBdCEBIAIgBEEEcWoiBigCECIEDQALIAYgAzYCEEEYIQEgAiEEQQgLIQAgAyICDAELIAIoAggiBCADNgIMIAIgAzYCCEEYIQBBCCEBQQALIQYgASADaiAENgIAIAMgAjYCDCAAIANqIAY2AgBByBtByBsoAgBBAWsiAEF/IAAbNgIACwtsAQJ/QaAbKAIAIgEgAEEHakF4cSICaiEAAkAgAkEAIAAgAU0bRQRAIAA/AEEQdE0NASAAPwBBEHRrQf//A2pBEHZAAEF/RgR/QQAFQQAQAEEBCw0BC0GkG0EwNgIAQX8PC0GgGyAANgIAIAELBgAgACQACwQAIwALuQUBDH8jAEEQayIMJAACQCAEQQdNBEAgDEIANwMIIAQEQCAMQQhqIAMgBPwKAAALQWwgACABIAIgDEEIakEIEAYiACAAIARLGyAAIABBiX9JGyEFDAELIAEoAgBBAWoiDkEBdCIIBEAgAEEAIAj8CwALIAMoAAAiBUEPcSIHQQpLBEBBVCEFDAELIAIgB0EFajYCACADIARqIgJBBGshCCACQQdrIQ0gB0EGaiEPQQQhBiAFQQR2IQVBICAHdCIJQQFyIQpBACECQQEhByADIQQDQAJAIAdBAXFFBEADQCAFQX9zQYCAgIB4cmgiB0EYSUUEQCACQSRqIQIgBCANTQR/IARBA2oFIAQgDWtBA3QgBmpBH3EhBiAICyIEKAAAIAZ2IQUMAQsLIAYgB0EecSILakECaiEGIAdBAXZBA2wgAmogBSALdkEDcWoiAiAOTw0BAn8gBCANSyAGQQN2IARqIgUgCEtxRQRAIAZBB3EhBiAFDAELIAQgCGtBA3QgBmpBH3EhBiAICyIEKAAAIAZ2IQULIAUgCUEBa3EiByAJQQF0QQFrIgsgCmsiEEkEfyAPQQFrBSAFIAtxIgUgEEEAIAUgCU4bayEHIA8LIQUgACACQQF0aiAHQQFrIgs7AQAgAkEBaiECIAUgBmohBiAJQQEgB2sgCyAHQQBKGyAKaiIKSgRAIApBAkgNAUEgIApnIgVrIQ9BASAFQR9zdCEJCyACIA5PDQAgC0EARyEHAn8gBCANSyAGQQN1IARqIgUgCEtxRQRAIAZBB3EhBiAFDAELIAYgBCAIa0EDdGpBH3EhBiAICyIEKAAAIAZ2IQUMAQsLQWwhBSAKQQFHDQAgAiAOSwRAQVAhBQwBCyAGQSBKDQAgASACQQFrNgIAIAQgBkEHakEDdWogA2shBQsgDEEQaiQAIAULrRkCEX8BfiMAQTBrIgckAEG4fyEIAkAgBUUNACAELAAAIglB/wFxIQ0CQAJAIAlBAEgEQCANQf4Aa0EBdiIGIAVPDQMgDUH/AGsiCEH/AUsNAiAEQQFqIQRBACEFA0AgBSAITwRAIAYhDQwDBSAAIAVqIg0gBCAFQQF2aiIJLQAAQQR2OgAAIA0gCS0AAEEPcToAASAFQQJqIQUMAQsACwALIAUgDU0NAiAHQf8BNgIEIAYgB0EEaiAHQQhqIARBAWoiCiANEAYiBEGIf0sEQCAEIQgMAwtBVCEIIAcoAggiC0EGSw0CIAcoAgQiBUEBdCIMQQJqrUIBIAuthiIYQQQgC3QiCUEIaq18fEILfEL8//////////8Ag0LoAlYNAkFSIQggBUH/AUsNAkHoAiAJa60gBUEBaiIQQQF0rSAYfEIIfFQNAiANIARrIRQgBCAKaiEVIAwgBkGABGoiDCAJakEEaiIWakECaiERIAZBhARqIRcgBkGGBGohE0GAgAIgC3RBEHYhCEEAIQVBASEOQQEgC3QiCkEBayISIQQDQCAFIBBGRQRAAkAgBiAFQQF0Ig9qLwEAIglB//8DRgRAIBMgBEECdGogBToAACAEQQFrIQRBASEJDAELIA5BACAIIAnBShshDgsgDyAWaiAJOwEAIAVBAWohBQwBCwsgBiAOOwGCBCAGIAs7AYAEAkAgBCASRgRAQgAhGEEAIQlBACEIA0AgCSAQRgRAIApBA3YgCkEBdmpBA2oiBkEBdCEJQQAhBEEAIQgDQCAIIApPDQQgCCARaiEQQQAhBQNAIAVBAkZFBEAgEyAFIAZsIARqIBJxQQJ0aiAFIBBqLQAAOgAAIAVBAWohBQwBCwsgCEECaiEIIAQgCWogEnEhBAwACwAFIAYgCUEBdGouAQAhBCAIIBFqIg8gGDcAAEEIIQUDQCAEIAVMRQRAIAUgD2ogGDcAACAFQQhqIQUMAQsLIBhCgYKEiJCgwIABfCEYIAlBAWohCSAEIAhqIQgMAQsACwALIApBA3YgCkEBdmpBA2ohEUEAIQhBACEFA0AgCCAQRkUEQEEAIQkgBiAIQQF0ai4BACIPQQAgD0EAShshDwNAIAkgD0ZFBEAgEyAFQQJ0aiAIOgAAA0AgBSARaiAScSIFIARLDQALIAlBAWohCQwBCwsgCEEBaiEIDAELC0F/IQggBQ0DCyALQR9rIQhBACEFA0AgBSAKRkUEQCAWIBcgBUECdGoiBC0AAkEBdGoiBiAGLwEAIgZBAWo7AQAgBCAIIAZnaiIJOgADIAQgBiAJdCAKazsBACAFQQFqIQUMAQsLAkACQCAOQf//A3EEQCAHQRxqIgQgFSAUEAgiCEGIf0sNAiAHQRRqIAQgDBAJIAdBDGogBCAMEAkgBygCICIIQSBLDQECQCAHAn8gBygCJCIEIAcoAixPBEAgByAEIAhBA3ZrIgU2AiQgCEEHcQwBCyAEIAcoAigiBUYNASAHIAQgBCAFayAIQQN2IgYgBCAGayAFSRsiBGsiBTYCJCAIIARBA3RrCyIINgIgIAcgBSgAADYCHAtBACEFA0ACQAJAIAhBIU8EQCAHQbAaNgIkDAELIAcCfyAHKAIkIgQgBygCLE8EQCAHIAQgCEEDdmsiBDYCJEEBIQkgCEEHcQwBCyAEIAcoAigiBkYNASAHIAQgCEEDdiIJIAQgBmsgBCAJayAGTyIJGyIGayIENgIkIAggBkEDdGsLNgIgIAcgBCgAADYCHCAJRSAFQfsBS3INACAAIAVqIgggB0EUaiAHQRxqIgQQCjoAACAIIAdBDGogBBAKOgABAkAgBygCICIGQSFPBEAgB0GwGjYCJAwBCyAHKAIkIgQgBygCLE8EQCAHIAZBB3E2AiAgByAEIAZBA3ZrIgQ2AiQgByAEKAAANgIcDAMLIAQgBygCKCIJRg0AIAcgBiAEIAlrIAZBA3YiBiAEIAZrIgYgCUkbIgpBA3RrNgIgIAcgBCAKayIENgIkIAcgBCgAADYCHCAGIAlPDQILIAVBAnIhBQsgAEEBaiEMAn8CQANAQbp/IQggBUH9AUsNByAAIAVqIgogB0EUaiAHQRxqEAo6AAAgBSAMaiELIAcoAiAiBkEgSw0BAkAgBwJ/IAcoAiQiBCAHKAIsTwRAIAcgBCAGQQN2ayIENgIkIAZBB3EMAQsgBCAHKAIoIglGDQEgByAEIAQgCWsgBkEDdiIOIAQgDmsgCUkbIglrIgQ2AiQgBiAJQQN0aws2AiAgByAEKAAANgIcCyAFQf0BRg0HIAsgB0EMaiAHQRxqEAo6AAAgBUECaiEFIAcoAiAiBkEgTQRAIAcCfyAHKAIkIgQgBygCLE8EQCAHIAQgBkEDdmsiCDYCJCAGQQdxDAELIAQgBygCKCIIRg0CIAcgBCAEIAhrIAZBA3YiCSAEIAlrIAhJGyIEayIINgIkIAYgBEEDdGsLNgIgIAcgCCgAADYCHAwBCwsgB0GwGjYCJCAAIAVqIAdBFGogB0EcahAKOgAAIApBA2oMAQsgB0GwGjYCJCALIAdBDGogB0EcahAKOgAAIApBAmoLIABrIQgMBAsgCCAHQRRqIAdBHGoiBBAKOgACIAggB0EMaiAEEAo6AAMgBUEEaiEFIAcoAiAhCAwACwALIAdBHGoiBCAVIBQQCCIIQYh/Sw0BIAdBFGogBCAMEAkgB0EMaiAEIAwQCSAHKAIgIghBIEsNAAJAIAcCfyAHKAIkIgQgBygCLE8EQCAHIAQgCEEDdmsiBTYCJCAIQQdxDAELIAQgBygCKCIFRg0BIAcgBCAEIAVrIAhBA3YiBiAEIAZrIAVJGyIEayIFNgIkIAggBEEDdGsLIgg2AiAgByAFKAAANgIcC0EAIQUDQAJAAkAgCEEhTwRAIAdBsBo2AiQMAQsgBwJ/IAcoAiQiBCAHKAIsTwRAIAcgBCAIQQN2ayIENgIkQQEhCSAIQQdxDAELIAQgBygCKCIGRg0BIAcgBCAIQQN2IgkgBCAGayAEIAlrIAZPIgkbIgZrIgQ2AiQgCCAGQQN0aws2AiAgByAEKAAANgIcIAlFIAVB+wFLcg0AIAAgBWoiCCAHQRRqIAdBHGoiBBALOgAAIAggB0EMaiAEEAs6AAECQCAHKAIgIgZBIU8EQCAHQbAaNgIkDAELIAcoAiQiBCAHKAIsTwRAIAcgBkEHcTYCICAHIAQgBkEDdmsiBDYCJCAHIAQoAAA2AhwMAwsgBCAHKAIoIglGDQAgByAGIAQgCWsgBkEDdiIGIAQgBmsiBiAJSRsiCkEDdGs2AiAgByAEIAprIgQ2AiQgByAEKAAANgIcIAYgCU8NAgsgBUECciEFCyAAQQFqIQwCfwJAA0BBun8hCCAFQf0BSw0GIAAgBWoiCiAHQRRqIAdBHGoQCzoAACAFIAxqIQsgBygCICIGQSBLDQECQCAHAn8gBygCJCIEIAcoAixPBEAgByAEIAZBA3ZrIgQ2AiQgBkEHcQwBCyAEIAcoAigiCUYNASAHIAQgBCAJayAGQQN2Ig4gBCAOayAJSRsiCWsiBDYCJCAGIAlBA3RrCzYCICAHIAQoAAA2AhwLIAVB/QFGDQYgCyAHQQxqIAdBHGoQCzoAACAFQQJqIQUgBygCICIGQSBNBEAgBwJ/IAcoAiQiBCAHKAIsTwRAIAcgBCAGQQN2ayIINgIkIAZBB3EMAQsgBCAHKAIoIghGDQIgByAEIAQgCGsgBkEDdiIJIAQgCWsgCEkbIgRrIgg2AiQgBiAEQQN0aws2AiAgByAIKAAANgIcDAELCyAHQbAaNgIkIAAgBWogB0EUaiAHQRxqEAs6AAAgCkEDagwBCyAHQbAaNgIkIAsgB0EMaiAHQRxqEAs6AAAgCkECagsgAGshCAwDCyAIIAdBFGogB0EcaiIEEAs6AAIgCCAHQQxqIAQQCzoAAyAFQQRqIQUgBygCICEIDAALAAtBbCEICyAIQYh/Sw0CC0EAIQUgAUEAQTT8CwAgCCEGQQAhBANAIAUgBkcEQCAAIAVqIggtAAAiCUEMSw0CIAEgCUECdGoiCSAJKAIAQQFqNgIAIAVBAWohBUEBIAgtAAB0QQF1IARqIQQMAQsLQWwhCCAERQ0BIARnIgVBHHNBC0sNASADQSAgBWsiAzYCAEGAgICAeEEBIAN0IARrIgNnIgR2IANHDQEgACAGakEgIARrIgA6AAAgASAAQQJ0aiIAIAAoAgBBAWo2AgAgASgCBCIAQQJJIABBAXFyDQEgAiAGQQFqNgIAIA1BAWohCAwBC0FsIQgLIAdBMGokACAIC/UBAQF/IAJFBEAgAEIANwIAIABBADYCECAAQgA3AghBuH8PCyAAIAE2AgwgACABQQRqNgIQIAJBBE8EQCAAIAEgAmoiAUEEayIDNgIIIAAgAygAADYCACABQQFrLQAAIgEEQCAAQQggAWdBH3NrNgIEIAIPCyAAQQA2AgRBfw8LIAAgATYCCCAAIAEtAAAiAzYCAAJAAkACQCACQQJrDgIBAAILIAAgAS0AAkEQdCADciIDNgIACyAAIAEtAAFBCHQgA2o2AgALIAEgAmpBAWstAAAiAUUEQCAAQQA2AgRBbA8LIAAgAWcgAkEDdGtBCWo2AgQgAguuAQEEfyABIAIvAQAiAyABKAIEaiIENgIEIAAgA0ECdEGwGWooAgAgASgCAEEAIARrdnE2AgACQCAEQSFPBEAgAUGwGjYCCAwBCyABKAIIIgMgASgCEE8EQCABEAwMAQsgAyABKAIMIgVGDQAgASADIAMgBWsgBEEDdiIGIAMgBmsgBUkbIgNrIgU2AgggASAEIANBA3RrNgIEIAEgBSgAADYCAAsgACACQQRqNgIEC0wBBH8gACgCBCAAKAIAQQJ0aiICLQACIQMgAi8BACEEIAEgASgCBCIFIAItAAMiAmo2AgQgACAEIAEoAgAgBXRBACACa3ZqNgIAIAMLVgEEfyAAKAIEIAAoAgBBAnRqIgItAAIhAyACLwEAIQQgASACLQADIgIgASgCBGoiBTYCBCAAIAQgAkECdEGwGWooAgAgASgCAEEAIAVrdnFqNgIAIAMLLwEBfyAAIAAoAgQiAUEHcTYCBCAAIAAoAgggAUEDdmsiATYCCCAAIAEoAAA2AgALCAAgAEGIf0sLxQkCDX8CfiMAQRBrIgskACALQQA2AgwgC0EANgIIAn8CQCADQdQJaiIFIAMgC0EIaiALQQxqIAEgAiADQegAahAHIhBBiH9LDQAgCygCCCEIQQogACgCACIJQf8BcSIHIAdBCk8bQQFqIgQgCygCDCIBTwRAAkAgASAETw0AIAQgAWshAkEAIQEDQCABIAhGBEAgBCEBA0AgASACTQRAA0AgAkUNBSADIAJBAnRqQQA2AgAgAkEBayECDAALAAUgAyABQQJ0aiADIAEgAmtBAnRqKAIANgIAIAFBAWshAQwBCwALAAUgASAFaiIKIAJBACAKLQAAIgobIApqOgAAIAFBAWohAQwBCwALAAsgBCEBC0FUIAEgB0EBaksNARogAEEEaiEKIAAgCUH/gYB4cSABQRB0QYCA/AdxcjYCACABQQFqIQ4gA0E0aiEEQQAhAUEAIQIDQCACIA5GRQRAIAMgAkECdCIAaigCACEHIAAgBGogATYCACACQQFqIQIgASAHaiEBDAELCyADQdQHaiEHIAhBA2shAUEAIQADQAJAQQAhAiAAIAFOBEADQCAAIAhODQIgBCAAIAVqLQAAQQJ0aiIBIAEoAgAiAUEBajYCACABIAdqIAA6AAAgAEEBaiEADAALAAUDQCACQQRGRQRAIAQgBSAAIAJyIglqLQAAQQJ0aiIMIAwoAgAiDEEBajYCACAHIAxqIAk6AAAgAkEBaiECDAELCyAAQQRqIQAMAgsACwsgAygCACEIQQAhAEEBIQkDQCAJIA5GDQEgDiAJayEEIAMgCUECdGooAgAhBQJAAkACQAJAAkACQEEBIAl0QQF1IgxBAWsOCAABBAIEBAQDBAtBACECIAVBACAFQQBKGyEGIAAhAQNAIAIgBkYNBSAKIAFBAXRqIg0gByACIAhqai0AADoAASANIAQ6AAAgAkEBaiECIAFBAWohAQwACwALQQAhAiAFQQAgBUEAShshDSAAIQEDQCACIA1GDQQgCiABQQF0aiIGIAcgAiAIamotAAAiDzoAAyAGIAQ6AAIgBiAPOgABIAYgBDoAACACQQFqIQIgAUECaiEBDAALAAtBACECIAVBACAFQQBKGyEGIARB/wFxrSERIAAhAQNAIAIgBkYNAyAKIAFBAXRqIAcgAiAIamoxAABCCIYgEYRCgYCEgJCAwAB+NwAAIAJBAWohAiABQQRqIQEMAAsAC0EAIQIgBUEAIAVBAEobIQYgBEH/AXGtIREgACEBA0AgAiAGRg0CIAogAUEBdGoiBCAHIAIgCGpqMQAAQgiGIBGEQoGAhICQgMAAfiISNwAIIAQgEjcAACACQQFqIQIgAUEIaiEBDAALAAtBACEBIAVBACAFQQBKGyENIARB/wFxrSESIAAhBANAIAEgDUYNASAKIARBAXRqIQ8gByABIAhqajEAAEIIhiAShEKBgISAkIDAAH4hEUEAIQIDQCACIAxORQRAIA8gAkEBdGoiBiARNwAYIAYgETcAECAGIBE3AAggBiARNwAAIAJBEGohAgwBCwsgAUEBaiEBIAQgDGohBAwACwALIAlBAWohCSAFIAhqIQggBSAMbCAAaiEADAALAAsgEAshAiALQRBqJAAgAgufAwIBfgF/AkACQAJAAkACQAJAQQEgBCADa3QiCEEBaw4IAAEEAgQEBAMECyAGQRh0IANBEHRqIQMDQCABIAJGDQUgACABLQAAIgQgBEEIdCAFciAGQQFGGyADcjYBACABQQFqIQEgAEEEaiEADAALAAsgBkEYdCADQRB0aiEDA0AgASACRg0EIAAgAS0AACIEIARBCHQgBXIgBkEBRhsgA3IiBDYBBCAAIAQ2AQAgAUEBaiEBIABBCGohAAwACwALA0AgASACRg0DIAAgAS0AACADIAUgBhAQIgc3AQggACAHNwEAIAFBAWohASAAQRBqIQAMAAsACwNAIAEgAkYNAiAAIAEtAAAgAyAFIAYQECIHNwEYIAAgBzcBECAAIAc3AQggACAHNwEAIAFBAWohASAAQSBqIQAMAAsACwNAIAEgAkYNASAAIAhBAnRqIQQgAS0AACADIAUgBhAQIQcDQCAAIARGRQRAIAAgBzcBGCAAIAc3ARAgACAHNwEIIAAgBzcBACAAQSBqIQAMAQsLIAFBAWohASAEIQAMAAsACwsmACADQRh0IAFBEHRqIAAgAEEIdCACciADQQFGG3KtQoGAgIAQfgu7BgEKfyMAQSBrIgUkACAELwECIQsgBUEMaiACIAMQCCIDQYh/TQRAIARBBGohCCAAIAFqIQkCQAJAAkAgAUEETwRAIAlBA2shDUEAIAtrQR9xIQwgBSgCFCEDIAUoAhghByAFKAIcIQ4gBSgCDCEGIAUoAhAhBANAIARBIEsEQEGwGiEDDAQLAkAgAyAOTwRAIARBB3EhAiAEQQN2IQZBASEEDAELIAMgB0YNBCAEIARBA3YiAiADIAdrIAMgAmsgB08iBBsiBkEDdGshAgsgAyAGayIDKAAAIQYgBEUgACANT3INAiAIIAYgAnQgDHZBAXRqIgQtAAAhCiAAIAQtAAE6AAAgCCAGIAIgCmoiAnQgDHZBAXRqIgQtAAAhCiAAIAQtAAE6AAEgAiAKaiEEIABBAmohAAwACwALIAUoAhAiBEEhTwRAIAVBsBo2AhQMAwsgBSgCFCIDIAUoAhxPBEAgBSAEQQdxIgI2AhAgBSADIARBA3ZrIgM2AhQgBSADKAAANgIMIAIhBAwDCyADIAUoAhgiAkYNAiAFIAQgAyACayAEQQN2IgQgAyAEayACSRsiAkEDdGsiBDYCECAFIAMgAmsiAjYCFCAFIAIoAAA2AgwMAgsgAiEECyAFIAQ2AhAgBSADNgIUIAUgBjYCDAtBACALa0EfcSEHA0ACQCAEQSFPBEAgBUGwGjYCFAwBCyAFAn8gBSgCFCICIAUoAhxPBEAgBSACIARBA3ZrIgM2AhRBASEGIARBB3EMAQsgAiAFKAIYIgNGDQEgBSACIARBA3YiBiACIANrIAIgBmsgA08iBhsiAmsiAzYCFCAEIAJBA3RrCyIENgIQIAUgAygAACICNgIMIAZFIAAgCU9yDQAgCCACIAR0IAd2QQF0aiICLQABIQMgBSAEIAItAABqNgIQIAAgAzoAACAAQQFqIQAgBSgCECEEDAELCwNAIAAgCU9FBEAgCCAFKAIMIAUoAhAiAnQgB3ZBAXRqIgMtAAEhBCAFIAIgAy0AAGo2AhAgACAEOgAAIABBAWohAAwBCwtBbEFsIAEgBSgCEEEgRxsgBSgCFCAFKAIYRxshAwsgBUEgaiQAIAML/SEBGX8jAEHQAGsiBSQAQWwhBgJAIAFBBkkgA0EKSXINAAJAIAMgAi8ABCIHIAIvAAAiCiACLwACIglqakEGaiILSQ0AIAAgAUEDakECdiIMaiIIIAxqIg0gDGoiDCAAIAFqIhFLDQAgBC8BAiEOIAVBPGogAkEGaiICIAoQCCIGQYh/Sw0BIAVBKGogAiAKaiICIAkQCCIGQYh/Sw0BIAVBFGogAiAJaiICIAcQCCIGQYh/Sw0BIAUgAiAHaiADIAtrEAgiBkGIf0sNASAEQQRqIQogEUEDayESAkAgESAMa0EESQRAIAwhAyANIQIgCCEEDAELQQAgDmtBH3EhBkEAIQkgDCEDIA0hAiAIIQQDQCAJQQFxIAMgEk9yDQEgACAKIAUoAjwiCSAFKAJAIgt0IAZ2QQJ0aiIHLwEAOwAAIActAAIhECAHLQADIQ8gBCAKIAUoAigiEyAFKAIsIhR0IAZ2QQJ0aiIHLwEAOwAAIActAAIhFSAHLQADIRYgAiAKIAUoAhQiFyAFKAIYIhh0IAZ2QQJ0aiIHLwEAOwAAIActAAIhGSAHLQADIRogAyAKIAUoAgAiGyAFKAIEIhx0IAZ2QQJ0aiIHLwEAOwAAIActAAIhHSAHLQADIQcgACAPaiIPIAogCSALIBBqIgl0IAZ2QQJ0aiIALwEAOwAAIAUgCSAALQACajYCQCAALQADIQkgBCAWaiIEIAogEyAUIBVqIgt0IAZ2QQJ0aiIALwEAOwAAIAUgCyAALQACajYCLCAALQADIQsgAiAaaiICIAogFyAYIBlqIhB0IAZ2QQJ0aiIALwEAOwAAIAUgECAALQACajYCGCAALQADIRAgAyAHaiIHIAogGyAcIB1qIgB0IAZ2QQJ0aiIDLwEAOwAAIAUgACADLQACajYCBCAJIA9qIQAgBCALaiEEIAIgEGohAiAHIAMtAANqIQMgBUE8ahATIAVBKGoQE3IgBUEUahATciAFEBNyQQBHIQkMAAsACyAAIAhLIAQgDUtyDQBBbCEGIAIgDEsNAQJAAkAgCCAAayIJQQRPBEAgCEEDayEQQQAgDmtBH3EhCyAFKAJAIQYDQCAGQSFPBEAgBUGwGjYCRAwDCyAFAn8gBSgCRCIHIAUoAkxPBEAgBSAHIAZBA3ZrIgk2AkRBASEHIAZBB3EMAQsgByAFKAJIIglGDQMgBSAHIAZBA3YiDyAHIAlrIAcgD2sgCU8iBxsiD2siCTYCRCAGIA9BA3RrCyIGNgJAIAUgCSgAACIJNgI8IAdFIAAgEE9yDQIgACAKIAkgBnQgC3ZBAnRqIgYvAQA7AAAgBSAFKAJAIAYtAAJqIgc2AkAgACAGLQADaiIJIAogBSgCPCAHdCALdkECdGoiAC8BADsAACAFIAUoAkAgAC0AAmoiBjYCQCAJIAAtAANqIQAMAAsACyAFKAJAIgZBIU8EQCAFQbAaNgJEDAILIAUoAkQiCyAFKAJMTwRAIAUgBkEHcSIHNgJAIAUgCyAGQQN2ayIGNgJEIAUgBigAADYCPCAHIQYMAgsgCyAFKAJIIgdGDQEgBSAGIAsgB2sgBkEDdiIGIAsgBmsgB0kbIgdBA3RrIgY2AkAgBSALIAdrIgc2AkQgBSAHKAAANgI8DAELIAggAGshCQsCQCAJQQJJDQAgCEECayELQQAgDmtBH3EhEANAAkAgBkEhTwRAIAVBsBo2AkQMAQsgBQJ/IAUoAkQiByAFKAJMTwRAIAUgByAGQQN2ayIJNgJEQQEhByAGQQdxDAELIAcgBSgCSCIJRg0BIAUgByAGQQN2Ig8gByAJayAHIA9rIAlPIgcbIg9rIgk2AkQgBiAPQQN0awsiBjYCQCAFIAkoAAAiCTYCPCAHRSAAIAtLcg0AIAAgCiAJIAZ0IBB2QQJ0aiIHLwEAOwAAIAUgBSgCQCAHLQACaiIGNgJAIAAgBy0AA2ohAAwBCwsDQCAAIAtLDQEgACAKIAUoAjwgBnQgEHZBAnRqIgcvAQA7AAAgBSAFKAJAIActAAJqIgY2AkAgACAHLQADaiEADAALAAsCQCAAIAhPDQAgACAKIAUoAjwgBnRBACAOa3ZBAnRqIgAtAAA6AAAgBQJ/IAAtAANBAUYEQCAFKAJAIAAtAAJqDAELIAUoAkAiCEEfSw0BQSAgCCAALQACaiIAIABBIE8bCzYCQAsCQAJAIA0gBGsiBkEETwRAIA1BA2shCUEAIA5rQR9xIQcgBSgCLCEAA0AgAEEhTwRAIAVBsBo2AjAMAwsgBQJ/IAUoAjAiCCAFKAI4TwRAIAUgCCAAQQN2ayIGNgIwQQEhCCAAQQdxDAELIAggBSgCNCIGRg0DIAUgCCAAQQN2IgsgCCAGayAIIAtrIAZPIggbIgtrIgY2AjAgACALQQN0awsiADYCLCAFIAYoAAAiBjYCKCAIRSAEIAlPcg0CIAQgCiAGIAB0IAd2QQJ0aiIALwEAOwAAIAUgBSgCLCAALQACaiIINgIsIAQgAC0AA2oiBiAKIAUoAiggCHQgB3ZBAnRqIgQvAQA7AAAgBSAFKAIsIAQtAAJqIgA2AiwgBiAELQADaiEEDAALAAsgBSgCLCIAQSFPBEAgBUGwGjYCMAwCCyAFKAIwIgcgBSgCOE8EQCAFIABBB3EiCDYCLCAFIAcgAEEDdmsiADYCMCAFIAAoAAA2AiggCCEADAILIAcgBSgCNCIIRg0BIAUgACAHIAhrIABBA3YiACAHIABrIAhJGyIIQQN0ayIANgIsIAUgByAIayIINgIwIAUgCCgAADYCKAwBCyANIARrIQYLAkAgBkECSQ0AIA1BAmshCUEAIA5rQR9xIQsDQAJAIABBIU8EQCAFQbAaNgIwDAELIAUCfyAFKAIwIgggBSgCOE8EQCAFIAggAEEDdmsiBjYCMEEBIQcgAEEHcQwBCyAIIAUoAjQiBkYNASAFIAggAEEDdiIHIAggBmsgCCAHayAGTyIHGyIIayIGNgIwIAAgCEEDdGsLIgA2AiwgBSAGKAAAIgg2AiggB0UgBCAJS3INACAEIAogCCAAdCALdkECdGoiCC8BADsAACAFIAUoAiwgCC0AAmoiADYCLCAEIAgtAANqIQQMAQsLA0AgBCAJSw0BIAQgCiAFKAIoIAB0IAt2QQJ0aiIILwEAOwAAIAUgBSgCLCAILQACaiIANgIsIAQgCC0AA2ohBAwACwALAkAgBCANTw0AIAQgCiAFKAIoIAB0QQAgDmt2QQJ0aiIALQAAOgAAIAUCfyAALQADQQFGBEAgBSgCLCAALQACagwBCyAFKAIsIgRBH0sNAUEgIAQgAC0AAmoiACAAQSBPGws2AiwLAkACQCAMIAJrIgZBBE8EQCAMQQNrIQdBACAOa0EfcSEIIAUoAhghAANAIABBIU8EQCAFQbAaNgIcDAMLIAUCfyAFKAIcIgQgBSgCJE8EQCAFIAQgAEEDdmsiBjYCHEEBIQkgAEEHcQwBCyAEIAUoAiAiDUYNAyAFIAQgAEEDdiIGIAQgDWsgBCAGayANTyIJGyIEayIGNgIcIAAgBEEDdGsLIgA2AhggBSAGKAAAIgQ2AhQgCUUgAiAHT3INAiACIAogBCAAdCAIdkECdGoiAC8BADsAACAFIAUoAhggAC0AAmoiBDYCGCACIAAtAANqIg0gCiAFKAIUIAR0IAh2QQJ0aiICLwEAOwAAIAUgBSgCGCACLQACaiIANgIYIA0gAi0AA2ohAgwACwALIAUoAhgiAEEhTwRAIAVBsBo2AhwMAgsgBSgCHCIIIAUoAiRPBEAgBSAAQQdxIgQ2AhggBSAIIABBA3ZrIgA2AhwgBSAAKAAANgIUIAQhAAwCCyAIIAUoAiAiBEYNASAFIAAgCCAEayAAQQN2IgAgCCAAayAESRsiBEEDdGsiADYCGCAFIAggBGsiBDYCHCAFIAQoAAA2AhQMAQsgDCACayEGCwJAIAZBAkkNACAMQQJrIQ1BACAOa0EfcSEHA0ACQCAAQSFPBEAgBUGwGjYCHAwBCyAFAn8gBSgCHCIEIAUoAiRPBEAgBSAEIABBA3ZrIgY2AhxBASEIIABBB3EMAQsgBCAFKAIgIghGDQEgBSAEIABBA3YiBiAEIAhrIAQgBmsgCE8iCBsiBGsiBjYCHCAAIARBA3RrCyIANgIYIAUgBigAACIENgIUIAhFIAIgDUtyDQAgAiAKIAQgAHQgB3ZBAnRqIgQvAQA7AAAgBSAFKAIYIAQtAAJqIgA2AhggAiAELQADaiECDAELCwNAIAIgDUsNASACIAogBSgCFCAAdCAHdkECdGoiBC8BADsAACAFIAUoAhggBC0AAmoiADYCGCACIAQtAANqIQIMAAsACwJAIAIgDE8NACACIAogBSgCFCAAdEEAIA5rdkECdGoiAC0AADoAACAFAn8gAC0AA0EBRgRAIAUoAhggAC0AAmoMAQsgBSgCGCICQR9LDQFBICACIAAtAAJqIgAgAEEgTxsLNgIYCwJAIBEgA2tBBE8EQEEAIA5rQR9xIQQgBSgCBCEAA0AgAEEhTwRAIAVBsBo2AggMAwsgBQJ/IAUoAggiAiAFKAIQTwRAIAUgAiAAQQN2ayIGNgIIQQEhAiAAQQdxDAELIAIgBSgCDCIMRg0DIAUgAiAAQQN2IgggAiAMayACIAhrIAxPIgIbIgxrIgY2AgggACAMQQN0awsiADYCBCAFIAYoAAAiDDYCACACRSADIBJPcg0CIAMgCiAMIAB0IAR2QQJ0aiIALwEAOwAAIAUgBSgCBCAALQACaiICNgIEIAMgAC0AA2oiAyAKIAUoAgAgAnQgBHZBAnRqIgIvAQA7AAAgBSAFKAIEIAItAAJqIgA2AgQgAyACLQADaiEDDAALAAsgBSgCBCIAQSFPBEAgBUGwGjYCCAwBCyAFKAIIIgQgBSgCEE8EQCAFIABBB3EiAjYCBCAFIAQgAEEDdmsiADYCCCAFIAAoAAA2AgAgAiEADAELIAQgBSgCDCICRg0AIAUgACAEIAJrIABBA3YiACAEIABrIAJJGyICQQN0ayIANgIEIAUgBCACayICNgIIIAUgAigAADYCAAsCQCARIANrQQJJDQAgEUECayEEQQAgDmtBH3EhDANAAkAgAEEhTwRAIAVBsBo2AggMAQsgBQJ/IAUoAggiAiAFKAIQTwRAIAUgAiAAQQN2ayIGNgIIQQEhCSAAQQdxDAELIAIgBSgCDCIIRg0BIAUgAiAAQQN2Ig0gAiAIayACIA1rIAhPIgkbIgJrIgY2AgggACACQQN0awsiADYCBCAFIAYoAAAiAjYCACAJRSADIARLcg0AIAMgCiACIAB0IAx2QQJ0aiICLwEAOwAAIAUgBSgCBCACLQACaiIANgIEIAMgAi0AA2ohAwwBCwsDQCADIARLDQEgAyAKIAUoAgAgAHQgDHZBAnRqIgIvAQA7AAAgBSAFKAIEIAItAAJqIgA2AgQgAyACLQADaiEDDAALAAsCQCADIBFPDQAgAyAKIAUoAgAgAHRBACAOa3ZBAnRqIgItAAA6AAAgAi0AA0EBRgRAIAUoAgQgAi0AAmohAAwBCyAFKAIEIgBBH0sNAEEgIAAgAi0AAmoiACAAQSBPGyEAC0FsQWxBbEFsQWxBbEFsQWwgASAAQSBHGyAFKAIIIAUoAgxHGyAFKAIYQSBHGyAFKAIcIAUoAiBHGyAFKAIsQSBHGyAFKAIwIAUoAjRHGyAFKAJAQSBHGyAFKAJEIAUoAkhHGyEGDAELQWwhBgsgBUHQAGokACAGCxkAIAAoAgggACgCEEkEQEEDDwsgABAMQQAL8xwBFn8jAEHQAGsiBSQAQWwhCAJAIAFBBkkgA0EKSXINAAJAIAMgAi8ABCIGIAIvAAAiCiACLwACIglqakEGaiISSQ0AIAAgAUEDakECdiILaiIHIAtqIg4gC2oiCyAAIAFqIg9LDQAgBC8BAiEMIAVBPGogAkEGaiICIAoQCCIIQYh/Sw0BIAVBKGogAiAKaiICIAkQCCIIQYh/Sw0BIAVBFGogAiAJaiICIAYQCCIIQYh/Sw0BIAUgAiAGaiADIBJrEAgiCEGIf0sNASAEQQRqIQogD0EDayESAkAgDyALa0EESQRAIAshAyAOIQIgByEEDAELQQAgDGtBH3EhCEEAIQYgCyEDIA4hAiAHIQQDQCAGQQFxIAMgEk9yDQEgCiAFKAI8IgYgBSgCQCIJdCAIdkEBdGoiDS0AACEQIAAgDS0AAToAACAKIAUoAigiDSAFKAIsIhF0IAh2QQF0aiITLQAAIRUgBCATLQABOgAAIAogBSgCFCITIAUoAhgiFnQgCHZBAXRqIhQtAAAhFyACIBQtAAE6AAAgCiAFKAIAIhQgBSgCBCIYdCAIdkEBdGoiGS0AACEaIAMgGS0AAToAACAKIAYgCSAQaiIGdCAIdkEBdGoiCS0AASEQIAUgBiAJLQAAajYCQCAAIBA6AAEgCiANIBEgFWoiBnQgCHZBAXRqIgktAAEhDSAFIAYgCS0AAGo2AiwgBCANOgABIAogEyAWIBdqIgZ0IAh2QQF0aiIJLQABIQ0gBSAGIAktAABqNgIYIAIgDToAASAKIBQgGCAaaiIGdCAIdkEBdGoiCS0AASENIAUgBiAJLQAAajYCBCADIA06AAEgA0ECaiEDIAJBAmohAiAEQQJqIQQgAEECaiEAIAVBPGoQEyAFQShqEBNyIAVBFGoQE3IgBRATckEARyEGDAALAAsgACAHSyAEIA5Lcg0AQWwhCCACIAtLDQECQCAHIABrQQROBEAgB0EDayEQQQAgDGtBH3EhDQNAIAUoAkAiBkEhTwRAIAVBsBo2AkQMAwsgBQJ/IAUoAkQiCCAFKAJMTwRAIAUgCCAGQQN2ayIINgJEQQEhCSAGQQdxDAELIAggBSgCSCIJRg0DIAUgCCAGQQN2IhEgCCAJayAIIBFrIAlPIgkbIhFrIgg2AkQgBiARQQN0awsiBjYCQCAFIAgoAAAiCDYCPCAJRSAAIBBPcg0CIAogCCAGdCANdkEBdGoiCC0AASEJIAUgBiAILQAAajYCQCAAIAk6AAAgCiAFKAI8IAUoAkAiBnQgDXZBAXRqIggtAAEhCSAFIAYgCC0AAGo2AkAgACAJOgABIABBAmohAAwACwALIAUoAkAiBkEhTwRAIAVBsBo2AkQMAQsgBSgCRCIJIAUoAkxPBEAgBSAGQQdxIgg2AkAgBSAJIAZBA3ZrIgY2AkQgBSAGKAAANgI8IAghBgwBCyAJIAUoAkgiCEYNACAFIAYgCSAIayAGQQN2IgYgCSAGayAISRsiCEEDdGsiBjYCQCAFIAkgCGsiCDYCRCAFIAgoAAA2AjwLQQAgDGtBH3EhCANAAkAgBkEhTwRAIAVBsBo2AkQMAQsgBQJ/IAUoAkQiCSAFKAJMTwRAIAUgCSAGQQN2ayIMNgJEQQEhCSAGQQdxDAELIAkgBSgCSCIMRg0BIAUgCSAGQQN2Ig0gCSAMayAJIA1rIAxPIgkbIg1rIgw2AkQgBiANQQN0awsiBjYCQCAFIAwoAAAiDDYCPCAJRSAAIAdPcg0AIAogDCAGdCAIdkEBdGoiCS0AASEMIAUgBiAJLQAAajYCQCAAIAw6AAAgAEEBaiEAIAUoAkAhBgwBCwsDQCAAIAdPRQRAIAogBSgCPCAFKAJAIgZ0IAh2QQF0aiIJLQABIQwgBSAGIAktAABqNgJAIAAgDDoAACAAQQFqIQAMAQsLAkAgDiAEa0EETgRAIA5BA2shCQNAIAUoAiwiAEEhTwRAIAVBsBo2AjAMAwsgBQJ/IAUoAjAiByAFKAI4TwRAIAUgByAAQQN2ayIGNgIwQQEhByAAQQdxDAELIAcgBSgCNCIGRg0DIAUgByAAQQN2IgwgByAGayAHIAxrIAZPIgcbIgxrIgY2AjAgACAMQQN0awsiADYCLCAFIAYoAAAiBjYCKCAHRSAEIAlPcg0CIAogBiAAdCAIdkEBdGoiBy0AASEGIAUgACAHLQAAajYCLCAEIAY6AAAgCiAFKAIoIAUoAiwiAHQgCHZBAXRqIgctAAEhBiAFIAAgBy0AAGo2AiwgBCAGOgABIARBAmohBAwACwALIAUoAiwiAEEhTwRAIAVBsBo2AjAMAQsgBSgCMCIGIAUoAjhPBEAgBSAAQQdxIgc2AiwgBSAGIABBA3ZrIgA2AjAgBSAAKAAANgIoIAchAAwBCyAGIAUoAjQiB0YNACAFIAAgBiAHayAAQQN2IgAgBiAAayAHSRsiB0EDdGsiADYCLCAFIAYgB2siBzYCMCAFIAcoAAA2AigLA0ACQCAAQSFPBEAgBUGwGjYCMAwBCyAFAn8gBSgCMCIHIAUoAjhPBEAgBSAHIABBA3ZrIgY2AjBBASEHIABBB3EMAQsgByAFKAI0IgZGDQEgBSAHIABBA3YiCSAHIAZrIAcgCWsgBk8iBxsiCWsiBjYCMCAAIAlBA3RrCyIANgIsIAUgBigAACIGNgIoIAdFIAQgDk9yDQAgCiAGIAB0IAh2QQF0aiIHLQABIQYgBSAAIActAABqNgIsIAQgBjoAACAEQQFqIQQgBSgCLCEADAELCwNAIAQgDk9FBEAgCiAFKAIoIAUoAiwiAHQgCHZBAXRqIgctAAEhBiAFIAAgBy0AAGo2AiwgBCAGOgAAIARBAWohBAwBCwsCQCALIAJrQQROBEAgC0EDayEOA0AgBSgCGCIAQSFPBEAgBUGwGjYCHAwDCyAFAn8gBSgCHCIEIAUoAiRPBEAgBSAEIABBA3ZrIgQ2AhxBASEGIABBB3EMAQsgBCAFKAIgIgdGDQMgBSAEIABBA3YiBiAEIAdrIAQgBmsgB08iBhsiB2siBDYCHCAAIAdBA3RrCyIANgIYIAUgBCgAACIENgIUIAZFIAIgDk9yDQIgCiAEIAB0IAh2QQF0aiIELQABIQcgBSAAIAQtAABqNgIYIAIgBzoAACAKIAUoAhQgBSgCGCIAdCAIdkEBdGoiBC0AASEHIAUgACAELQAAajYCGCACIAc6AAEgAkECaiECDAALAAsgBSgCGCIAQSFPBEAgBUGwGjYCHAwBCyAFKAIcIgcgBSgCJE8EQCAFIABBB3EiBDYCGCAFIAcgAEEDdmsiADYCHCAFIAAoAAA2AhQgBCEADAELIAcgBSgCICIERg0AIAUgACAHIARrIABBA3YiACAHIABrIARJGyIEQQN0ayIANgIYIAUgByAEayIENgIcIAUgBCgAADYCFAsDQAJAIABBIU8EQCAFQbAaNgIcDAELIAUCfyAFKAIcIgQgBSgCJE8EQCAFIAQgAEEDdmsiBDYCHEEBIQYgAEEHcQwBCyAEIAUoAiAiB0YNASAFIAQgAEEDdiIOIAQgB2sgBCAOayAHTyIGGyIHayIENgIcIAAgB0EDdGsLIgA2AhggBSAEKAAAIgQ2AhQgBkUgAiALT3INACAKIAQgAHQgCHZBAXRqIgQtAAEhByAFIAAgBC0AAGo2AhggAiAHOgAAIAJBAWohAiAFKAIYIQAMAQsLA0AgAiALT0UEQCAKIAUoAhQgBSgCGCIAdCAIdkEBdGoiBC0AASEHIAUgACAELQAAajYCGCACIAc6AAAgAkEBaiECDAELCwJAIA8gA2tBBE4EQANAIAUoAgQiAEEhTwRAIAVBsBo2AggMAwsgBQJ/IAUoAggiAiAFKAIQTwRAIAUgAiAAQQN2ayIENgIIQQEhAiAAQQdxDAELIAIgBSgCDCIERg0DIAUgAiAAQQN2IgsgAiAEayACIAtrIARPIgIbIgtrIgQ2AgggACALQQN0awsiADYCBCAFIAQoAAAiBDYCACACRSADIBJPcg0CIAogBCAAdCAIdkEBdGoiAi0AASEEIAUgACACLQAAajYCBCADIAQ6AAAgCiAFKAIAIAUoAgQiAHQgCHZBAXRqIgItAAEhBCAFIAAgAi0AAGo2AgQgAyAEOgABIANBAmohAwwACwALIAUoAgQiAEEhTwRAIAVBsBo2AggMAQsgBSgCCCIEIAUoAhBPBEAgBSAAQQdxIgI2AgQgBSAEIABBA3ZrIgA2AgggBSAAKAAANgIAIAIhAAwBCyAEIAUoAgwiAkYNACAFIAAgBCACayAAQQN2IgAgBCAAayACSRsiAkEDdGsiADYCBCAFIAQgAmsiAjYCCCAFIAIoAAA2AgALA0ACQCAAQSFPBEAgBUGwGjYCCAwBCyAFAn8gBSgCCCICIAUoAhBPBEAgBSACIABBA3ZrIgQ2AghBASECIABBB3EMAQsgAiAFKAIMIgRGDQEgBSACIABBA3YiCyACIARrIAIgC2sgBE8iAhsiC2siBDYCCCAAIAtBA3RrCyIANgIEIAUgBCgAACIENgIAIAJFIAMgD09yDQAgCiAEIAB0IAh2QQF0aiICLQABIQQgBSAAIAItAABqNgIEIAMgBDoAACADQQFqIQMgBSgCBCEADAELCwNAIAMgD09FBEAgCiAFKAIAIAUoAgQiAHQgCHZBAXRqIgItAAEhBCAFIAAgAi0AAGo2AgQgAyAEOgAAIANBAWohAwwBCwtBbEFsQWxBbEFsQWxBbEFsIAEgBSgCBEEgRxsgBSgCCCAFKAIMRxsgBSgCGEEgRxsgBSgCHCAFKAIgRxsgBSgCLEEgRxsgBSgCMCAFKAI0RxsgBSgCQEEgRxsgBSgCRCAFKAJIRxshCAwBC0FsIQgLIAVB0ABqJAAgCAsaACAABEAgAQRAIAIgACABEQIADwsgABACCwtSAQN/AkAgACgCmOsBIgFFDQAgASgCACABKAK01QEiAiABKAK41QEiAxAVIAIEQCADIAEgAhECAAwBCyABEAILIABBADYCqOsBIABCADcDmOsBC5QFAgR/An4jAEEQayIGJAACQCABIAJFckUEQEF/IQQMAQsCQEEBQQUgAxsiBCACSwRAIAJFIANBAUZyDQIgBkGo6r5pNgIMIAJFIgBFBEAgBkEMaiABIAL8CgAACyAGKAIMQajqvmlGDQIgBkHQ1LTCATYCDCAARQRAIAZBDGogASAC/AoAAAsgBigCDEFwcUHQ1LTCAUYNAgwBCyAAQQBBMPwLAEEBIQUCQCADQQFGDQAgAyEFIAEoAAAiA0Go6r5pRg0AIANBcHFB0NS0wgFHDQFBCCEEIAJBCEkNAiAAQQE2AhQgASgAACECIABBCDYCGCAAIAJB0NS0wgFrNgIcIAAgATUABDcDAEEAIQQMAgsgAiABIAIgBRAYIgJJBEAgAiEEDAILIAAgAjYCGCABIARqIgVBAWstAAAiAkEIcQRAQXIhBAwCCyACQSBxIgNFBEAgBS0AACIFQacBSwRAQXAhBAwDCyAFQQdxrUIBIAVBA3ZBCmqthiIIQgOIfiAIfCEJIARBAWohBAsgAkEGdiEFIAJBAnYhBwJAAkACQAJAIAJBA3EiAkEBaw4DAAECAwsgASAEai0AACECIARBAWohBAwCCyABIARqLwAAIQIgBEECaiEEDAELIAEgBGooAAAhAiAEQQRqIQQLIAdBAXEhBwJ+AkACQAJAAkAgBUEBaw4DAQIDAAtCfyADRQ0DGiABIARqMQAADAMLIAEgBGozAABCgAJ8DAILIAEgBGo1AAAMAQsgASAEaikAAAshCCAAIAc2AiAgACACNgIcIAAgCDcDAEEAIQQgAEEANgIUIAAgCCAJIAMbIgg3AwggAEKAgAggCCAIQoCACFobPgIQDAELQXYhBAsgBkEQaiQAIAQLXwEBf0G4fyEDIAFBAUEFIAIbIgFPBH8gACABakEBay0AACIAQQNxQQJ0QcAaaigCACABaiAAQQR2QQxxQdAaaigCAGogAEEgcSIBRWogAUEFdiAAQcAASXFqBUG4fwsLxAICBH8CfiMAQUBqIgQkAAJAA0AgAUEFTwRAAkAgACgAAEFwcUHQ1LTCAUYEQEJ+IQYgAUEISQ0EIAAoAAQiA0F3Sw0EIANBCGoiAiABSw0EIANBgX9JDQEMBAsgBEEQaiIDIAAgAUEAEBchAkJ+IAQpAxBCACAEKAIkQQFHGyACGyIGQn1WDQMgBiAHfCIHIAZUIQJCfiEGIAINAyADIAAgAUEAEBciAkGIf0sgAnINAyABIAQoAigiA2shAiAAIANqIQMDQCADIAIgBEEEahAaIgVBiH9LDQQgAiAFQQNqIgVJDQQgAiAFayECIAMgBWohAyAEKAIIRQ0ACyAEKAIwBH8gAkEESQ0EIANBBGoFIAMLIABrIgJBiH9LDQMLIAEgAmshASAAIAJqIQAMAQsLQn4gByABGyEGCyAEQUBrJAAgBgtkAQF/Qbh/IQMCQCABQQNJDQAgAC0AAiEBIAIgAC8AACIAQQFxNgIEIAIgAEEBdkEDcSIDNgIAIAIgACABQRB0ckEDdiIANgIIAkACQCADQQFrDgMCAQABC0FsDwsgACEDCyADC7ABAAJ/IAIgACgClOsBBH8gACgC0OkBBUGAgAgLIgIgA2pBQGtLBEAgACABIAJqQSBqIgE2AvzrAUEBIQIgASADagwBCyADQYCABE0EQCAAIABBiOwBaiIBNgL86wFBACECIAEgA2oMAQsgACABIARqIgEgA2siAkHg/wNqIgQgAiAFGzYC/OsBQQIhAiADIARqQYCABGsgASAFGwshAyAAIAI2AoTsASAAIAM2AoDsAQuyBwIEfwF+IwBBgAFrIg4kACAOIAM2AnwCQAJAAkACQAJAAkAgAkEBaw4DAAMCAQsgBkUEQEG4fyEKDAULIAMgBS0AACICSQ0DIAIgCGotAAAhAyAHIAJBAnRqKAIAIQIgAEEAOgALIABCADcCACAAIAI2AgwgACADOgAKIABBADsBCCABIAA2AgBBASEKDAQLIAEgCTYCAEEAIQoMAwsgCkUNAUEAIQogC0UgDEEZSXINAkEIIAR0QQhyIQBBACEDA0AgACADTQ0DIANBQGshAwwACwALQWwhCiAOIA5B/ABqIA5B+ABqIAUgBhAGIgNBiH9LDQEgDigCeCICIARLDQEgAEEMaiEMIA4oAnxBAWohEUGAgAIgAnRBEHYhEEEAIQRBASEFQQEgAnQiCkEBayILIQkDQCAEIBFHBEACQCAOIARBAXQiD2ovAQAiBkH//wNGBEAgDCAJQQN0aiAENgIAIAlBAWshCUEBIQYMAQsgBUEAIBAgBsFKGyEFCyANIA9qIAY7AQAgBEEBaiEEDAELCyAAIAI2AgQgACAFNgIAAkAgCSALRgRAIA1B6gBqIRBBACEJQQAhBQNAIAkgEUYEQCAKQQN2IApBAXZqQQNqIglBAXQhEUEAIQZBACEFA0AgBSAKTw0EIAUgEGohD0EAIQQDQCAEQQJHBEAgDCAEIAlsIAZqIAtxQQN0aiAEIA9qLQAANgIAIARBAWohBAwBCwsgBUECaiEFIAYgEWogC3EhBgwACwAFIA4gCUEBdGouAQAhBiAFIBBqIg8gEjcAAEEIIQQDQCAEIAZIBEAgBCAPaiASNwAAIARBCGohBAwBCwsgEkKBgoSIkKDAgAF8IRIgCUEBaiEJIAUgBmohBQwBCwALAAsgCkEDdiAKQQF2akEDaiEQQQAhBUEAIQYDQCAFIBFGDQFBACEEIA4gBUEBdGouAQAiD0EAIA9BAEobIQ8DQCAEIA9HBEAgDCAGQQN0aiAFNgIAA0AgBiAQaiALcSIGIAlLDQALIARBAWohBAwBCwsgBUEBaiEFDAALAAsgAEEIaiEJIAJBH2shC0EAIQYDQCAGIApHBEAgDSAJIAZBA3RqIgIoAgQiBEEBdGoiBSAFLwEAIgVBAWo7AQAgAiALIAVnaiIMOgADIAIgBSAMdCAKazsBACACIAQgCGotAAA6AAIgAiAHIARBAnRqKAIANgIEIAZBAWohBgwBCwsgASAANgIAIAMhCgwBC0FsIQoLIA5BgAFqJAAgCgtwAQR/IABCADcCACACBEAgAUEKaiEGIAEoAgQhBEEAIQJBACEBA0AgASAEdkUEQCACIAYgAUEDdGotAAAiBSACIAVLGyECIAFBAWohASADIAVBFktqIQMMAQsLIAAgAjYCBCAAIANBCCAEa3Q2AgALC64BAQR/IAEgAigCBCIDIAEoAgRqIgQ2AgQgACADQQJ0QbAZaigCACABKAIAQQAgBGt2cTYCAAJAIARBIU8EQCABQbAaNgIIDAELIAEoAggiAyABKAIQTwRAIAEQDAwBCyADIAEoAgwiBUYNACABIAMgAyAFayAEQQN2IgYgAyAGayAFSRsiA2siBTYCCCABIAQgA0EDdGs2AgQgASAFKAAANgIACyAAIAJBCGo2AgQLjQICA38BfiAAIAJqIQQCQAJAIAJBCE4EQCAAIAFrIgJBeUgNAQsDQCAAIARPDQIgACABLQAAOgAAIABBAWohACABQQFqIQEMAAsACwJAAkAgAkFvSw0AIAAgBEEgayICSw0AIAEpAAAhBiAAIAEpAAg3AAggACAGNwAAIAIgAGsiBUERTgRAIABBEGohACABIQMDQCADKQAQIQYgACADKQAYNwAIIAAgBjcAACADKQAgIQYgACADKQAoNwAYIAAgBjcAECADQSBqIQMgAEEgaiIAIAJJDQALCyABIAVqIQEMAQsgACECCwNAIAIgBE8NASACIAEtAAA6AAAgAkEBaiECIAFBAWohAQwACwALC98BAQZ/Qbp/IQoCQCACKAIEIgggAigCACIJaiINIAEgAGtLDQBBbCEKIAkgBCADKAIAIgtrSw0AIAAgCWoiBCACKAIIIgxrIQIgACABQSBrIgEgCyAJQQAQIyADIAkgC2o2AgACQAJAIAQgBWsgDE8EQCACIQUMAQsgDCAEIAZrSw0CIAcgByACIAVrIgNqIgIgCGpPBEAgCEUNAiAEIAIgCPwKAAAMAgtBACADayIABEAgBCACIAD8CgAACyADIAhqIQggBCADayEECyAEIAEgBSAIQQEQIwsgDSEKCyAKC+sBAQZ/Qbp/IQsCQCADKAIEIgkgAygCACIKaiINIAEgAGtLDQAgBSAEKAIAIgVrIApJBEBBbA8LIAMoAgghDCAAIAVLIAUgCmoiDiAAS3ENACAAIApqIgMgDGshASAAIAUgChAfIAQgDjYCAAJAAkAgAyAGayAMTwRAIAEhBgwBC0FsIQsgDCADIAdrSw0CIAggCCABIAZrIgBqIgEgCWpPBEAgCUUNAiADIAEgCfwKAAAMAgtBACAAayIEBEAgAyABIAT8CgAACyAAIAlqIQkgAyAAayEDCyADIAIgBiAJQQEQIwsgDSELCyALC6sCAQJ/IAJBH3EhAyABIQQDQCADQQhJRQRAIANBCGshAyAEKQAAQs/W077Sx6vZQn5CH4lCh5Wvr5i23puef34gAIVCG4lCh5Wvr5i23puef35CnaO16oOxjYr6AH0hACAEQQhqIQQMAQsLIAEgAkEYcWohASACQQdxIgNBBEkEfyABBSADQQRrIQMgATUAAEKHla+vmLbem55/fiAAhUIXiULP1tO+0ser2UJ+Qvnz3fGZ9pmrFnwhACABQQRqCyEEA0AgAwRAIANBAWshAyAEMQAAQsXP2bLx5brqJ34gAIVCC4lCh5Wvr5i23puef34hACAEQQFqIQQMAQsLIABCIYggAIVCz9bTvtLHq9lCfiIAQh2IIACFQvnz3fGZ9pmrFn4iAEIgiCAAhQvhBAIBfgJ/IAAgA2ohBwJAIANBB0wEQANAIAAgB08NAiAAIAItAAA6AAAgAEEBaiEAIAJBAWohAgwACwALIAQEQAJAIAAgAmsiBkEHTQRAIAAgAi0AADoAACAAIAItAAE6AAEgACACLQACOgACIAAgAi0AAzoAAyAAIAIgBkECdCIGQeAaaigCAGoiAigAADYABCACIAZBgBtqKAIAayECDAELIAAgAikAADcAAAsgA0EIayEDIAJBCGohAiAAQQhqIQALIAEgB08EQCAAIANqIQEgBEUgACACa0EPSnJFBEADQCAAIAIpAAA3AAAgAkEIaiECIABBCGoiACABSQ0ADAMLAAsgAikAACEFIAAgAikACDcACCAAIAU3AAAgA0ERSQ0BIABBEGohAANAIAIpABAhBSAAIAIpABg3AAggACAFNwAAIAIpACAhBSAAIAIpACg3ABggACAFNwAQIAJBIGohAiAAQSBqIgAgAUkNAAsMAQsCQCAAIAFLBEAgACEBDAELIAEgAGshBgJAIARFIAAgAmtBD0pyRQRAIAIhAwNAIAAgAykAADcAACADQQhqIQMgAEEIaiIAIAFJDQALDAELIAIpAAAhBSAAIAIpAAg3AAggACAFNwAAIAZBEUgNACAAQRBqIQAgAiEDA0AgAykAECEFIAAgAykAGDcACCAAIAU3AAAgAykAICEFIAAgAykAKDcAGCAAIAU3ABAgA0EgaiEDIABBIGoiACABSQ0ACwsgAiAGaiECCwNAIAEgB08NASABIAItAAA6AAAgAUEBaiEBIAJBAWohAgwACwALC6HFAQI2fwV+IwBBEGsiMSQAAkBBwOwFEAEiCEUEQEFAIQYMAQsgCEIANwL86gEgCEEANgKc6wEgCEEANgKQ6wEgCEEANgLU6wEgCEEANgLE6wEgCEIANwKk6wEgCEEANgK46QEgCEEANgK87AUgCEIANwK86wEgCEEANgKs6wEgCEIBNwKU6wEgCEIANwPo6wEgCEGBgIDAADYCzOsBIAhCADcC7OoBIAhCADcDsOsBIAhBADYCuOsBIAhBhOsBakEANgIAIAgQFiAIQbjqAWohNCAIQcDpAWohNiAIQZDqAWohNyAAISwCQAJAAkACQANAQQFBBSAIKALs6gEiCxshEwJAA0AgAyATSQ0BAkAgA0EESSALcg0AIAIoAABBcHFB0NS0wgFHDQBBuH8hBiADQQhJDQcgAigABCIHQXdLBEBBciEGDAgLIAMgB0EIaiIESQ0HIAdBgH9LBEAgBCEGDAgLIAMgBGshAyACIARqIQIMAQsLIAhCADcCrOkBIAhCADcD8OkBIAhBjICA4AA2AqhQIAhBADYCoOsBIAhCADcDiOoBIAhBATYClOsBIAhCAzcDgOoBIAhBtOkBakIANwIAIAhB+OkBakIANwMAIAhB9A4pAgA3AqzQASAIQbTQAWpB/A4oAgA2AgAgCCAIQRBqNgIAIAggCEGgMGo2AgQgCCAIQZggajYCCCAIIAhBqNAAajYCDCAIQQFBBSAIKALs6gEbNgK86QECQCABRQ0AICwgCCgCrOkBIgZGDQAgCCAGNgK46QEgCCAsNgKs6QEgCCgCsOkBIQQgCCAsNgKw6QEgCCAsIAQgBmtqNgK06QELQbh/IQYgA0EFQQkgCCgC7OoBIhMbSQ0FIAJBAUEFIBMbIBMQGCIEQYh/Sw0EIAMgBEEDakkNBSA2IAIgBCATEBciBkGIf0sEQCAGIQQMBQsgBg0DAkACQCAIKAKw6wFBAUcNACAIKAKs6wEiC0UNACAIKAKc6wFFDQAgCygCBCEGIDEgCCgC3OkBIgo2AgQgBkEBayIHQsnP2bLx5brqJyAxQQRqQQQQIqdxIRMgCygCACELA0AgCiALIBNBAnRqKAIAIgwEfyAMKAKo1QEFQQALIgZHBEAgByATcUEBaiETIAYNAQsLIAxFDQAgCBAWIAhBfzYCqOsBIAggDDYCnOsBIAggCCgC3OkBIhM2AqDrAQwBCyAIKALc6QEhEwsCQCATRQ0AIAgoAqDrASATRg0AQWAhBAwFCwJAIAgoAuDpAQRAIAggCCgC8OoBIgZFNgL06gEgBg0BIDdBAEHYAPwLACAIQvnq0NDnyaHk4QA3A7DqASAIQs/W077Sx6vZQjcDoOoBIAhC1uuC7ur9ifXgADcDmOoBDAELIAhBADYC9OoBCyAIIAgpA/DpASAErXw3A/DpASAIKAK46wEiEwRAIAggCCgC0OkBIgYgEyAGIBNJGzYC0OkBCyABICxqITUgAyAEayEDIAIgBGohAiAsIRMDQCACIAMgMUEEahAaIiBBiH9LBEAgICEEDAYLIANBA2siOCAgSQ0EIAJBA2oiHSA1IB0gNUkbIDUgEyAdTRshAkFsIQQCQAJAAkACQAJAAkACQAJAIDEoAgQOAwECAA0LIAIgE2shFEEAITMjAEHQAmsiBSQAAkACQCAIKAKU6wEiAgR/IAgoAtDpAQVBgIAICyAgSQ0AAkAgIEECSQ0AIB0tAAAiA0EDcSEaIAIEfyAIKALQ6QEFQYCACAshBgJAAkACQAJAAkACQAJAAkACQAJAIBpBAWsOAwMBAAILIAgoAojqAQ0AQWIhAwwLCyAgQQVJDQhBAyEMIB0oAAAhBAJ/An8CQAJAAkAgA0ECdkEDcSICQQJrDgIBAgALIARBDnZB/wdxIQ0gBEEEdkH/B3EhECACQQBHDAMLIARBEnYhDSAEQQR2Qf//AHEhEEEEDAELIB0tAARBCnQgBEEWdnIhDSAEQQR2Qf//D3EhEEEFCyEMQQELIQRBun8hAyATQQEgEBtFDQogBiAQSQ0IIBBBBkkgBHEEQEFoIQMMCwsgDCANaiIKICBLDQggBiAUIAYgFEkbIgIgEEkNCiAIIBMgFCAQIAJBABAbAkAgCCgCpOsBRSAQQYEGSXINAEEAIQMDQCADQYOAAUsNASADQUBrIQMMAAsACyAaQQNGBEAgDCAdaiEGIAgoAgwiCy0AAUEIdCECIAgoAvzrASEDIARFBEAgAgRAIAVB4AFqIAYgDRAIIg5BiH9LDQkgC0EEaiEZIAMgEGohESALLwECIQkgEEEETwRAIBFBA2shBkEAIAlrQR9xIQcgBSgC6AEhDCAFKALsASEPIAUoAvABIQQgBSgC4AEhDSAFKALkASEOA0AgDkEgSwRAQbAaIQwMCgsCQCAEIAxNBEAgDkEHcSESIA5BA3YhDUEBIQ4MAQsgDCAPRg0KIA4gDkEDdiICIAwgD2sgDCACayAPTyIOGyINQQN0ayESCyAMIA1rIgwoAAAhDSAORSADIAZPcg0IIAMgGSANIBJ0IAd2QQJ0aiICLwEAOwAAIAMgAi0AA2oiAyAZIA0gEiACLQACaiICdCAHdkECdGoiCy8BADsAACADIAstAANqIQMgAiALLQACaiEODAALAAsgBSgC5AEiDkEhTwRAIAVBsBo2AugBDAkLIAUoAugBIgYgBSgC8AFPBEAgBSAOQQdxIgI2AuQBIAUgBiAOQQN2ayIENgLoASAFIAQoAAA2AuABIAIhDgwJCyAGIAUoAuwBIgRGDQggBSAOIAYgBGsgDkEDdiICIAYgAmsgBEkbIgJBA3RrIg42AuQBIAUgBiACayICNgLoASAFIAIoAAA2AuABDAgLIAMgECAGIA0gCxARIQ4MCAsgAgRAIAMgECAGIA0gCxASIQ4MCAsgAyAQIAYgDSALEBQhDgwHCyAIQazVAWohFyAMIB1qISEgCEGo0ABqIQcgCCgC/OsBIRYgBEUEQCAHICEgDSAXEA4iDkGIf0sNByANIA5NDQMgFiAQIA4gIWogDSAOayAHEBEhDgwHCyAQRQRAQbp/IQ4MBwsgDUUEQEFsIQ4MBwsgEEEIdiIDIA0gEEkEfyANQQR0IBBuBUEPC0EEdCIEQYwIaigCAGwgBEGICGooAgBqIgJBBXYgAmogBEGACGooAgAgBEGECGooAgAgA2xqSQRAIwBBEGsiLSQAIAcoAgAhESAXQfAEaiIeQQBB8AD8CwBBVCEDAkAgEUH/AXEiL0EMSw0AIBdB4AdqIgkgHiAtQQhqIC1BDGogISANIBdB4AlqEAciBEGIf00EQCAtKAIMIgsgL0sNASAXQagFaiEZIBdBpAVqITAgB0EEaiEbIBFBgICAeHEhJCALQQFqIjIhAyALIQYDQCADIgJBAWshAyAGIgxBAWshBiAeIAxBAnRqKAIARQ0AC0EBIAIgAkEBTRshDkEAIQZBASEDA0AgAyAORwRAIB4gA0ECdCIPaigCACECIA8gGWogBjYCACADQQFqIQMgAiAGaiEGDAELCyAXIAY2AqgFIBkgDEEBaiIfQQJ0aiAGNgIAIBdB4AVqISZBACEDIC0oAgghBgNAIAMgBkcEQCAZIAMgCWotAABBAnRqIgIgAigCACICQQFqNgIAIAIgJmogAzoAACADQQFqIQMMAQsLQQAhBiAZQQA2AgBBCyAvIBFB/wFxQQxGGyAvIAtBDEkbIikgC0F/c2ohD0EBIQMDQCADIA5HBEAgHiADQQJ0IgtqKAIAIQIgCyAXaiAGNgIAIAIgAyAPanQgBmohBiADQQFqIQMMAQsLICkgMiAMayILa0EBaiEJIAshBgNAIAYgCUkEQCAXIAZBNGxqIQ9BASEDA0AgAyAORwRAIA8gA0ECdCICaiACIBdqKAIAIAZ2NgIAIANBAWohAwwBCwsgBkEBaiEGDAELCyAyIClrIRUgDEEAIAxBAEobQQFqISdBASEuA0AgJyAuRwRAIDIgLmshBiAXIC5BAnQiAmooAgAhJSACIDBqKAIAISogMCAuQQFqIi5BAnRqKAIAIRggCyApIAZrIgNNBEAgHyAGIBVqIgJBASACQQFKIhIbIgIgAiAfSBshHCAXIAZBNGxqIh4gAkECdGohGSAGIDJqIREgBkEQdEGAgIAIaiEOQQEgA3QiCUECayEPA0AgGCAqRg0DIBsgJUECdGohKCAmICpqLQAAISsgAiEDIBIEQCAOICtyrUKBgICAEH4hOiAZKAIAIQZBACEDAkACQAJAAkAgDw4DAQIAAgsgKCA6NwEICyAoIDo3AQAMAQsDQCADIAZODQEgKCADQQJ0aiIMIDo3ARggDCA6NwEQIAwgOjcBCCAMIDo3AQAgA0EIaiEDDAALAAsgAiEDCwNAIAMgHEcEQCARIANrIQwgKCAeIANBAnQiBmooAgBBAnRqICYgBiAwaigCAGogJiAwIANBAWoiA0ECdGooAgBqIAwgKSArQQIQDwwBCwsgKkEBaiEqIAkgJWohJQwACwAFIBsgJUECdGogJiAqaiAYICZqIAYgKUEAQQEQDwwCCwALCyAHIClBEHQgJHIgL3JBgAJyNgIACyAEIQMLIC1BEGokACADIg5BiH9LDQcgAyANTw0DIBYgECADICFqIA0gA2sgBxASIQ4MBwsgByAhIA0gFxAOIg5BiH9LDQYgDSAOTQ0CIBYgECAOICFqIA0gDmsgBxAUIQ4MBgtBAiEQAn8CQAJAAkAgA0ECdkEDcUEBaw4DAQACAAtBASEQIANBA3YMAgsgHS8AAEEEdgwBCyAgQQJGDQhBAyEQIB0vAAAgHS0AAkEQdHJBBHYLIQtBun8hAyATQQEgCxtFDQkgBiALSQ0HIAsgFEsNCSAIIBMgFCALIAYgFCAGIBRJG0EBEBsgICALIBBqIgpBIGpJBEAgCiAgSw0IIBAgHWohBCAIKAL86wEhAwJAIAgoAoTsAUECRgRAIAtBgIAEayICBEAgAyAEIAL8CgAACyAIQYjsAWogAiAEakGAgAT8CgAADAELIAtFDQAgAyAEIAv8CgAACyAIIAs2AojrASAIIAgoAvzrATYC+OoBDAcLIAhBADYChOwBIAggCzYCiOsBIAggECAdaiICNgL46gEgCCACIAtqNgKA7AEMBgsCfwJAAkACQCADQQJ2QQNxQQFrDgMBAAIAC0EBIRAgA0EDdgwCCyAgQQJGDQhBAiEQIB0vAABBBHYMAQsgIEEESQ0HQQMhECAdLwAAIB0tAAJBEHRyQQR2CyELQbp/IQMgE0EBIAsbRQ0IIAYgC0kNBiALIBRLDQggCCATIBQgCyAGIBQgBiAUSRtBARAbIBAgHWoiAy0AACEGIAgoAvzrASEEAkAgCCgChOwBQQJGBEAgC0GAgARrIgIEQCAEIAYgAvwLAAsgCEGI7AFqIAMtAABBgIAE/AsADAELIAtFDQAgBCAGIAv8CwALIAggCzYCiOsBIAggCCgC/OsBNgL46gEgEEEBaiEKDAULQbh/IQ4MAwsgEiEOCyAFIA42AuQBIAUgDDYC6AEgBSANNgLgAQsCQCARIANrQQJJDQAgEUECayELQQAgCWtBH3EhBgNAAkAgDkEhTwRAIAVBsBo2AugBDAELIAUCfyAFKALoASIHIAUoAvABTwRAIAUgByAOQQN2ayIMNgLoAUEBISUgDkEHcQwBCyAHIAUoAuwBIgRGDQEgBSAHIA5BA3YiAiAHIARrIAcgAmsgBE8iJRsiAmsiDDYC6AEgDiACQQN0awsiDjYC5AEgBSAMKAAAIgI2AuABICVFIAMgC0tyDQAgAyAZIAIgDnQgBnZBAnRqIgIvAQA7AAAgBSAFKALkASACLQACaiIONgLkASADIAItAANqIQMMAQsLA0AgAyALSw0BIAMgGSAFKALgASAOdCAGdkECdGoiAi8BADsAACAFIAUoAuQBIAItAAJqIg42AuQBIAMgAi0AA2ohAwwACwALAkAgAyARTw0AIAMgGSAFKALgASAOdEEAIAlrdkECdGoiAi0AADoAACACLQADQQFGBEAgBSgC5AEgAi0AAmohDgwBCyAFKALkASIOQR9LDQBBICAOIAItAAJqIgIgAkEgTxshDgtBbEFsIBAgDkEgRxsgBSgC6AEgBSgC7AFHGyEOCyAIKAKE7AFBAkYEQCAIQYjsAWogCCgCgOwBQYCABGtBgIAE/AoAACAQQYCABGsiAwRAIAgoAvzrASICQeD/A2ogAiAD/AoAAAsgCCAIKAL86wFB4P8DajYC/OsBIAggCCgCgOwBQSBrNgKA7AELIA5BiH9LDQEgCCAQNgKI6wEgCEEBNgKI6gEgCCAIKAL86wE2AvjqASAaQQJGBEAgCCAIQajQAGo2AgwLIAoiA0GIf0sNAwsgCCgClOsBBH8gCCgC0OkBBUGAgAgLIQwgCiAgRg0BICAgCmshCSAIKAK06QEhCyAdICBqIQ0gCCgCpOsBIQYCfwJAAn8gCiAdaiIRLQAAIg7AIgJBAE4EQCARQQFqDAELIAJBf0YEQCAJQQNJDQUgEUEDaiEEIBEvAAFBgP4BaiEODAILIAlBAUYNBCARLQABIA5BCHRyQYCAAmshDiARQQJqCyEEIA4NAEFsIQMgBCANRw0EQQAhDiAJDAELQbh/IQMgBEEBaiIPIA1LDQMgBC0AACIKQQNxDQEgCEEQaiAIIApBBnZBI0EJIA8gDSAPa0HADUHQDkGADyAIKAKM6gEgBiAOIAhBrNUBaiIHEBwiAkGIf0sNASAIQZggaiAIQQhqIApBBHZBA3FBH0EIIAIgD2oiBCANIARrQYAKQYALQZATIAgoAozqASAIKAKk6wEgDiAHEBwiAkGIf0sNAUFsIQMgCEGgMGogCEEEaiAKQQJ2QQNxQTRBCSACIARqIgQgDSAEa0GgC0GADUGgFSAIKAKM6gEgCCgCpOsBIA4gBxAcIgJBiH9LDQMgAiAEaiARawsiA0GIf0sNAgJAIBNBAEcgFEEAR3FFIA5BAEpxDQACQAJAIBMgFCAMIAwgFEsbIgJBACACQQBKG2ogC2siAkH8//8fTQRAIAYgAkGBgIAISXIgDkEJSHINAiAFQeABaiAIKAIIIA4QHQwBCyAFQeABaiAIKAIIIA4QHSAFKALkAUEZSyEzIAYNAQsgBSgC4AFBE0shBgsgCSADayEHIAMgEWohBCAIQQA2AqTrASAIKAKE7AEhAgJAIAYEQAJ/IAJBAUYEQCAIKAL86wEMAQsgEyAUQQAgFEEAShtqCyEUIAUgCCgC+OoBIgM2AswCIAgoAoDsASEcIA5FBEAgEyEJDAILIAgoArjpASEiIAgoArTpASEXIAgoArDpASELIAhBATYCjOoBIAhBrNABaiEyIAVB1AFqISZBACECA0AgAkEDRwRAICYgAkECdCIDaiADIDJqKAIANgIAIAJBAWohAgwBCwtBbCEDIAVBqAFqIgIgBCAHEAhBiH9LDQUgBUG8AWogAiAIKAIAEB4gBUHEAWogAiAIKAIIEB4gBUHMAWogAiAIKAIEEB5BCCAOIA5BCE4bIihBACAoQQBKGyElIA5BAWshGiATIAtrIS0gBSgCsAEhAiAFKALYASEGIAUoAtQBIRIgBSgCrAEhBCAFKAK0ASEjIAUoArgBISkgBSgCyAEhGCAFKALQASErIAUoAsABISQgBSgCqAEhCSAFKALEASEhIAUoAswBISogBSgCvAEhMCAzRSEVQQAhEANAIBIhESAQICVGBEAgBSAqNgLMASAFIDA2ArwBIAUgAjYCsAEgBSAhNgLEASAFIAk2AqgBIAhBmOwBaiEeIAhBiOwFaiEZIAhBiOwBaiEWIBRBIGshGyAzRSEnIBMhCQNAIA4gJUcEQCAFKALAASAFKAK8AUEDdGoiBi0AAiEfIAUoAtABIAUoAswBQQN0aiIELQACIRggBSgCyAEgBSgCxAFBA3RqIgItAAMhKyAELQADISQgBi0AAyEVIAIvAQAhEiAELwEAIREgBi8BACEKIAIoAgQhByAGKAIEIRAgBCgCBCEMAkAgAi0AAiINQQJPBEACQCAnIA1BGUlyRQRAIAcgBSgCqAEiDyAFKAKsASICdEEFIA1rdkEFdGohBwJAIAIgDWpBBWsiAkEhTwRAIAVBsBo2ArABDAELIAUoArABIgYgBSgCuAFPBEAgBSACQQdxIgQ2AqwBIAUgBiACQQN2ayICNgKwASAFIAIoAAAiDzYCqAEgBCECDAELIAYgBSgCtAEiBEYNACAFIAIgBiAEayACQQN2IgIgBiACayAESRsiBEEDdGsiAjYCrAEgBSAGIARrIgQ2ArABIAUgBCgAACIPNgKoAQsgBSACQQVqIgY2AqwBIAcgDyACdEEbdmohDQwBCyAFIAUoAqwBIgIgDWoiBjYCrAEgBSgCqAEgAnRBACANa3YgB2ohDSAGQSFPBEAgBUGwGjYCsAEMAQsgBSgCsAEiByAFKAK4AU8EQCAFIAZBB3EiAjYCrAEgBSAHIAZBA3ZrIgQ2ArABIAUgBCgAADYCqAEgAiEGDAELIAcgBSgCtAEiBEYNACAFIAYgByAEayAGQQN2IgIgByACayAESRsiAkEDdGsiBjYCrAEgBSAHIAJrIgI2ArABIAUgAigAADYCqAELIAUpAtQBITogBSANNgLUASAFIDo3AtgBDAELIBBFIQQgDUUEQCAmIBBBAEdBAnRqKAIAIQIgBSAmIARBAnRqKAIAIg02AtQBIAUgAjYC2AEgBSgCrAEhBgwBCyAFIAUoAqwBIgJBAWoiBjYCrAECQAJAIAQgB2ogBSgCqAEgAnRBH3ZqIgRBA0YEQCAFKALUAUEBayICQX8gAhshDQwBCyAmIARBAnRqKAIAIgJBfyACGyENIARBAUYNAQsgBSAFKALYATYC3AELIAUgBSgC1AE2AtgBIAUgDTYC1AELIBggH2ohBAJAIBhFBEAgBiECDAELIAUgBiAYaiICNgKsASAFKAKoASAGdEEAIBhrdiAMaiEMCwJAIARBFEkNACACQSFPBEAgBUGwGjYCsAEMAQsgBSgCsAEiBiAFKAK4AU8EQCAFIAJBB3EiBDYCrAEgBSAGIAJBA3ZrIgI2ArABIAUgAigAADYCqAEgBCECDAELIAYgBSgCtAEiBEYNACAFIAIgBiAEayACQQN2IgIgBiACayAESRsiBEEDdGsiAjYCrAEgBSAGIARrIgQ2ArABIAUgBCgAADYCqAELAkAgH0UEQCACIQQMAQsgBSACIB9qIgQ2AqwBIAUoAqgBIAJ0QQAgH2t2IBBqIRALAkAgBEEhTwRAQbAaIQIgBUGwGjYCsAEMAQsgBSgCsAEiAiAFKAK4AU8EQCAFIARBB3EiBjYCrAEgBSACIARBA3ZrIgI2ArABIAUgAigAADYCqAEgBiEEDAELIAIgBSgCtAEiB0YNACAFIAIgAiAHayAEQQN2IgYgAiAGayAHSRsiBmsiAjYCsAEgBSAEIAZBA3RrIgQ2AqwBIAUgAigAADYCqAELAkAgGiAlRg0AIAUgFUECdEGwGWooAgAgBSgCqAEiB0EAIAQgFWoiBGt2cSAKajYCvAEgBSAkQQJ0QbAZaigCACAHQQAgBCAkaiIEa3ZxIBFqNgLMAQJAIARBIU8EQEGwGiECIAVBsBo2ArABDAELIAUoArgBIAJNBEAgBSAEQQdxIgY2AqwBIAUgAiAEQQN2ayICNgKwASAFIAIoAAAiBzYCqAEgBiEEDAELIAIgBSgCtAEiCkYNACAFIAIgAiAKayAEQQN2IgYgAiAGayAKSRsiBmsiAjYCsAEgBSAEIAZBA3RrIgQ2AqwBIAUgAigAACIHNgKoAQsgBSAEICtqIgQ2AqwBIAUgK0ECdEGwGWooAgAgB0EAIARrdnEgEmo2AsQBIARBIU8EQCAFQbAaNgKwAQwBCyAFKAK4ASACTQRAIAUgBEEHcTYCrAEgBSACIARBA3ZrIgI2ArABIAUgAigAADYCqAEMAQsgAiAFKAK0ASIGRg0AIAUgBCACIAZrIARBA3YiBCACIARrIAZJGyIEQQN0azYCrAEgBSACIARrIgI2ArABIAUgAigAADYCqAELAkACQCAIKAKE7AFBAkYEQCAFKALMAiIHIAVB4AFqICVBB3FBDGxqIhUoAgAiAmoiCiAIKAKA7AEiBEsEQCAEIAdHBEAgBCAHayIEIBQgCWtLDQsgCSAHIAQQHyAVIAIgBGsiAjYCACAEIAlqIQkLIAUgFjYCzAIgCEEANgKE7AECQAJAAkAgAkGAgARKDQAgCSAVKAIEIhIgAmoiBmogG0sNACAGQSBqIBQgCWtNDQELIAUgFSgCCDYCgAEgBSAVKQIANwN4IAkgFCAFQfgAaiAFQcwCaiAZIAsgFyAiECAhBgwBCyACIBZqIQcgAiAJaiEEIBUoAgghESAWKQAAITogCSAWKQAINwAIIAkgOjcAAAJAIAJBEUkNACAeKQAAITogCSAeKQAINwAYIAkgOjcAECACQRBrQRFIDQAgCUEgaiECIB4hDwNAIA8pABAhOiACIA8pABg3AAggAiA6NwAAIA8pACAhOiACIA8pACg3ABggAiA6NwAQIA9BIGohDyACQSBqIgIgBEkNAAsLIAQgEWshAiAFIAc2AswCIAQgC2sgEUkEQCARIAQgF2tLDQ8gIiAiIAIgC2siCmoiByASak8EQCASRQ0CIAQgByAS/AoAAAwCC0EAIAprIgIEQCAEIAcgAvwKAAALIAogEmohEiAEIAprIQQgCyECCyARQRBPBEAgAikAACE6IAQgAikACDcACCAEIDo3AAAgEkERSA0BIAQgEmohByAEQRBqIQQDQCACKQAQITogBCACKQAYNwAIIAQgOjcAACACKQAgITogBCACKQAoNwAYIAQgOjcAECACQSBqIQIgBEEgaiIEIAdJDQALDAELAkAgEUEHTQRAIAQgAi0AADoAACAEIAItAAE6AAEgBCACLQACOgACIAQgAi0AAzoAAyAEIAIgEUECdCIHQeAaaigCAGoiAigAADYABCACIAdBgBtqKAIAayECDAELIAQgAikAADcAAAsgEkEJSQ0AIAQgEmohCiAEQQhqIgcgAkEIaiICa0EPTARAA0AgByACKQAANwAAIAJBCGohAiAHQQhqIgcgCkkNAAwCCwALIAIpAAAhOiAHIAIpAAg3AAggByA6NwAAIBJBGUgNACAEQRhqIQQDQCACKQAQITogBCACKQAYNwAIIAQgOjcAACACKQAgITogBCACKQAoNwAYIAQgOjcAECACQSBqIQIgBEEgaiIEIApJDQALCyAGQYh/SwRAIAYhAwwOCyAVIA02AgggFSAMNgIEIBUgEDYCACAZIRwMAwsgCkEgayEEAkACQCAKIBxLDQAgCSAVKAIEIhEgAmoiBmogBEsNACAGQSBqIBQgCWtNDQELIAUgFSgCCDYCkAEgBSAVKQIANwOIASAJIBQgBCAFQYgBaiAFQcwCaiAcIAsgFyAiECEhBgwCCyACIAlqIQQgFSgCCCEPIAcpAAAhOiAJIAcpAAg3AAggCSA6NwAAAkAgAkERSQ0AIAcpABAhOiAJIAcpABg3ABggCSA6NwAQIAJBEGtBEUgNACAHQRBqIQIgCUEgaiEHA0AgAikAECE6IAcgAikAGDcACCAHIDo3AAAgAikAICE6IAcgAikAKDcAGCAHIDo3ABAgAkEgaiECIAdBIGoiByAESQ0ACwsgBCAPayECIAUgCjYCzAIgBCALayAPSQRAIA8gBCAXa0sNDSAiICIgAiALayIKaiIHIBFqTwRAIBFFDQMgBCAHIBH8CgAADAMLQQAgCmsiAgRAIAQgByAC/AoAAAsgCiARaiERIAQgCmshBCALIQILIA9BEE8EQCACKQAAITogBCACKQAINwAIIAQgOjcAACARQRFIDQIgBCARaiEHIARBEGohBANAIAIpABAhOiAEIAIpABg3AAggBCA6NwAAIAIpACAhOiAEIAIpACg3ABggBCA6NwAQIAJBIGohAiAEQSBqIgQgB0kNAAsMAgsCQCAPQQdNBEAgBCACLQAAOgAAIAQgAi0AAToAASAEIAItAAI6AAIgBCACLQADOgADIAQgAiAPQQJ0IgdB4BpqKAIAaiICKAAANgAEIAIgB0GAG2ooAgBrIQIMAQsgBCACKQAANwAACyARQQlJDQEgBCARaiEKIARBCGoiByACQQhqIgJrQQ9MBEADQCAHIAIpAAA3AAAgAkEIaiECIAdBCGoiByAKSQ0ADAMLAAsgAikAACE6IAcgAikACDcACCAHIDo3AAAgEUEZSA0BIARBGGohBANAIAIpABAhOiAEIAIpABg3AAggBCA6NwAAIAIpACAhOiAEIAIpACg3ABggBCA6NwAQIAJBIGohAiAEQSBqIgQgCkkNAAsMAQsCQAJAIAUoAswCIhEgBUHgAWogJUEHcUEMbGoiDygCACICaiIHIBxLDQAgCSAPKAIEIgogAmoiBmogG0sNACAGQSBqIBQgCWtNDQELIAUgDygCCDYCoAEgBSAPKQIANwOYASAJIBQgBUGYAWogBUHMAmogHCALIBcgIhAgIQYMAQsgAiAJaiEEIA8oAgghFSARKQAAITogCSARKQAINwAIIAkgOjcAAAJAIAJBEUkNACARKQAQITogCSARKQAYNwAYIAkgOjcAECACQRBrQRFIDQAgEUEQaiECIAlBIGohEgNAIAIpABAhOiASIAIpABg3AAggEiA6NwAAIAIpACAhOiASIAIpACg3ABggEiA6NwAQIAJBIGohAiASQSBqIhIgBEkNAAsLIAQgFWshAiAFIAc2AswCIAQgC2sgFUkEQCAVIAQgF2tLDQwgIiAiIAIgC2siD2oiByAKak8EQCAKRQ0CIAQgByAK/AoAAAwCC0EAIA9rIgIEQCAEIAcgAvwKAAALIAogD2ohCiAEIA9rIQQgCyECCyAVQRBPBEAgAikAACE6IAQgAikACDcACCAEIDo3AAAgCkERSA0BIAQgCmohByAEQRBqIQQDQCACKQAQITogBCACKQAYNwAIIAQgOjcAACACKQAgITogBCACKQAoNwAYIAQgOjcAECACQSBqIQIgBEEgaiIEIAdJDQALDAELAkAgFUEHTQRAIAQgAi0AADoAACAEIAItAAE6AAEgBCACLQACOgACIAQgAi0AAzoAAyAEIAIgFUECdCIHQeAaaigCAGoiAigAADYABCACIAdBgBtqKAIAayECDAELIAQgAikAADcAAAsgCkEJSQ0AIAQgCmohDyAEQQhqIgcgAkEIaiICa0EPTARAA0AgByACKQAANwAAIAJBCGohAiAHQQhqIgcgD0kNAAwCCwALIAIpAAAhOiAHIAIpAAg3AAggByA6NwAAIApBGUgNACAEQRhqIQQDQCACKQAQITogBCACKQAYNwAIIAQgOjcAACACKQAgITogBCACKQAoNwAYIAQgOjcAECACQSBqIQIgBEEgaiIEIA9JDQALCyAGQYh/SwRAIAYhAwwLCyAFQeABaiAlQQdxQQxsaiICIA02AgggAiAMNgIEIAIgEDYCAAsgBiAJaiEJICVBAWohJSAQIC1qIAxqIS0MAQsLIAUoArABIAUoArQBRw0HIAUoAqwBQSBHDQcgDiAoayEQA0ACQCAOIBBMBEBBACECA0AgAkEDRg0CIDIgAkECdCIDaiADICZqKAIANgIAIAJBAWohAgwACwALIAVB4AFqIBBBB3FBDGxqIQoCfwJAIAgoAoTsAUECRgRAIAUoAswCIg8gCigCACIEaiIHIAgoAoDsASICSwRAIAIgD0cEQCACIA9rIgIgFCAJa0sNCyAJIA8gAhAfIAogBCACayIENgIAIAIgCWohCQsgBSAWNgLMAiAIQQA2AoTsAQJAAkACQCAEQYCABEoNACAJIAooAgQiDSAEaiIGaiAbSw0AIAZBIGogFCAJa00NAQsgBSAKKAIINgJQIAUgCikCADcDSCAJIBQgBUHIAGogBUHMAmogGSALIBcgIhAgIQYMAQsgBCAWaiEHIAQgCWohDCAKKAIIIQogFikAACE6IAkgFikACDcACCAJIDo3AAACQCAEQRFJDQAgHikAACE6IAkgHikACDcAGCAJIDo3ABAgBEEQa0ERSA0AIAlBIGohAiAeIQQDQCAEKQAQITogAiAEKQAYNwAIIAIgOjcAACAEKQAgITogAiAEKQAoNwAYIAIgOjcAECAEQSBqIQQgAkEgaiICIAxJDQALCyAMIAprIQIgBSAHNgLMAiAMIAtrIApJBEAgCiAMIBdrSw0PICIgIiACIAtrIgdqIgQgDWpPBEAgDUUNAiAMIAQgDfwKAAAMAgtBACAHayICBEAgDCAEIAL8CgAACyAHIA1qIQ0gDCAHayEMIAshAgsgCkEQTwRAIAIpAAAhOiAMIAIpAAg3AAggDCA6NwAAIA1BEUgNASAMIA1qIQcgDEEQaiEEA0AgAikAECE6IAQgAikAGDcACCAEIDo3AAAgAikAICE6IAQgAikAKDcAGCAEIDo3ABAgAkEgaiECIARBIGoiBCAHSQ0ACwwBCwJAIApBB00EQCAMIAItAAA6AAAgDCACLQABOgABIAwgAi0AAjoAAiAMIAItAAM6AAMgDCACIApBAnQiBEHgGmooAgBqIgIoAAA2AAQgAiAEQYAbaigCAGshAgwBCyAMIAIpAAA3AAALIA1BCUkNACAMIA1qIQcgDEEIaiIEIAJBCGoiAmtBD0wEQANAIAQgAikAADcAACACQQhqIQIgBEEIaiIEIAdJDQAMAgsACyACKQAAITogBCACKQAINwAIIAQgOjcAACANQRlIDQAgDEEYaiEEA0AgAikAECE6IAQgAikAGDcACCAEIDo3AAAgAikAICE6IAQgAikAKDcAGCAEIDo3ABAgAkEgaiECIARBIGoiBCAHSQ0ACwsgBkGJf08EQCAGIQMMDgsgGSEcIAYgCWoMAwsgB0EgayECAkACQCAHIBxLDQAgCSAKKAIEIhIgBGoiDGogAksNACAMQSBqIBQgCWtNDQELIAUgCigCCDYCYCAFIAopAgA3A1ggCSAUIAIgBUHYAGogBUHMAmogHCALIBcgIhAhIQwMAgsgBCAJaiEGIAooAgghCiAPKQAAITogCSAPKQAINwAIIAkgOjcAAAJAIARBEUkNACAPKQAQITogCSAPKQAYNwAYIAkgOjcAECAEQRBrQRFIDQAgD0EQaiECIAlBIGohBANAIAIpABAhOiAEIAIpABg3AAggBCA6NwAAIAIpACAhOiAEIAIpACg3ABggBCA6NwAQIAJBIGohAiAEQSBqIgQgBkkNAAsLIAYgCmshAiAFIAc2AswCIAYgC2sgCkkEQCAKIAYgF2tLDQ0gIiAiIAIgC2siB2oiBCASak8EQCASRQ0DIAYgBCAS/AoAAAwDC0EAIAdrIgIEQCAGIAQgAvwKAAALIAcgEmohEiAGIAdrIQYgCyECCyAKQRBPBEAgAikAACE6IAYgAikACDcACCAGIDo3AAAgEkERSA0CIAYgEmohByAGQRBqIQQDQCACKQAQITogBCACKQAYNwAIIAQgOjcAACACKQAgITogBCACKQAoNwAYIAQgOjcAECACQSBqIQIgBEEgaiIEIAdJDQALDAILAkAgCkEHTQRAIAYgAi0AADoAACAGIAItAAE6AAEgBiACLQACOgACIAYgAi0AAzoAAyAGIAIgCkECdCIEQeAaaigCAGoiAigAADYABCACIARBgBtqKAIAayECDAELIAYgAikAADcAAAsgEkEJSQ0BIAYgEmohByAGQQhqIgQgAkEIaiICa0EPTARAA0AgBCACKQAANwAAIAJBCGohAiAE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";

// ../../external/egs-core/packages/loaders/splat-loader/file/spz.ts
var SPZ_MAGIC = 1347635022;
var SPZ_VERSION = 3;
var FLAG_ANTIALIASED = 1;
var COLOR_SCALE = SH_C0 / 0.15;
var rotation = new Array(4);
var SH_SCALE1 = 1 << 3;
var SH_SCALE2 = 1 << 4;
var SpzFile = class {
  async read(stream, _contentLength, data) {
    const setCenter = data.setCenter.bind(data);
    const setAlpha = data.setAlpha.bind(data);
    const setColor = data.setColor.bind(data);
    const setScale = data.setScale.bind(data);
    const setQuat = data.setQuat.bind(data);
    const setShN = data.setShN.bind(data);
    const SCALE_LUT = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      SCALE_LUT[i] = Math.exp(i / 16 - 10);
    }
    const COLOR_LUT = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      COLOR_LUT[i] = (i / 255 - 0.5) * COLOR_SCALE + 0.5;
    }
    let version = SPZ_VERSION;
    let counts = 0;
    let shDegree = 0;
    let fractionalBits = 12;
    let flags = FLAG_ANTIALIASED;
    let reserved = 0;
    let isF16 = false;
    let useSmallestThreeQuat = true;
    let fraction = 1;
    let fractionInv = 1;
    let shCounts = 0;
    let BlockOffset = 0;
    const shN = [];
    const reader = new BufferReader();
    const decoder = new StreamChunkDecoder(reader);
    decoder.setDecoders([
      {
        init: () => [1, 16],
        decode: async (_offset, _counts, buf) => {
          const header = new DataView(buf.buffer);
          if (header.getUint32(0, true) !== SPZ_MAGIC) {
            throw new Error("Invalid SPZ file");
          }
          ({ version, counts, shDegree, fractionalBits, flags, extra: reserved } = readSpzHeader(header));
          if (version < 1 || version > 3) {
            throw new Error(`Unsupported SPZ version: ${version}`);
          }
          isF16 = version < 2;
          useSmallestThreeQuat = version >= 3;
          fraction = 1 << fractionalBits;
          fractionInv = 1 / fraction;
          shCounts = SH_MAPS2[shDegree];
          BlockOffset = await data.initBlock(counts, shDegree);
          if (flags || reserved) {
          }
        }
      },
      {
        init: () => [counts, isF16 ? 6 : 9],
        decode: (offset, counts2, buf) => {
          offset += BlockOffset;
          let x, y, z;
          for (let i = 0; i < counts2; i++) {
            if (isF16) {
              const o = i * 6;
              x = fromHalf2(buf[o + 1] << 8 | buf[o]);
              y = fromHalf2(buf[o + 3] << 8 | buf[o + 2]);
              z = fromHalf2(buf[o + 5] << 8 | buf[o + 4]);
            } else {
              const o = i * 9;
              x = ((buf[o + 2] << 24 | buf[o + 1] << 16 | buf[o] << 8) >> 8) * fractionInv;
              y = ((buf[o + 5] << 24 | buf[o + 4] << 16 | buf[o + 3] << 8) >> 8) * fractionInv;
              z = ((buf[o + 8] << 24 | buf[o + 7] << 16 | buf[o + 6] << 8) >> 8) * fractionInv;
            }
            setCenter(offset + i, x, y, z);
          }
        }
      },
      {
        init: () => [counts, 1],
        decode: (offset, counts2, buf) => {
          offset += BlockOffset;
          for (let i = 0; i < counts2; i++) {
            setAlpha(offset + i, buf[i] / 255);
          }
        }
      },
      {
        init: () => [counts, 3],
        decode: (offset, counts2, buf) => {
          offset += BlockOffset;
          for (let i = 0; i < counts2; i++) {
            const o = i * 3;
            setColor(offset + i, COLOR_LUT[buf[o]], COLOR_LUT[buf[o + 1]], COLOR_LUT[buf[o + 2]]);
          }
        }
      },
      {
        init: () => [counts, 3],
        decode: (offset, counts2, buf) => {
          offset += BlockOffset;
          for (let i = 0; i < counts2; i++) {
            const o = i * 3;
            setScale(offset + i, SCALE_LUT[buf[o]], SCALE_LUT[buf[o + 1]], SCALE_LUT[buf[o + 2]]);
          }
        }
      },
      {
        init: () => [counts, useSmallestThreeQuat ? 4 : 3],
        decode: (offset, counts2, buf) => {
          offset += BlockOffset;
          let qx, qy, qz, qw;
          for (let i = 0; i < counts2; i++) {
            if (!useSmallestThreeQuat) {
              const o = i * 3;
              qx = buf[o] / 127.5 - 1;
              qy = buf[o + 1] / 127.5 - 1;
              qz = buf[o + 2] / 127.5 - 1;
              qw = Math.sqrt(Math.max(0, 1 - qx * qx - qy * qy - qz * qz));
            } else {
              const o = i * 4;
              const packed = buf[o] | buf[o + 1] << 8 | buf[o + 2] << 16 | buf[o + 3] << 24;
              const largest = packed >>> 30;
              let temp = packed;
              let sum = 0;
              for (let j = 3; j >= 0; j--) {
                if (j === largest) {
                  continue;
                }
                const mag = temp & 511;
                const sign = temp >>> 9 & 1;
                temp >>>= 10;
                const v = Math.SQRT1_2 * (mag / 511) * (sign ? -1 : 1);
                rotation[j] = v;
                sum += v * v;
              }
              rotation[largest] = Math.sqrt(1 - sum);
              qx = rotation[0];
              qy = rotation[1];
              qz = rotation[2];
              qw = rotation[3];
            }
            setQuat(offset + i, qx, qy, qz, qw);
          }
        }
      },
      {
        init: () => [counts, shCounts],
        decode: (offset, counts2, buf) => {
          offset += BlockOffset;
          for (let i = 0; i < counts2; i++) {
            const o = i * shCounts;
            for (let j = 0; j < shCounts; j++) {
              shN[j] = (buf[o + j] - 128) / 128;
            }
            setShN(offset + i, shN);
          }
        }
      }
    ]);
    const peeked = await peekStream(stream, 8);
    stream = peeked.stream;
    if (isSpzV4(peeked.prefix)) {
      await readSpzV4Stream(stream, reader, decoder);
      data.finishBlock();
      return;
    }
    const source = stream.pipeThrough(new self.DecompressionStream("gzip")).getReader();
    while (true) {
      const { done, value } = await source.read();
      if (done) {
        break;
      }
      reader.write(value);
      decoder.flush();
    }
    data.finishBlock();
  }
  async write(writeStream, data) {
    const compressStream = new self.CompressionStream("gzip");
    const pipePromise = compressStream.readable.pipeTo(writeStream);
    const writer2 = compressStream.writable.getWriter();
    const version = SPZ_VERSION;
    const counts = data.counts;
    const shDegree = data.shDegree;
    const fractionalBits = 12;
    const flags = FLAG_ANTIALIASED;
    const reserved = 0;
    const fraction = 1 << fractionalBits;
    const shCounts = SH_MAPS2[shDegree];
    {
      const buffer = new Uint8Array(16);
      const header = new DataView(buffer.buffer);
      header.setUint32(0, SPZ_MAGIC, true);
      header.setUint32(4, version, true);
      header.setUint32(8, counts, true);
      header.setUint8(12, shDegree);
      header.setUint8(13, fractionalBits);
      header.setUint8(14, flags);
      header.setUint8(15, reserved);
      writer2.write(buffer);
    }
    const single = {
      x: 0,
      y: 0,
      z: 0,
      sx: 0,
      sy: 0,
      sz: 0,
      qx: 0,
      qy: 0,
      qz: 0,
      qw: 0,
      r: 0,
      g: 0,
      b: 0,
      a: 0,
      shN: new Array(shCounts)
    };
    {
      const ItemSize2 = 9;
      const chunkSize = 4096;
      const chunkCounts = Math.ceil(data.counts / chunkSize);
      for (let i = 0; i < chunkCounts; i++) {
        if (writer2.desiredSize <= 0) {
          await writer2.ready;
        }
        const currentChunkSize = Math.min(chunkSize, data.counts - i * chunkSize);
        const chunk = new Uint8Array(currentChunkSize * ItemSize2);
        const offset = i * chunkSize;
        for (let j = 0; j < currentChunkSize; j++) {
          data.getCenter(offset + j, single);
          const o = j * ItemSize2;
          const ix = clamp2(single.x * fraction, -8388607, 8388607);
          chunk[o + 0] = ix & 255;
          chunk[o + 1] = ix >> 8 & 255;
          chunk[o + 2] = ix >> 16 & 255;
          const iy = clamp2(single.y * fraction, -8388607, 8388607);
          chunk[o + 3] = iy & 255;
          chunk[o + 4] = iy >> 8 & 255;
          chunk[o + 5] = iy >> 16 & 255;
          const iz = clamp2(single.z * fraction, -8388607, 8388607);
          chunk[o + 6] = iz & 255;
          chunk[o + 7] = iz >> 8 & 255;
          chunk[o + 8] = iz >> 16 & 255;
        }
        writer2.write(chunk);
        await Promise.resolve();
      }
    }
    {
      const chunkSize = 65536;
      const chunkCounts = Math.ceil(data.counts / chunkSize);
      for (let i = 0; i < chunkCounts; i++) {
        if (writer2.desiredSize <= 0) {
          await writer2.ready;
        }
        const currentChunkSize = Math.min(chunkSize, data.counts - i * chunkSize);
        const chunk = new Uint8Array(currentChunkSize);
        const offset = i * chunkSize;
        for (let j = 0; j < currentChunkSize; j++) {
          data.getAlpha(offset + j, single);
          chunk[j] = clamp2(Math.round(single.a * 255), 0, 255);
        }
        writer2.write(chunk);
        await Promise.resolve();
      }
    }
    {
      const ItemSize2 = 3;
      const chunkSize = 16384;
      const chunkCounts = Math.ceil(data.counts / chunkSize);
      for (let i = 0; i < chunkCounts; i++) {
        if (writer2.desiredSize <= 0) {
          await writer2.ready;
        }
        const currentChunkSize = Math.min(chunkSize, data.counts - i * chunkSize);
        const chunk = new Uint8Array(currentChunkSize * ItemSize2);
        const offset = i * chunkSize;
        for (let j = 0; j < currentChunkSize; j++) {
          data.getColor(offset + j, single);
          const o = j * ItemSize2;
          chunk[o + 0] = clamp2(Math.round(((single.r - 0.5) / COLOR_SCALE + 0.5) * 255), 0, 255);
          chunk[o + 1] = clamp2(Math.round(((single.g - 0.5) / COLOR_SCALE + 0.5) * 255), 0, 255);
          chunk[o + 2] = clamp2(Math.round(((single.b - 0.5) / COLOR_SCALE + 0.5) * 255), 0, 255);
        }
        writer2.write(chunk);
        await Promise.resolve();
      }
    }
    {
      const ItemSize2 = 3;
      const chunkSize = 16384;
      const chunkCounts = Math.ceil(data.counts / chunkSize);
      for (let i = 0; i < chunkCounts; i++) {
        if (writer2.desiredSize <= 0) {
          await writer2.ready;
        }
        const currentChunkSize = Math.min(chunkSize, data.counts - i * chunkSize);
        const chunk = new Uint8Array(currentChunkSize * ItemSize2);
        const offset = i * chunkSize;
        for (let j = 0; j < currentChunkSize; j++) {
          data.getScale(offset + j, single);
          const o = j * ItemSize2;
          chunk[o + 0] = clamp2(Math.round((Math.log(single.sx) + 10) * 16), 0, 255);
          chunk[o + 1] = clamp2(Math.round((Math.log(single.sy) + 10) * 16), 0, 255);
          chunk[o + 2] = clamp2(Math.round((Math.log(single.sz) + 10) * 16), 0, 255);
        }
        writer2.write(chunk);
        await Promise.resolve();
      }
    }
    {
      const ItemSize2 = 4;
      const chunkSize = 16384;
      const chunkCounts = Math.ceil(data.counts / chunkSize);
      for (let i = 0; i < chunkCounts; i++) {
        if (writer2.desiredSize <= 0) {
          await writer2.ready;
        }
        const currentChunkSize = Math.min(chunkSize, data.counts - i * chunkSize);
        const chunk = new Uint8Array(currentChunkSize * ItemSize2);
        const offset = i * chunkSize;
        for (let j = 0; j < currentChunkSize; j++) {
          data.getQuat(offset + j, single);
          const o = j * ItemSize2;
          rotation[0] = single.qx;
          rotation[1] = single.qy;
          rotation[2] = single.qz;
          rotation[3] = single.qw;
          let iLargest = 0;
          for (let i2 = 1; i2 < 4; ++i2) {
            if (Math.abs(rotation[i2]) > Math.abs(rotation[iLargest])) {
              iLargest = i2;
            }
          }
          const negate = rotation[iLargest] < 0 ? 1 : 0;
          let comp = iLargest;
          for (let i2 = 0; i2 < 4; ++i2) {
            if (i2 !== iLargest) {
              const negbit = (rotation[i2] < 0 ? 1 : 0) ^ negate;
              const mag = Math.floor(((1 << 9) - 1) * (Math.abs(rotation[i2]) / Math.SQRT1_2) + 0.5);
              comp = comp << 10 | negbit << 9 | mag;
            }
          }
          chunk[o + 0] = comp & 255;
          chunk[o + 1] = comp >> 8 & 255;
          chunk[o + 2] = comp >> 16 & 255;
          chunk[o + 3] = comp >> 24 & 255;
        }
        writer2.write(chunk);
        await Promise.resolve();
      }
    }
    if (shDegree > 0) {
      const shN = single.shN;
      const ItemSize2 = shCounts;
      const chunkSize = 1024;
      const chunkCounts = Math.ceil(data.counts / chunkSize);
      for (let i = 0; i < chunkCounts; i++) {
        if (writer2.desiredSize <= 0) {
          await writer2.ready;
        }
        const currentChunkSize = Math.min(chunkSize, data.counts - i * chunkSize);
        const chunk = new Uint8Array(currentChunkSize * ItemSize2);
        const offset = i * chunkSize;
        for (let j = 0; j < currentChunkSize; j++) {
          data.getShN(offset + j, shN);
          const o = j * ItemSize2;
          for (let k = 0; k < ItemSize2; k++) {
            if (k < 9) {
              chunk[o + k] = clamp2(Math.floor((Math.round(shN[k] * 128) + 128 + SH_SCALE1 / 2) / SH_SCALE1) * SH_SCALE1, 0, 255);
              continue;
            }
            chunk[o + k] = clamp2(Math.floor((Math.round(shN[k] * 128) + 128 + SH_SCALE2 / 2) / SH_SCALE2) * SH_SCALE2, 0, 255);
          }
        }
        writer2.write(chunk);
        await Promise.resolve();
      }
    }
    await writer2.close();
    await pipePromise;
  }
};
function readUint64(view, offset) {
  const low = view.getUint32(offset, true);
  const high = view.getUint32(offset + 4, true);
  const value = high * 4294967296 + low;
  if (!Number.isSafeInteger(value)) {
    throw new Error(`SPZ stream size is too large: ${value}`);
  }
  return value;
}
function createSpzHeader(version, counts, shDegree, fractionalBits, flags, extra) {
  const header = new DataView(new ArrayBuffer(16));
  header.setUint32(0, SPZ_MAGIC, true);
  header.setUint32(4, version, true);
  header.setUint32(8, counts, true);
  header.setUint8(12, shDegree);
  header.setUint8(13, fractionalBits);
  header.setUint8(14, flags);
  header.setUint8(15, extra);
  return new Uint8Array(header.buffer);
}
function readSpzHeader(view) {
  return {
    version: view.getUint32(4, true),
    counts: view.getUint32(8, true),
    shDegree: view.getUint8(12),
    fractionalBits: view.getUint8(13),
    flags: view.getUint8(14),
    extra: view.getUint8(15)
  };
}
function getShCounts(shDegree) {
  const shCounts = SH_MAPS2[shDegree];
  if (shCounts === void 0) {
    throw new Error(`Unsupported SPZ SH degree: ${shDegree}`);
  }
  return shCounts;
}
function getSpzV4AttributeSizes(counts, shDegree) {
  const shCounts = getShCounts(shDegree);
  const sizes = [
    counts * 9,
    // position
    counts,
    // alpha
    counts * 3,
    // color
    counts * 3,
    // scale
    counts * 4
    // quat
  ];
  if (shDegree > 0) {
    sizes.push(counts * shCounts);
  }
  return sizes;
}
function isSpzV4(buffer) {
  if (buffer.byteLength < 8) {
    return false;
  }
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  return view.getUint32(0, true) === SPZ_MAGIC && view.getUint32(4, true) === 4;
}
async function readSpzV4Stream(stream, reader, decoder) {
  const read = createExactReader(stream);
  const header = await read(32);
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  const { counts, shDegree, fractionalBits, flags, extra: numStreams } = readSpzHeader(view);
  const tocByteOffset = view.getUint32(16, true);
  const expectedSizes = getSpzV4AttributeSizes(counts, shDegree);
  if (numStreams !== expectedSizes.length) {
    throw new Error(`Invalid SPZ v4 stream count: ${numStreams}`);
  }
  if (tocByteOffset < 32) {
    throw new Error(`Invalid SPZ v4 TOC offset: ${tocByteOffset}`);
  }
  if (tocByteOffset > 32) {
    await read(tocByteOffset - 32);
  }
  const toc = await read(numStreams * 16);
  const tocView = new DataView(toc.buffer, toc.byteOffset, toc.byteLength);
  reader.write(createSpzHeader(SPZ_VERSION, counts, shDegree, fractionalBits, flags & FLAG_ANTIALIASED, 0));
  decoder.flush();
  for (let i = 0; i < numStreams; i++) {
    const entryOffset = i * 16;
    const compressedSize = readUint64(tocView, entryOffset);
    const uncompressedSize = readUint64(tocView, entryOffset + 8);
    if (uncompressedSize !== expectedSizes[i]) {
      throw new Error(`Invalid SPZ v4 stream size at index ${i}`);
    }
    const compressed = await read(compressedSize);
    const decompressed = await decompressZstdBlock(compressed, uncompressedSize);
    if (decompressed.byteLength !== uncompressedSize) {
      throw new Error(`Invalid SPZ v4 decompressed size at index ${i}`);
    }
    reader.write(decompressed);
    decoder.flush();
  }
}
function createExactReader(stream) {
  const reader = stream.getReader();
  let chunk;
  let chunkOffset = 0;
  return async (byteLength) => {
    const result = new Uint8Array(byteLength);
    let offset = 0;
    while (offset < byteLength) {
      if (!chunk || chunkOffset >= chunk.byteLength) {
        const { done, value } = await reader.read();
        if (done || !value) {
          throw new Error("Invalid SPZ v4 file: stream ended unexpectedly");
        }
        chunk = value;
        chunkOffset = 0;
      }
      const copyLength = Math.min(byteLength - offset, chunk.byteLength - chunkOffset);
      result.set(chunk.subarray(chunkOffset, chunkOffset + copyLength), offset);
      chunkOffset += copyLength;
      offset += copyLength;
    }
    return result;
  };
}
async function peekStream(stream, byteLength) {
  const reader = stream.getReader();
  const chunks = [];
  let size = 0;
  while (size < byteLength) {
    const { done, value } = await reader.read();
    if (done || !value) {
      break;
    }
    chunks.push(value);
    size += value.byteLength;
  }
  const prefix = new Uint8Array(Math.min(size, byteLength));
  let offset = 0;
  for (const chunk of chunks) {
    const copyLength = Math.min(chunk.byteLength, prefix.byteLength - offset);
    prefix.set(chunk.subarray(0, copyLength), offset);
    offset += copyLength;
    if (offset === prefix.byteLength) {
      break;
    }
  }
  return {
    prefix,
    stream: new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(chunk);
        }
      },
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        controller.enqueue(value);
      },
      cancel(reason) {
        return reader.cancel(reason);
      }
    })
  };
}
var zstdDecoder;
async function getZstdDecoder() {
  if (!zstdDecoder) {
    const decoder = new ZSTDDecoder();
    zstdDecoder = decoder.init().then(() => decoder);
  }
  return zstdDecoder;
}
async function decompressZstdBlock(compressed, uncompressedSize) {
  const decoder = await getZstdDecoder();
  return decoder.decode(compressed, uncompressedSize);
}

// ../../external/egs-core/packages/loaders/splat-loader/file/lcc.ts
var ZIP_MAGIC2 = 67324752;
var SQRT_2 = 1.414213562373095;
var SQRT_2_INV = 0.7071067811865475;
function decodeRotation(v) {
  const d0 = (v & 1023) / 1023;
  const d1 = (v >> 10 & 1023) / 1023;
  const d2 = (v >> 20 & 1023) / 1023;
  const d3 = v >> 30 & 3;
  const qx = d0 * SQRT_2 - SQRT_2_INV;
  const qy = d1 * SQRT_2 - SQRT_2_INV;
  const qz = d2 * SQRT_2 - SQRT_2_INV;
  let sum = qx * qx + qy * qy + qz * qz;
  sum = Math.min(1, sum);
  const qw = Math.sqrt(1 - sum);
  if (d3 === 0) {
    return [qw, qx, qy, qz];
  } else if (d3 === 1) {
    return [qx, qw, qy, qz];
  } else if (d3 === 2) {
    return [qx, qy, qw, qz];
  }
  return [qx, qy, qz, qw];
}
function DecodePacked_11_10_11(enc) {
  return [
    (enc & 2047) / 2047,
    (enc >> 11 & 1023) / 1023,
    (enc >> 21 & 2047) / 2047
  ];
}
function mix(min, max2, s) {
  return (1 - s) * min + s * max2;
}
var LccFile = class {
  constructor() {
    this.counts = 0;
    this.shDegree = 0;
    this.refs = {};
  }
  load(buffer) {
    const view = new DataView(buffer.buffer);
    if (view.getUint32(0, true) !== ZIP_MAGIC2) {
      throw new Error("LCC file is not a valid zip archive.");
    }
    this.refs = extractFromRootDir(unzipSync(buffer));
    if (!["meta.lcc", "index.bin", "data.bin"].every((name) => !!this.refs[name])) {
      throw new Error("LCC file is missing required files.");
    }
    this.meta = JSON.parse(new TextDecoder().decode(this.refs["meta.lcc"]));
    this.counts = this.meta.splats[0];
    this.shDegree = !!this.refs["shcoef.bin"] ? 3 : 0;
  }
  async read(stream, contentLength, data) {
    let BlockOffset = 0;
    {
      const buffer = new Uint8Array(contentLength);
      const reader = stream.getReader();
      let offset = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer.set(value, offset);
        offset += value.length;
      }
      this.load(buffer);
      BlockOffset = await data.initBlock(this.counts, this.shDegree);
    }
    const setFn = data.set.bind(data);
    const setShFn = data.setShN.bind(data);
    const { meta, refs } = this;
    const infos = [];
    {
      const index2 = new DataView(refs["index.bin"].buffer);
      const infoCounts = Math.floor(index2.byteLength / (4 + 16 * meta.totalLevel));
      let offset = 0;
      for (let i = 0; i < infoCounts; i++) {
        const x = index2.getInt16(offset, true);
        offset += 2;
        const y = index2.getInt16(offset, true);
        offset += 2;
        const lods = [];
        for (let j = 0; j < meta.totalLevel; j++) {
          const points = index2.getInt32(offset, true);
          offset += 4;
          const ldOffset = Number(index2.getBigInt64(offset, true));
          offset += 8;
          const size = index2.getInt32(offset, true);
          offset += 4;
          lods.push({ points, offset: ldOffset, size });
        }
        infos.push({ x, y, lods });
      }
    }
    const attributes = meta.attributes.reduce((p, c) => {
      p[c.name] = c;
      return p;
    }, {});
    const { scale: { min: scaleMin, max: scaleMax }, shcoef: { min: shMin, max: shMax } } = attributes;
    const single = {
      x: 0,
      y: 0,
      z: 0,
      sx: 0,
      sy: 0,
      sz: 0,
      qx: 0,
      qy: 0,
      qz: 0,
      qw: 0,
      r: 0,
      g: 0,
      b: 0,
      a: 0,
      shN: []
    };
    const shData = new Array(45);
    let index = BlockOffset;
    for (let i = 0; i < infos.length; i++) {
      const info = infos[i];
      const { points, offset, size } = info.lods[0];
      const dataview = new DataView(refs["data.bin"].buffer, offset, size);
      const shN = refs["shcoef.bin"] ? new DataView(refs["shcoef.bin"].buffer, offset * 2, size * 2) : void 0;
      for (let j = 0; j < points; j++) {
        const off = j * 32;
        single.x = dataview.getFloat32(off + 0, true);
        single.y = dataview.getFloat32(off + 4, true);
        single.z = dataview.getFloat32(off + 8, true);
        single.r = dataview.getUint8(off + 12) / 255;
        single.g = dataview.getUint8(off + 13) / 255;
        single.b = dataview.getUint8(off + 14) / 255;
        single.a = dataview.getUint8(off + 15) / 255;
        single.sx = mix(scaleMin[0], scaleMax[0], dataview.getUint16(off + 16, true) / 65535);
        single.sy = mix(scaleMin[1], scaleMax[1], dataview.getUint16(off + 18, true) / 65535);
        single.sz = mix(scaleMin[2], scaleMax[2], dataview.getUint16(off + 20, true) / 65535);
        const quat = decodeRotation(dataview.getUint32(off + 22, true));
        single.qx = quat[0];
        single.qy = quat[1];
        single.qz = quat[2];
        single.qw = quat[3];
        setFn(index, single);
        if (shN) {
          const shOff = off * 2;
          for (let k = 0; k < 15; k++) {
            const v = DecodePacked_11_10_11(shN.getUint32(shOff + k * 4, true));
            shData[k * 3] = mix(shMin[0], shMax[0], v[0]);
            shData[k * 3 + 1] = mix(shMin[1], shMax[1], v[1]);
            shData[k * 3 + 2] = mix(shMin[2], shMax[2], v[2]);
          }
          setShFn(index, shData);
        }
        index++;
      }
    }
    data.finishBlock();
  }
  async write(_stream, _data) {
    throw new Error("Method not implemented.");
  }
};

// ../../external/egs-core/packages/loaders/splat-loader/file/esz.ts
var TEMP_ROT2 = new Array(4);
var PERM_TABLE2 = [
  // original quat idx ---> actual storage idx
  [0, 1, 2, 3],
  [3, 1, 2, 0],
  [1, 3, 2, 0],
  [1, 2, 3, 0]
];
var COLOR_SCALE2 = SH_C0 / 0.15;
function logTransform(value) {
  return Math.sign(value) * Math.log(Math.abs(value) + 1);
}
var EszFile = class {
  constructor() {
    this.counts = 0;
    this.shDegree = 0;
    /**
     * @internal
     */
    this.refs = {};
  }
  async load(stream, contentLength) {
    const buffer = new Uint8Array(contentLength);
    const reader = stream.getReader();
    let offset = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer.set(value, offset);
      offset += value.length;
    }
    this.refs = extractFromRootDir(unzipSync(buffer));
    const metaBuffer = this.refs["meta.json"];
    if (!metaBuffer) {
      throw new Error("SOG meta.json not found in the zip archive.");
    }
    const meta = this.meta = JSON.parse(new TextDecoder().decode(metaBuffer));
    this.version = meta.version;
    this.counts = meta.counts;
    this.shDegree = meta.shDegree;
  }
  async loadTexture(path) {
    let buffer = this.refs[path];
    if (!buffer && isUrl(path)) {
      buffer = await fetch(path).then((res) => res.arrayBuffer()).then((buf) => new Uint8Array(buf));
    }
    if (!buffer) {
      throw new Error(`Cannot load texture: ${path}`);
    }
    return decodeImage(buffer.buffer);
  }
  async read(stream, contentLength, data) {
    await this.load(stream, contentLength);
    const offset = await data.initBlock(this.counts, this.shDegree);
    const { resources } = this.meta;
    this.cached = await Promise.all([
      resources.means_l,
      resources.means_u,
      resources.scales,
      resources.quats,
      resources.sh0,
      resources.shN
    ].filter((path) => !!path).map((path) => this.loadTexture(path)));
    const setFn = data.set.bind(data);
    const setShFn = data.setShN.bind(data);
    const SCALE_LUT = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      SCALE_LUT[i] = Math.exp(i / 16 - 10);
    }
    const COLOR_LUT = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      COLOR_LUT[i] = (i / 255 - 0.5) * COLOR_SCALE2 + 0.5;
    }
    const { meta: { box }, counts, shDegree, cached } = this;
    const [means_l, means_u, scales, quats, color, shN] = cached.map((v) => v.data);
    const { min, max: max2 } = box;
    const minX = logTransform(min[0]);
    const minY = logTransform(min[1]);
    const minZ = logTransform(min[2]);
    const maxX = logTransform(max2[0]);
    const maxY = logTransform(max2[1]);
    const maxZ = logTransform(max2[2]);
    const rangeX = (maxX - minX) / 65535;
    const rangeY = (maxY - minY) / 65535;
    const rangeZ = (maxZ - minZ) / 65535;
    const single = {
      x: 0,
      y: 0,
      z: 0,
      sx: 0,
      sy: 0,
      sz: 0,
      qx: 0,
      qy: 0,
      qz: 0,
      qw: 0,
      r: 0,
      g: 0,
      b: 0,
      a: 0,
      shN: []
    };
    for (let i = 0; i < counts; i++) {
      const i4 = i * 4;
      const x = minX + rangeX * (means_l[i4 + 0] + (means_u[i4 + 0] << 8));
      const y = minY + rangeY * (means_l[i4 + 1] + (means_u[i4 + 1] << 8));
      const z = minZ + rangeZ * (means_l[i4 + 2] + (means_u[i4 + 2] << 8));
      single.x = Math.sign(x) * (Math.exp(Math.abs(x)) - 1);
      single.y = Math.sign(y) * (Math.exp(Math.abs(y)) - 1);
      single.z = Math.sign(z) * (Math.exp(Math.abs(z)) - 1);
      single.sx = SCALE_LUT[scales[i4 + 0]];
      single.sy = SCALE_LUT[scales[i4 + 1]];
      single.sz = SCALE_LUT[scales[i4 + 2]];
      TEMP_ROT2[0] = (quats[i4 + 0] / 255 - 0.5) * Math.SQRT2;
      TEMP_ROT2[1] = (quats[i4 + 1] / 255 - 0.5) * Math.SQRT2;
      TEMP_ROT2[2] = (quats[i4 + 2] / 255 - 0.5) * Math.SQRT2;
      TEMP_ROT2[3] = Math.sqrt(Math.max(0, 1 - TEMP_ROT2[0] * TEMP_ROT2[0] - TEMP_ROT2[1] * TEMP_ROT2[1] - TEMP_ROT2[2] * TEMP_ROT2[2]));
      const PERM = PERM_TABLE2[quats[i4 + 3] - 252];
      single.qx = TEMP_ROT2[PERM[0]];
      single.qy = TEMP_ROT2[PERM[1]];
      single.qz = TEMP_ROT2[PERM[2]];
      single.qw = TEMP_ROT2[PERM[3]];
      single.r = COLOR_LUT[color[i4 + 0]];
      single.g = COLOR_LUT[color[i4 + 1]];
      single.b = COLOR_LUT[color[i4 + 2]];
      single.a = color[i4 + 3] / 255;
      setFn(offset + i, single);
    }
    if (shN) {
      const shCounts = SH_MAPS2[shDegree];
      const shCoeffs = shCounts / 3;
      const sh = new Array(shCounts).fill(0);
      for (let i = 0; i < counts; i++) {
        const o = i * shCoeffs;
        for (let j = 0; j < shCoeffs; j++) {
          sh[j * 3 + 0] = (shN[(o + j) * 4 + 0] - 128) / 128;
          sh[j * 3 + 1] = (shN[(o + j) * 4 + 1] - 128) / 128;
          sh[j * 3 + 2] = (shN[(o + j) * 4 + 2] - 128) / 128;
        }
        setShFn(offset + i, sh);
      }
    }
    data.finishBlock();
  }
  async write(_stream, _data) {
    throw new Error("Method not implemented.");
  }
};

// ../../external/egs-core/packages/loaders/splat-loader/worker.ts
var writer;
self.onmessage = async (event) => {
  try {
    const message = event.data;
    switch (message.taskType) {
      case "ParseSplat" /* ParseSplat */: {
        const { type, packType, stream, contentLength, extras: { maxShDegree, maxTextureSize } } = event.data.payload;
        let splatData;
        switch (packType) {
          case 0 /* Raw */: {
            splatData = new RawSplatData(maxShDegree, maxTextureSize);
            break;
          }
          case 1 /* Compressed */: {
            splatData = new CompressedSplatData(maxShDegree, maxTextureSize);
            break;
          }
          case 2 /* SuperCompressed */: {
            splatData = new SuperCompressedSplatData(maxShDegree, maxTextureSize);
            break;
          }
          case 3 /* Sog */: {
            splatData = new SogSplatData(maxShDegree, maxTextureSize);
          }
        }
        let file;
        switch (type) {
          case 0 /* PLY */: {
            file = new PlyFile();
            break;
          }
          case 1 /* SPZ */: {
            file = new SpzFile();
            break;
          }
          case 3 /* KSPLAT */: {
            file = new KsplatFile();
            break;
          }
          case 2 /* SPLAT */: {
            file = new SplatFile();
            break;
          }
          case 4 /* SOG */: {
            file = new SogFile();
            break;
          }
          case 5 /* LCC */: {
            file = new LccFile();
            break;
          }
          case 6 /* ESZ */: {
            file = new EszFile();
            break;
          }
        }
        let reader = stream;
        if (!reader) {
          const stream2 = new TransformStream();
          writer = stream2.writable.getWriter();
          reader = stream2.readable;
        }
        if (packType === 3 /* Sog */) {
          await file.load(reader, contentLength);
          const { meta, refs } = file;
          let splatMeta;
          if (meta.version === void 0) {
            const m = meta;
            splatMeta = {
              version: 1,
              counts: m.means.shape[0],
              shDegree: NUM_F_REST_TO_SH_DEGREE[m.shN?.shape?.[1] ?? 0],
              means: {
                mins: [m.means.mins[0], m.means.mins[1], m.means.mins[2]],
                maxs: [m.means.maxs[0], m.means.maxs[1], m.means.maxs[2]]
              },
              scales: {
                mins: [m.scales.mins[0], m.scales.mins[1], m.scales.mins[2]],
                maxs: [m.scales.maxs[0], m.scales.maxs[1], m.scales.maxs[2]]
              },
              sh0: {
                mins: [m.sh0.mins[0], m.sh0.mins[1], m.sh0.mins[2], m.sh0.mins[3]],
                maxs: [m.sh0.maxs[0], m.sh0.maxs[1], m.sh0.maxs[2], m.sh0.maxs[3]]
              },
              shN: m.shN ? {
                mins: m.shN.mins,
                maxs: m.shN.maxs
              } : void 0
            };
          } else {
            const m = meta;
            splatMeta = {
              version: 2,
              counts: m.count,
              shDegree: m.shN?.bands ?? 0,
              means: {
                mins: [m.means.mins[0], m.means.mins[1], m.means.mins[2]],
                maxs: [m.means.maxs[0], m.means.maxs[1], m.means.maxs[2]]
              },
              scales: {
                codebook: m.scales.codebook
              },
              sh0: {
                codebook: m.sh0.codebook
              },
              shN: m.shN ? {
                codebook: m.shN.codebook
              } : void 0
            };
          }
          splatData.load(
            splatMeta,
            refs[meta.means.files[0]],
            refs[meta.means.files[1]],
            refs[meta.scales.files[0]],
            refs[meta.quats.files[0]],
            refs[meta.sh0.files[0]],
            ...meta.shN ? [
              refs[meta.shN.files[0]],
              refs[meta.shN.files[1]]
            ] : []
          );
        } else {
          await file.read(reader, contentLength, splatData);
        }
        writer = void 0;
        const splats = splatData.serialize();
        const payload = { status: 0 /* Success */, payload: splats };
        postMessage(
          payload,
          splats.samplers.map((v) => v.source.buffer)
        );
        return;
      }
      case "PostStreamChunk" /* PostStreamChunk */: {
        const { chunk } = event.data.payload;
        if (!writer) {
          return;
        }
        if (chunk) {
          writer.write(chunk);
        } else {
          writer.close();
        }
        return;
      }
      case "SortSplats" /* SortSplats */: {
        const { splatCounts, sorting, ordering } = event.data.payload;
        const activeSplats = sortSplats(splatCounts, sorting, ordering);
        const payload = { status: 0 /* Success */, payload: { activeSplats, sorting, ordering } };
        postMessage(payload, [sorting.buffer, ordering.buffer]);
        return;
      }
      default: {
        const check = message.taskType;
        throw new Error(`Unsupported task type: ${check}.`);
      }
    }
  } catch (e) {
    console.error(e);
    postMessage({ status: 1 /* Fail */, payload: e.toString() });
  }
};
//# sourceMappingURL=splat-worker.js.map
