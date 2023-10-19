# graudit-cli

!! This was software built as part of my dissertation for an MSc in Software and Systems Security at Oxford

GraphQL DAST CLI reporting and pen-testing tool.

The primary purpose of this tool is to audit a given GraphQL endpoint to detect
threats and vulnerabilities.

The results from the scan will pinpoint areas which could be problematic
threats based off of OWASP API Top Ten.

## Features

Graudit will attempt to construct a schema via an introspection query and then
parse the discovered data types into re-useable queries and mutations that are
used for further analysis.

- Run introspection to get queries, mututations and subsciptions
- Scans over endpoint with an initial introspection query and stores queries,
  mutations and subscriptions.
- Test for introspection
- Test for nested queries
- Test for query inputs which allow strings
- Test for sensitive field information leakage - SSH Keys, passwords, API keys
- Test for consoles - playgrounds, dev environments
- Test for JSON inputs
- Test for nullable types
- Attack/Test for brute forcing on mutations - e.g login
- Attack/Test for DoS attacks - running expensive queries concurrently to take
  down services or render them unavailable
- Attack/Test for IDOR
- Attack/Test for error handling information leakage
- Test for HTTPS - protects encoded JWT tokens from MiTM attacks
- Attack/Brute force JWT tokens
- Test HTTP headers

## Commands

There are 4 fundamental features of this tool - build, scan, attack and
jwt-attack commands.

## Usage

It is not required, but a build should be performed first in order to gather
information, followed then by either `scan` or `attack` commands.

### build

Build will run an initial scan against the endpoint that will first try to
detect a GQL schema from running an introspection query. It will then proceed at
building a series of query and mutation gql templates which can be used for
later attacks (found inside `/[report]/query` and `'/[report]/mutation` directories).

```
Analysing queries....
Queries no:  11
Writing query... user
Writing query... users
Writing query... doctors
Writing query... appointment
Writing query... appointments
Writing query... practices
Writing query... patient
Writing query... patients
Writing query... patientsDirectory
Writing query... me
Writing query... notes
Build finished
```

The build command will also generate the results of the introspection query to
file (introspection.json) aswell as the complete schema (schema.gql).

A final step of this process includes an analysis of queries which have been
found (specifically the query depth and complexity is checked) and the results
are also written to `query-[name].json` files. These queries can be used in
`attack` command as well as `scan`.

### scan

Scan will target a given endpoint and run a series of checks against it. If you
want to check with an authenticated user then you can provide the token with
`-t`.

The results of the scan will be written to a html report, or to stdout in json
format passing `-f "json"`.

### attack

Attacks require json payload templates that can be written and configured to run
specific attacks against the Graphql server.

### jwt-attack

If an JWT token has been signed with a weak secret key then is susceptible to a
bruteforce attack in which the actual secret could be disclosed. We can use
`jwt-attack` command to do this, by providing our token along with it and this
will proceed at trying many attempts at guessing the secret used to sign the
token. If a match is found the attack will stop and return the secret.

```
deno run --allow-net --allow-read --allow-write --unstable --v8-flags=--max-old-space-size=8192 main.ts \
  jwt-attack \
  -t "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.3KZWBJpxrZWV0kFYq5c1sBzC8Hvm5jCDjtyZ5pcG24g"
```

The results of a successful match:

```
...
check: qec, match: false
check: rec, match: false
check: sec, match: false
JWT secret found for signature '3KZWBJpxrZWV0kFYq5c1sBzC8Hvm5jCDjtyZ5pcG24g'
------------------------------------
Secret:  sec
------------------------------------
Processing time taken (sec): 1.021
Total attempts mage against signature:  11861
```

By gaining the secret you are able to modify the payload and forge new tokens
which will be valid on the same server where the token was taken from.

## What does it check for?

Checks

- Introspection discovery
- Complex/Circular nested queries
  - Recursive queries can exhaust the server resources and potentiallys render
    them unavailable.
- String input fields
  - GQL can be used effectively via input validation, however, allowing
    unsanitised string-based inputs can cause security risks.
  - This check will query the endpoint for all input fields that accept strings.
  - Mitigation: replace with non-string types, such as Custom Types, Enums or
    anything that isn't a `GraphQLString`
- Nullable types
- JSON inputs
- JWT token brute-force attacks
- Sensitive fields checks
- HTTPS check
- Detects other graphql consoles found on domain
- Security headers

## Outputs

- Generates a HTML report
- Generate test results to stdout in JSON with `-f "json"`

## Installing

Deno provides `deno install` to easily install and distribute executable code

This command creates a thin, executable shell script which invokes deno using
the specified CLI flags and main module. It is placed in the installation root's
bin directory. Ref: https://deno.land/manual/tools/script_installer

```
$ deno install --allow-net -f --name graudit https://deno.land/..../main.ts
```

## Usage examples

Build

> deno run --allow-net --allow-read --allow-write --unstable main.ts build -u
> https://api.example.com/graphql deno run --allow-net --allow-read
> --allow-write --unstable main.ts build -u https://api.example.com/graphql
> --token "" -d 5 Build finished

Scan

> deno run --allow-net --allow-read --allow-write --unstable main.ts scan -u
> https://api.example.com/graphql --token ""

Attacking

> deno run --allow-net --allow-read --allow-write --unstable
> --v8-flags=--max-old-space-size=8192 main.ts attack -u
> http://localhost:8000/graphql -p "signin-payload"

## Troubleshoot

Heap limit issues

> deno run --allow-net --allow-read --allow-write --unstable
> --v8-flags=--max-old-space-size=8192 main.ts build -u
> https://api.example.com/graphql -d 2

## Requirements:

- Install deno binary

## Testing and run:

```
// Install deps
$ deno cache main.ts

// Run locally
$ deno run --allow-net main.ts --help

// Run from source
$ deno run --allow-net https://raw.githubusercontent.com/timclifford/graudit/master/main.ts

// Install binary from source
$ deno install --name graudit-test https://raw.githubusercontent.com/timclifford/graudit/master/main.ts

// Allow all permissions
$ deno run -A main.ts --help

// Run test case
$ deno test --allow-net

// Format code
$ deno fmt

// Build cli binary
$ deno install --allow-net -f --name graudit main.ts
```
