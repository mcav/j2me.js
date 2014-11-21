/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';


var $ctx;

function Context(runtime) {
  this.frames = [];
  this.frameSets = [];
  this.runtime = runtime;
  this.runtime.addContext(this);
  // TODO these should probably be moved to runtime...
  this.methodInfos = runtime.methodInfos;
  this.classInfos = runtime.classInfos;
  this.fieldInfos = runtime.fieldInfos;

  this.paused = false;
  this.ignoreYields = false;
  this.yieldingFrames = [];
  this.onFramesRanOut = function() { }
}

Context.prototype.kill = function() {
  this.runtime.removeContext(this);
}

Context.prototype.current = function() {
  var frames = this.frames;
  return frames[frames.length - 1];
}

Context.prototype.pause = function() {
  this.paused = true;
}

Context.prototype.resume = function() {
  this.paused = false;
  this.scheduleNextTick();
}

Context.prototype.beginInvoke = function(methodInfo, locals) {
  locals = locals || [];
  // //Instrument.callEnterHooks(methodInfo, caller, callee);
  // return frame;
  var thisObj, args, returnValue;
  if (methodInfo.isStatic) {
    thisObj = null;
    args = locals;
  } else {
    thisObj = locals[0];
    args = locals.slice(1);
  }

  $ctx = this;

  var indent = "";
  for (var i = 0; i < this.frames.length; i++) {
    indent += "  ";
  }

  console.log(this.thread && this.thread.pid, indent, "CALL", methodInfo.implKey);
  try {
    this.frames.push(new Frame(methodInfo, locals));
    return this.endInvoke(methodInfo.invoke.apply(thisObj, args));
  } catch (e) {
    return this.endInvokeWithException(e);
  }
}

Context.prototype.yieldNow = function() {
  this.scheduleNextTick();
  throw new VM.Yield();
}

Context.prototype.scheduleNextTick = function() {
  if (this._nextTimeout) {
    clearTimeout(this._nextTimeout);
  }

  if (this.paused) {
    return;
  }

  this._nextTimeout = window.setZeroTimeout(function() {
    var frame = this.current();
    if (frame && frame.isInterpreted) {
      $ctx = this;
      VM.execute();
    }
  }.bind(this));
}

Context.prototype.endInvoke = function(returnValue) {
  if (returnValue instanceof VM.Yield) {
    return returnValue;
  } else {
    var frame = this.frames.pop();

    if (typeof returnValue === "string") {
      returnValue = util.newString(returnValue);
    }

    var indent = "";
    for (var i = 0; i < this.frames.length; i++) {
      indent += "  ";
    }

    console.log(this.thread && this.thread.pid, indent, "<---", frame.methodInfo.implKey);

    if (this.frames.length === 0) {
      this.onFramesRanOut();
    }
    return returnValue;
  }
}


Context.prototype.endInvokeWithException = function(ex) {
  if (ex instanceof VM.Yield) {
    throw ex;
  }

  if (this.frames.length === 0) {
    this.onFramesRanOut();

    console.error(util.buildExceptionLog(ex, [])); // XXX stackTrace

    if (this.thread && this.thread.waiting && this.thread.waiting.length > 0) {
      this.thread.waiting.forEach(function(waitingCtx, n) {
        this.thread.waiting[n] = null;
        waitingCtx.wakeup($ctx.thread);
      });
    } else {
//      throw new Error(util.buildExceptionLog(ex, stackTrace));
    }
  } else {
    throw ex;
  }
}

Context.prototype.yieldInvoke = function(locals, stack, ip) {
  var frame = ctx.current();
  frame.locals = locals;
  frame.stack = stack;
  frame.ip = ip;
}

  //Instrument.callExitHooks(callee.methodInfo, caller, callee);


Context.prototype.pushClassInitFrame = function(classInfo) {
  if (this.runtime.initialized[classInfo.className])
    return;
  classInfo.thread = this.thread;
  var syntheticMethod = new MethodInfo({
    name: "ClassInitSynthetic",
    signature: "()V",
    isStatic: false,
    classInfo: {
      className: classInfo.className,
      vmc: {},
      vfc: {},
      constant_pool: [
        null,
        { tag: TAGS.CONSTANT_Methodref, class_index: 2, name_and_type_index: 4 },
        { tag: TAGS.CONSTANT_Class, name_index: 3 },
        { bytes: "java/lang/Class" },
        { name_index: 5, signature_index: 6 },
        { bytes: "invoke_clinit" },
        { bytes: "()V" },
        { tag: TAGS.CONSTANT_Methodref, class_index: 2, name_and_type_index: 8 },
        { name_index: 9, signature_index: 10 },
        { bytes: "init9" },
        { bytes: "()V" },
      ],
    },
    code: new Uint8Array([
        0x2a,             // aload_0
        0x59,             // dup
        0x59,             // dup
        0x59,             // dup
        0xc2,             // monitorenter
        0xb7, 0x00, 0x01, // invokespecial <idx=1>
        0xb7, 0x00, 0x07, // invokespecial <idx=7>
        0xc3,             // monitorexit
        0xb1,             // return
    ])
  });

  return this.beginInvoke(syntheticMethod, [classInfo.getClassObject(this)]);
}

