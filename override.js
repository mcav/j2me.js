/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var Override = {};

function JavaException(className, message) {
  this.javaClassName = className;
  this.message = message;
}
JavaException.prototype = Object.create(Error.prototype);

/**
 * Given a function signature, parse the types of arguments and the
 * return value. Both arrays and objects are tagged as "L".
 */
function parseSignatureArguments(s) {
  var data = {
    args: [],
    returnType: null
  };
  var inArguments = true;
  function add(type) {
    if (inArguments) {
      data.args.push(type);
    } else {
      data.returnType = type;
    }
  }
  for (var i = s.indexOf("(") + 1; i < s.length; ) {
    if (s[i] === "L") {
      add(Stack.OBJECT);
      i = s.indexOf(";", i + 1) + 1;
    } else if (s[i] === "[") {
      while(s[i + 1] === "[") {
        i++; // handle nested arrays
      }
      add(Stack.OBJECT);
      if (s[i + 1] === "L") {
        i = s.indexOf(";", i + 2) + 1;
      } else {
        i += 2; // on [CI, move to [CI
      }         //    ^              ^
    } else if (s[i] === ")") {
      inArguments = false;
      i++;
    } else {
      add(Stack.stringToType(s[i]));
      i++;
    }
  }
  return data;
}


/**
 * A simple wrapper for overriding JVM functions to avoid logic errors
 * and simplify implementation:
 *
 * - Arguments are pushed off the stack based upon the signature of the
 *   function.
 *
 * - The return value is automatically pushed back onto the stack, if
 *   the method signature does not return void.
 *
 * - The object reference ("this") is automatically bound to `fn`.
 *
 * - JavaException instances are caught and propagated as Java
 *   exceptions; JS TypeError propagates as a NullPointerException.
 *
 * @param {object} object
 *   Native or Override.
 * @param {string} key
 *   The fully-qualified JVM method signature.
 * @param {function(args)} fn
 *   A function taking any number of args.
 */
function createAlternateImpl(object, key, fn) {
  var retType = key[key.length - 1];
  var sig = parseSignatureArguments(key);
  if (sig.args.length + 1 !== fn.length) {
    console.error("ERROR: AltImpl argument count mismatch. " +
                  "Check the signature: " + key);
  }
  object[key] = function(ctx, stack, isStatic) {
    var args = new Array(sig.args.length + 1);

    args[0] = ctx;

    for (var i = sig.args.length - 1; i >= 0; i--) {
      args[i + 1] = stack.pop(sig.args[i]);
    }

    function doReturn(ret) {
      if (typeof ret === "string") {
        ret = ctx.newString(ret);
      }
      if (sig.returnType !== Stack.VOID) {
        stack.push(sig.returnType, ret);
      }
    }

    try {
      var self = isStatic ? null : stack.pop(Stack.OBJECT);
      var ret = fn.apply(self, args);
      if (ret && ret.then) { // ret.constructor.name == "Promise"
        ret.then(function(res) {
          if (Instrument.profiling) {
            Instrument.exitAsyncNative(key);
          }

          doReturn(res);
        }, function(e) {
          ctx.raiseException(e.javaClassName, e.message);
        }).then(ctx.start.bind(ctx));

        if (Instrument.profiling) {
          Instrument.enterAsyncNative(key);
        }

        throw VM.Pause;
      } else {
        doReturn(ret);
      }
    } catch(e) {
      if (e === VM.Pause || e === VM.Yield) {
        throw e;
      } else if (e.name === "TypeError") {
        // JavaScript's TypeError is analogous to a NullPointerException.
        ctx.raiseExceptionAndYield("java/lang/NullPointerException", e);
      } else if (e.javaClassName) {
        ctx.raiseExceptionAndYield(e.javaClassName, e.message);
      } else {
        console.error(e, e.stack);
        ctx.raiseExceptionAndYield("java/lang/RuntimeException", e);
      }
    }
  };
}

Override.create = createAlternateImpl.bind(null, Override);

Override.create("com/ibm/oti/connection/file/Connection.decode.(Ljava/lang/String;)Ljava/lang/String;", function(ctx, string) {
  return decodeURIComponent(string.str);
});

