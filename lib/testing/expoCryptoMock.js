function getRandomBytes(byteLength) {
  const bytes = new Uint8Array(byteLength);
  for (let index = 0; index < byteLength; index += 1) {
    bytes[index] = (index * 17) % 256;
  }
  return bytes;
}

module.exports = { getRandomBytes };
