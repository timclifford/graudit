import {
  ensureDirSync,
  readJson,
  readJsonSync,
  writeJsonSync,
} from "../deps.ts";
import { buildMutationQuery, buildQuery } from "../utils/build.ts";
import {
  flatten,
  getHostnameFromUrl,
  msToBetterFormattedTime,
} from "../utils/helpers.ts";
import isArray from "https://github.com/piyush-bhatt/is-array/raw/main/mod.ts";

import { cyan, green, white } from "../deps.ts";

import Spinner from "https://raw.githubusercontent.com/ameerthehacker/cli-spinners/master/mod.ts";
const spinner = Spinner.getInstance();

enum AttackType {
  query = "query",
  mutation = "mutation",
  template = "template",
}

export async function attackQuery(
  url: string, // GQL endpoint
  query?: string, // GQL query
  mutation?: string, // GQL mutation
  variables?: any, // JSON object contain variables
  payload?: any, // JSON file
  access_token?: any, // auth token
  output_dir?: string, // Directory to store results.
  verbose?: Boolean,
  format?: string,
) {
  // if (!query && !mutation) return "No query/mutation given";
  const hostname = getHostnameFromUrl(url);
  let endpoint = url ? url : "";

  ensureDirSync(`./report-${hostname}/attacks`);
  ensureDirSync("./payloads");

  const decoder = new TextDecoder("utf-8");
  let variables_payload: any = {};
  let gql_query: any;

  let results: any = [];

  const attack_payload: any = await readJsonSync(
    "./payloads/" + payload + ".json",
  );
  if (!attack_payload) return "No payload config found";

  let {
    operation_name,
    args,
    attack_placeholders,
    query_name,
    type,
    fields,
  } = attack_payload;


  if (attack_placeholders) {

    const attack_data = attack_placeholders && await getPayloadPlaceholderData(
      attack_placeholders,
      format,
    );
    const attack_type: AttackType = type;

    if (attack_data) {
      attack_data?.map(async (d: any) => {
        const { name, count_payload, attack_payload: payload } = d || 0;

        if (attack_type === "query") {
          gql_query = buildQuery(
            operation_name,
            query_name,
            args,
            fields,
            count_payload,
          );
          await Deno.writeTextFile(
            `./report-${hostname}/attacks/${operation_name}.gql`,
            gql_query.query_string,
          );
        } else if (attack_type === "mutation") {
          gql_query = buildMutationQuery(
            operation_name,
            query_name,
            args,
            fields,
            count_payload,
          );
          await Deno.writeTextFile(
            `./report-${hostname}/attacks/${operation_name}.gql`,
            gql_query.query_string,
          );
        }

        if (attack_type === "template") {
          // if running as 'template' - load query from payload
          gql_query = { query_string: payload };
        }

        for (var i = 0; i < count_payload; i++) {
          args?.map((a: any) => {
            let key = `${a?.name}${i}`;

            if (a?.value) {
              variables_payload[key] = a?.value;
            } else {
              for (let p in payload) {
                variables_payload[key] = payload[i];
              }
            }
          });
        }

        // Run attack
        results = await runAttack(
          endpoint,
          access_token,
          type,
          gql_query,
          variables_payload,
          attack_payload,
          attack_placeholders,
          output_dir,
          verbose,
          format,
        );

        return results;
      });
    }
  } 
  else {
    let query_gql: any = {};
    
    if (query_name) {
      query_gql = buildQuery(
        operation_name,
        query_name,
        args,
        fields,
        1
        );
      }
      
      if (!variables) {
        variables = {};
        const variablesArray = args?.map((arg: any, index: number) => {
          return { [`${arg.name}${index}`]: arg.value }
        })

        variables = variablesArray.reduce(
          (obj: Object, arg: any, index: number) => Object.assign(obj, { ...arg }), {});
     }

    const result = await fetch(
      endpoint,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "accept": "application/json",
          "Authorization": `Bearer ${access_token}`,
        },
        body: JSON.stringify({ query: query_gql.query_string, variables: variables }),
      },
    );

    const { data, errors } = await result.json();

    console.log(data);

    return { data, errors };
  }
}