Context.prototype.raiseException = function(className, message) {
  if (!message)
    message = "";
  message = "" + message;
  var syntheticMethod = new MethodInfo({
    name: "RaiseExceptionSynthetic",
    signature: "()V",
    isStatic: true,
    classInfo: {
      className: className,
      vmc: {},
      vfc: {},
      constant_pool: [
        null,
        { tag: TAGS.CONSTANT_Class, name_index: 2 },
        { bytes: className },
        { tag: TAGS.CONSTANT_String, string_index: 4 },
        { bytes: message },
        { tag: TAGS.CONSTANT_Methodref, class_index: 1, name_and_type_index: 6 },
        { name_index: 7, signature_index: 8 },
        { bytes: "<init>" },
        { bytes: "(Ljava/lang/String;)V" },
      ],
    },
    code: new Uint8Array([
      0xbb, 0x00, 0x01, // new <idx=1>
      0x59,             // dup
      0x12, 0x03,       // ldc <idx=2>
      0xb7, 0x00, 0x05, // invokespecial <idx=5>
      0xbf              // athrow
    ])
  });

  return this.beginInvoke(syntheticMethod);
}

Context.prototype.raiseExceptionAndYield = function(className, message) {
  this.raiseException(className, message);
  return this.yieldNow();
}

Context.prototype.compileMethodInfo = function(methodInfo) {
  var fn = J2ME.compileMethodInfo(methodInfo, this, J2ME.CompilationTarget.Runtime);
  if (fn) {
    methodInfo.fn = fn;
  } else {
    methodInfo.dontCompile = true;
  }
};

Context.prototype.block = function(obj, queue, lockLevel) {
  if (!obj[queue])
    obj[queue] = [];
  obj[queue].push(this);
  this.lockLevel = lockLevel;
  this.pause();
  return this.yieldNow();
}

Context.prototype.unblock = function(obj, queue, notifyAll, callback) {
  while (obj[queue] && obj[queue].length) {
    var ctx = obj[queue].pop();
    if (!ctx)
      continue;
    callback(ctx);
    if (!notifyAll)
      break;
  }
}

Context.prototype.wakeup = function(obj) {
  if (this.lockTimeout !== null) {
    window.clearTimeout(this.lockTimeout);
    this.lockTimeout = null;
  }
  if (obj.lock) {
    if (!obj.ready)
      obj.ready = [];
    obj.ready.push(this);
  } else {
    while (this.lockLevel-- > 0)
      this.monitorEnter(obj);
    this.resume();
  }
}

Context.prototype.monitorEnter = function(obj) {
  console.log("monitorEnter", this.thread && this.thread.pid);
  var lock = obj.lock;
  if (!lock) {
    obj.lock = { thread: this.thread, level: 1 };
    return;
  }
  if (lock.thread === this.thread) {
    ++lock.level;
    return;
  }
  this.block(obj, "ready", 1);
}

Context.prototype.monitorExit = function(obj) {
  console.log("monitorExit", this.thread && this.thread.pid);
  var lock = obj.lock;
  if (lock.thread !== this.thread)
    this.raiseExceptionAndYield("java/lang/IllegalMonitorStateException");
  if (--lock.level > 0) {
    return;
  }
  obj.lock = null;
  this.unblock(obj, "ready", false, function(ctx) {
    ctx.wakeup(obj);
  });
}

Context.prototype.wait = function(obj, timeout) {
  var lock = obj.lock;
  if (timeout < 0)
    this.raiseExceptionAndYield("java/lang/IllegalArgumentException");
  if (!lock || lock.thread !== this.thread)
    this.raiseExceptionAndYield("java/lang/IllegalMonitorStateException");
  var lockLevel = lock.level;
  while (lock.level > 0)
    this.monitorExit(obj);
  if (timeout) {
    var self = this;
    this.lockTimeout = window.setTimeout(function() {
      obj.waiting.forEach(function(ctx, n) {
        if (ctx === self) {
          obj.waiting[n] = null;
          ctx.wakeup(obj);
        }
      });
    }, timeout);
  } else {
    this.lockTimeout = null;
  }
  this.block(obj, "waiting", lockLevel);
}

