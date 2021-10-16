export function validateUrlEndpoint(url) {
  if (!url) {
    console.error(
      `No url has been given.`,
    );
    return false;
  }
  return true;
}
