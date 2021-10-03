import {
  ensureDirSync,
  readableStreamFromReader,
  readerFromStreamReader,
  readJsonSync,
} from "../../deps.ts";
import { getHostnameFromUrl } from "../../utils/helpers.ts";

const authentication_query_names: string[] = [
  "signIn",
  "signInUser",
  "SignIn",
  "sign_in",
  "sign_in_user",
  "signin",
  "Signin",
  "signinUser",
  "login",
  "Login",
  "loginUser",
  "logIn",
  "logInUser",
  "log_in",
  "log_in_user",
  "userLogin",
  "user_login",
  "createSession",
  "create_session",
  "resetPassword",
  "reset_password",
  "ResetPassword",
  "passwordReset",
  "password_reset",
  "PasswordReset",
  "customerSignIn",
  "customerResetPassword",
  "insert_user",
  "insert_users"
];

export async function findMutationsThatAreBruteForceable(
  url: string,
  access_token: string,
  verbose: boolean,
) {
  if (verbose) {
    console.log("Checking for potential brute-forceable mutations...");
  }
  const hostname = getHostnameFromUrl(url);
  ensureDirSync(`./report-${hostname}/mutation`);

  let mutationFiles: string[] = [];

  for await (const dirEntry of Deno.readDir(`./report-${hostname}/mutation`)) {
    if (dirEntry.isFile && dirEntry.name.endsWith("gql")) {
      mutationFiles.push(dirEntry.name);
    }
  }

  let results: any = await mutationFiles?.map(async (f: any) => {
    const brute_forceable_names = authentication_query_names.filter((n) => {
      let name = f.split('.')[0];

      return n === name;
    });

    return brute_forceable_names.length > 0 && brute_forceable_names;
  });

  return await Promise.all(results)
    .then((results) => {
      return results.length > 0
        ? { results: results.filter((f) => f), type: "WARNING" }
        : false;
    })
    .catch((e) => console.error(e));
}
