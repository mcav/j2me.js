#include "reader.h"
#include <stdlib.h>

// Values are read in big-endian.

uint8_t read8(byte** data) {
  byte i = *data[0];
  *data += 1;
  return i;
}

uint16_t read16(byte** data) {
  uint16_t i =
    (*data[1] << 0) |
    (*data[0] << 8);
  *data += 2;
  return i;
}

uint32_t read32(byte** data) {
  uint32_t i = 
    (*data[3] << 0) |
    (*data[2] << 8) |
    (*data[1] << 16) |
    (*data[0] << 24);
  *data += 4;
  return i;
}

uint64_t read64(byte** data) {
  uint64_t i =
    ((uint64_t)*data[7] << 0) |
    ((uint64_t)*data[6] << 8) |
    ((uint64_t)*data[5] << 16) |
    ((uint64_t)*data[4] << 24) |
    ((uint64_t)*data[3] << 32) |
    ((uint64_t)*data[2] << 40) |
    ((uint64_t)*data[1] << 48) |
    ((uint64_t)*data[0] << 56);
  *data += 8;
  return i;
}


int32_t readInt(byte** data) {
  return (int32_t)read32(data);
}

int64_t readLong(byte** data) {
  return (int64_t)read64(data);
}

float readFloat(byte** data) {
  return (float)read32(data);
}

double readDouble(byte** data) {
  return (double)read64(data);
}

// http://docs.oracle.com/javase/specs/jvms/se5.0/html/ClassFile.doc.html#7963
uint16_t* readString(byte** arr, uint32_t length) {
  uint16_t *chars = calloc(length + 1, sizeof(uint16_t)); // +1 for null
  uint32_t charIndex = 0;
  for (uint32_t i = 0; i < length; ) {
    byte x = *arr[i++];
    if (x <= 0x7f) {
      chars[charIndex++] = x;
    } else if (x <= 0xdf) {
      byte y = *arr[i++];
      chars[charIndex++] = ((x & 0x1f) << 6) + (y & 0x3f);
    } else {
      byte y = *arr[i++];
      byte z = *arr[i++];
      chars[charIndex++] = ((x & 0xf) << 12) + ((y & 0x3f) << 6) + (z & 0x3f);
    }
  }
  chars[charIndex] = 0; // Null terminate.
  *arr += length;
  return chars;
}

uint32_t jstrlen(uint16_t* str) {
  uint32_t i = 0;
  while (str[i] != 0) {
    i++;
  }
  return i;
}

uint32_t jstrcmp(uint16_t* s1, uint16_t* s2) {
  while(*s1 && (*s1 == *s2)) {
    s1++, s2++;
  }
  return *s1 - *s2;
}
