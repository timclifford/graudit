import {
  ensureDirSync,
  readJson,
  readJsonSync,
  writeJsonSync,
} from "../deps.ts";
import {
  fetchIntrospection,
  getIntrospectionQuery,
} from "../utils/introspection.ts";
import {
  findNestedFields,
  flatten,
  getHostnameFromUrl,
} from "../utils/helpers.ts";
import { buildClientSchema } from "../deps.ts";
import { checkForDeeplyNestedQueries } from "./checks/nested_queries.ts";
import {
  checkForStringInputs,
  printStringInputsResults,
} from "./checks/string_inputs.ts";
import { checkForGQLConsoles } from "./checks/check_consoles.ts";
import { checkForIntrospection } from "./checks/check_introspection.ts";
import { checkForSSLConnection } from "./checks/check_ssl_connection.ts";
import { checkForNullableTypes } from "./checks/check_null_types.ts";
import { checkForJSONInputs } from "./checks/check_JSON_inputs.ts";
import { findSensitiveFields } from "./checks/sensitive_fields.ts";
import { findMutationsThatAreBruteForceable } from "./checks/check_brute_forceable.ts";

import Spinner from "https://raw.githubusercontent.com/ameerthehacker/cli-spinners/master/mod.ts";
const spinner = Spinner.getInstance();

export const PASS = "PASS";
export const FAIL = "FAIL";
export const WARNING = "WARNING";

export interface Stats {
  passes?: number;
  fails?: number;
  warnings?: number;
  errors?: number;
  results?: CheckResults;
  http_headers?: Headers | null;
  format?: string;
}

export interface SensitiveFields {
  results: Object;
  type: string;
}
export interface CheckResults {
  introspection: Object;
  ssl_check: Object | string;
  nested_queries: Object;
  sensitive_fields: Object | SensitiveFields;
  brute_forceable_mutations: Object;
  string_inputs: Object;
  nullable_types: Object;
  json_inputs: Object;
  graphql_consoles: Object;
}

export async function scan(
  url: any,
  access_token?: any,
  verbose: boolean = false,
  headers?: Object
) {
  let scanned_stats: Stats = {
    passes: 0,
    fails: 0,
    warnings: 0,
    errors: 0,
    format: "json",
  };

  // Headers
  const endpointRes = await fetch(url).catch((error: any) =>
    console.log(error)
  );

  const introspection = await fetchIntrospection(url, access_token, verbose, headers);
  const schema = buildClientSchema(introspection);

  // Run checks
  let results: CheckResults = await runAllChecks(
    schema,
    introspection,
    url,
    access_token,
    verbose,
  );
  if (results) {
    let passes = Object.keys(results).filter((r: any) => {
      return results[r as keyof CheckResults] === "PASS";
    });
    let warnings = Object.keys(results).filter((r: any) => {
      let result: any = results[r as keyof CheckResults];
      return result.type === "WARNING";
    });
    let fails = Object.keys(results).filter((r: any) => {
      //@ts-ignore
      return (results[r]?.type !== "WARNING" && typeof results[r as keyof CheckResults] === "object");
    });

    scanned_stats.passes = passes.length;
    scanned_stats.fails = fails.length;
    scanned_stats.warnings = warnings.length;
    scanned_stats.results = results;
    scanned_stats.http_headers = endpointRes ? endpointRes.headers : null;
  }

  // Render results in a report
  await renderReport(scanned_stats, url);

  return results;
}

// Run all checks
export async function runAllChecks(
  schema: any,
  introspection: JSON,
  url: string,
  access_token: string,
  verbose: boolean,
) {
  let [
    introspection_check,
    ssl_check,
    sensitive_fields,
    brute_forceable_mutations,
    nested_queries_results,
    string_inputs_check,
    graphql_consoles,
    nullable_types,
    json_inputs,
  ] = await Promise.all([
    // Check if introspection is enabled
    checkForIntrospection(url, access_token, verbose),
    // Check for SSL/HTTPS
    checkForSSLConnection(url, access_token, verbose),
    // Check for sensitive fields
    findSensitiveFields(url, access_token, verbose),
    // Check if mutations are brute-forceable
    findMutationsThatAreBruteForceable(url, access_token, verbose),
    // Check nested Objects
    checkForDeeplyNestedQueries(schema, url, verbose),
    // Check for string inputs
    checkForStringInputs(schema, verbose),
    // Check for other graphQL instances running on domain
    checkForGQLConsoles(url, verbose),
    // Check nullable types
    checkForNullableTypes(introspection, verbose),
    // Check JSON inputs
    checkForJSONInputs(introspection, schema, verbose),
  ]);

  let string_inputs_results = await printStringInputsResults(
    string_inputs_check,
    verbose,
  );

  return {
    "introspection": typeof introspection_check === "object" ? introspection_check : PASS,
    "ssl_check": ssl_check ? ssl_check : PASS,
    "sensitive_fields": sensitive_fields ? sensitive_fields : PASS,
    "brute_forceable_mutations": brute_forceable_mutations ? brute_forceable_mutations : PASS,
    "nested_queries": nested_queries_results ? nested_queries_results : PASS,
    "string_inputs": string_inputs_check ? string_inputs_results : PASS,
    "graphql_consoles": graphql_consoles ? graphql_consoles : PASS,
    "nullable_types": nullable_types ? nullable_types : PASS,
    "json_inputs": json_inputs ? json_inputs : PASS,
  };
}

