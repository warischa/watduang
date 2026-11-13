## Azurite (`azurite-run.sh`, scratch copies outside the repo)

The script installs the SDK from the committed lock and Azurite from npm into temp directories,
starts Azurite, runs `azurite-calibration.mjs`, then runs `join-service.test.mjs` (round 4: 41 of 41 pass, Azurite 3.37.0,
storage-blob 12.34.0, 112 s wall for the whole script, after the last code edit; round 3: 36 of 36, about 54 s wall for the whole script; round 2: 34 of 34) with
`DRAW_TEST_AZURITE=UseDevelopmentStorage=true`: the same tests, with the real `@azure/storage-blob`
container client (each harness gets a fresh container) in place of the in-memory one. Output is in
`azurite-run-output.txt` (round 4 run; the script's own `npm` installs go to temp directories).
Must-red for the switch: pointed at a dead port, the run fails with `ECONNREFUSED` (round 2; not
re-run in round 3).

What the calibration measured, and the in-memory container copies:

- `If-None-Match: *` on an existing blob: 409 `BlobAlreadyExists`;
- `If-Match` with a stale ETag, on upload or delete: 412 `ConditionNotMet`; on a missing blob, also 412;
- plain download or delete of a missing blob: 404 `BlobNotFound`; HEAD of one: 404 with no code;
- `deleteIfExists` on a stale ETag throws 412; on a missing blob it returns `succeeded: false`;
- a listing spells the ETag without quotes, while headers quote it: the adapter never passes a
  listed ETag to a condition;
- metadata keys come back lower-case; a non-ASCII metadata value is refused by the client
  (`ERR_INVALID_CHAR`) before any request;
- with no container, every call answers 404 `ContainerNotFound` (HEAD: in `details.errorCode`
  only). Measured by hand on the same Azurite; the suite's missing-container test passes on Azurite.

## Not covered

- Real Azure Blob storage: Azurite is the vendor's emulator, not the service. gh#310 step 7 is the
  adapter's first run on Azure.
- Whether `X-Draw-Admin` and the other headers pass the SWA proxy.
- Cold start under a burst of joins.
- The billing alert (gh#310 deploy step 5): no threshold is set here.
- Page-side escaping and the Thai message for each refusal reason (the page half).
- Platform logs and client IPs (gh#310).

