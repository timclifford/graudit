import {
  buildClientSchema,
  ensureDirSync,
  printSchema,
  writeJsonSync,
} from "../deps.ts";
import { fetchIntrospection, getIntrospectionQuery } from "./introspection.ts";
import {
  findNestedFields,
  flatten,
  getHostnameFromUrl,
  isEmpty,
  replaceWithFirstNestedValueWhenTooDeep,
  stripGQLTypeSyntax,
} from "./helpers.ts";

import {readableStreamFromAsyncIterator} from "https://deno.land/std@0.81.0/io/streams.ts";
import {collect} from "https://uber.danopia.net/deno/observables-with-streams@v1/sinks/collect.ts";

import Spinner from "https://raw.githubusercontent.com/ameerthehacker/cli-spinners/master/mod.ts";
const spinner = Spinner.getInstance();

// Build all queries and mutations files for analysis
export async function build(
  url: string,
  access_token: string,
  depth: number,
  verbose: boolean,
  minimal: boolean,
  headers?: Object
) {
  if (!url) return "No url given";
  if (depth <= 1) return "Depth must be more than 1";  

  const hostname = getHostnameFromUrl(url);

  ensureDirSync(`./report-${hostname}`);
  const introspection = await fetchIntrospection(url, access_token, verbose, headers);
  const schema = introspection && buildClientSchema(introspection);

  if (verbose) {
    console.log('Introspection response: ', introspection);
  }

  ["query", "mutation", "subscription"]?.map((entity: any) => {
    const directories = `./report-${hostname}/${entity}`;
    ensureDirSync(directories);
    const entity_capitalise = `${entity.charAt(0).toUpperCase() +
      entity.slice(1)}`;

    let type: any = {};
    switch (entity) {
      case "query":
        type = schema?.getQueryType();
        break;
      case "mutation":
        type = schema?.getMutationType();
        break;
      case "subscription":
        type = schema?.getSubscriptionType();
        break;
      default:
    }

    Deno.writeTextFile(`./report-${hostname}/schema.gql`, printSchema(schema));

    // If no query, mutation, subscription then return out.
    if (type === undefined || type == null) {
      return;
    }

    //@ts-ignore
    Object.keys(type?._fields)?.map((field: any) => {
      const { query_string } = buildEntity(field, type?.name, schema, depth);

      Deno.writeTextFile(`${directories}/${field}.gql`, query_string);
    });
  });

  // Dump out further analysis data
  const queries = analyseQueriesFromSchema(schema, depth, verbose, minimal);

  const sleep = (ms: any) => {
    return new Promise((resolve) => setTimeout(resolve, ms));
  };

  console.log("Queries no: ", queries.length);



  if (queries.length >= 10) {
    // let i, j, tempArr: any, queryName: string, chunk = 1;

    // for (i = 0, j = queries.length; i < j; i += chunk) {
    //   tempArr = queries.slice(i, i + chunk);
    //   queryName = tempArr.slice(0, 1).shift().name;

    //   console.log(`Writing query... ${queryName}`);
    //   await Deno.writeTextFileSync(
    //     `./report-${hostname}/query-${queryName}.json`,
    //     JSON.stringify(tempArr),
    //   );
    // }
    
    const stream = readableStreamFromAsyncIterator(async function* queryIds() {
      let i, j, tempArr: any, queryName: string, chunk = 1;

      for (i = 0, j = queries.length; i < j; i += chunk) {
        tempArr = queries.slice(i, i + chunk);
        queryName = tempArr.slice(0, 1).shift().name;
        
        console.log(`Writing query... ${queryName}`);
        await Deno.writeTextFileSync(
          `./report-${hostname}/query-${queryName}.json`,
          JSON.stringify(tempArr),
        );

        // yield queries[i];
      }
    }());

    // console.log('All queries:', await collect(stream));

  } else {
    // Write queries json to file.
    await writeJsonSync(`./report-${hostname}/queries.json`, queries, {
      spaces: 2,
    });
  }

  return "Build finished";
}

export function buildEntity(
  field_name: any,
  root_type: any,
  schema: any,
  depth: number,
) {
  const fields = recursiveGetFields(
    schema,
    field_name,
    root_type,
    [],
    1,
    depth,
  );
  return {
    query_string: buildQueryString(
      root_type,
      schema,
      field_name,
      fields,
    ),
    field_has_args: Object.keys(fields).map((f: any) => f?.field_has_args),
  };
}

