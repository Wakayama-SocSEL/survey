import fs from "fs";
import path from "path";
import childProcess from "child_process";

import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";
import json2csv, { Parser, transforms } from "json2csv";
import ProgressBar, { ProgressBarOptions } from "progress";

export async function run(
  command: string,
  options: childProcess.ExecOptions = {}
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    childProcess.exec(`bash -c "${command}" 2>&1`, options, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout.toString());
    });
  });
}

export function sleep(seconds: number) {
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      resolve();
    }, seconds * 1000);
  });
}

// https://qiita.com/rithmety/items/9bc7111c14033fe491f2
export async function parallelPromiseAll<T>(
  tasks: ((index?: number) => Promise<T>)[],
  concurrency: number
): Promise<T[]> {
  const results: T[] = [];
  let cursor = 0;
  const processes = Array.from({ length: concurrency }).map(async () => {
    while (true) {
      const index = cursor++;
      if (index >= tasks.length) return;
      results[index] = await tasks[index](index);
    }
  });
  await Promise.all(processes);
  return results;
}

export function safeWriteFileSync(filepath: string, data: string) {
  const dir = path.dirname(filepath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filepath, data);
}

export function readJson<T>(filepath: string): T {
  const content = fs.readFileSync(filepath, "utf-8");
  return JSON.parse(content);
}

export const outputDir = path.join(process.cwd(), "output");

export function createProgressBar(label: string, options: ProgressBarOptions) {
  // docker-compose run -d ... で実行すると`process.stderr.clearLine`などが未定義でエラーになる
  // 代わりに`console.log`するだけの`stream`を渡す
  const pseduStream = {
    isTTY: true,
    columns: 40,
    cursorTo: () => {},
    write: (data: string) => console.log(data),
    clearLine: () => console.log(""),
  };
  const bar = new ProgressBar(
    `${label} [:bar] :label :current/:total(:percent) :etas`,
    {
      width: 20,
      stream: process.stderr.isTTY ? process.stderr : (pseduStream as any),
      ...options,
    }
  );
  bar.tick(0, { label: "starting..." });
  return bar;
}

export function convertJsonToCSV(
  json: any,
  options: json2csv.Options<unknown> = {}
) {
  const parser = new Parser({
    quote: "",
    transforms: [transforms.flatten({ separator: "_" })],
    ...options,
  });
  return parser.parse(json);
}

export function useArgv() {
  const argv = yargs(hideBin(process.argv)).argv;
  return {
    c: "c" in argv ? (argv.c as number) : null,
    p: "p" in argv ? (argv.p as number) : 1,
  };
}
