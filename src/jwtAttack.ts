import { hmac } from "https://deno.land/x/god_crypto@v1.4.10/src/hmac/mod.ts";
import * as base64 from "https://deno.land/x/base64@v0.2.1/mod.ts";

import { dictonaryReader } from "../utils/dictonaryReader.ts";

//@ts-ignore
export async function bruteForceJWT(
  token: string,
  pattern?: string,
  length?: number,
  output_dir?: string,
  verbose?: Boolean,
  format?: string,
) {
  if (!token) return "No token given";

  //'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const alphabet: string = pattern || "abcdefghijklmnopqrstuvwxyz";
  const maxLength: number = length || 8;

  const [header, payload, signature] = token.split(".");
  const content = `${header}.${payload}`;

  const startTime = new Date().getTime();
  let guesses = 0;

  const stream = dictonaryReader(alphabet, maxLength);
  const reader = stream.getReader();
  let result = "";

  const push = () => {
    reader.read().then(
      ({ value, done }) => {
        if (done) {
          console.log("Finished", done);
          return;
        } else {
          guesses++;

          console.log(`Guess: ${value} - match: ${done}`);
          const currentSignature = generateSignature(content, value);

          if (verbose) {
            console.log("currentSignature: ", currentSignature);
            console.log("signature: ", signature);
          }

          if (guesses % 1000 === 0) {
            console.log("----------------------------");
            console.log("Guesses:", guesses);
            console.log("----------------------------");
          }

          result += value;

          if (currentSignature == signature) {
            renderResults(startTime, guesses, value, currentSignature);
            Deno.exit(0);
          }

          push();
        }
      },
      (e) => console.error("Error streaming indexes", e),
    );
  };

  push();
}

const generateSignature = (content: any, secret: any) => {
  return base64.fromUint8Array(hmac("sha256", secret, content))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
};

const renderResults = (
  startTime: number,
  attempts: number,
  result: any,
  signature: string,
) => {
  if (result) {
    console.log(`JWT secret found for signature '${signature}'`);
    console.log("------------------------------------");
    console.log("Secret: ", result);
    console.log("------------------------------------");
  } else {
    console.log("No secret found for ", signature);
  }
  console.log(
    "Processing time taken (sec):",
    ((new Date()).getTime() - startTime) / 1000,
  );
  console.log("Total attempts made against signature: ", attempts);
};
