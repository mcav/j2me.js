/* -*- Mode: Java; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/* vim: set shiftwidth=4 tabstop=4 autoindent cindent expandtab: */

'use strict';

var CLASSES;

var JVM = function() {
    if (this instanceof JVM) {
        CLASSES = new Classes();
    } else {
        return new JVM();
    }
}

JVM.prototype.addPath = function(path, data) {
    return CLASSES.addPath(path, data);
}

JVM.prototype.initializeBuiltinClasses = function() {
    // These classes are guaranteed to not have a static initializer.
    CLASSES.java_lang_Object = CLASSES.loadClass("java/lang/Object");
    CLASSES.java_lang_Class = CLASSES.loadClass("java/lang/Class");
    CLASSES.java_lang_String = CLASSES.loadClass("java/lang/String");
    CLASSES.java_lang_Thread = CLASSES.loadClass("java/lang/Thread");
}

JVM.prototype.startIsolate0 = function(className, args) {
    var runtime = new Runtime(this);
    var ctx = new Context(runtime);

    var com_sun_cldc_isolate_Isolate = CLASSES.getClass("com/sun/cldc/isolate/Isolate");

    var isolate = util.newObject(com_sun_cldc_isolate_Isolate);
    isolate.id = util.id();

    var array = util.newArray("[Ljava/lang/String;", args.length);
    for (var n = 0; n < args.length; ++n)
        array[n] = args[n] ? util.newString(args[n]) : null;


    var methodInfo = CLASSES.getMethod(com_sun_cldc_isolate_Isolate,
                                       "I.<init>.(Ljava/lang/String;[Ljava/lang/String;)V");

    var ret = ctx.beginInvoke(methodInfo,
                              [isolate,
                               util.newString(className.replace(/\./g, "/")),
                               array]);

    function invokeStart() {
        ctx.onFramesRanOut = ctx.kill.bind(ctx);
        var methodInfo = CLASSES.getMethod(com_sun_cldc_isolate_Isolate, "I.start.()V");
        ctx.beginInvoke(methodInfo, [isolate]);
    }

    if (ret instanceof VM.Yield) {
        ctx.onFramesRanOut = invokeStart();
    } else {
        invokeStart();
    }
}

JVM.prototype.startIsolate = function(isolate) {
    var mainClass = util.fromJavaString(isolate.class.getField("I._mainClass.Ljava/lang/String;").get(isolate)).replace(/\./g, "/");
    var mainArgs = isolate.class.getField("I._mainArgs.[Ljava/lang/String;").get(isolate);
    mainArgs.forEach(function(str, n) {
        mainArgs[n] = util.fromJavaString(str);
    });

    var runtime = new Runtime(this);
    var ctx = new Context(runtime);

    isolate.runtime = runtime;
    runtime.isolate = isolate;

    runtime.updateStatus(2); // STARTED

    var classInfo = CLASSES.getClass(mainClass);
    if (!classInfo)
        throw new Error("Could not find or load main class " + mainName);

    var entryPoint = CLASSES.getEntryPoint(classInfo);
    if (!entryPoint)
        throw new Error("Could not find main method in class " + mainName);

    ctx.thread = runtime.mainThread = util.newObject(CLASSES.java_lang_Thread);
    ctx.thread.pid = util.id();
    ctx.thread.alive = true;

    var methodInfo = CLASSES.getMethod(CLASSES.java_lang_Thread, "I.<init>.(Ljava/lang/String;)V");

    var ret = ctx.beginInvoke(methodInfo,
                              [runtime.mainThread,
                               util.newString("main")]);

    function invokeMain() {
        ctx.onFramesRanOut = ctx.kill.bind(ctx);
        var args = util.newArray("[Ljava/lang/String;", mainArgs.length);
        for (var n = 0; n < mainArgs.length; ++n)
            args[n] = mainArgs[n] ? util.newString(mainArgs[n]) : null;
        ctx.beginInvoke(entryPoint, [args]);
    }

    if (ret instanceof VM.Yield) {
        ctx.onFramesRanOut = invokeMain();
        return ret;
    } else {
        return invokeMain();
    }

}
