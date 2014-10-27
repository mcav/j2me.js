/* -*- Mode: Java; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/* vim: set shiftwidth=4 tabstop=4 autoindent cindent expandtab: */
/*global Stack, util, CLASSES, OPCODES, Long */

'use strict';

var VM = {};

VM.Yield = {};
VM.Pause = {};

VM.DEBUG = false;
VM.DEBUG_PRINT_ALL_EXCEPTIONS = false;

VM.traceLog = "";
VM.trace = function(type, pid, methodInfo, returnVal) {
    VM.traceLog += type + " " + pid + " " + methodInfo.classInfo.className + "." +
                   methodInfo.name + ":" + methodInfo.signature +
                   (returnVal ? (" " + returnVal) : "") + "\n";
}

function buildExceptionLog(ex, stackTrace) {
  var className = ex.class.className;
  var detailMessage = util.fromJavaString(CLASSES.getField(ex.class, "I.detailMessage.Ljava/lang/String;").get(ex));
  return className + ": " + (detailMessage || "") + "\n" + stackTrace.join("\n") + "\n\n";
}

function throw_(ex, ctx) {
  var exClass = ex.class;

  var stackTrace = [];

  do {
    var frame = ctx.current();
    var stack = frame.stack;
    var cp = frame.cp;
    var exception_table = frame.methodInfo.exception_table;
    var handler_pc = null;
    for (var i=0; exception_table && i<exception_table.length; i++) {
      if (frame.ip >= exception_table[i].start_pc && frame.ip <= exception_table[i].end_pc) {
        if (exception_table[i].catch_type === 0) {
          handler_pc = exception_table[i].handler_pc;
        } else {
          var classInfo = cp.resolve(ctx, exception_table[i].catch_type).value;
          if (ex.class.isAssignableTo(classInfo)) {
            handler_pc = exception_table[i].handler_pc;
            break;
          }
        }
      }
    }

    var classInfo = frame.methodInfo.classInfo;
    if (classInfo && classInfo.className) {
      stackTrace.push(" - " + classInfo.className + "." + frame.methodInfo.name + "(), bci=" + frame.ip);
    }

    if (handler_pc != null) {
      stack.size = frame.localsEnd;
      stack.push(Stack.OBJECT, ex);
      frame.ip = handler_pc;

      if (VM.DEBUG_PRINT_ALL_EXCEPTIONS) {
        console.error(buildExceptionLog(ex, stackTrace));
      }

      return;
    }
    ctx.popFrame(0);
  } while (frame.methodInfo);
  ctx.kill();
  throw new Error(buildExceptionLog(ex, stackTrace));
}

function checkArrayAccess(ctx, refArray, idx) {
  if (!refArray) {
    ctx.raiseExceptionAndYield("java/lang/NullPointerException");
  }
  if (idx < 0 || idx >= refArray.length) {
    ctx.raiseExceptionAndYield("java/lang/ArrayIndexOutOfBoundsException", idx);
  }
}

function classInitCheck(ctx, classInfo, ip) {
  if (classInfo.isArrayClass || ctx.runtime.initialized[classInfo.className])
    return;
  var frame = ctx.current();
  frame.ip = ip;
  ctx.pushClassInitFrame(classInfo);
  throw VM.Yield;
}

VM.execute = function(ctx) {
  var frame = ctx.current();
  frame.stack.execute(ctx, frame);
}

