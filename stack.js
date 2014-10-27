"use strict";


var STACK_DEBUG = 0;

function AsmStack(stdlib, foreign, heap) {
//  "use asm";
  
  var size = 0;
  var int8 = new stdlib.Int8Array(heap);
  var int32 = new stdlib.Int32Array(heap);
  var float32 = new stdlib.Float32Array(heap);
  var float64 = new stdlib.Float64Array(heap);
  var fround = stdlib.Math.fround;
  var deleteRef = foreign.deleteRef;
  var foreignExecute = foreign.execute;
  var ip = 0;
  var heapOffset = 0;

  // NOTE: These must match the non-ASM constants.
  var ANY_WORD = 0;
  var OBJECT = 1;
  var INT = 2;
  var FLOAT = 3;
  var LONG = 4;
  var DOUBLE = 5;

  //       bytes:   4    4    4    4    = 16
  // WORD(128)  = [ DATA null TYPE null ]
  // DWORD(256) = [ DATA DATA TYPE null null null null null ]

  function clearRefs(offset) {
    offset = offset | 0;
    if ((int32[(offset + 8) >> 2] | 0) == (OBJECT | 0)) {
      int32[(offset + 8) >> 2] = 0;
      deleteRef(int32[offset >> 2] | 0);
    }
  }

  function setInt(offset, x) {
    offset = offset | 0;
    x = x | 0;

    clearRefs(offset);

    int32[(offset +  0) >> 2] = x;
    int32[(offset +  4) >> 2] = 0 | 0;
    int32[(offset +  8) >> 2] = INT | 0;
    int32[(offset + 12) >> 2] = 0 | 0;
  }

  function setLong(offset, high, low) {
    offset = offset | 0;
    high = high | 0;
    low = low | 0;

    clearRefs(offset);
    clearRefs(offset + 16 | 0);

    int32[(offset +  0) >> 2] = high | 0;
    int32[(offset +  4) >> 2] = low | 0;
    int32[(offset +  8) >> 2] = LONG | 0;
    int32[(offset + 12) >> 2] = 0 | 0;
    int32[(offset + 16) >> 2] = 0 | 0;
    int32[(offset + 20) >> 2] = 0 | 0;
    int32[(offset + 24) >> 2] = LONG | 0;
    int32[(offset + 28) >> 2] = 0 | 0;
  }

  function setWord(offset, high, low, type, unused) {
    offset = offset | 0;
    high = high | 0;
    low = low | 0;
    type = type | 0;
    unused = unused | 0;

    clearRefs(offset);

    int32[(offset +  0) >> 2] = high;
    int32[(offset +  4) >> 2] = low;
    int32[(offset +  8) >> 2] = type;
    int32[(offset + 12) >> 2] = unused;
  }

  function setFloat(offset, x) {
    offset = offset | 0;
    x = fround(x);

    clearRefs(offset);

    float32[(offset +  0) >> 2] = x;
    int32[  (offset +  4) >> 2] = 0 | 0;
    int32[  (offset +  8) >> 2] = FLOAT | 0;
    int32[  (offset + 12) >> 2] = 0 | 0;
  }

  function setDouble(offset, x) {
    offset = offset | 0;
    x = +x;

    clearRefs(offset);
    clearRefs(offset + 16 | 0);

    float64[offset >> 3] = x;
    int32[(offset +  8) >> 2] = DOUBLE | 0;
    int32[(offset + 12) >> 2] = 0 | 0;
    int32[(offset + 16) >> 2] = 0 | 0;
    int32[(offset + 20) >> 2] = 0 | 0;
    int32[(offset + 24) >> 2] = DOUBLE | 0;
    int32[(offset + 28) >> 2] = 0 | 0;
  }

  function setRef(offset, id) {
    offset = offset | 0;
    id = id | 0;

    clearRefs(offset);

    int32[(offset +  0) >> 2] = id;
    int32[(offset +  4) >> 2] = 0 | 0;
    int32[(offset +  8) >> 2] = OBJECT | 0;
    int32[(offset + 12) >> 2] = 0 | 0;
  }

  function getInt(offset) {
    offset = offset | 0;
    return int32[offset >> 2] | 0;
  }

  function getFloat(offset) {
    offset = offset | 0;
    return fround(float32[offset >> 2]);
  }

  function getDouble(offset) {
    offset = offset | 0;
    return +float64[offset >> 3];
  }

  function getRef(offset) {
    offset = offset | 0;
    return int32[offset >> 2] | 0;
  }

  function pushInt(x) {
    x = x | 0;
    setInt(size, x);
    size = size + 16 | 0;
  }

  function pushLong(high, low) {
    high = high | 0;
    low = low | 0;
    setLong(size, high, low);
    size = size + 32 | 0;
  }

  function pushWord(high, low, type, unused) {
    high = high | 0;
    low = low | 0;
    type = type | 0;
    unused = unused | 0;
    setWord(size, high, low, type, unused);
    size = size + 16 | 0;
  }

  function pushFloat(x) {
    x = fround(x);
    setFloat(size, x);
    size = size + 16 | 0;
  }

  function pushDouble(x) {
    x = +x;
    setDouble(size, x);
    size = size + 32 | 0;
  }

  function pushRef(id) {
    id = id | 0;
    setRef(size, id);
    size = size + 16 | 0;
  }

  function popInt() {
    size = size - 16 | 0;
    return getInt(size) | 0;
  }

  function popFloat() {
    size = size - 16 | 0;
    return fround(getFloat(size));
  }

  function popDouble() {
    size = size - 32 | 0;
    return +getDouble(size);
  }

  function popRef() {
    size = size - 16 | 0;
    return getRef(size) | 0;
  }

  function getSize() {
    return size | 0;
  }

  function setSize(newSize) {
    newSize = newSize | 0;

    while ((size | 0) > (newSize | 0)) {
      size = size - 16 | 0;
      clearRefs(size);
    }
     
    size = newSize | 0;
  }


  // Frame

  function read8() {
    ip = ip + 1 | 0;
    return int8[(heapOffset + ip - 1) | 0] | 0;
  }

  function read16() {
    return (read8()|0) << 8 | (read8()|0) | 0;
  }

  function read32() {
    return (read16()|0) << 16 | (read16()|0) | 0;
  }

  function read8Signed() {
    var x = 0;
    x = read8()|0;
    return (((x|0) > 0x7f) ? (x - 0x100 | 0) : x) | 0;
  }

  function read16Signed() {
    var x = 0;
    x = read16()|0;
    return (((x|0) > 0x7fff) ? (x - 0x10000 | 0) : x) | 0;
  }

  function read32Signed() {
    var x = 0;
    x = read32()|0;
    return (((x|0) > 0x7fffffff) ? (x - 0x100000000 | 0) : x) | 0;
  }

  function execute(newHeapOffset, newIp) {
    newHeapOffset = newHeapOffset | 0;
    newIp = newIp | 0;

    var op = 0;

    heapOffset = newHeapOffset;
    ip = newIp;

    while(1) {
      op = read8() | 0;
      console.log("ASM OP", OPCODES[op], op, ip);
      switch(op | 0) {
      case 0x00: // nop
        break;
      // case 0x01: // aconst_null
      //   break;
      case 0x02: // iconst_m1
      case 0x03: // iconst_0
      case 0x04: // iconst_1
      case 0x05: // iconst_2
      case 0x06: // iconst_3
      case 0x07: // iconst_4
      case 0x08: // iconst_5
        pushInt(op - 0x03 | 0);
        break;
      case 0x09: // lconst_0
      case 0x0a: // lconst_1
        pushLong(0, op - 0x09 | 0);
        break;
      case 0x0b: // fconst_0
      case 0x0c: // fconst_1
      case 0x0d: // fconst_2
        pushFloat(fround(+(op - 0x0b | 0)));
        break;
      case 0x0e:
      case 0x0f:
        pushDouble(+(op - 0x0e | 0));
        break;
      default:
        if (foreignExecute(ip, op)) {
          return true;
        }
      }
    }
  }

  return {
    setInt: setInt,
    setLong: setLong,
    setWord: setWord,
    setFloat: setFloat,
    setDouble: setDouble,
    setRef: setRef,
    getInt: getInt,
    getFloat: getFloat,
    getDouble: getDouble,
    getRef: getRef,
    pushInt: pushInt,
    pushLong: pushLong,
    pushWord: pushWord,
    pushFloat: pushFloat,
    pushDouble: pushDouble,
    pushRef: pushRef,
    popInt: popInt,
    popFloat: popFloat,
    popDouble: popDouble,
    popRef: popRef,
    getSize: getSize,
    setSize: setSize,

    execute: execute,
    read8: read8,
    read8Signed: read8Signed,
    read16: read16,
    read16Signed: read16Signed,
    read32: read32,
    read32Signed: read32Signed
  };
}

