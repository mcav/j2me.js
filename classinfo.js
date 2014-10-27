/* -*- Mode: Java; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/* vim: set shiftwidth=4 tabstop=4 autoindent cindent expandtab: */

'use strict';

var FieldInfo = (function() {
    var idgen = 0;
    return function(classInfo, access_flags, name, signature) {
        this.classInfo = classInfo;
        this.access_flags = access_flags;
        this.name = name;
        this.signature = signature;
        this.id = idgen++;
    }
})();

FieldInfo.prototype.get = function(obj) {
    var value = obj[this.id];
    if (typeof value === "undefined") {
        value = util.defaultValue(this.signature);
    }
    return value;
}

FieldInfo.prototype.set = function(obj, value) {
    obj[this.id] = value;
}

FieldInfo.prototype.toString = function() {
    return "[field " + this.name + "]";
}

function missingNativeImpl(key, ctx, stack) {
    console.error("Attempted to invoke missing native:", key);
}

/**
 * Required params:
 *   - name
 *   - signature
 *   - classInfo
 *
 * Optional params:
 *   - attributes (defaults to [])
 *   - code (if not provided, pulls from attributes)
 *   - isNative, isPublic, isStatic, isSynchronized
 */

function MethodInfo(opts) {
    this.name = opts.name;
    this.signature = opts.signature;
    this.classInfo = opts.classInfo;
    this.attributes = opts.attributes || [];

    this.isNative = opts.isNative;
    this.isPublic = opts.isPublic;
    this.isStatic = opts.isStatic;
    this.isSynchronized = opts.isSynchronized;
    this.key = (this.isStatic ? "S." : "I.") + this.name + "." + this.signature;
    this.implKey = this.classInfo.className + "." + this.name + "." + this.signature;
  
    this.consumes = Signature.getINSlots(this.signature);
    if (!this.isStatic) {
      this.consumes++;
    }
    // Use code if provided, otherwise search for the code within attributes.
    if (opts.code) {
        this.code = opts.code;
        this.exception_table = [];
        this.max_locals = this.consumes;
    } else {
        for (var i = 0; i < this.attributes.length; i++) {
            var a = this.attributes[i];
            if (a.info.type === ATTRIBUTE_TYPES.Code) {
                this.code = new Uint8Array(a.info.code);
                this.exception_table = a.info.exception_table;
                this.max_locals = a.info.max_locals;
                break;
            }
        }
    }

    // Load the code into the asm VM.
    // TODO: reduce allocations
    if (this.code) {
      var codePointer = Module._malloc(this.code.length * this.code.BYTES_PER_ELEMENT);
      Module.HEAPU8.set(this.code, codePointer);
      this.pointer =
        Module.ccall('context_define_method', 'number', ['number', 'number'],
                     [this.max_locals, codePointer]);
      //Module._free(pointer);      
    }

    if (this.isNative) {
        if (this.implKey in Native) {
            this.alternateImpl = Native[this.implKey];
        } else {
            // Some Native MethodInfos are constructed but never called;
            // that's fine, unless we actually try to call them.
            this.alternateImpl = missingNativeImpl.bind(null, this.implKey);
        }
    } else if (this.implKey in Override) {
        this.alternateImpl = Override[this.implKey];
    } else {
        this.alternateImpl = null;
    }
}

