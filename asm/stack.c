#include <stdlib.h>
#include <emscripten.h>
#include <limits.h>
#include <math.h>
#include "opcodes.h"
#include "classfile.h"
#include "stack.h"

//****************************************************************
// Context Operations

Frame* new_frame(byte* code, uint32_t max_locals) {
  Frame *f = calloc(1, sizeof(Frame));
  f->code = code;
  f->stack_length = 0;
  f->locals = calloc(max_locals, sizeof(Word));
  f->ip = 0;
  return f;
}

void delete_frame(Frame *f) {
  free(f->locals);
  free(f);
}

Frame* context_push_frame(Context *ctx, Frame *f) {
  f->prev = ctx->current_frame;
  ctx->current_frame = f;
  return f;
}

Frame* context_get_current_frame(Context *ctx) {
  return ctx->current_frame;
}

void stack_push_raw(Frame *f, Word word) {
  f->stack[f->stack_length++] = word;
}

void stack_push(Frame *f, Word word) {
  stack_push_raw(f, word);
  if (word.type == WordType_Long || word.type == WordType_Double) {
    stack_push_raw(f, (Word) { 0 });
  }
}

Word stack_pop_raw(Frame *f) {
  return f->stack[--f->stack_length];
}

Word stack_pop(Frame *f) {
  Word word = stack_pop_raw(f);
  if (word.type == WordType_Long || word.type == WordType_Double) {
    stack_pop_raw(f);
  }
  return word;
}

Frame* context_pop_frame(Context *ctx, int consumes) {
  Frame *callee = ctx->current_frame;
  ctx->current_frame = callee->prev;
  
  if (consumes == 2) {
    Word w1 = stack_pop(callee);
    Word w2 = stack_pop(callee);
    stack_push(ctx->current_frame, w2);
    stack_push(ctx->current_frame, w1);
  } else if (consumes == 1) {
    stack_push(ctx->current_frame, stack_pop(callee));
  }

  delete_frame(callee);
  return ctx->current_frame;
}

Context* new_context() {
  return calloc(1, sizeof(Context));
}

void delete_context(Context *ctx) {
  while (ctx->current_frame) {
    context_pop_frame(ctx, 0);
  }
}


//****************************************************************
// Frame Operations

uint8_t frame_read_8(Frame *f) {
  return f->code[f->ip++];
}

uint16_t frame_read_16(Frame *f) {
  return frame_read_8(f) << 8 | frame_read_8(f);
}

uint32_t frame_read_32(Frame *f) {
  return frame_read_16(f) << 16 | frame_read_16(f);
}

int8_t frame_read_8_signed(Frame *f) {
  uint8_t x = frame_read_8(f);
  return (x > 0x7f) ? (x - 0x100) : x;
}

int16_t frame_read_16_signed(Frame *f) {
  uint16_t x = frame_read_16(f);
  return (x > 0x7fff) ? (x - 0x10000) : x;
}

int32_t frame_read_32_signed(Frame *f) {
  uint32_t x = frame_read_32(f);
  return (x > 0x7fffffff) ? (x - 0x100000000) : x;
}

Word frame_get_local(Frame *f, uint32_t index) {
  return f->locals[index];
}

void frame_set_local(Frame *f, uint32_t index, Word word) {
  f->locals[index] = word;
}

void frame_set_local_ref(Frame *f, uint32_t index, int refId) {
  frame_set_local(f, index, WORD_REF(refId));
}

int frame_get_local_ref(Frame *f, uint32_t index) {
  return frame_get_local(f, index).value.a;
}

void context_push_ref(Context *ctx, int refId) {
  stack_push(ctx->current_frame, WORD_REF(refId));
}

