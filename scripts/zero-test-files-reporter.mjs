// node:test custom reporter (gh#293): red when a test file that node RAN registered zero tests.
// node --test counts an emptied *.test.mjs as one passing test (it credits the file itself), so
// the pass-count grep in CI cannot see a file whose tests were deleted or never registered.
//
// Ran-set: the file-level test:enqueue entry node emits once per file. Node's runTestFile builds a
// FileTest named with the path from createTestFileList, and the FileTest constructor gives it the
// location line 1, column 1 in resolve(name). So file-level identity is the conjunction: nesting 0,
// line 1, column 1, and path.resolve(data.name) === data.file. Position alone is not enough: imports
// hoist, so an ordinary test in an imported helper can sit at line 1, column 1 too, but its name is
// the test title, not the helper's path. Keyed on data.file.
// Accepted residual: a top-level test at line 1, column 1 inside an imported helper whose name
// equals its own cwd-relative path still reds. That is a false red, never a false green.
// Credit is a count, never the child-reported label. test:summary.data.file is the child process's
// own argv[1], and a test can reassign it, so a summary can be filed under a path no ran entry
// carries. Node's runTestFile spawns one isolated child per file and each child emits at most one
// test:summary, so equality of counts is a partition (one summary per child process), not a numeric
// floor: credited summaries (counts.tests >= 1) equal to ran files proves every spawned file ran at
// least one test. Any summary with counts.tests 0 also reds. NOT test:pass.data.file and NOT
// test:stdout/stderr paths (relative, while the other events are absolute).
// Accepted residual: under argv forgery the NAMES listed can be wrong or over-inclusive, because
// they are the ran files not among the credited summary labels; the verdict is not affected.
//
// Decisions: a describe-only file is in the class (red). A skip-only or todo-only file stays
// green (node counts those as tests). "At least one test per file" is a partition
// predicate (credited equals ran), not a numeric floor.
//
// Sets process.exitCode to 1 on a hit and never assigns 0, so it cannot mask another failure.

import { resolve } from 'node:path';

export default async function* zeroTestFilesReporter(source) {
  const cwd = process.cwd() + '/';
  const ran = new Set();
  let credited = 0;
  let zero = 0;
  const creditedFiles = new Set();
  for await (const event of source) {
    const data = event.data;
    if (!data || !data.file) continue;
    if (event.type === 'test:enqueue' && data.nesting === 0 && data.line === 1 && data.column === 1 && typeof data.name === 'string' && resolve(data.name) === data.file) {
      ran.add(data.file);
    } else if (event.type === 'test:summary' && data.counts) {
      if (data.counts.tests >= 1) {
        credited++;
        creditedFiles.add(data.file);
      } else if (data.counts.tests === 0) {
        zero++;
      }
    }
  }
  if (credited !== ran.size || zero > 0) {
    process.exitCode = 1;
    const names = [...ran].filter((file) => !creditedFiles.has(file)).map((file) => file.replace(cwd, ''));
    yield `ZERO-TEST FILES: ran=${ran.size} credited=${credited} zero-summaries=${zero}: ${names.join(', ')} ran no tests (empty, describe-only, or failed to load)\n`;
  } else {
    yield `zero-test check: ${ran.size} files, each ran at least one test\n`;
  }
}