Override.create("com/ibm/oti/connection/file/Connection.encode.(Ljava/lang/String;)Ljava/lang/String;", function(ctx, string) {
  return string.str.replace(/[^a-zA-Z0-9-_\.!~\*\\'()/:]/g, encodeURIComponent);
});

Override.create("java/lang/Math.min.(II)I", function(ctx, a, b) {
  return Math.min(a, b);
});

Override.create("java/io/ByteArrayOutputStream.write.([BII)V", function(ctx, b, off, len) {
  if ((off < 0) || (off > b.length) || (len < 0) ||
      ((off + len) > b.length)) {
    throw new JavaException("java/lang/IndexOutOfBoundsException");
  }

  if (len == 0) {
    return;
  }

  var count = this.class.getField("I.count.I").get(this);
  var buf = this.class.getField("I.buf.[B").get(this);

  var newcount = count + len;
  if (newcount > buf.length) {
    var newbuf = ctx.newPrimitiveArray("B", Math.max(buf.length << 1, newcount));
    newbuf.set(buf);
    buf = newbuf;
    this.class.getField("I.buf.[B").set(this, buf);
  }

  buf.set(b.subarray(off, off + len), count);
  this.class.getField("I.count.I").set(this, newcount);
});

Override.create("java/io/ByteArrayOutputStream.write.(I)V", function(ctx, value) {
  var count = this.class.getField("I.count.I").get(this);
  var buf = this.class.getField("I.buf.[B").get(this);

  var newcount = count + 1;
  if (newcount > buf.length) {
    var newbuf = ctx.newPrimitiveArray("B", Math.max(buf.length << 1, newcount));
    newbuf.set(buf);
    buf = newbuf;
    this.class.getField("I.buf.[B").set(this, buf);
  }

  buf[count] = value;
  this.class.getField("I.count.I").set(this, newcount);
});

Override.create("java/io/ByteArrayInputStream.<init>.([B)V", function(ctx, buf) {
  if (!buf) {
    throw new JavaException("java/lang/NullPointerException");
  }

  this.buf = buf;
  this.pos = this.mark = 0;
  this.count = buf.length;
});

Override.create("java/io/ByteArrayInputStream.<init>.([BII)V", function(ctx, buf, offset, length) {
  if (!buf) {
    throw new JavaException("java/lang/NullPointerException");
  }

  this.buf = buf;
  this.pos = this.mark = offset;
  this.count = (offset + length <= buf.length) ? (offset + length) : buf.length;
});

Override.create("java/io/ByteArrayInputStream.read.()I", function(ctx) {
  return (this.pos < this.count) ? (this.buf[this.pos++] & 0xFF) : -1;
});

Override.create("java/io/ByteArrayInputStream.read.([BII)I", function(ctx, b, off, len) {
  if (!b) {
    throw new JavaException("java/lang/NullPointerException");
  }

  if ((off < 0) || (off > b.length) || (len < 0) ||
      ((off + len) > b.length)) {
    throw new JavaException("java/lang/IndexOutOfBoundsException");
  }

  if (this.pos >= this.count) {
    return -1;
  }
  if (this.pos + len > this.count) {
    len = this.count - this.pos;
  }
  if (len === 0) {
    return 0;
  }

  b.set(this.buf.subarray(this.pos, this.pos + len), off);

  this.pos += len;
  return len;
});

Override.create("java/io/ByteArrayInputStream.skip.(J)J", function(ctx, long) {
  var n = long.toNumber();

  if (this.pos + n > this.count) {
    n = this.count - this.pos;
  }

  if (n < 0) {
    return Long.fromNumber(0);
  }

  this.pos += n;

  return Long.fromNumber(n);
});

Override.create("java/io/ByteArrayInputStream.available.()I", function(ctx) {
  return this.count - this.pos;
});

Override.create("java/io/ByteArrayInputStream.mark.(I)V", function(ctx, readAheadLimit) {
  this.mark = this.pos;
});

Override.create("java/io/ByteArrayInputStream.reset.()V", function(ctx) {
  this.pos = this.mark;
});

// The following Permissions methods are overriden to avoid expensive calls to
// DomainPolicy.loadValues. This has the added benefit that we avoid many other
// computations.

Override.create("com/sun/midp/security/Permissions.forDomain.(Ljava/lang/String;)[[B", function(ctx, name) {
  // NUMBER_OF_PERMISSIONS = PermissionsStrings.PERMISSION_STRINGS.length + 2
  // The 2 is the two hardcoded MIPS and AMS permissions.
  var NUMBER_OF_PERMISSIONS = 61;
  var ALLOW = 1;

  var maximums = ctx.newPrimitiveArray("B", NUMBER_OF_PERMISSIONS);
  var defaults = ctx.newPrimitiveArray("B", NUMBER_OF_PERMISSIONS);

  for (var i = 0; i < NUMBER_OF_PERMISSIONS; i++) {
    maximums[i] = defaults[i] = ALLOW;
  }

  var permissions = ctx.newArray("[[B", 2);
  permissions[0] = maximums;
  permissions[1] = defaults;

  return permissions;
});

// Always return true to make Java think the MIDlet domain is trusted.
Override.create("com/sun/midp/security/Permissions.isTrusted.(Ljava/lang/String;)Z", function(ctx, name) {
  return true;
});

// Returns the ID of the permission. The callers will use this ID to check the
// permission in the permissions array returned by Permissions::forDomain.
Override.create("com/sun/midp/security/Permissions.getId.(Ljava/lang/String;)I", function(ctx, name) {
  return 0;
});

// The Java code that uses this method doesn't actually use the return value, but
// passes it to Permissions.getId. So we can return anything.
Override.create("com/sun/midp/security/Permissions.getName.(I)Ljava/lang/String;", function(ctx, id) {
  return "com.sun.midp";
});
