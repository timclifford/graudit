// Check if connection is SSL/HTTPS secure.
export async function checkForSSLConnection(
  url: string,
  access_token: string,
  verbose: boolean,
) {
  if (!url) return "No endpoint given";

  const protocol = new URL(url).protocol;
  const isHTTPS: Boolean = protocol === "https:" ? true : false;

  return !isHTTPS ? [{ fail: "FAIL" }] : "PASS";
}