Context.prototype.notify = function(obj, notifyAll) {
  if (!obj.lock || obj.lock.thread !== this.thread)
    this.raiseExceptionAndYield("java/lang/IllegalMonitorStateException");
  this.unblock(obj, "waiting", notifyAll, function(ctx) {
    ctx.wakeup(obj);
  });
}

Context.prototype.newObjectFromId = function(id) {
    return util.newObject(this.classInfos[id]);
}

Context.prototype.newStringConstant = function(s) {
    return this.runtime.newStringConstant(s);
}

Context.prototype.S = function(s) {
  return this.runtime.newStringConstant(s);
}

Context.prototype.getStatic = function(fieldInfoId, type) {
  // TODO unify this with getstatic in runtime and the VM getstatic code.
  var value = this.runtime.staticFields[fieldInfoId];
  if (typeof value === "undefined") {
    value = util.defaultValue(type);
  }
  return value;
};

Context.prototype.putStatic = function(fieldInfoId, value) {
    this.runtime.staticFields[fieldInfoId] = value;
};

Context.prototype.resolve = function(cp, idx, isStatic) {
  var constant = cp[idx];
  if (!constant.tag)
    return constant;
  switch(constant.tag) {
    case 3: // TAGS.CONSTANT_Integer
      constant = constant.integer;
      break;
    case 4: // TAGS.CONSTANT_Float
      constant = constant.float;
      break;
    case 8: // TAGS.CONSTANT_String
      constant = this.newStringConstant(cp[constant.string_index].bytes);
      break;
    case 5: // TAGS.CONSTANT_Long
      constant = Long.fromBits(constant.lowBits, constant.highBits);
      break;
    case 6: // TAGS.CONSTANT_Double
      constant = constant.double;
      break;
    case 7: // TAGS.CONSTANT_Class
      constant = CLASSES.getClass(cp[constant.name_index].bytes);
      break;
    case 9: // TAGS.CONSTANT_Fieldref
      var classInfo = this.resolve(cp, constant.class_index, isStatic);
      var fieldName = cp[cp[constant.name_and_type_index].name_index].bytes;
      var signature = cp[cp[constant.name_and_type_index].signature_index].bytes;
      constant = CLASSES.getField(classInfo, (isStatic ? "S" : "I") + "." + fieldName + "." + signature);
      if (!constant) {
        throw new JavaException("java/lang/RuntimeException",
            classInfo.className + "." + fieldName + "." + signature + " not found");
      }
      break;
    case 10: // TAGS.CONSTANT_Methodref
    case 11: // TAGS.CONSTANT_InterfaceMethodref
      var classInfo = this.resolve(cp, constant.class_index, isStatic);
      var methodName = cp[cp[constant.name_and_type_index].name_index].bytes;
      var signature = cp[cp[constant.name_and_type_index].signature_index].bytes;
      constant = CLASSES.getMethod(classInfo, (isStatic ? "S" : "I") + "." + methodName + "." + signature);
      if (!constant) {
        throw new JavaException("java/lang/RuntimeException",
            classInfo.className + "." + methodName + "." + signature + " not found");
      }
      break;
    default:
      throw new Error("not support constant type");
  }
  return constant;
};

// Context.prototype.triggerBailout = function(e, methodInfoId, compiledDepth, cpi, locals, stack) {
//  // throw VM.Yield;
// };

// Context.prototype.JVMBailout = function(e, methodInfoId, compiledDepth, cpi, locals, stack) {
//     // var methodInfo = this.methodInfos[methodInfoId];
//     // var frame = new Frame(methodInfo, locals);
//     // frame.stack = stack;
//     // frame.ip = cpi;
//     // this.frames.unshift(frame);
//     // if (compiledDepth === 0 && this.frameSets.length) {
//     //   // Append all the current frames to the parent frame set, so a single frame stack
//     //   // exists when the bailout finishes.
//     //   var currentFrames = this.frames;
//     //   this.frames = this.frameSets.pop();
//     //   for (var i = 0; i < currentFrames.length; i++) {
//     //     this.frames.push(currentFrames[i]);
//     //   }
//     // }
// };

