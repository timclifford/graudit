import {
  ensureDirSync,
  exists,
  readJson,
  readJsonSync,
  writeJsonSync,
} from "../deps.ts";
import { buildClientSchema, printSchema } from "../deps.ts";
import { getHostnameFromUrl } from "./helpers.ts";

import Spinner from "https://raw.githubusercontent.com/ameerthehacker/cli-spinners/master/mod.ts";
const spinner = Spinner.getInstance();

export type IntrospectionOptions = {
  descriptions?: boolean;
  specifiedByUrl?: boolean;
  directiveIsRepeatable?: boolean;
  schemaDescription?: boolean;
};

export function getIntrospectionQuery(options?: IntrospectionOptions): string {
  const optionsWithDefault = {
    descriptions: true,
    specifiedByUrl: false,
    directiveIsRepeatable: false,
    schemaDescription: false,
    ...options,
  };

  const descriptions = optionsWithDefault.descriptions ? "description" : "";
  const specifiedByUrl = optionsWithDefault.specifiedByUrl
    ? "specifiedByUrl"
    : "";
  const directiveIsRepeatable = optionsWithDefault.directiveIsRepeatable
    ? "isRepeatable"
    : "";
  const schemaDescription = optionsWithDefault.schemaDescription
    ? descriptions
    : "";

  return `
    query IntrospectionQuery {
      __schema {
        ${schemaDescription}
        queryType { name }
        mutationType { name }
        subscriptionType { name }
        types {
          ...FullType
        }
        directives {
          name
          ${descriptions}
          ${directiveIsRepeatable}
          locations
          args {
            ...InputValue
          }
        }
      }
    }

    fragment FullType on __Type {
      kind
      name
      ${descriptions}
      ${specifiedByUrl}
      fields(includeDeprecated: true) {
        name
        ${descriptions}
        args {
          ...InputValue
        }
        type {
          ...TypeRef
        }
        isDeprecated
        deprecationReason
      }
      inputFields {
        ...InputValue
      }
      interfaces {
        ...TypeRef
      }
      enumValues(includeDeprecated: true) {
        name
        ${descriptions}
        isDeprecated
        deprecationReason
      }
      possibleTypes {
        ...TypeRef
      }
    }

    fragment InputValue on __InputValue {
      name
      ${descriptions}
      type { ...TypeRef }
      defaultValue
    }

    fragment TypeRef on __Type {
      kind
      name
      ofType {
        kind
        name
        ofType {
          kind
          name
          ofType {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
                ofType {
                  kind
                  name
                  ofType {
                    kind
                    name
                  }
                }
              }
            }
          }
        }
      }
    }
  `;
}

export async function fetchIntrospection(
  url: string,
  access_token: string,
  verbose: boolean = false,
  headers?: Object
) {
  if (!url) return "No url given";

  const hostname = getHostnameFromUrl(url);
  let endpoint = url ? url : "";
  spinner.start("Checking for introspection...");

  if (access_token && verbose) {
    console.log(`Using access token: ${access_token}`);
  }
  if (headers && verbose) {
    console.log('Headers added: ', headers);
  }

  let introspectionHeaders =  {
    "Content-Type": "application/json",
    "Authorization": access_token ? `Bearer ${access_token}` : "",
    "Access-Control-Allow-Methods": "OPTIONS, GET, POST, PUT, PATCH, DELETE",
    "Accept": "application/json, text/plain, */*",
    "Access-Control-Allow-Origin": "*"
  };

  if (headers) {
    introspectionHeaders = { ...introspectionHeaders, ...headers }
  }

  try {
    const introspection = await fetch(
      endpoint,
      {
        method: "POST",
        headers: introspectionHeaders,
        redirect: "manual",
        body: JSON.stringify({ query: getIntrospectionQuery() }),
      },
    );

    //debug
    if (verbose) {
      console.log('\nRequest headers: ', introspectionHeaders);
      console.log("\nIntrospection response: ", introspection);
    }

    check:
    if (!introspection.ok) {
      if (introspection.status.toString().startsWith("3")) {
        break check;
      }
      throw introspection;
    }

    spinner.setText("Found introspection");
    spinner.stop();

    if (!exists(`./report-${hostname}`)) {
      spinner.setText(`Adding report-${hostname} directory`);
    }
    ensureDirSync(`./report-${hostname}`);

    //debug
    if (verbose) {
      // console.log('DEBUG Introspection JSON: ', await introspection.json());
    }

    const { data, errors } = await introspection.json();

    if (errors) {
      throw new Error(JSON.stringify(errors, null, 2));
    }
    await writeJsonSync(`./report-${hostname}/introspection.json`, data, {
      spaces: 2,
    });

    const schema = buildClientSchema(data);
    await writeJsonSync(`./report-${hostname}/schema.json`, schema, {
      spaces: 2,
    });
    // Write schema to file (schema in IDL syntax)
    await Deno.writeTextFile(
      `./report-${hostname}/schema.gql`,
      printSchema(schema),
    );

    return data;
  } catch (error) {
    spinner.setText(`Not found introspection`);
    spinner.stop();

    if (error instanceof Response) {
      switch (error.status) {
        case 400:
            throw `${error?.statusText} (${error?.status}): Introspection may have been disabled`
        case 403:
          throw `${error?.statusText} (${error
            ?.status}): There is an authorisation issue whilst attempting to find the introspection for '${error
            ?.url}'. Please check given access token.`;

        case 302:
          throw `${error?.statusText} (${error
            ?.status}): Temp redirect occurred`;

        default:
          throw `Unknown error occurred: (Error ${error
            ?.status}): ${error.statusText}`;
      }
    }
  }
}

export async function getSchemaFromIntrospectionData(url: string) {
  const hostname = getHostnameFromUrl(url);

  if (!exists(`./report-${hostname}/introspection.json`)) {
    throw new Error("Introspection is missing");
  }
  const data: any = await readJsonSync(
    `./report-${hostname}/introspection.json`,
  );

  return buildClientSchema(data);
}

export async function getSchemaFromFile(url: string) {
  const hostname = getHostnameFromUrl(url);

  if (!exists(`./report-${hostname}/schema.json`)) {
    throw new Error("Schema is missing");
  }
  const schema: any = await readJsonSync(`./report-${hostname}/schema.json`);

  return schema;
}
