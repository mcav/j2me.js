/* -*- Mode: Java; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/* vim: set shiftwidth=4 tabstop=4 autoindent cindent expandtab: */

'use strict';

Array.prototype.push2 = function(value) {
    this.push(value);
    this.push(null);
    return value;
}

Array.prototype.pop2 = function() {
    this.pop();
    return this.pop();
}

Array.prototype.pushType = function(signature, value) {
    if (signature === "J" || signature === "D") {
        this.push2(value);
        return;
    }
    this.push(value);
}

Array.prototype.popType = function(signature) {
    return (signature === "J" || signature === "D") ? this.pop2() : this.pop();
}

// A convenience function for retrieving values in reverse order
// from the end of the stack.  stack.read(1) returns the topmost item
// on the stack, while stack.read(2) returns the one underneath it.
Array.prototype.read = function(i) {
    return this[this.length - i];
};


var Frame = function(methodInfo, locals) {
    this.methodInfo = methodInfo;
    this.cp = methodInfo.classInfo.constant_pool;
    this.code = methodInfo.code;
    this.ip = 0;
    this.locals = locals;
    this.stack = [];
    this.lockObject = null;
    this.profileData = null;
    this.isInterpreted = (methodInfo.invoke === VM.invoke);
}

Frame.prototype.getLocal = function(idx) {
    return this.locals[idx];
}

Frame.prototype.setLocal = function(idx, value) {
    this.locals[idx] = value;
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
