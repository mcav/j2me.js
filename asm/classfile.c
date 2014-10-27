#include "reader.h"
#include "classfile.h"
#include <stdio.h>
#include <stdlib.h>

void read_attributes(class_info* info, byte** reader, void*** attributes, uint16_t attributes_count);

// represents the string "InnerClasses"
uint16_t INNER_CLASSES_STRING[] = { 73, 110, 110, 101, 114, 67, 108, 97, 115, 115, 101, 115, 0 };


class_info* load_class_bytes(char *bytes) {
  byte* reader = (byte*)bytes;

  class_info* info = calloc(1, sizeof(class_info));

  info->magic = read32(&reader);
  info->minor_version = read16(&reader);
  info->major_version = read16(&reader);
  info->constant_pool_count = read16(&reader);

  info->cp = calloc(info->constant_pool_count, sizeof(void*));

  // Constants are indexed from 1.
  for (int i = 1; i < info->constant_pool_count; i++) {
    byte tag = read8(&reader);

    switch(tag) {

    case ConstantTag_Class:
      {
        cp_class* item = info->cp[i] = calloc(1, sizeof(cp_class));
        item->tag = tag;
        item->name_index = read16(&reader);
      }
      break;
    case ConstantTag_Utf8:
      {
        cp_utf8* item = info->cp[i] = calloc(1, sizeof(cp_utf8));
        item->tag = tag;
        item->str = readString(&reader, read16(&reader));
      }
      break;
    case ConstantTag_Methodref:
    case ConstantTag_Fieldref:
    case ConstantTag_InterfaceMethodref:
      {
        cp_ref* item = info->cp[i] = calloc(1, sizeof(cp_ref));
        item->tag = tag;
        item->class_index = read16(&reader);
        item->name_and_type_index = read16(&reader);
      }
      break;

    case ConstantTag_NameAndType:
      {
        cp_name_and_type* item = info->cp[i] = calloc(1, sizeof(cp_name_and_type));
        item->tag = tag;
        item->name_index = read16(&reader);
        item->descriptor_index = read16(&reader);
      }
      break;

    case ConstantTag_String:
      {
        cp_string* item = info->cp[i] = calloc(1, sizeof(cp_string));
        item->tag = tag;
        item->string_index = read16(&reader);
      }
      break;

    case ConstantTag_Integer:
      {
        cp_integer* item = info->cp[i] = calloc(1, sizeof(cp_integer));
        item->tag = tag;
        item->value = readInt(&reader);
      }
      break;

    case ConstantTag_Float:
      {
        cp_float* item = info->cp[i] = calloc(1, sizeof(cp_float));
        item->tag = tag;
        item->value = readFloat(&reader);
      }
      break;

    case ConstantTag_Long:
      {
        cp_long* item = info->cp[i] = calloc(1, sizeof(cp_long));
        item->tag = tag;
        item->value = readLong(&reader);
        i++; // Leave a blank entry; this is double-width.
      }
      break;

    case ConstantTag_Double:
      {
        cp_double* item = info->cp[i] = calloc(1, sizeof(cp_double));
        item->tag = tag;
        item->value = readDouble(&reader);
        i++; // Leave a blank entry; this is double-width.
      }
      break;

    } // end switch
  } // end for
  
  info->access_flags = read16(&reader);
  info->this_class = read16(&reader);
  info->super_class = read16(&reader);

  // Interfaces are just stored as short indexes into the pool.
  info->interfaces_count = read16(&reader);
  info->interfaces = calloc(info->interfaces_count, sizeof(short));
  for (int i = 0; i < info->interfaces_count; i++) {
    info->interfaces[i] = read16(&reader);
  }
  
  info->fields_count = read16(&reader);
  info->fields = calloc(info->fields_count, sizeof(field_info));
  for (int i = 0; i < info->fields_count; i++) {
    field_info* field = &info->fields[i];
    field->access_flags = read16(&reader);
    field->name_index = read16(&reader);
    field->descriptor_index = read16(&reader);

    field->attributes_count = read16(&reader);
    read_attributes(info, &reader, &field->attributes, field->attributes_count);
  }

  info->methods_count = read16(&reader);
  info->methods = calloc(info->methods_count, sizeof(method_info));
  for (int i = 0; i < info->methods_count; i++) {
    method_info* method = &info->methods[i];
    method->access_flags = read16(&reader);
    method->name_index = read16(&reader);
    method->descriptor_index = read16(&reader);

    method->attributes_count = read16(&reader);
    read_attributes(info, &reader, &method->attributes, method->attributes_count);
  }

  info->attributes_count = read16(&reader);
  read_attributes(info, &reader, &info->attributes, info->attributes_count);

  return info;
}