var ClassInfo = function(classBytes) {
  // Copy the classBytes into the heap, and construct a native class_info struct:
  var nativeBytesPointer = Module._malloc(classBytes.length);
  Module.HEAPU8.set(classBytes, nativeBytesPointer);
  this.pointer = Module.ccall("load_class_bytes", "number", ["number"], [nativeBytesPointer]);
  Module._free(nativeBytesPointer);

  this.className = Module.UTF16ToString(Module.ccall("class_info_get_class_name", "number", ["number"], [this.pointer]));

  var superClassNamePointer = Module.ccall("class_info_get_super_class_name", "number", ["number"], [this.pointer]);
  this.superClassName = (superClassNamePointer ? Module.UTF16ToString(superClassNamePointer) : null);

  this.access_flags = Module.ccall("class_info_get_access_flags", "number", ["number"], [this.pointer]);

  this.constructor = function () {
  }
  this.constructor.prototype.class = this;
  this.constructor.prototype.toString = function() {
    return "[instance " + this.class.className + "]";
  }

  // Cache for virtual methods and fields
  this.vmc = {};
  this.vfc = {};

  var self = this;

  this.interfaces = [];

  var numInterfaces = Module.ccall("class_info_get_interfaces_count", "number", ["number"], [this.pointer]);
  for (var i = 0; i < numInterfaces; i++) {
    var name = Module.UTF16ToString(Module.ccall("class_info_get_interface_name", "number", ["number", "number"],
                                                 [this.pointer, i]));
    var interface = CLASSES.loadClass(name);
    self.interfaces.push(interface);
    self.interfaces = self.interfaces.concat(interface.interfaces);
  };

    // this.fields = [];
    // classImage.fields.forEach(function(f) {
    //     var field = new FieldInfo(self, f.access_flags, cp.getRaw(f.name_index).bytes, cp.getRaw(f.descriptor_index).bytes);
    //     f.attributes.forEach(function(attribute) {
    //         if (cp.getRaw(attribute.attribute_name_index).bytes === "ConstantValue")
    //             field.constantValue = new DataView(attribute.info).getUint16(0, false);
    //     });
    //     self.fields.push(field);
    // });

    // this.methods = [];
    // classImage.methods.forEach(function(m) {
    //     self.methods.push(new MethodInfo({
    //         name: cp.getRaw(m.name_index).bytes,
    //         signature: cp.getRaw(m.signature_index).bytes,
    //         classInfo: self,
    //         attributes: m.attributes,
    //         isNative: ACCESS_FLAGS.isNative(m.access_flags),
    //         isPublic: ACCESS_FLAGS.isPublic(m.access_flags),
    //         isStatic: ACCESS_FLAGS.isStatic(m.access_flags),
    //         isSynchronized: ACCESS_FLAGS.isSynchronized(m.access_flags)
    //     }));
    // });

  this.classes = [];
  var numRelatedClasses = Module.ccall("class_info_get_related_class_count", "number", ["number"], [this.pointer]);
  for (var i = 0; i < numRelatedClasses; i++) {
    var name = Module.UTF16ToString(Module.ccall("class_info_get_related_class_name", "number", ["number", "number"],
                                                 [this.pointer, i]));
    this.classes.push(name);
  }
}

ClassInfo.prototype.implementsInterface = function(iface) {
    var classInfo = this;
    do {
        var interfaces = classInfo.interfaces;
        for (var n = 0; n < interfaces.length; ++n) {
            if (interfaces[n] === iface)
                return true;
        }
        classInfo = classInfo.superClass;
    } while (classInfo);
    return false;
}

ClassInfo.prototype.isAssignableTo = function(toClass) {
    if (this === toClass || toClass === ClassInfo.java_lang_Object)
        return true;
    if (ACCESS_FLAGS.isInterface(toClass.access_flags) && this.implementsInterface(toClass))
        return true;
    if (this.elementClass && toClass.elementClass)
        return this.elementClass.isAssignableTo(toClass.elementClass);
    return this.superClass ? this.superClass.isAssignableTo(toClass) : false;
}

ClassInfo.prototype.getClassObject = function(ctx) {
    var className = this.className;
    var classObjects = ctx.runtime.classObjects;
    var classObject = classObjects[className];
    if (!classObject) {
        classObject = ctx.newObject(CLASSES.java_lang_Class);
        classObject.vmClass = this;
        classObjects[className] = classObject;
    }
    return classObject;
}

ClassInfo.prototype.getField = function(fieldKey) {
    return CLASSES.getField(this, fieldKey);
}

ClassInfo.prototype.toString = function() {
    return "[class " + this.className + "]";
}

var ArrayClass = function(className, elementClass) {
    this.className = className;
    this.superClassName = "java/lang/Object";
    this.access_flags = 0;
    this.elementClass = elementClass;
    this.vmc = {};
    this.vfc = {};
}

ArrayClass.prototype.methods = [];

ArrayClass.prototype.isArrayClass = true;

ArrayClass.prototype.implementsInterface = function(iface) {
    return false;
}

ArrayClass.prototype.isAssignableTo = ClassInfo.prototype.isAssignableTo;

ArrayClass.prototype.getClassObject = ClassInfo.prototype.getClassObject;
