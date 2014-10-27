TARGET=asmjvm.js
CC=emcc
CFLAGS=-g -Wall -s EXPORTED_FUNCTIONS="[]" -s NO_EXIT_RUNTIME=1

.PHONY: clean all default

default: $(TARGET)
all: default

OBJECTS = $(wildcard *.c)

$(TARGET): $(OBJECTS)
	$(CC) $(OBJECTS) $(CFLAGS) -o $@

clean:
	rm -f $(TARGET).map
	rm -f $(TARGET)

