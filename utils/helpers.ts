export const getHostnameFromUrl = (url: string) => {
  const hostname_matches = url.match(/^https?\:\/\/([^\/?#]+)(?:[\/?#]|$)/i);
  let hostname = "";
  if (hostname_matches != null) {
    hostname = hostname_matches[1].replace(/\./g, "-");
  }
  return hostname;
};

export function flatten<T extends Record<string, any>>(
  object: T,
  path: string | null = null,
  separator = ".",
): T {
  return Object.keys(object).reduce((acc: T, key: string): T => {
    const value = object[key];

    const newPath = [path, key].filter(Boolean).join(separator);

    const isObject = [
      typeof value === "object",
      value !== null,
      !(value instanceof Date),
      !(value instanceof RegExp),
      !(Array.isArray(value) && value.length === 0),
    ].every(Boolean);

    return isObject
      ? { ...acc, ...flatten(value, newPath, separator) }
      : { ...acc, [newPath]: value };
  }, {} as T);
}

export function flattenForNested<T extends Record<string, any>>(
  object: T,
  path: string | null = null,
  separator = ".",
): T {
  return Object.keys(object).reduce((acc: T, key: string): T => {
    const value = object[key];

    const isObject = [
      typeof value === "object",
      value !== null,
      !(value instanceof Date),
      !(value instanceof RegExp),
      !(Array.isArray(value) && value.length === 0),
    ].every(Boolean);

    // console.log(key);

    let newPath = [path, key].filter(Boolean).join(separator);

    let hasNumber = /\d/;
    if (hasNumber.test(key)) {
      newPath = [path, object[key]?.name].filter(Boolean).join(separator);
    }
    if (key === "field_type") {
      newPath = [path, object[key]?.name].filter(Boolean).join(separator);
    }
    if (
      value === "serializeID" || value === "coerceID" ||
      value === "parseLiteral"
    ) {
      newPath = [path, {}].filter(Boolean).join(separator);
    }

    return isObject
      ? { ...acc, ...flattenForNested(value, newPath, separator) }
      : (value === "Deeply nested or cyclical object")
      ? { ...acc, [newPath]: value }
      : null;
  }, {} as T);
}

export const findNestedFields: any = (object: any, key: any) => {
  let value;
  Object.keys(object).some((k: any) => {
    if (k === key) {
      value = object[k];
      return true;
    }

    if (object[k] && typeof object[k] === "object") {
      value = findNestedFields(object[k], key);
      return value !== undefined;
    }
  });

  return value;
};

export const replaceWithFirstNestedValueWhenTooDeep: any = (fields: any) => {
  const nested_fields = findNestedFields(fields, "_fields");

  if (nested_fields === undefined) {
    return;
  }

  return Object.keys(nested_fields).map((f: any) => {
    return f === "name"
      ? {
        "name": nested_fields[f],
        "warning": "Deeply nested or cyclical object",
        "type": nested_fields[f]?.type?.name,
      }
      : {};
  });
};

export const isEmpty = (obj: any) => {
  for (var prop in obj) {
    if (obj.hasOwnProperty(prop)) {
      return false;
    }
  }
  return true;
};

export function stripGQLTypeSyntax(type: any) {
  return type.replace(/[[\]!]/g, "");
}

export const msToBetterFormattedTime = (ms: number) => {
  let secs = parseFloat((ms / 1000).toFixed(2));
  let mins = parseFloat((ms / (1000 * 60)).toFixed(2));
  let hrs = parseFloat((ms / (1000 * 60 * 60)).toFixed(2));
  let days = parseInt((ms / (1000 * 60 * 60 * 24)).toFixed(1));
  if (secs < 60) {
    return secs + " seconds";
  } else if (mins < 60) {
    return mins + " minutes";
  } else if (hrs < 24) {
    return hrs + " hours";
  } else return days + " days";
};
