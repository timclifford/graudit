import Denomander from "https://deno.land/x/denomander/mod.ts";
import { existsSync, readJsonSync } from "./deps.ts";
import { build, scan } from "./src/lib.ts";
import { attackQuery } from "./src/attack.ts";
import { bruteForceJWT } from "./src/jwtAttack.ts";

const program = new Denomander(
  {
    app_name: "graudit",
    app_description: "GraphQL Auditing CLI",
    app_version: "1.0.0",
    errors: {
      INVALID_RULE: "Invalid Rule",
      OPTION_NOT_FOUND: "Option not found!",
      COMMAND_NOT_FOUND: "Command not found!",
      REQUIRED_OPTION_NOT_FOUND: "Required option is not specified!",
      REQUIRED_VALUE_NOT_FOUND: "Required command value is not specified!",
      TOO_MANY_PARAMS: "You have passed too many parameters",
      OPTION_CHOICE: "Not an allowed choice.",
    },
  },
);

interface GrauditConfig {
  access_token?: string;
  sensitive_fields?: string[];
  headers?: Object
}

const findConfigFile = async (path: string, verbose: boolean) => {
  const doesConfigPathJsonExist = existsSync(path);
  if (!doesConfigPathJsonExist) {
    throw Error("Config path doesn't exist");
  }

  if (verbose) {
    console.log(`Reading config from ${path}`);
  }
  const config: any = await readJsonSync(path);

  if (verbose) {
    console.log(config);
  }

  return {
    access_token: config.access_token ? config.access_token : "",
    headers: config.headers ? config.headers: {}
  };
};

export function parseVariables(value: string): any {
  return JSON.parse(value);
}

async function graudit() {
  program
    .globalOption(
      "-c, --config",
      "Define the path of a config json file - e.g. 'graudit.config.json'",
    )
    .globalOption(
      "-m, --minimal",
      "Minimise the size of the build output - useful for when depth is large or API is extensive",
    )
    .globalOption("-f, --format", "Format the output")
    .globalOption("-v, --verbose", "Show verbose output");
  // .globalOption("-c, --color", "Define the output colour");

  program
    .command(
      "build",
      "Build and store queries, mutations and subscriptions for analysis to file",
    )
    .option("-u, --url", "Define the GQL endpoint")
    .option("-t, --token", "Define access token")
    .option("-d, --depth", "Define depth limits - default is '4' deep")
    .action(async () => {
      let config: GrauditConfig = {};
      if (program.config) {
        config = await findConfigFile(program.config, program.verbose);
      }

      const depth = program.depth || 4;

      let result: any;
      if (config) {
        result = await build(
          program.url,
          config.access_token || program.token,
          depth,
          program.verbose,
          program.minimal,
          config.headers || {}
        );
      } else {
        result = await build(
          program.url,
          program.token,
          depth,
          program.verbose,
          program.minimal
        );
      }

      console.log(result);
    });

  program
    .command("attack", "Run an attack")
    .requiredOption("-u --url", "Define the GQL endpoint")
    .option("-q --query", "Define the query")
    .option("-m --mutation", "Define the mutation")
    .option(
      "-V --variables",
      'Parse variables as json - e.g. -v \'{"limit": "10", "order": "asc"}\' ',
      parseVariables,
    )
    .option("-p --payload", "Dump variables payload")
    .option("-t, --token", "Define access token")
    .option("-o, --output", "Define output directory")
    .action(async () => {
      let config: GrauditConfig = {};
      if (program.config) {
        config = await findConfigFile(program.config, program.verbose);
      }

      const attack_results: any = await attackQuery(
        program.url,
        program.query,
        program.mutation,
        program.variables,
        program.payload,
        config ? config.access_token : "",
        program.output,
        program.verbose,
        program.format,
      );
    });

  program
    .command("scan", "Scan endpoint")
    .option("-u, --url", "Define the GQL endpoint")
    .option("-t, --token", "Define access token")
    .action(async () => {
      let config: GrauditConfig = {};
      if (program.config) {
        config = await findConfigFile(program.config, program.verbose);
      }

      let result: any;
      if (config) {
        result = await scan(program.url, config?.access_token, program.verbose,  config?.headers || {});
      } else {
        result = await scan(program.url, "", program.verbose);
      }

      if (program.format === "json") {
        console.log(JSON.stringify(result));
      } else {
        console.log(result);
      }
    });

  program
    .command("jwt-attack", "Brute force weak JWT tokens")
    .requiredOption("-t --token", "Define HS256 token to crack")
    .option("-p --pattern", "Define the pattern to be used for the dictionary")
    .option("-l --length", "Define the max length of the digest")
    .option("-o, --output", "Define output directory for results")
    .action(async () => {
      let config: GrauditConfig = {};
      if (program.config) {
        config = await findConfigFile(program.config, program.verbose);
      }

      const results: any = await bruteForceJWT(
        program.token,
        program.pattern,
        program.length,
        program.output,
        program.verbose,
        program.format,
      );
    });

  try {
    program.parse(Deno.args);
  } catch (error) {
    console.log(error);
  }
}

graudit();