void read_attributes(class_info* info, byte** reader, void*** attributes, uint16_t attributes_count) {
  *attributes = calloc(attributes_count, sizeof(attribute_info*));
  for (int j = 0; j < attributes_count; j++) {
    uint16_t attribute_name_index = read16(reader);
    uint32_t attribute_length = read32(reader);
    uint16_t* attribute_name = ((cp_utf8*)info->cp[attribute_name_index])->str;

    if (jstrcmp(attribute_name, INNER_CLASSES_STRING) == 0) {
      attribute_inner_classes* item = *attributes[j] = calloc(1, sizeof(attribute_inner_classes));
      item->attribute_name_index = attribute_name_index;
      item->attribute_length = attribute_length;
      item->number_of_classes = read16(reader);
      item->classes = calloc(item->number_of_classes,
                             sizeof(attribute_inner_classes_entry));

      item->related_class_info_count = 0;
      for (uint32_t k = 0; k < item->number_of_classes; k++) {
        attribute_inner_classes_entry* entry = &item->classes[k];
        entry->inner_class_info_index = read16(reader);
        entry->outer_class_info_index = read16(reader);
        entry->inner_name_index = read16(reader);
        entry->inner_class_access_flags = read16(reader);

        // Store pointers to related classes for easy retrieval later.
        item->related_class_info_indexes[item->related_class_info_count++] = entry->inner_class_info_index;
        if (entry->outer_class_info_index) {
          item->related_class_info_indexes[item->related_class_info_count++] = entry->inner_class_info_index;
        }
      }
    } else {
      // Ignore the rest.
      attribute_info* item = *attributes[j] = calloc(1, sizeof(attribute_info));
      item->attribute_name_index = attribute_name_index;
      item->attribute_length = attribute_length;
      *reader += attribute_length;
    }
  }
}

// Getters

uint16_t class_info_get_access_flags(class_info* info) {
  return info->access_flags;
}

uint16_t* class_info_get_class_name(class_info* info) {
  return ((cp_utf8*)info->cp[((cp_class*)info->cp[info->this_class])->name_index])->str;
}

uint16_t* class_info_get_super_class_name(class_info* info) {
  if (info->super_class) {
    return ((cp_utf8*)info->cp[((cp_class*)info->cp[info->super_class])->name_index])->str;
  } else {
    return NULL;
  }
}

uint16_t class_info_get_interfaces_count(class_info* info) {
  return info->interfaces_count;
}

uint16_t* class_info_get_interface_name(class_info* info, uint16_t index) {
  return ((cp_utf8*)info->cp[((cp_class*)info->cp[info->interfaces[index]])->name_index])->str;
}


attribute_inner_classes* _get_inner_classes_attribute(class_info* info) {
  for (uint16_t i = 0; i < info->attributes_count; i++) {
    attribute_info* ainfo = info->attributes[i];
    uint16_t* attribute_name = ((cp_utf8*)info->cp[ainfo->attribute_name_index])->str;
    if (jstrcmp(attribute_name, INNER_CLASSES_STRING) == 0) {
      return (attribute_inner_classes*)ainfo;
    }
  }
  return NULL;
}

uint16_t class_info_get_related_class_count(class_info* info) {
  attribute_inner_classes* attr = _get_inner_classes_attribute(info);
  if (attr) {
    return attr->related_class_info_count;
  } else {
    return 0;
  }
}

uint16_t* class_info_get_related_class_name(class_info* info, uint16_t index) {
  attribute_inner_classes* attr = _get_inner_classes_attribute(info);
  if (attr) {
    return ((cp_utf8*)info->cp[((cp_class*)info->cp[attr->related_class_info_indexes[index]])->name_index])->str;
  } else {
    return NULL;
  }
}


