import {
  ensureDirSync,
  existsSync,
  readableStreamFromReader,
  readerFromStreamReader,
  readJsonSync,
} from "../../deps.ts";
import {
  flatten,
  flattenForNested,
  getHostnameFromUrl,
} from "../../utils/helpers.ts";
import isArray from "https://github.com/piyush-bhatt/is-array/raw/main/mod.ts";

import { JSONStream } from "../../utils/JSONstream.ts";

export async function checkForDeeplyNestedQueries(
  schema: any,
  url: string,
  verbose: boolean,
) {
  const hostname = getHostnameFromUrl(url);

  if (verbose) {
    console.log("Checking for deeply nested or cyclical queries...");
  }
  ensureDirSync(`./report-${hostname}`);

  // There will either be a single queries.json inside the report dir, or separate query-[name].json files
  // if the schema is particularly large.
  const doesQueriesJsonExist = existsSync(`./report-${hostname}/queries.json`);

  if (doesQueriesJsonExist) {
    console.log("Reading queries from queries.json");
    let queries_json: any = await readJsonSync(
      `./report-${hostname}/queries.json`,
    );

    // Queries being ran against
    if (verbose) {
      console.log(queries_json.map((q: any) => q.name));
    }

    const results = findNestedQueriesFromJson(queries_json);
    const hasNoNestedFields = results?.some((field: any) => !field?.results?.nested_fields_found.length)

    return !hasNoNestedFields ? results : false;
  } else {
    let queryFiles: string[] = [];
    for await (const dirEntry of Deno.readDir(`./report-${hostname}`)) {
      if (dirEntry.isFile && dirEntry.name.startsWith("query-")) {
        queryFiles.push(dirEntry.name);
      }
    }

    let results: any = await queryFiles?.map(async (f: any) => {
      const fullFilePath = `./report-${hostname}/${f}`;

      if (verbose) {
        console.log(`Reading query from ${fullFilePath}`);
      }

      return await new Promise((resolve, reject) => {
        const stream = new JSONStream(fullFilePath);

        stream.once("object", (chunk: any) => {
          resolve(findNestedQueriesFromJson([chunk]));
        });
      });
    });

    return await Promise.all(results)
      .then((results) => {
        let merged = results.length && results.flat(1);

        const hasNoNestedFields = merged?.every((field: any) => !field?.results?.nested_fields_found.length)
        return results.length > 0 && !hasNoNestedFields ? merged : false;
      })
      .catch((e) => {
        console.error(e);
      });
  }
}

const hasNestedFieldsInObject = (obj: any) => {
  return Object.keys(obj).some((t: any) => {
    if (obj[t] === null || isArray(obj[t]) || obj[t] === "") {
      return;
    }

    const fieldToString = obj[t].toString();

    return obj[t] && fieldToString?.indexOf("Deeply nested or cyclical object") !== -1;
  });
};

const findNestedQueriesFromJson: any = (json: any) => {
  let results = json?.map((query: any) => {
    let nested_fields_found: any = [];

    query?.type && isArray(query?.type) && query?.type?.map((type: any) => {
      // Flatten this so we can query for potentially cyclical values
      const flattened_types = flatten(type);
      const typeHasNested = hasNestedFieldsInObject(flattened_types);

      if (typeHasNested) {
        let filteredFields: any = [];
        if (typeof type?.field_type?._fields === "object") {
          filteredFields = filterFields(type?.field_type?._fields);
        }

        nested_fields_found.push({
          results: [{
            "query": query?.name,
            "name": type?.field_name,
            "args": type?.field_args,
            "fields": filteredFields,
          }],
          flattened: flattenForNested(type, query?.name, "."),
        });
      }
    });

    return {
      results: {
        query: query?.name,
        nested_fields_found: nested_fields_found,
      },
    };
  });

  return results;
};

export const filterFields: any = (fields: any) => {
  let filtered = Object.keys(fields).map((f) => {
    if (typeof fields[f] === "object") {
      if (fields[f]?.type && isArray(fields[f]?.type)) {
        return (fields[f]?.type && isArray(fields[f]?.type))
          ? filterFields(fields[f])
          : fields[f];
      } else {
        return typeof fields[f] === "object" ? fields[f] : null;
      }
    }

    return null;
  });

  return filtered && filtered.filter((f: any) => {
    if (f === null || f.length === 0) return;
    return f != f.length > 0;
  });
};