int execute(Context *ctx) {
  while (1) {
    Frame *f = ctx->current_frame;
    uint8_t op = frame_read_8(f);
    printf("OPCODE %s\n", OPCODE_LIST[(uint32_t)op]);
    switch (op) {
    case 0x00: // nop
      break;
    case 0x01: // aconst_null
      stack_push(f, WORD_REF(0));
      break;
    case 0x02: // iconst_m1
    case 0x03: // iconst_0
    case 0x04: // iconst_1
    case 0x05: // iconst_2
    case 0x06: // iconst_3
    case 0x07: // iconst_4
    case 0x08: // iconst_5
      stack_push(f, WORD_INT(op - 0x03));
      break;
    case 0x09: // lconst_0
    case 0x0a: // lconst_1
      stack_push(f, WORD_LONG(op - 0x09));
      break;
    case 0x0b: // fconst_0
    case 0x0c: // fconst_1
    case 0x0d: // fconst_2
      stack_push(f, WORD_FLOAT(op - 0x0b));
      break;
    case 0x0e:
    case 0x0f:
      stack_push(f, WORD_DOUBLE(op - 0x0e));
      break;
    case 0x10: // bipush
      stack_push(f, WORD_BYTE(frame_read_8_signed(f)));
      break;
    case 0x11: // sipush
      stack_push(f, WORD_SHORT(frame_read_16_signed(f)));
      break;
    case 0x15: // iload
      stack_push(f, WORD_INT(frame_get_local(f, frame_read_8(f)).value.i));
      break;
    case 0x16: // lload
      stack_push(f, WORD_LONG(frame_get_local(f, frame_read_8(f)).value.l));
      break;
    case 0x17: // fload
      stack_push(f, WORD_FLOAT(frame_get_local(f, frame_read_8(f)).value.f));
      break;
    case 0x18: // dload
      stack_push(f, WORD_DOUBLE(frame_get_local(f, frame_read_8(f)).value.d));
      break;
    case 0x19: // aload
      stack_push(f, WORD_REF(frame_get_local(f, frame_read_8(f)).value.a));
      break;
    case 0x1a: // iload_0
    case 0x1b: // iload_1
    case 0x1c: // iload_2
    case 0x1d: // iload_3
      stack_push(f, WORD_INT(frame_get_local(f, op - 0x1a).value.i));
    case 0x1e: // lload_0
    case 0x1f: // lload_1
    case 0x20: // lload_2
    case 0x21: // lload_3
      stack_push(f, WORD_LONG(frame_get_local(f, op - 0x1e).value.l));
      break;
    case 0x22: // fload_0
    case 0x23: // fload_1
    case 0x24: // fload_2
    case 0x25: // fload_3
      stack_push(f, WORD_FLOAT(frame_get_local(f, op - 0x22).value.f));
      break;
    case 0x2a: // aload_0
    case 0x2b: // aload_1
    case 0x2c: // aload_2
    case 0x2d: // aload_3
      stack_push(f, WORD_REF(frame_get_local(f, op - 0x2a).value.a));
      break;
    case 0x26: // dload_0
    case 0x27: // dload_1
    case 0x28: // dload_2
    case 0x29: // dload_3
      stack_push(f, WORD_DOUBLE(frame_get_local(f, op - 0x26).value.d));
      break;
    case 0x36: // istore
      frame_set_local(f, (int)frame_read_8(f), WORD_INT(stack_pop(f).value.i));
      break;
    case 0x37: // lstore
      frame_set_local(f, (int)frame_read_8(f), WORD_LONG(stack_pop(f).value.l));
      break;
    case 0x38: // fstore
      frame_set_local(f, (int)frame_read_8(f), WORD_FLOAT(stack_pop(f).value.f));
      break;
    case 0x39: // dstore
      frame_set_local(f, (int)frame_read_8(f), WORD_DOUBLE(stack_pop(f).value.d));
      break;
    case 0x3a: // astore
      frame_set_local(f, (int)frame_read_8(f), WORD_REF(stack_pop(f).value.a));
      break;
    case 0x3b: // istore_0
    case 0x3c: // istore_1
    case 0x3d: // istore_2
    case 0x3e: // istore_3
      frame_set_local(f, op - 0x3b, WORD_INT(stack_pop(f).value.i));
      break;
    case 0x3f: // lstore_0
    case 0x40: // lstore_1
    case 0x41: // lstore_2
    case 0x42: // lstore_3
      frame_set_local(f, op - 0x3f, WORD_LONG(stack_pop(f).value.l));
      break;
    case 0x43: // fstore_0
    case 0x44: // fstore_1
    case 0x45: // fstore_2
    case 0x46: // fstore_3
      frame_set_local(f, op - 0x43, WORD_FLOAT(stack_pop(f).value.f));
      break;
    case 0x47: // dstore_0
    case 0x48: // dstore_1
    case 0x49: // dstore_2
    case 0x4a: // dstore_3
      frame_set_local(f, op - 0x47, WORD_DOUBLE(stack_pop(f).value.d));
      break;
    case 0x4b: // astore_0
    case 0x4c: // astore_1
    case 0x4d: // astore_2
    case 0x4e: // astore_3
      frame_set_local(f, op - 0x4b, WORD_REF(stack_pop(f).value.a));
      break;
    case 0x57: // pop
      stack_pop_raw(f);
      break;
    case 0x58: // pop2
      stack_pop_raw(f);
      stack_pop_raw(f);
      break;
    case 0x59: // dup
      {
        Word w = stack_pop_raw(f);
        stack_push_raw(f, w);
        stack_push_raw(f, w);
      }
      break;
    case 0x5a: // dup_x1
      {
        Word w1 = stack_pop_raw(f);
        Word w2 = stack_pop_raw(f);
        stack_push_raw(f, w1);
        stack_push_raw(f, w2);
        stack_push_raw(f, w1);
      }
      break;
    case 0x5b: // dup_x2
      {
        Word w1 = stack_pop_raw(f);
        Word w2 = stack_pop_raw(f);
        Word w3 = stack_pop_raw(f);
        stack_push_raw(f, w1);
        stack_push_raw(f, w3);
        stack_push_raw(f, w2);
        stack_push_raw(f, w1);
      }
      break;
    case 0x5c: // dup2
      {
        Word w1 = stack_pop_raw(f);
        Word w2 = stack_pop_raw(f);
        stack_push_raw(f, w2);
        stack_push_raw(f, w1);
        stack_push_raw(f, w2);
        stack_push_raw(f, w1);
      }
      break;
    case 0x5d: // dup2_x1
      {
        Word w1 = stack_pop_raw(f);
        Word w2 = stack_pop_raw(f);
        Word w3 = stack_pop_raw(f);
        stack_push_raw(f, w2);
        stack_push_raw(f, w1);
        stack_push_raw(f, w3);
        stack_push_raw(f, w2);
        stack_push_raw(f, w1);
      }
      break;
    case 0x5e: // dup2_x2
      {
        Word w1 = stack_pop_raw(f);
        Word w2 = stack_pop_raw(f);
        Word w3 = stack_pop_raw(f);
        Word w4 = stack_pop_raw(f);
        stack_push_raw(f, w2);
        stack_push_raw(f, w1);
        stack_push_raw(f, w4);
        stack_push_raw(f, w3);
        stack_push_raw(f, w2);
        stack_push_raw(f, w1);
      }
      break;
    case 0x5f: // swap
      {
        Word w1 = stack_pop_raw(f);
        Word w2 = stack_pop_raw(f);
        stack_push_raw(f, w1);
        stack_push_raw(f, w2);
      }
      break;
    case 0x84: // iinc
      {
        uint32_t idx = frame_read_8(f);
        int val = frame_read_8_signed(f);
        frame_set_local(f, idx, WORD_INT(frame_get_local(f, idx).value.i + val));
      }
      break;
    case 0x60: // iadd
      stack_push(f, WORD_INT(stack_pop(f).value.i + stack_pop(f).value.i));
      break;
    case 0x61: // ladd
      stack_push(f, WORD_LONG(stack_pop(f).value.l + stack_pop(f).value.l));
      break;
    case 0x62: // fadd
      stack_push(f, WORD_FLOAT(stack_pop(f).value.f + stack_pop(f).value.f));
      break;
    case 0x63: // dadd
      stack_push(f, WORD_DOUBLE(stack_pop(f).value.d + stack_pop(f).value.d));
      break;
    case 0x64: // isub
      stack_push(f, WORD_INT(- stack_pop(f).value.i + stack_pop(f).value.i));
      break;
    case 0x65: // lsub
      stack_push(f, WORD_LONG(- stack_pop(f).value.l + stack_pop(f).value.l));
      break;
    case 0x66: // fsub
      stack_push(f, WORD_FLOAT(- stack_pop(f).value.f + stack_pop(f).value.f));
      break;
    case 0x67: // dsub
      stack_push(f, WORD_DOUBLE(- stack_pop(f).value.d + stack_pop(f).value.d));
      break;
    case 0x68: // imul
      stack_push(f, WORD_INT(stack_pop(f).value.i + stack_pop(f).value.i));
      break;
    case 0x69: // lmul
      stack_push(f, WORD_LONG(stack_pop(f).value.l * stack_pop(f).value.l));
      break;
    case 0x6a: // fmul
      stack_push(f, WORD_FLOAT(stack_pop(f).value.f * stack_pop(f).value.f));
      break;
    case 0x6b: // dmul
      stack_push(f, WORD_DOUBLE(stack_pop(f).value.d * stack_pop(f).value.d));
      break;
    case 0x6c: // idiv
      {
        int b = stack_pop(f).value.i;
        int a = stack_pop(f).value.i;
        if (!b) {
          THROW("java/lang/ArithmeticException", "/ by zero");
        }
        stack_push(f, WORD_INT(a == INT_MIN && b == -1 ? a : (a / b)));
      }
      break;
    case 0x6d: // ldiv
      {
        long b = stack_pop(f).value.l;
        long a = stack_pop(f).value.l;
        if (!b) {
          THROW("java/lang/ArithmeticException", "/ by zero");
        }
        stack_push(f, WORD_LONG(a == LONG_MIN && b == -1 ? a : (a / b)));
      }
      break;
    case 0x6e: // fdiv
      {
        float b = stack_pop(f).value.f;
        float a = stack_pop(f).value.f;
        stack_push(f, WORD_FLOAT(a / b));
      }
      break;
    case 0x6f: // ddiv
      {
        double b = stack_pop(f).value.d;
        double a = stack_pop(f).value.d;
        stack_push(f, WORD_DOUBLE(a / b));
      }
      break;
    case 0x70: // irem
      {
        int b = stack_pop(f).value.i;
        int a = stack_pop(f).value.i;
        if (!b) {
          THROW("java/lang/ArithmeticException", "% by zero");
        }
        stack_push(f, WORD_INT(a % b));
      }
      break;
    case 0x71: // lrem
      {
        long b = stack_pop(f).value.l;
        long a = stack_pop(f).value.l;
        if (!b) {
          THROW("java/lang/ArithmeticException", "% by zero");
        }
        stack_push(f, WORD_LONG(a % b));
      }
      break;
    case 0x72: // frem
      {
        float b = stack_pop(f).value.f;
        float a = stack_pop(f).value.f;
        stack_push(f, WORD_FLOAT(fmod(a, b)));
      }
      break;
    case 0x73: // drem
      {
        double b = stack_pop(f).value.d;
        double a = stack_pop(f).value.d;
        stack_push(f, WORD_DOUBLE(fmod(a, b)));
      }
      break;
    case 0x74: // ineg
      stack_push(f, WORD_INT(- stack_pop(f).value.i));
      break;
    case 0x75: // lneg
      stack_push(f, WORD_LONG(- stack_pop(f).value.l));
      break;
    case 0x76: // fneg
      stack_push(f, WORD_FLOAT(- stack_pop(f).value.f));
      break;
    case 0x77: // dneg
      stack_push(f, WORD_DOUBLE(- stack_pop(f).value.d));
      break;
    case 0x78: // ishl
      {
        int b = stack_pop(f).value.i;
        int a = stack_pop(f).value.i;
        stack_push(f, WORD_INT(a << b));
      }
      break;
    case 0x79: // lshl
      {
        int b = stack_pop(f).value.i;
        long a = stack_pop(f).value.l;
        stack_push(f, WORD_INT(a << b));
      }
      break;
    case 0x7a: // ishr
      {
        int b = stack_pop(f).value.i;
        int a = stack_pop(f).value.i;
        stack_push(f, WORD_INT(a >> b));
      }
      break;
    case 0x7b: // lshr
      {
        int b = stack_pop(f).value.i;
        long a = stack_pop(f).value.l;
        stack_push(f, WORD_INT(a >> b));
      }
      break;
    case 0x7c: // iushr
      {
        int b = stack_pop(f).value.i;
        int a = stack_pop(f).value.i;
        stack_push(f, WORD_INT((uint32_t)a >> b));
      }
      break;
    case 0x7d: // lushr
      {
        int b = stack_pop(f).value.i;
        long a = stack_pop(f).value.l;
        stack_push(f, WORD_INT((uint32_t)a >> b));
      }
      break;
    case 0x7e: // iand
      stack_push(f, WORD_INT(stack_pop(f).value.i & stack_pop(f).value.i));
      break;
    case 0x7f: // land
      stack_push(f, WORD_LONG(stack_pop(f).value.l & stack_pop(f).value.l));
      break;
    case 0x80: // ior
      stack_push(f, WORD_INT(stack_pop(f).value.i | stack_pop(f).value.i));
      break;
    case 0x81: // lor
      stack_push(f, WORD_LONG(stack_pop(f).value.l | stack_pop(f).value.l));
      break;
    case 0x82: // ixor
      stack_push(f, WORD_INT(stack_pop(f).value.i ^ stack_pop(f).value.i));
      break;
    case 0x83: // lxor
      stack_push(f, WORD_LONG(stack_pop(f).value.l ^ stack_pop(f).value.l));
      break;
    case 0x94: // lcmp
      {
        long b = stack_pop(f).value.l;
        long a = stack_pop(f).value.l;
        if (a > b) {
          stack_push(f, WORD_INT(1));
        } else if (a < b) {
          stack_push(f, WORD_INT(-1));
        } else {
          stack_push(f, WORD_INT(0));
        }
      }
      break;
    case 0x95: // fcmpl
      {
        float b = stack_pop(f).value.f;
        float a = stack_pop(f).value.f;
        if ((a != a) || (b != b)) {
          stack_push(f, WORD_INT(-1)); // If either is NaN
        } else if (a > b) {
          stack_push(f, WORD_INT(1));
        } else if (a < b) {
          stack_push(f, WORD_INT(-1));
        } else {
          stack_push(f, WORD_INT(0));
        }
      }
      break;
    case 0x96: // fcmpg
      {
        float b = stack_pop(f).value.f;
        float a = stack_pop(f).value.f;
        if ((a != a) || (b != b)) {
          stack_push(f, WORD_INT(1)); // If either is NaN
        } else if (a > b) {
          stack_push(f, WORD_INT(1));
        } else if (a < b) {
          stack_push(f, WORD_INT(-1));
        } else {
          stack_push(f, WORD_INT(0));
        }
      }
      break;
    case 0x97: // fcmpl
      {
        double b = stack_pop(f).value.d;
        double a = stack_pop(f).value.d;
        if ((a != a) || (b != b)) {
          stack_push(f, WORD_INT(-1)); // If either is NaN
        } else if (a > b) {
          stack_push(f, WORD_INT(1));
        } else if (a < b) {
          stack_push(f, WORD_INT(-1));
        } else {
          stack_push(f, WORD_INT(0));
        }
      }
      break;
    case 0x98: // fcmpg
      {
        double b = stack_pop(f).value.d;
        double a = stack_pop(f).value.d;
        if ((a != a) || (b != b)) {
          stack_push(f, WORD_INT(1)); // If either is NaN
        } else if (a > b) {
          stack_push(f, WORD_INT(1));
        } else if (a < b) {
          stack_push(f, WORD_INT(-1));
        } else {
          stack_push(f, WORD_INT(0));
        }
        break;
      }
    case 0x99: // ifeq
      {
        int jmp = f->ip - 1 + frame_read_16_signed(f);
        if (stack_pop(f).value.i == 0) {
          f->ip = jmp;
        }
      }
      break;
    case 0x9a: // ifne
      {
        int jmp = f->ip - 1 + frame_read_16_signed(f);
        if (stack_pop(f).value.i != 0) {
          f->ip = jmp;
        }
      }
      break;
    case 0x9b: // iflt
      {
        int jmp = f->ip - 1 + frame_read_16_signed(f);
        if (stack_pop(f).value.i < 0) {
          f->ip = jmp;
        }
      }
      break;
    case 0x9c: // ifge
      {
        int jmp = f->ip - 1 + frame_read_16_signed(f);
        if (stack_pop(f).value.i >= 0) {
          f->ip = jmp;
        }
      }
      break;
    case 0x9d: // ifgt
      {
        int jmp = f->ip - 1 + frame_read_16_signed(f);
        if (stack_pop(f).value.i > 0) {
          f->ip = jmp;
        }
      }
      break;
    case 0x9e: // ifle
      {
        int jmp = f->ip - 1 + frame_read_16_signed(f);
        if (stack_pop(f).value.i <= 0) {
          f->ip = jmp;
        }
      }
      break;
    case 0x9f: // if_icmpeq
      {
        int jmp = f->ip - 1 + frame_read_16_signed(f);
        if (stack_pop(f).value.i == stack_pop(f).value.i) {
          f->ip = jmp;
        }
      }
      break;
    case 0xa0: // if_icmpne
      {
        int jmp = f->ip - 1 + frame_read_16_signed(f);
        if (stack_pop(f).value.i != stack_pop(f).value.i) {
          f->ip = jmp;
        }
      }
      break;
    case 0xa1: // if_icmplt
      {
        int jmp = f->ip - 1 + frame_read_16_signed(f);
        // (Sign flipped due to stack order:)
        if (stack_pop(f).value.i > stack_pop(f).value.i) {
          f->ip = jmp;
        }
      }
      break;
    case 0xa2: // if_icmpge
      {
        int jmp = f->ip - 1 + frame_read_16_signed(f);
        // (Sign flipped due to stack order:)
        if (stack_pop(f).value.i <= stack_pop(f).value.i) {
          f->ip = jmp;
        }
      }
      break;
    case 0xa3: // if_icmpgt
      {
        int jmp = f->ip - 1 + frame_read_16_signed(f);
        if (stack_pop(f).value.i < stack_pop(f).value.i) {
          f->ip = jmp;
        }
      }
      break;
    case 0xa4: // if_icmple
      {
        int jmp = f->ip - 1 + frame_read_16_signed(f);
        if (stack_pop(f).value.i >= stack_pop(f).value.i) {
          f->ip = jmp;
        }
      }
      break;
    case 0xa5: // if_acmpeq
      {
        int jmp = f->ip - 1 + frame_read_16_signed(f);
        if (stack_pop(f).value.a == stack_pop(f).value.a) {
          f->ip = jmp;
        }
      }
      break;
    case 0xa6: // if_acmpne
      {
        int jmp = f->ip - 1 + frame_read_16_signed(f);
        if (stack_pop(f).value.a != stack_pop(f).value.a) {
          f->ip = jmp;
        }
      }
      break;
    case 0xc6: // ifnull
      {
        int jmp = f->ip - 1 + frame_read_16_signed(f);
        if (!stack_pop(f).value.a) {
          f->ip = jmp;
        }
      }
      break;
    case 0xc7: // ifnonnull
      {
        int jmp = f->ip - 1 + frame_read_16_signed(f);
        if (stack_pop(f).value.a) {
          f->ip = jmp;
        }
      }
      break;
    case 0xa7: // goto
      f->ip += frame_read_16_signed(f) - 1;
      break;
    case 0xc8: // goto_w
      f->ip += frame_read_32_signed(f) - 1;
      break;
    case 0xa8: // jsr
      {
        int jmp = frame_read_16(f);
        stack_push(f, WORD_INT(f->ip));
        f->ip = jmp;
      }
      break;
    case 0xc9: // jsr_w
      {
        int jmp = frame_read_32(f);
        stack_push(f, WORD_INT(f->ip));
        f->ip = jmp;
      }
      break;
    case 0xa9: // ret
      f->ip = frame_get_local(f, frame_read_8(f)).value.i;
      break;
    case 0x85: // i2l
      stack_push(f, WORD_LONG(stack_pop(f).value.i));
      break;
    case 0x86: // i2f
      stack_push(f, WORD_FLOAT(stack_pop(f).value.i));
      break;
    case 0x87: // i2d
      stack_push(f, WORD_DOUBLE(stack_pop(f).value.i));
      break;
    case 0x88: // l2i
      stack_push(f, WORD_INT(stack_pop(f).value.l));
      break;
    case 0x89: // l2f
      stack_push(f, WORD_FLOAT(stack_pop(f).value.l));
      break;
    case 0x8a: // l2d
      stack_push(f, WORD_DOUBLE(stack_pop(f).value.l));
      break;
    case 0x8b: // f2i
      stack_push(f, WORD_INT(stack_pop(f).value.f));
      break;
    case 0x8c: // f2l
      stack_push(f, WORD_FLOAT(stack_pop(f).value.f));
      break;
    case 0x8d: // f2d
      stack_push(f, WORD_DOUBLE(stack_pop(f).value.f));
      break;
    case 0x8e: // d2i
      stack_push(f, WORD_INT(stack_pop(f).value.d));
      break;
    case 0x8f: // d2l
      stack_push(f, WORD_LONG(stack_pop(f).value.d));
      break;
    case 0x90: // d2f
      stack_push(f, WORD_FLOAT(stack_pop(f).value.d));
      break;
    case 0x91: // i2b
      stack_push(f, WORD_BYTE(stack_pop(f).value.i << 24 >> 24));
      break;
    case 0x92: // i2c
      stack_push(f, WORD_CHAR(stack_pop(f).value.i & 0xffff));
      break;
    case 0x93: // i2s
      stack_push(f, WORD_SHORT(stack_pop(f).value.i << 16 >> 16));
      break;

    case 0xaa: // tableswitch
      {
        int startip = f->ip;
        while ((f->ip & 3) != 0) {
          f->ip++;
        }
        int def = frame_read_32_signed(f);
        int low = frame_read_32_signed(f);
        int high = frame_read_32_signed(f);
        int val = stack_pop(f).value.i;
        int jmp;
        if (val < low || val > high) {
          jmp = def;
        } else {
          f->ip += (val - low) << 2;
          jmp = frame_read_32_signed(f);
        }
        f->ip = startip - 1 + jmp;
      }
      break;
    case 0xab: // lookupswitch
      {
        int startip = f->ip;
        while ((f->ip & 3) != 0)
          f->ip++;
        int jmp = frame_read_32_signed(f);
        uint32_t size = frame_read_32(f);
        int val = stack_pop(f).value.i;
      lookup:
        for (int i = 0; i < size; i++) {
          int key = frame_read_32_signed(f);
          int offset = frame_read_32_signed(f);
          if (key == val) {
            jmp = offset;
          }
          if (key >= val) {
            goto lookup;
          }
        }
        f->ip = startip - 1 + jmp;
      }
      break;
      
    case 0xc4: // wide
      switch (op = frame_read_8(f)) {
      case 0x15: // iload
        stack_push(f, WORD_INT(frame_get_local(f, frame_read_16(f)).value.i));
        break;
      case 0x17: // fload
        stack_push(f, WORD_FLOAT(frame_get_local(f, frame_read_16(f)).value.f));
        break;
      case 0x19: // aload
        stack_push(f, WORD_REF(frame_get_local(f, frame_read_16(f)).value.a));
        break;
      case 0x16: // lload
        stack_push(f, WORD_LONG(frame_get_local(f, frame_read_16(f)).value.l));
        break;
      case 0x18: // dload
        stack_push(f, WORD_DOUBLE(frame_get_local(f, frame_read_16(f)).value.d));
        break;
      case 0x36: // istore
        frame_set_local(f, frame_read_16(f), WORD_INT(stack_pop(f).value.i));
        break;
      case 0x38: // fstore
        frame_set_local(f, frame_read_16(f), WORD_FLOAT(stack_pop(f).value.f));
        break;
      case 0x3a: // astore
        frame_set_local(f, frame_read_16(f), WORD_REF(stack_pop(f).value.a));
        break;
      case 0x37: // lstore
        frame_set_local(f, frame_read_16(f), WORD_LONG(stack_pop(f).value.l));
        break;
      case 0x39: // dstore
        frame_set_local(f, frame_read_16(f), WORD_DOUBLE(stack_pop(f).value.d));
        break;
      case 0x84: // iinc
        {
          uint32_t idx = frame_read_16(f);
          int val = frame_read_16_signed(f);
          frame_set_local(f, idx, WORD_INT(frame_get_local(f, idx).value.i + val));
        }
        break;
      case 0xa9: // ret
        f->ip = frame_get_local(f, frame_read_16(f)).value.i;
        break;
      default:
        THROW("java/lang/RuntimeException", "Wide opcode not supported?");
      }
      break;
    default:
      {
        int ret = EM_ASM_INT({
            VM.executeOp(ctx, $0);
          }, op);
        if (ret) {
          return ret;
        }
      }
    }
  };
  return 0;
}
