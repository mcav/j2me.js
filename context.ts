module J2ME {
  declare var VM;
  declare var Instrument;
  declare var setZeroTimeout;
  declare var Long;
  declare var JavaException;

  export class Frame {
    methodInfo: MethodInfo;
    locals: any [];
    stack: any [];
    code: Uint8Array;
    bci: number;
    cp: any;
    localsBase: number;
    lockObject: java.lang.Object;
    profileData: any;

    constructor(methodInfo: MethodInfo, locals: any [], localsBase: number) {
      this.methodInfo = methodInfo;
      this.cp = methodInfo.classInfo.constant_pool;
      this.code = methodInfo.code;
      this.bci = 0;
      this.stack = [];
      this.locals = locals;
      this.localsBase = localsBase;
      this.lockObject = null;
      this.profileData = null;
    }

    getLocal(i: number): any {
      return this.locals[this.localsBase + i];
    }

    setLocal(i: number, value: any) {
      this.locals[this.localsBase + i] = value;
    }

    read8(): number {
      return this.code[this.bci++];
    }

    read16(): number {
      return this.read8() << 8 | this.read8();
    }

    read32(): number {
      return this.read16() << 16 | this.read16();
    }

    read8signed(): number {
      var x = this.read8();
      return (x > 0x7f) ? (x - 0x100) : x;
    }

    read16signed(): number {
      var x = this.read16();
      return (x > 0x7fff) ? (x - 0x10000) : x;
    }

    read32signed(): number {
      var x = this.read32();
      return (x > 0x7fffffff) ? (x - 0x100000000) : x;
    }

  }

  export class Context {
    frames: any [];
    frameSets: any [];
    lockTimeout: number;
    lockLevel: number;
    thread: java.lang.Thread;

    constructor(public runtime: Runtime) {
      this.frames = [];
      this.frameSets = [];
      this.runtime = runtime;
      this.runtime.addContext(this);
    }

    kill() {
      this.runtime.removeContext(this);
    }

    current() {
      var frames = this.frames;
      return frames[frames.length - 1];
    }

    popFrame() {
      var callee = this.frames.pop();
      if (this.frames.length === 0) {
        return null;
      }
      var caller = this.current();
      Instrument.callExitHooks(callee.methodInfo, caller, callee);
      return caller;
    }

    executeNewFrameSet(frames) {
      this.frameSets.push(this.frames);
      this.frames = frames;
      try {
        var returnValue = VM.execute(this);
      } catch (e) {
        // Append all the current frames to the parent frame set, so a single frame stack
        // exists when the bailout finishes.
        var currentFrames = this.frames;
        this.frames = this.frameSets.pop();
        for (var i = 0; i < currentFrames.length; i++) {
          this.frames.push(currentFrames[i]);
        }
        throwHelper(e);
      }
      this.frames = this.frameSets.pop();
      return returnValue;
    }

    getClassInitFrame(classInfo: ClassInfo) {
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
            {tag: TAGS.CONSTANT_Methodref, class_index: 2, name_and_type_index: 4},
            {tag: TAGS.CONSTANT_Class, name_index: 3},
            {bytes: "java/lang/Class"},
            {name_index: 5, signature_index: 6},
            {bytes: "invoke_clinit"},
            {bytes: "()V"},
            {tag: TAGS.CONSTANT_Methodref, class_index: 2, name_and_type_index: 8},
            {name_index: 9, signature_index: 10},
            {bytes: "init9"},
            {bytes: "()V"},
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
      return new Frame(syntheticMethod, [classInfo.getClassInitLockObject(this)], 0);
    }

    pushClassInitFrame(classInfo: ClassInfo) {
      if (this.runtime.initialized[classInfo.className])
        return;
      var classInitFrame = this.getClassInitFrame(classInfo);
      this.executeNewFrameSet([classInitFrame]);
    }

    raiseException(className, message) {
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
            {tag: TAGS.CONSTANT_Class, name_index: 2},
            {bytes: className},
            {tag: TAGS.CONSTANT_String, string_index: 4},
            {bytes: message},
            {tag: TAGS.CONSTANT_Methodref, class_index: 1, name_and_type_index: 6},
            {name_index: 7, signature_index: 8},
            {bytes: "<init>"},
            {bytes: "(Ljava/lang/String;)V"},
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
      //  pushFrame() is not used since the invoker may be a compiled frame.
      var callee = new Frame(syntheticMethod, [], 0);
      this.frames.push(callee);
    }

    raiseExceptionAndYield(className, message?) {
      this.raiseException(className, message);
      throw VM.Yield;
    }

      setCurrent() {
          if (typeof $ !== "undefined" && $.ctx.thread && this.thread) {
       var old = String.fromCharCode.apply(null, (<any>$.ctx.thread).$java_lang_Threadname);
       var news = String.fromCharCode.apply(null, (<any>this.thread).$java_lang_Threadname);
        console.log("CONTEXT SWITCH", old, "=>", news);
          }
      $ = this.runtime;
      $.ctx = this;
      console.log("CONTEXT START ( from", old, ")");
    }

    execute() {
      Instrument.callResumeHooks(this.current());
      this.setCurrent();
      do {
        try {
          VM.execute(this);
        } catch (e) {
          switch (e) {
            case VM.Yield:
              // Ignore the yield and continue executing instructions on this thread.
              break;
            case VM.Pause:
              Instrument.callPauseHooks(this.current());
              return;
            default:
              throwHelper(e);
          }
        }
      } while (this.frames.length !== 0);

      J2ME.Debug.assert($.ctx === this, "ctx should maybe be the same as $.ctx");
    }

    start() {
        var ctx = this;
      this.setCurrent();
      console.log("RESUME");
      Instrument.callResumeHooks(ctx.current());
      try {
        VM.execute(ctx);
      } catch (e) {
        switch (e) {
          case VM.Yield:
            break;
          case VM.Pause:
            Instrument.callPauseHooks(ctx.current());
            return;
          default:
            console.info(e);
            throw e;
        }
      }
      Instrument.callPauseHooks(ctx.current());

      J2ME.Debug.assert($.ctx === ctx, "ctx should maybe be the same as $.ctx");

      if (ctx.frames.length === 0) {
        ctx.kill();
        return;
      }

      ctx.resume();
    }

    resume() {
      (<any>window).setZeroTimeout(this.start.bind(this));
    }

    block(obj, queue, lockLevel) {
      if (!obj[queue])
        obj[queue] = [];
      obj[queue].push(this);
      this.lockLevel = lockLevel;
      throw VM.Pause;
    }

    unblock(obj, queue, notifyAll, callback) {
      while (obj[queue] && obj[queue].length) {
        var ctx = obj[queue].pop();
        if (!ctx)
          continue;
        callback(ctx);
        if (!notifyAll)
          break;
      }
    }

    wakeup(obj) {
      if (this.lockTimeout !== null) {
        window.clearTimeout(this.lockTimeout);
        this.lockTimeout = null;
      }
      if (obj.__lock__) {
        if (!obj.ready)
          obj.ready = [];
        obj.ready.push(this);
      } else {
        while (this.lockLevel-- > 0)
          this.monitorEnter(obj);
        this.resume();
      }
    }

    monitorEnter(obj: java.lang.Object) {
      var lock = obj.__lock__;
      if (!lock) {
        obj.__lock__ = new Lock(this.thread, 1);
        return;
      }
      if (lock.thread === this.thread) {
        ++lock.level;
        return;
      }
      this.block(obj, "ready", 1);
    }

    monitorExit(obj) {
      var lock = obj.__lock__;
      if (lock.thread !== this.thread)
        this.raiseExceptionAndYield("java/lang/IllegalMonitorStateException");
      if (--lock.level > 0) {
        return;
      }
      obj.__lock__ = null;
      this.unblock(obj, "ready", false, function (ctx) {
        ctx.wakeup(obj);
      });
    }

    wait(obj, timeout) {
      var lock = obj.__lock__;
      if (timeout < 0)
        this.raiseExceptionAndYield("java/lang/IllegalArgumentException");
      if (!lock || lock.thread !== this.thread)
        this.raiseExceptionAndYield("java/lang/IllegalMonitorStateException");
      var lockLevel = lock.level;
      while (lock.level > 0)
        this.monitorExit(obj);
      if (timeout) {
        var self = this;
        this.lockTimeout = window.setTimeout(function () {
          obj.waiting.forEach(function (ctx, n) {
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

    notify(obj, notifyAll) {
      if (!obj.__lock__ || obj.__lock__.thread !== this.thread)
        this.raiseExceptionAndYield("java/lang/IllegalMonitorStateException");
      this.unblock(obj, "waiting", notifyAll, function (ctx) {
        ctx.wakeup(obj);
      });
    }

    resolve(cp, idx: number, isStatic: boolean) {
      var constant = cp[idx];
      if (!constant.tag)
        return constant;
      switch (constant.tag) {
        case 3: // TAGS.CONSTANT_Integer
          constant = constant.integer;
          break;
        case 4: // TAGS.CONSTANT_Float
          constant = constant.float;
          break;
        case 8: // TAGS.CONSTANT_String
          constant = this.runtime.newStringConstant(cp[constant.string_index].bytes);
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
    }
  }
}

var Context = J2ME.Context;
var Frame = J2ME.Frame;