function Stack(heap) {
  this.bytes = new Int8Array(heap);
  this.int32 = new Int32Array(heap);
  this.asm = new AsmStack(window, {
    deleteRef: this.deleteRef.bind(this),
    execute: this.foreignExecute.bind(this)
  }, heap);

  this.objects = {};
  this.nextId = 0;

  // Heap
  this.firstAvailableHeapOffset = this.bytes.length - 1;
  this.methodsInHeap = {}; // methodId => offset
}

Stack.ANY_WORD = 0;
Stack.OBJECT = 1;
Stack.INT = 2;
Stack.FLOAT = 3;
Stack.LONG = 4;
Stack.DOUBLE = 5;
Stack.VOID = 6;

function Word(high, low, type, unused, ref) {
  this.high = high;
  this.low = low;
  this.type = type;
  this.unused = unused;
  this.ref = ref;
}

Stack.stringToType = function(s) {
  switch(s[0]) {
  case "I":
  case "C":
  case "S":
  case "B":
  case "Z":
    return Stack.INT;
  case "[":
  case "L":
    return Stack.OBJECT;
  case "F":
    return Stack.FLOAT;
  case "D":
    return Stack.DOUBLE;
  case "J":
    return Stack.LONG;
  case "V":
    return Stack.VOID;
  default:
    throw new Error("Unknown stack type: " + s);
  }
};


