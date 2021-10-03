import {
  fetchIntrospection,
  getIntrospectionQuery,
} from "../../utils/introspection.ts";

export async function checkForIntrospection(
  url: string,
  access_token: string,
  verbose: boolean,
  headers?: Object
) {
  if (verbose) {
    console.log("Checking for introspection...");
  }

  const introspection = await fetchIntrospection(url, access_token, verbose, headers);

  let result;
  if (typeof introspection !== "object") {
    result = introspection;
  } else {
    result = [{
      result: "Introspection found",
    }];
  }

  return result;
}
