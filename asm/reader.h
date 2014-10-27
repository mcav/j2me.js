#ifndef READER_H_
#define READER_H_

#include <stdint.h>

typedef uint8_t byte;
typedef uint8_t bool;

uint8_t read8(byte** data);
uint16_t read16(byte** data);
uint32_t read32(byte** data);
uint64_t read64(byte** data);

int32_t readInt(byte** data);
int64_t readLong(byte** data);
float readFloat(byte** data);
double readDouble(byte** data);
uint16_t* readString(byte** data, uint32_t length);

uint32_t jstrlen(uint16_t* str);
uint32_t jstrcmp(uint16_t* s1, uint16_t* s2);

#endif
