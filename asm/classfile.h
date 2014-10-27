#ifndef CLASSFILE_H_
#define CLASSFILE_H_

#include "reader.h"

// Constants

typedef enum {
  ConstantTag_Utf8 = 1,
  ConstantTag_Unicode = 2,
  ConstantTag_Integer = 3,
  ConstantTag_Float = 4,
  ConstantTag_Long = 5,
  ConstantTag_Double = 6,
  ConstantTag_Class = 7,
  ConstantTag_String = 8,
  ConstantTag_Fieldref = 9,
  ConstantTag_Methodref = 10,
  ConstantTag_InterfaceMethodref = 11,
  ConstantTag_NameAndType = 12
} ConstantTag;

// Each constant in the constant pool has a different structure,
// depending on the type:

typedef struct {
  uint8_t tag;
} cp_info;

typedef struct {
  uint8_t tag;
  uint16_t name_index;
} cp_class;

typedef struct {
  uint8_t tag;
  uint16_t* str;
} cp_utf8;

typedef struct {
  uint8_t tag;
  uint16_t class_index;
  uint16_t name_and_type_index;
} cp_ref;

typedef struct {
  uint8_t tag;
  uint16_t name_index;
  uint16_t descriptor_index;
} cp_name_and_type;

typedef struct {
  uint8_t tag;
  uint16_t string_index;
} cp_string;

typedef struct {
  uint8_t tag;
  int32_t value;
} cp_integer;

typedef struct {
  uint8_t tag;
  int64_t value;
} cp_long;

typedef struct {
  uint8_t tag;
  float value;
} cp_float;

typedef struct {
  uint8_t tag;
  double value;
} cp_double;


typedef struct {
  uint16_t attribute_name_index;
  uint32_t attribute_length;
} attribute_info;


typedef struct {
  uint16_t inner_class_info_index;
  uint16_t outer_class_info_index;
  uint16_t inner_name_index;
  uint16_t inner_class_access_flags;
} attribute_inner_classes_entry;



typedef struct {
  uint16_t attribute_name_index;
  uint32_t attribute_length;
  uint16_t number_of_classes;
  uint16_t related_class_info_count;
  uint16_t related_class_info_indexes[32]; // TODO: don't hardcode this

  attribute_inner_classes_entry* classes;
} attribute_inner_classes;





typedef struct {
  uint16_t access_flags;
  uint16_t name_index;
  uint16_t descriptor_index;
  uint16_t attributes_count;
  void** attributes; // attribute_info
} field_info;

typedef struct {
  uint16_t access_flags;
  uint16_t name_index;
  uint16_t descriptor_index;
  uint16_t attributes_count;
  void** attributes;
} method_info;


typedef struct {
  uint32_t magic;
  uint16_t major_version;
  uint16_t minor_version;
  uint16_t constant_pool_count;
  void** cp; // cp_*

  uint16_t access_flags;
  uint16_t this_class;
  uint16_t super_class;

  uint16_t interfaces_count;
  uint16_t* interfaces;

  uint16_t fields_count;
  field_info* fields;

  uint16_t methods_count;
  method_info* methods;

  uint16_t attributes_count;
  void** attributes; // attribute_infoattribute_info
} class_info;


#endif