export async function renderReport(scanned_stats: any, url: string) {
  const hostname = getHostnameFromUrl(url);

  ensureDirSync(`./report-${hostname}`);
  const { pass, fails, warnings, errors, http_headers, results } =
    await scanned_stats;
  const {
    introspection,
    ssl_check,
    nested_queries,
    string_inputs,
    sensitive_fields,
    brute_forceable_mutations,
    graphql_consoles,
    nullable_types,
    json_inputs,
  } = await results;

  let i, j, tempArr: any, chunk = 1;

  for (i = 0, j = results.length; i < j; i += chunk) {
    tempArr = results.slice(i, i + chunk);
    await Deno.writeTextFileSync(
      `./report-${hostname}/report-results.json`,
      JSON.stringify(tempArr),
    );
  }

  const ResultRows = () => {
    let rows = Object.keys(scanned_stats.results).filter((r: any) => r)?.map((
      s: any,
    ) => (
      `<tr>
        <td>${s}</td>
        <td>${
        scanned_stats.results[s].type === "WARNING"
          ? scanned_stats?.results[s].type
          : (typeof scanned_stats?.results[s] === "string")
          ? "PASS"
          : "FAIL"
      }</td>
      </tr>`
    )).toString();

    return rows.replace(/,/g, "");
  };

  const HTTPHeaders = () => {
    if (http_headers !== null) {
      let headers_summary: string = "";

      headers_summary += `<summary>HTTP headers</summary>`;
      for (var pair of http_headers.entries()) {
        headers_summary += `<pre>${pair[0]}: ${pair[1]}</pre>`;
      }

      return `
        <details>
          ${headers_summary}
        </details>`;
    }
  };

  const IntrospectionEnabled = () => {
    let rows = introspection !== "PASS" && introspection?.map((r: any) => (
      `<pre>${r.result}</pre>`
    )).toString();

    return rows || `<pre>PASS</pre>`;;
  };

  const SSLCheck = () => {
    let rows = ssl_check !== "PASS" && ssl_check?.map((r: any) => (
      `<pre>${r.fail}</pre>`
    )).toString();

    return rows || `<pre>PASS</pre>`;;
  };

  const SensitiveFields = () => {
    let rows = sensitive_fields != "PASS" &&
      sensitive_fields.results?.map((f: any) => {      
        return (
          f && f.length !== 0
            ? `<details>
          <summary>${f.query ? f.query : f.mutation}</summary>
          ${
              f.sensitive_field?.map((results: any) => {
                return (
                  `<pre>${JSON.stringify(results, null, 2)}</pre>`
                );
              })
            }
        </details>`
            : ""
        );
      }).toString();

    return rows && rows.replace(/,/g, "") || `<pre>PASS</pre>`;
  };

  const BruteForceableMutations = () => {
    let rows = brute_forceable_mutations != "PASS" &&
      brute_forceable_mutations?.results?.map((m: any) => {      
        return (
          m && m.length !== 0
            ? `<pre>${JSON.stringify(m, null, 2)}</pre>`
            : ""
        );
      }).toString();

    return rows && rows.replace(/,/g, "") || `<pre>PASS</pre>`;
  };

  const GraphQLConsoles = () => {
    let rows = graphql_consoles != "PASS" &&
      graphql_consoles.results?.map((c: any) => {
        if (c.status !== 404) {
          return (
            `<details>
          <summary>${c.path}</summary>
          <pre>${JSON.stringify(c, null, 2)}</pre>
        </details>`
          );
        }
      }).toString();

    return rows && rows.replace(/,/g, "") || `<pre>PASS</pre>`;
  };

  const NullableTypes = () => {
    let rows = nullable_types != "PASS" && nullable_types?.map((t: any) => {
      return (
        `<details>
          <summary>${t.query_type}: ${t.query}</summary>
          <pre>${JSON.stringify(t, null, 2)}</pre>
        </details>`
      );
    }).toString();

    return rows && rows.replace(/,/g, "") || `<pre>PASS</pre>`;
  };

  const JSONInputs = () => {
    let rows = json_inputs != "PASS" && json_inputs?.map((i: any) => {
      return (
        `<details>
          <summary>${i.query_type ? i.query_type : i.name}: ${i.query ? i.query : ""}</summary>
          <pre>${JSON.stringify(i, null, 2)}</pre>
        </details>`
      );
    }).toString();

    return rows && rows.replace(/,/g, "") || `<pre>PASS</pre>`;
  };

  const NestedQueries = () => {
    let nestedQueriesString = `<div class="collapse-list">`;

    nestedQueriesString += nested_queries != "PASS" ?
      nested_queries?.map((q: any, index: number) => {
        return (
          q.results.nested_fields_found.length !== 0
            ? `<details>
          <summary>${q.results.query}</summary>
          ${
              q.results.nested_fields_found?.map(
                (results: any, result_index: number) => {
                  return (
                    `<pre>${JSON.stringify(results?.flattened)}</pre>
              <div id="results-${index}-${result_index}"></div>`
                  );
                },
              )
            }
        </details>`
            : ""
        );
      }).toString() : `<pre>PASS</pre>`;

    nestedQueriesString += `</div>`;

    return nestedQueriesString && nestedQueriesString.replace(/,/g, "");
  };

  const StringInputs = () => {
    let rows = string_inputs != "PASS" && string_inputs?.map((s: any) => {
      return (
        `<details>
          <summary>${JSON.stringify(s.arg, null, 2)} - (${
          JSON.stringify(s.field, null, 2)
        })</summary>
            <pre>field: ${JSON.stringify(s.field, null, 2)}</pre>
            <pre>query_type: ${JSON.stringify(s.query_type, null, 2)}</pre>
            <pre>type: ${JSON.stringify(s.type, null, 2)}</pre>
            <pre>arg: ${JSON.stringify(s.arg, null, 2)}</pre>
        </details>`
      );
    }).toString();

    return rows && rows.replace(/,/g, "") || `<pre>PASS</pre>`;
  };

  let html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <title>Report</title>
    <link rel="stylesheet" href="https://fonts.xz.style/serve/inter.css">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@exampledev/new.css@1.1.2/new.min.css">
    <link rel="stylesheet" href="https://newcss.net/theme/terminal.css">

    <link rel="stylesheet" type="text/css" href="../static/report.css"/>
  </head>
  <body>
    <div>
      <h1>Report</h1>
      <p>Results from the scan on: <a href="${url}">${url}</a></p>
      ${HTTPHeaders()}

      <blockquote>
        <h3>Summary</h3>
        <p>Passes: ${scanned_stats.passes}</p>
        <p>Warnings: ${scanned_stats.warnings}</p>
        <p>Fails: ${scanned_stats.fails}</p>
      </blockquote>

      <div>
        <table class="results">
          <thead class="table-head">
            <tr>
              <th class="text-left">Check</th>
              <th class="text-left">Result</th>
            </tr>
          </thead>
          <tbody class="text-center">
            ${ResultRows()}
          </tbody>
        </table>
      </div>

      <h2>SSL/HTTPS Check</h2>
      <p>Check whether the endpoint is using secure TLS</p>
      ${SSLCheck()}

      <h2>Nested queries</h2>
      ${NestedQueries()}
      ${nested_queries != "PASS" ?
      `<p>Mitigation: Heavily nested fields were found in some queries. It is recommended that you revise these queries to add complexity analysis and query depth limiting.</p>` : ''}

      <h2>Introspection check</h2>
      <p>GraphQL is introspective which allows its schema to be self-documenting if enabled. The risk here is that it may leak sensitive information which was intended to remain private.</p>
      ${IntrospectionEnabled()}

      <h2>Sensitive/Personal data check</h2>
      <p>You may want to check the following sensitive or PII that has been discovered. They may have ended up in certain query responses unexpectedly due to access control/permission misconfigurations.</p>
      ${SensitiveFields()}

      <h2>Brute-forceable Mutations</h3>
      <p>These mutations could be vulnerable to batch-querying brute-force attacks</p>
      ${BruteForceableMutations()}
      
      <h2>Graphql consoles found</h2>
      ${GraphQLConsoles()}

      <h2>JSON inputs</h2>
      <p>JSON input arguments in queries are typically prone to SQL/NoSQL attacks if left unsanitised. Please check you have properly santised these inputs.</p>
      ${JSONInputs()}

      <h2>Nullable types</h2>
      <p></p>
      ${NullableTypes()}

      <div>
        <h2>String inputs</h2>
        ${StringInputs()}
      </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/renderjson@1.4.0/renderjson.min.js"></script>
    <script>
      ${nested_queries !== "PASS" &&
      nested_queries?.map((q: any, index: number) => {
        return (
          q.results.nested_fields_found.length !== 0
            ? q.results.nested_fields_found?.map(
              (results: any, result_index: number) => {
                return (
                  `document.getElementById("results-${index}-${result_index}").appendChild(renderjson.set_icons('+', '-').set_show_to_level(4)(${
                    JSON.stringify(results.results)
                  }));`
                );
              },
            ).join("")
            : ""
        );
      }).join("")}
    </script>
  </body>
</html>`;
  
  await Deno.writeTextFile(`./report-${hostname}/report.html`, html);
}