export const runAttack = async (
  endpoint: string,
  access_token: string,
  type: AttackType,
  gql_query?: any,
  variables_payload?: {},
  attack_payload?: any,
  attack_placeholders?: any,
  output_dir?: string,
  verbose?: Boolean,
  format?: string,
  ) => {
  
  const hostname = getHostnameFromUrl(endpoint);
  let { operation_name } = attack_payload || null;
  // @TODO for now we use the first attack_placeholder type
  let { type: attack_placeholders_type, concurrent } = attack_placeholders[0] || null;

  // Run the attack
  try {
    if (format !== "json") {
      console.log("Attacking...");
    }
    let t0 = performance.now();

    let result: any;

    if (attack_placeholders_type === "dos") {
      let concurrent_fetches: number = concurrent || 3;

      if (format !== "json") {
        console.log(`Running ${concurrent} queries`);
      }

      result = await Promise.all(
        Array.from(Array(concurrent_fetches)).map((x: any) => {
          return fetch(
            endpoint,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Authorization": `Bearer ${access_token}`,
              },
              body: JSON.stringify({
                query: gql_query.query_string,
                variables: variables_payload,
              }),
            },
          ).catch((errors) => {
            console.log("-----");
            console.error(`Fetch errors: ${errors}`);
            console.log("-----");

            Deno.exit(1);
          });
        }),
      );
    } else {
      result = await fetch(
        endpoint,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": `Bearer ${access_token}`,
          },
          body: JSON.stringify({
            query: gql_query.query_string,
            variables: variables_payload,
          }),
        },
      );
    }

    const response = await result;
    if (response && response.status !== 200) {
      if (!isArray(response) && (format !== "json")) {
        console.log(`HTTP ${response.status}: " + ${response.statusText}`);
      }
    }

    let json: any;

    if (isArray(result)) {
      const results = result.map((r: any) => r.json());
      [json] = await Promise.all(results);
    } else {
      json = await result.json();
    }

    const { data, errors } = json || null;

    if (errors) {
      const extensions = errors?.map((e: any) => e.extensions ? e.extensions : null);

      if (format !== "json") {
        console.log("Exception found: ", extensions.slice(0, 2));
      }

      if (extensions[0] != null) {
        data.exception = { "exception_found": extensions.slice(0, 2) };
      }
      else {
        console.log(errors);
      }
    }

    if (data) {
      if (type !== "template") {
        const flatten_data = flatten(data);
        Object.keys(flatten_data)?.map((r: any, index: number) => {
          //@ts-ignore
          if (flatten_data[r] !== null) {
            //@ts-ignore
            let v: object = flatten_data[r];
            let key: number = r.substring(1).split(".")[0];

            if (typeof v !== "object" && format !== "json") {
              console.log(`--------------------------------`);
              console.log(white(`Found value on payload line:`), key);
              if (attack_payload && verbose) {
                // console.log(cyan(`${key}:`), green(attack_payload[key]));
              }
              console.log(cyan(`${r}:`), typeof v === "string" ? green(v) : v);
              console.log(`--------------------------------`);
            }
          }
        });
      }
      else {
        if (attack_placeholders_type === "dos") {
          console.log("DoS attack finished");
          console.log(data);
          // data.dos = data;

          await writeJsonSync(
            `./report-${hostname}/attacks/${operation_name}.results`,
            data,
            { spaces: 2 },
          );
        }
      }

      let t1 = performance.now();

      data.duration = "Attack finished and took " +
        msToBetterFormattedTime(t1 - t0) + " (" + (t1 - t0) + " ms).";

      if (format !== "json") {
        console.log(data.duration);
      } else {
        console.log(JSON.stringify(data, null, 2));
      }

      if (!output_dir) {
        await writeJsonSync(
          `./report-${hostname}/attacks/${operation_name}.results`,
          data,
          { spaces: 2 },
        );
      }
    }

    return data;
  } catch (error) {
    console.log(error);
  }
};

export async function getPayloadPlaceholderData(
  attack_placeholders: any,
  format: string | undefined,
) {
  const decoder = new TextDecoder("utf-8");

  const attack_data = await Promise.all(
    attack_placeholders?.map(async (p: any) => {
      let data = p?.type === "wordlist" || "fuzzing" || "dos"
        ? decoder.decode(await Deno.readFile(p?.path))
        : null;
      let match_pattern: any;
      let count_payload: number = 0;

      if (p?.type !== "dos") {
        if (data) {
          if (p?.match_pattern === "two_words") {
            match_pattern = data.split(/\n+/g).filter((w) => /[a-z0-9]/.test(w))
          } 
          else if (p?.match_pattern === "uuid" && p?.match_pattern_prefix !== null) {
            let values = data.split(/\n+/g).filter((v) => /[a-z0-9]/.test(v));
            
            match_pattern = values.map((v: any) => `${p?.match_pattern_prefix}${v}`);
          }
          else {
            match_pattern = data.split(/\s+/g).filter((w) => /[a-z0-9]/.test(w));
          }

          count_payload = p.match_pattern === "two_words"
            ? data.split(/\n+/g).filter((w) => /[a-z0-9]/.test(w)).length
            : countWords(data);

          if (format !== "json") {
            console.log(`${count_payload} entries found in dictionary`);
          }
        }
      } else {
        // dos attack data
        count_payload = 1;
      }

      return {
        name: p?.name,
        count_payload: count_payload,
        attack_payload: match_pattern ? match_pattern : data,
      };
    }),
  );

  return attack_data;
}

export function countWords(s: string): number {
  return s.split(/\s+/g).filter((w) => /[a-z0-9]/.test(w)).length;
}
