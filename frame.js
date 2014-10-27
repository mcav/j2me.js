/* -*- Mode: Java; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/* vim: set shiftwidth=4 tabstop=4 autoindent cindent expandtab: */

'use strict';

var Frame = function(methodInfo, locals) {
    this.pointer = Module.ccall("new_frame", "number", ["number"],
                                [methodInfo.pointer]);
    this.methodInfo = methodInfo;
    this.cp = methodInfo.classInfo.constant_pool;

    this.lockObject = null;
    this.profileData = null;
}

Frame.prototype.ensureLocked = function() {
  if (!this.lockObject) {
    this.lockObject =
      (this.methodInfo.isStatic ?
       this.methodInfo.classInfo.getClassObject(this) :
       this.getLocalRef(0));
  }
  return this.lockObject;
}

Frame.prototype.getLocalRef = function(idx) {
  var refId = Module.ccall("frame_get_local_ref", "number", ["number", "number"],
                           [this.pointer, idx]);
  return this.refMap[refId];
};

Frame.prototype.getLocal = function(type, idx) {
    return this.stack.get(type, this.localsBase + (idx << 4));
}

Frame.prototype.setLocal = function(idx, type, value) {
    this.stack.set(this.localsBase + (idx << 4), type, value);
}

Frame.prototype.read8 = function() {
    return this.code[this.ip++];
};

Frame.prototype.read16 = function() {
    return this.read8()<<8 | this.read8();
};

Frame.prototype.read32 = function() {
    return this.read16()<<16 | this.read16();
};

Frame.prototype.read8signed = function() {
    var x = this.read8();
    return (x > 0x7f) ? (x - 0x100) : x;
}

Frame.prototype.read16signed = function() {
    var x = this.read16();
    return (x > 0x7fff) ? (x - 0x10000) : x;
}

Frame.prototype.read32signed = function() {
    var x = this.read32();
    return (x > 0x7fffffff) ? (x - 0x100000000) : x;
}