export function analyseQueriesFromSchema(
  schema: any,
  depth: number,
  verbose: boolean,
  minimal: boolean,
) {
  if (verbose) {
    console.log("Analysing queries (verbose build)....");
  } else {
    console.log("Analysing queries....");
  }

  let query_types: Object[];
  query_types = [];

  // Iterate through all queries
  Object.keys(schema["_queryType"]["_fields"]).forEach((q) => {
    const query = schema["_queryType"]["_fields"][q];
    const { name, type, args } = query;

    if (type?.ofType) {
      const type_name = type?.ofType?.name;
      let argOb = args;
      let fields = type?.ofType?._fields || type?.ofType?.ofType?._fields ||
        type?.ofType?.ofType?.ofType?._fields;

      fields = getFields(fields, depth, minimal);
      argOb = getRecursiveArgs(argOb);

      const query_filtered = {
        name: name,
        args: argOb,
        type: fields,
      };

      query_types.push(query_filtered);
    } else {
      // Arguments which aren't objects
      const argument = args?.map((arg: any) => {
        return {
          ...arg,
          type: arg?.type?._fields || arg?.type?.name,
        };
      });

      const query_filtered = {
        name: name,
        args: argument,
        type: type?._fields ? getFields(type?._fields, depth, minimal) : type,
      };

      query_types.push(query_filtered);
    }
  });

  return query_types;
}

export function getArgumentsForField(field: any) {
  return field.args.reduce(
    (accum: any, f: any) => `${accum}, ${f.name}: $${f.name}`,
    "",
  ).substring(2);
}

export const getRecursiveArgs: any = (args: any, callCount?: number) => {
  let argsOb: any;

  return args.map((arg: any) => {
    if (arg !== undefined) {
      argsOb = {
        name: arg?.name,
        type: arg?.type?.ofType || arg?.type?.name,
        defaultValue: arg?.defaultValue,
      };
    }

    // If arg type has fields.
    if (arg?.type?._fields !== undefined) {
      let argTypeOb = arg?.type?._fields || arg?.type?.name;

      if (arg?.type?._fields) {
        argTypeOb = Object.keys(arg?.type?._fields).map((key: any) => {
          const getType = () => {
            if (argTypeOb[key]?.type?._fields) {
              return argTypeOb[key]?.type?._fields;
            } else {
              return argTypeOb[key]?.type;
            }
          };

          return {
            name: argTypeOb[key]?.name,
            description: argTypeOb[key]?.description,
            type: argTypeOb[key]?.type?._fields
              ? argTypeOb[key]?.type?._fields
              : getType(),
            defaultValue: argTypeOb[key]?.defaultValue,
          };
        });
      }

      return args.map((arg: any) => {
        return {
          name: arg?.name || arg?.type?.name,
          description: arg?.type?.description || arg?.description,
          type: argTypeOb,
          defaultValue: arg?.defaultValue,
        };
      });
    }

    return {
      name: arg?.name || arg?.type?.name,
      description: arg?.type?.description || arg?.description,
      type: arg?.type?._fields || arg?.type?.name,
      defaultValue: arg?.defaultValue,
    };
  });
};