Stack.prototype = {
  deleteRef: function(id) {
    delete this.objects[id];
  },

  get: function(type, offset) {
    var g = this.get_(type, offset);
    if (g === undefined) {
      return null;
    }
    return g;
  },

  typeCheck: function(expected, offset) {
    var actual = this.int32[(offset + 8) >> 2];
    if (expected === Stack.ANY_WORD) {
      return;
    }

    var ok = true;
    switch(actual) {
      case Stack.INT: ok = "ICSBZ".indexOf(expected) !== -1; break;
      case Stack.FLOAT: ok = expected === Stack.FLOAT; break;
      case Stack.DOUBLE: ok = expected === Stack.DOUBLE; break;
      case Stack.LONG: ok = expected === Stack.LONG; break;
      case Stack.OBJECT: ok = "[L".indexOf(expected) !== -1; break;
    }

    if (!ok) {
      console.error("Stack type check failure: expected", expected + ",", "got", actual);
      console.error(new Error().stack);
      throw VM.Pause;
    }
  },

  get_: function(type, offset) {
    STACK_DEBUG && this.typeCheck(type, offset);
    
    switch(type) {
    case Stack.INT:
    case Stack.BYTE:
    case Stack.CHAR:
    case Stack.SHORT:
    case Stack.BOOLEAN:
      return this.asm.getInt(offset);
    case Stack.FLOAT:
      return this.asm.getFloat(offset);
    case Stack.DOUBLE:
      return this.asm.getDouble(offset);
    case Stack.LONG:
      return Long.fromBits(this.int32[(offset + 4) >> 2],
                           this.int32[(offset + 0) >> 2]);
    case Stack.OBJECT:
    case Stack.ARRAY:
      var id = this.asm.getRef(offset);
      return this.objects[id];
    case Stack.ANY_WORD:
      var high = this.int32[(offset +  0) >> 2];
      var low = this.int32[(offset +  4) >> 2];
      var type = this.int32[(offset +  8) >> 2];
      var unused = this.int32[(offset + 12) >> 2];
      var ref = undefined;
      if (type === Stack.OBJECT) {
        ref = this.objects[high];
      }
      return new Word(high, low, type, unused, ref);
    default:
      throw new Error("Unrecognized type: " + type);
    }
  },

  set: function(offset, type, value) {
    // If we're overwriting a previous ref, kill it.
    switch(type) {
    case Stack.INT:
    case Stack.BYTE:
    case Stack.CHAR:
    case Stack.SHORT:
    case Stack.BOOLEAN:
      return this.asm.setInt(offset, value);
    case Stack.FLOAT:
      return this.asm.setFloat(offset, value);
    case Stack.DOUBLE:
      return this.asm.setDouble(offset, value);
    case Stack.LONG:
      return this.asm.setLong(offset, value.getHighBits(), value.getLowBits());
    case Stack.OBJECT:
    case Stack.ARRAY:
      var id = ++this.nextId;
      this.objects[id] = value;
      this.asm.setRef(offset, id);
      return null;
    default:
      throw new Error("Unrecognized type: " + type);
    }
  },

  push: function(type, value, _log) {
    switch(type) {
    case Stack.INT:
    case Stack.BYTE:
    case Stack.CHAR:
    case Stack.SHORT:
    case Stack.BOOLEAN:
      return this.asm.pushInt(value);
    case Stack.FLOAT:
      return this.asm.pushFloat(value);
    case Stack.DOUBLE:
      return this.asm.pushDouble(value);
    case Stack.LONG:
      return this.asm.pushLong(value.getHighBits(), value.getLowBits());
    case Stack.OBJECT:
    case Stack.ARRAY:
      var id = ++this.nextId;
      this.objects[id] = value;
      this.asm.pushRef(id);
      return null;
    case Stack.ANY_WORD: // push any word
      var size = this.asm.getSize();
      if (value.ref !== undefined) {
        this.push(Stack.OBJECT, value.ref, false);
      } else {
        this.asm.pushWord(value.high, value.low, value.type, value.unused);
      }
      return null;
    default:
      throw new Error("Unrecognized type: " + type);
    }
  },

  pop: function(type) {
    STACK_DEBUG && this.typeCheck(type, this.size - 16);

    switch(type) {
    case Stack.INT:
    case Stack.BYTE:
    case Stack.CHAR:
    case Stack.SHORT:
    case Stack.BOOLEAN:
      return this.asm.popInt();
    case Stack.FLOAT:
      return this.asm.popFloat();
    case Stack.DOUBLE:
      return this.asm.popDouble();
    case Stack.LONG:
      var size = this.asm.getSize() - 32;
      var value = Long.fromBits(this.int32[(size + 4) >> 2],
                                this.int32[(size + 0) >> 2]);
      this.asm.setSize(size);
      return value;
    case Stack.OBJECT:
    case Stack.ARRAY:
      var id = this.asm.popRef();
      var value = this.objects[id];
      delete this.objects[id];
      var size = this.asm.getSize();
      this.int32[(size +  8) >> 2] = 0
      return value;
    case Stack.ANY_WORD: // pop any word
      var size = this.asm.getSize() - 16;
      var high = this.int32[(size + 0) >> 2];
      var low = this.int32[(size + 4) >> 2];
      var type = this.int32[(size + 8) >> 2];
      var unused = this.int32[(size + 12) >> 2];
      var ref = undefined;
      if (type === Stack.OBJECT) {
        ref = this.objects[high];
        delete this.objects[high];
      }
      this.asm.setSize(size);
      return new Word(high, low, type, unused, ref);
    default:
      throw new Error("Unrecognized type: " + type);
    }
  },

  get size() {
    return this.asm.getSize();
  },

  set size(newSize) {
    this.asm.setSize(newSize);
  },

  read: function(type, idx) {
    return this.get(type, this.size - (idx << 4) | 0);
  },

  // Heap

  copyCodeIntoHeap: function(methodInfo, code) {
    if (this.methodsInHeap[methodInfo.uniqueId]) {
      return this.methodsInHeap[methodInfo.uniqueId];
    }
    var offset = this.firstAvailableHeapOffset - code.length;
    this.bytes.set(code, offset);
    this.firstAvailableHeapOffset += code.length;
    this.methodsInHeap[methodInfo.uniqueId] = offset;
    return offset;
  },

  frame: null,
  ctx: null,

  execute: function(ctx, frame) {
    this.ctx = ctx;
    this.frame = frame;
    var newIp = this.asm.execute(frame.heapOffset, frame.ip);
  },

  foreignExecute: function(ip, op) {
    this.frame.ip = ip;
    var ret = VM.executeOp(this.ctx, op);
    
  },
  
};