VM.executeOp = function(ctx, op) {
  var frame = ctx.current();
  var cp = frame.cp;
  var stack = frame.stack;

//        console.warn("OP", OPCODES[op], frame.methodInfo.implKey, frame.ip - 1);
//        frame.printLocals();
        // console.trace(ctx.thread.pid, frame.methodInfo.classInfo.className + " " + frame.methodInfo.name + " " + (frame.ip - 1) + " " + OPCODES[op] + " " + stack.join(","));
      switch (op) {
      case 0x12: // ldc
        var constant = cp.resolve(ctx, frame.read8());
        stack.push(constant.type, constant.value);
        break;
      case 0x13: // ldc_w
      case 0x14: // ldc2_w
        var constant = cp.resolve(ctx, frame.read16());
        stack.push(constant.type, constant.value);
        break;
      case 0x2e: // iaload
        var idx = stack.pop(Stack.INT);
        var refArray = stack.pop(Stack.OBJECT);
        checkArrayAccess(ctx, refArray, idx);
        stack.push(Stack.INT, refArray[idx]);
        break;
      case 0x30: // faload
        var idx = stack.pop(Stack.INT);
        var refArray = stack.pop(Stack.OBJECT);
        checkArrayAccess(ctx, refArray, idx);
        stack.push(Stack.FLOAT, refArray[idx]);
        break;
      case 0x32: // aaload
        var idx = stack.pop(Stack.INT);
        var refArray = stack.pop(Stack.OBJECT);
        checkArrayAccess(ctx, refArray, idx);
        stack.push(Stack.OBJECT, refArray[idx]);
        break;
      case 0x33: // baload
        var idx = stack.pop(Stack.INT);
        var refArray = stack.pop(Stack.OBJECT);
        checkArrayAccess(ctx, refArray, idx);
        stack.push(Stack.BYTE, refArray[idx]);
        break;
      case 0x34: // caload
        var idx = stack.pop(Stack.INT);
        var refArray = stack.pop(Stack.OBJECT);
        checkArrayAccess(ctx, refArray, idx);
        stack.push(Stack.CHAR, refArray[idx]);
        break;
      case 0x35: // saload
        var idx = stack.pop(Stack.INT);
        var refArray = stack.pop(Stack.OBJECT);
        checkArrayAccess(ctx, refArray, idx);
        stack.push(Stack.SHORT, refArray[idx]);
        break;
      case 0x2f: // laload
        var idx = stack.pop(Stack.INT);
        var refArray = stack.pop(Stack.OBJECT);
        checkArrayAccess(ctx, refArray, idx);
        stack.push(Stack.LONG, refArray[idx]);
        break;
      case 0x31: // daload
        var idx = stack.pop(Stack.INT);
        var refArray = stack.pop(Stack.OBJECT);
        checkArrayAccess(ctx, refArray, idx);
        stack.push(Stack.DOUBLE, refArray[idx]);
        break;
      case 0x4f: // iastore
        var val = stack.pop(Stack.INT);
        var idx = stack.pop(Stack.INT);
        var refArray = stack.pop(Stack.OBJECT);
        checkArrayAccess(ctx, refArray, idx);
        refArray[idx] = val;
        break;
      case 0x51: // fastore
        var val = stack.pop(Stack.FLOAT);
        var idx = stack.pop(Stack.INT);
        var refArray = stack.pop(Stack.OBJECT);
        checkArrayAccess(ctx, refArray, idx);
        refArray[idx] = val;
        break;
      case 0x54: // bastore
        var val = stack.pop(Stack.BYTE);
        var idx = stack.pop(Stack.INT);
        var refArray = stack.pop(Stack.OBJECT);
        checkArrayAccess(ctx, refArray, idx);
        refArray[idx] = val;
        break;
      case 0x55: // castore
        var val = stack.pop(Stack.CHAR);
        var idx = stack.pop(Stack.INT);
        var refArray = stack.pop(Stack.OBJECT);
        checkArrayAccess(ctx, refArray, idx);
        refArray[idx] = val;
        break;
      case 0x56: // sastore
        var val = stack.pop(Stack.SHORT);
        var idx = stack.pop(Stack.INT);
        var refArray = stack.pop(Stack.OBJECT);
        checkArrayAccess(ctx, refArray, idx);
        refArray[idx] = val;
        break;
      case 0x50: // lastore
        var val = stack.pop(Stack.LONG);
        var idx = stack.pop(Stack.INT);
        var refArray = stack.pop(Stack.OBJECT);
        checkArrayAccess(ctx, refArray, idx);
        refArray[idx] = val;
        break;
      case 0x52: // dastore
        var val = stack.pop(Stack.DOUBLE);
        var idx = stack.pop(Stack.INT);
        var refArray = stack.pop(Stack.OBJECT);
        checkArrayAccess(ctx, refArray, idx);
        refArray[idx] = val;
        break;
      case 0x53: // aastore
        var val = stack.pop(Stack.OBJECT);
        var idx = stack.pop(Stack.INT);
        var refArray = stack.pop(Stack.OBJECT);
        checkArrayAccess(ctx, refArray, idx);
        if (val && !val.class.isAssignableTo(refArray.class.elementClass)) {
          ctx.raiseExceptionAndYield("java/lang/ArrayStoreException");
        }
        refArray[idx] = val;
        break;
      case 0xbc: // newarray
        var type = frame.read8();
        var size = stack.pop(Stack.INT);
        if (size < 0) {
          ctx.raiseExceptionAndYield("java/lang/NegativeArraySizeException", size);
        }
        stack.push(Stack.OBJECT, ctx.newPrimitiveArray("????ZCFDBSIJ"[type], size));
        break;
      case 0xbd: // anewarray
        var idx = frame.read16();
        var classInfo = cp.resolve(ctx, idx).value;
        var size = stack.pop(Stack.INT);
        if (size < 0) {
          ctx.raiseExceptionAndYield("java/lang/NegativeArraySizeException", size);
        }
        var className = classInfo.className;
        if (className[0] !== "[")
          className = "L" + className + ";";
        className = "[" + className;
        stack.push(Stack.OBJECT, ctx.newArray(className, size));
        break;
      case 0xc5: // multianewarray
        var idx = frame.read16();
        var classInfo = cp.resolve(ctx, idx).value;
        var dimensions = frame.read8();
        var lengths = new Array(dimensions);
        for (var i=0; i<dimensions; i++)
          lengths[i] = stack.pop(Stack.INT);
        stack.push(Stack.OBJECT, ctx.newMultiArray(classInfo.className, lengths.reverse()));
        break;
      case 0xbe: // arraylength
        var obj = stack.pop(Stack.OBJECT);
        if (!obj) {
          ctx.raiseExceptionAndYield("java/lang/NullPointerException");
        }
        stack.push(Stack.INT, obj.length);
        break;
      case 0xb4: // getfield
        var idx = frame.read16();
        var field = cp.resolve(ctx, idx, false).value;
        var obj = stack.pop(Stack.OBJECT);
        if (!obj) {
          ctx.raiseExceptionAndYield("java/lang/NullPointerException");
        }
        stack.push(Stack.stringToType(field.signature), field.get(obj));
        break;
      case 0xb5: // putfield
        var idx = frame.read16();
        var field = cp.resolve(ctx, idx, false).value;
        var val = stack.pop(Stack.stringToType(field.signature));
        var obj = stack.pop(Stack.OBJECT);
        if (!obj) {
          ctx.raiseExceptionAndYield("java/lang/NullPointerException");
        }
        field.set(obj, val);
        break;
      case 0xb2: // getstatic
        var idx = frame.read16();
        var field = cp.resolve(ctx, idx, true).value;
        classInitCheck(ctx, field.classInfo, frame.ip-3);
        var value = ctx.runtime.getStatic(field);
        if (typeof value === "undefined") {
          value = util.defaultValue(field.signature);
        }
        stack.push(Stack.stringToType(field.signature), value);
        break;
      case 0xb3: // putstatic
        var idx = frame.read16();
        var field = cp.resolve(ctx, idx, true).value;
        classInitCheck(ctx, field.classInfo, frame.ip-3);
        ctx.runtime.setStatic(field, stack.pop(Stack.stringToType(field.signature)));
        break;
      case 0xbb: // new
        var idx = frame.read16();
        var classInfo = cp.resolve(ctx, idx).value;
        classInitCheck(ctx, classInfo, frame.ip-3);
        stack.push(Stack.OBJECT, ctx.newObject(classInfo));
        break;
      case 0xc0: // checkcast
        var idx = frame.read16();
        var classInfo = cp.resolve(ctx, idx).value;
        var obj = stack.read(Stack.OBJECT, 1);
        if (obj && !obj.class.isAssignableTo(classInfo)) {
          ctx.raiseExceptionAndYield("java/lang/ClassCastException",
                                     obj.class.className + " is not assignable to " +
                                     classInfo.className);
        }
        break;
      case 0xc1: // instanceof
        var idx = frame.read16();
        var classInfo = cp.resolve(ctx, idx).value;
        var obj = stack.pop(Stack.OBJECT);
        var result = !obj ? false : obj.class.isAssignableTo(classInfo);
        stack.push(Stack.INT, result ? 1 : 0);
        break;
      case 0xbf: // athrow
        var obj = stack.pop(Stack.OBJECT);
        if (!obj) {
          ctx.raiseExceptionAndYield("java/lang/NullPointerException");
        }
        throw_(obj, ctx);
        break;
      case 0xc2: // monitorenter
        var obj = stack.pop(Stack.OBJECT);
        if (!obj) {
          ctx.raiseExceptionAndYield("java/lang/NullPointerException");
        }
        ctx.monitorEnter(obj);
        break;
      case 0xc3: // monitorexit
        var obj = stack.pop(Stack.OBJECT);
        if (!obj) {
          ctx.raiseExceptionAndYield("java/lang/NullPointerException");
        }
        ctx.monitorExit(obj);
        break;
      case 0xb6: // invokevirtual
      case 0xb7: // invokespecial
      case 0xb8: // invokestatic
      case 0xb9: // invokeinterface
        var startip = frame.ip - 1;
        var idx = frame.read16();
        if (op === 0xb9) {
          var argsNumber = frame.read8();
          var zero = frame.read8();
        }
        var isStatic = (op === 0xb8);
        var methodInfoConstant = cp.resolve(ctx, idx, isStatic);
        var methodInfo = methodInfoConstant.value;
        if (isStatic && !methodInfoConstant.processed) {
          methodInfoConstant.processed = true;
          classInitCheck(ctx, methodInfo.classInfo, startip);
        }
        if (!isStatic) {
          var obj = stack.read(Stack.OBJECT, methodInfo.consumes);
          if (!obj) {
            ctx.raiseExceptionAndYield("java/lang/NullPointerException");
          }
          switch (op) {
          case OPCODES.invokevirtual:
          case OPCODES.invokeinterface:
            if (methodInfo.classInfo != obj.class) {
              // Check if the method is already in the virtual method cache
              if (obj.class.vmc[methodInfo.key]) {
                methodInfo = obj.class.vmc[methodInfo.key];
              } else {
                methodInfo = CLASSES.getMethod(obj.class, methodInfo.key);
              }
            }
            break;
          }
        }

        if (VM.DEBUG) {
          VM.trace("invoke", ctx.thread.pid, methodInfo);
        }

        //            console.log("INVOKE", methodInfo.implKey, !!methodInfo.alternateImpl, methodInfo.consumes, methodInfo.max_locals);

        var alternateImpl = methodInfo.alternateImpl;
        if (alternateImpl) {
          Instrument.callPauseHooks(ctx.current());
          Instrument.measure(alternateImpl, ctx, methodInfo);
          Instrument.callResumeHooks(ctx.current());
          break;
        }
        ctx.maybeLockFrame(ctx.pushFrame(methodInfo), methodInfo);
        break;
      case 0xb1: // return
        if (VM.DEBUG) {
          VM.trace("return", ctx.thread.pid, frame.methodInfo);
        }
        if (ctx.frames.length == 1)
          return true;
        ctx.popFrame(0);
        break;
      case 0xac: // ireturn
      case 0xae: // freturn
      case 0xb0: // areturn
        if (VM.DEBUG) {
          VM.trace("return", ctx.thread.pid, frame.methodInfo);
        }
        if (ctx.frames.length == 1)
          return true;
        ctx.popFrame(1);
        break;
      case 0xad: // lreturn
      case 0xaf: // dreturn
        if (VM.DEBUG) {
          VM.trace("return", ctx.thread.pid, frame.methodInfo);
        }
        if (ctx.frames.length == 1)
          return true;
        ctx.popFrame(2);
        break;
      }
}