export const getFields: any = (
  fields: any,
  depth: number,
  minimal?: boolean,
) => {
  if (fields == null) return;

  let fieldArgsOb: any;

  return Object.keys(fields).map((key: any) => {
    if (fields[key]?.args !== undefined || fields[key]?.args?.length != 0) {
      fieldArgsOb = getFieldArguments(fields[key]);
    }

    // Look for fields with Objects.
    if (
      fields[key]?._fields !== undefined || fields[key]?._fields != 0 ||
      fields[key]?._fields?._fields !== undefined ||
      fields[key]?._fields?._fields != 0 ||
      fields[key]?.type?.ofType !== undefined ||
      fields[key]?.type?.ofType != 0 ||
      fields[key]?.type?.ofType?.ofType !== undefined ||
      fields[key]?.type?.ofType?.ofType != 0 ||
      fields[key]?.type?._fields !== undefined ||
      fields[key]?.type?._fields != 0 ||
      fields[key]?.type?._fields?._fields !== undefined ||
      fields[key]?.type?._fields?._fields != 0
    ) {
      let fieldsTypeOb = fields[key]?.type?.ofType?.ofType?.ofType ||
        fields[key]?.type?.ofType?.ofType || fields[key]?.type?.ofType ||
        fields[key]?.type;

      if (
        ![
          "Int",
          "Float",
          "String",
          "Boolean",
          "ID",
          "__TypeKind",
          "__Type",
          "__Schema",
          "__Field",
          "__InputValue",
          "__EnumValue",
          "__Directive",
          "__DirectiveLocation",
        ].includes(fieldsTypeOb?.name)
      ) {
        if (fields[key]?._fields) {
          fieldsTypeOb = getRecursiveFields(
            fields[key]?._fields,
            depth,
            0,
            minimal,
          );
        }
        if (fields[key]?._fields?._fields) {
          fieldsTypeOb = getRecursiveFields(
            fields[key]?._fields,
            depth,
            0,
            minimal,
          );
        }
        if (fields[key]?.type?.ofType?._fields) {
          fieldsTypeOb = getRecursiveFields(
            fields[key]?.type?.ofType?._fields,
            depth,
            0,
            minimal,
          );
        }
        if (fields[key]?.type?.ofType?.ofType?._fields) {
          fieldsTypeOb = getRecursiveFields(
            fields[key]?.type?.ofType?.ofType?._fields,
            depth,
            0,
            minimal,
          );
        }
        if (fields[key]?.type?.ofType?.ofType?.ofType?._fields) {
          fieldsTypeOb = getRecursiveFields(
            fields[key]?.type?.ofType?.ofType?.ofType?._fields,
            depth,
            0,
            minimal,
          );
        }
        if (fields[key]?.type?._fields) {
          fieldsTypeOb = getRecursiveFields(
            fields[key]?.type?._fields,
            depth,
            0,
            minimal,
          );
        }
        if (fields[key]?.type?._fields?._fields) {
          fieldsTypeOb = getRecursiveFields(
            fields[key]?.type?._fields?._fields,
            depth,
            0,
            minimal,
          );
        }
      }

      fields[key].type = {
        name: fields[key]?.type?.ofType?.name || fields[key]?.type?.name,
        args: getFieldArguments(fields[key]?.type),
        _fields: fieldsTypeOb,
      };
    }

    // Clean up
    let field_type = fields[key]?.type || fields[key]?.type?.name;

    if (fields[key]?.type?._fields instanceof Array) {
      let allEmpty = false;

      const checkProperties = ((obj: any) => {
        for (let key in obj) {
          if (obj[key] !== null && obj[key] != undefined) {
            return false;
          }
        }
        return true;
      });

      fields[key]?.type?._fields?.map((f: any) => {
        if (checkProperties(f)) allEmpty = true;
      });

      let removeEmptyFields = {
        name: fields[key]?.name,
        _fields: [],
      };

      if (allEmpty) return field_type = removeEmptyFields;
    }

    if (minimal) {
      return {
        field_name: fields[key]?.type?.ofType?.name ||
          fields[key]?.type?.name || fields[key]?.name,
        field_type: field_type,
      };
    } else {
      return {
        field_name: fields[key]?.type?.ofType?.name ||
          fields[key]?.type?.name || fields[key]?.name,
        field_args: fieldArgsOb,
        field_type: field_type,
      };
    }
  });
};

export const getFieldArguments = (field: any) => {
  return field?.args?.map((arg: any) => {
    return {
      name: arg?.name,
      type: arg?.type?.ofType || arg?.type?.name,
      defaultValue: arg?.defaultValue,
    };
  });
};

