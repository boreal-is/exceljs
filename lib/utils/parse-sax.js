const {SaxesParser} = require('saxes');
const {bufferToString} = require('./browser-buffer-decode');

/**
 * Finds the last complete UTF-8 character boundary in a buffer.
 * This prevents splitting multibyte characters across chunks.
 * @param {Buffer} buffer - The buffer to analyze
 * @returns {number} - The length of complete UTF-8 characters (0 to buffer.length)
 */
/* eslint-disable no-bitwise */
function findLastCompleteUtf8Boundary(buffer) {
  // UTF-8 bit patterns for readability
  const UTF8_CONTINUATION_BYTE = 0x80; // 10000000 - continuation byte
  const UTF8_START_BYTE = 0x40; // 01000000 - start of multibyte sequence

  let completeLength = buffer.length;
  let i = buffer.length - 1;

  // Look for the start of a UTF-8 sequence by going backwards
  // Skip continuation bytes (10xxxxxx) to find the start byte
  while (i >= 0 && buffer[i] & UTF8_CONTINUATION_BYTE && !(buffer[i] & UTF8_START_BYTE)) {
    i--;
  }

  // If we found a potential start of a multibyte sequence
  if (i >= 0 && buffer[i] & UTF8_CONTINUATION_BYTE) {
    const startByte = buffer[i];
    let expectedLength = 0;

    // UTF-8 start byte patterns:
    // 110xxxxx = 2-byte sequence (0xC0-0xDF)
    // 1110xxxx = 3-byte sequence (0xE0-0xEF)
    // 11110xxx = 4-byte sequence (0xF0-0xF7)
    if ((startByte & 0xe0) === 0xc0) expectedLength = 2;
    else if ((startByte & 0xf0) === 0xe0) expectedLength = 3;
    else if ((startByte & 0xf8) === 0xf0) expectedLength = 4;

    // If the sequence is incomplete, don't process it yet
    if (expectedLength > 0 && i + expectedLength > buffer.length) {
      completeLength = i;
    }
  }

  return completeLength;
}
/* eslint-enable no-bitwise */

module.exports = async function* (iterable) {
  const saxesParser = new SaxesParser();
  let error;
  saxesParser.on('error', err => {
    error = err;
  });
  let events = [];
  saxesParser.on('opentag', value => events.push({eventType: 'opentag', value}));
  saxesParser.on('text', value => events.push({eventType: 'text', value}));
  saxesParser.on('closetag', value => events.push({eventType: 'closetag', value}));

  // Buffer to handle partial UTF-8 sequences
  let buffer = Buffer.alloc(0);

  for await (const chunk of iterable) {
    // Convert chunk to Buffer if it's a string
    const chunkBuffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8');
    // Append new chunk to buffer
    buffer = Buffer.concat([buffer, chunkBuffer]);

    // Find the last complete UTF-8 character boundary
    const completeLength = findLastCompleteUtf8Boundary(buffer);

    // Process only the complete part
    if (completeLength > 0) {
      const completeChunk = buffer.subarray(0, completeLength);
      const remainingChunk = buffer.subarray(completeLength);

      saxesParser.write(bufferToString(completeChunk));
      // saxesParser.write and saxesParser.on() are synchronous,
      // so we can only reach the below line once all events have been emitted
      if (error) throw error;
      // As a performance optimization, we gather all events instead of passing
      // them one by one, which would cause each event to go through the event queue
      yield events;
      events = [];

      // Keep the remaining incomplete part for the next iteration
      buffer = remainingChunk;
    }
  }

  // Process any remaining buffer at the end
  if (buffer.length > 0) {
    saxesParser.write(bufferToString(buffer));
    if (error) throw error;
    yield events;
  }
};
