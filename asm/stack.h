#pragma once

#include "reader.h"

typedef enum {
  WordType_Empty = 0,
  WordType_Int,
  WordType_Float,
  WordType_Double,
  WordType_Long,
  WordType_Ref
} WordType;

typedef union {
  int32_t i;
  float f;
  double d;
  int64_t l;
  uint32_t a; // ref
} WordValue;

typedef struct {
  WordType type;
  WordValue value;
} Word;

const int STACK_SIZE = 256;

typedef struct Frame {
  struct Frame* prev;
  byte* code;
  Word stack[STACK_SIZE];
  uint32_t stack_length;
  Word* locals;
  uint32_t ip;
} Frame;

// TODO
#define THROW(klass, msg) (void)(0);

typedef struct {
  Frame *current_frame;
} Context;

#define WORD_INT(x) ((Word){ WordType_Int, { .i = (x) } })
#define WORD_FLOAT(x) ((Word){ WordType_Float, { .f = (x) } })
#define WORD_DOUBLE(x) ((Word){ WordType_Double, { .d = (x) } })
#define WORD_LONG(x) ((Word){ WordType_Long, { .l = (x) } })
#define WORD_REF(x) ((Word){ WordType_Int, { .a = (x) } })
#define WORD_BYTE(x) WORD_INT((char)x)
#define WORD_CHAR(x) WORD_INT((char)x)
#define WORD_SHORT(x) WORD_INT((short)x)
#define WORD_BOOLEAN(x) WORD_INT(x)