export const getRecursiveFields: any = (
  fields: any,
  depth: number,
  callCount?: number,
  minimal?: boolean,
) => {
  if (fields === null || fields === undefined) return;

  return Object.keys(fields).map((key: any) => {
    const getType = (type: any) => {
      let t: number | undefined = callCount || 0;
      t = t >= 0 ? t += 1 : t;

      if (type?._fields?.ofType?.ofType) {
        return t < depth
          ? getRecursiveFields(
            type?._fields?.ofType?.ofType?._fields,
            depth,
            t,
            minimal,
          )
          : (type?._fields?.ofType?.ofType?._fields)
          ? replaceWithFirstNestedValueWhenTooDeep(
            type?._fields?.ofType?.ofType?._fields,
          )
          : null;
      }

      if (type?._fields?.ofType) {
        return t < depth
          ? getRecursiveFields(
            type?._fields?.ofType?._fields,
            depth,
            t,
            minimal,
          )
          : (type?._fields?.ofType?._fields)
          ? replaceWithFirstNestedValueWhenTooDeep(
            type?._fields?.ofType?._fields,
          )
          : null;
      }

      if (type?.ofType?.ofType?.ofType) {
        return t < depth
          ? getRecursiveFields(
            type?.ofType?.ofType?.ofType?._fields,
            depth,
            t,
            minimal,
          )
          : (type?.ofType?.ofType?.ofType?._fields)
          ? replaceWithFirstNestedValueWhenTooDeep(
            type?.ofType?.ofType?.ofType?._fields,
          )
          : null;
      }

      if (type?.ofType?.ofType) {
        return t < depth
          ? getRecursiveFields(type?.ofType?.ofType?._fields, depth, t, minimal)
          : (type?.ofType?.ofType?._fields)
          ? replaceWithFirstNestedValueWhenTooDeep(
            type?.ofType?.ofType?._fields,
          )
          : null;
      }

      if (type?.ofType) {
        return t < depth
          ? getRecursiveFields(type?.ofType?._fields, depth, t, minimal)
          : (type?.ofType?._fields)
          ? replaceWithFirstNestedValueWhenTooDeep(type?.ofType?._fields)
          : null;
      }

      // If type has no name, return out
      if (type?.name === undefined) {
        return;
      }

      // Clean up
      if (type?._fields instanceof Array) {
        let allEmpty = false;

        const checkProperties = ((obj: any) => {
          for (var key in obj) {
            if (obj[key] !== null && obj[key] != undefined) {
              return false;
            }
          }
          return true;
        });

        type?._fields?.map((f: any) => {
          if (checkProperties(f)) allEmpty = true;
        });

        return allEmpty ? type?.name : type;
      }

      return type;
    };

    // Prevent infinite nested loop.
    let t: number | undefined = callCount || 0;
    t = t >= 0 ? t += 1 : t;

    let field_type: any = fields[key]?.type?.ofType?.ofType
      ? getType(fields[key]?.type?.ofType?.ofType)
      : fields[key]?.type?.ofType
      ? t < depth
        ? getRecursiveFields(
          fields[key]?.type?.ofType?._fields,
          depth,
          t,
          minimal,
        )
        : (fields[key]?.type?.ofType?._fields)
        ? replaceWithFirstNestedValueWhenTooDeep(
          fields[key]?.type?.ofType?._fields,
        )
        : fields[key]?.type
      : getType(fields[key]?.type)
      ? getType(fields[key]?.type)
      : fields[key]?.type;

    if (minimal) {
      return {
        name: fields[key]?.name,
        type: field_type,
      };
    }

    return {
      name: fields[key]?.name,
      description: fields[key]?.description,
      args: getFieldArguments(fields[key]),
      type: field_type,
    };
  });
};

export function recursiveGetFields(
  schema: any,
  name: any,
  root_type: any,
  root_fields: any,
  level: any,
  depth: number,
) {
  const field = schema.getType(root_type).getFields()[name];
  const field_type_name = stripGQLTypeSyntax(field.type.inspect());
  const field_type = schema.getType(field_type_name);

  let field_string = " ".repeat(level * 2) + field.name;
  let field_has_args: boolean = false;
  let field_matches_root_type: boolean = false;

  const field_arg_types: any = [];

  // Arguments
  if (field.args && field.args.length) {
    field_has_args = true;

    field.args.map((arg: any) => {
      field_arg_types.push({
        name: `$${arg?.name}`,
        description: arg?.description,
        defaultValue: arg?.defaultValue,
        type: arg?.type,
      });
    });

    const args = getArgumentsForField(field);
    field_string += `(${args})`;
  }

  // Check if field type is the same as the root field type
  const fieldTypeMatchesRootField =
    root_fields.filter((f: any) => f.type === field_type_name).length;

  if (fieldTypeMatchesRootField) {
    field_matches_root_type = true;
  }

  if (level >= depth) {
    return { query: "", field_has_args: false };
  }

  // Child fields
  let child_fields_data = null;

  if (field_type.getFields) {
    const child_type_fields = field_type.getFields();

    child_fields_data = Object.keys(child_type_fields).reduce(
      (accum: any, field: any) => {
        // if (root_fields.filter((f: any) => f.name === field && f.type === field_type_name).length) {
        //   return '';
        // }

        const child_fields = [...root_fields, {
          name: name,
          type: field_type_name,
        }];

        const child_field_fields = recursiveGetFields(
          schema,
          field,
          field_type_name,
          child_fields,
          level + 1,
          depth,
        );

        field_has_args = field_has_args || child_field_fields?.field_has_args;

        if (!child_field_fields.query) return accum;

        try {
          return child_field_fields.query.length
            ? `${accum}\n${child_field_fields.query}`
            : "";
        } catch (e) {
          console.log(e);
          console.log(
            "Try use a smaller depth by passing the d flag - e.g. -d 5",
          );
        }
      },
      "",
    );
  }

  if (child_fields_data) {
    field_string += ` {\n${child_fields_data.substring(1)}\n`;
    field_string += `${" ".repeat(level * 2)}}`;
  }

  return {
    query: field_string,
    field_has_args,
    field_arg_types,
    field_matches_root_type,
  };
}

