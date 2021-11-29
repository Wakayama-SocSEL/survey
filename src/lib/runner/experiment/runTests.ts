import fs from "fs";
import path from "path";
import semver from "semver";

import {
  outputDir,
  parallelPromiseAll,
  readJson,
  run,
  safeWriteFileSync,
} from "../../utils";
import { getPkgVersions } from "./getPkgVersions";
import { ExperimentInput, TestStatus, TestResult } from "./type";

function getCurrentVersion(range: string) {
  try {
    return semver.minVersion(range)?.version || null;
  } catch (e) {
    return null;
  }
}

async function getTestableVersions(input: ExperimentInput) {
  const versions = await getPkgVersions(input.L__npm_pkg);
  const currentVersion = getCurrentVersion(input.L__commit_version);
  if (currentVersion == null) {
    return [];
  }
  const itemIndex = versions.map((v) => v.version).indexOf(currentVersion);
  if (itemIndex == -1) {
    return [];
  }
  return versions.slice(itemIndex);
}

function dockerRun(command: string): Promise<string> {
  return run(`docker run --rm --cpus 1 kazuki-m/runner-experiment ${command}`);
}

async function runTest(
  repoName: string,
  hash: string,
  libName: string
): Promise<TestStatus> {
  try {
    const stdout = await dockerRun(
      `timeout 150s ./runTest.sh ${repoName} ${hash} ${libName}`
    );
    const state: TestStatus = { state: "success", log: stdout };
    return state;
  } catch (err) {
    const state: TestStatus = { state: "failure", log: `${err}` };
    return state;
  }
}

export async function runTests(
  L__nameWithOwner: string,
  inputs: ExperimentInput[],
  bar: ProgressBar,
  concurrency: number
): Promise<TestResult[][]> {
  bar.interrupt(`${L__nameWithOwner}`);
  const filepath = path.join(
    outputDir,
    ".cache-experiment",
    L__nameWithOwner,
    "testResults.json"
  );
  if (fs.existsSync(filepath)) {
    return readJson<TestResult[][]>(filepath);
  }
  const tasks = inputs.map((input) => {
    const task = async () => {
      const versions = await getTestableVersions(input);
      const results: TestResult[] = [];
      for (const { version, hash } of versions) {
        const libName = `${input.L__npm_pkg}@${version}`;

        // 出力情報は後から確認するだけなので、別で保存
        // test_result.jsonのファイルサイズ削減のため
        const { state, log } = await runTest(
          input.S__nameWithOwner,
          input.S__commit_id,
          libName
        );
        results.push({
          input: { ...input, L__version: version, L__hash: hash },
          status: { state },
        });
        bar.interrupt(`  ${input.S__nameWithOwner} -> ${libName} ... ${state}`);

        // 出力情報の保存
        const logpath = path.join(
          outputDir,
          ".cache-experiment",
          L__nameWithOwner,
          version,
          `${input.S__nameWithOwner.replace("/", "$")}.${state}.log`
        );
        safeWriteFileSync(logpath, log);

        if (state == "failure") {
          break;
        }
      }
      return results;
    };
    return async () => {
      const result = await task();
      bar.tick({
        label: `${input.L__nameWithOwner} & ${input.S__npm_pkg}`,
      });
      return result;
    };
  });
  const testResults = await parallelPromiseAll<TestResult[]>(
    tasks,
    concurrency
  );
  safeWriteFileSync(filepath, JSON.stringify(testResults, null, 2));
  return testResults;
}
