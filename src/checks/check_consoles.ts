import { urlParse } from "https://deno.land/x/url_parse/mod.ts";

export interface GQLConsole {
  status: number;
  path: string;
  statusText: string;
}

export async function checkForGQLConsoles(url: string, verbose: boolean) {
  if (verbose) {
    console.log("Checking for further GQL console instances running...");
  }

  const parsedUrl = urlParse(url);
  const console_list: string[] = [
    "/altair",
    "/explorer",
    "/graphiql",
    "/graphiql.css",
    "/graphiql/finland",
    "/graphiql.js",
    "/graphiql.min.css",
    "/graphiql.min.js",
    "/graphiql.php",
    "/graphql",
    "/graphql/console",
    "/graphql-explorer",
    "/graphql.php",
    "/graphql/schema.json",
    "/graphql/schema.xml",
    "/graphql/schema.yaml",
    "/playground",
    "/subscriptions",
    "/api/graphql",
    "/graph",
    "/v1/altair",
    "/v1/explorer",
    "/v1/graphiql",
    "/v1/graphiql.css",
    "/v1/graphiql/finland",
    "/v1/graphiql.js",
    "/v1/graphiql.min.css",
    "/v1/graphiql.min.js",
    "/v1/graphiql.php",
    "/v1/graphql",
    "/v1/graphql/console",
    "/v1/graphql-explorer",
    "/v1/graphql.php",
    "/v1/graphql/schema.json",
    "/v1/graphql/schema.xml",
    "/v1/graphql/schema.yaml",
    "/v1/playground",
    "/v1/subscriptions",
    "/v1/api/graphql",
    "/v1/graph",
    "/v2/altair",
    "/v2/explorer",
    "/v2/graphiql",
    "/v2/graphiql.css",
    "/v2/graphiql/finland",
    "/v2/graphiql.js",
    "/v2/graphiql.min.css",
    "/v2/graphiql.min.js",
    "/v2/graphiql.php",
    "/v2/graphql",
    "/v2/graphql/console",
    "/v2/graphql-explorer",
    "/v2/graphql.php",
    "/v2/graphql/schema.json",
    "/v2/graphql/schema.xml",
    "/v2/graphql/schema.yaml",
    "/v2/playground",
    "/v2/subscriptions",
    "/v2/api/graphql",
    "/v2/graph",
    "/v3/altair",
    "/v3/explorer",
    "/v3/graphiql",
    "/v3/graphiql.css",
    "/v3/graphiql/finland",
    "/v3/graphiql.js",
    "/v3/graphiql.min.css",
    "/v3/graphiql.min.js",
    "/v3/graphiql.php",
    "/v3/graphql",
    "/v3/graphql/console",
    "/v3/graphql-explorer",
    "/v3/graphql.php",
    "/v3/graphql/schema.json",
    "/v3/graphql/schema.xml",
    "/v3/graphql/schema.yaml",
    "/v3/playground",
    "/v3/subscriptions",
    "/v3/api/graphql",
    "/v3/graph",
    "/v4/altair",
    "/v4/explorer",
    "/v4/graphiql",
    "/v4/graphiql.css",
    "/v4/graphiql/finland",
    "/v4/graphiql.js",
    "/v4/graphiql.min.css",
    "/v4/graphiql.min.js",
    "/v4/graphiql.php",
    "/v4/graphql",
    "/v4/graphql/console",
    "/v4/graphql-explorer",
    "/v4/graphql.php",
    "/v4/graphql/schema.json",
    "/v4/graphql/schema.xml",
    "/v4/graphql/schema.yaml",
    "/v4/playground",
    "/v4/subscriptions",
    "/v4/api/graphql",
    "/v4/graph",
  ];

  const consoles: Promise<GQLConsole>[] = console_list.map(
    async (c: string) => {
      const res = await fetch(`${parsedUrl.origin}${c}`);
      return {
        status: res.status,
        path: res.url,
        statusText: res.statusText,
      };
    },
  );

  return await Promise.all(consoles).then((results) => {
    return results.length > 0 ? { results, type: "WARNING" } : false;
  }).catch((e) => console.error(e));
}