export function buildQuery(
  name: any,
  query: any,
  args: any,
  fields: any,
  count_payload: number,
) {
  let query_string = "";

  let arg_string_arr: any = [];
  for (var i = 0; i < count_payload; i++) {
    arg_string_arr.push(
      args?.map((a: any) => `$${a.name}${i}: ${a.type}`).join(", "),
    );
  }

  query_string += `query ${name}${
    arg_string_arr ? `(\n ${arg_string_arr?.map((a: any) => `${a}`)}\n) {` : ""
  }`;

  for (var i = 0; i < count_payload; i++) {
    const query_arg_string = args.map((t: any) => `${t.name}: $${t.name}${i}`)
      .join(", ");
    query_string += `\n Q${i}: ${query}${
      query_arg_string ? `(${query_arg_string})` : ""
    }`;

    if (fields?.some((f: any) => f.sub_fields)) {
      query_string += ` {\n ${
        fields?.map((f: any) =>
          ` ${f.name}${f.sub_fields ? ` {\n ${f.sub_fields} }` : ""}`
        )
      } \n}`;
    } else {
      query_string += ` {\n ${
        fields?.map((f: any) => `  ${f.name}`).join(", ")
      }\n }`;
    }
  }
  query_string += `\n}`;

  return { query_string };
}

export function buildMutationQuery(
  name: any,
  mutation: any,
  args: any,
  fields: any,
  count_payload: number,
) {
  let query_string = "";

  let arg_string_arr: any = [];
  for (var i = 0; i < count_payload; i++) {
    arg_string_arr.push(
      args?.map((a: any) => `$${a.name}${i}: ${a.type}`).join(", "),
    );
  }

  query_string += `mutation ${name}${
    arg_string_arr ? `(\n ${arg_string_arr?.map((a: any) => `${a}`)}\n) {` : ""
  }`;

  for (var i = 0; i < count_payload; i++) {
    const mutation_arg_string = args.map((t: any) =>
      `${t.name}: $${t.name}${i}`
    ).join(", ");
    query_string += `\n M${i}: ${mutation}${
      mutation_arg_string ? `(${mutation_arg_string})` : ""
    }`;
    query_string += ` {\n ${
      fields?.map((f: any) => `  ${f.name}`).join(", ")
    }\n }`;
  }
  query_string += `\n}`;

  return { query_string };
}

export function buildQueryString(
  root_type: any,
  schema: any,
  field_name: string,
  fields: any,
) {
  let query_string = "";
  let arg_string = fields?.field_arg_types.map((t: any) =>
    `${t.name}: ${t.type}`
  ).join(", ");

  switch (root_type) {
    case schema.getQueryType() && schema.getQueryType().name:
      query_string += `query ${field_name}${
        arg_string ? `(${arg_string})` : ""
      }`;
      break;
    case schema.getMutationType() && schema.getMutationType().name:
      query_string += `mutation ${field_name}${
        arg_string ? `(${arg_string})` : ""
      }`;
      break;
    case schema.getSubscriptionType() && schema.getSubscriptionType().name:
      query_string += `subscription ${field_name}${
        arg_string ? `(${arg_string})` : ""
      }`;
      break;
    default:
      throw new Error("Could not determine root type");
  }

  query_string += ` {\n${fields.query}\n}`;
  return query_string;
}
