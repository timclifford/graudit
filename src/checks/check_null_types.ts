// Check for nullable types which could be attacked via brute-force
export async function checkForNullableTypes(
  introspection: any,
  verbose: boolean,
) {
  // We can look at 'introspection.json' and see which type have a kind value of !NON_NULL (i.e. are nullable)
  const types = introspection.__schema.types;
  const queryFields =
    types.filter((t: any) => t.name === "Query").shift()?.fields || null;
  const mutationFields =
    types.filter((t: any) => t.name === "Mutation").shift()?.fields || null;

  let nullableTypes: any = [];

  // Queries
  if (queryFields) {
    for (let i = 0; i < queryFields.length; i++) {
      const fieldType = queryFields[i]?.type;
      const fieldArgs = queryFields[i]?.args;
      const query = queryFields[i]?.name;

      // NON_NULL - field is non-nullable, anything else means the field is nullable.
      // Also filter out any queries with don't have arguments as they can't be brute-forced.
      if (fieldType?.kind !== "NON_NULL" && fieldArgs.length > 0) {
        nullableTypes.push({
          query: query,
          type: fieldType,
          query_type: "Query",
        });
      }
    }
  }

  // Mutations
  if (mutationFields) {
    for (let i = 0; i < mutationFields.length; i++) {
      const fieldType = mutationFields[i]?.type;
      const query = mutationFields[i]?.name;

      if (fieldType?.kind !== "NON_NULL") {
        nullableTypes.push({
          query: query,
          name: fieldType,
          query_type: "Mutation",
        });
      }
    }
  }

  return nullableTypes.length ? nullableTypes : "PASS";
}
