import {
  ensureDirSync,
  readableStreamFromReader,
  readerFromStreamReader,
  readJsonSync,
} from "../../deps.ts";
import { getHostnameFromUrl } from "../../utils/helpers.ts";

const sensitive_fields: string[] = [
  "password",
  "pass",
  "token",
  "ssh_key",
  "ssh_private_key",
  "api_key",
  "recent_heart_events",
];

export async function findSensitiveFields(
  url: string,
  access_token: string,
  verbose: boolean,
) {
  if (verbose) {
    console.log("Checking for sensitive fields...");
  }
  const hostname = getHostnameFromUrl(url);

  ensureDirSync(`./report-${hostname}/query`);
  ensureDirSync(`./report-${hostname}/mutation`);

  let queryFiles: string[] = [];
  let mutationFiles: string[] = [];

  for await (const dirEntry of Deno.readDir(`./report-${hostname}/query`)) {
    if (dirEntry.isFile && dirEntry.name.endsWith("gql")) {
      queryFiles.push(dirEntry.name);
    }
  }

  for await (const dirEntry of Deno.readDir(`./report-${hostname}/mutation`)) {
    if (dirEntry.isFile && dirEntry.name.endsWith("gql")) {
      mutationFiles.push(dirEntry.name);
    }
  }

  const decoder = new TextDecoder("utf-8");

  let queryResults: any = await queryFiles?.map(async (f: any) => {
    const fullFilePath = `./report-${hostname}/query/${f}`;

    if (verbose) {
      console.log(`Reading query from ${fullFilePath} for sensitive fields`);
    }

    const file = await Deno.open(fullFilePath);

    const r = readableStreamFromReader(file);
    const reader = await r.getReader().read();
    const decodedQueryString = decoder.decode(reader.value);

    const sensitive_fields_found = sensitive_fields.filter((f) => {
      return decodedQueryString.includes(f);
    });

    file.close();

    return sensitive_fields_found.length > 0 && {
      "query": f,
      "sensitive_field": sensitive_fields_found,
    };
  });

  let mutationResults: any = await mutationFiles?.map(async (f: any) => {
    const fullFilePath = `./report-${hostname}/mutation/${f}`;

    if (verbose) {
      console.log(`Reading mutation from ${fullFilePath}`);
    }

    const file = await Deno.open(fullFilePath);

    const r = readableStreamFromReader(file);
    const reader = await r.getReader().read();
    const decodedQueryString = decoder.decode(reader.value);

    const sensitive_fields_found = sensitive_fields.filter((f) => {
      return decodedQueryString.includes(f);
    });

    file.close();

    return sensitive_fields_found.length > 0 && {
      "mutation": f,
      "sensitive_field": sensitive_fields_found,
    };
  });

  return await Promise.all([...queryResults, ...mutationResults])
    .then((results) => {
      const filterResults = results.filter((f) => f);

      return results.length > 0
        ? { results: filterResults, type: "WARNING" }
        : false;
    })
    .catch((e) => console.error(e));
}
