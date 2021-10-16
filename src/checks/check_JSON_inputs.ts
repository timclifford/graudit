// Check for JSON scalars
export async function checkForJSONInputs(introspection: any, schema: any, verbose: boolean) {
  const types = introspection.__schema.types;

  const queryFields = types.filter((t: any) => t.name === "Query").shift()?.fields;
  const queryTypes = types.filter((t: any) => t.name === "Query")?.inputFields;

  const mutationFields = types.filter((t: any) => t.name === "Mutation").shift()?.fields;
  const mutationTypes = types.filter((t: any) => t.kind === "INPUT_OBJECT");

  let JSON_inputs: any = [];


  // Queries
  if (queryFields) {
    for (let i = 0; i < queryFields.length; i++) {
      const fieldArgs = queryFields[i]?.args;
      const query = queryFields[i]?.name;

      for (let j = 0; j < fieldArgs.length; j++) {
        const arg = fieldArgs[j];
        if (arg?.type?.name === "JSONObject"
          || arg?.type?.name === "JSON"
          || arg?.type?.name === "JSONString"
          || arg?.type?.name === "Json"
        ) {
          JSON_inputs.push({
            query: query,
            arg_name: arg?.name,
            arg_type: arg?.type,
            query_type: "Query",
          });
        }
      }
    }
  }

  // Query input field types
  if (queryTypes) {
    for (let i = 0; i < queryTypes.length; i++) {
      const types = queryTypes[i]?.inputFields;
      const inputs = findJSONInNestedObj(types, "name", "JSON");

      if (inputs) {
        JSON_inputs.push({...inputs});
      }
    }
  }


  // Mutations
  if (mutationFields) {
    for (let i = 0; i < mutationFields.length; i++) {
      const fieldArgs = mutationFields[i]?.args;
      const query = mutationFields[i]?.name;

      for (let j = 0; j < fieldArgs.length; j++) {
        const arg = fieldArgs[j];
        if (arg?.type?.name === "JSONObject"
          || arg?.type?.name === "JSON"
          || arg?.type?.name === "JSONString"
          || arg?.type?.name === "Json"
        ) {
          JSON_inputs.push({
            query: query,
            arg_name: arg?.name,
            arg_type: arg?.type,
            query_type: "Mutation",
          });
        }
      }
    }
  }

   // Mutation input field types
  if (mutationTypes) {
    for (let i = 0; i < mutationTypes.length; i++) {
      const types = mutationTypes[i]?.inputFields;
      const inputs = findJSONInNestedObj(types, "name", "JSON");

      if (inputs) {
        JSON_inputs.push({...inputs});
      }
    }
  }

  return JSON_inputs.length ? JSON_inputs : "PASS";
}

const findJSONInNestedObj = (object: any, key: string, value: string): any => {

  if (object?.type?.ofType?.name === value || object?.type?.ofType?.ofType?.name === value) {
    return object;
  } else {
    for (var i = 0, len = Object.keys(object).length; i < len; i++) {
      if (typeof object[i] == 'object') {
        var found = findJSONInNestedObj(object[i], key, value);
        if (found) {
          return found;
        }
      }
    }
  }
}
