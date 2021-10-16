// Check for string inputs
export async function checkForStringInputs(schema: any, verbose: boolean) {
  const query = schema.getQueryType();
  const mutation = schema.getMutationType();
  const types = schema.getTypeMap();

  const query_fields = query?.getFields();
  const mutation_fields = mutation?.getFields();

  let string_inputs: any = [];

  // Queries
  if (query_fields) {
    for (let [field, definition] of Object.entries(query_fields)) {
      //@ts-ignore
      for (let { name, type } of definition.args) {
        // do args allow string inputs
        if (String(type).match(/string/i)) {
          string_inputs.push({
            "field": field,
            "query_type": "query",
            "type": type.toString(),
            "arg": name,
          });
        }
      }
    }
  }

  // Mutations
  if (mutation_fields) {
    for (let [field, definition] of Object.entries(mutation_fields)) {
      //@ts-ignore
      for (let { name, type } of definition.args) {
        // do args allow string inputs
        if (String(type).match(/string/i)) {
          string_inputs.push({
            "field": field,
            "query_type": "mutation",
            "type": type.toString(),
            "arg": name,
          });
        }
      }
    }
  }

  return string_inputs?.length > 0 ? string_inputs : false;
}

export async function printStringInputsResults(
  string_inputs: any,
  verbose: boolean,
) {
  let results: any = [];
  const types = await string_inputs;

  Object.keys(types).map((t: any) => {
    if (verbose) {
      console.log(
        `String inputs found on ${types[t].query_type} field '${
          types[t].field
        }' on arg '${types[t].arg}'`,
      );
    }
    results.push(types[t]);
  });

  return results;
}
